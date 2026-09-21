-- ============================================================================
--  ACCIONES — comentarios en cada acción, con menciones (@Nombre).
--  Correr una vez en Supabase → SQL Editor (proyecto cswqoretlhppxkelysny).
--  Idempotente. Requiere 2026-09-18-acciones.sql.
--
--  Igual que tareas_comentarios: las menciones van como texto plano ("@Carla Ruiz")
--  y las reconoce acciones.js contra equipo_acciones(); no hace falta columna aparte.
--  Comentar: cualquiera que entra a Acciones. Borrar: quien lo escribió o un admin.
-- ============================================================================
create table if not exists acciones_comentarios (
  id           uuid primary key default gen_random_uuid(),
  accion_id    uuid not null references acciones(id) on delete cascade,
  texto        text not null,
  autor        text,
  autor_email  text,
  creado       timestamptz not null default now()
);
create index if not exists acciones_com_idx on acciones_comentarios (accion_id, creado);

alter table acciones_comentarios enable row level security;

drop policy if exists acm_sel on acciones_comentarios;
create policy acm_sel on acciones_comentarios for select to authenticated using (puede_ver_acciones());
drop policy if exists acm_ins on acciones_comentarios;
create policy acm_ins on acciones_comentarios for insert to authenticated
  with check (puede_ver_acciones() and lower(autor_email) = lower(auth.jwt() ->> 'email'));
drop policy if exists acm_del on acciones_comentarios;
create policy acm_del on acciones_comentarios for delete to authenticated
  using (puede_ver_acciones() and (lower(autor_email) = lower(auth.jwt() ->> 'email') or rol_actual() = 'admin'));
