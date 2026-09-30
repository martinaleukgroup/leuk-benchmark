-- ============================================================================
--  RESULTADOS por canal de Contenidos (KPIs) — oct 2026
--
--  Dos tablas:
--    · resultados_config  → qué se mide en cada canal: función, objetivo, los datos
--                           crudos que se cargan, los KPIs (fórmulas) y el embudo.
--                           Sumar un canal o un KPI = editar este JSON, sin programar.
--    · resultados_valores → los números crudos que carga quien HACE el canal.
--                           Por pieza (pieza = id del contenido) o del mes (pieza = '').
--  Los KPIs NO se guardan: los calcula la plataforma a partir de los crudos.
--
--  Requiere 2026-08-31-contenidos.sql y 2026-09-29-contenidos-flujo.sql (es_responsable).
--  Idempotente: se puede volver a correr.
-- ============================================================================

create table if not exists resultados_config (
  canal        text primary key,                 -- 'whatsapp' | 'instagram' | …
  config       jsonb not null,                   -- ver el seed de abajo
  actualizado  timestamptz not null default now()
);

create table if not exists resultados_valores (
  id           uuid primary key default gen_random_uuid(),
  canal        text not null,
  mes          text not null,                    -- '2026-10'
  pieza        text not null default '',         -- id del contenido, o '' = dato del mes
  dato         text not null,                    -- clave del dato crudo ('leidos', 'alcance'…)
  valor        numeric,
  autor_email  text,
  actualizado  timestamptz not null default now(),
  unique (canal, mes, pieza, dato)
);
create index if not exists resultados_valores_idx on resultados_valores (canal, mes);

-- ¿Puede cargar resultados de este canal? Quien lo hace, admin, o cualquier editor
-- si el canal todavía no tiene a nadie asignado (misma regla que contenidos_pasar).
create or replace function puede_cargar_resultados(p_canal text) returns boolean
language sql stable security definer set search_path = public as $$
  select rol_actual() = 'admin'
      or es_responsable(p_canal, 'hace')
      or (puede_editar_contenidos() and not exists
            (select 1 from contenidos_responsables where canal = p_canal and papel = 'hace'));
$$;
grant execute on function puede_cargar_resultados(text) to authenticated;

alter table resultados_config  enable row level security;
alter table resultados_valores enable row level security;

drop policy if exists rc_sel on resultados_config;
create policy rc_sel on resultados_config for select to authenticated using (puede_ver_contenidos());
drop policy if exists rc_all on resultados_config;
create policy rc_all on resultados_config for all to authenticated
  using (rol_actual() = 'admin') with check (rol_actual() = 'admin');

drop policy if exists rv_sel on resultados_valores;
create policy rv_sel on resultados_valores for select to authenticated using (puede_ver_contenidos());
drop policy if exists rv_ins on resultados_valores;
create policy rv_ins on resultados_valores for insert to authenticated with check (puede_cargar_resultados(canal));
drop policy if exists rv_upd on resultados_valores;
create policy rv_upd on resultados_valores for update to authenticated
  using (puede_cargar_resultados(canal)) with check (puede_cargar_resultados(canal));
drop policy if exists rv_del on resultados_valores;
create policy rv_del on resultados_valores for delete to authenticated using (puede_cargar_resultados(canal));

