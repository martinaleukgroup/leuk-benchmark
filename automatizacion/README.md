# Actualización automática de fichas

> **Desde el 02/11/2026 corre en GitHub Actions, no en la Mac.**
> Workflow: **"Fichas técnicas · actualización diaria"** (`.github/workflows/fichas-diarias.yml`),
> lun–vie **7:12** (Buenos Aires), aunque la Mac esté apagada. Scripts en `automatizacion/ci/`.
> La tarea de la Mac (launchd) quedó desactivada: `pipeline/actualizar_fichas.sh` sale sin hacer nada
> salvo que se corra con `FORZAR_MAC=1`. Lo de abajo describe esa versión de la Mac, que es la base.

## GitHub Actions (versión actual)

Hace lo mismo que la Mac (índice de Drive, fotos, fichas desde el Hub, mismos frenos) y además:

- **Detecta qué fichas cambiaron** contra la versión publicada (datos o foto nueva) y genera
  **solo esos PDF** (`Ficha Técnica - <AGRUPACIÓN>.pdf`, el nombre que usa el Proceso 2 del Hub).
- **Fichas sin foto de producto:** el PDF se genera pero queda en `pdfs_pendientes_foto/` y no se
  sube. Cuando aparece la foto en Drive, la ficha se detecta como cambiada y sale completa.
- **Freno:** si cambian más de 30 fichas en una corrida, no genera PDF (avisa en el resumen).
- **Filtro por stock (05/11/2026):** solo van a la ficha los productos cuyo SKU está en el Excel
  *STOCK LEUK ILUMINACIÓN* (pestaña DISPONIBILIDAD DE STOCK). No importa la disponibilidad: "SIN
  STOCK" también cuenta; lo que manda es que el SKU figure. El SKU que no está sale de su ficha
  (si era una variante de color, la ficha sigue con las demás) y la ficha que queda sin ningún SKU
  sale de la plataforma. Lo quitado queda en `fichas-sin-stock.json` (SKU, nombre, ficha, y las
  fichas que salieron enteras). Cuando el SKU aparece en el Excel, vuelve solo en la corrida siguiente.
  - Si no se puede leer el Excel (o trae menos de 200 SKU), **no publica** ese día.
  - Si hoy salen más de 30 SKU que ayer estaban, **no publica** (suele ser un Excel recortado). Si
    está bien, correr a mano tildando **permitir_quitar_stock**. La lista queda en el artifact
    (`sin_stock_nuevos.txt`).
  - El freno del 5% descuenta las hojas que salen a propósito por stock.
  - Apagarlo: variable de entorno `FICHAS_FILTRO_STOCK=0` (en el paso "Actualizar fichas").
  - Los PDF de fichas que salieron enteras **siguen en Drive**: hay que sacarlos a mano.
- Los PDF y el log quedan en cada corrida → **Artifacts** (30 días).
- Publica la plataforma (commit como `github-actions[bot]` + dispara Pages).

### Correrlo a mano

1. GitHub → repo → pestaña **Actions** → **Fichas técnicas · actualización diaria**.
2. **Run workflow** → elegir:
   - **modo:** `prueba` (no publica nada, solo muestra qué cambiaría y genera los PDF) o `real` (publica).
   - **solo:** imprimir solo estas agrupaciones, separadas por coma (ej. `MOLY, DYNA`). Opcional; las demás cambiadas quedan para la próxima corrida.
   - **max_pdfs:** el freno; subirlo si cambiaron muchas fichas a propósito.
   - **permitir_quitar_stock:** aceptar que el filtro de stock saque más de 30 SKU de golpe.
3. Al terminar (~4 min): la corrida muestra el resumen (qué fichas cambiaron, pendientes de foto) y
   los PDF en **Artifacts**.

### Etiquetas del panel de Fichas

Desde el 02/11/2026 ya no hay estados manuales (Solicitada / A actualizar / Finalizada).
Cada corrida actualiza `fichas-historial.json` (lo escribe `ci/fichas_cambiadas.py`) y el panel
muestra: **Nueva** (creada en los últimos 15 días), **Actualizada** (cambió en los últimos 15
días, con qué cambió), **Falta foto** (alguna hoja de producto sin foto; su PDF no se sube) y
**Discontinuada**. El bot de Apps Script que calculaba los estados quedó apagado.

### Desde la plataforma (botón)

