'use strict';

/* Service worker: guarda los archivos de la app en el aparato para que abra al instante
   (y aunque falle la red), y permite avisar cuando hay una versión nueva.
   IMPORTANTE: al publicar cualquier cambio, sube el número de VERSION. Si no, los aparatos
   que ya tienen la app instalada seguirán usando la versión vieja. */

const VERSION = '2.0.0';
const CACHE = `traductor-reuniones-${VERSION}`;

const ARCHIVOS = [
  './',
  './index.html',
  './instalar.html',
  './estilos.css',
  './diagnostico.js',
  './avisos.js',
  './app.js',
  './inicio.js',
  './interlocutores.js',
  './revision.js',
  './instalable.js',
  './traductor-movil.js',
  './manifest.webmanifest',
  './iconos/favicon-32.png',
  './iconos/icono-180.png',
  './iconos/icono-192.png',
  './iconos/icono-256.png',
  './iconos/icono-512.png',
  './iconos/icono-enmascarable-512.png',
];

self.addEventListener('install', (e) => {
  // No se activa sola: espera a que el usuario toque «Hay una actualización».
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS.map((a) => new Request(a, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const nombre of await caches.keys()) {
      if (nombre.startsWith('traductor-reuniones-') && nombre !== CACHE) await caches.delete(nombre);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'saltar-espera') self.skipWaiting();
});

// Los archivos de la app salen de la copia guardada; lo demás (el traductor del móvil,
// que viene de otros sitios) va directo a Internet.
self.addEventListener('fetch', (e) => {
  const peticion = e.request;
  if (peticion.method !== 'GET' || new URL(peticion.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardado = await cache.match(peticion, { ignoreSearch: peticion.mode === 'navigate' });
    if (guardado) return guardado;
    try {
      return await fetch(peticion);
    } catch (err) {
      if (peticion.mode === 'navigate') {
        const portada = await cache.match('./');
        if (portada) return portada;
      }
      throw err;
    }
  })());
});
