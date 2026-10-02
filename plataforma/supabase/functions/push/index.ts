// push — manda las notificaciones del sistema (push web) de Leuk Marketing.
//
// La llaman:
//   · los triggers de la base (SQL 2026-09-29-notificaciones-push.sql) cuando alguien
//     comenta, menciona, asigna una tarea o decide una sugerencia → { tabla, op, actor, nuevo, viejo }
//   · pg_cron los días hábiles a las 9 → { tipo: "diario" }
//     Esas dos vienen con el header x-push-secret (la clave vive en Vault y en los secretos).
//   · la app, con el token del usuario, para el botón "Enviar un aviso de prueba" → { accion: "prueba" }
//
// Decide A QUIÉN le toca cada aviso con los mismos permisos que la app (rol / marketing),
// busca sus dispositivos en `push_suscripciones` y manda. Los dispositivos que ya no
// existen (el navegador responde 404/410) se borran solos.
//
// Deploy: Supabase → Edge Functions → Deploy a new function, nombre: push.
//   Desactivar "Verify JWT" (la función valida sola: clave secreta o token del usuario).
// Secretos (Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SECRET.
//   SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya los inyecta Supabase.

import webpush from "npm:web-push@3.6.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-push-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRETO = Deno.env.get("PUSH_SECRET") || "";
const ADMIN = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

webpush.setVapidDetails(
  "mailto:analisiscomercial@leukiluminacion.com.ar",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

type Perfil = { email: string; nombre: string | null; rol: string | null; marketing: boolean | null };
type Aviso = { title: string; body: string; url: string; tag: string };
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;

const low = (s: unknown) => String(s ?? "").toLowerCase();
const rest = async (q: string) => {
  const r = await fetch(`${URL_SB}/rest/v1/${q}`, { headers: ADMIN });
  return r.ok ? await r.json() : [];
};

// ---- Permisos: los mismos que ROLES / esMarketing() en app.js ----
const ALIAS: Record<string, string> = { editor: "lider", lector: "comercial", fichas: "diseno" };
const rolDe = (p?: Perfil) => (p ? ALIAS[p.rol || ""] || p.rol || "" : "");
const PUEDE = {
  tareas: (p?: Perfil) => !!p && (!!p.marketing || rolDe(p) === "admin"),
  acciones: (p?: Perfil) => ["admin", "lider"].includes(rolDe(p)),
  verContenidos: (p?: Perfil) => ["admin", "lider", "coordinacion", "diseno", "representante"].includes(rolDe(p)),
};

// ---- Menciones: "@Nombre Apellido" contra los nombres del equipo (igual que en la app) ----
const escRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function mencionados(texto: string, perfiles: Perfil[]): string[] {
  if (!texto || !texto.includes("@")) return [];
  const conNombre = perfiles.filter((p) => p.nombre);
  if (!conNombre.length) return [];
  const nombres = conNombre.map((p) => p.nombre!).sort((a, b) => b.length - a.length);
  const re = new RegExp(`@(${nombres.map(escRe).join("|")})(?![\\p{L}\\p{N}])`, "giu");
  const out = new Set<string>();
  for (const m of texto.matchAll(re)) {
    const p = conNombre.find((x) => low(x.nombre) === low(m[1]));
    if (p) out.add(low(p.email));
  }
  return [...out];
}

// ---- Envío ----
async function mandar(emails: string[], aviso: Aviso) {
  const lista = [...new Set(emails.map(low).filter(Boolean))];
  if (!lista.length) return 0;
  const subs: Fila[] = await rest(`push_suscripciones?select=*&email=in.(${lista.map(encodeURIComponent).join(",")})`);
  let n = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(aviso),
        { TTL: 60 * 60 * 24 },
      );
      n++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {       // el dispositivo ya no existe: se borra
        await fetch(`${URL_SB}/rest/v1/push_suscripciones?endpoint=eq.${encodeURIComponent(s.endpoint)}`,
          { method: "DELETE", headers: ADMIN });
      } else console.error("push falló", code, String(e));
    }
  }));
  return n;
}

const hoyAR = () => new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 10);   // Argentina, UTC-3
const plural = (n: number, s: string, p: string) => (n === 1 ? s : p);

// ---- Responsables de Contenidos: por canal, quién HACE y quién REVISA ----
type Resp = { canal: string; email: string; papel: string };
const respDe = (lista: Resp[], canal: string, papel: string) =>
  lista.filter((r) => r.canal === canal && r.papel === papel).map((r) => low(r.email));
const CANAL_T: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", mailing: "Mailing" };

