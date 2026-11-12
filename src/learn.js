/* ============================================================
   Aprender. Se elige nivel y se sigue la práctica de hoy, o se entra en Acordes o en Punteo.
   Sigue las rutinas que recomiendan los profesores para empezar: calentar los dedos (la «araña»,
   un dedo por traste), aprender un acorde comprobándolo cuerda a cuerda, cambios de un minuto,
   rasgueo con metrónomo (negras → corcheas → el patrón ↓ ↓↑ ↑↓↑), notas del mástil empezando por la
   6ª y la 5ª cuerda, y escalas sencillas. Despacio y limpio antes que rápido; mejor poco cada día.
   ============================================================ */
const CHORD_ORDER = CHORD_GROUPS.flatMap((g) => g.ids);
const enc = encodeURIComponent;
const pairKey = (p) => [...p].sort().join('-');

const LVL = [null,
  { n: 'Empiezo', d: 'Para las primeras semanas. Fortalece los dedos, aprende tus primeros acordes y coge el ritmo.' },
  { n: 'Básico', d: 'Ya cambias entre acordes abiertos. Ganarás soltura y empezarás con las notas del mástil y las escalas.' },
  { n: 'Intermedio', d: 'Llega la cejilla, los rasgueos con más ritmo y el mástil entero.' },
];

/* ---------- Secuencias de notas ---------- */
const nt = (string, fret, finger) => ({ string, fret, finger: fret === 0 ? 0 : finger, midi: stringMidi(string) + fret });
// Araña: un dedo por traste en cada cuerda, de la 6ª a la 1ª (y vuelta, si back)
function spider(pos, order, back) {
  const up = [];
  for (let s = 6; s >= 1; s--) for (const k of order) up.push(nt(s, pos + k, k + 1));
  if (!back) return up;
  const down = [];
  for (let s = 1; s <= 6; s++) for (const k of [...order].reverse()) down.push(nt(s, pos + k, k + 1));
  return up.concat(down);
}
const upDown = (pts, finger) => { const up = pts.map(([s, f]) => nt(s, f, finger(f))); return up.concat(up.slice(0, -1).reverse()); };
const STRUM8 = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((t, i) => [t, i % 2 ? 'U' : 'D']);
// el mismo dibujo en cada cuerda, de la 6ª a la 1ª: pat = [[traste desde pos, dedo, ligada?]]
const perString = (pos, pat, strings = [6, 5, 4, 3, 2, 1]) => strings.flatMap((s) => pat.map(([k, f, sl]) => ({ ...nt(s, pos + k, f), ...(sl ? { slur: true } : {}) })));
const rep = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
// arpegio p-i-m-a sobre la forma de un acorde: su bajo y las cuerdas 3ª, 2ª y 1ª
const pima = (id) => { const ns = chordNotes(CHORDS[id]), bass = ns.reduce((a, b) => (b.string > a.string ? b : a)); return [bass, ...[3, 2, 1].map((st) => ns.find((n) => n.string === st))].map((n) => ({ ...n })); };
const C_MAJOR = [[5, 3], [4, 0], [4, 2], [4, 3], [3, 0], [3, 2], [2, 0], [2, 1]].map(([st, f]) => nt(st, f, f));

