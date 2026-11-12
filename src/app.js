'use strict';
/* ============================================================
   Traste — aplicación (afinador, aprender, canciones, ajustes)
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (v, d = 1) => v.toFixed(d).replace('.', ',');
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const norm = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const store = {
  get(k, d) { try { const v = localStorage.getItem('traste:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('traste:' + k, JSON.stringify(v)); return true; } catch { return false; /* sin almacenamiento o lleno */ } },
};

const state = {
  view: 'afinador',
  notation: store.get('notation', 'latin'),
  cals: store.get('cals', {}),          // comprobación del micrófono, por micrófono
  learned: store.get('learned', {}),
  best: store.get('best2', {}),          // canciones: { 'id:nivel': { stars, acc, pts } }
  rec: store.get('rec', {}),             // ejercicios: { 'id:modo': { v, stars } }
  diagram: store.get('diagram', 'v'),    // diagramas de acordes: 'v' vertical · 'h' horizontal (6ª abajo)
  lefty: store.get('lefty', false),
  theme: store.get('theme', 'auto'),
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
const SUFFIX_NAME = { '': 'mayor', m: 'menor', 7: 'séptima', maj7: 'mayor séptima', m7: 'menor séptima', sus2: 'sus2', sus4: 'sus4', add9: 'add9',
  dim: 'disminuido', m7b5: 'semidisminuido', aug: 'aumentado', 6: 'sexta', m6: 'menor sexta', '7sus4': 'séptima sus4', 5: 'quinta' };
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
  // when: segundos desde ahora (el reproductor lo programa por adelantado para que suene justo en el pulso)
  click(accent, when = 0) {
    const ctx = this.ensure(), o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + Math.max(0, when);
    o.frequency.value = accent ? 2600 : 2100; // por encima del registro de la guitarra
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(accent ? 0.35 : 0.2, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.06);
    Mic.notch((when + 0.3) * 1000);
    return o;
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

/* Micrófono. Un nodo de audio entrega las muestras con su número exacto y el oído (listen.js) las
   analiza como un flujo continuo. Cada fotograma devuelve el nivel, la nota estable (YIN) y los ataques
   recientes; cada ataque lleva su fecha exacta (t0), la nota que aparece y el espectro de antes y de
   después. Validado con grabaciones reales (GuitarSet). Cada ataque solo puede usarse una vez. */
const TAP_SRC = `registerProcessor('traste-tap', class extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(512); this.k = 0; this.f0 = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      if (!this.k) this.f0 = currentFrame;
      this.buf.set(ch.subarray(0, Math.min(ch.length, 512 - this.k)), this.k); this.k += ch.length;
      if (this.k >= 512) { this.port.postMessage({ f: this.f0, b: this.buf.slice(0, 512) }); this.k = 0; }
    }
    return true;
  }
});`;
const Mic = {
  on: false, stream: null, source: null, node: null, mode: '', hear: null, base: null, sr: 48000,
  deviceId: '', label: '', key: '',
  ignoreUntil: 0, lastOnset: 0, attack: null, clockOff: null, late: 0,
  ignoreFor(ms) { this.ignoreUntil = Math.max(this.ignoreUntil, performance.now() + ms); },
  // nodo que entrega el audio en bloques numerados: AudioWorklet y, si no se puede, ScriptProcessor
  async tap(ctx) {
    if (this.node) return this.node;
    const mute = ctx.createGain(); mute.gain.value = 0; mute.connect(ctx.destination);
    try {
      if (!ctx.audioWorklet || !window.AudioWorkletNode) throw new Error('sin AudioWorklet');
      const url = URL.createObjectURL(new Blob([TAP_SRC], { type: 'application/javascript' }));
      try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
      const n = new AudioWorkletNode(ctx, 'traste-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
      n.port.onmessage = (e) => this.feed(e.data.f, e.data.b);
      n.connect(mute); this.node = n; this.mode = 'worklet';
    } catch (err) {
      this.tapError = String(err?.message || err);
      // playbackTime es el reloj de audio del bloque, así que la fecha no depende de cuándo llega el aviso
      const n = ctx.createScriptProcessor(1024, 1, 1);
      n.onaudioprocess = (e) => this.feed(Math.round(e.playbackTime * ctx.sampleRate), e.inputBuffer.getChannelData(0));
      n.connect(mute); this.node = n; this.mode = 'script';
    }
    return this.node;
  },
  feed(f, b) {
    if (!this.on || !this.hear) return;
    const ear = this.hear.ear;
    if (this.base == null) this.base = f - ear.n;
    // bloques perdidos: se rellenan con silencio para no descuadrar el reloj. Con ScriptProcessor la fecha
    // de cada bloque baila unas muestras, así que solo se corrige si el desvío pasa de 30 ms.
    const gap = f - (this.base + ear.n), tol = this.mode === 'worklet' ? 0 : 0.03 * this.sr;
    if (gap > tol && gap < this.sr) this.hear.feed(new Float32Array(gap));
    else if (gap < -tol || gap >= this.sr) this.base = f - ear.n;
    this.hear.feed(b);
  },
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
    this.sr = ctx.sampleRate;
    if (!this.hear) this.hear = new Hearing(this.sr);
    const node = await this.tap(ctx);
    this.source = ctx.createMediaStreamSource(stream);
    this.source.connect(node);
    track.addEventListener('ended', () => { this.stop(); toast('Se ha desconectado el micrófono.'); });
    this.hear.reset(); this.attack = null; this.on = true;
    onMicChange();
  },
  stop(silent) {
    this.stream?.getTracks().forEach((t) => t.stop());
    try { this.source?.disconnect(); } catch { /* ya desconectado */ }
    this.on = false; this.source = null;
    if (!silent) onMicChange();
  },
  gate() { return Cal.running ? Cal.gateNow ?? 0.0012 : state.cals[this.key]?.gate ?? 0.006; },
  // retardo entre que tocas y la fecha que el oído le pone al ataque (se mide al calibrar tocando con el clic)
  latency() { const c = state.cals[this.key]; return c?.sync ?? (c?.latency ?? 0.12) / 2; },
  // el altavoz tarda en sonar: lo que diga el navegador o, si no lo dice, la mitad de la ida y vuelta medida
  outLatency() { const c = AudioEngine.ctx, v = (c?.outputLatency || 0) + (c?.baseLatency || 0); return v > 0.001 ? Math.min(v, 0.5) : (state.cals[this.key]?.latency ?? 0.12) / 2; },
  // mientras suena el clic por el altavoz, el oído deja fuera su banda de frecuencias
  notch(ms) { if (this.hear) { const ear = this.hear.ear; ear.notchUntil = Math.max(ear.notchUntil, ear.n + Math.round(ms * this.sr / 1000)); } },
  // fecha (performance.now, en ms) de una muestra del micrófono
  perfOf(pos) { return ((this.base + pos) / this.sr + this.clockOff) * 1000; },
  analyze(now) {
    // reloj: la diferencia más pequeña que se ve entre performance.now y el reloj de audio es la real
    const d = now / 1000 - AudioEngine.ctx.currentTime;
    if (this.clockOff == null || d < this.clockOff) { this.clockOff = d; this.late = 0; }
    else if (d > this.clockOff + 0.03) { if (++this.late > 20) { this.clockOff = d; this.late = 0; } } else { this.late = 0; this.clockOff += 2e-6; }
    const ignoring = now < this.ignoreUntil;
    const f = this.hear.frame(this.gate(), ignoring);
    f.now = now;
    if (this.base != null) for (const a of f.attacks) if (a.t0 == null) a.t0 = this.perfOf(a.pos);
    if (f.onset && f.attack?.t0 != null) this.lastOnset = f.attack.t0;
    if (f.attack && (f.attack.t0 == null || now - f.attack.t0 > 800)) f.attack = null;
    this.attack = f.attack;
    return f;
  },
  // lo que suena desde el ataque (los acordes se analizan sin lo que sonaba antes)
  semisFrom(a) { return this.hear.ear.semisFrom(a.pos); },
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
async function micReady() {
  if (!(await ensureMic())) return false;
  if (Cal.needed()) { Cal.sync(); return false; }
  return true;
}
/* Pantalla encendida mientras el micrófono escucha: con las dos manos en la guitarra no se puede tocar el móvil */
const Wake = {
  lock: null,
  async sync() {
    const want = Mic.on && document.visibilityState === 'visible';
    try {
      if (want && !this.lock && navigator.wakeLock) { this.lock = await navigator.wakeLock.request('screen'); this.lock.addEventListener('release', () => { this.lock = null; }); }
      else if (!want && this.lock) { const l = this.lock; this.lock = null; await l.release(); }
    } catch { this.lock = null; }
  },
};
document.addEventListener('visibilitychange', () => Wake.sync());
function onMicChange() {
  Wake.sync();
  $('#railMicDot').hidden = !Mic.on;
  $('#tunerCta').hidden = Mic.on;
  if (Mic.on) fillMicSelect(); else MicCard.devs = [];
  MicCard.render(); Cal.sync();
}
async function fillMicSelect() {
  try {
    MicCard.devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId);
  } catch { MicCard.devs = []; }
  MicCard.render(); Cal.sync();
}
const dbPct = (level) => clamp((20 * Math.log10(level + 1e-9) + 70) / 60, 0, 1) * 100;
function timeAgo(at) {
  const d = Math.floor((Date.now() - at) / 86400000);
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
}
/* Tarjeta del micrófono (afinador y ajustes): qué micro se usa, su nivel en vivo con la marca a partir
   de la cual Traste escucha, y si está ajustado a la sala, explicado con palabras normales */
const MicCard = {
  devs: [],
  render() {
    $$('[data-mic-card]').forEach((el) => {
      const full = !el.classList.contains('compact');
      if (!full) {
        const cal = Mic.on && state.cals[Mic.key];
        el.innerHTML = `<span class="mc-ring-wrap ${Mic.on ? '' : 'off'}" title="${Mic.on ? 'El anillo crece con lo que oye el micrófono' : 'Micrófono apagado'}"><i class="mc-ring"></i><span class="mc-ico ${Mic.on ? '' : 'off'}">${icon(Mic.on ? 'mic-line' : 'mic-off-line')}</span></span>`
          + (Mic.on ? `<button type="button" class="btn ${cal ? 'btn-soft' : 'btn-primary'}" data-mic-cal>${icon('equalizer-2-line')}Calibrar micrófono</button>`
            : `<button type="button" class="btn btn-primary" data-action="mic-on">${icon('mic-line')}Activar micrófono</button>`);
        return;
      }
      if (!Mic.on) {
        el.innerHTML = `<div class="mc-row"><span class="mc-ico off">${icon('mic-off-line')}</span>
          <div class="mc-txt"><b>Micrófono apagado</b><span>${full ? 'Traste lo usa para oír tu guitarra. El sonido se analiza en tu navegador y no sale de tu equipo.' : 'Actívalo para que Traste te oiga.'}</span></div>
          <button type="button" class="btn btn-primary btn-sm" data-action="mic-on">${icon('mic-line')}Activar</button></div>`;
        return;
      }
      const cal = state.cals[Mic.key];
      const name = `<b class="mc-name">${esc(devLabel(Mic.label))}</b>`;
      const status = cal
        ? `<span class="mc-st ok">${icon('checkbox-circle-fill')}Calibrado ${timeAgo(cal.at)} · ${cal.noise > 0.02 ? 'sala ruidosa' : 'sala tranquila'}${cal.toneOk ? '' : ' · no oyó el tono de prueba'}${cal.sync == null ? ' · ritmo sin ajustar' : ''}</span>`
        : `<span class="mc-st warn">${icon('error-warning-line')}Sin calibrar, puede confundir el ruido con notas</span>`;
      const gate = cal ? dbPct(cal.gate) : dbPct(Mic.gate());
      el.innerHTML = `
        <div class="mc-row">
          <span class="mc-ico">${icon('mic-line')}</span>
          <div class="mc-txt">${name}</div>
          <button type="button" class="btn ${cal ? 'btn-soft' : 'btn-primary'} btn-sm" data-mic-cal>${icon('equalizer-2-line')}${cal ? 'Volver a calibrar' : 'Calibrar'}</button>
        </div>
        <div class="mc-status">${status}</div>
        <div class="mc-meter"><div class="lv"><i class="fill"></i><i class="gate" style="left:${gate.toFixed(1)}%"></i></div>
          <span>Lo que no pasa de la marca lo tomo por ruido de la sala.</span></div>
        <button type="button" class="link-btn mc-off" data-mic-off>Apagar el micrófono</button>`;
    });
  },
  frame(level) {
    const gate = state.cals[Mic.key]?.gate ?? Mic.gate(), p = dbPct(level), g = dbPct(gate), hot = level > gate;
    $$('[data-mic-card] .fill').forEach((el) => { el.style.width = p.toFixed(1) + '%'; el.classList.toggle('hot', hot); });
    // anillo: apenas se mueve con el ruido de fondo y crece cuando suena algo por encima del umbral
    const s = hot ? 1.12 + 0.4 * Math.min(1, ((p - g) / Math.max(10, 100 - g)) * 1.8) : 1 + 0.1 * clamp(p / Math.max(1, g), 0, 1);
    $$('[data-mic-card] .mc-ring').forEach((el) => { el.style.transform = `scale(${s.toFixed(3)})`; el.classList.toggle('hot', hot); });
  },
};
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-mic-cal]')) Cal.recheck();
  if (e.target.closest('[data-mic-off]')) Mic.stop();
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-cal-dev]'); if (!b || Cal.running) return;
  try { await Mic.start(b.dataset.calDev); } catch { toast('No he podido abrir ese micrófono.'); fillMicSelect(); }
});
// "Predeterminado - Micrófono (Realtek) (0bda:4014)" → "Micrófono (Realtek)"
const devLabel = (l) => (l || 'Micrófono').replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '');

