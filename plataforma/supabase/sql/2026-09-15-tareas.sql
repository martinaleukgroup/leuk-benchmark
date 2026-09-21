-- ============================================================================
--  Módulo TAREAS — organización de tareas del equipo de marketing
--  Correr una sola vez en Supabase → SQL Editor (proyecto cswqoretlhppxkelysny)
--  Es idempotente: se puede volver a correr sin romper nada.
--
--  Quién entra NO sale del rol: sale de una marca aparte, `perfiles.marketing`,
--  que se tilda en el panel de Usuarios. Así alguien puede ser Líder o Diseño Y
--  del equipo de marketing, sin perder lo que ya ve. El admin entra siempre.
--
--  Dentro del equipo todos crean, asignan, mueven y comentan. Borrar una tarea:
--  quien la creó o un admin.
-- ============================================================================

-- ─── 0. La marca de pertenencia ─────────────────────────────────────────────
alter table perfiles add column if not exists marketing boolean not null default false;

-- Único lugar donde se traduce email → "es del equipo". Security definer para no
-- depender de la RLS de `perfiles` (que no deja leer las filas ajenas).
create or replace function puede_ver_tareas() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.marketing or p.rol = 'admin'
       from perfiles p
      where lower(p.email) = lower(auth.jwt() ->> 'email')
      limit 1), false);
$$;

-- A quién se le puede asignar una tarea. Sale por acá y no leyendo `perfiles`
-- directo, porque un miembro común no puede leer los perfiles de los demás.
create or replace function equipo_marketing()
returns table (email text, nombre text)
language sql stable security definer set search_path = public as $$
  select p.email, coalesce(nullif(p.nombre, ''), split_part(p.email, '@', 1))
    from perfiles p
   where p.marketing and puede_ver_tareas()
   order by 2;
$$;

-- ─── 1. Las tareas ──────────────────────────────────────────────────────────
create table if not exists tareas (
  id                 uuid primary key default gen_random_uuid(),
  titulo             text not null default '',
  descripcion        text not null default '',
  estado             text not null default 'pendiente',   -- pendiente | curso | revision | hecha
  prioridad          text not null default 'media',       -- alta | media | baja
  area               text not null default '',             -- Contenidos, Redes, Eventos… (texto libre)
  responsable_email  text,                                 -- null = sin asignar
  fecha_limite       date,
  checklist          jsonb not null default '[]'::jsonb,  -- [{t, ok}]
  orden              double precision not null default 0, -- posición dentro de su columna
  autor              text,
  autor_email        text,
  creado             timestamptz not null default now(),
  actualizado        timestamptz not null default now(),
  completada         timestamptz,                          -- cuándo pasó a 'hecha'
  hito               boolean not null default false         -- ★ tarea que es un hito
);
-- Para bases creadas antes de que existiera `hito`:
alter table tareas add column if not exists hito boolean not null default false;
create index if not exists tareas_estado_idx on tareas (estado, orden);
create index if not exists tareas_resp_idx   on tareas (responsable_email, fecha_limite);

-- ─── 2. Comentarios ─────────────────────────────────────────────────────────
create table if not exists tareas_comentarios (
  id           uuid primary key default gen_random_uuid(),
  tarea_id     uuid not null references tareas(id) on delete cascade,
  texto        text not null,
  autor        text,
  autor_email  text,
  creado       timestamptz not null default now()
);
create index if not exists tareas_com_idx on tareas_comentarios (tarea_id, creado);

-- ─── 3. `actualizado` y `completada` al día, sin depender del front ─────────
create or replace function tareas_touch() returns trigger
language plpgsql as $$
begin
  new.actualizado := now();
  if new.estado = 'hecha' and (tg_op = 'INSERT' or old.estado is distinct from 'hecha') then
    new.completada := now();
  elsif new.estado <> 'hecha' then
    new.completada := null;
  end if;
  return new;
end $$;

drop trigger if exists tareas_touch_t on tareas;
create trigger tareas_touch_t before insert or update on tareas
  for each row execute function tareas_touch();

-- ─── 4. Permisos ────────────────────────────────────────────────────────────
alter table tareas             enable row level security;
alter table tareas_comentarios enable row level security;

drop policy if exists ta_sel on tareas;
create policy ta_sel on tareas for select to authenticated using (puede_ver_tareas());
drop policy if exists ta_ins on tareas;
create policy ta_ins on tareas for insert to authenticated
  with check (puede_ver_tareas() and lower(autor_email) = lower(auth.jwt() ->> 'email'));
drop policy if exists ta_upd on tareas;
create policy ta_upd on tareas for update to authenticated
  using (puede_ver_tareas()) with check (puede_ver_tareas());
drop policy if exists ta_del on tareas;
create policy ta_del on tareas for delete to authenticated
  using (puede_ver_tareas() and (lower(autor_email) = lower(auth.jwt() ->> 'email') or rol_actual() = 'admin'));

drop policy if exists tc_sel on tareas_comentarios;
create policy tc_sel on tareas_comentarios for select to authenticated using (puede_ver_tareas());
drop policy if exists tc_ins on tareas_comentarios;
create policy tc_ins on tareas_comentarios for insert to authenticated
  with check (puede_ver_tareas() and lower(autor_email) = lower(auth.jwt() ->> 'email'));
drop policy if exists tc_del on tareas_comentarios;
create policy tc_del on tareas_comentarios for delete to authenticated
  using (lower(autor_email) = lower(auth.jwt() ->> 'email') or rol_actual() = 'admin');

-- ─── 5. Quién ya es del equipo ──────────────────────────────────────────────
-- Tildar desde el panel de Usuarios (columna "Marketing"). Si preferís hacerlo acá:
--   update perfiles set marketing = true where email in ('alguien@leukiluminacion.com.ar');
