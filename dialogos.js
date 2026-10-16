/* Diálogos propios de la plataforma (oct 2026).
   Mismo pedido que selector.js: que los avisos no sean la ventanita gris del sistema
   (alert / confirm / prompt del navegador) sino uno con la estética de Leuk.
   - lkAviso(texto)                         → Promise<void>      (reemplaza alert)
   - lkConfirmar(texto, {ok, cancelar, peligro}) → Promise<boolean> (reemplaza confirm)
   - lkPedir(texto, valorInicial, {ok, placeholder}) → Promise<string|null> (reemplaza prompt)
   A diferencia de los nativos NO frenan el código: quien pregunta tiene que hacer
   `if (!(await lkConfirmar(...))) return;` dentro de una función async.
   Si el texto trae un renglón en blanco ("\n\n"), lo de antes va como título y lo de
   después como detalle; si no, va todo como título.
   Esc cancela, Enter confirma, el foco arranca en el botón principal (o en el campo).
   Si se piden dos a la vez se muestran en fila, uno detrás del otro.
   Archivo autosuficiente (inyecta su CSS): sirve también en las páginas sueltas. */
(function () {
  "use strict";
  if (window.lkConfirmar) return;

  const css = `
  .lk-dlg{position:fixed;inset:0;background:rgba(40,42,34,.45);z-index:1100;display:flex;
    align-items:center;justify-content:center;padding:20px;animation:lkDlgIn .12s ease-out}
  .lk-dlg-inner{background:var(--bg,#fbfbf9);width:100%;max-width:440px;border-radius:var(--radius,14px);
    padding:22px 22px 18px;box-shadow:0 20px 60px rgba(0,0,0,.3);max-height:calc(100vh - 40px);overflow-y:auto;
    font-family:var(--font-body,"Barlow",system-ui,sans-serif);color:var(--ink,#2b2c26)}
  .lk-dlg-tit{font-size:16px;font-weight:600;line-height:1.35;margin:0;white-space:pre-line;overflow-wrap:anywhere}
  .lk-dlg-txt{font-size:14px;line-height:1.45;color:var(--gray,#4D4D4D);margin:8px 0 0;white-space:pre-line;overflow-wrap:anywhere}
  .lk-dlg-in{display:block;width:100%;box-sizing:border-box;margin-top:14px;padding:9px 12px;font:inherit;font-size:14px;
    color:var(--ink,#2b2c26);background:var(--card,#fff);border:1px solid var(--line,#e4e6dd);border-radius:10px;outline:0}
  .lk-dlg-in:focus{border-color:var(--olive-mid,#8B9174);box-shadow:0 0 0 3px var(--olive-pale,#EEF0E8)}
  .lk-dlg-bot{display:flex;justify-content:flex-end;gap:8px;margin-top:20px;flex-wrap:wrap}
  .lk-dlg-bot button{font-family:inherit;font-size:14px;padding:9px 18px;border-radius:10px;cursor:pointer;line-height:1.2}
  .lk-dlg-no{border:1px solid var(--olive-soft,#B6BAA4);background:var(--card,#fff);color:var(--olive,#676B55)}
  .lk-dlg-no:hover{background:var(--olive-pale,#EEF0E8)}
  .lk-dlg-si{border:0;background:var(--olive,#676B55);color:#fff;font-weight:600}
  .lk-dlg-si:hover{background:var(--olive-mid,#8B9174)}
  .lk-dlg-si.peligro{background:var(--no,#b25b4e)}
  .lk-dlg-si.peligro:hover{background:#9c4c40}
  .lk-dlg-bot button:focus-visible{outline:0;box-shadow:0 0 0 3px var(--olive-pale,#EEF0E8),0 0 0 4.5px var(--olive-mid,#8B9174)}
  @keyframes lkDlgIn{from{opacity:0}to{opacity:1}}`;
  const st = document.createElement("style"); st.id = "lk-dialogos-css"; st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Uno a la vez: si llega otro mientras hay uno abierto, espera su turno.
  let COLA = Promise.resolve();
  function enCola(fn) {
    const p = COLA.then(fn, fn);
    COLA = p.catch(() => { });
    return p;
  }

  function abrir(tipo, texto, valor, o) {
    return new Promise(resolve => {
      const previo = document.activeElement;
      const t = String(texto == null ? "" : texto);
      const corte = t.indexOf("\n\n");
      const tit = corte >= 0 ? t.slice(0, corte) : t;
      const det = corte >= 0 ? t.slice(corte + 2) : "";
      const ok = o.ok || "Aceptar";
      const cancelar = o.cancelar || "Cancelar";

      const ov = document.createElement("div");
      ov.className = "lk-dlg";
      ov.innerHTML = `
        <div class="lk-dlg-inner" role="${tipo === "aviso" ? "alertdialog" : "dialog"}" aria-modal="true" aria-labelledby="lk-dlg-tit">
          <p class="lk-dlg-tit" id="lk-dlg-tit">${esc(tit)}</p>
          ${det ? `<p class="lk-dlg-txt">${esc(det)}</p>` : ""}
          ${tipo === "pedir" ? `<input class="lk-dlg-in" type="text" autocomplete="off" placeholder="${esc(o.placeholder || "")}">` : ""}
          <div class="lk-dlg-bot">
            ${tipo === "aviso" ? "" : `<button type="button" class="lk-dlg-no">${esc(cancelar)}</button>`}
            <button type="button" class="lk-dlg-si${o.peligro ? " peligro" : ""}">${esc(ok)}</button>
          </div>
        </div>`;
      const inp = ov.querySelector(".lk-dlg-in");
      const si = ov.querySelector(".lk-dlg-si");
      const no = ov.querySelector(".lk-dlg-no");
      if (inp) inp.value = valor == null ? "" : String(valor);

      let hecho = false;
      function fin(aceptado) {
        if (hecho) return; hecho = true;
        window.removeEventListener("keydown", teclas, true);
        ov.remove();
        if (previo && previo.focus && document.contains(previo)) { try { previo.focus({ preventScroll: true }); } catch (e) { } }
        resolve(tipo === "aviso" ? undefined : tipo === "pedir" ? (aceptado ? inp.value : null) : !!aceptado);
      }
      function teclas(ev) {
        // Mientras está abierto, ninguna tecla llega a los atajos de la página
        // (escribir en el campo sigue andando: eso es lo que hace el navegador solo).
        ev.stopPropagation();
        if (ev.key === "Escape") { ev.preventDefault(); fin(false); return; }
        if (ev.key === "Enter" && !ev.isComposing) {
          // Enter sobre "Cancelar" cancela (como cualquier botón); en el resto, confirma.
          ev.preventDefault();
          fin(document.activeElement !== no);
          return;
        }
        if (ev.key === "Tab") {
          // El foco no se escapa del diálogo.
          const f = [...ov.querySelectorAll("input,button")];
          const i = f.indexOf(document.activeElement);
          ev.preventDefault();
          const j = i < 0 ? 0 : (i + (ev.shiftKey ? -1 : 1) + f.length) % f.length;
          f[j].focus();
        }
      }
      si.addEventListener("click", () => fin(true));
      if (no) no.addEventListener("click", () => fin(false));
      // Click en el fondo oscuro = cancelar (en un aviso, cerrarlo).
      ov.addEventListener("mousedown", ev => { if (ev.target === ov) ov.dataset.afuera = "1"; });
      ov.addEventListener("click", ev => { if (ev.target === ov && ov.dataset.afuera) fin(false); delete ov.dataset.afuera; });

      window.addEventListener("keydown", teclas, true);
      document.body.appendChild(ov);
      if (inp) { inp.focus(); inp.select(); } else si.focus();
    });
  }

  window.lkAviso = (texto, o) => enCola(() => abrir("aviso", texto, null, o || {}));
  window.lkConfirmar = (texto, o) => enCola(() => abrir("confirmar", texto, null, o || {}));
  window.lkPedir = (texto, valor, o) => enCola(() => abrir("pedir", texto, valor, o || {}));
})();
