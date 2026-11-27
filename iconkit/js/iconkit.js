// Icon Kit — layered spell / ability icons any game can use.
//
// An icon is pictures on the SAME square canvas with the SAME centre, stacked bottom to top:
//   plate (grey stone, tinted by the CLASS) -> glow + glyph (cut to the plate) -> state effects -> frame -> text badges
// Nothing is ever offset: every layer fills the icon's box. The plate is scaled to tuck just under whichever frame is
// on (a hairline frame has a much wider opening than the studded gold one), and the glyph grows with the opening.
//
//   const kit = await loadKit();                         // reads data/themes.json, glyphs.json, layers.json
//   kit.themeFor('mage') / kit.themeFor('fire')          { id, kind, name, tint, glow, glyph, frame, strength, glyphTint }
//   kit.iconFor(spellRow, classId, { shape, frame })     { spec, glyph, match, fallback, why }
//   kit.iconHtml(spec, { label })                        stacked <span> layers (css/iconkit.css; animates with CSS)
//   await kit.iconCanvas(spec, { scale })                one composed <canvas>, cached by spec key
//   await kit.iconDataUrl(spec, { scale })               the same as a PNG data URL (an action bar's <img>)
//   kit.specKey(spec)                                    stable string; same spec -> same key
//
// A spec:
//   { shape: 'circle'|'square', glyph, plate, tint, strength, glow (id|null), glowColor, glyphTint,
//     frame: 'gold'|'thin'|'hairline'|'none'|'class'|<a frame id>, frameColor (line frames: '#hex'|'class'), cls,
//     size, state: 'ready'|'disabled'|'selected'|'passive'|'active'|'channeling'|'nomana'|'norange',
//     passiveStyle: 'dim'|'socket', dispel: null|'magic'|'curse'|'poison'|'disease'|'enrage',
//     mode: { cooldown: 0..1, seconds, cast: 0..1|null, castStyle: 'bottom'|'face', stacks, maxStacks, duration },
//     art: 'best'|'placeholder', glyphArt: 'best'|'drawn' }
// The old { state: 'cooldown', cd } still works (it becomes mode.cooldown).
// Everything except iconHtml / iconCanvas / iconDataUrl is pure and runs under Node (tests/iconkit.test.js).

export const SHAPES = Object.freeze(['circle', 'square']);
export const STATES = Object.freeze(['ready', 'disabled', 'selected', 'passive', 'active', 'channeling', 'nomana', 'norange']);
export const PASSIVE_STYLES = Object.freeze(['dim', 'socket']);
export const DISPELS = Object.freeze(['magic', 'curse', 'poison', 'disease', 'enrage']);
export const CAST_STYLES = Object.freeze(['bottom', 'face']);
export const SIZES = Object.freeze([24, 40, 64, 128]);
/** the field order of a spec key — append only, never reorder (caches depend on it) */
const KEY_FIELDS = ['shape', 'frame', 'plate', 'tint', 'strength', 'glow', 'glowColor', 'glyph', 'glyphTint', 'size', 'state', 'art',
  'frameColor', 'glyphArt', 'passiveStyle', 'dispel', 'm.cooldown', 'm.seconds', 'm.cast', 'm.castStyle', 'm.stacks', 'm.maxStacks', 'm.duration'];
/** below this many device pixels a layer uses its 64 px picture */
const SMALL_PX = 48;
/** how strongly the glow shows (the same number is in css/iconkit.css .ik-glow) */
const GLOW_ALPHA = 0.6;
/** the drawn placeholder glyphs were drawn for this frame opening */
const DRAWN_REF = { circle: 0.395, square: 0.39 };

const words = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cssUrl = u => `url('${String(u).replace(/['\\()\s]/g, c => '\\' + c)}')`;
const clamp01 = v => Math.max(0, Math.min(1, v));
const num = v => (v === null || v === undefined || v === '' ? NaN : Number(v));
const HEX = /^#[0-9a-f]{3,8}$/i;