-- ─── Seed: los dos canales que hoy tienen espacio en la plataforma ──────────
-- Salen de la estrategia digital (Sección 2 · función de cada canal y Sección 4 · KPIs).
-- Fórmulas disponibles (las entiende resultados.js):
--   suma      {dato}              total del período
--   sumas     {datos:[...]}       suma de varios datos
--   promedio  {dato}              promedio por pieza que tenga el dato
--   cociente  {num, den}          num ÷ den. Si den es del mes y num de la pieza,
--                                 cada pieza se divide por el den de su mes y se promedia
--   resta     {a, b}              a − b (altas − bajas)
--   ultimo    {dato}              el valor del último mes con dato (miembros)
-- "base" = trimestre con el que se compara hasta que haya metas.
insert into resultados_config (canal, config) values
('whatsapp', $j${
  "nombre": "WhatsApp Profesionales",
  "funcion": "Fidelizar",
  "verbos": "Relacionar · Aportar valor · Fidelizar",
  "objetivo": "Sostener cercanía y relevancia con la comunidad profesional.",
  "base": "2026-Q4",
  "datos": [
    {"k": "leidos",     "t": "Leído por",          "nivel": "pieza", "ayuda": "Mantener presionado el mensaje → Info, a las 48 h"},
    {"k": "votantes",   "t": "Votantes únicos",    "nivel": "pieza", "solo": "encuesta", "ayuda": "Ver votos: contar personas, no votos"},
    {"k": "respuestas", "t": "Respuestas",         "nivel": "pieza", "ayuda": "En el grupo + privados"},
    {"k": "clics",      "t": "Clics",              "nivel": "pieza", "ayuda": "GA4 · utm_content de la pieza", "opcional": true},
    {"k": "miembros",   "t": "Miembros al 1°",     "nivel": "mes"},
    {"k": "altas",      "t": "Altas",              "nivel": "mes"},
    {"k": "bajas",      "t": "Bajas",              "nivel": "mes"},
    {"k": "obras",      "t": "Obras recibidas",    "nivel": "mes"},
    {"k": "descargas",  "t": "Descargas",          "nivel": "mes", "ayuda": "Del recurso exclusivo del mes"},
    {"k": "consultas",  "t": "Consultas a comercial", "nivel": "mes"}
  ],
  "kpis": [
    {"k": "lecturas",      "t": "Lecturas",            "f": "cociente", "num": "leidos",   "den": "miembros", "fmt": "pct", "ayuda": "Leído por ÷ miembros, promedio por mensaje"},
    {"k": "clics",         "t": "Clics",               "f": "suma",     "dato": "clics"},
    {"k": "respuestas",    "t": "Respuestas",          "f": "suma",     "dato": "respuestas"},
    {"k": "participacion", "t": "Participación",       "f": "cociente", "num": "votantes", "den": "miembros", "fmt": "pct", "ayuda": "Votantes únicos ÷ miembros, por encuesta"},
    {"k": "neto",          "t": "Altas y bajas",       "f": "resta",    "a": "altas", "b": "bajas", "fmt": "signo"},
    {"k": "acciones",      "t": "Acciones generadas",  "f": "sumas",    "datos": ["obras", "descargas", "consultas"]}
  ],
  "embudo": [
    {"t": "Miembros",   "f": "ultimo",   "dato": "miembros"},
    {"t": "Leen",       "f": "promedio", "dato": "leidos",   "nota": "por mensaje"},
    {"t": "Participan", "f": "promedio", "dato": "votantes", "nota": "por encuesta"},
    {"t": "Actúan",     "f": "sumas",    "datos": ["obras", "descargas", "consultas"]}
  ]
}$j$::jsonb),
('instagram', $j${
  "nombre": "Instagram Leuk",
  "funcion": "Posicionar",
  "verbos": "Inspirar · Educar · Posicionar",
  "objetivo": "Fortalecer el posicionamiento y la consideración de las soluciones Leuk.",
  "base": "2026-Q4",
  "datos": [
    {"k": "alcance",       "t": "Alcance",                   "nivel": "pieza", "ayuda": "Estadísticas de la publicación"},
    {"k": "alcance_ns",    "t": "Alcance a no seguidores",   "nivel": "pieza"},
    {"k": "interacciones", "t": "Interacciones",             "nivel": "pieza", "ayuda": "Me gusta + comentarios + compartidos + guardados"},
    {"k": "guardados",     "t": "Guardados",                 "nivel": "pieza"},
    {"k": "visitas",       "t": "Visitas al perfil",         "nivel": "pieza"},
    {"k": "clics",         "t": "Clics al sitio web",        "nivel": "pieza"}
  ],
  "kpis": [
    {"k": "alcance_ns",  "t": "Alcance a no seguidores",    "f": "suma",     "dato": "alcance_ns"},
    {"k": "pct_ns",      "t": "% de alcance a no seguidores","f": "cociente", "num": "alcance_ns", "den": "alcance", "fmt": "pct"},
    {"k": "engagement",  "t": "Engagement rate",            "f": "cociente", "num": "interacciones", "den": "alcance", "fmt": "pct", "ayuda": "Interacciones ÷ alcance"},
    {"k": "guardados",   "t": "Guardados",                  "f": "suma",     "dato": "guardados"},
    {"k": "visitas",     "t": "Visitas al perfil",          "f": "suma",     "dato": "visitas"},
    {"k": "clics",       "t": "Clics al sitio web",         "f": "suma",     "dato": "clics"}
  ],
  "embudo": [
    {"t": "Alcance",          "f": "suma", "dato": "alcance"},
    {"t": "Interactúan",      "f": "suma", "dato": "interacciones"},
    {"t": "Visitan el perfil","f": "suma", "dato": "visitas"},
    {"t": "Clics a la web",   "f": "suma", "dato": "clics"}
  ]
}$j$::jsonb)
on conflict (canal) do nothing;
