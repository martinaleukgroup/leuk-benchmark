-- ============================================================================
--  Notificaciones del sistema (push web) — avisos que llegan aunque la plataforma
--  esté cerrada: menciones, tareas asignadas, contenidos y el resumen del día.
--
--  Cómo funciona:
--    1. Cada dispositivo que activa los avisos guarda su "suscripción" en
--       `push_suscripciones` (la arma el navegador; la guarda app.js).
--    2. Cuando pasa algo (un comentario, una tarea asignada…) un trigger le avisa a la
--       Edge Function `push`, que decide a quién le corresponde y manda el aviso.
--    3. Los días hábiles a las 9 (hora Argentina) pg_cron pide el resumen del día.
--
--  La clave que usa el trigger para hablar con la función NO está en este archivo
--  (este archivo se publica): vive en Vault con el nombre 'push_secret'. Se carga una
--  sola vez con el SQL aparte que está en ~/.leuk_pricing/push_vault.sql.
--
--  Correr en Supabase → SQL Editor. Es idempotente: se puede volver a correr.
-- ============================================================================

-- ─── 0. Extensiones: pg_net (llamar a la función) y pg_cron (el resumen diario) ──
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ─── 1. Suscripciones: una fila por dispositivo ─────────────────────────────
create table if not exists push_suscripciones (
  endpoint   text primary key,                 -- lo da el navegador, único por dispositivo
  email      text not null,
  p256dh     text not null,
  auth       text not null,
  ua         text,                              -- qué dispositivo es (para reconocerlo)
  creado     timestamptz not null default now()
);
create index if not exists push_sus_email_idx on push_suscripciones (lower(email));

alter table push_suscripciones enable row level security;
-- Cada uno ve y maneja SÓLO sus dispositivos. La función lee todo con la service key.
drop policy if exists ps_sel on push_suscripciones;
create policy ps_sel on push_suscripciones for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));
drop policy if exists ps_ins on push_suscripciones;
create policy ps_ins on push_suscripciones for insert to authenticated
  with check (lower(email) = lower(auth.jwt() ->> 'email'));
drop policy if exists ps_upd on push_suscripciones;
create policy ps_upd on push_suscripciones for update to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'))
  with check (lower(email) = lower(auth.jwt() ->> 'email'));
drop policy if exists ps_del on push_suscripciones;
create policy ps_del on push_suscripciones for delete to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- ─── 2. Llamar a la función (nunca rompe la operación que lo disparó) ───────
create or replace function push_llamar(cuerpo jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare clave text;
begin
  select decrypted_secret into clave from vault.decrypted_secrets where name = 'push_secret' limit 1;
  if clave is null then return; end if;          -- sin clave cargada: no se avisa, pero todo sigue andando
  perform net.http_post(
    url     := 'https://cswqoretlhppxkelysny.supabase.co/functions/v1/push',
    body    := cuerpo,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', clave),
    timeout_milliseconds := 5000
  );
exception when others then
  raise warning 'push_llamar: %', sqlerrm;       -- un aviso que falla no puede frenar un comentario
end $$;

-- El trigger manda la fila nueva, la vieja y QUIÉN hizo el cambio (para no avisarle a sí mismo).
create or replace function push_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform push_llamar(jsonb_build_object(
    'tabla', tg_table_name,
    'op',    tg_op,
    'actor', lower(coalesce(auth.jwt() ->> 'email', '')),
    'nuevo', to_jsonb(new),
    'viejo', case when tg_op = 'UPDATE' then to_jsonb(old) else null end
  ));
  return new;
end $$;

-- ─── 3. Qué dispara un aviso ────────────────────────────────────────────────
drop trigger if exists push_tareas on tareas;
create trigger push_tareas after insert or update of responsable_email, checklist on tareas
  for each row execute function push_trigger();

drop trigger if exists push_tareas_com on tareas_comentarios;
create trigger push_tareas_com after insert on tareas_comentarios
  for each row execute function push_trigger();

drop trigger if exists push_acciones_com on acciones_comentarios;
create trigger push_acciones_com after insert on acciones_comentarios
  for each row execute function push_trigger();

drop trigger if exists push_acciones_hitos on acciones_hitos;
create trigger push_acciones_hitos after insert on acciones_hitos
  for each row execute function push_trigger();

drop trigger if exists push_contenidos_com on contenidos_comentarios;
create trigger push_contenidos_com after insert or update of decision on contenidos_comentarios
  for each row execute function push_trigger();

-- ─── 4. Resumen del día: lunes a viernes, 9:00 de Argentina (12:00 UTC) ─────
create or replace function push_diario() returns void
language sql security definer set search_path = public as $$
  select push_llamar(jsonb_build_object('tipo', 'diario'));
$$;

do $$ begin
  perform cron.unschedule('push-diario') where exists (select 1 from cron.job where jobname = 'push-diario');
end $$;
select cron.schedule('push-diario', '0 12 * * 1-5', 'select public.push_diario()');
