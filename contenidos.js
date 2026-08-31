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

  /* ---- Estado en memoria ---- */
  let MESES = [];        // [{mes, titulo, ...}] — para el selector
  let MES = "";          // mes abierto ('2026-09')
  let CAB = null;        // fila de contenidos_meses del mes abierto
  let MSGS = [];         // filas de contenidos, ordenadas
  let COMS = {};         // contenido_id -> [comentarios]
  let VISTA = "fichas";  // 'calendario' | 'fichas'
  let ABIERTOS = {};     // contenido_id -> true si el hilo de comentarios está desplegado
  let FOCO = "";         // ficha a resaltar al venir desde el calendario
  let TIMER = null;

  const ESTADOS = {
    borrador: { t: "Borrador" },
    revision: { t: "En revisión" },
    cambios:  { t: "Cambios pedidos" },
    aprobado: { t: "Aprobado" },
  };
  const MES_NOMBRE = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                      "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const DIA_CORTO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  /* ---- Utilidades ---- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // 'YYYY-MM-DD' → Date local. Sin new Date(str): eso interpreta UTC y corre un día.
  const aFecha = s => { const p = String(s || "").split("-"); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); };
  const mesLabel = m => { const p = String(m || "").split("-"); return p.length < 2 ? m : `${MES_NOMBRE[(+p[1]) - 1] || ""} ${p[0]}`; };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

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

  /* ========================= DATOS ========================= */
  async function traerMeses() {
    const r = await fetch(url("contenidos_meses?select=*&order=mes.desc"), { headers: head() });
    MESES = r.ok ? await r.json() : [];
  }
  async function traerMes(mes) {
    if (!mes) { CAB = null; MSGS = []; COMS = {}; return; }
    const [rc, rm] = await Promise.all([
      fetch(url(`contenidos_meses?mes=eq.${encodeURIComponent(mes)}&select=*`), { headers: head() }),
      fetch(url(`contenidos?mes=eq.${encodeURIComponent(mes)}&select=*&order=fecha.asc,orden.asc`), { headers: head() }),
    ]);
    CAB = rc.ok ? (await rc.json())[0] || null : null;
    MSGS = rm.ok ? await rm.json() : [];
    COMS = {};
    if (MSGS.length) {
      const ids = MSGS.map(m => m.id).join(",");
      const rk = await fetch(url(`contenidos_comentarios?contenido_id=in.(${ids})&select=*&order=creado.asc`), { headers: head() });
      if (rk.ok) (await rk.json()).forEach(c => { (COMS[c.contenido_id] = COMS[c.contenido_id] || []).push(c); });
    }
  }
  async function guardarCampo(id, col, val) {
    const body = {}; body[col] = val;
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
    const r = await fetch(url(`contenidos_meses?mes=eq.${encodeURIComponent(MES)}`), {
      method: "PATCH", headers: head({ Prefer: "return=representation" }), body: JSON.stringify(body),
    });
    if (r.ok) { const f = (await r.json())[0]; if (f) CAB = f; }
    return r.ok;
  }

  /* ========================= RENDER ========================= */
  window.renderContenidos = async function () {
    const cont = $("#contenidos"); if (!cont) return;
    if (!(SES().puedeVerContenidos && SES().puedeVerContenidos())) {
      cont.innerHTML = `<div class="empty">No tenés acceso a esta sección.</div>`; return;
    }
    if (!MESES.length) {
      cont.innerHTML = `<div class="empty-mini">Cargando cronograma…</div>`;
      await traerMeses();
      MES = MES || (MESES[0] && MESES[0].mes) || "";
      await traerMes(MES);
    }
    pintar();
    arrancarRefresco();
  };

  function pintar() {
    const cont = $("#contenidos"); if (!cont) return;
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
                    <input type="file" id="ctFile" accept="application/json" hidden>
                  </div>`
                : `<p class="ct-com-vacio">Pedile a Coordinación que cargue el mes.</p>`}
        </div>`;
      enganchar(); return;
    }

    cont.innerHTML = barraHTML(ed) + cabeceraHTML(ed) +
      (VISTA === "calendario" ? calendarioHTML() : fichasHTML(ed));
    enganchar();

    if (FOCO) {
      const el = document.querySelector(`.ct-msg[data-id="${FOCO}"]`);
      if (el) { el.scrollIntoView({ block: "start", behavior: "smooth" }); el.classList.add("destacada"); }
      FOCO = "";
    }
  }

  function barraHTML(ed) {
    const cuenta = { borrador: 0, revision: 0, cambios: 0, aprobado: 0 };
    MSGS.forEach(m => { cuenta[m.estado] = (cuenta[m.estado] || 0) + 1; });
    const avance = Object.keys(ESTADOS)
      .filter(k => cuenta[k])
      .map(k => `<span class="ct-est ${k}"><span class="n">${cuenta[k]}</span> ${ESTADOS[k].t}</span>`).join("");
    return `
      <div class="ct-bar">
        <select class="ct-mes" id="ctMes">
          ${MESES.map(m => `<option value="${esc(m.mes)}" ${m.mes === MES ? "selected" : ""}>${cap(mesLabel(m.mes))} — ${esc(m.titulo || "sin título")}</option>`).join("")}
        </select>
        <div class="ct-vistas">
          <button data-vista="calendario" class="${VISTA === "calendario" ? "on" : ""}">📅 Calendario</button>
          <button data-vista="fichas" class="${VISTA === "fichas" ? "on" : ""}">🗂 Fichas</button>
        </div>
        <div class="ct-avance">${avance || '<span class="ct-com-vacio">Mes sin mensajes.</span>'}</div>
        <div class="ct-acc">
          <button class="btn-desc" data-acc="refrescar" title="Traer los últimos cambios y comentarios">↻</button>
          ${ed ? `<button class="btn-desc" data-acc="nuevo-msg">+ Mensaje</button>
                  <button class="btn-desc" data-acc="nuevo-mes">+ Mes</button>
                  <button class="btn-desc" data-acc="importar" title="Cargar un mes desde un .json">⬆ Importar</button>
                  <button class="btn-desc" data-acc="exportar" title="Bajar este mes como .json">⬇ Exportar</button>
                  <input type="file" id="ctFile" accept="application/json" hidden>` : ""}
        </div>
      </div>
      ${ed ? "" : `<div class="ct-solo-lectura">Podés leer todo el mes y dejar comentarios o sugerencias en cada mensaje. La edición y la aprobación las hace Coordinación.</div>`}`;
  }

  function cabeceraHTML(ed) {
    if (!CAB) return "";
    const e = ed ? ' contenteditable="true" spellcheck="false"' : "";
    const brief = Array.isArray(CAB.brief) ? CAB.brief : [];
    const obras = Array.isArray(CAB.obras) ? CAB.obras : [];
    const pend = Array.isArray(CAB.pendientes) ? CAB.pendientes : [];
    return `
      <div class="ct-head" data-cab="1">
        <p class="ct-eyebrow"${e} data-cabc="eyebrow">${esc(CAB.eyebrow || "")}</p>
        <h2 class="ct-titulo"${e} data-cabc="titulo">${esc(CAB.titulo || "")}</h2>
        <p class="ct-dek"${e} data-cabc="dek">${esc(CAB.dek || "")}</p>
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
        ${pend.length ? `<div class="ct-pend"><b>Antes de volcarlo al sheet:</b>
          <ul>${pend.map((p, i) => `<li${e} data-cabc="pendientes.${i}">${esc(p)}</li>`).join("")}</ul></div>` : ""}
      </div>`;
  }

  /* ---- Vista calendario ---- */
  function calendarioHTML() {
    const p = String(MES).split("-");
    const anio = +p[0], mesIdx = (+p[1]) - 1;
    const primero = new Date(anio, mesIdx, 1);
    const dias = new Date(anio, mesIdx + 1, 0).getDate();
    const offset = (primero.getDay() + 6) % 7;         // grilla arranca en lunes
    const hoy = hoyISO();

    const porDia = {};
    MSGS.forEach(m => { (porDia[m.fecha] = porDia[m.fecha] || []).push(m); });

    const celda = (num, iso, fuera) => {
      const lista = porDia[iso] || [];
      return `<div class="ct-dia ${fuera ? "fuera" : ""} ${iso === hoy ? "hoy" : ""} ${lista.length ? "" : "vacio"}">
        <span class="num">${num}</span>
        <div class="ct-chips">${lista.map(m => {
          const nc = (COMS[m.id] || []).filter(c => !c.resuelto).length;
          const nv = (m.variantes || []).length;
          return `<button class="ct-chip ${m.estado}" data-ir="${m.id}" title="${esc(m.objetivo || "")}">
            <b>${esc(m.criterio || "Mensaje")}</b>
            <span class="sub">${esc((m.copy || (m.variantes || [])[0] && m.variantes[0].copy || "").replace(/\s+/g, " ").slice(0, 52))}…</span>
            <span class="marcas">${ESTADOS[m.estado] ? ESTADOS[m.estado].t : m.estado}
              ${nv ? ` · ${nv} variantes` : ""}${nc ? ` · 💬 ${nc}` : ""}</span>
          </button>`;
        }).join("")}</div>
      </div>`;
    };

    let celdas = "";
    // cola del mes anterior, para que la primera semana quede completa
    const prevDias = new Date(anio, mesIdx, 0).getDate();
    for (let i = offset - 1; i >= 0; i--) celdas += celda(prevDias - i, "", true);
    for (let d = 1; d <= dias; d++) {
      celdas += celda(d, `${anio}-${String(mesIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, false);
    }
    const resto = (7 - ((offset + dias) % 7)) % 7;
    for (let d = 1; d <= resto; d++) celdas += celda(d, "", true);

    return `<div class="ct-cal">
      <div class="ct-cal-dias"><span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span></div>
      <div class="ct-cal-grid">${celdas}</div>
    </div>`;
  }

  /* ---- Vista fichas ---- */
  function fichasHTML(ed) {
    if (!MSGS.length) {
      return `<div class="empty"><div class="big">✍️</div><p>Este mes todavía no tiene mensajes.</p>
        ${ed ? `<button class="btn-primary" data-acc="nuevo-msg" style="margin-top:12px">Agregar el primero</button>` : ""}</div>`;
    }
    return MSGS.map(m => fichaHTML(m, ed)).join("");
  }

  function fichaHTML(m, ed) {
    const f = aFecha(m.fecha);
    const e = ed ? ' contenteditable="true" spellcheck="false"' : "";
    const coms = COMS[m.id] || [];
    const pend = coms.filter(c => !c.resuelto).length;
    const vars = Array.isArray(m.variantes) ? m.variantes : [];

    return `<article class="ct-msg" data-id="${m.id}">
      <div class="ct-msg-bar">
        <span class="ct-fecha">${String(f.getDate()).padStart(2, "0")}/${String(f.getMonth() + 1).padStart(2, "0")}
          <small>${DIA_CORTO[f.getDay()]}</small></span>
        <span class="ct-crit"${e} data-c="criterio">${esc(m.criterio || "")}</span>
        <span class="ct-obj"${e} data-c="objetivo">${esc(m.objetivo || "")}</span>
        ${m.flag ? `<span class="ct-flag"${e} data-c="flag">${esc(m.flag)}</span>` : ""}
        <span class="ct-est ${m.estado}">${ESTADOS[m.estado] ? ESTADOS[m.estado].t : esc(m.estado)}</span>
      </div>

      ${vars.length ? "" : cuerpoHTML(m, "", ed)}

      ${vars.length ? `<div class="ct-vars">
        <p class="ct-lead"${e} data-c="lead">${esc(m.lead || "")}</p>
        ${vars.map((v, i) => `<details class="ct-v" ${i === 0 ? "open" : ""}>
          <summary><span${e} data-c="variantes.${i}.titulo">${esc(v.titulo || `Variante ${i + 1}`)}</span>
            ${ed ? `<button class="ct-v-del" data-delvar="${i}" title="Eliminar esta variante">✕</button>` : ""}</summary>
          ${cuerpoHTML(v, `variantes.${i}.`, ed)}
        </details>`).join("")}
        ${ed ? `<button class="btn-mini" data-addvar="1">+ Variante</button>` : ""}
      </div>` : ""}

      <div class="ct-pie">
        <button class="btn-mini ${ABIERTOS[m.id] ? "on" : ""}" data-coms="${m.id}">💬 ${coms.length ? coms.length : ""} ${pend ? `(${pend} sin resolver)` : "Comentarios"}</button>
        <button class="btn-mini" data-copiar="${m.id}" title="Copiar el mensaje listo para pegar en WhatsApp">⧉ Copiar</button>
        <span class="ct-guardado" data-guardado="${m.id}"></span>
        <div class="ct-acciones">${accionesHTML(m, ed)}</div>
      </div>
      ${ABIERTOS[m.id] ? comentariosHTML(m) : ""}
    </article>`;
  }

  function cuerpoHTML(o, pre, ed) {
    const e = ed ? ' contenteditable="true" spellcheck="false"' : "";
    const meta = o.meta || {};
    const enc = o.encuesta;
    const campo = (t, k) => `<div><dt>${t}</dt><dd${e} data-c="${pre}meta.${k}">${esc(meta[k] || "")}</dd></div>`;
    return `<div class="ct-body">
      <div class="ct-copy"${e} data-c="${pre}copy" data-raw="1">${copyHTML(o.copy || "")}</div>
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
    if (m.estado === "borrador" || m.estado === "cambios")
      return `<button class="btn-mini" data-est="revision" title="Marcarlo listo para que lo revisen">Mandar a revisión</button>
              <button class="btn-mini peligro" data-del="1" title="Eliminar el mensaje">✕</button>`;
    if (m.estado === "revision")
      return `<button class="btn-mini peligro" data-est="cambios">Pedir cambios</button>
              <button class="btn-mini on" data-est="aprobado">✓ Aprobar</button>`;
    return `<button class="btn-mini" data-est="revision" title="Volver a abrirlo para editar">Reabrir</button>`;
  }

  function comentariosHTML(m) {
    const coms = COMS[m.id] || [];
    const yo = (SES().email && SES().email() || "").toLowerCase();
    const ed = puedeEditar();
    return `<div class="ct-coms">
      ${coms.length ? coms.map(c => {
        const mio = String(c.autor_email || "").toLowerCase() === yo;
        return `<div class="ct-com ${c.resuelto ? "resuelto" : ""}">
          <span class="av">${esc(iniciales(c.autor))}</span>
          <div class="cuerpo">
            <div class="quien">${esc(c.autor || c.autor_email || "—")}<span class="cuando">${hace(c.creado)}</span>
              ${c.variante != null ? `<span class="ct-com-var"> · sobre la variante ${c.variante + 1}</span>` : ""}</div>
            <div class="texto">${esc(c.texto)}</div>
          </div>
          <div class="accs">
            ${(mio || ed) ? `<button data-res="${c.id}" title="${c.resuelto ? "Reabrir" : "Marcar como resuelto"}">${c.resuelto ? "↺" : "✓"}</button>` : ""}
            ${mio ? `<button data-delcom="${c.id}" title="Eliminar">✕</button>` : ""}
          </div>
        </div>`;
      }).join("") : `<p class="ct-com-vacio">Sin comentarios todavía. Dejá una sugerencia sobre este mensaje.</p>`}
      <div class="ct-com-alta">
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
    const cont = $("#contenidos"); if (!cont) return;

    const sel = $("#ctMes");
    if (sel) sel.onchange = async () => { MES = sel.value; ABIERTOS = {}; await traerMes(MES); pintar(); };

    cont.onclick = async ev => {
      const t = ev.target;

      const v = t.closest("[data-vista]");
      if (v) { VISTA = v.dataset.vista; pintar(); return; }

      const ir = t.closest("[data-ir]");
      if (ir) { FOCO = ir.dataset.ir; VISTA = "fichas"; pintar(); return; }

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
    ta.disabled = true;
    const r = await fetch(url("contenidos_comentarios"), {
      method: "POST", headers: head({ Prefer: "return=representation" }),
      body: JSON.stringify([{ contenido_id: id, texto, autor: SES().nombre ? SES().nombre() : "", autor_email: SES().email ? SES().email() : "" }]),
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
    if (a === "refrescar") { await traerMeses(); await traerMes(MES); pintar(); return; }

    if (a === "nuevo-mes") {
      const m = (prompt("¿Qué mes? Formato AAAA-MM (ej: 2026-10)") || "").trim();
      if (!/^\d{4}-\d{2}$/.test(m)) { if (m) alert("El formato tiene que ser AAAA-MM."); return; }
      if (MESES.some(x => x.mes === m)) { MES = m; await traerMes(MES); pintar(); return; }
      const titulo = (prompt("Título del mes (el eje del cronograma):") || "").trim();
      const r = await fetch(url("contenidos_meses"), {
        method: "POST", headers: head({ Prefer: "return=representation" }),
        body: JSON.stringify([{
          mes: m, titulo, eyebrow: `Comunidad profesional de WhatsApp · ${cap(mesLabel(m))}`,
          brief: [{ h: "Objetivo", p: "" }, { h: "Recursos", p: "" }, { h: "Cadencia", p: "" }],
          autor: SES().nombre ? SES().nombre() : "", autor_email: SES().email ? SES().email() : "",
        }]),
      });
      if (!r.ok) { alert("No se pudo crear el mes."); return; }
      MES = m; await traerMeses(); await traerMes(MES); pintar(); return;
    }

    if (a === "nuevo-msg") {
      if (!MES) return;
      const f = (prompt("Fecha del mensaje (AAAA-MM-DD):", `${MES}-01`) || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) { if (f) alert("El formato tiene que ser AAAA-MM-DD."); return; }
      const r = await fetch(url("contenidos"), {
        method: "POST", headers: head({ Prefer: "return=representation" }),
        body: JSON.stringify([{
          mes: MES, fecha: f, criterio: "Nuevo mensaje", objetivo: "", copy: "", meta: {},
          orden: MSGS.length, autor: SES().nombre ? SES().nombre() : "", autor_email: SES().email ? SES().email() : "",
        }]),
      });
      if (!r.ok) { alert("No se pudo crear el mensaje."); return; }
      VISTA = "fichas"; await traerMes(MES);
      FOCO = ((await r.json())[0] || {}).id || ""; pintar(); return;
    }

    if (a === "exportar") return exportar();

    if (a === "importar") {
      const f = $("#ctFile"); if (!f) return;
      f.onchange = () => { const file = f.files[0]; if (file) importar(file); f.value = ""; };
      f.click(); return;
    }
  }

  function exportar() {
    if (!CAB) return;
    const d = {
      mes: CAB.mes, titulo: CAB.titulo, eyebrow: CAB.eyebrow, dek: CAB.dek,
      brief: CAB.brief, obras: CAB.obras, pendientes: CAB.pendientes,
      mensajes: MSGS.map(m => ({
        fecha: m.fecha, criterio: m.criterio, objetivo: m.objetivo, flag: m.flag || undefined,
        estado: m.estado, copy: m.copy || undefined, meta: m.meta,
        encuesta: m.encuesta || undefined,
        lead: m.lead || undefined,
        variantes: (m.variantes || []).length ? m.variantes : undefined,
      })),
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }));
    a.download = `contenidos-${CAB.mes}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // Importa un mes entero. Si el mes ya existe pide confirmación y REEMPLAZA sus
  // mensajes (los comentarios se van con ellos: por eso el aviso es explícito).
  async function importar(file) {
    let d; try { d = JSON.parse(await file.text()); } catch (e) { alert("Ese archivo no es un .json válido."); return; }
    if (!d || !d.mes || !Array.isArray(d.mensajes)) { alert("Al .json le falta 'mes' o 'mensajes'."); return; }
    const existe = MESES.some(x => x.mes === d.mes);
    if (existe && !confirm(`${cap(mesLabel(d.mes))} ya está cargado.\n\nImportar REEMPLAZA sus mensajes y borra los comentarios que tengan. ¿Seguir?`)) return;

    const autor = SES().nombre ? SES().nombre() : "", email = SES().email ? SES().email() : "";
    const cab = {
      mes: d.mes, titulo: d.titulo || "", eyebrow: d.eyebrow || "", dek: d.dek || "",
      brief: d.brief || [], obras: d.obras || [], pendientes: d.pendientes || [],
      autor, autor_email: email,
    };
    let r = await fetch(url("contenidos_meses"), {
      method: "POST", headers: head({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify([cab]),
    });
    if (!r.ok) { alert("No se pudo crear el mes. ¿Corriste el SQL de contenidos?"); return; }

    if (existe) await fetch(url(`contenidos?mes=eq.${encodeURIComponent(d.mes)}`), { method: "DELETE", headers: head() });

    const filas = d.mensajes.map((m, i) => ({
      mes: d.mes, fecha: m.fecha, criterio: m.criterio || "", objetivo: m.objetivo || "",
      flag: m.flag || "", copy: m.copy || "", meta: m.meta || {},
      encuesta: m.encuesta || null, lead: m.lead || "", variantes: m.variantes || [],
      estado: m.estado || "borrador", orden: i, autor, autor_email: email,
    }));
    r = await fetch(url("contenidos"), { method: "POST", headers: head({ Prefer: "return=minimal" }), body: JSON.stringify(filas) });
    if (!r.ok) { alert("El mes se creó pero fallaron los mensajes:\n" + (await r.text()).slice(0, 300)); }

    MES = d.mes; await traerMeses(); await traerMes(MES); pintar();
  }

  /* ---- Refresco suave: trae comentarios y cambios de otros sin pisar lo que estás escribiendo ---- */
  function arrancarRefresco() {
    if (TIMER) return;
    TIMER = setInterval(async () => {
      const sec = $("#page-contenidos");
      if (!sec || sec.classList.contains("hidden") || document.hidden) return;
      const foco = document.activeElement;
      if (foco && (foco.isContentEditable || foco.tagName === "TEXTAREA")) return;   // estás editando: no toco nada
      await traerMes(MES); pintar();
    }, 30000);
  }
})();
