// ============================================================
// 02_FICHAS.gs — ESTADO DE LAS FICHAS TÉCNICAS
// ============================================================
// Requiere 00_Comun.gs en el mismo proyecto.
//
// QUÉ HACE, EN ORDEN:
//   1. Compara los 28 campos técnicos + 7 assets del Maestro contra BASE ÚNICA.
//   2. Donde difieren, sincroniza la web con el Maestro (el Maestro manda).
//   3. Agrupa por "Agrupación de fichas técnicas" — la ficha es del GRUPO,
//      no del SKU. Si cambia un dato de un SKU, el grupo entero va a actualizar.
//   4. Escribe la tabla de estados en la hoja "fichas técnicas".
//
// ESTADOS Y PRECEDENCIA:
//   Discontinuada  · todos los SKU del grupo están discontinuados
//   Solicitada     · el grupo nunca tuvo ficha (aparece por primera vez)
//   A actualizar   · cambió algún dato, o entró un SKU nuevo al grupo
//   Finalizada     · sin cambios desde la última vez
//
// EL ESTADO PERSISTE. Si un grupo quedó en "A actualizar", sigue así aunque
// la semana siguiente no haya cambios nuevos. Solo sale de ahí cuando alguien
// lo marca como listo desde la plataforma de marketing.
//
// TRIGGER SUGERIDO: miércoles 4 AM.
// ============================================================


const FICHAS_TABLA = {
  AGRUPACION: 1,
  SKUS: 2,
  CANTIDAD: 3,
  ESTADO: 4,
  CAMBIO: 5,
  DETECTADO: 6,
  // Quién la marcó desde la plataforma y cuándo. Las escribe 06_API.gs; acá
  // solo se conservan al reescribir la tabla. Si se agregan más columnas,
  // sumarlas a este objeto Y a `cab` en _escribirTablaFichas(), o se pierden
  // en el próximo hoja.clear().
  ACTUALIZADA_POR: 7,
  CUANDO: 8
};

// Lo que la plataforma de marketing puede escribir en la columna Estado.
// "Listo para publicar" se trata como Finalizada.
const ESTADOS_FINALIZADOS = ['FINALIZADA', 'LISTO PARA PUBLICAR'];


// ============================================================
// ENTRADA
// ============================================================
function actualizarFichasTecnicas() {
  return ejecutarProceso('Fichas técnicas', _correrFichas);
}

function probarFichasSinEscribir() {
  const original = CONFIG.SIMULACION;
  CONFIG.SIMULACION = true;
  try {
    return _correrFichas();
  } finally {
    CONFIG.SIMULACION = original;
  }
}


