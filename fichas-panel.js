/* ===================== FICHAS TÉCNICAS · PANTALLA =====================
   Una sola vista para las dos mitades del trabajo:
     · qué fichas hay que hacer  → estado, desde la hoja "Fichas técnicas"
       del Archivo de carga | Web, vía la Web App de Apps Script (06_API.gs)
     · cómo quedó cada ficha     → el dibujo, vía window.FichasDoc (fichas-ui.js)

   Estaban separadas y eso permitía cerrar una ficha sin haberla mirado.
   Acá se aprueba viendo.

   La lista es la UNIÓN de las dos fuentes: casi todas las agrupaciones están
   en ambas (183 de 184), pero se contemplan las dos orillas — una ficha
   dibujada que todavía no figura en la planilla, y una fila de la planilla
   que todavía no tiene ficha generada.

   Si la API se cae, la vista NO se rompe: se sigue viendo y descargando
   fichas, sin la capa de estado. Eso es a propósito — el generador de PDF ya
   se usa a diario y no puede depender de que el bot conteste.
   ==================================================================== */
(function () {

  /* ---------------------------------------------------------------
     CONEXIÓN — ver app/apps-script/DESPLIEGUE.md
     Ni la URL ni el token son secretos: este archivo se sirve desde una
     página pública. La seguridad real la da el JWT de Supabase, que la API
     le pregunta a Supabase en cada escritura.
     --------------------------------------------------------------- */
  const API = {
    url: "https://script.google.com/macros/s/AKfycbx7Kfld3oy_bsZ0qMtfiwmUv8hBCrdSGpDmkpBjtAUo5q21QOKkz3hIxlbEQMc4-F0/exec",
    token: "6e4b18716eba4d25abb90a8a4c2404be133e004a826241cd86d812aa8df6795c"
  };
  const configurada = () => /^https:\/\/script\.google\.com\//.test(API.url) && API.token.length > 20;

  const $ = s => document.querySelector(s);
  const esc = s => (s == null ? "" : String(s))
    .replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const ESTADOS = ["Solicitada", "A actualizar", "Listo para publicar", "Finalizada", "Discontinuada"];
  const CLASE = {
    "Solicitada": "fe-solicitada",
    "A actualizar": "fe-actualizar",
    "Listo para publicar": "fe-listo",
    "Finalizada": "fe-finalizada",
    "Discontinuada": "fe-discontinuada"
  };
  const ANCHO_A4 = 794;          // 210mm a 96dpi, el ancho fijo de .f-page

  /* UN SOLO BOTÓN, a propósito.
     El reparto de trabajo es: el BOT decide qué hay que hacer (Solicitada,
     A actualizar, Discontinuada, leyendo el Maestro) y la PERSONA sólo declara
     "ya la hice". Por eso hay una única acción — "Actualizar" — que lleva la
     ficha a "Listo para publicar", desde cualquier estado abierto.

     No hay botón para marcar algo como "A actualizar": eso es una conclusión
     del bot, no una decisión de quien mira la pantalla. Y como no hay vuelta
     atrás desde la pantalla, un clic equivocado se corrige editando la hoja
     (o esperando al miércoles, si el Maestro cambió de verdad).

     Estados cerrados: no se ofrece nada porque no hay nada que declarar.
     "Listo para publicar" era un sinónimo de "Finalizada" que ya no se
     escribe; sigue acá para las filas viejas, hasta que el bot las normalice
     en su próxima corrida. */
  const SIN_ACCIONES = ["Finalizada", "Listo para publicar"];

  /* ---- estado en memoria ---- */
  let ITEMS = [];       // { ag, doc, ficha }  — la unión de las dos fuentes
  let sel = null;       // agrupación seleccionada
  let FILTRO = "";      // "" = todos
  let BUSCA = "";
  let CARGANDO = false;
  let AVISO_API = "";   // la API no contestó: se avisa pero la vista sigue
  let AMPLIADO = false; // la ficha sola, sin lista ni buscador
  let montado = false;

  const ses = () => window.LEUK_SESION || {};
  const puedeEditar = () => !!(ses().puedeEditarFichas && ses().puedeEditarFichas());
  const item = ag => ITEMS.filter(x => x.ag === ag)[0] || null;

  /* ================= DATOS ================= */

  // Une los documentos del generador con los estados de la planilla.
  // Se conserva el orden alfabético que ya trae DOCS.
  function construir(estados) {
    const docs = (window.FichasDoc && window.FichasDoc.docs()) || [];
    const porAg = {};
    (estados || []).forEach(f => { porAg[f.agrupacion] = f; });

    ITEMS = docs.map(d => ({ ag: d.ag, doc: d, ficha: porAg[d.ag] || null }));

    // Filas de la planilla que no tienen ficha dibujada (dato sucio, o ficha
    // que todavía no se generó). Entran igual: son trabajo pendiente.
    const vistos = {};
    ITEMS.forEach(x => { vistos[x.ag] = true; });
    (estados || []).forEach(f => {
      if (!vistos[f.agrupacion]) ITEMS.push({ ag: f.agrupacion, doc: null, ficha: f });
    });

    ITEMS.sort((a, b) => a.ag.localeCompare(b.ag, "es"));
  }

  async function cargar() {
    if (!configurada()) { AVISO_API = "Falta conectar la API de estados (ver DESPLIEGUE.md)."; construir([]); return; }
    CARGANDO = true; AVISO_API = "";
    try {
      const r = await fetch(`${API.url}?accion=fichas&token=${encodeURIComponent(API.token)}`, { redirect: "follow" });
      const txt = await r.text();
      let d;
      try { d = JSON.parse(txt); }
      catch (e) {
        // Suele ser que el Web App no está publicado como "Cualquier persona":
        // Google devuelve el HTML de su login en vez de JSON.
        throw new Error("La API no devolvió JSON. Revisá que el Web App esté publicado con acceso «Cualquier persona».");
      }
      if (!d.ok) throw new Error(d.mensaje || d.error);
      construir(d.fichas || []);
    } catch (e) {
      AVISO_API = e.message || String(e);
      construir([]);                                  // sin estados, pero con fichas
    } finally {
      CARGANDO = false;
    }
  }

  // La API siempre responde HTTP 200 (limitación de ContentService): el
  // resultado real viene en `ok`. Nunca mirar r.status.
  // Content-Type text/plain a propósito: con application/json el navegador
  // manda un preflight OPTIONS que Apps Script no sabe responder.
  async function apiPost(payload) {
    try {
      const r = await fetch(API.url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({
          token: API.token,
          jwt: ses().token ? ses().token() : ""
        }, payload)),
        redirect: "follow"
      });
      return JSON.parse(await r.text());
    } catch (e) {
      return { ok: false, error: "SIN_RED", mensaje: "No pude comunicarme con la planilla. ¿Tenés internet?" };
    }
  }

  /* ================= ARMADO DE LA PANTALLA ================= */

  function mount() {
    const page = $("#page-fichas");
    if (!page) return;
    montado = true;

    page.innerHTML = `
      <div class="fp-chips" id="fpChips"></div>
      <div class="fp-bar">
        <input id="fpSearch" class="intg-search" type="search" autocomplete="off"
               placeholder="Buscá por nombre de ficha o por SKU…">
        <button id="fpReload" class="btn-desc" title="Volver a leer los estados de la planilla">↻ Estados</button>
        <button id="fpLote" class="btn-desc" title="Marca como Finalizada todo lo que estás viendo"></button>
        <button id="fpZip" class="btn-desc" title="Genera un ZIP con todas las fichas en PDF">⬇ Todas (ZIP)</button>
        <span class="intg-stat" id="fpMeta"></span>
      </div>
      <div class="us-msg" id="fpAviso"></div>
      <div class="us-msg" id="fpMsg"></div>
      <div class="fp-split">
        <div class="fp-side" id="fpSide"></div>
        <div class="fp-main">
          <div id="fpHead"></div>
          <div id="ficha-stage" class="fp-visor f-host"></div>
        </div>
      </div>`;

    $("#fpSearch").oninput = ev => {
      BUSCA = ev.target.value;
      if (pintarLista()) pintarDetalle();
    };
    $("#fpReload").onclick = async () => { await cargar(); pintarTodo(); };
    $("#fpZip").onclick = ev => window.FichasDoc.descargarTodas(ev.currentTarget, $("#fpMeta"));
    $("#fpLote").onclick = confirmarLote;
    $("#fpChips").onclick = ev => {
      const c = ev.target.closest("[data-estado]"); if (!c) return;
      FILTRO = (FILTRO === c.dataset.estado) ? "" : c.dataset.estado;
      pintarTodo();
    };
    $("#fpSide").onclick = ev => {
      const it = ev.target.closest("[data-ag]"); if (!it) return;
      sel = it.dataset.ag; pintarLista(); pintarDetalle();
    };
    $("#fpHead").onclick = onClickAcciones;

    // Al cambiar el ancho de la ventana hay que recalcular el zoom de la hoja.
    let t; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(escalar, 150); });
    // Escape sale del modo ampliado (si no hay un modal abierto, que tiene lo suyo).
    document.addEventListener("keydown", ev => {
      if (ev.key === "Escape" && AMPLIADO && !$("#fpModal")) ampliar(false);
    });

    construir([]);                 // primero lo local: la vista ya sirve
    pintarTodo();
    cargar().then(pintarTodo);     // después se le suma el estado
  }

  function pintarTodo() { pintarChips(); pintarLista(); pintarDetalle(); pintarMeta(); }

  // Las que el botón de lote va a tocar: sólo lo que está a la vista y admite
  // el cambio. Nunca "todas" a secas — si hay un filtro puesto, manda el filtro.
  function candidatasLote() {
    return visibles().filter(x => x.ficha && x.doc && x.ficha.editable &&
      SIN_ACCIONES.indexOf(x.ficha.estado) === -1);
  }

  function pintarBotonLote() {
    const b = $("#fpLote"); if (!b) return;
    const n = candidatasLote().length;
    const filtrando = !!FILTRO || BUSCA.trim() !== "";
    b.disabled = n === 0 || !puedeEditar();
    b.style.display = puedeEditar() ? "" : "none";
    b.textContent = n === 0 ? "✓ Nada pendiente acá"
      : filtrando ? (n === 1 ? "✓ Actualizar la visible" : `✓ Actualizar las ${n} visibles`)
      : (n === 1 ? "✓ Actualizar la única pendiente" : `✓ Actualizar todas (${n})`);
  }

  function pintarMeta() {
    const m = $("#fpMeta"); if (!m) return;
    m.textContent = CARGANDO ? "Leyendo la planilla…" : `${ITEMS.length} fichas`;
    // OJO: #fpAviso es sólo para "la API no contesta". Los mensajes pasajeros
    // van a #fpMsg. Si comparten elemento, cada repintado borra el resultado
    // de lo último que hiciste antes de que llegues a leerlo.
    const a = $("#fpAviso");
    if (a) {
      a.className = AVISO_API ? "us-msg px-err" : "us-msg";
      a.textContent = AVISO_API ? `Sin estados: ${AVISO_API} Podés ver y descargar fichas igual.` : "";
    }
  }

  function pintarChips() {
    const c = {}; ESTADOS.forEach(e => { c[e] = 0; });
    let sinEstado = 0;
    ITEMS.forEach(x => {
      if (!x.ficha) { sinEstado++; return; }
      if (c[x.ficha.estado] !== undefined) c[x.ficha.estado]++;
    });
    const chip = (e, n, cls) =>
      `<button class="fe-chip ${cls} ${FILTRO === e ? "on" : ""}" data-estado="${esc(e)}">
         <b>${n}</b> <span>${esc(e)}</span></button>`;
    // Discontinuada y el legado "Listo para publicar" sólo si hay: no son
    // trabajo pendiente, y el segundo desaparece cuando el bot normalice.
    const html = ESTADOS
      .filter(e => (e !== "Discontinuada" && e !== "Listo para publicar") || c[e] > 0)
      .map(e => chip(e, c[e], CLASE[e])).join("")
      + (sinEstado ? chip("__sin__", sinEstado, "fe-sinestado").replace(">__sin__<", ">sin estado<") : "");
    $("#fpChips").innerHTML = html;
  }

  function visibles() {
    const q = BUSCA.trim().toLowerCase();
    return ITEMS.filter(x => {
      if (FILTRO === "__sin__") { if (x.ficha) return false; }
      else if (FILTRO && (!x.ficha || x.ficha.estado !== FILTRO)) return false;
      if (!q) return true;
      const texto = x.doc ? x.doc._s : (x.ag + " " + (x.ficha.skus || []).join(" ")).toLowerCase();
      return texto.indexOf(q) !== -1;
    });
  }

  // Devuelve true si la selección cambió, para que quien llame repinte el
  // detalle. Sin esto, al filtrar la lista marca una ficha y el panel de la
  // derecha sigue mostrando otra.
  function pintarLista() {
    const lista = visibles();
    const antes = sel;
    // Si lo seleccionado se fue por el filtro, se pasa a lo primero visible.
    if (lista.length && !lista.some(x => x.ag === sel)) sel = lista[0].ag;
    if (!lista.length) sel = null;

    $("#fpSide").innerHTML = lista.length
      ? lista.map(x => {
          const cls = x.ficha ? (CLASE[x.ficha.estado] || "") : "fe-sinestado";
          const n = x.ficha ? x.ficha.cantidad : (x.doc ? x.doc.fichas.length : "");
          return `<div class="fp-it ${cls} ${x.ag === sel ? "on" : ""}" data-ag="${esc(x.ag)}">
            <i class="fp-dot"></i><b>${esc(x.ag)}</b><span>${n}</span></div>`;
        }).join("")
      : `<div class="fp-vacio">Nada coincide con el filtro.</div>`;

    pintarBotonLote();
    return sel !== antes;
  }

  function pintarDetalle() {
    const head = $("#fpHead"), stage = $("#ficha-stage");
    if (!head || !stage) return;

    const x = sel ? item(sel) : null;
    if (!x) {
      head.innerHTML = "";
      stage.innerHTML = `<div class="fp-vacio">Elegí una ficha de la lista.</div>`;
      return;
    }

    const f = x.ficha;
    const cls = f ? (CLASE[f.estado] || "") : "fe-sinestado";
    const cerrada = !!f && SIN_ACCIONES.indexOf(f.estado) !== -1;
    // Sin ficha dibujada no se ofrece ningún botón de estado: marcar como
    // "Listo para publicar" algo que no existe sería declarar un trabajo que
    // nadie hizo. Primero tiene que existir la ficha.
    const editable = f && f.editable && !cerrada && !!x.doc && puedeEditar();

    const badge = f
      ? `<span class="fe-badge ${cls}">${esc(f.estado)}</span>`
      : `<span class="fe-badge fe-sinestado" title="Esta ficha no figura en la hoja «Fichas técnicas»">sin estado</span>`;
    const skus = f ? f.skus.join(", ") : "";
    const hojas = x.doc && x.doc.fichas.length > 1 ? `${x.doc.fichas.length} hojas` : "";

    head.innerHTML = `<div class="fp-head ${cls}">
      <div class="fp-title">
        <span class="fp-h1">${esc(x.ag)}</span>${badge}
        ${f ? `<span class="fp-meta">${f.cantidad} SKU</span>` : ""}
        ${hojas ? `<span class="fp-meta">· ${hojas}</span>` : ""}
      </div>
      ${skus ? `<div class="fp-skus">${esc(skus)}</div>` : ""}
      ${f && f.motivo ? `<div class="fp-motivo">${esc(f.motivo)}</div>` : ""}
      ${f && f.detectado ? `<div class="fp-fecha">En este estado desde ${esc(f.detectado)}${
        f.actualizadaPor ? ` · actualizada por <b>${esc(f.actualizadaPor)}</b>${f.cuando ? ` el ${esc(f.cuando)}` : ""}` : ""
      }</div>` : ""}
      <div class="fp-acc">
        ${editable
          ? `<button class="btn-primary" data-act="Finalizada"
               title="Marcá que ya la hiciste: la ficha pasa a «Finalizada»">Actualizar</button>` : ""}
        ${x.doc ? `<button class="btn-ghost" data-pdf="1">⬇ Descargar PDF</button>` : ""}
        ${x.doc ? `<button class="btn-ghost" data-ampliar="1">${AMPLIADO ? "⤡ Volver a la lista" : "⤢ Ampliar"}</button>` : ""}
      </div>
    </div>`;

    if (!x.doc) {
      // Se explica el porqué y qué hacer, en vez de dejar un hueco. El arreglo
      // es siempre en la planilla, no acá.
      const raro = /^[^A-Za-zÀ-ÿ0-9]+$/.test(x.ag) || /^(#N\/A|N\/A)$/i.test(x.ag);
      stage.innerHTML = `<div class="fp-vacio">
        <b>Todavía no existe la ficha, así que no hay nada que publicar.</b>
        <div>Figura en la hoja «Fichas técnicas»${f ? ` con ${f.cantidad} SKU (${esc(f.skus.join(", "))})` : ""},
        pero el generador no encontró ninguna ficha con ese nombre.</div>
        <div style="margin-top:10px">${raro
          ? `La agrupación se llama <b>«${esc(x.ag)}»</b>, que no es un nombre válido.
             Poné el nombre real en la columna <b>Agrupación de fichas técnicas</b> de
             BASE ÚNICA, para esos SKU.`
          : `Revisá cómo está escrita la agrupación <b>«${esc(x.ag)}»</b> en la columna
             <b>Agrupación de fichas técnicas</b> de BASE ÚNICA.`}
        La ficha aparece sola en la próxima actualización.</div></div>`;
      return;
    }

    stage.innerHTML = window.FichasDoc.html(x.doc);
    escalar();
    window.FichasDoc.autofit(stage);
    setTimeout(escalar, 500);      // el autofit puede cambiar el alto de la hoja
  }

  // La hoja mide 210mm de ancho fijo. Se la achica para que entre en el panel,
  // y se compensa el hueco que deja el scale (que no afecta al layout).
  //   · normal:   entra a lo ancho, nunca más del 100%
  //   · ampliado: usa todo el ancho que dejó la lista al esconderse, y SÍ puede
  //               pasar del 100% — ese es el punto: leer la letra chica.
  //
  // Ojo: la primera versión ajustaba "la hoja entera a la ventana" y en
  // pantallas bajas daba MENOS que el modo normal, o sea que el botón
  // "Ampliar" achicaba. Se ajusta solo a lo ancho, y se scrollea si no entra.
  function escalar() {
    const stage = $("#ficha-stage"); if (!stage) return;
    const porAncho = (stage.clientWidth - 36) / ANCHO_A4;
    const z = Math.min(AMPLIADO ? 2 : 1, porAncho);
    stage.querySelectorAll(".f-page").forEach(p => {
      const alto = p.offsetHeight || 1123;                 // 297mm a 96dpi
      p.style.transform = `scale(${z})`;
      p.style.marginBottom = Math.round(14 - (1 - z) * alto) + "px";
    });
  }

  /* ================= ACCIONES ================= */

  function onClickAcciones(ev) {
    const x = sel ? item(sel) : null; if (!x) return;
    if (ev.target.closest("[data-pdf]")) { window.FichasDoc.imprimir(x.ag); return; }
    if (ev.target.closest("[data-ampliar]")) { ampliar(!AMPLIADO); return; }
    const b = ev.target.closest("[data-act]");
    if (b && x.ficha) confirmar(x.ficha, b.dataset.act);
  }

  // Confirmación obligatoria. Muestra el estado que va a quedar y, si el bot
  // detectó un cambio, el motivo textual — para que nadie cierre una ficha sin
  // ver que cambió la potencia.
  function confirmar(f, nuevoEstado, opciones) {
    opciones = opciones || {};
    const ov = document.createElement("div");
    ov.className = "detail"; ov.id = "fpModal";

    const aviso = opciones.conflicto ? `
      <div class="fp-conflicto">
        <b>Ojo: esta ficha cambió mientras la mirabas.</b>
        <div>Ahora está en <b>${esc(opciones.estadoActual)}</b>${opciones.motivoActual ? ` — ${esc(opciones.motivoActual)}` : ""}.</div>
        <div>Si seguís, tu cambio pisa ese estado.</div>
      </div>` : "";
    const motivo = (!opciones.conflicto && f.motivo)
      ? `<div class="fp-modal-caja"><span>Qué cambió</span><div>${esc(f.motivo)}</div></div>` : "";

    ov.innerHTML = `<div class="detail-inner fp-modal">
      <button class="detail-close" id="fpClose">✕</button>
      <h2>${esc(f.agrupacion)}</h2>
      ${aviso}
      <div class="fp-modal-cambio">
        <span class="fe-badge ${CLASE[opciones.estadoActual || f.estado] || ""}">${esc(opciones.estadoActual || f.estado)}</span>
        <span class="fp-flecha">→</span>
        <span class="fe-badge ${CLASE[nuevoEstado] || ""}">${esc(nuevoEstado)}</span>
      </div>
      ${motivo}
      <div class="fp-modal-caja"><span>${f.cantidad} SKU en el grupo</span><div>${esc(f.skus.join(", "))}</div></div>
      <div class="us-msg" id="fpModalMsg"></div>
      <div class="desc-actions">
        <button class="btn-ghost" id="fpCancel">Cancelar</button>
        <button class="btn-primary" id="fpOk">${opciones.conflicto ? "Aplicar igual" : "Confirmar"}</button>
      </div>
    </div>`;

    document.body.appendChild(ov);
    const cerrar = () => ov.remove();
    ov.querySelector("#fpClose").onclick = cerrar;
    ov.querySelector("#fpCancel").onclick = cerrar;
    ov.addEventListener("click", e => { if (e.target === ov) cerrar(); });

    ov.querySelector("#fpOk").onclick = async () => {
      const btn = ov.querySelector("#fpOk"), msg = ov.querySelector("#fpModalMsg");
      btn.disabled = true; btn.textContent = "Guardando…";
      msg.className = "us-msg"; msg.textContent = "";

      const r = await apiPost({
        accion: "cambiarEstado",
        agrupacion: f.agrupacion,
        estado: nuevoEstado,
        detectadoVisto: f.detectado,
        forzar: !!opciones.conflicto
      });

      if (r.ok) {
        f.estado = r.estadoNuevo;
        f.detectado = r.detectado;
        if (r.motivo != null) f.motivo = r.motivo;
        if (r.actualizadaPor) { f.actualizadaPor = r.actualizadaPor; f.cuando = r.cuando; }
        f.editable = r.estadoNuevo !== "Discontinuada";
        cerrar(); pintarChips(); pintarLista(); pintarDetalle();
        avisar(`${f.agrupacion} → ${r.estadoNuevo}${r.sinCambios ? " (ya estaba así)" : ""}`, true);
        return;
      }

      if (r.error === "CONFLICTO") {
        f.estado = r.estadoActual;
        f.detectado = r.detectadoActual;
        f.motivo = r.motivoActual || "";
        cerrar(); pintarChips(); pintarLista(); pintarDetalle();
        // Si en el medio quedó justo donde la persona la quería, no hay nada
        // que pisar: se avisa y listo.
        if (r.estadoActual === nuevoEstado) {
          avisar(`${f.agrupacion} ya quedó en "${nuevoEstado}" — alguien lo hizo mientras mirabas.`, true);
          return;
        }
        confirmar(f, nuevoEstado, { conflicto: true, estadoActual: r.estadoActual, motivoActual: r.motivoActual });
        return;
      }

      // El resto de los errores se muestran tal cual: los mensajes de la API
      // ya están escritos para que los lea una persona.
      btn.disabled = false; btn.textContent = opciones.conflicto ? "Aplicar igual" : "Confirmar";
      msg.className = "us-msg px-err";
      msg.textContent = r.mensaje || r.error || "No se pudo guardar.";
      if (r.error === "FICHA_DISCONTINUADA" || r.error === "NO_ENCONTRADA") cargar().then(pintarTodo);
    };
  }

  // Ampliar / volver. No se re-dibuja la ficha (es caro): solo se reacomoda
  // el layout y se recalcula el zoom de la hoja.
  function ampliar(si) {
    AMPLIADO = si;
    const page = $("#page-fichas"); if (!page) return;
    page.classList.toggle("fp-ancho", AMPLIADO);
    const b = page.querySelector("[data-ampliar]");
    if (b) b.textContent = AMPLIADO ? "⤡ Volver a la lista" : "⤢ Ampliar";
    escalar();
    if (AMPLIADO) window.scrollTo({ top: 0 });
  }

  /* ---- Cambio en lote ----
     La confirmación muestra la lista completa, no sólo el número: cerrar 130
     fichas de un clic es la operación más difícil de deshacer de la pantalla,
     y conviene ver qué se está cerrando. */
  function confirmarLote() {
    const items = candidatasLote();
    if (!items.length) return;

    const filtrando = !!FILTRO || BUSCA.trim() !== "";
    const porEstado = {};
    items.forEach(x => { porEstado[x.ficha.estado] = (porEstado[x.ficha.estado] || 0) + 1; });

    const ov = document.createElement("div");
    ov.className = "detail"; ov.id = "fpModal";
    ov.innerHTML = `<div class="detail-inner fp-modal fp-modal-lote">
      <button class="detail-close" id="fpClose">✕</button>
      <h2>Actualizar ${items.length} ficha${items.length > 1 ? "s" : ""}</h2>
      <div class="fp-conflicto">
        <b>Esto marca las ${items.length} como Finalizada de una vez.</b>
        <div>${filtrando
          ? "Son las que estás viendo ahora, con el filtro puesto."
          : "Son <b>todas</b> las que tienen trabajo pendiente."}
        Desde la pantalla no se puede deshacer.</div>
      </div>
      <div class="fp-modal-caja"><span>De qué estado vienen</span><div>${
        Object.keys(porEstado).map(e => `${porEstado[e]} ${e}`).join(" · ")}</div></div>
      <div class="fp-modal-caja fp-lote-lista"><span>Cuáles</span><div>${
        items.map(x => esc(x.ag)).join(" · ")}</div></div>
      <div class="us-msg" id="fpModalMsg"></div>
      <div class="desc-actions">
        <button class="btn-ghost" id="fpCancel">Cancelar</button>
        <button class="btn-primary" id="fpOk">Sí, actualizar ${items.length}</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    const cerrar = () => ov.remove();
    ov.querySelector("#fpClose").onclick = cerrar;
    ov.querySelector("#fpCancel").onclick = cerrar;
    ov.addEventListener("click", e => { if (e.target === ov) cerrar(); });

    ov.querySelector("#fpOk").onclick = async () => {
      const btn = ov.querySelector("#fpOk"), msg = ov.querySelector("#fpModalMsg");
      btn.disabled = true; btn.textContent = `Actualizando ${items.length}…`;
      msg.className = "us-msg"; msg.textContent = "";

      const r = await apiPost({
        accion: "cambiarEstadoLote",
        estado: "Finalizada",
        // Cada una con lo que la pantalla tenía a la vista: la API saltea lo
        // que haya cambiado en el medio en vez de pisarlo.
        fichas: items.map(x => ({ agrupacion: x.ag, detectadoVisto: x.ficha.detectado }))
      });

      if (!r.ok) {
        btn.disabled = false; btn.textContent = `Sí, actualizar ${items.length}`;
        msg.className = "us-msg px-err";
        msg.textContent = r.mensaje || r.error || "No se pudo guardar.";
        return;
      }

      // Se aplica lo que la API confirmó, una por una: si salteó alguna, esa
      // queda como estaba y se dice por qué.
      (r.aplicadas || []).forEach(a => {
        const x = item(a.agrupacion); if (!x || !x.ficha) return;
        x.ficha.estado = r.estado;
        x.ficha.detectado = r.detectado;
        x.ficha.actualizadaPor = r.actualizadaPor;
        x.ficha.cuando = r.detectado;
      });

      cerrar(); pintarTodo();

      const n = (r.aplicadas || []).length, s = (r.salteadas || []).length;
      if (s === 0) {
        avisar(`${n} ficha${n > 1 ? "s" : ""} actualizada${n > 1 ? "s" : ""}.`, true);
      } else {
        avisar(`${n} actualizada${n > 1 ? "s" : ""} · ${s} salteada${s > 1 ? "s" : ""}.`, n > 0);
        detalleSalteadas(r.salteadas);
      }
      // Lo salteado pudo cambiar en la planilla: se relee para no quedar viejo.
      if (s > 0) cargar().then(pintarTodo);
    };
  }

  // Por qué no se tocó cada una. Importa: si el bot marcó algo como
  // "A actualizar" mientras mirabas, el lote NO lo pisa, y hay que saberlo.
  function detalleSalteadas(salteadas) {
    const ov = document.createElement("div");
    ov.className = "detail"; ov.id = "fpModal";
    ov.innerHTML = `<div class="detail-inner fp-modal fp-modal-lote">
      <button class="detail-close" id="fpClose">✕</button>
      <h2>${salteadas.length} quedaron sin tocar</h2>
      <div class="fp-salteadas">${salteadas.map(x => `<div>
        <b>${esc(x.agrupacion)}</b> — ${esc(x.motivo)}${
          x.estadoActual ? ` Ahora está en <b>${esc(x.estadoActual)}</b>.` : ""}${
          x.motivoActual ? `<div class="fp-salteada-motivo">${esc(x.motivoActual)}</div>` : ""}
      </div>`).join("")}</div>
      <div class="desc-actions"><button class="btn-primary" id="fpCancel">Entendido</button></div>
    </div>`;
    document.body.appendChild(ov);
    const cerrar = () => ov.remove();
    ov.querySelector("#fpClose").onclick = cerrar;
    ov.querySelector("#fpCancel").onclick = cerrar;
    ov.addEventListener("click", e => { if (e.target === ov) cerrar(); });
  }

  function avisar(texto, ok) {
    const m = $("#fpMsg"); if (!m) return;
    m.className = "us-msg " + (ok ? "px-ok" : "px-err");
    m.textContent = texto;
    setTimeout(() => { if (m.textContent === texto) { m.textContent = ""; m.className = "us-msg"; } }, 6000);
  }

  // app.js la llama al entrar a la página (goToPage 'fichas').
  window.renderFichas = function () { if (!montado) mount(); };
})();
