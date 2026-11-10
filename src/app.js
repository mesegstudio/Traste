'use strict';
/* ============================================================
   Traste — aplicación (afinador, acordes, canciones)
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (v, d = 1) => v.toFixed(d).replace('.', ',');
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const norm = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const store = {
  get(k, d) { try { const v = localStorage.getItem('traste:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('traste:' + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};

const state = {
  view: 'afinador',
  notation: store.get('notation', 'latin'),
  cals: store.get('cals', {}),          // comprobación del micrófono, por micrófono
  learned: store.get('learned', {}),
  best: store.get('best2', {}),          // canciones: { 'id:nivel': { stars, acc, pts } }
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
const ordinalList = (arr) => arr.map((s) => `${s}ª`).join(arr.length > 1 ? ' y la ' : '');
let PAL = {};
function readPalette() {
  for (const k of ['bg', 'bg-2', 'surface', 'surface-2', 'surface-3', 'line', 'line-2', 'text', 'muted', 'faint', 'accent', 'accent-ink', 'ok', 'bad', 'warn', 'f1', 'f2', 'f3', 'f4', 'open', 'dot-ink']) PAL[k] = cssVar('--' + k);
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
    Mic.ignoreFor((when + 2.5) * 1000); // que la app no se escuche a sí misma
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
  // Tono de prueba: onda triangular. Aunque el altavoz no reproduzca la fundamental, conserva el
  // periodo y el detector mide la nota exacta (probado con altavoces que cortan por debajo de 700 Hz).
  tone(freq, dur) {
    const ctx = this.ensure(), o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = 'triangle'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.55, t + 0.02); g.gain.setValueAtTime(0.55, t + dur - 0.05); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.02);
  },
};

// Identifica el micrófono físico (Chrome antepone "Predeterminado - " al micro del sistema)
function micKey(label, id) {
  const l = (label || '').replace(/^(default|predeterminado|por defecto|communications|comunicaciones)\s*[-–:]\s*/i, '').trim();
  return l || id || 'micro';
}

/* Micrófono. Cada fotograma devuelve el nivel, la nota estable (YIN) y, si hay un ataque, un objeto
   "attack" con la nota que lo identifica: la primera lectura estable 30-250 ms después del ataque
   o la nota que "aparece" en el espectro. Validado con grabaciones reales (GuitarSet): 88 % de notas
   reconocidas y 0,9 % de notas equivocadas aceptadas. Cada ataque solo puede usarse una vez. */
const Mic = {
  on: false, stream: null, source: null, analyser: null, short: null, td: null, fd: null, mags: null, fd2: null, mags2: null, sr: 48000, dec: 2,
  deviceId: '', label: '', key: '',
  ignoreUntil: 0, clickUntil: 0, hist: [], lastOnset: 0, prevRound: null, stableCount: 0, specHist: [], flux: null, attack: null, seq: 0,
  ignoreFor(ms) { this.ignoreUntil = Math.max(this.ignoreUntil, performance.now() + ms); },
  async start(deviceId) {
    if (this.on && !deviceId) return;
    if (!navigator.mediaDevices?.getUserMedia) { const e = new Error('Este navegador no permite usar el micrófono aquí.'); e.name = 'Unsupported'; throw e; }
    const ctx = AudioEngine.ensure();
    // Sin cancelación de eco, supresión de ruido ni control de ganancia: alteran las notas sostenidas
    const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    const want = deviceId || store.get('micDevice', '');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: want ? { ...audio, deviceId: { exact: want } } : audio }); }
    catch (e) { if (want && !deviceId && e.name === 'OverconstrainedError') stream = await navigator.mediaDevices.getUserMedia({ audio }); else throw e; }
    if (this.on) this.stop(true);
    this.stream = stream;
    const track = stream.getAudioTracks()[0], st = track.getSettings?.() || {};
    this.deviceId = st.deviceId || ''; this.label = track.label || 'Micrófono'; this.key = micKey(track.label, st.deviceId);
    if (deviceId) store.set('micDevice', deviceId);
    this.source = ctx.createMediaStreamSource(stream);
    if (!this.analyser) {
      const an = ctx.createAnalyser(); an.fftSize = 16384; an.smoothingTimeConstant = 0;
      const mute = ctx.createGain(); mute.gain.value = 0; an.connect(mute).connect(ctx.destination);
      this.analyser = an; this.td = new Float32Array(an.fftSize); this.fd = new Float32Array(an.frequencyBinCount); this.mags = new Float32Array(an.frequencyBinCount);
      const sh = ctx.createAnalyser(); sh.fftSize = 4096; sh.smoothingTimeConstant = 0; sh.connect(mute);
      this.short = sh; this.fd2 = new Float32Array(sh.frequencyBinCount); this.mags2 = new Float32Array(sh.frequencyBinCount);
    }
    this.source.connect(this.analyser); this.source.connect(this.short);
    this.sr = ctx.sampleRate; this.dec = Math.max(1, Math.round(this.sr / 24000));
    track.addEventListener('ended', () => { this.stop(); toast('Se ha desconectado el micrófono.'); });
    this.hist = []; this.specHist = []; this.flux = null; this.attack = null; this.on = true;
    onMicChange();
  },
  stop(silent) {
    this.stream?.getTracks().forEach((t) => t.stop());
    try { this.source?.disconnect(); } catch { /* ya desconectado */ }
    this.on = false; this.source = null;
    if (!silent) onMicChange();
  },
  gate() { return Cal.running ? 0.0012 : state.cals[this.key]?.gate ?? 0.006; },
  latency() { return state.cals[this.key]?.latency ?? 0.12; },
  analyze(now) {
    this.analyser.getFloatTimeDomainData(this.td);
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
    if (!ignoring && now > this.clickUntil && level > this.gate() * 1.4 && level > prevMin * 1.5 && now - this.lastOnset > 160) { onset = true; this.lastOnset = now; }
    const midi = pitch ? freqToMidi(pitch.freq) : null;
    const rd = midi == null ? null : Math.round(midi);
    if (rd != null && rd === this.prevRound && Math.abs(midi - rd) < 0.4) this.stableCount++; else this.stableCount = rd == null ? 0 : 1;
    this.prevRound = rd;
    const stable = this.stableCount >= 2 ? rd : null;
    // ataque: espectro antes / 90 ms después, y primera lectura estable
    const spec = this.shortSemis();
    this.specHist.push({ t: now, spec }); while (this.specHist.length > 6) this.specHist.shift();
    if (onset) {
      const before = [...this.specHist].reverse().find((h) => h.t <= now - 30);
      this.flux = before ? { t0: now, before: before.spec } : null;
      this.attack = { id: ++this.seq, t0: now, yin: null, flux: null, fluxVec: null, used: false, settled: false };
    }
    const a = this.attack;
    if (a && !ignoring) {
      if (stable != null && a.yin == null && now - a.t0 >= 30 && now - a.t0 <= 250) a.yin = stable;
      if (this.flux && now - this.flux.t0 >= 90) {
        const b = this.flux.before; this.flux = null;
        a.fluxVec = spec.map((v, i) => Math.max(0, v - b[i] * 1.1));
        a.flux = newNote(a.fluxVec);
      }
      a.settled = now - a.t0 > 260;
    }
    return { now, level, pitch, midi, onset, ignoring, stable, attack: a && now - a.t0 < 800 ? a : null };
  },
  shortSemis() {
    this.short.getFloatFrequencyData(this.fd2);
    for (let i = 0; i < this.fd2.length; i++) this.mags2[i] = Math.pow(10, this.fd2[i] / 20);
    return semitoneEnergies(this.mags2, this.sr, this.short.fftSize, V_LO, V_HI);
  },
  semis() {
    this.analyser.getFloatFrequencyData(this.fd);
    for (let i = 0; i < this.fd.length; i++) this.mags[i] = Math.pow(10, this.fd[i] / 20);
    return semitoneEnergies(this.mags, this.sr, this.analyser.fftSize, V_LO, V_HI);
  },
};
const attackNotes = (a) => [a.yin, a.flux].filter((x) => x != null);
const sameNote = (m, want) => m === want || Math.abs(m - want) === 12;

async function ensureMic() {
  if (Mic.on) return true;
  try { await Mic.start(); return true; } catch (e) {
    let msg;
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') msg = 'No tengo permiso para usar el micrófono. Permítelo desde el icono del candado de la barra de direcciones y vuelve a intentarlo.';
    else if (e.name === 'NotFoundError') msg = 'No encuentro ningún micrófono conectado.';
    else msg = 'No he podido abrir el micrófono. ' + (e.message || '');
    if (window.self !== window.top) msg += ' Si ves Traste dentro de otra página, ábrelo directamente en Chrome, Edge o Firefox.';
    toast(msg, 10000); return false;
  }
}
async function micReady() {
  if (!(await ensureMic())) return false;
  if (Cal.needed()) { Cal.sync(); return false; }
  return true;
}
function onMicChange() {
  const b = $('#micBtn'); b.dataset.on = String(Mic.on);
  b.title = Mic.on ? `${Mic.label} · pulsa para apagarlo` : 'Activar el micrófono';
  $('#micIcon').outerHTML = icon(Mic.on ? 'mic-line' : 'mic-off-line', '').replace('<svg', '<svg id="micIcon"');
  if (!Mic.on) renderMeter(0);
  $('#tunerCta').hidden = Mic.on;
  $('#micBox').hidden = !Mic.on;
  if (Mic.on) fillMicSelect();
  Cal.sync();
}
async function fillMicSelect() {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId);
    const sel = $('#micSelect');
    sel.innerHTML = devs.map((d, i) => `<option value="${d.deviceId}">${d.label || 'Micrófono ' + (i + 1)}</option>`).join('');
    const cur = devs.find((d) => d.deviceId === Mic.deviceId) || devs.find((d) => micKey(d.label, d.deviceId) === Mic.key);
    if (cur) sel.value = cur.deviceId;
    sel.hidden = devs.length < 2;
  } catch { /* sin lista de dispositivos */ }
}
function renderMeter(level) {
  const db = 20 * Math.log10(level + 1e-9), lit = clamp(Math.round((db + 62) / 10), 0, 5);
  $$('#micMeter i').forEach((el, i) => { el.classList.toggle('lit', i < lit); el.classList.toggle('hot', i < lit && i >= 4); });
}

/* ============================================================
   Comprobación del micrófono (silencio + tono de prueba), por micrófono
   ============================================================ */
