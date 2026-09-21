"""
matching.py — Motor de equivalencia de productos de iluminación (Leuk)

Pipeline:
    1. Gating (binario)       -> IP bucket + tipo de fijación. Si falla, "No comparable".
    2. Scoring ponderado      -> similitud por atributo (0 / 0.5 / 1.0) ponderada por peso.
    3. Guardrail de núcleo    -> Lúmenes, Ef. luminosa, Ef. energética y Potencia deben
                                 estar al menos en banda parcial para poder ser "Equivalente".
    4. Clasificación          -> Equivalente / Comparable parcial / No comparable.

Diseñado para integrarse en una app mayor: la lógica es pura (sin I/O, sin estado global),
y los pesos / bandas / umbrales se pasan vía `MatchConfig`.

Requiere pydantic v2.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# 1. Esquema canónico de producto
# ---------------------------------------------------------------------------
class Producto(BaseModel):
    """Producto normalizado en la base canónica. Los campos None se tratan como
    'no disponible / no aplica' y se excluyen del scoring (quedan flagueados)."""

    # Identidad (no se puntúa)
    nombre: str
    sku: Optional[str] = None
    marca: Optional[str] = None

    # Gating
    ip: Optional[str | int] = Field(default=None, description="Código IP, ej. 'IP20', 20, 'IP65'")
    fijacion_tipo: Optional[str] = Field(default=None, description="Tipo de montaje normalizado")
    # Categoría FUNCIONAL (gating duro): un driver no es comparable con una luminaria, una
    # tapa de riel no es comparable con un spot, etc. Ver `categoria_funcional`.
    categoria: Optional[str] = Field(default=None, description="luminaria/lineal/riel/perfil/driver/accesorio")

    # Numéricos
    potencia_w: Optional[float] = None
    lumenes: Optional[float] = None
    eficiencia_luminosa: Optional[float] = None      # lm/W
    eficiencia_energetica: Optional[float] = None
    tension_v: Optional[float] = None
    angulo_haz: Optional[float] = None
    cri: Optional[float] = None
    temperatura_color_k: Optional[float] = None
    # CCT seleccionable ('3000/4000/6000'): el producto emite en CUALQUIERA de esos valores.
    # Antes se promediaba (→4333K, un valor que el producto no tiene) y la señal se perdía.
    # Se compara contra el valor del set más cercano al candidato.
    temperatura_color_k_opts: Optional[list[float]] = None
    ugr: Optional[float] = None
    garantia_anios: Optional[float] = None

    # Medidas: la base canónica resuelve cuál es la dimensión dominante por formato
    medida_dominante: Optional[float] = None
    medida_dimension: Optional[str] = None           # informativo (diámetro / largo / etc.)

    # Categóricos
    fuente_luz: Optional[str] = None
    movimiento: Optional[str] = None
    color_artefacto: Optional[str] = None
    control: Optional[str] = None

    # Informativos (fuera del score)
    clase: Optional[str] = None
    peso_kg: Optional[float] = None
    ik: Optional[str] = None
    mcadams_step: Optional[float] = None

    @classmethod
    def from_raw(cls, **kwargs) -> "Producto":
        """Construye un Producto desde datos de ficha crudos (strings con unidades).

        Los campos numéricos pasan por `parse_number` ('563lm'->563, '>90'->90,
        '<2'->2, '0,96'->0.96). La medida (clave 'medida' o 'medida_dominante' como
        string, ej. 'Ø550 x 142mm') pasa por `parse_dimension`. El resto queda igual.

        Eficacia y eficiencia luminosa se tratan como sinónimos: si llega
        'eficiencia_energetica' y no hay 'eficiencia_luminosa', se usa ese valor."""
        data: dict = {}
        for key, val in kwargs.items():
            if key in {"medida", "medida_dominante"} and isinstance(val, str):
                dom, dim = parse_dimension(val)
                data["medida_dominante"] = dom
                if dim and "medida_dimension" not in kwargs:
                    data["medida_dimension"] = dim
            elif key == "potencia_w" and isinstance(val, str) and re.search(r"\d\s*x\s*\d", val.lower()):
                # '2 x 35W' / '1 x 50W Max' -> 35 / 50 (la potencia es la de después de la
                # 'x' de multiplicación; misma regla que el lado Leuk). OJO: la 'x' se busca
                # ENTRE dígitos — un split('x') ingenuo también corta la x de 'Max' y rompe.
                m = re.search(r"\d\s*x\s*(\d+(?:[.,]\d+)?)", val.lower())
                data[key] = parse_number(m.group(1))
            elif key == "temperatura_color_k" and isinstance(val, str) and "/" in val:
                # CCT seleccionable: guardar el SET completo; el valor puntual queda como
                # representante (el primero) para display/compatibilidad.
                opts = [parse_number(t) for t in val.split("/")]
                opts = [o for o in opts if o is not None]
                if opts:
                    data["temperatura_color_k"] = opts[0]
                    data["temperatura_color_k_opts"] = opts
            elif key in _NUMERIC_FIELDS:
                data[key] = parse_number(val)
            else:
                data[key] = val
        if data.get("eficiencia_luminosa") is None and data.get("eficiencia_energetica") is not None:
            data["eficiencia_luminosa"] = data["eficiencia_energetica"]
        return cls(**data)


# ---------------------------------------------------------------------------
# 2. Especificación de atributos (única fuente de verdad de pesos y bandas)
# ---------------------------------------------------------------------------
AttrKind = Literal["num_sym", "num_asc", "cct", "cat"]


@dataclass(frozen=True)
class AttrSpec:
    key: str                      # nombre del campo en Producto
    label: str
    kind: AttrKind
    weight: float
    equiv: float                  # num: fracción (0.10) | cct: kelvin (300) | cat: no usa
    partial: float                # num: fracción (0.25) | cct: kelvin (500) | cat: no usa
    core: bool = False            # forma parte del guardrail de núcleo
    groups: tuple[frozenset[str], ...] = ()   # grupos de "semejanza" para categóricos


# Bandas numéricas por defecto
EQ, PA = 0.10, 0.25

ATTRIBUTES: tuple[AttrSpec, ...] = (
    AttrSpec("lumenes",               "Lúmenes del sistema/fuente", "num_sym", 10, EQ, PA, core=True),
    AttrSpec("eficiencia_luminosa",   "Eficiencia luminosa (lm/W)", "num_asc", 10, EQ, PA, core=True),
    # NOTA: "eficiencia energética" se trató como sinónimo de "eficacia/eficiencia
    # luminosa" (decisión de negocio). Se quitó del scoring para no contarla dos
    # veces; el núcleo queda en 3: Lúmenes, Eficiencia luminosa, Potencia.
    AttrSpec("potencia_w",            "Potencia del sistema (W)",   "num_sym",  9, EQ, PA, core=True),
    AttrSpec("cri",                   "CRI",                        "num_asc",  9, EQ, PA),
    AttrSpec("control",               "Control (ON/OFF, DIM, DALI)","cat",      8, 0,  0,
             groups=(frozenset({"dim", "dali", "0-10v", "push", "1-10v", "regulable"}),)),
    AttrSpec("ugr",                   "UGR",                        "num_sym",  8, EQ, PA),
    AttrSpec("garantia_anios",        "Garantía",                   "num_asc",  8, EQ, PA),
    AttrSpec("angulo_haz",            "Ángulo de apertura del haz", "num_sym",  8, EQ, PA),
    AttrSpec("medida_dominante",      "Medidas (dim. dominante)",   "num_sym",  7, EQ, PA),
    AttrSpec("fuente_luz",            "Fuente de luz",              "cat",      7, 0,  0,
             groups=(frozenset({"led integrado", "led smd", "led cob"}),)),
    AttrSpec("temperatura_color_k",   "Temperatura de color (K)",   "cct",      7, 300, 500),
    AttrSpec("movimiento",            "Movimiento (si aplica)",     "cat",      6, 0,  0,
             groups=(frozenset({"sensor", "pir", "microondas", "radar"}),)),
    # Peso 0 = informativo, NO puntúa. El color es un atributo de VARIANTE, no de identidad:
    # el mismo producto se ofrece en negro (NG), blanco (BL) y madera (MD), y la competencia
    # también. Si el color puntuara, el mismo producto en dos colores daría matches distintos.
    AttrSpec("color_artefacto",       "Color del artefacto",        "cat",      0, 0,  0,
             groups=(frozenset({"negro", "grafito", "antracita"}),
                     frozenset({"blanco", "blanco mate"}))),
    AttrSpec("tension_v",             "Tensión (V)",                "num_sym",  5, EQ, PA),
)
# NOTA: los `groups` de los categóricos son PLACEHOLDERS. Hay que curarlos con el
# vocabulario real del catálogo (qué valores cuentan como "semejantes").


# ---------------------------------------------------------------------------
# 3. Config (lo que la app puede ajustar sin tocar la lógica)
# ---------------------------------------------------------------------------
@dataclass
class MatchConfig:
    attributes: tuple[AttrSpec, ...] = ATTRIBUTES
    equiv_threshold: float = 0.85
    partial_threshold: float = 0.65
    # Si un atributo está presente en un solo producto:
    #   False -> se excluye del score y se flaguea para revisión (default, conservador con datos)
    #   True  -> cuenta como mismatch (sim = 0)
    missing_means_mismatch: bool = False


# ---------------------------------------------------------------------------
# 4. Helpers de normalización y similitud
# ---------------------------------------------------------------------------

# Campos numéricos del modelo: el parser de fichas crudas los pasa por parse_number.
_NUMERIC_FIELDS = {
    "potencia_w", "lumenes", "eficiencia_luminosa", "eficiencia_energetica",
    "tension_v", "angulo_haz", "cri", "temperatura_color_k", "ugr",
    "garantia_anios", "peso_kg", "mcadams_step",
}


def _tiene_lumenes(value: object) -> bool:
    """True si el valor de lúmenes trae algún número (>0). Un componente no emisor
    (driver, tapa, riel) no declara lúmenes; una luminaria sí."""
    n = parse_number(value)
    return n is not None and n > 0


def _to_float(x: object) -> Optional[float]:
    """Cast defensivo a float. Devuelve None en vez de tirar excepción."""
    try:
        return float(x)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def parse_number(value: object) -> Optional[float]:
    """Convierte un valor crudo de ficha a float, tolerando unidades y comparadores.

        '563lm'->563 · '38 lm/W'->38 · '15W'->15 · '3000K'->3000 ·
        '>90'->90 · '<2'->2 · '0,96'->0.96 · '220-240'->230 (promedio de rango)
    Devuelve None si no encuentra ningún número."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().replace(",", ".")
    nums = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", s)]
    if not nums:
        return None
    return nums[0] if len(nums) == 1 else sum(nums) / len(nums)


