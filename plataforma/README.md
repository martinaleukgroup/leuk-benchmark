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

## Subir listas desde Claude (otra persona / otra computadora)

1. **Instalar la skill** `alta-competidor`:
   - Claude Code: `cp -r plataforma/skills/alta-competidor ~/.claude/skills/`
   - App de Claude: Settings → Capabilities → Skills → subir el `.zip` de la carpeta
     `plataforma/skills/alta-competidor` (pedírselo a Martina o comprimir la carpeta).
2. **Pedirle a Claude:** "Subí esta lista de Vonderk al Benchmark" (adjuntando el PDF). La skill
   clona este repo, se loguea con tu cuenta de la plataforma (te pide email y contraseña en la
   terminal) y corre `pipeline/encolar_lista.py`.
3. Revisar lo importado en la app → Benchmark → Nuevas integraciones.

Requisitos: Python 3 (sin librerías extra para subir listas) y rol admin/líder/coordinación.

## Secretos

Ninguna llave está en el repo. Las del worker (Anthropic, Supabase service role) viven en el
secreto `leuk-integracion` de Modal; ver `docs/SETUP-MODAL.md`.

## Mantenerla al día

La fuente sigue siendo `~/leuk-benchmark`. Para volver a copiar y publicar:

```bash
bash ~/leuk-benchmark/app/plataforma/sincronizar.sh && ~/leuk-benchmark/publicar.sh "Sincroniza plataforma"
```
