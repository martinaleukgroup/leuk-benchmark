# 03 · Proceso de scraping / carga de un competidor

> Estado real al 2026-07-16. **Aviso importante:** el título dice "scraping" pero el proceso
> real es sólo parcialmente automático — **la extracción de fichas técnicas la hace un humano
> con Claude, a mano, desde PDFs**. Esto se documenta tal cual porque es probablemente el
> hallazgo más relevante para una auditoría de arquitectura.

---

## Resumen honesto del proceso

| Etapa | ¿Automática? | Herramienta |
|---|---|---|
| 1. Conseguir el catálogo/lista de precios | ❌ manual | PDF que manda el proveedor o se baja de su web |
| 2. PDF → Excel de fichas (23 campos) | ⚠️ semi | **Claude con un skill**, revisado a mano |
| 3. Conseguir las imágenes | ❌ manual | Carpeta de imágenes (`Bases de datos/Imágenes/…`) |
| 4. Imágenes → embeddings + foto representativa | ✅ script | `wlg_build.py` |
| 5. Fotos → etiquetas de forma | ✅ script | `wlg_tag.py` (Claude visión) |
| 6. Precios que el PDF no trae | ❌ manual | JSON escrito a mano (`wlg_precio_manual.json`) |
| 7. Consolidar todo | ✅ script | `consolidate.py` |
| 8. Publicar | ✅ script | `subir_datos.py` |

**No hay scraping HTTP salvo un caso**: `artelum_web_fetch.py`, que baja fotos de la intranet
de Artelum por un patrón de URL público. El resto de las imágenes llegan como carpeta.

---

## El flujo manual completo (lo que hace la usuaria hoy)

### A. Sumar un competidor NUEVO

1. **Conseguir el material**: PDF de catálogo + lista de precios del proveedor. Llega por mail
   o se baja de la web del competidor. *(100% manual)*

2. **Extraer las fichas técnicas con Claude.** Se usa un skill dedicado
   (`anthropic-skills:catalogo-vonderk`) que recibe el PDF y devuelve un Excel con **23 campos
   por SKU**, separados por sección (Interior/Exterior × Técnico/Decorativo, Soluciones).
   El prompt del skill, textual:

   > *Te paso el PDF de la "Lista de Precios General" de Vonderk. Quiero extraer, por cada SKU,
   > una ficha técnica completa a un Excel prolijo. Cubrí TODAS las familias del catálogo,
   > separadas por sección: Interior Técnico · Interior Decorativo · Exterior Técnico ·
   > Exterior Decorativo · Soluciones/Sistemas.*
   > *CAMPOS A EXTRAER POR SKU (23): Nombre/SKU, Familia, Fuente de luz, Potencia (W), Lúmenes
   > del sistema, Lúmenes de la fuente, Eficiencia (lm/W), Tensión (V), Ángulo de haz, CRI,
   > Temp. de color (K), McAdams step, UGR, IP, Eficiencia energética, IK, Clase,
   > Fijación/montaje, Medidas, Movimiento, Peso, Color del artefacto, Control, Garantía.*
   > *Sumá además: Precio, Precio mínimo sugerido y una columna "Sección" y otra "Fuente del dato".*

   Salida → `Bases de datos/Fichas técnicas/<Marca>_Fichas_Tecnicas_N<nn>.xlsx`,
   **hoja obligatoria: `Catálogo completo`** (el pipeline la busca por ese nombre exacto).

3. **Revisar el Excel a mano.** La extracción de un PDF nunca sale perfecta: hay que chequear
   que las familias estén completas y que los números no se hayan mezclado entre columnas.
   *(100% manual, es el paso que más tiempo lleva)*

4. **Registrar la marca en el pipeline** — 3 ediciones de código:
   - `pipeline/paths.py` → agregar la ruta del Excel al dict `FICHAS`.
   - `pipeline/consolidate.py` → agregar la marca a `MARCAS = [...]`.
   - `app/app.js` → `MARCAS` también está **hardcodeado en el frontend**.

5. **Cargar el descuento comercial** en la DB (si no, el precio neto = precio de lista):
   ```sql
   INSERT INTO descuentos_competidores (marca, desc_total) VALUES ('<Marca>', 51.4);
   ```

