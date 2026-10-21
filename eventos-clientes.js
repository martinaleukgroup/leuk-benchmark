/* ============================================================================
   IMPACTO DE ACCIONES (antes "Eventos con clientes") — sección de Acciones.
   El evento (charla) se hace JUNTO a un distribuidor (nuestro cliente); los
   invitados son profesionales del rubro (clientes del distribuidor). ¿Sirvió?
     · Profesionales: cuántos se inscribieron, cuántos fueron y qué PERFILES
       (encuesta de Luz en Acción), contra los perfiles que queremos convocar.
     · Ventas: cuánto nos compró el distribuidor después, contra lo que ESPERÁBAMOS
       sin el evento (lo que compraba antes, ajustado por cómo se movió el resto de
       los clientes). La diferencia son las "compras extra" → ROAS. Además, las
       COMPRAS GRANDES que hizo después (días de compra muy por encima de su promedio).
     · Oportunidades: lo que nació del evento y no es una compra (otra muestra,
       una obra, una alianza…). Un evento sin compras extra pero con oportunidades
       NO se da por perdido.
   Cada evento tiene un ESTADO de evaluación: evaluado, provisorio (todavía no
   pasó la ventana entera), esperando ventas, o faltan datos (y quién los tiene).

   Pestañas:
     · EVENTOS          → tablero (métricas, gráficos, tablas) y ficha de cada evento.
     · COMPARAR         → períodos de octubre a octubre lado a lado, y patrones
                          por formato, disertante y partner / no partner.
     · CAMPAÑAS         → campañas de producto (exhibiciones, unboxings): primero se
                          confirma que el material llegó a Comercial y se distribuyó;
                          recién ahí se miden las compras de esa familia.
     · DATOS QUE FALTAN → todo lo que falta para evaluar, agrupado por quién lo tiene.
   Descarga a Excel y PDF.

   Las ventas salen del "Reporte de ventas" del sistema (CSV por línea de
   factura). Se sube desde acá: se agrupa en el navegador por cliente y día y se
   guarda en Supabase (ventas_diarias). Nunca queda en un archivo del repo.
   SQL: supabase/sql/2026-10-15-eventos-clientes.sql, …-profesionales.sql y
        2026-10-20-impacto-acciones.sql.
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
  const roas = x => x == null || !isFinite(x) ? "—" : `${x < 0 ? "−" : ""}${Math.abs(x).toFixed(1).replace(".", ",")}×`;
  const signo = v => v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${usd(Math.abs(v))}`;
  const plural = (n, s, p) => `${n} ${n === 1 ? s : (p || s + "s")}`;

  /* ---- Vocabulario ---- */
  const FORMATOS = ["Showroom", "Capacitación", "Lanzamiento", "After office", "Charla / workshop", "Visita a obra",
                    "Feria / exposición", "Otro"];
  const VENTANAS = [30, 60, 90, 180];
  const OP_TIPOS = ["Evento / exposición", "Proyecto / obra", "Nuevo cliente", "Alianza", "Prensa / difusión", "Capacitación", "Otro"];
  const OP_ESTADOS = ["Abierta", "En curso", "Concretada", "Descartada"];
  const CAMP_TIPOS = ["Exhibición", "Unboxing", "Material POP", "Muestras", "Catálogo / folleto", "Otro"];
  let OTRO_DIS = false;   // eligió "Otro…" y todavía no escribió el nombre
  const DISERTANTES = ["Barbara Hirsch", "Matias Maravankin"];   // las opciones fijas; "Otro…" pide escribir el nombre
  // Perfiles de la audiencia. `k` = palabras que los reconocen en la encuesta / lista de inscriptos.
  const PERFILES = [
    { p: "Arquitecto/a", k: ["arquitect", "arq."] },
    { p: "Diseñador/a de interiores", k: ["interior", "interiorism", "decorad", "diseno de int", "diseñador de int"] },
    { p: "Lighting designer", k: ["lighting", "luminotec", "iluminador", "disenador de ilum", "diseno de ilum"] },
    { p: "Diseñador/a industrial", k: ["industrial"] },
    { p: "Ingeniero/a", k: ["ingenier", "ing."] },
    { p: "Electricista / instalador", k: ["electric", "instalad", "tecnico"] },
    { p: "Constructor / desarrollador", k: ["constru", "desarroll", "inmobil", "obra", "mmo", "maestro mayor"] },
    { p: "Comercial / vendedor", k: ["vended", "comercial", "ventas", "distribu", "mostrador"] },
    { p: "Estudiante", k: ["estudiante", "alumn"] },
    { p: "Otro", k: [] },
  ];
  // Quién tiene que pasar cada dato que falta (para el pedido de datos).
  const QUIEN = { mkt: "Marketing", com: "Comercial", adm: "Administración", dai: "Dai (Coordinación)", resp: "Quien la lleva" };
  const ESTADOS = { evaluado: "Evaluado", provisorio: "Provisorio", esperando: "Esperando ventas", faltan: "Faltan datos" };

  /* ---- Períodos: de octubre a octubre (1/10 al 30/9) ---- */
  const periodoDe = f => { f = String(f || ""); if (!/^\d{4}-\d{2}/.test(f)) return ""; const y = +f.slice(0, 4); return String(+f.slice(5, 7) >= 10 ? y : y - 1); };
  const periodoNombre = p => `Oct ${p} – Oct ${+p + 1}`;
  const periodoCorto = p => `oct ${String(p).slice(2)}–oct ${String(+p + 1).slice(2)}`;
  const periodoRango = p => [`${p}-10-01`, `${+p + 1}-09-30`];

  /* ---- Estado ---- */
  let EVS = [];             // eventos_clientes
  let INV = {};             // evento_id -> [distribuidores del evento] (tabla eventos_clientes_inv)
  let OPS = {};             // evento_id -> [oportunidades] (eventos_clientes_oport)
  let CAMPS = [];           // mkt_campanas
  let CLI = new Map();      // cuit -> ventas_clientes
  let ACCS = [];            // acciones (para vincular inversión)
  let RANGO = null;         // {desde, hasta, clientes} de las ventas cargadas
  let ULT_IMPORT = null;    // último reporte de ventas subido (ventas_importaciones)
  let FAMILIAS = null;      // [{familia, usd}] de las ventas (para las campañas)
  let SIN_SQL3 = false;     // falta correr 2026-10-20-impacto-acciones.sql
  const VENTAS = new Map(); // cuit -> [{fecha, usd, facturas, familias}] ordenado por fecha
  const BASE = {};          // caché de ventas_base (resto de los clientes)
  const TCS = {};           // fecha -> tipo de cambio promedio cercano
  const MED_CAMP = {};      // caché de la medición de cada campaña
  let CARGADO = false, ERROR = "";
  let TAB = "eventos";      // eventos | comparar | campanas | faltan
  let ABIERTO = null;       // id de evento | "nuevo" | null
  let BORRADOR = null;
  let CAMP = null;          // id de campaña abierta | "nueva" | null
  let BORRADOR_C = null;
  let VENTANA = 90;
  let PERIODO = null;       // "2025" = oct 2025 → sep 2026 · "" = todos · null = elegir solo
  let FORMATO = "", DISERT = "", ESTADO_F = "";
  let BUSCA_CLI = "";       // buscador para sumar el distribuidor / los clientes de una campaña
  let INV_MON = {};         // evento/campaña -> moneda elegida para cargar la inversión
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
      // Lo de 2026-10-20 (oportunidades, campañas): si falta el SQL, lo anterior sigue andando.
      const [ops, camps, imp] = await Promise.all([
        todo("eventos_clientes_oport?select=*&order=creado.asc").catch(() => null),
        todo("mkt_campanas?select=*&order=creado.desc").catch(() => null),
        fetch(url("ventas_importaciones?select=archivo,desde,hasta,filas,clientes,autor_email,creado&order=creado.desc&limit=1"), { headers: head() })
          .then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      SIN_SQL3 = !ops || !camps || !EVS.every(e => "disertante" in e);
      OPS = {}; (ops || []).forEach(o => { (OPS[o.evento_id] = OPS[o.evento_id] || []).push(o); });
      CAMPS = camps || [];
      ULT_IMPORT = imp && imp[0] || null;
      if (PERIODO == null) {       // arranca en el período actual; si todavía no tiene eventos, en el anterior
        const hoy = periodoDe(hoyISO());
        PERIODO = EVS.some(e => periodoDe(e.fecha || e.creado) === hoy) || !EVS.length ? hoy : String(+hoy - 1);
      }
      ERROR = ""; CARGADO = true;
    } catch (e) { ERROR = e.status === 404 ? "sql" : "red"; }
  }
  const familias = async () => {
    if (FAMILIAS && FAMILIAS.length) return FAMILIAS;
    try { FAMILIAS = (await rpc("ventas_familias")).map(f => ({ familia: f.familia, usd: Number(f.usd) || 0 })); }
    catch (e) { FAMILIAS = []; }
    return FAMILIAS;
  };

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

  /* ---- Inversión del evento (o campaña) en US$ ---- */
  const accionDe = ev => ev && ev.accion_id ? ACCS.find(a => a.id === ev.accion_id) : null;
  const necesitaTC = ev => !!(ev.fecha && num(ev.inversion_usd) == null &&
    (num(ev.inversion_ars) != null || (accionDe(ev) && (accionDe(ev).moneda || "ARS") !== "USD")));
  const arsTxt = m => `$ ${Math.round(m).toLocaleString("es-AR")}`;
  function inversion(ev) {
    if (num(ev.inversion_usd) != null) return { usd: num(ev.inversion_usd), origen: "cargada" };
    if (num(ev.inversion_ars) != null) {
      const m = num(ev.inversion_ars), tc = TCS[ev.fecha];
      return tc ? { usd: m / tc, origen: `cargada en pesos (${arsTxt(m)} ÷ TC ${Math.round(tc)})` }
                : { usd: null, origen: ev.fecha ? "cargada en pesos; falta el tipo de cambio de esa fecha (sale de las ventas cargadas)" : "cargada en pesos; falta la fecha" };
    }
    const a = accionDe(ev); if (!a) return { usd: null, origen: "" };
    const m = num(a.inversion_real) != null ? num(a.inversion_real) : num(a.inversion_estimada);
    if (m == null) return { usd: null, origen: "" };
    if ((a.moneda || "ARS") === "USD") return { usd: m, origen: "de la acción" };
    const tc = TCS[ev.fecha];
    return tc ? { usd: m / tc, origen: `de la acción (${arsTxt(m)} ÷ TC ${Math.round(tc)})` }
              : { usd: null, origen: "de la acción, falta el tipo de cambio" };
  }

  /* ---- Cálculo de un evento ----------------------------------------------
     Ventana de N días: ANTES = los N días previos al evento; DESPUÉS = el día del
     evento y los N-1 siguientes. Si todavía no pasaron N días (o las ventas
     cargadas no llegan), se acortan LAS DOS ventanas a lo que haya y el evento
     queda PROVISORIO.

     ESPERADO = lo que el distribuidor compró ANTES × (1 + crecimiento del resto de
     los clientes entre esas mismas dos ventanas). Así no se le atribuye al evento
     una suba (o baja) que tuvo todo el mercado. COMPRAS EXTRA = DESPUÉS − ESPERADO.
     Además se muestra cómo se movió el mismo distribuidor en esas fechas el año
     anterior (estacionalidad propia), como contexto.

     COMPRAS GRANDES = días de compra posteriores al evento (dentro de la ventana)
     que superan 2 veces la compra promedio del distribuidor en los 12 meses
     anteriores. Si no compraba antes, cualquier compra cuenta (es "primera compra"). */
  const opsDe = ev => (OPS[ev.id] || []);
  const opsVivas = ev => opsDe(ev).filter(o => o.estado !== "Descartada");
  function comprasGrandes(cuit, nombre, fecha, desde, hasta) {
    const prev = (VENTAS.get(cuit) || []).filter(v => v.fecha >= sumarDias(fecha, -365) && v.fecha < fecha && Number(v.usd) > 0);
    const prom = prev.length ? prev.reduce((s, v) => s + Number(v.usd), 0) / prev.length : null;
    return (VENTAS.get(cuit) || []).filter(v => v.fecha >= desde && v.fecha <= hasta && Number(v.usd) > 0 && (prom == null || Number(v.usd) >= 2 * prom))
      .map(v => {
        const fam = Object.entries(v.familias || {}).sort((a, b) => b[1] - a[1])[0];
        return { cuit, nombre, fecha: v.fecha, usd: Number(v.usd), veces: prom ? Number(v.usd) / prom : null, prom, familia: fam ? fam[0] : "" };
      });
  }
  function calcular(ev, N) {
    const lista = INV[ev.id] || [];
    const out = { ev, lista, dists: [], dias: 0, falta: "", grandes: [],
                  inscr: num(ev.prof_inscriptos), asis: num(ev.prof_asistentes) };
    out.asistencia = out.inscr && out.asis != null ? out.asis / out.inscr : null;
    out.inv = inversion(ev);
    out.costoProf = out.inv.usd && out.asis ? out.inv.usd / out.asis : null;
    out.nombres = lista.map(x => x.nombre || (CLI.get(x.cuit) || {}).nombre || x.razon_social || "").filter(Boolean).join(" + ");
    out.ops = opsVivas(ev);
    out.opsConcretadas = out.ops.filter(o => o.estado === "Concretada").length;
    out.opsValor = out.ops.reduce((s, o) => s + (num(o.valor_usd) || 0), 0);
    out.partner = lista.length && lista.every(x => x.era_partner === true) ? "si" : lista.length && lista.every(x => x.era_partner === false) ? "no"
                : lista.some(x => x.era_partner == null) ? "" : "mixto";
    out.estado = "faltan";
    if (!ev.fecha) { out.falta = "Cargá la fecha del evento para medir las compras."; return veredicto(out); }
    if (!lista.length) { out.falta = "Sumá el distribuidor con el que se hizo el evento para medir sus compras."; return veredicto(out); }
    if (!RANGO) { out.falta = "Todavía no hay ventas cargadas. Subí el reporte de ventas desde el tablero (⋯ Más → Actualizar ventas)."; return veredicto(out); }
    out.dias = Math.min(N, difDias(ev.fecha, RANGO.hasta) + 1);
    out.listoEl = sumarDias(ev.fecha, N - 1);       // desde cuándo se puede evaluar con la ventana entera
    if (out.dias <= 0) {
      // Todavía no hay ventas posteriores: igual se muestra lo que el distribuidor venía comprando.
      out.estado = "esperando";
      const h = RANGO.hasta < ev.fecha ? RANGO.hasta : sumarDias(ev.fecha, -1);
      out.previo = { desde: sumarDias(h, -(N - 1)), hasta: h };
      out.previo.usd = lista.reduce((s, x) => s + sumaCliente(x.cuit, out.previo.desde, out.previo.hasta).usd, 0);
      out.falta = `El evento es del ${fechaLarga(ev.fecha)} y las ventas cargadas llegan hasta el ${fechaLarga(RANGO.hasta)}. ` +
        `Para saber si sirvió hace falta un reporte de ventas más nuevo (⋯ Más → Actualizar ventas); con la ventana entera de ${N} días, desde el ${fechaLarga(out.listoEl)}.`;
      return veredicto(out);
    }
    out.estado = out.dias < N ? "provisorio" : "evaluado";
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
      const nombre = x.nombre || c.nombre || x.razon_social || c.razon_social || "(sin nombre)";
      out.grandes.push(...comprasGrandes(x.cuit, nombre, ev.fecha, out.despues[0], out.despues[1]));
      return { x, c, nombre, razon: x.razon_social || c.razon_social || "", vendedor: c.vendedor || "",
               antes: a.usd, despues: d.usd, facturas: d.facturas, esperado, extra: d.usd - esperado,
               crec: a.usd > 0 ? (d.usd - a.usd) / a.usd : null, antesLy: al, despuesLy: dl };
    });
    out.grandes.sort((a, b) => b.usd - a.usd);
    out.grandesUsd = out.grandes.reduce((s, x) => s + x.usd, 0);
    const S = k => out.dists.reduce((s, r) => s + r[k], 0);
    Object.assign(out, { A: S("antes"), P: S("despues"), E: S("esperado"), X: S("extra"), facturas: S("facturas"),
                         Aly: S("antesLy"), Ply: S("despuesLy") });
    out.crec = out.A > 0 ? (out.P - out.A) / out.A : null;
    out.crecLy = out.Aly > 0 ? (out.Ply - out.Aly) / out.Aly : null;
    out.puntos = out.crec != null && g != null ? out.crec - g : null;
    // Sin compras extra el ROAS es 0 (no negativo).
    out.retorno = out.inv.usd ? Math.max(0, out.X) / out.inv.usd : null;   // ROAS incremental
    out.roasTotal = out.inv.usd ? out.P / out.inv.usd : null;
    out.extraProf = out.asis ? out.X / out.asis : null;
    return veredicto(out);
  }
  const medido = k => !!(k.antes && k.base);
  const listaOps = ops => ops.map(o => esc(o.titulo || o.tipo || "sin nombre")).join(", ");
  // El veredicto mira las compras Y las oportunidades: un evento sin compras extra
  // pero que abrió oportunidades no se da por perdido.
  function veredicto(k) {
    const nOp = k.ops.length, opTxt = nOp ? ` Abrió ${plural(nOp, "oportunidad", "oportunidades")}: <b>${listaOps(k.ops)}</b>.` : "";
    if (!k.antes) {
      k.ver = nOp ? { c: "op", t: `Abrió ${plural(nOp, "oportunidad", "oportunidades")}`, txt: `${opTxt.trim()} Las compras todavía no se pueden medir: ${k.falta}` }
                  : { c: "", t: k.estado === "esperando" ? "Esperando ventas" : "Faltan datos", txt: k.falta };
      return k;
    }
    if (!k.base) { k.ver = { c: "", t: "Calculando…", txt: "Trayendo cómo se movió el resto de los clientes en las mismas fechas." }; return k; }
    if (k.X > 0 && (k.retorno == null || k.retorno >= 1)) k.ver = { c: "ok", t: "Sirvió" };
    else if (k.X > 0) k.ver = { c: "warn", t: "Sirvió, pero no cubrió la inversión" };
    else if (nOp) k.ver = { c: "op", t: `Sin compras extra, pero abrió ${plural(nOp, "oportunidad", "oportunidades")}` };
    else k.ver = { c: "no", t: "No se ve efecto en las compras" };
    if (k.estado === "provisorio") k.ver.t += " (provisorio)";
    const quien = k.nombres || "El distribuidor";
    k.ver.txt = `${esc(quien)} nos compró <b>${usd(k.P)}</b> en los ${k.dias} días posteriores al evento. ` +
      `Antes compraba ${usd(k.A)} y el resto de los clientes ${k.base.crec >= 0 ? "creció" : "bajó"} ${pct(k.base.crec).replace(/^[+−]/, "")}, ` +
      `así que sin el evento esperábamos unos <b>${usd(k.E)}</b>: compró <b>${usd(Math.abs(k.X))} ${k.X >= 0 ? "más" : "menos"}</b> de lo esperado.` +
      (k.retorno == null ? " Cargá la inversión para ver el ROAS." : k.X > 0 ? ` Cada US$ 1 invertido trajo <b>${veces(k.retorno)}</b> de compras extra (<b>ROAS ${roas(k.retorno)}</b>).`
        : ` La inversión fue de ${usd(k.inv.usd)}.`) +
      (k.grandes.length ? ` Hizo ${plural(k.grandes.length, "compra grande", "compras grandes")} después (${usd(k.grandesUsd)}).` : "") + opTxt +
      (k.estado === "provisorio" ? ` <i>Provisorio: hay ${k.dias} de ${VENTANA} días de ventas después del evento; la ventana entera se completa el ${fechaLarga(k.listoEl)}.</i>` : "");
    return k;
  }

  /* ---- Qué falta para evaluar (y quién lo tiene) ---- */
  function faltantesEvento(ev, k) {
    // ir: dónde se completa en la ficha del evento (selector; "ventas" = subir el reporte).
    const f = [], add = (que, quien, para, persona, ir) => f.push({ que, quien, para, persona: persona || "", ir: ir || "" });
    if (!ev.fecha) add("Fecha del evento", "mkt", "medir las compras", "", '[data-campo="fecha"]');
    if (!k.lista.length) add("Distribuidor con el que se hizo", "mkt", "medir las compras", "", ".ec-busca-cli");
    if (!RANGO) add("Reporte de ventas del sistema", "com", "medir las compras", "", "ventas");
    else if (k.estado === "esperando") add(`Reporte de ventas posterior al ${fechaLarga(ev.fecha)}`, "com", "medir las compras", "", "ventas");
    else if (k.estado === "provisorio" && k.listoEl > RANGO.hasta) add(`Reporte de ventas hasta el ${fechaLarga(k.listoEl)} (o después)`, "com", `evaluar con los ${VENTANA} días enteros`, "", "ventas");
    if (k.inv.usd == null) add(k.inv.origen ? `Inversión: ${k.inv.origen}` : "Inversión del evento", "mkt", "ROAS y costo por profesional", "", '[data-campo="inv_monto"]');
    k.lista.filter(x => x.era_partner == null).forEach(x => add(`¿${x.nombre || x.razon_social || x.cuit} era partner?`, "com", "comparar partners y no partners", "", `[data-ec-inv="era_partner"][data-id="${x.id}"]`));
    if (k.asis == null) add("Profesionales inscriptos y que fueron", "mkt", "asistencia y costo por profesional", "", '[data-campo="prof_inscriptos"], [data-campo="prof_asistentes"]');
    if (!Object.keys(ev.perfiles || {}).length && !SIN_SQL3) add("Perfiles de la audiencia (encuesta de Luz en Acción)", "mkt", "saber a quién convocamos", "", ".ec-aud");
    if (!ev.disertante && !SIN_SQL3) add("Quién dio la charla", "mkt", "comparar disertantes", "", '[data-campo="disertante_sel"]');
    opsDe(ev).filter(o => ["Abierta", "En curso"].includes(o.estado) && difDias(String(o.actualizado || o.creado).slice(0, 10), hoyISO()) > 45)
      .forEach(o => add(`Novedades de la oportunidad "${o.titulo || o.tipo}"`, "resp", "saber si se concretó", o.responsable, `[data-op="${o.id}"]`));
    return f;
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
    if (!CARGADO && !ERROR) { c.innerHTML = `<div class="empty">Cargando…</div>`; return; }
    if (ERROR === "sql") {
      c.innerHTML = `<div class="res-intro">Falta preparar la base: hay que correr <b>supabase/sql/2026-10-15-eventos-clientes.sql</b> en Supabase → SQL Editor.</div>`;
      return;
    }
    if (ERROR) { c.innerHTML = `<div class="empty">No se pudieron traer los eventos. Revisá la conexión.<br><button class="btn-ghost" data-ec="reintentar">Reintentar</button></div>`; return; }
    if (ABIERTO && ABIERTO !== "nuevo" && !EVS.some(e => e.id === ABIERTO)) ABIERTO = null;
    if (CAMP && CAMP !== "nueva" && !CAMPS.some(x => x.id === CAMP)) CAMP = null;
    if (ABIERTO) { c.innerHTML = `<div class="ec-detalle"></div>`; return pintarDetalle(); }
    if (CAMP) { c.innerHTML = `<div class="ec-detalle"></div>`; return pintarCampana(); }
    c.innerHTML = `<div class="ec-tablero"></div>`;
    pintarTablero();
  }

  const ventanaChips = () => `<div class="ec-ventana" role="group" aria-label="Ventana de medición">
    <span>Compras a</span>${VENTANAS.map(n => `<button class="${VENTANA === n ? "on" : ""}" data-ec="ventana" data-n="${n}">${n} días</button>`).join("")}</div>`;
  const lineaVentas = () => RANGO
    ? `Ventas cargadas del ${fechaLarga(RANGO.desde)} al <b>${fechaLarga(RANGO.hasta)}</b>`
    : `<b class="ec-falta">Sin ventas cargadas</b>`;
  // De dónde salen las ventas (pregunta de la usuaria): se muestra siempre, con el último archivo subido.
  const fuenteVentas = () => `<details class="ec-fuente ec-no-print"><summary>¿De dónde salen las ventas?</summary>
    <p>Del <b>Reporte de ventas</b> del sistema (CSV, una fila por línea de factura). Se toma el <b>neto en US$</b> de cada comprobante
    (las notas de crédito restan) y se suma por cliente y por día. Se sube desde <b>⋯ Más → Actualizar ventas</b>; cada vez reemplaza sólo el período que trae el archivo.</p>
    <p>${RANGO ? `Hoy hay ventas del <b>${fechaLarga(RANGO.desde)}</b> al <b>${fechaLarga(RANGO.hasta)}</b> (${(RANGO.clientes || CLI.size).toLocaleString("es-AR")} clientes).` : "Todavía no se subió ningún reporte."}
    ${ULT_IMPORT ? `Último archivo: <b>${esc(ULT_IMPORT.archivo)}</b>, subido el ${fechaLarga(String(ULT_IMPORT.creado).slice(0, 10))}${ULT_IMPORT.autor_email ? ` por ${esc(ULT_IMPORT.autor_email.split("@")[0])}` : ""}.` : ""}
    Son <b>compras del distribuidor a Leuk</b> (sell-in): no vemos lo que el distribuidor le vende después a los profesionales.</p></details>`;
  const avisoSQL3 = () => SIN_SQL3 ? `<div class="res-intro ec-no-print">Para usar lo nuevo (disertante, inversión en pesos, partner, oportunidades, audiencias y campañas) falta correr
    <b>supabase/sql/2026-10-20-impacto-acciones.sql</b> en Supabase → SQL Editor. Lo demás funciona igual.</div>` : "";

  const pestanas = () => `<nav class="ec-tabs ec-no-print" role="tablist">${[["eventos", "Charlas y eventos"], ["comparar", "Comparar períodos"], ["campanas", "Campañas de producto"], ["faltan", "Datos que faltan"]]
      .map(([k, t]) => `<button role="tab" class="${TAB === k ? "on" : ""}" aria-selected="${TAB === k}" data-ec="tab" data-tab="${k}">${t}</button>`).join("")}</nav>`;
  const encabezado = (sub, acciones, kpis) => `
      <header class="mh">
        <div class="mh-top">
          <div class="mh-tit"><h1>Impacto de acciones</h1><p class="mh-sub"><span>${sub}</span><span>${lineaVentas()}</span></p></div>
          <div class="mh-acc ec-no-print">
            <details class="mh-mas"><summary class="btn-ghost">⋯ Más</summary><div class="mh-mas-menu">
              <button data-ec="importar">⬆ Actualizar ventas (CSV del sistema)</button>
              <button data-ec="excel">⬇ Descargar Excel</button>
              <button data-ec="pdf">⬇ Descargar PDF</button>
            </div></details>
            ${acciones}
          </div>
        </div>
        <input type="file" class="ec-csv" accept=".csv,text/csv" hidden>
        ${pestanas()}
        ${kpis || ""}
      </header>`;

  /* ---------- Filtros ---------- */
  const periodoEv = ev => periodoDe(ev.fecha || ev.creado);
  const periodos = () => [...new Set([periodoDe(hoyISO()), ...EVS.map(periodoEv), ...CAMPS.map(x => periodoDe(x.distribuido_fecha || x.creado))].filter(Boolean))].sort().reverse();
  const delPeriodo = () => EVS.filter(e => !PERIODO || periodoEv(e) === PERIODO);
  const delFiltro = (sinEstado) => delPeriodo().filter(e => (!FORMATO || e.formato === FORMATO) && (!DISERT || (e.disertante || "") === DISERT) &&
    (sinEstado || !ESTADO_F || calcular(e, VENTANA).estado === ESTADO_F));
  const disertantes = () => [...new Set([...DISERTANTES, ...EVS.map(e => e.disertante).filter(Boolean)])];
  const filtroPeriodo = () => `<select class="ac-sel" data-f="periodo" aria-label="Período (octubre a octubre)"><option value="">Todos los períodos</option>${periodos().map(p => `<option value="${p}" ${PERIODO === p ? "selected" : ""}>${periodoNombre(p)}</option>`).join("")}</select>`;

  /* ---------- Agregados (para KPIs, comparar períodos y patrones) ---------- */
  function agregar(ks) {
    const S = (arr, f) => arr.reduce((s, k) => s + (f(k) || 0), 0);
    const med = ks.filter(medido);
    const Xpos = S(med, k => Math.max(0, k.X)), invMed = S(med, k => k.inv.usd);
    return {
      n: ks.length, med: med.length, eval: ks.filter(k => k.estado === "evaluado").length, prov: ks.filter(k => k.estado === "provisorio").length,
      esperando: ks.filter(k => k.estado === "esperando").length, faltan: ks.filter(k => k.estado === "faltan").length,
      inscr: S(ks, k => k.inscr), asis: S(ks, k => k.asis), asisMed: S(med, k => k.asis),
      inv: S(ks, k => k.inv.usd), invMed, X: S(med, k => k.X), Xpos,
      roas: invMed ? Xpos / invMed : null,
      sirvieron: med.filter(k => k.X > 0).length,
      conOps: ks.filter(k => k.ops.length).length, ops: S(ks, k => k.ops.length), opsConc: S(ks, k => k.opsConcretadas),
      grandes: S(med, k => k.grandes.length), grandesUsd: S(med, k => k.grandesUsd),
      impacto: ks.filter(k => (medido(k) && k.X > 0) || k.ops.length).length,   // compras extra u oportunidades
    };
  }
  const subEstados = a => [a.eval && `${a.eval} evaluado${a.eval === 1 ? "" : "s"}`, a.prov && `${a.prov} provisorio${a.prov === 1 ? "" : "s"}`,
    a.esperando && `${a.esperando} esperando ventas`, a.faltan && `${a.faltan} con datos faltantes`].filter(Boolean).join(" · ");

  /* ---------- TABLERO ---------- */
  function pintarTablero() {
    const w = caja().querySelector(".ec-tablero"); if (!w) return;
    if (TAB === "comparar") return pintarComparar(w);
    if (TAB === "campanas") return pintarCampanas(w);
    if (TAB === "faltan") return pintarFaltan(w);
    const evs = delFiltro();
    const ks = evs.map(e => calcular(e, VENTANA));
    // En los gráficos los eventos van en orden cronológico; en la tabla, el más nuevo arriba.
    const med = ks.filter(medido).sort((a, b) => a.ev.fecha.localeCompare(b.ev.fecha));
    const A = agregar(ks);
    const formatos = [...new Set([...FORMATOS, ...EVS.map(e => e.formato).filter(Boolean)])];
    const porDist = resumenDistribuidores(ks);
    const todosPer = agregar(delFiltro(true).map(e => calcular(e, VENTANA)));
    const conOps = ks.filter(k => k.ops.length);
    const aud = audienciaDe(ks);

    w.innerHTML = encabezado("Charlas y eventos con distribuidores para profesionales: ¿qué movieron?",
      `<button class="btn-ghost" data-ec="excel" title="Descargar Excel">⬇ Excel</button><button class="btn-primary" data-ec="nuevo">＋ Nuevo evento</button>`,
      evs.length ? `<div class="mh-kpis">
          ${kpi(evs.length, evs.length === 1 ? "evento" : "eventos", subEstados(A) || (PERIODO ? periodoNombre(PERIODO) : "en total"))}
          ${kpi(`${A.impacto}<small>/${A.n}</small>`, "con impacto", "compras extra u oportunidades", A.impacto ? "ok" : "")}
          ${kpi(`${A.asis}<small>/${A.inscr}</small>`, "profesionales asistieron", A.inscr ? `${pctN(A.asis / A.inscr)} de los inscriptos` : "cargá los inscriptos")}
          ${kpi(signo(A.X), "compras extra", `a ${VENTANA} días, sobre lo esperado${A.prov ? " · incluye provisorios" : ""}`, tono(A.X))}
          ${kpi(A.roas != null ? roas(A.roas) : "—", "ROAS", A.inv ? `compras extra ÷ ${usd(A.inv)} invertidos` : "cargá la inversión", A.roas != null ? (A.roas >= 1 ? "ok" : "no") : "")}
          ${kpi(A.ops, A.ops === 1 ? "oportunidad" : "oportunidades", A.ops ? `${A.opsConc} concretada${A.opsConc === 1 ? "" : "s"} · en ${plural(A.conOps, "evento")}` : "que nacieron de los eventos")}
          ${kpi(A.grandes, A.grandes === 1 ? "compra grande" : "compras grandes", A.grandes ? `${usd(A.grandesUsd)} después de los eventos` : "más de 2× el promedio del distribuidor")}
          ${kpi(A.inv && A.asis ? usd(A.inv / A.asis) : "—", "costo por profesional", "inversión ÷ asistentes")}
        </div>` : "");
    w.insertAdjacentHTML("beforeend", `
      <div class="mh-bar ec-bar ec-no-print">
        ${filtroPeriodo()}
        <select class="ac-sel" data-f="formato" aria-label="Formato"><option value="">Todos los formatos</option>${formatos.map(f => `<option ${FORMATO === f ? "selected" : ""}>${esc(f)}</option>`).join("")}</select>
        <select class="ac-sel" data-f="disertante" aria-label="Disertante"><option value="">Todos los disertantes</option>${disertantes().map(d => `<option ${DISERT === d ? "selected" : ""}>${esc(d)}</option>`).join("")}</select>
        ${ventanaChips()}
        <span class="ec-nota" role="status"></span>
      </div>
      <div class="mh-chips ec-estados ec-no-print" role="group" aria-label="Estado de evaluación">
        ${[["", "Todos", todosPer.n], ["evaluado", ESTADOS.evaluado, todosPer.eval], ["provisorio", ESTADOS.provisorio, todosPer.prov], ["esperando", ESTADOS.esperando, todosPer.esperando], ["faltan", ESTADOS.faltan, todosPer.faltan]]
          .map(([k, t, n]) => `<button class="ac-chip ${ESTADO_F === k ? "on" : ""}" data-ec="estado" data-k="${k}">${t} <b>${n}</b></button>`).join("")}
      </div>
      ${avisoSQL3()}
      ${fuenteVentas()}
      ${!RANGO ? `<div class="res-intro">Para medir las compras, subí el <b>Reporte de ventas</b> del sistema (CSV) desde <b>⋯ Más → Actualizar ventas</b>. Se puede volver a subir cuando quieras: reemplaza el período que trae el archivo.</div>` : ""}
      ${!EVS.length ? `<div class="res-intro">Todavía no hay eventos. Creá el primero con <b>＋ Nuevo evento</b>: cargá cuántos profesionales se inscribieron y cuántos fueron, y elegí el <b>distribuidor</b> con el que lo hiciste.</div>` : ""}
      ${EVS.length && !evs.length ? `<div class="res-intro">No hay eventos con estos filtros${PERIODO ? ` en <b>${periodoNombre(PERIODO)}</b>` : ""}. Probá con <b>Todos los períodos</b>, o mirá <b>Datos que faltan</b> para recuperar acciones del año anterior.</div>` : ""}
      ${evs.length ? `<div class="ec-grid">
        ${tarjeta("Compras extra vs. inversión", `US$ por evento · ${VENTANA} días`,
          leyenda([["Inversión", COL.gris], ["Compras extra", COL.main]]) +
          columnas(med.map(k => k.ev.titulo || "Sin nombre"), [{ c: COL.gris, vals: med.map(k => k.inv.usd) }, { c: COL.main, cNeg: COL.neg, vals: med.map(k => k.X) }], usd))}
        ${tarjeta("Más allá de las ventas", "Oportunidades que nacieron de cada evento",
          conOps.length ? `<ul class="ec-ops-lista">${conOps.map(k => `<li><button class="ec-link" data-abrir="${k.ev.id}">${esc(k.ev.titulo || "Sin nombre")}</button>
            ${k.ops.map(o => `<span class="ec-op-chip ${o.estado === "Concretada" ? "ok" : ""}">${esc(o.titulo || o.tipo)}<small>${esc(o.estado)}</small></span>`).join("")}</li>`).join("")}</ul>`
          : `<div class="ec-graf-vacio">Todavía no hay oportunidades cargadas. Sumalas en la ficha de cada evento (por ejemplo: <i>BORE → Espacio UNNE</i>).</div>`)}
        ${tarjeta("Profesionales por evento", "Asistieron (y de fondo, inscriptos)",
          barrasH(ks.filter(k => k.inscr || k.asis).slice().reverse().map(k => ({ l: k.ev.titulo || "Sin nombre", v: k.asis || 0, g: k.inscr || 0 })), v => String(Math.round(v))) +
          leyenda([["Inscriptos (fondo)", COL.gris], ["Asistieron", COL.main]]))}
        ${tarjeta("A quién convocamos", aud.total ? `Perfiles de ${aud.total} profesionales de ${plural(aud.eventos, "evento")} (encuestas / inscriptos)` : "Perfiles de la audiencia",
          aud.total ? barrasH(aud.filas.map(f => ({ l: f.p + (f.objetivo ? " ★" : ""), v: f.n / aud.total * 100, c: f.objetivo ? COL.main : COL.soft })), v => `${Math.round(v)} %`) +
            `<p class="ec-ayuda">★ = perfil que buscamos convocar${aud.objetivoPct != null ? ` · <b>${pctN(aud.objetivoPct)}</b> de los asistentes es de un perfil buscado` : ""}. Sirve para armar las convocatorias y segmentar las pautas.</p>`
          : `<div class="ec-graf-vacio">Cargá los perfiles en cada evento (a mano o subiendo la encuesta de Luz en Acción).</div>`)}
        ${tarjeta("¿Creció más que el resto?", `Crecimiento del distribuidor vs. resto de los clientes · ${VENTANA} días`,
          leyenda([["Resto de los clientes", COL.gris], ["Distribuidor del evento", COL.main]]) +
          columnas(med.map(k => k.ev.titulo || "Sin nombre"), [{ c: COL.gris, vals: med.map(k => k.base.crec * 100) }, { c: COL.main, vals: med.map(k => k.crec == null ? null : k.crec * 100) }],
            v => `${v > 0 ? "+" : ""}${Math.round(v)} %`, v => `${Math.round(v)} %`))}
        ${tarjeta("Compras extra por distribuidor", `Suma de sus eventos · US$ a ${VENTANA} días`,
          divergente(porDist.filter(d => d.medidos).slice(0, 10).map(d => ({ l: d.nombre + (d.partner === "si" ? " (partner)" : ""), v: d.X, c: d.X >= 0 ? COL.main : COL.neg })), signo))}
      </div>` : ""}
      ${evs.length ? `<section class="ec-card ec-tabla-card"><h3>Eventos</h3>
        <div class="ec-tabla-wrap"><table class="ec-tabla">
          <thead><tr><th>Evento</th><th>Distribuidor</th><th class="n">Profesionales</th><th class="n">Inversión</th><th class="n">Después</th><th class="n">Compras extra</th><th class="n">ROAS</th><th class="n">Compras grandes</th><th class="n">Oportunidades</th><th>¿Sirvió?</th></tr></thead>
          <tbody>${ks.map(k => `<tr data-abrir="${k.ev.id}" tabindex="0">
            <td><b>${esc(k.ev.titulo) || "<i>Sin nombre</i>"}</b><small>${esc([fechaLarga(k.ev.fecha), k.ev.formato, k.ev.disertante && "por " + k.ev.disertante].filter(Boolean).join(" · "))}</small></td>
            <td>${esc(k.nombres) || "—"}${partnerTag(k.partner)}</td>
            <td class="n">${k.asis != null ? k.asis : "—"}${k.inscr ? ` <small>de ${k.inscr}</small>` : ""}</td>
            <td class="n">${k.inv.usd != null ? usd(k.inv.usd) : `<span class="ec-falta" title="${esc(k.inv.origen || "Sin cargar")}">falta</span>`}</td>
            <td class="n">${k.antes ? usd(k.P) : "—"}${k.antes && k.dias < VENTANA ? ` <small title="Todavía no pasaron ${VENTANA} días">${k.dias} d</small>` : ""}</td>
            <td class="n ${medido(k) ? tono(k.X) : ""}">${medido(k) ? signo(k.X) : "—"}</td>
            <td class="n">${medido(k) && k.retorno != null ? roas(k.retorno) : "—"}</td>
            <td class="n">${medido(k) ? (k.grandes.length ? `${k.grandes.length} <small>${usdCorto(k.grandesUsd)}</small>` : "0") : "—"}</td>
            <td class="n">${k.ops.length ? `${k.ops.length}${k.opsConcretadas ? ` <small>${k.opsConcretadas} concr.</small>` : ""}` : "—"}</td>
            <td>${chipVer(k)}<small class="ec-estado ${k.estado}">${ESTADOS[k.estado]}</small></td></tr>`).join("")}</tbody>
        </table></div></section>` : ""}
      ${porDist.length ? `<section class="ec-card ec-tabla-card"><h3>Por distribuidor</h3>
        <p class="ec-card-sub">Con quién hicimos eventos y cuánto movieron las compras (suma de sus eventos, ${VENTANA} días)</p>
        <div class="ec-tabla-wrap"><table class="ec-tabla">
          <thead><tr><th>Distribuidor</th><th>¿Partner?</th><th>Vendedor</th><th class="n">Eventos</th><th class="n">Profesionales</th><th class="n">Inversión</th><th class="n">Compras extra</th><th class="n">ROAS</th><th class="n">Oportunidades</th></tr></thead>
          <tbody>${porDist.map(d => `<tr><td><b>${esc(d.nombre)}</b>${d.razon && d.razon !== d.nombre ? `<small>${esc(d.razon)}</small>` : ""}</td>
            <td>${d.partner === "si" ? "Sí" : d.partner === "no" ? "No" : d.partner === "mixto" ? "Cambió" : `<span class="ec-falta">sin dato</span>`}</td>
            <td>${esc(d.vendedor)}</td><td class="n">${d.eventos}</td><td class="n">${d.asis || "—"}</td><td class="n">${d.inv ? usd(d.inv) : "—"}</td>
            <td class="n ${d.medidos ? tono(d.X) : ""}">${d.medidos ? signo(d.X) : "—"}</td><td class="n">${d.medidos && d.inv ? roas(Math.max(0, d.X) / d.inv) : "—"}</td>
            <td class="n">${d.ops || "—"}</td></tr>`).join("")}</tbody>
        </table></div></section>` : ""}`);
    pintarNota();
  }
  const partnerTag = p => p === "si" ? ` <span class="ec-tag partner">partner</span>` : p === "no" ? ` <span class="ec-tag nopartner">no partner</span>` : "";
  // Un renglón por distribuidor. Si un evento tuvo varios, la inversión, los profesionales
  // y las oportunidades se reparten en partes iguales (para no contarlos dos veces).
  function resumenDistribuidores(ks) {
    const m = new Map();
    ks.forEach(k => {
      const n = k.lista.length || 1;
      (k.dists.length ? k.dists : k.lista.map(x => ({ x, nombre: x.nombre || (CLI.get(x.cuit) || {}).nombre || x.razon_social, razon: x.razon_social, vendedor: (CLI.get(x.cuit) || {}).vendedor || "" })))
        .forEach(r => {
          const o = m.get(r.x.cuit) || { nombre: r.nombre, razon: r.razon, vendedor: r.vendedor, cuit: r.x.cuit, eventos: 0, asis: 0, inv: 0, X: 0, medidos: 0, ops: 0, pSi: 0, pNo: 0 };
          o.eventos++; o.asis += (k.asis || 0) / n; o.inv += (k.inv.usd || 0) / n; o.ops += k.ops.length / n;
          if (r.x.era_partner === true) o.pSi++; if (r.x.era_partner === false) o.pNo++;
          if (medido(k) && r.extra != null) { o.X += r.extra; o.medidos++; }
          m.set(r.x.cuit, o);
        });
    });
    return [...m.values()].map(o => Object.assign(o, { asis: Math.round(o.asis), ops: Math.round(o.ops * 10) / 10,
      partner: o.pSi && o.pNo ? "mixto" : o.pSi ? "si" : o.pNo ? "no" : "" })).sort((a, b) => b.X - a.X || b.eventos - a.eventos);
  }
  // Perfiles sumados de varios eventos, con los "buscados" (objetivo) marcados.
  function audienciaDe(ks) {
    const tot = {}, obj = new Set(); let eventos = 0;
    ks.forEach(k => {
      const p = k.ev.perfiles || {}; if (!Object.keys(p).length) return;
      eventos++; Object.entries(p).forEach(([x, n]) => { tot[x] = (tot[x] || 0) + (Number(n) || 0); });
      (k.ev.perfiles_objetivo || []).forEach(x => obj.add(x));
    });
    const total = Object.values(tot).reduce((s, x) => s + x, 0);
    const filas = Object.entries(tot).filter(([, n]) => n > 0).map(([p, n]) => ({ p, n, objetivo: obj.has(p) })).sort((a, b) => b.n - a.n);
    const enObj = filas.filter(f => f.objetivo).reduce((s, f) => s + f.n, 0);
    return { total, eventos, filas, objetivo: [...obj], objetivoPct: total && obj.size ? enObj / total : null };
  }

  /* ---------- COMPARAR PERÍODOS (octubre a octubre) ---------- */
  function filaAgregado(nombre, a, sub) {
    return `<tr><td><b>${nombre}</b>${sub ? `<small>${sub}</small>` : ""}</td><td class="n">${a.n}</td><td class="n">${a.asis || "—"}</td><td class="n">${a.inv ? usd(a.inv) : "—"}</td>
      <td class="n ${a.med ? tono(a.X) : ""}">${a.med ? signo(a.X) : "—"}</td><td class="n">${a.roas != null ? roas(a.roas) : "—"}</td>
      <td class="n">${a.med ? `${a.sirvieron}<small>/${a.med}</small>` : "—"}</td><td class="n">${a.ops || "—"}</td><td class="n">${a.grandes || "—"}</td>
      <td class="n">${a.n ? pctN(a.impacto / a.n) : "—"}</td></tr>`;
  }
  const CAB_AGR = `<thead><tr><th></th><th class="n">Eventos</th><th class="n">Profesionales</th><th class="n">Inversión</th><th class="n">Compras extra</th><th class="n">ROAS</th>
    <th class="n">Con compras extra</th><th class="n">Oportunidades</th><th class="n">Compras grandes</th><th class="n">Con impacto</th></tr></thead>`;
  function grupos(ks, clave) {
    const m = new Map();
    ks.forEach(k => { [].concat(clave(k)).forEach(g => { if (!m.has(g)) m.set(g, []); m.get(g).push(k); }); });
    return [...m.entries()].map(([g, arr]) => ({ g, a: agregar(arr) })).sort((x, y) => y.a.n - x.a.n);
  }
  function pintarComparar(w) {
    const todos = EVS.map(e => calcular(e, VENTANA));
    const pers = periodos().slice().reverse();
    const porPer = pers.map(p => ({ p, a: agregar(todos.filter(k => periodoEv(k.ev) === p)) }));
    const ks = delPeriodo().map(e => calcular(e, VENTANA));
    const tabla = (tit, sub, filas) => `<section class="ec-card ec-tabla-card"><h3>${tit}</h3>${sub ? `<p class="ec-card-sub">${sub}</p>` : ""}
      <div class="ec-tabla-wrap"><table class="ec-tabla">${CAB_AGR}<tbody>${filas}</tbody></table></div></section>`;
    const conDatos = porPer.filter(x => x.a.n);
    w.innerHTML = encabezado("Períodos de octubre a octubre lado a lado: qué acciones generan impacto",
      `<button class="btn-ghost" data-ec="excel" title="Descargar Excel">⬇ Excel</button>`) + `
      <div class="mh-bar ec-bar ec-no-print">${ventanaChips()}<span class="ec-nota" role="status"></span></div>
      ${avisoSQL3()}
      <p class="ec-ayuda">Cada período va del <b>1 de octubre al 30 de septiembre</b>. "Con impacto" = eventos con compras extra o con alguna oportunidad.</p>
      ${conDatos.length ? `<div class="ec-grid">
        ${tarjeta("Compras extra e inversión por período", `US$ · ${VENTANA} días`,
          leyenda([["Inversión", COL.gris], ["Compras extra", COL.main]]) +
          columnas(conDatos.map(x => periodoCorto(x.p)), [{ c: COL.gris, vals: conDatos.map(x => x.a.inv) }, { c: COL.main, cNeg: COL.neg, vals: conDatos.map(x => x.a.med ? x.a.X : null) }], usd))}
        ${tarjeta("Eventos y oportunidades por período", "Cantidad",
          leyenda([["Eventos", COL.gris], ["Con impacto", COL.main], ["Oportunidades", COL.warn]]) +
          columnas(conDatos.map(x => periodoCorto(x.p)), [{ c: COL.gris, vals: conDatos.map(x => x.a.n) }, { c: COL.main, vals: conDatos.map(x => x.a.impacto) }, { c: COL.warn, vals: conDatos.map(x => x.a.ops) }],
            v => String(Math.round(v)), v => String(Math.round(v))))}
      </div>` : `<div class="res-intro">Todavía no hay eventos cargados. Para comparar con el año anterior, cargá también las acciones de ese período (en <b>Datos que faltan</b> están las acciones que todavía no se pasaron).</div>`}
      ${tabla("Por período", "Octubre a octubre", porPer.map(x => filaAgregado(periodoNombre(x.p), x.a, subEstados(x.a))).join(""))}
      <div class="mh-bar ec-bar ec-no-print"><span class="ec-ayuda">Patrones de</span>${filtroPeriodo()}</div>
      ${ks.length ? `
      ${tabla("Por formato", "¿Qué tipo de acción funciona mejor?", grupos(ks, k => k.ev.formato || "Sin formato").map(x => filaAgregado(esc(x.g), x.a)).join(""))}
      ${tabla("Por disertante", "Las charlas de cada uno", grupos(ks, k => k.ev.disertante || "Sin cargar").map(x => filaAgregado(esc(x.g), x.a)).join(""))}
      ${tabla("Partners y no partners", "Según si el distribuidor ya era partner cuando se hizo el evento",
        grupos(ks, k => ({ si: "Ya era partner", no: "No era partner", mixto: "Varios distribuidores (mixto)" }[k.partner] || "Sin dato")).map(x => filaAgregado(esc(x.g), x.a)).join(""))}`
      : `<div class="res-intro">No hay eventos ${PERIODO ? `en ${periodoNombre(PERIODO)}` : ""}.</div>`}`;
    pintarNota();
  }

  /* ---------- EVENTO ---------- */
  const eventoAbierto = () => ABIERTO === "nuevo" ? BORRADOR : EVS.find(e => e.id === ABIERTO);
  const monedaDe = (key, x) => INV_MON[key] || (num(x.inversion_ars) != null && num(x.inversion_usd) == null ? "ARS" : "USD");
  // Monto + moneda de la inversión (evento o campaña).
  const campoInversion = (key, x, ph) => { const m = monedaDe(key, x), v = m === "ARS" ? num(x.inversion_ars) : num(x.inversion_usd);
    return `<label><span>Inversión</span><span class="ec-monto"><select data-campo="inv_moneda" aria-label="Moneda"${SIN_SQL3 ? " disabled" : ""}><option value="USD" ${m === "USD" ? "selected" : ""}>US$</option><option value="ARS" ${m === "ARS" ? "selected" : ""}>$</option></select>` +
      `<input type="number" min="0" step="1" data-campo="inv_monto" value="${v == null ? "" : v}" placeholder="${ph || "0"}"></span></label>`; };
  function pintarDetalle() {
    const w = caja().querySelector(".ec-detalle"); if (!w) return;
    const ev = eventoAbierto(); if (!ev) return pintar();
    const nuevo = ABIERTO === "nuevo";
    const puedeBorrar = !nuevo && (esAdmin() || low(ev.autor_email) === yo());
    const formatos = [...new Set([...FORMATOS, ev.formato].filter(Boolean))];
    const accs = ACCS.slice().sort((a, b) => (b.tipo === "Evento") - (a.tipo === "Evento"));
    const invAcc = inversion(Object.assign({}, ev, { inversion_usd: null, inversion_ars: null }));
    const n = v => num(v) == null ? "" : num(v);
    w.innerHTML = `
      <div class="ec-d-top ec-no-print">
        <button class="btn-ghost" data-ec="volver">← Impacto de acciones</button>
        <span class="ec-nota" role="status"></span>
        ${!nuevo ? `<button class="btn-ghost" data-ec="excel">⬇ Excel</button><button class="btn-ghost" data-ec="pdf">⬇ PDF</button>` : ""}
        ${puedeBorrar ? `<button class="btn-ghost ec-borrar" data-ec="borrar">Eliminar</button>` : ""}
      </div>
      ${avisoSQL3()}
      <section class="ec-card ec-datos">
        <input class="ec-titulo" data-campo="titulo" placeholder="Nombre del evento (ej. Charla de iluminación con Luz Design)" value="${esc(ev.titulo)}" aria-label="Nombre del evento">
        <div class="ec-campos">
          <label><span>Fecha</span><input type="date" data-campo="fecha" value="${esc(ev.fecha || "")}"></label>
          <label><span>Formato</span><select data-campo="formato"><option value="">—</option>${formatos.map(f => `<option ${ev.formato === f ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></label>
          ${campoDisertante(ev)}
          <label><span>Lugar</span><input data-campo="lugar" value="${esc(ev.lugar)}" placeholder="Showroom del distribuidor"></label>
          <label><span>Profesionales inscriptos</span><input type="number" min="0" step="1" data-campo="prof_inscriptos" value="${n(ev.prof_inscriptos)}" placeholder="0"></label>
          <label><span>Profesionales que fueron</span><input type="number" min="0" step="1" data-campo="prof_asistentes" value="${n(ev.prof_asistentes)}" placeholder="0"></label>
          <label class="ancho"><span>Acción vinculada</span><select data-campo="accion_id"><option value="">Sin vincular</option>${accs.map(a => `<option value="${a.id}" ${ev.accion_id === a.id ? "selected" : ""}>${esc(a.titulo)}${a.tipo ? ` (${esc(a.tipo)})` : ""}</option>`).join("")}</select></label>
          ${campoInversion(ev.id || "nuevo", ev, invAcc.usd != null ? Math.round(invAcc.usd) : "0")}
        </div>
        <p class="ec-ayuda ec-inv-ayuda">${ayudaInv(ev)}</p>
        <textarea data-campo="notas" rows="2" placeholder="Notas: objetivo, qué se mostró, condiciones especiales que se ofrecieron…">${esc(ev.notas)}</textarea>
        ${nuevo ? `<div class="ec-crear"><button class="btn-primary" data-ec="crear">Crear evento</button><span class="ec-ayuda">Después elegís el distribuidor.</span></div>` : ""}
      </section>
      ${nuevo ? "" : `<section class="ec-card ec-clientes"></section><div class="ec-analisis"></div>
        <div class="ec-grid ec-grid-2"><section class="ec-card ec-ops"></section><section class="ec-card ec-aud"></section></div>
        <section class="ec-card ec-faltan-ev"></section>`}`;
    pintarNota();
    if (!nuevo) { pintarDistribuidores(); pintarAnalisis(); pintarOps(); pintarAudiencia(); pintarFaltanEvento(); asegurarDatos(ev); }
  }

  // Quién dio la charla: Barbara, Matias u "Otro…" (que pide escribir el nombre).
  function campoDisertante(ev) {
    const d = ev.disertante || "", otro = OTRO_DIS || (!!d && !DISERTANTES.includes(d)), dis = SIN_SQL3 ? " disabled" : "";
    return `<label><span>Quién dio la charla</span><select data-campo="disertante_sel"${dis}><option value="">Elegí…</option>${DISERTANTES.map(x => `<option ${d === x && !otro ? "selected" : ""}>${esc(x)}</option>`).join("")}<option value="otro" ${otro ? "selected" : ""}>Otro…</option></select>
            <input class="ec-dis-otro" data-campo="disertante" value="${otro ? esc(d) : ""}" placeholder="Escribí quién dio la charla" aria-label="Quién dio la charla"${otro ? "" : ' style="display:none"'}${dis}></label>`;
  }

  // De dónde sale la inversión cuando no se cargó en US$.
  function ayudaInv(ev) {
    if (num(ev.inversion_usd) != null) return "";
    const i = inversion(ev);
    if (num(ev.inversion_ars) != null) return `Inversión ${esc(i.origen)}${i.usd != null ? `: <b>${usd(i.usd)}</b>` : ""}.`;
    return i.origen ? `Inversión ${esc(i.origen)}${i.usd != null ? `: <b>${usd(i.usd)}</b>` : ""}. Si escribís un monto, manda ese.`
      : `<span class="ec-falta">Falta la inversión</span>: cargala acá (en US$ o en pesos) o vinculá la acción que la tiene.`;
  }
  function pintarAyudaInv() {
    const ev = eventoAbierto(), p = caja().querySelector(".ec-inv-ayuda"); if (!ev || !p) return;
    p.innerHTML = ayudaInv(ev);
  }
  // Trae lo que falte para el análisis (ventas del distribuidor, resto de clientes, TC) y repinta.
  async function asegurarDatos(ev) {
    const cuits = (INV[ev.id] || []).map(x => x.cuit).filter(Boolean);
    try {
      await Promise.all([cargarVentas(cuits), necesitaTC(ev) ? tcCerca(ev.fecha) : null]);
      await traerBase(ev, calcular(ev, VENTANA));
      if (ABIERTO === ev.id) { pintarAyudaInv(); pintarDistribuidores(); pintarAnalisis(); pintarFaltanEvento(); }
    } catch (e) { nota("No se pudieron traer las ventas del distribuidor.", true); }
  }

  function pintarAnalisis() {
    const w = caja().querySelector(".ec-analisis"); if (!w) return;
    const ev = eventoAbierto(); if (!ev) return;
    const k = calcular(ev, VENTANA);
    const encab = `<div class="ec-bar ec-no-print">${ventanaChips()}${k.antes ? `<span class="ec-ayuda">Antes: ${fechaLarga(k.antes[0])} → ${fechaLarga(k.antes[1])} · Después: ${fechaLarga(k.despues[0])} → ${fechaLarga(k.despues[1])}${k.dias < VENTANA ? ` · <b>sólo ${k.dias} días con datos</b>` : ""}</span>` : ""}</div>`;
    const ver = `<section class="ec-veredicto ${k.ver.c}"><b>${esc(k.ver.t.replace(" (provisorio)", ""))}</b> <span class="ec-estado ${k.estado}">${ESTADOS[k.estado]}</span>${k.ver.txt ? `<p>${k.ver.txt}</p>` : ""}</section>`;
    const kpis = `<div class="mh-kpis">
        ${kpi(k.asis != null ? `${k.asis}${k.inscr ? `<small>/${k.inscr}</small>` : ""}` : "—", "profesionales fueron", k.asistencia != null ? `${pctN(k.asistencia)} de los inscriptos` : "cargá inscriptos y asistentes")}
        ${k.antes ? `
        ${kpi(usd(k.P), `compras del distribuidor a ${k.dias} días`, `antes: ${usd(k.A)} (${pct(k.crec)})`)}
        ${kpi(k.base ? signo(k.X) : "…", "compras extra", k.base ? `esperado: ${usd(k.E)}` : "calculando", k.base ? tono(k.X) : "")}
        ${kpi(k.puntos != null ? `${k.puntos >= 0 ? "+" : "−"}${Math.abs(Math.round(k.puntos * 100))} pts` : "—", "vs. el resto de los clientes", k.base ? `el resto: ${pct(k.base.crec)}` : "", tono(k.puntos))}
        ${kpi(k.retorno != null && k.base ? roas(k.retorno) : "—", "ROAS", !k.inv.usd ? "cargá la inversión" : `compras extra ÷ ${usd(k.inv.usd)} invertidos · sobre el total: ${roas(k.roasTotal)}`, k.base && k.retorno != null ? (k.retorno >= 1 ? "ok" : "no") : "")}
        ${kpi(k.grandes.length, k.grandes.length === 1 ? "compra grande" : "compras grandes", k.grandes.length ? usd(k.grandesUsd) : "más de 2× su compra promedio")}` : ""}
        ${kpi(k.ops.length, k.ops.length === 1 ? "oportunidad" : "oportunidades", k.ops.length ? `${k.opsConcretadas} concretada${k.opsConcretadas === 1 ? "" : "s"}${k.opsValor ? ` · ${usd(k.opsValor)} estimados` : ""}` : "que nacieron del evento", k.ops.length ? "ok" : "")}
        ${kpi(k.costoProf != null ? usd(k.costoProf) : "—", "costo por profesional", "inversión ÷ asistentes")}
        ${medido(k) && k.extraProf != null ? kpi(signo(k.extraProf), "compras extra por profesional", "que asistió", tono(k.extraProf)) : ""}
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
    const varios = k.lista.length > 1;
    w.innerHTML = encab + ver + kpis + `
      <div class="ec-grid">
        ${tarjeta("Antes, esperado y después", `US$ · ${k.dias} días antes vs. ${k.dias} días después`,
          barrasH([{ l: "Antes del evento", v: k.A, c: COL.gris }, { l: "Esperado sin evento", v: k.E, c: COL.soft }, { l: "Después del evento", v: k.P }], usd))}
        ${tarjeta("¿Creció más que el resto?", "Crecimiento de las compras: después vs. antes",
          divergente(crec.map(([l, v, c]) => ({ l, v, c })), pct) +
          `<p class="ec-ayuda">Si el distribuidor crece más que el resto de los clientes en las mismas fechas, esa diferencia es lo que se le atribuye al evento.</p>`)}
        ${tarjeta("Compras grandes después del evento", `Días de compra de más de 2× su compra promedio de los 12 meses previos · ${k.dias} días`,
          k.grandes.length ? `<div class="ec-tabla-wrap"><table class="ec-tabla ec-chica"><thead><tr><th>Fecha</th>${varios ? "<th>Distribuidor</th>" : ""}<th class="n">Compra</th><th class="n">vs. promedio</th><th>Familia principal</th></tr></thead>
            <tbody>${k.grandes.slice(0, 8).map(g => `<tr><td>${fechaLarga(g.fecha)}</td>${varios ? `<td>${esc(g.nombre)}</td>` : ""}<td class="n"><b>${usd(g.usd)}</b></td>
              <td class="n">${g.veces ? `${g.veces.toFixed(1).replace(".", ",")}×` : "primera compra"}</td><td>${esc(g.familia)}</td></tr>`).join("")}</tbody></table></div>`
            + (k.grandes.length > 8 ? `<p class="ec-ayuda">y ${k.grandes.length - 8} más (están en el Excel).</p>` : "")
          : `<div class="ec-graf-vacio">No hubo compras fuera de lo común en los ${k.dias} días posteriores.</div>`)}
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
    const conVentas = medido(k);
    const conFoco = document.activeElement && document.activeElement.classList.contains("ec-busca-cli");
    const filas = k.dists.length ? k.dists : k.lista.map(x => { const c = CLI.get(x.cuit) || {};
      return { x, nombre: x.nombre || c.nombre || x.razon_social, razon: x.razon_social || c.razon_social || "", vendedor: c.vendedor || "" }; });
    const accDist = accionDe(ev) && accionDe(ev).distribuidor;
    const selPartner = x => `<select class="ec-partner" data-ec-inv="era_partner" data-id="${x.id}" aria-label="¿Era partner?"${SIN_SQL3 ? " disabled" : ""}>
      <option value="" ${x.era_partner == null ? "selected" : ""}>Sin dato</option><option value="si" ${x.era_partner === true ? "selected" : ""}>Sí, era partner</option><option value="no" ${x.era_partner === false ? "selected" : ""}>No era partner</option></select>`;
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
        <thead><tr><th>Distribuidor</th><th>¿Era partner?</th><th>Vendedor</th>
          ${conVentas ? `<th class="n">Antes</th><th class="n">Después</th><th class="n">Esperado</th><th class="n">Compras extra</th>` : ""}<th class="ec-no-print"></th></tr></thead>
        <tbody>${filas.map(r => `<tr>
          <td><b>${esc(r.nombre)}</b><small>${esc([r.razon !== r.nombre ? r.razon : "", r.x.cuit].filter(Boolean).join(" · "))}</small></td>
          <td>${selPartner(r.x)}</td>
          <td>${esc(r.vendedor)}</td>
          ${conVentas ? `<td class="n">${usd(r.antes)}</td><td class="n"><b>${usd(r.despues)}</b></td><td class="n">${usd(r.esperado)}</td><td class="n ${tono(r.extra)}">${signo(r.extra)}</td>` : ""}
          <td class="ec-no-print"><button class="ac-mini" data-ec="quitar" data-id="${r.x.id}" title="Quitar del evento" aria-label="Quitar del evento">✕</button></td>
        </tr>`).join("")}</tbody>
      </table></div>
      <p class="ec-ayuda">¿Era partner? = si ya estaba en el programa de partners <b>cuando se hizo el evento</b> (sirve para comparar partners y no partners).</p>`}`;
    pintarSugerencias();
    if (conFoco) { const t = w.querySelector(".ec-busca-cli"); t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
  }

  /* ---- Oportunidades del evento ---- */
  function pintarOps() {
    const w = caja().querySelector(".ec-ops"); if (!w) return;
    const ev = eventoAbierto(); if (!ev) return;
    const ops = opsDe(ev);
    const opt = (lista, v) => lista.map(x => `<option ${v === x ? "selected" : ""}>${esc(x)}</option>`).join("");
    w.innerHTML = `<div class="ec-cli-top"><h3>Oportunidades que nacieron del evento</h3>
        <button class="btn-ghost ec-no-print" data-ec="op-nueva"${SIN_SQL3 ? " disabled" : ""}>＋ Sumar oportunidad</button></div>
      <p class="ec-card-sub">Lo que salió del evento aunque no sea una compra: otra muestra o charla, una obra, un cliente nuevo, una alianza… (ej. <i>BORE → Espacio UNNE</i>, <i>Lograso → IDEAR La Plata</i>).</p>
      ${ops.length ? ops.map(o => `<div class="ec-op ${o.estado === "Descartada" ? "desc" : ""}" data-op="${o.id}">
          <input class="ec-op-tit" data-op-campo="titulo" value="${esc(o.titulo)}" placeholder="¿Qué oportunidad? (ej. Participación en Espacio UNNE)" aria-label="Oportunidad">
          <div class="ec-campos">
            <label><span>Tipo</span><select data-op-campo="tipo"><option value="">—</option>${opt(OP_TIPOS, o.tipo)}</select></label>
            <label><span>Estado</span><select data-op-campo="estado">${opt(OP_ESTADOS, o.estado)}</select></label>
            <label><span>Fecha</span><input type="date" data-op-campo="fecha" value="${esc(o.fecha || "")}"></label>
            <label><span>Valor estimado (US$)</span><input type="number" min="0" step="1" data-op-campo="valor_usd" value="${num(o.valor_usd) == null ? "" : num(o.valor_usd)}" placeholder="opcional"></label>
            <label><span>Quién la lleva</span><input data-op-campo="responsable" value="${esc(o.responsable)}" placeholder="Nombre"></label>
          </div>
          <div class="ec-op-pie"><input data-op-campo="notas" value="${esc(o.notas)}" placeholder="Notas: cómo surgió, próximos pasos…" aria-label="Notas">
            <button class="ac-mini ec-no-print" data-ec="op-borrar" data-id="${o.id}" title="Borrar oportunidad" aria-label="Borrar oportunidad">✕</button></div>
        </div>`).join("")
      : `<p class="ec-ayuda">Todavía no hay oportunidades cargadas para este evento.</p>`}`;
  }
  async function opNueva() {
    const ev = eventoAbierto(); if (!ev || !ev.id) return;
    try {
      const r = await fetch(url("eventos_clientes_oport"), { method: "POST", headers: head({ Prefer: "return=representation" }),
        body: JSON.stringify({ evento_id: ev.id, estado: "Abierta", fecha: hoyISO(), autor_email: SES().email ? SES().email() : "" }) });
      const d = r.ok ? await r.json() : []; if (!d.length) throw new Error();
      (OPS[ev.id] = OPS[ev.id] || []).push(d[0]);
      pintarOps(); pintarAnalisis(); pintarFaltanEvento();
      const t = caja().querySelector(`[data-op="${d[0].id}"] .ec-op-tit`); if (t) t.focus();
    } catch (e) { nota("No se pudo sumar la oportunidad. ¿Corriste el SQL 2026-10-20-impacto-acciones.sql?", true); }
  }
  async function opGuardar(id, campos) {
    const ev = eventoAbierto(); const o = opsDe(ev).find(x => x.id === id); if (!o) return;
    const antes = {}; Object.keys(campos).forEach(k => { antes[k] = o[k]; });
    Object.assign(o, campos, { actualizado: new Date().toISOString() });
    try {
      const r = await fetch(url(`eventos_clientes_oport?id=eq.${enc(id)}`), { method: "PATCH", headers: head({ Prefer: "return=representation" }), body: JSON.stringify(campos) });
      const d = r.ok ? await r.json() : []; if (!d.length) throw new Error();
      if ("estado" in campos) { pintarOps(); }
      pintarAnalisis(); pintarFaltanEvento();
    } catch (e) { Object.assign(o, antes); nota("No se pudo guardar la oportunidad.", true); pintarOps(); }
  }
  async function opBorrar(id) {
    const ev = eventoAbierto(); const o = opsDe(ev).find(x => x.id === id); if (!o) return;
    if (o.titulo && !(await lkConfirmar(`¿Borrar la oportunidad "${o.titulo}"?`, { ok: "Borrar", peligro: true }))) return;
    try {
      const r = await fetch(url(`eventos_clientes_oport?id=eq.${enc(id)}`), { method: "DELETE", headers: head({ Prefer: "return=representation" }) });
      const d = r.ok ? await r.json() : []; if (!d.length) throw new Error();
      OPS[ev.id] = opsDe(ev).filter(x => x.id !== id);
      pintarOps(); pintarAnalisis(); pintarFaltanEvento();
    } catch (e) { nota("No se pudo borrar.", true); }
  }

  /* ---- Audiencia del evento: perfiles que fueron y los que buscamos ---- */
  function pintarAudiencia() {
    const w = caja().querySelector(".ec-aud"); if (!w) return;
    const ev = eventoAbierto(); if (!ev) return;
    const p = ev.perfiles || {}, obj = new Set(ev.perfiles_objetivo || []);
    const total = Object.values(p).reduce((s, x) => s + (Number(x) || 0), 0);
    const extras = Object.keys(p).filter(x => !PERFILES.some(y => y.p === x));
    const lista = [...PERFILES.map(x => x.p), ...extras];
    const enObj = lista.filter(x => obj.has(x)).reduce((s, x) => s + (Number(p[x]) || 0), 0);
    w.innerHTML = `<div class="ec-cli-top"><h3>Audiencia</h3>
        <button class="btn-ghost ec-no-print" data-ec="aud-importar"${SIN_SQL3 ? " disabled" : ""} title="Encuesta de Luz en Acción o lista de inscriptos (Excel o CSV)">⬆ Subir encuesta</button>
        <input type="file" class="ec-aud-file" accept=".csv,.xlsx,.xls,text/csv" hidden></div>
      <p class="ec-card-sub">Qué perfiles fueron y cuáles queremos convocar (★). Se guardan sólo las cantidades.${ev.perfiles_fuente ? ` Fuente: <b>${esc(ev.perfiles_fuente)}</b>.` : ""}</p>
      <table class="ec-tabla ec-chica ec-aud-t"><thead><tr><th>Perfil</th><th class="n">Fueron</th><th class="n">%</th><th class="c" title="Perfil que buscamos convocar">★ Buscado</th></tr></thead><tbody>
        ${lista.map(x => `<tr class="${obj.has(x) ? "obj" : ""}"><td>${esc(x)}</td>
          <td class="n"><input type="number" min="0" step="1" class="ec-personas" data-perfil="${esc(x)}" value="${p[x] == null ? "" : p[x]}" placeholder="0"${SIN_SQL3 ? " disabled" : ""} aria-label="${esc(x)}"></td>
          <td class="n">${total && p[x] ? pctN(p[x] / total) : ""}</td>
          <td class="c"><input type="checkbox" data-objetivo="${esc(x)}" ${obj.has(x) ? "checked" : ""}${SIN_SQL3 ? " disabled" : ""} aria-label="Buscamos ${esc(x)}"></td></tr>`).join("")}
      </tbody><tfoot><tr><td><b>Total</b></td><td class="n"><b>${total || "—"}</b></td><td></td><td class="c">${obj.size && total ? `<b>${pctN(enObj / total)}</b> buscado` : ""}</td></tr></tfoot></table>
      ${total && num(ev.prof_asistentes) != null && total !== num(ev.prof_asistentes) ? `<p class="ec-ayuda">Hay perfiles de <b>${total}</b> personas y <b>${num(ev.prof_asistentes)}</b> asistentes cargados (puede ser que no todos completaron la encuesta).</p>` : ""}`;
  }
  async function guardarPerfiles(perfiles, extra) {
    const ev = eventoAbierto(); if (!ev || !ev.id) return;
    const limpio = {}; Object.entries(perfiles).forEach(([k, v]) => { if (Number(v) > 0) limpio[k] = Math.round(Number(v)); });
    if (await guardar(Object.assign({ perfiles: limpio }, extra || {}))) { pintarAudiencia(); pintarFaltanEvento(); }
  }
  // Perfil de una respuesta libre ("Arquitecta", "Estudio de interiorismo", "Electricista matriculado"…).
  function perfilDe(txt) {
    const t = sinTildes(txt).trim(); if (!t) return null;
    // "Estudiante de arquitectura" es estudiante: ese perfil se mira primero.
    const orden = [...PERFILES.filter(x => x.p === "Estudiante"), ...PERFILES.filter(x => x.p !== "Estudiante")];
    const hit = orden.find(x => x.k.some(k => t.includes(sinTildes(k))));
    return hit ? hit.p : "Otro";
  }
  async function importarAudiencia(file) {
    const ev = eventoAbierto(); if (!file || !ev || !ev.id) return;
    try {
      if (!window.XLSX) throw new Error("No se pudo cargar el lector de Excel.");
      // Un CSV se decodifica acá (UTF-8 o, si no, Latin-1): XLSX lo leería como Latin-1 y rompería las tildes.
      const buf = await file.arrayBuffer();
      let wb;
      if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
        let t = new TextDecoder("utf-8").decode(buf); if (t.includes("\uFFFD")) t = new TextDecoder("windows-1252").decode(buf);
        wb = XLSX.read(t.replace(/^\uFEFF/, ""), { type: "string" });
      } else wb = XLSX.read(new Uint8Array(buf), { type: "array" });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: "" });
      if (!aoa || aoa.length < 2) throw new Error("El archivo no tiene respuestas.");
      const cab = aoa[0].map(h => sinTildes(h));
      const prioridad = ["profesion", "ocupacion", "a que te dedic", "dedicas", "perfil", "rubro", "actividad", "cargo", "rol", "puesto"];
      let col = -1; for (const p of prioridad) { col = cab.findIndex(h => h.includes(p)); if (col >= 0) break; }
      if (col < 0) throw new Error("No encontré una columna de profesión / perfil / ocupación en el archivo.");
      // Si la hoja acumula varios eventos y trae fecha, se toman sólo las respuestas cercanas al evento.
      const colF = cab.findIndex(h => /marca temporal|timestamp|fecha/.test(h));
      let filas = aoa.slice(1), filtro = "";
      if (colF >= 0 && ev.fecha) {
        const desde = sumarDias(ev.fecha, -45), hasta = sumarDias(ev.fecha, 15);
        const fechaDe = v => { if (typeof v === "number") { const d = new Date(Math.round((v - 25569) * 864e5)); return isoDe(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
          return fechaISO(String(v)); };
        const conF = filas.filter(f => fechaDe(f[colF]));
        if (conF.length) { filas = conF.filter(f => { const d = fechaDe(f[colF]); return d >= desde && d <= hasta; }); filtro = `\nSólo las respuestas del ${fechaLarga(desde)} al ${fechaLarga(hasta)} (la hoja trae fechas).`; }
      }
      const cnt = {};
      filas.forEach(f => { const p = perfilDe(String(f[col] || "")); if (p) cnt[p] = (cnt[p] || 0) + 1; });
      const total = Object.values(cnt).reduce((s, x) => s + x, 0);
      if (!total) throw new Error("No hay respuestas con perfil en esas fechas.");
      const resumen = Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p}: ${n}`).join("\n");
      if (!(await lkConfirmar(`${file.name}\n\nColumna "${aoa[0][col]}" · ${total} respuestas${filtro}\n\n${resumen}\n\nSe reemplazan los perfiles cargados del evento. Los nombres y mails no se guardan.`, { ok: "Guardar perfiles" }))) return;
      await guardarPerfiles(cnt, { perfiles_fuente: `${file.name} (${total} respuestas)` });
      nota("Perfiles cargados.");
    } catch (e) { nota(e && e.message ? e.message : "No se pudo leer el archivo.", true); }
  }

  function pintarFaltanEvento() {
    const w = caja().querySelector(".ec-faltan-ev"); if (!w) return;
    const ev = eventoAbierto(); if (!ev) return;
    const f = faltantesEvento(ev, calcular(ev, VENTANA));
    w.classList.toggle("hidden", !f.length);
    // Cada ítem es un acceso directo: lleva al campo y lo marca (el reporte de ventas abre el archivo).
    w.innerHTML = f.length ? `<h3>Qué falta para evaluarlo</h3><ul class="ec-faltan-lista ec-faltan-ir">${f.map(x => `<li><button type="button" data-ec="ir-falta" data-ir="${esc(x.ir)}"${x.ir ? "" : " disabled"}>
      <b>${esc(x.que)}</b> <span>para ${esc(x.para)}</span><i aria-hidden="true">${x.ir === "ventas" ? "Subir ↑" : "Completar →"}</i></button></li>`).join("")}</ul>
      ${f.some(x => x.ir === "ventas") ? `<input type="file" class="ec-csv" accept=".csv,text/csv" hidden>` : ""}` : "";
  }
  // Lleva a un campo del evento y lo bordea un momento para que se vea qué completar.
  function irAFalta(sel) {
    if (sel === "ventas") return ACC.importar();
    caja().querySelectorAll(".ec-resaltado").forEach(m => m.classList.remove("ec-resaltado"));
    const els = [...caja().querySelectorAll(sel)]; if (!els.length) return;
    const marcos = els.map(el => el.closest("label, td, .ec-op") || el);
    marcos[0].scrollIntoView({ behavior: "smooth", block: "center" });
    marcos.forEach(m => { m.classList.remove("ec-resaltado"); void m.offsetWidth; m.classList.add("ec-resaltado"); });
    const sacar = () => marcos.forEach(m => m.classList.remove("ec-resaltado"));   // se va al completarlo o a los 5 s
    setTimeout(sacar, 5000); marcos.forEach(m => m.addEventListener("input", sacar, { once: true }));
    const foco = els[0].matches("input, select, textarea") ? els[0] : els[0].querySelector("input, select, textarea, button");
    if (foco && !foco.disabled) setTimeout(() => foco.focus({ preventScroll: true }), 350);
  }

  /* ---- Sumar distribuidores (evento) o clientes que recibieron el material (campaña) ---- */
  const campanaAbierta = () => CAMP === "nueva" ? BORRADOR_C : CAMPS.find(x => x.id === CAMP);
  const yaElegidos = () => CAMP ? new Set(((campanaAbierta() || {}).destinatarios || []).map(x => x.cuit))
                                : new Set((INV[(eventoAbierto() || {}).id] || []).map(x => x.cuit));
  function sugerencias() {
    const q = sinTildes(BUSCA_CLI.trim()); if (q.length < 2) return [];
    const ya = yaElegidos();
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
    if (CAMP) {
      const c = campanaAbierta(); if (!c || !filas.length) return;
      BUSCA_CLI = "";
      if (await guardarCampana({ destinatarios: [...(c.destinatarios || []), ...filas] })) pintarCampana();
      return;
    }
    const ev = eventoAbierto(); if (!ev || !filas.length) return;
    try {
      const r = await fetch(url("eventos_clientes_inv"), { method: "POST", headers: head({ Prefer: "return=representation" }),
        body: JSON.stringify(filas.map(f => Object.assign({ evento_id: ev.id, inscripto: true, asistio: true }, f))) });
      const d = r.ok ? await r.json() : [];
      if (!d.length) throw new Error();
      (INV[ev.id] = INV[ev.id] || []).push(...d);
      BUSCA_CLI = "";
      pintarDistribuidores(); pintarAnalisis(); pintarFaltanEvento();
      asegurarDatos(ev);
    } catch (e) { nota("No se pudo sumar el distribuidor. ¿Ya estaba en el evento?", true); }
  }
  async function quitar(id) {
    if (CAMP) {
      const c = campanaAbierta(); if (!c) return;
      if (await guardarCampana({ destinatarios: (c.destinatarios || []).filter(x => x.cuit !== id) })) pintarCampana();
      return;
    }
    const ev = eventoAbierto(); const l = INV[ev.id] || []; if (!l.some(y => y.id === id)) return;
    try {
      const r = await fetch(url(`eventos_clientes_inv?id=eq.${enc(id)}`), { method: "DELETE", headers: head({ Prefer: "return=representation" }) });
      const d = r.ok ? await r.json() : []; if (!d.length) throw new Error();
      INV[ev.id] = l.filter(y => y.id !== id);
      pintarDistribuidores(); pintarAnalisis(); pintarFaltanEvento(); asegurarDatos(ev);
    } catch (e) { nota("No se pudo quitar.", true); }
  }
  async function guardarInv(id, campos) {
    const ev = eventoAbierto(); const x = (INV[ev.id] || []).find(y => y.id === id); if (!x) return;
    const antes = {}; Object.keys(campos).forEach(k => { antes[k] = x[k]; });
    Object.assign(x, campos);
    try {
      const r = await fetch(url(`eventos_clientes_inv?id=eq.${enc(id)}`), { method: "PATCH", headers: head({ Prefer: "return=representation" }), body: JSON.stringify(campos) });
      const d = r.ok ? await r.json() : []; if (!d.length) throw new Error();
      pintarFaltanEvento();
    } catch (e) { Object.assign(x, antes); nota("No se pudo guardar. ¿Corriste el SQL 2026-10-20-impacto-acciones.sql?", true); pintarDistribuidores(); }
  }

  /* ---- Evento: crear / guardar / borrar ---- */
  function nuevo(desde) {
    BORRADOR = Object.assign({ id: null, titulo: "", fecha: hoyISO(), lugar: "", formato: "", accion_id: null, inversion_usd: null, notas: "",
                               prof_inscriptos: null, prof_asistentes: null }, SIN_SQL3 ? {} : { disertante: "", inversion_ars: null }, desde || {});
    INV_MON.nuevo = null;
    ABIERTO = "nuevo"; CAMP = null; OTRO_DIS = false; pintar();
    const t = caja().querySelector(".ec-titulo"); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
  }
  // Pasar una acción (de Acciones) a un evento para medirlo: trae nombre, fecha y la vincula (la inversión sale de ahí).
  function nuevoDesdeAccion(a) {
    nuevo({ titulo: a.titulo || "", fecha: a.fecha_inicio || hoyISO(), accion_id: a.id,
            formato: a.tipo === "Workshop / Capacitación" ? "Capacitación" : "" });
    if (a.distribuidor) BUSCA_CLI = a.distribuidor;
    if (necesitaTC(BORRADOR)) tcCerca(BORRADOR.fecha).then(() => { if (ABIERTO === "nuevo") pintarAyudaInv(); });
  }
  async function crear() {
    const b = BORRADOR; if (!b) return;
    const t = caja().querySelector(".ec-titulo"); if (t) b.titulo = t.value.trim();
    if (!b.titulo) { nota("Poné un nombre para crear el evento.", true); if (t) t.focus(); return; }
    if (!SIN_SQL3 && !(b.disertante || "").trim()) {
      nota(OTRO_DIS ? "Escribí quién dio la charla." : "Elegí quién dio la charla.", true);
      const f = caja().querySelector(OTRO_DIS ? ".ec-dis-otro" : '[data-campo="disertante_sel"]'); if (f) f.focus(); return;
    }
    const cuerpo = Object.assign({}, b, { autor: SES().nombre ? SES().nombre() : "", autor_email: SES().email ? SES().email() : "" });
    delete cuerpo.id;
    const busca = BUSCA_CLI;
    try {
      const r = await fetch(url("eventos_clientes"), { method: "POST", headers: head({ Prefer: "return=representation" }), body: JSON.stringify(cuerpo) });
      const d = r.ok ? await r.json() : []; if (!d.length) throw new Error();
      EVS.unshift(d[0]); INV[d[0].id] = []; OPS[d[0].id] = [];
      INV_MON[d[0].id] = INV_MON.nuevo; INV_MON.nuevo = null;
      BORRADOR = null; ABIERTO = d[0].id; BUSCA_CLI = busca;
      nota("Evento creado. Ahora elegí el distribuidor.");
      pintar();
      const s = caja().querySelector(".ec-busca-cli"); if (s) { s.focus(); pintarSugerencias(); }
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
      const ks = Object.keys(campos).join();
      nota(/prof_/.test(ks) ? "No se pudo guardar. ¿Corriste el SQL 2026-10-15-eventos-clientes-profesionales.sql?"
        : /disertante|inversion_ars|perfiles/.test(ks) ? "No se pudo guardar. ¿Corriste el SQL 2026-10-20-impacto-acciones.sql?" : "No se pudo guardar el cambio.", true);
      pintarDetalle(); return false;
    }
  }
  async function borrar() {
    const ev = eventoAbierto(); if (!ev) return;
    if (!(await lkConfirmar(`¿Eliminar el evento "${ev.titulo}"?\n\nLas ventas no se tocan. Se borran sus oportunidades. No se puede deshacer.`, { ok: "Eliminar", peligro: true }))) return;
    try {
      const r = await fetch(url(`eventos_clientes?id=eq.${enc(ev.id)}`), { method: "DELETE", headers: head({ Prefer: "return=representation" }) });
      const d = r.ok ? await r.json() : []; if (!d.length) throw new Error();
      EVS = EVS.filter(e => e.id !== ev.id); delete INV[ev.id]; delete OPS[ev.id];
      ABIERTO = null; nota("Evento eliminado."); pintar();
    } catch (e) { nota("No se pudo eliminar. Sólo puede hacerlo quien lo creó o un admin.", true); }
  }
  function abrir(id) { ABIERTO = id; CAMP = null; OTRO_DIS = false; BUSCA_CLI = ""; pintar(); window.scrollTo({ top: 0 }); }
  async function volver() {
    if (ABIERTO === "nuevo") { const t = caja().querySelector(".ec-titulo"); if (t && t.value.trim() && !(await lkConfirmar("¿Descartar el evento que estabas creando?", { ok: "Descartar" }))) return; }
    if (CAMP === "nueva") { const t = caja().querySelector(".ec-titulo"); if (t && t.value.trim() && !(await lkConfirmar("¿Descartar la campaña que estabas creando?", { ok: "Descartar" }))) return; }
    ABIERTO = null; BORRADOR = null; CAMP = null; BORRADOR_C = null; BUSCA_CLI = ""; OTRO_DIS = false;
    pintar(); refrescarTablero();
  }
  // El tablero necesita las ventas de todos los distribuidores, el TC y el "resto de clientes" de
  // cada evento (de todos los períodos: la pestaña Comparar los usa).
  async function refrescarTablero() {
    const faltaVentas = todosLosCuits().some(c => !VENTAS.has(c));
    const evs = EVS;
    const faltaBase = evs.some(e => { const k = calcular(e, VENTANA); return k.antes && !k.base; });
    const faltaTC = evs.some(e => necesitaTC(e) && !(e.fecha in TCS)) || CAMPS.some(c => necesitaTC(vistaInvCamp(c)) && !(vistaInvCamp(c).fecha in TCS));
    const faltaCamp = TAB === "campanas" && CAMPS.some(c => estadoCampana(c) === "medible" && !MED_CAMP[claveCamp(c)]);
    if (!faltaVentas && !faltaBase && !faltaTC && !faltaCamp) return;
    nota("Calculando las compras de cada evento…", false, true);
    try {
      await cargarVentas(todosLosCuits());
      await Promise.all([...evs.filter(necesitaTC).map(e => tcCerca(e.fecha)), ...CAMPS.map(vistaInvCamp).filter(necesitaTC).map(v => tcCerca(v.fecha))]);
      await Promise.all(evs.map(e => traerBase(e, calcular(e, VENTANA))));
      if (TAB === "campanas") await Promise.all(CAMPS.map(medirCampana));
    } catch (e) { return nota("No se pudieron traer las ventas.", true); }
    nota("");
    if (!ABIERTO && !CAMP) pintarTablero();
  }

  /* ======================= CAMPAÑAS DE PRODUCTO ======================= */
  // Antes de medir hay que confirmar que el material llegó a Comercial y se distribuyó (lo sigue Dai).
  const PASOS_CAMP = [
    { k: "listo_fecha", t: "Material listo", sub: "Producido / recibido de proveedor" },
    { k: "comercial_fecha", t: "Llegó a Comercial", sub: "Quién lo recibió" },
    { k: "distribuido_fecha", t: "Comercial lo distribuyó", sub: "A los clientes / vendedores. Desde esta fecha se mide" },
  ];
  function estadoCampana(c) {
    if (!c.listo_fecha) return "material";
    if (!c.comercial_fecha) return "comercial";
    if (!c.distribuido_fecha) return "distribucion";
    if (!c.familia) return "familia";
    return "medible";
  }
  const ESTADOS_CAMP = { material: "Falta el material", comercial: "Falta confirmar que llegó a Comercial", distribucion: "Falta confirmar la distribución",
                         familia: "Falta elegir la familia para medir", medible: "Distribución confirmada" };
  const vistaInvCamp = c => ({ fecha: c.distribuido_fecha || c.comercial_fecha || c.listo_fecha, inversion_usd: c.inversion_usd, inversion_ars: c.inversion_ars });
  const claveCamp = c => `${c.id}|${c.familia}|${c.distribuido_fecha}|${VENTANA}|${(c.destinatarios || []).map(x => x.cuit).join(",")}|${RANGO && RANGO.hasta}`;
  // Compras de la familia antes y después de la distribución, contra cómo se movieron las ventas totales.
  // Si se cargaron los clientes que recibieron el material, también ellos contra el resto.
  async function medirCampana(c) {
    if (estadoCampana(c) !== "medible" || !RANGO) return;
    const key = claveCamp(c); if (MED_CAMP[key]) return;
    const f0 = c.distribuido_fecha, dias = Math.min(VENTANA, difDias(f0, RANGO.hasta) + 1);
    if (dias <= 0) { MED_CAMP[key] = { dias: 0 }; return; }
    const antes = [sumarDias(f0, -dias), sumarDias(f0, -1)], despues = [f0, sumarDias(f0, dias - 1)];
    const cuits = (c.destinatarios || []).map(x => x.cuit).filter(Boolean);
    const q = (r, cs) => rpc("ventas_familia", { p_desde: r[0], p_hasta: r[1], p_familia: c.familia, p_cuits: cs || null }).then(x => ({ fam: Number(x[0].fam_usd) || 0, total: Number(x[0].total_usd) || 0, clientes: x[0].clientes || 0 }));
    try {
      const [ta, td, da, dd] = await Promise.all([q(antes), q(despues), cuits.length ? q(antes, cuits) : null, cuits.length ? q(despues, cuits) : null]);
      const crecTot = ta.total > 0 ? (td.total - ta.total) / ta.total : null;
      const m = { dias, antes, despues, ta, td, crecFam: ta.fam > 0 ? (td.fam - ta.fam) / ta.fam : null, crecTot,
                  esperado: crecTot != null ? ta.fam * (1 + crecTot) : ta.fam };
      m.extra = td.fam - m.esperado;
      if (da) {
        const ra = { fam: ta.fam - da.fam }, rd = { fam: td.fam - dd.fam };
        Object.assign(m, { da, dd, crecDest: da.fam > 0 ? (dd.fam - da.fam) / da.fam : null, crecResto: ra.fam > 0 ? (rd.fam - ra.fam) / ra.fam : null });
      }
      MED_CAMP[key] = m;
    } catch (e) { MED_CAMP[key] = { error: true }; }
  }
  function pintarCampanas(w) {
    const lista = CAMPS.filter(c => !PERIODO || periodoDe(c.distribuido_fecha || c.listo_fecha || c.creado) === PERIODO);
    const n = k => lista.filter(c => estadoCampana(c) === k).length;
    w.innerHTML = encabezado("Campañas de producto (exhibiciones, unboxings…): primero confirmar que el material llegó, después medir",
      `<button class="btn-primary" data-ec="camp-nueva"${SIN_SQL3 ? " disabled" : ""}>＋ Nueva campaña</button>`,
      lista.length ? `<div class="mh-kpis">
        ${kpi(lista.length, lista.length === 1 ? "campaña" : "campañas", PERIODO ? periodoNombre(PERIODO) : "en total")}
        ${kpi(n("medible") + n("familia"), "con distribución confirmada", "llegó a Comercial y se distribuyó", n("medible") + n("familia") ? "ok" : "")}
        ${kpi(n("material") + n("comercial") + n("distribucion"), "sin confirmar", "todavía no se puede medir", n("material") + n("comercial") + n("distribucion") ? "no" : "")}
      </div>` : "") + `
      <div class="mh-bar ec-bar ec-no-print">${filtroPeriodo()}${ventanaChips()}<span class="ec-nota" role="status"></span></div>
      ${avisoSQL3()}
      <div class="res-intro">Antes de medir el resultado de una campaña hay que confirmar que los materiales <b>se distribuyeron y llegaron a Comercial</b> (lo coordina Dai).
        Cuando están los tres pasos, se comparan las compras de la <b>familia</b> de producto antes y después de la distribución, contra cómo se movieron las ventas totales.</div>
      ${lista.length ? `<section class="ec-card ec-tabla-card"><h3>Campañas</h3><div class="ec-tabla-wrap"><table class="ec-tabla">
        <thead><tr><th>Campaña</th><th>Producto / familia</th><th>Distribución</th><th class="n">Inversión</th><th class="n">Compras extra de la familia</th><th>Estado</th></tr></thead>
        <tbody>${lista.map(c => { const e = estadoCampana(c), m = MED_CAMP[claveCamp(c)], inv = inversion(vistaInvCamp(c));
          return `<tr data-camp="${c.id}" tabindex="0"><td><b>${esc(c.titulo) || "<i>Sin nombre</i>"}</b><small>${esc(c.tipo)}</small></td>
            <td>${esc(c.producto) || "—"}${c.familia ? `<small>${esc(c.familia)}</small>` : ""}</td>
            <td><span class="ec-pasos">${PASOS_CAMP.map(p => `<i class="${c[p.k] ? "ok" : ""}" title="${esc(p.t)}${c[p.k] ? ": " + fechaLarga(c[p.k]) : ""}"></i>`).join("")}</span></td>
            <td class="n">${inv.usd != null ? usd(inv.usd) : "—"}</td>
            <td class="n ${m && m.dias ? tono(m.extra) : ""}">${m && m.dias ? signo(m.extra) : m && m.dias === 0 ? "esperando ventas" : e === "medible" ? "…" : "—"}</td>
            <td><span class="ec-ver ${e === "medible" ? "ok" : ""}">${esc(ESTADOS_CAMP[e])}</span></td></tr>`; }).join("")}</tbody></table></div></section>`
      : `<div class="res-intro">Todavía no hay campañas${PERIODO ? ` en ${periodoNombre(PERIODO)}` : ""}. Creá una con <b>＋ Nueva campaña</b> (por ejemplo, la exhibición de Chill o los unboxings).</div>`}`;
    pintarNota();
    if (RANGO && lista.some(c => estadoCampana(c) === "medible" && !MED_CAMP[claveCamp(c)])) refrescarTablero();
  }
  function nuevaCampana() {
    BORRADOR_C = { id: null, titulo: "", tipo: "", producto: "", familia: "", inversion_usd: null, inversion_ars: null, materiales: "", responsable: "Dai",
                   listo_fecha: null, comercial_fecha: null, comercial_recibio: "", distribuido_fecha: null, destinatarios: [], notas: "" };
    INV_MON.nueva = null;
    CAMP = "nueva"; ABIERTO = null; pintar();
    const t = caja().querySelector(".ec-titulo"); if (t) t.focus();
  }
  function abrirCampana(id) { CAMP = id; ABIERTO = null; BUSCA_CLI = ""; pintar(); window.scrollTo({ top: 0 }); }
  async function crearCampana() {
    const b = BORRADOR_C; if (!b) return;
    const t = caja().querySelector(".ec-titulo"); if (t) b.titulo = t.value.trim();
    if (!b.titulo) { nota("Poné un nombre para crear la campaña.", true); if (t) t.focus(); return; }
    const cuerpo = Object.assign({}, b, { autor: SES().nombre ? SES().nombre() : "", autor_email: SES().email ? SES().email() : "" });
    delete cuerpo.id;
    try {
      const r = await fetch(url("mkt_campanas"), { method: "POST", headers: head({ Prefer: "return=representation" }), body: JSON.stringify(cuerpo) });
      const d = r.ok ? await r.json() : []; if (!d.length) throw new Error();
      CAMPS.unshift(d[0]); INV_MON[d[0].id] = INV_MON.nueva;
      BORRADOR_C = null; CAMP = d[0].id;
      nota("Campaña creada."); pintar();
    } catch (e) { nota("No se pudo crear la campaña. ¿Corriste el SQL 2026-10-20-impacto-acciones.sql?", true); }
  }
  async function guardarCampana(campos) {
    if (CAMP === "nueva") { Object.assign(BORRADOR_C, campos); return true; }
    const c = campanaAbierta(); if (!c) return false;
    const antes = {}; Object.keys(campos).forEach(k => { antes[k] = c[k]; });
    Object.assign(c, campos);
    try {
      const r = await fetch(url(`mkt_campanas?id=eq.${enc(c.id)}`), { method: "PATCH", headers: head({ Prefer: "return=representation" }), body: JSON.stringify(campos) });
      const d = r.ok ? await r.json() : []; if (!d.length) throw new Error();
      return true;
    } catch (e) { Object.assign(c, antes); nota("No se pudo guardar el cambio.", true); pintarCampana(); return false; }
  }
  async function borrarCampana() {
    const c = campanaAbierta(); if (!c || !c.id) return;
    if (!(await lkConfirmar(`¿Eliminar la campaña "${c.titulo}"?\n\nNo se puede deshacer.`, { ok: "Eliminar", peligro: true }))) return;
    try {
      const r = await fetch(url(`mkt_campanas?id=eq.${enc(c.id)}`), { method: "DELETE", headers: head({ Prefer: "return=representation" }) });
      const d = r.ok ? await r.json() : []; if (!d.length) throw new Error();
      CAMPS = CAMPS.filter(x => x.id !== c.id); CAMP = null; nota("Campaña eliminada."); pintar();
    } catch (e) { nota("No se pudo eliminar. Sólo puede hacerlo quien la creó o un admin.", true); }
  }
  function pintarCampana() {
    const w = caja().querySelector(".ec-detalle"); if (!w) return;
    const c = campanaAbierta(); if (!c) return pintar();
    const nueva = CAMP === "nueva", e = estadoCampana(c), key = c.id || "nueva";
    const puedeBorrar = !nueva && (esAdmin() || low(c.autor_email) === yo());
    const tipos = [...new Set([...CAMP_TIPOS, c.tipo].filter(Boolean))];
    const fams = FAMILIAS || [];
    const inv = inversion(vistaInvCamp(c));
    const dest = c.destinatarios || [];
    w.innerHTML = `
      <div class="ec-d-top ec-no-print">
        <button class="btn-ghost" data-ec="volver">← Campañas de producto</button>
        <span class="ec-nota" role="status"></span>
        ${puedeBorrar ? `<button class="btn-ghost ec-borrar" data-ec="camp-borrar">Eliminar</button>` : ""}
      </div>
      <section class="ec-card ec-datos">
        <input class="ec-titulo" data-c-campo="titulo" placeholder="Nombre de la campaña (ej. Exhibición Chill)" value="${esc(c.titulo)}" aria-label="Nombre de la campaña">
        <div class="ec-campos">
          <label><span>Tipo</span><select data-c-campo="tipo"><option value="">—</option>${tipos.map(t => `<option ${c.tipo === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
          <label><span>Producto</span><input data-c-campo="producto" value="${esc(c.producto)}" placeholder="Chill"></label>
          <label class="ancho"><span>Familia con la que se mide (del reporte de ventas)</span>${fams.length
            ? `<select data-c-campo="familia"><option value="">Elegir familia…</option>${[...new Set([c.familia, ...fams.map(f => f.familia)].filter(Boolean))].map(f => `<option ${c.familia === f ? "selected" : ""}>${esc(f)}</option>`).join("")}</select>`
            : `<input data-c-campo="familia" value="${esc(c.familia)}" placeholder="${RANGO ? "Cargando familias…" : "Subí las ventas para elegir"}">`}</label>
          ${campoInversion(key, c)}
          <label><span>Quién confirma la distribución</span><input data-c-campo="responsable" value="${esc(c.responsable)}" placeholder="Dai"></label>
        </div>
        ${inv.origen && inv.origen !== "cargada" ? `<p class="ec-ayuda">Inversión ${esc(inv.origen)}${inv.usd != null ? `: <b>${usd(inv.usd)}</b>` : ""}.</p>` : ""}
        <textarea data-c-campo="materiales" rows="2" placeholder="Materiales: qué se produjo y cuántos (exhibidores, cajas de unboxing, folletos…)">${esc(c.materiales)}</textarea>
        ${nueva ? `<div class="ec-crear"><button class="btn-primary" data-ec="camp-crear">Crear campaña</button></div>` : ""}
      </section>
      ${nueva ? "" : `
      <section class="ec-card ec-checklist">
        <h3>¿Llegó el material?</h3>
        <p class="ec-card-sub">Hay que confirmar los tres pasos antes de medir. ${esc(c.responsable || "Dai")} lo confirma con Comercial.</p>
        <ol class="ec-pasos-lista">${PASOS_CAMP.map((p, i) => `<li class="${c[p.k] ? "ok" : ""}">
          <span class="ec-paso-n">${c[p.k] ? "✓" : i + 1}</span>
          <div><b>${p.t}</b><small>${p.sub}</small>
            <div class="ec-paso-campos"><input type="date" data-c-campo="${p.k}" value="${esc(c[p.k] || "")}" aria-label="${esc(p.t)}">
            ${p.k === "comercial_fecha" ? `<input data-c-campo="comercial_recibio" value="${esc(c.comercial_recibio)}" placeholder="¿Quién lo recibió?">` : ""}</div></div></li>`).join("")}
        </ol>
        <div class="ec-cli-top"><h3>Clientes que lo recibieron <small class="ec-ayuda">(opcional)</small></h3>
          <div class="ec-agregar ec-no-print">
            <input type="search" class="ec-busca-cli" placeholder="Sumar cliente: nombre, razón social o CUIT" autocomplete="off" value="${esc(BUSCA_CLI)}" aria-label="Buscar cliente">
            <div class="ec-sug" role="listbox"></div>
          </div></div>
        ${dest.length ? `<div class="ec-dest">${dest.map(x => `<span class="ec-op-chip">${esc(x.nombre || x.razon_social || x.cuit)}<button class="ac-mini ec-no-print" data-ec="quitar" data-id="${esc(x.cuit)}" aria-label="Quitar">✕</button></span>`).join("")}</div>`
          : `<p class="ec-ayuda">Si se cargan, también se comparan las compras de esos clientes contra el resto.</p>`}
      </section>
      <section class="ec-card ec-camp-med"></section>
      <textarea class="ec-notas-camp" data-c-campo="notas" rows="2" placeholder="Notas">${esc(c.notas)}</textarea>`}`;
    pintarNota();
    if (!nueva) pintarMedicionCampana();
    if (!FAMILIAS && RANGO) familias().then(() => { if (CAMP === key || (CAMP === "nueva" && key === "nueva")) pintarCampana(); });
    if (!nueva) {
      const v = vistaInvCamp(c);
      if (necesitaTC(v) && !(v.fecha in TCS)) tcCerca(v.fecha).then(() => { if (CAMP === c.id) pintarCampana(); });
    }
  }
  async function pintarMedicionCampana() {
    const w = caja().querySelector(".ec-camp-med"); if (!w) return;
    const c = campanaAbierta(); if (!c) return;
    const e = estadoCampana(c);
    if (e !== "medible") {
      w.innerHTML = `<h3>Resultado</h3><section class="ec-veredicto"><b>Todavía no se mide</b><p>${esc(ESTADOS_CAMP[e])}.
        ${e === "familia" ? "Elegí arriba la familia del reporte de ventas que corresponde al producto. Si el producto no tiene una familia propia en el reporte, hace falta el reporte de ventas por artículo (Comercial)." : "Cuando estén confirmados los tres pasos, se comparan las compras de la familia antes y después de la distribución."}</p></section>`;
      return;
    }
    if (!RANGO) { w.innerHTML = `<h3>Resultado</h3><section class="ec-veredicto"><b>Faltan las ventas</b><p>Subí el reporte de ventas (⋯ Más → Actualizar ventas).</p></section>`; return; }
    const key = claveCamp(c);
    if (!MED_CAMP[key]) { w.innerHTML = `<h3>Resultado</h3><p class="ec-ayuda">Calculando…</p>`; await medirCampana(c); if (campanaAbierta() !== c) return; }
    const m = MED_CAMP[key];
    if (m.error) { w.innerHTML = `<h3>Resultado</h3><p class="ec-ayuda ec-falta">No se pudieron traer las ventas de la familia. ¿Corriste el SQL 2026-10-20-impacto-acciones.sql?</p>`; return; }
    if (!m.dias) { w.innerHTML = `<h3>Resultado</h3><section class="ec-veredicto"><b>Esperando ventas</b><p>Se distribuyó el ${fechaLarga(c.distribuido_fecha)} y las ventas cargadas llegan hasta el ${fechaLarga(RANGO.hasta)}.</p></section>`; return; }
    const inv = inversion(vistaInvCamp(c)), r = inv.usd ? Math.max(0, m.extra) / inv.usd : null;
    const ver = m.extra > 0 && (r == null || r >= 1) ? ["ok", "Movió las compras de la familia"] : m.extra > 0 ? ["warn", "Movió las compras, pero no cubrió la inversión"] : ["no", "No se ve efecto en las compras de la familia"];
    w.innerHTML = `<div class="ec-cli-top"><h3>Resultado</h3>${ventanaChips()}</div>
      <section class="ec-veredicto ${ver[0]}"><b>${ver[1]}</b>${m.dias < VENTANA ? ` <span class="ec-estado provisorio">Provisorio</span>` : ""}
        <p>En los ${m.dias} días desde la distribución se compraron <b>${usd(m.td.fam)}</b> de ${esc(c.familia)} (antes: ${usd(m.ta.fam)}, ${pct(m.crecFam)}).
        Las ventas totales ${m.crecTot >= 0 ? "crecieron" : "bajaron"} ${pct(m.crecTot).replace(/^[+−]/, "")}, así que esperábamos unos <b>${usd(m.esperado)}</b>:
        <b>${usd(Math.abs(m.extra))} ${m.extra >= 0 ? "más" : "menos"}</b> de lo esperado.${r != null ? ` ROAS <b>${roas(r)}</b>.` : ""}
        ${m.da ? ` Los clientes que recibieron el material: ${pct(m.crecDest)} en la familia; el resto: ${pct(m.crecResto)}.` : ""}</p></section>
      <div class="mh-kpis">
        ${kpi(usd(m.td.fam), `compras de ${esc(c.familia)}`, `${m.td.clientes} clientes · antes ${usd(m.ta.fam)}`)}
        ${kpi(signo(m.extra), "compras extra", `esperado ${usd(m.esperado)}`, tono(m.extra))}
        ${kpi(pct(m.crecFam), "crecimiento de la familia", `ventas totales: ${pct(m.crecTot)}`, tono(m.crecFam != null && m.crecTot != null ? m.crecFam - m.crecTot : null))}
        ${kpi(r != null ? roas(r) : "—", "ROAS", inv.usd ? `compras extra ÷ ${usd(inv.usd)}` : "cargá la inversión", r != null ? (r >= 1 ? "ok" : "no") : "")}
      </div>`;
  }

  /* ======================= DATOS QUE FALTAN ======================= */
  // Acciones del período anterior que la usuaria pidió recuperar (desaparecen de la lista cuando se cargan).
  const RECUPERAR = ["Líneas Eléctricas", "Ituarte 2025", "Radio Electrón"];
  const TIPOS_ACC_EVENTO = ["Evento", "Workshop / Capacitación", "Activación"];
  function todosLosFaltantes() {
    const out = [];
    EVS.forEach(ev => faltantesEvento(ev, calcular(ev, VENTANA)).forEach(f => out.push(Object.assign({ donde: ev.titulo || "Evento sin nombre", ev: ev.id, fecha: ev.fecha }, f))));
    CAMPS.forEach(c => {
      const e = estadoCampana(c), add = (que, quien, para, persona) => out.push({ donde: c.titulo || "Campaña sin nombre", camp: c.id, fecha: c.listo_fecha, que, quien, para, persona: persona || "" });
      if (e === "material") add("Confirmar que el material está listo", "dai", "poder medir la campaña", c.responsable);
      if (e === "comercial") add("Confirmar que el material llegó a Comercial (y quién lo recibió)", "dai", "poder medir la campaña", c.responsable);
      if (e === "distribucion") add("Confirmar que Comercial distribuyó el material (y a qué clientes)", "dai", "poder medir la campaña", c.responsable);
      if (e === "familia") add(`Familia del reporte de ventas que corresponde a ${c.producto || "el producto"} (o ventas por artículo)`, "com", "medir las compras del producto");
      const inv = inversion(vistaInvCamp(c)); if (inv.usd == null) add("Inversión de la campaña", "mkt", "calcular el ROAS");
    });
    const sin = sinTildes;
    RECUPERAR.filter(n => !EVS.some(e => sin(`${e.titulo} ${(INV[e.id] || []).map(x => x.nombre + " " + x.razon_social).join(" ")}`).includes(sin(n).replace(/ \d{4}$/, ""))))
      .forEach(n => out.push({ donde: n, recuperar: n, que: "Cargar el evento (período anterior)", quien: "mkt", para: "comparar con el año anterior" }));
    return out;
  }
  const accionesSinPasar = () => ACCS.filter(a => TIPOS_ACC_EVENTO.includes(a.tipo) && !EVS.some(e => e.accion_id === a.id));
  function pintarFaltan(w) {
    const f = todosLosFaltantes(), accs = accionesSinPasar();
    const grupos = Object.keys(QUIEN).map(q => ({ q, items: f.filter(x => x.quien === q) })).filter(g => g.items.length);
    const quienDe = x => x.quien === "resp" ? (x.persona || QUIEN.resp) : QUIEN[x.quien] + (x.persona && x.quien === "dai" && x.persona !== "Dai" ? ` · ${x.persona}` : "");
    w.innerHTML = encabezado("Qué datos faltan para evaluar cada acción, y quién los tiene que pasar",
      `<button class="btn-ghost" data-ec="excel" title="Descargar la lista en Excel">⬇ Excel</button>`,
      `<div class="mh-kpis">${grupos.map(g => kpi(g.items.length, QUIEN[g.q], g.q === "resp" ? "oportunidades sin novedades" : "datos pendientes")).join("") || kpi("0", "datos pendientes", "todo cargado", "ok")}
        ${accs.length ? kpi(accs.length, "acciones sin pasar", "eventos de Acciones que no están acá") : ""}</div>`) + `
      <div class="mh-bar ec-bar ec-no-print"><span class="ec-nota" role="status"></span></div>
      ${avisoSQL3()}
      <p class="ec-ayuda">Los responsables son sugeridos según el tipo de dato. Descargá el Excel para pasarle a cada uno su parte.</p>
      ${grupos.map(g => `<section class="ec-card ec-tabla-card"><h3>${esc(QUIEN[g.q])}</h3>
        <div class="ec-tabla-wrap"><table class="ec-tabla"><thead><tr><th>Acción</th><th>Qué falta</th><th>Para qué</th>${g.q === "resp" || g.q === "dai" ? "<th>Quién</th>" : ""}<th class="ec-no-print"></th></tr></thead>
        <tbody>${g.items.map(x => `<tr${x.ev ? ` data-abrir="${x.ev}" tabindex="0"` : x.camp ? ` data-camp="${x.camp}" tabindex="0"` : ""}>
          <td><b>${esc(x.donde)}</b>${x.fecha ? `<small>${fechaLarga(x.fecha)}</small>` : ""}</td><td>${esc(x.que)}</td><td>${esc(x.para)}</td>
          ${g.q === "resp" || g.q === "dai" ? `<td>${esc(quienDe(x))}</td>` : ""}
          <td class="ec-no-print">${x.recuperar ? `<button class="btn-ghost" data-ec="recuperar" data-n="${esc(x.recuperar)}">＋ Cargar</button>` : ""}</td></tr>`).join("")}</tbody></table></div></section>`).join("")}
      ${accs.length ? `<section class="ec-card ec-tabla-card"><h3>Acciones que todavía no se miden</h3>
        <p class="ec-card-sub">Eventos, capacitaciones y activaciones cargados en Acciones que no están en Impacto de acciones. Pasalos para medirlos (se vinculan y traen la inversión).</p>
        <div class="ec-tabla-wrap"><table class="ec-tabla"><thead><tr><th>Acción</th><th>Tipo</th><th>Distribuidor</th><th>Estado</th><th class="ec-no-print"></th></tr></thead>
        <tbody>${accs.map(a => `<tr><td><b>${esc(a.titulo)}</b>${a.fecha_inicio ? `<small>${fechaLarga(a.fecha_inicio)} · ${periodoNombre(periodoDe(a.fecha_inicio))}</small>` : ""}</td>
          <td>${esc(a.tipo)}</td><td>${esc(a.distribuidor || "")}</td><td>${esc(a.estado || "")}</td>
          <td class="ec-no-print"><button class="btn-ghost" data-ec="desde-accion" data-id="${a.id}">＋ Medir</button></td></tr>`).join("")}</tbody></table></div></section>` : ""}
      ${!grupos.length && !accs.length ? `<div class="res-intro">No falta nada: todos los eventos y campañas tienen sus datos.</div>` : ""}`;
    pintarNota();
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
      if (!(await lkConfirmar(`${file.name}\n\n${p.filas.toLocaleString("es-AR")} líneas de factura · ${p.clientes.length} clientes\nDel ${fechaLarga(p.desde)} al ${fechaLarga(p.hasta)}\n\nSe reemplazan las ventas cargadas de ese período. ¿Seguimos?`, { ok: "Importar" }))) { nota(""); return; }
      const TANDA = 3000;
      for (let i = 0; i < p.dias.length; i += TANDA) {
        nota(`Guardando ventas… ${Math.min(100, Math.round(i / p.dias.length * 100))} %`, false, true);
        await rpc("ventas_importar", { p_desde: p.desde, p_hasta: p.hasta, p_borrar: i === 0,
          p_dias: p.dias.slice(i, i + TANDA), p_clientes: i === 0 ? p.clientes : [] });
      }
      await fetch(url("ventas_importaciones"), { method: "POST", headers: head(), body: JSON.stringify({
        archivo: file.name, desde: p.desde, hasta: p.hasta, filas: p.filas, clientes: p.clientes.length,
        autor_email: SES().email ? SES().email() : "" }) }).catch(() => {});
      VENTAS.clear(); [BASE, TCS, MED_CAMP].forEach(o => Object.keys(o).forEach(k => delete o[k])); FAMILIAS = null;
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
  const partnerTxt = p => ({ si: "Sí", no: "No", mixto: "Mixto" }[p] || "Sin dato");
  const CAB_EV = ["Evento", "Fecha", "Período (oct a oct)", "Formato", "Disertante", "Lugar", "Distribuidor", "¿Era partner?", "Profesionales inscriptos", "Profesionales asistieron", "% asistencia",
    "Estado de evaluación", "Días medidos", "USD antes", "USD después", "Crecimiento distribuidor", "Crecimiento resto de clientes", "USD esperado", "USD compras extra",
    "Inversión USD", "Origen de la inversión", "ROAS (compras extra ÷ inversión)", "ROAS sobre el total (compras después ÷ inversión)",
    "Costo por profesional USD", "Compras extra por profesional USD", "Compras grandes", "USD compras grandes", "Oportunidades", "Oportunidades concretadas", "¿Sirvió?"];
  const filaEv = k => {
    const m = medido(k);
    return [k.ev.titulo, k.ev.fecha || "", periodoEv(k.ev) ? periodoNombre(periodoEv(k.ev)) : "", k.ev.formato, k.ev.disertante || "", k.ev.lugar, k.nombres, partnerTxt(k.partner),
      k.inscr ?? "", k.asis ?? "", r3(k.asistencia), ESTADOS[k.estado],
      k.dias || "", k.antes ? r2(k.A) : "", k.antes ? r2(k.P) : "", r3(k.crec), m ? r3(k.base.crec) : "", m ? r2(k.E) : "", m ? r2(k.X) : "",
      k.inv.usd == null ? "" : r2(k.inv.usd), k.inv.origen || "", m ? r2(k.retorno) : "", m ? r2(k.roasTotal) : "",
      r2(k.costoProf), m ? r2(k.extraProf) : "", m ? k.grandes.length : "", m ? r2(k.grandesUsd) : "", k.ops.length, k.opsConcretadas, k.ver.t];
  };
  const CAB_OP = ["Evento", "Oportunidad", "Tipo", "Estado", "Fecha", "Valor estimado USD", "Quién la lleva", "Notas"];
  const filaOp = (ev, o) => [ev.titulo, o.titulo, o.tipo, o.estado, o.fecha || "", r2(num(o.valor_usd)), o.responsable, o.notas];
  const CAB_GR = ["Evento", "Distribuidor", "Fecha", "USD", "Veces su compra promedio", "Familia principal"];
  const filaGr = (ev, g) => [ev.titulo, g.nombre, g.fecha, r2(g.usd), g.veces ? r2(g.veces) : "primera compra", g.familia];
  const CAB_AGR_X = ["Eventos", "Evaluados", "Provisorios", "Esperando ventas", "Faltan datos", "Profesionales asistieron", "Inversión USD", "USD compras extra", "ROAS",
    "Con compras extra", "Oportunidades", "Oportunidades concretadas", "Compras grandes", "Con impacto (compras extra u oportunidades)"];
  const filaAgrX = a => [a.n, a.eval, a.prov, a.esperando, a.faltan, a.asis, r2(a.inv), a.med ? r2(a.X) : "", r2(a.roas), a.med ? a.sirvieron : "", a.ops, a.opsConc, a.grandes, a.impacto];
  async function excel() {
    if (!window.XLSX) { lkAviso("No se pudo cargar el exportador."); return; }
    const wb = XLSX.utils.book_new();
    const ev = ABIERTO && ABIERTO !== "nuevo" ? eventoAbierto() : null;
    if (ev) {
      await asegurarDatos(ev);
      const k = calcular(ev, VENTANA);
      hoja(wb, "Resumen", [["Campo", "Valor"], ...CAB_EV.map((c, i) => [c, filaEv(k)[i]]), [],
        ["Ventana antes", k.antes ? `${k.antes[0]} a ${k.antes[1]}` : ""], ["Ventana después", k.despues ? `${k.despues[0]} a ${k.despues[1]}` : ""],
        ["Crecimiento distribuidor mismas fechas año anterior", r3(k.crecLy)],
        ["Conclusión", String(k.ver.txt || "").replace(/<[^>]+>/g, "")],
        ["Qué falta", faltantesEvento(ev, k).map(f => `${f.que} (${f.quien === "resp" ? f.persona || QUIEN.resp : QUIEN[f.quien]})`).join(" · ")],
        ["Cómo se calcula", "Esperado = compras antes × (1 + crecimiento del resto de los clientes). Compras extra = después − esperado. ROAS = compras extra ÷ inversión. Compras grandes = días de compra de más de 2× su promedio de los 12 meses previos."]], [44, 70]);
      hoja(wb, "Distribuidores", [["Distribuidor", "Razón social", "CUIT", "¿Era partner?", "Vendedor", "USD antes", "USD después", "USD esperado", "USD compras extra", "Crecimiento"],
        ...k.dists.map(r => [r.nombre, r.razon, r.x.cuit, r.x.era_partner == null ? "Sin dato" : r.x.era_partner ? "Sí" : "No", r.vendedor, r2(r.antes), r2(r.despues), k.base ? r2(r.esperado) : "", k.base ? r2(r.extra) : "", r3(r.crec)])],
        [28, 34, 15, 12, 14, 12, 12, 13, 15, 11]);
      hoja(wb, "Oportunidades", [CAB_OP, ...opsDe(ev).map(o => filaOp(ev, o))], [28, 36, 18, 12, 11, 14, 18, 40]);
      const p = ev.perfiles || {}, obj = new Set(ev.perfiles_objetivo || []), tot = Object.values(p).reduce((s, x) => s + (Number(x) || 0), 0);
      hoja(wb, "Audiencia", [["Perfil", "Fueron", "%", "¿Lo buscamos?"], ...Object.entries(p).sort((a, b) => b[1] - a[1]).map(([x, n]) => [x, n, tot ? r3(n / tot) : "", obj.has(x) ? "Sí" : ""]),
        ...[...obj].filter(x => !(x in p)).map(x => [x, 0, 0, "Sí"]), [], ["Fuente", ev.perfiles_fuente || ""]], [28, 10, 8, 14]);
      if (k.antes) {
        hoja(wb, "Compras grandes", [CAB_GR, ...k.grandes.map(g => filaGr(ev, g))], [28, 28, 11, 12, 14, 24]);
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
    const todos = EVS.map(e => calcular(e, VENTANA));
    hoja(wb, "Eventos", [CAB_EV, ...ks.map(filaEv)], [32, 11, 16, 14, 12, 18, 26, 10, 12, 12, 10, 14, 8, 12, 12, 12, 12, 12, 14, 12, 26, 12, 12, 14, 14, 10, 12, 10, 10, 26]);
    hoja(wb, "Oportunidades", [CAB_OP, ...ks.flatMap(k => opsDe(k.ev).map(o => filaOp(k.ev, o)))], [28, 36, 18, 12, 11, 14, 18, 40]);
    hoja(wb, "Compras grandes", [CAB_GR, ...ks.filter(medido).flatMap(k => k.grandes.map(g => filaGr(k.ev, g)))], [28, 28, 11, 12, 14, 24]);
    hoja(wb, "Por distribuidor", [["Distribuidor", "Razón social", "CUIT", "¿Partner?", "Vendedor", "Eventos", "Profesionales asistieron", "Inversión USD", "USD compras extra", "ROAS", "Oportunidades"],
      ...resumenDistribuidores(ks).map(d => [d.nombre, d.razon, d.cuit, partnerTxt(d.partner), d.vendedor, d.eventos, d.asis, r2(d.inv), d.medidos ? r2(d.X) : "", d.medidos && d.inv ? r2(Math.max(0, d.X) / d.inv) : "", d.ops])],
      [28, 34, 15, 10, 14, 8, 12, 12, 14, 10, 12]);
    hoja(wb, "Por período", [["Período (1/10 al 30/9)", ...CAB_AGR_X], ...periodos().slice().reverse().map(p => [periodoNombre(p), ...filaAgrX(agregar(todos.filter(k => periodoEv(k.ev) === p)))])],
      [22, 8, 9, 10, 10, 10, 12, 12, 14, 8, 12, 12, 12, 12, 16]);
    const pat = (tit, f) => grupos(ks, f).map(x => [tit, x.g, ...filaAgrX(x.a)]);
    hoja(wb, "Patrones", [["Agrupado por", "Grupo", ...CAB_AGR_X],
      ...pat("Formato", k => k.ev.formato || "Sin formato"), ...pat("Disertante", k => k.ev.disertante || "Sin cargar"),
      ...pat("Partner", k => ({ si: "Ya era partner", no: "No era partner", mixto: "Mixto" }[k.partner] || "Sin dato"))], [14, 22, 8, 9, 10, 10, 10, 12, 12, 14, 8, 12, 12, 12, 12, 16]);
    const aud = audienciaDe(ks);
    hoja(wb, "Audiencias", [["Perfil", "Asistentes", "%", "¿Lo buscamos?"], ...aud.filas.map(f => [f.p, f.n, r3(f.n / aud.total), f.objetivo ? "Sí" : ""])], [28, 12, 8, 14]);
    hoja(wb, "Campañas", [["Campaña", "Tipo", "Producto", "Familia", "Material listo", "Llegó a Comercial", "Quién lo recibió", "Distribuido", "Clientes que lo recibieron", "Inversión USD", "Estado",
        "Días medidos", "USD familia antes", "USD familia después", "Crecimiento familia", "Crecimiento ventas totales", "USD esperado", "USD compras extra"],
      ...CAMPS.map(c => { const m = MED_CAMP[claveCamp(c)] || {}, inv = inversion(vistaInvCamp(c));
        return [c.titulo, c.tipo, c.producto, c.familia, c.listo_fecha || "", c.comercial_fecha || "", c.comercial_recibio, c.distribuido_fecha || "", (c.destinatarios || []).length || "",
          r2(inv.usd), ESTADOS_CAMP[estadoCampana(c)], m.dias || "", m.ta ? r2(m.ta.fam) : "", m.td ? r2(m.td.fam) : "", r3(m.crecFam), r3(m.crecTot), r2(m.esperado), r2(m.extra)]; })],
      [26, 14, 14, 20, 12, 12, 16, 12, 10, 12, 30, 8, 12, 12, 10, 10, 12, 12]);
    hoja(wb, "Datos que faltan", [["Quién", "Acción", "Fecha", "Qué falta", "Para qué"],
      ...todosLosFaltantes().map(x => [x.quien === "resp" ? x.persona || QUIEN.resp : QUIEN[x.quien], x.donde, x.fecha || "", x.que, x.para]),
      ...accionesSinPasar().map(a => [QUIEN.mkt, a.titulo, a.fecha_inicio || "", "Pasar la acción a Impacto de acciones para medirla", "medir el impacto"])], [18, 30, 11, 60, 30]);
    hoja(wb, "Cómo se calcula", [["Concepto", "Cálculo"],
      ["Ventas", "Reporte de ventas del sistema: neto USD por comprobante (las notas de crédito restan), sumado por cliente y día. Son compras del distribuidor a Leuk (sell-in)"],
      ["Período", "De octubre a octubre: del 1/10 al 30/9 del año siguiente"],
      ["Ventana", `Antes = los ${VENTANA} días previos al evento; después = el día del evento y los siguientes (se acortan las dos si todavía no hay datos, y el evento queda provisorio)`],
      ["Esperado", "Compras del distribuidor antes × (1 + crecimiento del resto de los clientes en las mismas fechas)"],
      ["Compras extra", "Compras del distribuidor después − esperado"],
      ["ROAS", "Compras extra ÷ inversión (0 si no hubo compras extra). El ROAS sobre el total usa todo lo que compró el distribuidor después"],
      ["Compras grandes", "Días de compra después del evento de más de 2× la compra promedio del distribuidor en los 12 meses previos"],
      ["Con impacto", "Eventos con compras extra o con al menos una oportunidad (no descartada)"],
      ["Costo por profesional", "Inversión ÷ profesionales que asistieron"],
      ["Campañas", "Compras de la familia después de la distribución vs. esperado (compras antes × (1 + crecimiento de las ventas totales))"]], [24, 110]);
    XLSX.writeFile(wb, `impacto-de-acciones-${PERIODO ? `oct${PERIODO}-oct${+PERIODO + 1}` : "todos"}-${hoyISO()}.xlsx`);
  }
  // PDF = la impresión del navegador ("Guardar como PDF"); el CSS de impresión deja sólo esta página.
  function pdf() {
    const ev = ABIERTO && ABIERTO !== "nuevo" ? eventoAbierto() : null;
    const titulo = document.title;
    document.title = ev ? `Evento - ${ev.titulo}` : `Impacto de acciones ${PERIODO ? periodoNombre(PERIODO) : ""}`.trim();
    document.body.classList.add("ec-imprimiendo");
    const fin = () => { document.body.classList.remove("ec-imprimiendo"); document.title = titulo; window.removeEventListener("afterprint", fin); };
    window.addEventListener("afterprint", fin);
    setTimeout(() => { window.print(); setTimeout(fin, 500); }, 50);
  }

  /* ======================= EVENTOS DEL DOM ======================= */
  const repintarTodo = () => {
    if (ABIERTO) { pintarDistribuidores(); pintarAnalisis(); pintarFaltanEvento(); const ev = eventoAbierto(); if (ev && ev.id) asegurarDatos(ev); }
    else if (CAMP) pintarMedicionCampana();
    else { pintarTablero(); refrescarTablero(); }
  };
  const ACC = {
    reintentar: () => window.renderEventosClientes(),
    nuevo: () => nuevo(),
    crear: () => crear(),
    volver: () => volver(),
    borrar: () => borrar(),
    importar: () => { const f = caja().querySelector(".ec-csv"); if (f) f.click(); },
    "ir-falta": a => irAFalta(a.dataset.ir),
    excel: () => excel().catch(() => nota("No se pudo armar el Excel.", true)),
    pdf: () => pdf(),
    tab: a => { TAB = a.dataset.tab; pintarTablero(); refrescarTablero(); },
    estado: a => { ESTADO_F = a.dataset.k; pintarTablero(); },
    ventana: a => { VENTANA = +a.dataset.n; repintarTodo(); },
    sumar: a => { const c = CLI.get(a.dataset.cuit); if (c) sumar([filaDe(c)]); },
    quitar: a => quitar(a.dataset.id),
    "op-nueva": () => opNueva(),
    "op-borrar": a => opBorrar(a.dataset.id),
    "aud-importar": () => { const f = caja().querySelector(".ec-aud-file"); if (f) f.click(); },
    "camp-nueva": () => nuevaCampana(),
    "camp-crear": () => crearCampana(),
    "camp-borrar": () => borrarCampana(),
    "desde-accion": a => { const x = ACCS.find(y => y.id === a.dataset.id); if (x) nuevoDesdeAccion(x); },
    recuperar: a => { const x = ACCS.find(y => sinTildes(y.titulo).includes(sinTildes(a.dataset.n).replace(/ \d{4}$/, ""))); if (x) nuevoDesdeAccion(x); else nuevo({ titulo: a.dataset.n, fecha: "" }); },
  };
  // Inversión: monto + moneda. En US$ va a inversion_usd; en pesos, a inversion_ars (y se pasa a US$ con el TC).
  function guardarInversion(esCamp, moneda, monto) {
    const campos = moneda === "ARS" ? { inversion_ars: monto, inversion_usd: null } : { inversion_usd: monto, inversion_ars: null };
    if (SIN_SQL3 && !esCamp) delete campos.inversion_ars;
    return esCamp ? guardarCampana(campos) : guardar(campos);
  }
  function enganchar() {
    const c = caja();
    if (c.dataset.enganchado) return;
    c.dataset.enganchado = "1";
    c.addEventListener("click", ev => {
      const a = ev.target.closest("[data-ec]");
      if (a && c.contains(a)) { const d = a.closest("details"); if (d) d.open = false; const fn = ACC[a.dataset.ec]; if (fn && !a.disabled) fn(a, ev); return; }
      const fila = ev.target.closest("[data-abrir]"); if (fila) return abrir(fila.dataset.abrir);
      const camp = ev.target.closest("[data-camp]"); if (camp) abrirCampana(camp.dataset.camp);
    });
    c.addEventListener("keydown", ev => {
      if (ev.key === "Enter" && ev.target.dataset && ev.target.dataset.abrir) { ev.preventDefault(); abrir(ev.target.dataset.abrir); }
      if (ev.key === "Enter" && ev.target.dataset && ev.target.dataset.camp) { ev.preventDefault(); abrirCampana(ev.target.dataset.camp); }
      if (ev.target.classList.contains("ec-titulo") && ev.key === "Enter") {
        ev.preventDefault(); if (ABIERTO === "nuevo") crear(); else if (CAMP === "nueva") crearCampana(); else ev.target.blur();
      }
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
      if (el.classList.contains("ec-aud-file")) { const f = el.files[0]; el.value = ""; importarAudiencia(f); return; }
      if (el.dataset.f === "periodo") { PERIODO = el.value; pintarTablero(); refrescarTablero(); return; }
      if (el.dataset.f === "formato") { FORMATO = el.value; pintarTablero(); refrescarTablero(); return; }
      if (el.dataset.f === "disertante") { DISERT = el.value; pintarTablero(); refrescarTablero(); return; }
      // ¿Era partner? (por distribuidor del evento)
      if (el.dataset.ecInv === "era_partner") { guardarInv(el.dataset.id, { era_partner: el.value === "si" ? true : el.value === "no" ? false : null }); return; }
      // Oportunidades
      const op = el.closest("[data-op]");
      if (op && el.dataset.opCampo) {
        const k = el.dataset.opCampo; let v = el.value;
        if (k === "valor_usd") v = num(v); if (k === "fecha" && !v) v = null; if (k === "titulo") v = v.trim();
        opGuardar(op.dataset.op, { [k]: v }); return;
      }
      // Audiencia
      if (el.dataset.perfil != null) {
        const e = eventoAbierto(); const p = Object.assign({}, e.perfiles || {}); p[el.dataset.perfil] = num(el.value) || 0;
        guardarPerfiles(p); return;
      }
      if (el.dataset.objetivo != null) {
        const e = eventoAbierto(); const o = new Set(e.perfiles_objetivo || []);
        if (el.checked) o.add(el.dataset.objetivo); else o.delete(el.dataset.objetivo);
        guardar({ perfiles_objetivo: [...o] }).then(ok => { if (ok) pintarAudiencia(); }); return;
      }
      // Inversión (evento o campaña)
      if (el.dataset.campo === "inv_moneda" || el.dataset.campo === "inv_monto") {
        const esCamp = !!CAMP, x = esCamp ? campanaAbierta() : eventoAbierto(); if (!x) return;
        const key = esCamp ? (x.id || "nueva") : (x.id || "nuevo");
        const wrap = el.closest(".ec-monto");
        const moneda = wrap.querySelector('[data-campo="inv_moneda"]').value, monto = num(wrap.querySelector('[data-campo="inv_monto"]').value);
        INV_MON[key] = moneda;
        guardarInversion(esCamp, moneda, monto).then(async ok => {
          if (!ok) return;
          const v = esCamp ? vistaInvCamp(x) : x;
          if (necesitaTC(v)) await tcCerca(v.fecha);
          if (esCamp) { if (CAMP !== "nueva") pintarCampana(); } else if (ABIERTO !== "nuevo") pintarDetalle(); else pintarAyudaInv();
        });
        return;
      }
      // Campaña
      if (el.dataset.cCampo) {
        const k = el.dataset.cCampo; let v = el.value;
        if (k === "titulo") { v = v.trim(); if (!v && CAMP !== "nueva") { el.value = campanaAbierta().titulo; return nota("El nombre no puede quedar vacío.", true); } }
        if (/_fecha$/.test(k) && !v) v = null;
        guardarCampana({ [k]: v }).then(ok => { if (ok && CAMP !== "nueva" && (/_fecha$/.test(k) || k === "familia")) pintarCampana(); });
        return;
      }
      let campo = el.dataset.campo; if (!campo) return;
      let v = el.value;
      if (campo === "titulo") { v = v.trim(); if (!v && ABIERTO !== "nuevo") { el.value = eventoAbierto().titulo; return nota("El nombre no puede quedar vacío.", true); } }
      if (campo === "disertante_sel") {
        const otro = caja().querySelector(".ec-dis-otro");
        OTRO_DIS = v === "otro";
        if (otro) { otro.style.display = OTRO_DIS ? "" : "none"; otro.value = ""; }
        if (OTRO_DIS) { nota("Escribí quién dio la charla."); if (otro) otro.focus(); if (ABIERTO !== "nuevo") return; v = ""; }
        campo = "disertante";
      }
      if (campo === "disertante") {
        v = v.trim();
        if (!v && OTRO_DIS) { nota("Escribí quién dio la charla.", true); return; }
        if (v) OTRO_DIS = false;
      }
      if (["prof_inscriptos", "prof_asistentes"].includes(campo)) v = num(v);
      if (["fecha", "accion_id"].includes(campo) && !v) v = null;
      const extra = {};
      // Al vincular una acción en un evento nuevo, se completan el nombre y la fecha si están vacíos.
      if (campo === "accion_id" && v && ABIERTO === "nuevo") {
        const a = ACCS.find(y => y.id === v), t = caja().querySelector(".ec-titulo");
        if (a && t && !t.value.trim()) { extra.titulo = a.titulo; t.value = a.titulo; }
        if (a && a.fecha_inicio && !BORRADOR.fecha) extra.fecha = a.fecha_inicio;
      }
      guardar(Object.assign({ [campo]: v }, extra)).then(async ok => {
        if (!ok) return;
        if (campo === "fecha" || campo === "accion_id") { if (necesitaTC(eventoAbierto())) await tcCerca(eventoAbierto().fecha); }
        if (ABIERTO === "nuevo") { if (campo === "accion_id" || campo === "fecha") pintarAyudaInv(); return; }
        if (["fecha", "accion_id"].includes(campo)) pintarDetalle();
        else if (["prof_inscriptos", "prof_asistentes", "disertante"].includes(campo)) { pintarAnalisis(); pintarAudiencia(); pintarFaltanEvento(); }
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
    if (CARGADO && (ABIERTO === "nuevo" || CAMP === "nueva")) return;     // no pisar algo a medio crear
    pintar();
    await traer();
    pintar();
    if (ABIERTO) { const ev = eventoAbierto(); if (ev && ev.id) asegurarDatos(ev); } else refrescarTablero();
  };
})();
