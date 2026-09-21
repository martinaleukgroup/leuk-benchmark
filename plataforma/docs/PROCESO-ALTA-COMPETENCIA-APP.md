# Alta y actualización de competidores

> **Cambio importante (24 ago 2026).** El alta de un competidor **nuevo** dejó de ser
> self-service: se hace de forma asistida con la skill **`alta-competidor`**, porque siempre
> requiere entender cómo está armada la lista de esa marca en particular. Lo que **sí** quedó
> self-service en la app es la **actualización** de una marca ya cargada (botón
> **↻ Actualizar lista**), y funciona porque el alta deja escrita una **receta**.
>
> | | Alta de marca **nueva** | Actualización de marca **ya cargada** |
> |---|---|---|
> | Quién | Análisis Comercial, con la skill | Cualquiera con permiso, desde la app |
> | Entrada | lista + catálogo + web | la lista de precios nueva |
> | Salida | catálogo cargado **+ la receta** | precios al día + productos nuevos a aprobar |
>
> El camino **offline** de analista/dev (editar Excels + correr Python) sigue documentado en
> `PROCESO-DATOS-COMPETENCIA.md` y no se reemplaza: conviven.

---

## 0. La idea en una frase

La usuaria sube el **PDF (lista de precios / catálogo)** y el **link del sitio** del competidor
desde la app → eso queda en una **cola** en Supabase → un **worker Python en Modal** (la nube)
lee el PDF con Claude, extrae todos los productos con su ficha técnica y precio, y los deja
"crudos" en una tabla → la usuaria los **revisa y aprueba** en la app. Lo único que cuesta
plata del circuito es la **API de Claude** (Modal, Supabase y GitHub Pages van en free tier).

```
┌────────────┐   sube PDF+URL   ┌──────────────┐   lee cola    ┌───────────────┐
│  App        │ ───────────────▶ │  Supabase     │ ◀──────────── │ Worker Modal   │
│ (Benchmark) │                  │  · bucket     │  cada 2 min   │ (Python + IA)  │
│             │                  │    'integracion'              │                │
│  ➕ Compe-  │                  │  · tabla      │  guarda       │ Claude lee el  │
│  tencia     │                  │  integracion_jobs ◀────────── │ PDF y extrae   │
│             │   revisa/aprueba │  · tabla      │  productos    │ los productos  │
│  Nuevas     │ ◀───────────────▶│  competencia_extra            │                │
│  integrac.  │                  └──────────────┘               └───────────────┘
└────────────┘
```

---

## 1. Quién puede hacerlo

La **actualización** está detrás de un gate de rol: **Admin, Líder y Coordinación**. El **alta**
de una marca nueva la hace Análisis Comercial con la skill (no tiene botón en la app).

- En el código: `puedeIntegrar()` en `app/app.js` = `["admin","lider","coordinacion"].includes(rolReal())`.
- En Supabase: la función SQL `puede_integrar()` con la misma lista de roles (protege la escritura
  con RLS).
- El botón **↻ Actualizar lista** de la botonera de Benchmark y la página **Nuevas integraciones**
  sólo aparecen si el usuario tiene ese permiso. La página **Manual de carga** la ve cualquiera que
  esté logueado: es documentación, y el punto es justamente que circule. Ver [[costos-y-roles]].

---

## 2. Las 3 fases del circuito

| Fase | Qué es | Dónde corre | Estado |
|---|---|---|---|
| **1 — Carga (encolar)** | Subir PDF + URL → crear un "job" | App (`openIntegrar`) | ✅ Funcionando |
| **2 — Procesamiento** | Leer el PDF con Claude → extraer productos | Worker Modal (`worker.py`) | ✅ Funcionando |
| **3 — Revisión/aprobación** | Aprobar/descartar lo importado | App (`renderIntegraciones`) | ✅ Parte 1 · 🚧 Parte 2 (head-to-head) |

---

## 3. Fase 1 — Cargar (encolar) · lado usuaria

Desde **Benchmark → botón `↻ Actualizar lista`** se abre el modal *Actualizar lista de precios*:

1. **Marca** — el desplegable ofrece **sólo las marcas que tienen receta**. Al elegir una, se
   muestra lo que el sistema ya sabe de ella (moneda, IVA, tipo de lista, cuántas particularidades
   tiene documentadas), así quien sube sabe qué esperar.
