/* ============================================================
   Lector de cifrados pegados por el usuario (La Cuerda, Ultimate Guitar, Cifra Club…).
   Entiende acordes en las dos notaciones (Am / LAm / Lam), acordes encima de la letra o entre
   corchetes, partes (Intro, Estribillo…), repeticiones (/: … :/, x2, «(Estribillo)») y tablaturas
   de seis líneas. Ignora la leyenda de diagramas, menús y comentarios que se copian de más.
   Funciones puras: se prueban en Node (test/dsp.test.js).
   ============================================================ */
// en el navegador usa las funciones de dsp.js ya cargadas; en Node las importa
const DSP = typeof stringMidi === 'undefined' ? require('./dsp.js') : { stringMidi, chordNotes, STRUM_PATTERNS };
const LATIN_ROOTS = { DO: 0, RE: 2, MI: 4, FA: 5, SOL: 7, LA: 9, SI: 11 };
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// sufijo escrito → sufijo canónico
const SUFFIXES = {
  '': '', M: '', maj: '', m: 'm', min: 'm', '-': 'm',
  7: '7', m7: 'm7', min7: 'm7', '-7': 'm7', maj7: 'maj7', M7: 'maj7', '7M': 'maj7', 'Δ': 'maj7', maj9: 'maj7',
  sus: 'sus4', sus4: 'sus4', 4: 'sus4', sus2: 'sus2', 2: 'add9', add9: 'add9', add2: 'add9', 9: '7', m9: 'm7', 11: '7', 13: '7',
  dim: 'dim', dim7: 'dim', '°': 'dim', 'º': 'dim', 'ø': 'm7b5', m7b5: 'm7b5', 'm7-5': 'm7b5', min7b5: 'm7b5',
  aug: 'aug', '+': 'aug', '+5': 'aug', 6: '6', m6: 'm6', '7sus4': '7sus4', '7sus': '7sus4', 5: '5', '7b9': '7', '7#9': '7',
};
const CHORD_RE = /^(DO|Do|RE|Re|MI|Mi|FA|Fa|SOL|Sol|LA|La|SI|Si|[A-G])([#b♯♭]?)([^/]*?)(?:\/([A-G]|DO|Do|RE|Re|MI|Mi|FA|Fa|SOL|Sol|LA|La|SI|Si)[#b♯♭]?)?$/;

// "LAm" → { pc: 9, suffix: 'm', id: 'Am' }; null si no es un acorde
function parseChordName(tok) {
  const t = tok.replace(/^\[(?:ch\])?|(?:\[\/ch)?\]$/g, '').replace(/\*+$/, '');
  const m = CHORD_RE.exec(t);
  if (!m) return null;
  const rootTxt = m[1].toUpperCase();
  let pc = rootTxt.length > 1 ? LATIN_ROOTS[rootTxt] : LETTER_PC[rootTxt];
  if (m[2] === '#' || m[2] === '♯') pc += 1; else if (m[2] === 'b' || m[2] === '♭') pc -= 1;
  pc = (pc + 12) % 12;
  const raw = m[3];
  const suffix = SUFFIXES[raw];
  if (suffix === undefined) return null;
  return { pc, suffix, id: SHARP_NAMES[pc] + suffix };
}

/* Posición con cejilla para cualquier acorde: forma de Mi (raíz en la 6ª) o de La (raíz en la 5ª),
   la que quede más cerca de la cejuela. Trastes de la 6ª a la 1ª, relativos a la cejilla. */
const SHAPES = {
  E: { '': [[0, 2, 2, 1, 0, 0], [1, 3, 4, 2, 1, 1]], m: [[0, 2, 2, 0, 0, 0], [1, 3, 4, 1, 1, 1]], 7: [[0, 2, 0, 1, 0, 0], [1, 3, 1, 2, 1, 1]], m7: [[0, 2, 0, 0, 0, 0], [1, 3, 1, 1, 1, 1]],
    sus4: [[0, 2, 2, 2, 0, 0], [1, 2, 3, 4, 1, 1]], 5: [[0, 2, 2, -1, -1, -1], [1, 3, 4, 0, 0, 0]], m6: [[0, 2, 2, 0, 2, 0], [1, 2, 3, 1, 4, 1]], '7sus4': [[0, 2, 0, 2, 0, 0], [1, 3, 1, 4, 1, 1]] },
  A: { '': [[-1, 0, 2, 2, 2, 0], [0, 1, 2, 3, 4, 1]], m: [[-1, 0, 2, 2, 1, 0], [0, 1, 3, 4, 2, 1]], 7: [[-1, 0, 2, 0, 2, 0], [0, 1, 3, 1, 4, 1]], m7: [[-1, 0, 2, 0, 1, 0], [0, 1, 3, 1, 2, 1]],
    maj7: [[-1, 0, 2, 1, 2, 0], [0, 1, 3, 2, 4, 1]], sus2: [[-1, 0, 2, 2, 0, 0], [0, 1, 3, 4, 1, 1]], sus4: [[-1, 0, 2, 2, 3, 0], [0, 1, 2, 3, 4, 1]], add9: [[-1, 0, 2, 4, 2, 0], [0, 1, 2, 4, 3, 1]],
    dim: [[-1, 0, 1, 2, 1, -1], [0, 1, 2, 4, 3, 0]], m7b5: [[-1, 0, 1, 0, 1, -1], [0, 1, 3, 2, 4, 0]], aug: [[-1, 0, 3, 2, 2, 1], [0, 1, 4, 2, 3, 1]],
    6: [[-1, 0, 2, 2, 2, 2], [0, 1, 3, 3, 3, 3]], m6: [[-1, 0, 2, 2, 1, 2], [0, 1, 3, 4, 2, 4]], 5: [[-1, 0, 2, 2, -1, -1], [0, 1, 3, 4, 0, 0]], '7sus4': [[-1, 0, 2, 0, 3, 0], [0, 1, 3, 1, 4, 1]] },
};
const SHAPE_FALLBACK = { maj7: '', add9: '', sus2: '', dim: 'm', m7b5: 'm7', aug: '', 6: '' };
function makeChord(pc, suffix) {
  const opts = [];
  for (const [shape, open] of [['E', 4], ['A', 9]]) {
    const def = SHAPES[shape][suffix]; if (!def) continue;
    const b = (pc - open + 12) % 12;
    opts.push({ shape, b: b === 0 ? 12 : b, def });
  }
  if (!opts.length) return makeChord(pc, SHAPE_FALLBACK[suffix] ?? '');
  opts.sort((x, y) => x.b - y.b);
  const { shape, b, def } = opts[0];
  const frets = def[0].map((f) => (f < 0 ? -1 : f + b)), fingers = def[1].map((g, i) => (frets[i] < 0 ? 0 : g));
  // cejilla del índice: de la cuerda más grave a la más aguda que pisa en ese traste con el dedo 1
  const idx = fingers.map((g, i) => (g === 1 && frets[i] === b ? i : -1)).filter((i) => i >= 0);
  const barre = idx.length >= 2 ? { fret: b, from: 6 - idx[0], to: 6 - idx[idx.length - 1], finger: 1 } : null;
  const shapeName = shape === 'E' ? (suffix.startsWith('m') && suffix !== 'maj7' ? 'Mim' : 'Mi') : (suffix.startsWith('m') && suffix !== 'maj7' ? 'Lam' : 'La');
  return { sym: SHARP_NAMES[pc] + suffix, frets, fingers, barre, generated: true,
    tip: barre ? `Cejilla en el traste ${b} con la forma de ${shapeName}.` : `Con la forma de ${shapeName} subida al traste ${b}.` };
}

/* ---------- lectura del texto ---------- */
const SECTION_RE = /^[\s[(]*(intro(?:ducci[oó]n)?|estrofa|verso|verse|pre[- ]?estribillo|pre[- ]?coro|pre[- ]?chorus|estribillo|coro|chorus|puente|bridge|solo|interludio|instrumental|outro|final|riff|coda)\b\s*(\d+)?\s*[\])]*\s*:?\s*/i;
const TAB_LABEL = /^\s*\(?[eBGDAEbgdae1-6]?\)?\s*/;
const isTabLine = (l) => { const r = l.replace(TAB_LABEL, ''); return /^[-–—|:]/.test(r) && /^[-–—|:0-9hpbrsx~\/\\()* ]+$/.test(r) && r.length >= 5 && (r.match(/[-–—]/g) || []).length >= 3; }; // se exige además un bloque de 6 líneas seguidas
const isGridLine = (l) => /^[\s|xXoO0-9_\/·.-]+$/.test(l) && ((l.match(/\|/g) || []).length >= 4 || /_{6,}/.test(l));
const SPECIAL = /^(\||\/|\/:|:\/|\(?x\d\)?|\(?\d+x\)?|-+|%|N\.?C\.?|\.{2,}|…)$/i;

// "ESTRIBILLO", "[Coro]", "Intro: Am G", "Estribillo x2"… pero no "Solo uno fuera" (letra)
function isHeader(line) {
  const sec = SECTION_RE.exec(line); if (!sec) return null;
  const rest = line.slice(sec[0].length).trim().replace(/^[-–:]\s*/, '');
  const chords = rest ? chordLine(rest) : null;
  if (rest && !chords && !/^\(?x\s?\d\)?$/i.test(rest)) return null;
  return { name: sec[1], times: /x\s?(\d)/i.exec(rest)?.[1], chords };
}
function isRef(line) {
  const m = /^\s*\(([^)]+)\)\s*(x\s?\d)?\s*$/i.exec(line); if (!m) return null;
  const names = m[1].split(/\+|,|\sy\s/).map((p) => p.trim()).filter(Boolean);
  return names.length && names.every((p) => isHeader(p)) ? names.map((p) => normName(isHeader(p).name)) : null;
}
// tokens de una línea con su columna
function tokens(line) { const out = []; const re = /\S+/g; let m; while ((m = re.exec(line))) out.push({ t: m[0], pos: m.index }); return out; }
function chordLine(line) {
  const toks = tokens(line); if (!toks.length) return null;
  const chords = []; let paren = 0;
  for (const { t, pos } of toks) {
    if (SPECIAL.test(t)) continue;
    let s = t; if (/^\(.*\)$/.test(s)) { paren++; s = s.slice(1, -1); }
    const c = parseChordName(s);
    if (!c) return null;
    chords.push({ ...c, pos, len: t.length });
  }
  if (!chords.length) return null;
  return { chords, legend: paren === chords.length };
}
// [Am]letra [G]más letra → línea de acordes + letra
function inlineChords(line) {
  if (!/\[[^\]]+\]/.test(line)) return null;
  let lyric = '', chords = [], ok = true;
  const re = /\[(?:ch\])?([^\]\[]+?)(?:\[\/ch)?\]/g; let last = 0, m;
  while ((m = re.exec(line))) {
    lyric += line.slice(last, m.index);
    const c = parseChordName(m[1].trim());
    if (!c) { ok = false; break; }
    chords.push({ ...c, pos: lyric.length, len: m[1].length });
    last = re.lastIndex;
  }
  if (!ok || !chords.length) return null;
  lyric += line.slice(last);
  return { chords, lyric: lyric.trim() ? lyric : null };
}

