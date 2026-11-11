'use strict';

/* Traductor de reuniones — lógica.
   Escucha con el reconocimiento de voz de Chrome, traduce con el traductor
   integrado de Chrome y guarda solo texto (nunca audio). */

// ---------- Ajustes ----------
const CLAVE_COPIA = 'traductorReuniones.copia'; // dónde se guarda la copia de seguridad
const GUARDAR_CADA_MS = 3000;                   // cada cuánto se guarda
const ESPERA_TRAD_PROVISIONAL_MS = 400;         // retardo antes de traducir el texto en gris
const ESPERA_COMPROBACION_MS = 8000;            // tope de espera al comprobar el traductor
const REINTENTOS_TRADUCTOR = 3;                 // reintentos si falla al preparar el traductor

// ---------- Elementos de la página ----------
const $ = (id) => document.getElementById(id);
const el = {
  btnEscuchar: $('btnEscuchar'),
  indicador: $('indicador'),
  indicadorTexto: $('indicadorTexto'),
  selOrigen: $('selOrigen'),
  selDestino: $('selDestino'),
  btnDescargar: $('btnDescargar'),
  btnBorrar: $('btnBorrar'),
  estadoTrad: $('estadoTraductor'),
  estadoTradTexto: $('estadoTraductorTexto'),
  barraProgreso: $('barraProgreso'),
  btnPrepararTraductor: $('btnPrepararTraductor'),
  mensaje: $('mensaje'),
  recuperar: $('recuperar'),
  recuperarTexto: $('recuperarTexto'),
  btnRecuperar: $('btnRecuperar'),
  btnDescartar: $('btnDescartar'),
  tituloOrigen: $('tituloOrigen'),
  tituloDestino: $('tituloDestino'),
  filas: $('filas'),
  textoPrueba: $('textoPrueba'),
  btnPrueba: $('btnPrueba'),
};

// ---------- Estado ----------
let segmentos = [];            // frases confirmadas: {id, hora, original, traduccion}
let inicioSesion = null;       // fecha y hora de la primera frase
let siguienteId = 1;
let hayCambios = false;        // hay algo sin guardar en la copia de seguridad
let copiaPendiente = null;     // copia antigua a la espera de Recuperar/Descartar

const filasPorId = new Map();  // id de frase -> su fila en pantalla
let filaProv = null;           // la fila gris (frase que aún se está diciendo)

let traductor = null;
let estadoTrad = 'comprobando'; // comprobando | descargable | descargando | listo | nodisp
let turnoTraductor = 0;
const cola = [];               // frases confirmadas a la espera de traducción
let procesandoCola = false;
let tempProv = null;
let traduciendoProv = false;

let rec = null;                // el reconocimiento de voz en marcha
let quiereEscuchar = false;    // true desde Iniciar hasta Parar
let ultimoArranque = 0;
let fallosSeguidos = 0;
let tempReinicio = null;

// ¿Es Google Chrome de verdad? Otros navegadores parecidos (por ejemplo el panel de
// navegador de la app de Claude) no dejan usar el micrófono ni traen el traductor.
const esChromeDeVerdad = !!(navigator.userAgentData
  && navigator.userAgentData.brands.some((m) => m.brand === 'Google Chrome'));
const AVISO_NO_ES_CHROME =
  `Esta página no está abierta en Google Chrome, y aquí el micrófono no funciona. Abre el programa Google Chrome y escribe ${location.origin} en su barra de direcciones.`;

// ---------- Utilidades ----------
const dos = (n) => String(n).padStart(2, '0');
const nombreOrigen = () => el.selOrigen.selectedOptions[0].textContent.trim();
const nombreDestino = () => el.selDestino.selectedOptions[0].textContent.trim();
const codigoOrigen = () => el.selOrigen.value.split('-')[0];

