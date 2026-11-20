'use strict';

/* App instalable: registra el service worker (sw.js), avisa cuando hay una versión nueva
   («Hay una actualización, toca para recargar») y ofrece el botón «Instalar la app». */

const CLAVE_TRAS_ACTUALIZAR = 'traductorReuniones.trasActualizar';
const COMPROBAR_ACTUALIZACION_MS = 30 * 60 * 1000;

const avisoActualizacion = $('avisoActualizacion');
const btnInstalarApp = $('btnInstalarApp');
let registroSW = null;
let recargaPedida = false;
let peticionInstalar = null;

function avisarActualizacion() {
  avisoActualizacion.hidden = false;
  registrar('Hay una versión nueva de la app esperando.');
}

// Al tocar el aviso: se guarda la reunión, se activa la versión nueva y se recarga.
// Después de recargar, la reunión se recupera sola (ver app.js).
function aplicarActualizacion() {
  const espera = registroSW && registroSW.waiting;
  if (!espera) {
    location.reload();
    return;
  }
  if (quiereEscuchar && !confirm('La escucha se parará un momento mientras se recarga. Después pulsa «Seguir». ¿Recargar ahora?')) return;
  if (quiereEscuchar) pararEscucha();
  if (reunion) {
    if (filaProv) confirmarFrase(filaProv.texto);
    hayCambios = true;
    guardarCopia();
    try { sessionStorage.setItem(CLAVE_TRAS_ACTUALIZAR, '1'); } catch { /* da igual */ }
  }
  registrar('Actualizando a la versión nueva.');
  recargaPedida = true;
  espera.postMessage('saltar-espera');
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((registro) => {
    registroSW = registro;
    if (registro.waiting && navigator.serviceWorker.controller) avisarActualizacion();
    registro.addEventListener('updatefound', () => {
      const nuevo = registro.installing;
      if (!nuevo) return;
      nuevo.addEventListener('statechange', () => {
        // Solo es «actualización» si ya había una versión funcionando.
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) avisarActualizacion();
      });
    });
    setInterval(() => registro.update().catch(() => {}), COMPROBAR_ACTUALIZACION_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) registro.update().catch(() => {});
    });
  }).catch((e) => registrar(`No se ha podido preparar la app para funcionar instalada (${(e && e.message) || e}).`));

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargaPedida) location.reload();
  });
}

avisoActualizacion.addEventListener('click', aplicarActualizacion);

// ---------- Botón «Instalar la app» (Chrome lo permite cuando la app se puede instalar) ----------

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  peticionInstalar = e;
  btnInstalarApp.hidden = false;
});

btnInstalarApp.addEventListener('click', async () => {
  if (!peticionInstalar) {
    location.href = 'instalar.html';
    return;
  }
  peticionInstalar.prompt();
  const { outcome } = await peticionInstalar.userChoice;
  registrar(`Instalar la app: ${outcome === 'accepted' ? 'aceptado' : 'cancelado'}.`);
  peticionInstalar = null;
  btnInstalarApp.hidden = true;
});

window.addEventListener('appinstalled', () => {
  btnInstalarApp.hidden = true;
  registrar('App instalada.');
});
