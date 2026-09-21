set -e
cd "$(dirname "$0")"
echo "[$(date +%H:%M)] etiquetando WLG (102, ~8-10 min)…"
python3 wlg_tag.py 2>&1 | tail -2
echo "[$(date +%H:%M)] consolidando…"
python3 consolidate.py 2>&1 | grep -E "WLG extra|Universo|Productos:"
mkdir -p ~/leuk-benchmark/app/img/wlg
cp ~/leuk-benchmark/data/img/wlg/*.jpg ~/leuk-benchmark/app/img/wlg/ 2>/dev/null || true
cd ~/leuk-benchmark && rm -f benchmark-leuk-app.zip && cd app && zip -rq ../benchmark-leuk-app.zip . -x ".*" && cd ..
echo "[$(date +%H:%M)] ✓ LISTO · zip $(du -h benchmark-leuk-app.zip|cut -f1)"