def parse_dimension(value: object) -> tuple[Optional[float], Optional[str]]:
    """Extrae la dimensión dominante de una medida cruda.

        'Ø550 x 142mm'        -> (550.0, 'diametro')   (gana el diámetro)
        'A: 234 mm B: Ø500 mm'-> (500.0, 'diametro')   (el Ø, no el primer número)
        '1200 x 100 mm'       -> (1200.0, 'largo')      (gana el mayor)
    Devuelve (None, None) si no hay números."""
    if value is None:
        return (None, None)
    if isinstance(value, (int, float)):
        return (float(value), None)
    s = str(value)
    low = s.lower()
    # Diámetro: el número pegado al símbolo Ø o tras 'diam' (no necesariamente el 1ro).
    m = re.search(r"ø\s*(\d+(?:\.\d+)?)", low) or re.search(r"diam[^\d]*(\d+(?:\.\d+)?)", low)
    if m:
        return (float(m.group(1)), "diametro")
    nums = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", s)]
    if not nums:
        return (None, None)
    return (max(nums), "largo" if len(nums) > 1 else None)


def _norm_cat(v: Optional[str]) -> Optional[str]:
    """Normaliza categóricos: minúsculas, espacios colapsados y SIN acentos."""
    if v is None:
        return None
    s = unicodedata.normalize("NFD", str(v))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.strip().lower())


