// ============================================================
// 06_API.gs — API DE FICHAS TÉCNICAS PARA BENCHMARK LEUK
// ============================================================
// Requiere 00_Comun.gs y 02_Fichas.gs en el MISMO proyecto de Apps Script.
// Eso no es opcional: LockService.getScriptLock() es por proyecto. Si esto
// viviera en un proyecto aparte, tomaría un candado distinto al del bot y no
// protegería nada.
//
// QUÉ HACE:
//   Publica la hoja "Fichas técnicas" como una API JSON para que la vista
//   "Estado de fichas" de Benchmark pueda leerla y cambiar el estado de una
//   ficha sin que nadie tenga que editar la planilla a mano.
//
// QUÉ NO HACE:
//   No calcula estados. Eso sigue siendo exclusivo de 02_Fichas.gs.
//   Esta API solo escribe la columna Estado (D) y Detectado (F) de una fila,
//   igual que si una persona la editara. El miércoles a las 4 AM el bot lee
//   ese valor con _estadoConservado() y decide qué hacer con él.
//
// POR QUÉ NO USA ejecutarProceso():
//   ejecutarProceso() llama a alertarError() ante CUALQUIER excepción. Para un
//   proceso batch semanal está perfecto; para una API que recibe pedidos de
//   personas, cada "no encontré esa agrupación" sería un mail a Martina.
//   Acá se usa conCandado() directo y se llama a alertarError() a mano, solo
//   ante fallas genuinamente inesperadas.
//
// SEGURIDAD, EN CRIOLLO:
//   · El token compartido NO es un secreto: viaja en el JS de una página
//     pública de GitHub Pages. Sirve para que un escáner random no encuentre
//     el endpoint, y para poder rotarlo barato. Nada más.
//   · El límite de seguridad REAL es el JWT de Supabase: la plataforma manda
//     la sesión del usuario logueado, esta API se la pregunta a Supabase, y
//     recién ahí sabe quién es. El campo "usuario" del body NO se acepta.
//   · El rol también se valida acá, no solo en la pantalla. Si no, cualquiera
//     con el token público podría escribir.
// ============================================================


// ============================================================
// 1. CONFIGURACIÓN
// ============================================================
// Todo lo sensible vive en Configuración del proyecto → Propiedades del script.
// Nada de esto se hardcodea. Corré verificarConfiguracionAPI() para chequear.
//
//   API_TOKEN            (obligatorio)  token compartido; generalo con generarTokenAPI()
//   SUPABASE_URL         (obligatorio)  https://xxxxx.supabase.co
//   SUPABASE_ANON_KEY    (obligatorio)  la clave publicable (la misma que usa app.js)
//   ROLES_ESCRITURA      (opcional)     default: admin,lider,coordinacion,diseno
//   EXIGIR_JWT_LECTURA   (opcional)     "true" para que leer también pida sesión

const API_HOJA_LOG = 'Log fichas';

// Estados que la plataforma puede escribir. Cualquier otra cosa → 400.
// "Discontinuada" queda deliberadamente afuera: ese estado lo decide el bot
// leyendo la Situación del Maestro, no una persona desde una pantalla.
const API_ESTADOS_PERMITIDOS = [
  ESTADO_FICHA.SOLICITADA,      // 'Solicitada'
  ESTADO_FICHA.A_ACTUALIZAR,    // 'A actualizar'
  ESTADO_FICHA.FINALIZADA,      // 'Finalizada'
  'Listo para publicar'         // 02_Fichas.gs lo interpreta como Finalizada
];

const API_ROLES_ESCRITURA_DEFAULT = 'admin,lider,coordinacion,diseno';

// Los mismos alias que usa app.js, para que un perfil viejo no quede sin permiso.
const API_ROL_ALIAS = { editor: 'lider', lector: 'comercial', fichas: 'diseno' };

// Color de fondo de la celda Estado, igual criterio que _escribirTablaFichas().
// "Listo para publicar" va en azul: se distingue de lo que escribió el bot.
const API_COLOR_ESTADO = (function () {
  const c = {};
  c[normCab(ESTADO_FICHA.SOLICITADA)]    = '#f4cccc';
  c[normCab(ESTADO_FICHA.A_ACTUALIZAR)]  = '#fff2cc';
  c[normCab(ESTADO_FICHA.FINALIZADA)]    = '#d9ead3';
  c[normCab(ESTADO_FICHA.DISCONTINUADA)] = '#e0e0e0';
  c[normCab('Listo para publicar')]      = '#cfe2f3';
  return c;
})();