function fechaTexto(d) {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}
function horaTexto(d) {
  return `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
}

function mostrarMensaje(texto) {
  el.mensaje.textContent = texto;
  el.mensaje.hidden = false;
}
function ocultarMensaje() {
  el.mensaje.hidden = true;
}

function actualizarControles() {
  const bloqueado = !!copiaPendiente;
  el.btnEscuchar.disabled = bloqueado;
  el.btnPrueba.disabled = bloqueado;
  el.btnDescargar.disabled = segmentos.length === 0;
  el.btnBorrar.disabled = segmentos.length === 0;
  el.selOrigen.disabled = quiereEscuchar;
  el.selDestino.disabled = quiereEscuchar;
  el.tituloOrigen.textContent = `Original · ${nombreOrigen()}`;
  el.tituloDestino.textContent = `Traducción · ${nombreDestino()}`;
}

// ---------- Filas en pantalla ----------

// Ejecuta un cambio en pantalla y, si estábamos viendo lo último, sigue abajo.
// Si has subido a releer algo, no te mueve.
function conScroll(cambio) {
  const c = el.filas;
  const pegadoAbajo = c.scrollHeight - c.scrollTop - c.clientHeight < 120;
  cambio();
  if (pegadoAbajo) c.scrollTop = c.scrollHeight;
}

function crearFila() {
  const fila = document.createElement('div');
  fila.className = 'fila';
  const orig = document.createElement('div');
  orig.className = 'orig provisional';
  const trad = document.createElement('div');
  trad.className = 'trad provisional';
  fila.append(orig, trad);
  el.filas.append(fila);
  return { el: fila, orig, trad, texto: '', seg: null, tradFinal: false };
}

// Texto provisional (gris): se va corrigiendo solo mientras se habla.
function mostrarProvisional(texto) {
  texto = texto.trim();
  if (!texto) {
    if (filaProv) {
      filaProv.el.remove();
      filaProv = null;
    }
    return;
  }
  conScroll(() => {
    if (!filaProv) filaProv = crearFila();
    filaProv.texto = texto;
    filaProv.orig.textContent = texto;
  });
  programarTradProvisional();
}

// Frase confirmada (negro): se guarda y se manda a traducir.
function confirmarFrase(texto) {
  texto = (texto || '').trim();
  if (!texto) return;
  const seg = { id: siguienteId++, hora: new Date().toISOString(), original: texto, traduccion: null };
  if (!inicioSesion) inicioSesion = seg.hora;
  segmentos.push(seg);
  hayCambios = true;
  conScroll(() => {
    const fila = filaProv || crearFila();
    filaProv = null;
    pintarOriginalFinal(fila, seg);
  });
  if (estadoTrad === 'nodisp') {
    pintarTraduccionFinal(seg, null);
  } else {
    cola.push(seg);
    procesarCola();
  }
  actualizarControles();
}

function pintarOriginalFinal(fila, seg) {
  fila.seg = seg;
  fila.texto = seg.original;
  fila.orig.textContent = seg.original;
  fila.orig.classList.remove('provisional');
  if (!fila.trad.textContent) fila.trad.textContent = '…';
  filasPorId.set(seg.id, fila);
}

function pintarTraduccionFinal(seg, texto) {
  const fila = filasPorId.get(seg.id);
  if (!fila) return;
  conScroll(() => {
    fila.tradFinal = true;
    fila.trad.textContent = texto ?? '—';
    fila.trad.classList.remove('provisional');
    fila.trad.classList.toggle('fallo', texto == null);
  });
}

// Vuelve a dibujar todo (al recuperar una copia de seguridad).
function pintarTodo() {
  el.filas.textContent = '';
  filasPorId.clear();
  filaProv = null;
  for (const seg of segmentos) {
    const fila = crearFila();
    pintarOriginalFinal(fila, seg);
    if (seg.traduccion != null) pintarTraduccionFinal(seg, seg.traduccion);
  }
  el.filas.scrollTop = el.filas.scrollHeight;
}

// ---------- Traducción (Translator API de Chrome) ----------

function pintarEstadoTraductor(estado, texto, progreso = null, boton = null) {
  estadoTrad = estado;
  el.estadoTrad.dataset.estado = estado;
  el.estadoTradTexto.textContent = texto;
  el.barraProgreso.hidden = progreso == null;
  if (progreso != null) el.barraProgreso.value = progreso;
  if (estado === 'descargable') boton = 'Descargar traductor';
  el.btnPrepararTraductor.hidden = !boton;
  if (boton) el.btnPrepararTraductor.textContent = boton;
}

// Sin traducción: la app sigue funcionando en modo solo transcripción.
// Si el fallo puede ser pasajero, se deja un botón para volver a intentarlo.
function sinTraductor(motivo, reintentable = false) {
  pintarEstadoTraductor('nodisp', `${motivo} Modo solo transcripción.`, null, reintentable ? 'Reintentar' : null);
  cola.length = 0;
  for (const seg of segmentos) {
    if (seg.traduccion == null) pintarTraduccionFinal(seg, null);
  }
}

// Comprueba si Chrome puede traducir el par de idiomas elegido y lo deja listo.
// Si hay que descargar el modelo, Chrome exige que sea tras un clic del usuario.
async function prepararTraductor(intento = 0) {
  const turno = ++turnoTraductor;
  const origen = codigoOrigen();
  const destino = el.selDestino.value;
  const par = `${nombreOrigen()} → ${nombreDestino()}`;

  if (traductor) {
    try { traductor.destroy(); } catch { /* da igual */ }
    traductor = null;
  }

  if (!('Translator' in self)) {
    return sinTraductor('Este navegador no trae traductor integrado (hace falta Chrome 138 o superior en ordenador).');
  }
  if (origen === destino) {
    return sinTraductor('El idioma de origen y el de destino son el mismo.');
  }

  pintarEstadoTraductor('comprobando', `Comprobando el traductor ${par}…`);
  let disponibilidad;
  try {
    // Si Chrome no contesta en unos segundos, se sigue sin traducción en vez de quedarse esperando.
    disponibilidad = await Promise.race([
      Translator.availability({ sourceLanguage: origen, targetLanguage: destino }),
      new Promise((resolver) => setTimeout(() => resolver('sin-respuesta'), ESPERA_COMPROBACION_MS)),
    ]);
  } catch (e) {
    console.warn('No se pudo comprobar el traductor:', e);
    disponibilidad = 'unavailable';
  }
  if (turno !== turnoTraductor) return;
  if (disponibilidad === 'sin-respuesta') {
    return sinTraductor('El traductor integrado de este navegador no responde.', true);
  }
  if (disponibilidad === 'unavailable') {
    return sinTraductor(`Chrome no ofrece traducción ${par} en este equipo.`);
  }

  const hayQueDescargar = disponibilidad !== 'available';
  const textoDescargable = `El traductor ${par} hay que descargarlo una vez. Pulsa el botón (o Iniciar).`;
  if (hayQueDescargar && !(navigator.userActivation && navigator.userActivation.isActive)) {
    return pintarEstadoTraductor('descargable', textoDescargable);
  }

  if (hayQueDescargar) pintarEstadoTraductor('descargando', `Descargando el traductor ${par}… 0 %`, 0);
  else pintarEstadoTraductor('descargando', `Preparando el traductor ${par}…`);

  try {
    const nuevo = await Translator.create({
      sourceLanguage: origen,
      targetLanguage: destino,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          if (turno !== turnoTraductor || !hayQueDescargar) return;
          const parte = Math.max(0, Math.min(1, e.loaded / (e.total || 1)));
          pintarEstadoTraductor('descargando', `Descargando el traductor ${par}… ${Math.round(parte * 100)} %`, parte);
        });
      },
    });
    if (turno !== turnoTraductor) {
      nuevo.destroy();
      return;
    }
    traductor = nuevo;
    pintarEstadoTraductor('listo', `Traductor ${par} listo.`);
    traducirPendientes();
  } catch (e) {
    if (turno !== turnoTraductor) return;
    console.warn('No se pudo preparar el traductor:', e);
    if (e && e.name === 'NotAllowedError') {
      pintarEstadoTraductor('descargable', textoDescargable);
    } else if (intento < REINTENTOS_TRADUCTOR) {
      // Visto en pruebas: la primera vez, Chrome puede dar error mientras termina
      // de instalar el paquete de idioma y funcionar bien unos segundos después.
      pintarEstadoTraductor('descargando', `Preparando el traductor ${par}… (reintento ${intento + 1})`);
      setTimeout(() => {
        if (turno === turnoTraductor) prepararTraductor(intento + 1);
      }, 3000);
    } else {
      sinTraductor(`No se ha podido preparar el traductor ${par}.`, true);
    }
  }
}

function traducirPendientes() {
  for (const seg of segmentos) {
    if (seg.traduccion == null && !cola.includes(seg)) cola.push(seg);
  }
  procesarCola();
}

// Traduce las frases confirmadas de una en una, por orden.
async function procesarCola() {
  if (procesandoCola || !traductor) return;
  procesandoCola = true;
  while (cola.length && traductor) {
    const seg = cola.shift();
    let texto = null;
    try {
      texto = await traductor.translate(seg.original);
    } catch (e) {
      console.warn('Fallo al traducir una frase:', e);
    }
    if (!segmentos.includes(seg)) continue; // se borró mientras tanto
    if (texto != null) {
      seg.traduccion = texto;
      hayCambios = true;
    }
    pintarTraduccionFinal(seg, texto);
  }
  procesandoCola = false;
}

// Traducción del texto gris: se espera un poco y se traduce lo último que haya.
// Si el traductor está ocupado con frases confirmadas, estas tienen prioridad.
function programarTradProvisional() {
  if (tempProv || !traductor) return;
  tempProv = setTimeout(traducirProvisional, ESPERA_TRAD_PROVISIONAL_MS);
}

async function traducirProvisional() {
  tempProv = null;
  const fila = filaProv;
  if (!fila || !traductor || traduciendoProv) return;
  if (procesandoCola) return programarTradProvisional();
  const texto = fila.texto;
  traduciendoProv = true;
  let resultado = null;
  try {
    resultado = await traductor.translate(texto);
  } catch { /* la provisional puede fallar sin consecuencias */ }
  traduciendoProv = false;
  if (resultado != null && fila.el.isConnected && !fila.tradFinal) {
    conScroll(() => { fila.trad.textContent = resultado; });
  }
  if (filaProv && (filaProv !== fila || fila.texto !== texto)) programarTradProvisional();
}

// ---------- Escucha (Web Speech API de Chrome) ----------

function pintarEscucha(estado) {
  el.indicador.dataset.estado = estado;
  el.indicadorTexto.textContent =
    estado === 'escuchando' ? 'Escuchando' : estado === 'reconectando' ? 'Reconectando…' : 'Parado';
  el.btnEscuchar.textContent = quiereEscuchar ? 'Parar' : 'Iniciar';
  el.btnEscuchar.classList.toggle('activo', quiereEscuchar);
  actualizarControles();
}

function iniciarEscucha() {
  const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Reconocimiento) {
    mostrarMensaje('Este navegador no tiene reconocimiento de voz. Usa Google Chrome.');
    return;
  }
  ocultarMensaje();
  quiereEscuchar = true;
  fallosSeguidos = 0;
  pintarEscucha('reconectando');
  arrancarReconocimiento();
  if (estadoTrad === 'descargable') prepararTraductor();
}

function pararEscucha() {
  quiereEscuchar = false;
  clearTimeout(tempReinicio);
  if (rec) {
    try { rec.stop(); } catch { /* ya estaba parado */ }
  }
  pintarEscucha('parado');
}

// Detiene la escucha por un problema que no se arregla reintentando.
function pararPorError(texto) {
  mostrarMensaje(texto);
  pararEscucha();
}

function arrancarReconocimiento() {
  const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
  const este = new Reconocimiento();
  rec = este;
  este.lang = el.selOrigen.value;
  este.continuous = true;
  este.interimResults = true;
  este.maxAlternatives = 1;

  este.onstart = () => {
    if (rec === este && quiereEscuchar) pintarEscucha('escuchando');
  };

  este.onresult = (e) => {
    if (rec !== este) return;
    let provisional = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) confirmarFrase(r[0].transcript);
      else provisional += r[0].transcript;
    }
    mostrarProvisional(provisional);
  };

  este.onerror = (e) => {
    if (rec !== este) return;
    switch (e.error) {
      case 'no-speech': // silencio: Chrome corta y se reinicia solo más abajo
      case 'aborted':
        break;
      case 'not-allowed':
      case 'service-not-allowed':
        pararPorError(esChromeDeVerdad
          ? 'Chrome no tiene permiso para usar el micrófono. En la barra de direcciones, pulsa el icono que hay justo a la izquierda de «localhost:8000», activa «Micrófono» y vuelve a pulsar Iniciar.'
          : AVISO_NO_ES_CHROME);
        break;
      case 'audio-capture':
        pararPorError('No se encuentra ningún micrófono. Conecta uno y vuelve a pulsar Iniciar.');
        break;
      case 'language-not-supported':
        pararPorError(`El reconocimiento de voz no admite el idioma ${nombreOrigen()}.`);
        break;
      case 'network':
        mostrarMensaje('No hay conexión con el servicio de reconocimiento de voz de Google. Reintentando…');
        break;
      default:
        mostrarMensaje(`Problema con el reconocimiento de voz (${e.error}). Reintentando…`);
    }
  };

  // Chrome corta tras un silencio o cada cierto tiempo: se vuelve a arrancar
  // mientras no se haya pulsado Parar. El texto ya capturado no se toca.
  este.onend = () => {
    if (rec !== este) return;
    if (filaProv) confirmarFrase(filaProv.texto); // lo que quedó en gris no se pierde
    if (!quiereEscuchar) {
      pintarEscucha('parado');
      return;
    }
    pintarEscucha('reconectando');
    const duracion = Date.now() - ultimoArranque;
    fallosSeguidos = duracion < 2000 ? fallosSeguidos + 1 : 0;
    const espera = Math.min(250 * 2 ** fallosSeguidos, 5000); // si falla seguido, espera más
    tempReinicio = setTimeout(() => {
      if (quiereEscuchar) arrancarReconocimiento();
    }, espera);
  };

  ultimoArranque = Date.now();
  try {
    este.start();
    if (fallosSeguidos === 0) ocultarMensaje();
  } catch (e) {
    console.warn('No se pudo arrancar el reconocimiento:', e);
    pararPorError('No se ha podido arrancar el reconocimiento de voz. Vuelve a pulsar Iniciar.');
  }
}

// ---------- Copia de seguridad (localStorage) ----------

function guardarCopia() {
  if (!hayCambios || copiaPendiente) return;
  try {
    if (segmentos.length) {
      localStorage.setItem(CLAVE_COPIA, JSON.stringify({
        inicio: inicioSesion,
        origen: el.selOrigen.value,
        destino: el.selDestino.value,
        segmentos,
      }));
    } else {
      localStorage.removeItem(CLAVE_COPIA);
    }
    hayCambios = false;
  } catch (e) {
    console.warn('No se pudo guardar la copia de seguridad:', e);
    mostrarMensaje('No se ha podido guardar la copia de seguridad. Descarga el .md para no perder nada.');
  }
}

function ofrecerRecuperacion() {
  let copia = null;
  try {
    copia = JSON.parse(localStorage.getItem(CLAVE_COPIA));
  } catch { /* copia ilegible: se ignora */ }
  if (!copia || !Array.isArray(copia.segmentos) || copia.segmentos.length === 0) return;
  copiaPendiente = copia;
  const cuando = copia.inicio ? fechaTexto(new Date(copia.inicio)) : 'fecha desconocida';
  const n = copia.segmentos.length;
  el.recuperarTexto.textContent =
    `Hay una transcripción guardada del ${cuando} con ${n} ${n === 1 ? 'frase' : 'frases'}. ¿Quieres recuperarla?`;
  el.recuperar.hidden = false;
}

function recuperarCopia() {
  const copia = copiaPendiente;
  if (!copia) return;
  copiaPendiente = null;
  el.recuperar.hidden = true;
  segmentos = copia.segmentos
    .filter((s) => s && typeof s.original === 'string')
    .map((s, i) => ({
      id: i + 1,
      hora: s.hora || copia.inicio || new Date().toISOString(),
      original: s.original,
      traduccion: typeof s.traduccion === 'string' ? s.traduccion : null,
    }));
  siguienteId = segmentos.length + 1;
  inicioSesion = copia.inicio || (segmentos[0] && segmentos[0].hora) || null;
  if ([...el.selOrigen.options].some((o) => o.value === copia.origen)) el.selOrigen.value = copia.origen;
  if ([...el.selDestino.options].some((o) => o.value === copia.destino)) el.selDestino.value = copia.destino;
  cola.length = 0;
  pintarTodo();
  actualizarControles();
  prepararTraductor();
}

function descartarCopia() {
  if (!confirm('Se borrará la transcripción guardada y no se podrá recuperar. ¿Continuar?')) return;
  copiaPendiente = null;
  el.recuperar.hidden = true;
  localStorage.removeItem(CLAVE_COPIA);
  actualizarControles();
}

function borrarTodo() {
  if (!confirm('Se borrará toda la transcripción de la pantalla y su copia de seguridad. ¿Continuar?')) return;
  segmentos = [];
  inicioSesion = null;
  siguienteId = 1;
  cola.length = 0;
  filasPorId.clear();
  filaProv = null;
  el.filas.textContent = '';
  localStorage.removeItem(CLAVE_COPIA);
  hayCambios = false;
  actualizarControles();
}

// ---------- Descarga en Markdown ----------

function construirMarkdown() {
  const inicio = new Date(inicioSesion || Date.now());
  const lineas = [
    '# Transcripción de reunión',
    '',
    `- **Fecha y hora:** ${fechaTexto(inicio)}`,
    `- **Idiomas:** ${nombreOrigen()} (${el.selOrigen.value}) → ${nombreDestino()} (${el.selDestino.value})`,
    `- **Frases:** ${segmentos.length}`,
    '',
    '---',
    '',
  ];
  segmentos.forEach((s, i) => {
    lineas.push(
      `### ${i + 1} · ${horaTexto(new Date(s.hora))}`,
      '',
      `**Original:** ${s.original}`,
      '',
      `**Traducción:** ${s.traduccion ?? '_(sin traducción)_'}`,
      '',
    );
  });
  return lineas.join('\n');
}

