#!/usr/bin/env python3
"""
fotos_webp.py — Convierte a WebP las fotos de producto que el Proceso 6 (n8n) necesita subir a la web.

Por qué existe (13/11/2026): n8n Cloud se quedaba sin memoria al abrir los originales grandes de Drive
(hay fotos de 10-16 MB). Acá, en GitHub, sobra memoria. n8n solo sube los WebP ya listos.

Circuito (flujo "Hub de marketing · Fotos WebP · puente GitHub (Proceso 6b)" en n8n):
  1. pendientes → n8n lee la hoja "Fotos Web a convertir" del Hub (la escribe el Proceso 6) y responde
                  las fotos que todavía no tienen WebP (o lo tienen de una versión vieja).
  2. bajar      → n8n devuelve el original de Drive. Acá se convierte: ancho máx. 1200 px, calidad 85.
  3. subir      → n8n guarda el WebP en "Fotos web (WebP) - Proceso 6 (automático)" con el id y md5
                  del original. Los originales de Drive NO se tocan.
  4. fin        → n8n deja una línea WEBP en "Log Fotos Web" y, si hubo conversiones, corre el Proceso 6.

Uso:
    python3 fotos_webp.py --modo prueba|real [--max 400] [--corrida 123] [--salida carpeta]

En prueba convierte y deja los WebP en --salida, pero no sube nada ni corre el Proceso 6.
Necesita N8N_FICHAS_URL (de ahí sale la dirección del puente) y N8N_FICHAS_TOKEN (secretos del repo).
"""
import argparse
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = None   # fotos de producto en alta: no son "bombas", hay que poder abrirlas

ANCHO_MAX = 1200
CALIDAD = 85
TIMEOUT = 300
ESPERAS = [10, 30, 60]          # reintentos ante cortes de red o 5xx


def url_puente():
    base = os.environ.get("N8N_FICHAS_URL", "").strip()
    if not base:
        return ""
    return base.rsplit("/", 1)[0] + "/leuk-fotos-webp"


def _pedir(req, binario=False):
    ultimo = None
    for i, espera in enumerate([0] + ESPERAS):
        if espera:
            time.sleep(espera)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                datos = r.read()
                return datos if binario else json.loads(datos.decode("utf-8") or "{}")
        except urllib.error.HTTPError as e:
            ultimo = f"HTTP {e.code}: {e.read()[:300]!r}"
            if e.code < 500:
                break
        except Exception as e:  # red, timeout
            ultimo = str(e)
    raise RuntimeError(ultimo or "sin respuesta")


def post_json(url, token, body, binario=False):
    req = urllib.request.Request(url, data=json.dumps(body, ensure_ascii=False).encode("utf-8"), method="POST",
                                 headers={"Content-Type": "application/json", "x-leuk-token": token})
    return _pedir(req, binario)


def post_webp(url, token, campos, nombre, datos):
    limite = "----leuk" + uuid.uuid4().hex
    partes = [f'--{limite}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode("utf-8")
              for k, v in campos.items()]
    partes.append((f'--{limite}\r\nContent-Disposition: form-data; name="webp"; filename="{nombre}"\r\n'
                   'Content-Type: image/webp\r\n\r\n').encode("utf-8"))
    partes.append(datos)
    partes.append(f"\r\n--{limite}--\r\n".encode("utf-8"))
    req = urllib.request.Request(url, data=b"".join(partes), method="POST",
                                 headers={"Content-Type": f"multipart/form-data; boundary={limite}", "x-leuk-token": token})
    return _pedir(req)


def a_webp(original: bytes) -> bytes:
    """Mismo criterio que usaba n8n: ancho máximo 1200 px (sin agrandar), calidad 85. Respeta la
    transparencia de los PNG y la rotación EXIF de las fotos de cámara."""
    with Image.open(io.BytesIO(original)) as im:
        im.draft("RGB", (ANCHO_MAX * 2, ANCHO_MAX * 2))   # JPEG enormes: decodifica ya reducido (más rápido)
        im = ImageOps.exif_transpose(im)
        transparente = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
        im = im.convert("RGBA" if transparente else "RGB")
        if im.width > ANCHO_MAX:
            alto = round(im.height * ANCHO_MAX / im.width)
            im = im.resize((ANCHO_MAX, alto), Image.LANCZOS)
        out = io.BytesIO()
        im.save(out, "WEBP", quality=CALIDAD, method=6)
        return out.getvalue()


