/* ============================================================================
   PAUTA EN INSTAGRAM — página "pauta" (grupo Contenidos)
   ----------------------------------------------------------------------------
   Pedido 2026-11-05: una sección de pauta de Instagram vinculada con las redes y
   con las ventas, para ver ROAS y las métricas conseguidas.

   · Se sube el informe de anuncios de Meta (Ads Manager → Exportar → Excel), uno
     por marca (Leuk / Laftdren). Se reconoce cada columna por su nombre, así que
     sirven los dos formatos que exporta Meta. Volver a subir el mismo informe
     actualiza las métricas y respeta lo cargado a mano (RPC pauta_importar).
   · El informe no trae fechas por anuncio: la fecha del post sale del código del
     enlace (instagram.com/p/<código>); "Arrancó" = esa fecha o el inicio del
     informe si el post es anterior. Se puede corregir a mano.
   · Ventas: cada anuncio de PRODUCTO se mide por una palabra de la descripción del
     artículo (igual que Campañas de producto en Impacto de acciones): compras del
     producto N días después vs. N días antes, contra cómo se movió la marca
     (Leuk: ventas totales; Laftdren: todo lo que dice "Laftdren"). Compras extra =
     después − esperado; ROAS = compras extra ÷ inversión (US$ con el TC del mes).
     Sin ROI: la usuaria no lo quiere (ver eventos-clientes).
   · Redes: cada anuncio lleva al post de Instagram y, si existe, a su pieza en
     Contenidos (misma marca, ±1 día).
   SQL: supabase/sql/2026-11-05-pauta-instagram.sql. Lo ve quien ve Impacto.
   ========================================================================== */
