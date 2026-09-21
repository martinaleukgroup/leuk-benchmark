# Operar el circuito — infraestructura y comandos

Todo lo que hace falta para correr el alta. **Ninguna credencial está escrita acá**: sólo dónde
vive cada una.

## Dónde está cada cosa

| Pieza | Dónde | Para qué |
|---|---|---|
| **Repo / pipeline** | `~/leuk-benchmark/` en la Mac de Martina; en otra máquina, el repo clonado → `plataforma/` (con `LEUK_ROOT` apuntando ahí) | scripts y datos |
| **App publicada** | https://martinaleukgroup.github.io/leuk-benchmark/ | la plataforma |
| **Repo público** | `~/leuk-benchmark/app/` (rama `main`) | la app + `plataforma/` (copia versionada del pipeline, worker, SQL y esta skill; se actualiza con `plataforma/sincronizar.sh`) |
| **Supabase** | proyecto `cswqoretlhppxkelysny` | cola, productos, recetas, datos |
| **Worker** | `~/leuk-benchmark/worker/worker.py` — Modal app `leuk-integracion` | extracción con Claude |
| **Login de scripts** | `pipeline/auth_sesion.py` — tu cuenta de la plataforma (`LEUK_EMAIL`/`LEUK_PASSWORD`) | scripts locales. Probar con `python3 probar_acceso.py`. **Ya no se usa la service key** (sólo el worker de Modal la tiene) |
| **Secreto Modal** | `leuk-integracion` (ANTHROPIC_API_KEY + SUPABASE_URL + SUPABASE_SERVICE_KEY) | el worker |
| **gh CLI** | `~/.local/bin/gh` → `export PATH="$HOME/.local/bin:$PATH"` | publicar |

## Tablas

| Tabla | Qué guarda |
|---|---|
| `integracion_jobs` | la cola: `marca`, `url`, `pdf_paths`, `autor`, `estado`, `resultado` |
| `competencia_extra` | productos extraídos: `nombre`, `familia`, `precio_usd`, `ficha`, `imagen`, `aprobado` |
| `competencia_recetas` | **la receta por marca** (fase 7) |
| `competencia_listas` | historial: qué lista se cargó, cuándo, con qué resultado |
| `competencia_precios_hist` | precio de cada código en cada lista → evolución en el tiempo |

Buckets: **`integracion`** (privado, los PDF) · **`catalogo-img`** (público, las fotos) ·
**`datos`** (privado, el `benchmark_data.json`).

## Comandos

**Subir una lista (encolar un job)** — con la cuenta personal, sin service key:

```bash
cd <pipeline>
python3 encolar_lista.py --marca <slug> lista.pdf                        # actualización (marca con receta)
python3 encolar_lista.py --alta "Marca" --url https://sitio lista.pdf    # alta: extracción de prueba/completa
python3 encolar_lista.py --estado                                        # últimos trabajos
```

**Worker** (sólo quien tiene la cuenta de Modal):

```bash
cd ~/leuk-benchmark/worker
modal deploy worker.py               # desplegar/actualizar el worker
modal run worker.py::procesar_cola   # forzar una corrida ya, sin esperar el schedule
```

El worker corre **cada 2 minutos** (`Period(minutes=2)`, `timeout=3600`), toma el job pendiente más
viejo y lo pasa a `procesando`.

**Re-encolar un job:** PATCH a `integracion_jobs` con `estado="pendiente"` y borrar sus filas de
`competencia_extra`. Lo agarra en ≤2 min.

## Cómo extrae (y por qué así)

Modelo **`claude-sonnet-5`** — para leer tablas rinde igual que Opus y sale ~5× menos.

Dos decisiones que costó llegar a ellas y **no hay que deshacer**:

1. **El PDF se parte en tandas de 6 páginas** (`CHUNK = 6`), no se manda entero.
2. **Si una tanda se trunca** (`stop_reason == max_tokens` o JSON incompleto), `extraer_rango()` la
   **subdivide a la mitad y reintenta**, recursivo hasta página individual.

Con Opus + tandas fijas se perdían páginas densas y un catálogo de 104 páginas no entraba en 15
minutos: quedaba colgado en `procesando`.

## Costos

Lo único pago del circuito es **la API de Claude**. Modal (free ~US$30/mes), Supabase y GitHub
Pages van en free tier. Un catálogo de 100 páginas sale **~US$3** con Sonnet.

> Si un job queda en `error` sin causa clara, **fijate primero el saldo de la cuenta Anthropic**
> (console.anthropic.com → Facturación). Ya pasó una vez: se quedó sin crédito a mitad de la
> primera corrida.

## Permisos

`puede_integrar()` en SQL y `puedeIntegrar()` en `app.js` = roles **admin, líder, coordinación**.
Los dos tienen que decir lo mismo: el de la app decide qué se ve, el de SQL protege la escritura.
