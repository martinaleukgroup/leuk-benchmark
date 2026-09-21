# 04 · Arquitectura general

> Estado real al 2026-07-16.

---

## Qué es

App de inteligencia competitiva de pricing para **Leuk Iluminación** (empresa argentina de
iluminación). Dado un producto Leuk, muestra sus equivalentes en **Vonderk, Artelum y World
Leds Go** con precio comparado, fichas lado a lado, imágenes y nivel de match.

Uso: equipo comercial de Leuk. ~10 usuarios. Link: `https://martinaleukgroup.github.io/leuk-benchmark/`
(requiere login).

---

## Stack

| Capa | Tecnología | Nota |
|---|---|---|
| **Frontend** | HTML + CSS + JS vanilla, **sin build, sin framework, sin dependencias npm** | 1 IIFE de 1292 líneas |
| **Hosting** | GitHub Pages (repo **público**) | El repo debe seguir público: Pages privado requiere plan pago (se probó y rompió el sitio) |
| **Auth** | Supabase Auth (email/password) | Toda la app detrás de un gate |
| **Datos** | Supabase Storage, bucket **privado** `datos` | `benchmark_data.json` (~21 MB), se baja con el JWT del usuario |
| **Estado compartido** | Supabase Postgres + PostgREST vía `fetch` | Sin librería cliente |
| **Pipeline** | Python 3 (pandas, pydantic v2, numpy, OpenCLIP/torch, anthropic) | Corre local, a mano |
| **Base canónica** | SQLite (`~/.leuk_pricing/pricing.db`) | Descuentos, TC, precios de respaldo |
| **IA** | Claude (visión, etiquetado) + OpenCLIP ViT-B-32 (embeddings) | |
| **Excel in-browser** | SheetJS vendorizado (`vendor/xlsx.full.min.js`, 932 KB) | Para la carga masiva de precios |
| **Tipografía** | Barlow + Barlow Condensed (Google Fonts) | Barlow Condensed es la fuente de marca real |

**Decisión de arquitectura clave:** el repo es público (requisito de GitHub Pages gratis) pero
**los datos no están en el repo** — `data.js` se eliminó y quedó en `.gitignore`. El benchmark
se descarga post-login desde un bucket privado. El login protege acceso *y* datos.

---

## Estructura de carpetas

```
~/leuk-benchmark/                    ← NO es repo git
├── app/                             ← ESTE es el repo git (público, GitHub Pages)
│   ├── index.html          90 líneas
│   ├── app.js            1292 líneas   ← toda la lógica, 1 IIFE
│   ├── styles.css         401 líneas
│   ├── README.md                       ← doc de uso + admin
│   ├── assets/            244 KB       ← logos (isologo-uk.png, logo-leuk-ilum.png)
│   ├── img/               6.0 MB       ← fotos bundleadas de competencia (artelum/, wlg/)
│   └── vendor/            932 KB       ← xlsx.full.min.js (SheetJS)
├── pipeline/                        ← Python, corre a mano, NO se publica
│   ├── paths.py                        ← todas las rutas centralizadas
│   ├── matching.py         461 líneas  ← señal TÉCNICA (motor puro, sin I/O)
│   ├── consolidate.py      684 líneas  ← orquestador: une todo → JSON
│   ├── normalize.py         87 líneas  ← slug, limpiar, montaje_canonico, color_canonico
│   ├── subir_datos.py                  ← sube el JSON a Supabase Storage (service_role key)
│   ├── img_leuk_*.py                   ← manifest, download, embed, tag (track de imágenes Leuk)
│   ├── img_comp_vecs.py                ← embeddings de competencia
│   ├── wlg_build.py · wlg_tag.py       ← track WLG
│   ├── artelum_build.py · artelum_bundle.py · artelum_web_fetch.py
│   ├── *_precio_manual.json            ← precios cargados a mano
│   ├── *_etiquetas.json · *.npz        ← señales cacheadas
│   └── run_all.sh                      ← ⚠️ desactualizado
├── data/benchmark_data.json  21 MB  ← salida del pipeline (se sube a Supabase)
├── handoff-fable5/                  ← esta documentación
└── publicar.sh                      ← git add/commit/push de app/
```

---

## Frontend: cómo está organizado `app.js`

Un único IIFE con secciones marcadas por comentarios. **No hay módulos, ni imports, ni build.**

```
DESCUENTOS / PRECIO NETO (localStorage)        línea   13
AUTORIZACIONES (localStorage + Supabase)       línea   95
SESIÓN / LOGIN (Supabase Auth)                 línea  263
SUGERENCIAS MANUALES (localStorage)            línea  383
RECOMENDACIONES (productos Leuk parecidos)     línea  434
PÁGINA COMPARACIONES (catálogo + comparación)  línea  454
MODAL: sugerir equivalente                     línea  622
PÁGINA RESULTADOS (seleccionadas)              línea  657
DETALLE (modal + desplegado)                   línea  796
PÁGINA DECISIONES (tablero/Insights)           línea  843
DESCUENTOS (modal editable)                    línea 1001
LOGIN / GATE                                   línea 1046
CARGA MASIVA DE PRECIOS (Excel)                línea 1094
NAV                                            línea 1216
INICIO (home)                                  línea 1229
```

