// One icon style for the whole game (lessons rule 17): button/menu icons from the playground's Codex-drawn SVG set
// (icons/data/game/ui.js); spells, passives and items from the Icon Kit (iconkit/, loaded at boot — see below), with the
// old spell medallions (icons/js/catalog.js, class motifs) as the picture until it has loaded. A few small line glyphs
// (close, arrows, coin) are drawn here in the same weight.
import { uiIconSvg, motifSvg, CLASS_MOTIFS } from '../../../../../icons/js/game-icons.js';
import { iconSvg } from '../../../../../icons/js/catalog.js';

const LINE = {
  x: '<path d="M7 7l10 10M17 7L7 17"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  up: '<path d="M5 15l7-7 7 7"/>',
  down: '<path d="M5 9l7 7 7-7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  skull: '<path d="M12 3.5c-4.4 0-7.5 3-7.5 7 0 2.4 1.1 4.1 2.8 5.1v3.4h9.4v-3.4c1.7-1 2.8-2.7 2.8-5.1 0-4-3.1-7-7.5-7zM9 11.5h.01M15 11.5h.01M10.5 19v-2.5M13.5 19v-2.5"/><circle cx="9" cy="11.5" r="1.6"/><circle cx="15" cy="11.5" r="1.6"/>',
  crown: '<path d="M4 17.5h16M4.5 17.5L3.5 8l5 4 3.5-6 3.5 6 5-4-1 9.5"/>',
  coin: '<circle cx="12" cy="12" r="7.5"/><path d="M12 8.5v7M9.8 10.2c0-1 1-1.7 2.2-1.7s2.2.6 2.2 1.5-1 1.3-2.2 1.6-2.2.7-2.2 1.6 1 1.6 2.2 1.6 2.2-.7 2.2-1.7"/>',
  weight: '<path d="M8 9h8l2.5 10h-13z"/><circle cx="12" cy="6.5" r="2"/>',
  star: '<path d="M12 4l2.4 5 5.4.7-4 3.7 1 5.4L12 16.3 7.2 18.8l1-5.4-4-3.7 5.4-.7z"/>',
  level: '<path d="M12 4l6 6h-4v8h-4v-8H6z"/>',
  shrine: '<path d="M5 19h14M7 19V11M17 19V11M5 11l7-6 7 6M10 19v-4h4v4"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  refresh: '<path d="M18 9a7 7 0 1 0 1 5M18 4v5h-5"/>',
  people: '<circle cx="9" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M3.5 19c.5-3.5 2.8-5.5 5.5-5.5s5 2 5.5 5.5M14.5 14c2.6-.4 5 1.3 5.5 5"/>',
  globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16"/>',
  lockOpen: '<rect x="6" y="11" width="12" height="8" rx="1.5"/><path d="M9 11V8a3 3 0 0 1 6 0"/>',
  thumbUp: '<path d="M8 11v8H5v-8zM8 11l3.5-6.5c1.3 0 2 .8 2 2V10h4.3a1.6 1.6 0 0 1 1.6 1.9l-1.2 5.6a2 2 0 0 1-2 1.5H8"/>',
  thumbDown: '<path d="M8 13V5H5v8zM8 13l3.5 6.5c1.3 0 2-.8 2-2V14h4.3a1.6 1.6 0 0 0 1.6-1.9l-1.2-5.6a2 2 0 0 0-2-1.5H8"/>',
  news: '<path d="M5 6h11v12H6a1 1 0 0 1-1-1zM16 9h3v8a1 1 0 0 1-1 1h-2M8 9h5M8 12h5M8 15h3"/>',
  scroll: '<path d="M7 5h10v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-1h10"/><path d="M9 9h5M9 12h5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.3M12 18.2v2.3M3.5 12h2.3M18.2 12h2.3M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6"/>',
  pad: '<rect x="3.5" y="8" width="17" height="9" rx="4.5"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="15.5" cy="11.5" r=".8"/><circle cx="17" cy="13.5" r=".8"/>',
  keyboard: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M6.5 10h1M9.5 10h1M12.5 10h1M15.5 10h1M7 14h10"/>',
  sound: '<path d="M5 10h3l4-3.5v11L8 14H5zM15.5 9.5a3.5 3.5 0 0 1 0 5M17.5 7.5a6.5 6.5 0 0 1 0 9"/>',
  eye: '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.5"/>',
  sword: '<path d="M14.5 4.5h5v5L10 19l-2-2zM6 15l3 3M5 20l2-2"/>',
  shield: '<path d="M12 4l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V7z"/>',
  enchant: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM18 15l.8 2.2 2.2.8-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
  hammer: '<path d="M13 6l5 5-2 2-5-5zM11 8L4 15l2 2 7-7"/>',
  horse: '<path d="M6 19v-5c0-3 2-6 5-7l2-3 1 3c2 1 4 3 4 6v1h-3l-1-2-2 1v6M10 19v-4"/>',
  info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8v.5"/>',
  door: '<path d="M6 20V5a1 1 0 0 1 1-1h8v16M4 20h16M12 12v.5"/>',
  dodge: '<path d="M4 17c5 0 7-9 13-9M14 5l3 3-3 3M4 12.5h3.5M4 8.5h2"/>',
  hand: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V11M11 10V5a1.5 1.5 0 0 1 3 0v6M14 10.5V7a1.5 1.5 0 0 1 3 0v6c0 4-2.5 7-6 7-3 0-4.6-1.8-6-4.6L3.5 12a1.4 1.4 0 0 1 2.4-1.4L8 13"/>',
  // one glyph per training kind (owner 2026-11-26: each weapon and armour kind is its own tree node)
  axe: '<path d="M6 20L16 7M13 4c3 0 6 2.5 6 6-2.2 0-4.5-.6-6.3-2.4"/><path d="M13 4c-1 1.5-1.2 3-.3 3.6"/>',
  mace: '<path d="M6 20l7-7"/><circle cx="15.5" cy="8.5" r="3.5"/><path d="M15.5 3.5v1.5M20.5 8.5H19M18.9 5.1l-1 1M12.1 5.1l1 1M18.9 11.9l-1-1"/>',
  dagger: '<path d="M16 4l-1 7-4 4-2-2 4-4zM9 13l-3 3M7 17l-2 2M6.5 14.5l3 3"/>',
  spear: '<path d="M5 19L16 8M16 8l1-4 3 3-4 1z"/>',
  staff: '<path d="M7 20L16 7"/><circle cx="17" cy="5.5" r="2.2"/>',
  twohand: '<path d="M17 3.5h3.5V7L9 18.5 5.5 15zM4 16l4 4M3.5 20.5l1.5-1.5M8.5 12.5l3 3"/>',
  bow: '<path d="M7 4c7 2 10 8 9 16M7 4v16"/><path d="M4 12h13M15 10l2 2-2 2"/>',
  crossbow: '<path d="M4 9c4-3 12-3 16 0M12 6v14M9 17h6M4 9l8 5 8-5"/>',
  wand: '<path d="M5 19L15 9"/><path d="M17 4l.8 2.2L20 7l-2.2.8L17 10l-.8-2.2L14 7l2.2-.8z"/>',
  scepter: '<path d="M7 20l8-8"/><path d="M14 6l2-2 2 2 2 2-2 2-2 2-2-2-2-2z"/>',
  orb: '<circle cx="12" cy="11" r="6"/><path d="M9 9a3 3 0 0 1 3-2M8 20h8M10 17l-1 3M14 17l1 3"/>',
  tome: '<path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H18v14H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H18M9 8h6M9 11h4"/>',
  leather: '<path d="M8 4l4 2 4-2 3 3-2 3v10H7V10L5 7z"/><path d="M10 12h4M10 15h4"/>',
  mail: '<path d="M8 4l4 2 4-2 3 3-2 3v10H7V10L5 7z"/><path d="M9 10h6M9 13h6M9 16h6M10.5 10v9M13.5 10v9"/>',
  plate: '<path d="M8 4l4 2 4-2 3 3-2 3v10H7V10L5 7z"/><path d="M12 6v14M7 12c3 1.5 7 1.5 10 0"/>',
  dualWield: '<path d="M4 4l9 9M20 4l-9 9M6 16l3-3M18 16l-3-3M4 20l3-3M20 20l-3-3"/>',
};

