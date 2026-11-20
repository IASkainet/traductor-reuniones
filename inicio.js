'use strict';

/* Pantalla de inicio: los dos modos («Traducción» y «Reunión») con sus idiomas, que se
   recuerdan para la próxima vez, el botón «Invertir» y «Preparar mis idiomas». */

const CLAVE_AJUSTES = 'traductorReuniones.ajustes';

// Idiomas que se pueden escuchar (código que usa el reconocimiento de voz de Chrome).
const VOCES = [
  { voz: 'fr-FR', nombre: 'Francés' },
  { voz: 'es-ES', nombre: 'Español' },
  { voz: 'en-US', nombre: 'Inglés (EE. UU.)' },
  { voz: 'en-GB', nombre: 'Inglés (Reino Unido)' },
  { voz: 'de-DE', nombre: 'Alemán' },
  { voz: 'it-IT', nombre: 'Italiano' },
  { voz: 'pt-PT', nombre: 'Portugués' },
];
// Idiomas a los que se puede traducir, y cómo se escuchan si se invierte el sentido.
const DESTINOS = [
  { codigo: 'es', nombre: 'Español', voz: 'es-ES' },
  { codigo: 'fr', nombre: 'Francés', voz: 'fr-FR' },
  { codigo: 'en', nombre: 'Inglés', voz: 'en-US' },
  { codigo: 'de', nombre: 'Alemán', voz: 'de-DE' },
  { codigo: 'it', nombre: 'Italiano', voz: 'it-IT' },
  { codigo: 'pt', nombre: 'Portugués', voz: 'pt-PT' },
];

const nombreVoz = (voz) => (VOCES.find((v) => v.voz === voz) || { nombre: voz }).nombre;
const nombreCodigo = (codigo) => (DESTINOS.find((d) => d.codigo === codigo) || { nombre: codigo }).nombre;
const vozValida = (voz) => (VOCES.some((v) => v.voz === voz) ? voz : null);
const destinoValido = (codigo) => (DESTINOS.some((d) => d.codigo === codigo) ? codigo : null);
const vozDeCodigo = (codigo) => (DESTINOS.find((d) => d.codigo === codigo) || { voz: 'es-ES' }).voz;

// ---------- Ajustes que se recuerdan ----------

function cargarAjustes() {
  let a = null;
  try { a = JSON.parse(localStorage.getItem(CLAVE_AJUSTES)); } catch { /* ilegibles: se usan los de serie */ }
  if (!a || typeof a !== 'object') a = {};
  const t = a.traduccion || {};
  let origen = vozValida(t.origen) || 'fr-FR';
  let destino = destinoValido(t.destino) || 'es';
  if (destino === origen.split('-')[0]) {
    origen = 'fr-FR';
    destino = 'es';
  }
  return {
    ...a,
    modo: a.modo === 'reunion' ? 'reunion' : 'traduccion',
    traduccion: { origen, destino },
    reunion: { idioma: vozValida(a.reunion && a.reunion.idioma) || 'es-ES' },
  };
}

let ajustes = cargarAjustes();

function guardarAjustes() {
  try { localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(ajustes)); } catch { /* sin memoria: da igual */ }
}

// ---------- Elementos ----------
const ini = {
  pantallaInicio: $('pantallaInicio'),
  pantallaReunion: $('pantallaReunion'),
  txtParTraduccion: $('txtParTraduccion'),
  txtIdiomaReunion: $('txtIdiomaReunion'),
  dlgIdiomas: $('dlgIdiomas'),
  dlgIdiomasTitulo: $('dlgIdiomasTitulo'),
  etiquetaOrigen: $('etiquetaOrigen'),
  selOrigen: $('selOrigen'),
  selDestino: $('selDestino'),
  filaDestino: $('filaDestino'),
  errorIdiomas: $('errorIdiomas'),
  dlgPreparar: $('dlgPreparar'),
  listaPreparar: $('listaPreparar'),
  notaPreparar: $('notaPreparar'),
  btnDescargarIdiomas: $('btnDescargarIdiomas'),
};

for (const v of VOCES) ini.selOrigen.add(new Option(v.nombre, v.voz));
for (const d of DESTINOS) ini.selDestino.add(new Option(d.nombre, d.codigo));

// ---------- Pantallas ----------

function mostrarPantalla(nombre) {
  pantalla = nombre;
  document.body.dataset.pantalla = nombre;
  for (const sec of document.querySelectorAll('.pantalla')) {
    sec.hidden = sec.id !== `pantalla${nombre[0].toUpperCase()}${nombre.slice(1)}`;
  }
  if (nombre === 'inicio') pintarInicio();
}

