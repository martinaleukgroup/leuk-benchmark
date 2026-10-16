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

    try:
        estado = json.loads(ESTADO.read_text())
    except Exception:
        estado = {}

    skus = catalog_skus()
    pendientes = []
    for sku in sorted(skus & set(elegida)):
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
