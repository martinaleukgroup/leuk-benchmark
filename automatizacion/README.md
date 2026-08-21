# Actualización automática de fichas

Las fichas **no se regeneran solas** cuando alguien sube un archivo a Drive o
edita BASE ÚNICA. Hay que correr el pipeline. Esto lo automatiza.

## Qué hace

`actualizar_fichas.sh`, todos los días a las **7:30**:

1. Re-indexa Drive (dibujos, curvas, LDT, CAD, manuales)
2. Regenera `app/fichas-data.js` leyendo BASE ÚNICA
3. Publica a GitHub Pages — **sólo si algo cambió**

Corre con `launchd`, no con `cron`: si la Mac está apagada a las 7:30, la
tarea se dispara al prenderla.

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
