/* Leuk Marketing — plataforma interna (vanilla JS). Módulos: Benchmark y Fichas técnicas.
   Matching en vivo (3 señales) generado por el pipeline. Autorización en localStorage. */
(function () {
  // Los datos ya NO vienen de un archivo público: se descargan de Supabase DESPUÉS del login
  // (bucket privado 'datos'). Al arranque están vacíos; se poblan en bootApp().
  let DATA = { productos: [], meta: {} };
  let P = DATA.productos;
  let MARCAS = ["Vonderk", "Artelum", "World Leds Go"];
  let ROL = "editor";   // rol del usuario para editar precios ('editor' | 'lector'); se resuelve tras login
  let NOMBRE = "";      // nombre real del usuario (de la tabla perfiles), para el saludo
  let META_BENCH = ""; // pie con TC/descuentos/frescura; sólo se muestra en el módulo Benchmark
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
  // El % es SIEMPRE relativo al precio del COMPETIDOR (+ = Leuk más barato). El tooltip lo deja
  // explícito para que nadie lo lea al revés al pasarlo a una slide (un −115% = Leuk 115% más caro).
  const diffLabel = d => d > 0 ? `Leuk ${d.toFixed(0)}% más barato que el competidor` : d < 0 ? `Leuk ${Math.abs(d).toFixed(0)}% más caro que el competidor` : "Precio igual al competidor";
  const diffHtml = d => d == null ? "" : `<span class="diff ${d > 0 ? "pos" : "neg"}" title="${diffLabel(d)} (base: precio del competidor)">${d > 0 ? "+" : ""}${d.toFixed(0)}%</span>`;
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
      Object.keys(NOPAR).forEach(k => delete NOPAR[k]);
      Object.keys(NOENT).forEach(k => delete NOENT[k]);
      rows.forEach(row => {
        const meta = { autor: row.autor, autor_email: row.autor_email, ts: row.ts ? Date.parse(row.ts) : Date.now() };
        if (typeof row.key === "string" && row.key.indexOf("mono|") === 0) {
          const sku = (row.datos && row.datos.sku) || row.key.slice(5);
          MONO[sku] = Object.assign({}, row.datos, meta);
        } else if (typeof row.key === "string" && row.key.indexOf("nover|") === 0) {
          // "este producto de competencia no va en ninguna comparación"
          const d = row.datos || {}; NOENT[`${d.marca}|${d.fslug}`] = Object.assign({}, d, meta);
        } else if (typeof row.key === "string" && row.key.indexOf("no|") === 0) {
          // "este par no es comparable"
          const d = row.datos || {}; NOPAR[`${d.sku}|${d.marca}|${d.fslug}`] = Object.assign({}, d, meta);
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
  // Escribe una fila cualquiera de la tabla compartida (autorizaciones, mono, descartes).
  async function sbPutRow(key, o) {
    if (!sbOn()) return;
    try {
      await fetch(`${SB.url}/rest/v1/${SB.table}`, {
        method: "POST", headers: Object.assign(sbHead(), { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify([{ key, autor: o.autor || null, autor_email: o.autor_email || AUTHSES.email() || null, datos: o, ts: new Date(o.ts || Date.now()).toISOString() }]),
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
  // ---- ROLES ----------------------------------------------------------------
  // Un solo lugar define qué ve y qué puede hacer cada rol. La navegación, la Home y
  // los permisos leen de acá, así que sumar un rol o un módulo no se replica por el código.
  // `precios` = ve/edita precios de venta y descuentos. `costos` = ve el costo interno / margen
  // (dato sensible): sólo Admin y Líder. Coordinación ve todo menos costos.
  const ROLES = {
    admin:        { label: "Admin",        mods: ["benchmark", "diseno", "eventos", "contenidos", "acciones", "usuarios"], precios: true,  costos: true,  borrarTodo: true },
    lider:        { label: "Líder",        mods: ["benchmark", "diseno", "eventos", "contenidos", "acciones"], precios: true,  costos: true,  borrarTodo: false },
    coordinacion: { label: "Coordinación", mods: ["benchmark", "diseno", "eventos", "contenidos"], precios: true,  costos: false, borrarTodo: false },
    comercial:    { label: "Comercial",    mods: ["benchmark", "eventos"], precios: false, costos: false, borrarTodo: false },
    diseno:       { label: "Diseño",       mods: ["diseno", "eventos", "contenidos"],   precios: false, costos: false, borrarTodo: false },
    // Entra sólo al cronograma de la comunidad, a leerlo y comentarlo. No edita ni aprueba.
    representante:{ label: "Representante de marca", mods: ["contenidos"], precios: false, costos: false, borrarTodo: false },
  };
  // Nombres viejos → nuevos, para que nada se rompa antes/después de migrar la tabla.
  const ROL_ALIAS = { editor: "lider", lector: "comercial", fichas: "diseno" };
  const rolReal = () => ROL_ALIAS[ROL] || ROL;
  const SIN_ACCESO = { label: "Sin acceso", mods: [], precios: false, costos: false, borrarTodo: false };
  const rolCfg = () => SIN_PERFIL ? SIN_ACCESO : (ROLES[rolReal()] || ROLES.comercial);
  // Tareas no sale del rol sino de la marca `perfiles.marketing` (se tilda en Usuarios):
  // así alguien puede ser Líder o Diseño Y del equipo de marketing. El admin entra siempre.
  const esMarketing = () => !SIN_PERFIL && (MARKETING || rolReal() === "admin");
  const puedeVer = mod => mod === "tareas" ? esMarketing() : rolCfg().mods.includes(mod);
  const esAdmin = () => rolReal() === "admin";                 // puede eliminar CUALQUIER comparación / marca
  const puedePrecios = () => rolCfg().precios;
  const puedeCostos = () => rolCfg().costos;                   // ve el costo interno / margen (sólo Admin y Líder)
  const puedeIntegrar = () => ["admin", "lider", "coordinacion"].includes(rolReal());   // integrar competencia (PDF + web → catálogo)
  // Contenidos: coordinación para arriba (+ diseño, sep 2026) edita el copy y APRUEBA;
  // el representante de marca sólo lee y comenta. Esto decide qué botones se dibujan —
  // el permiso real lo aplica la RLS de Supabase (ver supabase/sql/2026-09-17-diseno-contenidos.sql).
  const puedeEditarContenidos = () => ["admin", "lider", "coordinacion", "diseno"].includes(rolReal());
  // Rol sin acceso al benchmark: no se le baja ese archivo (ver bootApp) ni ve el módulo.
  const esFichas = () => !puedeVer("benchmark");
  // Cada uno puede eliminar lo que seleccionó él mismo; los admin, cualquier cosa.
  // Se compara por EMAIL (identidad real de la sesión), no por nombre.
  const esMio = a => {
    const yo = (AUTHSES.email() || "").toLowerCase();
    return !!(yo && a && a.autor_email && String(a.autor_email).toLowerCase() === yo);
  };
  const puedeBorrar = a => esAdmin() || esMio(a);
  const AVISO_BORRAR = "Sólo podés eliminar las comparaciones que seleccionaste vos. Pedile a un administrador que la quite.";

  /* ---- COSTOS (margen, sólo admin/líder) ----------------------------------
   Los costos NO están en el archivo público del benchmark: viven en la tabla `costos`
   con RLS (sólo admin/líder leen o escriben). Doble candado: la base no se los entrega
   al resto, y aunque los tuviera, la pantalla los muestra sólo si puedeCostos(). */
  const COSTOS = {};                                    // sku -> costo en US$
  async function fetchCostos() {
    Object.keys(COSTOS).forEach(k => delete COSTOS[k]);
    if (!sbOn() || !AUTHSES.logged() || !puedeCostos()) return;
    try {
      const r = await fetch(`${SB.url}/rest/v1/costos?select=sku,costo`, { headers: AUTHSES.head() });
      if (!r.ok) return;
      (await r.json()).forEach(row => { COSTOS[row.sku] = Number(row.costo); });
    } catch (e) { /* sin costos, la app sigue igual */ }
  }
  // margen en US$ y % sobre el precio de venta (neto). null si no hay costo o no está permitido.
  function margen(sku, ventaNet) {
    if (!puedeCostos() || ventaNet == null) return null;
    const c = COSTOS[sku];
    if (c == null || !(c > 0)) return null;           // costo 0 / vacío = sin costo cargado
    const m = ventaNet - c;
    return { usd: Math.round(m), pct: ventaNet ? Math.round(m / ventaNet * 1000) / 10 : null, costo: c, neg: m < 0 };
  }
  const margenTxt = mg => mg == null ? "—" : `US$ ${mg.usd.toLocaleString("es-AR")}${mg.pct != null ? ` · ${mg.pct}%` : ""}`;
  let SIN_PERFIL = false;                            // tiene cuenta pero nadie le asignó rol
  let MARKETING = false;                             // del equipo de marketing → ve Tareas
  async function fetchRol() {
    if (!sbOn() || !AUTHSES.logged()) return;
    SIN_PERFIL = false; MARKETING = false;
    try {
      const email = encodeURIComponent(AUTHSES.email() || "");
      const r = await fetch(`${SB.url}/rest/v1/perfiles?select=*&email=ilike.${email}`, { headers: AUTHSES.head() });
      if (r.status === 404) ROL = "admin";             // sistema de roles no configurado aún → todos pueden todo (como antes)
      else if (r.ok) {
        const rows = await r.json();
        if (rows.length) { ROL = rows[0].rol || "comercial"; NOMBRE = rows[0].nombre || ""; MARKETING = !!rows[0].marketing; }
        // El registro es abierto: tener cuenta NO da acceso. Sin perfil asignado, nada.
        else { ROL = ""; SIN_PERFIL = true; }
      }
    } catch (e) { }
  }

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
      token: () => (S && S.access_token) || "",   // lo manda fichas-panel.js a 06_API.gs
      head: () => ({ apikey: SB.key, Authorization: `Bearer ${S && S.access_token}`, "Content-Type": "application/json" }),
      login, refresh, logout,
    };
  })();

  /* ---- Puente de sesión para las vistas en archivos aparte ----------------
     app.js es una IIFE: nada de acá adentro es visible desde fichas-panel.js.
     Este es el único punto de contacto, a propósito — así se ve de un vistazo
     qué expone la app y qué no.
     `puedeEditarFichas` acá sólo decide si se DIBUJAN los botones. El permiso
     de verdad lo valida 06_API.gs contra Supabase en cada escritura: si esto
     mintiera, la API igual rechaza. */
  const ROLES_FICHAS_ESCRITURA = ["admin", "lider", "coordinacion", "diseno"];
  window.LEUK_SESION = {
    email: () => AUTHSES.email(),
    token: () => AUTHSES.token(),
    rol: () => rolReal(),
    puedeEditarFichas: () => AUTHSES.logged() && ROLES_FICHAS_ESCRITURA.includes(rolReal()),
    // ---- lo que usa contenidos.js ----
    nombre: () => autorNombre(),
    head: () => AUTHSES.head(),                    // apikey + JWT, para pegarle a la REST
    sbUrl: SB.url,
    puedeVerContenidos: () => AUTHSES.logged() && puedeVer("contenidos"),
    puedeEditarContenidos: () => AUTHSES.logged() && puedeEditarContenidos(),
    // La campanita de Contenidos junta avisos de TODOS los canales; para llevar a
    // uno de otro canal necesita cambiar de página, y la navegación vive acá.
    irA: p => goToPage(p),
    // ---- lo que usa tareas.js ----
    puedeVerTareas: () => AUTHSES.logged() && puedeVer("tareas"),
    // ---- lo que usa acciones.js ----
    puedeVerAcciones: () => AUTHSES.logged() && puedeVer("acciones"),
  };

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

  /* ---- Descartes: enseñarle al motor qué NO es comparable, compartido ----
     Dos cosas distintas que la gente llama igual:
       · NOPAR  — este PAR está mal emparejado (los dos productos existen, el cruce no).
       · NOENT  — este producto de la competencia no sirve para ninguna comparación
                  (un accesorio, un diagrama que se coló, una fila mal extraída del PDF).
     Viven en la misma tabla que las selecciones, con prefijo en la key. El motivo es lo
     que después permite corregir el motor: sin motivo, un descarte no generaliza. */
  const NOPAR = {};                                   // "sku|Marca|fslug" -> {..., motivo}
  const NOENT = {};                                   // "Marca|fslug"     -> {..., motivo}
  const MOTIVOS = {
    tipo:   "No es el mismo tipo de producto",
    tamano: "Muy distinto en tamaño o potencia",
    foto:   "La foto engaña, no se parecen",
    precio: "No juegan en la misma liga de precio",
    otro:   "Otro",
  };
  const noParKey  = (sku, prop) => `no|${sku}|${prop.marca}|${prop.fslug}`;
  const noEntKey  = (marca, fslug) => `nover|${marca}|${fslug}`;
  const entKey    = (marca, fslug) => `${marca}|${fslug}`;
  const noParId   = (sku, prop) => `${sku}|${prop.marca}|${prop.fslug}`;
  const isNoEnt   = prop => !!NOENT[entKey(prop.marca, prop.fslug)];
  const descartado = (sku, prop) => !!NOPAR[noParId(sku, prop)] || isNoEnt(prop);
  const sinDescartes = (sku, arr) => (arr || []).filter(x => x && !descartado(sku, x));

  function descartarPar(p, prop, motivo) {
    const o = {
      sku: p.sku, leukNombre: p.nombre, marca: prop.marca, fslug: prop.fslug,
      nombre: prop.nombre || prop.familia, familia: prop.familia,
      veredicto: prop.match && prop.match.veredicto, motivo,
      autor: autorNombre(), autor_email: AUTHSES.email() || null, ts: Date.now(),
    };
    NOPAR[noParId(p.sku, prop)] = o;
    sbPutRow(noParKey(p.sku, prop), o);
    // Descartar y tener seleccionado el mismo par se contradicen: gana el descarte.
    // Pero la selección de otra persona no se toca sin permiso: se avisa.
    const ak = keyOf(p.sku, prop);
    if (AUTH[ak]) {
      if (puedeBorrar(AUTH[ak])) { delete AUTH[ak]; save(); sbDel(ak); }
      else alert(`Lo descartaste, pero la selección de ${AUTH[ak].autor || "otra persona"} sigue en Comparaciones. Pedile a un administrador que la quite.`);
    }
  }
  function descartarEnt(prop, motivo) {
    const o = {
      marca: prop.marca, fslug: prop.fslug, nombre: prop.nombre || prop.familia,
      familia: prop.familia, motivo,
      autor: autorNombre(), autor_email: AUTHSES.email() || null, ts: Date.now(),
    };
    NOENT[entKey(prop.marca, prop.fslug)] = o;
    sbPutRow(noEntKey(prop.marca, prop.fslug), o);
    // se cae lo que hayas seleccionado contra ese producto (lo ajeno queda, con aviso)
    const tocadas = Object.values(AUTH).filter(a => a.marca === prop.marca && a.fslug === prop.fslug);
    const ajenas = tocadas.filter(a => !puedeBorrar(a));
    tocadas.filter(puedeBorrar).forEach(a => { delete AUTH[a.key]; sbDel(a.key); });
    save();
    if (ajenas.length) alert(`Quedaron ${ajenas.length} selección(es) de otras personas contra este producto. Pedile a un administrador que las quite.`);
  }
  function quitarDescarte(o) {
    if (!puedeBorrar(o)) { alert(AVISO_BORRAR); return false; }
    if (o.sku) { delete NOPAR[noParId(o.sku, o)]; sbDel(`no|${o.sku}|${o.marca}|${o.fslug}`); }
    else { delete NOENT[entKey(o.marca, o.fslug)]; sbDel(noEntKey(o.marca, o.fslug)); }
    return true;
  }
  // Descartes que afectan a un producto Leuk (para la lista de "descartados")
  const descartesDe = sku => Object.values(NOPAR).filter(o => o.sku === sku);

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
    // El contador vive en la sub-barra de Benchmark: no existe si estás en Inicio o Diseño.
    const el = $("#navCount"); if (el) el.textContent = n ? n : "";
  }
  const authBtn = (p, prop) => {
    const on = isAuth(keyOf(p.sku, prop));
    return `<button class="auth-btn ${on ? "on" : ""}" data-sku="${p.sku}" data-marca="${prop.marca}" data-fslug="${prop.fslug}">${on ? "✓ Seleccionada" : "＋ Seleccionar"}</button>`;
  };
  // ✕ "No es comparable": abre el modal que pide el motivo
  const noBtn = (p, prop) => `<button class="no-btn" data-sku="${p.sku}" data-marca="${prop.marca}" data-fslug="${prop.fslug}" title="No es comparable">✕</button>`;

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
  // click delegado en el ✕ de descartar
  document.addEventListener("click", ev => {
    const b = ev.target.closest(".no-btn"); if (!b) return;
    ev.stopPropagation();
    const p = P.find(x => x.sku === b.dataset.sku);
    const prop = findProp(b.dataset.sku, b.dataset.marca, b.dataset.fslug);
    if (p && prop) openNoModal(p, prop);
  });

  /* Modal del descarte. Pide el motivo porque es lo único que después deja corregir el
     motor: "no sirve" no generaliza, "no es el mismo tipo de producto" sí. */
  function openNoModal(p, prop) {
    const ov = el("div", "detail"); ov.id = "noModal";
    ov.innerHTML = `<div class="detail-inner no-modal">
      <button class="detail-close" id="noClose">✕</button>
      <h2>¿Por qué no es comparable?</h2>
      <p class="no-par"><b>LEUK ${p.sku}</b> ${p.nombre || ""} <span class="leuk-fam">frente a</span> <b>${prop.marca}</b> ${prop.nombre || prop.familia}</p>
      <div class="no-motivos">${Object.entries(MOTIVOS).map(([k, txt], i) =>
        `<label class="no-motivo"><input type="radio" name="motivo" value="${k}"${i === 0 ? " checked" : ""}> ${txt}</label>`).join("")}</div>
      <label class="no-global"><input type="checkbox" id="noGlobal"><span>Además, <b>${prop.nombre || prop.familia}</b> no sirve para <b>ninguna</b> comparación (accesorio, dato mal extraído, no es una luminaria)</span></label>
      <div class="no-acciones">
        <button class="btn-ghost" id="noCancel">Cancelar</button>
        <button class="btn-primario" id="noOk">Descartar</button>
      </div></div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector("#noClose").onclick = close;
    ov.querySelector("#noCancel").onclick = close;
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    ov.querySelector("#noOk").onclick = () => {
      const motivo = (ov.querySelector('input[name="motivo"]:checked') || {}).value || "otro";
      if (ov.querySelector("#noGlobal").checked) descartarEnt(prop, motivo);
      else descartarPar(p, prop, motivo);
      close();
      selectProduct(p, true);
      updateNavCount();
    };
  }

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
      // base = COMPETIDOR (igual que cmp()): + = Leuk más barato. Antes dividía por lNet (base Leuk),
      // lo que daba magnitudes distintas a la vista principal para el mismo par.
      dif = Math.round((cNet - lNet) / cNet * 1000) / 10;
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
      <div class="equiv-right">${c.has ? diffHtml(c.diff) : '<span class="leuk-fam">sin precio</span>'} ${priceEdit(pkComp(prop.marca, prop.fslug), prop.precio && prop.precio.usd, prop.marca, prop.nombre || prop.familia)}<br>${badge(prop.match.veredicto)}<br>${authBtn(p, prop)}${noBtn(p, prop)}${extra || ""}</div>`;
    r.onclick = ev => { if (!ev.target.closest(".auth-btn") && !ev.target.closest(".no-btn") && !ev.target.closest(".rm-sug") && !ev.target.closest(".price-edit")) openDetail(p, prop); };
    return r;
  }
  function comparacionView(p) {
    const wrap = el("div", "comp-wrap");
    const mgLeuk = margen(p.sku, netLeuk(p.precio_usd));
    const margenHead = mgLeuk
      ? `<div class="comp-margen${mgLeuk.neg ? " neg" : ""}" title="Margen sobre tu precio neto (costo US$ ${mgLeuk.costo.toLocaleString("es-AR")}). Sólo lo ves vos.">Margen ${margenTxt(mgLeuk)}${mgLeuk.neg ? " ⚠" : ""}</div>`
      : "";
    wrap.appendChild(el("div", "comp-head", `${imgTag(p.imagen, "big")}
      <div class="comp-head-meta"><div class="leuk-sku">LEUK ${p.sku}</div>
        <h2>${p.nombre || ""}</h2>
        <div class="leuk-fam">${[p.vertical, p.familia, p.subfamilia].filter(Boolean).join(" · ")}</div>
        <div class="comp-price">${fmtUsd(p.precio_usd)} ${priceEdit(pkLeuk(p.sku), p.precio_usd, "LEUK", p.nombre)}</div>${margenHead}</div>`));

    // --- Recomendado por tu historial (productos Leuk parecidos) ---
    const recs = recomendaciones(p).filter(rec => !descartado(p.sku, rec.comp));
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
    const sinEquiv = [];
    MARCAS.forEach(m => {
      let prop = p.mejor_por_marca[m];
      // Si lo descartaste, el puesto no queda vacío: lo toma el siguiente de esa marca.
      let reemplazo = false;
      if (prop && descartado(p.sku, prop)) {
        prop = sinDescartes(p.sku, p.propuestas).find(x => x.marca === m) || null;
        reemplazo = true;
      }
      // Las marcas sin equivalente no ocupan una tarjeta: se listan abajo en una línea.
      if (!prop) { sinEquiv.push(m + (reemplazo ? " (lo descartaste)" : "")); return; }
      const card = el("div", "marca-card");
      {
        const c = cmp(p.precio_usd, prop.precio && prop.precio.usd, prop.marca);
        card.innerHTML = `<div class="marca-name">${m}</div>${imgTag(prop.imagen)}
          <div class="marca-prod">${prop.nombre || prop.familia}</div>
          <div>${badge(prop.match.veredicto)} ${confChip(prop.match)}</div>
          <div class="signals">${sigMini(prop.match)}</div>
          <div class="marca-price">${c.has ? diffHtml(c.diff) + ' <span class="leuk-fam">' + c.texto + "</span>" : '<span class="leuk-fam">sin precio comp.</span>'} ${priceEdit(pkComp(prop.marca, prop.fslug), prop.precio && prop.precio.usd, prop.marca, prop.nombre || prop.familia)}</div>
          ${authBtn(p, prop)}${noBtn(p, prop)}`;
        card.onclick = ev => { if (!ev.target.closest(".auth-btn") && !ev.target.closest(".no-btn") && !ev.target.closest(".price-edit")) openDetail(p, prop); };
      }
      if (reemplazo) card.insertAdjacentHTML("beforeend", `<div class="reemplazo">Entró en lugar del que descartaste</div>`);
      grid.appendChild(card);
    });
    if (grid.children.length) wrap.appendChild(grid);
    if (sinEquiv.length) {
      wrap.appendChild(el("div", "sin-equiv", grid.children.length
        ? `Sin equivalente claro en <b>${sinEquiv.join("</b> · <b>")}</b>`
        : `Ningún competidor tiene un equivalente claro para este producto.`));
    }

    // --- Marcar "sin producto comparable" (oportunidad de monopolio) ---
    const monoOn = isMono(p.sku);
    const monoBox = el("div", "mono-box" + (monoOn ? " on" : ""));
    monoBox.innerHTML = `<div class="mono-txt"><b>${monoOn ? "🏆 Sin producto comparable" : "¿No existe un producto comparable en el mercado?"}</b>
      <span>${monoOn ? "Marcado como sin competencia — aparece en Insights." : "Marcalo si Leuk no tiene equivalente en la competencia: queda mapeado en Insights para captar leads siendo la única opción."}</span></div>
      <button class="btn-ghost mono-btn ${monoOn ? "on" : ""}">${monoOn ? "Quitar marca" : "Marcar sin competencia"}</button>`;
    monoBox.querySelector(".mono-btn").onclick = () => { toggleMono(p); selectProduct(p, true); };
    wrap.appendChild(monoBox);

    // --- Sugeridos a mano + botón para sugerir ---
    const sugeridos = sinDescartes(p.sku, suggList(p.sku));
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

    const propuestas = sinDescartes(p.sku, p.propuestas);
    if (propuestas.length) {
      const det = el("details", "ranking");
      det.innerHTML = `<summary>Ranking de equivalentes confiables — ${propuestas.length} (coinciden ≥2 señales)</summary>`;
      const list = el("div", "rank-list");
      propuestas.forEach(prop => list.appendChild(rankRow(p, prop, "")));
      det.appendChild(list); wrap.appendChild(det);
    }
    // Posibles: 1 sola señal → baja confianza, a revisar (separado, no mezclado)
    const posibles = sinDescartes(p.sku, p.posibles);
    if (posibles.length) {
      const det = el("details", "ranking posibles");
      det.innerHTML = `<summary>⚠ Posibles — a revisar · ${posibles.length} <span class="leuk-fam">(1 sola señal; puede traer algo poco parecido)</span></summary>`;
      const list = el("div", "rank-list");
      posibles.forEach(prop => list.appendChild(rankRow(p, prop, "")));
      det.appendChild(list); wrap.appendChild(det);
    }

    // --- Descartados: lo que le enseñaste al motor sobre este producto ---
    const desc = descartesDe(p.sku);
    const entes = [...new Set([].concat(
      sinFiltrar(p).filter(isNoEnt).map(x => entKey(x.marca, x.fslug))))].map(k => NOENT[k]);
    if (desc.length || entes.length) {
      const det = el("details", "ranking descartados");
      det.innerHTML = `<summary>✕ Descartados — ${desc.length + entes.length} <span class="leuk-fam">(no vuelven a proponerse)</span></summary>`;
      const list = el("div", "rank-list");
      desc.concat(entes).forEach(o => {
        const row = el("div", "desc-row");
        row.innerHTML = `<div class="desc-meta"><div class="equiv-marca">${o.marca}${o.sku ? "" : ' · <span class="tag-sug">en todo el benchmark</span>'}</div>
            <div class="equiv-name">${o.nombre || o.familia || ""}</div>
            <div class="leuk-fam">${MOTIVOS[o.motivo] || o.motivo || ""} · ${o.autor || ""}</div></div>
          ${puedeBorrar(o) ? `<button class="btn-ghost desc-undo">Volver a proponer</button>` : ""}`;
        const u = row.querySelector(".desc-undo");
        if (u) u.onclick = () => { if (quitarDescarte(o)) selectProduct(p, true); };
        list.appendChild(row);
      });
      det.appendChild(list); wrap.appendChild(det);
    }
    return wrap;
  }
  // Todos los candidatos que el motor propuso para un producto, sin filtrar (para
  // detectar cuáles cayeron por un descarte global).
  function sinFiltrar(p) {
    return [].concat(p.propuestas || [], p.posibles || [],
      Object.values(p.mejor_por_marca || {}).filter(Boolean), suggList(p.sku) || []);
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
  const state = { orden: "dif", page: 0, sort: null, familia: "", rango: "", set: "" };
  // info de precio de una comparación autorizada
  // comparación NETA en vivo de una autorización (usa la config de descuentos vigente)
  const posInfo = a => cmp(a.precioLeukUsd, a.precioCompUsd, a.marca);
  const POS_LABEL = { barato: "Leuk más barato", caro: "Leuk más caro", similar: "Precio similar", sin: "Sin precio comp." };
  function buildFilters() {
    const box = $("#filters"); box.innerHTML = "";
    // Sin etiquetas: la primera opción dice qué filtra. La posición de precio la filtran los contadores de arriba.
    const defs = [
      { key: "marca", label: "Competidor", opts: MARCAS },
      { key: "nivel", label: "Nivel de equivalencia", opts: ["Equivalente", "Comparable parcial"] },
      { key: "vertical", label: "Vertical", opts: uniq(P, p => p.vertical) },
    ];
    const q = el("input"); q.type = "search"; q.dataset.k = "q"; q.placeholder = "Buscar por SKU o nombre…"; q.setAttribute("aria-label", "Buscar");
    box.appendChild(q);
    defs.forEach(f => {
      const w = el("select"); w.dataset.k = f.key; w.setAttribute("aria-label", f.label);
      w.innerHTML = `<option value="">${f.label}: todos</option>${f.opts.map(o => `<option>${o}</option>`).join("")}`;
      box.appendChild(w);
    });
    const ord = el("select"); ord.dataset.k = "orden"; ord.setAttribute("aria-label", "Ordenar por");
    ord.innerHTML = `<option value="dif">Orden: mayor diferencia</option>
      <option value="caro">Orden: Leuk más caro primero</option>
      <option value="barato">Orden: Leuk más barato primero</option>
      <option value="reciente">Orden: más recientes</option>`;
    box.appendChild(ord);
    box.querySelectorAll("select,input").forEach(x => { if (x.dataset.k === "orden") x.value = state.orden; x.oninput = () => { state[x.dataset.k] = x.value; state.page = 0; if (x.dataset.k === "orden") state.sort = null; renderTabla(); }; });
  }
  const vertOf = sku => { const p = P.find(x => x.sku === sku); return p ? p.vertical : null; };
  // Rangos de diferencia (misma regla que cmp(): ±3% es "similar"). Los usa la distribución del tablero.
  const RANGOS = [
    { k: "mcaro",   t: "Mucho más caro",   sub: "más de 50%",  f: d => d < -50,               tono: "no" },
    { k: "caro",    t: "Más caro",         sub: "3% a 50%",    f: d => d >= -50 && d < -3,    tono: "no2" },
    { k: "sim",     t: "Precio similar",   sub: "±3%",         f: d => d >= -3 && d <= 3,     tono: "sim" },
    { k: "barato",  t: "Más barato",       sub: "3% a 50%",    f: d => d > 3 && d <= 50,      tono: "ok2" },
    { k: "mbarato", t: "Mucho más barato", sub: "más de 50%",  f: d => d > 50,                tono: "ok" },
  ];
  const famDe = a => a.leukFamilia || "—";
  // `skip`: filtros que NO se aplican (cada gráfico ignora el suyo para mostrar la selección entre las demás opciones)
  function filtrar(skip) {
    skip = skip || [];
    const on = k => state[k] && !skip.includes(k);
    return Object.values(AUTH).filter(a => {
      if (on("marca") && a.marca !== state.marca) return false;
      if (on("nivel") && a.veredicto !== state.nivel) return false;
      if (on("vertical") && vertOf(a.leukSku) !== state.vertical) return false;
      if (on("familia") && famDe(a) !== state.familia) return false;
      if (on("set") && !state.set.keys.has(a.key)) return false;
      if (on("posicion")) { const pi = posInfo(a); if ((state.posicion === "Sin precio comp." ? "Sin precio comp." : pi.texto) !== state.posicion) return false; }
      if (on("rango")) { const pi = posInfo(a); const r = RANGOS.find(x => x.k === state.rango); if (!pi.has || !r.f(pi.diff)) return false; }
      if (on("q")) { const q = norm(state.q); if (!norm(a.leukSku).includes(q) && !norm(a.leukNombre).includes(q) && !norm(a.equivNombre).includes(q)) return false; }
      return true;
    });
  }
  function authList() {
    const arr = filtrar();
    const dOf = a => { const pi = posInfo(a); return pi.has ? pi.diff : null; };
    const COL = {   // orden por columna de la tabla
      sku: a => String(a.leukSku), marca: a => norm(a.marca), leuk: a => netLeuk(a.precioLeukUsd), comp: a => netComp(a.precioCompUsd, a.marca), dif: dOf,
    };
    if (state.sort && COL[state.sort.k]) {
      const g = COL[state.sort.k], dir = state.sort.dir;
      return arr.sort((x, y) => {
        const vx = g(x), vy = g(y);
        if (vx == null) return 1; if (vy == null) return -1;
        return (typeof vx === "string" ? vx.localeCompare(vy, "es", { numeric: true }) : vx - vy) * dir;
      });
    }
    const sorters = {
      reciente: (x, y) => y.ts - x.ts,
      dif: (x, y) => (Math.abs(dOf(y) ?? -1) - Math.abs(dOf(x) ?? -1)),
      caro: (x, y) => (dOf(x) ?? 1e9) - (dOf(y) ?? 1e9),      // más caro (dif negativa) primero
      barato: (x, y) => (dOf(y) ?? -1e9) - (dOf(x) ?? -1e9),  // más barato (dif positiva) primero
    };
    return arr.sort(sorters[state.orden] || sorters.dif);
  }
  // Contadores del encabezado: cuentan TODAS las seleccionadas (menos los filtros de arriba) y al tocarlos
  // filtran por posición de precio. Es el único filtro de posición: ya no hay desplegable.
  function resumenPrecios() {
    const base = filtrar(["posicion"]);
    const pis = base.map(posInfo), con = pis.filter(pi => pi.has);
    const n = t => pis.filter(pi => pi.has && pi.texto === t).length;
    const prom = con.length ? Math.round(con.reduce((s, pi) => s + pi.diff, 0) / con.length) : null;
    const k = (num, lbl, pos, tono, tit) => `<${pos ? `button data-pos="${pos}"` : "div"} class="mh-kpi ${pos && (state.posicion || "") === (pos === "*" ? "" : pos) ? "on" : ""}"${tit ? ` title="${tit}"` : ""}>
      <b class="${num === "—" || num === 0 ? "cero" : tono || ""}">${num}</b><span>${lbl}</span></${pos ? "button" : "div"}>`;
    $("#resKpis").innerHTML =
      k(base.length, "seleccionadas", "*") +
      k(n("Leuk más barato"), "Leuk más barato", "Leuk más barato", "ok") +
      k(n("Precio similar"), "precio similar", "Precio similar") +
      k(n("Leuk más caro"), "Leuk más caro", "Leuk más caro", "no") +
      (pis.length - con.length ? k(pis.length - con.length, "sin precio del competidor", "Sin precio comp.") : "") +
      k(prom != null ? (prom > 0 ? "+" : "") + prom + "%" : "—", "diferencia promedio", null, prom > 0 ? "ok" : "no", "Relativa al precio del competidor: + = Leuk más barato");
    $("#resKpis").querySelectorAll("[data-pos]").forEach(b => b.onclick = () => { state.posicion = b.dataset.pos === "*" ? "" : (state.posicion === b.dataset.pos ? "" : b.dataset.pos); state.page = 0; renderTabla(); });
  }
  /* ---- Tablero de Comparaciones: mapa familia×competidor, distribución, dispersión, casos a revisar y tabla ---- */
  const PAGINA = 15, EXPANDIDAS = new Set();
  const fmtN = n => (Math.round(n * 10) / 10).toLocaleString("es-AR");
  const fmtDif = d => (d > 0 ? "+" : "") + (Math.round(d * 10) / 10).toLocaleString("es-AR") + "%";
  const esc2 = t => String(t == null ? "" : t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Diverging: verde (Leuk más barato) ← gris neutro → rojo (Leuk más caro). La intensidad sigue a |dif|; el número siempre va escrito.
  const tinteDif = d => d == null ? "transparent" : Math.abs(d) <= 3 ? "var(--line)" : `color-mix(in srgb, var(${d > 0 ? "--ok" : "--no"}) ${Math.round(18 + Math.min(Math.abs(d), 100) / 100 * 50)}%, var(--card))`;
  const tonoVar = t => ({ no: "var(--no)", no2: "color-mix(in srgb, var(--no) 55%, var(--card))", sim: "#b9b4a6", ok2: "color-mix(in srgb, var(--ok) 55%, var(--card))", ok: "var(--ok)" }[t]);
  // un solo tooltip para todo el tablero
  function tip(html, ev) {
    let t = document.getElementById("cdTip");
    if (!t) { t = el("div", "cd-tip"); t.id = "cdTip"; document.body.appendChild(t); }
    if (!html) { t.style.display = "none"; return; }
    t.innerHTML = html; t.style.display = "block";
    const w = t.offsetWidth, h = t.offsetHeight;
    t.style.left = Math.max(8, Math.min(innerWidth - w - 8, ev.clientX + 14)) + "px";
    t.style.top = Math.max(8, Math.min(innerHeight - h - 8, ev.clientY + 14)) + "px";
  }
  const cdCard = (tit, sub, body, cls) => { const c = el("section", "cd-card " + (cls || "")); c.innerHTML = `<header><h3>${tit}</h3>${sub ? `<p>${sub}</p>` : ""}</header>`; c.appendChild(body); return c; };
  const setF = o => { Object.assign(state, o, { page: 0 }); buildFilters(); renderTabla(); };

  function cardMapa() {
    const base = filtrar(["familia", "marca"]).map(a => ({ f: famDe(a), m: a.marca, d: posInfo(a).diff })).filter(x => x.d != null);
    const marcas = MARCAS.filter(m => base.some(x => x.m === m));
    const fams = {}; base.forEach(x => { (fams[x.f] = fams[x.f] || []).push(x); });
    const avg = xs => xs.length ? xs.reduce((s, x) => s + x.d, 0) / xs.length : null;
    const filas = Object.entries(fams).map(([f, xs]) => ({ f, xs, prom: avg(xs) })).sort((a, b) => a.prom - b.prom);
    const box = el("div", "cd-mapa");
    box.style.setProperty("--cols", marcas.length);
    if (!filas.length) { box.innerHTML = `<div class="empty-mini">Sin comparaciones con precio para armar el mapa.</div>`; return cdCard("Dónde estoy caro y dónde barato", "", box, "cd-ancho"); }
    const celda = (xs, f, m, extra) => {
      if (!xs.length) return `<span class="cd-cell vacio">—</span>`;
      const d = avg(xs), sel = (state.familia === f && state.marca === m) ? " sel" : "";
      return `<button class="cd-cell${sel}${extra || ""}" style="background:${tinteDif(d)}" data-f="${esc2(f)}" data-m="${esc2(m || "")}" data-tip="<b>${esc2(f)}</b>${m ? " · " + esc2(m) : ""}<br>${fmtDif(d)} promedio · ${xs.length} comparación${xs.length === 1 ? "" : "es"}<br><span>${d > 3 ? "Leuk más barato" : d < -3 ? "Leuk más caro" : "Precio similar"}</span>">${fmtDif(d)}<small>${xs.length}</small></button>`;
    };
    let h = `<div class="cd-h"></div>` + marcas.map(m => `<button class="cd-h cd-hm${state.marca === m ? " sel" : ""}" data-m="${esc2(m)}">${esc2(m)}</button>`).join("") + `<div class="cd-h cd-todas">Todas</div>`;
    filas.forEach(r => {
      h += `<button class="cd-h cd-hf${state.familia === r.f ? " sel" : ""}" data-f="${esc2(r.f)}">${esc2(r.f)} <small>${r.xs.length}</small></button>`;
      h += marcas.map(m => celda(r.xs.filter(x => x.m === m), r.f, m)).join("");
      h += celda(r.xs, r.f, "", " tot");
    });
    box.innerHTML = h;
    box.style.gridTemplateColumns = `minmax(110px,1.1fr) repeat(${marcas.length + 1}, minmax(64px,1fr))`;
    box.onclick = ev => {
      const b = ev.target.closest("button"); if (!b) return;
      const f = b.dataset.f, m = b.dataset.m;
      if (b.classList.contains("cd-cell")) setF(state.familia === f && (state.marca || "") === m ? { familia: "", marca: "" } : { familia: f, marca: m });
      else if (f !== undefined) setF({ familia: state.familia === f ? "" : f });
      else setF({ marca: state.marca === m ? "" : m });
    };
    const leyenda = el("div", "cd-leyenda", `<span><i style="background:${tinteDif(60)}"></i>Leuk más barato</span><span><i style="background:var(--line)"></i>similar (±3%)</span><span><i style="background:${tinteDif(-60)}"></i>Leuk más caro</span><em>Diferencia promedio de precio neto · el número chico es la cantidad · tocá una celda para filtrar</em>`);
    const w = el("div"); w.appendChild(box); w.appendChild(leyenda);
    return cdCard("Dónde estoy caro y dónde barato", "Familia × competidor", w, "cd-ancho");
  }

  function cardDistribucion() {
    const pis = filtrar(["rango"]).map(posInfo).filter(pi => pi.has);
    const cnt = RANGOS.map(r => pis.filter(pi => r.f(pi.diff)).length), max = Math.max(1, ...cnt);
    const box = el("div", "cd-dist");
    box.innerHTML = RANGOS.map((r, i) => `<button class="cd-dr${state.rango === r.k ? " sel" : ""}" data-k="${r.k}" data-tip="<b>${r.t}</b> (${r.sub})<br>${cnt[i]} comparación${cnt[i] === 1 ? "" : "es"}">
      <span class="cd-dl">${r.t}<small>${r.sub}</small></span>
      <span class="cd-db"><i style="width:${cnt[i] / max * 100}%;background:${tonoVar(r.tono)}"></i></span><b>${cnt[i]}</b></button>`).join("");
    box.onclick = ev => { const b = ev.target.closest(".cd-dr"); if (b) setF({ rango: state.rango === b.dataset.k ? "" : b.dataset.k }); };
    return cdCard("Cuánto cambia el precio", "Cantidad de comparaciones por rango de diferencia", box);
  }

  function cardDispersion(f) {
    const pts = f.map(a => ({ a, pi: posInfo(a) })).filter(x => x.pi.has && x.pi.leukNet > 0 && x.pi.compNet > 0);
    const box = el("div", "cd-disp");
    if (!pts.length) { box.innerHTML = `<div class="empty-mini">Sin datos de precio para graficar.</div>`; return cdCard("Leuk vs competidor", "", box); }
    const W = 520, H = 330, L = 46, R = 14, T = 12, B = 38;
    const vals = pts.flatMap(x => [x.pi.leukNet, x.pi.compNet]);
    const lo = Math.min(...vals) * 0.8, hi = Math.max(...vals) * 1.25, ll = Math.log(lo), lh = Math.log(hi);
    const X = v => L + (Math.log(v) - ll) / (lh - ll) * (W - L - R), Y = v => H - B - (Math.log(v) - ll) / (lh - ll) * (H - B - T);
    const ticks = [1, 3, 10, 30, 100, 300, 1000, 3000].filter(t => t >= lo && t <= hi);
    let g = ticks.map(t => `<line class="cd-gl" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><line class="cd-gl" y1="${T}" y2="${H - B}" x1="${X(t)}" x2="${X(t)}"/>
      <text class="cd-ax" x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${t}</text><text class="cd-ax" x="${X(t)}" y="${H - B + 16}" text-anchor="middle">${t}</text>`).join("");
    g += `<line class="cd-diag" x1="${X(lo)}" y1="${Y(lo)}" x2="${X(hi)}" y2="${Y(hi)}"/>
      <text class="cd-zona" x="${L + 8}" y="${T + 14}">↑ Leuk más caro</text><text class="cd-zona" x="${W - R - 8}" y="${H - B - 8}" text-anchor="end">Leuk más barato ↓</text>
      <text class="cd-ax cd-tit" x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">Precio neto del competidor (US$)</text>
      <text class="cd-ax cd-tit" transform="translate(11 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">Precio neto Leuk (US$)</text>`;
    const col = c => c === "p-cheap" ? "var(--ok)" : c === "p-exp" ? "var(--no)" : "#8a8c82";
    g += pts.map((x, i) => `<g class="cd-pt" data-i="${i}"><circle r="11" cx="${X(x.pi.compNet)}" cy="${Y(x.pi.leukNet)}" fill="transparent"/><circle class="cd-dot" r="5" cx="${X(x.pi.compNet)}" cy="${Y(x.pi.leukNet)}" fill="${col(x.pi.cls)}"/></g>`).join("");
    const n = c => pts.filter(x => x.pi.cls === c).length;
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Precio neto de Leuk contra el del competidor, un punto por comparación">${g}</svg>
      <div class="cd-leyenda"><span><i style="background:var(--ok)"></i>Leuk más barato (${n("p-cheap")})</span><span><i style="background:#8a8c82"></i>similar (${n("p-sim")})</span><span><i style="background:var(--no)"></i>Leuk más caro (${n("p-exp")})</span><em>Escala logarítmica · lo que se aleja de la diagonal es lo más distinto</em></div>`;
    const svg = box.querySelector("svg");
    const ptDe = ev => { const gp = ev.target.closest(".cd-pt"); return gp ? pts[+gp.dataset.i] : null; };
    svg.onmousemove = ev => { const x = ptDe(ev); if (!x) return tip(null); const a = x.a;
      tip(`<b>${esc2(a.leukNombre)}</b> <span>${esc2(a.leukSku)}</span><br>vs ${esc2(a.marca)} ${esc2(a.equivNombre || "")}<br>Leuk US$ ${x.pi.leukNet.toLocaleString("es-AR")} · comp. US$ ${x.pi.compNet.toLocaleString("es-AR")}<br><b>${fmtDif(x.pi.diff)}</b> <span>${x.pi.texto}</span><br><span>Tocá para verlo en la tabla</span>`, ev); };
    svg.onmouseleave = () => tip(null);
    svg.onclick = ev => { const x = ptDe(ev); if (x) { tip(null); setF({ q: String(x.a.leukSku) }); } };
    return cdCard("Leuk vs competidor", "Un punto por comparación, precio neto", box);
  }

  function cardAtipicos(f) {
    const xs = f.map(a => ({ a, pi: posInfo(a) })).filter(x => x.pi.has && (x.pi.diff > PRICE_HI || x.pi.diff < PRICE_LO)).sort((x, y) => Math.abs(y.pi.diff) - Math.abs(x.pi.diff));
    const box = el("div", "cd-atip");
    if (!xs.length) box.innerHTML = `<div class="empty-mini">✓ Ninguna fuera de rango en lo que estás viendo.</div>`;
    else box.innerHTML = xs.slice(0, 6).map((x, i) => `<button class="cd-at" data-i="${i}"><span class="cd-atn"><b>${esc2(x.a.leukNombre)}</b> <small>${esc2(x.a.leukSku)}</small><br><em>vs ${esc2(x.a.marca)} ${esc2(x.a.equivNombre || "")}</em></span>
      <span class="cd-pill ${x.pi.diff > 0 ? "ok" : "no"}">${fmtDif(x.pi.diff)}</span></button>`).join("") + (xs.length > 6 ? `<div class="cd-mas">y ${xs.length - 6} más — ordená la tabla por diferencia para verlas</div>` : "");
    box.onclick = ev => { const b = ev.target.closest(".cd-at"); if (b) setF({ q: String(xs[+b.dataset.i].a.leukSku) }); };
    return cdCard(`Casos para revisar${xs.length ? ` <span class="leuk-fam">(${xs.length})</span>` : ""}`, `Más de ${PRICE_HI}% más barato o ${Math.abs(PRICE_LO)}% más caro: puede ser otra gama o un dato mal cargado`, box, "cd-ancho");
  }

  function chipsFiltros() {
    const defs = [["set", "Selección"], ["familia", "Familia"], ["marca", "Competidor"], ["nivel", "Nivel"], ["vertical", "Vertical"], ["posicion", "Posición"], ["q", "Búsqueda"]];
    const act = defs.filter(([k]) => state[k]).map(([k, l]) => `<button class="cd-chip" data-k="${k}">${l}: <b>${esc2(k === "set" ? state.set.label : state[k])}</b> ✕</button>`);
    if (state.rango) act.push(`<button class="cd-chip" data-k="rango">Rango: <b>${RANGOS.find(r => r.k === state.rango).t}</b> ✕</button>`);
    const box = el("div", "cd-chips" + (act.length ? "" : " hidden"));
    box.innerHTML = act.join("") + (act.length > 1 ? `<button class="cd-chip limpiar" data-k="*">Quitar todos</button>` : "");
    box.onclick = ev => { const b = ev.target.closest(".cd-chip"); if (!b) return;
      setF(b.dataset.k === "*" ? { marca: "", nivel: "", vertical: "", familia: "", posicion: "", rango: "", q: "", set: "" } : { [b.dataset.k]: "" }); };
    return box;
  }

  function tablaComparaciones(f) {
    const box = el("section", "cd-card cd-tabla-card");
    const npag = Math.max(1, Math.ceil(f.length / PAGINA));
    state.page = Math.min(state.page || 0, npag - 1);
    const ini = state.page * PAGINA, vis = f.slice(ini, ini + PAGINA);
    const S = state.sort || {}, flecha = k => S.k === k ? (S.dir > 0 ? " ▲" : " ▼") : "";
    const th = (k, t, cls) => `<button class="cd-th ${cls || ""}" data-k="${k}">${t}${flecha(k)}</button>`;
    let h = `<header><h3>Detalle de comparaciones <span class="leuk-fam">(${f.length})</span></h3></header>
      <div class="cd-tabla"><div class="cd-tr cd-head">${th("sku", "Producto Leuk")}${th("marca", "Competidor")}${th("leuk", "Leuk neto", "num")}${th("comp", "Comp. neto", "num")}${th("dif", "Diferencia", "num")}<span></span></div>`;
    if (!vis.length) h += `<div class="empty-mini" style="padding:18px">Nada coincide con lo que filtraste.</div>`;
    vis.forEach(a => {
      const pi = posInfo(a), abierta = EXPANDIDAS.has(a.key);
      h += `<div class="cd-fila" data-key="${esc2(a.key)}"><div class="cd-tr cd-dato">
        <span class="cd-prod">${imgTag(a.leukImagen, "sm")}<span><b>${esc2(a.leukNombre || "")}</b><small>${esc2(a.leukSku)} · ${esc2(famDe(a))}</small></span></span>
        <span class="cd-prod cd-comp"><span><b>${esc2(a.marca)}</b><small>${esc2(a.equivNombre || a.equivFamilia || "")}${a.manual ? " · sugerido" : ""}</small></span></span>
        <span class="num"><span class="cd-m">Leuk </span>${pi.has ? fmtUsd(pi.leukNet) : "—"}</span>
        <span class="num"><span class="cd-m">Comp. </span>${pi.has ? fmtUsd(pi.compNet) : "—"}</span>
        <span class="num">${pi.has ? `<span class="cd-pill ${pi.cls === "p-cheap" ? "ok" : pi.cls === "p-exp" ? "no" : "sim"}" title="${diffLabel(pi.diff)} (base: precio del competidor)">${fmtDif(pi.diff)}${priceAlert(pi.diff)}</span>` : `<span class="cd-pill sim">s/ precio</span>`}</span>
        <span class="cd-acc"><button class="cd-exp${abierta ? " abierto" : ""}" title="Ver detalle" aria-expanded="${abierta}">▾</button>${puedeBorrar(a) ? `<button class="cd-rm" title="Quitar">✕</button>` : ""}</span></div>
        <div class="res-body${abierta ? "" : " hidden"}"></div></div>`;
    });
    h += `</div><div class="cd-pag"><span>${f.length ? `${ini + 1}–${ini + vis.length} de ${f.length}` : ""}</span>
      <button class="btn-ghost" data-p="-1"${state.page === 0 ? " disabled" : ""}>‹ Anterior</button><b>${state.page + 1} / ${npag}</b><button class="btn-ghost" data-p="1"${state.page >= npag - 1 ? " disabled" : ""}>Siguiente ›</button></div>`;
    box.innerHTML = h;
    const llenar = fila => {   // el detalle se arma al abrir
      const a = AUTH[fila.dataset.key], body = fila.querySelector(".res-body"); if (!a || body.dataset.ok) return;
      const p = P.find(x => x.sku === a.leukSku) || { sku: a.leukSku, nombre: a.leukNombre, vertical: a.leukVertical, familia: a.leukFamilia, precio_usd: a.precioLeukUsd, imagen: a.leukImagen, ficha: {} };
      body.innerHTML = detailBody(p, findProp(a.leukSku, a.marca, a.fslug) || a, { header: false }); body.dataset.ok = 1;
    };
    box.querySelectorAll(".cd-fila").forEach(fila => { if (EXPANDIDAS.has(fila.dataset.key)) llenar(fila); });
    box.onclick = ev => {
      const t = ev.target.closest(".cd-th");
      if (t) { const k = t.dataset.k; state.sort = S.k === k ? { k, dir: -S.dir } : { k, dir: k === "dif" ? -1 : 1 }; state.page = 0; return renderTabla(); }
      const pg = ev.target.closest("[data-p]"); if (pg) { state.page += +pg.dataset.p; return renderTabla(); }
      const fila = ev.target.closest(".cd-fila"); if (!fila) return;
      const key = fila.dataset.key;
      if (ev.target.closest(".cd-rm")) { const a = AUTH[key]; if (a && puedeBorrar(a)) { delete AUTH[key]; EXPANDIDAS.delete(key); save(); sbDel(key); renderTabla(); } return; }
      if (ev.target.closest(".res-body")) return;
      const open = !EXPANDIDAS.has(key); open ? EXPANDIDAS.add(key) : EXPANDIDAS.delete(key);
      fila.querySelector(".res-body").classList.toggle("hidden", !open); fila.querySelector(".cd-exp").classList.toggle("abierto", open);
      if (open) llenar(fila);
    };
    return box;
  }

  function sincFiltros() {
    $("#filters").querySelectorAll("select,input").forEach(x => { const v = state[x.dataset.k]; if (x.dataset.k !== "orden" && x.value !== (v || "")) x.value = v || ""; });
  }
  function renderTabla() {
    const f = authList();
    const total = Object.keys(AUTH).length;
    $("#resSub").innerHTML = `<span>Comparación por <b>precio neto</b> · Leuk ${CFG.leukTier === "cliente" ? "Cliente" : "Partner"} −${descLeuk()}% · ${f.length === total ? `${total} seleccionada${total === 1 ? "" : "s"}` : `mostrando ${f.length} de ${total}`}</span>`;
    const cont = $("#tabla"); cont.innerHTML = "";
    sincFiltros(); resumenPrecios();
    if (!total) {
      cont.innerHTML = `<div class="empty"><div class="big">✓</div>Todavía no seleccionaste ninguna comparación.<br>Andá a <b>Catálogo</b>, buscá un producto y tocá <b>＋ Seleccionar</b> en los equivalentes que sirvan.</div>`;
      return;
    }
    cont.appendChild(chipsFiltros());
    const dash = el("div", "cd-dash");
    [cardMapa(), cardDistribucion(), cardDispersion(f), cardAtipicos(f)].forEach(c => dash.appendChild(c));
    cont.appendChild(dash);
    cont.appendChild(tablaComparaciones(f));
    cont.querySelectorAll("[data-tip]").forEach(n => { n.onmousemove = ev => tip(n.dataset.tip, ev); n.onmouseleave = () => tip(null); });
  }
  const csv = s => `"${(s || "").toString().replace(/"/g, '""')}"`;
  function exportCSV() {
    const f = authList();
    const H = ["SKU_Leuk", "Producto_Leuk", "Precio_Leuk_lista", "Precio_Leuk_neto", "Competidor", "Equivalente", "Nivel", "Desc_comp%", "Precio_comp_lista", "Precio_comp_neto", "Dif_neto%", "Dif_lista%", "Autorizo"];
    const lines = [H.join(",")];
    f.forEach(a => { const pi = posInfo(a); lines.push([a.leukSku, csv(a.leukNombre), a.precioLeukUsd, a.precioLeukNeto, a.marca, csv(a.equivNombre), a.veredicto, a.descComp != null ? a.descComp : "", a.precioCompUsd != null ? a.precioCompUsd : "", a.precioCompNeto != null ? a.precioCompNeto : "", pi.has ? pi.diff : "", a.diferencia_lista != null ? a.diferencia_lista : "", csv(a.autor)].join(",")); });
    dl(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }), "benchmark_leuk_autorizadas.csv");
  }
  // Exporta las comparaciones seleccionadas a EXCEL: una hoja por competidor, con producto Leuk y
  // competidor, precios de lista y con descuento (neto) de ambos, y la diferencia. Nombre de archivo
  // con el competidor. Usa la config de descuentos vigente (mismos números que muestra la app).
  function exportXLSX() {
    if (typeof XLSX === "undefined") { alert("No se pudo cargar el generador de Excel."); return; }
    const f = authList();
    if (!f.length) { alert("No hay comparaciones seleccionadas para exportar."); return; }
    const HEAD = ["Competidor", "Producto Leuk", "SKU Leuk", "Producto competidor", "Equivalencia",
      "Lista Leuk (US$)", "Desc. Leuk %", "Neto Leuk (US$)",
      "Lista competidor (US$)", "Desc. comp. %", "Neto competidor (US$)",
      "Diferencia % (vs comp.)", "Lectura"];
    const rowOf = a => {
      const pi = posInfo(a);
      return [a.marca, a.leukNombre, a.leukSku, a.equivNombre, a.veredicto,
        a.precioLeukUsd ?? "", descLeuk(), netLeuk(a.precioLeukUsd) ?? "",
        a.precioCompUsd ?? "", descComp(a.marca), netComp(a.precioCompUsd, a.marca) ?? "",
        pi.has ? pi.diff : "", pi.has ? diffLabel(pi.diff) : ""];
    };
    const clean = s => (s || "Competidor").toString().replace(/[\\/?*\[\]:]/g, " ").trim().slice(0, 31) || "Competidor";
    const marcas = [...new Set(f.map(a => a.marca))].sort();
    const wb = XLSX.utils.book_new();
    marcas.forEach(m => {
      const rows = f.filter(a => a.marca === m).map(rowOf);
      const ws = XLSX.utils.aoa_to_sheet([HEAD, ...rows]);
      ws["!cols"] = [13, 30, 12, 30, 15, 14, 11, 14, 16, 12, 17, 16, 34].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, clean(m));
    });
    const base = marcas.length === 1 ? `Benchmark_Leuk_vs_${clean(marcas[0]).replace(/\s+/g, "_")}` : "Benchmark_Leuk_competencia";
    XLSX.writeFile(wb, base + ".xlsx");
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
    // Margen (sólo admin/líder con costo cargado): con tu precio neto y si igualás al competidor.
    const vNet = netLeuk(p.precio_usd);
    const cNet = cLista != null ? netComp(cLista, e.marca) : null;
    const mgL = margen(p.sku, vNet), mgV = margen(p.sku, cNet);
    const margenBox = mgL ? `<div class="margen-box"><h3>Margen · sólo lo ves vos</h3>
      <div class="margen-row"><span>Con tu precio neto <span class="leuk-fam">(US$ ${Math.round(vNet)})</span></span><b class="${mgL.neg ? "neg" : ""}">${margenTxt(mgL)}${mgL.neg ? " ⚠" : ""}</b></div>
      ${mgV ? `<div class="margen-row"><span>Si igualás a ${e.marca} <span class="leuk-fam">(US$ ${Math.round(cNet)})</span></span><b class="${mgV.neg ? "neg" : ""}">${margenTxt(mgV)}${mgV.neg ? " ⚠" : ""}</b></div>` : ""}
      <div class="margen-note">Costo US$ ${mgL.costo.toLocaleString("es-AR")}</div></div>` : "";
    return `${opts.header !== false ? `<div class="leuk-sku">LEUK ${p.sku} · ${p.vertical || ""} ${p.familia || ""}</div>
      <h2>${p.nombre || ""} <span class="vs-lbl">vs</span> ${e.marca} · ${eNombre}</h2>
      <div>${badge(m.veredicto || e.veredicto)} &nbsp; ${cc.has ? diffHtml(cc.diff) + ' <span class="leuk-fam">' + cc.texto + " (neto)</span>" : '<span class="leuk-fam">sin precio comp.</span>'}</div>` : ""}
      ${(p && e.fslug) ? `<div style="margin:10px 0">${authBtn(p, e)}</div>` : ""}
      ${margenBox}
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
      <div class="opp-price"><span class="res-posicion ${pi.cls}" style="display:inline-flex" title="${diffLabel(pi.diff)} (base: precio del competidor)"><span class="rp-text">${pi.diff > 0 ? "+" : ""}${pi.diff}%</span></span>
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
  /* Lo que el equipo le enseñó al motor. Agrupado por motivo, porque el motivo es lo que
     después se traduce en un ajuste del matching (categoría, gate técnico, peso visual). */
  function descartesSection() {
    const pares = Object.values(NOPAR), ents = Object.values(NOENT);
    const todos = pares.concat(ents);
    if (!todos.length) return null;
    const porMotivo = {};
    todos.forEach(o => { const m = o.motivo || "otro"; (porMotivo[m] = porMotivo[m] || []).push(o); });
    const orden = Object.entries(porMotivo).sort((a, b) => b[1].length - a[1].length);
    const sec = el("div", "dash-sec");
    sec.innerHTML = `<h3>✕ Descartes <span class="leuk-fam">· ${todos.length}</span></h3>
      <div class="fam-hint">Comparaciones que el equipo marcó como <b>no comparables</b>. El motor deja de proponerlas, y el motivo es lo que después permite corregir el criterio de fondo. ${ents.length ? `<b>${ents.length}</b> producto(s) quedaron fuera de <b>todo</b> el benchmark.` : ""}</div>
      <div class="desc-motivos">${orden.map(([m, arr]) => `
        <div class="desc-motivo">
          <div class="desc-motivo-h"><b>${MOTIVOS[m] || m}</b><span class="leuk-fam">${arr.length}</span></div>
          <div class="desc-motivo-l">${arr.slice(0, 6).map(o => `<span class="desc-chip">${o.sku ? "LEUK " + o.sku + " ✕ " : "✕ "}${o.marca} ${(o.nombre || o.familia || "")}</span>`).join("")}${arr.length > 6 ? `<span class="leuk-fam">y ${arr.length - 6} más</span>` : ""}</div>
        </div>`).join("")}</div>`;
    return sec;
  }
  /* ---- Insights: hallazgos calculados sobre lo seleccionado, cada uno con su evidencia y un siguiente paso ---- */
  const GAP_OBJ = { v: 10 };                              // ventaja que se deja al subir precio (% por debajo del competidor)
  const medianaDe = arr => { const s = [...arr].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
  const promDe = arr => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;
  const pct0 = n => Math.round(n);
  const keysDe = xs => new Set(xs.map(x => x.a.key));
  // salta a Comparaciones con un recorte ya aplicado
  function verEnComparaciones(f) {
    Object.assign(state, { marca: "", nivel: "", vertical: "", familia: "", posicion: "", rango: "", q: "", set: "", page: 0, sort: null }, f);
    goToPage("resultados");
  }
  const inBar = (lbl, frac, txt, tono) => `<div class="in-bar"><span class="in-bl">${esc2(lbl)}</span><span class="in-bt"><i style="width:${Math.max(frac * 100, frac > 0 ? 2 : 0)}%;background:${tonoVar(tono || "sim")}"></i></span><b>${txt}</b></div>`;
  const inStack = (b, s, c, tit) => { const t = b + s + c || 1;
    const seg = (n, col, l) => n ? `<i style="flex:${n};background:${col}" title="${l}: ${n}">${n / t > .12 ? n : ""}</i>` : "";
    return `<div class="in-stack" title="${esc2(tit || "")}">${seg(c, "var(--no)", "Leuk más caro")}${seg(s, "#b9b4a6", "Similar")}${seg(b, "var(--ok)", "Leuk más barato")}</div>`; };

  /* ---- Insights v2: tablero visual. Cada tarjeta tiene su propio gráfico y un número protagonista ---- */
  const cuantil = (arr, q) => { const s = [...arr].sort((a, b) => a - b); if (!s.length) return null; const p = (s.length - 1) * q, i = Math.floor(p); return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (p - i); };
  const clampD = v => Math.max(-100, Math.min(100, v));
  const bigNum = (n, l, tono) => `<div class="in-big ${tono || ""}"><b>${n}</b><span>${l}</span></div>`;
  function inCard(cls, ic, tit, sub) {
    const c = el("article", "in-card " + cls);
    c.innerHTML = `<header><span class="in-ic">${ic}</span><div><h3>${tit}</h3>${sub ? `<p>${sub}</p>` : ""}</div></header><div class="in-cb"></div>`;
    return c;
  }
  const cbDe = c => c.querySelector(".in-cb");
  const donut = (frac, tono, centro, sub) => { const C = 2 * Math.PI * 40;
    return `<div class="in-donut"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="#f2f0ea" stroke-width="13"/><circle cx="50" cy="50" r="40" fill="none" stroke="${tonoVar(tono)}" stroke-width="13" stroke-dasharray="${frac * C} ${C}" transform="rotate(-90 50 50)" stroke-linecap="butt"/></svg><div><b>${centro}</b><small>${sub}</small></div></div>`; };

  // 0. Lectura general: veredicto + histograma de la diferencia de precio
  function cardHero(xs) {
    const dif = xs.map(x => x.pi.diff), med = medianaDe(dif), prom = promDe(dif);
    const nB = xs.filter(x => x.pi.cls === "p-cheap").length, nC = xs.filter(x => x.pi.cls === "p-exp").length, nS = xs.length - nB - nC;
    const raros = xs.filter(x => x.pi.diff > PRICE_HI || x.pi.diff < PRICE_LO).length;
    const c = inCard("in-full in-hero " + (med > 3 ? "in-ok" : med < -3 ? "in-no" : ""), "", "", "");
    const frase = Math.abs(med) <= 3 ? "Leuk está al mismo precio que su equivalente" : `Leuk está <b>${pct0(Math.abs(med))}% ${med > 0 ? "por debajo" : "por encima"}</b> del precio de su equivalente`;
    // histograma, bins de 10 puntos entre −100 y +100 (los extremos juntan todo lo que se pasa)
    const W = 620, H = 210, L = 8, R = 8, T = 22, B = 30, NB = 20, bw = (W - L - R) / NB;
    const bins = Array.from({ length: NB }, () => []);
    xs.forEach(x => { bins[Math.min(NB - 1, Math.floor((clampD(x.pi.diff) + 100) / 10))].push(x); });
    const mx = Math.max(1, ...bins.map(b => b.length)), X = v => L + (clampD(v) + 100) / 200 * (W - L - R);
    let g = `<rect x="${X(-3)}" y="${H - B}" width="${X(3) - X(-3)}" height="5" rx="2" fill="#b9b4a6"><title>Precio similar (±3%)</title></rect>`;
    g += bins.map((b, i) => { const h = b.length / mx * (H - T - B), lo = -100 + i * 10, hi = lo + 10, mid = lo + 5;
      return `<g class="in-bin" data-b="${i}"><rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent"/><rect x="${L + i * bw + 1}" y="${H - B - h}" width="${bw - 2}" height="${h}" rx="3" fill="${Math.abs(mid) <= 3 ? "#b9b4a6" : mid > 0 ? "var(--ok)" : "var(--no)"}" opacity="${b.length ? 1 : 0}"/>${b.length ? `<text class="cd-ax" x="${L + i * bw + bw / 2}" y="${H - B - h - 4}" text-anchor="middle">${b.length}</text>` : ""}</g>`; }).join("");
    g += [-100, -50, 0, 50, 100].map(v => `<text class="cd-ax" x="${X(v)}" y="${H - B + 14}" text-anchor="${v === -100 ? "start" : v === 100 ? "end" : "middle"}">${v === -100 ? "≤ −100%" : v === 100 ? "≥ +100%" : (v > 0 ? "+" : "") + v + "%"}</text>`).join("");
    g += `<line x1="${X(med)}" x2="${X(med)}" y1="${T - 6}" y2="${H - B}" stroke="var(--ink)" stroke-width="2" stroke-dasharray="4 3"/><text class="in-med" x="${X(med)}" y="${T - 9}" text-anchor="middle">mediana ${fmtDif(pct0(med))}</text>`;
    g += `<text class="cd-zona" x="${L}" y="${H - 2}">← Leuk más caro</text><text class="cd-zona" x="${W - R}" y="${H - 2}" text-anchor="end">Leuk más barato →</text>`;
    cbDe(c).innerHTML = `<div class="in-hero-g">
      <div class="in-hero-l"><span class="in-kick">Lectura general</span><div class="in-hero-n ${med > 3 ? "ok" : med < -3 ? "no" : ""}">${fmtDif(pct0(med))}</div><p>${frase}.</p>
        ${inStack(nB, nS, nC)}<div class="cd-leyenda"><span><i style="background:var(--ok)"></i>${nB} más baratos</span><span><i style="background:#b9b4a6"></i>${nS} similar</span><span><i style="background:var(--no)"></i>${nC} más caros</span></div>
        <small class="in-nota">El promedio es ${fmtDif(pct0(prom))}${raros ? `: lo mueven ${raros} comparaciones extremas (otra gama o dato mal cargado). Por eso uso la mediana.` : "."}</small></div>
      <div class="in-hero-r"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Distribución de la diferencia de precio">${g}</svg><small class="in-nota">Cada barra: cuántas comparaciones caen en ese rango de diferencia. Tocá una barra para verlas.</small></div></div>`;
    const svg = c.querySelector("svg"), binDe = ev => { const gb = ev.target.closest(".in-bin"); return gb ? +gb.dataset.b : null; };
    svg.onmousemove = ev => { const i = binDe(ev); if (i == null) return tip(null); const lo = -100 + i * 10; tip(`<b>${bins[i].length} comparación${bins[i].length === 1 ? "" : "es"}</b><br>${i === 0 ? "más de 100% más caro" : i === NB - 1 ? "más de 100% más barato" : `entre ${fmtDif(lo)} y ${fmtDif(lo + 10)}`}`, ev); };
    svg.onmouseleave = () => tip(null);
    svg.onclick = ev => { const i = binDe(ev); if (i != null && bins[i].length) { tip(null); verEnComparaciones({ set: { label: `Diferencia ${i === 0 ? "< −100" : i === NB - 1 ? "> +100" : fmtDif(-100 + i * 10) + " a " + fmtDif(-90 + i * 10)} (${bins[i].length})`, keys: keysDe(bins[i]) } }); } };
    return c;
  }

  // 1. Mapa de acción por familia: ventaja típica (x) vs qué tan pareja es la línea (y)
  function cardMapaAccion(xs) {
    const porF = {}; xs.forEach(x => { (porF[famDe(x.a)] = porF[famDe(x.a)] || []).push(x); });
    const fs = Object.entries(porF).filter(([, v]) => v.length >= 3).map(([f, v]) => { const d = v.map(x => x.pi.diff); return { f, n: v.length, med: medianaDe(d), iqr: cuantil(d, .75) - cuantil(d, .25) }; });
    if (fs.length < 2) return null;
    const CORTE = 40, ymax = Math.max(80, ...fs.map(r => r.iqr)) * 1.1;
    const subir = fs.filter(r => r.med > UMBRAL && r.iqr <= CORTE), bajar = fs.filter(r => r.med < -UMBRAL && r.iqr <= CORTE), partida = fs.filter(r => r.iqr > CORTE);
    const lista = a => a.map(r => esc2(r.f)).join(", ");
    const c = inCard("", "🗺️", "Mapa de acción por familia", `${subir.length ? `<b>Subir precio:</b> ${lista(subir)}. ` : ""}${bajar.length ? `<b>Bajar o justificar:</b> ${lista(bajar)}. ` : ""}${partida.length ? `<b>Revisar de a uno:</b> ${lista(partida)}.` : ""}` || "Cada burbuja es una familia; el tamaño es la cantidad de comparaciones.");
    const W = 520, H = 330, L = 14, R = 14, T = 14, B = 34, X = v => L + (clampD(v) + 100) / 200 * (W - L - R), Y = v => H - B - v / ymax * (H - B - T);
    let g = `<rect x="${X(UMBRAL)}" y="${Y(CORTE)}" width="${X(100) - X(UMBRAL)}" height="${H - B - Y(CORTE)}" fill="color-mix(in srgb, var(--ok) 9%, var(--card))"/><rect x="${X(-100)}" y="${Y(CORTE)}" width="${X(-UMBRAL) - X(-100)}" height="${H - B - Y(CORTE)}" fill="color-mix(in srgb, var(--no) 9%, var(--card))"/>`;
    g += `<line class="cd-gl" x1="${X(0)}" x2="${X(0)}" y1="${T}" y2="${H - B}"/><line class="cd-diag" x1="${L}" x2="${W - R}" y1="${Y(CORTE)}" y2="${Y(CORTE)}"/>`;
    g += `<text class="cd-zona" x="${W - R - 4}" y="${H - B - 8}" text-anchor="end">SUBIR PRECIO</text><text class="cd-zona" x="${L + 4}" y="${H - B - 8}">BAJAR / JUSTIFICAR</text><text class="cd-zona" x="${L + 4}" y="${Y(CORTE) - 7}">↑ LÍNEA PARTIDA: REVISAR DE A UNO</text>`;
    g += [-100, -50, 0, 50, 100].map(v => `<text class="cd-ax" x="${X(v)}" y="${H - B + 14}" text-anchor="${v === -100 ? "start" : v === 100 ? "end" : "middle"}">${v > 0 ? "+" : ""}${v}%</text>`).join("");
    g += `<text class="cd-ax cd-tit" x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">Diferencia típica (mediana) · ← más caro · más barato →</text>`;
    const rad = n => Math.min(30, 9 + Math.sqrt(n) * 3.2);
    g += [...fs].sort((a, b) => b.n - a.n).map((r, i) => { const cx = X(r.med), cy = Y(r.iqr), col = r.med > 3 ? "var(--ok)" : r.med < -3 ? "var(--no)" : "#8a8c82";
      return `<g class="in-bub" data-i="${fs.indexOf(r)}"><circle cx="${cx}" cy="${cy}" r="${rad(r.n)}" fill="${col}" fill-opacity=".78" stroke="var(--card)" stroke-width="2"/><text class="in-bl2" x="${cx}" y="${cy + rad(r.n) + 12}" text-anchor="middle">${esc2(r.f)}</text></g>`; }).join("");
    cbDe(c).innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa de acción por familia">${g}</svg><div class="cd-leyenda"><em>Altura: qué tan dispareja es la línea (rango entre cuartiles). Tamaño: cantidad de comparaciones. Tocá una burbuja para ver la familia.</em></div>`;
    const svg = cbDe(c).querySelector("svg"), bDe = ev => { const gb = ev.target.closest(".in-bub"); return gb ? fs[+gb.dataset.i] : null; };
    svg.onmousemove = ev => { const r = bDe(ev); if (!r) return tip(null); tip(`<b>${esc2(r.f)}</b> · ${r.n} comparaciones<br>Típico: ${fmtDif(pct0(r.med))}<br>Dispersión: ${pct0(r.iqr)} puntos<br><span>${r.iqr > CORTE ? "Línea partida: revisá de a uno" : r.med > UMBRAL ? "Ventaja pareja: margen para subir" : r.med < -UMBRAL ? "Caro parejo: bajar o justificar" : "Cerca del mercado"}</span>`, ev); };
    svg.onmouseleave = () => tip(null);
    svg.onclick = ev => { const r = bDe(ev); if (r) { tip(null); verEnComparaciones({ familia: r.f === "—" ? "—" : r.f }); } };
    return c;
  }

  // 2. Curva del descuento: cuántas ventajas sostenés según el descuento que le des a tu precio de lista
  function cardCurvaDescuento(xs) {
    const cnt = d => { let b = 0, c = 0; xs.forEach(x => { const v = (x.pi.compNet - x.pi.leukList * (1 - d / 100)) / x.pi.compNet * 100; if (v > 3) b++; else if (v < -3) c++; }); return { b, c }; };
    const pts = Array.from({ length: 51 }, (_, d) => ({ d, ...cnt(d) })), n = xs.length;
    const P = pts[CFG.leukPartner] || cnt(CFG.leukPartner), Cl = pts[CFG.leukCliente] || cnt(CFG.leukCliente);
    const dP = CFG.leukPartner, dC = CFG.leukCliente, por5 = dP !== dC ? (P.b - Cl.b) / (dP - dC) * 5 : 0;
    const c = inCard("", "🏷️", por5 >= 0.5 ? `Cada 5 puntos de descuento valen ~${fmtN(por5)} ventajas` : "Tu ventaja casi no depende del descuento", `Con precio Partner (−${dP}%) sos más barato en <b>${P.b}</b> productos; con precio Cliente (−${dC}%), en <b>${Cl.b}</b>.`);
    const W = 520, H = 300, L = 36, R = 16, T = 16, B = 36, X = d => L + d / 50 * (W - L - R), Y = v => H - B - v / (n || 1) * (H - B - T);
    const line = k => pts.map((p, i) => `${i ? "L" : "M"}${X(p.d).toFixed(1)} ${Y(p[k]).toFixed(1)}`).join(" ");
    let g = [0, .25, .5, .75, 1].map(f => `<line class="cd-gl" x1="${L}" x2="${W - R}" y1="${Y(n * f)}" y2="${Y(n * f)}"/><text class="cd-ax" x="${L - 6}" y="${Y(n * f) + 4}" text-anchor="end">${Math.round(n * f)}</text>`).join("");
    g += [0, 10, 20, 30, 40, 50].map(d => `<text class="cd-ax" x="${X(d)}" y="${H - B + 15}" text-anchor="middle">−${d}%</text>`).join("");
    g += `<path d="${line("b")}" fill="none" stroke="var(--ok)" stroke-width="3" stroke-linejoin="round"/><path d="${line("c")}" fill="none" stroke="var(--no)" stroke-width="3" stroke-linejoin="round"/>`;
    g += [[dP, "Partner", P], [dC, "Cliente", Cl]].map(([d, l, v]) => `<line x1="${X(d)}" x2="${X(d)}" y1="${T}" y2="${H - B}" stroke="var(--ink)" stroke-dasharray="4 3" opacity=".55"/><circle cx="${X(d)}" cy="${Y(v.b)}" r="5.5" fill="var(--ok)" stroke="var(--card)" stroke-width="2"/><circle cx="${X(d)}" cy="${Y(v.c)}" r="5.5" fill="var(--no)" stroke="var(--card)" stroke-width="2"/><text class="in-med" x="${X(d)}" y="${T - 3}" text-anchor="middle">${l}</text>`).join("");
    g += `<text class="cd-ax cd-tit" x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">Descuento sobre tu precio de lista</text><line id="cdCur" y1="${T}" y2="${H - B}" stroke="var(--olive)" stroke-width="1.5" style="display:none"/>`;
    cbDe(c).innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Productos más baratos y más caros según el descuento">${g}</svg><div class="cd-leyenda"><span><i style="background:var(--ok)"></i>productos donde Leuk es más barato</span><span><i style="background:var(--no)"></i>donde es más caro</span></div>`;
    const svg = cbDe(c).querySelector("svg"), cur = svg.querySelector("#cdCur");
    svg.onmousemove = ev => { const r = svg.getBoundingClientRect(), d = Math.max(0, Math.min(50, Math.round(((ev.clientX - r.left) / r.width * W - L) / (W - L - R) * 50))), p = pts[d];
      cur.style.display = ""; cur.setAttribute("x1", X(d)); cur.setAttribute("x2", X(d)); tip(`<b>Descuento −${d}%</b><br>${p.b} más baratos · ${p.c} más caros · ${n - p.b - p.c} similares`, ev); };
    svg.onmouseleave = () => { cur.style.display = "none"; tip(null); };
    return c;
  }

  // 3. Margen sin explotar: gráfico de mancuernas (hoy → posible) con control de ventaja
  function cardMargen(xs) {
    const U = UMBRAL, base = xs.filter(x => x.pi.diff >= U && x.pi.diff <= PRICE_HI), extremos = xs.filter(x => x.pi.diff > PRICE_HI).length;
    if (base.length < 2) return null;
    const c = inCard("in-full in-ok", "💰", "Margen sin explotar", `Productos ≥${U}% por debajo de su equivalente. Movés la ventaja que querés mantener y ves hasta dónde podría subir cada precio.${extremos ? ` (No cuento ${extremos} con más de ${PRICE_HI}% de diferencia: parecen de otra gama.)` : ""}`);
    cbDe(c).innerHTML = `<div class="in-marg"><div class="in-marg-l"><label>Ventaja que querés mantener<b id="mgV"></b></label><input type="range" id="mgR" min="0" max="25" step="1" value="${GAP_OBJ.v}"><small>0% = igualar al competidor · 25% = quedar muy por debajo</small><div class="in-bigs" id="mgBig"></div><button class="btn-ghost in-go" id="mgGo"></button></div><div class="in-marg-r"><div class="in-mg-head"><span>hoy → posible</span><span>precio de Leuk como % del competidor</span></div><div id="mgRows"></div><div class="cd-leyenda"><span><i style="background:var(--card);border:2.5px solid var(--olive);border-radius:50%"></i>hoy</span><span><i style="background:var(--ok);border-radius:50%"></i>posible</span><span><i style="width:2px;height:12px;background:var(--ink);opacity:.6"></i>precio del competidor</span></div></div></div>`;
    const pintar = () => {
      const g = GAP_OBJ.v, meta = 100 - g;
      const r = base.map(x => ({ x, hoy: x.pi.leukNet / x.pi.compNet * 100, nuevo: x.pi.compNet * (1 - g / 100) })).map(o => ({ ...o, up: o.nuevo / o.x.pi.leukNet * 100 - 100 })).filter(o => o.up > 0);
      const exactos = r.filter(o => o.x.a.veredicto === "Equivalente").length;
      c.querySelector("#mgV").textContent = ` ${g}%`;
      c.querySelector("#mgBig").innerHTML = r.length ? bigNum("+" + pct0(promDe(r.map(o => o.up))) + "%", "suba promedio de precio", "ok") + bigNum(r.length, `productos (${exactos} exactos)`) + bigNum("US$ " + pct0(r.reduce((s, o) => s + o.nuevo - o.x.pi.leukNet, 0)).toLocaleString("es-AR"), "más por unidad, entre todos") : `<p>Con esa ventaja no hay margen para subir: ya estás en ese nivel o más cerca.</p>`;
      const top = [...r].sort((a, b) => (b.x.a.veredicto === "Equivalente") - (a.x.a.veredicto === "Equivalente") || b.up - a.up).slice(0, 8), pos = v => Math.max(0, Math.min(100, (v - 20) / 90 * 100));
      c.querySelector("#mgRows").innerHTML = top.map(o => `<div class="in-mg"><span class="in-n"><b>${esc2(o.x.a.leukNombre)}</b><small>vs ${esc2(o.x.a.marca)}${o.x.a.veredicto === "Equivalente" ? "" : " · parcial"} · US$ ${fmtN(o.x.pi.leukNet)} → ${fmtN(o.nuevo)}</small></span>
        <span class="in-mg-t"><u style="left:${pos(100)}%"></u><s style="left:${pos(o.hoy)}%;width:${pos(meta) - pos(o.hoy)}%"></s><i class="hoy" style="left:${pos(o.hoy)}%" title="Hoy: ${pct0(o.hoy)}% del competidor"></i><i class="meta" style="left:${pos(meta)}%" title="Posible: ${pct0(meta)}%"></i></span><span class="cd-pill ok">+${pct0(o.up)}%</span></div>`).join("") || "";
      const go = c.querySelector("#mgGo"); go.textContent = `Ver los ${r.length} en Comparaciones →`; go.style.display = r.length ? "" : "none";
      go.onclick = () => verEnComparaciones({ set: { label: `Margen sin explotar (${r.length})`, keys: keysDe(r.map(o => o.x)) } });
    };
    c.querySelector("#mgR").oninput = ev => { GAP_OBJ.v = +ev.target.value; pintar(); };
    pintar();
    return c;
  }

  // 4. Contra quién ganás y contra quién perdés
  function cardCompetidores(xs) {
    const porM = {}; xs.forEach(x => { (porM[x.a.marca] = porM[x.a.marca] || []).push(x.pi.diff); });
    const ms = Object.entries(porM).filter(([, d]) => d.length >= 3).map(([m, d]) => ({ m, n: d.length, b: d.filter(v => v > 3).length, s: d.filter(v => v >= -3 && v <= 3).length, c: d.filter(v => v < -3).length }));
    if (ms.length < 2) return null;
    ms.sort((a, b) => b.b / b.n - a.b / a.n);
    const mejor = ms[0], peor = [...ms].sort((a, b) => b.c / b.n - a.c / a.n)[0];
    const c = inCard("", "⚔️", `Contra ${esc2(mejor.m)} ganás; contra ${esc2(peor.m)} te cuesta`, "El argumento de precio cambia según con quién te compare el cliente.");
    cbDe(c).innerHTML = `<div class="in-bigs">${bigNum(pct0(mejor.b / mejor.n * 100) + "%", `más barato vs ${esc2(mejor.m)}`, "ok")}${bigNum(pct0(peor.c / peor.n * 100) + "%", `más caro vs ${esc2(peor.m)}`, "no")}</div>` +
      ms.map(r => `<button class="in-mrow" data-m="${esc2(r.m)}"><span class="in-bl">${esc2(r.m)}</span>${inStack(r.b, r.s, r.c, `${r.n} comparaciones`)}<b>${r.n}</b></button>`).join("") +
      `<div class="cd-leyenda"><span><i style="background:var(--ok)"></i>Leuk más barato</span><span><i style="background:#b9b4a6"></i>similar</span><span><i style="background:var(--no)"></i>Leuk más caro</span></div>`;
    c.querySelectorAll(".in-mrow").forEach(b => b.onclick = () => verEnComparaciones({ marca: b.dataset.m }));
    return c;
  }

  // 5. Dónde bajar: cuánto falta para igualar
  function cardCaros(xs) {
    const caros = xs.filter(x => x.pi.diff <= -UMBRAL).map(x => ({ x, cut: (x.pi.leukNet - x.pi.compNet) / x.pi.leukNet * 100 }));
    if (caros.length < 2) return null;
    const atiro = caros.filter(r => r.cut <= 15), cerca = [...caros].sort((a, b) => a.cut - b.cut).slice(0, 5);
    const c = inCard("in-no", "⚠️", `Estás más caro en ${caros.length} productos`, `Igualar te pide bajar ${pct0(medianaDe(caros.map(r => r.cut)))}% en el caso típico. ${atiro.length ? "Los que están a tiro son los más fáciles de corregir." : "Ninguno está cerca: probablemente compitan en otra gama."}`);
    cbDe(c).innerHTML = `<div class="in-bigs">${bigNum(atiro.length, "a menos de 15% de igualarse", atiro.length ? "ok" : "")}${bigNum(caros.length - atiro.length, "lejos del competidor", "no")}</div>
      <div class="in-t">${cerca.map(r => `<div class="in-tr"><span class="in-n"><b>${esc2(r.x.a.leukNombre)}</b><small>vs ${esc2(r.x.a.marca)}</small></span><span>US$ ${fmtN(r.x.pi.leukNet)} → ${fmtN(r.x.pi.compNet)}</span><span class="cd-pill ${r.cut <= 15 ? "sim" : "no"}">−${pct0(r.cut)}%</span></div>`).join("")}</div>
      <button class="btn-ghost in-go">Ver los ${caros.length} en Comparaciones →</button>`;
    cbDe(c).querySelector(".in-go").onclick = () => verEnComparaciones({ set: { label: `Más caros (${caros.length})`, keys: keysDe(caros.map(r => r.x)) } });
    return c;
  }

  // 6. Qué tan firme es el panorama (calidad del match)
  function cardMatch(xs) {
    const ex = xs.filter(x => x.a.veredicto === "Equivalente"), pa = xs.filter(x => x.a.veredicto !== "Equivalente");
    if (xs.length < 5 || !ex.length || !pa.length) return null;
    const me = medianaDe(ex.map(x => x.pi.diff)), mp = medianaDe(pa.map(x => x.pi.diff)), dist = Math.abs(me - mp) >= 15;
    const c = inCard(dist ? "in-warn" : "", "🔎", `${pct0(pa.length / xs.length * 100)}% de las comparaciones son parciales`, dist ? "Y cambian la conclusión: confirmá a mano los parciales antes de mover precios." : "Las dos lecturas van en la misma dirección.");
    cbDe(c).innerHTML = `<div class="in-two">${donut(ex.length / xs.length, "ok", ex.length, "exactos")}<div class="in-cmp"><div><small>Típico con exactos</small><b class="${me > 3 ? "ok" : me < -3 ? "no" : ""}">${fmtDif(pct0(me))}</b></div><div><small>Típico con parciales</small><b class="${mp > 3 ? "ok" : mp < -3 ? "no" : ""}">${fmtDif(pct0(mp))}</b></div></div></div><button class="btn-ghost in-go">Ver los parciales →</button>`;
    cbDe(c).querySelector(".in-go").onclick = () => verEnComparaciones({ nivel: "Comparable parcial" });
    return c;
  }

  // 7. Cobertura del catálogo
  function cardCobertura() {
    const conComp = new Set(Object.values(AUTH).map(a => a.leukSku)), vs = {};
    P.forEach(p => { const v = p.vertical || "—"; vs[v] = vs[v] || { t: 0, c: 0 }; vs[v].t++; if (conComp.has(p.sku)) vs[v].c++; });
    const tot = P.length, cub = P.filter(p => conComp.has(p.sku)).length;
    if (!tot || cub / tot >= .6) return null;
    const vl = Object.entries(vs).map(([v, o]) => ({ v, ...o })).filter(o => o.v !== "—" || o.c).sort((a, b) => a.c / a.t - b.c / b.t);
    const c = inCard("", "🧭", `Sólo ${pct0(cub / tot * 100)}% del catálogo está comparado`, `Lo que ves describe esa parte. ${Object.keys(MONO).length ? `Además hay ${Object.keys(MONO).length} productos marcados sin competencia.` : ""}`);
    cbDe(c).innerHTML = `<div class="in-two">${donut(cub / tot, "ok", pct0(cub / tot * 100) + "%", `${cub} de ${tot}`)}<div class="in-cmp">${vl.slice(0, 3).map(o => inBar(o.v, o.c / o.t, `${o.c}/${o.t}`, "ok")).join("")}</div></div><button class="btn-ghost in-go">Ir al Catálogo →</button>`;
    cbDe(c).querySelector(".in-go").onclick = () => goToPage("comparaciones");
    return c;
  }

  function renderDecisiones() {
    const dash = $("#dash"); dash.innerHTML = "";
    const A = Object.values(AUTH), monos = Object.values(MONO);
    const secMono = monos.length ? monoSection(monos) : null, secDesc = descartesSection();
    const alFinal = () => { if (secMono) dash.appendChild(secMono); if (secDesc) dash.appendChild(secDesc); };
    const head = sub => { $("#dashHead").innerHTML = `<div class="mh-top"><div class="mh-tit"><h1>Insights</h1><p class="mh-sub"><span>${sub}</span></p></div></div>`; };
    const xs = A.map(a => ({ a, pi: posInfo(a) })).filter(x => x.pi.has);
    if (!xs.length) {
      head("Se calculan a partir de tus comparaciones <b>seleccionadas</b>.");
      if (!secMono && !secDesc) dash.innerHTML = `<div class="empty"><div class="big">📊</div>Todavía no hay insights para mostrar.<br>Seleccioná comparaciones o marcá productos <b>sin competencia</b> (desde <b>Catálogo</b>) y acá se arma el panorama.</div>`;
      alFinal(); return;
    }
    head(`Calculado sobre <b>${xs.length}</b> comparaciones seleccionadas · precio neto · Leuk ${CFG.leukTier === "cliente" ? "Cliente" : "Partner"} −${descLeuk()}%`);
    if (xs.length < 8) dash.appendChild(el("div", "res-intro", `Tenés <b>${xs.length}</b> comparaciones con precio: los hallazgos mejoran a medida que seleccionás más (con 10 o más ya son confiables).`));
    const grid = el("div", "in-grid");
    [cardHero(xs), cardMapaAccion(xs), cardCurvaDescuento(xs), cardMargen(xs), cardCompetidores(xs), cardCaros(xs), cardMatch(xs), cardCobertura()].filter(Boolean).forEach(c => grid.appendChild(c));
    dash.appendChild(grid);

    // Argumentos de venta (material para el equipo comercial), plegado
    const gana = xs.filter(x => x.pi.diff >= 10).sort((a, b) => b.pi.diff - a.pi.diff), pierde = xs.filter(x => x.pi.diff <= -10).sort((a, b) => a.pi.diff - b.pi.diff);
    if (gana.length || pierde.length) {
      const d = el("details", "dash-sec in-args");
      d.innerHTML = `<summary><h3>🗣️ Argumentos de venta <span class="leuk-fam">(${gana.length + pierde.length})</span></h3><button class="btn-ghost" id="argExport">⬇ Exportar</button></summary>
        <div class="fam-hint">✅ Leuk equivale y es <b>más barato</b> — argumento directo de precio.</div><div class="arg-list">${gana.slice(0, 40).map(x => `<div class="arg-item">${esc2(argumento(x.a, x.pi))}</div>`).join("") || `<div class="empty-mini">Sin casos por ahora.</div>`}</div>
        <div class="fam-hint" style="margin-top:18px">💬 Leuk es <b>más caro</b> — diferencias técnicas para defender el precio.</div><div class="arg-list">${pierde.slice(0, 40).map(x => `<div class="arg-item">${esc2(argumentoCaro(x.a, x.pi))}</div>`).join("") || `<div class="empty-mini">Sin casos por ahora.</div>`}</div>`;
      d.querySelector("#argExport").onclick = ev => { ev.preventDefault(); dl(new Blob(["﻿LEUK MÁS BARATO (argumento de precio)\n" + gana.map(x => argumento(x.a, x.pi)).join("\n") + "\n\nLEUK MÁS CARO (defensa del precio)\n" + pierde.map(x => argumentoCaro(x.a, x.pi)).join("\n")], { type: "text/plain;charset=utf-8" }), "argumentos_venta_leuk.txt"); };
      dash.appendChild(d);
    }
    alFinal();
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
    // El nombre real (de `perfiles`); si todavía no cargó, la parte del mail.
    const quien = NOMBRE || (AUTHSES.email() || "").split("@")[0] || "cuenta";
    b.textContent = `👤 ${quien}`;
    b.title = `${quien} · ${AUTHSES.email()} — clic para ver tu cuenta`;
  }
  function lock() {
    document.body.classList.add("locked");
    const em = $("#gateEmail"); if (em) { em.value = ""; $("#gatePass").value = ""; $("#gateErr").textContent = ""; setTimeout(() => em.focus(), 60); }
  }
  function unlock() { document.body.classList.remove("locked"); updateAuthBtn(); }
  // Al cerrar sesión este dispositivo deja de recibir los avisos de esa persona (si no,
  // en una compu compartida le llegarían a quien entre después).
  async function doLogout() {
    if (!confirm(`Sesión: ${AUTHSES.email()}\n¿Cerrar sesión?`)) return;
    clearInterval(NT_TIMER);
    await desactivarPush().catch(() => { });
    AUTHSES.logout(); lock();
  }

  // Cambia la contraseña del usuario logueado (con su propio token, no hace falta admin).
  async function cambiarMiPassword(nueva) {
    const r = await fetch(`${SB.url}/auth/v1/user`, {
      method: "PUT", headers: AUTHSES.head(), body: JSON.stringify({ password: nueva }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.msg || d.error_description || d.message || "No se pudo cambiar la contraseña");
  }
  // Panel de cuenta: quién sos, qué rol tenés, cambiar contraseña y salir.
  function openCuenta() {
    const ov = el("div", "detail"); ov.id = "cuentaModal";
    ov.innerHTML = `<div class="detail-inner cuenta-modal">
      <button class="detail-close" id="cuClose">✕</button>
      <h2>Mi cuenta</h2>
      <div class="cu-info"><b>${(NOMBRE || "").replace(/[<>]/g, "") || "—"}</b>
        <span class="leuk-fam">${(AUTHSES.email() || "").replace(/[<>]/g, "")}</span>
        <span class="cu-rol">${rolCfg().label}</span></div>
      <h3>Cambiar mi contraseña</h3>
      <div class="cu-form">
        <input id="cuPass1" type="password" placeholder="Contraseña nueva (mín. 8)" autocomplete="new-password">
        <input id="cuPass2" type="password" placeholder="Repetila" autocomplete="new-password">
        <button class="btn-primary" id="cuSave">Guardar</button>
      </div>
      <div id="cuMsg" class="us-msg"></div>
      <h3>Avisos en este dispositivo</h3>
      <p class="cu-push-txt" id="cuPushTxt">…</p>
      <div class="cu-push-acc" id="cuPushAcc"></div>
      <div id="cuPushMsg" class="us-msg"></div>
      <label class="cu-sonido"><input type="checkbox" id="cuSonido"> Sonido cuando llega un aviso con la plataforma abierta</label>
      <div class="desc-actions"><button class="btn-ghost" id="cuOut">Cerrar sesión</button></div>
    </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    $("#cuClose").onclick = close;
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    $("#cuOut").onclick = () => { close(); doLogout(); };
    pintarPushCuenta();
    $("#cuSonido").checked = ntSonidoOn();
    $("#cuSonido").onchange = e => {
      try { localStorage.setItem("notis_sonido", e.target.checked ? "1" : "0"); } catch (err) { }
      if (e.target.checked) { ntDestrabarAudio(); ntSonar(); }        // para escuchar cómo suena
    };
    $("#cuSave").onclick = async () => {
      const a = $("#cuPass1").value, b = $("#cuPass2").value, m = $("#cuMsg");
      const err = t => { m.textContent = t; m.className = "us-msg px-err"; };
      if (a.length < 8) return err("Tiene que tener al menos 8 caracteres.");
      if (a !== b) return err("Las dos contraseñas no coinciden.");
      $("#cuSave").disabled = true;
      try {
        await cambiarMiPassword(a);
        m.textContent = "✓ Listo. La próxima vez entrá con la nueva."; m.className = "us-msg px-ok";
        $("#cuPass1").value = $("#cuPass2").value = "";
      } catch (e) { err(e.message); } finally { $("#cuSave").disabled = false; }
    };
  }
  async function pintarPushCuenta() {
    const txt = $("#cuPushTxt"), acc = $("#cuPushAcc"), msg = $("#cuPushMsg"); if (!txt) return;
    const est = await pushEstado();
    txt.textContent = PUSH_TXT[est];
    acc.innerHTML = est === "inactivo" ? `<button class="btn-primary" id="cuPushOn">Activar avisos</button>`
      : est === "activo" ? `<button class="btn-ghost" id="cuPushTest">Enviar un aviso de prueba</button><button class="btn-ghost" id="cuPushOff">Desactivar</button>` : "";
    const ok = t => { msg.textContent = t; msg.className = "us-msg px-ok"; };
    const err = e => { msg.textContent = e.message || String(e); msg.className = "us-msg px-err"; };
    const on = $("#cuPushOn"), test = $("#cuPushTest"), off = $("#cuPushOff");
    if (on) on.onclick = async () => { on.disabled = true; try { await activarPush(); ok("✓ Listo. Probá con “Enviar un aviso de prueba”."); } catch (e) { err(e); } pintarPushCuenta(); };
    if (test) test.onclick = async () => { test.disabled = true; try { const n = await probarPush(); ok(n ? "✓ Enviado. Tendría que llegarte en unos segundos." : "No se encontró este dispositivo. Desactivá y volvé a activar."); } catch (e) { err(e); } test.disabled = false; };
    if (off) off.onclick = async () => { off.disabled = true; await desactivarPush(); ok("Listo, este dispositivo ya no recibe avisos."); pintarPushCuenta(); };
  }
  // descarga los datos del benchmark desde el bucket privado de Supabase (requiere sesión)
  async function fetchData(retried) {
    // cache-buster + cache:"reload": el JSON del bucket se sube sin cache-control, así que el
    // navegador lo cacheaba por heurística y no se veían los datos nuevos hasta pasado un rato.
    // Con el timestamp la URL es siempre única → siempre baja la última versión.
    const r = await fetch(`${SB.url}/storage/v1/object/datos/benchmark_data.json?_cb=${Date.now()}`,
                          { headers: AUTHSES.head(), cache: "reload" });
    if ((r.status === 400 || r.status === 401 || r.status === 403) && !retried && await AUTHSES.refresh()) return fetchData(true);
    if (!r.ok) throw new Error("No pude cargar los datos (sesión inválida — reingresá)");
    return await r.json();
  }
  // Aplica el rol a la interfaz: qué módulos se ven y qué herramientas quedan disponibles.
  // Se llama SIEMPRE al arrancar (el logout no recarga la página, así que hay que
  // recalcular desde cero o quedan pegadas las restricciones del usuario anterior).
  function aplicarRol() {
    renderNav();                                   // el menú lateral ya sale filtrado por rol
    const d = $("#btnDesc"); if (d) d.style.display = puedeVer("benchmark") ? "" : "none";
    document.body.classList.toggle("solo-fichas", !puedeVer("benchmark"));
  }
  async function bootApp() {                     // tras el login: baja datos + arma la app
    await fetchRol();                              // EL ROL PRIMERO: decide qué se baja
    aplicarRol();
    if (SIN_PERFIL) { bootSinAcceso(); return; }                  // cuenta sin rol asignado
    if (!puedeVer("benchmark")) { bootSinBenchmark(); return; }   // NO se le baja el benchmark
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
    // Pie del Benchmark (TC, descuentos, frescura): sólo aplica a ese módulo. Se guarda
    // y goToPage lo muestra/oculta según dónde estés (antes quedaba fijo en todos lados).
    META_BENCH = `Datos al ${fecha}${vejez} · TC blue $${(meta.tc_blue || 0).toLocaleString("es-AR")} · Descuentos: ${descTxt} · ${meta.n_productos_leuk || P.length} productos · matching por 3 señales`;
    buildCatFilters(); renderCatalogo(); updateDescBtn();
    goToPage("inicio");                            // la home es la vista de entrada
    await sbPull(); updateNavCount();
    await sbPullPrices();                          // llama applyPriceOverrides internamente
    await fetchCostos();                            // costos sólo para admin/líder (la RLS filtra el resto)
    rerenderActive();
    avisarContenidos();
  }
  // Contador de la solapa Contenidos (sugerencias sin resolver + lo que sale hoy).
  // Lo calcula contenidos.js; acá sólo se lo dispara al terminar de arrancar.
  function avisarContenidos() {
    if (puedeVer("contenidos") && window.avisosContenidos) window.avisosContenidos();
    if (puedeVer("tareas") && window.avisosTareas) window.avisosTareas();   // lo tuyo que vence hoy o ya venció
    if (puedeVer("acciones") && window.avisosAcciones) window.avisosAcciones();   // acciones donde te mencionaron
    arrancarNotis();
  }
  // Arranque para roles SIN benchmark (ej. Diseño): no se descarga ese archivo.
  function bootSinBenchmark() {
    $("#metaLine").textContent = "";
    goToPage("inicio");                            // la Home ya se filtra por rol
    avisarContenidos();
  }
  // Tiene cuenta pero nadie le asignó rol: no ve nada y se le dice por qué.
  function bootSinAcceso() {
    $("#metaLine").textContent = "";
    PAGES.forEach(p => { const el = $("#page-" + p); if (el) el.classList.toggle("hidden", p !== "inicio"); });
    $("#subbar").classList.add("hidden");
    $("#inicio").innerHTML = `<div class="home-hero">
      <img src="assets/logo-leuk-ilum.png" alt="Leuk Iluminación" class="home-logo">
      <span class="brand-sub home-tag">Leuk Marketing</span>
      <h1>Tu cuenta todavía no tiene acceso</h1>
      <p>Ya podés entrar, pero un administrador tiene que asignarte un rol para que veas
      el contenido. Escribile a quien administra la plataforma con este mail:
      <b>${(AUTHSES.email() || "").replace(/[<>]/g, "")}</b>.</p></div>`;
  }
  function wireGate() {
    const go = async () => {
      const err = $("#gateErr"); err.textContent = "";
      const btn = $("#gateGo"); btn.disabled = true; btn.textContent = "Ingresando…";
      try { await AUTHSES.login($("#gateEmail").value, $("#gatePass").value); await bootApp(); unlock(); irDesdeLink(location.hash); }
      catch (e) { err.textContent = e.message || "No se pudo ingresar"; }
      btn.disabled = false; btn.textContent = "Ingresar";
    };
    $("#gateGo").onclick = go;
    $("#gateEmail").addEventListener("keydown", e => { if (e.key === "Enter") $("#gatePass").focus(); });
    $("#gatePass").addEventListener("keydown", e => { if (e.key === "Enter") go(); });

    // "¿Olvidaste tu contraseña?": manda el mail de recuperación. Responde siempre igual,
    // exista o no la cuenta, para no revelar qué mails están registrados.
    $("#gateForgot").onclick = async () => {
      const err = $("#gateErr");
      const mail = ($("#gateEmail").value || "").trim();
      if (!mail) { err.textContent = "Escribí tu email arriba y volvé a tocar el link."; return; }
      err.textContent = "Enviando…";
      try {
        await fetch(`${SB.url}/auth/v1/recover`, {
          method: "POST",
          headers: { apikey: SB.key, "Content-Type": "application/json" },
          body: JSON.stringify({ email: mail, redirect_to: location.origin + location.pathname }),
        });
      } catch (e) { }
      err.textContent = "Si ese mail tiene cuenta, te llega un link para elegir una contraseña nueva.";
    };
  }

  // Vuelta desde el mail de recuperación: Supabase deja el token en el # de la URL.
  // Se muestra una pantalla para elegir la contraseña nueva antes de entrar.
  function pantallaRecuperar(token) {
    history.replaceState(null, "", location.pathname);      // limpiar el token de la barra
    const card = document.querySelector("#gate .gate-card");
    card.innerHTML = `<img src="assets/logo-leuk-ilum.png" alt="Leuk Iluminación" class="gate-logo">
      <h1>Elegí tu contraseña</h1>
      <p class="gate-sub">Poné una contraseña nueva para entrar a Leuk Marketing.</p>
      <input id="rcPass1" type="password" placeholder="Contraseña nueva (mín. 8)" class="lg-in" autocomplete="new-password">
      <input id="rcPass2" type="password" placeholder="Repetila" class="lg-in" autocomplete="new-password">
      <div id="rcErr" class="lg-err"></div>
      <button id="rcGo" class="btn-primary gate-btn">Guardar y entrar</button>`;
    $("#rcGo").onclick = async () => {
      const a = $("#rcPass1").value, b = $("#rcPass2").value, e = $("#rcErr");
      if (a.length < 8) { e.textContent = "Tiene que tener al menos 8 caracteres."; return; }
      if (a !== b) { e.textContent = "Las dos contraseñas no coinciden."; return; }
      $("#rcGo").disabled = true; e.textContent = "";
      try {
        const r = await fetch(`${SB.url}/auth/v1/user`, {
          method: "PUT",
          headers: { apikey: SB.key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ password: a }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.msg || d.message || "El link venció — pedí uno nuevo desde el login.");
        location.reload();                                   // ya puede entrar con la nueva
      } catch (err) { e.textContent = err.message; $("#rcGo").disabled = false; }
    };
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

  /* ---- Subir COSTOS por lista (sólo admin/líder) ---- */
  // Lee un archivo a filas (array de objetos por encabezado). OJO CSV: si se lo pasás a XLSX,
  // interpreta "5,31" como coma de miles y lo vuelve 531 (×100). Por eso el CSV se parsea a
  // mano respetando ; como separador y dejando la coma decimal intacta (la normaliza el parser).
  function leerArchivoFilas(f) {
    const esCsv = /\.csv$/i.test(f.name);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("No pude leer el archivo"));
      reader.onload = e => {
        try {
          if (esCsv) {
            const txt = String(e.target.result).replace(/^﻿/, "");
            const lineas = txt.split(/\r?\n/).filter(l => l.trim() !== "");
            if (!lineas.length) return resolve([]);
            const sep = lineas[0].includes(";") ? ";" : lineas[0].includes("\t") ? "\t" : ",";
            const heads = lineas[0].split(sep).map(h => h.trim());
            resolve(lineas.slice(1).map(l => {
              const cells = l.split(sep), o = {};
              heads.forEach((h, i) => o[h] = (cells[i] == null ? "" : cells[i]).trim());
              return o;
            }));
          } else {
            const wb = XLSX.read(e.target.result, { type: "array" });
            resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }));
          }
        } catch (ex) { reject(ex); }
      };
      if (esCsv) reader.readAsText(f, "utf-8"); else reader.readAsArrayBuffer(f);
    });
  }
  function parseCostoRows(rows) {
    if (!rows.length) return { items: [], err: "La hoja está vacía." };
    const cols = Object.keys(rows[0]);
    const find = cands => cols.find(c => cands.some(x => norm2(c) === x || norm2(c).includes(x)));
    const cSku = find(["sku", "codigo", "código", "code"]);
    const cCosto = find(["costo", "cost", "coste", "costo usd"]) || find(["precio", "valor", "importe", "usd"]);
    if (!cSku || !cCosto) return { items: [], err: `No encontré las columnas. Necesito una de SKU (${cSku || "falta"}) y una de Costo (${cCosto || "falta"}). Columnas vistas: ${cols.join(", ")}` };
    const items = [];
    rows.forEach(r => {
      const sku = String(r[cSku] == null ? "" : r[cSku]).replace(/\.0$/, "").trim();
      let raw = String(r[cCosto] == null ? "" : r[cCosto]).replace(/[^\d.,-]/g, "");
      if (raw.indexOf(",") > -1 && raw.indexOf(".") > -1) raw = raw.replace(/\./g, "").replace(",", ".");
      else if (raw.indexOf(",") > -1) raw = raw.replace(",", ".");
      const costo = parseFloat(raw);
      if (sku && isFinite(costo) && costo > 0) items.push({ sku, costo: Math.round(costo * 100) / 100 });
    });
    return { items, col: { sku: cSku, costo: cCosto } };
  }
  // los costos son de nuestros productos → sólo SKUs de Leuk
  function matchCostos(items) {
    const skus = new Set(P.map(p => String(p.sku)));
    return { out: items.filter(i => skus.has(i.sku)), total: items.length };
  }
  function openCostos() {
    if (!puedeCostos()) { alert("Sólo Admin y Líder pueden actualizar costos."); return; }
    const ov = el("div", "detail"); ov.id = "costosModal";
    ov.innerHTML = `<div class="detail-inner desc-modal">
      <button class="detail-close" id="cxClose">✕</button>
      <h2>Actualizar costos por lista</h2>
      <div class="fam-hint">Subí la lista de <b>costos en US$</b> (Excel .xlsx o CSV), con una columna de <b>SKU</b> y una de <b>Costo</b>. Sólo se cargan los SKU de Leuk. Los costos quedan guardados de forma privada: los ven únicamente Admin y Líder.</div>
      <div id="cxDrop" class="px-drop">Arrastrá el Excel acá o <b>tocá para elegir</b><input id="cxFile" type="file" accept=".xlsx,.xls,.csv" hidden></div>
      <div id="cxInfo" class="px-info"></div>
      <div class="desc-actions"><button class="btn-ghost" id="cxCancel">Cancelar</button><button class="btn-primary" id="cxApply" disabled>Aplicar</button></div>
    </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    let pending = null;
    ov.querySelector("#cxClose").onclick = close;
    ov.querySelector("#cxCancel").onclick = close;
    ov.addEventListener("click", ev => { if (ev.target === ov) close(); });
    const drop = ov.querySelector("#cxDrop"), file = ov.querySelector("#cxFile"), info = ov.querySelector("#cxInfo"), apply = ov.querySelector("#cxApply");
    drop.onclick = () => file.click();
    drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
    drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]); };
    file.onchange = () => { if (file.files[0]) handle(file.files[0]); };
    async function handle(f) {
      info.innerHTML = "Leyendo…"; apply.disabled = true;
      try {
        const rows = await leerArchivoFilas(f);
        const { items, err, col } = parseCostoRows(rows);
        if (err) { info.innerHTML = `<span class="px-bad">${err}</span>`; return; }
        const { out } = matchCostos(items);
        pending = out;
        const muestra = out.slice(0, 3).map(o => `${o.sku} → US$ ${o.costo}`).join(" · ");
        info.innerHTML = `<div><b>${f.name}</b> · ${items.length} filas con costo · columnas: ${col.sku} / ${col.costo}</div>
          <div class="px-ok">✓ ${out.length} costos de <b>Leuk</b> se van a actualizar</div>
          ${out.length ? `<div class="leuk-fam">ej: ${muestra}${out.length > 3 ? "…" : ""}</div>` : ""}
          ${items.length - out.length > 0 ? `<div class="px-warn">⚠ ${items.length - out.length} filas sin coincidencia con un SKU de Leuk — se ignoran</div>` : ""}`;
        apply.disabled = out.length === 0;
      } catch (ex) { info.innerHTML = `<span class="px-bad">No pude leer el archivo: ${ex.message}</span>`; }
    }
    apply.onclick = async () => {
      if (!pending || !pending.length) return;
      apply.disabled = true; apply.textContent = "Aplicando…";
      const ok = await bulkSaveCostos(pending);
      if (ok) { info.innerHTML = `<div class="px-ok">✓ Listo: ${pending.length} costos actualizados.</div>`; rerenderActive(); setTimeout(close, 1500); }
      else { info.innerHTML = `<span class="px-bad">No se pudo guardar. ¿Corriste el SQL de la tabla 'costos'? ¿Sesión vencida?</span>`; apply.disabled = false; apply.textContent = "Aplicar"; }
    };
  }
  async function bulkSaveCostos(list, retried) {
    if (!sbOn() || !AUTHSES.logged() || !puedeCostos()) return false;
    const autor = AUTHSES.email(), ts = new Date().toISOString();
    const body = list.map(x => ({ sku: x.sku, costo: x.costo, autor, ts }));
    list.forEach(x => { COSTOS[x.sku] = x.costo; });     // aplica local ya
    try {
      let okAll = true;
      for (let i = 0; i < body.length; i += 400) {
        const r = await fetch(`${SB.url}/rest/v1/costos`, {
          method: "POST", headers: Object.assign(AUTHSES.head(), { Prefer: "resolution=merge-duplicates,return=minimal" }),
          body: JSON.stringify(body.slice(i, i + 400)),
        });
        if ((r.status === 401 || r.status === 403) && !retried) { if (await AUTHSES.refresh()) return bulkSaveCostos(list, true); return false; }
        if (!r.ok) okAll = false;
      }
      return okAll;
    } catch (e) { return false; }
  }

  /* ===================== INTEGRAR COMPETENCIA (Fase 1: carga + cola) ===================== */
  // La app sólo ENCOLA el trabajo (sube el PDF + crea el job). El procesamiento pesado
  // (scrape de imágenes, embeddings, etiquetado, matching) lo hace un worker aparte que
  // lee la tabla `integracion_jobs` con la service key. Acá: subir PDF, crear job, listar.
  const slugMarca = s => (s || "").toString().toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "marca";

  async function subirPDFIntegracion(mslug, f) {
    const path = `${mslug}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
    const h = Object.assign({}, AUTHSES.head());
    h["Content-Type"] = f.type || "application/pdf"; h["x-upsert"] = "true";
    const r = await fetch(`${SB.url}/storage/v1/object/integracion/${encodeURI(path)}`, { method: "POST", headers: h, body: f });
    if (!r.ok) throw new Error(`No se pudo subir ${f.name}`);
    return path;
  }
  async function crearJobIntegracion(job) {
    const r = await fetch(`${SB.url}/rest/v1/integracion_jobs`, {
      method: "POST", headers: Object.assign(AUTHSES.head(), { Prefer: "return=representation" }),
      body: JSON.stringify(job),
    });
    if (!r.ok) throw new Error((await r.text()).slice(0, 180));
    return (await r.json())[0];
  }
  async function traerJobsIntegracion() {
    const r = await fetch(`${SB.url}/rest/v1/integracion_jobs?select=*&order=creado.desc&limit=15`, { headers: AUTHSES.head() });
    return r.ok ? await r.json() : [];
  }

  // ── Recetas: cómo se carga cada marca (la escribe el alta asistida, skill `alta-competidor`)
  async function traerRecetas() {
    const r = await fetch(`${SB.url}/rest/v1/competencia_recetas?select=*&order=marca.asc`, { headers: AUTHSES.head() });
    return r.ok ? await r.json() : [];
  }
  async function traerListas() {
    const r = await fetch(`${SB.url}/rest/v1/competencia_listas?select=*&order=cargada.desc&limit=200`, { headers: AUTHSES.head() });
    return r.ok ? await r.json() : [];
  }

  // Actualizar la lista de precios de una marca YA cargada. El alta de una marca NUEVA no se
  // hace acá: necesita entender el formato de esa lista (dónde está el código, si el precio
  // lleva IVA, si los códigos de la web cruzan con los del PDF) y eso se resuelve con el
  // asistente de alta, que además deja escrita la RECETA. Sin receta no hay actualización.
  function openActualizar() {
    if (!puedeIntegrar()) { alert("Sólo Admin, Líder y Coordinación pueden actualizar listas de competencia."); return; }
    const ov = el("div", "detail"); ov.id = "integrarModal";
    ov.innerHTML = `<div class="detail-inner desc-modal ci-modal">
      <button class="detail-close" id="ciClose">✕</button>
      <h2>Actualizar lista de precios</h2>
      <div class="fam-hint">Subí la <b>lista de precios nueva</b> de una marca que ya está cargada. El sistema la lee con la <b>receta</b> de esa marca, actualiza los precios que cambiaron, da de alta los productos nuevos (quedan para aprobar en <b>Nuevas integraciones</b>) y marca los que ya no aparecen. Se procesa en segundo plano.</div>
      <div class="ci-form">
        <label>Marca</label>
        <select id="ciMarca" class="lg-in"><option value="">Cargando marcas…</option></select>
        <div id="ciReceta" class="ci-receta"></div>
        <label>Lista de precios (PDF)</label>
        <div id="ciDrop" class="px-drop">Arrastrá el/los PDF acá o <b>tocá para elegir</b><input id="ciFile" type="file" accept="application/pdf,.pdf" multiple hidden></div>
        <div id="ciFiles" class="ci-files"></div>
        <div id="ciMsg" class="px-info"></div>
        <button id="ciCrear" class="btn-primary">Subir lista</button>
        <div class="leuk-fam ci-alta-nota">¿Es una marca <b>nueva</b>? El alta no se hace desde acá: se pide a Análisis Comercial, que la carga con el asistente de alta y deja escrita su receta. Podés ver cómo se cargó cada marca en <b>Manual de carga</b>.</div>
      </div>
      <h3 class="ci-h3">Cargas recientes</h3>
      <div id="ciList" class="ci-list"><div class="empty-mini">Cargando…</div></div>
    </div>`;
    document.body.appendChild(ov);
    const $$ = s => ov.querySelector(s);
    const close = () => { clearInterval(poll); ov.remove(); };
    $$("#ciClose").onclick = close;
    ov.addEventListener("click", ev => { if (ev.target === ov) close(); });
    const marca = $$("#ciMarca"), recBox = $$("#ciReceta"), drop = $$("#ciDrop"), file = $$("#ciFile"),
      filesBox = $$("#ciFiles"), msg = $$("#ciMsg"), crear = $$("#ciCrear"), lista = $$("#ciList");
    let files = [], RECETAS = [];

    // sólo se ofrecen las marcas que TIENEN receta y la tienen habilitada para actualizar
    (async () => {
      RECETAS = (await traerRecetas()).filter(r => r.estado !== "baja"
        && ((r.receta || {}).actualizacion || {}).habilitada !== false);
      if (!RECETAS.length) {
        marca.innerHTML = `<option value="">— todavía no hay marcas con receta —</option>`;
        crear.disabled = true;
        msg.innerHTML = `<span class="px-bad">Ninguna marca tiene receta cargada todavía, así que no hay nada que actualizar. El alta de una marca la hace Análisis Comercial con el asistente de alta.</span>`;
        return;
      }
      marca.innerHTML = RECETAS.map(r => `<option value="${r.slug}">${(r.marca || r.slug).replace(/[<>]/g, "")}</option>`).join("");
      pintarReceta();
    })();

    // se muestra lo que el sistema YA sabe de esa marca, para que quien sube sepa qué esperar
    function pintarReceta() {
      const r = RECETAS.find(x => x.slug === marca.value); if (!r) { recBox.innerHTML = ""; return; }
      const lp = (r.receta || {}).lista_precios || {};
      const iva = { sin_iva: "precios netos", con_iva: "IVA incluido", desconocido: "IVA sin confirmar" }[lp.iva] || "IVA sin confirmar";
      const parts = (r.receta || {}).particularidades || [];
      recBox.innerHTML = `<div class="ci-receta-in">
        <b>Receta de ${(r.marca || "").replace(/[<>]/g, "")}</b>
        ${r.estado === "parcial" ? ' <span class="tag-sug">carga parcial</span>' : ""}
        <div class="leuk-fam">${(lp.moneda || "moneda ?")} · ${iva} · lista ${lp.tipo_lista || "?"} · por ${lp.unidad_precio || "unidad"}</div>
        ${parts.length ? `<div class="leuk-fam ci-receta-p">${parts.length} particularidad${parts.length > 1 ? "es" : ""} documentada${parts.length > 1 ? "s" : ""} — vela en Manual de carga</div>` : ""}
      </div>`;
    }
    marca.onchange = pintarReceta;

    drop.onclick = () => file.click();
    drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
    drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); addFiles(e.dataTransfer.files); };
    file.onchange = () => addFiles(file.files);
    function addFiles(fl) {
      for (const f of fl) if (/\.pdf$/i.test(f.name) && !files.some(x => x.name === f.name)) files.push(f);
      filesBox.innerHTML = files.map((f, i) => `<span class="ci-file">${f.name.replace(/[<>]/g, "")} <button data-i="${i}" class="ci-file-x">✕</button></span>`).join("");
      filesBox.querySelectorAll(".ci-file-x").forEach(b => b.onclick = () => { files.splice(+b.dataset.i, 1); addFiles([]); });
    }
    crear.onclick = async () => {
      const r = RECETAS.find(x => x.slug === marca.value);
      if (!r) { msg.innerHTML = `<span class="px-bad">Elegí la marca.</span>`; return; }
      if (!files.length) { msg.innerHTML = `<span class="px-bad">Cargá la lista de precios en PDF.</span>`; return; }
      crear.disabled = true; crear.textContent = "Subiendo…";
      try {
        const paths = [];
        for (const f of files) { msg.textContent = `Subiendo ${f.name}…`; paths.push(await subirPDFIntegracion(r.slug, f)); }
        msg.textContent = "Encolando la actualización…";
        await crearJobIntegracion({
          marca: r.marca, marca_nueva: false, tipo: "actualizacion", slug: r.slug,
          url: null, pdf_paths: paths, autor: AUTHSES.email() || null,
        });
        msg.innerHTML = `<span class="px-ok">✓ Lista en cola. En unos minutos vas a ver acá abajo qué cambió.</span>`;
        files = []; addFiles([]);
        crear.textContent = "Subir lista"; crear.disabled = false;
        renderLista();
      } catch (ex) {
        msg.innerHTML = `<span class="px-bad">${ex.message}. ¿Corriste el SQL de recetas y actualización?</span>`;
        crear.textContent = "Subir lista"; crear.disabled = false;
      }
    };
    const EST = { pendiente: ["ci-b-wait", "⏳ En cola"], procesando: ["ci-b-run", "⚙ Procesando…"], listo: ["ci-b-ok", "✓ Listo"], error: ["ci-b-err", "✕ Error"] };
    async function renderLista() {
      const jobs = await traerJobsIntegracion();
      if (!jobs.length) { lista.innerHTML = `<div class="empty-mini">Todavía no se cargó ninguna lista.</div>`; return; }
      lista.innerHTML = jobs.map(j => {
        const [cls, txt] = EST[j.estado] || ["", j.estado || "?"];
        const r = j.resultado || {};
        const fecha = j.creado ? new Date(j.creado).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
        // el resumen de una actualización cuenta otra historia que el de un alta
        const resumen = j.estado !== "listo" ? "" : (r.tipo === "actualizacion"
          ? `<div class="leuk-fam">${r.precio_subio || 0} subieron · ${r.precio_bajo || 0} bajaron · ${r.sin_cambio || 0} sin cambio · <b>${r.productos_nuevos || 0} nuevos</b>${r.faltantes ? ` · ${r.faltantes} ya no están` : ""}</div>`
          : `<div class="leuk-fam">${r.productos_nuevos || 0} productos · ${r.con_ficha || 0} con ficha · ${r.con_precio || 0} con precio</div>`);
        return `<div class="ci-job">
          <div class="ci-job-meta"><b>${(j.marca || "—").replace(/[<>]/g, "")}</b>
            <span class="tag-sug">${j.tipo === "actualizacion" ? "actualización" : "alta"}</span>
            <span class="leuk-fam"> · ${fecha}</span>
            ${j.pdf_paths && j.pdf_paths.length ? `<div class="leuk-fam" style="font-size:11px">${j.pdf_paths.length} PDF</div>` : ""}
            ${j.estado === "error" ? `<div class="px-bad" style="font-size:11px">${(j.error || "").slice(0, 160)}</div>` : ""}
            ${resumen}</div>
          <span class="ci-badge ${cls}">${txt}</span>
        </div>`;
      }).join("");
    }
    renderLista();
    const poll = setInterval(renderLista, 5000);
  }

  /* ===================== MANUAL DE CARGA (el know-how, consultable) ===================== */
  // Cada marca cargada deja una RECETA: dónde vive cada dato en su lista de precios, sus
  // particularidades y el historial de listas. Es lo que permite que la actualización sea
  // self-service y que el proceso sobreviva a que no esté quien lo armó.
  async function renderManual() {
    const host = $("#page-manual"); if (!host) return;
    host.innerHTML = `<div class="res-intro">Cómo se carga cada competidor: <b>dónde está cada dato</b> en su lista de precios, qué particularidades tiene y qué listas se cargaron. Esto es lo que hace que actualizar precios sea apretar un botón.</div>
      <div id="manBody"><div class="empty-mini">Cargando…</div></div>`;
    const [recetas, listas] = await Promise.all([traerRecetas(), traerListas()]);
    const body = $("#manBody"); if (!body) return;
    if (!recetas.length) {
      body.innerHTML = `<div class="empty-mini">Todavía no hay ninguna marca con receta escrita. La receta la deja el <b>asistente de alta</b> cada vez que se incorpora un competidor.</div>`;
      return;
    }
    const esc = t => String(t == null ? "" : t).replace(/[<>]/g, "");
    const ESTADO = { activa: ["ci-b-ok", "✓ activa"], parcial: ["ci-b-wait", "carga parcial"], baja: ["ci-b-err", "dada de baja"] };
    body.innerHTML = recetas.map(r => {
      const R = r.receta || {}, lp = R.lista_precios || {}, web = R.web || {}, img = R.imagenes || {};
      const [ecls, etxt] = ESTADO[r.estado] || ["", esc(r.estado)];
      const iva = { sin_iva: "No, son precios netos", con_iva: "Sí, IVA incluido", desconocido: "Sin confirmar con el proveedor" }[lp.iva] || "Sin confirmar con el proveedor";
      const hist = listas.filter(l => l.slug === r.slug);
      const cob = img.cobertura || {};
      const dato = (k, v) => v ? `<div class="man-dato"><span>${k}</span><b>${esc(v)}</b></div>` : "";
      return `<div class="intg-marca man-card">
        <div class="intg-marca-head">
          <div><h3>${esc(r.marca)}</h3>
            <span class="leuk-fam">alta ${esc((R.alta || {}).fecha || "—")}${(R.alta || {}).autor ? " · " + esc((R.alta || {}).autor) : ""}</span></div>
          <span class="ci-badge ${ecls}">${etxt}</span>
        </div>
        <div class="man-body">
          ${(R.actualizacion || {}).habilitada === false
            ? `<div class="man-aviso"><b>No se actualiza desde la app.</b> ${esc((R.actualizacion || {}).motivo || "")}</div>` : ""}
          <h4>Lista de precios</h4>
          <div class="man-datos">
            ${dato("Moneda", lp.moneda)}${dato("¿El precio incluye IVA?", iva)}${dato("Tipo de lista", lp.tipo_lista)}
            ${dato("Precio por", lp.unidad_precio)}${dato("Descuento de lista", lp.descuento_lista ? lp.descuento_lista + "%" : "")}
            ${dato("Tipo de cambio", lp.tipo_cambio ? `${lp.tipo_cambio}${lp.tipo_cambio_fuente ? " · " + lp.tipo_cambio_fuente : ""}` : "")}
            ${dato("Columna del código", (lp.codigo || {}).columna)}
            ${dato("Columna del precio", (lp.precio || {}).cual)}${dato("Se cruza por", (R.actualizacion || {}).clave_de_cruce)}
            ${dato("Archivo fuente", lp.archivo_fuente)}${dato("Lista en PDF", lp.lista_pdf)}
          </div>
          ${web.url ? `<h4>Sitio web</h4><div class="man-datos">
            ${dato("URL", web.url)}${dato("Dónde está el código", web.codigo_donde)}
            ${dato("Fotos", web.foto_url)}${dato("¿Los códigos cruzan con el PDF?", web.codigos_cruzan_con_pdf === true ? `sí (${web.codigos_en_comun || "?"} en común)` : web.codigos_cruzan_con_pdf === false ? "no" : "")}
          </div>` : ""}
          ${cob.total ? `<h4>Imágenes</h4><div class="man-datos">
            ${dato("Con foto", `${cob.con_foto || 0} de ${cob.total}`)}${dato("Correctas por código", cob.correcta_por_codigo)}
            ${dato("Origen principal", img.origen_primario)}</div>` : ""}
          ${(R.particularidades || []).length ? `<h4>Particularidades ⚠</h4>
            <ul class="man-part">${R.particularidades.map(p => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
          ${r.notas_md ? `<h4>Cómo se cargó</h4><div class="man-notas">${esc(r.notas_md).split("\n").filter(Boolean).map(t => `<p>${t.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</p>`).join("")}</div>` : ""}
          <h4>Listas cargadas</h4>
          ${hist.length ? `<table class="man-hist"><tr><th>Fecha</th><th>Tipo</th><th>Resultado</th><th>Quién</th></tr>
            ${hist.map(l => {
              const s = l.resumen || {};
              const txt = s.tipo === "actualizacion"
                ? `${s.precio_subio || 0} ↑ · ${s.precio_bajo || 0} ↓ · ${s.productos_nuevos || 0} nuevos${s.faltantes ? ` · ${s.faltantes} bajas` : ""}`
                : `${s.productos_nuevos || 0} productos · ${s.con_ficha || 0} con ficha`;
              return `<tr><td>${l.cargada ? new Date(l.cargada).toLocaleDateString("es-AR") : "—"}</td>
                <td>${l.tipo === "actualizacion" ? "actualización" : esc(l.tipo)}</td><td>${txt}</td><td>${esc(l.autor || "—")}</td></tr>`;
            }).join("")}</table>`
            : `<div class="empty-mini">Sin listas registradas todavía.</div>`}
        </div></div>`;
    }).join("");
  }

  /* ============ NUEVAS INTEGRACIONES (Fase 3: revisar / aprobar lo importado) ============ */
  // Lo que el worker cargó en `competencia_extra` está "crudo" (specs + precio, sin matchear
  // con un SKU de Leuk). Acá se revisa: aprobar todo el portfolio o uno por uno. Los aprobados
  // (aprobado=true) quedan listos para el paso siguiente (matching → comparación head-to-head).
  let INTEG = [];
  async function traerIntegraciones() {
    const rows = [], step = 1000;                     // PostgREST corta en 1000: pagino con Range
    for (let from = 0; ; from += step) {
      const r = await fetch(`${SB.url}/rest/v1/competencia_extra?select=id,marca,nombre,familia,precio_usd,ficha,aprobado,imagen&order=marca.asc,familia.asc,nombre.asc`,
        { headers: Object.assign(AUTHSES.head(), { Range: `${from}-${from + step - 1}` }) });
      if (!r.ok) break;
      const chunk = await r.json(); rows.push(...chunk);
      if (chunk.length < step) break;
    }
    return rows;
  }
  async function guardarAprob(filtro, val, retried) {  // filtro = query PostgREST (id=eq… o marca=eq…)
    const r = await fetch(`${SB.url}/rest/v1/competencia_extra?${filtro}`, {
      method: "PATCH", headers: Object.assign(AUTHSES.head(), { Prefer: "return=minimal" }),
      body: JSON.stringify({ aprobado: val }),
    });
    if ((r.status === 401 || r.status === 403) && !retried) { if (await AUTHSES.refresh()) return guardarAprob(filtro, val, true); }
    return r.ok;
  }
  const estAprob = a => a === true ? "aprobado" : a === false ? "descartado" : "pendiente";

  async function renderIntegraciones() {
    const host = $("#page-integraciones"); if (!host) return;
    if (!puedeIntegrar()) { host.innerHTML = `<div class="res-intro">No tenés permiso para ver esta sección.</div>`; return; }
    host.innerHTML = `<div class="res-intro">Productos <b>importados</b> de competidores, listos para revisar. Aprobá todo el portfolio o seleccioná uno por uno. Los <b>aprobados</b> pasan al paso siguiente (comparación head-to-head contra Leuk).</div>
      <div class="intg-bar"><input id="intgSearch" type="search" class="intg-search" placeholder="Buscar por nombre o familia…" autocomplete="off"><span id="intgStat" class="intg-stat"></span></div>
      <div id="intgBody"><div class="empty-mini">Cargando integraciones…</div></div>`;
    INTEG = await traerIntegraciones();
    const s = $("#intgSearch"); if (s) s.addEventListener("input", () => paintInteg(s.value));
    paintInteg("");
  }
  function paintInteg(filtro) {
    const body = $("#intgBody"), stat = $("#intgStat"); if (!body) return;
    if (!INTEG.length) { body.innerHTML = `<div class="empty-mini">Todavía no hay productos importados. El alta de un competidor la hace Análisis Comercial con el asistente de alta; las listas nuevas de marcas ya cargadas se suben desde <b>↻ Actualizar lista</b>.</div>`; if (stat) stat.textContent = ""; return; }
    const f = norm(filtro);
    const ap = INTEG.filter(p => p.aprobado === true).length, de = INTEG.filter(p => p.aprobado === false).length;
    if (stat) stat.textContent = `${INTEG.length} productos · ${ap} aprobados · ${de} descartados · ${INTEG.length - ap - de} sin revisar`;
    const porMarca = {};
    INTEG.forEach(p => { (porMarca[p.marca] = porMarca[p.marca] || []).push(p); });
    const CAP = 400;
    body.innerHTML = Object.entries(porMarca).map(([marca, prods]) => {
      const vis = f ? prods.filter(p => norm(p.nombre).includes(f) || norm(p.familia).includes(f)) : prods;
      const a = prods.filter(p => p.aprobado === true).length, d = prods.filter(p => p.aprobado === false).length;
      const rows = vis.slice(0, CAP).map(p => {
        const specs = Object.values(p.ficha || {}).slice(0, 3).map(String).join(" · ").replace(/[<>]/g, "");
        const thumb = p.imagen
          ? `<img class="intg-thumb" src="${p.imagen}" loading="lazy" alt="" data-full="${p.imagen}">`
          : `<div class="intg-thumb intg-thumb-none">sin foto</div>`;
        return `<div class="intg-row ${estAprob(p.aprobado)}">
          ${thumb}
          <div class="intg-info"><b>${(p.nombre || "—").replace(/[<>]/g, "")}</b> <span class="leuk-fam">${(p.familia || "").replace(/[<>]/g, "")}</span>
            <div class="leuk-fam intg-specs">${fmtUsd(p.precio_usd)}${specs ? " · " + specs : ""}</div></div>
          <div class="intg-acts">
            <button class="intg-b intg-ficha-b" data-act="ficha" data-id="${p.id}">📋 Ficha</button>
            <button class="intg-b intg-ok ${p.aprobado === true ? "on" : ""}" data-act="ok" data-id="${p.id}">✓ Aprobar</button>
            <button class="intg-b intg-no ${p.aprobado === false ? "on" : ""}" data-act="no" data-id="${p.id}">✕ Descartar</button>
          </div></div>`;
      }).join("");
      return `<div class="intg-marca">
        <div class="intg-marca-head">
          <div><h3>${marca.replace(/[<>]/g, "")}</h3><span class="leuk-fam">${prods.length} productos · ${a} aprobados · ${d} descartados</span></div>
          <div class="intg-bulk">
            ${prods.some(p => !p.imagen) ? `<button class="btn-ghost" data-bulk="foto" data-marca="${marca.replace(/"/g, "")}">✓ Aprobar los que tienen foto</button>` : ""}
            ${prods.some(p => p.imagen && !tienePrecio(p)) ? `<button class="btn-ghost" data-bulk="fotoprecio" data-marca="${marca.replace(/"/g, "")}">✓ Aprobar los que tienen foto y precio</button>` : ""}
            <button class="btn-ghost" data-bulk="ok" data-marca="${marca.replace(/"/g, "")}">✓ Aprobar todo</button>
            <button class="btn-ghost" data-bulk="no" data-marca="${marca.replace(/"/g, "")}">✕ Descartar todo</button>
          </div></div>
        <div class="intg-list">${rows || `<div class="empty-mini">Sin resultados para “${(filtro || "").replace(/[<>]/g, "")}”.</div>`}</div>
        ${vis.length > CAP ? `<div class="leuk-fam" style="padding:8px 4px">Mostrando ${CAP} de ${vis.length}. Usá el buscador para acotar.</div>` : ""}
      </div>`;
    }).join("");
  }
  // precio en 0 o vacío = sin precio (hay listas que traen US$ 0 cuando falta el dato)
  const tienePrecio = p => Number(p.precio_usd) > 0;
  // acciones de aprobar/descartar (delegado, una sola vez)
  function abrirLightbox(src) {
    const ov = el("div", "intg-lb");
    ov.innerHTML = `<img src="${src}" alt=""><button class="intg-lb-x" title="Cerrar">✕</button>`;
    ov.addEventListener("click", () => ov.remove());
    document.body.appendChild(ov);
  }
  // Ficha técnica completa del producto importado (todos los specs que el worker sacó del PDF)
  const FICHA_LABELS = {
    fuente_luz: "Fuente de luz", potencia_w: "Potencia (W)", lumenes: "Lúmenes",
    eficiencia_lmw: "Eficiencia (lm/W)", tension_v: "Tensión (V)", angulo_haz: "Ángulo de haz",
    cri: "CRI", temp_color_k: "Temp. de color (K)", ugr: "UGR", ip: "IP",
    fijacion_montaje: "Fijación / montaje", medidas: "Medidas", movimiento: "Movimiento",
    color_artefacto: "Color del artefacto", control: "Control", garantia: "Garantía",
  };
  const _escF = s => (s == null ? "" : String(s)).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function abrirFicha(p) {
    const ficha = p.ficha || {};
    // Orden preferido de campos conocidos + cualquier extra que traiga el JSON
    const claves = Object.keys(FICHA_LABELS).filter(k => ficha[k] != null && String(ficha[k]).trim() !== "")
      .concat(Object.keys(ficha).filter(k => !(k in FICHA_LABELS) && String(ficha[k]).trim() !== ""));
    const rows = claves.length
      ? claves.map(k => `<div class="intg-fk-row"><div class="k">${_escF(FICHA_LABELS[k] || k)}</div><div class="v">${_escF(ficha[k])}</div></div>`).join("")
      : `<div class="empty-mini">Este producto no trae specs en la ficha.</div>`;
    const img = p.imagen
      ? `<img class="intg-fk-img" src="${_escF(p.imagen)}" alt="">`
      : `<div class="intg-fk-img intg-thumb-none">sin foto</div>`;
    const ov = el("div", "intg-fk");
    ov.innerHTML = `<div class="intg-fk-card" role="dialog" aria-label="Ficha técnica">
        <button class="intg-fk-x" title="Cerrar">✕</button>
        <div class="intg-fk-head">
          ${img}
          <div class="intg-fk-title">
            <div class="intg-fk-marca">${_escF(p.marca)}</div>
            <h3>${_escF(p.nombre || "—")}</h3>
            ${p.familia ? `<div class="intg-fk-fam">${_escF(p.familia)}</div>` : ""}
            ${p.precio_usd != null ? `<div class="intg-fk-precio">${_escF(fmtUsd(p.precio_usd))}</div>` : ""}
          </div>
        </div>
        <div class="intg-fk-body">${rows}</div>
      </div>`;
    // click fuera de la tarjeta o en la X = cerrar
    ov.addEventListener("click", ev => { if (ev.target === ov || ev.target.closest(".intg-fk-x")) ov.remove(); });
    document.body.appendChild(ov);
  }
  document.addEventListener("click", async ev => {
    const th = ev.target.closest(".intg-thumb[data-full]");
    if (th) { abrirLightbox(th.dataset.full); return; }
    const fk = ev.target.closest('.intg-b[data-act="ficha"]');
    if (fk) { const p = INTEG.find(x => x.id === fk.dataset.id); if (p) abrirFicha(p); return; }
    const one = ev.target.closest(".intg-b[data-act]");
    if (one) {
      const id = one.dataset.id, val = one.dataset.act === "ok";
      const p = INTEG.find(x => x.id === id); if (!p) return;
      const nuevo = (p.aprobado === val) ? null : val;   // volver a tocar el mismo = des-marcar (sin revisar)
      one.disabled = true;
      const ok = await guardarAprob(`id=eq.${id}`, nuevo);
      if (!ok) { alert("No se pudo guardar. ¿Corriste el SQL de la Fase 3 (columna 'aprobado' + policy)?"); one.disabled = false; return; }
      p.aprobado = nuevo; paintInteg($("#intgSearch") ? $("#intgSearch").value : "");
      return;
    }
    const bulk = ev.target.closest("[data-bulk]");
    if (bulk && $("#page-integraciones") && !$("#page-integraciones").classList.contains("hidden")) {
      const marca = bulk.dataset.marca, modo = bulk.dataset.bulk, val = modo !== "no";
      const dela = INTEG.filter(p => p.marca === marca);
      // "foto": aprueba sólo los que tienen imagen. Un producto sin foto pierde DOS de las tres
      // señales (la visual y la etiqueta, que se saca mirando la foto), así que nunca llegaría a
      // una equivalencia confiable: mejor dejarlo sin revisar que aprobarlo a ciegas.
      // "fotoprecio": además exige precio > 0 (sin precio no hay comparación de precios posible).
      const entra = p => modo === "foto" ? !!p.imagen : modo === "fotoprecio" ? !!p.imagen && tienePrecio(p) : true;
      const n = dela.filter(entra).length;
      const txt = modo === "foto"
        ? `¿Aprobar los ${n} productos de ${marca} que tienen foto? Los ${dela.length - n} sin foto quedan sin revisar.`
        : modo === "fotoprecio"
        ? `¿Aprobar los ${n} productos de ${marca} que tienen foto y precio? Los ${dela.length - n} restantes quedan sin revisar.`
        : `¿${val ? "Aprobar" : "Descartar"} TODO el portfolio de ${marca}? (${n} productos)`;
      if (!n) { alert(`No hay productos de ${marca} que cumplan la condición.`); return; }
      if (!confirm(txt)) return;
      const filtro = `marca=eq.${encodeURIComponent(marca)}` + (modo === "foto" ? "&imagen=not.is.null"
        : modo === "fotoprecio" ? "&imagen=not.is.null&precio_usd=gt.0" : "");
      const ok = await guardarAprob(filtro, val);
      if (!ok) { alert("No se pudo guardar. ¿Corriste el SQL de la Fase 3?"); return; }
      INTEG.forEach(p => { if (p.marca === marca && entra(p)) p.aprobado = val; });
      paintInteg($("#intgSearch") ? $("#intgSearch").value : "");
    }
  });

  /* ===================== NAV ===================== */
  const PAGES = ["inicio", "comparaciones", "resultados", "decisiones", "integraciones", "manual", "fichas", "firmas", "stock", "reingresos", "eventos", "contenidos", "contenidos-ig", "contenidos-mail", "tareas", "acciones", "usuarios", "kpis"];
  // Navegación en 2 niveles: MÓDULO (Inicio · Benchmark · Diseño) → páginas del módulo.
  // Sumar una página a Diseño = agregar una línea acá, nada más.
  const MODULOS = {
    benchmark: {
      label: "Benchmark",
      pages: [{ p: "comparaciones", t: "Catálogo" },
              { p: "resultados", t: "Comparaciones", count: true },
              { p: "decisiones", t: "Insights" },
              { p: "integraciones", t: "Nuevas integraciones", gate: () => puedeIntegrar() },
              { p: "manual", t: "Manual de carga" }],
    },
    diseno: {
      label: "Diseño",
      pages: [{ p: "fichas", t: "Fichas técnicas" },
              { p: "firmas", t: "Firmas de mail" },
              { p: "stock", t: "Stock diario" },
              { p: "reingresos", t: "Reingresos" }],
    },
    eventos: {
      label: "Eventos",
      pages: [{ p: "eventos", t: "Check-in & Sorteo" }],
    },
    // Un cronograma por canal, cada uno su propia página. Sumar LinkedIn son
    // cuatro líneas: acá, en PAGES, en index.html y en CANALES de contenidos.js.
    contenidos: {
      label: "Contenidos",
      pages: [{ p: "contenidos", t: "💬 Comunidad de WhatsApp" },
              { p: "contenidos-ig", t: "📸 Instagram" },
              { p: "contenidos-mail", t: "✉️ Mailing" }],
    },
    // Sólo el equipo de marketing (ver esMarketing): no está en ROLES.mods a propósito.
    tareas: {
      label: "Tareas",
      pages: [{ p: "tareas", t: "Equipo de marketing" }],
    },
    // Seguimiento de acciones (alianzas, eventos, sponsoreos…): sólo Admin y Líder (ver ROLES).
    acciones: {
      label: "Acciones",
      pages: [{ p: "acciones", t: "Seguimiento de acciones" }],
    },
    usuarios: {                                     // sólo admin (ver ROLES)
      label: "Usuarios",
      pages: [{ p: "usuarios", t: "Equipo" },
              { p: "kpis", t: "KPIs por canal" }],        // qué se mide en Resultados (resultados.js)
    },
  };
  const MOD_DE = {};                                // página -> módulo al que pertenece
  Object.entries(MODULOS).forEach(([m, o]) => o.pages.forEach(x => { MOD_DE[x.p] = m; }));
  const ULTIMA_PAG = {};                            // módulo -> última página visitada (para volver donde estabas)

  // ---- MENÚ LATERAL ---------------------------------------------------------
  // MODULOS (arriba) sigue siendo la unidad de PERMISOS: qué ve cada rol. GRUPOS es sólo
  // cómo se ORDENA en pantalla, por tarea: una página puede estar en un grupo distinto al
  // de su módulo (ej. Fichas técnicas es del módulo Diseño pero se muestra en Producto).
  // Sumar una página al menú = una línea en PAG + ponerla en el grupo que corresponda.
  const PAG = {
    inicio:          { t: "Mi día",               ic: "home" },
    tareas:          { t: "Tareas",               ic: "view_kanban",  badge: "tareas" },
    acciones:        { t: "Acciones",             ic: "campaign",     badge: "acciones" },
    eventos:         { t: "Eventos",              ic: "confirmation_number" },
    contenidos:      { t: "Comunidad WhatsApp",   ic: "chat" },
    "contenidos-ig": { t: "Instagram",            ic: "photo_camera" },
    "contenidos-mail": { t: "Mailing",            ic: "mail" },
    comparaciones:   { t: "Catálogo",             ic: "search" },
    resultados:      { t: "Comparaciones",        ic: "compare_arrows", count: true },
    decisiones:      { t: "Insights",             ic: "insights" },
    fichas:          { t: "Fichas técnicas",      ic: "description" },
    firmas:          { t: "Firmas de mail",       ic: "signature" },
    stock:           { t: "Stock diario",         ic: "inventory_2" },
    reingresos:      { t: "Reingresos",           ic: "assignment_return" },
    integraciones:   { t: "Nuevas integraciones", ic: "move_to_inbox" },
    manual:          { t: "Manual de carga",      ic: "menu_book" },
    usuarios:        { t: "Usuarios",             ic: "group" },
    kpis:            { t: "KPIs por canal",       ic: "monitoring" },
  };
  // Acciones sueltas del menú (abren un modal, no son páginas). `ver` = quién la ve.
  const ACT = {
    precios: { t: "Subir precios",      ic: "upload",   ver: () => puedeVer("benchmark") && puedePrecios(), fn: () => openPrecios(),
               title: "Actualizar precios desde una lista (Excel)" },
    costos:  { t: "Subir costos",       ic: "payments", ver: () => puedeVer("benchmark") && puedeCostos(), fn: () => openCostos(),
               title: "Actualizar costos desde una lista (Excel) — sólo Admin y Líder" },
    lista:   { t: "Actualizar lista",   ic: "sync",     ver: () => puedeVer("benchmark") && puedeIntegrar(), fn: () => openActualizar(),
               title: "Subir la lista de precios nueva de una marca ya cargada" },
  };
  // `badge` en el grupo: ahí pinta su contador el módulo (Contenidos cuenta sus dos canales juntos).
  const GRUPOS = [
    { items: ["inicio"] },
    { g: "Planificación",      items: ["tareas", "acciones", "eventos"] },
    { g: "Contenidos",         items: ["contenidos", "contenidos-ig", "contenidos-mail"], badge: "contenidos" },
    { g: "Producto y precios", items: ["comparaciones", "resultados", "decisiones", "fichas"] },
    { g: "Generadores",        items: ["firmas", "stock", "reingresos"] },
    { g: "Administración",     items: ["integraciones", "manual", "usuarios", "kpis", "@precios", "@costos", "@lista"], abajo: true },
  ];
  const GRUPO_DE = {};                              // página -> nombre del grupo (para la barra de página)
  GRUPOS.forEach(g => g.items.forEach(i => { GRUPO_DE[i] = g.g || ""; }));
  function puedeVerPagina(page) {
    if (page === "inicio") return true;
    const mod = MOD_DE[page];
    if (!mod || !puedeVer(mod)) return false;
    const pcfg = MODULOS[mod].pages.find(x => x.p === page);
    return !(pcfg && pcfg.gate && !pcfg.gate());
  }
  function renderNav() {
    const nav = $("#nav"); if (!nav) return;
    const actual = (nav.querySelector(".nv-item.on") || {}).dataset;
    const item = i => {
      if (i[0] === "@") {
        const a = ACT[i.slice(1)];
        return a.ver() ? `<button class="nv-item nv-act" data-act="${i.slice(1)}" title="${a.title}">
          <span class="ms">${a.ic}</span><span class="nv-t">${a.t}</span></button>` : "";
      }
      if (!puedeVerPagina(i)) return "";
      const c = PAG[i];
      return `<button class="nv-item" data-page="${i}"${c.badge ? ` data-mod="${c.badge}"` : ""}>` +
        `<span class="ms">${c.ic}</span><span class="nv-t">${c.t}</span>` +
        (c.count ? `<span id="navCount" class="nav-count"></span>` : "") + `</button>`;
    };
    nav.innerHTML = GRUPOS.map(g => {
      const html = g.items.map(item).join("");
      if (!html) return "";                         // grupo sin nada visible para este rol: no se muestra
      // Administración se pliega: se usa poco y en una notebook no entra todo el menú.
      if (g.abajo) return `<div class="nv-grupo abajo${adminAbierto() ? "" : " plegado"}">
        <button class="nv-g nv-plegar" aria-expanded="${adminAbierto()}">${g.g}<span class="nv-flecha">▾</span></button>
        <div class="nv-cuerpo">${html}</div></div>`;
      return `<div class="nv-grupo">` +
        (g.g ? `<div class="nv-g"${g.badge ? ` data-mod="${g.badge}"` : ""}>${g.g}</div>` : "") + html + `</div>`;
    }).join("");
    if (actual && actual.page) marcarNav(actual.page);
    updateNavCount();
  }
  const adminAbierto = () => { try { return localStorage.getItem("nav_admin") === "1"; } catch (e) { return false; } };
  function plegarAdmin(abierto) {
    try { localStorage.setItem("nav_admin", abierto ? "1" : "0"); } catch (e) { }
    const g = $("#nav .nv-grupo.abajo"); if (!g) return;
    g.classList.toggle("plegado", !abierto);
    g.querySelector(".nv-plegar").setAttribute("aria-expanded", abierto);
  }
  function marcarNav(page) {
    $("#nav").querySelectorAll(".nv-item[data-page]").forEach(x => x.classList.toggle("on", x.dataset.page === page));
    // si la página activa está en Administración, el grupo tiene que verse abierto
    if (GRUPO_DE[page] === "Administración") plegarAdmin(true);
    const t = $("#tbTitle"); if (t) t.textContent = (PAG[page] || {}).t || "";
  }
  // Barra de la página: sólo la llevan las páginas con herramientas propias (hoy, las de
  // Benchmark: ⚙ Descuentos). El resto ya trae su propia barra (Contenidos, Tareas…).
  function renderSubbar(mod, page) {
    const bar = $("#subbar"); if (!bar) return;
    if (mod !== "benchmark") { bar.classList.add("hidden"); return; }
    bar.classList.remove("hidden");
    $("#sbLabel").textContent = GRUPO_DE[page] || "";
    $("#sbTitle").textContent = (PAG[page] || {}).t || "";
  }
  const abrirMenu = si => document.body.classList.toggle("nav-abierto", si);

  // ---- AYUDA ---------------------------------------------------------------
  // El "cómo se usa" de cada sección. Se abre desde el botón ? (abajo del menú / arriba en
  // celular): un panel con un desplegable por sección, abierto en la página donde estás.
  // Sólo se listan las secciones que la persona puede ver. Un paso con `ver` se muestra
  // sólo si esa función da true (ej. subir costos = Admin y Líder).
  const AYUDA = [
    { t: "Catálogo, Comparaciones e Insights", ic: "search", pages: ["comparaciones", "resultados", "decisiones"], pasos: [
      "<b>Buscá un producto</b> en <b>Catálogo</b> (por SKU, nombre o familia) y abrilo para ver sus equivalentes.",
      "<b>Revisá el match:</b> cada equivalente muestra <b>cuántas de las 3 señales coinciden</b> (técnica, forma, imagen). Cuantas más, más confiable.",
      "Los equivalentes <b>sin precio o marcados con ⚠</b> pueden ser de otra gama: revisalos antes de seleccionarlos.",
      "<b>Seleccioná</b> las válidas con “＋ Seleccionar”: quedan <b>compartidas con todo el equipo</b> en <b>Comparaciones</b>, donde las filtrás y las exportás a Excel.",
      "En <b>Insights</b> ves la posición de precio y las oportunidades sobre lo seleccionado.",
      "Con <b>⚙ Descuentos</b> (arriba a la derecha) simulás el precio neto con otros descuentos. Es sólo para vos: no cambia lo que ve el resto."] },
    { t: "Carga de datos", ic: "upload", pages: ["integraciones", "manual"], pasos: [
      ["<b>Subir precios</b> (en Administración): subís la lista de una marca en Excel, con una columna de código o SKU y una de precio.", () => puedePrecios()],
      ["<b>Subir costos</b>: Excel con <b>SKU y Costo en US$</b>. Los ven sólo Admin y Líder y nunca quedan en un archivo público.", () => puedeCostos()],
      ["<b>Actualizar lista</b>: subís la lista nueva de una marca que ya está cargada y se cruza sola con la anterior.", () => puedeIntegrar()],
      ["En <b>Nuevas integraciones</b> revisás lo importado de un competidor nuevo y lo aprobás o descartás. Conviene aprobar los que tienen foto.", () => puedeIntegrar()],
      "El <b>Manual de carga</b> tiene la receta de cada marca: moneda, IVA, dónde está el código y las particularidades de su lista."] },
    { t: "Fichas técnicas", ic: "description", pages: ["fichas"], pasos: [
      "<b>Buscá la ficha</b> por nombre de línea, producto o SKU.",
      "Revisá la vista previa: foto, dibujo técnico, especificaciones y curvas fotométricas.",
      "<b>Descargá el PDF</b>: si la línea tiene varias hojas, salen todas en un archivo."] },
    { t: "Firmas de mail", ic: "signature", pages: ["firmas"], pasos: [
      "Subí la base del equipo (.xlsx o .csv) con <b>Nombre y Apellido, Rol, Teléfono, Dirección y Link Web</b>.",
      "Revisá la vista previa y <b>descargá las firmas en PDF</b>, una por persona, con el diseño oficial de Leuk."] },
    { t: "Stock diario", ic: "inventory_2", pages: ["stock"], pasos: [
      "Cargá el <b>Stock (.xlsx)</b>. Si cambiaron, actualizá también <b>Familias (.xlsx)</b> y <b>Fotos (.zip)</b>.",
      "Elegí la <b>fecha</b>, revisá la vista previa y <b>descargá el PDF</b>.",
      "En <b>Personalizar</b> cambiás logo y fuentes; queda guardado para la próxima."] },
    { t: "Reingresos", ic: "assignment_return", pages: ["reingresos"], pasos: [
      "Seguí los <b>pasos 1 a 5</b>: título y aviso → Excel/CSV con los reingresos (detecta SKU, nombre y color) → fotos en ZIP → ajuste de productos → descarga.",
      "Las fotos se matchean solas por <b>SKU o nombre</b> del archivo (ej. “6832.jpg”).",
      "Descargás la pieza en <b>PDF o JPG</b>.",
      "En <b>Configurar una vez</b> guardás el estándar de marca (logo, portada, fuentes) para los próximos reingresos."] },
    { t: "Eventos", ic: "confirmation_number", pages: ["eventos"], pasos: [
      "<b>Marcá presente</b> a cada persona cuando llega: el estado se comparte en vivo con quien tenga la app abierta.",
      "La <b>encuesta</b> (la del QR) se cruza sola por mail: presente + encuesta = <b>habilitado</b> para el sorteo.",
      "En <b>Sorteo</b> elegís un ganador al azar entre los habilitados, con animación.",
      "En <b>Configuración</b> importás la lista de inscriptos y las respuestas desde Google Sheets o Excel."] },
    { t: "Contenidos", ic: "chat", pages: ["contenidos", "contenidos-ig", "contenidos-mail"], pasos: [
      "Elegí el canal en el menú (<b>Comunidad WhatsApp</b>, <b>Instagram</b> o <b>Mailing</b>) y el <b>mes</b> arriba. Debajo ves quién <b>hace</b> y quién <b>revisa</b> ese canal.",
      "En <b>Instagram</b> elegís el perfil arriba (<b>Leuk</b> o <b>Laftdren</b>): cada uno tiene su propio cronograma, feed, Resultados y avisos.",
      "En <b>Fichas</b> tenés la lista del mes a la izquierda (fecha, estado y a quién le toca) y la pieza abierta a la derecha. También está el <b>Calendario</b> y, en Instagram, el <b>Feed</b>.",
      "El recorrido: <b>Borrador → Precisa feedback → Con ajustes / Listo para publicar → Publicado</b>. Quien hace toca <b>Pedir feedback</b>; quien revisa decide <b>Con ajustes</b> o <b>Listo para publicar</b>; cuando sale, quien hace la marca <b>Publicado</b>. A cada uno le llega el aviso cuando le toca.",
      "Para cambiar la fecha, <b>arrastrá la pieza</b> a otro día del calendario (en el celular: tocá ✥ y después el día).",
      "Dejá <b>comentarios</b> en 💬, o seleccioná un tramo del copy para <b>sugerir un cambio</b>: queda marcado hasta que alguien lo acepta o descarta.",
      "Con sugerencias sin resolver no se puede marcar <b>Listo para publicar</b>. Los ajustes se van tildando como resueltos en los comentarios.",
      "Con <b>⧉ Copiar</b> te llevás el mensaje listo para pegar; los <b>*asteriscos*</b> son la negrita de WhatsApp y van tal cual.",
      "En <b>Mailing</b> cada envío es un <b>archivo</b>: subí el <b>.html</b> (o las imágenes en orden) y lo ves en la ficha, en escritorio y en celular. Elegí el <b>destino</b> (Profesionales o Distribuidores): de eso depende qué conversión se mide.",
      "En <b>📈 Resultados</b> ves el embudo, la evolución de cada KPI y el histórico del canal. Quien hace el canal carga los números crudos abajo (a las 48 h de cada pieza, y los del mes); los % y totales los calcula la plataforma."] },
    { t: "Tareas", ic: "view_kanban", pages: ["tareas"], pasos: [
      "Creá una tarea con <b>＋ Nueva tarea</b> y asignale <b>responsable, fecha, prioridad y área</b>. Si es un hito, marcale la <b>★</b>.",
      "En <b>▦ Tablero</b> la arrastrás de columna a medida que avanza: <b>por hacer → en curso → en revisión → hecha</b>.",
      "En <b>☰ Lista</b> ves todo agrupado por vencimiento, y en <b>📅 Calendario</b> arrastrás una tarea a otro día para moverle la fecha.",
      "Abrí cualquier tarea para sumarle un <b>checklist</b> de pasos y dejar <b>comentarios</b> al equipo.",
      "Escribí <b>@</b> en un comentario o en un paso del checklist para <b>mencionar</b> a alguien del equipo.",
      "El número al lado de <b>Tareas</b> en el menú son las tuyas que vencen hoy o ya vencieron, más las menciones nuevas."] },
    { t: "Acciones", ic: "campaign", pages: ["acciones"], pasos: [
      "Creá una acción con <b>＋ Nueva acción</b>: tipo, socio, fechas y responsable.",
      "Movela de estado a medida que avanza: <b>idea → evaluación → negociación → aprobada → en curso → finalizada</b>. Cada cambio queda en la línea de tiempo.",
      "En la <b>línea de tiempo</b> sumá propuestas, contrapropuestas, notas de reuniones y <b>archivos</b> (arrastrándolos a la ficha).",
      "Definí las <b>métricas esperadas</b> antes de arrancar; al terminar cargás las <b>reales</b> y ves el cumplimiento.",
      "Cargá la <b>inversión estimada y real</b>, y al cierre los <b>aprendizajes</b> para decidir si se repite."] },
    { t: "Usuarios", ic: "group", pages: ["usuarios"], pasos: [
      "<b>Agregá una persona</b> con su mail, nombre, rol y una contraseña temporal.",
      "<b>Cambiá el rol</b> cuando cambie de equipo: se aplica la próxima vez que entre.",
      "Tildá <b>Marketing</b> para que vea <b>Tareas</b> (es aparte del rol).",
      "<b>Quitá el acceso</b> con ✕: se elimina su cuenta y su rol."] },
    { t: "KPIs por canal", ic: "monitoring", pages: ["kpis"], pasos: [
      "Elegí el canal arriba. En <b>El canal</b> está su función, el objetivo y el <b>trimestre base</b> contra el que se compara.",
      "En <b>Datos que se cargan</b> definís los números crudos (por pieza o una vez por mes). Renombrar un dato no pierde lo cargado.",
      "Cada <b>KPI</b> es una fórmula de la lista (total, suma, promedio, división, resta, último valor) sobre esos datos. La <b>vista previa</b> muestra cuánto da con los datos reales.",
      "El <b>Embudo</b> se arma con 3 o 4 escalones, de alcance a acción.",
      "Nada se aplica hasta tocar <b>Guardar cambios</b>."] },
  ];
  function abrirAyuda() {
    const actual = ($("#nav .nv-item.on") || { dataset: {} }).dataset.page;
    const secs = AYUDA.filter(x => x.pages.some(puedeVerPagina)).map(x => {
      const pasos = x.pasos.filter(p => typeof p === "string" || p[1]()).map(p => typeof p === "string" ? p : p[0]);
      return pasos.length ? { ...x, pasos, aca: x.pages.includes(actual) } : null;
    }).filter(Boolean);
    secs.sort((a, b) => b.aca - a.aca);             // la sección donde estás, primero y abierta
    $("#ayudaBody").innerHTML = (secs.some(x => x.aca) ? "" :
      `<p class="ay-intro">Elegí una sección para ver cómo se usa.</p>`) +
      secs.map(x => `<details class="ay-sec"${x.aca ? " open" : ""}>
        <summary><span class="ms">${x.ic}</span><span class="ay-t">${x.t}</span>${x.aca ? `<span class="ay-aca">estás acá</span>` : ""}</summary>
        <ol class="home-steps">${x.pasos.map(t => `<li>${t}</li>`).join("")}</ol></details>`).join("");
    abrirMenu(false);
    document.body.classList.add("ayuda-abierta");
    $("#ayudaFab").setAttribute("aria-expanded", "true");
    $("#ayudaCerrar").focus();
  }
  function cerrarAyuda() {
    document.body.classList.remove("ayuda-abierta");
    $("#ayudaFab").setAttribute("aria-expanded", "false");
  }

  function goToPage(page) {
    if (!PAGES.includes(page)) page = "inicio";
    let mod = MOD_DE[page] || "inicio";
    // sin permiso sobre ese módulo → a Inicio (la Home ya se filtra por rol)
    if (mod !== "inicio" && !puedeVer(mod)) { page = "inicio"; mod = "inicio"; }
    // páginas con candado propio (ej: Nuevas integraciones = sólo puedeIntegrar())
    const pcfg = (MODULOS[mod] && MODULOS[mod].pages || []).find(x => x.p === page);
    if (pcfg && pcfg.gate && !pcfg.gate()) { page = "inicio"; mod = "inicio"; }
    if (MODULOS[mod]) ULTIMA_PAG[mod] = page;
    marcarNav(page);
    abrirMenu(false);
    $("#metaLine").textContent = mod === "benchmark" ? META_BENCH : "";   // pie sólo en Benchmark
    renderSubbar(mod, page);
    PAGES.forEach(p => { const el = $("#page-" + p); if (el) el.classList.toggle("hidden", p !== page); });
    if (page === "inicio") renderInicio();
    if (page === "resultados") { if (!$("#filters").children.length) buildFilters(); renderTabla(); sbPull().then(renderTabla); }
    if (page === "decisiones") { sbPull().then(renderDecisiones); renderDecisiones(); }
    if (page === "integraciones") renderIntegraciones();
    if (page === "manual") renderManual();
    // Fichas técnicas: lista con estado + la ficha dibujada, en una sola vista.
    // La arma fichas-panel.js uniendo fichas-ui.js (dibujo) con 06_API.gs (estado).
    if (page === "fichas" && window.renderFichas) window.renderFichas();
    // Firmas de mail: app autocontenida embebida. Se carga el iframe recién al entrar.
    if (page === "firmas") { const f = $("#firmasFrame"); if (f && !f.src) f.src = "firmas-mail.html?v=159"; }
    // Stock diario: app autocontenida embebida.
    if (page === "stock") { const f = $("#stockFrame"); if (f && !f.src) f.src = "stock-diario.html?v=7"; }
    // Reingresos: app autocontenida embebida.
    if (page === "reingresos") { const f = $("#reingresosFrame"); if (f && !f.src) f.src = "reingresos.html?v=3"; }
    // Eventos: app React autocontenida embebida (check-in + sorteo, estado compartido en Supabase).
    if (page === "eventos") { const f = $("#eventosFrame"); if (f && !f.src) f.src = "eventos.html?v=139"; }
    // Contenidos: un cronograma por canal (calendario + fichas + comentarios). Lo arma
    // contenidos.js, que sabe en qué contenedor dibujar según el canal que se le pasa.
    if (MOD_DE[page] === "contenidos" && window.renderContenidos) {
      window.renderContenidos(page === "contenidos-ig" ? "instagram" : page === "contenidos-mail" ? "mailing" : "whatsapp");
    }
    // Tareas del equipo de marketing: tablero + lista + calendario. Lo arma tareas.js.
    if (page === "tareas" && window.renderTareas) window.renderTareas();
    // Acciones de marketing: lista + ficha con línea de tiempo y métricas. Lo arma acciones.js.
    if (page === "acciones" && window.renderAcciones) window.renderAcciones();
    if (page === "usuarios") renderUsuarios();
    if (page === "kpis" && window.renderKpisConfig) window.renderKpisConfig();
    window.scrollTo({ top: 0 });
  }
  // Menú lateral: páginas (data-page) y acciones sueltas que abren un modal (data-act).
  $("#nav").addEventListener("click", ev => {
    if (ev.target.closest(".nv-plegar")) return plegarAdmin(!adminAbierto());
    const b = ev.target.closest(".nv-item"); if (!b) return;
    if (b.dataset.act) { abrirMenu(false); return ACT[b.dataset.act].fn(); }
    goToPage(b.dataset.page);
  });
  // Cajón del menú en celular/tablet
  $("#navOpen").addEventListener("click", () => abrirMenu(true));
  $("#navClose").addEventListener("click", () => abrirMenu(false));
  $("#sideScrim").addEventListener("click", () => abrirMenu(false));
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") { abrirMenu(false); cerrarAyuda(); } });
  // "⋯ Más" de los encabezados: se cierra al elegir algo o al tocar afuera
  document.addEventListener("click", ev => {
    document.querySelectorAll("details.mh-mas[open]").forEach(d => {
      if (!d.contains(ev.target) || ev.target.closest(".mh-mas-menu button")) d.removeAttribute("open");
    });
  });
  // el botón flotante abre y cierra (tocarlo de nuevo cierra el pop-up)
  $("#ayudaFab").addEventListener("click", () => document.body.classList.contains("ayuda-abierta") ? cerrarAyuda() : abrirAyuda());
  $("#ayudaCerrar").addEventListener("click", cerrarAyuda);
  $("#ayudaVelo").addEventListener("click", cerrarAyuda);

  /* ===================== USUARIOS (panel, sólo admin) ===================== */
  // Los roles/nombres se editan directo contra la tabla `perfiles` (RLS: sólo admin escribe).
  // Crear o eliminar la CUENTA de acceso necesita la llave maestra, que no puede estar en el
  // navegador → eso pasa por la función `gestion-usuarios` del servidor.
  const FN_USUARIOS = `${SB.url}/functions/v1/gestion-usuarios`;
  const ROL_OPCIONES = [
    ["admin", "Admin — todo, incluido gestionar usuarios"],
    ["lider", "Líder — todo (incluye costos), borra sólo lo suyo"],
    ["coordinacion", "Coordinación — todo menos costos"],
    ["comercial", "Comercial — sólo Benchmark, sin precios"],
    ["diseno", "Diseño — sólo Fichas técnicas"],
    ["representante", "Representante de marca — sólo Contenidos, lee y comenta"],
  ];
  async function llamarFn(accion, datos) {
    const r = await fetch(FN_USUARIOS, {
      method: "POST", headers: AUTHSES.head(),
      body: JSON.stringify(Object.assign({ accion }, datos)),
    });
    if (r.status === 404) throw new Error("FALTA_FN");
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "No se pudo completar la acción");
    return d;
  }
  async function traerPerfiles() {
    const r = await fetch(`${SB.url}/rest/v1/perfiles?select=*&order=rol`, { headers: AUTHSES.head() });
    return r.ok ? await r.json() : [];
  }
  async function renderUsuarios() {
    const cont = $("#usuarios"); if (!cont) return;
    if (!esAdmin()) { cont.innerHTML = `<div class="empty">Sólo un administrador puede ver esta sección.</div>`; return; }
    cont.innerHTML = `<div class="empty-mini">Cargando equipo…</div>`;
    const perfiles = await traerPerfiles();
    const yo = (AUTHSES.email() || "").toLowerCase();
    const rolLabel = r => (ROLES[ROL_ALIAS[r] || r] || {}).label || r;

    cont.innerHTML = `
      <div class="res-intro">Gestioná quién entra a <b>Leuk Marketing</b> y qué ve cada uno.
        Los cambios de rol se aplican la próxima vez que la persona entre.</div>
      <div class="us-add">
        <h3>Agregar persona</h3>
        <div class="us-form">
          <input id="usEmail" type="email" placeholder="mail@leukiluminacion.com.ar" autocomplete="off">
          <input id="usNombre" type="text" placeholder="Nombre y apellido" autocomplete="off">
          <select id="usRol">${ROL_OPCIONES.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select>
          <input id="usPass" type="text" placeholder="Contraseña inicial (mín. 8)" autocomplete="off">
          <button id="usAdd" class="btn-primary">Crear acceso</button>
        </div>
        <div id="usMsg" class="us-msg"></div>
      </div>
      <table class="us-tabla">
        <thead><tr><th>Persona</th><th>Rol</th><th title="Equipo de marketing: ve el módulo Tareas">Marketing</th><th>Ve</th><th></th></tr></thead>
        <tbody>${perfiles.map(p => {
          const cfg = ROLES[ROL_ALIAS[p.rol] || p.rol] || {};
          const soyYo = String(p.email).toLowerCase() === yo;
          return `<tr data-email="${p.email}">
            <td><b>${(p.nombre || "—").replace(/[<>]/g, "")}</b><br><span class="leuk-fam">${p.email}</span>
              ${soyYo ? ' <span class="tag-sug">vos</span>' : ""}</td>
            <td><select class="us-rol" ${soyYo ? "disabled" : ""}>
              ${ROL_OPCIONES.map(([v, t]) => `<option value="${v}" ${(ROL_ALIAS[p.rol] || p.rol) === v ? "selected" : ""}>${rolLabel(v)}</option>`).join("")}
            </select></td>
            <td class="us-mkt"><input type="checkbox" class="us-marketing" ${p.marketing ? "checked" : ""}
              title="Del equipo de marketing: ve Tareas" aria-label="Equipo de marketing"></td>
            <td class="leuk-fam">${[...(cfg.mods || []), ...(p.marketing || (ROL_ALIAS[p.rol] || p.rol) === "admin" ? ["tareas"] : [])]
              .map(m => (MODULOS[m] || {}).label || m).join(" · ") || "—"}</td>
            <td class="us-acc">${soyYo ? "" :
              `<button class="btn-ghost us-pass" title="Asignar una contraseña nueva">🔑</button>
               <button class="btn-ghost us-del" title="Quitar acceso">✕</button>`}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>`;

    const msg = (t, ok) => { const m = $("#usMsg"); m.textContent = t; m.className = "us-msg " + (ok ? "px-ok" : "px-err"); };

    // cambiar rol → directo a la tabla
    cont.querySelectorAll(".us-rol").forEach(sel => sel.onchange = async () => {
      const email = sel.closest("tr").dataset.email;
      const r = await fetch(`${SB.url}/rest/v1/perfiles?email=eq.${encodeURIComponent(email)}`, {
        method: "PATCH", headers: Object.assign(AUTHSES.head(), { Prefer: "return=representation" }),
        body: JSON.stringify({ rol: sel.value }),
      });
      const d = await r.json().catch(() => []);
      if (r.ok && d.length) msg(`Listo: ${email} ahora es ${sel.value}.`, true);
      else msg("No se pudo cambiar el rol (¿corriste el SQL de permisos?).", false);
    });

    // equipo de marketing → directo a la tabla (columna `marketing`, ver 2026-09-15-tareas.sql)
    cont.querySelectorAll(".us-marketing").forEach(chk => chk.onchange = async () => {
      const email = chk.closest("tr").dataset.email;
      const r = await fetch(`${SB.url}/rest/v1/perfiles?email=eq.${encodeURIComponent(email)}`, {
        method: "PATCH", headers: Object.assign(AUTHSES.head(), { Prefer: "return=representation" }),
        body: JSON.stringify({ marketing: chk.checked }),
      });
      const d = await r.json().catch(() => []);
      if (r.ok && d.length) {
        msg(chk.checked ? `Listo: ${email} ahora es del equipo de marketing y ve Tareas.` : `Listo: ${email} ya no ve Tareas.`, true);
        if (String(email).toLowerCase() === yo) { MARKETING = chk.checked; aplicarRol(); }
      } else {
        chk.checked = !chk.checked;
        msg("No se pudo guardar (¿corriste el SQL 2026-09-15-tareas.sql?).", false);
      }
    });

    // crear acceso (necesita la función del servidor)
    $("#usAdd").onclick = async () => {
      const email = $("#usEmail").value.trim(), nombre = $("#usNombre").value.trim();
      const rol = $("#usRol").value, pass = $("#usPass").value;
      if (!email || !pass) return msg("Completá el mail y una contraseña temporal.", false);
      $("#usAdd").disabled = true; msg("Creando…", true);
      try {
        await llamarFn("crear", { email, nombre, rol, password: pass });
        msg(`✓ Listo. Pasale a ${nombre || email} su mail y esta contraseña; puede cambiarla desde 👤 Mi cuenta.`, true);
        renderUsuarios();
      } catch (e) {
        msg(e.message === "FALTA_FN"
          ? "Falta desplegar la función 'gestion-usuarios' en Supabase para crear cuentas. Mientras tanto podés crear la cuenta en Supabase y asignarle el rol acá."
          : e.message, false);
      } finally { $("#usAdd").disabled = false; }
    };

    // contraseña nueva / quitar acceso
    cont.querySelectorAll(".us-pass").forEach(b => b.onclick = async () => {
      const email = b.closest("tr").dataset.email;
      const p = prompt(`Contraseña nueva para ${email} (mín. 8):`);
      if (!p) return;
      try { await llamarFn("password", { email, password: p }); msg(`✓ Contraseña actualizada para ${email}.`, true); }
      catch (e) { msg(e.message === "FALTA_FN" ? "Falta desplegar la función 'gestion-usuarios'." : e.message, false); }
    });
    cont.querySelectorAll(".us-del").forEach(b => b.onclick = async () => {
      const email = b.closest("tr").dataset.email;
      if (!confirm(`¿Quitar el acceso de ${email}?\n\nSe elimina su cuenta y su rol.`)) return;
      try { await llamarFn("eliminar", { email }); msg(`✓ ${email} ya no tiene acceso.`, true); renderUsuarios(); }
      catch (e) {
        if (e.message !== "FALTA_FN") return msg(e.message, false);
        // sin función: al menos se le saca el rol → queda sin acceso a nada
        const r = await fetch(`${SB.url}/rest/v1/perfiles?email=eq.${encodeURIComponent(email)}`, { method: "DELETE", headers: AUTHSES.head() });
        if (r.ok) { msg(`✓ Se le quitó el rol a ${email} (queda sin acceso). La cuenta sigue existiendo en Supabase.`, true); renderUsuarios(); }
        else msg("No se pudo quitar el acceso.", false);
      }
    });
  }

  /* ===================== INICIO (home) ===================== */
  /* ===================== AVISOS DEL SISTEMA (push web) =====================
     Los que llegan aunque la plataforma esté cerrada. Cada dispositivo se activa por
     separado (Mi cuenta, o la invitación de Mi día): el navegador arma una "suscripción"
     y se guarda en `push_suscripciones`. Quien manda los avisos es la Edge Function `push`,
     disparada por la base (ver supabase/sql/2026-09-29-notificaciones-push.sql).
     La clave pública VAPID puede estar acá; la privada vive sólo en los secretos de Supabase.
     En iPhone/iPad sólo funciona con la plataforma agregada a la pantalla de inicio. */
  const VAPID_PUBLIC = "BCbgoVb9qDaZ0Q-wNEBJ06lKOyoZ0xOrO1ELhAamh1ZZKcvqj7bnebTb8g1qccLj2ofaccstTyhWkfqJ3itrD68";
  const FN_PUSH = `${SB.url}/functions/v1/push`;
  const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const instalada = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const pushSoportado = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const bytesVapid = s => { const b = atob((s + "=".repeat((4 - s.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, c => c.charCodeAt(0)); };
  async function suscripcionActual() {
    if (!pushSoportado()) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? await reg.pushManager.getSubscription() : null;
  }
  // "activo" | "inactivo" | "bloqueado" | "ios" (iPhone sin instalar) | "no" (navegador sin soporte)
  async function pushEstado() {
    if (!pushSoportado()) return esIOS() && !instalada() ? "ios" : "no";
    if (Notification.permission === "denied") return "bloqueado";
    return (await suscripcionActual().catch(() => null)) ? "activo" : "inactivo";
  }
  async function guardarSuscripcion(sub) {
    const j = sub.toJSON();
    const r = await fetch(`${SB.url}/rest/v1/push_suscripciones?on_conflict=endpoint`, {
      method: "POST", headers: Object.assign(AUTHSES.head(), { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ endpoint: j.endpoint, email: (AUTHSES.email() || "").toLowerCase(),
        p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 200) }),
    });
    if (!r.ok) throw new Error(r.status === 404 ? "Falta correr el SQL de notificaciones en Supabase." : "No se pudo guardar este dispositivo.");
  }
  async function activarPush() {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error(perm === "denied"
      ? "El navegador bloqueó los avisos. Habilitalos desde el candado al lado de la dirección y volvé a probar."
      : "No se activaron: hace falta aceptar el permiso del navegador.");
    const reg = await navigator.serviceWorker.register("sw.js");
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription())
      || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesVapid(VAPID_PUBLIC) });
    await guardarSuscripcion(sub);
  }
  async function desactivarPush() {
    const sub = await suscripcionActual().catch(() => null); if (!sub) return;
    await fetch(`${SB.url}/rest/v1/push_suscripciones?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
      { method: "DELETE", headers: AUTHSES.head() }).catch(() => { });
    await sub.unsubscribe().catch(() => { });
  }
  async function probarPush() {
    const r = await fetch(FN_PUSH, { method: "POST", headers: AUTHSES.head(), body: JSON.stringify({ accion: "prueba" }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 404 ? "Falta desplegar la función 'push' en Supabase." : d.error || "No se pudo mandar la prueba.");
    return d.enviados || 0;
  }
  // Si este dispositivo ya estaba activado, se re-guarda al entrar (por si la fila se perdió).
  async function refrescarSuscripcion() {
    const sub = await suscripcionActual().catch(() => null);
    if (sub) guardarSuscripcion(sub).catch(() => { });
  }
  // Textos y botones según el estado (los usan Mi cuenta y la invitación de Mi día)
  const PUSH_TXT = {
    inactivo: "Recibí un aviso cuando te mencionan, te asignan una tarea o hay novedades en contenidos, aunque tengas la plataforma cerrada.",
    activo: "✓ Los avisos están activados en este dispositivo.",
    bloqueado: "El navegador tiene bloqueados los avisos de este sitio. Habilitalos desde el candado al lado de la dirección y volvé a entrar acá.",
    ios: "En iPhone o iPad los avisos llegan sólo si agregás la plataforma a la pantalla de inicio: tocá Compartir → “Agregar a inicio”, abrila desde ese ícono y activalos en Mi cuenta.",
    no: "Este navegador no permite avisos del sistema. Probá con Chrome, Edge o Safari actualizados.",
  };
  // Al tocar un aviso del sistema: la app se abre (o se trae al frente) con #tarea=… / #accion=… / #pieza=… / #hoy
  async function irDesdeLink(hash) {
    const m = String(hash || "").match(/^#(tarea|accion|pieza|hoy)(?:=([\w-]+))?$/); if (!m) return;
    history.replaceState(null, "", location.pathname + location.search);
    if (m[1] === "hoy") return goToPage("inicio");
    if (m[1] === "tarea" && puedeVer("tareas") && window.irATarea) return window.irATarea(m[2]);
    if (m[1] === "accion" && puedeVer("acciones") && window.irAAccion) return window.irAAccion(m[2]);
    if (m[1] === "pieza" && puedeVer("contenidos") && window.irAPieza) {
      const r = await fetch(`${SB.url}/rest/v1/contenidos?id=eq.${encodeURIComponent(m[2])}&select=id,canal,mes`, { headers: AUTHSES.head() }).catch(() => null);
      const [p] = r && r.ok ? await r.json() : [];
      if (p) window.irAPieza(p.id, p.canal, p.mes);
    }
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", e => {
    if (e.data && e.data.tipo === "ir") irDesdeLink(new URL(e.data.url).hash);
  });

  /* ===================== NOTIFICACIONES (pop-ups dentro de la app) =====================
     Cada 45 s se le pregunta a cada módulo qué hay para avisar (window.notisTareas /
     notisAcciones / notisContenidos; cada uno filtra por permiso). Acá se decide qué es
     NUEVO: se guarda, por persona, qué claves ya se mostraron. La primera vez que corre en
     una compu sólo se anota lo que ya existía, para no tirar decenas de avisos viejos.
     Una vez por día, además, un resumen de vencimientos (lo mismo que cuenta Mi día).
     Si la pestaña está en segundo plano, los avisos esperan a que vuelvas. */
  const NT_CADA = 45000, NT_DIAS = 3, NT_MAX = 3, NT_DURA = 9000;
  let NT_TIMER = null, NT_COLA = [], NT_CORRIENDO = false;
  const ntKey = () => "notis_vistas_v1:" + (AUTHSES.email() || "").toLowerCase();
  function ntLeer() { try { return JSON.parse(localStorage.getItem(ntKey())); } catch (e) { return null; } }
  function ntGuardar(v) {
    const corte = Date.now() - 20 * 864e5;           // se olvidan las claves viejas para que no crezca sin fin
    Object.keys(v).forEach(k => { if (v[k] < corte) delete v[k]; });
    try { localStorage.setItem(ntKey(), JSON.stringify(v)); } catch (e) { }
  }
  // Sonido propio de los avisos. Los del sistema en la Mac llegan mudos (Chrome y Safari ignoran
  // el pedido de sonido), así que con la plataforma abierta suena éste — aunque la pestaña esté
  // en segundo plano. Se genera acá (WebAudio, sin archivos). El navegador sólo deja sonar
  // después de que la persona tocó algo en la página: el primer clic "destraba" el audio.
  let NT_AUDIO = null;
  const ntSonidoOn = () => { try { return localStorage.getItem("notis_sonido") !== "0"; } catch (e) { return true; } };
  function ntDestrabarAudio() {
    if (NT_AUDIO || !(window.AudioContext || window.webkitAudioContext)) return;
    try { NT_AUDIO = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { }
  }
  ["pointerdown", "keydown"].forEach(t => document.addEventListener(t, ntDestrabarAudio, { once: true, capture: true }));
  function ntSonar() {
    if (!ntSonidoOn() || !NT_AUDIO) return;
    try {
      if (NT_AUDIO.state === "suspended") NT_AUDIO.resume();
      const t0 = NT_AUDIO.currentTime;
      [[880, 0], [1320, 0.12]].forEach(([f, d]) => {            // dos notas suaves: "din-don"
        const o = NT_AUDIO.createOscillator(), g = NT_AUDIO.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.35);
        o.connect(g).connect(NT_AUDIO.destination);
        o.start(t0 + d); o.stop(t0 + d + 0.4);
      });
    } catch (e) { }
  }
  function arrancarNotis() {
    clearInterval(NT_TIMER);
    if (!["tareas", "acciones", "contenidos"].some(puedeVer)) return;
    setTimeout(revisarNotis, 1500);                  // el arranque termina de desbloquear la sesión después de esto
    refrescarSuscripcion();
    NT_TIMER = setInterval(revisarNotis, NT_CADA);
  }
  async function revisarNotis() {
    if (NT_CORRIENDO || document.body.classList.contains("locked") || !AUTHSES.logged()) return;
    NT_CORRIENDO = true;
    try {
      const pedir = f => typeof f === "function" ? Promise.resolve().then(f).catch(() => null) : Promise.resolve(null);
      const evs = (await Promise.all([window.notisTareas, window.notisAcciones, window.notisContenidos].map(pedir))).flat().filter(Boolean);
      const hoy = new Date().toISOString().slice(0, 10);
      const venc = await resumenVencimientos();
      if (venc) evs.push({ key: "venc-" + hoy, ts: new Date().toISOString(), ic: "event_upcoming", tit: "Para hoy", txt: venc, ir: () => goToPage("inicio") });
      let vistas = ntLeer();
      const primera = !vistas; vistas = vistas || {};
      const limite = Date.now() - NT_DIAS * 864e5;
      const nuevos = evs.filter(e => !vistas[e.key] && (Date.parse(e.ts) || 0) > limite)
        .sort((a, b) => (Date.parse(b.ts) || 0) - (Date.parse(a.ts) || 0));
      evs.forEach(e => { if (!vistas[e.key]) vistas[e.key] = Date.now(); });
      ntGuardar(vistas);
      const mostrar = primera ? nuevos.filter(e => e.key.startsWith("venc-")) : nuevos;
      if (!mostrar.length) return;
      NT_COLA.push(...mostrar);
      ntSonar();
      pintarNotis();
      if (!$("#page-inicio").classList.contains("hidden")) renderInicio();   // Mi día al día
    } finally { NT_CORRIENDO = false; }
  }
  // "2 tareas vencen hoy o vencieron · 1 pieza sale hoy sin aprobar" (null si no hay nada)
  async function resumenVencimientos() {
    const pedir = f => typeof f === "function" ? Promise.resolve().then(f).catch(() => null) : Promise.resolve(null);
    const [t, c] = await Promise.all([pedir(window.miDiaTareas), pedir(window.miDiaContenidos)]);
    const nt = (t || []).filter(x => x.tipo === "tarea" && x.dias <= 0).length;
    const nc = (c || []).filter(x => x.tipo === "pieza" && x.dias === 0 && !x.ok).length;
    const partes = [nt ? `${nt} tarea${nt > 1 ? "s" : ""} tuya${nt > 1 ? "s" : ""} para hoy o vencida${nt > 1 ? "s" : ""}` : "",
                    nc ? `${nc} pieza${nc > 1 ? "s" : ""} sale${nc > 1 ? "n" : ""} hoy y no está${nc > 1 ? "n" : ""} lista${nc > 1 ? "s" : ""}` : ""].filter(Boolean);
    return partes.length ? partes.join(" · ") : null;
  }
  // Muestra lo que está en cola. Con la pestaña oculta espera (ver visibilitychange).
  function pintarNotis() {
    if (document.hidden || !NT_COLA.length) return;
    const caja = $("#notis"); if (!caja) return;
    let lote = NT_COLA.splice(0);
    if (lote.length > NT_MAX) {                        // una avalancha se resume en un solo aviso
      const resto = lote.length - (NT_MAX - 1);
      lote = [...lote.slice(0, NT_MAX - 1), { key: "resumen", ic: "notifications", tit: `Y ${resto} novedad${resto > 1 ? "es" : ""} más`,
        txt: "Las tenés todas en Mi día.", ir: () => goToPage("inicio") }];
    }
    lote.reverse().forEach(e => {                    // se apilan con prepend: al revés, para que el más nuevo quede arriba
      const n = document.createElement("div");
      n.className = "nt"; n.setAttribute("role", "status");
      n.innerHTML = `<span class="nt-ic"><span class="ms">${e.ic}</span></span>
        <div class="nt-txt"><b>${escH(e.tit)}</b><span>${escH(e.txt || "")}</span></div>
        <div class="nt-acc"><button class="nt-ver">Ver</button><button class="nt-x" aria-label="Cerrar aviso"><span class="ms">close</span></button></div>`;
      const cerrar = () => { n.classList.add("sale"); setTimeout(() => n.remove(), 180); };
      let t = setTimeout(cerrar, NT_DURA);
      n.onmouseenter = () => clearTimeout(t);          // si lo estás leyendo, no se va
      n.onmouseleave = () => { t = setTimeout(cerrar, NT_DURA / 2); };
      n.querySelector(".nt-ver").onclick = () => { cerrar(); e.ir && e.ir(); };
      n.querySelector(".nt-x").onclick = cerrar;
      caja.prepend(n);
    });
    [...caja.children].slice(NT_MAX).forEach(x => x.remove());
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { pintarNotis(); revisarNotis(); } });

  /* ===================== MI DÍA (Inicio) =====================
     La entrada a la plataforma: qué te toca hoy, sin tener que recorrer cada sección.
     Cada módulo aporta sus datos (window.miDiaTareas / miDiaContenidos / miDiaAcciones,
     cada uno ya filtra por permiso y devuelve null si no lo ves) y acá se juntan en
     una sola bandeja, en dos tramos: lo que necesita atención ya, y los próximos 7 días.
     Cada ítem lleva directo a lo suyo (window.irATarea / irAPieza / irAAccion). */
  let MD_SEQ = 0;                                   // descarta respuestas de una visita anterior
  const MD_MAX = 8;                                 // ítems por tramo antes del "ver más"
  const escH = t => String(t == null ? "" : t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const capi = t => t.charAt(0).toUpperCase() + t.slice(1);
  function renderInicio() {
    const cont = $("#inicio"); if (!cont) return;
    const nombre = NOMBRE || (AUTHSES.email() || "").split("@")[0];
    const fecha = capi(new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }));
    const conBandeja = ["tareas", "acciones", "contenidos"].some(puedeVer);

    cont.innerHTML = `<div class="md">
      <header class="md-head">
        <p class="md-fecha">${fecha}</p>
        <h1>Hola${nombre ? ", " + escH(nombre) : ""}</h1>
        <p class="md-resumen" id="mdResumen">${conBandeja ? "Buscando tus pendientes…" : "Elegí una sección en el menú para arrancar."}</p>
      </header>
      ${conBandeja ? `<div id="mdPush"></div><div class="md-tiles" id="mdTiles"></div><div id="mdBandeja"></div>` : ""}
      <p class="home-ayuda-tip">¿Cómo se usa cada sección? Tocá el botón <span class="ay-btn ay-mini" aria-hidden="true">?</span> de <b>Ayuda</b>, abajo a la derecha.</p>
    </div>`;
    if (conBandeja) { pintarBandeja(++MD_SEQ); pintarInvitacionPush(); }
  }
  const PUSH_NO = () => "push_invitacion_no:" + (AUTHSES.email() || "").toLowerCase();
  async function pintarInvitacionPush() {
    const caja = $("#mdPush"); if (!caja) return;
    let no = false; try { no = localStorage.getItem(PUSH_NO()) === "1"; } catch (e) { }
    const est = await pushEstado();
    if (no || !["inactivo", "ios"].includes(est)) { caja.innerHTML = ""; return; }
    caja.innerHTML = `<div class="md-push"><span class="ms">notifications</span>
      <div><b>Enterate aunque no tengas la plataforma abierta</b><p>${est === "ios" ? PUSH_TXT.ios : "Te avisamos en este dispositivo cuando te mencionan, te asignan una tarea o hay novedades en contenidos."}</p><p class="md-push-err" id="mdPushErr"></p></div>
      <div class="md-push-acc">${est === "inactivo" ? `<button class="btn-primary" id="mdPushOn">Activar avisos</button>` : ""}
        <button class="btn-ghost" id="mdPushNo">${est === "ios" ? "Entendido" : "Ahora no"}</button></div></div>`;
    $("#mdPushNo").onclick = () => { try { localStorage.setItem(PUSH_NO(), "1"); } catch (e) { } caja.innerHTML = ""; };
    const on = $("#mdPushOn");
    if (on) on.onclick = async () => {
      on.disabled = true;
      try { await activarPush(); caja.innerHTML = `<div class="md-push ok"><span class="ms">check_circle</span><div><b>Avisos activados en este dispositivo</b><p>Los podés apagar cuando quieras desde Mi cuenta (tu nombre, abajo del menú).</p></div></div>`; }
      catch (e) { $("#mdPushErr").textContent = e.message; on.disabled = false; }
    };
  }

  async function pintarBandeja(seq) {
    const pedir = f => typeof f === "function" ? Promise.resolve().then(f).catch(() => null) : Promise.resolve(null);
    const [t, c, a] = await Promise.all([pedir(window.miDiaTareas), pedir(window.miDiaContenidos), pedir(window.miDiaAcciones)]);
    if (seq !== MD_SEQ || $("#page-inicio").classList.contains("hidden")) return;

    // Todo a una misma forma: {at: necesita atención ya, orden, dias, ic, tit, meta, tag:[texto, clase], ir}
    const cuando = d => d < -1 ? `hace ${-d} días` : d === -1 ? "ayer" : d === 0 ? "hoy" : d === 1 ? "mañana" : `en ${d} días`;
    const icCanal = k => /^instagram/.test(k) ? "photo_camera" : k === "mailing" ? "mail" : "chat";
    const items = [];
    (t || []).forEach(x => {
      const ir = () => window.irATarea(x.id);
      if (x.tipo === "mencion") return items.push({ at: true, orden: 2, ic: "alternate_email", tit: x.titulo, meta: "Tarea · te mencionaron", tag: ["Mención", "menc"], ir });
      items.push({ at: x.dias <= 0, orden: x.dias < 0 ? 0 : 1, dias: x.dias, ic: "view_kanban", tit: (x.hito ? "★ " : "") + x.titulo,
        meta: "Tu tarea" + (x.alta ? " · prioridad alta" : ""), ir,
        tag: x.dias < 0 ? [`Venció ${cuando(x.dias)}`, "venc"] : x.dias === 0 ? ["Vence hoy", "hoy"] : [capi(cuando(x.dias)), "prox"] });
    });
    (c || []).forEach(x => {
      const ir = () => window.irAPieza(x.id, x.canal, x.mes);
      if (x.tipo === "hilo") {
        const q = [x.sugs ? `${x.sugs} sugerencia${x.sugs > 1 ? "s" : ""}` : "", x.coms ? `${x.coms} comentario${x.coms > 1 ? "s" : ""}` : ""].filter(Boolean).join(" y ");
        return items.push({ at: true, orden: 3, ic: "rate_review", tit: x.titulo, meta: `${x.canalT} · ${q}`, tag: ["Sin resolver", "menc"], ir });
      }
      if (x.tipo === "decision") return items.push({ at: true, orden: 3, ic: x.aceptada ? "check_circle" : "cancel", tit: x.titulo,
        meta: `${x.canalT} · tu sugerencia`, tag: [x.aceptada ? "Aceptada" : "Descartada", x.aceptada ? "ok" : "prox"], ir });
      const meta = `${x.canalT} · ${x.estado}`;
      if (x.tipo === "revisar") return items.push({ at: true, orden: 1, dias: x.dias, ic: "rate_review", tit: x.titulo, meta,
        tag: [x.dias < 0 ? `Precisa tu feedback · era para ${cuando(x.dias)}` : `Precisa tu feedback · sale ${cuando(x.dias)}`, x.dias <= 0 ? "venc" : "hoy"], ir });
      if (x.tipo === "corregir") return items.push({ at: true, orden: 1, dias: x.dias, ic: "edit", tit: x.titulo, meta,
        tag: [x.dias < 0 ? `Con ajustes · era para ${cuando(x.dias)}` : `Con ajustes · sale ${cuando(x.dias)}`, x.dias <= 0 ? "venc" : "hoy"], ir });
      if (x.dias < 0) return items.push({ at: true, orden: 0, dias: x.dias, ic: icCanal(x.canal), tit: x.titulo, meta, tag: [`Era para ${cuando(x.dias)}`, "venc"], ir });
      // "sin aprobar" (sólo le llega a los responsables del canal)
      if (x.dias === 0 && !x.ok) return items.push({ at: true, orden: 1, dias: 0, ic: icCanal(x.canal), tit: x.titulo, meta, tag: ["Sale hoy y no está lista", "hoy"], ir });
      items.push({ at: false, dias: x.dias, ic: icCanal(x.canal), tit: x.titulo, meta, ir,
        tag: x.dias === 0 ? ["Sale hoy", "ok"] : [`Sale ${cuando(x.dias)}`, "prox"] });
    });
    (a || []).forEach(x => {
      const ir = () => window.irAAccion(x.id);
      if (x.tipo === "mencion") return items.push({ at: true, orden: 2, ic: "alternate_email", tit: x.titulo, meta: "Acción · te mencionaron", tag: ["Mención", "menc"], ir });
      items.push({ at: false, dias: x.dias, ic: "campaign", tit: x.titulo, meta: `Tu acción · ${x.estado}`, ir,
        tag: [(x.tipo === "arranca" ? "Arranca " : "Termina ") + cuando(x.dias), "prox"] });
    });
    const ya = items.filter(x => x.at).sort((p, q) => (p.orden - q.orden) || ((p.dias || 0) - (q.dias || 0)));
    const prox = items.filter(x => !x.at).sort((p, q) => p.dias - q.dias);

    // Resumen + contadores de arriba (sólo los de los módulos que la persona ve)
    $("#mdResumen").textContent = ya.length
      ? `${ya.length} ${ya.length === 1 ? "cosa necesita" : "cosas necesitan"} tu atención.`
      : "Nada urgente por hoy. Todo al día.";
    const tiles = [];
    if (t) tiles.push({ n: t.filter(x => x.tipo === "tarea" && x.dias <= 0).length, l: "Tus tareas para hoy o vencidas", p: "tareas" });
    // Contenidos según tu papel: quien revisa ve lo que le mandaron; quien hace, lo que tiene que corregir
    const irCanal = tipo => { const x = (c || []).find(y => y.tipo === tipo); return x && /^instagram/.test(x.canal || "") ? "contenidos-ig" : x && x.canal === "mailing" ? "contenidos-mail" : "contenidos"; };
    if (c && (c.papeles || []).includes("revisa")) tiles.push({ n: c.filter(x => x.tipo === "revisar").length, l: "Piezas que precisan tu feedback", p: irCanal("revisar") });
    if (c && (c.papeles || []).includes("hace")) tiles.push({ n: c.filter(x => x.tipo === "corregir").length, l: "Piezas con ajustes para hacer", p: irCanal("corregir") });
    if (t || a) tiles.push({ n: [...(t || []), ...(a || [])].filter(x => x.tipo === "mencion").length, l: "Menciones nuevas", p: t ? "tareas" : "acciones" });
    $("#mdTiles").innerHTML = tiles.map(x => `<button class="md-tile${x.n ? " con" : ""}" data-page="${x.p}"><b>${x.n}</b><span>${x.l}</span></button>`).join("");
    $("#mdTiles").querySelectorAll("[data-page]").forEach(b => b.onclick = () => goToPage(b.dataset.page));

    const fila = (x, i) => `<button class="md-it" data-i="${i}"><span class="ms">${x.ic}</span>
        <span class="md-it-txt"><b>${escH(x.tit)}</b><small>${escH(x.meta)}</small></span>
        <span class="md-tag ${x.tag[1]}">${x.tag[0]}</span></button>`;
    const lista = (arr, base, abierta) => arr.map((x, i) => fila(x, base + i)).slice(0, abierta ? arr.length : MD_MAX).join("") +
      (!abierta && arr.length > MD_MAX ? `<button class="md-mas" data-mas="${base}">Ver ${arr.length - MD_MAX} más</button>` : "");
    const todos = [...ya, ...prox];
    const pintar = abiertos => {
      $("#mdBandeja").innerHTML = `
        <section class="md-tramo">
          <h2 class="md-h">Necesita tu atención</h2>
          ${ya.length ? `<div class="md-lista">${lista(ya, 0, abiertos.has(0))}</div>`
                      : `<p class="md-vacio"><span class="ms">check_circle</span> No tenés nada vencido ni pendiente de revisar.</p>`}
        </section>
        <section class="md-tramo">
          <h2 class="md-h">Próximos 7 días</h2>
          ${prox.length ? `<div class="md-lista">${lista(prox, ya.length, abiertos.has(ya.length))}</div>`
                        : `<p class="md-vacio">No hay nada con fecha para esta semana.</p>`}
        </section>`;
      $("#mdBandeja").querySelectorAll(".md-it").forEach(b => b.onclick = () => todos[+b.dataset.i].ir());
      $("#mdBandeja").querySelectorAll("[data-mas]").forEach(b => b.onclick = () => { abiertos.add(+b.dataset.mas); pintar(abiertos); });
    };
    pintar(new Set());
  }

  searchEl.addEventListener("input", () => renderCatalogo());
  $("#exportBtn").addEventListener("click", exportXLSX);
  $("#exportJsonBtn").addEventListener("click", exportJson);
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", e => { if (e.target.files[0]) importJson(e.target.files[0]); });
  $("#btnDesc").addEventListener("click", openDescuentos);
  $("#btnAuth").addEventListener("click", openCuenta);
  wireGate(); updateDescBtn();
  // La app requiere sesión: si hay sesión válida, bajar datos y entrar; si no, mostrar el login.
  (async () => {
    // ¿Volvemos del mail de recuperación? El token viene en el # (a veces en el ?).
    const h = new URLSearchParams((location.hash || "").replace(/^#/, ""));
    const q = new URLSearchParams(location.search || "");
    // Supabase sólo pone un access_token en la URL al volver de un mail (recovery/magic link).
    const tok = h.get("access_token") || q.get("access_token");
    const errH = h.get("error_description") || q.get("error_description") || h.get("error") || q.get("error");
    if (tok) { lock(); pantallaRecuperar(tok); return; }
    if (errH) {                                     // el link no volvió con token: link vencido o URL no autorizada
      history.replaceState(null, "", location.pathname);
      lock(); $("#gateErr").textContent = "El link de recuperación no es válido o venció. Pedí uno nuevo desde “¿Olvidaste tu contraseña?”.";
      return;
    }
    if (AUTHSES.logged() && await AUTHSES.refresh()) {
      try { await bootApp(); unlock(); irDesdeLink(location.hash); } catch (e) { lock(); }
    } else { lock(); }
  })();
  setInterval(() => {
    if (document.body.classList.contains("locked")) return;
    sbPullPrices().then(() => { if (!$("#page-resultados").classList.contains("hidden")) renderTabla(); });
    if (!$("#page-resultados").classList.contains("hidden")) sbPull().then(renderTabla);
  }, 20000);
})();
