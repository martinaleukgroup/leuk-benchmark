// ============================================================
// 07_Fotos.gs — Fotos de producto para el Generador de Liquidación
// ============================================================
// Vive en el proyecto Apps Script "Bot - Marketing Leuk", junto a 06_API.gs.
// Reusa de 06_API.gs: _prop, _apiJson, _apiError, _apiIdentificar, _apiPuedeEscribir.
//
// Qué hace:
//   1. indexarFotos() recorre las 3 carpetas de fotos del Drive y arma un índice
//      SKU → fotos PNG, respetando el ORDEN DE BÚSQUEDA acordado con Diseño:
//        1) carpeta de PNGs general
//        2) "Productos Leuk: Recursos Técnicos y Visuales"
//        3) "DISCONTINUADOS"
//      Regla de nombre: el PNG tiene que EMPEZAR con el SKU de 4 dígitos.
//      Extra para ventiladores Laftdren (sus fotos no llevan SKU): dentro de
//      DISCONTINUADOS / Laftdren Ventiladores / <modelo> se indexan por modelo.
//      El índice se guarda como un JSON en el Drive de la cuenta que ejecuta el
//      bot, y se regenera solo una vez por día (instalarDisparadorFotos).
//   2. El generador (liquidacion.html en Benchmark) pide por GET:
//        accion=fotosIndice&skus=6548,6378&modelos=361B   → qué fotos hay
//        accion=foto&id=<idDeDrive>                          → la imagen (base64)
//        accion=fotosReindexar                               → rehace el índice
//      Las tres piden token + sesión de Benchmark (JWT), siempre.
//
// Seguridad: "foto" SOLO entrega archivos que estén en el índice (fotos PNG de
// esas 3 carpetas). Aunque el token sea público, nadie puede pedir otro archivo
// del Drive por ID.
//
// Requisito: activar el servicio avanzado "Drive API" (v3) en el proyecto
// (Servicios → + → Drive API). Ver DESPLIEGUE-FOTOS.md.

const FOTOS_CARPETAS = [
  { clave: 'general',        id: '1OmHlMZ4sMK5890tNkRoeMoNZVgU15JLD', nombre: 'PNG general' },
  { clave: 'productos',      id: '1EeWcZw0jQDyfpOX_cLQWfxZhfin_aDT_', nombre: 'Productos Leuk: Recursos Técnicos y Visuales' },
  { clave: 'discontinuados', id: '1gf887MSYiWmrat9dQIXBpEYm0mgz_PZt', nombre: 'DISCONTINUADOS' },
];
const FOTOS_CARPETA_VENTILADORES = 'laftdren ventiladores';   // subcarpeta de DISCONTINUADOS
const FOTOS_MAX_POR_SKU = 4;                 // candidatas que se devuelven por SKU
const FOTOS_MAX_BYTES_DIRECTO = 4 * 1024 * 1024;   // más grande que esto → miniatura de Drive
const FOTOS_TAM_MINIATURA = 1600;            // px del lado mayor de la miniatura
const FOTOS_ARCHIVO_INDICE = 'indice_fotos_liquidacion.json';


// ------------------------------------------------------------
// Entrada desde doGet (06_API.gs)
// ------------------------------------------------------------
function _fotosGet(accion, p) {
  // Fotos = archivos del Drive: siempre exigimos sesión de Benchmark,
  // aunque EXIGIR_JWT_LECTURA esté en false.
  const ses = _apiIdentificar(p.jwt);
  if (ses.error) return _apiError(ses.error, ses.mensaje, 401);

  if (accion === 'fotosIndice')    return _apiJson(_fotosBuscar(p.skus, p.modelos));
  if (accion === 'foto')           return _fotosEntregar(String(p.id || ''));
  if (accion === 'fotosReindexar') {
    if (!_apiPuedeEscribir(ses.rol)) return _apiError('SIN_PERMISO', 'Tu rol no puede reindexar las fotos.', 403);
    const r = indexarFotos();
    return _apiJson({ ok: true, generado: r.generado, skus: r.totalSkus, modelos: r.totalModelos });
  }
  return _apiError('ACCION_DESCONOCIDA', 'Acciones de fotos: fotosIndice · foto · fotosReindexar.', 400);
}


