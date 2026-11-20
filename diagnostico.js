'use strict';

/* Registro de diagnóstico: apunta la hora de cada corte o parada de la escucha, el motivo
   y si se reanudó, para poder averiguar qué falla. Solo guarda datos técnicos (horas y
   motivos), nunca frases de la reunión. Se queda en este aparato. */

const VERSION_APP = '1.4 · fase 4 (revisión y acta)';
const CLAVE_DIARIO = 'traductorReuniones.diagnostico';
const MAX_DIARIO = 500; // entradas que se conservan (las más antiguas se van borrando)

let diario = [];
try {
  const leido = JSON.parse(localStorage.getItem(CLAVE_DIARIO));
  if (Array.isArray(leido)) diario = leido;
} catch { /* registro ilegible: se empieza de cero */ }

const dosCifras = (n) => String(n).padStart(2, '0');

function momentoTexto(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())} `
    + `${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}:${dosCifras(d.getSeconds())}`;
}

// Duración legible: «0,4 s», «12 s», «3 min 5 s».
function duracionTexto(ms) {
  if (ms < 10000) return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min ${s % 60} s`;
}

function registrar(texto) {
  diario.push({ t: Date.now(), texto });
  if (diario.length > MAX_DIARIO) diario.splice(0, diario.length - MAX_DIARIO);
  try { localStorage.setItem(CLAVE_DIARIO, JSON.stringify(diario)); } catch { /* sin espacio: da igual */ }
  if (dlgDiario.open) pintarDiario();
}

function textoDiario() {
  const cabecera = [
    `Traductor de reuniones · versión ${VERSION_APP}`,
    `Aparato: ${navigator.userAgent}`,
    `Copiado el ${momentoTexto(Date.now())}`,
    '',
  ];
  const lineas = diario.map((e) => `${momentoTexto(e.t)} · ${e.texto}`);
  return cabecera.concat(lineas.length ? lineas : ['(registro vacío)']).join('\n');
}

// ---------- Menú y ventana del registro ----------
const dlgMenu = document.getElementById('dlgMenu');
const dlgDiario = document.getElementById('dlgDiario');
const txtDiario = document.getElementById('txtDiario');
const avisoCopiaDiario = document.getElementById('avisoCopiaDiario');

function pintarDiario() {
  txtDiario.value = textoDiario();
  txtDiario.scrollTop = txtDiario.scrollHeight;
}

for (const b of document.querySelectorAll('.btn-menu')) b.addEventListener('click', () => dlgMenu.showModal());
document.getElementById('btnCerrarMenu').addEventListener('click', () => dlgMenu.close());
document.getElementById('versionApp').textContent = `Versión ${VERSION_APP}`;

document.getElementById('btnAbrirDiario').addEventListener('click', () => {
  dlgMenu.close();
  avisoCopiaDiario.textContent = '';
  pintarDiario();
  dlgDiario.showModal();
});
document.getElementById('btnCerrarDiario').addEventListener('click', () => dlgDiario.close());

document.getElementById('btnCopiarDiario').addEventListener('click', async () => {
  const texto = textoDiario();
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    // Si el portapapeles no deja, se selecciona el texto para copiarlo a mano.
    txtDiario.focus();
    txtDiario.select();
    document.execCommand('copy');
  }
  avisoCopiaDiario.textContent = 'Copiado. Ya puedes pegarlo donde quieras.';
});

document.getElementById('btnBorrarDiario').addEventListener('click', () => {
  if (!confirm('Se borrará el registro de diagnóstico. ¿Continuar?')) return;
  diario = [];
  try { localStorage.removeItem(CLAVE_DIARIO); } catch { /* da igual */ }
  avisoCopiaDiario.textContent = '';
  pintarDiario();
});