const EXERCISES = [
  // ---- Punteo: dedos ----
  { id: 'spider5', track: 'punteo', group: 'Fuerza y agilidad', lvl: 1, kind: 'seq', icon: 'hand', title: 'Araña 1-2-3-4', sub: 'Un dedo por traste, desde el traste 5',
    why: 'El calentamiento clásico. Pon el índice en el traste 5, el medio en el 6, el anular en el 7 y el meñique en el 8, y recorre las cuerdas de la 6ª a la 1ª. Aquí los trastes están más juntos y cuesta menos. Deja cada dedo apoyado hasta que necesites el siguiente.',
    notes: spider(5, [0, 1, 2, 3], false), bpm: 60, view: [4, 9] },
  { id: 'spider1', track: 'punteo', group: 'Fuerza y agilidad', lvl: 2, kind: 'seq', icon: 'hand', title: 'Araña completa', sub: 'Trastes 1 a 4, subiendo y bajando',
    why: 'La misma idea en los primeros trastes, donde hay que abrir más la mano, y volviendo de la 1ª a la 6ª con 4-3-2-1. Si algún dedo se levanta de más, ve más despacio.',
    notes: spider(1, [0, 1, 2, 3], true), bpm: 70, view: [0, 5] },
  { id: 'spider1324', track: 'punteo', group: 'Fuerza y agilidad', lvl: 2, kind: 'seq', icon: 'hand', title: 'Araña cruzada 1-3-2-4', sub: 'Independencia de los dedos',
    why: 'Al cambiar el orden, cada dedo tiene que moverse por su cuenta. Ve despacio y limpio, que la velocidad llega sola.',
    notes: spider(5, [0, 2, 1, 3], true), bpm: 70, view: [4, 9] },
  { id: 'spider1423', track: 'punteo', group: 'Fuerza y agilidad', lvl: 3, kind: 'seq', icon: 'hand', title: 'Araña 1-4-2-3', sub: 'Estiramiento y control del meñique',
    why: 'Saltas del índice al meñique, lo que estira la mano, y luego vuelven el medio y el anular. Se toca entre los trastes 3 y 6.',
    notes: spider(3, [0, 3, 1, 2], true), bpm: 80, view: [2, 7] },
  { id: 'alt1', track: 'punteo', group: 'Fuerza y agilidad', lvl: 1, kind: 'seq', icon: 'rhythm-line', title: 'Púa alterna', sub: 'Abajo y arriba en cada cuerda al aire', step: 0.5,
    why: 'Cuatro golpes en cada cuerda, abajo-arriba-abajo-arriba, sin pisar nada. El movimiento es pequeño y sale de la muñeca. Los golpes hacia arriba tienen que sonar igual de fuertes que los de abajo.',
    notes: [6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6].flatMap((st) => rep(4, () => nt(st, 0, 0))), bpm: 60, view: [0, 3] },
  { id: 'pivot', track: 'punteo', group: 'Fuerza y agilidad', lvl: 1, kind: 'seq', icon: 'hand', title: 'Índice fijo', sub: '1-2, 1-3 y 1-4 sin levantar el índice',
    why: 'El índice se queda apoyado en el traste 5 mientras los otros dedos van y vuelven. Así cada dedo aprende a moverse sin arrastrar a los demás.',
    notes: perString(5, [[0, 1], [1, 2], [0, 1], [2, 3], [0, 1], [3, 4]]), bpm: 60, view: [4, 9] },
  { id: 'weak', track: 'punteo', group: 'Fuerza y agilidad', lvl: 2, kind: 'seq', icon: 'hand', title: 'Anular y meñique', sub: 'Los dos dedos más flojos, solos',
    why: 'El anular y el meñique comparten tendón y por eso les cuesta moverse por separado. Alterna los trastes 7 y 8 en cada cuerda, despacio y con la punta del dedo.',
    notes: perString(5, [[2, 3], [3, 4], [2, 3], [3, 4]]), bpm: 60, view: [4, 9] },
  { id: 'skip', track: 'punteo', group: 'Fuerza y agilidad', lvl: 2, kind: 'seq', icon: 'hand', title: 'Saltos de cuerda', sub: 'De la 6ª a la 4ª, de la 5ª a la 3ª…',
    why: 'En las melodías las notas no siempre están en la cuerda de al lado. Aquí la mano derecha aprende a saltarse una cuerda sin mirar.',
    notes: [6, 4, 5, 3, 4, 2, 3, 1].flatMap((st) => [nt(st, 5, 1), nt(st, 7, 3)]), bpm: 60, view: [4, 9] },
  { id: 'hammer', track: 'punteo', group: 'Fuerza y agilidad', lvl: 2, kind: 'seq', icon: 'hand', title: 'Martillos', sub: 'La segunda nota suena sin pulsarla', modes: ['tempo'],
    why: 'Pulsa el traste 5 y deja caer otro dedo con decisión, sin volver a pulsar con la mano derecha. Es el ejercicio que más fuerza da a los dedos. La nota ligada tiene que oírse igual que la primera.',
    notes: perString(5, [[0, 1], [1, 2, true], [0, 1], [2, 3, true], [0, 1], [3, 4, true]]), bpm: 56, view: [4, 9] },
  { id: 'alt2', track: 'punteo', group: 'Fuerza y agilidad', lvl: 2, kind: 'seq', icon: 'rhythm-line', title: 'Araña con púa alterna', sub: 'Dos notas por pulso, abajo y arriba', step: 0.5,
    why: 'La araña de siempre, ahora con dos notas en cada pulso y alternando la púa. Cuando cambias de cuerda la púa sigue alternando, no vuelvas a empezar hacia abajo.',
    notes: spider(5, [0, 1, 2, 3], true), bpm: 56, view: [4, 9] },
  { id: 'stretch', track: 'punteo', group: 'Fuerza y agilidad', lvl: 3, kind: 'seq', icon: 'hand', title: 'Estiramiento 1-2-4', sub: 'Trastes 1, 3 y 5, donde más hay que abrir',
    why: 'Índice en el traste 1, medio en el 3 y meñique en el 5. Los trastes aquí están muy separados, así que baja el pulgar por detrás del mástil para que la mano abra. Si notas tensión en la muñeca, para.',
    notes: perString(1, [[0, 1], [2, 2], [4, 4]]), bpm: 60, view: [0, 6] },
  { id: 'pull', track: 'punteo', group: 'Fuerza y agilidad', lvl: 3, kind: 'seq', icon: 'hand', title: 'Tirones', sub: 'Del dedo de arriba al índice, sin pulsar', modes: ['tempo'],
    why: 'Con el índice puesto en el traste 5, pulsa la nota de otro dedo y retíralo tirando un poco de la cuerda hacia abajo, como un pellizco. Suena la nota del índice.',
    notes: perString(5, [[1, 2], [0, 1, true], [2, 3], [0, 1, true], [3, 4], [0, 1, true]]), bpm: 56, view: [4, 9] },
  { id: 'barre', track: 'punteo', group: 'Fuerza y agilidad', lvl: 3, kind: 'seq', icon: 'hand', title: 'Fuerza de cejilla', sub: 'De dos cuerdas a seis con el índice tumbado', modes: ['tempo'],
    why: 'Tumba el índice sobre el traste 5 y toca las cuerdas de una en una, primero dos, luego tres, hasta las seis. Usa el canto del dedo y aprieta con el pulgar por detrás. Si alguna cuerda se apaga, Traste te avisa.',
    notes: [2, 3, 4, 5, 6].flatMap((top) => rep(top, (i) => nt(top - i, 5, 1))), bpm: 50, view: [3, 8] },
  // ---- Punteo: mano derecha ----
  { id: 'pima', track: 'punteo', group: 'Con los dedos', lvl: 2, kind: 'seq', icon: 'hand', title: 'Arpegio p-i-m-a', sub: 'Lam, Do, Sol y Mim, nota a nota', step: 0.5,
    why: 'Pon el acorde entero y toca el bajo con el pulgar y después las cuerdas 3ª, 2ª y 1ª con índice, medio y anular. Dos veces cada acorde. La mano se queda quieta y solo se mueven los dedos.',
    notes: ['Am', 'C', 'G', 'Em'].flatMap((c) => [...pima(c), ...pima(c)]), bpm: 60, view: [0, 4] },
  // ---- Punteo: notas del mástil ----
  { id: 'open', track: 'punteo', group: 'Notas del mástil', lvl: 1, kind: 'seq', icon: 'music-line', title: 'Las cuerdas al aire', sub: 'Mi La Re Sol Si Mi, ida y vuelta',
    why: 'Antes de pisar nada, aprende cómo se llama y cómo suena cada cuerda. Tócalas al aire de una en una, de la 6ª (la más gruesa) a la 1ª y vuelta.',
    notes: upDown([[6, 0], [5, 0], [4, 0], [3, 0], [2, 0], [1, 0]], () => 0), bpm: 60, view: [0, 3] },
  { id: 'find6', track: 'punteo', group: 'Notas del mástil', lvl: 1, kind: 'find', icon: 'focus-3-line', title: 'Notas de la 6ª cuerda', sub: 'Notas naturales, trastes 0 a 12',
    why: 'Saber dónde está cada nota de la 6ª cuerda te orienta en todo el mástil y es la base de los acordes con cejilla. Para empezar, Sol está en el traste 3, La en el 5, Do en el 8 y Mi otra vez en el 12.', strings: [6], naturals: true },
  { id: 'find5', track: 'punteo', group: 'Notas del mástil', lvl: 2, kind: 'find', icon: 'focus-3-line', title: 'Notas de la 5ª cuerda', sub: 'Notas naturales, trastes 0 a 12',
    why: 'La 5ª cuerda empieza en La. Do está en el traste 3, Re en el 5, Mi en el 7 y La otra vez en el 12.', strings: [5], naturals: true },
  { id: 'find65', track: 'punteo', group: 'Notas del mástil', lvl: 2, kind: 'find', icon: 'focus-3-line', title: 'Notas de la 6ª y la 5ª', sub: 'Las dos cuerdas graves mezcladas',
    why: 'El traste 5 de una cuerda suena igual que la siguiente al aire, así que el 5 de la 6ª es La. Te sirve para pasar de una cuerda a otra.', strings: [6, 5], naturals: true },
  { id: 'findall', track: 'punteo', group: 'Notas del mástil', lvl: 3, kind: 'find', icon: 'focus-3-line', title: 'Notas de todo el mástil', sub: 'Seis cuerdas, con sostenidos',
    why: 'Todas las cuerdas y todas las notas hasta el traste 12. Recuerda que entre Mi y Fa, y entre Si y Do, no hay ningún traste de por medio.', strings: [1, 2, 3, 4, 5, 6], naturals: false },
  // ---- Punteo: escalas ----
  { id: 'cmaj', track: 'punteo', group: 'Escalas', lvl: 2, kind: 'seq', icon: 'music-line', title: 'Escala de Do mayor', sub: 'Do Re Mi Fa Sol La Si Do, posición abierta',
    why: 'La escala de toda la vida, subiendo y bajando. Va un dedo por traste, con el índice en el 1, el medio en el 2 y el anular en el 3.',
    notes: upDown([[5, 3], [4, 0], [4, 2], [4, 3], [3, 0], [3, 2], [2, 0], [2, 1]], (f) => f), bpm: 70, view: [0, 4] },
  { id: 'penta', track: 'punteo', group: 'Escalas', lvl: 2, kind: 'seq', icon: 'music-line', title: 'Pentatónica menor de La', sub: 'En el traste 5, la escala del rock y el blues',
    why: 'Dos notas por cuerda con el índice en el traste 5. Es la base de casi todos los solos. Ve subiendo y bajando sin prisa.',
    notes: upDown([[6, 5], [6, 8], [5, 5], [5, 7], [4, 5], [4, 7], [3, 5], [3, 7], [2, 5], [2, 8], [1, 5], [1, 8]], (f) => f - 4), bpm: 70, view: [4, 9] },
  { id: 'gmaj', track: 'punteo', group: 'Escalas', lvl: 3, kind: 'seq', icon: 'music-line', title: 'Escala de Sol mayor', sub: 'Dos octavas en posición abierta',
    why: 'De la 6ª a la 1ª cuerda y vuelta, un dedo por traste. El Fa# de la 4ª cuerda va con el meñique.',
    notes: upDown([[6, 3], [5, 0], [5, 2], [5, 3], [4, 0], [4, 2], [4, 4], [3, 0], [3, 2], [2, 0], [2, 1], [2, 3], [1, 0], [1, 2], [1, 3]], (f) => f), bpm: 80, view: [0, 4] },
  { id: 'scale3', track: 'punteo', group: 'Escalas', lvl: 3, kind: 'seq', icon: 'music-line', title: 'Do mayor de tres en tres', sub: 'Do Re Mi, Re Mi Fa, Mi Fa Sol…', step: 0.5,
    why: 'La misma escala tocada en grupos de tres notas, empezando cada vez una nota más arriba. Así suenan muchas melodías, y obliga a los dedos a conocer la escala de verdad.',
    notes: [0, 1, 2, 3, 4, 5].flatMap((i) => [C_MAJOR[i], C_MAJOR[i + 1], C_MAJOR[i + 2]]).concat([7, 6, 5, 4, 3, 2].flatMap((i) => [C_MAJOR[i], C_MAJOR[i - 1], C_MAJOR[i - 2]])).map((n) => ({ ...n })), bpm: 60, view: [0, 4] },
  // ---- Acordes: cambios y ritmo ----
  { id: 'changes', track: 'acordes', group: 'Practica', lvl: 1, kind: 'changes', icon: 'timer-line', title: 'Cambios de un minuto', sub: 'Cuenta cuántas veces cambias entre dos acordes',
    why: 'Elige dos acordes y alterna entre ellos durante un minuto, con un rasgueo en cada uno. Es el ejercicio con el que más rápido mejoran los cambios. Intenta superar tu récord cada día.' },
  { id: 'strum4', track: 'acordes', group: 'Ritmo', lvl: 1, kind: 'rhythm', icon: 'pulse-line', title: 'Rasgueo en negras', sub: '↓ ↓ ↓ ↓ · un golpe por tiempo con Mim y Lam',
    why: 'Mueve el brazo desde el codo, relajado, y rasguea hacia abajo justo con cada clic. Ayuda contar en voz alta «1, 2, 3, 4».',
    pattern: [[0, 'D'], [1, 'D'], [2, 'D'], [3, 'D']], chords: ['Em', 'Em', 'Am', 'Am', 'Em', 'Em', 'Am', 'Am'], bpm: 70 },
  { id: 'strum8', track: 'acordes', group: 'Ritmo', lvl: 2, kind: 'rhythm', icon: 'pulse-line', title: 'Rasgueo en corcheas', sub: '↓↑↓↑↓↑↓↑ con Sol, Do y Re',
    why: 'La mano no para nunca. Baja en cada tiempo y sube entre medias, contando «1 y 2 y 3 y 4 y». Las subidas van más suaves y solo por las cuerdas agudas.',
    pattern: STRUM8, chords: ['G', 'G', 'C', 'C', 'G', 'G', 'D', 'D'], bpm: 70 },
  { id: 'strumPop', track: 'acordes', group: 'Ritmo', lvl: 3, kind: 'rhythm', icon: 'pulse-line', title: 'El rasgueo más usado', sub: '↓ ↓↑ ↑↓↑ con Sol, Mim, Do y Re',
    why: 'Abajo, abajo-arriba, arriba-abajo-arriba, contando «1, 2 y, y 4 y». En el tiempo 3 el brazo baja igual pero sin tocar las cuerdas, y así no pierdes el pulso.',
    pattern: STRUM_PATTERNS[4], chords: ['G', 'G', 'Em', 'Em', 'C', 'C', 'D', 'D'], bpm: 75 },
  { id: 'chg2', track: 'acordes', group: 'Ritmo', lvl: 2, kind: 'rhythm', icon: 'timer-flash-line', title: 'Cambios cada dos tiempos', sub: 'Sol, Do, Sol y Re, con dos golpes en cada uno', beats: 2,
    why: 'El acorde cambia a mitad de compás. Solo tienes dos golpes para llegar, así que mueve los dedos mientras suena el segundo. La mano del rasgueo no espera.',
    pattern: [[0, 'D'], [1, 'D']], chords: ['G', 'C', 'G', 'D', 'G', 'C', 'G', 'D', 'G', 'C', 'G', 'D'], bpm: 60 },
  { id: 'chg1', track: 'acordes', group: 'Ritmo', lvl: 3, kind: 'rhythm', icon: 'timer-flash-line', title: 'Un acorde por tiempo', sub: 'Mim y Lam, cambiando en cada pulso', beats: 1,
    why: 'Un golpe y cambias. Aquí no da tiempo a colocar los dedos de uno en uno, y tienen que caer todos a la vez. Empieza muy despacio.',
    pattern: [[0, 'D']], chords: rep(16, (i) => (i % 2 ? 'Am' : 'Em')), bpm: 50 },
];
const EXI = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));
// velocidad limpia: la más alta a la que el ejercicio ha salido con un 85 % o más a velocidad normal
const cleanBpm = (ex) => state.rec['bpm:' + ex.id]?.v || 0;
const targetBpm = (ex) => { const c = cleanBpm(ex); return c ? Math.min(c + 5, 208) : ex.bpm; };

// Parejas de acordes para los cambios, de más fácil a más difícil
const PAIRS = [null,
  [['Em', 'Am'], ['Am', 'E'], ['E', 'A'], ['A', 'D'], ['Em', 'D']],
  [['G', 'C'], ['C', 'D'], ['G', 'D'], ['Am', 'Dm'], ['C', 'Am'], ['G', 'Em'], ['E7', 'A7'], ['G7', 'C']],
  [['C', 'F_easy'], ['Am', 'F_easy'], ['F', 'C'], ['G', 'Bm'], ['D', 'Bm'], ['F#m', 'D'], ['Em', 'B7']],
];

