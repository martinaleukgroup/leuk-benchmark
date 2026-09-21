"""Rutas centrales del pipeline de consolidación del benchmark Leuk.
Un solo lugar para editar si algo se mueve."""
import os
from pathlib import Path

HOME = Path.home()

# Carpeta de trabajo (iCloud, con emojis en la ruta). En otra máquina se apunta con LEUK_WORK.
WORK = Path(os.environ["LEUK_WORK"]).expanduser() if os.environ.get("LEUK_WORK") else \
    HOME / "Library/Mobile Documents/com~apple~CloudDocs/📊 | Comercial/Automatización - Pricing"

# Base de datos canónica (¡NO la de ~/Documents, que está vieja!)
DB = HOME / ".leuk_pricing/pricing.db"

# Ficha técnica de LEUK (mismo formato que competencia; reemplaza a la DB como fuente de specs)
LEUK_FICHAS = WORK / "Bases de datos/Fichas técnicas/Fichas_Tecnicas_Leuk.xlsx"
LEUK_FICHAS_HOJA = "Fichas Leuk"  # productos activos
# Lista de precios oficial de Leuk (N15 V2) — fuente autoritativa de precio (USD), reemplaza a la DB
LEUK_PRECIOS = WORK / "Bases de datos/Fichas técnicas/Lista_Precios_Leuk_N15.xlsx"

# Fichas técnicas de competencia (~27 campos, hoja "Catálogo completo")
FICHAS = {
    "Vonderk":       WORK / "Bases de datos/Fichas técnicas/Vonderk_Fichas_Tecnicas_N49.xlsx",
    "Artelum":       WORK / "Bases de datos/Fichas técnicas/Artelum_Fichas_Tecnicas_N110.xlsx",
    "World Leds Go": WORK / "Bases de datos/Fichas técnicas/WLG_Fichas_Tecnicas_N28.xlsx",
}

# Etiquetas visuales (vocabulario controlado, hoja "Etiquetas_Forma")
ETIQUETAS = {
    "Vonderk":       WORK / "Bases de datos/Imágenes/imagenes_vonderk/Vonderk_Etiquetas_Forma.xlsx",
    "Artelum":       WORK / "Bases de datos/Imágenes/imagenes_artelum/Artelum_Etiquetas_Forma.xlsx",
    "World Leds Go": WORK / "Bases de datos/Imágenes/imagenes_wlg/WLG_Etiquetas_Forma.xlsx",
}

# Índices de imágenes de competencia (slug -> archivos locales)
INDICES = {
    "Vonderk":       WORK / "Bases de datos/Imágenes/imagenes_vonderk/indice.csv",
    "Artelum":       WORK / "Bases de datos/Imágenes/imagenes_artelum/indice.csv",
    "World Leds Go": WORK / "Bases de datos/Imágenes/imagenes_wlg/indice.csv",
}

# Carpetas físicas de imágenes de competencia (por slug)
IMG_COMP_SRC = {
    "Vonderk":       HOME / "imagenes_vonderk",
    "Artelum":       HOME / "imagenes_artelum",
    "World Leds Go": HOME / "imagenes_wlg",
}

# Índice FAISS de competencia (embeddings visuales OpenCLIP ViT-B-32, dim 512)
FAISS_INDEX = None  # se define abajo, relativo a ROOT
FAISS_PATHS = None

# Salidas del proyecto
# En otra máquina (repo clonado) se apunta con LEUK_ROOT, p. ej. <repo>/plataforma
ROOT = Path(os.environ["LEUK_ROOT"]).expanduser() if os.environ.get("LEUK_ROOT") else HOME / "leuk-benchmark"
DATA = ROOT / "data"
IMG_LEUK = DATA / "img/leuk"           # fotos Leuk optimizadas para web
IMG_COMP = DATA / "img/competencia"    # fotos competencia optimizadas para web
OUT_JSON = DATA / "benchmark_data.json"
LEUK_IMG_MANIFEST = ROOT / "pipeline/leuk_image_manifest.json"   # SKU -> Drive fileId
LEUK_TAGS = ROOT / "pipeline/leuk_etiquetas.json"                # SKU -> etiquetas visuales
LEUK_EMB = ROOT / "pipeline/leuk_embeddings.npz"                 # SKU -> vector 512
BUILD_LOG = ROOT / "pipeline/build_log.txt"

FAISS_INDEX = ROOT / "pipeline/faiss/catalog.faiss"
FAISS_PATHS = ROOT / "pipeline/faiss/paths.json"