6. **Imágenes**: dejar la carpeta en `Bases de datos/Imágenes/imagenes_<marca>/` y correr el
   build de imágenes (ver §B del código). Genera embeddings + foto representativa.

7. **Etiquetar las fotos** con Claude visión (`<marca>_tag.py`).

8. **Precios faltantes**: los que el PDF no trae se cargan a mano en
   `pipeline/<marca>_precio_manual.json` (`{ "fslug": precio_usd }`).

9. **Consolidar y publicar**:
   ```bash
   cd ~/leuk-benchmark/pipeline
   python3 consolidate.py     # regenera data/benchmark_data.json
   python3 subir_datos.py     # lo sube al bucket privado de Supabase
   ```

10. **Verificar en la app** que los matches nuevos tengan sentido (a ojo, producto por producto).

### B. Actualizar un competidor EXISTENTE

**Sólo precios** (lo más frecuente) — 2 caminos:

- **Desde la app** (no requiere la máquina): botón **⬆ Precios** → elegir marca → subir Excel
  (columnas SKU/código + Precio). Matchea por código, muestra resumen y escribe a la tabla
  `precios` de Supabase. Requiere rol `editor` o `admin`. *Es un override que pisa el precio
  del JSON.*
- **Desde el pipeline**: reemplazar el Excel de fichas y correr `consolidate.py` + `subir_datos.py`.

**Fichas / imágenes / matches nuevos**: requiere sí o sí la máquina con el proyecto y repetir
los pasos 2-3 y 6-9.

---

## Puntos frágiles del proceso (para la auditoría)

1. **La marca está hardcodeada en 3 lugares** (`paths.py`, `consolidate.py`, `app.js`) — sumar
   un competidor toca código, no configuración.
2. **El nombre de hoja `Catálogo completo` es un contrato implícito**: si el Excel viene con
   otro nombre, la marca queda con 0 filas y el pipeline **no falla, sigue silencioso**
   (`if not ruta.exists(): fichas[marca] = pd.DataFrame()`).
3. **No hay validación de esquema del Excel.** Si Claude devuelve una columna con otro nombre
   (`Potencia` en vez de `Potencia (W)`), ese campo queda vacío para toda la marca, sin aviso.
4. **No hay versionado ni trazabilidad de la extracción**: el Excel se pisa. Existe la columna
   `Fuente del dato` en el schema de extracción, pero **no se lleva al JSON**.
5. **`es_foto_producto()` es una heurística frágil**: decide si una imagen es "foto de producto"
   mirando el desvío estándar y la luminancia del **marco de 8% del borde** (`std < 34` y
   `lum < 60 or lum > 200`). Descarta fotos ambientadas y diagramas, pero es un umbral mágico
   sin tests.
6. **El precio y la ficha pueden venir de variantes distintas** de la misma familia
   (`precio_aprox: true`), y eso no se ve en la UI salvo por una etiqueta.
7. **La API key de Anthropic se lee de `pricing.db` en texto plano** (tabla `config`) si no hay
   variable de entorno. 🔴 Pendiente de rotar.
8. **Los scripts asumen la máquina de la usuaria**: rutas absolutas a iCloud con emojis en el
   path (`📊 | Comercial/…`), centralizadas en `paths.py`.

---

## Código completo del ejemplo: World Leds Go

Se elige **WLG** porque es el competidor cuyo proceso está más completo y representa el flujo
típico de punta a punta: carpeta de imágenes → filtrado → embeddings → foto para la app →
etiquetado con Claude visión.

### `pipeline/wlg_build.py` — imágenes → embeddings + foto representativa (116 líneas)

```python
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
```

---

### `pipeline/wlg_tag.py` — etiquetado de forma con Claude visión (50 líneas)

```python
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
```

> Reusa `VOCAB`, `PROMPT`, `MODEL` y `get_key` de `img_leuk_tag.py` — mismo vocabulario
> controlado para Leuk y competencia (condición necesaria para que la señal sea comparable).

---

### `pipeline/img_leuk_tag.py` — vocabulario y prompt de la señal ETIQUETACIÓN (extracto)

```python
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
```

---

### `pipeline/artelum_web_fetch.py` — el ÚNICO scraping HTTP real del proyecto (81 líneas)