// ============================================================
// PROCESO
// ============================================================
function _correrFichas() {
  const PROC = 'Fichas técnicas';

  const maestro = leerMaestro(PROC);
  const base = leerBaseUnica(PROC);

  if (base.idx.agrupacionFichas === -1) {
    alertarError(PROC, 'No encontré la columna "Agrupación de fichas técnicas" en BASE ÚNICA. Sin eso no puedo agrupar.');
    return;
  }

  // ---------- DUPLICADOS ----------
  // Un SKU no debería estar en dos filas. Si pasa, nota + mail y se procesa
  // solo la primera fila, para no escribir dos veces el mismo producto.
  const duplicados = Object.keys(base.duplicados);
  if (duplicados.length > 0) {
    marcarDuplicados(base);
    _mailDuplicados(base);
  }
  const filaDuplicada = {};
  duplicados.forEach(sku => {
    base.duplicados[sku].slice(1).forEach(f => { filaDuplicada[f] = sku; });
  });

  // ---------- RECORRIDA POR PRODUCTO ----------
  const grupos = {};          // agrupación → { skus:[], cambios:[], discontinuados:n }
  const anomalias = [];
  const filasCambiadas = {};
  let productosConCambio = 0;

  for (let i = 1; i < base.datos.length; i++) {
    const fila = i + 1;
    const sku = normTexto(base.datos[i][base.idx.sku]);
    if (sku === '') continue;
    if (base.esLinea[fila]) continue;        // fila agrupadora de línea, no es un producto
    if (filaDuplicada[fila]) continue;       // ya se procesó la primera aparición

    const nombre = normTexto(base.datos[i][base.idx.nombre]) || SIN_DATO;
    const regMaestro = maestro.porSKU[sku];

    // La agrupación puede estar vacía en la web y cargada en el Maestro,
    // en la columna "Nombre Ficha Técnica". Si está, se completa sola.
    let agrupacion = normTexto(base.datos[i][base.idx.agrupacionFichas]);
    if (agrupacion === '' && regMaestro && regMaestro.agrupacion !== '') {
      agrupacion = regMaestro.agrupacion;
      base.datos[i][base.idx.agrupacionFichas] = agrupacion;
      filasCambiadas[i] = true;
    }

    if (agrupacion === '') {
      anomalias.push([sku, nombre, 'Sin agrupación en BASE ÚNICA ni en el Maestro ("Nombre Ficha Técnica"). No entra en la tabla.', ahora()]);
      continue;
    }

    if (!grupos[agrupacion]) {
      grupos[agrupacion] = { skus: [], cambios: [], discontinuados: 0 };
    }
    const g = grupos[agrupacion];
    g.skus.push(sku);

    const situacion = normCab(base.datos[i][base.idx.situacion]);
    if (situacion.indexOf('DISCONTINU') === 0) g.discontinuados++;

    if (!regMaestro) {
      anomalias.push([sku, nombre, 'Está en BASE ÚNICA pero no en el Maestro.', ahora()]);
      continue;
    }

    const cambios = [];

    // --- 28 campos técnicos ---
    MAPEO_TECNICO.forEach(map => {
      const idxW = base.idx[map.w];
      if (idxW === -1) return;
      const valorMaestro = regMaestro.tecnicos[map.w];
      if (!difieren(base.datos[i][idxW], valorMaestro)) return;

      base.datos[i][idxW] = valorMaestro;
      cambios.push(map.w);
      filasCambiadas[i] = true;
    });

    // --- 7 assets ---
    // Solo se completan los que faltan. Si ya hay un nombre cargado, se respeta:
    // puede ser un archivo con nombre distinto al patrón y no queremos pisarlo.
    const faltaAlgunAsset = ASSETS.some(a => {
      const ix = base.idx[a.clave];
      return ix !== -1 && faltaDato(base.datos[i][ix]);
    });

    if (faltaAlgunAsset) {
      const encontrados = buscarAssets(sku);
      ASSETS.forEach(a => {
        const ix = base.idx[a.clave];
        if (ix === -1) return;
        if (!faltaDato(base.datos[i][ix])) return;
        if (encontrados[a.clave] === SIN_DATO) return;

        base.datos[i][ix] = encontrados[a.clave];
        cambios.push(a.col);
        filasCambiadas[i] = true;
      });
    }

    // --- Situación: la manda el Maestro, no cuenta para la ficha ---
    // El bot viejo escribía "nuevo" y no lo sacaba nunca. Ahora se sincroniza
    // en cada corrida y queda excluido del cálculo de estado.
    if (base.idx.situacion !== -1 && situacion.indexOf('DISCONTINU') !== 0) {
      const deseada = maestroLoConsideraNuevo(regMaestro) ? 'nuevo' : 'activo';
      if (difieren(base.datos[i][base.idx.situacion], deseada)) {
        base.datos[i][base.idx.situacion] = deseada;
        filasCambiadas[i] = true;
      }
    }

    if (cambios.length > 0) {
      productosConCambio++;
      g.cambios.push({ sku: sku, campos: cambios });
    }
  }

  Logger.log(`🔍 ${Object.keys(grupos).length} grupo(s) · ${productosConCambio} producto(s) con cambios · ${anomalias.length} anomalías.`);

  // ---------- TABLA ANTERIOR ----------
  const hojaFichas = obtenerOCrearHoja(CONFIG.ID_ARCHIVO_WEB, CONFIG.HOJA_FICHAS);
  const anterior = _leerFichasAnterior(hojaFichas);
  const primeraCorrida = Object.keys(anterior).length === 0;

  if (primeraCorrida) {
    Logger.log('ℹ️ Primera corrida: los grupos con cambios quedan en "Solicitada" y el resto en "Finalizada".');
  }

  // ---------- ESTADO POR GRUPO ----------
  const filasTabla = [];
  const resumen = { Solicitada: 0, 'A actualizar': 0, Finalizada: 0, Discontinuada: 0 };

  Object.keys(grupos).sort().forEach(agrupacion => {
    const g = grupos[agrupacion];
    const prev = anterior[agrupacion];
    const skusOrdenados = g.skus.slice().sort();

    let estado, motivo;

    if (g.discontinuados === g.skus.length) {
      estado = ESTADO_FICHA.DISCONTINUADA;
      motivo = 'Todos los SKU del grupo están discontinuados';

    } else if (primeraCorrida) {
      // Arranque: lo que difería del Maestro queda pedido, lo demás cerrado.
      if (g.cambios.length > 0) {
        estado = ESTADO_FICHA.SOLICITADA;
        motivo = _resumirCambios(g.cambios);
      } else {
        estado = ESTADO_FICHA.FINALIZADA;
        motivo = '';
      }

    } else if (!prev) {
      estado = ESTADO_FICHA.SOLICITADA;
      motivo = 'Grupo nuevo, nunca tuvo ficha';

    } else {
      const skusNuevos = skusOrdenados.filter(s => prev.skus.indexOf(s) === -1);

      if (g.cambios.length > 0) {
        estado = ESTADO_FICHA.A_ACTUALIZAR;
        motivo = _resumirCambios(g.cambios);

      } else if (skusNuevos.length > 0) {
        estado = ESTADO_FICHA.A_ACTUALIZAR;
        motivo = `SKU nuevo en el grupo: ${skusNuevos.join(', ')}`;

      } else {
        // Sin novedades: se conserva el estado anterior tal cual.
        // Si estaba en "A actualizar", sigue ahí hasta que lo marquen listo.
        estado = _estadoConservado(prev.estado);
        motivo = estado === ESTADO_FICHA.FINALIZADA ? '' : prev.motivo;
      }
    }

    // Fecha de detección: solo se refresca cuando el estado cambia
    const detectado = (prev && prev.estado === estado && prev.detectado) ? prev.detectado : ahora();

    // Quién la actualizó por última vez desde la plataforma. NO se borra aunque
    // el bot vuelva a marcarla: sigue siendo cierto que esa persona la tocó ese
    // día, y sirve para leer "la cerró Martina el 20/08, pero el 27/08 cambió
    // la potencia otra vez". Las escribe 06_API.gs; acá solo se arrastran.
    const actualizadaPor = (prev && prev.actualizadaPor) ? prev.actualizadaPor : '';
    const cuando = (prev && prev.cuando) ? prev.cuando : '';

    resumen[estado] = (resumen[estado] || 0) + 1;
    filasTabla.push([
      agrupacion,
      skusOrdenados.join(', '),
      skusOrdenados.length,
      estado,
      motivo,
      detectado,
      actualizadaPor,
      cuando
    ]);
  });

  Logger.log(`📋 Estados: ${resumen['Solicitada']} solicitadas · ${resumen['A actualizar']} a actualizar · ${resumen['Finalizada']} finalizadas · ${resumen['Discontinuada']} discontinuadas.`);

  if (CONFIG.SIMULACION) {
    Logger.log('🧪 [SIMULACIÓN] No se escribió nada.');
    return { grupos: filasTabla.length, cambios: productosConCambio, anomalias: anomalias.length };
  }

  // ---------- ESCRITURA ----------
  const cuantasFilas = Object.keys(filasCambiadas).length;
  if (cuantasFilas > 0) {
    Object.keys(filasCambiadas).forEach(k => {
      const r = Number(k);
      base.hoja.getRange(r + 1, 1, 1, base.ultCol).setValues([base.datos[r]]);
    });
    Logger.log(`✏️ ${cuantasFilas} fila(s) sincronizadas en BASE ÚNICA.`);
  }

  _escribirTablaFichas(hojaFichas, filasTabla);

  if (anomalias.length > 0) _registrarAnomaliasFichas(anomalias);

  _mailFichas(resumen, productosConCambio, anomalias.length);

  return { grupos: filasTabla.length, cambios: productosConCambio, anomalias: anomalias.length };
}


