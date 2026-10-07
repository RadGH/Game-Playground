// Inventory logic with no DOM and no Three.js (play-test P7/P15/P16): slot names, which worn slot an item goes
// in (and the other one it could go in), the required level and whether you can wear it, filters, sorting,
// the compare delta, and the icon key an item's picture is cached under. tests/D/inventory.test.js drives it.

/** The paper doll, Farhold's equipment slots (rpg.js SLOTS) in the order the doll draws them. */
// play-test 5 (C's slots addendum): back (cloak), waist (belt) and light (a worn lantern or torch) are real slots — order as rules.SLOTS
export const DOLL_LEFT = ['head', 'necklace', 'chest', 'back', 'hands'];
export const DOLL_RIGHT = ['waist', 'legs', 'feet', 'ring', 'ring2'];
export const DOLL_BOTTOM = ['weapon', 'offhand', 'light'];
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
/** The Chibi 2 part an armour piece is drawn as: { slot (avatar slot), id, color, color2, frame }. */
export const ARMOUR_PARTS = {
  head: { cloth: ['hood', '#4a4a5a'], light: ['leather_cap', '#7a5a3a'], medium: ['chain_coif', '#a8b0b8'], heavy: ['plate_helm', '#c0c8d0'] },
  chest: { cloth: ['robe', '#5a3a6a', '#d9b477'], light: ['leather', '#7a5034', '#4a3424'], medium: ['chainmail', '#a8b0b8', '#6a2a2a'], heavy: ['plate', '#c8d0d8', '#2f5d9e'] },
  legs: { cloth: ['leggings', '#4a4058'], light: ['pants', '#6a4a30'], medium: ['greaves', '#a0a8b0'], heavy: ['greaves', '#c8d0d8'] },
  feet: { cloth: ['slippers', '#5a4a6a'], light: ['boots', '#5a4232'], medium: ['boots', '#7a7f88'], heavy: ['heavy', '#b8bec8'] },
  hands: { cloth: ['rune_bracers', '#6a5a7a'], light: ['rune_bracers', '#7a5a3a'], medium: ['rune_bracers', '#a0a8b0'], heavy: ['rune_bracers', '#c8d0d8'] },
};
const AVATAR_SLOT = { head: 'hat', chest: 'top', legs: 'bottom', feet: 'shoes', hands: 'decor' };
const FRAME = { head: 'bust', chest: 'torso', legs: 'legs', feet: 'feet', hands: 'hands' };
const RARE_TINT = { rare: '#e8d020', legendary: '#ffb040', unique: '#ffb040', set: '#63e07a' };

/**
 * How an item's icon is made, as plain data: { kind: 'held'|'offhand'|'armour'|'glyph', … } plus `key`, the
 * cache key (identical pictures share one key, so a bag of 40 swords renders one sword). `looks` are Farhold's
 * heldLookFor/offhandLookFor (optional; without them a plain mapping is used).
 */
export function iconSpec(item, { held = null, offhand = null } = {}) {
  if (!item) return null;
  const s = slotOf(item), r = rarityOf(item);
  let spec;
  if (item.type === 'weapon' || s === 'weapon') {
    const L = held ? held(item) : { id: PLAIN_HELD[item.subtype || item.baseKey] || 'fh_sword', color: '#b9c2cc', quality: RARITY_RANK[r] > 1 ? 2 : 0 };
    if (L.id === 'book' || L.id === 'orb') spec = { kind: 'offhand', id: L.id, color: L.color || '#5a2a2a' };
    else spec = { kind: 'held', id: L.id || 'fh_sword', color: L.color || '#b9c2cc', quality: L.quality ?? 0 };
  } else if (s === 'offhand') {
    const L = offhand ? offhand(item) : { id: item.isShield ? 'fh_heater_shield' : /quiver/.test(item.baseKey || '') ? 'quiver' : 'book', color: '#8d97a3' };
    spec = L.id && L.id !== 'none' ? { kind: 'offhand', id: L.id, color: L.color || '#8d97a3', quality: L.quality ?? 0 } : { kind: 'glyph', id: 'focus', color: '#8fd0ff' };
  } else if (ARMOUR_PARTS[s]) {
    const tier = armourTier(item), [id, color, color2] = ARMOUR_PARTS[s][tier];
    spec = { kind: 'armour', slot: AVATAR_SLOT[s], frame: FRAME[s], id, color: RARE_TINT[r] && s !== 'legs' ? mixHex(color, RARE_TINT[r], 0.25) : color, color2: color2 || null };
  } else if (s === 'ring' || s === 'ring2') spec = { kind: 'glyph', id: 'ring', color: RARE_TINT[r] || '#d0a040' };
  else if (s === 'necklace') spec = { kind: 'glyph', id: 'amulet', color: RARE_TINT[r] || '#3a8ad8' };
  else if (/potion|draught|elixir|tonic/i.test(item.name || '') || item.kind === 'potion') spec = { kind: 'glyph', id: 'potion', color: '#d83838' };
  else spec = { kind: 'glyph', id: item.kind === 'junk' ? 'junk' : 'bundle', color: '#a08060' };
  spec.key = [spec.kind, spec.slot || '', spec.id, spec.color, spec.color2 || '', spec.quality ?? ''].join('|');
  return spec;
}
const PLAIN_HELD = { dagger: 'fh_daggers', sword: 'fh_sword', longsword: 'fh_longsword', greatsword: 'fh_greatsword', sword2h: 'fh_greatsword', axe2h: 'fh_greataxe', axe: 'fh_axe', battleaxe: 'fh_axe', mace: 'fh_mace', hammer: 'fh_hammer', warhammer: 'fh_maul', spear: 'fh_spear', halberd: 'fh_halberd', javelin: 'fh_javelin', staff: 'staff_orb', quarterstaff: 'fh_quarterstaff', wand: 'fh_wand', scepter: 'fh_scepter', bow: 'bow', shortbow: 'bow', crossbow: 'crossbow', tome: 'book', orb: 'orb' };
export function mixHex(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