```python
#!/usr/bin/env python3
"""
artelum_web_fetch.py — Baja la foto 'principal' de las entidades Artelum que tienen
id numérico pero seguían sin imagen, usando el patrón público
https://intranet.artelum.com.ar/uploads/lineas/linea_{id}_principal.{png,jpg}
(que SÍ carga públicamente, verificado). Filtra que sea foto de producto y la
empaqueta a app/img/artelum/{id}.jpg, sumándola a artelum_families.json.
Re-ejecutable.
"""
import json
import io
import time
import urllib.request

from PIL import Image

import paths as P
from wlg_build import es_foto_producto

BASE = "https://intranet.artelum.com.ar/uploads/lineas/linea_{id}_principal.{ext}"
OUT_IMG = P.ROOT / "app/img/artelum"
FAM = P.ROOT / "pipeline/artelum_families.json"
DATA = P.ROOT / "data/benchmark_data.json"
MAX_PX = 800


def bajar(url, intentos=3):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    for i in range(intentos):
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                # el server responde 200 con un HTML de error para variantes inexistentes
                ct = (r.headers.get("Content-Type") or "").lower()
                if r.status == 200 and ct.startswith("image/"):
                    return r.read()
                return None
        except urllib.error.HTTPError:
            return None
        except Exception:
            time.sleep(2 * (i + 1))
    return None


def main():
    data = json.loads(DATA.read_text())
    comp = data.get("competencia", [])
    art = [c for c in comp if c.get("marca") == "Artelum"
           and not c.get("imagen") and str(c.get("fslug", "")).isdigit()]
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    fam = json.loads(FAM.read_text()) if FAM.exists() else {}

    ok = no_foto = no_url = 0
    tmp = P.ROOT / "pipeline/.artelum_tmp"; tmp.mkdir(exist_ok=True)
    for c in art:
        rid = str(c["fslug"])
        raw = None
        for ext in ("png", "jpg"):
            raw = bajar(BASE.format(id=rid, ext=ext))
            if raw:
                break
        if not raw:
            no_url += 1; continue
        try:
            im = Image.open(io.BytesIO(raw)).convert("RGB")
            if min(im.size) < 120:          # descarta íconos/miniaturas rotas
                no_foto += 1; continue
            # '_principal' es la foto curada por Artelum → confiamos; sólo evitamos íconos
            im.thumbnail((MAX_PX, MAX_PX))
            im.save(OUT_IMG / f"{rid}.jpg", "JPEG", quality=82)
            fam[rid] = {"nombre": c.get("nombre") or rid, "img": f"img/artelum/{rid}.jpg"}
            ok += 1
            print(f"  ✓ {rid}  {c.get('nombre')}")
        except Exception as e:
            no_foto += 1; print(f"  ✗ {rid}: {str(e)[:40]}")

    FAM.write_text(json.dumps(fam, ensure_ascii=False, indent=1))
    print(f"\nArtelum web · nuevas={ok} · no eran foto de producto={no_foto} · sin URL={no_url}")


if __name__ == "__main__":
    main()
```

---

### `pipeline/run_all.sh` — orquestador de punta a punta

```bash
#!/usr/bin/env bash
# run_all.sh — corre todo el pipeline de punta a punta y regenera la app.
# Uso:  cd ~/leuk-benchmark/pipeline && bash run_all.sh
set -e
cd "$(dirname "$0")"

echo "▶ 1/6  Manifiesto de imágenes Leuk (Drive)…"
python3 img_leuk_manifest.py

echo "▶ 2/6  Descarga de miniaturas Leuk…"
python3 img_leuk_download.py

echo "▶ 3/6  Vectores de competencia (FAISS)…"
python3 img_comp_vecs.py

echo "▶ 4/6  Embeddings visuales de Leuk…"
python3 img_leuk_embed.py

echo "▶ 5/6  Etiquetación visual de Leuk (Claude visión)…"
python3 img_leuk_tag.py

echo "▶ 6/6  Consolidación → benchmark_data.json + app/data.js…"
python3 consolidate.py

echo "✓ Listo. Abrí ~/leuk-benchmark/app/index.html o publicá la carpeta app/."
```

> ⚠️ `run_all.sh` está **desactualizado**: dice que genera `app/data.js`, pero ese archivo
> ya no se publica (los datos van a Supabase). Tampoco incluye `subir_datos.py` ni los
> builds de WLG/Artelum. El flujo real hoy es `consolidate.py` + `subir_datos.py`.
