/* ============================================================
   DSP y teoría musical — funciones puras (se prueban en Node)
   ============================================================ */

// Afinación estándar, de 6ª (Mi grave) a 1ª (Mi agudo), en MIDI
const OPEN_MIDI = [40, 45, 50, 55, 59, 64]; // índice 0 = cuerda 6
const stringMidi = (s) => OPEN_MIDI[6 - s];   // s: 1..6

const LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const LATIN = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const LETTER_TO_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);

function noteToMidi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('Nota no válida: ' + name);
  let pc = LETTER_TO_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 12 * (parseInt(m[3], 10) + 1) + pc;
}

/* ---------- Detección de tono: YIN (de Cheveigné & Kawahara, 2002) ---------- */
function yin(buf, sr, opts = {}) {
  const fmin = opts.fmin || 70, fmax = opts.fmax || 1400, thr = opts.threshold || 0.12;
  const tauMax = Math.min(Math.floor(sr / fmin), Math.floor(buf.length / 2));
  const tauMin = Math.max(2, Math.floor(sr / fmax));
  const W = buf.length - tauMax - 1;
  const d = new Float32Array(tauMax + 2);
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const x = buf[i] - buf[i + tau]; s += x * x; }
    d[tau] = s;
  }
  const c = new Float32Array(tauMax + 2); c[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= tauMax + 1; tau++) { run += d[tau]; c[tau] = run > 0 ? d[tau] * tau / run : 1; }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (c[t] < thr) { while (t + 1 <= tauMax && c[t + 1] < c[t]) t++; tau = t; break; }
  }
  if (tau < 0) {
    let best = tauMin;
    for (let t = tauMin; t <= tauMax; t++) if (c[t] < c[best]) best = t;
    if (c[best] > 0.3) return null;
    tau = best;
  }
  let est = tau;
  if (tau > 1 && tau < tauMax) {
    const s0 = c[tau - 1], s1 = c[tau], s2 = c[tau + 1], den = s0 + s2 - 2 * s1;
    if (den) est = tau + (s0 - s2) / (2 * den);
  }
  return { freq: sr / est, prob: 1 - c[tau] };
}

// Diezma a ~24 kHz con un filtro [1 2 1]/4 para abaratar YIN (la guitarra no pasa de ~1,4 kHz de fundamental)
function decimate(src, factor) {
  if (factor <= 1) return { buf: src, f: 1 };
  const n = Math.floor(src.length / factor), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = i * factor;
    out[i] = 0.25 * (src[j - 1] ?? src[j]) + 0.5 * src[j] + 0.25 * (src[j + 1] ?? src[j]);
  }
  return { buf: out, f: factor };
}

function rms(buf, from = 0) {
  let s = 0; for (let i = from; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / Math.max(1, buf.length - from));
}

/* ---------- Energía por semitono (máximo por banda, Stark & Plumbley 2009) ---------- */
// mags: magnitudes lineales del FFT (fftSize/2 valores)
function semitoneEnergies(mags, sr, fftSize, lo, hi) {
  const binHz = sr / fftSize, out = new Float32Array(hi - lo + 1);
  for (let m = lo; m <= hi; m++) {
    const f = midiToFreq(m);
    const a = Math.max(1, Math.ceil(f * 0.9715 / binHz)), b = Math.min(mags.length - 1, Math.floor(f * 1.0293 / binHz));
    let v = 0;
    if (b < a) v = mags[Math.round(f / binHz)] || 0;
    else for (let k = a; k <= b; k++) if (mags[k] > v) v = mags[k];
    out[m - lo] = v;
  }
  return out;
}

/* ---------- Reconocimiento de acordes por plantillas de armónicos ----------
   Como sabemos exactamente qué nota debe dar cada cuerda, comparamos el espectro (por semitonos)
   con la plantilla armónica de varias hipótesis: el acorde correcto, el acorde con una cuerda
   apagada, con una cuerda "X" sonando y el resto de acordes. Gana la que mejor explica el sonido. */
