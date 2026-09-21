#!/usr/bin/env python3
"""
leuk_drive_scan.py — Barrido COMPLETO del Drive raíz de Leuk (la carpeta que pasó
la usuaria), indexando TODAS las imágenes por cualquier número tipo SKU (>=3 dígitos)
que aparezca al inicio del nombre. Sirve para encontrar fotos de SKUs que el walk
original (sólo Interior/Exterior, sólo nombres 'fotoproducto/foto') se salteó.

Salida: leuk_drive_scan.json  (sku -> [[rank, fileId, filename], ...] ordenado).
Re-ejecutable (cachea). La carpeta es pública por link.
"""
import json
import re
import time

import gdown

import paths as P

ROOT_FOLDER = "12pqh30y4PAVxWtAGSAN_NLW1TUqdjrEf"   # "Leuk Iluminación" (raíz)
OUT = P.ROOT / "pipeline/leuk_drive_scan.json"


def rank(fn):
    """Menor = mejor. Igual que el manifest pero SIN descartar nada (rank 9 se guarda)."""
    f = fn.lower()
    if re.search(r"fotoproducto0\.", f): return 0
    if re.search(r"fotoproducto\.", f):  return 1
    if "fotoproducto" in f:              return 2
    if "foto" in f and "detalle" not in f and "contexto" not in f: return 3
    if "detalle" in f:                   return 5
    if "contexto" in f or "ambient" in f: return 6
    return 8   # cualquier otra imagen que arranque con dígitos


def listar(folder_id, intentos=5):
    for i in range(intentos):
        try:
            return gdown.download_folder(id=folder_id, skip_download=True,
                                         quiet=True, use_cookies=False) or []
        except Exception as e:
            espera = 20 * (i + 1)
            print(f"  ⚠ intento {i+1} falló ({str(e)[:60]}…). Reintento en {espera}s", flush=True)
            time.sleep(espera)
    print(f"  ✗ no se pudo listar tras {intentos} intentos", flush=True)
    return []


def main():
    print("Recorriendo el Drive raíz completo (recursivo, puede tardar varios minutos)…", flush=True)
    files = listar(ROOT_FOLDER)
    print(f"  archivos totales encontrados: {len(files)}", flush=True)

    idx = {}
    for f in files:
        fn = f.path.split("/")[-1]
        if not re.search(r"\.(png|jpg|jpeg|webp)$", fn, re.I):
            continue
        m = re.match(r"(\d{3,})", fn)   # número tipo SKU al inicio del nombre
        if not m:
            continue
        idx.setdefault(m.group(1), []).append((rank(fn), f.id, fn))

    for sku in idx:
        idx[sku].sort(key=lambda t: t[0])
    OUT.write_text(json.dumps(idx, ensure_ascii=False, indent=1))
    print(f"Index · SKU con imagen en el Drive={len(idx)} · guardado en {OUT.name}")


if __name__ == "__main__":
    main()
