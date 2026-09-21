#!/usr/bin/env python3
"""
subir_datos.py — Sube el benchmark (data/benchmark_data.json) al bucket privado
'datos' de Supabase Storage, para que la app lo descargue SÓLO tras el login.
Reemplaza al viejo data.js público. Correr después de consolidate.py.

Se loguea con tu cuenta de Supabase (LEUK_EMAIL/LEUK_PASSWORD, o te las pide por
consola) — ver auth_sesion.py. Necesita rol admin/lider/coordinacion (RLS de
storage.objects para el bucket 'datos'). Re-ejecutable (upsert).
"""
import json
import urllib.request

import auth_sesion
import paths as P

SB_URL = "https://cswqoretlhppxkelysny.supabase.co"
BUCKET = "datos"
OBJETO = "benchmark_data.json"


def main():
    H = auth_sesion.headers()
    data = P.OUT_JSON.read_bytes()          # data/benchmark_data.json (canónico)
    # validar que sea JSON válido antes de subir
    n = len(json.loads(data).get("productos", []))
    url = f"{SB_URL}/storage/v1/object/{BUCKET}/{OBJETO}"
    req = urllib.request.Request(url, data=data, method="POST",
                                  headers={**H, "x-upsert": "true"})
    with urllib.request.urlopen(req, timeout=120) as r:
        ok = r.status == 200
    print(f"Subido {OBJETO} ({len(data)//1024} KB · {n} productos) → bucket '{BUCKET}' · HTTP {r.status} · {'OK' if ok else 'ERROR'}")


if __name__ == "__main__":
    main()
