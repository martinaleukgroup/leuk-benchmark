-- ═══════════════════════════════════════════════════════════════════════════
--  Contenidos · paso "Calendarizado" (oct 2026, pedido de la usuaria)
--  Sólo Instagram (Leuk y Laftdren): entre "Listo para publicar" y "Publicado"
--  va "Calendarizado" = la pieza ya quedó programada en la red, falta que salga.
--    aprobado → calendarizado → publicado
--  WhatsApp y Mailing siguen igual (aprobado → publicado).
--  Reemplaza las dos funciones de 2026-09-29-contenidos-flujo.sql. Se puede
--  correr más de una vez.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. El estado derivado respeta "calendarizado" igual que "publicado" ─────
create or replace function contenidos_estado_derivado() returns trigger
language plpgsql as $$
declare estados text[];
begin
  if jsonb_array_length(coalesce(new.placas, '[]'::jsonb)) = 0 then
    return new;
  end if;

  select array_agg(coalesce(p->>'estado', 'borrador'))
    into estados
    from jsonb_array_elements(new.placas) p;

  estados := estados || coalesce(new.copy_estado, 'borrador');

  new.estado := case
    when 'cambios'  = any(estados) then 'cambios'
    when 'revision' = any(estados) then 'revision'
    when 'borrador' = any(estados) then 'borrador'
    when new.estado in ('publicado', 'calendarizado') then new.estado
    else 'aprobado'
  end;
  return new;
end $$;

-- ─── 2. Pasar una pieza al paso siguiente ───────────────────────────────────
create or replace function contenidos_pasar(p_id uuid, p_a text) returns text
language plpgsql security definer set search_path = public as $$
declare
  m contenidos%rowtype;
  hay_revisor boolean;
  hay_hacedor boolean;
  puede boolean;
  pl jsonb;
  es_ig boolean;
begin
  select * into m from contenidos where id = p_id for update;
  if not found then raise exception 'La pieza no existe'; end if;
  if not puede_ver_contenidos() then raise exception 'No tenés acceso a Contenidos'; end if;
  select exists (select 1 from contenidos_responsables where canal = m.canal and papel = 'revisa') into hay_revisor;
  select exists (select 1 from contenidos_responsables where canal = m.canal and papel = 'hace')   into hay_hacedor;
  es_ig := m.canal in ('instagram', 'instagram_laftdren');

  if p_a in ('cambios', 'aprobado') then
    puede := es_responsable(m.canal, 'revisa') or rol_actual() = 'admin'
             or (not hay_revisor and puede_editar_contenidos());
    if m.estado <> 'revision' then raise exception 'La pieza no está esperando feedback'; end if;
    if p_a = 'aprobado' and exists (select 1 from contenidos_comentarios
                                     where contenido_id = p_id and tipo = 'sugerencia' and decision is null) then
      raise exception 'Quedan sugerencias sin resolver: aceptalas o descartalas antes';
    end if;
  elsif p_a in ('revision', 'calendarizado', 'publicado', 'borrador') then
    puede := es_responsable(m.canal, 'hace') or rol_actual() = 'admin'
             or (not hay_hacedor and puede_editar_contenidos());
    if p_a = 'revision' and m.estado not in ('borrador', 'cambios') then raise exception 'La pieza ya pidió feedback'; end if;
    if p_a = 'calendarizado' then
      if not es_ig then raise exception 'Calendarizado es sólo para Instagram'; end if;
      if m.estado <> 'aprobado' then raise exception 'Sólo se calendariza una pieza lista para publicar'; end if;
    end if;
    if p_a = 'publicado' then
      -- En Instagram hay que calendarizarla antes; en el resto, sale de "listo".
      if es_ig and m.estado <> 'calendarizado' then raise exception 'Primero marcala como calendarizada'; end if;
      if not es_ig and m.estado <> 'aprobado' then raise exception 'Sólo se publica una pieza lista para publicar'; end if;
    end if;
  else
    raise exception 'Paso desconocido: %', p_a;
  end if;
  if not puede then raise exception 'Este paso no te corresponde en este canal'; end if;

  -- Placas: todas al mismo estado. Al volver a trabajarla se descongela la imagen
  -- (la diseñadora la va a cambiar); al quedar lista, la app la vuelve a congelar.
  pl := coalesce(m.placas, '[]'::jsonb);
  if jsonb_array_length(pl) > 0 then
    select coalesce(jsonb_agg(case
             when p_a in ('aprobado', 'calendarizado', 'publicado') then p || '{"estado":"aprobado"}'::jsonb
             when p_a = 'cambios' then p || '{"estado":"revision"}'::jsonb
             else p || jsonb_build_object('estado', p_a, 'png', '', 'png_ts', null)
           end), '[]'::jsonb)
      into pl
      from jsonb_array_elements(m.placas) p;
  end if;

  update contenidos
     set placas = pl,
         copy_estado = case when p_a in ('calendarizado', 'publicado') then 'aprobado' else p_a end,
         estado = p_a
   where id = p_id;
  return p_a;
end $$;

grant execute on function contenidos_pasar(uuid, text) to authenticated;
