#!/usr/bin/env python3
"""wlg_tag.py — Etiqueta (forma) las fotos representativas de WLG con Claude visión,
mismo vocabulario controlado que el resto. Salida: wlg_etiquetas.json. Re-ejecutable."""
import json
import base64

import anthropic

import paths as P
from img_leuk_tag import VOCAB, PROMPT, MODEL, get_key

IMG_DIR = P.ROOT / "app/img/wlg"
OUT = P.ROOT / "pipeline/wlg_etiquetas.json"


def clasificar(client, img_path):
    data = base64.standard_b64encode(img_path.read_bytes()).decode()
    msg = client.messages.create(
        model=MODEL, max_tokens=400,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": data}},
            {"type": "text", "text": PROMPT},
        ]}],
    )
    txt = msg.content[0].text.strip()
    if txt.startswith("```"):
        txt = txt.split("```")[1].lstrip("json").strip()
    return json.loads(txt)


def main():
    client = anthropic.Anthropic(api_key=get_key())
    tags = json.loads(OUT.read_text()) if OUT.exists() else {}
    files = sorted(IMG_DIR.glob("*.jpg"))
    ok = skip = err = 0
    for f in files:
        s = f.stem
        if s in tags:
            skip += 1; continue
        try:
            tags[s] = clasificar(client, f); ok += 1
            print(f"  ✓ {s}: {tags[s].get('tipo_forma')} / {tags[s].get('tipo_montaje')}")
            OUT.write_text(json.dumps(tags, ensure_ascii=False, indent=1))
        except Exception as e:
            err += 1; print(f"  ✗ {s}: {e}")
    print(f"WLG etiquetas · nuevas={ok} · ya estaban={skip} · error={err}")


if __name__ == "__main__":
    main()