/* ============================================================
   Comprobación del micrófono (silencio + tono de prueba), por micrófono
   ============================================================ */
const Cal = {
  running: false, phase: 'intro', forced: false, steps: [{ s: '', res: '' }, { s: '', res: '' }, { s: '', res: '' }], allOk: false, listener: null, gateNow: null,
  skipped: new Set(), aborted: false, abortRes: null, // micros que se han dejado sin calibrar (hasta recargar)
  needed() { return Mic.on && (this.forced || this.running || this.phase === 'done' || (state.cals[Mic.key]?.v !== 2 && !this.skipped.has(Mic.key))); },
  // se muestra en la vista actual: dentro del reproductor si está abierto en ella, si no en su hueco propio
  sync() {
    const sec = $(`section[data-view="${state.view}"]`), pl = $('#player');
    const target = !this.needed() || !sec ? null : sec.contains(pl) && !pl.hidden ? pl.querySelector('.cal-card') : sec.querySelector('.cal-host');
    $$('.cal-host, .cal-card').forEach((h) => { const show = h === target; h.hidden = !show; if (show) this.render(h); });
  },
  render(h) {
    const stIcon = (st, i) => (st === 'ok' ? icon('check-line') : st === 'warn' ? '!' : String(i + 1));
    const items = [
      ['Silencio', 'No toques nada mientras mido el ruido de la sala.'],
      ['Tono de prueba', 'Sonarán tres notas por el altavoz para ver si el micrófono las oye afinadas.'],
      ['Toca con el clic', 'Toca una cuerda al aire a la vez que cada clic. Con eso mido el retardo de tu micrófono y el ritmo se puntúa bien.'],
    ];
    let acts = '';
    if (this.phase === 'intro') acts = `<button type="button" class="btn btn-primary btn-lg w-full" data-cal="start">${icon('play-fill')}Comenzar</button>`;
    else if (this.phase === 'run') acts = `<button type="button" class="btn btn-soft btn-lg w-full" disabled>Comprobando…</button>`;
    else acts = `<div class="flex gap-2">${this.allOk ? '' : `<button type="button" class="btn btn-soft btn-lg flex-1" data-cal="start">${icon('restart-line')}Repetir</button>`}<button type="button" class="btn btn-primary btn-lg flex-1" data-cal="done">${this.allOk ? icon('check-line') + 'Listo' : 'Seguir así'}</button></div>`;
    h.innerHTML = `<div class="cal">
      <div class="cal-top"><h3>${this.phase === 'done' ? (this.allOk ? 'Micrófono calibrado' : 'Micrófono comprobado') : 'Ajustemos tu micrófono'}</h3>
        <button type="button" class="btn btn-soft btn-icon" data-cal="close" aria-label="Cerrar" title="Cerrar">${icon('close-line')}</button></div>
      ${this.phase === 'intro' && MicCard.devs.length > 1 ? `<div class="cal-devs" role="group" aria-label="Micrófono">${MicCard.devs.map((d, i) => {
        const on = d.deviceId === Mic.deviceId || (!MicCard.devs.some((x) => x.deviceId === Mic.deviceId) && micKey(d.label, d.deviceId) === Mic.key && i === MicCard.devs.findIndex((x) => micKey(x.label, x.deviceId) === Mic.key));
        const lab = devLabel(d.label || 'Micrófono ' + (i + 1)), tag = /^(predeterminado|default|por defecto|comunicaciones|communications)\s*[-–:]\s*/i.exec(lab);
        return `<button type="button" class="dev" data-cal-dev="${esc(d.deviceId)}" aria-pressed="${on}">${icon('mic-line')}<span>${esc(tag ? lab.slice(tag[0].length) : lab)}${tag ? `<small>${/^(com)/i.test(tag[1]) ? 'Comunicaciones' : 'Predeterminado del sistema'}</small>` : ''}</span>${on ? icon('check-line', 'ck') : ''}</button>`;
      }).join('')}</div>` : ''}
      ${this.phase === 'intro' ? `<div class="vol-note">${icon('volume-up-line')}Sube el volumen y quítate los auriculares.</div>` : ''}
      <div class="cal-list">${items.map(([t, d], i) => `<div class="cal-item" data-s="${this.steps[i].s}"><div class="st">${stIcon(this.steps[i].s, i)}</div><div><b>${t}</b><p>${d}</p>${this.steps[i].res ? `<div class="res">${this.steps[i].res}</div>` : ''}</div></div>`).join('')}</div>
      ${this.phase === 'run' ? `<div class="bar"><div data-cal-level></div></div>${this.steps[2].s === 'run' ? '<div class="cal-beat" data-cal-beat></div>' : ''}` : ''}
      ${acts}
    </div>`;
  },
  setStep(i, s, res) { this.steps[i] = { s, res: res ?? this.steps[i].res }; this.sync(); },
  collect(ms, fn) { return new Promise((res) => { const t0 = performance.now(); this.abortRes = res; this.listener = (f, now) => { fn(f, now); if (now - t0 >= ms) { this.listener = null; res(); } }; }); },
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
  /* Doce clics (cuatro de aviso y ocho que cuentan). El desfase entre cada clic y tu golpe es el retardo
     con el que el micrófono te oye, y es justo lo que hay que descontar al puntuar el ritmo. */
  async clickSync() {
    const ctx = AudioEngine.ctx, out = Mic.outLatency(), gap = 0.6, n = 12, t0 = ctx.currentTime + 0.6;
    for (let k = 0; k < n; k++) AudioEngine.click(k % 4 === 0, t0 + k * gap - out - ctx.currentTime);
    const hits = new Map(); let shown = -1;
    await this.collect((0.6 + n * gap + 0.35) * 1000, (f, now) => {
      Mic.notch(300);
      const t = now / 1000 - Mic.clockOff, k = Math.floor((t - t0) / gap + 1e-3);
      if (k !== shown && k >= 0 && k < n) {
        shown = k;
        $$('[data-cal-beat]').forEach((el) => { el.textContent = k < 4 ? `Prepárate… ${4 - k}` : `Toca · ${k - 3} de 8`; el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); });
      }
      for (const a of f.attacks) if (a.t0 != null && !hits.has(a.id)) hits.set(a.id, a.t0 / 1000 - Mic.clockOff);
    });
    const offs = [];
    for (let k = 4; k < n; k++) {
      let best = null;
      for (const t of hits.values()) { const d = t - (t0 + k * gap); if (Math.abs(d) < 0.28 && (best == null || Math.abs(d) < Math.abs(best))) best = d; }
      if (best != null) offs.push(best);
    }
    if (offs.length < 5) return null;
    offs.sort((a, b) => a - b);
    const med = offs[offs.length >> 1], dev = offs.map((o) => Math.abs(o - med)).sort((a, b) => a - b)[offs.length >> 1];
    return { sync: clamp(med, -0.08, 0.4), dev, n: offs.length };
  },
  async run() {
    if (this.running || !(await ensureMic())) return;
    this.running = true; this.aborted = false; this.phase = 'run'; this.steps = [{ s: 'run', res: '' }, { s: '', res: '' }, { s: '', res: '' }]; this.gateNow = null; this.sync();
    const key = Mic.key;
    try {
      const lv = []; await this.collect(2000, (f) => lv.push(f.level));
      if (this.aborted) return;
      lv.sort((a, b) => a - b);
      // percentil 30: un golpe o una cuerda que suene durante la medida no dispara el umbral
      const noise = lv[Math.floor(lv.length * 0.3)] || 0.001, noisy = noise > 0.02;
      this.setStep(0, noisy ? 'warn' : 'ok', noisy ? 'Hay bastante ruido. Funcionará, aunque irá mejor en un sitio tranquilo.' : 'Sala tranquila.');
      this.setStep(1, 'run');
      const rs = [];
      for (const fq of [196, 330, 440]) { rs.push(await this.testTone(fq)); if (this.aborted) return; await new Promise((r) => setTimeout(r, 200)); }
      const good = rs.filter((r) => r.ok);
      const lats = good.map((r) => r.latency).sort((a, b) => a - b);
      const latency = lats.length ? lats[lats.length >> 1] : 0.12;
      const err = good.length ? good.reduce((a, r) => a + r.err, 0) / good.length : 0;
      const toneOk = good.length >= 2;
      this.setStep(1, toneOk ? 'ok' : 'warn', toneOk
        ? `Oigo ${good.length} de 3 notas afinadas (desvío de ${fmt(err)} cents).`
        : 'No he oído bien las notas. Con auriculares es normal y puedes seguir. Si no los llevas, sube el volumen y repite.');
      // tercer paso: con el umbral de ruido recién medido, tocar con el clic
      this.setStep(2, 'run');
      this.gateNow = clamp(noise * 3, 0.002, 0.02);
      for (const a of Mic.hear.attacks) a.used = true;
      const cs = await this.clickSync();
      if (this.aborted) return;
      this.setStep(2, cs && cs.dev <= 0.045 ? 'ok' : 'warn', !cs ? 'No te he oído tocar con los clics. Usaré un retardo aproximado; repítelo cuando tengas la guitarra a mano.'
        : cs.dev > 0.045 ? `Retardo de ${Math.round(cs.sync * 1000)} ms, aunque los golpes han salido desiguales. Repítelo si notas que el ritmo se puntúa raro.`
          : `Retardo de ${Math.round(cs.sync * 1000)} ms, medido con ${cs.n} golpes.`);
      state.cals[key] = { noise, gate: clamp(noise * 3, 0.002, 0.02), latency, toneOk, sync: cs ? cs.sync : null, v: 2, label: Mic.label, at: Date.now() };
      store.set('cals', state.cals);
      this.allOk = toneOk && !noisy && !!cs && cs.dev <= 0.045;
      this.phase = 'done';
      if (this.allOk) setTimeout(() => { if (this.phase === 'done' && this.allOk) this.finish(); }, 1600);
    } finally {
      this.running = false; this.gateNow = null; this.sync(); MicCard.render();
    }
  },
  finish() { this.phase = 'intro'; this.forced = false; this.steps = [{ s: '', res: '' }, { s: '', res: '' }, { s: '', res: '' }]; this.sync(); MicCard.render(); },
  recheck() { this.forced = true; this.phase = 'intro'; this.sync(); },
  // cerrar (X o Escape): se puede usar la app sin calibrar; el botón del afinador sigue proponiéndolo
  close() {
    if (this.running) { this.aborted = true; this.listener = null; this.abortRes?.(); }
    if (Mic.on && state.cals[Mic.key]?.v !== 2) this.skipped.add(Mic.key);
    this.finish();
  },
  frame(f, now) {
    if (!f) return;
    if (this.running) { const w = clamp((20 * Math.log10(f.level + 1e-9) + 70) / 60, 0, 1) * 100 + '%'; $$('[data-cal-level]').forEach((el) => { el.style.width = w; }); }
    if (this.listener) this.listener(f, now);
  },
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cal]'); if (!b) return;
  if (b.dataset.cal === 'start') Cal.run(); else if (b.dataset.cal === 'close') Cal.close(); else Cal.finish();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && Cal.needed() && $$('.cal-host, .cal-card').some((h) => !h.hidden)) Cal.close(); });

