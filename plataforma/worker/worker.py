"""
worker.py — Worker de integración de competencia (Modal, v2).

Corre en la nube cada 2 minutos: toma un job pendiente de la tabla `integracion_jobs`
de Supabase, baja los PDF del bucket 'integracion' y usa Claude para extraer los
productos con su ficha técnica y precio.

Dos modos, según `integracion_jobs.tipo`:

  · 'alta'          → carga inicial de una marca nueva. Reemplaza lo del job.
                      Se hace acompañando la skill `alta-competidor` (no self-service).
  · 'actualizacion' → lista nueva de una marca YA cargada, que tiene RECETA.
                      La app la dispara sola. Cruza contra lo cargado y devuelve:
                      precios que cambiaron, productos nuevos, productos que faltan.
                      Guarda el histórico de precios.

La RECETA (tabla `competencia_recetas`) es la que dice dónde vive cada dato en la lista
de esa marca: moneda, IVA, en qué columna está el código, particularidades. Sin receta no
hay actualización posible — hay que dar el alta con la skill primero.

Deploy:   modal deploy worker.py
Probar:   modal run worker.py::procesar_cola
Secreto:  leuk-integracion (ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY).
"""
import modal

app = modal.App("leuk-integracion")

# Imagen liviana: SDK de Anthropic + httpx + pypdf (para partir el PDF en tandas de páginas).
# (Sin torch/OpenCLIP todavía — eso es v3, cuando el worker haga también las imágenes.)
image = modal.Image.debian_slim().pip_install("anthropic>=0.40", "httpx>=0.27", "pypdf>=4.0")

SECRET = modal.Secret.from_name("leuk-integracion")

# Modelo: Sonnet 5 — para extraer tablas de PDF anda igual de bien que Opus y cuesta ~5x menos.
# (Si alguna vez se necesita máxima calidad en un caso difícil, se puede volver a "claude-opus-5".)
MODELO = "claude-sonnet-5"

# Esquema de salida estructurada: una lista de productos con la ficha técnica de Leuk.
# Todos los campos son obligatorios (string vacío si no está) para el modo strict.
# 'codigo' es la CLAVE con la que se cruza una lista contra la siguiente: sin él no se puede
# saber si un producto de la lista nueva ya existía o es nuevo.
CAMPOS = ["codigo", "nombre", "familia", "precio", "fuente_luz", "potencia_w", "lumenes",
          "eficiencia_lmw", "tension_v", "angulo_haz", "cri", "temp_color_k", "ugr",
          "ip", "fijacion_montaje", "medidas", "movimiento", "color_artefacto",
          "control", "garantia"]
NO_FICHA = ("codigo", "nombre", "familia", "precio")
SCHEMA = {
    "type": "object",
    "properties": {
        "productos": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {c: {"type": "string"} for c in CAMPOS},
                "required": CAMPOS,
                "additionalProperties": False,
            },
        }
    },
    "required": ["productos"],
    "additionalProperties": False,
}

PROMPT = (
    "Sos un extractor de catálogos de iluminación. Este PDF es la lista de precios o catálogo "
    "de la marca competidora «{marca}». Extraé TODOS los productos que encuentres, uno por fila. "
    "Para cada uno completá los campos que estén presentes y dejá string vacío en los que no. "
    "'codigo' es el código/SKU tal cual figura en la lista (sin reformatear); 'nombre' es la "
    "descripción o nombre del producto; 'familia' la línea o familia si aplica. "
    "El campo 'precio' es el precio de lista tal cual figura (con su moneda si la muestra). "
    "No inventes datos: si un spec no está en el PDF, dejalo vacío. Devolvé sólo el JSON."
)


def _parse_precio(s):
    """Best-effort: número del texto de precio (maneja 1.234,56 y 1234.56)."""
    import re
    raw = re.sub(r"[^\d.,]", "", str(s or ""))
    if not raw:
        return None
    if "," in raw and "." in raw:
        raw = raw.replace(".", "").replace(",", ".")
    elif "," in raw:
        raw = raw.replace(",", ".")
    try:
        v = float(raw)
        return round(v, 2) if v > 0 else None
    except ValueError:
        return None


def _slugify(s):
    import re, unicodedata
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def _clave(fila, campo):
    """Clave de cruce entre listas, normalizada. Cae a 'nombre' si no hay código
    (las cargas viejas, anteriores a que el worker extrajera el código, no lo tienen)."""
    v = (fila.get(campo) or "").strip().upper()
    if not v and campo != "nombre":
        v = (fila.get("nombre") or "").strip().upper()
    return v or None


