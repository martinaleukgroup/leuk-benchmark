#!/usr/bin/env python3
"""lucciola_embed.py — Embeddings visuales (señal VISUAL) de las fotos de familia de Lucciola.

MISMO modelo que el resto: OpenCLIP ViT-B-32 / laion2b_s34b_b79k (512 dim, normalizado).
Las fotos ya están cacheadas en pipeline/.lucciola_thumb por lucciola_tag.py.
Salida: lucciola_vecs.npz (slugs[], vecs[Nx512]). Re-ejecutable.
"""
import numpy as np
import torch
import open_clip
from PIL import Image

import paths as P

MODEL_NAME, PRETRAINED = "ViT-B-32", "laion2b_s34b_b79k"
CACHE = P.ROOT / "pipeline/.lucciola_thumb"
OUT = P.ROOT / "pipeline/lucciola_vecs.npz"


def main():
    files = sorted(CACHE.glob("*.jpg"))
    if not files:
        raise SystemExit(f"Sin fotos en {CACHE} — corré lucciola_tag.py primero.")
    print(f"Cargando OpenCLIP {MODEL_NAME}/{PRETRAINED} · {len(files)} fotos …", flush=True)
    model, _, preprocess = open_clip.create_model_and_transforms(MODEL_NAME, pretrained=PRETRAINED)
    model.eval()
    slugs, vecs = [], []
    with torch.no_grad():
        for i, f in enumerate(files, 1):
            try:
                t = preprocess(Image.open(f).convert("RGB")).unsqueeze(0)
            except Exception as e:
                print(f"  ✗ {f.stem}: {e}"); continue
            v = model.encode_image(t)
            v = (v / v.norm(dim=-1, keepdim=True)).cpu().numpy()[0]
            slugs.append(f.stem); vecs.append(v.astype("float32"))
            if i % 50 == 0:
                print(f"  {i}/{len(files)}", flush=True)
    np.savez(OUT, slugs=np.array(slugs), vecs=np.array(vecs, dtype="float32"))
    print(f"→ {OUT.name}: {len(slugs)} vectores")


if __name__ == "__main__":
    main()