// bloque de 6 líneas de tablatura → notas con su tiempo (1 carácter ≈ 1/4 de tiempo)
function parseTabBlock(lines) {
  const strip = (l) => l.replace(TAB_LABEL, '');
  const rows = lines.map(strip);
  const width = Math.max(...rows.map((r) => r.length));
  const notes = []; let col = 0, step = 0;
  const used = rows.map(() => new Set());
  for (let c = 0; c < width; c++) {
    if (rows.every((r) => r[c] === '|' || r[c] === undefined)) continue; // barras de compás: no ocupan tiempo
    const at = [];
    rows.forEach((r, k) => {
      if (used[k].has(c) || !/\d/.test(r[c] || '')) return;
      let num = r[c]; if (/\d/.test(r[c + 1] || '') && Number(r[c] + r[c + 1]) <= 24) { num += r[c + 1]; used[k].add(c + 1); }
      at.push({ string: k + 1, fret: Number(num) });
    });
    if (at.length) notes.push({ t: step * 0.25, notes: at });
    step++; col = c;
  }
  return { notes, beats: Math.ceil(step * 0.25) };
}

function parseCifrado(text) {
  const lines = String(text || '').replace(/\r/g, '').replace(/\t/g, '    ').replace(/ /g, ' ').split('\n');
  const items = []; const warn = new Set();
  let legendZone = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, '');
    if (!line.trim()) { items.push({ type: 'blank' }); continue; }
    if (isGridLine(line) && !isTabLine(line)) { legendZone = 3; warn.add('legend'); continue; }
    if (/^\s*(acordes|chords|tono|tuning|afinaci[oó]n|cejilla|capo)\b.*:/i.test(line) && !chordLine(line.replace(/^[^:]*:/, ''))) continue;
    // tablatura: 6 líneas seguidas
    if (isTabLine(line)) {
      const block = [line]; while (block.length < 6 && i + block.length < lines.length && isTabLine(lines[i + block.length])) block.push(lines[i + block.length]);
      if (block.length === 6) { items.push({ type: 'tab', ...parseTabBlock(block) }); i += 5; warn.add('tab'); continue; }
      i += block.length - 1; continue;
    }
    // cabecera de parte, con o sin acordes detrás ("Intro: Am G")
    const hd = isHeader(line);
    if (hd) {
      items.push({ type: 'section', name: hd.name, times: hd.times });
      if (hd.chords && !hd.chords.legend) items.push({ type: 'line', chords: hd.chords.chords, lyric: null });
      legendZone = 0; continue;
    }
    // «(PRE-ESTRIBILLO + ESTRIBILLO)» → repetir esas partes
    const ref = isRef(line);
    if (ref) { items.push({ type: 'ref', names: ref }); continue; }
    const cl = chordLine(line);
    if (cl) {
      if (cl.legend || legendZone > 0) { legendZone = Math.max(0, legendZone - 1); warn.add('legend'); continue; }
      const next = lines[i + 1] ?? '';
      const nextIsLyric = next.trim() && !chordLine(next) && !inlineChords(next) && !isTabLine(next) && !isGridLine(next) && !isHeader(next) && !isRef(next);
      if (nextIsLyric) { items.push({ type: 'line', chords: cl.chords, lyric: next.replace(/\s+$/, '') }); i++; }
      else items.push({ type: 'line', chords: cl.chords, lyric: null });
      continue;
    }
    const inl = inlineChords(line);
    if (inl) { items.push({ type: 'line', chords: inl.chords, lyric: inl.lyric }); continue; }
    legendZone = 0;
    items.push({ type: 'line', chords: [], lyric: line });
  }
  return toSections(items, warn);
}