const Cal = {
  running: false, phase: 'intro', forced: false, steps: [{ s: '', res: '' }, { s: '', res: '' }], allOk: false, listener: null,
  needed() { return Mic.on && (this.forced || this.running || this.phase === 'done' || !state.cals[Mic.key]); },
  sync() {
    $$('[data-cal-host]').forEach((h) => {
      const show = this.needed() && h.dataset.calHost === state.view;
      h.hidden = !show;
      if (show) this.render(h);
    });
  },
  render(h) {
    const stIcon = (st, i) => (st === 'ok' ? icon('check-line') : st === 'warn' ? '!' : String(i + 1));
    const items = [
      ['Silencio', 'No toques nada: mido el ruido de la sala.'],
      ['Tono de prueba', 'Sonarán tres notas por el altavoz y compruebo que el micrófono las oye afinadas.'],
    ];
    let acts = '';
    if (this.phase === 'intro') acts = `<button type="button" class="btn btn-primary btn-lg w-full" data-cal="start">${icon('play-fill')}Comenzar</button>`;
    else if (this.phase === 'run') acts = `<button type="button" class="btn btn-soft btn-lg w-full" disabled>Comprobando…</button>`;
    else acts = `<div class="flex gap-2">${this.allOk ? '' : `<button type="button" class="btn btn-soft btn-lg flex-1" data-cal="start">${icon('restart-line')}Repetir</button>`}<button type="button" class="btn btn-primary btn-lg flex-1" data-cal="done">${this.allOk ? icon('check-line') + 'Listo' : 'Seguir así'}</button></div>`;
    h.innerHTML = `<div class="cal">
      <h3>${this.phase === 'done' ? (this.allOk ? 'Micrófono listo' : 'Micrófono comprobado') : 'Primero, comprobemos tu micrófono'}</h3>
      ${this.phase === 'done' ? '' : `<p class="muted">Son unos 8 segundos y solo se hace una vez con cada micrófono${Mic.label ? ` (${Mic.label})` : ''}.</p>`}
      ${this.phase === 'intro' ? `<div class="vol-note">${icon('volume-up-line')}Sube el volumen y quítate los auriculares.</div>` : ''}
      <div class="cal-list">${items.map(([t, d], i) => `<div class="cal-item" data-s="${this.steps[i].s}"><div class="st">${stIcon(this.steps[i].s, i)}</div><div><b>${t}</b><p>${d}</p>${this.steps[i].res ? `<div class="res">${this.steps[i].res}</div>` : ''}</div></div>`).join('')}</div>
      ${this.phase === 'run' ? '<div class="bar"><div data-cal-level></div></div>' : ''}
      ${acts}
    </div>`;
  },
  setStep(i, s, res) { this.steps[i] = { s, res: res ?? this.steps[i].res }; this.sync(); },
  collect(ms, fn) { return new Promise((res) => { const t0 = performance.now(); this.listener = (f, now) => { fn(f, now); if (now - t0 >= ms) { this.listener = null; res(); } }; }); },
  async testTone(freq) {
    const t0 = performance.now(); let first = null; const errs = [];
    Mic.ignoreUntil = 0;
    AudioEngine.tone(freq, 0.9);
    await this.collect(1300, (f, now) => {
      if (!f.pitch) return;
      let c = (freqToMidi(f.pitch.freq) - freqToMidi(freq)) * 100;
      if (Math.abs(Math.abs(c) - 1200) < 60) c = Math.abs(c) - 1200; // salto de octava
      if (Math.abs(c) < 60) { if (first == null) first = now - t0; if (now - t0 > 350 && now - t0 < 850) errs.push(c); }
    });
    return { ok: first != null && errs.length > 3, latency: first != null ? Math.max(0, first - 45) / 1000 : null, err: errs.length ? errs.reduce((a, b) => a + Math.abs(b), 0) / errs.length : null };
  },
  async run() {
    if (this.running || !(await ensureMic())) return;
    this.running = true; this.phase = 'run'; this.steps = [{ s: 'run', res: '' }, { s: '', res: '' }]; this.sync();
    const key = Mic.key;
    try {
      const lv = []; await this.collect(2000, (f) => lv.push(f.level));
      lv.sort((a, b) => a - b);
      // percentil 30: un golpe o una cuerda que suene durante la medida no dispara el umbral
      const noise = lv[Math.floor(lv.length * 0.3)] || 0.001, noisy = noise > 0.02;
      this.setStep(0, noisy ? 'warn' : 'ok', noisy ? 'Hay bastante ruido. Funcionará, pero mejor en un sitio tranquilo.' : 'Sala tranquila.');
      this.setStep(1, 'run');
      const rs = [];
      for (const fq of [196, 330, 440]) { rs.push(await this.testTone(fq)); await new Promise((r) => setTimeout(r, 200)); }
      const good = rs.filter((r) => r.ok);
      const lats = good.map((r) => r.latency).sort((a, b) => a - b);
      const latency = lats.length ? lats[lats.length >> 1] : 0.12;
      const err = good.length ? good.reduce((a, r) => a + r.err, 0) / good.length : 0;
      const toneOk = good.length >= 2;
      this.setStep(1, toneOk ? 'ok' : 'warn', toneOk
        ? `Oigo ${good.length} de 3 notas afinadas (desvío de ${fmt(err)} cents).`
        : 'No he oído bien las notas. Con auriculares es normal y puedes seguir; si no, sube el volumen y repite.');
      state.cals[key] = { noise, gate: clamp(noise * 3, 0.002, 0.02), latency, toneOk, label: Mic.label, at: Date.now() };
      store.set('cals', state.cals);
      this.allOk = toneOk && !noisy;
      this.phase = 'done';
      if (this.allOk) setTimeout(() => { if (this.phase === 'done' && this.allOk) this.finish(); }, 1600);
    } finally {
      this.running = false; this.sync();
    }
  },
  finish() { this.phase = 'intro'; this.forced = false; this.steps = [{ s: '', res: '' }, { s: '', res: '' }]; this.sync(); },
  recheck() { this.forced = true; this.phase = 'intro'; this.sync(); },
  frame(f, now) {
    if (!f) return;
    if (this.running) { const w = clamp((20 * Math.log10(f.level + 1e-9) + 70) / 60, 0, 1) * 100 + '%'; $$('[data-cal-level]').forEach((el) => { el.style.width = w; }); }
    if (this.listener) this.listener(f, now);
  },
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cal]'); if (!b) return;
  if (b.dataset.cal === 'start') Cal.run(); else Cal.finish();
});

/* ============================================================
   Dibujos SVG: diagrama de acorde, mano, mástil
   ============================================================ */
