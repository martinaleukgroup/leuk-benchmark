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
- Los PDF y el log quedan en cada corrida → **Artifacts** (30 días).
- Publica la plataforma (commit como `github-actions[bot]` + dispara Pages).

### Correrlo a mano

1. GitHub → repo → pestaña **Actions** → **Fichas técnicas · actualización diaria**.
2. **Run workflow** → elegir:
   - **modo:** `prueba` (no publica nada, solo muestra qué cambiaría y genera los PDF) o `real` (publica).
   - **solo:** agrupaciones a imprimir sí o sí, separadas por coma (ej. `MOLY, DYNA`). Opcional.
   - **max_pdfs:** el freno; subirlo si cambiaron muchas fichas a propósito.
3. Al terminar (~4 min): la corrida muestra el resumen (qué fichas cambiaron, pendientes de foto) y
   los PDF en **Artifacts**.

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
