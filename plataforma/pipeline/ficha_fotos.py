#!/usr/bin/env python3
"""
ficha_fotos.py — Trae las fotos de producto desde la carpeta de Drive de diseño y las deja
redimensionadas para web en app/assets/ficha/fotos/<SKU>.png. fichas_build.py las usa como
foto principal de cada ficha.

La carpeta es LA fuente de las fotos (pedido de la usuaria, 13/10/2026): lo que se sube o se
reemplaza ahí entra solo. Corre en cada actualizar_fichas.sh y baja SÓLO lo nuevo o cambiado:
compara cada archivo (id + fecha de modificación que muestra Drive) contra lo que bajó la
última vez, anotado en pipeline/ficha_fotos_estado.json.

  · Los archivos se nombran por SKU ("4169FotoProducto0.png", "7279.png"). Si hay varios de la
    misma SKU gana la toma principal; los "detalle" y las "copia" quedan últimos.
  · Los ZIP de la carpeta se ignoran (antes las fotos salían de uno, importado a mano).
  · Se bajan TODAS las SKU de la carpeta, no sólo las del catálogo: el Stock diario también las
    usa (pedido de la usuaria, 16/10/2026: el Stock saca las fotos siempre de esta carpeta).
  · Deja app/assets/ficha/fotos/indice.json = {SKU: versión}: el Stock lo lee para saber qué
    fotos hay y romper la caché cuando una cambia.
  · Una foto que se borra de la carpeta NO se borra de la app.
  · Si Drive no contesta o corta a mitad de camino, lo que falta se baja en la próxima corrida.

Carpeta:  https://drive.google.com/drive/folders/1OmHlMZ4sMK5890tNkRoeMoNZVgU15JLD
Uso:      cd ~/leuk-benchmark/pipeline && python3 ficha_fotos.py        (--todo: vuelve a bajar todas)
"""
import hashlib
import html
import io
import json
import re
import sys
import time
from datetime import date

import requests
from PIL import Image

import paths as P

FOLDER_ID = "1OmHlMZ4sMK5890tNkRoeMoNZVgU15JLD"
# Árbol de productos de diseño (Interior/Exterior/… /<PRODUCTO>/Fotos/…). Desde el 17/11/2026 las
# fotos de los productos Nuevo están ahí, nombradas con varias SKU ("7428-7430FotoProducto0.png").
# Se usan sólo para las SKU que NO tienen foto en la carpeta única de arriba (esa manda).
ARBOL_ID = "1EeWcZw0jQDyfpOX_cLQWfxZhfin_aDT_"
ARBOL_SALTEAR = re.compile(r"^(archivo cad|archivo ldt|ficha t|reemplazad|manual)", re.I)
DEST = P.ROOT / "app" / "assets" / "ficha" / "fotos"
ESTADO = P.ROOT / "pipeline" / "ficha_fotos_estado.json"
MAXW = 900          # ancho máximo para web
PAUSA = 1.2         # segundos entre bajadas: Drive frena las ráfagas (cortó a las ~60 seguidas)
ESPERAS = [45, 90, 180]   # si igual frena: esperar y reintentar la misma foto
CORTE_FALLAS = 4    # tantas fotos fallidas seguidas (ya con sus esperas): se sigue en la próxima corrida
MESES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _load_js(path):
    txt = path.read_text()
    return json.loads(txt.split("=", 1)[1].rstrip().rstrip(";"))


def catalog_skus():
    """SKU que necesitan foto: las de las fichas (representativa + variantes) + las de los
    productos del benchmark (data.js). Así el set cubre las dos vistas de la app."""
    skus = set()
    fichas = _load_js(P.ROOT / "app" / "fichas-data.js")
    for f in fichas:
        if f.get("sku"):
            skus.add(str(f["sku"]))
        for s in (f.get("skus") or []):
            skus.add(str(s))
    try:
        bench = _load_js(P.ROOT / "app" / "data.js")
        for p in bench.get("productos", []):
            if p.get("sku"):
                skus.add(str(p["sku"]))
    except Exception as e:
        print("  (aviso) no pude leer data.js del benchmark:", e)
    return skus


def listar(intentos=3):
    """[(id, nombre, modificado)] de la carpeta pública. La vista embebida trae todo en una sola
    página, con la fecha de modificación de cada archivo (gdown la descarta)."""
    url = f"https://drive.google.com/embeddedfolderview?id={FOLDER_ID}"
    for i in range(intentos):
        try:
            r = requests.get(url, timeout=60, headers={"Accept-Language": "en-US"})
            r.raise_for_status()
            out = re.findall(
                r'id="entry-([-\w]{25,})".*?flip-entry-title">([^<]*)<.*?flip-entry-last-modified"><div>([^<]*)<',
                r.text, re.S)
            if out:
                return [(fid, html.unescape(n), html.unescape(m).strip()) for fid, n, m in out]
            raise RuntimeError("la carpeta vino sin archivos")
        except Exception as e:
            print(f"  ⚠ intento {i+1} falló ({str(e)[:70]}…)", flush=True)
            time.sleep(8 * (i + 1))
    return []