/** "12", "2.5", "3m": seconds as a button shows them (whole seconds from 3 up, tenths below, minutes from 60). */
export function timeText(sec) {
  const s = num(sec);
  if (!Number.isFinite(s) || s <= 0) return '';
  if (s >= 3600) return `${Math.ceil(s / 3600)}h`;
  if (s >= 60) return `${Math.ceil(s / 60)}m`;
  if (s >= 3) return String(Math.ceil(s));
  return s.toFixed(1);
}

/**
 * Which kind of ability a game's spell row is (one of data/glyphs.json `mechanics`). Reads the fields Oathwild /
 * Farhold / Thousandvale rows share; a row may also say `mechanic` itself.
 */
export function mechanicOf(row = {}) {
  if (row.mechanic) return row.mechanic;
  if (row.revive || row.heal || row.healPower || row.onHit?.heal) return 'heal';
  if (row.barrier) return 'ward';
  if (row.summon || row.pet || row.shape === 'summon') return 'summon';
  if (row.form) return 'form';
  if (row.dash || row.shape === 'dash') return 'dash';
  switch (row.shape) {
    case 'leap': return 'leap';
    case 'beam': return 'beam';
    case 'bolt': return 'bolt';
    case 'around': return 'nova';
    case 'ground': return 'area';
    case 'melee': return 'strike';
    case 'self': return 'buff';
    default: break;
  }
  if (row.selfBuff || row.allies || row.school === 'song') return 'buff';
  return 'strike';
}