# ---------------------------------------------------------------------------
# Clasificación de CATEGORÍA FUNCIONAL
# ---------------------------------------------------------------------------
# Un producto de iluminación puede ser una LUMINARIA (emite luz) o un COMPONENTE del
# sistema que no emite (el riel físico, un perfil de aluminio, un driver/fuente, una
# tapa/unión/kit). El motor solo debe comparar peras con peras: un driver contra otro
# driver, un riel contra otro riel. Antes esto no existía y, como los componentes no
# traen IP/fijación/lúmenes, el gating quedaba "no verificable" y el match caía a puntuar
# 2-3 atributos residuales (Garantía, Color) → una TAPA "equivalía" a un spot.
#
# Las 4 categorías NO EMISORAS se detectan por keyword de nombre (alta precisión) y solo
# cuando el producto NO declara lúmenes. `lineal` y `luminaria` son ambas emisoras y se
# tratan como COMPATIBLES entre sí (la forma de la etiqueta ya discrimina lineal vs. no
# lineal; aislar 'lineal' daba baja precisión y tiraba matches buenos).

_CAT_ACCESORIO = re.compile(
    r"(tapa|uni[oó]n|conector|empalme|\bkit\b|difusor|suspensi[oó]n|adaptador|soporte|"
    r"abrazad|ciego|terminal|acople|acoplad|tap[oó]n|embellecedor)", re.I)
