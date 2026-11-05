'use strict';
/* ============================================================
   Traste — aplicación (afinador, acordes, canciones, calibración)
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (v, d = 1) => v.toFixed(d).replace('.', ',');
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

const store = {
  get(k, d) { try { const v = localStorage.getItem('traste:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('traste:' + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};

const state = {
  view: 'afinador',
  notation: store.get('notation', 'latin'),
  cal: store.get('cal', null),
  learned: store.get('learned', {}),
  best: store.get('best', {}),
  imported: store.get('imported', []),
};

function hydrateIcons(root = document) {
  $$('[data-icon]', root).forEach((el) => { el.outerHTML = icon(el.dataset.icon, el.getAttribute('class') || '').replace('<svg', el.id ? `<svg id="${el.id}"` : '<svg'); });
}
let toastTimer;
function toast(msg, ms = 6000, ico = 'error-warning-line') {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.innerHTML = icon(ico) + `<span>${msg}</span>`; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

/* ---------- Nombres de notas y acordes ---------- */
const SUFFIX_NAME = { '': 'mayor', m: 'menor', 7: 'séptima', maj7: 'mayor séptima', m7: 'menor séptima', sus2: 'sus2', sus4: 'sus4', add9: 'add9' };
const pcName = (pc, n = state.notation) => (n === 'latin' ? LATIN : LETTERS)[((pc % 12) + 12) % 12];
const octave = (m) => Math.floor(m / 12) - 1;
function chordParts(id) {
  const sym = CHORDS[id]?.sym || id;
  const m = /^([A-G])([#b]?)(.*)$/.exec(sym);
  const pc = (LETTER_TO_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  return { pc, letter: m[1] + m[2], suffix: m[3] };
}
function chordLabel(id, n = state.notation) { const p = chordParts(id); return n === 'latin' ? LATIN[p.pc] + (p.suffix.length > 2 ? ' ' : '') + p.suffix : p.letter + p.suffix; }
function chordLongName(id) { const p = chordParts(id); return `${LATIN[p.pc]} ${SUFFIX_NAME[p.suffix] ?? p.suffix}`; }
const FINGERS = [null, { n: 'Índice', v: '--f1' }, { n: 'Medio', v: '--f2' }, { n: 'Anular', v: '--f3' }, { n: 'Meñique', v: '--f4' }];
const fingerVar = (f) => (f ? `var(${FINGERS[f].v})` : 'var(--open)');
const stringName = (s) => pcName(stringMidi(s)) + (s === 6 ? ' grave' : s === 1 ? ' agudo' : '');
let PAL = {};
function readPalette() {
  for (const k of ['bg', 'bg-2', 'surface', 'surface-2', 'surface-3', 'line', 'line-2', 'text', 'muted', 'faint', 'accent', 'ok', 'bad', 'f1', 'f2', 'f3', 'f4', 'open']) PAL[k] = cssVar('--' + k);
}
const fingerHex = (f) => (f ? PAL['f' + f] : PAL.open);

/* ============================================================
   Audio: salida (síntesis de guitarra) y micrófono
   ============================================================ */
const AudioEngine = {
  ctx: null, out: null, cache: new Map(),
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const comp = this.ctx.createDynamicsCompressor();
      this.out = this.ctx.createGain(); this.out.gain.value = 0.9;
      this.out.connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  buffer(freq) {
    const key = freq.toFixed(2);
    if (!this.cache.has(key)) {
      const ctx = this.ensure(), data = ksRender(freq, ctx.sampleRate, 2.4);
      const b = ctx.createBuffer(1, data.length, ctx.sampleRate); b.getChannelData(0).set(data);
      this.cache.set(key, b);
    }
    return this.cache.get(key);
  },
  pluck(freq, when = 0, gain = 0.5) {
    const ctx = this.ensure(), src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = this.buffer(freq); g.gain.value = gain;
    src.connect(g).connect(this.out); src.start(ctx.currentTime + when);
    Mic.ignoreFor((when + 2.5) * 1000); // que el afinador no se escuche a sí mismo
  },
  strum(notes, dir = 'D', when = 0) {
    const order = [...notes].sort((a, b) => (dir === 'D' ? b.string - a.string : a.string - b.string));
    order.forEach((n, i) => this.pluck(midiToFreq(n.midi), when + i * (dir === 'D' ? 0.016 : 0.012), dir === 'D' ? 0.3 : 0.22));
  },
  click(accent) {
    const ctx = this.ensure(), o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.frequency.value = accent ? 2600 : 2100; // por encima del registro de la guitarra
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(accent ? 0.35 : 0.2, t + 0.002); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.06);
    Mic.clickUntil = performance.now() + 90;
  },
  tone(freq, dur) {
    const ctx = this.ensure(), o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = 'triangle'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.02); g.gain.setValueAtTime(0.5, t + dur - 0.05); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.02);
  },
};

const Mic = {
  on: false, stream: null, analyser: null, td: null, fd: null, mags: null, sr: 48000, dec: 2,
  ignoreUntil: 0, clickUntil: 0, hist: [], lastOnset: 0, prevRound: null, stableCount: 0, frame: null,
  ignoreFor(ms) { this.ignoreUntil = Math.max(this.ignoreUntil, performance.now() + ms); },
  async start() {
    if (this.on) return;
    if (!navigator.mediaDevices?.getUserMedia) { const e = new Error('Este navegador no permite usar el micrófono aquí.'); e.name = 'Unsupported'; throw e; }
    const ctx = AudioEngine.ensure();
    // Sin cancelación de eco, supresión de ruido ni control de ganancia: alteran las notas sostenidas
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const src = ctx.createMediaStreamSource(this.stream);
    const an = ctx.createAnalyser(); an.fftSize = 16384; an.smoothingTimeConstant = 0;
    const mute = ctx.createGain(); mute.gain.value = 0;
    src.connect(an); an.connect(mute).connect(ctx.destination);
    this.analyser = an; this.sr = ctx.sampleRate; this.dec = Math.max(1, Math.round(this.sr / 24000));
    this.td = new Float32Array(an.fftSize); this.fd = new Float32Array(an.frequencyBinCount); this.mags = new Float32Array(an.frequencyBinCount);
    this.stream.getAudioTracks()[0].addEventListener('ended', () => this.stop());
    this.on = true; renderMic();
    if (!state.cal) toast('Consejo: pulsa <b>Calibrar</b> para ajustar el micrófono a tu sala y a tu guitarra.', 7000, 'information-line');
  },
  stop() { this.stream?.getTracks().forEach((t) => t.stop()); this.on = false; this.frame = null; renderMic(); },
  gate() { return state.cal?.gate ?? 0.006; },
  analyze(now) {
    const an = this.analyser; an.getFloatTimeDomainData(this.td);
    const N = this.td.length, level = rms(this.td.subarray(N - 1024));
    const ignoring = now < this.ignoreUntil;
    let pitch = null;
    if (!ignoring && level > this.gate()) {
      const { buf, f } = decimate(this.td.subarray(N - 4096), this.dec);
      const r = yin(buf, this.sr / f);
      if (r && r.prob >= 0.9 && r.freq > 70 && r.freq < 1400) pitch = r;
    }
    const prevMin = this.hist.length ? Math.min(...this.hist) : level;
    this.hist.push(level); if (this.hist.length > 7) this.hist.shift();
    let onset = false;
    if (!ignoring && now > this.clickUntil && level > this.gate() * 1.4 && level > prevMin * 1.5 && now - this.lastOnset > 110) { onset = true; this.lastOnset = now; }
    const midi = pitch ? freqToMidi(pitch.freq) : null;
    const rd = midi == null ? null : Math.round(midi);
    if (rd != null && rd === this.prevRound && Math.abs(midi - rd) < 0.4) this.stableCount++; else this.stableCount = rd == null ? 0 : 1;
    this.prevRound = rd;
    this.frame = { now, level, pitch, midi, onset, ignoring, stable: this.stableCount >= 2 ? rd : null };
    return this.frame;
  },
  semis() {
    this.analyser.getFloatFrequencyData(this.fd);
    for (let i = 0; i < this.fd.length; i++) this.mags[i] = Math.pow(10, this.fd[i] / 20);
    return semitoneEnergies(this.mags, this.sr, this.analyser.fftSize, V_LO, V_HI);
  },
};

async function ensureMic() {
  if (Mic.on) return true;
  try { await Mic.start(); return true; } catch (e) {
    let msg;
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') msg = 'No tengo permiso para usar el micrófono. Permítelo desde el icono del candado de la barra de direcciones y vuelve a intentarlo.';
    else if (e.name === 'NotFoundError') msg = 'No encuentro ningún micrófono conectado.';
    else msg = 'No he podido abrir el micrófono. ' + (e.message || '');
    if (window.self !== window.top) msg += ' Si ves Traste dentro de otra página, descarga el archivo y ábrelo directamente en Chrome, Edge o Firefox.';
    toast(msg, 10000); return false;
  }
}