def _entradas(fid):
    """[(id, nombre, modificado, es_carpeta)] de una carpeta pública (vista embebida)."""
    r = requests.get(f"https://drive.google.com/embeddedfolderview?id={fid}", timeout=30,
                     headers={"Accept-Language": "en-US"})
    r.raise_for_status()
    out = re.findall(
        r'id="entry-([-\w]{25,})".*?href="([^"]*)".*?flip-entry-title">([^<]*)<.*?flip-entry-last-modified"><div>([^<]*)<',
        r.text, re.S)
    return [(i, html.unescape(n), html.unescape(m).strip(), "/folders/" in h) for i, h, n, m in out]


def listar_arbol(hilos=12, tope_seg=900):
    """Fotos de producto del árbol de diseño: archivos dentro de carpetas "Fotos" (a cualquier
    profundidad). Lee las carpetas en paralelo y con un tope de tiempo; si algo falla, devuelve
    lo que alcanzó a leer: nunca corta la corrida."""
    from concurrent.futures import ThreadPoolExecutor, FIRST_COMPLETED, wait
    inicio = time.time()
    fotos, vistas, fallas = [], 0, 0
    with ThreadPoolExecutor(max_workers=hilos) as ex:
        vivos = {ex.submit(_entradas, ARBOL_ID): ("", 0)}
        while vivos:
            listos, _ = wait(vivos, timeout=60, return_when=FIRST_COMPLETED)
            for fut in listos:
                ruta, prof = vivos.pop(fut)
                try:
                    ents = fut.result()
                except Exception:
                    fallas += 1
                    continue
                vistas += 1
                for i, nombre, mod, carpeta in ents:
                    if carpeta:
                        if prof < 8 and not ARBOL_SALTEAR.match(nombre) and time.time() - inicio < tope_seg:
                            vivos[ex.submit(_entradas, i)] = (f"{ruta}/{nombre}", prof + 1)
                    elif "/fotos" in ruta.lower():
                        fotos.append((i, nombre, mod))
            if time.time() - inicio > tope_seg + 120:
                print("  ⚠ árbol de fotos: se pasó del tiempo; sigo con lo leído.", flush=True)
                for f in vivos:
                    f.cancel()
                break
    print(f"  árbol de fotos: {vistas} carpetas ({fallas} sin leer) · {len(fotos)} archivos en carpetas Fotos"
          f" · {time.time() - inicio:.0f}s", flush=True)
    return fotos


def skus_del_nombre(low):
    """'7428-7430fotoproducto0.png' → ['7428', '7430']; '4169fotoproducto0.png' → ['4169']."""
    m = re.match(r"(\d{4,}(?:\s*-\s*\d{4,})*)", low)
    return re.findall(r"\d{4,}", m.group(1)) if m else []


def puntaje(low):
    """Cuál elegir cuando hay varias fotos de la misma SKU."""
    if "copia" in low:
        return 0
    if "detalle" in low:
        return 1
    if re.fullmatch(r"\d+\.\w+", low) or re.search(r"producto\s*0?\.\w+$", low):
        return 3
    return 2


def firma_fecha(mod):
    """Lo modificado hoy Drive lo muestra como hora ("10:32 AM"): se anota como la fecha de hoy
    para que mañana, cuando pase a mostrar "Oct 13", no parezca un cambio nuevo."""
    if ":" in mod:
        hoy = date.today()
        return f"{MESES[hoy.month - 1]} {hoy.day}"
    return mod


def bajar(fid):
    """Bytes de la imagen. Cuando Drive frena no devuelve un error sino una página HTML: por
    eso se mira el tipo de contenido, y se espera antes de reintentar."""
    url = f"https://drive.usercontent.google.com/download?id={fid}&export=download"
    ultimo = ""
    for espera in [0] + ESPERAS:
        if espera:
            print(f"    Drive frenó ({ultimo}); espero {espera}s…", flush=True)
            time.sleep(espera)
        try:
            r = requests.get(url, timeout=60)
            if r.status_code == 200 and r.headers.get("Content-Type", "").startswith("image/"):
                return r.content
            ultimo = f"{r.status_code} {r.headers.get('Content-Type', '')[:20]}"
            if r.status_code == 404:
                break
        except Exception as e:
            ultimo = str(e)[:40]
    raise RuntimeError(f"Drive no entregó el archivo ({ultimo})")


