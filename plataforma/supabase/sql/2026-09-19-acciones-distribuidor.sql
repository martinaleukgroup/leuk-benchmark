-- ============================================================================
--  ACCIONES — con qué distribuidor participamos (si participa alguno).
--  Correr una vez en Supabase → SQL Editor. Idempotente.
-- ============================================================================
alter table acciones add column if not exists distribuidor text not null default '';
