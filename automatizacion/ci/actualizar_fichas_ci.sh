#!/bin/bash
# ============================================================
# actualizar_fichas_ci.sh — versión de GitHub Actions de pipeline/actualizar_fichas.sh
# ============================================================
# Hace, en orden (igual que la corrida de la Mac, más los PDF):
#   1. Re-indexa Drive (dibujos, curvas, LDT, CAD, manuales) y baja las fotos nuevas
#   2. Regenera fichas-data.js leyendo el Hub de marketing (pestaña Base)
#   3. Detecta qué fichas cambiaron y genera SOLO esos PDF
#   4. En modo real: commitea, publica en GitHub Pages
#
# Variables:
#   MODO      prueba (default) | real   — en prueba no commitea ni publica nada
#   SOLO      agrupaciones a forzar, separadas por coma (ej. "MOLY,DYNA")
#   MAX_PDFS  freno: si hay más fichas cambiadas que esto, no genera PDF (default 30)
#   SALIDA    carpeta donde quedan los PDF y el log (default ./salida)
#
# FRENOS (los mismos de la Mac, ver automatizacion/README.md):
#   · si no puede leer el Hub, se corta antes de publicar
#   · si el índice de Drive falla, se corta
#   · si las fichas caen más de 5%, no publica
#   · si no cambió nada, no commitea
#   · si cambian más de MAX_PDFS fichas, no genera PDF (avisa)
# ============================================================
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
MODO="${MODO:-prueba}"
SOLO="${SOLO:-}"
MAX_PDFS="${MAX_PDFS:-30}"
SALIDA="${SALIDA:-$REPO/salida}"
mkdir -p "$SALIDA"
LOG="$SALIDA/actualizar_fichas.log"
log() { echo "[$(TZ=America/Buenos_Aires date '+%d/%m/%Y %H:%M:%S')] $*" | tee -a "$LOG"; }
resumen() { [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$*" >> "$GITHUB_STEP_SUMMARY"; true; }

# Los scripts de pipeline esperan <ROOT>/app (este repo) y <ROOT>/pipeline.
ROOT="${RUNNER_TEMP:-/tmp}/leuk-root"
rm -rf "$ROOT"; mkdir -p "$ROOT"
ln -s "$REPO" "$ROOT/app"
ln -s "$REPO/plataforma/pipeline" "$ROOT/pipeline"
export LEUK_ROOT="$ROOT"
export LEUK_WORK="$ROOT/sin-icloud"   # no existe: sin copia local, si el Hub falla se corta
cd "$ROOT/pipeline" || exit 1

log "──────── arranca (modo $MODO) ────────"
resumen "## Fichas técnicas · modo **$MODO**"

# 1) índice de Drive
if ! python3 ficha_assets_manifest.py >>"$LOG" 2>&1; then
  log "⛔ falló el índice de Drive. No se sigue."
  resumen "⛔ Falló el índice de Drive. No se publicó nada."
  exit 1
fi
log "✓ índice de Drive actualizado"

# 1b) fotos (si falla se sigue con las que ya había)
if python3 ficha_fotos.py >>"$LOG" 2>&1; then
  log "✓ fotos al día con la carpeta de Drive"
else
  log "⚠ no pude actualizar las fotos desde Drive. Sigo con las que ya había."
fi

# 2) fichas desde el Hub
python3 fichas_build.py >>"$LOG" 2>&1
CODIGO=$?
if [ "$CODIGO" -ne 0 ]; then
  log "⛔ fichas_build.py falló (código $CODIGO): probablemente no pudo leer el Hub. No se publica."
  resumen "⛔ No se pudo leer el Hub (código $CODIGO). No se publicó nada."
  git -C "$REPO" checkout -- fichas-data.js 2>/dev/null
  exit 1
fi
log "✓ fichas regeneradas desde el Hub"

# 2b) freno de caída brusca
cd "$REPO" || exit 1
CUENTA='import re,json,sys;print(len(json.loads(re.search(r"window\.FICHAS\s*=\s*(\[.*\])\s*;?\s*$",sys.stdin.read(),re.S).group(1))))'
ANTES=$(git show HEAD:fichas-data.js 2>/dev/null | python3 -c "$CUENTA" 2>/dev/null || echo 0)
AHORA=$(python3 -c "$CUENTA" < fichas-data.js 2>/dev/null || echo 0)
if [ "$ANTES" -gt 0 ] && [ "$AHORA" -gt 0 ]; then
  MINIMO=$(( ANTES * 95 / 100 ))
  if [ "$AHORA" -lt "$MINIMO" ]; then
    log "⛔ FRENO: las fichas caen de $ANTES a $AHORA (más del 5%). NO se publica."
    log "   Suele ser que alguien borró filas del Hub sin querer (Archivo → Historial de versiones)."
    resumen "⛔ Freno: las fichas caen de $ANTES a $AHORA (más del 5%). No se publicó nada."
    git checkout -- fichas-data.js
    exit 1
  fi
  log "· fichas: $ANTES → $AHORA"
fi

# 3) qué fichas cambiaron
python3 "$REPO/automatizacion/ci/fichas_cambiadas.py" --repo "$REPO" \
  --salida "$SALIDA/cambiadas.txt" --solo "$SOLO" 2>&1 | tee -a "$LOG"
N=$(grep -c . "$SALIDA/cambiadas.txt" 2>/dev/null); N=${N:-0}
resumen ""
resumen "Fichas a imprimir: **$N**"
if [ "$N" -gt 0 ]; then
  resumen ""
  sed 's/^/- /' "$SALIDA/cambiadas.txt" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
fi

# 3b) PDF de esas fichas
if [ "$N" -gt "$MAX_PDFS" ]; then
  log "⚠ FRENO: cambiaron $N fichas (más de $MAX_PDFS). No genero PDF; revisá el Hub y volvé a correr con un MAX_PDFS más alto si está bien."
  resumen ""
  resumen "⚠ Freno: cambiaron $N fichas (máximo $MAX_PDFS). No se generaron PDF."
elif [ "$N" -gt 0 ]; then
  python3 "$REPO/automatizacion/ci/exportar_pdfs.py" --repo "$REPO" \
    --lista "$SALIDA/cambiadas.txt" --salida "$SALIDA/pdfs" 2>&1 | tee -a "$LOG"
  [ -f "$SALIDA/pdf_fallidos.txt" ] && resumen "" && resumen "⚠ No se pudieron generar: $(paste -sd, "$SALIDA/pdf_fallidos.txt")"
fi

# 4) publicar (solo en modo real y si cambió algo)
if git diff --quiet -- fichas-data.js && [ -z "$(git status --porcelain -- assets/ficha/fotos)" ]; then
  log "· sin cambios en las fichas de la plataforma. No se publica."
  resumen ""
  resumen "Plataforma: sin cambios."
  log "──────── listo ────────"
  exit 0
fi

if [ "$MODO" != "real" ]; then
  log "· modo prueba: hay cambios, pero no se commitea ni se publica."
  resumen ""
  resumen "Plataforma: hay cambios, **no publicados** (modo prueba)."
  log "──────── listo ────────"
  exit 0
fi

V=$(grep -o 'fichas-data.js?v=[0-9]*' index.html | head -1 | grep -o '[0-9]*$')
if [ -n "$V" ]; then
  sed -i "s/?v=$V/?v=$((V+1))/g" index.html
  log "· cache-buster: v$V → v$((V+1))"
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add fichas-data.js index.html assets/ficha/fotos \
  plataforma/pipeline/ficha_assets_manifest.json plataforma/pipeline/ficha_fotos_estado.json
git commit -q -m "Fichas al día (automático, GitHub Actions)" || { log "· nada para commitear"; exit 0; }

# Otra persona puede haber publicado mientras corría: traer y reintentar.
for intento in 1 2 3; do
  git pull -q --rebase origin main && git push -q origin HEAD:main && break
  log "⚠ push falló (intento $intento); reintento"
  sleep 10
  [ "$intento" -eq 3 ] && { log "⛔ no pude publicar. Revisar a mano."; resumen "⛔ No se pudo publicar (push)."; exit 1; }
done
log "✓ commit subido a main"

# Un push hecho por el workflow no dispara Pages solo: hay que pedirlo.
if gh workflow run pages.yml --ref main >>"$LOG" 2>&1; then
  log "✓ publicación en GitHub Pages pedida"
  resumen ""
  resumen "Plataforma: **publicada**."
else
  log "⚠ no pude disparar la publicación de Pages; correr 'Deploy static site to Pages' a mano."
  resumen "⚠ Cambios subidos, pero no se pudo disparar Pages."
fi
log "──────── listo ────────"