def _hints_receta(receta):
    """Convierte la receta en instrucciones extra para el prompt: lo que sabemos de
    esta marca en particular y que el modelo no puede adivinar del PDF."""
    if not receta:
        return ""
    lp = receta.get("lista_precios") or {}
    partes = []
    if lp.get("codigo", {}).get("columna"):
        partes.append(f"El código está en la columna «{lp['codigo']['columna']}».")
    if lp.get("precio", {}).get("cual"):
        partes.append(f"Cuando haya más de una columna de precio, usá la {lp['precio']['cual']}.")
    if lp.get("moneda"):
        partes.append(f"Los precios están en {lp['moneda']}.")
    if lp.get("paginas_ignorar"):
        partes.append(f"Ignorá las páginas {lp['paginas_ignorar']} (no son catálogo).")
    for p in (receta.get("particularidades") or [])[:6]:
        partes.append(p)
    if not partes:
        return ""
    return ("\n\nParticularidades conocidas de esta marca (tenelas en cuenta):\n· "
            + "\n· ".join(partes))


def _a_usd(valor, receta):
    """Pasa el precio a USD según la receta. Sin receta, se asume que ya viene en USD
    (que es como venía en v1)."""
    if valor is None:
        return None
    lp = (receta or {}).get("lista_precios") or {}
    moneda, tc = lp.get("moneda"), lp.get("tipo_cambio")
    if moneda and moneda != "USD":
        if not tc:
            return None          # sin tipo de cambio no inventamos un precio
        valor = valor / float(tc)
    desc = lp.get("descuento_lista") or 0
    if desc:
        valor = valor * (1 - float(desc) / 100.0)
    return round(valor, 2)