/* ============================================================
   Dibujos SVG: diagrama de acorde, mano, mástil
   ============================================================ */
/* Diagrama de acorde, vertical (como en los cancioneros: 6ª cuerda a la izquierda) u horizontal (como la
   tablatura: 6ª cuerda abajo). Para zurdos se dibuja en espejo. Todo se coloca con P(u, v):
   u = cuerda (0 = 6ª … 5 = 1ª) y v = traste (0 = cejuela). */
function chordDiagram(ch, res = {}, o = {}) {
  const horiz = (o.orient || state.diagram) === 'h', flip = o.lefty ?? state.lefty;
  const fretted = ch.frets.filter((f) => f > 0);
  const maxF = Math.max(0, ...fretted), minF = Math.min(99, ...fretted);
  const base = maxF <= 4 ? 1 : minF, nF = Math.max(4, maxF - base + 1);
  let W, H, P;
  if (horiz) {
    const SU = 30, SV = 50, L = 42, T = 20;
    W = L + nF * SV + 42; H = T + 5 * SU + 38;
    P = (u, v) => { const x = L + v * SV; return [flip ? W - x : x, T + (5 - u) * SU]; };
  } else {
    const SU = 32, SV = 42, L = 42, T = 46;
    W = L * 2 + 5 * SU; H = T + nF * SV + 34;
    P = (u, v) => { const x = L + u * SU; return [flip ? W - x : x, T + v * SV]; };
  }
  const xy = (u, v) => { const [x, y] = P(u, v); return `x="${x.toFixed(1)}" y="${y.toFixed(1)}"`; };
  const line = (u1, v1, u2, v2, attrs) => { const [a, b] = P(u1, v1), [c, d] = P(u2, v2); return `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" ${attrs}/>`; };
  const txt = (u, v, t, attrs, dy = 4.5) => { const [x, y] = P(u, v); return `<text x="${x}" y="${y + dy}" text-anchor="middle" ${attrs}>${t}</text>`; };
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="font-family:var(--font);max-width:100%;height:auto" role="img" aria-label="Diagrama del acorde">`;
  for (let u = 0; u < 6; u++) if (res[6 - u] === 'now') s += line(u, -0.85, u, nF + 0.75, 'stroke="var(--accent-soft)" stroke-width="30" stroke-linecap="round"');
  { const [a, b] = P(0, 0), [c, d] = P(5, nF); s += `<rect x="${Math.min(a, c)}" y="${Math.min(b, d)}" width="${Math.abs(c - a)}" height="${Math.abs(d - b)}" rx="3" fill="var(--surface-2)"/>`; }
  for (let k = 0; k <= nF; k++) s += k === 0 && base === 1 ? line(-0.08, 0, 5.08, 0, 'stroke="var(--text)" stroke-width="7" stroke-linecap="round"') : line(0, k, 5, k, 'stroke="var(--line-2)" stroke-width="2"');
  if (base > 1) s += txt(-0.9, 0.5, `${base}ª`, 'font-size="13" font-weight="600" fill="var(--muted)"');
  for (let u = 0; u < 6; u++) s += line(u, 0, u, nF, `stroke="var(--muted)" stroke-opacity=".75" stroke-width="${(2.6 - u * 0.32).toFixed(2)}"`);
  for (let u = 0; u < 6; u++) {
    const f = ch.frets[u], st = res[6 - u], col = st === 'bad' ? 'var(--bad)' : st === 'ok' ? 'var(--ok)' : st === 'now' ? 'var(--accent)' : null;
    const [mx, my] = P(u, -0.5);
    if (f < 0) s += `<g stroke="${col || 'var(--faint)'}" stroke-width="2.2" stroke-linecap="round"><line x1="${mx - 6}" y1="${my - 6}" x2="${mx + 6}" y2="${my + 6}"/><line x1="${mx + 6}" y1="${my - 6}" x2="${mx - 6}" y2="${my + 6}"/></g>`;
    if (f === 0) s += `<circle cx="${mx}" cy="${my}" r="7" fill="none" stroke="${col || 'var(--open)'}" stroke-width="2.2"/>`;
    if (f >= 0) s += txt(u, nF + (horiz ? 0.45 : 0.55), pcName(OPEN_MIDI[u] + f), `font-size="12.5" font-weight="650" fill="${col || 'var(--muted)'}"`);
  }
  const b = ch.barre;
  let bu1 = -1, bu2 = -1;
  if (b) {
    bu1 = 6 - b.from; bu2 = 6 - b.to; const v = b.fret - base + 0.5;
    s += line(bu1, v, bu2, v, `stroke="${fingerVar(b.finger)}" stroke-width="28" stroke-linecap="round"`);
    s += txt(bu1, v, b.finger, 'font-size="13" font-weight="750" fill="var(--dot-ink)"');
  }
  for (let u = 0; u < 6; u++) {
    const f = ch.frets[u]; if (f <= 0) continue;
    if (b && f === b.fret && ch.fingers[u] === b.finger && u >= bu1 && u <= bu2) continue;
    const v = f - base + 0.5, st = res[6 - u], [x, y] = P(u, v);
    s += `<circle cx="${x}" cy="${y}" r="14" fill="${fingerVar(ch.fingers[u])}" ${st === 'bad' ? 'stroke="var(--bad)" stroke-width="3"' : ''}/>`;
    s += txt(u, v, ch.fingers[u], 'font-size="13.5" font-weight="750" fill="var(--dot-ink)"');
  }
  return s + '</svg>';
}

// Mano izquierda vista desde la palma: pulgar a la izquierda y dedos 1-4 de izquierda a derecha
function handSVG(active, w = 150) {
  const F = [null, { x: 76, top: 40 }, { x: 103, top: 22 }, { x: 130, top: 30 }, { x: 155, top: 56 }];
  const X = (x) => (state.lefty ? 200 - x : x); // zurdos: la mano que pisa es la derecha
  let g = '', t = '';
  g += `<rect x="35" y="108" width="26" height="74" rx="13" transform="rotate(-36 48 145)" fill="var(--surface-3)"/>`;
  t += `<text x="${X(29)}" y="128" text-anchor="middle" font-size="12" font-weight="700" fill="var(--faint)">P</text>`;
  for (let f = 1; f <= 4; f++) {
    const d = F[f], on = active.has(f);
    g += `<rect x="${d.x - 12.5}" y="${d.top}" width="25" height="${150 - d.top}" rx="12.5" fill="${on ? fingerVar(f) : 'var(--surface-3)'}" stroke="${fingerVar(f)}" stroke-opacity="${on ? 0 : 0.55}" stroke-width="1.6"/>`;
    t += `<text x="${X(d.x)}" y="${d.top + 19}" text-anchor="middle" font-size="13" font-weight="750" fill="${on ? 'var(--dot-ink)' : fingerVar(f)}">${f}</text>`;
  }
  g += `<rect x="58" y="112" width="114" height="96" rx="38" fill="var(--surface-3)"/>`;
  return `<svg viewBox="0 0 200 214" width="${w}" style="font-family:var(--font);max-width:100%;height:auto;overflow:visible" role="img" aria-label="Número y color de cada dedo"><g ${state.lefty ? 'transform="matrix(-1 0 0 1 200 0)"' : ''}>${g}</g>${t}</svg>`;
}
function fingerLegend(active) {
  return `<div class="legend">${[1, 2, 3, 4].map((f) => `<span style="${active && !active.has(f) ? 'opacity:.45' : ''}"><i style="background:${fingerVar(f)}"></i>${f} ${FINGERS[f].n}</span>`).join('')}</div>`;
}

// Lo que hay que tocar ahora: acorde → su diagrama (en la orientación elegida); nota → el mástil
function fingersSVG(e) {
  if (e && e.of) return fretboardSVG({ chord: e.of, notes: e.notes }); // arpegio: la forma del acorde y la cuerda que toca
  if (e && e.chord && state.diagram === 'v') return chordDiagram(CHORDS[e.chord]);
  return fretboardSVG(e);
}
// Mástil horizontal (cuerda 1 arriba, como en la tablatura) + columna de mano derecha. Zurdos: en espejo.
function fretboardSVG(e) {
  const shape = e ? (e.chord ? chordNotes(CHORDS[e.chord]) : e.notes) : [];
  const played = new Set(e ? e.notes.map((n) => n.string) : []);
  const isChord = !!(e && (e.chord || e.notes.length > 1));
  const maxF = Math.max(0, ...shape.map((n) => n.fret)), nF = Math.max(5, maxF);
  const rowH = 28, top = 40, labelW = 44, markW = 30, fw = 64, nutX = labelW + markW + 8;
  const boardR = nutX + nF * fw, rhX = boardR + 46, W = rhX + 40, H = top + 5 * rowH + 34, y = (s) => top + (s - 1) * rowH;
  const X = (x) => (state.lefty ? W - x : x), A = (a) => (!state.lefty ? a : a === 'end' ? 'start' : a === 'start' ? 'end' : a);
  const T = (x, yy, str, attrs, anchor = 'middle') => `<text x="${X(x)}" y="${yy}" text-anchor="${A(anchor)}" ${attrs}>${str}</text>`;
  let s = '', t = '';
  t += T(nutX, 16, 'Mano izquierda', 'font-size="12" font-weight="600" fill="var(--muted)"', 'start');
  t += T(rhX, 16, 'Derecha', 'font-size="12" font-weight="600" fill="var(--muted)"');
  s += `<rect x="${nutX}" y="${y(1) - 13}" width="${nF * fw}" height="${5 * rowH + 26}" rx="6" fill="var(--surface-2)"/>`;
  for (const k of [3, 5, 7, 9]) if (k <= nF) s += `<circle cx="${nutX + (k - 0.5) * fw}" cy="${(y(3) + y(4)) / 2}" r="5" fill="var(--line-2)"/>`;
  for (let k = 1; k <= nF; k++) {
    s += `<line x1="${nutX + k * fw}" x2="${nutX + k * fw}" y1="${y(1) - 13}" y2="${y(6) + 13}" stroke="var(--line-2)" stroke-width="2"/>`;
    t += T(nutX + (k - 0.5) * fw, H - 4, k, 'font-size="11" fill="var(--faint)"');
  }
  s += `<rect x="${nutX - 4}" y="${y(1) - 13}" width="6" height="${5 * rowH + 26}" rx="2" fill="var(--text)" fill-opacity=".85"/>`;
  for (let st = 1; st <= 6; st++) {
    s += `<line x1="${nutX}" x2="${boardR}" y1="${y(st)}" y2="${y(st)}" stroke="var(--muted)" stroke-opacity=".7" stroke-width="${1 + (st - 1) * 0.32}"/>`;
    t += T(labelW - 6, y(st) + 4, pcName(stringMidi(st)), 'font-size="12" font-weight="600" fill="var(--muted)"', 'end');
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
    t += T(cx, y(n.string) + 4.5, n.finger, 'font-size="12.5" font-weight="750" fill="var(--dot-ink)"');
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" style="font-family:var(--font)" role="img" aria-label="Dónde poner los dedos"><g ${state.lefty ? `transform="matrix(-1 0 0 1 ${W} 0)"` : ''}>${s}</g>${t}</svg>`;
}