function chordDiagram(ch, res = {}) {
  const sx = 32, sy = 42, L = 34, T = 46;
  const fretted = ch.frets.filter((f) => f > 0);
  const maxF = Math.max(0, ...fretted), minF = Math.min(99, ...fretted);
  const base = maxF <= 4 ? 1 : minF, nF = Math.max(4, maxF - base + 1);
  const W = L + 5 * sx + 30, H = T + nF * sy + 34, xs = (i) => L + i * sx;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="font-family:var(--font);max-width:100%;height:auto" role="img" aria-label="Diagrama del acorde">`;
  for (let i = 0; i < 6; i++) if (res[6 - i] === 'now') s += `<rect x="${xs(i) - 15}" y="${T - 34}" width="30" height="${nF * sy + 60}" rx="15" fill="var(--accent-soft)"/>`;
  s += `<rect x="${xs(0)}" y="${T}" width="${5 * sx}" height="${nF * sy}" rx="3" fill="var(--surface-2)"/>`;
  for (let k = 0; k <= nF; k++) {
    const y = T + k * sy;
    s += k === 0 && base === 1 ? `<rect x="${xs(0) - 2}" y="${y - 6}" width="${5 * sx + 4}" height="7" rx="2" fill="var(--text)"/>` : `<line x1="${xs(0)}" x2="${xs(5)}" y1="${y}" y2="${y}" stroke="var(--line-2)" stroke-width="2"/>`;
  }
  if (base > 1) s += `<text x="${xs(0) - 10}" y="${T + sy * 0.5 + 5}" text-anchor="end" font-size="13" font-weight="600" fill="var(--muted)">${base}ª</text>`;
  for (let i = 0; i < 6; i++) s += `<line x1="${xs(i)}" x2="${xs(i)}" y1="${T}" y2="${T + nF * sy}" stroke="var(--muted)" stroke-opacity=".75" stroke-width="${2.6 - i * 0.32}"/>`;
  for (let i = 0; i < 6; i++) {
    const f = ch.frets[i], st = res[6 - i], col = st === 'bad' ? 'var(--bad)' : st === 'ok' ? 'var(--ok)' : st === 'now' ? 'var(--accent)' : null;
    if (f < 0) s += `<g stroke="${col || 'var(--faint)'}" stroke-width="2.2" stroke-linecap="round"><line x1="${xs(i) - 6}" y1="${T - 24}" x2="${xs(i) + 6}" y2="${T - 12}"/><line x1="${xs(i) + 6}" y1="${T - 24}" x2="${xs(i) - 6}" y2="${T - 12}"/></g>`;
    if (f === 0) s += `<circle cx="${xs(i)}" cy="${T - 18}" r="7" fill="none" stroke="${col || 'var(--open)'}" stroke-width="2.2"/>`;
    s += `<text x="${xs(i)}" y="${H - 8}" text-anchor="middle" font-size="12.5" font-weight="650" fill="${col || (f >= 0 ? 'var(--muted)' : 'var(--faint)')}">${f >= 0 ? pcName(OPEN_MIDI[i] + f) : ''}</text>`;
  }
  const b = ch.barre;
  let bi1 = -1, bi2 = -1;
  if (b) {
    bi1 = 6 - b.from; bi2 = 6 - b.to; const y = T + (b.fret - base + 0.5) * sy;
    s += `<rect x="${xs(bi1) - 14}" y="${y - 14}" width="${xs(bi2) - xs(bi1) + 28}" height="28" rx="14" fill="${fingerVar(b.finger)}"/>`;
    s += `<text x="${xs(bi1)}" y="${y + 4.5}" text-anchor="middle" font-size="13" font-weight="750" fill="var(--dot-ink)">${b.finger}</text>`;
  }
  for (let i = 0; i < 6; i++) {
    const f = ch.frets[i]; if (f <= 0) continue;
    if (b && f === b.fret && ch.fingers[i] === b.finger && i >= bi1 && i <= bi2) continue;
    const y = T + (f - base + 0.5) * sy, st = res[6 - i];
    s += `<circle cx="${xs(i)}" cy="${y}" r="14" fill="${fingerVar(ch.fingers[i])}" ${st === 'bad' ? 'stroke="var(--bad)" stroke-width="3"' : ''}/>`;
    s += `<text x="${xs(i)}" y="${y + 4.5}" text-anchor="middle" font-size="13.5" font-weight="750" fill="var(--dot-ink)">${ch.fingers[i]}</text>`;
  }
  return s + '</svg>';
}

// Mano izquierda vista desde la palma: pulgar a la izquierda y dedos 1-4 de izquierda a derecha
function handSVG(active, w = 150) {
  const F = [null, { x: 76, top: 40 }, { x: 103, top: 22 }, { x: 130, top: 30 }, { x: 155, top: 56 }];
  let s = `<svg viewBox="0 0 200 214" width="${w}" style="font-family:var(--font);max-width:100%;height:auto;overflow:visible" role="img" aria-label="Número y color de cada dedo">`;
  s += `<rect x="35" y="108" width="26" height="74" rx="13" transform="rotate(-36 48 145)" fill="var(--surface-3)"/>`;
  s += `<text x="29" y="128" text-anchor="middle" font-size="12" font-weight="700" fill="var(--faint)">P</text>`;
  for (let f = 1; f <= 4; f++) {
    const d = F[f], on = active.has(f);
    s += `<rect x="${d.x - 12.5}" y="${d.top}" width="25" height="${150 - d.top}" rx="12.5" fill="${on ? fingerVar(f) : 'var(--surface-3)'}" stroke="${fingerVar(f)}" stroke-opacity="${on ? 0 : 0.55}" stroke-width="1.6"/>`;
    s += `<text x="${d.x}" y="${d.top + 19}" text-anchor="middle" font-size="13" font-weight="750" fill="${on ? 'var(--dot-ink)' : fingerVar(f)}">${f}</text>`;
  }
  s += `<rect x="58" y="112" width="114" height="96" rx="38" fill="var(--surface-3)"/>`;
  return s + '</svg>';
}
function fingerLegend(active) {
  return `<div class="legend">${[1, 2, 3, 4].map((f) => `<span style="${active && !active.has(f) ? 'opacity:.45' : ''}"><i style="background:${fingerVar(f)}"></i>${f} ${FINGERS[f].n}</span>`).join('')}</div>`;
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
  s += `<text x="${nutX}" y="16" font-size="12" font-weight="600" fill="var(--muted)">Mano izquierda</text>`;
  s += `<text x="${rhX}" y="16" text-anchor="middle" font-size="12" font-weight="600" fill="var(--muted)">Derecha</text>`;
  s += `<rect x="${nutX}" y="${y(1) - 13}" width="${nF * fw}" height="${5 * rowH + 26}" rx="6" fill="var(--surface-2)"/>`;
  for (const k of [3, 5, 7, 9]) if (k <= nF) s += `<circle cx="${nutX + (k - 0.5) * fw}" cy="${(y(3) + y(4)) / 2}" r="5" fill="var(--line-2)"/>`;
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
    s += `<text x="${cx}" y="${y(n.string) + 4.5}" text-anchor="middle" font-size="12.5" font-weight="750" fill="var(--dot-ink)">${n.finger}</text>`;
  }
  return s + '</svg>';
}

/* ============================================================
   Afinador: automático por defecto, cuerdas dibujadas, tocar una cuerda = elegirla
   ============================================================ */
const STRING_TH = { 6: 4.4, 5: 3.7, 4: 3, 3: 2.4, 2: 1.9, 1: 1.5 };
const Tuner = {
  mode: 'auto', sel: 6, cur: null, lock: null, done: new Set(), hold: 0, hist: [], shown: 0, target: 0, lastSeen: 0, live: false, cents: 0, level: 0, phase: 0, last: {},
  init() {
    const ticks = $('#ticks');
    for (let c = -50; c <= 50; c += 5) {
      const d = document.createElement('div');
      d.className = 'tick' + (c === 0 ? ' zero' : c % 25 === 0 ? ' major' : '');
      d.style.left = (c + 50) + '%'; ticks.appendChild(d);
    }
    $('#tnStrings').addEventListener('click', (e) => {
      const row = e.target.closest('[data-s]'); if (!row) return;
      const s = +row.dataset.s;
      this.sel = s; this.setMode('manual');
      AudioEngine.pluck(midiToFreq(stringMidi(s)), 0, 0.7);
    });
    $('#tnMode').addEventListener('click', () => { if (this.mode === 'manual') this.setMode('auto'); else toast('Para elegir una cuerda, tócala en el dibujo.', 3500, 'information-line'); });
    $('#tnReset').addEventListener('click', () => { this.done.clear(); this.hold = 0; this.renderStrings(); });
    $('#micSelect').addEventListener('change', async (e) => { try { await Mic.start(e.target.value); } catch { toast('No he podido abrir ese micrófono.'); fillMicSelect(); } });
    $('#recalBtn').addEventListener('click', () => Cal.recheck());
    this.renderStrings();
  },
  setMode(m) {
    this.mode = m; this.hist = []; this.hold = 0; this.lock = null;
    if (m === 'manual') this.cur = this.sel;
    $('#tnMode').classList.toggle('manual', m === 'manual');
    $('#tnModeText').innerHTML = m === 'manual' ? `Cuerda ${this.sel} · ${pcName(stringMidi(this.sel))} ${icon('close-line')}` : 'Automático';
    this.renderStrings();
  },
  renderStrings() {
    $('#tnStrings').innerHTML = [6, 5, 4, 3, 2, 1].map((s) => `
      <button type="button" class="str ${this.done.has(s) ? 'done' : ''} ${this.mode === 'manual' && this.sel === s ? 'sel' : ''}" data-s="${s}" style="--th:${STRING_TH[s]}px" aria-label="Cuerda ${s}, ${stringName(s)}: tócala para afinar solo esta">
        <span class="peg">${this.done.has(s) ? icon('check-line') : pcName(stringMidi(s))}</span>
        <span class="wire"><svg viewBox="0 0 400 26" preserveAspectRatio="none"><path d="M0 13 L400 13" fill="none" stroke-width="${STRING_TH[s]}" stroke-linecap="round"/></svg></span>
        <span class="info">${this.done.has(s) ? 'Afinada' : `${s}ª`}</span>
      </button>`).join('');
    $('#tnProgress').textContent = this.done.size;
  },
  set(id, html) { if (this.last[id] !== html) { this.last[id] = html; $(id).innerHTML = html; } },
  frame(f, dt, now) {
    if (f && !Cal.needed()) {
      // anclaje: tras un ataque se decide la cuerda y, hasta el siguiente, se ignoran lecturas lejanas
      // (resonancias de otras cuerdas o armónicos): así la lectura no "salta" entre notas
      if (f.onset) this.lock = null;
      if (f.pitch && !f.ignoring) {
        const m = freqToMidi(f.pitch.freq);
        let s = this.sel;
        if (this.mode === 'auto') {
          let near = 6, bd = 99; for (let k = 1; k <= 6; k++) { const d = Math.abs(m - stringMidi(k)); if (d < bd) { bd = d; near = k; } }
          s = this.lock && Math.abs(m - stringMidi(this.lock)) > 3.5 ? null : this.lock || near;
        }
        if (s != null) {
          this.lock = s;
          const cents = (m - stringMidi(s)) * 100;
          if (s !== this.cur) { this.cur = s; this.hist = []; this.hold = 0; const n = $('#tnNote'); n.classList.add('pop'); setTimeout(() => n.classList.remove('pop'), 180); }
          this.hist.push(cents); if (this.hist.length > 5) this.hist.shift();
          const sorted = [...this.hist].sort((a, b) => a - b), c = sorted[sorted.length >> 1];
          this.target = clamp(c, -50, 50); this.cents = c; this.freq = f.pitch.freq; this.heard = Math.round(m);
          this.lastSeen = now; this.live = true;
          if (Math.abs(c) <= 5) {
            this.hold += dt;
            if (this.hold >= 1 && !this.done.has(s)) { this.done.add(s); this.renderStrings(); }
          } else this.hold = Math.max(0, this.hold - dt * 2);
        }
      }
      this.level += ((f.level || 0) - this.level) * 0.3;
    }
    if (now - this.lastSeen > 700) { this.live = false; this.hist = []; this.hold = 0; this.target = 0; if (now - this.lastSeen > 1500) this.lock = null; }
    this.shown += (this.target - this.shown) * Math.min(1, dt * 14);
    $('#needle').style.left = (50 + this.shown) + '%';
    const inTune = this.live && Math.abs(this.cents) <= 5;
    const g = $('#gauge'); g.classList.toggle('live', this.live); g.classList.toggle('in', inTune);
    const s = this.live ? this.cur : this.mode === 'manual' ? this.sel : null;
    this.set('#tnNote', s ? `${pcName(stringMidi(s))}<small>${s}ª</small>` : '—');
    $('#tnNote').style.color = inTune ? 'var(--ok)' : '';
    // la cuerda que suena vibra
    this.phase += dt * 38;
    $$('#tnStrings .str').forEach((row) => {
      const rs = +row.dataset.s, active = this.live && rs === this.cur;
      row.classList.toggle('active', active);
      if (!active) return;
      const amp = clamp(this.level * 900, 1.5, 10), path = row.querySelector('path');
      let d = 'M0 13'; for (let x = 8; x <= 400; x += 8) { const env = Math.sin(Math.PI * x / 400); d += ` L${x} ${(13 + amp * env * Math.sin(this.phase + x / 26)).toFixed(1)}`; }
      path.setAttribute('d', d); path.setAttribute('stroke', inTune ? PAL.ok : PAL.text);
      row.querySelector('.info').textContent = inTune ? 'Bien' : `${this.cents > 0 ? '+' : ''}${Math.round(this.cents)}`;
    });
    if (this.live) {
      this.set('#tnFreq', `${fmt(this.freq)} Hz`);
      const off = Math.abs(this.cents) > 100 ? `suena ${pcName(this.heard)}${octave(this.heard)}, muy lejos de ${pcName(stringMidi(this.cur))}` : `${this.cents > 0 ? '+' : ''}${Math.round(this.cents)} cents`;
      this.set('#tnSub', `${this.cur}ª cuerda · ${off}`);
      const far = Math.abs(this.cents) > 50 ? ' bastante' : '';
      this.set('#tnHint', inTune ? `<span style="color:var(--ok)">${icon('checkbox-circle-fill')}</span><span style="color:var(--ok)">${this.done.has(this.cur) ? 'Afinada' : 'Mantén… casi está'}</span>`
        : this.cents < 0 ? `${icon('arrow-up-line')}<span>Grave: aprieta la clavija${far}</span>`
        : `${icon('arrow-down-line')}<span>Aguda: afloja la clavija${far}</span>`);
    } else {
      this.set('#tnFreq', '');
      this.set('#tnSub', this.mode === 'manual' ? `Pulsa la ${this.sel}ª cuerda al aire` : 'Pulsa una cuerda al aire');
      this.set('#tnHint', this.done.size === 6 ? `<span style="color:var(--ok)">${icon('checkbox-circle-fill')}</span><span style="color:var(--ok)">¡Guitarra afinada!</span>` : '');
    }
  },
};

/* ============================================================
   Acordes: aprender uno cada vez y comprobarlo cuerda a cuerda
   (con audio real, una cuerda suelta se reconoce mucho mejor que un rasgueo completo)
   ============================================================ */
const CHORD_ORDER = CHORD_GROUPS.flatMap((g) => g.ids);
const GUIDE = [
  { t: 'Sujeta la guitarra', d: 'Siéntate con la espalda recta y apoya la guitarra en la pierna derecha, con el mástil un poco hacia arriba. El <b>pulgar izquierdo va detrás del mástil</b>, más o menos detrás del dedo medio.' },
  { t: 'Tus dedos tienen número', d: 'Los diagramas usan números: 1 índice, 2 medio, 3 anular y 4 meñique. En Traste cada dedo tiene <b>siempre el mismo color</b>.', art: 'hand' },
  { t: 'Cómo pisar una cuerda', d: 'Con la <b>punta del dedo</b>, justo <b>detrás del traste</b> (no encima). Arquea el dedo como si sujetaras una pelota pequeña para no rozar las cuerdas de al lado. Mejor con las uñas cortas.' },
  { t: 'Cómo leer un diagrama', d: 'Las líneas verticales son las cuerdas: la <b>6ª, la más gruesa, a la izquierda</b>. Las horizontales son los trastes. El número es el dedo. <b>O</b>: cuerda al aire. <b>✕</b>: no la toques.', art: 'diagram' },
  { t: 'Comprueba cuerda a cuerda', d: 'Con el acorde puesto, toca <b>cada cuerda por separado</b>. Si una suena apagada, algún dedo la roza o no aprieta bien. Es lo que hacen los profesores, y Traste te lo dice nota a nota.' },
  { t: 'Cómo practicar', d: 'Mejor <b>10 minutos cada día</b> que una hora a la semana. Es normal que las yemas duelan la primera semana. Coloca los dedos, rasguea, quita la mano y repite: así la mano aprende la forma.' },
];
const Lessons = {
  cur: null, check: null, drill: null, reviewId: null, reveal: false, res: {},
  init() {
    const saved = store.get('lesson', null);
    this.cur = saved && (saved === 'guia' || CHORDS[saved]) ? saved : (Object.keys(state.learned).length ? (CHORD_ORDER.find((x) => !state.learned[x]) || 'Em') : 'guia');
    $('#lessonPath').addEventListener('click', (e) => { const b = e.target.closest('[data-lesson]'); if (b) this.go(b.dataset.lesson); });
    $('#lessonBody').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const a = b.dataset.act, id = this.chordId();
      if (a === 'go') this.go(b.dataset.id);
      if (a === 'hear') AudioEngine.strum(chordNotes(CHORDS[id]), 'D');
      if (a === 'arp') [...chordNotes(CHORDS[id])].sort((x, y) => y.string - x.string).forEach((n, i) => AudioEngine.pluck(midiToFreq(n.midi), i * 0.34, 0.45));
      if (a === 'check') this.startCheck();
      if (a === 'stopcheck') { this.check = null; this.res = {}; this.renderBody(); }
      if (a === 'got') { state.learned[id] = true; store.set('learned', state.learned); this.renderPath(); this.check = null; this.res = {}; this.renderBody(); }
      if (a === 'reveal') { this.reveal = true; this.renderBody(); }
      if (a === 'another') { this.pickReview(); this.renderBody(); }
      if (a === 'drill') this.startDrill();
      if (a === 'stopdrill') this.stopDrill(false);
    });
    $('#lessonBody').addEventListener('change', (e) => { if (e.target.id === 'drillWith') store.set('drillWith', e.target.value); });
    this.render();
  },
  learnedList() { return CHORD_ORDER.filter((x) => state.learned[x]); },
  chordId() { return this.cur === 'repaso' ? this.reviewId : this.cur; },
  nextId() { const i = CHORD_ORDER.indexOf(this.cur); return CHORD_ORDER.find((x, k) => k > i && !state.learned[x]) || CHORD_ORDER[Math.min(i + 1, CHORD_ORDER.length - 1)]; },
  pickReview() { const l = this.learnedList().filter((x) => x !== this.reviewId); this.reviewId = l[Math.floor(Math.random() * l.length)] || this.learnedList()[0]; this.reveal = false; this.check = null; this.res = {}; },
  go(id) {
    this.stopDrill(false); this.check = null; this.res = {};
    this.cur = id; if (id !== 'repaso') store.set('lesson', id); else this.pickReview();
    this.render();
    $('#lessonPath [aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    const top = $('#lessonPath').getBoundingClientRect().top + window.scrollY - 90;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  },
  render() { this.renderPath(); this.renderBody(); },
  renderPath() {
    const n = this.learnedList().length;
    $('#learnedCount').textContent = n ? `${n} de ${CHORD_ORDER.length} aprendidos` : '';
    $('#lessonPath').innerHTML = `<button type="button" data-lesson="guia" aria-current="${this.cur === 'guia'}">${icon('book-open-line')}Primeros pasos</button>` +
      (n >= 2 ? `<button type="button" data-lesson="repaso" aria-current="${this.cur === 'repaso'}">${icon('shuffle-line')}Repaso</button>` : '') + '<span class="sep"></span>' +
      CHORD_ORDER.map((id) => `<button type="button" data-lesson="${id}" class="${state.learned[id] ? 'learned' : ''}" aria-current="${this.cur === id}" title="${chordLongName(id)}${CHORDS[id].variant ? ' · ' + CHORDS[id].variant : ''}">${chordLabel(id)}${CHORDS[id].variant ? '<small class="font-medium opacity-60">fácil</small>' : ''}</button>`).join('');
  },
  renderBody() {
    if (this.cur === 'guia') {
      $('#lessonBody').innerHTML = `<div class="guide-grid">${GUIDE.map((g, i) => `
        <div class="guide-card">
          <h3><span class="n">${i + 1}</span>${g.t}</h3>
          ${g.art === 'hand' ? `<div class="flex justify-center py-1">${handSVG(new Set([1, 2, 3, 4]), 130)}</div>${fingerLegend()}` : ''}
          ${g.art === 'diagram' ? `<div class="diagram">${chordDiagram(CHORDS.Am)}</div>` : ''}
          <p>${g.d}</p>
        </div>`).join('')}</div>
        <div class="flex justify-center mt-7"><button type="button" class="btn btn-primary btn-lg" data-act="go" data-id="${CHORD_ORDER[0]}">Empezar con ${chordLabel(CHORD_ORDER[0])}${icon('arrow-right-line')}</button></div>`;
      return;
    }
    const review = this.cur === 'repaso', id = this.chordId(), c = CHORDS[id], notes = chordNotes(c);
    const idx = CHORD_ORDER.indexOf(id), group = CHORD_GROUPS.find((g) => g.ids.includes(id))?.name || '';
    const used = new Set(c.fingers.filter(Boolean));
    const steps = [...used].sort().map((f) => {
      const where = c.barre && c.barre.finger === f
        ? `estirado sobre el traste ${c.barre.fret}, pisando de la ${c.barre.from}ª a la ${c.barre.to}ª cuerda (cejilla)`
        : notes.filter((n) => n.finger === f).map((n) => `en la <b>${n.string}ª cuerda</b>, traste ${n.fret}`).join(' y ');
      return `<li><span class="fdot" style="background:${fingerVar(f)}">${f}</span><span><b>${FINGERS[f].n}</b> ${where}</span></li>`;
    });
    const first = Math.max(...notes.map((n) => n.string));
    const muted = [6, 5, 4, 3, 2, 1].filter((s) => !notes.some((n) => n.string === s));
    steps.push(`<li><span class="fdot strum">${icon('arrow-down-line')}</span><span><b>Rasguea</b> hacia abajo desde la ${first === 6 ? '6ª cuerda (suenan todas)' : `${first}ª cuerda`}</span></li>`);
    if (muted.length) steps.push(`<li><span class="fdot mute">${icon('close-line')}</span><span><b>No toques</b> la ${ordinalList(muted.sort((a, b) => a - b))} cuerda</span></li>`);
    const hidden = review && !this.reveal && !this.check;
    const learned = !!state.learned[id], nx = this.nextId();
    const drillWith = this.drillPartner(id);
    $('#lessonBody').innerHTML = `
      <div class="stage lesson">
        <div class="lesson-head">
          <div class="min-w-0">
            <div class="eyebrow">${review ? 'Repaso · colócalo de memoria' : `Acorde ${idx + 1} de ${CHORD_ORDER.length} · ${group}`}</div>
            <div class="chord-name">${chordLabel(id)}<small>${chordLabel(id, state.notation === 'latin' ? 'letter' : 'latin')} · ${chordLongName(id)}${c.variant ? ' · ' + c.variant : ''}</small></div>
          </div>
          <div class="flex gap-2">
            <button type="button" class="btn btn-soft btn-sm" data-act="hear">${icon('volume-up-line')}Escuchar</button>
            <button type="button" class="btn btn-soft btn-sm" data-act="arp">${icon('music-2-line')}Nota a nota</button>
          </div>
        </div>
        ${hidden ? `<div class="mt-6 flex flex-wrap gap-2"><button type="button" class="btn btn-soft" data-act="reveal">${icon('eye-line')}Ver el diagrama</button></div>` : `
        <div class="lesson-grid">
          <div class="diagram" id="chordDiagram">${chordDiagram(c, this.res)}</div>
          <div class="flex flex-col gap-6 min-w-0">
            <ol class="steps-list">${steps.join('')}</ol>
            <div class="tip">${icon('lightbulb-line')}<span>${c.tip}</span></div>
          </div>
        </div>`}
        ${this.check ? this.checkHTML() : `
        <div class="lesson-actions">
          <button type="button" class="btn btn-primary" data-act="check">${icon('mic-line')}Comprobar cuerda a cuerda</button>
          ${review ? `<button type="button" class="btn btn-soft" data-act="another">${icon('shuffle-line')}Otro acorde</button>`
            : learned ? `<span class="muted text-sm flex items-center gap-1.5">${icon('checkbox-circle-fill', 'text-[var(--ok)]')}Aprendido</span>${nx !== id ? `<button type="button" class="btn btn-soft" data-act="go" data-id="${nx}">Siguiente: ${chordLabel(nx)}${icon('arrow-right-line')}</button>` : ''}`
            : `<button type="button" class="btn btn-soft" data-act="got">${icon('check-line')}Lo tengo</button>`}
        </div>`}
      </div>
      ${!review && drillWith ? `<div class="stage drill" id="drill">${this.drillHTML(id, drillWith)}</div>` : ''}`;
  },
  // ---------- comprobación cuerda a cuerda ----------
  async startCheck() {
    if (!(await micReady())) return;
    const notes = chordNotes(CHORDS[this.chordId()]).sort((a, b) => b.string - a.string);
    this.check = { notes, i: 0, fails: 0, msg: '', sub: '', kind: '', done: false };
    this.res = {}; this.updateCheck();
  },
  checkHTML() {
    const ck = this.check, played = new Set(ck.notes.map((n) => n.string));
    const cur = ck.notes[ck.i];
    const pills = [6, 5, 4, 3, 2, 1].map((s) => {
      const st = !played.has(s) ? 'skip' : this.res[s] === 'ok' ? 'ok' : this.res[s] === 'bad' && !(cur && cur.string === s) ? 'bad' : cur && cur.string === s ? (this.res[s] === 'bad' ? 'bad' : 'now') : '';
      return `<div class="cs ${st}"><b>${!played.has(s) ? '✕' : st === 'ok' ? icon('check-line') : pcName(OPEN_MIDI[6 - s] + ck.notes.find((n) => n.string === s).fret)}</b>${s}ª</div>`;
    }).join('');
    const msg = ck.done ? (ck.fails ? 'Corregido: ya suenan todas.' : '¡Todas las cuerdas suenan limpias!') : ck.msg || `Toca solo la ${cur.string}ª cuerda`;
    const sub = ck.done ? 'Ahora rasguéalo entero, quita la mano y vuelve a colocarla unas cuantas veces.' : ck.sub || 'Con el acorde puesto. Déjala sonar.';
    return `<div class="check" id="checkPanel">
      <div class="check-strings">${pills}</div>
      <div class="check-msg" style="color:${ck.kind === 'bad' ? 'var(--bad)' : ck.done ? 'var(--ok)' : ''}">${msg}<p>${sub}</p></div>
      <div class="flex gap-2 mt-3">${ck.done ? `<button type="button" class="btn btn-soft btn-sm" data-act="check">${icon('restart-line')}Otra vez</button>${!state.learned[this.chordId()] && this.cur !== 'repaso' ? `<button type="button" class="btn btn-primary btn-sm" data-act="got">${icon('check-line')}Lo tengo</button>` : ''}` : ''}<button type="button" class="btn btn-ghost btn-sm" data-act="stopcheck">Terminar</button></div>
    </div>`;
  },
  updateCheck() {
    const cur = this.check.notes[this.check.i];
    if (cur && !this.check.done && this.res[cur.string] !== 'bad') this.res = { ...this.res, [cur.string]: 'now' };
    this.renderBody();
  },
  frameCheck(f) {
    const ck = this.check, a = f.attack;
    if (!ck || ck.done || !a || a.used) return;
    const cur = ck.notes[ck.i], got = attackNotes(a);
    if (got.some((m) => sameNote(m, cur.midi))) {
      a.used = true; this.res = { ...this.res, [cur.string]: 'ok' }; ck.i++; ck.kind = ''; ck.msg = ''; ck.sub = '';
      if (ck.i >= ck.notes.length) ck.done = true;
      this.updateCheck(); return;
    }
    if (!a.settled) return;
    a.used = true;
    // las cuerdas ya comprobadas siguen sonando: si lo que se oye es una de ellas, no es un error
    const ringing = ck.notes.slice(0, ck.i).map((n) => n.midi);
    if (got.every((m) => ringing.some((r) => sameNote(m, r)))) return;
    // solo se dice "suena X" si lo confirman los dos detectores (primera lectura y lo que aparece)
    if (a.flux == null || a.yin == null || !sameNote(a.yin, a.flux) || ringing.some((r) => sameNote(a.flux, r))) { ck.kind = ''; ck.msg = `No la he oído clara: toca otra vez la ${cur.string}ª`; ck.sub = 'Una sola cuerda, y deja que suene.'; this.updateCheck(); return; }
    const heard = a.flux; ck.fails++; ck.kind = 'bad'; this.res = { ...this.res, [cur.string]: 'bad' };
    ck.msg = `Suena ${pcName(heard)} y debería sonar ${pcName(cur.midi)}`;
    ck.sub = cur.fret === 0 ? 'Algún dedo pisa o roza esta cuerda: arquéalos más.'
      : heard > cur.midi ? `Suena más agudo: el dedo ${cur.finger} va en el traste ${cur.fret}.` : `Suena más grave: aprieta con la punta del dedo ${cur.finger}, justo detrás del traste ${cur.fret}.`;
    this.updateCheck();
  },
  // ---------- cambios en un minuto (cuenta rasgueos) ----------
  drillPartner(id) {
    const saved = store.get('drillWith', null);
    if (saved && saved !== id && CHORDS[saved]) return saved;
    const l = this.learnedList().filter((x) => x !== id);
    if (l.length) return l[l.length - 1];
    const i = CHORD_ORDER.indexOf(id); return i > 0 ? CHORD_ORDER[i - 1] : null;
  },
  drillHTML(id, w) {
    const d = this.drill;
    const best = store.get(`1min:${[id, w].sort().join('-')}`, 0);
    if (d) {
      return `<div><div class="eyebrow">Cambios en un minuto</div><div class="big num" id="drillCount">${d.count}</div></div>
        <div class="flex-1 min-w-[180px]"><div class="text-lg font-semibold">Ahora: <span id="drillNow">${chordLabel(d.count % 2 === 0 ? d.a : d.b)}</span></div><div class="muted text-sm">Un rasgueo en cada acorde y cambia · <span class="num" id="drillTime">1:00</span></div></div>
        <button type="button" class="btn btn-soft" data-act="stopdrill">Parar</button>`;
    }
    const opts = CHORD_ORDER.filter((x) => x !== id).map((x) => `<option value="${x}" ${x === w ? 'selected' : ''}>${chordLabel(x)}</option>`).join('');
    return `<div class="flex-1 min-w-[220px]"><div class="font-semibold text-[16px]">Cambios en un minuto</div><div class="muted text-sm">Alterna ${chordLabel(id)} con otro acorde: un rasgueo en cada uno. Cuento los rasgueos.${best ? ` Tu récord: ${best}.` : ''}</div></div>
      <label class="flex items-center gap-2 text-sm muted">con <select id="drillWith">${opts}</select></label>
      <button type="button" class="btn btn-soft" data-act="drill">${icon('timer-line')}Empezar</button>`;
  },
  async startDrill() {
    if (!(await micReady())) return;
    const id = this.chordId(), w = $('#drillWith')?.value || this.drillPartner(id);
    store.set('drillWith', w);
    this.drill = { a: id, b: w, count: 0, end: performance.now() + 60000 };
    $('#drill').innerHTML = this.drillHTML(id, w);
  },
  stopDrill(finished) {
    const d = this.drill; if (!d) return;
    this.drill = null;
    if (finished) {
      const key = `1min:${[d.a, d.b].sort().join('-')}`, best = store.get(key, 0);
      if (d.count > best) store.set(key, d.count);
      toast(d.count > best ? `¡Nuevo récord: ${d.count} cambios!` : `${d.count} cambios. Tu récord es ${best}.`, 5000, 'timer-line');
    }
    if ($('#drill')) $('#drill').innerHTML = this.drillHTML(d.a, d.b);
  },
  frame(f, now) {
    const d = this.drill;
    if (d) {
      const left = Math.max(0, d.end - now), t = $('#drillTime');
      if (t) t.textContent = `0:${String(Math.ceil(left / 1000)).padStart(2, '0')}`;
      if (left <= 0) { this.stopDrill(true); return; }
      if (f && f.onset && !f.ignoring) { d.count++; $('#drillCount').textContent = d.count; $('#drillNow').textContent = chordLabel(d.count % 2 === 0 ? d.a : d.b); }
    }
    if (f && this.check && !Cal.needed()) this.frameCheck(f);
  },
};

/* ============================================================
   Canciones: catálogo y reproductor
   ============================================================ */
const LEVELS = { easy: 'Fácil', hard: 'Difícil' };
const LEVEL_HINT = { easy: 'melodía', hard: 'acordes' };
// Velocidades pensadas para aprender: la mitad para descifrar, 3/4 para practicar, la real y un reto
const SPEEDS = [{ n: 'Muy lento', p: 0.5 }, { n: 'Lento', p: 0.75 }, { n: 'Normal', p: 1 }, { n: 'Rápido', p: 1.2 }];
// Puntos: perfecto 100, pronto/tarde 50, y la racha multiplica (×2 desde 10, ×3 desde 20, ×4 desde 30).
// Estrellas por precisión: perfecto cuenta 1, pronto/tarde 0,5 y fallo 0 (40 %, 65 % y 85 %).
const WIN = { note: 0.25, notePerfect: 0.08, chord: 0.3, chordPerfect: 0.12 };
const STAR_AT = [0.4, 0.65, 0.85];
const songChords = (s) => [...new Set(parseChordBars(s.chords, s.bpb, 0).map((c) => c.chord))];
const starsFor = (acc) => STAR_AT.filter((t) => acc >= t).length;
const miniStars = (n) => `<span class="mini-stars">${[1, 2, 3].map((k) => icon('star-fill', k <= n ? 'on' : '')).join('')}</span>`;

const Songs = {
  q: '', cat: 'all', known: false,
  init() {
    $('#songSearch').addEventListener('input', (e) => { this.q = e.target.value; this.renderList(); });
    $('#songFilters').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]'); if (b) { this.cat = b.dataset.cat; this.render(); }
      if (e.target.closest('[data-known]')) { this.known = !this.known; this.render(); }
    });
    $('#songGrid').addEventListener('click', (e) => { const r = e.target.closest('[data-song]'); if (r) Player.open(SONGS.find((s) => s.id === r.dataset.song)); });
    $('#songGrid').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.song) { e.preventDefault(); e.target.click(); } });
    this.render();
  },
  render() {
    const nKnown = Object.keys(state.learned).length;
    $('#songFilters').innerHTML = [{ id: 'all', name: 'Todas' }, ...SONG_CATS].map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${this.cat === c.id}">${c.name}</button>`).join('') +
      `<button type="button" class="chip" data-known aria-pressed="${this.known}" ${nKnown ? '' : 'disabled title="Aprende algún acorde primero"'}>${icon('hand')}Con acordes que ya sé</button>`;
    this.renderList();
  },
  renderList() {
    const q = norm(this.q.trim());
    const list = SONGS.filter((s) => (this.cat === 'all' || s.cat === this.cat)
      && (!q || norm(s.title + ' ' + s.origin).includes(q))
      && (!this.known || songChords(s).every((c) => state.learned[c])));
    $('#songGrid').innerHTML = list.length ? list.map((s) => {
      const b = (l) => state.best[`${s.id}:${l}`];
      return `<div class="song-row" role="button" tabindex="0" data-song="${s.id}">
        <div class="art">${s.title.replace(/^[¿¡]/, '')[0]}</div>
        <div class="min-w-0"><h3>${s.title}</h3><div class="meta">${s.origin} · ${songChords(s).map((c) => chordLabel(c)).join(' ')}</div></div>
        <div class="best"><span class="dots" title="Dificultad">${[1, 2, 3].map((k) => `<i class="${k <= s.stars ? 'on' : ''}"></i>`).join('')}</span>
          <span>Fácil ${miniStars(b('easy')?.stars || 0)}</span><span>Difícil ${miniStars(b('hard')?.stars || 0)}</span></div>
      </div>`;
    }).join('') : `<div class="empty">No hay canciones con esos filtros.</div>`;
  },
};

