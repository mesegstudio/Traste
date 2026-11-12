/* ============================================================
   Oído — flujo continuo de audio con reloj de muestras (funciones puras, se prueban en Node)

   La app recibe el micrófono en bloques con su número de muestra exacto. Aquí se detectan los ataques
   por cambio del espectro (flujo espectral con filtro de máximo, Böck & Widmer 2013), que ve una cuerda
   que se vuelve a pulsar aunque el volumen no baje y una nota suave debajo de otra que suena fuerte.
   Cada ataque queda fechado por su muestra, no por el fotograma de pantalla en que se mira.
   ============================================================ */
function makeFFT(N) {
  const rev = new Uint32Array(N), cs = new Float64Array(N >> 1), sn = new Float64Array(N >> 1);
  for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; rev[i] = j; }
  for (let k = 0; k < N >> 1; k++) { cs[k] = Math.cos(-2 * Math.PI * k / N); sn[k] = Math.sin(-2 * Math.PI * k / N); }
  const re = new Float64Array(N), im = new Float64Array(N);
  // magnitudes de N muestras ya enventanadas; gain las deja en unidades de amplitud
  return function mags(x, out, gain) {
    for (let i = 0; i < N; i++) { re[rev[i]] = x[i]; im[i] = 0; }
    for (let len = 2; len <= N; len <<= 1) {
      const h = len >> 1, step = N / len;
      for (let i = 0; i < N; i += len) for (let k = 0, t = 0; k < h; k++, t += step) {
        const p = i + k + h, q = i + k, xr = re[p] * cs[t] - im[p] * sn[t], xi = re[p] * sn[t] + im[p] * cs[t];
        re[p] = re[q] - xr; im[p] = im[q] - xi; re[q] += xr; im[q] += xi;
      }
    }
    for (let i = 0; i < N >> 1; i++) out[i] = Math.hypot(re[i], im[i]) * gain;
    return out;
  };
}
const hannWin = (N) => { const w = new Float32Array(N); for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); return w; };

const EAR = {
  mu: 3,          // se compara con el espectro de hace 3 saltos (~16 ms)
  gamma: 0.5,     // compresión: lo que queda por debajo de la mitad del umbral de ruido apenas cuenta
  delta: 7,       // subida mínima del flujo sobre su media reciente
  lambda: 1.6,    // y proporción mínima sobre esa media
  minGap: 0.07,   // dos ataques no pueden estar a menos de 70 ms
  bias: -0.006,   // ajuste para que la fecha del ataque coincida con la anotada en GuitarSet
};

