-- ============================================================================
--  Completa el circuito de ALTA sin service key (para que Diego Losz lo corra
--  entero con su cuenta). Complementa 2026-09-07-datos-sin-service-key.sql.
--  Sólo admin/lider/coordinacion (puede_integrar()). Idempotente.
--  Las policies son permisivas y con nombres nuevos: se SUMAN a las que ya
--  existan, no reemplazan ninguna.
-- ============================================================================

-- 1) Fotos de productos de competencia → bucket público 'catalogo-img'
drop policy if exists catimg_ins_integ on storage.objects;
create policy catimg_ins_integ on storage.objects
  for insert to authenticated
  with check (bucket_id = 'catalogo-img' and public.puede_integrar());

drop policy if exists catimg_upd_integ on storage.objects;
create policy catimg_upd_integ on storage.objects
  for update to authenticated
  using      (bucket_id = 'catalogo-img' and public.puede_integrar())
  with check (bucket_id = 'catalogo-img' and public.puede_integrar());

-- 2) Re-encolar un job de integración (estado → 'pendiente')
alter table integracion_jobs enable row level security;
drop policy if exists ij_upd_integ on integracion_jobs;
create policy ij_upd_integ on integracion_jobs
  for update to authenticated
  using (public.puede_integrar()) with check (public.puede_integrar());

-- 3) Borrar los productos de un job antes de re-encolarlo
drop policy if exists ce_del_integ on competencia_extra;
create policy ce_del_integ on competencia_extra
  for delete to authenticated
  using (public.puede_integrar());

-- Verificación: tienen que aparecer las 6 policies
select tablename, policyname, cmd
  from pg_policies
 where policyname in ('catimg_ins_integ','catimg_upd_integ','ij_upd_integ','ce_del_integ',
                      'datos_ins','datos_upd')
 order by tablename, policyname;