Variables globales mutables (`let`), pobladas **post-login** por `bootApp()`:
`DATA`, `P` (productos), `MARCAS`, `CATALOGO`, `DEF_DISC`, `ROL`, `NOMBRE`.

### ⚠️ Los modos "Comercial" y "Analista" NO existen en el código

El pedido de esta documentación menciona *"modos Comercial/Analista"*. **Se verificó: no
existen.** Vienen del **diseño original** (están descriptos en el README raíz del proyecto),
pero la app evolucionó a una navegación de 4 páginas:

| Página (nav) | Clave interna | Qué hace |
|---|---|---|
| **Inicio** | `inicio` | Home: saludo con nombre real, accesos, guía |
| **Catálogo** | `comparaciones` | Buscar producto Leuk → ver equivalentes por competidor |
| **Comparaciones** | `resultados` | Las comparaciones seleccionadas + export CSV |
| **Insights** | `decisiones` | KPIs, escenarios Partner/Cliente, argumentos de venta, sin-competencia |

⚠️ **Las claves internas quedaron con los nombres viejos** (`comparaciones` = la página
"Catálogo", `resultados` = la página "Comparaciones", `decisiones` = "Insights"). Es una
trampa de mantenimiento: el `data-page` no coincide con el label.

El único fósil de los modos originales es la clase CSS **`.mode-toggle`**, que hoy estiliza el
nav de páginas.

---

## Flujo de datos

```
                    ┌─── Excel fichas Leuk ────┐
                    ├─── Excel precios N15 ────┤
                    ├─── Excel fichas ×3 comp ─┤
   FUENTES          ├─── pricing.db (SQLite) ──┤──→ consolidate.py ──→ benchmark_data.json
                    ├─── *.npz (OpenCLIP) ─────┤         │                     │
                    └─── *_etiquetas.json ─────┘         │                     │
                                                    matching.py                │
                                                                               ▼
                                                            subir_datos.py (service_role key)
                                                                               │
                                                                               ▼
                                                        Supabase Storage · bucket privado `datos`
                                                                               │
   RUNTIME          Usuario → GitHub Pages (app estática)                      │
                              │                                                │
                              ├─ login (Supabase Auth) ──→ JWT ────────────────┤
                              │                                                ▼
                              └─ bootApp() ──→ fetchData() con JWT ──→ DATA en memoria
                                     │
                                     ├─ sbPull()       ← tabla `autorizaciones` (selecciones compartidas)
                                     ├─ sbPullPrices() ← tabla `precios` (overrides)
                                     └─ fetchRol()     ← tabla `perfiles` (rol + nombre)
```

**El precio neto y la diferencia % se recalculan en vivo en el browser** desde el precio de
lista + descuento (`netLeuk`/`netComp`/`cmp`). Por eso cambiar un descuento en ⚙ Descuentos
recalcula todo sin tocar el pipeline.

---

## Supabase: tablas y seguridad

| Tabla | Uso | RLS |
|---|---|---|
| `autorizaciones` | Comparaciones seleccionadas + marcas "sin competencia" (`mono\|<sku>`) | SELECT: authenticated · INSERT/UPDATE/DELETE: propio o admin |
| `precios` | Overrides de precio por carga masiva | escritura: `es_editor_precios()` |
| `perfiles` | `email` (PK), `rol`, `nombre` | sólo lectura; gestión por admin |
| Storage `datos` | `benchmark_data.json` | SELECT sólo authenticated |

**Roles:** `lector` (ve y selecciona) → `editor` (+ precios) → `admin` (+ eliminar cualquier
comparación). Funciones `SECURITY DEFINER`: `es_admin()`, `es_editor_precios()`, que comparan
`auth.jwt() ->> 'email'` contra `perfiles`.

⚠️ **Estado real de este control:** la app ya manda el JWT y oculta/bloquea los botones según
rol, pero **el SQL de las políticas RLS está redactado y NO fue corrido todavía**. Hasta que se
corra, el control de borrado es **sólo visual**: alguien logueado podría borrar llamando la API
directo.

### Claves

- `sb_publishable_...` → **pública por diseño**, está en `app.js` (correcto).
- `service_role` key → **SECRETA**, vive sólo en `~/.leuk_pricing/supabase_service.txt`, la usa
  únicamente `subir_datos.py`. 🔴 Nunca debe entrar al repo ni al front.
- 🔴 API key de Anthropic **en texto plano** en `pricing.db` (tabla `config`). Pendiente rotar y
  pasar a `ANTHROPIC_API_KEY`.

---

## Prompt / diseño original

**No existe un archivo con el prompt original de generación de la plataforma.** Lo más cercano
es el `README.md` de la raíz del proyecto, que documenta el diseño inicial. Se transcribe
íntegro abajo **marcando lo que hoy está desactualizado**, porque muestra la intención original
vs. la deriva real — útil para una auditoría.

