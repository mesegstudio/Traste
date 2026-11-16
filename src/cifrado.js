/* ============================================================
   Lector de cifrados pegados por el usuario (La Cuerda, Ultimate Guitar, Cifra Club…).
   Entiende acordes en las dos notaciones (Am / LAm / Lam), acordes encima de la letra o entre
   corchetes, partes (Intro, Estribillo…), repeticiones (/: … :/, x2, «(Estribillo)») y tablaturas
   de seis líneas. Ignora la leyenda de diagramas, menús y comentarios que se copian de más.
   Funciones puras: se prueban en Node (test/dsp.test.js).
   ============================================================ */
// en el navegador usa las funciones de dsp.js ya cargadas; en Node las importa
const DSP = typeof stringMidi === 'undefined' ? require('./dsp.js') : { stringMidi, chordNotes, STRUM_PATTERNS, arpeggiate };
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
const SECTION_RE = /^[\s[(*]*(intro(?:ducci[oó]n)?|estrofa|verso|verse|pre[- ]?estribillo|pre[- ]?coro|pre[- ]?chorus|estribillo|coro|chorus|puente|bridge|solo|interludio|instrumental|outro|final|riff|coda)\b\s*(\d+)?\s*[\])*]*\s*:?\s*/i;
const TAB_LABEL = /^\s*\(?[eBGDAEbgdae1-6]?\)?\s*/;
const isTabLine = (l) => { const r = l.replace(TAB_LABEL, ''); return /^[-–—|:]/.test(r) && /^[-–—|:0-9hpbrsxvt~=.\/\\()* ]+$/.test(r) && r.length >= 5 && (r.match(/[-–—]/g) || []).length >= 3; }; // se exige además un bloque de 6 líneas seguidas
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

// cuerdas pegadas en una sola línea al copiar ("CGAme---/--5--/B---/…/E---/Ge---…"): se separan por sus letras
const TAB_ORDER = ['e', 'B', 'G', 'D', 'A', 'E'];
const CHORD_RUN = /(?:[A-G][#b♯♭]?(?:maj|min|sus|dim|aug|add|m|M|°|\+)?\d*(?:\/[A-G][#b]?)?)+\s*$/;
function splitTabRun(line) {
  const at = [];
  for (let i = 0; i < line.length - 1; i++) if (TAB_ORDER.includes(line[i]) && /[-–—|:]/.test(line[i + 1])) at.push(i);
  if (at.length < 6 || at.length % 6) return null;
  if (!at.every((i, k) => line[i] === TAB_ORDER[k % 6] || (k % 6 === 0 && line[i] === 'E'))) return null;
  const out = [];
  const pre = line.slice(0, at[0]).trim();
  if (pre && !CHORD_RUN.test(pre)) out.push(pre); // un título delante, no unos acordes pegados
  // cada cuerda va de su letra a la siguiente; los acordes pegados al final pertenecen a la línea de después
  at.forEach((i, k) => { const seg = line.slice(i + 1, at[k + 1] ?? line.length).replace(/\s+$/, ''); out.push(line[i] + seg.replace(CHORD_RUN, '')); });
  return out;
}

// una cuerda de la tablatura → compases (separados por | o por una / que no sea un deslizamiento entre dos trastes)
function tabBars(row) {
  const bars = []; let cur = '';
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === '|' || (c === '/' && !(/\d/.test(row[i - 1] || '') && /\d/.test(row[i + 1] || '')))) { bars.push(cur); cur = ''; continue; }
    cur += c;
  }
  bars.push(cur);
  return bars;
}
// notas de un trozo de cuerda: traste, columna y si va ligada (martillo, tirón o deslizamiento)
function rowNotes(seg) {
  const out = [];
  for (let c = 0; c < seg.length; c++) {
    if (!/\d/.test(seg[c])) continue;
    let num = seg[c];
    if (/\d/.test(seg[c + 1] || '') && Number(seg[c] + seg[c + 1]) <= 24) num += seg[c + 1];
    out.push({ col: c, fret: Number(num), slur: /[hpsHP\/\\]/.test(seg[c - 1] || '') });
    c += num.length - 1;
  }
  return out;
}
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };
const q4 = (t) => Math.round(t * 4) / 4;