/* Mástil para los ejercicios: 1ª cuerda arriba y 6ª (la más grave) abajo, como en la tablatura.
   marks: { string, fret, finger, st: now | next | done | idle | show | hint, label } */
function neckSVG({ from = 0, to = 5, marks = [], hl = null }) {
  const open = from === 0, f0 = Math.max(1, from), nF = to - f0 + 1;
  const rowH = 30, top = 16, labelW = 30, openW = open ? 40 : 10, fw = nF > 8 ? 50 : 60;
  const nutX = labelW + openW, W = nutX + nF * fw + 12, H = top + 5 * rowH + 32;
  const y = (s) => top + (s - 1) * rowH, fx = (f) => (f === 0 ? labelW + openW / 2 - 2 : nutX + (f - f0 + 0.5) * fw);
  const X = (x) => (state.lefty ? W - x : x);
  const T = (x, yy, str, attrs) => `<text x="${X(x)}" y="${yy}" text-anchor="middle" ${attrs}>${str}</text>`;
  let s = '', t = '';
  if (hl) s += `<rect x="${labelW - 4}" y="${y(hl) - 13}" width="${W - labelW}" height="26" rx="13" fill="var(--accent-soft)"/>`;
  s += `<rect x="${nutX}" y="${y(1) - 12}" width="${nF * fw}" height="${5 * rowH + 24}" rx="6" fill="var(--surface-2)"/>`;
  for (let k = f0; k <= to; k++) {
    const cx = nutX + (k - f0 + 0.5) * fw;
    if ([3, 5, 7, 9, 15].includes(k)) s += `<circle cx="${cx}" cy="${(y(3) + y(4)) / 2}" r="5" fill="var(--line-2)"/>`;
    if (k === 12) s += `<circle cx="${cx}" cy="${(y(2) + y(3)) / 2}" r="5" fill="var(--line-2)"/><circle cx="${cx}" cy="${(y(4) + y(5)) / 2}" r="5" fill="var(--line-2)"/>`;
    s += `<line x1="${nutX + (k - f0 + 1) * fw}" x2="${nutX + (k - f0 + 1) * fw}" y1="${y(1) - 12}" y2="${y(6) + 12}" stroke="var(--line-2)" stroke-width="2"/>`;
    t += T(cx, H - 6, k, `font-size="11.5" font-weight="600" fill="var(--faint)"`);
  }
  s += open ? `<rect x="${nutX - 4}" y="${y(1) - 12}" width="6" height="${5 * rowH + 24}" rx="2" fill="var(--text)" fill-opacity=".85"/>`
    : `<line x1="${nutX}" x2="${nutX}" y1="${y(1) - 12}" y2="${y(6) + 12}" stroke="var(--line-2)" stroke-width="2"/>`;
  for (let st = 1; st <= 6; st++) {
    s += `<line x1="${open ? labelW + 6 : nutX}" x2="${W - 12}" y1="${y(st)}" y2="${y(st)}" stroke="var(--muted)" stroke-opacity="${hl && hl !== st ? 0.4 : 0.8}" stroke-width="${1 + (st - 1) * 0.32}"/>`;
    t += T(labelW / 2 - 2, y(st) + 4, pcName(stringMidi(st)), `font-size="11.5" font-weight="650" fill="${hl === st ? 'var(--accent)' : 'var(--muted)'}"`);
  }
  for (const m of marks) {
    if (m.fret > 0 && (m.fret < f0 || m.fret > to)) continue;
    const cx = fx(m.fret), cy = y(m.string), fc = m.fret === 0 ? 'var(--open)' : fingerVar(m.finger);
    const lab = m.label ?? (m.fret === 0 ? '0' : m.finger);
    if (m.st === 'done') { s += `<circle cx="${cx}" cy="${cy}" r="8" fill="var(--ok)" fill-opacity=".45"/>`; continue; }
    if (m.st === 'hint') { s += `<circle cx="${cx}" cy="${cy}" r="13" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-dasharray="4 4"/>`; continue; }
    if (m.st === 'now') {
      s += `<circle class="ring" cx="${cx}" cy="${cy}" r="19" fill="none" stroke="var(--accent)" stroke-width="3"/>`;
      s += m.fret === 0 ? `<circle cx="${cx}" cy="${cy}" r="14" fill="var(--bg-2)" stroke="var(--open)" stroke-width="3"/>` : `<circle cx="${cx}" cy="${cy}" r="14" fill="${fc}"/>`;
      t += T(cx, cy + 5, lab, `font-size="14" font-weight="800" fill="${m.fret === 0 ? 'var(--open)' : 'var(--dot-ink)'}"`);
      continue;
    }
    if (m.st === 'show') { s += `<circle cx="${cx}" cy="${cy}" r="15" fill="var(--ok)"/>`; t += T(cx, cy + 4.5, lab, 'font-size="12" font-weight="800" fill="var(--dot-ink)"'); continue; }
    const op = m.st === 'next' ? 1 : 0.4;
    s += m.fret === 0 ? `<circle cx="${cx}" cy="${cy}" r="11" fill="var(--bg-2)" stroke="var(--open)" stroke-width="2" opacity="${op}"/>` : `<circle cx="${cx}" cy="${cy}" r="11" fill="${fc}" opacity="${op}"/>`;
    t += T(cx, cy + 4.2, lab, `font-size="11.5" font-weight="750" fill="${m.fret === 0 ? 'var(--open)' : 'var(--dot-ink)'}" opacity="${op}"`);
  }
  return `<svg class="neck${nF > 8 ? ' wide' : ''}" viewBox="0 0 ${W} ${H}" width="${W}" style="font-family:var(--font)" role="img" aria-label="Mástil"><g ${state.lefty ? `transform="matrix(-1 0 0 1 ${W} 0)"` : ''}>${s}</g>${t}</svg>`;
}

/* ============================================================
   Afinador: automático por defecto, cuerdas dibujadas, tocar una cuerda = elegirla
   ============================================================ */
const STRING_TH = { 6: 4.4, 5: 3.7, 4: 3, 3: 2.4, 2: 1.9, 1: 1.5 };
const Tuner = {
  mode: 'auto', sel: 6, cur: null, lock: null, done: new Set(), hold: 0, hist: [], shown: 0, target: 0, lastSeen: 0, live: false, cents: 0, level: 0, phase: 0, last: {},
  init() {
    $('#tnNext').addEventListener('click', () => { Learn.markDone('tune'); $('#tnNext').hidden = true; const nx = Learn.nextAction('tune'); if (nx) nx.fn(); else location.hash = '#aprender'; });
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
    $('#tnHint').addEventListener('click', (e) => { if (e.target.closest('[data-tn-reset]')) { this.done.clear(); this.hold = 0; this.renderStrings(); } });
    this.renderStrings();
  },
  // las seis afinadas: cuenta como el primer paso de la práctica de hoy
  allTuned() {
    Learn.markDone('tune');
    const nx = Learn.nextAction('tune');
    if (nx) showResult({ title: 'Guitarra afinada', text: 'Las seis cuerdas están en su sitio.', actions: [{ ...nx, kind: 'primary' }] });
  },
  setMode(m) {
    this.mode = m; this.hist = []; this.hold = 0; this.lock = null;
    if (m === 'manual') this.cur = this.sel;
    $('#tnMode').classList.toggle('manual', m === 'manual');
    $('#tnModeText').innerHTML = m === 'manual' ? `Cuerda ${this.sel} · ${pcName(stringMidi(this.sel))} ${icon('close-line')}` : 'Automático';
    this.renderStrings();
  },
  renderStrings() {
    // como se ve la guitarra en la tablatura: la 1ª arriba y la 6ª, la más grave, abajo
    $('#tnStrings').innerHTML = [1, 2, 3, 4, 5, 6].map((s) => `
      <button type="button" class="str ${this.done.has(s) ? 'done' : ''} ${this.mode === 'manual' && this.sel === s ? 'sel' : ''}" data-s="${s}" style="--th:${STRING_TH[s]}px" aria-label="Cuerda ${s}, ${stringName(s)}: tócala para afinar solo esta">
        <span class="peg">${this.done.has(s) ? icon('check-line') : pcName(stringMidi(s))}</span>
        <span class="wire"><svg viewBox="0 0 400 26" preserveAspectRatio="none"><path d="M0 13 L400 13" fill="none" stroke-width="${STRING_TH[s]}" stroke-linecap="round"/></svg></span>
        <span class="info">${this.done.has(s) ? 'Afinada' : `${s}ª`}</span>
      </button>`).join('');
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
            if (this.hold >= 1 && !this.done.has(s)) { this.done.add(s); this.renderStrings(); if (this.done.size === 6) this.allTuned(); }
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
      const far = Math.abs(this.cents) > 50 ? 'bastante ' : '';
      this.set('#tnHint', inTune ? `<span style="color:var(--ok)">${icon('checkbox-circle-fill')}</span><span style="color:var(--ok)">${this.done.has(this.cur) ? 'Afinada' : 'Mantén… casi está'}</span>`
        : this.cents < 0 ? `${icon('arrow-up-line')}<span>Está ${far}grave, aprieta la clavija</span>`
        : `${icon('arrow-down-line')}<span>Está ${far}aguda, afloja la clavija</span>`);
    } else {
      this.set('#tnFreq', '');
      this.set('#tnSub', this.mode === 'manual' ? `Pulsa la ${this.sel}ª cuerda al aire` : 'Pulsa una cuerda al aire');
      this.set('#tnHint', this.done.size === 6 ? `<span style="color:var(--ok)">${icon('checkbox-circle-fill')}</span><span style="color:var(--ok)">¡Guitarra afinada!</span><button type="button" class="link-btn" data-tn-reset>Empezar de nuevo</button>` : '');
    }
  },
};

/* ============================================================
   Canciones: catálogo y reproductor
   ============================================================ */
