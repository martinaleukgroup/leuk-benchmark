# Fotos de producto para el Generador de Liquidación — despliegue

El generador (`liquidacion.html`, página **Diseño → Liquidación**) no guarda fotos:
cada vez que se carga un Excel le pregunta a Drive, a través del bot, qué PNG hay
para cada SKU y las trae en el momento.

Orden de búsqueda (el primero que tenga foto gana):

1. Carpeta de **PNG general** — `1OmHlMZ4sMK5890tNkRoeMoNZVgU15JLD`
2. **Productos Leuk: Recursos Técnicos y Visuales** — `1EeWcZw0jQDyfpOX_cLQWfxZhfin_aDT_`
3. **DISCONTINUADOS** — `1gf887MSYiWmrat9dQIXBpEYm0mgz_PZt`

Regla: el nombre del PNG tiene que **empezar con el SKU de 4 dígitos**.
Excepción: los ventiladores Laftdren no llevan SKU en el nombre; se buscan por
modelo en `DISCONTINUADOS / Laftdren Ventiladores / <modelo>`.

| Pieza | Dónde vive |
|---|---|
| `07_Fotos.gs` | proyecto Apps Script **Bot - Marketing Leuk** (copia versionada acá) |
| 3 líneas nuevas en `doGet` de `06_API.gs` | mismo proyecto |
| `liquidacion.html` + `assets/liquidacion/` | este repo |

---

## 1 · Permisos de Drive

La cuenta que **ejecuta** el bot (`analisiscomercial@…`) tiene que poder **ver**
las tres carpetas de arriba. Si no las ve, compartíselas como *Lector*.

## 2 · Activar Drive API en el proyecto

En el editor de Apps Script: **Servicios → + → Drive API → versión v3 → Agregar**
(identificador: `Drive`).

## 3 · Pegar el código

1. `+` → **Secuencia de comandos** → `07_Fotos`. Pegá [`07_Fotos.gs`](07_Fotos.gs).
2. En `06_API.gs`, dentro de `doGet`, después de la línea de `ping`, agregá:

   ```js
   if (accion === 'fotosIndice' || accion === 'foto' || accion === 'fotosReindexar') return _fotosGet(accion, p);
   ```

   (ya está hecho en la copia de este repo).

## 4 · Primer índice y disparador diario

En el editor ejecutá, en este orden:

1. `probarFotos()` — arma el índice por primera vez y muestra en el registro
   algunas fotos encontradas. Va a pedir autorizar Drive: aceptá.
2. `instalarDisparadorFotos()` — de ahí en más el índice se rehace solo todos los
   días a las 6 (así toma las fotos nuevas que se suban).

El índice se guarda como `indice_fotos_liquidacion.json` en el Drive de la
cuenta del bot. Si alguien lo borra, se vuelve a crear solo.

## 5 · Publicar

**Implementar → Gestionar implementaciones → editar la actual → Versión: nueva → Implementar.**
Hay que hacerlo así (y no una implementación nueva) para que la URL `/exec`
siga siendo la misma que usan `fichas-panel.js` y `liquidacion.html`.

---

## Seguridad

- Las tres acciones (`fotosIndice`, `foto`, `fotosReindexar`) piden **siempre**
  la sesión de Benchmark (JWT), además del token.
- `foto` sólo entrega archivos que están en el índice: PNG de esas tres carpetas.
  No se puede pedir cualquier archivo del Drive por ID.
- `fotosReindexar` sólo lo pueden usar los roles de `ROLES_ESCRITURA`.

## Fotos muy pesadas

Los PNG de más de 4 MB se entregan como **miniatura de Drive de 1600 px**, que es
más que suficiente para la tarjeta (≈ 660 px a 300 dpi). Si alguna miniatura sale
con fondo en vez de transparente, conviene subir una versión más liviana del PNG.