function renderMic() {
  const b = $('#micBtn'); b.dataset.on = String(Mic.on);
  b.title = Mic.on ? 'Micrófono activo · pulsa para apagarlo' : 'Activar el micrófono';
  $('#micIcon').outerHTML = icon(Mic.on ? 'mic-line' : 'mic-off-line', '').replace('<svg', '<svg id="micIcon"');
  $('#tunerCta').hidden = Mic.on;
}
function renderMeter(level) {
  const db = 20 * Math.log10(level + 1e-9), lit = clamp(Math.round((db + 62) / 10), 0, 5);
  $$('#micMeter i').forEach((el, i) => { el.classList.toggle('lit', i < lit); el.classList.toggle('hot', i < lit && i >= 4); });
}

// hipótesis de acorde precalculadas para evaluar rasgueos
const CHORD_LIB = Object.keys(CHORDS).map((id) => [id, chordNotes(CHORDS[id])]);
const hypCache = new Map();
function hypothesesFor(notes, chordId, dir = 'D') {
  const key = notes.map((n) => n.string + ':' + n.midi).join(',') + dir;
  if (!hypCache.has(key)) hypCache.set(key, chordHypotheses({ notes, dir }, CHORD_LIB.filter(([id]) => id !== chordId)));
  return hypCache.get(key);
}
function diagnose(best, notes) {
  if (!best || best.kind === 'ok') return { title: 'No lo reconozco del todo', text: 'Rasguea con firmeza todas las cuerdas marcadas con ●.' };
  if (best.kind === 'missing') {
    const n = notes.find((x) => x.string === best.string);
    return { string: best.string, title: `No se oye la ${best.string}ª cuerda (${pcName(best.midi)})`,
      text: n && n.fret > 0 ? `Pisa con la punta del dedo ${n.finger} justo detrás del traste ${n.fret}.` : 'Arquea los dedos para que ninguno la toque y la apague.' };
  }
  if (best.kind === 'extra') return { string: best.string, extra: true, title: `Suena la ${best.string}ª cuerda y no se toca`, text: 'Empieza el rasgueo en la primera cuerda marcada con ● o apágala rozándola con el pulgar.' };
  return { title: `Eso suena a ${chordLabel(best.id)}`, text: 'Revisa en qué traste y en qué cuerda va cada dedo.' };
}

/* ============================================================
   Dibujos SVG: diagrama de acorde, mano, mástil
   ============================================================ */
function chordDiagram(ch, res = {}) {
  const sx = 30, sy = 40, L = 34, T = 44;
  const fretted = ch.frets.filter((f) => f > 0);
  const maxF = Math.max(0, ...fretted), minF = Math.min(99, ...fretted);
  const base = maxF <= 4 ? 1 : minF, nF = Math.max(4, maxF - base + 1);
  const W = L + 5 * sx + 30, H = T + nF * sy + 34, xs = (i) => L + i * sx;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="font-family:var(--font);max-width:100%;height:auto" role="img" aria-label="Diagrama del acorde">`;
  s += `<rect x="${xs(0)}" y="${T}" width="${5 * sx}" height="${nF * sy}" rx="3" fill="var(--surface-2)"/>`;
  for (let k = 0; k <= nF; k++) {
    const y = T + k * sy;
    s += k === 0 && base === 1 ? `<rect x="${xs(0) - 2}" y="${y - 6}" width="${5 * sx + 4}" height="7" rx="2" fill="var(--text)"/>` : `<line x1="${xs(0)}" x2="${xs(5)}" y1="${y}" y2="${y}" stroke="var(--line-2)" stroke-width="2"/>`;
  }
  if (base > 1) s += `<text x="${xs(0) - 10}" y="${T + sy * 0.5 + 5}" text-anchor="end" font-size="13" font-weight="600" fill="var(--muted)">${base}ª</text>`;
  for (let i = 0; i < 6; i++) s += `<line x1="${xs(i)}" x2="${xs(i)}" y1="${T}" y2="${T + nF * sy}" stroke="var(--muted)" stroke-opacity=".75" stroke-width="${2.6 - i * 0.32}"/>`;
  for (let i = 0; i < 6; i++) {
    const f = ch.frets[i], st = res[6 - i], col = st === 'bad' ? 'var(--bad)' : st === 'ok' ? 'var(--ok)' : null;
    if (f < 0) s += `<g stroke="${col || 'var(--faint)'}" stroke-width="2.2" stroke-linecap="round"><line x1="${xs(i) - 6}" y1="${T - 24}" x2="${xs(i) + 6}" y2="${T - 12}"/><line x1="${xs(i) + 6}" y1="${T - 24}" x2="${xs(i) - 6}" y2="${T - 12}"/></g>`;
    if (f === 0) s += `<circle cx="${xs(i)}" cy="${T - 18}" r="7" fill="none" stroke="${col || 'var(--open)'}" stroke-width="2.2"/>`;
    if (f >= 0) s += `<text x="${xs(i)}" y="${H - 8}" text-anchor="middle" font-size="12" font-weight="600" fill="${col || 'var(--muted)'}">${pcName(OPEN_MIDI[i] + f)}</text>`;
  }
  const b = ch.barre;
  let bi1 = -1, bi2 = -1;
  if (b) {
    bi1 = 6 - b.from; bi2 = 6 - b.to; const y = T + (b.fret - base + 0.5) * sy;
    s += `<rect x="${xs(bi1) - 13}" y="${y - 13}" width="${xs(bi2) - xs(bi1) + 26}" height="26" rx="13" fill="${fingerVar(b.finger)}"/>`;
    s += `<text x="${xs(bi1)}" y="${y + 4.5}" text-anchor="middle" font-size="13" font-weight="700" fill="#10131a">${b.finger}</text>`;
  }
  for (let i = 0; i < 6; i++) {
    const f = ch.frets[i]; if (f <= 0) continue;
    if (b && f === b.fret && ch.fingers[i] === b.finger && i >= bi1 && i <= bi2) continue;
    const y = T + (f - base + 0.5) * sy, st = res[6 - i];
    s += `<circle cx="${xs(i)}" cy="${y}" r="13" fill="${fingerVar(ch.fingers[i])}" ${st === 'bad' ? 'stroke="var(--bad)" stroke-width="3"' : ''}/>`;
    s += `<text x="${xs(i)}" y="${y + 4.5}" text-anchor="middle" font-size="13" font-weight="700" fill="#10131a">${ch.fingers[i]}</text>`;
  }
  return s + '</svg>';
}

// Mano izquierda vista desde la palma: pulgar a la izquierda, dedos 1-4 de izquierda a derecha
function handSVG(active, w = 150) {
  const F = [null, { x: 62, top: 40, h: 74 }, { x: 91, top: 22, h: 92 }, { x: 120, top: 30, h: 84 }, { x: 148, top: 56, h: 60 }];
  let s = `<svg viewBox="0 0 190 200" width="${w}" style="font-family:var(--font);max-width:100%;height:auto" role="img" aria-label="Colores de los dedos">`;
  s += `<rect x="16" y="112" width="28" height="64" rx="14" transform="rotate(-34 44 168)" fill="var(--surface-2)" stroke="var(--line-2)" stroke-width="1.5"/>`;
  s += `<text x="26" y="128" text-anchor="middle" font-size="12" font-weight="700" fill="var(--faint)">P</text>`;
  for (let f = 1; f <= 4; f++) {
    const d = F[f], on = active.has(f);
    s += `<rect x="${d.x - 13}" y="${d.top}" width="26" height="${d.h + 50}" rx="13" fill="${on ? fingerVar(f) : 'var(--surface-2)'}" stroke="${fingerVar(f)}" stroke-opacity="${on ? 1 : 0.55}" stroke-width="1.5"/>`;
    s += `<text x="${d.x}" y="${d.top + 20}" text-anchor="middle" font-size="13" font-weight="700" fill="${on ? '#10131a' : fingerVar(f)}">${f}</text>`;
  }
  s += `<rect x="44" y="106" width="118" height="84" rx="34" fill="var(--surface-2)" stroke="var(--line-2)" stroke-width="1.5"/>`;
  s += `<rect x="46" y="104" width="114" height="20" fill="var(--surface-2)"/>`;
  return s + '</svg>';
}

// Mástil horizontal (cuerda 1 arriba, como en la tablatura) + columna de mano derecha
function fretboardSVG(e) {
  const shape = e ? (e.chord ? chordNotes(CHORDS[e.chord]) : e.notes) : [];
  const played = new Set(e ? e.notes.map((n) => n.string) : []);
  const isChord = !!(e && (e.chord || e.notes.length > 1));
  const maxF = Math.max(0, ...shape.map((n) => n.fret)), nF = Math.max(5, maxF);
  const rowH = 28, top = 40, labelW = 44, markW = 30, fw = 64, nutX = labelW + markW + 8;
  const boardR = nutX + nF * fw, rhX = boardR + 46, W = rhX + 40, H = top + 5 * rowH + 34, y = (s) => top + (s - 1) * rowH;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" style="font-family:var(--font)" role="img" aria-label="Dónde poner los dedos">`;
  s += `<text x="${nutX}" y="16" font-size="10.5" font-weight="600" letter-spacing=".08em" fill="var(--muted)">MANO IZQUIERDA</text>`;
  s += `<text x="${rhX}" y="16" text-anchor="middle" font-size="10.5" font-weight="600" letter-spacing=".08em" fill="var(--muted)">DERECHA</text>`;
  s += `<rect x="${nutX}" y="${y(1) - 13}" width="${nF * fw}" height="${5 * rowH + 26}" rx="6" fill="var(--surface-2)"/>`;
  for (const k of [3, 5, 7, 9]) if (k <= nF) s += `<circle cx="${nutX + (k - 0.5) * fw}" cy="${(y(3) + y(4)) / 2}" r="5" fill="var(--line-2)"/>`;
  if (nF >= 12) for (const yy of [(y(2) + y(3)) / 2, (y(4) + y(5)) / 2]) s += `<circle cx="${nutX + 11.5 * fw}" cy="${yy}" r="5" fill="var(--line-2)"/>`;
  for (let k = 1; k <= nF; k++) {
    s += `<line x1="${nutX + k * fw}" x2="${nutX + k * fw}" y1="${y(1) - 13}" y2="${y(6) + 13}" stroke="var(--line-2)" stroke-width="2"/>`;
    s += `<text x="${nutX + (k - 0.5) * fw}" y="${H - 4}" text-anchor="middle" font-size="11" fill="var(--faint)">${k}</text>`;
  }
  s += `<rect x="${nutX - 4}" y="${y(1) - 13}" width="6" height="${5 * rowH + 26}" rx="2" fill="var(--text)" fill-opacity=".85"/>`;
  for (let st = 1; st <= 6; st++) {
    s += `<line x1="${nutX}" x2="${boardR}" y1="${y(st)}" y2="${y(st)}" stroke="var(--muted)" stroke-opacity=".7" stroke-width="${1 + (st - 1) * 0.32}"/>`;
    s += `<text x="${labelW - 6}" y="${y(st) + 4}" text-anchor="end" font-size="12" font-weight="600" fill="var(--muted)">${pcName(stringMidi(st))}</text>`;
    const n = shape.find((x) => x.string === st), mx = labelW + markW / 2, on = played.has(st);
    if (n && n.fret === 0 && on) s += `<circle cx="${mx}" cy="${y(st)}" r="7.5" fill="none" stroke="var(--open)" stroke-width="2.2"/>`;
    else if (isChord && !n) s += `<g stroke="var(--faint)" stroke-width="2" stroke-linecap="round"><line x1="${mx - 5}" y1="${y(st) - 5}" x2="${mx + 5}" y2="${y(st) + 5}"/><line x1="${mx + 5}" y1="${y(st) - 5}" x2="${mx - 5}" y2="${y(st) + 5}"/></g>`;
    if (on) s += `<circle cx="${rhX}" cy="${y(st)}" r="8" fill="var(--accent)"/>`;
    else s += `<g stroke="var(--faint)" stroke-width="2" stroke-linecap="round" opacity=".7"><line x1="${rhX - 5}" y1="${y(st) - 5}" x2="${rhX + 5}" y2="${y(st) + 5}"/><line x1="${rhX + 5}" y1="${y(st) - 5}" x2="${rhX - 5}" y2="${y(st) + 5}"/></g>`;
  }
  const b = e?.chord && CHORDS[e.chord].barre;
  if (b) s += `<rect x="${nutX + (b.fret - 0.5) * fw - 12}" y="${y(b.to) - 12}" width="24" height="${y(b.from) - y(b.to) + 24}" rx="12" fill="${fingerVar(b.finger)}"/>`;
  for (const n of shape) {
    if (n.fret <= 0) continue;
    if (b && n.fret === b.fret && n.finger === b.finger && n.string !== b.to) continue;
    const cx = nutX + (n.fret - 0.5) * fw, dim = !played.has(n.string);
    s += `<circle cx="${cx}" cy="${y(n.string)}" r="12" fill="${fingerVar(n.finger)}" fill-opacity="${dim ? 0.45 : 1}"/>`;
    s += `<text x="${cx}" y="${y(n.string) + 4.5}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#10131a">${n.finger}</text>`;
  }
  return s + '</svg>';
}