const V_LO = 40, V_HI = 92;
const HARM = [[0, 1], [12, 0.75], [19, 0.55], [24, 0.45], [28, 0.32], [31, 0.28], [34, 0.18], [36, 0.16]];
// Los micrófonos pequeños (móvil, portátil) apenas captan por debajo de ~150 Hz:
// las parciales graves pesan la mitad para no "echar en falta" cuerdas que sí suenan.
function voicingTemplate(midis, lo = V_LO, hi = V_HI) {
  const t = new Float32Array(hi - lo + 1);
  for (const m of midis) for (const [off, w] of HARM) { const k = m + off - lo; if (k >= 0 && k < t.length) t[k] += w * (m + off < 52 ? 0.5 : 1); }
  for (let i = 0; i < t.length; i++) t[i] = Math.sqrt(t[i]);
  return t;
}
// Compresión logarítmica: iguala cuerdas tocadas con distinta fuerza y la coloración del micrófono
function prepSemis(semis) {
  const v = new Float32Array(semis.length); let mx = 0;
  for (let i = 0; i < semis.length; i++) mx = Math.max(mx, semis[i]);
  for (let i = 0; i < semis.length; i++) v[i] = mx > 0 ? Math.log1p(30 * semis[i] / mx) : 0;
  return v;
}
function cosine(a, b) { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return x && y ? d / Math.sqrt(x * y) : 0; }

// hipótesis para un acorde esperado: [{kind:'ok'|'missing'|'extra'|'other', string?, id?, midis}]
function chordHypotheses(expected, library) {
  const hyps = [{ kind: 'ok', midis: expected.notes.map((n) => n.midi) }];
  if (expected.notes.length > 2) for (const n of expected.notes) {
    const rest = expected.notes.filter((x) => x !== n).map((x) => x.midi);
    hyps.push({ kind: 'missing', string: n.string, midi: n.midi, midis: rest });
  }
  for (let s = 1; s <= 6; s++) {
    if (expected.notes.some((n) => n.string === s) || (expected.dir === 'U' && s >= 5)) continue;
    hyps.push({ kind: 'extra', string: s, midi: stringMidi(s), midis: [...hyps[0].midis, stringMidi(s)] });
  }
  for (const [id, notes] of library) {
    const ms = notes.map((n) => n.midi);
    if (ms.slice().sort().join() === hyps[0].midis.slice().sort().join()) continue;
    hyps.push({ kind: 'other', id, midis: ms });
  }
  return hyps.map((h) => ({ ...h, tpl: voicingTemplate(h.midis) }));
}

// ok: el acorde esperado explica el sonido (o casi tan bien como la mejor hipótesis).
// confident: solo entonces se da un diagnóstico concreto; si no, se dice que no se ha oído claro.
function matchChord(semis, hyps, margin = 0.02) {
  const v = prepSemis(semis);
  let best = null, other = 0;
  const okScore = cosine(v, hyps[0].tpl);
  for (const h of hyps) {
    const s = cosine(v, h.tpl);
    if (h.kind === 'other' && s > other) other = s;
    if (!best || s > best.score) best = { ...h, score: s };
  }
  // una cuerda de más o de menos del mismo acorde se tolera (margin); otro acorde (p. ej. Mi frente
  // a Mi7, que se separan por una sola nota) nunca puede explicar el sonido mejor que el esperado
  const ok = okScore >= 0.6 && other - okScore < 0.006 && (best.kind === 'ok' || best.score - okScore < margin);
  const need = best.kind === 'missing' && best.string >= 5 ? 0.05 : 0.02;
  const confident = !ok && okScore >= 0.5 && best.kind !== 'ok' && best.score - okScore >= need;
  return { ok, score: okScore, best, confident };
}

// Nota nueva a partir de lo que "aparece" en el espectro tras un ataque (después − antes).
// Funciona aunque la cuerda anterior siga sonando, que es donde el detector de nota única duda.
const NOTE_TPL = [];
function newNote(flux, minScore = 0.55) {
  let mx = 0; for (const x of flux) if (x > mx) mx = x;
  if (mx <= 0) return null;
  const v = new Float32Array(flux.length);
  for (let i = 0; i < flux.length; i++) v[i] = Math.log1p(30 * flux[i] / mx);
  let best = null, bs = 0;
  for (let m = 40; m <= 77; m++) {
    const t = NOTE_TPL[m] || (NOTE_TPL[m] = voicingTemplate([m]));
    const s = cosine(v, t); if (s > bs) { bs = s; best = m; }
  }
  return bs >= minScore ? best : null;
}

