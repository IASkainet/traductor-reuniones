'use strict';

/* Interlocutores: botones grandes para marcar quién habla. El elegido se queda puesto en las
   frases siguientes hasta que se cambie; si no se ha elegido ninguno, las frases quedan como
   «Sin asignar» (nunca se pierde texto por no tocar nada). Los nombres se recuerdan. */

const COLORES = ['#2563eb', '#ea580c', '#9333ea', '#0d9488', '#db2777', '#65a30d', '#b45309', '#475569'];
const COLOR_SIN_ASIGNAR = '#a8a29e';
const MAX_INTERLOCUTORES = 12;
const SIN_ASIGNAR = 'Sin asignar';

const nombrePorDefecto = (n) => `Interlocutor ${n}`;

// Lista inicial para una reunión nueva: los nombres de la última vez (como mínimo tres).
function interlocutoresIniciales() {
  const guardados = Array.isArray(ajustes.nombres) ? ajustes.nombres.filter((n) => typeof n === 'string' && n.trim()) : [];
  const nombres = guardados.slice(0, MAX_INTERLOCUTORES);
  while (nombres.length < 3) nombres.push(nombrePorDefecto(nombres.length + 1));
  return nombres.map((nombre, i) => ({ id: i + 1, nombre: nombre.trim() }));
}

// Comprueba la lista de una reunión guardada (las de la versión anterior no tienen).
function normalizarInterlocutores(lista) {
  const validos = Array.isArray(lista)
    ? lista.filter((i) => i && Number.isInteger(i.id) && typeof i.nombre === 'string')
    : [];
  return validos.length ? validos.map((i) => ({ id: i.id, nombre: i.nombre })) : interlocutoresIniciales();
}

const buscarInterlocutor = (id) => (reunion && id != null ? reunion.interlocutores.find((i) => i.id === id) : null) || null;
const nombreDe = (id) => (buscarInterlocutor(id) || { nombre: SIN_ASIGNAR }).nombre;
const colorDe = (id) => (buscarInterlocutor(id) ? COLORES[(id - 1) % COLORES.length] : COLOR_SIN_ASIGNAR);

// Pone el nombre y el color de quien habla en una fila de la reunión.
function pintarQuien(fila, id) {
  fila.el.style.setProperty('--color', colorDe(id));
  fila.el.classList.toggle('sin-asignar', !buscarInterlocutor(id));
  for (const q of fila.quien) q.textContent = nombreDe(id);
}

// Vuelve a pintar los nombres de todas las filas (tras renombrar).
function repintarQuienes() {
  for (const fila of filasPorId.values()) pintarQuien(fila, fila.seg.interlocutor);
  if (filaProv) pintarQuien(filaProv, reunion.activo);
  pintarBarraInterlocutores();
}

// Recuerda los nombres para la próxima reunión.
function recordarNombres() {
  ajustes.nombres = reunion.interlocutores.map((i) => i.nombre);
  guardarAjustes();
}

// ---------- Barra de botones (abajo en la pantalla de la reunión) ----------

const barraInterlocutores = $('barraInterlocutores');

function pintarBarraInterlocutores() {
  barraInterlocutores.textContent = '';
  if (!reunion) return;
  const etiqueta = document.createElement('span');
  etiqueta.className = 'habla-etiqueta';
  etiqueta.textContent = reunion.activo == null ? 'Toca quién habla:' : 'Habla:';
  barraInterlocutores.append(etiqueta);
  reunion.interlocutores.forEach((i, n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-interlocutor';
    b.style.setProperty('--color', colorDe(i.id));
    b.textContent = i.nombre;
    b.title = n < 9 ? `${i.nombre} (tecla ${n + 1})` : i.nombre;
    const activo = reunion.activo === i.id;
    b.classList.toggle('activo', activo);
    b.setAttribute('aria-pressed', String(activo));
    b.addEventListener('click', () => elegirInterlocutor(i.id));
    barraInterlocutores.append(b);
  });
  if (reunion.interlocutores.length < MAX_INTERLOCUTORES) {
    const mas = document.createElement('button');
    mas.type = 'button';
    mas.className = 'btn-interlocutor btn-mas';
    mas.textContent = '+';
    mas.title = 'Añadir interlocutor';
    mas.setAttribute('aria-label', 'Añadir interlocutor');
    mas.addEventListener('click', anadirInterlocutor);
    barraInterlocutores.append(mas);
  }
  const nombres = document.createElement('button');
  nombres.type = 'button';
  nombres.className = 'btn-nombres';
  nombres.textContent = '✎ Nombres';
  nombres.title = 'Cambiar los nombres';
  nombres.addEventListener('click', abrirNombres);
  barraInterlocutores.append(nombres);
}

// El elegido se aplica a la frase que se está diciendo y a las siguientes.
function elegirInterlocutor(id) {
  if (!reunion) return;
  reunion.activo = id;
  hayCambios = true;
  if (filaProv) pintarQuien(filaProv, id);
  pintarBarraInterlocutores();
}

function anadirInterlocutor() {
  if (!reunion || reunion.interlocutores.length >= MAX_INTERLOCUTORES) return;
  const id = Math.max(0, ...reunion.interlocutores.map((i) => i.id)) + 1;
  reunion.interlocutores.push({ id, nombre: nombrePorDefecto(reunion.interlocutores.length + 1) });
  recordarNombres();
  elegirInterlocutor(id);
}

// ---------- Cambiar los nombres ----------

const dlgNombres = $('dlgNombres');
const listaNombres = $('listaNombres');

function abrirNombres() {
  if (!reunion) return;
  listaNombres.textContent = '';
  for (const i of reunion.interlocutores) {
    const fila = document.createElement('label');
    fila.className = 'nombre-fila';
    fila.style.setProperty('--color', colorDe(i.id));
    const muestra = document.createElement('span');
    muestra.className = 'nombre-muestra';
    const campo = document.createElement('input');
    campo.type = 'text';
    campo.maxLength = 40;
    campo.value = i.nombre;
    campo.dataset.id = i.id;
    campo.setAttribute('aria-label', `Nombre de ${i.nombre}`);
    campo.addEventListener('focus', () => campo.select());
    fila.append(muestra, campo);
    listaNombres.append(fila);
  }
  dlgNombres.showModal();
}

function guardarNombres() {
  for (const campo of listaNombres.querySelectorAll('input')) {
    const i = buscarInterlocutor(Number(campo.dataset.id));
    const nombre = campo.value.trim();
    if (i && nombre) i.nombre = nombre;
  }
  recordarNombres();
  hayCambios = true;
  dlgNombres.close();
  repintarQuienes();
  if (typeof pintarRevision === 'function' && pantalla === 'revision') pintarRevision();
}

$('btnGuardarNombres').addEventListener('click', guardarNombres);
$('btnCancelarNombres').addEventListener('click', () => dlgNombres.close());
$('btnAnadirNombre').addEventListener('click', () => {
  guardarNombres();
  anadirInterlocutor();
  abrirNombres();
  const campos = listaNombres.querySelectorAll('input');
  campos[campos.length - 1].focus();
});

// En el PC: las teclas 1 a 9 eligen interlocutor (si no se está escribiendo en otro sitio).
document.addEventListener('keydown', (e) => {
  if (pantalla !== 'reunion' || e.ctrlKey || e.altKey || e.metaKey) return;
  if (document.querySelector('dialog[open]') || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 9 && reunion && reunion.interlocutores[n - 1]) {
    elegirInterlocutor(reunion.interlocutores[n - 1].id);
    e.preventDefault();
  }
});
