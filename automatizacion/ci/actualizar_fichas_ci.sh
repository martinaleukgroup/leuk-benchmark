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
#   MAX_QUITAR_STOCK  freno: si el filtro de stock saca hoy más SKU nuevos que esto, no publica (default 30)
#   PERMITIR_QUITAR_STOCK  true = acepta la quita aunque supere MAX_QUITAR_STOCK (corrida a mano)
#   SALIDA    carpeta donde quedan los PDF y el log (default ./salida)
#
# FRENOS (los mismos de la Mac, ver automatizacion/README.md):
#   · si no puede leer el Hub, se corta antes de publicar
#   · si el índice de Drive falla, se corta
#   · si las fichas caen más de 5%, no publica
#   · si no cambió nada, no commitea
#   · si cambian más de MAX_PDFS fichas, no genera PDF (avisa)
#   · si no puede leer el Excel de stock, no publica
#   · si el filtro de stock saca más de MAX_QUITAR_STOCK SKU nuevos, no publica (salvo permiso)
# ============================================================
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
MODO="${MODO:-prueba}"
SOLO="${SOLO:-}"
MAX_PDFS="${MAX_PDFS:-30}"
MAX_QUITAR_STOCK="${MAX_QUITAR_STOCK:-30}"
PERMITIR_QUITAR_STOCK="${PERMITIR_QUITAR_STOCK:-false}"
SALIDA="${SALIDA:-$REPO/salida}"
mkdir -p "$SALIDA"
LOG="$SALIDA/actualizar_fichas.log"
log() { echo "[$(TZ=America/Buenos_Aires date '+%d/%m/%Y %H:%M:%S')] $*" | tee -a "$LOG"; }
resumen() { [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$*" >> "$GITHUB_STEP_SUMMARY"; true; }

# Resumen de una línea como anotación de la corrida: lo lee la plataforma
# (función fichas-github) para mostrar el resultado del botón "Regenerar fichas".
N=0; PLAT="sin terminar"; PLAT_FRENO=0; DRIVE_RES=""; STOCK_RES=""
anotar() {
  local listos pend
  listos=$(ls "$SALIDA/pdfs"/*.pdf 2>/dev/null | wc -l | tr -d ' ')
  pend=$(grep -c . "$SALIDA/pendientes_foto.txt" 2>/dev/null); pend=${pend:-0}
  echo "::notice title=Resumen fichas::modo $MODO · $N fichas cambiadas · $listos PDF listos · $pend pendientes de foto$([ -n "${STOCK_RES:-}" ] && echo " · $STOCK_RES")$([ -n "${DRIVE_RES:-}" ] && echo " · $DRIVE_RES") · plataforma: $PLAT$([ "$PLAT_FRENO" = 1 ] && echo " · ⚠ freno: más de $MAX_PDFS fichas, no se generaron PDF")"
}
trap anotar EXIT

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
  log "⛔ falló el índice de Drive. No se sigue."; PLAT="⛔ falló el índice de Drive"
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
if [ "$CODIGO" -eq 3 ]; then
  log "⛔ no se pudo leer el Excel de stock (o vino casi vacío). No se publica."; PLAT="⛔ no se pudo leer el Excel de stock"
  resumen "⛔ No se pudo leer el Excel de stock. No se publicó nada."
  git -C "$REPO" checkout -- fichas-data.js fichas-sin-stock.json 2>/dev/null
  exit 1
fi
if [ "$CODIGO" -ne 0 ]; then
  log "⛔ fichas_build.py falló (código $CODIGO): probablemente no pudo leer el Hub. No se publica."; PLAT="⛔ no se pudo leer el Hub"
  resumen "⛔ No se pudo leer el Hub (código $CODIGO). No se publicó nada."
  git -C "$REPO" checkout -- fichas-data.js 2>/dev/null
  exit 1
fi
log "✓ fichas regeneradas desde el Hub"
cd "$REPO" || exit 1

# 2a) filtro de stock: los SKU que no están en el Excel de stock salen de las fichas.
#     Freno: si hoy salen de golpe muchos que ayer estaban, no se publica (suele ser que
#     alguien recortó el Excel). Se acepta corriendo a mano con "permitir_quitar_stock".
read -r ST_NUEVOS ST_VOLVIERON ST_ESPERADAS < <(python3 "$REPO/automatizacion/ci/freno_stock.py" \
  --repo "$REPO" --detalle "$SALIDA/sin_stock_nuevos.txt" 2>>"$LOG" || echo "0 0 0")
ST_TOTAL=$(python3 -c 'import json;print(len(json.load(open("fichas-sin-stock.json"))["skus"]))' 2>/dev/null || echo 0)
log "· filtro de stock: $ST_TOTAL SKU fuera de las fichas ($ST_NUEVOS nuevos hoy, $ST_VOLVIERON volvieron)"
STOCK_RES="$ST_TOTAL SKU fuera por stock ($ST_NUEVOS nuevos)"
resumen ""
resumen "Filtro de stock: **$ST_TOTAL** SKU fuera de las fichas · $ST_NUEVOS nuevos hoy · $ST_VOLVIERON volvieron al Excel"
# Lista completa en el resumen (desplegable), agrupada por ficha: así se revisa sin bajar el artifact.
if [ "${ST_TOTAL:-0}" -gt 0 ] && [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  python3 - "$REPO/fichas-sin-stock.json" "$SALIDA/sin_stock_nuevos.txt" >> "$GITHUB_STEP_SUMMARY" <<'PY' 2>>"$LOG"
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
nuevos = set()
try:
    nuevos = {l.split(" · ", 1)[1].split(" ", 1)[0] for l in open(sys.argv[2], encoding="utf-8") if " · " in l}
except Exception:
    pass
fuera = set(d.get("fichas_fuera", []))
por = {}
for q in d.get("skus", []):
    por.setdefault(q["ficha"], []).append(q)
print("")
print(f"<details><summary>Ver los {len(d.get('skus', []))} SKU fuera por stock "
      f"({len(fuera)} fichas salen enteras)</summary>\n")
print("| Ficha | Sale entera | SKU | Nombre |")
print("|---|---|---|---|")
for ficha in sorted(por):
    for i, q in enumerate(sorted(por[ficha], key=lambda q: q["sku"])):
        marca = " 🆕" if q["sku"] in nuevos else ""
        print(f"| {ficha if i == 0 else ''} | {('Sí' if ficha in fuera else 'No') if i == 0 else ''} "
              f"| {q['sku']}{marca} | {q['nombre']} |")
print("\n</details>")
PY
fi
if [ "${ST_NUEVOS:-0}" -gt "$MAX_QUITAR_STOCK" ] && [ "$PERMITIR_QUITAR_STOCK" != "true" ]; then
  log "⛔ FRENO: el filtro de stock saca hoy $ST_NUEVOS SKU nuevos (máximo $MAX_QUITAR_STOCK). NO se publica."
  log "   Revisar el Excel de stock. Si está bien, correr a mano con «permitir_quitar_stock» tildado."
  PLAT="⛔ freno: el filtro de stock saca $ST_NUEVOS SKU"
  resumen "⛔ Freno: salen $ST_NUEVOS SKU nuevos por stock (máximo $MAX_QUITAR_STOCK). No se publicó nada. Lista en el artifact (sin_stock_nuevos.txt)."
  git checkout -- fichas-data.js fichas-sin-stock.json 2>/dev/null
  exit 1
fi

# 2b) freno de caída brusca (descontando las hojas que salen a propósito por stock)
CUENTA='import re,json,sys;print(len(json.loads(re.search(r"window\.FICHAS\s*=\s*(\[.*\])\s*;?\s*$",sys.stdin.read(),re.S).group(1))))'
ANTES=$(git show HEAD:fichas-data.js 2>/dev/null | python3 -c "$CUENTA" 2>/dev/null || echo 0)
AHORA=$(python3 -c "$CUENTA" < fichas-data.js 2>/dev/null || echo 0)
if [ "$ANTES" -gt 0 ] && [ "$AHORA" -gt 0 ]; then
  MINIMO=$(( (ANTES - ${ST_ESPERADAS:-0}) * 95 / 100 ))
  if [ "$AHORA" -lt "$MINIMO" ]; then
    log "⛔ FRENO: las fichas caen de $ANTES a $AHORA (más del 5%). NO se publica."; PLAT="⛔ freno: las fichas caen de $ANTES a $AHORA"
    log "   Suele ser que alguien borró filas del Hub sin querer (Archivo → Historial de versiones)."
    resumen "⛔ Freno: las fichas caen de $ANTES a $AHORA (más del 5%). No se publicó nada."
    git checkout -- fichas-data.js fichas-sin-stock.json 2>/dev/null
    exit 1
  fi
  log "· fichas: $ANTES → $AHORA$([ "${ST_ESPERADAS:-0}" -gt 0 ] && echo " ($ST_ESPERADAS menos por el filtro de stock)")"
fi

# 3) qué fichas cambiaron
python3 "$REPO/automatizacion/ci/fichas_cambiadas.py" --repo "$REPO" \
  --salida "$SALIDA/cambiadas.txt" --solo "$SOLO" \
  --historial "$REPO/fichas-historial.json" --fecha "$(TZ=America/Buenos_Aires date +%F)" 2>&1 | tee -a "$LOG"
N=$(grep -c . "$SALIDA/cambiadas.txt" 2>/dev/null); N=${N:-0}
resumen ""
resumen "Fichas a imprimir: **$N**"
if [ "$N" -gt 0 ]; then
  resumen ""
  sed 's/^/- /' "$SALIDA/cambiadas.txt" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
fi

# 3b) PDF de esas fichas
if [ "$N" -gt "$MAX_PDFS" ]; then
  PLAT_FRENO=1; log "⚠ FRENO: cambiaron $N fichas (más de $MAX_PDFS). No genero PDF; revisá el Hub y volvé a correr con un MAX_PDFS más alto si está bien."
  resumen ""
  resumen "⚠ Freno: cambiaron $N fichas (máximo $MAX_PDFS). No se generaron PDF."
elif [ "$N" -gt 0 ]; then
  python3 "$REPO/automatizacion/ci/exportar_pdfs.py" --repo "$REPO" \
    --lista "$SALIDA/cambiadas.txt" --salida "$SALIDA/pdfs" 2>&1 | tee -a "$LOG"
  [ -f "$SALIDA/pdf_fallidos.txt" ] && resumen "" && resumen "⚠ No se pudieron generar: $(paste -sd, "$SALIDA/pdf_fallidos.txt")"
  # Drive: n8n (Proceso 5) sube los PDF listos a la carpeta "Ficha Técnica" de cada producto,
  # mueve los viejos a Reemplazados y dispara el Proceso 2 (chip en el Hub).
  python3 "$REPO/automatizacion/ci/subir_drive.py" --repo "$REPO" --pdfs "$SALIDA/pdfs" \
    --historial "$REPO/fichas-historial.json" --modo "$MODO" \
    --fecha "$(TZ=America/Buenos_Aires date +%F)" --corrida "${GITHUB_RUN_NUMBER:-}" 2>&1 | tee -a "$LOG" "$SALIDA/drive.txt"
  DRIVE_RES=$(grep '^→ Drive' "$SALIDA/drive.txt" | tail -1 | sed 's/^→ //')
  [ -n "$DRIVE_RES" ] && resumen "" && resumen "$DRIVE_RES"
  if [ -s "$SALIDA/pendientes_foto.txt" ]; then
    resumen ""
    resumen "◌ Pendientes de foto (no se suben hasta que haya foto en Drive): $(paste -sd, "$SALIDA/pendientes_foto.txt" | sed 's/,/, /g')"
  fi
fi

# 4) publicar (solo en modo real y si cambió algo)
if git diff --quiet -- fichas-data.js fichas-historial.json && [ -z "$(git status --porcelain -- assets/ficha/fotos fichas-sin-stock.json)" ]; then
  log "· sin cambios en las fichas de la plataforma. No se publica."; PLAT="sin cambios"
  resumen ""
  resumen "Plataforma: sin cambios."
  log "──────── listo ────────"
  exit 0
fi

if [ "$MODO" != "real" ]; then
  log "· modo prueba: hay cambios, pero no se commitea ni se publica."; PLAT="con cambios, no publicada (prueba)"
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
git add fichas-data.js fichas-historial.json fichas-sin-stock.json index.html assets/ficha/fotos \
  plataforma/pipeline/ficha_assets_manifest.json plataforma/pipeline/ficha_fotos_estado.json
git commit -q -m "Fichas al día (automático, GitHub Actions)" || { log "· nada para commitear"; PLAT="sin cambios"; exit 0; }

# Otra persona puede haber publicado mientras corría: traer y reintentar.
for intento in 1 2 3; do
  git pull -q --rebase --autostash origin main && git push -q origin HEAD:main && break
  log "⚠ push falló (intento $intento); reintento"
  sleep 10
  [ "$intento" -eq 3 ] && { log "⛔ no pude publicar. Revisar a mano."; PLAT="⛔ no se pudo publicar"; resumen "⛔ No se pudo publicar (push)."; exit 1; }
done
log "✓ commit subido a main"

# Un push hecho por el workflow no dispara Pages solo: hay que pedirlo.
if gh workflow run pages.yml --ref main >>"$LOG" 2>&1; then
  log "✓ publicación en GitHub Pages pedida"; PLAT="publicada"
  resumen ""
  resumen "Plataforma: **publicada**."
else
  log "⚠ no pude disparar la publicación de Pages; correr 'Deploy static site to Pages' a mano."; PLAT="⚠ subida, falta publicar Pages"
  resumen "⚠ Cambios subidos, pero no se pudo disparar Pages."
fi
log "──────── listo ────────"
