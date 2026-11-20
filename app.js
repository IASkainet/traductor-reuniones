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
const CLAVE_MODELO = 'traductorReuniones.modelo.'; // recuerda qué traductores ya se descargaron
const LIMITE_TRAD_PROVISIONAL_MS = 700;         // si el traductor del móvil tarda más, no traduce el gris
const MOSTRAR_REANUDANDO_MS = 1500;  // un corte más breve no se enseña (en Android hay uno tras cada frase)
const ATASCADO_MS = 20000;           // tanto tiempo sin conseguir escuchar -> aviso grande con pitido
const SILENCIAR_ATASCADO_MS = 60000; // tras «Seguir intentándolo», no vuelve a avisar en este tiempo
const ESPERA_RED_MS = 30000;         // tiempo reintentando sin conexión antes de parar
const FALLOS_MICRO_MAX = 3;          // «micrófono no disponible» seguidos antes de parar
const SIN_NOTICIAS_MS = 90000;       // escuchando sin ninguna señal del reconocimiento -> se reinicia
const VENTANA_REPETIDA_MS = 10000;   // una frase igual a la anterior dentro de este tiempo es un duplicado
const LARGO_MIN_REPETIDA = 12;       // las frases muy cortas («oui») no se descartan nunca

// Pares de idiomas con traductor para usar dentro del dispositivo (modelos Opus-MT).
const MODELOS_DISPONIBLES = [
  'fr-es', 'fr-en', 'fr-de', 'en-es', 'en-fr', 'en-de', 'en-it', 'de-es', 'de-en',
  'de-fr', 'it-es', 'it-en', 'it-fr', 'es-en', 'es-fr', 'es-de', 'es-it',
];

// En Android el reconocimiento de voz de Chrome se comporta distinto y hay que tratarlo aparte.
const esAndroid = /Android/i.test(navigator.userAgent);

// ---------- Elementos de la página ----------
const $ = (id) => document.getElementById(id);
const el = {
  btnEscuchar: $('btnEscuchar'),
  indicador: $('indicador'),
  indicadorTexto: $('indicadorTexto'),
  txtIdiomasActuales: $('txtIdiomasActuales'),
  btnInvertir: $('btnInvertir'),
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
  dlgPrueba: $('dlgPrueba'),
};

// ---------- Estado ----------
let reunion = null;            // la reunión en curso: { modo, origen, destino, inicio, fin, vozAnterior, interlocutores, activo }
let segmentos = [];            // frases confirmadas: {id, hora, original, traduccion, origen, destino, interlocutor}
let pantalla = 'inicio';       // la pantalla que se ve: inicio | reunion | revision
let siguienteId = 1;
let hayCambios = false;        // hay algo sin guardar en la copia de seguridad
let copiaPendiente = null;     // copia antigua a la espera de Recuperar/Descartar

const filasPorId = new Map();  // id de frase -> su fila en pantalla
let filaProv = null;           // la fila gris (frase que aún se está diciendo)

let traductor = null;
let parTraductor = null;       // { origen, destino } del traductor cargado
let estadoTrad = 'comprobando'; // comprobando | descargable | descargando | listo | nodisp
let turnoTraductor = 0;
const cola = [];               // frases confirmadas a la espera de traducción
let procesandoCola = false;
let tempProv = null;
let traduciendoProv = false;

let rec = null;                // el reconocimiento de voz en marcha
let quiereEscuchar = false;    // true desde Iniciar hasta Parar
let estadoEscucha = 'parado';  // parado | arrancando | escuchando | reanudando | cortado
let sinEscucharDesde = null;   // desde cuándo quiere escuchar pero no lo consigue
let ultimoArranque = 0;
let ultimoEvento = 0;          // última señal de vida del reconocimiento
let fallosSeguidos = 0;
let fallosMicro = 0;           // «micrófono no disponible» seguidos
let inicioErrorRed = null;     // desde cuándo falla la conexión
let tempReinicio = null;
let esperaVolver = false;      // la escucha se cortó con la página oculta: se reanuda al volver
let ocultoDesde = null;
let corte = null;              // último corte pendiente de reanudar: { t, motivo }
let inicioEscucha = null;      // para el resumen del registro
let reconexionesNormales = 0;
let cortesConIncidencia = 0;
let alarmaSilenciadaHasta = 0;
let mensajeDeEscucha = false;  // la franja roja la ha puesto la escucha
let ultimaFrase = { norm: '', t: 0 }; // para descartar duplicados al reanudar
let bloqueoPantalla = null;    // mantiene la pantalla encendida mientras se escucha
let pidiendoBloqueo = false;
let avisadoSinBloqueo = false;

// ¿Es Google Chrome de verdad? Otros navegadores parecidos (por ejemplo el panel de
// navegador de la app de Claude) no dejan usar el micrófono ni traen el traductor.
const esChromeDeVerdad = !!(navigator.userAgentData
  && navigator.userAgentData.brands.some((m) => m.brand === 'Google Chrome'));
const AVISO_NO_ES_CHROME =
  `Esta página no está abierta en Google Chrome, y aquí el micrófono no funciona. Abre el programa Google Chrome y escribe ${location.origin} en su barra de direcciones.`;

