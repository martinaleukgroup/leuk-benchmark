#!/usr/bin/env python3
"""
freno_stock.py — Cuánto saca HOY el filtro de stock, comparado con lo publicado.

fichas_build.py deja en fichas-sin-stock.json los SKU que no están en el Excel de stock
(y por eso salieron de las fichas). Este script lo compara con la versión publicada
(HEAD en git) y responde:

  · nuevos:    SKU que salen hoy y ayer seguían en las fichas
  · volvieron: SKU que ayer estaban fuera y hoy volvieron a aparecer en el Excel
  · esperadas: hojas de la plataforma publicada que desaparecen porque TODOS sus SKU
               son "nuevos" (sirve para que el freno del 5% no confunda esta baja
               buscada con filas borradas del Hub por error)

Uso:
    python3 freno_stock.py --repo <raíz> [--detalle salida/sin_stock_nuevos.txt]
Imprime en la primera línea: "<nuevos> <volvieron> <esperadas>".
"""
import argparse
import json
import re
import subprocess
from pathlib import Path


def leer_head(repo, ruta):
    r = subprocess.run(["git", "-C", str(repo), "show", f"HEAD:{ruta}"], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--detalle", default="")
    a = ap.parse_args()
    repo = Path(a.repo)

    try:
        hoy = json.loads((repo / "fichas-sin-stock.json").read_text(encoding="utf-8"))
    except Exception:
        hoy = {"skus": []}
    try:
        ayer = json.loads(leer_head(repo, "fichas-sin-stock.json") or "{}")
    except Exception:
        ayer = {}
    q_hoy = {q["sku"]: q for q in hoy.get("skus", [])}
    q_ayer = {q["sku"] for q in ayer.get("skus", [])}
    nuevos = [q_hoy[s] for s in sorted(q_hoy) if s not in q_ayer]
    volvieron = sorted(q_ayer - set(q_hoy))

    m = re.search(r"window\.FICHAS\s*=\s*(\[.*\])\s*;?\s*$", leer_head(repo, "fichas-data.js"), re.S)
    publicadas = json.loads(m.group(1)) if m else []
    sn = {q["sku"] for q in nuevos}
    esperadas = 0
    for f in publicadas:
        skus = {str(s) for s in ([f.get("sku")] + list(f.get("skus") or [])) if s}
        if skus and skus <= sn:
            esperadas += 1

    print(f"{len(nuevos)} {len(volvieron)} {esperadas}")
    if a.detalle:
        lineas = [f"{q['ficha']} · {q['sku']} {q['nombre']}" for q in nuevos]
        Path(a.detalle).write_text("\n".join(lineas) + ("\n" if lineas else ""), encoding="utf-8")


if __name__ == "__main__":
    main()
