// gestion-usuarios — crea y elimina CUENTAS de acceso (Supabase Auth) desde el panel.
//
// Por qué existe: crear una cuenta requiere la service_role key, que NO puede vivir en el
// navegador (daría acceso total a la base a cualquiera que abra el inspector). Esta función
// corre en el servidor de Supabase, guarda la llave como secreto y sólo acepta pedidos de
// un usuario logueado cuyo perfil tenga rol 'admin'.
//
// Acciones:
//   { accion: "crear",   email, password, nombre, rol }  -> crea la cuenta + su perfil
//   { accion: "eliminar", email }                        -> borra la cuenta + su perfil
//   { accion: "password", email, password }              -> resetea la contraseña
//
// Deploy: Supabase → Edge Functions → Deploy a new function (nombre: gestion-usuarios).
// Secretos necesarios: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (Supabase ya los inyecta).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const URL_SB = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    "Content-Type": "application/json",
  };

  // ---- 1. ¿Quién pide? Se valida el token del usuario, no lo que diga el navegador ----
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Falta sesión" }, 401);

  const uRes = await fetch(`${URL_SB}/auth/v1/user`, {
    headers: { apikey: SERVICE, Authorization: auth },
  });
  if (!uRes.ok) return json({ error: "Sesión inválida" }, 401);
  const usuario = await uRes.json();
  const email = String(usuario?.email || "").toLowerCase();
  if (!email) return json({ error: "Sesión sin email" }, 401);

  // ---- 2. ¿Es admin? Se consulta la tabla, no se confía en el pedido ----
  const pRes = await fetch(
    `${URL_SB}/rest/v1/perfiles?select=rol&email=ilike.${encodeURIComponent(email)}`,
    { headers: admin },
  );
  const perfil = pRes.ok ? await pRes.json() : [];
  if (!perfil.length || perfil[0].rol !== "admin") {
    return json({ error: "Solo un administrador puede gestionar usuarios" }, 403);
  }

  // ---- 3. Acción ----
  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { /* body vacío */ }
  const accion = body.accion;
  const destino = String(body.email || "").trim().toLowerCase();
  // Tiene que coincidir con ROLES de app.js. Si se suma un rol allá y no acá,
  // la creación de la cuenta falla con "Rol inválido".
  const ROLES_OK = ["admin", "lider", "coordinacion", "comercial", "diseno", "representante"];

  if (!destino) return json({ error: "Falta el email" }, 400);
  // Nadie puede eliminarse ni degradarse a sí mismo: evita quedarse sin ningún admin.
  if (destino === email && accion !== "password") {
    return json({ error: "No podés modificar tu propio usuario desde el panel" }, 400);
  }

  const buscarId = async () => {
    const r = await fetch(
      `${URL_SB}/auth/v1/admin/users?email=${encodeURIComponent(destino)}`,
      { headers: admin },
    );
    const d = r.ok ? await r.json() : { users: [] };
    return (d.users && d.users[0]?.id) || null;
  };

  if (accion === "crear") {
    const rol = String(body.rol || "");
    if (!ROLES_OK.includes(rol)) return json({ error: "Rol inválido" }, 400);
    if (!body.password || body.password.length < 8) {
      return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);
    }
    // La cuenta se crea ya confirmada: la persona entra directo con la clave temporal.
    const cRes = await fetch(`${URL_SB}/auth/v1/admin/users`, {
      method: "POST",
      headers: admin,
      body: JSON.stringify({
        email: destino,
        password: body.password,
        email_confirm: true,
      }),
    });
    if (!cRes.ok) {
      const err = await cRes.text();
      // Si la cuenta ya existía, igual se le asigna el perfil (caso típico: se registró sola).
      if (!/already|exists|registered/i.test(err)) {
        return json({ error: "No se pudo crear la cuenta: " + err.slice(0, 200) }, 400);
      }
    }
    const upRes = await fetch(`${URL_SB}/rest/v1/perfiles`, {
      method: "POST",
      headers: { ...admin, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify([{ email: destino, rol, nombre: body.nombre || "" }]),
    });
    if (!upRes.ok) return json({ error: "Cuenta creada, pero falló el perfil" }, 500);
    return json({ ok: true, email: destino, rol });
  }

  if (accion === "eliminar") {
    const id = await buscarId();
    if (id) {
      await fetch(`${URL_SB}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: admin });
    }
    await fetch(`${URL_SB}/rest/v1/perfiles?email=eq.${encodeURIComponent(destino)}`, {
      method: "DELETE",
      headers: admin,
    });
    return json({ ok: true, eliminado: destino, teniaCuenta: !!id });
  }

  if (accion === "password") {
    if (!body.password || body.password.length < 8) {
      return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);
    }
    const id = await buscarId();
    if (!id) return json({ error: "Esa persona todavía no tiene cuenta creada" }, 404);
    const r = await fetch(`${URL_SB}/auth/v1/admin/users/${id}`, {
      method: "PUT",
      headers: admin,
      body: JSON.stringify({ password: body.password }),
    });
    if (!r.ok) return json({ error: "No se pudo cambiar la contraseña" }, 400);
    return json({ ok: true, email: destino });
  }

  return json({ error: "Acción desconocida" }, 400);
});
