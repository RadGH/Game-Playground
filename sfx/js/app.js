// Sound Lab gallery. Builds the catalog grid, drives the method dropdown, the volume sliders,
// the A/B compare and the loudness table. Tests drive it through window.sfxDemo.
import { Sfx, METHODS, METHOD_ORDER } from './sfx.js';
import { el, downloadJSON, toast } from '../../shared/ui.js';

const $ = id => document.getElementById(id);
const status = $('status');

let sfx = await Sfx.create({ method: 'hybrid', volume: 0.8 });
let playAllStop = false;

// ---- method dropdown -------------------------------------------------------------------------

function badgeClass(m) {
  if (m.badge === 'CC0') return 'cc0';
  if (m.badge === 'ours') return 'ours';
  return 'mixed';
}

function renderMethod() {
  const sel = $('method');
  if (!sel.options.length) {
    for (const m of sfx.methods()) sel.append(el('option', { value: m.id, text: m.name }));
  }
  sel.value = sfx.method();
  const m = sfx.methods().find(x => x.id === sfx.method());
  const covered = sfx.ids().filter(id => sfx.sourceOf(id) === 'library').length;
  $('method-card').replaceChildren(
    el('div', {}, el('span', { class: 'badge ' + badgeClass(m), text: m.badge }), document.createTextNode(' ' + m.license)),
    el('ul', { class: 'pros' }, ...m.pros.map(p => el('li', { class: 'good', text: p }))),
    el('ul', { class: 'cons' }, ...m.cons.map(p => el('li', { class: 'bad', text: p }))),
    el('p', { class: 'muted', style: 'margin:0', text: `${covered} of ${sfx.ids().length} ids use recorded samples under this method; the rest are synthesized.` }),
  );
}

$('method').onchange = e => {
  sfx.setMethod(e.target.value);
  renderMethod();
  renderGrid();
  renderLevels();
};

// ---- volume ----------------------------------------------------------------------------------

function wireVol(key, apply) {
  const input = $('vol-' + key), out = $('vol-' + key + '-v');
  input.oninput = () => { apply(+input.value); out.textContent = Math.round(input.value * 100) + '%'; };
}
wireVol('master', v => sfx.setVolume(v));
wireVol('sfx', v => sfx.setBusVolume('sfx', v));
wireVol('ui', v => sfx.setBusVolume('ui', v));
wireVol('ambience', v => sfx.setBusVolume('ambience', v));
$('mute').onchange = () => sfx.setMuted($('mute').checked);

// ---- the grid ---------------------------------------------------------------------------------

const CAT_LABEL = id => (sfx.categories[id] || {}).label || id;

function meterBar(levels, target) {
  // -60..0 dBFS mapped across the bar, with a tick where the target sits
  const pos = v => Math.max(0, Math.min(100, (v + 60) / 60 * 100));
  const bar = el('div', { class: 'meterbar' + (levels && levels.after.peakDb > -1.5 ? ' hot' : '') },
    el('i', { style: `width:${levels ? pos(levels.after.lufs) : 0}%` }),
    el('u', { style: `left:${pos(target)}%` }));
  return bar;
}

function soundRow(entry) {
  const src = sfx.sourceOf(entry.id) || 'synth';
  const lvl = sfx.levels(entry.id, 0);
  const sub = el('div', { class: 'sub' },
    el('span', { class: 'src ' + src, text: src }),
    el('span', { class: 'lv', text: lvl ? `${lvl.after.lufs.toFixed(1)} LUFS` : '' }));
  const node = el('div', { class: 'sound' + (entry.loop ? ' loopish' : ''), 'data-id': entry.id },
    el('button', { class: 'go', text: entry.loop ? '⟲' : '▶', onclick: () => hit(entry.id, node) }),
    el('div', {}, el('div', { class: 'name', text: entry.label, title: entry.id }), sub, meterBar(lvl, sfx.targetFor(entry.id))));
  return node;
}

async function hit(id, node) {
  const entry = sfx.entry(id);
  if (entry.loop && sfx.loopingIds().includes(id)) { sfx.stopLoop(id); node?.classList.remove('playing'); return; }
  node?.classList.add('playing');
  const h = await sfx.play(id, { pan: +$('pan').value });
  refreshRow(id);
  if (!h) { node?.classList.remove('playing'); return; }
  if (!entry.loop) { await h.done; node?.classList.remove('playing'); }
  renderLevels();
}

function refreshRow(id) {
  const node = document.querySelector(`.sound[data-id="${CSS.escape(id)}"]`);
  if (!node) return;
  const fresh = soundRow(sfx.entry(id));
  node.replaceWith(fresh);
}

function renderGrid() {
  const q = ($('filter').value || '').toLowerCase().trim();
  const wrap = el('div');
  for (const [cat, list] of sfx.byCategory()) {
    const rows = list.filter(s => !q || s.id.includes(q) || s.label.toLowerCase().includes(q));
    if (!rows.length) continue;
    wrap.append(el('div', { class: 'cat-block' },
      el('div', { class: 'cat-head' },
        el('h3', { text: CAT_LABEL(cat) }),
        el('span', { class: 'target', text: `target ${sfx.categories[cat].target} LUFS · bus ${sfx.categories[cat].bus} · ${rows.length} sounds` })),
      el('div', { class: 'sound-grid' }, ...rows.map(soundRow))));
  }
  $('grid').replaceChildren(wrap);
  $('built').textContent = `${sfx.normalizationTable().length} built`;
}
$('filter').oninput = renderGrid;

// ---- play all / measure all --------------------------------------------------------------------

