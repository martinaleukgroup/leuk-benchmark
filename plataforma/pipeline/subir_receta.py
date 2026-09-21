#!/usr/bin/env python3
"""
subir_receta.py — Sube la receta de un competidor a la tabla `competencia_recetas`
de Supabase, para que la lea el worker (actualizaciones) y la muestre la app
(página "Manual de carga").

Uso:
    python3 subir_receta.py ../skills/alta-competidor/references/recetas/lucciola.json
    python3 subir_receta.py <archivo.json> --check     # valida sin subir

Se loguea con tu cuenta de Supabase (LEUK_EMAIL/LEUK_PASSWORD, o te las pide por
consola) — ver auth_sesion.py. Hace upsert por `slug`: re-ejecutable.
"""
import json
import pathlib
import sys
import urllib.error
import urllib.request

import auth_sesion

SB_URL = "https://cswqoretlhppxkelysny.supabase.co"

# Campos que la receta tiene que traer sí o sí para servir de algo.
OBLIGATORIOS = ["marca", "slug", "estado", "lista_precios", "particularidades"]
ESTADOS = {"activa", "parcial", "baja"}
IVA_OK = {"sin_iva", "con_iva", "desconocido"}


def validar(r):
    """Devuelve la lista de problemas. Vacía = la receta sirve."""
    problemas = []
    for c in OBLIGATORIOS:
        if c not in r:
            problemas.append(f"falta el campo obligatorio '{c}'")
    if r.get("estado") not in ESTADOS:
        problemas.append(f"estado '{r.get('estado')}' inválido (usar: {', '.join(sorted(ESTADOS))})")

    lp = r.get("lista_precios") or {}
    if not lp.get("moneda"):
        problemas.append("lista_precios.moneda vacío — sin moneda los precios no comparan")
    if lp.get("iva") not in IVA_OK:
        problemas.append(f"lista_precios.iva debe ser uno de: {', '.join(sorted(IVA_OK))}")
    if lp.get("moneda") not in (None, "USD") and not lp.get("tipo_cambio"):
        problemas.append(f"la lista está en {lp.get('moneda')} pero no declara tipo_cambio")

    if not r.get("particularidades"):
        problemas.append("particularidades vacío — toda marca tiene alguna; si de verdad no hay, "
                         "poné una nota diciendo que se revisó y no aparecieron")

    act = r.get("actualizacion") or {}
    if act.get("habilitada") and not act.get("clave_de_cruce"):
        problemas.append("actualizacion.habilitada = true pero no hay clave_de_cruce")
    return problemas


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    solo_check = "--check" in sys.argv
    if not args:
        raise SystemExit(__doc__)

    ruta = pathlib.Path(args[0])
    receta = json.loads(ruta.read_text())

    problemas = validar(receta)
    if problemas:
        print(f"✗ La receta de '{receta.get('marca', ruta.stem)}' tiene {len(problemas)} problema(s):")
        for p in problemas:
            print(f"   · {p}")
        raise SystemExit(1)
    print(f"✓ Receta válida: {receta['marca']} ({receta['slug']}) · "
          f"{len(receta['particularidades'])} particularidades")
    if solo_check:
        return

    H = auth_sesion.headers()

    fila = {
        "slug": receta["slug"],
        "marca": receta["marca"],
        "estado": receta["estado"],
        "receta": receta,
        "notas_md": receta.get("notas_md", ""),
        "autor": (receta.get("alta") or {}).get("autor"),
        "actualizado": "now()",
    }
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/competencia_recetas?on_conflict=slug",
        data=json.dumps(fila).encode(), method="POST",
        headers={**H, "Prefer": "resolution=merge-duplicates,return=minimal"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            print(f"→ Subida a competencia_recetas · HTTP {r.status} · OK")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"ERROR HTTP {e.code}: {e.read().decode()[:300]}\n"
                         f"¿Corriste supabase/sql/2026-08-24-recetas-y-actualizacion.sql?")
    print(f"   Verificá en la app: Benchmark → Manual de carga → {receta['marca']}")


if __name__ == "__main__":
    main()
