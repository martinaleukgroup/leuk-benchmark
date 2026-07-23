/* ===================== FICHAS TÉCNICAS · UI ===================== */
/* Lee window.FICHAS (generado por pipeline/fichas_build.py → fichas-data.js). */
(function () {
  const ZIP_URL = "";   // URL de descarga del ZIP con TODAS las fichas (se completa cuando esté en Drive)
  const FICHAS = (window.FICHAS || []).filter(f => f.sku || f.titulo);
  // Documentos: agrupar fichas por "Agrupación de fichas técnicas" (varias hojas por archivo)
  const DOCS = []; const _byAg = {};
  FICHAS.forEach(f => {
    const k = f.agrupacion || f.titulo;
    if (!_byAg[k]) { _byAg[k] = { ag: k, fichas: [] }; DOCS.push(_byAg[k]); }
    _byAg[k].fichas.push(f);
  });
  DOCS.sort((a, b) => a.ag.localeCompare(b.ag, "es"));
  // texto de búsqueda por documento: nombre de agrupación + títulos + todos los SKU
  DOCS.forEach(d => {
    const skus = d.fichas.reduce((acc, f) => acc.concat(f.skus || [f.sku]), []);
    d._s = (d.ag + " " + d.fichas.map(f => f.titulo).join(" ") + " " + skus.join(" ")).toLowerCase();
  });
  const esc = s => (s == null ? "" : String(s)).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ICON = "assets/ficha/";
  // Ícono "Dimensión de Calado" — original de la guía de diseño (versión sin recuadro,
  // la indicada "para uso en reducciones").
  const CALADO_SVG = `<img class="f-cal-ic" src="${"assets/ficha/"}calado.png" alt="">`;

  window._fichaImgErr = function (img, label, fname) {
    const box = img.parentNode; box.classList.add("f-ph");
    box.innerHTML = `<div class="f-ic">🖼️</div><div>${label}</div>` + (fname ? `<code>${fname}</code>` : "");
  };

  // Hoja de accesorios: grilla de 3 columnas con foto + SKUs (Chill / Rieles / Dyna)
  function accHTML(f) {
    const items = f.items || [];
    const cells = items.map(it => {
      const img = it.foto_url
        ? `<img src="${esc(it.foto_url)}" alt="" onerror="window._fichaImgErr(this,'SIN FOTO','')">`
        : "";
      const box = it.foto_url ? `<div class="f-acc-img">${img}</div>`
        : `<div class="f-acc-img f-ph"><div class="f-ic">🖼️</div><div>SIN FOTO</div></div>`;
      const caps = (it.lineas || []).map(l => `<div>SKU ${esc(l.sku)} - ${esc(l.nombre)}</div>`).join("");
      return `<div class="f-acc-cell">${box}<div class="f-acc-cap">${caps}</div></div>`;
    }).join("");
    return `<div class="f-page f-page-acc">
      <div class="f-head">
        <div><div class="f-name">${esc(f.titulo)}</div><div class="f-sub">${esc(f.linea)}</div></div>
        <img class="f-logo" src="${ICON}logo.png" alt="Leuk">
      </div>
      <div class="f-hr"></div>
      <div class="f-acc-grid${items.length > 12 ? " is-dense" : ""}">${cells}</div>
      <div class="f-foot"><div class="f-web">www.leukiluminacion.com</div></div>
    </div>`;
  }

  function fichaHTML(f) {
    if (f.tipo === "accesorios") return accHTML(f);
    // etiqueta puede traer <small>…</small> del builder → no escapar la etiqueta
    const rows = f.filas.map(r => `<tr><td class="k">${r.k}</td><td>${esc(r.v)}</td></tr>`).join("");

    const a = f.assets || {};
    const ph = (label, fname) => `<div class="f-ic">🖼️</div><div>${label}</div>${fname ? `<code>${esc(fname)}</code>` : ""}`;
    const media = (url, cls, label, fname) => url
      ? `<div class="f-imgbox ${cls}"><img src="${esc(url)}" alt="" onerror="window._fichaImgErr(this,'${label}','${esc(fname || "")}')"></div>`
      : `<div class="f-imgbox ${cls} f-ph">${ph(label, fname)}</div>`;
    const foto = media(f.foto_url, "f-photo", "FOTO DE PRODUCTO", a.foto);
    const dibujo = media(a.dibujo_url, "f-drawing", "DIBUJO TÉCNICO", a.dibujo);
    const polar = media(a.curva_polar_url, "f-curve", "", a.curva_polar);
    const cono = media(a.curva_cono_url, "f-curve", "", a.curva_cono);
    // Íconos de color: anillo exterior + disco interior; los bicolores van partidos al medio
    // (según la guía "Íconos y dibujos índice" de diseño).
    const cols = (f.colores && f.colores.length) ? f.colores : [{ hexes: ["#1a1a1a"], light: false }];
    const dots = cols.map(c => {
      const hs = (c.hexes && c.hexes.length) ? c.hexes : (c.hex ? [c.hex] : []);
      if (!hs.length) return "";   // color sin dato → no se dibuja el ícono
      const fill = hs.length > 1
        ? `background:linear-gradient(90deg,${esc(hs[0])} 0 50%,${esc(hs[1])} 50% 100%)`
        : `background:${esc(hs[0])}`;
      return `<span class="f-dot"><span class="f-dot-in${c.light ? " is-light" : ""}" style="${fill}"></span></span>`;
    }).join("");
    // Información complementaria: solo los botones cuyos archivos existen
    const btns = [];
    if (a.ldt_url) btns.push(`<a class="f-btn" href="${esc(a.ldt_url)}" download><img src="${ICON}ldt.png"><div class="lb">Archivo LDT</div></a>`);
    if (a.cad_url) btns.push(`<a class="f-btn" href="${esc(a.cad_url)}" download><img src="${ICON}cad.png"><div class="lb">Archivo CAD</div></a>`);
    if (a.manual_url) btns.push(`<a class="f-btn" href="${esc(a.manual_url)}" target="_blank" rel="noopener"><img src="${ICON}manual.png"><div class="lb">Manual de Instalación</div></a>`);
    const infoComp = btns.length ? `<div><div class="f-h">Información Complementaria</div><div class="f-buttons">${btns.join("")}</div></div>` : "";
    // Datos fotométricos: cada curva se muestra SOLO si existe. Si no hay ninguna,
    // "Información Complementaria" sube a ese lugar.
    const polarBlock = a.curva_polar_url ? `
          <div class="f-pblock">${polar}
            <div>
              <div class="f-ctitle">Curva de distribución de la intensidad luminosa (CD)</div>
              <div class="f-legend"><div><i style="background:var(--blue)"></i>C0-C180</div><div><i style="background:var(--red)"></i>C90-C270</div><div><i style="background:var(--mag)"></i>G3</div></div>
            </div>
          </div>` : "";
    const conoBlock = a.curva_cono_url ? `
          <div class="f-pblock">${cono}
            <div>
              <div class="f-ctitle">Distribución de iluminancia a distancia (LUX)</div>
              <div class="f-note"><b>Nota:</b> Las curvas indican el área iluminada y la iluminancia promedio según la distancia de la luminaria.</div>
            </div>
          </div>` : "";
    const fotoBlock = (polarBlock || conoBlock) ? `<div class="f-h">Datos Fotométricos</div>${polarBlock}${conoBlock}` : "";

    // Calado: ícono + "Ø80-85 x 70 mm*" debajo de la tabla, con la nota al pie si hay asterisco
    const caladoBlock = f.calado ? `
          <div class="f-calado">${CALADO_SVG}<span>${esc(f.calado.txt)}</span></div>` +
      (f.calado.nota ? `<div class="f-calado-nota">* Profundidad de calado total aproximada. Considera dicroica y zócalo estándar.</div>` : "")
      : "";

    return `<div class="f-page">
      <div class="f-head">
        <div><div class="f-name">${esc(f.titulo)}</div><div class="f-sub">${esc(f.linea)}</div></div>
        <img class="f-logo" src="${ICON}logo.png" alt="Leuk">
      </div>
      <div class="f-hr"></div>
      <div class="f-top">${foto}${dibujo}</div>
      <div class="f-cols">
        <div>
          <div class="f-h">Especificaciones Técnicas <span class="f-dots">${dots}</span></div>
          <table class="f-spec">${rows}</table>
          ${caladoBlock}
        </div>
        <div>
          ${fotoBlock}
          ${infoComp}
        </div>
      </div>
      <div class="f-foot">
        <div class="f-web">www.leukiluminacion.com</div>
        <div class="f-seals">
          <img class="f-seal" src="${ICON}tierra.png" alt="Puesto a tierra">
        </div>
      </div>
    </div>`;
  }

  let mounted = false;
  function mount() {
    const page = document.getElementById("page-fichas");
    if (!page) return;
    page.innerHTML = `
      <div class="fichas-bar">
        <div class="fb-field fb-combo">
          <label>Ficha / Línea</label>
          <input id="fichaInput" type="text" placeholder="Buscá por nombre, línea o SKU…" autocomplete="off">
          <div id="fichaList" class="fb-list" hidden></div>
        </div>
        <button class="fb-btn" id="fichaPdf">Descargar esta ficha</button>
        <button class="fb-btn fb-btn-alt" id="fichaZip">Descargar todas (ZIP)</button>
        <div class="fichas-note" id="fichaNote"></div>
      </div>
      <div id="ficha-stage"></div>`;

    const input = document.getElementById("fichaInput");
    const list = document.getElementById("fichaList");
    const stage = document.getElementById("ficha-stage");
    const note = document.getElementById("fichaNote");

    const draw = i => {
      const d = DOCS[i]; if (!d) return;
      stage.innerHTML = d.fichas.map(fichaHTML).join("");
      note.innerHTML = d.fichas.length > 1
        ? `Documento <b>${esc(d.ag)}</b> — ${d.fichas.length} hojas. "Descargar PDF" las baja todas en un archivo.`
        : `1 ficha.`;
    };
    const renderList = q => {
      q = (q || "").toLowerCase().trim();
      const hits = DOCS.map((d, i) => ({ d, i })).filter(o => !q || o.d._s.includes(q)).slice(0, 80);
      list.innerHTML = hits.length
        ? hits.map(o => `<div class="fb-item" data-i="${o.i}">${esc(o.d.ag)}${o.d.fichas.length > 1 ? `<span class="fb-badge">${o.d.fichas.length} hojas</span>` : ""}</div>`).join("")
        : `<div class="fb-empty">Sin resultados</div>`;
      list.hidden = false;
    };
    const pick = i => { input.value = DOCS[i].ag; list.hidden = true; draw(i); };

    input.addEventListener("focus", () => renderList(input.value));
    input.addEventListener("input", () => renderList(input.value));
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { const f = list.querySelector(".fb-item"); if (f) pick(+f.dataset.i); }
      else if (e.key === "Escape") { list.hidden = true; input.blur(); }
    });
    list.addEventListener("mousedown", e => { const it = e.target.closest(".fb-item"); if (it) pick(+it.dataset.i); });
    input.addEventListener("blur", () => setTimeout(() => { list.hidden = true; }, 150));

    document.getElementById("fichaPdf").addEventListener("click", () => {
      document.body.classList.add("fichas-printing");
      window.print();
      setTimeout(() => document.body.classList.remove("fichas-printing"), 500);
    });
    document.getElementById("fichaZip").addEventListener("click", () => {
      if (ZIP_URL) window.open(ZIP_URL, "_blank");
      else alert("El ZIP con todas las fichas se genera al correr el pipeline (run_all.sh) y se sube a Drive. Falta configurar el link de descarga.");
    });

    pick(0);
    mounted = true;
  }

  // Expuesto para goToPage('fichas')
  window.renderFichas = function () { if (!mounted) mount(); };
  // Helpers para el exportador de PDFs (pipeline/fichas_export_pdf.py)
  window._fichasDocs = DOCS;
  window._fichaHTML = fichaHTML;
})();
