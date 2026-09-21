#!/bin/bash
# Publica los últimos cambios de la app al link público de GitHub Pages.
# Uso:  ./publicar.sh "mensaje del cambio"
export PATH="$HOME/.local/bin:$PATH"
cd "$HOME/leuk-benchmark/app" || exit 1
git add -A
git commit -q -m "${1:-Actualización de la app}" 2>/dev/null && echo "✓ Cambios commiteados" || echo "· Sin cambios nuevos"
git push -q origin main && echo "✓ Subido a GitHub"
echo "El link se actualiza solo en 1-2 min:"
echo "  https://martinaleukgroup.github.io/leuk-benchmark/"