$('play-all').onclick = async () => {
  playAllStop = false;
  const ids = sfx.ids().filter(id => !sfx.entry(id).loop);
  for (const id of ids) {
    if (playAllStop) break;
    status.textContent = 'playing ' + id;
    const node = document.querySelector(`.sound[data-id="${CSS.escape(id)}"]`);
    node?.classList.add('playing');
    const h = await sfx.play(id, { pan: +$('pan').value });
    if (h) await Promise.race([h.done, new Promise(r => setTimeout(r, 1400))]);
    node?.classList.remove('playing');
  }
  status.textContent = 'done';
  renderGrid(); renderLevels();
};

$('stop').onclick = () => { playAllStop = true; sfx.stopAll(); status.textContent = 'stopped'; };

$('build-all').onclick = async () => {
  status.textContent = 'measuring…';
  const t0 = performance.now();
  await sfx.preload(null, { variants: 1 });
  status.textContent = `measured ${sfx.normalizationTable().length} clips in ${Math.round(performance.now() - t0)} ms`;
  renderGrid(); renderLevels();
};

$('export').onclick = () => {
  const rows = sfx.normalizationTable();
  if (!rows.length) return toast('Nothing measured yet — press “Measure all”.');
  downloadJSON({ method: sfx.method(), peakCeilingDb: sfx.ceiling, categories: sfx.categories, rows }, `sfx-levels-${sfx.method()}.json`);
};

// ---- loudness table ----------------------------------------------------------------------------

function renderLevels() {
  const rows = sfx.normalizationTable();
  const body = $('levels').tBodies[0];
  body.replaceChildren(...rows.map(r => {
    const off = Math.abs((r.afterLufs ?? 0) - r.aim) > 3;
    return el('tr', {},
      el('td', { text: r.id }),
      el('td', { text: r.via + (r.file ? ' · ' + r.file.split('/').pop() : '') }),
      el('td', { text: fmt(r.beforeLufs) }), el('td', { text: fmt(r.beforePeakDb) }),
      el('td', { text: (r.gainDb > 0 ? '+' : '') + fmt(r.gainDb) }),
      el('td', { class: off ? 'off' : 'ok', text: fmt(r.afterLufs) }),
      el('td', { class: r.afterPeakDb > -1 ? 'off' : 'ok', text: fmt(r.afterPeakDb) }),
      el('td', { text: r.aim + (r.trim ? ` (${r.target}${r.trim > 0 ? '+' : ''}${r.trim})` : '') }),
      el('td', { text: r.durationMs }));
  }));
  $('built').textContent = `${rows.length} built`;
}
const fmt = v => v == null ? '—' : v.toFixed(1);

// ---- A/B compare --------------------------------------------------------------------------------

function renderAbIds() {
  const sel = $('ab-id');
  sel.replaceChildren(...sfx.ids().map(id => el('option', { value: id, text: id })));
  sel.value = 'spell.fire.impact';
}

$('ab-run').onclick = async () => {
  const id = $('ab-id').value;
  const out = $('ab-out');
  out.replaceChildren();
  const keep = sfx.method();
  for (const m of METHOD_ORDER) {
    sfx.setMethod(m);
    let rec = null;
    try { rec = await sfx.load(id, 0); } catch (e) { /* method cannot make it */ }
    const cell = el('div', { class: 'ab-cell' },
      el('h4', { text: METHODS[m].meta.name }),
      el('div', { class: 'lvl', text: rec ? `${rec.levels.before.lufs.toFixed(1)} → ${rec.levels.after.lufs.toFixed(1)} LUFS (${rec.gainDb > 0 ? '+' : ''}${rec.gainDb.toFixed(1)} dB)` : 'not available' }),
      el('div', { class: 'lvl', text: rec ? `via ${rec.via}${rec.file ? ' · ' + rec.file.split('/').pop() : ''}` : '' }),
      el('button', { class: 'small', text: '▶ play', disabled: rec ? null : '', onclick: async () => { const was = sfx.method(); sfx.setMethod(m); await sfx.play(id, { variant: 0 }); sfx.setMethod(was); } }));
    out.append(cell);
    if (rec) { await sfx.play(id, { variant: 0 }); await new Promise(r => setTimeout(r, Math.min(1200, rec.levels.before.dur * 1000 + 220))); }
  }
  sfx.setMethod(keep);
  renderMethod();
  renderLevels();
};

// ---- boot ------------------------------------------------------------------------------------

renderMethod();
renderAbIds();
renderGrid();
status.textContent = `${sfx.ids().length} sounds · ${Object.keys(sfx.categories).length} categories · click a sound to build and play it`;

/** Test / console handle. */
window.sfxDemo = {
  get sfx() { return sfx; },
  play: (id, opts) => sfx.play(id, opts),
  load: (id, v = 0) => sfx.load(id, v),
  setMethod: m => { sfx.setMethod(m); renderMethod(); renderGrid(); renderLevels(); },
  table: () => sfx.normalizationTable(),
  renderGrid, renderLevels,
  /** Build a few ids and return their measured levels — what the Playwright spec checks. */
  async measure(ids, method = null) {
    if (method) sfx.setMethod(method);
    const out = [];
    for (const id of ids) {
      const rec = await sfx.load(id, 0);
      const chan = rec.buffer.getChannelData(0);
      let peak = 0, finite = true;
      for (let i = 0; i < chan.length; i++) { const v = chan[i] * rec.gain; if (!Number.isFinite(v)) finite = false; const a = Math.abs(v); if (a > peak) peak = a; }
      out.push({ id, method: sfx.method(), via: rec.via, finite, peak, gainDb: rec.gainDb,
        target: rec.target, aim: rec.aim, limitedDb: rec.limitedDb,
        beforeLufs: rec.levels.before.lufs, afterLufs: rec.levels.after.lufs, samples: chan.length });
    }
    renderGrid(); renderLevels();
    return out;
  },
};
