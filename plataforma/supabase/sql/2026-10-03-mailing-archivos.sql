-- ============================================================================
--  MAILING — archivos del mail (oct 2026)
--  El mail de cada envío es un .html (o imágenes apiladas): se sube a un bucket PRIVADO
--  `mailing` y en la ficha (contenidos.meta) queda sólo la referencia. Se mira con la
--  sesión de quien está logueado, no hay links públicos. Límite 25 MB por archivo.
--  Ver: quienes ven Contenidos · Subir / reemplazar / quitar: quienes editan Contenidos.
--  Idempotente.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit)
     values ('mailing', 'mailing', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

drop policy if exists mailing_obj_sel on storage.objects;
create policy mailing_obj_sel on storage.objects for select to authenticated
  using (bucket_id = 'mailing' and puede_ver_contenidos());
drop policy if exists mailing_obj_ins on storage.objects;
create policy mailing_obj_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'mailing' and puede_editar_contenidos());
drop policy if exists mailing_obj_del on storage.objects;
create policy mailing_obj_del on storage.objects for delete to authenticated
  using (bucket_id = 'mailing' and puede_editar_contenidos());