function _prop(clave, porDefecto) {
  const v = PropertiesService.getScriptProperties().getProperty(clave);
  return (v === null || v === '') ? (porDefecto === undefined ? '' : porDefecto) : v;
}

function _supaUrl() { return _prop('SUPABASE_URL').replace(/\/+$/, ''); }


// ============================================================
// 2. PUNTOS DE ENTRADA HTTP
// ============================================================
// OJO CON ESTO: ContentService NO permite setear el código HTTP. Apps Script
// siempre responde 200. Los códigos que van en el campo "httpStatus" son
// LÓGICOS: el frontend tiene que ramificar por `ok` y por `error`, nunca por
// response.status.

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const accion = normTexto(p.accion);

    const auth = _apiAutorizarLectura(p);
    if (auth.error) return _apiError(auth.error, auth.mensaje, auth.status || 401);

    if (accion === 'fichas')     return _apiJson(_apiListarFichas());
    if (accion === 'ficha')      return _apiUnaFicha(normTexto(p.agrupacion));
    if (accion === 'ping')       return _apiJson({ ok: true, servicio: 'fichas', generado: new Date().toISOString() });

    return _apiError('ACCION_DESCONOCIDA',
      'Acciones válidas en GET: fichas · ficha · ping.', 400);
  } catch (err) {
    return _apiFallaInesperada('GET', err);
  }
}

function doPost(e) {
  try {
    // El frontend manda Content-Type: text/plain a propósito.
    // Con application/json el navegador dispara un preflight OPTIONS y Apps
    // Script NO responde OPTIONS: el POST falla con un error de CORS que no
    // dice nada. Con text/plain es "simple request" y no hay preflight.
    let body = {};
    if (e && e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
      } catch (errJson) {
        return _apiError('JSON_INVALIDO', 'El cuerpo del pedido no es JSON válido.', 400);
      }
    }

    const accion = normTexto(body.accion);
    if (accion === 'cambiarEstado') return _apiCambiarEstado(body);
    if (accion === 'fichas')        {   // lectura por POST, para cuando EXIGIR_JWT_LECTURA=true
      const auth = _apiAutorizarLectura(body);
      if (auth.error) return _apiError(auth.error, auth.mensaje, auth.status || 401);
      return _apiJson(_apiListarFichas());
    }

    return _apiError('ACCION_DESCONOCIDA',
      'Acciones válidas en POST: cambiarEstado · fichas.', 400);
  } catch (err) {
    return _apiFallaInesperada('POST', err);
  }
}


