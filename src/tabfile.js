/* ============================================================
   Abrir archivos de tablatura: Guitar Pro (.gp, .gp3, .gp4, .gp5, .gpx) y MusicXML.
   A diferencia de una tablatura pegada como texto, el archivo trae el tempo y la duración exacta de
   cada nota. Los lee alphaTab (código abierto, MPL-2.0), que se descarga solo la primera vez que se
   abre un archivo. La canción se guarda en este navegador, como las demás canciones tuyas.
   ============================================================ */
const ALPHATAB_URL = 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.8.4/dist/alphaTab.min.js';

// orden en que se tocan los compases, con repeticiones y casillas de 1ª y 2ª vez
function barOrder(mbs) {
  const out = []; let i = 0, start = 0, pass = 1, guard = 0;
  while (i < mbs.length && guard++ < 4000) {
    const mb = mbs[i];
    if (mb.isRepeatStart && start !== i) { start = i; pass = 1; }
    if (mb.alternateEndings && !(mb.alternateEndings & (1 << (pass - 1)))) { i++; continue; } // casilla de otra vuelta
    out.push(i);
    if (mb.isRepeatEnd && pass < mb.repeatCount) { pass++; i = start; continue; }
    if (mb.isRepeatEnd || (mb.alternateEndings && !mbs[i + 1]?.alternateEndings)) { pass = 1; start = i + 1; }
    i++;
  }
  return out;
}

// pistas de guitarra de seis cuerdas que tiene el archivo
function scoreTracks(score) {
  return score.tracks.map((tr, i) => {
    const st = tr.staves[0], tuning = st && (st.tuning || st.stringTuning?.tunings || []);
    let n = 0; if (st) for (const bar of st.bars) for (const b of bar.voices[0]?.beats || []) if (!b.isRest) n += b.notes.length ? 1 : 0;
    return { i, name: tr.name || `Pista ${i + 1}`, ok: !!st && !st.isPercussion && tuning.length === 6, beats: n, standard: tuning.length === 6 && tuning.join() === '64,59,55,50,45,40', tuning };
  });
}

/* Partitura de alphaTab → eventos de Traste. Los tiempos van en negras (960 ticks). Las notas ligadas
   a la anterior no se vuelven a tocar y los martillos y tirones se marcan como ligados. */
function scoreToSong(score, trackIndex) {
  const mbs = score.masterBars, staff = score.tracks[trackIndex].staves[0], order = barOrder(mbs), ev = [];
  let t0 = 0;
  for (const bi of order) {
    const mb = mbs[bi], bar = staff.bars[bi], len = mb.calculateDuration() / 960;
    const beats = bar?.voices[0]?.beats || [];
    const frets = beats.flatMap((b) => b.notes.map((n) => n.fret)).filter((f) => f > 0), base = frets.length ? Math.min(...frets) : 1;
    for (const b of beats) {
      if (b.isRest || b.graceType) continue;
      const notes = b.notes.filter((n) => !n.isTieDestination && !n.isDead).map((n) => {
        const lf = n.leftHandFinger, finger = n.fret === 0 ? 0 : lf >= 1 && lf <= 4 ? lf : clamp(n.fret - base + 1, 1, 4);
        return { string: 7 - n.string, fret: n.fret, finger, midi: n.realValue, ...(n.isHammerPullDestination ? { slur: true } : {}) };
      }).filter((n) => n.string >= 1 && n.string <= 6 && n.midi >= 36 && n.midi <= 96);
      if (notes.length) ev.push({ t: +(t0 + b.playbackStart / 960).toFixed(4), dur: +Math.max(0.25, b.playbackDuration / 960).toFixed(4), notes: notes.sort((a, z) => z.string - a.string) });
    }
    t0 += len;
  }
  const first = mbs[0], bpb = Math.max(1, Math.round((first.timeSignatureNumerator * 4) / first.timeSignatureDenominator));
  return { title: score.title || '', artist: score.artist || '', bpm: Math.round(score.tempo) || 90, bpb, pickup: first.isAnacrusis ? +(first.calculateDuration() / 960).toFixed(4) : 0, total: +t0.toFixed(4), events: ev };
}
// para guardar: [t, dur, [[cuerda, traste, dedo, midi, ligada]]]
const packEvents = (ev) => ev.map((e) => [e.t, e.dur, e.notes.map((n) => [n.string, n.fret, n.finger, n.midi, n.slur ? 1 : 0])]);
const unpackEvents = (p) => p.map(([t, dur, ns]) => ({ t, dur, notes: ns.map(([string, fret, finger, midi, slur]) => ({ string, fret, finger, midi, ...(slur ? { slur: true } : {}) })) }));

const TabFile = {
  lib: null,
  load() {
    if (window.alphaTab) return Promise.resolve(window.alphaTab);
    return this.lib || (this.lib = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = ALPHATAB_URL;
      s.onload = () => (window.alphaTab ? res(window.alphaTab) : rej(new Error('lector')));
      s.onerror = () => { this.lib = null; rej(new Error('red')); };
      document.head.appendChild(s);
    }));
  },
  async read(file) {
    const at = await this.load();
    const settings = new at.Settings();
    return at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(await file.arrayBuffer()), settings);
  },
};

if (typeof module !== 'undefined') { globalThis.clamp = (v, a, b) => Math.max(a, Math.min(b, v)); module.exports = { barOrder, scoreTracks, scoreToSong, packEvents, unpackEvents }; }
