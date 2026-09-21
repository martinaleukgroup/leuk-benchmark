# 01 · Motor de matching

> Estado real al 2026-07-16. El código está copiado **literal**, sin limpiar.
> Archivos fuente: `pipeline/matching.py` (señal técnica) y `pipeline/consolidate.py`
> (señales de forma/imagen + combinación + clasificación final).

---

## Resumen en palabras simples

El problema: dado un producto Leuk, encontrar su equivalente en el catálogo de cada
competidor (Vonderk, Artelum, World Leds Go). No hay identificadores compartidos entre
marcas, así que la equivalencia se **infiere** desde tres fuentes de evidencia independientes.

### Las 3 señales

| Señal | Qué compara | Cómo se obtiene | Peso |
|---|---|---|---|
| **Técnica** | Specs de ficha (lúmenes, potencia, eficiencia, IP, montaje…) | `matching.py` sobre los Excel de fichas | **0.45** |
| **Etiquetación** | Forma/estética con vocabulario controlado (`tipo_forma`, `tipo_montaje`…) | Claude visión etiqueta cada foto → JSON | **0.40** |
| **Visual** | Huella visual foto-contra-foto | Embeddings OpenCLIP ViT-B-32, coseno | **0.15** |

La idea de fondo es **matching por acuerdo**: una equivalencia sólo se considera confiable
si **≥2 señales coinciden**. Una sola señal (típicamente la visual, que es la más ruidosa)
degrada a `Posible` / confianza baja, no a `Equivalente`.

### Las 4 etapas de la señal técnica (`matching.py`)

1. **Gating (binario).** Compara *bucket de IP* (`ip20` vs `resto`) y *tipo de fijación*.
   Si no coinciden → `No comparable` y `score = 0`, sin evaluar nada más.
   ⚠️ Si a cualquiera de los dos productos le **falta** el dato, el gating **falla**
   (`ip_ok = False`) — no es "no verificable y sigo", es rechazo. Esto explica por qué
   `tecnico` da `No comparable` en la enorme mayoría de los pares (ver "Efectos observados").
2. **Scoring ponderado.** Cada atributo aporta una similitud de `0 / 0.5 / 1.0` ponderada
   por su peso. Un atributo ausente en un producto se **excluye** del numerador y del
   denominador (`missing_means_mismatch = False`, default conservador).
3. **Guardrail de núcleo.** Los 3 atributos `core` (Lúmenes, Eficiencia luminosa, Potencia)
   deben estar **evaluados y ≥0.5** para poder ser `Equivalente`. Si el score es alto pero
   el núcleo está incompleto, se **capa a `Comparable parcial`**.
4. **Clasificación.** `score ≥ 0.85` + guardrail → `Equivalente`; `≥ 0.65` → `Comparable parcial`;
   si no → `No comparable`.

### Cómo se combinan las 3 señales (`consolidate.py::veredicto`)

```
score = 0.45·técnica + 0.40·etiquetación + 0.15·visual     (niveles: Equiv=1.0, Parcial=0.5, No comp=0.0)

n = cantidad de señales POSITIVAS (Equivalente o Comparable parcial)

n ≥ 2  → confianza "alta"  → Equivalente si (2+ señales dicen Equivalente) o (1 dice Equivalente y score ≥ 0.7)
                              si no → Comparable parcial
n = 1  → confianza "baja"  → Posible
n = 0  → confianza "nula"  → No comparable
```

**Fix reciente (2026-07-15), importante para entender el estado actual:** antes el score se
normalizaba dividiendo sólo por el peso de las señales *presentes* (`acc / w`). Eso
**premiaba la falta de datos**: un candidato sin ficha se salteaba el 45% técnico y su score
quedaba inflado (0.864) por encima de uno con ficha que no coincidía (0.55). Resultado: una
*fuente de alimentación* le ganaba a la luminaria lineal correcta. Ahora se normaliza siempre
sobre el peso total (los pesos suman 1.0) y **la señal ausente aporta 0**.

