-- ============================================================================
--  ACCIONES — los comentarios cuelgan de cada entrada de la línea de tiempo
--  (propuesta, contrapropuesta, reunión…), no de la acción entera.
--  Correr una vez en Supabase → SQL Editor. Idempotente.
--  Requiere 2026-09-21-acciones-comentarios.sql.
--
--  Si se borra la entrada, se borran sus comentarios. Los comentarios que ya
--  existían sin entrada (hito_id null) se siguen mostrando como "generales".
-- ============================================================================
alter table acciones_comentarios
  add column if not exists hito_id uuid references acciones_hitos(id) on delete cascade;
create index if not exists acciones_com_hito_idx on acciones_comentarios (hito_id, creado);