function pintarInicio() {
  const t = ajustes.traduccion;
  ini.txtParTraduccion.textContent = `${nombreVoz(t.origen)} → ${nombreCodigo(t.destino)}`;
  ini.txtIdiomaReunion.textContent = nombreVoz(ajustes.reunion.idioma);
  for (const m of document.querySelectorAll('.modo')) {
    m.classList.toggle('ultimo', m.dataset.modo === ajustes.modo);
  }
}

// ---------- Empezar una reunión: un toque ----------

function empezarReunion(modo) {
  if (copiaPendiente) return;
  ajustes.modo = modo;
  guardarAjustes();
  const traduciendo = modo === 'traduccion';
  reunion = {
    modo,
    origen: traduciendo ? ajustes.traduccion.origen : ajustes.reunion.idioma,
    destino: traduciendo ? ajustes.traduccion.destino : null,
    inicio: new Date().toISOString(),
    fin: null,
    vozAnterior: null, // para volver al mismo acento al invertir dos veces
    interlocutores: interlocutoresIniciales(), // en interlocutores.js
    activo: null,      // nadie elegido: las frases quedan «Sin asignar»
  };
  segmentos = [];
  siguienteId = 1;
  cola.length = 0;
  filasPorId.clear();
  filaProv = null;
  el.filas.textContent = '';
  ultimaFrase = { norm: '', t: 0 };
  hayCambios = true;
  registrar(`Nueva reunión · modo ${traduciendo ? 'Traducción' : 'Reunión'} · ${reunion.origen}${traduciendo ? ` → ${reunion.destino}` : ''}.`);
  abrirReunion('reunion');
  iniciarEscucha();
}

// Enseña la reunión en curso (también al recuperarla): su pantalla o, si ya se
// había terminado, la revisión.
function abrirReunion(destino = 'reunion') {
  document.body.dataset.modo = reunion.modo;
  if (esTraduccion()) prepararTraductor();
  else soltarTraductor();
  if (destino === 'revision') {
    abrirRevision(); // en revision.js
    return;
  }
  mostrarPantalla('reunion');
  pintarBarraInterlocutores();
  pintarEscucha();
}

// Rehace los datos de una reunión guardada (también de copias de la versión anterior).
function normalizarReunion(copia) {
  const r = copia.reunion || {};
  const modo = r.modo === 'reunion' ? 'reunion' : 'traduccion';
  const origen = vozValida(r.origen || copia.origen) || (modo === 'reunion' ? 'es-ES' : 'fr-FR');
  let destino = null;
  if (modo === 'traduccion') {
    destino = destinoValido(r.destino || copia.destino) || 'es';
    if (destino === origen.split('-')[0]) destino = origen.startsWith('es') ? 'fr' : 'es';
  }
  const primera = copia.segmentos && copia.segmentos[0] && copia.segmentos[0].hora;
  const interlocutores = normalizarInterlocutores(r.interlocutores);
  return {
    ...r,
    modo,
    origen,
    destino,
    inicio: r.inicio || copia.inicio || primera || new Date().toISOString(),
    fin: r.fin || null,
    vozAnterior: r.vozAnterior || null,
    interlocutores,
    activo: interlocutores.some((x) => x.id === r.activo) ? r.activo : null,
  };
}

// Cambia el sentido de la traducción en plena reunión (por ejemplo, cuando habla la otra parte).
function invertirIdiomas() {
  if (!esTraduccion()) return;
  if (filaProv) confirmarFrase(filaProv.texto); // lo que se estaba diciendo, con el idioma de antes
  const vozVieja = reunion.origen;
  const nuevaVoz = reunion.vozAnterior && reunion.vozAnterior.split('-')[0] === reunion.destino
    ? reunion.vozAnterior
    : vozDeCodigo(reunion.destino);
  reunion.destino = codigoOrigen();
  reunion.origen = nuevaVoz;
  reunion.vozAnterior = vozVieja;
  hayCambios = true;
  registrar(`Invertir: ahora se escucha ${reunion.origen} y se traduce a ${reunion.destino}.`);
  actualizarControles();
  prepararTraductor();
  if (quiereEscuchar) forzarReinicio('cambio-idioma'); // vuelve a abrir el micrófono en el otro idioma
}

// ---------- Cambiar idiomas ----------

let modoEditando = 'traduccion';

function abrirIdiomas(modo) {
  modoEditando = modo;
  const traduciendo = modo === 'traduccion';
  ini.dlgIdiomasTitulo.textContent = traduciendo ? 'Idiomas del modo «Traducción»' : 'Idioma del modo «Reunión»';
  ini.etiquetaOrigen.textContent = traduciendo ? 'Se habla en' : 'Idioma de la reunión';
  ini.filaDestino.hidden = !traduciendo;
  ini.selOrigen.value = traduciendo ? ajustes.traduccion.origen : ajustes.reunion.idioma;
  ini.selDestino.value = ajustes.traduccion.destino;
  ini.errorIdiomas.hidden = true;
  ini.dlgIdiomas.showModal();
}

