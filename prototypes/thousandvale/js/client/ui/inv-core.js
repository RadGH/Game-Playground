// Inventory logic with no DOM and no Three.js (play-test P7/P15/P16): slot names, which worn slot an item goes
// in (and the other one it could go in), the required level and whether you can wear it, filters, sorting,
// the compare delta, and the icon key an item's picture is cached under. tests/D/inventory.test.js drives it.

/** The paper doll, Farhold's equipment slots (rpg.js SLOTS) in the order the doll draws them. */
// play-test 5 (C's slots addendum): back (cloak — or a backpack, W19) and waist (belt) are real slots — order as rules.SLOTS
export const DOLL_LEFT = ['head', 'necklace', 'chest', 'back', 'hands'];
export const DOLL_RIGHT = ['waist', 'legs', 'feet', 'ring', 'ring2'];
export const DOLL_BOTTOM = ['weapon', 'offhand'];          // play-test 8 (W22): light items left the game — there is no Light slot
export const DOLL_EXTRA = ['mount', 'tool'];        // drawn only when something is worn there
export const DOLL_SLOTS = [...DOLL_LEFT, ...DOLL_RIGHT, ...DOLL_BOTTOM];

export const SLOT_NAME = {
  head: 'Head', chest: 'Chest', legs: 'Legs', feet: 'Feet', hands: 'Hands', weapon: 'Main hand', mainhand: 'Main hand', offhand: 'Off hand',
  necklace: 'Neck', neck: 'Neck', ring: 'Ring', ring1: 'Ring', ring2: 'Ring', shield: 'Off hand', mount: 'Mount', light: 'Light', tool: 'Tool', back: 'Back', waist: 'Waist', cape: 'Back', belt: 'Waist',
};
export const ALT_SLOT = { weapon: 'offhand', offhand: 'weapon', ring: 'ring2', ring2: 'ring' };
/** Farhold's ladder plus the extras the generator stamps on. Higher = rarer. */
export const RARITY_RANK = { junk: -1, common: 0, normal: 0, magic: 1, uncommon: 1, rare: 2, epic: 3, set: 3, legendary: 4, unique: 4 };
export const RARITY_NAME = { normal: 'Common', common: 'Common', magic: 'Magic', uncommon: 'Magic', rare: 'Rare', epic: 'Epic', set: 'Set', legendary: 'Legendary', unique: 'Unique', junk: 'Junk' };
export const rarityOf = it => (it?.setId ? 'set' : it?.rarity || 'normal');

/** The worn slot an item belongs in (weapons -> weapon, ring1 -> ring). Null for things you cannot wear. */
export function slotOf(item) {
  if (!item) return null;
  if (item.hand === 'off') return 'offhand';                     // play-test 10 (Y16): the rules' hand wins — an orb is an off-hand item whatever its type says
  if (item.type === 'weapon') return 'weapon';
  const s = item.slot || null;
  if (s === 'ring1') return 'ring';
  if (s === 'mainhand') return 'weapon';
  if (s === 'neck') return 'necklace';
  if (s === 'cape' || s === 'cloak') return 'back';
  if (s === 'belt') return 'waist';
  return s;
}
/** The other slot it could go in: a one-handed weapon in the off hand, a ring on the other hand. */
export function altSlotOf(item) {
  const s = slotOf(item), alt = ALT_SLOT[s];
  if (!alt) return null;
  if (s === 'weapon' && item.hand) return item.hand === 'one' ? alt : null;      // Y16: only a One-hand weapon fits either hand
  if (s === 'weapon' && (item.twoHanded || !item.offHandOk)) return null;
  if (s === 'offhand') return null;                              // shields/foci stay in the off hand
  return alt;
}

