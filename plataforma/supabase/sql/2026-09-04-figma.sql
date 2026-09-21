-- ============================================================================
--  FIGMA — caché de renders y bucket para los PNG congelados.
--  Correr una sola vez en Supabase → SQL Editor. Es idempotente.
--
--  Por qué hace falta cada cosa:
--    1. `figma_cache`: las URLs que devuelve la API de Figma VENCEN a los 30
--       días, y el rate limit del plan Starter se agota con ~30 imágenes por
--       minuto. Sin caché compartida, cada persona que abre el mes quema cuota.
--       Compartida en tabla y no en el navegador, justamente para eso.
--    2. Bucket `placas`: Figma renderiza SIEMPRE el estado actual del frame.
--       Sin congelar el PNG al aprobar, lo aprobado cambia solo cuando la
--       diseñadora sigue trabajando. El bucket es PRIVADO: se mira con URLs
--       firmadas que arma la Edge Function.
--
--  El token de Figma NO va acá ni en el front: va como secreto de la Edge
--  Function `figma-render` (Supabase → Edge Functions → Secrets → FIGMA_TOKEN).
-- ============================================================================

-- ─── 1. Caché de renders ────────────────────────────────────────────────────
create table if not exists figma_cache (
  file_key    text        not null,
  nodo        text        not null,
  url         text        not null,
  vence       timestamptz not null,
  actualizado timestamptz not null default now(),
  primary key (file_key, nodo)
);

comment on table  figma_cache      is 'URLs de render de Figma; vencen a los 30 días y se repiden solas';
comment on column figma_cache.nodo is 'node-id con dos puntos, como lo quiere la API: 1297:239';
comment on column figma_cache.url  is 'URL temporal de Figma (S3). No es permanente: para eso está el PNG congelado';

create index if not exists figma_cache_vence_idx on figma_cache (vence);

alter table figma_cache enable row level security;

-- Leer, cualquiera que vea el módulo. Escribir, sólo la Edge Function (usa la
-- service_role key, que se saltea RLS): por eso no hay política de insert.
drop policy if exists fc_sel on figma_cache;
create policy fc_sel on figma_cache for select to authenticated using (puede_ver_contenidos());

-- ─── 2. Bucket privado para los PNG congelados ──────────────────────────────
insert into storage.buckets (id, name, public)
     values ('placas', 'placas', false)
on conflict (id) do nothing;

-- Ver los archivos: quien vea el módulo. Subirlos: sólo la Edge Function.
drop policy if exists placas_sel on storage.objects;
create policy placas_sel on storage.objects for select to authenticated
  using (bucket_id = 'placas' and puede_ver_contenidos());

-- ─── 3. Control ─────────────────────────────────────────────────────────────
do $$
declare n int;
begin
  select count(*) into n from figma_cache;
  raise notice 'Listo. figma_cache con % filas; bucket "placas" creado (privado).', n;
  raise notice 'Falta cargar el secreto FIGMA_TOKEN en la Edge Function figma-render.';
end $$;
