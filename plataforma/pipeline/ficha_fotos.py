#!/usr/bin/env python3
"""
ficha_fotos.py — Trae las fotos PNG de producto (fondo transparente, escala pareja,
nombradas por SKU) desde LA carpeta de Drive de diseño, y las deja redimensionadas para web
en app/assets/ficha/fotos/<SKU>.png. fichas_build.py las usa como foto principal.

Fuente única (no usar otra):
  https://drive.google.com/drive/folders/1OmHlMZ4sMK5890tNkRoeMoNZVgU15JLD
En esa carpeta conviven:
  · el ZIP "Fotos Leuk + Laftdren.zip" (el set completo; se busca por nombre, así que si
    diseño lo reemplaza por uno nuevo se toma solo, aunque cambie el ID del archivo)
  · PNG sueltos ("7239FotoProducto0.png"): altas y correcciones. Le GANAN al ZIP.

Un archivo puede llevar varias SKU ("6742-6743-7303-7304FotoProducto0.png"): vale para todas.

Es incremental: recuerda de qué archivo salió cada foto (ficha_fotos_estado.json) y sólo
baja/reescribe lo que cambió. El ZIP (~450 MB) se baja una sola vez por versión.
Corre solo dentro de actualizar_fichas.sh; también se puede correr a mano:
  cd ~/leuk-benchmark/pipeline && python3 ficha_fotos.py
"""
import io
import json
import re
import sys
import tempfile
import time
import zipfile
from pathlib import Path

import gdown
from PIL import Image

import paths as P

FOLDER_ID = "1OmHlMZ4sMK5890tNkRoeMoNZVgU15JLD"
ZIP_NOMBRE = "fotos leuk + laftdren"          # el ZIP del set completo (sin distinguir mayúsculas)
DEST = P.ROOT / "app" / "assets" / "ficha" / "fotos"
CACHE_DIR = P.ROOT / "pipeline"
ESTADO = P.ROOT / "pipeline" / "ficha_fotos_estado.json"
MAXW = 900   # ancho máximo para web


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


def skus_de(nombre):
    """SKU del prefijo del nombre: '6742-6743-7303FotoProducto0.png' → ['6742','6743','7303']."""
    m = re.match(r"(\d+(?:-\d+)*)", nombre)
    return m.group(1).split("-") if m else []


def prioridad(nombre, sku):
    """Mayor = mejor. La foto principal es la '…Producto0' o la que se llama igual que la SKU."""
    low = nombre.lower()
    return 1 if ("producto0" in low or low == sku + ".png") else 0


def listar(fid, intentos=3):
    for i in range(intentos):
        try:
            return gdown.download_folder(id=fid, skip_download=True, quiet=True, use_cookies=False) or []
        except Exception as e:
            print(f"  ⚠ intento {i+1} falló ({str(e)[:70]}…)", flush=True)
            time.sleep(8 * (i + 1))
    return []


def guardar(fh, sku):
    im = Image.open(fh).convert("RGBA")
    if im.width > MAXW:
        im = im.resize((MAXW, round(im.height * MAXW / im.width)), Image.LANCZOS)
    im.save(DEST / f"{sku}.png", optimize=True)


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    archivos = listar(FOLDER_ID)
    if not archivos:
        print("⛔ No pude listar la carpeta de fotos de Drive (¿sigue pública por link?).")
        sys.exit(1)

    skus = catalog_skus()
    estado = json.loads(ESTADO.read_text()) if ESTADO.exists() else {}

    # 1) PNG sueltos de la carpeta (sólo el primer nivel: los de subcarpetas no cuentan)
    elegido = {}   # sku -> (origen, prioridad) ; origen = ("png", id, nombre) | ("zip", zip_id, nombre)
    zip_file = None
    for f in archivos:
        if "/" in f.path.strip("/"):
            continue
        nombre = f.path.strip("/")
        low = nombre.lower()
        if low.endswith(".zip") and ZIP_NOMBRE in low:
            zip_file = f
        elif low.endswith(".png"):
            for s in skus_de(nombre):
                if s in skus:
                    pr = prioridad(nombre, s)
                    if s not in elegido or (elegido[s][0][0] == "png" and pr > elegido[s][1]):
                        elegido[s] = (("png", f.id, nombre), pr)
    sueltos = len(elegido)

    # 2) ZIP: completa las SKU que no tienen PNG suelto. Se baja una vez por versión (ID).
    z = None
    if zip_file is None:
        print("  (aviso) no encontré el ZIP «Fotos Leuk + Laftdren» en la carpeta; sólo PNG sueltos.")
    else:
        cache = CACHE_DIR / f"_fotos_zip_{zip_file.id}.zip"
        if not cache.exists():
            for viejo in CACHE_DIR.glob("_fotos_zip*.zip"):
                viejo.unlink()
            print(f"Bajando {zip_file.path} (versión nueva, ~450 MB)…", flush=True)
            gdown.download(id=zip_file.id, output=str(cache), quiet=False)
        z = zipfile.ZipFile(cache)
        for name in z.namelist():
            base = name.rsplit("/", 1)[-1]
            if not base.lower().endswith(".png"):
                continue
            for s in skus_de(base):
                if s not in skus:
                    continue
                pr = prioridad(base, s)
                if s not in elegido or (elegido[s][0][0] == "zip" and pr > elegido[s][1]):
                    elegido[s] = (("zip", zip_file.id, name), pr)

    # 3) escribir sólo lo que cambió de origen (o falta el PNG)
    nuevas, cache_png = 0, {}
    with tempfile.TemporaryDirectory() as tmp:
        for s, ((tipo, fid, nombre), _) in sorted(elegido.items()):
            clave = f"{tipo}:{fid}:{nombre}"
            if estado.get(s) == clave and (DEST / f"{s}.png").exists():
                continue
            try:
                if tipo == "png":
                    if fid not in cache_png:
                        out = Path(tmp) / f"{fid}.png"
                        gdown.download(id=fid, output=str(out), quiet=True)
                        cache_png[fid] = out.read_bytes()
                    guardar(io.BytesIO(cache_png[fid]), s)
                else:
                    with z.open(nombre) as fh:
                        guardar(fh, s)
                estado[s] = clave
                nuevas += 1
            except Exception as e:
                print(f"  (aviso) {s}: {str(e)[:60]}")

    ESTADO.write_text(json.dumps(estado, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    faltan = sorted(skus - set(elegido))
    print(f"✓ Fotos: {len(elegido)} SKU con foto ({sueltos} por PNG suelto) · {nuevas} nuevas/actualizadas."
          f" Sin foto en la carpeta: {len(faltan)}")
    if faltan:
        print("  faltan:", " ".join(faltan[:40]) + (" …" if len(faltan) > 40 else ""))


if __name__ == "__main__":
    main()