def resumen(txt):
    p = os.environ.get("GITHUB_STEP_SUMMARY")
    if p:
        with open(p, "a", encoding="utf-8") as f:
            f.write(txt + "\n")
    print(txt)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--modo", choices=["prueba", "real"], default="prueba")
    ap.add_argument("--max", type=int, default=400, help="máximo de fotos a convertir en esta corrida")
    ap.add_argument("--corrida", default="")
    ap.add_argument("--salida", default="")
    a = ap.parse_args()

    url, token = url_puente(), os.environ.get("N8N_FICHAS_TOKEN", "").strip()
    if not url or not token:
        print("Faltan N8N_FICHAS_URL / N8N_FICHAS_TOKEN: no se hace nada.")
        return 0
    salida = Path(a.salida) if a.salida else None
    if salida:
        salida.mkdir(parents=True, exist_ok=True)

    plan = post_json(url, token, {"accion": "pendientes"})
    pendientes = plan.get("pendientes") or []
    resumen(f"## Fotos web · conversión a WebP · modo **{a.modo}**")
    resumen(f"Pedidas por el Proceso 6: **{plan.get('pedidas', 0)}** · ya tenían WebP: {plan.get('yaListas', 0)} · "
            f"a convertir: **{len(pendientes)}**" + (f" (esta corrida hace {a.max})" if len(pendientes) > a.max else ""))
    pendientes = pendientes[: a.max]
    if not pendientes:
        resumen("Nada para convertir.")
        return 0

    convertidas, errores, filas = 0, [], []
    for n, p in enumerate(pendientes, 1):
        nombre = (p.get("stem") or "foto") + ".webp"
        try:
            original = post_json(url, token, {"accion": "bajar", "drive": p["drive"]}, binario=True)
            webp = a_webp(original)
            if salida:
                (salida / nombre).write_bytes(webp)
            if a.modo == "real":
                r = post_webp(url, token, {"accion": "subir", "drive": p["drive"], "md5": p.get("md5", ""),
                                           "stem": p.get("stem", ""), "nombre": p.get("nombre", "")}, nombre, webp)
                if not r.get("ok"):
                    raise RuntimeError("n8n no confirmó la subida: " + json.dumps(r)[:200])
            convertidas += 1
            filas.append(f"| {p.get('nombre', '')} | {len(original) / 1e6:.1f} MB | {len(webp) / 1e3:.0f} KB |")
            print(f"[{n}/{len(pendientes)}] {p.get('nombre')} {len(original) / 1e6:.1f} MB → {len(webp) / 1e3:.0f} KB")
        except Exception as e:
            errores.append(f"{p.get('nombre', p.get('drive'))}: {str(e)[:150]}")
            print(f"[{n}/{len(pendientes)}] ERROR {p.get('nombre')}: {e}", file=sys.stderr)

    try:
        fin = post_json(url, token, {"accion": "fin", "modo": a.modo, "corrida": a.corrida, "pedidas": len(pendientes),
                                     "convertidas": convertidas, "errores": errores})
    except Exception as e:
        fin = {"ok": False, "error": str(e)}
    resumen(f"\nConvertidas: **{convertidas}** · errores: **{len(errores)}**"
            + (" · se corrió el Proceso 6 para subirlas a la web" if fin.get("proceso6") else ""))
    if errores:
        resumen("\n<details><summary>Errores</summary>\n\n" + "\n".join("- " + e for e in errores) + "\n</details>")
    if filas:
        resumen("\n<details><summary>Fotos convertidas</summary>\n\n| Foto | Original | WebP |\n|---|---|---|\n"
                + "\n".join(filas) + "\n</details>")
    print(f"::notice title=Fotos WebP::modo {a.modo} · {convertidas} convertidas · {len(errores)} errores")
    # Falla la corrida solo si no salió ninguna (así llega el aviso de GitHub); errores sueltos se reintentan solos mañana.
    return 1 if errores and not convertidas else 0


if __name__ == "__main__":
    sys.exit(main())
