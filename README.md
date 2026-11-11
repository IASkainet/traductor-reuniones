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

- **Solo Chrome de ordenador, versión 138 o superior.** En Chrome para Android no existe el traductor integrado.
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