const LEVELS = { easy: 'Fácil', arp: 'Arpegio', hard: 'Difícil' };
const LEVEL_HINT = { easy: 'melodía', arp: 'acordes nota a nota', hard: 'acordes' };
// Velocidades pensadas para aprender: la mitad para descifrar, 3/4 para practicar, la real y un reto
const SPEEDS = [{ n: 'Muy lento', p: 0.5 }, { n: 'Lento', p: 0.75 }, { n: 'Normal', p: 1 }, { n: 'Rápido', p: 1.2 }];
// Puntos: perfecto 100 (±55 ms), bien 75 (±110 ms), pronto/tarde 50, y la racha multiplica (×2 desde 10, ×3 desde 20, ×4 desde 30).
// Estrellas por precisión: perfecto cuenta 1, bien 0,8, pronto/tarde 0,5 y fallo 0 (40 %, 65 % y 85 %).
const WIN = { note: 0.2, noteGood: 0.11, notePerfect: 0.055, chord: 0.26, chordGood: 0.15, chordPerfect: 0.08 };
const HIT = { perfect: { pts: 100, w: 1, say: 'Perfecto' }, good: { pts: 75, w: 0.8, say: 'Bien' }, early: { pts: 50, w: 0.5, say: 'Pronto' }, late: { pts: 50, w: 0.5, say: 'Tarde' } };
const STAR_AT = [0.4, 0.65, 0.85];
const songChords = (s) => s.chordList || [...new Set(parseChordBars(s.chords, s.bpb, 0).map((c) => c.chord))];
const starsFor = (acc) => STAR_AT.filter((t) => acc >= t).length;
const miniStars = (n) => `<span class="mini-stars">${[1, 2, 3].map((k) => icon('star-fill', k <= n ? 'on' : '')).join('')}</span>`;

