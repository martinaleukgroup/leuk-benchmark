-- ============================================================================
--  EVENTOS CON CLIENTES — qué distribuidores fueron a cada evento y cuánto
--  compraron (en USD) antes y después. Sección de Acciones.
--  Correr una sola vez en Supabase → SQL Editor, DESPUÉS de 2026-09-18-acciones.sql
--  (usa puede_ver_acciones()). Es idempotente: se puede volver a correr.
--
--  Quién entra: los mismos que Acciones (Admin y Líder). Las VENTAS viven sólo
--  acá, protegidas por RLS: nunca en un archivo del repo (que es público).
--
--  Tablas:
--    · ventas_clientes        un cliente por CUIT (razón social, nombre, vendedor)
--    · ventas_diarias         compras netas en USD por cliente y día (las notas de
--                             crédito restan), con el desglose por familia
--    · ventas_importaciones   historial de cada CSV subido
--    · eventos_clientes       el evento (fecha, formato, acción vinculada, inversión)
--    · eventos_clientes_inv   los clientes del evento: inscripto, asistió, personas
-- ============================================================================

-- ─── 1. Ventas ──────────────────────────────────────────────────────────────
create table if not exists ventas_clientes (
  cuit          text primary key,
  razon_social  text not null default '',
  nombre        text not null default '',     -- nombre de fantasía (columna "Empresa" del reporte)
  vendedor      text not null default '',     -- el de su última compra
  primera_compra date,
  ultima_compra  date,
  actualizado   timestamptz not null default now()
);

create table if not exists ventas_diarias (
  cuit      text not null,
  fecha     date not null,
  usd       numeric not null default 0,       -- neto USD (facturas + débitos − notas de crédito)
  facturas  int not null default 0,           -- comprobantes de venta (sin notas de crédito)
  tc        numeric,                          -- tipo de cambio promedio de ese día
  familias  jsonb not null default '{}'::jsonb, -- {familia: usd}
  primary key (cuit, fecha)
);
create index if not exists ventas_diarias_fecha_idx on ventas_diarias (fecha);

create table if not exists ventas_importaciones (
  id          uuid primary key default gen_random_uuid(),
  archivo     text not null default '',
  desde       date,
  hasta       date,
  filas       int,
  clientes    int,
  autor_email text,
  creado      timestamptz not null default now()
);

-- Importar en tandas. La primera (p_borrar = true) borra el rango que cubre el
-- archivo, así reimportar el mismo período no duplica. Los clientes se actualizan.
create or replace function ventas_importar(p_desde date, p_hasta date, p_borrar boolean,
                                           p_dias jsonb, p_clientes jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not puede_ver_acciones() then raise exception 'Sin permiso'; end if;
  if p_borrar then
    delete from ventas_diarias where fecha between p_desde and p_hasta;
  end if;
  insert into ventas_diarias (cuit, fecha, usd, facturas, tc, familias)
  select d.cuit, d.fecha, d.usd, d.facturas, d.tc, coalesce(d.familias, '{}'::jsonb)
    from jsonb_to_recordset(coalesce(p_dias, '[]'::jsonb))
         as d(cuit text, fecha date, usd numeric, facturas int, tc numeric, familias jsonb)
  on conflict (cuit, fecha) do update
     set usd = excluded.usd, facturas = excluded.facturas, tc = excluded.tc, familias = excluded.familias;
  get diagnostics n = row_count;

  insert into ventas_clientes as v (cuit, razon_social, nombre, vendedor, primera_compra, ultima_compra, actualizado)
  select c.cuit, coalesce(c.razon_social, ''), coalesce(c.nombre, ''), coalesce(c.vendedor, ''),
         c.primera_compra, c.ultima_compra, now()
    from jsonb_to_recordset(coalesce(p_clientes, '[]'::jsonb))
         as c(cuit text, razon_social text, nombre text, vendedor text, primera_compra date, ultima_compra date)
  on conflict (cuit) do update
     set razon_social   = excluded.razon_social,
         nombre         = excluded.nombre,
         vendedor       = case when excluded.ultima_compra >= coalesce(v.ultima_compra, excluded.ultima_compra)
                               then excluded.vendedor else v.vendedor end,
         primera_compra = least(v.primera_compra, excluded.primera_compra),
         ultima_compra  = greatest(v.ultima_compra, excluded.ultima_compra),
         actualizado    = now();
  return n;
end $$;

-- Resto de los clientes en un período (todos menos los del evento): es la base
-- contra la que se compara si el evento movió algo o subió todo el mercado.
create or replace function ventas_base(p_desde date, p_hasta date, p_excluir text[])
returns table (usd numeric, clientes int)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(t.usd), 0), count(*) filter (where t.usd > 0)::int
    from (select cuit, sum(usd) usd from ventas_diarias
           where fecha between p_desde and p_hasta
             and not (cuit = any(coalesce(p_excluir, '{}')))
           group by cuit) t
   where puede_ver_acciones();