Fichas → **⟳ Regenerar fichas** (barra de arriba) o **⟳ Reimprimir** (en cada ficha). Elegís
*Solo probar* o *Publicar*; el recuadro de estado muestra el avance y el resumen al terminar.
Sólo lo ven **admin, líder y coordinación**. Pasa por la Edge Function `fichas-github`
(`plataforma/supabase/functions/fichas-github`), que guarda el token de GitHub como secreto.

Puesta en marcha (una vez):
1. GitHub → foto de perfil → Settings → Developer settings → Personal access tokens →
   **Fine-grained tokens** → Generate new token. Repository access: *Only select repositories* →
   `leuk-benchmark`. Permissions → Repository → **Actions: Read and write**. Copiar el token.
2. Supabase → Edge Functions → **Secrets** → agregar `GITHUB_TOKEN` con ese valor.
3. Supabase → Edge Functions → **Deploy a new function**, nombre `fichas-github`, pegar
   `index.ts` y **desactivar "Verify JWT"** (la función valida sola).

### Pausarlo

Settings → Secrets and variables → Actions → **Variables** → `FICHAS_MODO` = `prueba`.
La corrida programada sigue, pero sin publicar. Borrar la variable para volver a modo real.

---

## Versión de la Mac (desactivada)

## Qué hace

`actualizar_fichas.sh`, todos los días a las **7:30**:

1. Re-indexa Drive (dibujos, curvas, LDT, CAD, manuales)
   y baja las **fotos de producto** nuevas o cambiadas de la
   [carpeta de fotos](https://drive.google.com/drive/folders/1OmHlMZ4sMK5890tNkRoeMoNZVgU15JLD)
2. Regenera `app/fichas-data.js` leyendo BASE ÚNICA
3. Publica a GitHub Pages — **sólo si algo cambió**

Corre con `launchd`, no con `cron`: si la Mac está apagada a las 7:30, la
tarea se dispara al prenderla.

## Las fotos de producto

Salen siempre de la carpeta de Drive de arriba. Para que una foto entre sola:

- nombrarla empezando por la SKU: `4169FotoProducto0.png` o `4169.png`
- subirla suelta a la carpeta (los ZIP se ignoran)
- para corregir una, reemplazarla o subir la nueva y borrar la vieja

Entra en la corrida siguiente (7:30) o al correrlo a mano. Las fichas no enlazan directo a
Drive —Google corta con error 429 cuando se piden varias fotos seguidas—: el proceso las
copia a `app/assets/ficha/fotos/`. Qué bajó cada vez queda en el log.

## Correrlo a mano

```bash
~/leuk-benchmark/pipeline/actualizar_fichas.sh
```

Tarda unos 4 minutos (lo lento es indexar Drive). El log queda en
`pipeline/actualizar_fichas.log`.

## Los tres frenos, y por qué existen

Todos salieron de algo que pasó de verdad el 21/08/2026:

| Freno | Por qué |
|---|---|
| No publica si no pudo leer la planilla | El script caía al `Maestro_Marketing.xlsx` local (de julio) e imprimía un aviso de una línea entre otras veinte. Estuvo semanas generando fichas viejas sin que nadie lo notara. |
| No publica si las fichas caen más de 5% | Se borraron 25 filas de BASE ÚNICA por accidente y la primera corrida automática las publicó a los minutos (182 → 178 documentos). Una baja de producto mueve una o dos fichas; una caída grande es casi siempre un error de edición. |
| No publica si no cambió nada | Evita commits vacíos. |

Cuando un freno salta, **no publica y lo deja escrito en el log**. Se arregla
la causa y se vuelve a correr a mano.

## Instalar en otra máquina

```bash
cp automatizacion/com.leuk.fichas.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.leuk.fichas.plist
launchctl list | grep leuk        # confirmar
```

Para apagarla: `launchctl unload ~/Library/LaunchAgents/com.leuk.fichas.plist`

> Los archivos vivos son `pipeline/actualizar_fichas.sh` y el plist en
> `~/Library/LaunchAgents/`. Éstas son copias versionadas: si cambiás uno,
> copiá el otro.

## Lo que esto NO hace

- **No cambia el estado de las fichas.** Eso lo hace el bot de Apps Script los
  miércoles a las 4 AM (`actualizarFichasTecnicas`).
- **No se dispara con el botón "Actualizar"** de la plataforma. Ese botón sólo
  marca una ficha como Finalizada; no regenera nada.
