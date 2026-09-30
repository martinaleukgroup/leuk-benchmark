-- ============================================================================
--  Flujo de Contenidos por PIEZA, con papel de cada responsable
--
--    Borrador → Precisa feedback → Con ajustes ↺ / Listo para publicar → Publicado
--    (en la base: borrador → revision → cambios / aprobado → publicado)
--
--  · quien HACE el canal pide feedback, marca publicado o vuelve a borrador
--  · quien REVISA decide: con ajustes o listo para publicar (aunque su rol sea
--    representante: por eso los pasos van por una función y no por la política de update)
--  · admin puede todo; si un canal no tiene a nadie en un papel, ese paso lo puede
--    dar cualquiera que edite
--
--  Las placas dejan de aprobarse de a una: la decisión es de la pieza entera y la función
--  pone todas las placas y el copy en el estado que corresponde (el trigger deriva el
--  estado de ahí). Los comentarios por placa siguen existiendo para el detalle.
--
--  Requiere 2026-09-29-contenidos-responsables.sql. Idempotente.
-- ============================================================================

-- ─── 1. El estado derivado ahora respeta "publicado" ────────────────────────
-- Antes, con placas, todo aprobado daba siempre 'aprobado': no había forma de publicar.
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
    when new.estado = 'publicado'  then 'publicado'
    else 'aprobado'
  end;
  return new;
end $$;

-- ─── 2. ¿Soy responsable de este canal con este papel? ───────────────────────
create or replace function es_responsable(p_canal text, p_papel text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from contenidos_responsables
                  where canal = p_canal and papel = p_papel
                    and lower(email) = lower(auth.jwt() ->> 'email'));
$$;

-- ─── 3. Pasar una pieza al paso siguiente ───────────────────────────────────
create or replace function contenidos_pasar(p_id uuid, p_a text) returns text
language plpgsql security definer set search_path = public as $$
declare
  m contenidos%rowtype;
  hay_revisor boolean;
  hay_hacedor boolean;
  puede boolean;
  pl jsonb;
begin
  select * into m from contenidos where id = p_id for update;
  if not found then raise exception 'La pieza no existe'; end if;
  if not puede_ver_contenidos() then raise exception 'No tenés acceso a Contenidos'; end if;
  select exists (select 1 from contenidos_responsables where canal = m.canal and papel = 'revisa') into hay_revisor;
  select exists (select 1 from contenidos_responsables where canal = m.canal and papel = 'hace')   into hay_hacedor;

  if p_a in ('cambios', 'aprobado') then
    puede := es_responsable(m.canal, 'revisa') or rol_actual() = 'admin'
             or (not hay_revisor and puede_editar_contenidos());
    if m.estado <> 'revision' then raise exception 'La pieza no está esperando feedback'; end if;
    if p_a = 'aprobado' and exists (select 1 from contenidos_comentarios
                                     where contenido_id = p_id and tipo = 'sugerencia' and decision is null) then
      raise exception 'Quedan sugerencias sin resolver: aceptalas o descartalas antes';
    end if;
  elsif p_a in ('revision', 'publicado', 'borrador') then
    puede := es_responsable(m.canal, 'hace') or rol_actual() = 'admin'
             or (not hay_hacedor and puede_editar_contenidos());
    if p_a = 'revision'  and m.estado not in ('borrador', 'cambios') then raise exception 'La pieza ya pidió feedback'; end if;
    if p_a = 'publicado' and m.estado <> 'aprobado' then raise exception 'Sólo se publica una pieza lista para publicar'; end if;
  else
    raise exception 'Paso desconocido: %', p_a;
  end if;
  if not puede then raise exception 'Este paso no te corresponde en este canal'; end if;

  -- Placas: todas al mismo estado. Al volver a trabajarla se descongela la imagen
  -- (la diseñadora la va a cambiar); al quedar lista, la app la vuelve a congelar.
  pl := coalesce(m.placas, '[]'::jsonb);
  if jsonb_array_length(pl) > 0 then
    select coalesce(jsonb_agg(case
             when p_a in ('aprobado', 'publicado') then p || '{"estado":"aprobado"}'::jsonb
             when p_a = 'cambios' then p || '{"estado":"revision"}'::jsonb
             else p || jsonb_build_object('estado', p_a, 'png', '', 'png_ts', null)
           end), '[]'::jsonb)
      into pl
      from jsonb_array_elements(m.placas) p;
  end if;

  update contenidos
     set placas = pl,
         copy_estado = case when p_a = 'publicado' then 'aprobado' else p_a end,
         estado = p_a
   where id = p_id;
  return p_a;
end $$;

grant execute on function contenidos_pasar(uuid, text) to authenticated;
grant execute on function es_responsable(text, text) to authenticated;
