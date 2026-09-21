#!/usr/bin/env bash
# run_all.sh — corre todo el pipeline de punta a punta y regenera la app.
# Uso:  cd ~/leuk-benchmark/pipeline && bash run_all.sh
set -e
cd "$(dirname "$0")"

echo "▶ 1/8  Manifiesto de imágenes Leuk (Drive)…"
python3 img_leuk_manifest.py

echo "▶ 2/8  Descarga de miniaturas Leuk…"
python3 img_leuk_download.py

echo "▶ 3/8  Vectores de competencia (FAISS)…"
python3 img_comp_vecs.py

echo "▶ 4/8  Embeddings visuales de Leuk…"
python3 img_leuk_embed.py

echo "▶ 5/8  Etiquetación visual de Leuk (Claude visión)…"
python3 img_leuk_tag.py

echo "▶ 6/8  Consolidación → benchmark_data.json + app/data.js…"
python3 consolidate.py

echo "▶ 7/8  Manifiesto de assets de ficha (dibujo/curvas/LDT/CAD desde Drive)…"
python3 ficha_assets_manifest.py

echo "▶ 8/8  Fichas técnicas → app/fichas-data.js (desde BASE ÚNICA)…"
python3 fichas_build.py

# Las fotos PNG por SKU (app/assets/ficha/fotos/) son assets fijos ya commiteados; NO se
# regeneran acá. Cuando diseño actualice el ZIP de fotos, correr:  python3 ficha_fotos.py

# El ZIP con todas las fichas ya NO se genera acá: lo arma la app en el navegador con el
# botón "Descargar todas (ZIP)". Si alguna vez hace falta la versión vectorial (texto
# seleccionable), está el script suelto:  python3 fichas_export_pdf.py

echo "✓ Listo. Abrí ~/leuk-benchmark/app/index.html o publicá la carpeta app/."