/* Ejercicio "con metrónomo": se toca en el reproductor de canciones */
function exerciseSong(ex) {
  const ev = [];
  let total;
  if (ex.kind === 'rhythm') {
    const B = ex.beats || 4; // tiempos que dura cada acorde
    ex.chords.forEach((c, bar) => ex.pattern.forEach(([off, dir]) => ev.push({ t: bar * B + off, dur: 0.5, chord: c, dir, notes: chordNotes(CHORDS[c], dir), first: off === 0 && (bar === 0 || ex.chords[bar - 1] !== c) })));
    total = ex.chords.length * B;
    ev.forEach((e, i) => { e.dur = Math.min(1, (ev[i + 1]?.t ?? total) - e.t); });
  } else {
    const st = ex.step || 1; // tiempos entre notas (0,5 son corcheas)
    ex.notes.forEach((n, i) => ev.push({ t: i * st, dur: st, notes: [{ ...n }] }));
    total = ex.notes.length * st;
  }
  const bpm = targetBpm(ex);
  return { id: 'ex:' + ex.id, title: ex.title, origin: `${ex.sub} · meta ${bpm} ppm`, bpm, bpb: 4, exercise: ex, built: { total, pickup: 0, chordTrack: [], levels: { easy: ev } } };
}

/* ---------- Práctica de hoy ---------- */
const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const dayNum = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
function todayDone() { const t = store.get('today', {}); return t && t.d === dayKey() ? t.done || [] : []; }

/* Racha: días seguidos con algo hecho */
function streak() {
  const st = store.get('streak', { last: 0, n: 0, best: 0 }), d = dayNum();
  return { ...st, n: st.last >= d - 1 ? st.n : 0, today: st.last === d };
}
function bumpStreak() {
  const st = store.get('streak', { last: 0, n: 0, best: 0 }), d = dayNum();
  if (st.last === d) return;
  const n = st.last === d - 1 ? st.n + 1 : 1;
  store.set('streak', { last: d, n, best: Math.max(st.best || 0, n) });
}

// de una lista de ejercicios, el que peor llevas (menos estrellas); si empatan, va rotando con los días
function weakest(ids) {
  const d = dayNum();
  return ids.map((id, i) => ({ id, s: bestStars(EXI[id]), r: (i + d) % ids.length })).sort((a, b) => a.s - b.s || a.r - b.r)[0].id;
}
const WARM = [null, ['spider5', 'alt1', 'pivot'], ['spider1', 'spider1324', 'weak', 'skip', 'hammer', 'alt2', 'pima'], ['spider1423', 'stretch', 'pull', 'barre', 'scale3', 'hammer']];
const RHYTHM = [null, ['strum4'], ['strum8', 'chg2'], ['strumPop', 'chg1', 'chg2']];
const NOTES = [null, ['open', 'find6'], ['find5', 'find65', 'cmaj', 'penta'], ['findall', 'gmaj', 'penta', 'scale3']];
const EARS = [null, ['high', 'string', 'mm'], ['mm', 'chord'], ['chord', 'mm']];

function routine(level) {
  const d = dayNum(), pick = (arr) => arr[d % arr.length];
  const groups = [null, [0, 1], [0, 1, 2, 3], [0, 1, 2, 3, 4]][level];
  const newChord = groups.flatMap((g) => CHORD_GROUPS[g].ids).find((x) => !state.learned[x]);
  const learned = CHORD_ORDER.filter((x) => state.learned[x]);
  const steps = [];
  const ex = (kicker, id, min) => { const e = EXI[id]; steps.push({ key: 'ex:' + id, kicker, icon: e.icon, title: e.title, sub: e.sub, min, hash: '#aprender/ej/' + id }); };
  steps.push({ key: 'tune', kicker: 'Antes de nada', icon: 'dashboard-3-line', title: 'Afina la guitarra', sub: 'Las seis cuerdas, una a una', min: 2, hash: '#afinador' });
  ex('Calienta', weakest(WARM[level]), 3);
  // una clase corta que aún no hayas leído
  const cl = CLASSES.find((c) => c.lvl <= level && !classRead(c.id));
  if (cl) steps.push({ key: 'class:' + cl.id, kicker: 'Clase', icon: 'book-2-line', title: cl.title, sub: cl.sub, min: cl.min, hash: '#aprender/clase/' + cl.id });
  if (newChord) steps.push({ key: 'lesson:' + newChord, kicker: 'Acorde nuevo', icon: 'hand', title: `${chordLabel(newChord)} · ${chordLongName(newChord)}`, sub: 'Colócalo, compruébalo cuerda a cuerda y practica el cambio', min: 5, hash: '#aprender/acorde/' + enc(newChord) });
  else if (learned.length >= 2) steps.push({ key: 'review', kicker: 'Repaso', icon: 'shuffle-line', title: 'Repaso de memoria', sub: 'Un acorde que ya sabes, sin mirar el diagrama', min: 3, hash: '#aprender/repaso' });
  // el cambio que peor llevas entre los acordes que sabes
  const known = PAIRS.slice(1, level + 1).flat().filter(([a, b]) => state.learned[a] && state.learned[b]);
  const pr = known.length ? known.map((q, i) => ({ q, v: state.rec['changes:' + pairKey(q)]?.v ?? -1, r: (i + d) % known.length })).sort((a, b) => a.v - b.v || a.r - b.r)[0].q : PAIRS[level][0];
  steps.push({ key: 'chg:' + pairKey(pr), kicker: 'Cambios', icon: 'timer-line', title: `${chordLabel(pr[0])} ↔ ${chordLabel(pr[1])} en un minuto`, sub: 'Alterna con un rasgueo en cada uno', min: 2, hash: `#aprender/cambios/${enc(pr[0])}~${enc(pr[1])}` });
  ex('Ritmo', weakest(RHYTHM[level]), 3);
  // un día notas y escalas, y al siguiente oído
  if (d % 2) { const g = EARI[pick(EARS[level])]; steps.push({ key: 'ear:' + g.id, kicker: 'Oído', icon: 'headphone-line', title: g.title, sub: g.sub, min: 2, hash: '#aprender/oido/' + g.id }); }
  else ex(level === 1 ? 'Notas' : 'Mástil', weakest(NOTES[level]), 3);
  // una canción para terminar
  const fits = (s) => songChords(s).every((c) => state.learned[c]);
  let lvl = level === 1 ? 'easy' : 'hard', cand = SONGS.filter((s) => !s.user && (level === 1 ? s.stars === 1 : lvl === 'hard' ? fits(s) : true));
  if (!cand.length) { lvl = 'easy'; cand = SONGS.filter((s) => !s.user && s.stars <= level); }
  const song = pick(cand);
  steps.push({ key: `song:${song.id}:${lvl}`, kicker: 'Canción', icon: 'music-2-line', title: song.title, sub: lvl === 'easy' ? 'En Fácil, la melodía nota a nota' : 'En Difícil, con acordes y rasgueo', min: 4, song, lvl });
  return steps;
}

/* ---------- Primeros pasos ---------- */
function guideItems() {
  const h = state.diagram === 'h';
  return [
    { t: 'Sujeta la guitarra', d: `Siéntate con la espalda recta y apoya la guitarra en la pierna ${state.lefty ? 'izquierda' : 'derecha'}, con el mástil un poco hacia arriba. El <b>pulgar de la mano que pisa va detrás del mástil</b>, más o menos detrás del dedo medio.` },
    { t: 'Tus dedos tienen número', d: 'En los diagramas, el 1 es el índice, el 2 el medio, el 3 el anular y el 4 el meñique. En Traste cada dedo tiene <b>siempre el mismo color</b>.', art: 'hand' },
    { t: 'Cómo pisar una cuerda', d: 'Con la <b>punta del dedo</b>, justo <b>detrás del traste</b> (no encima). Arquea el dedo como si sujetaras una pelota pequeña para no rozar las cuerdas de al lado. Mejor con las uñas cortas.' },
    { t: 'Cómo leer un diagrama', d: h ? 'Las líneas horizontales son las cuerdas, con la <b>6ª, la más gruesa, abajo</b>, como en la tablatura. Las verticales son los trastes y la barra gruesa es la cejuela. El número indica el dedo, la <b>O</b> una cuerda al aire y la <b>✕</b> una cuerda que no se toca.'
      : `Las líneas verticales son las cuerdas, con la <b>6ª, la más gruesa, a la ${state.lefty ? 'derecha' : 'izquierda'}</b>. Las horizontales son los trastes. El número indica el dedo, la <b>O</b> una cuerda al aire y la <b>✕</b> una cuerda que no se toca.`, art: 'diagram' },
    { t: 'Comprueba cuerda a cuerda', d: 'Con el acorde puesto, toca <b>cada cuerda por separado</b>. Si una suena apagada, algún dedo la roza o no aprieta bien. Así lo hacen los profesores, y Traste te avisa nota a nota.' },
    { t: 'Cómo practicar', d: 'Mejor <b>10-20 minutos cada día</b> que una hora a la semana. Es normal que las yemas duelan la primera semana. La <b>práctica de hoy</b> te propone qué tocar cada día.' },
  ];
}

/* ============================================================
   Lección de un acorde en tres pasos: colócalo → compruébalo → cámbialo
   ============================================================ */