/** What level it takes to wear this (Farhold rpg.levelRequirement, minus the wearer part the server owns). */
export function requiredLevel(item, worn = null) {
  if (!item) return 1;
  const base = item.levelReq ?? item.reqLevel ?? (item.ilvl ? Math.max(1, Math.round(item.ilvl * 0.85)) : (item.level ?? 1));
  let off = 0;
  for (const a of item.affixes || []) if (a.stat === 'cond_levelReqReduce') off += a.value || 0;
  for (const w of Object.values(worn || {})) if (w && w !== item) for (const a of w.affixes || []) if (a.stat === 'cond_levelReqReduce') off += a.value || 0;
  return Math.max(1, Math.round(base - off));
}
/** { level, ok, reduced } — `ok` false = draw the requirement red. */
export function levelCheck(item, myLevel, worn = null) {
  const level = requiredLevel(item, worn), base = item?.levelReq ?? level;
  return { level, ok: (myLevel || 1) >= level, reduced: level < base };
}

// ---- filters ----
export const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'weapon', label: 'Weapons' },
  { id: 'armour', label: 'Armour' },
  { id: 'jewel', label: 'Jewellery' },
  { id: 'up', label: 'Upgrades' },
  { id: 'other', label: 'Other' },
];
export function filterGroup(item) {
  const s = slotOf(item);
  if (!s) return 'other';
  if (s === 'weapon' || (s === 'offhand' && item.type === 'weapon')) return 'weapon';
  if (s === 'ring' || s === 'ring2' || s === 'necklace') return 'jewel';
  if (['head', 'chest', 'legs', 'hands', 'feet', 'offhand', 'back', 'waist'].includes(s)) return 'armour';
  return 'other';
}

// ---- compare ----
/**
 * A score for "is this better" when Farhold's itemScore is not loaded: weapon damage, armour, and every rolled
 * number. The real game passes rpg.js itemScore in.
 */
export function plainScore(item) {
  if (!item) return 0;
  let s = 0;
  if (item.dmg) s += (item.dmg[0] + item.dmg[1]) / 2 * 3;
  if (item.armor) s += item.armor * 2;
  for (const a of item.affixes || []) if (!String(a.stat || '').startsWith('cond_')) s += Math.abs(a.value || 0) < 1 ? (a.value || 0) * 100 : (a.value || 0);
  return Math.round(s);
}
/** Against what you wear in its slot (or the alternate slot): { slot, worn, delta } — delta null when nothing is worn. */
export function compareTo(item, equipment, { score = plainScore, alt = false } = {}) {
  const main = slotOf(item); if (!main) return { slot: null, worn: null, delta: null };
  const slot = alt && altSlotOf(item) ? altSlotOf(item) : main;
  const worn = (equipment || {})[slot] || null;
  return { slot, worn, delta: worn ? score(item) - score(worn) : null };
}
/** True when wearing it would be an upgrade you can actually wear now. */
export function isUpgrade(item, equipment, myLevel, score = plainScore) {
  if (!slotOf(item) || !levelCheck(item, myLevel, equipment).ok) return false;
  if (slotOf(item) === 'offhand' && equipment?.weapon?.twoHanded) return false;      // a two-hander fills both hands
  const c = compareTo(item, equipment, { score });
  // the other slot counts for a second ring, and for an off-hand weapon you already carry — never an empty off
  // hand (that would flag every one-handed sword as an upgrade) or beside a two-hander
  let c2 = altSlotOf(item) ? compareTo(item, equipment, { score, alt: true }) : null;
  if (c2 && c2.slot === 'offhand' && (!c2.worn || equipment?.weapon?.twoHanded)) c2 = null;
  const best = [c, c2].filter(Boolean).map(x => (x.worn ? x.delta : score(item) > 0 ? 1 : 0));
  return Math.max(...best) > 0;
}