/* ============================================================
   Afinador
   ============================================================ */
const Tuner = {
  mode: 'auto', sel: 6, cur: null, done: new Set(), hold: 0, hist: [], shown: 0, target: 0, lastSeen: 0, live: false, last: {},
  init() {
    const ticks = $('#ticks');
    for (let c = -50; c <= 50; c += 5) {
      const d = document.createElement('div');
      d.className = 'tick' + (c === 0 ? ' zero' : c % 25 === 0 ? ' major' : '');
      d.style.left = (c + 50) + '%'; ticks.appendChild(d);
    }
    $('#tunerMode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.setMode(b.dataset.m); });
    $('#tnReset').addEventListener('click', () => { this.done.clear(); this.hold = 0; this.renderList(); });
    $('#stringList').addEventListener('click', (e) => {
      const play = e.target.closest('[data-play]');
      if (play) { e.stopPropagation(); AudioEngine.pluck(midiToFreq(stringMidi(+play.dataset.play)), 0, 0.7); return; }
      const row = e.target.closest('[data-s]'); if (row) { this.sel = +row.dataset.s; this.setMode('manual'); }
    });
    $('#stringList').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.s) { e.preventDefault(); e.target.click(); } });
    this.renderList();
  },
  setMode(m) {
    this.mode = m; this.hist = []; this.hold = 0;
    if (m === 'manual') this.cur = this.sel;
    $$('#tunerMode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
    this.renderList();
  },
  renderList() {
    $('#stringList').innerHTML = [6, 5, 4, 3, 2, 1].map((s) => `
      <div class="string-row ${this.done.has(s) ? 'done' : ''}" data-s="${s}" role="button" tabindex="0" aria-current="${this.cur === s}" aria-label="Cuerda ${s}, ${stringName(s)}">
        <span class="n">${this.done.has(s) ? icon('check-line') : s}</span>
        <span><span class="nm block">${stringName(s)}</span><span class="hz num block">${pcName(stringMidi(s), 'letter')}${octave(stringMidi(s))} · ${fmt(midiToFreq(stringMidi(s)), 2)} Hz</span></span>
        <span></span>
        <button type="button" class="btn btn-quiet btn-sm btn-icon" data-play="${s}" aria-label="Escuchar la nota de referencia">${icon('volume-up-line')}</button>
      </div>`).join('');
    $('#tnProgress').textContent = `${this.done.size} de 6`;
    $('#tnProgress').className = 'pill' + (this.done.size === 6 ? ' pill-ok' : '');
  },
  set(id, html) { if (this.last[id] !== html) { this.last[id] = html; $(id).innerHTML = html; } },
  frame(f, dt, now) {
    if (f && f.pitch && !f.ignoring) {
      const m = freqToMidi(f.pitch.freq);
      let s = this.sel;
      if (this.mode === 'auto') { let bd = 99; for (let k = 1; k <= 6; k++) { const d = Math.abs(m - stringMidi(k)); if (d < bd) { bd = d; s = k; } } }
      const cents = (m - stringMidi(s)) * 100;
      if (s !== this.cur) { this.cur = s; this.hist = []; this.hold = 0; this.renderList(); }
      this.hist.push(cents); if (this.hist.length > 5) this.hist.shift();
      const sorted = [...this.hist].sort((a, b) => a - b), c = sorted[sorted.length >> 1];
      this.target = clamp(c, -50, 50); this.cents = c; this.freq = f.pitch.freq; this.heard = Math.round(m);
      this.lastSeen = now; this.live = true;
      if (Math.abs(c) <= 5) {
        this.hold += dt;
        if (this.hold >= 1 && !this.done.has(s)) { this.done.add(s); this.renderList(); }
      } else this.hold = Math.max(0, this.hold - dt * 2);
    } else if (now - this.lastSeen > 600) { this.live = false; this.hist = []; this.hold = 0; this.target = 0; }
    this.shown += (this.target - this.shown) * Math.min(1, dt * 14);
    $('#needle').style.left = (50 + this.shown) + '%';
    const inTune = this.live && Math.abs(this.cents) <= 5;
    const g = $('#gauge'); g.classList.toggle('live', this.live); g.classList.toggle('in', inTune);
    $('#tnHold').style.width = (this.live ? clamp(this.hold, 0, 1) * 100 : 0) + '%';
    const s = this.cur;
    this.set('#tnNote', s ? `${pcName(stringMidi(s))}<sub>${s}ª</sub>` : '—');
    $('#tnNote').style.color = inTune ? 'var(--ok)' : '';
    if (this.live) {
      this.set('#tnFreq', `${fmt(this.freq)} Hz`);
      this.set('#tnSub', `Oigo ${pcName(this.heard)}${octave(this.heard)} · <span class="num">${this.cents > 0 ? '+' : ''}${Math.round(this.cents)} cents</span>`);
      const far = Math.abs(this.cents) > 50 ? ' bastante' : '';
      this.set('#tnHint', inTune ? `<span style="color:var(--ok)">${icon('checkbox-circle-fill')}</span><span style="color:var(--ok)">${this.done.has(s) ? 'Afinada' : 'Mantén… casi está'}</span>`
        : this.cents < 0 ? `${icon('arrow-up-line')}<span>Está grave: aprieta la clavija${far}</span>`
        : `${icon('arrow-down-line')}<span>Está aguda: afloja la clavija${far}</span>`);
    } else {
      this.set('#tnFreq', '— Hz');
      this.set('#tnSub', this.mode === 'manual' ? `Toca la ${this.sel}ª cuerda al aire` : 'Toca una cuerda al aire');
      this.set('#tnHint', this.done.size === 6 ? `<span style="color:var(--ok)">${icon('checkbox-circle-fill')}</span><span style="color:var(--ok)">¡Guitarra afinada! Ya puedes tocar.</span>` : '<span class="muted">Esperando sonido…</span>');
    }
  },
};