// ------------------------------------------------------------
// Búsqueda
// ------------------------------------------------------------
function _fotosBuscar(skusTxt, modelosTxt) {
  const idx = _fotosLeerIndice();
  const skus = String(skusTxt || '').split(',').map(s => s.trim()).filter(s => /^\d{4}$/.test(s));
  const modelos = String(modelosTxt || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const fotos = {}, porModelo = {};
  skus.forEach(s => { if (idx.porSku[s]) fotos[s] = idx.porSku[s]; });
  modelos.forEach(m => { if (idx.porModelo[m]) porModelo[m] = idx.porModelo[m]; });
  return { ok: true, generado: idx.generado, fotos: fotos, modelos: porModelo,
           carpetas: FOTOS_CARPETAS.map(c => ({ clave: c.clave, nombre: c.nombre })) };
}

function _fotosEntregar(id) {
  if (!id) return _apiError('FALTA_ID', 'Falta el id de la foto.', 400);
  const idx = _fotosLeerIndice();
  if (!idx.ids[id]) return _apiError('FOTO_NO_PERMITIDA', 'Esa foto no está en las carpetas de fotos de producto.', 403);

  const bytes = idx.ids[id];
  let blob, origen = 'original';
  if (bytes > FOTOS_MAX_BYTES_DIRECTO) {
    blob = _fotosMiniatura(id);
    origen = 'miniatura';
  }
  if (!blob) { blob = DriveApp.getFileById(id).getBlob(); origen = 'original'; }

  return _apiJson({ ok: true, id: id, origen: origen,
                    mime: blob.getContentType() || 'image/png',
                    b64: Utilities.base64Encode(blob.getBytes()) });
}

// Miniatura grande que genera Drive (más liviana que un PNG de 5-10 MB).
function _fotosMiniatura(id) {
  try {
    const f = Drive.Files.get(id, { fields: 'thumbnailLink', supportsAllDrives: true });
    if (!f || !f.thumbnailLink) return null;
    const url = f.thumbnailLink.replace(/=s\d+$/, '') + '=s' + FOTOS_TAM_MINIATURA;
    const r = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    return r.getResponseCode() === 200 ? r.getBlob() : null;
  } catch (e) { return null; }
}


// ------------------------------------------------------------
// Índice
// ------------------------------------------------------------
function _fotosLeerIndice() {
  const id = _prop('FOTOS_INDICE_ID');
  if (id) {
    try { return JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString()); } catch (e) { }
  }
  return indexarFotos();   // primera vez (o si alguien borró el archivo)
}

// Correr a mano la primera vez, y después lo corre el disparador diario.
function indexarFotos() {
  const t0 = Date.now();
  const opc = { corpora: 'allDrives', includeItemsFromAllDrives: true, supportsAllDrives: true, pageSize: 1000 };

  // 1) Todas las carpetas visibles → mapa id → {nombre, padres}
  const carpetas = {};
  _fotosListar("mimeType = 'application/vnd.google-apps.folder' and trashed = false",
               'nextPageToken, files(id, name, parents)', opc)
    .forEach(f => { carpetas[f.id] = { n: f.name, p: f.parents || [] }; });

  // ¿A qué carpeta raíz pertenece? (la primera en el orden de búsqueda gana)
  const raiz = {}; FOTOS_CARPETAS.forEach((c, i) => { raiz[c.id] = i; });
  const memo = {};
  function rutaHastaRaiz(folderId, profundidad) {
    if (memo[folderId] !== undefined) return memo[folderId];
    if (raiz[folderId] !== undefined) return (memo[folderId] = { r: raiz[folderId], camino: [] });
    if (profundidad > 30 || !carpetas[folderId]) return (memo[folderId] = null);
    let mejor = null;
    carpetas[folderId].p.forEach(padre => {
      const res = rutaHastaRaiz(padre, profundidad + 1);
      if (res && (!mejor || res.r < mejor.r)) mejor = { r: res.r, camino: res.camino.concat([carpetas[folderId].n]) };
    });
    return (memo[folderId] = mejor);
  }

  // 2) Todos los PNG visibles; nos quedamos con los que caen dentro de las 3 carpetas
  const porSku = {}, porModelo = {}, ids = {};
  _fotosListar("mimeType = 'image/png' and trashed = false",
               'nextPageToken, files(id, name, parents, size)', opc)
    .forEach(f => {
      let ubic = null;
      (f.parents || []).forEach(padre => {
        const r = rutaHastaRaiz(padre, 0);
        if (r && (!ubic || r.r < ubic.r)) ubic = r;
      });
      if (!ubic) return;
      const nombre = String(f.name || '');
      if (/copia/i.test(nombre)) return;
      const bytes = Number(f.size || 0);
      const item = { id: f.id, n: nombre, c: FOTOS_CARPETAS[ubic.r].clave, o: ubic.r, k: _fotosRango(nombre), b: bytes };

      const m = nombre.match(/^(\d{4})/);
      if (m) {
        (porSku[m[1]] = porSku[m[1]] || []).push(item);
        ids[f.id] = bytes;
      } else if (FOTOS_CARPETAS[ubic.r].clave === 'discontinuados') {
        // Ventiladores Laftdren: .../Laftdren Ventiladores/<modelo>/archivo.png
        const cam = ubic.camino.map(s => String(s).toLowerCase().trim());
        const i = cam.indexOf(FOTOS_CARPETA_VENTILADORES);
        if (i >= 0 && cam.length > i + 1 && cam[i + 1].indexOf('sin tulipas') < 0) {
          const modelo = ubic.camino[i + 1].replace(/\s+/g, '').toUpperCase();
          item.k = _fotosRangoModelo(nombre, modelo);
          (porModelo[modelo] = porModelo[modelo] || []).push(item);
          ids[f.id] = bytes;
        }
      }
    });

  // 3) Ordenar: carpeta (orden de búsqueda) → tipo de nombre → nombre
  const orden = (a, b) => a.o - b.o || a.k - b.k || a.n.localeCompare(b.n);
  const recortar = obj => Object.keys(obj).forEach(k => {
    obj[k] = obj[k].sort(orden).slice(0, FOTOS_MAX_POR_SKU).map(x => ({ id: x.id, n: x.n, c: x.c }));
  });
  recortar(porSku); recortar(porModelo);
  // ids permitidos = sólo las candidatas que quedaron
  const permitidos = {};
  [porSku, porModelo].forEach(obj => Object.keys(obj).forEach(k => obj[k].forEach(x => { permitidos[x.id] = ids[x.id] || 0; })));

  const indice = { generado: new Date().toISOString(), porSku: porSku, porModelo: porModelo, ids: permitidos,
                   totalSkus: Object.keys(porSku).length, totalModelos: Object.keys(porModelo).length,
                   segundos: Math.round((Date.now() - t0) / 1000) };
  _fotosGuardarIndice(indice);
  console.log(`Índice de fotos: ${indice.totalSkus} SKU, ${indice.totalModelos} modelos de ventilador, ${indice.segundos}s`);
  return indice;
}

