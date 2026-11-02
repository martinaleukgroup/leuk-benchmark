#!/usr/bin/env python3
"""
subir_drive.py — Manda a n8n (Proceso 5) los PDF listos para que queden en Drive y el Hub
tenga el chip; guarda en fichas-historial.json qué pasó con cada uno (lo muestra el panel).

Pasos (ver el flujo "Hub de marketing · Fichas técnicas → Drive (Proceso 5)" en n8n):
  1. plan  → n8n lee Drive y responde a qué carpeta "Ficha Técnica" va cada PDF, qué reemplaza
             o si el producto no tiene carpeta.
  2. subir → un PDF por llamada (solo en modo real).
  3. fin   → n8n registra todo en "Log Subida Drive" y dispara el Proceso 2 (chips en Base).

Uso:
    python3 subir_drive.py --repo <raíz> --pdfs <carpeta con los PDF> --historial fichas-historial.json
                           --modo prueba|real --fecha 2026-11-02 [--corrida 123]

Necesita las variables N8N_FICHAS_URL y N8N_FICHAS_TOKEN (secretos del repo). Sin ellas no hace nada.
"""
import argparse
import json
import os
import re
import sys
import urllib.request
import uuid
from pathlib import Path

TIMEOUT_PLAN = 300
TIMEOUT_SUBIR = 180


def safe(name):
    return (re.sub(r"[^\w\- .]", "_", name).strip() or "ficha")[:80]


