#!/usr/bin/env python3
"""
fichas_build.py — Genera `app/fichas.js` para la página de FICHAS TÉCNICAS.

Fuente canónica: BASE ÚNICA (Maestro_Marketing.xlsx). Regla de negocio: las columnas
cuyo ENCABEZADO está en AZUL (tema 4 del Excel) son las filas de la tabla técnica;
las vacías se ocultan por producto. Los campos de identificación y los assets van
siempre. Se excluye "Tolerancia Cromática".

La FOTO se reutiliza de la URL que el benchmark ya resuelve (benchmark_data.json).
Los demás assets (dibujo, curvas, LDT, CAD) se guardan por nombre de archivo; su
resolución a URL de Drive se agrega en un paso posterior (manifiestos).

Re-ejecutable. No modifica ningún archivo del pipeline existente.
"""
import json
import re

import openpyxl

import paths as P

# Fuente: Google Sheet maestro de BASE ÚNICA (siempre al día). Se baja por link (export xlsx).
SHEET_ID = "148rh_v3Bcb8cPHYJSMRiAUi5xTNyPyZi6jrKUDN-s0E"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"
CACHE = P.ROOT / "pipeline" / "base_unica.xlsx"
LOCAL_FALLBACK = P.WORK.parent / "Generador de fichas técnicas" / "Maestro_Marketing.xlsx"
HOJA = "BASE ÚNICA"
OUT = P.ROOT / "app" / "fichas-data.js"


def _buscar_hoja(wb):
    """Encuentra la pestaña de BASE ÚNICA sin depender de mayúsculas ni tildes.

    En agosto de 2026 alguien la renombró de "BASE ÚNICA" a "Base única" y el
    match exacto dejó de funcionar: el script caía al xlsx local (de julio) y
    seguía andando como si nada, generando fichas con datos viejos. La
    comparación floja evita que un renombre cosmético rompa el pipeline.
    """
    def norm(t):
        import unicodedata
        t = unicodedata.normalize("NFD", str(t)).encode("ascii", "ignore").decode()
        return " ".join(t.upper().split())
    objetivo = norm(HOJA)
    for n in wb.sheetnames:
        if norm(n) == objetivo:
            return n
    return None


USO_FALLBACK = False       # True si no se pudo leer el Sheet y se usó el xlsx local


def get_workbook():
    """Devuelve (workbook, nombre_real_de_la_hoja).

    Si el Sheet no se puede bajar, avisa FUERTE y cae al xlsx local. Antes el
    aviso era una línea perdida entre otras veinte y nadie lo veía: el pipeline
    llevaba semanas generando desde una copia vieja sin que se notara.
    """
    import urllib.request
    try:
        urllib.request.urlretrieve(SHEET_URL, str(CACHE))
        wb = openpyxl.load_workbook(CACHE, data_only=True)
        hoja = _buscar_hoja(wb)
        if not hoja:
            raise RuntimeError(
                f"bajé el Sheet pero no tiene ninguna pestaña parecida a {HOJA!r}. "
                f"Tiene: {wb.sheetnames}")
        if hoja != HOJA:
            print(f"  (ojo) la pestaña se llama {hoja!r}, no {HOJA!r}. Sigo igual.")
        print(f"  {hoja}: leída del Google Sheet (export xlsx)")
        return wb, hoja
    except Exception as e:
        global USO_FALLBACK
        USO_FALLBACK = True
        print("")
        print("  " + "=" * 66)
        print("  ATENCIÓN: NO pude leer el Google Sheet. Uso el xlsx LOCAL, que")
        print("  puede estar viejo. Las fichas que salgan de acá NO reflejan la")
        print("  planilla de hoy.")
        print(f"  Motivo: {e}")
        print("  " + "=" * 66)
        print("")
        wb = openpyxl.load_workbook(LOCAL_FALLBACK, data_only=True)
        return wb, (_buscar_hoja(wb) or HOJA)

# --- Config de la ficha (espejo del molde de diseño) ---
FIXED_TOP = [("SKU", "Código de producto"), ("EAN", "EAN"), ("Descripción corta", "Descripción del producto")]
# Columnas técnicas, en el orden en que se muestran en la ficha. La etiqueta de cada fila
# es el NOMBRE DE LA COLUMNA de BASE ÚNICA tal cual: si en la planilla se renombra un
# encabezado, la ficha lo toma solo.
TECH_COLS = [
    "Material", "Difusor", "Color producto", "Fuente Lumínica",
    "Marca LED", "Marca Driver",
    "Dimensión producto", "Medidas Florón", "Largo Total",
    "Alimentación", "Frecuencia", "Potencia", "Factor de potencia",
    "Lúmenes LED", "Eficacia lumínica LED",
    "Flujo lumínico", "Eficacia lumínica", "Ángulo de apertura",
    "Índice de reproducción cromatica", "Índice de deslumbramiento unificado", "Temperatura color",
    "Control", "Fijación", "Garantía", "Índice de protección", "Clase de aislación",
    "Medida", "Temp. Operativa", "Vida útil",
    # "Dimensión calado" y "Profundidad calado" NO van como fila: se muestran juntas
    # abajo de la tabla, con el ícono de calado (ver calado_info()).
]
TECH = [(h, h) for h in TECH_COLS]
EXCLUDE = {"Tolerancia Cromática"}
# Columnas técnicas ("azules"). El export de Google Sheets NO conserva el color, así que
# se usan como config; si el archivo trae el color azul (theme 4), ese detecta y manda.
BLUE_COLS = {"Medida", "Fuente Lumínica", "Marca LED", "Marca Driver", "Control", "Alimentación", "Frecuencia",
             "Potencia", "Factor de potencia", "Lúmenes LED", "Eficacia lumínica LED", "Flujo lumínico",
             "Eficacia lumínica", "Temperatura color", "Índice de reproducción cromatica", "Ángulo de apertura",
             "Índice de deslumbramiento unificado", "Índice de protección", "Clase de aislación", "Fijación",
             "Dimensión producto", "Dimensión calado", "Profundidad calado", "Material", "Difusor",
             "Color producto", "Temp. Operativa", "Vida útil", "Garantía"}
