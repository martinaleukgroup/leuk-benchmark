# API de fichas técnicas — despliegue

Conecta la hoja **Fichas técnicas** del *Archivo de carga | Web* con la vista
**Estado de fichas** de Benchmark, para poder cerrar una ficha desde la
plataforma en vez de editar la planilla a mano.

| Pieza | Dónde vive |
|---|---|
| `06_API.gs` | proyecto Apps Script **Bot - Marketing Leuk** (copia versionada acá) |
| `fichas-estado.js` · `fichas-estado.css` | `app/` (este repo) |
| Enganche a la navegación | `app/app.js` + `app/index.html` |

---

## 1 · Instalar el archivo en Apps Script

1. Abrí el proyecto **Bot - Marketing Leuk**.
2. `+` → **Secuencia de comandos** → nombrala `06_API`.
3. Pegá el contenido de [`06_API.gs`](06_API.gs). Guardá.

> **Tiene que ser el mismo proyecto**, no uno nuevo.
> `LockService.getScriptLock()` es *por proyecto*: en un proyecto aparte tomaría
> un candado distinto al del bot y no protegería nada.

**No hay que tocar `00_Comun.gs` ni `02_Fichas.gs`.** La API sólo reusa sus
helpers y escribe en la misma hoja, como si fuera una persona editando.

---

## 2 · Cargar el token

En el editor, ejecutá una vez:

```
generarTokenAPI()
```

Copiá el token que sale en el log. Después:

**⚙ Configuración del proyecto → Propiedades del script → Agregar propiedad**

| Propiedad | Valor | ¿Obligatoria? |
|---|---|---|
| `API_TOKEN` | el token que generaste | sí |
| `SUPABASE_URL` | `https://cswqoretlhppxkelysny.supabase.co` | sí |
| `SUPABASE_ANON_KEY` | la clave publicable (la misma de `app.js`) | sí |
| `ROLES_ESCRITURA` | `admin,lider,coordinacion,diseno` | no (es el default) |
| `EXIGIR_JWT_LECTURA` | `true` para que leer también pida sesión | no (default `false`) |

Verificá con `verificarConfiguracionAPI()` — chequea todo sin imprimir secretos.

> **El token no es un secreto.** Viaja en el JS de una página pública de GitHub
> Pages, así que cualquiera puede leerlo. Sirve para que un escáner no encuentre
> el endpoint y para poder rotarlo barato.
> **La seguridad real la da el JWT de Supabase**, que la API valida contra
> Supabase en cada escritura. Por eso el campo `usuario` no se acepta del
> cliente: sale de la sesión verificada.

---

## 3 · Publicar el Web App

**Implementar → Nueva implementación → ⚙ → Aplicación web**

| Campo | Valor | Por qué |
|---|---|---|
| Descripción | `API fichas v1` | |
| Ejecutar como | **Yo** (`analisiscomercial@…`) | la API necesita los permisos que ya tiene el bot sobre las planillas |
| Quién tiene acceso | **Cualquier persona** | el navegador no manda cookies de Google; con cualquier otra opción Google devuelve su pantalla de login en vez de JSON |

Copiá la URL, la que termina en **`/exec`**.

> «Cualquier persona» suena peor de lo que es: sin `API_TOKEN` válido la API no
> devuelve nada, y sin JWT válido no escribe nada.

**Cada vez que edites `06_API.gs` hay que crear una implementación nueva** (o
editar la existente y subir la versión). Si no, el `/exec` sigue sirviendo el
código viejo — es la causa número uno de "lo cambié y no pasa nada".

---

## 4 · Conectar el frontend

En [`app/fichas-estado.js`](../fichas-estado.js), arriba de todo:

```js
const API = {
  url: "https://script.google.com/macros/s/AKfy…/exec",
  token: "el token del paso 2"
};
```

Publicá: `./publicar.sh "Estado de fichas"`

---

## 5 · Probar

Reemplazá `URL` y `TOKEN` y corré [`pruebas.sh`](pruebas.sh), o a mano:

**¿Está viva?**
```bash
curl -sL "URL?accion=ping&token=TOKEN"
```

**Listar todas**
```bash
curl -sL "URL?accion=fichas&token=TOKEN"
```

**Una sola**
```bash
curl -sL --get "URL" --data-urlencode "accion=ficha" --data-urlencode "token=TOKEN" --data-urlencode "agrupacion=POCKET III"
```

**Cambiar el estado** — `jwt` sale de la consola del navegador con sesión
abierta en Benchmark: `LEUK_SESION.token()`

```bash
curl -sL -X POST "URL" -H 'Content-Type: text/plain;charset=utf-8' -d '{"accion":"cambiarEstado","token":"TOKEN","jwt":"EL_JWT","agrupacion":"POCKET III","estado":"Listo para publicar","detectadoVisto":"20/08/2026 10:22"}'
```

### Qué esperar

