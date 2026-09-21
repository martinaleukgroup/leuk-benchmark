#!/usr/bin/env python3
"""
wlg_build.py — Incorpora las imágenes nuevas de WLG (WLG_Imagenes/) al motor:
  - agrupa por sub-producto (prefijo del archivo antes de _pNNN)
  - descarta crops que son diagramas/tablas (aspecto muy alargado)
  - embebe cada sub-producto con OpenCLIP (mismo espacio que la competencia)
  - guarda una foto representativa optimizada para la app (app/img/wlg/<slug>.jpg)

Salidas: wlg_vecs.npz (slug -> vector) · wlg_families.json (slug -> {nombre, img}).
NO importa faiss (segfault con torch). El etiquetado va en wlg_tag.py.
"""
import json
import re
from io import BytesIO

import numpy as np
import torch
import open_clip
from PIL import Image

import paths as P

WLG_DIR = P.WORK / "Bases de datos/Imágenes/imagenes_wlg/WLG_Imagenes"
IMG_OUT = P.ROOT / "app/img/wlg"
MODEL_NAME, PRETRAINED = "ViT-B-32", "laion2b_s34b_b79k"

from normalize import slug

def subproducto(fname):
    m = re.match(r"(.*?)_p\d+", fname)
    base = m.group(1) if m else re.sub(r"\.(png|jpg|jpeg|webp)$", "", fname, flags=re.I)
    return base

def dims(fname):
    m = re.search(r"(\d+)x(\d+)\.", fname)
    return (int(m.group(1)), int(m.group(2))) if m else (None, None)

def es_diagrama(w, h):
    if not w or not h:
        return False
    a = w / h
    return a > 2.3 or a < 0.43        # barras/tablas muy alargadas


def es_foto_producto(path):
    """True si es foto de producto sobre fondo liso (no ambientada ni composición).
    Mira el marco de borde: fondo uniforme (std bajo) y extremo (muy oscuro o muy claro)."""
    try:
        im = Image.open(path).convert("RGB")
        im.thumbnail((200, 200))
        px = np.asarray(im, dtype="float32")
        h, w, _ = px.shape
        b = max(4, int(min(h, w) * 0.08))
        border = np.concatenate([px[:b].reshape(-1, 3), px[-b:].reshape(-1, 3),
                                 px[:, :b].reshape(-1, 3), px[:, -b:].reshape(-1, 3)])
        std = float(border.std()); lum = float(border.mean())
        return std < 34 and (lum < 60 or lum > 200)
    except Exception:
        return False

def main():
    IMG_OUT.mkdir(parents=True, exist_ok=True)
    grupos = {}   # slug -> {"nombre":..., "files":[Path,...]}
    for fam_dir in sorted(WLG_DIR.iterdir()):
        if not fam_dir.is_dir():
            continue
        for f in fam_dir.iterdir():
            if f.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
                continue
            w, h = dims(f.name)
            if es_diagrama(w, h) or not es_foto_producto(f):
                continue                      # descarta diagramas, ambientadas y composiciones
            sp = subproducto(f.name)
            s = slug(sp)
            if not s:
                continue
            g = grupos.setdefault(s, {"nombre": sp.replace("_", " "), "files": []})
            g["files"].append((f, (w or 0) * (h or 0)))
    print(f"Sub-productos WLG con foto de producto limpia: {len(grupos)}", flush=True)

    print(f"Cargando OpenCLIP {MODEL_NAME}…", flush=True)
    model, _, preprocess = open_clip.create_model_and_transforms(MODEL_NAME, pretrained=PRETRAINED)
    model.eval()

    slugs, vecs, fams = [], [], {}
    with torch.no_grad():
        for s, g in grupos.items():
            embs = []
            files = [f for f, _ in g["files"]]
            for f in files:
                try:
                    t = preprocess(Image.open(f).convert("RGB")).unsqueeze(0)
                    v = model.encode_image(t)
                    embs.append((v / v.norm(dim=-1, keepdim=True)).cpu().numpy()[0])
                except Exception:
                    continue
            if not embs:
                continue
            m = np.mean(embs, axis=0); m = m / (np.linalg.norm(m) + 1e-9)
            slugs.append(s); vecs.append(m.astype("float32"))
            # foto representativa = la más grande
            rep = max(g["files"], key=lambda x: x[1])[0]
            try:
                im = Image.open(rep).convert("RGB"); im.thumbnail((800, 800))
                im.save(IMG_OUT / f"{s}.jpg", "JPEG", quality=82)
                fams[s] = {"nombre": g["nombre"], "img": f"img/wlg/{s}.jpg"}
            except Exception:
                fams[s] = {"nombre": g["nombre"], "img": None}

    np.savez(P.ROOT / "pipeline/wlg_vecs.npz", slugs=np.array(slugs), vecs=np.array(vecs, dtype="float32"))
    (P.ROOT / "pipeline/wlg_families.json").write_text(json.dumps(fams, ensure_ascii=False, indent=1))
    print(f"WLG: {len(slugs)} sub-productos embebidos · {sum(1 for f in fams.values() if f['img'])} con foto", flush=True)


if __name__ == "__main__":
    main()