// ============================================================
// LIMPIEZA DE COLORES — CORRER A MANO
// ============================================================
// Saca TODOS los fondos de color de BASE ÚNICA: el naranja de esta primera
// corrida y el rosa (nuevos) y verde (reingresos) que dejó el bot anterior.
// No toca los datos ni las notas, solo el color de fondo.
function limpiarColoresBaseUnica() {
  return ejecutarProceso('Limpieza de colores', function () {
    const hoja = abrirHoja(CONFIG.ID_ARCHIVO_WEB, CONFIG.HOJA_WEB, 'Limpieza de colores');
    const ultFila = hoja.getLastRow();
    const ultCol = hoja.getLastColumn();

    if (ultFila < 2) {
      Logger.log('La BASE ÚNICA está vacía. Nada que limpiar.');
      return;
    }

    if (CONFIG.SIMULACION) {
      Logger.log(`🧪 [SIMULACIÓN] Se limpiarían los fondos de ${ultFila - 1} fila(s).`);
      return;
    }

    // Se deja la cabecera como está y se blanquea el resto.
    hoja.getRange(2, 1, ultFila - 1, ultCol).setBackground(null);
    Logger.log(`🧹 Fondos limpiados en ${ultFila - 1} fila(s).`);
  });
}

// Traduce lo que haya en la columna Estado (incluido lo que escriba la
// plataforma de marketing) a uno de los cuatro estados canónicos.
function _estadoConservado(estadoPrevio) {
  const e = normCab(estadoPrevio);
  if (e === '') return ESTADO_FICHA.FINALIZADA;
  if (ESTADOS_FINALIZADOS.indexOf(e) !== -1) return ESTADO_FICHA.FINALIZADA;
  if (e === normCab(ESTADO_FICHA.SOLICITADA)) return ESTADO_FICHA.SOLICITADA;
  if (e === normCab(ESTADO_FICHA.DISCONTINUADA)) return ESTADO_FICHA.FINALIZADA;  // revivió
  return ESTADO_FICHA.A_ACTUALIZAR;
}

