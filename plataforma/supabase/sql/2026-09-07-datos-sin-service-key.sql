-- ============================================================================
--  Permite que admin/lider/coordinacion suban benchmark_data.json al bucket
--  'datos' logueados con su propia cuenta, sin necesitar la service_role key.
--  Correr una sola vez en Supabase → SQL Editor (proyecto cswqoretlhppxkelysny)
--  Es idempotente: se puede volver a correr sin romper nada.
-- ============================================================================

drop policy if exists datos_ins on storage.objects;
create policy datos_ins on storage.objects
  for insert to authenticated
  with check (bucket_id = 'datos' and puede_integrar());

drop policy if exists datos_upd on storage.objects;
create policy datos_upd on storage.objects
  for update to authenticated
  using (bucket_id = 'datos' and puede_integrar());

-- Listo. Verificá corriendo subir_datos.py logueado como un usuario admin/lider/
-- coordinacion (ya no hace falta ~/.leuk_pricing/supabase_service.txt para esto).
