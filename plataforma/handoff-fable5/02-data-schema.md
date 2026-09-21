# 02 · Esquema de datos

> Estado real al 2026-07-16, medido sobre `data/benchmark_data.json` (561 productos Leuk,
> 875 entidades de competencia).

---

## Mapa de fuentes (dónde vive cada cosa)

No hay una única base: el sistema **une 5 fuentes heterogéneas** en un JSON.

| Fuente | Formato | Qué aporta | Ruta |
|---|---|---|---|
| Ficha técnica Leuk | Excel (hoja `Fichas Leuk`) | Specs de los 561 productos Leuk | `Bases de datos/Fichas técnicas/Fichas_Tecnicas_Leuk.xlsx` |
| Lista de precios Leuk | Excel (N15 V2) | **Precio oficial USD** (prioridad sobre la DB) | `Bases de datos/Fichas técnicas/Lista_Precios_Leuk_N15.xlsx` |
| Fichas competencia | Excel × 3 (hoja `Catálogo completo`) | Specs de Vonderk / Artelum / WLG | `Bases de datos/Fichas técnicas/{Vonderk_N49, Artelum_N110, WLG_N28}.xlsx` |
| Base canónica | SQLite | Descuentos por marca, tipo de cambio, precios Leuk (respaldo) | `~/.leuk_pricing/pricing.db` |
| Señales de imagen | `.npz` + `.json` | Embeddings OpenCLIP + etiquetas de Claude visión | `pipeline/*.npz`, `pipeline/*_etiquetas.json` |

**Salida única:** `data/benchmark_data.json` (~21 MB) → se sube a Supabase Storage (bucket
privado `datos`) → la app lo descarga tras el login.

### `pricing.db` (SQLite) — tablas

```
leuk_productos            id, vertical, familia, subfamilia, sku (UNIQUE), nombre, precio_usd, …
competidor_productos      catálogo de competencia (legacy)
comparaciones             ⚠️ OUTPUT DE UN PROCESO VIEJO — el pipeline actual NO la usa
descuentos_competidores   marca (PK), desc_standard, desc_pronto_pago, desc_total, desc_cliente
tipos_cambio              fecha (UNIQUE), dolar_blue_venta, dolar_oficial_venta
precio_historial          histórico de precios
config                    clave/valor  🔴 contiene una API key de Anthropic en texto plano (rotar)
```

⚠️ **`comparaciones` es basura histórica**: 874 de 875 filas decían "Equiv. completo". El
`consolidate.py` actual genera las propuestas en vivo y la ignora por completo.

---

## Los 23 campos de la ficha técnica

Hay una **distinción importante que el pedido original no captura**: los Excel de competencia
tienen **28 columnas** (23 de ficha + metadatos), pero el pipeline sólo lleva **16** al JSON.
**6 campos se extraen y se descartan.**

### Columnas reales del Excel de competencia (28)

| # | Columna | ¿Va al JSON? | ¿Puntúa en el matching? |
|---|---|---|---|
| 1 | Sección | — (metadato) | no |
| 2 | Familia | usada para agrupar | no |
| 3 | Nombre/SKU | ✅ identidad | no |
| 4 | Fuente de luz | ✅ | ✅ peso 7 |
| 5 | Potencia (W) | ✅ | ✅ peso 9 · **núcleo** |
| 6 | Lúmenes del sistema | ✅ | ✅ peso 10 · **núcleo** |
| 7 | Lúmenes de la fuente | ❌ **descartado** | no |
| 8 | Eficiencia (lm/W) | ✅ | ✅ peso 10 · **núcleo** |
| 9 | Tensión (V) | ✅ | ✅ peso 5 |
| 10 | Ángulo de haz | ✅ | ✅ peso 8 |
| 11 | CRI | ✅ | ✅ peso 9 |
| 12 | Temp. de color (K) | ✅ | ✅ peso 7 |
| 13 | McAdams step | ❌ **descartado** | no |
| 14 | UGR | ✅ | ✅ peso 8 |
| 15 | IP | ✅ | 🚪 **gating** |
| 16 | Eficiencia energética | ❌ **descartado** | no (se trató como sinónimo de eficiencia luminosa) |
| 17 | IK | ❌ **descartado** | no |
| 18 | Clase | ❌ **descartado** | no |
| 19 | Fijación/montaje | ✅ | 🚪 **gating** |
| 20 | Medidas | ✅ | ✅ peso 7 |
| 21 | Movimiento | ✅ | ✅ peso 6 |
| 22 | Peso | ❌ **descartado** | no |
| 23 | Color del artefacto | ✅ | ⬜ peso **0** (informativo) |
| 24 | Control | ✅ | ✅ peso 8 |
| 25 | Garantía | ✅ | ✅ peso 8 |
| 26 | Precio | ✅ (aparte) | no |
| 27 | Precio mínimo sugerido | ❌ | no |
| 28 | Fuente del dato | ❌ (trazabilidad) | no |

