#!/usr/bin/env python3
"""
ficha_assets_manifest.py — Manifiesto de assets de ficha (dibujo, curvas, LDT, CAD)
recorriendo carpetas PÚBLICAS de Drive con gdown (skip_download, no baja nada).

Salida: pipeline/ficha_assets_manifest.json con tres índices:
  by_name      : {nombre_archivo.lower(): fileId}     — match exacto (LDT/CAD y fallback)
  dibujo_by_sku: {sku: fileId}                         — cada SKU del nombre (dibujos de línea)
  curva_by_sku : {sku: {"polar": fileId, "cono": fileId}}

Requisito: las carpetas deben estar públicas por link. Si una no lo está, se saltea
sin romper. Re-ejecutable. Modelado sobre img_leuk_manifest.py.
"""
import json
import re
import time

import gdown

import paths as P

FOLDERS = {
    "dibujo": "1OX3GwF-J-kH8Vrt8YxK3Oadle63JV-gc",
    "ldt":    "1rQCd077gbz4chcn41rpWrv-SQ1pnXdCd",
    "cad":    "1a5QjMmX8Ul0OdsbmoPuL-BEEmXY9s16d",
    "curva":  "13M9LGeEJ_bFqQrH0jspKasCm6UI3ALr_",
    "manual": "1cDP47QigJy7okGRP-3WdVl2uHWGgMFts",  # manuales de instalación (PDF), nombrados por familia
}
OUT = P.ROOT / "pipeline" / "ficha_assets_manifest.json"


def listar(fid, intentos=3):
    for i in range(intentos):
        try:
            return gdown.download_folder(id=fid, skip_download=True, quiet=True, use_cookies=False) or []
        except Exception as e:
            print(f"  ⚠ intento {i+1} falló ({str(e)[:70]}…)", flush=True)
            time.sleep(8 * (i + 1))
    return []


def main():
    by_name, dibujo_by_sku, curva_by_sku, manuals = {}, {}, {}, []
    for tipo, fid in FOLDERS.items():
        files = listar(fid)
        print(f"{tipo}: {len(files)} archivos", flush=True)
        for f in files:
            fn = f.path.split("/")[-1]
            low = fn.lower()
            by_name[low] = f.id
            skus = re.findall(r"\d{3,}", fn)
            if tipo == "dibujo" and "dibujo" in low:
                for s in skus:
                    dibujo_by_sku[s] = f.id
            elif tipo == "curva" and skus:
                kind = "polar" if "polar" in low else ("cono" if "cono" in low else None)
                if kind:
                    for s in skus:                     # curvas de línea: mapear cada SKU
                        curva_by_sku.setdefault(s, {})[kind] = f.id
            elif tipo == "manual" and low.endswith(".pdf"):
                manuals.append({"name": low, "id": f.id})

    OUT.write_text(json.dumps(
        {"by_name": by_name, "dibujo_by_sku": dibujo_by_sku, "curva_by_sku": curva_by_sku, "manuals": manuals},
        ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✓ manifest: {len(by_name)} archivos · {len(dibujo_by_sku)} SKU dibujo · {len(curva_by_sku)} SKU curva · {len(manuals)} manuales")
    print(f"  → {OUT}")


if __name__ == "__main__":
    main()
