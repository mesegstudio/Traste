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
  Em:    { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], tip: 'El acorde más fácil. Solo dos dedos y suenan las seis cuerdas.' },
  Dm:    { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], tip: 'Como Re mayor, pero el índice baja al traste 1 de la 1ª cuerda.' },
  G:     { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3], tip: 'Abre bien la mano, con los dedos 1 y 2 en las graves y el 3 en la 1ª cuerda.' },
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
  Cadd9: { frets: [-1, 3, 2, 0, 3, 3], fingers: [0, 2, 1, 0, 3, 4], tip: 'Combina muy bien con Sol, porque los dedos 3 y 4 no se mueven.' },
  Fmaj7: { frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0], tip: 'El paso previo a Fa. Es igual, pero con la 1ª cuerda al aire.' },
  F_easy:{ sym: 'F', variant: 'versión fácil', frets: [-1, -1, 3, 2, 1, 1], fingers: [0, 0, 3, 2, 1, 1], barre: { fret: 1, from: 2, to: 1, finger: 1 }, tip: 'Una mini-cejilla. El índice pisa a la vez las cuerdas 1 y 2.' },
  F:     { frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], barre: { fret: 1, from: 6, to: 1, finger: 1 }, tip: 'Cejilla completa. El índice pisa las seis cuerdas y va un poco girado hacia el lado del hueso.' },
  Bm:    { frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], barre: { fret: 2, from: 5, to: 1, finger: 1 }, tip: 'Cejilla en el traste 2 desde la 5ª cuerda. Es la forma de La menor desplazada.' },
  'F#m': { frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1], barre: { fret: 2, from: 6, to: 1, finger: 1 }, tip: 'La forma de Mim con cejilla en el traste 2. El índice hace de cejuela.' },
};

// Orden de aprendizaje: de 2 dedos a 3, formas que se parecen seguidas (Mim→Lam→Mi, La→Re),
// luego Sol y Do (los más usados en canciones), séptimas, acordes "de color" y por último la cejilla.
const CHORD_GROUPS = [
  { name: 'Primeros acordes', ids: ['Em', 'Am', 'E', 'A', 'D'] },
  { name: 'Imprescindibles', ids: ['G', 'C', 'Dm'] },
  { name: 'Séptimas', ids: ['E7', 'A7', 'D7', 'G7', 'C7', 'B7'] },
  { name: 'Con color', ids: ['Asus2', 'Dsus2', 'Dsus4', 'Em7', 'Am7', 'Cadd9', 'Fmaj7'] },
  { name: 'Cejilla', ids: ['F_easy', 'F', 'Bm', 'F#m'] },
];

