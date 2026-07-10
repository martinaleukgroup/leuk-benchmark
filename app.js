/* Benchmark Leuk — app estática (vanilla JS). Dos páginas: Comparaciones y Resultados.
   Matching en vivo (3 señales) generado por el pipeline. Autorización en localStorage. */
(function () {
  const DATA = window.BENCHMARK || { productos: [], meta: {} };
  const P = DATA.productos;
  const MARCAS = (DATA.meta && DATA.meta.competidores) || ["Vonderk", "Artelum", "World Leds Go"];
  const $ = (s, r = document) => r.querySelector(s);

  /* ===================== DESCUENTOS / PRECIO NETO (editable, localStorage) ===================== */
  const DEF_DISC = (DATA.meta && DATA.meta.descuentos) || {};
  const DISC_KEY = "benchmark_leuk_descuentos_v1";
  const CFG = (function () {
    const base = { comp: {}, leukPartner: 30, leukCliente: 15, leukTier: "partner" };
    MARCAS.forEach(m => base.comp[m] = DEF_DISC[m] != null ? DEF_DISC[m] : 0);
    try { const s = JSON.parse(localStorage.getItem(DISC_KEY)); if (s) { Object.assign(base, s); base.comp = Object.assign({}, base.comp, s.comp || {}); } } catch (e) { }
    return base;
  })();
  const saveCfg = () => localStorage.setItem(DISC_KEY, JSON.stringify(CFG));
  const descLeuk = () => Number(CFG.leukTier === "cliente" ? CFG.leukCliente : CFG.leukPartner) || 0;
  const descComp = m => Number(CFG.comp[m] != null ? CFG.comp[m] : 0) || 0;
  const netLeuk = l => l == null ? null : Math.round(l * (1 - descLeuk() / 100) * 100) / 100;
  const netComp = (l, m) => l == null ? null : Math.round(l * (1 - descComp(m) / 100) * 100) / 100;
  // compara precio NETO Leuk vs competidor (con la config de descuentos vigente)
  function cmp(leukList, compList, marca) {
    const ln = netLeuk(leukList), cn = netComp(compList, marca);
    if (ln == null || cn == null) return { has: false, texto: "Sin precio comp.", cls: "p-na", diff: null };
    const d = Math.round((cn - ln) / ln * 1000) / 10;
    return {
      has: true, diff: d, delta: Math.round(cn - ln), leukNet: ln, compNet: cn, leukList, compList,
      descLeuk: descLeuk(), descComp: descComp(marca),
      cls: d > 3 ? "p-cheap" : d < -3 ? "p-exp" : "p-sim",
      texto: d > 3 ? "Leuk más barato" : d < -3 ? "Leuk más caro" : "Precio similar",
    };
  }
  const el = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };
  const norm = s => (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  const VC = { "Equivalente": "b-eq", "Comparable parcial": "b-pa", "Posible": "b-pos", "No comparable": "b-no", "Sin datos": "b-sd", "Sugerido": "b-sug" };
  const badge = v => `<span class="badge ${VC[v] || "b-sd"}">${v || "Sin datos"}</span>`;
  // indicador de confianza: cuántas señales coinciden (≥2 = confiable, 1 = revisar)
  const confChip = m => {
    if (!m) return "";
    if (m.confianza === "alta") return `<span class="conf conf-alta" title="Coinciden ${m.n_senales} de 3 señales">${m.n_senales} señales ✓</span>`;
    if (m.confianza === "baja") return `<span class="conf conf-baja" title="Sólo 1 señal — revisar">1 señal · revisar</span>`;
    return "";
  };
  const short = n => ({ "Equivalente": "Equiv", "Comparable parcial": "Parcial", "No comparable": "No" }[n] || "—");
  const fmtUsd = n => n == null ? "—" : "US$ " + Math.round(n).toLocaleString("es-AR");
  // muestra precio NETO (grande) + lista con el descuento aplicado. marca==='LEUK' usa desc Leuk.
  const priceCell = (listPrice, marca) => {
    if (listPrice == null) return `<span class="res-price">s/precio</span>`;
    const isLeuk = marca === "LEUK";
    const n = isLeuk ? netLeuk(listPrice) : netComp(listPrice, marca);
    const desc = isLeuk ? descLeuk() : descComp(marca);
    return `<span class="res-price" title="Precio neto (con descuento)">${fmtUsd(n)}</span>${desc > 0 ? `<span class="res-plista">lista ${fmtUsd(listPrice)} · −${desc}%</span>` : ""}`;
  };
  const diffHtml = d => d == null ? "" : `<span class="diff ${d > 0 ? "pos" : "neg"}">${d > 0 ? "+" : ""}${d.toFixed(0)}%</span>`;
  // alerta de diferencia de precio muy grande (solo se usa en Resultados)
  const PRICE_HI = 120, PRICE_LO = -55;
  const priceAlert = d => (d != null && (d > PRICE_HI || d < PRICE_LO))
    ? `<span class="palert" title="Diferencia de precio muy grande (${d > 0 ? "+" : ""}${d.toFixed(0)}%) — puede ser de otra gama, revisar">⚠</span>` : "";
  function imgTag(src, cls) {
    if (!src) return `<div class="thumb ph ${cls || ""}">◎</div>`;
    return `<img class="thumb ${cls || ""}" src="${src}" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=&quot;thumb ph ${cls || ""}&quot;>◎</div>'">`;
  }
  const sigMini = m => {
    const s = [];
    if (m.tecnico) s.push(`<span class="sig" title="Ficha técnica">Téc <b>${short(m.tecnico.nivel)}</b></span>`);
    if (m.etiquetacion) s.push(`<span class="sig" title="Forma / estética">Etiq <b>${short(m.etiquetacion.nivel)}</b></span>`);
    if (m.visual) s.push(`<span class="sig" title="Similitud de imagen">Vis <b>${short(m.visual.nivel)}</b></span>`);
    return s.join("");
  };

  /* ===================== AUTORIZACIONES (localStorage) ===================== */
  const AUTH_KEY = "benchmark_leuk_autorizadas_v1";
  let AUTH = load();
  function load() { try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || {}; } catch (e) { return {}; } }
  function save() { localStorage.setItem(AUTH_KEY, JSON.stringify(AUTH)); updateNavCount(); }
  const keyOf = (sku, prop) => `${sku}|${prop.marca}|${prop.fslug}`;
  const isAuth = k => !!AUTH[k];
  function snapshot(p, prop) {
    return {
      key: keyOf(p.sku, prop), leukSku: p.sku, leukNombre: p.nombre, leukFamilia: p.familia,
      leukVertical: p.vertical, precioLeukUsd: p.precio_usd, leukImagen: p.imagen,
      marca: prop.marca, fslug: prop.fslug, equivNombre: prop.nombre, equivFamilia: prop.familia,
      equivImagen: prop.imagen, veredicto: prop.match.veredicto, diferencia_pct: prop.diferencia_pct,
      diferencia_lista: prop.diferencia_lista, posicion_precio: prop.posicion_precio,
      precioCompUsd: prop.precio && prop.precio.usd, precioCompNeto: prop.precio && prop.precio.neto,
      descComp: prop.precio && prop.precio.desc, precioLeukNeto: p.precio_neto, descLeuk: p.descuento,
      match: prop.match, equivFicha: prop.ficha, equivEtiquetas: prop.etiquetas,
      manual: !!prop.manual, ts: Date.now(),
    };
  }
  function toggleAuth(p, prop) {
    const k = keyOf(p.sku, prop);
    if (AUTH[k]) delete AUTH[k]; else AUTH[k] = snapshot(p, prop);
    save();
  }
  function updateNavCount() {
    const n = Object.keys(AUTH).length;
    $("#navCount").textContent = n ? n : "";
  }
  const authBtn = (p, prop) => {
    const on = isAuth(keyOf(p.sku, prop));
    return `<button class="auth-btn ${on ? "on" : ""}" data-sku="${p.sku}" data-marca="${prop.marca}" data-fslug="${prop.fslug}">${on ? "✓ Autorizada" : "＋ Autorizar"}</button>`;
  };
  const findProp = (sku, marca, fslug) => {
    const p = P.find(x => x.sku === sku); if (!p) return null;
    return (p.propuestas || []).find(x => x.marca === marca && x.fslug === fslug)
      || Object.values(p.mejor_por_marca).find(x => x && x.marca === marca && x.fslug === fslug)
      || suggList(sku).find(x => x.marca === marca && x.fslug === fslug) || null;
  };
  // click delegado en botones de autorizar
  document.addEventListener("click", ev => {
    const b = ev.target.closest(".auth-btn"); if (!b) return;
    ev.stopPropagation();
    const p = P.find(x => x.sku === b.dataset.sku);
    const prop = findProp(b.dataset.sku, b.dataset.marca, b.dataset.fslug);
    if (!p || !prop) return;
    toggleAuth(p, prop);
    const on = isAuth(keyOf(p.sku, prop));
    b.classList.toggle("on", on); b.textContent = on ? "✓ Autorizada" : "＋ Autorizar";
    if (!$("#page-resultados").classList.contains("hidden")) renderTabla();
  });

  /* ===================== SUGERENCIAS MANUALES (localStorage) ===================== */
  const CATALOGO = DATA.competencia || [];
  const SUGG_KEY = "benchmark_leuk_sugeridos_v1";
  let SUGG = (function () { try { return JSON.parse(localStorage.getItem(SUGG_KEY)) || {}; } catch (e) { return {}; } })();
  const saveSugg = () => localStorage.setItem(SUGG_KEY, JSON.stringify(SUGG));

  // etiquetación calculada en el browser (mismo criterio que el pipeline)
  const ETQ_PESOS = { tipo_forma: 4, tipo_montaje: 3, proporcion: 2, estilo: 1, color: 1 };
  function matchEtiqJS(lt, ce) {
    if (!lt || !ce) return null;
    let total = 0, num = 0; const coinciden = [], difieren = [];
    for (const campo in ETQ_PESOS) {
      const lv = (lt[campo] || "").toString().toLowerCase(), cv = (ce[campo] || "").toString().toLowerCase();
      if (!lv || !cv || lv === "no_determinable" || cv === "no_determinable") continue;
      total += ETQ_PESOS[campo];
      if (lv === cv) { num += ETQ_PESOS[campo]; coinciden.push(campo); } else difieren.push(`${campo}: ${lv}≠${cv}`);
    }
    if (!total) return null;
    const score = num / total;
    const formaOk = lt.tipo_forma && (lt.tipo_forma || "").toLowerCase() === (ce.tipo_forma || "").toLowerCase();
    const nivel = (score >= 0.8 && formaOk) ? "Equivalente" : ((formaOk || score >= 0.5) ? "Comparable parcial" : "No comparable");
    return { nivel, score: Math.round(score * 1000) / 1000, coinciden, difieren };
  }
  function suggProp(comp, product) {
    const etq = matchEtiqJS(product.etiquetas, comp.etiquetas);
    const lNet = product.precio_neto != null ? product.precio_neto : product.precio_usd;
    const cNet = comp.precio_neto != null ? comp.precio_neto : comp.precio_usd;
    let dif = null, pos = null;
    if (lNet != null && cNet != null) {
      dif = Math.round((cNet - lNet) / lNet * 1000) / 10;
      pos = dif > 3 ? "Leuk más barato" : dif < -3 ? "Leuk más caro" : "Precio similar";
    }
    return {
      marca: comp.marca, fslug: comp.fslug, familia: comp.familia, nombre: comp.nombre,
      imagen: comp.imagen, ficha: comp.ficha, etiquetas: comp.etiquetas,
      precio: { usd: comp.precio_usd, neto: comp.precio_neto, desc: comp.desc },
      diferencia_pct: dif, posicion_precio: pos, manual: true,
      match: { tecnico: null, etiquetacion: etq, visual: null, veredicto: "Sugerido" },
    };
  }
  const suggList = sku => (SUGG[sku] || []).map(c => suggProp(c, P.find(p => p.sku === sku)));
  function addSugg(sku, comp) {
    SUGG[sku] = SUGG[sku] || [];
    if (!SUGG[sku].some(c => c.marca === comp.marca && c.fslug === comp.fslug))
      SUGG[sku].push({ marca: comp.marca, fslug: comp.fslug, familia: comp.familia, nombre: comp.nombre, imagen: comp.imagen, ficha: comp.ficha, etiquetas: comp.etiquetas, precio_usd: comp.precio_usd });
    saveSugg();
  }
  function rmSugg(sku, marca, fslug) {
    SUGG[sku] = (SUGG[sku] || []).filter(c => !(c.marca === marca && c.fslug === fslug)); saveSugg();
  }

  /* ===================== RECOMENDACIONES (por productos Leuk parecidos) ===================== */
  function recomendaciones(product) {
    const sim = new Set(product.similares || []);
    if (!sim.size) return [];
    const recs = {};
    Object.values(AUTH).forEach(a => {
      if (sim.has(a.leukSku) && a.leukSku !== product.sku) {
        const k = a.marca + "|" + a.fslug;
        if (!recs[k]) {
          const comp = CATALOGO.find(c => c.marca === a.marca && c.fslug === a.fslug);
          recs[k] = { comp: comp || { marca: a.marca, fslug: a.fslug, nombre: a.equivNombre, familia: a.equivFamilia, imagen: a.equivImagen, ficha: {}, etiquetas: null, precio_usd: a.precioCompUsd }, desde: [], n: 0 };
        }
        recs[k].n++; recs[k].desde.push(a.leukSku);
      }
    });
    // no recomendar lo que ya está autorizado para este producto
    return Object.values(recs).filter(r => !isAuth(product.sku + "|" + r.comp.marca + "|" + r.comp.fslug))
      .sort((a, b) => b.n - a.n);
  }

  /* ===================== PÁGINA COMPARACIONES (catálogo + comparación) ===================== */
  const searchEl = $("#search"), catalogo = $("#catalogo"), comp = $("#comparacion"),
    catCount = $("#catCount"), catFilters = $("#catFilters");
  const catState = {};
  const uniqP = f => [...new Set(P.map(f).filter(Boolean))].sort();
  function buildCatFilters() {
    const defs = [
      { k: "vertical", label: "Vertical", opts: uniqP(p => p.vertical) },
      { k: "familia", label: "Familia", opts: uniqP(p => p.familia) },
      { k: "match", label: "Equivalente", opts: ["Con equivalente", "Sin equivalente"] },
    ];
    catFilters.innerHTML = defs.map(f => `<select data-k="${f.k}"><option value="">${f.label}: todos</option>${f.opts.map(o => `<option>${o}</option>`).join("")}</select>`).join("");
    catFilters.querySelectorAll("select").forEach(s => s.onchange = () => { catState[s.dataset.k] = s.value; renderCatalogo(); });
  }
  function catFiltered() {
    const q = norm(searchEl.value);
    return P.filter(p => {
      if (q && !norm(p.sku).includes(q) && !norm(p.nombre).includes(q)) return false;
      if (catState.vertical && p.vertical !== catState.vertical) return false;
      if (catState.familia && p.familia !== catState.familia) return false;
      const nM = MARCAS.filter(m => p.mejor_por_marca[m]).length;
      if (catState.match === "Con equivalente" && !nM) return false;
      if (catState.match === "Sin equivalente" && nM) return false;
      return true;
    });
  }
  function renderCatalogo() {
    comp.innerHTML = ""; comp.classList.add("hidden");
    catalogo.classList.remove("hidden"); catFilters.classList.remove("hidden"); catCount.classList.remove("hidden");
    const f = catFiltered();
    catCount.textContent = `${f.length} producto${f.length === 1 ? "" : "s"}`;
    catalogo.innerHTML = "";
    if (!f.length) { catalogo.innerHTML = `<div class="empty"><div class="big">∅</div>Sin resultados.</div>`; return; }
    const frag = document.createDocumentFragment();
    f.forEach(p => {
      const nM = MARCAS.filter(m => p.mejor_por_marca[m]).length;
      const card = el("div", "cat-card");
      card.innerHTML = `<div class="cat-img">${imgTag(p.imagen, "cat")}</div>
        <div class="cat-body"><div class="leuk-sku">LEUK ${p.sku}</div>
          <div class="cat-name">${p.nombre || "—"}</div>
          <div class="leuk-fam">${[p.vertical, p.familia].filter(Boolean).join(" · ")}</div>
          <div class="cat-foot">${fmtUsd(p.precio_usd)} <span class="cat-badge ${nM ? "on" : ""}">${nM ? nM + " marca" + (nM > 1 ? "s" : "") + " ✓" : "sin equiv."}</span></div></div>`;
      card.onclick = () => selectProduct(p);
      frag.appendChild(card);
    });
    catalogo.appendChild(frag);
  }
  let _selected = null;
  function selectProduct(p) {
    _selected = p;
    catalogo.classList.add("hidden"); catFilters.classList.add("hidden"); catCount.classList.add("hidden");
    comp.classList.remove("hidden"); comp.innerHTML = "";
    const back = el("button", "btn-back", "← Volver al catálogo");
    back.onclick = () => { renderCatalogo(); window.scrollTo({ top: 0 }); };
    comp.appendChild(back);
    comp.appendChild(comparacionView(p));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function rankRow(p, prop, extra) {
    const c = cmp(p && p.precio_usd, prop.precio && prop.precio.usd, prop.marca);
    const r = el("div", "rank-row");
    r.innerHTML = `${imgTag(prop.imagen)}
      <div class="equiv-meta"><div class="equiv-marca">${prop.marca}${prop.manual ? ' · <span class="tag-sug">sugerido</span>' : ""}</div>
        <div class="equiv-name">${prop.nombre || prop.familia}</div>
        <div class="signals">${sigMini(prop.match)} ${confChip(prop.match)}</div></div>
      <div class="equiv-right">${c.has ? diffHtml(c.diff) : ""}<br>${badge(prop.match.veredicto)}<br>${authBtn(p, prop)}${extra || ""}</div>`;
    r.onclick = ev => { if (!ev.target.closest(".auth-btn") && !ev.target.closest(".rm-sug")) openDetail(p, prop); };
    return r;
  }
  function comparacionView(p) {
    const wrap = el("div", "comp-wrap");
    wrap.appendChild(el("div", "comp-head", `${imgTag(p.imagen, "big")}
      <div class="comp-head-meta"><div class="leuk-sku">LEUK ${p.sku}</div>
        <h2>${p.nombre || ""}</h2>
        <div class="leuk-fam">${[p.vertical, p.familia, p.subfamilia].filter(Boolean).join(" · ")}</div>
        <div class="comp-price">${fmtUsd(p.precio_usd)}</div></div>`));

    // --- Recomendado por tu historial (productos Leuk parecidos) ---
    const recs = recomendaciones(p);
    if (recs.length) {
      wrap.appendChild(el("h3", "sec-title", "★ Recomendado por tu historial"));
      const rl = el("div", "rank-list reco");
      recs.slice(0, 6).forEach(rec => {
        const prop = suggProp(rec.comp, p);
        const desde = [...new Set(rec.desde)].map(s => (P.find(x => x.sku === s) || {}).nombre || s).slice(0, 3).join(", ");
        const row = rankRow(p, prop, "");
        const note = el("div", "reco-note", `Emparejaste ${rec.n} producto(s) parecido(s) (${desde}) con esto`);
        row.querySelector(".equiv-meta").appendChild(note);
        rl.appendChild(row);
      });
      wrap.appendChild(rl);
    }

    wrap.appendChild(el("h3", "sec-title", "Mejor equivalente por marca"));
    const grid = el("div", "marca-grid");
    MARCAS.forEach(m => {
      const prop = p.mejor_por_marca[m];
      const card = el("div", "marca-card" + (prop ? "" : " vacia"));
      if (prop) {
        const c = cmp(p.precio_usd, prop.precio && prop.precio.usd, prop.marca);
        card.innerHTML = `<div class="marca-name">${m}</div>${imgTag(prop.imagen)}
          <div class="marca-prod">${prop.nombre || prop.familia}</div>
          <div>${badge(prop.match.veredicto)} ${confChip(prop.match)}</div>
          <div class="signals">${sigMini(prop.match)}</div>
          <div class="marca-price">${c.has ? diffHtml(c.diff) + ' <span class="leuk-fam">' + c.texto + "</span>" : '<span class="leuk-fam">sin precio comp.</span>'}</div>
          ${authBtn(p, prop)}`;
        card.onclick = ev => { if (!ev.target.closest(".auth-btn")) openDetail(p, prop); };
      } else {
        card.innerHTML = `<div class="marca-name">${m}</div><div class="empty-mini">Sin equivalente claro</div>`;
      }
      grid.appendChild(card);
    });
    wrap.appendChild(grid);

    // --- Sugeridos a mano + botón para sugerir ---
    const sugeridos = suggList(p.sku);
    const secSug = el("div", "sug-sec");
    secSug.innerHTML = `<h3 class="sec-title" style="display:inline-block">Sugeridos a mano</h3>
      <button class="btn-ghost btn-sug" style="float:right">＋ Sugerir equivalente</button>`;
    wrap.appendChild(secSug);
    secSug.querySelector(".btn-sug").onclick = () => openSuggModal(p);
    const sl = el("div", "rank-list");
    if (!sugeridos.length) sl.innerHTML = `<div class="empty-mini" style="padding:12px">Todavía no sugeriste ninguno. Tocá “Sugerir equivalente” para buscar en todo el catálogo.</div>`;
    sugeridos.forEach(prop => {
      const row = rankRow(p, prop, ` <button class="rm-sug" title="Quitar sugerencia">✕</button>`);
      row.querySelector(".rm-sug").onclick = () => { rmSugg(p.sku, prop.marca, prop.fslug); selectProduct(p); };
      sl.appendChild(row);
    });
    wrap.appendChild(sl);

    if (p.propuestas.length) {
      const det = el("details", "ranking");
      det.innerHTML = `<summary>Ranking de equivalentes confiables — ${p.propuestas.length} (coinciden ≥2 señales)</summary>`;
      const list = el("div", "rank-list");
      p.propuestas.forEach(prop => list.appendChild(rankRow(p, prop, "")));
      det.appendChild(list); wrap.appendChild(det);
    }
    // Posibles: 1 sola señal → baja confianza, a revisar (separado, no mezclado)
    const posibles = p.posibles || [];
    if (posibles.length) {
      const det = el("details", "ranking posibles");
      det.innerHTML = `<summary>⚠ Posibles — a revisar · ${posibles.length} <span class="leuk-fam">(1 sola señal; puede traer algo poco parecido)</span></summary>`;
      const list = el("div", "rank-list");
      posibles.forEach(prop => list.appendChild(rankRow(p, prop, "")));
      det.appendChild(list); wrap.appendChild(det);
    }
    return wrap;
  }

  /* ===================== MODAL: sugerir equivalente (buscar en todo el catálogo) ===================== */
  function openSuggModal(p) {
    const ov = el("div", "detail"); ov.id = "suggModal";
    ov.innerHTML = `<div class="detail-inner sug-modal">
      <button class="detail-close" id="suggClose">✕</button>
      <h2>Sugerir equivalente para <span class="leuk-fam">LEUK ${p.sku}</span> ${p.nombre || ""}</h2>
      <input id="suggSearch" type="search" placeholder="Buscá en la competencia por nombre o marca…" autocomplete="off">
      <div id="suggResults" class="sug-results"></div></div>`;
    document.body.appendChild(ov);
    const results = ov.querySelector("#suggResults"), inp = ov.querySelector("#suggSearch");
    const close = () => ov.remove();
    ov.querySelector("#suggClose").onclick = close;
    ov.addEventListener("click", ev => { if (ev.target === ov) close(); });
    const render = q => {
      const query = norm(q);
      results.innerHTML = "";
      if (query.length < 2) { results.innerHTML = `<div class="empty-mini" style="padding:16px">Escribí al menos 2 letras.</div>`; return; }
      const hits = CATALOGO.filter(c => norm(c.nombre).includes(query) || norm(c.marca).includes(query) || norm(c.familia).includes(query)).slice(0, 40);
      if (!hits.length) { results.innerHTML = `<div class="empty-mini" style="padding:16px">Sin resultados.</div>`; return; }
      hits.forEach(c => {
        const ya = (SUGG[p.sku] || []).some(s => s.marca === c.marca && s.fslug === c.fslug);
        const row = el("div", "srow");
        row.innerHTML = `${imgTag(c.imagen)}
          <div class="srow-meta"><div class="equiv-marca">${c.marca}</div>
            <div class="srow-name">${c.nombre || c.familia}</div>
            <div class="leuk-fam">${c.familia || ""}</div></div>
          <button class="auth-btn ${ya ? "on" : ""}" ${ya ? "disabled" : ""}>${ya ? "✓ Agregado" : "＋ Agregar"}</button>`;
        row.querySelector("button").onclick = ev => { ev.stopPropagation(); addSugg(p.sku, c); close(); selectProduct(p); };
        results.appendChild(row);
      });
    };
    inp.addEventListener("input", () => render(inp.value));
    render(""); inp.focus();
  }

  /* ===================== PÁGINA RESULTADOS (autorizadas) ===================== */
  const uniq = (arr, f) => [...new Set(arr.map(f).filter(Boolean))].sort();
  const state = { orden: "dif" };
  // info de precio de una comparación autorizada
  // comparación NETA en vivo de una autorización (usa la config de descuentos vigente)
  const posInfo = a => cmp(a.precioLeukUsd, a.precioCompUsd, a.marca);
  const POS_LABEL = { barato: "Leuk más barato", caro: "Leuk más caro", similar: "Precio similar", sin: "Sin precio comp." };
  function buildFilters() {
    const box = $("#filters"); box.innerHTML = "";
    const defs = [
      { key: "marca", label: "Competidor", opts: MARCAS },
      { key: "posicion", label: "Posición de precio", opts: ["Leuk más barato", "Leuk más caro", "Precio similar", "Sin precio comp."] },
      { key: "nivel", label: "Nivel", opts: ["Equivalente", "Comparable parcial"] },
      { key: "vertical", label: "Vertical", opts: uniq(P, p => p.vertical) },
    ];
    defs.forEach(f => {
      const w = el("div");
      w.innerHTML = `<label>${f.label}</label><select data-k="${f.key}"><option value="">Todos</option>${f.opts.map(o => `<option>${o}</option>`).join("")}</select>`;
      box.appendChild(w);
    });
    const ord = el("div");
    ord.innerHTML = `<label>Ordenar por</label><select data-k="orden">
      <option value="dif">Mayor diferencia de precio</option>
      <option value="caro">Leuk más caro primero</option>
      <option value="barato">Leuk más barato primero</option>
      <option value="reciente">Más recientes</option></select>`;
    box.appendChild(ord);
    const w = el("div"); w.innerHTML = `<label>Buscar</label><input data-k="q" placeholder="SKU o nombre">`;
    box.appendChild(w);
    box.querySelectorAll("select,input").forEach(x => { if (x.dataset.k === "orden") x.value = state.orden; x.oninput = () => { state[x.dataset.k] = x.value; renderTabla(); }; });
  }
  const vertOf = sku => { const p = P.find(x => x.sku === sku); return p ? p.vertical : null; };
  function authList() {
    let arr = Object.values(AUTH).filter(a => {
      if (state.marca && a.marca !== state.marca) return false;
      if (state.nivel && a.veredicto !== state.nivel) return false;
      if (state.vertical && vertOf(a.leukSku) !== state.vertical) return false;
      if (state.posicion) { const pi = posInfo(a); if ((state.posicion === "Sin precio comp." ? "Sin precio comp." : pi.texto) !== state.posicion) return false; }
      if (state.q) { const q = norm(state.q); if (!norm(a.leukSku).includes(q) && !norm(a.leukNombre).includes(q) && !norm(a.equivNombre).includes(q)) return false; }
      return true;
    });
    const dOf = a => { const pi = posInfo(a); return pi.has ? pi.diff : null; };
    const sorters = {
      reciente: (x, y) => y.ts - x.ts,
      dif: (x, y) => (Math.abs(dOf(y) ?? -1) - Math.abs(dOf(x) ?? -1)),
      caro: (x, y) => (dOf(x) ?? 1e9) - (dOf(y) ?? 1e9),      // más caro (dif negativa) primero
      barato: (x, y) => (dOf(y) ?? -1e9) - (dOf(x) ?? -1e9),  // más barato (dif positiva) primero
    };
    return arr.sort(sorters[state.orden] || sorters.dif);
  }
  function resumenPrecios(f) {
    const con = f.map(posInfo).filter(pi => pi.has);
    const n = { barato: 0, caro: 0, similar: 0 };
    con.forEach(pi => { n[pi.cls === "p-cheap" ? "barato" : pi.cls === "p-exp" ? "caro" : "similar"]++; });
    const prom = con.length ? Math.round(con.reduce((s, pi) => s + pi.diff, 0) / con.length) : null;
    const sinPrecio = f.length - con.length;
    return `<div class="res-resumen">
      <div class="rz"><span class="rz-n p-cheap">${n.barato}</span> Leuk más barato</div>
      <div class="rz"><span class="rz-n p-exp">${n.caro}</span> Leuk más caro</div>
      <div class="rz"><span class="rz-n p-sim">${n.similar}</span> precio similar</div>
      ${sinPrecio ? `<div class="rz"><span class="rz-n p-na">${sinPrecio}</span> sin precio comp.</div>` : ""}
      ${prom != null ? `<div class="rz rz-prom">Dif. promedio <b class="${prom > 0 ? "diff pos" : "diff neg"}">${prom > 0 ? "+" : ""}${prom}%</b></div>` : ""}
    </div>`;
  }
  function renderTabla() {
    const f = authList();
    $("#countLabel").textContent = `${f.length} comparación(es) autorizada(s)`;
    const cont = $("#tabla"); cont.innerHTML = "";
    if (!Object.keys(AUTH).length) {
      cont.innerHTML = `<div class="empty"><div class="big">✓</div>Todavía no autorizaste ninguna comparación.<br>Andá a <b>Comparaciones</b>, buscá un producto y tocá <b>＋ Autorizar</b> en los equivalentes que sirvan.</div>`;
      return;
    }
    cont.insertAdjacentHTML("beforeend", resumenPrecios(f));
    const grid = el("div", "res-cards");
    f.forEach(a => {
      const p = P.find(x => x.sku === a.leukSku) || { sku: a.leukSku, nombre: a.leukNombre, vertical: a.leukVertical, familia: a.leukFamilia, precio_usd: a.precioLeukUsd, imagen: a.leukImagen, ficha: {} };
      const pi = posInfo(a);
      const priceBlock = pi.has
        ? `<div class="res-posicion ${pi.cls}"><span class="rp-text">${pi.texto}</span><span class="rp-dif">${pi.diff > 0 ? "+" : ""}${pi.diff}% · Δ US$ ${Math.abs(pi.delta).toLocaleString("es-AR")}</span>${priceAlert(pi.diff)}</div>`
        : `<div class="res-posicion p-na"><span class="rp-text">Sin precio comp.</span></div>`;
      const card = el("div", "res-card");
      card.innerHTML = `
        <div class="res-head">
          <div class="res-pair">
            <div class="res-side">${imgTag(p.imagen || a.leukImagen, "sm")}<div class="res-txt"><span class="res-lbl">LEUK ${a.leukSku}</span><span class="res-nom">${a.leukNombre || ""}</span>${priceCell(a.precioLeukUsd, "LEUK")}</div></div>
            <span class="res-arrow">vs</span>
            <div class="res-side">${imgTag(a.equivImagen, "sm")}<div class="res-txt"><span class="res-lbl">${a.marca}${a.manual ? ' · <span class="tag-sug">sugerido</span>' : ""}</span><span class="res-nom">${a.equivNombre || a.equivFamilia}</span>${priceCell(a.precioCompUsd, a.marca)}</div></div>
          </div>
          <div class="res-meta">
            ${priceBlock}
            <div class="res-btns">${badge(a.veredicto)}<button class="res-exp" title="Ver detalle">▾</button><button class="rm" title="Quitar">✕</button></div>
          </div>
        </div>
        <div class="res-body hidden"></div>`;
      const body = card.querySelector(".res-body");
      const exp = card.querySelector(".res-exp");
      let loaded = false;
      const toggle = () => {
        const open = body.classList.toggle("hidden");
        exp.classList.toggle("abierto", !open);
        if (!loaded && !body.classList.contains("hidden")) { body.innerHTML = detailBody(p, findProp(a.leukSku, a.marca, a.fslug) || a, { header: false }); loaded = true; }
      };
      exp.onclick = toggle;
      card.querySelector(".res-head").onclick = ev => { if (!ev.target.closest(".rm") && !ev.target.closest(".res-exp")) toggle(); };
      card.querySelector(".rm").onclick = () => { delete AUTH[a.key]; save(); renderTabla(); };
      grid.appendChild(card);
    });
    cont.appendChild(grid);
  }
  const csv = s => `"${(s || "").toString().replace(/"/g, '""')}"`;
  function exportCSV() {
    const f = authList();
    const H = ["SKU_Leuk", "Producto_Leuk", "Precio_Leuk_lista", "Precio_Leuk_neto", "Competidor", "Equivalente", "Nivel", "Desc_comp%", "Precio_comp_lista", "Precio_comp_neto", "Dif_neto%", "Dif_lista%"];
    const lines = [H.join(",")];
    f.forEach(a => lines.push([a.leukSku, csv(a.leukNombre), a.precioLeukUsd, a.precioLeukNeto, a.marca, csv(a.equivNombre), a.veredicto, a.descComp != null ? a.descComp : "", a.precioCompUsd != null ? a.precioCompUsd : "", a.precioCompNeto != null ? a.precioCompNeto : "", a.diferencia_pct != null ? a.diferencia_pct : "", a.diferencia_lista != null ? a.diferencia_lista : ""].join(",")));
    dl(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }), "benchmark_leuk_autorizadas.csv");
  }
  function exportJson() {
    dl(new Blob([JSON.stringify(AUTH, null, 1)], { type: "application/json" }), "benchmark_leuk_autorizaciones.json");
  }
  function importJson(file) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const obj = JSON.parse(rd.result); let n = 0;
        Object.entries(obj).forEach(([k, v]) => { if (v && v.leukSku) { AUTH[k] = v; n++; } });
        save(); renderTabla();
        alert(`Importadas ${n} autorización(es). Total: ${Object.keys(AUTH).length}.`);
      } catch (e) { alert("Archivo inválido."); }
    };
    rd.readAsText(file);
  }
  function dl(blob, name) { const a = el("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); }

  /* ===================== DETALLE (reusable: modal + desplegado) ===================== */
  const _rows = o => Object.entries(o || {}).map(([k, v]) => `<div class="ficha-row"><span class="k">${k}</span><span>${v}</span></div>`).join("") || `<div class="ficha-row"><span class="k">Sin ficha</span></div>`;
  const _chips = (a, c) => (a || []).map(x => `<span class="chip ${c}">${x}</span>`).join("");
  const _sig = (name, s, extra) => `<div class="sig-line"><span class="name">${name}</span>${badge(s ? s.nivel : "Sin datos")}${extra || ""}</div>`;
  function detailBody(p, e, opts) {
    opts = opts || {};
    const m = e.match || {};
    const eNombre = e.nombre || e.equivNombre || e.familia || e.equivFamilia;
    const eImg = e.imagen || e.equivImagen, eFicha = e.ficha || e.equivFicha;
    const cLista = (e.precio && e.precio.usd != null) ? e.precio.usd : e.precioCompUsd;
    const cc = cmp(p.precio_usd, cLista, e.marca);
    const precioRow = (listPrice, marca) => {
      if (listPrice == null) return `<div class="ficha-row"><span class="k">Precio neto</span><span>—</span></div>`;
      const isLeuk = marca === "LEUK";
      const net = isLeuk ? netLeuk(listPrice) : netComp(listPrice, marca);
      const desc = isLeuk ? descLeuk() : descComp(marca);
      const extra = desc > 0 ? ` <span class="leuk-fam">(lista ${fmtUsd(listPrice)} · −${desc}%)</span>` : "";
      return `<div class="ficha-row"><span class="k">Precio neto</span><span>${fmtUsd(net)}${extra}</span></div>`;
    };
    const señales = (m.tecnico || m.etiquetacion || m.visual) ? `<div class="signal-box"><h3>Nivel de match — 3 señales</h3>
        ${_sig("🔧 Técnica", m.tecnico, m.tecnico ? `<span class="leuk-fam">score ${m.tecnico.score}</span>` : "")}
        ${m.tecnico ? `<div class="chips">${_chips(m.tecnico.coinciden, "ok")}${_chips(m.tecnico.difieren, "no")}</div>` : ""}
        ${_sig("🏷️ Etiquetación", m.etiquetacion, m.etiquetacion ? `<span class="leuk-fam">${(m.etiquetacion.score * 100).toFixed(0)}%</span>` : "")}
        ${m.etiquetacion ? `<div class="chips">${_chips(m.etiquetacion.coinciden, "ok")}${_chips(m.etiquetacion.difieren, "no")}</div>` : ""}
        ${_sig("👁️ Visual", m.visual, m.visual ? `<span class="leuk-fam">sim ${m.visual.similitud}</span>` : "")}</div>` : "";
    return `${opts.header !== false ? `<div class="leuk-sku">LEUK ${p.sku} · ${p.vertical || ""} ${p.familia || ""}</div>
      <h2>${p.nombre || ""} <span class="vs-lbl">vs</span> ${e.marca} · ${eNombre}</h2>
      <div>${badge(m.veredicto || e.veredicto)} &nbsp; ${cc.has ? diffHtml(cc.diff) + ' <span class="leuk-fam">' + cc.texto + " (neto)</span>" : '<span class="leuk-fam">sin precio comp.</span>'}</div>` : ""}
      ${(p && e.fslug) ? `<div style="margin:10px 0">${authBtn(p, e)}</div>` : ""}
      ${señales}
      <div class="vs">
        <div class="col"><div class="equiv-marca">LEUK ${p.sku}</div>
          ${p.imagen ? `<img src="${p.imagen}" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ""}
          ${precioRow(p.precio_usd, "LEUK")}${_rows(p.ficha)}</div>
        <div class="col"><div class="equiv-marca">${e.marca} · ${eNombre}</div>
          ${eImg ? `<img src="${eImg}" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ""}
          ${precioRow(cLista, e.marca)}${_rows(eFicha)}</div>
      </div>`;
  }
  function openDetail(p, e) {
    if (!e) return;
    $("#detailInner").innerHTML = `<button class="detail-close" onclick="document.getElementById('detail').classList.add('hidden')">✕</button>` + detailBody(p, e);
    $("#detail").classList.remove("hidden");
  }
  $("#detail").addEventListener("click", ev => { if (ev.target.id === "detail") ev.currentTarget.classList.add("hidden"); });

  /* ===================== PÁGINA DECISIONES (tablero sobre autorizadas) ===================== */
  const UMBRAL = 15; // % a partir del cual una diferencia de precio es "accionable"
  function argumento(a, pi) {
    const specs = (a.match && a.match.tecnico && a.match.tecnico.coinciden || []).slice(0, 2).join(" y ");
    const eq = a.veredicto === "Equivalente" ? "equivalente" : "comparable";
    return `LEUK ${a.leukNombre} ≈ ${a.marca} ${a.equivNombre}: ${eq}${specs ? " (coincide " + specs + ")" : ""}, y ${Math.abs(pi.diff)}% más económico en precio neto (US$ ${Math.round(pi.leukNet)} vs US$ ${Math.round(pi.compNet)}).`;
  }
  function oppRow(x, tipo) {
    const a = x.a, pi = x.pi;
    const r = el("div", "opp-row");
    r.innerHTML = `${imgTag(a.leukImagen, "sm")}
      <div class="opp-meta"><div class="res-nom">${a.leukNombre} <span class="leuk-fam">· ${a.leukFamilia || ""}</span></div>
        <div class="leuk-fam">vs ${a.marca} ${a.equivNombre} · ${badge(a.veredicto)}</div></div>
      <div class="opp-price"><span class="res-posicion ${pi.cls}" style="display:inline-flex"><span class="rp-text">${pi.diff > 0 ? "+" : ""}${pi.diff}%</span></span>
        <div class="leuk-fam">US$ ${Math.round(a.precioLeukUsd)} vs ${Math.round(a.precioCompUsd)}</div></div>`;
    r.onclick = () => { const p = P.find(z => z.sku === a.leukSku); openDetail(p, findProp(a.leukSku, a.marca, a.fslug) || a); };
    return r;
  }
  function renderDecisiones() {
    const dash = $("#dash"); dash.innerHTML = "";
    const A = Object.values(AUTH);
    if (!A.length) {
      dash.innerHTML = `<div class="empty"><div class="big">📊</div>Todavía no hay decisiones para mostrar.<br>Autorizá comparaciones (desde <b>Comparaciones</b>) y acá se arma el panorama de pricing.</div>`;
      return;
    }
    const withP = A.map(a => ({ a, pi: posInfo(a) })).filter(x => x.pi.has);

    // KPIs de la config activa (una sola cifra grande) + comparador de escenarios
    const kpiActivo = el("div", "kpis");
    const nB0 = withP.filter(x => x.pi.cls === "p-cheap").length, nC0 = withP.filter(x => x.pi.cls === "p-exp").length, nS0 = withP.filter(x => x.pi.cls === "p-sim").length;
    const prom0 = withP.length ? Math.round(withP.reduce((s, x) => s + x.pi.diff, 0) / withP.length) : null;
    kpiActivo.innerHTML = `
      <div class="kpi"><div class="kpi-n">${A.length}</div><div class="kpi-l">autorizadas</div></div>
      <div class="kpi"><div class="kpi-n p-cheap-t">${nB0}</div><div class="kpi-l">Leuk más barato</div></div>
      <div class="kpi"><div class="kpi-n p-exp-t">${nC0}</div><div class="kpi-l">Leuk más caro</div></div>
      <div class="kpi"><div class="kpi-n">${nS0}</div><div class="kpi-l">precio similar</div></div>
      <div class="kpi"><div class="kpi-n ${prom0 > 0 ? "p-cheap-t" : "p-exp-t"}">${prom0 != null ? (prom0 > 0 ? "+" : "") + prom0 + "%" : "—"}</div><div class="kpi-l">dif. promedio</div></div>`;
    dash.appendChild(kpiActivo);

    // Comparador de escenarios: Partner vs Cliente
    const kpisFor = leukDisc => {
      const ds = A.map(a => {
        if (a.precioLeukUsd == null || a.precioCompUsd == null) return null;
        const ln = a.precioLeukUsd * (1 - leukDisc / 100), cn = a.precioCompUsd * (1 - descComp(a.marca) / 100);
        return (cn - ln) / ln * 100;
      }).filter(x => x != null);
      const nB = ds.filter(d => d > 3).length, nC = ds.filter(d => d < -3).length;
      return { n: ds.length, nB, nC, nS: ds.length - nB - nC, prom: ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null };
    };
    const activo = CFG.leukTier === "cliente" ? "cliente" : "partner";
    const escs = [{ tier: "partner", label: "Partner", d: CFG.leukPartner }, { tier: "cliente", label: "Cliente", d: CFG.leukCliente }];
    const secEsc = el("div", "dash-sec");
    secEsc.innerHTML = `<h3>Escenario de precio Leuk — Partner vs Cliente</h3>
      <div class="fam-hint">Cómo cambia tu posición según con qué precio de Leuk compares (competencia con los descuentos actuales). Tocá una columna para usarla en el resto del tablero.</div>
      <div class="esc-grid">${escs.map(s => { const k = kpisFor(s.d); return `
        <div class="esc-col ${s.tier === activo ? "activa" : ""}" data-tier="${s.tier}">
          <div class="esc-h">${s.label} <span class="leuk-fam">−${s.d}%</span>${s.tier === activo ? '<span class="esc-badge">activo</span>' : ""}</div>
          <div class="esc-prom ${k.prom > 0 ? "p-cheap-t" : "p-exp-t"}">${k.prom != null ? (k.prom > 0 ? "+" : "") + k.prom + "%" : "—"}</div>
          <div class="esc-l">diferencia promedio</div>
          <div class="esc-mini"><b class="p-cheap-t">${k.nB}</b> más barato · <b class="p-exp-t">${k.nC}</b> más caro · ${k.nS} similar</div>
        </div>`; }).join("")}</div>`;
    secEsc.querySelectorAll(".esc-col").forEach(c => c.onclick = () => { CFG.leukTier = c.dataset.tier; saveCfg(); rerenderActive(); });
    dash.appendChild(secEsc);

    // Posicionamiento por familia
    const fam = {};
    withP.forEach(x => { const f = x.a.leukFamilia || "—"; (fam[f] = fam[f] || []).push(x.pi.diff); });
    const famRows = Object.entries(fam).map(([f, ds]) => ({ f, n: ds.length, prom: Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) })).sort((a, b) => a.prom - b.prom);
    const maxAbs = Math.max(30, ...famRows.map(r => Math.abs(r.prom)));
    const secFam = el("div", "dash-sec");
    secFam.innerHTML = `<h3>Posicionamiento por familia</h3><div class="fam-hint">Diferencia de precio promedio de Leuk vs. el equivalente autorizado. Verde = Leuk más barato · Rojo = más caro.</div>`;
    const famList = el("div", "fam-list");
    famRows.forEach(r => {
      const pct = Math.abs(r.prom) / maxAbs * 50;
      const row = el("div", "fam-row");
      row.innerHTML = `<div class="fam-name">${r.f} <span class="leuk-fam">(${r.n})</span></div>
        <div class="fam-bar"><div class="fam-zero"></div>
          <div class="fam-fill ${r.prom >= 0 ? "pos" : "neg"}" style="width:${pct}%;${r.prom >= 0 ? "left:50%" : "right:50%"}"></div></div>
        <div class="fam-val ${r.prom >= 0 ? "diff pos" : "diff neg"}">${r.prom > 0 ? "+" : ""}${r.prom}%</div>`;
      famList.appendChild(row);
    });
    secFam.appendChild(famList); dash.appendChild(secFam);

    // Oportunidades
    const subir = withP.filter(x => x.pi.diff >= UMBRAL).sort((a, b) => b.pi.diff - a.pi.diff);
    const bajar = withP.filter(x => x.pi.diff <= -UMBRAL).sort((a, b) => a.pi.diff - b.pi.diff);
    const grid = el("div", "opp-grid");
    const colS = el("div", "dash-sec");
    colS.innerHTML = `<h3>💰 Oportunidad de subir precio / margen <span class="leuk-fam">(${subir.length})</span></h3>
      <div class="fam-hint">Leuk ≥${UMBRAL}% más barato que un equivalente. Hay lugar para acercar precio y ganar margen.</div>`;
    const lS = el("div", "opp-list"); subir.slice(0, 30).forEach(x => lS.appendChild(oppRow(x, "subir")));
    if (!subir.length) lS.innerHTML = `<div class="empty-mini" style="padding:10px">Nada por ahora.</div>`;
    colS.appendChild(lS);
    const colB = el("div", "dash-sec");
    colB.innerHTML = `<h3>⚠ Revisar — estás caro <span class="leuk-fam">(${bajar.length})</span></h3>
      <div class="fam-hint">Leuk ≥${UMBRAL}% más caro que un equivalente. Riesgo de perder venta por precio.</div>`;
    const lB = el("div", "opp-list"); bajar.slice(0, 30).forEach(x => lB.appendChild(oppRow(x, "bajar")));
    if (!bajar.length) lB.innerHTML = `<div class="empty-mini" style="padding:10px">Nada por ahora.</div>`;
    colB.appendChild(lB);
    grid.appendChild(colS); grid.appendChild(colB); dash.appendChild(grid);

    // Argumentos de venta (Leuk gana)
    const gana = withP.filter(x => x.pi.diff >= 10).sort((a, b) => b.pi.diff - a.pi.diff);
    const secArg = el("div", "dash-sec");
    secArg.innerHTML = `<h3>🗣️ Argumentos de venta <span class="leuk-fam">(${gana.length})</span> <button class="btn-ghost" id="argExport" style="float:right">⬇ Exportar</button></h3>
      <div class="fam-hint">Casos donde Leuk equivale y es más barato. Listos para el equipo comercial.</div>`;
    const al = el("div", "arg-list");
    gana.slice(0, 40).forEach(x => { const d = el("div", "arg-item"); d.textContent = argumento(x.a, x.pi); al.appendChild(d); });
    if (!gana.length) al.innerHTML = `<div class="empty-mini" style="padding:10px">Autorizá equivalencias donde Leuk sea más barato y aparecen acá.</div>`;
    secArg.appendChild(al); dash.appendChild(secArg);
    const be = secArg.querySelector("#argExport");
    if (be) be.onclick = () => dl(new Blob(["﻿" + gana.map(x => argumento(x.a, x.pi)).join("\n")], { type: "text/plain;charset=utf-8" }), "argumentos_venta_leuk.txt");
  }

  /* ===================== DESCUENTOS (modal editable) ===================== */
  function updateDescBtn() {
    const b = $("#btnDesc"); if (b) b.textContent = `⚙ Leuk ${CFG.leukTier === "cliente" ? "Cliente" : "Partner"} −${descLeuk()}%`;
  }
  function rerenderActive() {
    updateNavCount(); updateDescBtn();
    if (!$("#page-resultados").classList.contains("hidden")) renderTabla();
    else if (!$("#page-decisiones").classList.contains("hidden")) renderDecisiones();
    else if (_selected) selectProduct(_selected);
  }
  function openDescuentos() {
    const ov = el("div", "detail"); ov.id = "descModal";
    const compRows = MARCAS.map(m => `<div class="desc-row"><span>${m}</span><span class="desc-inwrap"><input type="number" min="0" max="100" class="desc-in" data-comp="${m}" value="${descComp(m)}"> %</span></div>`).join("");
    ov.innerHTML = `<div class="detail-inner desc-modal">
      <button class="detail-close" id="descClose">✕</button>
      <h2>Descuentos · precio neto</h2>
      <div class="fam-hint">El neto se calcula sobre el precio de lista con estos descuentos. Cambialos para simular escenarios (ej. igualar el descuento de un competidor).</div>
      <h3>Leuk — ¿qué precio comparo?</h3>
      <div class="desc-leuk">
        <label class="desc-tier"><input type="radio" name="tier" value="partner" ${CFG.leukTier === "partner" ? "checked" : ""}> <b>Partner</b> <span class="desc-inwrap"><input type="number" min="0" max="100" class="desc-in" data-leuk="partner" value="${CFG.leukPartner}"> %</span></label>
        <label class="desc-tier"><input type="radio" name="tier" value="cliente" ${CFG.leukTier === "cliente" ? "checked" : ""}> <b>Cliente</b> <span class="desc-inwrap"><input type="number" min="0" max="100" class="desc-in" data-leuk="cliente" value="${CFG.leukCliente}"> %</span></label>
      </div>
      <h3>Competencia</h3><div class="desc-list">${compRows}</div>
      <div class="desc-actions"><button class="btn-ghost" id="descReset">Restaurar originales</button><button class="btn-primary" id="descSave">Guardar y aplicar</button></div>
    </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector("#descClose").onclick = close;
    ov.addEventListener("click", ev => { if (ev.target === ov) close(); });
    ov.querySelector("#descSave").onclick = () => {
      ov.querySelectorAll("[data-comp]").forEach(i => { CFG.comp[i.dataset.comp] = Number(i.value) || 0; });
      CFG.leukPartner = Number(ov.querySelector('[data-leuk="partner"]').value) || 0;
      CFG.leukCliente = Number(ov.querySelector('[data-leuk="cliente"]').value) || 0;
      CFG.leukTier = ov.querySelector("input[name=tier]:checked").value;
      saveCfg(); close(); rerenderActive();
    };
    ov.querySelector("#descReset").onclick = () => {
      MARCAS.forEach(m => CFG.comp[m] = DEF_DISC[m] != null ? DEF_DISC[m] : 0);
      CFG.leukPartner = 30; CFG.leukCliente = 15; CFG.leukTier = "partner";
      saveCfg(); close(); rerenderActive(); openDescuentos();
    };
  }

  /* ===================== NAV ===================== */
  $("#nav").addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    $("#nav").querySelectorAll("button").forEach(x => x.classList.toggle("active", x === b));
    const page = b.dataset.page;
    $("#page-comparaciones").classList.toggle("hidden", page !== "comparaciones");
    $("#page-resultados").classList.toggle("hidden", page !== "resultados");
    $("#page-decisiones").classList.toggle("hidden", page !== "decisiones");
    if (page === "resultados") { if (!$("#filters").children.length) buildFilters(); renderTabla(); }
    if (page === "decisiones") renderDecisiones();
  });

  searchEl.addEventListener("input", () => renderCatalogo());
  $("#exportBtn").addEventListener("click", exportCSV);
  $("#exportJsonBtn").addEventListener("click", exportJson);
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", e => { if (e.target.files[0]) importJson(e.target.files[0]); });
  $("#btnDesc").addEventListener("click", openDescuentos);
  buildCatFilters(); renderCatalogo(); updateNavCount(); updateDescBtn();
  const meta = DATA.meta || {};
  $("#metaLine").textContent = `${meta.n_productos_leuk || P.length} productos Leuk · ${meta.n_con_propuesta || 0} con propuesta · matching por 3 señales (técnica · etiquetación · visual) · generado ${(meta.generado || "").replace("T", " ")}`;
})();
