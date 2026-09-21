#!/usr/bin/env python3
"""
encolar_lista.py — Sube una lista de precios (PDF) de competencia y la deja en la cola
del worker, igual que el botón "↻ Actualizar lista" de la app, pero desde la terminal
(o desde Claude). Sirve para las dos cosas:

  · ACTUALIZAR una marca que ya tiene receta:
        python3 encolar_lista.py --marca vonderk lista.pdf [otra.pdf ...]
  · ALTA de una marca nueva (fases 3-4 de la skill alta-competidor):
        python3 encolar_lista.py --alta "Nombre Marca" --url https://sitio.com lista.pdf

  · Ver cómo van los últimos trabajos:
        python3 encolar_lista.py --estado

Se loguea con tu cuenta de la plataforma (LEUK_EMAIL/LEUK_PASSWORD, o te las pide) —
ver auth_sesion.py. Necesita rol admin/lider/coordinacion. El worker de Modal agarra el
trabajo en ≤2 minutos; el resultado se revisa en la app (Benchmark → Nuevas integraciones).
"""
import argparse
import json
import pathlib
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

import auth_sesion
from auth_sesion import SB_URL


def slug_marca(s):
    # Mismo criterio que slugMarca() de app.js
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "marca"


def pedir(H, url, data=None, method="GET", extra=None):
    req = urllib.request.Request(url, data=data, method=method, headers={**H, **(extra or {})})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            cuerpo = r.read()
            return json.loads(cuerpo) if cuerpo else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f"✗ {method} {url.split('/v1/')[-1][:60]} → HTTP {e.code}: {e.read().decode()[:300]}")


def recetas(H):
    return pedir(H, f"{SB_URL}/rest/v1/competencia_recetas?select=slug,marca,estado&order=marca.asc")


def subir_pdf(H, slug, pdf):
    nombre = re.sub(r"[^\w.\-]+", "_", pdf.name)
    path = f"{slug}/{int(time.time() * 1000)}-{nombre}"
    pedir(H, f"{SB_URL}/storage/v1/object/integracion/{urllib.parse.quote(path)}",
          data=pdf.read_bytes(), method="POST",
          extra={"Content-Type": "application/pdf", "x-upsert": "true"})
    print(f"  ✓ subido {pdf.name}")
    return path


def estado(H):
    jobs = pedir(H, f"{SB_URL}/rest/v1/integracion_jobs?select=id,marca,tipo,estado,autor,creado,resultado"
                    "&order=creado.desc&limit=10")
    for j in jobs:
        res = j.get("resultado")
        res = json.dumps(res, ensure_ascii=False)[:120] if res else ""
        print(f"{j['creado'][:16]}  {j['estado']:<11} {j.get('tipo') or '':<13} {j['marca']:<20} {res}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdfs", nargs="*", type=pathlib.Path)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--marca", help="slug de una marca con receta (actualización)")
    g.add_argument("--alta", help="nombre de una marca NUEVA (alta)")
    g.add_argument("--estado", action="store_true", help="mostrar los últimos trabajos")
    ap.add_argument("--url", help="sitio web de la marca (sólo alta)")
    a = ap.parse_args()

    H = auth_sesion.headers()
    if a.estado:
        return estado(H)

    if not a.pdfs:
        raise SystemExit("✗ Pasá al menos un PDF.")
    for p in a.pdfs:
        if not p.is_file() or p.suffix.lower() != ".pdf":
            raise SystemExit(f"✗ {p} no es un PDF que exista.")

    if a.marca:
        rs = recetas(H)
        r = next((x for x in rs if x["slug"] == a.marca), None)
        if not r:
            raise SystemExit(f"✗ '{a.marca}' no tiene receta. Marcas disponibles: "
                             f"{', '.join(x['slug'] for x in rs) or '(ninguna)'}.\n"
                             "  Si es una marca nueva, usá --alta (y la skill alta-competidor).")
        slug, job = r["slug"], {"marca": r["marca"], "marca_nueva": False, "tipo": "actualizacion",
                                "slug": r["slug"], "url": None}
    else:
        slug = slug_marca(a.alta)
        job = {"marca": a.alta, "marca_nueva": True, "tipo": "alta", "slug": slug, "url": a.url}

    print(f"Subiendo {len(a.pdfs)} PDF de {job['marca']}…")
    job["pdf_paths"] = [subir_pdf(H, slug, p) for p in a.pdfs]
    job["autor"] = auth_sesion.email()
    creado = pedir(H, f"{SB_URL}/rest/v1/integracion_jobs", data=json.dumps(job).encode(),
                   method="POST", extra={"Prefer": "return=representation"})
    print(f"✓ En cola (job {creado[0].get('id', '?')}, {job['tipo']}). El worker lo toma en ≤2 min.")
    print("  Seguimiento:  python3 encolar_lista.py --estado")
    print("  Revisión:     app → Benchmark → Nuevas integraciones")


if __name__ == "__main__":
    main()