### Desempate (`_desempate_ficha`)

El score combinado toma pocos valores discretos, así que **se empatan muchos candidatos**
(caso real: DYNA 60 tenía 11 candidatos en 0.55) y el ganador salía por orden del diccionario
— es decir, al azar. El desempate usa la ficha: gana el que **más atributos coincide**
(ignorando el color); sin ficha va al final.

### El color NO puntúa (decisión de negocio)

La nomenclatura Leuk codifica color en el nombre: **NG**=negro, **BL**=blanco, **MD**=madera
(y combinaciones como `BLNG`). `DYNA 60 NG` y `DYNA 60 BL` son **el mismo producto**. Por eso
el color se sacó de las tres señales:

- `matching.py`: `color_artefacto` tiene **peso 0** (informativo).
- `consolidate.py`: `_ETQ_PESOS` ya no incluye `color`.
- Las variantes de color **comparten el vector visual promediado** y la etiqueta de forma de
  la variante con mayor `confianza` (`unificar_vecs_por_color`, `unificar_tags_por_color`),
  porque el embedding de imagen es muy sensible al color.

Esto sirve además como **test de consistencia gratis**: si dos variantes de color dan matches
distintos, al menos una está mal. Medición actual: **97% de consistencia** (era 44%).

---

## Parámetros hardcodeados (valores actuales)

### `matching.py`

| Parámetro | Valor | Dónde | Qué hace |
|---|---|---|---|
| `EQ` | `0.10` | módulo | Banda "equivalente": ±10% del ancla → sim 1.0 |
| `PA` | `0.25` | módulo | Banda "parcial": ±25% → sim 0.5; más → 0.0 |
| `equiv_threshold` | `0.85` | `MatchConfig` | Score mínimo para `Equivalente` |
| `partial_threshold` | `0.65` | `MatchConfig` | Score mínimo para `Comparable parcial` |
| `missing_means_mismatch` | `False` | `MatchConfig` | Si un atributo está en un solo producto: excluir (no penalizar) |
| Bucket IP | `ip20` vs `resto` | `_ip_bucket()` | Único corte de IP. IP44/65/67 caen todos en `resto` |
| CCT equiv / parcial | `300` / `500` K | `AttrSpec("temperatura_color_k")` | Bandas en Kelvin, no en fracción |

**Pesos por atributo** (`ATTRIBUTES`, suman 96 sin contar los de peso 0):

| Atributo | Peso | Tipo | Núcleo |
|---|---|---|---|
| Lúmenes del sistema/fuente | 10 | `num_sym` | ✅ |
| Eficiencia luminosa (lm/W) | 10 | `num_asc` | ✅ |
| Potencia del sistema (W) | 9 | `num_sym` | ✅ |
| CRI | 9 | `num_asc` | |
| Control (ON/OFF, DIM, DALI) | 8 | `cat` | |
| UGR | 8 | `num_sym` | |
| Garantía | 8 | `num_asc` | |
| Ángulo de apertura del haz | 8 | `num_sym` | |
| Medidas (dim. dominante) | 7 | `num_sym` | |
| Fuente de luz | 7 | `cat` | |
| Temperatura de color (K) | 7 | `cct` | |
| Movimiento | 6 | `cat` | |
| Tensión (V) | 5 | `num_sym` | |
| **Color del artefacto** | **0** | `cat` | *(informativo, no puntúa)* |

### `consolidate.py`

