#!/usr/bin/env python3
"""
fichas_cambiadas.py — Qué fichas (agrupaciones) hay que volver a imprimir.

Compara el fichas-data.js recién generado contra el publicado (el de HEAD en git) y
devuelve las agrupaciones nuevas o con algún dato distinto. También cuenta como
cambiada una ficha cuya foto de producto se actualizó, aunque los datos sean iguales.

Uso:
    python3 fichas_cambiadas.py --repo <raíz del repo> --salida cambiadas.txt [--solo "MOLY,DYNA"]
                                [--historial fichas-historial.json --fecha 2026-11-02]

Con --historial actualiza el historial que lee el panel de Fichas (etiquetas Nueva /
Actualizada / Falta foto): cuándo se creó y cuándo cambió cada ficha, qué cambió y a qué
SKU le falta la foto de producto.

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


ETIQ_ASSETS = [("foto", "Foto"), ("dibujo", "Dibujo técnico"), ("curva", "Curvas fotométricas"),
               ("ldt", "LDT"), ("cad", "CAD"), ("manual", "Manual de instalación")]


def que_cambio(a_, b_):
    """Etiquetas legibles de lo que cambió entre dos versiones de una ficha."""
    out = []
    def suma(x):
        if x not in out:
            out.append(x)
    pa = {str(f.get("sku")): f for f in a_}
    pb = {str(f.get("sku")): f for f in b_}
    if set(pa) != set(pb):
        suma("Variantes")
    for sku in set(pa) & set(pb):
        x, y = pa[sku], pb[sku]
        if x.get("titulo") != y.get("titulo"):
            suma("Nombre")
        if (x.get("descripcion") or "") != (y.get("descripcion") or ""):
            suma("Descripción")
        fx = {r.get("k"): r.get("v") for r in (x.get("filas") or [])}
        fy = {r.get("k"): r.get("v") for r in (y.get("filas") or [])}
        for k in sorted(set(fx) | set(fy), key=lambda k: list(fy).index(k) if k in fy else 999):
            if fx.get(k) != fy.get(k) and k != "SKU":
                suma(k)
        ax, ay = x.get("assets") or {}, y.get("assets") or {}
        for clave, etiqueta in ETIQ_ASSETS:
            vx = {k: v for k, v in ax.items() if k.startswith(clave)}
            vy = {k: v for k, v in ay.items() if k.startswith(clave)}
            if json.dumps(vx, sort_keys=True) != json.dumps(vy, sort_keys=True):
                suma(etiqueta)
        if (x.get("foto_url") or "") != (y.get("foto_url") or ""):
            suma("Foto")
        if json.dumps(x.get("colores"), sort_keys=True) != json.dumps(y.get("colores"), sort_keys=True):
            suma("Colores")
        if json.dumps(x.get("items"), sort_keys=True) != json.dumps(y.get("items"), sort_keys=True):
            suma("Accesorios")
    return out or ["Otros datos"]


def falta_foto(lista):
    """SKU de las hojas de producto sin foto (las hojas de accesorios/texto llevan 'tipo')."""
    return [str(f.get("sku")) for f in lista if not f.get("tipo") and not f.get("foto_url")]


def actualizar_historial(ruta, fecha, antes, ahora, nuevas, cambiadas, por_foto):
    try:
        h = json.loads(Path(ruta).read_text(encoding="utf-8"))
    except Exception:
        h = {}
    fichas = h.get("fichas") or {}
    for ag in nuevas:
        fichas.setdefault(ag, {})["creada"] = fecha
    for ag in cambiadas:
        e = fichas.setdefault(ag, {})
        e["actualizada"] = fecha
        e["cambios"] = que_cambio(antes[ag], ahora[ag])
    for ag in por_foto:
        e = fichas.setdefault(ag, {})
        e["actualizada"] = fecha
        e["cambios"] = ["Foto"]
    for ag, lista in ahora.items():
        e = fichas.setdefault(ag, {})
        ff = falta_foto(lista)
        if ff:
            e["falta_foto"] = ff
        else:
            e.pop("falta_foto", None)
    # las que ya no existen salen del historial
    for ag in [k for k in fichas if k not in ahora]:
        del fichas[ag]
    fichas = {k: v for k, v in sorted(fichas.items()) if v}
    Path(ruta).write_text(json.dumps({"fichas": fichas}, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                          encoding="utf-8")
    n_ff = sum(1 for v in fichas.values() if v.get("falta_foto"))
    print(f"· historial: {len(nuevas)} nuevas, {len(cambiadas) + len(por_foto)} actualizadas, {n_ff} con falta de foto")


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
    ap.add_argument("--historial", default="")
    ap.add_argument("--fecha", default="")
    ap.add_argument("--antes", default="", help="fichas-data.js de referencia (por defecto, el de HEAD)")
    a = ap.parse_args()
    repo = Path(a.repo)

    previo = Path(a.antes).read_text(encoding="utf-8") if a.antes else \
        subprocess.run(["git", "-C", str(repo), "show", "HEAD:fichas-data.js"],
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

    # Fichas nuevas o actualizadas que todavía no quedaron en Drive (sin carpeta, error, o la
    # subida es anterior al último cambio) y que ya tienen foto: se vuelven a imprimir para subirlas.
    pendientes_drive = []
    if a.historial and Path(a.historial).exists():
        try:
            hist = json.loads(Path(a.historial).read_text(encoding="utf-8")).get("fichas", {})
        except Exception:
            hist = {}
        for ag, e in hist.items():
            if ag not in ahora or ag in nuevas or ag in cambiadas or ag in por_foto:
                continue
            ultimo = max(e.get("creada", ""), e.get("actualizada", ""))
            if not ultimo or falta_foto(ahora[ag]):
                continue
            d = e.get("drive") or {}
            if d.get("estado") != "subida" or d.get("fecha", "") < ultimo:
                pendientes_drive.append(ag)

    forzadas = []
    for ag in [x.strip() for x in a.solo.split(",") if x.strip()]:
        encontrada = next((k for k in ahora if k.upper() == ag.upper()), None)
        if encontrada:
            forzadas.append(encontrada)
        else:
            print(f"  ⚠ --solo: no hay ninguna agrupación llamada {ag!r}")

    lista = []
    for ag in nuevas + cambiadas + por_foto + pendientes_drive + forzadas:
        if ag not in lista:
            lista.append(ag)

    if a.historial:
        from datetime import date
        actualizar_historial(a.historial, a.fecha or date.today().isoformat(),
                             antes, ahora, nuevas, cambiadas, por_foto)

    Path(a.salida).write_text("\n".join(lista) + ("\n" if lista else ""), encoding="utf-8")

    print(f"· agrupaciones: {len(antes)} → {len(ahora)}")
    print(f"· nuevas: {len(nuevas)}" + (f" ({', '.join(nuevas[:15])}{'…' if len(nuevas) > 15 else ''})" if nuevas else ""))
    print(f"· con datos distintos: {len(cambiadas)}" + (f" ({', '.join(cambiadas[:15])}{'…' if len(cambiadas) > 15 else ''})" if cambiadas else ""))
    print(f"· con foto nueva: {len(por_foto)}" + (f" ({', '.join(por_foto[:15])})" if por_foto else ""))
    if pendientes_drive:
        print(f"· pendientes de subir a Drive: {len(pendientes_drive)} ({', '.join(pendientes_drive[:15])})")
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
