-- ============================================================================
--  INSTAGRAM LAFTDREN — segundo perfil de Instagram, canal 'instagram_laftdren'
--
--  Vive en la misma página que Instagram Leuk (selector Leuk | Laftdren), pero es un canal
--  aparte: sus meses, piezas, KPIs, responsables y avisos no se mezclan con los de Leuk.
--  No hay tablas nuevas (canal es texto libre). Este SQL sólo:
--    1. copia la config de KPIs de Instagram Leuk (mismos datos y fórmulas, otro nombre);
--    2. copia a los responsables de Instagram Leuk (hace / revisa).
--  Se puede correr más de una vez. Después se ajusta todo desde la app
--  (Administración → KPIs por canal; 👥 Responsables del canal).
-- ============================================================================

insert into resultados_config (canal, config)
select 'instagram_laftdren',
       jsonb_set(jsonb_set(config, '{nombre}', '"Instagram Laftdren"'),
                 '{objetivo}', '"Fortalecer el posicionamiento y la consideración de Laftdren."')
  from resultados_config where canal = 'instagram'
on conflict (canal) do nothing;

insert into contenidos_responsables (canal, email, papel, nombre)
select 'instagram_laftdren', email, papel, nombre
  from contenidos_responsables where canal = 'instagram'
on conflict do nothing;

select canal, papel, count(*) from contenidos_responsables where canal like 'instagram%' group by 1, 2 order by 1, 2;