| Parámetro | Valor | Qué hace |
|---|---|---|
| Pesos de señal | `{tecnico: 0.45, etiquetacion: 0.40, visual: 0.15}` | Combinación final |
| `_NIV_VAL` | `{Equivalente: 1.0, Comparable parcial: 0.5, No comparable: 0.0}` | Nivel → número |
| `_ETQ_PESOS` | `{tipo_forma: 4, tipo_montaje: 3, proporcion: 2, estilo: 1}` | Peso de la señal de forma |
| Umbral etiquetación | `score ≥ 0.8 AND forma_ok` → Equivalente; `forma_ok OR score ≥ 0.5` → Parcial | `match_etiquetacion()` |
| Umbrales visual | `sim ≥ 0.80` → Equivalente; `≥ 0.70` → Parcial; si no → No comparable | `match_visual()` (coseno) |
| Umbral "Equivalente" combinado | `2+ señales Equivalente` **o** `1 Equivalente y score ≥ 0.7` | `veredicto()` |
| `_TEC_IGNORAR` | `{"Color del artefacto"}` | El color no desempata |
| Cortes de listas | `propuestas[:20]`, `posibles[:15]`, `similares` top 8 | Truncado del output |
| `TC_BLUE` | `1435.0` (fallback; se refresca de la DB) | ARS→USD |
| `LEUK_DESC` | `0.0` (de `descuentos_competidores`) | Descuento Leuk |

### Umbrales duplicados en el frontend (`app/app.js`)

⚠️ Estos viven **sólo en el front**, desacoplados del pipeline:

| Parámetro | Valor | Qué hace |
|---|---|---|
| `PRICE_HI` / `PRICE_LO` | `85` / `-150` | Diferencia % que dispara el ⚠ "puede ser de otra gama" |
| Corte "precio similar" | `±3%` | `_pos()` en consolidate.py |
| `EQ_N` | `{Equivalente: 3, Comparable parcial: 2, Posible: 1}` | Barras de señal en la UI |
| Umbral argumentos de venta | `diff ≥ 10` / `≤ -10` | Qué entra en "Argumentos de venta" |

---

## Efectos observados (medidos sobre los datos reales, no teoría)

Esto es lo que un auditor debería mirar primero:

1. **El gating técnico es muy restrictivo y casi nunca pasa.** `tecnico: "No comparable"`
   convive con veredicto `Equivalente` en la enorme mayoría de los casos, porque el veredicto
   se sostiene con etiquetación + visual (0.40 + 0.15 = 0.55, justo por encima del umbral de
   `Equivalente` combinado cuando una de ellas dice Equivalente). **Se probó exigir señal
   técnica positiva para `Equivalente` y mata 821 de 822 matches** — no es viable sin antes
   arreglar el gating.

2. **`n_senales` NO ordena el nivel.** 821 de 822 `Equivalente` tienen `n_senales=2`, y hay 18
   `Comparable parcial` con `n_senales=3`. Son dos datos distintos: el veredicto pondera *cuál*
   señal coincide y con qué score, no cuántas.

3. **El cuello de botella no es el matching, es el precio.** Embudo real sobre 1016 pares:
   ```
   1016  pares totales (mejor por marca)
    315  con veredicto Equivalente
    104  + ambos con precio      ← se cae el 67%
     33  + diferencia creíble (≤60%)
   ```

4. **Bandas fijas para magnitudes de escalas distintas.** `EQ=0.10 / PA=0.25` se aplican igual
   a lúmenes, potencia, UGR, ángulo y medidas. Un ±10% en UGR (19 vs 21) no significa lo mismo
   que un ±10% en lúmenes.

5. **`parse_number` promedia rangos**: `'220-240'` → `230`, y `'2700/3300/4000'` (CCT múltiple)
   → promedio. Puede distorsionar productos multi-CCT.

6. **Los `groups` de los categóricos son placeholders** — está anotado en el propio código
   (`NOTA: los groups de los categóricos son PLACEHOLDERS`). No se curaron con el vocabulario
   real del catálogo.

7. **Pendiente conocido:** `DYNA 240` sigue matcheando `VK-BANDET-S` (una tira LED) y la mayoría
   de los DYNA matchean `WALLY FIT` en WLG cuando deberían ir a `linear`. La verdad de campo
   (dada por la usuaria) es: **DYNA debe competir contra `LINEA`/`VK-LINEAS` (Vonderk) y
   `linear` (WLG)**. Sirve como test de aceptación.

