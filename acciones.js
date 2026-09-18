/* ============================================================================
   MÓDULO ACCIONES — seguimiento de acciones de marketing (alianzas, eventos,
   sponsoreos, activaciones, canjes, workshops…) de la idea al resultado.

   Dos pantallas:
     · LISTA   → todas las acciones con su estado, fechas y cómo vienen las métricas.
     · FICHA   → una acción: datos, métricas esperadas vs reales, inversión, y la
                 LÍNEA DE TIEMPO donde se van tirando notas, propuestas y archivos.

   Quién entra: sólo Admin y Líder (ROLES en app.js). El permiso REAL lo aplica
   Supabase por RLS (supabase/sql/2026-09-18-acciones.sql): esto sólo decide qué
   se dibuja. Los archivos van al bucket PRIVADO `acciones` y se abren con URLs
   firmadas de una hora.

   Vive en un archivo aparte, igual que Tareas: app.js es una IIFE y el único
   contacto es window.LEUK_SESION.
   ========================================================================== */
(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const SES = () => window.LEUK_SESION || {};
  const url = p => `${SES().sbUrl}/rest/v1/${p}`;
  const sto = p => `${SES().sbUrl}/storage/v1/${p}`;
  const head = extra => Object.assign({ "Content-Type": "application/json" }, SES().head ? SES().head() : {}, extra || {});
  const low = s => String(s || "").toLowerCase();
  const yo = () => low(SES().email && SES().email());
  const esAdmin = () => !!(SES().rol && SES().rol() === "admin");
  const caja = () => $("#acciones");
  const enc = s => encodeURIComponent(s);
  const BUCKET = "acciones";

  /* ---- Utilidades ---- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pad = n => String(n).padStart(2, "0");
  const isoDe = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hoyISO = () => isoDe(new Date());
  // 'YYYY-MM-DD' → Date local. Sin new Date(str): eso interpreta UTC y corre un día.
  const aFecha = s => { const p = String(s || "").split("-"); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); };
  const sinTildes = s => low(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
  const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const fechaCorta = s => { if (!s) return ""; const d = aFecha(s); return `${d.getDate()} ${MES_CORTO[d.getMonth()]}`; };
  const fechaLarga = s => { if (!s) return ""; const d = aFecha(s); return `${d.getDate()} ${MES_CORTO[d.getMonth()]} ${d.getFullYear()}`; };
  const num = v => (v === "" || v == null || isNaN(Number(v))) ? null : Number(v);
  const plata = (v, mon) => v == null ? "—" : `${mon === "USD" ? "US$" : "$"} ${Math.round(v).toLocaleString("es-AR")}`;
  const pesoArchivo = b => b == null ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`;
  const tms = x => Date.parse(x) || 0;
  function hace(ts) {
    if (!ts) return "";
    const s = (Date.now() - Date.parse(ts)) / 1000;
    if (s < 60) return "recién";
    if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
    if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
    if (s < 172800) return "ayer";
    const d = new Date(ts);
    return `${d.getDate()} ${MES_CORTO[d.getMonth()]}`;
  }
  const MAX_MB = 50;   // igual al file_size_limit del bucket

  /* ---- Vocabulario ---- */
  const ESTADOS = [
    { k: "idea",        t: "Idea" },
    { k: "evaluacion",  t: "En evaluación" },
    { k: "negociacion", t: "En negociación" },
    { k: "aprobada",    t: "Aprobada" },
    { k: "curso",       t: "En curso" },
    { k: "finalizada",  t: "Finalizada" },
    { k: "descartada",  t: "Descartada" },
  ];
  const estadoT = k => (ESTADOS.find(e => e.k === k) || ESTADOS[0]).t;
  // Los mismos tipos con los que se evalúan las propuestas (skill evaluador-acciones-leuk).
  const TIPOS = ["Alianza", "Evento", "Sponsoreo", "Activación", "Canje de producto", "Colaboración",
                 "Workshop / Capacitación", "Muestra de arquitectura y diseño", "Campaña", "Otro"];
  const VEREDICTOS = [
    { k: "",            t: "Sin veredicto" },
    { k: "avanzar",     t: "Avanzar" },
    { k: "condiciones", t: "Avanzar con condiciones" },
    { k: "renegociar",  t: "Renegociar" },
    { k: "descartar",   t: "Descartar" },
  ];
  const HITO_TIPOS = [
    { k: "nota",            t: "Nota",            ic: "📝" },
    { k: "propuesta",       t: "Propuesta",       ic: "📄" },
    { k: "contrapropuesta", t: "Contrapropuesta", ic: "↩︎" },
    { k: "reunion",         t: "Reunión",         ic: "🤝" },
    { k: "resultado",       t: "Resultado",       ic: "📈" },
  ];
  const hitoTipo = k => HITO_TIPOS.find(h => h.k === k) || { k: "estado", t: "Cambio de estado", ic: "•" };
  // Sugerencias para arrancar rápido; después se editan libremente.
  const METRICAS_SUG = [
    { n: "Asistentes", u: "personas" },
    { n: "Leads / contactos nuevos", u: "contactos" },
    { n: "Profesionales alcanzados", u: "profesionales" },
    { n: "Alcance en redes", u: "cuentas" },
    { n: "Ventas atribuidas", u: "$" },
    { n: "Costo por lead", u: "$", menos: true },
    { n: "Menciones en prensa", u: "notas" },
  ];

  /* ---- Estado en memoria ---- */
  let ACC = [];            // filas de `acciones`
  let HITOS = {};          // accion_id -> [entradas]
  let EQUIPO = [];         // [{email, nombre}] — admin y líderes
  let CARGADO = false;
  let ERROR = "";          // "" | sql | red
  let FILTRO = "activas";
  let TIPO = "";
  let BUSCA = "";
  let ABIERTA = null;      // id de la acción en pantalla, "nueva" para un borrador
  let BORRADOR = null;
  let COMP = null;         // lo que se está escribiendo en la línea de tiempo
  let PEND = [];           // archivos elegidos, todavía sin subir: [File]
  let SUBIENDO = false;
  let NOTA = "", NOTA_ERR = false, NOTA_T = null;
  const SEQ = {};
  const compVacio = () => ({ tipo: "nota", fecha: hoyISO(), texto: "" });
  COMP = compVacio();

  /* ---- Lecturas derivadas ---- */
  const cerrada = a => a.estado === "finalizada" || a.estado === "descartada";
  // Cumplimiento de UNA métrica: real/esperada (o al revés si "menos es mejor").
  function cumpl(m) {
    const e = num(m.esp), r = num(m.real);
    if (e == null || r == null) return null;
    if (m.menos) return r === 0 ? (e === 0 ? 1 : null) : e / r;
    return e === 0 ? null : r / e;
  }
  // Resumen de la acción: cuántas métricas tienen real, cuántas llegaron, y el promedio
  // (topeado en 200% para que una métrica desbordada no tape a las que no llegaron).
  function resumen(a) {
    const ms = a.metricas || [];
    const cs = ms.map(cumpl).filter(x => x != null);
    return {
      total: ms.length, medidas: cs.length, llegaron: cs.filter(x => x >= 1).length,
      prom: cs.length ? cs.reduce((s, x) => s + Math.min(x, 2), 0) / cs.length : null,
    };
  }
  // Terminó y todavía no se cargó cómo le fue: es lo que más se olvida.
  const faltanResultados = a => a.estado === "finalizada" && (!(a.metricas || []).length || a.metricas.some(m => num(m.real) == null));
  const tonoCumpl = x => x == null ? "" : x >= 1 ? "ok" : x >= 0.7 ? "warn" : "no";
  const pct = x => x == null ? "—" : `${Math.round(x * 100)}%`;
  const desvio = a => {
    const e = num(a.inversion_estimada), r = num(a.inversion_real);
    return e && r != null ? (r - e) / e : null;
  };

  const FILTROS = [
    { k: "activas",    t: "Activas",               f: a => !cerrada(a) },
    { k: "pipeline",   t: "Por decidir",           f: a => ["idea", "evaluacion", "negociacion"].includes(a.estado) },
    { k: "curso",      t: "En marcha",             f: a => a.estado === "aprobada" || a.estado === "curso" },
    { k: "resultados", t: "Faltan resultados",     f: faltanResultados },
    { k: "finalizada", t: "Finalizadas",           f: a => a.estado === "finalizada" },
    { k: "descartada", t: "Descartadas",           f: a => a.estado === "descartada" },
    { k: "todas",      t: "Todas",                 f: () => true },
  ];
  function base() {
    const q = sinTildes(BUSCA.trim());
    return ACC.filter(a => (!TIPO || a.tipo === TIPO) &&
      (!q || sinTildes(`${a.titulo} ${a.socio} ${a.tipo} ${a.descripcion} ${nombreDe(a.responsable_email)}`).includes(q)));
  }
  const visibles = () => base().filter((FILTROS.find(x => x.k === FILTRO) || FILTROS[0]).f);

  function nombreDe(email) {
    if (!email) return "";
    const p = EQUIPO.find(x => low(x.email) === low(email));
    return p ? p.nombre : String(email).split("@")[0];
  }
  const iniciales = nombre => String(nombre || "?").trim().split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
  function avatarHTML(email) {
    if (!email) return `<span class="ac-avatar vacio" title="Sin responsable">?</span>`;
    const n = nombreDe(email);
    return `<span class="ac-avatar ${low(email) === yo() ? "yo" : ""}" title="${esc(n)}">${esc(iniciales(n))}</span>`;
  }
  const tiposEnUso = () => [...new Set([...TIPOS, ...ACC.map(a => a.tipo).filter(Boolean)])];
  function rango(a) {
    if (!a.fecha_inicio && !a.fecha_fin) return "";
    if (!a.fecha_fin || a.fecha_fin === a.fecha_inicio) return fechaLarga(a.fecha_inicio || a.fecha_fin);
    if (!a.fecha_inicio) return `hasta ${fechaLarga(a.fecha_fin)}`;
    const mismoAnio = a.fecha_inicio.slice(0, 4) === a.fecha_fin.slice(0, 4);
    return `${mismoAnio ? fechaCorta(a.fecha_inicio) : fechaLarga(a.fecha_inicio)} → ${fechaLarga(a.fecha_fin)}`;
  }
  const hitosDe = id => (HITOS[id] || []).slice().sort((x, y) =>
    String(y.fecha).localeCompare(String(x.fecha)) || tms(y.creado) - tms(x.creado));
  const archivosDe = id => (HITOS[id] || []).reduce((n, h) => n + (h.archivos || []).length, 0);

  /* ---- Avisos ---- */
  function nota(t, err) {
    NOTA = t; NOTA_ERR = !!err;
    clearTimeout(NOTA_T);
    NOTA_T = setTimeout(() => { NOTA = ""; pintarNota(); }, err ? 7000 : 3500);
    pintarNota();
  }
  function pintarNota() {
    const c = caja(); if (!c) return;
    c.querySelectorAll(".ac-nota").forEach(n => { n.textContent = NOTA; n.classList.toggle("err", NOTA_ERR); });
  }

  /* ---- Datos ---- */
  const normal = a => Object.assign(a, { metricas: Array.isArray(a.metricas) ? a.metricas : [] });
  const normalH = h => Object.assign(h, { archivos: Array.isArray(h.archivos) ? h.archivos : [] });
  let TRAYENDO = null;
  function traer() {
    if (!TRAYENDO) TRAYENDO = traerAhora().finally(() => { TRAYENDO = null; });
    return TRAYENDO;
  }
  async function traerAhora() {
    try {
      const [rA, rH, rE] = await Promise.all([
        fetch(url("acciones?select=*&order=creado.desc"), { headers: head() }),
        fetch(url("acciones_hitos?select=*&order=fecha.desc,creado.desc"), { headers: head() }),
        fetch(url("rpc/equipo_acciones"), { method: "POST", headers: head(), body: "{}" }),
      ]);
      if (!rA.ok) { ERROR = rA.status === 404 ? "sql" : "red"; return; }
      const acc = (await rA.json()).map(normal);
      const hs = {};
      (rH.ok ? await rH.json() : []).forEach(h => { (hs[h.accion_id] = hs[h.accion_id] || []).push(normalH(h)); });
      if (rE.ok) EQUIPO = await rE.json();
      ACC = acc; HITOS = hs;
      ERROR = ""; CARGADO = true;
    } catch (e) { ERROR = "red"; }
  }

  async function guardarAccion(id, campos) {
    const a = ACC.find(x => x.id === id); if (!a) return false;
    const antes = {}; Object.keys(campos).forEach(k => { antes[k] = a[k]; });
    Object.assign(a, campos);                        // optimista
    const turno = SEQ[id] = (SEQ[id] || 0) + 1;
    try {
      const r = await fetch(url(`acciones?id=eq.${enc(id)}`), {
        method: "PATCH", headers: head({ Prefer: "return=representation" }), body: JSON.stringify(campos),
      });
      const d = r.ok ? await r.json() : [];
      if (!d.length) throw new Error("sin fila");
      if (SEQ[id] === turno) Object.assign(a, normal(d[0]));
      return true;
    } catch (e) {
      Object.assign(a, antes);
      nota("No se pudo guardar el cambio. Revisá la conexión y probá de nuevo.", true);
      pintar();
      return false;
    }
  }

  async function crearAccion() {
    const b = BORRADOR; if (!b) return;
    const campoT = caja().querySelector(".ac-titulo");
    if (campoT) b.titulo = campoT.value.trim();
    if (!b.titulo) { nota("Poné un nombre para crear la acción.", true); if (campoT) campoT.focus(); return; }
    const cuerpo = Object.assign({}, b, { autor: SES().nombre ? SES().nombre() : "", autor_email: SES().email ? SES().email() : "" });
    delete cuerpo.id;
    const boton = caja().querySelector('[data-accion="crear"]'); if (boton) boton.disabled = true;
    try {
      const r = await fetch(url("acciones"), { method: "POST", headers: head({ Prefer: "return=representation" }), body: JSON.stringify(cuerpo) });
      const d = r.ok ? await r.json() : [];
      if (!d.length) throw new Error("sin fila");
      const a = normal(d[0]);
      ACC.unshift(a);
      BORRADOR = null; ABIERTA = a.id;
      nota("Acción creada. Ya podés sumarle propuestas y notas a la línea de tiempo.");
      pintar();
    } catch (e) {
      if (boton) boton.disabled = false;
      nota("No se pudo crear la acción. ¿Corriste el SQL 2026-09-18-acciones.sql?", true);
    }
  }

  async function borrarAccion(id) {
    const a = ACC.find(x => x.id === id); if (!a) return;
    const nArch = archivosDe(id);
    if (!confirm(`¿Eliminar la acción "${a.titulo}"?\n\nSe borra también su línea de tiempo${nArch ? ` y sus ${nArch} archivo${nArch === 1 ? "" : "s"}` : ""}. No se puede deshacer.`)) return;
    const paths = (HITOS[id] || []).flatMap(h => h.archivos.map(f => f.path));
    try {
      const r = await fetch(url(`acciones?id=eq.${enc(id)}`), { method: "DELETE", headers: head({ Prefer: "return=representation" }) });
      const d = r.ok ? await r.json() : [];
      if (!d.length) throw new Error("sin permiso");
      await borrarArchivos(paths);
      ACC = ACC.filter(x => x.id !== id); delete HITOS[id];
      ABIERTA = null; nota("Acción eliminada.");
      pintar();
    } catch (e) { nota("No se pudo eliminar. Sólo puede hacerlo quien la creó o un admin.", true); }
  }

  /* ---- Archivos (bucket privado `acciones`) ---- */
  const nombreSeguro = n => String(n).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").slice(-120);
  async function subirArchivo(accionId, f) {
    const path = `${accionId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${nombreSeguro(f.name)}`;
    const h = head({ "Content-Type": f.type || "application/octet-stream", "x-upsert": "false" });
    const r = await fetch(sto(`object/${BUCKET}/${encodeURI(path)}`), { method: "POST", headers: h, body: f });
    if (!r.ok) throw new Error(`No se pudo subir "${f.name}"`);
    return { path, nombre: f.name, tam: f.size, tipo: f.type || "" };
  }
  async function borrarArchivos(paths) {
    if (!paths.length) return;
    try {
      await fetch(sto(`object/${BUCKET}`), { method: "DELETE", headers: head(), body: JSON.stringify({ prefixes: paths }) });
    } catch (e) { /* quedan huérfanos en el bucket: no rompe nada */ }
  }
  async function abrirArchivo(path) {
    // La pestaña se abre ANTES del await: si no, el navegador la bloquea como popup.
    const w = window.open("", "_blank");
    try {
      const r = await fetch(sto(`object/sign/${BUCKET}/${encodeURI(path)}`), { method: "POST", headers: head(), body: JSON.stringify({ expiresIn: 3600 }) });
      const d = r.ok ? await r.json() : null;
      const firmada = d && (d.signedURL || d.signedUrl);
      if (!firmada) throw new Error("sin url");
      const u = /^https?:/.test(firmada) ? firmada : sto(firmada.replace(/^\//, ""));
      if (w) w.location = u; else location.href = u;
    } catch (e) {
      if (w) w.close();
      nota("No se pudo abrir el archivo.", true);
    }
  }

  /* ---- Línea de tiempo ---- */
  async function agregarHito() {
    const id = ABIERTA; if (!id || id === "nueva" || SUBIENDO) return;
    const texto = COMP.texto.trim();
    if (!texto && !PEND.length) { nota("Escribí algo o sumá un archivo.", true); return; }
    const grandes = PEND.filter(f => f.size > MAX_MB * 1048576);
    if (grandes.length) { nota(`"${grandes[0].name}" pesa más de ${MAX_MB} MB. Subilo a Drive y pegá el link en la nota.`, true); return; }
    SUBIENDO = true; pintarComp();
    const subidos = [];
    try {
      for (const f of PEND) subidos.push(await subirArchivo(id, f));
      const cuerpo = {
        accion_id: id, tipo: COMP.tipo, texto, fecha: COMP.fecha || hoyISO(), archivos: subidos,
        autor: SES().nombre ? SES().nombre() : "", autor_email: SES().email ? SES().email() : "",
      };
      const r = await fetch(url("acciones_hitos"), { method: "POST", headers: head({ Prefer: "return=representation" }), body: JSON.stringify(cuerpo) });
      const d = r.ok ? await r.json() : [];
      if (!d.length) throw new Error("sin fila");
      (HITOS[id] = HITOS[id] || []).push(normalH(d[0]));
      COMP = compVacio(); PEND = [];
      SUBIENDO = false;
      nota(subidos.length ? `Agregado, con ${subidos.length} archivo${subidos.length === 1 ? "" : "s"}.` : "Agregado a la línea de tiempo.");
      pintarDetalle();
    } catch (e) {
      await borrarArchivos(subidos.map(x => x.path));   // no dejar archivos sueltos
      SUBIENDO = false; pintarComp();
      nota(e.message && e.message.startsWith("No se pudo subir") ? e.message + ". Probá de nuevo." : "No se pudo agregar. Revisá la conexión y probá de nuevo.", true);
    }
  }
  // Un cambio de estado queda en la línea de tiempo solo: así se ve cuándo se aprobó,
  // cuándo arrancó y cuándo terminó, sin que nadie tenga que acordarse de anotarlo.
  async function registrarEstado(id, de, a) {
    const cuerpo = {
      accion_id: id, tipo: "estado", texto: `${estadoT(de)} → ${estadoT(a)}`, fecha: hoyISO(), archivos: [],
      autor: SES().nombre ? SES().nombre() : "", autor_email: SES().email ? SES().email() : "",
    };
    try {
      const r = await fetch(url("acciones_hitos"), { method: "POST", headers: head({ Prefer: "return=representation" }), body: JSON.stringify(cuerpo) });
      const d = r.ok ? await r.json() : [];
      if (d.length) { (HITOS[id] = HITOS[id] || []).push(normalH(d[0])); if (ABIERTA === id) pintarTimeline(); }
    } catch (e) { }
  }
  async function borrarHito(hid) {
    const id = ABIERTA, h = (HITOS[id] || []).find(x => x.id === hid); if (!h) return;
    const n = h.archivos.length;
    if (!confirm(`¿Borrar esta entrada de la línea de tiempo?${n ? `\n\nSe borra${n === 1 ? " su archivo" : `n sus ${n} archivos`} también.` : ""}`)) return;
    const r = await fetch(url(`acciones_hitos?id=eq.${enc(hid)}`), { method: "DELETE", headers: head({ Prefer: "return=representation" }) }).catch(() => null);
    const d = r && r.ok ? await r.json() : [];
    if (!d.length) return nota("No se pudo borrar. Sólo puede hacerlo quien la escribió o un admin.", true);
    await borrarArchivos(h.archivos.map(f => f.path));
    HITOS[id] = HITOS[id].filter(x => x.id !== hid);
    pintarTimeline();
  }
  function sumarArchivos(lista) {
    const nuevos = [...lista].filter(f => f && f.size >= 0);
    if (!nuevos.length) return;
    PEND = PEND.concat(nuevos);
    pintarComp();
  }

  /* ---- Pintar ---- */
  function pintar() {
    const c = caja(); if (!c) return;
    if (ERROR === "sql") {
      c.innerHTML = `<div class="empty"><div class="big">🗂</div>Faltan las tablas de Acciones en Supabase.<br>
        <small>Corré <code>supabase/sql/2026-09-18-acciones.sql</code> en el SQL Editor y recargá la página.</small></div>`;
      return;
    }
    if (!CARGADO) {
      c.innerHTML = ERROR ? `<div class="empty">No se pudieron traer las acciones. Revisá la conexión y recargá.</div>`
                          : `<div class="empty-mini">Cargando acciones…</div>`;
      return;
    }
    if (ABIERTA && !accionAbierta()) ABIERTA = null;
    c.innerHTML = ABIERTA ? `<div class="ac-detalle"></div>` : `<div class="ac-lista-wrap"></div>`;
    if (ABIERTA) pintarDetalle(); else pintarLista();
  }

  /* ---------- LISTA ---------- */
  function pintarLista() {
    const w = caja().querySelector(".ac-lista-wrap"); if (!w) return;
    const b = base();
    const anio = String(new Date().getFullYear());
    const delAnio = b.filter(a => a.estado === "finalizada" && String(a.fecha_fin || a.fecha_inicio || a.actualizado || "").startsWith(anio));
    const cs = delAnio.map(resumen).filter(r => r.prom != null);
    const inv = mon => delAnio.filter(a => (a.moneda || "ARS") === mon).reduce((s, a) => s + (num(a.inversion_real) || 0), 0);
    const invTxt = ["ARS", "USD"].map(m => inv(m) ? plata(inv(m), m) : "").filter(Boolean).join(" + ") || "—";
    const ts = visibles().sort((x, y) =>
      (cerrada(x) - cerrada(y)) ||
      String(x.fecha_inicio || "9999").localeCompare(String(y.fecha_inicio || "9999")) ||
      tms(y.creado) - tms(x.creado));
    w.innerHTML = `
      <div class="ac-bar">
        <input class="ac-busca" type="search" placeholder="Buscar acción, socio…" autocomplete="off" aria-label="Buscar acción" value="${esc(BUSCA)}">
        <select class="ac-sel" data-f="tipo" aria-label="Tipo">
          <option value="">Todos los tipos</option>${tiposEnUso().map(t => `<option ${TIPO === t ? "selected" : ""}>${esc(t)}</option>`).join("")}
        </select>
        <button class="btn-primary ac-nueva" data-accion="nueva">＋ Nueva acción</button>
      </div>
      <div class="ac-stats">
        <div><b>${b.filter(a => !cerrada(a)).length}</b><span>activas</span></div>
        <div><b>${delAnio.length}</b><span>finalizadas en ${anio}</span></div>
        <div><b class="${tonoCumpl(cs.length ? cs.reduce((s, r) => s + r.prom, 0) / cs.length : null)}">${cs.length ? pct(cs.reduce((s, r) => s + r.prom, 0) / cs.length) : "—"}</b><span>cumplimiento promedio de métricas ${anio}</span></div>
        <div><b class="ac-stat-plata">${invTxt}</b><span>invertido en ${anio}</span></div>
      </div>
      <div class="ac-chips">
        ${FILTROS.map(f => { const n = b.filter(f.f).length;
          return `<button class="ac-chip ${f.k} ${FILTRO === f.k ? "on" : ""}" data-accion="filtro" data-k="${f.k}">${f.t} <span class="c">${n}</span></button>`; }).join("")}
        <span class="ac-nota" role="status"></span>
      </div>
      ${!ACC.length ? `<div class="res-intro">Todavía no hay acciones. Creá la primera con <b>＋ Nueva acción</b>: cargale el socio, las fechas y las <b>métricas que esperás</b>. Después vas sumando propuestas, contrapropuestas y notas a su <b>línea de tiempo</b>, y al terminar cargás las <b>métricas reales</b>.</div>` : ""}
      ${ts.length ? `<div class="ac-grid">${ts.map(tarjetaHTML).join("")}</div>`
        : ACC.length ? `<div class="empty">Ninguna acción en este filtro.<br><button class="btn-ghost ac-limpiar" data-accion="limpiar">Ver todas</button></div>` : ""}`;
    pintarNota();
  }

  function tarjetaHTML(a) {
    const r = resumen(a);
    const n = (HITOS[a.id] || []).filter(h => h.tipo !== "estado").length, nArch = archivosDe(a.id);
    const ult = hitosDe(a.id)[0];
    return `<article class="ac-card e-${esc(a.estado)}" data-abrir="${a.id}" tabindex="0">
      <div class="ac-card-top">
        <span class="ac-estado e-${esc(a.estado)}">${estadoT(a.estado)}</span>
        ${a.tipo ? `<span class="ac-tipo">${esc(a.tipo)}</span>` : ""}
        ${faltanResultados(a) ? `<span class="ac-falta" title="Terminó y faltan cargar las métricas reales">Faltan resultados</span>` : ""}
      </div>
      <h3 class="ac-card-t">${esc(a.titulo) || "<i>Sin nombre</i>"}</h3>
      ${a.socio || rango(a) ? `<p class="ac-card-sub">${[a.socio ? `con <b>${esc(a.socio)}</b>` : "", esc(rango(a))].filter(Boolean).join(" · ")}</p>` : ""}
      ${r.total ? `<div class="ac-card-met">
          <span class="ac-barra ${tonoCumpl(r.prom)}"><span style="width:${r.prom == null ? 0 : Math.min(100, Math.round(r.prom * 100))}%"></span></span>
          <span>${r.medidas ? `${pct(r.prom)} · ${r.llegaron}/${r.total} cumplidas${r.medidas < r.total ? ` · ${r.total - r.medidas} sin medir` : ""}` : `${r.total} métrica${r.total === 1 ? "" : "s"} esperada${r.total === 1 ? "" : "s"}`}</span>
        </div>` : `<div class="ac-card-met vacia">Sin métricas definidas</div>`}
      <div class="ac-card-pie">
        ${n ? `<span title="Entradas en la línea de tiempo">🕓 ${n}</span>` : ""}
        ${nArch ? `<span title="Archivos">📎 ${nArch}</span>` : ""}
        ${ult ? `<span class="ac-ult">últ. mov. ${hace(ult.creado)}</span>` : ""}
        ${avatarHTML(a.responsable_email)}
      </div>
    </article>`;
  }

  /* ---------- FICHA ---------- */
  const accionAbierta = () => ABIERTA === "nueva" ? BORRADOR : ACC.find(x => x.id === ABIERTA);

  function pintarDetalle() {
    const w = caja().querySelector(".ac-detalle"); if (!w) return pintar();
    const a = accionAbierta(); if (!a) return pintar();
    const nuevo = ABIERTA === "nueva";
    const puedeBorrar = !nuevo && (esAdmin() || low(a.autor_email) === yo());
    const resp = low(a.responsable_email);
    const opcResp = `<option value="">Sin asignar</option>` +
      EQUIPO.map(p => `<option value="${esc(low(p.email))}" ${low(p.email) === resp ? "selected" : ""}>${esc(p.nombre)}${low(p.email) === yo() ? " (vos)" : ""}</option>`).join("") +
      (resp && !EQUIPO.some(p => low(p.email) === resp) ? `<option value="${esc(resp)}" selected>${esc(resp)}</option>` : "");
    w.innerHTML = `
      <div class="ac-d-top">
        <button class="btn-ghost ac-volver" data-accion="volver">← Acciones</button>
        <span class="ac-nota" role="status"></span>
      </div>
      <div class="ac-d-head">
        <textarea class="ac-titulo" data-campo="titulo" rows="1" placeholder="Nombre de la acción (ej: Sponsoreo Casa FOA 2026)">${esc(a.titulo)}</textarea>
        <div class="ac-estados" role="group" aria-label="Estado">
          ${ESTADOS.map(e => `<button class="${a.estado === e.k ? "on" : ""} e-${e.k}" data-accion="estado" data-k="${e.k}">${e.t}</button>`).join("")}
        </div>
        <div class="ac-campos">
          <label><span>Tipo</span><select data-campo="tipo"><option value="">—</option>${tiposEnUso().map(t => `<option ${a.tipo === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
          <label><span>Socio / organizador</span><input data-campo="socio" value="${esc(a.socio)}" placeholder="Con quién"></label>
          <label><span>Responsable</span><select data-campo="responsable_email">${opcResp}</select></label>
          <label><span>Desde</span><input type="date" data-campo="fecha_inicio" value="${esc(a.fecha_inicio || "")}"></label>
          <label><span>Hasta</span><input type="date" data-campo="fecha_fin" value="${esc(a.fecha_fin || "")}"></label>
          <label><span>Veredicto</span><select data-campo="veredicto" class="ac-ver v-${esc(a.veredicto)}">${VEREDICTOS.map(v => `<option value="${v.k}" ${a.veredicto === v.k ? "selected" : ""}>${v.t}</option>`).join("")}</select></label>
        </div>
      </div>
      ${nuevo ? `
      <div class="ac-d-cols una">
        <div>
          <section class="ac-box">
            <h4 class="ac-box-h">Objetivo y descripción</h4>
            <textarea class="ac-texto" data-campo="descripcion" rows="3" placeholder="Qué es, qué buscamos lograr, a quién apunta…">${esc(a.descripcion)}</textarea>
          </section>
          <div class="ac-crear">
            <button class="btn-primary" data-accion="crear">Crear acción</button>
            <button class="btn-ghost" data-accion="volver">Cancelar</button>
            <span class="ac-crear-ayuda">Después de crearla le cargás las métricas y la línea de tiempo.</span>
          </div>
        </div>
      </div>` : `
      <div class="ac-d-cols">
        <div class="ac-col-tl">
          <section class="ac-box ac-tl-box">
            <h4 class="ac-box-h">Línea de tiempo</h4>
            <div class="ac-comp"></div>
            <div class="ac-tl"></div>
          </section>
        </div>
        <div class="ac-col-datos">
          <section class="ac-box ac-met-box"></section>
          <section class="ac-box ac-inv-box"></section>
          <section class="ac-box">
            <h4 class="ac-box-h">Objetivo y descripción</h4>
            <textarea class="ac-texto" data-campo="descripcion" rows="3" placeholder="Qué es, qué buscamos lograr, a quién apunta…">${esc(a.descripcion)}</textarea>
          </section>
          <section class="ac-box">
            <h4 class="ac-box-h">Aprendizajes</h4>
            <textarea class="ac-texto" data-campo="aprendizajes" rows="3" placeholder="Qué funcionó, qué no, ¿la repetiríamos? ¿En qué condiciones?">${esc(a.aprendizajes)}</textarea>
          </section>
          <div class="ac-d-pie">
            <span>Creada por ${esc(a.autor || "—")} · ${hace(a.creado)}</span>
            ${puedeBorrar ? `<button class="ac-borrar" data-accion="borrar">Eliminar acción</button>` : ""}
          </div>
        </div>
      </div>`}`;
    w.querySelectorAll("textarea").forEach(crecer);
    if (!nuevo) { pintarComp(); pintarTimeline(); pintarMetricas(); pintarInversion(); }
    pintarNota();
  }
  const crecer = el => { el.style.height = "auto"; el.style.height = el.scrollHeight + 2 + "px"; };

  function pintarComp() {
    const w = caja() && caja().querySelector(".ac-comp"); if (!w) return;
    w.classList.toggle("subiendo", SUBIENDO);
    w.innerHTML = `
      <div class="ac-comp-tipos" role="group" aria-label="Tipo de entrada">
        ${HITO_TIPOS.map(h => `<button class="${COMP.tipo === h.k ? "on" : ""} h-${h.k}" data-accion="comp-tipo" data-k="${h.k}">${h.ic} ${h.t}</button>`).join("")}
      </div>
      <textarea class="ac-comp-texto" rows="2" placeholder="${COMP.tipo === "propuesta" ? "Qué propone el socio: condiciones, contraprestaciones, montos…" : COMP.tipo === "contrapropuesta" ? "Qué le contrapropusimos y por qué…" : COMP.tipo === "reunion" ? "Con quién, qué se habló, próximos pasos…" : COMP.tipo === "resultado" ? "Cómo salió: números, repercusión, feedback…" : "Escribí una nota…"}  (⌘/Ctrl + Enter para agregar)" ${SUBIENDO ? "disabled" : ""}>${esc(COMP.texto)}</textarea>
      <label class="ac-drop" tabindex="0">
        <input type="file" multiple class="ac-file" hidden ${SUBIENDO ? "disabled" : ""}>
        <span>📎 Arrastrá archivos acá o <u>elegilos</u> <small>· PDF, imágenes, Word, Excel… hasta ${MAX_MB} MB c/u</small></span>
      </label>
      ${PEND.length ? `<ul class="ac-pend">${PEND.map((f, i) => `<li><span class="ac-file-ic">${iconoArchivo(f.name)}</span><span class="n">${esc(f.name)}</span><span class="t">${pesoArchivo(f.size)}</span>
        <button class="ac-mini" data-accion="pend-del" data-i="${i}" aria-label="Quitar archivo" ${SUBIENDO ? "disabled" : ""}>✕</button></li>`).join("")}</ul>` : ""}
      <div class="ac-comp-acc">
        <label class="ac-comp-fecha"><span>Fecha</span><input type="date" class="ac-comp-f" value="${esc(COMP.fecha)}" max="${hoyISO()}" ${SUBIENDO ? "disabled" : ""}></label>
        <button class="btn-primary" data-accion="hito-agregar" ${SUBIENDO ? "disabled" : ""}>${SUBIENDO ? "Subiendo…" : "Agregar a la línea de tiempo"}</button>
      </div>`;
    const t = w.querySelector(".ac-comp-texto"); if (t) crecer(t);
  }

  function iconoArchivo(nombre) {
    const ext = low(String(nombre).split(".").pop());
    if (ext === "pdf") return "📕";
    if (["png", "jpg", "jpeg", "gif", "webp", "heic", "svg"].includes(ext)) return "🖼";
    if (["xls", "xlsx", "csv", "numbers"].includes(ext)) return "📊";
    if (["doc", "docx", "pages", "txt", "rtf"].includes(ext)) return "📃";
    if (["ppt", "pptx", "key"].includes(ext)) return "📽";
    if (["mp4", "mov", "m4v"].includes(ext)) return "🎞";
    if (["zip", "rar"].includes(ext)) return "🗜";
    return "📎";
  }

  function pintarTimeline() {
    const w = caja() && caja().querySelector(".ac-tl"); if (!w) return;
    const hs = hitosDe(ABIERTA);
    if (!hs.length) { w.innerHTML = `<p class="ac-vacio-mini">Todavía no hay nada. Sumá la primera propuesta o nota arriba.</p>`; return; }
    let mesAnt = "";
    w.innerHTML = hs.map(h => {
      const ht = hitoTipo(h.tipo);
      const mio = esAdmin() || low(h.autor_email) === yo();
      const mes = String(h.fecha).slice(0, 7);
      const sep = mes !== mesAnt ? `<div class="ac-tl-mes">${cap(new Date(+mes.slice(0, 4), +mes.slice(5) - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" }))}</div>` : "";
      mesAnt = mes;
      if (h.tipo === "estado") return sep + `<div class="ac-tl-it estado">
          <span class="ac-tl-dot"></span>
          <div class="ac-tl-estado">${esc(h.texto)} <span>· ${fechaCorta(h.fecha)} · ${esc(h.autor || nombreDe(h.autor_email))}</span></div>
        </div>`;
      return sep + `<div class="ac-tl-it h-${esc(h.tipo)}">
        <span class="ac-tl-dot">${ht.ic}</span>
        <div class="ac-tl-card">
          <div class="ac-tl-h">
            <span class="ac-tl-tipo">${ht.t}</span>
            <span class="ac-tl-fecha">${fechaLarga(h.fecha)}</span>
            <span class="ac-tl-autor">${avatarHTML(h.autor_email)}${esc(h.autor || nombreDe(h.autor_email))}</span>
            ${mio ? `<button class="ac-mini" data-accion="hito-del" data-id="${h.id}" title="Borrar entrada" aria-label="Borrar entrada">✕</button>` : ""}
          </div>
          ${h.texto ? `<p class="ac-tl-txt">${linkear(h.texto)}</p>` : ""}
          ${h.archivos.length ? `<div class="ac-tl-files">${h.archivos.map(f =>
            `<button class="ac-file-chip" data-accion="archivo" data-path="${esc(f.path)}" title="Abrir ${esc(f.nombre)}">
              <span class="ac-file-ic">${iconoArchivo(f.nombre)}</span><span class="n">${esc(f.nombre)}</span><span class="t">${pesoArchivo(f.tam)}</span></button>`).join("")}</div>` : ""}
        </div>
      </div>`;
    }).join("");
  }
  // Texto → HTML con saltos de línea y los links clickeables (propuestas en Drive, etc.).
  const linkear = t => esc(t).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener">${u.length > 60 ? u.slice(0, 57) + "…" : u}</a>`).replace(/\n/g, "<br>");

  function pintarMetricas() {
    const w = caja() && caja().querySelector(".ac-met-box"); if (!w) return;
    const a = accionAbierta(); if (!a) return;
    const ms = a.metricas, r = resumen(a);
    const usadas = new Set(ms.map(m => low(m.n)));
    const sug = METRICAS_SUG.filter(s => !usadas.has(low(s.n)));
    w.innerHTML = `
      <h4 class="ac-box-h">Métricas <span class="ac-box-sub">esperadas vs reales</span>
        ${r.medidas ? `<span class="ac-met-tot ${tonoCumpl(r.prom)}">${pct(r.prom)}</span>` : ""}</h4>
      ${ms.length ? `<div class="ac-met">
        <div class="ac-met-h"><span>Métrica</span><span>Unidad</span><span>Esperada</span><span>Real</span><span>Cumpl.</span><span></span></div>
        ${ms.map((m, i) => { const c = cumpl(m); return `<div class="ac-met-f">
          <input data-met="${i}" data-k="n" value="${esc(m.n)}" placeholder="Qué se mide" aria-label="Métrica">
          <input data-met="${i}" data-k="u" value="${esc(m.u)}" placeholder="unidad" aria-label="Unidad">
          <input data-met="${i}" data-k="esp" type="number" step="any" inputmode="decimal" value="${esc(m.esp == null ? "" : m.esp)}" placeholder="esperada" aria-label="Esperada">
          <input data-met="${i}" data-k="real" type="number" step="any" inputmode="decimal" value="${esc(m.real == null ? "" : m.real)}" placeholder="real" aria-label="Real" class="${a.estado === "finalizada" && num(m.real) == null ? "falta" : ""}">
          <span class="ac-met-c ${tonoCumpl(c)}" title="${m.menos ? "Menos es mejor: esperada ÷ real" : "Real ÷ esperada"}">${pct(c)}</span>
          <span class="ac-met-acc">
            <button class="ac-mini ac-menos ${m.menos ? "on" : ""}" data-accion="met-menos" data-i="${i}" title="${m.menos ? "Menos es mejor (ej: costo por lead). Tocá para cambiar" : "Más es mejor. Tocá si en esta métrica menos es mejor (ej: costo por lead)"}" aria-pressed="${!!m.menos}">${m.menos ? "↓" : "↑"}</button>
            <button class="ac-mini" data-accion="met-del" data-i="${i}" title="Quitar métrica" aria-label="Quitar métrica">✕</button>
          </span>
        </div>`; }).join("")}
      </div>` : `<p class="ac-vacio-mini">Definí qué esperás lograr con esta acción. Al terminar, cargás lo real y se calcula el cumplimiento.</p>`}
      <div class="ac-met-add">
        <button class="btn-ghost" data-accion="met-add">＋ Métrica</button>
        ${sug.slice(0, 5).map(s => `<button class="ac-sug" data-accion="met-sug" data-n="${esc(s.n)}">${esc(s.n)}</button>`).join("")}
      </div>`;
  }

  function pintarInversion() {
    const w = caja() && caja().querySelector(".ac-inv-box"); if (!w) return;
    const a = accionAbierta(); if (!a) return;
    const d = desvio(a);
    w.innerHTML = `
      <h4 class="ac-box-h">Inversión
        <select data-campo="moneda" class="ac-mon" aria-label="Moneda">
          <option value="ARS" ${a.moneda !== "USD" ? "selected" : ""}>$ ARS</option>
          <option value="USD" ${a.moneda === "USD" ? "selected" : ""}>US$</option>
        </select></h4>
      <div class="ac-inv">
        <label><span>Estimada</span><input type="number" step="any" inputmode="decimal" data-campo="inversion_estimada" value="${esc(a.inversion_estimada == null ? "" : a.inversion_estimada)}" placeholder="—"></label>
        <label><span>Real</span><input type="number" step="any" inputmode="decimal" data-campo="inversion_real" value="${esc(a.inversion_real == null ? "" : a.inversion_real)}" placeholder="—"></label>
        <div class="ac-inv-d ${d == null ? "" : d > 0.1 ? "no" : d > 0 ? "warn" : "ok"}">
          <span>Desvío</span><b>${d == null ? "—" : `${d > 0 ? "+" : ""}${Math.round(d * 100)}%`}</b>
        </div>
      </div>
      <p class="ac-inv-nota">Contá plata y producto entregado (canjes) a valor de lista.</p>`;
  }

  /* ---- Métricas: editar ---- */
  function cambiarMetricas(fn, repintar) {
    const a = accionAbierta(); if (!a) return;
    const lista = a.metricas.map(m => Object.assign({}, m));
    fn(lista);
    const p = guardarAccion(a.id, { metricas: lista });
    if (repintar !== false) pintarMetricas();
    return p;
  }

  /* ---- Abrir / nueva / volver ---- */
  function abrir(id) { ABIERTA = id; BORRADOR = null; COMP = compVacio(); PEND = []; pintar(); window.scrollTo({ top: 0 }); }
  function nueva() {
    BORRADOR = {
      id: null, titulo: "", descripcion: "", tipo: TIPO || "", estado: "idea", socio: "",
      responsable_email: EQUIPO.some(p => low(p.email) === yo()) ? yo() : null,
      fecha_inicio: null, fecha_fin: null, moneda: "ARS", inversion_estimada: null, inversion_real: null,
      veredicto: "", metricas: [], aprendizajes: "",
    };
    ABIERTA = "nueva"; pintar();
    const t = caja().querySelector(".ac-titulo"); if (t) t.focus();
  }
  function volver() {
    if (ABIERTA === "nueva") {
      const t = caja().querySelector(".ac-titulo");
      if (t && t.value.trim() && !confirm("¿Descartar la acción que estabas creando?")) return;
    } else if ((COMP.texto.trim() || PEND.length) && !confirm("Tenés una entrada sin agregar a la línea de tiempo. ¿Salir igual?")) return;
    ABIERTA = null; BORRADOR = null; COMP = compVacio(); PEND = [];
    pintar();
  }
  function guardar(campos) {
    if (ABIERTA === "nueva") { Object.assign(BORRADOR, campos); return Promise.resolve(true); }
    return guardarAccion(ABIERTA, campos);
  }

  /* ---- Eventos (se enganchan una sola vez sobre #acciones) ---- */
  const ACCIONES = {
    filtro: a => { FILTRO = a.dataset.k; pintarLista(); },
    limpiar: () => { FILTRO = "todas"; TIPO = ""; BUSCA = ""; pintarLista(); },
    nueva: () => nueva(),
    volver: () => volver(),
    crear: () => crearAccion(),
    borrar: () => borrarAccion(ABIERTA),
    estado: a => {
      const ac = accionAbierta(); if (!ac || ac.estado === a.dataset.k) return;
      const de = ac.estado, k = a.dataset.k;
      guardar({ estado: k }).then(ok => { if (ok && ABIERTA !== "nueva") registrarEstado(ac.id, de, k); });
      caja().querySelectorAll(".ac-estados button").forEach(b => b.classList.toggle("on", b.dataset.k === k));
      pintarMetricas();
    },
    "comp-tipo": a => { COMP.tipo = a.dataset.k; pintarComp(); const t = caja().querySelector(".ac-comp-texto"); if (t) t.focus(); },
    "pend-del": a => { PEND.splice(+a.dataset.i, 1); pintarComp(); },
    "hito-agregar": () => agregarHito(),
    "hito-del": a => borrarHito(a.dataset.id),
    archivo: a => abrirArchivo(a.dataset.path),
    "met-add": () => cambiarMetricas(l => l.push({ n: "", u: "", esp: null, real: null })).then(() => {
      const ins = caja().querySelectorAll('.ac-met-f input[data-k="n"]'); if (ins.length) ins[ins.length - 1].focus();
    }),
    "met-sug": a => { const s = METRICAS_SUG.find(x => x.n === a.dataset.n); if (s) cambiarMetricas(l => l.push({ n: s.n, u: s.u, esp: null, real: null, menos: !!s.menos })); },
    "met-del": a => cambiarMetricas(l => l.splice(+a.dataset.i, 1)),
    "met-menos": a => cambiarMetricas(l => { const m = l[+a.dataset.i]; if (m) m.menos = !m.menos; }),
  };

  function enganchar() {
    const c = caja();
    if (c.dataset.enganchado) return;
    c.dataset.enganchado = "1";

    c.addEventListener("click", ev => {
      const a = ev.target.closest("[data-accion]");
      if (a && c.contains(a)) { const fn = ACCIONES[a.dataset.accion]; if (fn) fn(a, ev); return; }
      const card = ev.target.closest("[data-abrir]");
      if (card) abrir(card.dataset.abrir);
    });

    c.addEventListener("change", ev => {
      const el = ev.target;
      if (el.dataset.f === "tipo") { TIPO = el.value; pintarLista(); return; }
      if (el.classList.contains("ac-file")) { sumarArchivos(el.files); el.value = ""; return; }
      if (el.classList.contains("ac-comp-f")) { COMP.fecha = el.value || hoyISO(); return; }
      if (el.dataset.met != null) {
        const i = +el.dataset.met, k = el.dataset.k;
        const v = (k === "esp" || k === "real") ? num(el.value) : el.value.trim();
        // Sin re-pintar las filas (se perdería el foco al saltar con Tab): sólo el % y el total.
        cambiarMetricas(l => { if (l[i]) l[i][k] = v; }, false);
        const a = accionAbierta(), fila = el.closest(".ac-met-f"), cc = fila && fila.querySelector(".ac-met-c");
        if (a && cc) { const x = cumpl(a.metricas[i] || {}); cc.textContent = pct(x); cc.className = `ac-met-c ${tonoCumpl(x)}`; }
        if (k === "real") el.classList.toggle("falta", a && a.estado === "finalizada" && v == null);
        const tot = caja().querySelector(".ac-met-tot"), r = a && resumen(a);
        if (r && r.medidas) {
          if (tot) { tot.textContent = pct(r.prom); tot.className = `ac-met-tot ${tonoCumpl(r.prom)}`; }
          else pintarMetricas();
        }
        return;
      }
      const campo = el.dataset.campo; if (!campo) return;
      let valor = el.value;
      if (campo === "titulo") valor = valor.trim();
      if (campo === "titulo" && !valor && ABIERTA !== "nueva") {
        const a = accionAbierta(); el.value = a ? a.titulo : "";
        return nota("El nombre no puede quedar vacío.", true);
      }
      if (["fecha_inicio", "fecha_fin", "responsable_email"].includes(campo) && !valor) valor = null;
      if (campo === "inversion_estimada" || campo === "inversion_real") valor = num(valor);
      if (campo === "veredicto") el.className = `ac-ver v-${valor}`;
      guardar({ [campo]: valor }).then(ok => {
        if (ok && ["inversion_estimada", "inversion_real", "moneda"].includes(campo) && ABIERTA !== "nueva") {
          const d = desvio(accionAbierta()), box = caja().querySelector(".ac-inv-d");
          if (box) { box.className = `ac-inv-d ${d == null ? "" : d > 0.1 ? "no" : d > 0 ? "warn" : "ok"}`; box.querySelector("b").textContent = d == null ? "—" : `${d > 0 ? "+" : ""}${Math.round(d * 100)}%`; }
        }
      });
    });

    c.addEventListener("input", ev => {
      const el = ev.target;
      if (el.classList.contains("ac-busca")) {
        BUSCA = el.value;
        const pos = el.selectionStart; pintarLista();
        const b = caja().querySelector(".ac-busca"); if (b) { b.focus(); b.setSelectionRange(pos, pos); }
        return;
      }
      if (el.classList.contains("ac-comp-texto")) COMP.texto = el.value;
      if (el.tagName === "TEXTAREA") crecer(el);
    });

    c.addEventListener("keydown", ev => {
      const el = ev.target;
      if (el.classList.contains("ac-comp-texto") && ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); agregarHito(); return; }
      if (el.classList.contains("ac-titulo") && ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault(); if (ABIERTA === "nueva") crearAccion(); else el.blur(); return;
      }
      if (el.classList.contains("ac-drop") && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); const f = el.querySelector(".ac-file"); if (f) f.click(); return; }
      if (ev.key === "Enter" && el.dataset && el.dataset.abrir) { ev.preventDefault(); abrir(el.dataset.abrir); }
    });

    /* Tirar archivos: en cualquier lugar de la ficha abierta, no sólo en el recuadro.
       Si se sueltan fuera de la ficha, el navegador no navega al archivo. */
    const hayArchivos = ev => ev.dataTransfer && [...(ev.dataTransfer.types || [])].includes("Files");
    let prof = 0;
    c.addEventListener("dragenter", ev => {
      if (!hayArchivos(ev) || !c.querySelector(".ac-comp")) return;
      prof++; c.querySelector(".ac-detalle").classList.add("soltando");
    });
    c.addEventListener("dragleave", ev => {
      if (!hayArchivos(ev) || !c.querySelector(".ac-comp")) return;
      if (--prof <= 0) { prof = 0; const d = c.querySelector(".ac-detalle"); if (d) d.classList.remove("soltando"); }
    });
    c.addEventListener("dragover", ev => {
      if (!hayArchivos(ev)) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = c.querySelector(".ac-comp") && !SUBIENDO ? "copy" : "none";
    });
    c.addEventListener("drop", ev => {
      if (!hayArchivos(ev)) return;
      ev.preventDefault(); prof = 0;
      const d = c.querySelector(".ac-detalle"); if (d) d.classList.remove("soltando");
      if (!c.querySelector(".ac-comp") || SUBIENDO) return;
      sumarArchivos(ev.dataTransfer.files);
      const t = c.querySelector(".ac-comp-texto"); if (t) t.focus();
    });
    // También se puede pegar una captura / archivo con ⌘V en el cuadro de texto.
    c.addEventListener("paste", ev => {
      if (!ev.target.classList || !ev.target.classList.contains("ac-comp-texto")) return;
      const fs = ev.clipboardData && ev.clipboardData.files;
      if (fs && fs.length) { ev.preventDefault(); sumarArchivos(fs); }
    });

    document.addEventListener("keydown", ev => {
      const sec = $("#page-acciones");
      if (ev.key === "Escape" && ABIERTA && sec && !sec.classList.contains("hidden") &&
          !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName)) volver();
    });
  }

  window.renderAcciones = async function () {
    const c = caja(); if (!c) return;
    if (!(SES().puedeVerAcciones && SES().puedeVerAcciones())) { c.innerHTML = ""; return; }
    enganchar();
    // Si hay algo a medio escribir, no se re-dibuja encima al volver a la solapa.
    if (CARGADO && (ABIERTA === "nueva" || COMP.texto.trim() || PEND.length)) return;
    pintar();
    await traer();
    pintar();
  };
})();
