/* ============================================================================
   RESULTADOS — KPIs por canal de Contenidos (oct 2026).

   Tercera vista de cada canal (Calendario · Fichas · Resultados). Una pantalla,
   de arriba a abajo:
     · qué falta cargar
     · el embudo del período (vertical, como el recorrido de la persona)
     · la evolución de cada KPI contra la base
     · el histórico mes a mes (tocando un mes se abre el detalle por pieza)
     · la carga de datos del mes elegido

   Quien hace el canal carga SÓLO números crudos (leído por, alcance…). Los KPIs
   no se guardan: se calculan acá, con las fórmulas de la config del canal
   (tabla resultados_config — ver 2026-09-30-resultados.sql). Sumar un canal o un
   KPI es editar ese JSON; esta pantalla se arma sola con lo que haya.

   Vive aparte, como contenidos.js: el único contacto es window.LEUK_SESION y la
   función montar() que llama contenidos.js al abrir la vista.
   ========================================================================== */
(function () {
  "use strict";

  const SES = () => window.LEUK_SESION || {};
  const url = p => `${SES().sbUrl}/rest/v1/${p}`;
  const head = extra => Object.assign({}, SES().head ? SES().head() : {}, extra || {});
  const enc = encodeURIComponent;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const MES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const mesCorto = m => { const p = m.split("-"); return `${MES_CORTO[+p[1] - 1]}${p[0] !== String(new Date().getFullYear()) ? " " + p[0].slice(2) : ""}`; };
  const mesLargo = m => { const p = m.split("-"); return `${MES_LARGO[+p[1] - 1]} ${p[0]}`; };
  const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const isoMas = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const mesMas = (m, n) => { const p = m.split("-"); const d = new Date(+p[0], +p[1] - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const trimDe = m => { const p = m.split("-"); return `${p[0]}-Q${Math.floor((+p[1] - 1) / 3) + 1}`; };
  const mesesDeTrim = q => { const [a, t] = q.split("-Q"); const i = (+t - 1) * 3 + 1; return [0, 1, 2].map(k => `${a}-${String(i + k).padStart(2, "0")}`); };
  const mesActual = () => hoyISO().slice(0, 7);

  /* ---- Config por defecto ------------------------------------------------
     Es la MISMA que siembra el SQL. Se usa mientras la tabla no exista (o en el
     banco de pruebas); en cuanto hay fila en resultados_config, manda la base.  */
  const DEFAULT = {
    whatsapp: {
      nombre: "WhatsApp Profesionales", funcion: "Fidelizar", verbos: "Relacionar · Aportar valor · Fidelizar",
      objetivo: "Sostener cercanía y relevancia con la comunidad profesional.", base: "2026-Q4",
      datos: [
        { k: "leidos", t: "Leído por", nivel: "pieza", ayuda: "Mantener presionado el mensaje → Info, a las 48 h" },
        { k: "votantes", t: "Votantes únicos", nivel: "pieza", solo: "encuesta", ayuda: "Ver votos: contar personas, no votos" },
        { k: "respuestas", t: "Respuestas", nivel: "pieza", ayuda: "En el grupo + privados" },
        { k: "clics", t: "Clics", nivel: "pieza", ayuda: "GA4 · utm_content de la pieza", opcional: true },
        { k: "miembros", t: "Miembros al 1°", nivel: "mes" },
        { k: "altas", t: "Altas", nivel: "mes" },
        { k: "bajas", t: "Bajas", nivel: "mes" },
        { k: "obras", t: "Obras recibidas", nivel: "mes" },
        { k: "descargas", t: "Descargas", nivel: "mes", ayuda: "Del recurso exclusivo del mes" },
        { k: "consultas", t: "Consultas a comercial", nivel: "mes" },
      ],
      kpis: [
        { k: "lecturas", t: "Lecturas", f: "cociente", num: "leidos", den: "miembros", fmt: "pct", ayuda: "Leído por ÷ miembros, promedio por mensaje" },
        { k: "clics", t: "Clics", f: "suma", dato: "clics" },
        { k: "respuestas", t: "Respuestas", f: "suma", dato: "respuestas" },
        { k: "participacion", t: "Participación", f: "cociente", num: "votantes", den: "miembros", fmt: "pct", ayuda: "Votantes únicos ÷ miembros, por encuesta" },
        { k: "neto", t: "Altas y bajas", f: "resta", a: "altas", b: "bajas", fmt: "signo" },
        { k: "acciones", t: "Acciones generadas", f: "sumas", datos: ["obras", "descargas", "consultas"] },
      ],
      embudo: [
        { t: "Miembros", f: "ultimo", dato: "miembros" },
        { t: "Leen", f: "promedio", dato: "leidos", nota: "por mensaje" },
        { t: "Participan", f: "promedio", dato: "votantes", nota: "por encuesta" },
        { t: "Actúan", f: "sumas", datos: ["obras", "descargas", "consultas"] },
      ],
    },
    instagram: {
      nombre: "Instagram Leuk", funcion: "Posicionar", verbos: "Inspirar · Educar · Posicionar",
      objetivo: "Fortalecer el posicionamiento y la consideración de las soluciones Leuk.", base: "2026-Q4",
      datos: [
        { k: "alcance", t: "Alcance", nivel: "pieza", ayuda: "Estadísticas de la publicación" },
        { k: "alcance_ns", t: "Alcance a no seguidores", nivel: "pieza" },
        { k: "interacciones", t: "Interacciones", nivel: "pieza", ayuda: "Me gusta + comentarios + compartidos + guardados" },
        { k: "guardados", t: "Guardados", nivel: "pieza" },
        { k: "visitas", t: "Visitas al perfil", nivel: "pieza" },
        { k: "clics", t: "Clics al sitio web", nivel: "pieza" },
      ],
      kpis: [
        { k: "alcance_ns", t: "Alcance a no seguidores", f: "suma", dato: "alcance_ns" },
        { k: "pct_ns", t: "% de alcance a no seguidores", f: "cociente", num: "alcance_ns", den: "alcance", fmt: "pct" },
        { k: "engagement", t: "Engagement rate", f: "cociente", num: "interacciones", den: "alcance", fmt: "pct", ayuda: "Interacciones ÷ alcance" },
        { k: "guardados", t: "Guardados", f: "suma", dato: "guardados" },
        { k: "visitas", t: "Visitas al perfil", f: "suma", dato: "visitas" },
        { k: "clics", t: "Clics al sitio web", f: "suma", dato: "clics" },
      ],
      embudo: [
        { t: "Alcance", f: "suma", dato: "alcance" },
        { t: "Interactúan", f: "suma", dato: "interacciones" },
        { t: "Visitan el perfil", f: "suma", dato: "visitas" },
        { t: "Clics a la web", f: "suma", dato: "clics" },
      ],
    },
  };

  /* Mailing: un envío = una pieza, y cada envío va a UN destino (columna `tipo` de contenidos).
     Los números salen del reporte del envío en Odoo (Email Marketing). La conversión es distinta
     según el destino (solo = destino al que se le pide): especificaciones para Profesionales,
     pedidos para Distribuidores. `destinos` activa el selector de destino en la pantalla. */
  DEFAULT.mailing = {
    nombre: "Mailing", funcion: "Convertir", verbos: "Informar · Activar · Convertir",
    objetivo: "Que cada envío llegue, se abra y termine en una especificación (Profesionales) o en un pedido (Distribuidores).", base: "2026-Q4",
    fuente: "Odoo", unidad: "envío",
    destinos: [{ k: "profesionales", t: "Profesionales" }, { k: "distribuidores", t: "Distribuidores" }],
    datos: [
      { k: "enviados", t: "Enviados", nivel: "pieza", ayuda: "Odoo → Email Marketing → el envío → Enviados" },
      { k: "entregados", t: "Recibidos", nivel: "pieza", ayuda: "Odoo → Recibidos (enviados menos rebotados)" },
      { k: "abiertos", t: "Abiertos", nivel: "pieza", ayuda: "Odoo → Abiertos" },
      { k: "clics", t: "Clics", nivel: "pieza", ayuda: "Odoo → Clics" },
      { k: "rebotados", t: "Rebotados", nivel: "pieza", ayuda: "Odoo → Rebotados" },
      { k: "bajas", t: "Bajas", nivel: "pieza", ayuda: "Contactos que se dieron de baja a partir de este envío" },
      { k: "conv_espec", t: "Especificaciones", nivel: "pieza", solo: "profesionales", ayuda: "Especificaciones que salieron de este envío (sólo Profesionales)" },
      { k: "conv_pedidos", t: "Pedidos", nivel: "pieza", solo: "distribuidores", ayuda: "Pedidos que salieron de este envío (sólo Distribuidores)" },
    ],
    kpis: [
      { k: "apertura", t: "Tasa de apertura", f: "cociente", num: "abiertos", den: "entregados", fmt: "pct", ayuda: "Abiertos ÷ recibidos" },
      { k: "ctr", t: "CTR", f: "cociente", num: "clics", den: "entregados", fmt: "pct", ayuda: "Clics ÷ recibidos" },
      { k: "ctor", t: "CTOR", f: "cociente", num: "clics", den: "abiertos", fmt: "pct", ayuda: "Clics ÷ abiertos: de los que abren, cuántos hacen clic" },
      { k: "rebote", t: "Tasa de rebote", f: "cociente", num: "rebotados", den: "enviados", fmt: "pct", ayuda: "Rebotados ÷ enviados" },
      { k: "bajas", t: "Bajas", f: "suma", dato: "bajas" },
      { k: "espec", t: "Especificaciones", f: "suma", dato: "conv_espec", solo: "profesionales", ayuda: "Conversión de Profesionales" },
      { k: "pedidos", t: "Pedidos", f: "suma", dato: "conv_pedidos", solo: "distribuidores", ayuda: "Conversión de Distribuidores" },
    ],
    embudo: [
      { t: "Enviados", f: "suma", dato: "enviados" },
      { t: "Recibidos", f: "suma", dato: "entregados" },
      { t: "Abren", f: "suma", dato: "abiertos" },
      { t: "Hacen clic", f: "suma", dato: "clics" },
      { t: "Convierten", f: "sumas", datos: ["conv_espec", "conv_pedidos"], nota: "especificaciones + pedidos" },
    ],
  };

  /* ---- Estado ---- */
  let CTX = null;          // {canal, mes, puedeCargar, irAFicha}
  let CFG = null;          // config del canal
  let SIN_TABLA = false;   // falta correr el SQL: se ve, pero no se guarda
  let PIEZAS = [];         // [{id, mes, fecha, criterio, estado, encuesta}] del canal
  let V = {};              // "mes|pieza|dato" -> número
  let DEST = "";           // destino elegido (Mailing): "" = todos
  let PERIODO = "trim";    // mes | trim | 12m | todo
  let DETALLE = "";        // mes abierto en el histórico
  let CARGADO = "";        // canal cuyos datos están en memoria
  const RAIZ = () => CTX && CTX.el;

  const clave = (mes, pieza, dato) => `${mes}|${pieza || ""}|${dato}`;
  const datoDef = k => (CFG.datos || []).find(d => d.k === k) || { k, nivel: "pieza" };
  // `solo`: "encuesta" (WhatsApp) o la clave de un destino (Mailing: el dato sólo se pide a ese destino).
  const aplica = (d, p) => !d.solo || (d.solo === "encuesta" ? !!(p.encuesta && p.encuesta.q) : p.tipo === d.solo);
  const U = () => CFG.unidad || (CTX.canal === "instagram" ? "pieza" : "mensaje");
  const kpisVis = () => (CFG.kpis || []).filter(k => !DEST || !k.solo || k.solo === DEST);
  const sinDestino = p => (CFG.destinos || []).length && !CFG.destinos.some(x => x.k === p.tipo);
  // Una pieza se mide cuando ya salió. "Publicado" no alcanza como regla: no siempre se marca.
  const medible = p => p.fecha <= hoyISO();

  async function traer() {
    const c = CTX.canal;
    const [rc, rv, rp] = await Promise.all([
      fetch(url(`resultados_config?canal=eq.${enc(c)}&select=config`), { headers: head() }).catch(() => null),
      fetch(url(`resultados_valores?canal=eq.${enc(c)}&select=mes,pieza,dato,valor`), { headers: head() }).catch(() => null),
      fetch(url(`contenidos?canal=in.(${enc(c)})&select=id,mes,fecha,criterio,estado,encuesta,tipo&order=fecha.asc`), { headers: head() }).catch(() => null),
    ]);
    SIN_TABLA = !rv || !rv.ok;
    const cfg = rc && rc.ok ? (await rc.json())[0] : null;
    CFG = (cfg && cfg.config) || DEFAULT[c] || DEFAULT.whatsapp;
    V = {};
    if (rv && rv.ok) (await rv.json()).forEach(r => { if (r.valor != null) V[clave(r.mes, r.pieza, r.dato)] = +r.valor; });
    PIEZAS = rp && rp.ok ? await rp.json() : [];
    CARGADO = c;
  }

  /* ===================== CÁLCULO =====================
     Todo se calcula desde los crudos sobre un conjunto de meses: el mes, el
     trimestre o el año salen de la misma cuenta, nunca de promediar promedios. */
  // `todas`: sin el filtro de destino (la carga y los pendientes siempre ven todos los envíos).
  const piezasDe = (meses, todas) => PIEZAS.filter(p => meses.includes(p.mes) && medible(p) && (todas || !DEST || p.tipo === DEST));
  const vP = (p, k) => V[clave(p.mes, p.id, k)];
  const vM = (m, k) => V[clave(m, "", k)];

  function suma(k, meses) {
    let s = 0, hay = false;
    if (datoDef(k).nivel === "mes") meses.forEach(m => { const v = vM(m, k); if (v != null) { s += v; hay = true; } });
    else piezasDe(meses).forEach(p => { const v = vP(p, k); if (v != null) { s += v; hay = true; } });
    return hay ? s : null;
  }
  function calc(f, meses) {
    if (!f) return null;
    switch (f.f) {
      case "suma": return suma(f.dato, meses);
      case "sumas": {
        const xs = (f.datos || []).map(k => suma(k, meses)).filter(x => x != null);
        return xs.length ? xs.reduce((a, b) => a + b, 0) : null;
      }
      case "promedio": {
        const xs = piezasDe(meses).map(p => vP(p, f.dato)).filter(x => x != null);
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
      }
      case "resta": {
        const a = suma(f.a, meses), b = suma(f.b, meses);
        return a == null && b == null ? null : (a || 0) - (b || 0);
      }
      case "ultimo": {
        for (let i = meses.length - 1; i >= 0; i--) { const v = vM(meses[i], f.dato); if (v != null) return v; }
        return null;
      }
      case "cociente": {
        const nN = datoDef(f.num).nivel, nD = datoDef(f.den).nivel;
        if (nN === "pieza" && nD === "mes") {
          // Cada pieza contra los miembros de SU mes, y después el promedio.
          const xs = piezasDe(meses).map(p => { const n = vP(p, f.num), d = vM(p.mes, f.den); return n != null && d ? n / d : null; }).filter(x => x != null);
          return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
        }
        if (nN === "pieza" && nD === "pieza") {
          let n = 0, d = 0;
          piezasDe(meses).forEach(p => { const a = vP(p, f.num), b = vP(p, f.den); if (a != null && b) { n += a; d += b; } });
          return d ? n / d : null;
        }
        const n = suma(f.num, meses), d = suma(f.den, meses);
        return n != null && d ? n / d : null;
      }
    }
    return null;
  }
  // El mismo KPI para una sola pieza (detalle del histórico). Sólo tiene sentido si el numerador es de la pieza.
  function calcPieza(f, p) {
    if (f.f === "suma") return datoDef(f.dato).nivel === "pieza" ? vP(p, f.dato) ?? null : null;
    if (f.f === "cociente" && datoDef(f.num).nivel === "pieza") {
      const n = vP(p, f.num), d = datoDef(f.den).nivel === "mes" ? vM(p.mes, f.den) : vP(p, f.den);
      return n != null && d ? n / d : null;
    }
    return null;
  }

  const nf = (x, dec) => x.toLocaleString("es-AR", { maximumFractionDigits: dec, minimumFractionDigits: 0 });
  function fmt(k, x) {
    if (x == null || isNaN(x)) return "—";
    if (k.fmt === "pct") return nf(x * 100, 1) + "%";
    const s = nf(Math.abs(x) >= 100 ? Math.round(x) : x, 1);
    return k.fmt === "signo" && x > 0 ? "+" + s : s;
  }
  function delta(k, a, b) {
    if (a == null || b == null) return "";
    const d = a - b;
    const redondo = k.fmt === "pct" ? Math.round(d * 1000) : Math.round(d * 10);
    if (!redondo) return `<span class="rs-d igual">= que antes</span>`;
    const t = k.fmt === "pct" ? `${d > 0 ? "+" : "−"}${nf(Math.abs(d) * 100, 1)} pts` : `${d > 0 ? "+" : "−"}${nf(Math.abs(d), 1)}`;
    return `<span class="rs-d ${d > 0 ? "sube" : "baja"}">${t}</span>`;
  }

  /* ---- Períodos ---- */
  const PERIODOS = [
    { k: "mes", t: "Mes" }, { k: "trim", t: "Trimestre" }, { k: "12m", t: "12 meses" }, { k: "todo", t: "Todo" },
  ];
  function todosLosMeses() {
    const s = new Set(PIEZAS.map(p => p.mes));
    Object.keys(V).forEach(k => s.add(k.split("|")[0]));
    return [...s].filter(m => m <= mesActual()).sort();
  }
  function mesesPeriodo() {
    const m = CTX.mes;
    if (PERIODO === "mes") return [m];
    if (PERIODO === "trim") return mesesDeTrim(trimDe(m));
    if (PERIODO === "12m") {
      // Sin columnas vacías antes de que empiece a haber datos.
      const primero = todosLosMeses()[0] || m;
      return Array.from({ length: 12 }, (_, i) => mesMas(m, i - 11)).filter(x => x >= primero);
    }
    const t = todosLosMeses(); return t.length ? t : [m];
  }
  // Los meses del gráfico: en "Mes" se muestran los 6 anteriores para tener contra qué mirar.
  function mesesGrafico() {
    const ms = PERIODO === "mes" ? Array.from({ length: 6 }, (_, i) => mesMas(CTX.mes, i - 5)) : mesesPeriodo();
    return ms.filter(x => x <= mesActual());
  }
  function periodoAnterior() {
    const m = CTX.mes;
    if (PERIODO === "mes") return { ms: [mesMas(m, -1)], t: mesLargo(mesMas(m, -1)).split(" ")[0] };
    if (PERIODO === "trim") { const q = trimDe(mesMas(mesesDeTrim(trimDe(m))[0], -1)); return { ms: mesesDeTrim(q), t: q.replace("-", " ") }; }
    return null;
  }
  const etiquetaPeriodo = () => PERIODO === "mes" ? mesLargo(CTX.mes)
    : PERIODO === "trim" ? trimDe(CTX.mes).replace("-", " ")
    : PERIODO === "12m" ? `${mesCorto(mesesPeriodo()[0])} – ${mesCorto(CTX.mes)}` : "todo el historial";

  /* ===================== PINTAR ===================== */
  window.LeukResultados = {
    // contenidos.js la llama al abrir la vista. el = contenedor; ctx = {canal, mes, puedeCargar, irAFicha}
    async montar(el, ctx) {
      const cambioCanal = !CTX || CTX.canal !== ctx.canal;
      // El selector de Contenidos suele estar en el mes que se está planificando (el que
      // viene). Ese mes todavía no tiene resultados: se muestra el mes en curso y se avisa.
      const futuro = ctx.mes > mesActual();
      CTX = Object.assign({}, ctx, { el, mes: futuro ? mesActual() : ctx.mes, mesPedido: futuro ? ctx.mes : "" });
      if (cambioCanal) { DETALLE = ""; DEST = ""; }
      if (CARGADO !== ctx.canal || cambioCanal) {
        el.innerHTML = `<div class="empty-mini">Cargando resultados…</div>`;
        await traer();
      }
      pintar();
    },
    async refrescar() { if (CTX) { await traer(); pintar(); } },
  };

  function pintar() {
    const el = RAIZ(); if (!el) return;
    el.innerHTML = `
      <div class="rs">
        ${cabeceraHTML()}
        ${SIN_TABLA ? `<p class="rs-aviso">Falta correr el SQL de resultados en Supabase: podés ver la pantalla, pero todavía no se guardan datos.</p>` : ""}
        <div data-rs-res>${resultadosHTML()}</div>
        ${cargaHTML()}
      </div>`;
    enganchar();
  }
  // Al cargar un número se repinta sólo la parte de resultados: la grilla de carga
  // queda quieta y no se pierde el campo en el que estás.
  function repintarResultados() {
    const r = RAIZ() && RAIZ().querySelector("[data-rs-res]"); if (!r) return;
    r.innerHTML = resultadosHTML();
    const pend = RAIZ().querySelector("[data-rs-pend-carga]");
    if (pend) pend.textContent = faltanTxt(pendientesCarga().length);
  }

  const faltanTxt = n => !n ? "Completo" : n === 1 ? "Falta 1 dato" : `Faltan ${n} datos`;

  function cabeceraHTML() {
    return `<div class="rs-cab">
      <div class="rs-fun">
        <span class="rs-etapa">${esc(CFG.funcion || "")}</span>
        <p class="rs-verbos">${esc(CFG.verbos || "")}</p>
        <p class="rs-obj">${esc(CFG.objetivo || "")}</p>
      </div>
      ${(CFG.destinos || []).length ? `<div class="rs-per" role="group" aria-label="Destino">
        ${[{ k: "", t: "Todos" }, ...CFG.destinos].map(x => `<button data-rs-dest="${x.k}" class="${DEST === x.k ? "on" : ""}">${esc(x.t)}</button>`).join("")}
      </div>` : ""}
      <div class="rs-per" role="group" aria-label="Período">
        ${PERIODOS.map(p => `<button data-rs-per="${p.k}" class="${PERIODO === p.k ? "on" : ""}">${p.t}</button>`).join("")}
      </div>
    </div>`;
  }

  function resultadosHTML() {
    const ms = mesesPeriodo();
    const hayAlgo = ms.some(m => piezasDe([m]).some(p => (CFG.datos || []).some(d => vP(p, d.k) != null)) ||
                                 (CFG.datos || []).some(d => vM(m, d.k) != null));
    return `
      ${pendientesHTML()}
      <p class="rs-periodo">Resultados de <b>${esc(etiquetaPeriodo())}</b>${baseTxt()}${CTX.mesPedido
        ? ` <span class="rs-futuro">· ${esc(cap(mesLargo(CTX.mesPedido).split(" ")[0]))} todavía no empezó: te muestro ${esc(mesLargo(CTX.mes).split(" ")[0])}</span>` : ""}</p>
      ${hayAlgo ? `<div class="rs-top">
        <section class="rs-card rs-emb"><h3>Embudo</h3>${embudoHTML(ms)}</section>
        <section class="rs-card rs-evo"><h3>Evolución de cada KPI</h3>${evolucionHTML()}</section>
      </div>` : `<div class="rs-card rs-vacio">Todavía no hay datos cargados para este período.${CTX.puedeCargar ? " Cargalos abajo y los resultados aparecen solos." : ""}</div>`}
      <section class="rs-card"><div class="rs-hist-cab"><h3>Histórico</h3>
        <button class="btn-mini" data-rs-excel>⬇ Bajar a Excel</button></div>
        ${historicoHTML()}</section>`;
  }
  function baseTxt() {
    const b = CFG.base; if (!b) return "";
    return trimDe(CTX.mes) === b && PERIODO !== "12m" && PERIODO !== "todo"
      ? ` · <span class="rs-base-tag">trimestre base</span>` : ` · base: ${esc(b.replace("-", " "))}`;
  }

  /* ---- ¿Está completo? ---- */
  function pendientesCarga() {
    const falta = [];
    const limite = isoMas(-2);   // a las 48 h ya tendría que estar
    const ms = PERIODO === "mes" || PERIODO === "trim" ? mesesPeriodo() : [CTX.mes];
    piezasDe(ms, true).filter(p => p.fecha <= limite).forEach(p => {
      if (sinDestino(p)) falta.push({ p, d: { t: "Destino (se elige en la ficha del envío)" } });
      (CFG.datos || []).filter(d => d.nivel === "pieza" && !d.opcional && aplica(d, p) && vP(p, d.k) == null)
        .forEach(d => falta.push({ p, d }));
    });
    ms.filter(m => m <= mesActual()).forEach(m => {
      // El dato del mes que hace falta desde el día 1 (miembros) se pide siempre; el resto, al cerrar el mes.
      (CFG.datos || []).filter(d => d.nivel === "mes" && !d.opcional && vM(m, d.k) == null &&
        (m < mesActual() || usadoComoDen(d.k))).forEach(d => falta.push({ m, d }));
    });
    return falta;
  }
  const usadoComoDen = k => (CFG.kpis || []).some(x => x.den === k) || (CFG.embudo || []).some(x => x.f === "ultimo" && x.dato === k);

  function pendientesHTML() {
    const f = pendientesCarga();
    if (!f.length) return `<p class="rs-ok">✓ Datos al día</p>`;
    const porPieza = {}, porMes = {};
    f.forEach(x => { if (x.p) (porPieza[x.p.id] = porPieza[x.p.id] || { p: x.p, ds: [] }).ds.push(x.d.t);
                     else (porMes[x.m] = porMes[x.m] || []).push(x.d.t); });
    const chips = [
      ...Object.values(porPieza).map(({ p, ds }) => `<span class="rs-chip" title="${esc(ds.join(", "))}">${p.fecha.slice(8, 10)}/${p.fecha.slice(5, 7)} · ${esc(recorte(p.criterio, 28))}</span>`),
      ...Object.keys(porMes).map(m => `<span class="rs-chip" title="${esc(porMes[m].join(", "))}">Datos de ${mesLargo(m).split(" ")[0]}: ${esc(porMes[m].slice(0, 2).join(", "))}${porMes[m].length > 2 ? "…" : ""}</span>`),
    ].join("");
    return `<div class="rs-pend"><span class="rs-pend-t">Falta cargar</span>${chips}
      ${CTX.puedeCargar ? `<button class="btn-mini" data-rs-ir-carga>Cargar ahora</button>` : ""}</div>`;
  }
  const recorte = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

  /* ---- Embudo vertical ----
     El ancho de cada escalón es fijo (las unidades no son las mismas: miembros,
     lecturas por mensaje, acciones). Lo que se compara es cuánto pasa de uno al
     siguiente, y se marca sólo el corte más grande: ahí conviene mirar.      */
  function embudoHTML(ms) {
    const pasos = (CFG.embudo || []).map(s => ({ s, v: calc(s, ms) }));
    const n = pasos.length; if (!n) return "";
    const W = 300, H = 62, G = 26, top = 290, bot = 110;
    const ancho = i => top - (top - bot) * i / Math.max(1, n);
    const pasa = pasos.map((x, i) => i && x.v != null && pasos[i - 1].v ? x.v / pasos[i - 1].v : null);
    const validos = pasa.filter(x => x != null && x <= 1);
    const peor = validos.length > 1 ? pasa.indexOf(Math.min(...validos)) : -1;
    const tonos = ["var(--olive-pale)", "var(--olive-soft)", "var(--olive-mid)", "var(--olive)", "#4d5040", "#3b3d31"];
    const txtOsc = i => i >= 2;
    let y = 0, svg = "";
    pasos.forEach((x, i) => {
      const a = ancho(i), b = ancho(i + 1), cx = W / 2;
      if (i) {
        const p = pasa[i];
        svg += `<text x="${cx}" y="${y - 8}" text-anchor="middle" class="rs-emb-pasa ${i === peor ? "peor" : ""}">${
          p == null ? "" : p > 1 ? "↑ más que el escalón anterior" : `↓ pasa el ${nf(p * 100, 0)}%${i === peor ? " · el corte más grande" : ""}`}</text>`;
      }
      svg += `<polygon points="${cx - a / 2},${y} ${cx + a / 2},${y} ${cx + b / 2},${y + H} ${cx - b / 2},${y + H}" fill="${tonos[Math.min(i, tonos.length - 1)]}"/>
        <text x="${cx}" y="${y + 25}" text-anchor="middle" class="rs-emb-t ${txtOsc(i) ? "claro" : ""}">${esc(x.s.t)}${x.s.nota ? ` <tspan class="rs-emb-nota">${esc(x.s.nota)}</tspan>` : ""}</text>
        <text x="${cx}" y="${y + 48}" text-anchor="middle" class="rs-emb-v ${txtOsc(i) ? "claro" : ""}">${x.v == null ? "—" : nf(x.v >= 100 ? Math.round(x.v) : x.v, 1)}</text>`;
      y += H + G;
    });
    return `<svg viewBox="0 0 ${W} ${y - G}" class="rs-emb-svg" role="img" aria-label="Embudo de ${esc(CFG.nombre || "")}">${svg}</svg>
      <p class="rs-nota">El % es cuánto pasa de un escalón al siguiente. Algunos pasos no son subconjuntos exactos del anterior: sirve para comparar mes a mes.</p>`;
  }

  /* ---- Evolución: un gráfico chico por KPI ---- */
  function evolucionHTML() {
    const ms = mesesGrafico();
    const base = CFG.base ? mesesDeTrim(CFG.base).filter(m => m <= mesActual()) : [];
    const ant = periodoAnterior();
    return `<div class="rs-kpis">${kpisVis().map(k => {
      const actual = calc(k, mesesPeriodo());
      const serie = ms.map(m => calc(k, [m]));
      const vBase = base.length ? calc(k, base) : null;
      return `<div class="rs-kpi" title="${esc(k.ayuda || "")}">
        <span class="rs-kpi-t">${esc(k.t)}</span>
        <b>${fmt(k, actual)}</b>
        ${ant ? delta(k, actual, calc(k, ant.ms)) + (calc(k, ant.ms) != null ? `<span class="rs-d-vs"> vs ${esc(ant.t)}</span>` : "") : ""}
        ${grafico(ms, serie, vBase)}
      </div>`;
    }).join("")}</div>
    <p class="rs-nota">Línea punteada = base (${esc((CFG.base || "").replace("-", " "))}). Cuando haya metas trimestrales se suman al gráfico.</p>`;
  }
  function grafico(ms, serie, vBase) {
    const W = 180, H = 54, P = 6;
    const vals = serie.filter(x => x != null).concat(vBase != null ? [vBase] : []);
    if (!vals.length) return `<svg viewBox="0 0 ${W} ${H + 14}" class="rs-graf"><text x="${W / 2}" y="${H / 2 + 4}" text-anchor="middle" class="rs-graf-eje">sin datos</text></svg>`;
    // Escala ajustada a los valores (con aire): con el eje en cero, 58% → 60% se veía plano.
    let min = Math.min(...vals), max = Math.max(...vals);
    const aire = (max - min) * 0.25 || Math.abs(max) * 0.1 || 1;
    min -= aire; max += aire;
    const X = i => ms.length === 1 ? W / 2 : P + (W - 2 * P) * i / (ms.length - 1);
    const Y = v => H - P - (H - 2 * P) * (v - min) / (max - min);
    let path = "", pts = "";
    serie.forEach((v, i) => {
      if (v == null) return;
      const prev = i && serie[i - 1] != null;
      path += `${prev ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)} `;
      pts += `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${i === serie.length - 1 ? 3.2 : 2.2}" class="rs-graf-pt ${i === serie.length - 1 ? "ult" : ""}"/>`;
    });
    const eje = ms.map((m, i) => (i === 0 || i === ms.length - 1 || ms.length <= 6) ? `<text x="${X(i).toFixed(1)}" y="${H + 12}" text-anchor="middle" class="rs-graf-eje">${mesCorto(m)}</text>` : "").join("");
    return `<svg viewBox="0 0 ${W} ${H + 14}" class="rs-graf" aria-hidden="true">
      ${vBase != null ? `<line x1="0" x2="${W}" y1="${Y(vBase).toFixed(1)}" y2="${Y(vBase).toFixed(1)}" class="rs-graf-base"/>` : ""}
      <path d="${path}" class="rs-graf-l"/>${pts}${eje}</svg>`;
  }

  /* ---- Histórico ---- */
  function historicoHTML() {
    const ms = PERIODO === "mes" ? mesesGrafico() : mesesPeriodo().filter(m => m <= mesActual());
    const col = PERIODO === "mes" ? "" : `<th class="rs-tot">${esc(etiquetaPeriodo())}</th>`;
    return `<div class="rs-scroll"><table class="rs-hist">
      <thead><tr><th>KPI</th>${ms.map(m => `<th><button data-rs-mes="${m}" class="${DETALLE === m ? "on" : ""}" title="Ver el detalle por pieza">${mesCorto(m)}</button></th>`).join("")}${col}</tr></thead>
      <tbody>${kpisVis().map(k => `<tr><td>${esc(k.t)}</td>${ms.map(m => `<td>${fmt(k, calc(k, [m]))}</td>`).join("")}${PERIODO === "mes" ? "" : `<td class="rs-tot">${fmt(k, calc(k, mesesPeriodo()))}</td>`}</tr>`).join("")}</tbody>
    </table></div>
    <p class="rs-nota">Tocá un mes para ver cada ${U()} con su resultado.</p>
    ${DETALLE ? detalleHTML(DETALLE) : ""}`;
  }
  function detalleHTML(m) {
    const ps = piezasDe([m]);
    const pk = (CFG.kpis || []).filter(k => ps.some(p => calcPieza(k, p) != null) || (k.f === "suma" && datoDef(k.dato).nivel === "pieza") || (k.f === "cociente" && datoDef(k.num).nivel === "pieza"));
    if (!ps.length) return `<div class="rs-det"><h4>${cap(mesLargo(m))}</h4><p class="rs-nota">No hay piezas publicadas ese mes.</p></div>`;
    return `<div class="rs-det"><h4>${cap(mesLargo(m))} · pieza por pieza</h4>
      <div class="rs-scroll"><table class="rs-hist">
        <thead><tr><th>Pieza</th>${pk.map(k => `<th>${esc(k.t)}</th>`).join("")}</tr></thead>
        <tbody>${ps.map(p => `<tr><td><button class="rs-link" data-rs-ficha="${p.id}" data-rs-fmes="${p.mes}">${p.fecha.slice(8, 10)}/${p.fecha.slice(5, 7)} · ${esc(recorte(p.criterio, 34))}</button></td>
          ${pk.map(k => { const v = calcPieza(k, p); return `<td>${v == null ? "—" : fmt(k, v)}</td>`; }).join("")}</tr>`).join("")}</tbody>
      </table></div></div>`;
  }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---- Carga de datos del mes elegido ---- */
  function cargaHTML() {
    const m = CTX.mes;
    const ps = piezasDe([m], true);
    const dp = (CFG.datos || []).filter(d => d.nivel === "pieza");
    const dm = (CFG.datos || []).filter(d => d.nivel === "mes");
    const ed = CTX.puedeCargar && !SIN_TABLA;
    const inp = (mes, pieza, d, p) => {
      if (p && !aplica(d, p)) return `<td class="rs-na">—</td>`;
      const v = V[clave(mes, pieza, d.k)];
      return `<td><input type="number" inputmode="numeric" min="0" step="any" ${ed ? "" : "disabled"}
        data-rs-in="${mes}|${pieza}|${d.k}" value="${v == null ? "" : v}" aria-label="${esc(d.t)}"></td>`;
    };
    const falta = pendientesCarga().length;
    return `<details class="rs-card rs-carga" ${falta && CTX.puedeCargar ? "open" : ""} id="rs-carga-${CTX.canal}">
      <summary><h3>Cargar datos de ${mesLargo(m).split(" ")[0]}</h3>
        <span class="rs-carga-est" data-rs-pend-carga>${faltanTxt(falta)}</span></summary>
      ${ed ? `<p class="rs-nota">Sólo números, tal cual los da ${CFG.fuente || (CTX.canal === "instagram" ? "Instagram" : "WhatsApp")}. Se guarda solo al salir de cada casillero; los % los calcula la plataforma.</p>`
           : `<p class="rs-nota">${SIN_TABLA ? "Se habilita cuando esté corrido el SQL." : "Los carga quien hace este canal."}</p>`}
      ${ps.length ? `<div class="rs-scroll"><table class="rs-cargat">
        <thead><tr><th>${cap(U())}</th>${(CFG.destinos || []).length ? "<th>Destino</th>" : ""}${dp.map(d => `<th title="${esc(d.ayuda || "")}">${esc(d.t)}${d.opcional ? " <small>(opcional)</small>" : ""}</th>`).join("")}</tr></thead>
        <tbody>${ps.map(p => `<tr><td>${p.fecha.slice(8, 10)}/${p.fecha.slice(5, 7)} · ${esc(recorte(p.criterio, 30))}</td>${(CFG.destinos || []).length ? `<td>${esc(((CFG.destinos.find(x => x.k === p.tipo)) || {}).t || "Sin destino")}</td>` : ""}${dp.map(d => inp(m, p.id, d, p)).join("")}</tr>`).join("")}</tbody>
      </table></div>` : `<p class="rs-nota">Todavía no salió ninguna pieza de este mes.</p>`}
      ${dm.length ? `<h4 class="rs-carga-mes">Datos del mes</h4>
        <div class="rs-carga-grid">${dm.map(d => `<label title="${esc(d.ayuda || "")}"><span>${esc(d.t)}</span>
          <input type="number" inputmode="numeric" min="0" step="any" ${ed ? "" : "disabled"} data-rs-in="${m}||${d.k}" value="${V[clave(m, "", d.k)] ?? ""}"></label>`).join("")}</div>` : ""}
    </details>`;
  }

  async function guardar(el) {
    const [mes, pieza, dato] = el.dataset.rsIn.split("|");
    const k = clave(mes, pieza, dato);
    const txt = el.value.trim().replace(",", ".");
    const nuevo = txt === "" ? null : +txt;
    if (nuevo != null && (isNaN(nuevo) || nuevo < 0)) { el.classList.add("mal"); return; }
    el.classList.remove("mal");
    if ((V[k] ?? null) === nuevo) return;
    const antes = V[k];
    if (nuevo == null) delete V[k]; else V[k] = nuevo;
    repintarResultados();
    el.classList.add("guardando");
    let r;
    try {
      r = nuevo == null
        ? await fetch(url(`resultados_valores?canal=eq.${enc(CTX.canal)}&mes=eq.${enc(mes)}&pieza=eq.${enc(pieza)}&dato=eq.${enc(dato)}`), { method: "DELETE", headers: head() })
        : await fetch(url("resultados_valores?on_conflict=canal,mes,pieza,dato"), {
            method: "POST", headers: head({ Prefer: "resolution=merge-duplicates,return=minimal" }),
            body: JSON.stringify([{ canal: CTX.canal, mes, pieza, dato, valor: nuevo, autor_email: SES().email ? SES().email() : "", actualizado: new Date().toISOString() }]),
          });
    } catch (e) { r = null; }
    el.classList.remove("guardando");
    if (!r || !r.ok) {
      if (antes == null) delete V[k]; else V[k] = antes;
      el.value = antes ?? ""; el.classList.add("mal"); repintarResultados();
      alert("No se pudo guardar ese dato. Probá de nuevo.");
      return;
    }
    el.classList.add("ok"); setTimeout(() => el.classList.remove("ok"), 900);
  }

  function exportar() {
    if (!window.XLSX) { alert("No se pudo cargar el exportador."); return; }
    const ms = todosLosMeses();
    const kpis = [["KPI", ...ms.map(mesLargo)], ...(CFG.kpis || []).map(k => [k.t, ...ms.map(m => {
      const v = calc(k, [m]); return v == null ? "" : k.fmt === "pct" ? Math.round(v * 1000) / 10 : Math.round(v * 10) / 10; })])];
    const dp = (CFG.datos || []).filter(d => d.nivel === "pieza");
    const cd = (CFG.destinos || []).length;
    const piezas = [["Mes", "Fecha", "Pieza", ...(cd ? ["Destino"] : []), ...dp.map(d => d.t)],
      ...PIEZAS.filter(medible).map(p => [p.mes, p.fecha, p.criterio, ...(cd ? [((CFG.destinos.find(x => x.k === p.tipo)) || {}).t || ""] : []), ...dp.map(d => vP(p, d.k) ?? "")])];
    const dm = (CFG.datos || []).filter(d => d.nivel === "mes");
    const mesesT = [["Mes", ...dm.map(d => d.t)], ...ms.map(m => [m, ...dm.map(d => vM(m, d.k) ?? "")])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpis), "KPIs por mes (% en pts)");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(piezas), "Datos por pieza");
    if (dm.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mesesT), "Datos del mes");
    XLSX.writeFile(wb, `resultados-${CTX.canal}-${hoyISO()}.xlsx`);
  }

  function enganchar() {
    const el = RAIZ(); if (!el || el.__rs) return;
    el.__rs = true;   // el contenedor es el mismo mientras dure la vista: un solo juego de listeners
    el.addEventListener("click", ev => {
      const t = ev.target.closest("button"); if (!t || !el.contains(t)) return;
      if (t.hasAttribute("data-rs-dest")) { DEST = t.dataset.rsDest; DETALLE = ""; pintar(); return; }
      if (t.dataset.rsPer) { PERIODO = t.dataset.rsPer; DETALLE = ""; pintar(); return; }
      if (t.dataset.rsMes) { DETALLE = DETALLE === t.dataset.rsMes ? "" : t.dataset.rsMes; repintarResultados(); return; }
      if (t.dataset.rsFicha) { CTX.irAFicha && CTX.irAFicha(t.dataset.rsFicha, t.dataset.rsFmes); return; }
      if (t.hasAttribute("data-rs-excel")) { exportar(); return; }
      if (t.hasAttribute("data-rs-ir-carga")) {
        const d = el.querySelector(".rs-carga"); if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth", block: "start" });
          const vacio = [...d.querySelectorAll("input[data-rs-in]:not([disabled])")].find(i => i.value === ""); if (vacio) setTimeout(() => vacio.focus(), 350); }
      }
    });
    el.addEventListener("change", ev => { const i = ev.target.closest("input[data-rs-in]"); if (i) guardar(i); });
    el.addEventListener("keydown", ev => {
      const i = ev.target.closest("input[data-rs-in]"); if (!i || ev.key !== "Enter") return;
      ev.preventDefault();
      const todos = [...el.querySelectorAll("input[data-rs-in]:not([disabled])")];
      const sig = todos[todos.indexOf(i) + 1]; if (sig) sig.focus(); else i.blur();
    });
  }

  /* ===================== EDITOR DE KPIs (Administración, sólo admin) =====================
     Edita la fila de resultados_config de cada canal: la ficha estratégica, los datos
     crudos que se cargan, los KPIs (con fórmulas de una lista corta) y el embudo.
     Se trabaja sobre una copia (ED) y se guarda todo junto con «Guardar cambios».

     Reglas para no romper lo cargado:
       · la clave interna de un dato (k) se inventa al crearlo y NUNCA cambia: los valores
         cargados cuelgan de ella. Renombrar un dato sólo cambia lo que se ve.
       · un dato que usa un KPI o el embudo no se puede borrar (se dice cuál lo usa).
       · borrar un dato con valores cargados no borra los valores: se dejan de mostrar.
     Canales: los que tienen página en Contenidos. Sumar uno nuevo necesita su página.   */
  const CANALES_ED = [{ k: "whatsapp", t: "WhatsApp Profesionales" }, { k: "instagram", t: "Instagram Leuk" }, { k: "mailing", t: "Mailing" }];
  const FUNCIONES = ["Posicionar", "Considerar", "Fidelizar"];
  const FORMULAS = [
    { f: "suma",     t: "Total de un dato",         ej: "Clics = total de clics" },
    { f: "sumas",    t: "Suma de varios datos",     ej: "Acciones = obras + descargas + consultas" },
    { f: "promedio", t: "Promedio por pieza",       ej: "Leen = promedio de «leído por»" },
    { f: "cociente", t: "División (A ÷ B)",         ej: "Engagement = interacciones ÷ alcance" },
    { f: "resta",    t: "Resta (A − B)",            ej: "Neto = altas − bajas" },
    { f: "ultimo",   t: "Último valor del período", ej: "Miembros al cierre" },
  ];
  const FORMATOS = [{ k: "", t: "Número" }, { k: "pct", t: "Porcentaje" }, { k: "signo", t: "Número con signo (+/−)" }];
  let ED = null, ED_CANAL = "whatsapp", ED_ORIG = "", ED_MSG = "", ED_DATOS = null;   // ED_DATOS = {piezas, v} del canal, para la vista previa

  const clon = o => JSON.parse(JSON.stringify(o));
  const sucio = () => ED && JSON.stringify(ED) !== ED_ORIG;
  const slug = t => String(t || "dato").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "dato";
  const usosDe = k => [...(ED.kpis || []).filter(x => refs(x).includes(k)).map(x => `KPI «${x.t}»`),
                       ...(ED.embudo || []).filter(x => refs(x).includes(k)).map(x => `embudo «${x.t}»`)];
  const refs = x => [x.dato, x.num, x.den, x.a, x.b, ...(x.datos || [])].filter(Boolean);

  window.renderKpisConfig = async function () {
    const cont = document.querySelector("#kpis"); if (!cont) return;
    if (!(SES().rol && SES().rol() === "admin")) { cont.innerHTML = `<div class="empty">Sólo un administrador puede ver esta sección.</div>`; return; }
    if (!ED || !sucio()) await edCargar(ED_CANAL);
    edPintar();
  };

  async function edCargar(canal) {
    ED_CANAL = canal; ED_MSG = "";
    const cont = document.querySelector("#kpis");
    if (cont) cont.innerHTML = `<div class="empty-mini">Cargando…</div>`;
    const [rc, rv, rp] = await Promise.all([
      fetch(url(`resultados_config?canal=eq.${enc(canal)}&select=config`), { headers: head() }).catch(() => null),
      fetch(url(`resultados_valores?canal=eq.${enc(canal)}&select=mes,pieza,dato,valor`), { headers: head() }).catch(() => null),
      fetch(url(`contenidos?canal=in.(${enc(canal)})&select=id,mes,fecha,criterio,estado,encuesta,tipo&order=fecha.asc`), { headers: head() }).catch(() => null),
    ]);
    const fila = rc && rc.ok ? (await rc.json())[0] : null;
    ED = clon((fila && fila.config) || DEFAULT[canal] || DEFAULT.whatsapp);
    ["datos", "kpis", "embudo"].forEach(k => { if (!Array.isArray(ED[k])) ED[k] = []; });
    ED_ORIG = JSON.stringify(ED);
    const v = {};
    if (rv && rv.ok) (await rv.json()).forEach(r => { if (r.valor != null) v[clave(r.mes, r.pieza, r.dato)] = +r.valor; });
    ED_DATOS = { piezas: rp && rp.ok ? await rp.json() : [], v };
  }

  // La vista previa usa el MISMO motor que la pantalla de Resultados, con la config en edición.
  function previa(f) {
    if (!ED_DATOS) return "";
    const guard = { CFG, PIEZAS, V };
    CFG = ED; PIEZAS = ED_DATOS.piezas; V = ED_DATOS.v;
    let txt = "";
    try {
      const ms = todosLosMeses().slice().reverse().find(m => calc(f, [m]) != null);
      txt = ms ? `${fmt(f, calc(f, [ms]))} en ${mesLargo(ms).split(" ")[0]}` : "sin datos todavía";
    } catch (e) { txt = "no se puede calcular"; }
    CFG = guard.CFG; PIEZAS = guard.PIEZAS; V = guard.V;
    CARGADO = "";   // la vista de Resultados vuelve a leer la config guardada
    return txt;
  }

  function edPintar() {
    const cont = document.querySelector("#kpis"); if (!cont || !ED) return;
    const opDatos = (sel, filtro) => `<option value="">Elegí un dato…</option>` + ED.datos.filter(filtro || (() => true))
      .map(d => `<option value="${esc(d.k)}" ${d.k === sel ? "selected" : ""}>${esc(d.t)}${d.nivel === "mes" ? " (del mes)" : ""}</option>`).join("");
    const formula = (x, path, soloEmbudo) => {
      const tipos = FORMULAS.filter(t => !soloEmbudo || ["suma", "sumas", "promedio", "ultimo"].includes(t.f));
      const pieza = d => d.nivel !== "mes";
      const mes = d => d.nivel === "mes";
      let args = "";
      if (x.f === "suma") args = `<select data-ed="${path}.dato">${opDatos(x.dato)}</select>`;
      if (x.f === "promedio") args = `<select data-ed="${path}.dato">${opDatos(x.dato, pieza)}</select>`;
      if (x.f === "ultimo") args = `<select data-ed="${path}.dato">${opDatos(x.dato, mes)}</select>`;
      if (x.f === "cociente") args = `<select data-ed="${path}.num">${opDatos(x.num)}</select><span class="kc-op">÷</span><select data-ed="${path}.den">${opDatos(x.den)}</select>`;
      if (x.f === "resta") args = `<select data-ed="${path}.a">${opDatos(x.a)}</select><span class="kc-op">−</span><select data-ed="${path}.b">${opDatos(x.b)}</select>`;
      if (x.f === "sumas") args = `<span class="kc-chks">${ED.datos.map(d => `<label><input type="checkbox" data-edsumas="${path}" value="${esc(d.k)}" ${(x.datos || []).includes(d.k) ? "checked" : ""}> ${esc(d.t)}</label>`).join("")}</span>`;
      return `<div class="kc-formula"><select data-ed="${path}.f" data-edre="1">${tipos.map(t => `<option value="${t.f}" ${t.f === x.f ? "selected" : ""}>${t.t}</option>`).join("")}</select>${args}</div>`;
    };
    const mover = (lista, i) => `<span class="kc-mover">
      <button class="kc-ico" data-edmover="${lista}:${i}:-1" ${i === 0 ? "disabled" : ""} aria-label="Subir">↑</button>
      <button class="kc-ico" data-edmover="${lista}:${i}:1" ${i === ED[lista].length - 1 ? "disabled" : ""} aria-label="Bajar">↓</button>
      <button class="kc-ico peligro" data-edborrar="${lista}:${i}" aria-label="Eliminar">✕</button></span>`;
    const trims = (() => { const a = new Date().getFullYear(); const r = []; for (let y = a - 1; y <= a + 1; y++) for (let q = 1; q <= 4; q++) r.push(`${y}-Q${q}`); return r; })();

    cont.innerHTML = `
      <header class="mh"><div class="mh-top"><div class="mh-tit"><h1>KPIs por canal</h1>
        <p class="mh-sub">Qué se mide en cada canal y cómo se calcula. Lo que cambies acá se ve en la vista Resultados de ese canal.</p></div></div></header>
      <div class="kc">
        <div class="kc-canales" role="tablist">${CANALES_ED.map(c => `<button data-edcanal="${c.k}" class="${c.k === ED_CANAL ? "on" : ""}">${esc(c.t)}</button>`).join("")}</div>

        <section class="kc-card">
          <h3>El canal</h3>
          <div class="kc-grid">
            <label><span>Nombre</span><input data-ed="nombre" value="${esc(ED.nombre || "")}"></label>
            <label><span>Función</span><select data-ed="funcion">${FUNCIONES.map(f => `<option ${f === ED.funcion ? "selected" : ""}>${f}</option>`).join("")}</select></label>
            <label><span>Verbos</span><input data-ed="verbos" value="${esc(ED.verbos || "")}" placeholder="Inspirar · Educar · Posicionar"></label>
            <label><span>Trimestre base</span><select data-ed="base">${trims.map(q => `<option value="${q}" ${q === ED.base ? "selected" : ""}>${q.replace("-", " ")}</option>`).join("")}</select></label>
            <label class="kc-ancho"><span>Objetivo</span><input data-ed="objetivo" value="${esc(ED.objetivo || "")}"></label>
          </div>
        </section>

        <section class="kc-card">
          <h3>Datos que se cargan</h3>
          <p class="rs-nota" style="margin-top:0">Los números crudos que carga quien hace el canal, tal cual los da la red. Los KPIs se arman con estos.</p>
          <div class="kc-lista">${ED.datos.map((d, i) => {
            const usos = usosDe(d.k);
            return `<div class="kc-fila">
              <input class="kc-nombre" data-ed="datos.${i}.t" value="${esc(d.t || "")}" placeholder="Nombre del dato" aria-label="Nombre del dato">
              <select data-ed="datos.${i}.nivel" data-edre="1" aria-label="Se carga"><option value="pieza" ${d.nivel !== "mes" ? "selected" : ""}>Por pieza</option><option value="mes" ${d.nivel === "mes" ? "selected" : ""}>Una vez por mes</option></select>
              ${d.nivel === "mes" ? "" : (ED.destinos || []).length
                ? `<select data-ed="datos.${i}.solo" aria-label="Se pide a"><option value="">Todos los destinos</option>${ED.destinos.map(x => `<option value="${esc(x.k)}" ${d.solo === x.k ? "selected" : ""}>Sólo ${esc(x.t)}</option>`).join("")}</select>`
                : `<label class="kc-chk"><input type="checkbox" data-edchk="datos.${i}.solo" data-valor="encuesta" ${d.solo === "encuesta" ? "checked" : ""}> Sólo encuestas</label>`}
              <label class="kc-chk"><input type="checkbox" data-edchk="datos.${i}.opcional" ${d.opcional ? "checked" : ""}> Opcional</label>
              <input class="kc-ayuda" data-ed="datos.${i}.ayuda" value="${esc(d.ayuda || "")}" placeholder="Dónde se saca (ayuda)">
              ${mover("datos", i)}
              ${usos.length ? `<span class="kc-uso">Lo usa: ${esc(usos.join(", "))}</span>` : ""}
            </div>`; }).join("")}</div>
          <button class="btn-mini" data-edagregar="datos">＋ Agregar dato</button>
        </section>

        <section class="kc-card">
          <h3>KPIs</h3>
          <p class="rs-nota" style="margin-top:0">Cada KPI es una cuenta sobre los datos. La plataforma la hace sola para el mes, el trimestre o el año.</p>
          <div class="kc-lista">${ED.kpis.map((k, i) => `<div class="kc-fila kc-kpi">
              <input class="kc-nombre" data-ed="kpis.${i}.t" value="${esc(k.t || "")}" placeholder="Nombre del KPI" aria-label="Nombre del KPI">
              ${formula(k, `kpis.${i}`)}
              <select data-ed="kpis.${i}.fmt" aria-label="Se muestra como">${FORMATOS.map(o => `<option value="${o.k}" ${(k.fmt || "") === o.k ? "selected" : ""}>${o.t}</option>`).join("")}</select>
              ${mover("kpis", i)}
              <span class="kc-prev">Vista previa: <b>${esc(previa(k))}</b></span>
            </div>`).join("")}</div>
          <button class="btn-mini" data-edagregar="kpis">＋ Agregar KPI</button>
          <details class="kc-ayudaf"><summary>¿Qué hace cada fórmula?</summary>
            <ul>${FORMULAS.map(f => `<li><b>${f.t}</b> — ${f.ej}</li>`).join("")}
              <li>En la división, si A es por pieza y B es del mes (ej. leído por ÷ miembros), cada pieza se divide por el B de su mes y se promedia.</li></ul></details>
        </section>

        <section class="kc-card">
          <h3>Embudo</h3>
          <p class="rs-nota" style="margin-top:0">Los escalones, de arriba (alcance) a abajo (acción). Conviene que sean 3 o 4.</p>
          <div class="kc-lista">${ED.embudo.map((x, i) => `<div class="kc-fila kc-kpi">
              <span class="kc-num">${i + 1}</span>
              <input class="kc-nombre" data-ed="embudo.${i}.t" value="${esc(x.t || "")}" placeholder="Nombre del escalón" aria-label="Nombre del escalón">
              ${formula(x, `embudo.${i}`, true)}
              <input class="kc-ayuda" data-ed="embudo.${i}.nota" value="${esc(x.nota || "")}" placeholder="Aclaración chica (opcional)">
              ${mover("embudo", i)}
              <span class="kc-prev">Vista previa: <b>${esc(previa(x))}</b></span>
            </div>`).join("")}</div>
          <button class="btn-mini" data-edagregar="embudo">＋ Agregar escalón</button>
        </section>

        <div class="kc-pie">
          ${ED_MSG ? `<span class="kc-msg">${ED_MSG}</span>` : ""}
          <button class="btn-ghost" data-eddescartar ${sucio() ? "" : "disabled"}>Descartar cambios</button>
          <button class="btn-primary" data-edguardar>${sucio() ? "Guardar cambios" : "Sin cambios"}</button>
        </div>
      </div>`;
    edEnganchar(cont);
  }

  function edSet(path, valor) {
    const ps = path.split("."); let o = ED;
    for (let i = 0; i < ps.length - 1; i++) o = o[ps[i]];
    const k = ps[ps.length - 1];
    if (valor === "" || valor == null || valor === false) delete o[k]; else o[k] = valor;
  }
  // Al cambiar el tipo de fórmula se borran los argumentos del tipo anterior.
  function edTipo(path, f) {
    const ps = path.split("."); const o = ED[ps[0]][+ps[1]];
    ["dato", "datos", "num", "den", "a", "b"].forEach(x => delete o[x]);
    o.f = f; if (f === "sumas") o.datos = [];
  }
  function edValidar() {
    const err = [];
    ED.datos.forEach(d => { if (!String(d.t || "").trim()) err.push("Hay un dato sin nombre."); });
    [["kpis", "KPI"], ["embudo", "escalón"]].forEach(([l, n]) => ED[l].forEach(x => {
      const nom = x.t && x.t.trim() ? `«${x.t}»` : `sin nombre`;
      if (!String(x.t || "").trim()) err.push(`Hay un ${n} sin nombre.`);
      const falta = { suma: !x.dato, promedio: !x.dato, ultimo: !x.dato, cociente: !x.num || !x.den, resta: !x.a || !x.b, sumas: !(x.datos || []).length }[x.f];
      if (falta) err.push(`Al ${n} ${nom} le falta elegir los datos de la fórmula.`);
      refs(x).forEach(r => { if (!ED.datos.some(d => d.k === r)) err.push(`El ${n} ${nom} usa un dato que ya no existe.`); });
    }));
    return [...new Set(err)];
  }

  function edEnganchar(cont) {
    const refrescarPie = () => {
      const g = cont.querySelector("[data-edguardar]"), d = cont.querySelector("[data-eddescartar]");
      if (g) g.textContent = sucio() ? "Guardar cambios" : "Sin cambios";
      if (d) d.disabled = !sucio();
    };
    cont.oninput = ev => {
      const t = ev.target;
      if (t.dataset.ed && t.tagName === "INPUT") { edSet(t.dataset.ed, t.value); refrescarPie(); }
    };
    cont.onchange = ev => {
      const t = ev.target;
      if (t.dataset.edre && t.dataset.ed.endsWith(".f")) { edTipo(t.dataset.ed.slice(0, -2), t.value); return edPintar(); }
      if (t.dataset.ed && t.tagName === "SELECT") {
        edSet(t.dataset.ed, t.value);
        // Un dato que pasa a ser "del mes" no puede ser "sólo encuestas".
        if (/^datos\.\d+\.nivel$/.test(t.dataset.ed) && t.value === "mes") delete ED.datos[+t.dataset.ed.split(".")[1]].solo;
        return edPintar();
      }
      if (t.dataset.edchk) { edSet(t.dataset.edchk, t.checked ? (t.dataset.valor || true) : false); return edPintar(); }
      if (t.dataset.edsumas) {
        const ps = t.dataset.edsumas.split("."), o = ED[ps[0]][+ps[1]];
        o.datos = [...cont.querySelectorAll(`[data-edsumas="${t.dataset.edsumas}"]:checked`)].map(c => c.value);
        return edPintar();
      }
    };
    // Los nombres se escriben sin repintar (no perder el foco); al salir se actualizan las listas que los muestran.
    cont.addEventListener("focusout", ev => { if (ev.target.matches && ev.target.matches('input[data-ed^="datos."][data-ed$=".t"]')) edPintar(); });
    cont.onclick = async ev => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.edcanal) {
        if (b.dataset.edcanal === ED_CANAL) return;
        if (sucio() && !confirm("Tenés cambios sin guardar en este canal. ¿Descartarlos?")) return;
        await edCargar(b.dataset.edcanal); return edPintar();
      }
      if (b.dataset.edagregar) {
        const l = b.dataset.edagregar;
        if (l === "datos") {
          let k = slug("dato nuevo"), n = 1; while (ED.datos.some(d => d.k === k)) k = `dato_nuevo_${++n}`;
          ED.datos.push({ k, t: "", nivel: "pieza" });
        } else {
          const base = ED.datos[0] ? ED.datos[0].k : "";
          ED[l].push(l === "kpis" ? { k: `kpi_${Date.now().toString(36)}`, t: "", f: "suma", dato: base } : { t: "", f: "suma", dato: base });
        }
        edPintar();
        const ult = cont.querySelectorAll(`[data-ed^="${l}."][data-ed$=".t"]`); if (ult.length) ult[ult.length - 1].focus();
        return;
      }
      if (b.dataset.edmover) {
        const [l, i, d] = b.dataset.edmover.split(":"); const a = +i, z = a + +d;
        [ED[l][a], ED[l][z]] = [ED[l][z], ED[l][a]]; return edPintar();
      }
      if (b.dataset.edborrar) {
        const [l, i] = b.dataset.edborrar.split(":"); const x = ED[l][+i];
        if (l === "datos") {
          const usos = usosDe(x.k);
          if (usos.length) { alert(`No se puede eliminar «${x.t}»: lo usa ${usos.join(", ")}.\n\nCambiá esas fórmulas primero.`); return; }
          const cargados = Object.keys(ED_DATOS.v).filter(c => c.endsWith("|" + x.k)).length;
          if (!confirm(`¿Eliminar el dato «${x.t || "sin nombre"}»?` + (cargados ? `\n\nTiene ${cargados} valores cargados: no se borran, pero se dejan de mostrar.` : ""))) return;
        } else if (!confirm(`¿Eliminar «${x.t || "sin nombre"}»?`)) return;
        ED[l].splice(+i, 1); return edPintar();
      }
      if (b.hasAttribute("data-eddescartar")) { ED = JSON.parse(ED_ORIG); ED_MSG = ""; return edPintar(); }
      if (b.hasAttribute("data-edguardar")) {
        if (!sucio()) return;
        const err = edValidar();
        if (err.length) { ED_MSG = `<span class="mal">${esc(err[0])}</span>${err.length > 1 ? ` <span class="tenue">(y ${err.length - 1} más)</span>` : ""}`; return edPintar(); }
        // Las claves de los datos nuevos salen del nombre recién al guardar (quedan fijas desde ahí).
        ED.datos.forEach(d => {
          if (!/^dato_nuevo/.test(d.k)) return;
          const viejo = d.k; let k = slug(d.t), n = 1; while (ED.datos.some(o => o !== d && o.k === k)) k = `${slug(d.t)}_${++n}`;
          d.k = k;
          ["kpis", "embudo"].forEach(l => ED[l].forEach(x => {
            ["dato", "num", "den", "a", "b"].forEach(c => { if (x[c] === viejo) x[c] = k; });
            if (x.datos) x.datos = x.datos.map(y => y === viejo ? k : y);
          }));
        });
        b.disabled = true; b.textContent = "Guardando…";
        const r = await fetch(url("resultados_config?on_conflict=canal"), {
          method: "POST", headers: head({ Prefer: "resolution=merge-duplicates,return=minimal" }),
          body: JSON.stringify([{ canal: ED_CANAL, config: ED, actualizado: new Date().toISOString() }]),
        }).catch(() => null);
        if (!r || !r.ok) { ED_MSG = `<span class="mal">No se pudo guardar. Probá de nuevo.</span>`; return edPintar(); }
        ED_ORIG = JSON.stringify(ED); CARGADO = "";
        ED_MSG = `<span class="bien">✓ Guardado. Ya se ve en Resultados de ${esc((CANALES_ED.find(c => c.k === ED_CANAL) || {}).t || ED_CANAL)}.</span>`;
        return edPintar();
      }
    };
  }
})();
