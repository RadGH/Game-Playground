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
// The swing channel: one writer, several readers. See `withArea` below and js/combat-feel.js.
import { feel } from './combat-feel.js';
// R17 — the glyph AND the caption for a spell's shape, out of one row. See js/spellshapes.js.
import { SPELL_SHAPES, shapeRow } from './spellshapes.js';

export { SPELL_SHAPES } from './spellshapes.js';

// ---------------------------------------------------------------------------- strike shapes

/**
 * The shapes a melee strike can take, and what each one DOES to the thing it lands on.
 *
 * `reach` and `arc` multiply the weapon's own numbers; `damage` is the share of a full hit; `wind`
 * is how long the swing takes before it lands. Those four are the original four fields and they
 * still mean exactly the same thing.
 *
 * Round 14 added the physics. A swing used to be resolved on the frame the button went down with
 * nothing to feel — no weight going in, no jolt coming out. These say what a hit is worth as a
 * PHYSICAL event, and every one of them is read by js/combat-feel.js:
 *
 *   push     metres of knockback
 *   stagger  seconds the target cannot act
 *   hitstop  milliseconds the world holds still on a connecting hit
 *   shake    screen-shake coefficient (metres = shake x 0.035, capped at 0.12)
 *   pen      share of the target's armour this shape goes through
 *   step     metres the ATTACKER moves forward on the swing
 *
 * `glyph` is what the item card draws, so a player can read a weapon's rhythm without equipping it.
 */
export const STRIKES = {
  //                                   glyph reach  arc  dmg  wind splash push stagger hitstop shake pen  step
  jab:      mk('jab',      'Jab',      '·', 0.78, 0.55, 0.65, 0.50, 0.3, 0.15, 0,    35,  0.10, 0,    0),
  slash:    mk('slash',    'Slash',    '⟋', 1.00, 1.00, 1.00, 1.00, 1.0, 0.35, 0,    55,  0.20, 0,    0),
  thrust:   mk('thrust',   'Thrust',   '⟶', 1.55, 0.35, 1.20, 0.90, 0.4, 0.55, 0,    55,  0.18, 0.25, 0.3),
  sweep:    mk('sweep',    'Sweep',    '◡', 1.10, 2.10, 0.95, 1.15, 1.7, 0.60, 0.18, 70,  0.30, 0,    0),
  cleave:   mk('cleave',   'Cleave',   '⤲', 1.25, 1.55, 1.35, 1.30, 1.8, 0.75, 0.15, 85,  0.35, 0,    0),
  overhead: mk('overhead', 'Overhead', '⟱', 1.15, 0.85, 1.75, 1.55, 1.3, 1.10, 0.35, 110, 0.55, 0.10, 0),

  /** The sword finisher — a wide fluid sweep that carries you half a metre into it. */
  arc:   mk('arc',   'Arc Cut', '◟', 1.10, 2.30, 1.45, 1.25, 1.6, 0.70, 0.20, 80,  0.35, 0,    0.6),
  /** The hammer finisher — the smash. The heaviest thing in the game. */
  slam:  mk('slam',  'Slam',    '▼', 1.00, 1.20, 2.25, 1.85, 2.6, 2.20, 0.65, 150, 0.90, 0.20, 0),
  /** The point-weapon finisher — you cover ground and you go through armour. */
  lunge: mk('lunge', 'Lunge',   '⇢', 1.80, 0.30, 1.35, 1.05, 0.3, 0.40, 0,    60,  0.22, 0.40, 1.4),
};

/** One row of the table above, so the numbers line up and a missing field is impossible. */
function mk(key, name, glyph, reach, arc, damage, wind, splash, push, stagger, hitstop, shake, pen, step) {
  return { key, name, glyph, reach, arc, damage, wind, splash, push, stagger, hitstop, shake, pen, step };
}

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
  dagger: { pattern: ['jab', 'jab', 'slash'], reach: 2.0, arc: 1.1, every: 0.34, name: 'Dagger' },
  rapier: { pattern: ['thrust', 'thrust', 'lunge'], reach: 3.3, arc: 0.7, every: 0.52, name: 'Rapier' },
  spear: { pattern: ['thrust', 'thrust', 'sweep'], reach: 4.0, arc: 0.8, every: 0.66, name: 'Spear' },
  scimitar: { pattern: ['slash', 'slash', 'arc'], reach: 2.7, arc: 1.5, every: 0.46, name: 'Sabre' },
  // `rimecut_sabre` spells it the other way, and `halberd`'s own subtype in items.json is `polearm`
  sabre: { pattern: ['slash', 'slash', 'arc'], reach: 2.7, arc: 1.5, every: 0.46, name: 'Sabre' },

  // ---- heavy, one-handed
  sword: { pattern: ['slash', 'slash', 'arc'], reach: 2.8, arc: 1.4, every: 0.58, name: 'Sword' },
  longsword: { pattern: ['slash', 'slash', 'overhead'], reach: 3.0, arc: 1.5, every: 0.64, name: 'Longsword' },
  axe: { pattern: ['cleave', 'slash', 'cleave'], reach: 2.6, arc: 1.3, every: 0.68, name: 'Axe' },
  mace: { pattern: ['overhead', 'slash', 'slam'], reach: 2.4, arc: 1.1, every: 0.62, name: 'Mace' },
  hammer: { pattern: ['overhead', 'sweep', 'slam'], reach: 2.5, arc: 1.2, every: 0.66, name: 'Hammer' },
  warhammer: { pattern: ['overhead', 'overhead', 'slam'], reach: 2.6, arc: 1.1, every: 0.76, name: 'Warhammer' },
  battleaxe: { pattern: ['cleave', 'slash', 'cleave'], reach: 2.8, arc: 1.5, every: 0.82, name: 'Battleaxe' },
  scepter: { pattern: ['overhead', 'slash'], reach: 2.5, arc: 1.1, every: 0.64, name: 'Sceptre' },

  // ---- two-handed. Wider, longer, slower — and they take the off hand with them.
  sword2h: { pattern: ['sweep', 'overhead', 'arc'], reach: 3.9, arc: 2.0, every: 0.88, name: 'Two-handed Sword' },
  greatsword: { pattern: ['sweep', 'overhead', 'arc'], reach: 4.2, arc: 2.1, every: 0.96, name: 'Greatsword' },
  axe2h: { pattern: ['cleave', 'cleave', 'slam'], reach: 3.6, arc: 1.9, every: 0.94, name: 'Two-handed Axe' },
  halberd: { pattern: ['thrust', 'sweep', 'overhead'], reach: 4.8, arc: 1.7, every: 1.0, name: 'Halberd' },
  // A quarterstaff is a POLE, not a spell launcher. `items.json` files it under `magic` and that is
  // what made it cast a free area spell every 0.41 s; `rpg.attuneWeapon` writes `light` onto the
  // item so this row is what it swings on. See §1.5 G of research/combat-redesign.md.
  quarterstaff: { pattern: ['jab', 'sweep', 'jab', 'sweep'], reach: 3.5, arc: 1.6, every: 0.48, name: 'Quarterstaff' },
  polearm: { pattern: ['thrust', 'sweep', 'overhead'], reach: 4.8, arc: 1.7, every: 1.0, name: 'Polearm' },

  /**
   * ---- ranged, and the reason they are in this table at all.
   *
   * A bow was in NEITHER table, so `profileOf` fell through to the `light` melee category and a
   * bow's rate of fire was the dagger swing clock — 1.91 shots a second with no draw, no nock and
   * no reload, which nobody designed. Worse, the two-handed scale only fired on weapons NOT in this
   * table, so the one effect it ever had was making bows 20% slower. Both are fixed by the rows
   * being here. The `pattern` is a single shot shape; the draw and the reload live in RANGED.
   */
  bow: { pattern: ['shot'], reach: 1, arc: 0.3, every: 1.05, name: 'Bow', shoots: true },
  shortbow: { pattern: ['shot'], reach: 1, arc: 0.3, every: 0.85, name: 'Shortbow', shoots: true },
  longbow: { pattern: ['shot'], reach: 1, arc: 0.3, every: 1.15, name: 'Longbow', shoots: true },
  crossbow: { pattern: ['shot'], reach: 1, arc: 0.3, every: 1.25, name: 'Crossbow', shoots: true },
  javelin: { pattern: ['shot'], reach: 1, arc: 0.3, every: 0.75, name: 'Javelin', shoots: true },
};