---
## Código completo — `pipeline/matching.py` (461 líneas, tal cual está)

```python
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

    # Numéricos
    potencia_w: Optional[float] = None
    lumenes: Optional[float] = None
    eficiencia_luminosa: Optional[float] = None      # lm/W
    eficiencia_energetica: Optional[float] = None
    tension_v: Optional[float] = None
    angulo_haz: Optional[float] = None
    cri: Optional[float] = None
    temperatura_color_k: Optional[float] = None
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
def pasa_gating(ancla: Producto, cand: Producto) -> tuple[bool, list[str]]:
    flags: list[str] = []

    bucket_a, bucket_c = _ip_bucket(ancla.ip), _ip_bucket(cand.ip)
    if bucket_a is None or bucket_c is None:
        flags.append("IP faltante en uno de los productos -> gating no verificable")
        ip_ok = False
    else:
        ip_ok = bucket_a == bucket_c

    fij_a, fij_c = _norm_cat(ancla.fijacion_tipo), _norm_cat(cand.fijacion_tipo)
    if fij_a is None or fij_c is None:
        flags.append("Fijación faltante en uno de los productos -> gating no verificable")
        fij_ok = False
    else:
        fij_ok = fij_a == fij_c

    return (ip_ok and fij_ok), flags


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
            sim = _sim_cct(fc, fa, spec.equiv, spec.partial)
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

    gating_ok, flags = pasa_gating(ancla, candidato)

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
    if not gating_ok:
        clasif = Clasificacion.NO_COMPARABLE
        score = 0.0
    elif score >= cfg.equiv_threshold and guardrail_ok:
        clasif = Clasificacion.EQUIVALENTE
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
```

---

## Código completo — señales combinadas (`pipeline/consolidate.py`)

### Combinación de las 3 señales + clasificación final (`consolidate.py`)