const Player = {
  song: null, built: null, level: 'easy', events: [], status: 'idle', demo: false, beat: 0, speedIdx: 1, wait: false, metro: false,
  idx: 0, combo: 0, maxCombo: 0, points: 0, check: null, lastHitMidi: null, frozen: false, curIdx: -1, ctx: null, W: 0, H: 0,
  flash: null, stats: null, drag: null, inertia: null, resumeTimer: 0, scrubbing: false, attackBeats: new Map(), deltas: [],
  init() {
    this.canvas = $('#hw'); this.ctx = this.canvas.getContext('2d');
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    $('#plBack').addEventListener('click', () => this.close());
    $('#plPlay').addEventListener('click', () => this.togglePlay());
    $('#plDemo').addEventListener('click', () => (this.status === 'playing' && this.demo ? this.pause() : this.status === 'paused' && this.demo ? this.togglePlay() : this.start(true)));
    $('#plRestart').addEventListener('click', () => this.start(false));
    $('#plLevel').addEventListener('click', (e) => { const b = e.target.closest('[data-l]'); if (b) this.setLevel(b.dataset.l); });
    $('#plSpeed').addEventListener('input', (e) => this.setSpeed(+e.target.value));
    $('#plSpeedLabels').innerHTML = SPEEDS.map((s, i) => `<span data-i="${i}" class="${s.p === 1 ? 'normal' : ''}" style="left:${(i / 3) * 100}%">${s.n}</span>`).join('');
    $('#plSpeedLabels').addEventListener('click', (e) => { const s = e.target.closest('[data-i]'); if (s) this.setSpeed(+s.dataset.i); });
    $('#plWait').addEventListener('change', (e) => { this.wait = e.target.checked; this.reset(); });
    $('#plMetro').addEventListener('change', (e) => { this.metro = e.target.checked; });
    $('#plFingersBtn').addEventListener('click', () => this.showFingers($('#plFingersBtn').getAttribute('aria-expanded') !== 'true', true));
    $('#resAgain').addEventListener('click', () => { closeModal('#resModal'); this.start(false); });
    $('#resNext').addEventListener('click', () => { closeModal('#resModal'); this.setLevel('hard'); });
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e, true));
    document.addEventListener('keydown', (e) => {
      if ($('#player').hidden || state.view !== 'canciones' || e.target.closest('input,textarea,select,button')) return;
      if (e.code === 'Space') { e.preventDefault(); this.togglePlay(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); this.seekTo(this.beat + (e.key === 'ArrowLeft' ? -1 : 1) * this.song.bpb); }
    });
    this.showFingers(store.get('fingers', window.innerWidth >= 900), false);
  },
  showFingers(on, save) {
    $('#plFingersBtn').setAttribute('aria-expanded', String(on)); $('#plDetails').hidden = !on;
    if (save) store.set('fingers', on);
    this.curIdx = -1; if (this.song) this.renderNow();
  },
  open(song) {
    this.song = song; this.built = buildSong(song, CHORDS);
    $('#plLevel').innerHTML = Object.keys(LEVELS).map((l) => `<button type="button" data-l="${l}">${LEVELS[l]}<span class="hidden sm:inline font-medium opacity-60"> · ${LEVEL_HINT[l]}</span></button>`).join('');
    $('#plTitle').textContent = song.title; $('#plOrigin').textContent = `${song.origin} · ${song.bpm} ppm · ${song.bpb}/4`;
    $('#songList').hidden = true; $('#player').hidden = false;
    window.scrollTo({ top: 0 });
    this.setSpeed(store.get('speed', 1));
    this.setLevel(store.get('lvl:' + song.id, 'easy'));
    this.resize(); Cal.sync();
  },
  close() { this.pause(); $('#player').hidden = true; $('#songList').hidden = false; Songs.render(); },
  setLevel(l) {
    if (!this.built.levels[l]) l = 'easy';
    this.level = l; store.set('lvl:' + this.song.id, l);
    $$('#plLevel button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.l === l)));
    this.reset();
  },
  setSpeed(i) {
    this.speedIdx = clamp(i, 0, 3); store.set('speed', this.speedIdx);
    const sp = $('#plSpeed'); sp.value = this.speedIdx; sp.setAttribute('aria-valuetext', SPEEDS[this.speedIdx].n);
    $$('#plSpeedLabels span').forEach((s) => s.classList.toggle('on', +s.dataset.i === this.speedIdx));
  },
  bps() { return (this.song.bpm * SPEEDS[this.speedIdx].p) / 60; },
  firstT() { return this.events[0]?.t ?? 0; },
  startBeat() { return this.firstT() - Math.max(2, Math.round(3 * this.bps())) - 0.001; }, // ~3 s de cuenta atrás
  isChord: (e) => !!(e.chord || e.notes.length > 1),
  reset() {
    clearTimeout(this.resumeTimer); this.inertia = null; this.scrubbing = false;
    this.events = this.built.levels[this.level].map((e) => ({ ...e, st: 0, hitAt: 0, kind: '' }));
    Object.assign(this, { status: 'idle', demo: false, beat: this.startBeat(), idx: 0, combo: 0, maxCombo: 0, points: 0, check: null, lastHitMidi: null, frozen: false, curIdx: -1, flash: null, deltas: [], stats: { perfect: 0, early: 0, late: 0, miss: 0, wrong: 0 } });
    this.attackBeats = new Map();
    this.renderHud(); this.renderButtons(); this.renderNow();
  },
  async start(demo) { // siempre desde el principio
    AudioEngine.ensure();
    if (!demo && !(await micReady())) return;
    this.reset(); this.demo = demo; this.status = 'playing'; this.renderButtons();
  },
  async togglePlay() {
    if (this.status === 'playing') return this.pause();
    if (this.status === 'paused') {
      AudioEngine.ensure();
      if (!this.demo && !(await micReady())) return;
      this.status = 'playing'; this.renderButtons(); return;
    }
    return this.start(false);
  },
  pause() { clearTimeout(this.resumeTimer); if (this.status === 'playing') { this.status = 'paused'; this.renderButtons(); } },
  renderButtons() {
    const playing = this.status === 'playing';
    $('#plPlay').innerHTML = icon(playing && !this.demo ? 'pause-fill' : 'play-fill');
    $('#plPlay').setAttribute('aria-label', playing && !this.demo ? 'Pausa' : 'Tocar');
    $('#plDemo').innerHTML = playing && this.demo ? `${icon('pause-fill')}<span class="hidden sm:inline">Parar</span>` : `${icon('headphone-line')}<span class="hidden sm:inline">Escuchar</span>`;
  },
  mult() { return this.combo >= 30 ? 4 : this.combo >= 20 ? 3 : this.combo >= 10 ? 2 : 1; },
  renderHud() {
    const practice = this.wait;
    const hits = this.events.filter((e) => e.st === 1).length, total = this.events.filter((e) => e.st !== 2).length;
    $('#plScore').textContent = practice ? `${hits}/${total}` : this.points.toLocaleString('es-ES');
    $('#plScoreLbl').textContent = practice ? 'práctica' : `racha ${this.combo}`;
    const m = $('#plMult'), k = this.mult();
    m.hidden = practice;
    if (m.textContent !== `×${k}`) { m.textContent = `×${k}`; m.className = `mult m${k}`; if (k > 1) { m.classList.add('bump'); setTimeout(() => m.classList.remove('bump'), 220); } }
  },
  currentIndex() {
    if (this.status === 'playing' && !this.demo) return Math.min(this.idx, this.events.length - 1);
    const i = this.events.findIndex((e) => e.t + (this.demo ? e.dur : 0) > this.beat - 0.05);
    return i < 0 ? this.events.length - 1 : i;
  },
  renderNow() {
    const i = this.currentIndex(); if (i === this.curIdx) return; this.curIdx = i;
    const e = this.events[i], nx = this.events[i + 1];
    $('#plNowText').innerHTML = e ? this.describe(e) : '';
    $('#plNext').innerHTML = nx ? `Después: ${this.describe(nx, true)}` : 'Es la última';
    if (!$('#plDetails').hidden) {
      $('#plFret').innerHTML = fretboardSVG(e);
      const fingers = new Set((e ? (e.chord ? chordNotes(CHORDS[e.chord]) : e.notes) : []).map((n) => n.finger).filter(Boolean));
      $('#plHand').innerHTML = handSVG(fingers, 140) + fingerLegend(fingers);
    }
  },
  describe(e, short) {
    if (this.isChord(e)) {
      const name = e.chord ? chordLabel(e.chord) : 'acorde';
      return short ? `${name} ${e.dir === 'U' ? '↑' : '↓'}` : `${icon(e.dir === 'U' ? 'arrow-up-line' : 'arrow-down-line')} <b>${name}</b> · rasguea hacia ${e.dir === 'U' ? 'arriba' : 'abajo'}`;
    }
    const n = e.notes[0];
    if (short) return `${pcName(n.midi)} (${n.string}ª${n.fret ? `, traste ${n.fret}` : ' al aire'})`;
    const dot = n.fret ? `<span class="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1" style="background:${fingerVar(n.finger)}"></span>` : '';
    return `<b>${pcName(n.midi)}</b> · ${n.string}ª cuerda ${n.fret ? `· traste ${n.fret} · ${dot}dedo ${n.finger}` : 'al aire'}`;
  },
  // ---------- tocar / arrastrar ----------
  ppb() { return this.W < 640 ? 70 : 116; },
  onDown(e) {
    if (e.button > 0) return;
    clearTimeout(this.resumeTimer);
    const wasPlaying = this.drag?.wasPlaying || this.inertia?.wasPlaying || (this.scrubbing && this.scrubWasPlaying) || this.status === 'playing';
    this.inertia = null;
    this.drag = { x0: e.clientX, x: e.clientX, moved: false, wasPlaying, samples: [{ t: performance.now(), x: e.clientX }] };
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
  },
  onMove(e) {
    const d = this.drag; if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) > 7) {
      d.moved = true; this.scrubbing = true; this.scrubWasPlaying = d.wasPlaying;
      if (this.status === 'playing') { this.status = 'paused'; this.renderButtons(); }
    }
    if (d.moved) {
      this.seekTo(this.beat - (e.clientX - d.x) / this.ppb());
      const now = performance.now(); d.samples.push({ t: now, x: e.clientX });
      while (d.samples.length > 2 && now - d.samples[0].t > 90) d.samples.shift();
    }
    d.x = e.clientX;
  },
  onUp(e, cancel) {
    const d = this.drag; this.drag = null; if (!d) return;
    if (!d.moved) { this.scrubbing = false; if (!cancel) this.togglePlay(); return; }
    const s = d.samples, a = s[0], b = s[s.length - 1], dt = (b.t - a.t) / 1000;
    const vpx = dt > 0.01 && performance.now() - b.t < 80 ? (b.x - a.x) / dt : 0;
    if (Math.abs(vpx) > 80) this.inertia = { v: -vpx / this.ppb(), wasPlaying: d.wasPlaying };
    else this.settle(d.wasPlaying);
  },
  settle(wasPlaying) {
    this.inertia = null;
    if (!wasPlaying) { this.scrubbing = false; return; }
    this.resumeTimer = setTimeout(() => { this.scrubbing = false; if (this.status === 'paused') { this.status = 'playing'; this.renderButtons(); } }, 300);
  },
  seekTo(b) {
    b = clamp(b, this.startBeat(), this.built.total + 1);
    for (const e of this.events) { if (e.t >= b - 1e-6) { e.st = 0; e.kind = ''; } else if (e.st === 0) e.st = 2; }
    const i = this.events.findIndex((e) => e.st === 0);
    this.idx = i < 0 ? this.events.length : i;
    this.beat = b; this.check = null; this.frozen = false; this.combo = 0;
    if (this.status === 'idle' || this.status === 'done') { this.status = 'paused'; this.demo = false; this.renderButtons(); }
    this.renderHud(); this.renderNow();
  },
  // ---------- bucle ----------
  frame(f, dt, now) {
    if (!this.song || $('#player').hidden) return;
    if (this.inertia) {
      this.inertia.v *= Math.exp(-dt * 3.2);
      const before = this.beat; this.seekTo(this.beat + this.inertia.v * dt);
      if (Math.abs(this.inertia.v) < 0.2 || this.beat === before) this.settle(this.inertia.wasPlaying);
    }
    if (this.status === 'playing') this.advance(f, dt, now);
    this.draw(now);
  },
  advance(f, dt, now) {
    const bpb = this.song.bpb, bps = this.bps(), first = this.firstT();
    let next = this.beat + dt * bps;
    this.frozen = false;
    if (!this.demo && this.wait) {
      const e = this.events[this.idx];
      if (e && next >= e.t) { next = Math.max(this.beat, e.t); this.frozen = true; }
    }
    for (let b = Math.floor(this.beat) + 1; b <= next; b++) {
      if (b < first || this.metro) AudioEngine.click((((b - this.built.pickup) % bpb) + bpb) % bpb === 0);
    }
    if (this.demo) {
      Mic.ignoreFor(1500);
      for (const e of this.events) if (e.t > this.beat && e.t <= next) {
        if (this.isChord(e)) AudioEngine.strum(e.notes, e.dir || 'D');
        else AudioEngine.pluck(midiToFreq(e.notes[0].midi), 0, 0.55);
      }
    }
    this.beat = next;
    if (!this.demo) this.judge(f, now, bps);
    this.renderNow();
    const last = this.events[this.events.length - 1];
    const doneAll = this.demo ? this.beat > this.built.total + 0.5 : this.idx >= this.events.length && this.beat > (last?.t ?? 0) + 1;
    if (doneAll) this.finish();
  },
  say(text, color, big) { this.flash = { text, color, t: performance.now(), big }; },
  /* Juicio. Cada ataque solo puede valer para UNA nota: la primera pendiente cuya ventana lo contiene
     y cuya altura coincide. Si tocas tarde la primera de dos notas seguidas, cuenta como esa primera
     (tarde) y la segunda espera su propio ataque. */
  judge(f, now, bps) {
    if (!f) return;
    const lat = (Mic.latency() / 2) * bps; // retardo de entrada estimado, en tiempos
    const winB = (e) => (this.isChord(e) ? WIN.chord : WIN.note) * bps;
    if (f.onset && f.attack) {
      this.attackBeats.set(f.attack.id, this.beat);
      // rasgueos: cada ataque abre un análisis para el primer acorde pendiente en su ventana
      const ab = this.beat - lat;
      const e = this.events.slice(this.idx, this.idx + 6).find((x) => x.st === 0 && this.isChord(x) && (this.wait && this.frozen ? x === this.events[this.idx] : Math.abs(ab - x.t) <= winB(x)));
      if (e) this.check = { a: f.attack, t0: now, beat: this.beat, e };
    }
    const analysing = this.check && now - this.check.t0 < 520;
    // un ataque a tiempo cuya nota aún se está identificando (~90 ms) no puede dar la nota por fallada
    const fa = f.attack, pendingAb = fa && !fa.used && !fa.settled ? (this.attackBeats.get(fa.id) ?? this.beat) - lat : null;
    const waiting = (e) => (analysing && this.check.e === e) || (pendingAb != null && !this.isChord(e) && Math.abs(pendingAb - e.t) <= winB(e));
    if (!this.wait) {
      while (this.events[this.idx] && (this.beat - lat - this.events[this.idx].t) > winB(this.events[this.idx]) && !waiting(this.events[this.idx])) {
        const e = this.events[this.idx]; if (e.st === 0) this.miss(e); this.idx++;
      }
    }
    if (this.check && now - this.check.t0 >= 110) {
      const { e, a } = this.check, notes = e.chord ? chordNotes(CHORDS[e.chord]) : e.notes;
      const broad = !a.fluxVec || singleNoteLikeness(a.fluxVec) < 0.62; // no es una sola cuerda
      if (e.st === 0 && broad && strumOk(Mic.semis(), hypothesesFor(notes, e.chord), fewFor(notes), notes)) {
        a.used = true; this.hit(e, this.wait && this.frozen ? e.t : this.check.beat - lat, true); this.check = null;
      } else if (now - this.check.t0 > 520) this.check = null;
    }
    // notas sueltas
    const a = f.attack;
    if (a && !a.used && (a.yin != null || a.flux != null || a.settled)) {
      const got = attackNotes(a), ab = (this.attackBeats.get(a.id) ?? this.beat) - lat;
      const cand = this.events.slice(this.idx, this.idx + 6).filter((e) => e.st === 0 && !this.isChord(e) && (this.wait && this.frozen ? e === this.events[this.idx] : Math.abs(ab - e.t) <= winB(e)));
      const e = cand.find((x) => got.some((m) => sameNote(m, x.notes[0].midi)));
      if (e) {
        a.used = true;
        for (let k = this.idx; this.events[k] !== e; k++) if (this.events[k].st === 0) this.miss(this.events[k]); // te has saltado alguna
        this.hit(e, this.wait && this.frozen ? e.t : ab, false, e.notes[0].midi);
      } else if (a.settled) {
        a.used = true;
        if (got.length && cand.length) { this.say(`Eso es ${pcName(got[0])}`, PAL.muted); if (!this.wait) { this.combo = 0; this.stats.wrong++; this.renderHud(); } }
      }
    }
    // ligados (sin ataque): la nota estable coincide con la siguiente y es distinta de la anterior
    const e = this.events[this.idx];
    if (e && e.st === 0 && !this.isChord(e) && f.stable != null && sameNote(f.stable, e.notes[0].midi) && f.stable !== this.lastHitMidi && (!a || a.used) && now - Mic.lastOnset > 300) {
      const eff = this.wait && this.frozen ? e.t : this.beat - lat;
      if (Math.abs(eff - e.t) <= winB(e)) this.hit(e, eff, false, f.stable);
    }
  },
  hit(e, atBeat, strum, midi) {
    e.st = 1; e.hitAt = performance.now(); this.lastHitMidi = midi ?? null;
    const i = this.events.indexOf(e); if (i >= this.idx) this.idx = i + 1;
    this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (this.wait) { e.kind = 'perfect'; this.stats.perfect++; this.say('¡Bien!', PAL.ok); this.renderHud(); return; }
    // un rasgueo tarda ~50 ms en recorrer las cuerdas y su ataque se detecta algo más tarde
    const d = (atBeat - e.t) / this.bps() - (strum ? 0.04 : 0);
    this.deltas.push(d);
    const perfect = Math.abs(d) <= (strum ? WIN.chordPerfect : WIN.notePerfect);
    e.kind = perfect ? 'perfect' : d < 0 ? 'early' : 'late';
    this.stats[e.kind]++;
    const before = this.mult();
    this.points += (perfect ? 100 : 50) * this.mult();
    if (this.mult() > before) this.say(`¡Racha! ×${this.mult()}`, PAL.accent, true);
    else this.say(perfect ? 'Perfecto' : d < 0 ? 'Pronto' : 'Tarde', perfect ? PAL.ok : PAL.warn);
    this.renderHud();
  },
  miss(e) {
    e.st = -1; this.stats.miss++;
    this.say(this.combo >= 10 ? 'Racha perdida' : 'Fallo', PAL.bad);
    this.combo = 0; if (this.check?.e === e) this.check = null; this.renderHud();
  },
  finish() {
    const wasDemo = this.demo;
    this.status = 'done'; this.renderButtons();
    if (wasDemo) { this.reset(); return; }
    const judged = this.events.filter((e) => e.st !== 2), st = this.stats;
    $('#resNext').hidden = this.level !== 'easy';
    if (this.wait) {
      $('#resStars').innerHTML = '';
      $('#resTitle').textContent = 'Práctica completada';
      $('#resText').textContent = `Has tocado las ${judged.length} notas. Quita «Esperarme» para tocar a tempo y puntuar.`;
      $('#resBig').innerHTML = ''; $('#resGrid').innerHTML = '';
      openModal('#resModal'); return;
    }
    const acc = judged.length ? (st.perfect + 0.5 * (st.early + st.late)) / judged.length : 0;
    const stars = starsFor(acc), key = `${this.song.id}:${this.level}`, prev = state.best[key];
    const record = !prev || this.points > prev.pts;
    state.best[key] = { stars: Math.max(stars, prev?.stars || 0), acc: Math.max(acc, prev?.acc || 0), pts: Math.max(this.points, prev?.pts || 0) };
    store.set('best2', state.best);
    const avg = this.deltas.length >= 4 ? this.deltas.reduce((a, b) => a + b, 0) / this.deltas.length : 0;
    $('#resStars').innerHTML = [1, 2, 3].map((k) => icon('star-fill', k <= stars ? 'on' : '')).join('');
    $('#resTitle').textContent = stars === 3 ? '¡Perfecto!' : stars === 2 ? '¡Muy bien!' : stars === 1 ? 'Vas por buen camino' : 'Sigue practicando';
    $('#resText').textContent = Math.abs(avg) >= 0.06 ? `Sueles ir ${avg < 0 ? 'adelantado: espera a que la bola caiga en la nota' : 'retrasado: anticípate un poco'}.` : stars < 2 ? 'Prueba más lento o activa «Esperarme».' : '';
    $('#resBig').innerHTML = `<div><b class="num">${Math.round(acc * 100)}%</b><span>precisión</span></div><div><b class="num">${this.points.toLocaleString('es-ES')}</b><span>${record ? 'puntos · récord' : 'puntos'}</span></div><div><b class="num">${this.maxCombo}</b><span>mejor racha</span></div>`;
    $('#resGrid').innerHTML = [['Perfecto', st.perfect, 'var(--ok)'], ['Pronto', st.early, 'var(--warn)'], ['Tarde', st.late, 'var(--warn)'], ['Fallo', st.miss, 'var(--bad)']]
      .map(([n, v, c]) => `<div><b class="num" style="color:${c}">${v}</b><span>${n}</span></div>`).join('');
    openModal('#resModal');
  },
  // ---------- dibujo ----------
  resize() {
    const c = this.canvas; if (!c || !c.clientWidth) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = c.clientWidth; this.H = c.clientHeight;
    c.width = Math.round(this.W * dpr); c.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },
  hexA(hex, a) { // color de la paleta con transparencia
    const h = (hex || '').replace('#', ''); if (h.length !== 6) return hex;
    return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
  },
  draw(now) {
    const c = this.ctx, W = this.W, H = this.H; if (!c || !W) return;
    const top = 74, gap = (H - top - 30) / 5, ly = (s) => top + (s - 1) * gap;
    const gutter = 46, nowX = gutter + Math.min(160, W * 0.22), ppb = this.ppb(), beat = this.beat;
    const X = (t) => nowX + (t - beat) * ppb;
    const FONT = 'Inter, system-ui, sans-serif', DISP = '"Bricolage Grotesque", Inter, sans-serif';
    c.clearRect(0, 0, W, H);
    c.fillStyle = PAL['bg-2']; c.fillRect(0, 0, W, H);
    const pulse = this.frozen ? 0.16 + 0.08 * Math.sin(now / 160) : 0.1;
    const zg = c.createLinearGradient(nowX - 28, 0, nowX + 28, 0);
    zg.addColorStop(0, this.hexA(PAL.accent, 0)); zg.addColorStop(0.5, this.hexA(PAL.accent, pulse)); zg.addColorStop(1, this.hexA(PAL.accent, 0));
    c.fillStyle = zg; c.fillRect(nowX - 28, top - 30, 56, gap * 5 + 60);
    const bpb = this.song.bpb, p = this.built.pickup;
    c.font = `500 11px ${FONT}`; c.textAlign = 'center';
    for (let b = p + Math.floor((beat - p - nowX / ppb) / bpb) * bpb; X(b) < W + 10; b += bpb) {
      const x = X(b); if (x < gutter) continue;
      c.strokeStyle = PAL.line; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, top - 22); c.lineTo(x, ly(6) + 18); c.stroke();
      const n = Math.round((b - p) / bpb) + 1; if (n >= 1) { c.fillStyle = PAL.faint; c.fillText(n, x, H - 8); }
    }
    for (let s = 1; s <= 6; s++) {
      c.strokeStyle = PAL['line-2']; c.lineWidth = 1 + (s - 1) * 0.35;
      c.beginPath(); c.moveTo(gutter, ly(s)); c.lineTo(W, ly(s)); c.stroke();
    }
    if (this.level !== 'hard') {
      c.font = `650 13px ${FONT}`; c.textAlign = 'left';
      for (const seg of this.built.chordTrack) {
        const x = X(seg.t); if (x > W || x + seg.dur * ppb < gutter) continue;
        c.fillStyle = PAL.muted; c.fillText(chordLabel(seg.chord), Math.max(gutter + 4, x + 4), 22);
      }
    }
    for (const e of this.events) {
      const x = X(e.t); if (x + e.dur * ppb < gutter - 30) continue; if (x > W + 30) break;
      c.globalAlpha = e.st === -1 ? 0.25 : e.st === 2 ? 0.16 : 1;
      if (this.isChord(e)) this.drawChord(c, e, x, ly, now); else this.drawNote(c, e, x, ly, ppb, now);
      c.globalAlpha = 1;
    }
    c.save(); c.shadowColor = PAL.accent; c.shadowBlur = 14; c.strokeStyle = PAL.accent; c.lineWidth = 2;
    c.beginPath(); c.moveTo(nowX, top - 30); c.lineTo(nowX, ly(6) + 26); c.stroke(); c.restore();
    this.drawBall(c, nowX, ly, now);
    c.fillStyle = PAL['bg-2']; c.fillRect(0, 0, gutter - 6, H);
    c.font = `650 12px ${FONT}`; c.textAlign = 'center';
    for (let s = 1; s <= 6; s++) { c.fillStyle = PAL.muted; c.fillText(pcName(stringMidi(s)), 20, ly(s) + 4); }
    if (this.flash) {
      const age = now - this.flash.t, life = this.flash.big ? 1000 : 700;
      if (age > life) this.flash = null;
      else {
        c.globalAlpha = age < life - 200 ? 1 : 1 - (age - life + 200) / 200;
        const sc = 1 + 0.25 * Math.max(0, 1 - age / 120);
        c.font = `800 ${Math.round((this.flash.big ? 19 : 16) * sc)}px ${DISP}`; c.textAlign = 'center';
        const tw = c.measureText(this.flash.text).width + 26, fx = nowX + 40 + tw / 2, fy = 40 - Math.min(age, 300) * 0.02;
        c.fillStyle = this.hexA(this.flash.color, 0.16); c.beginPath(); c.roundRect(fx - tw / 2, fy - 16, tw, 32, 16); c.fill();
        c.fillStyle = this.flash.color; c.textBaseline = 'middle'; c.fillText(this.flash.text, fx, fy + 1); c.textBaseline = 'alphabetic';
        c.globalAlpha = 1;
      }
    }
    const cx = (nowX + W) / 2;
    const banner = (title, sub) => {
      c.textAlign = 'center';
      c.font = `700 17px ${DISP}`; const w1 = c.measureText(title).width; c.font = `500 12.5px ${FONT}`; const w2 = sub ? c.measureText(sub).width : 0;
      const bw = Math.min(W - 24, Math.max(w1, w2) + 44), bh = sub ? 62 : 44, bx = clamp(cx, bw / 2 + 12, W - bw / 2 - 12);
      c.fillStyle = this.hexA(PAL.surface, 0.94); c.beginPath(); c.roundRect(bx - bw / 2, H / 2 - bh / 2, bw, bh, 18); c.fill();
      c.fillStyle = PAL.text; c.font = `700 17px ${DISP}`; c.fillText(title, bx, H / 2 + (sub ? -4 : 6));
      if (sub) { c.fillStyle = PAL.muted; c.font = `500 12.5px ${FONT}`; c.fillText(sub, bx, H / 2 + 17); }
    };
    if (this.status === 'playing' && beat < this.firstT()) {
      const n = Math.ceil(this.firstT() - beat), k = this.firstT() - beat - (n - 1);
      c.textAlign = 'center'; c.fillStyle = PAL.text; c.globalAlpha = 0.4 + 0.6 * k; c.font = `800 ${Math.round(56 + 24 * k)}px ${DISP}`; c.fillText(n, cx, H / 2 + 22); c.globalAlpha = 1;
    } else if (this.status === 'idle' || this.status === 'done') banner('Toca aquí para empezar', 'Desliza a los lados para moverte por la canción');
    else if (this.status === 'paused' && !this.scrubbing && !this.drag) banner('En pausa', 'Toca para seguir · desliza para moverte');
  },
  // Bola que salta de nota en nota y cae justo cuando hay que tocar
  drawBall(c, nowX, ly, now) {
    const ev = this.events; if (!ev.length) return;
    const yOf = (e) => (this.isChord(e) ? ly(Math.min(...e.notes.map((n) => n.string))) - 30 : ly(e.notes[0].string) - 22);
    let j = ev.findIndex((e) => e.t > this.beat + 1e-6);
    if (j < 0) j = ev.length;
    const nx = ev[j], pv = ev[j - 1];
    const t1 = nx ? nx.t : pv.t + 1, t0 = pv ? pv.t : Math.min(t1 - 1, this.beat), y1 = nx ? yOf(nx) : yOf(pv), y0 = pv ? yOf(pv) : y1;
    const span = Math.max(0.2, t1 - t0), u = clamp((this.beat - t0) / span, 0, 1);
    const hgt = clamp(16 + span * 24, 18, 60);
    let y = y0 + (y1 - y0) * u - hgt * 4 * u * (1 - u);
    if (this.frozen) y = y1 - 6 * Math.abs(Math.sin(now / 180));
    const squash = u > 0.92 || u < 0.08 ? 1.18 : 1;
    c.save();
    c.shadowColor = PAL.accent; c.shadowBlur = 16;
    c.fillStyle = PAL.text; c.beginPath(); c.ellipse(nowX, y, 8 * squash, 8 / squash, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  },
  drawDot(c, x, y, n, r) {
    if (n.fret === 0) {
      c.fillStyle = PAL['bg-2']; c.strokeStyle = PAL.open; c.lineWidth = 2.2;
      c.beginPath(); c.arc(x, y, r - 1, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = PAL.open;
    } else {
      c.fillStyle = fingerHex(n.finger); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = PAL['dot-ink'];
    }
    c.font = `750 ${r > 13 ? 14 : 12}px Inter, system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(n.fret, x, y + 0.5); c.textBaseline = 'alphabetic';
  },
  hitColor(e) { return e.kind === 'perfect' ? PAL.ok : PAL.warn; },
  drawHit(c, e, x, y, r, now) {
    if (e.st !== 1) return;
    const k = clamp((now - e.hitAt) / 450, 0, 1), col = this.hitColor(e);
    c.strokeStyle = col; c.lineWidth = 3;
    c.beginPath(); c.arc(x, y, r + 4, 0, Math.PI * 2); c.stroke();
    if (k < 1) { c.globalAlpha = 1 - k; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r + 4 + k * 24, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; }
  },
  drawNote(c, e, x, ly, ppb, now) {
    const n = e.notes[0], y = ly(n.string), len = e.dur * ppb - 22, a = c.globalAlpha;
    if (len > 4) { c.fillStyle = fingerHex(n.finger); c.globalAlpha = a * 0.25; c.beginPath(); c.roundRect(x, y - 4, len, 8, 4); c.fill(); c.globalAlpha = a; }
    this.drawDot(c, x, y, n, 15);
    this.drawHit(c, e, x, y, 15, now);
  },
  drawChord(c, e, x, ly, now) {
    const ss = e.notes.map((n) => n.string), s1 = Math.min(...ss), s2 = Math.max(...ss);
    c.fillStyle = 'rgba(128,128,140,0.08)'; c.strokeStyle = e.st === 1 ? this.hitColor(e) : PAL['line-2']; c.lineWidth = e.st === 1 ? 2.5 : 1.5;
    c.beginPath(); c.roundRect(x - 16, ly(s1) - 16, 32, ly(s2) - ly(s1) + 32, 16); c.fill(); c.stroke();
    if (e.dir !== 'U') for (let s = 1; s <= 6; s++) if (!ss.includes(s)) {
      c.strokeStyle = PAL.faint; c.lineWidth = 2; const y = ly(s);
      c.beginPath(); c.moveTo(x - 4, y - 4); c.lineTo(x + 4, y + 4); c.moveTo(x + 4, y - 4); c.lineTo(x - 4, y + 4); c.stroke();
    }
    for (const n of e.notes) this.drawDot(c, x, ly(n.string), n, 11);
    const ay = ly(s2) + 26; c.fillStyle = e.dir === 'U' ? PAL.muted : PAL.text;
    c.beginPath();
    if (e.dir === 'U') { c.moveTo(x, ay - 6); c.lineTo(x - 6, ay + 3); c.lineTo(x + 6, ay + 3); } else { c.moveTo(x, ay + 4); c.lineTo(x - 6, ay - 5); c.lineTo(x + 6, ay - 5); }
    c.fill();
    if (e.chord && e.first) { c.fillStyle = PAL.text; c.font = '750 14px Inter, system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(chordLabel(e.chord), x, 22); }
    if (e.st === 1 && now - e.hitAt < 450) { const k = (now - e.hitAt) / 450; c.globalAlpha = 1 - k; c.strokeStyle = this.hitColor(e); c.lineWidth = 2; c.beginPath(); c.roundRect(x - 16 - k * 14, ly(s1) - 16 - k * 14, 32 + k * 28, ly(s2) - ly(s1) + 32 + k * 28, 16 + k * 14); c.stroke(); c.globalAlpha = 1; }
  },
};

/* ---------- Hipótesis de acordes (caché) ---------- */
const CHORD_LIB = Object.keys(CHORDS).map((id) => [id, chordNotes(CHORDS[id])]);
const hypCache = new Map(), fewCache = new Map();
function hypothesesFor(notes, chordId, dir = 'D') {
  const key = notes.map((n) => n.string + ':' + n.midi).join(',') + dir;
  if (!hypCache.has(key)) hypCache.set(key, chordHypotheses({ notes, dir }, CHORD_LIB.filter(([id]) => id !== chordId)));
  return hypCache.get(key);
}
function fewFor(notes) {
  const key = notes.map((n) => n.midi).join(',');
  if (!fewCache.has(key)) fewCache.set(key, fewHypotheses(notes));
  return fewCache.get(key);
}

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
  if (view !== 'acordes') { Lessons.stopDrill(false); if (Lessons.check) { Lessons.check = null; Lessons.res = {}; Lessons.renderBody(); } }
  Cal.sync();
  if (view === 'canciones') requestAnimationFrame(() => Player.resize());
}

function setNotation(n) {
  state.notation = n; store.set('notation', n);
  $$('#notation button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.n === n)));
  $('#notationMobileLabel').textContent = n === 'latin' ? 'Do' : 'C';
  Tuner.setMode(Tuner.mode); Tuner.last = {}; Lessons.render(); Songs.render();
  Player.curIdx = -1; if (Player.song) Player.renderNow();
}

let lastT = performance.now();
function loop(t) {
  const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
  let f = null;
  if (Mic.on) { f = Mic.analyze(t); renderMeter(f.level); }
  try {
    Cal.frame(f, t);
    if (state.view === 'afinador') Tuner.frame(f, dt, t);
    else if (state.view === 'acordes') Lessons.frame(f, t);
    else Player.frame(f, dt, t);
  } catch (err) { console.error(err); }
  requestAnimationFrame(loop);
}

function boot() {
  hydrateIcons();
  readPalette();
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { readPalette(); Tuner.renderStrings(); });
  Tuner.init(); Lessons.init(); Songs.init(); Player.init();
  $('#notation').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setNotation(b.dataset.n); });
  $('#notationMobile').addEventListener('click', () => setNotation(state.notation === 'latin' ? 'letter' : 'latin'));
  $('#micBtn').addEventListener('click', () => (Mic.on ? Mic.stop() : ensureMic()));
  navigator.mediaDevices?.addEventListener?.('devicechange', () => { if (Mic.on) fillMicSelect(); });
  window.addEventListener('hashchange', route);
  setNotation(state.notation);
  onMicChange(); route();
  requestAnimationFrame(loop);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