/* ============================================================
   Acordes
   ============================================================ */
const ChordView = {
  id: store.get('chord', 'A'), pattern: store.get('pattern', 'pop'), practicing: false, streak: 0, check: null, res: {},
  ch: { running: false, b: store.get('chB', 'D'), count: 0, end: 0, target: 'a' },
  init() {
    $('#chordList').addEventListener('click', (e) => { const b = e.target.closest('[data-chord]'); if (b) this.select(b.dataset.chord); });
    $('#chordMain').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const c = CHORDS[this.id];
      if (b.dataset.act === 'strum') AudioEngine.strum(chordNotes(c), 'D');
      if (b.dataset.act === 'arp') [...chordNotes(c)].sort((x, y) => y.string - x.string).forEach((n, i) => AudioEngine.pluck(midiToFreq(n.midi), i * 0.32, 0.45));
      if (b.dataset.act === 'rhythm') this.playRhythm();
      if (b.dataset.pat) { this.pattern = b.dataset.pat; store.set('pattern', this.pattern); this.render(); }
    });
    $('#practiceBtn').addEventListener('click', () => this.togglePractice());
    $('#chB').addEventListener('change', (e) => { this.ch.b = e.target.value; store.set('chB', this.ch.b); this.renderChanges(); });
    $('#chBtn').addEventListener('click', () => this.toggleChanges());
    this.renderList(); this.render();
  },
  select(id) {
    this.id = id; store.set('chord', id); this.streak = 0; this.res = {};
    if (this.ch.running) this.stopChanges();
    if (this.ch.b === id) this.ch.b = CHORD_GROUPS.flatMap((g) => g.ids).find((x) => x !== id);
    this.renderList(); this.render();
    this.setResult(this.practicing ? 'listen' : '', this.practicing ? `Rasguea ${chordLabel(id)}` : 'Pulsa Practicar y rasguea', 'Escucho cada rasgueo y compruebo cuerda a cuerda.');
  },
  renderList() {
    $('#chordList').innerHTML = CHORD_GROUPS.map((g) => `
      <div class="chord-group"><div class="label">${g.name}</div><div class="chord-grid">
      ${g.ids.map((id) => `<button type="button" class="chord-btn" data-chord="${id}" aria-current="${id === this.id}" title="${chordLongName(id)}${CHORDS[id].variant ? ' · ' + CHORDS[id].variant : ''}">${chordLabel(id)}${CHORDS[id].variant ? '<sup class="muted text-[10px] ml-0.5">fácil</sup>' : ''}${state.learned[id] ? '<span class="dot"></span>' : ''}</button>`).join('')}
      </div></div>`).join('');
  },
  render() {
    const id = this.id, c = CHORDS[id], notes = chordNotes(c);
    const used = new Set(c.fingers.filter(Boolean));
    const group = CHORD_GROUPS.find((g) => g.ids.includes(id))?.name || '';
    const fingerRows = [...used].sort().map((f) => {
      const where = c.barre && c.barre.finger === f
        ? `cejilla en el traste ${c.barre.fret} (cuerdas ${c.barre.from} a ${c.barre.to})`
        : notes.filter((n) => n.finger === f).map((n) => `${n.string}ª cuerda, traste ${n.fret}`).join(' y ');
      return `<li class="flex items-center gap-3"><span class="w-6 h-6 rounded-full grid place-items-center text-xs font-bold" style="background:${fingerVar(f)};color:#10131a">${f}</span><span><b class="font-semibold">${FINGERS[f].n}</b> <span class="muted">· ${where}</span></span></li>`;
    }).join('');
    const firstStr = Math.max(...notes.map((n) => n.string));
    const strip = [6, 5, 4, 3, 2, 1].map((s) => {
      const on = notes.some((n) => n.string === s);
      return `<div class="flex flex-col items-center gap-1.5"><span class="w-8 h-8 rounded-full grid place-items-center ${on ? '' : 'muted'}" style="${on ? 'background:var(--accent);color:var(--accent-ink)' : 'background:var(--bg-2);border:1px solid var(--line)'}">${on ? '<span class="w-2.5 h-2.5 rounded-full" style="background:var(--accent-ink)"></span>' : icon('close-line')}</span><span class="text-xs muted">${s}ª</span></div>`;
    }).join('');
    const pat = STRUM_LIBRARY.find((p) => p.id === this.pattern) || STRUM_LIBRARY[0];
    const counts = pat.bpb === 4 ? ['1', 'y', '2', 'y', '3', 'y', '4', 'y'] : ['1', 'y', '2', 'y', '3', 'y'];
    $('#chordMain').innerHTML = `
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="label mb-2">${group}</div>
          <div class="chord-title">${chordLabel(id)}<small>${chordLabel(id, state.notation === 'latin' ? 'letter' : 'latin')} · ${chordLongName(id)}${c.variant ? ' · ' + c.variant : ''}</small></div>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn btn-ghost" data-act="strum">${icon('volume-up-line')}Escuchar</button>
          <button type="button" class="btn btn-ghost" data-act="arp">${icon('music-2-line')}Nota a nota</button>
        </div>
      </div>
      <div class="grid gap-6 mt-6 md:grid-cols-[auto_minmax(0,1fr)] items-start">
        <div class="diagram-wrap" id="chordDiagram">${chordDiagram(c, this.res)}</div>
        <div class="flex flex-col gap-6 min-w-0">
          <div>
            <div class="label mb-3">Mano izquierda · qué dedo y dónde</div>
            <div class="flex items-center gap-5 flex-wrap">${handSVG(used, 116)}<ul class="flex flex-col gap-2 text-sm min-w-0 flex-1">${fingerRows || '<li class="muted">Sin dedos: todas las cuerdas al aire.</li>'}</ul></div>
          </div>
          <div>
            <div class="label mb-3">Mano derecha · ● tocar  ✕ no tocar</div>
            <div class="flex gap-2.5 flex-wrap">${strip}</div>
            <p class="text-sm muted mt-2">Rasguea desde la ${firstStr}ª cuerda${firstStr === 6 ? ' (todas)' : ''} hacia abajo.</p>
          </div>
          <div>
            <div class="flex items-center justify-between gap-3 flex-wrap mb-3">
              <span class="label">Ritmo de rasgueo</span>
              <div class="seg">${STRUM_LIBRARY.map((p) => `<button type="button" data-act="pat" data-pat="${p.id}" aria-pressed="${p.id === pat.id}">${p.name}</button>`).join('')}</div>
            </div>
            <div class="flex items-center gap-3">
              <div class="strum-cells flex-1" id="strumCells" style="grid-template-columns:repeat(${pat.steps.length},minmax(0,1fr))">
                ${pat.steps.map((st, i) => `<div class="cell ${st ? '' : 'rest'}">${icon(st === 'U' ? 'arrow-up-line' : 'arrow-down-line')}<span>${counts[i]}</span></div>`).join('')}
              </div>
              <button type="button" class="btn btn-ghost btn-icon" data-act="rhythm" aria-label="Escuchar el ritmo">${icon('play-fill')}</button>
            </div>
            <p class="text-xs muted mt-2">↓ hacia el suelo · ↑ hacia el techo. Mueve la mano siempre arriba y abajo, aunque no toques en los huecos.</p>
          </div>
        </div>
      </div>
      <div class="tip mt-6">${icon('lightbulb-line')}<span>${c.tip}</span></div>`;
    $('#chA').textContent = chordLabel(id);
    this.renderChanges();
  },
  renderDiagram() { const el = $('#chordDiagram'); if (el) el.innerHTML = chordDiagram(CHORDS[this.id], this.res); },
  playRhythm() {
    const pat = STRUM_LIBRARY.find((p) => p.id === this.pattern), notes = chordNotes(CHORDS[this.id]);
    const step = 60 / 84 / 2, cells = $$('#strumCells .cell');
    for (let k = 0; k < pat.steps.length * 2; k++) {
      const st = pat.steps[k % pat.steps.length];
      if (st) AudioEngine.strum(st === 'U' ? notes.filter((n) => n.string <= 4) : notes, st, k * step);
      setTimeout(() => { cells.forEach((c, i) => c.classList.toggle('now', i === k % pat.steps.length)); }, k * step * 1000);
    }
    setTimeout(() => cells.forEach((c) => c.classList.remove('now')), pat.steps.length * 2 * step * 1000 + 200);
  },
  setResult(kind, title, text) {
    const r = $('#practiceResult');
    r.className = 'result' + (kind ? ' ' + kind : '');
    const ico = kind === 'ok' ? 'check-line' : kind === 'bad' ? 'close-line' : 'mic-line';
    r.innerHTML = `<div class="ico">${icon(ico)}</div><div><strong>${title}</strong><p>${text}</p></div>`;
  },
  renderStreak() { $$('#streak i').forEach((el, i) => el.classList.toggle('on', i < this.streak)); },
  async togglePractice() {
    if (!this.practicing && !(await ensureMic())) return;
    this.practicing = !this.practicing; this.check = null;
    $('#practiceBtn').innerHTML = this.practicing ? `${icon('pause-fill')}Parar` : `${icon('mic-line')}Practicar`;
    if (this.practicing) this.setResult('listen', `Rasguea ${chordLabel(this.id)}`, 'Te escucho. Toca el acorde una vez y deja que suene.');
    else this.setResult('', 'Pulsa Practicar y rasguea', 'Escucho cada rasgueo y compruebo cuerda a cuerda.');
  },
  stop() { if (this.practicing) this.togglePractice(); if (this.ch.running) this.stopChanges(); },
  targetId() { return this.ch.running ? (this.ch.target === 'a' ? this.id : this.ch.b) : this.id; },
  frame(f, now) {
    if (this.ch.running) {
      const left = Math.max(0, this.ch.end - now);
      $('#chTime').textContent = `0:${String(Math.ceil(left / 1000)).padStart(2, '0')}`;
      if (left <= 0) this.stopChanges(true);
    }
    if (!f || !(this.practicing || this.ch.running)) return;
    if (f.onset) this.check = { t0: now, best: null, id: this.targetId() };
    const ck = this.check;
    if (!ck || now - ck.t0 < 120) return;
    const notes = chordNotes(CHORDS[ck.id]);
    const r = matchChord(Mic.semis(), hypothesesFor(notes, ck.id));
    if (!ck.best || r.score > ck.best.score) ck.best = r;
    if (r.ok) { this.check = null; this.onResult(true, ck.id, r, notes); }
    else if (now - ck.t0 > 560) { this.check = null; this.onResult(false, ck.id, ck.best, notes); }
  },
  onResult(ok, id, r, notes) {
    if (this.ch.running) {
      if (ok) {
        this.ch.count++; this.ch.target = this.ch.target === 'a' ? 'b' : 'a';
        $('#chCount').textContent = this.ch.count;
        $('#chNext').innerHTML = `Ahora: <b class="text-[var(--text)]">${chordLabel(this.targetId())}</b>`;
      }
      return;
    }
    if (ok) {
      this.streak = Math.min(3, this.streak + 1);
      this.res = Object.fromEntries(notes.map((n) => [n.string, 'ok']));
      if (this.streak >= 3 && !state.learned[id]) { state.learned[id] = true; store.set('learned', state.learned); this.renderList(); }
      this.setResult('ok', `¡Suena bien! ${chordLabel(id)}`, this.streak >= 3 ? 'Tres seguidos: acorde aprendido. Prueba los cambios en un minuto.' : `Llevas ${this.streak} de 3 seguidos. Quita la mano y vuelve a colocarla.`);
    } else {
      this.streak = 0;
      const d = diagnose(r?.best, notes);
      this.res = d.string ? { [d.string]: 'bad' } : {};
      this.setResult('bad', d.title, d.text);
    }
    this.renderStreak(); this.renderDiagram();
  },
  renderChanges() {
    const opts = CHORD_GROUPS.flatMap((g) => g.ids).filter((x) => x !== this.id);
    if (!opts.includes(this.ch.b)) this.ch.b = opts[0];
    $('#chB').innerHTML = opts.map((x) => `<option value="${x}" ${x === this.ch.b ? 'selected' : ''}>${chordLabel(x)}${CHORDS[x].variant ? ' (fácil)' : ''}</option>`).join('');
    const best = state.best[`1min:${this.id}-${this.ch.b}`];
    $('#chBest').textContent = `Récord ${best ?? '—'}`;
  },
  async toggleChanges() { if (this.ch.running) this.stopChanges(); else { if (!(await ensureMic())) return; this.startChanges(); } },
  startChanges() {
    if (this.practicing) this.togglePractice();
    Object.assign(this.ch, { running: true, count: 0, end: performance.now() + 60000, target: 'a' });
    $('#chCount').textContent = '0';
    $('#chNext').innerHTML = `Ahora: <b class="text-[var(--text)]">${chordLabel(this.id)}</b>`;
    $('#chBtn').innerHTML = `${icon('pause-fill')}Parar`; $('#chB').disabled = true;
  },
  stopChanges(finished = false) {
    this.ch.running = false; this.check = null;
    $('#chBtn').innerHTML = `${icon('timer-line')}Empezar`; $('#chB').disabled = false;
    $('#chTime').textContent = '1:00';
    if (finished) {
      const key = `1min:${this.id}-${this.ch.b}`, prev = state.best[key] ?? 0;
      $('#chNext').textContent = this.ch.count > prev ? '¡Nuevo récord!' : `Tu récord es ${prev}`;
      if (this.ch.count > prev) { state.best[key] = this.ch.count; store.set('best', state.best); }
      this.renderChanges();
    } else $('#chNext').textContent = 'Alterna entre los dos acordes';
  },
};

