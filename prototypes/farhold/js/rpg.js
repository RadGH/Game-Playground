// Farhold — the role-playing rules: stats, levels, gear and loot.
//
// Pure JavaScript, no DOM and no Three.js, so the node tests drive the same code the game does.
// Items come from Emberveil's generator (`prototypes/emberveil/js/loot.js` + `data/items.json`):
// bases, rarities, qualities, affixes, uniques and set pieces are all already there, so this file
// only has to decide *what* drops and what an affix does to a character standing in a field.
//
//   import { Rpg } from './rpg.js';
//   const rpg = new Rpg(itemsData, balance);
//   const player = rpg.createPlayer({ name: 'Wren', classId: 'ranger' });
//   rpg.equip(player, rpg.rollDrop({ level: 3 }));
//
// Round 4: every affix an item can roll is wired. `js/effects.js` is the registry — 63 affix stats
// and 24 legendary powers, each with a meaning that makes sense in real time rather than in
// Emberveil's turn order. Anything the registry has still never heard of is declared on the sheet
// rather than swallowed (`derived.inert`), which is the guard that found the dead ones.

import { Loot } from '../../emberveil/js/loot.js';
import { makeRng } from '../../emberveil/js/rng.js';
import { tuneAffixData, affixAllowed, rollAffixValue, itemLevelFor, requirementFor, tierFor, capValue, roundFor, scrubRetired, FARHOLD_AFFIXES } from './affixes.js';
import { SLOT_AFFIX_LIST, startingVehicles } from './gear.js';
import { buildForest, perkBonuses, pointsFor, pointsLeft } from './perks.js';
import {
  handsOf, profileOf, offhandRefusal, quiverGoesWith, OFFHAND_DAMAGE, markHands, describeWeapon,
  strikeAt, traitsOf, familyWind, rangedPlan, clipFor, CLIP_SECONDS, isStaff, isWand, STAFF_CHARGE,
} from './weapons.js';
// `incomingFrom` is the one place a status's "takes more of everything" is turned into a number.
// js/main.js applies it when an ENEMY swings and never when the player does, so shock, marks and
// every Branding talent were doing nothing to an enemy. See `strike` for how it is applied once.
import { incomingFrom, outgoingFrom } from './skills.js';
// Emberveil already worked out twenty passive nodes and a tree per class. Reuse them rather than
// invent a second set that means the same thing.
import { passiveTree, PASSIVE_NODES, TALENT_LEVELS, PASSIVE_EVERY } from '../../emberveil/js/rules.js';
// Round 4: every affix an item can carry now does something. `js/effects.js` is the registry.
import { Effects, STAT_FIELDS, effectFor, describeAffix, isMagic, BRANDS } from './effects.js';

export { passiveTree, PASSIVE_NODES, TALENT_LEVELS, PASSIVE_EVERY };
export { describeAffix, effectFor };

/**
 * Which passive-node fields this game actually reads. The rest are carried and declared, the same
 * way unimplemented affixes are — see `derived.inert`.
 */
export const LIVE_PASSIVES = {
  maxHp: 'maxHp', maxMp: 'maxMp', hpRegen: 'hpRegen', mpRegen: 'mpRegen',
  blockChance: 'blockChance', dodgePct: 'dodge', critPct: 'critChance',
  lifesteal: 'lifeStealFrac', resistAll: 'resistAll', thorns: 'thorns',
  hpOnKill: 'hpOnKill', manaOnKill: 'manaOnKill',
};

/** What a suit of armour looks like on a Chibi 2 body, by the base's tier. */
export const ARMOUR_LOOK = {
  head: { cloth: 'hood', light: 'feather_cap', medium: 'hood', scaled: 'horned_helm', heavy: 'horned_helm', plate: 'dragon_helm', runed: 'hood' },
  chest: { cloth: 'robe', light: 'strapped_leather', medium: 'tunic', scaled: 'scale_plate', heavy: 'plate', plate: 'plate', runed: 'trim_robe' },
  legs: { cloth: 'baggy', light: 'pants', medium: 'pants', scaled: 'greaves', heavy: 'greaves', plate: 'greaves', runed: 'baggy' },
  feet: { cloth: 'sandals', light: 'boots', medium: 'boots', scaled: 'heavy', heavy: 'heavy', plate: 'heavy', runed: 'slippers' },
};

/**
 * Affixes that add a plain number to the sheet. Kept as an export because it is the name the tests
 * and the character sheet already use, but the table itself now lives in the effect registry —
 * *every* affix is live in round 4, so there is no longer a "live" list and a dead one.
 */
export const LIVE_STATS = STAT_FIELDS;

/**
 * The elements a magic weapon can be made of, and what each one leaves behind.
 *
 * A wand is not a club. Round 4b made every wand a **ranged** weapon that throws its own element,
 * decided once from the item's own id so a given wand is always the same wand, and shown on the card.
 * Everything here routes through `magicResist` rather than armour (see `strike`), and applies the
 * status named below, so picking a fire wand over an ice one is a real decision.
 */
export const CAST_ELEMENTS = [
  { element: 'fire', name: 'Flame', status: 'burn', color: '#ff8a40', desc: 'sets what it hits alight' },
  { element: 'ice', name: 'Rime', status: 'chill', color: '#9fd8ff', desc: 'slows what it hits' },
  { element: 'lightning', name: 'Storm', status: 'shock', color: '#ffe86a', desc: 'leaves the target taking more of everything' },
  { element: 'poison', name: 'Blight', status: 'poison', color: '#9ede6a', desc: 'keeps working after it lands' },
  { element: 'shadow', name: 'Gloom', status: 'curse', color: '#c090ff', desc: 'curses what it hits' },
  { element: 'arcane', name: 'Arc', status: null, color: '#b8a0ff', desc: 'raw force — no status, but the hardest hitting' },
];
/** Which weapon subtypes cast rather than swing. */
const CASTERS = new Set(['wand', 'scepter', 'orb', 'staff', 'tome']);
/** Only a wand becomes a true ranged caster; a staff is still swung, but it is branded. */
const RANGED_CASTERS = new Set(['wand']);

