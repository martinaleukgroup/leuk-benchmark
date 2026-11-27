"""Arma la vista previa del generador de fichas para publicarla como página.
Uso: python3 armar.py <carpeta de la ref vista-previa> <repo> <salida> <etiqueta> [agrupaciones cambiadas, separadas por coma]

La carpeta de la ref trae fichas-data.js recién generado, assets/ficha (fotos e íconos) y ext/ (dibujos y
curvas bajados por la corrida). Acá se arma un JSON por agrupación con las imágenes ya embebidas,
así la página no depende de Google ni de la plataforma."""
import base64, hashlib, io, json, re, shutil, sys
from pathlib import Path
from PIL import Image

ref, repo, out, etiqueta = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4]
cambiadas = [x.strip() for x in (sys.argv[5] if len(sys.argv) > 5 else "").split(",") if x.strip()]

txt = (ref / "fichas-data.js").read_text(encoding="utf-8")
fichas = json.loads(txt[txt.index("["): txt.rindex("]") + 1])
mapa = json.loads((ref / "ext/mapa.json").read_text()) if (ref / "ext/mapa.json").exists() else {}

cache = {}
def data_uri(path, ancho=900):
    if path in cache: return cache[path]
    try:
        im = Image.open(path)
        im.load()
        if im.mode not in ("RGB", "RGBA"): im = im.convert("RGBA")
        if im.width > ancho: im = im.resize((ancho, round(im.height * ancho / im.width)), Image.LANCZOS)
        b = io.BytesIO(); im.save(b, "WEBP", quality=82, method=4)
        cache[path] = "data:image/webp;base64," + base64.b64encode(b.getvalue()).decode()
    except Exception:
        cache[path] = None
    return cache[path]

def resolver(v):
    if not isinstance(v, str): return v
    if v.startswith("assets/ficha/fotos/"):
        p = ref / v.split("?")[0]
        return data_uri(p) or v
    if v in mapa:
        return data_uri(ref / mapa[v], 1100) or v
    return v

IMG_KEYS = re.compile(r"^(foto_url|dibujo_url|curva_[a-z]+_url)$")
def recorrer(o):
    if isinstance(o, dict):
        return {k: (resolver(v) if IMG_KEYS.match(k) else recorrer(v)) for k, v in o.items()}
    if isinstance(o, list):
        return [recorrer(x) for x in o]
    return o

docs = {}
for f in fichas:
    if not (f.get("sku") or f.get("titulo")): continue
    docs.setdefault(f.get("agrupacion") or f.get("titulo"), []).append(f)

if out.exists(): shutil.rmtree(out)
(out / "d").mkdir(parents=True)
slug = lambda ag: re.sub(r"[^a-z0-9]+", "-", ag.lower()).strip("-")[:50] + "-" + hashlib.sha1(ag.encode()).hexdigest()[:6]
indice = []
for ag in sorted(docs, key=lambda s: s.lower()):
    fs = docs[ag]
    s = slug(ag)
    (out / "d" / f"{s}.json").write_text(json.dumps(recorrer(fs), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    skus = sorted({x for f in fs for x in (f.get("skus") or [f.get("sku")]) if x})
    indice.append({"ag": ag, "f": s, "v": fs[0].get("vertical", ""), "l": fs[0].get("linea", ""), "n": len(fs),
                   "skus": skus, "sinfoto": any(not f.get("foto_url") and not f.get("items") for f in fs)})
(out / "indice.json").write_text(json.dumps({"etiqueta": etiqueta, "cambiadas": cambiadas, "docs": indice}, ensure_ascii=False), encoding="utf-8")

shutil.copy(Path(__file__).parent / "index.html", out / "index.html")
for src in ("fichas-ui.js", "fichas.css"):
    shutil.copy(repo / src, out / src)
(out / "assets/ficha").mkdir(parents=True)
for p in (repo / "assets/ficha").glob("*.png"): shutil.copy(p, out / "assets/ficha" / p.name)
shutil.copytree(repo / "assets/fonts", out / "assets/fonts", ignore=shutil.ignore_patterns("*.otf", "*.woff*"))
tam = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
print(f"{len(indice)} agrupaciones · {sum(1 for _ in out.rglob('*') if _.is_file())} archivos · {tam/1e6:.1f} MB")