En código, el subconjunto que sobrevive es `FICHA_CAMPOS` (`consolidate.py:226`), 16 campos:

```python
FICHA_CAMPOS = ["Fuente de luz", "Potencia (W)", "Lúmenes del sistema", "Eficiencia (lm/W)",
                "Tensión (V)", "Ángulo de haz", "CRI", "Temp. de color (K)", "UGR", "IP",
                "Fijación/montaje", "Medidas", "Movimiento", "Color del artefacto", "Control", "Garantía"]
```

⚠️ **Asimetría Leuk vs competencia**: el Excel de Leuk usa `Lúmenes` y `Fijación`; el de
competencia usa `Lúmenes del sistema` y `Fijación/montaje`. Los nombres de columna **no
coinciden** entre las dos fuentes; el mapeo se hace a mano en `cargar_leuk()` y
`producto_desde_ficha()`.

---

## Completitud real (medida, no estimada)

### Leuk (n=561)

| Campo | Completo | % |
|---|---|---|
| Color del artefacto | 561 | **100%** |
| Garantía | 559 | 100% |
| Medidas | 556 | 99% |
| IP | 514 | 92% |
| Tensión (V) | 508 | 91% |
| Fijación | 464 | 83% |
| Fuente de luz | 439 | 78% |
| Potencia (W) | 430 | 77% |
| Temp. de color (K) | 357 | 64% |
| Control | 361 | 64% |
| Lúmenes / Eficiencia / CRI / UGR | 355 | **63%** |
| Ángulo de haz | 353 | 63% |

### Competencia (sobre 7.3k pares evaluados)

| Campo | % |
|---|---|
| Potencia (W) | 69% |
| Lúmenes del sistema / Eficiencia | 68% |
| Temp. de color (K) | 68% |
| Medidas / Color | 68% |
| Control | 66% |
| Tensión (V) | 58% |
| IP | **57%** |
| Fijación/montaje | **57%** |
| Fuente de luz | 48% |
| Garantía | 40% |
| CRI | 28% |
| Ángulo de haz | 27% |
| UGR | **14%** |
| Movimiento | **9%** |

### Por qué esto importa (la causa raíz del comportamiento del motor)

- **IP y Fijación son las dos llaves del gating**, y sólo están en el **57%** de la competencia.
  El gating **rechaza cuando falta el dato** (no lo saltea). Eso solo ya explica que la señal
  técnica dé `No comparable` en la mayoría de los pares.
- **El núcleo del guardrail** (Lúmenes, Eficiencia, Potencia) está al 63% en Leuk y ~68% en
  competencia. La intersección de ambos es mucho menor.
- **44% de los pares no tienen señal técnica en absoluto** (6064 de 13910): la entidad
  competidora no tiene ficha, sólo foto/etiqueta.

### A nivel producto Leuk

| | n | % |
|---|---|---|
| Con ficha | 561 | 100% |
| Con imagen | 547 | 98% |
| Con etiquetas (Claude visión) | 515 | 92% |
| **Con precio** | **521** | **93%** |
| Con al menos 1 match | 474 | 85% |

---

## Cómo se relacionan Leuk ↔ competencia

**No hay clave compartida.** El vínculo se construye así:

```
Producto Leuk (SKU)
   │
   ├─ ficha   ──→ matching.py ──────→ señal técnica  (contra CADA variante de la entidad)
   ├─ foto    ──→ OpenCLIP vec ─────→ señal visual   (coseno contra vec de entidad)
   └─ foto    ──→ Claude visión ────→ señal etiquetación (vocabulario controlado)
                                            │
                          Entidad de competencia (agrupada por "fslug")
                          ├─ familia (ej. "VK-SAUBER")
                          ├─ variantes[] (filas de ficha de esa familia, hasta 8)
                          ├─ etiqueta (1 por entidad)
                          └─ vis_vec (promedio de fotos de la familia)
```

- La unidad de comparación **NO es el SKU del competidor, es la FAMILIA** (`fslug`). Una
  entidad agrupa hasta 8 variantes de ficha; el motor evalúa todas y se queda con la mejor
  (`best_r`), y por separado con la mejor **que tenga precio** (`best_priced_v`).