```python
_NIV_VAL = {"Equivalente": 1.0, "Comparable parcial": 0.5, "No comparable": 0.0}
_POSITIVAS = ("Equivalente", "Comparable parcial")

# El color es variante, no identidad → tampoco puede desempatar (ver nota en matching.py).
_TEC_IGNORAR = {"Color del artefacto"}

def _desempate_ficha(p):
    """Desempate entre candidatos con el MISMO score: gana el que más coincide en ficha.

    El score combinado tiene pocos valores posibles, así que se empatan muchos candidatos
    (ej. DYNA 60: 11 en 0.55) y el ganador terminaba saliendo por el orden del diccionario.
    La ficha ya tiene la respuesta: contra un DYNA (12.5W, 220V, IP20) la VK-LINEAS coincide
    en 3 atributos y la VK-BANDET (24V, IP67, tira) en 2. Sin ficha → al final: no hay
    evidencia técnica a favor.
    """
    t = (p.get("match") or {}).get("tecnico")
    if not t:
        return (0, 99)
    co = len([x for x in (t.get("coinciden") or []) if x not in _TEC_IGNORAR])
    di = len([x for x in (t.get("difieren") or []) if x not in _TEC_IGNORAR])
    return (-co, di)

def veredicto(tec, etq, vis):
    """Matching POR ACUERDO: una equivalencia sólo es confiable si coinciden ≥2 señales.
    Una sola señal (típicamente la visual, a veces sobre una foto poco representativa)
    da 'Posible' (baja confianza), NO 'Equivalente'. Devuelve (nivel, score, confianza, n_señales).

    El score se normaliza SIEMPRE sobre el peso total (los pesos suman 1.0): una señal
    ausente aporta 0, no se reparte su peso entre las demás. Antes se dividía sólo por el
    peso de las señales presentes y eso PREMIABA LA FALTA DE DATOS: un candidato sin ficha
    se salteaba el 45% técnico y quedaba arriba de uno con ficha que no coincidía
    (una fuente le ganaba a la línea correcta). La ausencia de evidencia no es evidencia.
    """
    pesos = {"tecnico": 0.45, "etiquetacion": 0.40, "visual": 0.15}
    señales = {"tecnico": tec, "etiquetacion": etq, "visual": vis}
    evaluadas = [s for s in señales.values() if s]
    if not evaluadas:
        return "Sin datos", 0.0, "nula", 0
    positivas = [s for s in evaluadas if s.get("nivel") in _POSITIVAS]
    equivalentes = [s for s in evaluadas if s.get("nivel") == "Equivalente"]
    acc = 0.0
    for nom, pe in pesos.items():
        s = señales[nom]
        if s and s.get("nivel") in _NIV_VAL:
            acc += pe * _NIV_VAL[s["nivel"]]
    score = round(acc, 3)
    n = len(positivas)
    if n >= 2:                       # ≥2 señales coinciden → confiable
        confianza = "alta"
        nivel = "Equivalente" if (len(equivalentes) >= 2 or (equivalentes and score >= 0.7)) else "Comparable parcial"
    elif n == 1:                     # una sola señal → mostrar como POSIBLE, revisar
        confianza = "baja"; nivel = "Posible"
    else:
        confianza = "nula"; nivel = "No comparable"
    return nivel, score, confianza, n


# ---------------------------------------------------------------------------
# Universo de competencia (familias)
# ---------------------------------------------------------------------------
def _reconciliar(fslug, claves):
    """Encuentra la clave de entidad que corresponde a una familia de ficha:
    igual, o una es prefijo (en borde de token) de la otra. Prefiere la más larga."""
    best = None
    for k in claves:
        if fslug == k or fslug.startswith(k + "-") or k.startswith(fslug + "-"):
            if best is None or len(k) > len(best): best = k
    return best


def _mean_vec(comp_vecs, eslug):
    """Vector visual de una entidad: promedio de los comp_vecs de esa familia
    (slug igual, o variante que arranca con el slug de la entidad)."""
    vs = [v for s, v in comp_vecs.items() if s == eslug or s.startswith(eslug + "-") or eslug.startswith(s + "-")]
    if not vs: return None
    m = np.mean(vs, axis=0); return (m / (np.linalg.norm(m) + 1e-9)).astype("float32")


# NG=negro · BL=blanco · MD=madera (y combinaciones tipo BLNG = cuerpo/interior).
_COLOR_TOK = re.compile(r"\b(?:NG|BL|MD){1,2}\b", re.I)

def nombre_base(nombre):
    """Nombre sin los sufijos de color: 'DYNA 60 NG' y 'DYNA 60 BL' -> 'DYNA 60'.
    El color es una VARIANTE del mismo producto, no un producto distinto."""
    b = _COLOR_TOK.sub(" ", str(nombre or "").upper())
    return re.sub(r"\s+", " ", b).strip()

def unificar_tags_por_color(leuk, leuk_tags):
    """Las variantes de color comparten la etiqueta de forma (la del tag más confiable).

    El etiquetador IA lee una foto por SKU, así que el mismo producto en negro y en blanco
    podía salir con `tipo_forma`/`proporcion` distintos y terminar matcheando contra
    competidores distintos. La forma no cambia con el color: se toma la lectura de mayor
    `confianza` del grupo y se comparte (cada variante conserva su propio `color`, que ya
    no puntúa).
    """
    grupos = {}
    for sku, r in leuk.items():
        if sku in leuk_tags:
            grupos.setdefault(nombre_base(r.get("nombre")), []).append(sku)
    out = dict(leuk_tags); n = 0
    for _, skus in grupos.items():
        if len(skus) < 2: continue
        mejor = max(skus, key=lambda s: float(leuk_tags[s].get("confianza") or 0))
        for s in skus:
            if s == mejor: continue
            t = dict(leuk_tags[mejor])
            t["color"] = leuk_tags[s].get("color")      # el color sigue siendo el propio
            out[s] = t; n += 1
    return out, n

def unificar_vecs_por_color(leuk, leuk_emb):
    """Las variantes de color del mismo producto comparten el vector visual (promedio).

    El embedding de imagen es MUY sensible al color: un DYNA blanco se parecía a cualquier
    cosa blanca y el negro a cualquier cosa negra, así que el mismo producto terminaba
    matcheando contra competidores distintos según el color. Promediando el vector entre
    NG/BL/MD, el color se cancela y queda la forma — que es lo que define la equivalencia.
    Es la misma idea que `_mean_vec` ya usa para las variantes de la competencia.
    """
    grupos = {}
    for sku, r in leuk.items():
        if sku in leuk_emb:
            grupos.setdefault(nombre_base(r.get("nombre")), []).append(sku)
    out = dict(leuk_emb); n_grp = n_sku = 0
    for _, skus in grupos.items():
        if len(skus) < 2: continue
        m = np.mean([leuk_emb[s] for s in skus], axis=0)
        m = (m / (np.linalg.norm(m) + 1e-9)).astype("float32")
        for s in skus: out[s] = m
        n_grp += 1; n_sku += len(skus)
    return out, n_grp, n_sku


def build_universe(fichas, etiquetas, indices, comp_vecs):
    """Universo de competencia keyeado por slug reconciliado. Cada entidad tiene las
    señales que existan: etiqueta (forma), vis_vec (imagen) y/o variantes de ficha
    (specs+precio). Une los 3 mundos de nombres (etiquetas/embeddings vs fichas)."""
    universo = {m: {} for m in MARCAS}
    for marca in MARCAS:
        ents = universo[marca]
        etq_keys, idx_keys = etiquetas.get(marca, {}), indices.get(marca, {})
        # 1) entidades desde etiquetas (comparten convención de slug con los embeddings)
        for eslug, etq in etq_keys.items():
            nombre = etq.get("producto") or eslug.upper()  # Vonderk no trae 'producto' → slug en mayúscula
            ents[eslug] = {"slug": eslug, "familia": nombre,
                           "etiqueta": etq, "vis_vec": None, "img": idx_keys.get(eslug), "variantes": []}
        # índice de entidades por slug de NOMBRE (para enganchar precio por nombre, no sólo por id/slug)
        name_index = {}
        for k, e in ents.items():
            ns = slug(e.get("familia") or "")
            if ns:
                name_index.setdefault(ns, k)
        # 2) fichas (specs + precio): la familia de ficha engancha a TODAS sus variantes-entidad
        # (las entidades son a nivel variante -vk-viker-s, vk-viker-duo- y la ficha a nivel familia -VK-VIKER-)
        df = fichas.get(marca)
        if df is not None and len(df):
            def _coincide(a, b):
                return a == b or a.startswith(b + "-") or b.startswith(a + "-")
            for _, row in df.iterrows():
                fam = limpiar(row.get("Familia")) or limpiar(row.get("Nombre/SKU"))
                if not fam: continue
                fslug = slug(fam)
                targets = {k for k in ents if _coincide(k, fslug)}                       # por slug/id
                targets |= {k for ns, k in name_index.items() if _coincide(ns, fslug)}   # por nombre
                if not targets:
                    targets = {fslug}
                    ents.setdefault(fslug, {"slug": fslug, "familia": fam, "etiqueta": etq_keys.get(fslug),
                                            "vis_vec": None, "img": idx_keys.get(fslug), "variantes": []})
                var = {
                    "producto": producto_desde_ficha(marca, row, None),
                    "precio_usd": precio_usd(marca, row),
                    "nombre": limpiar(row.get("Nombre/SKU")),
                    "ficha": {c: limpiar(row.get(c)) for c in FICHA_CAMPOS if limpiar(row.get(c))},
                }
                for k in targets:
                    ents[k]["variantes"].append(var)
        # 2b) fallback por PALABRA de nombre: entidades sin ficha que comparten un token
        # específico con una familia de ficha (ej. entidad "MICRO RUNNER 5" ↔ ficha con "runner")
        if df is not None and len(df):
            STOP = {"led", "luz", "para", "con", "sin", "micro", "mini", "mono", "aplicar",
                    "embutir", "suspender", "riel", "negro", "blanco", "acabados", "housing",
                    "kit", "accesorios", "fuente", "driver", "line", "linea", "tira"}
            fam_rows = {}
            for _, row in df.iterrows():
                fam = limpiar(row.get("Familia")) or ""
                for tok in re.findall(r"[a-z0-9]{4,}", slug(fam)):
                    if tok not in STOP:
                        fam_rows.setdefault(tok, []).append(row)
            for k, e in ents.items():
                if e["variantes"]:
                    continue
                toks = [t for t in re.findall(r"[a-z0-9]{4,}", slug(e.get("familia") or "")) if t not in STOP]
                for tok in sorted(toks, key=len, reverse=True):
                    if tok in fam_rows:
                        for row in fam_rows[tok][:8]:
                            e["variantes"].append({
                                "producto": producto_desde_ficha(marca, row, None),
                                "precio_usd": precio_usd(marca, row),
                                "nombre": limpiar(row.get("Nombre/SKU")),
                                "ficha": {c: limpiar(row.get(c)) for c in FICHA_CAMPOS if limpiar(row.get(c))},
                            })
                        break

        # 3) enganchar el vector visual (bidireccional, promediando variantes)
        for eslug, ent in ents.items():
            ent["vis_vec"] = _mean_vec(comp_vecs, eslug)
            if not ent["img"]:
                ki = _reconciliar(eslug, idx_keys.keys())
                ent["img"] = idx_keys.get(ki)
    tot = sum(len(v) for v in universo.values())
    con_vis = sum(1 for m in MARCAS for e in universo[m].values() if e["vis_vec"] is not None)
    con_etq = sum(1 for m in MARCAS for e in universo[m].values() if e["etiqueta"])
    con_spec = sum(1 for m in MARCAS for e in universo[m].values() if e["variantes"])
    log(f"Universo competencia: {tot} entidades (con imagen={con_vis} · con forma={con_etq} · con specs={con_spec}) "
        + " · ".join(f"{m}={len(universo[m])}" for m in MARCAS))
    return universo


ETQ_MOSTRAR = ("tipo_forma", "tipo_montaje", "color", "terminacion", "estilo", "proporcion")
```

