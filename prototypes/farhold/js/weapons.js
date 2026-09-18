// Farhold — what each weapon actually does when you swing it.
//
// Before this, every melee weapon was one swipe with the same reach and the same arc, and the only
// difference between a dagger and a greatsword was a damage number. The play-test asked for four
// things, and they are all the same system:
//
//   "I would like to implement dual wielding, available to all classes, as well as 2-handed weapons
//    (2h sword, 2h axe, polearm, etc). 2-handed weapons should block your off hand slot when
//    equipped and should have a different attack animation for every class of weapon, and have a
//    wider reach and sweep area. When dual wielding, you should be able to attack with each weapon
//    on separate cooldowns."
//
//   "I would also like to make all melee weapons more interesting and give each type of weapon a
//    different attack pattern. A longsword would slash repeatedly, a rapier would thrust, and a
//    saber could do slash slash thrust… the attack pattern should be indicated on the weapon using
//    some type of glyphs. Daggers would have a narrow attack range but make up for it in speed."
//
//   "Update staves to also have their own elements, like wands, but replace the auto attacks with a
//    close range spell… Update wands so each one also has a projectile effect, area, chain/bounce,
//    explosion, multi-shot, etc."
//
//   "There should be an increased area of effect for melee and ranged attacks (ranged includes
//    spells) or just total area affecting both."
//
// **A weapon is a PATTERN, not a number.** Every melee base maps to a short sequence of strikes —
// a slash, a thrust, an overhead, a sweep — each with its own reach, arc, damage share and timing.
// You walk the sequence as you keep attacking, and it resets when you stop. A longsword is
// slash-slash-slash; a rapier is thrust-thrust; a sabre is slash-slash-thrust; a greatsword is a
// wide sweep and then a slow overhead that hits everything in front of you.
//
// That single idea covers all four asks: dual wielding is two patterns on two clocks, a two-hander
// is a pattern with a wider arc and a longer reach, a staff is a pattern whose strikes are spells,
// and the area-of-effect stat scales every strike's reach and arc together.
//
// Pure data and arithmetic — no DOM, no Three.js — so the node tests drive the real thing.

// ---------------------------------------------------------------------------- strike shapes

/**
 * The four shapes a melee strike can take. `reach` and `arc` multiply the weapon's own numbers;
 * `damage` is the share of a full hit; `wind` is how long the swing takes before it lands.
 *
 * `glyph` is what the item card draws, so a player can read a weapon's rhythm without equipping it.
 */
export const STRIKES = {
  slash: { key: 'slash', name: 'Slash', glyph: '⟋', reach: 1, arc: 1, damage: 1, wind: 1, splash: 1 },
  thrust: { key: 'thrust', name: 'Thrust', glyph: '⟶', reach: 1.45, arc: 0.4, damage: 1.15, wind: 0.9, splash: 0.5 },
  sweep: { key: 'sweep', name: 'Sweep', glyph: '◡', reach: 1.1, arc: 1.9, damage: 0.9, wind: 1.15, splash: 1.6 },
  overhead: { key: 'overhead', name: 'Overhead', glyph: '⟱', reach: 1.15, arc: 0.8, damage: 1.7, wind: 1.6, splash: 1.3 },
  jab: { key: 'jab', name: 'Jab', glyph: '·', reach: 0.75, arc: 0.55, damage: 0.65, wind: 0.5, splash: 0.3 },
  cleave: { key: 'cleave', name: 'Cleave', glyph: '⤬', reach: 1.25, arc: 1.5, damage: 1.35, wind: 1.35, splash: 1.8 },
};

export const STRIKE_KEYS = Object.keys(STRIKES);

// ---------------------------------------------------------------------------- weapon patterns

/**
 * The rhythm of every melee weapon, by base key.
 *
 * `pattern` is the sequence of strike shapes, walked one per swing and reset when you stop.
 * `reach` and `arc` are the weapon's own, in metres and radians, before the pattern scales them.
 * `every` is seconds between swings before haste.
 *
 * A dagger is fast and short; a greatsword is slow, wide and long. That trade is the whole point —
 * "daggers would have a narrow attack range but make up for it in speed".
 */
