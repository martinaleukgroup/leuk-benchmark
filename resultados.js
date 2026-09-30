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

  /* ---- Estado ---- */
  let CTX = null;          // {canal, mes, puedeCargar, irAFicha}
  let CFG = null;          // config del canal
  let SIN_TABLA = false;   // falta correr el SQL: se ve, pero no se guarda
  let PIEZAS = [];         // [{id, mes, fecha, criterio, estado, encuesta}] del canal
  let V = {};              // "mes|pieza|dato" -> número
  let PERIODO = "trim";    // mes | trim | 12m | todo
  let DETALLE = "";        // mes abierto en el histórico
  let CARGADO = "";        // canal cuyos datos están en memoria
  const RAIZ = () => CTX && CTX.el;

  const clave = (mes, pieza, dato) => `${mes}|${pieza || ""}|${dato}`;
  const datoDef = k => (CFG.datos || []).find(d => d.k === k) || { k, nivel: "pieza" };
  const aplica = (d, p) => d.solo !== "encuesta" || !!(p.encuesta && p.encuesta.q);
  // Una pieza se mide cuando ya salió. "Publicado" no alcanza como regla: no siempre se marca.
  const medible = p => p.fecha <= hoyISO();

  async function traer() {
    const c = CTX.canal;
    const [rc, rv, rp] = await Promise.all([
      fetch(url(`resultados_config?canal=eq.${enc(c)}&select=config`), { headers: head() }).catch(() => null),
      fetch(url(`resultados_valores?canal=eq.${enc(c)}&select=mes,pieza,dato,valor`), { headers: head() }).catch(() => null),
      fetch(url(`contenidos?canal=in.(${enc(c)})&select=id,mes,fecha,criterio,estado,encuesta&order=fecha.asc`), { headers: head() }).catch(() => null),
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
  const piezasDe = meses => PIEZAS.filter(p => meses.includes(p.mes) && medible(p));
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
      if (cambioCanal) DETALLE = "";
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
    piezasDe(ms).filter(p => p.fecha <= limite).forEach(p => {
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
    return `<div class="rs-kpis">${(CFG.kpis || []).map(k => {
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
      <tbody>${(CFG.kpis || []).map(k => `<tr><td>${esc(k.t)}</td>${ms.map(m => `<td>${fmt(k, calc(k, [m]))}</td>`).join("")}${PERIODO === "mes" ? "" : `<td class="rs-tot">${fmt(k, calc(k, mesesPeriodo()))}</td>`}</tr>`).join("")}</tbody>
    </table></div>
    <p class="rs-nota">Tocá un mes para ver cada ${CTX.canal === "instagram" ? "pieza" : "mensaje"} con su resultado.</p>
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
    const ps = piezasDe([m]);
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
      ${ed ? `<p class="rs-nota">Sólo números, tal cual los da ${CTX.canal === "instagram" ? "Instagram" : "WhatsApp"}. Se guarda solo al salir de cada casillero; los % los calcula la plataforma.</p>`
           : `<p class="rs-nota">${SIN_TABLA ? "Se habilita cuando esté corrido el SQL." : "Los carga quien hace este canal."}</p>`}
      ${ps.length ? `<div class="rs-scroll"><table class="rs-cargat">
        <thead><tr><th>${CTX.canal === "instagram" ? "Pieza" : "Mensaje"}</th>${dp.map(d => `<th title="${esc(d.ayuda || "")}">${esc(d.t)}${d.opcional ? " <small>(opcional)</small>" : ""}</th>`).join("")}</tr></thead>
        <tbody>${ps.map(p => `<tr><td>${p.fecha.slice(8, 10)}/${p.fecha.slice(5, 7)} · ${esc(recorte(p.criterio, 30))}</td>${dp.map(d => inp(m, p.id, d, p)).join("")}</tr>`).join("")}</tbody>
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
    const piezas = [["Mes", "Fecha", "Pieza", ...dp.map(d => d.t)],
      ...PIEZAS.filter(medible).map(p => [p.mes, p.fecha, p.criterio, ...dp.map(d => vP(p, d.k) ?? "")])];
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
})();
