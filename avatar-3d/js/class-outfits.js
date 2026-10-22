// Class outfits for Chibi 2 — clothes, headwear and carried items for each of the 30 classes, kept
// apart from faces and bodies so any game can dress any body as any class.
//
//   import { loadClassOutfits, dressAs } from '../../avatar-3d/js/class-outfits.js';
//   const outfits = await loadClassOutfits();              // avatar-3d/data/class-outfits.json
//   const look = dressAs(myAvatar, outfits.fighter);       // a NEW avatar; myAvatar is untouched
//   const look2 = dressAs(myAvatar, outfits.mage, { hands: false });   // clothes only
//
// No Three.js here, so node tests and non-3D tools can read it.

export const OUTFIT_SLOTS = ['hat', 'top', 'bottom', 'shoes', 'cape', 'decor', 'held', 'offhand'];
const HAND_SLOTS = new Set(['held', 'offhand']);
const clone = v => JSON.parse(JSON.stringify(v));

/** The outfit table, keyed by class id. Never throws: a failed fetch gives an empty table. */
export async function loadClassOutfits(url = new URL('../data/class-outfits.json', import.meta.url).href) {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()).classes || {}) : {};
  } catch { return {}; }
}

/**
 * A copy of `avatar` wearing `outfit`. Only the slots the outfit names are replaced; a class that
 * lists just a hat (the shaman) keeps everything else it had. `hands: false` leaves `held` and
 * `offhand` alone, for a game that draws the hands from real equipment.
 */
export function dressAs(avatar, outfit, { hands = true } = {}) {
  const out = clone(avatar || {});
  for (const slot of OUTFIT_SLOTS) {
    if (!outfit?.[slot]) continue;
    if (!hands && HAND_SLOTS.has(slot)) continue;
    out[slot] = clone(outfit[slot]);
  }
  return out;
}

// ---------------------------------------------------------------- tier 2 (Thousandvale play-test 4, S18)
//
//   import { loadClassOutfits2, tier2Dress, isTier2Item } from '../../avatar-3d/js/class-outfits.js';
//   const t2 = await loadClassOutfits2();                   // avatar-3d/data/class-outfits-t2.json
//   const look = dressAs(avatar, t2.pyromancer);            // the whole tier-2 outfit (a portrait)
//   const worn = tier2Dress(gearDrivenLook, t2.pyromancer, { chest: true, head: true });
//
// A tier-2 outfit is an ordinary outfit whose top carries `emblem`/`emblemColor` and whose decor is one
// of the five t2_* kits (avatar-3d/js/chibi2-armour2.js draws both). The tier-1 table and every look
// that names neither are untouched.

/** Item level at which worn armour shows its tier-2 look (when the item carries a level at all). */
export const ITEM_TIER2_LEVEL = 15;
/** An item's element -> emblem, so a fire-branded chest piece shows a flame whatever the class. */
export const ELEMENT_EMBLEM = { fire: 'flame', ice: 'frost', cold: 'frost', frost: 'frost', lightning: 'bolt', poison: 'drop', shadow: 'skull', holy: 'sun', arcane: 'rune', nature: 'leaf', blood: 'blood' };
export const ELEMENT_EMBLEM_COLOR = { flame: '#ff8a1a', frost: '#9fe0ff', bolt: '#ffe84a', drop: '#7ae040', skull: '#c090ff', sun: '#f0c040', rune: '#b8a0ff', leaf: '#6ad040', blood: '#d02020' };

/** The tier-2 outfit table, keyed by class id. Never throws. */
export async function loadClassOutfits2(url = new URL('../data/class-outfits-t2.json', import.meta.url).href) {
  return loadClassOutfits(url);
}

/**
 * Does this worn item show tier 2? In order: `item.look.tier`; a theme (`theme` / `look.theme` — Thousandvale's
 * armour-tiers.json themed pieces, which ARE the second tier); a numeric `tier` of 2+ (a base's armour weight —
 * 'heavy', 'cloth' — is a string and does not count); an item level (`level` / `ilvl` / `itemLevel` / `lvl` /
 * `reqLevel`) of ITEM_TIER2_LEVEL or more. Rarity alone never does: uniques and sets keep their own look.
 */
