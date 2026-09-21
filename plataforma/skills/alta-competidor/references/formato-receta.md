# Fase 7 — La receta: formato y cómo subirla

La **receta** es el entregable del alta. Es un objeto por marca que dice **dónde vive cada dato**
en las fuentes de esa marca, más las particularidades que hay que tener en cuenta.

Tiene tres consumidores, y por eso tiene dos caras:

| Consumidor | Qué usa | Para qué |
|---|---|---|
| **El worker** (Modal) | el JSON | aplicar la lista nueva sin ayuda humana |
| **La app** (página *Manual de carga*) | el JSON + las notas | que cualquiera consulte cómo se carga esa marca |
| **La próxima persona** | las notas | entender el porqué de cada decisión |

Vive en la tabla **`competencia_recetas`** de Supabase (una fila por marca), y su copia legible en
`skills/alta-competidor/references/recetas/<slug>.json`.

---

## El esquema

```json
{
  "marca": "Lucciola",
  "slug": "lucciola",
  "estado": "activa",

  "alta": {
    "fecha": "2026-08-03",
    "autor": "analisiscomercial@leukiluminacion.com.ar",
    "material": ["lista de precios PDF 104 pág", "sitio lucciola.com.ar"],
    "material_faltante": ["banco de imágenes del proveedor"]
  },

  "lista_precios": {
    "formato": "pdf_tabla",
    "paginas_ignorar": [1, 2, 103, 104],
    "codigo":  { "columna": "CODIGO", "x": 120, "ejemplos": ["6100GU", "NRP060"] },
    "nombre":  { "columna": "DESCRIPCION", "x": 180 },
    "precio":  { "columna": "PRECIO", "cual": "única" },
    "moneda": "USD",
    "iva": "sin_iva",
    "tipo_lista": "distribuidor",
    "descuento_lista": 0,
    "tipo_cambio": null,
    "unidad_precio": "unidad",
    "excepciones_unidad": []
  },

  "web": {
    "url": "https://lucciola.com.ar",
    "ficha_url": "ficha.php?id=N",
    "listado_url": "linea.php?api=N",
    "codigo_donde": "primera celda (CODIGO) de cada <tr> de la tabla de la ficha",
    "foto_url": "img/productos/grandes/<primer código>.jpg",
    "codigos_cruzan_con_pdf": true,
    "codigos_en_comun": 563
  },

  "imagenes": {
    "origen_primario": "codigo_web",
    "fallbacks": ["crop_pdf_por_codigo", "familia_web_fuzzy"],
    "bucket": "catalogo-img/lucciola/",
    "cobertura": { "total": 1249, "con_foto": 1157, "correcta_por_codigo": 1054 }
  },

  "particularidades": [
    "El catálogo tiene UNA foto por familia, no por SKU: varios códigos comparten foto. No es un error.",
    "Los códigos del PDF son de la línea Metaluz; los de la web son Lucciola. Cruzan en 563 casos, pero sólo si se lee la primera celda de la tabla de la ficha (body.innerText contamina con códigos de otros productos).",
    "Las fotos del PDF son correctas pero chicas; las de la web son 1000×800 pero algunas son de ambiente, no product-shot.",
    "Accesorios, uniones y fuentes se excluyen del match por familia contra la web."
  ],

  "notas_md": "Texto libre: el relato de cómo se cargó, qué se probó y qué se descartó.",

  "actualizacion": {
    "habilitada": true,
    "clave_de_cruce": "codigo",
    "frecuencia_esperada": "mensual"
  }
}
```

## Campos que no son obvios

- **`estado`** — `activa` (carga completa y confiable) · `parcial` (se cargó a medias; decí en
  `notas_md` qué falta) · `baja` (la marca ya no se sigue).
- **`iva`** — `sin_iva` · `con_iva` · `desconocido`. La pregunta **no** es cuánto es la alícuota
  (21 % en todo el país para luminarias): es **si el precio publicado ya lo tiene adentro**. Eso lo
  decide cada proveedor, y sólo se sabe preguntándole. Si una marca publica neto y otra publica con
  IVA, compararlas mete un 21 % de diferencia que no existe. **`desconocido` es una respuesta
  válida y honesta**, y es mejor que asumir.
- **`tipo_lista`** — `distribuidor` · `publico`. Junto con `descuento_lista` es lo que hace que la
  comparación de precios sea justa.
- **`clave_de_cruce`** — con qué campo se identifica un producto entre una lista y la siguiente.
  Casi siempre `codigo`. Si la marca no tiene códigos estables, poné `nombre` y avisá en las notas
  que las actualizaciones van a ser menos confiables.
- **`excepciones_unidad`** — lista de códigos o familias que se cotizan por metro/componente aunque
  el resto sea por unidad. Es la particularidad que más veces ensució comparaciones.

## Cómo subirla

```bash
cd ~/leuk-benchmark/pipeline
python3 subir_receta.py ../skills/alta-competidor/references/recetas/<slug>.json
```

El script hace `upsert` por `slug` en `competencia_recetas` (se loguea con tu cuenta de la
plataforma vía `auth_sesion.py`: `LEUK_EMAIL`/`LEUK_PASSWORD` o te los pide) y deja la marca visible en la página **Manual de carga**.

**Verificá que quedó:** entrá a la app → Benchmark → *Manual de carga* y confirmá que la marca
aparece con sus particularidades. Recién ahí el alta está cerrada.

## Regla de mantenimiento

Cada vez que se carga una lista nueva y aparece algo que la receta no contemplaba, **se actualiza la
receta en el momento**. Una receta desactualizada es peor que no tenerla: da falsa confianza.
