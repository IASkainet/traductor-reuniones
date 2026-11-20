# Traductor de reuniones

App web (PWA) de uso personal que escucha una reunión por el micrófono, la transcribe con el reconocimiento de voz de Google Chrome y, si quieres, la traduce en directo. Al terminar se revisa y se saca un acta en Markdown lista para resumir con Claude.

- **Coste cero:** sin cuentas, claves ni servicios de pago.
- **Nunca guarda audio.** Solo texto, y el texto se queda en el aparato.
- Funciona en **Google Chrome**: PC con Windows, móvil y tablet Android.

Dirección: <https://iaskainet.github.io/traductor-reuniones/>
Cómo instalarla (para compartir): <https://iaskainet.github.io/traductor-reuniones/instalar.html>

## Cómo se usa

1. **Inicio:** dos botones grandes.
   - **Traducción**: dos columnas, original y traducción (francés → español de serie).
   - **Reunión**: un solo idioma (español de serie), una columna, sin traductor.
   - «Cambiar idiomas» debajo de cada uno. La app recuerda el último modo (lo marca como «Último usado») y los idiomas.
   - Tocar el modo **empieza a escuchar al momento**.
2. **Durante la reunión:**
   - Estado grande con color y un marco alrededor de la pantalla: verde «Escuchando», ámbar «Reanudando…», rojo «PARADO» (se ha parado sola), gris «Parado» (lo has parado tú).
   - **Interlocutores** (barra de abajo): toca quién habla y se queda puesto en las frases siguientes. Sin tocar nada, las frases quedan «Sin asignar». «+» añade otro; «✎ Nombres» los renombra (se recuerdan para la próxima vez). En el PC, las teclas 1 a 9.
   - **⇄ Invertir** (modo Traducción): cambia el sentido (p. ej. a español → francés) cuando habla la otra parte.
   - **Parar / Seguir**: pausa. **Terminar**: pasa a la revisión.
3. **Revisión:** toca una frase para cambiar quién habla o corregirla. Para un tramo: toca la primera, «Seleccionar tramo desde aquí» y toca la última. «Volver a la reunión» permite seguir escuchando.
4. **Acta:** «Copiar acta» o «Descargar .md». Lleva fecha, horas, duración, modo, idiomas, interlocutores, la transcripción con quién habla (y la traducción) y, al final, las instrucciones para que Claude haga el resumen (decisiones, tareas, pendientes), con la regla de no atribuir a nadie las frases «Sin asignar».
5. **Nueva reunión** (en la revisión) borra la reunión del aparato y vuelve al inicio.

### Antes de la primera reunión

- En el inicio, **«Preparar mis idiomas»** (con wifi): descarga los traductores del par elegido y de su inverso (para «Invertir»), con progreso y estado: listo / falta / no disponible en este aparato. Si el aparato no puede traducir, la app funciona en solo transcripción y lo dice.
- Acepta el permiso del **micrófono**.

## Robustez

- **Reanudación automática** sin límite mientras no pulses Parar o Terminar. Silencios y cortes normales: se reintenta siempre. Sin red: se reintenta 30 s y luego para con aviso. Sin permiso de micrófono, sin micrófono o idioma no admitido: para con aviso.
- Al reanudar no se pierde lo que estaba en gris y se descartan las frases que Chrome reenvía repetidas.
- **Aviso grande** (pantalla roja, pitido cada 10 s y vibración si el aparato vibra) si se para sola o lleva más de 20 s sin conseguir escuchar.
- **Pantalla encendida** mientras escucha. Si la app pasó a segundo plano y se cortó el micrófono, al volver dice entre qué horas no se escuchó.
- **Copia de seguridad** en el aparato cada 3 s y al pasar a segundo plano (incluida la frase en curso y la revisión). Al abrir: «Recuperar la reunión anterior».
- **Menú ⋮ → Registro de diagnóstico:** hora de cada corte, motivo y si se reanudó (sin nada de lo que se dice). «Copiar» para pegárselo a Claude.
- **Menú ⋮ → Tamaño del texto** (A− / A+), para leer desde lejos. **Modo de prueba** para meter texto sin micrófono.

## Instalarla como app

Los pasos detallados están en la página **«Cómo instalarla»** (`instalar.html`, enlazada desde el inicio y el menú ⋮).

- **Android:** Chrome → menú ⋮ → «Añadir a pantalla de inicio» → «Instalar». Aparece el icono «Reuniones».
- **Windows:** en la app, botón «Instalar la app» (o el icono de instalar de la barra de direcciones de Chrome). Queda en el menú Inicio como «Traductor de reuniones», con su icono, y se abre en su propia ventana sin barra de direcciones. Para el escritorio: arrástrala desde «Todas las aplicaciones». Para la barra de tareas: clic derecho en su icono → «Anclar a la barra de tareas».
- **Aviso de versión nueva:** cuando se publica un cambio, la app muestra arriba «Hay una actualización, toca para recargar». Al tocarlo se recarga y la reunión en curso vuelve sola (luego pulsa «Seguir»).