- ⚠️ Por eso el precio mostrado puede ser de **otra variante** que la que ganó el match
  (bandera `precio_aprox: true`).
- Las claves de join son **heterogéneas por marca**: Vonderk usa slug (`vk-sauber`), Artelum
  usa SKU numérico (`752`), WLG usa slug de familia (`linear`). Se reconcilian con
  `normalize.py::slug()` + `_reconciliar()`.

### Estructura del JSON de salida

```
benchmark_data.json
├── meta          { generado, n_productos_leuk, n_con_propuesta, competidores[],
│                   tc_blue, cobertura_imagenes, cobertura_etiquetas, descuentos{} }
├── productos[561]
│   ├── sku, nombre, vertical, familia, subfamilia
│   ├── precio_usd (lista), precio_neto, descuento
│   ├── imagen (URL Google Drive)
│   ├── ficha{}      ← 16-18 campos
│   ├── etiquetas{}  ← salida de Claude visión (12 claves)
│   ├── mejor_por_marca{ Vonderk|Artelum|World Leds Go → propuesta | null }
│   ├── propuestas[≤20]   ← confianza alta (≥2 señales)
│   ├── posibles[≤15]     ← confianza baja (1 señal)
│   └── similares[≤8]     ← otros productos LEUK parecidos (no competencia)
└── competencia[875]  ← catálogo plano para el buscador de sugerencias manuales
```

Cada propuesta tiene:
```
marca, familia, nombre, fslug, precio_aprox, ficha{}, imagen, etiquetas{},
precio{ usd (lista), neto, desc },
diferencia_pct (sobre NETO), diferencia_lista, posicion_precio,
match{ tecnico{nivel,score,coinciden[],difieren[]}, etiquetacion{}, visual{},
       veredicto, score, confianza, n_senales }
```

### Precio: cómo se calcula

```
precio_neto = precio_lista × (1 − desc_total/100)
```
`desc_total` sale de `descuentos_competidores` en la DB. Valores actuales relevantes:

| Marca | desc_total |
|---|---|
| **LEUK** | **0.0%** |
| Vonderk | 68.55% |
| Artelum | 38.25% |
| World Leds Go | 51.4% |

⚠️ Los descuentos son **muy asimétricos** (Vonderk 68.55% vs Leuk 0%) y esto domina por
completo la comparación de "precio neto". El frontend permite simularlos (⚙ Descuentos,
`localStorage`), pero el default viene de la DB.

⚠️ El JSON expone la tabla `descuentos` **completa** en `meta`, incluidas 16 marcas que no son
competidores del benchmark.

---

## Rarezas del dato (lo que rompe los parsers)

Todo esto es real y está en los datos hoy:

| Campo | Valores reales | Efecto |
|---|---|---|
| `Potencia (W)` | `'12'`, `'12.5'`, `'1 x 50W Max'`, `'4 x 50W Max'`, `'10W'` | `parse_number` toma el **primer** número → `'1 x 50W Max'` = **1W**, no 50W |
| `Temp. de color (K)` | `'3000/4000/6000'`, `'2700/3300/4000'` | `parse_number` **promedia** → 4333K (un valor que el producto no tiene) |
| `Tensión (V)` | `'200-240'`, `'220V'`, `'24V'` | promedia rango → 220 |
| `CRI` | `'>80'`, `'>90'` | `>` se ignora → 80 / 90 |
| `UGR` | `'< 20'`, `'<19'` | idem |
| `IP` | `'IP44'` (Leuk) vs `'44'` (competencia) | `_ip_bucket` lo tolera |
| `Medidas` | `'Ø120 x 70'`, `'A: Ø185 mm B: 80 mm'`, `'65 x 113 x 120'` | `parse_dimension` prioriza Ø; si no, el **mayor** |
| `Garantía` | `'2 Años'` vs `'2 años'` | ok |
| `Color del artefacto` | `'Negro Satinado'`, `'Negro Mate'`, `'Negro'` | no se canoniza → strings distintos para el mismo color |

**No existe campo `Material`.** El aluminio (dato que la usuaria quería usar como argumento de
venta) **no está en la ficha estructurada** de ninguna marca — aparece esporádicamente en
`Fijación/montaje` de 28 filas de competencia, y nunca en Leuk. Sólo está en `etiquetas.material_aparente`,
que es una **inferencia de la IA sobre la foto**, no un dato de catálogo.

---

## Ejemplo real completo

`LEUK 7219 · PRISMA NG 20W IP44` — es el mejor match del benchmark (Equivalente, 20W vs 20W).
Recortado a 1 propuesta / 1 posible / 2 similares para que sea legible; el resto de la
estructura es literal.

