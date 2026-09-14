// Icon lookup for both halves of the interface: a URL for an <img> in the DOM, and a pre-loaded
// Image for drawing on the canvas.
//
//   import { iconUrl, iconImage, iconFor } from './icons.js';
//   iconUrl('bld', 'drill_mk1')            -> '../../../assets/data/icons/foundry/bld_drill_mk1.svg'
//   iconImage('bld', 'drill_mk1')          -> an HTMLImageElement (may still be loading)
//
// Two wrinkles worth knowing:
//  - A data entry can carry an `icon` field naming a different id, and a few ids have no art at all.
//    `iconFor(kind, def)` handles both and falls back to a category glyph.
//  - The SVG files have a viewBox but no width/height, and a browser will not draw an image like that
//    onto a canvas. So canvas icons are fetched as text, given a size, and handed back as a data URL.

import { ICON_FILES } from './icon-list.js';

export const ICON_BASE = '../../assets/data/icons/foundry/';

/** What to draw when a thing has no art of its own. */
const FALLBACK = {
  bld: 'ui_build', res: 'ui_storage', unit: 'unit_swarmer', veh: 'veh_rover', ui: 'ui_alert',
};
/** Category glyphs for the build bar's tabs, and for buildings whose own icon is missing. */
export const CATEGORY_ICON = {
  base: 'bld_landing_pod', extraction: 'ui_scan', processing: 'bld_smelter', power: 'ui_power',
  logistics: 'ui_storage', defence: 'ui_turret', scan: 'ui_radar', science: 'ui_research',
  space: 'ui_rocket', variant: 'ui_planet', road: 'ui_route',
};

/** The icon file name for a kind + id, or null when there is no art. */
export function iconName(kind, id) {
  if (!id) return null;
  const name = `${kind}_${id}`;
  return ICON_FILES.has(name) ? name : null;
}

/**
 * The icon file name for a data entry, honouring its `icon` override and falling back sensibly.
 * `def` may be a structure, resource, unit or vehicle record, or just an id string.
 */
export function iconFor(kind, def) {
  if (!def) return FALLBACK[kind] || 'ui_alert';
  const id = typeof def === 'string' ? def : def.id;
  const alt = typeof def === 'object' ? def.icon : null;
  return iconName(kind, alt) || iconName(kind, id)
    || (kind === 'bld' && def.category && ICON_FILES.has(CATEGORY_ICON[def.category] || '') ? CATEGORY_ICON[def.category] : null)
    || FALLBACK[kind] || 'ui_alert';
}

/** A URL an <img> can use. */
export const iconUrl = (kind, def) => ICON_BASE + iconFor(kind, def) + '.svg';
/** A URL for a raw file name (ui_power, bld_smelter…). */
export const rawUrl = name => ICON_BASE + name + '.svg';

/** An <img> element, sized in ems, for a data entry. */
export function icon(kind, def, { size = null, cls = '' } = {}) {
  const img = document.createElement('img');
  img.className = 'ic' + (cls ? ' ' + cls : '');
  img.src = iconUrl(kind, def);
  img.alt = '';
  img.loading = 'lazy';
  if (size) { img.style.width = size + 'px'; img.style.height = size + 'px'; }
  return img;
}

/** An <img> element for a raw icon file name. */
export function rawIcon(name, { size = null, cls = '' } = {}) {
  const img = document.createElement('img');
  img.className = 'ic' + (cls ? ' ' + cls : '');
  img.src = rawUrl(ICON_FILES.has(name) ? name : 'ui_alert');
  img.alt = '';
  if (size) { img.style.width = size + 'px'; img.style.height = size + 'px'; }
  return img;
}

// ---------------------------------------------------------------------------- canvas images

const cache = new Map();      // file name -> HTMLImageElement (with .ready once it can be drawn)
let pending = 0;

/**
 * A canvas-drawable image for one icon. It comes back straight away; `img.ready` turns true when the
 * art has actually loaded, so a renderer can skip it for a frame or two instead of waiting.
 */
export function imageNamed(name) {
  if (!name || !ICON_FILES.has(name)) name = 'ui_alert';
  let img = cache.get(name);
  if (img) return img;
  img = new Image();
  img.ready = false;
  cache.set(name, img);
  pending++;
  // The files carry only a viewBox. Give them a pixel size or the canvas refuses to draw them.
  fetch(ICON_BASE + name + '.svg')
    .then(r => (r.ok ? r.text() : Promise.reject(new Error('missing icon ' + name))))
    .then(text => {
      const sized = /<svg[^>]*\swidth=/.test(text) ? text : text.replace('<svg', '<svg width="64" height="64"');
      img.onload = () => { img.ready = true; pending--; };
      img.onerror = () => { pending--; };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized);
    })
    .catch(() => { pending--; });
  return img;
}

/** Same, for a data entry. */
export const iconImage = (kind, def) => imageNamed(iconFor(kind, def));

/** How many icons are still loading - the title screen waits on this so the first frame is complete. */
export const iconsPending = () => pending;

/** Warm the cache for a list of entries so the map does not pop in icon by icon. */
export function preload(pairs) { for (const [kind, def] of pairs) iconImage(kind, def); }

/** Resolve when every icon asked for so far has loaded (or given up). */
export function iconsReady(timeout = 8000) {
  const start = Date.now();
  return new Promise(resolve => {
    const check = () => {
      if (pending <= 0 || Date.now() - start > timeout) return resolve();
      setTimeout(check, 40);
    };
    check();
  });
}

// ---------------------------------------------------------------------------- canvas sprites
//
// Drawing an SVG-backed Image onto a canvas re-rasterizes it every time, which on a map with two
// hundred buildings is most of a frame. These are the same icons baked into small canvases at a few
// fixed sizes, so the map loop is doing plain canvas-to-canvas blits.

const sprites = new Map();
const SIZES = [8, 12, 16, 24, 32, 48, 64, 96];

/** The nearest baked size at or above `px`. */
const bucket = px => SIZES.find(s => s >= px) || SIZES[SIZES.length - 1];

/**
 * A canvas holding one icon at a size near `px`, or null while the art is still loading.
 * Draw it with `ctx.drawImage(sprite, x, y, w, h)` - it scales fine either way.
 */
export function sprite(name, px) {
  const img = imageNamed(name);
  if (!img.ready) return null;
  const size = bucket(px);
  const key = name + ':' + size;
  let c = sprites.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  try { g.drawImage(img, 0, 0, size, size); } catch { return null; }
  sprites.set(key, c);
  return c;
}

/** Same, for a data entry. */
export const spriteFor = (kind, def, px) => sprite(iconFor(kind, def), px);
