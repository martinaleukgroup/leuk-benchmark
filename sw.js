/* Service worker de Leuk Marketing — SÓLO para las notificaciones del sistema (push).
   No cachea nada: la app se sigue cargando siempre de la red, como antes.
   · push              → muestra el aviso que manda la Edge Function `push`
   · notificationclick → trae al frente la plataforma (o la abre) y la lleva a lo avisado */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Leuk Marketing", {
    body: d.body || "",
    icon: "assets/icon-192.png",
    badge: "assets/favicon-32.png",
    tag: d.tag || undefined,          // el mismo aviso no se duplica
    // Explícito: sin esto el navegador decide, y en la Mac (Chrome y Safari) los mostraba sin sonido
    silent: false,
    renotify: !!d.tag,                // si reemplaza a uno con la misma etiqueta, que vuelva a avisar
    data: { url: d.url || "./" },
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(lista => {
    const abierta = lista.find(c => c.url.startsWith(self.registration.scope));
    if (abierta) { abierta.postMessage({ tipo: "ir", url }); return abierta.focus(); }
    return self.clients.openWindow(url);
  }));
});