export const WEAPON_PATTERNS = {
  // ---- light, one-handed
  dagger: { pattern: ['jab', 'jab', 'slash'], reach: 1.9, arc: 1.1, every: 0.34, name: 'Dagger' },
  rapier: { pattern: ['thrust', 'thrust'], reach: 3.3, arc: 0.7, every: 0.52, name: 'Rapier' },
  spear: { pattern: ['thrust', 'thrust', 'sweep'], reach: 3.9, arc: 0.8, every: 0.66, name: 'Spear' },
  scimitar: { pattern: ['slash', 'slash', 'thrust'], reach: 2.6, arc: 1.5, every: 0.46, name: 'Sabre' },

  // ---- heavy, one-handed
  sword: { pattern: ['slash', 'slash', 'slash'], reach: 2.7, arc: 1.4, every: 0.58, name: 'Sword' },
  longsword: { pattern: ['slash', 'slash', 'overhead'], reach: 3.0, arc: 1.5, every: 0.64, name: 'Longsword' },
  axe: { pattern: ['cleave', 'slash'], reach: 2.6, arc: 1.3, every: 0.7, name: 'Axe' },
  mace: { pattern: ['overhead', 'slash'], reach: 2.4, arc: 1.1, every: 0.74, name: 'Mace' },
  hammer: { pattern: ['overhead', 'sweep'], reach: 2.5, arc: 1.2, every: 0.82, name: 'Hammer' },
  warhammer: { pattern: ['overhead', 'overhead'], reach: 2.6, arc: 1.1, every: 0.94, name: 'Warhammer' },
  battleaxe: { pattern: ['cleave', 'cleave', 'overhead'], reach: 2.8, arc: 1.5, every: 0.86, name: 'Battleaxe' },

  // ---- two-handed. Wider, longer, slower — and they take the off hand with them.
  sword2h: { pattern: ['sweep', 'sweep', 'overhead'], reach: 3.8, arc: 2.0, every: 0.92, name: 'Two-handed Sword' },
  greatsword: { pattern: ['sweep', 'overhead', 'sweep'], reach: 4.1, arc: 2.1, every: 1.02, name: 'Greatsword' },
  axe2h: { pattern: ['cleave', 'cleave', 'overhead'], reach: 3.6, arc: 1.9, every: 1.0, name: 'Two-handed Axe' },
  halberd: { pattern: ['thrust', 'sweep', 'overhead'], reach: 4.6, arc: 1.7, every: 1.06, name: 'Halberd' },
  quarterstaff: { pattern: ['jab', 'sweep', 'jab', 'sweep'], reach: 3.4, arc: 1.6, every: 0.5, name: 'Quarterstaff' },
};

/** Anything not named above falls back on its category. */
export const CATEGORY_PATTERNS = {
  light: { pattern: ['slash', 'thrust'], reach: 2.4, arc: 1.2, every: 0.46 },
  heavy: { pattern: ['slash', 'overhead'], reach: 2.8, arc: 1.4, every: 0.68 },
  magic: { pattern: ['jab', 'slash'], reach: 2.2, arc: 1.1, every: 0.6 },
};

const TWO_HANDED_SCALE = { reach: 1.18, arc: 1.25, damage: 1.25, every: 1.2 };

/**
 * Everything about how a weapon swings: the pattern, the reach, the arc, the clock.
 *
 * Reads the base key first, then the subtype, then the category — so the twenty-odd road weapons and
 * uniques all get a sensible rhythm from the family they belong to without a row each.
 */
export function profileOf(item) {
  if (!item) {
    return { ...CATEGORY_PATTERNS.light, pattern: ['jab'], name: 'Fists', unarmed: true, twoHanded: false, ranged: false };
  }
  const key = item.baseKey || '';
  const named = WEAPON_PATTERNS[key]
    || WEAPON_PATTERNS[item.subtype]
    // a road weapon called `obsidian_scimitar` should swing like a scimitar
    || Object.entries(WEAPON_PATTERNS).find(([k]) => key.endsWith('_' + k))?.[1]
    || CATEGORY_PATTERNS[item.weaponCategory] || CATEGORY_PATTERNS.heavy;
  const two = !!item.twoHanded;
  return {
    ...named,
    name: named.name || item.subtype || 'Weapon',
    reach: named.reach * (two && !WEAPON_PATTERNS[key] ? TWO_HANDED_SCALE.reach : 1),
    arc: named.arc * (two && !WEAPON_PATTERNS[key] ? TWO_HANDED_SCALE.arc : 1),
    every: named.every * (two && !WEAPON_PATTERNS[key] ? TWO_HANDED_SCALE.every : 1),
    twoHanded: two,
    ranged: !!item.ranged,
    magic: item.weaponCategory === 'magic',
  };
}

/** The glyph row a card draws: one per strike in the pattern. */
export function patternGlyphs(item) {
  const p = profileOf(item);
  return p.pattern.map(k => STRIKES[k]?.glyph || '·').join(' ');
}

