'use strict';
/* ============================================================
   Traste — aplicación (afinador, acordes, canciones)
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
  cals: store.get('cals', {}),          // calibración por micrófono
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
const ordinalList = (arr) => arr.map((s) => `${s}ª`).join(arr.length > 1 ? ' y la ' : '');
let PAL = {};
function readPalette() {
  for (const k of ['bg', 'bg-2', 'surface', 'surface-2', 'surface-3', 'line', 'line-2', 'text', 'muted', 'faint', 'accent', 'ok', 'bad', 'warn', 'f1', 'f2', 'f3', 'f4', 'open']) PAL[k] = cssVar('--' + k);
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
  // Tono de prueba: onda triangular. Aunque el altavoz no reproduzca la fundamental, la forma de onda
  // conserva el periodo y el detector sigue midiendo la nota exacta (probado hasta altavoces que cortan en 700 Hz).
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

const Mic = {
  on: false, stream: null, source: null, analyser: null, td: null, fd: null, mags: null, sr: 48000, dec: 2,
  deviceId: '', label: '', key: '',
  ignoreUntil: 0, clickUntil: 0, hist: [], lastOnset: 0, prevRound: null, stableCount: 0, specHist: [], flux: null,
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
    this.specHist = []; this.flux = null;
    this.sr = ctx.sampleRate; this.dec = Math.max(1, Math.round(this.sr / 24000));
    track.addEventListener('ended', () => { this.stop(); toast('Se ha desconectado el micrófono.'); });
    this.hist = []; this.on = true;
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
    if (!ignoring && now > this.clickUntil && level > this.gate() * 1.4 && level > prevMin * 1.5 && now - this.lastOnset > 110) { onset = true; this.lastOnset = now; }
    const midi = pitch ? freqToMidi(pitch.freq) : null;
    const rd = midi == null ? null : Math.round(midi);
    if (rd != null && rd === this.prevRound && Math.abs(midi - rd) < 0.4) this.stableCount++; else this.stableCount = rd == null ? 0 : 1;
    this.prevRound = rd;
    // "lo que aparece" tras el ataque: espectro 90 ms después − espectro justo antes
    const spec = this.shortSemis();
    this.specHist.push({ t: now, spec }); while (this.specHist.length > 6) this.specHist.shift();
    let newNoteMidi = null;
    if (onset) { const before = [...this.specHist].reverse().find((h) => h.t <= now - 30); this.flux = before ? { t0: now, before: before.spec } : null; }
    if (this.flux && now - this.flux.t0 >= 90) {
      const b = this.flux.before; this.flux = null;
      if (!ignoring) newNoteMidi = newNote(spec.map((v, i) => Math.max(0, v - b[i] * 1.1)));
    }
    return { now, level, pitch, midi, onset, ignoring, stable: this.stableCount >= 2 ? rd : null, newNote: newNoteMidi };
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

function onMicChange() {
  const b = $('#micBtn'); b.dataset.on = String(Mic.on);
  b.title = Mic.on ? `${Mic.label} · pulsa para apagarlo` : 'Activar el micrófono';
  $('#micIcon').outerHTML = icon(Mic.on ? 'mic-line' : 'mic-off-line', '').replace('<svg', '<svg id="micIcon"');
  if (!Mic.on) renderMeter(0);
  $('#tunerCta').hidden = Mic.on;
  $('#micBox').hidden = !Mic.on;
  if (Mic.on) fillMicSelect();
  Cal.sync();
  Lessons.renderBar();
}
async function fillMicSelect() {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId);
    const sel = $('#micSelect');
    sel.innerHTML = devs.map((d, i) => `<option value="${d.deviceId}">${d.label || 'Micrófono ' + (i + 1)}</option>`).join('');
    const cur = devs.find((d) => d.deviceId === Mic.deviceId) || devs.find((d) => micKey(d.label, d.deviceId) === Mic.key);
    if (cur) sel.value = cur.deviceId;
    sel.disabled = devs.length < 2;
  } catch { /* sin lista de dispositivos */ }
}
function renderMeter(level) {
  const db = 20 * Math.log10(level + 1e-9), lit = clamp(Math.round((db + 62) / 10), 0, 5);
  $$('#micMeter i').forEach((el, i) => { el.classList.toggle('lit', i < lit); el.classList.toggle('hot', i < lit && i >= 4); });
}

