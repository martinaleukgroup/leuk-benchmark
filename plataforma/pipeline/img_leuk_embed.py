#!/usr/bin/env python3
"""
img_leuk_embed.py — Embeddings visuales de las fotos Leuk (señal VISUAL).

MISMO modelo que el índice de competencia: OpenCLIP ViT-B-32 / laion2b_s34b_b79k
(dim 512, normalizado). NO importa faiss (segfaultea junto a torch en macOS);
los vectores de competencia los produce img_comp_vecs.py.

Salida: leuk_embeddings.npz (skus[], vecs[Nx512]).
Al final imprime, para cada Leuk, los competidores visualmente más parecidos.
"""
import numpy as np
import torch
import open_clip
from PIL import Image

import paths as P

MODEL_NAME, PRETRAINED = "ViT-B-32", "laion2b_s34b_b79k"


def main():
    print(f"Cargando OpenCLIP {MODEL_NAME}/{PRETRAINED} …", flush=True)
    model, _, preprocess = open_clip.create_model_and_transforms(MODEL_NAME, pretrained=PRETRAINED)
    model.eval()

    files = sorted(P.IMG_LEUK.glob("*.jpg"))
    skus, vecs = [], []
    with torch.no_grad():
        for f in files:
            t = preprocess(Image.open(f).convert("RGB")).unsqueeze(0)
            v = model.encode_image(t)
            v = (v / v.norm(dim=-1, keepdim=True)).cpu().numpy()[0]
            skus.append(f.stem); vecs.append(v.astype("float32"))
    vecs = np.array(vecs, dtype="float32")
    np.savez(P.LEUK_EMB, skus=np.array(skus), vecs=vecs)
    print(f"Leuk: {len(skus)} imágenes embebidas -> leuk_embeddings.npz", flush=True)

    # demo (numpy puro, sin faiss)
    cz = np.load(P.ROOT / "pipeline/comp_slug_vecs.npz", allow_pickle=True)
    cslugs, cvecs = list(cz["slugs"]), cz["vecs"]
    print("\n--- Top competidores por similitud visual ---")
    for sku, v in zip(skus, vecs):
        sims = cvecs @ v
        top = np.argsort(-sims)[:3]
        print(f"  Leuk {sku}: " + ", ".join(f"{cslugs[i]}={sims[i]:.2f}" for i in top))


if __name__ == "__main__":
    main()