2. **Lista de precios (PDF)** — arrastrar o elegir **uno o varios PDF**.
3. **Subir lista**.

Si ninguna marca tiene receta todavía, el modal lo dice y no deja subir nada: primero hay que dar
el alta con la skill. Y si la marca es nueva, el propio modal explica que el alta se pide a
Análisis Comercial.

Qué pasa por debajo (`openIntegrar` en `app/app.js`):

- Cada PDF se sube al **bucket privado `integracion`** de Supabase, en la ruta
  `<marca-slug>/<timestamp>-<nombre>.pdf` (`subirPDFIntegracion`).
- Se crea una fila en la tabla **`integracion_jobs`** (`crearJobIntegracion`) con:
  `marca`, `slug`, `tipo="actualizacion"`, `pdf_paths` (lista), `autor` (email),
  `estado="pendiente"`. El campo **`tipo`** es el que le dice al worker si tiene que hacer una
  carga inicial (`alta`) o cruzar contra lo que ya está (`actualizacion`).
- Abajo, **Integraciones recientes** lista los últimos 15 jobs con su estado y hace **polling cada
  5 s**, así se ve pasar de ⏳ En cola → ⚙ Procesando → ✓ Listo (o ✕ Error).

> **Requisito único (una vez):** que esté corrido el SQL de la cola. Si falla la creación, el
> mensaje avisa *"¿Corriste el SQL de 'integracion_jobs'?"*. Ver §8 (infraestructura).

---

## 4. Fase 2 — Procesamiento · worker en Modal

El worker vive en `~/leuk-benchmark/worker/worker.py` (Modal app **`leuk-integracion`**). Corre
en la nube **cada 2 minutos** (`schedule=Period(minutes=2)`, `timeout=3600`) y por corrida:

1. **Toma un job pendiente** (el más viejo) de `integracion_jobs` y lo pasa a `procesando`.
2. **Baja los PDF** del bucket `integracion` con la service key.
3. **Extrae los productos con Claude** (`claude-sonnet-5` — igual de bueno que Opus para tablas y
   ~5× más barato). Salida forzada por **JSON schema estricto** con los 19 campos de la ficha
   (nombre, familia, precio + 16 specs: fuente de luz, potencia, lúmenes, eficiencia, tensión,
   ángulo, CRI, temp. color, UGR, IP, fijación/montaje, medidas, movimiento, color, control,
   garantía). El prompt le pide **no inventar** (campo vacío si no está).
4. **Guarda** cada producto en la tabla **`competencia_extra`** (`job_id`, `marca`, `nombre`,
   `familia`, `precio_usd` parseado, `ficha` = JSON con los specs presentes).
5. Marca el job **`listo`** con un resumen: `{productos_nuevos, con_ficha, con_imagen}`.
   Si algo falla, queda **`error`** con el detalle.

### El truco que hace que no se pierda ningún producto

Los catálogos son largos y densos. Dos claves de diseño (fue lo que más costó llegar):

- **Se parte el PDF en tandas de 6 páginas** (`CHUNK = 6`) en vez de mandarlo entero.
- Si una tanda **se trunca** (Claude corta por largo: `stop_reason == max_tokens` o JSON
  incompleto), `extraer_rango()` la **subdivide a la mitad y reintenta** (divide y vencerás),
  recursivo hasta página individual. Así las páginas densas no pierden filas.

> **Prueba real cerrada:** Lucciola (PDF de 104 pág) → **1.249 productos, 1.239 con ficha,
> 993 con precio.** Costo con Sonnet ≈ US$3.

### Operar el worker (comandos)

```bash
cd ~/leuk-benchmark/worker
modal deploy worker.py            # desplegar / actualizar el worker
modal run worker.py::procesar_cola # forzar una corrida ya (sin esperar el schedule)
```

- **Re-encolar un job:** PATCH a `integracion_jobs` poniendo `estado="pendiente"` (y borrar sus
  filas en `competencia_extra`); el schedule lo agarra en ≤2 min.
