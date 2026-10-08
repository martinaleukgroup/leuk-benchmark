#!/usr/bin/env python3
"""
consolidate.py — Motor de propuestas de equivalencia (matching EN VIVO).

Para cada producto Leuk, corre las 3 señales (técnica, etiquetación, visual)
contra TODO el catálogo de la competencia (por familia) y propone los
equivalentes rankeados por nivel de match. NO usa la tabla `comparaciones`
(que era el output de un proceso viejo): las propuestas se generan acá.

Salida:
  - data/benchmark_data.json  y  app/data.js
    Por producto Leuk: mejor_por_marca (Vonderk/Artelum/WLG) + ranking global.

Requisitos opcionales (los genera el track de imágenes; si faltan se ignoran):
  leuk_image_manifest.json, leuk_etiquetas.json, leuk_embeddings.npz, comp_slug_vecs.npz
"""
import json
import pathlib
import re
import sqlite3
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime

import numpy as np
import pandas as pd

import paths as P
from matching import (Producto, match, MatchConfig, parse_number,
                      categoria_funcional, categorias_compatibles, NON_EMIT)
from normalize import limpiar, slug, montaje_canonico, color_canonico

LOG = []
def log(m):
    LOG.append(m); print(m)

TC_BLUE = 1435.0  # tipo de cambio para pasar ARS→USD (se refresca desde la DB)
MARCAS = ["Vonderk", "Artelum", "World Leds Go", "Lucciola"]
DESC = {}          # marca -> % descuento (desc_total), para calcular precio NETO
LEUK_DESC = 0.0    # descuento de Leuk (de la tabla descuentos_competidores)


# --- Descartes: lo que el equipo marcó como "no comparable" desde la app -------
# Viven en la tabla `autorizaciones` de Supabase, con prefijo en la key:
#   no|<sku>|<marca>|<fslug>   → ese PAR no se vuelve a proponer
#   nover|<marca>|<fslug>      → ese producto de competencia sale de TODAS las comparaciones
# Es la memoria del motor: sin esto, cada corrida vuelve a proponer lo ya descartado.
SB_URL = "https://cswqoretlhppxkelysny.supabase.co"
# 'autorizaciones' tiene SELECT público (a propósito, ver benchmark-autorizaciones):
# alcanza con la publishable key, sin login.
SB_KEY = "sb_publishable_Rpbm5uyhUp8aTvoCnHylyA_B0wq8sRs"


