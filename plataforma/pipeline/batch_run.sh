set -e
cd "$(dirname "$0")"
echo "[$(date +%H:%M)] 1/5 descargando miniaturas Leuk…"
python3 img_leuk_download.py
echo "[$(date +%H:%M)] 2/5 vectores competencia…"
python3 img_comp_vecs.py
echo "[$(date +%H:%M)] 3/5 embeddings Leuk…"
python3 img_leuk_embed.py 2>&1 | grep -vi "warn\|http\|token" | tail -3
echo "[$(date +%H:%M)] 4/5 etiquetado visión (Haiku)…"
python3 img_leuk_tag.py 2>&1 | tail -3
echo "[$(date +%H:%M)] 5/5 consolidando…"
python3 consolidate.py > /dev/null 2>&1
echo "[$(date +%H:%M)] ✓ BATCH COMPLETO"