// `shot` is not a melee shape and never reaches `field.strike`; it is here so `strikeAt` on a bow
// returns something real rather than silently borrowing a slash.
STRIKES.shot = mk('shot', 'Shot', '→', 1, 1, 1, 1, 0.9, 0.30, 0, 55, 0.18, 0, 0);

/**
 * WHAT A FAMILY IS FOR — the traits, keyed the way `WEAPON_PATTERNS` is (base key, then subtype,
 * then `_suffix`, then category).
 *
 *   damage       flat multiplier on the whole family. This is where the two-hander bonus lives, and
 *                it is a real one at last: `TWO_HANDED_SCALE.damage` was declared in 2026 and read
 *                by nothing, so every two-hander paid a 1.2x slower clock and collected none of it.
 *   armourBreak  share of the target's CURRENT armour stripped per hit, as a `sunder` status
 *   bleed        stacks applied by a connecting `cleave`
 *   backstab     multiplier for a hit landed in the target's rear 100 degrees
 *   pierceLine   a `thrust` is a line out to full reach, not a cone; the number is how many bodies
 *   brace        extra damage on a thrust against something that closed on you this second
 *   flow         after two connecting strikes the third costs 0.35x its clock
 *   guard        block chance granted while the weapon is held
 *   pierceBodies how many bodies a shot passes through
 *   input        R17 — 'repeat' or 'charge'. See INPUT_MODES below. Exactly one, never both.
 */
export const WEAPON_TRAITS = {
  // it smashes
  hammer: { armourBreak: 0.07, guard: 0, input: 'repeat' },
  warhammer: { armourBreak: 0.07, guard: 0, input: 'repeat' },
  mace: { armourBreak: 0.05, guard: 0, input: 'repeat' },
  // it slashes
  sword: { flow: false, guard: 0.08, momentum: true, input: 'repeat' },
  longsword: { guard: 0.08, momentum: true, input: 'repeat' },
  // the sweep
  sword2h: { damage: 1.20, guard: 0.06, input: 'repeat' },
  greatsword: { damage: 1.20, guard: 0.06, input: 'repeat' },
  // it bites
  axe: { bleed: 1, input: 'repeat' },
  battleaxe: { bleed: 1, input: 'repeat' },
  axe2h: { damage: 1.20, bleed: 1, armourBreak: 0.05, input: 'repeat' },
  // it adds range
  halberd: { damage: 1.20, pierceLine: 3, brace: 0.35, guard: 0.06, input: 'repeat' },
  polearm: { damage: 1.20, pierceLine: 3, brace: 0.35, guard: 0.06, input: 'repeat' },
  spear: { pierceLine: 2, brace: 0.25, guard: 0.05, input: 'repeat' },
  // the point
  rapier: { guard: 0.10, input: 'repeat' },
  // the flow
  scimitar: { flow: true, momentum: true, input: 'repeat' },
  sabre: { flow: true, momentum: true, input: 'repeat' },
  // the back
  dagger: { damage: 0.80, backstab: 2.2, input: 'repeat' },
  // a staff parries, which is the monk's defence
  quarterstaff: { guard: 0.12, input: 'repeat' },
  scepter: { armourBreak: 0.04, input: 'repeat' },
  // ranged
  bow: { pierceBodies: 1, draw: true, input: 'charge' },
  shortbow: { pierceBodies: 1, draw: true, input: 'charge' },
  longbow: { pierceBodies: 2, draw: true, input: 'charge' },
  crossbow: { pierceBodies: 2, reload: true, input: 'repeat' },
  javelin: { thrown: true, input: 'repeat' },
};

// ------------------------------------------------------------------ one input mode, never two

/**
 * R17 — HOLD TO REPEAT **OR** HOLD TO CHARGE. NOT BOTH, AND THE WEAPON SAYS WHICH.
 *
 *   "I think 'hold-to-power' weapons are a good idea but it conflicts with our hold-to-attack
 *    system, so let's have it be one or the other, not mixed."
 *
 * The conflict is real and it was never written down anywhere. Farhold has held the mouse button
 * down to attack repeatedly since round 7 ("change it so holding down the mouse button repeatedly
 * attacks (with all weapons)"), and round 14 gave bows a draw and staves a channel — which are the
 * opposite instruction for the same button. Nothing in the data said which of the two a given
 * weapon obeyed: `rpg.swingPlan` worked it out from `isStaff()` and `rangedPlan().kind`, two
 * unrelated tests in a file that has nothing to do with rhythm, and no screen could ask the
 * question at all.
 *
 *   repeat  hold the button and it swings, shoots or casts on its clock. Nothing builds.
 *   charge  hold the button and it BUILDS; let go and it goes off. Nothing swings on a clock.
 *
 * A charge weapon still releases itself at its own ceiling (js/player.js `autoLoose`), so holding
 * the button on a bow gives you a stream of full-power shots rather than an arm that trembles for
 * ever. That is the ceiling of one mode, not a second mode: at no point does a `charge` weapon fire
 * something it did not build, and at no point does a `repeat` weapon build anything.
 *
 * The table is keyed off `WEAPON_TRAITS.input` so it lives beside the rest of what a family IS.
 */
export const INPUT_MODES = ['repeat', 'charge'];