// ---------- Utilidades ----------
const dos = (n) => String(n).padStart(2, '0');
// Modo e idiomas de la reunión en curso (las tablas de idiomas están en inicio.js).
const esTraduccion = () => !!reunion && reunion.modo === 'traduccion';
const nombreOrigen = () => nombreVoz(reunion.origen);
const nombreDestino = () => nombreCodigo(reunion.destino);
const codigoOrigen = () => reunion.origen.split('-')[0];

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
  // Mientras haya una reunión guardada sin decidir (Recuperar / Descartar) no se empieza otra.
  for (const b of document.querySelectorAll('.btn-modo')) b.disabled = !!copiaPendiente;
  if (!reunion) return;
  document.body.dataset.modo = reunion.modo;
  if (esTraduccion()) {
    el.txtIdiomasActuales.textContent = `${nombreOrigen()} → ${nombreDestino()}`;
    el.tituloOrigen.textContent = `Original · ${nombreOrigen()}`;
    el.tituloDestino.textContent = `Traducción · ${nombreDestino()}`;
  } else {
    el.txtIdiomasActuales.textContent = `${nombreOrigen()} · sin traducción`;
    el.tituloOrigen.textContent = `Transcripción · ${nombreOrigen()}`;
  }
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

// Cada fila tiene dos celdas (original y traducción), y en cada una el nombre de quien habla.
function crearFila() {
  const fila = document.createElement('div');
  fila.className = 'fila';
  const celdas = ['orig', 'trad'].map((tipo) => {
    const celda = document.createElement('div');
    celda.className = `celda celda-${tipo}`;
    const quien = document.createElement('span');
    quien.className = 'quien';
    const texto = document.createElement('div');
    texto.className = `${tipo} provisional`;
    celda.append(quien, texto);
    fila.append(celda);
    return { quien, texto };
  });
  el.filas.append(fila);
  const nueva = {
    el: fila, orig: celdas[0].texto, trad: celdas[1].texto, quien: [celdas[0].quien, celdas[1].quien],
    texto: '', seg: null, tradFinal: false,
  };
  pintarQuien(nueva, reunion ? reunion.activo : null); // en interlocutores.js
  return nueva;
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
  hayCambios = true;
  programarTradProvisional();
}

const normalizar = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Al reanudar, Chrome (sobre todo en Android) a veces vuelve a mandar la última frase.
// Se descarta si es idéntica a la anterior y llega enseguida; las frases cortas nunca.
function esRepetida(texto) {
  const norm = normalizar(texto);
  const repetida = norm.length >= LARGO_MIN_REPETIDA && norm === ultimaFrase.norm
    && Date.now() - ultimaFrase.t < VENTANA_REPETIDA_MS;
  ultimaFrase = { norm, t: Date.now() };
  return repetida;
}

// Frase confirmada (negro): se guarda y se manda a traducir.
// comprobarRepetida = false en el modo de prueba (ahí se pega texto a mano).
function confirmarFrase(texto, comprobarRepetida = true) {
  texto = (texto || '').trim();
  if (!texto) return;
  if (comprobarRepetida && esRepetida(texto)) {
    registrar('Frase repetida descartada al reanudar.');
    if (filaProv) {
      filaProv.el.remove();
      filaProv = null;
    }
    return;
  }
  const seg = {
    id: siguienteId++,
    hora: new Date().toISOString(),
    original: texto,
    traduccion: null,
    origen: codigoOrigen(),                           // idioma en que se dijo
    destino: esTraduccion() ? reunion.destino : null, // idioma al que se traduce (o ninguno)
    interlocutor: reunion.activo,                     // quien habla (null = «Sin asignar»)
  };
  segmentos.push(seg);
  hayCambios = true;
  conScroll(() => {
    const fila = filaProv || crearFila();
    filaProv = null;
    pintarOriginalFinal(fila, seg);
  });
  if (!esTraduccion()) {
    // modo Reunión: no hay nada que traducir
  } else if (estadoTrad === 'nodisp') {
    pintarTraduccionFinal(seg, null);
  } else {
    cola.push(seg);
    procesarCola();
  }
  actualizarControles();
}