function guardarIdiomas() {
  if (modoEditando === 'traduccion') {
    const origen = ini.selOrigen.value;
    const destino = ini.selDestino.value;
    if (origen.split('-')[0] === destino) {
      ini.errorIdiomas.textContent = 'El idioma que se habla y el de la traducción no pueden ser el mismo. Para una reunión en un solo idioma usa el modo «Reunión».';
      ini.errorIdiomas.hidden = false;
      return;
    }
    ajustes.traduccion = { origen, destino };
  } else {
    ajustes.reunion = { idioma: ini.selOrigen.value };
  }
  guardarAjustes();
  pintarInicio();
  ini.dlgIdiomas.close();
}

// ---------- Preparar mis idiomas ----------

// Cada elemento: { o, d, nombre, para, estado, motor, parte, detalle }
//   estado: comprobando | listo | falta | nodisp | descargando | error
//   motor: 'chrome' (traductor de Chrome, en el PC) o 'aparato' (Opus-MT, en Android)
let paraPreparar = [];
let turnoPreparar = 0;

const esperar = (ms, valor) => new Promise((ok) => setTimeout(() => ok(valor), ms));

// Mira si el aparato ya tiene listo el traductor de un par de idiomas, sin descargar nada.
// Sigue las mismas reglas que prepararTraductor() de app.js.
async function comprobarPar(origen, destino) {
  if ('Translator' in self) {
    let disp;
    try {
      disp = await Promise.race([
        Translator.availability({ sourceLanguage: origen, targetLanguage: destino }),
        esperar(ESPERA_COMPROBACION_MS, 'sin-respuesta'),
      ]);
    } catch {
      disp = 'unavailable';
    }
    if (disp === 'available') return { estado: 'listo', motor: 'chrome' };
    if (disp === 'downloadable' || disp === 'downloading') return { estado: 'falta', motor: 'chrome' };
  }
  const clave = `${origen}-${destino}`;
  if (!MODELOS_DISPONIBLES.includes(clave)) return { estado: 'nodisp', motor: 'aparato' };
  let hecho = false;
  try { hecho = localStorage.getItem(CLAVE_MODELO + clave) === '1'; } catch { /* sin memoria */ }
  return { estado: hecho ? 'listo' : 'falta', motor: 'aparato' };
}

function textoEstado(i) {
  switch (i.estado) {
    case 'comprobando': return 'Comprobando…';
    case 'listo': return '✓ Listo';
    case 'falta': return i.motor === 'aparato' ? 'Falta descargarlo (unos 120 MB)' : 'Falta descargarlo';
    case 'nodisp': return 'No disponible en este aparato';
    case 'descargando': return `Descargando… ${Math.round((i.parte || 0) * 100)} %`;
    default: return i.detalle || 'No se ha podido descargar';
  }
}

function pintarPreparar() {
  ini.listaPreparar.textContent = '';
  for (const i of paraPreparar) {
    const fila = document.createElement('div');
    fila.className = 'item-preparar';
    fila.dataset.estado = i.estado;
    const nombre = document.createElement('div');
    nombre.className = 'item-nombre';
    nombre.textContent = i.nombre;
    const para = document.createElement('div');
    para.className = 'item-para';
    para.textContent = i.para;
    const estado = document.createElement('div');
    estado.className = 'item-estado';
    estado.textContent = textoEstado(i);
    fila.append(nombre, estado, para);
    if (i.estado === 'descargando') {
      const barra = document.createElement('progress');
      barra.max = 1;
      barra.value = i.parte || 0;
      fila.append(barra);
    }
    ini.listaPreparar.append(fila);
  }
  const ocupado = paraPreparar.some((i) => i.estado === 'comprobando' || i.estado === 'descargando');
  const faltan = paraPreparar.some((i) => i.estado === 'falta' || i.estado === 'error');
  ini.btnDescargarIdiomas.disabled = ocupado || !faltan;
  let nota = '';
  if (!ocupado) {
    if (paraPreparar.every((i) => i.estado === 'nodisp')) {
      nota = 'Este aparato no puede traducir estos idiomas. El modo «Traducción» funcionará en solo transcripción: verás lo que se dice, sin traducir.';
    } else if (paraPreparar[0].estado === 'nodisp') {
      nota = `Este aparato no puede traducir ${paraPreparar[0].nombre}: en ese sentido solo verás la transcripción.`;
    } else if (!faltan) {
      nota = 'Todo listo para la reunión.';
    }
  }
  ini.notaPreparar.textContent = nota;
}