/**
 * Which of the two this weapon obeys. Never null; bare fists repeat.
 *
 * The staff case does not come from `WEAPON_TRAITS` because a staff has no family row — there are
 * six different staff bases in items.json and they are all "a magic weapon that takes two hands".
 * `isStaff()` is the one test for that and it is already the test `rpg.swingPlan` uses, so asking
 * it here keeps the two answers from ever disagreeing (tests/round17-combat.test.js checks it).
 */
export function inputOf(item) {
  if (!item || item.type !== 'weapon') return 'repeat';
  // a staff is the charge weapon the whole mechanic was built for
  if (isStaff(item)) return 'charge';
  const traits = traitsOf(item);
  if (traits.input) return traits.input;
  // a base nobody wrote a row for: a drawn bow charges, everything else repeats
  return rangedPlan(item)?.kind === 'draw' ? 'charge' : 'repeat';
}

/** True when holding the button BUILDS something rather than swinging again. */
export const chargesOnHold = item => inputOf(item) === 'charge';

/**
 * One sentence for the card: what a CHARGE weapon's charge is worth, in numbers.
 *
 * R21 — a `repeat` weapon gets nothing here at all. It used to say "Hold the attack button to keep
 * attacking", which is a control, not a fact about the weapon: the controls screen already teaches
 * it, and printing it on every sword in the game pushed the reach and the clock down the card.
 * WORDING.md rule 5. The two charge branches stay because they carry a number the player cannot
 * read anywhere else — how much the charge is actually worth.
 */
export function inputNote(item) {
  if (inputOf(item) !== 'charge') return '';
  if (isStaff(item)) {
    const c = STAFF_CHARGE;
    return `Charged ${fmt(c.full)}s the spell casts at full damage, and holding to ${fmt(c.max)}s casts at `
      + `${fmt(c.powerMax)}× damage over ${fmt(c.radiusMax)}× the area. Charging costs ${fmt(c.mana)} mana a second; `
      + `a tap casts at ${fmt(c.tapPower)}× damage for no mana.`;
  }
  const plan = rangedPlan(item) || RANGED.bow;
  return `Drawn for ${fmt(plan.full)}s the shot hits for ${fmt(plan.powerFull)}× damage; `
    + `loosed early the shot hits for ${fmt(plan.powerMin)}× damage.`;
}

/** The trait bag for a weapon, read the same way its pattern is. Always an object. */
export function traitsOf(item) {
  if (!item) return {};
  const key = item.baseKey || '';
  return WEAPON_TRAITS[key]
    || Object.entries(WEAPON_TRAITS).find(([k]) => key.endsWith('_' + k))?.[1]
    || WEAPON_TRAITS[item.subtype]
    || {};
}

/**
 * HOW LONG THE SWING TAKES BEFORE IT LANDS — the weight, by family, in milliseconds.
 *
 * A dagger is out and back before you have registered it; a greatsword is a decision. The rule that
 * makes this free is in §3.5 of the design: `wind + recover` is taken OUT of the weapon's existing
 * `every`, never added to it, so the rate of fire — and every damage-per-second number — is exactly
 * what it was.
 */
export const FAMILY_WIND = {
  dagger: 70, rapier: 95, scimitar: 105, sabre: 105, sword: 120, longsword: 130, spear: 140,
  scepter: 170, mace: 180, axe: 200, battleaxe: 210, hammer: 260, warhammer: 275,
  halberd: 300, polearm: 300, sword2h: 320, greatsword: 330, axe2h: 340, quarterstaff: 110,
  bow: 0, shortbow: 0, longbow: 0, crossbow: 180, javelin: 150,
};
const CATEGORY_WIND = { light: 110, heavy: 190, magic: 120 };

/** The wind-up a family is worth, in milliseconds, before the strike shape scales it. */
export function familyWind(item) {
  if (!item) return 80;
  const key = item.baseKey || '';
  const found = FAMILY_WIND[key]
    ?? Object.entries(FAMILY_WIND).find(([k]) => key.endsWith('_' + k))?.[1]
    ?? FAMILY_WIND[item.subtype];
  if (found != null) return found;
  return CATEGORY_WIND[item.weaponCategory] ?? 150;
}

/**
 * The three parts of one swing, in seconds.
 *
 *   wind      you are committed: you turn at 35% and walk at 55%
 *   active    the frame the damage lands
 *   recover   the weapon is coming back; the next press is BUFFERED rather than dropped, and the
 *             off hand is allowed to go here and only here
 *
 * `every` is the whole cycle and it is unchanged, so nothing about damage per second moves.
 */
export function swingTiming(item, step = 0, hasteK = 1) {
  const strike = strikeAt(item, step);
  const every = strike.every * hasteK;
  let wind = (familyWind(item) / 1000) * strike.wind * hasteK;
  let recover = wind * 0.45;
  // never let the windup and the recovery eat the whole clock — a 90% ceiling leaves a real gap
  const room = every * 0.9;
  if (wind + recover > room && wind + recover > 0) {
    const k = room / (wind + recover);
    wind *= k; recover *= k;
  }
  return { wind, recover, every, windMs: wind * 1000, recoverMs: recover * 1000, strike };
}

/**
 * RANGED, spelled out — a draw, a reload or a throw rather than a swing clock by accident.
 *
 * `power` is the share of a full hit. A bow at full draw is worth 1.60 of one and takes 1.05 s to
 * get there, which is 1.52 shares a second against the 1.91 flat shares it used to get for free.
 */
export const RANGED = {
  bow: { kind: 'draw', min: 0.35, full: 0.95, powerMin: 0.55, powerFull: 1.60, hold: 1.6, decay: 0.03, range: 46, splash: 0.9 },
  shortbow: { kind: 'draw', min: 0.28, full: 0.75, powerMin: 0.55, powerFull: 1.40, hold: 1.4, decay: 0.03, range: 38, splash: 0.9 },
  longbow: { kind: 'draw', min: 0.40, full: 1.10, powerMin: 0.55, powerFull: 1.75, hold: 1.8, decay: 0.03, range: 54, splash: 0.9 },
  crossbow: { kind: 'reload', reload: 1.25, power: 1.80, range: 50, splash: 0.9 },
  // R16 — no `carried`. There is no ammunition in this game: "I do not want any ammunition
  // system in the game at this point." A javelin is a one-handed thrower with short reach and
  // a wide splash, and that short reach is what pays for it now.
  javelin: { kind: 'throw', power: 1.15, every: 0.75, range: 28, splash: 1.4 },
};

/** How a ranged weapon fires: a draw, a reload or a throw. Null for anything that is not one. */
export function rangedPlan(item) {
  if (!item || item.weaponCategory === 'magic') return null;
  const key = item.baseKey || '';
  const plan = RANGED[key]
    || Object.entries(RANGED).find(([k]) => key.endsWith('_' + k))?.[1]
    || RANGED[item.subtype];
  if (plan) return plan;
  // a unique built on an unnamed ranged base still has to behave like something
  return item.ranged ? RANGED.bow : null;
}