const Lesson = {
  id: null, review: false, step: 1, check: null, res: {}, reveal: false, partner: null,
  open(id, review) {
    this.review = review; this.id = review ? this.pickReview() : id;
    this.step = 1; this.check = null; this.res = {}; this.reveal = false; this.partner = null;
    if (!review) store.set('lesson', id);
  },
  pickReview() {
    const l = CHORD_ORDER.filter((x) => state.learned[x] && x !== this.id);
    return l[Math.floor(Math.random() * l.length)] || CHORD_ORDER.find((x) => state.learned[x]) || 'Em';
  },
  nextId() { const i = CHORD_ORDER.indexOf(this.id); return CHORD_ORDER.find((x, k) => k > i && !state.learned[x]) || CHORD_ORDER[(i + 1) % CHORD_ORDER.length]; },
  partners() {
    const own = CHORD_ORDER.filter((x) => x !== this.id && state.learned[x]);
    const i = CHORD_ORDER.indexOf(this.id), near = CHORD_ORDER.filter((x, k) => x !== this.id && Math.abs(k - i) <= 3);
    return [...new Set([...own.slice(-5).reverse(), ...near])].slice(0, 6);
  },
  learn() {
    const id = this.id;
    if (!state.learned[id]) { state.learned[id] = true; store.set('learned', state.learned); toast(`${chordLabel(id)} aprendido.`, 3000, 'check-line'); }
    Learn.markDone(this.review ? 'review' : 'lesson:' + id);
  },
  html() {
    const id = this.id, c = CHORDS[id], notes = chordNotes(c), review = this.review, learned = !!state.learned[id];
    const hidden = review && !this.reveal && !(this.check && this.check.done);
    const steps = review ? [['Colócalo sin mirar'], ['Compruébalo']] : [['Colócalo'], ['Compruébalo'], ['Cámbialo']];
    const stepper = `<div class="stepper" role="tablist">${steps.map(([n], i) => `${i ? '<span class="sl"></span>' : ''}<button type="button" role="tab" data-act="step" data-n="${i + 1}" aria-selected="${this.step === i + 1}" class="${this.step > i + 1 || (i === 1 && this.check?.done) ? 'done' : ''}"><i>${this.step > i + 1 || (i === 1 && this.check?.done) ? icon('check-line') : i + 1}</i>${n}</button>`).join('')}</div>`;
    let panel = '';
    if (this.step === 1) {
      const used = new Set(c.fingers.filter(Boolean));
      const items = [...used].sort().map((f) => {
        const where = c.barre && c.barre.finger === f ? `estirado sobre el traste ${c.barre.fret}, de la ${c.barre.from}ª a la ${c.barre.to}ª cuerda (cejilla)`
          : notes.filter((n) => n.finger === f).map((n) => `en la <b>${n.string}ª cuerda</b>, traste ${n.fret}`).join(' y ');
        return `<li><span class="fdot" style="background:${fingerVar(f)}">${f}</span><span><b>${FINGERS[f].n}</b> ${where}</span></li>`;
      });
      const first = Math.max(...notes.map((n) => n.string));
      const muted = [6, 5, 4, 3, 2, 1].filter((s) => !notes.some((n) => n.string === s));
      items.push(`<li><span class="fdot strum">${icon('arrow-down-line')}</span><span><b>Rasguea</b> hacia abajo desde la ${first === 6 ? '6ª cuerda (suenan todas)' : `${first}ª cuerda`}</span></li>`);
      if (muted.length) items.push(`<li><span class="fdot mute">${icon('close-line')}</span><span><b>No toques</b> la ${ordinalList(muted.sort((a, b) => a - b))} cuerda</span></li>`);
      panel = hidden
        ? `<p class="ls-lead">Coloca los dedos de memoria y compruébalo. Si no te acuerdas, mira el diagrama.</p>
           <div class="ls-actions"><button type="button" class="btn btn-primary" data-act="check">${icon('mic-line')}Compruébalo</button><button type="button" class="btn btn-soft" data-act="reveal">${icon('eye-line')}Ver el diagrama</button><button type="button" class="btn btn-ghost" data-act="another">${icon('shuffle-line')}Otro</button></div>`
        : `<p class="ls-lead">Coloca los dedos como en el dibujo${review ? '' : ' y rasguea para oír cómo suena'}.</p>
           <ol class="steps-list">${items.join('')}</ol>
           <div class="tip">${icon('lightbulb-line')}<span>${c.tip}</span></div>
           <div class="ls-actions"><button type="button" class="btn btn-primary" data-act="check">${icon('mic-line')}Comprobar cuerda a cuerda</button>
           ${review ? `<button type="button" class="btn btn-ghost" data-act="another">${icon('shuffle-line')}Otro</button>` : learned ? '' : `<button type="button" class="btn btn-ghost" data-act="known">Ya me lo sé</button>`}</div>`;
    } else if (this.step === 2) {
      const ck = this.check;
      if (!ck) {
        panel = `<p class="ls-lead">Con el acorde puesto, toca las cuerdas <b>una a una</b>, de la gruesa a la fina. Te digo si alguna suena mal y por qué.</p>
          <div class="ls-actions"><button type="button" class="btn btn-primary" data-act="check">${icon('mic-line')}Empezar a escuchar</button></div>`;
      } else {
        const played = new Set(ck.notes.map((n) => n.string)), cur = ck.notes[ck.i];
        const pills = [6, 5, 4, 3, 2, 1].map((s) => {
          const st = !played.has(s) ? 'skip' : this.res[s] === 'ok' ? 'ok' : cur && cur.string === s ? (this.res[s] === 'bad' ? 'bad' : 'now') : this.res[s] === 'bad' ? 'bad' : '';
          return `<div class="cs ${st}"><b>${!played.has(s) ? '✕' : st === 'ok' ? icon('check-line') : pcName(OPEN_MIDI[6 - s] + ck.notes.find((n) => n.string === s).fret)}</b>${s}ª</div>`;
        }).join('');
        const msg = ck.done ? (ck.fails ? 'Corregido, ya suenan todas.' : '¡Todas las cuerdas suenan limpias!') : ck.msg || `Toca solo la ${cur.string}ª cuerda`;
        const sub = ck.done ? (review ? 'Lo recordabas bien.' : 'Ahora rasguéalo entero un par de veces y pasa a los cambios.') : ck.sub || 'Sin quitar el acorde, y déjala sonar.';
        panel = `<div class="check-strings">${pills}</div>
          <div class="check-msg" style="color:${ck.kind === 'bad' ? 'var(--bad)' : ck.done ? 'var(--ok)' : ''}">${msg}<p>${sub}</p></div>
          <div class="ls-actions">${ck.done
            ? (review ? `<button type="button" class="btn btn-primary" data-act="another">${icon('shuffle-line')}Otro acorde</button>` : `<button type="button" class="btn btn-primary" data-act="step" data-n="3">Pasar a los cambios${icon('arrow-right-line')}</button>`) + `<button type="button" class="btn btn-soft" data-act="check">${icon('restart-line')}Otra vez</button>`
            : `<button type="button" class="btn btn-ghost" data-act="check">${icon('restart-line')}Empezar de nuevo</button>`}</div>`;
      }
    } else {
      const ps = this.partners(), p = this.partner && ps.includes(this.partner) ? this.partner : ps[0];
      this.partner = p;
      const best = state.rec['changes:' + pairKey([id, p])], nx = this.nextId();
      panel = `<p class="ls-lead">Ahora practica el cambio. Coloca ${chordLabel(id)}, rasguea, quita la mano y pasa a otro acorde. Así la mano aprende la forma de memoria.</p>
        <div class="pair-pick"><span class="muted">Cambiar entre <b>${chordLabel(id)}</b> y</span><div class="chips">${ps.map((x) => `<button type="button" class="chip" data-act="partner" data-id="${esc(x)}" aria-pressed="${x === p}">${chordLabel(x)}${state.learned[x] ? '' : '<small>nuevo</small>'}</button>`).join('')}</div></div>
        <div class="mini-pair"><div class="diagram sm">${chordDiagram(CHORDS[p])}</div><p>${chordLongName(p)}${best ? `<br><span class="rec-line">${icon('trophy-line')}Tu récord es de <b>${best.v} cambios</b></span>` : ''}</p></div>
        <div class="ls-actions"><a class="btn btn-primary" href="#aprender/cambios/${enc(id)}~${enc(p)}">${icon('timer-line')}Cambios de un minuto</a>
        ${nx !== id ? `<a class="btn btn-soft" href="#aprender/acorde/${enc(nx)}">Aprender ${chordLabel(nx)}${icon('arrow-right-line')}</a>` : ''}</div>`;
    }
    const idx = CHORD_ORDER.indexOf(id);
    return `<div class="screen lesson2">
      <div class="scr-top">
        <a class="btn btn-soft btn-icon" href="${Learn.inRoutine ? '#aprender' : '#aprender/acordes'}" aria-label="Volver">${icon('arrow-left-line')}</a>
        <div class="scr-title"><h1 class="chord-h">${chordLabel(id)}</h1><p>${chordLabel(id, state.notation === 'latin' ? 'letter' : 'latin')} · ${chordLongName(id)}${c.variant ? ' · ' + c.variant : ''} · ${review ? 'repaso' : `${idx + 1} de ${CHORD_ORDER.length}`}${learned && !review ? ' · <span style="color:var(--ok)">aprendido</span>' : ''}</p></div>
        <button type="button" class="btn btn-soft btn-icon" data-act="hear" title="Escuchar el acorde" aria-label="Escuchar el acorde">${icon('volume-up-line')}</button>
        <button type="button" class="btn btn-soft btn-icon" data-act="arp" title="Escuchar nota a nota" aria-label="Escuchar nota a nota">${icon('music-2-line')}</button>
      </div>
      ${stepper}
      <div class="scr-body scroll"><div class="ls-grid">
        ${hidden ? `<div class="diagram ghost"><div>${icon('eye-line')}<span>Diagrama oculto</span></div></div>` : `<div class="diagram">${chordDiagram(c, this.res)}</div>`}
        <div class="ls-panel">${panel}</div>
      </div></div>
    </div>`;
  },
  onClick(b) {
    const a = b.dataset.act, id = this.id;
    if (a === 'hear') AudioEngine.strum(chordNotes(CHORDS[id]), 'D');
    if (a === 'arp') [...chordNotes(CHORDS[id])].sort((x, y) => y.string - x.string).forEach((n, i) => AudioEngine.pluck(midiToFreq(n.midi), i * 0.34, 0.45));
    if (a === 'check') { this.step = 2; this.startCheck(); }
    if (a === 'step') {
      const n = +b.dataset.n; if (n === this.step) return;
      this.step = n; this.check = null; this.res = {};
      if (n === 2) this.startCheck(); else Learn.render();
    }
    if (a === 'known') { this.learn(); this.step = 3; Learn.render(); }
    if (a === 'reveal') { this.reveal = true; Learn.render(); }
    if (a === 'another') { this.open(null, true); Learn.render(); }
    if (a === 'partner') { this.partner = b.dataset.id; Learn.render(); }
  },
  async startCheck() {
    this.check = null; this.res = {}; Learn.render();
    if (!(await micReady())) return;
    const notes = chordNotes(CHORDS[this.id]).sort((a, b) => b.string - a.string);
    this.check = { notes, i: 0, fails: 0, msg: '', sub: '', kind: '', done: false };
    this.update();
  },
  update() {
    const ck = this.check, cur = ck?.notes[ck.i];
    if (cur && !ck.done && this.res[cur.string] !== 'bad') this.res = { ...this.res, [cur.string]: 'now' };
    Learn.render();
  },
  frameCheck(f) {
    const ck = this.check; if (!ck || ck.done) return;
    if (ck.pending) {
      // la cuerda suena con su nota: falta ver si aguanta sonando o se apaga
      const { a, cur } = ck.pending, other = f.attacks.some((b) => b.pos > a.pos && b.pos < a.pos + 0.3 * Mic.sr);
      const q = other ? null : noteQuality(Mic.hear.ear, a.pos, cur.midi);
      if (!other && !q) return;
      ck.pending = null;
      const v = q ? pisada(q) : 'ok';
      if (v === 'ok') {
        this.res = { ...this.res, [cur.string]: 'ok' }; ck.i++; ck.kind = ''; ck.msg = ''; ck.sub = '';
        if (ck.i >= ck.notes.length) { ck.done = true; this.learn(); }
      } else {
        ck.fails++; ck.kind = 'bad'; this.res = { ...this.res, [cur.string]: 'bad' };
        ck.msg = v === 'dead' ? `La ${cur.string}ª se apaga enseguida` : `La ${cur.string}ª trastea`;
        ck.sub = v === 'dead'
          ? (cur.fret === 0 ? 'Algún dedo la está rozando. Arquéalos un poco más y tócala otra vez.' : `Aprieta más con la punta del dedo ${cur.finger}, justo detrás del traste ${cur.fret}, y tócala otra vez.`)
          : (cur.fret === 0 ? 'Zumba contra algún traste. Púlsala un poco más suave.' : `Acerca el dedo ${cur.finger} al traste ${cur.fret} y aprieta un poco más.`);
      }
      this.update(); if (ck.done) return;
    }
    for (const a of f.attacks) if (!a.used && a.t0 != null && (a.after || a.settled)) { this.checkAttack(ck, a); if (ck.done || ck.pending) return; }
  },
  checkAttack(ck, a) {
    const cur = ck.notes[ck.i], got = attackNotes(a);
    // attackHas: la cuerda se ha pulsado de verdad en este ataque (las ya comprobadas siguen sonando y no cuentan)
    if (attackHas(a, cur.midi)) { a.used = true; ck.pending = { a, cur }; return; }
    if (!a.settled) return;
    a.used = true;
    // golpe sin nota: la cuerda está tapada del todo
    if (a.flux == null && a.yin == null && a.strength >= 80) {
      ck.fails++; ck.kind = 'bad'; this.res = { ...this.res, [cur.string]: 'bad' };
      ck.msg = `La ${cur.string}ª no llega a sonar`;
      ck.sub = cur.fret === 0 ? 'Algún dedo la está tapando. Arquéalos un poco más.' : `Aprieta con la punta del dedo ${cur.finger}, justo detrás del traste ${cur.fret}.`;
      this.update(); return;
    }
    // las cuerdas ya comprobadas siguen sonando: si lo que se oye es una de ellas, no es un error
    const ringing = ck.notes.slice(0, ck.i).map((n) => n.midi);
    if (got.every((m) => ringing.some((r) => sameNote(m, r)))) return;
    // solo se dice "suena X" si lo confirman los dos detectores (primera lectura y lo que aparece)
    if (a.flux == null || a.yin == null || !sameNote(a.yin, a.flux) || ringing.some((r) => sameNote(a.flux, r))) { ck.kind = ''; ck.msg = `No la he oído bien. Toca otra vez la ${cur.string}ª`; ck.sub = 'Una sola cuerda, y deja que suene.'; this.update(); return; }
    const heard = a.flux; ck.fails++; ck.kind = 'bad'; this.res = { ...this.res, [cur.string]: 'bad' };
    ck.msg = `Suena ${pcName(heard)} y debería sonar ${pcName(cur.midi)}`;
    ck.sub = cur.fret === 0 ? 'Algún dedo la está rozando. Arquéalos un poco más.'
      : heard > cur.midi ? `Suena más agudo de la cuenta. El dedo ${cur.finger} va en el traste ${cur.fret}.` : `Suena más grave de la cuenta. Aprieta con la punta del dedo ${cur.finger}, justo detrás del traste ${cur.fret}.`;
    this.update();
  },
};

