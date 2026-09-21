#!/usr/bin/env python3
"""
probar_acceso.py — Comprueba que una cuenta puede operar el pipeline sin la
service key. No modifica datos: re-sube benchmark_data.json con los MISMOS
bytes que ya están publicados (upsert idéntico = no-op).

    python3 probar_acceso.py
"""
import json
import urllib.error
import urllib.request

import auth_sesion
from auth_sesion import SB_URL

OBJ = f"{SB_URL}/storage/v1/object/datos/benchmark_data.json"


def rpc(H, nombre):
    req = urllib.request.Request(f"{SB_URL}/rest/v1/rpc/{nombre}", data=b"{}",
                                 method="POST", headers=H)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return f"error {e.code}"


def main():
    H = auth_sesion.headers()
    print("✓ Login OK")

    print(f"  puede_integrar()    → {rpc(H, 'puede_integrar')}   (tiene que dar True)")
    print(f"  puede_ver_costos()  → {rpc(H, 'puede_ver_costos')}   (True sólo admin/lider)")

    req = urllib.request.Request(OBJ, headers=H)
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    print(f"✓ Lectura de benchmark_data.json ({len(data)//1024} KB)")

    req = urllib.request.Request(OBJ, data=data, method="POST",
                                 headers={**H, "x-upsert": "true"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            print(f"✓ Escritura en bucket 'datos' permitida (HTTP {r.status}) — "
                  "subir_datos.py va a funcionar")
    except urllib.error.HTTPError as e:
        print(f"✗ Escritura en bucket 'datos' DENEGADA ({e.code}): {e.read().decode()[:200]}")
        print("  → revisar la policy datos_ins/datos_upd y el rol en perfiles")


if __name__ == "__main__":
    main()
