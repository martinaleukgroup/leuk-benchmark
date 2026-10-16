/* Desplegables propios de la plataforma (oct 2026).
   Pedido de la usuaria: que los <select> no abran el menú del sistema (gris, con
   tilde azul) sino uno con la estética de Leuk. En vez de reescribir los ~40
   selects de cada módulo, éste se pone por encima de TODOS:
   - el <select> sigue en su lugar (mismo tamaño, mismo valor, mismos onchange):
     sólo se le corta la apertura nativa y se abre este menú en su lugar;
   - elegir una opción le pone el value y dispara "input" + "change" como si
     hubiera sido el nativo, así ningún módulo se entera del cambio;
   - en celular (puntero táctil) se deja el nativo: la ruedita de iOS/Android
     es más cómoda con el dedo que cualquier lista;
   - <select multiple> y los marcados con data-nativo quedan como están.
   Archivo autosuficiente (inyecta su CSS): sirve también en las páginas sueltas. */
(function () {
  "use strict";
  if (window.__lkSelect) return;
  window.__lkSelect = true;

  const tactil = () => window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const propio = s => s && s.tagName === "SELECT" && !s.multiple && !s.disabled && !s.hasAttribute("data-nativo") && !tactil();
  const esSeparador = o => o.disabled && /^[\s─—–\-_]+$/.test(o.textContent);

  const css = `
  select:not([multiple]):not([data-nativo]){-webkit-appearance:none;appearance:none;cursor:pointer;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5 6 7.5 9 4.5' fill='none' stroke='%23676B55' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat:no-repeat;background-position:right 10px center;background-size:12px;padding-right:30px!important}
  select.lk-sel-abierto{border-color:var(--olive-mid,#8B9174)!important;box-shadow:0 0 0 3px var(--olive-pale,#EEF0E8)}
  .lk-menu{position:fixed;z-index:1000;background:var(--card,#fff);border:1px solid var(--line,#e4e6dd);border-radius:12px;
    box-shadow:0 12px 32px rgba(40,42,34,.16),0 2px 6px rgba(40,42,34,.06);padding:5px;overflow-y:auto;overscroll-behavior:contain;
    font-family:var(--font-body,"Barlow",system-ui,sans-serif);font-size:14px;color:var(--ink,#2b2c26)}
  .lk-op{display:flex;align-items:center;gap:8px;padding:8px 12px 8px 30px;border-radius:8px;cursor:pointer;position:relative;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3}
  .lk-op.act{background:var(--olive-pale,#EEF0E8)}
  .lk-op.sel{font-weight:600;color:var(--olive,#676B55)}
  .lk-op.sel::before{content:"";position:absolute;left:11px;top:50%;width:10px;height:6px;margin-top:-5px;
    border-left:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(-45deg)}
  .lk-op.off{color:var(--gray-soft,#8a8c82);cursor:default;opacity:.6}
  .lk-sep{height:1px;background:var(--line,#e4e6dd);margin:5px 8px}
  .lk-grupo{font-family:var(--font-title,"Barlow Condensed",sans-serif);font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;
    color:var(--gray-soft,#8a8c82);padding:8px 12px 4px}
  @media (hover:none) and (pointer:coarse){select:not([multiple]):not([data-nativo]){background-position:right 10px center}}`;
  const st = document.createElement("style"); st.id = "lk-select-css"; st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  let MENU = null, SEL = null, ITEMS = [], ACT = -1, BUSCA = "", BUSCA_T = 0;

  function cerrar(volverFoco) {
    if (!MENU) return;
    MENU.remove(); MENU = null;
    if (SEL) { SEL.classList.remove("lk-sel-abierto"); if (volverFoco) SEL.focus({ preventScroll: true }); }
    SEL = null; ITEMS = []; ACT = -1;
  }

  function marcar(i, scroll) {
    ITEMS.forEach((it, k) => it.el.classList.toggle("act", k === i));
    ACT = i;
    if (scroll && ITEMS[i]) ITEMS[i].el.scrollIntoView({ block: "nearest" });
  }

  function elegir(i) {
    const it = ITEMS[i]; if (!it || it.op.disabled) return;
    const s = SEL;
    cerrar(true);
    if (s.selectedIndex === it.idx) return;
    s.selectedIndex = it.idx;
    s.dispatchEvent(new Event("input", { bubbles: true }));
    s.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function ubicar() {
    if (!MENU || !SEL) return;
    const r = SEL.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, m = 8;
    if (!r.width && !r.height) { cerrar(); return; }        // el select desapareció (se repintó la vista)
    MENU.style.minWidth = Math.max(r.width, 160) + "px";
    MENU.style.maxWidth = Math.min(480, vw - 2 * m) + "px";
    const abajo = vh - r.bottom - m, arriba = r.top - m;
    const alto = Math.min(MENU.scrollHeight, 340);
    const haciaArriba = abajo < Math.min(alto, 220) && arriba > abajo;
    MENU.classList.toggle("arriba", haciaArriba);
    MENU.style.maxHeight = Math.max(120, Math.min(340, haciaArriba ? arriba - 4 : abajo - 4)) + "px";
    const w = MENU.offsetWidth;
    MENU.style.left = Math.max(m, Math.min(r.left, vw - w - m)) + "px";
    MENU.style.top = haciaArriba ? "" : (r.bottom + 4) + "px";
    MENU.style.bottom = haciaArriba ? (vh - r.top + 4) + "px" : "";
  }

  function abrir(s) {
    cerrar();
    SEL = s; s.classList.add("lk-sel-abierto");
    MENU = document.createElement("div");
    MENU.className = "lk-menu"; MENU.setAttribute("role", "listbox");
    ITEMS = [];
    const agregar = (op, idx) => {
      if (op.hidden) return;
      if (esSeparador(op)) { const d = document.createElement("div"); d.className = "lk-sep"; MENU.appendChild(d); return; }
      const d = document.createElement("div");
      d.className = "lk-op" + (op.disabled ? " off" : "") + (idx === s.selectedIndex ? " sel" : "");
      d.setAttribute("role", "option");
      d.textContent = op.textContent.trim() || " ";
      if (op.title) d.title = op.title;
      const k = ITEMS.length;
      ITEMS.push({ el: d, op, idx });
      d.addEventListener("mousemove", () => { if (ACT !== k && !op.disabled) marcar(k); });
      d.addEventListener("mousedown", e => e.preventDefault());     // que el select no pierda el foco
      d.addEventListener("click", () => elegir(k));
      MENU.appendChild(d);
    };
    let idx = 0;
    [...s.children].forEach(n => {
      if (n.tagName === "OPTGROUP") {
        const g = document.createElement("div"); g.className = "lk-grupo"; g.textContent = n.label; MENU.appendChild(g);
        [...n.children].forEach(op => agregar(op, idx++));
      } else if (n.tagName === "OPTION") agregar(n, idx++);
    });
    document.body.appendChild(MENU);
    ubicar();
    const sel = ITEMS.findIndex(it => it.idx === s.selectedIndex);
    marcar(sel >= 0 ? sel : ITEMS.findIndex(it => !it.op.disabled), true);
  }

  function mover(d) {
    if (!ITEMS.length) return;
    let i = ACT;
    for (let n = 0; n < ITEMS.length; n++) {
      i = (i + d + ITEMS.length) % ITEMS.length;
      if (!ITEMS[i].op.disabled) break;
    }
    marcar(i, true);
  }

  // Abrir: se corta el nativo en mousedown (es lo que lo despliega en escritorio).
  document.addEventListener("mousedown", e => {
    const s = e.target.closest && e.target.closest("select");
    if (MENU && !MENU.contains(e.target) && e.target !== SEL) cerrar();
    if (!propio(s) || e.button !== 0) return;
    e.preventDefault();
    if (SEL === s) { cerrar(true); return; }
    s.focus({ preventScroll: true });
    abrir(s);
  }, true);

  document.addEventListener("keydown", e => {
    const s = document.activeElement;
    if (MENU) {
      if (e.key === "ArrowDown") { e.preventDefault(); mover(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); mover(-1); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); elegir(ACT); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cerrar(true); }
      else if (e.key === "Tab") cerrar();
      else if (e.key.length === 1) {                              // escribir salta a la opción que empieza así
        clearTimeout(BUSCA_T); BUSCA += e.key.toLowerCase(); BUSCA_T = setTimeout(() => { BUSCA = ""; }, 700);
        const i = ITEMS.findIndex(it => !it.op.disabled && it.el.textContent.toLowerCase().startsWith(BUSCA));
        if (i >= 0) marcar(i, true);
      }
      return;
    }
    if (propio(s) && (e.key === "Enter" || e.key === " " || ((e.key === "ArrowDown" || e.key === "ArrowUp") && e.altKey))) {
      e.preventDefault(); abrir(s);
    }
  }, true);

  window.addEventListener("resize", () => cerrar());
  document.addEventListener("scroll", e => { if (MENU && !MENU.contains(e.target)) ubicar(); }, true);
  window.addEventListener("blur", () => cerrar());
})();