class Ear {
  constructor(sr, opts = {}) {
    this.sr = sr; this.q = sr > 50000 ? 2 : 1;
    this.R = 1 << 17; this.M = this.R - 1; this.ring = new Float32Array(this.R); this.n = 0;
    this.N1 = 2048 * this.q; this.H = this.N1 >> 3; this.nextHop = this.N1;
    this.w1 = hannWin(this.N1); this.t1 = new Float32Array(this.N1); this.m1 = new Float32Array(this.N1 >> 1);
    this.fft1 = makeFFT(this.N1);
    const hz = sr / this.N1;
    this.kLo = Math.ceil(70 / hz); this.kHi = Math.floor(7000 / hz);
    // con el metrónomo sonando por el altavoz se deja fuera la banda del clic (2,1 y 2,6 kHz) y lo que hay por encima
    this.kN0 = Math.floor(1850 / hz); this.notchUntil = 0;
    this.L = []; this.pool = [];
    this.F = new Float32Array(64); this.E = new Float64Array(64); this.fi = 0; // flujo y muestra final de cada salto
    this.gate = opts.gate ?? 0.006; this.lastOn = -1e9; this.onsets = []; this.seq = 0;
    this.ffts = {}; this.tmp = {};
  }
  push(b) {
    let i = 0;
    while (i < b.length) {
      const take = Math.min(b.length - i, this.nextHop - this.n);
      for (let k = 0; k < take; k++) this.ring[(this.n + k) & this.M] = b[i + k];
      this.n += take; i += take;
      if (this.n === this.nextHop) { this.hop(); this.nextHop += this.H; }
    }
  }
  // copia las N muestras que terminan en end (ceros donde no hay datos)
  read(end, N, dst) {
    const s = end - N, lo = Math.max(0, this.n - this.R);
    for (let i = 0; i < N; i++) { const p = s + i; dst[i] = p < lo || p >= this.n ? 0 : this.ring[p & this.M]; }
    return dst;
  }
  level(end = this.n, N = 1024 * this.q) {
    let s = 0; const a = Math.max(0, end - N);
    for (let p = a; p < end; p++) { const v = this.ring[p & this.M]; s += v * v; }
    return Math.sqrt(s / Math.max(1, end - a));
  }
  hop() {
    const N = this.N1, x = this.read(this.n, N, this.t1), w = this.w1;
    for (let i = 0; i < N; i++) x[i] *= w[i];
    this.fft1(x, this.m1, 4 / N);
    const lo = this.kLo, nb = this.kHi - lo + 1, g = 1 / (this.gate * EAR.gamma);
    const L = this.pool.pop() || new Float32Array(nb);
    for (let j = 0; j < nb; j++) L[j] = Math.log1p(this.m1[lo + j] * g);
    let flux = 0;
    if (this.L.length === EAR.mu) {
      const ref = this.L[0], top = this.n < this.notchUntil ? this.kN0 - lo : nb;
      for (let j = 0; j < top; j++) {
        let r = ref[j]; if (j && ref[j - 1] > r) r = ref[j - 1]; if (j + 1 < nb && ref[j + 1] > r) r = ref[j + 1];
        const d = L[j] - r; if (d > 0) flux += d;
      }
      this.pool.push(this.L.shift());
    }
    this.L.push(L);
    const i = this.fi++; this.F[i & 63] = flux; this.E[i & 63] = this.n;
    // máximo local con 2 saltos de espera (≈10 ms), por encima de la media de los 100 ms anteriores
    const c = i - 2; if (c < 24) return;
    const fc = this.F[c & 63];
    for (let k = c - 6; k <= i; k++) if (k !== c && this.F[k & 63] > fc) return;
    let mean = 0; for (let k = c - 22; k < c - 2; k++) mean += this.F[k & 63]; mean /= 20;
    const end = this.E[c & 63];
    if (fc < mean * EAR.lambda + EAR.delta || end - this.lastOn < EAR.minGap * this.sr) return;
    if (this.level() < this.gate * 1.4) return;
    this.lastOn = end;
    const pos = Math.round(end - N / 2 - EAR.bias * this.sr);
    this.onsets.push({ id: ++this.seq, pos, strength: fc - mean });
    if (this.onsets.length > 32) this.onsets.shift();
  }
  fft(N) { return this.ffts[N] || (this.ffts[N] = { run: makeFFT(N), win: hannWin(N), x: new Float32Array(N), m: new Float32Array(N >> 1) }); }
  // energía por semitono de las N muestras que empiezan en start (ventana de Hann); null si aún no han llegado
  semis(start, N = 4096 * this.q) {
    if (start + N > this.n) return null;
    const f = this.fft(N), x = this.read(start + N, N, f.x);
    for (let i = 0; i < N; i++) x[i] *= f.win[i];
    f.run(x, f.m, 4 / N);
    return semitoneEnergies(f.m, this.sr, N, V_LO, V_HI);
  }
  // lo que suena desde start hasta ahora: ventana de Blackman sobre ese tramo, con relleno de ceros hasta NF.
  // En los acordes deja fuera lo que sonaba antes del ataque (el acorde anterior).
  semisFrom(start, end = this.n, NF = 16384 * this.q) {
    const f = this.fft(NF), len = Math.max(16, Math.min(NF, end - start)), x = f.x;
    this.read(start + len, len, x);
    let sw = 0;
    for (let i = 0; i < len; i++) { const w = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / len) + 0.08 * Math.cos(4 * Math.PI * i / len); x[i] *= w; sw += w; }
    for (let i = len; i < NF; i++) x[i] = 0;
    f.run(x, f.m, 2 / sw);
    return semitoneEnergies(f.m, this.sr, NF, V_LO, V_HI);
  }
  // espectro de magnitudes (amplitud) de N muestras desde start, para medir la calidad de una nota
  spectrum(start, N) {
    if (start + N > this.n) return null;
    const f = this.fft(N), x = this.read(start + N, N, f.x);
    for (let i = 0; i < N; i++) x[i] *= f.win[i];
    return f.run(x, f.m, 4 / N);
  }
}

/* ---------- ¿Se ha pulsado esta nota en el ataque? ----------
   Se compara lo que sonaba justo antes con lo que suena justo después, armónico a armónico.
   Una nota que solo sigue sonando no sube; una que se acaba de pulsar, sí. */
