#!/bin/bash
# ============================================================
# actualizar_fichas.sh — pone las fichas al día y las publica
# ============================================================
# Hace, en orden:
#   1. Re-indexa los archivos de Drive (dibujos, curvas, LDT, CAD, manuales)
#   2. Regenera app/fichas-data.js leyendo la planilla BASE ÚNICA
#   3. Publica a GitHub Pages, SÓLO si algo cambió
#
# Se puede correr a mano en cualquier momento:
#     ~/leuk-benchmark/pipeline/actualizar_fichas.sh
#
# Y corre solo todos los días a las 7:30 (ver com.leuk.fichas.plist).
# Si la Mac está apagada a esa hora, launchd lo dispara al prender.
#
# FRENOS, para que nunca publique algo peor de lo que ya está:
#   · si no puede leer la planilla, fichas_build.py sale con código 2 y acá se
#     corta ANTES de publicar (si no, publicaría el xlsx local, que es viejo)
#   · si el índice de Drive falla, se conserva el anterior y no se sigue
#   · si no cambió nada, no commitea ni publica
# El log queda en pipeline/actualizar_fichas.log
# ============================================================
set -u
cd "$HOME/leuk-benchmark/pipeline" || exit 1
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:/Library/Frameworks/Python.framework/Versions/3.13/bin:$PATH"

LOG="$HOME/leuk-benchmark/pipeline/actualizar_fichas.log"
log() { echo "[$(date '+%d/%m/%Y %H:%M:%S')] $*" | tee -a "$LOG"; }

log "──────── arranca ────────"

# 1) índice de Drive. Si falla, el manifiesto anterior queda intacto.
cp -f ficha_assets_manifest.json /tmp/manifiesto.previo.json 2>/dev/null
if ! python3 ficha_assets_manifest.py >>"$LOG" 2>&1; then
  log "⛔ falló el índice de Drive. Se conserva el anterior y no se publica."
  exit 1
fi
log "✓ índice de Drive actualizado"

# 2) fichas. Código 2 = leyó el xlsx local en vez de la planilla → no publicar.
python3 fichas_build.py >>"$LOG" 2>&1
CODIGO=$?
if [ "$CODIGO" -eq 2 ]; then
  log "⛔ no pude leer la planilla; se generó desde el xlsx local. NO se publica."
  cd "$HOME/leuk-benchmark/app" && git checkout -- fichas-data.js 2>/dev/null
  exit 1
elif [ "$CODIGO" -ne 0 ]; then
  log "⛔ fichas_build.py falló (código $CODIGO). No se publica."
  exit 1
fi
log "✓ fichas regeneradas"

# 2b) freno de caída brusca.
# El 21/08/2026 se borraron 25 filas de BASE ÚNICA por accidente y este proceso
# las publicó a los minutos, porque nadie estaba mirando. Una baja de producto
# mueve una o dos fichas; una caída grande es casi siempre un error de edición.
cd "$HOME/leuk-benchmark/app" || exit 1
CUENTA='import re,json,sys;print(len(json.loads(re.search(r"window\.FICHAS\s*=\s*(\[.*\])\s*;?\s*$",sys.stdin.read(),re.S).group(1))))'
ANTES=$(git show HEAD:fichas-data.js 2>/dev/null | python3 -c "$CUENTA" 2>/dev/null || echo 0)
AHORA=$(python3 -c "$CUENTA" < fichas-data.js 2>/dev/null || echo 0)
if [ "$ANTES" -gt 0 ] && [ "$AHORA" -gt 0 ]; then
  MINIMO=$(( ANTES * 95 / 100 ))
  if [ "$AHORA" -lt "$MINIMO" ]; then
    log "⛔ FRENO: las fichas caen de $ANTES a $AHORA (más del 5%). NO se publica."
    log "   Suele ser que alguien borró filas de BASE ÚNICA sin querer."
    log "   Revisá la planilla (Archivo → Historial de versiones) y volvé a correr esto."
    git checkout -- fichas-data.js
    exit 1
  fi
  log "· fichas: $ANTES → $AHORA"
fi

# 3) publicar sólo si cambió algo
if git diff --quiet -- fichas-data.js; then
  log "· sin cambios en las fichas. No se publica."
  log "──────── listo ────────"
  exit 0
fi

# cache-buster: sin esto el navegador sigue mostrando el archivo viejo
V=$(grep -o 'fichas-data.js?v=[0-9]*' index.html | head -1 | grep -o '[0-9]*$')
if [ -n "$V" ]; then
  sed -i '' "s/?v=$V/?v=$((V+1))/g" index.html
  log "· cache-buster: v$V → v$((V+1))"
fi

cd "$HOME/leuk-benchmark" || exit 1
if ./publicar.sh "Fichas al día (automático)" >>"$LOG" 2>&1; then
  log "✓ publicado"
else
  log "⛔ falló la publicación. Los cambios quedaron commiteados sin subir."
  exit 1
fi
log "──────── listo ────────"