/* bloque de 6 líneas de tablatura → notas con su tiempo.
   Una tablatura de texto no dice el ritmo, así que se deduce del espacio entre notas:
   con barras de compás, cada compás dura 4 tiempos (uno mucho más corto, como una anacrusa, menos) y las notas
   caen según su posición dentro; sin barras, el hueco más habitual entre notas vale medio tiempo. */
function parseTabBlock(lines) {
  const rows = lines.map((l) => l.replace(TAB_LABEL, ''));
  const raw = [];
  // fuera los compases vacíos de los extremos ("e|---|" empieza y acaba con una barra)
  const bars = rows.map((r) => { const b = tabBars(r); if (b.length > 1 && /^[-–—\s]{0,2}$/.test(b[0])) b.shift(); if (b.length > 1 && !b[b.length - 1].trim().length) b.pop(); return b; });
  let beats = 0;
  // un trozo de tablatura → notas: el hueco más habitual entre notas se ajusta a una figura (½ tiempo, 1 tiempo…)
  const place = (segs, cpb, minLen) => {
    const notes = segs.flatMap((seg, s) => rowNotes(seg).map((n) => ({ ...n, string: s + 1 })));
    const cols = [...new Set(notes.map((n) => n.col))].sort((x, y) => x - y);
    const unit = cols.length > 1 ? Math.max(1, median(cols.slice(1).map((c, i) => c - cols[i]))) : cpb; // una nota sola: a negras
    const dur = [0.25, 0.5, 1, 2].reduce((x, y) => (Math.abs(Math.log(y * cpb / unit)) < Math.abs(Math.log(x * cpb / unit)) ? y : x));
    const pad = cols[0] <= (cols.length > 1 ? unit : 2) ? cols[0] : 0; // los guiones de relleno del principio no son un silencio
    let last = -1;
    for (const n of notes) { const t = q4((Math.round(((n.col - pad) / unit) * 2) / 2) * dur); last = Math.max(last, t); raw.push({ t: beats + t, string: n.string, fret: n.fret, slur: n.slur }); }
    beats += Math.max(minLen, Math.ceil(last + dur - 1e-6));
  };
  if (bars[0].length > 1 && bars.every((b) => b.length === bars[0].length)) {
    // con barras de compás: un compás normal dura 4 tiempos; uno mucho más corto (una anacrusa), lo que le toque
    const widths = bars[0].map((_, k) => Math.max(...bars.map((b) => b[k].length)));
    const full = median(widths.filter((w) => w > 0)) || 1;
    widths.forEach((w, k) => {
      if (!w) return;
      const short = w < 0.7 * full;
      place(bars.map((b) => b[k]), (short ? full : w) / 4, short ? Math.max(1, Math.round((4 * w) / full)) : 4);
    });
  } else {
    // sin barras (o distintas en cada cuerda): el hueco más habitual vale medio tiempo
    const flat = rows.map((r) => r.replace(/\|/g, ''));
    const cols = [...new Set(flat.flatMap((r) => rowNotes(r).map((n) => n.col)))].sort((x, y) => x - y);
    const gap = Math.max(1, median(cols.slice(1).map((c, i) => c - cols[i])));
    place(flat, gap * 2, Math.ceil((Math.max(...flat.map((r) => r.length)) / gap) * 0.5));
  }
  // las notas que caen a la vez forman un golpe; dos en la misma cuerda no pueden sonar juntas
  raw.sort((a, b) => a.t - b.t || a.string - b.string);
  const notes = [];
  for (const n of raw) {
    let ev = notes[notes.length - 1];
    if (ev && n.t <= ev.t && ev.notes.some((m) => m.string === n.string)) n.t = ev.t + 0.25;
    if (!ev || n.t > ev.t) { ev = { t: n.t, notes: [] }; notes.push(ev); }
    ev.notes.push({ string: n.string, fret: n.fret, ...(n.slur ? { slur: true } : {}) });
  }
  const end = notes.length ? notes[notes.length - 1].t + 0.5 : 0;
  return { notes, beats: Math.max(1, Math.ceil(Math.max(beats, end))) };
}

