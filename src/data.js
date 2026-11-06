/* ============================================================
   Datos: acordes (de cuerda 6 a cuerda 1) y canciones de dominio público
   frets: -1 = no se toca (X), 0 = al aire (O)
   fingers: 1 índice · 2 medio · 3 anular · 4 meñique
   ============================================================ */
const CHORDS = {
  A:     { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], tip: 'Los tres dedos van en el traste 2, muy juntos. Si no caben, inclínalos un poco.' },
  D:     { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], tip: 'Forma un pequeño triángulo. Rasguea solo desde la 4ª cuerda (Re).' },
  E:     { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], tip: 'Es la forma de Lam subida una cuerda. Suenan las seis cuerdas.' },
  Am:    { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], tip: 'Pon los dedos 2 y 3 como en Mim y añade el índice en la 2ª cuerda. No toques la 6ª.' },
  Em:    { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], tip: 'El acorde más fácil: dos dedos y suenan las seis cuerdas.' },
  Dm:    { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], tip: 'Como Re mayor, pero el índice baja al traste 1 de la 1ª cuerda.' },
  G:     { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3], tip: 'Abre bien la mano: dedos 1 y 2 en las graves, el 3 en la 1ª cuerda.' },
  C:     { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], tip: 'Arquea los dedos para que la 1ª y la 3ª cuerda suenen al aire. No toques la 6ª.' },
  E7:    { frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0], tip: 'Mi mayor quitando el dedo 3. Suenan las seis cuerdas.' },
  A7:    { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0], tip: 'La 3ª cuerda queda libre entre los dos dedos.' },
  D7:    { frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3], tip: 'Un triángulo invertido. Rasguea desde la 4ª cuerda.' },
  G7:    { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1], tip: 'Como Sol, pero el índice va al traste 1 de la 1ª cuerda.' },
  C7:    { frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0], tip: 'Do mayor añadiendo el meñique en la 3ª cuerda, traste 3.' },
  B7:    { frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4], tip: 'Cuatro dedos. Deja la 2ª cuerda al aire.' },
  Asus2: { frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 0, 1, 2, 0, 0], tip: 'Suena abierto y luminoso. Muy útil para adornar La mayor.' },
  Dsus2: { frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 3, 0], tip: 'Re mayor levantando el dedo de la 1ª cuerda.' },
  Dsus4: { frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 4], tip: 'Re mayor con el meñique en el traste 3 de la 1ª cuerda.' },
  Em7:   { frets: [0, 2, 0, 0, 3, 0], fingers: [0, 1, 0, 0, 3, 0], tip: 'Dos dedos muy separados. Suenan las seis cuerdas.' },
  Am7:   { frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0], tip: 'La menor quitando el dedo 3.' },
  Cadd9: { frets: [-1, 3, 2, 0, 3, 3], fingers: [0, 2, 1, 0, 3, 4], tip: 'Combina muy bien con Sol: los dedos 3 y 4 no se mueven.' },
  Fmaj7: { frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0], tip: 'El paso previo a Fa: igual pero con la 1ª cuerda al aire.' },
  F_easy:{ sym: 'F', variant: 'versión fácil', frets: [-1, -1, 3, 2, 1, 1], fingers: [0, 0, 3, 2, 1, 1], barre: { fret: 1, from: 2, to: 1, finger: 1 }, tip: 'Mini-cejilla: el índice pisa las cuerdas 1 y 2 a la vez.' },
  F:     { frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], barre: { fret: 1, from: 6, to: 1, finger: 1 }, tip: 'Cejilla completa: el índice pisa las seis cuerdas. Gira un poco el dedo hacia el lado del hueso.' },
  Bm:    { frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], barre: { fret: 2, from: 5, to: 1, finger: 1 }, tip: 'Cejilla en el traste 2 desde la 5ª cuerda. Es la forma de La menor desplazada.' },
};

// Orden de aprendizaje: de 2 dedos a 3, formas que se parecen seguidas (Mim→Lam→Mi, La→Re),
// luego Sol y Do (los más usados en canciones), séptimas, acordes "de color" y por último la cejilla.
const CHORD_GROUPS = [
  { name: 'Primeros acordes', ids: ['Em', 'Am', 'E', 'A', 'D'] },
  { name: 'Imprescindibles', ids: ['G', 'C', 'Dm'] },
  { name: 'Séptimas', ids: ['E7', 'A7', 'D7', 'G7', 'C7', 'B7'] },
  { name: 'Con color', ids: ['Asus2', 'Dsus2', 'Dsus4', 'Em7', 'Am7', 'Cadd9', 'Fmaj7'] },
  { name: 'Cejilla', ids: ['F_easy', 'F', 'Bm'] },
];