- **Secreto Modal `leuk-integracion`** (cargado una vez): `ANTHROPIC_API_KEY` + `SUPABASE_URL` +
  `SUPABASE_SERVICE_KEY`. Setup completo en `SETUP-MODAL.md`.
- **Costo:** lo único pago es la API de Claude. Si la cuenta Anthropic se queda sin saldo, el job
  queda en `error` → cargar créditos en console.anthropic.com → Facturación y re-encolar.

---

## 5. Fase 3 — Revisión y aprobación · lado usuaria

Lo que el worker cargó en `competencia_extra` está **crudo**: son productos con specs y precio,
pero todavía **sin matchear** contra ningún SKU de Leuk. Se revisan en
**Benchmark → sub-página "Nuevas integraciones"** (`renderIntegraciones` en `app/app.js`):

- Lista los productos **agrupados por marca**, con **buscador** y **thumbnail** (clic = lightbox).
- **Aprobar / Descartar por producto**, o **Aprobar / Descartar todo** por marca. Volver a tocar
  = "sin revisar".
- Persiste en la columna **`aprobado`** de `competencia_extra` (`null` = sin revisar / `true` /
  `false`) vía `guardarAprob` (PATCH). La lectura pagina con `Range` (PostgREST corta en 1000).

### ✅ Parte 1 (hecha) — aprobar/descartar el portfolio importado
Funciona end-to-end: revisar, aprobar por producto o en masa, con imágenes en la revisión.

### 🚧 Parte 2 (pendiente) — **head-to-head contra Leuk**
Que los `aprobado=true` pasen a **compararse contra Leuk**. Falta el paso de **matching**
(emparejar cada producto nuevo con SKU(s) de Leuk). Es el trabajo grande que sigue. Dos caminos:
- **matching por specs con Claude en el worker** (más liviano), o
- **reusar el pipeline offline** (OpenCLIP + FAISS, señal visual).

---

## 6. Imágenes de los productos importados

> **Importante:** hoy **el worker NO genera imágenes** (devuelve `con_imagen: 0`). Conseguir las
> fotos de un competidor nuevo es todavía un **paso manual, propio de cada sitio** (el scraping
> genérico "bajame todas las imágenes de cualquier web" es frágil: cada catálogo está armado
> distinto). Esta sección es la **receta a seguir** para un competidor nuevo, y a la vez lo que
> hay que **portar al worker** para que deje de ser manual.

**Dónde va la foto:** cada producto de `competencia_extra` tiene una columna **`imagen`** (URL).
Esa URL es la que muestra el **thumbnail en la revisión** (Fase 3, clic = lightbox). Los archivos
se suben a un **bucket público `catalogo-img`**, en su propia carpeta por marca
(`catalogo-img/<marca-slug>/…`).

### Principio que ordena todo

La señal visual (embeddings OpenCLIP) **achica la imagen a 224 px**, así que la resolución casi no
importa: lo que importa es la **corrección** — que la foto sea **del producto correcto**. Por eso
el criterio es siempre **emparejar bien por sobre tener la foto más grande**, y el emparejamiento
ideal es **por CÓDIGO de producto**, no por nombre/familia (que es ambiguo).

### Los 4 orígenes de foto, en orden de prioridad

Para cada producto se busca foto en cascada: se usa el primer origen que dé resultado.

| Prioridad | Origen | Cómo se consigue |
|---|---|---|
| 1 | **Código → foto de la web** | Crawlear las fichas del sitio del competidor extrayendo el **par (código, foto)** de cada producto → armar un mapa `código → URL de foto`. Es el más confiable. |
| 2 | **Recorte del PDF por código** | Para los códigos que no estén en la web: recortar del propio PDF la foto de cada producto y asociarla al código que aparece **junto a ella en la misma página** (misma banda horizontal). |
| 3 | **Familia → foto de la web (fuzzy)** | Último recurso cuando no hay código: emparejar por **nombre de familia**. Puede traer la foto de una variante hermana; aceptable como aproximación. |
| 4 | **Sin foto** | Placeholder limpio (mejor eso que una foto equivocada). |

El resultado es una foto por producto (con su origen), que se sube al bucket y se escribe en la
columna `imagen`. Conviene un script con **dry-run** (arma un *montage* de muestra para revisar a
ojo antes de subir) y un flag **`--go`** que recién ahí sube al bucket y setea `imagen`.