/** A small line glyph (24 viewBox, currentColor). */
export function glyph(id, size = 20) {
  const p = LINE[id];
  if (!p) return '';
  return `<svg class="ow-icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

/** A button / menu picture from the shared Codex set, falling back to a line glyph. */
export function uiIcon(id, size = 24) {
  return uiIconSvg(id, size, { cls: 'ow-icon ow-uiico' }) || glyph(id, size) || '';
}

// ---- spell / passive / item pictures: the Icon Kit (iconkit/, round 3, owner 2026-11-27) -----------------------------
// "Use the Hairline frame for Oathwild with class colours": a spell is the kit's layered icon (class-tinted stone, the
// spell's glyph and element glow, a hairline ring in the class colour). A passive class node has the kit's passive look
// (no frame, soft faded edge: a buff, not a button). An item is the kit's square item icon (round for jewellery), its
// silver frame tinted by rarity. The kit loads once at boot (loadIconKit, main.js); until it has, every function here
// returns the old SVG picture, so callers stay synchronous. The kit lives beside prototypes/ on the same origin.
const KIT_URL = '../../../../../iconkit/js/iconkit.js';
const kitRef = { kit: null, rules: null, p: null };
const cache = new Map();
/** Load the kit (once) and remember the rules (spell rows for iconFor). Resolves to the kit, or null if it failed. */
export function loadIconKit(rules) {
  if (rules) kitRef.rules = rules;
  return kitRef.p ??= (async () => {
    try {   // (its stylesheet is linked in index.html)
      const { loadKit } = await import(KIT_URL);
      kitRef.kit = await loadKit();
      cache.clear();
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('ow:icons'));   // redraw what drew the old pictures
      return kitRef.kit;
    } catch (e) {
      console.warn('icons: the Icon Kit did not load — keeping the old spell pictures', e);
      return null;
    }
  })();
}
/** The kit once loaded (null before): tests and the review page read it. */
export const iconKit = () => kitRef.kit;
/** Oathwild's look: hairline ring in the class colour, round. */
const OW_LOOK = { frame: 'hairline', frameColor: 'class', shape: 'circle' };
const spellRow = id => { const r = kitRef.rules?.spells?.[id]; return r ? { id, ...r.base } : null; };

// the old pictures: the shared catalog by spell id (most Oathwild spells reuse a Farhold / Thousandvale row and its id),
// else the source row it came from, else the class's motif on a medallion
const MOTIF_OF = { warrior: 'warrior', ranger: 'ranger', rogue: 'rogue', mage: 'mage', cleric: 'cleric', druid: 'druid', bard: 'bard', shaman: 'shaman', paladin: 'paladin', spellblade: 'knight', warlock: 'warlock', wayfarer: 'ranger', pyromancer: 'pyromancer', stormcaller: 'stormcaller', necromancer: 'necromancer', witch_hunter: 'witch_hunter', duelist: 'swashbuckler', shadowdancer: 'shadow_dancer', spellfletcher: 'ranger', bladesworn: 'fighter', wrathborn: 'warrior', gravecutter: 'rogue', dragon_knight: 'dragon_knight', chronomancer: 'chronomancer', oracle: 'oracle', tinker: 'tinker', starcaller: 'starblade' };
function oldSpellIcon(spellId, size, cls, from) {
  let svg = iconSvg(spellId, size) || (from && iconSvg(from, size));
  if (!svg) {
    const motifs = CLASS_MOTIFS[MOTIF_OF[cls] || 'mage'] || [];
    const pick = motifs.length ? motifs[[...String(spellId)].reduce((s, c) => s + c.charCodeAt(0), 0) % motifs.length] : null;
    const m = pick && motifSvg(pick, size);
    svg = m ? `<span class="ow-motif" style="width:${size}px;height:${size}px">${m}</span>` : `<span class="ow-motif ow-motif-blank" style="width:${size}px;height:${size}px"></span>`;   // lint-ok: size is a computed pixel number
  }
  return svg;
}

/** A spell's picture at `size` px: the kit icon (hairline, class colour) once loaded, the old SVG before. */
export function spellIcon(spellId, size = 40, { cls = null, from = null, passive = false } = {}) {
  const kit = kitRef.kit;
  const k = `${kit ? 'k' : 'o'}|${spellId}|${size}|${cls}|${passive ? 1 : 0}`;
  if (cache.has(k)) return cache.get(k);
  const row = kit && spellRow(spellId);
  const html = row
    ? kit.iconHtml({ ...kit.iconFor(row, cls, OW_LOOK).spec, size, state: passive ? 'passive' : 'ready' }, { cls: 'ow-ik' })
    : oldSpellIcon(spellId, size, cls, from);
  cache.set(k, html);
  return html;
}

// a class tree's training / mastery node shows the weapon or armour it is about, from the kit's item pictures
const TRAIN_ITEM = { dagger: 'item-dagger', sword: 'item-sword', axe: 'item-battleaxe', mace: 'item-iron-mace', spear: 'item-spear', staff: 'item-staff', twohand: 'item-sword2h', bow: 'item-bow', crossbow: 'item-crossbow', wand: 'item-wand', scepter: 'item-scepter', orb: 'item-orb', tome: 'item-tome', leather: 'item-light-chest', mail: 'item-medium-chest', plate: 'item-heavy-chest', shield: 'item-shield', dualWield: 'item-sword', cloth: 'item-cloth-chest', light: 'item-light-chest', medium: 'item-medium-chest', heavy: 'item-heavy-chest', javelin: 'item-javelin' };
/**
 * A never-pressed class node (passive, training, modifier) in the kit's passive look: no frame, a soft faded edge.
 * `spell`: draw that spell's glyph (a modifier); `train`: a weapon / armour kind (training, mastery); else the node's name
 * picks a glyph like a buff would. Before the kit loads: null (the caller keeps its old medallion).
 */
export function passiveIcon({ name = '', spell = null, train = null, cls = null, size = 40 } = {}) {
  const kit = kitRef.kit;
  if (!kit) return null;
  const k = `p|${name}|${spell}|${train}|${cls}|${size}`;
  if (cache.has(k)) return cache.get(k);
  let spec;
  const row = spell && spellRow(spell);
  if (row) spec = kit.iconFor(row, cls, OW_LOOK).spec;
  else {
    // a passive has no element of its own: its name says it ("Fire Study", "Deep Mana" → arcane is the class's own)
    const w = String(name).toLowerCase().split(/[^a-z]+/);
    const els = kit.data.themes.elements;
    const element = Object.keys(els).find(e => w.includes(e) || (els[e].words || []).some(x => w.includes(x))) || 'physical';
    spec = kit.iconFor({ name, mechanic: 'buff', element }, cls, OW_LOOK).spec;
    if (train && kit.glyph(TRAIN_ITEM[train])) spec = { ...spec, glyph: TRAIN_ITEM[train], glow: null };
  }
  const html = kit.iconHtml({ ...spec, size, state: 'passive' }, { cls: 'ow-ik' });
  cache.set(k, html);
  return html;
}

/**
 * An item's picture: the kit's item icon (square, round for jewellery; silver frame tinted by rarity; quality gem;
 * stack count). `opts`: equipped, broken, cannotWear, isNew. Before the kit loads: null (the caller keeps its glyph).
 */
export function itemIcon(item, size = 40, opts = {}) {
  const kit = kitRef.kit;
  if (!kit || !item) return null;
  const k = `i|${item.baseKey || item.base}|${item.subtype}|${item.slot}|${kit.rarityOfItem(item)}|${item.quality}|${item.count || 0}|${size}|${opts.equipped ? 1 : 0}${opts.broken ? 1 : 0}${opts.cannotWear ? 1 : 0}${opts.isNew ? 1 : 0}`;
  if (cache.has(k)) return cache.get(k);
  const html = kit.iconHtml({ ...kit.itemIconFor(item, opts).spec, size }, { cls: 'ow-ik' });
  cache.set(k, html);
  return html;
}