// agrupa en partes (por cabeceras y líneas en blanco), expande repeticiones y rellena estrofas sin acordes
function toSections(items, warn) {
  const parts = []; let cur = null, pendingName = null, pendingTimes = 1;
  const close = () => { if (cur && cur.lines.length) parts.push(cur); cur = null; };
  for (const it of items) {
    if (it.type === 'blank') { close(); continue; }
    if (it.type === 'section') { close(); pendingName = it.name; pendingTimes = Number(it.times) || 1; continue; }
    if (it.type === 'ref') { close(); parts.push({ ref: it.names }); continue; }
    if (it.type === 'tab') {
      close();
      const prev = parts[parts.length - 1];
      // bloques de tablatura seguidos (separados solo por líneas en blanco): una sola parte
      if (prev && prev.tab && !pendingName) { const off = prev.tab.beats; prev.tab = { notes: prev.tab.notes.concat(it.notes.map((e) => ({ ...e, t: e.t + off }))), beats: off + it.beats }; continue; }
      parts.push({ name: pendingName || 'Intro', tab: it, lines: [] }); pendingName = null; continue;
    }
    // la letra que empieza con "/:" abre una repetición y la que acaba con ":/" la cierra
    if (it.lyric && /\/:/.test(it.lyric)) { it.repStart = true; it.lyric = it.lyric.replace('/:', '  '); }
    if (it.lyric && /:\//.test(it.lyric)) { it.repEnd = true; it.lyric = it.lyric.replace(':/', ''); }
    if (it.lyric && !it.lyric.trim()) it.lyric = null;
    if (!cur) { cur = { name: pendingName, lines: [], times: pendingTimes }; pendingName = null; pendingTimes = 1; }
    cur.lines.push(it);
  }
  close();
  // nombres por defecto
  let n = 0;
  for (const p of parts) if (!p.ref && !p.tab && !p.name) p.name = p.lines.every((l) => !l.lyric) ? (n === 0 ? 'Intro' : 'Instrumental') : 'Estrofa', n++;
  // estrofas sin acordes: copian los de una parte anterior con el mismo número de líneas
  const done = [];
  for (const p of parts) {
    if (p.ref) {
      for (const name of p.ref) { const src = [...done].reverse().find((q) => normName(q.name) === name || normName(q.name).replace(/[- ]/g, '') === name.replace(/[- ]/g, '')); if (src) done.push({ ...src, repeat: true }); }
      continue;
    }
    if (!p.tab && p.lines.every((l) => !l.chords.length)) {
      const src = [...done].reverse().find((q) => !q.tab && q.lines.length === p.lines.length && q.lines.some((l) => l.chords.length));
      if (src) { p.lines = p.lines.map((l, k) => ({ ...l, chords: src.lines[k].chords.map((c) => ({ ...c, pos: Math.round((c.pos / Math.max(1, (src.lines[k].lyric || '').length)) * Math.max(1, (l.lyric || '').length)) })) })); p.copied = src.name; warn.add('copied'); }
    }
    // repeticiones /: … :/
    const out = []; let start = -1;
    p.lines.forEach((l) => {
      if (l.repStart) start = out.length;
      out.push(l);
      if (l.repEnd && start >= 0) { out.push(...out.slice(start).map((x) => ({ ...x, repStart: false, repEnd: false }))); start = -1; warn.add('repeat'); }
    });
    p.lines = out;
    for (let k = 1; k < (p.times || 1); k++) p.lines = p.lines.concat(p.lines);
    done.push(p);
  }
  return { parts: done, warnings: [...warn] };
}
function normName(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

/* ---------- de partes a eventos del reproductor ----------
   Cada línea con letra dura `barsPerLine` compases y sus acordes caen según su columna sobre la letra;
   una línea solo de acordes dura un compás por acorde. Fácil: un rasgueo por acorde y compás.
   Difícil: el patrón ↓ ↓↑ ↑↓↑. Las tablaturas se tocan nota a nota en los dos niveles. */
function buildCifrado(parsed, { barsPerLine = 2, getChord }) {
  const segs = [], tabEv = [], lyrics = [], sections = [];
  let t = 0, last = null;
  for (const p of parsed.parts) {
    sections.push({ name: p.name, t });
    if (p.tab) {
      if (last) { last.end = t; last = null; }
      for (const e of p.tab.notes) {
        const ns = e.notes.map((n) => ({ string: n.string, fret: n.fret, midi: DSP.stringMidi(n.string) + n.fret })).sort((a, b) => a.midi - b.midi);
        const base = Math.min(...ns.filter((n) => n.fret > 0).map((n) => n.fret), 99);
        ns.forEach((n) => { n.finger = n.fret === 0 ? 0 : Math.max(1, Math.min(4, n.fret - (base === 99 ? n.fret : base) + 1)); });
        tabEv.push({ t: t + e.t, dur: 0.5, notes: [ns[0]], also: ns.slice(1) }); // se juzga la nota más grave
      }
      t += Math.max(1, Math.ceil(p.tab.beats / 4)) * 4;
      continue;
    }
    for (const l of p.lines) {
      const D = l.lyric ? barsPerLine * 4 : Math.max(1, l.chords.length) * 4;
      if (l.lyric) lyrics.push({ t, text: l.lyric.trim().replace(/\s{2,}/g, ' ') });
      if (l.chords.length) {
        const L = Math.max((l.lyric || '').length, ...l.chords.map((c) => c.pos + c.len), 1);
        let prev = -1;
        l.chords.forEach((c, k) => {
          let at = l.lyric ? (k === 0 && c.pos / L < 0.15 ? 0 : Math.round((c.pos / L) * D)) : k * 4;
          at = Math.min(D - 1, Math.max(prev + 1, at)); prev = at;
          if (last) last.end = t + at;
          last = { chord: c.id, t: t + at, end: null };
          segs.push(last);
        });
      }
      t += D;
    }
  }
  if (last) last.end = t;
  const total = t;
  const easy = [], hard = [];
  for (const s of segs) {
    const ch = getChord(s.chord); if (!ch) continue;
    const mk = (at, dir, first) => ({ t: at, dur: 0.5, chord: s.chord, dir, notes: DSP.chordNotes(ch, dir), first });
    // fácil: al entrar el acorde y en cada compás que dure
    for (let at = s.t; at < s.end - 1e-6; at = Math.floor(at / 4 + 1) * 4) easy.push(mk(at, 'D', at === s.t));
    // difícil: el patrón dentro de cada compás, y siempre un golpe al entrar el acorde
    const hits = new Set([s.t]);
    for (let bar = Math.floor(s.t / 4) * 4; bar < s.end; bar += 4) for (const [off] of DSP.STRUM_PATTERNS[4]) { const at = bar + off; if (at >= s.t && at < s.end - 1e-6) hits.add(at); }
    const pat = new Map(DSP.STRUM_PATTERNS[4].map(([o, d]) => [o, d]));
    [...hits].sort((a, b) => a - b).forEach((at) => hard.push(mk(at, pat.get(((at % 4) + 4) % 4) || 'D', at === s.t)));
  }
  const fin = (arr) => { const ev = [...arr, ...tabEv].sort((a, b) => a.t - b.t); ev.forEach((e, i) => { e.dur = Math.min(e.chord ? 1 : 2, Math.max(0.25, (ev[i + 1]?.t ?? total) - e.t)); }); return ev; };
  const chordList = [...new Set(segs.map((s) => s.chord))];
  return { built: { total, pickup: 0, chordTrack: [], levels: { easy: fin(easy), hard: fin(hard) }, lyrics, sections }, chordList, nTab: tabEv.length };
}

if (typeof module !== 'undefined') module.exports = { parseChordName, makeChord, parseCifrado, buildCifrado, isTabLine, parseTabBlock };
