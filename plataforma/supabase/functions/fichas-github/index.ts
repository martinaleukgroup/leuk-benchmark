// fichas-github — dispara desde la plataforma la actualización de fichas en GitHub Actions
// (workflow "Fichas técnicas · actualización diaria", automatizacion/ci) y cuenta cómo va.
//
// Por qué existe: correr un workflow necesita un token de GitHub, y ese token no puede
// vivir en el navegador (app/ es un repo PÚBLICO en GitHub Pages). Esta función guarda el
// token como secreto y sólo responde a un usuario logueado con rol admin, líder o
// coordinación (decisión de Martina, 02/11/2026).
//
// Acciones:
//   { accion: "correr", modo: "prueba" | "real", solo?: "MOLY, DYNA" }
//        -> { ok: true }   (409 si ya hay una corrida en curso)
//   { accion: "estado" }
//        -> { ok, corrida: { estado, resultado, inicio, fin, url, origen, modo?, resumen? } | null }
//        `resumen` sale de la anotación "Resumen fichas" que deja el script al terminar.
//
// Deploy: Supabase → Edge Functions → Deploy a new function (nombre: fichas-github),
//         pegar este archivo y DESACTIVAR "Verify JWT" (la función valida sola).
// Secreto necesario: GITHUB_TOKEN (Settings → Edge Functions → Secrets): token
//         "fine-grained" sólo para el repo leuk-benchmark, permiso Actions: Read and write.
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase solo.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const REPO = "martinaleukgroup/leuk-benchmark";
const WORKFLOW = "fichas-diarias.yml";
const ROLES = ["admin", "lider", "coordinacion"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const URL_SB = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const GH = Deno.env.get("GITHUB_TOKEN") || "";

  // ---- 1. ¿Quién pide? Se valida el token del usuario, no lo que diga el navegador ----
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Falta sesión" }, 401);
  const uRes = await fetch(`${URL_SB}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: auth } });
  if (!uRes.ok) return json({ error: "Sesión inválida" }, 401);

  // ---- 2. ¿Puede? El rol sale de la base (rol_actual), la misma verdad que usan las RLS ----
  const rRes = await fetch(`${URL_SB}/rest/v1/rpc/rol_actual`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: auth, "Content-Type": "application/json" },
    body: "{}",
  });
  const rol = rRes.ok ? String(await rRes.json()) : "";
  if (!ROLES.includes(rol)) return json({ error: "Sólo admin, líder o coordinación pueden regenerar las fichas" }, 403);

  if (!GH) return json({ error: "Falta cargar el secreto GITHUB_TOKEN en Supabase", sin_token: true }, 503);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vacío */ }
  const accion = String(body.accion || "");

  const gh = (path: string, init: RequestInit = {}, conToken = true) =>
    fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "leuk-plataforma",
        ...(conToken ? { Authorization: `Bearer ${GH}` } : {}),
        ...(init.headers || {}),
      },
    });

  const ultima = async () => {
    const r = await gh(`/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=1`);
    if (!r.ok) throw new Error(`GitHub respondió ${r.status} al pedir las corridas`);
    const d = await r.json();
    return (d.workflow_runs || [])[0] || null;
  };

  try {
    if (accion === "correr") {
      const modo = body.modo === "real" ? "real" : "prueba";
      const solo = String(body.solo || "").slice(0, 500);
      const u = await ultima();
      if (u && (u.status === "queued" || u.status === "in_progress")) {
        return json({ error: "Ya hay una corrida en curso. Esperá a que termine.", url: u.html_url }, 409);
      }
      const r = await gh(`/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: "main", inputs: { modo, solo, max_pdfs: "30" } }),
      });
      if (r.status !== 204) {
        const t = await r.text();
        return json({ error: `GitHub no aceptó el pedido (${r.status})`, detalle: t.slice(0, 300) }, 502);
      }
      return json({ ok: true });
    }

    if (accion === "estado") {
      const u = await ultima();
      if (!u) return json({ ok: true, corrida: null });
      const corrida: Record<string, unknown> = {
        estado: u.status, resultado: u.conclusion, inicio: u.run_started_at || u.created_at,
        fin: u.status === "completed" ? u.updated_at : null, url: u.html_url,
        origen: u.event === "schedule" ? "automática" : "manual",
      };
      if (u.status === "completed") {
        // El resumen lo deja el script como anotación ("::notice title=Resumen fichas::…").
        // Las anotaciones son públicas en un repo público: si el token no alcanza, sin token.
        try {
          const j = await (await gh(`/repos/${REPO}/actions/runs/${u.id}/jobs`)).json();
          const job = (j.jobs || [])[0];
          if (job) {
            let a = await gh(`/repos/${REPO}/check-runs/${job.id}/annotations`);
            if (!a.ok) a = await gh(`/repos/${REPO}/check-runs/${job.id}/annotations`, {}, false);
            if (a.ok) {
              const notas = await a.json();
              const n = (notas || []).find((x: { title?: string }) => (x.title || "").startsWith("Resumen fichas"));
              if (n) corrida.resumen = n.message;
            }
          }
        } catch { /* sin resumen: la plataforma muestra el link */ }
      }
      return json({ ok: true, corrida });
    }

    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 502);
  }
});
