/* Benchmark Leuk — app estática (vanilla JS). Dos páginas: Comparaciones y Resultados.
   Matching en vivo (3 señales) generado por el pipeline. Autorización en localStorage. */
(function () {
  // Los datos ya NO vienen de un archivo público: se descargan de Supabase DESPUÉS del login
  // (bucket privado 'datos'). Al arranque están vacíos; se poblan en bootApp().
  let DATA = { productos: [], meta: {} };
  let P = DATA.productos;
  let MARCAS = ["Vonderk", "Artelum", "World Leds Go"];
  let ROL = "editor";   // rol del usuario para editar precios ('editor' | 'lector'); se resuelve tras login
  let NOMBRE = "";      // nombre real del usuario (de la tabla perfiles), para el saludo
  const $ = (s, r = document) => r.querySelector(s);

  /* ===================== DESCUENTOS / PRECIO NETO (editable, localStorage) ===================== */
  let DEF_DISC = {};
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
    // diferencia RELATIVA AL COMPETIDOR: + = Leuk más barato (cuánto ahorra el cliente vs el competidor)
    const d = Math.round((cn - ln) / cn * 1000) / 10;
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
  // Nivel de equivalencia como barras de señal.
  // OJO: las barras siguen al VEREDICTO, no a n_senales. No son lo mismo: el motor pondera
  // qué señal coincide y con qué score, así que hay "Equivalente" con 2 señales y
  // "Comparable parcial" con 3. n_senales queda como detalle en el tooltip.
  // Las comparaciones agregadas a mano no las evaluó el motor → sin barras.
  const EQ_N = { "Equivalente": 3, "Comparable parcial": 2, "Posible": 1, "No comparable": 0, "Sin datos": 0 };
  function eqSignal(a) {
    const m = a.match || {};
    const v = m.veredicto || a.veredicto || "Sin datos";
    if (a.manual || v === "Sugerido") return `<span class="eqb eq-b" title="Comparación agregada a mano: el motor no la evaluó">Sugerido</span>`;
    const n = EQ_N[v] != null ? EQ_N[v] : 0;
    const cls = n >= 3 ? "eq-a" : n === 2 ? "eq-m" : "eq-b";
    const bars = [1, 2, 3].map(i => `<s class="${i <= n ? "on" : ""}"></s>`).join("");
    const det = typeof m.n_senales === "number" ? ` · coinciden ${m.n_senales} de 3 señales (técnica · forma · imagen)` : "";
    return `<span class="eqb ${cls}" title="${v}${det}"><u>${bars}</u>${v}</span>`;
  }
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
  const PRICE_HI = 85, PRICE_LO = -150;   // relativo al competidor: Leuk >85% más barato o >150% más caro → posible otra gama
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

  /* ---- Sync remoto (Supabase): autorizaciones compartidas entre todos ---- */
  const SB = { url: "https://cswqoretlhppxkelysny.supabase.co", key: "sb_publishable_Rpbm5uyhUp8aTvoCnHylyA_B0wq8sRs", table: "autorizaciones" };
  const sbOn = () => /^https?:\/\//.test(SB.url) && SB.key.length > 20;
  // Va con el JWT del usuario logueado (así la base sabe QUIÉN opera y puede aplicar
  // los permisos por rol); sin sesión cae a la clave pública.
  const sbHead = () => (typeof AUTHSES !== "undefined" && AUTHSES.logged())
    ? AUTHSES.head()
    : ({ apikey: SB.key, Authorization: `Bearer ${SB.key}`, "Content-Type": "application/json" });
  async function sbPull() {
    if (!sbOn()) return;
    try {
      const r = await fetch(`${SB.url}/rest/v1/${SB.table}?select=*`, { headers: sbHead() });
      if (!r.ok) return;
      const rows = await r.json();
      const remote = {};
      Object.keys(MONO).forEach(k => delete MONO[k]);
      rows.forEach(row => {
        if (typeof row.key === "string" && row.key.indexOf("mono|") === 0) {
          const sku = (row.datos && row.datos.sku) || row.key.slice(5);
          MONO[sku] = Object.assign({}, row.datos, { autor: row.autor, autor_email: row.autor_email, ts: row.ts ? Date.parse(row.ts) : Date.now() });
        } else {
          remote[row.key] = Object.assign({}, row.datos, { key: row.key, autor: row.autor, autor_email: row.autor_email, ts: row.ts ? Date.parse(row.ts) : Date.now() });
        }
      });
      AUTH = remote;                                 // el remoto es la fuente de verdad compartida
      localStorage.setItem(AUTH_KEY, JSON.stringify(AUTH));
      updateNavCount();
    } catch (e) { /* sin conexión: seguimos con la copia local */ }
  }
  async function sbPut(k) {
    if (!sbOn()) return;
    const a = AUTH[k]; if (!a) return;
    try {
      await fetch(`${SB.url}/rest/v1/${SB.table}`, {
        method: "POST",
        headers: Object.assign(sbHead(), { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify([{ key: k, autor: a.autor || null, autor_email: a.autor_email || AUTHSES.email() || null, datos: a, ts: new Date(a.ts || Date.now()).toISOString() }]),
      });
    } catch (e) { }
  }
  async function sbDel(k) {
    if (!sbOn()) return;
    try { await fetch(`${SB.url}/rest/v1/${SB.table}?key=eq.${encodeURIComponent(k)}`, { method: "DELETE", headers: sbHead() }); } catch (e) { }
  }
  const AUTOR_KEY = "benchmark_leuk_autor";
  function getAutor() {
    let a = localStorage.getItem(AUTOR_KEY);
    if (!a) {
      a = (prompt("¿Cómo te llamás? Queda registrado en las comparaciones que autorices (una sola vez).") || "").trim();
      if (a) localStorage.setItem(AUTOR_KEY, a);
    }
    return a || "Anónimo";
  }
  // Autor a registrar: el nombre real (de perfiles) o, si no hay, el del email — SIN preguntar.
  const autorNombre = () => NOMBRE || (AUTHSES.email() || "").split("@")[0] || "Anónimo";

  /* ---- Precios editables compartidos (overlay sobre los datos, vía Supabase) ---- */
  const PRICEOV = {};                                   // "precio|LEUK|sku" | "precio|Marca|fslug" -> {precio,autor,ts}
  const pkLeuk = sku => `precio|LEUK|${sku}`;
  const pkComp = (marca, fslug) => `precio|${marca}|${fslug}`;
  function applyPriceOverrides() {
    P.forEach(p => {
      if (p._poOrig === undefined) p._poOrig = p.precio_usd;
      const o = PRICEOV[pkLeuk(p.sku)];
      p.precio_usd = o ? o.precio : p._poOrig;
      const props = [];
      MARCAS.forEach(m => { if (p.mejor_por_marca[m]) props.push(p.mejor_por_marca[m]); });
      (p.propuestas || []).forEach(x => props.push(x));
      (p.posibles || []).forEach(x => props.push(x));
      props.forEach(pr => {
        if (!pr.precio) return;
        if (pr.precio._poOrig === undefined) pr.precio._poOrig = pr.precio.usd;
        const oc = PRICEOV[pkComp(pr.marca, pr.fslug)];
        pr.precio.usd = oc ? oc.precio : pr.precio._poOrig;
      });
    });
    (CATALOGO || []).forEach(c => {
      if (c._poOrig === undefined) c._poOrig = c.precio_usd;
      const oc = PRICEOV[pkComp(c.marca, c.fslug)];
      c.precio_usd = oc ? oc.precio : c._poOrig;
    });
  }
  // Rol del usuario (tabla `perfiles`). Jerarquía:
  //   lector → ve y selecciona | editor → + actualiza precios | admin → + elimina comparaciones
  const esAdmin = () => ROL === "admin";                       // puede eliminar CUALQUIER comparación / marca
  const puedePrecios = () => ROL === "editor" || ROL === "admin";
  // rol 'fichas' = SOLO la página de Fichas técnicas. No ve el benchmark (precios de
  // competencia / descuentos / márgenes) y ni siquiera se le baja ese archivo (ver bootApp).
  const esFichas = () => ROL === "fichas";
  // Cada uno puede eliminar lo que seleccionó él mismo; los admin, cualquier cosa.
  // Se compara por EMAIL (identidad real de la sesión), no por nombre.
  const esMio = a => {
    const yo = (AUTHSES.email() || "").toLowerCase();
    return !!(yo && a && a.autor_email && String(a.autor_email).toLowerCase() === yo);
  };
  const puedeBorrar = a => esAdmin() || esMio(a);
  const AVISO_BORRAR = "Sólo podés eliminar las comparaciones que seleccionaste vos. Pedile a un administrador que la quite.";
  async function fetchRol() {
    if (!sbOn() || !AUTHSES.logged()) return;
    try {
      const email = encodeURIComponent(AUTHSES.email() || "");
      const r = await fetch(`${SB.url}/rest/v1/perfiles?select=*&email=ilike.${email}`, { headers: AUTHSES.head() });
      if (r.status === 404) ROL = "admin";             // sistema de roles no configurado aún → todos pueden todo (como antes)
      else if (r.ok) { const rows = await r.json(); if (rows.length) { ROL = rows[0].rol || "lector"; NOMBRE = rows[0].nombre || ""; } else ROL = "lector"; }
    } catch (e) { }
    updatePreciosBtn();
  }
  function updatePreciosBtn() { const b = $("#btnPrecios"); if (b) b.style.display = puedePrecios() ? "" : "none"; }

  // Los precios editados viven en la tabla `precios` (lectura pública, escritura sólo editores).
  async function sbPullPrices() {
    if (!sbOn()) return;
    try {
      const r = await fetch(`${SB.url}/rest/v1/precios?select=*`, { headers: sbHead() });
      if (!r.ok) return;
      const rows = await r.json();
      Object.keys(PRICEOV).forEach(k => delete PRICEOV[k]);
      rows.forEach(row => { PRICEOV[row.key] = { precio: row.precio, autor: row.autor, ts: row.ts ? Date.parse(row.ts) : Date.now() }; });
      applyPriceOverrides();
    } catch (e) { }
  }
  async function savePrice(key, precio) {                // precio null = volver al original
    if (!AUTHSES.logged()) { alert("Ingresá con tu usuario para editar precios."); return; }
    const autor = AUTHSES.email(), ts = Date.now();
    if (precio == null) delete PRICEOV[key];
    else PRICEOV[key] = { precio, autor, ts };
    applyPriceOverrides();
    await priceWrite(key, precio, autor, ts, false);
  }
  async function priceWrite(key, precio, autor, ts, retried) {
    if (!sbOn()) return;
    try {
      let r;
      if (precio == null) {
        r = await fetch(`${SB.url}/rest/v1/precios?key=eq.${encodeURIComponent(key)}`, { method: "DELETE", headers: AUTHSES.head() });
      } else {
        r = await fetch(`${SB.url}/rest/v1/precios`, {
          method: "POST",
          headers: Object.assign(AUTHSES.head(), { Prefer: "resolution=merge-duplicates,return=minimal" }),
          body: JSON.stringify([{ key, precio, autor, ts: new Date(ts).toISOString() }]),
        });
      }
      if ((r.status === 401 || r.status === 403) && !retried && await AUTHSES.refresh()) return priceWrite(key, precio, autor, ts, true);
      if (!r.ok) alert("No se pudo guardar el precio (¿sesión vencida? volvé a ingresar).");
    } catch (e) { }
  }
  function openPriceEditor(key, curList, marca, label) {
    const ov = PRICEOV[key];
    const cur = ov ? ov.precio : curList;
    const quien = marca === "LEUK" ? "Leuk" : marca;
    const msg = `Precio de LISTA en US$ para:\n${label || key}  (${quien})` +
      (ov ? `\n\n(editado por ${ov.autor}. Dejalo vacío para volver al valor original)` : "");
    const inp = prompt(msg, cur != null ? cur : "");
    if (inp === null) return;
    const v = inp.trim();
    if (v === "") { savePrice(key, null).then(afterPriceEdit); return; }
    const num = Number(v.replace(/\./g, "").replace(",", "."));
    if (!isFinite(num) || num < 0) { alert("Precio inválido. Poné solo el número, ej: 42.50"); return; }
    savePrice(key, Math.round(num * 100) / 100).then(afterPriceEdit);
  }
  function afterPriceEdit() { const d = $("#detail"); if (d) d.classList.add("hidden"); rerenderActive(); }
  // La edición individual por producto (✎) se desactivó: los precios se actualizan
  // por CARGA MASIVA de lista (Excel), no producto por producto.
  function priceEdit() { return ""; }

  /* ===================== SESIÓN / LOGIN (Supabase Auth) ===================== */
  const AUTHSES = (function () {
    const KEY = "benchmark_leuk_sesion";
    let S = null; try { S = JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { }
    const save = s => { S = s; s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); if (typeof updateAuthBtn === "function") updateAuthBtn(); };
    async function login(email, password) {
      const r = await fetch(`${SB.url}/auth/v1/token?grant_type=password`, {
        method: "POST", headers: { apikey: SB.key, "Content-Type": "application/json" },
        body: JSON.stringify({ email: (email || "").trim(), password: password || "" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.access_token) throw new Error(d.error_description || d.msg || d.message || "Email o contraseña incorrectos");
      save({ access_token: d.access_token, refresh_token: d.refresh_token, email: (d.user && d.user.email) || email });
    }
    async function refresh() {
      if (!S || !S.refresh_token) return false;
      try {
        const r = await fetch(`${SB.url}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST", headers: { apikey: SB.key, "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: S.refresh_token }),
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.access_token) { save({ access_token: d.access_token, refresh_token: d.refresh_token, email: S.email }); return true; }
      } catch (e) { }
      save(null); return false;
    }
    function logout() {
      try { if (S) fetch(`${SB.url}/auth/v1/logout`, { method: "POST", headers: { apikey: SB.key, Authorization: `Bearer ${S.access_token}` } }); } catch (e) { }
      save(null);
    }
    return {
      logged: () => !!(S && S.access_token),
      email: () => (S && S.email) || "",
      head: () => ({ apikey: SB.key, Authorization: `Bearer ${S && S.access_token}`, "Content-Type": "application/json" }),
      login, refresh, logout,
    };
  })();

  /* ---- Sin producto comparable (oportunidades de monopolio), compartido ---- */
  const MONO = {};                                    // sku -> {sku, nombre, vertical, familia, precio_usd, autor, ts}
  const monoKey = sku => `mono|${sku}`;
  const isMono = sku => !!MONO[sku];
  function toggleMono(p) {
    if (MONO[p.sku]) {
      if (!puedeBorrar(MONO[p.sku])) { alert(AVISO_BORRAR); return false; }   // quitar la marca = eliminarla
      delete MONO[p.sku]; sbDel(monoKey(p.sku));
    }
    else {
      MONO[p.sku] = { sku: p.sku, nombre: p.nombre, vertical: p.vertical, familia: p.familia, precio_usd: p.precio_usd, autor: autorNombre(), autor_email: AUTHSES.email() || null, ts: Date.now() };
      sbPutMono(p.sku);
    }
  }
  async function sbPutMono(sku) {
    if (!sbOn()) return;
    const m = MONO[sku]; if (!m) return;
    try {
      await fetch(`${SB.url}/rest/v1/${SB.table}`, {
        method: "POST", headers: Object.assign(sbHead(), { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify([{ key: monoKey(sku), autor: m.autor || null, autor_email: m.autor_email || AUTHSES.email() || null, datos: m, ts: new Date(m.ts).toISOString() }]),
      });
    } catch (e) { }
  }

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
    if (AUTH[k]) {
      if (!puedeBorrar(AUTH[k])) { alert(AVISO_BORRAR); return; }   // quitar una selección = eliminarla
      delete AUTH[k]; save(); sbDel(k);
    }
    else {
      const s = snapshot(p, prop);
      s.autor = autorNombre(); s.autor_email = AUTHSES.email() || null;
      AUTH[k] = s; save(); sbPut(k);
    }
  }
  function updateNavCount() {
    const n = Object.keys(AUTH).length;
    $("#navCount").textContent = n ? n : "";
  }
  const authBtn = (p, prop) => {
    const on = isAuth(keyOf(p.sku, prop));
    return `<button class="auth-btn ${on ? "on" : ""}" data-sku="${p.sku}" data-marca="${prop.marca}" data-fslug="${prop.fslug}">${on ? "✓ Seleccionada" : "＋ Seleccionar"}</button>`;
  };
  const findProp = (sku, marca, fslug) => {
    const p = P.find(x => x.sku === sku); if (!p) return null;
    const inList = arr => (arr || []).find(x => x && x.marca === marca && x.fslug === fslug);
    // buscar en TODAS las secciones con botón Autorizar (antes faltaba 'posibles' → esos no se guardaban)
    const found = inList(p.propuestas)
      || Object.values(p.mejor_por_marca || {}).find(x => x && x.marca === marca && x.fslug === fslug)
      || inList(p.posibles)
      || suggList(sku).find(x => x.marca === marca && x.fslug === fslug);
    if (found) return found;
    // "Recomendado por tu historial": el prop se arma desde el CATÁLOGO global (equivalente
    // autorizado en un producto parecido), su fslug NO está en las listas de ESTE producto.
    // Reconstruirlo desde el catálogo (mismo camino que usa el render con suggProp).
    const comp = CATALOGO.find(c => c.marca === marca && c.fslug === fslug);
    return comp ? suggProp(comp, p) : null;
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
    b.classList.toggle("on", on); b.textContent = on ? "✓ Seleccionada" : "＋ Seleccionar";
    if (!$("#page-resultados").classList.contains("hidden")) renderTabla();
  });

  /* ===================== SUGERENCIAS MANUALES (localStorage) ===================== */
  let CATALOGO = [];
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
      // busca por SKU, nombre o familia (incl. subfamilia: "aplique", "lineal"…)
      if (q && ![p.sku, p.nombre, p.familia, p.subfamilia].some(v => norm(v).includes(q))) return false;
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
          <div class="cat-foot">${fmtUsd(p.precio_usd)} <span class="cat-badge ${nM ? "on" : ""}">${nM ? nM + " competidor" + (nM > 1 ? "es" : "") + " ✓" : "sin equiv."}</span></div></div>`;
      card.onclick = () => { _catScroll = window.scrollY; selectProduct(p); };   // recordar dónde estabas
      frag.appendChild(card);
    });
    catalogo.appendChild(frag);
  }
  let _selected = null;
  let _catScroll = 0;              // posición del catálogo, para volver al mismo lugar
  // keepScroll = re-render interno (marcar/sugerir): no mover la vista de donde está.
  function selectProduct(p, keepScroll) {
    _selected = p;
    catalogo.classList.add("hidden"); catFilters.classList.add("hidden"); catCount.classList.add("hidden");
    comp.classList.remove("hidden"); comp.innerHTML = "";
    const back = el("button", "btn-back", "← Volver al catálogo");
    back.onclick = () => volverAlCatalogo();
    comp.appendChild(back);
    comp.appendChild(comparacionView(p));
    if (!keepScroll) window.scrollTo({ top: 0, behavior: "smooth" });
  }
  // Vuelve al catálogo dejándote donde estabas (no arriba de todo).
  function volverAlCatalogo() {
    _selected = null;
    renderCatalogo();
    // esperar al layout de la grilla antes de restaurar la posición
    requestAnimationFrame(() => window.scrollTo({ top: _catScroll }));
  }
  function rankRow(p, prop, extra) {
    const c = cmp(p && p.precio_usd, prop.precio && prop.precio.usd, prop.marca);
    const r = el("div", "rank-row");
    r.innerHTML = `${imgTag(prop.imagen)}
      <div class="equiv-meta"><div class="equiv-marca">${prop.marca}${prop.manual ? ' · <span class="tag-sug">sugerido</span>' : ""}</div>
        <div class="equiv-name">${prop.nombre || prop.familia}</div>
        <div class="signals">${sigMini(prop.match)} ${confChip(prop.match)}</div></div>
      <div class="equiv-right">${c.has ? diffHtml(c.diff) : '<span class="leuk-fam">sin precio</span>'} ${priceEdit(pkComp(prop.marca, prop.fslug), prop.precio && prop.precio.usd, prop.marca, prop.nombre || prop.familia)}<br>${badge(prop.match.veredicto)}<br>${authBtn(p, prop)}${extra || ""}</div>`;
    r.onclick = ev => { if (!ev.target.closest(".auth-btn") && !ev.target.closest(".rm-sug") && !ev.target.closest(".price-edit")) openDetail(p, prop); };
    return r;
  }
  function comparacionView(p) {
    const wrap = el("div", "comp-wrap");
    wrap.appendChild(el("div", "comp-head", `${imgTag(p.imagen, "big")}
      <div class="comp-head-meta"><div class="leuk-sku">LEUK ${p.sku}</div>
        <h2>${p.nombre || ""}</h2>
        <div class="leuk-fam">${[p.vertical, p.familia, p.subfamilia].filter(Boolean).join(" · ")}</div>
        <div class="comp-price">${fmtUsd(p.precio_usd)} ${priceEdit(pkLeuk(p.sku), p.precio_usd, "LEUK", p.nombre)}</div></div>`));

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

    wrap.appendChild(el("h3", "sec-title", "Mejor equivalente por competidor"));
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
          <div class="marca-price">${c.has ? diffHtml(c.diff) + ' <span class="leuk-fam">' + c.texto + "</span>" : '<span class="leuk-fam">sin precio comp.</span>'} ${priceEdit(pkComp(prop.marca, prop.fslug), prop.precio && prop.precio.usd, prop.marca, prop.nombre || prop.familia)}</div>
          ${authBtn(p, prop)}`;
        card.onclick = ev => { if (!ev.target.closest(".auth-btn") && !ev.target.closest(".price-edit")) openDetail(p, prop); };
      } else {
        card.innerHTML = `<div class="marca-name">${m}</div><div class="empty-mini">Sin equivalente claro</div>`;
      }
      grid.appendChild(card);
    });
    wrap.appendChild(grid);

    // --- Marcar "sin producto comparable" (oportunidad de monopolio) ---
    const monoOn = isMono(p.sku);
    const monoBox = el("div", "mono-box" + (monoOn ? " on" : ""));
    monoBox.innerHTML = `<div class="mono-txt"><b>${monoOn ? "🏆 Sin producto comparable" : "¿No existe un producto comparable en el mercado?"}</b>
      <span>${monoOn ? "Marcado como sin competencia — aparece en Insights." : "Marcalo si Leuk no tiene equivalente en la competencia: queda mapeado en Insights para captar leads siendo la única opción."}</span></div>
      <button class="btn-ghost mono-btn ${monoOn ? "on" : ""}">${monoOn ? "Quitar marca" : "Marcar sin competencia"}</button>`;
    monoBox.querySelector(".mono-btn").onclick = () => { toggleMono(p); selectProduct(p, true); };
    wrap.appendChild(monoBox);

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
      row.querySelector(".rm-sug").onclick = () => { rmSugg(p.sku, prop.marca, prop.fslug); selectProduct(p, true); };
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
        row.querySelector("button").onclick = ev => { ev.stopPropagation(); addSugg(p.sku, c); close(); selectProduct(p, true); };
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
    $("#countLabel").textContent = `${f.length} comparación(es) seleccionada(s)`;
    const cont = $("#tabla"); cont.innerHTML = "";
    if (!Object.keys(AUTH).length) {
      cont.innerHTML = `<div class="empty"><div class="big">✓</div>Todavía no seleccionaste ninguna comparación.<br>Andá a <b>Catálogo</b>, buscá un producto y tocá <b>＋ Seleccionar</b> en los equivalentes que sirvan.</div>`;
      return;
    }
    cont.insertAdjacentHTML("beforeend", resumenPrecios(f));
    const grid = el("div", "res-cards");
    f.forEach(a => {
      const p = P.find(x => x.sku === a.leukSku) || { sku: a.leukSku, nombre: a.leukNombre, vertical: a.leukVertical, familia: a.leukFamilia, precio_usd: a.precioLeukUsd, imagen: a.leukImagen, ficha: {} };
      const pi = posInfo(a);
      // El % de diferencia es el dato protagonista; el descriptor va abajo, chico.
      const priceBlock = pi.has
        ? `<div class="res-posicion ${pi.cls}"><span class="rp-dif">${pi.diff > 0 ? "+" : ""}${pi.diff}%${priceAlert(pi.diff)}</span><span class="rp-text">${pi.texto} · Δ US$ ${Math.abs(pi.delta).toLocaleString("es-AR")}</span></div>`
        : `<div class="res-posicion p-na"><span class="rp-dif">—</span><span class="rp-text">Sin precio comp.</span></div>`;
      const card = el("div", "res-card");
      card.innerHTML = `
        <div class="res-head">
          <div class="res-pair">
            <div class="res-side">${imgTag(p.imagen || a.leukImagen, "sm")}<div class="res-txt"><span class="res-lbl">LEUK ${a.leukSku}</span><span class="res-nom">${a.leukNombre || ""}</span>${priceCell(a.precioLeukUsd, "LEUK")}</div></div>
            <span class="res-arrow">vs</span>
            <div class="res-side">${imgTag(a.equivImagen, "sm")}<div class="res-txt"><span class="res-lbl">${a.marca}${a.manual ? ' · <span class="tag-sug">sugerido</span>' : ""}</span><span class="res-nom">${a.equivNombre || a.equivFamilia}</span>${priceCell(a.precioCompUsd, a.marca)}</div></div>
          </div>
          <div class="res-meta">
            <div class="res-meta-row">
              ${priceBlock}
              <div class="res-btns"><button class="res-exp" title="Ver detalle">▾</button>${puedeBorrar(a) ? `<button class="rm" title="Quitar">✕</button>` : ""}</div>
            </div>
            <div class="res-foot">${eqSignal(a)}${a.autor ? `<span class="sep">·</span><span class="who">Seleccionó <b>${String(a.autor).replace(/[<>]/g, "")}</b></span>` : ""}</div>
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
      const rmBtn = card.querySelector(".rm");
      if (rmBtn) rmBtn.onclick = () => { delete AUTH[a.key]; save(); sbDel(a.key); renderTabla(); };
      grid.appendChild(card);
    });
    cont.appendChild(grid);
  }
  const csv = s => `"${(s || "").toString().replace(/"/g, '""')}"`;
  function exportCSV() {
    const f = authList();
    const H = ["SKU_Leuk", "Producto_Leuk", "Precio_Leuk_lista", "Precio_Leuk_neto", "Competidor", "Equivalente", "Nivel", "Desc_comp%", "Precio_comp_lista", "Precio_comp_neto", "Dif_neto%", "Dif_lista%", "Autorizo"];
    const lines = [H.join(",")];
    f.forEach(a => { const pi = posInfo(a); lines.push([a.leukSku, csv(a.leukNombre), a.precioLeukUsd, a.precioLeukNeto, a.marca, csv(a.equivNombre), a.veredicto, a.descComp != null ? a.descComp : "", a.precioCompUsd != null ? a.precioCompUsd : "", a.precioCompNeto != null ? a.precioCompNeto : "", pi.has ? pi.diff : "", a.diferencia_lista != null ? a.diferencia_lista : "", csv(a.autor)].join(",")); });
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
        Object.entries(obj).forEach(([k, v]) => { if (v && v.leukSku) { AUTH[k] = v; n++; sbPut(k); } });
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
    const precioRow = (listPrice, marca, key, label) => {
      const ed = key ? " " + priceEdit(key, listPrice, marca, label) : "";
      if (listPrice == null) return `<div class="ficha-row"><span class="k">Precio neto${ed}</span><span>—</span></div>`;
      const isLeuk = marca === "LEUK";
      const net = isLeuk ? netLeuk(listPrice) : netComp(listPrice, marca);
      const desc = isLeuk ? descLeuk() : descComp(marca);
      const extra = desc > 0 ? ` <span class="leuk-fam">(lista ${fmtUsd(listPrice)} · −${desc}%)</span>` : "";
      return `<div class="ficha-row"><span class="k">Precio neto${ed}</span><span>${fmtUsd(net)}${extra}</span></div>`;
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
          ${precioRow(p.precio_usd, "LEUK", pkLeuk(p.sku), p.nombre)}${_rows(p.ficha)}</div>
        <div class="col"><div class="equiv-marca">${e.marca} · ${eNombre}</div>
          ${eImg ? `<img src="${eImg}" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ""}
          ${precioRow(cLista, e.marca, e.fslug ? pkComp(e.marca, e.fslug) : null, eNombre)}${_rows(eFicha)}</div>
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
  const _leukFicha = a => ((P.find(z => z.sku === a.leukSku) || {}).ficha) || {};
  // Leuk más caro → mostrar las diferencias de ficha (Leuk vs competidor) para que el comercial argumente.
  function argumentoCaro(a, pi) {
    const cab = `LEUK ${a.leukNombre} vs ${a.marca} ${a.equivNombre}: ${Math.abs(pi.diff)}% más caro (US$ ${Math.round(pi.leukNet)} vs US$ ${Math.round(pi.compNet)})`;
    const lf = _leukFicha(a), cf = a.equivFicha || {};
    const gv = (o, k) => { for (const kk of Object.keys(o)) if (norm(kk) === norm(k)) return o[kk]; return "—"; };
    const difieren = ((a.match && a.match.tecnico && a.match.tecnico.difieren) || [])
      .filter(k => gv(lf, k) !== "—" || gv(cf, k) !== "—");
    const specs = difieren.slice(0, 5).map(k => `${k}: Leuk ${gv(lf, k)} / ${a.marca} ${gv(cf, k)}`);
    if (specs.length) return `${cab}. Diferencias técnicas → ${specs.join(" · ")}.`;
    return `${cab}. Misma gama técnica: revisar ficha completa para argumentar el diferencial.`;
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
  // Sección de oportunidades de monopolio (productos sin producto comparable)
  function monoSection(monos) {
    monos = monos.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const sec = el("div", "dash-sec");
    sec.innerHTML = `<h3>🏆 Productos sin competencia <span class="leuk-fam">· ${monos.length}</span></h3>
      <div class="fam-hint">Productos Leuk marcados como <b>sin producto comparable</b> en el mercado — para captar leads siendo la única opción. Marcalos desde <b>Catálogo</b>, en cada producto.</div>
      <div class="mono-list">${monos.map(m => `
        <div class="mono-item" data-sku="${m.sku}">
          <div class="mono-info"><span class="leuk-sku">LEUK ${m.sku}</span><span class="mono-nom">${m.nombre || ""}</span><span class="leuk-fam">${[m.vertical, m.familia].filter(Boolean).join(" · ")}${m.autor ? " · lo seleccionó " + String(m.autor).replace(/[<>]/g, "").split("@")[0] : ""}</span></div>
          <div class="mono-right">${fmtUsd(m.precio_usd)}${puedeBorrar(m) ? `<button class="rm mono-rm" title="Quitar">✕</button>` : ""}</div>
        </div>`).join("")}</div>`;
    sec.querySelectorAll(".mono-item").forEach(it => {
      const mrm = it.querySelector(".mono-rm");
      if (mrm) mrm.onclick = ev => { ev.stopPropagation(); const sku = it.dataset.sku; delete MONO[sku]; sbDel(monoKey(sku)); renderDecisiones(); };
      it.onclick = () => { const p = P.find(x => String(x.sku) === String(it.dataset.sku)); if (p) { _catScroll = 0; goToPage("comparaciones"); selectProduct(p); } };   // no venís del catálogo
    });
    return sec;
  }
  function renderDecisiones() {
    const dash = $("#dash"); dash.innerHTML = "";
    const A = Object.values(AUTH);
    const monos = Object.values(MONO);
    if (monos.length) dash.appendChild(monoSection(monos));
    if (!A.length) {
      if (!monos.length) dash.innerHTML = `<div class="empty"><div class="big">📊</div>Todavía no hay insights para mostrar.<br>Seleccioná comparaciones o marcá productos <b>sin competencia</b> (desde <b>Catálogo</b>) y acá se arma el panorama.</div>`;
      return;
    }
    const withP = A.map(a => ({ a, pi: posInfo(a) })).filter(x => x.pi.has);

    // KPIs de la config activa (una sola cifra grande) + comparador de escenarios
    const kpiActivo = el("div", "kpis");
    const nB0 = withP.filter(x => x.pi.cls === "p-cheap").length, nC0 = withP.filter(x => x.pi.cls === "p-exp").length, nS0 = withP.filter(x => x.pi.cls === "p-sim").length;
    const prom0 = withP.length ? Math.round(withP.reduce((s, x) => s + x.pi.diff, 0) / withP.length) : null;
    kpiActivo.innerHTML = `
      <div class="kpi"><div class="kpi-n">${A.length}</div><div class="kpi-l">seleccionadas</div></div>
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

    // Argumentos de venta: Leuk más barato (precio) + Leuk más caro (cómo defender el precio)
    const gana = withP.filter(x => x.pi.diff >= 10).sort((a, b) => b.pi.diff - a.pi.diff);
    const pierde = withP.filter(x => x.pi.diff <= -10).sort((a, b) => a.pi.diff - b.pi.diff);
    const secArg = el("div", "dash-sec");
    secArg.innerHTML = `<h3>🗣️ Argumentos de venta <span class="leuk-fam">(${gana.length + pierde.length})</span> <button class="btn-ghost" id="argExport" style="float:right">⬇ Exportar</button></h3>`;
    if (!gana.length && !pierde.length) {
      secArg.innerHTML += `<div class="empty-mini" style="padding:10px">Seleccioná comparaciones y acá aparecen los argumentos: dónde Leuk es más barato y cómo defender el precio cuando es más caro.</div>`;
    } else {
      secArg.innerHTML += `<div class="fam-hint">✅ Leuk equivale y es <b>más barato</b> — argumento directo de precio.</div>`;
      const al = el("div", "arg-list");
      if (gana.length) gana.slice(0, 40).forEach(x => { const d = el("div", "arg-item"); d.textContent = argumento(x.a, x.pi); al.appendChild(d); });
      else al.innerHTML = `<div class="empty-mini" style="padding:8px">Sin casos por ahora.</div>`;
      secArg.appendChild(al);
      const h2 = el("div", "fam-hint", "💬 Leuk es <b>más caro</b> — diferencias técnicas vs el competidor para defender el precio.");
      h2.style.marginTop = "18px"; secArg.appendChild(h2);
      const al2 = el("div", "arg-list");
      if (pierde.length) pierde.slice(0, 40).forEach(x => { const d = el("div", "arg-item"); d.textContent = argumentoCaro(x.a, x.pi); al2.appendChild(d); });
      else al2.innerHTML = `<div class="empty-mini" style="padding:8px">Sin casos por ahora.</div>`;
      secArg.appendChild(al2);
    }
    dash.appendChild(secArg);
    const be = secArg.querySelector("#argExport");
    if (be) be.onclick = () => dl(new Blob(["﻿LEUK MÁS BARATO (argumento de precio)\n" + gana.map(x => argumento(x.a, x.pi)).join("\n") + "\n\nLEUK MÁS CARO (defensa del precio)\n" + pierde.map(x => argumentoCaro(x.a, x.pi)).join("\n")], { type: "text/plain;charset=utf-8" }), "argumentos_venta_leuk.txt");
  }

  /* ===================== DESCUENTOS (modal editable) ===================== */
  function updateDescBtn() {
    const b = $("#btnDesc"); if (b) b.textContent = `⚙ Leuk ${CFG.leukTier === "cliente" ? "Cliente" : "Partner"} −${descLeuk()}%`;
  }
  function rerenderActive() {
    updateNavCount(); updateDescBtn();
    if (!$("#page-inicio").classList.contains("hidden")) renderInicio();
    else if (!$("#page-resultados").classList.contains("hidden")) renderTabla();
    else if (!$("#page-decisiones").classList.contains("hidden")) renderDecisiones();
    else if (_selected && !$("#comparacion").classList.contains("hidden")) selectProduct(_selected, true);
    else renderCatalogo();
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

  /* ===================== LOGIN / GATE (toda la app requiere sesión) ===================== */
  function updateAuthBtn() {
    const b = $("#btnAuth"); if (!b) return;
    b.textContent = `👤 ${(AUTHSES.email() || "").split("@")[0] || "salir"}`;
    b.title = `Sesión: ${AUTHSES.email()} — clic para cerrar sesión`;
  }
  function lock() {
    document.body.classList.add("locked");
    const em = $("#gateEmail"); if (em) { em.value = ""; $("#gatePass").value = ""; $("#gateErr").textContent = ""; setTimeout(() => em.focus(), 60); }
  }
  function unlock() { document.body.classList.remove("locked"); updateAuthBtn(); }
  function doLogout() { if (confirm(`Sesión: ${AUTHSES.email()}\n¿Cerrar sesión?`)) { AUTHSES.logout(); lock(); } }
  // descarga los datos del benchmark desde el bucket privado de Supabase (requiere sesión)
  async function fetchData(retried) {
    const r = await fetch(`${SB.url}/storage/v1/object/datos/benchmark_data.json`, { headers: AUTHSES.head() });
    if ((r.status === 400 || r.status === 401 || r.status === 403) && !retried && await AUTHSES.refresh()) return fetchData(true);
    if (!r.ok) throw new Error("No pude cargar los datos (sesión inválida — reingresá)");
    return await r.json();
  }
  async function bootApp() {                     // tras el login: baja datos + arma la app
    await fetchRol();                              // EL ROL PRIMERO: decide qué se baja
    if (esFichas()) { bootFichas(); return; }      // usuario solo-fichas: NO se baja el benchmark
    DATA = await fetchData();
    P = DATA.productos || [];
    MARCAS = (DATA.meta && DATA.meta.competidores) || ["Vonderk", "Artelum", "World Leds Go"];
    DEF_DISC = (DATA.meta && DATA.meta.descuentos) || {};
    CATALOGO = DATA.competencia || [];
    MARCAS.forEach(m => { if (CFG.comp[m] === undefined) CFG.comp[m] = DEF_DISC[m] != null ? DEF_DISC[m] : 0; });
    const meta = DATA.meta || {};
    // Frescura primero: la comparación vale lo que valen el TC y los descuentos vigentes.
    const gen = meta.generado ? new Date(meta.generado) : null;
    const dias = gen ? Math.floor((Date.now() - gen.getTime()) / 864e5) : null;
    const fecha = gen ? gen.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
    const vejez = dias == null ? "" : dias > 30 ? ` ⚠️ hace ${dias} días — pedir actualización` : dias > 0 ? ` (hace ${dias} día${dias > 1 ? "s" : ""})` : " (hoy)";
    const abrev = m => m === "World Leds Go" ? "WLG" : m;
    const descTxt = MARCAS.map(m => `${abrev(m)} −${DEF_DISC[m] != null ? DEF_DISC[m] : 0}%`).join(" · ");
    $("#metaLine").textContent = `Datos al ${fecha}${vejez} · TC blue $${(meta.tc_blue || 0).toLocaleString("es-AR")} · Descuentos: ${descTxt} · ${meta.n_productos_leuk || P.length} productos · matching por 3 señales`;
    buildCatFilters(); renderCatalogo(); updateDescBtn();
    goToPage("inicio");                            // la home es la vista de entrada
    await sbPull(); updateNavCount();
    await sbPullPrices();                          // llama applyPriceOverrides internamente
    updatePreciosBtn();                             // el rol ya se resolvió al principio
    rerenderActive();
  }
  // Arranque para el rol 'fichas': solo la página de Fichas técnicas, sin tocar el benchmark.
  function bootFichas() {
    document.body.classList.add("solo-fichas");
    $("#nav").querySelectorAll("button").forEach(b => { if (b.dataset.page !== "fichas") b.style.display = "none"; });
    ["#btnPrecios", "#btnDesc"].forEach(sel => { const b = $(sel); if (b) b.style.display = "none"; });
    const sub = document.querySelector(".brand-sub"); if (sub) sub.textContent = "Fichas técnicas";
    $("#metaLine").textContent = "";
    goToPage("fichas");
  }
  function wireGate() {
    const go = async () => {
      const err = $("#gateErr"); err.textContent = "";
      const btn = $("#gateGo"); btn.disabled = true; btn.textContent = "Ingresando…";
      try { await AUTHSES.login($("#gateEmail").value, $("#gatePass").value); await bootApp(); unlock(); }
      catch (e) { err.textContent = e.message || "No se pudo ingresar"; }
      btn.disabled = false; btn.textContent = "Ingresar";
    };
    $("#gateGo").onclick = go;
    $("#gateEmail").addEventListener("keydown", e => { if (e.key === "Enter") $("#gatePass").focus(); });
    $("#gatePass").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  }

  /* ===================== CARGA MASIVA DE PRECIOS (Excel) ===================== */
  const norm2 = s => (s || "").toString().trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  function parsePriceRows(rows) {
    // detecta columnas SKU y Precio de una hoja (array de objetos)
    if (!rows.length) return { items: [], err: "La hoja está vacía." };
    const cols = Object.keys(rows[0]);
    const find = cands => cols.find(c => cands.some(x => norm2(c) === x || norm2(c).includes(x)));
    const cSku = find(["sku", "codigo", "código", "code"]);
    const cPre = find(["precio", "price", "precio usd", "usd", "importe", "valor"]);
    if (!cSku || !cPre) return { items: [], err: `No encontré las columnas. Necesito una de SKU (${cSku || "falta"}) y una de Precio (${cPre || "falta"}). Columnas vistas: ${cols.join(", ")}` };
    const items = [];
    rows.forEach(r => {
      const sku = String(r[cSku] == null ? "" : r[cSku]).replace(/\.0$/, "").trim();
      let raw = String(r[cPre] == null ? "" : r[cPre]).replace(/[^\d.,-]/g, "");
      // normaliza número (maneja 1.234,56 y 1234.56)
      if (raw.indexOf(",") > -1 && raw.indexOf(".") > -1) raw = raw.replace(/\./g, "").replace(",", ".");
      else if (raw.indexOf(",") > -1) raw = raw.replace(",", ".");
      const precio = parseFloat(raw);
      if (sku && isFinite(precio) && precio > 0) items.push({ sku, precio: Math.round(precio * 100) / 100 });
    });
    return { items, col: { sku: cSku, precio: cPre } };
  }
  const flatSlug = s => norm2(s).replace(/[^a-z0-9]+/g, "");
  // matchea filas (sku/código + precio) a claves de override, según la marca elegida
  function matchRows(items, marca) {
    if (marca === "LEUK") {
      const skus = new Set(P.map(p => String(p.sku)));
      const out = items.filter(i => skus.has(i.sku)).map(i => ({ key: pkLeuk(i.sku), precio: i.precio, ref: i.sku }));
      return { out, total: items.length };
    }
    // competencia: matchear el código del Excel al código/fslug de la entidad
    const ents = (CATALOGO || []).filter(c => c.marca === marca);
    const rows = items.map(i => ({ cf: flatSlug(i.sku), precio: i.precio, code: i.sku })).filter(r => r.cf.length >= 3);
    const out = [];
    ents.forEach(e => {
      const fs = flatSlug(e.fslug || ""), ns = flatSlug(e.nombre || "");
      const hits = rows.filter(r =>
        (ns && (r.cf === ns || (ns.length >= 5 && r.cf.startsWith(ns)))) ||
        (fs && (r.cf === fs || (fs.length >= 4 && r.cf.startsWith(fs)))));
      if (hits.length) out.push({ key: pkComp(marca, e.fslug), precio: Math.min.apply(null, hits.map(h => h.precio)), ref: e.nombre || e.fslug });
    });
    return { out, total: items.length };
  }
  function openPrecios() {
    if (!puedePrecios()) { alert("No tenés permiso para actualizar precios. Pedile a un administrador que te habilite como editor."); return; }
    const ov = el("div", "detail"); ov.id = "preciosModal";
    const opts = `<option value="LEUK">Leuk</option>` + MARCAS.map(m => `<option value="${m}">${m}</option>`).join("");
    ov.innerHTML = `<div class="detail-inner desc-modal">
      <button class="detail-close" id="pxClose">✕</button>
      <h2>Actualizar precios por lista</h2>
      <div class="fam-hint">Subí la lista de precios en <b>Excel</b> (.xlsx) o CSV, con una columna de <b>código/SKU</b> y una de <b>Precio</b>. Elegí a qué marca pertenece la lista. Actualiza todos los precios de una y queda registrado quién la subió.</div>
      <h3>¿De qué marca es esta lista?</h3>
      <select id="pxMarca" class="lg-in" style="max-width:260px">${opts}</select>
      <div id="pxDrop" class="px-drop">Arrastrá el Excel acá o <b>tocá para elegir</b><input id="pxFile" type="file" accept=".xlsx,.xls,.csv" hidden></div>
      <div id="pxInfo" class="px-info"></div>
      <div class="desc-actions"><button class="btn-ghost" id="pxCancel">Cancelar</button><button class="btn-primary" id="pxApply" disabled>Aplicar</button></div>
    </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    let pending = null, lastFile = null;
    ov.querySelector("#pxClose").onclick = close;
    ov.querySelector("#pxCancel").onclick = close;
    ov.addEventListener("click", ev => { if (ev.target === ov) close(); });
    const drop = ov.querySelector("#pxDrop"), file = ov.querySelector("#pxFile"), info = ov.querySelector("#pxInfo"),
      apply = ov.querySelector("#pxApply"), marcaSel = ov.querySelector("#pxMarca");
    drop.onclick = () => file.click();
    drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
    drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]); };
    file.onchange = () => { if (file.files[0]) handle(file.files[0]); };
    marcaSel.onchange = () => { if (lastFile) handle(lastFile); };   // re-evaluar si cambia la marca
    function handle(f) {
      lastFile = f; info.innerHTML = "Leyendo…"; apply.disabled = true;
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, { type: "array" });
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
          const { items, err, col } = parsePriceRows(rows);
          if (err) { info.innerHTML = `<span class="px-bad">${err}</span>`; return; }
          const marca = marcaSel.value;
          const { out } = matchRows(items, marca);
          const nombre = marca === "LEUK" ? "Leuk" : marca;
          pending = out;
          const muestra = out.slice(0, 3).map(o => `${o.ref} → US$ ${o.precio}`).join(" · ");
          info.innerHTML = `<div><b>${f.name}</b> · ${items.length} filas leídas · columnas: ${col.sku} / ${col.precio}</div>
            <div class="px-ok">✓ ${out.length} precios de <b>${nombre}</b> se van a actualizar</div>
            ${out.length ? `<div class="leuk-fam">ej: ${muestra}${out.length > 3 ? "…" : ""}</div>` : ""}
            ${items.length - out.length > 0 ? `<div class="px-warn">⚠ ${items.length - out.length} filas sin coincidencia — se ignoran</div>` : ""}`;
          apply.disabled = out.length === 0;
        } catch (ex) { info.innerHTML = `<span class="px-bad">No pude leer el archivo: ${ex.message}</span>`; }
      };
      reader.readAsArrayBuffer(f);
    }
    apply.onclick = async () => {
      if (!pending || !pending.length) return;
      apply.disabled = true; apply.textContent = "Aplicando…";
      const ok = await bulkSavePrices(pending.map(i => ({ key: i.key, precio: i.precio })));
      if (ok) { info.innerHTML = `<div class="px-ok">✓ Listo: ${pending.length} precios actualizados y compartidos.</div>`; applyPriceOverrides(); rerenderActive(); setTimeout(close, 1500); }
      else { info.innerHTML = `<span class="px-bad">No se pudo guardar (¿sesión vencida? volvé a ingresar).</span>`; apply.disabled = false; apply.textContent = "Aplicar"; }
    };
  }
  async function bulkSavePrices(list, retried) {
    if (!sbOn() || !AUTHSES.logged()) return false;
    const autor = AUTHSES.email(), ts = new Date().toISOString();
    const body = list.map(x => ({ key: x.key, precio: x.precio, autor, ts }));
    // aplica local ya
    list.forEach(x => { PRICEOV[x.key] = { precio: x.precio, autor, ts: Date.now() }; });
    try {
      let okAll = true;
      for (let i = 0; i < body.length; i += 400) {
        const r = await fetch(`${SB.url}/rest/v1/precios`, {
          method: "POST", headers: Object.assign(AUTHSES.head(), { Prefer: "resolution=merge-duplicates,return=minimal" }),
          body: JSON.stringify(body.slice(i, i + 400)),
        });
        if ((r.status === 401 || r.status === 403) && !retried) { if (await AUTHSES.refresh()) return bulkSavePrices(list, true); return false; }
        if (!r.ok) okAll = false;
      }
      return okAll;
    } catch (e) { return false; }
  }

  /* ===================== NAV ===================== */
  const PAGES = ["inicio", "comparaciones", "resultados", "decisiones", "fichas"];
  function goToPage(page) {
    if (esFichas()) page = "fichas";               // rol solo-fichas: nunca sale de Fichas
    if (!PAGES.includes(page)) page = "inicio";
    $("#nav").querySelectorAll("button").forEach(x => x.classList.toggle("active", x.dataset.page === page));
    PAGES.forEach(p => { const el = $("#page-" + p); if (el) el.classList.toggle("hidden", p !== page); });
    if (page === "inicio") renderInicio();
    if (page === "resultados") { if (!$("#filters").children.length) buildFilters(); renderTabla(); sbPull().then(renderTabla); }
    if (page === "decisiones") { sbPull().then(renderDecisiones); renderDecisiones(); }
    if (page === "fichas" && window.renderFichas) window.renderFichas();
    window.scrollTo({ top: 0 });
  }
  $("#nav").addEventListener("click", ev => { const b = ev.target.closest("button"); if (b) goToPage(b.dataset.page); });

  /* ===================== INICIO (home) ===================== */
  function renderInicio() {
    const cont = $("#inicio"); if (!cont) return;
    const nProd = P.length;
    const price = pr => { const pe = pr && pr.precio; return (pe && pe.usd != null) ? pe.usd : null; };
    const conComp = P.filter(p => p.precio_usd && MARCAS.some(m => p.mejor_por_marca[m] && price(p.mejor_por_marca[m]) != null)).length;
    const nAuth = Object.keys(AUTH).length;
    const nombre = NOMBRE || (AUTHSES.email() || "").split("@")[0];
    const cards = [
      { p: "comparaciones", ic: "🔍", t: "Catálogo", d: "Buscá un producto Leuk y mirá sus equivalentes en la competencia: precio, ficha técnica e imagen, con el nivel de match." },
      { p: "resultados", ic: "✅", t: "Comparaciones", d: "Las comparaciones que tu equipo <b>seleccionó</b>, con la diferencia de precio neto. Exportables a CSV." },
      { p: "decisiones", ic: "📊", t: "Insights", d: "Panorama de pricing: posición de precio por familia, oportunidades y escenarios Partner vs Cliente." },
    ];
    cont.innerHTML = `
      <div class="home-hero">
        <img src="assets/logo-leuk-ilum.png?v=48" alt="Leuk Iluminación" class="home-logo">
        <span class="brand-sub home-tag">Benchmark competitivo</span>
        <h1>Hola${nombre ? ", " + nombre : ""} 👋</h1>
        <p>Este es el <b>benchmark competitivo de Leuk</b>: compará precios y datos técnicos de tus productos contra el mercado.</p>
        <div class="home-stats">
          <div class="home-stat"><b>${nProd}</b><span>productos Leuk</span></div>
          <div class="home-stat"><b>${conComp}</b><span>con comparación de precio</span></div>
          <div class="home-stat"><b>${MARCAS.length}</b><span>competidores</span></div>
          <div class="home-stat"><b>${nAuth}</b><span>comparaciones seleccionadas</span></div>
        </div>
      </div>
      <div class="home-cards">
        ${cards.map(c => `<button class="home-card" data-go="${c.p}"><div class="home-ic">${c.ic}</div><div class="home-ct"><h3>${c.t}</h3><p>${c.d}</p></div><span class="home-arrow">→</span></button>`).join("")}
      </div>
      <div class="home-help">
        <h2>¿Cómo se usa?</h2>
        <ol class="home-steps">
          <li><b>Buscá un producto</b> en <b>Catálogo</b> (por SKU o nombre) y abrilo para ver sus equivalentes.</li>
          <li><b>Revisá el match:</b> cada equivalente muestra <b>cuántas de las 3 señales coinciden</b> (técnica, forma, imagen). Cuantas más, más confiable.</li>
          <li><b>Seleccioná</b> las comparaciones válidas con “＋ Seleccionar”: quedan guardadas y <b>compartidas con todo el equipo</b> en <b>Comparaciones</b>.</li>
          <li><b>Analizá</b> en <b>Insights</b> la posición de precio y las oportunidades. Ajustá descuentos con <b>⚙ Descuentos</b>.</li>
          <li><b>Actualizar precios:</b> con <b>⬆ Precios</b> subís la lista (Excel) de una marca y se actualizan todos juntos.</li>
        </ol>
        <p class="home-note">Los precios de competencia sin coincidencia o marcados con ⚠ pueden ser de otra gama — conviene revisarlos.</p>
      </div>`;
    cont.querySelectorAll(".home-card").forEach(b => b.onclick = () => goToPage(b.dataset.go));
  }

  searchEl.addEventListener("input", () => renderCatalogo());
  $("#exportBtn").addEventListener("click", exportCSV);
  $("#exportJsonBtn").addEventListener("click", exportJson);
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", e => { if (e.target.files[0]) importJson(e.target.files[0]); });
  $("#btnDesc").addEventListener("click", openDescuentos);
  $("#btnPrecios").addEventListener("click", openPrecios);
  $("#btnAuth").addEventListener("click", doLogout);
  wireGate(); updateDescBtn();
  // La app requiere sesión: si hay sesión válida, bajar datos y entrar; si no, mostrar el login.
  (async () => {
    if (AUTHSES.logged() && await AUTHSES.refresh()) {
      try { await bootApp(); unlock(); } catch (e) { lock(); }
    } else { lock(); }
  })();
  setInterval(() => {
    if (document.body.classList.contains("locked")) return;
    sbPullPrices().then(() => { if (!$("#page-resultados").classList.contains("hidden")) renderTabla(); });
    if (!$("#page-resultados").classList.contains("hidden")) sbPull().then(renderTabla);
  }, 20000);
})();
