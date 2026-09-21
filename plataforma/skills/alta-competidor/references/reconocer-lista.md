# Fase 2 — Reconocer el formato de la lista

> El objetivo de esta fase es responder una sola pregunta: **¿dónde vive cada dato en esta lista?**
> Las respuestas se vuelcan al bloque `lista_precios` de la receta (`formato-receta.md`).

Cada marca arma su lista distinto, y la diferencia no es cosmética: define si la extracción trae
1.249 productos correctos o 400 con el precio del vecino.

---

## Paso 1 — Mirar 3 páginas con los ojos

Abrí la lista y elegí **tres páginas: una del principio, una del medio y una del final**. Las del
final suelen tener accesorios/repuestos con otro layout, y son las que rompen la extracción.

Para cada una, anotá:

- ¿Es una **tabla** (filas con columnas fijas) o **fichas sueltas** (un bloque por producto)?
- ¿El **código** está en una columna propia? ¿Cómo es? (`6100GU`, `VK-NECK D 2215-BL`, `A-08.12`)
- ¿Cuántas **columnas de precio** hay? Muy común: dos (precio de lista y precio "PMP"/promocional).
  **Elegí una y dejá escrito cuál y por qué.** En WLG la correcta era la segunda.
- ¿Hay **filas que no son productos**? Encabezados de sección, subtotales, notas al pie.
- ¿Qué páginas **no** son catálogo? Tapa, índice, condiciones de venta, garantía.

## Paso 2 — Extraer la posición real

Cuando la lista es un PDF con tabla, el dato clave es **la coordenada X de cada columna**, porque
la extracción por posición es mucho más confiable que por texto.

```bash
python3 -c "
import pdfplumber, sys
with pdfplumber.open('LISTA.pdf') as pdf:
    for w in pdf.pages[10].extract_words():
        print(round(w['x0']), round(w['top']), w['text'])
" | head -60
```

Anotá la X de la columna de código y la de precio.

> **Trampa real (Metaluz/Lucciola):** la columna CODIGO estaba en **x≈120**, no en x≥150 como
> parecía a ojo. Filtrar por el valor equivocado descartaba la mitad de los productos.

## Paso 3 — Las cinco preguntas de precio

Estas cinco definen si el Benchmark compara peras con peras. Ninguna se puede deducir del PDF solo:
**hay que preguntarlas o confirmarlas con el proveedor.**

| Pregunta | Por qué importa | Ejemplo real |
|---|---|---|
| ¿**Moneda**? | Si es ARS hay que convertir | WLG en ARS ÷ dólar blue (1435) |
| ¿El precio ya **incluye IVA**? | La alícuota es la misma para todos (21 %), pero **que esté incluida o no lo decide cada proveedor**. Si una marca publica neto y otra con IVA, la comparación queda corrida 21 % | — |
| ¿Lista **pública o de distribuidor**? | Comparar neto vs. público desvirtúa todo | — |
| ¿Hay **descuento de lista** vigente? | El precio publicado no es el que se paga | — |
| ¿Precio por **unidad, metro o componente**? | Un perfil por metro vs. una luminaria no comparan | Vonderk NECK: perfiles armados por metro |

## Paso 4 — ¿Los códigos de la web cruzan con los del PDF?

Esta es **la pregunta que más define la calidad de las fotos** (fase 5). Tomá 10 códigos del PDF y
buscalos en el sitio.

- **Cruzan** → las fotos se emparejan por código. Es el mejor escenario.
- **No cruzan** → hay que emparejar por nombre de familia (fuzzy, peor) o recortar del PDF.

> **Trampa real (Lucciola):** a primera vista **no** cruzaban — los códigos del PDF eran de la
> línea Metaluz (`6100GU`, `NRP060`) y los de la web parecían otros (`ET1024`). Recién al crawlear
> las fichas y leer la **primera celda de cada fila de la tabla** aparecieron 563 códigos en común.
> Moraleja: antes de dar por perdido el cruce, mirá la tabla de la ficha, no el texto de la página.

## Paso 5 — Extracción de prueba (la puerta de salida)

Con las respuestas anteriores, corré la extracción sobre **un rango chico (5–10 páginas)** y armá
una tabla de 20 productos con: código · nombre · precio · 3 specs. Mostrásela a Martina.

**No pases a la extracción completa sin ese OK.** Es el control de calidad más barato del proceso:
cuesta minutos y evita reprocesar un catálogo entero (y volver a pagar la API).

---

## Formatos que ya vimos, y cómo se resolvieron

| Marca | Formato | Lo que costó |
|---|---|---|
| **Lucciola / Metaluz** | PDF 104 pág, tabla, foto en columna izquierda | Código en x≈120; 1 foto por familia, no por SKU; el catálogo no trae los códigos de la web en el texto |
| **Vonderk** | PDF 122 pág + listas separadas por línea | Los perfiles (NECK) estaban **en otra lista** (PERFILES N49), no en la general. El filtro de accesorios hay que aplicarlo **al código, no a la línea entera** (la descripción dice "resortes y extremos" → falsos positivos) |
| **WLG** | PDF 173 pág, ARS, dos columnas de precio | La columna correcta es la 2ª ("$", lista), no "PMP". Formato variable → varios productos hubo que mapearlos a mano |
| **Artelum** | Fichas + intranet | Los códigos internos (`A-08.xx`) no aparecen en el texto del PDF → hubo que mapear familias a mano |

**Patrón que se repite:** ninguna marca entrega todo en un solo archivo. Antes de concluir que un
producto "no tiene precio", preguntá si hay **otra lista** (por línea, por sistema, por accesorios).