/* ---------- Síntesis de cuerda pulsada: Karplus-Strong con afinación fraccional ---------- */
function ksRender(freq, sr, dur = 2.4, opts = {}) {
  const n = Math.floor(sr * dur), out = new Float32Array(n);
  const D = sr / freq;
  let N = Math.floor(D - 0.5), frac = D - 0.5 - N;
  if (frac < 0.1) { N -= 1; frac += 1; }
  const C = (1 - frac) / (1 + frac); // paso-todo para el retardo fraccional
  const line = new Float32Array(N);
  const bright = opts.bright ?? 0.55;
  let p = 0, mean = 0;
  for (let i = 0; i < N; i++) { p += bright * ((Math.random() * 2 - 1) - p); line[i] = p; mean += p; }
  mean /= N; for (let i = 0; i < N; i++) line[i] -= mean;
  const t60 = opts.t60 ?? (freq < 150 ? 3.2 : freq < 300 ? 2.4 : 1.7);
  const g = Math.pow(10, -3 / (t60 * freq)); // pérdida por periodo
  let idx = 0, prev = 0, apx = 0, apy = 0;
  for (let i = 0; i < n; i++) {
    const x = line[idx];
    const avg = 0.5 * (x + prev); prev = x;
    const y = C * avg + apx - C * apy; apx = avg; apy = y;
    line[idx] = y * g;
    out[i] = x;
    idx = idx + 1 === N ? 0 : idx + 1;
  }
  const fade = Math.floor(sr * 0.06);
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < n; i++) out[i] *= 0.9 / peak;
  return out;
}

/* ---------- Partituras: melodías, acordes y niveles ---------- */
// "G3 A3:0.5 R:1 | ..." → [{midi|null, beats}]
function parseMelody(str) {
  return str.split(/\s+/).filter((t) => t && t !== '|').map((tok) => {
    const [n, b] = tok.split(':');
    return { midi: n === 'R' ? null : noteToMidi(n), beats: b ? parseFloat(b) : 1 };
  });
}

// Posición abierta (1ª posición): la cuerda con el traste más bajo; dedo = traste (1 dedo por traste)
function firstPosition(midi) {
  let best = null;
  for (let s = 1; s <= 6; s++) {
    const fret = midi - stringMidi(s);
    if (fret < 0 || fret > 5) continue;
    if (!best || fret < best.fret) best = { string: s, fret };
  }
  if (!best) return null;
  best.finger = best.fret === 0 ? 0 : Math.min(4, best.fret);
  best.midi = midi;
  return best;
}

// "G | C G | D:3 G:1" → [{chord, t, dur}]
function parseChordBars(str, bpb, start) {
  const out = []; let t = start;
  for (const bar of str.split('|')) {
    const toks = bar.trim().split(/\s+/).filter(Boolean);
    if (!toks.length) continue;
    const explicit = toks.some((x) => x.includes(':'));
    for (const tok of toks) {
      const [name, b] = tok.split(':');
      const dur = explicit ? parseFloat(b || '0') : bpb / toks.length;
      out.push({ chord: name, t, dur }); t += dur;
    }
  }
  return out;
}

const STRUM_PATTERNS = {
  4: [[0, 'D'], [1, 'D'], [1.5, 'U'], [2.5, 'U'], [3, 'D'], [3.5, 'U']],
  3: [[0, 'D'], [1, 'D'], [1.5, 'U'], [2, 'D'], [2.5, 'U']],
};

function chordNotes(chord, dir = 'D') {
  const notes = [];
  chord.frets.forEach((f, i) => {
    if (f < 0) return;
    const s = 6 - i;
    notes.push({ string: s, fret: f, finger: chord.fingers[i] || 0, midi: OPEN_MIDI[i] + f });
  });
  // en el rasgueo hacia arriba se tocan sobre todo las cuerdas agudas
  return dir === 'U' ? notes.filter((n) => n.string <= 4) : notes;
}

function buildSong(song, chords) {
  const melody = parseMelody(song.melody);
  const melodyEvents = []; let t = 0;
  for (const n of melody) {
    if (n.midi !== null) {
      const pos = firstPosition(n.midi);
      if (!pos) throw new Error(`${song.id}: nota fuera de posición ${n.midi}`);
      melodyEvents.push({ t, dur: n.beats, notes: [pos] });
    }
    t += n.beats;
  }
  const total = t;
  const pickup = song.pickup || 0;
  const chordTrack = parseChordBars(song.chords, song.bpb, pickup);
  const pattern = STRUM_PATTERNS[song.bpb] || STRUM_PATTERNS[4];
  const hard = [];
  for (const seg of chordTrack) {
    const ch = chords[seg.chord];
    if (!ch) throw new Error(`${song.id}: acorde desconocido ${seg.chord}`);
    const barStart = pickup + Math.floor((seg.t - pickup) / song.bpb + 1e-6) * song.bpb;
    for (const [off, dir] of pattern) {
      const at = barStart + off;
      if (at < seg.t - 1e-6 || at >= seg.t + seg.dur - 1e-6) continue;
      hard.push({ t: at, dur: 0.5, chord: seg.chord, dir, notes: chordNotes(ch, dir), first: Math.abs(at - seg.t) < 1e-6 });
    }
  }
  hard.forEach((e, i) => { e.dur = Math.min(1, (hard[i + 1]?.t ?? total) - e.t); });
  return { total, pickup, chordTrack, levels: { easy: melodyEvents, hard } };
}

