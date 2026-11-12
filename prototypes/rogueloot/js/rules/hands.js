// WHICH HAND an item goes in (game standards §5b, owner 2026-11-11). Pure. Rule shape copied from Thousandvale's
// js/rules/hands.js. Every reader — the equip rule in the sim, the item card's first line, the compare picker — asks
// this file, and this file asks ONE data field: `hand` on the base row in data/item-bases.json:
//
//   one   "One-handed"      the main hand, or the off hand for a dual-wielder    daggers, swords, axes, maces
//   two   "Two-handed"      the main hand, and the off hand stays free           greatswords, staves, bows…
//                           (a quiver may still sit beside a bow or crossbow; a second two-hander only with the
//                            Doubled Grasp keystone)
//   main  "Main hand only"  the main hand; never the off hand                    wands, sceptres
//   off   "Off hand only"   the off hand; never the main hand                    shields, foci, quivers
//
// Who may dual-wield is data too: the proficiency table's `dualWield` + `dualWieldClasses` (the Rogue Path, the
// Weaponmaster spec), read through items.js profOf. Doubled Grasp is a passive skill with `passive.stat: 'doubleGrip'`.
import { profOf } from './items.js';

export const HAND_TEXT = Object.freeze({ one: 'One-handed', two: 'Two-handed', main: 'Main hand only', off: 'Off hand only' });
/** main-hand slot -> its off hand, and back (the second weapon set has its own pair) */
export const PAIR = Object.freeze({ weapon: 'offhand', offhand: 'weapon', weapon2: 'offhand2', offhand2: 'weapon2' });
const MAINS = new Set(['weapon', 'weapon2']), OFFS = new Set(['offhand', 'offhand2']);
/** an off-hand weapon swings for this share of its damage unless data/balance.json `hero.offHandDamage` says otherwise */
export const OFFHAND_DAMAGE = 0.5;

const baseOf = (data, x) => !x ? null : x.base && typeof x.base === 'string' ? data.bases[x.base] : x;
/** 'one' | 'two' | 'main' | 'off' for something held in a hand; null for anything else (armour, a ring, a potion). */
export function handOf(data, x) {
  const b = baseOf(data, x); if (!b) return null;
  if (b.hand) return b.hand;
  if (b.slot === 'offhand') return 'off';                      // a row written before the field existed
  if (b.slot !== 'weapon') return null;
  return b.hands === 2 ? 'two' : b.offhandOk ? 'one' : 'main';
}
export const handText = (data, x) => HAND_TEXT[handOf(data, x)] || null;
const isQuiver = b => b?.kind === 'quiver';
const pairs = (q, w) => !!(q && w && (q.pairsWith || ['bow', 'crossbow']).some(k => k === w.kind || k === w.class));
const meleeTwo = b => b?.slot === 'weapon' && handOf(null, b) === 'two' && !b.ranged && !['bow', 'crossbow'].includes(b.class);

/** What this character's hands may do: { dualWield, classes (null = any one-hander), doubleGrip }. */
export function gripOf(data, ch, skills = null) {
  const p = profOf(data, ch);
  const doubleGrip = !!skills && Object.entries(ch?.skills || {}).some(([id, r]) => r > 0 && skills[id]?.passive?.stat === 'doubleGrip');
  return { dualWield: !!p.dualWield, classes: p.dualWieldClasses || null, doubleGrip };
}
const canDual = (grip, b) => grip.doubleGrip || (grip.dualWield && (!grip.classes || grip.classes.includes(b.kind) || grip.classes.includes(b.class)));

/** The sentence a refused equip shows because of the HAND, or null when the hand is fine. `equip` = what is worn now. */
export function handRefusal(data, it, slot, equip = {}, grip = { dualWield: false, classes: null, doubleGrip: false }) {
  const b = baseOf(data, it), h = handOf(data, b);
  if (!h || (!MAINS.has(slot) && !OFFS.has(slot))) return null;
  const name = b.name || 'That';
  if (MAINS.has(slot)) return h === 'off' ? `${name} is an off-hand item: it goes in your off hand.` : null;
  // the off hand
  if (h === 'main') return `${name} is a main-hand weapon: it can't go in the off hand.`;
  if (h === 'one' && !canDual(grip, b)) return grip.dualWield ? `You can't dual-wield ${b.kind}s.` : 'Only a dual-wielder can hold a weapon in the off hand.';
  if (h === 'two' && !(grip.doubleGrip && meleeTwo(b))) return grip.doubleGrip ? 'Doubled Grasp holds two melee weapons, not bows or crossbows.' : `${name} needs both hands.`;
  if (isQuiver(b)) { const main = baseOf(data, equip?.[PAIR[slot]]); if (!pairs(b, main)) return 'A quiver goes beside a bow or crossbow: hold one first.'; }
  return null;
}

/** Equipping `it` in `slot`: which slots must be emptied into the bag so the hands agree. */
export function handsBumped(data, it, slot, equip = {}, grip = { doubleGrip: false }) {
  const b = baseOf(data, it), h = handOf(data, b); if (!h || !PAIR[slot]) return [];
  const other = PAIR[slot], o = baseOf(data, equip?.[other]); if (!o) return [];
  if (MAINS.has(slot)) {                                    // a new main hand: does the off hand still fit beside it?
    if (isQuiver(o)) return pairs(o, b) ? [] : [other];
    if (h === 'two') return grip.doubleGrip && meleeTwo(b) && o.slot === 'weapon' ? [] : [other];
    return [];
  }
  // a new off hand next to a two-hander
  if (handOf(data, o) !== 'two') return [];
  if (isQuiver(b) && pairs(b, o)) return [];
  if (grip.doubleGrip && meleeTwo(o) && b.slot === 'weapon') return [];
  return [other];
}

/** Worn slots this item could go in, in compare order (rings 1/2; main/off hand for a dual-wielder). */
export function compareSlots(data, it, grip = { dualWield: false, classes: null, doubleGrip: false }) {
  const b = baseOf(data, it); if (!b) return [];
  if (b.slot === 'ring') return ['ring1', 'ring2'];
  const h = handOf(data, b);
  if (h === 'off') return ['offhand'];
  if (h === 'main') return ['weapon'];
  if (h === 'one') return canDual(grip, b) ? ['weapon', 'offhand'] : ['weapon'];
  if (h === 'two') return grip.doubleGrip && meleeTwo(b) ? ['weapon', 'offhand'] : ['weapon'];
  return b.slot ? [b.slot] : [];
}
/** The slot compared first: an empty one of the choices (a free ring finger, a free off hand), else the first. */
export const firstCompareSlot = (slots, equip = {}) => slots.find(s => !equip?.[s]) || slots[0] || null;
