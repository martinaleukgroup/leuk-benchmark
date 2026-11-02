#!/usr/bin/env python3
"""
exportar_pdfs.py — Imprime a PDF solo las fichas indicadas, igual que "Imprimir" del
navegador (Chrome headless sobre la misma página de la plataforma).

Uso:
    python3 exportar_pdfs.py --repo <raíz del repo> --lista cambiadas.txt --salida pdfs/

Cada agrupación sale como "Ficha Técnica - <AGRUPACIÓN>.pdf", el nombre que espera el
Proceso 2 (Archivos Drive → Base) para poner el chip en la columna Fichas técnicas.

Basado en plataforma/pipeline/fichas_export_pdf.py (que exporta TODAS a un ZIP en la Mac).
"""
import argparse
import http.server
import os
import re
import shutil
import socketserver
import subprocess
import sys
import threading
import time
import urllib.parse
from pathlib import Path

HARNESS = """<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="fichas.css"></head>
<body class="fichas-printing"><div id="ficha-stage" class="f-host"></div>
<script src="fichas-data.js"></script><script src="fichas-ui.js"></script>
<script>
  var ag = new URLSearchParams(location.search).get('ag');
  var d = (window._fichasDocs || []).find(function (x) { return x.ag === ag; });
  if (d) document.getElementById('ficha-stage').innerHTML = d.fichas.map(window._fichaHTML).join('');
</script></body></html>"""

PORT = 8799


def chrome():
    for c in [os.environ.get("CHROME"), "google-chrome", "google-chrome-stable", "chromium",
              "chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]:
        if c and (Path(c).exists() or shutil.which(c)):
            return c
    return None


def safe(name):
    """Mismo criterio que fichas_export_pdf.py: el nombre del archivo es la agrupación."""
    return (re.sub(r"[^\w\- .]", "_", name).strip() or "ficha")[:80]


# El recuadro "FOTO DE PRODUCTO" vacío lleva la clase f-ph (sin foto o la imagen no cargó)
FOTO_VACIA = re.compile(r'class="[^"]*\bf-photo\b[^"]*\bf-ph\b|class="[^"]*\bf-ph\b[^"]*\bf-photo\b')


def sin_foto(exe, extra, url):
    """True si alguna hoja de la ficha quedó con el recuadro de foto vacío."""
    r = subprocess.run([exe, "--headless=new", "--disable-gpu", *extra, "--virtual-time-budget=10000",
                        "--dump-dom", url], capture_output=True, text=True, timeout=120)
    return bool(FOTO_VACIA.search(r.stdout or ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--lista", required=True)
    ap.add_argument("--salida", required=True)
    a = ap.parse_args()

    repo, out = Path(a.repo), Path(a.salida)
    ags = [l.strip() for l in Path(a.lista).read_text(encoding="utf-8").splitlines() if l.strip()]
    out.mkdir(parents=True, exist_ok=True)
    if not ags:
        print("· no hay fichas para imprimir")
        return
    exe = chrome()
    if not exe:
        print("⛔ no encuentro Chrome; no puedo generar los PDF")
        sys.exit(1)

    (repo / "_export.html").write_text(HARNESS, encoding="utf-8")
    class Silencioso(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    handler = lambda *x, **k: Silencioso(*x, directory=str(repo), **k)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    time.sleep(1)

    extra = ["--no-sandbox"] if sys.platform.startswith("linux") else []
    fallidas, pendientes = [], []
    pend = out.parent / "pdfs_pendientes_foto"
    try:
        for i, ag in enumerate(ags, 1):
            destino = out / f"Ficha Técnica - {safe(ag)}.pdf"
            url = f"http://127.0.0.1:{PORT}/_export.html?ag={urllib.parse.quote(ag)}"
            subprocess.run([exe, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", *extra,
                            "--virtual-time-budget=10000", f"--print-to-pdf={destino}", url],
                           capture_output=True, timeout=120)
            # una ficha vacía (agrupación no encontrada) sale como PDF de ~1 KB
            if not destino.exists() or destino.stat().st_size < 5000:
                fallidas.append(ag)
                destino.unlink(missing_ok=True)
                print(f"  ✗ {ag}: no se pudo generar")
            elif sin_foto(exe, extra, url):
                pend.mkdir(parents=True, exist_ok=True)
                destino.replace(pend / destino.name)
                pendientes.append(ag)
                print(f"  ◌ {destino.name}: sin foto de producto → pendiente (no se sube)")
            else:
                print(f"  ✓ {destino.name} ({destino.stat().st_size // 1024} KB)")
    finally:
        httpd.shutdown()
        (repo / "_export.html").unlink(missing_ok=True)

    listos = len(ags) - len(fallidas) - len(pendientes)
    print(f"→ PDF listos para subir: {listos} · pendientes de foto: {len(pendientes)} · fallidos: {len(fallidas)}")
    (out.parent / "pendientes_foto.txt").write_text("\n".join(pendientes) + ("\n" if pendientes else ""), encoding="utf-8")
    if fallidas:
        (out.parent / "pdf_fallidos.txt").write_text("\n".join(fallidas) + "\n", encoding="utf-8")
        sys.exit(3)


if __name__ == "__main__":
    main()