/* ============================================================
   Ejercicios con micrófono: contrarreloj, 60 segundos, 10 notas y cambios de un minuto
   ============================================================ */
const MODES = {
  seq: [['tempo', 'pulse-line', 'Con metrónomo'], ['crono', 'timer-flash-line', 'Contrarreloj']],
  find: [['m60', 'timer-line', '60 segundos'], ['n10', 'timer-flash-line', '10 notas']],
  changes: [['m60', 'timer-line', '1 minuto']],
  rhythm: [['tempo', 'pulse-line', 'Con metrónomo']],
};
const modeHelp = (kind, mode) => ({
  crono: 'Toca la secuencia lo más rápido que puedas. El tiempo empieza con la primera nota y cada nota equivocada suma 1 segundo.',
  tempo: kind === 'rhythm' ? 'Rasguea con el clic. Si te sale limpio, la próxima vez irá 5 pulsos más rápido.' : 'Las notas avanzan con el clic. Si te sale limpio, la próxima vez irá 5 pulsos más rápido.',
  m60: kind === 'changes' ? 'Un rasgueo en cada acorde durante un minuto. Cuento los cambios y te digo cuáles suenan limpios.' : 'Acierta todas las notas que puedas en un minuto.',
  n10: 'Encuentra 10 notas lo más rápido posible.',
}[mode]);
const lowerIsBetter = (kind, mode) => kind === 'seq' || mode === 'n10';
const fmtRec = (kind, mode, v) => (lowerIsBetter(kind, mode) ? `${fmt(v, 1)} s` : String(v));
function drillStars(ex, mode, v) {
  if (ex.kind === 'seq') { const per = v / ex.notes.length; return per <= 0.9 ? 3 : per <= 1.5 ? 2 : per <= 3 ? 1 : 0; }
  if (ex.kind === 'changes') return v >= 45 ? 3 : v >= 30 ? 2 : v >= 15 ? 1 : 0;
  if (mode === 'n10') return v <= 30 ? 3 : v <= 55 ? 2 : v <= 100 ? 1 : 0;
  return v >= 20 ? 3 : v >= 12 ? 2 : v >= 5 ? 1 : 0;
}
function recordOf(ex, mode) {
  if (mode === 'tempo') { const b = state.best[`ex:${ex.id}:easy`]; return b ? { stars: b.stars, text: `${Math.round(b.acc * 100)}% de precisión` } : null; }
  if (ex.kind === 'changes') return null;
  const r = state.rec[`${ex.id}:${mode}`]; return r ? { stars: r.stars, text: fmtRec(ex.kind, mode, r.v) } : null;
}
const modesOf = (ex) => MODES[ex.kind].filter(([m]) => !ex.modes || ex.modes.includes(m));
function bestStars(ex) {
  return Math.max(0, ...modesOf(ex).map(([m]) => recordOf(ex, m)?.stars || 0));
}

