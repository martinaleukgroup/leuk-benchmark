#!/usr/bin/env python3
"""
img_leuk_tag.py — Etiquetación visual de las fotos Leuk (señal ETIQUETACIÓN).

Clasifica cada foto Leuk con el MISMO vocabulario controlado que se usó para la
competencia (tipo_forma, tipo_montaje, color, terminacion, estilo, etc.) usando
Claude visión. Salida: leuk_etiquetas.json (sku -> dict de etiquetas).

Re-ejecutable: sólo etiqueta los SKU que faltan (salvo --force).
La API key se lee de la tabla config de pricing.db (⚠ conviene rotarla y moverla
a una variable de entorno ANTHROPIC_API_KEY).
"""
import argparse
import base64
import json
import os
import sqlite3

import anthropic

import paths as P

VOCAB = {
    "tipo_forma": ["anillo", "disco_plato", "tambor", "esfera_globo", "cilindro_tubo",
                   "campana", "cono", "lineal_barra", "panel", "caja_rectangular", "proyector"],
    "tipo_montaje": ["colgante", "plafon", "embutido", "aplique_pared", "riel", "sobremesa",
                     "pie", "proyector", "exterior_suelo", "no_determinable"],
    "color": ["negro", "blanco", "gris", "grafito", "antracita", "bronce", "dorado", "plata",
              "cobre", "niquel", "arena", "madera", "verde", "azul", "rojo", "transparente"],
    "terminacion": ["mate", "satinado", "brillante", "texturado", "no_determinable"],
    "orientacion": ["vertical", "horizontal", "redonda_simetrica", "no_determinable"],
    "proporcion": ["compacta", "alargada", "esbelta", "voluminosa", "no_determinable"],
    "estilo": ["minimalista", "tecnico", "industrial", "clasico", "organico", "otro"],
    "material_aparente": ["aluminio", "acero", "vidrio", "acrilico_pc", "tela", "madera",
                          "yeso_cemento", "mixto", "no_determinable"],
    "difusor_visible": ["opal_blanco", "transparente", "panal_louver", "sin_difusor", "no_determinable"],
}
MODEL = os.environ.get("TAG_MODEL", "claude-haiku-4-5-20251001")

PROMPT = (
    "Sos un clasificador de luminarias. Mirá la foto y clasificá el artefacto usando "
    "EXCLUSIVAMENTE estos vocabularios (elegí un solo valor por campo):\n"
    + json.dumps(VOCAB, ensure_ascii=False, indent=0)
    + "\n\nDevolvé SOLO un JSON con estas claves: "
    "tipo_forma, tipo_montaje, color, terminacion, orientacion, proporcion, estilo, "
    "material_aparente, difusor_visible, es_foto_ambientada (SI/NO), confianza (0.00-1.00), "
    "notas (breve). Sin texto extra, solo el JSON."
)


def get_key():
    if os.environ.get("ANTHROPIC_API_KEY"):
        return os.environ["ANTHROPIC_API_KEY"]
    con = sqlite3.connect(str(P.DB))
    row = con.execute("SELECT valor FROM config WHERE clave='anthropic_api_key'").fetchone()
    con.close()
    return row[0] if row else None


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
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    client = anthropic.Anthropic(api_key=get_key())
    tags = json.loads(P.LEUK_TAGS.read_text()) if P.LEUK_TAGS.exists() else {}
    files = sorted(P.IMG_LEUK.glob("*.jpg"))
    ok = skip = err = 0
    for f in files:
        sku = f.stem
        if sku in tags and not args.force:
            skip += 1; continue
        try:
            tags[sku] = clasificar(client, f)
            ok += 1
            print(f"  ✓ {sku}: {tags[sku].get('tipo_forma')} / {tags[sku].get('tipo_montaje')} / {tags[sku].get('color')}")
            P.LEUK_TAGS.write_text(json.dumps(tags, ensure_ascii=False, indent=1))  # guardar incremental
        except Exception as e:
            err += 1
            print(f"  ✗ {sku}: {e}")
    print(f"Etiquetas Leuk · nuevas={ok} · ya estaban={skip} · error={err}")


if __name__ == "__main__":
    main()