$$;

-- Hasta qué fecha hay datos (sin traer las 20.000 filas).
create or replace function ventas_rango()
returns table (desde date, hasta date, clientes int)
language sql stable security definer set search_path = public as $$
  select min(fecha), max(fecha), (select count(*)::int from ventas_clientes)
    from ventas_diarias where puede_ver_acciones();
$$;

-- ─── 2. Eventos ─────────────────────────────────────────────────────────────
create table if not exists eventos_clientes (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null default '',
  fecha         date,
  lugar         text not null default '',
  formato       text not null default '',     -- Showroom, Capacitación, Lanzamiento… (lista en eventos-clientes.js)
  accion_id     uuid references acciones(id) on delete set null,
  inversion_usd numeric,                      -- si queda vacío se toma la de la acción vinculada
  notas         text not null default '',
  autor         text,
  autor_email   text,
  creado        timestamptz not null default now(),
  actualizado   timestamptz not null default now()
);
create index if not exists eventos_clientes_fecha_idx on eventos_clientes (fecha desc);

create table if not exists eventos_clientes_inv (
  id           uuid primary key default gen_random_uuid(),
  evento_id    uuid not null references eventos_clientes(id) on delete cascade,
  cuit         text,                          -- vacío = cliente que todavía no compró nunca
  razon_social text not null default '',
  nombre       text not null default '',
  inscripto    boolean not null default true,
  asistio      boolean not null default false,
  personas     int,
  notas        text not null default '',
  creado       timestamptz not null default now(),
  unique (evento_id, cuit)
);
create index if not exists eventos_clientes_inv_idx on eventos_clientes_inv (evento_id);

drop trigger if exists eventos_clientes_touch_t on eventos_clientes;
create trigger eventos_clientes_touch_t before update on eventos_clientes
  for each row execute function acciones_touch();

-- ─── 3. Permisos ────────────────────────────────────────────────────────────
alter table ventas_clientes      enable row level security;
alter table ventas_diarias       enable row level security;
alter table ventas_importaciones enable row level security;
alter table eventos_clientes     enable row level security;
alter table eventos_clientes_inv enable row level security;

drop policy if exists vc_sel on ventas_clientes;
create policy vc_sel on ventas_clientes for select to authenticated using (puede_ver_acciones());
drop policy if exists vd_sel on ventas_diarias;
create policy vd_sel on ventas_diarias for select to authenticated using (puede_ver_acciones());
-- (ventas_clientes y ventas_diarias se escriben sólo por ventas_importar)

drop policy if exists vi_sel on ventas_importaciones;
create policy vi_sel on ventas_importaciones for select to authenticated using (puede_ver_acciones());
drop policy if exists vi_ins on ventas_importaciones;
create policy vi_ins on ventas_importaciones for insert to authenticated
  with check (puede_ver_acciones() and lower(autor_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists ec_sel on eventos_clientes;
create policy ec_sel on eventos_clientes for select to authenticated using (puede_ver_acciones());
drop policy if exists ec_ins on eventos_clientes;
create policy ec_ins on eventos_clientes for insert to authenticated
  with check (puede_ver_acciones() and lower(autor_email) = lower(auth.jwt() ->> 'email'));
drop policy if exists ec_upd on eventos_clientes;
create policy ec_upd on eventos_clientes for update to authenticated
  using (puede_ver_acciones()) with check (puede_ver_acciones());
drop policy if exists ec_del on eventos_clientes;
create policy ec_del on eventos_clientes for delete to authenticated
  using (puede_ver_acciones() and (lower(autor_email) = lower(auth.jwt() ->> 'email') or rol_actual() = 'admin'));

drop policy if exists eci_all on eventos_clientes_inv;
create policy eci_all on eventos_clientes_inv for all to authenticated
  using (puede_ver_acciones()) with check (puede_ver_acciones());