_CAT_DRIVER = re.compile(
    r"(driver|fuente|alimentad|alimentac|balast|transformad|power\s*supply)", re.I)
_CAT_DRIVER_COD = re.compile(r"(dali\d|\bps\d|\bdr\d{2})", re.I)  # códigos WLG: DALI6010, 8PS.., 8DR..
_CAT_RIEL = re.compile(r"(\briel\b|\btrack\b)", re.I)
_CAT_PERFIL = re.compile(r"(perfil|profile)", re.I)

# Categorías de COMPONENTE (no emisoras): solo comparan contra su misma categoría.
NON_EMIT: frozenset[str] = frozenset({"driver", "riel", "perfil", "accesorio"})


def categoria_funcional(
    nombre: Optional[str],
    *,
    familia: Optional[str] = None,
    subfamilia: Optional[str] = None,
    lumenes: object = None,
    tipo_forma: Optional[str] = None,
) -> str:
    """Clasifica un producto en su categoría funcional a partir de las señales disponibles.

    Orden de decisión (lo más específico primero). Las 4 categorías de componente solo se
    consideran si el producto NO declara lúmenes (si emite luz, es una luminaria aunque el
    nombre diga 'LINE POWER'). `subfamilia`/`familia` (curadas en Leuk) mandan sobre el
    nombre; en competencia solo hay nombre + forma de etiqueta.
    """
    n = nombre or ""
    fam = (familia or "").strip().lower()
    sub = (subfamilia or "").strip().lower()
    forma = (tipo_forma or "").strip().lower()
    emite = _tiene_lumenes(lumenes)

    if not emite:
        # 1) por NOMBRE (más específico que la subfamilia genérica de Leuk: un 'DRIVER' bajo
        #    subfamilia 'Accesorio' es un driver, no un accesorio). accesorio ANTES que
        #    riel/driver: 'KIT SUSPENSION RIEL' es un kit, 'VK-TRACK-ADAPTADOR' un adaptador.
        if _CAT_ACCESORIO.search(n):
            return "accesorio"
        if _CAT_DRIVER.search(n) or _CAT_DRIVER_COD.search(n):
            return "driver"
        if _CAT_RIEL.search(n):
            return "riel"
        if _CAT_PERFIL.search(n) or fam == "perfiles":
            return "perfil"
        # 2) fallback por subfamilia/familia CURADA de Leuk (cuando el nombre no dice nada)
        if sub in ("accesorio", "union", "unión"):
            return "accesorio"
        if sub == "riel":
            return "riel"
        if sub == "perfil":
            return "perfil"

    # Emisora: distinguir lineal (informativo; NO cambia el gating porque es compatible
    # con luminaria). Sirve para display / futura afinación.
    if forma == "lineal_barra" or fam == "lineales" or sub in ("lineal", "barral led") \
            or re.search(r"(lineal|l[ií]nea|bandet|barral|\btira\b|\bstrip\b)", n, re.I):
        return "lineal"
    return "luminaria"