const RISE_HARM = [[0, 1], [12, 1], [19, 0.8], [24, 0.7], [28, 0.5], [31, 0.5]];
function noteEnergy(semis, midi) {
  let e = 0;
  for (const [off, w] of RISE_HARM) { const k = midi + off - V_LO; if (k >= 0 && k < semis.length) e += w * semis[k] * semis[k]; }
  return e;
}
// subida en dB de los armónicos de la nota entre antes y después del ataque
function noteRise(before, after, midi) {
  const a = noteEnergy(after, midi), b = noteEnergy(before, midi);
  return 10 * Math.log10((a + 1e-12) / (b + 1e-12));
}
// parte de todo lo que aparece en el ataque que se explica con los armónicos de la nota
function noteShare(rise, midi) {
  let tot = 0; for (const v of rise) tot += v * v;
  if (!tot) return 0;
  let e = 0; for (const [off] of RISE_HARM) { const k = midi + off - V_LO; if (k >= 0 && k < rise.length) e += rise[k] * rise[k]; }
  return e / tot;
}

/* ---------- Escucha por fotograma ----------
   Junta el oído con el detector de tono. Cada ataque es un objeto que se va completando: la nota que
   "aparece" (~100 ms después), la primera lectura estable de YIN y el espectro de antes y de después. */
const HEAR = { guard: 0.004, skip: 0.012, riseDb: 1.5, riseAlone: 6, shareAlone: 0.5, settle: 0.26, softDb: 6, softSpan: 0.12 };
class Hearing {
  constructor(sr, opts = {}) {
    this.sr = sr; this.ear = new Ear(sr, opts); this.dec = Math.max(1, Math.round(sr / 24000));
    this.td = new Float32Array(4096 * this.ear.q);
    this.attacks = []; this.seen = 0; this.prevRound = null; this.stableCount = 0;
  }
  feed(b) { this.ear.push(b); }
  reset() { this.attacks = []; this.seen = this.ear.seq; this.prevRound = null; this.stableCount = 0; }
  frame(gate, ignoring) {
    const ear = this.ear, sr = this.sr, n = ear.n;
    ear.gate = gate;
    const level = ear.level();
    let pitch = null;
    if (!ignoring && level > gate && n >= this.td.length) {
      const { buf, f } = decimate(ear.read(n, this.td.length, this.td), this.dec);
      const r = yin(buf, sr / f);
      if (r && r.prob >= 0.9 && r.freq > 70 && r.freq < 1400) pitch = r;
    }
    const midi = pitch ? freqToMidi(pitch.freq) : null, rd = midi == null ? null : Math.round(midi);
    if (rd != null && rd === this.prevRound && Math.abs(midi - rd) < 0.4) this.stableCount++; else this.stableCount = rd == null ? 0 : 1;
    this.prevRound = rd;
    const stable = this.stableCount >= 2 ? rd : null;
    let onset = false;
    for (const o of ear.onsets) {
      if (o.id <= this.seen) continue;
      this.seen = o.id;
      if (ignoring) continue;
      onset = true;
      this.attacks.push({ id: o.id, pos: o.pos, strength: o.strength, yin: null, flux: null, fluxVec: null, before: null, after: null, used: false, settled: false });
    }
    while (this.attacks.length && n - this.attacks[0].pos > 0.8 * sr) this.attacks.shift();
    const N = 4096 * ear.q, guard = Math.round(HEAR.guard * sr), skip = Math.round(HEAR.skip * sr);
    for (const a of this.attacks) {
      const age = (n - a.pos) / sr;
      if (!ignoring && stable != null && a.yin == null && age >= 0.03 && age <= 0.25) a.yin = stable;
      if (!a.after && n >= a.pos + skip + N) {
        a.before = ear.semis(a.pos - guard - N, N); a.after = ear.semis(a.pos + skip, N);
        a.fluxVec = a.after.map((v, i) => Math.max(0, v - a.before[i] * 1.1));
        a.flux = newNote(a.fluxVec);
      }
      a.settled = age > HEAR.settle;
    }
    const last = this.attacks[this.attacks.length - 1] || null;
    return { level, pitch, midi, stable, onset, ignoring, attack: last, attacks: this.attacks };
  }
}
const sameNote = (m, want) => m === want || Math.abs(m - want) === 12;
const attackNotes = (a) => [a.yin, a.flux].filter((x) => x != null);
/* ¿Se ha pulsado la nota midi en este ataque? Vale si es la nota que aparece, o si es la que domina
   y además sus armónicos han subido en el ataque. Que domine sin haber subido es que venía sonando. */