function nombreArchivo() {
  const d = new Date(inicioSesion || Date.now());
  return `reunion_${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}_${dos(d.getHours())}-${dos(d.getMinutes())}.md`;
}

function descargarMarkdown() {
  if (!segmentos.length) return;
  const url = URL.createObjectURL(new Blob([construirMarkdown()], { type: 'text/markdown;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo();
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------- Modo de prueba ----------

// Parte el texto pegado en frases y las mete por el mismo camino que las del micrófono.
function probarTexto() {
  const texto = el.textoPrueba.value.trim();
  if (!texto) return;
  if (estadoTrad === 'descargable') prepararTraductor();
  const separador = new Intl.Segmenter(codigoOrigen(), { granularity: 'sentence' });
  for (const linea of texto.split(/\n+/)) {
    for (const trozo of separador.segment(linea)) confirmarFrase(trozo.segment);
  }
  el.filas.scrollTop = el.filas.scrollHeight;
}

// ---------- Arranque ----------

el.btnEscuchar.addEventListener('click', () => (quiereEscuchar ? pararEscucha() : iniciarEscucha()));
el.btnPrepararTraductor.addEventListener('click', () => prepararTraductor());
el.selOrigen.addEventListener('change', () => { actualizarControles(); prepararTraductor(); });
el.selDestino.addEventListener('change', () => { actualizarControles(); prepararTraductor(); });
el.btnDescargar.addEventListener('click', descargarMarkdown);
el.btnBorrar.addEventListener('click', borrarTodo);
el.btnRecuperar.addEventListener('click', recuperarCopia);
el.btnDescartar.addEventListener('click', descartarCopia);
el.btnPrueba.addEventListener('click', probarTexto);

setInterval(guardarCopia, GUARDAR_CADA_MS);
window.addEventListener('pagehide', guardarCopia);

if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
  mostrarMensaje('Este navegador no tiene reconocimiento de voz: solo funcionará el modo de prueba. Usa Google Chrome.');
} else if (!esChromeDeVerdad) {
  mostrarMensaje(AVISO_NO_ES_CHROME);
}
ofrecerRecuperacion();
actualizarControles();
prepararTraductor();