// Canciones tradicionales o de dominio público. Melodía en notas y duración en tiempos.
const SONGS = [
  {
    id: 'martinillo', cat: 'infantil', title: 'Martinillo', origin: 'Tradicional francesa', bpm: 96, bpb: 4, stars: 1,
    melody: `G3 A3 B3 G3 | G3 A3 B3 G3 | B3 C4 D4:2 | B3 C4 D4:2 |
             D4:0.5 E4:0.5 D4:0.5 C4:0.5 B3 G3 | D4:0.5 E4:0.5 D4:0.5 C4:0.5 B3 G3 | G3 D3 G3:2 | G3 D3 G3:2`,
    chords: `G | G | G | G | G | G | G | G`,
  },
  {
    id: 'estrellita', cat: 'infantil', title: 'Estrellita, ¿dónde estás?', origin: 'Tradicional', bpm: 92, bpb: 4, stars: 1,
    melody: `G3 G3 D4 D4 | E4 E4 D4:2 | C4 C4 B3 B3 | A3 A3 G3:2 |
             D4 D4 C4 C4 | B3 B3 A3:2 | D4 D4 C4 C4 | B3 B3 A3:2 |
             G3 G3 D4 D4 | E4 E4 D4:2 | C4 C4 B3 B3 | A3 A3 G3:2`,
    chords: `G | C G | C G | D G | G C | G D | G C | G D | G | C G | C G | D G`,
  },
  {
    id: 'himno', cat: 'clasica', title: 'Himno de la alegría', origin: 'L. v. Beethoven, 1824', bpm: 100, bpb: 4, stars: 2,
    melody: `E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:0.5 D4:2 |
             E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2 |
             D4 D4 E4 C4 | D4 E4:0.5 F4:0.5 E4 C4 | D4 E4:0.5 F4:0.5 E4 D4 | C4 D4 G3:2 |
             E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2`,
    chords: `C | G | C | G | C | G | C | G C | G | C | G | C G | C | G | C | G C`,
  },
  {
    id: 'cumple', cat: 'infantil', title: 'Cumpleaños feliz', origin: 'Hermanas Hill, 1893', bpm: 90, bpb: 3, pickup: 1, stars: 2,
    melody: `G3:0.75 G3:0.25 | A3 G3 C4 | B3:2 G3:0.75 G3:0.25 | A3 G3 D4 | C4:2 G3:0.75 G3:0.25 |
             G4 E4 C4 | B3 A3 F4:0.75 F4:0.25 | E4 C4 D4 | C4:3`,
    chords: `C | G7 | G7 | C | C | F_easy | C G7 | C`,
  },
  {
    id: 'jingle', cat: 'navidad', title: 'Jingle Bells', origin: 'J. Pierpont, 1857', bpm: 112, bpb: 4, stars: 2,
    melody: `B3 B3 B3:2 | B3 B3 B3:2 | B3 D4 G3:1.5 A3:0.5 | B3:4 |
             C4 C4 C4:1.5 C4:0.5 | C4 B3 B3 B3:0.5 B3:0.5 | B3 A3 A3 B3 | A3:2 D4:2 |
             B3 B3 B3:2 | B3 B3 B3:2 | B3 D4 G3:1.5 A3:0.5 | B3:4 |
             C4 C4 C4:1.5 C4:0.5 | C4 B3 B3 B3:0.5 B3:0.5 | D4 D4 C4 A3 | G3:4`,
    chords: `G | G | G | G | C | G | A7 | D7 | G | G | G | G | C | G | D7 | G`,
  },
  {
    id: 'greensleeves', cat: 'tradicional', title: 'Greensleeves', origin: 'Tradicional inglesa, s. XVI', bpm: 100, bpb: 3, pickup: 1, stars: 3,
    melody: `A3 | C4:2 D4 | E4:1.5 F4:0.5 E4 | D4:2 B3 | G3:1.5 A3:0.5 B3 | C4:2 A3 | A3:1.5 G#3:0.5 A3 | B3:2 G#3 | E3:2 A3 |
             C4:2 D4 | E4:1.5 F4:0.5 E4 | D4:2 B3 | G3:1.5 A3:0.5 B3 | C4:1.5 B3:0.5 A3 | G#3:1.5 F#3:0.5 G#3 | A3:3 | R:3`,
    chords: `Am | C | G | Em | Am | E | E | Am | Am | C | G | Em | Am | E | Am | Am`,
  },
  {
    id: 'mary', cat: 'infantil', title: 'María tenía un corderito', origin: 'Tradicional (EE. UU., 1830)', bpm: 96, bpb: 4, stars: 1,
    melody: `E4 D4 C4 D4 | E4 E4 E4:2 | D4 D4 D4:2 | E4 G4 G4:2 |
             E4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4:4`,
    chords: `C | C | G | C | C | C | G | C`,
  },
  {
    id: 'macdonald', cat: 'infantil', title: 'En la granja del viejo MacDonald', origin: 'Tradicional', bpm: 104, bpb: 4, stars: 1,
    melody: `G3 G3 G3 D3 | E3 E3 D3:2 | B3 B3 A3 A3 | G3:3 D3 |
             G3 G3 G3 D3 | E3 E3 D3:2 | B3 B3 A3 A3 | G3:4`,
    chords: `G | C G | G D | G | G | C G | G D | G`,
  },
  {
    id: 'london', cat: 'infantil', title: 'El puente de Londres', origin: 'Tradicional inglesa', bpm: 100, bpb: 4, stars: 1,
    melody: `G4:1.5 A4:0.5 G4 F4 | E4 F4 G4:2 | D4 E4 F4:2 | E4 F4 G4:2 |
             G4:1.5 A4:0.5 G4 F4 | E4 F4 G4:2 | D4:2 G4:2 | E4 C4:3`,
    chords: `C | C | G | C | C | C | G | C`,
  },
  {
    id: 'santos', cat: 'tradicional', title: 'When the Saints Go Marching In', origin: 'Espiritual tradicional', bpm: 120, bpb: 4, stars: 2,
    melody: `R C4 E4 F4 | G4:4 | R C4 E4 F4 | G4:4 | R C4 E4 F4 | G4:2 E4:2 | C4:2 E4:2 | D4:4 |
             R E4 E4 D4 | C4:3 C4 | E4:2 G4:2 | G4 F4:3 | R E4 F4 G4 | E4:2 C4:2 | D4:4 | C4:4`,
    chords: `C | C | C | C | C | C | C | G | G | C | C | F_easy | C | C | G | C`,
  },
  {
    id: 'auld', cat: 'tradicional', title: 'Auld Lang Syne', origin: 'Tradicional escocesa, 1788', bpm: 84, bpb: 4, pickup: 1, stars: 2,
    melody: `D3 | G3:1.5 G3:0.5 G3 B3 | A3:1.5 G3:0.5 A3 B3 | G3:1.5 G3:0.5 B3 D4 | E4:3 E4 |
             D4:1.5 B3:0.5 B3 G3 | A3:1.5 G3:0.5 A3 B3 | G3:1.5 E3:0.5 E3 D3 | G3:4`,
    chords: `G | D | G | C | G | D | C D | G`,
  },
  {
    id: 'korobeiniki', cat: 'tradicional', title: 'Korobéiniki', origin: 'Tradicional rusa · la música de Tetris', bpm: 120, bpb: 4, stars: 2,
    melody: `E4 B3:0.5 C4:0.5 D4 C4:0.5 B3:0.5 | A3 A3:0.5 C4:0.5 E4 D4:0.5 C4:0.5 | B3:1.5 C4:0.5 D4 E4 | C4 A3 A3:2 |
             R:0.5 D4 F4:0.5 A4 G4:0.5 F4:0.5 | E4:1.5 C4:0.5 E4 D4:0.5 C4:0.5 | B3 B3:0.5 C4:0.5 D4 E4 | C4 A3 A3:2`,
    chords: `Am | Am | E | Am | Dm | Am | E | Am`,
  },
  {
    id: 'minueto', cat: 'clasica', title: 'Minueto en Sol', origin: 'C. Petzold, c. 1725', bpm: 112, bpb: 3, stars: 3,
    melody: `D4 G3:0.5 A3:0.5 B3:0.5 C4:0.5 | D4 G3 G3 | E4 C4:0.5 D4:0.5 E4:0.5 F#4:0.5 | G4 G3 G3 |
             C4 D4:0.5 C4:0.5 B3:0.5 A3:0.5 | B3 C4:0.5 B3:0.5 A3:0.5 G3:0.5 | F#3 G3:0.5 A3:0.5 B3:0.5 G3:0.5 | A3:3 |
             D4 G3:0.5 A3:0.5 B3:0.5 C4:0.5 | D4 G3 G3 | E4 C4:0.5 D4:0.5 E4:0.5 F#4:0.5 | G4 G3 G3 |
             C4 D4:0.5 C4:0.5 B3:0.5 A3:0.5 | B3 C4:0.5 B3:0.5 A3:0.5 G3:0.5 | A3 B3:0.5 A3:0.5 G3:0.5 F#3:0.5 | G3:3`,
    chords: `G | G | C | G | C | G | D | D | G | G | C | G | C | G | D | G`,
  },
  {
    id: 'elisa', cat: 'clasica', title: 'Para Elisa', origin: 'L. v. Beethoven, 1810', bpm: 132, bpb: 3, pickup: 1, stars: 3, strum: 'bar',
    melody: `E4:0.5 D#4:0.5 | E4:0.5 D#4:0.5 E4:0.5 B3:0.5 D4:0.5 C4:0.5 | A3 R:0.5 C3:0.5 E3:0.5 A3:0.5 | B3 R:0.5 E3:0.5 G#3:0.5 B3:0.5 | C4 R:0.5 E3:0.5 E4:0.5 D#4:0.5 |
             E4:0.5 D#4:0.5 E4:0.5 B3:0.5 D4:0.5 C4:0.5 | A3 R:0.5 C3:0.5 E3:0.5 A3:0.5 | B3 R:0.5 E3:0.5 C4:0.5 B3:0.5 | A3:3`,
    chords: `E | Am | E | Am | E | Am | E | Am`,
  },
  {
    id: 'canon', cat: 'clasica', title: 'Canon en Re', origin: 'J. Pachelbel, c. 1690', bpm: 72, bpb: 4, stars: 2,
    melody: `F#4:2 E4:2 | D4:2 C#4:2 | B3:2 A3:2 | B3:2 C#4:2 |
             D4:2 C#4:2 | B3:2 A3:2 | G3:2 F#3:2 | G3:2 E3:2`,
    chords: `D A | Bm F#m | G D | G A | D A | Bm F#m | G D | G A`,
  },
  {
    id: 'nochedepaz', cat: 'navidad', title: 'Noche de paz', origin: 'F. X. Gruber, 1818', bpm: 96, bpb: 3, stars: 2,
    melody: `G3:1.5 A3:0.5 G3 | E3:3 | G3:1.5 A3:0.5 G3 | E3:3 | D4:2 D4 | B3:3 | C4:2 C4 | G3:3 |
             A3:2 A3 | C4:1.5 B3:0.5 A3 | G3:1.5 A3:0.5 G3 | E3:3 | A3:2 A3 | C4:1.5 B3:0.5 A3 | G3:1.5 A3:0.5 G3 | E3:3 |
             D4:2 D4 | F4:1.5 D4:0.5 B3 | C4:3 | E4:3 | C4:1.5 G3:0.5 E3 | G3:1.5 F3:0.5 D3 | C3:3`,
    chords: `C | C | C | C | G | G | C | C | F_easy | F_easy | C | C | F_easy | F_easy | C | C | G | G | C | C | C | G | C`,
  },
  {
    id: 'navidad', cat: 'navidad', title: 'Os deseamos feliz Navidad', origin: 'Villancico tradicional inglés', bpm: 120, bpb: 3, pickup: 1, stars: 2,
    melody: `D3 | G3 G3:0.5 A3:0.5 G3:0.5 F#3:0.5 | E3 E3 E3 | A3 A3:0.5 B3:0.5 A3:0.5 G3:0.5 | F#3 D3 D3 |
             B3 B3:0.5 C4:0.5 B3:0.5 A3:0.5 | G3 E3 D3:0.5 D3:0.5 | E3 A3 F#3 | G3:3`,
    chords: `G | C | A7 | D | B7 | Em | C D | G`,
  },
  {
    id: 'romance', cat: 'clasica', title: 'Romance anónimo', origin: 'Anónimo, s. XIX', bpm: 84, bpb: 3, stars: 2,
    melody: `B3 B3 B3 | B3 A3 G3 | G3 F#3 E3 | E3 G3 B3 | E4 E4 E4 | E4 D4 C4 | C4 B3 A3 | A3 B3 C4 |
             B3 C4 B3 | D#4 C4 B3 | B3 A3 G3 | G3 F#3 E3 | F#3 F#3 F#3 | F#3 G3 F#3 | E3 E3 E3 | E3:3`,
    chords: `Em | Em | Em | Em | Em | Em | Am | Am | B7 | B7 | Em | Em | B7 | B7 | Em | Em`,
  },
  {
    id: 'cucaracha', cat: 'tradicional', title: 'La cucaracha', origin: 'Tradicional mexicana', bpm: 104, bpb: 4, pickup: 2, stars: 2,
    melody: `R:0.5 G3:0.5 G3:0.5 G3:0.5 | C4:1.5 E4 G3:0.5 G3:0.5 G3:0.5 | C4:1.5 E4 C4:0.5 C4:0.5 B3:0.5 |
             B3:0.5 A3:0.5 A3:0.5 G3 G3:0.5 G3:0.5 G3:0.5 | B3:1.5 D4 G3:0.5 G3:0.5 G3:0.5 |
             B3:1.5 D4 G4:0.5 A4:0.5 G4:0.5 | F4:0.5 E4:0.5 D4:0.5 C4:2.5`,
    chords: `C | C | G7 | G7 | G7 | C`,
  },
  {
    id: 'susanna', cat: 'tradicional', title: 'Oh! Susanna', origin: 'S. Foster, 1848', bpm: 112, bpb: 4, pickup: 1, stars: 2,
    melody: `G3:0.5 A3:0.5 | B3 D4 D4:1.5 E4:0.5 | D4 B3 G3:1.5 A3:0.5 | B3 B3 A3 G3 | A3:3 G3:0.5 A3:0.5 |
             B3 D4 D4:1.5 E4:0.5 | D4 B3 G3:1.5 A3:0.5 | B3 B3 A3 A3 | G3:4 |
             C4:2 C4:2 | E4 E4:2 E4 | D4 D4 B3 G3 | A3:3 G3:0.5 A3:0.5 |
             B3 D4 D4:1.5 E4:0.5 | D4 B3 G3:1.5 A3:0.5 | B3 B3 A3 A3 | G3:4`,
    chords: `G | G | G | D | G | G | G D | G | C | G | G | D | G | G | G D | G`,
  },
  {
    id: 'clementine', cat: 'tradicional', title: 'Clementine', origin: 'Tradicional (EE. UU., 1884)', bpm: 108, bpb: 3, pickup: 1, stars: 1,
    melody: `G3:0.5 G3:0.5 | G3 D3 B3:0.5 B3:0.5 | B3 G3 G3:0.5 B3:0.5 | D4 D4 C4:0.5 B3:0.5 | A3:2 A3:0.5 B3:0.5 |
             C4 C4 B3:0.5 A3:0.5 | B3 G3 G3:0.5 B3:0.5 | A3 D3 F#3:0.5 A3:0.5 | G3:2 G3:0.5 G3:0.5 |
             G3 D3 B3:0.5 B3:0.5 | B3 G3 G3:0.5 B3:0.5 | D4 D4 C4:0.5 B3:0.5 | A3:2 A3:0.5 B3:0.5 |
             C4 C4 B3:0.5 A3:0.5 | B3 G3 G3:0.5 B3:0.5 | A3 D3 F#3:0.5 A3:0.5 | G3:3`,
    chords: `G | G | G | D7 | D7 | G | D7 | G | G | G | G | D7 | D7 | G | D7 | G`,
  },
  {
    id: 'amazing', cat: 'tradicional', title: 'Amazing Grace', origin: 'Himno tradicional, 1779', bpm: 84, bpb: 3, pickup: 1, stars: 1,
    melody: `D3 | G3:2 B3:0.5 G3:0.5 | B3:2 A3 | G3:2 E3 | D3:2 D3 | G3:2 B3:0.5 G3:0.5 | B3:2 A3 | D4:3 | D4:2 B3 |
             D4:2 B3:0.5 G3:0.5 | B3:2 A3 | G3:2 E3 | D3:2 D3 | G3:2 B3:0.5 G3:0.5 | B3:2 A3 | G3:3 | G3:3`,
    chords: `G | G | C | G | G | G | D | D | G | G | C | G | Em | D | G | G`,
  },
  {
    id: 'bourree', cat: 'clasica', title: 'Bourrée en Mi menor', origin: 'J. S. Bach, c. 1712', bpm: 84, bpb: 4, pickup: 1, stars: 3, strum: 'bar',
    melody: `E4:0.5 F#4:0.5 | G4 F#4:0.5 E4:0.5 D#4 E4:0.5 F#4:0.5 | B3 C#4:0.5 D#4:0.5 E4 D4:0.5 C4:0.5 |
             B3 A3:0.5 G3:0.5 F#3 G3:0.5 A3:0.5 | B3:0.5 A3:0.5 G3:0.5 F#3:0.5 E3 E4:0.5 F#4:0.5 |
             G4 F#4:0.5 E4:0.5 D#4 E4:0.5 F#4:0.5 | B3 C#4:0.5 D#4:0.5 E4 D4:0.5 C4:0.5 |
             B3 A3:0.5 G3:0.5 F#3 G3:0.5 A3:0.5 | B3:0.5 A3:0.5 G3:0.5 F#3:0.5 E3:2`,
    chords: `Em B7 | B7 Em | Em B7 | B7 Em | Em B7 | B7 Em | Em B7 | B7 Em`,
  },
  {
    id: 'sakura', cat: 'tradicional', title: 'Sakura', origin: 'Tradicional japonesa', bpm: 76, bpb: 4, stars: 1,
    melody: `A3 A3 B3:2 | A3 A3 B3:2 | A3 B3 C4 B3 | A3 B3:0.5 A3:0.5 F3:2 | E3 C3 E3 F3 | E3 E3:0.5 C3:0.5 B2:2 |
             A3 B3 C4 B3 | A3 B3:0.5 A3:0.5 F3:2 | E3 C3 E3 F3 | E3 E3:0.5 C3:0.5 B2:2 |
             A3 A3 B3:2 | A3 A3 B3:2 | E3 F3 B3:0.5 A3:0.5 F3 | E3:4`,
    chords: `Am | Am | Am | Dm | Am | E | Am | Dm | Am | E | Am | Am | Dm | E`,
  },
  {
    id: 'yankee', cat: 'tradicional', title: 'Yankee Doodle', origin: 'Tradicional (EE. UU., s. XVIII)', bpm: 116, bpb: 4, stars: 1,
    melody: `G3 G3 A3 B3 | G3 B3 A3 D3 | G3 G3 A3 B3 | G3:2 F#3:2 | G3 G3 A3 B3 | C4 B3 A3 G3 | F#3 D3 E3 F#3 | G3:2 G3:2 |
             E3:1.5 F#3:0.5 E3 D3 | E3 F#3 G3:2 | D3:1.5 E3:0.5 D3 C3 | B2:2 D3:2 |
             E3:1.5 F#3:0.5 E3 D3 | E3 F#3 G3 E3 | D3 G3 F#3 A3 | G3:2 G3:2`,
    chords: `G | G D | G | G D | G | C | D | G | C | G | D7 | G | C | G | D | G`,
  },
  {
    id: 'cuna', cat: 'clasica', title: 'Canción de cuna', origin: 'J. Brahms, 1868', bpm: 80, bpb: 3, pickup: 1, stars: 2,
    melody: `B3:0.5 B3:0.5 | D4:2 B3:0.5 B3:0.5 | D4:2 B3:0.5 D4:0.5 | G4 F#4:1.5 E4:0.5 | E4 D4 A3:0.5 B3:0.5 |
             C4 A3 A3:0.5 B3:0.5 | C4:2 A3:0.5 C4:0.5 | F#4:0.5 E4:0.5 D4 F#4 | G4:2 G3:0.5 G3:0.5 |
             G4:2 E4:0.5 C4:0.5 | D4:2 B3:0.5 G3:0.5 | C4 D4 E4 | D4:2 G3:0.5 G3:0.5 |
             G4:2 E4:0.5 C4:0.5 | D4:2 B3:0.5 G3:0.5 | C4 B3 A3 | G3:3`,
    chords: `G | G | D7 | D7 | D7 | D7 | D7 | G | C | G | D7 | G | C | G | D7 | G`,
  },
];

// Categorías del catálogo (en el orden en que se muestran)
const SONG_CATS = [
  { id: 'infantil', name: 'Infantiles' },
  { id: 'tradicional', name: 'Tradicionales' },
  { id: 'clasica', name: 'Clásica' },
  { id: 'navidad', name: 'Navidad' },
];


if (typeof module !== 'undefined') module.exports = { CHORDS, CHORD_GROUPS, SONGS, SONG_CATS };
