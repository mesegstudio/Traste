// ruido reproducible: misma semilla en cada ejecución
let seed = 12345; Math.random = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
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
  console.log(`${s.id}: fácil (melodía) ${b.levels.easy.length} · arpegio ${b.levels.arp.length} · difícil (acordes) ${b.levels.hard.length} eventos`);
  // arpegio: notas sueltas de cada acorde, y al entrar un acorde siempre su bajo
  const bassOk = b.chordTrack.every((seg) => { const e = b.levels.arp.find((x) => Math.abs(x.t - seg.t) < 1e-6); const low = Math.max(...D.chordNotes(CHORDS[seg.chord]).map((n) => n.string)); return e && e.of === seg.chord && e.notes[0].string === low; });
  check(b.levels.arp.length >= b.chordTrack.length && b.levels.arp.every((e) => e.notes.length === 1 && D.chordNotes(CHORDS[e.of]).some((n) => n.midi === e.notes[0].midi)) && bassOk, `${s.id}: arpegio`);
}

// 4) Rasgueo tolerante: acepta el acorde rasgueado y rechaza una sola cuerda
let strumOk = 0, singleOk = 0, nStr = 0;
for (const id of ids) {
  const notes = D.chordNotes(CHORDS[id]); nStr++;
  const hyps = D.chordHypotheses({ notes }, Object.keys(CHORDS).filter(x => x !== id).map(x => [x, D.chordNotes(CHORDS[x])])), few = D.fewHypotheses(notes);
  const N = 16384, sem = (sig) => D.semitoneEnergies(fftMag(sig.subarray(Math.floor(0.05 * sr)), N), sr, N, D.V_LO, D.V_HI);
  if (D.strumOk(sem(strum(notes)), hyps, few, notes)) strumOk++;
  const one = notes[Math.floor(Math.random() * notes.length)];
  if (D.strumOk(sem(strum([one])), hyps, few, notes)) singleOk++;
}
console.log(`Rasgueo tolerante: acordes aceptados ${strumOk}/${nStr} · una sola cuerda aceptada ${singleOk}/${nStr}`);
check(strumOk >= nStr - 2 && singleOk <= 2, 'rasgueo tolerante'); // ~9 % con grabaciones reales (GuitarSet)

// 5) Cifrados pegados (texto inventado con los formatos de La Cuerda y Ultimate Guitar)
const C = require('../src/cifrado.js');
const name = (t) => C.parseChordName(t)?.id;
check(name('LAm') === 'Am' && name('Mi7') === 'E7' && name('SIm7b5') === 'Bm7b5' && name('Fa#m') === 'F#m' && name('Sib') === 'A#' && name('Bb') === 'A#' && name('C/G') === 'C' && name('Dsus4') === 'Dsus4', 'nombres de acordes');
check(!name('la') && !name('Hola') && !name('A,') && !name('Solo'), 'palabras que no son acordes');
const bm = C.makeChord(11, 'm7b5'), fs = C.makeChord(6, '');
check(bm.frets.join() === '-1,2,3,2,3,-1' && fs.frets.join() === '2,4,4,3,2,2' && fs.barre?.fret === 2, 'acordes con cejilla generados');
const txt = `Acordes:
 |||1||  ||||||
 |23|||  111111
  E7       F#
 (MI7)   (FA#)

Intro:
(e)-|-------|
(B)-|-------|
(G)-|-------|
(D)-|-2-2-2-|
(A)-|-0-0-0-|
(E)-|-------|

LAm          MI7
Una linea de prueba con letra
DO               SOL
Otra linea mas para el ensayo

Sin acordes la tercera
y tambien la cuarta

ESTRIBILLO
[F]Esto va [G]entre corchetes
 SIm7b5    MI7
/: Repite dos veces :/

(ESTRIBILLO)

Solo una palabra al empezar`;
const pc = C.parseCifrado(txt);
const names = pc.parts.map((p) => p.name.toLowerCase());
check(pc.parts[0].tab && pc.parts[0].tab.notes.length === 3 && pc.parts[0].tab.notes[0].notes.length === 2, 'tablatura de la intro');
check(pc.warnings.includes('legend') && !pc.parts.some((p) => p.lines?.some((l) => l.chords.some((c) => c.id === 'F#'))), 'leyenda de acordes ignorada');
check(pc.parts[1].lines.map((l) => l.chords.map((c) => c.id).join(' ')).join('|') === 'Am E7|C G', 'acordes sobre la letra');
check(pc.parts[2].copied && pc.parts[2].lines[0].chords[0].id === 'Am', 'estrofa sin acordes copia la anterior');
check(names.filter((n) => n === 'estribillo').length === 2 && pc.parts[3].lines.length === 3 && pc.parts[3].lines[0].chords.map((c) => c.id).join() === 'F,G', 'corchetes, /: :/ y repetición de partes');
check(pc.parts.at(-1).lines[0].lyric.startsWith('Solo una'), '«Solo …» es letra, no una parte');
const gen = {}, getChord = (id) => CHORDS[id] || (gen[id] ||= (() => { const c = C.parseChordName(id); return C.makeChord(c.pc, c.suffix); })());
const bc = C.buildCifrado(pc, { barsPerLine: 2, getChord });
check(bc.built.levels.arp.length > 0 && bc.built.levels.arp.filter((e) => !e.also).every((e) => e.notes.length === 1 && e.of)
  && bc.built.levels.hard.length > bc.built.levels.easy.length && bc.built.lyrics.length >= 8 && bc.nTab === 3 && bc.chordList.includes('Bm7b5'), 'canción construida');