// ---- Qué avisar según lo que pasó ----
async function evento(ev: Fila, perfiles: Perfil[]) {
  const perfil = (email: string) => perfiles.find((p) => low(p.email) === low(email));
  const nombre = (email: string, cae?: string) => cae || perfil(email)?.nombre || String(email || "").split("@")[0] || "Alguien";
  const actor = low(ev.actor);
  const nuevo: Fila = ev.nuevo || {}, viejo: Fila = ev.viejo || {};
  let enviados = 0;

  if (ev.tabla === "tareas_comentarios") {
    const [t] = await rest(`tareas?id=eq.${nuevo.tarea_id}&select=id,titulo`);
    const para = mencionados(nuevo.texto, perfiles).filter((e) => e !== low(nuevo.autor_email) && PUEDE.tareas(perfil(e)));
    enviados += await mandar(para, { title: `${nombre(nuevo.autor_email, nuevo.autor)} te mencionó`,
      body: t?.titulo || "En una tarea", url: `./#tarea=${nuevo.tarea_id}`, tag: `tk-c-${nuevo.id}` });
  }

  if (ev.tabla === "tareas") {
    // Te asignaron: al crearla para otro, o al cambiar el responsable (no si te la asignaste vos)
    const resp = low(nuevo.responsable_email);
    const quien = ev.op === "INSERT" ? low(nuevo.autor_email) : actor;
    if (resp && resp !== quien && (ev.op === "INSERT" || resp !== low(viejo.responsable_email)) && PUEDE.tareas(perfil(resp))) {
      enviados += await mandar([resp], { title: `${quien ? nombre(quien) : "Alguien"} te asignó una tarea`,
        body: nuevo.titulo + (nuevo.fecha_limite ? ` · para el ${String(nuevo.fecha_limite).split("-").reverse().slice(0, 2).join("/")}` : ""),
        url: `./#tarea=${nuevo.id}`, tag: `tk-a-${nuevo.id}` });
    }
    // Menciones en el checklist: cada paso sella a quién menciona (menc), quién (mpor) y cuándo (mts)
    const antes = new Set((Array.isArray(viejo.checklist) ? viejo.checklist : []).map((x: Fila) => x.mts).filter(Boolean));
    for (const x of Array.isArray(nuevo.checklist) ? nuevo.checklist : []) {
      if (!x.mts || !x.menc || antes.has(x.mts) || x.ok) continue;
      const para = String(x.menc).split(",").map(low).filter((e) => e && e !== low(x.mpor) && PUEDE.tareas(perfil(e)));
      enviados += await mandar(para, { title: `${nombre(x.mpor)} te mencionó en un paso`, body: nuevo.titulo,
        url: `./#tarea=${nuevo.id}`, tag: `tk-p-${nuevo.id}-${x.mts}` });
    }
  }

  if (ev.tabla === "acciones_comentarios" || (ev.tabla === "acciones_hitos" && nuevo.tipo !== "estado")) {
    const [a] = await rest(`acciones?id=eq.${nuevo.accion_id}&select=id,titulo`);
    const para = mencionados(nuevo.texto, perfiles).filter((e) => e !== low(nuevo.autor_email) && PUEDE.acciones(perfil(e)));
    enviados += await mandar(para, { title: `${nombre(nuevo.autor_email, nuevo.autor)} te mencionó`,
      body: a?.titulo || "En una acción", url: `./#accion=${nuevo.accion_id}`, tag: `ac-${nuevo.id}` });
  }

  // Contenidos: sólo a los responsables del canal (contenidos_responsables), según el paso.
  if (ev.tabla === "contenidos_comentarios" || ev.tabla === "contenidos") {
    const idPieza = ev.tabla === "contenidos" ? nuevo.id : nuevo.contenido_id;
    const [m] = ev.tabla === "contenidos" ? [nuevo] : await rest(`contenidos?id=eq.${idPieza}&select=id,criterio,canal`);
    if (!m) return enviados;
    const resp: Resp[] = await rest(`contenidos_responsables?select=canal,email,papel&canal=eq.${encodeURIComponent(m.canal)}`);
    const hace = respDe(resp, m.canal, "hace"), revisa = respDe(resp, m.canal, "revisa");
    const donde = `${m.criterio || "Sin título"} · ${CANAL_T[m.canal] || m.canal}`;
    const url = `./#pieza=${idPieza}`;
    const sin = (lista: string[], quien: string) => lista.filter((e) => e !== low(quien) && PUEDE.verContenidos(perfil(e)));

    if (ev.tabla === "contenidos") {
      // Cambió el estado de la pieza (lo calcula la base a partir de placas y copy)
      const quien = actor ? nombre(actor) : "Alguien";
      const avisos: Record<string, { para: string[]; title: string }> = {
        revision: { para: revisa, title: `${quien} pidió feedback` },
        cambios: { para: hace, title: `${quien} dejó ajustes` },
        aprobado: { para: hace, title: `${quien} la marcó lista para publicar` },
      };
      const aviso = avisos[String(nuevo.estado)];
      if (aviso) enviados += await mandar(sin(aviso.para, actor), { title: aviso.title, body: donde, url, tag: `ct-e-${idPieza}-${nuevo.estado}` });
    } else if (ev.op === "INSERT") {
      // Comentario o sugerencia → a la otra parte; si lo escribe alguien de afuera, a las dos
      const autor = low(nuevo.autor_email);
      const para = hace.includes(autor) ? revisa : revisa.includes(autor) ? hace : [...hace, ...revisa];
      enviados += await mandar(sin(para, autor), { title: `${nombre(nuevo.autor_email, nuevo.autor)} ${nuevo.tipo === "sugerencia" ? "sugirió un cambio" : "comentó"}`,
        body: donde, url, tag: `ct-${nuevo.id}` });
    } else if (nuevo.decision && !viejo.decision && low(nuevo.autor_email) !== actor && PUEDE.verContenidos(perfil(nuevo.autor_email))) {
      // Decidieron tu sugerencia → a quien la hizo
      enviados += await mandar([nuevo.autor_email], {
        title: nuevo.decision === "aceptada" ? "Aceptaron tu sugerencia" : "Descartaron tu sugerencia",
        body: donde, url, tag: `ct-d-${nuevo.id}` });
    }
  }
  return enviados;
}

