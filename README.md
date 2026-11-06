# Traste

App web para aprender guitarra: **afinador**, **acordes** y **canciones**, escuchando tu guitarra por el micrófono. Todo el análisis ocurre en el navegador.

## Usarla

- **En el navegador o el móvil:** https://mesegstudio.github.io/Traste/ (GitHub Pages, sirve `index.html`).
- **Sin conexión:** abre `dist/traste.html` en Chrome, Edge o Firefox.

En ambos casos, permite el micrófono cuando el navegador lo pida. La primera vez con cada micrófono, Traste lo comprueba (unos 8 segundos: silencio y tres notas por el altavoz) y guarda el resultado en el navegador.

## Qué tiene

- **Afinador**: detecta la cuerda, una línea que hay que dejar en la franja verde (±5 cents) y "aprieta / afloja".
- **Acordes**: primeros pasos (postura, cómo pisar, cómo leer un diagrama, cómo rasguear) y 24 acordes en orden de aprendizaje, uno cada vez. Escucha cada rasgueo y dice qué falla; tres seguidos bien = aprendido. Reto de cambios en un minuto.
- **Canciones**: Fácil (melodía nota a nota) y Difícil (acordes con rasgueo); velocidad Muy lento 50 % · Lento 75 % · Normal 100 % · Rápido 120 %; "¡Justo!", "Pronto" y "Tarde" en cada nota; toca la partitura para empezar o pausar y desliza para moverte.

## Cómo escucha

| Qué | Técnica |
| --- | --- |
| Afinador | YIN (de Cheveigné y Kawahara, 2002) a ~24 kHz, mediana de 5 lecturas, ±5 cents = afinada |
| Notas en canciones | YIN o, si la cuerda anterior sigue sonando, la nota que "aparece" en el espectro tras el ataque (después − antes, FFT de 4096) |
| Acordes | Energía por semitono (FFT de 16384, compresión logarítmica) comparada con plantillas de armónicos: acorde correcto, con una cuerda apagada, con una cuerda ✕ sonando y el resto de acordes. Solo da un diagnóstico concreto si la evidencia es clara |
| Ataques | Subida brusca de nivel (RMS) por encima del umbral calibrado |
| Calibración | Ruido de fondo (percentil 30) y tres tonos triangulares (196, 330 y 440 Hz) para medir afinación y retardo; se guarda por micrófono |
| Micrófono | Sin cancelación de eco, supresión de ruido ni control de ganancia |

## Desarrollo

```
src/dsp.js      DSP y teoría (funciones puras)
src/data.js     acordes y canciones de dominio público
src/app.js      interfaz
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
