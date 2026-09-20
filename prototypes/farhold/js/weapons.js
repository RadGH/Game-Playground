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

// Player-facing numbers go through shared/format.js, so a reach never renders "2.7000000000000002".
import { fmt } from '../../../shared/format.js';

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
  if (item.twoHanded) return false;
  // A bow or a crossbow needs the hand that is not holding it. A WAND does not — `rpg.attuneWeapon`
  // marks every wand `ranged` so it throws a bolt, and a wand has always been fine in either hand,
  // so "ranged" alone is not the test.
  if (needsBothToDraw(item)) return false;
  return true;
}

/** True for a bow, a crossbow or a javelin — something you have to draw or throw. */
export function needsBothToDraw(item) {
  return !!(item?.ranged && item.weaponCategory !== 'magic');
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
  item.hands = oneHanded(item) ? 1 : 2;
  if (oneHanded(item)) item.offHandOk = true;
  return item;
}

// ------------------------------------------------------------ what a weapon IS, before you swing it

/**
 * THREE FACTS EVERY WEAPON HAS TO STATE, and used not to.
 *
 *   "I got a weapon called 'truthseeker' that shoots a projectile. How am I supposed to know that
 *    without testing it? All weapons should indicate if they are melee or ranged, and one hand or
 *    two handed. Wands and staves should also display their element type."
 *
 * Truthseeker is a unique built on the `wand` base, so `rpg.attuneWeapon` makes it ranged and gives
 * it an element — and then the item card skipped its whole description block, because that block was
 * guarded with `!item.ranged`. Every ranged weapon in the game therefore said nothing at all about
 * what it was: not that it shoots, not how many hands it takes, not what element it throws.
 *
 * So the three facts are computed ONCE, here, and written onto the item (see `describeWeapon`), and
 * every screen reads the same fields rather than working it out again and disagreeing.
 */

/**
 * How far a shot carries when the item itself does not say.
 *
 * A wand carries its own `castRange` (34 m, written by `rpg.attuneWeapon`); an arrow's flight is
 * `data/balance.json` player.arrowRange. Neither number is reachable from here — this module is
 * pure arithmetic with no data loading — so they are repeated, and tests/weapon-facts.test.js fails
 * if either one drifts away from its real source.
 */
export const SHOT_REACH = { bow: 46, wand: 34 };

/** Plain family words for the bases whose swing pattern does not name them. */
const FAMILY_WORDS = {
  bow: 'Bow', shortbow: 'Shortbow', longbow: 'Longbow', crossbow: 'Crossbow',
  javelin: 'Javelin', sling: 'Sling',
  wand: 'Wand', staff: 'Staff', scepter: 'Sceptre', orb: 'Orb', tome: 'Tome',
};

/**
 * What each element is called and what it leaves behind.
 *
 * `rpg.js` CAST_ELEMENTS is the source of the name on an item the generator has attuned — it writes
 * `castName` onto the item — so this table is only the fallback for a weapon that was branded at the
 * bench, or one a test built by hand. Same words, deliberately.
 */
const ELEMENT_WORDS = {
  fire: { name: 'Flame', does: 'sets what it hits alight' },
  ice: { name: 'Rime', does: 'slows what it hits' },
  lightning: { name: 'Storm', does: 'leaves the target taking more of everything' },
  poison: { name: 'Blight', does: 'keeps working after it lands' },
  shadow: { name: 'Gloom', does: 'curses what it hits' },
  arcane: { name: 'Arc', does: 'raw force — no status, but the hardest hitting' },
  holy: { name: 'Dawn', does: 'burns what should not be walking' },
};

/**
 * Does this thing shoot, throw or cast at a distance?
 *
 * `item.ranged` is the truth once `rpg.attuneWeapon` has been over the item — but a card can be
 * drawn from a raw base before that (a shop rolled its stock straight out of the generator for
 * rounds), and a wand read as a melee club until something attuned it. Checking the base too means
 * the answer never depends on how far through the pipeline the item happens to be.
 */
export function isRangedWeapon(item) {
  if (!item || item.type !== 'weapon') return false;
  if (item.ranged) return true;
  return (item.subtype || item.baseKey) === 'wand';
}