def post_json(url, token, body, timeout):
    req = urllib.request.Request(url, data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                                 headers={"Content-Type": "application/json", "x-leuk-token": token}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8") or "{}")


def post_pdf(url, token, campos, ruta_pdf, timeout):
    """multipart/form-data con los campos de texto y el PDF en el campo 'pdf'."""
    limite = "----leuk" + uuid.uuid4().hex
    partes = []
    for k, v in campos.items():
        partes.append(f'--{limite}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode("utf-8"))
    nombre = Path(ruta_pdf).name
    partes.append((f'--{limite}\r\nContent-Disposition: form-data; name="pdf"; filename="{nombre}"\r\n'
                   'Content-Type: application/pdf\r\n\r\n').encode("utf-8"))
    partes.append(Path(ruta_pdf).read_bytes())
    partes.append(f"\r\n--{limite}--\r\n".encode("utf-8"))
    req = urllib.request.Request(url, data=b"".join(partes), method="POST",
                                 headers={"Content-Type": f"multipart/form-data; boundary={limite}", "x-leuk-token": token})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8") or "{}")


def cargar_fichas(repo):
    txt = (Path(repo) / "fichas-data.js").read_text(encoding="utf-8")
    m = re.search(r"window\.FICHAS\s*=\s*(\[.*\])\s*;?\s*$", txt, re.S)
    grupos = {}
    for f in json.loads(m.group(1)):
        ag = f.get("agrupacion") or f.get("titulo")
        if ag:
            grupos.setdefault(ag, []).append(f)
    return grupos


def skus_de(lista):
    out = []
    for f in lista:
        for s in (f.get("skus") or [f.get("sku")]):
            if s and str(s) not in out:
                out.append(str(s))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--pdfs", required=True)
    ap.add_argument("--historial", required=True)
    ap.add_argument("--modo", default="prueba")
    ap.add_argument("--fecha", required=True)
    ap.add_argument("--corrida", default="")
    a = ap.parse_args()

    url, token = os.environ.get("N8N_FICHAS_URL", ""), os.environ.get("N8N_FICHAS_TOKEN", "")
    if not url or not token:
        print("· Drive: faltan los secretos N8N_FICHAS_URL / N8N_FICHAS_TOKEN; no se sube nada.")
        return

    grupos = cargar_fichas(a.repo)
    por_archivo = {f"Ficha Técnica - {safe(ag)}.pdf": ag for ag in grupos}
    pdfs = sorted(Path(a.pdfs).glob("*.pdf")) if Path(a.pdfs).exists() else []
    pedidas = []
    for p in pdfs:
        ag = por_archivo.get(p.name)
        if not ag:
            print(f"  ⚠ {p.name}: no encuentro su ficha; no se sube")
            continue
        pedidas.append({"ag": ag, "archivo": f"Ficha Técnica - {ag}.pdf", "skus": skus_de(grupos[ag]), "_ruta": str(p)})
    if not pedidas:
        print("· Drive: no hay PDF listos para subir.")
        return

    print(f"· Drive: pido el plan para {len(pedidas)} ficha(s) (modo {a.modo})…", flush=True)
    try:
        plan = post_json(url, token, {"accion": "plan", "modo": a.modo, "corrida": a.corrida,
                                      "fichas": [{k: v for k, v in x.items() if k != "_ruta"} for x in pedidas],
                                      "todas": sorted(grupos)}, TIMEOUT_PLAN)
    except Exception as e:
        print(f"⛔ Drive: n8n no respondió al plan ({e}). No se sube nada.")
        sys.exit(4)
    if not plan.get("ok"):
        print(f"⛔ Drive: n8n rechazó el plan: {plan.get('error') or plan}")
        sys.exit(4)
    print(f"  {plan.get('estado')} · {plan.get('resumen')}")

    real = a.modo == "real" and bool(plan.get("escribir"))
    ruta_de = {x["ag"]: x["_ruta"] for x in pedidas}
    skus_por = {x["ag"]: x["skus"] for x in pedidas}
    resultados = []
    for f in plan.get("fichas", []):
        ag = f.get("ag")
        r = {"ag": ag, "archivo": f.get("archivo"), "skus": skus_por.get(ag, []), "producto": f.get("producto", ""),
             "destino": f.get("destinoRuta", ""), "estado": f.get("estado"), "aviso": f.get("aviso", ""),
             "reemplazados": [e.get("nombre") for e in (f.get("reemplazar") or [])]}
        if f.get("estado") == "subir":
            if not real:
                r["estado"] = "simulado"
                print(f"  ◌ {ag}: iría a {r['destino']}" + (f" (reemplaza {', '.join(r['reemplazados'])})" if r["reemplazados"] else ""))
            else:
                try:
                    res = post_pdf(url, token, {"accion": "subir", "modo": a.modo, "ag": ag, "nombre": f.get("archivo"),
                                                "destino": f.get("destino", ""), "fechaId": plan.get("fechaId", ""),
                                                "reemplazar": json.dumps(f.get("reemplazar") or [], ensure_ascii=False)},
                                   ruta_de[ag], TIMEOUT_SUBIR)
                except Exception as e:
                    res = {"ok": False, "estado": "error", "error": f"n8n no respondió ({e})"}
                r["estado"] = res.get("estado", "error")
                r["url"] = res.get("url", "")
                if not res.get("ok"):
                    r["error"] = res.get("error", "")
                fallos = [m["nombre"] for m in (res.get("movidos") or []) if not m.get("ok")]
                if fallos:
                    r["aviso"] = (r["aviso"] + " " if r["aviso"] else "") + "No se pudo mover a Reemplazados: " + ", ".join(fallos) + "."
                print(f"  {'✓' if r['estado'] == 'subida' else '✗'} {ag}: {r['estado']} {r.get('url') or r.get('error', '')}")
        else:
            print(f"  ⚠ {ag}: {f.get('estado')} — {f.get('aviso', '')}")
        resultados.append(r)

    try:
        fin = post_json(url, token, {"accion": "fin", "modo": a.modo, "corrida": a.corrida, "resultados": resultados}, 120)
        print(f"  {fin.get('resumen', '')}" + (" · Proceso 2 disparado" if fin.get("proceso2") else ""))
    except Exception as e:
        print(f"  ⚠ Drive: no pude cerrar la corrida en n8n ({e}); el log puede quedar incompleto.")

    # historial: solo se registra lo que pasó de verdad (en prueba no se toca)
    if a.modo != "real":
        return
    h = json.loads(Path(a.historial).read_text(encoding="utf-8")) if Path(a.historial).exists() else {"fichas": {}}
    fichas = h.setdefault("fichas", {})
    for r in resultados:
        if r["estado"] == "simulado":
            continue
        d = {"estado": r["estado"], "fecha": a.fecha}
        for k in ("url", "aviso", "error", "destino"):
            if r.get(k):
                d[k] = r[k]
        fichas.setdefault(r["ag"], {})["drive"] = d
    Path(a.historial).write_text(json.dumps(h, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    n = {e: sum(1 for r in resultados if r["estado"] == e) for e in ("subida", "sin_carpeta", "ambigua", "error")}
    print(f"→ Drive: {n['subida']} subidas · {n['sin_carpeta']} sin carpeta · {n['ambigua']} ambiguas · {n['error']} con error")


if __name__ == "__main__":
    main()
