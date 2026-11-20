'use strict';

/* Revisión y acta. Al pulsar «Terminar» se revisa la reunión antes de guardarla:
   cambiar quién dijo cada frase (de una en una o un tramo de golpe), renombrar
   interlocutores y corregir el texto. Después, «Copiar acta» o «Descargar .md». */

const rev = {
  lista: $('revLista'),
  resumen: $('revResumen'),
  aviso: $('revAviso'),
  tramo: $('revTramo'),
  tramoTexto: $('revTramoTexto'),
  dlgFrase: $('dlgFrase'),
  dlgFraseTitulo: $('dlgFraseTitulo'),
  dlgFraseTexto: $('dlgFraseTexto'),
  dlgFraseQuien: $('dlgFraseQuien'),
  dlgFraseUna: $('dlgFraseUna'),
  dlgEditar: $('dlgEditar'),
  editOriginal: $('editOriginal'),
  editTraduccion: $('editTraduccion'),
  filaEditTraduccion: $('filaEditTraduccion'),
  editAviso: $('editAviso'),
  btnRetraducir: $('btnRetraducir'),
};

let tramoDesde = null;   // id de la primera frase de un tramo que se está seleccionando
let frasesElegidas = []; // las frases a las que se va a asignar interlocutor
let fraseEditando = null;

// ---------- Entrar y salir de la revisión ----------

function terminarReunion() {
  if (!reunion) return;
  if (quiereEscuchar) pararEscucha();
  if (filaProv) confirmarFrase(filaProv.texto);
  reunion.fin = new Date().toISOString();
  hayCambios = true;
  registrar(`Terminar: ${segmentos.length} frases.`);
  abrirRevision();
}

function abrirRevision() {
  cancelarTramo();
  mostrarPantalla('revision');
  rev.aviso.textContent = '';
  pintarRevision();
  rev.lista.scrollTop = 0;
}

function volverAReunion() {
  cancelarTramo();
  pintarTodo(); // la pantalla de la reunión refleja lo corregido
  mostrarPantalla('reunion');
  pintarBarraInterlocutores();
  pintarEscucha();
}

function nuevaReunion() {
  if (!confirm('¿Has copiado o descargado el acta? Al empezar una reunión nueva, esta se borra de este aparato.')) return;
  cerrarReunion();
}

// ---------- Lista de frases ----------

function pintarRevision() {
  rev.lista.textContent = '';
  const desde = segmentos.findIndex((s) => s.id === tramoDesde);
  segmentos.forEach((seg, n) => {
    const fila = document.createElement('button');
    fila.type = 'button';
    fila.className = 'rev-fila';
    fila.dataset.id = seg.id;
    fila.style.setProperty('--color', colorDe(seg.interlocutor));
    fila.classList.toggle('sin-asignar', !buscarInterlocutor(seg.interlocutor));
    fila.classList.toggle('marcada', n === desde);

    const cabeza = document.createElement('span');
    cabeza.className = 'rev-cabeza';
    const quien = document.createElement('span');
    quien.className = 'rev-quien';
    quien.textContent = nombreDe(seg.interlocutor);
    const hora = document.createElement('span');
    hora.className = 'rev-hora';
    hora.textContent = `${n + 1} · ${horaTexto(new Date(seg.hora))}${seg.corregida ? ' · corregida' : ''}`;
    cabeza.append(quien, hora);

    const orig = document.createElement('span');
    orig.className = 'rev-orig';
    orig.textContent = seg.original;
    fila.append(cabeza, orig);
    if (seg.destino) {
      const trad = document.createElement('span');
      trad.className = 'rev-trad';
      trad.textContent = seg.traduccion ?? '(sin traducción)';
      fila.append(trad);
    }
    fila.addEventListener('click', () => tocarFila(seg));
    rev.lista.append(fila);
  });
  const sinAsignar = segmentos.filter((s) => !buscarInterlocutor(s.interlocutor)).length;
  rev.resumen.textContent = `${segmentos.length} ${segmentos.length === 1 ? 'frase' : 'frases'}`
    + (sinAsignar ? ` · ${sinAsignar} sin asignar` : '');
}