export function isTier2Item(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.look?.tier != null) return +item.look.tier >= 2;
  if (item.theme || item.look?.theme || item.themeLook) return true;
  if (typeof item.tier === 'number' && item.tier >= 2) return true;
  const lvl = item.level ?? item.ilvl ?? item.itemLevel ?? item.lvl ?? item.reqLevel;
  return lvl != null && Number.isFinite(+lvl) && +lvl >= ITEM_TIER2_LEVEL;
}

/**
 * A copy of a (gear-driven) look with the tier-2 pieces of `outfit2` laid over it:
 *   chest -> the top keeps its part id and colour but gains the trim + emblem (chest and back), and the decor
 *            becomes the class's tier-2 kit (whose shoulders carry the emblem too);
 *   head  -> the hat gains the trim (`color2`) and the emblem on its brow;
 * The emblem is, first to last: `emblem`, the `element`'s, the outfit's own. `trim` / `emblemColor` override the
 * outfit's colours (a themed item's own trim and glow).
 */
export function tier2Dress(look, outfit2, { chest = true, head = false, element = null, emblem = null, trim = null, emblemColor = null } = {}) {
  const out = clone(look || {});
  if (!outfit2) return out;
  const named = emblem || ELEMENT_EMBLEM[element] || null;
  const e = named || outfit2.top?.emblem || 'star';
  const col = emblemColor || (named ? (ELEMENT_EMBLEM_COLOR[e] || outfit2.top?.emblemColor) : outfit2.top?.emblemColor) || '#ffcf4a';
  if (chest && outfit2.top) {
    out.top = { ...(out.top || {}), color2: trim || outfit2.top.color2 || out.top?.color2, emblem: e, emblemColor: col };
    if (outfit2.decor) out.decor = { ...clone(outfit2.decor), ...(trim ? { color2: trim } : {}) };
  }
  if (head && out.hat && out.hat.id && out.hat.id !== 'none') out.hat = { ...out.hat, color2: trim || outfit2.hat?.color2 || out.hat.color2, emblem: e, emblemColor: col };
  return out;
}

// ---------------------------------------------------------------- the whole class roster (2026-10-22)
//
//   import { loadClassRoster } from '../../avatar-3d/js/class-outfits.js';
//   const roster = await loadClassRoster();   // [{ id, name, game, avatar }] — all 32 classes
//
// For galleries and builders, so a class that exists in only one game still shows up. Emberveil's 30 class looks
// (prototypes/emberveil/data/class-looks.json, shared with Farhold) come first, then the classes that exist only in
// Thousandvale (prototypes/thousandvale/data/rules/classes-tv.json — the Starcaller and the Star Blade), each dressed
// in its tier-1 outfit from data/class-outfits.json. Never throws: a missing file just leaves its classes out.

const titleCase = id => id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const fetchJSON = async url => { try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; } };

export async function loadClassRoster({
  emberveil = new URL('../../prototypes/emberveil/data/class-looks.json', import.meta.url).href,
  thousandvale = new URL('../../prototypes/thousandvale/data/rules/classes-tv.json', import.meta.url).href,
} = {}) {
  const [ev, tv, outfits] = await Promise.all([fetchJSON(emberveil), fetchJSON(thousandvale), loadClassOutfits()]);
  const out = [];
  for (const [id, c] of Object.entries(ev?.classes || {})) out.push({ id, name: c.className || titleCase(id), game: 'shared', avatar: c.avatar });
  for (const c of tv?.classes || []) {
    if (!c?.id || out.some(r => r.id === c.id)) continue;
    out.push({ id: c.id, name: c.name || titleCase(c.id), game: 'thousandvale', avatar: dressAs(c.look || {}, outfits[c.id]) });
  }
  return out;
}
