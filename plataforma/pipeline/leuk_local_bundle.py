#!/usr/bin/env python3
"""
leuk_local_bundle.py — Empaqueta fotos de producto Leuk que están en una carpeta
local (no en el Drive público) a app/img/leuk/{sku}.jpg, servidas desde el repo.

Parsea el/los SKU del nombre del archivo:
 - '6778FotoProducto0.png'                 -> [6778]
 - '6619-6712-7028-7029Fotoproducto1.jpg'  -> [6619,6712,7028,7029] (foto compartida)
Ignora duplicados tipo 'Copia de ...' / '... (1).jpg'.
Salida: pipeline/leuk_local_families.json  ({sku: "img/leuk/{sku}.jpg"}). Re-ejecutable.
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

import paths as P

OUT_IMG = P.ROOT / "app/img/leuk"
OUT_MAP = P.ROOT / "pipeline/leuk_local_families.json"
MAX_PX = 800


def skus_de_nombre(fn):
    base = fn.split("Foto")[0].split("foto")[0]      # corta antes de 'Foto...'
    return re.findall(r"\d{3,}", base)


def a_jpg(src, dest):
    im = Image.open(src)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        fondo = Image.new("RGB", im.size, (255, 255, 255))
        fondo.paste(im, mask=im.split()[-1])
        im = fondo
    else:
        im = im.convert("RGB")
    im.thumbnail((MAX_PX, MAX_PX))
    im.save(dest, "JPEG", quality=85)


def main(carpeta):
    carpeta = Path(carpeta)
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    mapa = json.loads(OUT_MAP.read_text()) if OUT_MAP.exists() else {}
    ok = 0
    for f in sorted(carpeta.iterdir()):
        if f.suffix.lower() not in (".png", ".jpg", ".jpeg"):
            continue
        if "copia" in f.name.lower() or re.search(r"\(\d+\)", f.name):
            continue                                  # duplicados
        skus = skus_de_nombre(f.name)
        if not skus:
            print(f"  ? sin SKU en el nombre: {f.name}"); continue
        for sku in skus:
            try:
                a_jpg(f, OUT_IMG / f"{sku}.jpg")
                mapa[sku] = f"img/leuk/{sku}.jpg"; ok += 1
                print(f"  ✓ {sku}  ({f.name})")
            except Exception as e:
                print(f"  ✗ {sku} ({f.name}): {str(e)[:50]}")
    OUT_MAP.write_text(json.dumps(dict(sorted(mapa.items())), ensure_ascii=False, indent=1))
    print(f"\nLeuk locales · imágenes escritas={ok} · SKU en mapa={len(mapa)}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else
         str(P.WORK.parent / "Fotos faltantes"))
