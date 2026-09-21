"""Normalizadores compartidos: fijación/montaje, color, slug, limpieza de nulos.

El gating del motor (matching.py) hace match categórico EXACTO sobre el valor
normalizado de fijación, así que ambos lados (Leuk y competencia) tienen que
caer en el mismo token canónico. Acá se cura ese vocabulario."""
import re
import unicodedata

NULOS = {"", "s/d", "sd", "-", "–", "—", "n/a", "na", "nan", "none", "null", "no determinable"}


def limpiar(v):
    """Devuelve None para vacíos/placeholder; si no, el string stripeado."""
    if v is None:
        return None
    s = str(v).strip()
    if s.lower() in NULOS:
        return None
    return s


def _sin_acentos(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def slug(s: str) -> str:
    """Normaliza a slug: minúsculas, sin acentos, guiones. 'VK-TAIS' -> 'vk-tais'."""
    if s is None:
        return ""
    s = _sin_acentos(str(s)).lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


# --- Fijación / montaje: mapa a buckets canónicos -------------------------
# Claves: fragmentos normalizados (sin acentos, minúsculas). Se busca por
# inclusión, en orden, así que poné lo más específico primero.
_MONTAJE_RULES = [
    ("riel",        ["riel", "magnetic", "track"]),
    ("embutido",    ["embut", "empotr", "recess", "encastr", "portalampar"]),
    ("suspendido",  ["suspend", "colgant", "colgar", "pendant"]),
    ("piso",        ["piso", "suelo", "bolard", "estaca", "anclaje", "autoportante", "poste",
                     "baliza", "velador", "sobremesa", "apoyo", "mesa", "pie", "sobre_mesa"]),
    ("perfil",      ["perfil", "adhesiv", "tape", "tira", "zocalo"]),
    ("pared",       ["pared", "aplique_pared", "wall", "bañador", "banador"]),
    ("proyector",   ["proyector", "proyeccion", "spot"]),
    ("techo",       ["de techo", "aplique de techo", "plafon", "adosad", "aplicar", "aplique",
                     "superficie", "cielo", "cabezal"]),
]


def montaje_canonico(v):
    """Mapea cualquier variante de fijación a un bucket canónico único.
    Si trae varias (ej. 'Aplicar, Suspender') toma la primera que matchee una regla."""
    s = limpiar(v)
    if s is None:
        return None
    n = _sin_acentos(s).lower()
    # separar valores múltiples y evaluar en orden de prioridad de reglas
    partes = re.split(r"[,/|]| y ", n)
    for canon, keys in _MONTAJE_RULES:
        for parte in partes:
            for k in keys:
                if k in parte:
                    return canon
    return None


# --- Color del artefacto: normalización suave -----------------------------
_COLOR_MAP = {
    "negro": "negro", "ngo": "negro", "bl negro": "negro", "grafito": "negro",
    "antracita": "negro", "black": "negro",
    "blanco": "blanco", "bco": "blanco", "white": "blanco",
    "gris": "gris", "plata": "gris", "aluminio": "gris", "silver": "gris",
    "dorado": "dorado", "oro": "dorado", "gold": "dorado", "cobre": "cobre",
}


def color_canonico(v):
    s = limpiar(v)
    if s is None:
        return None
    n = _sin_acentos(s).lower()
    for k, canon in _COLOR_MAP.items():
        if k in n:
            return canon
    return n.split("/")[0].split(",")[0].strip() or None
