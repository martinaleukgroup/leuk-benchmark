/* ==========================================================================
   Imágenes en los comentarios (oct 2026)
   En cualquier caja de comentario (Contenidos, Tareas, Acciones) se puede PEGAR
   una captura (⌘/Ctrl+V) o ARRASTRAR un .jpg/.png. La imagen se sube al bucket
   PRIVADO `comentarios` (supabase/sql/2026-10-26-comentarios-imagenes.sql) y en
   el texto del comentario queda sólo una marca: [img:tareas/2026-10/abc.jpg].
   Así ninguna tabla cambia: cada módulo pasa su HTML por LK_IMG.html() y la
   marca se dibuja como miniatura con una URL firmada de una hora.

   La primera carpeta del path es el módulo: las políticas del bucket la usan
   para que sólo vea la imagen quien puede ver ese módulo.
   ========================================================================== */
(function () {
  "use strict";

  const SES = () => window.LEUK_SESION || {};
  const sto = p => `${SES().sbUrl}/storage/v1/${p}`;
  const head = extra => Object.assign({ "Content-Type": "application/json" }, SES().head ? SES().head() : {}, extra || {});
  const BUCKET = "comentarios";
  const MAX_MB = 10;          // igual al file_size_limit del bucket
  const LADO_MAX = 2000;      // las fotos grandes se achican a esto (px del lado mayor)
  const RE = /\[img:([\w\-./]+)\]/g;

  // Caja de comentario → carpeta del módulo. Sólo estas reciben imágenes.
  const CAJAS = [
    ["textarea[data-nuevo]", "contenidos"],
    ["textarea.tk-com-nuevo", "tareas"],
    ["textarea.ac-com-nuevo", "acciones"],
  ];
  const moduloDe = el => { for (const [s, m] of CAJAS) if (el && el.matches && el.matches(s)) return m; return null; };

  let SUBIENDO = 0;

  /* ---- Subida ---- */
  const pad = n => String(n).padStart(2, "0");
  // Una foto de celular puede pesar 5-8 MB: si es grande, se achica y va como JPG.
  // Las capturas chicas quedan tal cual (PNG nítido para texto).
  async function preparar(f) {
    if (f.size <= 1.5 * 1048576 || !/^image\/(jpeg|png|webp)$/.test(f.type)) return f;
    try {
      const bmp = await createImageBitmap(f);
      const k = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);   // PNG con transparencia → fondo blanco
      g.drawImage(bmp, 0, 0, c.width, c.height);
      const b = await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));
      return b && b.size < f.size ? new File([b], "imagen.jpg", { type: "image/jpeg" }) : f;
    } catch (e) { return f; }
  }
  async function subir(modulo, f0) {
    const f = await preparar(f0);
    if (f.size > MAX_MB * 1048576) throw new Error(`La imagen pesa más de ${MAX_MB} MB.`);
    const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/heic": "heic" })[f.type] || "jpg";
    const d = new Date();
    const path = `${modulo}/${d.getFullYear()}-${pad(d.getMonth() + 1)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const r = await fetch(sto(`object/${BUCKET}/${path}`), {
      method: "POST", headers: head({ "Content-Type": f.type || "image/jpeg", "x-upsert": "false" }), body: f }).catch(() => null);
    if (!r) throw new Error("No se pudo subir la imagen. Revisá la conexión.");
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(/bucket not found/i.test(t) ? "Falta correr 2026-10-26-comentarios-imagenes.sql en Supabase." : "No se pudo subir la imagen.");
    }
    return path;
  }

  // Inserta en el cursor un "subiendo…" y lo cambia por la marca al terminar.
  // Dispara "input" para que los módulos que guardan el borrador se enteren.
  function insertar(ta, txt) {
    const a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? a;
    const antes = ta.value.slice(0, a), sep = antes && !/\s$/.test(antes) ? " " : "";
    ta.value = antes + sep + txt + ta.value.slice(b);
    const p = (antes + sep + txt).length;
    ta.setSelectionRange(p, p);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function reemplazar(ta, de, a) {
    // El textarea pudo repintarse mientras subía: se busca el vigente con el mismo selector.
    const vivo = document.body.contains(ta) ? ta : null;
    if (!vivo || !vivo.value.includes(de)) return false;
    vivo.value = vivo.value.replace(de, a);
    vivo.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  async function recibir(ta, archivos) {
    const modulo = moduloDe(ta);
    const imgs = [...archivos].filter(f => /^image\//.test(f.type));
    if (!modulo || !imgs.length) return false;
    for (const f of imgs) {
      const marca = `[subiendo imagen ${Math.random().toString(36).slice(2, 6)}…]`;
      insertar(ta, marca);
      SUBIENDO++;
      try {
        const path = await subir(modulo, f);
        reemplazar(ta, marca, `[img:${path}]`);
      } catch (e) {
        reemplazar(ta, marca, "");
        (window.lkAviso || alert)(e.message || "No se pudo subir la imagen.");
      } finally { SUBIENDO--; }
    }
    return true;
  }

  document.addEventListener("paste", ev => {
    const ta = ev.target;
    if (!moduloDe(ta)) return;
    const fs = ev.clipboardData && ev.clipboardData.files;
    if (fs && [...fs].some(f => /^image\//.test(f.type))) { ev.preventDefault(); recibir(ta, fs); }
  });
  document.addEventListener("dragover", ev => {
    if (moduloDe(ev.target) && ev.dataTransfer && [...ev.dataTransfer.types].includes("Files")) {
      ev.preventDefault(); ev.target.classList.add("lk-cimg-drop");
    }
  });
  document.addEventListener("dragleave", ev => { if (moduloDe(ev.target)) ev.target.classList.remove("lk-cimg-drop"); });
  document.addEventListener("drop", ev => {
    const ta = ev.target;
    if (!moduloDe(ta) || !ev.dataTransfer || !ev.dataTransfer.files.length) return;
    ta.classList.remove("lk-cimg-drop");
    ev.preventDefault(); ta.focus(); recibir(ta, ev.dataTransfer.files);
  });

  /* ---- Dibujo ---- */
  // Se aplica sobre HTML YA escapado: la marca sólo admite [\w-./], así que no hay nada que escapar.
  const html = h => String(h == null ? "" : h).replace(RE, (m, p) =>
    `<button type="button" class="lk-cimg" data-cimg="${p}" title="Ver la imagen"><img alt="Imagen del comentario"></button>`);
  // Para vistas de una línea (avisos, resúmenes): la marca se lee como "📷 imagen".
  const plano = t => String(t == null ? "" : t).replace(RE, "📷 imagen").replace(/\s+/g, " ").trim();

  // Las miniaturas se firman en lote apenas aparecen en pantalla. Caché de 50 min (firmas de 1 h).
  const FIRMAS = {};
  let pendiente = null;
  async function firmar() {
    pendiente = null;
    const imgs = [...document.querySelectorAll(".lk-cimg[data-cimg] img:not([src])")];
    if (!imgs.length || !SES().sbUrl) return;
    const ahora = Date.now();
    const faltan = [...new Set(imgs.map(i => i.parentNode.dataset.cimg))].filter(p => !(FIRMAS[p] && FIRMAS[p].hasta > ahora));
    if (faltan.length) {
      try {
        const r = await fetch(sto(`object/sign/${BUCKET}`), { method: "POST", headers: head(), body: JSON.stringify({ expiresIn: 3600, paths: faltan }) });
        const d = r.ok ? await r.json() : [];
        (d || []).forEach(x => {
          const s = x.signedURL || x.signedUrl;
          if (s && !x.error) FIRMAS[x.path] = { url: /^(https?|blob|data):/.test(s) ? s : sto(s.replace(/^\//, "")), hasta: ahora + 50 * 60000 };
        });
      } catch (e) { /* sin red: quedan sin miniatura y se reintenta en el próximo repintado */ }
    }
    imgs.forEach(i => {
      const f = FIRMAS[i.parentNode.dataset.cimg];
      if (f) i.src = f.url;
      else { i.src = "data:image/gif;base64,R0lGODlhAQABAAAAACw="; i.parentNode.classList.add("rota"); i.parentNode.title = "No se pudo cargar la imagen"; }
    });
  }
  new MutationObserver(() => { if (!pendiente) pendiente = setTimeout(firmar, 60); })
    .observe(document.documentElement, { childList: true, subtree: true });

  // Click → la imagen en grande, encima de todo. Esc o click afuera la cierra.
  document.addEventListener("click", ev => {
    const b = ev.target.closest && ev.target.closest(".lk-cimg[data-cimg]");
    if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    const f = FIRMAS[b.dataset.cimg]; if (!f) return;
    const v = document.createElement("div");
    v.className = "lk-cimg-visor";
    v.innerHTML = `<img alt="Imagen del comentario"><div class="lk-cimg-acc"><a target="_blank" rel="noopener">Abrir en otra pestaña</a><button type="button">Cerrar ✕</button></div>`;
    v.querySelector("img").src = f.url; v.querySelector("a").href = f.url;
    const cerrar = () => { v.remove(); document.removeEventListener("keydown", esc, true); };
    const esc = e => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } };
    v.addEventListener("click", e => { if (e.target === v || e.target.tagName === "BUTTON") cerrar(); });
    document.addEventListener("keydown", esc, true);
    document.body.appendChild(v);
  }, true);

  window.LK_IMG = {
    html, plano,
    ocupado: () => SUBIENDO > 0,
    // Los módulos lo llaman antes de mandar: con una imagen a medio subir no se publica.
    esperar: () => { if (SUBIENDO) { (window.lkAviso || alert)("Esperá a que termine de subir la imagen."); return true; } return false; },
  };
})();