(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const SES = () => window.LEUK_SESION || {};
  const url = p => `${SES().sbUrl}/rest/v1/${p}`;
  const head = extra => Object.assign({ "Content-Type": "application/json" }, SES().head ? SES().head() : {}, extra || {});
  const caja = () => $("#pauta");

  /* ---- Utilidades ---- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pad = n => String(n).padStart(2, "0");
  const isoDe = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const aFecha = s => { const p = String(s || "").split("-"); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); };
  const sumarDias = (s, n) => { const d = aFecha(s); d.setDate(d.getDate() + n); return isoDe(d); };
  const difDias = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 864e5);
  const sinTildes = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const fechaLarga = s => { if (!s) return "—"; const d = aFecha(s); return `${d.getDate()} ${MES_CORTO[d.getMonth()]} ${d.getFullYear()}`; };
  const fechaCorta = s => { if (!s) return "—"; const d = aFecha(s); return `${d.getDate()} ${MES_CORTO[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`; };
  const mesNombre = m => `${MES_CORTO[+m.slice(5, 7) - 1]} ${m.slice(2, 4)}`;
  const num = v => (v === "" || v == null || isNaN(Number(v))) ? null : Number(v);
  const ent = v => v == null ? "—" : Math.round(v).toLocaleString("es-AR");
  const ars = v => v == null ? "—" : `$ ${Math.round(v).toLocaleString("es-AR")}`;
  const usd = v => v == null ? "—" : `US$ ${Math.round(v).toLocaleString("es-AR")}`;
  const usdCorto = v => { const a = Math.abs(v), s = v < 0 ? "−" : "";
    return a >= 1e6 ? `${s}${(a / 1e6).toFixed(1).replace(".", ",")} M` : a >= 1e3 ? `${s}${Math.round(a / 1e3)} k` : `${s}${Math.round(a)}`; };
  const arsCorto = v => `$ ${usdCorto(v)}`;
  const pct = x => x == null || !isFinite(x) ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(Math.round(x * 100))} %`;
  const pctN = (x, d) => x == null || !isFinite(x) ? "—" : `${(x * 100).toFixed(d || 0).replace(".", ",")} %`;
  const roas = x => x == null || !isFinite(x) ? "—" : `${x.toFixed(1).replace(".", ",")}×`;
  const signo = v => v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${usd(Math.abs(v))}`;
  const plural = (n, s, p) => `${n} ${n === 1 ? s : (p || s + "s")}`;
  const corta = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;
  const suma = (arr, f) => arr.reduce((s, x) => s + (num(f(x)) || 0), 0);
  const div = (a, b) => b ? a / b : null;

  /* ---- Vocabulario ---- */
  const MARCAS = { leuk: "Leuk", laftdren: "Laftdren" };
  const CANAL_IG = { leuk: "instagram", laftdren: "instagram_laftdren" };   // canales de Contenidos
  // Lo que Meta llama "Indicador de resultado" → nombre del objetivo y de su resultado.
  const OBJ = {
    "actions:post_engagement": { t: "Interacción", r: "interacción", rs: "interacciones" },
    "profile_visit_view": { t: "Visitas al perfil", r: "visita al perfil", rs: "visitas al perfil" },
    "actions:omni_landing_page_view": { t: "Visitas al sitio web", r: "visita al sitio", rs: "visitas al sitio" },
    "actions:onsite_conversion.messaging_conversation_started_7d": { t: "Mensajes (WhatsApp)", r: "conversación", rs: "conversaciones" },
  };
  const objDe = a => OBJ[a.indicador] || (a.indicador ? { t: a.indicador, r: "resultado", rs: "resultados" } : { t: "Sin entrega", r: "resultado", rs: "resultados" });
  const TIPOS = { producto: "Producto", proyecto: "Proyecto / obra", marca: "Marca", evento: "Luz en Acción / evento" };
  const VENTANAS = [30, 60, 90];
  const COL = { main: "var(--olive)", soft: "var(--olive-soft)", gris: "#B8B8B8", neg: "#E16F64" };

  /* ---- Estado ---- */
  let ADS = [];
  let CARGADO = false, ERROR = "";
  let RANGO = null, RANGO_IT = null;   // ventas totales / por artículo cargadas
  let MESES = null;                    // [{mes, total_usd, pal_usd (Laftdren), tc}]
  let PIEZAS = [];                     // piezas de Instagram en Contenidos (para vincular)
  const MED = {};                      // clave de medición -> resultado
  const REF = {};                      // caché de la referencia de marca
  let TAB = "resumen";                 // resumen | anuncios | productos
  let MARCA = "";                      // "" = las dos
  let PERIODO = "";                    // "" = todo · "2025" = oct 25 → sep 26
  let OBJ_F = "";                      // filtro de objetivo (anuncios)
  let BUSCA = "";
  let VENTANA = 30;
  let ABIERTO = null;                  // id del anuncio desplegado
  let ORDEN = "fecha";                 // anuncios: fecha | inversion | roas
  let MIDIENDO = false;
  let NOTA = "", NOTA_ERR = false, NOTA_T = null;

  function nota(t, err) {
    NOTA = t; NOTA_ERR = !!err; clearTimeout(NOTA_T);
    NOTA_T = setTimeout(() => { NOTA = ""; pintarNota(); }, err ? 9000 : 5000);
    pintarNota();
  }
  function pintarNota() { const c = caja(); if (c) c.querySelectorAll(".pa-nota").forEach(n => { n.textContent = NOTA; n.classList.toggle("err", NOTA_ERR); }); }

  /* ---- Datos ---- */
  async function todo(path) {
    const out = [];
    for (let off = 0; ; off += 1000) {
      const r = await fetch(url(`${path}${path.includes("?") ? "&" : "?"}limit=1000&offset=${off}`), { headers: head() });
      if (!r.ok) { const e = new Error(String(r.status)); e.status = r.status; throw e; }
      const d = await r.json(); out.push(...d);
      if (d.length < 1000) return out;
    }
  }
  async function rpc(fn, body) {
    const r = await fetch(url(`rpc/${fn}`), { method: "POST", headers: head(), body: JSON.stringify(body || {}) });
    if (!r.ok) { const t = await r.text().catch(() => ""); const e = new Error(t || String(r.status)); e.status = r.status; throw e; }
    return r.json();
  }
  async function traer() {
    try {
      ADS = await todo("pauta_anuncios?select=*&order=fecha_post.desc.nullslast,nombre");
      const [rg, rit] = await Promise.all([rpc("ventas_rango").catch(() => []), rpc("ventas_items_rango").catch(() => [])]);
      RANGO = rg && rg[0] && rg[0].hasta ? rg[0] : null;
      RANGO_IT = rit && rit[0] && rit[0].hasta ? rit[0] : null;
      ERROR = ""; CARGADO = true;
      traerMeses(); traerPiezas();
    } catch (e) { ERROR = e.status === 404 ? "sql" : "red"; CARGADO = false; }
  }
  // Ventas por mes (total + Laftdren + tipo de cambio) desde un año antes del primer anuncio.
  async function traerMeses() {
    const fs = ADS.map(inicioDe).filter(Boolean).sort();
    if (!fs.length || !RANGO) { MESES = []; return; }
    const desde = `${+fs[0].slice(0, 4) - 1}-${fs[0].slice(5, 7)}-01`;
    try { MESES = (await rpc("pauta_ventas_mes", { p_desde: desde, p_hasta: RANGO.hasta, p_palabra: "Laftdren" }))
      .map(m => ({ mes: m.mes, total: Number(m.total_usd) || 0, laft: Number(m.pal_usd) || 0, tc: num(m.tc) })); }
    catch (e) { MESES = []; }
    pintar(); medirTodo();
  }
  async function traerPiezas() {
    const fs = ADS.map(a => a.fecha_post).filter(Boolean).sort();
    if (!fs.length) return;
    try {
      PIEZAS = await todo(`contenidos?canal=in.(instagram,instagram_laftdren)&fecha=gte.${sumarDias(fs[0], -2)}&select=id,canal,mes,fecha,criterio,tipo&order=fecha.asc`);
      if (CARGADO) pintar();
    } catch (e) { PIEZAS = []; }
  }

  /* ---- Fecha del post desde el código del enlace ----
     El id de un post de Instagram lleva adentro el momento de publicación:
     código (base64 propia) → id; los primeros bits = ms desde 2011-08-24. */
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  function codigoDe(enlace) { const m = String(enlace || "").match(/instagram\.com\/(?:[^/]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/); return m ? m[1] : ""; }
  function fechaDeCodigo(c) {
    if (!c || c.length > 14 || typeof BigInt !== "function") return null;
    let n = 0n;
    for (const ch of c) { const i = B64.indexOf(ch); if (i < 0) return null; n = n * 64n + BigInt(i); }
    const ms = Number(n >> 23n) + 1314220021721;
    if (!(ms > Date.UTC(2012, 0, 1) && ms < Date.now() + 864e5 * 400)) return null;
    return isoDe(new Date(ms));
  }
  // Desde cuándo se mide: lo cargado a mano; si no, la fecha del post (o el inicio del informe si el post es anterior).
  const inicioDe = a => a.inicio || (a.fecha_post && a.desde && a.fecha_post < a.desde ? a.desde : a.fecha_post) || a.desde || null;

  /* ---- Qué muestra cada anuncio (para proponer tipo y producto al importar) ---- */
  function adivinar(nombre, conjunto, marca) {
    const n = sinTildes(nombre), s = `${n} ${sinTildes(conjunto)}`;
    if (/luz en accion|luzenaccion/.test(n)) return { tipo: "evento", palabra: "" };
    if (marca === "laftdren") {
      const m = String(nombre).match(/\b(\d{3})\s?([a-dA-D])\b/);
      return m ? { tipo: "producto", palabra: `${m[1]}${m[2].toUpperCase()}` } : { tipo: "marca", palabra: "" };
    }
    if (/proyecto/.test(s)) return { tipo: "proyecto", palabra: "" };
    if (/\bmarca\b/.test(n)) return { tipo: "marca", palabra: "" };
    const corte = String(nombre).split(/[:_]/);
    if (corte.length < 2) return { tipo: "marca", palabra: "" };
    let p = corte[corte.length - 1].replace(/\b(carrusel|reel|colecci[oó]n|l[ií]nea|producto|ok)\b/gi, " ").replace(/\b\d+\b/g, " ").replace(/\s+/g, " ").trim();
    if (!p) return { tipo: "producto", palabra: "" };
    if (p === p.toUpperCase() && p.length > 3) p = p[0] + p.slice(1).toLowerCase();
    return { tipo: "producto", palabra: p };
  }

  /* ---- Inversión en US$ (tipo de cambio promedio del mes, de las ventas) ---- */
  function tcMes(mes) {
    if (!MESES || !MESES.length) return null;
    const conTc = MESES.filter(m => m.tc);
    if (!conTc.length) return null;
    const exacto = conTc.find(m => m.mes === mes);
    if (exacto) return exacto.tc;
    return conTc.reduce((b, m) => Math.abs(difDias(`${m.mes}-15`, `${mes}-15`)) < Math.abs(difDias(`${b.mes}-15`, `${mes}-15`)) ? m : b).tc;
  }
  const invUsd = a => { const i = num(a.inversion_ars), f = inicioDe(a), tc = f ? tcMes(f.slice(0, 7)) : null; return i == null ? null : tc ? i / tc : null; };

  /* ---- Filtros ---- */
  const periodoDe = f => { f = String(f || ""); if (!/^\d{4}-\d{2}/.test(f)) return ""; const y = +f.slice(0, 4); return String(+f.slice(5, 7) >= 10 ? y : y - 1); };
  const periodoNombre = p => `Oct ${p} – Sep ${+p + 1}`;
  const periodos = () => [...new Set(ADS.map(a => periodoDe(inicioDe(a))).filter(Boolean))].sort().reverse();
  const enFiltro = a => (!MARCA || a.marca === MARCA) && (!PERIODO || periodoDe(inicioDe(a)) === PERIODO);
  const lista = () => ADS.filter(enFiltro);

  /* ---- Medición contra ventas ---- */
  const palabraDe = a => (a.palabra || "").trim();
  const claveMed = a => `${a.marca}|${palabraDe(a).toLowerCase()}|${inicioDe(a)}|${VENTANA}|${RANGO_IT && RANGO_IT.hasta}`;
  // Anuncios que comparten producto y fecha se miden juntos (la inversión se suma).
  const grupoDe = a => ADS.filter(x => palabraDe(x) && claveMed(x) === claveMed(a));
  function estadoMed(a) {
    if (!palabraDe(a)) return a.tipo === "producto" ? "sinpalabra" : "nomide";
    if (!RANGO_IT) return "sinventas";
    const f = inicioDe(a); if (!f) return "sinfecha";
    if (f > RANGO_IT.hasta) return "esperando";
    return "medible";
  }
  async function medir(a) {
    const key = claveMed(a); if (MED[key]) return MED[key];
    const f0 = inicioDe(a), dias = Math.min(VENTANA, difDias(f0, RANGO_IT.hasta) + 1);
    const antes = [sumarDias(f0, -dias), sumarDias(f0, -1)], despues = [f0, sumarDias(f0, dias - 1)];
    const q = (r, p) => rpc("ventas_palabra", { p_desde: r[0], p_hasta: r[1], p_palabra: p, p_cuits: null })
      .then(x => ({ prod: Number(x[0] && x[0].fam_usd) || 0, total: Number(x[0] && x[0].total_usd) || 0, clientes: (x[0] && x[0].clientes) || 0 }));
    const ref = async r => {     // cómo se movió la marca en las mismas fechas
      const k = `${a.marca}|${r.join("|")}`;
      if (!(k in REF)) REF[k] = a.marca === "laftdren" ? q(r, "Laftdren").then(x => x.prod) : q(r, "").then(x => x.total);
      return REF[k];
    };
    try {
      const [pa, pd, ra, rd] = await Promise.all([q(antes, palabraDe(a)), q(despues, palabraDe(a)), ref(antes), ref(despues)]);
      const crecRef = ra > 0 ? (rd - ra) / ra : null;
      const m = { dias, antes, despues, pa, pd, ra, rd, crecRef, crecProd: pa.prod > 0 ? (pd.prod - pa.prod) / pa.prod : null,
                  esperado: crecRef != null ? pa.prod * (1 + crecRef) : pa.prod };
      m.extra = pd.prod - m.esperado;
      MED[key] = m;
    } catch (e) { MED[key] = { error: true }; }
    return MED[key];
  }
  // Resultado del anuncio (o de su grupo) con la inversión en US$.
  function resultado(a) {
    const e = estadoMed(a); if (e !== "medible") return { estado: e };
    const m = MED[claveMed(a)]; if (!m) return { estado: "calculando" };
    if (m.error) return { estado: "error" };
    const g = grupoDe(a), inv = g.reduce((s, x) => { const u = invUsd(x); return u == null || s == null ? null : s + u; }, 0);
    const r = inv ? Math.max(0, m.extra) / inv : null;
    const ver = !m.pa.prod && !m.pd.prod ? { c: "", t: "Sin ventas de ese producto" }
              : m.extra > 0 && (r == null || r >= 1) ? { c: "ok", t: "Movió las ventas" }
              : m.extra > 0 ? { c: "warn", t: "Movió, sin cubrir la inversión" } : { c: "no", t: "Sin efecto en ventas" };
    return { estado: "medido", m, inv, roas: r, roasTotal: inv ? m.pd.prod / inv : null, ver, grupo: g, provisorio: m.dias < VENTANA };
  }
  async function medirTodo() {
    if (MIDIENDO || !RANGO_IT || !MESES) return;
    MIDIENDO = true;
    const pend = [], vistas = new Set();
    ADS.forEach(a => { if (estadoMed(a) !== "medible") return; const k = claveMed(a); if (MED[k] || vistas.has(k)) return; vistas.add(k); pend.push(a); });
    for (let i = 0; i < pend.length; i += 4) {
      await Promise.all(pend.slice(i, i + 4).map(medir));
      pintar();
    }
    MIDIENDO = false;
    if (ADS.some(a => estadoMed(a) === "medible" && !MED[claveMed(a)])) medirTodo();
  }

  /* ---- Pieza de Contenidos que corresponde al post (misma marca, ±1 día) ---- */
  function piezaDe(a) {
    if (!a.fecha_post || !PIEZAS.length) return null;
    const c = CANAL_IG[a.marca];
    const cand = PIEZAS.filter(p => p.canal === c && p.fecha && Math.abs(difDias(p.fecha, a.fecha_post)) <= 1);
    if (!cand.length) return null;
    cand.sort((x, y) => (Math.abs(difDias(x.fecha, a.fecha_post)) - Math.abs(difDias(y.fecha, a.fecha_post))) || ((x.tipo === "historia") - (y.tipo === "historia")));
    return cand[0];
  }

  /* ======================= GRÁFICOS (mismas clases que Impacto) ======================= */
  const leyenda = items => `<div class="ec-ley">${items.map(([t, c, linea]) => `<span><i style="background:${c}${linea ? ";height:3px;vertical-align:3px" : ""}"></i>${esc(t)}</span>`).join("")}</div>`;
  function barrasH(items, fmt) {
    if (!items.length) return `<div class="ec-graf-vacio">Sin datos</div>`;
    const max = Math.max(1, ...items.map(x => x.v));
    return `<div class="pa-barras">${items.map(x => `<div class="pa-barra"><span>${esc(x.l)}</span>
      <div><i style="width:${(x.v / max * 100).toFixed(1)}%"></i></div><b>${esc(fmt(x.v))}</b>${x.sub ? `<small>${x.sub}</small>` : ""}</div>`).join("")}</div>`;
  }
  // Columnas (inversión del mes) + línea (ventas del mes), cada una con su eje.
  function columnasLinea(meses, cols, lin, fmtC, fmtL) {
    if (!meses.length) return `<div class="ec-graf-vacio">Sin datos</div>`;
    const W = 560, H = 220, L = 52, R = 52, B = 30, T = 12;
    const maxC = Math.max(1, ...cols.filter(v => v != null)), maxL = Math.max(1, ...lin.filter(v => v != null));
    const gw = (W - L - R) / meses.length, bw = Math.min(26, gw - 8);
    const yC = v => T + (H - T - B) * (1 - v / maxC), yL = v => T + (H - T - B) * (1 - v / maxL);
    const xm = i => L + i * gw + gw / 2;
    const ticks = [0, 1, 2, 3];
    let d = "", pen = false;
    lin.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${xm(i).toFixed(1)},${yL(v).toFixed(1)} `; pen = true; });
    return `<svg viewBox="0 0 ${W} ${H}" class="ec-svg" role="img">
      ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${yC(maxC * t / 3)}" y2="${yC(maxC * t / 3)}" class="ec-gl"/>
        <text x="${L - 6}" y="${yC(maxC * t / 3) + 4}" text-anchor="end" class="ec-t ec-eje">${esc(fmtC(maxC * t / 3))}</text>
        <text x="${W - R + 6}" y="${yL(maxL * t / 3) + 4}" class="ec-t ec-eje">${esc(fmtL(maxL * t / 3))}</text>`).join("")}
      ${cols.map((v, i) => v ? `<rect x="${xm(i) - bw / 2}" y="${yC(v)}" width="${bw}" height="${Math.max(1, H - B - yC(v))}" rx="3" style="fill:${COL.soft}"><title>${esc(mesNombre(meses[i]))}: ${esc(fmtC(v))} invertidos</title></rect>` : "").join("")}
      <path d="${d}" fill="none" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" style="stroke:var(--ink)"/>
      ${lin.map((v, i) => v == null ? "" : `<circle cx="${xm(i)}" cy="${yL(v)}" r="3" style="fill:var(--ink)"><title>${esc(mesNombre(meses[i]))}: ${esc(fmtL(v))} vendidos</title></circle>`).join("")}
      ${meses.map((m, i) => `<text x="${xm(i)}" y="${H - B + 16}" text-anchor="middle" class="ec-t ec-eje">${esc(mesNombre(m))}</text>`).join("")}
    </svg>`;
  }
  const tarjeta = (tit, sub, cuerpo, cls) => `<section class="ec-card ${cls || ""}"><h3>${esc(tit)}</h3>${sub ? `<p class="ec-card-sub">${sub}</p>` : ""}${cuerpo}</section>`;
  const kpi = (v, l, sub, cls) => `<div class="mh-kpi"><b class="${cls || ""}">${v}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;

  /* ======================= PINTAR ======================= */
  const lineaVentas = () => RANGO_IT ? `Ventas por artículo hasta el <b>${fechaLarga(RANGO_IT.hasta)}</b>`
    : RANGO ? `<b class="ec-falta">Faltan las ventas por artículo</b>` : `<b class="ec-falta">Sin ventas cargadas</b>`;
  const ventanaChips = () => `<div class="ec-ventana" role="group" aria-label="Ventana de medición">
    <span>Ventas a</span>${VENTANAS.map(n => `<button class="${VENTANA === n ? "on" : ""}" data-pa="ventana" data-n="${n}">${n} días</button>`).join("")}</div>`;
  const pestanas = () => `<div class="ec-tabs pa-tabs" role="tablist">${[["resumen", "Resumen"], ["anuncios", "Anuncios"], ["productos", "Ventas por producto"]]
    .map(([k, t]) => `<button role="tab" class="${TAB === k ? "on" : ""}" data-pa="tab" data-tab="${k}">${t}</button>`).join("")}</div>`;
  const filtros = () => `<div class="mh-bar pa-bar">
      <div class="ec-tabs pa-marcas" role="group" aria-label="Marca">${[["", "Las dos"], ["leuk", "Leuk"], ["laftdren", "Laftdren"]]
        .map(([k, t]) => `<button class="${MARCA === k ? "on" : ""}" data-pa="marca" data-m="${k}">${t}</button>`).join("")}</div>
      <select class="ac-sel" data-pa-f="periodo" aria-label="Período (octubre a septiembre)"><option value="">Todo</option>${periodos().map(p => `<option value="${p}" ${PERIODO === p ? "selected" : ""}>${periodoNombre(p)}</option>`).join("")}</select>
      ${TAB !== "resumen" ? ventanaChips() : ""}
      <span class="pa-nota ec-nota" role="status"></span></div>`;

  function pintar() {
    const c = caja(); if (!c) return;
    if (!CARGADO && !ERROR) { c.innerHTML = `<div class="empty">Cargando…</div>`; return; }
    if (ERROR === "sql") { c.innerHTML = `<div class="res-intro">Falta preparar la base: hay que correr <b>supabase/sql/2026-11-05-pauta-instagram.sql</b> en Supabase → SQL Editor.</div>`; return; }
    if (ERROR) { c.innerHTML = `<div class="empty">No se pudo traer la pauta. Revisá la conexión.<br><button class="btn-ghost" data-pa="reintentar">Reintentar</button></div>`; return; }
    const sc = window.scrollY;
    c.innerHTML = `
      <header class="mh">
        <div class="mh-top">
          <div class="mh-tit"><h1>Pauta en Instagram</h1><p class="mh-sub"><span>Lo que invertimos en Meta, qué consiguió y si movió las ventas</span><span>${lineaVentas()}</span></p></div>
          <div class="mh-acc">
            <details class="mh-mas"><summary class="btn-ghost">⋯ Más</summary><div class="mh-mas-menu">
              <button data-pa="excel">⬇ Descargar Excel</button>
              <button data-pa="como">¿Cómo subo el informe de Meta?</button>
            </div></details>
            <button class="btn-primary" data-pa="subir">⬆ Subir informe de Meta</button>
          </div>
        </div>
        <input type="file" class="pa-file" accept=".xlsx,.xls,.csv" multiple hidden>
        ${pestanas()}
      </header>
      ${filtros()}
      <div class="pa-cuerpo"></div>`;
    const w = c.querySelector(".pa-cuerpo");
    if (!ADS.length) w.innerHTML = vacioHTML();
    else if (TAB === "anuncios") w.innerHTML = anunciosHTML();
    else if (TAB === "productos") w.innerHTML = productosHTML();
    else w.innerHTML = resumenHTML();
    pintarNota();
    window.scrollTo({ top: sc });
  }
  const vacioHTML = () => `<section class="ec-card pa-vacio"><h3>Todavía no hay pauta cargada</h3>
    <p>Subí los informes de anuncios de Meta (Excel): el de Leuk y el de Laftdren juntos.</p>${comoHTML()}
    <p><button class="btn-primary" data-pa="subir">⬆ Subir informe de Meta</button></p></section>`;
  const comoHTML = () => `<ol class="pa-como">
      <li>Bajá de <b>Ads Manager</b> el informe de anuncios de cada marca, como siempre: un Excel para <b>Leuk</b> y otro para <b>Laftdren</b>, con la columna <b>ENLACE AL ANUNCIO</b> (de ahí salen la fecha de cada post y su pieza).</li>
      <li>Dejá en el nombre del archivo la marca y el período, como ahora: <b>Leuk-Anuncios-dic25-oct26…</b> (si el Excel trae «Inicio/Fin del informe», se usan esas fechas).</li>
      <li>Subí los dos juntos. Como el informe es acumulado, el nuevo <b>reemplaza</b> al anterior: no se duplican anuncios y se conserva el tipo y el producto que elegiste.</li></ol>`;

  /* ---------- RESUMEN ---------- */
  function resumenHTML() {
    const L = lista();
    if (!L.length) return `<div class="empty">No hay anuncios con estos filtros.</div>`;
    const inv = suma(L, a => a.inversion_ars), invU = L.reduce((s, a) => { const u = invUsd(a); return s + (u || 0); }, 0);
    const alc = suma(L, a => a.alcance), imp = suma(L, a => a.impresiones);
    const seg = suma(L, a => a.seguimientos), vis = suma(L, a => a.visitas_perfil), web = suma(L, a => a.visitas_web), conv = suma(L, a => a.conversaciones);
    const inter = suma(L, a => a.interacciones), clics = suma(L, a => a.clics);
    // ROAS de lo que se puede medir (anuncios de producto con ventas)
    const res = L.map(a => ({ a, r: resultado(a) })).filter(x => x.r.estado === "medido");
    const grupos = new Map(); res.forEach(x => grupos.set(claveMed(x.a), x.r));
    const G = [...grupos.values()], extra = Math.max(0, G.reduce((s, r) => s + r.m.extra, 0)), invMed = G.reduce((s, r) => s + (r.inv || 0), 0);
    const nProd = L.filter(a => a.tipo === "producto").length;
    const pendientes = L.filter(a => estadoMed(a) === "medible" && !MED[claveMed(a)]).length;
    const kpis = `<div class="mh-kpis">
      ${kpi(arsCorto(inv), "invertidos", invU ? `≈ ${usd(invU)} · ${plural(L.length, "anuncio")}` : plural(L.length, "anuncio"))}
      ${kpi(usdCorto(alc), "personas alcanzadas", `${ent(imp)} impresiones · CPM ${ars(div(inv, imp) * 1000)}`)}
      ${kpi(ent(vis), "visitas al perfil", `${ars(div(inv, vis))} cada una · ${ent(seg)} seguidores nuevos`)}
      ${kpi(ent(web || clics), web ? "visitas al sitio" : "clics al sitio", `${ent(conv)} conversaciones de WhatsApp`)}
      ${kpi(ent(inter), "interacciones", `${ars(div(inv, inter))} cada una`)}
      ${kpi(invMed ? roas(extra / invMed) : "—", "ROAS de los anuncios de producto",
            G.length ? `${usd(extra)} en compras extra netas ÷ ${usd(invMed)}${pendientes ? " · calculando…" : ""}` : RANGO_IT ? (nProd ? (pendientes ? "calculando…" : "elegí el producto en Anuncios") : "sin anuncios de producto") : "subí las ventas en Impacto de acciones",
            invMed ? (extra / invMed >= 1 ? "ok" : "no") : "")}
    </div>`;

    // Por objetivo: qué se pagó y cuánto costó cada resultado.
    const objs = {}; L.filter(a => num(a.inversion_ars) || num(a.resultados)).forEach(a => { const k = objDe(a).t; (objs[k] = objs[k] || []).push(a); });
    const filasObj = Object.entries(objs).sort((x, y) => suma(y[1], a => a.inversion_ars) - suma(x[1], a => a.inversion_ars)).map(([t, as]) => {
      const i = suma(as, a => a.inversion_ars), r = suma(as, a => a.resultados), o = objDe(as[0]);
      return `<tr><td><b>${esc(t)}</b><small>${plural(as.length, "anuncio")}</small></td><td class="n">${ars(i)}<small> ${pctN(div(i, inv))}</small></td>
        <td class="n">${ent(r)} <small>${esc(o.rs)}</small></td><td class="n">${r ? ars(i / r) : "—"}</td>
        <td class="n">${ent(suma(as, a => a.alcance))}</td><td class="n">${ars(div(i, suma(as, a => a.impresiones)) * 1000)}</td>
        <td class="n">${ent(suma(as, a => a.seguimientos))}</td></tr>`; }).join("");
    const porObjetivo = tarjeta("¿Qué compramos con la pauta?", "Agrupado por el objetivo que se eligió en Meta. Costo por resultado = inversión ÷ resultados.",
      `<div class="ec-tabla-wrap"><table class="ec-tabla"><thead><tr><th>Objetivo</th><th class="n">Inversión</th><th class="n">Resultados</th><th class="n">Costo por resultado</th><th class="n">Alcance</th><th class="n">CPM</th><th class="n">Seguidores</th></tr></thead><tbody>${filasObj}</tbody></table></div>`, "pa-ancha");

    // Por tipo de contenido
    const tipos = Object.keys(TIPOS).map(k => { const as = L.filter(a => (a.tipo || "marca") === k); return { l: TIPOS[k], v: suma(as, a => a.inversion_ars), sub: `${plural(as.length, "anuncio")} · ${pctN(div(suma(as, a => a.inversion_ars), inv))}` }; }).filter(x => x.v).sort((x, y) => y.v - x.v);
    const porTipo = tarjeta("¿Qué pautamos?", "Inversión por tipo de pieza (se corrige en Anuncios).", barrasH(tipos, ars));

    // Mes a mes: inversión vs. ventas de la marca
    const mesesInv = {}; L.forEach(a => { const f = inicioDe(a); if (!f) return; const m = f.slice(0, 7); mesesInv[m] = (mesesInv[m] || 0) + (invUsd(a) || 0); });
    let mesGraf = "";
    if (MESES && MESES.length) {
      const ms = Object.keys(mesesInv).sort(); const ini = ms[0], fin = ms[ms.length - 1] > (RANGO && RANGO.hasta || "").slice(0, 7) ? ms[ms.length - 1] : (RANGO.hasta || "").slice(0, 7);
      const serie = []; for (let m = ini; m && m <= fin; m = isoDe(new Date(+m.slice(0, 4), +m.slice(5, 7), 1)).slice(0, 7)) serie.push(m);
      const parcial = RANGO && RANGO.hasta && RANGO.hasta.slice(0, 7) + "-" + pad(new Date(+RANGO.hasta.slice(0, 4), +RANGO.hasta.slice(5, 7), 0).getDate()) !== RANGO.hasta ? RANGO.hasta.slice(0, 7) : "";
      const venta = m => { const x = MESES.find(z => z.mes === m); if (!x || m === parcial) return null; return MARCA === "laftdren" ? x.laft : MARCA === "leuk" ? x.total - x.laft : x.total; };
      const quien = MARCA === "laftdren" ? "Laftdren" : MARCA === "leuk" ? "Leuk (todo menos Laftdren)" : "Leuk Group";
      const corr = correlacion(serie.map(m => mesesInv[m] || 0), serie.map(venta));
      mesGraf = tarjeta("Inversión mes a mes y ventas", `Columnas: inversión del mes en que arrancó cada anuncio (US$). Línea: ventas de ${quien} (sell-in, US$).`,
        leyenda([["Inversión en pauta", COL.soft], [`Ventas de ${quien}`, "var(--ink)", true]]) +
        columnasLinea(serie, serie.map(m => mesesInv[m] || 0), serie.map(venta), usdCorto, usdCorto) +
        `<p class="pa-pie">${corr == null ? "" : `Se mueven ${Math.abs(corr) < 0.3 ? "<b>sin relación clara</b>" : corr > 0 ? "<b>en el mismo sentido</b>" : "<b>en sentido contrario</b>"} (correlación ${corr.toFixed(2).replace(".", ",")}). `}
        Es una mirada general: las ventas de la marca dependen de muchas cosas además de la pauta. El efecto de cada anuncio se mide en <b>Ventas por producto</b>.</p>`, "pa-ancha");
    } else if (MESES) mesGraf = tarjeta("Inversión mes a mes y ventas", "", `<p class="ec-ayuda">Para cruzar con las ventas, subí el reporte de ventas en <b>Impacto de acciones → ⋯ Más → Actualizar ventas</b>.</p>`, "pa-ancha");

    // Los que más rindieron
    const top = L.filter(a => num(a.resultados) && num(a.inversion_ars)).map(a => ({ a, c: a.inversion_ars / a.resultados }));
    const mejores = {}; top.forEach(x => { const k = objDe(x.a).t; (mejores[k] = mejores[k] || []).push(x); });
    const topHTML = Object.entries(mejores).map(([t, xs]) => {
      xs.sort((p, q) => p.c - q.c);
      return `<div class="pa-top"><h4>${esc(t)}</h4><ol>${xs.slice(0, 3).map(x => `<li><a href="#" data-pa="ir" data-id="${x.a.id}">${esc(corta(nombreCorto(x.a), 46))}</a> <small>${ars(x.c)} por ${esc(objDe(x.a).r)}</small></li>`).join("")}</ol></div>`; }).join("");
    const mejoresCard = tarjeta("Los que rindieron mejor", "Menor costo por resultado dentro de cada objetivo.", topHTML || `<p class="ec-ayuda">Sin datos.</p>`);

    return kpis + `<div class="pa-grilla">${mesGraf}${porObjetivo}${porTipo}${mejoresCard}</div>`;
  }
  function correlacion(x, y) {
    const p = x.map((v, i) => [v, y[i]]).filter(([a, b]) => a != null && b != null);
    if (p.length < 4) return null;
    const mx = p.reduce((s, q) => s + q[0], 0) / p.length, my = p.reduce((s, q) => s + q[1], 0) / p.length;
    let sxy = 0, sxx = 0, syy = 0; p.forEach(([a, b]) => { sxy += (a - mx) * (b - my); sxx += (a - mx) ** 2; syy += (b - my) ** 2; });
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }
  // Nombre sin el prefijo del objetivo ("Tráfico - Visitas al perfil : Lazu" → "Lazu").
  const nombreCorto = a => { const p = String(a.nombre || "").replace(/^LEUK ILU \|\s*/i, "").split(/\s*[:|]\s*|\s+-\s+/).filter(Boolean); return p.length > 1 ? p.slice(-1)[0].replace(/^Producto_|^Proyectos_ ?/i, "") || a.nombre : a.nombre; };

  /* ---------- ANUNCIOS ---------- */
  function chipRes(a) {
    const r = resultado(a);
    const t = { sinpalabra: ["", "Elegí el producto"], nomide: ["", "No se mide en ventas"], sinventas: ["", "Faltan ventas"], sinfecha: ["", "Sin fecha"],
                esperando: ["", "Esperando ventas"], calculando: ["", "Calculando…"], error: ["no", "Error al medir"] }[r.estado];
    if (t) return `<span class="ec-ver ${t[0]}">${t[1]}</span>`;
    return `<span class="ec-ver ${r.ver.c}">${r.ver.t}</span>${r.provisorio ? ` <span class="ec-estado provisorio">Provisorio</span>` : ""}`;
  }
  function anunciosHTML() {
    let L = lista();
    const objs = [...new Set(L.map(a => objDe(a).t))];
    if (OBJ_F) L = L.filter(a => objDe(a).t === OBJ_F);
    if (BUSCA) { const b = sinTildes(BUSCA); L = L.filter(a => sinTildes(`${a.nombre} ${a.conjunto} ${a.palabra}`).includes(b)); }
    const ord = { fecha: (x, y) => String(inicioDe(y)).localeCompare(String(inicioDe(x))),
                  inversion: (x, y) => (num(y.inversion_ars) || 0) - (num(x.inversion_ars) || 0),
                  roas: (x, y) => ((resultado(y).roas ?? -1) - (resultado(x).roas ?? -1)) };
    L = L.slice().sort(ord[ORDEN]);
    const th = (k, t, cls) => `<th class="${cls || ""}"><button class="pa-ord ${ORDEN === k ? "on" : ""}" data-pa="orden" data-k="${k}">${t}${ORDEN === k ? " ↓" : ""}</button></th>`;
    const filas = L.map(a => {
      const o = objDe(a), r = resultado(a), abierto = ABIERTO === a.id;
      return `<tr data-pa-abrir="${a.id}" class="${abierto ? "on" : ""}">
        <td>${fechaCorta(inicioDe(a))}${!MARCA ? `<small>${MARCAS[a.marca] || a.marca}</small>` : ""}</td>
        <td class="pa-nom"><b>${esc(nombreCorto(a))}</b><small>${esc(o.t)}${a.entrega === "active" ? " · activo" : ""}</small></td>
        <td class="n">${ars(num(a.inversion_ars))}</td>
        <td class="n">${ent(num(a.resultados))}<small> ${num(a.resultados) && num(a.inversion_ars) ? ars(a.inversion_ars / a.resultados) + " c/u" : ""}</small></td>
        <td class="n">${ent(num(a.alcance))}</td>
        <td class="pa-prod" data-no-abrir>
          <select class="ac-sel pa-tipo" data-pa-campo="tipo" data-id="${a.id}" aria-label="Tipo">${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}" ${(a.tipo || "marca") === k ? "selected" : ""}>${t}</option>`).join("")}</select>
          ${(a.tipo || "") === "producto" || a.palabra ? `<input class="pa-pal" data-pa-campo="palabra" data-id="${a.id}" value="${esc(a.palabra || "")}" placeholder="Producto (ej. Niao)" aria-label="Producto a buscar en las ventas">` : ""}</td>
        <td>${chipRes(a)}${r.estado === "medido" ? `<small>${signo(r.m.extra)} · ROAS ${roas(r.roas)}</small>` : ""}</td>
      </tr>${abierto ? `<tr class="pa-det-fila"><td colspan="7">${detalleHTML(a)}</td></tr>` : ""}`; }).join("");
    return `<div class="mh-bar pa-bar2">
        <input type="search" class="pa-busca" placeholder="Buscar anuncio o producto" value="${esc(BUSCA)}" aria-label="Buscar">
        <div class="mh-chips">${["", ...objs].map(t => `<button class="ac-chip ${OBJ_F === t ? "on" : ""}" data-pa="obj" data-o="${esc(t)}">${t ? esc(t) : "Todos los objetivos"}</button>`).join("")}</div>
      </div>
      <p class="ec-ayuda">Tocá un anuncio para ver todas sus métricas y el detalle de ventas. En <b>Tipo</b> y <b>Producto</b> corregí lo que no se haya reconocido: el producto es la palabra que se busca en la descripción de los artículos vendidos.</p>
      <section class="ec-card ec-tabla-card"><div class="ec-tabla-wrap"><table class="ec-tabla pa-tabla">
        <colgroup><col class="c-f"><col><col class="c-i"><col class="c-r"><col class="c-a"><col class="c-t"><col class="c-v"></colgroup>
        <thead><tr>${th("fecha", "Arrancó")}<th>Anuncio</th>${th("inversion", "Inversión", "n")}<th class="n">Resultados</th><th class="n">Alcance</th><th>Tipo · producto</th>${th("roas", "Ventas")}</tr></thead>
        <tbody>${filas || `<tr><td colspan="7" class="ec-ayuda">Ningún anuncio coincide.</td></tr>`}</tbody></table></div></section>`;
  }
  function detalleHTML(a) {
    const o = objDe(a), i = num(a.inversion_ars), p = piezaDe(a), r = resultado(a);
    const M = (t, v, sub) => v == null || v === 0 && !sub ? "" : `<div><span>${t}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
    const met = [
      M("Inversión", ars(i), invUsd(a) ? `≈ ${usd(invUsd(a))}` : ""),
      M("Resultados", ent(num(a.resultados)), num(a.resultados) && i ? `${ars(i / a.resultados)} por ${o.r}` : o.t),
      M("Alcance", ent(num(a.alcance)), num(a.frecuencia) ? `frecuencia ${Number(a.frecuencia).toFixed(1).replace(".", ",")}` : ""),
      M("Impresiones", ent(num(a.impresiones)), num(a.impresiones) && i ? `CPM ${ars(i / a.impresiones * 1000)}` : ""),
      num(a.visitas_perfil) ? M("Visitas al perfil", ent(a.visitas_perfil)) : "",
      num(a.seguimientos) ? M("Seguidores nuevos", ent(a.seguimientos), i ? `${ars(i / a.seguimientos)} cada uno` : "") : "",
      num(a.interacciones) ? M("Interacciones", ent(a.interacciones)) : "",
      num(a.clics) ? M("Clics en el enlace", ent(a.clics), num(a.impresiones) ? `CTR ${pctN(a.clics / a.impresiones, 2)}` : "") : "",
      num(a.visitas_web) ? M("Visitas al sitio", ent(a.visitas_web)) : "",
      num(a.conversaciones) ? M("Conversaciones", ent(a.conversaciones)) : "",
      num(a.reproducciones) ? M("Reproducciones", ent(a.reproducciones), num(a.thruplays) ? `${ent(a.thruplays)} de 15 s` : "") : "",
      (num(a.reacciones) || num(a.comentarios) || num(a.compartidos) || num(a.guardados)) ? M("Reacciones · coment. · compart. · guard.", `${ent(num(a.reacciones) || 0)} · ${ent(num(a.comentarios) || 0)} · ${ent(num(a.compartidos) || 0)} · ${ent(num(a.guardados) || 0)}`) : "",
    ].join("");
    let ventas = "";
    if (r.estado === "medido") {
      const m = r.m, quien = a.marca === "laftdren" ? "las ventas de Laftdren" : "las ventas totales";
      ventas = `<section class="ec-veredicto ${r.ver.c}"><b>${r.ver.t}</b>${r.provisorio ? ` <span class="ec-estado provisorio">Provisorio</span>` : ""}
        <p>En los ${m.dias} días desde el ${fechaLarga(inicioDe(a))} se vendieron <b>${usd(m.pd.prod)}</b> de «${esc(palabraDe(a))}» (${m.pd.clientes} clientes; antes: ${usd(m.pa.prod)}, ${pct(m.crecProd)}).
        En las mismas fechas ${quien} ${m.crecRef >= 0 ? "crecieron" : "bajaron"} ${pct(m.crecRef).replace(/^[+−]/, "")}, así que esperábamos unos <b>${usd(m.esperado)}</b>:
        <b>${usd(Math.abs(m.extra))} ${m.extra >= 0 ? "más" : "menos"}</b> de lo esperado.
        ${r.inv ? `ROAS <b>${roas(r.roas)}</b> (compras extra ÷ ${usd(r.inv)} invertidos${r.grupo.length > 1 ? ` entre ${r.grupo.length} anuncios del mismo producto y fecha` : ""}); sobre el total vendido: ${roas(r.roasTotal)}.` : "Falta el tipo de cambio para pasar la inversión a US$."}</p>
        <p class="pa-pie">Son compras de los distribuidores a Leuk (sell-in). Con inversiones chicas el ROAS se dispara: mirá también las compras extra en US$.</p></section>`;
    } else if (r.estado === "sinpalabra") ventas = `<p class="ec-ayuda">Escribí el producto (la palabra que aparece en la descripción del artículo) para cruzarlo con las ventas.</p>`;
    else if (r.estado === "nomide") ventas = `<p class="ec-ayuda">Los anuncios de ${esc(TIPOS[a.tipo] || "marca").toLowerCase()} no se miden contra un producto: su efecto se ve en el alcance, las visitas y los seguidores, y en la línea de ventas del Resumen.</p>`;
    else if (r.estado === "esperando") ventas = `<p class="ec-ayuda">Las ventas por artículo llegan hasta el ${fechaLarga(RANGO_IT.hasta)}: falta subir un reporte más nuevo.</p>`;
    else if (r.estado === "sinventas") ventas = `<p class="ec-ayuda">Subí el reporte de ventas en Impacto de acciones (⋯ Más → Actualizar ventas).</p>`;
    return `<div class="pa-det">
      <div class="pa-det-top">
        <div><b>${esc(a.nombre)}</b><small>${esc(a.conjunto || "")}${a.conjunto ? " · " : ""}${MARCAS[a.marca] || a.marca} · ${esc(o.t)}</small></div>
        <div class="pa-links">
          ${a.enlace ? `<a class="btn-ghost" href="${esc(a.enlace)}" target="_blank" rel="noopener">Ver el post ↗</a>` : ""}
          ${p && window.irAPieza ? `<button class="btn-ghost" data-pa="pieza" data-id="${p.id}" data-canal="${p.canal}" data-mes="${p.mes}" title="${esc(p.criterio || "")}">Ver la pieza en Contenidos</button>` : ""}
        </div>
      </div>
      <div class="pa-met">${met}</div>
      <div class="pa-fechas">
        <label><span>Post publicado</span><b>${fechaLarga(a.fecha_post)}</b></label>
        <label><span>Arrancó la pauta</span><input type="date" data-pa-campo="inicio" data-id="${a.id}" value="${esc(inicioDe(a) || "")}"></label>
        <label><span>Informe</span><b>${a.desde ? `${fechaCorta(a.desde)} → ${fechaCorta(a.hasta)}` : "—"}</b></label>
        <label class="ancho"><span>Notas</span><input data-pa-campo="notas" data-id="${a.id}" value="${esc(a.notas || "")}" placeholder="Algo para recordar de este anuncio"></label>
      </div>
      ${ventas}
      <p class="pa-pie"><button class="btn-link" data-pa="borrar" data-id="${a.id}">Borrar este anuncio</button></p>
    </div>`;
  }

  /* ---------- VENTAS POR PRODUCTO ---------- */
  function productosHTML() {
    const L = lista().filter(a => palabraDe(a));
    const sinPal = lista().filter(a => a.tipo === "producto" && !palabraDe(a)).length;
    if (!L.length) return `<div class="empty">No hay anuncios de producto con el producto elegido. Marcalos en <b>Anuncios</b>.</div>`;
    if (!RANGO_IT) return `<div class="res-intro">Para medir las ventas hay que subir el reporte de ventas en <b>Impacto de acciones → ⋯ Más → Actualizar ventas</b>.</div>`;
    // un renglón por producto + fecha (los anuncios que comparten se suman)
    const vistos = new Set(), filas = [];
    L.forEach(a => { const k = claveMed(a); if (vistos.has(k)) return; vistos.add(k); filas.push({ a, r: resultado(a), g: grupoDe(a).filter(enFiltro) }); });
    filas.sort((x, y) => String(inicioDe(y.a)).localeCompare(String(inicioDe(x.a))));
    const med = filas.filter(f => f.r.estado === "medido");
    const extra = med.reduce((s, f) => s + f.r.m.extra, 0), inv = med.reduce((s, f) => s + (f.r.inv || 0), 0);
    const ok = med.filter(f => f.r.ver.c === "ok").length;
    const grafico = med.length ? tarjeta("Compras extra por producto", `Compras del producto en ${VENTANA} días contra lo esperado según cómo se movió la marca.`,
      `<div class="pa-div">${med.slice().sort((x, y) => y.r.m.extra - x.r.m.extra).map(f => {
        const max = Math.max(1, ...med.map(z => Math.abs(z.r.m.extra))), w = Math.abs(f.r.m.extra) / max * 50;
        return `<div class="pa-div-f"><span>${esc(corta(palabraDe(f.a), 18))} <small>${fechaCorta(inicioDe(f.a))}</small></span>
          <div class="pa-div-b"><i class="${f.r.m.extra < 0 ? "neg" : ""}" style="${f.r.m.extra < 0 ? `right:50%` : `left:50%`};width:${w}%"></i></div>
          <b class="${f.r.m.extra < 0 ? "no" : "ok"}">${signo(f.r.m.extra)}</b></div>`; }).join("")}</div>`, "pa-ancha") : "";
    return `<div class="mh-kpis">
        ${kpi(`${ok}<small>/${med.length}</small>`, "productos con más ventas de lo esperado", `${plural(filas.length, "medición", "mediciones")}${sinPal ? ` · ${sinPal} sin producto elegido` : ""}`)}
        ${kpi(signo(extra), "compras extra (neto)", `en ${VENTANA} días después de cada anuncio, sumando los que dieron menos`, extra > 0 ? "ok" : extra < 0 ? "no" : "")}
        ${kpi(usd(inv), "invertidos en esos anuncios", "pesos pasados a US$ con el TC del mes")}
        ${kpi(inv ? roas(Math.max(0, extra) / inv) : "—", "ROAS", "compras extra netas ÷ inversión", inv ? (extra / inv >= 1 ? "ok" : "no") : "")}
      </div>
      <details class="ec-fuente"><summary>¿Cómo se calcula?</summary>
        <p>Para cada anuncio de producto se suman las ventas (US$, sell-in) de los artículos cuya descripción tiene la palabra del producto, <b>${VENTANA} días después</b> de que arrancó, y se comparan con los ${VENTANA} días anteriores.
        Como las ventas suben y bajan por la temporada, lo esperado es lo de antes × lo que se movió la marca en esas fechas (Leuk: ventas totales; Laftdren: todos los artículos Laftdren).
        <b>Compras extra</b> = después − esperado. <b>ROAS</b> = compras extra ÷ inversión. Si el período todavía no terminó o las ventas no llegan, queda <b>provisorio</b>.</p>
        <p>Anuncios del mismo producto que arrancaron el mismo día se miden juntos y su inversión se suma. Es una estimación: si en esas fechas hubo otra acción (un evento, una exhibición), también suma.
        Con inversiones de pocos dólares cualquier variación normal de las ventas da un ROAS enorme: tomalo como señal, no como prueba, y mirá las compras extra en US$.
        «Sin ventas de ese producto» = no hay ventas con esa palabra en ninguno de los dos períodos: revisá que la palabra sea la de la descripción del artículo.</p></details>
      <div class="pa-grilla">${grafico}</div>
      <section class="ec-card ec-tabla-card"><div class="ec-tabla-wrap"><table class="ec-tabla">
        <thead><tr><th>Producto</th><th>Arrancó</th><th class="n">Inversión</th><th class="n">Antes</th><th class="n">Después</th><th class="n">Esperado</th><th class="n">Extra</th><th class="n">ROAS</th><th>¿Sirvió?</th></tr></thead>
        <tbody>${filas.map(({ a, r, g }) => { const m = r.m;
          return `<tr data-pa="ir" data-id="${a.id}"><td><b>${esc(palabraDe(a))}</b><small>${g.length > 1 ? plural(g.length, "anuncio") : esc(corta(nombreCorto(a), 34))} · ${MARCAS[a.marca]}</small></td>
            <td>${fechaCorta(inicioDe(a))}</td>
            <td class="n">${r.inv != null ? usd(r.inv) : ars(suma(g, x => x.inversion_ars))}</td>
            <td class="n">${m ? usd(m.pa.prod) : "—"}</td><td class="n">${m ? usd(m.pd.prod) : "—"}</td>
            <td class="n">${m ? usd(m.esperado) : "—"}</td>
            <td class="n ${m ? (m.extra >= 0 ? "ok" : "no") : ""}">${m ? signo(m.extra) : "—"}</td>
            <td class="n">${r.roas != null ? roas(r.roas) : "—"}</td>
            <td>${chipRes(a)}</td></tr>`; }).join("")}</tbody></table></div></section>`;
  }

  /* ======================= IMPORTAR EL INFORME DE META ======================= */
  const COLS = {   // encabezado normalizado → campo
    "marca": "marca", "inicio del informe": "desde", "fin del informe": "hasta", "nombre del anuncio": "nombre",
    "enlace al anuncio": "enlace", "entrega del anuncio": "entrega", "resultados": "resultados", "indicador de resultado": "indicador",
    "alcance": "alcance", "frecuencia": "frecuencia", "costo por resultados": "costo", "presupuesto del conjunto de anuncios": "presupuesto",
    "monto gastado (ars)": "inversion_ars", "importe gastado (ars)": "inversion_ars", "impresiones": "impresiones",
    "clics en el enlace": "clics", "visitas a la pagina de destino": "visitas_web", "visitas a la pagina de destino del sitio web": "visitas_web",
    "visitas al perfil de instagram": "visitas_perfil", "seguimientos de instagram": "seguimientos",
    "interacciones con la publicacion": "interacciones", "interacciones": "interacciones",
    "conversaciones con mensajes iniciadas": "conversaciones", "reproducciones de video": "reproducciones", "thruplays de 15 segundos": "thruplays",
    "comentarios de publicaciones": "comentarios", "reacciones a publicaciones": "reacciones",
    "veces que se compartieron las publicaciones": "compartidos", "veces que se guardaron las publicaciones": "guardados",
    "nombre del conjunto de anuncios": "conjunto",
  };
  const normCab = s => sinTildes(String(s || "").replace(/ /g, " ")).replace(/\s+/g, " ").trim();
  const MESES_ARCH = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
  // "…-dic25-sep26…" → 2025-12-01 / 2026-09-30
  function periodoDelArchivo(nombre) {
    const m = sinTildes(nombre).match(/(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[ -]?(\d{2})\D+(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[ -]?(\d{2})/);
    if (!m) return null;
    const d = `20${m[2]}-${pad(MESES_ARCH[m[1]])}-01`, h = new Date(2000 + +m[4], MESES_ARCH[m[3]], 0);
    return [d, isoDe(h)];
  }
  const aISO = v => {
    if (v == null || v === "") return null;
    if (v instanceof Date) return isoDe(v);
    if (typeof v === "number") return isoDe(new Date(Math.round((v - 25569) * 864e5) + new Date().getTimezoneOffset() * 6e4));
    const s = String(v).trim(); let m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    return null;
  };
  function leerInforme(wb, archivo) {
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const hi = rows.findIndex(r => (r || []).some(c => normCab(c) === "nombre del anuncio"));
    if (hi < 0) throw new Error("No encontré la columna «Nombre del anuncio». ¿Es el informe de anuncios de Meta?");
    const cab = rows[hi].map(c => COLS[normCab(c)] || null);
    if (!cab.includes("inversion_ars")) throw new Error("No encontré la columna «Monto gastado (ARS)».");
    const per = periodoDelArchivo(archivo);
    const marcaArch = /laftdren/i.test(archivo) ? "laftdren" : /leuk/i.test(archivo) ? "leuk" : "";
    const out = [];
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i] || {}, x = {};
      cab.forEach((k, j) => { if (k) x[k] = r[j]; });
      // el link puede venir como hipervínculo de la celda
      const jEnl = cab.indexOf("enlace");
      if (jEnl >= 0 && !x.enlace) { const cel = ws[XLSX.utils.encode_cell({ r: i, c: jEnl })]; if (cel && cel.l && cel.l.Target) x.enlace = cel.l.Target; }
      const nombre = String(x.nombre || "").trim();
      if (!nombre || /^total/i.test(nombre)) continue;
      const marca = /laftdren/i.test(x.marca || "") ? "laftdren" : /leuk/i.test(x.marca || "") ? "leuk" : marcaArch || "leuk";
      const codigo = codigoDe(x.enlace);
      const desde = aISO(x.desde) || (per && per[0]) || null, hasta = aISO(x.hasta) || (per && per[1]) || null;
      const inv = num(x.inversion_ars);
      let res = num(x.resultados);
      if (res == null && num(x.costo) && inv) res = Math.round(inv / num(x.costo));   // el de Leuk no trae "Resultados"
      const conjunto = String(x.conjunto || "").trim();
      const g = adivinar(nombre, conjunto, marca);
      const f = { marca, nombre, enlace: String(x.enlace || "").trim(), codigo, fecha_post: fechaDeCodigo(codigo), conjunto,
        indicador: String(x.indicador || "").trim(), entrega: String(x.entrega || "").trim(), desde, hasta,
        inversion_ars: inv, presupuesto: num(x.presupuesto), impresiones: num(x.impresiones), alcance: num(x.alcance),
        frecuencia: num(x.frecuencia), resultados: res, clics: num(x.clics), visitas_perfil: num(x.visitas_perfil),
        visitas_web: num(x.visitas_web), seguimientos: num(x.seguimientos), interacciones: num(x.interacciones),
        conversaciones: num(x.conversaciones), reproducciones: num(x.reproducciones), thruplays: num(x.thruplays),
        comentarios: num(x.comentarios), reacciones: num(x.reacciones), compartidos: num(x.compartidos), guardados: num(x.guardados),
        tipo: g.tipo, palabra: g.palabra, archivo };
      f.clave = [marca, codigo || nombre, conjunto, nombre, desde || "", hasta || ""].join("|");
      out.push(f);
    }
    // misma clave dos veces en el archivo → se suman (no debería pasar, pero no se pierde nada)
    const por = new Map();
    out.forEach(f => { const y = por.get(f.clave); if (!y) return por.set(f.clave, f);
      ["inversion_ars", "impresiones", "alcance", "resultados", "clics", "visitas_perfil", "visitas_web", "seguimientos", "interacciones", "conversaciones", "reproducciones", "thruplays", "comentarios", "reacciones", "compartidos", "guardados"]
        .forEach(k => { if (f[k] != null) y[k] = (y[k] || 0) + f[k]; }); });
    return [...por.values()];
  }
  async function importar(files) {
    if (!window.XLSX) { lkAviso("No cargó el lector de Excel. Recargá la página."); return; }
    let total = 0; const marcas = new Set(), sinFecha = [];
    nota("Leyendo el informe…");
    try {
      for (const file of files) {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
        const filas = leerInforme(wb, file.name);
        if (!filas.length) throw new Error(`«${file.name}» no tiene anuncios.`);
        if (filas.some(f => !f.desde)) {
          const p = await lkPedir(`«${file.name}» no dice qué período cubre. ¿Desde qué fecha? (AAAA-MM-DD)`, "");
          const d = aISO(p); if (!d) { nota("Importación cancelada.", true); return; }
          const h = aISO(await lkPedir("¿Hasta qué fecha? (AAAA-MM-DD)", "")) || null;
          filas.forEach(f => { if (!f.desde) { f.desde = d; f.hasta = h; f.clave = [f.marca, f.codigo || f.nombre, f.conjunto, f.nombre, d, h || ""].join("|"); } });
        }
        filas.forEach(f => { marcas.add(MARCAS[f.marca]); if (!f.fecha_post) sinFecha.push(f.nombre); });
        await rpc("pauta_importar", { p_filas: filas });
        total += filas.length;
      }
    } catch (e) {
      nota(e.status === 404 ? "Falta correr el SQL 2026-11-05-pauta-instagram.sql en Supabase." : `No se pudo subir: ${String(e.message || e).slice(0, 160)}`, true);
      return;
    }
    Object.keys(MED).forEach(k => delete MED[k]);
    await traer();
    TAB = "anuncios"; pintar();
    nota(`Listo: ${plural(total, "anuncio")} de ${[...marcas].join(" y ")}.${sinFecha.length ? ` ${sinFecha.length} sin link al post: cargá a mano cuándo arrancaron.` : ""} Revisá el tipo y el producto de cada uno.`);
  }

  /* ======================= GUARDAR / BORRAR ======================= */
  async function guardar(id, campos) {
    const a = ADS.find(x => x.id === id); if (!a) return;
    const antes = Object.assign({}, a);
    Object.assign(a, campos);
    pintar(); medirTodo();
    try {
      const r = await fetch(url(`pauta_anuncios?id=eq.${id}`), { method: "PATCH", headers: head({ Prefer: "return=minimal" }), body: JSON.stringify(Object.assign({ actualizado: new Date().toISOString() }, campos)) });
      if (!r.ok) throw new Error(r.status);
      nota("Guardado.");
    } catch (e) { Object.assign(a, antes); pintar(); nota("No se pudo guardar. Revisá la conexión.", true); }
  }
  async function borrar(id) {
    const a = ADS.find(x => x.id === id); if (!a) return;
    if (!(await lkConfirmar(`¿Borrar «${nombreCorto(a)}»? Si volvés a subir el informe, vuelve a aparecer.`))) return;
    try {
      const r = await fetch(url(`pauta_anuncios?id=eq.${id}`), { method: "DELETE", headers: head() });
      if (!r.ok) throw new Error(r.status);
      ADS = ADS.filter(x => x.id !== id); ABIERTO = null; pintar(); nota("Borrado.");
    } catch (e) { nota("No se pudo borrar.", true); }
  }

  /* ======================= EXCEL ======================= */
  function excel() {
    if (!window.XLSX) return;
    const L = lista();
    const filas = [["Marca", "Arrancó", "Post publicado", "Anuncio", "Conjunto", "Objetivo", "Tipo", "Producto", "Inversión ($)", "Inversión (US$)", "Resultados", "Costo por resultado ($)",
      "Alcance", "Impresiones", "CPM ($)", "Visitas al perfil", "Seguidores nuevos", "Interacciones", "Clics", "Visitas al sitio", "Conversaciones",
      `Ventas antes ${VENTANA} d (US$)`, `Ventas después ${VENTANA} d (US$)`, "Esperado (US$)", "Compras extra (US$)", "ROAS", "¿Sirvió?", "Enlace"]];
    L.forEach(a => { const r = resultado(a), m = r.m, i = num(a.inversion_ars);
      filas.push([MARCAS[a.marca], inicioDe(a), a.fecha_post, a.nombre, a.conjunto, objDe(a).t, TIPOS[a.tipo] || "", a.palabra, i, invUsd(a) != null ? Math.round(invUsd(a)) : null,
        num(a.resultados), num(a.resultados) && i ? Math.round(i / a.resultados * 100) / 100 : null, num(a.alcance), num(a.impresiones),
        num(a.impresiones) && i ? Math.round(i / a.impresiones * 1000) : null, num(a.visitas_perfil), num(a.seguimientos), num(a.interacciones), num(a.clics), num(a.visitas_web), num(a.conversaciones),
        m ? Math.round(m.pa.prod) : null, m ? Math.round(m.pd.prod) : null, m ? Math.round(m.esperado) : null, m ? Math.round(m.extra) : null,
        r.roas != null ? Math.round(r.roas * 10) / 10 : null, r.ver ? r.ver.t : "", a.enlace]); });
    const wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(filas);
    ws["!cols"] = filas[0].map((h, i) => ({ wch: i === 3 ? 48 : i === 4 ? 36 : 14 }));
    XLSX.utils.book_append_sheet(wb, ws, "Pauta");
    XLSX.writeFile(wb, `Pauta Instagram${MARCA ? " " + MARCAS[MARCA] : ""} ${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /* ======================= EVENTOS ======================= */
  function enganchar() {
    const c = caja(); if (!c || c.dataset.enganchado) return; c.dataset.enganchado = "1";
    c.addEventListener("click", async ev => {
      const b = ev.target.closest("[data-pa]");
      if (!b) {
        const tr = ev.target.closest("tr[data-pa-abrir]");
        if (tr && !ev.target.closest("[data-no-abrir], input, select, a, button")) { ABIERTO = ABIERTO === tr.dataset.paAbrir ? null : tr.dataset.paAbrir; pintar(); }
        return;
      }
      const k = b.dataset.pa;
      if (b.tagName === "A") ev.preventDefault();
      if (k === "tab") { TAB = b.dataset.tab; ABIERTO = null; pintar(); }
      else if (k === "marca") { MARCA = b.dataset.m; pintar(); }
      else if (k === "ventana") { VENTANA = +b.dataset.n; pintar(); medirTodo(); }
      else if (k === "obj") { OBJ_F = b.dataset.o; pintar(); }
      else if (k === "orden") { ORDEN = b.dataset.k; pintar(); }
      else if (k === "subir") c.querySelector(".pa-file").click();
      else if (k === "excel") { b.closest("details") && b.closest("details").removeAttribute("open"); excel(); }
      else if (k === "como") { b.closest("details").removeAttribute("open"); lkAviso("Cómo subir el informe de Meta\n\nBajá de Ads Manager el Excel de anuncios de cada marca (Leuk y Laftdren) con la columna ENLACE AL ANUNCIO, dejando en el nombre la marca y el período (ej. Leuk-Anuncios-dic25-oct26). Subí los dos juntos: el informe nuevo reemplaza al anterior sin duplicar anuncios y conserva el tipo y el producto que elegiste."); }
      else if (k === "ir") { TAB = "anuncios"; ABIERTO = b.dataset.id; OBJ_F = ""; BUSCA = ""; pintar(); const f = c.querySelector("tr.on"); if (f) f.scrollIntoView({ block: "center" }); }
      else if (k === "pieza") window.irAPieza(b.dataset.id, b.dataset.canal, b.dataset.mes);
      else if (k === "borrar") borrar(b.dataset.id);
      else if (k === "reintentar") { ERROR = ""; pintar(); await traer(); pintar(); }
    });
    c.addEventListener("change", ev => {
      const t = ev.target;
      if (t.classList.contains("pa-file")) { const fs = [...t.files]; t.value = ""; if (fs.length) importar(fs); return; }
      if (t.dataset.paF === "periodo") { PERIODO = t.value; pintar(); return; }
      const campo = t.dataset.paCampo; if (!campo) return;
      let v = t.value.trim();
      if (campo === "inicio") v = v || null;
      const extra = {};
      if (campo === "tipo" && v !== "producto") { const a = ADS.find(x => x.id === t.dataset.id); if (a && a.palabra) extra.palabra = ""; }
      guardar(t.dataset.id, Object.assign({ [campo]: v }, extra));
    });
    let tb = null;
    c.addEventListener("input", ev => {
      if (!ev.target.classList.contains("pa-busca")) return;
      clearTimeout(tb); const v = ev.target.value;
      tb = setTimeout(() => { BUSCA = v; pintar(); const i = c.querySelector(".pa-busca"); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 250);
    });
  }

  window.renderPauta = async function () {
    enganchar();
    if (!CARGADO) { pintar(); await traer(); }
    pintar(); medirTodo();
  };
})();
