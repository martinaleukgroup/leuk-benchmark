/* ==========================================================================
   Imágenes en los comentarios (oct 2026)
   En cualquier caja de comentario (Contenidos, Tareas, Acciones) se puede PEGAR
   una captura (⌘/Ctrl+V) o ARRASTRAR un .jpg/.png. La imagen se sube al bucket
   PRIVADO `comentarios` (supabase/sql/2026-10-26-comentarios-imagenes.sql).
   Mientras se escribe, la imagen se ve como miniatura sobre la caja (con ✕ para
   sacarla), no como texto. Al enviar, el módulo pide LK_IMG.texto(caja) y al
   final del comentario se agrega una marca por imagen: [img:tareas/2026-10/abc.jpg].
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

  // Caja de comentario → carpeta del módulo, a qué hilo pertenece y dónde va la
  // bandeja de miniaturas. Sólo estas cajas reciben imágenes.
  const CAJAS = [
    { sel: "textarea[data-nuevo]", modulo: "contenidos", hilo: ta => ta.dataset.nuevo,
      // la caja está en una fila con el selector de placa y "Enviar": la bandeja va arriba de la fila
      ancla: ta => ta.closest(".ct-com-alta") || ta },
    { sel: "textarea.tk-com-nuevo", modulo: "tareas",   hilo: ta => ta.dataset.tarea || "", ancla: ta => ta },
    { sel: "textarea.ac-com-nuevo", modulo: "acciones", hilo: ta => ta.dataset.hito || "", ancla: ta => ta },
  ];
  const cajaDe = el => el && el.matches ? CAJAS.find(c => el.matches(c.sel)) || null : null;
  const moduloDe = el => { const c = cajaDe(el); return c ? c.modulo : null; };
  const claveDe = ta => { const c = cajaDe(ta); return c ? `${c.modulo}:${c.hilo(ta)}` : null; };

  // Imágenes a medio escribir, por hilo: sobreviven a los repintados de la vista.
  // clave → [{ id, prev (blob local para la miniatura), path (null mientras sube) }]
  const ADJ = {};

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

  async function recibir(ta, archivos) {
    const modulo = moduloDe(ta), clave = claveDe(ta);
    const imgs = [...archivos].filter(f => /^image\//.test(f.type));
    if (!modulo || !imgs.length) return false;
    await Promise.all(imgs.map(async f => {
      const it = { id: Math.random().toString(36).slice(2, 9), prev: URL.createObjectURL(f), path: null };
      (ADJ[clave] = ADJ[clave] || []).push(it);
      SUBIENDO++; pintarBandejas();
      try {
        it.path = await subir(modulo, f);
      } catch (e) {
        quitar(clave, it.id);
        (window.lkAviso || alert)(e.message || "No se pudo subir la imagen.");
      } finally { SUBIENDO--; pintarBandejas(); }
    }));
    return true;
  }
  function quitar(clave, id) {
    const it = (ADJ[clave] || []).find(x => x.id === id); if (!it) return;
    ADJ[clave] = ADJ[clave].filter(x => x !== it);
    if (!ADJ[clave].length) delete ADJ[clave];
    URL.revokeObjectURL(it.prev);
    // Ya subida y descartada: se borra del bucket (si falla, queda huérfana y no molesta).
    if (it.path) fetch(sto(`object/${BUCKET}`), { method: "DELETE", headers: head(), body: JSON.stringify({ prefixes: [it.path] }) }).catch(() => {});
  }

  // Bandeja de miniaturas sobre cada caja con imágenes pendientes. Se vuelve a
  // colocar después de cada repintado (lo llama el MutationObserver de abajo).
  function pintarBandejas() {
    CAJAS.forEach(c => document.querySelectorAll(c.sel).forEach(ta => {
      const clave = claveDe(ta), its = ADJ[clave] || [];
      const ancla = c.ancla(ta);
      let b = ancla.previousElementSibling;
      if (!(b && b.classList.contains("lk-adj-bandeja"))) b = null;
      if (!its.length) { if (b) b.remove(); return; }
      const firma = its.map(x => x.id + (x.path ? "+" : "")).join(",");
      if (b && b.dataset.firma === firma) return;
      if (!b) { b = document.createElement("div"); b.className = "lk-adj-bandeja"; ancla.parentNode.insertBefore(b, ancla); }
      b.dataset.firma = firma; b.dataset.clave = clave;
      b.innerHTML = its.map(x => `<span class="lk-adj ${x.path ? "" : "sube"}">
        <img src="${x.prev}" alt="Imagen adjunta">
        ${x.path ? `<button type="button" data-quitaradj="${x.id}" title="Sacar la imagen" aria-label="Sacar la imagen">✕</button>` : `<i>Subiendo…</i>`}</span>`).join("");
    }));
  }
  document.addEventListener("click", ev => {
    const q = ev.target.closest && ev.target.closest("[data-quitaradj]"); if (!q) return;
    ev.preventDefault(); ev.stopPropagation();
    quitar(q.closest(".lk-adj-bandeja").dataset.clave, q.dataset.quitaradj); pintarBandejas();
  }, true);

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
  new MutationObserver(() => { if (!pendiente) pendiente = setTimeout(() => { pintarBandejas(); firmar(); }, 60); })
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
    // Los módulos lo llaman antes de mandar: con una imagen de ESA caja a medio subir no se publica.
    esperar: ta => {
      if ((ADJ[claveDe(ta)] || []).some(x => !x.path)) { (window.lkAviso || alert)("Esperá a que termine de subir la imagen."); return true; }
      return false;
    },
    // Texto a guardar: lo escrito + una marca por imagen adjunta (cada una en su línea).
    texto: ta => [ta.value.trim(), ...(ADJ[claveDe(ta)] || []).filter(x => x.path).map(x => `[img:${x.path}]`)].filter(Boolean).join("\n"),
    // Después de guardar bien: se vacía la bandeja (las imágenes ya quedaron en el comentario).
    limpiar: ta => { const k = claveDe(ta); (ADJ[k] || []).forEach(x => URL.revokeObjectURL(x.prev)); delete ADJ[k]; pintarBandejas(); },
  };
})();
