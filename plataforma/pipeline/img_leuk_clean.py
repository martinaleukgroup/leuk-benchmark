#!/usr/bin/env python3
"""
img_leuk_clean.py — Reemplaza en el manifiesto las fotos "de ambiente" (producto
fotografiado dentro de un living, render con muebles, composición) por una foto
de producto sobre fondo liso, cuando el Drive tenga alguna.

Cómo funciona:
 1. Recorre las carpetas de Drive de Leuk y junta TODAS las fotos candidatas por
    SKU (no sólo la mejor por nombre), guardando (rank, fileId, filename).
 2. Para cada SKU evalúa primero la foto elegida hoy; si ya es foto de producto
    (test de borde: fondo uniforme y extremo), la deja.
 3. Si la actual es de ambiente, prueba las demás candidatas en orden de rank y
    se queda con la primera que sea foto de producto limpia.
 4. Si ninguna candidata pasa el test, deja la actual (mejor eso que nada) y la
    reporta para revisión manual.

Cachea el listado de candidatos y las miniaturas evaluadas para que re-correrlo
sea rápido. Re-ejecutable.
"""
import json
import io
import re
import time
import urllib.request

import numpy as np
from PIL import Image
import gdown

import paths as P

FOLDERS = {
    "Interior": "1qKDwb5XLINxK4I9i1kgfO3fcRqkx499p",
    "Exterior": "1ObXJt0HnLYr152Cw4510UNndPLFvr0Ax",
}

CAND_CACHE = P.ROOT / "pipeline/leuk_image_candidatos.json"   # sku -> [[rank, fid, fn], ...]
THUMB_CACHE = P.ROOT / "pipeline/.leuk_thumb_cache"           # fid.jpg evaluadas
REPORTE = P.ROOT / "pipeline/leuk_image_clean_reporte.json"


def rank(fn):
    f = fn.lower()
    if re.search(r"fotoproducto0\.", f): return 0
    if re.search(r"fotoproducto\.", f):  return 1
    if "fotoproducto" in f:              return 2
    if "foto" in f and "detalle" not in f and "contexto" not in f: return 3
    return 9


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


def construir_candidatos():
    """Devuelve sku -> lista ordenada de (rank, fileId, filename)."""
    if CAND_CACHE.exists():
        print("Usando candidatos cacheados (borrá leuk_image_candidatos.json para re-listar el Drive).")
        raw = json.loads(CAND_CACHE.read_text())
        return {sku: [tuple(c) for c in lst] for sku, lst in raw.items()}

    cand = {}
    for nombre, fid in FOLDERS.items():
        print(f"Recorriendo «{nombre}» en Drive (puede tardar unos minutos)…", flush=True)
        sub = listar(fid)
        print(f"  {nombre}: {len(sub)} archivos", flush=True)
        for f in sub:
            fn = f.path.split("/")[-1]
            if not re.search(r"\.(png|jpg|jpeg)$", fn, re.I):
                continue
            m = re.match(r"(\d{3,})", fn)
            if not m:
                continue
            r = rank(fn)
            if r == 9:
                continue
            cand.setdefault(m.group(1), []).append((r, f.id, fn))

    for sku in cand:
        cand[sku].sort(key=lambda t: t[0])
    CAND_CACHE.write_text(json.dumps(cand, ensure_ascii=False, indent=1))
    print(f"Candidatos · SKU={len(cand)} (cacheado en {CAND_CACHE.name})")
    return cand


def bajar_thumb(fid, intentos=4):
    dest = THUMB_CACHE / f"{fid}.jpg"
    if dest.exists():
        return Image.open(dest)
    url = f"https://lh3.googleusercontent.com/d/{fid}=w600"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    ult = None
    for i in range(intentos):
        try:
            raw = urllib.request.urlopen(req, timeout=30).read()
            im = Image.open(io.BytesIO(raw)).convert("RGB")
            im.save(dest, "JPEG", quality=80)
            return im
        except Exception as e:
            ult = e
            time.sleep(3 * (i + 1))
    raise ult


def es_foto_producto(im):
    im = im.convert("RGB"); im.thumbnail((200, 200))
    px = np.asarray(im, dtype="float32"); h, w, _ = px.shape
    b = max(4, int(min(h, w) * 0.08))
    border = np.concatenate([px[:b].reshape(-1, 3), px[-b:].reshape(-1, 3),
                             px[:, :b].reshape(-1, 3), px[:, -b:].reshape(-1, 3)])
    std = float(border.std()); lum = float(border.mean())
    return std < 34 and (lum < 60 or lum > 200)


def evaluar(fid):
    try:
        return es_foto_producto(bajar_thumb(fid))
    except Exception as e:
        print(f"    ✗ no pude evaluar {fid}: {str(e)[:50]}")
        return None


def main():
    THUMB_CACHE.mkdir(exist_ok=True)
    manifest = json.loads(P.LEUK_IMG_MANIFEST.read_text())
    cand = construir_candidatos()

    cambiados, ya_ok, sin_alternativa, sin_candidatos = [], 0, [], 0
    for sku, fid_actual in sorted(manifest.items()):
        # 1) ¿la foto elegida hoy ya es de producto?
        if evaluar(fid_actual):
            ya_ok += 1
            continue

        # 2) buscar alternativa limpia entre las candidatas del SKU
        candidatos = [c for c in cand.get(sku, []) if c[1] != fid_actual]
        if not cand.get(sku):
            sin_candidatos += 1
            sin_alternativa.append(sku)
            continue

        elegido = None
        for r, cfid, fn in candidatos:
            if evaluar(cfid):
                elegido = (cfid, fn)
                break

        if elegido:
            manifest[sku] = elegido[0]
            cambiados.append((sku, elegido[1]))
            print(f"  ✓ {sku}: ambiente → producto ({elegido[1]})")
        else:
            sin_alternativa.append(sku)
            print(f"  ⚠ {sku}: no hay foto de producto limpia, queda la actual")

    P.LEUK_IMG_MANIFEST.write_text(
        json.dumps(dict(sorted(manifest.items())), ensure_ascii=False, indent=1))
    REPORTE.write_text(json.dumps(
        {"cambiados": cambiados, "sin_alternativa": sorted(set(sin_alternativa))},
        ensure_ascii=False, indent=1))

    print("\n─── Resumen ───")
    print(f"Ya eran foto de producto : {ya_ok}")
    print(f"Corregidas (→ producto)  : {len(cambiados)}")
    print(f"Sin alternativa limpia   : {len(sin_alternativa)}  (quedan como estaban)")
    print(f"Reporte en {REPORTE.name}")


if __name__ == "__main__":
    main()