/* Ventana de resultado (canciones y ejercicios) */
function showResult({ stars = null, title, text = '', big = [], grid = [], actions = [] }) {
  $('#resStars').innerHTML = stars == null ? '' : [1, 2, 3].map((k) => icon('star-fill', k <= stars ? 'on' : '')).join('');
  $('#resTitle').textContent = title; $('#resText').textContent = text;
  $('#resBig').innerHTML = big.map(([v, l]) => `<div><b class="num">${v}</b><span>${l}</span></div>`).join('');
  $('#resGrid').innerHTML = grid.map(([n, v, c]) => `<div><b class="num" style="color:${c}">${v}</b><span>${n}</span></div>`).join('');
  $('#resGrid').hidden = !grid.length;
  const acts = [{ label: 'Cerrar', kind: 'ghost' }, ...actions];
  $('#resActions').innerHTML = acts.map((a, i) => `<button type="button" class="btn btn-${a.kind || 'soft'}" data-res="${i}">${a.icon ? icon(a.icon) : ''}${a.label}</button>`).join('');
  showResult.acts = acts;
  openModal('#resModal');
  $('#resActions .btn-primary')?.focus();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-res]'); if (!b) return;
  closeModal('#resModal'); showResult.acts?.[+b.dataset.res]?.fn?.();
});
const starsLine = (n) => (n === 3 ? '¡Perfecto!' : n === 2 ? '¡Muy bien!' : n === 1 ? 'Vas por buen camino' : 'Sigue practicando');

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
    const cats = [{ id: 'all', name: 'Todas' }, ...(MySongs.list.length ? [{ id: 'mias', name: 'Mis canciones' }] : []), ...SONG_CATS];
    if (!cats.some((c) => c.id === this.cat)) this.cat = 'all';
    $('#songFilters').innerHTML = cats.map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${this.cat === c.id}">${c.name}</button>`).join('') +
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
        <div class="min-w-0"><h3>${esc(s.title)}${s.user ? '<span class="tag">Tuya</span>' : ''}</h3><div class="meta">${esc(s.origin)} · ${songChords(s).length ? songChords(s).map((c) => chordLabel(c)).join(' ') : 'tablatura'}</div></div>
        <span class="dots" title="Dificultad: ${['', 'fácil', 'media', 'difícil'][s.stars]}">${[1, 2, 3].map((k) => `<i class="${k <= s.stars ? 'on' : ''}"></i>`).join('')}</span>
        <div class="best">${(() => { const top = Object.keys(LEVELS).filter((l) => b(l)).pop(); return top ? `<span>${LEVELS[top]} ${miniStars(b(top).stars)}</span>` : ''; })()}</div>
      </div>`;
    }).join('') : `<div class="empty">No hay canciones con esos filtros.</div>`;
  },
};

const Player = {
  song: null, built: null, level: 'easy', events: [], status: 'idle', demo: false, beat: 0, speedIdx: 1, wait: false, metro: false,
  idx: 0, combo: 0, maxCombo: 0, points: 0, check: null, lastHitMidi: null, frozen: false, curIdx: -1, ctx: null, W: 0, H: 0,
  flash: null, stats: null, drag: null, inertia: null, resumeTimer: 0, scrubbing: false, attackBeats: new Map(), deltas: [], clicked: null, clickNodes: [], loop: null, quals: [],
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
    $('#plLoop').innerHTML = [0, 1, 2, 4, 8].map((n) => `<button type="button" data-n="${n}">${n || 'No'}</button>`).join('');
    $('#plLoop').addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (b) this.setLoop(+b.dataset.n); });
    $('#plChip').addEventListener('click', (e) => { e.stopPropagation(); this.showOpts(!$('#plOpts').classList.contains('open')); });
    $('#plFingersBtn').addEventListener('click', () => this.showFingers($('#plFingersBtn').getAttribute('aria-expanded') !== 'true'));
    $('#plOptsBtn').addEventListener('click', (e) => { e.stopPropagation(); this.showOpts(!$('#plOpts').classList.contains('open')); });
    document.addEventListener('pointerdown', (e) => {
      if ($('#plOpts').classList.contains('open') && !e.target.closest('#plOpts,#plOptsBtn,#plChip')) this.showOpts(false);
      if (!$('#plDetails').hidden && !e.target.closest('#plDetails,#plFingersBtn')) this.showFingers(false);
    });
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e, true));
    document.addEventListener('keydown', (e) => {
      if ($('#player').hidden || state.view !== this.host || e.target.closest('input,textarea,select,button')) return;
      if (e.code === 'Space') { e.preventDefault(); this.togglePlay(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); this.seekTo(this.beat + (e.key === 'ArrowLeft' ? -1 : 1) * this.song.bpb); }
    });
  },
  showFingers(on) {
    $('#plFingersBtn').setAttribute('aria-expanded', String(on)); $('#plDetails').hidden = !on;
    this.curIdx = -1; if (this.song) this.renderNow();
  },
  showOpts(on) { $('#plOpts').classList.toggle('open', on); $('#plOptsBtn').setAttribute('aria-expanded', String(on)); },
  /* El reproductor sirve para canciones y para los ejercicios "con metrónomo" de Aprender: se coloca en
     la vista que lo usa (host). Un ejercicio trae sus eventos ya construidos (song.built). */
  host: 'canciones',
  mount(host) {
    const pl = $('#player'), sec = $(`section[data-view="${host}"]`);
    if (pl.parentElement !== sec) sec.appendChild(pl);
    this.host = host;
  },
  open(song, host = 'canciones') {
    this.mount(host);
    this.song = song; this.built = song.built || buildSong(song, CHORDS);
    const ex = !!song.exercise;
    $('#plLevel').hidden = ex;
    $('#plLevel').innerHTML = Object.keys(LEVELS).filter((l) => this.built.levels[l]?.length).map((l) => `<button type="button" data-l="${l}">${LEVELS[l]}<span class="hidden sm:inline font-medium opacity-60"> · ${song.levelHints?.[l] || LEVEL_HINT[l]}</span></button>`).join('');
    $('#plTitle').textContent = song.title; $('#plOrigin').textContent = ex || song.user ? `${song.origin} · ${song.bpm} ppm` : `${song.origin} · ${song.bpm} ppm · ${song.bpb}/4`;
    $('#plEdit').hidden = !song.user; $('#songImport').hidden = true;
    if (ex) { this.metro = true; $('#plMetro').checked = true; }
    $('#songList').hidden = host === 'canciones';
    $('#player').hidden = false; this.showFingers(false); this.showOpts(false);
    this.loop = null; this.renderLoop();
    this.setSpeed(ex ? store.get('exSpeed', 2) : store.get('speed', 1)); // los ejercicios ya traen su velocidad ajustada: van en Normal
    this.setLevel(ex ? 'easy' : store.get('lvl:' + song.id, 'easy'));
    this.resize(); Cal.sync();
  },
  close() {
    this.pause(); $('#player').hidden = true; closeModal('#resModal');
    if (this.song?.exercise) { const id = this.song.exercise.id; this.song = null; Cal.sync(); if (location.hash !== '#aprender/ej/' + id) location.hash = '#aprender/ej/' + id; return; }
    this.song = null; $('#songList').hidden = false; Songs.render(); Cal.sync();
  },
  // al salir de la vista que lo tiene, vuelve a su sitio en Canciones
  release() {
    if (this.host === 'canciones') return;
    this.pause(); $('#player').hidden = true; this.song = null; this.mount('canciones'); $('#songList').hidden = false;
  },
  setLevel(l) {
    if (!this.built.levels[l]) l = 'easy';
    this.level = l; store.set('lvl:' + this.song.id, l);
    $$('#plLevel button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.l === l)));
    if (this.loop) { this.loop = null; this.renderLoop(); }
    this.reset(); this.renderChip();
  },
  // en pantallas estrechas, bajo el título: nivel y velocidad de un vistazo (y abre las opciones)
  renderChip() {
    if (!this.song) return;
    $('#plChip').innerHTML = `${this.song.exercise ? '' : LEVELS[this.level] + ' · '}${SPEEDS[this.speedIdx].n}${this.loop ? icon('repeat-line') : ''}${icon('arrow-down-s-line')}`;
  },
  /* Repetir un tramo: n compases desde el compás en el que estés. Al llegar al final vuelve al principio
     con un compás de cuenta, y si la vuelta sale con un 90 % o más, sube un punto la velocidad. */
  setLoop(n) {
    if (!n) this.loop = null;
    else {
      const bpb = this.song.bpb, p = this.built.pickup, last = this.events[this.events.length - 1];
      const started = this.status === 'playing' || this.status === 'paused';
      const at = started ? Math.max(this.beat, this.firstT()) : this.loop?.a ?? this.firstT();
      const a = p + Math.floor((at - p) / bpb + 1e-6) * bpb, end = p + Math.ceil(((last?.t ?? 0) + 0.01 - p) / bpb) * bpb;
      this.loop = { a, b: Math.min(a + n * bpb, Math.max(end, a + bpb)), n, pass: 0 };
      if (this.status !== 'playing') this.toLoopStart();
    }
    this.renderLoop(); this.renderChip();
  },
  renderLoop() { $$('#plLoop button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.n === (this.loop?.n || 0)))); },
  toLoopStart() { this.seekTo(this.loop.a - this.song.bpb); },
  loopPass() {
    const L = this.loop, ev = this.events.filter((e) => e.t >= L.a - 1e-6 && e.t < L.b - 1e-6);
    const acc = ev.length ? ev.reduce((s, e) => s + (e.st === 1 ? HIT[e.kind]?.w ?? 1 : 0), 0) / ev.length : 0, pct = Math.round(acc * 100);
    L.pass++;
    let msg = `Vuelta ${L.pass} · ${pct} %`;
    if (!this.wait && acc >= 0.9) {
      if (SPEEDS[this.speedIdx].p < 1) { this.setSpeed(this.speedIdx + 1); msg = `¡Bien! Ahora ${SPEEDS[this.speedIdx].n.toLowerCase()}`; } else msg = `Tramo dominado · ${pct} %`;
    }
    this.toLoopStart();
    this.say(msg, acc >= 0.9 ? PAL.ok : PAL.muted, true);
  },
  setSpeed(i) {
    this.speedIdx = clamp(i, 0, 3); if (this.song) store.set(this.song.exercise ? 'exSpeed' : 'speed', this.speedIdx);
    const sp = $('#plSpeed'); sp.value = this.speedIdx; sp.setAttribute('aria-valuetext', SPEEDS[this.speedIdx].n);
    $$('#plSpeedLabels span').forEach((s) => s.classList.toggle('on', +s.dataset.i === this.speedIdx));
    this.renderChip();
  },
  bps() { return (this.song.bpm * SPEEDS[this.speedIdx].p) / 60; },
  firstT() { return this.events[0]?.t ?? 0; },
  startBeat() { return this.firstT() - Math.max(2, Math.round(3 * this.bps())) - 0.001; }, // ~3 s de cuenta atrás
  isChord: (e) => !!(e.chord || e.notes.length > 1),
  reset() {
    clearTimeout(this.resumeTimer); this.inertia = null; this.scrubbing = false;
    this.events = this.built.levels[this.level].map((e) => ({ ...e, st: 0, hitAt: 0, kind: '' }));
    this.showTrack = !this.events.some((e) => e.chord);
    Object.assign(this, { status: 'idle', demo: false, beat: this.startBeat(), idx: 0, combo: 0, maxCombo: 0, points: 0, check: null, lastHitMidi: null, frozen: false, curIdx: -1, flash: null, deltas: [], stats: { perfect: 0, good: 0, early: 0, late: 0, miss: 0, wrong: 0, dead: 0, buzz: 0 }, quals: [] });
    this.attackBeats = new Map();
    this.renderHud(); this.renderButtons(); this.renderNow();
  },
  async start(demo) { // siempre desde el principio
    AudioEngine.ensure();
    if (!demo && !(await micReady())) return;
    this.reset(); this.demo = demo; this.status = 'playing';
    if (this.loop && !demo) { this.loop.pass = 0; this.toLoopStart(); }
    this.renderButtons();
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
  pause() { clearTimeout(this.resumeTimer); if (this.status === 'playing') { this.status = 'paused'; this.renderButtons(); } this.cancelClicks(); },
  // quita los clics que estaban programados y aún no han sonado
  cancelClicks() { for (const [b, o] of this.clickNodes) if (b > this.beat) { try { o.stop(); } catch { /* ya ha sonado */ } } this.clickNodes = []; this.clicked = null; },
  renderButtons() {
    const playing = this.status === 'playing';
    $('#plPlay').innerHTML = icon(playing && !this.demo ? 'pause-fill' : 'play-fill');
    $('#plPlay').setAttribute('aria-label', playing && !this.demo ? 'Pausa' : 'Tocar');
    $('#plDemo').innerHTML = playing && this.demo ? `${icon('pause-fill')}<span>Parar</span>` : `${icon('headphone-line')}<span>Escuchar</span>`;
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
    const ly = this.built.lyrics;
    if (ly?.length) { // canciones añadidas: la letra de la línea que suena y la siguiente
      const k = ly.findLastIndex((l) => l.t <= (e ? e.t : this.beat) + 0.01);
      $('#plNowText').innerHTML = k < 0 ? (e ? this.describe(e) : '') : `${e?.chord ? `<b class="lyr-ch">${chordLabel(e.chord)}</b>` : ''}${esc(ly[k].text)}`;
      $('#plNext').innerHTML = ly[k + 1] ? esc(ly[k + 1].text) : 'Es la última línea';
    } else {
      $('#plNowText').innerHTML = e ? this.describe(e) : '';
      $('#plNext').innerHTML = nx ? `Luego viene ${this.describe(nx, true)}` : 'Es la última';
    }
    if (!$('#plDetails').hidden) {
      $('#plFret').innerHTML = fingersSVG(e);
      const fingers = new Set((e ? (e.chord || e.of ? chordNotes(CHORDS[e.chord || e.of]) : e.notes) : []).map((n) => n.finger).filter(Boolean));
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
    if (e.of) return `<b>${pcName(n.midi)}</b> · ${n.string}ª cuerda · con la forma de <b>${chordLabel(e.of)}</b>`;
    const dot = n.fret ? `<span class="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1" style="background:${fingerVar(n.finger)}"></span>` : '';
    return `<b>${pcName(n.midi)}</b> · ${n.string}ª cuerda ${n.fret ? `· traste ${n.fret} · ${dot}dedo ${n.finger}` : 'al aire'}${n.slur ? ' · <b>ligada</b>, sin pulsar' : ''}`;
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
    this.cancelClicks(); for (const a of Mic.hear?.attacks || []) a.used = true;
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
    // el clic se programa con antelación, restando lo que tarda el altavoz, para que suene justo en el pulso
    if (this.loop && !this.demo && next >= this.loop.b + 0.3 * bps) { this.loopPass(); return; } // deja 0,3 s para juzgar la última nota
    const out = this.wait ? 0 : Mic.outLatency(), ahead = this.beat + (out + 0.05) * bps;
    if (this.clicked == null || this.clicked < Math.floor(this.beat) || this.clicked > ahead + 1) this.clicked = Math.floor(this.beat);
    for (let b = this.clicked + 1; b <= (this.wait ? next : ahead); b++) {
      this.clicked = b;
      if (b < first || this.metro || (this.loop && b < this.loop.a)) this.clickNodes.push([b, AudioEngine.click((((b - this.built.pickup) % bpb) + bpb) % bpb === 0, (b - this.beat) / bps - out)]);
    }
    while (this.clickNodes.length && this.clickNodes[0][0] < this.beat - 1) this.clickNodes.shift();
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
    const doneAll = this.demo ? this.beat > this.built.total + 0.5 : !this.loop && this.idx >= this.events.length && this.beat > (last?.t ?? 0) + 1;
    if (doneAll) this.finish();
  },
  say(text, color, big) { this.flash = { text, color, t: performance.now(), big }; },
  /* Juicio. Cada ataque solo puede valer para UNA nota: la primera pendiente cuya ventana lo contiene
     y que de verdad se ha pulsado en él (attackHas). Una nota que solo sigue sonando no cuenta nunca.
     El ataque se sitúa en la canción por la fecha de su muestra, no por el fotograma en que se ve. */
  judge(f, now, bps) {
    if (!f) return;
    const lat = Mic.latency() * bps; // retardo de entrada, en tiempos
    const winB = (e) => (this.isChord(e) ? WIN.chord : WIN.note) * bps;
    const frozen = this.wait && this.frozen;
    for (const a of f.attacks) {
      if (a.t0 == null || this.attackBeats.has(a.id)) continue;
      const ab = this.beat - ((now - a.t0) / 1000) * bps - lat;
      this.attackBeats.set(a.id, ab);
      // rasgueos: cada ataque abre un análisis para el primer acorde pendiente en su ventana
      const e = this.events.slice(this.idx, this.idx + 6).find((x) => x.st === 0 && this.isChord(x) && (frozen ? x === this.events[this.idx] : Math.abs(ab - x.t) <= winB(x)));
      // un rasgueo lento puede dar dos ataques seguidos: se analiza desde el primero
      if (e && !(this.check && this.check.e === e && a.t0 - this.check.a.t0 < 120)) this.check = { a, e };
    }
    const analysing = this.check && now - this.check.a.t0 < 520;
    // un ataque a tiempo cuya nota aún se está identificando (~100 ms) no puede dar la nota por fallada
    const pend = f.attacks.filter((a) => !a.used && !a.settled && this.attackBeats.has(a.id));
    const waiting = (e) => (analysing && this.check.e === e) || (!this.isChord(e) && pend.some((a) => Math.abs(this.attackBeats.get(a.id) - e.t) <= winB(e)));
    if (!this.wait) {
      while (this.events[this.idx] && (this.beat - lat - this.events[this.idx].t) > winB(this.events[this.idx]) && !waiting(this.events[this.idx])) {
        const e = this.events[this.idx]; if (e.st === 0) this.miss(e); this.idx++;
      }
    }
    if (this.check) {
      const { e, a } = this.check, age = now - a.t0;
      if (e.st !== 0 || age > 520) this.check = null;
      else if (age >= 110) {
        const notes = e.chord ? chordNotes(CHORDS[e.chord]) : e.notes;
        const broad = !a.fluxVec || singleNoteLikeness(a.fluxVec) < 0.62; // no es una sola cuerda
        if (broad && strumOk(Mic.semisFrom(a), hypothesesFor(notes, e.chord), fewFor(notes), notes)) {
          a.used = true; this.hit(e, frozen ? e.t : this.attackBeats.get(a.id), true); this.check = null;
        }
      }
    }
    // notas sueltas
    for (const a of f.attacks) {
      if (a.used || !this.attackBeats.has(a.id) || (!a.after && !a.settled)) continue;
      const ab = this.attackBeats.get(a.id);
      const cand = this.events.slice(this.idx, this.idx + 6).filter((e) => e.st === 0 && !this.isChord(e) && (frozen ? e === this.events[this.idx] : Math.abs(ab - e.t) <= winB(e)));
      const e = cand.find((x) => attackHas(a, x.notes[0].midi));
      if (e) {
        a.used = true;
        for (let k = this.idx; this.events[k] !== e; k++) if (this.events[k].st === 0) this.miss(this.events[k]); // te has saltado alguna
        this.hit(e, frozen ? e.t : ab, false, e.notes[0].midi, a);
      } else if (a.settled) {
        a.used = true;
        // solo se dice "eso es X" si lo confirman los dos detectores
        if (cand.length && this.check?.a !== a && a.flux != null && a.yin != null && sameNote(a.yin, a.flux)) {
          this.say(`Eso es ${pcName(a.flux)}`, PAL.muted);
          if (!this.wait) { this.combo = 0; this.stats.wrong++; this.renderHud(); }
        }
      }
    }
    // ligados (sin golpe de púa): la nota no sonaba y ahora sí. Lejos de cualquier ataque y distinta de la anterior.
    const e = this.events[this.idx];
    if (e && e.st === 0 && !this.isChord(e) && f.stable != null && !sameNote(f.stable, this.lastHitMidi ?? -99) && now - Mic.lastOnset > 300) {
      const eff = frozen ? e.t : this.beat - lat - 0.06 * bps; // la subida se ve unos 60 ms después
      if (Math.abs(eff - e.t) <= winB(e) && softOnset(Mic.hear.ear, e.notes[0].midi, f.stable)) this.hit(e, eff, false, f.stable);
    }
    // pisada de las notas acertadas: es un consejo, no quita puntos
    for (const q of this.quals) {
      if (f.attacks.some((a) => a.pos > q.a.pos && a.pos < q.a.pos + 0.3 * Mic.sr)) { q.done = true; continue; } // otra nota encima: no se puede medir
      const m = noteQuality(Mic.hear.ear, q.a.pos, q.midi); if (!m) continue;
      q.done = true;
      const v = pisada(m);
      if (v !== 'ok') { q.e.q = v; this.stats[v]++; this.say(v === 'dead' ? 'Se apaga pronto' : 'Trastea', PAL.warn); }
    }
    if (this.quals.length) this.quals = this.quals.filter((q) => !q.done);
  },
  hit(e, atBeat, strum, midi, attack) {
    e.st = 1; e.hitAt = performance.now(); this.lastHitMidi = midi ?? null;
    const i = this.events.indexOf(e); if (i >= this.idx) this.idx = i + 1;
    this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
    // pisada: se mide si la nota tiene tiempo de sonar (casi medio segundo hasta la siguiente)
    if (attack && !strum) { const nx = this.events[i + 1]; if (!nx || (nx.t - e.t) / this.bps() >= 0.45) this.quals.push({ e, a: attack, midi: e.notes[0].midi }); }
    if (this.wait) { e.kind = 'perfect'; this.stats.perfect++; this.say('¡Bien!', PAL.ok); this.renderHud(); return; }
    // un rasgueo tarda ~50 ms en recorrer las cuerdas y su ataque se detecta algo más tarde
    const d = (atBeat - e.t) / this.bps() - (strum ? 0.02 : 0), ad = Math.abs(d);
    this.deltas.push(d);
    e.kind = ad <= (strum ? WIN.chordPerfect : WIN.notePerfect) ? 'perfect' : ad <= (strum ? WIN.chordGood : WIN.noteGood) ? 'good' : d < 0 ? 'early' : 'late';
    e.d = d;
    this.stats[e.kind]++;
    const before = this.mult();
    this.points += HIT[e.kind].pts * this.mult();
    if (this.mult() > before) this.say(`¡Racha! ×${this.mult()}`, PAL.accent, true);
    else this.say(HIT[e.kind].say, e.kind === 'perfect' || e.kind === 'good' ? PAL.ok : PAL.warn);
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
    const judged = this.events.filter((e) => e.st !== 2), st = this.stats, ex = this.song.exercise;
    const doneKey = ex ? 'ex:' + ex.id : `song:${this.song.id}:${this.level}`;
    Learn.markDone(doneKey);
    const acts = [{ label: 'Repetir', icon: 'restart-line', fn: () => this.start(false) }];
    const order = Object.keys(LEVELS).filter((l) => this.built.levels[l]?.length), up = order[order.indexOf(this.level) + 1];
    if (!ex && up) acts.push({ label: `Pasar a ${LEVELS[up]}`, fn: () => this.setLevel(up) });
    const nxt = Learn.nextAction(doneKey); if (nxt) acts.push(nxt);
    if (acts.length > 1) acts[acts.length - 1].kind = 'primary'; else acts[0].kind = 'primary';
    if (this.wait) {
      showResult({ title: 'Práctica completada', text: `Has tocado las ${judged.length} notas. Quita «Esperarme» para tocar a tempo y puntuar.`, actions: acts });
      return;
    }
    const acc = judged.length ? (st.perfect + HIT.good.w * st.good + 0.5 * (st.early + st.late)) / judged.length : 0;
    const stars = starsFor(acc), key = `${this.song.id}:${this.level}`, prev = state.best[key];
    const record = !prev || this.points > prev.pts;
    state.best[key] = { stars: Math.max(stars, prev?.stars || 0), acc: Math.max(acc, prev?.acc || 0), pts: Math.max(this.points, prev?.pts || 0) };
    store.set('best2', state.best);
    const avg = this.deltas.length >= 4 ? this.deltas.reduce((a, b) => a + b, 0) / this.deltas.length : 0;
    // los dos compases seguidos donde más se falla, para repetirlos
    const bpb = this.song.bpb, pk = this.built.pickup, bars = new Map();
    for (const e of judged) { const k = Math.floor((e.t - pk) / bpb + 1e-6); bars.set(k, (bars.get(k) || 0) + (e.st === -1 ? 1 : e.kind === 'early' || e.kind === 'late' ? 0.5 : 0)); }
    let worst = null;
    for (const k of bars.keys()) { const v = bars.get(k) + (bars.get(k + 1) || 0); if (v >= 2 && (!worst || v > worst.v)) worst = { k, v }; }
    if (worst && !ex && st.miss < judged.length * 0.8) acts.splice(1, 0, { label: `Repetir los compases ${worst.k + 1} y ${worst.k + 2}`, icon: 'repeat-line', fn: () => { this.loop = { a: pk + worst.k * bpb, b: pk + (worst.k + 2) * bpb, n: 2, pass: 0 }; this.renderLoop(); this.renderChip(); this.start(false); } });
    showResult({
      stars, title: starsLine(stars),
      text: [Math.abs(avg) >= 0.045 ? (avg < 0 ? `Sueles adelantarte unos ${Math.round(-avg * 1000)} ms. Espera a que la bola caiga en la nota.` : `Sueles ir unos ${Math.round(avg * 1000)} ms tarde. Anticípate un poco.`) : stars < 2 && !ex ? 'Prueba más lento o activa «Esperarme».' : '',
        worst && !ex && st.miss < judged.length * 0.8 ? `Donde más fallas es en los compases ${worst.k + 1} y ${worst.k + 2}.` : '',
        ex ? Learn.exResult(ex, acc, SPEEDS[this.speedIdx].p, this.song.bpm) : '',
        st.dead >= 2 ? `${st.dead} notas se apagaron pronto. Mantén el dedo apretado justo detrás del traste hasta la nota siguiente.` : '',
        st.buzz >= 2 ? `${st.buzz} notas trastearon. Acerca el dedo al traste y aprieta un poco más.` : ''].filter(Boolean).join(' '),
      big: [[`${Math.round(acc * 100)}%`, 'precisión'], [this.points.toLocaleString('es-ES'), record ? 'puntos · récord' : 'puntos'], [this.maxCombo, 'mejor racha']],
      grid: [['Perfecto', st.perfect, 'var(--ok)'], ['Bien', st.good, 'var(--ok)'], ['Pronto', st.early, 'var(--warn)'], ['Tarde', st.late, 'var(--warn)'], ['Fallo', st.miss, 'var(--bad)']],
      actions: acts,
    });
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
    const top = clamp(H * 0.22, 48, 74), gap = (H - top - 28) / 5, ly = (s) => top + (s - 1) * gap;
    this.r = clamp(gap * 0.42, 9, 15); this.rc = clamp(gap * 0.36, 8, 11);
    const gutter = 46, nowX = gutter + Math.min(160, W * 0.22), ppb = this.ppb();
    // en reposo se enseña el principio de la canción, no el hueco de la cuenta atrás
    // (y con un tramo marcado y en pausa antes de él, el principio del tramo)
    const rest = this.status === 'idle' ? this.firstT() : this.status === 'paused' && this.loop && this.beat < this.loop.a && !this.drag && !this.inertia ? this.loop.a : null;
    const beat = rest == null ? this.beat : Math.max(this.beat, rest - (W < 640 ? 0.5 : 1));
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
    if (this.loop) { // tramo que se repite
      const xa = Math.max(gutter, X(this.loop.a)), xb = Math.min(W, X(this.loop.b));
      if (xb > xa) { c.fillStyle = this.hexA(PAL.accent, 0.045); c.fillRect(xa, top - 26, xb - xa, ly(6) + 48 - top); c.fillStyle = PAL.accent; c.fillRect(xa, top - 28, xb - xa, 3); }
    }
    for (let s = 1; s <= 6; s++) {
      c.strokeStyle = PAL['line-2']; c.lineWidth = 1 + (s - 1) * 0.35;
      c.beginPath(); c.moveTo(gutter, ly(s)); c.lineTo(W, ly(s)); c.stroke();
    }
    if (this.showTrack && this.built.chordTrack.length) { // nombres de acordes arriba si los eventos no los llevan
      c.font = `650 13px ${FONT}`; c.textAlign = 'left';
      for (const seg of this.built.chordTrack) {
        const x = X(seg.t); if (x > W || x + seg.dur * ppb < gutter) continue;
        c.fillStyle = PAL.muted; c.fillText(chordLabel(seg.chord), Math.max(gutter + 4, x + 4), Math.min(22, top * 0.32));
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
        const tw = c.measureText(this.flash.text).width + 26, fx = nowX + 40 + tw / 2, fy = Math.min(40, top * 0.55) - Math.min(age, 300) * 0.02;
        c.fillStyle = this.hexA(this.flash.color, 0.16); c.beginPath(); c.roundRect(fx - tw / 2, fy - 16, tw, 32, 16); c.fill();
        c.fillStyle = this.flash.color; c.textBaseline = 'middle'; c.fillText(this.flash.text, fx, fy + 1); c.textBaseline = 'alphabetic';
        c.globalAlpha = 1;
      }
    }
    const cx = (nowX + W) / 2;
    // cy: centro del aviso. En reposo va abajo, para que se vean las primeras notas.
    const banner = (title, sub, low) => {
      c.textAlign = 'center';
      c.font = `700 17px ${DISP}`; const w1 = c.measureText(title).width; c.font = `500 12.5px ${FONT}`; const w2 = sub ? c.measureText(sub).width : 0;
      const bw = Math.min(W - 24, Math.max(w1, w2) + 44), bh = sub ? 62 : 44, bx = clamp(cx, bw / 2 + 12, W - bw / 2 - 12), cy = low ? H - bh / 2 - 26 : H / 2;
      c.fillStyle = this.hexA(PAL.surface, 0.94); c.beginPath(); c.roundRect(bx - bw / 2, cy - bh / 2, bw, bh, 18); c.fill();
      c.fillStyle = PAL.text; c.font = `700 17px ${DISP}`; c.fillText(title, bx, cy + (sub ? -4 : 6));
      if (sub) { c.fillStyle = PAL.muted; c.font = `500 12.5px ${FONT}`; c.fillText(sub, bx, cy + 17); }
    };
    const go = this.loop && beat < this.loop.a ? this.loop.a : this.firstT(); // dónde acaba la cuenta atrás
    if (this.status === 'playing' && beat < go && go - beat <= 8) {
      const n = Math.ceil(go - beat), k = go - beat - (n - 1);
      c.textAlign = 'center'; c.fillStyle = PAL.text; c.globalAlpha = 0.4 + 0.6 * k; c.font = `800 ${Math.round(56 + 24 * k)}px ${DISP}`; c.fillText(n, cx, H / 2 + 22); c.globalAlpha = 1;
    } else if (this.status === 'idle' || this.status === 'done') banner('Toca aquí para empezar', W < 640 ? '' : 'Desliza a los lados para moverte por la canción', true);
    else if (this.status === 'paused' && !this.scrubbing && !this.drag) banner('En pausa', 'Toca para seguir o desliza para moverte');
  },
  // Bola que salta de nota en nota y cae justo cuando hay que tocar
  drawBall(c, nowX, ly, now) {
    const ev = this.events; if (!ev.length) return;
    const yOf = (e) => (this.isChord(e) ? ly(Math.min(...e.notes.map((n) => n.string))) - this.rc - 19 : ly(e.notes[0].string) - this.r - 7);
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
  hitColor(e) { return e.kind === 'perfect' || e.kind === 'good' ? PAL.ok : PAL.warn; },
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
    for (const m of e.also || []) this.drawDot(c, x, ly(m.string), m, this.r * 0.8); // otras cuerdas de la misma pulsación (tablaturas)
    this.drawDot(c, x, y, n, this.r);
    this.drawHit(c, e, x, y, this.r, now);
  },
  drawChord(c, e, x, ly, now) {
    const ss = e.notes.map((n) => n.string), s1 = Math.min(...ss), s2 = Math.max(...ss);
    c.fillStyle = 'rgba(128,128,140,0.08)'; c.strokeStyle = e.st === 1 ? this.hitColor(e) : PAL['line-2']; c.lineWidth = e.st === 1 ? 2.5 : 1.5;
    c.beginPath(); c.roundRect(x - 16, ly(s1) - 16, 32, ly(s2) - ly(s1) + 32, 16); c.fill(); c.stroke();
    if (e.dir !== 'U') for (let s = 1; s <= 6; s++) if (!ss.includes(s)) {
      c.strokeStyle = PAL.faint; c.lineWidth = 2; const y = ly(s);
      c.beginPath(); c.moveTo(x - 4, y - 4); c.lineTo(x + 4, y + 4); c.moveTo(x + 4, y - 4); c.lineTo(x - 4, y + 4); c.stroke();
    }
    for (const n of e.notes) this.drawDot(c, x, ly(n.string), n, this.rc);
    const ay = ly(s2) + 26; c.fillStyle = e.dir === 'U' ? PAL.muted : PAL.text;
    c.beginPath();
    if (e.dir === 'U') { c.moveTo(x, ay - 6); c.lineTo(x - 6, ay + 3); c.lineTo(x + 6, ay + 3); } else { c.moveTo(x, ay + 4); c.lineTo(x - 6, ay - 5); c.lineTo(x + 6, ay - 5); }
    c.fill();
    if (e.chord && e.first) { c.fillStyle = PAL.text; c.font = '750 14px Inter, system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(chordLabel(e.chord), x, Math.min(22, ly(1) * 0.32)); }
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

const VIEWS = ['afinador', 'aprender', 'canciones', 'ajustes'];
function route() {
  const [v, ...rest] = (location.hash || '').slice(1).split('/');
  // sin dirección: la última pestaña que se usó (la primera vez, Aprender)
  const view = v === 'acordes' ? 'aprender' : VIEWS.includes(v) ? v : VIEWS.includes(store.get('view', '')) ? store.get('view', '') : 'aprender';
  const prev = state.view;
  state.view = view; store.set('view', view);
  $$('section[data-view]').forEach((s) => { s.hidden = s.dataset.view !== view; });
  $$('[data-tab]').forEach((a) => (a.dataset.tab === view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  if (view !== Player.host) Player.pause();
  if (view === 'canciones') Player.release();
  if (view !== 'aprender' || prev !== 'aprender') Learn.leave();
  if (view === 'aprender') Learn.show(rest.map(decodeURIComponent));
  if (view === 'ajustes') Settings.render();
  if (view === 'afinador') $('#tnNext').hidden = !Learn.inRoutine || todayDone().includes('tune');
  Cal.sync();
  if (view === Player.host) requestAnimationFrame(() => Player.resize());
}

function setNotation(n) {
  state.notation = n; store.set('notation', n);
  refreshAll();
}
// tras cambiar notación, orientación de diagramas, mano o tema
function refreshAll() {
  readPalette();
  Tuner.setMode(Tuner.mode); Tuner.last = {}; Learn.render(); Songs.render();
  Player.curIdx = -1; if (Player.song) Player.renderNow();
  if (state.view === 'ajustes') Settings.render();
}
function applyTheme(t) {
  state.theme = t; store.set('theme', t);
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
  const meta = $('meta[name="theme-color"]'); if (meta) meta.content = getComputedStyle(document.body).backgroundColor;
}

/* ============================================================
   Ajustes
   ============================================================ */
const Settings = {
  render() {
    const seg = (key, opts, cur) => `<div class="seg" data-set="${key}" role="group">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${String(v) === String(cur)}">${l}</button>`).join('')}</div>`;
    $('#settings').innerHTML = `<div class="set-wrap">
      <h1 class="set-title">Ajustes</h1>
      <section class="set-card">
        <div class="set-head"><h2>${icon('mic-line')}Micrófono</h2></div>
        <div class="mic-card" data-mic-card></div>
        <div class="cal-host" hidden></div>
      </section>
      <section class="set-card">
        <div class="set-row"><div><h3>Nombres de las notas</h3><p>Se aplica en toda la app.</p></div>${seg('notation', [['latin', 'Do Re Mi'], ['letter', 'C D E']], state.notation)}</div>
        <div class="set-row"><div><h3>Diagramas de acordes</h3><p>${state.diagram === 'h' ? 'En horizontal, como en la tablatura, con la 6ª cuerda abajo.' : 'En vertical, como en los cancioneros, con la 6ª cuerda a la ' + (state.lefty ? 'derecha.' : 'izquierda.')}</p></div>${seg('diagram', [['v', icon('layout-column-line') + 'Vertical'], ['h', icon('layout-row-line') + 'Horizontal']], state.diagram)}</div>
        <div class="set-row"><div><h3>Mano</h3><p>${state.lefty ? 'Los diagramas, el mástil y la mano se dibujan en espejo.' : 'Si tocas con la guitarra al revés, elige zurdo y verás los dibujos en espejo.'}</p></div>${seg('lefty', [['0', 'Diestro'], ['1', 'Zurdo']], state.lefty ? 1 : 0)}</div>
        <div class="set-preview"><div class="diagram">${chordDiagram(CHORDS.C)}</div><p>Así se ven ahora los acordes (Do mayor).</p></div>
        <div class="set-row"><div><h3>Tema</h3><p>En automático sigue el de tu dispositivo.</p></div>${seg('theme', [['auto', 'Auto'], ['dark', icon('moon-line') + 'Oscuro'], ['light', icon('sun-line') + 'Claro']], state.theme)}</div>
      </section>
      <section class="set-card">
        <div class="set-row"><div><h3>Probar la escucha</h3><p>Toca notas sueltas y mira qué oye Traste en cada una: la nota, si suena limpia y cuánto aguanta.</p></div><button type="button" class="btn btn-soft btn-sm" data-diag>${Diag.on ? 'Cerrar' : 'Abrir'}</button></div>
        ${Diag.on ? `<div class="diag"><div id="diagRows">${Diag.rowsHTML()}</div>
          ${window.self !== window.top ? '' : `<div class="diag-foot"><button type="button" class="btn btn-soft btn-sm" data-diag-save>${icon('download-2-line')}Guardar los últimos 5 segundos</button><span>Un archivo WAV con lo que ha oído el micrófono, por si quieres revisar un caso raro.</span></div>`}</div>` : ''}
      </section>
      <section class="set-card">
        <div class="set-row"><div><h3>Tu progreso</h3><p>Acordes aprendidos, récords y práctica de hoy. Solo se guarda en este navegador.</p></div><button type="button" class="btn btn-soft btn-sm" data-reset>${icon('delete-bin-line')}Borrar</button></div>
      </section>
      <p class="set-foot">Traste es gratis y no necesita cuenta. El sonido se analiza en tu navegador y no sale de tu equipo.</p>
    </div>`;
    MicCard.render(); Cal.sync();
  },
  init() {
    $('#settings').addEventListener('click', (e) => {
      const b = e.target.closest('[data-set] button');
      if (b) {
        const key = b.closest('[data-set]').dataset.set, v = b.dataset.v;
        if (key === 'notation') return setNotation(v);
        if (key === 'diagram') { state.diagram = v; store.set('diagram', v); }
        if (key === 'lefty') { state.lefty = v === '1'; store.set('lefty', state.lefty); }
        if (key === 'theme') applyTheme(v);
        refreshAll(); return;
      }
      if (e.target.closest('[data-diag]')) { Diag.toggle(); return; }
      if (e.target.closest('[data-diag-save]')) { Diag.save(); return; }
      if (e.target.closest('[data-reset]') && confirm('¿Borrar tus acordes aprendidos, récords y la práctica de hoy? Los ajustes y el micrófono se mantienen.')) {
        state.learned = {}; state.best = {}; state.rec = {};
        for (const k of ['learned', 'best2', 'rec', 'today', 'lesson']) store.set(k, k === 'lesson' ? null : {});
        refreshAll(); toast('Progreso borrado.', 3000, 'check-line');
      }
    });
  },
};