function _resumirCambios(cambios) {
  const campos = {};
  cambios.forEach(c => c.campos.forEach(f => { campos[f] = true; }));
  const lista = Object.keys(campos);
  const skus = cambios.map(c => c.sku).join(', ');
  const detalle = lista.length > 6
    ? `${lista.slice(0, 6).join(', ')} y ${lista.length - 6} más`
    : lista.join(', ');
  return `${detalle} (en ${skus})`;
}


// ============================================================
// TABLA ANTERIOR
// ============================================================
// OJO: lee hasta FICHAS_TABLA.CUANDO, no hasta DETECTADO. Todo lo que no se
// lea acá se pierde en el hoja.clear() de _escribirTablaFichas().
function _leerFichasAnterior(hoja) {
  const previo = {};
  const ultFila = hoja.getLastRow();
  if (ultFila < 2) return previo;

  // Una hoja vieja puede tener menos columnas de las que ahora leemos.
  const cols = Math.min(FICHAS_TABLA.CUANDO, hoja.getMaxColumns());
  const datos = hoja.getRange(2, 1, ultFila - 1, cols).getDisplayValues();
  const dato = (f, col) => (col <= cols ? normTexto(f[col - 1]) : '');

  datos.forEach(f => {
    const agrupacion = dato(f, FICHAS_TABLA.AGRUPACION);
    if (agrupacion === '') return;
    previo[agrupacion] = {
      skus: dato(f, FICHAS_TABLA.SKUS).split(',').map(s => s.trim()).filter(s => s !== ''),
      estado: dato(f, FICHAS_TABLA.ESTADO),
      motivo: dato(f, FICHAS_TABLA.CAMBIO),
      detectado: dato(f, FICHAS_TABLA.DETECTADO),
      actualizadaPor: dato(f, FICHAS_TABLA.ACTUALIZADA_POR),
      cuando: dato(f, FICHAS_TABLA.CUANDO)
    };
  });
  return previo;
}


// ============================================================
// ESCRITURA DE LA TABLA
// ============================================================
function _escribirTablaFichas(hoja, filas) {
  // La hoja puede tener menos columnas que la tabla (venía de una versión con
  // 6). Se agregan antes del clear para que setValues no se caiga.
  if (hoja.getMaxColumns() < FICHAS_TABLA.CUANDO) {
    hoja.insertColumnsAfter(hoja.getMaxColumns(), FICHAS_TABLA.CUANDO - hoja.getMaxColumns());
  }

  hoja.clear();

  const cab = ['Agrupación', 'SKUs del grupo', 'Cantidad', 'Estado', 'Qué cambió', 'Detectado',
               'Actualizada por', 'Cuándo'];
  hoja.getRange(1, 1, 1, cab.length).setValues([cab]);
  formatearCabecera(hoja, cab.length);

  if (filas.length === 0) {
    hoja.getRange(2, 1).setValue('Sin grupos para mostrar.');
    return;
  }

  hoja.getRange(2, 1, filas.length, cab.length).setValues(filas);

  // Color por estado, solo en la celda de Estado
  const colores = {};
  colores[ESTADO_FICHA.SOLICITADA] = '#f4cccc';
  colores[ESTADO_FICHA.A_ACTUALIZAR] = '#fff2cc';
  colores[ESTADO_FICHA.FINALIZADA] = '#d9ead3';
  colores[ESTADO_FICHA.DISCONTINUADA] = '#e0e0e0';
  colores['Listo para publicar'] = '#cfe2f3';   // lo escribe la plataforma

  const porColor = {};
  filas.forEach((f, i) => {
    const c = colores[f[FICHAS_TABLA.ESTADO - 1]];
    if (!c) return;
    (porColor[c] = porColor[c] || []).push(colLetra(FICHAS_TABLA.ESTADO) + (i + 2));
  });
  Object.keys(porColor).forEach(c => hoja.getRangeList(porColor[c]).setBackground(c));

  hoja.getRange(2, FICHAS_TABLA.CANTIDAD, filas.length, 1).setHorizontalAlignment('center');
  hoja.setColumnWidth(FICHAS_TABLA.AGRUPACION, 200);
  hoja.setColumnWidth(FICHAS_TABLA.SKUS, 260);
  hoja.setColumnWidth(FICHAS_TABLA.CAMBIO, 380);
  hoja.setColumnWidth(FICHAS_TABLA.DETECTADO, 130);
  hoja.setColumnWidth(FICHAS_TABLA.ACTUALIZADA_POR, 170);
  hoja.setColumnWidth(FICHAS_TABLA.CUANDO, 130);
}


