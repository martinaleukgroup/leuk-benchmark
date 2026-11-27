"""Baja las imágenes externas de las fichas (dibujos y curvas en lh3.googleusercontent.com)
a <destino>/ext/, para que la vista previa no dependa de Google. Escribe ext/mapa.json: url -> archivo.
Uso: python3 vista_previa_ext.py fichas-data.js <destino>"""
import hashlib, json, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

src, dest = Path(sys.argv[1]), Path(sys.argv[2]) / "ext"
dest.mkdir(parents=True, exist_ok=True)
urls = sorted(set(re.findall(r'"(?:dibujo_url|curva_[a-z]+_url|foto_url|url)": "(https://lh3\.googleusercontent\.com/[^"]+)"', src.read_text(encoding="utf-8"))))
EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg"}

def baja(u):
    chica = re.sub(r"=w\d+$", "=w900", u)
    nombre = hashlib.sha1(u.encode()).hexdigest()[:16]
    for intento in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(chica, headers={"User-Agent": "Mozilla/5.0"}), timeout=30) as r:
                ext = EXT.get(r.headers.get_content_type(), "img")
                (dest / f"{nombre}.{ext}").write_bytes(r.read())
                return u, f"ext/{nombre}.{ext}"
        except Exception:
            pass
    return u, None

with ThreadPoolExecutor(8) as ex:
    res = dict(ex.map(baja, urls))
ok = {u: f for u, f in res.items() if f}
(dest / "mapa.json").write_text(json.dumps(ok, indent=0), encoding="utf-8")
print(f"vista previa: {len(ok)}/{len(urls)} imágenes externas bajadas")