@app.function(image=image, secrets=[SECRET], schedule=modal.Period(minutes=2), timeout=3600)
def procesar_cola():
    import os, io, json, base64, httpx, pypdf
    from anthropic import Anthropic

    SB = os.environ["SUPABASE_URL"]
    KEY = os.environ["SUPABASE_SERVICE_KEY"]
    H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    cli = Anthropic()  # toma ANTHROPIC_API_KEY del entorno (secreto de Modal)

    with httpx.Client(timeout=60) as hx:
        # 1) tomar UN job pendiente (el más viejo)
        r = hx.get(f"{SB}/rest/v1/integracion_jobs",
                   params={"estado": "eq.pendiente", "order": "creado.asc", "limit": 1}, headers=H)
        r.raise_for_status()
        jobs = r.json()
        if not jobs:
            print("Sin jobs pendientes.")
            return
        job = jobs[0]
        jid, marca = job["id"], job["marca"]
        tipo = job.get("tipo") or "alta"
        slug = job.get("slug") or _slugify(marca)
        print(f"Procesando job {jid} · {tipo} · marca={marca} · "
              f"{len(job.get('pdf_paths') or [])} PDF")

        def set_estado(estado, **extra):
            hx.patch(f"{SB}/rest/v1/integracion_jobs", params={"id": f"eq.{jid}"},
                     headers={**H, "Prefer": "return=minimal"},
                     json={"estado": estado, "actualizado": "now()", **extra})

        set_estado("procesando")
        try:
            # ── La receta: cómo se lee la lista de ESTA marca ────────────────────
            rr = hx.get(f"{SB}/rest/v1/competencia_recetas",
                        params={"slug": f"eq.{slug}", "select": "receta,marca,estado"}, headers=H)
            receta = (rr.json() or [{}])[0].get("receta") if rr.status_code == 200 and rr.json() else None
            if receta:
                print(f"  receta encontrada ({len(receta.get('particularidades') or [])} particularidades)")
            elif tipo == "actualizacion":
                raise RuntimeError(
                    f"La marca «{marca}» no tiene receta cargada, así que no se puede actualizar "
                    f"sola. Hay que darle el alta con la skill 'alta-competidor' primero.")

            prompt = PROMPT.format(marca=marca) + _hints_receta(receta)

            # Llama a Claude sobre un PDF (base64). Devuelve (productos, truncado?).
            # 'truncado' = la respuesta se cortó por largo (páginas muy densas) → hay que dividir.
            def extraer_pdf(b64):
                with cli.messages.stream(
                    model=MODELO, max_tokens=24000,
                    output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
                    messages=[{"role": "user", "content": [
                        {"type": "document", "source": {"type": "base64",
                         "media_type": "application/pdf", "data": b64}},
                        {"type": "text", "text": prompt},
                    ]}],
                ) as stream:
                    msg = stream.get_final_message()
                if msg.stop_reason == "refusal":
                    raise RuntimeError("Claude rechazó el PDF (contenido no permitido).")
                txt = next((b.text for b in msg.content if b.type == "text"), "")
                try:
                    return (json.loads(txt).get("productos") or []), (msg.stop_reason == "max_tokens")
                except json.JSONDecodeError:
                    return [], True  # JSON incompleto = la respuesta se truncó

            # Extrae el rango de páginas [ini, fin). Si se trunca, lo parte a la mitad y reintenta
            # (divide y vencerás), así no se pierde NINGÚN producto de las páginas densas.
            def extraer_rango(reader, ini, fin, npag):
                w = pypdf.PdfWriter()
                for i in range(ini, fin):
                    w.add_page(reader.pages[i])
                buf = io.BytesIO(); w.write(buf)
                b64 = base64.standard_b64encode(buf.getvalue()).decode("utf-8")
                prods, truncado = extraer_pdf(b64)
                if truncado and fin - ini > 1:
                    mid = (ini + fin) // 2
                    print(f"  pág {ini+1}-{fin}: truncado → divido en {ini+1}-{mid} y {mid+1}-{fin}")
                    return extraer_rango(reader, ini, mid, npag) + extraer_rango(reader, mid, fin, npag)
                print(f"  pág {ini+1}-{fin}/{npag}: +{len(prods)}" + (" (TRUNCADO en 1 pág)" if truncado else ""))
                return prods

            productos = []
            for path in (job.get("pdf_paths") or []):
                # 2) bajar el PDF del bucket privado
                pr = hx.get(f"{SB}/storage/v1/object/integracion/{path}",
                            headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
                pr.raise_for_status()
                # 3) recorrer el PDF en tandas de 6 páginas; extraer_rango subdivide si hace falta
                reader = pypdf.PdfReader(io.BytesIO(pr.content))
                npag = len(reader.pages)
                CHUNK = 6
                for ini in range(0, npag, CHUNK):
                    productos += extraer_rango(reader, ini, min(ini + CHUNK, npag), npag)

            # 4) armar las filas (ficha = todos los specs presentes)
            filas = []
            for p in productos:
                ficha = {k: p.get(k, "") for k in CAMPOS if k not in NO_FICHA and p.get(k)}
                filas.append({
                    "marca": marca,
                    "codigo": (p.get("codigo") or "").strip() or None,
                    "nombre": p.get("nombre") or None,
                    "familia": p.get("familia") or None,
                    "precio_usd": _a_usd(_parse_precio(p.get("precio")), receta),
                    "ficha": ficha,
                })

            # ── 5) registrar la lista cargada (historial) ────────────────────────
            archivo = (job.get("pdf_paths") or [None])[0]
            lr = hx.post(f"{SB}/rest/v1/competencia_listas",
                         headers={**H, "Prefer": "return=representation"},
                         json={"slug": slug, "marca": marca, "job_id": jid, "archivo": archivo,
                               "tipo": tipo, "autor": job.get("autor")})
            lista_id = (lr.json() or [{}])[0].get("id") if lr.status_code < 300 else None

            def guardar_hist(fs):
                """Precio de cada producto en esta lista → evolución en el tiempo."""
                if not lista_id:
                    return
                mon = ((receta or {}).get("lista_precios") or {}).get("moneda") or "USD"
                h = [{"lista_id": lista_id, "marca": marca, "codigo": f.get("codigo"),
                      "nombre": f.get("nombre"), "precio": f.get("precio_usd"), "moneda": mon}
                     for f in fs if f.get("precio_usd") is not None]
                for i in range(0, len(h), 200):
                    hx.post(f"{SB}/rest/v1/competencia_precios_hist",
                            headers={**H, "Prefer": "return=minimal"}, json=h[i:i + 200])

            if tipo == "actualizacion":
                resumen = _actualizar(hx, SB, H, marca, filas, receta)
            else:
                resumen = _carga_inicial(hx, SB, H, jid, filas)
            guardar_hist(filas)

            if lista_id:
                hx.patch(f"{SB}/rest/v1/competencia_listas", params={"id": f"eq.{lista_id}"},
                         headers={**H, "Prefer": "return=minimal"}, json={"resumen": resumen})
            set_estado("listo", resultado=resumen)
            print(f"OK job {jid}: {resumen}")

        except Exception as e:
            print(f"ERROR job {jid}: {e}")
            set_estado("error", error=str(e)[:400])
            raise


def _carga_inicial(hx, SB, H, jid, filas):
    """Alta: reemplaza todo lo de este job. Es el comportamiento de v1."""
    for f in filas:
        f["job_id"] = jid
    if filas:
        hx.delete(f"{SB}/rest/v1/competencia_extra", params={"job_id": f"eq.{jid}"},
                  headers={**H, "Prefer": "return=minimal"})
        for i in range(0, len(filas), 200):
            ins = hx.post(f"{SB}/rest/v1/competencia_extra",
                          headers={**H, "Prefer": "return=minimal"}, json=filas[i:i + 200])
            ins.raise_for_status()
    return {"productos_nuevos": len(filas),
            "con_ficha": sum(1 for f in filas if f["ficha"]),
            "con_precio": sum(1 for f in filas if f["precio_usd"] is not None),
            "con_imagen": 0}


def _actualizar(hx, SB, H, marca, filas, receta):
    """Actualización: cruza la lista nueva contra lo ya cargado de la marca.

    · precio distinto  → se pisa el precio (queda el histórico de lo anterior)
    · código nuevo     → entra como producto nuevo, SIN aprobar (aprobado = null),
                         para que alguien lo revise en 'Nuevas integraciones'
    · código que falta → se marca `baja_detectada` (no se borra: puede volver, y su
                         histórico de precios sigue siendo válido)
    """
    import datetime
    campo = ((receta or {}).get("actualizacion") or {}).get("clave_de_cruce") or "codigo"
    hoy = datetime.date.today().isoformat()

    # traer lo que ya está cargado de la marca (PostgREST corta en 1000 → paginar)
    viejos, desde = [], 0
    while True:
        r = hx.get(f"{SB}/rest/v1/competencia_extra",
                   params={"marca": f"eq.{marca}",
                           "select": "id,codigo,nombre,precio_usd,ficha,baja_detectada"},
                   headers={**H, "Range-Unit": "items", "Range": f"{desde}-{desde+999}"})
        lote = r.json() if r.status_code < 300 else []
        viejos += lote
        if len(lote) < 1000:
            break
        desde += 1000

    idx = {}
    for v in viejos:
        k = _clave(v, campo)
        if k and k not in idx:
            idx[k] = v

    nuevos, subio, bajo, igual = [], [], [], 0
    vistos = set()
    for f in filas:
        k = _clave(f, campo)
        if not k:
            nuevos.append(f)          # sin clave no se puede cruzar: entra como nuevo
            continue
        vistos.add(k)
        v = idx.get(k)
        if not v:
            nuevos.append(f)
            continue
        antes, ahora = v.get("precio_usd"), f.get("precio_usd")
        cambios = {}
        if ahora is not None and antes != ahora:
            cambios["precio_usd"] = ahora
            (subio if (antes is None or ahora > antes) else bajo).append(
                {"codigo": f.get("codigo"), "nombre": f.get("nombre"), "antes": antes, "ahora": ahora})
        else:
            igual += 1
        if f.get("ficha") and not v.get("ficha"):
            cambios["ficha"] = f["ficha"]     # completar ficha si antes no tenía
        if v.get("baja_detectada"):
            cambios["baja_detectada"] = None  # reapareció en la lista
        if cambios:
            hx.patch(f"{SB}/rest/v1/competencia_extra", params={"id": f"eq.{v['id']}"},
                     headers={**H, "Prefer": "return=minimal"}, json=cambios)

    # productos que ya no aparecen en la lista nueva
    faltantes = [v for k, v in idx.items() if k not in vistos and not v.get("baja_detectada")]
    for v in faltantes:
        hx.patch(f"{SB}/rest/v1/competencia_extra", params={"id": f"eq.{v['id']}"},
                 headers={**H, "Prefer": "return=minimal"}, json={"baja_detectada": hoy})

    # los nuevos entran sin aprobar: los revisa una persona en 'Nuevas integraciones'
    for f in nuevos:
        f["aprobado"] = None
    for i in range(0, len(nuevos), 200):
        hx.post(f"{SB}/rest/v1/competencia_extra",
                headers={**H, "Prefer": "return=minimal"}, json=nuevos[i:i + 200])

    return {"tipo": "actualizacion", "en_la_lista": len(filas),
            "productos_nuevos": len(nuevos),
            "precio_subio": len(subio), "precio_bajo": len(bajo), "sin_cambio": igual,
            "faltantes": len(faltantes),
            "muestra_subio": subio[:10], "muestra_bajo": bajo[:10],
            "muestra_faltantes": [{"codigo": v.get("codigo"), "nombre": v.get("nombre")}
                                  for v in faltantes[:10]]}