function pintarOriginalFinal(fila, seg) {
  fila.seg = seg;
  pintarQuien(fila, seg.interlocutor);
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
  if (pantalla === 'revision') actualizarTraduccionRevision(seg); // en revision.js
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
// Donde no hay traductor de Chrome (Android), se usa el modelo que funciona en el dispositivo.
async function prepararTraductor(intento = 0, descargaPedida = false) {
  if (!esTraduccion()) return;
  const turno = ++turnoTraductor;
  const origen = codigoOrigen();
  const destino = reunion.destino;
  const par = `${nombreOrigen()} → ${nombreDestino()}`;

  // Si ya está cargado el de estos idiomas (de la reunión anterior), se reutiliza.
  if (traductor && parTraductor && parTraductor.origen === origen && parTraductor.destino === destino) {
    pintarEstadoTraductor('listo', `Traductor ${par} listo.`);
    traducirPendientes();
    return;
  }
  if (traductor) {
    try { traductor.destroy(); } catch { /* da igual */ }
    traductor = null;
    parTraductor = null;
  }

  if (origen === destino) {
    return sinTraductor('El idioma de origen y el de destino son el mismo.');
  }
  if (!('Translator' in self)) {
    return prepararModelo(turno, origen, destino, par, descargaPedida);
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
  if (disponibilidad === 'sin-respuesta' || disponibilidad === 'unavailable') {
    return prepararModelo(turno, origen, destino, par, descargaPedida);
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
    parTraductor = { origen, destino };
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

// ---------- Traducción dentro del dispositivo (Android y navegadores sin traductor) ----------

// Deja listo el modelo de traducción que funciona en el propio dispositivo.
// La primera vez hay que descargarlo (unos 120 MB) y solo se hace si se pide con el botón.
async function prepararModelo(turno, origen, destino, par, descargaPedida) {
  const clave = `${origen}-${destino}`;
  if (!MODELOS_DISPONIBLES.includes(clave)) {
    return sinTraductor(`En este navegador no hay traductor ${par}.`);
  }
  let yaDescargado = false;
  try { yaDescargado = localStorage.getItem(CLAVE_MODELO + clave) === '1'; } catch { /* sin memoria */ }
  if (!yaDescargado && !descargaPedida) {
    return pintarEstadoTraductor('descargable',
      `Para traducir ${par} aquí hay que descargar una vez un traductor de unos 120 MB (mejor con wifi).`);
  }

  const verbo = yaDescargado ? 'Preparando' : 'Descargando';
  pintarEstadoTraductor('descargando', `${verbo} el traductor ${par}…`, yaDescargado ? null : 0);
  try {
    const nuevo = await crearTraductorEnDispositivo(origen, destino, (parte) => {
      if (turno !== turnoTraductor) return;
      pintarEstadoTraductor('descargando', `${verbo} el traductor ${par}… ${Math.round(parte * 100)} %`, parte);
    });
    if (turno !== turnoTraductor) {
      nuevo.destroy();
      return;
    }
    try { localStorage.setItem(CLAVE_MODELO + clave, '1'); } catch { /* sin memoria */ }
    traductor = nuevo;
    parTraductor = { origen, destino };
    pintarEstadoTraductor('listo', `Traductor ${par} listo (traduce dentro de este dispositivo).`);
    traducirPendientes();
  } catch (e) {
    if (turno !== turnoTraductor) return;
    console.warn('No se pudo cargar el traductor del dispositivo:', e);
    sinTraductor(`No se ha podido cargar el traductor ${par}.`, true);
  }
}

// Arranca el traductor en un hilo aparte y devuelve un objeto con la misma forma
// que el traductor de Chrome: translate(texto) y destroy().
function crearTraductorEnDispositivo(origen, destino, alProgresar) {
  return new Promise((resolver, rechazar) => {
    const hilo = new Worker('traductor-movil.js', { type: 'module' });
    const pendientes = new Map();
    let siguiente = 1;
    let listo = false;

    const api = {
      enDispositivo: true,
      ultimaDuracion: 0, // lo que tardó la última traducción, en milisegundos
      translate(texto) {
        return new Promise((ok, mal) => {
          const id = siguiente++;
          pendientes.set(id, { ok, mal });
          hilo.postMessage({ tipo: 'traducir', id, texto });
        });
      },
      destroy() {
        hilo.terminate();
        for (const p of pendientes.values()) p.mal(new Error('Traductor cerrado'));
        pendientes.clear();
      },
    };

    const fallar = (mensaje) => {
      if (listo) return;
      hilo.terminate();
      rechazar(new Error(mensaje));
    };
    hilo.onerror = (e) => fallar(e.message || 'No se pudo cargar el traductor');
    hilo.onmessage = (e) => {
      const m = e.data;
      if (m.tipo === 'progreso') {
        alProgresar(m.parte);
      } else if (m.tipo === 'listo') {
        listo = true;
        resolver(api);
      } else if (m.tipo === 'error') {
        fallar(m.mensaje);
      } else if (m.tipo === 'traduccion') {
        const p = pendientes.get(m.id);
        pendientes.delete(m.id);
        if (!p) return;
        if (m.error) {
          p.mal(new Error(m.error));
        } else {
          api.ultimaDuracion = m.ms;
          p.ok(m.texto);
        }
      }
    };
    hilo.postMessage({ tipo: 'cargar', origen, destino });
  });
}

// ¿Esta frase se traduce con el traductor cargado? (Tras «Invertir» hay frases de los dos sentidos.)
const esDelPar = (seg) => !!parTraductor && seg.origen === parTraductor.origen && seg.destino === parTraductor.destino;

function traducirPendientes() {
  for (const seg of segmentos) {
    if (seg.traduccion == null && esDelPar(seg) && !cola.includes(seg)) cola.push(seg);
  }
  procesarCola();
}

// Suelta el traductor (al pasar a una reunión sin traducción).
function soltarTraductor() {
  turnoTraductor++;
  if (traductor) {
    try { traductor.destroy(); } catch { /* da igual */ }
  }
  traductor = null;
  parTraductor = null;
  cola.length = 0;
}

// Traduce las frases confirmadas de una en una, por orden.
async function procesarCola() {
  if (procesandoCola || !traductor) return;
  procesandoCola = true;
  while (cola.length && traductor) {
    const seg = cola.shift();
    if (!esDelPar(seg)) continue; // de otro sentido: se traducirá cuando vuelva ese traductor
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
  // Si el traductor del dispositivo va lento, no se le carga con el texto gris.
  if (traductor.enDispositivo && traductor.ultimaDuracion > LIMITE_TRAD_PROVISIONAL_MS) return;
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

const TEXTO_ESTADO = {
  parado: 'Parado',
  arrancando: 'Arrancando…',
  escuchando: 'Escuchando',
  reanudando: 'Reanudando…',
  cortado: 'PARADO',
};

// Nombre en español de cada motivo de corte que da Chrome.
const MOTIVOS = {
  '': 'fin normal',
  'no-speech': 'silencio',
  aborted: 'cancelado',
  network: 'sin conexión',
  'not-allowed': 'sin permiso de micrófono',
  'service-not-allowed': 'servicio de voz no permitido',
  'audio-capture': 'micrófono no disponible',
  'language-not-supported': 'idioma no admitido',
  'reinicio-preventivo': 'reinicio preventivo',
  'fallo-arranque': 'no se pudo arrancar',
  'cambio-idioma': 'cambio de idioma',
};
const describirMotivo = (codigo) => MOTIVOS[codigo || ''] || `error «${codigo}»`;

// Cambia el estado de la escucha y lo enseña.
//   parado: no escucha porque lo has pedido (o aún no has empezado)
//   arrancando / reanudando: quiere escuchar pero el micrófono aún no está abierto
//   escuchando: todo bien
//   cortado: se ha parado sola por un problema que no se arregla reintentando
function ponerEstado(estado) {
  if (estado === 'escuchando' || estado === 'parado' || estado === 'cortado') sinEscucharDesde = null;
  else if (sinEscucharDesde == null) sinEscucharDesde = Date.now();
  estadoEscucha = estado;
  pintarEscucha();
}

function pintarEscucha() {
  let visible = estadoEscucha;
  // En Android el micrófono se reconecta tras cada frase: esos cortes tan breves no se
  // enseñan, para que el aviso ámbar solo salga cuando de verdad tarda en volver.
  if (visible === 'reanudando' && Date.now() - sinEscucharDesde < MOSTRAR_REANUDANDO_MS) visible = 'escuchando';
  el.indicador.dataset.estado = visible;
  document.body.dataset.escucha = visible;
  el.indicadorTexto.textContent = TEXTO_ESTADO[visible];
  el.btnEscuchar.textContent = quiereEscuchar ? 'Parar' : 'Seguir';
  el.btnEscuchar.classList.toggle('activo', quiereEscuchar);
  document.body.classList.toggle('escuchando', quiereEscuchar); // en el móvil esconde lo que no hace falta
  actualizarControles();
}

// Avisos de la franja roja que pone la escucha (se quitan solos cuando se recupera).
function avisoEscucha(texto) {
  mostrarMensaje(texto);
  mensajeDeEscucha = true;
}
function quitarAvisoEscucha() {
  if (!mensajeDeEscucha) return;
  mensajeDeEscucha = false;
  ocultarMensaje();
}

// Evita que la pantalla se apague sola mientras se escucha (en el móvil cortaría la escucha).
async function mantenerPantallaEncendida() {
  if (!('wakeLock' in navigator)) {
    if (!avisadoSinBloqueo) registrar('Este navegador no permite mantener la pantalla encendida.');
    avisadoSinBloqueo = true;
    return;
  }
  if (bloqueoPantalla || pidiendoBloqueo || document.hidden) return;
  pidiendoBloqueo = true;
  try {
    const bloqueo = await navigator.wakeLock.request('screen');
    bloqueoPantalla = bloqueo;
    bloqueo.addEventListener('release', () => {
      if (bloqueoPantalla !== bloqueo) return;
      bloqueoPantalla = null;
      // Si se suelta sin pasar a segundo plano (por ejemplo, ahorro de batería), se vuelve a pedir.
      if (quiereEscuchar && !document.hidden) {
        registrar('Se ha perdido el bloqueo de «pantalla encendida»; se vuelve a pedir.');
        setTimeout(mantenerPantallaEncendida, 1000);
      }
    });
    if (!quiereEscuchar) soltarPantalla();
  } catch (e) {
    registrar(`No se ha podido mantener la pantalla encendida (${(e && e.name) || e}).`);
  } finally {
    pidiendoBloqueo = false;
  }
}

function soltarPantalla() {
  if (!bloqueoPantalla) return;
  const bloqueo = bloqueoPantalla;
  bloqueoPantalla = null;
  bloqueo.release().catch(() => {});
}

function iniciarEscucha() {
  const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Reconocimiento) {
    mostrarMensaje('Este navegador no tiene reconocimiento de voz. Usa Google Chrome.');
    return;
  }
  ocultarMensaje();
  mensajeDeEscucha = false;
  cerrarAlarma();
  quiereEscuchar = true;
  fallosSeguidos = 0;
  fallosMicro = 0;
  inicioErrorRed = null;
  esperaVolver = false;
  corte = null;
  alarmaSilenciadaHasta = 0;
  inicioEscucha = Date.now();
  reconexionesNormales = 0;
  cortesConIncidencia = 0;
  registrar(`Escuchar · idioma ${reunion.origen}${esAndroid ? ' · Android' : ''}`);
  ponerEstado('arrancando');
  arrancarReconocimiento();
  mantenerPantallaEncendida();
  if (esTraduccion() && estadoTrad === 'descargable') prepararTraductor();
}

// Deja de escuchar. estadoFinal: 'parado' (lo has pedido) o 'cortado' (se ha parado sola).
function detenerEscucha(estadoFinal) {
  quiereEscuchar = false;
  esperaVolver = false;
  clearTimeout(tempReinicio);
  if (rec) {
    try { rec.stop(); } catch { /* ya estaba parado */ }
  }
  soltarPantalla();
  if (corte) {
    registrar(`Corte (${describirMotivo(corte.motivo)}) · no se llegó a reanudar.`);
    corte = null;
  }
  if (inicioEscucha) {
    registrar(`Resumen: ${duracionTexto(Date.now() - inicioEscucha)} en marcha · `
      + `${reconexionesNormales} reconexiones normales · ${cortesConIncidencia} cortes con incidencia.`);
    inicioEscucha = null;
  }
  ponerEstado(estadoFinal);
}

function pararEscucha() {
  if (!quiereEscuchar) return;
  registrar('Parar (pulsado por ti).');
  cerrarAlarma();
  quitarAvisoEscucha();
  detenerEscucha('parado');
}

// Se ha parado sola por un problema que no se arregla reintentando:
// estado PARADO en rojo, aviso grande, pitido y vibración.
function pararPorFallo(motivo, texto) {
  registrar(`PARADA sin pedirla: ${motivo}.`);
  detenerEscucha('cortado');
  mostrarMensaje(texto);
  mostrarAlarma({
    tipo: 'parada',
    titulo: 'Se ha parado la escucha',
    texto: `${motivo}. ${texto}`,
    sonido: true,
    botones: [
      { texto: 'Volver a escuchar', accion: iniciarEscucha, principal: true },
      { texto: 'Cerrar aviso' },
    ],
  });
}

// Abandona el reconocimiento actual y arranca otro (si Chrome se ha quedado colgado).
function forzarReinicio(motivo = 'reinicio-preventivo') {
  const viejo = rec;
  rec = null;
  if (viejo) {
    try { viejo.abort(); } catch { /* da igual */ }
  }
  if (filaProv) confirmarFrase(filaProv.texto); // lo que quedó en gris no se pierde
  corte = { t: Date.now(), motivo };
  ponerEstado('reanudando');
  clearTimeout(tempReinicio);
  tempReinicio = setTimeout(() => {
    if (quiereEscuchar) arrancarReconocimiento();
  }, 300);
}

// Apunta en el registro cómo fue el último corte, ya que se ha vuelto a abrir el micrófono.
function anotarReanudacion() {
  if (!corte) return;
  const hueco = Date.now() - corte.t;
  const normal = (!corte.motivo || corte.motivo === 'no-speech') && hueco < 2000;
  if (normal) {
    reconexionesNormales++; // en Android pasa tras cada frase: no se apunta una a una
  } else {
    cortesConIncidencia++;
    registrar(`Corte (${describirMotivo(corte.motivo)}) · vuelve a escuchar tras ${duracionTexto(hueco)}.`);
  }
  corte = null;
}

function arrancarReconocimiento() {
  clearTimeout(tempReinicio);
  // Si quedaba otro reconocimiento abierto, se cierra, y su texto en gris se guarda.
  if (rec) {
    const viejo = rec;
    rec = null;
    try { viejo.abort(); } catch { /* ya estaba parado */ }
  }
  if (filaProv) confirmarFrase(filaProv.texto);

  const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
  const este = new Reconocimiento();
  rec = este;
  este.lang = reunion.origen;
  // En Android el modo continuo de Chrome repite el texto: se escucha frase a frase
  // y se vuelve a arrancar al terminar cada una.
  este.continuous = !esAndroid;
  este.interimResults = true;
  este.maxAlternatives = 1;

  let huboResultado = false;
  let ultimoError = '';
  let cortadoPorOcultar = false;
  let ultimoConfirmado = ''; // para no repetir una frase que Android manda dos veces

  const senal = () => {
    if (rec === este) ultimoEvento = Date.now();
  };
  este.onaudiostart = senal;
  este.onsoundstart = senal;
  este.onspeechstart = senal;

  este.onstart = () => {
    if (rec !== este) return;
    senal();
    if (!quiereEscuchar) return;
    // Si venía de fallos de red o de micrófono, aún no se da por bueno hasta que llegue texto.
    if (inicioErrorRed || fallosMicro) return;
    anotarReanudacion();
    ponerEstado('escuchando');
    quitarAvisoEscucha();
    if (alarmaActual && alarmaActual.tipo === 'atascado') {
      registrar('La escucha se ha recuperado sola.');
      cerrarAlarma();
    }
  };

  este.onresult = (e) => {
    if (rec !== este) return;
    senal();
    huboResultado = true;
    if (inicioErrorRed || fallosMicro) {
      inicioErrorRed = null;
      fallosMicro = 0;
      if (quiereEscuchar) {
        anotarReanudacion();
        ponerEstado('escuchando');
        quitarAvisoEscucha();
        if (alarmaActual && alarmaActual.tipo === 'atascado') cerrarAlarma();
      }
    }
    let provisional = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const texto = r[0].transcript;
      // Chrome en Android marca como definitivos textos que aún son provisionales
      // (se distinguen porque llegan con confianza 0).
      const definitivo = r.isFinal && !(esAndroid && r[0].confidence === 0);
      if (!definitivo) {
        provisional += texto;
      } else if (!(esAndroid && texto.trim() === ultimoConfirmado)) {
        ultimoConfirmado = texto.trim();
        confirmarFrase(texto);
      }
    }
    if (esAndroid && provisional.trim() === ultimoConfirmado) provisional = '';
    mostrarProvisional(provisional);
  };

  este.onerror = (e) => {
    if (rec !== este) return;
    senal();
    ultimoError = e.error;
    if (e.error !== 'no-speech' && e.error !== 'aborted') {
      registrar(`Aviso del reconocimiento: ${describirMotivo(e.error)}${document.hidden ? ' (app en segundo plano)' : ''}.`);
    }
    switch (e.error) {
      case 'no-speech': // silencio: Chrome corta y se vuelve a arrancar más abajo
      case 'aborted':
        break;
      case 'not-allowed':
      case 'service-not-allowed':
        // Con la pantalla apagada o en otra app, Chrome corta el micrófono:
        // no es un problema de permisos y se reanuda al volver.
        if (document.hidden) {
          cortadoPorOcultar = true;
          break;
        }
        pararPorFallo('Sin permiso para usar el micrófono', esChromeDeVerdad
          ? `En la barra de direcciones, pulsa el icono que hay justo a la izquierda de «${location.host}», activa «Micrófono» y vuelve a pulsar Iniciar.`
          : AVISO_NO_ES_CHROME);
        break;
      case 'audio-capture':
        fallosMicro++;
        if (fallosMicro >= FALLOS_MICRO_MAX) {
          pararPorFallo('No se encuentra ningún micrófono',
            'Comprueba que el micrófono está conectado y que ninguna otra app lo está usando, y vuelve a pulsar Iniciar.');
        } else {
          avisoEscucha('El micrófono no responde. Reintentando…');
        }
        break;
      case 'language-not-supported':
        pararPorFallo('Idioma no admitido', `El reconocimiento de voz no admite el idioma ${nombreOrigen()}. Elige otro en la pantalla de inicio.`);
        break;
      case 'network':
        if (!inicioErrorRed) inicioErrorRed = Date.now();
        if (Date.now() - inicioErrorRed >= ESPERA_RED_MS) {
          pararPorFallo('Sin conexión a Internet',
            `Lleva más de ${ESPERA_RED_MS / 1000} segundos sin poder conectar con el reconocimiento de voz de Google. Comprueba el wifi o los datos y vuelve a pulsar Iniciar.`);
        } else {
          avisoEscucha('No hay conexión con el reconocimiento de voz de Google. Reintentando…');
        }
        break;
      default:
        avisoEscucha(`Problema con el reconocimiento de voz (${e.error}). Reintentando…`);
    }
  };

  // Chrome corta tras un silencio o cada cierto tiempo (en Android, tras cada frase):
  // se vuelve a arrancar mientras no se haya pulsado Parar. El texto ya capturado no se toca.
  este.onend = () => {
    if (rec !== este) return;
    senal();
    if (filaProv) confirmarFrase(filaProv.texto); // lo que quedó en gris no se pierde
    if (!quiereEscuchar) {
      if (estadoEscucha !== 'cortado') ponerEstado('parado');
      return;
    }
    if (ultimoError !== 'network') inicioErrorRed = null;
    if (ultimoError !== 'audio-capture') fallosMicro = 0;
    if (!corte) corte = { t: Date.now(), motivo: ultimoError };
    ponerEstado('reanudando');
    if (document.hidden && (esAndroid || cortadoPorOcultar)) {
      esperaVolver = true; // se reanuda al volver a la página (ver más abajo)
      registrar(`Corte con la app en segundo plano (${describirMotivo(ultimoError)}). Se reanudará al volver.`);
      return;
    }
    const duracion = Date.now() - ultimoArranque;
    fallosSeguidos = duracion < 2000 && !huboResultado ? Math.min(fallosSeguidos + 1, 10) : 0;
    const base = esAndroid ? 100 : 250;
    const espera = Math.min(base * 2 ** fallosSeguidos, 5000); // si falla seguido, espera más
    tempReinicio = setTimeout(() => {
      if (quiereEscuchar) arrancarReconocimiento();
    }, espera);
  };

  ultimoArranque = Date.now();
  try {
    este.start();
  } catch (e) {
    // No se ha podido abrir el micrófono: se vuelve a intentar un poco más tarde.
    registrar(`No se ha podido arrancar el reconocimiento (${(e && e.name) || e}). Se reintenta.`);
    rec = null;
    if (!corte) corte = { t: Date.now(), motivo: 'fallo-arranque' };
    ponerEstado('reanudando');
    fallosSeguidos = Math.min(fallosSeguidos + 1, 10);
    tempReinicio = setTimeout(() => {
      if (quiereEscuchar) arrancarReconocimiento();
    }, Math.min(250 * 2 ** fallosSeguidos, 5000));
  }
}

// Vigilancia cada medio segundo: enseña «Reanudando…» si tarda, avisa si no consigue
// volver a escuchar, reinicia el reconocimiento si se queda colgado y repite el pitido.
function vigilar() {
  const ahora = Date.now();
  if (estadoEscucha === 'reanudando') pintarEscucha();

  if (quiereEscuchar && sinEscucharDesde && ahora - sinEscucharDesde >= ATASCADO_MS
      && ahora >= alarmaSilenciadaHasta && (!alarmaActual || alarmaActual.tipo === 'vuelta')) {
    registrar(`Aviso: lleva ${duracionTexto(ahora - sinEscucharDesde)} sin poder escuchar.`);
    mostrarAlarma({
      tipo: 'atascado',
      titulo: 'No está escuchando',
      texto: `Lleva más de ${ATASCADO_MS / 1000} segundos intentando volver a escuchar, sin conseguirlo. Sigue intentándolo sola.`
        + (document.hidden ? ' La app está en segundo plano: vuelve a abrirla.' : ''),
      sonido: true,
      botones: [
        { texto: 'Seguir intentándolo', principal: true, accion: () => { alarmaSilenciadaHasta = Date.now() + SILENCIAR_ATASCADO_MS; } },
        { texto: 'Parar la escucha', accion: pararEscucha },
      ],
    });
  }

  if (quiereEscuchar && estadoEscucha === 'escuchando' && rec && !document.hidden
      && ahora - ultimoEvento >= SIN_NOTICIAS_MS) {
    registrar(`Reinicio preventivo: ${duracionTexto(ahora - ultimoEvento)} sin ninguna señal del reconocimiento.`);
    forzarReinicio();
  }

  repetirPitido(ahora);
}

// Al pasar a segundo plano se guarda todo; al volver se retoma lo que se cortó y se avisa.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    guardarCopia();
    if (quiereEscuchar) {
      ocultoDesde = Date.now();
      registrar('La app pasa a segundo plano mientras escucha.');
    }
    return;
  }
  if (!quiereEscuchar) return;
  registrar('La app vuelve al primer plano.');
  mantenerPantallaEncendida();
  if (esperaVolver) {
    esperaVolver = false;
    const desde = (corte && corte.t) || ocultoDesde || Date.now();
    const ahora = Date.now();
    mostrarAlarma({
      tipo: 'vuelta',
      titulo: 'Se ha cortado la escucha',
      texto: `Mientras la app estaba en segundo plano o con la pantalla apagada no se ha escuchado nada: de ${horaTexto(new Date(desde))} a ${horaTexto(new Date(ahora))} (${duracionTexto(ahora - desde)}). Ya vuelve a escuchar.`,
      botones: [{ texto: 'Entendido', principal: true }],
    });
    arrancarReconocimiento();
  }
  ocultoDesde = null;
});

// ---------- Copia de seguridad (localStorage) ----------

function guardarCopia() {
  if (!hayCambios || copiaPendiente || !reunion) return;
  const provisional = filaProv ? filaProv.texto : '';
  try {
    localStorage.setItem(CLAVE_COPIA, JSON.stringify({
      version: 2,
      guardada: new Date().toISOString(),
      pantalla,
      reunion,
      segmentos,
      provisional, // la frase que se estaba diciendo, aún en gris
    }));
    hayCambios = false;
  } catch (e) {
    console.warn('No se pudo guardar la copia de seguridad:', e);
    registrar(`No se ha podido guardar la copia de seguridad (${(e && e.name) || e}).`);
    mostrarMensaje('No se ha podido guardar la copia de seguridad. Descarga el .md para no perder nada.');
  }
}

function ofrecerRecuperacion() {
  let copia = null;
  try {
    copia = JSON.parse(localStorage.getItem(CLAVE_COPIA));
  } catch { /* copia ilegible: se ignora */ }
  if (!copia || !Array.isArray(copia.segmentos)) return;
  const n = copia.segmentos.length + (copia.provisional ? 1 : 0);
  if (n === 0) return;
  copiaPendiente = copia;
  const inicio = (copia.reunion && copia.reunion.inicio) || copia.inicio;
  const cuando = inicio ? fechaTexto(new Date(inicio)) : 'fecha desconocida';
  el.recuperarTexto.textContent =
    `Hay una reunión sin terminar del ${cuando}, con ${n} ${n === 1 ? 'frase' : 'frases'}.`;
  el.recuperar.hidden = false;
  registrar(`Al abrir: hay una reunión sin terminar guardada (${n} frases).`);
}

function recuperarCopia() {
  const copia = copiaPendiente;
  if (!copia) return;
  copiaPendiente = null;
  el.recuperar.hidden = true;
  reunion = normalizarReunion(copia); // en inicio.js (admite también copias de la versión anterior)
  const codigo = reunion.origen.split('-')[0];
  segmentos = copia.segmentos
    .filter((s) => s && typeof s.original === 'string')
    .map((s, i) => ({
      ...s,
      id: i + 1,
      hora: s.hora || reunion.inicio,
      original: s.original,
      traduccion: typeof s.traduccion === 'string' ? s.traduccion : null,
      origen: s.origen || codigo,
      destino: reunion.modo === 'traduccion' ? (s.destino || reunion.destino) : null,
      interlocutor: buscarInterlocutor(s.interlocutor) ? s.interlocutor : null,
    }));
  // La frase que se estaba diciendo cuando se cerró también se recupera.
  if (typeof copia.provisional === 'string' && copia.provisional.trim()) {
    segmentos.push({
      id: segmentos.length + 1,
      hora: copia.guardada || new Date().toISOString(),
      original: copia.provisional.trim(),
      traduccion: null,
      origen: codigo,
      destino: reunion.modo === 'traduccion' ? reunion.destino : null,
      interlocutor: reunion.activo,
    });
  }
  siguienteId = segmentos.length + 1;
  cola.length = 0;
  ultimaFrase = { norm: '', t: 0 };
  hayCambios = true;
  pintarTodo();
  abrirReunion(copia.pantalla); // en inicio.js
  registrar(`Reunión anterior recuperada (${segmentos.length} frases).`);
}

function descartarCopia() {
  if (!confirm('Se borrará la reunión guardada y no se podrá recuperar. ¿Continuar?')) return;
  copiaPendiente = null;
  el.recuperar.hidden = true;
  localStorage.removeItem(CLAVE_COPIA);
  actualizarControles();
  registrar('Reunión anterior descartada.');
}

// Cierra la reunión en curso, borra su copia de seguridad y vuelve al inicio.
function cerrarReunion() {
  if (quiereEscuchar) pararEscucha();
  cerrarAlarma();
  reunion = null;
  segmentos = [];
  siguienteId = 1;
  cola.length = 0;
  filasPorId.clear();
  filaProv = null;
  ultimaFrase = { norm: '', t: 0 };
  el.filas.textContent = '';
  localStorage.removeItem(CLAVE_COPIA);
  hayCambios = false;
  registrar('Reunión cerrada.');
  mostrarPantalla('inicio'); // en inicio.js
  actualizarControles();
}

// ---------- Modo de prueba ----------

// Parte el texto pegado en frases y las mete por el mismo camino que las del micrófono.
function probarTexto() {
  const texto = el.textoPrueba.value.trim();
  if (!texto) return;
  if (!reunion) return;
  if (esTraduccion() && estadoTrad === 'descargable') prepararTraductor();
  const separador = new Intl.Segmenter(codigoOrigen(), { granularity: 'sentence' });
  for (const linea of texto.split(/\n+/)) {
    for (const trozo of separador.segment(linea)) confirmarFrase(trozo.segment, false);
  }
  el.filas.scrollTop = el.filas.scrollHeight;
  el.textoPrueba.value = '';
  el.dlgPrueba.close();
}

// ---------- Arranque ----------

el.btnEscuchar.addEventListener('click', () => (quiereEscuchar ? pararEscucha() : iniciarEscucha()));
el.btnPrepararTraductor.addEventListener('click', () => prepararTraductor(0, true));
el.btnRecuperar.addEventListener('click', recuperarCopia);
el.btnDescartar.addEventListener('click', descartarCopia);
el.btnPrueba.addEventListener('click', probarTexto);
$('btnAbrirPrueba').addEventListener('click', () => {
  $('dlgMenu').close();
  if (!reunion || pantalla !== 'reunion') {
    alert('El modo de prueba añade frases a la reunión en curso: ábrelo desde la pantalla de la reunión.');
    return;
  }
  el.dlgPrueba.showModal();
});
$('btnCerrarPrueba').addEventListener('click', () => el.dlgPrueba.close());

setInterval(guardarCopia, GUARDAR_CADA_MS);
setInterval(vigilar, 500);
window.addEventListener('pagehide', guardarCopia);

// Cuando ya están cargados todos los archivos de la app:
document.addEventListener('DOMContentLoaded', () => {
  registrar(`App abierta · versión ${VERSION_APP}.`);
  if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
    mostrarMensaje('Este navegador no tiene reconocimiento de voz: solo funcionará el modo de prueba. Usa Google Chrome.');
  } else if (!esChromeDeVerdad) {
    mostrarMensaje(AVISO_NO_ES_CHROME);
  }
  mostrarPantalla('inicio');
  ofrecerRecuperacion();
  actualizarControles();
  // Si se acaba de recargar por una actualización, la reunión vuelve sola, tal como estaba.
  let trasActualizar = false;
  try {
    trasActualizar = sessionStorage.getItem(CLAVE_TRAS_ACTUALIZAR) === '1'; // en instalable.js
    sessionStorage.removeItem(CLAVE_TRAS_ACTUALIZAR);
  } catch { /* da igual */ }
  if (trasActualizar && copiaPendiente) {
    registrar('Reunión recuperada tras la actualización.');
    recuperarCopia();
  }
});
