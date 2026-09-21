# Benchmark Leuk — Pricing & Ficha Técnica vs. competencia

App de inteligencia competitiva: dado un producto Leuk, muestra sus equivalentes en
**Vonderk, Artelum y World Leds Go** con precio comparado, fichas técnicas lado a lado,
imágenes y **nivel de match** en tres señales (técnica, etiquetación visual, visual).

## Estructura

```
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
```

## Cómo abrir la app

- **Local:** doble clic en `app/index.html`. Se abre en cualquier navegador, sin instalar nada.
- **Compartir por link:** subí la carpeta `app/` a un host estático (Netlify, Vercel, GitHub
  Pages). Ejemplo con Netlify Drop: arrastrá la carpeta `app/` a https://app.netlify.com/drop
  y te da un link para mandar por WhatsApp/mail.

Dos modos: **Comercial** (buscá un SKU/nombre → equivalentes) y **Analista** (filtros,
tabla, export a CSV).

## Cómo actualizar los datos

Cuando cambien las fuentes (lista de precios, fichas, imágenes), corré:

```bash
cd ~/leuk-benchmark/pipeline && bash run_all.sh
```

Eso regenera `app/data.js` y la app queda al día. Requisitos (una vez):

```bash
pip install pandas openpyxl pydantic numpy pillow open_clip_torch faiss-cpu anthropic gdown
```

### Las tres señales de match

| Señal | Qué compara | Fuente |
|---|---|---|
| **Técnica** | specs fotométricas (lúmenes, potencia, eficiencia, IP, montaje…) | fichas técnicas + `matching.py` |
| **Etiquetación** | forma/estética con vocabulario controlado (tipo_forma, color…) | Claude visión sobre las fotos |
| **Visual** | huella visual foto-contra-foto | embeddings OpenCLIP ViT-B-32 + FAISS |

El **veredicto** combina las tres (la visual pesa menos por ser la más ruidosa).

## Notas

- Las fotos de Leuk se muestran directo desde Google Drive (público por link); no se hostean.
- 🔴 **Seguridad:** rotá la API key de Anthropic que estaba guardada en `~/.leuk_pricing/pricing.db`
  (tabla `config`). El pipeline la lee de ahí o de la variable `ANTHROPIC_API_KEY` (preferible).
- Fuente de datos canónica: `~/.leuk_pricing/pricing.db` (la copia en `~/Documents` está vieja).
- Tipografías de marca (DIN Next LT Pro, Simplifica) no son webfonts libres → se usa un
  fallback cercano, parametrizado en `styles.css` (`--font-title`, `--font-body`).