# Códigos de color (de la hoja "Colores"); respaldo si esa hoja no está en la fuente.
DEFAULT_CODES = {"NG", "BL", "BLNG", "NGNG", "DR", "AZ", "VR", "BD", "MD", "GR", "MDBL", "MDNG", "BLOR", "NGOR", "CB", "PL", "CO"}
# Paleta oficial, tomada de la guía "Íconos y dibujos índice" (sección COLORES).
COLORS = {"negro": "#1d1d1b", "blanco": "#ffffff", "gris": "#565655", "natural": "#9a9999",
          "terracota": "#bb614b", "madera": "#ae7e49", "dorado": "#c18f13", "oro": "#c18f13",
          "azul": "#55a3be", "verde": "#799967", "bordó": "#7e0f0f", "bordo": "#7e0f0f",
          # no están en la guía: aproximaciones
          "plata": "#c4c4c4", "cobre": "#b87333", "bronce": "#9c6b30", "champagne": "#d8c9a3",
          "rojo": "#9c2b28"}

_NODATA = {"", "-", "--", "n/a", "#n/a", "n/d", "#n/d", "s/d", "sd", "no hay dato",
           "sin dato", "sin datos", "none", "null", "nan", "#ref!", "#value!", "#error!"}


def EMPTY(v):
    s = ("" if v is None else str(v)).strip().lower()
    if not s or "?" in s or s in _NODATA:             # cualquier "?" = sin dato
        return True
    first = s.split()[0]                              # "n/a mm", "s/d mm"…
    return first in _NODATA

# --- Resolución de assets a URL de Drive (manifiesto de ficha_assets_manifest.py) ---
def load_manifest():
    p = P.ROOT / "pipeline" / "ficha_assets_manifest.json"
    if p.exists():
        return json.loads(p.read_text())
    return {"by_name": {}, "dibujo_by_sku": {}, "curva_by_sku": {}}


def load_manuales_publicos():
    """Manuales de Instalación de la carpeta PÚBLICA de Drive (manuales_publicos.json).
    Los PDF se llaman 'SKU-SKU-...-manual.pdf' (a veces 'SKU-Familia-manual.pdf').
    Devuelve dict con:
      by_sku: SKU (4 dígitos del nombre) → id del PDF  (match principal)
      lista:  [{id, t}] con el título en minúsculas    (fallback por nombre de familia)"""
    p = P.ROOT / "pipeline" / "manuales_publicos.json"
    by_sku, lista = {}, []
    if not p.exists():
        return {"by_sku": by_sku, "lista": lista}
    for m in json.loads(p.read_text()).get("manuales", []):
        lista.append({"id": m["id"], "t": m.get("t", "").lower()})
        for sku in re.findall(r"\d{4}", m.get("t", "")):
            by_sku.setdefault(sku, m["id"])    # si un SKU aparece en 2 PDF, gana el primero
    return {"by_sku": by_sku, "lista": lista}

IMG = lambda fid: (f"https://lh3.googleusercontent.com/d/{fid}=w1200" if fid else "")
DL = lambda fid: (f"https://drive.google.com/uc?export=download&id={fid}" if fid else "")
VIEW = lambda fid: (f"https://drive.google.com/file/d/{fid}/view" if fid else "")  # abre el PDF en Drive


def is_blue(cell):
    c = cell.font.color
    return c is not None and c.type == "theme" and c.theme == 4


