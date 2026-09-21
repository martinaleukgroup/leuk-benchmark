#!/usr/bin/env python3
"""
artelum_web_fetch.py — Baja la foto 'principal' de las entidades Artelum que tienen
id numérico pero seguían sin imagen, usando el patrón público
https://intranet.artelum.com.ar/uploads/lineas/linea_{id}_principal.{png,jpg}
(que SÍ carga públicamente, verificado). Filtra que sea foto de producto y la
empaqueta a app/img/artelum/{id}.jpg, sumándola a artelum_families.json.
Re-ejecutable.
"""
import json
import io
import time
import urllib.request

from PIL import Image

import paths as P
from wlg_build import es_foto_producto

BASE = "https://intranet.artelum.com.ar/uploads/lineas/linea_{id}_principal.{ext}"
OUT_IMG = P.ROOT / "app/img/artelum"
FAM = P.ROOT / "pipeline/artelum_families.json"
DATA = P.ROOT / "data/benchmark_data.json"
MAX_PX = 800


def bajar(url, intentos=3):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    for i in range(intentos):
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                # el server responde 200 con un HTML de error para variantes inexistentes
                ct = (r.headers.get("Content-Type") or "").lower()
                if r.status == 200 and ct.startswith("image/"):
                    return r.read()
                return None
        except urllib.error.HTTPError:
            return None
        except Exception:
            time.sleep(2 * (i + 1))
    return None


def main():
    data = json.loads(DATA.read_text())
    comp = data.get("competencia", [])
    art = [c for c in comp if c.get("marca") == "Artelum"
           and not c.get("imagen") and str(c.get("fslug", "")).isdigit()]
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    fam = json.loads(FAM.read_text()) if FAM.exists() else {}

    ok = no_foto = no_url = 0
    tmp = P.ROOT / "pipeline/.artelum_tmp"; tmp.mkdir(exist_ok=True)
    for c in art:
        rid = str(c["fslug"])
        raw = None
        for ext in ("png", "jpg"):
            raw = bajar(BASE.format(id=rid, ext=ext))
            if raw:
                break
        if not raw:
            no_url += 1; continue
        try:
            im = Image.open(io.BytesIO(raw)).convert("RGB")
            if min(im.size) < 120:          # descarta íconos/miniaturas rotas
                no_foto += 1; continue
            # '_principal' es la foto curada por Artelum → confiamos; sólo evitamos íconos
            im.thumbnail((MAX_PX, MAX_PX))
            im.save(OUT_IMG / f"{rid}.jpg", "JPEG", quality=82)
            fam[rid] = {"nombre": c.get("nombre") or rid, "img": f"img/artelum/{rid}.jpg"}
            ok += 1
            print(f"  ✓ {rid}  {c.get('nombre')}")
        except Exception as e:
            no_foto += 1; print(f"  ✗ {rid}: {str(e)[:40]}")

    FAM.write_text(json.dumps(fam, ensure_ascii=False, indent=1))
    print(f"\nArtelum web · nuevas={ok} · no eran foto de producto={no_foto} · sin URL={no_url}")


if __name__ == "__main__":
    main()
