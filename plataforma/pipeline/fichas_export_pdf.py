#!/usr/bin/env python3
"""
fichas_export_pdf.py — Genera TODAS las fichas en PDF (con Chrome headless, calidad
perfecta y con las imágenes de Drive) y las empaqueta en un ZIP.

Cada "documento" (agrupación) sale como un PDF (con varias hojas si corresponde).
Requiere: Google Chrome instalado + internet (para bajar las imágenes de Drive).

Salida: <ROOT>/fichas_tecnicas.zip  (moverlo/sincronizarlo a la carpeta de Drive pública).

Se ejecuta al final de run_all.sh. Puede tardar varios minutos (una corrida de Chrome
por documento). Re-ejecutable.
"""
import http.server
import json
import re
import socketserver
import subprocess
import threading
import time
import urllib.parse
import zipfile
from pathlib import Path

import paths as P

APP = P.ROOT / "app"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT_ZIP = P.ROOT / "fichas_tecnicas.zip"
PORT = 8799

HARNESS = """<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="fichas.css"></head>
<body class="fichas-printing"><div id="ficha-stage" class="f-host"></div>
<script src="fichas-data.js"></script><script src="fichas-ui.js"></script>
<script>
  var ag = new URLSearchParams(location.search).get('ag');
  var d = (window._fichasDocs || []).find(function (x) { return x.ag === ag; });
  if (d) document.getElementById('ficha-stage').innerHTML = d.fichas.map(window._fichaHTML).join('');
</script></body></html>"""


def safe(name):
    return (re.sub(r"[^\w\- .]", "_", name).strip() or "ficha")[:80]


def main():
    if not Path(CHROME).exists():
        print("✗ No encuentro Google Chrome; no puedo exportar los PDF."); return
    data = json.loads((APP / "fichas-data.js").read_text().split("=", 1)[1].rstrip().rstrip(";"))
    ags, seen = [], set()
    for f in data:
        a = f.get("agrupacion") or f.get("titulo")
        if a and a not in seen:
            seen.add(a); ags.append(a)

    (APP / "_export.html").write_text(HARNESS, encoding="utf-8")
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=str(APP), **k)
    httpd = socketserver.TCPServer(("", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    time.sleep(1)

    tmp = P.ROOT / "pipeline" / "_pdfs"
    tmp.mkdir(exist_ok=True)
    for old in tmp.glob("*.pdf"):
        old.unlink()

    print(f"Generando {len(ags)} fichas en PDF (puede tardar varios minutos)…", flush=True)
    for i, a in enumerate(ags, 1):
        url = f"http://localhost:{PORT}/_export.html?ag={urllib.parse.quote(a)}"
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                        "--virtual-time-budget=7000",
                        f"--print-to-pdf={tmp / ('Ficha Técnica - ' + safe(a) + '.pdf')}", url],
                       capture_output=True)
        if i % 25 == 0:
            print(f"  {i}/{len(ags)}…", flush=True)

    httpd.shutdown()
    (APP / "_export.html").unlink(missing_ok=True)

    with zipfile.ZipFile(OUT_ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        for pdf in sorted(tmp.glob("*.pdf")):
            z.write(pdf, pdf.name)
    for pdf in tmp.glob("*.pdf"):
        pdf.unlink()
    tmp.rmdir()

    mb = OUT_ZIP.stat().st_size / 1e6
    print(f"✓ ZIP: {len(ags)} fichas · {mb:.1f} MB → {OUT_ZIP}")
    print("  (subilo/sincronizalo a la carpeta de Drive pública para que el botón lo descargue)")


if __name__ == "__main__":
    main()
