#!/usr/bin/env python3
"""
img_leuk_download.py — Baja las fotos de producto de Leuk desde Google Drive.

Lee el manifiesto SKU -> fileId (leuk_image_manifest.json) y baja la miniatura
pública de cada una (endpoint thumbnail, sin autenticación) optimizada para web.
Las imágenes de Drive son de acceso público por link, así que no hace falta OAuth.

Re-ejecutable: sólo baja lo que falta (salvo --force).
"""
import argparse
import json
import sys
import urllib.request
from io import BytesIO

from PIL import Image

import paths as P

THUMB = "https://drive.google.com/thumbnail?id={fid}&sz=w1000"
UC = "https://drive.google.com/uc?export=download&id={fid}"


def bajar(fid, size="w1000"):
    url = THUMB.format(fid=fid).replace("w1000", size)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--max-px", type=int, default=800)
    args = ap.parse_args()

    manifest = json.loads(P.LEUK_IMG_MANIFEST.read_text())
    P.IMG_LEUK.mkdir(parents=True, exist_ok=True)
    ok = skip = err = 0
    for sku, fid in manifest.items():
        dest = P.IMG_LEUK / f"{sku}.jpg"
        if dest.exists() and not args.force:
            skip += 1; continue
        try:
            raw = bajar(fid)
            im = Image.open(BytesIO(raw)).convert("RGB")
            im.thumbnail((args.max_px, args.max_px))
            im.save(dest, "JPEG", quality=82)
            ok += 1
            print(f"  ✓ {sku}  ({im.size[0]}x{im.size[1]})")
        except Exception as e:
            err += 1
            print(f"  ✗ {sku}: {e}", file=sys.stderr)
    print(f"Leuk imágenes · bajadas={ok} · ya estaban={skip} · error={err}")


if __name__ == "__main__":
    main()