async function abrirPreparar() {
  const turno = ++turnoPreparar;
  const t = ajustes.traduccion;
  const o = t.origen.split('-')[0];
  const d = t.destino;
  paraPreparar = [
    { o, d, nombre: `${nombreCodigo(o)} → ${nombreCodigo(d)}`, para: 'Para el modo «Traducción»', estado: 'comprobando' },
    { o: d, d: o, nombre: `${nombreCodigo(d)} → ${nombreCodigo(o)}`, para: 'Para el botón «Invertir»', estado: 'comprobando' },
  ];
  pintarPreparar();
  ini.dlgPreparar.showModal();
  await Promise.all(paraPreparar.map(async (i) => {
    const r = await comprobarPar(i.o, i.d);
    if (turno !== turnoPreparar) return;
    Object.assign(i, r);
    pintarPreparar();
  }));
}

async function descargarIdiomas() {
  const turno = turnoPreparar;
  const pendientes = paraPreparar.filter((i) => i.estado === 'falta' || i.estado === 'error');
  const pintar = (i, cambios) => {
    if (turno !== turnoPreparar) return;
    Object.assign(i, cambios);
    pintarPreparar();
  };
  // Chrome solo deja descargar justo después de un toque: los suyos se piden todos a la vez.
  const deChrome = pendientes.filter((i) => i.motor === 'chrome').map(async (i) => {
    pintar(i, { estado: 'descargando', parte: 0 });
    try {
      const t = await Translator.create({
        sourceLanguage: i.o,
        targetLanguage: i.d,
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => pintar(i, { parte: e.loaded / (e.total || 1) }));
        },
      });
      t.destroy();
      pintar(i, { estado: 'listo' });
      registrar(`Preparar idiomas: ${i.o}→${i.d} listo (Chrome).`);
    } catch (e) {
      registrar(`Preparar idiomas: fallo al descargar ${i.o}→${i.d} (${(e && e.name) || e}).`);
      pintar(i, {
        estado: 'error',
        detalle: e && e.name === 'NotAllowedError' ? 'Chrome no ha dejado descargarlo: vuelve a pulsar el botón' : 'No se ha podido descargar',
      });
    }
  });
  await Promise.all(deChrome);
  // Los traductores que van dentro del aparato, de uno en uno (ocupan mucha memoria).
  for (const i of pendientes.filter((x) => x.motor === 'aparato')) {
    pintar(i, { estado: 'descargando', parte: 0 });
    try {
      const t = await crearTraductorEnDispositivo(i.o, i.d, (parte) => pintar(i, { parte }));
      t.destroy();
      try { localStorage.setItem(CLAVE_MODELO + `${i.o}-${i.d}`, '1'); } catch { /* sin memoria */ }
      pintar(i, { estado: 'listo' });
      registrar(`Preparar idiomas: ${i.o}→${i.d} listo (dentro del aparato).`);
    } catch (e) {
      registrar(`Preparar idiomas: fallo al descargar ${i.o}→${i.d} (${(e && e.message) || e}).`);
      pintar(i, { estado: 'error', detalle: 'No se ha podido descargar: revisa la conexión y vuelve a intentarlo' });
    }
  }
}

// ---------- Tamaño del texto (menú ⋮), para leer desde lejos ----------

const ESCALA_MIN = 0.8;
const ESCALA_MAX = 1.8;

function aplicarEscala() {
  const escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, Number(ajustes.escala) || 1));
  ajustes.escala = Math.round(escala * 10) / 10;
  document.documentElement.style.setProperty('--escala', ajustes.escala);
  $('txtEscala').textContent = `${Math.round(ajustes.escala * 100)} %`;
}

function cambiarEscala(paso) {
  ajustes.escala = (Number(ajustes.escala) || 1) + paso;
  aplicarEscala();
  guardarAjustes();
}

$('btnTextoMenos').addEventListener('click', () => cambiarEscala(-0.1));
$('btnTextoMas').addEventListener('click', () => cambiarEscala(0.1));
aplicarEscala();

// ---------- Botones ----------

for (const b of document.querySelectorAll('.btn-modo')) {
  b.addEventListener('click', () => empezarReunion(b.dataset.modo));
}
$('btnIdiomasTraduccion').addEventListener('click', () => abrirIdiomas('traduccion'));
$('btnIdiomaReunion').addEventListener('click', () => abrirIdiomas('reunion'));
$('btnGuardarIdiomas').addEventListener('click', guardarIdiomas);
$('btnCancelarIdiomas').addEventListener('click', () => ini.dlgIdiomas.close());
$('btnPreparar').addEventListener('click', abrirPreparar);
$('btnDescargarIdiomas').addEventListener('click', descargarIdiomas);
$('btnCerrarPreparar').addEventListener('click', () => {
  turnoPreparar++;
  ini.dlgPreparar.close();
});
el.btnInvertir.addEventListener('click', invertirIdiomas);
