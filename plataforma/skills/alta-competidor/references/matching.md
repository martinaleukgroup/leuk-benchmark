# Fase 6 — Matching contra Leuk

Los productos que el worker cargó en `competencia_extra` están **crudos**: tienen specs y precio,
pero no están emparejados con ningún SKU de Leuk. Sin ese paso no hay Benchmark, sólo un catálogo
ajeno adentro de la app.

## Las 3 señales

Una equivalencia se evalúa por tres caminos independientes (pesos 0.45 / 0.40 / 0.15):

| Señal | Qué compara | Peso |
|---|---|---|
| **Técnica** | Specs: potencia, lúmenes, IP, fijación, medidas | 0.45 |
| **Etiquetación** | Vocabulario visual asignado con Claude visión (forma, tipo) | 0.40 |
| **Visual** | Coseno de embeddings OpenCLIP de las fotos | 0.15 |

## La regla de acuerdo

**Una equivalencia es confiable sólo si coinciden al menos 2 señales.** Con una sola —típicamente
la visual sobre una foto poco representativa— va a la sección **"Posible, revisar"**, nunca al
resultado principal.

Esta regla salió de un error real: el SKU 7180 (Pocket III) usa una foto de la línea completa, y
por señal visual sola traía basura como equivalente.

## El gate de categoría (no saltearlo)

Antes de comparar nada, cada producto se clasifica en **luminaria · lineal · riel · perfil · driver
· accesorio**. Las cuatro no emisoras (`riel`, `perfil`, `driver`, `accesorio`) **sólo comparan
contra su misma categoría**; luminaria y lineal sí son compatibles entre sí.

Sin este gate pasaba lo siguiente: como los rieles y drivers no declaran IP ni fijación, el gate
técnico quedaba "no verificable" y el motor terminaba puntuando atributos residuales (garantía,
color) → **una tapa "equivalía" a un spot y un driver salía "Equivalente" de un artefacto.**

El guard que protege a las luminarias reales es "no declara lúmenes": si declara lúmenes, no se
clasifica como no-emisora aunque el nombre sugiera lo contrario.

## Cómo se corre

Los productos con `aprobado = true` entran al consolidado:

```bash
cd ~/leuk-benchmark/pipeline
python3 consolidate.py     # regenera data/benchmark_data.json (~13 s)
python3 subir_datos.py     # lo sube al bucket privado 'datos'
```

La app baja ese JSON tras el login, así que **no hace falta republicar** para que se vean los datos
nuevos. Si además se tocó `app.js` o el CSS, sí hay que subir el `?v=N` de `index.html` y correr
`publicar.sh`.

## Puerta de salida

Tomá **10 productos de la marca nueva** y revisá sus equivalencias a ojo con Martina. Si aparecen
comparaciones entre categorías distintas o precios con diferencias absurdas (>120 %), hay algo mal
en el gate o en la moneda — volvé a la receta antes de dar el alta por cerrada.