| Prueba | Respuesta |
|---|---|
| token mal | `{"ok":false,"error":"TOKEN_INVALIDO"}` |
| sin `jwt` en un POST | `{"ok":false,"error":"SESION_INVALIDA"}` |
| `"estado":"Cualquier cosa"` | `{"ok":false,"error":"ESTADO_INVALIDO"}` |
| agrupación inexistente | `{"ok":false,"error":"NO_ENCONTRADA"}` + sugerencias |
| ficha discontinuada | `{"ok":false,"error":"FICHA_DISCONTINUADA"}` |
| `detectadoVisto` viejo | `{"ok":false,"error":"CONFLICTO"}` + estado actual |

> **Todas las respuestas son HTTP 200.** `ContentService` no deja setear el
> código de estado. El campo `httpStatus` del cuerpo es informativo: para saber
> si algo salió bien hay que mirar `ok`, nunca `response.status`.

---

## Cómo se lleva con el bot

`actualizarFichasTecnicas()` corre los miércoles 4 AM y **reescribe la hoja
entera** (`hoja.clear()` + `setValues()`). Eso convive bien porque:

1. **El candado cubre todo el ciclo.** `ejecutarProceso()` → `conCandado()`
   envuelve `_correrFichas` completo, desde `_leerFichasAnterior()` hasta
   `_escribirTablaFichas()`. La API toma el mismo candado, así que las dos
   escrituras se serializan. Si el bot está corriendo, la API responde
   `OCUPADO` y el usuario reintenta.

2. **Lo que la plataforma escribe, el bot lo respeta.** Si no hay cambios
   nuevos en el Maestro, `_estadoConservado()` traduce
   `Listo para publicar` → `Finalizada` y lo deja ahí.

3. **Un cambio real del Maestro siempre gana.** Si cambió la potencia, la ficha
   vuelve a `A actualizar` aunque alguien la haya marcado como lista. Es
   intencional.

### El caso que el candado NO cubre

El ciclo *leer → pensar → escribir* de una persona dura horas y vive en un
navegador. Alguien abre la lista el martes, el bot corre el miércoles 4 AM y
marca la ficha `A actualizar` porque cambió la potencia, y la persona vuelve del
café y aprieta **Listo para publicar** sobre la pantalla vieja. El candado hace
rato que se soltó: la escritura es legal y **borra el aviso en silencio**.

Se ataja con la columna **Detectado** como número de versión —
`02_Fichas.gs` sólo la refresca cuando el estado cambia:

```js
const detectado = (prev && prev.estado === estado && prev.detectado) ? prev.detectado : ahora();
```

La pantalla manda en `detectadoVisto` lo que estaba viendo. La API re-lee la
fila **adentro del candado**: si no coincide, devuelve `CONFLICTO` con el
estado y el motivo reales, y la pantalla vuelve a preguntar mostrando qué
cambió. Recién ahí un segundo POST con `forzar: true` pisa.

### Efecto secundario esperado

Cuando la plataforma escribe `Listo para publicar`, el miércoles siguiente el
bot lo canoniza a `Finalizada`, limpia la columna *Qué cambió* y refresca
*Detectado*. Es correcto, pero significa que **`Listo para publicar` es un
estado transitorio**: dura hasta la próxima corrida. Queda en `Log fichas`.

---

## Log

Se crea sola la primera vez, en el mismo archivo, pestaña **`Log fichas`**.
Acumulativa, nunca se borra. `_escribirTablaFichas()` hace `clear()` sólo sobre
`Fichas técnicas`, así que no la toca.

```
Fecha | Agrupación | Estado anterior | Estado nuevo | Motivo al momento | Usuario | Nombre | Rol | Origen | Forzado
```

**Motivo al momento** guarda lo que la persona tenía a la vista cuando decidió.
Es lo que después permite responder *"¿la cerró sabiendo que había cambiado la
potencia?"*.

---

## Pendientes que quedan fuera de esto

1. **Volcar las policies de Supabase a `supabase/schema.sql`.** Hoy no hay
   ningún `.sql` en el repo: la configuración de seguridad vive sólo en el
   dashboard, sin revisión ni backup.
2. **Verificar RLS en `autorizaciones` y `precios`.** Con RLS apagado,
   PostgREST expone la tabla a lectura **y escritura** para cualquiera que
   tenga URL y key — y las dos están en `app.js`, en un sitio público.
   `costos` y `perfiles` sí tienen policy.

   ```bash
   curl -s -X POST "https://cswqoretlhppxkelysny.supabase.co/rest/v1/autorizaciones" \
     -H "apikey: LA_CLAVE_PUBLICABLE" -H "Content-Type: application/json" \
     -d '[{"key":"__test_rls__","datos":{}}]' -w '\n%{http_code}\n'
   ```
   `201` = abierta (borrá la fila de prueba). `401`/`403` = hay RLS.

Ninguno de los dos bloquea las fichas: la API **no escribe en Supabase**, sólo
le pregunta quién es el usuario.