function parseCifrado(text) {
  const warn = new Set();
  const lines = String(text || '').replace(/\r/g, '').replace(/\t/g, '    ').replace(/ /g, ' ').split('\n')
    .filter((l) => !/^\s*(```|~~~)/.test(l))
    .flatMap((l) => { const run = splitTabRun(l); if (run) warn.add('tabjoin'); return run || [l]; });
  const items = [];
  let legendZone = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, '');
    if (!line.trim()) { items.push({ type: 'blank' }); continue; }
    if (isGridLine(line) && !isTabLine(line)) { legendZone = 3; warn.add('legend'); continue; }
    if (/^\s*(acordes|chords|tono|tuning|afinaci[oó]n|cejilla|capo)\b.*:/i.test(line) && !chordLine(line.replace(/^[^:]*:/, ''))) continue;
    // tablatura: 6 líneas seguidas
    if (isTabLine(line)) {
      const block = [line]; while (block.length < 6 && i + block.length < lines.length && isTabLine(lines[i + block.length])) block.push(lines[i + block.length]);
      if (block.length === 6) { const tb = parseTabBlock(block); items.push({ type: 'tab', ...tb }); i += 5; warn.add('tab'); if (tb.notes.some((e) => e.notes.some((n) => n.slur))) warn.add('slur'); continue; }
      i += block.length - 1; continue;
    }
    // cabecera de parte, con o sin acordes detrás ("Intro: Am G")
    const hd = isHeader(line);
    if (!hd && /^\s*\*/.test(line)) continue; // "*(segunda parte del solo)": un comentario
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
      parts.push({ name: pendingName || 'Intro', named: !!pendingName, tab: it, lines: [] }); pendingName = null; continue;
    }
    // la letra que empieza con "/:" abre una repetición y la que acaba con ":/" la cierra
    if (it.lyric && /\/:/.test(it.lyric)) { it.repStart = true; it.lyric = it.lyric.replace('/:', '  '); }
    if (it.lyric && /:\//.test(it.lyric)) { it.repEnd = true; it.lyric = it.lyric.replace(':/', ''); }
    if (it.lyric && !it.lyric.trim()) it.lyric = null;
    if (!cur) { cur = { name: pendingName, lines: [], times: pendingTimes }; pendingName = null; pendingTimes = 1; }
    cur.lines.push(it);
  }
  close();
  // sin un solo acorde, las líneas de texto entre tablaturas son comentarios ("esto va después del coro")
  if (parts.some((p) => p.tab) && !parts.some((p) => p.lines?.some((l) => l.chords.length))) for (let k = parts.length - 1; k >= 0; k--) if (!parts[k].tab && !parts[k].ref) parts.splice(k, 1);
  // bloques de tablatura seguidos sin un título nuevo: una sola parte
  for (let k = parts.length - 1; k > 0; k--) {
    const a = parts[k - 1], b = parts[k];
    if (a.tab && b.tab && !b.named) { const off = a.tab.beats; a.tab = { notes: a.tab.notes.concat(b.tab.notes.map((e) => ({ ...e, t: e.t + off }))), beats: off + b.tab.beats }; parts.splice(k, 1); }
  }
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
        const ns = e.notes.map((n) => ({ string: n.string, fret: n.fret, midi: DSP.stringMidi(n.string) + n.fret, ...(n.slur ? { slur: true } : {}) })).sort((a, b) => a.midi - b.midi);
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
  const track = segs.map((s) => ({ chord: s.chord, t: s.t, dur: s.end - s.t }));
  // solo tablatura: un único nivel, nota a nota
  const levels = segs.length ? { easy: fin(easy), arp: fin(DSP.arpeggiate(track, getChord, 4, 0)), hard: fin(hard) } : { easy: fin([]) };
  return { built: { total, pickup: 0, chordTrack: track, levels, lyrics, sections }, chordList, nTab: tabEv.length };
}

if (typeof module !== 'undefined') module.exports = { parseChordName, makeChord, parseCifrado, buildCifrado, isTabLine, parseTabBlock, splitTabRun };