/**
 * How far a bow is drawn after `held` seconds, and what that shot is worth.
 *
 * Under `min` you have not nocked and the shot refuses. Past `hold` the arms start to tremble and
 * the power bleeds away, which is the thing that stops "hold it forever" being the right play.
 */
export function drawPower(plan, held = 0) {
  if (!plan) return { ready: true, power: 1, draw: 1 };
  if (plan.kind !== 'draw') return { ready: true, power: plan.power ?? 1, draw: 1 };
  if (held < plan.min) return { ready: false, power: 0, draw: Math.max(0, held / plan.min) * 0.35 };
  const span = Math.max(0.001, plan.full - plan.min);
  const k = Math.min(1, (held - plan.min) / span);
  let power = plan.powerMin + (plan.powerFull - plan.powerMin) * k;
  const over = Math.max(0, held - plan.hold);
  if (over > 0) power *= Math.max(0.5, 1 - over * (plan.decay ?? 0.03));
  return { ready: true, power, draw: 0.35 + k * 0.65, shaky: over > 0 };
}

/** Anything not named above falls back on its category. */
export const CATEGORY_PATTERNS = {
  light: { pattern: ['slash', 'thrust'], reach: 2.4, arc: 1.2, every: 0.46 },
  heavy: { pattern: ['slash', 'overhead'], reach: 2.8, arc: 1.4, every: 0.68 },
  magic: { pattern: ['jab', 'slash'], reach: 2.2, arc: 1.1, every: 0.6 },
};

/**
 * The scale an UNLISTED two-hander gets — a road weapon or a unique whose base is in neither table.
 *
 * It used to carry `damage: 1.25` and `profileOf` never returned it, so the bonus was dead data for
 * the life of the game; and the guard it sat behind (`two && !WEAPON_PATTERNS[key]`) excluded every
 * real two-hander, so the only weapons it ever touched were bows. The damage share now lives in
 * `WEAPON_TRAITS`, which applies to the weapons it was written for, and bows have their own rows —
 * so what is left here is what it was always meant to be: a sensible default for a two-handed
 * weapon nobody has written a pattern for.
 */
const TWO_HANDED_SCALE = { reach: 1.18, arc: 1.25, every: 1.2 };

/**
 * Everything about how a weapon swings: the pattern, the reach, the arc, the clock, the traits.
 *
 * Reads the base key first, then the subtype, then the category — so the twenty-odd road weapons and
 * uniques all get a sensible rhythm from the family they belong to without a row each.
 */
export function profileOf(item) {
  if (!item) {
    return {
      ...CATEGORY_PATTERNS.light, pattern: ['jab'], name: 'Fists', unarmed: true,
      twoHanded: false, ranged: false, traits: {}, wind: 80, damageTrait: 1,
    };
  }
  const key = item.baseKey || '';
  /**
   * THE SUFFIX BEATS THE SUBTYPE, and it has to.
   *
   * `items.json` files `obsidian_scimitar` and `rimecut_sabre` under the subtype "sword", so
   * checking the subtype first gave both of them the plain sword rhythm and the `_scimitar` rule
   * below never fired on a real item — only on one a test built by hand with no subtype, which is
   * exactly why it looked like it worked. Most specific first: the base key, then what the base key
   * ENDS with, then the subtype, then the category.
   */
  const named = WEAPON_PATTERNS[key]
    || Object.entries(WEAPON_PATTERNS).find(([k]) => key.endsWith('_' + k))?.[1]
    || WEAPON_PATTERNS[item.subtype]
    || CATEGORY_PATTERNS[item.weaponCategory] || CATEGORY_PATTERNS.heavy;
  const two = !!item.twoHanded;
  const listed = !!(WEAPON_PATTERNS[key] || WEAPON_PATTERNS[item.subtype]
    || Object.entries(WEAPON_PATTERNS).find(([k]) => key.endsWith('_' + k)));
  const unlistedTwo = two && !listed;
  const traits = traitsOf(item);
  return {
    ...named,
    name: named.name || item.subtype || 'Weapon',
    reach: named.reach * (unlistedTwo ? TWO_HANDED_SCALE.reach : 1),
    arc: named.arc * (unlistedTwo ? TWO_HANDED_SCALE.arc : 1),
    every: named.every * (unlistedTwo ? TWO_HANDED_SCALE.every : 1),
    twoHanded: two,
    ranged: !!item.ranged || !!named.shoots,
    magic: item.weaponCategory === 'magic',
    traits,
    /**
     * The family damage multiplier. An unlisted two-hander gets the same 1.20 a real one does, so
     * "the game has never heard of this weapon" is not a reason to be worse than a longsword.
     */
    damageTrait: traits.damage ?? (unlistedTwo ? 1.20 : 1),
    wind: familyWind(item),
  };
}

/**
 * WHAT SHAPE THIS WEAPON'S SPELL IS, or null for anything made of steel.
 *
 * R17, reported in play: a staff's item card drew "· ⟋" — a dot and a slash — as its attack style,
 * which is a melee jab followed by a melee cut, which a staff has never done. The cause is two
 * lines apart in this file and neither of them is wrong on its own. `profileOf` falls back to
 * `CATEGORY_PATTERNS.magic` = `['jab', 'slash']` for anything with no pattern row, `patternGlyphs`
 * dutifully drew those two glyphs — and a staff's actual attack goes down `STAFF_SPELLS`, which
 * `patternGlyphs` had never heard of. The card was describing a fallback the weapon never uses.
 *
 * So a magic weapon resolves to a SPELL SHAPE instead: the `shape` its spell already carries
 * (`nova`, `cone`, `wave`, `lob`, `ground`, `chain`), or `bolt` for a wand, whose variety lives in
 * `WAND_BEHAVIOURS` rather than in a shape. The glyph and the caption come out of the same row of
 * `js/spellshapes.js`, so the picture and the words cannot drift apart.
 *
 * Returns `{ key, label, note, aim, svg, spell, element }`, or null when the weapon is not one that
 * casts. A raw `quarterstaff` is deliberately NOT one: items.json files it `magic` + `twoHanded`
 * and `isStaff()` excludes it by name, for the reason written on that function.
 */