// Llega una traducción mientras se revisa: se pone en su fila.
function actualizarTraduccionRevision(seg) {
  const trad = rev.lista.querySelector(`.rev-fila[data-id="${seg.id}"] .rev-trad`);
  if (trad) trad.textContent = seg.traduccion ?? '(sin traducción)';
}

function tocarFila(seg) {
  if (tramoDesde != null && tramoDesde !== seg.id) {
    // Segundo toque: se cierra el tramo.
    const a = segmentos.findIndex((s) => s.id === tramoDesde);
    const b = segmentos.findIndex((s) => s.id === seg.id);
    const [i, j] = a < b ? [a, b] : [b, a];
    abrirElegir(segmentos.slice(i, j + 1));
    return;
  }
  abrirElegir([seg]);
}

// ---------- Elegir interlocutor (una frase o un tramo) ----------

function abrirElegir(frases) {
  frasesElegidas = frases;
  const una = frases.length === 1;
  const n1 = segmentos.indexOf(frases[0]) + 1;
  rev.dlgFraseTitulo.textContent = una
    ? `Frase ${n1} · ${horaTexto(new Date(frases[0].hora))}`
    : `Tramo: frases ${n1} a ${n1 + frases.length - 1} (${frases.length} frases)`;
  rev.dlgFraseTexto.textContent = una
    ? frases[0].original
    : `De «${recortar(frases[0].original)}» a «${recortar(frases[frases.length - 1].original)}»`;
  rev.dlgFraseUna.hidden = !una;

  rev.dlgFraseQuien.textContent = '';
  const opciones = reunion.interlocutores.map((i) => ({ id: i.id, nombre: i.nombre }));
  opciones.push({ id: null, nombre: SIN_ASIGNAR });
  for (const o of opciones) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-interlocutor';
    b.style.setProperty('--color', colorDe(o.id));
    b.textContent = o.nombre;
    const actual = frases.every((s) => (s.interlocutor ?? null) === o.id);
    b.classList.toggle('activo', actual);
    b.addEventListener('click', () => asignar(o.id));
    rev.dlgFraseQuien.append(b);
  }
  rev.dlgFrase.showModal();
}

const recortar = (t) => (t.length > 40 ? `${t.slice(0, 40)}…` : t);

function asignar(id) {
  for (const s of frasesElegidas) s.interlocutor = id;
  hayCambios = true;
  rev.dlgFrase.close();
  cancelarTramo();
  pintarRevision();
}

function empezarTramo() {
  tramoDesde = frasesElegidas[0].id;
  rev.dlgFrase.close();
  const n = segmentos.indexOf(frasesElegidas[0]) + 1;
  rev.tramoTexto.textContent = `Tramo desde la frase ${n}: ahora toca la última frase del tramo.`;
  rev.tramo.hidden = false;
  pintarRevision();
}

function cancelarTramo() {
  tramoDesde = null;
  rev.tramo.hidden = true;
}

// ---------- Corregir el texto ----------

function abrirEditar() {
  const seg = frasesElegidas[0];
  fraseEditando = seg;
  rev.dlgFrase.close();
  rev.editOriginal.value = seg.original;
  rev.filaEditTraduccion.hidden = !seg.destino;
  rev.editTraduccion.value = seg.traduccion ?? '';
  rev.editAviso.textContent = '';
  rev.btnRetraducir.hidden = !seg.destino;
  rev.dlgEditar.showModal();
}

async function retraducir() {
  const seg = fraseEditando;
  if (!seg || !seg.destino) return;
  if (!traductor || !esDelPar(seg)) {
    rev.editAviso.textContent = 'El traductor de este sentido no está cargado ahora. Puedes corregir la traducción a mano.';
    return;
  }
  rev.btnRetraducir.disabled = true;
  rev.editAviso.textContent = 'Traduciendo…';
  try {
    rev.editTraduccion.value = await traductor.translate(rev.editOriginal.value.trim());
    rev.editAviso.textContent = 'Traducción nueva puesta. Pulsa «Guardar» para quedártela.';
  } catch {
    rev.editAviso.textContent = 'No se ha podido traducir. Puedes corregir la traducción a mano.';
  }
  rev.btnRetraducir.disabled = false;
}

