-- ============================================================================
--  SUGERENCIAS sobre el copy — estilo Google Docs
--  Correr una sola vez en Supabase → SQL Editor. Es idempotente.
--
--  Una sugerencia es un comentario con coordenadas: apunta a un tramo exacto
--  del copy y propone con qué reemplazarlo. Vive en la misma tabla que los
--  comentarios para que el hilo de cada mensaje sea uno solo.
--
--  Sugiere cualquiera que vea el módulo (incluido el representante de marca).
--  Acepta o descarta SÓLO quien puede editar (admin / líder / coordinación).
-- ============================================================================

alter table contenidos_comentarios
  add column if not exists tipo         text not null default 'comentario',  -- comentario | sugerencia
  add column if not exists campo        text,        -- 'copy' | 'variantes.2.copy'
  add column if not exists desde        int,         -- offset inicial en el texto fuente
  add column if not exists hasta        int,         -- offset final
  add column if not exists original     text,        -- el tramo tal como estaba (ancla + respaldo)
  add column if not exists propuesto    text,        -- con qué se reemplaza
  add column if not exists decision     text,        -- null = pendiente | aceptada | descartada
  add column if not exists decidido_por text,
  add column if not exists decidido_en  timestamptz;

create index if not exists cc_sug_idx
  on contenidos_comentarios (contenido_id, tipo, decision);

-- ─── Permisos ───────────────────────────────────────────────────────────────
-- Insertar: cualquiera que vea el módulo, siempre a su propio nombre, y una
-- sugerencia SIEMPRE nace pendiente (nadie la crea ya aceptada).
drop policy if exists cc_ins on contenidos_comentarios;
create policy cc_ins on contenidos_comentarios for insert to authenticated
  with check (
    puede_ver_contenidos()
    and lower(autor_email) = lower(auth.jwt() ->> 'email')
    and decision is null
  );

-- Actualizar: quien edita puede todo (aceptar / descartar). El resto sólo
-- toca SUS comentarios comunes, y nunca puede fijar una decisión —
-- si no, el representante se aprobaría sus propias sugerencias.
drop policy if exists cc_upd on contenidos_comentarios;
create policy cc_upd on contenidos_comentarios for update to authenticated
  using (
    puede_editar_contenidos()
    or (lower(autor_email) = lower(auth.jwt() ->> 'email') and tipo = 'comentario')
  )
  with check (
    puede_editar_contenidos()
    or (lower(autor_email) = lower(auth.jwt() ->> 'email') and tipo = 'comentario' and decision is null)
  );

-- Borrar: lo propio, o cualquier cosa si sos admin (igual que antes).
drop policy if exists cc_del on contenidos_comentarios;
create policy cc_del on contenidos_comentarios for delete to authenticated
  using (lower(autor_email) = lower(auth.jwt() ->> 'email') or rol_actual() = 'admin');