def categorias_compatibles(a: Optional[str], b: Optional[str]) -> bool:
    """¿Dos categorías pueden compararse? Regla:

    - Si alguna es None (desconocida) → compatible (no bloquear por falta de dato).
    - Igual categoría → compatible.
    - Cualquier categoría NO EMISORA (driver/riel/perfil/accesorio) solo es compatible con
      su misma categoría → distinta ⇒ INCOMPATIBLE.
    - Dos emisoras distintas (luminaria vs lineal) → compatibles.
    """
    if a is None or b is None or a == b:
        return True
    if a in NON_EMIT or b in NON_EMIT:
        return False
    return True


def _ip_bucket(ip: Optional[str | int]) -> Optional[str]:
    """IP20 vs. resto. Devuelve 'ip20', 'resto' o None si no hay dato."""
    if ip is None:
        return None
    m = re.search(r"\d{1,2}", str(ip))
    if not m:
        return None
    code = int(m.group())
    return "ip20" if code == 20 else "resto"


def _sim_num_sym(cand: float, anchor: float, eq: float, pa: float) -> float:
    if abs(anchor) < 1e-9:
        return 1.0 if abs(cand) < 1e-9 else 0.0
    dif = abs(cand - anchor) / abs(anchor)
    return 1.0 if dif <= eq else 0.5 if dif <= pa else 0.0


def _sim_num_asc(cand: float, anchor: float, eq: float, pa: float) -> float:
    """'Más es mejor': superar al ancla no penaliza; la banda aplica solo hacia abajo."""
    if cand >= anchor:
        return 1.0
    if abs(anchor) < 1e-9:
        return 0.0
    dif = (anchor - cand) / abs(anchor)
    return 1.0 if dif <= eq else 0.5 if dif <= pa else 0.0


def _sim_cct(cand: float, anchor: float, eq_k: float, pa_k: float) -> float:
    dif = abs(cand - anchor)
    return 1.0 if dif <= eq_k else 0.5 if dif <= pa_k else 0.0


def _sim_cat(cand: str, anchor: str, groups: tuple[frozenset[str], ...]) -> float:
    c, a = _norm_cat(cand), _norm_cat(anchor)
    if c == a:
        return 1.0
    for g in groups:
        if c in g and a in g:
            return 0.5
    return 0.0


# ---------------------------------------------------------------------------
# 5. Resultado
# ---------------------------------------------------------------------------
class Clasificacion(str, Enum):
    EQUIVALENTE = "Equivalente"
    PARCIAL = "Comparable parcial"
    NO_COMPARABLE = "No comparable"


@dataclass
class AttrResult:
    key: str
    label: str
    weight: float
    sim: Optional[float]          # None = no evaluado
    status: str                   # "evaluado" | "no_evaluado" | "missing"
    anchor_value: object = None
    cand_value: object = None


@dataclass
class MatchResult:
    clasificacion: Clasificacion
    score: float                  # 0..1 (0 si no pasa gating)
    paso_gating: bool
    guardrail_ok: bool
    detalle: list[AttrResult] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)

    @property
    def es_equivalente(self) -> bool:
        return self.clasificacion is Clasificacion.EQUIVALENTE


# ---------------------------------------------------------------------------
# 6. Gating
# ---------------------------------------------------------------------------
def pasa_gating(ancla: Producto, cand: Producto) -> tuple[str, list[str]]:
    """Devuelve ("ok" | "contradiccion" | "no_verificable", flags).

    TRI-ESTADO (antes era binario): la CONTRADICCIÓN verificada (IP20 vs IP65, pared vs
    embutido, con ambos datos presentes) sigue rechazando. Pero la FALTA de dato ya no
    rechaza: degrada a "no_verificable" y el match se evalúa capado a "Comparable parcial".
    Con el binario, el 38%% de los pares se rechazaba por dato ausente (la competencia no
    trae IP/fijación en ~4 de cada 10 fichas) y la señal técnica sólo votaba en el 7%%:
    ausencia de evidencia no es evidencia en contra.
    """
    flags: list[str] = []
    contradiccion = False
    verificable = True

    # Categoría funcional: rechazo DURO si son categorías incompatibles (driver vs luminaria,
    # tapa vs spot…). No degrada a "no verificable": cuando ambas categorías se conocen y
    # chocan, no hay nada que comparar.
    if not categorias_compatibles(ancla.categoria, cand.categoria):
        contradiccion = True
        flags.append(f"Categoría incompatible: {ancla.categoria} vs {cand.categoria}")

    bucket_a, bucket_c = _ip_bucket(ancla.ip), _ip_bucket(cand.ip)
    if bucket_a is None or bucket_c is None:
        flags.append("IP faltante en uno de los productos -> gating no verificable")
        verificable = False
    elif bucket_a != bucket_c:
        contradiccion = True

    fij_a, fij_c = _norm_cat(ancla.fijacion_tipo), _norm_cat(cand.fijacion_tipo)
    if fij_a is None or fij_c is None:
        flags.append("Fijación faltante en uno de los productos -> gating no verificable")
        verificable = False
    elif fij_a != fij_c:
        contradiccion = True

    # La contradicción manda: si UN criterio verificado contradice, se rechaza aunque
    # el otro no sea verificable.
    estado = "contradiccion" if contradiccion else ("ok" if verificable else "no_verificable")
    return estado, flags


