/* ============================================================================
   MÓDULO CONTENIDOS — cronograma de la comunidad profesional de WhatsApp.

   Dos lecturas del MISMO mes, sin duplicar datos:
     · CALENDARIO → la grilla del mes, para ver el ritmo y qué falta cerrar.
     · FICHAS     → el formato largo: el copy tal cual se manda, más imagen,
                    link, CTA, notas, encuestas y variantes adaptativas.

   Quién hace qué (el permiso REAL lo aplica Supabase por RLS, esto sólo
   decide qué botones se dibujan — ver 2026-08-31-contenidos.sql):
     · admin / líder / coordinación → editan, comentan y aprueban
     · representante de marca       → lee y comenta

   Vive en un archivo aparte, igual que Fichas técnicas: app.js es una IIFE y
   el único contacto es window.LEUK_SESION.
   ========================================================================== */
(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const SES = () => window.LEUK_SESION || {};
  const url = p => `${SES().sbUrl}/rest/v1/${p}`;
  const head = extra => Object.assign({}, SES().head ? SES().head() : {}, extra || {});
  const puedeEditar = () => !!(SES().puedeEditarContenidos && SES().puedeEditarContenidos());

  /* ---- Canales ----------------------------------------------------------
     Un cronograma por canal, con la MISMA maquinaria: mes → piezas → estados
     → comentarios → sugerencias → avisos. Lo único que cambia por canal son
     las palabras y en qué contenedor se dibuja. La página la elige app.js y
     nos pasa el canal: acá no se navega.
     Sumar LinkedIn = una entrada acá + la página en app.js e index.html.     */
  const CANALES = {
    whatsapp: {
      label: "Comunidad de WhatsApp", corto: "WhatsApp", icono: "💬",
      caja: "#contenidos", pagina: "contenidos",
      unidad: "mensaje", art: "un", unidadPl: "mensajes", nuevo: "Nuevo mensaje",
      eyebrow: m => `Comunidad profesional de WhatsApp · ${cap(mesLabel(m))}`,
      lectura: "Podés leer todo el mes y dejar comentarios o sugerencias en cada mensaje. La edición y la aprobación las hace Coordinación.",
    },
    instagram: {
      label: "Instagram", corto: "Instagram", icono: "📸",
      caja: "#contenidos-ig", pagina: "contenidos-ig",
      unidad: "pieza", art: "una", unidadPl: "piezas", nuevo: "Pieza nueva",
      eyebrow: m => `Instagram · ${cap(mesLabel(m))}`,
      lectura: "Podés leer todo el mes y dejar comentarios o sugerencias en cada pieza. La edición y la aprobación las hace Coordinación.",
    },
  };

  /* ---- Estado en memoria ---- */
  let CANAL = "whatsapp";  // canal abierto; lo fija app.js al entrar a la página
  const C = () => CANALES[CANAL] || CANALES.whatsapp;
  const caja = () => $(C().caja);
  const enc = s => encodeURIComponent(s);
  const ULTIMO = {};     // canal -> último mes abierto, para volver donde estabas
  let MESES = [];        // [{mes, titulo, ...}] — para el selector
  let MES = "";          // mes abierto ('2026-09')
  let CAB = null;        // fila de contenidos_meses del mes abierto
  let MSGS = [];         // filas de contenidos, ordenadas
  let COMS = {};         // contenido_id -> [comentarios]
  let VISTA = "fichas";  // 'calendario' | 'fichas'
  let ABIERTOS = {};     // contenido_id -> true si el hilo de comentarios está desplegado
  let FOCO = "";         // ficha a resaltar al venir desde el calendario
  let FILTRO = "todos";  // recorte activo — responde "¿qué me falta mirar?"
  let TIMER = null;
  let PENDIENTE = null;  // {canal, id, mes} — aviso de otro canal, se abre al llegar
  let PLACA = {};        // contenido_id -> placa abierta en la ficha
  let PREV = [];         // piezas ya publicadas de meses anteriores (contexto del feed)
  let FEEDNOTA = "";     // qué pasó en el último arrastre, para no mover fechas a ciegas
  let CALNOTA = "";      // qué pieza se movió de día en el calendario, y a dónde
  let MOVIENDO = "";     // pieza "levantada" a mano: el próximo día que se toque es su fecha nueva

  const ESTADOS = {
    borrador: { t: "Borrador" },
    revision: { t: "En revisión" },
    cambios:  { t: "Cambios pedidos" },
    aprobado: { t: "Aprobado" },
  };
  // Los recortes salen de los datos: nadie tiene que mantener una lista de pendientes.
  const FILTROS = [
    { k: "todos",     t: "Todo",             f: () => true },
    { k: "abiertos",  t: "Sin aprobar",      f: m => m.estado !== "aprobado" },
    { k: "revisar",   t: "Esperando visto",  f: m => m.estado === "revision" },
    { k: "sugerido",  t: "Con sugerencias",  f: m => (COMS[m.id] || []).some(c => c.tipo === "sugerencia" && !c.decision) },
    { k: "comentado", t: "Con comentarios",  f: m => (COMS[m.id] || []).some(c => c.tipo !== "sugerencia" && !c.resuelto) },
    { k: "aviso",     t: "Con aviso",        f: m => !!m.flag },
    { k: "aprobado",  t: "Aprobados",        f: m => m.estado === "aprobado" },
  ];
  const filtroActivo = () => (FILTROS.find(x => x.k === FILTRO) || FILTROS[0]).f;

  const MES_NOMBRE = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                      "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const DIA_CORTO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  /* ---- Utilidades ---- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // 'YYYY-MM-DD' → Date local. Sin new Date(str): eso interpreta UTC y corre un día.
  const aFecha = s => { const p = String(s || "").split("-"); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); };
  const mesLabel = m => { const p = String(m || "").split("-"); return p.length < 2 ? m : `${MES_NOMBRE[(+p[1]) - 1] || ""} ${p[0]}`; };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  // Corta por palabra entera, no a la mitad: "…ambiente por" queda feo.
  const recorte = (s, n) => {
    s = String(s || "").trim();
    if (s.length <= n) return s;
    const c = s.slice(0, n);
    return c.slice(0, Math.max(c.lastIndexOf(" "), n - 12)).trim() + "…";
  };
  const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

  // Un cronograma se lee en relación a hoy: "en 3 días" dice más que "11/09".
  function cuando(iso) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const d = aFecha(iso); d.setHours(0, 0, 0, 0);
    const n = Math.round((d - hoy) / 864e5);
    if (n === 0) return { t: "hoy", c: "hoy" };
    if (n === 1) return { t: "mañana", c: "pronto" };
    if (n === -1) return { t: "ayer", c: "pasado" };
    if (n < 0) return { t: `hace ${-n} días`, c: "pasado" };
    return { t: `en ${n} días`, c: n <= 7 ? "pronto" : "" };
  }

  /* ---- Sugerencias sobre el copy (estilo Google Docs) -----------------------
     Una sugerencia apunta a un tramo del texto FUENTE (el que se guarda), no al
     HTML. Por eso todo acá traduce entre uno y otro:
       · el texto fuente se reconstruye leyendo los nodos de texto, salteando los
         marcados [data-virtual] (el texto propuesto, que todavía no existe en la
         fuente);
       · `original` se guarda además del offset, para poder re-anclar la
         sugerencia si el texto cambió abajo de ella.                          */
  const sugsDe = (m, campo) => (COMS[m.id] || [])
    .filter(c => c.tipo === "sugerencia" && c.campo === campo && !c.decision)
    .sort((a, b) => a.desde - b.desde);
  const sugsPendientes = m => (COMS[m.id] || []).filter(c => c.tipo === "sugerencia" && !c.decision);

  function caminante(cont) {
    return document.createTreeWalker(cont, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.parentElement && n.parentElement.closest("[data-virtual]"))
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
  }
  // Offset de (nodo, pos) dentro del texto fuente. -1 si el nodo no cuenta.
  function offsetFuente(cont, nodo, pos) {
    if (nodo.nodeType !== Node.TEXT_NODE) {
      // selección que arranca/termina en un borde de elemento
      const w0 = caminante(cont); let acc = 0, visto = false;
      while (w0.nextNode()) { if (w0.currentNode === nodo) { visto = true; break; } acc += w0.currentNode.data.length; }
      return visto ? acc : -1;
    }
    const w = caminante(cont); let acc = 0;
    while (w.nextNode()) {
      if (w.currentNode === nodo) return acc + pos;
      acc += w.currentNode.data.length;
    }
    return -1;
  }
  // El copy con las sugerencias pendientes incrustadas: viejo tachado, nuevo al lado.
  function copyConSugs(txt, sugs) {
    if (!sugs.length) return copyHTML(txt);
    let out = "", pos = 0;
    for (const g of sugs) {
      if (g.desde < pos || g.hasta > txt.length || txt.slice(g.desde, g.hasta) !== g.original) continue; // descolgada
      out += copyHTML(txt.slice(pos, g.desde));
      out += `<del class="ct-del" data-sug="${g.id}" title="Sugerencia de ${esc(g.autor || "")}">${esc(g.original)}</del>`;
      out += `<ins class="ct-ins" data-virtual="1" data-sug="${g.id}">${esc(g.propuesto)}</ins>`;
      pos = g.hasta;
    }
    return out + copyHTML(txt.slice(pos));
  }
  // Una sugerencia queda "descolgada" si el texto que citaba ya no está donde estaba.
  const descolgada = (fila, g) => {
    const txt = leerCampo(fila, g.campo);
    return typeof txt !== "string" || txt.slice(g.desde, g.hasta) !== g.original;
  };

  // El copy se muestra tal cual va a WhatsApp: los *asteriscos* son su negrita
  // y quedan A LA VISTA a propósito, porque se copian con el mensaje.
  function copyHTML(txt) {
    let h = esc(txt);
    h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/\*([^*\n]+)\*/g, "<b>*$1*</b>");
    return h;
  }
  const iniciales = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(x => x[0] || "").join("") || "?";
  function hace(ts) {
    const s = Math.max(0, (Date.now() - Date.parse(ts)) / 1000);
    if (s < 60) return "recién";
    if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
    if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
    if (s < 604800) return `hace ${Math.floor(s / 86400)} d`;
    const d = new Date(ts); return `${d.getDate()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  // "meta.imagen" / "variantes.2.copy" → escribe en una copia y devuelve la COLUMNA a guardar
  function conCampo(fila, ruta, valor) {
    const partes = ruta.split(".");
    const col = partes[0];
    if (partes.length === 1) return { col, val: valor };
    const raiz = JSON.parse(JSON.stringify(fila[col] == null ? (isNaN(partes[1]) ? {} : []) : fila[col]));
    let o = raiz;
    for (let i = 1; i < partes.length - 1; i++) {
      const k = partes[i];
      if (o[k] == null || typeof o[k] !== "object") o[k] = isNaN(partes[i + 1]) ? {} : [];
      o = o[k];
    }
    o[partes[partes.length - 1]] = valor;
    return { col, val: raiz };
  }
  function leerCampo(fila, ruta) {
    return ruta.split(".").reduce((o, k) => (o == null ? undefined : o[k]), fila);
  }

  /* ---- Instagram: placas ------------------------------------------------
     Una pieza de Instagram son N frames: un post o un reel tienen uno, un
     carrusel varios. Cada placa se aprueba SOLA y el copy es un ítem más; el
     estado de la pieza no se guarda, lo deriva el trigger de la base
     (ver 2026-09-03-canales.sql). Acá sólo se dibuja lo mismo que calcula él.  */
  const esURL = s => /^https?:\/\//i.test(String(s || "").trim());
  const placasDe = m => (Array.isArray(m.placas) && m.placas.length) ? m.placas : [];
  // La imagen sale del PNG congelado o del link cargado a mano. Cuando entre
  // Figma, `png` lo va a llenar el render y esto no cambia.
  function imagenDe(m, i) {
    const pl = placasDe(m)[i] || {};
    if (esURL(pl.png)) return pl.png;
    if (esURL(pl.url)) return pl.url;
    if (i === 0 && esURL((m.meta || {}).imagen)) return m.meta.imagen;
    return "";
  }
  // Comentarios sin resolver de UNA placa (1..n) o de la pieza entera (null).
  // Reusa `variante`, que existía para las variantes de WhatsApp y no se usaba.
  const comsPlaca = (m, n) => (COMS[m.id] || []).filter(c =>
    c.tipo !== "sugerencia" && !c.resuelto &&
    (n === null ? c.variante == null : +c.variante === n));
  const placasListas = m => placasDe(m).filter(p => p.estado === "aprobado").length;
  // Las placas mandan sólo cuando existen: una pieza sin placas sigue el flujo viejo.
  const porPlacas = m => CANAL === "instagram" && placasDe(m).length > 0;

  /* ========================= DATOS ========================= */
  async function traerMeses() {
    const r = await fetch(url(`contenidos_meses?canal=eq.${CANAL}&select=*&order=mes.desc`), { headers: head() });
    MESES = r.ok ? await r.json() : [];
  }
  async function traerMes(mes) {
    if (!mes) { CAB = null; MSGS = []; COMS = {}; return; }
    ULTIMO[CANAL] = mes;
    const [rc, rm] = await Promise.all([
      fetch(url(`contenidos_meses?mes=eq.${enc(mes)}&canal=eq.${CANAL}&select=*`), { headers: head() }),
      fetch(url(`contenidos?mes=eq.${enc(mes)}&canal=eq.${CANAL}&select=*&order=fecha.asc,orden.asc`), { headers: head() }),
    ]);
    CAB = rc.ok ? (await rc.json())[0] || null : null;
    MSGS = rm.ok ? await rm.json() : [];
    COMS = {};
    await traerPrevias();
    if (MSGS.length) {
      const ids = MSGS.map(m => m.id).join(",");
      const rk = await fetch(url(`contenidos_comentarios?contenido_id=in.(${ids})&select=*&order=creado.asc`), { headers: head() });
      if (rk.ok) (await rk.json()).forEach(c => { (COMS[c.contenido_id] = COMS[c.contenido_id] || []).push(c); });
    }
  }
  // El feed necesita lo YA PUBLICADO de los meses anteriores: mirar la fila nueva
  // en el vacío no dice nada. Nueve alcanzan para ver tres filas de contexto.
  async function traerPrevias() {
    PREV = [];
    if (CANAL !== "instagram" || !MES) return;
    const r = await fetch(url(`contenidos?canal=eq.${CANAL}&mes=lt.${enc(MES)}` +
      `&select=id,mes,fecha,criterio,tipo,placas,meta,estado&order=fecha.desc&limit=9`), { headers: head() });
    if (r.ok) PREV = await r.json();
  }

  const guardarCampo = (id, col, val) => guardarCampos(id, { [col]: val });
  // Varias columnas de una: reordenar el feed toca fecha Y orden, y no tiene
  // sentido pegarle dos veces a la base por cada pieza que se corre.
  async function guardarCampos(id, body) {
    const r = await fetch(url(`contenidos?id=eq.${id}`), {
      method: "PATCH", headers: head({ Prefer: "return=representation" }), body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    const fila = (await r.json())[0];
    const i = MSGS.findIndex(m => m.id === id);
    if (i >= 0 && fila) MSGS[i] = fila;
    return fila;
  }
  async function guardarCab(col, val) {
    const body = {}; body[col] = val;
    const r = await fetch(url(`contenidos_meses?mes=eq.${enc(MES)}&canal=eq.${CANAL}`), {
      method: "PATCH", headers: head({ Prefer: "return=representation" }), body: JSON.stringify(body),
    });
    if (r.ok) { const f = (await r.json())[0]; if (f) CAB = f; }
    return r.ok;
  }

  /* ========================= RENDER ========================= */
  // app.js pasa el canal de la página en la que se entró. Cambiar de canal es
  // vaciar lo que hay en memoria: cada uno trae sus meses, sus piezas y sus hilos.
  window.renderContenidos = async function (canal) {
    if (canal && CANALES[canal] && canal !== CANAL) {
      CANAL = canal;
      MESES = []; CAB = null; MSGS = []; COMS = {}; ABIERTOS = {};
      MES = ULTIMO[CANAL] || "";
      PANEL = false; FILTRO = "todos"; FOCO = ""; PREV = []; FEEDNOTA = ""; CALNOTA = ""; MOVIENDO = "";
      // El feed es de Instagram: volviendo a WhatsApp esa vista no existe.
      if (VISTA === "feed" && CANAL !== "instagram") VISTA = "fichas";
    }
    // ¿Venimos de un aviso de este canal? Abrir el mes y la pieza que lo disparó.
    if (PENDIENTE && PENDIENTE.canal === CANAL) {
      if (PENDIENTE.mes) MES = PENDIENTE.mes;
      VISTA = "fichas"; FOCO = PENDIENTE.id; ABIERTOS[PENDIENTE.id] = true;
      PENDIENTE = null;
    }
    const cont = caja(); if (!cont) return;
    if (!(SES().puedeVerContenidos && SES().puedeVerContenidos())) {
      cont.innerHTML = `<div class="empty">No tenés acceso a esta sección.</div>`; return;
    }
    if (!MESES.length) {
      cont.innerHTML = `<div class="empty-mini">Cargando cronograma…</div>`;
      await traerMeses();
      MES = MES || (MESES[0] && MESES[0].mes) || "";
      await Promise.all([traerMes(MES), traerAvisos()]);
    }
    pintar();
    arrancarRefresco();
    if (!window.__ctSel) { window.__ctSel = true; montarSeleccion(); }
  };

  function pintar() {
    const cont = caja(); if (!cont) return;
    const ed = puedeEditar();
    cont.className = ed ? "ct-edit" : "";

    if (!MESES.length) {
      cont.innerHTML = `
        <div class="empty">
          <div class="big">🗓</div>
          <p>Todavía no hay ningún mes cargado.</p>
          ${ed ? `<div class="ct-acc" style="justify-content:center;margin-top:14px">
                    <button class="btn-primary" data-acc="nuevo-mes">Crear un mes</button>
                    <button class="btn-ghost" data-acc="importar">⬆ Importar mes (.json)</button>
                    <input type="file" class="ct-file" accept="application/json" hidden>
                  </div>`
                : `<p class="ct-com-vacio">Pedile a Coordinación que cargue el mes.</p>`}
        </div>`;
      enganchar(); return;
    }

    cont.innerHTML = barraHTML(ed) + (PANEL ? panelHTML() : "") + cabeceraHTML(ed) +
      (VISTA === "calendario" ? calendarioHTML()
       : VISTA === "feed" ? feedHTML(ed)
       : fichasHTML(ed));
    pintarBadgeNav();
    enganchar();

    if (FOCO) {
      const el = document.querySelector(`.ct-msg[data-id="${FOCO}"]`);
      if (el) { el.scrollIntoView({ block: "start", behavior: "smooth" }); el.classList.add("destacada"); }
      FOCO = "";
    }
  }

  function barraHTML(ed) {
    const n = MSGS.length;
    const aprobados = MSGS.filter(m => m.estado === "aprobado").length;
    const pct = n ? Math.round((aprobados / n) * 100) : 0;

    // Sólo se muestran los recortes que tienen algo adentro: una fila de ceros no ayuda.
    const chips = FILTROS.map(f => ({ f, n: MSGS.filter(f.f).length }))
      .filter(x => x.f.k === "todos" || x.n > 0 || x.f.k === FILTRO)
      .map(x => `<button class="ct-chipf ${x.f.k} ${x.f.k === FILTRO ? "on" : ""}" data-filtro="${x.f.k}">
                   ${x.f.t} <span class="c">${x.n}</span></button>`).join("");

    return `
      <div class="ct-bar">
        <div class="ct-bar-fila">
          <select class="ct-mes" title="Elegí el mes">
            ${MESES.map(m => `<option value="${esc(m.mes)}" ${m.mes === MES ? "selected" : ""}>${cap(mesLabel(m.mes))} — ${esc(m.titulo || "sin título")}</option>`).join("")}
          </select>
          <div class="ct-vistas">
            <button data-vista="calendario" class="${VISTA === "calendario" ? "on" : ""}">Calendario</button>
            <button data-vista="fichas" class="${VISTA === "fichas" ? "on" : ""}">Fichas</button>
            ${CANAL === "instagram" ? `<button data-vista="feed" class="${VISTA === "feed" ? "on" : ""}"
              title="Cómo va a quedar la grilla del perfil">Feed</button>` : ""}
          </div>
          <div class="ct-acc">
            <button class="btn-desc ct-campana ${PANEL ? "on" : ""}" data-campana="1" title="Avisos">🔔${(() => {
              const n = cuentaAvisos(); return n ? `<span class="ct-punto">${n > 9 ? "9+" : n}</span>` : "";
            })()}</button>
            <button class="btn-desc" data-acc="refrescar" title="Traer los últimos cambios y comentarios">↻</button>
            ${ed ? `<button class="btn-desc" data-acc="nuevo-msg">+ ${cap(C().unidad)}</button>
                    <button class="btn-desc" data-acc="nuevo-mes">+ Mes</button>
                    <button class="btn-desc" data-acc="importar" title="Cargar un mes desde un .json">⬆</button>
                    <button class="btn-desc" data-acc="exportar" title="Bajar este mes como .json">⬇</button>
                    <input type="file" class="ct-file" accept="application/json" hidden>` : ""}
          </div>
        </div>
        ${n ? `<div class="ct-bar-fila ct-fila-2">
          <div class="ct-progreso" title="${aprobados} de ${n} ${C().unidadPl} aprobados">
            <div class="ct-barra"><span style="width:${pct}%"></span></div>
            <span class="ct-progreso-t"><b>${aprobados}</b>/${n} aprobados</span>
          </div>
          <div class="ct-filtros">${chips}</div>
        </div>` : ""}
      </div>
      ${ed ? "" : `<div class="ct-solo-lectura">${C().lectura}</div>`}`;
  }

  function cabeceraHTML(ed) {
    if (!CAB) return "";
    const e = ed ? ' contenteditable="true" spellcheck="false"' : "";
    const brief = Array.isArray(CAB.brief) ? CAB.brief : [];
    const obras = Array.isArray(CAB.obras) ? CAB.obras : [];
    // El brief y las obras son material de consulta, no lo que venís a hacer: van
    // plegados para que los mensajes queden arriba de todo.
    const hayDetalle = brief.length || obras.length;
    return `
      <div class="ct-head">
        <p class="ct-eyebrow"${e} data-cabc="eyebrow">${esc(CAB.eyebrow || "")}</p>
        <h2 class="ct-titulo"${e} data-cabc="titulo">${esc(CAB.titulo || "")}</h2>
        <p class="ct-dek"${e} data-cabc="dek">${esc(CAB.dek || "")}</p>
        ${hayDetalle ? `<details class="ct-detalle">
          <summary>Brief y obras del mes${obras.length ? ` · ${obras.length} obras asignadas` : ""}</summary>
          ${brief.length ? `<div class="ct-brief">${brief.map((b, i) => `
            <section><h4${e} data-cabc="brief.${i}.h">${esc(b.h || "")}</h4>
                     <p${e} data-cabc="brief.${i}.p">${esc(b.p || "")}</p></section>`).join("")}</div>` : ""}
          ${obras.length ? `<div class="ct-scroll"><table class="ct-obras">
            <thead><tr><th>Tipología</th><th>Obra</th><th>Productos</th></tr></thead>
            <tbody>${obras.map((o, i) => `<tr>
              <td${e} data-cabc="obras.${i}.tipologia">${esc(o.tipologia || "")}</td>
              <td${e} data-cabc="obras.${i}.obra">${esc(o.obra || "")}</td>
              <td${e} data-cabc="obras.${i}.productos">${esc(o.productos || "")}</td></tr>`).join("")}</tbody>
          </table></div>` : ""}
        </details>` : ""}
      </div>`;
  }

  /* ---- Vista calendario ---- */
  function calendarioHTML() {
    const ed = puedeEditar();
    const p = String(MES).split("-");
    const anio = +p[0], mesIdx = (+p[1]) - 1;
    const primero = new Date(anio, mesIdx, 1);
    const dias = new Date(anio, mesIdx + 1, 0).getDate();
    const offset = (primero.getDay() + 6) % 7;         // grilla arranca en lunes
    const hoy = hoyISO();

    const porDia = {};
    MSGS.forEach(m => { (porDia[m.fecha] = porDia[m.fecha] || []).push(m); });

    // TODOS los días son destino, los de relleno (mes anterior/siguiente) también:
    // soltar ahí manda la pieza al mes vecino, y moverFecha se encarga de cambiarle
    // también el `mes` de pertenencia y de abrir el mes al que fue a parar.
    const celda = (num, iso, fuera) => {
      const lista = porDia[iso] || [];
      const moviendoAca = MOVIENDO && lista.some(m => m.id === MOVIENDO);
      return `<div class="ct-dia ${fuera ? "fuera" : ""} ${iso === hoy ? "hoy" : ""} ${lista.length ? "" : "vacio"}${moviendoAca ? " origen" : ""}"
          data-dia="${iso}">
        <span class="num">${num}</span>
        <div class="ct-chips">${lista.map(m => {
          const nc = (COMS[m.id] || []).filter(c => c.tipo !== "sugerencia" && !c.resuelto).length;
          const ns = (COMS[m.id] || []).filter(c => c.tipo === "sugerencia" && !c.decision).length;
          const nv = (m.variantes || []).length;
          const apagado = !filtroActivo()(m) ? " apagado" : "";
          const alzada = MOVIENDO === m.id ? " alzada" : "";
          return `<div class="ct-chip ${m.estado}${apagado}${alzada}" data-ir="${m.id}" ${ed ? 'draggable="true"' : ""}
              title="${esc(m.objetivo || "")}${ed ? " · arrastrá o tocá ✥ para cambiarle el día" : ""}">
            ${ed ? `<button class="ct-mover" data-mover="${m.id}"
              title="Mover a otro día">${MOVIENDO === m.id ? "✕" : "✥"}</button>` : ""}
            <b>${esc(m.criterio || "Mensaje")}</b>
            <span class="sub">${esc((m.copy || (m.variantes || [])[0] && m.variantes[0].copy || "").replace(/\s+/g, " ").slice(0, 52))}…</span>
            <span class="marcas">${ESTADOS[m.estado] ? ESTADOS[m.estado].t : m.estado}
              ${nv ? ` · ${nv} variantes` : ""}${ns ? ` · ✎ ${ns}` : ""}${nc ? ` · 💬 ${nc}` : ""}</span>
          </div>`;
        }).join("")}</div>
      </div>`;
    };

    // Los días de relleno también llevan su fecha real: son destino como cualquier otro.
    const iso = (y, mi, d) => { const f = new Date(y, mi, d), z = n => String(n).padStart(2, "0");
      return `${f.getFullYear()}-${z(f.getMonth() + 1)}-${z(f.getDate())}`; };

    let celdas = "";
    // cola del mes anterior, para que la primera semana quede completa
    const prevDias = new Date(anio, mesIdx, 0).getDate();
    for (let i = offset - 1; i >= 0; i--) celdas += celda(prevDias - i, iso(anio, mesIdx - 1, prevDias - i), true);
    for (let d = 1; d <= dias; d++) celdas += celda(d, iso(anio, mesIdx, d), false);
    const resto = (7 - ((offset + dias) % 7)) % 7;
    for (let d = 1; d <= resto; d++) celdas += celda(d, iso(anio, mesIdx + 1, d), true);

    const alzada = MOVIENDO && MSGS.find(m => m.id === MOVIENDO);
    return `<div class="ct-cal">
      ${alzada
        ? `<p class="ct-cal-alzada">Elegí el día nuevo para <b>«${esc(recorte(alzada.criterio || C().unidad, 40))}»</b>
             — cualquier día del calendario, incluidos los grises del mes de al lado.
             <button class="btn-mini" data-mover="">Cancelar</button></p>`
        : ed ? `<p class="ct-cal-tip">Para cambiar el día: arrastrá ${C().art} ${C().unidad} adonde quieras,
             o tocá <b>✥</b> y después el día (así también anda en el celular).
             Los días grises del mes de al lado también sirven.</p>` : ""}
      ${CALNOTA ? `<p class="ct-cal-nota">${esc(CALNOTA)}</p>` : ""}
      <div class="ct-cal-dias"><span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span></div>
      <div class="ct-cal-grid${MOVIENDO ? " eligiendo" : ""}">${celdas}</div>
    </div>`;
  }

  /* ---- Vista feed (sólo Instagram) --------------------------------------
     La grilla como la va a ver cualquiera que entre al perfil: lo más nuevo
     arriba a la izquierda. Arriba de la franja, lo que viene; abajo, lo que ya
     salió (incluidos los meses anteriores). Sin esa parte de abajo la fila
     nueva se mira en el vacío y no se ve que van tres fotos oscuras seguidas.  */
  function feedHTML(ed) {
    if (!MSGS.length) {
      return `<div class="empty"><div class="big">📸</div><p>Este mes todavía no tiene piezas.</p>
        ${ed ? `<button class="btn-primary" data-acc="nuevo-msg" style="margin-top:12px">Agregar la primera</button>` : ""}</div>`;
    }
    const hoy = hoyISO();
    // Orden de Instagram: descendente por fecha. `orden` desempata dentro del día.
    const orden = MSGS.slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.orden || 0) - (a.orden || 0));
    const vienen = orden.filter(m => m.fecha >= hoy);
    const salieron = orden.filter(m => m.fecha < hoy);
    const contexto = PREV.filter(p => !MSGS.some(m => m.id === p.id));

    const grilla = vienen.map(m => baldosaHTML(m, ed, false)).join("") +
      (salieron.length || contexto.length
        ? `<div class="ct-feed-corte"><span>↑ lo que viene · ↓ ya publicado</span></div>` : "") +
      salieron.map(m => baldosaHTML(m, ed, false)).join("") +
      contexto.map(m => baldosaHTML(m, ed, true)).join("");

    const aprob = MSGS.filter(m => m.estado === "aprobado").length;
    return `
      <div class="ct-feed">
        <div class="ct-feed-perfil">
          <span class="av">L</span>
          <div>
            <b>leukiluminacion</b>
            <small>${esc(cap(mesLabel(MES)))} · ${MSGS.length} ${MSGS.length === 1 ? "pieza" : "piezas"} · ${aprob} aprobadas</small>
          </div>
          ${ed ? `<span class="ct-feed-tip">Arrastrá una pieza para cambiarle el lugar en la grilla: las fechas se quedan quietas y las piezas se acomodan a ellas.</span>` : ""}
        </div>
        ${FEEDNOTA ? `<p class="ct-feed-nota">${esc(FEEDNOTA)}</p>` : ""}
        <div class="ct-grid">${grilla}</div>
        <div class="ct-feed-ley">
          <span><i class="borrador"></i>Borrador</span>
          <span><i class="revision"></i>En revisión</span>
          <span><i class="cambios"></i>Cambios pedidos</span>
          <span><i class="aprobado"></i>Aprobado</span>
          <span class="ct-feed-ley-nota">El punto es el estado de la pieza. La barra de abajo tiene un tramo por placa: cada una se aprueba sola.</span>
        </div>
      </div>`;
  }

  function baldosaHTML(m, ed, ajena) {
    const pls = placasDe(m);
    const img = imagenDe(m, 0);
    const f = aFecha(m.fecha);
    const fecha = `${String(f.getDate()).padStart(2, "0")}/${String(f.getMonth() + 1).padStart(2, "0")}`;
    const n = pls.length;
    const badge = m.tipo === "carrusel" ? `▦${n > 1 ? "&#8202;" + n : ""}` : m.tipo === "reel" ? "▶" : "";
    // La barra de tramos: uno por placa. Sin placas cargadas, un tramo con el
    // estado de la pieza — así una foto suelta y un carrusel se leen igual.
    const segs = (n ? pls.map(p => p.estado || "borrador") : [m.estado])
      .map(e => `<i class="${esc(e)}"></i>`).join("");

    return `<button class="ct-bald ${ajena ? "ajena" : ""}" data-ir="${m.id}" data-bald="${m.id}"
        ${ed && !ajena ? 'draggable="true"' : ""} title="${esc(m.criterio || "")}">
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy">`
            : `<span class="ct-bald-ph"><span>${esc(m.criterio || "Sin título")}</span></span>`}
      ${ajena ? "" : `<span class="ct-bald-est ${esc(m.estado)}"></span>`}
      ${badge ? `<span class="ct-bald-tipo">${badge}</span>` : ""}
      <span class="ct-bald-dia">${fecha}${ajena ? " · " + esc(mesLabel(m.mes).slice(0, 3)) : ""}</span>
      ${ajena ? "" : `<span class="ct-bald-segs">${segs}</span>`}
    </button>`;
  }

  /* Arrastrar = cambiar el lugar en la grilla. Las FECHAS se quedan donde
     están y las piezas se acomodan a ellas: el mes sigue teniendo la misma
     cadencia, lo que cambia es qué sale cada día. */
  async function reordenarFeed(desdeId, hastaId) {
    if (!desdeId || desdeId === hastaId) return;
    const orden = MSGS.slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.orden || 0) - (a.orden || 0));
    const i = orden.findIndex(x => x.id === desdeId), j = orden.findIndex(x => x.id === hastaId);
    if (i < 0 || j < 0) return;
    const fechas = orden.map(x => x.fecha);
    const [mov] = orden.splice(i, 1); orden.splice(j, 0, mov);

    // Además de la fecha se guarda el ORDEN, que es lo que desempata dos piezas
    // del mismo día: sin esto, moverlas entre sí no quedaba guardado.
    const total = orden.length;
    const cambios = [];
    orden.forEach((m, k) => {
      const fecha = fechas[k], ord = total - 1 - k;
      if (m.fecha !== fecha || (m.orden || 0) !== ord) cambios.push({ id: m.id, fecha, orden: ord });
    });
    if (!cambios.length) return;
    try {
      await Promise.all(cambios.map(c => guardarCampos(c.id, { fecha: c.fecha, orden: c.orden })));
    } catch (e) { alert("No se pudo mover la pieza. Puede que no tengas permiso."); return; }

    const nueva = (cambios.find(c => c.id === desdeId) || {}).fecha;
    FEEDNOTA = `«${recorte(mov.criterio || "La pieza", 40)}» pasó al ${nueva ? nueva.slice(8) + "/" + nueva.slice(5, 7) : "nuevo lugar"}` +
               ` · ${cambios.length} pieza${cambios.length > 1 ? "s" : ""} reacomodada${cambios.length > 1 ? "s" : ""}.`;
    await traerMes(MES); pintar();
    setTimeout(() => { if (FEEDNOTA) { FEEDNOTA = ""; if (VISTA === "feed") pintar(); } }, 6000);
  }

  /* Cambiar el día de una pieza — por arrastre en el calendario o por el
     selector de fecha de la ficha. A diferencia del feed (donde arrastrar
     reordena y la fecha NO se toca), acá el día de destino ES la fecha nueva. */
  async function moverFecha(id, nuevaFecha, avisoFicha) {
    const m = MSGS.find(x => x.id === id);
    MOVIENDO = "";
    if (!m || !nuevaFecha || m.fecha === nuevaFecha) { if (VISTA === "calendario") pintar(); return; }
    // La fecha manda: si cae en otro mes, la pieza se muda de mes también. Antes
    // sólo se tocaba `fecha` y la pieza quedaba colgada — seguía perteneciendo al
    // mes viejo y desaparecía de su calendario. Por eso "no dejaba" mover.
    const mesNuevo = nuevaFecha.slice(0, 7);
    const cambiaMes = mesNuevo !== m.mes;
    if (cambiaMes && !(await asegurarMes(mesNuevo))) {
      const q = `No se pudo abrir ${mesLabel(mesNuevo)} para mudar ${C().art} ${C().unidad}.`;
      if (avisoFicha) avisar(id, "No se pudo mover la fecha", false); else alert(q);
      return;
    }
    try { await guardarCampos(id, cambiaMes ? { fecha: nuevaFecha, mes: mesNuevo } : { fecha: nuevaFecha }); }
    catch (e) {
      if (avisoFicha) avisar(id, "No se pudo mover la fecha", false);
      else alert("No se pudo mover la fecha. Puede que no tengas permiso.");
      return;
    }
    const corta = nuevaFecha.slice(8) + "/" + nuevaFecha.slice(5, 7);
    const dice = cambiaMes ? `${corta} (${mesLabel(mesNuevo)})` : corta;
    // Si se mudó de mes hay que seguirla: quedarse en el mes viejo es verla desaparecer.
    if (cambiaMes) { MES = mesNuevo; await traerMeses(); }
    if (avisoFicha) {
      FOCO = id; await traerMes(MES); pintar();
      avisar(id, `Pasó al ${dice} ✓`, true); return;
    }
    CALNOTA = `«${recorte(m.criterio || "La pieza", 40)}» pasó al ${dice}.` +
      (cambiaMes ? ` Abrimos ${mesLabel(mesNuevo)} para que la sigas viendo.` : "");
    FOCO = cambiaMes ? id : FOCO;
    await traerMes(MES); pintar();
    setTimeout(() => { if (CALNOTA) { CALNOTA = ""; if (VISTA === "calendario") pintar(); } }, 8000);
  }

  /* El mes destino tiene que existir en contenidos_meses: la FK de contenidos es
     (mes, canal). Si nadie lo abrió todavía se crea en el acto, vacío — mover una
     pieza a octubre no puede depender de acordarse de crear octubre antes. */
  async function asegurarMes(mes) {
    if (MESES.some(x => x.mes === mes)) return true;
    const r = await fetch(url("contenidos_meses"), {
      method: "POST", headers: head({ Prefer: "return=representation,resolution=merge-duplicates" }),
      body: JSON.stringify([{
        mes, canal: CANAL, titulo: "", eyebrow: C().eyebrow(mes),
        brief: [{ h: "Objetivo", p: "" }, { h: "Recursos", p: "" }, { h: "Cadencia", p: "" }],
        autor: SES().nombre ? SES().nombre() : "", autor_email: SES().email ? SES().email() : "",
      }]),
    });
    if (r.ok) await traerMeses();
    return r.ok;
  }

  /* ---- Vista fichas ---- */
  function fichasHTML(ed) {
    if (!MSGS.length) {
      return `<div class="empty"><div class="big">✍️</div><p>Este mes todavía no tiene mensajes.</p>
        ${ed ? `<button class="btn-primary" data-acc="nuevo-msg" style="margin-top:12px">Agregar el primero</button>` : ""}</div>`;
    }
    const lista = MSGS.filter(filtroActivo());
    if (!lista.length) {
      const t = (FILTROS.find(x => x.k === FILTRO) || {}).t || "";
      return `<div class="empty"><div class="big">✓</div><p>Ningún mensaje en «${esc(t)}».</p>
        <button class="btn-mini" data-filtro="todos" style="margin-top:10px">Ver todo el mes</button></div>`;
    }
    return lista.map(m => fichaHTML(m, ed)).join("") + NOTA_PIE;
  }

  // Una sola vez al pie, en vez de repetir la aclaración en cada ficha.
  const NOTA_PIE = `<p class="ct-nota">Los <b>*asteriscos*</b> son la negrita de WhatsApp: van tal cual en el mensaje y se copian con él.</p>`;

  function fichaHTML(m, ed) {
    const f = aFecha(m.fecha);
    const e = ed ? ' contenteditable="true" spellcheck="false"' : "";
    const coms = COMS[m.id] || [];
    const pendCom = coms.filter(c => c.tipo !== "sugerencia" && !c.resuelto).length;
    const pendSug = coms.filter(c => c.tipo === "sugerencia" && !c.decision).length;
    const vars = Array.isArray(m.variantes) ? m.variantes : [];

    return `<article class="ct-msg" data-id="${m.id}">
      <div class="ct-msg-bar">
        <span class="ct-fecha ${ed ? "editable" : ""}" title="${ed ? "Cambiar el día" : ""}">${String(f.getDate()).padStart(2, "0")}/${String(f.getMonth() + 1).padStart(2, "0")}
          <small>${DIA_CORTO[f.getDay()]}</small>
          ${ed ? `<input type="date" class="ct-fecha-input" value="${m.fecha}" data-fechainput="${m.id}">` : ""}</span>
        <span class="ct-cuando ${cuando(m.fecha).c}">${cuando(m.fecha).t}</span>
        <span class="ct-crit"${e} data-c="criterio">${esc(m.criterio || "")}</span>
        <span class="ct-obj"${e} data-c="objetivo">${esc(m.objetivo || "")}</span>
        ${m.flag ? `<span class="ct-flag"${e} data-c="flag">${esc(m.flag)}</span>` : ""}
        <span class="ct-est ${m.estado}">${ESTADOS[m.estado] ? ESTADOS[m.estado].t : esc(m.estado)}</span>
      </div>

      ${vars.length ? "" : cuerpoHTML(m, "", ed, m)}

      ${vars.length ? `<div class="ct-vars">
        <p class="ct-lead"${e} data-c="lead">${esc(m.lead || "")}</p>
        ${vars.map((v, i) => `<details class="ct-v" ${i === 0 ? "open" : ""}>
          <summary><span${e} data-c="variantes.${i}.titulo">${esc(v.titulo || `Variante ${i + 1}`)}</span>
            ${ed ? `<button class="ct-v-del" data-delvar="${i}" title="Eliminar esta variante">✕</button>` : ""}</summary>
          ${cuerpoHTML(v, `variantes.${i}.`, ed, m)}
        </details>`).join("")}
        ${ed ? `<button class="btn-mini" data-addvar="1">+ Variante</button>` : ""}
      </div>` : ""}

      ${placasHTML(m, ed)}

      <div class="ct-pie">
        <button class="btn-mini ${ABIERTOS[m.id] ? "on" : ""}" data-coms="${m.id}">
          ${pendSug ? `<span class="ct-badge sug">✎ ${pendSug}</span>` : ""}
          ${pendCom ? `<span class="ct-badge">💬 ${pendCom}</span>` : ""}
          ${!pendSug && !pendCom ? `💬 Comentarios${coms.length ? ` (${coms.length})` : ""}` : "sin resolver"}</button>
        <button class="btn-mini" data-copiar="${m.id}" title="Copiar el mensaje listo para pegar en WhatsApp">⧉ Copiar</button>
        <span class="ct-guardado" data-guardado="${m.id}"></span>
        <div class="ct-acciones">${accionesHTML(m, ed)}</div>
      </div>
      ${ABIERTOS[m.id] ? comentariosHTML(m) : ""}
    </article>`;
  }

  /* ---- Las placas dentro de la ficha (sólo Instagram) --------------------
     En la grilla se ve UNA placa, como en Instagram. Acá se ven todas, y cada
     una se aprueba sola: "la foto 3 no, el resto sí" es lo que se dice de
     verdad de un carrusel. El copy también se aprueba aparte.
     Regla heredada de WhatsApp: con comentarios sin resolver no se aprueba —
     pero acá traban SÓLO su placa, no la pieza entera.                       */
  function placasHTML(m, ed) {
    if (CANAL !== "instagram") return "";
    const pls = placasDe(m);
    const TIPOS = { post: "Post", carrusel: "Carrusel", reel: "Reel" };

    if (!pls.length) {
      return `<div class="ct-placas-blk vacio">
        <p>Esta pieza todavía no tiene placas: mientras no las tenga, se aprueba entera como un mensaje.</p>
        ${ed ? `<button class="btn-mini" data-addplaca="1">+ Agregar la primera placa</button>` : ""}
      </div>`;
    }

    const i = Math.min(PLACA[m.id] || 0, pls.length - 1);
    const act = pls[i] || {};
    const traba = comsPlaca(m, i + 1).length;
    const trabaCopy = comsPlaca(m, null).length;
    const e = ed ? ' contenteditable="true" spellcheck="false"' : "";
    const chip = est => `<span class="ct-est ${esc(est)}">${ESTADOS[est] ? ESTADOS[est].t : esc(est)}</span>`;

    return `<div class="ct-placas-blk">
      <div class="ct-placas-cab">
        <h5>${pls.length > 1 ? `Carrusel de ${pls.length} placas` : "La pieza"}</h5>
        ${ed ? `<select class="ct-tipo" data-tipo="${m.id}" title="Cómo se publica">
          ${Object.keys(TIPOS).map(k => `<option value="${k}" ${(m.tipo || "post") === k ? "selected" : ""}>${TIPOS[k]}</option>`).join("")}
        </select>` : `<span class="ct-pill">${TIPOS[m.tipo] || "Post"}</span>`}
        <span class="ct-placas-res"><b>${placasListas(m)}</b>/${pls.length} ${pls.length > 1 ? "placas aprobadas" : "aprobada"}
          · copy ${(((ESTADOS[m.copy_estado] || {}).t) || "borrador").toLowerCase()}</span>
      </div>

      <div class="ct-placas">
        ${pls.map((p, n) => {
          const img = imagenDe(m, n);
          const c = comsPlaca(m, n + 1).length;
          return `<button class="ct-placa ${n === i ? "on" : ""}" data-placa="${m.id}:${n}" title="${esc(p.pie || "Placa " + (n + 1))}">
            ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span class="ph">${n + 1}</span>`}
            <span class="ct-placa-est ${esc(p.estado || "borrador")}"></span>
            ${c ? `<span class="ct-placa-pin">${c}</span>` : ""}
            <span class="ct-placa-n">${n + 1}</span>
          </button>`;
        }).join("")}
        ${ed ? `<button class="ct-placa mas" data-addplaca="1" title="Sumar una placa">+</button>` : ""}
      </div>

      <div class="ct-placa-cap">
        ${chip(act.estado || "borrador")}
        <b>${pls.length > 1 ? `Placa ${i + 1} de ${pls.length}` : "Imagen"}</b>
        <span class="ct-placa-pie"${e} data-c="placas.${i}.pie">${esc(act.pie || "")}</span>
        ${traba ? `<span class="ct-placa-traba">· ${traba} comentario${traba > 1 ? "s" : ""} sin resolver acá</span>` : ""}
      </div>

      <dl class="ct-placa-datos">
        <div><dt>Frame de Figma</dt><dd${e} data-c="placas.${i}.nodo">${esc(act.nodo || "")}</dd></div>
        <div><dt>Imagen</dt><dd${e} data-c="placas.${i}.png">${esc(act.png || "")}</dd></div>
      </dl>

      ${ed ? `<div class="ct-placa-accs">
        ${act.estado === "aprobado"
          ? `<button class="btn-mini" data-placaest="${m.id}:${i}:revision">Reabrir esta placa</button>`
          : traba
            ? `<button class="btn-mini trabado" data-trabaplaca="${traba}">✓ Aprobar esta placa</button>`
            : `<button class="btn-mini on" data-placaest="${m.id}:${i}:aprobado">✓ Aprobar esta placa</button>`}
        ${act.estado === "cambios" ? "" : `<button class="btn-mini peligro" data-placaest="${m.id}:${i}:cambios">Pedir cambios acá</button>`}
        <button class="btn-mini peligro" data-delplaca="${m.id}:${i}" title="Eliminar esta placa">✕</button>
        <span class="ct-placa-sep"></span>
        ${(m.copy_estado || "borrador") === "aprobado"
          ? `<button class="btn-mini" data-copyest="${m.id}:revision">Reabrir el copy</button>`
          : trabaCopy
            ? `<button class="btn-mini trabado" data-trabaplaca="${trabaCopy}">✓ Aprobar el copy</button>`
            : `<button class="btn-mini on" data-copyest="${m.id}:aprobado">✓ Aprobar el copy</button>`}
      </div>
      ${traba || trabaCopy ? `<p class="ct-placa-nota">No se aprueba con comentarios abiertos. Resolvelos en el hilo de abajo y el botón se habilita.</p>` : ""}
      <p class="ct-placa-nota tenue">El estado de la pieza sale de las placas y del copy: no se toca a mano.</p>` : ""}
    </div>`;
  }

  function cuerpoHTML(o, pre, ed, m) {
    const e = ed ? ' contenteditable="true" spellcheck="false"' : "";
    const meta = o.meta || {};
    const enc = o.encuesta;
    const campo = (t, k) => `<div><dt>${t}</dt><dd${e} data-c="${pre}meta.${k}">${esc(meta[k] || "")}</dd></div>`;
    // Con sugerencias a la vista el copy NO es editable: el texto en pantalla ya
    // no es el texto guardado, y tipear encima lo corrompería. Se resuelven y vuelve.
    const sugs = m ? sugsDe(m, pre + "copy") : [];
    const eCopy = (ed && !sugs.length) ? e : "";
    return `<div class="ct-body">
      <div class="ct-copy ${sugs.length ? "con-sugs" : ""}"${eCopy} data-c="${pre}copy" data-raw="1">${copyConSugs(o.copy || "", sugs)}</div>
      ${sugs.length ? `<p class="ct-sug-aviso">✎ ${sugs.length} sugerencia${sugs.length > 1 ? "s" : ""} sin resolver — el copy se desbloquea al aceptarlas o descartarlas.</p>` : ""}
      <div class="ct-meta">
        ${enc ? `<div class="ct-poll">
          <p class="q"${e} data-c="${pre}encuesta.q">${esc(enc.q || "")}</p>
          <p class="hint"${e} data-c="${pre}encuesta.hint">${esc(enc.hint || "")}</p>
          <ol>${(enc.opciones || []).map((op, i) => `<li${e} data-c="${pre}encuesta.opciones.${i}">${esc(op)}</li>`).join("")}</ol>
        </div>` : ""}
        <dl>
          ${campo("Imagen", "imagen")}
          ${meta.link || ed ? `<div><dt>Link</dt><dd${e} data-c="${pre}meta.link">${esc(meta.link || "")}</dd></div>` : ""}
          ${campo("CTA", "cta")}
          ${meta.notas || ed ? `<div><dt>Notas</dt><dd${e} data-c="${pre}meta.notas">${esc(meta.notas || "")}</dd></div>` : ""}
        </dl>
      </div>
    </div>`;
  }

  // El flujo: borrador → en revisión → aprobado, con "pedir cambios" como vuelta atrás.
  function accionesHTML(m, ed) {
    if (!ed) return "";
    // Con placas, el estado de la pieza lo deriva la base de sus partes: no hay
    // botón que valga, se aprueba placa por placa arriba.
    if (porPlacas(m)) return `<button class="btn-mini peligro" data-del="1" title="Eliminar la pieza">✕</button>`;
    if (m.estado === "borrador" || m.estado === "cambios")
      return `<button class="btn-mini" data-est="revision" title="Marcarlo listo para que lo revisen">Mandar a revisión</button>
              <button class="btn-mini peligro" data-del="1" title="Eliminar el mensaje">✕</button>`;
    if (m.estado === "revision") {
      const p = sugsPendientes(m).length;
      return `<button class="btn-mini peligro" data-est="cambios">Pedir cambios</button>` +
        (p ? `<button class="btn-mini trabado" data-trabado="${p}"
                title="Quedan ${p} sugerencias sin resolver">✓ Aprobar</button>`
           : `<button class="btn-mini on" data-est="aprobado">✓ Aprobar</button>`);
    }
    return `<button class="btn-mini" data-est="revision" title="Volver a abrirlo para editar">Reabrir</button>`;
  }

  const dondeCampo = c => {
    const v = /^variantes\.(\d+)\./.exec(c || "");
    return v ? ` en la variante ${(+v[1]) + 1}` : "";
  };

  function comentariosHTML(m) {
    const coms = COMS[m.id] || [];
    const yo = (SES().email && SES().email() || "").toLowerCase();
    const ed = puedeEditar();
    return `<div class="ct-coms">
      ${coms.length ? coms.map(c => {
        const mio = String(c.autor_email || "").toLowerCase() === yo;
        if (c.tipo === "sugerencia") {
          const suelta = !c.decision && descolgada(m, c);
          return `<div class="ct-com sug ${c.decision || ""}" data-sugcard="${c.id}">
            <span class="av">${esc(iniciales(c.autor))}</span>
            <div class="cuerpo">
              <div class="quien">${esc(c.autor || c.autor_email || "—")}
                <span class="ct-com-var">sugirió un cambio${dondeCampo(c.campo)}</span>
                <span class="cuando">${hace(c.creado)}</span></div>
              <div class="ct-sug-cambio"><del>${esc(c.original)}</del><span class="fl">→</span><ins>${esc(c.propuesto)}</ins></div>
              ${c.texto ? `<div class="texto">${esc(c.texto)}</div>` : ""}
              ${suelta ? `<p class="ct-sug-suelta">El texto original cambió, así que esta sugerencia ya no engancha. Descartala y volvé a proponerla.</p>` : ""}
              ${c.decision ? `<p class="ct-sug-fallo ${c.decision}">${c.decision === "aceptada" ? "✓ Aceptada" : "✗ Descartada"}${c.decidido_por ? " por " + esc(c.decidido_por) : ""}</p>` : ""}
            </div>
            <div class="accs">
              ${(!c.decision && ed && !suelta) ? `<button class="acep" data-acepta="${c.id}" title="Aplicar este cambio al copy">✓</button>` : ""}
              ${(!c.decision && ed) ? `<button data-descarta="${c.id}" title="Descartar la sugerencia">✗</button>` : ""}
              ${mio && !c.decision ? `<button data-delcom="${c.id}" title="Eliminar">🗑</button>` : ""}
            </div>
          </div>`;
        }
        return `<div class="ct-com ${c.resuelto ? "resuelto" : ""}">
          <span class="av">${esc(iniciales(c.autor))}</span>
          <div class="cuerpo">
            <div class="quien">${esc(c.autor || c.autor_email || "—")}
              ${c.variante ? `<span class="ct-com-var">en la placa ${+c.variante}</span>` : ""}
              <span class="cuando">${hace(c.creado)}</span></div>
            <div class="texto">${esc(c.texto)}</div>
          </div>
          <div class="accs">
            ${(mio || ed) ? `<button data-res="${c.id}" title="${c.resuelto ? "Reabrir" : "Marcar como resuelto"}">${c.resuelto ? "↺" : "✓"}</button>` : ""}
            ${mio ? `<button data-delcom="${c.id}" title="Eliminar">✕</button>` : ""}
          </div>
        </div>`;
      }).join("") : `<p class="ct-com-vacio">Sin comentarios todavía. Podés escribir acá abajo, o seleccionar un tramo del copy para sugerir cómo debería quedar.</p>`}
      <div class="ct-com-alta">
        ${placasDe(m).length > 1 ? `<select class="ct-com-placa" data-nuevoplaca="${m.id}" title="¿Sobre qué es el comentario?">
          <option value="">Toda la pieza</option>
          ${placasDe(m).map((p, n) => `<option value="${n + 1}" ${(PLACA[m.id] || 0) === n ? "selected" : ""}>Placa ${n + 1}${p.pie ? " · " + esc(p.pie.slice(0, 22)) : ""}</option>`).join("")}
        </select>` : ""}
        <textarea data-nuevo="${m.id}" placeholder="Escribí un comentario o una sugerencia…" rows="1"></textarea>
        <button class="btn-mini" data-enviar="${m.id}">Enviar</button>
      </div>
    </div>`;
  }

  /* ========================= INTERACCIÓN ========================= */
  function avisar(id, txt, ok) {
    const el = document.querySelector(`[data-guardado="${id}"]`); if (!el) return;
    el.textContent = txt; el.className = "ct-guardado" + (ok ? " ok" : "");
    if (ok) setTimeout(() => { if (el.textContent === txt) el.textContent = ""; }, 2500);
  }

  function enganchar() {
    const cont = caja(); if (!cont) return;

    const sel = cont.querySelector(".ct-mes");
    if (sel) sel.onchange = async () => { MES = sel.value; ABIERTOS = {}; MOVIENDO = ""; await traerMes(MES); pintar(); };

    // Post / carrusel / reel: cambia el badge de la grilla, no el contenido.
    cont.querySelectorAll("[data-tipo]").forEach(s => {
      s.onchange = async () => {
        try { await guardarCampo(s.dataset.tipo, "tipo", s.value); pintar(); }
        catch (e) { alert("No se pudo cambiar el tipo de pieza."); }
      };
    });

    // Arrastrar baldosas del feed. Los listeners van por elemento (no se puede
    // delegar drag) y se vuelven a poner en cada pintado, que es cuando corre esto.
    let llevando = null;
    cont.querySelectorAll('.ct-bald[draggable="true"]').forEach(b => {
      b.addEventListener("dragstart", e => {
        llevando = b.dataset.bald; b.classList.add("llevando");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", llevando); } catch (x) { }
      });
      b.addEventListener("dragend", () => { llevando = null; b.classList.remove("llevando"); });
      b.addEventListener("dragover", e => { e.preventDefault(); b.classList.add("destino"); });
      b.addEventListener("dragleave", () => b.classList.remove("destino"));
      b.addEventListener("drop", e => {
        e.preventDefault(); b.classList.remove("destino");
        const desde = llevando || (e.dataTransfer && e.dataTransfer.getData("text/plain"));
        reordenarFeed(desde, b.dataset.bald);
      });
    });

    // Arrastrar en el CALENDARIO: soltar sobre un día cambia la fecha real de la
    // pieza (al revés que en el feed). El drop se escucha en el día (.ct-dia), no
    // en cada chip, así soltar en un hueco vacío del día también funciona.
    let llevandoCal = null;
    cont.querySelectorAll('.ct-chip[draggable="true"]').forEach(ch => {
      ch.addEventListener("dragstart", e => {
        llevandoCal = ch.dataset.ir; ch.classList.add("llevando");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", llevandoCal); } catch (x) { }
      });
      ch.addEventListener("dragend", () => { llevandoCal = null; ch.classList.remove("llevando"); });
    });
    cont.querySelectorAll(".ct-dia[data-dia]").forEach(dia => {
      dia.addEventListener("dragover", e => { e.preventDefault(); dia.classList.add("destino"); });
      dia.addEventListener("dragleave", () => dia.classList.remove("destino"));
      dia.addEventListener("drop", e => {
        e.preventDefault(); dia.classList.remove("destino");
        const desde = llevandoCal || (e.dataTransfer && e.dataTransfer.getData("text/plain"));
        moverFecha(desde, dia.dataset.dia);
      });
    });

    // El selector de fecha de la ficha: alternativa al arrastre para quien no
    // puede arrastrar (celular) o quiere elegir un día puntual sin ir al calendario.
    cont.querySelectorAll("[data-fechainput]").forEach(inp => {
      inp.addEventListener("change", () => { if (inp.value) moverFecha(inp.dataset.fechainput, inp.value, true); });
    });

    cont.onclick = async ev => {
      const t = ev.target;

      // Levantar / soltar una pieza a mano. Va ANTES que data-ir (el ✥ vive dentro
      // del chip) y antes que data-dia, porque tocar el ✥ no es abrir la ficha.
      const mv = t.closest("[data-mover]");
      if (mv) {
        const q = mv.dataset.mover;
        MOVIENDO = (!q || q === MOVIENDO) ? "" : q;
        if (MOVIENDO) VISTA = "calendario";
        pintar(); return;
      }
      // Con una pieza alzada, el próximo día que se toca es su fecha nueva. Es el
      // camino que sí funciona en el celular: el arrastre nativo no anda con el dedo.
      if (MOVIENDO) {
        const d = t.closest(".ct-dia[data-dia]");
        if (d) { await moverFecha(MOVIENDO, d.dataset.dia); return; }
      }

      const v = t.closest("[data-vista]");
      if (v) { VISTA = v.dataset.vista; MOVIENDO = ""; pintar(); return; }

      const fl = t.closest("[data-filtro]");
      if (fl) { FILTRO = fl.dataset.filtro; pintar(); return; }

      const ir = t.closest("[data-ir]");
      if (ir) { FOCO = ir.dataset.ir; VISTA = "fichas"; pintar(); return; }

      if (t.closest("[data-campana]")) {
        PANEL = !PANEL;
        if (PANEL) { pintar(); marcarVisto(); pintarBadgeNav(); }   // se resalta lo nuevo, y recién ahí se da por visto
        else pintar();
        return;
      }
      if (t.closest("[data-cerrar-panel]")) { PANEL = false; pintar(); return; }

      // un aviso lleva a su pieza, cambiando de mes —y de canal— si hace falta
      const av = t.closest("[data-ir-aviso]");
      if (av) {
        const idm = av.dataset.irAviso;
        const dato = [...AVISOS.sale, ...AVISOS.tarde].find(x => x.id === idm)
          || [...AVISOS.sugs, ...AVISOS.coms, ...AVISOS.mias].map(x => x._m).find(x => x && x.id === idm);
        const destino = av.dataset.irCanal || CANAL;
        PANEL = false; VISTA = "fichas"; FILTRO = "todos";
        // Otro canal = otra página. Se deja anotado a dónde ir y se navega: al
        // volver a entrar, renderContenidos levanta la nota.
        if (destino !== CANAL && CANALES[destino] && SES().irA) {
          PENDIENTE = { canal: destino, id: idm, mes: dato && dato.mes };
          SES().irA(CANALES[destino].pagina);
          return;
        }
        FOCO = idm; ABIERTOS[idm] = true;
        if (dato && dato.mes && dato.mes !== MES) { MES = dato.mes; traerMes(MES).then(pintar); return; }
        pintar(); return;
      }

      const acc = t.closest("[data-acc]");
      if (acc) return accion(acc.dataset.acc);

      const msg = t.closest(".ct-msg");
      const id = msg && msg.dataset.id;

      const coms = t.closest("[data-coms]");
      if (coms) { ABIERTOS[id] = !ABIERTOS[id]; pintar(); return; }

      const cop = t.closest("[data-copiar]");
      if (cop) return copiar(id);

      const est = t.closest("[data-est]");
      if (est) {
        const nuevo = est.dataset.est;
        try { await guardarCampo(id, "estado", nuevo); pintar(); }
        catch (e) { alert("No se pudo cambiar el estado. Puede que no tengas permiso."); }
        return;
      }

      /* ---- Placas (Instagram) ---- */
      const pSel = t.closest("[data-placa]");
      if (pSel) {
        const [pid, n] = pSel.dataset.placa.split(":");
        PLACA[pid] = +n; pintar(); return;
      }
      const pEst = t.closest("[data-placaest]");
      if (pEst) {
        const [pid, n, nuevo] = pEst.dataset.placaest.split(":");
        const m = MSGS.find(x => x.id === pid); if (!m) return;
        const pls = placasDe(m).slice(); if (!pls[+n]) return;
        pls[+n] = Object.assign({}, pls[+n], { estado: nuevo });
        // El `estado` de la pieza lo recalcula el trigger de la base: no se manda.
        try { await guardarCampo(pid, "placas", pls); pintar(); }
        catch (e) { alert("No se pudo cambiar el estado de la placa. Puede que no tengas permiso."); }
        return;
      }
      const cEst = t.closest("[data-copyest]");
      if (cEst) {
        const [pid, nuevo] = cEst.dataset.copyest.split(":");
        try { await guardarCampo(pid, "copy_estado", nuevo); pintar(); }
        catch (e) { alert("No se pudo cambiar el estado del copy."); }
        return;
      }
      if (t.closest("[data-addplaca]")) {
        const m = MSGS.find(x => x.id === id); if (!m) return;
        const pls = placasDe(m).slice();
        pls.push({ pie: "", nodo: "", png: "", estado: "borrador" });
        await guardarCampo(id, "placas", pls);
        PLACA[id] = pls.length - 1;
        // Con más de una placa ya es un carrusel; con una sola no se toca el tipo.
        if (pls.length > 1 && m.tipo !== "carrusel") await guardarCampo(id, "tipo", "carrusel");
        pintar(); return;
      }
      const dp = t.closest("[data-delplaca]");
      if (dp) {
        const [pid, n] = dp.dataset.delplaca.split(":");
        if (!confirm("¿Eliminar esta placa? Los comentarios que apunten a ella quedan sueltos.")) return;
        const m = MSGS.find(x => x.id === pid); if (!m) return;
        const pls = placasDe(m).slice(); pls.splice(+n, 1);
        await guardarCampo(pid, "placas", pls);
        PLACA[pid] = Math.max(0, +n - 1);
        if (pls.length < 2 && m.tipo === "carrusel") await guardarCampo(pid, "tipo", "post");
        pintar(); return;
      }
      const tp = t.closest("[data-trabaplaca]");
      if (tp) {
        alert(`Quedan ${tp.dataset.trabaplaca} comentario(s) sin resolver acá. Resolvelos en el hilo antes de aprobar.`);
        return;
      }

      if (t.closest("[data-del]")) {
        if (!confirm("¿Eliminar este mensaje del cronograma? No se puede deshacer.")) return;
        await fetch(url(`contenidos?id=eq.${id}`), { method: "DELETE", headers: head() });
        await traerMes(MES); pintar(); return;
      }

      const dv = t.closest("[data-delvar]");
      if (dv) {
        ev.preventDefault();
        if (!confirm("¿Eliminar esta variante?")) return;
        const m = MSGS.find(x => x.id === id);
        const vs = (m.variantes || []).slice(); vs.splice(+dv.dataset.delvar, 1);
        await guardarCampo(id, "variantes", vs); pintar(); return;
      }
      if (t.closest("[data-addvar]")) {
        const m = MSGS.find(x => x.id === id);
        const vs = (m.variantes || []).concat([{ titulo: "Nueva variante", copy: "", meta: {} }]);
        await guardarCampo(id, "variantes", vs); pintar(); return;
      }

      const ac = t.closest("[data-acepta]");
      if (ac) return aceptarSugerencia(ac.dataset.acepta);
      const ds = t.closest("[data-descarta]");
      if (ds) return descartarSugerencia(ds.dataset.descarta);
      const tr = t.closest("[data-trabado]");
      if (tr) { alert(`Quedan ${tr.dataset.trabado} sugerencia(s) sin resolver. Aceptalas o descartalas antes de aprobar el mensaje.`); return; }
      // click en un tramo sugerido → abre el hilo y resalta la ficha de esa sugerencia
      const dl = t.closest("[data-sug]");
      if (dl) {
        ABIERTOS[id] = true; pintar();
        const card = document.querySelector(`[data-sugcard="${dl.dataset.sug}"]`);
        if (card) { card.scrollIntoView({ block: "center", behavior: "smooth" }); card.classList.add("pulso"); }
        return;
      }

      const env = t.closest("[data-enviar]");
      if (env) return enviarComentario(env.dataset.enviar);

      const res = t.closest("[data-res]");
      if (res) {
        const c = (COMS[id] || []).find(x => x.id === res.dataset.res);
        await fetch(url(`contenidos_comentarios?id=eq.${res.dataset.res}`), {
          method: "PATCH", headers: head(), body: JSON.stringify({ resuelto: !(c && c.resuelto) }),
        });
        await traerMes(MES); pintar(); return;
      }
      const dc = t.closest("[data-delcom]");
      if (dc) {
        await fetch(url(`contenidos_comentarios?id=eq.${dc.dataset.delcom}`), { method: "DELETE", headers: head() });
        await traerMes(MES); pintar(); return;
      }
    };

    // Enter manda el comentario; Shift+Enter hace salto de línea.
    // onkeydown (y no addEventListener): enganchar() corre en CADA repintado y los
    // listeners se irían acumulando → el mismo Enter publicaría N comentarios.
    cont.onkeydown = ev => {
      const ta = ev.target.closest("[data-nuevo]");
      if (ta && ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); enviarComentario(ta.dataset.nuevo); }
    };

    if (!puedeEditar()) return;

    // ---- Edición inline: se guarda al salir del campo, sólo si cambió ----
    cont.querySelectorAll('[contenteditable="true"]').forEach(el => {
      el.dataset.orig = el.dataset.raw ? el.innerText : el.textContent;
      // pegar siempre como texto plano: si entra HTML, el copy deja de ser fiel al de WhatsApp
      el.addEventListener("paste", ev => {
        ev.preventDefault();
        document.execCommand("insertText", false, (ev.clipboardData || window.clipboardData).getData("text/plain"));
      });
      el.addEventListener("blur", () => guardarEdicion(el));
      // Escape descarta lo tipeado y deja el valor anterior
      el.addEventListener("keydown", ev => {
        if (ev.key === "Escape") { el.textContent = el.dataset.orig; el.blur(); }
      });
    });
  }

  async function guardarEdicion(el) {
    const nuevo = (el.dataset.raw ? el.innerText : el.textContent).replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");
    if (nuevo === el.dataset.orig) return;

    // Campos de la cabecera del mes
    if (el.dataset.cabc) {
      const { col, val } = conCampo(CAB, el.dataset.cabc, nuevo);
      const ok = await guardarCab(col, val);
      if (ok) el.dataset.orig = nuevo; else { el.textContent = el.dataset.orig; alert("No se pudo guardar."); }
      return;
    }
    const msg = el.closest(".ct-msg"); if (!msg) return;
    const id = msg.dataset.id;
    const fila = MSGS.find(m => m.id === id); if (!fila) return;
    const { col, val } = conCampo(fila, el.dataset.c, nuevo);
    avisar(id, "Guardando…", false);
    try {
      await guardarCampo(id, col, val);
      el.dataset.orig = nuevo;
      if (el.dataset.raw) el.innerHTML = copyHTML(nuevo);   // re-marca los *asteriscos*
      avisar(id, "Guardado ✓", true);
    } catch (e) {
      el.textContent = el.dataset.orig;
      avisar(id, "No se pudo guardar", false);
    }
  }

  async function enviarComentario(id) {
    const ta = document.querySelector(`[data-nuevo="${id}"]`); if (!ta) return;
    const texto = ta.value.trim(); if (!texto) return;
    // En un carrusel el comentario apunta a una placa: es lo que traba SU aprobación.
    const selP = document.querySelector(`[data-nuevoplaca="${id}"]`);
    const variante = selP && selP.value ? +selP.value : null;
    ta.disabled = true;
    const r = await fetch(url("contenidos_comentarios"), {
      method: "POST", headers: head({ Prefer: "return=representation" }),
      body: JSON.stringify([{ contenido_id: id, texto, variante,
        autor: SES().nombre ? SES().nombre() : "", autor_email: SES().email ? SES().email() : "" }]),
    });
    ta.disabled = false;
    if (!r.ok) { alert("No se pudo publicar el comentario."); return; }
    ta.value = "";
    await traerMes(MES); pintar();
  }

  function copiar(id) {
    const m = MSGS.find(x => x.id === id); if (!m) return;
    const vs = m.variantes || [];
    let txt = m.copy || "";
    if (vs.length) {
      // con variantes se copia la que está abierta; si hay varias, todas rotuladas
      const abiertas = Array.from(document.querySelectorAll(`.ct-msg[data-id="${id}"] details.ct-v`))
        .map((d, i) => d.open ? i : -1).filter(i => i >= 0);
      const elegidas = abiertas.length ? abiertas : vs.map((_, i) => i);
      txt = elegidas.map(i => (elegidas.length > 1 ? `— ${vs[i].titulo} —\n` : "") + (vs[i].copy || "")).join("\n\n");
    }
    navigator.clipboard.writeText(txt)
      .then(() => avisar(id, "Copiado ✓", true))
      .catch(() => avisar(id, "No se pudo copiar", false));
  }

  /* ---- Acciones de la barra ---- */
  async function accion(a) {
    if (a === "refrescar") { await traerMeses(); await Promise.all([traerMes(MES), traerAvisos()]); pintar(); return; }

    if (a === "nuevo-mes") {
      const m = (prompt("¿Qué mes? Formato AAAA-MM (ej: 2026-10)") || "").trim();
      if (!/^\d{4}-\d{2}$/.test(m)) { if (m) alert("El formato tiene que ser AAAA-MM."); return; }
      if (MESES.some(x => x.mes === m)) { MES = m; await traerMes(MES); pintar(); return; }
      const titulo = (prompt("Título del mes (el eje del cronograma):") || "").trim();
      const r = await fetch(url("contenidos_meses"), {
        method: "POST", headers: head({ Prefer: "return=representation" }),
        body: JSON.stringify([{
          mes: m, canal: CANAL, titulo, eyebrow: C().eyebrow(m),
          brief: [{ h: "Objetivo", p: "" }, { h: "Recursos", p: "" }, { h: "Cadencia", p: "" }],
          autor: SES().nombre ? SES().nombre() : "", autor_email: SES().email ? SES().email() : "",
        }]),
      });
      if (!r.ok) { alert("No se pudo crear el mes."); return; }
      MES = m; await traerMeses(); await traerMes(MES); pintar(); return;
    }

    if (a === "nuevo-msg") {
      if (!MES) return;
      const f = (prompt(`Fecha ${CANAL === "instagram" ? "de la pieza" : "del mensaje"} (AAAA-MM-DD):`, `${MES}-01`) || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) { if (f) alert("El formato tiene que ser AAAA-MM-DD."); return; }
      const r = await fetch(url("contenidos"), {
        method: "POST", headers: head({ Prefer: "return=representation" }),
        body: JSON.stringify([{
          mes: MES, canal: CANAL, fecha: f, criterio: C().nuevo, objetivo: "", copy: "", meta: {},
          orden: MSGS.length, autor: SES().nombre ? SES().nombre() : "", autor_email: SES().email ? SES().email() : "",
        }]),
      });
      if (!r.ok) { alert(`No se pudo crear ${CANAL === "instagram" ? "la pieza" : "el mensaje"}.`); return; }
      VISTA = "fichas"; await traerMes(MES);
      FOCO = ((await r.json())[0] || {}).id || ""; pintar(); return;
    }

    if (a === "exportar") return exportar();

    if (a === "importar") {
      // El input vive DENTRO del contenedor del canal: con los dos canales en el
      // DOM, un id global agarraba el de la página escondida.
      const f = caja() && caja().querySelector(".ct-file"); if (!f) return;
      f.onchange = () => { const file = f.files[0]; if (file) importar(file); f.value = ""; };
      f.click(); return;
    }
  }

  function exportar() {
    if (!CAB) return;
    const d = {
      mes: CAB.mes, canal: CAB.canal || CANAL,
      titulo: CAB.titulo, eyebrow: CAB.eyebrow, dek: CAB.dek,
      brief: CAB.brief, obras: CAB.obras,
      mensajes: MSGS.map(m => ({
        fecha: m.fecha, criterio: m.criterio, objetivo: m.objetivo, flag: m.flag || undefined,
        estado: m.estado, copy: m.copy || undefined, meta: m.meta,
        encuesta: m.encuesta || undefined,
        lead: m.lead || undefined,
        variantes: (m.variantes || []).length ? m.variantes : undefined,
        // Instagram: el carrusel y su aprobación por placa. WhatsApp no los trae.
        tipo: m.tipo && m.tipo !== "post" ? m.tipo : undefined,
        placas: (m.placas || []).length ? m.placas : undefined,
        copy_estado: (m.placas || []).length ? m.copy_estado : undefined,
        figma_file: m.figma_file || undefined,
      })),
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }));
    // El canal va en el nombre: un mes puede estar dos veces en la misma carpeta.
    a.download = `contenidos-${CANAL}-${CAB.mes}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // Importa un mes entero. Si el mes ya existe pide confirmación y REEMPLAZA sus
  // mensajes (los comentarios se van con ellos: por eso el aviso es explícito).
  async function importar(file) {
    let d; try { d = JSON.parse(await file.text()); } catch (e) { alert("Ese archivo no es un .json válido."); return; }
    if (!d || !d.mes || !Array.isArray(d.mensajes)) { alert("Al .json le falta 'mes' o 'mensajes'."); return; }

    // Un .json sin canal es de antes de los canales: es de WhatsApp. Y si trae uno
    // que no es el que estás mirando, se avisa en vez de mezclar los cronogramas.
    const canalJson = d.canal || "whatsapp";
    if (canalJson !== CANAL) {
      alert(`Ese archivo es del cronograma de ${(CANALES[canalJson] || {}).corto || canalJson}` +
            ` y estás parada en ${C().corto}.\n\nAbrí la solapa de ${(CANALES[canalJson] || {}).corto || canalJson} e importalo desde ahí.`);
      return;
    }

    const existe = MESES.some(x => x.mes === d.mes);
    if (existe && !confirm(`${cap(mesLabel(d.mes))} de ${C().corto} ya está cargado.\n\nImportar REEMPLAZA sus ${C().unidadPl} y borra los comentarios que tengan. ¿Seguir?`)) return;

    const autor = SES().nombre ? SES().nombre() : "", email = SES().email ? SES().email() : "";
    const cab = {
      mes: d.mes, canal: CANAL, titulo: d.titulo || "", eyebrow: d.eyebrow || "", dek: d.dek || "",
      brief: d.brief || [], obras: d.obras || [],
      autor, autor_email: email,
    };
    let r = await fetch(url("contenidos_meses"), {
      method: "POST", headers: head({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify([cab]),
    });
    if (!r.ok) { alert("No se pudo crear el mes. ¿Corriste el SQL de contenidos?"); return; }

    if (existe) await fetch(url(`contenidos?mes=eq.${enc(d.mes)}&canal=eq.${CANAL}`), { method: "DELETE", headers: head() });

    const filas = d.mensajes.map((m, i) => ({
      mes: d.mes, canal: CANAL, fecha: m.fecha, criterio: m.criterio || "", objetivo: m.objetivo || "",
      flag: m.flag || "", copy: m.copy || "", meta: m.meta || {},
      encuesta: m.encuesta || null, lead: m.lead || "", variantes: m.variantes || [],
      tipo: m.tipo || "post", placas: m.placas || [], copy_estado: m.copy_estado || "borrador",
      figma_file: m.figma_file || null,
      estado: m.estado || "borrador", orden: i, autor, autor_email: email,
    }));
    r = await fetch(url("contenidos"), { method: "POST", headers: head({ Prefer: "return=minimal" }), body: JSON.stringify(filas) });
    if (!r.ok) { alert(`El mes se creó pero fallaron ${C().unidadPl}:\n` + (await r.text()).slice(0, 300)); }

    MES = d.mes; await traerMeses(); await traerMes(MES); pintar();
  }

  /* ===================== AVISOS (la campanita) =====================
     No hay mail: los avisos ESPERAN a la persona en la plataforma. Por eso el
     contenido del panel se calcula SIEMPRE contra la base (lo que está pendiente
     de verdad, sin importar el mes abierto) y la marca de "visto" sólo decide
     qué se resalta como nuevo.

     Esa marca vive en localStorage, o sea que es por dispositivo. Es a propósito:
     evita otra migración y no se pierde nada, porque si se desincroniza lo único
     que cambia es el número del globo, nunca la lista.                        */
  const VISTO_KEY = "contenidos_visto_v1";
  const vistoEn = () => { try { return +localStorage.getItem(VISTO_KEY) || 0; } catch (e) { return 0; } };
  const marcarVisto = () => { try { localStorage.setItem(VISTO_KEY, String(Date.now())); } catch (e) { } };
  let AVISOS = { sale: [], tarde: [], sugs: [], coms: [], mias: [], cargado: false };
  let PANEL = false;

  async function traerAvisos() {
    if (!(SES().puedeVerContenidos && SES().puedeVerContenidos())) return;
    const hoy = hoyISO();
    const atras = new Date(); atras.setDate(atras.getDate() - 10);
    const desde = `${atras.getFullYear()}-${String(atras.getMonth() + 1).padStart(2, "0")}-${String(atras.getDate()).padStart(2, "0")}`;
    try {
      const [rm, rs, rc] = await Promise.all([
        // La campanita NO se filtra por canal: es una sola y avisa de todos.
        fetch(url(`contenidos?fecha=gte.${desde}&fecha=lte.${hoy}&select=id,mes,canal,fecha,criterio,estado&order=fecha.asc`), { headers: head() }),
        fetch(url("contenidos_comentarios?tipo=eq.sugerencia&select=*&order=creado.desc&limit=60"), { headers: head() }),
        fetch(url("contenidos_comentarios?tipo=eq.comentario&resuelto=is.false&select=*&order=creado.desc&limit=40"), { headers: head() }),
      ]);
      const msgs = rm.ok ? await rm.json() : [];
      const sugs = rs.ok ? await rs.json() : [];
      const coms = rc.ok ? await rc.json() : [];
      const yo = (SES().email() || "").toLowerCase();

      AVISOS = {
        // Lo que sale hoy, y lo que ya debería haber salido sin estar aprobado.
        sale:  msgs.filter(m => m.fecha === hoy),
        tarde: msgs.filter(m => m.fecha < hoy && m.estado !== "aprobado"),
        sugs:  sugs.filter(g => !g.decision),
        coms:  coms.filter(c => String(c.autor_email || "").toLowerCase() !== yo),
        // Para quien sugiere: en qué terminó lo suyo.
        mias:  sugs.filter(g => g.decision && String(g.autor_email || "").toLowerCase() === yo),
        cargado: true,
      };
      // nombre del mensaje al que pertenece cada sugerencia/comentario
      const ids = [...new Set([...AVISOS.sugs, ...AVISOS.coms, ...AVISOS.mias].map(x => x.contenido_id))];
      if (ids.length) {
        const r = await fetch(url(`contenidos?id=in.(${ids.join(",")})&select=id,mes,canal,fecha,criterio`), { headers: head() });
        if (r.ok) {
          const por = {}; (await r.json()).forEach(m => { por[m.id] = m; });
          [...AVISOS.sugs, ...AVISOS.coms, ...AVISOS.mias].forEach(x => { x._m = por[x.contenido_id]; });
        }
      }
    } catch (e) { }
  }

  // Cuántos avisos son NUEVOS desde la última vez que se abrió el panel.
  function cuentaAvisos() {
    const v = vistoEn(), ed = puedeEditar();
    const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0);
    let n = 0;
    if (ed) {
      n += AVISOS.sugs.filter(g => Date.parse(g.creado) > v).length;
      n += AVISOS.coms.filter(c => Date.parse(c.creado) > v).length;
      if (v < +hoy0) n += AVISOS.sale.length + AVISOS.tarde.length;   // el recordatorio del día, una vez por día
    } else {
      n += AVISOS.mias.filter(g => Date.parse(g.decidido_en || g.creado) > v).length;
    }
    return n;
  }

  // El contador también en la solapa del módulo, para verlo desde cualquier lado.
  function pintarBadgeNav() {
    const b = document.querySelector('#nav [data-mod="contenidos"]'); if (!b) return;
    const n = cuentaAvisos();
    let p = b.querySelector(".ct-navpunto");
    if (!n) { if (p) p.remove(); return; }
    if (!p) { p = document.createElement("span"); p.className = "ct-navpunto"; b.appendChild(p); }
    p.textContent = n > 9 ? "9+" : String(n);
  }

  // app.js llama a esto al terminar de arrancar, para que el contador aparezca
  // aunque la persona todavía no haya entrado al módulo.
  window.avisosContenidos = async function () { await traerAvisos(); pintarBadgeNav(); };

  function panelHTML() {
    const ed = puedeEditar(), v = vistoEn();
    const nuevo = ts => Date.parse(ts) > v ? " nuevo" : "";
    // Cada aviso sabe de qué canal es: si no es el que estás mirando, lo dice y
    // el click cambia de solapa antes de llevarte a la pieza.
    const linea = (id, cls, ic, txt, sub, canal) => {
      const cn = canal || CANAL;
      const otro = cn !== CANAL && CANALES[cn] ? ` <span class="ct-aviso-canal">${CANALES[cn].icono} ${esc(CANALES[cn].corto)}</span>` : "";
      return `<button class="ct-aviso${cls}" data-ir-aviso="${id}" data-ir-canal="${esc(cn)}"><span class="ic">${ic}</span>
        <span class="tx">${txt}${otro}${sub ? `<small>${sub}</small>` : ""}</span></button>`;
    };
    const cuando2 = f => { const c = cuando(f); return c.t; };

    let cuerpo = "";
    if (ed) {
      if (AVISOS.tarde.length) cuerpo += `<h5>Ya tendrían que haber salido</h5>` +
        AVISOS.tarde.map(m => linea(m.id, " urgente", "!", esc(m.criterio || "Sin título"),
          `${m.fecha.slice(8)}/${m.fecha.slice(5, 7)} · ${ESTADOS[m.estado] ? ESTADOS[m.estado].t : m.estado} · ${cuando2(m.fecha)}`,
          m.canal)).join("");
      if (AVISOS.sale.length) cuerpo += `<h5>Sale hoy</h5>` +
        AVISOS.sale.map(m => linea(m.id, "", "📤", esc(m.criterio || "Sin título"),
          ESTADOS[m.estado] ? ESTADOS[m.estado].t : m.estado, m.canal)).join("");

      // Las sugerencias se agrupan por día: un bloque, no un aviso por cada una.
      if (AVISOS.sugs.length) {
        const porDia = {};
        AVISOS.sugs.forEach(g => { const d = String(g.creado).slice(0, 10); (porDia[d] = porDia[d] || []).push(g); });
        cuerpo += `<h5>Sugerencias sin resolver</h5>`;
        Object.keys(porDia).sort().reverse().forEach(d => {
          const c = cuando(d);
          cuerpo += `<p class="ct-aviso-dia">${c.t === "hoy" ? "Hoy" : c.t === "ayer" ? "Ayer" : d.slice(8) + "/" + d.slice(5, 7)} · ${porDia[d].length}</p>` +
            porDia[d].map(g => linea(g.contenido_id, nuevo(g.creado), "✎",
              `${esc(g.autor || "Alguien")} en <b>${esc((g._m || {}).criterio || "algo del mes")}</b>`,
              `«${esc((g.original || "").slice(0, 40))}» → «${esc((g.propuesto || "").slice(0, 40))}»`,
              (g._m || {}).canal)).join("");
        });
      }
      if (AVISOS.coms.length) cuerpo += `<h5>Comentarios sin resolver</h5>` +
        AVISOS.coms.map(c => linea(c.contenido_id, nuevo(c.creado), "💬",
          `${esc(c.autor || "Alguien")} en <b>${esc((c._m || {}).criterio || "algo del mes")}</b>`,
          esc((c.texto || "").slice(0, 60)), (c._m || {}).canal)).join("");
    } else if (AVISOS.mias.length) {
      cuerpo += `<h5>Tus sugerencias</h5>` +
        AVISOS.mias.slice(0, 15).map(g => linea(g.contenido_id, nuevo(g.decidido_en || g.creado),
          g.decision === "aceptada" ? "✓" : "✗",
          `<b>${g.decision === "aceptada" ? "Aceptada" : "Descartada"}</b>${g.decidido_por ? " por " + esc(g.decidido_por) : ""}`,
          `«${esc((g.original || "").slice(0, 45))}»`, (g._m || {}).canal)).join("");
    }

    return `<div class="ct-panel">
      <div class="ct-panel-cab"><b>Avisos</b><button data-cerrar-panel="1" title="Cerrar">✕</button></div>
      ${cuerpo || `<p class="ct-com-vacio" style="padding:14px">Nada pendiente por ahora.</p>`}
    </div>`;
  }

  /* ===================== SUGERIR UN CAMBIO ===================== 
     Se selecciona un tramo del copy y aparece un botón flotante. Los offsets se
     calculan CONTRA EL TEXTO FUENTE en el momento de la selección, así que el
     botón puede robar el foco sin problema.                                     */
  let TOOL = null;
  function ocultarTool() { if (TOOL) { TOOL.remove(); TOOL = null; } }

  function montarSeleccion() {
    document.addEventListener("mouseup", ev => {
      if (ev.target.closest && ev.target.closest(".ct-seltool")) return;   // click dentro del propio panel
      setTimeout(verSeleccion, 0);
    });
    document.addEventListener("keyup", ev => { if (ev.key === "Escape") ocultarTool(); });
    // El botón chico se esconde al hacer scroll, pero el cuadro ABIERTO no:
    // ahí ya hay texto tipeado y perderlo por moverse un poco sería inaceptable.
    window.addEventListener("scroll", () => {
      if (TOOL && !TOOL.classList.contains("abierto")) ocultarTool();
    }, true);
  }

  function verSeleccion() {
    ocultarTool();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    const nodo = r.startContainer.nodeType === Node.TEXT_NODE ? r.startContainer.parentElement : r.startContainer;
    const cont = nodo && nodo.closest && nodo.closest(".ct-copy[data-c]");
    if (!cont || !cont.contains(r.endContainer)) return;

    const desde = offsetFuente(cont, r.startContainer, r.startOffset);
    const hasta = offsetFuente(cont, r.endContainer, r.endOffset);
    if (desde < 0 || hasta < 0 || hasta <= desde) return;

    const msg = cont.closest(".ct-msg"); if (!msg) return;
    const m = MSGS.find(x => x.id === msg.dataset.id); if (!m) return;
    const campo = cont.dataset.c;
    const txt = leerCampo(m, campo);
    if (typeof txt !== "string" || txt.slice(desde, hasta) !== r.toString()) return;  // desalineado: no arriesgamos
    // no permitir dos sugerencias sobre el mismo tramo
    if (sugsDe(m, campo).some(g => desde < g.hasta && hasta > g.desde)) return;

    const caja = r.getBoundingClientRect();
    TOOL = document.createElement("div");
    TOOL.className = "ct-seltool";
    TOOL.dataset.id = m.id; TOOL.dataset.campo = campo;
    TOOL.dataset.desde = desde; TOOL.dataset.hasta = hasta;
    TOOL.innerHTML = `<button data-abrir="1">✎ Sugerir cambio</button>`;
    document.body.appendChild(TOOL);
    TOOL.style.top = Math.min(innerHeight - 60, caja.bottom + 8) + "px";
    TOOL.style.left = Math.max(8, Math.min(innerWidth - TOOL.offsetWidth - 8, caja.left)) + "px";

    TOOL.onclick = ev => {
      if (ev.target.closest("[data-abrir]")) return abrirComposer(txt.slice(desde, hasta));
      if (ev.target.closest("[data-cancelar]")) return ocultarTool();
      if (ev.target.closest("[data-enviar-sug]")) return enviarSugerencia();
    };
  }

  function abrirComposer(original) {
    TOOL.classList.add("abierto");
    TOOL.innerHTML = `
      <p class="ct-seltool-t">Cómo debería quedar</p>
      <div class="ct-seltool-orig"><del>${esc(original)}</del></div>
      <textarea class="ct-seltool-ta" rows="2" spellcheck="false"></textarea>
      <input class="ct-seltool-porque" placeholder="Por qué (opcional)">
      <div class="ct-seltool-accs">
        <button class="btn-mini" data-cancelar="1">Cancelar</button>
        <button class="btn-mini on" data-enviar-sug="1">Sugerir</button>
      </div>`;
    const ta = TOOL.querySelector(".ct-seltool-ta");
    ta.value = original; ta.focus({ preventScroll: true }); ta.select();
    TOOL.dataset.original = original;
    ta.addEventListener("keydown", ev => {
      if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); enviarSugerencia(); }
      if (ev.key === "Escape") ocultarTool();
    });
    // Al abrirse el cuadro crece mucho: hay que reubicarlo en los DOS ejes o se
    // sale de la pantalla (se notaba en celular, donde ocupa casi todo el ancho).
    const caja = TOOL.getBoundingClientRect();
    if (caja.bottom > innerHeight - 8) TOOL.style.top = Math.max(8, innerHeight - caja.height - 8) + "px";
    TOOL.style.left = Math.max(8, Math.min(innerWidth - caja.width - 8, caja.left)) + "px";
  }

  async function enviarSugerencia() {
    const t = TOOL; if (!t) return;
    const propuesto = t.querySelector(".ct-seltool-ta").value;
    const porque = t.querySelector(".ct-seltool-porque").value.trim();
    const original = t.dataset.original;
    if (propuesto === original) { alert("El texto propuesto es igual al original."); return; }
    const fila = {
      contenido_id: t.dataset.id, tipo: "sugerencia", campo: t.dataset.campo,
      desde: +t.dataset.desde, hasta: +t.dataset.hasta, original, propuesto,
      texto: porque, autor: SES().nombre ? SES().nombre() : "", autor_email: SES().email ? SES().email() : "",
    };
    const id = t.dataset.id;
    ocultarTool();
    const r = await fetch(url("contenidos_comentarios"), {
      method: "POST", headers: head({ Prefer: "return=minimal" }), body: JSON.stringify([fila]),
    });
    if (!r.ok) { alert("No se pudo guardar la sugerencia."); return; }
    ABIERTOS[id] = true;
    await traerMes(MES); pintar();
  }

  const patchCom = (id, datos) => fetch(url(`contenidos_comentarios?id=eq.${id}`), {
    method: "PATCH", headers: head(), body: JSON.stringify(datos),
  });

  // Aceptar = aplicar el reemplazo al copy de verdad, y correr las demás
  // sugerencias del mismo campo para que sigan apuntando donde corresponde.
  async function aceptarSugerencia(id) {
    const m = MSGS.find(x => (COMS[x.id] || []).some(c => c.id === id)); if (!m) return;
    const g = (COMS[m.id] || []).find(c => c.id === id); if (!g) return;
    const txt = leerCampo(m, g.campo);
    if (typeof txt !== "string" || txt.slice(g.desde, g.hasta) !== g.original) {
      alert("El texto original ya cambió, así que esta sugerencia no se puede aplicar. Descartala y volvé a proponerla.");
      return;
    }
    const nuevo = txt.slice(0, g.desde) + g.propuesto + txt.slice(g.hasta);
    const { col, val } = conCampo(m, g.campo, nuevo);
    try { await guardarCampo(m.id, col, val); }
    catch (e) { alert("No se pudo aplicar el cambio. Puede que no tengas permiso."); return; }

    const delta = g.propuesto.length - g.original.length;
    for (const o of (COMS[m.id] || [])) {
      if (o.id === id || o.tipo !== "sugerencia" || o.decision || o.campo !== g.campo) continue;
      const esperado = o.desde >= g.hasta ? o.desde + delta : o.desde;
      let d = null;
      if (nuevo.slice(esperado, esperado + o.original.length) === o.original) d = esperado;
      else { const i = nuevo.indexOf(o.original); if (i >= 0) d = i; }
      if (d != null && d !== o.desde) await patchCom(o.id, { desde: d, hasta: d + o.original.length });
    }
    await patchCom(id, { decision: "aceptada", decidido_por: SES().nombre ? SES().nombre() : "", decidido_en: new Date().toISOString() });
    await traerMes(MES); pintar();
  }

  async function descartarSugerencia(id) {
    await patchCom(id, { decision: "descartada", decidido_por: SES().nombre ? SES().nombre() : "", decidido_en: new Date().toISOString() });
    await traerMes(MES); pintar();
  }

  /* ---- Refresco suave: trae comentarios y cambios de otros sin pisar lo que estás escribiendo ---- */
  function arrancarRefresco() {
    if (TIMER) return;
    TIMER = setInterval(async () => {
      const sec = $("#page-" + C().pagina);
      if (!sec || sec.classList.contains("hidden") || document.hidden) return;
      const foco = document.activeElement;
      if (foco && (foco.isContentEditable || foco.tagName === "TEXTAREA")) return;   // estás editando: no toco nada
      await Promise.all([traerMes(MES), traerAvisos()]); pintar();
    }, 30000);
  }
})();