def cargar_descartes():
    """(pares, entidades, motivos). Si no hay red, devuelve vacío y avisa."""
    pares, entidades, motivos = set(), set(), defaultdict(int)
    try:
        q = "key=like.no*&select=key,datos"          # 'no|...' y 'nover|...'
        req = urllib.request.Request(f"{SB_URL}/rest/v1/autorizaciones?{q}",
                                     headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"})
        filas = json.load(urllib.request.urlopen(req, timeout=60))
    except Exception as e:
        log(f"Descartes: no se pudieron leer ({e}); se sigue sin aplicarlos")
        return pares, entidades, motivos
    for f in filas:
        k = f.get("key") or ""
        d = f.get("datos") or {}
        if k.startswith("nover|"):
            entidades.add((d.get("marca"), d.get("fslug")))
        elif k.startswith("no|"):
            pares.add((str(d.get("sku")), d.get("marca"), d.get("fslug")))
        else:
            continue
        motivos[d.get("motivo") or "otro"] += 1
    return pares, entidades, motivos


def neto(precio_lista, desc_pct):
    if precio_lista is None:
        return None
    return round(precio_lista * (1 - (desc_pct or 0) / 100.0), 2)


# ---------------------------------------------------------------------------
# Carga de fuentes
# ---------------------------------------------------------------------------
def cargar_leuk():
    """Fuente de Leuk = ficha técnica nueva (mismo formato que competencia).
    Los precios se joinean desde la DB por SKU (la ficha nueva no trae precio)."""
    con = sqlite3.connect(str(P.DB))
    global TC_BLUE
    row = con.execute("SELECT dolar_blue_venta FROM tipos_cambio ORDER BY fecha DESC LIMIT 1").fetchone()
    if row and row[0]:
        TC_BLUE = float(row[0])
    precios = {str(r[0]): r[1] for r in con.execute("SELECT sku, precio_usd FROM leuk_productos") if r[0]}
    # Lista de precios OFICIAL (N15 V2) tiene prioridad sobre la DB (que estaba desactualizada/errónea
    # en ~62 SKU). La DB queda de respaldo para los SKU que la lista no cubre.
    n_lista = 0
    if P.LEUK_PRECIOS.exists():
        lp = pd.read_excel(P.LEUK_PRECIOS, dtype={0: str}).dropna(how="all")
        lp.columns = ["SKU", "Descripcion", "Precio"][:len(lp.columns)]
        for _, r in lp.iterrows():
            sku = str(r["SKU"]).replace(".0", "").strip()
            try:
                p = round(float(r["Precio"]), 2)
            except (TypeError, ValueError):
                continue
            if sku and p > 0:
                precios[sku] = p; n_lista += 1
    global DESC, LEUK_DESC
    DESC = {r[0]: r[1] for r in con.execute("SELECT marca, desc_total FROM descuentos_competidores")}
    LEUK_DESC = DESC.get("LEUK", DESC.get("Leuk", 0.0)) or 0.0
    con.close()

    df = pd.read_excel(P.LEUK_FICHAS, sheet_name=P.LEUK_FICHAS_HOJA).fillna("")
    leuk = {}
    for _, row in df.iterrows():
        sku = limpiar(row.get("SKU"))
        if not sku:
            continue
        leuk[sku] = {
            "sku": sku, "nombre": limpiar(row.get("Nombre")),
            "vertical": limpiar(row.get("Sección")), "familia": limpiar(row.get("Familia")),
            "subfamilia": limpiar(row.get("Subfamilia")), "precio_usd": precios.get(sku),
            "potencia_w": limpiar(row.get("Potencia (W)")), "lumenes": limpiar(row.get("Lúmenes del sistema")),
            "eficacia_lmw": limpiar(row.get("Eficiencia (lm/W)")), "tension": limpiar(row.get("Tensión (V)")),
            "angulo": limpiar(row.get("Ángulo de haz")), "cri": limpiar(row.get("CRI")),
            "cct": limpiar(row.get("Temp. de color (K)")), "ugr": limpiar(row.get("UGR")),
            "ip": limpiar(row.get("IP")), "fijacion": limpiar(row.get("Fijación/montaje")),
            "dimensiones": limpiar(row.get("Medidas")), "control": limpiar(row.get("Control")),
            "garantia": limpiar(row.get("Garantía")), "movimiento": limpiar(row.get("Movimiento")),
            "color": limpiar(row.get("Color del artefacto")), "fuente_luz": limpiar(row.get("Fuente de luz")),
            "clase": limpiar(row.get("Clase")), "estado": limpiar(row.get("Estado")),
        }
    con_precio = sum(1 for v in leuk.values() if v["precio_usd"] is not None)
    log(f"Leuk (ficha '{P.LEUK_FICHAS_HOJA}'): {len(leuk)} productos · con precio={con_precio} · lista oficial N15={n_lista} · TC blue={TC_BLUE}")
    return leuk


def cargar_fichas():
    fichas = {}
    # Lucciola entró por el circuito nuevo: sus fichas las arma lucciola_build.py desde
    # los productos APROBADOS en la app, no desde un Excel.
    luc = P.ROOT / "pipeline/lucciola_fichas.json"
    if luc.exists():
        fichas["Lucciola"] = pd.DataFrame(json.loads(luc.read_text())).fillna("")
        log(f"Fichas Lucciola: {len(fichas['Lucciola'])} filas (aprobadas en la app)")
    else:
        fichas["Lucciola"] = pd.DataFrame()
        log("Fichas Lucciola: sin datos — correr lucciola_build.py")
    for marca, ruta in P.FICHAS.items():
        if not ruta.exists():
            fichas[marca] = pd.DataFrame(); continue
        fichas[marca] = pd.read_excel(ruta, sheet_name="Catálogo completo").fillna("")
        log(f"Fichas {marca}: {len(fichas[marca])} filas")
    return fichas


def cargar_dict_excel(rutas, hoja):
    out = {}
    for marca, ruta in rutas.items():
        if not ruta.exists():
            out[marca] = {}; continue
        df = pd.read_excel(ruta, sheet_name=hoja).fillna("")
        idcol = df.columns[0]
        d = {}
        for _, row in df.iterrows():
            rid = limpiar(row.get(idcol))
            if rid:
                d[slug(rid)] = {k: limpiar(v) for k, v in row.items()}
        out[marca] = d
    return out


def _rank_img_url(u):
    """Menor = mejor FOTO DE PRODUCTO. Evita dibujos de cota, íconos, logos y ambientes.
    Antes se descartaba 'portada' (que suele ser LA foto de producto) y NO se descartaba
    'cota' → varios productos (perfiles NECK, etc.) mostraban el dibujo técnico."""
    f = u.lower().rsplit("/", 1)[-1]
    if any(g in f for g in ("descargar", "logo", "banner")):
        return 99   # ícono/logo/descarga: nunca
    # 'portada'/'porta' gana siempre, aunque el archivo diga 'mesa-de-trabajo'
    # (nombre por defecto de Illustrator que quedó en el nombre de la portada real)
    if any(g in f for g in ("portada", "porta", "carrusel-producto", "carrusel_producto")):
        return 0    # foto de producto principal: lo mejor
    if any(g in f for g in ("cota", "medidas", "-plano", "dwg", "esquema", "diagrama")):
        return 40   # dibujo técnico dimensional: sólo si no hay foto
    if any(g in f for g in ("situ", "ambient", "render", "contexto")):
        return 25   # foto de ambiente: preferible una de producto
    if any(g in f for g in ("mesa-de-trabajo", "cover")):
        return 20   # composición de Illustrator sin 'portada': usable, mejor que cota
    return 10       # otra foto de producto


def cargar_indices():
    idx = {}
    for marca, ruta in P.INDICES.items():
        if not ruta.exists():
            idx[marca] = {}; continue
        df = pd.read_csv(ruta).fillna("")
        idcol = "producto" if "producto" in df.columns else ("id" if "id" in df.columns else df.columns[0])
        d = {}
        for _, row in df.iterrows():
            rid = limpiar(row.get(idcol))
            if not rid:
                continue
            urls = [u.strip() for u in str(row.get("urls", "")).split("|") if u.strip()]
            cand = sorted(urls, key=_rank_img_url)
            # nunca un ícono/logo (rank 99); si sólo hay eso, mejor sin imagen
            buena = next((u for u in cand if _rank_img_url(u) < 99), "")
            d[slug(rid)] = buena
        idx[marca] = d
    return idx


def cargar_artefactos_leuk():
    tags = json.loads(P.LEUK_TAGS.read_text()) if P.LEUK_TAGS.exists() else {}
    manifest = json.loads(P.LEUK_IMG_MANIFEST.read_text()) if P.LEUK_IMG_MANIFEST.exists() else {}
    emb = {}
    if P.LEUK_EMB.exists():
        z = np.load(P.LEUK_EMB, allow_pickle=True)
        emb = {str(s): v for s, v in zip(z["skus"], z["vecs"])}
    comp_vecs = {}
    cvp = P.ROOT / "pipeline/comp_slug_vecs.npz"
    if cvp.exists():
        z = np.load(cvp, allow_pickle=True)
        comp_vecs = {str(s): v for s, v in zip(z["slugs"], z["vecs"])}
    # sumar los vectores visuales nuevos de WLG y Artelum (no estaban en el índice FAISS)
    # Lucciola es la única marca que pasa por aprobación en la app: sus etiquetas y vectores
    # existen para TODAS las familias importadas, así que hay que filtrarlos por las aprobadas
    # (lucciola_families.json, que arma lucciola_build.py). Si no, una familia sin aprobar
    # entraría igual por la señal de forma + visual, sin specs ni precio.
    luc_fam_p = P.ROOT / "pipeline/lucciola_families.json"
    luc_ok = set(json.loads(luc_fam_p.read_text())) if luc_fam_p.exists() else set()
    for extra in ("pipeline/wlg_vecs.npz", "pipeline/artelum_vecs.npz", "pipeline/lucciola_vecs.npz"):
        p = P.ROOT / extra
        if p.exists():
            z = np.load(p, allow_pickle=True)
            for s, v in zip(z["slugs"], z["vecs"]):
                if "lucciola" in extra and str(s) not in luc_ok:
                    continue
                comp_vecs[str(s)] = v
    log(f"Artefactos Leuk · imágenes={len(manifest)} · etiquetas={len(tags)} · "
        f"embeddings={len(emb)} · vecs competencia={len(comp_vecs)}")
    return manifest, tags, emb, comp_vecs


# ---------------------------------------------------------------------------
# Construcción de Producto (motor técnico)
# ---------------------------------------------------------------------------
def _color_nombre(n):
    n = (n or "").upper()
    if n.endswith(" NG") or "NEGR" in n: return "negro"
    if n.endswith(" BL") or "BLANC" in n: return "blanco"
    if n.endswith(" GR") or "GRIS" in n: return "gris"
    return None


def _potencia(v):
    """'1 x 35W Max' -> 35 (la potencia real es la de después de la 'x' de multiplicación).
    BUG histórico: split('x') también cortaba la x de 'Max' → quedaba '' → None, así que
    todos los '... Max' venían quedando SIN potencia. La 'x' se busca entre dígitos."""
    s = str(v or "")
    m = re.search(r"\d\s*x\s*(\d+(?:[.,]\d+)?)", s.lower())
    return parse_number(m.group(1)) if m else parse_number(s)


# La taxonomía Leuk (familia/subfamilia) es curada y 100% completa → mejor fuente de
# fijación que la ficha, cuyo "Aplicar" es ambiguo (montaje_canonico lo mapeaba a 'techo'
# incluso para apliques DE PARED como MOLY → contradicción de gating contra el candidato
# correcto). Sólo se mapean los valores inequívocos; el resto cae a ficha → etiqueta visual.
# OJO: "Proyector" NO está en el mapa de subfamilias a propósito — es una FORMA, no un
# montaje (un proyector puede ir en estaca, pared o techo). CHILL es subfamilia Proyector
# pero familia Estacas → su montaje es 'piso', igual que el VK-SPUN contra el que compite.
_SUBFAM_MONTAJE = {"colgante": "suspendido", "empotrable": "embutido", "bolardo": "piso",
                   "estaca": "piso", "pie": "piso", "mesa": "piso", "riel": "riel",
                   "perfil": "perfil"}
_FAM_MONTAJE = {"de pared": "pared", "de piso": "piso", "estacas": "piso", "rieles": "riel",
                "perfiles": "perfil", "de apoyo": "piso"}

def _montaje_leuk(r, tag):
    fam = str(r.get("familia") or "").strip().lower()
    sub = str(r.get("subfamilia") or "").strip().lower()
    # 1º la FAMILIA: es directamente la categoría de montaje (De Pared, Estacas, Rieles…)
    if fam in _FAM_MONTAJE: return _FAM_MONTAJE[fam]
    # 2º la subfamilia, sólo para familias ambiguas (De Techo: Colgante/Empotrable/Aplique…)
    if sub == "aplique":
        if "pared" in fam: return "pared"
        if "techo" in fam: return "techo"
    if sub in _SUBFAM_MONTAJE: return _SUBFAM_MONTAJE[sub]
    return montaje_canonico(r.get("fijacion")) \
        or (montaje_canonico(tag.get("tipo_montaje")) if tag else None)


def producto_leuk(r, tag=None):
    # IP inferido para exteriores: misma regla segura que en competencia.
    ip = r.get("ip") or ("IP44" if "exterior" in str(r.get("vertical") or "").lower() else None)
    cat = categoria_funcional(r.get("nombre"), familia=r.get("familia"),
                              subfamilia=r.get("subfamilia"), lumenes=r.get("lumenes"),
                              tipo_forma=(tag or {}).get("tipo_forma"))
    return Producto.from_raw(
        nombre=r.get("nombre") or r.get("sku") or "s/n", sku=r.get("sku"), marca="Leuk",
        ip=ip, fijacion_tipo=_montaje_leuk(r, tag), categoria=cat,
        potencia_w=_potencia(r.get("potencia_w")), lumenes=r.get("lumenes"),
        eficiencia_luminosa=r.get("eficacia_lmw"), tension_v=r.get("tension"),
        angulo_haz=r.get("angulo"), cri=r.get("cri"), temperatura_color_k=r.get("cct"),
        ugr=r.get("ugr"), garantia_anios=r.get("garantia"), medida=r.get("dimensiones"),
        control=r.get("control"), movimiento=r.get("movimiento"),
        color_artefacto=color_canonico(r.get("color")) or _color_nombre(r.get("nombre")),
        fuente_luz=r.get("fuente_luz"),
    )


FICHA_CAMPOS = ["Fuente de luz", "Potencia (W)", "Lúmenes del sistema", "Eficiencia (lm/W)",
                "Tensión (V)", "Ángulo de haz", "CRI", "Temp. de color (K)", "UGR", "IP",
                "Fijación/montaje", "Medidas", "Movimiento", "Color del artefacto", "Control", "Garantía"]

def producto_desde_ficha(marca, row, etiqueta):
    g = lambda *k: next((limpiar(row.get(x)) for x in k if limpiar(row.get(x)) is not None), None)
    # Fijación: ficha → fallback a la etiqueta VISUAL (tipo_montaje de Claude visión).
    # OJO: en dos pasos — con `montaje_canonico(A or B)`, si A existe pero no mapea a
    # ninguna regla, B no se probaba nunca.
    montaje = montaje_canonico(g("Fijación/montaje")) \
        or (montaje_canonico(etiqueta.get("tipo_montaje")) if etiqueta else None)
    # IP: si falta pero la sección del catálogo es Exterior, el bucket es 'resto' seguro
    # (ningún producto de exterior es IP20). Sólo para el gating; la ficha no se toca.
    ip = g("IP") or ("IP44" if "exterior" in str(g("Sección") or "").lower() else None)
    cat = categoria_funcional(g("Nombre/SKU"), familia=g("Familia"),
                              lumenes=g("Lúmenes del sistema"),
                              tipo_forma=(etiqueta or {}).get("tipo_forma"))
    return Producto.from_raw(
        nombre=g("Nombre/SKU") or "s/n", marca=marca,
        ip=ip, fijacion_tipo=montaje, categoria=cat,
        potencia_w=g("Potencia (W)"), lumenes=g("Lúmenes del sistema"),
        eficiencia_luminosa=g("Eficiencia (lm/W)"), tension_v=g("Tensión (V)"),
        angulo_haz=g("Ángulo de haz"), cri=g("CRI"), temperatura_color_k=g("Temp. de color (K)"),
        ugr=g("UGR"), garantia_anios=g("Garantía"), medida=g("Medidas"),
        control=g("Control"), movimiento=g("Movimiento"),
        color_artefacto=color_canonico(g("Color del artefacto")), fuente_luz=g("Fuente de luz"),
    )


def precio_usd(marca, row):
    if marca in ("Vonderk", "Lucciola"):
        return parse_number(row.get("Precio"))   # ya vienen en USD
    v = parse_number(row.get("Precio ($)"))  # Artelum / WLG en ARS
    return round(v / TC_BLUE, 2) if v else None


# ---------------------------------------------------------------------------
# Señales
# ---------------------------------------------------------------------------
def mejor_prefijo(cand, candidatos):
    if not cand: return None
    best = None
    for s in candidatos:
        if cand == s or cand.startswith(s + "-"):
            if best is None or len(s) > len(best): best = s
    return best


# Sin "color": es atributo de variante (NG/BL/MD), no de identidad. Ver nota en matching.py.
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
        # Excepción: la TÉCNICA sola sobre una ficha flaca no alcanza. Con el gating
        # tri-estado, un driver "matcheaba" una estaca porque potencia y tensión coincidían
        # sobre una comparación de 2-3 atributos (2.671 posibles-basura medidos). Sin otra
        # señal que lo respalde, un match técnico de <4 atributos evaluados no es evidencia.
        if positivas[0] is tec and (tec.get("n_eval") or 9) < 4:
            return "No comparable", score, "nula", 0
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
                    # La misma variante se comparte entre entidades; si la ficha no trae
                    # fijación, se re-construye POR ENTIDAD con su etiqueta visual como
                    # fallback (antes el fallback existía pero siempre llegaba None).
                    e = ents[k]
                    if var["producto"].fijacion_tipo is None and e.get("etiqueta"):
                        e["variantes"].append(dict(var, producto=producto_desde_ficha(marca, row, e["etiqueta"])))
                    else:
                        e["variantes"].append(var)
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
                                "producto": producto_desde_ficha(marca, row, e.get("etiqueta")),
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


def _ent_categoria(ent):
    """Categoría funcional de la ENTIDAD de competencia. Si alguna variante es un componente
    no emisor (driver/riel/perfil/accesorio), esa manda; si no, la primera categoría de
    variante; sin variantes, se infiere del nombre + forma de la etiqueta."""
    cats = [v["producto"].categoria for v in ent["variantes"]
            if v.get("producto") and v["producto"].categoria]
    for c in cats:
        if c in NON_EMIT:
            return c
    if cats:
        return cats[0]
    forma = (ent.get("etiqueta") or {}).get("tipo_forma")
    return categoria_funcional(ent.get("familia"), tipo_forma=forma)


def evaluar(ancla, leuk_vec, leuk_tag, marca, ent, cfg):
    # GATE DE CATEGORÍA (decisivo): corta antes de armar la propuesta. Necesario acá porque
    # las señales de etiqueta/visual se combinan aparte del gate técnico — sin este corte,
    # una TAPA "equivalía" a un spot por acuerdo de forma+imagen. Un driver solo compara con
    # drivers, un riel con rieles, etc. (luminaria y lineal son compatibles entre sí).
    ent_cat = _ent_categoria(ent)
    if not categorias_compatibles(ancla.categoria, ent_cat):
        return None

    # técnico (si la entidad tiene specs de ficha): mejor variante
    tec = None; best_v = None; best_priced_v = None
    if ent["variantes"]:
        best_r = None; best_pr = None
        for v in ent["variantes"]:
            try:
                r = match(ancla, v["producto"], cfg)
            except Exception:
                continue
            if best_r is None or (r.score, r.guardrail_ok) > (best_r.score, best_r.guardrail_ok):
                best_r, best_v = r, v
            # mejor variante CON precio (para no quedarnos sin precio si la ganadora no lo tiene)
            if v.get("precio_usd") is not None and (best_pr is None or (r.score, r.guardrail_ok) > (best_pr.score, best_pr.guardrail_ok)):
                best_pr, best_priced_v = r, v
        if best_r is not None:
            tec = {"nivel": best_r.clasificacion.value, "score": round(best_r.score, 3),
                   "n_eval": sum(1 for d in best_r.detalle if d.sim is not None),
                   "coinciden": [d.label for d in best_r.detalle if d.sim == 1.0],
                   "difieren": [d.label for d in best_r.detalle if d.sim == 0.0]}
    etq = match_etiquetacion(leuk_tag, ent["etiqueta"])
    vis = match_visual(leuk_vec, ent["vis_vec"])
    if not (tec or etq or vis):
        return None
    ver, sc, conf, n = veredicto(tec, etq, vis)
    # precio: el de la variante ganadora; si no tiene, el de la mejor variante con precio de la familia
    precio = best_v["precio_usd"] if best_v else None
    precio_aprox = False
    if precio is None and best_priced_v is not None:
        precio = best_priced_v["precio_usd"]; precio_aprox = True
    if precio is None and ent.get("precio_manual") is not None:
        precio = ent["precio_manual"]; precio_aprox = True
    return {"marca": marca, "familia": ent["familia"], "nombre": (best_v["nombre"] if best_v else None) or ent["familia"],
            "fslug": ent["slug"], "precio_usd": precio, "precio_aprox": precio_aprox,
            "ficha": best_v["ficha"] if best_v else {}, "imagen": ent["img"] or None,
            "etiquetas": {k: ent["etiqueta"][k] for k in ETQ_MOSTRAR if ent["etiqueta"] and ent["etiqueta"].get(k)} if ent["etiqueta"] else None,
            "match": {"tecnico": tec, "etiquetacion": etq, "visual": vis, "veredicto": ver, "score": sc, "confianza": conf, "n_senales": n}}


def _pos(leuk_usd, comp_usd):
    if leuk_usd is None or comp_usd is None: return None, None
    d = round((comp_usd - leuk_usd) / leuk_usd * 100, 1)
    return d, ("Leuk más barato" if d > 3 else "Leuk más caro" if d < -3 else "Precio similar")


# ---------------------------------------------------------------------------
# Ensamblado
# ---------------------------------------------------------------------------
ORDEN = {"Equivalente": 0, "Comparable parcial": 1, "Posible": 2, "No comparable": 3, "Sin datos": 4}
CONF_ORDEN = {"alta": 0, "baja": 1, "nula": 2}

def main():
    log(f"=== BUILD {datetime.now().isoformat(timespec='seconds')} ===")
    leuk = cargar_leuk()
    fichas = cargar_fichas()
    etiquetas = cargar_dict_excel(P.ETIQUETAS, "Etiquetas_Forma")
    # sumar etiquetas nuevas de WLG (catálogo)
    wlg_etq_p = P.ROOT / "pipeline/wlg_etiquetas.json"
    wlg_fam_p = P.ROOT / "pipeline/wlg_families.json"
    wlg_etq = json.loads(wlg_etq_p.read_text()) if wlg_etq_p.exists() else {}
    wlg_fam = json.loads(wlg_fam_p.read_text()) if wlg_fam_p.exists() else {}
    etiquetas.setdefault("World Leds Go", {})
    for s, e in wlg_etq.items():
        etiquetas["World Leds Go"][s] = e
    log(f"WLG extra: {len(wlg_etq)} etiquetas · {len(wlg_fam)} familias con foto")
    # Lucciola: etiquetas de forma generadas con Claude visión sobre la foto de cada familia
    # (lucciola_tag.py). Es la 2ª señal — sin ella queda sólo la técnica y la regla de acuerdo,
    # que exige dos, manda todo a "posible".
    luc_etq_p = P.ROOT / "pipeline/lucciola_etiquetas.json"
    luc_etq = json.loads(luc_etq_p.read_text()) if luc_etq_p.exists() else {}
    luc_fam_p0 = P.ROOT / "pipeline/lucciola_families.json"
    luc_ok0 = set(json.loads(luc_fam_p0.read_text())) if luc_fam_p0.exists() else set()
    etiquetas.setdefault("Lucciola", {})
    n_etq = 0
    for s_, e in luc_etq.items():
        if s_ in luc_ok0:                       # sólo familias APROBADAS en la app
            etiquetas["Lucciola"][s_] = e; n_etq += 1
    log(f"Lucciola: {n_etq} familias etiquetadas y aprobadas (de {len(luc_etq)} etiquetadas)")

    indices = cargar_indices()
    manifest, leuk_tags, leuk_emb, comp_vecs = cargar_artefactos_leuk()
    leuk_emb, n_grp, n_sku = unificar_vecs_por_color(leuk, leuk_emb)
    leuk_tags, n_tag = unificar_tags_por_color(leuk, leuk_tags)
    log(f"Variantes de color unificadas: {n_grp} productos base · {n_sku} SKU comparten vector visual · {n_tag} SKU heredan la etiqueta más confiable")
    universo = build_universe(fichas, etiquetas, indices, comp_vecs)
    # enriquecer entidades WLG nuevas con nombre lindo + foto bundleada
    for s, info in wlg_fam.items():
        ent = universo["World Leds Go"].get(s)
        if ent:
            if info.get("nombre"): ent["familia"] = info["nombre"]
            if info.get("img"): ent["img"] = info["img"]
    # Lucciola: la foto de cada familia sale del bucket público catalogo-img (la URL ya está
    # en la columna `imagen` de competencia_extra; lucciola_build.py la bajó por familia).
    luc_fam_p = P.ROOT / "pipeline/lucciola_families.json"
    luc_fam = json.loads(luc_fam_p.read_text()) if luc_fam_p.exists() else {}
    luc_hit = 0
    for s_, info in luc_fam.items():
        ent = universo["Lucciola"].get(s_)
        if ent:
            if info.get("nombre"): ent["familia"] = info["nombre"]
            if info.get("img"): ent["img"] = info["img"]; luc_hit += 1
    if luc_fam:
        log(f"Lucciola: {luc_hit}/{len(luc_fam)} familias con foto")

    # Artelum: fotos de producto locales bundleadas (las URLs del índice son intranet y no cargan)
    art_fam_p = P.ROOT / "pipeline/artelum_families.json"
    art_fam = json.loads(art_fam_p.read_text()) if art_fam_p.exists() else {}
    art_hit = 0
    for s, info in art_fam.items():
        ent = universo["Artelum"].get(s)
        if ent and info.get("img"):
            ent["img"] = info["img"]; art_hit += 1
    # Reconciliación MANUAL de precio Artelum: familias que no enganchan por nombre
    # (palabras-freno "line"/"embutir"/"de") pero cuyo precio SÍ está en la ficha.
    # Mapeo curado (entidad id → familia exacta de la ficha, base sin IP54/DALI).
    ART_PRECIO_MANUAL = {
        "743": "SUSPENDER LINE XS", "673": "LINE EMBUTIR", "536": "LINE APLICAR",
        "690": "MINI LINE EMBUTIR", "592": "MINILINE APLICAR", "682": "TORTUGA LED",
        "714": "ECO ABS SIMPLE", "669": "PANEL LED EMBUTIR",
        # 2ª tanda (categoría confiable): apliques ICE, plafones→panel de superficie, rieles
        "715": "ICE SIMPLE", "670": "PANEL LED APLICAR", "671": "PANEL LED APLICAR",
        "548": "RIEL 1MT 3EF",
    }
    dfa = fichas.get("Artelum")
    art_manual = 0
    if dfa is not None and len(dfa):
        for fslug, fam in ART_PRECIO_MANUAL.items():
            ent = universo["Artelum"].get(fslug)
            if not ent or ent["variantes"]:
                continue
            rows = dfa[dfa.get("Familia").astype(str).str.strip() == fam]
            for _, row in rows.iterrows():
                ent["variantes"].append({
                    "producto": producto_desde_ficha("Artelum", row, ent.get("etiqueta")),
                    "precio_usd": precio_usd("Artelum", row),
                    "nombre": limpiar(row.get("Nombre/SKU")),
                    "ficha": {c: limpiar(row.get(c)) for c in FICHA_CAMPOS if limpiar(row.get(c))},
                })
            if ent["variantes"]:
                art_manual += 1
    log(f"Artelum precio manual: {art_manual}/{len(ART_PRECIO_MANUAL)} familias enganchadas")
    # Precio manual Vonderk: familias que están en la lista de precios N49 pero cuya entidad
    # no tiene ficha (se extrajo el precio base del PDF y se mapeó a mano, verificado).
    von_man_p = P.ROOT / "pipeline/vonderk_precio_manual.json"
    if von_man_p.exists():
        von_man = json.loads(von_man_p.read_text())
        n = 0
        for fslug, precio in von_man.items():
            ent = universo["Vonderk"].get(fslug)
            if ent and not ent["variantes"]:
                ent["precio_manual"] = precio; n += 1
        log(f"Vonderk precio manual: {n}/{len(von_man)} entidades")
    # Precio manual WLG: modelos de la lista n29 (curados) para entidades sin ficha.
    wlg_man_p = P.ROOT / "pipeline/wlg_precio_manual.json"
    if wlg_man_p.exists():
        wlg_man = json.loads(wlg_man_p.read_text())
        n = 0
        for fslug, precio in wlg_man.items():
            ent = universo["World Leds Go"].get(fslug)
            if ent and not ent["variantes"]:
                ent["precio_manual"] = precio; n += 1
        log(f"WLG precio manual: {n}/{len(wlg_man)} entidades")
    # Leuk: fotos locales bundleadas (SKU cuyas fotos no están en el Drive público)
    leuk_local_p = P.ROOT / "pipeline/leuk_local_families.json"
    leuk_local = json.loads(leuk_local_p.read_text()) if leuk_local_p.exists() else {}
    log(f"Leuk fotos locales: {len(leuk_local)} SKU servidos desde el repo")
    log(f"Artelum fotos locales: {len(art_fam)} bundleadas · {art_hit} enganchadas a entidad")

    cfg = MatchConfig()
    no_pares, no_ents, no_motivos = cargar_descartes()
    if no_pares or no_ents:
        det = " · ".join(f"{m}: {n}" for m, n in sorted(no_motivos.items(), key=lambda x: -x[1]))
        log(f"Descartes del equipo: {len(no_pares)} pares + {len(no_ents)} productos fuera de todo ({det})")
    n_filtrados = 0
    productos = []
    for sku, r in leuk.items():
        ancla = producto_leuk(r, leuk_tags.get(sku))
        lvec = leuk_emb.get(sku); ltag = leuk_tags.get(sku)
        props = []
        for marca in MARCAS:
            for eslug, ent in universo[marca].items():
                if (marca, eslug) in no_ents or (marca, ent.get("slug")) in no_ents:
                    continue                       # producto descartado de todo el benchmark
                p = evaluar(ancla, lvec, ltag, marca, ent, cfg)
                if p:
                    if (str(sku), marca, p["fslug"]) in no_pares:
                        n_filtrados += 1           # par que el equipo marcó como no comparable
                        continue
                    props.append(p)
        # ranking global: confianza → nivel → score → desempate por ficha
        props.sort(key=lambda p: (CONF_ORDEN.get(p["match"]["confianza"], 9),
                                  ORDEN.get(p["match"]["veredicto"], 9), -p["match"]["score"])
                                 + _desempate_ficha(p))
        leuk_usd = r.get("precio_usd")                 # lista
        leuk_neto = neto(leuk_usd, LEUK_DESC)          # neto (lo que se paga)
        for p in props:
            comp_lista = p.pop("precio_usd")
            desc = DESC.get(p["marca"], 0.0)
            comp_neto = neto(comp_lista, desc)
            d, pos = _pos(leuk_neto, comp_neto)        # diferencia sobre NETO
            d_lista, _ = _pos(leuk_usd, comp_lista)
            p["diferencia_pct"] = d; p["posicion_precio"] = pos; p["diferencia_lista"] = d_lista
            p["precio"] = {"usd": comp_lista, "neto": comp_neto, "desc": desc}
        # mejor de cada marca = mejor equivalencia CONFIABLE (≥2 señales). Si no hay, null.
        mejor = {}
        for marca in MARCAS:
            cand = [p for p in props if p["marca"] == marca and p["match"]["confianza"] == "alta"
                    and p["match"]["veredicto"] in ("Equivalente", "Comparable parcial")]
            mejor[marca] = cand[0] if cand else None
        # propuestas confiables (≥2 señales) y "posibles" (1 sola señal, a revisar), separadas
        top = [p for p in props if p["match"]["confianza"] == "alta"
               and p["match"]["veredicto"] in ("Equivalente", "Comparable parcial")][:20]
        posibles = [p for p in props if p["match"]["confianza"] == "baja"][:15]
        productos.append({
            "sku": sku, "nombre": limpiar(r.get("nombre")), "vertical": limpiar(r.get("vertical")),
            "familia": limpiar(r.get("familia")), "subfamilia": limpiar(r.get("subfamilia")),
            "precio_usd": leuk_usd, "precio_neto": leuk_neto, "descuento": LEUK_DESC,
            # 1º set curado de fichas (PNG transparente, escala pareja); si no, foto local
            # del benchmark; si no, lh3 (CDN de Google) del Drive.
            "imagen": (f"assets/ficha/fotos/{sku}.png"
                       if (P.ROOT / "app" / "assets" / "ficha" / "fotos" / f"{sku}.png").exists()
                       else leuk_local.get(sku) or (
                           f"https://lh3.googleusercontent.com/d/{manifest[sku]}=w900" if manifest.get(sku) else None)),
            "ficha": {k: limpiar(v) for k, v in {
                "Vertical": r.get("vertical"), "Familia": r.get("familia"), "Subfamilia": r.get("subfamilia"),
                "Fuente de luz": r.get("fuente_luz"), "Potencia (W)": r.get("potencia_w"),
                "Lúmenes": r.get("lumenes"), "Eficiencia (lm/W)": r.get("eficacia_lmw"), "Tensión (V)": r.get("tension"),
                "CRI": r.get("cri"), "Temp. de color (K)": r.get("cct"), "Ángulo de haz": r.get("angulo"),
                "IP": r.get("ip"), "UGR": r.get("ugr"), "Fijación": r.get("fijacion"), "Control": r.get("control"),
                "Movimiento": r.get("movimiento"), "Medidas": r.get("dimensiones"),
                "Color del artefacto": r.get("color"), "Garantía": r.get("garantia"),
            }.items() if limpiar(v) is not None},
            "etiquetas": ltag,
            "mejor_por_marca": mejor,
            "propuestas": top,
            "n_propuestas": len(top),
            "posibles": posibles,
            "n_posibles": len(posibles),
        })

    # --- productos Leuk parecidos (base de la señal de recomendación) ---
    emb_skus = [p["sku"] for p in productos if p["sku"] in leuk_emb]
    if emb_skus:
        M = np.array([leuk_emb[s] for s in emb_skus], dtype="float32")
        S = M @ M.T
        idx_of = {s: i for i, s in enumerate(emb_skus)}
        for p in productos:
            i = idx_of.get(p["sku"])
            if i is None:
                p["similares"] = []; continue
            sim = []
            for j in np.argsort(-S[i]):
                if emb_skus[j] == p["sku"]:
                    continue
                if S[i][j] < 0.80:
                    break
                sim.append(emb_skus[j])
                if len(sim) >= 8:
                    break
            p["similares"] = sim
    else:
        for p in productos:
            p["similares"] = []

    # --- catálogo plano de competencia (para el buscador de "sugerir a mano") ---
    catalogo = []
    for marca in MARCAS:
        for eslug, ent in universo[marca].items():
            v0 = ent["variantes"][0] if ent["variantes"] else None
            # precio: preferir una variante que tenga precio (no la primera si viene sin precio)
            _vp = next((v for v in ent["variantes"] if v.get("precio_usd") is not None), None) if ent["variantes"] else None
            _plista = (_vp or v0 or {}).get("precio_usd") if (v0 or _vp) else None
            catalogo.append({
                "marca": marca, "fslug": eslug, "familia": ent["familia"],
                "nombre": (v0["nombre"] if v0 else None) or ent["familia"],
                "imagen": ent["img"] or None, "precio_usd": _plista,
                "precio_neto": neto(_plista, DESC.get(marca, 0.0)), "desc": DESC.get(marca, 0.0),
                "ficha": v0["ficha"] if v0 else {},
                "etiquetas": {k: ent["etiqueta"][k] for k in ETQ_MOSTRAR if ent["etiqueta"] and ent["etiqueta"].get(k)} if ent["etiqueta"] else None,
            })

    if no_pares or no_ents:
        log(f"Descartes aplicados: {n_filtrados} propuesta(s) no se generaron")
    con_prop = sum(1 for p in productos if p["propuestas"])
    salida = {
        "meta": {"generado": datetime.now().isoformat(timespec="seconds"),
                 "n_productos_leuk": len(productos), "n_con_propuesta": con_prop,
                 "competidores": MARCAS, "tc_blue": TC_BLUE,
                 "cobertura_imagenes": len(manifest), "cobertura_etiquetas": len(leuk_tags),
                 "n_competencia": len(catalogo), "descuentos": DESC, "leuk_desc": LEUK_DESC},
        "productos": productos,
        "competencia": catalogo,
    }
    P.OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(salida, ensure_ascii=False)
    P.OUT_JSON.write_text(payload)
    (P.ROOT / "app").mkdir(parents=True, exist_ok=True)
    (P.ROOT / "app/data.js").write_text("window.BENCHMARK = " + payload + ";")
    log(f"Productos: {len(productos)} · con propuesta comparable: {con_prop}")
    log(f"JSON {P.OUT_JSON.stat().st_size // 1024} KB")
    P.BUILD_LOG.write_text("\n".join(LOG))


if __name__ == "__main__":
    main()