### Cómo adaptar cada origen a un competidor nuevo (checklist)

1. **Mapa código→foto de la web (origen 1) — es lo que cambia sitio por sitio.**
   - Encontrar la página de ficha/producto del sitio y ver **cómo nombra las fotos** (muchos
     catálogos las guardan por código, p. ej. `…/productos/<código>.jpg`).
   - Extraer el **código desde la tabla de la ficha**, no del texto suelto de la página:
     `body.innerText` **contamina** (mezcla códigos de productos relacionados) → tomar sólo la
     **celda de código** de cada fila de la tabla.
   - Preferir la versión **grande** de la foto si el sitio la ofrece.

2. **Recorte del PDF (origen 2).**
   - Localizar en qué **posición (columna X)** de la página está el código y en cuál la foto;
     recortar la foto y asignarla al código de su misma banda horizontal.
   - **Filtrar los diagramas técnicos** (dibujos de cotas/perfiles con medidas): son ~90 % blanco
     con líneas. Heurística foto-vs-dibujo que funcionó: descartar si `mid_tones < 15 %` **y**
     `std < 48`.

3. **Ojo con la granularidad.** Muchos catálogos tienen **1 foto por familia, no por SKU** →
   varios códigos comparten foto. No es un error; es esperable.

4. **Verificar que los códigos crucen.** El emparejamiento por código sólo sirve si los códigos de
   la **web** y los del **PDF** son el mismo sistema. Revisar una muestra antes de correr todo (a
   veces web y PDF usan nomenclaturas distintas y hay que caer al origen 3).

### Límite de fondo (comunicarlo)

Ninguna fuente pública es ideal: el **PDF** suele tener la foto correcta pero **chica**; la **web**
es alta-res pero a veces empareja por familia y trae fotos de ambiente/lifestyle. Perfección
uniforme no es alcanzable de fuentes públicas — la mejor fuente sería un **banco de imágenes del
proveedor**, si se consigue.

### Pendiente (para que deje de ser manual)

Portar al worker Modal los tres orígenes automatizables: **crawl web (código→foto)** + **recorte
del PDF por código** + **fallback por familia**. Recién ahí el alta de un competidor nuevo traería
las imágenes sola. El detalle histórico de cómo se resolvió el primer catálogo está en
[[integracion-competencia]].

---

## 7. Estado y límites conocidos (agosto 2026)

- ✅ **Fase 1 + 2 funcionando** (PDF → productos crudos en la app). Probado con Lucciola.
- ✅ **Fase 3 Parte 1** (revisar/aprobar + imágenes en la revisión).
- 🚧 **Fase 3 Parte 2** (head-to-head / matching contra Leuk) — pendiente.
- ⏳ **Imágenes en el worker** — hoy el worker devuelve `con_imagen: 0`. Todo el trabajo de
  imágenes que se hizo para Lucciola (recorte del PDF por código + foto web + fallback) fue
  **local/one-off** desde scripts en scratchpad; **falta portarlo al worker** para catálogos
  futuros. Detalle de ese trabajo en [[integracion-competencia]].
- **Límite de fondo de las imágenes:** ninguna fuente pública es ideal (el PDF tiene la foto
  correcta pero chica; la web es alta-res pero matchea por familia, no por SKU). La mejor fuente
  sería un **banco de imágenes del proveedor** si se consigue.
- **v2+ (ML pesado):** scraping de imágenes de la URL → embeddings OpenCLIP + FAISS →
  etiquetado con Claude visión → matching visual. Recién ahí Modal necesitaría la parte pesada
  (torch/openclip, ~GB).

---

## 8. Infraestructura (referencia)

**Supabase** (proyecto `cswqoretlhppxkelysny`):
- Bucket privado **`integracion`** — PDFs subidos por la app.
- Tabla **`integracion_jobs`** — la cola. Cols: `id`, `marca`, `marca_nueva`, `url`,
  `pdf_paths`, `autor`, `estado` (pendiente/procesando/listo/error), `resultado` (jsonb),
  `error`, `creado`, `actualizado`. Con RLS.
