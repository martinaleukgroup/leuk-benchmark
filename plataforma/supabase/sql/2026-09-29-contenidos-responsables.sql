-- ============================================================================
--  Responsables por canal de Contenidos + avisos que siguen el recorrido de la pieza
--
--  Cada canal (whatsapp, instagram…) tiene quién lo HACE y quién lo REVISA. Los avisos
--  de Contenidos dejan de ir a todos los que editan y van sólo a ellos:
--    · mandar a revisión            → a quien revisa
--    · pedir cambios / aprobar      → a quien hace
--    · comentario o sugerencia      → a la otra parte (si escribe un tercero, a las dos)
--    · sale hoy sin aprobar (9 hs)  → a las dos
--  Quiénes son NO está en este archivo (se publica): se cargan desde la plataforma
--  (Contenidos → Responsables, sólo admin) o con el SQL aparte de ~/.leuk_pricing.
--
--  Requiere 2026-09-29-notificaciones-push.sql (usa push_trigger). Idempotente.
-- ============================================================================

create table if not exists contenidos_responsables (
  canal   text not null,                               -- 'whatsapp' | 'instagram' | …
  email   text not null,
  nombre  text,                                        -- para mostrar "Hace: … · Revisa: …" sin leer perfiles ajenos
  papel   text not null check (papel in ('hace', 'revisa')),
  creado  timestamptz not null default now(),
  primary key (canal, email, papel)
);

alter table contenidos_responsables add column if not exists nombre text;

alter table contenidos_responsables enable row level security;
-- Lo ve cualquiera que entra a Contenidos (para saber a quién le toca); lo cambia sólo admin.
drop policy if exists cr_sel on contenidos_responsables;
create policy cr_sel on contenidos_responsables for select to authenticated using (puede_ver_contenidos());
drop policy if exists cr_ins on contenidos_responsables;
create policy cr_ins on contenidos_responsables for insert to authenticated with check (rol_actual() = 'admin');
drop policy if exists cr_del on contenidos_responsables;
create policy cr_del on contenidos_responsables for delete to authenticated using (rol_actual() = 'admin');

-- El estado de la pieza lo calcula un trigger BEFORE (contenidos_estado_derivado) a partir
-- de las placas y el copy, así que "update of estado" no alcanza: se mira si cambió de verdad.
drop trigger if exists push_contenidos on contenidos;
create trigger push_contenidos after update on contenidos
  for each row when (old.estado is distinct from new.estado)
  execute function push_trigger();
