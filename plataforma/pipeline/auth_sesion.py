#!/usr/bin/env python3
"""
auth_sesion.py — Login contra Supabase Auth, el mismo mecanismo que usa la app
(app.js → AUTHSES.login). Reemplaza a la service_role key en los scripts de
pipeline/: cada persona se loguea con su propia cuenta y su acceso queda
acotado por las políticas RLS de su rol (perfiles.rol), no por una llave
maestra que bypasea todo.

Credenciales: variables de entorno LEUK_EMAIL / LEUK_PASSWORD; si faltan se
piden por consola (la contraseña no se muestra ni se guarda en ningún lado).

Uso típico en un script del pipeline:
    import auth_sesion
    H = auth_sesion.headers()   # {"apikey":..., "Authorization": "Bearer <jwt>", ...}
"""
import getpass
import json
import os
import urllib.error
import urllib.request

SB_URL = "https://cswqoretlhppxkelysny.supabase.co"
# Publishable key: es pública por diseño (la misma que usa app.js), la seguridad
# real la hacen las políticas RLS del lado del servidor, no esta key.
SB_KEY = "sb_publishable_Rpbm5uyhUp8aTvoCnHylyA_B0wq8sRs"

_cache = {}


def headers():
    """Headers listos para pegarle a la REST/Storage de Supabase con el JWT del usuario logueado."""
    if "token" not in _cache:
        _cache["token"] = _login()
    return {
        "apikey": SB_KEY,
        "Authorization": f"Bearer {_cache['token']}",
        "Content-Type": "application/json",
    }


def _login():
    email = os.environ.get("LEUK_EMAIL") or input("Email de Supabase: ").strip()
    password = os.environ.get("LEUK_PASSWORD") or getpass.getpass("Contraseña: ")
    req = urllib.request.Request(
        f"{SB_URL}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": password}).encode(),
        method="POST",
        headers={"apikey": SB_KEY, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.load(r)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Login a Supabase falló ({e.code}): {e.read().decode()[:300]}")
    if not d.get("access_token"):
        raise SystemExit("Login a Supabase falló: no vino access_token en la respuesta")
    return d["access_token"]