/* ============================================================
   Comprobación del micrófono (silencio + tono de prueba)
   Se guarda por micrófono: con uno nuevo vuelve a aparecer.
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
    else if (this.phase === 'run') acts = `<button type="button" class="btn btn-ghost btn-lg w-full" disabled>Comprobando…</button>`;
    else acts = `<div class="flex gap-2">${this.allOk ? '' : `<button type="button" class="btn btn-ghost btn-lg flex-1" data-cal="start">${icon('restart-line')}Repetir</button>`}<button type="button" class="btn btn-primary btn-lg flex-1" data-cal="done">${this.allOk ? icon('check-line') + 'Listo, empezar' : 'Seguir así'}</button></div>`;
    h.innerHTML = `<div class="cal">
      <h3>${icon('mic-line')}${this.phase === 'done' ? (this.allOk ? 'Micrófono listo' : 'Micrófono comprobado') : 'Primero, comprobemos tu micrófono'}</h3>
      ${this.phase === 'done' ? '' : `<p class="muted text-sm">Tarda unos 8 segundos y solo se hace una vez con cada micrófono${Mic.label ? `: <b class="text-[var(--text)] font-medium">${Mic.label}</b>` : ''}.</p>`}
      ${this.phase === 'intro' ? `<div class="vol-note">${icon('volume-up-line')}Antes de nada, sube el volumen del altavoz y quítate los auriculares.</div>` : ''}
      <div class="cal-list">${items.map(([t, d], i) => `<div class="cal-item" data-s="${this.steps[i].s}"><div class="st">${stIcon(this.steps[i].s, i)}</div><div><b>${t}</b><p>${d}</p>${this.steps[i].res ? `<div class="res">${this.steps[i].res}</div>` : ''}</div></div>`).join('')}</div>
      ${this.phase === 'run' ? '<div class="bar"><div data-cal-level></div></div>' : ''}
      ${acts}
    </div>`;
  },
  setStep(i, s, res) { this.steps[i] = { s, res: res ?? this.steps[i].res }; this.sync(); },
  collect(ms, fn) { return new Promise((res) => { const t0 = performance.now(); this.listener = (f, now) => { fn(f, now); if (now - t0 >= ms) { this.listener = null; res(); } }; }); },
  async testTone(freq) {
    const t0 = performance.now(); let first = null; const errs = []; let lvl = 0;
    Mic.ignoreUntil = 0;
    AudioEngine.tone(freq, 0.9);
    await this.collect(1300, (f, now) => {
      if (now - t0 > 300 && now - t0 < 850) lvl = Math.max(lvl, f.level);
      if (!f.pitch) return;
      let c = (freqToMidi(f.pitch.freq) - freqToMidi(freq)) * 100;
      if (Math.abs(Math.abs(c) - 1200) < 60) c = Math.abs(c) - 1200; // salto de octava
      if (Math.abs(c) < 60) { if (first == null) first = now - t0; if (now - t0 > 350 && now - t0 < 850) errs.push(c); }
    });
    return { ok: first != null && errs.length > 3, latency: first != null ? Math.max(0, first - 45) / 1000 : null, err: errs.length ? errs.reduce((a, b) => a + Math.abs(b), 0) / errs.length : null, lvl };
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
        ? `Oigo ${good.length} de 3 notas afinadas (desvío ${fmt(err)} cents) con ${Math.round(latency * 1000)} ms de retardo.`
        : 'No he oído bien las notas. Si usas auriculares es normal y puedes seguir; si no, sube el volumen y repite.');
      state.cals[key] = { noise, gate: clamp(noise * 3, 0.002, 0.02), latency, toneOk, label: Mic.label, at: Date.now() };
      store.set('cals', state.cals);
      this.allOk = toneOk && !noisy;
      this.phase = 'done';
      if (this.allOk) setTimeout(() => { if (this.phase === 'done' && this.allOk) this.finish(); }, 1800);
    } finally {
      this.running = false; this.sync();
    }
  },
  finish() { this.phase = 'intro'; this.forced = false; this.steps = [{ s: '', res: '' }, { s: '', res: '' }]; this.sync(); Lessons.renderBar(); },
  recheck() { this.forced = true; this.phase = 'intro'; this.sync(); Lessons.renderBar(); },
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
    s += `<text x="${xs(i)}" y="${H - 8}" text-anchor="middle" font-size="12" font-weight="600" fill="${col || (f >= 0 ? 'var(--muted)' : 'var(--faint)')}">${f >= 0 ? pcName(OPEN_MIDI[i] + f) : ''}</text>`;
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

// Mano izquierda vista desde la palma: pulgar a la izquierda y dedos 1-4 de izquierda a derecha
function handSVG(active, w = 150) {
  const F = [null, { x: 76, top: 40 }, { x: 103, top: 22 }, { x: 130, top: 30 }, { x: 155, top: 56 }];
  let s = `<svg viewBox="0 0 200 214" width="${w}" style="font-family:var(--font);max-width:100%;height:auto;overflow:visible" role="img" aria-label="Número y color de cada dedo">`;
  s += `<rect x="35" y="108" width="26" height="74" rx="13" transform="rotate(-36 48 145)" fill="var(--surface-3)" stroke="var(--line-2)" stroke-width="1.5"/>`;
  s += `<text x="29" y="128" text-anchor="middle" font-size="12" font-weight="700" fill="var(--faint)">P</text>`;
  for (let f = 1; f <= 4; f++) {
    const d = F[f], on = active.has(f);
    s += `<rect x="${d.x - 12.5}" y="${d.top}" width="25" height="${150 - d.top}" rx="12.5" fill="${on ? fingerVar(f) : 'var(--surface-3)'}" stroke="${fingerVar(f)}" stroke-opacity="${on ? 1 : 0.6}" stroke-width="1.6"/>`;
    s += `<text x="${d.x}" y="${d.top + 19}" text-anchor="middle" font-size="13" font-weight="700" fill="${on ? '#10131a' : fingerVar(f)}">${f}</text>`;
  }
  s += `<rect x="58" y="112" width="114" height="96" rx="38" fill="var(--surface-3)" stroke="var(--line-2)" stroke-width="1.5"/>`;
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
  s += `<text x="${nutX}" y="16" font-size="10.5" font-weight="600" letter-spacing=".08em" fill="var(--muted)">MANO IZQUIERDA</text>`;
  s += `<text x="${rhX}" y="16" text-anchor="middle" font-size="10.5" font-weight="600" letter-spacing=".08em" fill="var(--muted)">DERECHA</text>`;
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
    s += `<text x="${cx}" y="${y(n.string) + 4.5}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#10131a">${n.finger}</text>`;
  }
  return s + '</svg>';
}

/* ============================================================
   Evaluación de acordes (compartida por lecciones y canciones)
   ============================================================ */
const CHORD_LIB = Object.keys(CHORDS).map((id) => [id, chordNotes(CHORDS[id])]);
const hypCache = new Map();
function hypothesesFor(notes, chordId, dir = 'D') {
  const key = notes.map((n) => n.string + ':' + n.midi).join(',') + dir;
  if (!hypCache.has(key)) hypCache.set(key, chordHypotheses({ notes, dir }, CHORD_LIB.filter(([id]) => id !== chordId)));
  return hypCache.get(key);
}
// Solo se da un diagnóstico concreto si la evidencia es clara; si no, se reconoce que no se ha oído bien.
function diagnose(r, notes) {
  const best = r?.best;
  if (!r || !r.confident || (best.kind === 'other' && best.score < 0.75)) return { kind: 'unclear', title: 'No lo he oído claro', text: 'Rasguea una vez, con firmeza, y deja que suene.' };
  if (best.kind === 'missing') {
    const n = notes.find((x) => x.string === best.string);
    return { kind: 'bad', string: best.string, title: `No suena la ${best.string}ª cuerda (${pcName(best.midi)})`,
      text: n && n.fret > 0 ? `Pisa con la punta del dedo ${n.finger}, justo detrás del traste ${n.fret}.` : 'Arquea los dedos: alguno la está rozando y la apaga.' };
  }
  if (best.kind === 'extra') return { kind: 'bad', string: best.string, title: `Sobra la ${best.string}ª cuerda`, text: 'Empieza el rasgueo en la primera cuerda que se toca, o apágala rozándola con el pulgar.' };
  return { kind: 'bad', title: `Suena más a ${chordLabel(best.id)}`, text: 'Revisa en qué cuerda y en qué traste va cada dedo.' };
}

