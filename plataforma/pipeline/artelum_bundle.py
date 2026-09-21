#!/usr/bin/env python3
"""
artelum_bundle.py — Empaqueta la mejor FOTO DE PRODUCTO local de cada producto
Artelum a app/img/artelum/{id}.jpg (imágenes que se sirven desde el propio repo,
porque las URLs del índice son de la intranet de Artelum y NO cargan afuera).

Salida:
 - app/img/artelum/{id}.jpg           (foto representativa, optimizada)
 - pipeline/artelum_families.json     ({id_slug: {"nombre":..., "img":"img/artelum/{id}.jpg"}})

Elige la primera imagen local (en orden del índice: _00 = principal) que pase el
test de foto-de-producto (fondo liso, no ambiente/composición). Re-ejecutable.
"""
import json

import pandas as pd
from PIL import Image

import paths as P
from normalize import slug
from wlg_build import es_foto_producto

IMG_BASE = P.WORK / "Bases de datos/Imágenes/imagenes_artelum"
OUT_IMG = P.ROOT / "app/img/artelum"
OUT_FAM = P.ROOT / "pipeline/artelum_families.json"
MAX_PX = 800


def main():
    idx = pd.read_csv(P.INDICES["Artelum"]).fillna("")
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    fam = {}
    ok = sin_foto = 0
    for _, row in idx.iterrows():
        rid = str(row.get("id")).strip()
        s = slug(rid)
        if not s:
            continue
        nombre = str(row.get("producto") or "").strip() or rid
        archivos = [a.strip() for a in str(row.get("archivos_locales", "")).split("|") if a.strip()]
        elegido = None
        for a in archivos:
            f = IMG_BASE / a
            if f.exists() and es_foto_producto(f):
                elegido = f
                break
        if not elegido:
            sin_foto += 1
            continue
        try:
            im = Image.open(elegido).convert("RGB")
            im.thumbnail((MAX_PX, MAX_PX))
            dest = OUT_IMG / f"{s}.jpg"
            im.save(dest, "JPEG", quality=82)
            fam[s] = {"nombre": nombre, "img": f"img/artelum/{s}.jpg"}
            ok += 1
        except Exception as e:
            print(f"  ✗ {rid}: {str(e)[:50]}")
            sin_foto += 1

    OUT_FAM.write_text(json.dumps(fam, ensure_ascii=False, indent=1))
    print(f"Artelum bundle · con foto de producto={ok} · sin foto limpia={sin_foto} "
          f"· total índice={len(idx)}")
    print(f"→ {OUT_IMG} · {OUT_FAM.name}")


if __name__ == "__main__":
    main()
