-- ============================================================================
--  Módulo CONTENIDOS — cronograma de la comunidad profesional de WhatsApp
--  Correr una sola vez en Supabase → SQL Editor (proyecto cswqoretlhppxkelysny)
--  Es idempotente: se puede volver a correr sin romper nada.
--
--  Quién hace qué (se define acá y se replica en ROLES de app.js):
--    admin · líder · coordinación → crean, editan, comentan y APRUEBAN
--    representante de marca       → lee y COMENTA. No toca el copy ni aprueba.
--    el resto de los roles        → no ven el módulo.
-- ============================================================================

-- ─── 0. Helpers de rol ──────────────────────────────────────────────────────
-- El rol vive en `perfiles`; el JWT sólo trae el email. Estas funciones son el
-- único lugar donde se traduce email → rol, así una política nunca lo repite.
create or replace function rol_actual() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case p.rol
              when 'editor' then 'lider'      -- alias viejos (ver ROL_ALIAS en app.js)
              when 'lector' then 'comercial'
              when 'fichas' then 'diseno'
              else p.rol end
       from perfiles p
      where lower(p.email) = lower(auth.jwt() ->> 'email')
      limit 1), '');
$$;

create or replace function puede_editar_contenidos() returns boolean
language sql stable as $$ select rol_actual() in ('admin','lider','coordinacion'); $$;

-- Quién entra al módulo: los que editan + el representante de marca.
create or replace function puede_ver_contenidos() returns boolean
language sql stable as $$ select rol_actual() in ('admin','lider','coordinacion','representante'); $$;

-- ─── 1. El mes: brief, obras asignadas y pendientes ─────────────────────────
create table if not exists contenidos_meses (
  mes          text primary key,                 -- '2026-09'
  titulo       text not null default '',          -- 'Leuk en obra'
  eyebrow      text default '',                   -- 'Comunidad profesional de WhatsApp · Septiembre 2026'
  dek          text default '',                   -- bajada del mes
  brief        jsonb not null default '[]'::jsonb,-- [{h,p}]  → Objetivo / Recursos / Cadencia
  obras        jsonb not null default '[]'::jsonb,-- [{tipologia,obra,productos}]
  pendientes   jsonb not null default '[]'::jsonb,-- ["Falta la fecha de Luz en Acción", ...]
  estado       text not null default 'abierto',   -- abierto | cerrado
  autor        text,
  autor_email  text,
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);

-- ─── 2. Los mensajes del mes ────────────────────────────────────────────────
create table if not exists contenidos (
  id           uuid primary key default gen_random_uuid(),
  mes          text not null references contenidos_meses(mes) on delete cascade,
  fecha        date not null,
  criterio     text default '',                   -- 'Encuesta principal', 'Caso real + análisis'…
  objetivo     text default '',
  flag         text default '',                   -- aviso corto en la barra ('Falta la fecha')
  copy         text default '',                   -- el mensaje tal cual va a WhatsApp
  meta         jsonb not null default '{}'::jsonb,-- {imagen, link, cta, notas}
  encuesta     jsonb,                             -- {q, hint, opciones:[]} | null
  lead         text default '',                   -- texto que introduce las variantes
  variantes    jsonb not null default '[]'::jsonb,-- [{titulo, copy, meta:{...}}]
  estado       text not null default 'borrador',  -- borrador | revision | cambios | aprobado
  orden        int  not null default 0,
  autor        text,
  autor_email  text,
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);
create index if not exists contenidos_mes_idx on contenidos (mes, fecha, orden);

-- ─── 3. Comentarios y sugerencias ───────────────────────────────────────────
create table if not exists contenidos_comentarios (
  id            uuid primary key default gen_random_uuid(),
  contenido_id  uuid not null references contenidos(id) on delete cascade,
  variante      int,                              -- índice de variante, o null = el mensaje
  texto         text not null,
  autor         text,
  autor_email   text,
  resuelto      boolean not null default false,
  creado        timestamptz not null default now()
);
create index if not exists contenidos_com_idx on contenidos_comentarios (contenido_id, creado);

