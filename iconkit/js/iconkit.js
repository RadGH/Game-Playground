// Icon Kit — layered spell / ability icons any game can use.
//
// An icon is pictures on the SAME square canvas with the SAME centre, stacked bottom to top:
//   plate (grey stone, tinted by the CLASS) -> glow + glyph (cut to the plate) -> state effects -> frame -> text badges
// Nothing is ever offset: every layer fills the icon's box. The plate is scaled to tuck just under whichever frame is
// on (a hairline frame has a much wider opening than the studded gold one), and the glyph grows with the opening.
//
//   const kit = await loadKit();                         // reads data/themes.json, glyphs.json, layers.json, items.json
//   kit.themeFor('mage') / kit.themeFor('fire')          { id, kind, name, tint, glow, glyph, frame, strength, glyphTint }
//   kit.iconFor(spellRow, classId, { shape, frame })     { spec, glyph, match, fallback, why }
//   kit.iconHtml(spec, { label })                        stacked <span> layers (css/iconkit.css; animates with CSS)
//   await kit.iconCanvas(spec, { scale })                one composed <canvas>, cached by spec key
//   await kit.iconDataUrl(spec, { scale })               the same as a PNG data URL (an action bar's <img>)
//   kit.specKey(spec)                                    stable string; same spec -> same key
//   kit.itemIconFor(item, { equipped, broken, cannotWear, isNew })   { spec, glyph, match, fallback, why } (round 3)
//
// A spec:
//   { shape: 'circle'|'square', glyph, plate, tint, strength, glow (id|null), glowColor, glyphTint,
//     frame: 'gold'|'thin'|'hairline'|'none'|'class'|<a frame id>, frameColor (line frames: '#hex'|'class'), cls,
//     size, state: 'ready'|'disabled'|'selected'|'passive'|'active'|'channeling'|'nomana'|'norange',
//     dispel: null|'magic'|'curse'|'poison'|'disease'|'enrage',
//     mode: { cooldown: 0..1, seconds, cast: 0..1|null, castStyle: 'bottom'|'face', stacks, maxStacks, duration },
//     art: 'best'|'placeholder', glyphArt: 'best'|'drawn',
//     kind: 'spell'|'item', rarity (item frame tint), gem (quality key), itemState: null|'equipped'|'broken'|'cannotwear'|'new', count }
// A passive (round 3, owner 2026-11-27) has NO frame and a plate that fades out softly toward its edge, with a slightly
// smaller glyph: it reads like a buff, not a button. An item (kind 'item') has the silver item frame tinted by rarity
// (square; round for jewellery), a dark neutral plate, its item glyph, an optional quality gem and a stack count.
// The old { state: 'cooldown', cd } still works (it becomes mode.cooldown).
// Everything except iconHtml / iconCanvas / iconDataUrl is pure and runs under Node (tests/iconkit.test.js).

export const SHAPES = Object.freeze(['circle', 'square']);
export const STATES = Object.freeze(['ready', 'disabled', 'selected', 'passive', 'active', 'channeling', 'nomana', 'norange']);
/** round 3: one passive look (the buff look); the old 'dim' / 'socket' values are read as it */
export const PASSIVE_STYLES = Object.freeze(['buff']);
export const ITEM_STATES = Object.freeze(['equipped', 'broken', 'cannotwear', 'new']);
export const DISPELS = Object.freeze(['magic', 'curse', 'poison', 'disease', 'enrage']);
export const CAST_STYLES = Object.freeze(['bottom', 'face']);
export const SIZES = Object.freeze([24, 40, 64, 128]);
/** the field order of a spec key — append only, never reorder (caches depend on it) */
const KEY_FIELDS = ['shape', 'frame', 'plate', 'tint', 'strength', 'glow', 'glowColor', 'glyph', 'glyphTint', 'size', 'state', 'art',
  'frameColor', 'glyphArt', 'passiveStyle', 'dispel', 'm.cooldown', 'm.seconds', 'm.cast', 'm.castStyle', 'm.stacks', 'm.maxStacks', 'm.duration',
  'kind', 'rarity', 'gem', 'itemState', 'count'];