// FotoProducto0 < FotoProducto (sin número) < FotoProducto1… < "NNNN.png" < cualquier otro PNG
function _fotosRango(nombre) {
  const n = nombre.toLowerCase().replace(/\s+/g, '');
  const m = n.match(/^\d{4}fotoproducto(\d*)\.png$/);
  if (m) return m[1] === '' ? 0.5 : Number(m[1]);
  if (/^\d{4}\.png$/.test(n)) return 50;
  return 100;
}
// "361A.png" < "1 - 361a.png" < "2 - 361a.png" < resto
function _fotosRangoModelo(nombre, modelo) {
  const n = nombre.toLowerCase().replace(/\s+/g, '');
  if (n === modelo.toLowerCase() + '.png') return 0;
  const m = n.match(/^(\d+)-/);
  return m ? Number(m[1]) : 50;
}

function _fotosListar(q, fields, opc) {
  const out = []; let token = null;
  do {
    const r = Drive.Files.list(Object.assign({}, opc, { q: q, fields: fields, pageToken: token }));
    (r.files || []).forEach(f => out.push(f));
    token = r.nextPageToken;
  } while (token);
  return out;
}

function _fotosGuardarIndice(indice) {
  const txt = JSON.stringify(indice);
  const id = _prop('FOTOS_INDICE_ID');
  if (id) {
    try { DriveApp.getFileById(id).setContent(txt); return; } catch (e) { }
  }
  const f = DriveApp.createFile(FOTOS_ARCHIVO_INDICE, txt, MimeType.PLAIN_TEXT);
  PropertiesService.getScriptProperties().setProperty('FOTOS_INDICE_ID', f.getId());
}

// Correr UNA vez: rehace el índice todos los días a las 6 de la mañana.
function instalarDisparadorFotos() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'indexarFotos')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('indexarFotos').timeBased().everyDays(1).atHour(6).create();
  console.log('Listo: el índice de fotos se rehace todos los días a las 6.');
}

// Prueba rápida desde el editor.
function probarFotos() {
  const idx = indexarFotos();
  ['6548', '6378', '3784', '6031'].forEach(s => console.log(s, JSON.stringify(idx.porSku[s] || 'sin foto')));
  console.log('361B', JSON.stringify(idx.porModelo['361B'] || 'sin foto'));
}