/**
 * HOW MANY HANDS, and whether the other one is free.
 *
 * "It is not clear which weapons are one- or two-handed." `items.json` says `twoHanded` and nothing
 * else, and only the four caster bases carry `offHandOk` — so a one-handed sword read as neither
 * one thing nor the other, and the off hand refused it. The rule here is the obvious one: a melee
 * weapon that is not two-handed takes one hand, and anything that takes one hand can go in either.
 *
 * A BOW IS NOT A ONE-HANDER even when the data forgets to say so: you cannot draw one with a sword
 * in the other hand, which is why `ranged` is checked before anything else.
 */
export function oneHanded(item) {
  if (!item || item.type !== 'weapon') return false;
  if (item.twoHanded || item.ranged) return false;
  return true;
}

/** Can this go in the off hand at all, ignoring what is currently in the main one? */
export function canGoOffhand(item) {
  if (!item) return false;
  if (item.type !== 'weapon') return true;             // shields, quivers, tomes — held, not swung
  return oneHanded(item);
}

/**
 * Write the handedness onto the item.
 *
 * `offHandOk` is the flag `js/hud.js` and Emberveil both already read, so setting it on the ITEM
 * (never in the shared `items.json`) is what makes the interface offer the off hand for a sword.
 * `hands` is for anything that wants to print it.
 */
export function markHands(item) {
  if (!item || item.type !== 'weapon') return item;
  item.hands = item.twoHanded ? 2 : 1;
  if (oneHanded(item)) item.offHandOk = true;
  return item;
}

/** "One-handed sword" / "Two-handed — it takes the off hand with it". */
export function handedText(item) {
  if (!item || item.type !== 'weapon') return '';
  const p = profileOf(item);
  if (item.twoHanded) return `Two-handed ${p.name.toLowerCase()} — it takes both hands`;
  if (item.ranged) return `Two-handed ${p.name?.toLowerCase() || 'bow'} — it takes both hands`;
  return `One-handed ${p.name.toLowerCase()} — it can go in either hand`;
}

/**
 * …and the same in words, for the hover card.
 *
 * The handedness leads, because that is the thing a player has to know BEFORE the rhythm: the card
 * used to print a rapier's two arrows and its reach and never once say whether the shield could
 * stay on.
 */
export function patternText(item) {
  const p = profileOf(item);
  const names = p.pattern.map(k => STRIKES[k]?.name || k);
  return `${handedText(item)}. ${names.join(', then ')} — ${p.reach.toFixed(1)} m reach, `
    + `a swing every ${p.every.toFixed(2)}s`;
}

/**
 * The strike that comes next.
 *
 * `step` is how many swings into the sequence you are; it lives on the controller's hand and resets
 * when you stop attacking, which is what makes a combo a combo rather than a rolling average.
 */
export function strikeAt(item, step = 0) {
  const p = profileOf(item);
  const shape = STRIKES[p.pattern[step % p.pattern.length]] || STRIKES.slash;
  return {
    ...shape,
    reach: p.reach * shape.reach,
    arc: p.arc * shape.arc,
    every: p.every * shape.wind,
    last: (step % p.pattern.length) === p.pattern.length - 1,
    index: step % p.pattern.length,
    of: p.pattern.length,
  };
}

// ---------------------------------------------------------------------------- hands

/**
 * Which weapons are in which hand, and whether that is even allowed.
 *
 * "2-handed weapons should block your off hand slot when equipped." One rule, checked in one place,
 * so the sheet, the equip path and the swing clock can never disagree about how many hands are busy.
 */
export function handsOf(player) {
  const main = player?.equipment?.weapon || null;
  const off = player?.equipment?.offhand || null;
  const mainTwo = !!main?.twoHanded;
  const offIsWeapon = !!off && off.type === 'weapon';
  const offTwo = !!off?.twoHanded;

  // the keystone that lets you carry two two-handers — see js/perks.js
  const titanGrip = !!player?.perkFlags?.titanGrip;

  return {
    main, off,
    mainTwo,
    /** True when both hands hold a real weapon and both are swinging. */
    dual: offIsWeapon && (!mainTwo || titanGrip) && (!offTwo || titanGrip),
    /** An off hand that is a shield, a quiver or a tome — held, not swung. */
    heldOff: !!off && !offIsWeapon,
    titanGrip,
    /** Can `item` go in the off hand at all right now? */
    offhandBlocked: mainTwo && !titanGrip,
  };
}

/**
 * Why an item cannot go in the off hand, or null.
 *
 * Kept as a sentence rather than a boolean because the interface has to say it: refusing silently is
 * the thing that makes a player think the game is broken.
 */
