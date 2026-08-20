/* ===================== ESTADO DE FICHAS TÉCNICAS =====================
   Vista de gestión: qué fichas hay que hacer, cuáles hay que actualizar y
   cuáles están cerradas. Lee y escribe contra la hoja "Fichas técnicas" del
   Archivo de carga | Web, a través de la Web App de Apps Script (06_API.gs).

   OJO — no confundir con fichas-ui.js: esa es la vista que DIBUJA las fichas
   (la que genera los PDF). Esta administra su ESTADO.

   Quién puede escribir lo decide la API, no esta pantalla. Acá los botones se
   esconden por comodidad; el permiso de verdad se valida contra Supabase del
   lado del servidor.
   ==================================================================== */
(function () {

  /* ---------------------------------------------------------------
     CONFIGURACIÓN — completar después de publicar el Web App
     ---------------------------------------------------------------
     Ni la URL ni el token son secretos: este archivo se sirve desde una
     página pública de GitHub Pages, así que cualquiera puede leerlos.
     La seguridad real la da el JWT de Supabase, que la API le pregunta a
     Supabase en cada escritura. Ver el comentario de arriba en 06_API.gs.
     --------------------------------------------------------------- */
  const API = {
    url: "https://script.google.com/macros/s/AKfycbx7Kfld3oy_bsZ0qMtfiwmUv8hBCrdSGpDmkpBjtAUo5q21QOKkz3hIxlbEQMc4-F0/exec",   // https://script.google.com/macros/s/AKfy…/exec
    token: "6e4b18716eba4d25abb90a8a4c2404be133e004a826241cd86d812aa8df6795c"        // el que devolvió generarTokenAPI()
  };

  const configurada = () => /^https:\/\/script\.google\.com\//.test(API.url) && API.token.length > 20;

  /* ---- helpers locales (app.js es una IIFE, no exporta los suyos) ---- */
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

  /* ---- estado en memoria ---- */
  let FICHAS = [];
  let GENERADO = "";
  let FILTRO = "";          // "" = todos
  let BUSCA = "";
  let CARGANDO = false;
  let ERROR_CARGA = "";

  /* ---- sesión (puente expuesto por app.js) ---- */
  const ses = () => window.LEUK_SESION || {};
  const puedeEditar = () => !!(ses().puedeEditarFichas && ses().puedeEditarFichas());

  /* ================= LLAMADAS A LA API ================= */

  // La API siempre responde HTTP 200 (limitación de ContentService): el
  // resultado real viene en el campo `ok` del cuerpo. Nunca mirar r.status.
  async function apiGet() {
    const u = `${API.url}?accion=fichas&token=${encodeURIComponent(API.token)}`;
    const r = await fetch(u, { redirect: "follow" });
    const txt = await r.text();
    let d;
    try { d = JSON.parse(txt); }
    catch (e) {
      // Pasa cuando el Web App no está publicado como "Cualquier persona":
      // Google devuelve el HTML de su pantalla de login en vez de JSON.
      throw new Error("La API no devolvió JSON. Suele ser que el Web App no está publicado con acceso «Cualquier persona». Volvé a desplegarlo.");
    }
    if (!d.ok) throw new Error(d.mensaje || d.error || "Error desconocido");
    return d;
  }

  // Content-Type: text/plain a propósito. Con application/json el navegador
  // manda un preflight OPTIONS que Apps Script no sabe responder, y el POST
  // muere con un error de CORS que no explica nada.
  async function apiPost(payload) {
    const r = await fetch(API.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({
        token: API.token,
        jwt: ses().token ? ses().token() : ""
      }, payload)),
      redirect: "follow"
    });
    const txt = await r.text();
    try { return JSON.parse(txt); }
    catch (e) {
      return { ok: false, error: "SIN_JSON", mensaje: "La API no devolvió JSON. Revisá el despliegue del Web App." };
    }
  }

  /* ================= DIBUJO ================= */

  function render() {
    const cont = $("#page-fichas-estado");
    if (!cont) return;

    if (!configurada()) { cont.innerHTML = pantallaSinConfigurar(); return; }

    if (!FICHAS.length && !ERROR_CARGA) { cargar(); }

    cont.innerHTML = `
      <div class="res-intro">
        Estado de cada ficha técnica, agrupado como las agrupa el bot: <b>una ficha es de un grupo</b>,
        no de un producto. El estado lo calcula el bot los miércoles a las 4 AM comparando el
        Archivo Maestro contra la web; desde acá lo cerrás cuando la ficha ya está hecha.
      </div>

      <div class="fe-chips" id="feChips">${chipsHTML()}</div>

      <div class="intg-bar">
        <input id="feSearch" class="intg-search" type="search" autocomplete="off"
               placeholder="Buscá por agrupación o por SKU…" value="${esc(BUSCA)}">
        <button id="feReload" class="btn-desc" title="Volver a leer la planilla">↻ Actualizar lista</button>
        <span class="intg-stat" id="feMeta">${metaHTML()}</span>
      </div>

      <div class="us-msg" id="feMsg"></div>
      <div id="feLista">${listaHTML()}</div>`;

    $("#feSearch").oninput = ev => { BUSCA = ev.target.value; pintarLista(); };
    $("#feReload").onclick = () => cargar(true);
    $("#feChips").onclick = ev => {
      const c = ev.target.closest("[data-estado]"); if (!c) return;
      FILTRO = (FILTRO === c.dataset.estado) ? "" : c.dataset.estado;
      render();
    };
    $("#feLista").onclick = onClickLista;
  }

  function pantallaSinConfigurar() {
    return `<div class="res-intro">
      <b>Falta conectar la API.</b> Abrí <code>app/fichas-estado.js</code> y completá
      <code>API.url</code> (la URL del Web App que termina en <code>/exec</code>) y
      <code>API.token</code> (el que devuelve <code>generarTokenAPI()</code> en Apps Script).
      Los pasos están en <code>app/apps-script/DESPLIEGUE.md</code>.
    </div>`;
  }

  function metaHTML() {
    if (CARGANDO) return "Leyendo la planilla…";
    if (ERROR_CARGA) return "";
    if (!GENERADO) return "";
    return `${FICHAS.length} ficha(s) · leído ${haceCuanto(GENERADO)}`;
  }

  function chipsHTML() {
    const cuenta = {};
    ESTADOS.forEach(e => { cuenta[e] = 0; });
    FICHAS.forEach(f => { if (cuenta[f.estado] !== undefined) cuenta[f.estado]++; });
    // Discontinuadas solo se muestran si hay: no aportan a la gestión diaria.
    return ESTADOS
      .filter(e => e !== "Discontinuada" || cuenta[e] > 0)
      .map(e => `<button class="fe-chip ${CLASE[e]} ${FILTRO === e ? "on" : ""}" data-estado="${esc(e)}">
           <b>${cuenta[e]}</b> <span>${esc(e)}</span></button>`).join("");
  }

  function visibles() {
    const q = BUSCA.trim().toLowerCase();
    return FICHAS.filter(f => {
      if (FILTRO && f.estado !== FILTRO) return false;
      if (!q) return true;
      return f._busca.indexOf(q) !== -1;
    });
  }

  function listaHTML() {
    if (CARGANDO && !FICHAS.length) return `<div class="fe-vacio">Leyendo la planilla…</div>`;
    if (ERROR_CARGA) {
      return `<div class="fe-vacio fe-error">
        <b>No pude leer las fichas.</b><div>${esc(ERROR_CARGA)}</div>
        <button class="btn-ghost" id="feRetry">Reintentar</button></div>`;
    }
    const lista = visibles();
    if (!lista.length) {
      return `<div class="fe-vacio">${FICHAS.length ? "Ninguna ficha coincide con el filtro." : "No hay fichas cargadas todavía."}</div>`;
    }
    return lista.map(filaHTML).join("");
  }

  function filaHTML(f) {
    const editable = f.editable && puedeEditar();
    const acciones = !editable ? "" : `
      <div class="fe-acc">
        ${f.estado !== "A actualizar" ? `<button class="btn-ghost" data-act="A actualizar" data-ag="${esc(f.agrupacion)}">Actualizar</button>` : ""}
        ${f.estado !== "Listo para publicar" ? `<button class="btn-primary fe-btn-listo" data-act="Listo para publicar" data-ag="${esc(f.agrupacion)}">Listo para publicar</button>` : ""}
      </div>`;

    const skus = f.skus.join(", ");
    const skusCortos = f.skus.length > 8 ? f.skus.slice(0, 8).join(", ") + ` y ${f.skus.length - 8} más` : skus;

    return `<div class="fe-row ${CLASE[f.estado] || ""}" data-ag="${esc(f.agrupacion)}">
      <div class="fe-main">
        <div class="fe-top">
          <span class="fe-ag">${esc(f.agrupacion)}</span>
          <span class="fe-badge ${CLASE[f.estado] || ""}">${esc(f.estado)}</span>
          <span class="fe-cant">${f.cantidad} SKU</span>
        </div>
        <div class="fe-skus" title="${esc(skus)}">${esc(skusCortos)}</div>
        ${f.motivo ? `<div class="fe-motivo">${esc(f.motivo)}</div>` : ""}
        <div class="fe-fecha">${f.detectado ? `En este estado desde ${esc(f.detectado)}` : ""}</div>
      </div>
      ${acciones}
      <div class="fe-fila-msg"></div>
    </div>`;
  }

  function pintarLista() {
    const l = $("#feLista"); if (l) l.innerHTML = listaHTML();
    const m = $("#feMeta"); if (m) m.innerHTML = metaHTML();
    const c = $("#feChips"); if (c) c.innerHTML = chipsHTML();
  }

  /* ================= CARGA ================= */

  async function cargar(forzarRefresco) {
    if (CARGANDO) return;
    CARGANDO = true; ERROR_CARGA = "";
    pintarLista();
    try {
      const d = await apiGet();
      FICHAS = (d.fichas || []).map(f => {
        f._busca = (f.agrupacion + " " + (f.skus || []).join(" ")).toLowerCase();
        return f;
      });
      GENERADO = d.generado || "";
    } catch (e) {
      ERROR_CARGA = e.message || String(e);
      FICHAS = [];
    } finally {
      CARGANDO = false;
      render();
      const r = $("#feRetry"); if (r) r.onclick = () => cargar(true);
    }
  }

  /* ================= ESCRITURA ================= */

  function onClickLista(ev) {
    const b = ev.target.closest("[data-act]"); if (!b) return;
    const f = FICHAS.filter(x => x.agrupacion === b.dataset.ag)[0];
    if (!f) return;
    confirmar(f, b.dataset.act);
  }

  // Confirmación obligatoria antes de escribir. Muestra el estado que va a
  // quedar y, si la ficha está "A actualizar", el motivo textual que detectó
  // el bot — para que nadie cierre una ficha sin ver que cambió la potencia.
  function confirmar(f, nuevoEstado, opciones) {
    opciones = opciones || {};
    const ov = document.createElement("div");
    ov.className = "detail"; ov.id = "feModal";

    const aviso = opciones.conflicto ? `
      <div class="fe-conflicto">
        <b>Ojo: esta ficha cambió mientras la mirabas.</b>
        <div>Ahora está en <b>${esc(opciones.estadoActual)}</b>${opciones.motivoActual ? ` — ${esc(opciones.motivoActual)}` : ""}.</div>
        <div>Si seguís, tu cambio pisa ese estado.</div>
      </div>` : "";

    const motivo = (!opciones.conflicto && f.motivo) ? `
      <div class="fe-modal-motivo"><span>Qué cambió</span><div>${esc(f.motivo)}</div></div>` : "";

    ov.innerHTML = `<div class="detail-inner fe-modal">
      <button class="detail-close" id="feClose">✕</button>
      <h2>${esc(f.agrupacion)}</h2>
      ${aviso}
      <div class="fe-modal-cambio">
        <span class="fe-badge ${CLASE[f.estado] || ""}">${esc(opciones.estadoActual || f.estado)}</span>
        <span class="fe-flecha">→</span>
        <span class="fe-badge ${CLASE[nuevoEstado] || ""}">${esc(nuevoEstado)}</span>
      </div>
      ${motivo}
      <div class="fe-modal-skus"><span>${f.cantidad} SKU en el grupo</span><div>${esc(f.skus.join(", "))}</div></div>
      <div class="us-msg" id="feModalMsg"></div>
      <div class="desc-actions">
        <button class="btn-ghost" id="feCancel">Cancelar</button>
        <button class="btn-primary" id="feOk">${opciones.conflicto ? "Aplicar igual" : "Confirmar"}</button>
      </div>
    </div>`;

    document.body.appendChild(ov);
    const cerrar = () => ov.remove();
    ov.querySelector("#feClose").onclick = cerrar;
    ov.querySelector("#feCancel").onclick = cerrar;
    ov.addEventListener("click", e => { if (e.target === ov) cerrar(); });

    ov.querySelector("#feOk").onclick = async () => {
      const btn = ov.querySelector("#feOk");
      const msg = ov.querySelector("#feModalMsg");
      btn.disabled = true; btn.textContent = "Guardando…"; msg.className = "us-msg"; msg.textContent = "";

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
        f.motivo = r.motivo != null ? r.motivo : f.motivo;
        f.editable = r.estadoNuevo !== "Discontinuada";
        cerrar();
        pintarLista();
        avisar(`${f.agrupacion} → ${r.estadoNuevo}${r.sinCambios ? " (ya estaba así)" : ""}`, true);
        return;
      }

      // Conflicto: se reabre la confirmación mostrando qué pasó de verdad.
      if (r.error === "CONFLICTO") {
        f.estado = r.estadoActual;
        f.detectado = r.detectadoActual;
        f.motivo = r.motivoActual || "";
        cerrar(); pintarLista();
        // Si el cambio que pasó en el medio dejó la ficha justo donde la
        // persona la quería, no tiene sentido preguntarle si quiere pisarlo:
        // no habría nada que pisar. Se avisa y se termina.
        if (r.estadoActual === nuevoEstado) {
          avisar(`${f.agrupacion} ya quedó en "${nuevoEstado}" — alguien lo hizo mientras mirabas.`, true);
          return;
        }
        confirmar(f, nuevoEstado, {
          conflicto: true,
          estadoActual: r.estadoActual,
          motivoActual: r.motivoActual
        });
        return;
      }

      // El resto de los errores se muestran tal cual los explica la API:
      // los mensajes ya están escritos para que los lea una persona.
      btn.disabled = false; btn.textContent = opciones.conflicto ? "Aplicar igual" : "Confirmar";
      msg.className = "us-msg px-err";
      msg.textContent = r.mensaje || r.error || "No se pudo guardar.";

      // Si la ficha quedó discontinuada, refrescamos para que la lista lo refleje.
      if (r.error === "FICHA_DISCONTINUADA" || r.error === "NO_ENCONTRADA") cargar(true);
    };
  }

  function avisar(texto, ok) {
    const m = $("#feMsg"); if (!m) return;
    m.className = "us-msg " + (ok ? "px-ok" : "px-err");
    m.textContent = texto;
    setTimeout(() => { if (m.textContent === texto) { m.textContent = ""; m.className = "us-msg"; } }, 6000);
  }

  /* ================= UTILIDADES ================= */
  function haceCuanto(iso) {
    const t = Date.parse(iso); if (isNaN(t)) return "";
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return "recién";
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return `hace ${Math.round(s / 86400)} días`;
  }

  // app.js la llama al entrar a la página (ver goToPage).
  window.renderFichasEstado = render;
})();