// ---- Resumen del día: a cada persona con avisos activos, sólo lo suyo ----
async function diario(perfiles: Perfil[]) {
  const hoy = hoyAR();
  const subs: Fila[] = await rest("push_suscripciones?select=email");
  const emails = [...new Set(subs.map((s) => low(s.email)))];
  const tareas: Fila[] = await rest(`tareas?select=id,titulo,responsable_email,fecha_limite&estado=neq.hecha&fecha_limite=lte.${hoy}`);
  const piezas: Fila[] = await rest(`contenidos?select=id,estado,canal&fecha=eq.${hoy}&estado=not.in.(aprobado,publicado)`);
  const resp: Resp[] = await rest("contenidos_responsables?select=canal,email,papel");
  let enviados = 0;
  for (const email of emails) {
    const p = perfiles.find((x) => low(x.email) === email);
    const nt = PUEDE.tareas(p) ? tareas.filter((t) => low(t.responsable_email) === email).length : 0;
    // piezas que salen hoy sin aprobar, de los canales donde hace o revisa
    const misCanales = new Set(resp.filter((r) => low(r.email) === email).map((r) => r.canal));
    const nc = PUEDE.verContenidos(p) ? piezas.filter((x) => misCanales.has(x.canal)).length : 0;
    if (!nt && !nc) continue;
    const partes = [
      nt ? `${nt} ${plural(nt, "tarea tuya", "tareas tuyas")} para hoy o ${plural(nt, "vencida", "vencidas")}` : "",
      nc ? `${nc} ${plural(nc, "pieza sale", "piezas salen")} hoy y no ${plural(nc, "está lista", "están listas")}` : "",
    ].filter(Boolean);
    enviados += await mandar([email], { title: "Para hoy", body: partes.join(" · "), url: "./#hoy", tag: `venc-${hoy}` });
  }
  return enviados;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const cuerpo: Fila = await req.json().catch(() => ({}));

  // Botón de prueba desde la app: con el token del usuario, sólo a sus propios dispositivos.
  if (cuerpo.accion === "prueba") {
    const r = await fetch(`${URL_SB}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: req.headers.get("authorization") || "" } });
    const u = r.ok ? await r.json() : null;
    if (!u?.email) return json({ error: "Sesión inválida" }, 401);
    const n = await mandar([u.email], { title: "Avisos activados", body: "Así te van a llegar las novedades de Leuk Marketing.",
      url: "./", tag: "prueba" });
    return json({ enviados: n });
  }

  // Todo lo demás viene de la base: tiene que traer la clave.
  if (!SECRETO || req.headers.get("x-push-secret") !== SECRETO) return json({ error: "No autorizado" }, 401);
  const perfiles: Perfil[] = await rest("perfiles?select=email,nombre,rol,marketing");
  try {
    const enviados = cuerpo.tipo === "diario" ? await diario(perfiles) : await evento(cuerpo, perfiles);
    return json({ enviados });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