const Drill = {
  ex: null, mode: '', st: 'idle', pair: ['Em', 'Am'], back: '#aprender',
  open(ex, o = {}) {
    this.stop();
    this.ex = ex; this.back = o.back || (Learn.inRoutine ? '#aprender' : '#aprender/' + ex.track);
    const modes = modesOf(ex), saved = store.get('mode:' + ex.id, modes[0][0]);
    this.mode = modes.some((m) => m[0] === saved) ? saved : modes[0][0];
    if (ex.kind === 'changes') this.pair = o.pair || store.get('pair', null) || this.defaultPair();
  },
  defaultPair() { const l = CHORD_ORDER.filter((x) => state.learned[x]); return l.length >= 2 ? l.slice(-2) : ['Em', 'Am']; },
  stop() { this.st = 'idle'; this.check = null; },
  seq() { return this.ex.notes; },
  rkey() { return this.ex.kind === 'changes' ? 'changes:' + pairKey(this.pair) : `${this.ex.id}:${this.mode}`; },
  async start() {
    if (this.mode === 'tempo') { Learn.autoStart = true; location.hash = `#aprender/ej/${this.ex.id}/tempo`; return; }
    if (!(await micReady())) return;
    Object.assign(this, { st: this.mode === 'crono' ? 'run' : 'count', cdEnd: performance.now() + 3000, t0: null, end: 0, i: 0, errs: 0, score: 0, clean: 0, misses: 0, msg: '', mk: '', flash: null, target: null, check: null, last: 0 });
    if (this.ex.kind === 'seq') { this.msg = 'El tiempo empieza con la primera nota.'; for (const a of Mic.hear?.attacks || []) a.used = true; }
    if (this.ex.kind === 'find') this.nextTarget();
    Learn.render();
  },
  say(msg, mk = '') { this.msg = msg; this.mk = mk; const el = $('#drMsg'); if (el) { el.textContent = msg; el.dataset.k = mk; } },
  findPool() {
    const out = [];
    for (const s of this.ex.strings) for (let f = 0; f <= 12; f++) { const m = stringMidi(s) + f; if (this.ex.naturals && LETTERS[m % 12].includes('#')) continue; out.push({ string: s, fret: f, midi: m }); }
    return out;
  },
  nextTarget() {
    const pool = this.findPool().filter((p) => !this.target || p.midi % 12 !== this.target.midi % 12);
    this.target = pool[Math.floor(Math.random() * pool.length)]; this.misses = 0;
  },
  frame(f, now) {
    if (this.st === 'count') {
      for (const a of f?.attacks || []) a.used = true;
      const n = Math.ceil((this.cdEnd - now) / 1000), el = $('#drCount');
      if (el && el.textContent !== String(n)) el.textContent = n > 0 ? n : '';
      if (now >= this.cdEnd) { this.st = 'run'; this.t0 = now; if (this.mode === 'm60') this.end = now + 60000; Learn.render(); }
      return;
    }
    if (this.st !== 'run') return;
    this.tick(now);
    if (this.mode === 'm60' && now >= this.end) { this.finish(now); return; }
    if (this.flash && now > this.flash.until) { this.flash = null; this.renderStage(); }
    if (!f || Cal.needed()) return;
    if (this.ex.kind === 'seq') this.frameSeq(f, now);
    else if (this.ex.kind === 'find') this.frameFind(f, now);
    else if (this.ex.kind === 'changes') this.frameChanges(f, now);
  },
  tick(now) {
    const el = $('#drTime'); if (!el) return;
    const s = this.mode === 'm60' ? `0:${String(Math.ceil(Math.max(0, this.end - now) / 1000)).padStart(2, '0')}` : `${fmt(this.t0 == null ? 0 : (now - this.t0) / 1000, 1)} s`;
    if (el.textContent !== s) el.textContent = s;
  },
  frameSeq(f, now) {
    for (const a of f.attacks) if (!a.used && a.t0 != null && (a.after || a.settled) && this.st === 'run') this.seqAttack(a, now);
  },
  seqAttack(a, now) {
    const want = this.seq()[this.i], got = attackNotes(a);
    if (attackHas(a, want.midi)) {
      a.used = true; if (this.t0 == null) this.t0 = a.t0; // el tiempo empieza en el ataque, no cuando se reconoce
      this.i++; this.say(this.i === 1 ? '¡En marcha!' : '', 'ok');
      if (this.i >= this.seq().length) { this.finish(a.t0); return; }
      this.renderStage(); return;
    }
    if (!a.settled) return;
    a.used = true;
    const prev = this.seq()[this.i - 1];
    if (prev && got.every((m) => sameNote(m, prev.midi))) return; // la anterior aún suena
    if (a.yin != null && a.flux != null && sameNote(a.yin, a.flux)) {
      if (this.t0 != null) this.errs++;
      this.say(`Eso es ${pcName(a.flux)}, toca ${pcName(want.midi)}`, 'bad'); this.renderStats();
    }
  },
  frameFind(f, now) {
    const a = f.attack; if (!a || a.used || (!a.after && !a.settled)) return;
    const T = this.target, got = attackNotes(a);
    if (attackHas(a, T.midi)) {
      a.used = true; this.score++; this.flash = { ...T, until: now + 900 };
      if (this.mode === 'n10' && this.score >= 10) { this.finish(now); return; }
      this.nextTarget(); this.say('¡Bien!', 'ok'); this.renderStage(); return;
    }
    if (!a.settled) return;
    a.used = true;
    if (this.flash && got.every((m) => sameNote(m, this.flash.midi))) return; // la anterior aún suena
    if (a.yin != null && a.flux != null && sameNote(a.yin, a.flux)) {
      this.errs++; this.misses++;
      this.say(`Eso es ${pcName(a.flux)}. Busca ${pcName(T.midi)}${this.misses >= 2 ? ', te marco dónde está' : ''}`, 'bad'); this.renderStage();
    }
  },
  frameChanges(f, now) {
    const [A, B] = this.pair, want = this.score % 2 === 0 ? A : B, other = want === A ? B : A;
    if (f.onset && f.attack && !this.check && now - this.last > 250) this.check = { a: f.attack, t0: f.attack.t0, other: null };
    const c = this.check; if (!c || now - c.t0 < 110) return;
    const N = (id) => chordNotes(CHORDS[id]);
    const broad = !c.a.fluxVec || singleNoteLikeness(c.a.fluxVec) < 0.62; // no es una sola cuerda
    const semis = Mic.semisFrom(c.a);
    if (c.other == null) c.other = strumOk(semis, hypothesesFor(N(other), other), fewFor(N(other)), N(other));
    if (broad && strumOk(semis, hypothesesFor(N(want), want), fewFor(N(want)), N(want))) {
      this.check = null; c.a.used = true; this.score++; this.clean++; this.last = now; this.say('¡Limpio!', 'ok'); this.renderStage(); return;
    }
    if (now - c.t0 < 450) return;
    this.check = null; c.a.used = true;
    if (!broad) { this.say('Rasguea todas las cuerdas del acorde.', 'warn'); return; }
    if (c.other) { this.say(`Sigue sonando ${chordLabel(other)}. Cambia a ${chordLabel(want)}.`, 'warn'); return; }
    this.score++; this.last = now; this.say('Cuenta, pero alguna cuerda no ha sonado limpia.', 'warn'); this.renderStage();
  },
  finish(now) {
    const ex = this.ex, kind = ex.kind, mode = this.mode;
    let v, big;
    let text = '';
    if (kind === 'seq') {
      v = (now - this.t0) / 1000 + this.errs;
      big = [[`${fmt(v, 1)} s`, 'tiempo'], [this.errs, this.errs === 1 ? 'nota equivocada' : 'notas equivocadas']];
      text = this.errs ? `Incluye ${this.errs} s de penalización por notas equivocadas.` : 'Sin una sola nota equivocada.';
    } else if (kind === 'find' && mode === 'n10') { v = (now - this.t0) / 1000; big = [[`${fmt(v, 1)} s`, '10 notas'], [this.errs, this.errs === 1 ? 'fallo' : 'fallos']]; }
    else if (kind === 'find') { v = this.score; big = [[v, v === 1 ? 'nota' : 'notas'], [this.errs, this.errs === 1 ? 'fallo' : 'fallos']]; }
    else { v = this.score; big = [[v, 'cambios'], [this.clean, 'limpios']]; text = v && this.clean < v ? 'Los cambios no limpios cuentan, pero intenta que suenen todas las cuerdas.' : v ? '' : 'No he oído ningún cambio. Rasguea fuerte, con todas las cuerdas del acorde.'; }
    const stars = drillStars(ex, mode, v), key = this.rkey(), prev = state.rec[key];
    const better = !prev || (lowerIsBetter(kind, mode) ? v < prev.v : v > prev.v);
    state.rec[key] = { v: better ? (kind === 'seq' || mode === 'n10' ? Math.round(v * 10) / 10 : v) : prev.v, stars: Math.max(stars, prev?.stars || 0) };
    store.set('rec', state.rec);
    if (prev) big.push([fmtRec(kind, mode, prev.v), better ? 'récord anterior' : 'tu récord']);
    this.st = 'idle';
    const doneKey = kind === 'changes' ? 'chg:' + pairKey(this.pair) : 'ex:' + ex.id;
    Learn.markDone(doneKey); Learn.render();
    const acts = [{ label: 'Repetir', icon: 'restart-line', fn: () => this.start() }];
    const nxt = Learn.nextAction(doneKey); if (nxt) acts.push(nxt);
    acts[acts.length - 1].kind = 'primary';
    showResult({ stars, title: better && prev ? '¡Nuevo récord!' : starsLine(stars), text, big, actions: acts });
  },
  // ---------- dibujo ----------
  html() {
    const ex = this.ex, run = this.st !== 'idle';
    const modes = modesOf(ex);
    const title = ex.kind === 'changes' ? `${chordLabel(this.pair[0])} ↔ ${chordLabel(this.pair[1])}` : ex.title;
    return `<div class="screen drill" data-kind="${ex.kind}">
      <div class="scr-top">
        <a class="btn btn-soft btn-icon" href="${this.back}" aria-label="Volver">${icon('arrow-left-line')}</a>
        <div class="scr-title"><h1>${title}</h1><p>${ex.kind === 'changes' ? ex.title : ex.sub}</p></div>
        <div class="dr-stats" id="drStats">${this.statsHTML()}</div>
      </div>
      ${run ? '' : `<div class="dr-intro">
        <p class="dr-why">${ex.why}</p>
        ${modes.length > 1 ? `<div class="seg dr-modes" role="group" aria-label="Modo">${modes.map(([m, ic, n]) => `<button type="button" data-mode="${m}" aria-pressed="${m === this.mode}">${icon(ic)}${n}</button>`).join('')}</div>` : ''}
      </div>`}
      <div class="dr-stage" id="drStage">${this.stageHTML()}</div>
      <div class="dr-foot">
        <div class="dr-msg" id="drMsg" data-k="${this.mk || ''}">${run ? esc(this.msg) : modeHelp(ex.kind, this.mode)}</div>
        ${run ? `<button type="button" class="btn btn-soft" data-dr="stop">Parar</button>` : `<button type="button" class="btn btn-primary btn-lg" data-dr="start">${icon('play-fill')}Empezar</button>`}
      </div>
    </div>`;
  },
  statsHTML() {
    const ex = this.ex, kind = ex.kind;
    if (this.st === 'idle') {
      if (kind === 'changes') { const r = state.rec[this.rkey()]; return r ? `<div class="dr-stat rec">${miniStars(r.stars)}<b>${r.v}</b><span>tu récord</span></div>` : ''; }
      const r = recordOf(ex, this.mode); return r ? `<div class="dr-stat rec">${miniStars(r.stars)}<b>${r.text}</b><span>tu récord</span></div>` : '';
    }
    const time = `<div class="dr-stat"><b class="num" id="drTime">${this.mode === 'm60' ? '1:00' : '0,0 s'}</b><span>${this.mode === 'm60' ? 'quedan' : 'tiempo'}</span></div>`;
    if (kind === 'seq') return `${time}<div class="dr-stat"><b class="num">${this.i}/${this.seq().length}</b><span>notas</span></div>`;
    if (kind === 'find') return `${time}<div class="dr-stat"><b class="num">${this.mode === 'n10' ? `${this.score}/10` : this.score}</b><span>aciertos</span></div>`;
    return `${time}<div class="dr-stat"><b class="num">${this.score}</b><span>cambios · ${this.clean} limpios</span></div>`;
  },
  renderStats() { const el = $('#drStats'); if (el) el.innerHTML = this.statsHTML(); },
  renderStage() { const el = $('#drStage'); if (el) el.innerHTML = this.stageHTML(); this.renderStats(); },
  stageHTML() {
    const ex = this.ex, run = this.st !== 'idle';
    const count = this.st === 'count' ? `<div class="dr-count" id="drCount">3</div>` : '';
    if (ex.kind === 'seq') {
      const seq = this.seq(), i = run ? this.i : -1, cur = seq[i];
      const byPos = new Map();
      seq.forEach((n, j) => { const k = n.string + ':' + n.fret; if (!byPos.has(k)) byPos.set(k, { ...n, js: [] }); byPos.get(k).js.push(j); });
      const marks = [...byPos.values()].map((m) => ({ ...m, st: !run ? 'next' : cur && m.string === cur.string && m.fret === cur.fret ? 'now' : m.js.some((j) => j > i && j <= i + 3) ? 'next' : m.js.some((j) => j < i) ? 'done' : 'idle' }));
      const prompt = run && cur ? `<div class="dr-prompt">
          <span class="fdot" style="background:${cur.fret ? fingerVar(cur.finger) : 'var(--surface-3)'};color:${cur.fret ? 'var(--dot-ink)' : 'var(--text)'}">${cur.fret ? cur.finger : 'O'}</span>
          <div><b>${cur.fret ? `Traste ${cur.fret} · ${cur.string}ª cuerda` : `${cur.string}ª cuerda al aire`}</b><span>${pcName(cur.midi)} · ${cur.fret ? `dedo ${cur.finger}, ${FINGERS[cur.finger].n.toLowerCase()}` : 'sin pisar'}</span></div>
          <div class="dr-bar"><i style="width:${(this.i / seq.length) * 100}%"></i></div>
        </div>` : '';
      return `${prompt}<div class="neck-wrap">${neckSVG({ from: ex.view[0], to: ex.view[1], marks })}</div>${count}`;
    }
    if (ex.kind === 'find') {
      const T = this.target, marks = [];
      if (this.flash) marks.push({ ...this.flash, st: 'show', label: pcName(this.flash.midi) });
      if (run && T && this.misses >= 2) marks.push({ ...T, st: 'hint' });
      const strs = ex.strings.length === 6 ? 'cualquier cuerda' : ex.strings.map((s) => `la ${s}ª`).join(' o ');
      const prompt = run && T && this.st === 'run'
        ? `<div class="find-target"><b>${pcName(T.midi)}</b><span>en la ${T.string}ª cuerda</span></div>`
        : `<div class="find-target idle"><b>?</b><span>Te diré una nota. Búscala en ${strs} y tócala</span></div>`;
      return `${prompt}<div class="neck-wrap">${neckSVG({ from: 0, to: 12, marks, hl: run && T ? T.string : ex.strings.length === 1 ? ex.strings[0] : null })}</div>${count}`;
    }
    if (ex.kind === 'changes') {
      const [A, B] = this.pair, want = this.score % 2 === 0 ? A : B;
      const card = (id, k) => `<div class="chg-card ${run && id === want ? 'on' : ''}">
          ${run ? `<span class="chg-now">${id === want ? 'Ahora' : 'Después'}</span>` : `<select data-pair="${k}" aria-label="Acorde ${k + 1}">${CHORD_ORDER.map((x) => `<option value="${esc(x)}" ${x === id ? 'selected' : ''}>${chordLabel(x)}${CHORDS[x].variant ? ' (fácil)' : ''}</option>`).join('')}</select>`}
          <div class="diagram sm">${chordDiagram(CHORDS[id])}</div><b>${chordLabel(id)}</b></div>`;
      return `<div class="chg-pair">${card(A, 0)}<span class="chg-arrow">${icon('shuffle-line')}</span>${card(B, 1)}</div>${count}`;
    }
    // ritmo: el patrón de un compás (se repite), los acordes por compás y sus formas
    const cells = rep((ex.beats || 4) * 2, (k) => k / 2).map((t, k) => {
      const p = ex.pattern.find(([o]) => o === t);
      return `<span class="${p ? p[1] : 'rest'}"><i>${p ? icon(p[1] === 'D' ? 'arrow-down-line' : 'arrow-up-line') : '·'}</i><em>${k % 2 ? 'y' : k / 2 + 1}</em></span>`;
    }).join('');
    const ids = [...new Set(ex.chords)];
    return `<div class="rh-pattern" aria-label="Patrón de rasgueo de un compás">${cells}</div>
      <div class="rh-seq">${ex.chords.map((c, i) => `<span class="${i && ex.chords[i - 1] === c ? 'rep' : ''}">${chordLabel(c)}</span>`).join('')}</div>
      <div class="rhythm-chords">${ids.map((id) => `<div class="diagram sm">${chordDiagram(CHORDS[id])}<b>${chordLabel(id)}</b></div>`).join('')}</div>`;
  },
  onClick(b) {
    if (b.dataset.dr === 'start') this.start();
    if (b.dataset.dr === 'stop') { this.stop(); this.say(''); Learn.render(); }
    if (b.dataset.mode) { this.mode = b.dataset.mode; store.set('mode:' + this.ex.id, this.mode); Learn.render(); }
  },
  onChange(el) {
    if (el.dataset.pair != null) {
      const p = [...this.pair]; p[+el.dataset.pair] = el.value;
      if (p[0] === p[1]) p[1 - +el.dataset.pair] = this.pair[+el.dataset.pair];
      this.pair = p; store.set('pair', p); Learn.render();
    }
  },
};

