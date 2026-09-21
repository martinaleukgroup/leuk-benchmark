#!/usr/bin/env python3
"""
artelum_build.py — Embeddings visuales de Artelum (que no estaba en el índice visual).
Artelum ya tiene etiquetas (forma) y fotos (índice); sólo faltaba la señal visual.
Usa las imágenes locales del índice, embebe con OpenCLIP y las suma a la competencia.
Salida: artelum_vecs.npz (slug numérico -> vector).
"""
import numpy as np
import torch
import open_clip
import pandas as pd
from PIL import Image

import paths as P
from normalize import slug
from wlg_build import es_foto_producto

IMG_BASE = P.WORK / "Bases de datos/Imágenes/imagenes_artelum"
MODEL_NAME, PRETRAINED = "ViT-B-32", "laion2b_s34b_b79k"


def main():
    idx = pd.read_csv(P.INDICES["Artelum"]).fillna("")
    print(f"Artelum índice: {len(idx)} productos", flush=True)
    print(f"Cargando OpenCLIP {MODEL_NAME}…", flush=True)
    model, _, preprocess = open_clip.create_model_and_transforms(MODEL_NAME, pretrained=PRETRAINED)
    model.eval()

    slugs, vecs = [], []
    with torch.no_grad():
        for _, row in idx.iterrows():
            s = slug(str(row.get("id")))
            archivos = [a.strip() for a in str(row.get("archivos_locales", "")).split("|") if a.strip()]
            embs = []
            for a in archivos:
                f = IMG_BASE / a
                if not f.exists() or not es_foto_producto(f):
                    continue
                try:
                    t = preprocess(Image.open(f).convert("RGB")).unsqueeze(0)
                    v = model.encode_image(t)
                    embs.append((v / v.norm(dim=-1, keepdim=True)).cpu().numpy()[0])
                except Exception:
                    continue
            if not embs or not s:
                continue
            m = np.mean(embs, axis=0); m = m / (np.linalg.norm(m) + 1e-9)
            slugs.append(s); vecs.append(m.astype("float32"))
    np.savez(P.ROOT / "pipeline/artelum_vecs.npz", slugs=np.array(slugs), vecs=np.array(vecs, dtype="float32"))
    print(f"Artelum: {len(slugs)} productos embebidos -> artelum_vecs.npz", flush=True)


if __name__ == "__main__":
    main()
