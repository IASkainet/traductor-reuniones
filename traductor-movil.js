/* Traductor que funciona dentro del propio dispositivo.
   Se usa cuando el navegador no trae el traductor de Chrome (por ejemplo en Android).
   Va en un hilo aparte para que la pantalla no se quede congelada mientras traduce.
   Descarga una vez un modelo abierto (Opus-MT) desde Hugging Face; el texto de la
   reunión no sale del dispositivo. */

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowLocalModels = false;

const TAMANO_ESPERADO = 117e6; // lo que pesan los dos archivos del modelo, aprox.
let traducir = null;
const descargas = new Map(); // archivo -> [bytes descargados, bytes totales]

function avisarProgreso(p) {
  if (p.status !== 'progress' || !p.total || !/\.onnx$/.test(p.file || '')) return;
  descargas.set(p.file, [p.loaded, p.total]);
  let hecho = 0;
  let total = 0;
  for (const [a, b] of descargas.values()) {
    hecho += a;
    total += b;
  }
  self.postMessage({ tipo: 'progreso', parte: Math.min(1, hecho / Math.max(total, TAMANO_ESPERADO)) });
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.tipo === 'cargar') {
    try {
      traducir = await pipeline('translation', `Xenova/opus-mt-${m.origen}-${m.destino}`, {
        dtype: 'q8', // versión comprimida: más pequeña y rápida
        progress_callback: avisarProgreso,
      });
      self.postMessage({ tipo: 'listo' });
    } catch (err) {
      self.postMessage({ tipo: 'error', mensaje: String((err && err.message) || err) });
    }
  } else if (m.tipo === 'traducir') {
    const t0 = performance.now();
    try {
      const salida = await traducir(m.texto, { max_new_tokens: 256 });
      self.postMessage({ tipo: 'traduccion', id: m.id, texto: salida[0].translation_text, ms: performance.now() - t0 });
    } catch (err) {
      self.postMessage({ tipo: 'traduccion', id: m.id, error: String((err && err.message) || err) });
    }
  }
};