- Tabla **`competencia_extra`** — productos extraídos. Cols: `id`, `job_id`, `marca`, `nombre`,
  `familia`, `precio_usd`, `ficha` (jsonb), `imagen`, `aprobado` (bool nullable). RLS: `select`
  para authenticated; `update` sólo `puede_integrar()`.
- Función SQL **`puede_integrar()`** = `rol in ('admin','lider','coordinacion')`.

**Modal** (cuenta `martinaleukgroup`, plan free ~US$30/mes de crédito):
- App **`leuk-integracion`**, worker `worker.py`, imagen liviana (anthropic + httpx + pypdf,
  sin GPU). Secreto `leuk-integracion` (3 variables). Setup en `SETUP-MODAL.md`.

**App** (GitHub Pages, estática): baja los datos tras el login con el JWT del usuario. El alta de
competencia **no** requiere republicar la app — los jobs y productos viven en Supabase.

---

## 9. Mapa rápido de archivos

| Archivo | Rol |
|---|---|
| `app/app.js` → `openIntegrar` | Fase 1: modal de carga, sube PDF, crea job, lista jobs (poll 5s) |
| `app/app.js` → `renderIntegraciones` / `guardarAprob` / `traerIntegraciones` | Fase 3: revisar/aprobar |
| `app/app.js` → `puedeIntegrar()` | gate de rol (admin/líder/coordinación) |
| `worker/worker.py` | Fase 2: worker Modal, PDF → `competencia_extra` con Claude |
| `SETUP-MODAL.md` | cómo preparar la cuenta Modal + CLI + secreto (una vez) |
| `PROCESO-DATOS-COMPETENCIA.md` | el camino **offline** (analista/dev), complementario |

---

*Documento técnico interno. Referencia infraestructura secreta (service key, cuenta Modal) — no
va al repo público `app/`.*


---

## 10. La receta y el Manual de carga (ago 2026)

**El problema que resuelve.** Cada marca arma su lista distinto, y descubrir cómo está armada es
el trabajo real del alta: dónde está el código, si el precio lleva IVA, si los códigos de la web
cruzan con los del PDF, si las fotos son por SKU o por familia. Antes eso quedaba en la cabeza de
quien lo hizo. Ahora queda en la **receta**.

**Qué es.** Un objeto por marca en la tabla `competencia_recetas`, con dos caras: un JSON que lee
el worker y unas notas que lee una persona. Su esquema está en la skill, en
`skills/alta-competidor/references/formato-receta.md`.

**Para qué sirve, concretamente:**

1. **El worker la usa** para leer bien la lista nueva (le pasa las particularidades en el prompt,
   convierte la moneda, aplica el descuento de lista).
2. **La app la muestra** en la página **Manual de carga** (`renderManual` en `app.js`) — visible
   para cualquiera logueado: cómo se carga cada marca, sus particularidades y el historial de
   listas cargadas.
3. **Habilita la actualización self-service:** sin receta, la marca no aparece en el desplegable.

**Qué hace una actualización** (`_actualizar` en `worker.py`), cruzando por `codigo`:

| Situación | Qué pasa |
|---|---|
| El precio cambió | Se pisa el precio. Lo anterior queda en el histórico |
| Código nuevo | Entra como producto nuevo **sin aprobar** → lo revisa alguien en *Nuevas integraciones* |
| Código que ya no está | Se marca `baja_detectada` (no se borra: puede volver, y su histórico sigue valiendo) |
| Siempre | Se guarda el precio de cada producto en `competencia_precios_hist` → evolución en el tiempo |

**Tablas nuevas:** `competencia_recetas`, `competencia_listas` (historial de listas cargadas),
`competencia_precios_hist` (precio por código y fecha). Más `codigo` y `baja_detectada` en
`competencia_extra`, y `tipo` + `slug` en `integracion_jobs`. El SQL está en
`supabase/sql/2026-08-24-recetas-y-actualizacion.sql`.

**Subir una receta:**

```bash
cd ~/leuk-benchmark/pipeline
python3 subir_receta.py ../skills/alta-competidor/references/recetas/<slug>.json --check   # validar
python3 subir_receta.py ../skills/alta-competidor/references/recetas/<slug>.json           # subir
```

El script valida antes de subir: sin moneda, sin IVA declarado o sin particularidades, no sube.
