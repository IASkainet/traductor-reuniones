# Traductor de reuniones (prototipo personal)

Escucha una reunión por el micrófono y muestra la pantalla en dos mitades: a la izquierda lo que se dice (por defecto en francés) y a la derecha su traducción (por defecto al español). Al terminar se descarga la transcripción en Markdown.

Solo guarda texto, nunca audio. No usa cuentas, claves ni servicios de pago.

## Cómo arrancarlo

1. Abre una terminal (PowerShell) y ejecuta:

   ```
   python -m http.server 8000 --bind 127.0.0.1 --directory "D:\Proyectos IA\Apps personales\TraductorReuniones"
   ```

2. Abre **Google Chrome** (no otro navegador) y entra en <http://localhost:8000>.
   Ojo: el panel de navegador que trae la app de Claude no vale; ahí no funcionan ni el micrófono ni la traducción.
3. Deja la terminal abierta mientras uses la app. Para apagarla, pulsa `Ctrl + C` en la terminal.

No instala ni descarga nada: usa el Python que ya tiene el PC.

## Versión para móvil Android

No hace falta el PC: la misma app está publicada en <https://iaskainet.github.io/traductor-reuniones/>. Ábrela con **Chrome** en el móvil.

**La primera vez (hazlo con wifi, antes de la reunión)**

1. Pulsa «Descargar traductor». Baja una vez un traductor de unos 120 MB que funciona dentro del móvil; espera a que ponga «listo».
2. Pulsa **Iniciar** y acepta el permiso de micrófono.
3. Baja el volumen multimedia del móvil: Android pita cada vez que el micrófono se vuelve a conectar.

**Cómo se ve**

- Móvil en vertical: cada frase con su traducción debajo (marcada con una raya verde).
- Móvil tumbado: las dos mitades, como en el PC.
- Mientras escucha se esconden los selectores y botones para dejar sitio al texto; vuelven al pulsar Parar.

**Diferencias con el PC**

- La traducción no usa el traductor de Chrome (no existe en Android), sino un modelo abierto (Opus-MT) que se ejecuta en el propio móvil. El texto no sale del teléfono. Es algo más lento y traduce un poco distinto.
- En Android el micrófono se corta al final de cada frase y se vuelve a conectar solo. En ese instante puede perderse alguna palabra.
- La pantalla se mantiene encendida mientras escucha. Si bloqueas el móvil o cambias de app, la escucha se detiene y se reanuda al volver.
- No hay portugués en el móvil (no existe ese modelo).

Para publicar un cambio hecho en esta carpeta: `git push` (tarda unos minutos en verse en el móvil).

## Cómo probarlo

**Sin micrófono (modo de prueba)**

1. Abajo del todo, abre «Modo de prueba (sin micrófono)».
2. Pega un texto en francés y pulsa «Traducir este texto».
3. Cada frase aparece a la izquierda y su traducción a la derecha.
4. Pulsa «Descargar .md» y abre el archivo descargado.

**Con micrófono**

1. Pulsa **Iniciar**. La primera vez Chrome pide permiso para el micrófono: acéptalo.
2. Habla o pon audio en francés. El texto sale en gris mientras se dice y pasa a negro al confirmarse.
3. Pulsa **Parar** al terminar y descarga el `.md`.

**Primera vez con un par de idiomas nuevo**

Chrome tiene que descargar el paquete de traducción. Pulsa «Descargar traductor» (o Iniciar) y espera a que ponga «listo». Si falla, pulsa «Reintentar».

## Qué hace cada cosa

- **Aviso amarillo**: recuerda que hay que informar a los asistentes.
- **Punto de estado**: rojo latiendo = escuchando; ámbar = reconectando; gris = parado.
- **Copia de seguridad**: la transcripción se guarda sola en el navegador cada 3 segundos. Si cierras la pestaña, al volver a abrirla ofrece recuperarla.
- **Borrar todo**: vacía la pantalla y la copia de seguridad para empezar una reunión nueva.

## Limitaciones conocidas

- **Solo Chrome** (versión 138 o superior en ordenador). En Android funciona con otro traductor; ver «Versión para móvil Android».
- **Necesita Internet para escuchar**: el reconocimiento de voz envía el audio a Google. La traducción, en cambio, se hace dentro del PC.
- **Cortes**: Chrome para el reconocimiento tras un silencio o cada cierto tiempo. La app lo reinicia sola, pero en ese instante puede perderse alguna palabra.
- **«Frases»**: Chrome decide dónde termina cada trozo según las pausas, y a menudo sin puntuación. Cada fila es un trozo de habla, no siempre una frase completa.
- **Altavoz y varias voces**: no se distingue quién habla y el eco empeora el resultado.
- **Paquetes de idioma en C:**: Chrome guarda los paquetes de traducción en su propio perfil (`C:\Users\<usuario>\AppData\Local\Google\Chrome\User Data\TranslateKit`). No se puede cambiar desde la app.
- **Copia de seguridad única**: solo se guarda la transcripción en curso, y solo en este Chrome. Lo definitivo es el `.md` descargado.
- **La traducción en gris es orientativa**: se rehace con la frase completa al confirmarse.

## Archivos

- `index.html`: la página.
- `estilos.css`: el aspecto.
- `app.js`: la lógica (escucha, traducción, copia de seguridad y descarga).
- `traductor-movil.js`: el traductor que funciona dentro del dispositivo (Android).
