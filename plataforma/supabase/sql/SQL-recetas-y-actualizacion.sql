-- ============================================================================
--  Recetas de competidores + actualización de listas de precios
--  Correr una sola vez en Supabase → SQL Editor (proyecto cswqoretlhppxkelysny)
--  Es idempotente: se puede volver a correr sin romper nada.
-- ============================================================================

-- ─── 1. Código de producto en competencia_extra ─────────────────────────────
-- Es la clave con la que se cruza una lista contra la siguiente. Sin esto no se
-- puede saber si un producto de la lista nueva ya existía o es nuevo.
alter table competencia_extra add column if not exists codigo text;
create index if not exists ce_marca_codigo_idx on competencia_extra (marca, codigo);

-- ─── 2. La receta: cómo se carga cada marca ─────────────────────────────────
create table if not exists competencia_recetas (
  slug         text primary key,
  marca        text not null,
  estado       text not null default 'activa',   -- activa | parcial | baja
  receta       jsonb not null default '{}'::jsonb,
  notas_md     text,
  autor        text,
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);

alter table competencia_recetas enable row level security;

drop policy if exists cr_sel on competencia_recetas;
create policy cr_sel on competencia_recetas
  for select to authenticated using (true);

drop policy if exists cr_ins on competencia_recetas;
create policy cr_ins on competencia_recetas
  for insert to authenticated with check (puede_integrar());

drop policy if exists cr_upd on competencia_recetas;
create policy cr_upd on competencia_recetas
  for update to authenticated using (puede_integrar());

-- ─── 3. Historial: qué lista se cargó y cuándo ──────────────────────────────
create table if not exists competencia_listas (
  id       uuid primary key default gen_random_uuid(),
  slug     text,
  marca    text not null,
  job_id   uuid,
  archivo  text,
  tipo     text not null default 'alta',         -- alta | actualizacion
  autor    text,
  cargada  timestamptz not null default now(),
  resumen  jsonb        -- {productos, nuevos, precio_subio, precio_bajo, sin_cambio, faltantes}
);
create index if not exists cl_marca_idx on competencia_listas (marca, cargada desc);

alter table competencia_listas enable row level security;

drop policy if exists cl_sel on competencia_listas;
create policy cl_sel on competencia_listas
  for select to authenticated using (true);

drop policy if exists cl_ins on competencia_listas;
create policy cl_ins on competencia_listas
  for insert to authenticated with check (puede_integrar());

-- ─── 4. Histórico de precios (evolución en el tiempo) ───────────────────────
create table if not exists competencia_precios_hist (
  id        uuid primary key default gen_random_uuid(),
  lista_id  uuid references competencia_listas(id) on delete cascade,
  marca     text not null,
  codigo    text,
  nombre    text,
  precio    numeric,
  moneda    text,
  fecha     date not null default current_date
);
create index if not exists cph_idx on competencia_precios_hist (marca, codigo, fecha desc);

alter table competencia_precios_hist enable row level security;

drop policy if exists cph_sel on competencia_precios_hist;
create policy cph_sel on competencia_precios_hist
  for select to authenticated using (true);

-- ─── 5. Tipo de job: alta o actualización ───────────────────────────────────
-- La app sólo va a poder crear jobs de tipo 'actualizacion' (el alta pasa por
-- la skill). El worker aplica la receta cuando el tipo es 'actualizacion'.
alter table integracion_jobs add column if not exists tipo text not null default 'alta';
alter table integracion_jobs add column if not exists slug text;

-- ─── 6. Marcar discontinuados ───────────────────────────────────────────────
-- Un producto que dejó de aparecer en la lista queda señalado, no se borra:
-- puede volver, y su histórico de precios sigue siendo válido.
alter table competencia_extra add column if not exists baja_detectada date;

-- Listo. Verificá que aparezcan las 3 tablas nuevas en Table Editor.
