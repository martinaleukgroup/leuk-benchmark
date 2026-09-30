# Notificaciones del sistema (push) — puesta en marcha

Los avisos que llegan al celular o a la compu **aunque la plataforma esté cerrada**:
menciones, tareas asignadas, novedades de contenidos y el resumen del día (lunes a
viernes, 9 hs).

Las claves **no** están en ningún archivo del repo. Viven en
`~/.leuk_pricing/push_claves.txt` y `~/.leuk_pricing/push_vault.sql` (sólo en esta
compu) y, una vez cargadas, en los secretos y en Vault de Supabase.

## Pasos en Supabase (una sola vez)

1. **SQL Editor → pegar y correr** `supabase/sql/2026-09-29-notificaciones-push.sql`.
   Crea la tabla de dispositivos, los triggers y el resumen diario.
   Si da error con `pg_cron` o `pg_net`: Database → Extensions → activarlas y volver a correrlo.
2. **SQL Editor → pegar y correr** `~/.leuk_pricing/push_vault.sql`.
   Guarda en Vault la clave con la que los triggers le hablan a la función.
3. **Edge Functions → Secrets → agregar** los tres valores de `~/.leuk_pricing/push_claves.txt`:
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_SECRET`.
4. **Edge Functions → Deploy a new function**, nombre `push`, pegar
   `supabase/functions/push/index.ts` y **desactivar "Verify JWT"** (la función valida sola).

## Probar

En la plataforma: tu nombre (abajo del menú) → **Avisos en este dispositivo** →
**Activar avisos** → **Enviar un aviso de prueba**.

En iPhone/iPad: primero Compartir → *Agregar a inicio*, abrir la plataforma desde ese
ícono y recién ahí activar.

## Si algo no llega

- Supabase → Edge Functions → `push` → **Logs**: ahí aparece cada envío y cada error.
- "Falta correr el SQL…" al activar → falta el paso 1.
- La prueba dice "Falta desplegar la función" → falta el paso 4.
- Llega la prueba pero no los avisos de menciones → falta el paso 2 (Vault) o el
  `PUSH_SECRET` de los secretos no coincide con el de Vault.
- Cerrar sesión desactiva los avisos de ese dispositivo (para que en una compu
  compartida no le lleguen a otra persona).
