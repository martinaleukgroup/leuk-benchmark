// figma-render — trae las imágenes de los frames de Figma y congela las aprobadas.
//
// Por qué existe: el token de Figma no puede vivir en el navegador (app/ es un repo
// PÚBLICO en GitHub Pages). Esta función corre en el servidor, guarda el token como
// secreto y sólo responde a un usuario logueado que pueda ver el módulo Contenidos.
//
// Acciones:
//   { accion: "render",   file_key, nodos: ["1297:239", ...] }
//        -> { urls: { "1297:239": "https://..." } }
//        Una sola llamada a Figma para TODOS los nodos: el plan Starter se queda sin
//        cuota con ~30 imágenes por minuto, así que nunca una llamada por tarjeta.
//        Lo ya cacheado y no vencido no se vuelve a pedir.
//
//   { accion: "congelar", contenido_id, placa, file_key, nodo }
//        -> { path, url }
//        Figma renderiza SIEMPRE el estado actual del frame: sin congelar, lo que se
//        aprobó cambia solo cuando la diseñadora sigue trabajando. Guarda el PNG en
//        el bucket privado `placas` y devuelve una URL firmada.
//
//   { accion: "ver", paths: ["<id>/1.png", ...] }
//        -> { urls: { path: "https://...firmada" } }
//        Los PNG congelados viven en un bucket privado: se miran con URL firmada.
//
//   { accion: "estado" } -> { ok, token, ultima_modificacion? }
//        Para que la plataforma sepa si ya está el token, sin adivinar.
//
// Deploy: Supabase → Edge Functions → Deploy a new function (nombre: figma-render).
// Secreto necesario: FIGMA_TOKEN (Settings → Edge Functions → Secrets).
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase solo.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Las URLs de Figma vencen a los 30 días. Se guardan con 25 para no llegar nunca
// a servir una URL muerta por un redondeo.
const DIAS_CACHE = 25;
const FIRMA_SEG = 60 * 60 * 24 * 7;   // la URL firmada del PNG congelado dura una semana

