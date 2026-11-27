// Icon Kit review page: Builder, Compare, Status, Class sheet, In game (Oathwild), Old library, Glyph matrix.
// Reads Oathwild's spell and class data read-only (its own rules/spells.js builds the catalogue) and its current icon
// code, and the old SVG icon library — nothing here writes to a game.
import { loadKit, SHAPES, STATES, SIZES, DISPELS } from './iconkit.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = s => String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const store = {
  get(k, d) { try { const v = localStorage.getItem('iconkit.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('iconkit.' + k, JSON.stringify(v)); } catch { /* private window: keep in memory only */ } },
};

const kit = await loadKit();
const TABS = ['builder', 'compare', 'status', 'classes', 'oathwild', 'library', 'matrix'];
const B_DEFAULT = { glyph: 'fireball', plate: 'stone', cls: 'mage', glowFrom: 'fire', custom: false, tint: '#38469a', glowColor: '#ff9a3a', glyphTint: '#ff8a30', strength: 0.65,
  glow: 'soft', frame: 'gold', frameColor: 'gold', frameHex: '#e2b85a', size: 64, state: 'ready', passiveStyle: 'dim', dispel: '',
  cd: 0, secs: 0, cast: -1, castStyle: 'bottom', stacks: 0, maxStacks: 5, dur: 0, animate: true };
const state = {
  tab: TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'builder',
  art: store.get('art', 'best'),
  shape: store.get('shape', 'circle'),
  b: Object.assign({}, B_DEFAULT, store.get('builder2', {})),
  cmp: Object.assign({ cls: '', size: 40 }, store.get('compare', {})),
  ow: { cls: '', only: false, q: '' },
  lib: { q: '', set: 'all' },
};
const MATCH = {
  named: { label: 'Named', note: 'a word in its name picked the glyph' },
  exact: { label: 'Exact', note: 'element and kind both match' },
  mechanic: { label: 'Generic', note: 'a glyph for the kind of ability' },
  element: { label: 'Element', note: 'only the element matched' },
  class: { label: 'Class', note: 'the class emblem — nothing closer' },
};
const STATE_NOTE = {
  ready: 'normal', disabled: 'grey, dark', selected: 'bright frame + halo', passive: 'never pressed: no glow, muted',
  active: 'toggled on: steady inner glow + gold edge', channeling: 'pulsing glow + light running round the rim',
  nomana: 'blue wash', norange: 'red wash',
};
const icon = (spec, o) => kit.iconHtml({ art: state.art, ...spec }, o);
let timer = null;   // the one animation loop (Builder live row or Status bars); stopped on every tab change
const stopLoop = () => { if (timer) { clearInterval(timer); timer = null; } };

// ---- loaders (each once) -------------------------------------------------------------------------------------------
let owP = null, libP = null;
function loadOathwild() {
  return owP ??= (async () => {
    const [{ rulesDataUrl }, { buildCatalog }, cur] = await Promise.all([
      import('../../prototypes/oathwild/js/rules/data.js'),
      import('../../prototypes/oathwild/js/rules/spells.js'),
      import('../../prototypes/oathwild/js/client/ui/icons.js'),
    ]);
    const data = {};
    await Promise.all(['skills', 'tvSkills', 'tvClasses', 'spells', 'classes'].map(async k => { const r = await fetch(rulesDataUrl(k)); data[k] = await r.json(); }));
    const cat = buildCatalog({ data });
    const classes = data.classes.classes, rows = [];
    for (const [cls, c] of Object.entries(classes)) {
      const seen = new Set();
      for (const n of c.nodes || []) {
        if (n.kind !== 'spell' || seen.has(n.spell) || !cat[n.spell]) continue;
        seen.add(n.spell);
        const row = { id: n.spell, ...cat[n.spell].base };
        rows.push({ cls, clsName: c.name, id: n.spell, row, level: n.level, free: !!n.free, pick: kit.iconFor(row, cls) });
      }
    }
    return { rows, classes, cat, spellIcon: cur.spellIcon };
  })();
}
function loadLibrary() {
  return libP ??= (async () => {
    const [cat, game] = await Promise.all([import('../../icons/js/catalog.js'), import('../../icons/js/game-icons.js')]);
    const items = [];
    for (const i of cat.icons) items.push({ set: 'spells', id: i.id, name: i.name, sub: i.className, words: `${i.description} ${i.categories.join(' ')}`, svg: () => cat.iconSvg(i.id, 56) });
    for (const [cls, ids] of Object.entries(game.CLASS_MOTIFS)) for (const id of ids) items.push({ set: 'motifs', id, name: `${cap(cls)} · ${id.split('.').pop() === 'a' ? 'Missile' : id.split('.').pop() === 'b' ? 'Impact' : 'Ground sign'}`, sub: 'Oathwild fallback medallion', words: cls, svg: () => `<span class="ow-motif ikr-motif">${game.motifSvg(id, 56)}</span>` });
    for (const id of Object.keys(game.UI_ICONS)) items.push({ set: 'ui', id, name: cap(id), sub: 'Button / menu icon', words: id, svg: () => game.uiIconSvg(id, 48) });
    for (const id of Object.keys(game.ITEM_ART)) items.push({ set: 'items', id, name: cap(id), sub: 'Item picture', words: id, svg: () => game.itemIconSvg(id, 52) });
    return items;
  })();
}

// ---- tabs ----------------------------------------------------------------------------------------------------------
const view = $('#view');
// the sticky bars are placed from their measured heights, never fixed numbers (lessons rule 14)
const topBar = $('.ikr-top'), tabBar = $('.ikr-tabs');
const placeBars = () => { const a = topBar.offsetHeight, b = tabBar.offsetHeight; document.documentElement.style.setProperty('--ikr-top', a + 'px'); document.documentElement.style.setProperty('--ikr-bars', a + b + 'px'); };
new ResizeObserver(placeBars).observe(topBar); new ResizeObserver(placeBars).observe(tabBar); placeBars();
function setTab(t) {
  state.tab = t;
  history.replaceState(null, '', '#' + t);
  for (const b of document.querySelectorAll('.ikr-tabs [data-tab]')) { const on = b.dataset.tab === t; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  window.scrollTo(0, 0);
  render();
}
function render() {
  stopLoop();
  ({ builder: renderBuilder, compare: renderCompare, status: renderStatus, classes: renderClasses, oathwild: renderOathwild, library: renderLibrary, matrix: renderMatrix })[state.tab]();
}
document.querySelector('.ikr-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
document.querySelector('.ikr-art').addEventListener('click', e => {
  const b = e.target.closest('[data-art]'); if (!b) return;
  state.art = b.dataset.art; store.set('art', state.art);
  for (const x of document.querySelectorAll('.ikr-art [data-art]')) x.classList.toggle('is-on', x.dataset.art === state.art);
  render();
});
for (const x of document.querySelectorAll('.ikr-art [data-art]')) x.classList.toggle('is-on', x.dataset.art === state.art);

const seg = (name, options, value) => `<div class="ikr-seg" role="group" data-seg="${name}">${options.map(([v, l]) => `<button type="button" data-v="${esc(v)}" class="${String(v) === String(value) ? 'is-on' : ''}">${esc(l)}</button>`).join('')}</div>`;
const shapeSeg = () => seg('shape', SHAPES.map(s => [s, cap(s)]), state.shape);
function onSeg(root, name, fn) {
  root.addEventListener('click', e => { const b = e.target.closest(`[data-seg="${name}"] [data-v]`); if (b) fn(b.dataset.v); });
}
const classOptions = sel => kit.classes().map(c => `<option value="${c}" ${c === sel ? 'selected' : ''}>${esc(kit.themeFor(c).name)}</option>`).join('');
const elementOptions = sel => kit.elements().map(e => `<option value="${e}" ${e === sel ? 'selected' : ''}>${esc(kit.themeFor(e).name)}</option>`).join('');
/** the frame choices: the four plain ones, the class's own, then every themed frame by name */
const FRAME_MAIN = [['gold', 'Gold studded'], ['filigree', 'Gold filigree'], ['thin', 'Thin'], ['hairline', 'Hairline'], ['none', 'None'], ['class', 'Class themed']];
const frameName = id => FRAME_MAIN.find(f => f[0] === id)?.[1] || kit.data.layers.frames[id]?.name || cap(id);

// ---- Builder -------------------------------------------------------------------------------------------------------
function builderSpec(extra = {}) {
  const b = state.b, th = kit.themeFor(b.cls), gl = kit.themeFor(b.glowFrom);
  const mode = { cooldown: b.cd, seconds: b.secs || null, cast: b.cast >= 0 ? b.cast : null, castStyle: b.castStyle, stacks: b.stacks, maxStacks: b.maxStacks, duration: b.dur || null };
  return {
    shape: state.shape, glyph: b.glyph, plate: b.plate, cls: b.cls,
    tint: b.custom ? b.tint : th.tint, strength: b.strength,
    glow: b.glow === 'none' ? null : b.glow, glowColor: b.custom ? b.glowColor : gl.glow,
    glyphTint: b.custom ? b.glyphTint : (gl.glyphTint || gl.glow),
    frame: b.frame, frameColor: b.frameColor === 'gold' ? null : b.frameColor === 'class' ? 'class' : b.frameHex,
    size: b.size, state: b.state, passiveStyle: b.passiveStyle, dispel: b.dispel || null, mode, ...extra,
  };
}
const range = (name, label, min, max, step, value, shown) => `<label class="ikr-field"><span>${label} <small data-out="${name}">${shown}</small></span><input type="range" name="${name}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
function renderBuilder() {
  const b = state.b, g = kit.glyph(b.glyph);
  const spec = builderSpec();
  const plain = { ...spec, state: 'ready', dispel: null, mode: {} };
  const src = kit.layerSources(spec, 192);
  const isLine = ['thin', 'hairline'].includes(b.frame);
  const layer = (n, title, only, note) => `<figure class="ikr-layer"><div class="ikr-tile">${icon({ ...plain, size: 96 }, { only })}</div><figcaption><b>${n}</b> ${title}<small>${note}</small></figcaption></figure>`;
  view.innerHTML = `
  <section class="ikr-builder">
    <div class="ikr-stage">
      <h2>Layers <small>${esc(frameName(kit.normalize(spec).frame))} frame · opening ${Math.round(src.inner * 200)}% of the width</small></h2>
      <div class="ikr-layers">
        ${layer(1, 'Frame', ['frame'], src.frame ? (src.frameTint ? 'drawn line, any colour' : 'painted') : 'none')}
        ${layer(2, 'Background', ['plate'], 'tinted by class')}
        ${layer(3, 'Glyph', ['glyph'], src.glyphTint ? 'drawn, tinted by element' : 'painted')}
        ${layer(4, 'Glow', ['glow'], spec.glow ? 'tinted by element' : 'off')}
        <span class="ikr-eq" aria-hidden="true">=</span>
        <figure class="ikr-layer ikr-final"><div class="ikr-tile">${icon({ ...spec, size: 96 }, { label: g.name })}</div><figcaption><b>5</b> Final</figcaption></figure>
      </div>
      <h2>Sizes <small>stacked HTML layers · hairlines check the centring</small></h2>
      <div class="ikr-sizes">${SIZES.map(s => `<figure><div class="ikr-cross">${icon({ ...plain, size: s })}</div><figcaption>${s} px</figcaption></figure>`).join('')}</div>
      <h2>Sizes <small>one composed picture (canvas, for action bars)</small></h2>
      <div class="ikr-sizes" id="canvas-row">${SIZES.map(s => `<figure><div class="ikr-cross"><img alt="" width="${s}" height="${s}" data-size="${s}"></div><figcaption>${s} px</figcaption></figure>`).join('')}</div>
      <h2>States</h2>
      <div class="ikr-sizes ikr-states">${STATES.map(st => `<figure>${icon({ ...plain, size: 56, state: st })}<figcaption><b>${cap(st === 'nomana' ? 'no mana' : st === 'norange' ? 'out of range' : st)}</b>${esc(STATE_NOTE[st])}</figcaption></figure>`).join('')}</div>
      <h2>Passive: two looks <small>recommended: Dim — reads as "always on" at a glance and keeps the class colour</small></h2>
      <div class="ikr-sizes">${[['ready', 'Ready (for comparison)'], ['dim', 'Dim'], ['socket', 'Socket']].map(([p, l]) => `<figure>${icon({ ...plain, size: 64, state: p === 'ready' ? 'ready' : 'passive', passiveStyle: p })}<figcaption>${l}</figcaption></figure>`).join('')}</div>
      <h2>Dispellable <small>inner ring colour = what can remove it</small></h2>
      <div class="ikr-sizes">${DISPELS.map(d => `<figure>${icon({ ...plain, size: 56, dispel: d })}<figcaption>${cap(d)}</figcaption></figure>`).join('')}<figure>${icon({ ...plain, size: 56 })}<figcaption>None</figcaption></figure></div>
      <h2>Modes <small>${b.animate ? 'playing a loop' : 'still — turn Animate on to play'}</small></h2>
      <div class="ikr-sizes" id="live-row"></div>
      <h2>Spec</h2>
      <pre class="ikr-spec">${esc(JSON.stringify(kit.normalize({ ...spec, art: state.art }), null, 1))}</pre>
    </div>
    <form class="ikr-controls" onsubmit="return false">
      <div class="ikr-peek" aria-hidden="true"><div class="ikr-cross">${icon({ ...spec, size: 64 })}</div><div class="ikr-cross">${icon({ ...spec, size: 40 })}</div><span>${esc(g.name)}<small>layers, states and modes below</small></span></div>
      <div class="ikr-row"><label class="ikr-field"><span>Class</span><select name="cls">${classOptions(b.cls)}</select></label>
        <label class="ikr-field"><span>Element (glow)</span><select name="glowFrom">${elementOptions(b.glowFrom)}</select></label></div>
      <div class="ikr-field"><span>Shape</span>${shapeSeg()}</div>
      <div class="ikr-field"><span>Frame</span>${seg('frame', FRAME_MAIN, FRAME_MAIN.some(f => f[0] === b.frame) ? b.frame : '')}
        <select name="frame" aria-label="Any frame">${['<option value="">Any themed frame…</option>', ...kit.frames().filter(f => f.cls).map(f => `<option value="${f.id}" ${f.id === b.frame ? 'selected' : ''}>${esc(f.name)}</option>`)].join('')}</select></div>
      ${isLine ? `<div class="ikr-field"><span>Line colour</span>${seg('frameColor', [['gold', 'Gold'], ['class', 'Class colour'], ['custom', 'Custom']], b.frameColor)}${b.frameColor === 'custom' ? `<input type="color" name="frameHex" value="${b.frameHex}">` : ''}</div>` : ''}
      <div class="ikr-field"><span>Glyph <small>${esc(g.name)} · ${esc(g.element ? cap(g.element) : 'any element')} · ${esc(kit.data.glyphs.mechanics[g.mechanic] || g.mechanic)}</small></span>
        <div class="ikr-glyphs">${kit.glyphs.map(x => `<button type="button" data-glyph="${x.id}" class="${x.id === b.glyph ? 'is-on' : ''}" aria-label="${esc(x.name)}">${icon({ ...plain, glyph: x.id, size: 40 })}<small>${esc(x.name)}</small></button>`).join('')}</div></div>
      <div class="ikr-field"><span>Background</span>${seg('plate', Object.entries(kit.data.layers.plates).map(([id, p]) => [id, p.name]), b.plate)}</div>
      <div class="ikr-field"><span>Colours</span>${seg('custom', [['false', 'From class + element'], ['true', 'Custom']], String(b.custom))}</div>
      ${b.custom ? `<div class="ikr-row"><label class="ikr-field"><span>Background</span><input type="color" name="tint" value="${b.tint}"></label>
        <label class="ikr-field"><span>Glow</span><input type="color" name="glowColor" value="${b.glowColor}"></label>
        <label class="ikr-field"><span>Glyph tint</span><input type="color" name="glyphTint" value="${b.glyphTint}"></label></div>` : ''}
      ${range('strength', 'Tint strength', 0, 1, 0.05, b.strength, `${Math.round(b.strength * 100)}%`)}
      <div class="ikr-field"><span>Glow</span>${seg('glow', [['none', 'Off'], ...Object.entries(kit.data.layers.glows).map(([id, x]) => [id, x.name])], b.glow)}</div>
      <div class="ikr-field"><span>State</span>${seg('state', STATES.map(s => [s, s === 'nomana' ? 'No mana' : s === 'norange' ? 'Out of range' : cap(s)]), b.state)}</div>
      ${b.state === 'passive' ? `<div class="ikr-field"><span>Passive look</span>${seg('passiveStyle', [['dim', 'Dim'], ['socket', 'Socket']], b.passiveStyle)}</div>` : ''}
      <div class="ikr-field"><span>Dispel ring</span>${seg('dispel', [['', 'None'], ...DISPELS.map(d => [d, cap(d)])], b.dispel)}</div>
      <div class="ikr-field"><span>Animate</span>${seg('animate', [['true', 'Play the loop'], ['false', 'Still']], String(b.animate))}</div>
      ${range('cd', 'Cooldown left', 0, 1, 0.05, b.cd, `${Math.round(b.cd * 100)}%`)}
      ${range('secs', 'Cooldown seconds', 0, 120, 0.5, b.secs, b.secs ? kit.timeText(b.secs) : 'off')}
      ${range('cast', 'Cast progress', -0.05, 1, 0.05, b.cast, b.cast >= 0 ? `${Math.round(b.cast * 100)}%` : 'off')}
      <div class="ikr-field"><span>Cast bar</span>${seg('castStyle', [['bottom', 'Along the bottom'], ['face', 'Across the face']], b.castStyle)}</div>
      <div class="ikr-row">${range('stacks', 'Stacks', 0, 10, 1, b.stacks, b.stacks || 'off')}${range('maxStacks', 'Full at', 0, 10, 1, b.maxStacks, b.maxStacks || 'no max')}</div>
      ${range('dur', 'Duration under it', 0, 600, 1, b.dur, b.dur ? kit.timeText(b.dur) : 'off')}
      <div class="ikr-field"><span>Preview size</span>${seg('size', SIZES.map(s => [s, `${s}`]), b.size)}</div>
      <button type="button" class="ikr-reset" data-reset>Reset the builder</button>
    </form>
  </section>`;
  const form = $('.ikr-controls', view);
  const save = () => { store.set('builder2', state.b); renderBuilder(); };
  form.addEventListener('click', e => {
    if (e.target.closest('[data-reset]')) { state.b = { ...B_DEFAULT }; save(); return; }
    const gb = e.target.closest('[data-glyph]'); if (gb) { b.glyph = gb.dataset.glyph; const el = kit.glyph(b.glyph).element; if (el) b.glowFrom = el; save(); return; }
    const sb = e.target.closest('[data-seg] [data-v]'); if (!sb) return;
    const k = sb.parentElement.dataset.seg, v = sb.dataset.v;
    if (k === 'shape') { state.shape = v; store.set('shape', v); }
    else if (k === 'size') b.size = Number(v);
    else if (k === 'custom') { b.custom = v === 'true'; if (b.custom) { const th = kit.themeFor(b.cls), gl = kit.themeFor(b.glowFrom); b.tint = th.tint; b.glowColor = gl.glow; b.glyphTint = gl.glyphTint || gl.glow; } }
    else if (k === 'animate') b.animate = v === 'true';
    else b[k] = v;
    save();
  });
  form.addEventListener('change', e => { const t = e.target; if (t.tagName === 'SELECT' && t.name) { if (t.value === '' && t.name === 'frame') return; b[t.name] = t.value; save(); } });
  form.addEventListener('input', e => {
    const t = e.target; if (!t.name || t.tagName === 'SELECT') return;
    b[t.name] = t.type === 'range' ? Number(t.value) : t.value;
    store.set('builder2', b);
    clearTimeout(renderBuilder.t); renderBuilder.t = setTimeout(renderBuilder, t.type === 'range' ? 140 : 0);
  });
  // the canvas row: the same spec composed once into a picture
  for (const img of view.querySelectorAll('#canvas-row img')) {
    const s = Number(img.dataset.size);
    kit.iconDataUrl({ ...plain, art: state.art, size: s }, { scale: Math.min(3, Math.max(1, Math.round(devicePixelRatio || 1))) }).then(u => { img.src = u; }).catch(err => { img.replaceWith(Object.assign(document.createElement('span'), { className: 'ikr-err', textContent: err.message })); });
  }
  // the modes row: your settings, plus a looping demo of each mode
  const live = $('#live-row', view);
  const draw = t => {
    const cdT = (t % 6) / 6, castT = (t % 2.5) / 2.5, stk = 1 + Math.floor(t / 1.2) % 5;
    const demo = b.animate;
    live.innerHTML = [
      ['Your settings', spec],
      ['Cooldown + seconds', { ...plain, mode: { cooldown: demo ? 1 - cdT : 0.6, seconds: demo ? 6 * (1 - cdT) : 3.6 } }],
      ['Cast · bottom', { ...plain, mode: { cast: demo ? castT : 0.55, castStyle: 'bottom' } }],
      ['Cast · face', { ...plain, mode: { cast: demo ? castT : 0.55, castStyle: 'face' } }],
      ['Channeling', { ...plain, state: 'channeling' }],
      ['Active', { ...plain, state: 'active' }],
      ['Stacks', { ...plain, mode: { stacks: demo ? stk : 3, maxStacks: 5 } }],
      ['Duration', { ...plain, mode: { duration: demo ? 30 - Math.floor(t % 30) : 24 } }],
    ].map(([l, sp]) => `<figure>${icon({ ...sp, size: 64 })}<figcaption>${l}</figcaption></figure>`).join('');
  };
  const t0 = performance.now();
  draw(0);
  if (b.animate) timer = setInterval(() => draw((performance.now() - t0) / 1000), 100);
}

// ---- Compare: frames × glyphs per class, to pick Oathwild's look -----------------------------------------------------
const CMP_ROWS = [
  ['gold', null, 'Gold studded'], ['filigree', null, 'Gold filigree'], ['thin', null, 'Thin gold'], ['thin', 'class', 'Thin, class colour'],
  ['hairline', null, 'Hairline gold'], ['hairline', 'class', 'Hairline, class colour'], ['none', null, 'None'], ['class', null, 'Class themed'],
];
async function renderCompare() {
  view.innerHTML = '<p class="ikr-loading">Reading Oathwild\'s spells…</p>';
  let ow = null; try { ow = await loadOathwild(); } catch { ow = null; }
  if (state.tab !== 'compare') return;
  const c = state.cmp, size = Number(c.size) || 40;
  const classes = c.cls ? [c.cls] : kit.classes();
  // each class's four most-used glyphs in Oathwild (its emblem first)
  const picks = cls => {
    const th = kit.themeFor(cls), rows = ow ? ow.rows.filter(r => r.cls === cls) : [];
    const count = new Map(); for (const r of rows) count.set(r.pick.glyph, (count.get(r.pick.glyph) || 0) + 1);
    const ids = [th.glyph, ...[...count].sort((a, b) => b[1] - a[1]).map(x => x[0])];
    const out = []; for (const id of ids) if (!out.includes(id) && kit.glyph(id)) out.push(id);
    for (const id of ['sword-slash', 'fireball', 'holy-light', 'shield-bash']) if (out.length < 4 && !out.includes(id)) out.push(id);
    return out.slice(0, 4).map(id => ({ id, row: rows.find(r => r.pick.glyph === id) }));
  };
  view.innerHTML = `<section class="ikr-compare">
    <div class="ikr-filters">
      <label class="ikr-field"><span>Class</span><select name="cls"><option value="">Every class (${kit.classes().length})</option>${classOptions(c.cls)}</select></label>
      <div class="ikr-field"><span>Size</span>${seg('size', [[40, '40 px'], [64, '64 px']], size)}</div>
      <div class="ikr-field"><span>Shape</span>${shapeSeg()}</div>
    </div>
    <p class="ikr-lead">Each class shows its own most-used glyphs (from its Oathwild spells) in every frame. Tap any icon to open it in the Builder.</p>
    ${classes.map(cls => {
      const th = kit.themeFor(cls), gl = picks(cls);
      return `<article class="ikr-cmp"><h2><span class="ikr-swatch" style="--sw:${th.tint}"></span>${esc(th.name)} <small>themed frame: ${esc(frameName(th.frame))}</small></h2>
        <div class="ikr-cmpgrid" style="--n:${gl.length}">
          <span></span>${gl.map(x => `<span class="ikr-cmpcol">${esc(x.row?.row.name || kit.glyph(x.id).name)}</span>`).join('')}
          ${CMP_ROWS.map(([fr, col, label]) => `<span class="ikr-cmprow">${label}</span>${gl.map(x => {
            const base = x.row ? x.row.pick.spec : kit.iconFor({ name: kit.glyph(x.id).name, element: kit.glyph(x.id).element || 'physical' }, cls).spec;
            const sp = { ...base, glyph: x.id, cls, shape: state.shape, frame: fr, frameColor: col, size };
            return `<button type="button" class="ikr-cmpcell" data-open='${esc(JSON.stringify({ glyph: x.id, cls, frame: fr, frameColor: col || 'gold', glowFrom: x.row?.pick.element || kit.glyph(x.id).element || 'physical' }))}' aria-label="${esc(label)}">${icon(sp)}</button>`;
          }).join('')}`).join('')}
        </div></article>`;
    }).join('')}
  </section>`;
  const f = $('.ikr-filters', view);
  f.addEventListener('change', e => { if (e.target.name === 'cls') { c.cls = e.target.value; store.set('compare', c); renderCompare(); } });
  onSeg(f, 'size', v => { c.size = Number(v); store.set('compare', c); renderCompare(); });
  onSeg(f, 'shape', v => { state.shape = v; store.set('shape', v); renderCompare(); });
  view.addEventListener('click', e => {
    const b = e.target.closest('[data-open]'); if (!b) return;
    Object.assign(state.b, JSON.parse(b.dataset.open), { custom: false, state: 'ready', dispel: '', cd: 0, secs: 0, cast: -1, stacks: 0, dur: 0 });
    store.set('builder2', state.b); setTab('builder');
  });
}

// ---- Status: a mock action bar and buff bar, animated ----------------------------------------------------------------
async function renderStatus() {
  view.innerHTML = '<p class="ikr-loading">Reading Oathwild\'s spells…</p>';
  let ow = null; try { ow = await loadOathwild(); } catch { ow = null; }
  if (state.tab !== 'status') return;
  const cls = state.b.cls || 'warrior';
  const spells = (ow ? ow.rows.filter(r => r.cls === cls) : []).slice(0, 8);
  while (spells.length < 8) spells.push({ row: { name: kit.glyphs[spells.length].name }, pick: kit.iconFor({ name: kit.glyphs[spells.length].name, element: kit.glyphs[spells.length].element || 'physical' }, cls) });
  const buffs = [
    { name: 'Battle Shout', glyph: 'rally', el: 'physical', dur: 118, stacks: 0 },
    { name: 'Stone Skin', glyph: 'ward', el: 'nature', dur: 22, dispel: 'magic' },
    { name: 'Rage', glyph: 'taunt', el: 'fire', dur: 9, stacks: 3, max: 5, dispel: 'enrage' },
    { name: 'Venom', glyph: 'poison', el: 'poison', dur: 12, stacks: 2, max: 3, dispel: 'poison', debuff: true },
    { name: 'Hex', glyph: 'shadow-bolt', el: 'shadow', dur: 15, dispel: 'curse', debuff: true },
    { name: 'Rot', glyph: 'skull', el: 'shadow', dur: 40, dispel: 'disease', debuff: true },
  ];
  const fit = () => { const w = ($('.ikr-status', view)?.clientWidth || 328); return Math.max(28, Math.min(52, Math.floor((Math.min(w, 640) - 22 - 7 * 6) / 8))); };
  view.innerHTML = `<section class="ikr-status">
    <div class="ikr-bar"><p class="ikr-lead">A ${esc(kit.themeFor(cls).name)} action bar and a buff bar drawn by the kit, ticking live. Change the class or frame in the Builder.</p>
      <div class="ikr-field"><span>Frame</span>${seg('frame', FRAME_MAIN, FRAME_MAIN.some(f => f[0] === state.b.frame) ? state.b.frame : 'gold')}</div></div>
    <h2>Action bar <small>cooldowns with seconds · casting · channeling · toggled on · no mana · out of range · stacks · passive</small></h2>
    <div class="ikr-mockbar" id="mock-bar"></div>
    <div class="ikr-castline"><span id="cast-name"></span><i><b id="cast-fill"></b></i></div>
    <h2>Buffs and debuffs <small>ring colour = what dispels it · stacks · time left under each</small></h2>
    <div class="ikr-mockbuffs" id="mock-buffs"></div>
    <h2>Legend</h2>
    <ul class="ikr-legend">${['magic', 'curse', 'poison', 'disease', 'enrage'].map(d => `<li><i style="--sw:${kit.data.themes.dispel[d]}"></i>${cap(d)}</li>`).join('')}</ul>
  </section>`;
  onSeg(view, 'frame', v => { state.b.frame = v; store.set('builder2', state.b); renderStatus(); });
  const bar = $('#mock-bar', view), buffEl = $('#mock-buffs', view), castName = $('#cast-name', view), castFill = $('#cast-fill', view);
  const frame = state.b.frame, frameColor = state.b.frameColor === 'class' ? 'class' : null;
  const base = r => ({ ...r.pick.spec, shape: state.shape, frame, frameColor, cls });
  const t0 = performance.now();
  const draw = () => {
    const t = (performance.now() - t0) / 1000, size = fit();
    const cdA = 8 - (t % 8), cdB = 20 - (t % 20), cast = (t % 3) / 3;
    const slot = (i, extra) => icon({ ...base(spells[i]), size, ...extra }, { label: spells[i].row.name });
    bar.style.setProperty('--slot', size + 'px');
    bar.innerHTML = [
      slot(0, {}),
      slot(1, { mode: { cooldown: cdA / 8, seconds: cdA } }),
      slot(2, { mode: { cast, castStyle: 'bottom' } }),
      slot(3, { state: 'channeling' }),
      slot(4, { state: 'active' }),
      slot(5, { state: 'nomana', mode: { cooldown: cdB / 20, seconds: cdB } }),
      slot(6, { state: 'norange', mode: { stacks: 1 + Math.floor(t / 2) % 3, maxStacks: 3 } }),
      slot(7, { state: 'passive' }),
    ].map((h, i) => `<span class="ikr-slot"><kbd>${i + 1}</kbd>${h}</span>`).join('');
    castName.textContent = `${spells[2].row.name}  ${(cast * 3).toFixed(1)} / 3.0`;
    castFill.style.width = `${Math.round(cast * 100)}%`;
    const bs = Math.round(size * 0.8);
    buffEl.innerHTML = buffs.map(x => {
      const left = x.dur - (t % x.dur);
      const sp = { ...kit.iconFor({ name: x.name, element: x.el }, cls).spec, glyph: x.glyph, shape: state.shape, frame, frameColor, cls, size: bs, dispel: x.dispel || null, mode: { stacks: x.stacks ? Math.min(x.max || 9, 1 + Math.floor(t / 2) % ((x.max || 3) + 1)) : 0, maxStacks: x.max || 0, duration: left } };
      return `<span class="ikr-buff${x.debuff ? ' is-debuff' : ''}">${icon(sp, { label: x.name })}</span>`;
    }).join('');
  };
  draw();
  timer = setInterval(draw, 100);
}

// ---- Class sheet ---------------------------------------------------------------------------------------------------
function renderClasses() {
  const shown = kit.classes();
  view.innerHTML = `<section class="ikr-sheet">
    <div class="ikr-bar"><p class="ikr-lead">Every glyph in each class's colours: the background takes the class tint, the glow and tintable glyphs take the glyph's element (or the class glow when the glyph has none).</p>${shapeSeg()}</div>
    ${shown.map(c => {
      const th = kit.themeFor(c);
      return `<article class="ikr-class"><header><span class="ikr-swatch" style="--sw:${th.tint}"></span><h2>${esc(th.name)}</h2><small>emblem: ${esc(kit.glyph(th.glyph)?.name || th.glyph)}</small></header>
        <div class="ikr-strip">${kit.glyphs.map(g => {
          const el = g.element ? kit.themeFor(g.element) : null;
          return `<figure>${icon({ shape: state.shape, glyph: g.id, tint: th.tint, strength: th.strength, glow: kit.data.layers.elementGlow[g.element] || 'soft', glowColor: el ? el.glow : th.glow, glyphTint: th.glow, cls: c, frame: state.b.frame, frameColor: state.b.frameColor === 'class' ? 'class' : null, size: 48 }, { label: g.name })}<figcaption>${esc(g.name)}</figcaption></figure>`;
        }).join('')}</div></article>`;
    }).join('')}</section>`;
  onSeg(view, 'shape', v => { state.shape = v; store.set('shape', v); renderClasses(); });
}

// ---- In game: Oathwild ---------------------------------------------------------------------------------------------
async function renderOathwild() {
  view.innerHTML = '<p class="ikr-loading">Reading Oathwild\'s spells…</p>';
  let ow;
  try { ow = await loadOathwild(); } catch (err) { view.innerHTML = `<p class="ikr-err">Could not read Oathwild's spell data here (${esc(err.message)}).</p>`; return; }
  if (state.tab !== 'oathwild') return;
  const o = state.ow;
  const q = o.q.trim().toLowerCase();
  const list = ow.rows.filter(r => (!o.cls || r.cls === o.cls) && (!o.only || r.pick.fallback) && (!q || `${r.row.name} ${r.id} ${r.pick.element} ${r.pick.mechanic}`.toLowerCase().includes(q)));
  const counts = {}; for (const r of ow.rows.filter(r => !o.cls || r.cls === o.cls)) counts[r.pick.match] = (counts[r.pick.match] || 0) + 1;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const groups = new Map(); for (const r of list) { if (!groups.has(r.cls)) groups.set(r.cls, []); groups.get(r.cls).push(r); }
  view.innerHTML = `<section class="ikr-ow">
    <div class="ikr-filters">
      <label class="ikr-field"><span>Class</span><select name="cls"><option value="">All classes (${Object.keys(ow.classes).length})</option>${Object.entries(ow.classes).map(([k, c]) => `<option value="${k}" ${k === o.cls ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="ikr-field ikr-grow"><span>Search</span><input type="search" name="q" value="${esc(o.q)}" placeholder="Spell, element or kind" autocomplete="off"></label>
      <div class="ikr-field"><span>Show</span>${seg('only', [['false', 'Every spell'], ['true', 'Only fallbacks']], String(o.only))}</div>
      <div class="ikr-field"><span>Shape</span>${shapeSeg()}</div>
    </div>
    <div class="ikr-tally">${Object.entries(MATCH).map(([k, m]) => `<span class="ikr-chip m-${k}"><b>${counts[k] || 0}</b> ${m.label}<small>${m.note}</small></span>`).join('')}<span class="ikr-chip"><b>${total}</b> spells</span></div>
    <p class="ikr-lead">Each row: the icon Oathwild shows now, then the one the kit would give it. A gold left edge marks a fallback pick.</p>
    ${list.length ? '' : '<p class="ikr-empty">No spells match.</p>'}
    ${[...groups].map(([cls, rows]) => `<article class="ikr-owclass"><h2><span class="ikr-swatch" style="--sw:${kit.themeFor(cls).tint}"></span>${esc(ow.classes[cls].name)} <small>${rows.length} spells</small></h2>
      <div class="ikr-owhead" aria-hidden="true"><span>Now</span><span>Kit</span><span>Spell</span></div>
      ${rows.map(r => `<div class="ikr-owrow${r.pick.fallback ? ' is-fallback' : ''}">
        <span class="ikr-cur">${ow.spellIcon(r.id, 44, { cls: r.cls })}</span>
        <span class="ikr-new">${icon({ ...r.pick.spec, shape: state.shape, frame: state.b.frame, frameColor: state.b.frameColor === 'class' ? 'class' : null, size: 44 }, { label: r.row.name })}</span>
        <span class="ikr-owtxt"><b>${esc(r.row.name)}</b><small>${esc(cap(r.pick.element))} · ${esc(kit.data.glyphs.mechanics[r.pick.mechanic] || r.pick.mechanic)} · level ${r.level}</small>
          <small class="ikr-why"><i class="ikr-chip m-${r.pick.match}">${MATCH[r.pick.match].label}</i> ${esc(kit.glyph(r.pick.glyph).name)} — ${esc(r.pick.why)}</small></span>
      </div>`).join('')}</article>`).join('')}
  </section>`;
  const f = $('.ikr-filters', view);
  f.addEventListener('change', e => { if (e.target.name === 'cls') { o.cls = e.target.value; renderOathwild(); } });
  f.addEventListener('input', e => { if (e.target.name === 'q') { o.q = e.target.value; clearTimeout(renderOathwild.t); renderOathwild.t = setTimeout(() => { renderOathwild().then(() => { const s = $('input[name=q]', view); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }); }, 200); } });
  onSeg(f, 'only', v => { o.only = v === 'true'; renderOathwild(); });
  onSeg(f, 'shape', v => { state.shape = v; store.set('shape', v); renderOathwild(); });
}

// ---- Old library ---------------------------------------------------------------------------------------------------
const LIB_SETS = { all: 'Everything', spells: 'Spell catalogue', motifs: 'Oathwild class motifs', ui: 'Button icons', items: 'Item pictures' };
async function renderLibrary() {
  view.innerHTML = '<p class="ikr-loading">Reading the icon library…</p>';
  const items = await loadLibrary();
  if (state.tab !== 'library') return;
  const l = state.lib, q = l.q.trim().toLowerCase();
  const list = items.filter(i => (l.set === 'all' || i.set === l.set) && (!q || `${i.id} ${i.name} ${i.sub} ${i.words}`.toLowerCase().includes(q)));
  const per = {}; for (const i of items) per[i.set] = (per[i.set] || 0) + 1;
  const LIMIT = 400;
  view.innerHTML = `<section class="ikr-lib">
    <div class="ikr-filters">
      <label class="ikr-field ikr-grow"><span>Search</span><input type="search" name="q" value="${esc(l.q)}" placeholder="Name, class, id…" autocomplete="off"></label>
      <div class="ikr-field"><span>Set</span>${seg('set', Object.entries(LIB_SETS).map(([k, v]) => [k, `${v} (${k === 'all' ? items.length : per[k] || 0})`]), l.set)}</div>
    </div>
    <p class="ikr-lead">${list.length} icons${list.length > LIMIT ? ` — showing the first ${LIMIT}; search to narrow` : ''}. The spell catalogue is the old SVG library (icons/); motifs are what Oathwild shows for a spell the catalogue lacks; button icons and item pictures are Codex-drawn SVG.</p>
    <div class="ikr-libgrid">${list.slice(0, LIMIT).map(i => `<figure class="ikr-libcard"><div class="ikr-libpic">${i.svg() || ''}</div><figcaption><b>${esc(i.name)}</b><small>${esc(i.sub)}</small><code>${esc(i.id)}</code></figcaption></figure>`).join('')}</div>
  </section>`;
  const f = $('.ikr-filters', view);
  f.addEventListener('input', e => { if (e.target.name === 'q') { l.q = e.target.value; clearTimeout(renderLibrary.t); renderLibrary.t = setTimeout(() => renderLibrary().then(() => { const s = $('input[name=q]', view); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }), 200); } });
  onSeg(f, 'set', v => { l.set = v; renderLibrary(); });
}

// ---- Glyph matrix --------------------------------------------------------------------------------------------------
async function renderMatrix() {
  const m = kit.glyphMatrix();
  let demand = {};
  try {
    const ow = await loadOathwild();
    for (const r of ow.rows) ((demand[r.pick.element] ??= {})[r.pick.mechanic] ??= []).push(r.row.name);
  } catch { demand = {}; }
  if (state.tab !== 'matrix') return;
  const mechs = Object.keys(m.mechanics);
  const todo = [];
  for (const e of m.elements) for (const k of mechs) {
    const c = m.cells[e][k], need = [...new Set(demand[e]?.[k] || [])];
    if (c.status !== 'painted' && need.length) todo.push({ e, k, need, status: c.status });
  }
  todo.sort((a, b) => b.need.length - a.need.length);
  const cell = (e, k) => {
    const c = m.cells[e][k], th = kit.themeFor(e), need = [...new Set(demand[e]?.[k] || [])];
    const gid = c.painted[0] || c.tinted[0];
    const pic = gid ? icon({ shape: state.shape, glyph: gid, tint: th.tint, strength: th.strength, glow: kit.data.layers.elementGlow[e] || 'soft', glowColor: th.glow, glyphTint: th.glyphTint, size: 44 }) : '<span class="ikr-hole"></span>';
    return `<div class="ikr-cell s-${c.status}"><span class="ikr-cellk">${esc(cap(k))}</span>${pic}<small>${c.status === 'painted' ? esc(kit.glyph(gid).name) : c.status === 'tinted' ? 'tinted only' : 'missing'}</small>${need.length ? `<b class="ikr-need">${need.length} in game</b>` : ''}</div>`;
  };
  const counts = { painted: 0, tinted: 0, missing: 0 }; for (const e of m.elements) for (const k of mechs) counts[m.cells[e][k].status]++;
  view.innerHTML = `<section class="ikr-matrix">
    <div class="ikr-bar"><p class="ikr-lead">Elements down, kinds of ability across. <b class="s-painted">${counts.painted} painted</b>, <b class="s-tinted">${counts.tinted} covered by a tinted generic glyph</b>, <b class="s-missing">${counts.missing} missing</b>. "In game" = Oathwild spells of that element and kind.</p>${shapeSeg()}</div>
    <div class="ikr-mx" style="--cols:${mechs.length}">
      <div class="ikr-mxhead"><span></span>${mechs.map(k => `<span>${esc(cap(k))}<small>${esc(m.mechanics[k])}</small></span>`).join('')}</div>
      ${m.elements.map(e => `<div class="ikr-mxrow"><h3><span class="ikr-swatch" style="--sw:${kit.themeFor(e).tint}"></span>${esc(kit.themeFor(e).name)}</h3>${mechs.map(k => cell(e, k)).join('')}</div>`).join('')}
    </div>
    <h2>Next painting batch <small>${todo.length} glyphs, most-used first</small></h2>
    <ol class="ikr-todo">${todo.map(t => `<li><b>${esc(cap(t.e))} ${esc(cap(t.k))}</b> <span class="ikr-chip m-${t.status === 'tinted' ? 'mechanic' : 'class'}">${t.status === 'tinted' ? 'tinted now' : 'missing'}</span> <small>${t.need.length} spells: ${esc(t.need.slice(0, 8).join(', '))}${t.need.length > 8 ? '…' : ''}</small></li>`).join('')}</ol>
  </section>`;
  onSeg(view, 'shape', v => { state.shape = v; store.set('shape', v); renderMatrix(); });
}

window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (TABS.includes(t) && t !== state.tab) setTab(t); });
setTab(state.tab);