export function spellShapeOf(item) {
  if (!item || item.type !== 'weapon') return null;
  const el = elementFacts(item);
  if (isStaff(item)) {
    const spell = staffSpell(item, el?.element || 'arcane');
    const row = shapeRow(spell.shape);
    return { ...row, spell, element: el?.element || 'arcane', elementName: el?.name || 'Arc' };
  }
  if (isWand(item)) {
    /**
     * A WAND THROWS A BOLT — AN ORB DOES NOT, and `isWand()` cannot tell them apart.
     *
     * `isWand()` is "magic and one-handed", which is a wand, a sceptre, an orb and a tome. Only a
     * wand is made `ranged` (`RANGED_CASTERS` in js/rpg.js has exactly one entry), and js/main.js
     * throws a bolt only `if (weapon.castElement && weapon.ranged)` — so an orb is swung, and its
     * element rides the blow. Captioning one "a bolt at what you point at" would be a card
     * describing behaviour the weapon does not have, which is the fault this whole item is about.
     */
    if (isRangedWeapon(item)) {
      const how = wandBehaviour(item);
      return { ...SPELL_SHAPES.bolt, spell: null, behaviour: how, element: el?.element || null, elementName: el?.name || null };
    }
    return { ...SPELL_SHAPES.brand, spell: null, element: el?.element || null, elementName: el?.name || null };
  }
  return null;
}

/**
 * Does the attack button cast, rather than swing?
 *
 * A staff's attack IS the spell and a wand's IS the bolt, so on those two the card should draw the
 * spell shape instead of a rhythm. An orb, a tome and a sceptre are swung with the element on them,
 * so their rhythm is still the thing worth drawing and the brand is an extra fact beside it.
 */
export function castsInsteadOfSwinging(item) {
  return isStaff(item) || (isWand(item) && isRangedWeapon(item));
}

/**
 * The glyph row a card draws.
 *
 * For a weapon you swing, one glyph per strike in the pattern — the rhythm, which is what the
 * original ask was about ("the attack pattern should be indicated on the weapon using some type of
 * glyphs"). For a weapon that CASTS, one spell-shape glyph, because a staff has no rhythm to draw.
 *
 * THIS RETURNS SVG MARKUP FOR A CASTER, and a string of unicode glyphs for everything else. That
 * looks odd until you notice where it goes: js/hud.js drops it straight into `innerHTML` inside
 * `<span class="glyphs">`, and has done since round 14. Returning the picture from the same
 * function that already returned the picture means the fix is live without hud.js changing at all —
 * which matters this round, because hud.js is not ours to edit and an unapplied patch is the same
 * bug by another route. `spellShapeOf()` is there for any screen that wants the pieces separately.
 */
