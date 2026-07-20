/* ===================== FICHAS TÉCNICAS · UI ===================== */
/* Lee window.FICHAS (generado por pipeline/fichas_build.py → fichas-data.js). */
(function () {
  const FICHAS = (window.FICHAS || []).filter(f => f.sku || f.titulo);
  // Documentos: agrupar fichas por "Agrupación de fichas técnicas" (varias hojas por archivo)
  const DOCS = []; const _byAg = {};
  FICHAS.forEach(f => {
    const k = f.agrupacion || f.titulo;
    if (!_byAg[k]) { _byAg[k] = { ag: k, fichas: [] }; DOCS.push(_byAg[k]); }
    _byAg[k].fichas.push(f);
  });
  DOCS.sort((a, b) => a.ag.localeCompare(b.ag, "es"));
  const esc = s => (s == null ? "" : String(s)).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ICON = "assets/ficha/";

  window._fichaImgErr = function (img, label, fname) {
    const box = img.parentNode; box.classList.add("f-ph");
    box.innerHTML = `<div class="f-ic">🖼️</div><div>${label}</div>` + (fname ? `<code>${fname}</code>` : "");
  };

  function fichaHTML(f) {
    const rows = f.filas.map(r => {
      const v = r.color ? `<span class="f-swatch" style="background:${r.color}"></span>${esc(r.v)}` : esc(r.v);
      // etiqueta puede traer <small>…</small> del builder → no escapar la etiqueta
      return `<tr><td class="k">${r.k}</td><td>${v}</td></tr>`;
    }).join("");

    const a = f.assets || {};
    const ph = (label, fname) => `<div class="f-ic">🖼️</div><div>${label}</div>${fname ? `<code>${esc(fname)}</code>` : ""}`;
    const media = (url, cls, label, fname) => url
      ? `<div class="f-imgbox ${cls}"><img src="${esc(url)}" alt="" onerror="window._fichaImgErr(this,'${label}','${esc(fname || "")}')"></div>`
      : `<div class="f-imgbox ${cls} f-ph">${ph(label, fname)}</div>`;
    const foto = media(f.foto_url, "f-photo", "FOTO DE PRODUCTO", a.foto);
    const dibujo = media(a.dibujo_url, "f-drawing", "DIBUJO TÉCNICO", a.dibujo);
    const polar = media(a.curva_polar_url, "f-curve", "", a.curva_polar);
    const cono = media(a.curva_cono_url, "f-curve", "", a.curva_cono);
    const cols = (f.colores && f.colores.length) ? f.colores : [{ hex: "#1a1a1a", light: false }];
    const dots = cols.map(c => `<span class="f-dot" style="${c.light ? "background:#fff;border:1.4px solid #1a1a1a" : "background:" + esc(c.hex)}"></span>`).join("");

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
        </div>
        <div>
          <div class="f-h">Datos Fotométricos</div>
          <div class="f-pblock">${polar}
            <div>
              <div class="f-ctitle">Curva de distribución de la intensidad luminosa (CD)</div>
              <div class="f-legend"><div><i style="background:var(--blue)"></i>C0-C180</div><div><i style="background:var(--red)"></i>C90-C270</div><div><i style="background:var(--mag)"></i>G3</div></div>
            </div>
          </div>
          <div class="f-pblock">${cono}
            <div>
              <div class="f-ctitle">Distribución de iluminancia a distancia (LUX)</div>
              <div class="f-note"><b>Nota:</b> Las curvas indican el área iluminada y la iluminancia promedio según la distancia de la luminaria.</div>
            </div>
          </div>
          <div>
            <div class="f-h">Información Complementaria</div>
            <div class="f-buttons">
              <a class="f-btn" ${a.ldt_url ? `href="${esc(a.ldt_url)}" download` : ""}><img src="${ICON}ldt.png"><div class="lb">Archivo LDT</div></a>
              <a class="f-btn" ${a.cad_url ? `href="${esc(a.cad_url)}" download` : ""}><img src="${ICON}cad.png"><div class="lb">Archivo CAD</div></a>
            </div>
          </div>
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
    const opts = DOCS.map((d, i) => `<option value="${i}">${esc(d.ag)}${d.fichas.length > 1 ? " · " + d.fichas.length + " hojas" : ""}</option>`).join("");
    page.innerHTML = `
      <div class="fichas-bar">
        <div class="fb-field">
          <label>Ficha / Línea</label>
          <select id="fichaSel">${opts}</select>
        </div>
        <div class="fb-field">
          <label>Buscar</label>
          <input id="fichaSearch" type="search" placeholder="Nombre o línea…">
        </div>
        <button class="fb-btn" id="fichaPdf">Descargar PDF</button>
        <div class="fichas-note" id="fichaNote"></div>
      </div>
      <div id="ficha-stage"></div>`;

    const sel = document.getElementById("fichaSel");
    const stage = document.getElementById("ficha-stage");
    const note = document.getElementById("fichaNote");
    const draw = i => {
      const d = DOCS[i]; if (!d) return;
      sel.value = i;
      stage.innerHTML = d.fichas.map(fichaHTML).join("");
      note.innerHTML = d.fichas.length > 1
        ? `Documento <b>${esc(d.ag)}</b> — ${d.fichas.length} hojas. "Descargar PDF" las baja todas en un archivo.`
        : `1 ficha.`;
    };
    sel.addEventListener("change", e => draw(+e.target.value));
    document.getElementById("fichaSearch").addEventListener("input", e => {
      const q = e.target.value.toLowerCase();
      for (const o of sel.options) o.hidden = q && !o.textContent.toLowerCase().includes(q);
    });
    document.getElementById("fichaPdf").addEventListener("click", () => {
      document.body.classList.add("fichas-printing");
      window.print();
      setTimeout(() => document.body.classList.remove("fichas-printing"), 500);
    });
    draw(0);
    mounted = true;
  }

  // Expuesto para goToPage('fichas')
  window.renderFichas = function () { if (!mounted) mount(); };
})();
