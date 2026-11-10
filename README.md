# Traste

App web para aprender guitarra: **afinador**, **acordes** y **canciones**, escuchando tu guitarra por el micrófono. Todo el análisis ocurre en el navegador.

## Usarla

- **En el navegador o el móvil:** https://mesegstudio.github.io/Traste/ (GitHub Pages, sirve `index.html`).
- **Sin conexión:** abre `dist/traste.html` en Chrome, Edge o Firefox.

En ambos casos, permite el micrófono cuando el navegador lo pida. La primera vez con cada micrófono, Traste lo comprueba (unos 8 segundos: silencio y tres notas por el altavoz) y guarda el resultado en el navegador.

## Qué tiene

- **Afinador**: automático (detecta la cuerda que pulsas) o eligiendo la cuerda en el dibujo. La cuerda que suena vibra en pantalla; se queda "anclada" a la cuerda pulsada para que las resonancias no muevan la lectura.
- **Acordes**: primeros pasos, 25 acordes en orden de aprendizaje con diagrama y pasos por dedo, **comprobación cuerda a cuerda** con el micrófono, repaso de memoria y cambios en un minuto.
- **Canciones**: 17 canciones de dominio público con buscador y categorías. Fácil (melodía) y Difícil (acordes con rasgueo), velocidad Muy lento 50 % · Lento 75 % · Normal 100 % · Rápido 120 %. Bola que salta a la nota que toca, avisos Perfecto / Pronto / Tarde / Fallo, puntos con multiplicador de racha (×2 a 10, ×3 a 20, ×4 a 30) y estrellas por precisión (perfecto 1, pronto/tarde 0,5, fallo 0: 40 % / 65 % / 85 %). Toca la partitura para empezar o pausar; desliza (con inercia) para moverte.

## Cómo escucha

Validado con grabaciones reales de guitarra con micrófono ([GuitarSet](https://zenodo.org/records/3371780), CC BY 4.0) además de cuerdas sintetizadas.

| Qué | Técnica | Con audio real |
| --- | --- | --- |
| Afinador | YIN a ~24 kHz, mediana de 5 lecturas, ±5 cents = afinada | — |
| Notas | Cada ataque vale para una sola nota. Se identifica con la primera lectura estable de YIN 30-250 ms después del ataque o con la nota que "aparece" en el espectro (FFT de 4096, después − antes) | 88 % reconocidas · 0,9 % equivocadas aceptadas |
| Comprobar un acorde | Cuerda a cuerda, con el mismo detector de notas; solo dice "suena X" si los dos detectores coinciden | — |
| Rasgueos (canciones, Difícil) | Plantillas de armónicos (FFT de 16384, compresión logarítmica) con regla tolerante: vale salvo que otro acorde o "pocas cuerdas" lo expliquen mejor, varias notas tengan huella propia y lo que aparece en el ataque no sea una sola nota | 82 % aceptados · 9 % de notas sueltas aceptadas |
| Ataques | Subida brusca de nivel por encima del umbral calibrado, separados al menos 160 ms | — |
| Calibración | Ruido de fondo (percentil 30) y tres tonos triangulares (196, 330 y 440 Hz); se guarda por micrófono | — |

No se juzga la dirección del rasgueo (↓/↑): con solo audio y en el navegador no es fiable.

## Canciones: de dónde salen

Melodías tradicionales o de compositores en dominio público, transcritas a mano y comprobadas compás a compás por las pruebas. Las canciones comerciales no se incluyen: sus melodías y letras tienen derechos y el repositorio es público.

## Desarrollo

```
src/dsp.js      DSP y teoría (funciones puras)
src/data.js     acordes, canciones de dominio público y categorías
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