Notar en este ejemplo:
- `ficha` tiene 18 claves (incluye `Vertical`/`Familia`/`Subfamilia` que no están en `FICHA_CAMPOS`).
- `Temp. de color (K): "3000/4000/6000"` → el parser promedia a 4333K.
- `Medidas: "Ø120 x 70"` → dimensión dominante = 120 (diámetro).
- `match.tecnico.nivel = "No comparable"` **con veredicto `Equivalente`** — el caso típico
  descripto en el doc 01.
- Leuk `IP44` vs Vonderk `44` — mismo bucket `resto`.

```json
{
  "sku": "7219",
  "nombre": "PRISMA NG 20W IP44",
  "vertical": "Exterior",
  "familia": "De Techo",
  "subfamilia": "Aplique",
  "precio_usd": 32.83,
  "precio_neto": 32.83,
  "descuento": 0.0,
  "imagen": "https://lh3.googleusercontent.com/d/14IPLVjWAHWj_JtIDzCPWTMsdXbjf09_M=w900",
  "ficha": {
    "Vertical": "Exterior",
    "Familia": "De Techo",
    "Subfamilia": "Aplique",
    "Fuente de luz": "LED integrado",
    "Potencia (W)": "20",
    "Lúmenes": "1300",
    "Eficiencia (lm/W)": "65",
    "Tensión (V)": "200-240",
    "CRI": ">90",
    "Temp. de color (K)": "3000/4000/6000",
    "Ángulo de haz": "110",
    "IP": "IP44",
    "UGR": "< 25",
    "Fijación": "Aplicar",
    "Control": "ON/OFF",
    "Medidas": "Ø120 x 70",
    "Color del artefacto": "Negro Satinado",
    "Garantía": "2 Años"
  },
  "etiquetas": {
    "tipo_forma": "cilindro_tubo",
    "tipo_montaje": "plafon",
    "color": "grafito",
    "terminacion": "mate",
    "orientacion": "redonda_simetrica",
    "proporcion": "compacta",
    "estilo": "minimalista",
    "material_aparente": "aluminio",
    "difusor_visible": "opal_blanco",
    "es_foto_ambientada": "NO",
    "confianza": 0.95,
    "notas": "Luminaria de techo cilíndrica compacta con difusor opal integrado. Acabado mate en color grafito. Diseño técnico y minimalista típico de iluminación moderna downlight."
  },
  "mejor_por_marca": {
    "Vonderk": {
      "marca": "Vonderk",
      "familia": "VK-SAUBER",
      "nombre": "VK-SAUBER-20W-BL-3000K-220V",
      "fslug": "vk-sauber",
      "precio_aprox": false,
      "ficha": {
        "Potencia (W)": "20W",
        "Lúmenes del sistema": "1366 lm",
        "Eficiencia (lm/W)": "68",
        "Tensión (V)": "220V",
        "Temp. de color (K)": "3000K",
        "IP": "44",
        "Medidas": "A: Ø185 mm B: 80 mm",
        "Color del artefacto": "Blanco",
        "Control": "ON-OFF"
      },
      "imagen": "https://www.vonderk.com/wp-content/uploads/2023/07/PORTADA_Mesa-de-trabajo-1-01.png",
      "etiquetas": {
        "tipo_forma": "cilindro_tubo",
        "tipo_montaje": "plafon",
        "color": "blanco",
        "terminacion": "mate",
        "estilo": "minimalista",
        "proporcion": "compacta"
      },
      "match": {
        "tecnico": {
          "nivel": "No comparable",
          "score": 0.0,
          "coinciden": [
            "Lúmenes del sistema/fuente",
            "Eficiencia luminosa (lm/W)",
            "Potencia del sistema (W)",
            "Tensión (V)"
          ],
          "difieren": [
            "Control (ON/OFF, DIM, DALI)",
            "Medidas (dim. dominante)",
            "Temperatura de color (K)",
            "Color del artefacto"
          ]
        },
        "etiquetacion": {
          "nivel": "Equivalente",
          "score": 1.0,
          "coinciden": [
            "tipo_forma",
            "tipo_montaje",
            "proporcion",
            "estilo"
          ],
          "difieren": []
        },
        "visual": {
          "nivel": "Equivalente",
          "similitud": 0.858
        },
        "veredicto": "Equivalente",
        "score": 0.55,
        "confianza": "alta",
        "n_senales": 2
      },
      "diferencia_pct": 44.3,
      "posicion_precio": "Leuk más barato",
      "diferencia_lista": 358.8,
      "precio": {
        "usd": 150.63,
        "neto": 47.37,
        "desc": 68.55
      }
    }
  },
  "propuestas": [
    {
      "marca": "Vonderk",
      "familia": "VK-SAUBER",
      "nombre": "VK-SAUBER-20W-BL-3000K-220V",
      "fslug": "vk-sauber",
      "precio_aprox": false,
      "ficha": {
        "Potencia (W)": "20W",
        "Lúmenes del sistema": "1366 lm",
        "Eficiencia (lm/W)": "68",
        "Tensión (V)": "220V",
        "Temp. de color (K)": "3000K",
        "IP": "44",
        "Medidas": "A: Ø185 mm B: 80 mm",
        "Color del artefacto": "Blanco",
        "Control": "ON-OFF"
      },
      "imagen": "https://www.vonderk.com/wp-content/uploads/2023/07/PORTADA_Mesa-de-trabajo-1-01.png",
      "etiquetas": {
        "tipo_forma": "cilindro_tubo",
        "tipo_montaje": "plafon",
        "color": "blanco",
        "terminacion": "mate",
        "estilo": "minimalista",
        "proporcion": "compacta"
      },
      "match": {
        "tecnico": {
          "nivel": "No comparable",
          "score": 0.0,
          "coinciden": [
            "Lúmenes del sistema/fuente",
            "Eficiencia luminosa (lm/W)",
            "Potencia del sistema (W)",
            "Tensión (V)"
          ],
          "difieren": [
            "Control (ON/OFF, DIM, DALI)",
            "Medidas (dim. dominante)",
            "Temperatura de color (K)",
            "Color del artefacto"
          ]
        },
        "etiquetacion": {
          "nivel": "Equivalente",
          "score": 1.0,
          "coinciden": [
            "tipo_forma",
            "tipo_montaje",
            "proporcion",
            "estilo"
          ],
          "difieren": []
        },
        "visual": {
          "nivel": "Equivalente",
          "similitud": 0.858
        },
        "veredicto": "Equivalente",
        "score": 0.55,
        "confianza": "alta",
        "n_senales": 2
      },
      "diferencia_pct": 44.3,
      "posicion_precio": "Leuk más barato",
      "diferencia_lista": 358.8,
      "precio": {
        "usd": 150.63,
        "neto": 47.37,
        "desc": 68.55
      }
    }
  ],
  "n_propuestas": 20,
  "posibles": [
    {
      "marca": "Artelum",
      "familia": "TUBO LINE IP54",
      "nombre": "72110",
      "fslug": "741",
      "precio_aprox": false,
      "ficha": {
        "Fuente de luz": "LED integrado",
        "Potencia (W)": "18W",
        "Lúmenes del sistema": "1445 lm",
        "Eficiencia (lm/W)": "80",
        "Temp. de color (K)": "2700K/3000K",
        "IP": "IP54",
        "Medidas": "800 x Ø55 mm",
        "Color del artefacto": "Blanco"
      },
      "imagen": "img/artelum/741.jpg",
      "etiquetas": {
        "tipo_forma": "cilindro_tubo",
        "tipo_montaje": "plafon",
        "color": "blanco",
        "terminacion": "satinado",
        "estilo": "minimalista",
        "proporcion": "alargada"
      },
      "match": {
        "tecnico": {
          "nivel": "No comparable",
          "score": 0.0,
          "coinciden": [
            "Eficiencia luminosa (lm/W)",
            "Potencia del sistema (W)",
            "Fuente de luz"
          ],
          "difieren": [
            "Medidas (dim. dominante)",
            "Temperatura de color (K)",
            "Color del artefacto"
          ]
        },
        "etiquetacion": {
          "nivel": "Equivalente",
          "score": 0.8,
          "coinciden": [
            "tipo_forma",
            "tipo_montaje",
            "estilo"
          ],
          "difieren": [
            "proporcion: compacta≠alargada"
          ]
        },
        "visual": {
          "nivel": "No comparable",
          "similitud": 0.669
        },
        "veredicto": "Posible",
        "score": 0.4,
        "confianza": "baja",
        "n_senales": 1
      },
      "diferencia_pct": 85.4,
      "posicion_precio": "Leuk más barato",
      "diferencia_lista": 200.3,
      "precio": {
        "usd": 98.59,
        "neto": 60.88,
        "desc": 38.25
      }
    }
  ],
  "n_posibles": 15,
  "similares": [
    "7218",
    "6848"
  ]
}```
