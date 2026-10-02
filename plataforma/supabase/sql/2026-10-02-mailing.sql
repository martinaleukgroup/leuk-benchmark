-- ============================================================================
--  MAILING — tercer canal de Contenidos (oct 2026)
--
--  Mailing usa la misma maquinaria que WhatsApp e Instagram (cronograma, flujo por
--  pieza, responsables, avisos, Resultados). No hay tablas nuevas:
--    · cada envío es una fila de `contenidos` con canal = 'mailing';
--    · el destino del mail (profesionales | distribuidores) va en la columna `tipo`
--      (la misma que en Instagram guarda post/carrusel/reel; no tiene CHECK);
--    · los números salen del reporte del envío en Odoo y se cargan a mano en Resultados.
--
--  Lo único que hay que correr es la config de KPIs del canal. Quién hace y quién revisa
--  se carga desde la plataforma (Contenidos → Mailing → ⋯ Más → Responsables, sólo admin).
--  Requiere 2026-09-30-resultados.sql. Idempotente: si ya existe la fila, no la pisa
--  (los cambios se hacen desde Administración → KPIs por canal).
--
--  `solo` en un dato = el destino al que se le pide (la conversión es distinta por destino:
--  especificaciones para Profesionales, pedidos para Distribuidores).
-- ============================================================================

insert into resultados_config (canal, config) values
('mailing', $j${
  "nombre": "Mailing",
  "funcion": "Convertir",
  "verbos": "Informar · Activar · Convertir",
  "objetivo": "Que cada envío llegue, se abra y termine en una especificación (Profesionales) o en un pedido (Distribuidores).",
  "base": "2026-Q4",
  "fuente": "Odoo",
  "unidad": "envío",
  "destinos": [
    {
      "k": "profesionales",
      "t": "Profesionales"
    },
    {
      "k": "distribuidores",
      "t": "Distribuidores"
    }
  ],
  "datos": [
    {
      "k": "enviados",
      "t": "Enviados",
      "nivel": "pieza",
      "ayuda": "Odoo → Email Marketing → el envío → Enviados"
    },
    {
      "k": "entregados",
      "t": "Recibidos",
      "nivel": "pieza",
      "ayuda": "Odoo → Recibidos (enviados menos rebotados)"
    },
    {
      "k": "abiertos",
      "t": "Abiertos",
      "nivel": "pieza",
      "ayuda": "Odoo → Abiertos"
    },
    {
      "k": "clics",
      "t": "Clics",
      "nivel": "pieza",
      "ayuda": "Odoo → Clics"
    },
    {
      "k": "rebotados",
      "t": "Rebotados",
      "nivel": "pieza",
      "ayuda": "Odoo → Rebotados"
    },
    {
      "k": "bajas",
      "t": "Bajas",
      "nivel": "pieza",
      "ayuda": "Contactos que se dieron de baja a partir de este envío"
    },
    {
      "k": "conv_espec",
      "t": "Especificaciones",
      "nivel": "pieza",
      "solo": "profesionales",
      "ayuda": "Especificaciones que salieron de este envío (sólo Profesionales)"
    },
    {
      "k": "conv_pedidos",
      "t": "Pedidos",
      "nivel": "pieza",
      "solo": "distribuidores",
      "ayuda": "Pedidos que salieron de este envío (sólo Distribuidores)"
    }
  ],
  "kpis": [
    {
      "k": "apertura",
      "t": "Tasa de apertura",
      "f": "cociente",
      "num": "abiertos",
      "den": "entregados",
      "fmt": "pct",
      "ayuda": "Abiertos ÷ recibidos"
    },
    {
      "k": "ctr",
      "t": "CTR",
      "f": "cociente",
      "num": "clics",
      "den": "entregados",
      "fmt": "pct",
      "ayuda": "Clics ÷ recibidos"
    },
    {
      "k": "ctor",
      "t": "CTOR",
      "f": "cociente",
      "num": "clics",
      "den": "abiertos",
      "fmt": "pct",
      "ayuda": "Clics ÷ abiertos: de los que abren, cuántos hacen clic"
    },
    {
      "k": "rebote",
      "t": "Tasa de rebote",
      "f": "cociente",
      "num": "rebotados",
      "den": "enviados",
      "fmt": "pct",
      "ayuda": "Rebotados ÷ enviados"
    },
    {
      "k": "bajas",
      "t": "Bajas",
      "f": "suma",
      "dato": "bajas"
    },
    {
      "k": "espec",
      "t": "Especificaciones",
      "f": "suma",
      "dato": "conv_espec",
      "solo": "profesionales",
      "ayuda": "Conversión de Profesionales"
    },
    {
      "k": "pedidos",
      "t": "Pedidos",
      "f": "suma",
      "dato": "conv_pedidos",
      "solo": "distribuidores",
      "ayuda": "Conversión de Distribuidores"
    }
  ],
  "embudo": [
    {
      "t": "Enviados",
      "f": "suma",
      "dato": "enviados"
    },
    {
      "t": "Recibidos",
      "f": "suma",
      "dato": "entregados"
    },
    {
      "t": "Abren",
      "f": "suma",
      "dato": "abiertos"
    },
    {
      "t": "Hacen clic",
      "f": "suma",
      "dato": "clics"
    },
    {
      "t": "Convierten",
      "f": "sumas",
      "datos": [
        "conv_espec",
        "conv_pedidos"
      ],
      "nota": "especificaciones + pedidos"
    }
  ]
}$j$::jsonb)
on conflict (canal) do nothing;