/* ============================================================
   Canciones: lista, reproductor y evaluación
   ============================================================ */
const LEVELS = { easy: 'Fácil', medium: 'Medio', hard: 'Difícil', full: 'Completo' };
const LEVEL_DEFAULTS = { easy: [70, true], medium: [85, true], hard: [100, false], full: [80, true] };
const allSongs = () => [...SONGS, ...state.imported];

const Songs = {
  init() {
    $('#songGrid').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) { e.stopPropagation(); state.imported = state.imported.filter((s) => s.id !== del.dataset.del); store.set('imported', state.imported); this.render(); return; }
      const card = e.target.closest('[data-song]'); if (card) Player.open(allSongs().find((s) => s.id === card.dataset.song));
    });
    $('#songGrid').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.song) { e.preventDefault(); e.target.click(); } });
    $('#tabImport').addEventListener('click', () => this.importTab());
    this.render();
  },
  render() {
    $('#songGrid').innerHTML = allSongs().map((s) => {
      const chords = s.imported ? [] : [...new Set(parseChordBars(s.chords, s.bpb, 0).map((c) => c.chord))];
      const lvls = s.imported ? ['full'] : ['easy', 'medium', 'hard'];
      return `<div class="card song-card" role="button" tabindex="0" data-song="${s.id}">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0"><h3 class="truncate">${s.title}</h3><div class="muted text-sm truncate">${s.origin}</div></div>
          ${s.imported ? `<button type="button" class="btn btn-quiet btn-sm btn-icon" data-del="${s.id}" aria-label="Borrar">${icon('delete-bin-line')}</button>`
            : `<span class="diff" title="Dificultad">${[1, 2, 3].map((k) => `<i class="${k <= s.stars ? 'on' : ''}"></i>`).join('')}</span>`}
        </div>
        <div class="flex flex-wrap gap-1.5">
          <span class="pill num">${s.bpm} ppm · ${s.bpb}/4</span>
          ${chords.map((c) => `<span class="pill">${chordLabel(c)}</span>`).join('')}
          ${s.imported ? `<span class="pill">${s.events.length} notas</span>` : ''}
        </div>
        <div class="lvl-badges mt-auto">${lvls.map((l) => { const b = state.best[`${s.id}:${l}`]; return `<span class="${b != null ? 'has' : ''}">${LEVELS[l]} <b class="num">${b != null ? b + '%' : '—'}</b></span>`; }).join('')}</div>
      </div>`;
    }).join('');
  },
  importTab() {
    const msg = $('#tabMsg');
    try {
      const events = parseAsciiTab($('#tabText').value, CHORDS);
      const song = { id: 'tab-' + Date.now(), title: $('#tabTitle').value.trim() || 'Mi tablatura', origin: 'Tablatura importada', imported: true, bpm: 80, bpb: 4, events };
      state.imported.push(song); store.set('imported', state.imported);
      $('#tabText').value = ''; $('#tabTitle').value = '';
      msg.textContent = `Importada: ${events.length} notas o acordes.`; msg.style.color = 'var(--ok)';
      this.render();
    } catch (e) { msg.textContent = e.message; msg.style.color = 'var(--bad)'; }
  },
};

