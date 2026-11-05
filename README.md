# Traste

App web para aprender guitarra: **afinador**, **acordes** y **canciones**, escuchando tu guitarra por el micrófono. Todo el análisis ocurre en el navegador.

## Usarla

Abre `dist/traste.html` en Chrome, Edge o Firefox y permite el micrófono. Funciona como archivo local (`file://`) o en cualquier hosting estático con https (por ejemplo, GitHub Pages o Netlify, para usarla desde el móvil).

Primero pulsa **Calibrar**: mide el ruido, emite tonos por el altavoz para comprobar que el micrófono los oye afinados y ajusta la sensibilidad con tu guitarra.

## Cómo escucha

| Qué | Técnica |
| --- | --- |
| Notas sueltas y afinador | YIN (de Cheveigné y Kawahara, 2002) a ~24 kHz, mediana de 5 lecturas, ±5 cents = afinada |
| Acordes | Energía por semitono (FFT de 16384) comparada con plantillas de armónicos de varias hipótesis: acorde correcto, con una cuerda apagada, con una cuerda ✕ sonando y el resto de acordes |
| Ataques | Subida brusca de nivel (RMS) por encima del umbral calibrado |
| Micrófono | Sin cancelación de eco, supresión de ruido ni control de ganancia |

## Desarrollo

```
src/dsp.js      DSP y teoría (funciones puras)
src/data.js     acordes y canciones de dominio público
src/app.js      interfaz
src/body.html   estructura · src/styles.css  estilos
build.js        genera dist/traste.html (Tailwind 3.4.17 compilado e incrustado)
test/           pruebas en Node con cuerdas sintetizadas
```

```bash
cd tools && npm install && cd ..
node build.js
node test/dsp.test.js
```

Para añadir una canción, añade una entrada a `SONGS` en `src/data.js`: melodía como `"G3 A3:0.5 R:1 | ..."` (nota:tiempos) y acordes por compás (`"G | C G | ..."`).
