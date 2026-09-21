#!/usr/bin/env bash
# Empaqueta la app en un ZIP autocontenido y listo para compartir.
cd "$(dirname "$0")/.."
OUT="benchmark-leuk-app.zip"
rm -f "$OUT"
cd app && zip -rq "../$OUT" . -x ".*" && cd ..
echo "✓ $OUT ($(du -h "$OUT" | cut -f1)) — se descomprime y se abre index.html, o se sube a Netlify/Vercel."