# ---------------------------------------------------------------------------
# 7. Scoring por atributo
# ---------------------------------------------------------------------------
def _score_attr(spec: AttrSpec, ancla: Producto, cand: Producto,
                cfg: MatchConfig) -> AttrResult:
    a = getattr(ancla, spec.key)
    c = getattr(cand, spec.key)

    # No aplica a ninguno -> excluido
    if a is None and c is None:
        return AttrResult(spec.key, spec.label, spec.weight, None, "no_evaluado", a, c)

    # Presente en uno solo
    if a is None or c is None:
        if cfg.missing_means_mismatch:
            return AttrResult(spec.key, spec.label, spec.weight, 0.0, "missing", a, c)
        return AttrResult(spec.key, spec.label, spec.weight, None, "missing", a, c)

    if spec.kind in ("num_sym", "num_asc", "cct"):
        fa, fc = _to_float(a), _to_float(c)
        if fa is None or fc is None:
            # Llegó un valor no numérico a un campo numérico: no se puede comparar.
            return AttrResult(spec.key, spec.label, spec.weight, None, "missing", a, c)
        if spec.kind == "num_sym":
            sim = _sim_num_sym(fc, fa, spec.equiv, spec.partial)
        elif spec.kind == "num_asc":
            sim = _sim_num_asc(fc, fa, spec.equiv, spec.partial)
        else:
            # CCT: si alguno es seleccionable (set de valores), comparar contra el valor
            # del set más cercano — un 3000/4000/6000 SÍ cubre a un candidato 3000K.
            a_opts = getattr(ancla, "temperatura_color_k_opts", None) or [fa]
            c_opts = getattr(cand, "temperatura_color_k_opts", None) or [fc]
            d = min(abs(x - y) for x in a_opts for y in c_opts)
            sim = 1.0 if d <= spec.equiv else 0.5 if d <= spec.partial else 0.0
    elif spec.kind == "cat":
        sim = _sim_cat(str(c), str(a), spec.groups)
    else:  # pragma: no cover
        raise ValueError(f"kind desconocido: {spec.kind}")

    return AttrResult(spec.key, spec.label, spec.weight, sim, "evaluado", a, c)