/* ============================================================
   Navegación de Aprender: inicio, pistas, lección, ejercicio
   ============================================================ */
const Learn = {
  scr: 'home', track: 'acordes', inRoutine: false, autoStart: false, prevHash: '',
  init() {
    const root = $('#learn');
    root.addEventListener('click', (e) => {
      const lv = e.target.closest('[data-level]');
      if (lv) { store.set('learnLevel', +lv.dataset.level); this.render(); return; }
      const st = e.target.closest('[data-today]');
      if (st) { const s = this.steps().find((x) => x.key === st.dataset.today); if (s) this.goStep(s); return; }
      if (e.target.closest('[data-today-go]')) { const s = this.steps().find((x) => !todayDone().includes(x.key)) || this.steps()[0]; this.goStep(s); return; }
      if (e.target.closest('[data-welcome]')) { store.set('welcomed', true); if (e.target.closest('[data-welcome]').dataset.welcome === 'tune') { this.goStep(this.steps()[0]); } else this.render(); return; }
      if (this.scr === 'class') { Classes.onClick(e); return; }
      if (this.scr === 'ear') { const q = e.target.closest('[data-ear]'); if (q) EarGame.onClick(q); return; }
      const b = e.target.closest('[data-act]');
      if (b && this.scr === 'lesson') { Lesson.onClick(b); return; }
      if (this.scr === 'drill') { const d = e.target.closest('[data-dr],[data-mode]'); if (d) Drill.onClick(d); }
    });
    root.addEventListener('change', (e) => { if (this.scr === 'drill') Drill.onChange(e.target); });
  },
  level() { return clamp(store.get('learnLevel', 1), 1, 3); },
  steps() { return routine(this.level()); },
  goStep(s) {
    this.inRoutine = true;
    if (s.song) { store.set('lvl:' + s.song.id, s.lvl); Player.open(s.song); location.hash = '#canciones'; return; }
    location.hash = s.hash;
  },
  markDone(key) {
    const done = todayDone();
    if (!done.includes(key)) { done.push(key); store.set('today', { d: dayKey(), done }); }
    bumpStreak();
  },
  // un ejercicio con metrónomo terminado: apunta la velocidad limpia y dice qué toca la próxima vez
  exResult(ex, acc, speed, bpm) {
    const prev = cleanBpm(ex);
    if (acc >= 0.85 && speed >= 1) {
      const v = Math.round(bpm * speed);
      if (v > prev) { state.rec['bpm:' + ex.id] = { v }; store.set('rec', state.rec); }
      return `Te ha salido limpio a ${v} ppm. La próxima vez irá a ${Math.min(Math.max(v, prev) + 5, 208)}.`;
    }
    if (acc >= 0.85) return 'Limpio. Prueba ahora a velocidad normal.';
    if (acc < 0.6 && speed >= 1) return 'Baja a «Lento» hasta que salga limpio. La velocidad llega sola.';
    return '';
  },
  // tras terminar algo: si vienes de la práctica de hoy, el botón para seguir
  nextAction(doneKey) {
    if (!this.inRoutine) return null;
    const steps = this.steps(), done = todayDone();
    if (!steps.some((s) => s.key === doneKey) && !doneKey.startsWith('song:')) return null;
    const nx = steps.find((s) => !done.includes(s.key));
    if (!nx) return { label: '¡Práctica de hoy hecha!', icon: 'check-line', fn: () => { this.inRoutine = false; location.hash = '#aprender'; } };
    return { label: `Seguir con ${nx.kicker.toLowerCase()}`, icon: 'arrow-right-line', fn: () => this.goStep(nx) };
  },
  leave() { Drill.stop(); EarGame.st = 'idle'; Lesson.check = null; if (Player.host === 'aprender') Player.release(); },
  show(parts) {
    const [a, b, c] = parts;
    const was = this.scr;
    Drill.stop();
    if (!(a === 'ej' && c === 'tempo') && Player.host === 'aprender') Player.release();
    if (!a) { this.scr = 'home'; }
    else if (a === 'acordes' || a === 'punteo') { this.scr = 'track'; this.track = a; this.inRoutine = false; }
    else if (a === 'clases' || a === 'oido' && !EARI[b]) { this.scr = 'track'; this.track = a; this.inRoutine = false; }
    else if (a === 'clase' && CLI[b]) { Classes.open(b); this.scr = 'class'; }
    else if (a === 'oido') { if (was !== 'ear' || EarGame.g !== EARI[b]) EarGame.open(b); this.scr = 'ear'; }
    else if (a === 'guia') this.scr = 'guide';
    else if (a === 'acorde' && CHORDS[b]) { if (was !== 'lesson' || Lesson.id !== b || Lesson.review) Lesson.open(b, false); else Lesson.check = null; this.scr = 'lesson'; }
    else if (a === 'repaso') { Lesson.open(null, true); this.scr = 'lesson'; }
    else if (a === 'ej' && EXI[b]) {
      if (c === 'tempo') {
        this.scr = 'player';
        Player.open(exerciseSong(EXI[b]), 'aprender');
        if (this.autoStart) Player.start(false);
      } else { if (was !== 'drill' || Drill.ex !== EXI[b]) Drill.open(EXI[b]); this.scr = 'drill'; }
      this.autoStart = false;
    } else if (a === 'cambios') {
      const [x, y] = (b || '').split('~');
      const pair = CHORDS[x] && CHORDS[y] && x !== y ? [x, y] : null;
      Drill.open(EXI.changes, { pair, back: was === 'lesson' && !Lesson.review ? '#aprender/acorde/' + enc(Lesson.id) : undefined });
      this.scr = 'drill';
    } else this.scr = 'home';
    this.render();
    $('#learn .scroll')?.scrollTo?.(0, 0);
  },
  render() {
    const root = $('#learn'); if (!root) return;
    root.hidden = this.scr === 'player';
    if (this.scr === 'player') return;
    root.innerHTML = this.scr === 'home' ? this.homeHTML() : this.scr === 'track' ? this.trackHTML() : this.scr === 'guide' ? this.guideHTML()
      : this.scr === 'class' ? Classes.html() : this.scr === 'ear' ? EarGame.html() : this.scr === 'lesson' ? Lesson.html() : Drill.html();
  },
  frame(f, dt, now) {
    if (this.scr === 'drill') Drill.frame(f, now);
    else if (this.scr === 'lesson' && f && Lesson.check && !Cal.needed()) Lesson.frameCheck(f);
  },
  // ---------- inicio ----------
  homeHTML() {
    const lvl = this.level(), steps = this.steps(), done = todayDone();
    const nDone = steps.filter((s) => done.includes(s.key)).length, mins = steps.reduce((a, s) => a + s.min, 0);
    const nLearned = CHORD_ORDER.filter((x) => state.learned[x]).length;
    const nPunteo = EXERCISES.filter((e) => e.track === 'punteo' && bestStars(e) > 0).length, totPunteo = EXERCISES.filter((e) => e.track === 'punteo').length;
    const allDone = nDone === steps.length;
    const nRead = CLASSES.filter((c) => classRead(c.id)).length, nEar = EAR_GAMES.filter((g) => state.rec['ear:' + g.id]).length, sk = streak();
    const welcome = store.get('welcomed', false) ? '' : `<section class="card welcome">
        <h2>Bienvenido a Traste</h2>
        <p>Traste escucha tu guitarra por el micrófono y te dice si lo que tocas suena bien. Afina, sigue la práctica de hoy y toca una canción al final. No hace falta cuenta y nada sale de tu equipo.</p>
        <div class="flex flex-wrap gap-2"><button type="button" class="btn btn-primary" data-welcome="tune">${icon('dashboard-3-line')}Afinar la guitarra</button><button type="button" class="btn btn-ghost" data-welcome="ok">Entendido</button></div>
      </section>`;
    return `<div class="screen"><div class="scr-body scroll"><div class="lh">
      <div class="lh-top"><h1 class="lh-title">Aprender</h1>${sk.n ? `<span class="streak ${sk.today ? 'on' : ''}" title="${sk.today ? 'Hoy ya has practicado' : 'Practica hoy para no perder la racha'}. Tu mejor racha: ${sk.best} ${sk.best === 1 ? 'día' : 'días'}">${icon('fire-line')}<b>${sk.n}</b> ${sk.n === 1 ? 'día' : 'días'} seguidos</span>` : ''}</div>
      ${welcome}
      <div class="lh-grid">
        <section class="card">
          <div class="card-head"><div><h2>${icon('compass-3-line')}¿Qué quieres aprender?</h2><p>Elige y practica a tu aire</p></div></div>
          <div class="tracks">
          <a class="track" href="#aprender/acordes">
            <span class="tr-ico">${icon('hand')}</span>
            <span class="tr-txt"><b>Acordes</b><span>Formas, cambios entre acordes y rasgueo</span><span class="tr-meta"><span class="tr-bar"><i style="width:${(nLearned / CHORD_ORDER.length) * 100}%"></i></span>${nLearned} de ${CHORD_ORDER.length} aprendidos</span></span>
            ${icon('arrow-right-s-line', 'chev')}
          </a>
          <a class="track" href="#aprender/punteo">
            <span class="tr-ico alt">${icon('music-line')}</span>
            <span class="tr-txt"><b>Punteo</b><span>Dedos ágiles, notas del mástil y escalas</span><span class="tr-meta"><span class="tr-bar"><i style="width:${(nPunteo / totPunteo) * 100}%"></i></span>${nPunteo} de ${totPunteo} ejercicios superados</span></span>
            ${icon('arrow-right-s-line', 'chev')}
          </a>
          <a class="track" href="#aprender/clases">
            <span class="tr-ico c3">${icon('book-2-line')}</span>
            <span class="tr-txt"><b>Clases</b><span>Teoría de acordes, ritmo y técnica, explicado en corto</span><span class="tr-meta"><span class="tr-bar"><i style="width:${(nRead / CLASSES.length) * 100}%"></i></span>${nRead} de ${CLASSES.length} leídas</span></span>
            ${icon('arrow-right-s-line', 'chev')}
          </a>
          <a class="track" href="#aprender/oido">
            <span class="tr-ico c4">${icon('headphone-line')}</span>
            <span class="tr-txt"><b>Oído</b><span>Reconocer notas y acordes al escucharlos</span><span class="tr-meta"><span class="tr-bar"><i style="width:${(nEar / EAR_GAMES.length) * 100}%"></i></span>${nEar} de ${EAR_GAMES.length} juegos probados</span></span>
            ${icon('arrow-right-s-line', 'chev')}
          </a>
          </div>
        </section>
        <section class="card today">
          <div class="card-head">
            <div><h2>${icon('calendar-check-line')}Práctica de hoy</h2><p>Unos ${mins} minutos · ${allDone ? '¡hecha!' : `${nDone} de ${steps.length} hechos`}</p></div>
            <button type="button" class="btn ${allDone ? 'btn-soft' : 'btn-primary'}" data-today-go>${allDone ? icon('restart-line') + 'Repetir' : icon('play-fill') + (nDone ? 'Seguir' : 'Empezar')}</button>
          </div>
          <div class="lh-lvl">
            <div class="seg" role="group" aria-label="Tu nivel">${[1, 2, 3].map((l) => `<button type="button" data-level="${l}" aria-pressed="${l === lvl}">${LVL[l].n}</button>`).join('')}</div>
            <p>${LVL[lvl].d}</p>
          </div>
          <ol class="today-list">${steps.map((s, i) => { const ok = done.includes(s.key); return `<li><button type="button" class="tstep ${ok ? 'done' : ''}" data-today="${esc(s.key)}">
              <span class="ts-n">${ok ? icon('check-line') : i + 1}</span>
              <span class="ts-txt"><em>${s.kicker}</em><b>${s.title}</b><span>${s.sub}</span></span>
              <span class="ts-min">${s.min} min</span></button></li>`; }).join('')}</ol>
        </section>
      </div>
    </div></div></div>`;
  },
  exRow(e) {
    const lvl = this.level(), st = bestStars(e);
    return `<a class="ex-row ${e.lvl > lvl ? 'above' : ''}" href="#aprender/ej/${e.id}">
      <span class="ex-ico">${icon(e.icon)}</span>
      <span class="ex-txt"><b>${e.title}</b><span>${e.sub}</span></span>
      <span class="ex-meta">${cleanBpm(e) ? `<span class="ex-bpm" title="Tu velocidad limpia">${cleanBpm(e)} ppm</span>` : ''}<span class="lvl-pips" title="Nivel ${LVL[e.lvl].n}">${[1, 2, 3].map((k) => `<i class="${k <= e.lvl ? 'on' : ''}"></i>`).join('')}</span>${st ? miniStars(st) : ''}</span>
      ${icon('arrow-right-s-line', 'chev')}</a>`;
  },
  trackHTML() {
    const chords = this.track === 'acordes';
    let body = '';
    if (this.track === 'clases' || this.track === 'oido') {
      const cls = this.track === 'clases', lvl = this.level();
      if (cls) body = CLASS_GROUPS.map((g) => { const list = CLASSES.filter((c) => c.group === g); return `<section class="trk-sec"><h2 class="trk-h">${g}<span>${list.filter((c) => classRead(c.id)).length}/${list.length}</span></h2><div class="ex-list">${list.map((c) => `<a class="ex-row ${c.lvl > lvl ? 'above' : ''}" href="#aprender/clase/${c.id}">
          <span class="ex-ico">${icon(classRead(c.id) ? 'check-line' : 'book-2-line')}</span>
          <span class="ex-txt"><b>${c.title}</b><span>${c.sub}</span></span>
          <span class="ex-meta"><span class="ex-bpm">${c.min} min</span></span>${icon('arrow-right-s-line', 'chev')}</a>`).join('')}</div></section>`; }).join('');
      else body = `<section class="trk-sec"><div class="ex-list">${EAR_GAMES.map((g) => { const r = state.rec['ear:' + g.id]; return `<a class="ex-row" href="#aprender/oido/${g.id}">
          <span class="ex-ico">${icon(g.icon)}</span>
          <span class="ex-txt"><b>${g.title}</b><span>${g.sub}</span></span>
          <span class="ex-meta">${r ? `<span class="ex-bpm">${r.v}/10</span>${miniStars(r.stars)}` : ''}</span>${icon('arrow-right-s-line', 'chev')}</a>`; }).join('')}</div></section>`;
      return `<div class="screen">
        <div class="scr-top">
          <a class="btn btn-soft btn-icon" href="#aprender" aria-label="Volver">${icon('arrow-left-line')}</a>
          <div class="scr-title"><h1>${cls ? 'Clases' : 'Oído'}</h1><p>${cls ? 'Dos o tres minutos cada una, con ejemplos que puedes escuchar' : 'La app toca y tú eliges. No hace falta micrófono'}</p></div>
        </div>
        <div class="scr-body scroll"><div class="trk">${body}</div></div>
      </div>`;
    }
    if (chords) {
      const next = CHORD_ORDER.find((x) => !state.learned[x]);
      const nL = CHORD_ORDER.filter((x) => state.learned[x]).length;
      body += `<a class="guide-link" href="#aprender/guia">${icon('book-open-line')}<span><b>Primeros pasos</b> Cómo sujetar la guitarra, pisar y leer un diagrama</span>${icon('arrow-right-s-line', 'chev')}</a>`;
      body += CHORD_GROUPS.map((g) => `<section class="trk-sec"><h2 class="trk-h">${g.name}<span>${g.ids.filter((x) => state.learned[x]).length}/${g.ids.length}</span></h2>
        <div class="ctiles">${g.ids.map((id) => `<a class="ctile ${state.learned[id] ? 'learned' : ''} ${id === next ? 'next' : ''}" href="#aprender/acorde/${enc(id)}" title="${chordLongName(id)}">
          <b>${chordLabel(id)}</b><span>${id === next ? 'siguiente' : CHORDS[id].variant ? 'fácil' : SUFFIX_NAME[chordParts(id).suffix] ?? chordParts(id).suffix}</span>${state.learned[id] ? icon('check-line', 'ck') : ''}</a>`).join('')}</div></section>`).join('');
      body += `<section class="trk-sec"><h2 class="trk-h">Practica</h2><div class="ex-list">
        ${this.exRow(EXI.changes)}
        <a class="ex-row ${nL < 2 ? 'off' : ''}" href="${nL < 2 ? '#aprender/acordes' : '#aprender/repaso'}" ${nL < 2 ? 'aria-disabled="true"' : ''}><span class="ex-ico">${icon('shuffle-line')}</span><span class="ex-txt"><b>Repaso de memoria</b><span>${nL < 2 ? 'Aprende dos acordes para desbloquearlo' : 'Un acorde que ya sabes, sin mirar el diagrama'}</span></span><span class="ex-meta"></span>${icon('arrow-right-s-line', 'chev')}</a>
      </div></section>`;
      body += `<section class="trk-sec"><h2 class="trk-h">Ritmo</h2><div class="ex-list">${EXERCISES.filter((e) => e.group === 'Ritmo').map((e) => this.exRow(e)).join('')}</div></section>`;
    } else {
      const groups = [...new Set(EXERCISES.filter((e) => e.track === 'punteo').map((e) => e.group))];
      body += groups.map((g) => `<section class="trk-sec"><h2 class="trk-h">${g}</h2><div class="ex-list">${EXERCISES.filter((e) => e.group === g).map((e) => this.exRow(e)).join('')}</div></section>`).join('');
      body += `<section class="trk-sec"><h2 class="trk-h">Melodías</h2><div class="ex-list"><a class="ex-row" href="#canciones"><span class="ex-ico">${icon('music-2-line')}</span><span class="ex-txt"><b>Canciones en nivel Fácil</b><span>La melodía nota a nota, con la bola que marca el ritmo</span></span><span class="ex-meta"></span>${icon('arrow-right-s-line', 'chev')}</a></div></section>`;
    }
    return `<div class="screen">
      <div class="scr-top">
        <a class="btn btn-soft btn-icon" href="#aprender" aria-label="Volver">${icon('arrow-left-line')}</a>
        <div class="scr-title"><h1>${chords ? 'Acordes' : 'Punteo'}</h1><p>${chords ? 'Aprende cada acorde en tres pasos y practica los cambios y el ritmo' : 'Dedos ágiles, notas del mástil y escalas'}</p></div>
      </div>
      <div class="scr-body scroll"><div class="trk">${body}</div></div>
    </div>`;
  },
  guideHTML() {
    return `<div class="screen">
      <div class="scr-top">
        <a class="btn btn-soft btn-icon" href="#aprender/acordes" aria-label="Volver">${icon('arrow-left-line')}</a>
        <div class="scr-title"><h1>Primeros pasos</h1><p>Lo básico antes de tu primer acorde</p></div>
      </div>
      <div class="scr-body scroll">
        <div class="guide-grid">${guideItems().map((g, i) => `
          <div class="guide-card">
            <h3><span class="n">${i + 1}</span>${g.t}</h3>
            ${g.art === 'hand' ? `<div class="flex justify-center py-1">${handSVG(new Set([1, 2, 3, 4]), 120)}</div>${fingerLegend()}` : ''}
            ${g.art === 'diagram' ? `<div class="diagram">${chordDiagram(CHORDS.Am)}</div>` : ''}
            <p>${g.d}</p>
          </div>`).join('')}</div>
        <div class="flex justify-center mt-5 mb-2"><a class="btn btn-primary btn-lg" href="#aprender/acorde/${CHORD_ORDER[0]}">Empezar con ${chordLabel(CHORD_ORDER[0])}${icon('arrow-right-line')}</a></div>
      </div>
    </div>`;
  },
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
