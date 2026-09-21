-- ============================================================================
--  CANALES — el cronograma deja de ser "el de WhatsApp" y pasa a tener canal.
--  Correr una sola vez en Supabase → SQL Editor. Es idempotente: se puede
--  volver a correr sin romper nada ni duplicar datos.
--
--  Qué hace, en orden:
--    1. Suma `canal` a contenidos_meses y contenidos ('whatsapp' por defecto,
--       así todo lo que ya está cargado queda donde estaba).
--    2. Cambia la PK de contenidos_meses de (mes) a (mes, canal) y rehace la
--       FK de contenidos como compuesta. Septiembre puede existir dos veces:
--       una para WhatsApp y otra para Instagram, sin pisarse.
--    3. Suma lo que Instagram necesita y WhatsApp ignora: `tipo` (post /
--       carrusel / reel), `placas` (los frames de Figma, cada uno con SU
--       estado) y `copy_estado`.
--    4. Deriva `estado` de las placas + el copy con un trigger. La pieza NO
--       tiene estado propio: se lee de sus partes, como los pendientes del
--       mes. Así el chip nunca puede decir una cosa y las placas otra.
--
--  Nada de esto cambia los permisos: siguen valiendo puede_ver_contenidos() y
--  puede_editar_contenidos() de 2026-08-31-contenidos.sql.
-- ============================================================================

-- ─── 1. La columna canal ────────────────────────────────────────────────────
alter table contenidos_meses add column if not exists canal text not null default 'whatsapp';
alter table contenidos       add column if not exists canal text not null default 'whatsapp';

comment on column contenidos_meses.canal is 'whatsapp | instagram | linkedin — un mes por canal';
comment on column contenidos.canal       is 'igual al canal del mes al que pertenece (FK compuesta)';

-- ─── 2. PK (mes, canal) y FK compuesta ──────────────────────────────────────
-- Se hace en un DO porque hay que soltar la FK ANTES de tocar la PK, y los
-- nombres de constraint los puso Postgres solo: se buscan, no se adivinan.
do $$
declare fk record; pk_name text; pk_cols int;
begin
  -- 2.a — soltar cualquier FK de contenidos que apunte a contenidos_meses
  for fk in
    select con.conname
      from pg_constraint con
     where con.conrelid  = 'contenidos'::regclass
       and con.contype   = 'f'
       and con.confrelid = 'contenidos_meses'::regclass
  loop
    execute format('alter table contenidos drop constraint %I', fk.conname);
    raise notice 'FK vieja soltada: %', fk.conname;
  end loop;

  -- 2.b — si la PK todavía es de una sola columna, rehacerla como (mes, canal)
  select con.conname, array_length(con.conkey, 1)
    into pk_name, pk_cols
    from pg_constraint con
   where con.conrelid = 'contenidos_meses'::regclass and con.contype = 'p';

  if pk_cols = 1 then
    execute format('alter table contenidos_meses drop constraint %I', pk_name);
    alter table contenidos_meses add primary key (mes, canal);
    raise notice 'PK de contenidos_meses ahora es (mes, canal).';
  else
    raise notice 'La PK de contenidos_meses ya era compuesta: no se toca.';
  end if;

  -- 2.c — FK compuesta
  if not exists (select 1 from pg_constraint where conname = 'contenidos_mes_canal_fkey') then
    alter table contenidos
      add constraint contenidos_mes_canal_fkey
      foreign key (mes, canal) references contenidos_meses (mes, canal) on delete cascade;
    raise notice 'FK compuesta (mes, canal) creada.';
  end if;
end $$;

-- El índice de lectura ahora arranca por canal: siempre se mira un canal a la vez.
drop index if exists contenidos_mes_idx;
create index if not exists contenidos_canal_idx on contenidos (canal, mes, fecha, orden);

-- ─── 3. Lo que Instagram necesita ───────────────────────────────────────────
-- `placas` es el carrusel: un objeto por frame de Figma, con su propio estado.
--   [{ "nodo": "131:56", "pie": "El pasillo terminado", "estado": "aprobado",
--      "png": "<url del PNG congelado al aprobar>", "png_ts": "2026-09-03T…" }]
-- Un post o un reel tienen UNA placa. WhatsApp no tiene ninguna y sigue igual.
alter table contenidos
  add column if not exists tipo        text  not null default 'post',
  add column if not exists placas      jsonb not null default '[]'::jsonb,
  add column if not exists copy_estado text  not null default 'borrador',
  add column if not exists figma_file  text;

comment on column contenidos.tipo        is 'post | carrusel | reel — decide qué se muestra en la grilla';
comment on column contenidos.placas      is 'frames de Figma del carrusel; cada uno con su estado y su PNG congelado';
comment on column contenidos.copy_estado is 'el copy se aprueba aparte de las imágenes: es un ítem más';
comment on column contenidos.figma_file  is 'file_key del archivo de Figma; los node_id viven en cada placa';

-- El índice de placa reusa la columna que ya existía para las variantes de WhatsApp.
comment on column contenidos_comentarios.variante is
  'WhatsApp: índice de variante. Instagram: número de placa (1..n). null = la pieza entera.';

-- ─── 4. `estado` derivado de las partes ─────────────────────────────────────
-- Sin placas (WhatsApp) el estado se escribe a mano, como siempre.
-- Con placas, se calcula y se pisa: una sola fuente de verdad.
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
    else 'aprobado'
  end;
  return new;
end $$;

drop trigger if exists contenidos_estado_t on contenidos;
create trigger contenidos_estado_t before insert or update on contenidos
  for each row execute function contenidos_estado_derivado();

-- ─── 5. Control ─────────────────────────────────────────────────────────────
do $$
declare n_wa int; n_ig int;
begin
  select count(*) into n_wa from contenidos where canal = 'whatsapp';
  select count(*) into n_ig from contenidos where canal = 'instagram';
  raise notice 'Listo. Piezas por canal → whatsapp: %, instagram: %.', n_wa, n_ig;
  raise notice 'Todo lo que ya estaba cargado quedó en whatsapp. Nada se movió.';
end $$;
