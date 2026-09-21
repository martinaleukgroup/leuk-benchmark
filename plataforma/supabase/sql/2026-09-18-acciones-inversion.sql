-- ============================================================================
--  ACCIONES — inversión desglosada por rubro (producto, material, espacio…).
--  Correr una vez en Supabase → SQL Editor, DESPUÉS de 2026-09-18-acciones.sql.
--  Idempotente. `inversion_estimada` / `inversion_real` siguen existiendo: el
--  front los guarda como la suma de los rubros (los usa el resumen de la lista).
-- ============================================================================
alter table acciones add column if not exists inversion_items jsonb not null default '[]'::jsonb;
  -- [{cat, det, est, real}]  cat = rubro, det = detalle libre
