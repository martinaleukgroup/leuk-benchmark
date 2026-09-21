-- ============================================================================
--  Diseño entra a CONTENIDOS con permiso de edición
--  Correr una sola vez en Supabase → SQL Editor (proyecto cswqoretlhppxkelysny)
--  Es idempotente.
--
--  Antes: puede_editar_contenidos() = admin/líder/coordinación.
--  Ahora: se suma 'diseno' (mismo nivel que coordinación — edita, mueve
--  fechas, comenta y aprueba/publica). Replica el cambio de ROLES.diseno.mods
--  en app.js (ahora incluye "contenidos").
-- ============================================================================

create or replace function puede_editar_contenidos() returns boolean
language sql stable as $$ select rol_actual() in ('admin','lider','coordinacion','diseno'); $$;

create or replace function puede_ver_contenidos() returns boolean
language sql stable as $$ select rol_actual() in ('admin','lider','coordinacion','diseno','representante'); $$;