// ============================================================
// ANOMALÍAS
// ============================================================
function _registrarAnomaliasFichas(filas) {
  const hoja = obtenerOCrearHoja(CONFIG.ID_ARCHIVO_WEB, CONFIG.HOJA_ANOMALIAS);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, 5).setValues([['Proceso', 'SKU', 'Nombre', 'Qué pasó', 'Detectado']]);
    formatearCabecera(hoja, 5);
  }
  const conProceso = filas.map(f => ['Fichas', f[0], f[1], f[2], f[3]]);
  hoja.getRange(hoja.getLastRow() + 1, 1, conProceso.length, 5).setValues(conProceso);
  Logger.log(`⚠️ ${filas.length} anomalía(s) de fichas registradas.`);
}


// ============================================================
// MAILS
// ============================================================
function _mailDuplicados(base) {
  const skus = Object.keys(base.duplicados);
  const filas = skus.map(sku =>
    `<tr>
      <td style="border:1px solid #ddd;padding:6px;font-family:monospace">${sku}</td>
      <td style="border:1px solid #ddd;padding:6px">${base.duplicados[sku].join(', ')}</td>
    </tr>`).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.5">
      <p>Hay <strong>${skus.length}</strong> SKU repetido(s) en la columna SKU de BASE ÚNICA.</p>
      <table style="border-collapse:collapse;font-size:13px;margin:14px 0">
        <tr style="background:#676B55;color:#fff">
          <th style="border:1px solid #ddd;padding:6px;text-align:left">SKU</th>
          <th style="border:1px solid #ddd;padding:6px;text-align:left">Filas</th>
        </tr>
        ${filas}
      </table>
      <p>El bot procesó solo la primera aparición de cada uno y dejó una nota en la celda del Nombre. No borró ninguna fila.</p>
    </div>`;

  enviarMail(CONFIG.EMAIL_ALERTAS, `⚠️ SKU duplicados en BASE ÚNICA — ${hoy()}`, html);
}

function _mailFichas(resumen, cambios, anomalias) {
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.ID_ARCHIVO_WEB}/edit`;

  const linea = (etiqueta, valor, color) =>
    `<tr>
      <td style="padding:6px 14px 6px 0;color:#555">${etiqueta}</td>
      <td style="padding:6px 0;font-weight:bold;font-size:16px;color:${color || '#333'}">${valor}</td>
    </tr>`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#333;line-height:1.5">
      <p>Estado de las fichas técnicas al <strong>${hoy()}</strong>.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        ${linea('Fichas solicitadas', resumen['Solicitada'] || 0, '#c0392b')}
        ${linea('Fichas a actualizar', resumen['A actualizar'] || 0, '#e67e22')}
        ${linea('Fichas finalizadas', resumen['Finalizada'] || 0, '#27ae60')}
        ${resumen['Discontinuada'] ? linea('Discontinuadas', resumen['Discontinuada']) : ''}
      </table>
      <p style="color:#555">${cambios} producto(s) con datos actualizados desde el Maestro esta semana.</p>
      ${anomalias > 0 ? `<p style="color:#f39c12">${anomalias} producto(s) sin agrupación o sin correspondencia en el Maestro. Están en la hoja "${CONFIG.HOJA_ANOMALIAS}".</p>` : ''}
      <p><a href="${url}" style="color:#676B55">Ver el detalle en la hoja "${CONFIG.HOJA_FICHAS}"</a></p>
    </div>`;

  enviarMail(CONFIG.EMAIL_ALERTAS, `Fichas técnicas — ${hoy()}`, html);
}