def guardar(estado):
    ESTADO.write_text(json.dumps(estado, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    indice = {sku: e.get("v", "") for sku, e in estado.items() if (DEST / f"{sku}.png").exists()}
    (DEST / "indice.json").write_text(json.dumps(indice, sort_keys=True, separators=(",", ":")), encoding="utf-8")


def main():
    todo = "--todo" in sys.argv
    DEST.mkdir(parents=True, exist_ok=True)
    archivos = listar()
    if not archivos:
        print("⛔ no pude listar la carpeta de fotos. Quedan las que ya estaban.")
        sys.exit(1)

    # una foto por SKU
    elegida = {}
    for fid, nombre, mod in archivos:
        low = nombre.lower()
        m = re.match(r"(\d{3,})", low)
        if not m or not low.endswith((".png", ".jpg", ".jpeg", ".webp")):
            continue
        sku, pts = m.group(1), puntaje(low)
        if sku not in elegida or pts > elegida[sku]["pts"]:
            elegida[sku] = {"id": fid, "nombre": nombre, "mod": firma_fecha(mod), "pts": pts}

    # SKU sin foto en la carpeta única: buscarlas en el árbol de diseño (productos Nuevo).
    extra = {}
    try:
        for fid, nombre, mod in listar_arbol():
            low = nombre.lower()
            if "fotoproducto" not in low.replace(" ", "") or not low.endswith((".png", ".jpg", ".jpeg", ".webp")):
                continue
            pts = puntaje(re.sub(r"^[\d\s-]+", "0", low))
            for sku in skus_del_nombre(low):
                if sku in elegida:
                    continue
                if sku not in extra or pts > extra[sku]["pts"] or (pts == extra[sku]["pts"] and nombre < extra[sku]["nombre"]):
                    extra[sku] = {"id": fid, "nombre": nombre, "mod": firma_fecha(mod), "pts": pts}
    except Exception as e:
        print(f"  ⚠ árbol de fotos: {str(e)[:80]}. Sigo sólo con la carpeta única.", flush=True)
    if extra:
        print(f"  árbol de fotos: {len(extra)} SKU nuevas con foto (no estaban en la carpeta única)", flush=True)
    elegida.update(extra)

    try:
        estado = json.loads(ESTADO.read_text())
    except Exception:
        estado = {}

    skus = catalog_skus()
    pendientes = []
    for sku in sorted(elegida):
        e, ant = elegida[sku], estado.get(sku) or {}
        if todo or ant.get("id") != e["id"] or ant.get("mod") != e["mod"] or not (DEST / f"{sku}.png").exists():
            pendientes.append(sku)
    print(f"carpeta: {len(archivos)} archivos · {len(elegida)} SKU con foto · a bajar: {len(pendientes)}", flush=True)

    nuevas, cambiadas, seguidas = [], [], 0
    for n, sku in enumerate(pendientes, 1):
        e = elegida[sku]
        existia = (DEST / f"{sku}.png").exists()
        try:
            im = Image.open(io.BytesIO(bajar(e["id"]))).convert("RGBA")
            if im.width > MAXW:
                im = im.resize((MAXW, round(im.height * MAXW / im.width)), Image.LANCZOS)
            im.save(DEST / f"{sku}.png", optimize=True)
            estado[sku] = {"id": e["id"], "mod": e["mod"], "nombre": e["nombre"],
                           "v": hashlib.md5(f'{e["id"]}|{e["mod"]}'.encode()).hexdigest()[:6]}
            (cambiadas if existia else nuevas).append(sku)
            seguidas = 0
        except Exception as ex:
            seguidas += 1
            print(f"  (aviso) {sku} «{e['nombre']}»: {' '.join(str(ex).split())[:70]}", flush=True)
            if seguidas >= CORTE_FALLAS:
                print(f"  ⚠ {seguidas} fotos fallidas seguidas: Drive está frenando. Lo que falta queda para la próxima corrida.", flush=True)
                break
        if n % 25 == 0:      # guardar seguido: si se corta, no se vuelve a bajar lo que ya está
            guardar(estado)
            print(f"  … {n}/{len(pendientes)}", flush=True)
        time.sleep(PAUSA)

    guardar(estado)

    faltan = sorted(skus - set(elegida))
    quedan = len(pendientes) - len(nuevas) - len(cambiadas)
    print(f"✓ Fotos: {len(nuevas)} nuevas · {len(cambiadas)} actualizadas · {quedan} sin bajar todavía. "
          f"SKU del catálogo sin foto en la carpeta: {len(faltan)}")
    if nuevas:
        print("  nuevas:", " ".join(nuevas[:40]) + (" …" if len(nuevas) > 40 else ""))
    if cambiadas and len(cambiadas) <= 40:
        print("  actualizadas:", " ".join(cambiadas))
    if faltan:
        print("  faltan en la carpeta:", " ".join(faltan[:40]) + (" …" if len(faltan) > 40 else ""))


if __name__ == "__main__":
    main()
