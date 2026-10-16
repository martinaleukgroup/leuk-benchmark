-- Contenidos: una pieza puede nacer SIN fecha (oct 2026).
-- Cada mes arranca con una pieza en blanco y la fecha se completa en la ficha,
-- como cualquier otro dato. Las vistas, avisos y Resultados ya ignoran las piezas
-- sin fecha hasta que la tengan (no "salen hoy", no se atrasan, no se miden).
alter table public.contenidos alter column fecha drop not null;
