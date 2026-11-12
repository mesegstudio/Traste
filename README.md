# Traste

App web para aprender guitarra: **afinador**, **aprender** (acordes y punteo), **canciones** y **ajustes**, escuchando tu guitarra por el micrófono. Todo el análisis ocurre en el navegador.

## Usarla

- **En el navegador o el móvil:** https://mesegstudio.github.io/Traste/ (GitHub Pages, sirve `index.html`).
- **Sin conexión:** abre `dist/traste.html` en Chrome, Edge o Firefox.

En ambos casos, permite el micrófono cuando el navegador lo pida. La primera vez con cada micrófono, Traste lo ajusta (unos 8 segundos: mide el ruido de la sala y hace sonar tres notas por el altavoz) y guarda el resultado en el navegador. Se puede repetir desde el afinador o desde Ajustes.

## Qué tiene

- **Afinador**: automático (detecta la cuerda que pulsas) o eligiendo la cuerda en el dibujo, con la 6ª (la más grave) abajo. La lectura se queda anclada a la cuerda pulsada para que las resonancias no la muevan.
- **Aprender**: eliges nivel (Empiezo, Básico, Intermedio) y sigues la **práctica de hoy**, que empieza por afinar, incluye una clase corta y elige el ejercicio y el cambio de acordes que peor llevas. Lleva la racha de días seguidos. También puedes entrar por tu cuenta en:
  - **Acordes**: 25 acordes en orden de aprendizaje, cada uno en tres pasos (colócalo, **compruébalo cuerda a cuerda** con el micrófono, cámbialo), repaso de memoria, cambios de un minuto y rasgueo con metrónomo, incluidos los cambios cada dos tiempos y en cada tiempo.
  - **Punteo**: araña y variantes, púa alterna, índice fijo, anular y meñique, saltos de cuerda, martillos, tirones, estiramiento, fuerza de cejilla, arpegio p-i-m-a, notas del mástil y escalas. Van con metrónomo y guardan tu **velocidad limpia**: si un ejercicio sale con un 85 % o más, la próxima vez va 5 pulsos más rápido.
  - **Clases**: 20 clases de dos o tres minutos con ejemplos que se pueden escuchar y una pregunta al final. Qué es un acorde, mayor y menor, séptimas, familias de acordes, cambiar sin parar, cejilla, rasgueo, púa, tocar con los dedos, notas del mástil, escala mayor, pentatónica, ligados, tocar limpio y cómo practicar.
  - **Oído**: mayor o menor, qué acorde suena, qué cuerda es y cuál es más aguda. Sin micrófono.
- **Canciones**: 26 canciones de dominio público con buscador y categorías. Fácil (melodía), Arpegio (los acordes nota a nota) y Difícil (acordes con rasgueo), a cuatro velocidades. Avisos Perfecto, Bien, Pronto, Tarde y Fallo, puntos con multiplicador de racha y estrellas por precisión. Se puede **repetir un tramo** de 1, 2, 4 u 8 compases: cada vuelta da su porcentaje y, si pasa del 90 %, la velocidad sube sola. Al terminar propone repetir los dos compases donde más se falla.
- **Añadir canción**: pegas el cifrado tal cual lo copias de La Cuerda, Ultimate Guitar o Cifra Club, o abres un archivo de **Guitar Pro o MusicXML**, que trae el tempo y la duración exacta de cada nota. Se guarda solo en el navegador, para uso personal.
- **Ajustes**: micrófono y su calibración, **probar la escucha** (qué nota ha oído, si ha sonado limpia y cuánto ha aguantado), notación Do Re Mi / C D E, diagramas verticales u horizontales, diestro o zurdo, tema y borrar el progreso.
- La portada publicada se puede instalar en el móvil y funciona sin conexión. La pantalla no se apaga mientras el micrófono escucha.

## Cómo escucha

