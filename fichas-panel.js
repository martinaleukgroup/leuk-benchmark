/* ===================== FICHAS TÉCNICAS · PANTALLA =====================
   Desde el 02/11/2026 las fichas se generan solas (GitHub Actions, lun–vie 7:12, o el
   botón "⟳ Regenerar fichas"), así que ya no hay estados que alguien marque a mano
   (Solicitada / A actualizar / Finalizada): se apagaron, junto con la API de Apps Script
   que los leía (Martina, 02/11/2026).

   En su lugar, etiquetas automáticas que salen de lo que hizo el proceso
   (fichas-historial.json, lo escribe automatizacion/ci/fichas_cambiadas.py):
     · Nueva        la ficha se creó en los últimos DIAS_RECIENTE días
     · Actualizada  cambió en los últimos DIAS_RECIENTE días (con qué cambió)
     · Falta foto   alguna hoja de producto no tiene foto: lo único que pide trabajo
     · Discontinuada  todos sus colores/variantes discontinuados (dato del Hub)

   Si el historial no carga, la vista NO se rompe: se ven y descargan las fichas igual.
   ==================================================================== */
(function () {

  const $ = s => document.querySelector(s);
  const esc = s => (s == null ? "" : String(s))
    .replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const DIAS_RECIENTE = 15;
  const CARPETA_FOTOS = "https://drive.google.com/drive/folders/1OmHlMZ4sMK5890tNkRoeMoNZVgU15JLD";
  const ANCHO_A4 = 794;          // 210mm a 96dpi, el ancho fijo de .f-page

  // Orden de los chips y prioridad del color en la lista (la primera que aplique)
  const ETIQUETAS = [
    { k: "foto", txt: "Falta foto", cls: "fe-foto" },
    { k: "nueva", txt: "Nueva", cls: "fe-nueva" },
    { k: "actualizada", txt: "Actualizada", cls: "fe-actualizada" },
    { k: "discontinuada", txt: "Discontinuada", cls: "fe-discontinuada" },
  ];
  const ETQ = {}; ETIQUETAS.forEach(e => { ETQ[e.k] = e; });

  /* ---- estado en memoria ---- */
  let ITEMS = [];       // { ag, doc, h, etq: [k...], skus: [] }
  let HIST = {};        // agrupación → { creada, actualizada, cambios, falta_foto }
  let sel = null;       // agrupación seleccionada
  let FILTRO = "";      // "" = todas; si no, una clave de ETIQUETAS
  let BUSCA = "";
  let AVISO = "";       // el historial no cargó: se avisa pero la vista sigue
  let AMPLIADO = false; // la ficha sola, sin lista ni buscador
  let montado = false;

  const ses = () => window.LEUK_SESION || {};
  const item = ag => ITEMS.filter(x => x.ag === ag)[0] || null;

  /* ================= DATOS ================= */

  const diasDesde = iso => {
    if (!iso) return Infinity;
    const d = new Date(iso + "T12:00:00");
    return (Date.now() - d.getTime()) / 86400000;
  };
  const fecha = iso => iso ? iso.split("-").reverse().join("/") : "";

  function construir() {
    const docs = (window.FichasDoc && window.FichasDoc.docs()) || [];
    ITEMS = docs.map(d => {
      const h = HIST[d.ag] || {};
      const etq = [];
      if ((h.falta_foto || []).length) etq.push("foto");
      if (diasDesde(h.creada) <= DIAS_RECIENTE) etq.push("nueva");
      else if (diasDesde(h.actualizada) <= DIAS_RECIENTE) etq.push("actualizada");
      const prod = d.fichas.filter(f => !f.tipo);
      if (prod.length && prod.every(f => f.discontinuado)) etq.push("discontinuada");
      const skus = [];
      d.fichas.forEach(f => (f.skus || [f.sku]).forEach(s => { if (s && skus.indexOf(String(s)) === -1) skus.push(String(s)); }));
      return { ag: d.ag, doc: d, h, etq, skus };
    });
    ITEMS.sort((a, b) => a.ag.localeCompare(b.ag, "es"));
  }

  async function cargar() {
    AVISO = "";
    try {
      const r = await fetch(`fichas-historial.json?t=${Date.now()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      HIST = (await r.json()).fichas || {};
    } catch (e) {
      HIST = {};
      AVISO = "No pude leer el historial de las fichas: no se ven las etiquetas. Las fichas se ven y descargan igual.";
    }
    construir();
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
        <button id="fpZip" class="btn-desc" title="Genera un ZIP con todas las fichas en PDF">⬇ Todas (ZIP)</button>
        <button id="fpGH" class="btn-desc" hidden title="Vuelve a leer el Hub, regenera las fichas y sus PDF (corre en GitHub)">⟳ Regenerar fichas</button>
        <span class="intg-stat" id="fpMeta"></span>
      </div>
      <div class="fp-gh" id="fpGHEstado" hidden></div>
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
    $("#fpZip").onclick = ev => window.FichasDoc.descargarTodas(ev.currentTarget, $("#fpMeta"));
    $("#fpGH").onclick = () => pedirGH("");
    if (puedeGH()) { $("#fpGH").hidden = false; refrescarGH(); }
    $("#fpChips").onclick = ev => {
      const c = ev.target.closest("[data-etq]"); if (!c) return;
      FILTRO = (FILTRO === c.dataset.etq) ? "" : c.dataset.etq;
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

    construir();                   // primero lo local: la vista ya sirve
    pintarTodo();
    cargar().then(pintarTodo);     // después se le suman las etiquetas
  }

  function pintarTodo() { pintarChips(); pintarLista(); pintarDetalle(); pintarMeta(); }

  function pintarMeta() {
    const m = $("#fpMeta"); if (m) m.textContent = `${ITEMS.length} fichas`;
    const a = $("#fpAviso");
    if (a) { a.className = AVISO ? "us-msg px-err" : "us-msg"; a.textContent = AVISO; }
  }

  function pintarChips() {
    const c = {}; ETIQUETAS.forEach(e => { c[e.k] = 0; });
    ITEMS.forEach(x => x.etq.forEach(k => { c[k]++; }));
    $("#fpChips").innerHTML = ETIQUETAS
      .filter(e => c[e.k] > 0 || e.k !== "discontinuada")
      .map(e => `<button class="fe-chip ${e.cls} ${FILTRO === e.k ? "on" : ""}" data-etq="${e.k}"
          title="${e.k === "nueva" || e.k === "actualizada" ? `En los últimos ${DIAS_RECIENTE} días` : ""}">
          <b>${c[e.k]}</b> <span>${esc(e.txt)}</span></button>`).join("");
  }

  function visibles() {
    const q = BUSCA.trim().toLowerCase();
    return ITEMS.filter(x => {
      if (FILTRO && x.etq.indexOf(FILTRO) === -1) return false;
      if (!q) return true;
      return (x.doc._s || (x.ag + " " + x.skus.join(" ")).toLowerCase()).indexOf(q) !== -1;
    });
  }

  const claseDe = x => x.etq.length ? ETQ[x.etq[0]].cls : "";

  // Devuelve true si la selección cambió, para que quien llame repinte el detalle.
  function pintarLista() {
    const lista = visibles();
    const antes = sel;
    if (lista.length && !lista.some(x => x.ag === sel)) sel = lista[0].ag;
    if (!lista.length) sel = null;

    $("#fpSide").innerHTML = lista.length
      ? lista.map(x => `<div class="fp-it ${claseDe(x)} ${x.ag === sel ? "on" : ""}" data-ag="${esc(x.ag)}"
            title="${esc(x.etq.map(k => ETQ[k].txt).join(" · "))}">
            <i class="fp-dot"></i><b>${esc(x.ag)}</b><span>${x.skus.length}</span></div>`).join("")
      : `<div class="fp-vacio">Nada coincide con el filtro.</div>`;
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

    const h = x.h;
    const badges = x.etq.map(k => `<span class="fe-badge ${ETQ[k].cls}">${esc(ETQ[k].txt)}</span>`).join("");
    const hojas = x.doc.fichas.length > 1 ? `${x.doc.fichas.length} hojas` : "";
    const lineas = [];
    if (h.creada) lineas.push(`Creada el ${esc(fecha(h.creada))}`);
    if (h.actualizada) lineas.push(`Actualizada el ${esc(fecha(h.actualizada))}${
      (h.cambios || []).length ? ` · cambió: ${esc(h.cambios.join(", "))}` : ""}`);

    head.innerHTML = `<div class="fp-head ${claseDe(x)}">
      <div class="fp-title">
        <span class="fp-h1">${esc(x.ag)}</span>${badges}
        <span class="fp-meta">${x.skus.length} SKU</span>
        ${hojas ? `<span class="fp-meta">· ${hojas}</span>` : ""}
      </div>
      ${x.skus.length ? `<div class="fp-skus">${esc(x.skus.join(", "))}</div>` : ""}
      ${(h.falta_foto || []).length ? `<div class="fp-motivo fe-foto">Falta la foto de producto de
        <b>${esc(h.falta_foto.join(", "))}</b>. Subila a la
        <a href="${CARPETA_FOTOS}" target="_blank" rel="noopener">carpeta de fotos de Drive</a>
        (nombrada con el SKU, ej. <i>${esc(h.falta_foto[0])}FotoProducto0.png</i>) y la ficha se completa
        sola en la próxima actualización. Mientras tanto su PDF no se sube a Drive.</div>` : ""}
      ${lineas.length ? `<div class="fp-fecha">${lineas.join(" · ")}</div>` : ""}
      <div class="fp-acc">
        <button class="btn-ghost" data-pdf="1">⬇ Descargar PDF</button>
        ${puedeGH() ? `<button class="btn-ghost" data-gh="1"
               title="Vuelve a generar esta ficha desde el Hub y su PDF, aunque no haya cambiado">⟳ Reimprimir</button>` : ""}
        <button class="btn-ghost" data-ampliar="1">${AMPLIADO ? "⤡ Volver a la lista" : "⤢ Ampliar"}</button>
      </div>
    </div>`;

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
    if (ev.target.closest("[data-gh]")) { pedirGH(x.ag); return; }
  }

  function ampliar(si) {
    AMPLIADO = si;
    const page = $("#page-fichas"); if (!page) return;
    page.classList.toggle("fp-ancho", AMPLIADO);
    const b = page.querySelector("[data-ampliar]");
    if (b) b.textContent = AMPLIADO ? "⤡ Volver a la lista" : "⤢ Ampliar";
    escalar();
    if (AMPLIADO) window.scrollTo({ top: 0 });
  }

  function avisar(texto, ok) {
    const m = $("#fpMsg"); if (!m) return;
    m.className = "us-msg " + (ok ? "px-ok" : "px-err");
    m.textContent = texto;
    setTimeout(() => { if (m.textContent === texto) { m.textContent = ""; m.className = "us-msg"; } }, 6000);
  }

  /* ================= REGENERAR EN GITHUB =================
     El botón dispara el workflow "Fichas técnicas · actualización diaria" (el mismo de
     las 7:12) a través de la Edge Function `fichas-github`, que guarda el token de
     GitHub y valida el rol. Ver supabase/functions/fichas-github y automatizacion/ci.
     Sólo admin, líder y coordinación (Martina, 02/11/2026). */

  const ROLES_GH = ["admin", "lider", "coordinacion"];
  const puedeGH = () => ROLES_GH.includes(ses().rol ? ses().rol() : "");
  let GH_TIMER = null, GH_PEDIDO = 0;

  async function fnGH(body) {
    try {
      const r = await fetch(`${ses().sbUrl}/functions/v1/fichas-github`, {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, ses().head ? ses().head() : {}),
        body: JSON.stringify(body)
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 404) return { error: "Falta desplegar la función fichas-github en Supabase." };
      if (!r.ok) return Object.assign({ error: `Error ${r.status}` }, d);
      return d;
    } catch (e) { return { error: "No se pudo contactar al servidor." }; }
  }

  const hora = iso => iso ? new Date(iso).toLocaleString("es-AR",
    { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

  function pintarGH(html, cls) {
    const box = $("#fpGHEstado"); if (!box) return;
    box.hidden = !html; box.className = "fp-gh " + (cls || ""); box.innerHTML = html || "";
  }

  async function refrescarGH() {
    clearTimeout(GH_TIMER);
    const d = await fnGH({ accion: "estado" });
    // Sin función o sin token todavía: no ensuciar la pantalla; el aviso sale al tocar el botón
    if (d.error) { pintarGH(/Falta/.test(d.error) || d.sin_token ? "" : esc(d.error), "px-err"); return; }
    const c = d.corrida;
    if (!c) { pintarGH(""); return; }
    const link = c.url ? ` · <a href="${esc(c.url)}" target="_blank" rel="noopener">ver en GitHub</a>` : "";
    const enCurso = c.estado === "queued" || c.estado === "in_progress";
    // Recién pedida y GitHub todavía no la muestra: seguir esperando
    const vieja = GH_PEDIDO && new Date(c.inicio).getTime() < GH_PEDIDO - 15000;
    if (enCurso || vieja) {
      pintarGH(`⟳ Regenerando fichas… ${enCurso ? `desde las ${esc(hora(c.inicio))}` : "arrancando"} (tarda unos 5 minutos)${enCurso ? link : ""}`, "px-run");
      GH_TIMER = setTimeout(refrescarGH, 15000);
      return;
    }
    const recien = !!GH_PEDIDO; GH_PEDIDO = 0;
    const btn = $("#fpGH"); if (btn) btn.disabled = false;
    if (c.resultado === "success") {
      const publicada = /plataforma: publicada/.test(c.resumen || "");
      pintarGH(`✓ Última corrida (${esc(c.origen)}, ${esc(hora(c.fin || c.inicio))}): ${esc(c.resumen || "terminó bien")}${link}${
        recien && publicada ? "<br><b>Recargá la página en 1–2 minutos para ver las fichas nuevas.</b>" : ""}`, "px-ok");
    } else {
      pintarGH(`⛔ La última corrida (${esc(c.origen)}, ${esc(hora(c.fin || c.inicio))}) no terminó bien${
        c.resumen ? `: ${esc(c.resumen)}` : ""}${link}`, "px-err");
    }
  }

  function pedirGH(ag) {
    if (!puedeGH()) return;
    const ov = document.createElement("div");
    ov.className = "detail"; ov.id = "fpModal";
    ov.innerHTML = `<div class="detail-inner fp-modal fp-modal-lote">
      <button class="detail-close" id="fpClose">✕</button>
      <h2>${ag ? `Reimprimir ${esc(ag)}` : "Regenerar fichas"}</h2>
      <div class="fp-conflicto"><div>${ag
        ? `Vuelve a leer el Hub y genera de nuevo esta ficha y su PDF, aunque no haya cambiado.
           También se actualizan las demás fichas que hayan cambiado.`
        : `Vuelve a leer el Hub, actualiza las fichas que cambiaron y genera sus PDF.
           Es lo mismo que corre solo de lunes a viernes a las 7:12.`}
        Tarda unos 5 minutos.</div></div>
      <div class="fp-modal-caja"><span>Solo probar</span><div>Muestra qué cambiaría y genera los PDF, sin publicar nada.</div></div>
      <div class="fp-modal-caja"><span>Publicar</span><div>Actualiza las fichas en la plataforma para todo el equipo.</div></div>
      <div class="us-msg" id="fpModalMsg"></div>
      <div class="desc-actions">
        <button class="btn-ghost" id="fpCancel">Cancelar</button>
        <button class="btn-ghost" id="fpProbar">Solo probar</button>
        <button class="btn-primary" id="fpPublicar">Publicar</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    const cerrar = () => ov.remove();
    ov.querySelector("#fpClose").onclick = cerrar;
    ov.querySelector("#fpCancel").onclick = cerrar;
    ov.addEventListener("click", e => { if (e.target === ov) cerrar(); });

    const correr = async modo => {
      const msg = ov.querySelector("#fpModalMsg");
      ov.querySelectorAll("button").forEach(b => b.disabled = true);
      msg.className = "us-msg"; msg.textContent = "Pidiéndoselo a GitHub…";
      const d = await fnGH({ accion: "correr", modo, solo: ag || "" });
      if (d.error) {
        ov.querySelectorAll("button").forEach(b => b.disabled = false);
        msg.className = "us-msg px-err";
        msg.innerHTML = esc(d.error) + (d.url ? ` · <a href="${esc(d.url)}" target="_blank" rel="noopener">ver la que está corriendo</a>` : "");
        return;
      }
      cerrar();
      GH_PEDIDO = Date.now();
      const btn = $("#fpGH"); if (btn) btn.disabled = true;
      pintarGH("⟳ Regenerando fichas… arrancando (tarda unos 5 minutos)", "px-run");
      GH_TIMER = setTimeout(refrescarGH, 8000);
    };
    ov.querySelector("#fpProbar").onclick = () => correr("prueba");
    ov.querySelector("#fpPublicar").onclick = () => correr("real");
  }

  // app.js la llama al entrar a la página (goToPage 'fichas').
  window.renderFichas = function () { if (!montado) mount(); };
})();
