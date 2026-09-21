#!/usr/bin/env python3
"""
img_leuk_manifest.py — Construye el manifiesto SKU -> Drive fileId para TODAS las
fotos de producto de Leuk, recorriendo el árbol del Drive con gdown (skip_download,
no baja nada). Los archivos ya están nombrados por SKU ({SKU}Fotoproducto0.png).

Elige por SKU la mejor foto "de producto" (fondo limpio) según prioridad de nombre.
Salida: leuk_image_manifest.json  (merge con lo existente).

Re-ejecutable. La carpeta de Drive es pública por link (no requiere OAuth).
"""
import json
import re
import time

import gdown

import paths as P

# Subcarpetas de "Leuk Iluminación" en Drive. Se procesan por separado (y con
# reintentos) para que un 500 transitorio en una no tire abajo todo el índice.
FOLDERS = {
    "Interior": "1qKDwb5XLINxK4I9i1kgfO3fcRqkx499p",
    "Exterior": "1ObXJt0HnLYr152Cw4510UNndPLFvr0Ax",
}


def listar(folder_id, intentos=4):
    for i in range(intentos):
        try:
            return gdown.download_folder(id=folder_id, skip_download=True,
                                         quiet=True, use_cookies=False) or []
        except Exception as e:
            espera = 20 * (i + 1)
            print(f"  ⚠ intento {i+1} falló ({str(e)[:60]}…). Reintento en {espera}s", flush=True)
            time.sleep(espera)
    print(f"  ✗ no se pudo listar {folder_id} tras {intentos} intentos", flush=True)
    return []


def rank(fn):
    """Menor = mejor. Preferimos la foto de producto sobre fondo limpio."""
    f = fn.lower()
    if re.search(r"fotoproducto0\.", f): return 0
    if re.search(r"fotoproducto\.", f):  return 1
    if "fotoproducto" in f:              return 2
    if "foto" in f and "detalle" not in f and "contexto" not in f: return 3
    return 9


def main():
    files = []
    for nombre, fid in FOLDERS.items():
        print(f"Recorriendo «{nombre}» (puede tardar unos minutos)…", flush=True)
        sub = listar(fid)
        print(f"  {nombre}: {len(sub)} archivos", flush=True)
        files += sub

    best = {}  # sku -> (rank, fileId)
    for f in files:
        fn = f.path.split("/")[-1]
        if not re.search(r"\.(png|jpg|jpeg)$", fn, re.I):
            continue
        m = re.match(r"(\d{3,})", fn)          # SKU = dígitos al inicio del nombre
        if not m:
            continue
        sku = m.group(1)
        r = rank(fn)
        if r == 9:
            continue
        if sku not in best or r < best[sku][0]:
            best[sku] = (r, f.id)

    manifest = json.loads(P.LEUK_IMG_MANIFEST.read_text()) if P.LEUK_IMG_MANIFEST.exists() else {}
    nuevos = 0
    for sku, (_, fid) in best.items():
        if manifest.get(sku) != fid:
            manifest[sku] = fid; nuevos += 1
    P.LEUK_IMG_MANIFEST.write_text(json.dumps(dict(sorted(manifest.items())), ensure_ascii=False, indent=1))
    print(f"Manifest · SKU con imagen={len(manifest)} · nuevos/actualizados={nuevos}")


if __name__ == "__main__":
    main()