export function patternGlyphs(item) {
  // only a weapon whose attack IS the spell gives up its rhythm row for a spell glyph; an orb is
  // swung with an element on it, and its rhythm is still the thing worth drawing
  const shape = castsInsteadOfSwinging(item) ? spellShapeOf(item) : null;
  if (shape) return shape.svg;
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
/**
 * R21 — and it says what the element DOES, in numbers. (WORDING.md, which quotes three of these as
 * the reason the standard was written: "Sets what it hits alight" — alight with what? for how long?
 * how much?) Every line below is data/skills.json's `statuses` row carried at the power js/main.js
 * `brandHit` hands it, which is 70% of the hit's damage — so burning's 0.3/s over 5s is
 * 0.3 x 5 x 0.7 = about 105% of the hit again. Damage over time is stated as a TOTAL, never per
 * second. Holy is here and is not in `CAST_ELEMENTS`, so `statusOf` leaves it with no status at all.
 */
const ELEMENT_WORDS = {
  fire: { name: 'Flame', does: 'a hit also sets Burning, about 105% of that hit\'s damage again as fire damage over 5s' },
  ice: { name: 'Rime', does: 'a hit also sets Chilled, and the target moves 45% slower for 4s' },
  lightning: { name: 'Storm', does: 'a hit also sets Shocked, and the target takes 30% more damage from every source for 5s' },
  poison: { name: 'Blight', does: 'a hit also sets Poisoned, about 146% of that hit\'s damage again as poison damage over 8s' },
  shadow: { name: 'Gloom', does: 'a hit also sets Cursed, and the target takes 25% more damage and moves 15% slower for 8s' },
  arcane: { name: 'Arc', does: 'plain arcane damage, and the one element that leaves no status on the target' },
  holy: { name: 'Dawn', does: 'plain holy damage, which leaves no status on the target' },
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
    /**
     * R17 — "free to use" was true when this was written and has not been since round 14: the tap
     * is free, and the CHARGE spends mana per second held (`STAFF_CHARGE.mana`). Saying "free"
     * beside a bar that drains your mana is worse than saying nothing.
     */
    const spell = staffSpell(item, el?.element || 'arcane');
    const row = shapeRow(spell.shape);
    castLine = `${spell.name} — ${row.label.toLowerCase()}, cast instead of a swing. `
      + 'A tap is free; holding it builds the spell and spends mana.';
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
    /**
     * R17 — the reach and the clock used to be here AND in `patternText` two lines below it on the
     * same card. The rhythm line is the one that knows what the pattern is, so it keeps the
     * numbers; this sentence says what the thing IS and hands the hands over.
     */
    line = `A ${twoHands ? 'two' : 'one'}-handed ${family.toLowerCase()}${attuned}, swung in melee. ${handNote}`;
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
  /**
   * R17 — AND IT SAYS IT ONCE.
   *
   *   "The staff tooltip 'A two-handed staff, attuned to (element) … off hand stays empty' is
   *    repeated twice in the tooltip."
   *
   * It was, word for word. `describeWeapon` writes `weaponFacts().line` onto the item as
   * `item.weaponLine`, and js/hud.js prints that; then, because a staff is not `ranged` (only a
   * wand is — see `RANGED_CASTERS` in js/rpg.js), the card fell into its `rangeClass === 'melee'`
   * branch and printed `patternText(item)` underneath — and `patternText` opened by returning
   * `f.line`, the identical string. Two printers, one sentence, no way for either of them to know.
   *
   * The block below is the one that belongs here: what the weapon DOES when you press the button,
   * which the headline sentence never says. For a caster that is the spell and its shape; for a
   * blade it is the rhythm. Neither repeats the sentence above it.
   */
  const shape = castsInsteadOfSwinging(item) ? spellShapeOf(item) : null;
  if (shape) {
    const spell = shape.spell;
    const size = spell?.radius ? `about ${fmt(spell.radius, { decimals: 1 })} m across`
      : spell?.range ? `out to about ${fmt(spell.range, { decimals: 1 })} m`
      : f.shotRange ? `out to about ${fmt(f.shotRange)} m`
      : null;
    const name = spell?.name || (shape.elementName ? `${shape.elementName} bolt` : 'Bolt');
    return withNote(`${name} — a spell, ${shape.label.toLowerCase()}${size ? `, ${size}` : ''}.`, item);
  }
  if (f.ranged) {
    const plan = rangedPlan(item);
    const how = plan?.kind === 'draw' ? 'Drawn and loosed'
      : plan?.kind === 'reload' ? `One heavy bolt, then ${fmt(plan.reload)}s to crank it back`
      : 'Thrown';
    return withNote(`${how} — about ${fmt(f.shotRange)} m.`, item);
  }
  const p = profileOf(item);
  const names = p.pattern.map(k => STRIKES[k]?.name || k);
  /**
   * Same rule as the caster branch: no headline, no hand note. Both are already on the line above
   * this one (`item.weaponLine`), and the reach and the clock were printed twice for every melee
   * weapon in the game for exactly the same reason the staff sentence was. What is left is the one
   * thing only this line knows — the rhythm.
   */
  /** An orb, a tome or a sceptre: a swing with an element on it, so say both. */
  const brand = isWand(item) ? spellShapeOf(item) : null;
  return withNote(`${names.join(', then ')} — ${fmt(p.reach, { decimals: 1 })} m reach, `
    + `a swing every ${fmt(p.every)}s.${brand ? ` ${brand.label}.` : ''}`, item);
}

/**
 * Glue the charge note on, and nothing at all when there is none.
 *
 * `inputNote` returns an empty string for every weapon that simply swings, so joining it in with a
 * template literal would have left a trailing space on the card for most of the game's weapons.
 */
function withNote(text, item) {
  const note = inputNote(item);
  return note ? `${text} ${note}` : text;
}

/**
 * WHICH CLIP A STRIKE PLAYS.
 *
 * Every attack in the game played the same overhead chop: shooting a bow, casting from a staff,
 * stabbing with a rapier and cleaving with an axe were one animation. The clips themselves are in
 * `avatar-3d/js/chibi2-motion.js` (added as an opt-in list, so Emberveil's set is untouched); this
 * is the table that picks one, and it is here rather than in the renderer because the shape and
 * the handedness both live in this module.
 *
 * A one-handed `slash` alternates `slash` and `slashBack` so a combo reads as a combo instead of
 * the same swing three times. A two-handed anything sweeping uses the locked-arms `sweep`.
 */
const CLIPS = {
  jab: { one: 'jab', two: 'jab' },
  slash: { one: 'slash', alt: 'slashBack', two: 'sweep' },
  thrust: { one: 'thrust', two: 'thrust' },
  sweep: { one: 'slash', alt: 'slashBack', two: 'sweep' },
  cleave: { one: 'slash', alt: 'slashBack', two: 'sweep' },
  overhead: { one: 'overhead', two: 'overhead' },
  arc: { one: 'arcCut', two: 'arcCut' },
  slam: { one: 'slam', two: 'slam' },
  lunge: { one: 'lunge', two: 'lunge' },
  shot: { one: 'shoot', two: 'shoot' },
};
/** How long each clip runs, so `setRate` can stretch it onto the swing's real wind-up. */
export const CLIP_SECONDS = {
  slash: 0.5, slashBack: 0.5, thrust: 0.42, overhead: 0.85, sweep: 0.92, jab: 0.26,
  arcCut: 0.62, slam: 1.05, lunge: 0.55, shoot: 0.6, reload: 1, castPoint: 0.35,
  castStaff: 0.7, channel: 1.6, attack: 0.85, cast: 1.25,
};

/** The clip for one strike of one weapon. `step` alternates the two sword cuts. */
export function clipFor(shapeKey, { twoHanded = false, step = 0 } = {}) {
  const row = CLIPS[shapeKey];
  if (!row) return 'attack';
  if (twoHanded) return row.two;
  return row.alt && step % 2 === 1 ? row.alt : row.one;
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
    /**
     * The weapon this strike came from, carried so a reader downstream can tell WHICH HAND swung.
     * js/main.js resolves both hands through the same `field.strike`, passing only a power, so
     * without this there is no way to know that the off hand's own dice should be rolled.
     */
    item,
    reach: p.reach * shape.reach,
    arc: p.arc * shape.arc,
    /**
     * THE FAMILY BONUS, folded into the strike's own damage share.
     *
     * `js/main.js` resolves a swing as `power: share * shape.damage`, so a multiplier put here is
     * the whole of the two-hander bonus, the dagger's 0.80 and the halberd's 1.20 — applied in one
     * place, read by every caller, and visible to the tests without a browser.
     */
    damage: shape.damage * (p.damageTrait ?? 1),
    baseDamage: shape.damage,
    every: p.every * shape.wind,
    traits: p.traits || {},
    family: p.name,
    twoHanded: !!p.twoHanded,
    ranged: !!p.ranged,
    magic: !!p.magic,
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
export const OFFHAND_DAMAGE = 0.60;

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
  const out = {
    ...strike,
    reach: strike.reach * reachK,
    arc: Math.min(Math.PI * 1.6, strike.arc * k),
    splash: (strike.splash || 1) * k,
    scale: k,
  };
  /**
   * A CHARGED STAFF IS BIGGER AND IT HITS HARDER.
   *
   * The controller posts what the channel built on the frame it was released (js/player.js). Both
   * numbers a staff's spell reads — the radius, through `scale`, and its share of a full hit — are
   * on this object, so folding the charge in here is the whole of it. It is consumed, so the next
   * ordinary swing is an ordinary swing.
   */
  /**
   * …and only a STAFF may spend it. `chargeAt` posts on every frame the button is held, so the
   * charge sits on the channel until something takes it; without this guard the next ordinary
   * sword swing after you put a staff away would collect a 1.6x multiplier it never built.
   * `strike.magic` and `strike.twoHanded` both come off `profileOf`, which is exactly `isStaff`'s
   * test spelled in the fields the strike already carries.
   */
  const charge = (strike.magic && strike.twoHanded) ? feel.swing.charge : null;
  if (charge) {
    feel.swing.charge = null;
    out.scale *= charge.radius ?? 1;
    out.damage *= charge.power ?? 1;
    out.charge = charge;
  }
  /**
   * AND THIS IS WHERE THE SWING IS ANNOUNCED.
   *
   * `js/main.js` calls `withArea(strikeAt(weapon, step))` exactly once, inside `swingWith`, on the
   * frame a swing happens — and then hands the pieces of it (a reach, an arc, a power) to four
   * different systems, none of which is told WHICH SHAPE it is. That is why a hammer smash and a
   * dagger jab drew the same white ring: nothing downstream knew the difference.
   *
   * Posting the whole shape here gives `combat-fx.js`, `actors.js` and the animation chooser one
   * record to read instead of three guesses, without main.js having to pass it to each of them.
   * It is a side effect in an otherwise pure function, which is why it is spelled out at length.
   */
  feel.postSwing(out);
  return out;
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
    /**
     * R17 — "Unmaking" became "Arc Burst".
     *
     *   "I think this is referred to as 'Unmaking' in the tooltip but I don't like that descriptor."
     *
     * It was the name of the arcane nova, and it described nothing: "unmaking" is a mood, not a
     * shape, and the player who reported it had been casting it for an hour without knowing it went
     * off around his own feet. The new name says the element ("Arc" is what the game already calls
     * arcane, on the item itself) and what it does. `STAFF_SPELLS` is Farhold's own table — it does
     * not exist in Emberveil and it is not in the shared `data/items.json` — so the rename is local,
     * and a staff already carrying `staffSpell: 'nova'` in a save keeps the same spell under the new
     * word, because the save stores the KEY and not the name.
     */
    { key: 'nova', name: 'Arc Burst', shape: 'nova', radius: 5.5, mult: 0.95 },
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
  { key: 'plain', name: 'true-flying', desc: 'a single bolt, fast and straight', projectiles: 1, splash: 1.3 },
  { key: 'burst', name: 'bursting', desc: 'the bolt bursts on impact', projectiles: 1, splash: 3.2, mult: 0.95 },
  { key: 'split', name: 'splitting', desc: 'throws three bolts in a fan', projectiles: 3, spread: 0.16, splash: 1.1, mult: 0.55 },
  { key: 'chain', name: 'chaining', desc: 'jumps from what it hits to what is behind it', projectiles: 1, chains: 2, splash: 1.2, mult: 0.8 },
  { key: 'seeking', name: 'seeking', desc: 'turns after what you aimed at', projectiles: 1, homing: 1, splash: 1.3, mult: 0.9 },
  { key: 'heavy', name: 'heavy', desc: 'one slow bolt that lands hard', projectiles: 1, splash: 2.6, mult: 1.45, slow: 0.6, speed: 34 },
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

/**
 * A STAFF IS A SIEGE ENGINE, NOT A PISTOL.
 *
 * A wand always works, never runs dry and is never the biggest number. A staff asks you to stop,
 * commit and spend something — and what comes out is enormous. Before this, a staff cast a free
 * shaped spell every 0.6 s for nothing at all, which made it simultaneously the strongest weapon in
 * the game and the least interesting.
 *
 *   under `min`   nothing: the topper flickers and goes out
 *   at `min`      0.60x damage, 0.7x radius — one shard orbiting
 *   at `full`     1.00x, 1.0x — three shards, the rune disc complete
 *   at `max`      1.60x, 2.0x — the disc cracks the ground
 *
 * A TAP is still free and still weak; only the charge costs mana. `mana` is per second held.
 */
export const STAFF_CHARGE = {
  min: 0.35, full: 1.40, max: 2.60,
  powerMin: 0.60, powerFull: 1.00, powerMax: 1.60,
  radiusMin: 0.7, radiusFull: 1.0, radiusMax: 2.0,
  tapPower: 0.60, tapRadius: 0.8,
  mana: 4,
  /** A blow worth more than this share of your health knocks you out of the channel. */
  breakAt: 0.25,
  /** You move at this share of your speed while the staff is building. */
  moveWhile: 0.6,
};

/**
 * R19 — THE BALANCE FILE IS THE KNOB, AND THIS IS THE ONE PLACE IT ARRIVES.
 *
 * `data/balance.json` has carried `player.ranged` and `player.staff` since round 14, and both
 * blocks' own `_doc` pointed here and said the live copy was in this file. That is backwards: the
 * point of a balance file is that these get tuned without opening a module. Worse, the two copies
 * are spelled differently — `chargeMin` here is `min` there, `hitStopMaxMs` is milliseconds where
 * the code holds seconds — so a designer who edits the file gets no error and no effect. They all
 * agree today, which is exactly what makes it a bug waiting rather than a bug: the day someone
 * tunes the file, the game does not move, and the next hour goes on finding out why.
 *
 * It mutates in place rather than returning a new table, because `RANGED` and `STAFF_CHARGE` are
 * read BY REFERENCE from js/player.js and js/rpg.js (`plan.charge = STAFF_CHARGE`), and both hold
 * that reference from before this runs. Called once, from main.js, at boot — the same shape as
 * `alignCatalogue()` in js/buildplan.js, which joins two vocabularies once and then nobody thinks
 * about it again. Every knob is optional; an absent one leaves the value the file above sets.
 *
 * @param {object} cfg `balance.player` — `.ranged` and `.staff` are read.
 */
export function tuneWeapons(cfg = {}) {
  const r = cfg.ranged || {}, s = cfg.staff || {};

  const set = (obj, key, v) => { if (Number.isFinite(v)) obj[key] = v; };

  // Draw weights that differ per bow stay per bow: a shortbow's 0.28 s draw is not the shared one.
  set(RANGED.bow, 'min', r.bowDrawMin);
  set(RANGED.bow, 'full', r.bowDrawFull);
  set(RANGED.bow, 'powerFull', r.bowPowerFull);
  // …but the floor a part-drawn bow pays is the same 0.55 on all three, so it IS the shared one.
  if (Number.isFinite(r.bowPowerMin)) {
    for (const key of ['bow', 'shortbow', 'longbow']) set(RANGED[key], 'powerMin', r.bowPowerMin);
  }
  set(RANGED.crossbow, 'reload', r.crossbowReload);
  set(RANGED.crossbow, 'power', r.crossbowPower);

  set(STAFF_CHARGE, 'min', s.chargeMin);
  set(STAFF_CHARGE, 'full', s.chargeFull);
  set(STAFF_CHARGE, 'max', s.chargeMax);
  set(STAFF_CHARGE, 'mana', s.channelMana);
  set(STAFF_CHARGE, 'breakAt', s.breakAtShareOfHealth);
  set(STAFF_CHARGE, 'moveWhile', s.moveWhileChannelling);

  return { ranged: RANGED, staff: STAFF_CHARGE };
}

/**
 * What the staff has built up after `held` seconds.
 *
 * `ready` false means a release right now is a TAP: the same shaped spell, free, at 0.60x. That is
 * deliberate — a staff that refuses to do anything for a third of a second reads as broken.
 */
export function chargeAt(held = 0, c = STAFF_CHARGE) {
  let out;
  if (!(held > 0)) {
    out = { ready: false, tap: true, power: c.tapPower, radius: c.tapRadius, fill: 0, mana: 0 };
  } else if (held < c.min) {
    out = { ready: false, tap: true, power: c.tapPower, radius: c.tapRadius, fill: held / c.min * 0.3, mana: 0 };
  } else {
    let power, radius, fill;
    if (held <= c.full) {
      const k = (held - c.min) / Math.max(0.001, c.full - c.min);
      power = c.powerMin + (c.powerFull - c.powerMin) * k;
      radius = c.radiusMin + (c.radiusFull - c.radiusMin) * k;
      fill = 0.3 + k * 0.5;
    } else {
      const k = Math.min(1, (held - c.full) / Math.max(0.001, c.max - c.full));
      power = c.powerFull + (c.powerMax - c.powerFull) * k;
      radius = c.radiusFull + (c.radiusMax - c.radiusFull) * k;
      fill = 0.8 + k * 0.2;
    }
    out = { ready: true, tap: false, power, radius, fill, mana: c.mana * Math.min(held, c.max) };
  }
  /**
   * R17 — AND THIS IS THE LINE THAT MAKES THE CHARGE REAL.
   *
   *   "Also it seems I can hold to charge the spell before releasing, does holding it actually do
   *    anything? If not, it should repeatedly use the spell instead."
   *
   * It did not. Holding the staff did nothing whatsoever, and the reason is a channel with a reader
   * and no writer — the signature fault of the last four rounds, found again:
   *
   *   js/player.js  builds `self.windCharge = { power, radius, tap, fill }` on release and hands it
   *                 out as `out.charge` from the controller step.
   *   js/main.js    never reads `step.charge`. `swingWith` takes the strike and the area stat and
   *                 nothing else.
   *   js/weapons.js `withArea` reads `feel.swing.charge` — a property NOTHING in the codebase ever
   *                 assigned. A grep for `swing.charge` returns this file and nothing else.
   *
   * So `shape.charge` was permanently undefined, which took the whole of round 15 down with it:
   * `chargedForm()` is gated on `shape.charge && !shape.charge.tap`, so the jet, the dome, the
   * wall, the field, the mortar and the storm — six charged forms and about 130 lines of main.js —
   * had never once fired, and the 0.60x–1.60x damage and 0.7x–2.0x radius were multiplied by one.
   *
   * `chargeAt` is the fix because it is the one function BOTH halves already call: js/player.js
   * runs it every frame while the button is down and once more on release, with the held time. The
   * last call before a staff's swing is therefore always exactly the charge that was released, so
   * posting the answer here puts the value on the channel that `withArea` has been reading all
   * along. No main.js change, no player.js change, one writer.
   *
   * `withArea` consumes it and only for a staff swing (see there), so a melee swing can never pick
   * up a charge left lying on the channel.
   */
  feel.swing.charge = out;
  return out;
}

/**
 * EVERY STAFF CARRIES TWO SPELLS, not one — the tap and the charged form, and for three of the four
 * shapes the charged form is a different KIND of thing.
 *
 * `hold` is what a released charge becomes. `cone` becomes a sustained jet, a `nova` becomes a dome
 * that pushes everything out when it pops, a `wave` becomes a wall that stays and burns anything
 * crossing it, and a `lob` becomes a mortar. Anything without a `hold` simply fires bigger.
 */
export const CHARGED_FORMS = {
  cone: { shape: 'jet', name: 'sustained', sustain: true, ticks: 5, manaPerSecond: 4, rangeScale: 1.45, note: 'held down, it becomes a jet' },
  nova: { shape: 'dome', name: 'dome', push: 2.4, note: 'a dome that shoves everything out when it pops' },
  wave: { shape: 'wall', name: 'wall', seconds: 3, note: 'a wall that stands for three seconds' },
  ground: { shape: 'wall', name: 'field', seconds: 4, note: 'the ground stays poisoned' },
  lob: { shape: 'mortar', name: 'mortar', aimed: true, note: 'a mortar you aim before it drops' },
  chain: { shape: 'storm', name: 'storm', chains: 5, note: 'it jumps five times instead of three' },
};

/** The charged form of a staff's spell. Never null — a shape with no entry just fires bigger. */
export function chargedForm(spell) {
  if (!spell) return null;
  return CHARGED_FORMS[spell.shape] || { shape: spell.shape, name: 'greater', note: 'the same spell, much larger' };
}

/** Is this a staff — a weapon whose attack is a spell rather than a swing? */
export function isStaff(item) {
  if (!item) return false;
  // A QUARTERSTAFF IS A POLE. `items.json` files it under `magic` and it is shared with Emberveil,
  // so it cannot be fixed there; `rpg.attuneWeapon` writes `light` onto the item and this guard
  // catches the case where a card is drawn from a raw base before anything attuned it. Without it
  // the monk, the bard, the druid, the shaman and the scavenger all started the game holding the
  // highest sustained area damage in the game.
  if ((item.baseKey || item.subtype) === 'quarterstaff') return false;
  if (item.weaponCategory !== 'magic') return false;
  return !!item.twoHanded;
}

/** Is this a wand — a magic weapon that throws a bolt? */
export function isWand(item) {
  if (!item) return false;
  return item.weaponCategory === 'magic' && !item.twoHanded;
}

// ------------------------------------------------------------------ the ramp, said out loud

/**
 * R17 — WHAT THE CHARGE IS DOING, IN THE FOUR WORDS A BAR NEEDS.
 *
 *   "If charging it does increase its power, we need visual indicators to let you know when it has
 *    ramped up and when it is finished ramping up so that the player can execute it correctly."
 *
 * Two separate things had to be true for the player to see anything, and neither was:
 *
 *   1. the charge had to DO something — it did not; see the note on `chargeAt` above;
 *   2. something had to draw it. `js/hud.js` `chargeMeter()` builds `<div class="charge-meter">`
 *      every frame the button is down… and there is not one `.charge-meter` rule in style.css, or
 *      in any stylesheet in the project. A bare `<div>` with a bare `<i>` inside it: no size, no
 *      background, and `width: %` on an inline element does nothing at all. The meter has been
 *      running, invisibly, since round 15. `js/combat-fx.js` now injects the stylesheet.
 *
 * This is the third piece: the STATES, named once here so the bar, the log line and any future
 * readout all agree on where "fully charged" is.
 *
 *   short  under the floor — a release now is the free tap, not the spell you were building
 *   ready  past the floor and building
 *   near   inside the last fifth before full
 *   full   at the ceiling. It releases itself here (js/player.js `autoLoose`), which is the
 *          "finished ramping up" the player asked to be able to see.
 */
export const CHARGE_STATES = ['short', 'ready', 'near', 'full'];

export function chargeState(fill = 0, ready = false) {
  if (!ready) return 'short';
  if (fill >= 0.99) return 'full';
  return fill > 0.8 ? 'near' : 'ready';
}

/**
 * The bar's whole datum, from the controller's live `charge` object (js/player.js `self.charge`).
 *
 * Never throws and never returns undefined: with nothing charging it hands back `{ active: false }`,
 * which is the one thing the drawing code has to be able to ask.
 */
export function chargeReadout(charge) {
  if (!charge || !(charge.fill > 0)) return { active: false, fill: 0, ready: false, state: 'short', label: '' };
  const fill = Math.max(0, Math.min(1, charge.fill));
  const ready = !!charge.ready;
  const state = chargeState(fill, ready);
  return {
    active: true,
    fill, ready,
    state,
    full: state === 'full',
    kind: charge.kind || 'charge',
    power: charge.power ?? 1,
    radius: charge.radius ?? 1,
    /** One word under the bar. "Release" is deliberately the loudest, because it is the instruction. */
    label: state === 'full' ? 'Release'
      : state === 'near' ? 'Almost'
      : state === 'ready' ? (charge.kind === 'draw' ? 'Drawing' : 'Building')
      : (charge.kind === 'draw' ? 'Nocking' : 'Tap'),
  };
}