/* ============================================================
   Afinador
   ============================================================ */
const Tuner = {
  mode: 'auto', sel: 6, cur: null, done: new Set(), hold: 0, hist: [], shown: 0, target: 0, lastSeen: 0, live: false, cents: 0, last: {},
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
    $('#micSelect').addEventListener('change', async (e) => { try { await Mic.start(e.target.value); } catch { toast('No he podido abrir ese micrófono.'); fillMicSelect(); } });
    $('#recalBtn').addEventListener('click', () => Cal.recheck());
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
    if (f && !Cal.needed() && f.pitch && !f.ignoring) {
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
   Acordes: lecciones guiadas, un acorde cada vez
   ============================================================ */
const CHORD_ORDER = CHORD_GROUPS.flatMap((g) => g.ids);
const GUIDE = [
  { t: 'Sujeta la guitarra', d: 'Siéntate con la espalda recta y apoya la guitarra en la pierna derecha, con el mástil un poco hacia arriba. El <b>pulgar izquierdo va detrás del mástil</b>, más o menos detrás del dedo medio.' },
  { t: 'Tus dedos tienen número', d: 'En los diagramas no se dice "índice" o "anular": se usan números. En Traste cada dedo tiene <b>siempre el mismo color</b>.', art: 'hand' },
  { t: 'Cómo pisar una cuerda', d: 'Con la <b>punta del dedo</b>, justo <b>detrás del traste</b> (no encima). Arquea el dedo como si sujetaras una pelota pequeña para no rozar las cuerdas de al lado. Mejor con las uñas cortas.' },
  { t: 'Cómo leer un diagrama', d: 'Las líneas verticales son las cuerdas: la <b>6ª, la más gruesa, a la izquierda</b>. Las horizontales son los trastes. El número del círculo es el dedo. <b>O</b>: cuerda al aire. <b>✕</b>: no la toques.', art: 'diagram' },
  { t: 'Cómo rasguear', d: 'Con púa o con el pulgar, pasa por las cuerdas <b>de la más grave a la más aguda</b> (hacia el suelo, ↓). Mueve la muñeca, no todo el brazo, y empieza en la primera cuerda que se toque.' },
  { t: 'Cómo practicar', d: 'Mejor <b>10 minutos cada día</b> que una hora a la semana. Es normal que las yemas duelan la primera semana. Coloca los dedos, rasguea, quita la mano y repite: así la mano aprende la forma.' },
];
const Lessons = {
  cur: null, streak: 0, check: null, bar: { k: 'listen' }, res: {}, ch: { running: false, a: '', b: '', count: 0, end: 0, target: 'a' },
  init() {
    const saved = store.get('lesson', null);
    this.cur = saved && (saved === 'guia' || CHORDS[saved]) ? saved : (Object.keys(state.learned).length ? (CHORD_ORDER.find((x) => !state.learned[x]) || 'Em') : 'guia');
    $('#lessonPath').addEventListener('click', (e) => { const b = e.target.closest('[data-lesson]'); if (b) this.go(b.dataset.lesson); });
    $('#lessonBody').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const a = b.dataset.act;
      if (a === 'go') this.go(b.dataset.id);
      if (a === 'hear') AudioEngine.strum(chordNotes(CHORDS[this.cur]), 'D');
      if (a === 'mic') ensureMic();
      if (a === 'known') { this.markLearned(this.cur); this.go(this.nextId()); }
      if (a === 'changes') this.startChanges(b.dataset.id);
      if (a === 'stop') this.stopChanges(false);
    });
    this.render();
  },
  nextId() { const i = CHORD_ORDER.indexOf(this.cur); return CHORD_ORDER.find((x, k) => k > i && !state.learned[x]) || CHORD_ORDER[Math.min(i + 1, CHORD_ORDER.length - 1)]; },
  pairId() { // acorde ya aprendido con el que practicar el cambio
    const i = CHORD_ORDER.indexOf(this.cur);
    for (let k = i - 1; k >= 0; k--) if (state.learned[CHORD_ORDER[k]]) return CHORD_ORDER[k];
    return CHORD_ORDER.find((x) => x !== this.cur && state.learned[x]) || null;
  },
  go(id) {
    if (this.ch.running) this.stopChanges(false);
    this.cur = id; store.set('lesson', id); this.streak = 0; this.check = null; this.res = {};
    this.bar = state.learned[id] ? { k: 'learned', again: true } : { k: 'listen' };
    this.render();
    $('#lessonPath [aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    const top = $('#lessonPath').getBoundingClientRect().top + window.scrollY - 90;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  },
  render() { this.renderPath(); this.renderBody(); },
  renderPath() {
    const n = Object.keys(state.learned).filter((k) => CHORDS[k]).length;
    $('#learnedCount').textContent = `${n} de ${CHORD_ORDER.length} aprendidos`;
    $('#learnedCount').className = 'pill' + (n ? ' pill-ok' : '');
    $('#lessonPath').innerHTML = `<button type="button" data-lesson="guia" aria-current="${this.cur === 'guia'}">${icon('book-open-line')}Primeros pasos</button><span class="sep"></span>` +
      CHORD_ORDER.map((id) => `<button type="button" data-lesson="${id}" class="${state.learned[id] ? 'learned' : ''}" aria-current="${this.cur === id}" title="${chordLongName(id)}${CHORDS[id].variant ? ' · ' + CHORDS[id].variant : ''}">${state.learned[id] ? icon('check-line') : ''}${chordLabel(id)}${CHORDS[id].variant ? '<small class="font-medium opacity-70">fácil</small>' : ''}</button>`).join('');
  },
  renderBody() {
    if (this.cur === 'guia') {
      $('#lessonBody').innerHTML = `<div class="guide-grid">${GUIDE.map((g, i) => `
        <div class="card guide-card">
          <h3><span class="n">${i + 1}</span>${g.t}</h3>
          ${g.art === 'hand' ? `<div class="guide-art">${handSVG(new Set([1, 2, 3, 4]), 130)}</div>${fingerLegend()}` : ''}
          ${g.art === 'diagram' ? `<div class="guide-art"><div class="diagram-wrap">${chordDiagram(CHORDS.Am)}</div></div>` : ''}
          <p>${g.d}</p>
        </div>`).join('')}</div>
        <div class="flex justify-center mt-6"><button type="button" class="btn btn-primary btn-lg" data-act="go" data-id="${CHORD_ORDER[0]}">Empezar con mi primer acorde: ${chordLabel(CHORD_ORDER[0])}${icon('arrow-right-line')}</button></div>`;
      return;
    }
    const id = this.cur, c = CHORDS[id], notes = chordNotes(c);
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
    steps.push(`<li><span class="fdot strum">${icon('arrow-down-line')}</span><span><b>Rasguea</b> hacia abajo desde la ${first === 6 ? '6ª cuerda (todas suenan)' : `${first}ª cuerda`}</span></li>`);
    if (muted.length) steps.push(`<li><span class="fdot mute">${icon('close-line')}</span><span><b>No toques</b> la ${ordinalList(muted.sort((a, b) => a - b))} cuerda</span></li>`);
    $('#lessonBody').innerHTML = `
      <div class="card lesson">
        <div class="lesson-head">
          <div class="min-w-0">
            <div class="label">Acorde ${idx + 1} de ${CHORD_ORDER.length} · ${group}</div>
            <h2 class="chord-title">${chordLabel(id)}<small>${chordLabel(id, state.notation === 'latin' ? 'letter' : 'latin')} · ${chordLongName(id)}${c.variant ? ' · ' + c.variant : ''}</small></h2>
          </div>
          <button type="button" class="btn btn-ghost" data-act="hear" title="Escuchar cómo debe sonar">${icon('volume-up-line')}<span class="hidden sm:inline">Escuchar</span></button>
        </div>
        <div class="lesson-grid">
          <div class="diagram-wrap" id="chordDiagram">${chordDiagram(c, this.res)}</div>
          <div class="flex flex-col gap-5 min-w-0">
            <ol class="steps-list">${steps.join('')}</ol>
            <div class="tip">${icon('lightbulb-line')}<span>${c.tip}</span></div>
          </div>
        </div>
      </div>
      <div class="listen-bar" id="listenBar"></div>`;
    this.renderBar();
  },
  renderBar() {
    const el = $('#listenBar'); if (!el) return;
    const dots = `<div class="streak" title="Tres seguidos y queda aprendido">${[0, 1, 2].map((i) => `<i class="${i < this.streak ? 'on' : ''}"></i>`).join('')}</div>`;
    const known = `<button type="button" class="link-btn" data-act="known">Ya me lo sé</button>`;
    if (!Mic.on) {
      el.dataset.k = 'off';
      el.innerHTML = `<div class="row"><div class="ico">${icon('mic-off-line')}</div><div class="txt"><strong>Activa el micrófono</strong><p>Así te digo si el acorde suena bien.</p></div><div class="acts items-center">${known}<button type="button" class="btn btn-primary" data-act="mic">${icon('mic-line')}Activar</button></div></div>`;
      return;
    }
    if (Cal.needed()) { el.dataset.k = 'cal'; el.innerHTML = '<div class="cal-host" data-cal-host="acordes"></div>'; Cal.sync(); return; }
    const b = this.bar, name = chordLabel(this.cur);
    el.dataset.k = b.k;
    let ico = 'mic-line', title = '', text = '', acts = '';
    if (b.k === 'listen') { title = `Coloca los dedos y rasguea ${name}`; text = 'Una vez, hacia abajo, y deja que suene. Te escucho.'; acts = dots + known; }
    else if (b.k === 'hear') { title = 'Escuchando…'; text = 'Deja que suene.'; acts = dots; }
    else if (b.k === 'unclear') { ico = 'question-line'; el.dataset.k = 'listen'; title = b.title; text = b.text; acts = dots + known; }
    else if (b.k === 'ok') { ico = 'check-line'; title = '¡Suena bien!'; text = `Llevas ${this.streak} de 3 seguidos. Quita la mano y vuelve a colocarla.`; acts = dots; }
    else if (b.k === 'bad') { ico = 'close-line'; title = b.title; text = b.text; acts = dots + known; }
    else if (b.k === 'learned') {
      ico = 'check-line'; title = b.again ? `Ya sabes ${name}` : `¡Aprendido! ${name}`;
      text = b.again ? 'Rasguéalo cuando quieras para repasar.' : 'Lo has tocado bien tres veces seguidas.';
      const pair = this.pairId(), nx = this.nextId();
      acts = (pair ? `<button type="button" class="btn btn-ghost" data-act="changes" data-id="${pair}">${icon('timer-line')}Reto: ${chordLabel(pair)} ↔ ${name}</button>` : '') +
        (nx !== this.cur ? `<button type="button" class="btn btn-primary" data-act="go" data-id="${nx}">Siguiente: ${chordLabel(nx)}${icon('arrow-right-line')}</button>` : '');
    } else if (b.k === 'changes') {
      ico = 'timer-line'; el.dataset.k = 'listen';
      const tgt = this.ch.target === 'a' ? this.ch.a : this.ch.b;
      title = `Ahora: ${chordLabel(tgt)}`; text = `Cambia entre ${chordLabel(this.ch.a)} y ${chordLabel(this.ch.b)} todas las veces que puedas en un minuto.`;
      acts = `<div class="text-right"><div class="num text-xl font-semibold" id="chTime">1:00</div><div class="text-xs muted"><b class="text-[var(--text)]" id="chCount">${this.ch.count}</b> cambios</div></div><button type="button" class="btn btn-ghost" data-act="stop">Parar</button>`;
    } else if (b.k === 'changesDone') {
      ico = 'trophy-line'; el.dataset.k = 'learned';
      title = `${this.ch.count} cambios en un minuto`; text = b.record ? '¡Nuevo récord! Con práctica diaria llegarás a 30 o más.' : `Tu récord es ${b.best}. Con práctica diaria llegarás a 30 o más.`;
      const nx = this.nextId();
      acts = `<button type="button" class="btn btn-ghost" data-act="changes" data-id="${this.ch.a}">${icon('restart-line')}Repetir</button>` + (nx !== this.cur ? `<button type="button" class="btn btn-primary" data-act="go" data-id="${nx}">Siguiente: ${chordLabel(nx)}${icon('arrow-right-line')}</button>` : '');
    }
    el.innerHTML = `<div class="row"><div class="ico">${icon(ico)}</div><div class="txt"><strong>${title}</strong><p>${text}</p></div><div class="acts items-center">${acts}</div></div>`;
  },
  reviewing() { return this.bar.k === 'learned' || this.bar.k === 'changesDone'; },
  markLearned(id) { state.learned[id] = true; store.set('learned', state.learned); },
  setDiagram() { const d = $('#chordDiagram'); if (d) d.innerHTML = chordDiagram(CHORDS[this.cur], this.res); },
  frame(f, now) {
    if (this.ch.running) {
      const left = Math.max(0, this.ch.end - now), t = $('#chTime');
      if (t) t.textContent = `0:${String(Math.ceil(left / 1000)).padStart(2, '0')}`;
      if (left <= 0) this.stopChanges(true);
    }
    if (!f || this.cur === 'guia' || Cal.needed() || !$('#listenBar')) return;
    if (f.onset) {
      const id = this.ch.running ? (this.ch.target === 'a' ? this.ch.a : this.ch.b) : this.cur;
      this.check = { t0: now, best: null, id };
      if (!this.ch.running && !this.reviewing()) { this.bar = { k: 'hear' }; this.renderBar(); }
    }
    const ck = this.check;
    if (!ck || now - ck.t0 < 120) return;
    const notes = chordNotes(CHORDS[ck.id]);
    const r = matchChord(Mic.semis(), hypothesesFor(notes, ck.id));
    if (!ck.best || r.score > ck.best.score || r.confident) ck.best = r;
    if (r.ok) { this.check = null; this.onResult(true, ck.id, r, notes); }
    else if (now - ck.t0 > 600) { this.check = null; this.onResult(false, ck.id, ck.best, notes); }
  },
  onResult(ok, id, r, notes) {
    if (this.ch.running) {
      if (ok) { this.ch.count++; this.ch.target = this.ch.target === 'a' ? 'b' : 'a'; this.renderBar(); }
      return;
    }
    if (this.reviewing()) { // repaso: solo se marca en el diagrama
      this.res = ok ? Object.fromEntries(notes.map((n) => [n.string, 'ok'])) : {};
      this.setDiagram(); return;
    }
    if (ok) {
      this.streak = Math.min(3, this.streak + 1);
      this.res = Object.fromEntries(notes.map((n) => [n.string, 'ok']));
      if (this.streak >= 3) { this.markLearned(id); this.bar = { k: 'learned' }; this.renderPath(); }
      else this.bar = { k: 'ok' };
    } else {
      const d = diagnose(r, notes);
      if (d.kind === 'unclear') this.bar = { k: 'unclear', title: d.title, text: d.text };
      else { this.streak = 0; this.bar = { k: 'bad', title: d.title, text: d.text }; }
      this.res = d.string ? { [d.string]: 'bad' } : {};
    }
    this.setDiagram(); this.renderBar();
  },
  async startChanges(pair) {
    if (!(await ensureMic())) return;
    Object.assign(this.ch, { running: true, a: pair, b: this.cur, count: 0, end: performance.now() + 60000, target: 'a' });
    this.check = null; this.bar = { k: 'changes' }; this.renderBar();
  },
  stopChanges(finished) {
    if (!this.ch.running) return;
    this.ch.running = false; this.check = null;
    if (!finished) { this.bar = { k: 'learned', again: true }; this.renderBar(); return; }
    const key = `1min:${[this.ch.a, this.ch.b].sort().join('-')}`, prev = state.best[key] ?? 0;
    const record = this.ch.count > prev;
    if (record) { state.best[key] = this.ch.count; store.set('best', state.best); }
    this.bar = { k: 'changesDone', record, best: Math.max(prev, this.ch.count) }; this.renderBar();
  },
};

/* ============================================================
   Canciones: lista, reproductor y evaluación
   ============================================================ */
const LEVELS = { easy: 'Fácil', hard: 'Difícil', full: 'Completo' };
const LEVEL_HINT = { easy: 'melodía', hard: 'acordes', full: 'tablatura' };
const LEVEL_WAIT = { easy: true, hard: false, full: true };
// Velocidades pensadas para aprender: la mitad para descifrar, 3/4 para practicar, la real y un reto
const SPEEDS = [{ n: 'Muy lento', p: 0.5 }, { n: 'Lento', p: 0.75 }, { n: 'Normal', p: 1 }, { n: 'Rápido', p: 1.2 }];
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
      const lvls = s.imported ? ['full'] : ['easy', 'hard'];
      return `<div class="card song-card" role="button" tabindex="0" data-song="${s.id}">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0"><h3 class="truncate">${s.title}</h3><div class="muted text-sm truncate">${s.origin}</div></div>
          ${s.imported ? `<button type="button" class="btn btn-quiet btn-sm btn-icon" data-del="${s.id}" aria-label="Borrar">${icon('delete-bin-line')}</button>`
            : `<span class="diff" title="Dificultad">${[1, 2, 3].map((k) => `<i class="${k <= s.stars ? 'on' : ''}"></i>`).join('')}</span>`}
        </div>
        <div class="flex flex-wrap gap-1.5">
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
  song: null, built: null, level: 'easy', events: [], status: 'idle', demo: false, beat: 0, speedIdx: 1, wait: true, metro: false,
  idx: 0, hits: 0, streak: 0, check: null, lastHitMidi: null, onsetSince: true, frozen: false, curIdx: -1, ctx: null, W: 0, H: 0,
  flash: null, lastOnset: null, wrongOnset: 0, stats: null, drag: null, inertia: null, resumeTimer: 0, scrubbing: false,
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
    $('#plWait').addEventListener('change', (e) => { this.wait = e.target.checked; });
    $('#plMetro').addEventListener('change', (e) => { this.metro = e.target.checked; });
    $('#plFingersBtn').addEventListener('click', () => this.showFingers(!$('#plFingersBtn').getAttribute('aria-expanded').includes('true'), true));
    $('#resAgain').addEventListener('click', () => { closeModal('#resModal'); this.start(false); });
    $('#resNext').addEventListener('click', () => { closeModal('#resModal'); this.setLevel('hard'); });
    // tocar = empezar/pausar · arrastrar = moverse por la canción (con inercia)
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
    this.song = song;
    if (song.imported) {
      const last = song.events[song.events.length - 1];
      this.built = { total: last.t + last.dur, pickup: 0, chordTrack: [], levels: { full: song.events } };
    } else this.built = buildSong(song, CHORDS);
    const lvls = Object.keys(this.built.levels);
    $('#plLevel').innerHTML = lvls.map((l) => `<button type="button" data-l="${l}">${LEVELS[l]}<span class="hidden sm:inline muted font-normal"> · ${LEVEL_HINT[l]}</span></button>`).join('');
    $('#plTitle').textContent = song.title; $('#plOrigin').textContent = `${song.origin} · ${song.bpm} ppm · ${song.bpb}/4`;
    $('#songList').hidden = true; $('#player').hidden = false;
    window.scrollTo({ top: 0 });
    let l = store.get('lvl:' + song.id, lvls[0]); if (!this.built.levels[l]) l = lvls[0];
    this.setSpeed(store.get('speed', 1));
    this.setLevel(l);
    this.resize(); Cal.sync();
  },
  close() { this.pause(); $('#player').hidden = true; $('#songList').hidden = false; Songs.render(); },
  setLevel(l) {
    this.level = l; store.set('lvl:' + this.song.id, l);
    $$('#plLevel button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.l === l)));
    this.wait = LEVEL_WAIT[l]; $('#plWait').checked = this.wait;
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
  reset() {
    clearTimeout(this.resumeTimer); this.inertia = null; this.scrubbing = false;
    this.events = this.built.levels[this.level].map((e) => ({ ...e, st: 0, hitAt: 0 }));
    Object.assign(this, { status: 'idle', demo: false, beat: this.startBeat(), idx: 0, hits: 0, streak: 0, check: null, lastHitMidi: null, onsetSince: true, frozen: false, curIdx: -1, flash: null, lastOnset: null, deltas: [], stats: { ok: 0, early: 0, late: 0, miss: 0 } });
    this.renderHud(); this.renderButtons(); this.renderNow();
  },
  async micReady() {
    if (!(await ensureMic())) return false;
    if (Cal.needed()) { Cal.sync(); return false; }
    return true;
  },
  async start(demo) { // siempre desde el principio
    AudioEngine.ensure();
    if (!demo && !(await this.micReady())) return;
    this.reset(); this.demo = demo; this.status = 'playing'; this.renderButtons();
  },
  async togglePlay() {
    if (this.status === 'playing') return this.pause();
    if (this.status === 'paused') {
      AudioEngine.ensure();
      if (!this.demo && !(await this.micReady())) return;
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
  renderHud() {
    const total = this.events.filter((e) => e.st !== 2).length;
    $('#plScore').textContent = `${this.hits}/${total}`;
    $('#plStreak').textContent = this.streak;
  },
  currentIndex() {
    const i = this.events.findIndex((e) => e.st === 0 && e.t + (this.demo ? e.dur : 0) > this.beat - 0.05);
    if (this.status === 'playing' && !this.demo) return Math.min(this.idx, this.events.length - 1);
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
      $('#plHand').innerHTML = handSVG(fingers, 150) + fingerLegend(fingers);
    }
  },
  describe(e, short) {
    if (e.chord || e.notes.length > 1) {
      const name = e.chord ? chordLabel(e.chord) : 'acorde';
      return short ? `${name} ${e.dir === 'U' ? '↑' : '↓'}` : `${icon(e.dir === 'U' ? 'arrow-up-line' : 'arrow-down-line')} <b>${name}</b> · rasguea hacia ${e.dir === 'U' ? 'arriba' : 'abajo'}`;
    }
    const n = e.notes[0];
    if (short) return `${pcName(n.midi)} (${n.string}ª${n.fret ? `, traste ${n.fret}` : ' al aire'})`;
    const dot = n.fret ? `<span class="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1" style="background:${fingerVar(n.finger)}"></span>` : '';
    return `<b>${pcName(n.midi)}</b> · ${n.string}ª cuerda ${n.fret ? `· traste ${n.fret} · ${dot}dedo ${n.finger} (${FINGERS[n.finger].n.toLowerCase()})` : 'al aire'}`;
  },
  // ---------- tocar / arrastrar ----------
  ppb() { return this.W < 640 ? 68 : 112; },
  onDown(e) {
    if (e.button > 0) return;
    clearTimeout(this.resumeTimer);
    const wasPlaying = this.drag?.wasPlaying || this.inertia?.wasPlaying || this.scrubbing && this.scrubWasPlaying || this.status === 'playing';
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
    for (const e of this.events) { if (e.t >= b - 1e-6) e.st = 0; else if (e.st === 0) e.st = 2; }
    const i = this.events.findIndex((e) => e.st === 0);
    this.idx = i < 0 ? this.events.length : i;
    this.hits = this.events.filter((e) => e.st === 1).length;
    this.beat = b; this.check = null; this.frozen = false;
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
        if (e.chord || e.notes.length > 1) AudioEngine.strum(e.notes, e.dir || 'D');
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
  say(text, color) { this.flash = { text, color, t: performance.now() }; },
  judge(f, now, bps) {
    if (!f) return;
    const e0 = this.events[this.idx];
    if (f.onset) {
      this.onsetSince = true; this.lastOnset = { now, beat: this.beat };
      if (e0 && (e0.chord || e0.notes.length > 1)) this.check = { t0: now, beat: this.beat };
    }
    const lat = (Mic.latency() / 2) * bps;
    const eff = this.frozen ? this.beat : this.beat - lat;
    const early = 0.35 * bps, late = 0.35 * bps;
    // no se da por fallada mientras se está analizando un rasgueo que llegó a tiempo
    const analysing = this.check && now - this.check.t0 < 650;
    while (!this.wait && this.events[this.idx] && eff > this.events[this.idx].t + late && !analysing) {
      this.events[this.idx].st = -1; this.idx++; this.streak = 0; this.check = null; this.stats.miss++;
      this.say('Fallo', PAL.bad); this.renderHud();
    }
    const e = this.events[this.idx];
    if (!e || eff < e.t - early) return;
    if (e.chord || e.notes.length > 1) {
      if (!this.check || now - this.check.t0 < 110) return;
      const notes = e.chord ? chordNotes(CHORDS[e.chord]) : e.notes;
      const r = matchChord(Mic.semis(), hypothesesFor(notes, e.chord));
      if (r.ok || (r.best.kind === 'missing' && r.score > 0.8)) this.hit(e, null, this.check.beat, lat);
      else if (now - this.check.t0 > 650) this.check = null;
    } else {
      const want = e.notes[0].midi, same = (m) => m === want || Math.abs(m - want) === 12;
      const recent = this.lastOnset && now - this.lastOnset.now < 350 ? this.lastOnset : null;
      const m = f.stable;
      if (m != null && same(m) && (this.onsetSince || m !== this.lastHitMidi)) return this.hit(e, m, recent ? recent.beat : this.beat, lat);
      if (f.newNote != null && same(f.newNote)) return this.hit(e, want, recent ? recent.beat : this.beat, lat);
      // solo se dice "eso es X" cuando lo que ha aparecido es claramente otra nota
      if (f.newNote != null && recent && this.wrongOnset !== recent.now) { this.wrongOnset = recent.now; this.say(`Eso es ${pcName(f.newNote)}`, PAL.muted); }
    }
  },
  hit(e, m, atBeat, lat) {
    e.st = 1; e.hitAt = performance.now();
    this.idx++; this.hits++; this.streak++; this.lastHitMidi = m; this.onsetSince = false; this.check = null;
    if (this.wait && this.frozen) { this.stats.ok++; this.say('¡Bien!', PAL.ok); }
    else {
      // un rasgueo tarda ~50 ms en recorrer las cuerdas y su ataque se detecta algo después que el de una nota
      const strum = !!(e.chord || e.notes.length > 1);
      const d = (atBeat - lat - e.t) / this.bps() - (strum ? 0.04 : 0);
      this.deltas.push(d);
      if (Math.abs(d) <= (strum ? 0.13 : 0.1)) { this.stats.ok++; this.say('¡Justo!', PAL.ok); }
      else if (d < 0) { this.stats.early++; this.say('Pronto', PAL.warn); }
      else { this.stats.late++; this.say('Tarde', PAL.warn); }
    }
    this.renderHud();
  },
  finish() {
    const wasDemo = this.demo;
    this.status = 'done'; this.renderButtons();
    if (wasDemo) { this.reset(); return; }
    const total = Math.max(1, this.events.filter((e) => e.st !== 2).length);
    const pct = Math.round((100 * this.hits) / total);
    const stars = pct >= 95 ? 3 : pct >= 80 ? 2 : pct >= 60 ? 1 : 0;
    const key = `${this.song.id}:${this.level}`;
    const isBest = pct > (state.best[key] ?? -1);
    if (isBest) { state.best[key] = pct; store.set('best', state.best); }
    $('#resStars').innerHTML = [1, 2, 3].map((k) => icon('star-fill', k <= stars ? 'on' : '')).join('');
    $('#resTitle').textContent = stars === 3 ? '¡Perfecto!' : stars === 2 ? '¡Muy bien!' : stars === 1 ? 'Vas por buen camino' : 'Sigue practicando';
    const avg = this.deltas.length >= 4 ? this.deltas.reduce((a, b) => a + b, 0) / this.deltas.length : 0;
    const tendency = Math.abs(avg) >= 0.06 ? ` De media vas ${fmt(Math.abs(avg), 2)} s ${avg < 0 ? 'adelantado: espera a que la nota llegue a la línea' : 'retrasado: anticípate un poco'}.` : '';
    $('#resText').textContent = `${this.hits} de ${total} aciertos (${pct}%)${isBest ? ' · nuevo récord' : ''}.${tendency} ${pct < 80 ? 'Prueba más lento o activa “Esperarme”.' : this.level === 'easy' ? 'Ya puedes probar con los acordes.' : ''}`;
    const st = this.stats;
    $('#resTiming').innerHTML = (this.wait ? [['Bien', st.ok, 'pill-ok']] : [['Justo', st.ok, 'pill-ok'], ['Pronto', st.early, ''], ['Tarde', st.late, ''], ['Fallos', st.miss, '']])
      .map(([n, v, c]) => `<span class="pill ${c}">${n} <b class="num">${v}</b></span>`).join('');
    $('#resNext').hidden = this.level !== 'easy';
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
  draw(now) {
    const c = this.ctx, W = this.W, H = this.H; if (!c || !W) return;
    const top = 62, gap = (H - top - 30) / 5, ly = (s) => top + (s - 1) * gap;
    const gutter = 46, nowX = gutter + Math.min(150, W * 0.2), ppb = this.ppb(), beat = this.beat;
    const X = (t) => nowX + (t - beat) * ppb;
    const FONT = 'Inter, system-ui, sans-serif';
    c.clearRect(0, 0, W, H);
    c.fillStyle = PAL['bg-2']; c.fillRect(0, 0, W, H);
    const pulse = this.frozen ? 0.1 + 0.06 * Math.sin(now / 160) : 0.06;
    c.fillStyle = `rgba(226,184,102,${pulse})`; c.fillRect(nowX - 24, top - 26, 48, gap * 5 + 52);
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
      c.font = `600 13px ${FONT}`; c.textAlign = 'left';
      for (const seg of this.built.chordTrack) {
        const x = X(seg.t); if (x > W || x + seg.dur * ppb < gutter) continue;
        c.fillStyle = PAL.muted; c.fillText(chordLabel(seg.chord), Math.max(gutter + 4, x + 4), 24);
        c.fillStyle = PAL.line; c.fillRect(x, 32, Math.max(0, seg.dur * ppb - 6), 2);
      }
    }
    for (const e of this.events) {
      const x = X(e.t); if (x + e.dur * ppb < gutter - 30) continue; if (x > W + 30) break;
      c.globalAlpha = e.st === -1 ? 0.28 : e.st === 2 ? 0.18 : 1;
      if (e.chord || e.notes.length > 1) this.drawChord(c, e, x, ly, now);
      else this.drawNote(c, e, x, ly, ppb, now);
      c.globalAlpha = 1;
    }
    c.save(); c.shadowColor = PAL.accent; c.shadowBlur = 12; c.strokeStyle = PAL.accent; c.lineWidth = 2;
    c.beginPath(); c.moveTo(nowX, top - 26); c.lineTo(nowX, ly(6) + 26); c.stroke(); c.restore();
    c.fillStyle = PAL['bg-2']; c.fillRect(0, 0, gutter - 6, H);
    c.font = `600 12px ${FONT}`; c.textAlign = 'center';
    for (let s = 1; s <= 6; s++) { c.fillStyle = PAL.muted; c.fillText(pcName(stringMidi(s)), 20, ly(s) + 4); }
    // aviso Justo / Pronto / Tarde
    if (this.flash) {
      const age = now - this.flash.t;
      if (age > 750) this.flash = null;
      else {
        c.globalAlpha = age < 550 ? 1 : 1 - (age - 550) / 200;
        c.font = `700 15px ${FONT}`; const tw = c.measureText(this.flash.text).width + 22, fx = nowX + 34 + tw / 2, fy = top - 40 - Math.min(age, 200) * 0.02;
        c.fillStyle = PAL.surface; c.beginPath(); c.roundRect(fx - tw / 2, fy - 14, tw, 28, 14); c.fill();
        c.strokeStyle = this.flash.color; c.lineWidth = 1.5; c.stroke();
        c.fillStyle = this.flash.color; c.textBaseline = 'middle'; c.fillText(this.flash.text, fx, fy + 1); c.textBaseline = 'alphabetic';
        c.globalAlpha = 1;
      }
    }
    const cx = (nowX + W) / 2;
    const banner = (title, sub) => {
      c.font = `600 15px ${FONT}`; const w1 = c.measureText(title).width; c.font = `500 12.5px ${FONT}`; const w2 = sub ? c.measureText(sub).width : 0;
      const bw = Math.min(W - 24, Math.max(w1, w2) + 40), bh = sub ? 58 : 40, bx = clamp(cx, bw / 2 + 12, W - bw / 2 - 12);
      c.fillStyle = 'rgba(14,16,20,.86)'; c.beginPath(); c.roundRect(bx - bw / 2, H / 2 - bh / 2, bw, bh, 12); c.fill();
      c.fillStyle = PAL.text; c.font = `600 15px ${FONT}`; c.fillText(title, bx, H / 2 + (sub ? -4 : 5));
      if (sub) { c.fillStyle = PAL.muted; c.font = `500 12.5px ${FONT}`; c.fillText(sub, bx, H / 2 + 16); }
    };
    if (this.status === 'playing' && beat < this.firstT()) {
      c.fillStyle = PAL.text; c.font = `700 56px ${FONT}`; c.fillText(Math.ceil(this.firstT() - beat), cx, H / 2 + 20);
    } else if (this.status === 'idle' || this.status === 'done') banner('Toca aquí para empezar', 'Desliza a los lados para moverte por la canción');
    else if (this.status === 'paused' && !this.scrubbing && !this.drag) banner('En pausa', 'Toca para seguir · desliza para moverte');
    else if (this.frozen) { c.fillStyle = PAL.accent; c.font = `600 12px ${FONT}`; c.fillText('Te espero…', nowX, H - 8); }
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
    const n = e.notes[0], y = ly(n.string), len = e.dur * ppb - 22, a = c.globalAlpha;
    if (len > 4) { c.fillStyle = fingerHex(n.finger); c.globalAlpha = a * 0.25; c.beginPath(); c.roundRect(x, y - 4, len, 8, 4); c.fill(); c.globalAlpha = a; }
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
    const ay = ly(s1) - 26; c.fillStyle = e.dir === 'U' ? PAL.muted : PAL.text;
    c.beginPath();
    if (e.dir === 'U') { c.moveTo(x, ay - 6); c.lineTo(x - 6, ay + 3); c.lineTo(x + 6, ay + 3); } else { c.moveTo(x, ay + 4); c.lineTo(x - 6, ay - 5); c.lineTo(x + 6, ay - 5); }
    c.fill();
    if (e.chord && e.first) { c.fillStyle = PAL.accent; c.font = '700 14px Inter, system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(chordLabel(e.chord), x, 22); }
    if (e.st === 1 && now - e.hitAt < 450) { const k = (now - e.hitAt) / 450; c.globalAlpha = 1 - k; c.strokeStyle = PAL.ok; c.lineWidth = 2; c.beginPath(); c.roundRect(x - 16 - k * 14, ly(s1) - 16 - k * 14, 32 + k * 28, ly(s2) - ly(s1) + 32 + k * 28, 16 + k * 14); c.stroke(); c.globalAlpha = 1; }
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
  if (view !== 'acordes') Lessons.stopChanges(false);
  Cal.sync(); Lessons.renderBar();
  if (view === 'canciones') requestAnimationFrame(() => Player.resize());
}

function setNotation(n) {
  state.notation = n; store.set('notation', n);
  $$('#notation button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.n === n)));
  $('#notationMobileLabel').textContent = n === 'latin' ? 'Do' : 'C';
  Tuner.renderList(); Tuner.last = {}; Lessons.render(); Songs.render();
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
