'use strict';

/* Avisos grandes a pantalla completa, con pitido y vibración.
   El pitido lo genera la propia página (no hay archivos de sonido).
   La vibración solo funciona si el aparato tiene motor de vibración (muchas tablets no). */

const PITAR_CADA_MS = 10000; // mientras el aviso siga abierto, vuelve a pitar cada 10 s

const capaAlarma = document.getElementById('alarma');
const alarmaTitulo = document.getElementById('alarmaTitulo');
const alarmaTexto = document.getElementById('alarmaTexto');
const alarmaBotones = document.getElementById('alarmaBotones');

let alarmaActual = null; // { tipo, sonido } del aviso que se ve ahora, o null
let ultimoPitido = 0;

// tipo: 'parada' (se paró sola), 'atascado' (no consigue reanudar), 'vuelta' (se cortó en segundo plano)
// botones: [{ texto, accion, principal }]
function mostrarAlarma({ tipo, titulo, texto, sonido = false, botones = [] }) {
  alarmaActual = { tipo, sonido };
  capaAlarma.dataset.tipo = tipo;
  alarmaTitulo.textContent = titulo;
  alarmaTexto.textContent = texto;
  alarmaBotones.textContent = '';
  for (const b of botones) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.textContent = b.texto;
    if (b.principal) boton.className = 'principal';
    boton.addEventListener('click', () => {
      cerrarAlarma();
      if (b.accion) b.accion();
    });
    alarmaBotones.append(boton);
  }
  capaAlarma.hidden = false;
  if (sonido) {
    pitar();
    vibrar();
  }
  const principal = alarmaBotones.querySelector('.principal');
  if (principal) principal.focus();
}

function cerrarAlarma() {
  alarmaActual = null;
  capaAlarma.hidden = true;
}

// Se llama cada medio segundo: repite el pitido mientras el aviso siga sin atender.
function repetirPitido(ahora) {
  if (alarmaActual && alarmaActual.sonido && ahora - ultimoPitido >= PITAR_CADA_MS) {
    pitar();
    vibrar();
  }
}

// Dos tonos cortos (agudo y algo más grave), unos 0,5 s en total.
function pitar() {
  ultimoPitido = Date.now();
  const Contexto = window.AudioContext || window.webkitAudioContext;
  if (!Contexto) return;
  try {
    const ctx = new Contexto();
    const t0 = ctx.currentTime + 0.05;
    [[0, 880], [0.28, 660]].forEach(([retraso, frecuencia]) => {
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = frecuencia;
      vol.gain.setValueAtTime(0.0001, t0 + retraso);
      vol.gain.exponentialRampToValueAtTime(0.35, t0 + retraso + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, t0 + retraso + 0.22);
      osc.connect(vol).connect(ctx.destination);
      osc.start(t0 + retraso);
      osc.stop(t0 + retraso + 0.24);
    });
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch { /* sin sonido: queda el aviso en pantalla */ }
}

function vibrar() {
  try {
    // Chrome solo deja vibrar si ya se ha tocado la página alguna vez (al pulsar Iniciar).
    const tocada = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    if (navigator.vibrate && tocada) navigator.vibrate([400, 150, 400]);
  } catch { /* el aparato no vibra */ }
}