-- ─── 4. `actualizado` al día, sin depender del front ────────────────────────
create or replace function contenidos_touch() returns trigger
language plpgsql as $$ begin new.actualizado := now(); return new; end $$;

drop trigger if exists contenidos_touch_t on contenidos;
create trigger contenidos_touch_t before update on contenidos
  for each row execute function contenidos_touch();

drop trigger if exists contenidos_meses_touch_t on contenidos_meses;
create trigger contenidos_meses_touch_t before update on contenidos_meses
  for each row execute function contenidos_touch();

-- ─── 5. Permisos ────────────────────────────────────────────────────────────
alter table contenidos_meses        enable row level security;
alter table contenidos              enable row level security;
alter table contenidos_comentarios  enable row level security;

-- Meses y mensajes: los ve quien tiene el módulo; los escribe sólo quien edita.
drop policy if exists cm_sel on contenidos_meses;
create policy cm_sel on contenidos_meses for select to authenticated using (puede_ver_contenidos());
drop policy if exists cm_ins on contenidos_meses;
create policy cm_ins on contenidos_meses for insert to authenticated with check (puede_editar_contenidos());
drop policy if exists cm_upd on contenidos_meses;
create policy cm_upd on contenidos_meses for update to authenticated using (puede_editar_contenidos());
drop policy if exists cm_del on contenidos_meses;
create policy cm_del on contenidos_meses for delete to authenticated using (rol_actual() = 'admin');

drop policy if exists co_sel on contenidos;
create policy co_sel on contenidos for select to authenticated using (puede_ver_contenidos());
drop policy if exists co_ins on contenidos;
create policy co_ins on contenidos for insert to authenticated with check (puede_editar_contenidos());
drop policy if exists co_upd on contenidos;
create policy co_upd on contenidos for update to authenticated using (puede_editar_contenidos());
drop policy if exists co_del on contenidos;
create policy co_del on contenidos for delete to authenticated using (puede_editar_contenidos());

-- Comentarios: comenta cualquiera que vea el módulo (incluye representante de marca).
-- Cada uno edita/borra lo suyo; el admin, cualquiera.
drop policy if exists cc_sel on contenidos_comentarios;
create policy cc_sel on contenidos_comentarios for select to authenticated using (puede_ver_contenidos());
drop policy if exists cc_ins on contenidos_comentarios;
create policy cc_ins on contenidos_comentarios for insert to authenticated
  with check (puede_ver_contenidos() and lower(autor_email) = lower(auth.jwt() ->> 'email'));
drop policy if exists cc_upd on contenidos_comentarios;
create policy cc_upd on contenidos_comentarios for update to authenticated
  using (lower(autor_email) = lower(auth.jwt() ->> 'email') or puede_editar_contenidos());
drop policy if exists cc_del on contenidos_comentarios;
create policy cc_del on contenidos_comentarios for delete to authenticated
  using (lower(autor_email) = lower(auth.jwt() ->> 'email') or rol_actual() = 'admin');

-- ─── 6. Aviso: el rol nuevo tiene que ser aceptado por `perfiles` ───────────
-- Si la columna `perfiles.rol` tiene un CHECK con la lista de roles, hay que
-- sumarle 'representante' o el panel de Usuarios va a rechazar ese rol.
-- Este bloque no cambia nada: sólo avisa en la consola del SQL Editor.
do $$
declare c record; hay boolean := false;
begin
  for c in
    select con.conname, pg_get_constraintdef(con.oid) as def
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
     where rel.relname = 'perfiles' and con.contype = 'c'
  loop
    hay := true;
    if position('representante' in c.def) = 0 then
      raise warning 'El constraint % de perfiles NO acepta ''representante''. Corregilo con: alter table perfiles drop constraint %I, agregando el rol a la lista: %', c.conname, c.conname, c.def;
    else
      raise notice 'OK: % ya acepta ''representante''.', c.conname;
    end if;
  end loop;
  if not hay then raise notice 'OK: perfiles.rol no tiene CHECK, acepta ''representante'' sin cambios.'; end if;
end $$;
