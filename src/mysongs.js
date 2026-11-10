/* ============================================================
   Mis canciones: el usuario pega un cifrado (de La Cuerda, Ultimate Guitar…) y Traste lo convierte
   en una canción para practicar. Se guarda solo en este navegador.
   ============================================================ */
const IMPORT_NOTES = {
  legend: 'He quitado los dibujos de acordes del principio, porque Traste usa los suyos.',
  tab: 'La tablatura se toca nota a nota. Su ritmo es aproximado, así que ajusta la velocidad si hace falta.',
  copied: 'Las estrofas que venían sin acordes llevan los de la estrofa anterior.',
  repeat: 'Las partes marcadas con /: … :/ se tocan dos veces.',
};
const LINE_LEN = [['1', 'Corta'], ['2', 'Normal'], ['4', 'Larga']];
const BASIC_CHORDS = new Set([...CHORD_GROUPS[0].ids, ...CHORD_GROUPS[1].ids]);

const MySongs = {
  list: [], draft: null, editing: null, fromPlayer: false, taps: [], timer: 0,
  load() {
    this.list = store.get('mysongs', []);
    this.list.forEach((e) => { try { this.register(e); } catch (err) { console.error(err); } });
  },
  // acorde que no está en la lista de Traste → posición con cejilla generada
  chord(id) {
    if (!CHORDS[id]) { const c = parseChordName(id); if (!c) return null; CHORDS[id] = makeChord(c.pc, c.suffix); }
    return CHORDS[id];
  },
  compile(e) {
    const parsed = parseCifrado(e.text);
    return { parsed, ...buildCifrado(parsed, { barsPerLine: +e.bars || 2, getChord: (id) => this.chord(id) }) };
  },
  difficulty(chords, nTab = 0) {
    if (!chords.length) return nTab > 40 ? 3 : 2; // solo tablatura
    if (chords.some((id) => CHORDS[id]?.barre && id !== 'F_easy')) return 3;
    return chords.every((id) => BASIC_CHORDS.has(id)) ? 1 : 2;
  },
  register(e) {
    const r = this.compile(e);
    const song = { id: e.id, user: true, title: e.title || 'Sin título', origin: e.artist || 'Añadida por ti', bpm: +e.bpm || 90, bpb: 4, cat: 'mias',
      stars: this.difficulty(r.chordList, r.nTab), chordList: r.chordList, built: r.built,
      levelHints: r.chordList.length ? { easy: 'un golpe por acorde', arp: 'acordes nota a nota', hard: 'rasgueo completo' } : { easy: 'nota a nota' } };
    const i = SONGS.findIndex((s) => s.id === e.id);
    if (i >= 0) SONGS[i] = song; else SONGS.unshift(song);
    return song;
  },
  // ---------- pantalla de añadir / editar ----------
  open(id) {
    const e = id && this.list.find((x) => x.id === id);
    this.editing = e ? e.id : null;
    this.fromPlayer = !$('#player').hidden;
    this.draft = e ? { ...e } : { title: '', artist: '', text: '', bpm: 90, bars: '2' };
    Player.pause(); $('#player').hidden = true; $('#songList').hidden = true; $('#songImport').hidden = false;
    this.render(); $('#impSave').disabled = !this.lastOk;
    if (!e) $('#impText').focus();
  },
  close(song) {
    $('#songImport').hidden = true;
    if (song) { Player.open(song); return; }
    if (this.fromPlayer && Player.song) { $('#player').hidden = false; Player.resize(); return; }
    Player.song = null; $('#songList').hidden = false; Songs.render();
  },
  render() {
    const d = this.draft;
    $('#songImport').innerHTML = `<div class="screen">
      <div class="scr-top">
        <button type="button" class="btn btn-soft btn-icon" data-imp="back" aria-label="Volver">${icon('arrow-left-line')}</button>
        <div class="scr-title"><h1>${this.editing ? 'Editar canción' : 'Añadir canción'}</h1><p>Pega los acordes con la letra, tal cual los copias de La Cuerda o Ultimate Guitar</p></div>
        <button type="button" class="btn btn-primary" data-imp="save" id="impSave">${icon('check-line')}Guardar</button>
      </div>
      <div class="scr-body scroll"><div class="imp-grid">
        <div class="imp-left">
          <div class="imp-fields">
            <input type="text" id="impTitle" placeholder="Título" value="${esc(d.title)}" aria-label="Título">
            <input type="text" id="impArtist" placeholder="Artista (opcional)" value="${esc(d.artist)}" aria-label="Artista">
          </div>
          <textarea id="impText" spellcheck="false" placeholder="Pega aquí la canción con sus acordes.&#10;&#10;     Am            G&#10;Primera línea de la letra&#10;     F             E&#10;Segunda línea de la letra">${esc(d.text)}</textarea>
          <div class="imp-opts">
            <div class="imp-opt"><span>Velocidad</span>
              <div class="stepper-num"><button type="button" class="btn btn-soft btn-icon btn-sm" data-imp="bpm-" aria-label="Más lenta">−</button><b class="num" id="impBpm">${d.bpm}</b><span class="muted">ppm</span><button type="button" class="btn btn-soft btn-icon btn-sm" data-imp="bpm+" aria-label="Más rápida">+</button></div>
              <button type="button" class="btn btn-ghost btn-sm" data-imp="tap" title="Toca al ritmo de la canción">${icon('pulse-line')}Marcar el pulso</button></div>
            <div class="imp-opt"><span>Cada línea de letra</span>
              <div class="seg" role="group">${LINE_LEN.map(([v, n]) => `<button type="button" data-imp-bars="${v}" aria-pressed="${String(d.bars) === v}" title="${v} ${v === '1' ? 'compás' : 'compases'}">${n}</button>`).join('')}</div></div>
          </div>
          <p class="imp-note">${icon('information-line')}Se guarda solo en este navegador. Para uso personal.</p>
          ${this.editing ? `<button type="button" class="link-btn imp-del" data-imp="delete">${icon('delete-bin-line')}Borrar esta canción</button>` : ''}
        </div>
        <div class="imp-right" id="impPreview">${this.previewHTML()}</div>
      </div></div>
    </div>`;
  },
  previewHTML() {
    const d = this.draft; this.lastOk = false;
    if (!d.text.trim()) return `<div class="imp-empty">${icon('music-2-line')}<b>Aquí verás lo que entiende Traste</b>
      <ol><li>Abre la canción en La Cuerda, Ultimate Guitar o Cifra Club.</li><li>Selecciona desde el primer acorde hasta el final y cópialo. Si copias la página entera no pasa nada, me quedo con lo que sirve.</li><li>Pégalo a la izquierda.</li></ol></div>`;
    let r;
    try { r = this.compile(d); } catch (err) { console.error(err); return `<div class="imp-empty">${icon('error-warning-line')}<b>No he podido leerlo</b></div>`; }
    this.lastOk = r.chordList.length > 0 || r.nTab > 0;
    if (!this.lastOk) return `<div class="imp-empty">${icon('error-warning-line')}<b>No encuentro acordes ni tablatura</b><p>Comprueba que has copiado las líneas de acordes que van encima de la letra, o las seis líneas de la tablatura.</p></div>`;
    const secs = r.built.total / 4, mins = (r.built.total / d.bpm), stars = this.difficulty(r.chordList, r.nTab);
    const chips = r.chordList.map((id) => { const c = CHORDS[id]; return `<span class="imp-chord ${c.generated ? 'new' : ''}" title="${c.generated ? 'Nuevo en Traste, con cejilla' : ''}">${chordLabel(id)}${c.barre && id !== 'F_easy' ? '<small>cejilla</small>' : ''}</span>`; }).join('');
    const parts = r.parsed.parts.map((p) => {
      if (p.tab) return `<div class="imp-part"><h4>${esc(cap(p.name))}<span>tablatura · ${p.tab.notes.length} notas</span></h4></div>`;
      const lines = p.lines.map((l) => `<div class="imp-line"><span class="ch">${l.chords.map((c) => chordLabel(c.id)).join(' ') || '<i>—</i>'}</span><span class="ly">${esc((l.lyric || '').trim())}</span></div>`).join('');
      return `<div class="imp-part"><h4>${esc(cap(p.name))}${p.repeat ? '<span>se repite</span>' : p.copied ? '<span>acordes de la anterior</span>' : ''}</h4>${lines}</div>`;
    }).join('');
    return `<div class="imp-sum">
        ${r.chordList.length ? `<div><b class="num">${r.chordList.length}</b><span>acordes</span></div>` : `<div><b class="num">${r.nTab}</b><span>notas</span></div>`}
        <div><b class="num">${Math.round(secs)}</b><span>compases</span></div>
        <div><b class="num">${Math.floor(mins)}:${String(Math.round((mins % 1) * 60)).padStart(2, '0')}</b><span>minutos</span></div>
        <div><span class="dots">${[1, 2, 3].map((k) => `<i class="${k <= stars ? 'on' : ''}"></i>`).join('')}</span><span>${['', 'fácil', 'media', 'difícil'][stars]}</span></div>
      </div>
      ${chips ? `<div class="imp-chords">${chips}</div>` : ''}
      ${r.parsed.warnings.filter((w) => IMPORT_NOTES[w]).map((w) => `<p class="imp-warn">${icon('information-line')}${IMPORT_NOTES[w]}</p>`).join('')}
      <div class="imp-parts">${parts}</div>`;
  },
  refresh() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { $('#impPreview').innerHTML = this.previewHTML(); $('#impSave').disabled = !this.lastOk; }, 180);
  },
  setBpm(v) { this.draft.bpm = clamp(Math.round(v), 40, 220); $('#impBpm').textContent = this.draft.bpm; this.refresh(); },
  tap() {
    const now = performance.now();
    if (this.taps.length && now - this.taps[this.taps.length - 1] > 2000) this.taps = [];
    this.taps.push(now); if (this.taps.length > 8) this.taps.shift();
    AudioEngine.click(this.taps.length === 1);
    if (this.taps.length >= 4) { const g = this.taps.slice(1).map((t, i) => t - this.taps[i]).sort((a, b) => a - b); this.setBpm(60000 / g[g.length >> 1]); }
  },
  save() {
    const d = this.draft;
    if (!d.text.trim() || !this.lastOk) return;
    const e = { id: this.editing || 'u' + Date.now().toString(36), title: d.title.trim() || 'Sin título', artist: d.artist.trim(), text: d.text, bpm: d.bpm, bars: d.bars };
    const i = this.list.findIndex((x) => x.id === e.id);
    if (i >= 0) this.list[i] = e; else this.list.unshift(e);
    store.set('mysongs', this.list);
    const song = this.register(e);
    Songs.cat = 'all'; Songs.render();
    toast(this.editing ? 'Canción guardada.' : 'Canción añadida a tu lista.', 3000, 'check-line');
    this.close(song);
  },
  remove() {
    if (!confirm('¿Borrar esta canción de tu lista?')) return;
    this.list = this.list.filter((x) => x.id !== this.editing); store.set('mysongs', this.list);
    const i = SONGS.findIndex((s) => s.id === this.editing); if (i >= 0) SONGS.splice(i, 1);
    this.fromPlayer = false; Player.song = null; this.close();
  },
  init() {
    const root = $('#songImport');
    root.addEventListener('input', (e) => {
      if (e.target.id === 'impText') { this.draft.text = e.target.value; this.refresh(); }
      if (e.target.id === 'impTitle') this.draft.title = e.target.value;
      if (e.target.id === 'impArtist') this.draft.artist = e.target.value;
    });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-imp],[data-imp-bars]'); if (!b) return;
      if (b.dataset.impBars) { this.draft.bars = b.dataset.impBars; $$('[data-imp-bars]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); this.refresh(); return; }
      const a = b.dataset.imp;
      if (a === 'back') this.close();
      if (a === 'save') this.save();
      if (a === 'delete') this.remove();
      if (a === 'bpm-') this.setBpm(this.draft.bpm - 5);
      if (a === 'bpm+') this.setBpm(this.draft.bpm + 5);
      if (a === 'tap') this.tap();
    });
    $('#songAdd').addEventListener('click', () => this.open());
    $('#plEdit').addEventListener('click', () => this.open(Player.song?.id));
  },
};
const cap = (s) => { const t = String(s || '').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