console.log(`Cifrado: ${pc.parts.length} partes · ${bc.chordList.join(' ')} · ${bc.built.levels.hard.length} rasgueos`);

// ---------- Oído nuevo: ataques por espectro y nota que de verdad se pulsa ----------
{
  const L = require('../src/listen.js');
  const mix = (dur, notes, noise = 0.0008) => {
    const x = new Float32Array(Math.floor(sr * dur));
    for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * noise;
    for (const [midi, t, g, len] of notes) { const k = D.ksRender(D.midiToFreq(midi), sr, len || 2.4); const o = Math.floor(t * sr); for (let i = 0; i < k.length && o + i < x.length; i++) x[o + i] += k[i] * g; }
    return x;
  };
  const listen = (x, each) => {
    const H = new L.Hearing(sr, { gate: 0.004 }), hop = 800, seen = new Map();
    for (let p = 0; p < x.length; p += hop) { H.feed(x.subarray(p, Math.min(x.length, p + hop))); const f = H.frame(0.004, false); for (const a of f.attacks) seen.set(a.id, a); if (each) each(H, f, (p + hop) / sr); }
    return [...seen.values()];
  };
  const near = (as, t) => as.find((a) => Math.abs(a.pos / sr - t) < 0.03);
  // Sol al aire, luego Si mientras Sol sigue sonando, y después Sol otra vez (dos veces seguidas)
  let as = listen(mix(4, [[55, 0.5, 0.5], [59, 1.2, 0.25], [55, 2.2, 0.4], [55, 2.45, 0.4]]));
  check(as.length === 4, `cuatro ataques, ni uno más (${as.length})`);
  const a1 = near(as, 0.5), a2 = near(as, 1.2), a3 = near(as, 2.2), a4 = near(as, 2.45);
  check(a1 && a2 && a3 && a4, 'cada ataque en su sitio');
  check(as.every((a) => [0.5, 1.2, 2.2, 2.45].some((t) => Math.abs(a.pos / sr - t) < 0.008)), 'fecha del ataque con menos de 8 ms de error');
  check(a2 && L.attackHas(a2, 59) && !L.attackHas(a2, 55), 'al pulsar Si, el Sol que sigue sonando NO cuenta como tocado');
  check(a3 && L.attackHas(a3, 55) && !L.attackHas(a3, 59), 'Sol pulsado de nuevo sí cuenta, y el Si que sonaba no');
  check(a4 && L.attackHas(a4, 55), 'la misma nota repetida a los 250 ms se oye como otro ataque');
  // nota suave debajo de una que suena fuerte: el volumen total casi no sube, pero el espectro sí cambia
  as = listen(mix(3, [[40, 0.5, 0.8], [67, 1.1, 0.08]]));
  const soft = near(as, 1.1);
  check(soft && L.attackHas(soft, 67) && !L.attackHas(soft, 40), 'nota suave bajo una fuerte: se oye y se identifica');
  // un golpe sin nota (ruido corto) mientras suena la nota esperada no la da por tocada
  { const x = mix(3, [[57, 0.4, 0.5]]); const o = Math.floor(1.3 * sr); for (let i = 0; i < 400; i++) x[o + i] += (Math.random() * 2 - 1) * 0.25 * (1 - i / 400);
    as = listen(x); const hitA = near(as, 1.3); check(!hitA || !L.attackHas(hitA, 57), 'un golpe sobre la guitarra no cuenta como la nota que estaba sonando'); }
  // ligado: nunca se dispara con una nota que solo sigue sonando; sí cuando la nota aparece sin golpe
  { let fired = 0; listen(mix(4, [[57, 0.4, 0.5]]), (H, f, t) => { if (t > 0.9 && L.softOnset(H.ear, 57, f.stable)) fired++; });
    check(fired === 0, `nota que sigue sonando: el detector de ligados no se dispara (${fired})`);
    const x = mix(3, [[57, 0.4, 0.4, 0.9]]); const k = D.ksRender(D.midiToFreq(59), sr, 2), o = Math.floor(1.3 * sr); for (let i = 0; i < k.length && o + i < x.length; i++) x[o + i] += k[i] * 0.3 * Math.min(1, i / (0.03 * sr));
    let got = 0; listen(x, (H, f, t) => { if (t > 1.3 && t < 1.6 && L.softOnset(H.ear, 59, f.stable)) got++; });
    check(got > 0, 'nota ligada (entra sin golpe): se reconoce'); }
  // clic del metrónomo por el altavoz: con su banda fuera, no es un ataque
  { const x = mix(3, []); for (const t of [0.8, 1.6, 2.4]) { const o = Math.floor(t * sr); for (let i = 0; i < 0.06 * sr; i++) { const tt = i / sr, env = tt < 0.004 ? tt / 0.004 : Math.exp(-(tt - 0.004) / 0.008); x[o + i] += 0.2 * env * Math.sin(2 * Math.PI * 2100 * tt); } }
    const H = new L.Hearing(sr, { gate: 0.004 }); let n = 0;
    for (let p = 0; p < x.length; p += 800) { H.ear.notchUntil = H.ear.n + sr; H.feed(x.subarray(p, p + 800)); n += H.frame(0.004, false).onset ? 1 : 0; }
    check(n === 0, `el clic del metrónomo no cuenta como ataque (${n})`); }
  // acorde: la ventana empieza en el ataque, así que no oye el acorde anterior
  { const N = (id) => D.chordNotes(CHORDS[id]), lib = Object.keys(CHORDS).map((id) => [id, N(id)]);
    const strum = (id, t) => N(id).sort((a, b) => b.string - a.string).map((n, i) => [n.midi, t + i * 0.012, 0.3, 1.2]);
    const x = mix(3, [...strum('Am', 0.4), ...strum('C', 1.2)]);
    let ok = null; listen(x, (H, f, t) => { const a = f.attacks.find((q) => Math.abs(q.pos / sr - 1.2) < 0.03); if (a && ok == null && t > 1.2 + 0.2) ok = D.strumOk(H.ear.semisFrom(a.pos), D.chordHypotheses({ notes: N('C') }, lib), D.fewHypotheses(N('C')), N('C')); });
    check(ok === true, 'cambio de Lam a Do: el Do se reconoce aunque el Lam siga sonando'); }
  console.log('Oído: ataques por espectro, nota que sigue sonando, ligados, clic y cambio de acorde');
}

console.log(fails ? `\n${fails} fallos` : '\nTodo OK');
process.exit(fails ? 1 : 0);
