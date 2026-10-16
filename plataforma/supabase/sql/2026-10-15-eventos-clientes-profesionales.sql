-- ============================================================================
--  EVENTOS CON CLIENTES — profesionales del evento.
--  El evento se hace JUNTO a un distribuidor (nuestro cliente) y los invitados
--  son profesionales (clientes del distribuidor). De los profesionales se
--  cargan sólo los números: inscriptos y asistentes. Los distribuidores del
--  evento siguen en eventos_clientes_inv (cuit).
--  Correr una vez en Supabase → SQL Editor, DESPUÉS de 2026-10-15-eventos-clientes.sql.
--  Idempotente.
-- ============================================================================
alter table eventos_clientes add column if not exists prof_inscriptos int;
alter table eventos_clientes add column if not exists prof_asistentes int;