### Señal ETIQUETACIÓN y VISUAL (`consolidate.py`)

```python
_ETQ_PESOS = {"tipo_forma": 4, "tipo_montaje": 3, "proporcion": 2, "estilo": 1}
def match_etiquetacion(lt, ce):
    if not lt or not ce: return None
    total = num = 0.0; coincide = []; difiere = []
    for campo, peso in _ETQ_PESOS.items():
        lv = (lt.get(campo) or "").strip().lower(); cv = (ce.get(campo) or "").strip().lower()
        if not lv or not cv or "no_determinable" in (lv, cv): continue
        total += peso
        if lv == cv: num += peso; coincide.append(campo)
        else: difiere.append(f"{campo}: {lv}≠{cv}")
    if total == 0: return None
    score = num / total
    forma_ok = lt.get("tipo_forma") and lt.get("tipo_forma", "").lower() == ce.get("tipo_forma", "").lower()
    nivel = "Equivalente" if (score >= 0.8 and forma_ok) else ("Comparable parcial" if (forma_ok or score >= 0.5) else "No comparable")
    return {"nivel": nivel, "score": round(score, 3), "coinciden": coincide, "difieren": difiere}


def match_visual(lv, cv):
    if lv is None or cv is None: return None
    sim = float(np.dot(lv, cv))
    nivel = "Equivalente" if sim >= 0.80 else ("Comparable parcial" if sim >= 0.70 else "No comparable")
    return {"nivel": nivel, "similitud": round(sim, 3)}
```