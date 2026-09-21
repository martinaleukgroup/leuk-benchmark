#!/bin/bash
# Copia al repo la parte "de atrás" de la plataforma (pipeline, worker, Supabase,
# skill de alta y documentación) desde ~/leuk-benchmark, para que quede versionada.
# Uso:  bash ~/leuk-benchmark/app/plataforma/sincronizar.sh   (y después ./publicar.sh)
# NO copia: secretos (no viven en estos archivos), cachés de imágenes, logs, data/ ni contenidos/.
set -e
SRC="$HOME/leuk-benchmark"
DST="$(cd "$(dirname "$0")" && pwd)"
ICLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs/📊 | Comercial/Automatización - Pricing"
EXCL=(--exclude='.DS_Store' --exclude='__pycache__' --exclude='*.pyc' --exclude='*.zip'
      --exclude='*.log' --exclude='*.bak' --exclude='*.PRUEBA.*' --exclude='.*_thumb*'
      --exclude='.artelum_tmp' --exclude='embed_*.txt' --exclude='batch_log.txt' --exclude='build_log.txt')
for d in pipeline worker supabase skills handoff-fable5; do
  rsync -a --delete "${EXCL[@]}" "$SRC/$d/" "$DST/$d/"
done
mkdir -p "$DST/docs"
cp "$SRC"/README.md "$SRC"/PROCESO-*.md "$SRC"/PROCESO-*.pdf "$SRC"/SETUP-MODAL.md "$DST/docs/"
cp "$SRC"/publicar.sh "$DST/"
cp "$ICLOUD/SQL-recetas-y-actualizacion.sql" "$DST/supabase/sql/" 2>/dev/null || true
cp "$ICLOUD/Paquete Diego Losz/SQL para correr ANTES de mandarlo.sql" \
   "$DST/supabase/sql/2026-09-17-alta-sin-service-key.sql" 2>/dev/null || true
echo "✓ Plataforma sincronizada en $DST"