/* Probar la escucha: cada nota que tocas, con lo que el oído ha medido en ella */
const Diag = {
  on: false, rows: [], seen: new Set(),
  async toggle() {
    if (!this.on && !(await ensureMic())) return;
    this.on = !this.on; this.rows = []; this.seen = new Set((Mic.hear?.attacks || []).map((a) => a.id));
    Settings.render();
  },
  rowsHTML() {
    if (!this.rows.length) return '<p class="diag-empty">Toca una nota y déjala sonar.</p>';
    return this.rows.map((r) => `<div class="diag-row"><b>${r.note}</b><span class="tag ${r.v}">${r.label}</span><span>${r.info}</span></div>`).join('');
  },
  frame(f) {
    if (!this.on || !f) return;
    for (const a of f.attacks) {
      if (this.seen.has(a.id) || !a.settled) continue;
      const midi = a.flux ?? a.yin;
      const other = f.attacks.some((b) => b.pos > a.pos && b.pos < a.pos + 0.3 * Mic.sr);
      const q = midi == null || other ? null : noteQuality(Mic.hear.ear, a.pos, midi);
      if (midi != null && !other && !q) continue; // aún midiendo
      this.seen.add(a.id);
      const v = midi == null ? 'none' : q ? pisada(q) : 'na';
      this.rows.unshift({
        note: midi == null ? '—' : `${pcName(midi)}${octave(midi)}`, v,
        label: { none: 'sin nota clara', na: 'otra nota encima', ok: 'limpia', dead: 'se apaga', buzz: 'trastea' }[v],
        info: q ? `cae ${fmt(q.decay, 0)} dB en 160 ms · agudos ${Math.round(q.hf2 * 100)} %` : `fuerza ${Math.round(a.strength)}`,
      });
      this.rows.length = Math.min(this.rows.length, 8);
      const el = $('#diagRows'); if (el) el.innerHTML = this.rowsHTML();
    }
  },
  save() {
    const ear = Mic.hear?.ear; if (!ear) return;
    const n = Math.min(ear.n, 5 * ear.sr), x = ear.read(ear.n, n, new Float32Array(n)), b = new DataView(new ArrayBuffer(44 + n * 2));
    const str = (o, t) => { for (let i = 0; i < t.length; i++) b.setUint8(o + i, t.charCodeAt(i)); };
    str(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
    b.setUint32(24, ear.sr, true); b.setUint32(28, ear.sr * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); str(36, 'data'); b.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) b.setInt16(44 + i * 2, clamp(x[i], -1, 1) * 32767, true);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([b], { type: 'audio/wav' })); a.download = 'traste-muestra.wav'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
};

let lastT = performance.now();
function loop(t) {
  const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
  let f = null;
  if (Mic.on) { f = Mic.analyze(t); MicCard.frame(f.level); }
  try {
    Cal.frame(f, t);
    if (state.view === 'afinador') Tuner.frame(f, dt, t);
    else if (state.view === Player.host && !$('#player').hidden) Player.frame(f, dt, t);
    else if (state.view === 'aprender') Learn.frame(f, dt, t);
    else if (state.view === 'ajustes') Diag.frame(f);
  } catch (err) { console.error(err); }
  requestAnimationFrame(loop);
}

function boot() {
  hydrateIcons();
  applyTheme(state.theme);
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { readPalette(); Tuner.renderStrings(); Learn.render(); });
  MySongs.load();
  Tuner.init(); Learn.init(); Songs.init(); Player.init(); Settings.init(); MySongs.init();
  navigator.mediaDevices?.addEventListener?.('devicechange', () => { if (Mic.on) fillMicSelect(); });
  window.addEventListener('hashchange', route);
  readPalette(); Tuner.renderStrings();
  onMicChange(); route();
  requestAnimationFrame(loop);
}