/** Build a kit from its three data files. `base` = the iconkit/ folder URL the layer paths are relative to. */
export function createKit({ themes, glyphs, layers }, { base = '' } = {}) {
  const glyphRows = glyphs.glyphs;
  const byId = new Map(glyphRows.map(g => [g.id, g]));
  const alias = id => { const k = String(id || '').toLowerCase(); return themes.aliases?.[k] || k; };
  const url = p => (p && base ? new URL(p, base).href : p);
  const isPaintedGlyph = g => !!g?.file && !g.file.endsWith('.svg');

  /** Plate tint + glow colour (+ fallback glyph, themed frame) for a class or an element id; unknown ids get the default theme. */
  function themeFor(id) {
    const k = alias(id), d = themes.defaults;
    const c = themes.classes[k], e = themes.elements[k];
    const t = c || e;
    if (!t) return { id: k || null, kind: 'default', name: 'Default', tint: d.tint, glow: d.glow, glyph: d.glyph, frame: layers.defaults.frame, strength: d.strength, glyphTint: null };
    return { id: k, kind: c ? 'class' : 'element', name: t.name, tint: t.tint, glow: t.glow, glyph: t.glyph || d.glyph, frame: t.frame || layers.defaults.frame, strength: t.strength ?? d.strength, glyphTint: t.glyphTint || null };
  }
  const elementOf = row => { const e = alias(row?.element); return themes.elements[e] ? e : 'physical'; };

  /** Every glyph scored against one spell row: tag words in its name, its element, its mechanic. */
  const elementWords = new Set(Object.values(themes.elements).flatMap(e => e.words || []));
  function scoreGlyphs(row, element, mechanic) {
    const w = words(`${row.name || ''} ${String(row.id || '').replace(/_/g, ' ')}`);
    const hit = tag => w.some(x => x === tag || (tag.length >= 4 && x.startsWith(tag)) || (x.length >= 4 && tag.startsWith(x) && tag.length - x.length <= 2));
    return glyphRows.map((g, i) => {
      const all = (g.tags || []).filter(hit);
      const tags = all.filter(t => !elementWords.has(t)), elTags = all.filter(t => elementWords.has(t));   // "Fire" alone only names the element
      const el = g.element === element ? 'match' : g.element ? 'other' : 'any';
      const score = Math.min(tags.length, 2) * 6 + Math.min(elTags.length, 1) * 2 + (el === 'match' ? 4 : el === 'any' ? 1 : -4) + (g.mechanic === mechanic ? 3 : 0) - i * 0.001;
      return { g, tags, elTags, el, mech: g.mechanic === mechanic, score };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * The kit icon for a game's spell. `classId` picks the plate tint (the class look) and the themed frame (when
   * `frame: 'class'`), the spell's element picks the glow and the glyph. `match` says how sure the pick is: named (a
   * tag word in the name) | exact (element + mechanic) | mechanic (a generic glyph for the kind of ability) | element
   * (the element's own glyph) | class (the class emblem). `fallback` = the review page flags it.
   * A generic glyph whose painting has its own colour (`artElement`) that is not the spell's element is drawn from its
   * tintable stand-in instead (glyphArt: 'drawn'), so a fire spell never gets a blue nova.
   */
  function iconFor(row = {}, classId = null, { shape, frame, frameColor } = {}) {
    const element = elementOf(row), mechanic = mechanicOf(row);
    const el = themeFor(element), cls = classId ? themeFor(classId) : null;
    const ranked = scoreGlyphs(row, element, mechanic);
    const named = ranked.find(c => c.tags.length && c.el !== 'other');
    const exact = ranked.find(c => c.el === 'match' && c.mech);
    const saysElement = ranked.find(c => c.elTags.length && c.el === 'match');
    const generic = ranked.find(c => c.el === 'any' && c.mech);
    let glyph, match, why;
    if (named) { glyph = named.g; match = 'named'; why = `name says "${named.tags[0]}"`; }
    else if (exact) { glyph = exact.g; match = 'exact'; why = `${element} ${mechanic}`; }
    else if (saysElement && byId.has(el.glyph)) { glyph = byId.get(el.glyph); match = 'element'; why = `name says ${element}; no ${element} ${mechanic} glyph yet`; }
    else if (generic) { glyph = generic.g; match = 'mechanic'; why = `generic ${mechanic} for ${element}`; }
    else if (byId.has(el.glyph) && themes.elements[element]) { glyph = byId.get(el.glyph); match = 'element'; why = `no ${element} ${mechanic} glyph yet`; }
    else { glyph = byId.get(cls?.glyph) || byId.get(themes.defaults.glyph); match = 'class'; why = 'nothing closer'; }
    const wrongColour = isPaintedGlyph(glyph) && glyph.artElement && glyph.artElement !== element && glyph.tintable;
    const look = cls && cls.kind === 'class' ? cls : el;
    const spec = normalize({
      shape: shape || layers.defaults.shape, frame: frame || layers.defaults.frame, frameColor, cls: cls?.kind === 'class' ? cls.id : null,
      glyph: glyph.id, glyphArt: wrongColour ? 'drawn' : 'best',
      tint: look.tint, strength: look.strength,
      glow: layers.elementGlow?.[element] || layers.defaults.glow, glowColor: el.glow,
      glyphTint: glyph.tintable ? (el.glyphTint || el.glow) : null,
    });
    if (wrongColour) why += ` (its painting is ${glyph.artElement}: drawn version tinted)`;
    return { spec, glyph: glyph.id, element, mechanic, match, fallback: match === 'mechanic' || match === 'element' || match === 'class', why };
  }

  /** Resolve frame 'class' and the line-frame colour. */
  function resolveFrame(spec) {
    const d = layers.defaults.frame;
    let id = spec.frame;
    if (id === 'class') id = themes.classes[alias(spec.cls)]?.frame || d;
    if (!layers.frames[id]) id = d;
    const style = layers.frames[id].style || 'painted';
    let color = null;
    if (style === 'line' && spec.frameColor) color = spec.frameColor === 'class' ? themeFor(spec.cls).glow : (HEX.test(spec.frameColor) ? spec.frameColor : null);
    return { id, style, color };
  }

  /** A full spec: every field present, unknown ids replaced by the defaults. */
  function normalize(spec = {}) {
    const d = layers.defaults, td = themes.defaults;
    const shape = SHAPES.includes(spec.shape) ? spec.shape : d.shape;
    const glow = spec.glow === null || spec.glow === 'none' || spec.glow === false ? null : (layers.glows[spec.glow] ? spec.glow : d.glow);
    const g = byId.get(spec.glyph) || byId.get(td.glyph);
    const fr = resolveFrame(spec);
    const legacyCd = spec.state === 'cooldown';
    const m = spec.mode || {};
    const cd = num(m.cooldown ?? (legacyCd ? (spec.cd ?? 0.6) : 0));
    const cast = num(m.cast);
    const stacks = Math.max(0, Math.floor(num(m.stacks) || 0)), maxStacks = Math.max(0, Math.floor(num(m.maxStacks) || 0));
    const dur = m.duration;
    return {
      shape,
      frame: fr.id, frameColor: fr.color,
      cls: spec.cls ? alias(spec.cls) : null,
      plate: layers.plates[spec.plate] ? spec.plate : d.plate,
      tint: spec.tint || td.tint,
      strength: Number.isFinite(spec.strength) ? clamp01(spec.strength) : td.strength,
      glow,
      glowColor: glow ? (spec.glowColor || td.glow) : null,
      glyph: g.id,
      glyphTint: g.tintable ? (spec.glyphTint || '#e8e8e8') : null,
      glyphArt: spec.glyphArt === 'drawn' ? 'drawn' : 'best',
      size: Math.max(8, Math.round(Number(spec.size) || 40)),
      state: STATES.includes(spec.state) ? spec.state : 'ready',
      passiveStyle: PASSIVE_STYLES.includes(spec.passiveStyle) ? spec.passiveStyle : 'dim',
      dispel: DISPELS.includes(spec.dispel) ? spec.dispel : null,
      mode: {
        cooldown: Number.isFinite(cd) ? clamp01(cd) : 0,
        seconds: Number.isFinite(num(m.seconds)) && num(m.seconds) > 0 ? +num(m.seconds).toFixed(2) : null,
        cast: Number.isFinite(cast) ? clamp01(cast) : null,
        castStyle: CAST_STYLES.includes(m.castStyle) ? m.castStyle : 'bottom',
        stacks, maxStacks: Math.max(maxStacks, 0),
        duration: dur == null || dur === '' ? null : Number.isFinite(num(dur)) ? timeText(dur) || null : String(dur).slice(0, 8),
      },
      art: spec.art === 'placeholder' ? 'placeholder' : 'best',
    };
  }

  /** Stable cache key: the same icon always gives the same string, whatever order the spec was written in. */
  function specKey(spec) {
    const s = normalize(spec);
    return KEY_FIELDS.map(k => {
      const v = k.startsWith('m.') ? s.mode[k.slice(2)] : s[k];
      return v == null ? '' : typeof v === 'number' ? +v.toFixed(3) : v;
    }).join('|');
  }

  /** The picture file for one layer entry: the painted art (small or big by pixel size) or the placeholder. */
  function pick(entry, px, painted) {
    if (!entry) return null;
    if (painted && entry.file) return url(px <= SMALL_PX && entry.small ? entry.small : entry.file);
    return url(entry.placeholder || entry.file);
  }
  /**
   * Everything the renderers need for a spec at `px` device pixels: layer URLs, the frame opening, the plate and
   * glyph scales, and which layers are tinted.
   */
  function layerSources(spec, px) {
    const s = normalize(spec);
    const p = px || s.size, useArt = s.art !== 'placeholder';
    const fr = layers.frames[s.frame], fe = fr[s.shape], style = fr.style || 'painted';
    // the frame: painted art, the drawn line in any colour, or nothing
    let frame = null, frameTint = null, paintedFrame = false;
    if (style === 'line') {
      paintedFrame = useArt && !!fe.file && !s.frameColor;
      frame = pick(fe, p, paintedFrame);
      if (!paintedFrame) frameTint = s.frameColor || layers.frameColor?.default || '#e2b85a';
    } else if (style !== 'none') {
      paintedFrame = useArt && !!fe.file;
      frame = pick(fe, p, paintedFrame);
    }
    const inner = paintedFrame ? fe.inner : (fe.placeholderInner ?? fe.inner);
    // the plate grows (or shrinks) to tuck just under the opening
    const pe = layers.plates[s.plate][s.shape];
    const paintedPlate = useArt && !!pe.file;
    const plateR = paintedPlate ? pe.radius : (pe.placeholderRadius || 0.41);
    const plateScale = +(Math.min(0.5, inner + (style === 'none' ? 0.01 : 0.015)) / plateR).toFixed(4);
    // the glyph: painted art scaled by its measured fit, or the drawn stand-in; both grow with the opening
    const g = byId.get(s.glyph);
    const drawnGlyph = !useArt || s.glyphArt === 'drawn' || !isPaintedGlyph(g);
    const ref = layers.glyphRef?.[s.shape] || 0.34;
    const glyphScale = +(drawnGlyph ? Math.min(1.12, inner / DRAWN_REF[s.shape]) : Math.min(0.9, (g.fit?.[s.shape] ?? 0.55) * inner / ref)).toFixed(4);
    return {
      plate: pick(pe, p, paintedPlate), plateScale,
      glow: s.glow && s.state !== 'passive' ? pick(layers.glows[s.glow], p, useArt) : null,
      glyph: drawnGlyph ? url(g.placeholder || g.file) : pick(g, p, true), glyphScale,
      glyphTint: drawnGlyph && g.tintable ? s.glyphTint : null,
      frame, frameTint, frameStyle: style, inner,
    };
  }

  /**
   * Stacked HTML layers. Needs css/iconkit.css. Tinting is CSS (a colour layer masked by the picture, blended);
   * channeling animates with CSS only. `only`: draw just these layers (the Builder's layer-by-layer view).
   * `duration` text sits UNDER the box (absolutely placed): leave ~1.2em below the icon when you use it.
   */
  function iconHtml(spec, { label = '', cls = '', dpr = 2, only = null } = {}) {
    const s = normalize(spec), m = s.mode;
    const has = k => !only || only.includes(k);
    const src = layerSources(s, s.size * dpr);
    const vars = [`--ik-size:${s.size}px`, `--ik-tint:${s.tint}`, `--ik-strength:${s.strength}`, `--ik-plate:${cssUrl(src.plate)}`,
      `--ik-ps:${src.plateScale}`, `--ik-gs:${src.glyphScale}`, `--ik-in:${src.inner}`];
    if (src.glow) vars.push(`--ik-glow:${s.glowColor}`, `--ik-glow-src:${cssUrl(src.glow)}`);
    if (src.glyphTint) vars.push(`--ik-glyph-tint:${src.glyphTint}`, `--ik-glyph-src:${cssUrl(src.glyph)}`);
    if (src.frame) vars.push(`--ik-frame-src:${cssUrl(src.frame)}`);
    if (src.frameTint) vars.push(`--ik-frame-tint:${src.frameTint}`);
    if (m.cooldown > 0) vars.push(`--ik-cd:${Math.round(m.cooldown * 360)}deg`);
    if (m.cast != null) vars.push(`--ik-cast:${m.cast}`);
    if (s.dispel) vars.push(`--ik-dispel:${themes.dispel?.[s.dispel] || '#4aa8ff'}`);
    const full = m.maxStacks > 0 && m.stacks >= m.maxStacks;
    const classes = ['ik', `ik-${s.shape}`, `is-${s.state}`, `ik-f-${src.frameStyle}`];
    if (s.state === 'passive') classes.push(`ik-passive-${s.passiveStyle}`);
    if (cls) classes.push(esc(cls));
    const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
    const fx = [
      m.cooldown > 0 ? '<i class="ik-cd"></i>' : '',
      s.state === 'nomana' || s.state === 'norange' ? '<i class="ik-wash"></i>' : '',
      m.cast != null && m.castStyle === 'face' ? '<i class="ik-castf"></i>' : '',
      m.cast != null && m.castStyle === 'bottom' ? '<i class="ik-castb"><i></i></i>' : '',
      s.state === 'active' || s.state === 'channeling' ? '<i class="ik-inner"></i>' : '',
      s.state === 'passive' && s.passiveStyle === 'socket' ? '<i class="ik-socket"></i>' : '',
      s.dispel ? '<i class="ik-disp"></i>' : '',
    ].join('');
    return `<span class="${classes.join(' ')}" style="${esc(vars.join(';'))}" ${a11y}>`   // lint-ok: per-icon colours and picture URLs are data, set as CSS variables
      + (has('plate') ? `<span class="ik-plate"><img src="${esc(src.plate)}" alt="" draggable="false"><i class="ik-tint"></i></span>` : '')
      // glow + glyph sit in one box cut to the plate's shape, so nothing pokes out under the frame
      + '<span class="ik-clip">'
      + (src.glow && has('glow') ? '<i class="ik-glow"></i>' : '')
      + (has('glyph') ? `<span class="ik-glyph"><img src="${esc(src.glyph)}" alt="" draggable="false">${src.glyphTint ? '<i class="ik-tint"></i>' : ''}</span>` : '')
      + '</span>'
      + (fx && !only ? `<span class="ik-fx">${fx}</span>` : '')
      + (src.frame && has('frame') ? `<span class="ik-frame"><img src="${esc(src.frame)}" alt="" draggable="false">${src.frameTint ? '<i class="ik-tint"></i>' : ''}</span>` : '')
      + (s.state === 'channeling' && !only ? '<i class="ik-sweep"></i>' : '')
      + (m.seconds && !only ? `<b class="ik-sec">${esc(timeText(m.seconds))}</b>` : '')
      + (m.stacks > 0 && !only ? `<b class="ik-stk${full ? ' is-full' : ''}">${m.stacks}</b>` : '')
      + (m.duration && !only ? `<b class="ik-dur">${esc(m.duration)}</b>` : '')
      + '</span>';
  }

  // ---- canvas (browser only) -----------------------------------------------------------------------------------
  const images = new Map(), canvases = new Map(), dataUrls = new Map();
  function image(src) {
    if (!images.has(src)) images.set(src, new Promise((ok, bad) => { const im = new Image(); im.decoding = 'async'; im.onload = () => ok(im); im.onerror = () => bad(new Error(`iconkit: could not load ${src}`)); im.src = src; }));
    return images.get(src);
  }
  const blank = n => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };
  /** `img` (drawn at scale k about the centre) recoloured: fill `color` with blend `mode` at `alpha`, keep only its shape. */
  function tinted(img, n, color, mode, alpha = 1, k = 1) {
    const c = blank(n), x = c.getContext('2d'), w = n * k, o = (n - w) / 2;
    x.drawImage(img, o, o, w, w);
    x.globalCompositeOperation = mode; x.globalAlpha = alpha; x.fillStyle = color; x.fillRect(0, 0, n, n);
    x.globalAlpha = 1;
    if (mode !== 'source-in') { x.globalCompositeOperation = 'destination-in'; x.drawImage(img, o, o, w, w); }   // source-in already kept the shape
    return c;
  }
  /** the opening's outline as a path (circle, or a softly rounded square) shrunk by `d` px */
  function openingPath(x, s, n, inner, d = 0) {
    const r = inner * n - d, c = n / 2;
    x.beginPath();
    if (s.shape === 'circle') x.arc(c, c, Math.max(1, r), 0, Math.PI * 2);
    else x.roundRect(c - r, c - r, 2 * r, 2 * r, Math.max(0, n * 0.06 - d));
  }
  function badge(x, n, text, full) {
    const h = Math.round(n * 0.36), w = Math.max(h, Math.round(h * 0.62 * String(text).length + h * 0.4)), X = n - w - n * 0.01, Y = n - h - n * 0.01;
    x.beginPath(); x.roundRect(X, Y, w, h, h / 2);
    x.fillStyle = full ? '#f2c75a' : '#16130c'; x.fill();
    x.lineWidth = Math.max(1, n / 40); x.strokeStyle = full ? '#fff2c0' : '#c9a24a'; x.stroke();
    x.fillStyle = full ? '#1a1206' : '#fff'; x.font = `700 ${Math.round(h * 0.72)}px system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(text), X + w / 2, Y + h / 2 + 1);
  }
  async function compose(s, n) {
    const src = layerSources(s, n), m = s.mode;
    const [plate, glow, glyph, frame] = await Promise.all([image(src.plate), src.glow ? image(src.glow) : null, image(src.glyph), src.frame ? image(src.frame) : null]);
    const c = blank(n), x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    const pw = n * src.plateScale, po = (n - pw) / 2;
    const plateMask = blank(n); plateMask.getContext('2d').drawImage(plate, po, po, pw, pw);
    x.drawImage(tinted(plate, n, s.tint, 'color', s.strength, src.plateScale), 0, 0);
    // glow + glyph drawn into one layer, cut to the plate (same as the HTML .ik-clip)
    const mid = blank(n), mc = mid.getContext('2d');
    mc.imageSmoothingQuality = 'high';
    if (glow) { mc.globalAlpha = GLOW_ALPHA; mc.drawImage(tinted(glow, n, s.glowColor, 'source-in'), 0, 0); mc.globalAlpha = 1; }
    const gn = n * src.glyphScale, go = (n - gn) / 2;
    mc.drawImage(src.glyphTint ? tinted(glyph, n, src.glyphTint, 'multiply') : glyph, go, go, gn, gn);
    mc.globalCompositeOperation = 'destination-in'; mc.drawImage(plateMask, 0, 0);
    x.drawImage(mid, 0, 0);
    // state effects inside the opening (the HTML .ik-fx)
    const fx = blank(n), f = fx.getContext('2d'), C = n / 2;
    if (m.cooldown > 0) { f.fillStyle = 'rgba(6,8,14,.68)'; f.beginPath(); f.moveTo(C, C); f.arc(C, C, n, -Math.PI / 2, -Math.PI / 2 + m.cooldown * Math.PI * 2); f.closePath(); f.fill(); }
    if (s.state === 'nomana') { f.fillStyle = 'rgba(30,60,210,.46)'; f.fillRect(0, 0, n, n); }
    if (s.state === 'norange') { f.fillStyle = 'rgba(210,30,30,.42)'; f.fillRect(0, 0, n, n); }
    const left = C - src.inner * n, wide = 2 * src.inner * n;
    if (m.cast != null && m.castStyle === 'face') {
      const g = f.createLinearGradient(left, 0, left + wide, 0); g.addColorStop(0, 'rgba(255,220,140,.12)'); g.addColorStop(1, 'rgba(255,236,170,.5)');
      f.fillStyle = g; f.fillRect(left, 0, wide * m.cast, n);
      f.fillStyle = 'rgba(255,248,220,.95)'; f.fillRect(left + wide * m.cast - Math.max(1, n / 48), 0, Math.max(1, n / 32), n);
    }
    if (m.cast != null && m.castStyle === 'bottom') {
      const h = n * 0.17, y = C + src.inner * n - h;
      f.fillStyle = 'rgba(0,0,0,.72)'; f.fillRect(0, y, n, h);
      const g = f.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#ffe9a6'); g.addColorStop(1, '#d08a1e');
      f.fillStyle = g; f.fillRect(left, y + h * 0.18, wide * m.cast, h * 0.82);
    }
    const ring = (color, width, blur) => { f.save(); openingPath(f, s, n, src.inner, width / 2); f.lineWidth = width; f.strokeStyle = color; f.shadowColor = color; f.shadowBlur = blur; f.stroke(); f.restore(); };
    if (s.state === 'active' || s.state === 'channeling') { ring('rgba(255,236,170,.55)', n * 0.16, n * 0.12); ring('#ffd76a', Math.max(1.5, n * 0.035), 0); }
    if (s.state === 'passive' && s.passiveStyle === 'socket') ring('rgba(0,0,0,.6)', n * 0.14, n * 0.1);
    if (s.dispel) ring(themes.dispel?.[s.dispel] || '#4aa8ff', Math.max(2, n * 0.06), n * 0.05);
    f.globalCompositeOperation = 'destination-in'; f.drawImage(plateMask, 0, 0);
    x.drawImage(fx, 0, 0);
    if (frame) {
      x.drawImage(src.frameTint ? tinted(frame, n, src.frameTint, 'multiply') : frame, 0, 0, n, n);
      if (s.state === 'selected' || s.state === 'active') { x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.35; x.drawImage(frame, 0, 0, n, n); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; }
    }
    const grey = (sat, mul) => {
      const keep = blank(n); keep.getContext('2d').drawImage(c, 0, 0);
      x.globalCompositeOperation = 'saturation'; x.globalAlpha = sat; x.fillStyle = '#808080'; x.fillRect(0, 0, n, n); x.globalAlpha = 1;
      x.globalCompositeOperation = 'multiply'; x.fillStyle = mul; x.fillRect(0, 0, n, n);
      x.globalCompositeOperation = 'destination-in'; x.drawImage(keep, 0, 0);
      x.globalCompositeOperation = 'source-over';
    };
    if (s.state === 'disabled') grey(1, '#9a9a9a');
    if (s.state === 'passive' && s.passiveStyle === 'dim') grey(0.55, '#c4c4c4');
    if (m.seconds) {
      x.font = `800 ${Math.round(n * 0.36)}px system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = Math.max(2, n / 14); x.strokeStyle = 'rgba(0,0,0,.85)'; x.lineJoin = 'round';
      x.strokeText(timeText(m.seconds), C, C + 1); x.fillStyle = '#fff'; x.fillText(timeText(m.seconds), C, C + 1);
    }
    if (m.stacks > 0) badge(x, n, m.stacks, m.maxStacks > 0 && m.stacks >= m.maxStacks);
    return c;
  }
  /** One composed canvas (size × scale device pixels), cached by spec key — draw it into an action bar.
   *  Channeling draws like active (no animation) and duration text is left out: use iconHtml for those. */
  function iconCanvas(spec, { scale = 1 } = {}) {
    const s = normalize(spec), n = Math.round(s.size * scale), k = `${specKey(s)}@${n}`;
    if (!canvases.has(k)) canvases.set(k, compose(s, n));
    return canvases.get(k);
  }
  /** The composed icon as a PNG data URL (one <img> per button), cached by spec key. */
  function iconDataUrl(spec, opts = {}) {
    const s = normalize(spec), k = `${specKey(s)}@${opts.scale || 1}`;
    if (!dataUrls.has(k)) dataUrls.set(k, iconCanvas(s, opts).then(cv => cv.toDataURL('image/png')));
    return dataUrls.get(k);
  }

  /** Which element × mechanic pairs have a glyph made for them, only a generic one, or nothing. */
  function glyphMatrix() {
    const cells = {};
    for (const e of glyphs.elements) {
      cells[e] = {};
      for (const m of Object.keys(glyphs.mechanics)) {
        const painted = glyphRows.filter(g => g.element === e && g.mechanic === m).map(g => g.id);
        const tinted = glyphRows.filter(g => !g.element && g.mechanic === m).map(g => g.id);
        cells[e][m] = { painted, tinted, status: painted.length ? 'painted' : tinted.length ? 'tinted' : 'missing' };
      }
    }
    return { elements: [...glyphs.elements], mechanics: { ...glyphs.mechanics }, cells };
  }

  return {
    data: { themes, glyphs, layers }, glyphs: glyphRows, glyph: id => byId.get(id) || null,
    themeFor, iconFor, mechanicOf, normalize, specKey, layerSources, iconHtml, iconCanvas, iconDataUrl, glyphMatrix, url, timeText,
    classes: () => Object.keys(themes.classes), elements: () => [...glyphs.elements],
    frames: () => Object.entries(layers.frames).map(([id, f]) => ({ id, name: f.name, style: f.style || 'painted', cls: f.class || null })),
    isPainted: id => isPaintedGlyph(byId.get(id)),
  };
}

/** Read the three data files and build a kit. In a browser it fetches them next to this module. */
export async function loadKit({ base = new URL('../', import.meta.url), readJson = u => fetch(u).then(r => { if (!r.ok) throw new Error(`iconkit: ${u} ${r.status}`); return r.json(); }) } = {}) {
  const [themes, glyphs, layers] = await Promise.all(['themes', 'glyphs', 'layers'].map(n => readJson(new URL(`data/${n}.json`, base))));
  return createKit({ themes, glyphs, layers }, { base: String(base) });
}