// Peso, medido contra el archivo real: un frame de Instagram a scale=2 son ~7 MB.
// Un mes de 20 placas serían 140 MB por vista — inusable. Así que:
//   mirar   -> scale 0.5 (~500 KB), alcanza de sobra para la grilla y la ficha
//   congelar-> scale 1 (1080 px, el tamaño con el que se publica de verdad)
const ESCALA_VISTA = "0.5";
const ESCALA_CONGELADA = "1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const URL_SB = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const TOKEN = Deno.env.get("FIGMA_TOKEN") || "";
  const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

  // ---- 1. ¿Quién pide? Se valida el token del usuario, no lo que diga el navegador ----
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Falta sesión" }, 401);

  const uRes = await fetch(`${URL_SB}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: auth } });
  if (!uRes.ok) return json({ error: "Sesión inválida" }, 401);

  // ---- 2. ¿Puede? Se le pregunta a la base con el token del usuario, así valen
  //         las mismas funciones que usan las políticas RLS: una sola verdad. ----
  const puede = async (fn: string) => {
    const r = await fetch(`${URL_SB}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: SERVICE, Authorization: auth, "Content-Type": "application/json" },
      body: "{}",
    });
    return r.ok && (await r.json()) === true;
  };
  if (!(await puede("puede_ver_contenidos"))) return json({ error: "Sin acceso al módulo Contenidos" }, 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* body vacío */ }
  const accion = String(body.accion || "render");

  // ---- 3. Estado: ¿está el token cargado? ----
  if (accion === "estado") {
    if (!TOKEN) return json({ ok: false, token: false });
    const fk = String(body.file_key || "");
    if (!fk) return json({ ok: true, token: true });
    // `lastModified` es barato y reemplaza a los webhooks, que el plan Starter no tiene.
    const r = await fetch(`https://api.figma.com/v1/files/${encodeURIComponent(fk)}?depth=1`,
      { headers: { "X-Figma-Token": TOKEN } });
    if (!r.ok) return json({ ok: false, token: true, error: `Figma respondió ${r.status}` });
    const f = await r.json();
    return json({ ok: true, token: true, ultima_modificacion: f.lastModified, nombre: f.name });
  }

  if (!TOKEN) {
    return json({ error: "Falta el secreto FIGMA_TOKEN en la Edge Function", sin_token: true }, 503);
  }

  // ---- 4. Ver los PNG congelados (bucket privado → URL firmada) ----
  if (accion === "ver") {
    const paths = (body.paths as string[] || []).filter(Boolean);
    const urls: Record<string, string> = {};
    for (const p of paths) {
      const r = await fetch(`${URL_SB}/storage/v1/object/sign/placas/${p}`, {
        method: "POST", headers: admin, body: JSON.stringify({ expiresIn: FIRMA_SEG }),
      });
      if (r.ok) urls[p] = `${URL_SB}/storage/v1${(await r.json()).signedURL}`;
    }
    return json({ urls });
  }

  const fileKey = String(body.file_key || "").trim();
  if (!fileKey) return json({ error: "Falta file_key" }, 400);

  // ---- 5. Render de una tanda de nodos ----
  if (accion === "render") {
    const nodos = [...new Set((body.nodos as string[] || []).map((n) => String(n).trim()).filter(Boolean))];
    if (!nodos.length) return json({ urls: {} });

    // 5.a — lo que ya está en caché y no venció no se le vuelve a pedir a Figma.
    // `forzar` es el botón "actualizar piezas": sin webhooks (el plan Starter no
    // los tiene), volver a pedir es la única forma de ver un cambio del diseño.
    const forzar = body.forzar === true;
    const q = nodos.map((n) => `"${n}"`).join(",");
    const cRes = forzar ? null : await fetch(
      `${URL_SB}/rest/v1/figma_cache?select=nodo,url,vence&file_key=eq.${encodeURIComponent(fileKey)}` +
      `&nodo=in.(${encodeURIComponent(q)})&vence=gt.${new Date().toISOString()}`,
      { headers: admin },
    );
    const urls: Record<string, string> = {};
    if (cRes && cRes.ok) for (const f of await cRes.json()) urls[f.nodo] = f.url;

    const faltan = nodos.filter((n) => !urls[n]);
    if (!faltan.length) return json({ urls, desde_cache: nodos.length, pedidos: 0 });

    // 5.b — UNA sola llamada para todos los que faltan
    const fRes = await fetch(
      `https://api.figma.com/v1/images/${encodeURIComponent(fileKey)}` +
      `?ids=${encodeURIComponent(faltan.join(","))}&format=png&scale=${ESCALA_VISTA}`,
      { headers: { "X-Figma-Token": TOKEN } },
    );
    if (!fRes.ok) {
      const espera = Number(fRes.headers.get("retry-after") || 0);
      const cuando = espera > 90 ? `en ${Math.ceil(espera / 60)} minutos`
        : espera > 0 ? `en ${espera} segundos`
        : "en un rato (Figma no dijo cuánto)";
      const detalle = fRes.status === 429
        ? `Figma cortó por límite de renderizado: probá de nuevo ${cuando}.`
        : fRes.status === 403
        ? "El token no tiene acceso a ese archivo."
        : `Figma respondió ${fRes.status}.`;
      // Se devuelve lo que sí había en caché: media vista es mejor que ninguna.
      return json({ urls, error: detalle, parcial: true, reintentar_en: espera || null }, 200);
    }
    const data = await fRes.json();
    const vence = new Date(Date.now() + DIAS_CACHE * 864e5).toISOString();
    const guardar: unknown[] = [];
    for (const [nodo, u] of Object.entries(data.images || {})) {
      if (!u) continue;                       // nodo inexistente o vacío: Figma devuelve null
      urls[nodo] = String(u);
      guardar.push({ file_key: fileKey, nodo, url: u, vence, actualizado: new Date().toISOString() });
    }
    if (guardar.length) {
      await fetch(`${URL_SB}/rest/v1/figma_cache`, {
        method: "POST",
        headers: { ...admin, Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(guardar),
      });
    }
    const vacios = faltan.filter((n) => !urls[n]);
    return json({ urls, pedidos: faltan.length, sin_render: vacios });
  }

  // ---- 6. Congelar el PNG de una placa aprobada ----
  if (accion === "congelar") {
    if (!(await puede("puede_editar_contenidos"))) {
      return json({ error: "Sólo quien edita puede congelar una placa" }, 403);
    }
    const id = String(body.contenido_id || "").trim();
    const placa = Number(body.placa);
    const nodo = String(body.nodo || "").trim();
    if (!id || !nodo || !Number.isInteger(placa)) return json({ error: "Faltan datos de la placa" }, 400);

    // Se pide el render SIN caché: congelar es justamente fijar el estado de HOY.
    const fRes = await fetch(
      `https://api.figma.com/v1/images/${encodeURIComponent(fileKey)}` +
      `?ids=${encodeURIComponent(nodo)}&format=png&scale=${ESCALA_CONGELADA}`,
      { headers: { "X-Figma-Token": TOKEN } },
    );
    if (!fRes.ok) return json({ error: `Figma respondió ${fRes.status}` }, 502);
    const src = (await fRes.json()).images?.[nodo];
    if (!src) return json({ error: "Figma no devolvió imagen para ese frame" }, 404);

    const png = await fetch(String(src));
    if (!png.ok) return json({ error: "No se pudo bajar el PNG de Figma" }, 502);
    const bytes = new Uint8Array(await png.arrayBuffer());

    const path = `${id}/${placa}.png`;
    const up = await fetch(`${URL_SB}/storage/v1/object/placas/${path}`, {
      method: "POST",
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "image/png", "x-upsert": "true" },
      body: bytes,
    });
    if (!up.ok) return json({ error: `No se pudo guardar el PNG (${up.status})` }, 502);

    const sig = await fetch(`${URL_SB}/storage/v1/object/sign/placas/${path}`, {
      method: "POST", headers: admin, body: JSON.stringify({ expiresIn: FIRMA_SEG }),
    });
    const url = sig.ok ? `${URL_SB}/storage/v1${(await sig.json()).signedURL}` : "";
    return json({ path, url, bytes: bytes.length });
  }

  return json({ error: `Acción desconocida: ${accion}` }, 400);
});