function guardarEdicion() {
  const seg = fraseEditando;
  if (!seg) return;
  const original = rev.editOriginal.value.trim();
  if (!original) {
    // Texto vacío: se ofrece borrar la frase (útil para ruido o frases sin sentido).
    if (!confirm('El texto está vacío. ¿Borrar esta frase de la reunión?')) return;
    segmentos = segmentos.filter((s) => s !== seg);
  } else {
    if (original !== seg.original) seg.corregida = true;
    seg.original = original;
    if (seg.destino) {
      const trad = rev.editTraduccion.value.trim();
      if (trad !== (seg.traduccion ?? '')) seg.corregida = true;
      seg.traduccion = trad || null;
    }
  }
  hayCambios = true;
  fraseEditando = null;
  rev.dlgEditar.close();
  pintarRevision();
}

// ---------- Acta en Markdown ----------

function fechaLarga(d) {
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
const horaCorta = (d) => `${dos(d.getHours())}:${dos(d.getMinutes())}`;

function duracionActa(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${dos(min % 60)} min`;
}

function construirActa() {
  const inicio = new Date(reunion.inicio);
  const ultima = segmentos.length ? new Date(segmentos[segmentos.length - 1].hora) : inicio;
  const fin = reunion.fin ? new Date(reunion.fin) : ultima;
  const traduciendo = reunion.modo === 'traduccion';
  const minus = (t) => t.toLowerCase();

  // Sentidos de traducción usados (más de uno si se pulsó «Invertir»).
  const sentidos = [];
  for (const s of segmentos) {
    if (!s.destino) continue;
    const texto = `${minus(nombreCodigo(s.origen))} → ${minus(nombreCodigo(s.destino))}`;
    if (!sentidos.includes(texto)) sentidos.push(texto);
  }
  if (traduciendo && !sentidos.length) sentidos.push(`${minus(nombreOrigen())} → ${minus(nombreDestino())}`);

  // Interlocutores con frases, y cuántas frases quedan sin asignar.
  const cuenta = new Map();
  let sinAsignar = 0;
  for (const s of segmentos) {
    if (buscarInterlocutor(s.interlocutor)) cuenta.set(s.interlocutor, (cuenta.get(s.interlocutor) || 0) + 1);
    else sinAsignar++;
  }
  const conFrases = reunion.interlocutores.filter((i) => cuenta.has(i.id));
  const plural = (n) => `${n} ${n === 1 ? 'frase' : 'frases'}`;
  const listaInterlocutores = conFrases.map((i) => `${i.nombre} (${plural(cuenta.get(i.id))})`);
  if (sinAsignar) listaInterlocutores.push(`${SIN_ASIGNAR} (${plural(sinAsignar)})`);

  const l = [
    '# Acta de reunión',
    '',
    `- **Fecha:** ${fechaLarga(inicio)}`,
    `- **Hora de inicio:** ${horaCorta(inicio)}`,
    `- **Hora de fin:** ${horaCorta(fin)}`,
    `- **Duración:** ${duracionActa(fin - inicio)}`,
    traduciendo ? '- **Modo:** Traducción' : '- **Modo:** Reunión (un solo idioma)',
    traduciendo
      ? `- **Idiomas:** ${sentidos.join(' y ')}`
      : `- **Idioma:** ${minus(nombreOrigen())}`,
    `- **Interlocutores:** ${listaInterlocutores.length ? listaInterlocutores.join(', ') : 'ninguno'}`,
    `- **Frases:** ${segmentos.length}`,
    '',
    traduciendo
      ? '_Transcripción y traducción automáticas: pueden contener errores._'
      : '_Transcripción automática: puede contener errores._',
    '',
    '## Transcripción',
    '',
  ];
  for (const s of segmentos) {
    l.push(`**[${horaTexto(new Date(s.hora))}] ${nombreDe(s.interlocutor)}:** ${s.original}`, '');
    if (s.destino) {
      l.push(`> _Traducción (${minus(nombreCodigo(s.destino))}):_ ${s.traduccion ?? '(sin traducción)'}`, '');
    }
  }
  if (!segmentos.length) l.push('_(No se ha registrado ninguna frase.)_', '');

  l.push(
    '---',
    '',
    '## Instrucciones para el resumen',
    '',
    'Pega esta acta completa en Claude. Lo que sigue son las instrucciones para Claude:',
    '',
    'Redacta en español el resumen de esta reunión, usando solo la transcripción de arriba, con estos apartados:',
    '',
    '1. **Resumen:** de qué se habló, en 5 a 10 líneas.',
    '2. **Decisiones:** lo que se decidió, una por línea.',
    '3. **Tareas:** una tabla con las columnas Tarea, Responsable y Fecha. Si no se dijo el responsable o la fecha, escribe «sin definir»; no los inventes.',
    '4. **Temas pendientes:** lo que quedó abierto o sin decidir.',
    '',
    'Reglas obligatorias:',
    '',
    '- Las frases marcadas como «Sin asignar» no tienen autor conocido: no se las atribuyas a nadie.',
    '- Si por el contexto se puede deducir quién dijo una frase «Sin asignar», escríbelo como «probablemente <nombre>», nunca como un hecho.',
    '- No añadas nada que no esté en la transcripción.',
    traduciendo
      ? '- La transcripción y la traducción se hicieron de forma automática y pueden tener errores. Básate en el texto original; la traducción es solo una ayuda. Si algo no tiene sentido, dilo en vez de interpretarlo.'
      : '- La transcripción se hizo de forma automática y puede tener errores. Si algo no tiene sentido, dilo en vez de interpretarlo.',
    '',
  );
  return l.join('\n');
}

function nombreActa() {
  const d = new Date(reunion.inicio);
  return `acta_${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}_${dos(d.getHours())}-${dos(d.getMinutes())}.md`;
}

function descargarActa() {
  if (!reunion) return;
  const url = URL.createObjectURL(new Blob([construirActa()], { type: 'text/markdown;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreActa();
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  rev.aviso.textContent = `Descargada: ${nombreActa()}`;
  registrar('Acta descargada.');
}

async function copiarActa() {
  if (!reunion) return;
  const texto = construirActa();
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    // Si el portapapeles no deja, se copia a la antigua con un cuadro de texto oculto.
    const caja = document.createElement('textarea');
    caja.value = texto;
    caja.style.position = 'fixed';
    caja.style.opacity = '0';
    document.body.append(caja);
    caja.select();
    const ok = document.execCommand('copy');
    caja.remove();
    if (!ok) {
      rev.aviso.textContent = 'No se ha podido copiar. Usa «Descargar .md».';
      return;
    }
  }
  rev.aviso.textContent = 'Acta copiada ✓ Ya puedes pegarla.';
  registrar('Acta copiada.');
}

// ---------- Botones ----------

$('btnTerminar').addEventListener('click', terminarReunion);
$('btnVolverReunion').addEventListener('click', volverAReunion);
$('btnCopiarActa').addEventListener('click', copiarActa);
$('btnDescargarActa').addEventListener('click', descargarActa);
$('btnNuevaReunion').addEventListener('click', nuevaReunion);
$('btnNombresRevision').addEventListener('click', abrirNombres);
$('btnCancelarTramo').addEventListener('click', () => {
  cancelarTramo();
  pintarRevision();
});
$('btnEditarFrase').addEventListener('click', abrirEditar);
$('btnTramoDesdeAqui').addEventListener('click', empezarTramo);
$('btnCancelarFrase').addEventListener('click', () => {
  rev.dlgFrase.close();
  if (tramoDesde != null && frasesElegidas.length > 1) {
    cancelarTramo();
    pintarRevision();
  }
});
$('btnRetraducir').addEventListener('click', retraducir);
$('btnGuardarEdicion').addEventListener('click', guardarEdicion);
$('btnCancelarEdicion').addEventListener('click', () => rev.dlgEditar.close());
