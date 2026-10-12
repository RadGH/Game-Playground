// CRATES and GIFT BOXES (stream A, play-test 5: T9 "a crate that gives a random item of a specific type with a minimum
// rarity — every starting quest uses it" and T20's gift box in a thank-you letter). Pure.
//
// A crate is an ordinary bag item:  { id:'crate', kind:'crate', type:'crate', name, rarity, crate: { slot, type?, minRarity,
// min?, forClass?, maxLevel?, label? } }.  A gift box is the same thing with kind 'gift' (and `gift: {minRarity, level}`), so
// one opening path serves both. It is opened with `item {op:'use'|'open', uid}`: the crate leaves the bag, what was inside
// arrives, and the client gets `itemR.opened` for its reveal.
//
// THE ROLL is stream C's: `rules.openCrate(e, item)` when the rules have it. Until then (and for the stand-in rules) the
// fallback here re-rolls `rules.rollLoot` until an item meets the crate's minimum rarity and — when it can — its slot.
//
//   crateItem(spec, { name?, level? }) -> item           spec = E's reward.crates entry {slot, min, forClass?} (or C's shape)
//   giftBox({ minRarity?, level?, name? }) -> item
//   isCrate(item) -> bool
//   openCrate(rules, e, item, { rng, safe }) -> [item…]   (never empty: a crate always holds something)

/** Farhold's rarity ladder, lowest first; quest words (E's `min`) map onto it. */
export const RARITY_ORDER = Object.freeze(['normal', 'magic', 'rare', 'legendary', 'unique']);
const WORDS = { common: 'normal', normal: 'normal', uncommon: 'magic', magic: 'magic', rare: 'rare', epic: 'legendary', legendary: 'legendary', set: 'legendary', unique: 'unique' };
export const rarityOf = w => WORDS[String(w || 'normal').toLowerCase()] || 'normal';
export const rarityRank = r => { const k = r === 'set' ? 'legendary' : r; const i = RARITY_ORDER.indexOf(k); return i < 0 ? 0 : i; };
const TIER_FOR = { normal: 'common', magic: 'magic', rare: 'rare', legendary: 'legendary', unique: 'legendary' };
const SLOT_WORD = { back: 'a cloak', waist: 'a belt', light: 'a lantern or torch', weapon: 'a weapon', offhand: 'an off-hand item', head: 'a helm', chest: 'a chest piece', legs: 'leg armour', hands: 'gloves', feet: 'boots', ring: 'a ring', neck: 'an amulet', armor: 'a piece of armour', armour: 'a piece of armour', jewellery: 'a ring or amulet', any: 'an item' };
const SLOT_NAME = { back: 'Cloak', waist: 'Belt', light: 'Light', weapon: 'Weapon', offhand: 'Off-hand', head: 'Helm', chest: 'Chest', legs: 'Legs', hands: 'Gloves', feet: 'Boots', ring: 'Ring', neck: 'Amulet', armor: 'Armour', armour: 'Armour', jewellery: 'Jewellery', any: 'Mixed' };
const RARITY_WORD = { normal: 'common', magic: 'uncommon', rare: 'rare', legendary: 'epic', unique: 'unique' };
const ARMOUR_SLOTS = new Set(['head', 'chest', 'legs', 'hands', 'feet', 'shoulders', 'waist', 'cape', 'back']);

export function isCrate(item) { return !!(item && typeof item === 'object' && (item.kind === 'crate' || item.kind === 'gift' || item.crate || item.gift)); }

export function crateItem(spec = {}, { name = null, level = null } = {}) {
  const slot = String(spec.slot || spec.type || 'any');
  const minRarity = rarityOf(spec.minRarity || spec.min || 'magic');
  const label = spec.label || (SLOT_NAME[slot] || slot) + ' Crate';
  return {
    id: 'crate', kind: 'crate', type: 'crate', name: name || spec.name || label, rarity: minRarity, stack: 1, value: 1,
    desc: 'Open it: ' + (SLOT_WORD[slot] || 'an item') + (spec.forClass || slot === 'weapon' || slot === 'offhand' ? ' your class can use' : '') + ', ' + RARITY_WORD[minRarity] + ' or better.',
    crate: { slot, type: slot, minRarity, min: spec.min || RARITY_WORD[minRarity], forClass: !!(spec.forClass || slot === 'weapon' || slot === 'offhand'), ...(Number.isFinite(spec.maxLevel) ? { maxLevel: spec.maxLevel } : {}), ...(Number.isFinite(level) ? { level } : {}), label },
  };
}

