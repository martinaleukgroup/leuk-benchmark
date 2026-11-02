#!/usr/bin/env python3
"""
fichas_cambiadas.py — Qué fichas (agrupaciones) hay que volver a imprimir.

Compara el fichas-data.js recién generado contra el publicado (el de HEAD en git) y
devuelve las agrupaciones nuevas o con algún dato distinto. También cuenta como
cambiada una ficha cuya foto de producto se actualizó, aunque los datos sean iguales.

Uso:
    python3 fichas_cambiadas.py --repo <raíz del repo> --salida cambiadas.txt [--solo "MOLY,DYNA"]

Escribe una agrupación por línea en --salida y un resumen en la consola.
Con --solo, además de las cambiadas fuerza esas agrupaciones (para probar).
"""
import argparse
import json
import re
import subprocess
from pathlib import Path


def cargar(txt):
    m = re.search(r"window\.FICHAS\s*=\s*(\[.*\])\s*;?\s*$", txt, re.S)
    return json.loads(m.group(1)) if m else []


def agrupar(fichas):
    """{agrupación: [fichas]} con el mismo criterio que el exportador de PDF."""
    out = {}
    for f in fichas:
        ag = f.get("agrupacion") or f.get("titulo")
        if ag:
            out.setdefault(ag, []).append(f)
    return out


def firma(lista):
    return json.dumps(lista, ensure_ascii=False, sort_keys=True)


def fotos_cambiadas(repo):
    """Nombres de archivo (sin extensión) de fotos nuevas o modificadas en el working tree."""
    r = subprocess.run(["git", "-C", str(repo), "status", "--porcelain", "--", "assets/ficha/fotos"],
                       capture_output=True, text=True)
    nombres = set()
    for linea in r.stdout.splitlines():
        ruta = linea[3:].strip().strip('"')
        nombres.add(Path(ruta).stem.lower())
    return nombres


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--salida", required=True)
    ap.add_argument("--solo", default="")
    a = ap.parse_args()
    repo = Path(a.repo)

    previo = subprocess.run(["git", "-C", str(repo), "show", "HEAD:fichas-data.js"],
                            capture_output=True, text=True).stdout
    antes = agrupar(cargar(previo))
    ahora = agrupar(cargar((repo / "fichas-data.js").read_text(encoding="utf-8")))

    nuevas = [ag for ag in ahora if ag not in antes]
    cambiadas = [ag for ag in ahora if ag in antes and firma(ahora[ag]) != firma(antes[ag])]
    bajas = [ag for ag in antes if ag not in ahora]

    # fotos: una foto nueva/cambiada de cualquier SKU de la ficha la vuelve a imprimir
    fotos = fotos_cambiadas(repo)
    por_foto = []
    if fotos:
        for ag, lista in ahora.items():
            if ag in nuevas or ag in cambiadas:
                continue
            skus = set()
            for f in lista:
                skus.add(str(f.get("sku") or "").lower())
                skus.update(str(s).lower() for s in (f.get("skus") or []))
                foto = ((f.get("assets") or {}).get("foto") or "")
                if foto:
                    skus.add(Path(foto).stem.lower())
            if skus & fotos:
                por_foto.append(ag)

    forzadas = []
    for ag in [x.strip() for x in a.solo.split(",") if x.strip()]:
        encontrada = next((k for k in ahora if k.upper() == ag.upper()), None)
        if encontrada:
            forzadas.append(encontrada)
        else:
            print(f"  ⚠ --solo: no hay ninguna agrupación llamada {ag!r}")

    lista = []
    for ag in nuevas + cambiadas + por_foto + forzadas:
        if ag not in lista:
            lista.append(ag)

    Path(a.salida).write_text("\n".join(lista) + ("\n" if lista else ""), encoding="utf-8")

    print(f"· agrupaciones: {len(antes)} → {len(ahora)}")
    print(f"· nuevas: {len(nuevas)}" + (f" ({', '.join(nuevas[:15])}{'…' if len(nuevas) > 15 else ''})" if nuevas else ""))
    print(f"· con datos distintos: {len(cambiadas)}" + (f" ({', '.join(cambiadas[:15])}{'…' if len(cambiadas) > 15 else ''})" if cambiadas else ""))
    print(f"· con foto nueva: {len(por_foto)}" + (f" ({', '.join(por_foto[:15])})" if por_foto else ""))
    if forzadas:
        print(f"· forzadas a mano: {', '.join(forzadas)}")
    if bajas:
        print(f"· ya no están (no se borra ningún PDF): {', '.join(bajas[:15])}{'…' if len(bajas) > 15 else ''}")
    print(f"→ PDF a generar: {len(lista)}")

    # Detalle de qué cambió (primeras fichas), para revisar en el log
    for ag in cambiadas[:4]:
        a_, b_ = antes[ag], ahora[ag]
        print(f"  ─ {ag}: {len(a_)} → {len(b_)} hojas")
        for i, (x, y) in enumerate(zip(a_, b_)):
            claves = sorted(set(x) | set(y))
            for k in claves:
                if json.dumps(x.get(k), sort_keys=True, ensure_ascii=False) != json.dumps(y.get(k), sort_keys=True, ensure_ascii=False):
                    vx = json.dumps(x.get(k), ensure_ascii=False)[:160]
                    vy = json.dumps(y.get(k), ensure_ascii=False)[:160]
                    print(f"     hoja {i+1} · {k}:\n        antes: {vx}\n        ahora: {vy}")
            if i >= 1:
                break


if __name__ == "__main__":
    main()