function attackHas(a, midi) {
  if (a.flux != null && sameNote(a.flux, midi)) return true;
  if (!a.after) return false;
  const rise = noteRise(a.before, a.after, midi);
  if (a.yin != null && sameNote(a.yin, midi) && rise >= HEAR.riseDb) return true;
  return rise >= HEAR.riseAlone && noteShare(a.fluxVec, midi) >= HEAR.shareAlone;
}
/* Nota ligada (martillo, tirón o arrastre): no hay golpe de púa, pero la nota no sonaba y ahora sí.
   Vale si es la nota estable y sus armónicos han subido respecto a lo que había hace un momento.
   Una nota que simplemente sigue sonando no sube, así que nunca pasa por aquí. */
function softOnset(ear, midi, stable) {
  if (stable == null || !sameNote(stable, midi)) return false;
  const N = 4096 * ear.q, span = Math.round(HEAR.softSpan * ear.sr);
  if (ear.n < 2 * N + span) return false;
  const after = ear.semis(ear.n - N, N), before = ear.semis(ear.n - N - span, N);
  return noteRise(before, after, midi) >= HEAR.softDb;
}
// todavía puede decidirse (falta el espectro de después o la lectura estable)
const attackOpen = (a) => !a.settled && (a.flux == null || a.yin == null);

/* ---------- Calidad de la pisada ----------
   Se mide en dos tramos tras el ataque (a 30 ms y a 190 ms), sobre los armónicos de la nota:
   - decay: cuántos dB caen en 160 ms. Una cuerda bien pisada cae poco; una apagada (dedo flojo o
     que la roza) se muere enseguida.
   - hf y inh: parte de la energía que queda en agudos y entre armónicos. Cuando la cuerda trastea
     (roza con un traste) aparece un zumbido agudo que una nota limpia no tiene pasado el ataque.
   Devuelve null si aún no han llegado las muestras. */
function noteQuality(ear, pos, midi) {
  const sr = ear.sr, N = 4096 * ear.q, s1 = pos + Math.round(0.03 * sr), s2 = pos + Math.round(0.19 * sr);
  if (ear.n < s2 + N) return null;
  const f0 = midiToFreq(midi), hz = sr / N, kMax = Math.floor(Math.min(9000, sr / 2 - 200) / hz);
  const measure = (start) => {
    const m = ear.spectrum(start, N);
    let tot = 0, hf = 0; const cut = Math.max(2500, 8 * f0);
    for (let k = Math.ceil(70 / hz); k <= kMax; k++) { const e = m[k] * m[k]; tot += e; if (k * hz > cut) hf += e; }
    let har = 0;
    for (let h = 1; h * f0 < kMax * hz; h++) {
      const c = h * f0 / hz, w = Math.max(2, Math.round(c * 0.02));
      for (let k = Math.max(1, Math.round(c) - w); k <= Math.min(kMax, Math.round(c) + w); k++) har += m[k] * m[k];
    }
    return { tot, hf, har: Math.min(har, tot) };
  };
  const a = measure(s1), b = measure(s2);
  return {
    decay: 10 * Math.log10((a.har + 1e-14) / (b.har + 1e-14)),
    hf: a.tot ? a.hf / a.tot : 0, hf2: b.tot ? b.hf / b.tot : 0,
    inh: a.tot ? 1 - a.har / a.tot : 0, inh2: b.tot ? 1 - b.har / b.tot : 0,
    level: Math.sqrt(a.har), level2: Math.sqrt(b.har),
  };
}

// Veredicto. El umbral de "apagada" está puesto con notas reales bien tocadas (GuitarSet): menos de un 1 %
// de ellas lo supera, y no depende del micrófono porque compara la misma nota en dos momentos.
// El trasteo todavía no se juzga: la parte de agudos (hf2) cambia mucho de un micrófono a otro y hacen
// falta grabaciones reales de trasteo para poner el umbral. Se mide y se enseña en «Probar la escucha».
const QUAL = { dead: 17, buzz: Infinity };
const pisada = (q) => (!q ? null : q.decay >= QUAL.dead ? 'dead' : q.hf2 >= QUAL.buzz && q.hf >= QUAL.buzz ? 'buzz' : 'ok');

if (typeof module !== 'undefined') {
  // en Node las funciones de dsp.js se cargan aparte
  const D = require('./dsp.js');
  for (const k of ['semitoneEnergies', 'V_LO', 'V_HI', 'decimate', 'yin', 'freqToMidi', 'midiToFreq', 'newNote']) globalThis[k] = D[k];
  module.exports = { makeFFT, hannWin, Ear, EAR, HEAR, Hearing, noteEnergy, noteRise, noteShare, RISE_HARM, sameNote, attackNotes, attackHas, attackOpen, softOnset, noteQuality, QUAL, pisada };
}
