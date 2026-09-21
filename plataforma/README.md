# Plataforma — la parte de atrás del Benchmark

Esta carpeta es una copia versionada de lo que vive en `~/leuk-benchmark` por fuera de la app:

| Carpeta | Qué tiene |
|---|---|
| `pipeline/` | Scripts Python de datos (consolidar, matching, imágenes, `subir_receta.py`, `subir_datos.py`) |
| `worker/` | `worker.py`: el worker de Modal que procesa las listas de precios que se suben desde la app |
| `supabase/` | SQL (tablas, RLS, recetas) y Edge Functions |
| `skills/alta-competidor/` | La skill para dar de alta una marca nueva, con las recetas de cada competidor |
| `docs/` | Procesos: alta y actualización de competencia, datos, setup de Modal |
| `handoff-fable5/` | Documentación técnica de arquitectura, matching y esquema de datos |

## Cargar listas de precios

- **Marca ya cargada (Vonderk, Artelum, WLG, Lucciola):** desde la app, Benchmark → **↻ Actualizar lista**.
  Solo lo ven los roles **admin, líder y coordinación**. Ver `docs/PROCESO-ALTA-COMPETENCIA-APP.md`.
- **Marca nueva:** con la skill `skills/alta-competidor` + `pipeline/subir_receta.py`.
- Para correr el circuito completo sin la service key, primero hay que aplicar
  `supabase/sql/2026-09-17-alta-sin-service-key.sql` en Supabase.

## Secretos

Ninguna llave está en el repo. Las del worker (Anthropic, Supabase service role) viven en el
secreto `leuk-integracion` de Modal; ver `docs/SETUP-MODAL.md`.

## Mantenerla al día

La fuente sigue siendo `~/leuk-benchmark`. Para volver a copiar y publicar:

```bash
bash ~/leuk-benchmark/app/plataforma/sincronizar.sh && ~/leuk-benchmark/publicar.sh "Sincroniza plataforma"
```