/** below this many device pixels a layer uses its 64 px picture */
const SMALL_PX = 48;
/** how strongly the glow shows (the same number is in css/iconkit.css .ik-glow) */
const GLOW_ALPHA = 0.6;
/** the drawn placeholder glyphs were drawn for this frame opening */
const DRAWN_REF = { circle: 0.395, square: 0.39 };
/** the drawn item stand-ins span ~14..86 of the canvas: this keeps them at ~3/4 of the item frame's opening */
const ITEM_DRAWN_REF = 0.47;
/** a passive's glyph is this much smaller than a button's, and its plate fades out (no frame) */
const PASSIVE_GLYPH = 0.86;

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
export function createKit({ themes, glyphs, layers, items = null }, { base = '' } = {}) {
  const glyphRows = glyphs.glyphs;
  const itemRows = items?.items || [];
  // spell glyphs and item glyphs share one id space (a spec's `glyph` may name either)
  const byId = new Map([...glyphRows, ...itemRows].map(g => [g.id, g]));
  // glyphs painted for ONE spell (`spells: [name]`, round 3) are picked by that name only, never for a look-alike
  const generalRows = glyphRows.filter(g => !g.spells?.length);
  const bySpell = new Map();
  for (const g of glyphRows) for (const n of g.spells || []) bySpell.set(String(n).toLowerCase(), g);
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
    return generalRows.map((g, i) => {
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
    const own = bySpell.get(String(row.name || '').toLowerCase()) || bySpell.get(String(row.id || '').toLowerCase());
    const ranked = own ? [] : scoreGlyphs(row, element, mechanic);
    const named = own ? { g: own, tags: ['its own painting'] } : ranked.find(c => c.tags.length && c.el !== 'other');
    const exact = ranked.find(c => c.el === 'match' && c.mech);
    const saysElement = ranked.find(c => c.elTags.length && c.el === 'match');
    const generic = ranked.find(c => c.el === 'any' && c.mech);
    let glyph, match, why;
    if (named) { glyph = named.g; match = 'named'; why = own ? 'painted for this spell' : `name says "${named.tags[0]}"`; }
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
    let id = spec.kind === 'item' ? 'item' : spec.frame;
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
    const item = spec.kind === 'item';
    const shape = SHAPES.includes(spec.shape) ? spec.shape : item ? 'square' : d.shape;
    const glow = spec.glow === null || spec.glow === 'none' || spec.glow === false || (item && spec.glow === undefined) ? null : (layers.glows[spec.glow] ? spec.glow : d.glow);
    const g = byId.get(spec.glyph) || byId.get(item ? items?.fallbacks?.default : td.glyph) || byId.get(td.glyph);
    const rar = item ? (themes.rarity?.[spec.rarity] ? spec.rarity : 'normal') : null;
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
      plate: layers.plates[spec.plate] ? spec.plate : item && layers.plates.item ? 'item' : d.plate,
      tint: spec.tint || td.tint,
      strength: Number.isFinite(spec.strength) ? clamp01(spec.strength) : item ? 0 : td.strength,
      glow,
      glowColor: glow ? (spec.glowColor || td.glow) : null,
      glyph: g.id,
      glyphTint: g.tintable ? (spec.glyphTint || '#e8e8e8') : null,
      glyphArt: spec.glyphArt === 'drawn' ? 'drawn' : 'best',
      size: Math.max(8, Math.round(Number(spec.size) || 40)),
      state: STATES.includes(spec.state) ? spec.state : 'ready',
      passiveStyle: 'buff',
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
      kind: item ? 'item' : 'spell',
      rarity: rar,
      gem: item && themes.quality?.[spec.gem] ? spec.gem : null,
      itemState: item && ITEM_STATES.includes(spec.itemState) ? spec.itemState : null,
      count: item ? Math.max(0, Math.floor(num(spec.count) || 0)) : 0,
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
    const passive = s.state === 'passive', item = s.kind === 'item';
    // a passive has no frame at all: it takes the frameless opening, and its plate fades out (the buff look)
    const fr = layers.frames[passive ? 'none' : s.frame] || layers.frames.none, fe = fr[s.shape], style = fr.style || 'painted';
    // the frame: painted art, the drawn line in any colour, or nothing
    let frame = null, frameTint = null, paintedFrame = false;
    if (item && style !== 'none') {   // the silver item frame, multiplied by the rarity colour (painted or drawn)
      paintedFrame = useArt && !!fe.file;
      frame = pick(fe, p, paintedFrame);
      frameTint = themes.rarity?.[s.rarity] || '#d8d4cc';
    } else if (style === 'line') {
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
    const isItemGlyph = g.id.startsWith('item-');
    let glyphScale = drawnGlyph ? Math.min(1.12, inner / (isItemGlyph ? ITEM_DRAWN_REF : DRAWN_REF[s.shape])) : Math.min(isItemGlyph ? 1 : 0.9, (g.fit?.[s.shape] ?? 0.55) * inner / ref);
    if (passive) glyphScale *= PASSIVE_GLYPH;
    return {
      plate: pick(pe, p, paintedPlate), plateScale,
      glow: s.glow && !passive ? pick(layers.glows[s.glow], p, useArt) : null,
      glyph: drawnGlyph ? url(g.placeholder || g.file) : pick(g, p, true), glyphScale: +glyphScale.toFixed(4),
      glyphTint: drawnGlyph && g.tintable ? s.glyphTint : null,
      frame, frameTint, frameStyle: item ? 'item' : style, inner, fade: passive,
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
    if (s.gem) vars.push(`--ik-gem:${themes.quality[s.gem]}`);
    const full = m.maxStacks > 0 && m.stacks >= m.maxStacks;
    const classes = ['ik', `ik-${s.shape}`, `is-${s.state}`, `ik-f-${src.frameStyle}`];
    if (s.kind === 'item') classes.push('ik-item', `ik-r-${s.rarity}`);
    if (s.itemState) classes.push(`is-${s.itemState}`);
    if (cls) classes.push(esc(cls));
    const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
    const fx = [
      m.cooldown > 0 ? '<i class="ik-cd"></i>' : '',
      s.state === 'nomana' || s.state === 'norange' ? '<i class="ik-wash"></i>' : '',
      m.cast != null && m.castStyle === 'face' ? '<i class="ik-castf"></i>' : '',
      m.cast != null && m.castStyle === 'bottom' ? '<i class="ik-castb"><i></i></i>' : '',
      s.state === 'active' || s.state === 'channeling' ? '<i class="ik-inner"></i>' : '',
      s.dispel ? '<i class="ik-disp"></i>' : '',
      s.itemState === 'broken' || s.itemState === 'cannotwear' ? '<i class="ik-wash"></i>' : '',
      s.itemState === 'cannotwear' ? '<i class="ik-nowear"></i>' : '',
      s.itemState === 'new' ? '<i class="ik-glint"></i>' : '',
    ].join('');
    // a passive's plate, glyph and effects sit in one box that fades out toward the edge (CSS mask; no frame)
    const fadeOpen = src.fade ? '<span class="ik-fade">' : '', fadeClose = src.fade ? '</span>' : '';
    return `<span class="${classes.join(' ')}" style="${esc(vars.join(';'))}" ${a11y}>`   // lint-ok: per-icon colours and picture URLs are data, set as CSS variables
      + fadeOpen
      + (has('plate') ? `<span class="ik-plate"><img src="${esc(src.plate)}" alt="" draggable="false"><i class="ik-tint"></i></span>` : '')
      // glow + glyph sit in one box cut to the plate's shape, so nothing pokes out under the frame
      + '<span class="ik-clip">'
      + (src.glow && has('glow') ? '<i class="ik-glow"></i>' : '')
      + (has('glyph') ? `<span class="ik-glyph"><img src="${esc(src.glyph)}" alt="" draggable="false">${src.glyphTint ? '<i class="ik-tint"></i>' : ''}</span>` : '')
      + '</span>'
      + (fx && !only ? `<span class="ik-fx">${fx}</span>` : '')
      + fadeClose
      + (src.frame && has('frame') ? `<span class="ik-frame"><img src="${esc(src.frame)}" alt="" draggable="false">${src.frameTint ? '<i class="ik-tint"></i>' : ''}</span>` : '')
      + (s.state === 'channeling' && !only ? '<i class="ik-sweep"></i>' : '')
      + (m.seconds && !only ? `<b class="ik-sec">${esc(timeText(m.seconds))}</b>` : '')
      + (m.stacks > 0 && !only ? `<b class="ik-stk${full ? ' is-full' : ''}">${m.stacks}</b>` : '')
      + (m.duration && !only ? `<b class="ik-dur">${esc(m.duration)}</b>` : '')
      + (s.gem && !only ? '<b class="ik-gem"></b>' : '')
      + (s.itemState === 'equipped' && !only ? '<b class="ik-tick"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.3 5.4l1.9 1.9L7.8 3.2"/></svg></b>' : '')
      + (s.itemState === 'new' && !only ? '<b class="ik-new"></b>' : '')
      + (s.count > 1 && !only ? `<b class="ik-cnt">${s.count > 999 ? '999+' : s.count}</b>` : '')
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
    if (s.dispel) ring(themes.dispel?.[s.dispel] || '#4aa8ff', Math.max(2, n * 0.06), n * 0.05);
    if (s.itemState === 'broken' || s.itemState === 'cannotwear') { f.fillStyle = s.itemState === 'broken' ? 'rgba(200,24,24,.42)' : 'rgba(190,24,24,.16)'; f.fillRect(0, 0, n, n); }
    if (s.itemState === 'cannotwear') {
      // a small red "no" badge in the corner (the picture stays readable)
      const r = n * 0.15, x = n * 0.81, y = n * 0.81;
      f.fillStyle = '#6b0f0b'; f.beginPath(); f.arc(x, y, r, 0, Math.PI * 2); f.fill();
      f.fillStyle = '#d8352c'; f.beginPath(); f.arc(x, y, r * 0.84, 0, Math.PI * 2); f.fill();
      f.fillStyle = '#fff3ec'; f.fillRect(x - r * 0.56, y - r * 0.12, r * 1.12, r * 0.24);
    }
    if (s.itemState === 'new') {   // the glint, still: one diagonal streak of light
      const g = f.createLinearGradient(0, 0, n, n); g.addColorStop(0.3, 'rgba(255,255,240,0)'); g.addColorStop(0.45, 'rgba(255,255,240,.55)'); g.addColorStop(0.6, 'rgba(255,255,240,0)');
      f.fillStyle = g; f.fillRect(0, 0, n, n);
    }
    f.globalCompositeOperation = 'destination-in'; f.drawImage(plateMask, 0, 0);
    x.drawImage(fx, 0, 0);
    if (src.fade) {   // passive: plate, glyph and effects fade out toward the edge (no frame)
      const k = blank(n), kc = k.getContext('2d');
      if (s.shape === 'circle') {
        const g = kc.createRadialGradient(C, C, 0, C, C, C);
        g.addColorStop(0.5, 'rgba(0,0,0,1)'); g.addColorStop(0.72, 'rgba(0,0,0,.6)'); g.addColorStop(0.96, 'rgba(0,0,0,0)');
        kc.fillStyle = g; kc.fillRect(0, 0, n, n);
      } else {
        const lin = (x1, y1, x2, y2) => { const g = kc.createLinearGradient(x1, y1, x2, y2); g.addColorStop(0.02, 'rgba(0,0,0,0)'); g.addColorStop(0.24, '#000'); g.addColorStop(0.76, '#000'); g.addColorStop(0.98, 'rgba(0,0,0,0)'); return g; };
        kc.fillStyle = lin(0, 0, n, 0); kc.fillRect(0, 0, n, n);
        kc.globalCompositeOperation = 'destination-in'; kc.fillStyle = lin(0, 0, 0, n); kc.fillRect(0, 0, n, n);
      }
      x.globalCompositeOperation = 'destination-in'; x.drawImage(k, 0, 0); x.globalCompositeOperation = 'source-over';
    }
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
    if (s.itemState === 'broken') grey(0.7, '#b0b0b0');
    if (m.seconds) {
      x.font = `800 ${Math.round(n * 0.36)}px system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = Math.max(2, n / 14); x.strokeStyle = 'rgba(0,0,0,.85)'; x.lineJoin = 'round';
      x.strokeText(timeText(m.seconds), C, C + 1); x.fillStyle = '#fff'; x.fillText(timeText(m.seconds), C, C + 1);
    }
    if (m.stacks > 0) badge(x, n, m.stacks, m.maxStacks > 0 && m.stacks >= m.maxStacks);
    if (s.gem) {   // quality gem: a small faceted diamond in the top-right corner
      const r = n * 0.085, gx = n * 0.84, gy = n * 0.16;
      x.beginPath(); x.moveTo(gx, gy - r); x.lineTo(gx + r, gy); x.lineTo(gx, gy + r); x.lineTo(gx - r, gy); x.closePath();
      x.fillStyle = themes.quality[s.gem]; x.fill(); x.lineWidth = Math.max(1, n / 40); x.strokeStyle = '#120c06'; x.stroke();
      x.beginPath(); x.moveTo(gx, gy - r); x.lineTo(gx - r * 0.5, gy - r * 0.1); x.lineTo(gx, gy); x.closePath(); x.fillStyle = 'rgba(255,255,255,.7)'; x.fill();
    }
    if (s.itemState === 'equipped') {   // a green tick bottom left
      const r = n * 0.13, tx = n * 0.17, ty = n * 0.83;
      x.beginPath(); x.arc(tx, ty, r, 0, Math.PI * 2); x.fillStyle = '#2f9a4a'; x.fill(); x.lineWidth = Math.max(1, n / 40); x.strokeStyle = '#0c2a14'; x.stroke();
      x.beginPath(); x.moveTo(tx - r * 0.5, ty + r * 0.05); x.lineTo(tx - r * 0.12, ty + r * 0.42); x.lineTo(tx + r * 0.55, ty - r * 0.38);
      x.lineWidth = Math.max(1.2, r * 0.32); x.strokeStyle = '#fff'; x.lineCap = 'round'; x.lineJoin = 'round'; x.stroke();
    }
    if (s.itemState === 'new') {   // a four-point sparkle top left
      const r = n * 0.11, sx = n * 0.17, sy = n * 0.17;
      x.beginPath(); x.moveTo(sx, sy - r); x.quadraticCurveTo(sx, sy, sx + r, sy); x.quadraticCurveTo(sx, sy, sx, sy + r); x.quadraticCurveTo(sx, sy, sx - r, sy); x.quadraticCurveTo(sx, sy, sx, sy - r);
      x.fillStyle = '#fff6cf'; x.shadowColor = '#ffd76a'; x.shadowBlur = n * 0.06; x.fill(); x.shadowBlur = 0;
    }
    if (s.count > 1) {   // stack count bottom right, plain white with a dark edge
      const t = s.count > 999 ? '999+' : String(s.count);
      x.font = `800 ${Math.round(n * 0.27)}px system-ui, sans-serif`; x.textAlign = 'right'; x.textBaseline = 'alphabetic';
      x.lineWidth = Math.max(2, n / 16); x.strokeStyle = 'rgba(0,0,0,.9)'; x.lineJoin = 'round';
      x.strokeText(t, n * 0.9, n * 0.9); x.fillStyle = '#fff'; x.fillText(t, n * 0.9, n * 0.9);
    }
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
        const painted = generalRows.filter(g => g.element === e && g.mechanic === m).map(g => g.id);
        const tinted = generalRows.filter(g => !g.element && g.mechanic === m).map(g => g.id);
        cells[e][m] = { painted, tinted, status: painted.length ? 'painted' : tinted.length ? 'tinted' : 'missing' };
      }
    }
    return { elements: [...glyphs.elements], mechanics: { ...glyphs.mechanics }, cells };
  }

  // ---- items (round 3) ---------------------------------------------------------------------------------------------
  const ROUND_SLOTS = new Set(['ring', 'necklace', 'amulet']);
  const itemId = b => `item-${String(b || '').toLowerCase().replace(/_/g, '-')}`;
  /** An item's rarity as the kit tints it: quest / set / unique beat the rolled rarity (Oathwild's rarityOf). */
  const rarityOfItem = it => (it?.quest || it?.type === 'quest' ? 'quest' : it?.setId ? 'set' : it?.isUnique ? 'unique' : themes.rarity?.[it?.rarity] ? it.rarity : 'normal');
  /**
   * The kit icon for a game's item (Emberveil / Oathwild shape: baseKey, subtype, slot, type, rarity, quality, count).
   * Glyph: its base's own row (`item-<base>`) -> its subtype's -> its slot's -> a generic one. `match`: base | subtype |
   * slot | generic (the last three are fallbacks). Round (circle) for rings and necklaces, square for everything else.
   * `opts`: equipped, broken, cannotWear, isNew (one item state is shown: broken > cannot wear > new > equipped).
   */
  function itemIconFor(it = {}, { equipped = false, broken = false, cannotWear = false, isNew = false, shape } = {}) {
    const fb = items?.fallbacks || {};
    const base = it.baseKey || it.base || '', sub = it.subtype || '', slot = it.slot || (it.type === 'weapon' ? 'weapon' : '');
    let row = null, match = 'generic', why = '';
    if (base && byId.has(itemId(base))) { row = byId.get(itemId(base)); match = 'base'; why = `base ${base}`; }
    else if (sub && byId.has(fb.subtype?.[sub])) { row = byId.get(fb.subtype[sub]); match = 'subtype'; why = `no ${base || 'base'} picture: ${sub}`; }
    else if (it.isMagicShield && byId.has(fb.focus)) { row = byId.get(fb.focus); match = 'slot'; why = 'a focus'; }
    else if (it.isShield && byId.has(fb.shield)) { row = byId.get(fb.shield); match = 'slot'; why = 'a shield'; }
    else if (slot && byId.has(fb.slot?.[slot])) { row = byId.get(fb.slot[slot]); match = 'slot'; why = `no ${base || sub || 'base'} picture: ${slot}`; }
    else if ((it.quest || it.type === 'quest') && byId.has(fb.quest)) { row = byId.get(fb.quest); match = 'generic'; why = 'quest item'; }
    else if ((it.type === 'potion' || /potion|draught|elixir|tonic|flask/i.test(it.name || '')) && byId.has(fb.potion)) { row = byId.get(fb.potion); match = 'generic'; why = 'potion'; }
    else { row = byId.get(fb.default) || itemRows[0] || null; why = 'nothing closer'; }
    const round = ROUND_SLOTS.has(slot) || ROUND_SLOTS.has(sub) || row?.shape === 'circle';
    const itemState = broken ? 'broken' : cannotWear ? 'cannotwear' : isNew ? 'new' : equipped ? 'equipped' : null;
    const count = Math.floor(num(it.count ?? it.qty ?? it.stack) || 0);
    const spec = normalize({ kind: 'item', shape: shape || (round ? 'circle' : 'square'), glyph: row?.id, rarity: rarityOfItem(it), gem: it.quality || null, itemState, count });
    return { spec, glyph: spec.glyph, match, fallback: match !== 'base', why };
  }

  return {
    data: { themes, glyphs, layers, items }, glyphs: glyphRows, items: itemRows, glyph: id => byId.get(id) || null,
    themeFor, iconFor, itemIconFor, rarityOfItem, mechanicOf, normalize, specKey, layerSources, iconHtml, iconCanvas, iconDataUrl, glyphMatrix, url, timeText,
    classes: () => Object.keys(themes.classes), elements: () => [...glyphs.elements],
    frames: () => Object.entries(layers.frames).map(([id, f]) => ({ id, name: f.name, style: f.style || 'painted', cls: f.class || null })),
    isPainted: id => isPaintedGlyph(byId.get(id)),
  };
}

/** Read the three data files and build a kit. In a browser it fetches them next to this module. */
export async function loadKit({ base = new URL('../', import.meta.url), readJson = u => fetch(u).then(r => { if (!r.ok) throw new Error(`iconkit: ${u} ${r.status}`); return r.json(); }) } = {}) {
  const [themes, glyphs, layers, items] = await Promise.all(['themes', 'glyphs', 'layers', 'items'].map(n => readJson(new URL(`data/${n}.json`, base))));
  return createKit({ themes, glyphs, layers, items }, { base: String(base) });
}