// ---- sorting ----
export const SORTS = [
  { id: 'new', label: 'Newest' },
  { id: 'best', label: 'Best first' },
  { id: 'rarity', label: 'Rarity' },
  { id: 'slot', label: 'Slot' },
  { id: 'level', label: 'Level' },
  { id: 'name', label: 'Name' },
];
const SLOT_ORDER = ['weapon', 'offhand', 'head', 'chest', 'back', 'hands', 'waist', 'legs', 'feet', 'necklace', 'ring', 'ring2', 'light', 'mount', 'tool', null];
/** Filter + sort a bag (never mutates). `order` is each item's position in the server's bag (newest = last). */
export function viewBag(bag, { filter = 'all', sort = 'new', equipment = {}, level = 1, score = plainScore, search = '' } = {}) {
  const q = String(search || '').trim().toLowerCase();
  const idx = new Map((bag || []).map((it, i) => [it, i]));
  let list = (bag || []).filter(it => {
    if (q && !String(it.name || '').toLowerCase().includes(q)) return false;
    if (filter === 'all') return true;
    if (filter === 'up') return isUpgrade(it, equipment, level, score);
    return filterGroup(it) === filter;
  });
  const by = {
    new: (a, b) => idx.get(b) - idx.get(a),
    best: (a, b) => score(b) - score(a),
    rarity: (a, b) => (RARITY_RANK[rarityOf(b)] ?? 0) - (RARITY_RANK[rarityOf(a)] ?? 0) || score(b) - score(a),
    slot: (a, b) => SLOT_ORDER.indexOf(slotOf(a)) - SLOT_ORDER.indexOf(slotOf(b)) || score(b) - score(a),
    level: (a, b) => requiredLevel(b) - requiredLevel(a) || score(b) - score(a),
    name: (a, b) => String(a.name || '').localeCompare(String(b.name || '')),
  }[sort] || (() => 0);
  list = list.slice().sort((a, b) => by(a, b) || idx.get(a) - idx.get(b));
  return list;
}

// ---- icons ----
/** Armour tier from the base: cloth / light / medium / heavy (Emberveil armorBases `tier`, else guessed from the name). */
export function armourTier(item) {
  if (item.tier && ['cloth', 'light', 'medium', 'heavy'].includes(item.tier)) return item.tier;
  const n = `${item.baseKey || ''} ${item.baseName || ''} ${item.name || ''}`.toLowerCase();
  if (/plate|war helm|runed|wyrm|dragonsteel|dragonclaw|sabaton|great helm/.test(n)) return 'heavy';
  if (/chain|scale|coif|dragonhide/.test(n)) return 'medium';
  if (/leather|cap|hide/.test(n)) return 'light';
  if (/robe|linen|hood|cloth|silk/.test(n)) return 'cloth';
  return 'light';
}
// Play-test 8 (W25, report #46): AN ITEM'S ICON IS A PICTURE OF THE MODEL IT DRAWS WHEN WORN. There is no table of
// "icon parts" here any more — the old one gave a War Helm a knight's helm while the body wore a horned dome. The icon's
// part comes from the same function the bodies in the world are dressed with: gear-look.js `wornPart(item, slot, opts)`
// (D-world's; = gearLook({[slot]: item}, opts)). ui/item-icons.js passes the game's own options (looks.js gearOpts);
// with none (node tests) the plain tables answer, exactly as a body built without the catalog would look.
import { wornPart as wornPartOf } from '../gear-look.js';
import { itemArtKey } from '../../../../../icons/js/game-icons.js';

/** Which part of the body an armour icon frames. */
const FRAME = { head: 'bust', chest: 'torso', legs: 'legs', feet: 'feet', hands: 'hands', back: 'back', waist: 'waist', necklace: 'neck', ring: 'ring', ring2: 'ring' };
const RARE_TINT = { rare: '#e8d020', legendary: '#ffb040', unique: '#ffb040', set: '#63e07a' };
const empty = p => !p || !p.id || p.id === 'none';