// Canciones tradicionales o de dominio público. Melodía en notas y duración en tiempos.
const SONGS = [
  {
    id: 'martinillo', title: 'Martinillo', origin: 'Tradicional francesa', bpm: 96, bpb: 4, stars: 1,
    melody: `G3 A3 B3 G3 | G3 A3 B3 G3 | B3 C4 D4:2 | B3 C4 D4:2 |
             D4:0.5 E4:0.5 D4:0.5 C4:0.5 B3 G3 | D4:0.5 E4:0.5 D4:0.5 C4:0.5 B3 G3 | G3 D3 G3:2 | G3 D3 G3:2`,
    chords: `G | G | G | G | G | G | G | G`,
  },
  {
    id: 'estrellita', title: 'Estrellita, ¿dónde estás?', origin: 'Tradicional', bpm: 92, bpb: 4, stars: 1,
    melody: `G3 G3 D4 D4 | E4 E4 D4:2 | C4 C4 B3 B3 | A3 A3 G3:2 |
             D4 D4 C4 C4 | B3 B3 A3:2 | D4 D4 C4 C4 | B3 B3 A3:2 |
             G3 G3 D4 D4 | E4 E4 D4:2 | C4 C4 B3 B3 | A3 A3 G3:2`,
    chords: `G | C G | C G | D G | G C | G D | G C | G D | G | C G | C G | D G`,
  },
  {
    id: 'himno', title: 'Himno de la alegría', origin: 'L. v. Beethoven, 1824', bpm: 100, bpb: 4, stars: 2,
    melody: `E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:0.5 D4:2 |
             E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2 |
             D4 D4 E4 C4 | D4 E4:0.5 F4:0.5 E4 C4 | D4 E4:0.5 F4:0.5 E4 D4 | C4 D4 G3:2 |
             E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2`,
    chords: `C | G | C | G | C | G | C | G C | G | C | G | C G | C | G | C | G C`,
  },
  {
    id: 'cumple', title: 'Cumpleaños feliz', origin: 'Hermanas Hill, 1893', bpm: 90, bpb: 3, pickup: 1, stars: 2,
    melody: `G3:0.75 G3:0.25 | A3 G3 C4 | B3:2 G3:0.75 G3:0.25 | A3 G3 D4 | C4:2 G3:0.75 G3:0.25 |
             G4 E4 C4 | B3 A3 F4:0.75 F4:0.25 | E4 C4 D4 | C4:3`,
    chords: `C | G7 | G7 | C | C | F_easy | C G7 | C`,
  },
  {
    id: 'jingle', title: 'Jingle Bells', origin: 'J. Pierpont, 1857', bpm: 112, bpb: 4, stars: 2,
    melody: `B3 B3 B3:2 | B3 B3 B3:2 | B3 D4 G3:1.5 A3:0.5 | B3:4 |
             C4 C4 C4:1.5 C4:0.5 | C4 B3 B3 B3:0.5 B3:0.5 | B3 A3 A3 B3 | A3:2 D4:2 |
             B3 B3 B3:2 | B3 B3 B3:2 | B3 D4 G3:1.5 A3:0.5 | B3:4 |
             C4 C4 C4:1.5 C4:0.5 | C4 B3 B3 B3:0.5 B3:0.5 | D4 D4 C4 A3 | G3:4`,
    chords: `G | G | G | G | C | G | A7 | D7 | G | G | G | G | C | G | D7 | G`,
  },
  {
    id: 'greensleeves', title: 'Greensleeves', origin: 'Tradicional inglesa, s. XVI', bpm: 100, bpb: 3, pickup: 1, stars: 3,
    melody: `A3 | C4:2 D4 | E4:1.5 F4:0.5 E4 | D4:2 B3 | G3:1.5 A3:0.5 B3 | C4:2 A3 | A3:1.5 G#3:0.5 A3 | B3:2 G#3 | E3:2 A3 |
             C4:2 D4 | E4:1.5 F4:0.5 E4 | D4:2 B3 | G3:1.5 A3:0.5 B3 | C4:1.5 B3:0.5 A3 | G#3:1.5 F#3:0.5 G#3 | A3:3 | R:3`,
    chords: `Am | C | G | Em | Am | E | E | Am | Am | C | G | Em | Am | E | Am | Am`,
  },
];

if (typeof module !== 'undefined') module.exports = { CHORDS, CHORD_GROUPS, SONGS };
