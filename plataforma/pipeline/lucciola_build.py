#!/usr/bin/env python3
"""
lucciola_build.py — Puente entre lo APROBADO en la app y el motor del benchmark.

Baja de Supabase los productos de `competencia_extra` marcados aprobado=true y los
traduce al formato que consume consolidate.py (las mismas columnas que las fichas Excel
de Vonderk/Artelum/WLG), agrupando por FAMILIA como el resto de las marcas.

Salidas (en pipeline/):
  · lucciola_fichas.json    — filas con las columnas del motor (Nombre/SKU, Familia, specs, Precio)
  · lucciola_families.json  — slug de familia → {nombre, img}  (para la foto en la app)

Uso:
    python3 lucciola_build.py            # sólo los aprobados (lo normal)
    python3 lucciola_build.py --todos    # todos, para probar antes de aprobar
"""
import json
import pathlib
import sys
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import auth_sesion
from normalize import slug

SB = "https://cswqoretlhppxkelysny.supabase.co"
AQUI = pathlib.Path(__file__).parent
MARCA = "Lucciola"

# La ficha que extrae el worker usa nombres cortos; el motor usa los de la ficha Excel.
MAPA = {
    "fuente_luz": "Fuente de luz", "potencia_w": "Potencia (W)",
    "lumenes": "Lúmenes del sistema", "eficiencia_lmw": "Eficiencia (lm/W)",
    "tension_v": "Tensión (V)", "angulo_haz": "Ángulo de haz", "cri": "CRI",
    "temp_color_k": "Temp. de color (K)", "ugr": "UGR", "ip": "IP",
    "fijacion_montaje": "Fijación/montaje", "medidas": "Medidas",
    "movimiento": "Movimiento", "color_artefacto": "Color del artefacto",
    "control": "Control", "garantia": "Garantía",
}


def bajar(solo_aprobados=True):
    H = auth_sesion.headers()
    filtro = "&aprobado=is.true" if solo_aprobados else ""
    filas, desde = [], 0
    while True:
        url = (f"{SB}/rest/v1/competencia_extra?marca=eq.{MARCA}{filtro}"
               f"&select=codigo,nombre,familia,precio_usd,ficha,imagen&limit=1000&offset={desde}")
        r = urllib.request.Request(url, headers=H)
        lote = json.load(urllib.request.urlopen(r, timeout=60))
        filas += lote
        if len(lote) < 1000:
            break
        desde += 1000
    return filas


def main():
    solo = "--todos" not in sys.argv
    filas = bajar(solo)
    print(f"{MARCA}: {len(filas)} productos {'aprobados' if solo else '(todos)'}")
    if not filas:
        # Importante: VACIAR las salidas. Si se dejan las de una corrida anterior, consolidate.py
        # sigue usando datos viejos (o no aprobados) sin que nadie se entere.
        (AQUI / "lucciola_fichas.json").write_text("[]")
        (AQUI / "lucciola_families.json").write_text("{}")
        print("Nada que construir: salidas vaciadas. Aprobá productos en la app "
              "(Nuevas integraciones) y volvé a correr.")
        return

    fichas, familias = [], {}
    for f in filas:
        fam = (f.get("familia") or f.get("nombre") or "").strip() or "SIN FAMILIA"
        fs = slug(fam)
        row = {"Nombre/SKU": (f.get("codigo") or f.get("nombre") or "").strip(),
               "Familia": fam, "Precio": f.get("precio_usd")}
        for k_corto, k_motor in MAPA.items():
            v = (f.get("ficha") or {}).get(k_corto)
            row[k_motor] = v if v else ""
        fichas.append(row)
        # una foto por familia: la primera que aparezca (el catálogo es 1 foto por familia)
        if fs and f.get("imagen") and fs not in familias:
            familias[fs] = {"nombre": fam, "img": f["imagen"]}
        elif fs and fs not in familias:
            familias[fs] = {"nombre": fam, "img": None}

    (AQUI / "lucciola_fichas.json").write_text(json.dumps(fichas, ensure_ascii=False))
    (AQUI / "lucciola_families.json").write_text(json.dumps(familias, ensure_ascii=False, indent=1))
    con_precio = sum(1 for r in fichas if r["Precio"])
    con_spec = sum(1 for r in fichas if any(r.get(c) for c in MAPA.values()))
    con_img = sum(1 for v in familias.values() if v["img"])
    print(f"→ lucciola_fichas.json: {len(fichas)} filas · {con_precio} con precio · {con_spec} con specs")
    print(f"→ lucciola_families.json: {len(familias)} familias · {con_img} con foto")


if __name__ == "__main__":
    main()
