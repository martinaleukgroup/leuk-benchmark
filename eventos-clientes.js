/* ============================================================================
   EVENTOS CON CLIENTES — sección de Acciones.
   El evento se hace JUNTO a un distribuidor (nuestro cliente); los invitados son
   profesionales del rubro (clientes del distribuidor). La pregunta es: ¿sirvió?
     · Profesionales: cuántos se inscribieron y cuántos fueron (se cargan los números).
     · Ventas: cuánto nos compró el distribuidor después del evento, contra lo que
       ESPERÁBAMOS que compre sin el evento (lo que compraba antes, ajustado por cómo
       se movió el resto de los clientes en las mismas fechas). La diferencia son las
       "compras extra", y sobre eso se calcula el retorno de la inversión.

   Dos pantallas:
     · TABLERO → todos los eventos: métricas, gráficos, tabla y resumen por distribuidor.
     · EVENTO  → datos, profesionales, distribuidor(es), veredicto y gráficos.
   Descarga a Excel y PDF en las dos.

   Las ventas salen del "Reporte de ventas" del sistema (CSV por línea de
   factura). Se sube desde acá: se agrupa en el navegador por cliente y día y se
   guarda en Supabase (ventas_diarias). Nunca queda en un archivo del repo.
   SQL: supabase/sql/2026-10-15-eventos-clientes.sql y …-profesionales.sql.
   Quién entra: Admin y Líder.
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
  const veces = x => x == null || !isFinite(x) ? "—" : `${x < 0 ? "−" : ""}US$ ${Math.abs(x).toFixed(1).replace(".", ",")}`;
  const signo = v => v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${usd(Math.abs(v))}`;
  const plural = (n, s, p) => `${n} ${n === 1 ? s : (p || s + "s")}`;

  /* ---- Vocabulario ---- */
  const FORMATOS = ["Showroom", "Capacitación", "Lanzamiento", "After office", "Charla / workshop", "Visita a obra",
                    "Feria / exposición", "Otro"];
  const VENTANAS = [30, 60, 90, 180];

  /* ---- Estado ---- */
  let EVS = [];             // eventos_clientes
  let INV = {};             // evento_id -> [distribuidores del evento] (tabla eventos_clientes_inv)
  let CLI = new Map();      // cuit -> ventas_clientes
  let ACCS = [];            // acciones (para vincular inversión)
  let RANGO = null;         // {desde, hasta, clientes} de las ventas cargadas
  const VENTAS = new Map(); // cuit -> [{fecha, usd, facturas, familias}] ordenado por fecha
  const BASE = {};          // caché de ventas_base (resto de los clientes)
  const TCS = {};           // fecha -> tipo de cambio promedio cercano
  let CARGADO = false, ERROR = "";
  let ABIERTO = null;       // id de evento | "nuevo" | null
  let BORRADOR = null;
  let VENTANA = 90;
  let ANIO = String(new Date().getFullYear());
  let FORMATO = "";
  let BUSCA_CLI = "";       // buscador para sumar el distribuidor
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
        todo("acciones?select=id,titulo,tipo,estado,moneda,inversion_real,inversion_estimada,fecha_inicio,distribuidor&order=fecha_inicio.desc.nullslast").catch(() => []),
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
  const necesitaTC = ev => ev.fecha && num(ev.inversion_usd) == null && accionDe(ev) && (accionDe(ev).moneda || "ARS") !== "USD";
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
     cargadas no llegan), se acortan LAS DOS ventanas a lo que haya.

     ESPERADO = lo que el distribuidor compró ANTES × (1 + crecimiento del resto de
     los clientes entre esas mismas dos ventanas). Así no se le atribuye al evento
     una suba (o baja) que tuvo todo el mercado. COMPRAS EXTRA = DESPUÉS − ESPERADO.
     Además se muestra cómo se movió el mismo distribuidor en esas fechas el año
     anterior (estacionalidad propia), como contexto. */
  function calcular(ev, N) {
    const lista = INV[ev.id] || [];
    const out = { ev, lista, dists: [], dias: 0, falta: "",
                  inscr: num(ev.prof_inscriptos), asis: num(ev.prof_asistentes) };
    out.asistencia = out.inscr && out.asis != null ? out.asis / out.inscr : null;
    out.inv = inversion(ev);
    out.costoProf = out.inv.usd && out.asis ? out.inv.usd / out.asis : null;
    out.nombres = lista.map(x => x.nombre || (CLI.get(x.cuit) || {}).nombre || x.razon_social || "").filter(Boolean).join(" + ");
    if (!ev.fecha) { out.falta = "Cargá la fecha del evento para medir las compras."; return veredicto(out); }
    if (!lista.length) { out.falta = "Sumá el distribuidor con el que se hizo el evento para medir sus compras."; return veredicto(out); }
    if (!RANGO) { out.falta = "Todavía no hay ventas cargadas. Subí el reporte de ventas desde el tablero (⋯ Más → Actualizar ventas)."; return veredicto(out); }
    out.dias = Math.min(N, difDias(ev.fecha, RANGO.hasta) + 1);
    if (out.dias <= 0) {
      // Todavía no hay ventas posteriores: igual se muestra lo que el distribuidor venía comprando.
      const h = RANGO.hasta < ev.fecha ? RANGO.hasta : sumarDias(ev.fecha, -1);
      out.previo = { desde: sumarDias(h, -(N - 1)), hasta: h };
      out.previo.usd = lista.reduce((s, x) => s + sumaCliente(x.cuit, out.previo.desde, out.previo.hasta).usd, 0);
      out.falta = `El evento es del ${fechaLarga(ev.fecha)} y las ventas cargadas llegan hasta el ${fechaLarga(RANGO.hasta)}. ` +
        `Para saber si sirvió, subí un reporte de ventas más nuevo (⋯ Más → Actualizar ventas en el tablero) cuando haya pasado un tiempo desde el evento.`;
      return veredicto(out);
    }
    out.antes = [sumarDias(ev.fecha, -out.dias), sumarDias(ev.fecha, -1)];
    out.despues = [ev.fecha, sumarDias(ev.fecha, out.dias - 1)];
    const ly = r => r.map(f => sumarDias(f, -364));           // mismo día de la semana, un año antes
    out.base = BASE[claveBase(ev, out)] || null;
    const g = out.base && out.base.crec != null ? out.base.crec : null;
    out.fam = {}; out.famAntes = {};
    out.dists = lista.map(x => {
      const c = CLI.get(x.cuit) || {};
      const a = sumaCliente(x.cuit, out.antes[0], out.antes[1], out.famAntes);
      const d = sumaCliente(x.cuit, out.despues[0], out.despues[1], out.fam);
      const al = sumaCliente(x.cuit, ...ly(out.antes)).usd, dl = sumaCliente(x.cuit, ...ly(out.despues)).usd;
      const esperado = g != null ? a.usd * (1 + g) : a.usd;
      return { x, c, nombre: x.nombre || c.nombre || x.razon_social || c.razon_social || "(sin nombre)",
               razon: x.razon_social || c.razon_social || "", vendedor: c.vendedor || "",
               antes: a.usd, despues: d.usd, facturas: d.facturas, esperado, extra: d.usd - esperado,
               crec: a.usd > 0 ? (d.usd - a.usd) / a.usd : null, antesLy: al, despuesLy: dl };
    });
    const S = k => out.dists.reduce((s, r) => s + r[k], 0);
    Object.assign(out, { A: S("antes"), P: S("despues"), E: S("esperado"), X: S("extra"), facturas: S("facturas"),
                         Aly: S("antesLy"), Ply: S("despuesLy") });
    out.crec = out.A > 0 ? (out.P - out.A) / out.A : null;
    out.crecLy = out.Aly > 0 ? (out.Ply - out.Aly) / out.Aly : null;
    out.puntos = out.crec != null && g != null ? out.crec - g : null;
    out.retorno = out.inv.usd ? out.X / out.inv.usd : null;
    out.extraProf = out.asis ? out.X / out.asis : null;
    return veredicto(out);
  }
  function veredicto(k) {
    if (!k.antes) k.ver = { c: "", t: "Todavía no se puede medir", txt: k.falta };
    else if (!k.base) k.ver = { c: "", t: "Calculando…", txt: "Trayendo cómo se movió el resto de los clientes en las mismas fechas." };
    else if (k.X > 0 && (k.retorno == null || k.retorno >= 1)) k.ver = { c: "ok", t: "Sirvió" };
    else if (k.X > 0) k.ver = { c: "warn", t: "Sirvió, pero no cubrió la inversión" };
    else k.ver = { c: "no", t: "No se ve efecto en las compras" };
    if (k.antes && k.base) {
      const quien = k.nombres || "El distribuidor";
      k.ver.txt = `${esc(quien)} nos compró <b>${usd(k.P)}</b> en los ${k.dias} días posteriores al evento. ` +
        `Antes compraba ${usd(k.A)} y el resto de los clientes ${k.base.crec >= 0 ? "creció" : "bajó"} ${pct(k.base.crec).replace(/^[+−]/, "")}, ` +
        `así que sin el evento esperábamos unos <b>${usd(k.E)}</b>: compró <b>${usd(Math.abs(k.X))} ${k.X >= 0 ? "más" : "menos"}</b> de lo esperado.` +
        (k.retorno == null ? " Cargá la inversión para ver el retorno." : k.X > 0 ? ` Cada US$ 1 invertido trajo <b>${veces(k.retorno)}</b> de compras extra.` : ` La inversión fue de ${usd(k.inv.usd)}.`) +
        (k.dias < 30 ? ` <i>Ojo: sólo hay ${k.dias} días de datos después del evento.</i>` : "");
    }
    return k;
  }
  const claveBase = (ev, k) => `${ev.id}|${k.antes && k.antes[0]}|${k.despues && k.despues[1]}|${(INV[ev.id] || []).map(x => x.cuit).join(",")}`;
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
      BASE[key] = { antes: A, despues: D, crec: A > 0 ? (D - A) / A : null };
    } catch (e) { /* sin base: el veredicto queda en "calculando" y se reintenta al volver */ }
  }

  // Compras mensuales del/los distribuidor(es): 6 meses antes y 6 después del mes del evento,
  // y los mismos meses del año anterior.
  function evolucion(k) {
    const f0 = aFecha(k.ev.fecha), meses = [];
    for (let i = -6; i <= 6; i++) meses.push({ i, d: new Date(f0.getFullYear(), f0.getMonth() + i, 1) });
    const total = (d, dy) => {
      const desde = isoDe(new Date(d.getFullYear() - dy, d.getMonth(), 1)), hasta = isoDe(new Date(d.getFullYear() - dy, d.getMonth() + 1, 0));
      if (RANGO && desde > RANGO.hasta) return null;
      return k.lista.reduce((s, x) => s + sumaCliente(x.cuit, desde, hasta).usd, 0);
    };
    return {
      labels: meses.map(({ i, d }) => i === 0 ? "evento" : `${MES_CORTO[d.getMonth()]}${d.getMonth() === 0 ? " " + String(d.getFullYear()).slice(2) : ""}`),
      este: meses.map(({ d }) => total(d, 0)), anterior: meses.map(({ d }) => total(d, 1)),
    };
  }

  /* ---- Gráficos (SVG propio, mismo criterio que Resultados) ---- */
  const COL = { main: "var(--olive)", soft: "var(--olive-soft)", gris: "#b9b8ad", warn: "var(--warn)", neg: "#c98f84" };
  const corta = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;
  function leyenda(items) {
    return `<div class="ec-ley">${items.map(([t, c, dash]) => `<span><i style="background:${c}${dash ? ";height:2px;border-top:2px dashed " + c + ";background:none" : ""}"></i>${esc(t)}</span>`).join("")}</div>`;
  }
  // Barras horizontales: [{l, v, g}] (g = barra fantasma detrás, p. ej. "antes").
  function barrasH(items, fmt) {
    if (!items.length) return `<div class="ec-graf-vacio">Sin datos</div>`;
    const W = 560, L = 170, R = 96, h = 26, H = items.length * h + 6;
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
    const W = 560, L = 190, R = 16, h = 34, H = items.length * h + 8;
    const max = Math.max(0.01, ...items.map(x => Math.abs(x.v)));
    const mitad = (W - L - R) / 2, cx = L + mitad, esc2 = v => (mitad - 54) * Math.abs(v) / max;
    return `<svg viewBox="0 0 ${W} ${H}" class="ec-svg" role="img">
      <line x1="${cx}" x2="${cx}" y1="0" y2="${H}" class="ec-base"/>
      ${items.map((x, i) => { const y = i * h + 6, w = esc2(x.v), x0 = x.v < 0 ? cx - w : cx;
        return `<text x="${L - 8}" y="${y + 15}" text-anchor="end" class="ec-t">${esc(corta(x.l, 30))}</text>
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
          return `<rect x="${x0 + j * bw}" y="${y1}" width="${bw - 3}" height="${hh}" rx="3" style="fill:${v < 0 && s.cNeg ? s.cNeg : s.c}"><title>${esc(c)}: ${esc(fmt(v))}</title></rect>`; }).join("") +
          `<text x="${L + 4 + i * gw + gw / 2}" y="${H - B + 16}" text-anchor="middle" class="ec-t ec-eje">${esc(corta(c, Math.max(6, Math.floor(gw / 6.5))))}</text>`;
      }).join("")}</svg>`;
  }
  // Líneas: labels + series [{c, vals, dash}]. Marca el mes del evento.
  function lineas(labels, series, fmt, marca) {
    const vals = series.flatMap(s => s.vals || []).filter(v => v != null);
    if (!vals.length) return `<div class="ec-graf-vacio">Sin datos</div>`;
    const W = 560, H = 200, L = 56, B = 30, T = 12;
    const max = Math.max(1, ...vals), min = Math.min(0, ...vals);
    const x = i => L + 6 + (W - L - 16) * i / Math.max(1, labels.length - 1);
    const y = v => T + (H - T - B) * (max - v) / ((max - min) || 1);
    const ticks = [0, 1, 2, 3].map(i => min + (max - min) * i / 3);
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
  const chipVer = k => `<span class="ec-ver ${k.ver.c}">${esc(k.ver.t)}</span>`;

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
    ? `Ventas cargadas del ${fechaLarga(RANGO.desde)} al <b>${fechaLarga(RANGO.hasta)}</b>`
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
    const med = ks.filter(k => k.antes && k.base).sort((a, b) => a.ev.fecha.localeCompare(b.ev.fecha));
    const S = (arr, f) => arr.reduce((s, k) => s + (f(k) || 0), 0);
    const inscr = S(ks, k => k.inscr), asis = S(ks, k => k.asis);
    const X = S(med, k => k.X), invMed = S(med, k => k.inv.usd), invTot = S(ks, k => k.inv.usd);
    const sirvieron = med.filter(k => k.X > 0).length;
    const formatos = [...new Set([...FORMATOS, ...EVS.map(e => e.formato).filter(Boolean)])];
    const porDist = resumenDistribuidores(ks);

    w.innerHTML = `
      <header class="mh">
        <div class="mh-top">
          <div class="mh-tit"><h1>Eventos con clientes</h1><p class="mh-sub"><span>Eventos con distribuidores para profesionales: ¿cuánto movieron las compras?</span><span>${lineaVentas()}</span></p></div>
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
          ${kpi(evs.length, evs.length === 1 ? "evento" : "eventos", med.length ? `${sirvieron} de ${med.length} con compras extra` : (ANIO ? `en ${ANIO}` : "en total"))}
          ${kpi(`${asis}<small>/${inscr}</small>`, "profesionales asistieron", inscr ? `${pctN(asis / inscr)} de los inscriptos` : "cargá los inscriptos")}
          ${kpi(signo(X), "compras extra", `a ${VENTANA} días, sobre lo esperado`, tono(X))}
          ${kpi(invMed && X > 0 ? veces(X / invMed) : "—", "por cada US$ 1 invertido", invTot ? `${usd(invTot)} invertidos` : "cargá la inversión", tono(X))}
          ${kpi(invTot && asis ? usd(invTot / asis) : "—", "costo por profesional", "inversión ÷ asistentes")}
          ${kpi(asis && med.length ? signo(X / S(med, k => k.asis)) : "—", "compras extra por profesional", "que asistió")}
        </div>` : ""}
      </header>
      <div class="mh-bar ec-bar ec-no-print">
        <select class="ac-sel" data-f="anio" aria-label="Año"><option value="">Todos los años</option>${anios.map(a => `<option ${ANIO === a ? "selected" : ""}>${a}</option>`).join("")}</select>
        <select class="ac-sel" data-f="formato" aria-label="Formato"><option value="">Todos los formatos</option>${formatos.map(f => `<option ${FORMATO === f ? "selected" : ""}>${esc(f)}</option>`).join("")}</select>
        ${ventanaChips()}
        <span class="ec-nota" role="status"></span>
      </div>
      ${!RANGO ? `<div class="res-intro">Para medir las compras, subí el <b>Reporte de ventas</b> del sistema (CSV) desde <b>⋯ Más → Actualizar ventas</b>. Se puede volver a subir cuando quieras: reemplaza el período que trae el archivo.</div>` : ""}
      ${!EVS.length ? `<div class="res-intro">Todavía no hay eventos. Creá el primero con <b>＋ Nuevo evento</b>: cargá cuántos profesionales se inscribieron y cuántos fueron, y elegí el <b>distribuidor</b> con el que lo hiciste.</div>` : ""}
      ${evs.length ? `<div class="ec-grid">
        ${tarjeta("Compras extra vs. inversión", `US$ por evento · ${VENTANA} días`,
          leyenda([["Inversión", COL.gris], ["Compras extra", COL.main]]) +
          columnas(med.map(k => k.ev.titulo || "Sin nombre"), [{ c: COL.gris, vals: med.map(k => k.inv.usd) }, { c: COL.main, cNeg: COL.neg, vals: med.map(k => k.X) }], usd))}
        ${tarjeta("Profesionales por evento", "Asistieron (y de fondo, inscriptos)",
          barrasH(ks.filter(k => k.inscr || k.asis).slice().reverse().map(k => ({ l: k.ev.titulo || "Sin nombre", v: k.asis || 0, g: k.inscr || 0 })), v => String(Math.round(v))) +
          leyenda([["Inscriptos (fondo)", COL.gris], ["Asistieron", COL.main]]))}
        ${tarjeta("¿Creció más que el resto?", `Crecimiento del distribuidor vs. resto de los clientes · ${VENTANA} días`,
          leyenda([["Resto de los clientes", COL.gris], ["Distribuidor del evento", COL.main]]) +
          columnas(med.map(k => k.ev.titulo || "Sin nombre"), [{ c: COL.gris, vals: med.map(k => k.base.crec * 100) }, { c: COL.main, vals: med.map(k => k.crec == null ? null : k.crec * 100) }],
            v => `${v > 0 ? "+" : ""}${Math.round(v)} %`, v => `${Math.round(v)} %`))}
        ${tarjeta("Compras extra por distribuidor", `Suma de sus eventos · US$ a ${VENTANA} días`,
          divergente(porDist.filter(d => d.medidos).slice(0, 10).map(d => ({ l: d.nombre, v: d.X, c: d.X >= 0 ? COL.main : COL.neg })), signo))}
      </div>` : ""}
      ${evs.length ? `<section class="ec-card ec-tabla-card"><h3>Eventos</h3>
        <div class="ec-tabla-wrap"><table class="ec-tabla">
          <thead><tr><th>Evento</th><th>Distribuidor</th><th class="n">Profesionales</th><th class="n">Antes</th><th class="n">Después</th><th class="n">Esperado</th><th class="n">Compras extra</th><th class="n">Por US$ 1</th><th>¿Sirvió?</th></tr></thead>
          <tbody>${ks.map(k => `<tr data-abrir="${k.ev.id}" tabindex="0">
            <td><b>${esc(k.ev.titulo) || "<i>Sin nombre</i>"}</b><small>${esc([fechaLarga(k.ev.fecha), k.ev.formato].filter(Boolean).join(" · "))}</small></td>
            <td>${esc(k.nombres) || "—"}</td>
            <td class="n">${k.asis != null ? k.asis : "—"}${k.inscr ? ` <small>de ${k.inscr}</small>` : ""}</td>
            <td class="n">${k.antes ? usd(k.A) : "—"}</td>
            <td class="n">${k.antes ? usd(k.P) : "—"}${k.antes && k.dias < VENTANA ? ` <small title="Todavía no pasaron ${VENTANA} días">${k.dias} d</small>` : ""}</td>
            <td class="n">${k.antes && k.base ? usd(k.E) : "—"}</td>
            <td class="n ${k.antes && k.base ? tono(k.X) : ""}">${k.antes && k.base ? signo(k.X) : "—"}</td>
            <td class="n">${k.base && k.retorno != null && k.X > 0 ? veces(k.retorno) : "—"}</td>
            <td>${chipVer(k)}</td></tr>`).join("")}</tbody>
        </table></div></section>` : ""}
      ${porDist.length ? `<section class="ec-card ec-tabla-card"><h3>Por distribuidor</h3>
        <p class="ec-card-sub">Con quién hicimos eventos y cuánto movieron las compras (suma de sus eventos, ${VENTANA} días)</p>
        <div class="ec-tabla-wrap"><table class="ec-tabla">
          <thead><tr><th>Distribuidor</th><th>Vendedor</th><th class="n">Eventos</th><th class="n">Profesionales</th><th class="n">Inversión</th><th class="n">Compras extra</th><th class="n">Por US$ 1</th></tr></thead>
          <tbody>${porDist.map(d => `<tr><td><b>${esc(d.nombre)}</b>${d.razon && d.razon !== d.nombre ? `<small>${esc(d.razon)}</small>` : ""}</td>
            <td>${esc(d.vendedor)}</td><td class="n">${d.eventos}</td><td class="n">${d.asis || "—"}</td><td class="n">${d.inv ? usd(d.inv) : "—"}</td>
            <td class="n ${d.medidos ? tono(d.X) : ""}">${d.medidos ? signo(d.X) : "—"}</td><td class="n">${d.medidos && d.inv && d.X > 0 ? veces(d.X / d.inv) : "—"}</td></tr>`).join("")}</tbody>
        </table></div></section>` : ""}`;
    pintarNota();
  }
  // Un renglón por distribuidor. Si un evento tuvo varios, la inversión y los profesionales
  // se reparten en partes iguales (para no contarlos dos veces).
  function resumenDistribuidores(ks) {
    const m = new Map();
    ks.forEach(k => {
      const n = k.lista.length || 1;
      (k.dists.length ? k.dists : k.lista.map(x => ({ x, nombre: x.nombre || (CLI.get(x.cuit) || {}).nombre || x.razon_social, razon: x.razon_social, vendedor: (CLI.get(x.cuit) || {}).vendedor || "" })))
        .forEach(r => {
          const o = m.get(r.x.cuit) || { nombre: r.nombre, razon: r.razon, vendedor: r.vendedor, cuit: r.x.cuit, eventos: 0, asis: 0, inv: 0, X: 0, medidos: 0 };
          o.eventos++; o.asis += (k.asis || 0) / n; o.inv += (k.inv.usd || 0) / n;
          if (k.antes && k.base && r.extra != null) { o.X += r.extra; o.medidos++; }
          m.set(r.x.cuit, o);
        });
    });
    return [...m.values()].map(o => Object.assign(o, { asis: Math.round(o.asis) })).sort((a, b) => b.X - a.X || b.eventos - a.eventos);
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
    const n = v => num(v) == null ? "" : num(v);
    w.innerHTML = `
      <div class="ec-d-top ec-no-print">
        <button class="btn-ghost" data-ec="volver">← Eventos con clientes</button>
        <span class="ec-nota" role="status"></span>
        ${!nuevo ? `<button class="btn-ghost" data-ec="excel">⬇ Excel</button><button class="btn-ghost" data-ec="pdf">⬇ PDF</button>` : ""}
        ${puedeBorrar ? `<button class="btn-ghost ec-borrar" data-ec="borrar">Eliminar</button>` : ""}
      </div>
      <section class="ec-card ec-datos">
        <input class="ec-titulo" data-campo="titulo" placeholder="Nombre del evento (ej. Charla de iluminación con Luz Design)" value="${esc(ev.titulo)}" aria-label="Nombre del evento">
        <div class="ec-campos">
          <label><span>Fecha</span><input type="date" data-campo="fecha" value="${esc(ev.fecha || "")}"></label>
          <label><span>Formato</span><select data-campo="formato"><option value="">—</option>${formatos.map(f => `<option ${ev.formato === f ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></label>
          <label><span>Lugar</span><input data-campo="lugar" value="${esc(ev.lugar)}" placeholder="Showroom del distribuidor"></label>
          <label><span>Profesionales inscriptos</span><input type="number" min="0" step="1" data-campo="prof_inscriptos" value="${n(ev.prof_inscriptos)}" placeholder="0"></label>
          <label><span>Profesionales que fueron</span><input type="number" min="0" step="1" data-campo="prof_asistentes" value="${n(ev.prof_asistentes)}" placeholder="0"></label>
          <label class="ancho"><span>Acción vinculada</span><select data-campo="accion_id"><option value="">Sin vincular</option>${accs.map(a => `<option value="${a.id}" ${ev.accion_id === a.id ? "selected" : ""}>${esc(a.titulo)}${a.tipo ? ` (${esc(a.tipo)})` : ""}</option>`).join("")}</select></label>
          <label><span>Inversión (US$)</span><input type="number" min="0" step="1" data-campo="inversion_usd" value="${n(ev.inversion_usd)}" placeholder="${invAcc.usd != null ? Math.round(invAcc.usd) : "0"}"></label>
        </div>
        <p class="ec-ayuda ec-inv-ayuda">${ayudaInv(ev)}</p>
        <textarea data-campo="notas" rows="2" placeholder="Notas: objetivo, qué se mostró, condiciones especiales que se ofrecieron…">${esc(ev.notas)}</textarea>
        ${nuevo ? `<div class="ec-crear"><button class="btn-primary" data-ec="crear">Crear evento</button><span class="ec-ayuda">Después elegís el distribuidor.</span></div>` : ""}
      </section>
      ${nuevo ? "" : `<section class="ec-card ec-clientes"></section><div class="ec-analisis"></div>`}`;
    pintarNota();
    if (!nuevo) { pintarDistribuidores(); pintarAnalisis(); asegurarDatos(ev); }
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
  // Trae lo que falte para el análisis (ventas del distribuidor, resto de clientes, TC) y repinta.
  async function asegurarDatos(ev) {
    const cuits = (INV[ev.id] || []).map(x => x.cuit).filter(Boolean);
    try {
      await Promise.all([cargarVentas(cuits), necesitaTC(ev) ? tcCerca(ev.fecha) : null]);
      await traerBase(ev, calcular(ev, VENTANA));
      if (ABIERTO === ev.id) { pintarAyudaInv(); pintarDistribuidores(); pintarAnalisis(); }
    } catch (e) { nota("No se pudieron traer las ventas del distribuidor.", true); }
  }

  function pintarAnalisis() {
    const w = caja().querySelector(".ec-analisis"); if (!w) return;
    const ev = eventoAbierto(); if (!ev) return;
    const k = calcular(ev, VENTANA);
    const encab = `<div class="ec-bar ec-no-print">${ventanaChips()}${k.antes ? `<span class="ec-ayuda">Antes: ${fechaLarga(k.antes[0])} → ${fechaLarga(k.antes[1])} · Después: ${fechaLarga(k.despues[0])} → ${fechaLarga(k.despues[1])}${k.dias < VENTANA ? ` · <b>sólo ${k.dias} días con datos</b>` : ""}</span>` : ""}</div>`;
    const ver = `<section class="ec-veredicto ${k.ver.c}"><b>${esc(k.ver.t)}</b>${k.ver.txt ? `<p>${k.ver.txt}</p>` : ""}</section>`;
    const kpis = `<div class="mh-kpis">
        ${kpi(k.asis != null ? `${k.asis}${k.inscr ? `<small>/${k.inscr}</small>` : ""}` : "—", "profesionales fueron", k.asistencia != null ? `${pctN(k.asistencia)} de los inscriptos` : "cargá inscriptos y asistentes")}
        ${k.antes ? `
        ${kpi(usd(k.P), `compras del distribuidor a ${k.dias} días`, `antes: ${usd(k.A)} (${pct(k.crec)})`)}
        ${kpi(k.base ? signo(k.X) : "…", "compras extra", k.base ? `esperado: ${usd(k.E)}` : "calculando", k.base ? tono(k.X) : "")}
        ${kpi(k.puntos != null ? `${k.puntos >= 0 ? "+" : "−"}${Math.abs(Math.round(k.puntos * 100))} pts` : "—", "vs. el resto de los clientes", k.base ? `el resto: ${pct(k.base.crec)}` : "", tono(k.puntos))}
        ${kpi(k.retorno != null && k.base && k.X > 0 ? veces(k.retorno) : "—", "por cada US$ 1 invertido", !k.inv.usd ? "cargá la inversión" : k.base && k.X <= 0 ? `sin compras extra · ${usd(k.inv.usd)} invertidos` : `${usd(k.inv.usd)} invertidos`, k.base && k.X > 0 ? "ok" : "")}` : ""}
        ${kpi(k.costoProf != null ? usd(k.costoProf) : "—", "costo por profesional", "inversión ÷ asistentes")}
        ${k.antes && k.base && k.extraProf != null ? kpi(signo(k.extraProf), "compras extra por profesional", "que asistió", tono(k.extraProf)) : ""}
      </div>`;
    if (!k.antes) {
      if (!k.previo) { w.innerHTML = encab + ver + kpis; return; }
      const e0 = evolucion(k);
      w.innerHTML = encab + ver + kpis.replace('<div class="mh-kpis">', `<div class="mh-kpis">
          ${kpi(usd(k.previo.usd), `compras del distribuidor en los ${VENTANA} días previos`, `${fechaLarga(k.previo.desde)} → ${fechaLarga(k.previo.hasta)}`)}`) + `<div class="ec-grid">
          ${tarjeta("Compras mes a mes", `${esc(k.nombres || "Distribuidor")} · hasta el último mes con ventas cargadas`,
            leyenda([["Este período", COL.main], ["Mismos meses, año anterior", COL.gris, true]]) +
            lineas(e0.labels, [{ c: COL.gris, vals: e0.anterior, dash: true }, { c: COL.main, vals: e0.este }], usdCorto, 6))}
        </div>`;
      return;
    }
    const e2 = evolucion(k);
    const fams = Object.entries(k.fam).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const crec = [["Distribuidor del evento", k.crec, COL.main], ["Resto de los clientes", k.base ? k.base.crec : null, COL.gris],
                  ["Distribuidor, año anterior", k.crecLy, COL.soft]].filter(c => c[1] != null);
    w.innerHTML = encab + ver + kpis + `
      <div class="ec-grid">
        ${tarjeta("Antes, esperado y después", `US$ · ${k.dias} días antes vs. ${k.dias} días después`,
          barrasH([{ l: "Antes del evento", v: k.A, c: COL.gris }, { l: "Esperado sin evento", v: k.E, c: COL.soft }, { l: "Después del evento", v: k.P }], usd))}
        ${tarjeta("¿Creció más que el resto?", "Crecimiento de las compras: después vs. antes",
          divergente(crec.map(([l, v, c]) => ({ l, v, c })), pct) +
          `<p class="ec-ayuda">Si el distribuidor crece más que el resto de los clientes en las mismas fechas, esa diferencia es lo que se le atribuye al evento.</p>`)}
        ${tarjeta("Compras mes a mes", `${esc(k.nombres || "Distribuidor")} · 6 meses antes y después del evento`,
          leyenda([["Este período", COL.main], ["Mismos meses, año anterior", COL.gris, true]]) +
          lineas(e2.labels, [{ c: COL.gris, vals: e2.anterior, dash: true }, { c: COL.main, vals: e2.este }], usdCorto, 6))}
        ${tarjeta("Qué compró después", `Por familia · US$ a ${k.dias} días (de fondo, lo que compraba antes)`,
          barrasH(fams.map(([l, v]) => ({ l, v, g: Math.max(0, k.famAntes[l] || 0) })), usd))}
      </div>`;
  }

  function pintarDistribuidores() {
    const w = caja().querySelector(".ec-clientes"); if (!w) return;
    const ev = eventoAbierto(); if (!ev) return;
    const k = calcular(ev, VENTANA);
    const conVentas = !!(k.antes && k.base);
    const conFoco = document.activeElement && document.activeElement.classList.contains("ec-busca-cli");
    const filas = k.dists.length ? k.dists : k.lista.map(x => { const c = CLI.get(x.cuit) || {};
      return { x, nombre: x.nombre || c.nombre || x.razon_social, razon: x.razon_social || c.razon_social || "", vendedor: c.vendedor || "" }; });
    const accDist = accionDe(ev) && accionDe(ev).distribuidor;
    w.innerHTML = `
      <div class="ec-cli-top">
        <h3>Distribuidor del evento</h3>
        <div class="ec-agregar ec-no-print">
          <input type="search" class="ec-busca-cli" placeholder="${filas.length ? "Sumar otro distribuidor" : "Buscar distribuidor: nombre, razón social o CUIT"}" autocomplete="off" value="${esc(BUSCA_CLI)}" aria-label="Buscar distribuidor">
          <div class="ec-sug" role="listbox"></div>
        </div>
      </div>
      ${!filas.length ? `<p class="ec-ayuda">Elegí el distribuidor con el que se hizo el evento (sale de las ventas cargadas).${accDist ? ` La acción vinculada dice <b>${esc(accDist)}</b>.` : ""} Si fueron varios, sumalos a todos.</p>` : `
      <div class="ec-tabla-wrap"><table class="ec-tabla ec-cli">
        <thead><tr><th>Distribuidor</th><th>Vendedor</th>
          ${conVentas ? `<th class="n">Antes</th><th class="n">Después</th><th class="n">Esperado</th><th class="n">Compras extra</th>` : ""}<th class="ec-no-print"></th></tr></thead>
        <tbody>${filas.map(r => `<tr>
          <td><b>${esc(r.nombre)}</b><small>${esc([r.razon !== r.nombre ? r.razon : "", r.x.cuit].filter(Boolean).join(" · "))}</small></td>
          <td>${esc(r.vendedor)}</td>
          ${conVentas ? `<td class="n">${usd(r.antes)}</td><td class="n"><b>${usd(r.despues)}</b></td><td class="n">${usd(r.esperado)}</td><td class="n ${tono(r.extra)}">${signo(r.extra)}</td>` : ""}
          <td class="ec-no-print"><button class="ac-mini" data-ec="quitar" data-id="${r.x.id}" title="Quitar del evento" aria-label="Quitar del evento">✕</button></td>
        </tr>`).join("")}</tbody>
      </table></div>`}`;
    pintarSugerencias();
    if (conFoco) { const t = w.querySelector(".ec-busca-cli"); t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
  }

  /* ---- Sumar distribuidores ---- */
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
    d.innerHTML = s.length ? s.map(c => `<button type="button" data-ec="sumar" data-cuit="${esc(c.cuit)}">
        <b>${esc(c.nombre || c.razon_social)}</b><small>${esc(c.razon_social !== c.nombre ? c.razon_social + " · " : "")}${esc(c.cuit)}${c.vendedor ? " · " + esc(c.vendedor) : ""}${c.ultima_compra ? " · últ. compra " + esc(fechaLarga(c.ultima_compra)) : ""}</small></button>`).join("")
      : `<p class="ec-sug-vacio">Ningún cliente con ese nombre o CUIT en las ventas cargadas.</p>`;
    d.classList.add("on");
  }
  const filaDe = c => ({ cuit: c.cuit, razon_social: c.razon_social || "", nombre: c.nombre || "" });
  async function sumar(filas) {
    const ev = eventoAbierto(); if (!ev || !filas.length) return;
    try {
      const r = await fetch(url("eventos_clientes_inv"), { method: "POST", headers: head({ Prefer: "return=representation" }),
        body: JSON.stringify(filas.map(f => Object.assign({ evento_id: ev.id, inscripto: true, asistio: true }, f))) });
      const d = r.ok ? await r.json() : [];
      if (!d.length) throw new Error();
      (INV[ev.id] = INV[ev.id] || []).push(...d);
      BUSCA_CLI = "";
      pintarDistribuidores(); pintarAnalisis();
      asegurarDatos(ev);
    } catch (e) { nota("No se pudo sumar el distribuidor. ¿Ya estaba en el evento?", true); }
  }
  async function quitar(id) {
    const ev = eventoAbierto(); const l = INV[ev.id] || []; if (!l.some(y => y.id === id)) return;
    try {
      const r = await fetch(url(`eventos_clientes_inv?id=eq.${enc(id)}`), { method: "DELETE", headers: head({ Prefer: "return=representation" }) });
      const d = r.ok ? await r.json() : []; if (!d.length) throw new Error();
      INV[ev.id] = l.filter(y => y.id !== id);
      pintarDistribuidores(); pintarAnalisis(); asegurarDatos(ev);
    } catch (e) { nota("No se pudo quitar.", true); }
  }

  /* ---- Evento: crear / guardar / borrar ---- */
  function nuevo() {
    BORRADOR = { id: null, titulo: "", fecha: hoyISO(), lugar: "", formato: "", accion_id: null, inversion_usd: null, notas: "",
                 prof_inscriptos: null, prof_asistentes: null };
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
      BORRADOR = null; ABIERTO = d[0].id;
      nota("Evento creado. Ahora elegí el distribuidor.");
      pintar();
      const s = caja().querySelector(".ec-busca-cli"); if (s) s.focus();
    } catch (e) { nota("No se pudo crear el evento. ¿Corriste los SQL de Eventos con clientes?", true); }
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
    } catch (e) {
      Object.assign(ev, antes);
      nota(/prof_/.test(Object.keys(campos).join()) ? "No se pudo guardar. ¿Corriste el SQL 2026-10-15-eventos-clientes-profesionales.sql?" : "No se pudo guardar el cambio.", true);
      pintarDetalle(); return false;
    }
  }
  async function borrar() {
    const ev = eventoAbierto(); if (!ev) return;
    if (!confirm(`¿Eliminar el evento "${ev.titulo}"?\n\nLas ventas no se tocan. No se puede deshacer.`)) return;
    try {
      const r = await fetch(url(`eventos_clientes?id=eq.${enc(ev.id)}`), { method: "DELETE", headers: head({ Prefer: "return=representation" }) });
      const d = r.ok ? await r.json() : []; if (!d.length) throw new Error();
      EVS = EVS.filter(e => e.id !== ev.id); delete INV[ev.id];
      ABIERTO = null; nota("Evento eliminado."); pintar();
    } catch (e) { nota("No se pudo eliminar. Sólo puede hacerlo quien lo creó o un admin.", true); }
  }
  function abrir(id) { ABIERTO = id; BUSCA_CLI = ""; pintar(); window.scrollTo({ top: 0 }); }
  function volver() {
    if (ABIERTO === "nuevo") { const t = caja().querySelector(".ec-titulo"); if (t && t.value.trim() && !confirm("¿Descartar el evento que estabas creando?")) return; }
    ABIERTO = null; BORRADOR = null; BUSCA_CLI = "";
    pintar(); refrescarTablero();
  }
  // El tablero necesita las ventas de todos los distribuidores, el TC y el "resto de clientes" de cada evento.
  async function refrescarTablero() {
    const faltaVentas = todosLosCuits().some(c => !VENTAS.has(c));
    const evs = delFiltro();
    const faltaBase = evs.some(e => { const k = calcular(e, VENTANA); return k.antes && !k.base; });
    const faltaTC = evs.some(e => necesitaTC(e) && !(e.fecha in TCS));
    if (!faltaVentas && !faltaBase && !faltaTC) return;
    nota("Calculando las compras de cada evento…", false, true);
    try {
      await cargarVentas(todosLosCuits());
      await Promise.all(evs.filter(necesitaTC).map(e => tcCerca(e.fecha)));
      await Promise.all(evs.map(e => traerBase(e, calcular(e, VENTANA))));
    } catch (e) { return nota("No se pudieron traer las ventas.", true); }
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
    texto = texto.replace(/^\uFEFF/, "");
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
      if (texto.includes("\uFFFD")) texto = new TextDecoder("windows-1252").decode(buf);
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
  const r2 = v => v == null ? "" : Math.round(v * 100) / 100;
  const r3 = v => v == null || !isFinite(v) ? "" : Math.round(v * 1000) / 1000;
  function hoja(wb, nombre, aoa, anchos) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (anchos) ws["!cols"] = anchos.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  }
  const CAB_EV = ["Evento", "Fecha", "Formato", "Lugar", "Distribuidor", "Profesionales inscriptos", "Profesionales asistieron", "% asistencia",
    "Días medidos", "USD antes", "USD después", "Crecimiento distribuidor", "Crecimiento resto de clientes", "USD esperado", "USD compras extra",
    "Inversión USD", "Compras extra por US$ 1", "Costo por profesional USD", "Compras extra por profesional USD", "¿Sirvió?"];
  const filaEv = k => {
    const m = !!(k.antes && k.base);
    return [k.ev.titulo, k.ev.fecha || "", k.ev.formato, k.ev.lugar, k.nombres, k.inscr ?? "", k.asis ?? "", r3(k.asistencia),
      k.dias || "", k.antes ? r2(k.A) : "", k.antes ? r2(k.P) : "", r3(k.crec), m ? r3(k.base.crec) : "", m ? r2(k.E) : "", m ? r2(k.X) : "",
      k.inv.usd == null ? "" : r2(k.inv.usd), m ? r2(k.retorno) : "", r2(k.costoProf), m ? r2(k.extraProf) : "", k.ver.t];
  };
  async function excel() {
    if (!window.XLSX) { alert("No se pudo cargar el exportador."); return; }
    const wb = XLSX.utils.book_new();
    const ev = ABIERTO && ABIERTO !== "nuevo" ? eventoAbierto() : null;
    if (ev) {
      await asegurarDatos(ev);
      const k = calcular(ev, VENTANA);
      hoja(wb, "Resumen", [["Campo", "Valor"], ...CAB_EV.map((c, i) => [c, filaEv(k)[i]]), [],
        ["Ventana antes", k.antes ? `${k.antes[0]} a ${k.antes[1]}` : ""], ["Ventana después", k.despues ? `${k.despues[0]} a ${k.despues[1]}` : ""],
        ["Crecimiento distribuidor mismas fechas año anterior", r3(k.crecLy)],
        ["Conclusión", String(k.ver.txt || "").replace(/<[^>]+>/g, "")],
        ["Cómo se calcula", "Esperado = compras antes × (1 + crecimiento del resto de los clientes). Compras extra = después − esperado."]], [44, 70]);
      hoja(wb, "Distribuidores", [["Distribuidor", "Razón social", "CUIT", "Vendedor", "USD antes", "USD después", "USD esperado", "USD compras extra", "Crecimiento"],
        ...k.dists.map(r => [r.nombre, r.razon, r.x.cuit, r.vendedor, r2(r.antes), r2(r.despues), k.base ? r2(r.esperado) : "", k.base ? r2(r.extra) : "", r3(r.crec)])],
        [28, 34, 15, 14, 12, 12, 13, 15, 11]);
      if (k.antes) {
        const fams = [...new Set([...Object.keys(k.fam), ...Object.keys(k.famAntes)])];
        hoja(wb, "Familias", [["Familia", "USD antes", "USD después", "Diferencia"],
          ...fams.map(f => [f, r2(k.famAntes[f] || 0), r2(k.fam[f] || 0), r2((k.fam[f] || 0) - (k.famAntes[f] || 0))]).sort((a, b) => b[2] - a[2])], [28, 12, 12, 12]);
        const e2 = evolucion(k);
        hoja(wb, "Mes a mes", [["Mes", "USD este período", "USD mismos meses año anterior"],
          ...e2.labels.map((l, i) => [l, e2.este[i] == null ? "" : Math.round(e2.este[i]), e2.anterior[i] == null ? "" : Math.round(e2.anterior[i])])], [12, 18, 28]);
      }
      XLSX.writeFile(wb, `evento-${nombreArchivo(ev.titulo)}-${hoyISO()}.xlsx`);
      return;
    }
    await refrescarTablero();
    const ks = delFiltro().map(e => calcular(e, VENTANA));
    hoja(wb, "Eventos", [CAB_EV, ...ks.map(filaEv)], [32, 11, 14, 18, 26, 12, 12, 10, 8, 12, 12, 12, 12, 12, 14, 12, 12, 12, 14, 26]);
    hoja(wb, "Por distribuidor", [["Distribuidor", "Razón social", "CUIT", "Vendedor", "Eventos", "Profesionales asistieron", "Inversión USD", "USD compras extra", "Compras extra por US$ 1"],
      ...resumenDistribuidores(ks).map(d => [d.nombre, d.razon, d.cuit, d.vendedor, d.eventos, d.asis, r2(d.inv), d.medidos ? r2(d.X) : "", d.medidos && d.inv ? r2(d.X / d.inv) : ""])],
      [28, 34, 15, 14, 8, 12, 12, 14, 14]);
    hoja(wb, "Cómo se calcula", [["Concepto", "Cálculo"],
      ["Ventana", `Antes = los ${VENTANA} días previos al evento; después = el día del evento y los siguientes (se acortan las dos si todavía no hay datos)`],
      ["Esperado", "Compras del distribuidor antes × (1 + crecimiento del resto de los clientes en las mismas fechas)"],
      ["Compras extra", "Compras del distribuidor después − esperado"],
      ["Compras extra por US$ 1", "Compras extra ÷ inversión"],
      ["Costo por profesional", "Inversión ÷ profesionales que asistieron"]], [24, 110]);
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
    ventana: a => {
      VENTANA = +a.dataset.n;
      if (ABIERTO) { pintarDistribuidores(); pintarAnalisis(); const ev = eventoAbierto(); if (ev && ev.id) asegurarDatos(ev); }
      else { pintarTablero(); refrescarTablero(); }
    },
    sumar: a => { const c = CLI.get(a.dataset.cuit); if (c) sumar([filaDe(c)]); },
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
      if (el.dataset.f === "anio") { ANIO = el.value; pintarTablero(); refrescarTablero(); return; }
      if (el.dataset.f === "formato") { FORMATO = el.value; pintarTablero(); refrescarTablero(); return; }
      const campo = el.dataset.campo; if (!campo) return;
      let v = el.value;
      if (campo === "titulo") { v = v.trim(); if (!v && ABIERTO !== "nuevo") { el.value = eventoAbierto().titulo; return nota("El nombre no puede quedar vacío.", true); } }
      if (["inversion_usd", "prof_inscriptos", "prof_asistentes"].includes(campo)) v = num(v);
      if (["fecha", "accion_id"].includes(campo) && !v) v = null;
      guardar({ [campo]: v }).then(ok => {
        if (!ok || ABIERTO === "nuevo") return;
        if (["fecha", "accion_id", "inversion_usd"].includes(campo)) pintarDetalle();
        else if (["prof_inscriptos", "prof_asistentes"].includes(campo)) pintarAnalisis();
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