// ============================================================
// 3. RESPUESTAS
// ============================================================
function _apiJson(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _apiError(codigo, mensaje, httpStatus, extra) {
  const o = { ok: false, error: codigo, mensaje: mensaje, httpStatus: httpStatus || 400 };
  if (extra) Object.keys(extra).forEach(k => { o[k] = extra[k]; });
  return _apiJson(o);
}

// Una falla que no previmos sí merece mail: significa que hay un bug.
function _apiFallaInesperada(metodo, err) {
  try {
    alertarError('API de fichas',
      `Error inesperado en ${metodo}:\n${err.message}\n\n${err.stack || ''}`);
  } catch (e) { /* si ni el mail sale, al menos respondemos */ }
  return _apiError('ERROR_INTERNO',
    'Algo se rompió del lado del bot. Ya le avisamos a Martina por mail.', 500);
}


// ============================================================
// 4. AUTENTICACIÓN
// ============================================================

// Token compartido. Comparación de largo constante para no filtrar el token
// carácter por carácter midiendo tiempos. Es exagerado para un token público,
// pero cuesta cuatro líneas.
function _apiTokenValido(recibido) {
  const esperado = _prop('API_TOKEN');
  if (!esperado) return false;
  const a = String(recibido || ''), b = String(esperado);
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return dif === 0;
}

// Lectura: siempre token. JWT solo si EXIGIR_JWT_LECTURA está en true.
function _apiAutorizarLectura(p) {
  if (!_prop('API_TOKEN')) {
    return { error: 'SIN_CONFIGURAR',
             mensaje: 'La API no tiene API_TOKEN cargado. Corré generarTokenAPI() y guardalo en las propiedades del script.',
             status: 503 };
  }
  if (!_apiTokenValido(p.token)) {
    return { error: 'TOKEN_INVALIDO', mensaje: 'Token ausente o incorrecto.', status: 401 };
  }
  if (String(_prop('EXIGIR_JWT_LECTURA', 'false')).toLowerCase() === 'true') {
    const s = _apiIdentificar(p.jwt);
    if (s.error) return { error: s.error, mensaje: s.mensaje, status: 401 };
  }
  return {};
}

// Le pregunta a Supabase quién es el dueño de este JWT.
// Devuelve { email, rol, nombre } o { error, mensaje }.
// El resultado se cachea 5 minutos contra el hash del token: si alguien toca
// cinco fichas seguidas, se valida una sola vez.
function _apiIdentificar(jwt) {
  if (!jwt) {
    return { error: 'SESION_INVALIDA',
             mensaje: 'No llegó la sesión. Cerrá sesión en Benchmark y volvé a entrar.' };
  }
  const url = _supaUrl(), key = _prop('SUPABASE_ANON_KEY');
  if (!url || !key) {
    return { error: 'SIN_CONFIGURAR',
             mensaje: 'Faltan SUPABASE_URL o SUPABASE_ANON_KEY en las propiedades del script.' };
  }

  const cache = CacheService.getScriptCache();
  const ck = 'sesion_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, jwt));
  const guardado = cache.get(ck);
  if (guardado) { try { return JSON.parse(guardado); } catch (e) { } }

  let r;
  try {
    r = UrlFetchApp.fetch(url + '/auth/v1/user', {
      method: 'get',
      headers: { apikey: key, Authorization: 'Bearer ' + jwt },
      muteHttpExceptions: true
    });
  } catch (e) {
    return { error: 'SESION_INVALIDA', mensaje: 'No pude comunicarme con Supabase: ' + e.message };
  }

  if (r.getResponseCode() !== 200) {
    return { error: 'SESION_INVALIDA',
             mensaje: 'Tu sesión venció. Cerrá sesión en Benchmark y volvé a entrar.' };
  }

  let usuario;
  try { usuario = JSON.parse(r.getContentText()); }
  catch (e) { return { error: 'SESION_INVALIDA', mensaje: 'Supabase devolvió algo que no entiendo.' }; }

  const email = normTexto(usuario.email).toLowerCase();
  if (!email) return { error: 'SESION_INVALIDA', mensaje: 'La sesión no tiene email.' };

  const perfil = _apiPerfil(jwt, email);
  const res = { email: email, rol: perfil.rol, nombre: perfil.nombre };

  cache.put(ck, JSON.stringify(res), 300);   // 5 minutos
  return res;
}

// Rol y nombre desde la tabla `perfiles`, con el JWT del propio usuario
// (así RLS sigue aplicando: cada uno lee lo suyo).
function _apiPerfil(jwt, email) {
  const url = _supaUrl(), key = _prop('SUPABASE_ANON_KEY');
  try {
    const r = UrlFetchApp.fetch(
      url + '/rest/v1/perfiles?select=rol,nombre&email=ilike.' + encodeURIComponent(email), {
        method: 'get',
        headers: { apikey: key, Authorization: 'Bearer ' + jwt },
        muteHttpExceptions: true
      });
    if (r.getResponseCode() !== 200) return { rol: '', nombre: '' };
    const filas = JSON.parse(r.getContentText());
    if (!filas.length) return { rol: '', nombre: '' };          // cuenta sin rol asignado
    const bruto = normTexto(filas[0].rol).toLowerCase();
    return { rol: API_ROL_ALIAS[bruto] || bruto, nombre: normTexto(filas[0].nombre) };
  } catch (e) {
    return { rol: '', nombre: '' };
  }
}

function _apiPuedeEscribir(rol) {
  const permitidos = _prop('ROLES_ESCRITURA', API_ROLES_ESCRITURA_DEFAULT)
    .split(',').map(s => normTexto(s).toLowerCase()).filter(s => s !== '');
  return permitidos.indexOf(String(rol || '').toLowerCase()) !== -1;
}


// ============================================================
// 5. LECTURA DE LA TABLA
// ============================================================
// Lee la hoja tal cual la dejó 02_Fichas.gs. No interpreta ni corrige nada:
// si la columna Estado dice "Listo para publicar", eso es lo que se devuelve.

function _apiLeerHojaFichas() {
  const hoja = obtenerOCrearHoja(CONFIG.ID_ARCHIVO_WEB, CONFIG.HOJA_FICHAS);
  const ultFila = hoja.getLastRow();
  if (ultFila < 2) return { hoja: hoja, filas: [] };

  const datos = hoja
    .getRange(2, 1, ultFila - 1, FICHAS_TABLA.DETECTADO)
    .getDisplayValues();

  const filas = [];
  datos.forEach((f, i) => {
    const agrupacion = normTexto(f[FICHAS_TABLA.AGRUPACION - 1]);
    if (agrupacion === '') return;
    // "Sin grupos para mostrar." es el placeholder de _escribirTablaFichas()
    if (agrupacion === 'Sin grupos para mostrar.') return;

    const estado = normTexto(f[FICHAS_TABLA.ESTADO - 1]);
    const detectado = normTexto(f[FICHAS_TABLA.DETECTADO - 1]);

    filas.push({
      _fila: i + 2,                                  // fila real en la hoja (1-based)
      agrupacion: agrupacion,
      skus: normTexto(f[FICHAS_TABLA.SKUS - 1])
              .split(',').map(s => s.trim()).filter(s => s !== ''),
      cantidad: Number(f[FICHAS_TABLA.CANTIDAD - 1]) || 0,
      estado: estado,
      motivo: normTexto(f[FICHAS_TABLA.CAMBIO - 1]),
      detectado: detectado,
      detectadoISO: _apiFechaISO(detectado),
      // La regla vive acá, no en la pantalla: una ficha discontinuada no se toca.
      editable: normCab(estado) !== normCab(ESTADO_FICHA.DISCONTINUADA)
    });
  });

  return { hoja: hoja, filas: filas };
}

// "20/08/2026 10:22" → "2026-08-20T13:22:00.000Z"
// La hoja guarda hora de Argentina (CONFIG.TZ = GMT-3, sin horario de verano),
// así que el offset es fijo y la conversión es exacta.
// Sin esto el frontend no puede ordenar por fecha: como string, "03/09" es
// mayor que "20/08".
function _apiFechaISO(txt) {
  const m = String(txt || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!m) return '';
  const d = Number(m[1]), mes = Number(m[2]), a = Number(m[3]);
  const hh = Number(m[4] || 0), mm = Number(m[5] || 0);
  return new Date(Date.UTC(a, mes - 1, d, hh + 3, mm)).toISOString();
}

function _apiListarFichas() {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get('fichas_lista');
  if (guardado) { try { return JSON.parse(guardado); } catch (e) { } }

  const t = _apiLeerHojaFichas();
  const fichas = t.filas.map(f => {
    const c = {};
    Object.keys(f).forEach(k => { if (k !== '_fila') c[k] = f[k]; });
    return c;
  });

  const resumen = { Solicitada: 0, 'A actualizar': 0, Finalizada: 0, Discontinuada: 0, 'Listo para publicar': 0 };
  fichas.forEach(f => { if (resumen[f.estado] !== undefined) resumen[f.estado]++; });

  const salida = {
    ok: true,
    generado: new Date().toISOString(),
    total: fichas.length,
    resumen: resumen,
    fichas: fichas
  };

  // El caché tiene tope de 100 KB por clave. Si la tabla creció mucho, no
  // cacheamos y listo: es más lento, no es un error.
  const txt = JSON.stringify(salida);
  if (txt.length < 90000) cache.put('fichas_lista', txt, 60);
  return salida;
}

function _apiUnaFicha(agrupacion) {
  if (agrupacion === '') {
    return _apiError('FALTA_AGRUPACION', 'Tenés que indicar el parámetro "agrupacion".', 400);
  }
  const t = _apiLeerHojaFichas();
  const objetivo = normCab(agrupacion);
  const f = t.filas.filter(x => normCab(x.agrupacion) === objetivo)[0];

  // Si no está, se dice que no está. Nunca una ficha vacía.
  if (!f) {
    const parecidas = t.filas
      .filter(x => normCab(x.agrupacion).indexOf(objetivo.split(' ')[0]) === 0)
      .slice(0, 5).map(x => x.agrupacion);
    return _apiError('NO_ENCONTRADA',
      `No existe la agrupación "${agrupacion}" en la hoja "${CONFIG.HOJA_FICHAS}".`, 404,
      parecidas.length ? { parecidas: parecidas } : null);
  }

  const c = {};
  Object.keys(f).forEach(k => { if (k !== '_fila') c[k] = f[k]; });
  return _apiJson({ ok: true, generado: new Date().toISOString(), ficha: c });
}


// ============================================================
// 6. CAMBIO DE ESTADO
// ============================================================
function _apiCambiarEstado(body) {
  // --- token ---
  if (!_prop('API_TOKEN')) {
    return _apiError('SIN_CONFIGURAR',
      'La API no tiene API_TOKEN cargado. Corré generarTokenAPI().', 503);
  }
  if (!_apiTokenValido(body.token)) {
    return _apiError('TOKEN_INVALIDO', 'Token ausente o incorrecto.', 401);
  }

  // --- identidad: la manda Supabase, no el frontend ---
  const sesion = _apiIdentificar(body.jwt);
  if (sesion.error) return _apiError(sesion.error, sesion.mensaje, 401);

  if (!_apiPuedeEscribir(sesion.rol)) {
    return _apiError('SIN_PERMISO',
      sesion.rol
        ? `Tu rol (${sesion.rol}) puede ver las fichas pero no cambiar su estado.`
        : 'Tu cuenta todavía no tiene un rol asignado. Pedile a un administrador que te lo asigne.',
      403);
  }

  // --- validaciones de forma ---
  const agrupacion = normTexto(body.agrupacion);
  if (agrupacion === '') {
    return _apiError('FALTA_AGRUPACION', 'Falta el campo "agrupacion".', 400);
  }

  const pedido = normCab(body.estado);
  const canonico = API_ESTADOS_PERMITIDOS.filter(e => normCab(e) === pedido)[0];
  if (!canonico) {
    return _apiError('ESTADO_INVALIDO',
      `"${normTexto(body.estado)}" no es un estado que la plataforma pueda escribir. ` +
      `Válidos: ${API_ESTADOS_PERMITIDOS.join(' · ')}. ` +
      `"${ESTADO_FICHA.DISCONTINUADA}" lo decide el bot leyendo el Maestro.`, 400);
  }

  if (CONFIG.SIMULACION) {
    return _apiError('SIMULACION',
      'El bot está en modo simulación (CONFIG.SIMULACION = true). No se escribe nada.', 503);
  }

  // --- escritura, adentro del candado ---
  // OJO: conCandado() devuelve null en DOS casos: si no consiguió el candado,
  // o si fn() devolvió null. Por eso fn() siempre devuelve un objeto.
  const r = conCandado('API fichas', function () {
    return _apiEscribirEstado(agrupacion, canonico, body, sesion);
  });

  if (r === null) {
    return _apiError('OCUPADO',
      'El bot está actualizando la planilla en este momento. Probá de nuevo en un minuto.', 503);
  }
  if (r.error) return _apiError(r.error, r.mensaje, r.httpStatus || 400, r.extra);

  CacheService.getScriptCache().remove('fichas_lista');
  return _apiJson(r.ok);
}

// Todo lo de acá adentro corre con el candado tomado. Se re-lee la hoja a
// propósito: entre que el usuario cargó la pantalla y apretó el botón pueden
// haber pasado horas, y el bot pudo correr en el medio.
function _apiEscribirEstado(agrupacion, nuevoEstado, body, sesion) {
  const t = _apiLeerHojaFichas();
  const objetivo = normCab(agrupacion);
  const f = t.filas.filter(x => normCab(x.agrupacion) === objetivo)[0];

  if (!f) {
    return { error: 'NO_ENCONTRADA',
             mensaje: `No existe la agrupación "${agrupacion}" en la hoja "${CONFIG.HOJA_FICHAS}".`,
             httpStatus: 404 };
  }

  const estadoAnterior = f.estado;

  // Regla dura: una ficha discontinuada no se marca como lista. Ni forzando.
  // Si volvió a estar activa, el bot lo detecta solo el miércoles.
  if (normCab(estadoAnterior) === normCab(ESTADO_FICHA.DISCONTINUADA)) {
    return { error: 'FICHA_DISCONTINUADA',
             mensaje: `"${agrupacion}" está discontinuada: todos sus SKU salieron del catálogo. ` +
                      `No tiene sentido hacerle una ficha. Si volvió a estar activa, el bot la ` +
                      `reactiva solo en la próxima corrida (miércoles 4 AM).`,
             httpStatus: 409 };
  }

  // Pedir el estado que ya tiene no es un error, pero tampoco se toca la fecha:
  // "Detectado" significa "desde cuándo está así" y no hay que resetearlo.
  if (normCab(estadoAnterior) === normCab(nuevoEstado)) {
    return { ok: { ok: true, sinCambios: true,
                   agrupacion: f.agrupacion,
                   estadoAnterior: estadoAnterior, estadoNuevo: estadoAnterior,
                   detectado: f.detectado, usuario: sesion.email,
                   mensaje: 'Ya estaba en ese estado. No se tocó nada.' } };
  }

  // --- control de conflicto ---
  // "Detectado" funciona como número de versión: 02_Fichas.gs solo lo refresca
  // cuando el estado cambia (ver el cálculo de `detectado` en _correrFichas).
  // El caso real que esto ataja: alguien abre la lista el martes, el bot corre
  // el miércoles 4 AM y marca la ficha "A actualizar" porque cambió la potencia,
  // y la persona vuelve del café y apreta "Listo para publicar" sobre la
  // pantalla vieja. El candado no cubre eso — el ciclo leer-pensar-escribir
  // dura horas y vive en un navegador. Esto sí.
  const visto = normTexto(body.detectadoVisto);
  const forzar = body.forzar === true || String(body.forzar) === 'true';

  if (visto !== '' && visto !== f.detectado && !forzar) {
    return { error: 'CONFLICTO',
             mensaje: `"${agrupacion}" cambió mientras la mirabas: ahora está en "${estadoAnterior}".`,
             httpStatus: 409,
             extra: { estadoActual: estadoAnterior,
                      detectadoActual: f.detectado,
                      motivoActual: f.motivo,
                      detectadoVisto: visto } };
  }

  // --- escritura ---
  const ahoraTxt = ahora();
  const hoja = t.hoja;

  hoja.getRange(f._fila, FICHAS_TABLA.ESTADO).setValue(nuevoEstado);
  hoja.getRange(f._fila, FICHAS_TABLA.DETECTADO).setValue(ahoraTxt);

  const color = API_COLOR_ESTADO[normCab(nuevoEstado)];
  if (color) hoja.getRange(f._fila, FICHAS_TABLA.ESTADO).setBackground(color);

  // La columna "Qué cambió" NO se pisa: puede tener el motivo real que detectó
  // el bot ("Potencia, Lúmenes LED en 7317") y queremos que siga a la vista
  // hasta que el miércoles el bot lo limpie solo.
  // Única excepción: si alguien pide "A actualizar" a mano sobre una ficha que
  // no tenía motivo, se deja escrito quién y cuándo. Si no, quedaría un
  // "A actualizar" sin explicación que nadie sabe de dónde salió.
  let motivoFinal = f.motivo;
  if (normCab(nuevoEstado) === normCab(ESTADO_FICHA.A_ACTUALIZAR) && f.motivo === '') {
    motivoFinal = `Marcada para actualizar desde la plataforma por ${sesion.email} (${ahoraTxt})`;
    hoja.getRange(f._fila, FICHAS_TABLA.CAMBIO).setValue(motivoFinal);
  }

  // El motivo que se registra es el que ESTABA a la vista cuando decidió.
  // Es lo que después permite responder "¿la cerró sabiendo que había
  // cambiado la potencia?".
  _apiRegistrarLog({
    agrupacion: f.agrupacion,
    estadoAnterior: estadoAnterior,
    estadoNuevo: nuevoEstado,
    motivo: f.motivo,
    usuario: sesion.email,
    nombre: sesion.nombre,
    rol: sesion.rol,
    origen: 'plataforma',
    forzado: forzar && visto !== '' && visto !== f.detectado
  });

  return { ok: { ok: true,
                 agrupacion: f.agrupacion,
                 estadoAnterior: estadoAnterior,
                 estadoNuevo: nuevoEstado,
                 motivo: motivoFinal,
                 detectado: ahoraTxt,
                 usuario: sesion.email } };
}


// ============================================================
// 7. LOG
// ============================================================
// Hoja aparte, acumulativa, nunca se borra. Vive en el mismo archivo pero en
// otra pestaña: _escribirTablaFichas() hace hoja.clear() solo sobre
// CONFIG.HOJA_FICHAS, así que esto queda intacto.
const API_LOG_CABECERA = [
  'Fecha', 'Agrupación', 'Estado anterior', 'Estado nuevo',
  'Motivo al momento', 'Usuario', 'Nombre', 'Rol', 'Origen', 'Forzado'
];

function _apiRegistrarLog(d) {
  try {
    const hoja = obtenerOCrearHoja(CONFIG.ID_ARCHIVO_WEB, API_HOJA_LOG);
    if (hoja.getLastRow() === 0) {
      hoja.getRange(1, 1, 1, API_LOG_CABECERA.length).setValues([API_LOG_CABECERA]);
      formatearCabecera(hoja, API_LOG_CABECERA.length);
      hoja.setColumnWidth(2, 180);
      hoja.setColumnWidth(5, 320);
      hoja.setColumnWidth(6, 240);
    }
    hoja.getRange(hoja.getLastRow() + 1, 1, 1, API_LOG_CABECERA.length).setValues([[
      ahora(),
      d.agrupacion,
      d.estadoAnterior || '',
      d.estadoNuevo,
      d.motivo || '',
      d.usuario || '',
      d.nombre || '',
      d.rol || '',
      d.origen || 'plataforma',
      d.forzado ? 'SÍ' : ''
    ]]);
  } catch (e) {
    // Que falle el log NO puede hacer fallar el cambio de estado: la planilla
    // ya se escribió. Se avisa y se sigue.
    Logger.log(`⚠️ No pude escribir en "${API_HOJA_LOG}": ${e.message}`);
  }
}


// ============================================================
// 8. CONFIGURACIÓN Y DIAGNÓSTICO — correr a mano desde el editor
// ============================================================

// Genera un token nuevo y lo muestra en el log. Copialo a mano a
// Configuración del proyecto → Propiedades del script → API_TOKEN.
// No lo guarda solo a propósito: así queda claro que el token es una decisión
// tuya y no algo que el código se inventó.
function generarTokenAPI() {
  const bytes = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  Logger.log('Token nuevo (copialo a la propiedad API_TOKEN):\n\n' + bytes + '\n');
  Logger.log('Después acordate de actualizarlo también en app/fichas-estado.js (FICHAS_API.token).');
  return bytes;
}

// Chequea que esté todo cargado, sin imprimir ningún secreto.
function verificarConfiguracionAPI() {
  const p = PropertiesService.getScriptProperties();
  const req = ['API_TOKEN', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const faltan = req.filter(k => !p.getProperty(k));

  Logger.log('— Configuración de la API de fichas —');
  req.forEach(k => {
    const v = p.getProperty(k);
    Logger.log(`  ${k}: ${v ? '✓ cargado (' + v.length + ' caracteres)' : '✗ FALTA'}`);
  });
  Logger.log(`  ROLES_ESCRITURA: ${p.getProperty('ROLES_ESCRITURA') || '(default) ' + API_ROLES_ESCRITURA_DEFAULT}`);
  Logger.log(`  EXIGIR_JWT_LECTURA: ${p.getProperty('EXIGIR_JWT_LECTURA') || '(default) false'}`);
  Logger.log(`  CONFIG.SIMULACION: ${CONFIG.SIMULACION}${CONFIG.SIMULACION ? '  ⚠️ la API rechaza escrituras' : ''}`);

  const hoja = obtenerOCrearHoja(CONFIG.ID_ARCHIVO_WEB, CONFIG.HOJA_FICHAS);
  Logger.log(`  Hoja "${CONFIG.HOJA_FICHAS}": ${Math.max(0, hoja.getLastRow() - 1)} ficha(s)`);

  if (faltan.length) Logger.log(`\n⛔ Faltan: ${faltan.join(', ')}`);
  else Logger.log('\n✅ Todo listo. Publicá el Web App y probá con ?accion=ping&token=…');

  return { faltan: faltan };
}

// Prueba de humo sin pasar por HTTP: lee la tabla y muestra el resumen.
function probarLecturaAPI() {
  const r = _apiListarFichas();
  Logger.log(`${r.total} ficha(s) · ${JSON.stringify(r.resumen)}`);
  if (r.fichas.length) Logger.log('Primera: ' + JSON.stringify(r.fichas[0], null, 2));
  return r;
}