/** The family word a player would use: "Bow", "Wand", "Longsword", "Sabre". */
export function familyOf(item) {
  if (!item || item.type !== 'weapon') return 'Fists';
  const sub = item.subtype || '';
  const key = item.baseKey || '';
  if (FAMILY_WORDS[sub]) return FAMILY_WORDS[sub];
  if (FAMILY_WORDS[key]) return FAMILY_WORDS[key];
  const named = WEAPON_PATTERNS[key] || WEAPON_PATTERNS[sub]
    || Object.entries(WEAPON_PATTERNS).find(([k]) => key.endsWith('_' + k))?.[1];
  if (named?.name) return named.name;
  // a road weapon or a unique whose base is in neither table: tidy up whatever word it does have
  const word = sub || key;
  return word ? word.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Weapon';
}

/** The element a magic weapon is made of, with the words to say it. Null for steel. */
export function elementFacts(item) {
  const el = item?.brand || item?.castElement || null;
  if (!el) return null;
  const words = ELEMENT_WORDS[el] || { name: el.replace(/\b\w/, c => c.toUpperCase()), does: '' };
  return { element: el, name: item?.castName || words.name, does: words.does };
}

/**
 * Everything the card has to say about what this weapon IS, in one object.
 *
 * `headline` is the unmissable line — "Ranged · Two-handed · Bow" — and `tags` is the same thing
 * split up, for a row of chips. `line` is the sentence underneath it. Nothing here is a swing
 * number; `profileOf` and `strikeAt` still own the rhythm.
 */
export function weaponFacts(item) {
  if (!item || item.type !== 'weapon') {
    return {
      isWeapon: false, ranged: false, melee: true, hands: 1, twoHanded: false,
      family: 'Fists', tags: [], headline: '', line: '', handNote: '',
      element: null, elementName: null, elementNote: null, castLine: null, shotRange: null,
    };
  }
  const ranged = isRangedWeapon(item);
  const twoHands = !oneHanded(item);
  const family = familyOf(item);
  const el = elementFacts(item);
  const staff = isStaff(item);
  const wand = (item.subtype || item.baseKey) === 'wand';
  const profile = profileOf(item);

  // how far it reaches: a shot's flight, or the swing's own reach in metres
  const shotRange = ranged
    ? (item.castRange || (wand ? SHOT_REACH.wand : SHOT_REACH.bow))
    : null;

  /**
   * The hand note, spelled out rather than implied.
   *
   * "One-handed" on its own does not tell a new player that the off hand is therefore free, and
   * "two-handed" does not tell them the shield is coming off. Both are said outright.
   */
  const handNote = !twoHands
    ? 'It can go in either hand, so the off hand stays free.'
    : needsBothToDraw(item)
      ? 'Both hands are on the draw — no shield, no second weapon.'
      : 'It takes both hands, so the off hand stays empty.';

  const tags = [
    ranged ? 'Ranged' : 'Melee',
    twoHands ? 'Two-handed' : 'One-handed',
    // "Wands and staves should also display their element type" — and so should a sceptre, an orb,
    // a tome and anything branded at the bench, for the same reason: the element is the difference
    // between two weapons whose numbers look identical.
    el ? `${el.name} ${family}` : family,
  ];
  const headline = tags.join(' · ');

  // what the attack actually does, for the wand and staff cases the play-test named
  let castLine = null;
  if (wand) {
    const how = wandBehaviour(item);
    castLine = `${el ? el.name + ' bolt' : 'Bolt'} — ${how.desc}, about ${fmt(shotRange)} m.`;
  } else if (staff) {
    const spell = staffSpell(item, el?.element || 'arcane');
    castLine = `${spell.name} — a close-range spell, cast instead of a swing and free to use.`;
  }

  // the sentence under the headline
  let line;
  const attuned = el ? `, attuned to ${el.name}` : '';
  if (wand) {
    line = `A ${twoHands ? 'two' : 'one'}-handed ${family.toLowerCase()}${attuned}. `
      + `It throws a bolt rather than swinging — about ${fmt(shotRange)} m. ${handNote}`;
  } else if (staff) {
    line = `A two-handed ${family.toLowerCase()}${attuned}. `
      + 'Its attack is a spell, not a swing. ' + handNote;
  } else if (ranged) {
    const verb = (item.subtype || item.baseKey) === 'javelin' ? 'It is thrown' : 'It shoots';
    line = `A ${twoHands ? 'two' : 'one'}-handed ${family.toLowerCase()}. ${verb} — about ${fmt(shotRange)} m. ${handNote}`;
  } else {
    line = `A ${twoHands ? 'two' : 'one'}-handed ${family.toLowerCase()}${attuned}. `
      + `Swung in melee — ${fmt(profile.reach, { decimals: 1 })} m reach, a swing every ${fmt(profile.every)}s. ${handNote}`;
  }

  return {
    isWeapon: true,
    ranged, melee: !ranged,
    hands: twoHands ? 2 : 1, twoHanded: twoHands,
    family, tags, headline, line, handNote,
    element: el?.element || null,
    elementName: el?.name || null,
    elementNote: el ? `${el.name}${el.does ? ' — ' + el.does : ''}.` : null,
    castLine,
    shotRange,
    reach: ranged ? shotRange : profile.reach,
    every: profile.every,
  };
}

