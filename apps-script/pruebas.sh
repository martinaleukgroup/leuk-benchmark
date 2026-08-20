#!/bin/bash
# Prueba los endpoints de la API de fichas. Uso:
#   ./pruebas.sh "https://script.google.com/macros/s/AKfy…/exec" "EL_TOKEN" ["EL_JWT"]
#
# El JWT es opcional: sin él corren sólo las pruebas de lectura y las de
# rechazo. Para sacarlo, entrá a Benchmark con tu usuario, abrí la consola del
# navegador y ejecutá:  LEUK_SESION.token()

URL="$1"; TOKEN="$2"; JWT="$3"
[ -z "$URL" ] || [ -z "$TOKEN" ] && { echo "Uso: ./pruebas.sh URL TOKEN [JWT]"; exit 1; }

AG="${AG:-POCKET III}"
ok=0; fallo=0

# $1 = qué se espera encontrar en la respuesta, $2 = descripción, $3 = respuesta
comprobar() {
  if printf '%s' "$3" | grep -q "$1"; then
    echo "  ✓ $2"; ok=$((ok+1))
  else
    echo "  ✗ $2"; echo "      esperaba: $1"; echo "      recibí:   $(printf '%s' "$3" | head -c 220)"; fallo=$((fallo+1))
  fi
}

echo
echo "── Lectura ──────────────────────────────────────────"

R=$(curl -sL --get "$URL" --data-urlencode "accion=ping" --data-urlencode "token=$TOKEN")
comprobar '"ok":true' "ping responde" "$R"

R=$(curl -sL --get "$URL" --data-urlencode "accion=fichas" --data-urlencode "token=$TOKEN")
comprobar '"fichas"' "lista todas las fichas" "$R"
echo "      $(printf '%s' "$R" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(str(d.get("total"))+" fichas · "+json.dumps(d.get("resumen",{}),ensure_ascii=False))' 2>/dev/null || echo '(no pude resumir)')"

R=$(curl -sL --get "$URL" --data-urlencode "accion=ficha" --data-urlencode "token=$TOKEN" --data-urlencode "agrupacion=$AG")
comprobar '"ok":' "busca una sola ($AG)" "$R"

echo
echo "── Rechazos esperados ───────────────────────────────"

R=$(curl -sL --get "$URL" --data-urlencode "accion=fichas" --data-urlencode "token=token-que-no-es")
comprobar 'TOKEN_INVALIDO' "token incorrecto → 401" "$R"

R=$(curl -sL --get "$URL" --data-urlencode "accion=ficha" --data-urlencode "token=$TOKEN" --data-urlencode "agrupacion=ESTO NO EXISTE")
comprobar 'NO_ENCONTRADA' "agrupación inexistente → 404 (no una ficha vacía)" "$R"

R=$(curl -sL --get "$URL" --data-urlencode "accion=zaraza" --data-urlencode "token=$TOKEN")
comprobar 'ACCION_DESCONOCIDA' "acción desconocida → 400" "$R"

post() { curl -sL -X POST "$URL" -H 'Content-Type: text/plain;charset=utf-8' -d "$1"; }

R=$(post "{\"accion\":\"cambiarEstado\",\"token\":\"$TOKEN\",\"agrupacion\":\"$AG\",\"estado\":\"Finalizada\"}")
comprobar 'SESION_INVALIDA' "POST sin JWT → 401 (el usuario no se autodeclara)" "$R"

R=$(post "{\"accion\":\"cambiarEstado\",\"token\":\"nada\",\"jwt\":\"x\",\"agrupacion\":\"$AG\",\"estado\":\"Finalizada\"}")
comprobar 'TOKEN_INVALIDO' "POST con token malo → 401" "$R"

if [ -n "$JWT" ]; then
  R=$(post "{\"accion\":\"cambiarEstado\",\"token\":\"$TOKEN\",\"jwt\":\"$JWT\",\"agrupacion\":\"$AG\",\"estado\":\"Publicadísima\"}")
  comprobar 'ESTADO_INVALIDO' "estado fuera de la lista blanca → 400" "$R"

  R=$(post "{\"accion\":\"cambiarEstado\",\"token\":\"$TOKEN\",\"jwt\":\"$JWT\",\"agrupacion\":\"$AG\",\"estado\":\"Discontinuada\"}")
  comprobar 'ESTADO_INVALIDO' "la plataforma no puede discontinuar → 400" "$R"

  R=$(post "{\"accion\":\"cambiarEstado\",\"token\":\"$TOKEN\",\"jwt\":\"$JWT\",\"agrupacion\":\"$AG\",\"estado\":\"Finalizada\",\"detectadoVisto\":\"01/01/2020 00:00\"}")
  comprobar 'CONFLICTO' "detectadoVisto viejo → 409 conflicto" "$R"

  echo
  echo "── Escritura real ───────────────────────────────────"
  echo "  ⚠ Las de abajo ESCRIBEN en la planilla y en Log fichas."
  printf "  ¿Corro el cambio de estado sobre \"%s\"? [s/N] " "$AG"; read -r r
  if [ "$r" = "s" ] || [ "$r" = "S" ]; then
    D=$(curl -sL --get "$URL" --data-urlencode "accion=ficha" --data-urlencode "token=$TOKEN" --data-urlencode "agrupacion=$AG" \
        | python3 -c 'import sys,json; print(json.load(sys.stdin)["ficha"]["detectado"])' 2>/dev/null)
    R=$(post "{\"accion\":\"cambiarEstado\",\"token\":\"$TOKEN\",\"jwt\":\"$JWT\",\"agrupacion\":\"$AG\",\"estado\":\"Listo para publicar\",\"detectadoVisto\":\"$D\"}")
    comprobar '"ok":true' "cambio de estado aplicado" "$R"
    echo "      $R"
  else
    echo "  · salteada"
  fi
else
  echo
  echo "  · Pruebas con sesión salteadas (pasá el JWT como tercer argumento)."
fi

echo
echo "────────────────────────────────────────────────────"
echo "  $ok bien · $fallo mal"
[ "$fallo" -eq 0 ] || exit 1
