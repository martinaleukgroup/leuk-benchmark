-- ============================================================================
--  VOTACIÓN INTERÁREA — packaging (trama + etiqueta)
--  Correr una sola vez en Supabase → SQL Editor. Es idempotente.
--
--  Un voto por persona y por categoría ('trama' | 'etiqueta'). Cambiar de
--  opinión mientras la votación está abierta ESTÁ permitido (upsert): se
--  reemplaza el voto anterior, no se acumulan votos.
--
--  Resultados ocultos mientras está abierta: sólo admin/líder ven todas las
--  filas (para decidir cuándo cerrar). El resto sólo ve SU PROPIO voto hasta
--  que se cierra — ahí se revela a todo el mundo.
-- ============================================================================

-- ─── Estado (abierta/cerrada) ───────────────────────────────────────────────
-- Fila única (id=1). abierta=true al crear la tabla: la votación arranca abierta.
create table if not exists votacion_packaging_estado (
  id         int primary key default 1 check (id = 1),
  abierta    boolean not null default true,
  cerrada_por text,
  cerrada_en timestamptz
);
insert into votacion_packaging_estado (id, abierta)
  values (1, true) on conflict (id) do nothing;

alter table votacion_packaging_estado enable row level security;

drop policy if exists vpe_sel on votacion_packaging_estado;
create policy vpe_sel on votacion_packaging_estado for select to authenticated
  using (true);

drop policy if exists vpe_upd on votacion_packaging_estado;
create policy vpe_upd on votacion_packaging_estado for update to authenticated
  using (rol_actual() in ('admin', 'lider'))
  with check (rol_actual() in ('admin', 'lider'));

-- ─── Votos ──────────────────────────────────────────────────────────────────
create table if not exists votacion_packaging (
  categoria   text not null check (categoria in ('trama', 'etiqueta')),
  opcion      int  not null check (opcion between 1 and 4),
  autor_email text not null,
  autor_nombre text,
  ts          timestamptz not null default now(),
  primary key (categoria, autor_email)
);

alter table votacion_packaging enable row level security;

-- Insertar/actualizar (upsert): sólo tu propio voto, y sólo mientras está abierta.
drop policy if exists vp_ins on votacion_packaging;
create policy vp_ins on votacion_packaging for insert to authenticated
  with check (
    lower(autor_email) = lower(auth.jwt() ->> 'email')
    and (select abierta from votacion_packaging_estado where id = 1)
  );

drop policy if exists vp_upd on votacion_packaging;
create policy vp_upd on votacion_packaging for update to authenticated
  using (lower(autor_email) = lower(auth.jwt() ->> 'email'))
  with check (
    lower(autor_email) = lower(auth.jwt() ->> 'email')
    and (select abierta from votacion_packaging_estado where id = 1)
  );

-- Leer: tu propio voto siempre; admin/líder ven todo siempre (para monitorear);
-- todo el mundo ve todo una vez que se cierra la votación.
drop policy if exists vp_sel on votacion_packaging;
create policy vp_sel on votacion_packaging for select to authenticated
  using (
    lower(autor_email) = lower(auth.jwt() ->> 'email')
    or rol_actual() in ('admin', 'lider')
    or not (select abierta from votacion_packaging_estado where id = 1)
  );