/* ---------- Importar tablatura ASCII (el formato universal de internet) ---------- */
function parseAsciiTab(text, chords = {}) {
  const lines = text.replace(/\t/g, '  ').split(/\r?\n/);
  const isTab = (l) => /^\s*[A-Ga-g]?[#b]?\s*[|:]?[-–0-9|hpbrx\/\\~().^*\s]*-[-–0-9|hpbrx\/\\~().^*\s]*$/.test(l) && (l.match(/-/g) || []).length >= 4;
  const blocks = [];
  for (let i = 0; i + 5 < lines.length; i++) {
    if ([0, 1, 2, 3, 4, 5].every((k) => isTab(lines[i + k]))) { blocks.push(lines.slice(i, i + 6)); i += 5; }
  }
  if (!blocks.length) throw new Error('No encuentro 6 líneas de tablatura seguidas (e|---, B|---, ...).');
  const raw = []; let offset = 0;
  for (const b of blocks) {
    const rows = b.map((l) => l.replace(/^\s*[A-Ga-g]?[#b]?\s*[|:]?/, ''));
    const width = Math.max(...rows.map((r) => r.length));
    const cols = new Map();
    rows.forEach((row, si) => {
      for (let c = 0; c < row.length; c++) {
        if (!/\d/.test(row[c]) || /\d/.test(row[c - 1] || '')) continue;
        let num = row[c]; if (/\d/.test(row[c + 1] || '') && parseInt(num + row[c + 1], 10) <= 24) num += row[c + 1];
        const fret = parseInt(num, 10);
        if (!cols.has(c)) cols.set(c, []);
        cols.get(c).push({ string: si + 1, fret, midi: stringMidi(si + 1) + fret });
      }
    });
    [...cols.keys()].sort((a, b) => a - b).forEach((c) => raw.push({ col: offset + c, notes: cols.get(c) }));
    offset += width + 2;
  }
  if (!raw.length) throw new Error('La tablatura no tiene notas.');
  // fusiona columnas pegadas (acordes escritos con números de 2 cifras desalineados)
  const merged = [];
  for (const e of raw) {
    const last = merged[merged.length - 1];
    if (last && e.col - last.col <= 1 && !e.notes.some((n) => last.notes.some((m) => m.string === n.string))) last.notes.push(...e.notes);
    else merged.push({ col: e.col, notes: [...e.notes] });
  }
  const gaps = merged.slice(1).map((e, i) => e.col - merged[i].col).sort((a, b) => a - b);
  const unit = Math.max(1, gaps[Math.floor(gaps.length / 2)] || 3);
  let pos = 1;
  const events = merged.map((e, i) => {
    const fretted = e.notes.filter((n) => n.fret > 0).map((n) => n.fret);
    if (fretted.length) {
      const lo = Math.min(...fretted), hi = Math.max(...fretted);
      if (lo < pos || hi > pos + 3) pos = hi <= 4 ? 1 : lo;
    }
    e.notes.forEach((n) => { n.finger = n.fret === 0 ? 0 : Math.max(1, Math.min(4, n.fret - pos + 1)); });
    e.notes.sort((a, b) => a.string - b.string);
    const t = Math.round(((e.col - merged[0].col) / unit) * 2) / 2;
    const ev = { t, dur: 1, notes: e.notes };
    if (e.notes.length >= 3) {
      const key = JSON.stringify([6, 5, 4, 3, 2, 1].map((s) => e.notes.find((n) => n.string === s)?.fret ?? -1));
      const name = Object.keys(chords).find((k) => JSON.stringify(chords[k].frets) === key);
      if (name) ev.chord = name;
      ev.dir = 'D';
    }
    return ev;
  });
  events.forEach((e, i) => { e.dur = Math.max(0.5, Math.min(2, (events[i + 1]?.t ?? e.t + 1) - e.t)); });
  return events;
}

if (typeof module !== 'undefined') module.exports = {
  OPEN_MIDI, stringMidi, LETTERS, LATIN, midiToFreq, freqToMidi, noteToMidi, yin, decimate, rms,
  semitoneEnergies, ksRender, parseMelody, firstPosition, parseChordBars,
  chordNotes, voicingTemplate, chordHypotheses, matchChord, newNote, V_LO, V_HI, buildSong, parseAsciiTab, STRUM_PATTERNS,
};