export function giftBox({ minRarity = 'rare', level = null, name = 'Gift Box', desc = null } = {}) {
  const mr = rarityOf(minRarity);
  return { id: 'gift_box', kind: 'gift', type: 'gift', name, rarity: mr, stack: 1, value: 1, desc: desc || 'A gift. Open it: something ' + RARITY_WORD[mr] + ' or better is inside.',
    gift: { minRarity: mr, ...(Number.isFinite(level) ? { level } : {}) }, crate: { slot: 'any', type: 'any', minRarity: mr, label: name } };
}

/** Does `item` belong in a crate of `slot`? */
export function slotFits(item, slot) {
  if (!slot || slot === 'any') return true;
  const s = item.slot || (item.type === 'weapon' ? 'weapon' : null);
  if (slot === 'weapon') return item.type === 'weapon' || s === 'weapon' || s === 'mainhand';
  if (slot === 'offhand') return s === 'offhand' || s === 'offHand' || item.type === 'shield' || item.type === 'focus';
  if (slot === 'armor' || slot === 'armour') return item.type === 'armor' || item.type === 'armour' || ARMOUR_SLOTS.has(s);
  // play-test 5 (C's slots addendum): a cloak (`back`), a belt (`waist`) or a worn light may come out of a jewellery crate too
  if (slot === 'jewellery') return s === 'ring' || s === 'ring1' || s === 'ring2' || s === 'neck' || s === 'necklace' || s === 'amulet' || s === 'back' || s === 'waist' || s === 'light';
  if (slot === 'ring') return s === 'ring' || s === 'ring1' || s === 'ring2';
  if (slot === 'neck') return s === 'neck' || s === 'necklace' || s === 'amulet';
  return s === slot;
}

/**
 * Open a crate / gift box for entity `e`. `safe(fn, ...args)` calls a rules function without throwing.
 * Level: the character's level, never above the crate's `maxLevel` (E: quest level + 3), never below 1.
 */
export function openCrate(rules, e, item, { safe = null, tries = 400 } = {}) {
  const call = safe || ((fn, ...a) => { try { return rules[fn](...a); } catch { return undefined; } });
  const spec = { ...(item.gift || {}), ...(item.crate || {}) };
  const min = rarityOf(spec.minRarity || spec.min || 'magic');
  let level = Math.max(1, e.level || 1);
  if (Number.isFinite(spec.maxLevel)) level = Math.min(level, spec.maxLevel);
  if (Number.isFinite(spec.level) && item.kind === 'gift') level = Math.max(level, Math.min(spec.level, level + 3));
  if (typeof rules.openCrate === 'function') {
    const got = call('openCrate', e, item, { level, minRarity: min, slot: spec.slot || 'any' });
    const list = Array.isArray(got) ? got.filter(Boolean) : got && typeof got === 'object' ? (Array.isArray(got.items) ? got.items : [got.item || got]).filter(x => x && x.name) : [];
    if (list.length) return list;
  }
  let best = null;
  if (typeof rules.rollLoot === 'function') {
    for (let k = 0; k < tries; k++) {
      // the crate's own tier first; a slot that will not come up at that tier is looked for one tier up (still "or better")
      const got = call('rollLoot', e, { level, tier: k < tries / 2 ? (TIER_FOR[min] || 'rare') : (min === 'normal' ? 'magic' : 'rare') }) || [];
      for (const it of got) {
        if (!it || typeof it !== 'object' || rarityRank(it.rarity) < rarityRank(min)) continue;
        if (slotFits(it, spec.slot)) return [it];
        best ||= it;
      }
    }
  }
  if (best) return [best];
  // the stand-in rules have no loot table: a keepsake, so a crate is never empty
  return [{ id: 'crate_keepsake', name: 'Traveller\'s Keepsake', type: 'armor', slot: 'neck', rarity: min, level, value: 5 * level, desc: 'It was at the bottom of the crate.' }];
}
