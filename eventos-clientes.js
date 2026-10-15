/* ============================================================================
   EVENTOS CON CLIENTES — sección de Acciones.
   Qué distribuidores invitamos a cada evento, quiénes vinieron y cuánto
   compraron (USD) antes y después, comparado con los que no vinieron y con el
   resto de los clientes.

   Dos pantallas:
     · TABLERO → todos los eventos: métricas del año, gráficos, tabla de eventos
                 y ranking de clientes. Descarga a Excel y PDF.
     · EVENTO  → datos del evento, sus clientes (inscripto / asistió / personas)
                 y el análisis de compras en la ventana elegida (30/60/90/180 días).

   Las ventas salen del "Reporte de ventas" del sistema (CSV por línea de
   factura). Se sube desde acá: se agrupa en el navegador por cliente y día y se
   guarda en Supabase (ventas_diarias). Nunca queda en un archivo del repo.
   SQL: supabase/sql/2026-10-15-eventos-clientes.sql. Quién entra: Admin y Líder.
   ========================================================================== */
(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const SES = () => window.LEUK_SESION || {};
  const url = p => `${SES().sbUrl}/rest/v1/${p}`;
  const head = extra => Object.assign({ "Content-Type": "application/json" }, SES().head ? SES().head() : {}, extra || {});
  const low = s => String(s || "").toLowerCase();
  const yo = () => low(SES().email && SES().email());
  const esAdmin = () => !!(SES().rol && SES().rol() === "admin");
  const caja = () => $("#eventos-clientes");
  const enc = s => encodeURIComponent(s);

  /* ---- Utilidades ---- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pad = n => String(n).padStart(2, "0");
  const isoDe = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hoyISO = () => isoDe(new Date());
  const aFecha = s => { const p = String(s || "").split("-"); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); };
  const sumarDias = (s, n) => { const d = aFecha(s); d.setDate(d.getDate() + n); return isoDe(d); };
  const difDias = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 864e5);
  const sinTildes = s => low(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
  const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const fechaLarga = s => { if (!s) return ""; const d = aFecha(s); return `${d.getDate()} ${MES_CORTO[d.getMonth()]} ${d.getFullYear()}`; };
  const num = v => (v === "" || v == null || isNaN(Number(v))) ? null : Number(v);
  const usd = v => v == null ? "—" : `US$ ${Math.round(v).toLocaleString("es-AR")}`;
  const usdCorto = v => { const a = Math.abs(v), s = v < 0 ? "−" : "";
    return a >= 1e6 ? `${s}${(a / 1e6).toFixed(1).replace(".", ",")} M` : a >= 1e3 ? `${s}${Math.round(a / 1e3)} k` : `${s}${Math.round(a)}`; };
  const pct = x => x == null || !isFinite(x) ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(Math.round(x * 100))} %`;
  const pctN = x => x == null || !isFinite(x) ? "—" : `${Math.round(x * 100)} %`;
  const veces = x => x == null || !isFinite(x) ? "—" : `${x < 0 ? "−" : ""}${Math.abs(x).toFixed(1).replace(".", ",")}×`;
  const signo = v => v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${usd(Math.abs(v))}`;
  const plural = (n, s, p) => `${n} ${n === 1 ? s : (p || s + "s")}`;

  /* ---- Vocabulario ---- */
  const FORMATOS = ["Showroom", "Capacitación", "Lanzamiento", "Visita a fábrica", "After office", "Feria / exposición",
                    "Evento del distribuidor", "Otro"];
  const VENTANAS = [30, 60, 90, 180];

  /* ---- Estado ---- */
  let EVS = [];             // eventos_clientes
  let INV = {};             // evento_id -> [clientes del evento]
  let CLI = new Map();      // cuit -> ventas_clientes
  let ACCS = [];            // acciones (para vincular inversión)
  let RANGO = null;         // {desde, hasta, clientes} de las ventas cargadas
  const VENTAS = new Map(); // cuit -> [{fecha, usd, facturas, familias}] ordenado por fecha
  const BASE = {};          // caché de ventas_base
  const TCS = {};           // fecha -> tipo de cambio promedio cercano
  let CARGADO = false, ERROR = "";
  let ABIERTO = null;       // id de evento | "nuevo" | null
  let BORRADOR = null;
  let VENTANA = 90;
  let ANIO = String(new Date().getFullYear());
  let FORMATO = "";
  let CFILTRO = "todos";    // filtro de la tabla de clientes del evento
  let BUSCA_CLI = "";       // buscador para sumar clientes
  let IMPORTANDO = false;
  let NOTA = "", NOTA_ERR = false, NOTA_T = null;

  /* ---- Avisos ---- */
  function nota(t, err, fija) {
    NOTA = t; NOTA_ERR = !!err;
    clearTimeout(NOTA_T);
    if (!fija) NOTA_T = setTimeout(() => { NOTA = ""; pintarNota(); }, err ? 8000 : 4000);
    pintarNota();
  }
  function pintarNota() {
    const c = caja(); if (!c) return;
    c.querySelectorAll(".ec-nota").forEach(n => { n.textContent = NOTA; n.classList.toggle("err", NOTA_ERR); });
  }

  /* ---- Datos ---- */
  // PostgREST devuelve de a 1000 filas como mucho: se pide por páginas.
  async function todo(path) {
    const out = [];
    for (let off = 0; ; off += 1000) {
      const r = await fetch(url(`${path}${path.includes("?") ? "&" : "?"}limit=1000&offset=${off}`), { headers: head() });
      if (!r.ok) { const e = new Error(String(r.status)); e.status = r.status; throw e; }
      const d = await r.json();
      out.push(...d);
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
      const [evs, inv, cli, rango, accs] = await Promise.all([
        todo("eventos_clientes?select=*&order=fecha.desc.nullsfirst,creado.desc"),
        todo("eventos_clientes_inv?select=*&order=creado.asc"),
        todo("ventas_clientes?select=*&order=cuit"),
        rpc("ventas_rango").catch(() => []),
        todo("acciones?select=id,titulo,tipo,estado,moneda,inversion_real,inversion_estimada,fecha_inicio&order=fecha_inicio.desc.nullslast").catch(() => []),
      ]);
      EVS = evs; INV = {};
      inv.forEach(x => { (INV[x.evento_id] = INV[x.evento_id] || []).push(x); });
      CLI = new Map(cli.map(c => [c.cuit, c]));
      RANGO = rango && rango[0] && rango[0].hasta ? rango[0] : null;
      ACCS = accs;
      ERROR = ""; CARGADO = true;
    } catch (e) { ERROR = e.status === 404 ? "sql" : "red"; }
  }

  // Ventas de los clientes que hagan falta (las que todavía no están en memoria).
  async function cargarVentas(cuits) {
    const faltan = [...new Set(cuits.filter(c => c && !VENTAS.has(c)))];
    for (let i = 0; i < faltan.length; i += 60) {
      const lote = faltan.slice(i, i + 60);
      const lista = lote.map(c => `"${c}"`).join(",");
      const filas = await todo(`ventas_diarias?select=cuit,fecha,usd,facturas,familias&cuit=in.(${enc(lista)})&order=cuit,fecha`);
      lote.forEach(c => VENTAS.set(c, []));
      filas.forEach(f => VENTAS.get(f.cuit).push(f));
    }
  }
  const todosLosCuits = () => Object.values(INV).flat().map(x => x.cuit).filter(Boolean);

  // Sumas de un cliente entre dos fechas (incluidas).
  function sumaCliente(cuit, desde, hasta, fams) {
    let u = 0, f = 0;
    (VENTAS.get(cuit) || []).forEach(v => {
      if (v.fecha < desde || v.fecha > hasta) return;
      u += Number(v.usd) || 0; f += v.facturas || 0;
      if (fams) Object.entries(v.familias || {}).forEach(([k, x]) => { fams[k] = (fams[k] || 0) + Number(x); });
    });
    return { usd: u, facturas: f };
  }

  // Tipo de cambio cerca de una fecha (para pasar a US$ una inversión cargada en pesos).
  async function tcCerca(fecha) {
    if (!fecha) return null;
    if (fecha in TCS) return TCS[fecha];
    try {
      const d = await todo(`ventas_diarias?select=tc&tc=not.is.null&fecha=gte.${sumarDias(fecha, -20)}&fecha=lte.${sumarDias(fecha, 20)}`);
      const v = d.map(x => Number(x.tc)).filter(x => x > 0);
      TCS[fecha] = v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
    } catch (e) { TCS[fecha] = null; }
    return TCS[fecha];
  }

  /* ---- Inversión del evento en US$ ---- */
  const accionDe = ev => ev && ev.accion_id ? ACCS.find(a => a.id === ev.accion_id) : null;
  function inversion(ev) {
    if (num(ev.inversion_usd) != null) return { usd: num(ev.inversion_usd), origen: "cargada" };
    const a = accionDe(ev); if (!a) return { usd: null, origen: "" };
    const m = num(a.inversion_real) != null ? num(a.inversion_real) : num(a.inversion_estimada);
    if (m == null) return { usd: null, origen: "" };
    if ((a.moneda || "ARS") === "USD") return { usd: m, origen: "de la acción" };
    const tc = TCS[ev.fecha];
    return tc ? { usd: m / tc, origen: `de la acción ($ ${Math.round(m).toLocaleString("es-AR")} ÷ TC ${Math.round(tc)})` }
              : { usd: null, origen: "de la acción, falta el tipo de cambio" };
  }

  /* ---- Cálculo de un evento ----------------------------------------------
     Ventana de N días: ANTES = los N días previos al evento; DESPUÉS = el día del
     evento y los N-1 siguientes. Si todavía no pasaron N días (o las ventas
     cargadas no llegan), se acortan LAS DOS ventanas a lo que haya, para comparar
     lo mismo con lo mismo. */
  function calcular(ev, N) {
    const lista = INV[ev.id] || [];
    const out = { ev, lista, filas: [], dias: 0, falta: "" };
    if (!ev.fecha) { out.falta = "Cargá la fecha del evento para medir las compras."; return out; }
    if (!RANGO) { out.falta = "Todavía no hay ventas cargadas. Subí el reporte de ventas desde el tablero (⋯ Más → Actualizar ventas)."; return out; }
    const disp = difDias(ev.fecha, RANGO.hasta) + 1;
    out.dias = Math.min(N, disp);
    if (out.dias <= 0) { out.falta = `Las ventas cargadas llegan hasta el ${fechaLarga(RANGO.hasta)}: todavía no hay compras posteriores al evento.`; return out; }
    out.antes = [sumarDias(ev.fecha, -out.dias), sumarDias(ev.fecha, -1)];
    out.despues = [ev.fecha, sumarDias(ev.fecha, out.dias - 1)];
    out.famAsist = {};
    out.filas = lista.map(x => {
      const c = CLI.get(x.cuit) || {};
      const a = x.cuit ? sumaCliente(x.cuit, out.antes[0], out.antes[1]) : { usd: 0, facturas: 0 };
      const d = x.cuit ? sumaCliente(x.cuit, out.despues[0], out.despues[1], x.asistio ? out.famAsist : null) : { usd: 0, facturas: 0 };
      const anio = x.cuit ? sumaCliente(x.cuit, sumarDias(ev.fecha, -365), sumarDias(ev.fecha, -1)).usd : 0;
      let tipo = "";
      if (d.usd > 0) {
        if (!c.primera_compra || c.primera_compra >= ev.fecha) tipo = "nuevo";
        else if (anio <= 0) tipo = "reactivado";
      }
      return { x, c, nombre: x.nombre || c.nombre || x.razon_social || c.razon_social || "(sin nombre)",
               razon: x.razon_social || c.razon_social || "", vendedor: c.vendedor || "",
               antes: a.usd, despues: d.usd, dif: d.usd - a.usd, facturas: d.facturas, tipo };
    });
    const grupo = f => {
      const fs = out.filas.filter(f);
      const A = fs.reduce((s, r) => s + r.antes, 0), D = fs.reduce((s, r) => s + r.despues, 0);
      const fact = fs.reduce((s, r) => s + r.facturas, 0);
      return { n: fs.length, antes: A, despues: D, dif: D - A, crec: A > 0 ? (D - A) / A : null,
               compraron: fs.filter(r => r.despues > 0).length, facturas: fact };
    };
    out.asist = grupo(r => r.x.asistio);
    out.noAsist = grupo(r => !r.x.asistio);
    out.inscriptos = lista.filter(x => x.inscripto).length;
    out.personas = lista.filter(x => x.asistio).reduce((s, x) => s + (num(x.personas) || 1), 0);
    out.nuevos = out.filas.filter(r => r.x.asistio && r.tipo).length;
    out.inv = inversion(ev);
    out.retorno = out.inv.usd ? out.asist.dif / out.inv.usd : null;
    out.base = BASE[claveBase(ev, out)] || null;
    return out;
  }
  const claveBase = (ev, k) => `${ev.id}|${k.antes && k.antes[0]}|${k.despues && k.despues[1]}|${(INV[ev.id] || []).length}`;
  async function traerBase(ev, k) {
    if (!k.antes) return;
    const key = claveBase(ev, k); if (BASE[key]) return;
    const excl = (INV[ev.id] || []).map(x => x.cuit).filter(Boolean);
    try {
      const [a, d] = await Promise.all([
        rpc("ventas_base", { p_desde: k.antes[0], p_hasta: k.antes[1], p_excluir: excl }),
        rpc("ventas_base", { p_desde: k.despues[0], p_hasta: k.despues[1], p_excluir: excl }),
      ]);
      const A = Number(a[0] && a[0].usd) || 0, D = Number(d[0] && d[0].usd) || 0;
      BASE[key] = { antes: A, despues: D, crec: A > 0 ? (D - A) / A : null, clientes: (d[0] && d[0].clientes) || 0 };
    } catch (e) { /* sin base: el resto del análisis igual se muestra */ }
  }

  // Promedio mensual por cliente, de 6 meses antes a 6 después del mes del evento.
  function evolucion(k) {
    const f0 = aFecha(k.ev.fecha);
    const meses = [];
    for (let i = -6; i <= 6; i++) { const d = new Date(f0.getFullYear(), f0.getMonth() + i, 1); meses.push({ i, d }); }
    const serie = filtro => {
      const fs = k.filas.filter(filtro); if (!fs.length) return null;
      return meses.map(({ d }) => {
        const desde = isoDe(d), hasta = isoDe(new Date(d.getFullYear(), d.getMonth() + 1, 0));
        if (RANGO && desde > RANGO.hasta) return null;
        return fs.reduce((s, r) => s + (r.x.cuit ? sumaCliente(r.x.cuit, desde, hasta).usd : 0), 0) / fs.length;
      });
    };
    return {
      labels: meses.map(({ i, d }) => i === 0 ? "evento" : `${MES_CORTO[d.getMonth()]}${d.getMonth() === 0 ? " " + String(d.getFullYear()).slice(2) : ""}`),
      asist: serie(r => r.x.asistio), noAsist: serie(r => !r.x.asistio),
    };
  }

  /* ---- Gráficos (SVG propio, mismo criterio que Resultados) ---- */
  const COL = { main: "var(--olive)", soft: "var(--olive-soft)", gris: "#b9b8ad", warn: "var(--warn)" };
  const corta = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;
  function leyenda(items) {
    return `<div class="ec-ley">${items.map(([t, c, dash]) => `<span><i style="background:${c}${dash ? ";height:2px;border-top:2px dashed " + c + ";background:none" : ""}"></i>${esc(t)}</span>`).join("")}</div>`;
  }
  // Barras horizontales: [{l, v, g}] (g = barra fantasma detrás, p. ej. "antes").
  function barrasH(items, fmt) {
    if (!items.length) return `<div class="ec-graf-vacio">Sin datos</div>`;
    const W = 560, L = 170, R = 70, h = 26, H = items.length * h + 6;
    const max = Math.max(1, ...items.map(x => Math.max(x.v, x.g || 0)));
    const ancho = v => Math.max(0, (W - L - R) * v / max);
    return `<svg viewBox="0 0 ${W} ${H}" class="ec-svg" role="img">${items.map((x, i) => {
      const y = i * h + 4;
      return `<text x="${L - 8}" y="${y + 13}" text-anchor="end" class="ec-t">${esc(corta(x.l, 26))}</text>
        ${x.g ? `<rect x="${L}" y="${y + 1}" width="${ancho(x.g)}" height="16" rx="3" style="fill:${COL.gris};opacity:.45"/>` : ""}
        <rect x="${L}" y="${y + 4}" width="${ancho(x.v)}" height="10" rx="3" style="fill:${x.c || COL.main}"/>
        <text x="${L + ancho(Math.max(x.v, x.g || 0)) + 6}" y="${y + 13}" class="ec-t ec-v">${esc(fmt(x.v))}</text>`;
    }).join("")}</svg>`;
  }
  // Barras que salen de un eje central (positivo a la derecha, negativo a la izquierda): [{l, v, c}].
  function divergente(items, fmt) {
    if (!items.length) return `<div class="ec-graf-vacio">Sin datos</div>`;
    const W = 560, L = 160, R = 16, h = 34, H = items.length * h + 8;
    const max = Math.max(0.01, ...items.map(x => Math.abs(x.v)));
    const mitad = (W - L - R) / 2, cx = L + mitad, esc2 = v => (mitad - 54) * Math.abs(v) / max;
    return `<svg viewBox="0 0 ${W} ${H}" class="ec-svg" role="img">
      <line x1="${cx}" x2="${cx}" y1="0" y2="${H}" class="ec-base"/>
      ${items.map((x, i) => { const y = i * h + 6, w = esc2(x.v), x0 = x.v < 0 ? cx - w : cx;
        return `<text x="${L - 8}" y="${y + 15}" text-anchor="end" class="ec-t">${esc(x.l)}</text>
          <rect x="${x0}" y="${y + 4}" width="${Math.max(1, w)}" height="14" rx="3" style="fill:${x.c}"/>
          <text x="${x.v < 0 ? x0 - 6 : x0 + w + 6}" y="${y + 15}" text-anchor="${x.v < 0 ? "end" : "start"}" class="ec-t ec-v">${esc(fmt(x.v))}</text>`; }).join("")}
    </svg>`;
  }
  // Columnas agrupadas: cats = etiquetas, series = [{c, vals}]. Acepta negativos.
  function columnas(cats, series, fmt, fmtEje) {
    fmtEje = fmtEje || usdCorto;
    if (!cats.length) return `<div class="ec-graf-vacio">Sin datos</div>`;
    const W = 560, H = 210, L = 56, B = 34, T = 12;
    const vals = series.flatMap(s => s.vals).filter(v => v != null);
    const max = Math.max(0, ...vals), min = Math.min(0, ...vals);
    const rango = (max - min) || 1;
    const y = v => T + (H - T - B) * (max - v) / rango;
    const gw = (W - L - 8) / cats.length, bw = Math.min(22, (gw - 10) / series.length);
    const ticks = [0, 1, 2, 3].map(i => min + rango * i / 3);
    return `<svg viewBox="0 0 ${W} ${H}" class="ec-svg" role="img">
      ${ticks.map(t => `<line x1="${L}" x2="${W - 4}" y1="${y(t)}" y2="${y(t)}" class="ec-gl"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" class="ec-t ec-eje">${esc(fmtEje(t))}</text>`).join("")}
      <line x1="${L}" x2="${W - 4}" y1="${y(0)}" y2="${y(0)}" class="ec-base"/>
      ${cats.map((c, i) => {
        const x0 = L + 4 + i * gw + (gw - bw * series.length) / 2;
        return series.map((s, j) => { const v = s.vals[i]; if (v == null) return "";
          const y1 = Math.min(y(v), y(0)), hh = Math.max(1, Math.abs(y(v) - y(0)));
          return `<rect x="${x0 + j * bw}" y="${y1}" width="${bw - 3}" height="${hh}" rx="3" style="fill:${s.c}"><title>${esc(c)}: ${esc(fmt(v))}</title></rect>`; }).join("") +
          `<text x="${L + 4 + i * gw + gw / 2}" y="${H - B + 16}" text-anchor="middle" class="ec-t ec-eje">${esc(corta(c, Math.max(6, Math.floor(gw / 6.5))))}</text>`;
      }).join("")}</svg>`;
  }
  // Líneas: labels + series [{c, vals, dash}]. Marca el mes del evento.
  function lineas(labels, series, fmt, marca) {
    const vals = series.flatMap(s => s.vals || []).filter(v => v != null);
    if (!vals.length) return `<div class="ec-graf-vacio">Sin datos</div>`;
    const W = 560, H = 200, L = 56, B = 30, T = 12;
    const max = Math.max(1, ...vals);
    const x = i => L + 6 + (W - L - 16) * i / Math.max(1, labels.length - 1);
    const y = v => T + (H - T - B) * (1 - v / max);
    const ticks = [0, 1, 2, 3].map(i => max * i / 3);
    return `<svg viewBox="0 0 ${W} ${H}" class="ec-svg" role="img">
      ${ticks.map(t => `<line x1="${L}" x2="${W - 4}" y1="${y(t)}" y2="${y(t)}" class="ec-gl"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" class="ec-t ec-eje">${esc(fmt(t))}</text>`).join("")}
      ${marca != null ? `<line x1="${x(marca)}" x2="${x(marca)}" y1="${T - 4}" y2="${H - B}" class="ec-marca"/>` : ""}
      ${series.filter(s => s.vals).map(s => {
        const pts = s.vals.map((v, i) => v == null ? null : [x(i), y(v)]);
        let d = "", pen = false;
        pts.forEach(p => { if (!p) { pen = false; return; } d += `${pen ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)} `; pen = true; });
        return `<path d="${d}" fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" style="stroke:${s.c}" ${s.dash ? 'stroke-dasharray="5 4"' : ""}/>` +
          pts.map((p, i) => p ? `<circle cx="${p[0]}" cy="${p[1]}" r="3" style="fill:${s.c}"><title>${esc(labels[i])}: ${esc(fmt(s.vals[i]))}</title></circle>` : "").join("");
      }).join("")}
      ${labels.map((l, i) => `<text x="${x(i)}" y="${H - B + 16}" text-anchor="middle" class="ec-t ec-eje ${i === marca ? "ec-marca-t" : ""}">${esc(l)}</text>`).join("")}
    </svg>`;
  }
  const tarjeta = (tit, sub, cuerpo) => `<section class="ec-card"><h3>${esc(tit)}</h3>${sub ? `<p class="ec-card-sub">${sub}</p>` : ""}${cuerpo}</section>`;
  const kpi = (v, l, sub, cls) => `<div class="mh-kpi"><b class="${cls || ""}">${v}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
  const tono = x => x == null ? "" : x > 0 ? "ok" : x < 0 ? "no" : "";

  /* ======================= PINTAR ======================= */
  function pintar() {
    const c = caja(); if (!c) return;
    if (!CARGADO && !ERROR) { c.innerHTML = `<div class="empty">Cargando eventos…</div>`; return; }
    if (ERROR === "sql") {
      c.innerHTML = `<div class="res-intro">Falta preparar la base: hay que correr <b>supabase/sql/2026-10-15-eventos-clientes.sql</b> en Supabase → SQL Editor.</div>`;
      return;
    }
    if (ERROR) { c.innerHTML = `<div class="empty">No se pudieron traer los eventos. Revisá la conexión.<br><button class="btn-ghost" data-ec="reintentar">Reintentar</button></div>`; return; }
    if (ABIERTO && ABIERTO !== "nuevo" && !EVS.some(e => e.id === ABIERTO)) ABIERTO = null;
    c.innerHTML = ABIERTO ? `<div class="ec-detalle"></div>` : `<div class="ec-tablero"></div>`;
    if (ABIERTO) pintarDetalle(); else pintarTablero();
  }

  const ventanaChips = () => `<div class="ec-ventana" role="group" aria-label="Ventana de medición">
    <span>Compras a</span>${VENTANAS.map(n => `<button class="${VENTANA === n ? "on" : ""}" data-ec="ventana" data-n="${n}">${n} días</button>`).join("")}</div>`;
  const lineaVentas = () => RANGO
    ? `Ventas cargadas del ${fechaLarga(RANGO.desde)} al <b>${fechaLarga(RANGO.hasta)}</b> · ${plural(RANGO.clientes || CLI.size, "cliente")}`
    : `<b class="ec-falta">Sin ventas cargadas</b>`;

  /* ---------- TABLERO ---------- */
  const anioDe = ev => String(ev.fecha || ev.creado || "").slice(0, 4);
  const delFiltro = () => EVS.filter(e => (!ANIO || anioDe(e) === ANIO) && (!FORMATO || e.formato === FORMATO));
  function pintarTablero() {
    const w = caja().querySelector(".ec-tablero"); if (!w) return;
    const anios = [...new Set([String(new Date().getFullYear()), ...EVS.map(anioDe).filter(Boolean)])].sort().reverse();
    const evs = delFiltro();
    const ks = evs.map(e => calcular(e, VENTANA));
    // En los gráficos los eventos van en orden cronológico; en la tabla, el más nuevo arriba.
    const conDatos = ks.filter(k => k.antes).sort((a, b) => a.ev.fecha.localeCompare(b.ev.fecha));
    const S = f => ks.reduce((s, k) => s + (f(k) || 0), 0);
    const inv = S(k => k.lista.length), asis = S(k => k.asist.n);
    const comp = S(k => k.asist.compraron), D = S(k => k.asist.despues), A = S(k => k.asist.antes);
    const invUsd = conDatos.reduce((s, k) => s + (k.inv.usd || 0), 0);
    const incr = conDatos.reduce((s, k) => s + k.asist.dif, 0);
    const nA = S(k => k.noAsist.antes), nD = S(k => k.noAsist.despues);
    const formatos = [...new Set([...FORMATOS, ...EVS.map(e => e.formato).filter(Boolean)])];

    w.innerHTML = `
      <header class="mh">
        <div class="mh-top">
          <div class="mh-tit"><h1>Eventos con clientes</h1><p class="mh-sub"><span>Qué distribuidores vinieron y cuánto compraron después</span><span>${lineaVentas()}</span></p></div>
          <div class="mh-acc ec-no-print">
            <details class="mh-mas"><summary class="btn-ghost">⋯ Más</summary><div class="mh-mas-menu">
              <button data-ec="importar">⬆ Actualizar ventas (CSV del sistema)</button>
              <button data-ec="excel">⬇ Descargar Excel</button>
              <button data-ec="pdf">⬇ Descargar PDF</button>
            </div></details>
            <button class="btn-ghost" data-ec="excel" title="Descargar Excel">⬇ Excel</button>
            <button class="btn-primary" data-ec="nuevo">＋ Nuevo evento</button>
          </div>
        </div>
        <input type="file" class="ec-csv" accept=".csv,text/csv" hidden>
        ${evs.length ? `<div class="mh-kpis">
          ${kpi(evs.length, plural(evs.length, "evento").replace(/^\d+ /, ""), ANIO ? `en ${ANIO}` : "en total")}
          ${kpi(`${asis}<small>/${inv}</small>`, "clientes asistieron", inv ? `${pctN(asis / inv)} de los invitados` : "")}
          ${kpi(comp, "compraron después", asis ? `${pctN(comp / asis)} de los que vinieron` : "")}
          ${kpi(usd(D), `compras a ${VENTANA} días`, "de los que vinieron")}
          ${kpi(signo(incr), "incremental", A ? `${pct((D - A) / A)} vs. antes · no vinieron ${nA ? pct((nD - nA) / nA) : "—"}` : "", tono(incr))}
          ${kpi(invUsd ? veces(incr / invUsd) : "—", "retorno", invUsd ? `sobre ${usd(invUsd)} invertidos` : "cargá la inversión", tono(incr))}
          ${kpi(S(k => k.nuevos), "nuevos o reactivados", "clientes que volvieron a comprar")}
        </div>` : ""}
      </header>
      <div class="mh-bar ec-bar ec-no-print">
        <select class="ac-sel" data-f="anio" aria-label="Año"><option value="">Todos los años</option>${anios.map(a => `<option ${ANIO === a ? "selected" : ""}>${a}</option>`).join("")}</select>
        <select class="ac-sel" data-f="formato" aria-label="Formato"><option value="">Todos los formatos</option>${formatos.map(f => `<option ${FORMATO === f ? "selected" : ""}>${esc(f)}</option>`).join("")}</select>
        ${ventanaChips()}
        <span class="ec-nota" role="status"></span>
      </div>
      ${!RANGO ? `<div class="res-intro">Para medir las compras, subí el <b>Reporte de ventas</b> del sistema (CSV) desde <b>⋯ Más → Actualizar ventas</b>. Se puede volver a subir cuando quieras: reemplaza el período que trae el archivo.</div>` : ""}
      ${!EVS.length ? `<div class="res-intro">Todavía no hay eventos. Creá el primero con <b>＋ Nuevo evento</b>, sumale los clientes invitados y marcá quiénes vinieron.</div>` : ""}
      ${evs.length ? `<div class="ec-grid">
        ${tarjeta("Embudo", `De invitados a compradores · ${VENTANA} días`, barrasH([
          { l: "Invitados", v: inv, c: COL.gris }, { l: "Inscriptos", v: S(k => k.inscriptos), c: COL.soft },
          { l: "Asistieron", v: asis, c: COL.soft }, { l: "Compraron después", v: comp }], v => String(Math.round(v))))}
        ${tarjeta("Compras antes y después, por evento", `US$ · ${VENTANA} días antes vs. ${VENTANA} días después, clientes que vinieron`,
          leyenda([["Antes", COL.gris], ["Después", COL.main]]) +
          columnas(conDatos.map(k => k.ev.titulo || "Sin nombre"), [{ c: COL.gris, vals: conDatos.map(k => k.asist.antes) }, { c: COL.main, vals: conDatos.map(k => k.asist.despues) }], usd))}
        ${tarjeta("Incremental vs. inversión", "US$ por evento",
          leyenda([["Inversión", COL.gris], ["Incremental", COL.main]]) +
          columnas(conDatos.map(k => k.ev.titulo || "Sin nombre"), [{ c: COL.gris, vals: conDatos.map(k => k.inv.usd) }, { c: COL.main, vals: conDatos.map(k => k.asist.dif) }], usd))}
        ${tarjeta("Clientes que más compraron después de un evento", `US$ a ${VENTANA} días · suma de todos los eventos a los que fueron`,
          barrasH(ranking(ks).slice(0, 10).map(r => ({ l: r.nombre, v: r.despues, g: r.antes })), usd) + leyenda([["Antes (fondo)", COL.gris], ["Después", COL.main]]))}
      </div>` : ""}
      ${evs.length ? `<section class="ec-card ec-tabla-card"><h3>Eventos</h3>
        <div class="ec-tabla-wrap"><table class="ec-tabla">
          <thead><tr><th>Evento</th><th>Fecha</th><th class="n">Invitados</th><th class="n">Asistieron</th><th class="n">Compraron</th><th class="n">Antes</th><th class="n">Después</th><th class="n">Incremental</th><th class="n">Retorno</th></tr></thead>
          <tbody>${ks.map(k => `<tr data-abrir="${k.ev.id}" tabindex="0">
            <td><b>${esc(k.ev.titulo) || "<i>Sin nombre</i>"}</b>${k.ev.formato ? `<small>${esc(k.ev.formato)}${k.ev.lugar ? " · " + esc(k.ev.lugar) : ""}</small>` : ""}</td>
            <td>${esc(fechaLarga(k.ev.fecha)) || "—"}</td>
            <td class="n">${k.lista.length}</td>
            <td class="n">${k.asist.n}${k.lista.length ? ` <small>${pctN(k.asist.n / k.lista.length)}</small>` : ""}</td>
            <td class="n">${k.antes ? k.asist.compraron : "—"}</td>
            <td class="n">${k.antes ? usd(k.asist.antes) : "—"}</td>
            <td class="n">${k.antes ? usd(k.asist.despues) : "—"}${k.antes && k.dias < VENTANA ? ` <small title="Todavía no pasaron ${VENTANA} días">${k.dias} d</small>` : ""}</td>
            <td class="n ${k.antes ? tono(k.asist.dif) : ""}">${k.antes ? signo(k.asist.dif) : "—"}</td>
            <td class="n">${k.retorno != null ? veces(k.retorno) : "—"}</td></tr>`).join("")}</tbody>
        </table></div></section>` : ""}
      ${evs.length ? (() => { const rk = ranking(ks); return rk.length ? `<section class="ec-card ec-tabla-card"><h3>Clientes en eventos</h3>
        <p class="ec-card-sub">Cada cliente con los eventos a los que fue y lo que compró antes y después (suma de los eventos, ${VENTANA} días)</p>
        <div class="ec-tabla-wrap"><table class="ec-tabla">
          <thead><tr><th>Cliente</th><th>Vendedor</th><th class="n">Invitado</th><th class="n">Asistió</th><th class="n">Antes</th><th class="n">Después</th><th class="n">Diferencia</th></tr></thead>
          <tbody>${rk.slice(0, 40).map(r => `<tr><td><b>${esc(r.nombre)}</b>${r.razon && r.razon !== r.nombre ? `<small>${esc(r.razon)}</small>` : ""}</td>
            <td>${esc(r.vendedor)}</td><td class="n">${r.invitado}</td><td class="n">${r.asistio}</td>
            <td class="n">${usd(r.antes)}</td><td class="n">${usd(r.despues)}</td><td class="n ${tono(r.dif)}">${signo(r.dif)}</td></tr>`).join("")}</tbody>
        </table></div>${rk.length > 40 ? `<p class="ec-card-sub">Y ${rk.length - 40} más en el Excel.</p>` : ""}</section>` : ""; })() : ""}`;
    pintarNota();
  }
  // Clientes que fueron a algún evento (de los filtrados), con las compras sumadas de esos eventos.
  function ranking(ks) {
    const m = new Map();
    ks.forEach(k => k.filas.forEach(r => {
      const key = r.x.cuit || "n:" + low(r.nombre);
      const o = m.get(key) || { nombre: r.nombre, razon: r.razon, vendedor: r.vendedor, cuit: r.x.cuit || "", invitado: 0, asistio: 0, antes: 0, despues: 0 };
      o.invitado++;
      if (r.x.asistio) { o.asistio++; o.antes += r.antes; o.despues += r.despues; }
      m.set(key, o);
    }));
    return [...m.values()].filter(o => o.asistio).map(o => Object.assign(o, { dif: o.despues - o.antes }))
      .sort((a, b) => b.despues - a.despues || b.asistio - a.asistio);
  }

  /* ---------- EVENTO ---------- */
  const eventoAbierto = () => ABIERTO === "nuevo" ? BORRADOR : EVS.find(e => e.id === ABIERTO);
  function pintarDetalle() {
    const w = caja().querySelector(".ec-detalle"); if (!w) return;
    const ev = eventoAbierto(); if (!ev) return pintar();
    const nuevo = ABIERTO === "nuevo";
    const puedeBorrar = !nuevo && (esAdmin() || low(ev.autor_email) === yo());
    const formatos = [...new Set([...FORMATOS, ev.formato].filter(Boolean))];
    const accs = ACCS.slice().sort((a, b) => (b.tipo === "Evento") - (a.tipo === "Evento"));
    const invAcc = inversion(Object.assign({}, ev, { inversion_usd: null }));
    w.innerHTML = `
      <div class="ec-d-top ec-no-print">
        <button class="btn-ghost" data-ec="volver">← Eventos con clientes</button>
        <span class="ec-nota" role="status"></span>
        ${!nuevo ? `<button class="btn-ghost" data-ec="excel">⬇ Excel</button><button class="btn-ghost" data-ec="pdf">⬇ PDF</button>` : ""}
        ${puedeBorrar ? `<button class="btn-ghost ec-borrar" data-ec="borrar">Eliminar</button>` : ""}
      </div>
      <section class="ec-card ec-datos">
        <input class="ec-titulo" data-campo="titulo" placeholder="Nombre del evento (ej. Showroom con distribuidores zona norte)" value="${esc(ev.titulo)}" aria-label="Nombre del evento">
        <div class="ec-campos">
          <label><span>Fecha</span><input type="date" data-campo="fecha" value="${esc(ev.fecha || "")}"></label>
          <label><span>Formato</span><select data-campo="formato"><option value="">—</option>${formatos.map(f => `<option ${ev.formato === f ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></label>
          <label><span>Lugar</span><input data-campo="lugar" value="${esc(ev.lugar)}" placeholder="Showroom Palermo"></label>
          <label class="ancho"><span>Acción vinculada</span><select data-campo="accion_id"><option value="">Sin vincular</option>${accs.map(a => `<option value="${a.id}" ${ev.accion_id === a.id ? "selected" : ""}>${esc(a.titulo)}${a.tipo ? ` (${esc(a.tipo)})` : ""}</option>`).join("")}</select></label>
          <label><span>Inversión (US$)</span><input type="number" min="0" step="1" data-campo="inversion_usd" value="${num(ev.inversion_usd) == null ? "" : num(ev.inversion_usd)}" placeholder="${invAcc.usd != null ? Math.round(invAcc.usd) : "0"}"></label>
        </div>
        <p class="ec-ayuda ec-inv-ayuda">${ayudaInv(ev)}</p>
        <textarea data-campo="notas" rows="2" placeholder="Notas: objetivo, qué se mostró, condiciones especiales que se ofrecieron…">${esc(ev.notas)}</textarea>
        ${nuevo ? `<div class="ec-crear"><button class="btn-primary" data-ec="crear">Crear evento</button><span class="ec-ayuda">Después le sumás los clientes.</span></div>` : ""}
      </section>
      ${nuevo ? "" : `<div class="ec-analisis"></div><section class="ec-card ec-clientes"></section>`}`;
    pintarNota();
    if (!nuevo) { pintarAnalisis(); pintarClientes(); asegurarDatos(ev); }
  }

  // De dónde sale la inversión cuando no se cargó a mano.
  function ayudaInv(ev) {
    const i = inversion(Object.assign({}, ev, { inversion_usd: null }));
    return num(ev.inversion_usd) == null && i.origen
      ? `Inversión ${esc(i.origen)}${i.usd != null ? `: <b>${usd(i.usd)}</b>` : ""}. Si escribís un monto, manda ese.` : "";
  }
  function pintarAyudaInv() {
    const ev = eventoAbierto(), p = caja().querySelector(".ec-inv-ayuda"); if (!ev || !p) return;
    p.innerHTML = ayudaInv(ev);
    const i = inversion(Object.assign({}, ev, { inversion_usd: null })), inp = caja().querySelector('[data-campo="inversion_usd"]');
    if (inp) inp.placeholder = i.usd != null ? Math.round(i.usd) : "0";
  }
  // Trae lo que falte para el análisis (ventas de sus clientes, base, TC) y repinta.
  async function asegurarDatos(ev) {
    const cuits = (INV[ev.id] || []).map(x => x.cuit).filter(Boolean);
    const necesita = cuits.some(c => !VENTAS.has(c));
    try {
      await Promise.all([
        cargarVentas(cuits),
        ev.fecha && accionDe(ev) && (accionDe(ev).moneda || "ARS") !== "USD" ? tcCerca(ev.fecha) : null,
      ]);
      const k = calcular(ev, VENTANA);
      const yaBase = !k.antes || BASE[claveBase(ev, k)];
      if (!yaBase) await traerBase(ev, k);
      if (ABIERTO === ev.id && (necesita || !yaBase || accionDe(ev))) { pintarAyudaInv(); pintarAnalisis(); pintarClientes(); }
    } catch (e) { nota("No se pudieron traer las ventas de los clientes.", true); }
  }

  function pintarAnalisis() {
    const w = caja().querySelector(".ec-analisis"); if (!w) return;
    const ev = eventoAbierto(); if (!ev) return;
    const k = calcular(ev, VENTANA);
    const cargando = k.lista.some(x => x.cuit && !VENTAS.has(x.cuit));
    if (!k.lista.length) { w.innerHTML = `<div class="res-intro">Sumá abajo los clientes que invitaste y marcá quiénes vinieron: acá aparecen sus compras antes y después del evento.</div>`; return; }
    const encab = `<div class="ec-bar ec-no-print">${ventanaChips()}${k.antes ? `<span class="ec-ayuda">Antes: ${fechaLarga(k.antes[0])} → ${fechaLarga(k.antes[1])} · Después: ${fechaLarga(k.despues[0])} → ${fechaLarga(k.despues[1])}${k.dias < VENTANA ? ` · <b>sólo ${k.dias} días con datos</b>` : ""}</span>` : ""}</div>`;
    const kpisAsis = `<div class="mh-kpis">
        ${kpi(`${k.asist.n}<small>/${k.lista.length}</small>`, "clientes asistieron", `${k.inscriptos} inscriptos · ${plural(k.personas, "persona")}`)}
        ${k.antes ? `
        ${kpi(k.asist.compraron, "compraron después", k.asist.n ? `${pctN(k.asist.compraron / k.asist.n)} de los que vinieron` : "")}
        ${kpi(usd(k.asist.despues), `compras a ${k.dias} días`, `antes: ${usd(k.asist.antes)}`)}
        ${kpi(signo(k.asist.dif), "incremental", `${pct(k.asist.crec)} vs. antes`, tono(k.asist.dif))}
        ${kpi(k.asist.facturas ? usd(k.asist.despues / k.asist.facturas) : "—", "ticket promedio", plural(k.asist.facturas, "factura"))}
        ${kpi(k.retorno != null ? veces(k.retorno) : "—", "retorno", k.inv.usd ? `sobre ${usd(k.inv.usd)} invertidos` : "cargá la inversión", tono(k.retorno))}
        ${kpi(k.nuevos, "nuevos o reactivados", "sin compras en el año previo")}` : ""}
      </div>`;
    if (!k.antes) { w.innerHTML = encab + kpisAsis + `<div class="res-intro">${esc(k.falta)}</div>`; return; }
    const ev2 = evolucion(k);
    const fams = Object.entries(k.famAsist).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const top = k.filas.filter(r => r.x.asistio && (r.despues > 0 || r.antes > 0)).sort((a, b) => b.despues - a.despues).slice(0, 10);
    const crec = [["Vinieron", k.asist.crec], ["No vinieron", k.noAsist.n ? k.noAsist.crec : null], ["Resto de los clientes", k.base ? k.base.crec : null]];
    w.innerHTML = encab + kpisAsis + (cargando ? `<p class="ec-ayuda">Trayendo las ventas de los clientes…</p>` : "") + `
      <div class="ec-grid">
        ${tarjeta("Quiénes compraron después", `US$ a ${k.dias} días · clientes que vinieron`,
          top.length ? barrasH(top.map(r => ({ l: r.nombre, v: r.despues, g: r.antes })), usd) + leyenda([["Antes (fondo)", COL.gris], ["Después", COL.main]])
                     : `<div class="ec-graf-vacio">Ninguno de los que vinieron compró en la ventana.</div>`)}
        ${tarjeta("¿Movió algo el evento?", "Crecimiento de las compras: después vs. antes",
          divergente(crec.filter(c => c[1] != null).map(([l, v], i) => ({ l, v, c: i ? COL.gris : COL.main })), pct) +
          `<p class="ec-ayuda">${crecTexto(k)}</p>`)}
        ${tarjeta("Evolución mensual", "Compra promedio por cliente, 6 meses antes y después",
          leyenda([["Vinieron", COL.main], ["No vinieron", COL.gris, true]]) +
          lineas(ev2.labels, [{ c: COL.main, vals: ev2.asist }, { c: COL.gris, vals: ev2.noAsist, dash: true }], usdCorto, 6))}
        ${tarjeta("Qué compraron", `Por familia · US$ a ${k.dias} días, clientes que vinieron`,
          barrasH(fams.map(([l, v]) => ({ l, v })), usd))}
      </div>`;
  }
  // Texto que acompaña al gráfico de crecimiento (las barras no muestran negativos).
  function crecTexto(k) {
    const p = [`Los que vinieron: <b>${pct(k.asist.crec)}</b>`];
    if (k.noAsist.n) p.push(`los invitados que no vinieron: <b>${pct(k.noAsist.crec)}</b>`);
    if (k.base) p.push(`el resto de los clientes: <b>${pct(k.base.crec)}</b>`);
    const dif = k.base && k.asist.crec != null && k.base.crec != null ? k.asist.crec - k.base.crec : null;
    return p.join(" · ") + (dif != null ? `. ${dif >= 0 ? "Crecieron" : "Quedaron"} <b>${Math.abs(Math.round(dif * 100))} puntos ${dif >= 0 ? "por encima" : "por debajo"}</b> del resto.` : ".");
  }

  function pintarClientes() {
    const w = caja().querySelector(".ec-clientes"); if (!w) return;
    const ev = eventoAbierto(); if (!ev) return;
    const k = calcular(ev, VENTANA);
    const conVentas = !!k.antes;
    const F = {
      todos: () => true, asistieron: r => r.x.asistio, no: r => !r.x.asistio,
      compraron: r => r.x.asistio && r.despues > 0, nuevos: r => r.x.asistio && !!r.tipo,
    };
    // Orden fijo (no depende de los tildes): al marcar "Asistió" la fila no salta de lugar.
    const filas = k.filas.filter(F[CFILTRO] || F.todos).sort((a, b) =>
      (b.despues - a.despues) || a.nombre.localeCompare(b.nombre, "es"));
    const conFoco = document.activeElement && document.activeElement.classList.contains("ec-busca-cli");
    const chip = (key, t) => `<button class="ac-chip ${CFILTRO === key ? "on" : ""}" data-ec="cfiltro" data-k="${key}">${t} <span class="c">${k.filas.filter(F[key]).length}</span></button>`;
    w.innerHTML = `
      <div class="ec-cli-top">
        <h3>Clientes del evento</h3>
        <div class="ec-agregar ec-no-print">
          <input type="search" class="ec-busca-cli" placeholder="Sumar cliente: nombre, razón social o CUIT" autocomplete="off" value="${esc(BUSCA_CLI)}" aria-label="Buscar cliente para sumar">
          <div class="ec-sug" role="listbox"></div>
        </div>
        <button class="btn-ghost ec-no-print" data-ec="pegar" title="Pegar una lista de CUITs o nombres">Pegar lista</button>
      </div>
      <div class="mh-chips ac-chips ec-no-print">
        ${chip("todos", "Todos")}${chip("asistieron", "Asistieron")}${chip("no", "No vinieron")}${conVentas ? chip("compraron", "Compraron") + chip("nuevos", "Nuevos / reactivados") : ""}
      </div>
      ${!k.filas.length ? `<p class="ec-ayuda">Buscá arriba a los distribuidores que invitaste. Salen de las ventas cargadas (por eso hace falta el CUIT); si alguno nunca compró, escribí su nombre y sumalo igual.</p>` : `
      <div class="ec-tabla-wrap"><table class="ec-tabla ec-cli">
        <thead><tr><th>Cliente</th><th>Vendedor</th><th class="c">Inscripto</th><th class="c">Asistió</th><th class="c">Personas</th>
          ${conVentas ? `<th class="n">Antes</th><th class="n">Después</th><th class="n">Diferencia</th>` : ""}<th class="ec-no-print"></th></tr></thead>
        <tbody>${filas.map(r => `<tr class="${r.x.asistio ? "si" : "no"}">
          <td><b>${esc(r.nombre)}</b>${r.tipo ? ` <span class="ec-tag ${r.tipo}">${r.tipo}</span>` : ""}<small>${esc([r.razon !== r.nombre ? r.razon : "", r.x.cuit || "sin CUIT"].filter(Boolean).join(" · "))}</small></td>
          <td>${esc(r.vendedor)}</td>
          <td class="c"><input type="checkbox" data-inv="${r.x.id}" data-k="inscripto" ${r.x.inscripto ? "checked" : ""} aria-label="Inscripto"></td>
          <td class="c"><input type="checkbox" data-inv="${r.x.id}" data-k="asistio" ${r.x.asistio ? "checked" : ""} aria-label="Asistió"></td>
          <td class="c"><input type="number" min="0" step="1" class="ec-personas" data-inv="${r.x.id}" data-k="personas" value="${num(r.x.personas) == null ? "" : r.x.personas}" placeholder="${r.x.asistio ? "1" : ""}" aria-label="Personas"></td>
          ${conVentas ? `<td class="n">${usd(r.antes)}</td><td class="n"><b>${usd(r.despues)}</b></td><td class="n ${tono(r.dif)}">${signo(r.dif)}</td>` : ""}
          <td class="ec-no-print"><button class="ac-mini" data-ec="quitar" data-id="${r.x.id}" title="Quitar del evento" aria-label="Quitar del evento">✕</button></td>
        </tr>`).join("")}</tbody>
      </table></div>`}`;
    pintarSugerencias();
    if (conFoco) { const t = w.querySelector(".ec-busca-cli"); t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
  }

  /* ---- Sumar clientes ---- */
  function sugerencias() {
    const q = sinTildes(BUSCA_CLI.trim()); if (q.length < 2) return [];
    const ev = eventoAbierto(); const ya = new Set((INV[ev && ev.id] || []).map(x => x.cuit));
    const qn = q.replace(/\D/g, "");
    return [...CLI.values()].filter(c => !ya.has(c.cuit) &&
      (sinTildes(`${c.nombre} ${c.razon_social}`).includes(q) || (qn.length >= 4 && c.cuit.replace(/\D/g, "").includes(qn))))
      .sort((a, b) => String(b.ultima_compra || "").localeCompare(String(a.ultima_compra || ""))).slice(0, 8);
  }
  function pintarSugerencias() {
    const d = caja().querySelector(".ec-sug"); if (!d) return;
    const q = BUSCA_CLI.trim();
    if (q.length < 2) { d.innerHTML = ""; d.classList.remove("on"); return; }
    const s = sugerencias();
    d.innerHTML = s.map(c => `<button type="button" data-ec="sumar" data-cuit="${esc(c.cuit)}">
        <b>${esc(c.nombre || c.razon_social)}</b><small>${esc(c.razon_social !== c.nombre ? c.razon_social + " · " : "")}${esc(c.cuit)}${c.vendedor ? " · " + esc(c.vendedor) : ""}${c.ultima_compra ? " · últ. compra " + esc(fechaLarga(c.ultima_compra)) : ""}</small></button>`).join("") +
      `<button type="button" data-ec="sumar-libre" class="libre">＋ Sumar «${esc(q)}» como cliente sin compras</button>`;
    d.classList.add("on");
  }
  async function sumar(filas) {
    const ev = eventoAbierto(); if (!ev || !filas.length) return;
    try {
      const r = await fetch(url("eventos_clientes_inv"), { method: "POST", headers: head({ Prefer: "return=representation" }),
        body: JSON.stringify(filas.map(f => Object.assign({ evento_id: ev.id, inscripto: true, asistio: false }, f))) });
      const d = r.ok ? await r.json() : [];
      if (!d.length) throw new Error();
      (INV[ev.id] = INV[ev.id] || []).push(...d);
      BUSCA_CLI = "";
      pintarClientes(); pintarAnalisis();
      const t = caja().querySelector(".ec-busca-cli"); if (t) t.focus();
      asegurarDatos(ev);
    } catch (e) { nota("No se pudo sumar el cliente. ¿Ya estaba en el evento?", true); }
  }
  const filaDe = c => ({ cuit: c.cuit, razon_social: c.razon_social || "", nombre: c.nombre || "" });
  async function pegarLista() {
    const t = prompt("Pegá los CUITs o nombres de los clientes, uno por renglón (sirve copiar una columna de Excel):");
    if (!t) return;
    const ev = eventoAbierto(); const ya = new Set((INV[ev.id] || []).map(x => x.cuit));
    const clis = [...CLI.values()];
    const ok = [], no = [];
    t.split(/\r?\n|;/).map(s => s.trim()).filter(Boolean).forEach(s => {
      const dig = s.replace(/\D/g, "");
      const q = sinTildes(s);
      const c = (dig.length === 11 && clis.find(x => x.cuit.replace(/\D/g, "") === dig)) ||
        clis.find(x => sinTildes(x.nombre) === q || sinTildes(x.razon_social) === q);
      if (c) { if (!ya.has(c.cuit) && !ok.some(o => o.cuit === c.cuit)) ok.push(filaDe(c)); } else no.push(s);
    });
    if (ok.length) await sumar(ok);
    nota(`${plural(ok.length, "cliente sumado", "clientes sumados")}${no.length ? ` · sin encontrar: ${no.slice(0, 5).join(", ")}${no.length > 5 ? "…" : ""}` : ""}`, !!no.length);
  }
  async function guardarInv(id, campos) {
    const ev = eventoAbierto(); const x = (INV[ev.id] || []).find(y => y.id === id); if (!x) return;
    const antes = Object.assign({}, x); Object.assign(x, campos);
    pintarAnalisis();
    try {
      const r = await fetch(url(`eventos_clientes_inv?id=eq.${enc(id)}`), { method: "PATCH", headers: head({ Prefer: "return=representation" }), body: JSON.stringify(campos) });
      const d = r.ok ? await r.json() : []; if (!d.length) throw new Error();
    } catch (e) { Object.assign(x, antes); nota("No se pudo guardar. Revisá la conexión.", true); pintarClientes(); pintarAnalisis(); }
  }
  async function quitar(id) {
    const ev = eventoAbierto(); const l = INV[ev.id] || []; const x = l.find(y => y.id === id); if (!x) return;
    try {
      const r = await fetch(url(`eventos_clientes_inv?id=eq.${enc(id)}`), { method: "DELETE", headers: head({ Prefer: "return=representation" }) });
      const d = r.ok ? await r.json() : []; if (!d.length) throw new Error();
      INV[ev.id] = l.filter(y => y.id !== id);
      pintarClientes(); pintarAnalisis();
    } catch (e) { nota("No se pudo quitar.", true); }
  }

  /* ---- Evento: crear / guardar / borrar ---- */
  function nuevo() {
    BORRADOR = { id: null, titulo: "", fecha: hoyISO(), lugar: "", formato: "", accion_id: null, inversion_usd: null, notas: "" };
    ABIERTO = "nuevo"; pintar();
    const t = caja().querySelector(".ec-titulo"); if (t) t.focus();
  }
  async function crear() {
    const b = BORRADOR; if (!b) return;
    const t = caja().querySelector(".ec-titulo"); if (t) b.titulo = t.value.trim();
    if (!b.titulo) { nota("Poné un nombre para crear el evento.", true); if (t) t.focus(); return; }
    const cuerpo = Object.assign({}, b, { autor: SES().nombre ? SES().nombre() : "", autor_email: SES().email ? SES().email() : "" });
    delete cuerpo.id;
    try {
      const r = await fetch(url("eventos_clientes"), { method: "POST", headers: head({ Prefer: "return=representation" }), body: JSON.stringify(cuerpo) });
      const d = r.ok ? await r.json() : []; if (!d.length) throw new Error();
      EVS.unshift(d[0]); INV[d[0].id] = [];
      BORRADOR = null; ABIERTO = d[0].id; CFILTRO = "todos";
      nota("Evento creado. Ahora sumale los clientes invitados.");
      pintar();
      const s = caja().querySelector(".ec-busca-cli"); if (s) s.focus();
    } catch (e) { nota("No se pudo crear el evento. ¿Corriste el SQL 2026-10-15-eventos-clientes.sql?", true); }
  }
  async function guardar(campos) {
    if (ABIERTO === "nuevo") { Object.assign(BORRADOR, campos); return true; }
    const ev = eventoAbierto(); if (!ev) return false;
    const antes = {}; Object.keys(campos).forEach(k => { antes[k] = ev[k]; });
    Object.assign(ev, campos);
    try {
      const r = await fetch(url(`eventos_clientes?id=eq.${enc(ev.id)}`), { method: "PATCH", headers: head({ Prefer: "return=representation" }), body: JSON.stringify(campos) });
      const d = r.ok ? await r.json() : []; if (!d.length) throw new Error();
      return true;
    } catch (e) { Object.assign(ev, antes); nota("No se pudo guardar el cambio.", true); pintarDetalle(); return false; }
  }
  async function borrar() {
    const ev = eventoAbierto(); if (!ev) return;
    if (!confirm(`¿Eliminar el evento "${ev.titulo}" y su lista de clientes?\n\nLas ventas no se tocan. No se puede deshacer.`)) return;
    try {
      const r = await fetch(url(`eventos_clientes?id=eq.${enc(ev.id)}`), { method: "DELETE", headers: head({ Prefer: "return=representation" }) });
      const d = r.ok ? await r.json() : []; if (!d.length) throw new Error();
      EVS = EVS.filter(e => e.id !== ev.id); delete INV[ev.id];
      ABIERTO = null; nota("Evento eliminado."); pintar();
    } catch (e) { nota("No se pudo eliminar. Sólo puede hacerlo quien lo creó o un admin.", true); }
  }
  function abrir(id) { ABIERTO = id; CFILTRO = "todos"; BUSCA_CLI = ""; pintar(); window.scrollTo({ top: 0 }); }
  function volver() {
    if (ABIERTO === "nuevo") { const t = caja().querySelector(".ec-titulo"); if (t && t.value.trim() && !confirm("¿Descartar el evento que estabas creando?")) return; }
    ABIERTO = null; BORRADOR = null; BUSCA_CLI = "";
    pintar(); refrescarTablero();
  }
  // El tablero necesita las ventas de TODOS los clientes de eventos.
  async function refrescarTablero() {
    const faltan = todosLosCuits().some(c => !VENTAS.has(c));
    if (!faltan) return;
    nota("Trayendo las ventas de los clientes…", false, true);
    try { await cargarVentas(todosLosCuits()); } catch (e) { return nota("No se pudieron traer las ventas.", true); }
    const accTc = EVS.filter(e => e.fecha && accionDe(e) && (accionDe(e).moneda || "ARS") !== "USD" && num(e.inversion_usd) == null);
    await Promise.all(accTc.map(e => tcCerca(e.fecha)));
    nota("");
    if (!ABIERTO) pintarTablero();
  }

  /* ======================= IMPORTAR VENTAS ======================= */
  // CSV con comillas: un campo entre comillas puede traer ; o saltos de línea (las
  // descripciones de producto los traen). Recorre el texto entero y entrega cada registro.
  function* registros(t, sep) {
    let i = 0; const n = t.length;
    while (i < n) {
      const fila = [];
      for (;;) {
        let v = "";
        if (t[i] === '"') {
          i++;
          for (;;) {
            const j = t.indexOf('"', i);
            if (j < 0) { v += t.slice(i); i = n; break; }
            v += t.slice(i, j);
            if (t[j + 1] === '"') { v += '"'; i = j + 2; } else { i = j + 1; break; }
          }
        } else {
          let j = i; while (j < n && t[j] !== sep && t[j] !== "\n" && t[j] !== "\r") j++;
          v = t.slice(i, j); i = j;
        }
        fila.push(v);
        if (t[i] === sep) { i++; continue; }
        if (t[i] === "\r") i++;
        if (t[i] === "\n") i++;
        break;
      }
      yield fila;
    }
  }
  const numAR = s => { s = String(s || "").trim(); if (!s) return 0; if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); const n = Number(s); return isNaN(n) ? 0 : n; };
  const fechaISO = s => { s = String(s || "").trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    return ""; };
  // El sistema a veces trae el mismo CUIT con y sin guiones: se guarda siempre como XX-XXXXXXXX-X.
  const cuitNorm = s => { const d = String(s || "").replace(/\D/g, "");
    return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : d || String(s || "").trim(); };
  const COLS = { fecha: "fechaemision", cuit: "fiscalclientecuit", razon: "fiscalclienterazonsocial", nombre: "empresa",
                 vendedor: "vendedor", usd: "importefacturanetousd", familia: "nombre_familia", nro: "facturanumero",
                 tipo: "talonariotipo", tc: "tipo_de_cambio" };

  function procesarCSV(texto) {
    texto = texto.replace(/^﻿/, "");
    const l0 = texto.slice(0, Math.max(0, texto.search(/\r?\n/)));
    const sep = (l0.match(/;/g) || []).length >= (l0.match(/,/g) || []).length ? ";" : ",";
    const it = registros(texto, sep);
    const cab = (it.next().value || []).map(h => sinTildes(h).trim());
    const ix = {}; const faltan = [];
    Object.entries(COLS).forEach(([k, h]) => { ix[k] = cab.indexOf(h); if (ix[k] < 0 && !["tc", "familia", "nro", "tipo", "nombre", "vendedor"].includes(k)) faltan.push(h); });
    if (faltan.length) throw new Error(`Al archivo le faltan columnas: ${faltan.join(", ")}. ¿Es el "Reporte de ventas" del sistema?`);
    const dias = new Map(), clis = new Map();
    let filas = 0, desde = "9999", hasta = "";
    let i = 0;
    for (const f of it) {
      i++;
      if (f.length < 2) continue;
      const cuit = cuitNorm(f[ix.cuit]), fecha = fechaISO(f[ix.fecha]);
      if (!cuit || !fecha) continue;
      filas++;
      if (fecha < desde) desde = fecha; if (fecha > hasta) hasta = fecha;
      const key = cuit + "|" + fecha;
      let d = dias.get(key);
      if (!d) { d = { cuit, fecha, usd: 0, facs: new Set(), tcs: 0, ntc: 0, familias: {} }; dias.set(key, d); }
      const u = numAR(f[ix.usd]); d.usd += u;
      const tipo = ix.tipo >= 0 ? f[ix.tipo] || "" : "";
      if (/^F/i.test(tipo) || (!tipo && u > 0)) d.facs.add(`${tipo}|${ix.nro >= 0 ? f[ix.nro] : i}`);
      const tc = ix.tc >= 0 ? numAR(f[ix.tc]) : 0; if (tc > 0) { d.tcs += tc; d.ntc++; }
      const fam = (ix.familia >= 0 && f[ix.familia] || "Sin familia").trim();
      d.familias[fam] = (d.familias[fam] || 0) + u;
      let c = clis.get(cuit);
      if (!c) { c = { cuit, razon_social: "", nombre: "", vendedor: "", primera_compra: fecha, ultima_compra: fecha }; clis.set(cuit, c); }
      if (fecha <= c.primera_compra) c.primera_compra = fecha;
      if (fecha >= c.ultima_compra || !c.razon_social) {
        c.ultima_compra = fecha > c.ultima_compra ? fecha : c.ultima_compra;
        c.razon_social = (f[ix.razon] || "").trim() || c.razon_social;
        if (ix.nombre >= 0) c.nombre = (f[ix.nombre] || "").trim() || c.nombre;
        if (ix.vendedor >= 0) c.vendedor = (f[ix.vendedor] || "").trim() || c.vendedor;
      }
    }
    if (!filas) throw new Error("El archivo no tiene filas de ventas reconocibles.");
    const r2 = v => Math.round(v * 100) / 100;
    const out = [...dias.values()].map(d => {
      const fam = {}; Object.entries(d.familias).forEach(([k, v]) => { if (Math.abs(v) >= 0.01) fam[k] = r2(v); });
      return { cuit: d.cuit, fecha: d.fecha, usd: r2(d.usd), facturas: d.facs.size, tc: d.ntc ? r2(d.tcs / d.ntc) : null, familias: fam };
    });
    return { dias: out, clientes: [...clis.values()], filas, desde, hasta };
  }

  async function importar(file) {
    if (!file || IMPORTANDO) return;
    IMPORTANDO = true;
    try {
      nota(`Leyendo ${file.name}…`, false, true);
      const buf = await file.arrayBuffer();
      // El sistema exporta en Latin-1; si viene en UTF-8 se nota por la cabecera.
      let texto = new TextDecoder("utf-8").decode(buf);
      if (texto.includes("�")) texto = new TextDecoder("windows-1252").decode(buf);
      const p = procesarCSV(texto);
      if (!confirm(`${file.name}\n\n${p.filas.toLocaleString("es-AR")} líneas de factura · ${p.clientes.length} clientes\nDel ${fechaLarga(p.desde)} al ${fechaLarga(p.hasta)}\n\nSe reemplazan las ventas cargadas de ese período. ¿Seguimos?`)) { nota(""); return; }
      const TANDA = 3000;
      for (let i = 0; i < p.dias.length; i += TANDA) {
        nota(`Guardando ventas… ${Math.min(100, Math.round(i / p.dias.length * 100))} %`, false, true);
        await rpc("ventas_importar", { p_desde: p.desde, p_hasta: p.hasta, p_borrar: i === 0,
          p_dias: p.dias.slice(i, i + TANDA), p_clientes: i === 0 ? p.clientes : [] });
      }
      await fetch(url("ventas_importaciones"), { method: "POST", headers: head(), body: JSON.stringify({
        archivo: file.name, desde: p.desde, hasta: p.hasta, filas: p.filas, clientes: p.clientes.length,
        autor_email: SES().email ? SES().email() : "" }) }).catch(() => {});
      VENTAS.clear(); Object.keys(BASE).forEach(k => delete BASE[k]); Object.keys(TCS).forEach(k => delete TCS[k]);
      await traer();
      nota(`Listo: ventas del ${fechaLarga(p.desde)} al ${fechaLarga(p.hasta)} (${p.clientes.length} clientes).`);
      pintar(); if (ABIERTO) { const ev = eventoAbierto(); if (ev && ev.id) asegurarDatos(ev); } else refrescarTablero();
    } catch (e) {
      nota(e && e.message && !/^\d+$/.test(e.message) && e.message.length < 200 ? e.message
        : "No se pudieron guardar las ventas. Si se cortó a la mitad, volvé a subir el mismo archivo.", true);
    } finally { IMPORTANDO = false; }
  }

  /* ======================= DESCARGAS ======================= */
  const nombreArchivo = s => sinTildes(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "evento";
  const filaCliente = (k, r) => [k.ev.titulo, k.ev.fecha || "", r.nombre, r.razon, r.x.cuit || "", r.vendedor,
    r.x.inscripto ? "Sí" : "No", r.x.asistio ? "Sí" : "No", num(r.x.personas) == null ? (r.x.asistio ? 1 : 0) : num(r.x.personas),
    k.antes ? Math.round(r.antes * 100) / 100 : "", k.antes ? Math.round(r.despues * 100) / 100 : "", k.antes ? Math.round(r.dif * 100) / 100 : "", r.tipo];
  const CAB_CLI = ["Evento", "Fecha", "Cliente", "Razón social", "CUIT", "Vendedor", "Inscripto", "Asistió", "Personas",
    "USD antes", "USD después", "USD diferencia", "Nuevo / reactivado"];
  function hoja(wb, nombre, aoa, anchos) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (anchos) ws["!cols"] = anchos.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  }
  async function excel() {
    if (!window.XLSX) { alert("No se pudo cargar el exportador."); return; }
    const wb = XLSX.utils.book_new();
    const ev = ABIERTO && ABIERTO !== "nuevo" ? eventoAbierto() : null;
    if (ev) {
      await cargarVentas((INV[ev.id] || []).map(x => x.cuit));
      const k = calcular(ev, VENTANA);
      hoja(wb, "Resumen", [
        ["Evento", ev.titulo], ["Fecha", ev.fecha || ""], ["Formato", ev.formato], ["Lugar", ev.lugar],
        ["Ventana", k.antes ? `${k.dias} días (antes ${k.antes[0]} a ${k.antes[1]} · después ${k.despues[0]} a ${k.despues[1]})` : k.falta],
        [], ["Invitados", k.lista.length], ["Inscriptos", k.inscriptos], ["Clientes que asistieron", k.asist.n], ["Personas", k.personas],
        ["Compraron después (de los que vinieron)", k.antes ? k.asist.compraron : ""],
        ["USD antes (vinieron)", k.antes ? k.asist.antes : ""], ["USD después (vinieron)", k.antes ? k.asist.despues : ""],
        ["USD incremental (vinieron)", k.antes ? k.asist.dif : ""], ["Crecimiento vinieron", k.asist.crec == null ? "" : k.asist.crec],
        ["Crecimiento no vinieron", k.noAsist.crec == null ? "" : k.noAsist.crec], ["Crecimiento resto de clientes", k.base && k.base.crec != null ? k.base.crec : ""],
        ["Inversión USD", k.inv.usd == null ? "" : Math.round(k.inv.usd)], ["Retorno (incremental / inversión)", k.retorno == null ? "" : k.retorno],
        ["Clientes nuevos o reactivados", k.nuevos],
      ], [38, 60]);
      hoja(wb, "Clientes", [CAB_CLI, ...k.filas.sort((a, b) => b.despues - a.despues).map(r => filaCliente(k, r))], [26, 11, 30, 34, 15, 14, 9, 8, 9, 12, 12, 13, 16]);
      if (k.antes) {
        hoja(wb, "Familias", [["Familia", "USD después (vinieron)"], ...Object.entries(k.famAsist).sort((a, b) => b[1] - a[1]).map(([f, v]) => [f, Math.round(v * 100) / 100])], [28, 22]);
        const e2 = evolucion(k);
        hoja(wb, "Evolución mensual", [["Mes", "Promedio por cliente: vinieron", "Promedio por cliente: no vinieron"],
          ...e2.labels.map((l, i) => [l, e2.asist && e2.asist[i] != null ? Math.round(e2.asist[i]) : "", e2.noAsist && e2.noAsist[i] != null ? Math.round(e2.noAsist[i]) : ""])], [12, 30, 32]);
      }
      XLSX.writeFile(wb, `evento-${nombreArchivo(ev.titulo)}-${hoyISO()}.xlsx`);
      return;
    }
    await cargarVentas(todosLosCuits());
    const ks = delFiltro().map(e => calcular(e, VENTANA));
    hoja(wb, "Eventos", [["Evento", "Fecha", "Formato", "Lugar", "Invitados", "Inscriptos", "Asistieron", "Personas", "Compraron después",
      "USD antes", "USD después", "USD incremental", "Crecimiento", "Inversión USD", "Retorno", `Días medidos (de ${VENTANA})`],
      ...ks.map(k => [k.ev.titulo, k.ev.fecha || "", k.ev.formato, k.ev.lugar, k.lista.length, k.inscriptos, k.asist.n, k.personas,
        k.antes ? k.asist.compraron : "", k.antes ? Math.round(k.asist.antes) : "", k.antes ? Math.round(k.asist.despues) : "",
        k.antes ? Math.round(k.asist.dif) : "", k.asist.crec == null ? "" : Math.round(k.asist.crec * 1000) / 1000,
        k.inv.usd == null ? "" : Math.round(k.inv.usd), k.retorno == null ? "" : Math.round(k.retorno * 100) / 100, k.dias || ""])],
      [32, 11, 16, 18, 9, 9, 10, 9, 10, 12, 12, 13, 11, 12, 9, 12]);
    hoja(wb, "Clientes por evento", [CAB_CLI, ...ks.flatMap(k => k.filas.map(r => filaCliente(k, r)))], [26, 11, 30, 34, 15, 14, 9, 8, 9, 12, 12, 13, 16]);
    hoja(wb, "Ranking clientes", [["Cliente", "Razón social", "CUIT", "Vendedor", "Eventos invitado", "Eventos asistió", "USD antes", "USD después", "USD diferencia"],
      ...ranking(ks).map(r => [r.nombre, r.razon, r.cuit, r.vendedor, r.invitado, r.asistio, Math.round(r.antes), Math.round(r.despues), Math.round(r.dif)])],
      [30, 34, 15, 14, 10, 10, 12, 12, 13]);
    XLSX.writeFile(wb, `eventos-con-clientes-${ANIO || "todos"}-${hoyISO()}.xlsx`);
  }
  // PDF = la impresión del navegador ("Guardar como PDF"); el CSS de impresión deja sólo esta página.
  function pdf() {
    const ev = ABIERTO && ABIERTO !== "nuevo" ? eventoAbierto() : null;
    const titulo = document.title;
    document.title = ev ? `Evento - ${ev.titulo}` : `Eventos con clientes ${ANIO || ""}`.trim();
    document.body.classList.add("ec-imprimiendo");
    const fin = () => { document.body.classList.remove("ec-imprimiendo"); document.title = titulo; window.removeEventListener("afterprint", fin); };
    window.addEventListener("afterprint", fin);
    setTimeout(() => { window.print(); setTimeout(fin, 500); }, 50);
  }

  /* ======================= EVENTOS DEL DOM ======================= */
  const ACC = {
    reintentar: () => window.renderEventosClientes(),
    nuevo: () => nuevo(),
    crear: () => crear(),
    volver: () => volver(),
    borrar: () => borrar(),
    importar: () => { const f = caja().querySelector(".ec-csv"); if (f) f.click(); },
    excel: () => excel().catch(() => nota("No se pudo armar el Excel.", true)),
    pdf: () => pdf(),
    ventana: a => { VENTANA = +a.dataset.n; if (ABIERTO) { pintarAnalisis(); pintarClientes(); const ev = eventoAbierto(); if (ev) asegurarDatos(ev); } else pintarTablero(); },
    cfiltro: a => { CFILTRO = a.dataset.k; pintarClientes(); },
    sumar: a => { const c = CLI.get(a.dataset.cuit); if (c) sumar([filaDe(c)]); },
    "sumar-libre": () => { const n = BUSCA_CLI.trim(); if (n) sumar([{ cuit: null, nombre: n, razon_social: "" }]); },
    pegar: () => pegarLista(),
    quitar: a => quitar(a.dataset.id),
  };
  function enganchar() {
    const c = caja();
    if (c.dataset.enganchado) return;
    c.dataset.enganchado = "1";
    c.addEventListener("click", ev => {
      const a = ev.target.closest("[data-ec]");
      if (a && c.contains(a)) { const d = a.closest("details"); if (d) d.open = false; const fn = ACC[a.dataset.ec]; if (fn) fn(a, ev); return; }
      const fila = ev.target.closest("[data-abrir]"); if (fila) abrir(fila.dataset.abrir);
    });
    c.addEventListener("keydown", ev => {
      if (ev.key === "Enter" && ev.target.dataset && ev.target.dataset.abrir) { ev.preventDefault(); abrir(ev.target.dataset.abrir); }
      if (ev.target.classList.contains("ec-titulo") && ev.key === "Enter") { ev.preventDefault(); if (ABIERTO === "nuevo") crear(); else ev.target.blur(); }
      if (ev.target.classList.contains("ec-busca-cli") && ev.key === "Enter") {
        ev.preventDefault(); const s = sugerencias(); if (s.length === 1) sumar([filaDe(s[0])]);
      }
      if (ev.target.classList.contains("ec-busca-cli") && ev.key === "Escape") { BUSCA_CLI = ""; ev.target.value = ""; pintarSugerencias(); }
    });
    c.addEventListener("input", ev => {
      if (ev.target.classList.contains("ec-busca-cli")) { BUSCA_CLI = ev.target.value; pintarSugerencias(); }
    });
    c.addEventListener("change", ev => {
      const el = ev.target;
      if (el.classList.contains("ec-csv")) { const f = el.files[0]; el.value = ""; importar(f); return; }
      if (el.dataset.f === "anio") { ANIO = el.value; pintarTablero(); return; }
      if (el.dataset.f === "formato") { FORMATO = el.value; pintarTablero(); return; }
      if (el.dataset.inv) {
        const k = el.dataset.k;
        const v = el.type === "checkbox" ? el.checked : num(el.value);
        const campos = { [k]: v };
        if (k === "asistio" && v) campos.inscripto = true;           // si vino, se inscribió
        guardarInv(el.dataset.inv, campos).then(() => { if (k !== "personas") pintarClientes(); });
        return;
      }
      const campo = el.dataset.campo; if (!campo) return;
      let v = el.value;
      if (campo === "titulo") { v = v.trim(); if (!v && ABIERTO !== "nuevo") { el.value = eventoAbierto().titulo; return nota("El nombre no puede quedar vacío.", true); } }
      if (campo === "inversion_usd") v = num(v);
      if (["fecha", "accion_id"].includes(campo) && !v) v = null;
      guardar({ [campo]: v }).then(ok => {
        if (!ok || ABIERTO === "nuevo") return;
        if (["fecha", "accion_id", "inversion_usd"].includes(campo)) { pintarDetalle(); }
      });
    });
    document.addEventListener("click", ev => {   // cerrar las sugerencias al tocar afuera
      const d = c.querySelector(".ec-sug.on"); if (d && !ev.target.closest(".ec-agregar")) d.classList.remove("on");
    });
  }

  window.renderEventosClientes = async function () {
    const c = caja(); if (!c) return;
    if (!(SES().puedeVerAcciones && SES().puedeVerAcciones())) { c.innerHTML = ""; return; }
    enganchar();
    if (CARGADO && ABIERTO === "nuevo") return;     // no pisar un evento a medio crear
    pintar();
    await traer();
    pintar();
    if (!ABIERTO) refrescarTablero(); else { const ev = eventoAbierto(); if (ev && ev.id) asegurarDatos(ev); }
  };
})();
