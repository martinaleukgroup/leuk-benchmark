/* ============================================================================
   MÓDULO TAREAS — organización de tareas del equipo de marketing.

   Tres lecturas de las MISMAS tareas, sin duplicar datos:
     · TABLERO    → columnas por estado; se arrastra para mover y reordenar.
     · LISTA      → agrupada por vencimiento: responde "¿qué me toca ahora?".
     · CALENDARIO → por fecha límite; arrastrar a otro día cambia la fecha.
   Cada tarea se abre en un panel lateral: campos, checklist y comentarios.

   Quién entra: los perfiles marcados como equipo de marketing (columna
   `perfiles.marketing`, se tilda en Usuarios) y los admin. Adentro, todos
   crean, asignan, mueven y comentan; borrar, quien la creó o un admin.
   El permiso REAL lo aplica Supabase por RLS (2026-09-15-tareas.sql): esto
   sólo decide qué se dibuja.

   Vive en un archivo aparte, igual que Contenidos: app.js es una IIFE y el
   único contacto es window.LEUK_SESION.
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
  const caja = () => $("#tareas");
  const enc = s => encodeURIComponent(s);

  /* ---- Utilidades ---- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pad = n => String(n).padStart(2, "0");
  const isoDe = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function hoyISO() { return isoDe(new Date()); }
  // 'YYYY-MM-DD' → Date local. Sin new Date(str): eso interpreta UTC y corre un día.
  const aFecha = s => { const p = String(s || "").split("-"); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); };
  const diasHasta = s => Math.round((aFecha(s) - aFecha(hoyISO())) / 864e5);
  const sinTildes = s => low(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
  const MES_NOMBRE = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  function leer(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function escribir(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }

  /* ---- Vocabulario ---- */
  const ESTADOS = [
    { k: "pendiente", t: "Por hacer" },
    { k: "curso",     t: "En curso" },
    { k: "revision",  t: "En revisión" },
    { k: "hecha",     t: "Hecha" },
  ];
  const estadoT = k => (ESTADOS.find(e => e.k === k) || ESTADOS[0]).t;
  const PRIORIDADES = [{ k: "alta", t: "Alta" }, { k: "media", t: "Media" }, { k: "baja", t: "Baja" }];
  const PRIO_PESO = { alta: 0, media: 1, baja: 2 };
  // Áreas del equipo de marketing: lista cerrada (decisión de la usuaria, sep 2026).
  const AREAS = ["Ecosistema digital", "Eventos", "Diseño", "Comercial"];
  const DIAS_HECHAS = 14;    // el tablero muestra lo terminado en las últimas 2 semanas
  const DIAS_HISTORIA = 90;  // lo terminado hace más que esto ya no se baja

  /* ---- Estado en memoria ---- */
  let TAREAS = [];         // filas de `tareas`
  let COMS = {};           // tarea_id -> [comentarios]
  let EQUIPO = [];         // [{email, nombre}] — a quién se le puede asignar
  let CARGADO = false;
  let ERROR = "";          // "" | sql | red
  let VISTA = leer("tareas_vista") || "tablero";
  let FILTRO = "todas";    // recorte rápido (chips)
  let PERSONA = "";        // email del responsable, "" = todo el equipo
  let AREA = "";
  let BUSCA = "";
  let ABIERTA = null;      // id de la tarea en el panel, "nueva" para un borrador
  let BORRADOR = null;     // tarea todavía no creada: vive sólo acá hasta "Crear"
  let VER_HECHAS = false;  // tablero/lista: también lo terminado hace más de 2 semanas
  let CALMES = hoyISO().slice(0, 7);
  let ARRASTRA = "";
  let NOTA = "", NOTA_ERR = false, NOTA_T = null;
  let TIMER = null;
  const SEQ = {};          // tarea_id -> nº del último guardado enviado

  /* ---- Lecturas derivadas ---- */
  const abierta = t => t.estado !== "hecha";
  const mia = t => low(t.responsable_email) === yo();
  const FILTROS = [
    { k: "todas",    t: "Todas",            f: () => true },
    { k: "mias",     t: "Mías",             f: t => abierta(t) && mia(t) },
    { k: "vencidas", t: "Vencidas",         f: t => abierta(t) && !!t.fecha_limite && diasHasta(t.fecha_limite) < 0 },
    { k: "semana",   t: "Próximos 7 días",  f: t => abierta(t) && !!t.fecha_limite && diasHasta(t.fecha_limite) >= 0 && diasHasta(t.fecha_limite) <= 7 },
    { k: "alta",     t: "Prioridad alta",   f: t => abierta(t) && t.prioridad === "alta" },
    { k: "sin",      t: "Sin responsable",  f: t => abierta(t) && !t.responsable_email },
    { k: "hitos",    t: "★ Hitos",          f: t => abierta(t) && !!t.hito },
  ];
  const filtroActivo = () => (FILTROS.find(x => x.k === FILTRO) || FILTROS[0]).f;

  function base() {
    const q = sinTildes(BUSCA.trim());
    return TAREAS.filter(t =>
      (!PERSONA || low(t.responsable_email) === PERSONA) &&
      (!AREA || t.area === AREA) &&
      (!q || sinTildes(`${t.titulo} ${t.descripcion} ${t.area} ${nombreDe(t.responsable_email)}`).includes(q)));
  }
  const visibles = () => base().filter(filtroActivo());

  function nombreDe(email) {
    if (!email) return "";
    const p = EQUIPO.find(x => low(x.email) === low(email));
    return p ? p.nombre : String(email).split("@")[0];
  }
  const iniciales = nombre => String(nombre || "?").trim().split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
  // Mismo color para la misma área, siempre, sin tener que configurarlo.
  const tono = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const porOrden = (a, b) => (a.orden - b.orden) || String(a.creado || "").localeCompare(String(b.creado || ""));
  // Las fijas primero; si alguna tarea vieja trae otra, se suma al final para no perderla de vista.
  const areas = () => [...new Set([...AREAS, ...TAREAS.map(t => t.area).filter(Boolean)])];

  // Una tarea se lee en relación a hoy: "vence mañana" dice más que "16/09".
  function vence(t) {
    if (!t.fecha_limite) return null;
    const d = aFecha(t.fecha_limite);
    const corta = `${d.getDate()} ${MES_CORTO[d.getMonth()]}`;
    if (!abierta(t)) return { t: corta, c: "" };
    const n = diasHasta(t.fecha_limite);
    if (n < -1) return { t: `vencida hace ${-n} días`, c: "vencida" };
    if (n === -1) return { t: "venció ayer", c: "vencida" };
    if (n === 0) return { t: "vence hoy", c: "hoy" };
    if (n === 1) return { t: "vence mañana", c: "pronto" };
    if (n <= 7) return { t: `en ${n} días · ${corta}`, c: "pronto" };
    return { t: corta, c: "" };
  }
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

  /* ---- Avisos ---- */
  function nota(t, err) {
    NOTA = t; NOTA_ERR = !!err;
    clearTimeout(NOTA_T);
    NOTA_T = setTimeout(() => { NOTA = ""; pintarNota(); }, err ? 7000 : 3500);
    pintarNota();
  }
  function pintarNota() {
    const n = caja() && caja().querySelector(".tk-nota"); if (!n) return;
    n.textContent = NOTA; n.classList.toggle("err", NOTA_ERR);
  }
  // Contador en la solapa Tareas: lo tuyo que vence hoy o ya venció.
  function marcarNav(n) {
    const b = document.querySelector('#nav button[data-mod="tareas"]'); if (!b) return;
    let s = b.querySelector(".nav-count");
    if (!n) { if (s) s.remove(); b.removeAttribute("title"); return; }
    if (!s) { s = document.createElement("span"); s.className = "nav-count"; b.appendChild(s); }
    s.textContent = n;
    b.title = n === 1 ? "Tenés 1 tarea para hoy o vencida" : `Tenés ${n} tareas para hoy o vencidas`;
  }
  function contarMias() {
    return TAREAS.filter(t => abierta(t) && mia(t) && t.fecha_limite && diasHasta(t.fecha_limite) <= 0).length;
  }
  window.avisosTareas = async function () {
    if (!(SES().puedeVerTareas && SES().puedeVerTareas())) return marcarNav(0);
    if (CARGADO) return marcarNav(contarMias());
    try {
      const r = await fetch(url(`tareas?select=id&estado=neq.hecha&responsable_email=ilike.${enc(yo())}&fecha_limite=lte.${hoyISO()}`), { headers: head() });
      if (r.ok) marcarNav((await r.json()).length);
    } catch (e) { }
  };

  /* ---- Datos ---- */
  async function traer() {
    const desde = new Date(Date.now() - DIAS_HISTORIA * 864e5).toISOString();
    try {
      const [rT, rC, rE] = await Promise.all([
        fetch(url(`tareas?select=*&or=(estado.neq.hecha,completada.gte.${enc(desde)})&order=orden.asc,creado.asc`), { headers: head() }),
        fetch(url("tareas_comentarios?select=*&order=creado.asc"), { headers: head() }),
        fetch(url("rpc/equipo_marketing"), { method: "POST", headers: head(), body: "{}" }),
      ]);
      if (!rT.ok) { ERROR = rT.status === 404 ? "sql" : "red"; return; }
      TAREAS = (await rT.json()).map(t => Object.assign(t, { checklist: Array.isArray(t.checklist) ? t.checklist : [], hito: !!t.hito }));
      COMS = {};
      (rC.ok ? await rC.json() : []).forEach(c => { (COMS[c.tarea_id] = COMS[c.tarea_id] || []).push(c); });
      if (rE.ok) EQUIPO = await rE.json();
      ERROR = ""; CARGADO = true;
      marcarNav(contarMias());
    } catch (e) { ERROR = "red"; }
  }

  async function guardarTarea(id, campos) {
    const t = TAREAS.find(x => x.id === id); if (!t) return false;
    const antes = {}; Object.keys(campos).forEach(k => { antes[k] = t[k]; });
    antes.completada = t.completada;
    Object.assign(t, campos);                      // optimista: se ve al instante
    if ("estado" in campos) t.completada = campos.estado === "hecha" ? (t.completada || new Date().toISOString()) : null;
    pintarBarra(); pintarCuerpo(); marcarNav(contarMias());
    // Si salen dos guardados seguidos (tildar dos pasos rápido), la respuesta del
    // primero no puede pisar en memoria lo que ya cambió el segundo.
    const turno = SEQ[id] = (SEQ[id] || 0) + 1;
    try {
      const r = await fetch(url(`tareas?id=eq.${enc(id)}`), {
        method: "PATCH", headers: head({ Prefer: "return=representation" }), body: JSON.stringify(campos),
      });
      const d = r.ok ? await r.json() : [];
      if (!d.length) throw new Error("sin fila");
      if (SEQ[id] === turno) Object.assign(t, d[0], { checklist: Array.isArray(d[0].checklist) ? d[0].checklist : [] });
      return true;
    } catch (e) {
      Object.assign(t, antes);
      nota("No se pudo guardar el cambio. Revisá la conexión y probá de nuevo.", true);
      pintarBarra(); pintarCuerpo(); if (ABIERTA === id) pintarPanel();
      return false;
    }
  }

  async function crearTarea() {
    const b = BORRADOR; if (!b) return;
    const campoT = caja().querySelector(".tk-p-titulo");
    if (campoT) b.titulo = campoT.value.trim();
    if (!b.titulo) { nota("Poné un título para crear la tarea.", true); if (campoT) campoT.focus(); return; }
    const hermanas = TAREAS.filter(t => t.estado === b.estado);
    const cuerpo = {
      titulo: b.titulo, descripcion: b.descripcion, estado: b.estado, prioridad: b.prioridad, area: b.area,
      responsable_email: b.responsable_email || null, fecha_limite: b.fecha_limite || null, checklist: b.checklist,
      ...(b.hito ? { hito: true } : {}),
      orden: hermanas.length ? Math.min(...hermanas.map(t => t.orden)) - 1 : 0,   // entra arriba de su columna
      autor: SES().nombre ? SES().nombre() : "", autor_email: SES().email ? SES().email() : "",
    };
    const boton = caja().querySelector('[data-accion="crear"]'); if (boton) boton.disabled = true;
    try {
      const r = await fetch(url("tareas"), { method: "POST", headers: head({ Prefer: "return=representation" }), body: JSON.stringify(cuerpo) });
      const d = r.ok ? await r.json() : [];
      if (!d.length) throw new Error("sin fila");
      const t = Object.assign(d[0], { checklist: Array.isArray(d[0].checklist) ? d[0].checklist : [] });
      TAREAS.push(t);
      BORRADOR = null; ABIERTA = t.id;
      nota("Tarea creada.");
      pintar(); marcarNav(contarMias());
    } catch (e) {
      if (boton) boton.disabled = false;
      nota("No se pudo crear la tarea. Revisá la conexión y probá de nuevo.", true);
    }
  }

  async function borrarTarea(id) {
    const t = TAREAS.find(x => x.id === id); if (!t) return;
    if (!confirm(`¿Eliminar la tarea "${t.titulo}"?\n\nSe borran también su checklist y sus comentarios.`)) return;
    try {
      const r = await fetch(url(`tareas?id=eq.${enc(id)}`), { method: "DELETE", headers: head({ Prefer: "return=representation" }) });
      const d = r.ok ? await r.json() : [];
      if (!d.length) throw new Error("sin permiso");
      TAREAS = TAREAS.filter(x => x.id !== id); delete COMS[id];
      ABIERTA = null; nota("Tarea eliminada.");
      pintar(); marcarNav(contarMias());
    } catch (e) { nota("No se pudo eliminar. Sólo puede hacerlo quien la creó o un admin.", true); }
  }

  async function comentar(id) {
    const campo = caja().querySelector(".tk-com-nuevo");
    const texto = campo ? campo.value.trim() : "";
    if (!texto) return;
    campo.disabled = true;
    try {
      const r = await fetch(url("tareas_comentarios"), {
        method: "POST", headers: head({ Prefer: "return=representation" }),
        body: JSON.stringify({ tarea_id: id, texto, autor: SES().nombre ? SES().nombre() : "", autor_email: SES().email ? SES().email() : "" }),
      });
      const d = r.ok ? await r.json() : [];
      if (!d.length) throw new Error("sin fila");
      (COMS[id] = COMS[id] || []).push(d[0]);
      pintarPanel(); pintarCuerpo();
    } catch (e) {
      campo.disabled = false;
      nota("No se pudo guardar el comentario.", true);
    }
  }

  async function borrarComentario(tareaId, cid) {
    if (!confirm("¿Borrar este comentario?")) return;
    const r = await fetch(url(`tareas_comentarios?id=eq.${enc(cid)}`), { method: "DELETE", headers: head({ Prefer: "return=representation" }) }).catch(() => null);
    const d = r && r.ok ? await r.json() : [];
    if (!d.length) return nota("No se pudo borrar el comentario.", true);
    COMS[tareaId] = (COMS[tareaId] || []).filter(c => c.id !== cid);
    pintarPanel(); pintarCuerpo();
  }

  /* ---- Panel: abrir / nueva / cerrar ---- */
  const tareaAbierta = () => ABIERTA === "nueva" ? BORRADOR : TAREAS.find(x => x.id === ABIERTA);

  function abrir(id) {
    if (ABIERTA === "nueva" && !descartarBorrador()) return;
    ABIERTA = id; BORRADOR = null;
    pintarPanel(); pintarCuerpo();
  }
  function nueva(def) {
    if (ABIERTA === "nueva" && !descartarBorrador()) return;
    const enEquipo = EQUIPO.some(p => low(p.email) === yo());
    BORRADOR = {
      id: null, titulo: "", descripcion: "", estado: def.estado || "pendiente", prioridad: "media",
      area: AREA || "", responsable_email: PERSONA || (enEquipo ? yo() : null),
      fecha_limite: def.fecha || null, checklist: [], hito: false, creado: null,
    };
    ABIERTA = "nueva";
    pintarPanel(); pintarCuerpo();
    const t = caja().querySelector(".tk-p-titulo"); if (t) t.focus();
  }
  function descartarBorrador() {
    const t = caja() && caja().querySelector(".tk-p-titulo");
    const escrito = (t && t.value.trim()) || (BORRADOR && (BORRADOR.descripcion || BORRADOR.checklist.length));
    return !escrito || confirm("¿Descartar la tarea que estabas creando?");
  }
  function cerrar() {
    if (!ABIERTA) return;
    if (ABIERTA === "nueva" && !descartarBorrador()) return;
    ABIERTA = null; BORRADOR = null;
    pintarPanel(); pintarCuerpo();
  }
  // Un solo camino para editar: si es un borrador queda en memoria, si no va a la base.
  function guardar(campos) {
    if (ABIERTA === "nueva") { Object.assign(BORRADOR, campos); return Promise.resolve(true); }
    return guardarTarea(ABIERTA, campos);
  }

  /* ---- Pintar ---- */
  function esqueleto() {
    caja().innerHTML = `
      <div class="tk-bar">
        <div class="tk-bar-fila">
          <div class="tk-vistas" role="tablist">
            ${[["tablero", "▦ Tablero"], ["lista", "☰ Lista"], ["calendario", "📅 Calendario"]].map(([k, t]) =>
              `<button data-accion="vista" data-k="${k}" role="tab">${t}</button>`).join("")}
          </div>
          <input class="tk-busca" type="search" placeholder="Buscar tarea…" autocomplete="off" aria-label="Buscar tarea">
          <select class="tk-sel" data-f="persona" aria-label="Responsable"></select>
          <select class="tk-sel" data-f="area" aria-label="Área"></select>
          <button class="btn-primary tk-nueva" data-accion="nueva">＋ Nueva tarea</button>
        </div>
        <div class="tk-bar-fila tk-fila-2">
          <div class="tk-chips"></div>
          <span class="tk-nota" role="status"></span>
        </div>
      </div>
      <div class="tk-cuerpo"></div>
      <div class="tk-panel-wrap"></div>`;
  }

  function pintar() { pintarBarra(); pintarCuerpo(); pintarPanel(); }

  function pintarBarra() {
    const c = caja(); if (!c || !c.querySelector(".tk-bar")) return;
    c.querySelectorAll(".tk-vistas button").forEach(b => {
      b.classList.toggle("on", b.dataset.k === VISTA);
      b.setAttribute("aria-selected", b.dataset.k === VISTA);
    });
    const selP = c.querySelector('[data-f="persona"]');
    if (PERSONA && !EQUIPO.some(p => low(p.email) === PERSONA)) PERSONA = "";
    selP.innerHTML = `<option value="">Todo el equipo</option>` +
      EQUIPO.map(p => `<option value="${esc(low(p.email))}">${esc(p.nombre)}${low(p.email) === yo() ? " (vos)" : ""}</option>`).join("");
    selP.value = PERSONA;
    const selA = c.querySelector('[data-f="area"]');
    const ar = areas();
    if (AREA && !ar.includes(AREA)) AREA = "";
    selA.innerHTML = `<option value="">Todas las áreas</option>` + ar.map(a => `<option>${esc(a)}</option>`).join("");
    selA.value = AREA;
    const b = base();
    c.querySelector(".tk-chips").innerHTML = FILTROS.map(f => {
      const n = f.k === "todas" ? b.filter(abierta).length : b.filter(f.f).length;
      return `<button class="tk-chip ${f.k} ${FILTRO === f.k ? "on" : ""}" data-accion="filtro" data-k="${f.k}">${f.t} <span class="c">${n}</span></button>`;
    }).join("");
    pintarNota();
  }

  function pintarCuerpo() {
    const c = caja() && caja().querySelector(".tk-cuerpo"); if (!c) return;
    if (ERROR === "sql") {
      c.innerHTML = `<div class="empty"><div class="big">🗂</div>Faltan las tablas de Tareas en Supabase.<br>
        <small>Corré <code>supabase/sql/2026-09-15-tareas.sql</code> en el SQL Editor y recargá la página.</small></div>`;
      return;
    }
    if (!CARGADO) {
      c.innerHTML = ERROR ? `<div class="empty">No se pudieron traer las tareas. Revisá la conexión y recargá.</div>`
                          : `<div class="empty-mini">Cargando tareas…</div>`;
      return;
    }
    const ts = visibles();
    const intro = !TAREAS.length
      ? `<div class="res-intro">Todavía no hay tareas. Creá la primera con <b>＋ Nueva tarea</b>: asignale responsable, fecha y prioridad, y movela de columna a medida que avanza.</div>`
      : "";
    c.innerHTML = intro + (VISTA === "lista" ? listaHTML(ts) : VISTA === "calendario" ? calendarioHTML(ts) : tableroHTML(ts));
  }

  function avatarHTML(email) {
    if (!email) return `<span class="tk-avatar vacio" title="Sin responsable">?</span>`;
    const n = nombreDe(email);
    return `<span class="tk-avatar ${low(email) === yo() ? "yo" : ""}" title="${esc(n)}">${esc(iniciales(n))}</span>`;
  }
  const areaHTML = a => a ? `<span class="tk-area" style="--h:${tono(a)}">${esc(a)}</span>` : "";

  function tarjetaHTML(t) {
    const v = vence(t);
    const n = t.checklist.length, ok = t.checklist.filter(x => x.ok).length;
    const nc = (COMS[t.id] || []).length;
    const tags = (t.prioridad === "alta" && abierta(t) ? `<span class="tk-prio alta">Alta</span>` : "") + areaHTML(t.area);
    return `<article class="tk-card p-${esc(t.prioridad)} ${abierta(t) ? "" : "hecha"} ${t.hito ? "hito" : ""} ${ABIERTA === t.id ? "abierta" : ""}"
        draggable="true" data-drag="${t.id}" data-abrir="${t.id}" tabindex="0">
      ${tags ? `<div class="tk-card-tags">${tags}</div>` : ""}
      <h4 class="tk-card-t">${t.hito ? `<span class="tk-hito" title="Hito" aria-label="Hito">★</span>` : ""}${esc(t.titulo) || "<i>Sin título</i>"}</h4>
      <div class="tk-card-pie">
        ${v ? `<span class="tk-vence ${v.c}">${esc(v.t)}</span>` : ""}
        ${n ? `<span class="tk-meta ${ok === n ? "completo" : ""}" title="Checklist">☑ ${ok}/${n}</span>` : ""}
        ${nc ? `<span class="tk-meta" title="Comentarios">💬 ${nc}</span>` : ""}
        ${avatarHTML(t.responsable_email)}
      </div>
    </article>`;
  }

  // Lo terminado hace más de DIAS_HECHAS se esconde salvo que se pida verlo:
  // si no, la columna Hecha crece para siempre y tapa lo que importa.
  function recortarHechas(lista) {
    const orden = lista.slice().sort((a, b) => String(b.completada || "").localeCompare(String(a.completada || "")));
    if (VER_HECHAS) return { lista: orden, ocultas: 0 };
    const lim = Date.now() - DIAS_HECHAS * 864e5;
    const rec = orden.filter(t => !t.completada || Date.parse(t.completada) >= lim);
    return { lista: rec, ocultas: orden.length - rec.length };
  }

  function tableroHTML(ts) {
    return `<div class="tk-tablero">${ESTADOS.map(e => {
      let col = ts.filter(t => t.estado === e.k), ocultas = 0;
      if (e.k === "hecha") ({ lista: col, ocultas } = recortarHechas(col));
      else col.sort(porOrden);
      const verMas = e.k === "hecha" && (ocultas || VER_HECHAS)
        ? `<button class="tk-ver-hechas" data-accion="ver-hechas">${VER_HECHAS ? "Ver sólo las últimas 2 semanas" : `Ver ${ocultas} anterior${ocultas === 1 ? "" : "es"}`}</button>` : "";
      return `<section class="tk-col e-${e.k}">
        <header class="tk-col-h">
          <span class="tk-dot e-${e.k}"></span><span class="t">${e.t}</span><span class="c">${col.length}</span>
          ${e.k !== "hecha" ? `<button class="tk-col-mas" data-accion="nueva" data-estado="${e.k}" title="Nueva tarea en ${e.t}" aria-label="Nueva tarea en ${e.t}">＋</button>` : ""}
        </header>
        <div class="tk-col-cuerpo" data-zona-estado="${e.k}">
          ${col.map(tarjetaHTML).join("") || `<div class="tk-col-vacia">${e.k === "hecha" ? "Arrastrá acá lo terminado" : "Nada por acá"}</div>`}
        </div>
        ${verMas}
      </section>`;
    }).join("")}</div>`;
  }

  function listaHTML(ts) {
    if (!ts.length) return TAREAS.length ? sinResultados() : "";
    const d = t => diasHasta(t.fecha_limite);
    const GRUPOS = [
      { k: "vencidas", t: "Vencidas",        f: t => abierta(t) && t.fecha_limite && d(t) < 0 },
      { k: "hoy",      t: "Hoy",             f: t => abierta(t) && t.fecha_limite && d(t) === 0 },
      { k: "semana",   t: "Próximos 7 días", f: t => abierta(t) && t.fecha_limite && d(t) > 0 && d(t) <= 7 },
      { k: "despues",  t: "Más adelante",    f: t => abierta(t) && t.fecha_limite && d(t) > 7 },
      { k: "sinfecha", t: "Sin fecha",       f: t => abierta(t) && !t.fecha_limite },
      { k: "hechas",   t: "Hechas",          f: t => !abierta(t) },
    ];
    const orden = (a, b) => String(a.fecha_limite || "").localeCompare(String(b.fecha_limite || "")) ||
      (PRIO_PESO[a.prioridad] - PRIO_PESO[b.prioridad]) || porOrden(a, b);
    return `<div class="tk-lista">${GRUPOS.map(g => {
      let filas = ts.filter(g.f), ocultas = 0;
      if (g.k === "hechas") ({ lista: filas, ocultas } = recortarHechas(filas));
      else filas.sort(orden);
      if (!filas.length && !ocultas) return "";
      return `<section class="tk-grupo g-${g.k}">
        <h3 class="tk-grupo-h">${g.t} <span class="c">${filas.length}</span></h3>
        ${filas.map(filaHTML).join("")}
        ${g.k === "hechas" && (ocultas || VER_HECHAS) ? `<button class="tk-ver-hechas" data-accion="ver-hechas">${VER_HECHAS ? "Ver sólo las últimas 2 semanas" : `Ver ${ocultas} anterior${ocultas === 1 ? "" : "es"}`}</button>` : ""}
      </section>`;
    }).join("")}</div>`;
  }

  function filaHTML(t) {
    const v = vence(t);
    const n = t.checklist.length, ok = t.checklist.filter(x => x.ok).length;
    const nc = (COMS[t.id] || []).length;
    const prio = PRIORIDADES.find(p => p.k === t.prioridad) || PRIORIDADES[1];
    return `<div class="tk-fila p-${esc(t.prioridad)} ${abierta(t) ? "" : "hecha"} ${ABIERTA === t.id ? "abierta" : ""}" data-abrir="${t.id}" tabindex="0">
      <input type="checkbox" class="tk-fila-ok" data-accion="hecha" data-id="${t.id}" ${abierta(t) ? "" : "checked"}
        title="${abierta(t) ? "Marcar como hecha" : "Volver a abrir"}" aria-label="Marcar como hecha">
      <div class="tk-fila-t">
        <b>${t.hito ? `<span class="tk-hito" title="Hito" aria-label="Hito">★</span>` : ""}${esc(t.titulo) || "<i>Sin título</i>"}</b>
        <span class="tk-fila-meta">${areaHTML(t.area)}${n ? `<span class="tk-meta ${ok === n ? "completo" : ""}">☑ ${ok}/${n}</span>` : ""}${nc ? `<span class="tk-meta">💬 ${nc}</span>` : ""}</span>
      </div>
      <span class="tk-estado e-${esc(t.estado)}"><span class="tk-dot e-${esc(t.estado)}"></span>${estadoT(t.estado)}</span>
      <span class="tk-prio ${esc(t.prioridad)}">${prio.t}</span>
      <span class="tk-vence ${v ? v.c : ""}">${v ? esc(v.t) : "—"}</span>
      <span class="tk-resp">${avatarHTML(t.responsable_email)}<span>${esc(nombreDe(t.responsable_email) || "Sin asignar")}</span></span>
    </div>`;
  }

  function sinResultados() {
    return `<div class="empty">Ninguna tarea coincide con lo que estás filtrando.<br>
      <button class="btn-ghost tk-limpiar" data-accion="limpiar">Limpiar filtros</button></div>`;
  }

  function calendarioHTML(ts) {
    const [y, m] = CALMES.split("-").map(Number);
    const primero = new Date(y, m - 1, 1);
    const offset = (primero.getDay() + 6) % 7;                 // la semana arranca el lunes
    const diasMes = new Date(y, m, 0).getDate();
    const celdas = Math.ceil((offset + diasMes) / 7) * 7;
    const hoy = hoyISO();
    const porDia = {};
    ts.forEach(t => { if (t.fecha_limite) (porDia[t.fecha_limite] = porDia[t.fecha_limite] || []).push(t); });
    const chip = t => `<div class="tk-cal-chip p-${esc(t.prioridad)} ${abierta(t) ? "" : "hecha"} ${t.hito ? "hito" : ""} ${abierta(t) && t.fecha_limite && diasHasta(t.fecha_limite) < 0 ? "vencida" : ""} ${ABIERTA === t.id ? "abierta" : ""}"
        draggable="true" data-drag="${t.id}" data-abrir="${t.id}" tabindex="0" title="${esc(t.titulo)} · ${esc(nombreDe(t.responsable_email) || "sin responsable")}">
        ${avatarHTML(t.responsable_email)}${t.hito ? `<span class="tk-hito" title="Hito" aria-label="Hito">★</span>` : ""}<span>${esc(t.titulo) || "Sin título"}</span></div>`;
    let grilla = "";
    for (let i = 0; i < celdas; i++) {
      const d = new Date(y, m - 1, 1 - offset + i);
      const iso = isoDe(d);
      const lista = (porDia[iso] || []).sort((a, b) => (abierta(b) - abierta(a)) || (PRIO_PESO[a.prioridad] - PRIO_PESO[b.prioridad]));
      grilla += `<div class="tk-dia ${d.getMonth() !== m - 1 ? "fuera" : ""} ${iso === hoy ? "hoy" : ""} ${lista.length ? "" : "vacio"}" data-zona-dia="${iso}">
        <div class="tk-dia-h"><span class="n">${d.getDate()}</span><span class="dow">${DOW[i % 7]} · ${MES_CORTO[d.getMonth()]}</span>
          <button class="tk-dia-mas" data-accion="nueva" data-fecha="${iso}" title="Nueva tarea para el ${d.getDate()}/${d.getMonth() + 1}" aria-label="Nueva tarea para este día">＋</button></div>
        ${lista.map(chip).join("")}
      </div>`;
    }
    const sinFecha = ts.filter(t => !t.fecha_limite && abierta(t)).sort(porOrden);
    const delMes = ts.filter(t => t.fecha_limite && t.fecha_limite.slice(0, 7) === CALMES);
    return `<div class="tk-cal">
      <div class="tk-cal-nav">
        <button class="btn-ghost" data-accion="cal-mover" data-d="-1" aria-label="Mes anterior">‹</button>
        <h3>${cap(MES_NOMBRE[m - 1])} ${y}</h3>
        <button class="btn-ghost" data-accion="cal-mover" data-d="1" aria-label="Mes siguiente">›</button>
        ${CALMES !== hoy.slice(0, 7) ? `<button class="btn-ghost" data-accion="cal-hoy">Hoy</button>` : ""}
        <span class="tk-cal-res">${delMes.length} tarea${delMes.length === 1 ? "" : "s"} con fecha este mes<span class="tk-solo-mouse"> · arrastrá una a otro día para cambiarle la fecha</span></span>
      </div>
      <div class="tk-cal-dows">${DOW.map(x => `<span>${x}</span>`).join("")}</div>
      <div class="tk-cal-grid">${grilla}</div>
      ${!delMes.length ? `<div class="tk-cal-vacio">No hay tareas con fecha en ${MES_NOMBRE[m - 1]}.</div>` : ""}
      ${sinFecha.length ? `<div class="tk-sinfecha"><h4>Sin fecha <span class="c">${sinFecha.length}</span></h4>
        <p class="tk-solo-mouse">Arrastrá una a un día del calendario para ponerle fecha.</p><div class="tk-sinfecha-l">${sinFecha.map(chip).join("")}</div></div>` : ""}
    </div>`;
  }

  function pintarPanel() {
    const c = caja(); const w = c && c.querySelector(".tk-panel-wrap"); if (!w) return;
    const t = tareaAbierta();
    if (!t) { ABIERTA = null; w.innerHTML = ""; document.body.classList.remove("tk-panel-abierto"); return; }
    document.body.classList.add("tk-panel-abierto");
    const nuevo = ABIERTA === "nueva";
    const n = t.checklist.length, ok = t.checklist.filter(x => x.ok).length;
    const coms = COMS[t.id] || [];
    const v = vence(t);
    const puedeBorrar = !nuevo && (esAdmin() || low(t.autor_email) === yo());
    const resp = low(t.responsable_email);
    const opcResp = `<option value="">Sin asignar</option>` +
      EQUIPO.map(p => `<option value="${esc(low(p.email))}" ${low(p.email) === resp ? "selected" : ""}>${esc(p.nombre)}${low(p.email) === yo() ? " (vos)" : ""}</option>`).join("") +
      (resp && !EQUIPO.some(p => low(p.email) === resp) ? `<option value="${esc(resp)}" selected>${esc(resp)} (ya no está en el equipo)</option>` : "");
    const miCom = x => esAdmin() || low(x.autor_email) === yo();
    // Re-pintar la MISMA tarea (tildar un paso, el refresco) no puede mover el scroll
    // ni repetir la animación de entrada: el próximo clic caería en otro lado.
    const previo = w.querySelector(".tk-panel");
    const misma = previo && previo.dataset.id === String(ABIERTA);
    const scroll = misma ? previo.scrollTop : 0;

    w.innerHTML = `
      <div class="tk-velo" data-accion="cerrar"></div>
      <aside class="tk-panel ${misma ? "quieto" : ""}" data-id="${esc(ABIERTA)}" role="dialog" aria-label="${nuevo ? "Tarea nueva" : "Detalle de la tarea"}">
        <div class="tk-p-top">
          <span class="tk-eyebrow">${nuevo ? "Tarea nueva" : "Tarea"}</span>
          <button class="tk-estrella ${t.hito ? "on" : ""}" data-accion="hito" aria-pressed="${t.hito ? "true" : "false"}"
            title="${t.hito ? "Es un hito — tocá para quitarlo" : "Marcar como hito"}">${t.hito ? "★" : "☆"} Hito</button>
          <button class="tk-x" data-accion="cerrar" aria-label="Cerrar">✕</button>
        </div>
        <textarea class="tk-p-titulo" data-campo="titulo" rows="1" placeholder="¿Qué hay que hacer?">${esc(t.titulo)}</textarea>
        <div class="tk-p-estados" role="group" aria-label="Estado">
          ${ESTADOS.map(e => `<button class="${t.estado === e.k ? "on" : ""} e-${e.k}" data-accion="estado" data-k="${e.k}"><span class="tk-dot e-${e.k}"></span>${e.t}</button>`).join("")}
        </div>
        <div class="tk-p-campos">
          <label><span>Responsable</span><select data-campo="responsable_email">${opcResp}</select></label>
          <label><span>Vence</span><input type="date" data-campo="fecha_limite" value="${esc(t.fecha_limite || "")}"></label>
          <label><span>Prioridad</span><select data-campo="prioridad">${PRIORIDADES.map(p => `<option value="${p.k}" ${t.prioridad === p.k ? "selected" : ""}>${p.t}</option>`).join("")}</select></label>
          <label><span>Área</span><select data-campo="area"><option value="">Sin área</option>${areas().map(a =>
            `<option ${t.area === a ? "selected" : ""}>${esc(a)}</option>`).join("")}</select></label>
        </div>
        ${v && v.c ? `<div class="tk-p-vence ${v.c}">${v.c === "vencida" ? "⚠ " : ""}${cap(v.t)}</div>` : ""}

        <div class="tk-p-sec">
          <div class="tk-p-sec-h"><span>Descripción</span></div>
          <textarea class="tk-p-desc" data-campo="descripcion" rows="3" placeholder="Contexto, links, lo que haga falta saber…">${esc(t.descripcion)}</textarea>
        </div>

        <div class="tk-p-sec">
          <div class="tk-p-sec-h"><span>Checklist</span>
            ${n ? `<span class="c">${ok}/${n}</span><span class="tk-barra"><span style="width:${Math.round(ok / n * 100)}%"></span></span>` : ""}</div>
          <ul class="tk-check">${t.checklist.map((x, i) => `<li class="${x.ok ? "ok" : ""}">
            <input type="checkbox" data-accion="check-toggle" data-i="${i}" ${x.ok ? "checked" : ""} aria-label="Hecho">
            <input class="tk-check-t" data-check-i="${i}" value="${esc(x.t)}" aria-label="Paso">
            <button class="tk-mini" data-accion="check-del" data-i="${i}" title="Quitar paso" aria-label="Quitar paso">✕</button></li>`).join("")}</ul>
          <input class="tk-check-nuevo" placeholder="＋ Agregar un paso y Enter" autocomplete="off">
        </div>

        ${nuevo ? `
        <div class="tk-p-crear">
          <button class="btn-primary" data-accion="crear">Crear tarea</button>
          <button class="btn-ghost" data-accion="cerrar">Cancelar</button>
        </div>` : `
        <div class="tk-p-sec">
          <div class="tk-p-sec-h"><span>Comentarios</span>${coms.length ? `<span class="c">${coms.length}</span>` : ""}</div>
          <div class="tk-coms">${coms.map(x => `<div class="tk-com">
              <div class="tk-com-h">${avatarHTML(x.autor_email)}<b>${esc(x.autor || nombreDe(x.autor_email))}</b><span>${hace(x.creado)}</span>
                ${miCom(x) ? `<button class="tk-mini" data-accion="com-del" data-id="${x.id}" title="Borrar comentario" aria-label="Borrar comentario">✕</button>` : ""}</div>
              <p>${esc(x.texto).replace(/\n/g, "<br>")}</p>
            </div>`).join("") || `<p class="tk-vacio-mini">Todavía no hay comentarios.</p>`}</div>
          <textarea class="tk-com-nuevo" rows="2" placeholder="Escribí un comentario…  (⌘/Ctrl + Enter para enviar)"></textarea>
          <div class="tk-com-acc"><button class="btn-ghost" data-accion="comentar">Comentar</button></div>
        </div>
        <div class="tk-p-pie">
          <span>Creada por ${esc(t.autor || "—")} · ${hace(t.creado)}${t.completada ? ` · terminada ${hace(t.completada)}` : ""}</span>
          ${puedeBorrar ? `<button class="tk-borrar" data-accion="borrar">Eliminar tarea</button>` : ""}
        </div>`}
      </aside>`;
    w.querySelectorAll("textarea").forEach(crecer);
    if (scroll) w.querySelector(".tk-panel").scrollTop = scroll;
  }
  const crecer = el => { el.style.height = "auto"; el.style.height = el.scrollHeight + 2 + "px"; };

  /* ---- Checklist ---- */
  function cambiarChecklist(fn) {
    const t = tareaAbierta(); if (!t) return;
    const lista = t.checklist.map(x => Object.assign({}, x));
    fn(lista);
    if (ABIERTA === "nueva") { BORRADOR.checklist = lista; pintarPanel(); return Promise.resolve(); }
    const p = guardarTarea(ABIERTA, { checklist: lista });
    pintarPanel();
    return p;
  }

  /* ---- Eventos (se enganchan una sola vez sobre #tareas) ---- */
  const ACCIONES = {
    vista: a => { VISTA = a.dataset.k; escribir("tareas_vista", VISTA); pintarBarra(); pintarCuerpo(); },
    filtro: a => { FILTRO = FILTRO === a.dataset.k ? "todas" : a.dataset.k; pintarBarra(); pintarCuerpo(); },
    limpiar: () => {
      FILTRO = "todas"; PERSONA = ""; AREA = ""; BUSCA = "";
      const b = caja().querySelector(".tk-busca"); if (b) b.value = "";
      pintarBarra(); pintarCuerpo();
    },
    nueva: a => nueva({ estado: a.dataset.estado, fecha: a.dataset.fecha }),
    cerrar: () => cerrar(),
    crear: () => crearTarea(),
    borrar: () => borrarTarea(ABIERTA),
    estado: a => { guardar({ estado: a.dataset.k }); pintarPanel(); },
    hito: () => { const t = tareaAbierta(); if (!t) return; guardar({ hito: !t.hito }); pintarPanel(); },
    hecha: a => {
      const t = TAREAS.find(x => x.id === a.dataset.id); if (!t) return;
      guardarTarea(t.id, { estado: abierta(t) ? "hecha" : "pendiente" }).then(() => { if (ABIERTA === t.id) pintarPanel(); });
    },
    "ver-hechas": () => { VER_HECHAS = !VER_HECHAS; pintarCuerpo(); },
    "cal-mover": a => {
      const [y, m] = CALMES.split("-").map(Number);
      const d = new Date(y, m - 1 + Number(a.dataset.d), 1);
      CALMES = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; pintarCuerpo();
    },
    "cal-hoy": () => { CALMES = hoyISO().slice(0, 7); pintarCuerpo(); },
    "check-toggle": a => cambiarChecklist(l => { const x = l[+a.dataset.i]; if (x) x.ok = !x.ok; }),
    "check-del": a => cambiarChecklist(l => l.splice(+a.dataset.i, 1)),
    comentar: () => comentar(ABIERTA),
    "com-del": a => borrarComentario(ABIERTA, a.dataset.id),
  };

  function agregarPaso(input) {
    const texto = input.value.trim(); if (!texto) return;
    input.value = "";
    cambiarChecklist(l => l.push({ t: texto, ok: false }));
    const nuevo = caja().querySelector(".tk-check-nuevo"); if (nuevo) nuevo.focus();
  }

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
      if (el.dataset.f === "persona") { PERSONA = el.value; pintarBarra(); pintarCuerpo(); return; }
      if (el.dataset.f === "area") { AREA = el.value; pintarBarra(); pintarCuerpo(); return; }
      if (el.dataset.checkI != null) {
        const i = +el.dataset.checkI, texto = el.value.trim();
        cambiarChecklist(l => { if (!l[i]) return; if (texto) l[i].t = texto; else l.splice(i, 1); });
        return;
      }
      const campo = el.dataset.campo; if (!campo) return;
      let valor = el.value;
      if (campo === "titulo") valor = valor.trim();
      if (campo === "titulo" && !valor && ABIERTA !== "nueva") {
        const t = tareaAbierta(); el.value = t ? t.titulo : "";
        return nota("El título no puede quedar vacío.", true);
      }
      if ((campo === "fecha_limite" || campo === "responsable_email") && !valor) valor = null;
      // Sin re-pintar el panel: si no, se pierde el foco del campo al que saltaste.
      guardar({ [campo]: valor }).then(() => {
        if (campo === "fecha_limite" && ABIERTA) {
          const t = tareaAbierta(), aviso = c.querySelector(".tk-p-vence"), v = t && vence(t);
          if (aviso) { aviso.className = `tk-p-vence ${v ? v.c : ""}`; aviso.textContent = v && v.c ? (v.c === "vencida" ? "⚠ " : "") + cap(v.t) : ""; }
        }
      });
    });

    c.addEventListener("input", ev => {
      const el = ev.target;
      if (el.classList.contains("tk-busca")) { BUSCA = el.value; pintarBarra(); pintarCuerpo(); return; }
      if (el.tagName === "TEXTAREA") crecer(el);
    });

    c.addEventListener("keydown", ev => {
      const el = ev.target;
      if (el.classList.contains("tk-check-nuevo") && ev.key === "Enter") { ev.preventDefault(); agregarPaso(el); return; }
      if (el.classList.contains("tk-check-t") && ev.key === "Enter") { ev.preventDefault(); el.blur(); return; }
      if (el.classList.contains("tk-p-titulo") && ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        if (ABIERTA === "nueva") crearTarea(); else el.blur();
        return;
      }
      if (el.classList.contains("tk-com-nuevo") && ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); comentar(ABIERTA); return; }
      if (ev.key === "Enter" && el.dataset && el.dataset.abrir && !el.closest("[data-accion]")) { ev.preventDefault(); abrir(el.dataset.abrir); }
    });

    /* Arrastrar: en el tablero cambia estado y posición; en el calendario, la fecha.
       Es drag-and-drop nativo (sólo escritorio): en el celular se hace desde el panel. */
    const zonaDe = el => el.closest("[data-zona-estado],[data-zona-dia]");
    c.addEventListener("dragstart", ev => {
      const d = ev.target.closest("[data-drag]"); if (!d) return;
      ARRASTRA = d.dataset.drag;
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", ARRASTRA);
      requestAnimationFrame(() => d.classList.add("arrastrando"));
    });
    c.addEventListener("dragend", () => {
      ARRASTRA = "";
      c.querySelectorAll(".arrastrando,.sobre").forEach(x => x.classList.remove("arrastrando", "sobre"));
    });
    c.addEventListener("dragover", ev => {
      if (!ARRASTRA) return;
      const z = zonaDe(ev.target); if (!z) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      c.querySelectorAll(".sobre").forEach(x => { if (x !== z) x.classList.remove("sobre"); });
      z.classList.add("sobre");
    });
    c.addEventListener("dragleave", ev => {
      const z = zonaDe(ev.target);
      if (z && !z.contains(ev.relatedTarget)) z.classList.remove("sobre");
    });
    c.addEventListener("drop", ev => {
      const z = zonaDe(ev.target); if (!z || !ARRASTRA) return;
      ev.preventDefault();
      const id = ARRASTRA, t = TAREAS.find(x => x.id === id);
      z.classList.remove("sobre");
      if (!t) return;
      if (z.dataset.zonaDia) {
        if (t.fecha_limite !== z.dataset.zonaDia) guardarTarea(id, { fecha_limite: z.dataset.zonaDia }).then(ok => { if (ok && ABIERTA === id) pintarPanel(); });
        return;
      }
      const estado = z.dataset.zonaEstado;
      if (estado === "hecha") { if (t.estado !== "hecha") guardarTarea(id, { estado }).then(ok => { if (ok && ABIERTA === id) pintarPanel(); }); return; }
      // Posición: antes de la primera tarjeta cuya mitad queda debajo del puntero.
      const cards = [...z.querySelectorAll("[data-drag]")].filter(x => x.dataset.drag !== id);
      const idx = cards.findIndex(x => { const r = x.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
      const vecina = i => TAREAS.find(x => x.id === (cards[i] && cards[i].dataset.drag));
      const antes = vecina(idx === -1 ? cards.length - 1 : idx - 1), despues = idx === -1 ? null : vecina(idx);
      const orden = antes && despues ? (antes.orden + despues.orden) / 2
                  : antes ? antes.orden + 1 : despues ? despues.orden - 1 : 0;
      if (t.estado === estado && t.orden === orden) return;
      guardarTarea(id, { estado, orden }).then(ok => { if (ok && ABIERTA === id) pintarPanel(); });
    });

    document.addEventListener("keydown", ev => {
      const sec = $("#page-tareas");
      if (ev.key === "Escape" && ABIERTA && sec && !sec.classList.contains("hidden")) cerrar();
    });
  }

  /* ---- Refresco suave: trae los cambios del resto sin pisar lo que estás escribiendo ---- */
  function arrancarRefresco() {
    if (TIMER) return;
    TIMER = setInterval(async () => {
      const sec = $("#page-tareas");
      if (!sec || sec.classList.contains("hidden") || document.hidden || ARRASTRA || ABIERTA === "nueva") return;
      const foco = document.activeElement;
      if (foco && caja().contains(foco) && /^(INPUT|TEXTAREA|SELECT)$/.test(foco.tagName)) return;
      await traer(); pintar();
    }, 30000);
  }

  window.renderTareas = async function () {
    const c = caja(); if (!c) return;
    if (!c.querySelector(".tk-bar")) esqueleto();
    enganchar();
    pintar();
    await traer();
    pintar();
    arrancarRefresco();
  };
})();