# ---------------------------------------------------------------------------
# 8. API pública
# ---------------------------------------------------------------------------
def match(ancla: Producto, candidato: Producto,
          cfg: Optional[MatchConfig] = None) -> MatchResult:
    """Compara un candidato contra el producto ancla (Leuk) y clasifica la equivalencia."""
    cfg = cfg or MatchConfig()

    gating, flags = pasa_gating(ancla, candidato)
    gating_ok = gating == "ok"

    detalle = [_score_attr(spec, ancla, candidato, cfg) for spec in cfg.attributes]

    evaluados = [d for d in detalle if d.sim is not None]
    total_w = sum(d.weight for d in evaluados)
    score = (sum(d.weight * d.sim for d in evaluados) / total_w) if total_w else 0.0

    if total_w == 0:
        flags.append("Sin atributos evaluables -> score no representativo")

    # Guardrail de núcleo: cada atributo core debe estar evaluado y al menos en parcial (>=0.5)
    core_keys = {s.key for s in cfg.attributes if s.core}
    core_res = [d for d in detalle if d.key in core_keys]
    guardrail_ok = (
        len(core_res) == len(core_keys)
        and all(d.sim is not None and d.sim >= 0.5 for d in core_res)
    )
    core_no_eval = [d.label for d in core_res if d.sim is None]
    if core_no_eval:
        flags.append("Atributos de núcleo sin dato: " + ", ".join(core_no_eval))

    # Clasificación
    if gating == "contradiccion":
        clasif = Clasificacion.NO_COMPARABLE     # contradicción VERIFICADA: rechazo duro
        score = 0.0
    elif score >= cfg.equiv_threshold and guardrail_ok and gating == "ok":
        clasif = Clasificacion.EQUIVALENTE
    elif score >= cfg.equiv_threshold and guardrail_ok and gating == "no_verificable":
        clasif = Clasificacion.PARCIAL           # sin gate verificado no se certifica Equivalente
        flags.append("Gating no verificable -> capado a parcial")
    elif score >= cfg.equiv_threshold and not guardrail_ok:
        clasif = Clasificacion.PARCIAL          # capado por el guardrail
        flags.append("Score alto pero núcleo incompleto -> capado a parcial")
    elif score >= cfg.partial_threshold:
        clasif = Clasificacion.PARCIAL
    else:
        clasif = Clasificacion.NO_COMPARABLE

    return MatchResult(clasif, round(score, 4), gating_ok, guardrail_ok, detalle, flags)


def match_many(ancla: Producto, candidatos: list[Producto],
               cfg: Optional[MatchConfig] = None) -> list[tuple[Producto, MatchResult]]:
    """Compara el ancla contra varios candidatos y devuelve ordenado por score desc."""
    cfg = cfg or MatchConfig()
    res = [(c, match(ancla, c, cfg)) for c in candidatos]
    res.sort(key=lambda t: t[1].score, reverse=True)
    return res


# ---------------------------------------------------------------------------
# Demo
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    leuk = Producto(
        nombre="Downlight Leuk 20W", marca="Leuk", ip="IP20",
        fijacion_tipo="empotrado", potencia_w=20, lumenes=2000,
        eficiencia_luminosa=100, eficiencia_energetica=100, tension_v=220,
        angulo_haz=60, cri=90, temperatura_color_k=4000, ugr=19,
        garantia_anios=5, medida_dominante=170, medida_dimension="diametro",
        fuente_luz="LED integrado", control="dali", color_artefacto="blanco",
    )

    competidores = [
        Producto(  # debería dar Equivalente
            nombre="Comp A 21W", marca="MarcaA", ip="IP20", fijacion_tipo="Empotrado",
            potencia_w=21, lumenes=2100, eficiencia_luminosa=100, eficiencia_energetica=100,
            tension_v=220, angulo_haz=60, cri=90, temperatura_color_k=4100, ugr=19,
            garantia_anios=5, medida_dominante=172, fuente_luz="LED integrado", control="DALI",
            color_artefacto="blanco",
        ),
        Producto(  # falla gating (IP65)
            nombre="Comp B exterior", marca="MarcaB", ip="IP65", fijacion_tipo="empotrado",
            potencia_w=20, lumenes=2000, eficiencia_luminosa=100, eficiencia_energetica=100,
        ),
        Producto(  # score alto pero núcleo flojo (la mitad de lúmenes) -> capado a parcial
            nombre="Comp C 20W debil", marca="MarcaC", ip="IP20", fijacion_tipo="empotrado",
            potencia_w=20, lumenes=1000, eficiencia_luminosa=50, eficiencia_energetica=70,
            tension_v=220, angulo_haz=60, cri=90, temperatura_color_k=4000, ugr=19,
            garantia_anios=5, medida_dominante=170, fuente_luz="LED integrado", control="dali",
            color_artefacto="blanco",
        ),
    ]

    for prod, r in match_many(leuk, competidores):
        print(f"{prod.nombre:24} | {r.clasificacion.value:18} | score={r.score:.3f} "
              f"| gating={r.paso_gating} | nucleo={r.guardrail_ok}")
        for f in r.flags:
            print(f"      flag: {f}")
