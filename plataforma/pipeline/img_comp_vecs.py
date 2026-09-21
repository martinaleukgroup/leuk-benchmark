#!/usr/bin/env python3
"""Extrae los vectores de competencia del índice FAISS, promediados por slug.
Se corre en proceso aparte de torch (faiss + torch juntos segfaultean en macOS)."""
import json
import re

import faiss
import numpy as np

import paths as P


def slug_de_path(p):
    f = p.split("/")[-1]
    return re.sub(r"_\d+\.(jpg|png|jpeg)$", "", f, flags=re.I).lower()


def main():
    idx = faiss.read_index(str(P.FAISS_INDEX))
    paths = json.loads(P.FAISS_PATHS.read_text())
    V = idx.reconstruct_n(0, idx.ntotal)
    por_slug = {}
    for p, v in zip(paths, V):
        por_slug.setdefault(slug_de_path(p), []).append(v)
    slugs, vecs = [], []
    for s, vs in por_slug.items():
        m = np.mean(vs, axis=0)
        m = m / (np.linalg.norm(m) + 1e-9)
        slugs.append(s); vecs.append(m.astype("float32"))
    np.savez(P.ROOT / "pipeline/comp_slug_vecs.npz", slugs=np.array(slugs), vecs=np.array(vecs))
    print(f"Competencia: {len(slugs)} slugs con vector -> comp_slug_vecs.npz")


if __name__ == "__main__":
    main()