def fmt(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def _hex_one(part):
    """Hex de un color simple; gana la coincidencia más larga (p.ej. 'dorado' antes que 'oro')."""
    n = (part or "").lower()
    best = None
    for k, h in COLORS.items():
        if k in n and (best is None or len(k) > len(best[0])):
            best = (k, h)
    return best[1] if best else "#1a1a1a"


def swatch_hexes(name):
    """Lista de hex de un color. Los bicolores ('Blanco y Negro', 'Negro/Madera')
    devuelven 2 → el ícono se dibuja partido al medio, como en la guía de íconos."""
    n = (name or "").strip()
    if EMPTY(n):
        return []
    partes = [p for p in re.split(r"\s+y\s+|\s*/\s*|\s*\+\s*", n, flags=re.I) if p.strip()]
    hexes = []
    for p in partes[:2]:
        h = _hex_one(p)
        if h not in hexes:
            hexes.append(h)
    return hexes or ["#1a1a1a"]


def swatch_hex(name):
    hs = swatch_hexes(name)
    return hs[0] if hs else "#1a1a1a"


CODES = set()  # códigos de color (NG, BL, …) — de la hoja "Colores"


def load_color_codes(wb):
    CODES.update(DEFAULT_CODES)
    try:
        ws = wb["Colores"]
        for r in ws.iter_rows(min_row=2, values_only=True):
            if r and r[0]:
                CODES.add(str(r[0]).strip().upper())
    except Exception:
        pass


def load_comentarios(wb):
    """La columna 'Comentarios' vive en la hoja 'Maestro' (no en BASE ÚNICA).
    Devuelve {sku: comentario} para poder joinear por SKU."""
    out = {}
    try:
        ws = wb["Maestro"]
        hdr = [str(c.value).strip() if c.value else "" for c in ws[1]]
        sku_i = next((i for i, h in enumerate(hdr) if h.upper() == "SKU"), 0)
        com_i = next((i for i, h in enumerate(hdr) if h.lower() == "comentarios"), None)
        if com_i is None:
            return out
        for r in ws.iter_rows(min_row=2, values_only=True):
            s = fmt(r[sku_i])
            if not EMPTY(s) and r[com_i]:
                out[s] = str(r[com_i]).strip()
    except Exception:
        pass
    return out


def lente_info(coment):
    """Del comentario del maestro extrae la nota de lentes intercambiables, normalizada.
    Patrón: 'lente 36° ... 15° y 24°' (kit de lentes de CHILL/MEX). MEX suma la rosca.
    KRONE ('Lentes ovalados') no matchea y queda afuera."""
    c = fmt(coment)
    if not re.search(r"lente\s*36\s*°?.*?15\s*°?\s*y\s*24\s*°?", c, re.I | re.S):
        return None
    txt = "Incluye lente 36° + 2 lentes intercambiables: 15° y 24°."
    if re.search(r"rosca", c, re.I):
        txt += " Con Rosca hembra + entrerrosca para unión universal."
    return txt


def strip_color(nombre):
    toks = fmt(nombre).split()
    if CODES:
        toks = [t for t in toks if t.upper() not in CODES]
        return " ".join(toks).strip()
    return re.sub(r"\s+[A-ZÀ-Ú]{1,3}$", "", fmt(nombre)).strip()


def is_light(hexcol):
    try:
        h = hexcol.lstrip("#")
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        return (0.299 * r + 0.587 * g + 0.114 * b) > 150
    except Exception:
        return False


FINISHES = {"satinado", "satinada", "mate", "brillante"}   # solo terminación; no distinguen modelo


def color_short(name):
    """Nombre de color para las filas SKU/EAN. Saca solo la TERMINACIÓN (Satinado/Mate/
    Brillante) y conserva lo que sí distingue el modelo: 'Negro y Madera', 'Blanco y Negro'…
    (Antes tomaba solo la 1ª palabra y 'Negro y Madera' colapsaba a 'Negro' → confusión.)"""
    toks = [t for t in fmt(name).split() if t.lower() not in FINISHES]
    return " ".join(toks).strip() or fmt(name)


def fix_roman(text):
    """Arrastre del maestro: los números romanos I/II/III fueron cargados con 'l' minúscula
    (que con esta tipografía se lee como L). Convierte 'l','ll','lll' sueltas → I, II, III."""
    return re.sub(r"\bl{1,3}\b", lambda m: "I" * len(m.group()), fmt(text))


def tidy_square(text):
    """Cuadrado (perfil cuadrado, U+20DE) pegado a los números o con doble espacio →
    exactamente un espacio: '⃞86' / '⃞  170' → '⃞ 86' / '⃞ 170'."""
    return re.sub("⃞\\s*", "⃞ ", fmt(text)).strip()


def color_sort_key(name):
    n = fmt(name).lower()
    return 0 if "negro" in n else (2 if "blanco" in n else 1)


def calado_info(p):
    """Calado: 'Dimensión calado' x 'Profundidad calado' en una sola línea con ícono.
    El asterisco viene de la planilla y es el que dispara la nota al pie."""
    dim, prof = fmt(p.get("Dimensión calado")), fmt(p.get("Profundidad calado"))
    vac_d, vac_p = EMPTY(dim), EMPTY(prof)
    if vac_d and vac_p:
        return None
    # La nota aclara que la profundidad incluye la dicroica y el zócalo → aplica SÓLO a los
    # spots. El asterisco de la planilla está cargado a mano y falta en varios, así que se
    # deduce de la fuente lumínica (GU10/dicro/AR111). Los cardánicos (Karol/Mila) también
    # usan GU10/dicro pero NO llevan esta aclaración → se excluyen de la deducción.
    fuente = fmt(p.get("Fuente Lumínica"))
    es_cardanico = bool(re.search(r"card[áa]nico", fmt(p.get("Colección")), re.I))
    deduce = (not es_cardanico) and bool(re.search(r"gu\s?10|dicro|ar\s?111", fuente, re.I))
    nota = ("*" in dim or "*" in prof) or deduce

    def limpio(v):
        return re.sub(r"\s*mm\s*$", "", v.replace("*", ""), flags=re.I).strip()

    d = "" if vac_d else limpio(dim)
    pr = "" if vac_p else limpio(prof)
    txt = f"{d} x {pr} mm" if d and pr else f"{d or pr} mm"
    return {"txt": tidy_square(txt + ("*" if nota else "")), "nota": nota}


def badge(dim):
    m = re.search(r"Ø?\s?\d+[.,]?\d*", dim or "")
    return m.group(0).replace(" ", "") if m else ""


# Renombres puntuales de productos cuyo nombre nuevo todavía no está en el maestro.
NOMBRE_OVERRIDE = {
    "6829": "KIT SUSPENSIÓN 3 TENSORES + ALIMENTACIÓN",
    "6830": "KIT SUSPENSIÓN 3 TENSORES + ALIMENTACIÓN",
}


def build_ficha(variants, blue, MAN):
    variants = sorted(variants, key=lambda v: color_sort_key(v.get("Color producto")))
    p = variants[0]                    # variante primaria (Negro primero)
    multi = len(variants) > 1
    sku = fmt(p.get("SKU"))
    byname = MAN.get("by_name", {})
    dib_fn = fmt(p.get("Dibujo técnico"))
    ldt_fn = fmt(p.get("Archivos LDT"))
    cad_fn = fmt(p.get("Archivo CAD"))
    dib_id = MAN.get("dibujo_by_sku", {}).get(sku) or byname.get(dib_fn.lower())
    cur = MAN.get("curva_by_sku", {}).get(sku, {})
    nombre = fix_roman(strip_color(fmt(p.get("Nombre"))))   # 'MATT ll' → 'MATT II'
    # Renombres puntuales que todavía no están cargados en el maestro
    _ov = next((NOMBRE_OVERRIDE[s] for s in [fmt(v.get("SKU")) for v in variants] if s in NOMBRE_OVERRIDE), None)
    if _ov:
        nombre = _ov
    # Breadcrumb: Colección - Vertical - Familia - Subfamilia (sin Colección si no tiene)
    coleccion = fmt(p.get("Colección"))
    partes = ([f"Colección: {coleccion}"] if not EMPTY(coleccion) else []) + \
        [x for x in [fmt(p.get("Vertical")), fmt(p.get("Categoría")), fmt(p.get("Subcategoría"))] if not EMPTY(x)]
    linea_txt = " - ".join(partes).upper()

    colores = []
    for v in variants:
        nom = fmt(v.get("Color producto"))
        hs = swatch_hexes(nom)
        colores.append({"nombre": nom, "hexes": hs, "hex": hs[0] if hs else "#1a1a1a",
                        "light": bool(hs) and any(is_light(h) for h in hs), "sku": fmt(v.get("SKU"))})

    def combined(field):
        return " | ".join(f"{color_short(v.get('Color producto'))}: {'—' if EMPTY(v.get(field)) else fmt(v.get(field))}" for v in variants)

    filas = []
    filas.append({"k": "SKU", "v": combined("SKU") if multi else fmt(p.get("SKU"))})
    # (EAN quitado de las fichas a pedido)
    switch_cct = False                 # ¿tiene switch de cambio de temperatura de color?
    for h, label in TECH:
        if h in EXCLUDE or h not in blue:
            continue
        if h == "Color producto":
            if multi:
                filas.append({"k": label, "v": " | ".join(c["nombre"] for c in colores)})
            elif not EMPTY(p.get(h)):
                # sin punto de color: los íconos de color van solo en el título de la sección
                filas.append({"k": label, "v": fmt(p.get(h))})
            continue
        if EMPTY(p.get(h)):
            continue
        v = fmt(p.get(h))
        if h == "Clase de aislación":
            v = fix_roman(v)                 # 'Clase l' → 'Clase I'
        elif h == "Dimensión producto":
            v = tidy_square(v)               # cuadrado pegado a las medidas → con espacio
        elif h == "Control" and v.strip().upper() in DIMERIZABLES:
            # Los drivers no llevan ficha propia: lo que hace falta que se lea
            # es que el producto se dimeriza y con qué protocolo.
            v = f"Dimerizable por {v.strip()}"
        elif h == "Temperatura color" and re.search(r"[/~]", v):
            # varios valores de temperatura → el producto trae switch para cambiarla.
            # Asterisco pegado al valor + nota al pie (igual que el calado).
            switch_cct = True
            v = v + "*"
        filas.append({"k": label, "v": v})

    # Clase de aislación como número romano (I/II/III), para elegir el sello al pie
    _cm = re.search(r"\b(III|II|I)\b", fix_roman(fmt(p.get("Clase de aislación"))))
    clase_aisl = _cm.group(1) if _cm else ""

    curvas = [x for x in re.split(r"[,\s]+", fmt(p.get("Curvas Fotométricas"))) if x]
    ag = fmt(p.get("Agrupación de fichas técnicas"))
    if EMPTY(ag) or set(ag) <= {"?"} or ag.upper() in ("#N/A", "N/A", "#N/D", "#REF!"):
        ag = nombre                    # sin agrupación válida → la ficha es su propio documento

    # Manual de Instalación: PDF de la carpeta pública. 1º por SKU (nombre 'SKU-...-manual.pdf');
    # si ninguno matchea, fallback por nombre de familia/agrupación en el título (ej. 'Dyna',
    # 'Chill'). Si nada matchea → sin botón de manual.
    manual_map = MAN.get("manual_by_sku", {})
    _skus_ficha = [fmt(p.get("SKU"))] + [c["sku"] for c in colores]
    manual_id = next((manual_map[s] for s in _skus_ficha if s in manual_map), None)
    if manual_id is None and len(ag.strip()) >= 3:
        ag_l = ag.lower().strip()
        manual_id = next((m["id"] for m in MAN.get("manuales_lista", []) if ag_l in m["t"]), None)

    return {
        "sku": fmt(p.get("SKU")),
        "skus": [c["sku"] for c in colores],
        "titulo": nombre,
        "agrupacion": ag,
        "linea": linea_txt,
        "subcat": fmt(p.get("Subcategoría")),
        "vertical": fmt(p.get("Vertical")),
        # True sólo si TODOS los colores están discontinuados. Se usa para que un
        # accesorio dado de baja no siga apareciendo en la grilla de accesorios
        # (ver split_accesorios). Un producto discontinuado SÍ conserva su ficha:
        # se sigue consultando por instalaciones ya hechas.
        "discontinuado": all(
            str(v.get("Situación") or "").strip().lower().startswith("discontinu")
            for v in variants),
        "badge": badge(fmt(p.get("Dimensión producto"))),
        "descripcion": fmt(p.get("Descripción corta")),
        "filas": filas,
        "switch_cct": switch_cct,
        "clase_aisl": clase_aisl,   # I/II/III → sello al pie: círculo / cuadrado / rombo
        "lente": lente_info(p.get("Comentarios")),
        "calado": calado_info(p),
        "colores": colores,
        "assets": {
            "foto": fmt(p.get("Imagen destacada")),
            "dibujo": dib_fn,
            "dibujo_url": IMG(dib_id),
            "curva_polar": next((c for c in curvas if re.search(r"polar", c, re.I)), ""),
            "curva_cono": next((c for c in curvas if re.search(r"cono", c, re.I)), ""),
            "curva_polar_url": IMG(cur.get("polar") or byname.get(next((c for c in curvas if re.search(r"polar", c, re.I)), "").lower())),
            "curva_cono_url": IMG(cur.get("cono") or byname.get(next((c for c in curvas if re.search(r"cono", c, re.I)), "").lower())),
            "ldt": ldt_fn,
            "ldt_url": DL(byname.get(ldt_fn.lower())),
            "cad": cad_fn,
            "cad_url": DL(byname.get(cad_fn.lower())),
            "manual_url": VIEW(manual_id),
        },
    }


# --- Página de accesorios (grilla) --------------------------------------------------
# Chill / Rieles / Dyna llevan todos sus accesorios juntos en UNA hoja, en vez de una
# ficha por accesorio. El criterio es la columna Subcategoría = "Accesorio"
# (las "Unión" y el producto en sí siguen teniendo su ficha propia).
ACC_GRUPOS = ("CHILL", "RIELES", "DYNA", "REN")   # REN: el MARCO REN SLIM va como hoja de accesorios
ACC_EXCLUIR = ("DYNA DRIVERS",)         # no entran a la grilla (ver AGRUPACIONES_SIN_FICHA)

# Agrupaciones que NO generan ficha (Mati, 20/08/2026):
#   · DYNA DRIVERS         → los drivers no llevan ficha. Lo que tiene que verse
#                            es la leyenda "Dimerizable por…" en las fichas de
#                            los productos que los usan (ver DIMERIZABLES).
#   · RIELES 2EF 2NEUTROS  → esa ficha no existe. Son dos accesorios sueltos
#                            (ADAPTADOR 2EF 2N, 6726/6727); se hizo una ficha en
#                            su momento y después se anuló.
AGRUPACIONES_SIN_FICHA = ("DYNA DRIVERS", "RIELES 2EF 2NEUTROS")

# El tensor va en RIELES y DYNA, y en NINGUNA otra. Ojo: antes esto se
# comparaba con startswith y por eso el tensor se colaba en "DYNA EM" (que se
# embute, no se cuelga) y en "RIELES 2EF 2NEUTROS". Ahora es coincidencia EXACTA.
ACC_CON_TENSOR = ("RIELES 1EF", "RIELES 3EF", "DYNA")
TENSOR_SKU = "7228"                      # CABLE TENSOR CORRIENTE 7MTS

# --- Hoja de texto al final de un documento ----------------------------------------
# Contenido que NO está en BASE ÚNICA (no son productos Leuk): va como última hoja
# del documento. Copiado de la última hoja del PDF de diseño "Ficha técnica - DYNA"
# (15/09/2026). Si cambian modelos o proveedores, se edita acá.
HOJAS_FINALES = {
    "DYNA": {
        "tipo": "emergencia",
        "titulo": "DYNA",
        "linea": "INTERIOR | LINEAL",
        "seccion": "Equipo de emergencia",
        "intro": "Los lineales Dyna son compatibles con diferentes equipos de emergencia, lo que "
                 "permite su funcionamiento frente a un corte de suministro.",
        "intro_destacado": "Actualmente Leuk Iluminación no comercializa estos productos.",
        "bajada": "A continuación, compartimos un listado de empresas y los equipos correspondientes. "
                  "Para cualquier ajuste o modificación, por favor, consultar directamente con ellos.",
        "proveedores": [
            {"nombre": "GAMASONIC", "web": "www.gamasonic.com.ar",
             "desc": "Equipos para instalación externa al Dyna.",
             "equipos": [
                 {"largo": "DYNA 1200 mm", "modelo": "EBMPLUS-40 / 9.6V 6Ah", "autonomia": "90 minutos", "rendimiento": "100%"},
                 {"largo": "DYNA 1800 mm", "modelo": "EBMPLUS-80 / 9.6V 12Ah", "autonomia": "90 minutos", "rendimiento": "100%"},
                 {"largo": "DYNA 2400 mm", "modelo": "EBMPLUS-80 / 11,1V 10Ah", "autonomia": "90 minutos", "rendimiento": "100%"},
             ]},
            {"nombre": "COSMEL", "web": "www.cosmel.com.ar",
             "desc": "Equipos para instalación interna y externa al Dyna. Para instalación interna "
                     "solicitarlo sin carcasa y con aislación de Mylar.",
             "equipos": [
                 {"largo": "DYNA 600 mm", "modelo": "SA-NP LED 3,7V-2A", "autonomia": "100min aprox.", "rendimiento": "30%"},
                 {"largo": "DYNA 1200 mm", "modelo": "SA-NP LED 7,4V-2A", "autonomia": "100min aprox.", "rendimiento": "30%"},
                 {"largo": "DYNA 1800 mm", "modelo": "SA-NP LED 7,4V-2A", "autonomia": "75min aprox.", "rendimiento": "30%"},
                 {"largo": "DYNA 2400 mm", "modelo": "SA-NP LED 7,4V-2A", "autonomia": "50min aprox.", "rendimiento": "30%"},
             ]},
            {"nombre": "ATOMLUX", "web": "www.atomlux.com.ar",
             "desc": "Equipos para instalación externa al Dyna.",
             "equipos": [
                 {"largo": "DYNA 600 mm", "modelo": "ATOMLUX 1606-PANEL-LED", "autonomia": "90min aprox.", "rendimiento": "30%"},
                 {"largo": "DYNA 1200 mm", "modelo": "ATOMLUX 1606-PANEL-LED", "autonomia": "50min aprox.", "rendimiento": "30%"},
                 {"largo": "DYNA 1800 mm", "modelo": "ATOMLUX 1601 LITIO LED", "autonomia": "75min aprox.", "rendimiento": "30%"},
                 {"largo": "DYNA 2400 mm", "modelo": "ATOMLUX 1601 LITIO LED", "autonomia": "50min aprox.", "rendimiento": "30%"},
             ]},
        ],
    },
}

# Valores de la columna Control que significan que el producto se dimeriza.
# En la ficha se escriben como "Dimerizable por TRIAC" en vez de sólo "TRIAC".
DIMERIZABLES = ("TRIAC", "DALI", "DALI + PUSH")


# Accesorios compartidos: una misma ficha de accesorio que se repite como última hoja de
# varios documentos. Cada entrada es (SKU del accesorio, regla de a qué documentos va).
# Reglas posibles: "prefijos" (la agrupación empieza así) y/o "subcat" + "fijacion".
ACC_COMPARTIDOS = [
    ("6716", {"prefijos": ("YORK", "SINTRA")}),                 # KIT SUSPENSIÓN SINTRA/YORK
    # York y Sintra quedan afuera: llevan su propio kit (el 6716)
    ("6829", {"subcat": "aplique", "fijacion": "suspender",
              "excepto": ("YORK", "SINTRA")}),                  # KIT SUSPENSIÓN 4 TENSORES
    # Mati, 20/08/2026:
    ("6810", {"agrupaciones": ("RIELES 3EF",)}),                # COBERTOR RIEL: va en 1EF y 3EF
                                                                # (en 1EF ya está por agrupación propia)
    ("6697", {"agrupaciones": ("RIELES 1EF", "RIELES 3EF")}),   # FLORON LINEAL: va en ambos rieles
                                                                # (su agrupación propia es DYNA y ahí queda)
]


def _fijacion(f):
    return next((r["v"] for r in f.get("filas", []) if r["k"] == "Fijación"), "")


def _aplica(f, regla):
    ag = (f.get("agrupacion") or "").upper()
    if regla.get("excepto") and ag.startswith(regla["excepto"]):
        return False
    if "prefijos" in regla:
        return ag.startswith(regla["prefijos"])
    if regla.get("subcat") and fmt(f.get("subcat")).lower() != regla["subcat"]:
        return False
    if regla.get("fijacion") and regla["fijacion"] not in _fijacion(f).lower():
        return False
    return True


def add_compartidos(fichas):
    extra = []
    for sku, regla in ACC_COMPARTIDOS:
        base = next((f for f in fichas if f.get("sku") == sku or sku in (f.get("skus") or [])), None)
        if base is None:
            print(f"  (aviso) accesorio compartido SKU {sku}: no lo encontré")
            continue
        propia = base.get("agrupacion")
        # Lista explícita de destinos: para accesorios que van a agrupaciones
        # puntuales, sin regla que las adivine.
        if "agrupaciones" in regla:
            existentes = {(f.get("agrupacion") or f.get("titulo") or "") for f in fichas}
            destinos = [a for a in regla["agrupaciones"] if a != propia and a in existentes]
            faltan = [a for a in regla["agrupaciones"] if a not in existentes]
            if faltan:
                print(f"  (aviso) accesorio {sku}: no existe la agrupación {faltan}")
            for a in destinos:
                copia = dict(base); copia["agrupacion"] = a; extra.append(copia)
            print(f"  accesorio compartido «{base['titulo']}» → {len(destinos)} documentos")
            continue

        destinos, vistas = [], set()
        for f in fichas:
            a = f.get("agrupacion") or f.get("titulo") or ""
            if a and a != propia and a not in vistas and _aplica(f, regla):
                vistas.add(a)
                destinos.append(a)
        for a in destinos:
            copia = dict(base)
            copia["agrupacion"] = a
            extra.append(copia)
        print(f"  accesorio compartido «{base['titulo']}» → {len(destinos)} documentos")
    return fichas + extra


def acc_lineas(f):
    """Una línea por SKU: 'SKU 6645 - HOUSING 1EF 1MT BLANCO'."""
    cols = f.get("colores") or []
    if len(cols) > 1:
        return [{"sku": c["sku"], "nombre": f"{f['titulo']} {color_short(c['nombre']).upper()}".strip()}
                for c in cols if c.get("sku")]
    return [{"sku": f["sku"], "nombre": f["titulo"]}]


def build_acc_page(ag, accs):
    vert = next((a.get("vertical") for a in accs if a.get("vertical")), "")
    return {
        "tipo": "accesorios",
        "sku": "",
        "skus": [l["sku"] for a in accs for l in acc_lineas(a)],
        "titulo": ag,
        "agrupacion": ag,
        "linea": (f"{vert} | ACCESORIOS" if vert else "ACCESORIOS").upper(),
        "items": [{"foto_url": a.get("foto_url") or "", "lineas": acc_lineas(a)} for a in accs],
        "filas": [], "colores": [], "assets": {},
    }


def split_accesorios(fichas):
    tensor = next((f for f in fichas if f.get("sku") == TENSOR_SKU), None)
    resto, pend, orden, fuera_acc = [], {}, [], []
    for f in fichas:
        ag = f.get("agrupacion") or f.get("titulo") or ""
        es_acc = (ag.upper().startswith(ACC_GRUPOS) and ag.upper() not in ACC_EXCLUIR
                  and fmt(f.get("subcat")).lower() == "accesorio")
        if es_acc and f.get("discontinuado"):
            # Accesorio dado de baja: no va a la grilla ni tiene ficha propia.
            # Casos reales (21/08/2026): TAPA 3 EF (7233/7234), reemplazada por
            # TAPA 3EF (6590/6591); y ADAPTADOR HEMBRA 1EF (6722/6723),
            # reemplazado por el II (7171/7172).
            fuera_acc.append(ag)
            continue
        if es_acc:
            if ag not in pend:
                pend[ag] = []
                orden.append(ag)
            pend[ag].append(f)
        else:
            resto.append(f)
    for ag in orden:
        accs = pend[ag]
        if ag.upper() in ACC_CON_TENSOR and tensor and tensor not in accs:
            accs = accs + [tensor]
        resto.append(build_acc_page(ag, accs))
    if fuera_acc:
        print(f"  accesorios discontinuados fuera de la grilla: {len(fuera_acc)}")
    return resto, orden


def main():
    wb, hoja = get_workbook()
    ws = wb[hoja]
    headers, blue = {}, set()
    for c in ws[1]:
        if c.value is None:
            continue
        name = str(c.value).strip()
        headers[c.column] = name
        if is_blue(c):
            blue.add(name)
    if not blue:                       # el export de Sheets no trae el color → usar config fija
        blue = set(BLUE_COLS)
        print(f"  (sin color en la fuente → uso las {len(blue)} columnas técnicas por config)")

    load_color_codes(wb)
    COMENTARIOS = load_comentarios(wb)
    MAN = load_manifest()
    _mp = load_manuales_publicos()                     # manuales de la carpeta pública
    MAN["manual_by_sku"] = _mp["by_sku"]
    MAN["manuales_lista"] = _mp["lista"]

    # SKU Padre que faltan en el maestro (rompen la unificación por color → fichas repetidas).
    # Corrección puntual; lo ideal es cargarlos en la planilla y este override sobra.
    PADRE_OVERRIDE = {
        "7251": "7065",   # LAIVA BL 3000K → familia LAIVA 3000K (con 7065/7250)
        "7253": "7252",   # LAIVA II NG 3000K → familia LAIVA II 3000K (con 7252)
    }

    rows = []
    for row in ws.iter_rows(min_row=2):
        obj = {headers[c.column]: c.value for c in row if c.column in headers}
        # descartar filas con SKU inválido/sin asignar (#N/D, #N/A, vacío): generan fichas fantasma
        if EMPTY(obj.get("SKU")):
            continue
        pv = PADRE_OVERRIDE.get(fmt(obj.get("SKU")))
        if pv:
            obj["SKU Padre"] = pv
        # Comentarios del maestro (hoja aparte) → para notas al pie (lentes, etc.)
        obj["Comentarios"] = COMENTARIOS.get(fmt(obj.get("SKU")), "")
        rows.append(obj)

    # Accesorio MARCO REN SLIM (SKU 7279): todavía no está cargado en BASE ÚNICA, así que lo
    # inyectamos como fila sintética para que salga como hoja de accesorio del documento REN.
    # Datos tomados de la hoja Maestro. La foto va en el set curado (fotos/7279.png).
    # OJO: el marco es sólo para el REN SLIM (30x60), no para los otros REN. La hoja de
    # accesorios lo dice en el nombre ("MARCO REN SLIM"), que es lo que lee quien la mira.
    rows.append({
        "Nombre": "MARCO REN SLIM",
        "SKU": "7279",
        "Vertical": "Interior",
        "Categoría": "De Techo",
        "Subcategoría": "Accesorio",
        "Fijación": "Aplicar",
        "Dimensión producto": "300 x 600 mm",
        "Material": "Aluminio",
        "Color producto": "Blanco Satinado",
        "Garantía": "4 Años",
        "Agrupación de fichas técnicas": "REN",
        "Comentarios": "",
    })

    # Clasificación heredada: las filas hijas dejan Colección/Categoría/Subcategoría/Vertical
    # vacías y la info vive en la fila padre. Sin esto la mayoría de las fichas quedan sin
    # breadcrumb y sin Subcategoría (que es lo que separa Accesorio / Unión / producto).
    CLASIF = ("Colección", "Categoría", "Subcategoría", "Vertical")
    meta = {}
    for o in rows:
        s = fmt(o.get("SKU"))
        if not s or EMPTY(o.get("Categoría")):
            continue
        # la fila "cabecera" (sin SKU Padre) manda sobre las hijas
        if s not in meta or EMPTY(o.get("SKU Padre")):
            meta[s] = {k: o.get(k) for k in CLASIF}
    for o in rows:
        for src in (fmt(o.get("SKU")), fmt(o.get("SKU Padre"))):
            m = meta.get(src)
            if not m:
                continue
            for k in CLASIF:
                if EMPTY(o.get(k)) and not EMPTY(m.get(k)):
                    o[k] = m[k]

    # dedupe por (SKU, Color): quedarnos con la fila que tenga MÁS datos (padre o hija según el caso)
    def richness(o):
        return sum(1 for v in o.values() if not EMPTY(v))

    def foreign_dib(o):
        # fila con un dibujo "prestado" de otro modelo (su SKU no está en el nombre del archivo).
        # Arrastre del maestro: p.ej. SKU 6122 cargado como 'MATT l NG' con el dibujo del MATT I.
        dib, s = fmt(o.get("Dibujo técnico")), fmt(o.get("SKU"))
        return bool(dib) and bool(s) and s not in dib

    def rank(o):
        return (0 if foreign_dib(o) else 1, richness(o))   # 1º evitar dibujo prestado, 2º más datos

    best = {}
    for o in rows:
        key = (fmt(o.get("SKU")), fmt(o.get("Color producto")))
        if key not in best or rank(o) > rank(best[key]):
            best[key] = o
    uniq = list(best.values())

    # agrupar por (base + firma de specs SIN color) → fusiona variantes de color
    blue_sig = sorted(h for h in blue if h != "Color producto")

    def spec_sig(o):
        return tuple(fmt(o.get(h)) for h in blue_sig)

    # Variantes de color cargadas SIN "SKU Padre": quedaban como hoja aparte del documento
    # en vez de sumarse como una columna de color a la tabla de su hermana (pedido de
    # diseño por los POCKET negros, ago/2026). Si una fila huérfana tiene EXACTAMENTE las
    # mismas specs técnicas que un grupo que sí tiene padre, en el mismo documento y con un
    # color que ese grupo todavía no tiene, es la misma luminaria en otro color: adopta el
    # padre. Los tres filtros juntos son lo que hace segura la regla — hoy alcanza solo a
    # las 24 filas de POCKET, las únicas del maestro en esa situación. Igual el arreglo de
    # fondo es cargar el SKU Padre en la planilla; esto es la red que evita la hoja repetida.
    MIN_SPECS = 8                       # specs casi vacías matchean con cualquiera
    con_padre = {}
    for o in uniq:
        if not EMPTY(o.get("SKU Padre")):
            con_padre.setdefault(spec_sig(o), []).append(o)

    adoptadas = []
    for o in uniq:
        if not EMPTY(o.get("SKU Padre")):
            continue
        sig = spec_sig(o)
        if sum(1 for v in sig if not EMPTY(v)) < MIN_SPECS:
            continue
        ag = fmt(o.get("Agrupación de fichas técnicas"))
        mates = [m for m in con_padre.get(sig, [])
                 if fmt(m.get("Agrupación de fichas técnicas")) == ag]
        padres = {fmt(m.get("SKU Padre")) for m in mates}
        if len(padres) != 1:                                   # ninguno o ambiguo
            continue
        if fmt(o.get("Color producto")) in {fmt(m.get("Color producto")) for m in mates}:
            continue                                           # ese color ya está en el grupo
        o["SKU Padre"] = padres.pop()
        adoptadas.append(fmt(o.get("SKU")))
    if adoptadas:
        print(f"  variantes de color sin SKU Padre unidas a su ficha: {len(adoptadas)} "
              f"({', '.join(adoptadas)})")

    def gkey(o):
        padre = fmt(o.get("SKU Padre"))
        base = padre if not EMPTY(padre) else fmt(o.get("SKU"))
        return (base,) + tuple(fmt(o.get(h)) for h in blue_sig)

    groups, order = {}, []
    for o in uniq:
        k = gkey(o)
        if k not in groups:
            groups[k] = []
            order.append(k)
        groups[k].append(o)

    fichas = [build_ficha(groups[k], blue, MAN) for k in order]
    unificadas = sum(1 for f in fichas if len(f.get("colores", [])) > 1)

    # Overrides de documento: re-etiquetan la agrupación DESPUÉS de armar la ficha.
    # Vacío a propósito. Acá vivía {"7215": "REN SLIM"}, que sacaba al REN SLIM del
    # documento REN para poder colgarle su marco. Martina confirmó (21/08/2026) que el
    # REN SLIM va adentro de la ficha de REN, y en BASE ÚNICA su agrupación ya dice "REN".
    # Un override así le gana al dato en silencio: si hace falta uno, que sea temporal
    # y con fecha, o el maestro deja de ser la fuente de verdad.
    AGRUP_DOC = {}
    for f in fichas:
        if f.get("sku") in AGRUP_DOC:
            f["agrupacion"] = AGRUP_DOC[f["sku"]]

    # foto: reusar la URL que el benchmark ya resuelve
    photo = {}
    try:
        bench = json.loads(P.OUT_JSON.read_text())
        for p in bench.get("productos", []):
            photo[str(p.get("sku"))] = p.get("imagen")
    except Exception as e:
        print("  (aviso) no pude leer benchmark_data.json:", e)
    # Fotos corregidas a mano (la del maestro está mal). Ganan sobre todo.
    # 7228 (tensor 7mts) ya está bien en el ZIP actualizado → usa el PNG curado, sin override.
    FOTO_OVERRIDE = {}
    # Set curado de PNG por SKU (fondo transparente, escala pareja) que baja ficha_fotos.py.
    FOTOS_DIR = P.ROOT / "app" / "assets" / "ficha" / "fotos"

    def mejor_foto(f):
        sku = str(f["sku"])
        if sku in FOTO_OVERRIDE:
            return FOTO_OVERRIDE[sku]
        # PNG curado: probar la SKU representativa y luego cualquier variante de color
        for s in [sku] + [str(x) for x in (f.get("skus") or [])]:
            if (FOTOS_DIR / f"{s}.png").exists():   # PNG curado > foto del benchmark
                return f"assets/ficha/fotos/{s}.png"
        return photo.get(sku)

    con_foto = 0
    for f in fichas:
        f["foto_url"] = mejor_foto(f)
        if f["foto_url"]:
            con_foto += 1

    # Fuera las agrupaciones que no llevan ficha. Va ANTES de repartir accesorios
    # para no copiar nada hacia un documento que no va a existir.
    antes = len(fichas)
    fichas = [f for f in fichas
              if (f.get("agrupacion") or f.get("titulo") or "").upper() not in AGRUPACIONES_SIN_FICHA]
    if antes != len(fichas):
        print(f"  sin ficha por decisión de producto: {antes - len(fichas)} hoja(s) "
              f"({', '.join(AGRUPACIONES_SIN_FICHA)})")

    fichas = add_compartidos(fichas)             # accesorios que se repiten en varios documentos
    fichas, acc_ags = split_accesorios(fichas)   # accesorios de Chill/Rieles/Dyna → 1 hoja por documento
    if acc_ags:
        print(f"  hojas de accesorios: {', '.join(acc_ags)}")

    # Orden de páginas dentro de los documentos RIELES: primero los RIELES, después las
    # UNIONES y al final la hoja de ACCESORIOS. El resto de los documentos queda igual
    # (rank 0 + orden estable → sin cambios).
    RIELES_RANK = {"riel": 0, "unión": 1, "union": 1}
    _first = {}
    for i, f in enumerate(fichas):
        _first.setdefault(f.get("agrupacion") or f.get("titulo") or "", i)

    def _page_key(i_f):
        i, f = i_f
        ag = f.get("agrupacion") or f.get("titulo") or ""
        r = RIELES_RANK.get(fmt(f.get("subcat")).lower(), 2) if ag.upper().startswith("RIELES") else 0
        return (_first[ag], r, i)

    fichas = [f for _, f in sorted(enumerate(fichas), key=_page_key)]

    # Hojas de texto: van al final del documento → se agregan después de ordenar.
    ags = {f.get("agrupacion") or f.get("titulo") or "" for f in fichas}
    for ag, hoja in HOJAS_FINALES.items():
        if ag not in ags:
            print(f"  (aviso) hoja final de {ag}: el documento no existe, no se agrega")
            continue
        fichas.append({**hoja, "sku": "", "skus": [], "agrupacion": ag,
                       "filas": [], "colores": [], "assets": {}})

    OUT.write_text("window.FICHAS = " + json.dumps(fichas, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"✓ fichas.js: {len(fichas)} fichas ({unificadas} unificadas por color) · {len(blue)} columnas azules · foto resuelta en {con_foto}")
    print(f"  → {OUT}")

    # Corriendo solo (sin nadie mirando el log), publicar desde el xlsx local
    # sería peor que no publicar: quedarían fichas viejas sin que nadie se
    # entere. El código de salida 2 le avisa a actualizar_fichas.sh que NO siga.
    if USO_FALLBACK:
        print("\n⛔ Se generó desde el xlsx LOCAL, no desde la planilla. NO publicar.")
        raise SystemExit(2)


if __name__ == "__main__":
    main()