/** A stable 0..1 from a string, so the same item always has the same element. */
function hashOf(text) {
  let h = 2166136261;
  for (let i = 0; i < String(text).length; i++) { h ^= String(text).charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Give a magic weapon its element. Called on everything the generator hands back, so a wand out of a
 * chest, a drop, a shop or the crafting bench all behave the same.
 */
export function attuneWeapon(item) {
  if (!item || item.type !== 'weapon') return item;
  /**
   * HOW MANY HANDS IT TAKES, written onto every weapon that passes through here.
   *
   * "Swords cannot be equipped in the off-hand, and it is not clear which weapons are one- or
   * two-handed." `items.json` only marks `offHandOk` on the four caster bases — wand, scepter, orb,
   * tome — so a one-handed sword was refused the off hand by every reader that asked. That file is
   * SHARED with Emberveil, which has its own rules and its own test over it, so the flag is set on
   * the ITEM here instead of in the data. See `markHands` in js/weapons.js for the rule.
   */
  markHands(item);
  const sub = item.subtype || item.baseKey;
  /**
   * A QUARTERSTAFF IS A POLE, AND items.json SAYS IT IS A WAND.
   *
   * It is filed `weaponCategory: "magic", twoHanded: true`, which is exactly the test `isStaff()`
   * uses — so a quarterstaff cast a free shaped area spell on its own four-strike pattern, one
   * every 0.41 seconds, the highest sustained area damage in the game. It is also the STARTING
   * WEAPON of the monk, the bard, the druid, the shaman and the scavenger.
   *
   * `items.json` is shared with Emberveil and has a test over it, so the fix goes on the ITEM here,
   * the same way `ranged`, `castElement`, `offHandOk` and every `describeWeapon` field already do.
   * Its damage becomes physical, which also takes away the `spellPower` multiplier it should never
   * have had.
   */
  /**
   * R18 — …AND ITS SUBTYPE SAYS `staff`, SO THE NEXT BLOCK PUT IT ALL STRAIGHT BACK.
   *
   * Round 17 wrote the de-attune below and the round's own notes recorded it as NOT fixed. This is
   * why: `sub` is `item.subtype`, items.json files a quarterstaff's subtype as `staff`, and `staff`
   * is in `CASTERS`. So the de-attune set `castElement = null`, and two lines later
   * `CASTERS.has(sub) && !item.castElement` was TRUE — the clear was the very thing that re-armed
   * it. Proved by calling `attuneWeapon` on the raw base: out came "Arc Quarterstaff", arcane, with
   * a `cast_arcane` affix on it and an element topper from `heldLookFor`.
   *
   * The flag also has to be read INDEPENDENTLY of `weaponCategory`, because the de-attune only
   * fires while that still says `magic`: called a second time on the same item — a reload, a
   * re-roll at the bench — the block was skipped and the caster branch attuned it again anyway.
   */
  /**
   * R18 — A BRAND ON THE ITEM BECOMES THE ITEM'S ELEMENT.
   *
   * `elementOf()` reads `item.brand || item.castElement`, and the seven `cond_brand*` intrinsics set
   * a `brandElement` hook in the registry that NOTHING ever called. So all seven branded road
   * weapons swung the wrong thing: the Rimecut Sabre, Dawnwarden Hammer, Starwake Bow and Stormpin
   * Crossbow came out PHYSICAL — which also means their own "+30% of that element" could never
   * fire — while the Emberbrand Wand threw poison, the Bramble Staff cast ice and the Gravebound
   * Sceptre was arcane, because the element was a hash of the item id and matched the brand about
   * one time in six.
   *
   * Read here, where every other item-level fact is settled and every creation path already calls
   * in. `BRANDS` is imported rather than restated, so the seven ids have one home.
   */
  if (!item.brand) {
    for (const a of item.affixes || []) {
      const brand = BRANDS[a.stat];
      if (brand) { item.brand = brand[0]; break; }
    }
  }

  const isQuarterstaff = item.baseKey === 'quarterstaff' || sub === 'quarterstaff';
  if (isQuarterstaff) {
    // Unconditionally, NOT behind `weaponCategory === 'magic'`. Gating the clear on the category
    // was the original bug from the other side: an item that arrives already filed `light` but
    // still carrying a stale `castElement` — one persisted by an older build, or any path that
    // sets the category before attuning — sailed through with its element intact, and
    // `elementOf()` then routed its damage through `magicResist` and the spellPower multiplier.
    item.weaponCategory = 'light';
    item.castElement = null;
    item.castStatus = null;
  }
  if (!isQuarterstaff && CASTERS.has(sub) && !item.castElement) {
    // a brand put on at the bench wins over the base's own attunement
    const forced = item.brand;
    const pick = forced
      ? CAST_ELEMENTS.find(e => e.element === forced) || CAST_ELEMENTS[0]
      : CAST_ELEMENTS[Math.floor(hashOf(item.id || item.baseKey) * CAST_ELEMENTS.length)];
    item.castElement = pick.element;
    item.castStatus = pick.status;
    item.castName = pick.name;
    if (RANGED_CASTERS.has(sub)) {
      item.ranged = true;
      item.castRange = 34;
    }
    // it reads on the card like any other property
    if (!(item.affixes || []).some(a => a.stat === 'castElement')) {
      (item.affixes || (item.affixes = [])).push({
        id: 'cast_' + pick.element, name: pick.name, stat: 'castElement', value: 1,
        element: pick.element, baseIntrinsic: true, intrinsic: true,
      });
    }
    // and the name says what it is: "Flame Wand of Vitality"
    if (!item.isUnique && !item.setId && !item.name.startsWith(pick.name)) item.name = `${pick.name} ${item.name}`;
  }
  /**
   * AND THEN SAY WHAT IT IS, IN WORDS.
   *
   * "I got a weapon called 'truthseeker' that shoots a projectile. How am I supposed to know that
   * without testing it?" Truthseeker is a unique on the `wand` base, so the two lines above make it
   * ranged and give it an element — and nothing downstream said either out loud. `describeWeapon`
   * writes `weaponHeadline`, `weaponLine`, `rangeClass`, `gripWord`, `elementNote` and `castLine`
   * onto the item, and it runs LAST because the headline quotes the element the block above just
   * picked. See js/weapons.js.
   *
   * Every one of these fields is written on the ITEM, never into `data/items.json` — that file is
   * shared with Emberveil, which has its own registry and a test over every affix in it.
   */
  describeWeapon(item);
  return item;
}

/** What element an attack with this weapon carries. */
export function elementOf(item) {
  return item?.brand || item?.castElement || 'physical';
}
/** …and what status it leaves behind, if any. */
export function statusOf(item) {
  const el = elementOf(item);
  if (el === 'physical') return null;
  return CAST_ELEMENTS.find(e => e.element === el)?.status || null;
}

/**
 * Every place something can be worn.
 *
 * Round 4b added three: a **second ring** (there was one ring slot, which made the shift-to-compare
 * card compare against nothing), a **mount** slot so the horse is a thing you own rather than a key
 * you press, and a **light** slot so carrying a torch does not cost you your shield.
 */
/**
 * How often each property should turn up, relative to the others. The user's note: "plain damage,
 * minimum damage, maximum damage; these are the best stats especially for a weapon" — and the weird
 * conditionals "shouldn't be as common". Anything not listed falls back to `plainWeight` for an
 * ordinary stat and `exoticWeight` for a `cond_*` one.
 */
export const AFFIX_WEIGHT = {
  // what you actually want on a weapon
  dmg: 16, critChance: 10, critDamage: 9, str: 9, dex: 9, int: 9, con: 9,
  // what you actually want on armour
  hp: 14, armor: 12, magicResist: 8, dodge: 7, mp: 6,
  // good, but not every time
  spellPower: 6, lifeSteal: 5, hpRegen: 5, mana_regen: 5, initiative: 5,
  magicFind: 4, goldFind: 4, xpFind: 4, manaSteal: 3, cooldownReduction: 3,
  block_chance: 4, block_power: 4, barrier: 3, barrierRegen: 3,
  // the interesting ones: kept, but they are a find rather than the default
  cond_hpOnKill: 2, cond_manaOnAttack: 2, cond_manaOnCrit: 2, cond_thornsFlat: 2,
  cond_dmgVsUndead: 2, cond_dmgVsDemon: 2, cond_executeDmgPct: 2, cond_critArmorPen: 2,
  cond_physDmgReducePct: 2, cond_magicDmgReducePct: 2, cond_skillMpCostReduce: 2,
  cond_goldOnEliteKill: 2, cond_cheatDeath: 1,
};

export const SLOTS = [
  'weapon', 'offhand', 'head', 'chest', 'legs', 'hands', 'feet',
  'ring', 'ring2', 'necklace', 'mount', 'light',
  /**
   * R16 — THE TOOL SLOT.
   *
   * "Instead of having tool be based on weapon (no idea how that works) change it so you build new
   * tools." It was based on the weapon because there was nowhere else to look: js/main.js matched
   * the weapon's NAME against `/steel|iron|stone/` and called the result a tool tier. So a bow was
   * bare hands, a crystal staff was bare hands, and the refusal "you need a Steel Tool" pointed at
   * a slot that did not exist. It exists now. See js/tools.js.
   */
  'tool',
];
/** Slots whose contents are gear you fight with, for the "worth wearing" arrow. */
export const RING_SLOTS = ['ring', 'ring2'];
export const MAX_LEVEL = 50;

/**
 * XP needed to *reach* a level.
 *
 * "Raise the max level to 50, but make the curve from 30-40 take about as much xp as it does from
 * 1-30, and even worse through level 50."
 *
 * So the curve has three sections rather than one exponent. Levels 1–30 are the walk the game was
 * built around and keep their old, gentle shape. 30–40 is a second game of the same size stacked on
 * top: reaching 40 costs roughly twice what reaching 30 did. 40–50 is steeper again — the levels
 * you get on the hard worlds, and only there.
 */
export const LEVEL_BANDS = [
  { to: 30, base: 58, power: 1.86 },
  { to: 40, share: 1.0 },      // 30→40 costs about as much again as 1→30
  { to: 50, share: 1.9 },      // …and 40→50 costs nearly twice THAT
];

export function xpForLevel(level) {
  if (level <= 1) return 0;
  const l = Math.min(level, MAX_LEVEL);
  const early = n => Math.round(58 * Math.pow(n - 1, 1.86));
  if (l <= 30) return early(l);

  const toThirty = early(30);
  if (l <= 40) {
    // a smooth climb across the band, costing `share` of the whole first thirty levels
    const t = (l - 30) / 10;
    return Math.round(toThirty + toThirty * LEVEL_BANDS[1].share * Math.pow(t, 1.35));
  }
  const toForty = xpForLevel(40);
  const t = (l - 40) / 10;
  return Math.round(toForty + toThirty * LEVEL_BANDS[2].share * Math.pow(t, 1.45));
}

/**
 * How hard a world is, and therefore who belongs on it.
 *
 * "Let's categorize planets by difficulty and have low (1-30), medium (30-40), and high (40-50)
 * difficulty." A band is a level range and a name; `js/zones.js` lays its regions inside it, so a
 * medium world's easiest corner is still level 30.
 */
export const PLANET_BANDS = [
  { key: 'low', name: 'Settled space', min: 1, max: 30, blurb: 'Where anyone can make a start.' },
  { key: 'medium', name: 'The far reach', min: 30, max: 40, blurb: 'Nothing out here is anyone\'s first world.' },
  { key: 'high', name: 'The deep dark', min: 40, max: 50, blurb: 'Bring everything you have.' },
];

/**
 * Which band a world falls in, from WHAT KIND OF PLACE IT IS — never from a coin flip.
 *
 * The old rule added a point when the planet's seed happened to divide by three, which promoted
 * perfectly friendly breathable worlds to the far reach for no reason a player could see — and it
 * tested for two archetypes (`volcanic`, `irradiated`) that do not exist, so the genuinely nasty
 * lava and toxic worlds never got their bump. Both are fixed here.
 *
 * Everything in the score is something you can read off the survey panel before you fly there:
 *
 *   * the archetype's own `difficulty` (Star Forge gives living 0.2 … void-touched 0.95);
 *   * air you can breathe, which makes a world softer, and no air, which makes it harder;
 *   * sitting in the star's water zone, which is where the settled worlds are;
 *   * orbiting out past the frost line, and how far out it is among its own siblings.
 *
 * `forcedBand` still wins, because `balanceBands` uses it to guarantee a system has somewhere to go
 * at every level, and the starting world is stamped `low` so a level-1 character is never handed a
 * level-30 zone.
 */
export const BAND_CUTS = [0.5, 0.78];   // score < 0.5 low, < 0.78 medium, else high

export function bandForPlanet(planet, { force = null } = {}) {
  const want = force || planet?.forcedBand;
  if (want) return PLANET_BANDS.find(b => b.key === want) || PLANET_BANDS[0];
  const score = planetThreat(planet);
  return PLANET_BANDS[score < BAND_CUTS[0] ? 0 : score < BAND_CUTS[1] ? 1 : 2];
}

/** The 0–1.4ish number `bandForPlanet` cuts into three. Exported so the survey can show it. */
export function planetThreat(planet) {
  if (!planet) return 0;
  const NASTY = ['voidTouched', 'crystal', 'lava', 'toxic'];
  let score = Number(planet.difficulty) || 0.4;
  score += planet.atmosphere?.breathable ? -0.18 : 0.15;
  if (planet.orbit?.inZone) score -= 0.08;
  if (planet.orbit?.beyondFrost) score += 0.12;
  if (NASTY.includes(planet.archetype)) score += 0.1;
  // a moon of a giant is a harder place to stand than the world it circles
  if (planet.moon && planet.archetype !== 'living') score += 0.05;
  return Math.max(0, Math.round(score * 1000) / 1000);
}

export function levelFromXp(xp) {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpForLevel(l + 1)) l++;
  return l;
}

/**
 * ONE WEAPON'S SWING PLAN — every number js/player.js needs to run the three-part swing.
 *
 *   hold      'draw' for a bow, 'charge' for a staff, null for anything you click
 *   steps     one row per strike in the pattern: how long the wind-up is, what the whole cycle is,
 *             and which clip the body plays
 *   afterShot the nock after an arrow; `afterCast` the beat after a spell; a crossbow's reload
 *
 * Pure arithmetic over js/weapons.js, so the node tests drive it without a browser.
 */
function swingPlanFor(item, { off = false } = {}) {
  if (!item || item.type !== 'weapon') {
    return { hold: null, steps: [{ key: 'jab', windMs: 60, every: 0.46, clip: 'jab', clipSeconds: 0.26 }] };
  }
  const profile = profileOf(item);
  const two = !!profile.twoHanded;
  const steps = profile.pattern.map((key, i) => {
    const strike = strikeAt(item, i);
    return {
      key,
      windMs: familyWind(item) * (strike.wind || 1),
      every: strike.every,
      clip: clipFor(key, { twoHanded: two, step: i }),
      clipSeconds: CLIP_SECONDS[clipFor(key, { twoHanded: two, step: i })] || 0.5,
    };
  });
  const traits = traitsOf(item);
  /**
   * `flow` is the sabre's promise: if you keep connecting, the finisher costs a third of its clock.
   * The controller cannot see whether a strike landed, so the rule it runs is the honest half —
   * the LAST strike of a pattern you have stayed in is the cheap one. Miss, stop, or get knocked
   * off the rhythm and the pattern resets, which takes the discount with it.
   */
  const plan = { hold: null, steps, twoHanded: two, flow: !!traits.flow, guard: traits.guard || 0 };
  if (off) return plan;                       // the off hand never draws and never charges

  if (isStaff(item)) {
    plan.hold = 'charge';
    plan.charge = STAFF_CHARGE;
    plan.afterCast = 0.28;
    plan.clip = 'castStaff';
    plan.channelClip = 'channel';
    return plan;
  }
  if (isWand(item)) { plan.clip = 'castPoint'; return plan; }
  const shot = rangedPlan(item);
  if (shot) {
    plan.range = shot.range;
    plan.splash = shot.splash;
    if (shot.kind === 'draw') {
      plan.hold = 'draw'; plan.draw = shot; plan.afterShot = 0.12; plan.clip = 'shoot';
    } else if (shot.kind === 'reload') {
      // no draw scaling: one heavy bolt, then you are defenceless for a second and a quarter
      plan.hold = null; plan.reload = shot.reload; plan.power = shot.power; plan.clip = 'shoot';
      plan.steps = [{ key: 'shot', windMs: 180, every: shot.reload, clip: 'shoot', clipSeconds: 0.6 }];
    } else if (shot.kind === 'throw') {
      plan.hold = null; plan.power = shot.power; plan.carried = shot.carried; plan.clip = 'thrust';
      plan.steps = [{ key: 'shot', windMs: 150, every: shot.every, clip: 'thrust', clipSeconds: 0.42 }];
    }
  }
  return plan;
}

/** Emberveil item subtypes -> the Chibi 2 part the character actually holds. */
/**
 * Emberveil item subtypes -> the Chibi 2 part the character actually holds.
 *
 * ROUND 14 REWROTE THIS ROW BY ROW, because most of it was wrong:
 *
 *   * `greatsword`, `sword2h`, `battleaxe` and `axe2h` ALL mapped to `greataxe`, so a greatsword
 *     rendered as an axe even though a greatsword blade existed and nothing routed to it;
 *   * `halberd`, `spear` and `javelin` all mapped to `quarterstaff` — a bare pole with no head;
 *   * `wand` mapped to `flame`, which is a cone of fire floating in the palm: there was no wand
 *     model anywhere in the game;
 *   * a `scepter` was a mace and a `quarterstaff` was a shepherd's crook.
 *
 * The new ids are built in `avatar-3d/js/chibi2-weapons.js` — a new file, so Emberveil's own looks
 * are byte-for-byte untouched — and every one of them has its head PAST THE FINGERTIPS. In hand
 * space `+y` runs up the forearm toward the elbow and `-y` is out past the fingers, and every haft
 * weapon in the old file had its head at `+0.40` to `+0.46`: as the character chopped down, the
 * head travelled UP AND BACK. You were hitting things with the butt of the handle. That is almost
 * certainly what "ensure the character holds weapons properly" was about.
 */
const HELD_BY_SUBTYPE = {
  dagger: 'fh_daggers', sword: 'fh_sword', longsword: 'fh_longsword', rapier: 'fh_rapier',
  saber: 'fh_sabre', scimitar: 'fh_sabre',
  sword2h: 'fh_greatsword', greatsword: 'fh_greatsword', axe2h: 'fh_greataxe',
  battleaxe: 'fh_axe', axe: 'fh_axe', cleaver: 'cleaver',
  hammer: 'fh_hammer', warhammer: 'fh_maul', mace: 'fh_mace',
  halberd: 'fh_halberd', spear: 'fh_spear', javelin: 'fh_javelin',
  quarterstaff: 'fh_quarterstaff', staff: 'staff_orb', wand: 'fh_wand', scepter: 'fh_scepter',
  orb: 'orb', tome: 'book', bow: 'bow', shortbow: 'bow', longbow: 'bow', crossbow: 'crossbow',
};

/**
 * WHICH TOPPER A STAFF WEARS, by what it is made of.
 *
 * Every staff in the game was `staff_orb`. Five toppers already existed in `chibi2-gear.js` and
 * four of them were unreachable, so a fire staff, a shadow staff and a holy staff were the same
 * object in three tints.
 */
const STAFF_TOPPER = {
  fire: 'staff_crystal', ice: 'staff_crystal', lightning: 'staff_totem',
  poison: 'staff_crook', shadow: 'staff_skull', holy: 'staff_orb', arcane: 'staff_orb',
};
/** …and the colour that goes with it, so the topper is not a grey lump on a grey stick. */
const ELEMENT_TINT = {
  fire: '#ff8a40', ice: '#9fd8ff', lightning: '#ffe86a', poison: '#9ede6a',
  shadow: '#c090ff', holy: '#ffe6a0', arcane: '#b8a0ff',
};

/**
 * A shield is STRAPPED TO THE FOREARM, not gripped in the fist.
 *
 * `chibi2-gear.js` binds every shield to `handL` at weight 1, which is how a buckler is held and
 * how nothing else is. The strapped versions live in `chibi2-weapons.js` and ride `elbowL`.
 */
const OFFHAND_BY_SUBTYPE = { shield: 'fh_heater_shield', buckler: 'buckler', quiver: 'quiver', dagger: 'dagger' };

/** What a weapon looks like in the character's hand — the item's own look wins if it has one. */
export function heldLookFor(item) {
  if (!item) return { id: 'none' };
  if (item.look?.held) return { id: item.look.held, color: item.look.color || '#b9c2cc' };
  const sub = item.subtype || item.baseKey;
  let id = HELD_BY_SUBTYPE[item.subtype] || HELD_BY_SUBTYPE[item.baseKey] || 'fh_sword';
  // a staff wears the topper its element asks for, rather than an orb for all seven
  const el = item.castElement || item.brand || null;
  if (sub === 'staff' && el) id = STAFF_TOPPER[el] || 'staff_orb';
  /**
   * WHAT RARITY LOOKS LIKE. Three colours for the whole game meant a legendary maul and a common
   * maul were the same object in two tints; the new models read `quality` and add a gem, a ferrule
   * and a brighter edge as it climbs. A branded weapon takes its element's colour instead, because
   * "this one is on fire" is worth more than "this one is rare".
   */
  const quality = item.rarity === 'legendary' ? 3 : item.rarity === 'unique' ? 3 : item.rarity === 'rare' ? 2 : item.rarity === 'magic' ? 1 : 0;
  const color = el ? (ELEMENT_TINT[el] || '#b9c2cc')
    : item.rarity === 'legendary' ? '#ffb040' : item.rarity === 'rare' ? '#e8d020' : '#b9c2cc';
  return { id, color, quality, element: el || null };
}
export function offhandLookFor(item) {
  if (!item) return { id: 'none' };
  if (item.look?.offhand) return { id: item.look.offhand, color: item.look.color || '#9aa3ad' };
  // strapped to the forearm, not gripped in the fist — see chibi2-weapons.js
  if (item.isShield || item.isMagicShield) return { id: item.isMagicShield ? 'fh_kite_shield' : 'fh_heater_shield', color: '#8d97a3', quality: item.rarity === 'legendary' ? 3 : item.rarity === 'rare' ? 2 : 0 };
  const id = OFFHAND_BY_SUBTYPE[item.subtype] || 'none';
  return { id, color: '#9aa3ad' };
}

/** A single number for "is this better than what I am wearing", used for the upgrade arrow. */
/**
 * The UI is British all the way through — "Armour", "Colour", and the trade panel even relabels the
 * `armor` stat key — but the item BASE names come through as "Plate Armor" and "Leather Armor".
 * `items.json` is shared with Emberveil and must not be edited here, so this is a display-time
 * substitution at the one place a name is rendered.
 */
export function displayName(item) {
  return String(item?.name || '').replace(/\bArmor\b/g, 'Armour').replace(/\bArmors\b/g, 'Armours');
}

export function itemScore(item) {
  if (!item) return 0;
  let score = 0;
  if (item.dmg) score += (item.dmg[0] + item.dmg[1]) / 2 * 3;
  if (item.armor) score += item.armor * 2;
  for (const a of item.affixes || []) {
    const field = LIVE_STATS[a.stat];
    if (!field) continue;
    const weight = { maxHp: 0.5, armor: 2, damageFlat: 3, critChance: 4, critDamage: 2, dodge: 2, str: 3, dex: 3, int: 3, con: 3 }[field] ?? 1;
    score += (a.value || 0) * weight;
  }
  return Math.round(score);
}

export class Rpg {
  /** `items` is Emberveil's items.json; `balance` is data/balance.json. */
  constructor(items, balance = {}, talents = null) {
    this.items = items;
    this.b = balance;
    this.talentList = talents?.talents || [];
    this.loot = new Loot(items, balance.loot || {});
    this.rng = makeRng(balance.seed ?? 1);
    // Round 4: the one place an affix, a set bonus or a legendary power turns into an effect.
    this.fx = new Effects();
    // Round 6: units, floors, caps, slot rules and item levels. This MUST run before anything
    // reads the affix tables — the loot pool, the shop, the crafting bench and the uniques all
    // reach through the same objects. See js/affixes.js for why the data needed restating at all.
    // the light and mount slots' own affixes live in js/gear.js; they are tuned with the rest
    items.affixes = items.affixes || {};
    items.affixes.slotOnly = SLOT_AFFIX_LIST.map(a => ({ ...a }));
    // …and the ones only Farhold understands. items.json is shared with Emberveil, which has its
    // own registry and a test that every affix in the file resolves — so anything this game adds
    // goes in at load, never into the file.
    /**
     * R18 — INTO THE GROUP THE POOL ACTUALLY READS.
     *
     * This wrote them into `items.affixes.farhold`, and Emberveil's `Loot.pool()` reads exactly
     * `prefixes`, `suffixes`, `shield` and `extended` — so a group of our own was a group nobody
     * looked in. `of Early Promise` could never appear on anything: 2768 items rolled at level 30
     * with 300 magic find produced not one. That also made `AFFIX_TUNING.early_promise`,
     * `SLOT_RULES.early_promise`, `AFFIX_CAP.cond_levelReqReduce` and both branches of
     * `Rpg.levelRequirement` dead code hanging off it.
     *
     * `extended` is the right group: it is the one `pool()` takes when `opts.extended` is not
     * false, which is every ordinary drop. Appended in MEMORY, at load, never written into
     * items.json — that file is shared with Emberveil and has its own test that every affix in it
     * resolves, so an affix only we understand must not go in it. Guarded, because `new Rpg()` runs
     * more than once in a session (a new game, a load) and the list would otherwise grow each time.
     */
    items.affixes.extended = (items.affixes.extended || []).filter(a => !a.farhold);
    for (const a of FARHOLD_AFFIXES) items.affixes.extended.push({ ...a, farhold: true });
    this.affixReport = tuneAffixData(items);
    this.weightAffixes();
    this.itemLevels();
    /** The perk forest. One shape for every class - see js/perks.js. */
    this.forest = buildForest();
  }

  /**
   * Item levels, tiers, and the slot and level rules that decide what may appear at all.
   *
   * Wraps the generator rather than replacing it, the same way `weightAffixes` does: `pool()` drops
   * anything this slot or this item level is not allowed, and `generate()` stamps the item with its
   * level, its wearer requirement, and values rolled from the tier the level sits in.
   */
  itemLevels() {
    const loot = this.loot;
    const pool = loot.pool.bind(loot);
    const generate = loot.generate.bind(loot);
    let ilvlForNext = null;

    loot.pool = (base, rarity, opts = {}) => {
      const ilvl = opts.ilvl ?? ilvlForNext ?? 99;
      const slot = base?.slot || null;
      return pool(base, rarity, opts).filter(a => affixAllowed(a, slot, ilvl));
    };

    loot.generate = (baseKey, rarity = 'normal', quality = 'medium', opts = {}) => {
      const rng = opts.rng || this.rng;
      const ilvl = opts.ilvl ?? itemLevelFor(opts.level ?? 1, rarity, rng);
      ilvlForNext = ilvl;                                // read back by the wrapped pool()
      const item = generate(baseKey, rarity, quality, { ...opts, ilvl });
      ilvlForNext = null;
      if (!item) return item;
      item.ilvl = ilvl;
      item.levelReq = requirementFor(ilvl);
      // re-roll every rolled affix inside this item's own tier; intrinsics keep the base's numbers
      for (const a of item.affixes || []) {
        if (a.baseIntrinsic || a.intrinsic) continue;
        a.value = rollAffixValue(a, ilvl, rng);
        a.ilvl = ilvl;
        a.tier = tierFor(ilvl).name;
      }
      return item;
    };

    /**
     * R18 — AND THE TWO PATHS THAT WENT ROUND IT.
     *
     * `itemLevels` wrapped `pool` and `generate`, and `rollDrop` calls `generateUnique` and
     * `maybeSetItem` DIRECTLY — so a unique and a set piece came back with `ilvl` and `levelReq`
     * both undefined. `levelRequirement` then answered 1 and `equipRefusal` returned null, which
     * means a level-1 character could wear any legendary in the game the moment one dropped; their
     * random affixes were never tier-scaled either, so a level-45 unique rolled its numbers as
     * though it were level 1.
     *
     * Stamped here rather than at the two call sites, for the reason the wrapper exists at all:
     * a third path would go round two call sites just as easily as it went round one.
     */
    const stamp = (item, level, rng) => {
      if (!item || item.ilvl != null) return item;
      const ilvl = itemLevelFor(level ?? 1, item.rarity || 'legendary', rng || this.rng);
      item.ilvl = ilvl;
      item.levelReq = requirementFor(ilvl);
      for (const a of item.affixes || []) {
        // a unique's FIXED affixes are the whole point of it — only the rolled ones are tiered
        if (a.baseIntrinsic || a.intrinsic || a.setFixed || a.fixed) continue;
        if (a.min == null || a.max == null) continue;
        a.value = rollAffixValue(a, ilvl, rng || this.rng);
        a.ilvl = ilvl;
        a.tier = tierFor(ilvl).name;
      }
      return item;
    };
    const generateUnique = loot.generateUnique.bind(loot);
    loot.generateUnique = (id, rng, ...rest) => stamp(generateUnique(id, rng, ...rest), this.lastDropLevel, rng);
    const maybeSetItem = loot.maybeSetItem.bind(loot);
    loot.maybeSetItem = (act, rng, ...rest) => stamp(maybeSetItem(act, rng, ...rest), this.lastDropLevel, rng);
  }

  /** Roll one of the light/mount slot affixes. Same tiers, same caps as anything else. */
  rollSlotAffix(def, ilvl = 1, rng = this.rng) {
    return rollAffixValue(def, ilvl, rng);
  }

  /**
   * What level you must be to wear this, after anything that lowers the requirement.
   *
   * "There could be an affix that lowers the level requirement for an item, which should affect the
   * item itself without even being equipped as well as other items once you have it equipped."
   * So it is read in two places: off the item, and off everything worn.
   */
  levelRequirement(item, wearer = null) {
    const base = item?.levelReq ?? requirementFor(item?.ilvl ?? 1);
    let off = 0;
    for (const a of item?.affixes || []) if (a.stat === 'cond_levelReqReduce') off += a.value || 0;
    for (const worn of Object.values(wearer?.equipment || {})) {
      if (!worn || worn === item) continue;
      for (const a of worn.affixes || []) if (a.stat === 'cond_levelReqReduce') off += a.value || 0;
    }
    return { level: Math.max(1, Math.round(base - off)), base, reduced: off > 0, off: Math.round(off) };
  }

  /**
   * Make the plain, useful properties common and the exotic ones rare.
   *
   * Emberveil's generator picks uniformly from `prefixes + suffixes + shield + extended`, and
   * `extended` holds forty conditionals. Forty of the fifty-nine entries being "+8% fire damage to
   * anything poisoned" meant a weapon almost never rolled plain damage, which is the property a
   * weapon most wants. This wraps `pool()` so the list it picks from carries each affix as many
   * times as `AFFIX_WEIGHT` says — a uniform pick over a weighted list is a weighted pick.
   *
   * Nothing is removed. A shield-at-the-start-of-a-fight roll is still in there; it is just no
   * longer as likely as raw damage.
   */
  weightAffixes() {
    const W = { ...AFFIX_WEIGHT, ...(this.b.loot?.affixWeights || {}) };
    const plain = this.b.loot?.plainWeight ?? 5;
    const exotic = this.b.loot?.exoticWeight ?? 1;
    const loot = this.loot;
    const inner = loot.pool.bind(loot);
    loot.pool = (base, rarity, opts) => {
      const list = inner(base, rarity, opts);
      const out = [];
      for (const a of list) {
        const n = W[a.stat] ?? (String(a.stat).startsWith('cond_') ? exotic : plain);
        for (let i = 0; i < n; i++) out.push(a);
      }
      return out.length ? out : list;
    };
    loot.weighted = true;
  }

  // ---------------------------------------------------------------- characters

  createPlayer({ name = 'Wayfarer', classId = 'ranger', avatar = null, level = 1 } = {}) {
    const base = this.b.player || {};
    const player = {
      name, classId, avatar, level, xp: xpForLevel(level), gold: base.startGold ?? 0,
      attrs: { str: base.str ?? 6, dex: base.dex ?? 6, int: base.int ?? 6, con: base.con ?? 6 },
      pendingAttr: 0, pendingPassive: 0, pendingTalent: 0,
      // Boats and ships are unlockables rather than loot: bought once, owned for the run, and
      // chosen from a dropdown. See js/gear.js for why they are kept out of the item system.
      vehicles: startingVehicles(),
      passiveRanks: {}, talents: [],
      equipment: {}, bag: [],
      kills: 0, deaths: 0,
    };
    for (let l = 2; l <= level; l++) {
      // attributes are no longer bought a point at a time - the forest is where a level goes
      if (l % PASSIVE_EVERY === 0) player.pendingPassive++;
      if (TALENT_LEVELS.includes(l)) player.pendingTalent++;
    }
    this.refresh(player, { full: true });
    return player;
  }

  /** Everything the game reads off a character, worked out from level + attributes + gear. */
  derive(unit) {
    const b = this.b.player || {};
    const lvl = unit.level || 1;
    const d = {
      maxHp: (b.baseHp ?? 60) + (b.hpPerLevel ?? 14) * (lvl - 1),
      maxMp: (b.baseMp ?? 20) + (b.mpPerLevel ?? 4) * (lvl - 1),
      armor: 0, magicResist: 0, damageFlat: 0, critChance: b.critChance ?? 5, critDamage: b.critDamage ?? 50,
      // R21: `hit` (accuracy) is gone — see `strike`. `dodge` stays: it is the player's own.
      dodge: 0, hpRegen: b.hpRegen ?? 0.5, mpRegen: 1, spellPower: 0, lifeSteal: 0,
      magicFind: 0, goldFind: 0, xpFind: 0, blockChance: 0, blockPower: 0,
      // round 4: the stats that used to be carried and ignored
      barrier: 0, barrierRegen: 0, cooldownReduction: 0, manaSteal: 0, haste: 0,
      // round 6/7: the perk forest, the quivers and the weapon work all land here
      // R17 — `followerSlots` is The Kept Company's grant: how many things may WALK WITH YOU, and
      // how many of each creature a summoning spell may have standing. `petSlots` is the old key,
      // still granted by the `cond_companionExtra` affix; js/followers.js adds the two together.
      areaPct: 0, petDamagePct: 0, petSlots: 0, followerSlots: 0, arrowDamage: 0, arrowsPerShot: 1, arrowHoming: 0,
      arrowBurst: 0, lightRange: 0, revealRange: 0, mountSpeed: 0, mountStamina: 0, mountSlope: 0,
      mountCalm: 0, trample: 0, stealth: 0, staminaEase: 0,
      // R16: how fast the gather bar fills and how much comes off it, so an affix or a perk that
      // says "you work faster" has somewhere real to land. js/tools.js reads both.
      gatherSpeed: 0, gatherYield: 0,
      str: unit.attrs?.str ?? 0, dex: unit.attrs?.dex ?? 0, int: unit.attrs?.int ?? 0, con: unit.attrs?.con ?? 0,
      // passive-tree fields, zeroed here so the effect registry can add to them too
      resistAll: 0, thorns: 0, hpOnKill: 0, manaOnKill: 0, lifeStealFrac: 0,
      // perk-forest talent nodes that are a NUMBER rather than a flag, because the number is what
      // the game already reads: `js/main.js` asks fx.sum for 'echo' and 'scavenge' (js/effects.js
      // DERIVED_INTO_SUM folds these in) and reads `arrowsPerShot` when it looses an arrow.
      echoChance: 0, scavengeChance: 0,
      // talent fields, likewise
      damagePct: 0, armorPct: 0, movePct: 0, jumpPct: 0, swimPct: 0,
      mountPct: 0, floatLift: 0, arrowRangePct: 0, arrowSpeedPct: 0,
      inert: [],
    };
    for (const slot of SLOTS) {
      const item = unit.equipment?.[slot];
      if (!item) continue;
      if (item.armor) d.armor += item.armor;
      // Anything the registry has never heard of is still declared rather than swallowed — that
      // guard is what caught the 41 dead affixes in the first place, so it stays.
      for (const a of item.affixes || []) if (!effectFor(a)) d.inert.push(a.stat);
    }
    // set bonuses, legendary powers and every affix, from the one registry
    unit.legendaryPowers = this.legendaryPowers(unit);
    this.fx.refresh(unit);
    this.fx.derive(unit, d);
    for (const [key, value] of Object.entries(this.setBonuses(unit))) {
      if (key in d) d[key] += value;
    }
    // the passive tree, on top of gear
    for (const [id, rank] of Object.entries(unit.passiveRanks || {})) {
      const node = PASSIVE_NODES[id];
      if (!node || !rank) continue;
      for (const [key, value] of Object.entries(node)) {
        if (typeof value !== 'number') continue;
        const field = LIVE_PASSIVES[key];
        if (!field) { d.inert.push('passive:' + key); continue; }
        d[field] += value * rank;
      }
    }
    d.lifeSteal += d.lifeStealFrac * 100;      // nodes store a fraction, gear stores a percent

    /**
     * THE PERK FOREST, on top of everything else.
     *
     * It replaced attribute point-buy, the passive ladder and the talent picks - three screens that
     * each spent a different currency and none of which was a decision. Its stat keys are `derived`
     * field names already, so there is nothing to translate; its FLAGS are what the combat code
     * reads for the keystones and the rule-changing talents.
     */
    if (unit.perks) {
      const { stats, flags } = perkBonuses(unit, this.forest);
      for (const [key, value] of Object.entries(stats)) {
        if (key in d) d[key] += value;
        else d[key] = value;
      }
      unit.perkFlags = flags;
    } else {
      unit.perkFlags = unit.perkFlags || {};
    }

    // talents: broad masteries, one per talent level (kept so a save from before the forest loads)
    for (const id of unit.talents || []) {
      const t = this.talentList.find(x => x.id === id);
      if (!t) continue;
      for (const [key, value] of Object.entries(t.grants || {})) {
        if (key in d) d[key] += value;
        else d[key] = value;
      }
    }
    d.armor *= 1 + d.armorPct / 100;

    /**
     * A QUIVER ADDS DAMAGE TO EVERY ARROW — which is the entire point of the slot, and it was not
     * happening. `derived.arrowDamage` was computed by four affixes and one perk node and read by
     * nobody: an arrow's damage is rolled by `strike` off `derived.damage`, and nothing added the
     * quiver to it. Folding it into `damageFlat` while a bow is held is the honest fix, because
     * `damageFlat` is exactly "how much more every hit is worth" and it is already in the damage
     * formula below. Put a sword back on and the quiver stops counting, as it should.
     */
    if (unit.equipment?.weapon?.ranged && d.arrowDamage) d.damageFlat += d.arrowDamage;

    d.maxHp += d.con * (b.hpPerCon ?? 4);
    d.maxMp += d.int * (b.mpPerInt ?? 2);
    d.critChance += d.dex * 0.2;
    d.dodge += d.dex * 0.3;
    const weapon = unit.equipment?.weapon;
    const cat = weapon?.weaponCategory || 'light';
    const attr = cat === 'magic' ? d.int : cat === 'heavy' ? d.str : d.dex;
    const wd = weapon?.dmg || (b.unarmed ?? [2, 4]);
    const scale = 1 + attr * (b.damagePerAttr ?? 0.03);
    const talentDmg = 1 + d.damagePct / 100;
    // A weapon's base damage does not change when you level, but an enemy's health compounds every
    // level — so without this a level-20 character with a perfect bow did almost nothing to a
    // level-25 anything. Training counts for something: every level is worth a flat share more.
    const skill = 1 + (lvl - 1) * (b.damagePerLevel ?? 0.1);
    /**
     * THE WEAPON SCALES WITH YOU; THE FLAT BONUS DOES NOT.
     *
     * Round 14. `damageFlat` used to be added to the weapon's dice BEFORE everything multiplied, so
     * gear diluted the weapon itself: at level 20 with a modest +12 flat, a greatsword's 15-29
     * became 27-41 and a dagger's 3-7 became 15-19 — a 4.4x difference in raw weapon damage
     * collapsed to 1.9x, while the greatsword still paid the whole of its 0.88-swings-a-second
     * clock. Heavy weapons paid the speed penalty and collected almost none of the damage advantage
     * they were designed around, which is most of why melee was behind.
     *
     * Multiplying the WEAPON by the level term and adding the flat bonus after it keeps the level
     * curve where the simulator tuned it (with `damagePerLevel` nudged 0.10 -> 0.11 to compensate)
     * and takes the greatsword-to-dagger ratio from 1.99x to about 2.9x. The difference a player
     * reads on the item card is finally the difference they feel in the fight.
     */
    d.damage = [
      Math.max(1, Math.round((wd[0] * skill + d.damageFlat) * scale * talentDmg)),
      Math.max(2, Math.round((wd[1] * skill + d.damageFlat) * scale * talentDmg)),
    ];
    /**
     * AND THE OFF HAND USES ITS OWN DICE.
     *
     * The off hand used to lend only its CLOCK: `rpg.strike` reads `a.damage`, which was computed
     * from `equipment.weapon` alone, and the off hand's share was 0.62 of the MAIN hand's numbers.
     * The mathematically correct off-hand weapon was therefore always the fastest weapon in the
     * game whatever its damage — longsword-and-dagger beat dual longswords by 40%, which is not a
     * build, it is an exploit, and it sat at the top of the damage table.
     */
    const off = unit.equipment?.offhand;
    if (off && off.type === 'weapon' && off.dmg) {
      const offCat = off.weaponCategory || 'light';
      const offAttr = offCat === 'magic' ? d.int : offCat === 'heavy' ? d.str : d.dex;
      const offScale = 1 + offAttr * (b.damagePerAttr ?? 0.03);
      d.offDamage = [
        Math.max(1, Math.round((off.dmg[0] * skill + d.damageFlat) * offScale * talentDmg)),
        Math.max(2, Math.round((off.dmg[1] * skill + d.damageFlat) * offScale * talentDmg)),
      ];
    } else {
      d.offDamage = null;
    }
    d.levelScale = skill;
    d.moveSpeed = (b.moveSpeed ?? 5.2) * (1 - Math.min(0.2, (d.armor / 400))) * (1 + d.movePct / 100);
    /**
     * How often you can swing. `d.haste` is PERCENTAGE POINTS and every writer speaks that.
     *
     * R18 — `d.haste *= INITIATIVE_PER_POINT` used to sit here, where it multiplied whatever had
     * accumulated. Only the `initiative` affix is in points; it converts at its own site now
     * (js/effects.js `affix:initiative`) and the perks, the speed legendary and `cond_killInitBonus`
     * are left alone instead of being quadrupled.
     */
    d.attackEvery = Math.max(0.18, (b.attackEvery ?? 0.62) / (1 + Math.max(-0.5, d.haste / 100)));
    d.maxBarrier = Math.round(d.barrier);

    /**
     * ROUND EVERYTHING. Floating point turns "+0.41 health" repeated eleven times into a max health
     * of 513.4100000000000000001, which is what the HP bar then printed. Emberveil hit this and
     * fixed it the same way; `shared/format.js` exists for the display side, but the numbers
     * themselves should not be ragged in the first place.
     */
    for (const key of ['maxHp', 'maxMp', 'armor', 'magicResist', 'damageFlat', 'barrier']) {
      d[key] = Math.round(d[key] || 0);
    }
    for (const key of ['critChance', 'critDamage', 'dodge', 'hpRegen', 'mpRegen', 'spellPower',
      'lifeSteal', 'magicFind', 'goldFind', 'xpFind', 'blockChance', 'blockPower', 'barrierRegen',
      'cooldownReduction', 'manaSteal', 'haste', 'moveSpeed', 'resistAll', 'thorns',
      'attackEvery', 'levelScale', 'damagePct', 'armorPct', 'movePct']) {
      if (typeof d[key] === 'number') d[key] = Math.round(d[key] * 1000) / 1000;
    }
    /**
     * WHAT THE WEAPON IS FOR, in the shape the CONTROLLER needs it.
     *
     * js/player.js owns the swing clock and has no idea what is in your hands — it is handed an
     * `every` by main.js and nothing else, which is why every weapon in the game had the same
     * one-frame swing. `derived` is the one thing the controller already reads (`sheet()`), so the
     * whole plan goes here: how long each strike of the pattern takes to come round, which clip it
     * plays, and whether this weapon is held rather than clicked.
     */
    d.swing = {
      main: swingPlanFor(unit.equipment?.weapon),
      off: swingPlanFor(unit.equipment?.offhand, { off: true }),
    };
    /** A weapon that parries. A staff, a rapier and a polearm all do; a hammer does not. */
    const guard = traitsOf(unit.equipment?.weapon)?.guard || 0;
    if (guard > 0) d.blockChance = Math.round((d.blockChance + guard * 100) * 1000) / 1000;
    /**
     * Spending mana from the controller, which has no reference to the character.
     *
     * A staff's channel drinks four mana a second and stops when there is none left — that is the
     * decision the whole redesign turns on. A closure is the smallest thing that can carry it: it
     * is not serialised (functions do not survive JSON, and `derived` is rebuilt on load anyway)
     * and it cannot be used to reach anything but the mana pool. Returns what was actually paid.
     */
    d.spendMana = (want = 0) => {
      if (!(want > 0)) return 0;
      const have = unit.mp ?? 0;
      const paid = Math.min(have, want);
      unit.mp = Math.max(0, have - paid);
      return paid;
    };
    d.manaLeft = () => unit.mp ?? 0;

    d.inert = [...new Set(d.inert)];
    return d;
  }

  /**
   * Set bonuses, as flat additions to derived fields. Emberveil's sets carry stat keys in its own
   * spelling, so this is the one place the two vocabularies meet.
   */
  setBonuses(unit) {
    const out = {};
    const bump = (k, v) => { out[k] = (out[k] || 0) + v; };
    const extra = this.setPieceBonus(unit);
    for (const s of this.loot.activeSets(unit.equipment || {})) {
      const eff = s.eff + extra;
      for (const [at, bonus] of Object.entries(s.set.partialBonuses || {})) {
        if (eff < +at) continue;
        for (const [k, v] of Object.entries(bonus)) {
          if (k === 'desc' || typeof v !== 'number') continue;
          const field = STAT_FIELDS[k] || k;
          bump(field, v);
        }
      }
    }
    return out;
  }

  /**
   * How many extra set pieces this character counts as wearing. Read straight off the affixes
   * rather than through the effect cache, because the cache is being rebuilt when this is called.
   */
  setPieceBonus(unit) {
    let extra = 0;
    for (const item of Object.values(unit.equipment || {})) {
      for (const a of item?.affixes || []) {
        if (a.stat === 'cond_extraSetPiece' || a.stat === 'cond_setThresholdReduce') extra++;
      }
    }
    return extra;
  }

  /** The legendary power ids a character's gear switches on — uniques, full sets and thresholds. */
  legendaryPowers(unit) {
    const extra = this.setPieceBonus(unit);
    const ids = new Set();
    for (const item of Object.values(unit.equipment || {})) {
      if (item?.legendaryEffectId) ids.add('legendary:' + item.legendaryEffectId);
    }
    for (const s of this.loot.activeSets(unit.equipment || {})) {
      const eff = s.eff + extra;
      if (eff >= s.set.activationPieces && s.set.legendaryEffect) ids.add('legendary:' + s.set.legendaryEffect);
      for (const [at, id] of Object.entries(s.set.thresholdPowers || {})) {
        if (eff >= +at) ids.add('legendary:' + id);
      }
    }
    return [...ids];
  }

  /** Recompute derived stats, keeping the same share of health unless `full` is asked for. */
  refresh(unit, { full = false } = {}) {
    // R22 — a save may carry a lamp that rolled an affix this round retired. Take it off before the
    // sheet is rebuilt, so the card never prints `Warding: 0.15` at a stat nothing can resolve.
    for (const it of [...Object.values(unit.equipment || {}), ...(unit.bag || [])]) scrubRetired(it);
    const before = unit.derived;
    const d = this.derive(unit);
    const hpFrac = full || !before ? 1 : Math.min(1, (unit.hp ?? d.maxHp) / (before.maxHp || d.maxHp));
    const mpFrac = full || !before ? 1 : Math.min(1, (unit.mp ?? d.maxMp) / (before.maxMp || d.maxMp));
    unit.derived = d;
    /**
     * HOW FAR THE LIGHT REACHES, PUT BACK ON THE LAMP.
     *
     * `js/main.js` lights the world with `light.setRange(player.equipment.light?.range)` — the
     * BASE number off the item — so the `Broad` affix ("+12 more metres of ground") and the perk
     * that reaches twelve metres further were both computed into `derived.lightRange` every frame
     * and thrown away. `d.lightRange` is rebuilt from nothing on every refresh, so writing it back
     * cannot compound: it is always base + affixes + perks, never the last answer plus more.
     */
    if (unit.equipment?.light && d.lightRange > 0) unit.equipment.light.range = d.lightRange;
    unit.maxHp = d.maxHp; unit.maxMp = d.maxMp;
    unit.hp = Math.max(1, Math.round(d.maxHp * hpFrac));
    unit.mp = Math.round(d.maxMp * mpFrac);
    return d;
  }

  /** Put an item on. The item that comes off goes back to the bag. Returns what was replaced. */
  equip(player, item, { into = null, force = false } = {}) {
    if (!item) return null;
    // An item level is a promise you have to grow into. `force` is for the tests and the debug menu;
    // `equipRefusal` is what the interface asks so it can say why rather than doing nothing.
    if (!force) {
      const why = this.equipRefusal(player, item, { into });
      if (why) return { refused: why };
    }
    let slot = into || (item.type === 'weapon' ? 'weapon' : item.slot === 'ring1' ? 'ring' : item.slot);
    /**
     * A WEAPON GOES IN THE FREE HAND, WHATEVER KIND OF WEAPON IT IS.
     *
     * "Swords cannot be equipped in the off-hand… dual wielding is supposed to work." It never
     * could: the bag has one click and that click asked for `weapon`, so a second sword always
     * replaced the first and the off hand was only ever reachable for shields. The rule now, when
     * no slot was asked for by name:
     *
     *   * the main hand is holding something, and the off hand is EMPTY,
     *   * and the off hand would actually take the new weapon — which is `offhandRefusal`'s
     *     question, not this file's, so bows, staves and the two-hander keystone are all already
     *     decided by the time the branch is reached
     *
     * then BOTH go on, best in the main hand. The first version of this asked `oneHanded(item)`
     * instead, and that guard excluded the one case Doubled Grasp exists to allow — two
     * two-handers — which is exactly what the play-test reported.
     */
    if (slot === 'weapon' && !into) {
      const main = player.equipment.weapon;
      /**
       * …AND SO DOES A SECOND TWO-HANDER, ONCE DOUBLED GRASP IS TAKEN.
       *
       * Reported in play: "I took the keystone, equipped a two handed weapon, and tried to equip a
       * second greatsword — it just replaced my main hand." The rule above was written for two
       * one-handers and said so in code: `oneHanded(item)` guarded the whole branch, so the one
       * case the keystone exists to allow was the one case that could never reach the off hand.
       *
       * The question is not "is this a one-hander" but "would the off hand actually take it" —
       * which `offhandRefusal` already answers, keystone and all, in the one place that knows the
       * rule. So the branch asks that instead, and the keystone works without this file ever
       * learning what a keystone is.
       */
      const fitsOffHand = !offhandRefusal(player, item);
      if (main && !player.equipment.offhand && fitsOffHand) {
        /**
         * WITH A HAND FREE, BOTH WEAPONS GO ON. THE BETTER ONE TAKES THE MAIN HAND.
         *
         * The old rule only filled the off hand when the new weapon was the WORSE of the two, and
         * dropped the loser in the bag otherwise — so upgrading half of a pair silently unequipped
         * the other half. Putting your best weapon in the hand that hits for 62% is still never
         * what you meant, so a better weapon swaps in and the one it beat slides across.
         */
        if (itemScore(item) <= itemScore(main)) slot = 'offhand';
        else if (!offhandRefusal({ ...player, equipment: { ...player.equipment, weapon: item } }, main)) {
          player.equipment.offhand = main;
          player.equipment.weapon = item;
          const at = player.bag.indexOf(item);
          if (at >= 0) player.bag.splice(at, 1);
          this.refresh(player);
          return null;                                  // nothing came off — both hands are full
        }
      }
    }
    // A ring goes on whichever hand is free; with both full it replaces the WEAKER one, because
    // throwing away your best ring for a worse one is never what you meant.
    if (slot === 'ring' && !into) {
      if (!player.equipment.ring) slot = 'ring';
      else if (!player.equipment.ring2) slot = 'ring2';
      else slot = itemScore(player.equipment.ring2) < itemScore(player.equipment.ring) ? 'ring2' : 'ring';
    }
    if (!SLOTS.includes(slot)) return null;
    const old = player.equipment[slot] || null;
    player.equipment[slot] = item;
    // a two-handed weapon clears the off hand — unless Doubled Grasp says both hands can hold one,
    // or the off hand is a quiver and the weapon going on is the bow that quiver feeds (R22)
    if (slot === 'weapon' && item.twoHanded && player.equipment.offhand && !player.perkFlags?.doubleGrip
        && !quiverGoesWith(player.equipment.offhand, item)) {
      player.bag.push(player.equipment.offhand);
      delete player.equipment.offhand;
    }
    const at = player.bag.indexOf(item);
    if (at >= 0) player.bag.splice(at, 1);
    if (old) player.bag.push(old);
    this.refresh(player);
    return old;
  }

  /**
   * Why this player cannot wear this item, in a sentence, or null when they can.
   *
   * `into` matters: a one-handed sword is a `weapon` by type and an off-hand weapon by intent, and
   * the two-handed rule only applies to the second of those.
   */
  equipRefusal(player, item, { into = null } = {}) {
    if (!item) return null;
    const req = this.levelRequirement(item, player);
    if ((player.level ?? 1) < req.level) {
      return `${item.name} needs level ${req.level}. You are ${player.level ?? 1}.`;
    }
    // …and a two-handed weapon takes the off hand with it, unless a keystone says otherwise
    const slot = into || (item.type === 'weapon' ? 'weapon' : item.slot);
    if (slot === 'offhand') {
      const why = offhandRefusal(player, item);
      if (why) return why;
    }
    return null;
  }

  unequip(player, slot) {
    const item = player.equipment[slot];
    if (!item) return null;
    delete player.equipment[slot];
    player.bag.push(item);
    this.refresh(player);
    return item;
  }

  /** XP in, levels out. Returns how many levels were gained (0 most of the time). */
  gainXp(player, amount) {
    const before = player.level;
    player.xp += Math.max(0, Math.round(amount * (1 + (player.derived?.xpFind || 0) / 100)));
    const after = levelFromXp(player.xp);
    if (after === before) return 0;
    player.level = after;
    // ...and the same on a multi-level jump: perk points are derived from level, not accrued
    for (let l = before + 1; l <= after; l++) {
      if (l % PASSIVE_EVERY === 0) player.pendingPassive++;
      if (TALENT_LEVELS.includes(l)) player.pendingTalent++;
    }
    this.refresh(player, { full: true });
    return after - before;
  }

  /** What a kill gives back, from the `killing_blow` and `soul_harvest` passives. */
  onKillRestore(player) {
    const d = player.derived || {};
    const hp = Math.round(d.hpOnKill || 0), mp = Math.round(d.manaOnKill || 0);
    if (hp) player.hp = Math.min(player.maxHp, player.hp + hp);
    if (mp) player.mp = Math.min(player.maxMp, player.mp + mp);
    return { hp, mp };
  }

  /** The passive nodes this character may take, with the rank they are at. */
  passives(player) {
    return passiveTree(player.classId).map(node => ({
      ...node,
      rank: player.passiveRanks?.[node.id] || 0,
      live: Object.keys(node).some(k => LIVE_PASSIVES[k]),
    }));
  }

  /** The talents this character could still take. */
  talentChoices(player) {
    return this.talentList.filter(t => !(player.talents || []).includes(t.id));
  }

  /** Take a talent. */
  takeTalent(player, id) {
    if (!player.pendingTalent) return false;
    if (!this.talentList.some(t => t.id === id)) return false;
    if ((player.talents || []).includes(id)) return false;
    player.talents = [...(player.talents || []), id];
    player.pendingTalent--;
    this.refresh(player);
    return true;
  }

  /** Put a point into a passive node. */
  spendPassive(player, id) {
    if (!player.pendingPassive) return false;
    const node = this.passives(player).find(n => n.id === id);
    if (!node || node.rank >= node.maxRank) return false;
    player.passiveRanks = player.passiveRanks || {};
    player.passiveRanks[id] = (player.passiveRanks[id] || 0) + 1;
    player.pendingPassive--;
    this.refresh(player);
    return true;
  }

  /** Spend a level-up point. */
  spendAttr(player, key) {
    if (!player.pendingAttr || !(key in player.attrs)) return false;
    player.attrs[key]++;
    player.pendingAttr--;
    this.refresh(player);
    return true;
  }

  // ---------------------------------------------------------------- enemies

  /**
   * Which rank a spawn comes out at. The block-world action-RPG mods this round is modelled on roll
   * every monster's stats rather than reading them off a table; Farhold keeps the table and rolls
   * the *rank* — normal, champion (one modifier), rare (two modifiers and a name of its own).
   */
  rollRank(rng = this.rng, { bonus = 1 } = {}) {
    const R = this.b.ranks || {};
    const roll = rng();
    if (roll < (R.rareChance ?? 0.03) * bonus) return 'rare';
    if (roll < ((R.rareChance ?? 0.03) + (R.championChance ?? 0.11)) * bonus) return 'champion';
    return 'normal';
  }

  /** Pick `n` different modifiers from data/enemies.json's table. */
  pickModifiers(table, n, rng = this.rng) {
    const pool = [...(table || [])];
    const out = [];
    while (out.length < n && pool.length) out.push(...pool.splice(Math.floor(rng() * pool.length), 1));
    return out;
  }

  /**
   * Build a live enemy from a table entry in data/enemies.json.
   *
   * `rank` and `modifiers` are what make one wolf different from the next: a champion carries one
   * modifier, a rare two and its own name, a boss is a whole hand-written entry with phases.
   */
  makeEnemy(def, level, rng = this.rng, { rank = 'normal', modifiers = [], name = null } = {}) {
    const e = this.b.enemies || {};
    const R = (this.b.ranks || {})[rank] || {};
    const lvl = Math.max(1, Math.round(level));
    // Health and damage used to compound at the SAME rate, so a five-level gap doubled an enemy's
    // damage as well as its health and the fight became unsurvivable rather than merely hard. They
    // are separate curves now: a higher-level enemy is much tougher and only somewhat harder hitting.
    const scale = Math.pow(e.perLevel ?? 1.13, lvl - 1);
    const hitScale = Math.pow(e.dmgPerLevel ?? e.perLevel ?? 1.09, lvl - 1);

    // rank first, then every modifier on top of it
    let hpMult = (R.hp ?? 1), dmgMult = (R.dmg ?? 1), armorMult = (R.armor ?? 1);
    let speedMult = 1, swingMult = 1, goldMult = (R.gold ?? 1), dropMult = (R.drop ?? 1);
    let thorns = 0, lifeSteal = 0, resist = 0;
    const onHit = def.onHit ? [def.onHit] : [];
    for (const m of modifiers) {
      hpMult *= m.hp ?? 1; dmgMult *= m.dmg ?? 1; armorMult *= m.armor ?? 1;
      speedMult *= m.speed ?? 1; swingMult *= m.attackEvery ?? 1;
      goldMult *= m.gold ?? 1; dropMult *= m.drop ?? 1;
      thorns += m.thorns ?? 0; lifeSteal += m.lifeSteal ?? 0; resist += m.resist ?? 0;
      if (m.onHit) onHit.push(m.onHit);
    }

    const hp = Math.max(1, Math.round((def.hp ?? 30) * scale * (e.hp ?? 1) * hpMult * rng.range(0.9, 1.1)));
    const dmg = (def.dmg ?? [4, 7]).map(v => Math.max(1, Math.round(v * hitScale * (e.dmg ?? 1) * dmgMult)));
    const prefix = modifiers.map(m => m.prefix).filter(Boolean).join(' ');
    return {
      id: 'e' + Math.floor(rng() * 1e9).toString(36),
      defId: def.id, name: name || (prefix ? `${prefix} ${def.name}` : def.name), baseName: def.name,
      kind: def.kind || 'beast', family: def.family || 'beast', role: def.role || 'skirmisher',
      level: lvl, rank, modifiers: modifiers.map(m => m.id),
      auras: modifiers.map(m => m.aura).filter(Boolean),
      hp, maxHp: hp, dmg,
      armor: Math.round((def.armor ?? 0) * scale * armorMult),
      magicResist: Math.round((def.armor ?? 0) * scale * 0.5),
      derived: { resistAll: resist * 100, thorns, dodge: 0 },
      speed: (def.speed ?? 3.1) * speedMult,
      reach: def.reach ?? 2.2, aggroRange: def.aggroRange ?? 26,
      attackEvery: (def.attackEvery ?? 1.5) * swingMult,
      xp: Math.round((def.xp ?? 12) * scale * (e.xp ?? 1) * (R.xp ?? 1)),
      gold: Math.round((def.gold ?? 4) * scale * (e.gold ?? 1) * goldMult),
      lifeSteal,
      onHit: onHit.length ? onHit : null,
      ranged: def.ranged || null, flying: !!def.flying, glow: def.glow || null,
      phases: def.phases ? def.phases.map(p => ({ ...p, fired: false })) : null,
      spawns: def.spawns || null, arena: def.arena || 0,
      dropBonus: (def.dropBonus || 0) + (R.dropBonus || 0), dropMult,
      dropRarity: (def.dropRarity || 1) * (R.dropRarity ?? 1),
      look: def.look || null, dropBases: def.dropBases || null,
      scale: rank === 'champion' ? 1.18 : rank === 'rare' ? 1.35 : 1,
    };
  }

  // ---------------------------------------------------------------- combat

  /**
   * One swing. Returns what happened so the caller can show numbers, play an animation and write
   * a line in the log. Attacker and defender are any `{ derived }` character or plain enemy.
   */
  strike(attacker, defender, rng = this.rng, { multiplier = 1, element = 'physical', skill = null, applyStatus = null, hand = 'main', pen = 0 } = {}) {
    const a = attacker.derived, d = defender.derived;
    // Read every field with a fallback, NEVER `a ? a.x : fallback`. Round 4 gave enemies and pets a
    // small `derived` bag (resistAll / thorns / dodge) so modifiers could hang off them, which made
    // `a` truthy for an enemy — and `a.damage` is undefined on an enemy, so the old form rolled
    // rng.range(undefined, undefined) and every number in the fight came out NaN.
    /**
     * THE OFF HAND ROLLS ITS OWN DICE. Before round 14 it lent only its clock — `a.damage` is the
     * MAIN hand's numbers — so the best off-hand weapon in the game was always the fastest one
     * regardless of its damage. See `derive`'s `offDamage`.
     */
    const dmgRange = (hand === 'off' && a?.offDamage) || a?.damage || attacker.dmg || [3, 5];
    /**
     * R21 — ACCURACY IS GONE, AND DODGE IS THE PLAYER'S ALONE.
     *
     * The play-test, on an `of Accuracy` ring: *"let's just REMOVE accuracy entirely, it's stupid,
     * nobody wants to build accuracy, enemies shouldn't have a significant dodge chance anyway."*
     * Which was already true of the code, and that is the damning part — Farhold's enemies are
     * built at `makeEnemy` with `dodge: 0` hard-coded, so the accuracy an item granted cancelled a
     * dodge chance that was ALWAYS ZERO. It was a stat whose entire job was to give back damage
     * the game never took, and its own tooltip ("+7.8% accuracy — it cancels this much of the
     * target's dodge") is the clearest evidence nobody could say what it was for.
     *
     * So attacks connect, and damage is decided by damage. Dodge survives on the PLAYER only —
     * it is read here when an enemy swings at you, which is the one direction it ever mattered.
     * Nothing rolls `of Accuracy` any more (js/affixes.js), nothing describes it (js/effects.js)
     * and the character sheet no longer has a row for it. See `WORDING.md`.
     */
    const dodge = Math.max(0, d?.dodge ?? defender.dodge ?? 0) / 100;
    if (rng() < Math.min(0.35, dodge)) {
      // RIPOSTE, the melee talent node: "blocking or dodging leaves your next swing a guaranteed
      // critical". It was a perk flag nothing in the game read. A dodge is only ever decided here,
      // so this is the only place that can arm it.
      if (defender.perkFlags?.riposte) defender.riposteReady = true;
      return { dodged: true, amount: 0, crit: false };
    }

    // the attacker's affixes get a say before the roll: crit chance, then the multipliers
    const ctx = { self: attacker, target: defender, element, skill, applyStatus, baseDamage: (dmgRange[0] + dmgRange[1]) / 2 };
    const critBonus = attacker.equipment ? this.fx.critBonus(ctx) : 0;
    // a riposte spends itself on the next swing, whatever the dice say
    const riposte = !!(attacker.perkFlags?.riposte && attacker.riposteReady);
    if (riposte) attacker.riposteReady = false;
    const crit = riposte || rng() * 100 < (a?.critChance ?? attacker.critChance ?? 3) + critBonus;
    ctx.crit = crit;

    /**
     * The talents that land ON A HIT, parked on the player by `js/skills.js` when the skill was
     * cast. `js/main.js` never sees an individual hit — it hands a shape to `field.strikeArea` and
     * the strikes happen in here — so Shattering, Draining, Cauterise and Branding had nowhere to
     * run and were being thrown away with the plan.
     */
    const rules = (attacker.castRules && skill && attacker.castRules.skill === skill) ? attacker.castRules : null;

    let amount = rng.range(dmgRange[0], dmgRange[1]) * multiplier;
    if (attacker.equipment) {
      const out = this.fx.dmgOut(ctx);
      amount = (amount + out.flat) * out.mult;
    }
    if (element !== 'physical' && a?.spellPower) amount *= 1 + a.spellPower;
    if (crit) amount *= 1 + (a?.critDamage ?? attacker.critDamage ?? 50) / 100;

    /**
     * WHAT BOTH OF THEM ARE ALREADY CARRYING.
     *
     * `shock` says it "leaves the target taking more of everything", Branding says the same, and
     * neither did anything to an enemy — so round 17 applied `incomingFrom(defender)` here, but
     * only for `attacker.equipment && !defender.equipment`, i.e. the player hitting something else,
     * because js/main.js was already multiplying by it on the enemy path.
     *
     * R18 — the OTHER half was still missing and is the bigger one: nothing anywhere applied
     * `outgoingFrom(attacker)` to a weapon swing. `js/main.js` used it at exactly one call site, a
     * skill cast. So War Cry ("Hit harder for a while", might +30%) and Rally (+20%) did nothing to
     * your swings, and Weakened (-35%) did not weaken them either.
     *
     * Both sides, once, here — where a swing, an arrow, a skill, a turret and a trap all pass
     * through. The enemy path keeps its own `incomingFrom(victim) * outgoingFrom(e)` in main.js and
     * is excluded by the same test as before, so nothing is counted twice.
     */
    if (attacker.equipment && !defender.equipment) amount *= outgoingFrom(attacker) * incomingFrom(defender);

    /**
     * FAR SHOT, the ranged keystone: "arrows and bolts hit harder the further they have flown, up
     * to half again at full range… everything within four metres of you takes a quarter less."
     *
     * Needs to know how far apart the two are, and only the enemy carries a position — so this is
     * live the moment `js/main.js` keeps `player.x` / `player.z` in step with the controller (one
     * line in `tick`; see the report). Until it does, the guard simply leaves it alone rather than
     * pretending with a made-up distance.
     */
    if (attacker.perkFlags?.farShot && attacker.x != null && defender.x != null) {
      const away = Math.hypot(defender.x - attacker.x, defender.z - attacker.z);
      amount *= away < 4 ? 0.75 : 1 + Math.min(0.5, (away - 4) / 42 * 0.5);
    }

    // armour, less whatever the attacker's affixes let it ignore
    let armor = d?.armor ?? defender.armor ?? 0;
    // a hammer's armour break, carried as a `sunder` fraction on the body and floored at 45%
    if (defender.sunder > 0) armor *= Math.max(0.45, 1 - defender.sunder);
    if (attacker.equipment) armor *= 1 - this.fx.armorPen(ctx);
    /**
     * …and what the STRIKE SHAPE goes through on its own. A rapier's lunge ignores 40% of armour
     * and a thrust 25%; that is the whole reason to take a point weapon against something plated,
     * and it is a shape property rather than an affix so every rapier in the game has it.
     */
    if (pen > 0) armor *= 1 - Math.min(0.85, pen);
    amount *= 100 / (100 + Math.max(0, armor));
    const mres = d?.magicResist ?? defender.magicResist ?? 0;
    if (isMagic(element) && mres > 0) amount *= 100 / (100 + mres);
    // flat damage reduction from the `resistance` passive
    if (d?.resistAll) amount *= Math.max(0.25, 1 - d.resistAll / 100);
    // the defender's own affixes: physical/elemental reductions, last stand
    if (defender.equipment) amount *= this.fx.dmgIn({ self: defender, target: attacker, element, skill });

    // a block eats a fixed chunk
    let blocked = 0;
    if (d?.blockChance && rng() * 100 < d.blockChance) {
      blocked = Math.min(amount, d.blockPower || 0);
      amount -= blocked;
      if (defender.perkFlags?.riposte) defender.riposteReady = true;   // block arms it too
    }
    amount = Math.max(blocked ? 0 : 1, Math.round(amount));

    // a mana shield takes its share before health does
    // NOTHING in this game takes the player's mana when they are hit. The old mana shield did, and
    // it read as every enemy draining you; `cond_manaShieldOnHit` is a damage reduction now.
    const fromMana = 0;
    // then barrier, then health
    let absorbed = 0;
    if (defender.barrier > 0) {
      absorbed = Math.min(defender.barrier, amount);
      defender.barrier -= absorbed;
      amount -= absorbed;
    }

    const before = defender.hp ?? defender.maxHp;
    let hp = Math.max(0, before - amount);
    // cheat death and last-stand style saves get one look at a killing blow
    let saved = 0;
    if (hp <= 0 && defender.equipment) {
      saved = this.fx.preLethal({ self: defender, target: attacker, element });
      if (saved) hp = saved;
    }
    defender.hp = hp;

    /**
     * R21 — LIFE STEAL IS A WEAPON STAT, NOT A UNIVERSAL ONE.
     *
     * It used to fire on literally every source of damage in the game: swings, arrows, splash, and
     * every skill and spell cast, because `strike()` was handed `element` and `skill` and consulted
     * neither. A caster healing a share of their own spell damage makes every other sustain stat in
     * the game pointless — you never need armour, block, barrier or a potion if the damage you were
     * already dealing pays for itself.
     *
     * So the rule the play-test asked for: *"Life steal should work with melee or ranged physical
     * damage but not spells (or wands/staves)."* `skill` is set for every cast, and `element` is
     * `physical` only for an unbranded weapon hit — a wand or staff arrives here carrying its own
     * cast element (see `elementOf`), so the single test below excludes all three cases at once
     * without needing to know what a wand is.
     *
     * `manaSteal` keeps the old behaviour deliberately: it pays a caster's own resource back, which
     * is a cost reduction, not a second health bar.
     */
    const physicalHit = !skill && element === 'physical';
    const healed = (physicalHit && a?.lifeSteal) ? Math.round(amount * a.lifeSteal / 100) : 0;
    if (healed && attacker.hp != null) attacker.hp = Math.min(attacker.maxHp, attacker.hp + healed);
    const manaBack = a?.manaSteal ? Math.round(amount * a.manaSteal / 100) : 0;
    if (manaBack && attacker.mp != null) attacker.mp = Math.min(attacker.maxMp, attacker.mp + manaBack);

    // thorns: the defender bites back, by share and by flat
    let reflected = 0;
    if (attacker.hp != null) {
      const flat = defender.equipment ? this.fx.sum(defender, 'thornsFlat') : (defender.thorns ? 0 : 0);
      const share = (d?.thorns || 0) + (defender.equipment ? this.fx.sum(defender, 'reflect') : 0);
      reflected = Math.round(amount * share) + flat;
      if (reflected > 0) attacker.hp = Math.max(0, attacker.hp - reflected);
    }

    const result = { dodged: false, amount, crit, healed, manaBack, reflected, blocked, absorbed, fromMana, saved, element, dead: defender.hp <= 0 };
    // A belt-and-braces guard. A NaN anywhere upstream used to walk straight into a health bar and
    // leave it reading "NaN / 94" with no way to tell where it came from; now it is caught here.
    if (!Number.isFinite(result.amount)) {
      result.amount = 1;
      defender.hp = Math.max(0, before - 1);
      result.dead = defender.hp <= 0;
      if (typeof console !== 'undefined') console.warn('farhold: a strike produced a non-number', { attacker: attacker.name, defender: defender.name, dmgRange });
    }

    /**
     * THE SKILL TALENTS THAT PAY OUT ON A HIT.
     *
     * Four of them, all of which used to be a sentence on the Skills screen and nothing else:
     *
     *   Shattering — armour off, and it stays off, the same way `cond_sunderOnHit` works.
     *   Draining   — a share of the damage comes back to you.
     *   Cauterise  — a critical also burns, through whatever status hook the caller gave us.
     *   Branding   — a mark that makes everything else hurt more, as a real status so it ticks down.
     *
     * …plus Hunger, which cannot reach the skill bar from here, so the seconds owed are left on the
     * player and `js/skills.js` `update` hands them to the right slot on the next frame.
     */
    if (rules && amount > 0) {
      if (rules.sunder) defender.armor = Math.max(0, (defender.armor || 0) - rules.sunder);
      if (rules.leech && attacker.hp != null) {
        attacker.hp = Math.min(attacker.maxHp ?? attacker.hp, attacker.hp + Math.round(amount * rules.leech));
      }
      if (rules.critBurn && crit && applyStatus) {
        applyStatus(defender, 'burn', {
          seconds: rules.critBurnSeconds || 4, perSecond: Math.max(1, (amount * rules.critBurn) / (rules.critBurnSeconds || 4)),
          name: 'Cauterised', element: 'fire',
        });
      }
      if (rules.mark && applyStatus) {
        applyStatus(defender, 'marked', {
          seconds: rules.markSeconds || 6, takeMore: rules.mark, name: 'Branded', kind: 'debuff', element: 'arcane',
        });
      }
      if (rules.killRefund && defender.hp <= 0) {
        attacker.cooldownRefund = { skill: rules.skill, seconds: rules.killRefund };
      }
    }

    /**
     * THE PERK FOREST'S OWN TALENT NODES, which were eight flags and only two readers.
     *
     *   Quarry     — the first hit on something marks it, and the mark makes everything hurt more.
     *   Cauterise  — a critical also burns.
     *   Pack Sense — a companion's hit mends its owner. A pet carries `owner`, and a pet's damage
     *                comes through this same function (`rpg.strike(pet, enemy)`), so this is where
     *                the tenth can be taken off it.
     *
     * Riposte is armed further up, where a dodge and a block are decided. Sunder is read by
     * js/main.js. Volley, Echo and Scavenger turned out to be better as numbers than as flags —
     * see TALENT_NODES in js/perks.js.
     */
    if (amount > 0) {
      const flags = attacker.perkFlags;
      if (flags?.mark && applyStatus && !defender.statuses?.marked) {
        applyStatus(defender, 'marked', {
          seconds: 8, takeMore: 0.15, name: 'Quarry', kind: 'debuff', element: 'arcane',
        });
      }
      if (flags?.cauterise && crit && applyStatus) {
        applyStatus(defender, 'burn', {
          seconds: 4, perSecond: Math.max(1, amount * 0.25 / 4), name: 'Cauterised', element: 'fire',
        });
      }
      const owner = attacker.owner;
      if (owner?.perkFlags?.pack && owner.hp != null) {
        owner.hp = Math.min(owner.maxHp ?? owner.hp, owner.hp + Math.max(1, Math.round(amount * 0.1)));
      }
    }

    // after the hit: streaks, bleeds, mana on hit, first-hit marks
    if (attacker.equipment) {
      const post = { self: attacker, target: defender, amount, crit, element, applyStatus };
      this.fx.onHit(post);
      if (crit) this.fx.onCrit(post);
      if (post.mana && attacker.mp != null) attacker.mp = Math.min(attacker.maxMp, attacker.mp + post.mana);
      result.post = post;
    }
    if (defender.equipment) {
      const hurt = { self: defender, target: attacker, amount, element };
      this.fx.onDamaged(hurt);
      result.defenderPost = hurt;
    }
    return result;
  }

  // ---------------------------------------------------------------- loot

  /** The base items a character of this level can find. */
  basesFor(level) {
    const tiers = this.b.lootTiers || [];
    const tier = tiers.filter(t => (t.minLevel ?? 1) <= level).pop();
    return tier?.bases || ['sword', 'dagger', 'light_chest', 'ring'];
  }

  rarityFor(level, rng, magicFind = 0, rarityBoost = 1) {
    const table = this.b.rarity || { normal: 0.52, magic: 0.31, rare: 0.14, legendary: 0.03 };
    const lift = (1 + magicFind / 100) * rarityBoost;
    const roll = rng();
    let cut = (table.legendary ?? 0.03) * lift;
    if (roll < cut) return 'legendary';
    cut += (table.rare ?? 0.14) * lift;
    if (roll < cut) return 'rare';
    cut += (table.magic ?? 0.31) * lift;
    if (roll < cut) return 'magic';
    return 'normal';
  }

  qualityFor(level) {
    const q = ['low', 'medium', 'high', 'elite', 'exotic'];
    return q[Math.min(q.length - 1, Math.floor((level - 1) / 6))];
  }

  /**
   * Roll a drop. Returns an item or null. Uniques and set pieces come out of the same generator
   * Emberveil uses, so a legendary here is a real Emberveil legendary with its own power on it.
   */
  rollDrop({ level = 1, rng = this.rng, magicFind = 0, chance = null, bases = null, rarityBoost = 1, floor = null } = {}) {
    /**
     * R18 — the level this drop is FOR, so the unique and set paths can be stamped with an item
     * level like everything else. `generateUnique` and `maybeSetItem` take an act, not a level, and
     * the wrappers in `itemLevels` need one — see the note there.
     */
    this.lastDropLevel = level;
    const dropChance = chance ?? (this.b.loot?.dropRate ?? 0.42);
    if (rng() > dropChance) return null;
    let rarity = this.rarityFor(level, rng, magicFind, rarityBoost);
    // a chest or a boss can promise "magic or better"
    const LADDER = ['normal', 'magic', 'rare', 'legendary'];
    if (floor && LADDER.indexOf(rarity) < LADDER.indexOf(floor)) rarity = floor;
    if (rarity === 'legendary') {
      const act = Math.max(1, Math.min(6, Math.ceil(level / 5)));
      const set = this.loot.maybeSetItem(act, rng, this.b.loot?.setChance ?? 0.35);
      if (set) return attuneWeapon(set);
      const uniques = (this.items.uniques || []).filter(u => (u.act ?? 1) <= act);
      if (uniques.length && rng() < 0.5) return attuneWeapon(this.loot.generateUnique(rng.pick(uniques).id, rng));
    }
    const pool = bases || this.basesFor(level);
    const baseKey = rng.pick(this.loot.basesForAct(pool, Math.ceil(level / 5)));
    return attuneWeapon(this.loot.generate(baseKey, rarity, this.qualityFor(level), { rng }));
  }

  /**
   * Everything one kill drops. A normal enemy rolls once; a champion, a rare or a boss rolls
   * `dropBonus` extra times and at a better rarity, which is where the whole "kill the blue one"
   * loop comes from.
   */
  rollDrops(enemy, { rng = this.rng, magicFind = 0 } = {}) {
    const out = [];
    const rolls = 1 + (enemy.dropBonus || 0);
    for (let i = 0; i < rolls; i++) {
      const item = this.rollDrop({
        level: enemy.level, rng, magicFind, bases: enemy.dropBases,
        chance: Math.min(0.98, (this.b.loot?.dropRate ?? 0.45) * (enemy.dropMult || 1)),
        rarityBoost: enemy.dropRarity || 1,
        floor: enemy.rank === 'boss' && i === 0 ? 'rare' : enemy.rank === 'rare' && i === 0 ? 'magic' : null,
      });
      if (item) out.push(item);
    }
    return out;
  }

  /**
   * The avatar overrides for what this character is wearing. Armour is looked up by the BASE's
   * tier — the generated item does not carry it, but `loot.base(baseKey)` does.
   */
  gearLook(player) {
    const out = {};
    for (const [slot, key] of [['head', 'head'], ['chest', 'chest'], ['legs', 'legs'], ['feet', 'feet']]) {
      const item = player.equipment[slot];
      if (!item) continue;
      const tier = this.loot.base(item.baseKey)?.tier;
      const part = ARMOUR_LOOK[key]?.[tier];
      if (!part) continue;
      const rare = item.setId || item.isUnique || item.rarity === 'legendary';
      const colour = rare ? '#c8a24a' : item.rarity === 'rare' ? '#8a7a4a' : item.rarity === 'magic' ? '#4a5a7a' : null;
      const target = key === 'head' ? 'hat' : key === 'chest' ? 'top' : key === 'legs' ? 'bottom' : 'shoes';
      out[target] = { id: part, ...(colour ? { color: colour } : {}) };
    }

    /**
     * THE LIGHT YOU ARE CARRYING, ON THE BODY.
     *
     * "Torches and lights need a model on the player — a held torch, a belt-mounted lantern." The
     * light has its own slot (so it never costs you a shield), and NOTHING drew it: `applyGearLook`
     * only looked at `equipment.offhand`, so a torch burned in the dark with nothing in your hand.
     *
     * A torch is carried, so it goes in the off hand when that hand is free. A lantern and a wisp
     * lamp hang off the belt, so they go on the `decor` slot and you keep both hands — which is
     * also why they are the ones worth buying. The parts are in avatar-3d/js/chibi2-gear.js.
     */
    const light = player.equipment?.light;
    if (light) {
      const held = light.look?.offhand || 'torch';
      const colour = light.color || light.look?.color || '#c08040';
      if (held === 'torch') {
        // a torch is carried in the hand when that hand is free, and hangs off the belt when a
        // shield or a second weapon has it
        if (player.equipment.offhand) out.decor = { id: 'belt_torch', color: colour };
        else out.offhand = { id: 'torch', color: colour };
      } else {
        out.decor = { id: held === 'lamp' ? 'wisp_lamp' : 'belt_lantern', color: colour };
      }
    }
    return out;
  }

  /** Break an item down for materials. */
  salvage(item, rng = this.rng) { return this.loot.salvage(item, rng); }

  /**
   * What an item is worth — respecting the price the item itself carries.
   *
   * The shared Loot.price() (prototypes/emberveil/js/loot.js) prices EVERYTHING off one global
   * `basePrice` in the data, multiplied by quality and rarity. That works when every item is a sword
   * or a breastplate off the same table. It does not work for js/gear.js, which sets a real price on
   * each mount and each light so that the ladder means something: a Pitch Torch is 20 gold and a
   * Wisp Lamp is 620. Those were being thrown away, and a Wisp Lamp sat on the shelf at 30 gold —
   * so the "buy a better light" progression was free, and the Dray Elk was pocket change.
   *
   * Emberveil's loot.js is shared and has its own tests, so it is left alone: anything carrying its
   * own `basePrice` is priced here, by the same quality/rarity curve, and everything else falls
   * through to the shared one exactly as before.
   */
  price(item) {
    if (!item?.basePrice) return this.loot.price(item);
    const d = this.loot.d || {};
    const shop = this.loot.T?.shopPrice ?? 1;
    const quality = d.priceQualityMult?.[item.quality] || 1;
    const rarity = d.priceRarityMult?.[item.rarity] || 1;
    return Math.max(1, Math.round(item.basePrice * shop * quality * rarity * (item.isUnique ? 2 : 1)));
  }
}