export function offhandRefusal(player, item) {
  const hands = handsOf(player);
  if (!item) return null;
  if (hands.mainTwo && !hands.titanGrip) {
    return `${hands.main.name} takes both hands. Put it away first, or find the grip that frees one.`;
  }
  if (item.twoHanded && item.type === 'weapon' && !hands.titanGrip) {
    return `${item.name} takes both hands — it cannot go in the off hand.`;
  }
  // A bow needs the hand that is not holding it. Nothing said so, so a bow could be dropped into
  // the off hand and then swing like a club.
  if (item.type === 'weapon' && item.ranged && !hands.titanGrip) {
    return `${item.name} needs both hands to draw — it cannot go in the off hand.`;
  }
  return null;
}

/**
 * Dual wielding: the off hand swings on **its own clock**, not on the main hand's.
 *
 * "When dual wielding, you should be able to attack with each weapon on separate cooldowns." So the
 * controller keeps two timers and two pattern positions, and this decides what each hand does with
 * a frame. The off hand hits for less, because two full weapons would simply be twice the damage.
 */
export const OFFHAND_DAMAGE = 0.62;

export function handPlans(player, { mainStep = 0, offStep = 0 } = {}) {
  const hands = handsOf(player);
  const out = [];
  out.push({ hand: 'main', item: hands.main, strike: strikeAt(hands.main, mainStep), share: 1 });
  if (hands.dual) {
    out.push({ hand: 'off', item: hands.off, strike: strikeAt(hands.off, offStep), share: OFFHAND_DAMAGE });
  }
  return out;
}

// ---------------------------------------------------------------------------- area of effect

/**
 * The area stat, applied to a strike.
 *
 * "There should be an increased area of effect for melee and ranged attacks (ranged includes
 * spells) or just total area affecting both. These would increase the damage zone and animation
 * size of the attacks." One number, `derived.areaPct`, scaling reach, arc and splash together — and
 * the caller scales the drawn effect by the same factor, so what you see is what hits.
 */
export function withArea(strike, areaPct = 0) {
  const k = 1 + Math.max(0, areaPct) / 100;
  // reach grows more slowly than the arc: a bigger swing should widen before it lengthens, or a
  // dagger build ends up out-ranging a halberd
  const reachK = 1 + (k - 1) * 0.45;
  return {
    ...strike,
    reach: strike.reach * reachK,
    arc: Math.min(Math.PI * 1.6, strike.arc * k),
    splash: (strike.splash || 1) * k,
    scale: k,
  };
}

// ---------------------------------------------------------------------------- staves and wands

/**
 * A staff's close-range spell, by element.
 *
 * "Update staves to also have their own elements, like wands, but replace the auto attacks with a
 * close range spell. The spell can vary by element and have multiple types per element, fire should
 * have a cone of flame effect as well as a selectable area explosion, exploding fireball, flame
 * wave, or nova. This eventually acts like an additional spell but does not require mana to use."
 *
 * So a staff does not swing at all: its attack is a shaped spell, free to cast, chosen from the
 * element's own list by the staff's seed. Every element has three to four, and which one a given
 * staff carries is part of what makes it worth picking up.
 */