/**
 * Write the facts onto the item, so every screen reads one answer.
 *
 * Called from `rpg.attuneWeapon`, which is the one gate every generated weapon passes through —
 * drop, chest, shop shelf, crafting bench. The fields are written on the ITEM, never into the
 * shared `data/items.json`: that file belongs to Emberveil as well, and it has a test that every
 * affix in it resolves.
 */
export function describeWeapon(item) {
  if (!item || item.type !== 'weapon') return item;
  markHands(item);
  const f = weaponFacts(item);
  item.rangeClass = f.ranged ? 'ranged' : 'melee';
  item.gripWord = f.twoHanded ? 'Two-handed' : 'One-handed';
  item.familyName = f.family;
  item.weaponTags = f.tags;
  item.weaponHeadline = f.headline;
  item.weaponLine = f.line;
  item.handNote = f.handNote;
  item.elementName = f.elementName;
  item.elementNote = f.elementNote;
  item.castLine = f.castLine;
  if (f.shotRange) item.shotRange = f.shotRange;
  return item;
}

/** "One-handed sword, melee" / "Two-handed bow, ranged — it takes both hands to draw". */
export function handedText(item) {
  if (!item || item.type !== 'weapon') return '';
  const f = weaponFacts(item);
  return `${f.headline} — ${f.handNote}`;
}

/**
 * …and the same in words, for the hover card.
 *
 * The headline leads, because melee-or-ranged and one-hand-or-two are the things a player has to
 * know BEFORE the rhythm: the card used to print a rapier's two arrows and its reach and never once
 * say whether the shield could stay on — and for anything ranged it printed nothing at all.
 */
export function patternText(item) {
  const f = weaponFacts(item);
  if (!f.isWeapon) return '';
  if (f.ranged || isStaff(item)) return f.line;
  const p = profileOf(item);
  const names = p.pattern.map(k => STRIKES[k]?.name || k);
  return `${f.headline}. ${names.join(', then ')} — ${fmt(p.reach, { decimals: 1 })} m reach, `
    + `a swing every ${fmt(p.every)}s. ${f.handNote}`;
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

  // the keystone that lets you carry two two-handers — Doubled Grasp, see js/perks.js
  const doubleGrip = !!player?.perkFlags?.doubleGrip;

  return {
    main, off,
    mainTwo,
    /** True when both hands hold a real weapon and both are swinging. */
    dual: offIsWeapon && (!mainTwo || doubleGrip) && (!offTwo || doubleGrip),
    /** An off hand that is a shield, a quiver or a tome — held, not swung. */
    heldOff: !!off && !offIsWeapon,
    doubleGrip,
    /** Can `item` go in the off hand at all right now? */
    offhandBlocked: mainTwo && !doubleGrip,
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
  if (hands.mainTwo && !hands.doubleGrip) {
    return `${hands.main.name} takes both hands. Put it away first, or find the grip that frees one.`;
  }
  if (item.twoHanded && item.type === 'weapon' && !hands.doubleGrip) {
    return `${item.name} takes both hands — it cannot go in the off hand.`;
  }
  // A bow needs the hand that is not holding it. Nothing said so, so a bow could be dropped into
  // the off hand and then swing like a club.
  if (needsBothToDraw(item) && !hands.doubleGrip) {
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