El micrófono llega en bloques numerados (AudioWorklet, con ScriptProcessor de reserva) y se analiza como un flujo continuo, así que cada ataque se fecha por su muestra y no por el fotograma de pantalla. Validado con grabaciones reales de guitarra con micrófono ([GuitarSet](https://zenodo.org/records/3371780), CC BY 4.0) además de cuerdas sintetizadas.

| Qué | Técnica | Con audio real |
| --- | --- | --- |
| Afinador | YIN a ~24 kHz, mediana de 5 lecturas, ±5 cents = afinada | — |
| Ataques | Flujo espectral con filtro de máximo y umbral adaptativo (ventana de 2048, un salto cada 5 ms). Oye una cuerda repetida aunque el volumen no baje y una nota 26 dB por debajo de otra que suena | 84 % de las notas (el resto son ligados) · error de tiempo de 13 ms |
| Notas | Una nota solo cuenta si se pulsa en el ataque: es la que aparece en el espectro (después − antes), o la que domina y además sus armónicos suben | 1,0 % de notas que solo seguían sonando aceptadas (antes 13,3 %) · 1,2 % de equivocadas (antes 4,4 %) |
| Ligados | Sin golpe de púa: la nota no sonaba y sus armónicos suben 6 dB en 120 ms | rescata la mitad de las notas sin ataque · 0 de 57 notas largas la disparan |
| Rasgueos | Plantillas de armónicos sobre lo que suena desde el ataque (sin el acorde anterior), con regla tolerante | 83 % aceptados · 8 % de notas sueltas aceptadas |
| Ritmo | El ataque se sitúa en la canción por su fecha de muestra. Perfecto ±55 ms, Bien ±110 ms, Pronto o Tarde hasta ±200 ms. El clic se programa por adelantado para que suene en el pulso | — |
| Pisada | Caída de los armónicos de la nota entre 30 y 190 ms tras el ataque. Más de 17 dB es una nota que se apaga | menos del 1 % de notas limpias marcadas |
| Calibración | Ruido de fondo, tres tonos de prueba y doce clics para tocar encima, que miden el retardo real del micrófono. Se guarda por micrófono | — |

No se juzga la dirección del rasgueo (↓/↑): con solo audio no es fiable. El trasteo se mide (parte de agudos que queda tras el ataque) y se enseña en «Probar la escucha», pero todavía no se juzga: hacen falta grabaciones reales de trasteo para poner el umbral.

## Canciones: de dónde salen

Melodías tradicionales o de compositores en dominio público, transcritas a mano y comprobadas compás a compás por las pruebas. Las canciones comerciales no se incluyen: sus melodías y letras tienen derechos y el repositorio es público. Lo que el usuario pega o abre desde un archivo se queda en su navegador.

## Desarrollo

```
src/dsp.js      DSP y teoría (funciones puras)
src/listen.js   oído: flujo de audio, ataques, nota pulsada, ligados y pisada (funciones puras)
src/data.js     acordes, canciones de dominio público y categorías
src/cifrado.js  lector de cifrados pegados (funciones puras, con pruebas)
src/tabfile.js  archivos de Guitar Pro y MusicXML (alphaTab, MPL-2.0, se descarga al abrir uno)
src/mysongs.js  pantalla «Añadir canción» y canciones guardadas en el navegador
src/app.js      interfaz: afinador, micrófono, diagramas, canciones, ajustes
src/classes.js  clases de teoría y técnica, y juegos de oído
src/learn.js    Aprender: niveles, práctica de hoy, lecciones y ejercicios
manifest.webmanifest, sw.js, icon-*.png   instalable y sin conexión (solo la portada publicada)
src/body.html   estructura · src/styles.css  estilos
build.js        genera dist/traste.html e index.html (Tailwind 3.4.17 compilado e incrustado)
test/           pruebas en Node con cuerdas sintetizadas
```

```bash
cd tools && npm install && cd ..
node build.js
node test/dsp.test.js
```

Para añadir una canción, añade una entrada a `SONGS` en `src/data.js`: melodía como `"G3 A3:0.5 R:1 | ..."` (nota:tiempos) y acordes por compás (`"G | C G | ..."`).
