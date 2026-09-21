#!/usr/bin/env python3
"""lucciola_tag.py — Etiqueta (forma) las fotos de familia de Lucciola con Claude visión,
mismo vocabulario controlado que el resto de las marcas. Salida: lucciola_etiquetas.json.

Es la señal que le faltaba a Lucciola: sin etiqueta queda con una sola señal (la técnica) y
la regla de acuerdo exige dos → todo terminaba en "posible, revisar".

Las fotos viven en el bucket público catalogo-img (URL en lucciola_families.json).
Re-ejecutable: saltea lo ya etiquetado.
"""
import base64
import json
import pathlib
import urllib.request

import anthropic

import paths as P
from img_leuk_tag import PROMPT, MODEL, get_key

FAM = P.ROOT / "pipeline/lucciola_families.json"
OUT = P.ROOT / "pipeline/lucciola_etiquetas.json"
CACHE = P.ROOT / "pipeline/.lucciola_thumb"


def bajar(url, dst):
    if dst.exists():
        return dst
    r = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    resp = urllib.request.urlopen(r, timeout=60)
    if not resp.headers.get("Content-Type", "").startswith("image/"):
        raise RuntimeError("no es imagen")
    dst.write_bytes(resp.read())
    return dst


def clasificar(client, data_b64, media):
    msg = client.messages.create(
        model=MODEL, max_tokens=400,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": media, "data": data_b64}},
            {"type": "text", "text": PROMPT},
        ]}],
    )
    txt = msg.content[0].text.strip()
    if txt.startswith("```"):
        txt = txt.split("```")[1].lstrip("json").strip()
    return json.loads(txt)


def main():
    CACHE.mkdir(exist_ok=True)
    fams = json.loads(FAM.read_text())
    tags = json.loads(OUT.read_text()) if OUT.exists() else {}
    client = anthropic.Anthropic(api_key=get_key())
    con_img = {s: v for s, v in fams.items() if v.get("img")}
    print(f"{len(con_img)} familias con foto · {len(tags)} ya etiquetadas")
    ok = skip = err = 0
    for s, v in sorted(con_img.items()):
        if s in tags:
            skip += 1; continue
        try:
            dst = bajar(v["img"], CACHE / f"{s}.jpg")
            data = base64.standard_b64encode(dst.read_bytes()).decode()
            tags[s] = clasificar(client, data, "image/jpeg")
            tags[s]["producto"] = v.get("nombre") or s
            ok += 1
            print(f"  ✓ {s}: {tags[s].get('tipo_forma')} / {tags[s].get('tipo_montaje')}")
            OUT.write_text(json.dumps(tags, ensure_ascii=False, indent=1))
        except Exception as e:
            err += 1; print(f"  ✗ {s}: {str(e)[:90]}")
    print(f"Lucciola etiquetas · nuevas={ok} · ya estaban={skip} · error={err} · total={len(tags)}")


if __name__ == "__main__":
    main()
