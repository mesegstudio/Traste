const D = require('../src/dsp.js');
const { CHORDS, SONGS } = require('../src/data.js');
const sr = 48000;
let fails = 0;
const check = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };

// FFT radix-2 + ventana Blackman (como AnalyserNode)
function fftMag(sig, N) {
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) { const w = 0.42 - 0.5 * Math.cos(2*Math.PI*i/N) + 0.08 * Math.cos(4*Math.PI*i/N); re[i] = (sig[i]||0) * w; }
  for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= N; len <<= 1) { const a = -2*Math.PI/len; for (let i = 0; i < N; i += len) for (let k = 0; k < len/2; k++) { const wr = Math.cos(a*k), wi = Math.sin(a*k); const xr = re[i+k+len/2]*wr - im[i+k+len/2]*wi, xi = re[i+k+len/2]*wi + im[i+k+len/2]*wr; re[i+k+len/2] = re[i+k]-xr; im[i+k+len/2] = im[i+k]-xi; re[i+k]+=xr; im[i+k]+=xi; } }
  const m = new Float32Array(N/2); for (let i = 0; i < N/2; i++) m[i] = Math.hypot(re[i], im[i]) / N; return m;
}

// 1) YIN sobre cuerdas sintetizadas (Karplus-Strong) + ruido
let worst = 0;
for (let midi = 40; midi <= 69; midi++) {
  const f = D.midiToFreq(midi);
  const s = D.ksRender(f, sr, 1.0);
  for (let i = 0; i < s.length; i++) s[i] += (Math.random()*2-1) * 0.01;
  for (const at of [0.08, 0.3, 0.7]) {
    const win = s.subarray(Math.floor(at*sr), Math.floor(at*sr) + 4096);
    const { buf, f: fac } = D.decimate(win, 2);
    const r = D.yin(buf, sr / fac);
    const cents = r ? (D.freqToMidi(r.freq) - midi) * 100 : 9999;
    if (r && r.prob >= 0.9) worst = Math.max(worst, Math.abs(cents));
    if (r && r.prob >= 0.9 || at < 0.5) check(r && r.prob >= 0.9 && Math.abs(cents) < 8, `yin midi ${midi} @${at}s → ${r && r.freq.toFixed(2)} (${cents.toFixed(1)} cents, prob ${r && r.prob.toFixed(2)})`);
  }
}
console.log('YIN peor error (cents):', worst.toFixed(2));

// 2) Chroma de acordes rasgueados sintéticos
function strum(notes, gain = {}) {
  const out = new Float32Array(sr);
  notes.forEach((n, k) => { const s = D.ksRender(D.midiToFreq(n.midi), sr, 1.0); const off = Math.floor(k * 0.012 * sr); const g = gain[n.string] ?? 1; for (let i = 0; i + off < out.length; i++) out[i+off] += s[i] * g * (0.7 + Math.random()*0.3); });
  for (let i = 0; i < out.length; i++) out[i] += (Math.random()*2-1) * 0.02;
  return out;
}
function evalSig(sig, chord) {
  const N = 16384, m = fftMag(sig.subarray(Math.floor(0.05*sr)), N);
  const semis = D.semitoneEnergies(m, sr, N, D.V_LO, D.V_HI);
  const lib = Object.keys(CHORDS).map(id => [id, D.chordNotes(CHORDS[id])]);
  const hyps = D.chordHypotheses({ notes: D.chordNotes(chord) }, lib);
  const r = D.matchChord(semis, hyps);
  return { ok: r.ok, score: r.score, missing: r.best.kind, extra: r.best.kind === 'ok' ? '' : (r.best.string || r.best.id) };
}
const ids = Object.keys(CHORDS);
let okCount = 0, falsePos = 0, missDetected = 0, missTotal = 0;
for (const id of ids) {
  const ch = CHORDS[id];
  const notes = D.chordNotes(ch);
  const r = evalSig(strum(notes), ch);
  if (r.ok) okCount++; else console.log('  correcto no reconocido:', id, r.score.toFixed(2), 'missing', r.missing, 'extra', r.extra);
  // acorde equivocado: tocar otro acorde distinto
  for (const other of ids) {
    if (other === id) continue;
        // (los subconjuntos también se prueban)
    const r2 = evalSig(strum(D.chordNotes(CHORDS[other])), ch);
    if (r2.ok) { falsePos++; console.log('  falso positivo: toco', other, 'esperando', id, r2.score.toFixed(2)); }
  }
  // cuerda apagada (la nota más aguda sin sonar si su clase solo aparece una vez)
  const pcsCount = {}; notes.forEach(n => pcsCount[n.midi%12] = (pcsCount[n.midi%12]||0)+1);
  const lone = notes.find(n => pcsCount[n.midi%12] === 1);
  if (lone) { missTotal++; const r3 = evalSig(strum(notes, { [lone.string]: 0.0 }), ch); if (!r3.ok) missDetected++; }
}
console.log(`Acordes correctos reconocidos: ${okCount}/${ids.length} · falsos positivos: ${falsePos} · cuerda muda detectada: ${missDetected}/${missTotal}`);
check(okCount >= ids.length - 1, 'reconocimiento de acordes');

// 3) Canciones: compases cuadran y todas las notas son tocables
for (const s of SONGS) {
  const b = D.buildSong(s, CHORDS);
  const bars = s.chords.split('|').length;
  check(Math.abs(b.total - ((s.pickup||0) + bars * s.bpb)) < 1e-6, `${s.id}: duración ${b.total} vs ${(s.pickup||0) + bars*s.bpb}`);
  // cada compás de melodía suma bpb
  const barsM = s.melody.split('|').map(x => D.parseMelody(x).reduce((a, n) => a + n.beats, 0));
  barsM.forEach((v, i) => { const want = (i === 0 && s.pickup) ? s.pickup : s.bpb; check(Math.abs(v - want) < 1e-6, `${s.id} compás ${i}: ${v} tiempos`); });
  console.log(`${s.id}: fácil ${b.levels.easy.length} · medio ${b.levels.medium.length} · difícil ${b.levels.hard.length} eventos`);
}

// 4) Tablatura ASCII
const tab = `
e|-----0-----0---|-------------3-|
B|---1---1-----1-|-----0-----0---|
G|-2-------2-----|---0---0-------|
D|---------------|-0-------------|
A|-3-------------|---------------|
E|---------------|-------------3-|`;
const ev = D.parseAsciiTab(tab, CHORDS);
console.log('Tab importada:', ev.length, 'eventos; primeros:', ev.slice(0,3).map(e => e.notes.map(n=>`${n.string}/${n.fret}(d${n.finger})`).join('+') + '@' + e.t).join('  '));
check(ev.length === 13, 'número de eventos de la tab: ' + ev.length);
const tab2 = `e|--0--|\nB|--1--|\nG|--0--|\nD|--2--|\nA|--3--|\nE|-----|`;
const ev2 = D.parseAsciiTab(tab2, CHORDS); check(ev2[0].chord === 'C', 'acorde detectado en tab: ' + ev2[0].chord);

console.log(fails ? `\n${fails} fallos` : '\nTodo OK');
process.exit(fails ? 1 : 0);
