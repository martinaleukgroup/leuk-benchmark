-- ============================================================================
--  Módulo ACCIONES — seguimiento de acciones de marketing (alianzas, eventos,
--  sponsoreos, activaciones, canjes, workshops…) de la idea al resultado.
--  Correr una sola vez en Supabase → SQL Editor (proyecto cswqoretlhppxkelysny)
--  Es idempotente: se puede volver a correr sin romper nada.
--
--  Quién entra: SÓLO Admin y Líder (sale del rol, a diferencia de Tareas).
--  Adentro, todos crean, editan y suman a la línea de tiempo. Borrar una acción
--  o una entrada: quien la creó o un admin.
--
--  Cada acción tiene:
--    · ficha: tipo, estado, socio, fechas, responsable, inversión y veredicto
--    · métricas esperadas vs reales (jsonb, se editan en la ficha)
--    · línea de tiempo (acciones_hitos): notas, propuestas, contrapropuestas,
--      reuniones, resultados y los cambios de estado, con archivos adjuntos
--      que viven en el bucket PRIVADO `acciones`.
-- ============================================================================

-- ─── 0. Quién entra ─────────────────────────────────────────────────────────
-- rol_actual() está en 2026-08-31-contenidos.sql (traduce email → rol).
create or replace function puede_ver_acciones() returns boolean
language sql stable as $$ select rol_actual() in ('admin','lider'); $$;

-- A quién se le puede asignar una acción. Por RPC porque un líder no puede leer
-- los perfiles de los demás directo.
create or replace function equipo_acciones()
returns table (email text, nombre text)
language sql stable security definer set search_path = public as $$
  select p.email, coalesce(nullif(p.nombre, ''), split_part(p.email, '@', 1))
    from perfiles p
   where p.rol in ('admin','lider','editor') and puede_ver_acciones()
   order by 2;
$$;

-- ─── 1. Las acciones ────────────────────────────────────────────────────────
create table if not exists acciones (
  id                  uuid primary key default gen_random_uuid(),
  titulo              text not null default '',
  descripcion         text not null default '',
  tipo                text not null default '',          -- Alianza, Evento, Sponsoreo… (lista en acciones.js)
  estado              text not null default 'idea',      -- idea | evaluacion | negociacion | aprobada | curso | finalizada | descartada
  socio               text not null default '',          -- con quién: organizador, marca, estudio…
  distribuidor        text not null default '',          -- si participamos junto a un distribuidor
  responsable_email   text,
  fecha_inicio        date,
  fecha_fin           date,
  moneda              text not null default 'ARS',       -- ARS | USD
  inversion_estimada  numeric,
  inversion_real      numeric,
  inversion_items     jsonb not null default '[]'::jsonb, -- [{cat, det, est, real}] por rubro; los totales van arriba
  veredicto           text not null default '',          -- avanzar | condiciones | renegociar | descartar
  metricas            jsonb not null default '[]'::jsonb, -- [{n, u, esp, real, menos}] (menos = mejor si baja)
  aprendizajes        text not null default '',
  autor               text,
  autor_email         text,
  creado              timestamptz not null default now(),
  actualizado         timestamptz not null default now()
);
create index if not exists acciones_estado_idx on acciones (estado, fecha_inicio);

-- ─── 2. Línea de tiempo ─────────────────────────────────────────────────────
create table if not exists acciones_hitos (
  id           uuid primary key default gen_random_uuid(),
  accion_id    uuid not null references acciones(id) on delete cascade,
  tipo         text not null default 'nota',  -- nota | propuesta | contrapropuesta | reunion | resultado | estado
  texto        text not null default '',
  fecha        date not null default current_date,  -- cuándo pasó (se puede cargar con fecha pasada)
  archivos     jsonb not null default '[]'::jsonb,  -- [{path, nombre, tam, tipo}] → bucket `acciones`
  autor        text,
  autor_email  text,
  creado       timestamptz not null default now()
);
create index if not exists acciones_hitos_idx on acciones_hitos (accion_id, fecha desc, creado desc);

-- ─── 3. `actualizado` al día sin depender del front ─────────────────────────
create or replace function acciones_touch() returns trigger
language plpgsql as $$ begin new.actualizado := now(); return new; end $$;
drop trigger if exists acciones_touch_t on acciones;
create trigger acciones_touch_t before update on acciones
  for each row execute function acciones_touch();

-- ─── 4. Permisos de las tablas ──────────────────────────────────────────────
alter table acciones       enable row level security;
alter table acciones_hitos enable row level security;

drop policy if exists ac_sel on acciones;
create policy ac_sel on acciones for select to authenticated using (puede_ver_acciones());
drop policy if exists ac_ins on acciones;
create policy ac_ins on acciones for insert to authenticated
  with check (puede_ver_acciones() and lower(autor_email) = lower(auth.jwt() ->> 'email'));
drop policy if exists ac_upd on acciones;
create policy ac_upd on acciones for update to authenticated
  using (puede_ver_acciones()) with check (puede_ver_acciones());
drop policy if exists ac_del on acciones;
create policy ac_del on acciones for delete to authenticated
  using (puede_ver_acciones() and (lower(autor_email) = lower(auth.jwt() ->> 'email') or rol_actual() = 'admin'));

drop policy if exists ah_sel on acciones_hitos;
create policy ah_sel on acciones_hitos for select to authenticated using (puede_ver_acciones());
drop policy if exists ah_ins on acciones_hitos;
create policy ah_ins on acciones_hitos for insert to authenticated
  with check (puede_ver_acciones() and lower(autor_email) = lower(auth.jwt() ->> 'email'));
drop policy if exists ah_del on acciones_hitos;
create policy ah_del on acciones_hitos for delete to authenticated
  using (puede_ver_acciones() and (lower(autor_email) = lower(auth.jwt() ->> 'email') or rol_actual() = 'admin'));

-- ─── 5. Bucket privado para propuestas y archivos ───────────────────────────
-- Privado: se mira con URLs firmadas que duran una hora. Límite 50 MB por archivo.
insert into storage.buckets (id, name, public, file_size_limit)
     values ('acciones', 'acciones', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists acciones_obj_sel on storage.objects;
create policy acciones_obj_sel on storage.objects for select to authenticated
  using (bucket_id = 'acciones' and puede_ver_acciones());
drop policy if exists acciones_obj_ins on storage.objects;
create policy acciones_obj_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'acciones' and puede_ver_acciones());
drop policy if exists acciones_obj_del on storage.objects;
create policy acciones_obj_del on storage.objects for delete to authenticated
  using (bucket_id = 'acciones' and puede_ver_acciones());