```markdown
# Benchmark Leuk — Pricing & Ficha Técnica vs. competencia

App de inteligencia competitiva: dado un producto Leuk, muestra sus equivalentes en
**Vonderk, Artelum y World Leds Go** con precio comparado, fichas técnicas lado a lado,
imágenes y **nivel de match** en tres señales (técnica, etiquetación visual, visual).

## Estructura
leuk-benchmark/
├── app/                     ← la aplicación (esto es lo que se comparte/publica)
│   ├── index.html · styles.css · app.js
│   ├── data.js              ← datos consolidados (lo genera el pipeline)
│   └── assets/              ← logos Leuk
├── pipeline/                ← scripts de datos (Python, re-ejecutables)
│   ├── consolidate.py       ← une todo → app/data.js + data/benchmark_data.json
│   ├── img_leuk_manifest.py ← mapea SKU → foto de Drive
│   ├── img_leuk_download.py ← baja miniaturas Leuk
│   ├── img_comp_vecs.py · img_leuk_embed.py  ← señal VISUAL (OpenCLIP + FAISS)
│   ├── img_leuk_tag.py      ← señal ETIQUETACIÓN (Claude visión)
│   ├── matching.py          ← señal TÉCNICA (motor de equivalencia)
│   └── run_all.sh           ← corre todo de punta a punta
└── data/benchmark_data.json ← dataset consolidado (export)

## Cómo abrir la app
- **Local:** doble clic en `app/index.html`. Se abre en cualquier navegador, sin instalar nada.
- **Compartir por link:** subí la carpeta `app/` a un host estático (Netlify, Vercel, GitHub Pages).

Dos modos: **Comercial** (buscá un SKU/nombre → equivalentes) y **Analista** (filtros,
tabla, export a CSV).

## Cómo actualizar los datos
cd ~/leuk-benchmark/pipeline && bash run_all.sh

pip install pandas openpyxl pydantic numpy pillow open_clip_torch faiss-cpu anthropic gdown

### Las tres señales de match
| Señal | Qué compara | Fuente |
| **Técnica** | specs fotométricas (lúmenes, potencia, eficiencia, IP, montaje…) | fichas técnicas + `matching.py` |
| **Etiquetación** | forma/estética con vocabulario controlado (tipo_forma, color…) | Claude visión sobre las fotos |
| **Visual** | huella visual foto-contra-foto | embeddings OpenCLIP ViT-B-32 + FAISS |

El **veredicto** combina las tres (la visual pesa menos por ser la más ruidosa).

## Notas
- Las fotos de Leuk se muestran directo desde Google Drive (público por link); no se hostean.
- 🔴 **Seguridad:** rotá la API key de Anthropic que estaba guardada en `~/.leuk_pricing/pricing.db`
- Fuente de datos canónica: `~/.leuk_pricing/pricing.db`
- Tipografías de marca (DIN Next LT Pro, Simplifica) no son webfonts libres → fallback cercano.
```

### Qué de ese README ya NO es cierto (deriva del diseño)

| El README dice | Realidad hoy |
|---|---|
| "Dos modos: Comercial y Analista" | ❌ No existen. Son 4 páginas: Inicio/Catálogo/Comparaciones/Insights |
| "`data.js` ← datos consolidados" en `app/` | ❌ Eliminado del repo y en `.gitignore`. Los datos van a Supabase Storage |
| "doble clic en `app/index.html`" | ❌ Ya no funciona sin login + conexión a Supabase |
| "subí la carpeta `app/` a Netlify" | ⚠️ Está en GitHub Pages; el repo **debe** ser público |
| "`bash run_all.sh`" | ⚠️ Desactualizado: no incluye `subir_datos.py` ni los builds de WLG/Artelum |
| "OpenCLIP + FAISS" | ⚠️ FAISS se evita en algunos scripts (`NO importa faiss (segfault con torch)`) |
| "DIN Next LT Pro / Simplifica → fallback" | ❌ Se cambió: hoy usa **Barlow Condensed** (la fuente real de marca, verificada en leukiluminacion.com) + Barlow |
| No menciona auth ni roles | ❌ Hoy hay login obligatorio, roles y RLS |

---

## Deuda técnica visible (resumen para el auditor)

1. **`app.js` es un archivo de 1292 líneas sin módulos ni tests.** Todo el estado en globals.
2. **Claves internas desalineadas de los labels** (`resultados` = "Comparaciones", `decisiones` = "Insights").
3. **`MARCAS` hardcodeado en 3 lugares** (paths.py, consolidate.py, app.js).
4. **Umbrales duplicados** entre pipeline y frontend, sin fuente única.
5. **RLS redactada pero no aplicada** → el control de permisos hoy es sólo de UI.
6. **API key de Anthropic en texto plano** en la DB.
7. **Sin tests automatizados** en ningún lado. La validación es visual, producto por producto.
8. **Sin CI**: publicar es `git push` a mano + esperar a Pages.
9. **Cache-busting manual**: hay que subir `?v=N` en `index.html` en cada cambio (va por v69).
10. **El pipeline no es reproducible por otro** : rutas absolutas a iCloud de la usuaria.
11. **`run_all.sh` no refleja el flujo real.**
12. **Tabla `comparaciones` en la DB es basura histórica** que nadie usa pero sigue ahí.