### Plan B en Windows: carpeta `acceso-windows`

Para un PC donde Chrome no ofrezca instalarla. Crea un acceso «Traductor de reuniones» en el **escritorio** y en el **menú Inicio** que abre Chrome en modo app (`chrome.exe --app=https://iaskainet.github.io/traductor-reuniones/`), con el icono de la app. No es un programa (.exe): solo crea los dos accesos y guarda el icono (unos 30 KB) en `%LOCALAPPDATA%\TraductorReuniones`.

- **Con la carpeta:** doble clic en `crear-acceso.cmd`.
- **Solo con el script:** clic derecho en `crear-acceso.ps1` → «Ejecutar con PowerShell». (Se puede descargar suelto desde la página «Cómo instalarla»; si no tiene el icono al lado, lo baja de la web.)
- Si Windows avisa de que el archivo viene de Internet: «Más información» → «Ejecutar de todas formas».

## Cómo funciona por dentro

- **Reconocimiento de voz:** el de Chrome (Web Speech API). Envía el sonido al servicio de Google y devuelve texto: **necesita Internet**. En Android escucha frase a frase y se reconecta tras cada una.
- **Traducción en el PC:** el traductor integrado de Chrome (Translator API), dentro del PC. Los paquetes de idioma van al perfil de Chrome en C: (`...\Chrome\User Data\TranslateKit`), no se puede cambiar.
- **Traducción en Android:** modelo abierto Opus-MT (unos 120 MB por pareja de idiomas) que funciona dentro del aparato con Transformers.js (desde jsDelivr). No hay portugués.
- **App instalable:** `manifest.webmanifest` (nombre, iconos, pantalla sin barra del navegador, orientación libre) y `sw.js` (guarda los archivos de la app para que abra al instante y avisa de versiones nuevas).

### Archivos

- `index.html`, `estilos.css`: la página y su aspecto.
- `app.js`: escucha, traducción, copia de seguridad.
- `inicio.js`: pantalla de inicio, modos, idiomas, «Preparar mis idiomas», tamaño del texto.
- `interlocutores.js`: botones de quién habla.
- `revision.js`: revisión y acta.
- `avisos.js`: aviso grande, pitido y vibración.
- `diagnostico.js`: registro de diagnóstico y menú ⋮.
- `instalable.js`, `sw.js`, `manifest.webmanifest`, `iconos/`: app instalable y avisos de actualización.
- `traductor-movil.js`: el traductor que funciona dentro del aparato (Android).
- `instalar.html`: página «Cómo instalarla».
- `acceso-windows/`: plan B para Windows.

## Para publicar un cambio

1. **Sube el número de `VERSION` en `sw.js`** (y el de `VERSION_APP` en `diagnostico.js`). Sin esto, los aparatos con la app instalada siguen con la versión vieja.
2. `git push`. En unos minutos se ve en <https://iaskainet.github.io/traductor-reuniones/> y aparece el aviso de actualización.

## Probarla en el PC sin publicar

1. En una terminal (PowerShell):

   ```
   python -m http.server 8000 --bind 127.0.0.1 --directory "D:\Proyectos IA\Apps personales\TraductorReuniones"
   ```

2. Abre **Google Chrome** (no el panel de navegador de la app de Claude) en <http://localhost:8000>.
3. Ojo: con la copia guardada por `sw.js`, tras cambiar archivos hay que subir `VERSION` o, en Chrome, F12 → Application → Service workers → «Unregister».

## Limitaciones conocidas

- **Solo Chrome** (138 o superior en el PC). En Samsung, no vale el navegador «Internet» de Samsung.
- **Cortes:** mientras Chrome vuelve a abrir el micrófono (0,2 a 1 s) lo que se diga no se oye.
- **No distingue voces:** quién habla lo marcas tú con los botones. Una frase se asigna a quien está elegido cuando la frase se confirma.
- **Un idioma a la vez:** el reconocimiento solo entiende el idioma elegido; si habla la otra parte en su idioma, usa «Invertir».
- **Pitido de aviso:** sale por el volumen multimedia. Con la pantalla bloqueada puede que no suene. Muchas tablets no vibran.
- **Segundo plano en Android:** si bloqueas la pantalla o cambias de app, se deja de escuchar; la app pita a los 20 s y avisa al volver.
- **Copia de seguridad única:** solo la reunión en curso y solo en ese aparato. Lo definitivo es el acta copiada o descargada.
