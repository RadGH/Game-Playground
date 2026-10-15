// Game icons beyond spells (2026-10-14): buttons, menus, emotes, professions, every non-gear item and the spell-effect
// particle shapes, all hand-authored SVG (Codex-drawn, see ../data/game/STYLE.md). Pure: strings only, no DOM, no fetch,
// so node tests and a server can read it.
//
//   uiIconSvg('attack', 40, { medallion: true })   -> '<svg …>'   (null for an unknown id)
//   itemArtKey(item)                               -> 'mana_potion' | 'fish' | 'mat_ore' | null   (null = no drawn art: gear)
//   itemIconSvg(key, 48) / itemIconUrl(key)        -> '<svg …>' / 'data:image/svg+xml,…'   (cached)
//   motifSvg('pyromancer.a') / classPalette('pyromancer') / CLASS_MOTIFS
//
// Item art is looked up by the item's own id first, then by what it is (a species, a crate, a material's class), then a
// family fallback. Gear (weapons, armour, shields) is NOT here: the game draws those from the 3D models.

import ui from '../data/game/ui.js';
import goods from '../data/game/items-goods.js';
import materials from '../data/game/items-materials.js';
import fish from '../data/game/items-fish.js';
import { MOTIFS, PALETTES, CLASS_MOTIFS, classPalette, motifSvg } from './motifs.js';
import { disc } from './draw.js';

export const UI_ICONS = ui;
export const ITEM_ART = Object.freeze({ ...goods, ...materials, ...fish });
export { MOTIFS, PALETTES, CLASS_MOTIFS, classPalette, motifSvg };

const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const px = size => (Number.isFinite(Number(size)) ? Math.max(1, Math.min(1024, Number(size))) : 32);

/** A button / menu picture (viewBox 32). `medallion` puts the spell icons' midnight disc behind it. */
export function uiIconSvg(id, size = 24, { medallion = false, label = '', cls = 'gi-ico' } = {}) {
  const icon = ui[id];
  if (!icon) return null;
  const aria = label ? `role="img" aria-label="${escape(label)}"` : 'aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" viewBox="0 0 32 32" width="${px(size)}" height="${px(size)}" ${aria}>${medallion ? disc : ''}${icon.art}</svg>`;
}

// ---- items ----

/** Material class -> its fallback picture (an unknown material of a known class). */
const MAT_CLASS = { ore: 'mat_ore', metal: 'mat_metal', gem: 'mat_gem', wood: 'mat_wood', herb: 'mat_herb', mushroom: 'mat_mushroom', fibre: 'mat_fibre', cloth: 'mat_cloth', hide: 'mat_hide', leather: 'mat_leather', resin: 'mat_resin' };
const has = k => !!(k && ITEM_ART[k]);

/**
 * Which drawn picture an item uses, or null when it has none (gear: the game's 3D icons draw those). Pure — exported for
 * tests. Order: the item's id → its species / base → what kind of thing it is → a family fallback.
 */
export function itemArtKey(item) {
  if (!item || typeof item !== 'object') return null;
  const id = String(item.id || item.baseKey || '');
  const kind = String(item.kind || item.type || '');
  const name = String(item.name || '');
  if (kind === 'crate') return /sunken/i.test(name) || id === 'sunken_crate' ? 'sunken_crate' : 'crate';
  if (kind === 'gift') return 'gift_box';
  if (kind === 'trophy' || id.startsWith('trophy_')) return 'trophy';
  if (has(id) && !item.slot) return id;
  if (has(item.species)) return item.species;
  if (kind === 'fish' || kind === 'legend') return 'fish';
  if (kind === 'material') return MAT_CLASS[item.class || item.icon] || 'bundle';
  if (kind === 'potion' || /potion|draught|elixir|tonic/i.test(name)) return 'potion';
  if (kind === 'junk') return 'junk';
  if (kind === 'quest' || item.quest) return 'quest_item';
  if (kind === 'key') return 'key';
  if (kind === 'tool' || item.tool) return 'tool';
  if (kind === 'good' && item.use?.type === 'bait') return 'bait_worms';
  if (kind === 'good' && item.use?.type === 'food') return 'travel_rations';
  if (kind === 'good' && item.use?.type === 'drink') return 'trail_ale';
  if (kind === 'good') return 'bundle';
  return null;
}

export function itemIconSvg(key, size = 48, { label = '' } = {}) {
  const art = ITEM_ART[key];
  if (!art) return null;
  const aria = label ? `role="img" aria-label="${escape(label)}"` : 'aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" class="gi-item" viewBox="0 0 64 64" width="${px(size)}" height="${px(size)}" ${aria}>${art.art}</svg>`;
}
const urls = new Map();
/** A data: URL for an <img> (the bag's cells take image URLs). Cached per key. */
export function itemIconUrl(key) {
  if (urls.has(key)) return urls.get(key);
  const svg = itemIconSvg(key, 96);
  const url = svg ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) : null;
  urls.set(key, url);
  return url;
}
