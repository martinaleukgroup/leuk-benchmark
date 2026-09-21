# Fase 5 — Imágenes

> Hoy el worker **no** genera imágenes (`con_imagen: 0`). Esta fase es semiautomática: scripts
> locales guiados por lo que se descubrió en la fase 2. Portarla al worker es el pendiente grande.

## El principio

La señal visual del matching (embeddings OpenCLIP) **achica toda foto a 224 px**. Por lo tanto
**la resolución casi no importa: importa que la foto sea del producto correcto.**

Corolario práctico: entre una foto grande de la familia y una chiquita del SKU exacto, **gana la
chiquita**. Y entre una foto equivocada y ninguna, **gana ninguna** — un placeholder limpio es
honesto, una foto ajena confunde al equipo comercial y contamina el matching visual.

## La cascada de orígenes

Para cada producto se prueba en este orden y se usa el primero que dé resultado:

| # | Origen | Confiabilidad | Cómo |
|---|---|---|---|
| 1 | **Código → foto de la web** | Alta | Crawlear las fichas del sitio extrayendo el par (código, foto) de cada fila de la tabla. Preferir la versión grande si existe |
| 2 | **Recorte del PDF por código** | Alta | Recortar la imagen de la página y asignarla al código que está en su **misma banda horizontal**. Correcta pero baja resolución |
| 3 | **Familia → foto de la web (fuzzy)** | Media | Sólo cuando no hay código. Puede traer una variante hermana o una foto de ambiente |
| 4 | **Sin foto** | — | Placeholder limpio |

Los archivos van al bucket público **`catalogo-img/<slug>/`** y la URL se escribe en la columna
`imagen` de `competencia_extra`.

## Filtrar los dibujos técnicos

Los catálogos mezclan fotos con **diagramas de cotas** (perfiles con medidas). Un diagrama colado
como foto de producto arruina la señal visual.

Heurística que funcionó: **descartar si `mid_tones < 15 %` y `std < 48`** — los dibujos son ~90 %
blanco con líneas finas, así que casi no tienen tonos medios ni dispersión.

## Cómo se corre

> ⚠️ `crop_v3.py` fue un script de una sola vez para Lucciola y **no se conservó**. Para una marca
> nueva hay que reescribirlo con la lógica de este documento (código→foto web > recorte PDF por
> código > familia web > sin foto) y respetando el mismo contrato: dry-run con montage, `--go` sube.
> Guardalo en `pipeline/` con el nombre de la marca (`<slug>_imagenes.py`) para que no se pierda.

```bash
cd ~/leuk-benchmark/pipeline
python3 crop_v3.py            # dry-run: arma un montage de muestra para mirar a ojo
python3 crop_v3.py --go       # recién ahora sube al bucket y setea la columna imagen
```

**Siempre dry-run primero.** Mirar 30 recortes lleva dos minutos y evita subir mil fotos mal
recortadas.

## Buscar TODOS los sitios del fabricante

Una marca comercial y su línea técnica suelen tener **sitios distintos**, a veces con el mismo CMS
y catálogos que no se solapan. En Lucciola pasó exactamente eso: los códigos del PDF eran de
**Metaluz**, y `metaluz.com.ar` resultó tener su propia tabla de códigos con fotos que no estaban
en `lucciola.com.ar` — 13 productos rescatados que ya se daban por perdidos.

Antes de dar un producto por «sin foto», preguntá: **¿hay otro sitio de este mismo fabricante?**
Es la misma lógica que con las listas de precios, donde los perfiles de Vonderk estaban en una
lista aparte.

### Usá el buscador del sitio, por código

Muchos catálogos tienen un buscador que acepta el **código exacto** y devuelve ese producto con
**todas** sus fotos. Es mejor que crawlear las fichas: va derecho al producto y no hay que adivinar
a qué familia pertenece.

> **Error que costó caro:** al crawlear las fichas de Metaluz me quedé con la **primera** imagen de
> cada una. En los DORIS la primera es una foto de jardín y la buena —el bolardo sobre fondo liso—
> es la segunda. Resultado: 6 productos con foto ambientada, que el filtro después descartó, cuando
> la foto correcta estaba ahí al lado. **Juntá todas las candidatas y elegí; nunca tomes la primera.**

## El filtro de borde no ve las composiciones

El test de borde descarta bien las fotos **de ambiente** (fondo no uniforme), pero deja pasar las
**composiciones de familia**: varios productos sobre fondo blanco con etiquetas del tipo
«Combi small / Super-Mix». Pasan el test porque el fondo *es* liso, pero no representan a ningún
SKU: un embedding sobre una escena con seis objetos no sirve para matchear.

Y el detector automático de composiciones tampoco alcanza: si los objetos están **en diagonal y
se superponen**, la proyección los ve como uno solo y pasan igual.

**Por eso el montage no es opcional.** Es el único paso que las detecta de verdad.

## Trampas conocidas

- **`body.innerText` contamina.** Al crawlear una ficha, el texto plano de la página mezcla códigos
  de productos relacionados. Leer **sólo la celda de código de cada fila de la tabla**.
- **Un sitio puede responder 200 con HTML** cuando la imagen no existe. Validar `Content-Type:
  image/*` y probar `.png` **y** `.jpg`.
- **Granularidad familia vs. SKU.** Que varios códigos compartan foto es lo normal, no un bug.
- **Accesorios, uniones y fuentes** conviene excluirlos del match por familia: arrastran la foto de
  la luminaria a la que acompañan.

## El límite honesto

Ninguna fuente pública es ideal: el PDF tiene la foto correcta pero chica, la web es alta-res pero
empareja por familia y a veces son fotos de ambiente. **Perfección uniforme no es alcanzable de
fuentes públicas.** Si el proveedor tiene banco de imágenes, pedirlo resuelve la fase entera —
conviene preguntarlo en la fase 1, antes de gastar el trabajo.