export const STAFF_SPELLS = {
  fire: [
    { key: 'cone', name: 'Flame Cone', shape: 'cone', range: 9, arc: 0.9, mult: 0.85, status: 'burn' },
    { key: 'nova', name: 'Ember Nova', shape: 'nova', radius: 5.5, mult: 0.8, status: 'burn' },
    { key: 'wave', name: 'Flame Wave', shape: 'wave', range: 12, width: 3.4, mult: 0.9, status: 'burn' },
    { key: 'burst', name: 'Exploding Fireball', shape: 'lob', range: 14, radius: 3.6, mult: 1.05, status: 'burn' },
  ],
  ice: [
    { key: 'cone', name: 'Rime Cone', shape: 'cone', range: 8, arc: 1.0, mult: 0.8, status: 'chill' },
    { key: 'nova', name: 'Frost Nova', shape: 'nova', radius: 6, mult: 0.75, status: 'chill' },
    { key: 'shard', name: 'Shard Volley', shape: 'wave', range: 11, width: 2.6, mult: 0.95, status: 'chill' },
  ],
  lightning: [
    { key: 'arc', name: 'Arc Lash', shape: 'chain', range: 13, chains: 3, mult: 0.8, status: 'shock' },
    { key: 'nova', name: 'Storm Nova', shape: 'nova', radius: 5, mult: 0.85, status: 'shock' },
    { key: 'wave', name: 'Thunderline', shape: 'wave', range: 14, width: 2.2, mult: 1 },
  ],
  poison: [
    { key: 'cone', name: 'Spore Cloud', shape: 'cone', range: 8, arc: 1.1, mult: 0.7, status: 'poison' },
    { key: 'ground', name: 'Creeping Blight', shape: 'ground', radius: 4.5, mult: 0.6, status: 'poison' },
    { key: 'lob', name: 'Bile Flask', shape: 'lob', range: 13, radius: 3.4, mult: 0.9, status: 'poison' },
  ],
  arcane: [
    { key: 'nova', name: 'Unmaking', shape: 'nova', radius: 5.5, mult: 0.95 },
    { key: 'lob', name: 'Star Shot', shape: 'lob', range: 15, radius: 3, mult: 1.1 },
    { key: 'cone', name: 'Rift Cone', shape: 'cone', range: 9, arc: 0.8, mult: 0.9 },
  ],
  shadow: [
    { key: 'cone', name: 'Gutter Cone', shape: 'cone', range: 8, arc: 0.95, mult: 0.85, status: 'wither' },
    { key: 'ground', name: 'Creeping Dark', shape: 'ground', radius: 4.5, mult: 0.7, status: 'wither' },
    { key: 'nova', name: 'Black Pulse', shape: 'nova', radius: 5, mult: 0.9, status: 'wither' },
  ],
  holy: [
    { key: 'nova', name: 'Dawnburst', shape: 'nova', radius: 5.5, mult: 0.95 },
    { key: 'cone', name: 'Searing Light', shape: 'cone', range: 9, arc: 0.9, mult: 0.9 },
    { key: 'wave', name: 'Sunlance', shape: 'wave', range: 13, width: 2.4, mult: 1.05 },
  ],
};

/**
 * A wand's projectile behaviour, by element.
 *
 * "Update wands so each one also has a projectile effect, area, chain/bounce, explosion,
 * multi-shot, etc." Every wand throws a bolt; what the bolt DOES when it gets there is what makes
 * one wand different from the next.
 */
export const WAND_BEHAVIOURS = [
  { key: 'plain', name: 'true-flying', desc: 'a single bolt, fast and straight', projectiles: 1, splash: 2.2 },
  { key: 'burst', name: 'bursting', desc: 'the bolt bursts on impact', projectiles: 1, splash: 4.2, mult: 0.95 },
  { key: 'split', name: 'splitting', desc: 'throws three bolts in a fan', projectiles: 3, spread: 0.16, splash: 1.6, mult: 0.55 },
  { key: 'chain', name: 'chaining', desc: 'jumps from what it hits to what is behind it', projectiles: 1, chains: 2, splash: 1.8, mult: 0.8 },
  { key: 'seeking', name: 'seeking', desc: 'turns after what you aimed at', projectiles: 1, homing: 1, splash: 2.2, mult: 0.9 },
  { key: 'heavy', name: 'heavy', desc: 'one slow bolt that lands hard', projectiles: 1, splash: 3.4, mult: 1.45, slow: 0.6 },
];

/** A stable 0..1 from a string, so the same wand always behaves the same way. */
function hashOf(text = '') {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

/** Which behaviour this wand has. Written onto the item the first time it is asked. */
export function wandBehaviour(item) {
  if (!item) return WAND_BEHAVIOURS[0];
  if (item.wandBehaviour) return WAND_BEHAVIOURS.find(b => b.key === item.wandBehaviour) || WAND_BEHAVIOURS[0];
  const i = Math.floor(hashOf(item.id || item.baseKey || '') * WAND_BEHAVIOURS.length);
  const pick = WAND_BEHAVIOURS[Math.min(WAND_BEHAVIOURS.length - 1, i)];
  item.wandBehaviour = pick.key;
  return pick;
}

/** Which spell this staff casts. Written onto the item the first time it is asked. */
export function staffSpell(item, element = 'arcane') {
  const list = STAFF_SPELLS[element] || STAFF_SPELLS.arcane;
  if (!item) return list[0];
  if (item.staffSpell) {
    const found = list.find(s => s.key === item.staffSpell);
    if (found) return found;
  }
  const i = Math.floor(hashOf((item.id || item.baseKey || '') + ':staff') * list.length);
  const pick = list[Math.min(list.length - 1, i)];
  item.staffSpell = pick.key;
  return pick;
}

/** Is this a staff — a weapon whose attack is a spell rather than a swing? */
export function isStaff(item) {
  if (!item) return false;
  if (item.weaponCategory !== 'magic') return false;
  return !!item.twoHanded;
}

/** Is this a wand — a magic weapon that throws a bolt? */
export function isWand(item) {
  if (!item) return false;
  return item.weaponCategory === 'magic' && !item.twoHanded;
}