const Player = {
  song: null, built: null, level: 'easy', events: [], status: 'idle', demo: false, beat: 0, speed: 0.8, wait: true, metro: false,
  idx: 0, hits: 0, streak: 0, check: null, lastHitMidi: null, onsetSince: true, frozen: false, curIdx: -1, ctx: null, W: 0, H: 0,
  init() {
    this.canvas = $('#hw'); this.ctx = this.canvas.getContext('2d');
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    $('#plBack').addEventListener('click', () => this.close());
    $('#plPlay').addEventListener('click', () => (this.status === 'playing' && !this.demo ? this.pause() : this.play(false)));
    $('#plDemo').addEventListener('click', () => (this.status === 'playing' && this.demo ? this.pause() : this.play(true)));
    $('#plRestart').addEventListener('click', () => this.reset());
    $('#plLevel').addEventListener('click', (e) => { const b = e.target.closest('[data-l]'); if (b) this.setLevel(b.dataset.l); });
    $('#plSpeed').addEventListener('input', (e) => { this.speed = e.target.value / 100; $('#plSpeedVal').textContent = e.target.value + '%'; });
    $('#plWait').addEventListener('change', (e) => { this.wait = e.target.checked; });
    $('#plMetro').addEventListener('change', (e) => { this.metro = e.target.checked; });
    $('#resAgain').addEventListener('click', () => { closeModal('#resModal'); this.reset(); this.play(false); });
    $('#resNext').addEventListener('click', () => { closeModal('#resModal'); const n = { easy: 'medium', medium: 'hard' }[this.level]; if (n) this.setLevel(n); });
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || $('#player').hidden || state.view !== 'canciones' || e.target.closest('input,textarea,select,button')) return;
      e.preventDefault(); $('#plPlay').click();
    });
  },
  open(song) {
    this.song = song;
    if (song.imported) {
      const last = song.events[song.events.length - 1];
      this.built = { total: last.t + last.dur, pickup: 0, chordTrack: [], levels: { full: song.events } };
    } else this.built = buildSong(song, CHORDS);
    const lvls = Object.keys(this.built.levels);
    $('#plLevel').innerHTML = lvls.map((l) => `<button type="button" data-l="${l}">${LEVELS[l]}</button>`).join('');
    $('#plTitle').textContent = song.title; $('#plOrigin').textContent = `${song.origin} · ${song.bpm} ppm · ${song.bpb}/4`;
    $('#songList').hidden = true; $('#player').hidden = false;
    window.scrollTo({ top: 0 });
    this.setLevel(store.get('lvl:' + song.id, lvls[0]));
    this.resize();
  },
  close() { this.pause(); $('#player').hidden = true; $('#songList').hidden = false; Songs.render(); },
  setLevel(l) {
    if (!this.built.levels[l]) l = Object.keys(this.built.levels)[0];
    this.level = l; store.set('lvl:' + this.song.id, l);
    $$('#plLevel button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.l === l)));
    const [sp, w] = LEVEL_DEFAULTS[l];
    this.speed = sp / 100; $('#plSpeed').value = sp; $('#plSpeedVal').textContent = sp + '%';
    this.wait = w; $('#plWait').checked = w;
    this.reset();
  },
  startBeat() { const p = this.built.pickup, bpb = this.song.bpb; return (p > 0 ? p - 2 * bpb : -bpb) - 0.001; },
  reset() {
    this.events = this.built.levels[this.level].map((e) => ({ ...e, st: 0, hitAt: 0 }));
    Object.assign(this, { status: 'idle', demo: false, beat: this.startBeat(), idx: 0, hits: 0, streak: 0, check: null, lastHitMidi: null, onsetSince: true, frozen: false, curIdx: -1 });
    this.renderHud(); this.renderButtons(); this.renderNow();
  },
  async play(demo) {
    AudioEngine.ensure();
    if (!demo && !(await ensureMic())) return;
    if (this.status === 'done' || this.demo !== demo || (this.status === 'idle')) { this.reset(); }
    this.demo = demo; this.status = 'playing'; this.renderButtons();
  },
  pause() { if (this.status === 'playing') { this.status = 'paused'; this.renderButtons(); } },
  renderButtons() {
    const playing = this.status === 'playing';
    $('#plPlay').innerHTML = playing && !this.demo ? `${icon('pause-fill')}<span>Pausa</span>` : `${icon('play-fill')}<span>${this.status === 'paused' && !this.demo ? 'Seguir' : 'Tocar'}</span>`;
    $('#plDemo').innerHTML = playing && this.demo ? `${icon('pause-fill')}Parar` : `${icon('headphone-line')}Escuchar`;
  },
  renderHud() {
    $('#plScore').textContent = `${this.hits}/${this.events.length}`;
    $('#plStreak').textContent = this.streak;
  },
  currentIndex() {
    if (this.status === 'idle') return 0;
    if (this.demo) { const i = this.events.findIndex((e) => e.t + e.dur > this.beat); return i < 0 ? this.events.length - 1 : i; }
    return Math.min(this.idx, this.events.length - 1);
  },
  renderNow() {
    const i = this.currentIndex(); if (i === this.curIdx) return; this.curIdx = i;
    const e = this.events[i], nx = this.events[i + 1];
    $('#plFret').innerHTML = fretboardSVG(e);
    const fingers = new Set((e ? (e.chord ? chordNotes(CHORDS[e.chord]) : e.notes) : []).map((n) => n.finger).filter(Boolean));
    $('#plHand').innerHTML = handSVG(fingers, 140);
    $('#plNowText').innerHTML = e ? this.describe(e) : '';
    $('#plNext').innerHTML = nx ? `Después: <b class="text-[var(--text)]">${this.describe(nx, true)}</b>` : 'Última nota';
  },
  describe(e, short) {
    if (e.chord || e.notes.length > 1) {
      const name = e.chord ? chordLabel(e.chord) : 'acorde';
      return short ? `${name} ${e.dir === 'U' ? '↑' : '↓'}` : `${icon(e.dir === 'U' ? 'arrow-up-line' : 'arrow-down-line')} <b class="text-[var(--text)]">${name}</b> · rasguea hacia ${e.dir === 'U' ? 'arriba' : 'abajo'}`;
    }
    const n = e.notes[0];
    const where = n.fret === 0 ? 'al aire' : `traste ${n.fret}, dedo ${n.finger}`;
    return short ? `${pcName(n.midi)} (${n.string}ª ${where})` : `<b class="text-[var(--text)]">${pcName(n.midi)}${octave(n.midi)}</b> · ${n.string}ª cuerda, ${where}${n.fret ? ` (${FINGERS[n.finger].n.toLowerCase()})` : ''}`;
  },
  frame(f, dt, now) {
    if (!this.song || $('#player').hidden) return;
    if (this.status === 'playing') this.advance(f, dt, now);
    this.draw(now);
  },
  advance(f, dt, now) {
    const bpb = this.song.bpb, bps = (this.song.bpm * this.speed) / 60;
    let next = this.beat + dt * bps;
    this.frozen = false;
    if (!this.demo && this.wait) {
      const e = this.events[this.idx];
      if (e && next >= e.t) { next = Math.max(this.beat, e.t); this.frozen = true; }
    }
    for (let b = Math.floor(this.beat) + 1; b <= next; b++) {
      if (b < 0 || this.metro) AudioEngine.click((((b - this.built.pickup) % bpb) + bpb) % bpb === 0);
    }
    if (this.demo) {
      Mic.ignoreFor(1500);
      for (const e of this.events) if (e.t > this.beat && e.t <= next) {
        if (e.chord || e.notes.length > 1) AudioEngine.strum(e.notes, e.dir || 'D');
        else AudioEngine.pluck(midiToFreq(e.notes[0].midi), 0, 0.55);
      }
    }
    this.beat = next;
    if (!this.demo) this.judge(f, now, bps);
    this.renderNow();
    const doneAll = this.demo ? this.beat > this.built.total + 0.5 : this.idx >= this.events.length && this.beat > (this.events[this.events.length - 1]?.t ?? 0) + 1;
    if (doneAll) this.finish();
  },
  judge(f, now, bps) {
    if (!f) return;
    const e0 = this.events[this.idx];
    if (f.onset) { this.onsetSince = true; if (e0 && (e0.chord || e0.notes.length > 1)) this.check = { t0: now }; }
    const lat = ((state.cal?.latency ?? 0.12) / 2) * bps;
    const eff = this.frozen ? this.beat : this.beat - lat;
    const early = 0.35 * bps, late = 0.35 * bps;
    while (!this.wait && this.events[this.idx] && eff > this.events[this.idx].t + late) {
      this.events[this.idx].st = -1; this.idx++; this.streak = 0; this.check = null; this.renderHud();
    }
    const e = this.events[this.idx];
    if (!e || eff < e.t - early) return;
    if (e.chord || e.notes.length > 1) {
      if (!this.check || now - this.check.t0 < 110) return;
      const notes = e.chord ? chordNotes(CHORDS[e.chord]) : e.notes;
      const r = matchChord(Mic.semis(), hypothesesFor(notes, e.chord));
      if (r.ok || (r.best.kind === 'missing' && r.score > 0.8)) this.hit(e, null);
      else if (now - this.check.t0 > 650) this.check = null;
    } else {
      const m = f.stable; if (m == null) return;
      const want = e.notes[0].midi;
      if ((m === want || Math.abs(m - want) === 12) && (this.onsetSince || m !== this.lastHitMidi)) this.hit(e, m);
    }
  },
  hit(e, m) {
    e.st = 1; e.hitAt = performance.now();
    this.idx++; this.hits++; this.streak++; this.lastHitMidi = m; this.onsetSince = false; this.check = null;
    this.renderHud();
  },
  finish() {
    const wasDemo = this.demo;
    this.status = 'done'; this.renderButtons();
    if (wasDemo) { this.reset(); return; }
    const pct = Math.round((100 * this.hits) / Math.max(1, this.events.length));
    const stars = pct >= 95 ? 3 : pct >= 80 ? 2 : pct >= 60 ? 1 : 0;
    const key = `${this.song.id}:${this.level}`;
    const isBest = pct > (state.best[key] ?? -1);
    if (isBest) { state.best[key] = pct; store.set('best', state.best); }
    $('#resStars').innerHTML = [1, 2, 3].map((k) => icon('star-fill', k <= stars ? 'on' : '')).join('');
    $('#resTitle').textContent = stars === 3 ? '¡Perfecto!' : stars === 2 ? '¡Muy bien!' : stars === 1 ? 'Vas por buen camino' : 'Sigue practicando';
    $('#resText').textContent = `${this.hits} de ${this.events.length} aciertos (${pct}%)${isBest ? ' · nuevo récord' : ''}. ${pct < 80 ? 'Baja la velocidad o activa “Esperarme”.' : this.level !== 'hard' && !this.song.imported ? 'Prueba el siguiente nivel.' : ''}`;
    $('#resNext').hidden = !({ easy: 1, medium: 1 })[this.level];
    openModal('#resModal');
  },
  resize() {
    const c = this.canvas; if (!c || !c.clientWidth) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = c.clientWidth; this.H = c.clientHeight;
    c.width = Math.round(this.W * dpr); c.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },
  draw(now) {
    const c = this.ctx, W = this.W, H = this.H; if (!c || !W) return;
    const top = 62, gap = (H - top - 30) / 5, ly = (s) => top + (s - 1) * gap;
    const gutter = 46, nowX = gutter + Math.min(150, W * 0.2), ppb = W < 640 ? 68 : 112, beat = this.beat;
    const X = (t) => nowX + (t - beat) * ppb;
    c.clearRect(0, 0, W, H);
    c.fillStyle = PAL['bg-2']; c.fillRect(0, 0, W, H);
    // zona de acierto
    const pulse = this.frozen ? 0.1 + 0.06 * Math.sin(now / 160) : 0.06;
    c.fillStyle = `rgba(226,184,102,${pulse})`; c.fillRect(nowX - 24, top - 26, 48, gap * 5 + 52);
    // compases
    const bpb = this.song.bpb, p = this.built.pickup;
    c.font = '500 11px Inter, system-ui, sans-serif'; c.textAlign = 'center';
    for (let b = p + Math.floor((beat - p - nowX / ppb) / bpb) * bpb; X(b) < W + 10; b += bpb) {
      const x = X(b); if (x < gutter) continue;
      c.strokeStyle = PAL.line; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, top - 22); c.lineTo(x, ly(6) + 18); c.stroke();
      const n = Math.round((b - p) / bpb) + 1; if (n >= 1) { c.fillStyle = PAL.faint; c.fillText(n, x, H - 8); }
    }
    // cuerdas
    for (let s = 1; s <= 6; s++) {
      c.strokeStyle = PAL['line-2']; c.lineWidth = 1 + (s - 1) * 0.35;
      c.beginPath(); c.moveTo(gutter, ly(s)); c.lineTo(W, ly(s)); c.stroke();
      c.fillStyle = PAL.muted; c.font = '600 12px Inter, system-ui, sans-serif'; c.textAlign = 'center';
      c.fillText(pcName(stringMidi(s)), 20, ly(s) + 4);
    }
    // acordes de fondo (niveles de melodía)
    if (this.level !== 'hard') {
      c.font = '600 13px Inter, system-ui, sans-serif'; c.textAlign = 'left';
      for (const seg of this.built.chordTrack) {
        const x = X(seg.t); if (x > W || x + seg.dur * ppb < gutter) continue;
        c.fillStyle = PAL.muted; c.fillText(chordLabel(seg.chord), Math.max(gutter + 4, x + 4), 24);
        c.fillStyle = PAL.line; c.fillRect(x, 32, Math.max(0, seg.dur * ppb - 6), 2);
      }
    }
    // eventos
    for (const e of this.events) {
      const x = X(e.t); if (x + e.dur * ppb < gutter - 30) continue; if (x > W + 30) break;
      c.globalAlpha = e.st === -1 ? 0.28 : 1;
      if (e.chord || e.notes.length > 1) this.drawChord(c, e, x, ly, now);
      else this.drawNote(c, e, x, ly, ppb, now);
      c.globalAlpha = 1;
    }
    // línea de "ahora"
    c.save(); c.shadowColor = PAL.accent; c.shadowBlur = 12; c.strokeStyle = PAL.accent; c.lineWidth = 2;
    c.beginPath(); c.moveTo(nowX, top - 26); c.lineTo(nowX, ly(6) + 26); c.stroke(); c.restore();
    c.fillStyle = PAL['bg-2']; c.fillRect(0, 0, gutter - 6, H);
    for (let s = 1; s <= 6; s++) { c.fillStyle = PAL.muted; c.font = '600 12px Inter, system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(pcName(stringMidi(s)), 20, ly(s) + 4); }
    // mensajes
    c.textAlign = 'center';
    if (this.status === 'playing' && beat < 0) {
      c.fillStyle = PAL.text; c.font = '700 54px Inter, system-ui, sans-serif';
      c.fillText(Math.ceil(-beat), (nowX + W) / 2, H / 2 + 18);
    } else if (this.status === 'idle') {
      const msg = Mic.on ? 'Pulsa Tocar (o la barra espaciadora)' : 'Pulsa Tocar · necesitaré el micrófono';
      c.font = '500 14px Inter, system-ui, sans-serif';
      const tw = c.measureText(msg).width + 32, cx = clamp(nowX + 40 + tw / 2, tw / 2 + 8, W - tw / 2 - 8);
      c.fillStyle = 'rgba(14,16,20,.82)'; c.beginPath(); c.roundRect(cx - tw / 2, H / 2 - 22, tw, 40, 10); c.fill();
      c.fillStyle = PAL.text; c.fillText(msg, cx, H / 2 + 3);
    } else if (this.frozen) {
      c.fillStyle = PAL.accent; c.font = '600 12px Inter, system-ui, sans-serif'; c.fillText('Te espero…', nowX, 14);
    } else if (this.status === 'paused') {
      c.fillStyle = PAL.text; c.font = '600 15px Inter, system-ui, sans-serif'; c.fillText('En pausa', (nowX + W) / 2, H / 2 + 4);
    }
  },
  drawDot(c, x, y, n, r) {
    if (n.fret === 0) {
      c.fillStyle = PAL['bg-2']; c.strokeStyle = PAL.open; c.lineWidth = 2.2;
      c.beginPath(); c.arc(x, y, r - 1, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = PAL.open;
    } else {
      c.fillStyle = fingerHex(n.finger); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#10131a';
    }
    c.font = `700 ${r > 13 ? 14 : 12}px Inter, system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(n.fret, x, y + 0.5); c.textBaseline = 'alphabetic';
  },
  drawHit(c, e, x, y, r, now) {
    if (e.st !== 1) return;
    const k = clamp((now - e.hitAt) / 450, 0, 1);
    c.strokeStyle = PAL.ok; c.lineWidth = 3;
    c.beginPath(); c.arc(x, y, r + 4, 0, Math.PI * 2); c.stroke();
    if (k < 1) { c.globalAlpha = 1 - k; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r + 4 + k * 22, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; }
  },
  drawNote(c, e, x, ly, ppb, now) {
    const n = e.notes[0], y = ly(n.string), len = e.dur * ppb - 22;
    if (len > 4) { c.fillStyle = fingerHex(n.finger); c.globalAlpha *= 0.25; c.beginPath(); c.roundRect(x, y - 4, len, 8, 4); c.fill(); c.globalAlpha = e.st === -1 ? 0.28 : 1; }
    this.drawDot(c, x, y, n, 15);
    this.drawHit(c, e, x, y, 15, now);
  },
  drawChord(c, e, x, ly, now) {
    const ss = e.notes.map((n) => n.string), s1 = Math.min(...ss), s2 = Math.max(...ss);
    c.fillStyle = 'rgba(255,255,255,0.05)'; c.strokeStyle = e.st === 1 ? PAL.ok : PAL['line-2']; c.lineWidth = e.st === 1 ? 2.5 : 1.5;
    c.beginPath(); c.roundRect(x - 16, ly(s1) - 16, 32, ly(s2) - ly(s1) + 32, 16); c.fill(); c.stroke();
    if (e.dir !== 'U') for (let s = 1; s <= 6; s++) if (!ss.includes(s)) {
      c.strokeStyle = PAL.faint; c.lineWidth = 2; const y = ly(s);
      c.beginPath(); c.moveTo(x - 4, y - 4); c.lineTo(x + 4, y + 4); c.moveTo(x + 4, y - 4); c.lineTo(x - 4, y + 4); c.stroke();
    }
    for (const n of e.notes) this.drawDot(c, x, ly(n.string), n, 11);
    // flecha de rasgueo
    const ay = ly(s1) - 26; c.fillStyle = e.dir === 'U' ? PAL.muted : PAL.text;
    c.beginPath();
    if (e.dir === 'U') { c.moveTo(x, ay - 6); c.lineTo(x - 6, ay + 3); c.lineTo(x + 6, ay + 3); } else { c.moveTo(x, ay + 4); c.lineTo(x - 6, ay - 5); c.lineTo(x + 6, ay - 5); }
    c.fill();
    if (e.chord && e.first) { c.fillStyle = PAL.accent; c.font = '700 14px Inter, system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(chordLabel(e.chord), x, 22); }
    if (e.st === 1 && now - e.hitAt < 450) { const k = (now - e.hitAt) / 450; c.globalAlpha = 1 - k; c.strokeStyle = PAL.ok; c.lineWidth = 2; c.beginPath(); c.roundRect(x - 16 - k * 14, ly(s1) - 16 - k * 14, 32 + k * 28, ly(s2) - ly(s1) + 32 + k * 28, 16 + k * 14); c.stroke(); c.globalAlpha = 1; }
  },
};

/* ============================================================
   Calibración del micrófono
   ============================================================ */
const Cal = {
  running: false, listener: null,
  steps: [
    { t: 'Silencio', d: 'No toques nada durante 2 segundos: mido el ruido de la sala.' },
    { t: 'Tono de prueba', d: 'Sube el volumen. Emito tres notas por el altavoz y compruebo que el micrófono las oye afinadas.' },
    { t: 'Tu guitarra', d: 'Toca la 5ª cuerda (La) al aire y déjala sonar.' },
  ],
  init() {
    $('#calBtn').addEventListener('click', () => this.open());
    $('#calStart').addEventListener('click', () => this.run());
  },
  open() {
    $('#calSteps').innerHTML = this.steps.map((s, i) => `<div class="step" data-s="" id="cal${i}"><div class="st">${i + 1}</div><div><b>${s.t}</b><p>${s.d}</p><div class="res"></div></div></div>`).join('');
    if (state.cal) this.setStep(2, '', `<span class="muted">Última calibración guardada: umbral ${fmt(20 * Math.log10(state.cal.gate), 0)} dB · retardo ${Math.round(state.cal.latency * 1000)} ms</span>`);
    $('#calStart').disabled = false; openModal('#calModal');
  },
  setStep(i, s, res) {
    const el = $('#cal' + i); el.dataset.s = s;
    el.querySelector('.st').innerHTML = s === 'ok' ? icon('check-line') : s === 'fail' ? icon('close-line') : s === 'warn' ? '!' : String(i + 1);
    if (res != null) el.querySelector('.res').innerHTML = res;
  },
  collect(ms, fn) { return new Promise((res) => { const t0 = performance.now(); this.listener = (f, now) => { fn(f, now); if (now - t0 >= ms) { this.listener = null; res(); } }; }); },
  async testTone(freq) {
    const t0 = performance.now(); let first = null; const errs = [];
    AudioEngine.tone(freq, 0.9);
    await this.collect(1300, (f, now) => {
      if (!f.pitch) return;
      let c = (freqToMidi(f.pitch.freq) - freqToMidi(freq)) * 100;
      if (Math.abs(Math.abs(c) - 1200) < 60) c = Math.abs(c) - 1200;
      if (Math.abs(c) < 60) { if (first == null) first = now - t0; if (now - t0 > 350 && now - t0 < 850) errs.push(c); }
    });
    return { ok: first != null && errs.length > 3, latency: first != null ? Math.max(0, first - 45) / 1000 : null, err: errs.length ? errs.reduce((a, b) => a + Math.abs(b), 0) / errs.length : null };
  },
  async run() {
    if (this.running || !(await ensureMic())) return;
    this.running = true; $('#calStart').disabled = true;
    const old = state.cal; let saved = false; state.cal = { gate: 0.0012, latency: 0.1 };
    try {
      this.setStep(0, 'run', '');
      const lv = []; await this.collect(2000, (f) => lv.push(f.level));
      lv.sort((a, b) => a - b);
      const noise = lv[Math.floor(lv.length * 0.9)] || 0.001;
      this.setStep(0, noise > 0.03 ? 'warn' : 'ok', `Ruido de fondo: ${fmt(20 * Math.log10(noise), 0)} dB${noise > 0.03 ? ' · hay bastante ruido, busca un sitio más tranquilo' : ''}`);
      state.cal.gate = Math.max(noise * 2.5, 0.0015);

      this.setStep(1, 'run', '');
      const rs = [];
      for (const fq of [196, 330, 440]) { rs.push(await this.testTone(fq)); await new Promise((r) => setTimeout(r, 250)); }
      const good = rs.filter((r) => r.ok);
      const lats = good.map((r) => r.latency).sort((a, b) => a - b);
      const latency = lats.length ? lats[lats.length >> 1] : 0.12;
      if (good.length >= 2) this.setStep(1, 'ok', `Oigo ${good.length} de 3 tonos · error medio ${fmt(good.reduce((a, r) => a + r.err, 0) / good.length)} cents · retardo ${Math.round(latency * 1000)} ms`);
      else this.setStep(1, 'warn', 'No oigo bien el altavoz. Si usas auriculares es normal: sigue con tu guitarra.');

      this.setStep(2, 'run', 'Esperando a que toques…');
      let peak = 0, heard = null, t0 = null;
      await new Promise((res) => {
        const start = performance.now();
        this.listener = (f, now) => {
          if (f.level > state.cal.gate * 3 && t0 == null) t0 = now;
          if (t0 != null) { peak = Math.max(peak, f.level); if (f.pitch && heard == null && now - t0 > 150) heard = f.pitch.freq; }
          if ((t0 != null && now - t0 > 1500) || now - start > 12000) { this.listener = null; res(); }
        };
      });
      if (!peak) { this.setStep(2, 'fail', 'No he oído la guitarra. Acércala al micrófono y vuelve a empezar.'); return; }
      const gate = clamp(Math.max(noise * 2.5, peak * 0.04), 0.0015, 0.05);
      const near = heard && Math.abs(freqToMidi(heard) - 45) < 0.8;
      this.setStep(2, near ? 'ok' : 'warn', heard ? `Oigo ${pcName(Math.round(freqToMidi(heard)))} (${fmt(heard)} Hz)${near ? '' : ' · no es La: puede que esté desafinada, usa el afinador'} · señal ${fmt(20 * Math.log10(peak), 0)} dB` : `Señal ${fmt(20 * Math.log10(peak), 0)} dB · no he reconocido la nota, prueba a tocar más fuerte`);
      state.cal = { noise, gate, latency, at: Date.now() };
      store.set('cal', state.cal); saved = true;
    } finally {
      if (!saved) state.cal = old;
      this.running = false; $('#calStart').disabled = false; $('#calStart').innerHTML = `${icon('restart-line')}Repetir`;
    }
  },
  frame(f, now) {
    if (!$('#calModal').hidden && f) $('#calLevel').style.width = clamp((20 * Math.log10(f.level + 1e-9) + 70) / 60, 0, 1) * 100 + '%';
    if (this.listener && f) this.listener(f, now);
  },
};

/* ============================================================
   Modales, navegación, notación y bucle principal
   ============================================================ */
function openModal(sel) { $(sel).hidden = false; $(sel).querySelector('button')?.focus(); }
function closeModal(sel) { $(sel).hidden = true; }
document.addEventListener('click', (e) => {
  if (e.target.matches('.modal')) e.target.hidden = true;
  const c = e.target.closest('[data-close]'); if (c) c.closest('.modal').hidden = true;
  if (e.target.closest('[data-action="mic-on"]')) ensureMic();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.modal').forEach((m) => { m.hidden = true; }); });

function route() {
  const v = (location.hash || '').slice(1);
  const view = ['afinador', 'acordes', 'canciones'].includes(v) ? v : 'afinador';
  state.view = view;
  $$('section[data-view]').forEach((s) => { s.hidden = s.dataset.view !== view; });
  $$('[data-tab]').forEach((a) => (a.dataset.tab === view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  if (view !== 'canciones') Player.pause();
  if (view !== 'acordes') ChordView.stop();
  if (view === 'canciones') requestAnimationFrame(() => Player.resize());
}

function setNotation(n) {
  state.notation = n; store.set('notation', n);
  $$('#notation button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.n === n)));
  $('#notationMobileLabel').textContent = n === 'latin' ? 'Do' : 'C';
  Tuner.renderList(); Tuner.last = {}; ChordView.renderList(); ChordView.render(); Songs.render();
  Player.curIdx = -1; if (Player.song) Player.renderNow();
}

let lastT = performance.now();
function loop(t) {
  const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
  let f = null;
  if (Mic.on) { f = Mic.analyze(t); renderMeter(f.level); }
  try {
    if (state.view === 'afinador') Tuner.frame(f, dt, t);
    else if (state.view === 'acordes') ChordView.frame(f, t);
    else Player.frame(f, dt, t);
    Cal.frame(f, t);
  } catch (err) { console.error(err); }
  requestAnimationFrame(loop);
}

function boot() {
  hydrateIcons();
  readPalette();
  Tuner.init(); ChordView.init(); Songs.init(); Player.init(); Cal.init();
  $('#notation').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setNotation(b.dataset.n); });
  $('#notationMobile').addEventListener('click', () => setNotation(state.notation === 'latin' ? 'letter' : 'latin'));
  $('#micBtn').addEventListener('click', () => (Mic.on ? Mic.stop() : ensureMic()));
  window.addEventListener('hashchange', route);
  setNotation(state.notation);
  renderMic(); route();
  requestAnimationFrame(loop);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
