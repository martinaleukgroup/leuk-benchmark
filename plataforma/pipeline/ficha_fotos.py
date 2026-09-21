#!/usr/bin/env python3
"""
ficha_fotos.py — Importa el set de fotos PNG (fondo transparente, escala pareja, nombradas
por SKU) desde el ZIP "fotos leuk + laftdren" de la carpeta de Drive de diseño, y las deja
redimensionadas para web en app/assets/ficha/fotos/<SKU>.png. fichas_build.py las usa como
foto principal cuando existe el PNG de alguna variante de la ficha.

NO corre en cada pipeline: las fotos quedan commiteadas como assets fijos. Corré este script
solo cuando diseño actualice el ZIP (nuevas fotos / correcciones).

Carpeta:  https://drive.google.com/drive/folders/1OmHlMZ4sMK5890tNkRoeMoNZVgU15JLD
Uso:      cd ~/leuk-benchmark/pipeline && python3 ficha_fotos.py
"""
import json
import re
import zipfile
from pathlib import Path

import gdown
from PIL import Image

import paths as P

ZIP_ID = "1rEO2a-UpnrYldF_i42dyiSZA4rnH7rBE"   # "fotos leuk + laftdren.zip"
DEST = P.ROOT / "app" / "assets" / "ficha" / "fotos"
CACHE = P.ROOT / "pipeline" / "_fotos_zip.zip"
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


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    if not CACHE.exists():
        print("Bajando el ZIP de fotos (~460 MB, una vez)…", flush=True)
        gdown.download(id=ZIP_ID, output=str(CACHE), quiet=False)

    skus = catalog_skus()
    ok, seen = 0, {}
    with zipfile.ZipFile(CACHE) as z:
        # elegir un archivo por SKU (preferir el que termina en "…Producto0")
        for name in z.namelist():
            base = name.rsplit("/", 1)[-1]
            m = re.match(r"(\d+)", base)
            if not m:
                continue
            sku = m.group(1)
            if sku not in skus:
                continue
            pref = "producto0" in base.lower() or base.lower() == sku + ".png"
            if sku not in seen or (pref and "producto0" not in seen[sku].lower()):
                seen[sku] = name
        for sku, name in seen.items():
            try:
                with z.open(name) as fh:
                    im = Image.open(fh).convert("RGBA")
                if im.width > MAXW:
                    im = im.resize((MAXW, round(im.height * MAXW / im.width)), Image.LANCZOS)
                im.save(DEST / f"{sku}.png", optimize=True)
                ok += 1
            except Exception as e:
                print(f"  (aviso) {sku}: {str(e)[:60]}")

    mb = sum(f.stat().st_size for f in DEST.glob("*.png")) / 1e6
    faltan = sorted(skus - set(seen))
    print(f"✓ Fotos: {ok} SKU del catálogo guardadas ({mb:.0f} MB). Sin foto en el ZIP: {len(faltan)}")
    if faltan:
        print("  faltan:", " ".join(faltan[:40]) + (" …" if len(faltan) > 40 else ""))


if __name__ == "__main__":
    main()
