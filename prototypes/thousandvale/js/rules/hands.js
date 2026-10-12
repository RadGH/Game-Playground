// Thousandvale — WHICH HAND an item goes in (owner feedback 10, Y16; reports #31 #32). Pure.
//
//   "Even though it says 'Common Main Hand' it can be equipped in the off hand slot." "I can also equip two main hand
//    orbs." "We should differentiate 'Main hand' and 'Off hand' being exclusive to just one slot, and 'One-hand' allows
//    equipping in either slot (or both). Orbs were meant to be stat sticks… remove their attack and separate off-hand
//    caster implements (that modify your default attack) and keep wands / tomes as the attacking weapon."
//
// Farhold only knows one- and two-handed (`item.hands` 1 | 2) and lets any one-hander into either hand. Thousandvale
// names FOUR, and every reader — the equip rule, the saved-gear check, the card, the kits — asks this file:
//
//   main  "Main hand"   the weapon slot only            tomes; a one-handed bow / crossbow / javelin
//   off   "Off hand"    the off-hand slot only          orbs, foci, shields, quivers
//   one   "One-hand"    either hand, or one in each     wands, sceptres, one-handed melee weapons
//   two   "Two-hand"    the weapon slot, both hands     staves, two-handed weapons, bows (a second one only with Doubled Grasp)
//
// An ORB is a weapon-type item in the shared table (it has a damage roll). Here it is an implement: it is never
// swung (`item.noAttack`), it sits in the off hand, and its damage roll is not an attack of its own.

export const HAND_TEXT = Object.freeze({ main: 'Main hand', off: 'Off hand', one: 'One-hand', two: 'Two-hand' });
const SUB = item => item?.subtype || item?.baseKey || '';

/** Is this an orb (a weapon-type caster implement that never attacks)? */
export const isOrb = item => !!item && item.type === 'weapon' && (item.subtype === 'orb' || item.baseKey === 'orb');
/** Is this a tome (a main-hand caster weapon)? */
export const isTome = item => !!item && item.type === 'weapon' && (item.subtype === 'tome' || item.baseKey === 'tome');

/** 'main' | 'off' | 'one' | 'two' for something held in a hand; null for anything else (armour, a ring, a crate). */
export function handOf(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.type === 'weapon') {
    if (isOrb(item)) return 'off';
    if (item.twoHanded) return 'two';
    if (isTome(item)) return 'main';
    if (item.ranged && item.weaponCategory !== 'magic') return 'main';       // a thing you draw or throw needs the other hand free
    return 'one';
  }
  if (item.slot === 'offhand' || item.subtype === 'offhand' || item.isShield || item.isMagicShield || SUB(item) === 'quiver') return 'off';
  return null;
}
export const handText = item => HAND_TEXT[handOf(item)] || null;

/** May `item` sit in `slot` ('weapon' | 'offhand')? `doubleGrip` = the Doubled Grasp keystone (a second two-hander). */
export function fitsHand(item, slot, { doubleGrip = false } = {}) {
  const h = handOf(item);
  if (!h) return slot !== 'weapon' && slot !== 'offhand';
  if (slot === 'weapon') return h === 'main' || h === 'one' || h === 'two';
  if (slot === 'offhand') return h === 'off' || h === 'one' || (h === 'two' && doubleGrip);
  return false;
}

/** The sentence a refused equip shows, or null when the hand is fine. Two-handers are Farhold's own rule (its sentence). */
export function handRefusal(item, slot, opts = {}) {
  if (slot !== 'weapon' && slot !== 'offhand') return null;
  const h = handOf(item);
  if (!h || h === 'two' || fitsHand(item, slot, opts)) return null;
  const name = item.name || 'That';
  if (h === 'main') return `${name} is a main-hand weapon — it cannot go in the off hand.`;
  if (h === 'off') return isOrb(item)
    ? `${name} is an off-hand implement — it has no attack of its own and cannot be your weapon.`
    : `${name} is an off-hand item — it cannot go in your main hand.`;
  return `${name} will not go in that hand.`;
}

/** The slot an item with no slot asked for goes to: 'offhand' for an off-hand item, 'weapon' for a main-hand one, null = Farhold decides. */
export const autoSlot = item => { const h = handOf(item); return h === 'off' ? 'offhand' : h === 'main' ? 'weapon' : null; };

/**
 * Write the hand onto an item (`hand`, `handText`, and `noAttack` for an orb) so every card reads the same words.
 * Farhold's numeric `hands` (1 | 2) and `offHandOk` are corrected to agree: a main-hand or off-hand-only item is not
 * `offHandOk` the way Farhold means it (a weapon that swings from the off hand).
 */
export function stampHand(item) {
  const h = handOf(item);
  if (!h) return item;
  item.hand = h;
  item.handText = HAND_TEXT[h];
  if (item.type === 'weapon') {
    if (h === 'main') item.offHandOk = false;
    if (isOrb(item)) { item.noAttack = true; item.implement = true; }
  }
  return item;
}

/**
 * A saved pair of hands, checked: returns `{ weapon, offhand, moved: [{ item, from, to }] }` where `to` is 'weapon' |
 * 'offhand' (it went to the other hand, which was empty and takes it) or 'bag'. Nothing is ever dropped.
 */
export function settleHands(weapon, offhand, opts = {}) {
  const moved = [];
  let w = weapon || null, o = offhand || null;
  const wBad = w && !fitsHand(w, 'weapon', opts), oBad = o && !fitsHand(o, 'offhand', opts);
  if (wBad && !o && fitsHand(w, 'offhand', opts)) { moved.push({ item: w, from: 'weapon', to: 'offhand' }); o = w; w = null; }
  else if (wBad) { moved.push({ item: w, from: 'weapon', to: 'bag' }); w = null; }
  if (oBad && !w && fitsHand(o, 'weapon', opts)) { moved.push({ item: o, from: 'offhand', to: 'weapon' }); w = o; o = null; }
  else if (oBad) { moved.push({ item: o, from: 'offhand', to: 'bag' }); o = null; }
  return { weapon: w, offhand: o, moved };
}