/**
 * How an item's icon is made, as plain data, plus `key`, the cache key (identical pictures share one key, so a bag of 40
 * swords renders one sword):
 *   { kind: 'held' | 'offhand', id, color, quality, part }      a weapon / shield / focus, built on its own
 *   { kind: 'worn', slot, frame, id, parts }                     armour, a cloak, a pack, a belt…: a plain body wearing exactly `parts`
 *   { kind: 'art', id }                                          a drawn picture (icons/js/game-icons.js): potions, food, goods, materials, fish…
 *   { kind: 'glyph', id, color }                                 a ring the catalog does not draw (its own colours), or anything left over
 * `worn(item, slot)` -> gear-look.js wornPart's answer `{ partSlot, part, parts }`.
 */
export function iconSpec(item, { worn = wornPartOf } = {}) {
  if (!item) return null;
  const s = slotOf(item), r = rarityOf(item);
  const drawn = s && (s === 'weapon' || s === 'offhand' || FRAME[s]);
  let w = null;
  if (drawn) { try { w = worn(item, s === 'ring2' ? 'ring' : s); } catch { w = null; } }
  let spec = null;
  // play-test 10 (Y6, report #28: "ring icons look bad — show the ring itself, not a ring on a hand"): a ring's picture is
  // the LOOP, drawn from the same colours its model wears (band `color`, stone `color2`); the close-up of a fist is gone
  if (s === 'ring' || s === 'ring2') {
    const rp = (w && (w.part?.ring || w.parts?.accessory?.ring || w.part)) || {};
    const hex = v => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
    spec = { kind: 'glyph', id: 'ring', color: hex(rp.color) || '#d8b040', color2: hex(rp.color2) || RARE_TINT[r] || '#9fe0ff', style: rp.id || 'band' };
  } else
  if (w && !empty(w.part)) {
    const part = w.part;
    if (w.partSlot === 'held') spec = { kind: 'held', id: part.id, color: part.color || '#b9c2cc', quality: part.quality ?? 0, part };
    else if (w.partSlot === 'offhand') spec = { kind: 'offhand', id: part.id, color: part.color || '#8d97a3', quality: part.quality ?? 0, part };
    else spec = { kind: 'worn', slot: w.partSlot, frame: FRAME[s] || 'torso', id: part.id, parts: w.parts };
  }
  // 2026-10-14 (owner: "update all other icons… redo all existing programmer art"): everything that is not a 3D model —
  // potions (a mana potion is BLUE), food, goods, tools, materials, fish, crates, junk — is a drawn picture from the icon
  // library (icons/js/game-icons.js), looked up by the item's id, then what it is
  if (!spec) {
    const art = s === 'necklace' ? 'amulet' : s === 'offhand' ? 'focus' : itemArtKey(item);
    if (art) spec = { kind: 'art', id: art };
  }
  if (!spec) {
    if (s === 'necklace') spec = { kind: 'glyph', id: 'amulet', color: RARE_TINT[r] || '#3a8ad8' };
    else if (s === 'offhand') spec = { kind: 'glyph', id: 'focus', color: '#8fd0ff' };
    else if (/potion|draught|elixir|tonic/i.test(item.name || '') || item.kind === 'potion') spec = { kind: 'glyph', id: 'potion', color: '#d83838' };
    else spec = { kind: 'glyph', id: item.kind === 'junk' ? 'junk' : 'bundle', color: item.kind === 'material' && /^#[0-9a-f]{6}$/i.test(item.tint || '') ? item.tint : '#a08060' };   // W9 (P-client): a material's icon takes the material's own colour
  }
  spec.key = spec.kind === 'worn' ? `worn|${spec.frame}|${JSON.stringify(spec.parts)}` : spec.kind === 'art' ? `art|${spec.id}` : spec.kind === 'glyph' ? `glyph|${spec.id}|${spec.color}${spec.color2 ? '|' + spec.color2 + '|r2' : ''}` : `${spec.kind}|${JSON.stringify(spec.part)}`;
  return spec;
}
export function mixHex(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
