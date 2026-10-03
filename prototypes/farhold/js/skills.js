// Farhold — the skill bar.
//
// Six skills on keys 1-6, unlocked as you level, each with a cooldown and a mana cost, drawn with
// the spell effects `avatar-3d/js/spellfx.js` already has. Emberveil's skills are written for a
// turn-based party fight — "adjacent2", "row", "per_source" — which means nothing to one person
// standing in a field, so these are its ideas rebuilt around a shape, a radius and a cast.
//
// The model is pure: it decides what a skill does and to whom. The caller draws it and applies the
// damage, so the node tests can drive the whole thing without a renderer.
//
// Round 4 added: the other eight shapes (beam, ground, dash, summon), eight more statuses, level
// unlocks, and the two affixes that touch this file — `cooldownReduction` and
// `cond_skillMpCostReduce`.
//
// ROUND 11: **the skill talents were never applied to a skill.**
//
// "Fanned is unlocked but only ONE projectile appears." `js/skilltalents.js` has done the work
// since round 8 and `js/main.js` only ever called it for a staff's own spell — `castSkill` took
// what `use()` returned and drew that, so every one of the eighteen talents on the Skills screen
// was a sentence and nothing else. The fold happens HERE now, in `use()`, which is the one place
// every skill's plan is built, so nothing downstream had to change to make the whole board live.

import { talentPlan, talentsOn, castRulesFrom, registerSkillRows } from './skilltalents.js';
// R28 — the mechanics vocabulary, forms, resources and the per-hit rules (pure)
import {
  VOCAB_KEYS, PENDING, describeVocab, applyMod, repeatsOf, resolveForm, toggleForm, tickForms, formIds,
  elementFromForms, resourceOf, resourceMax, gainResource, spendResource, tickResources, cdRateOf,
} from './skillmech.js';
// R17 — the one place the follower bonus is read off `derived`, so the summon cap and the follower
// book can never drift apart about what The Kept Company is worth.
import { followerBonus } from './followers.js';
import { handsOf, meleeSpanOf } from './weapons.js';
import { fmt, pct, pctOf, secs } from '../../../shared/format.js';

// ─────────────────────────────────────────────────────────────────────────────
// R21 — A SKILL'S DESCRIPTION IS BUILT FROM THE SKILL'S OWN NUMBERS.
//
//   "We need to give numeric values where appropriate for magnitude and duration. Vague
//    descriptions are TERRIBLE and go against the game."
//
// Every one of the forty skills carried a hand-written line that named no quantity at all —
// "One heavy blow in front of you", "A sweep that catches everything around you", "A blow that
// takes the strength out of whatever it lands on". A player reading that cannot tell whether
// Sunder is worth a slot, and two of those lines were not even true: Execute promised it was
// "wasted on anything healthy" and nothing in the game gives Execute a bonus against a hurt
// enemy, and Smoke promised you "vanish for a moment" when all Smoke does is hand you Hastened.
//
// The numbers were already on the same object the whole time — `mult`, `reach`, `arc`, `radius`,
// `range`, `splash`, `width`, `projectiles`, `spread`, `heal`, `status`, `mp`, `cooldown` — and
// the status table below them carries the rest. So no skill has a hand-written sentence any more:
// `describeSkill` writes every line from those fields, the same way `js/skilltalents.js`
// `describeMod` writes every talent line, and for the same reason — a sentence that is generated
// from the behaviour cannot drift away from the behaviour.
//
// `data/skills.json` carries the generated text as its `desc` so that the screens which read the
// data file directly (js/classbuild-ui.js, js/followers-ui.js, js/newgame.js) are right without
// having to build a skill bar first; `describeSkills` then rewrites all forty at load anyway, so
// changing `mult` in the data file changes the card even if nobody remembered to regenerate.
// ─────────────────────────────────────────────────────────────────────────────

/** Radians as whole degrees, for an arc or a fan. */
function degrees(rad) { return `${fmt((rad || 0) * 180 / Math.PI, { decimals: 0 })}°`; }
/** A distance on the ground. */
function metres(n) { return `${fmt(n)} m`; }
/**
 * "a" or "an" in front of a figure, read aloud: an 8° arc, an 11° fan, an 80° arc, a 92° arc.
 * Only the eights and the elevens/eighteens take "an", which covers every angle a skill can have.
 */
function article(text) {
  const s = String(text);
  return /^(8|11|18)/.test(s) ? 'an' : 'a';
}
/** `bone_thrall` → `Bone Thrall`, which is the name data/enemies.json gives every summon. */
function petName(id) {
  return String(id || '').split('_').filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/**
 * How much of a hit's damage a status carries over, as a share of the weapon's damage.
 *
 * `js/main.js` hangs a skill's status with `power = plan.damage * STATUS_POWER_SHARE * statusMult`,
 * and `tickStatuses` pays `perSecond * power` every second for `seconds`. So the total a burn deals
 * is the skill's own multiplier times all of that.
 *
 * R21b — IT WAS 0.9, AND THE DAMAGE-OVER-TIME WAS THE SKILL.
 *
 * Generating the skill descriptions in round 21 made this visible for the first time: every number
 * was already on the skill object and none of it had ever been printed, so nobody had added them
 * up. Measured across all forty skills, by damage per second of cooldown:
 *
 *     poison_dart  481% over 5s cd  ->  96%/s      power_strike  190% over 4s cd  ->  48%/s
 *     firebolt     376% over 4s cd  ->  94%/s      aimed_shot    220% over 5s cd  ->  44%/s
 *     eviscerate   577% over 7s cd  ->  82%/s      shadow_lance  190% over 5s cd  ->  38%/s
 *
 * The three best skills in the game were the three with a damage-over-time on them, and the five
 * DoT skills averaged **68% of weapon damage a second against 20% for everything else** — three
 * and a half times better. The burn was worth more than the bolt that applied it (216% against
 * 160%), and Poison Dart's poison was worth more than three times its own dart.
 *
 * That is not a status, it is the whole skill with a delivery animation. 0.35 puts a DoT skill's
 * total in the same band as the best direct skills (51-61%/s against power_strike's 48%/s) and
 * leaves the burn a real but secondary part of the hit — about 45% of the impact, except on Poison
 * Dart, which carries `statusMult: 1.8` because being mostly poison is the point of it.
 *
 * `js/main.js` READS THIS CONSTANT NOW. It used to carry its own `0.9` literal, so the description
 * generator here and the code that actually applies the status were two copies of one number that
 * nothing checked against each other — `tests/wording.test.js` now does.
 */
export const STATUS_POWER_SHARE = 0.35;

/** What a damage-over-time status adds, as a share of weapon damage. */
function statusTotal(skill, spec) {
  return (skill.mult || 1) * STATUS_POWER_SHARE * (skill.statusMult || 1)
    * (spec.perSecond || 0) * (spec.seconds || 0);
}

/**
 * The first sentence: what the shape reaches, how far, and what it hits for.
 *
 * ONE thing is deliberately left out — the distance falloff. Every area in the game pays full
 * damage at the middle and a share of it at the rim (js/actors.js `strikeArea`, 0.5 for a bolt's
 * splash, 0.6 for a ring, 0.8 along a dash), and printing that on every area skill in the game
 * would lengthen each card to say the same thing again. The radius is the number the player is
 * choosing between.
 */
/** Status names for a sentence that only needs the word ("Shocked"), kept beside the generator. */
const STATUS_NAMES = { shock: 'Shocked', chill: 'Chilled', burn: 'Burning', poison: 'Poisoned', curse: 'Cursed', weaken: 'Weakened' };

function shapeSentence(skill) {
  const n = Math.max(1, skill.projectiles || 1);
  const dmg = `${pctOf(Math.round((skill.mult || 1) * 100))} weapon damage`
    + (skill.element && skill.element !== 'physical' ? ` as ${skill.element}` : '');
  // R28 — a row with no `mult` deals no damage (Sanctuary, Drowse, a post): the card says so
  const forDmg = skill.mult ? `for ${dmg}` : 'without dealing damage';
  const shot = skill.element === 'physical' ? 'shot' : 'bolt';
  const splash = skill.splash
    ? `, splashing everything within ${metres(skill.splash)} of where ${n > 1 ? 'a' : 'the'} ${shot} lands`
    : '';
  const arc = degrees(skill.arc ?? 1.5);
  const fan = degrees(skill.spread || 0);
  const width = metres(skill.width ?? 1.8);
  switch (skill.shape) {
    case 'melee':
      // R25 — Flamethrower: the same cone again and again while you hold it
      return skill.repeats > 1
        ? `${skill.breath ? 'Breathes a stream that strikes' : 'Strikes'} everything in ${article(arc)} ${arc} cone ${metres(skill.reach ?? 3)} in front of you ${fmt(skill.repeats)} times over ${secs(skill.repeats * (skill.repeatEvery ?? 0.32))}, ${forDmg} each time.`
        : `Strikes everything in ${article(arc)} ${arc} arc ${metres(skill.reach ?? 3)} in front of you, or as far and as wide as your weapon swings if that is more, ${forDmg}.`;
    case 'around':
      // R25 — Whirlwind spins five times: say so, and say it is per spin
      // R28 — strikes that each pick a point or a body inside the ring are not spins
      if (skill.repeats > 1 && (skill.repeatSpec?.scatter || skill.repeatSpec?.target)) {
        return `Strikes ${skill.repeats} times over ${secs(skill.repeats * (skill.repeatEvery ?? 0.32))}, each strike at one spot within ${metres(skill.radius ?? 4)} of you, ${metres(Math.min(2.4, skill.radius ?? 2.4))} across, ${forDmg} each.`;
      }
      return skill.repeats > 1
        ? `Spins ${skill.repeats} times, striking everything within ${metres(skill.radius ?? 4)} of you ${forDmg} on every spin.`
        : `Strikes everything within ${metres(skill.radius ?? 4)} of you ${forDmg}.`;
    case 'beam':
      return `Fires ${article(width)} ${width} wide beam ${metres(skill.range ?? 20)} straight ahead, striking everything in the line ${forDmg}.`;
    case 'ground': {
      // R28 — a ground skill that deals no damage: where it lands, and (if it applies a status) how wide
      if (!skill.mult) {
        const what = skill.status || skill.statuses ? `, affecting everything within ${metres(skill.radius ?? 5)} of it` : '';
        return `Lands on a spot up to ${metres(skill.range ?? 30)} away${skill.delay ? `, ${secs(skill.delay)} after you cast` : ''}${what}.`;
      }
      // R25 — Blizzard, Toxic Cloud and Void Rift pulse; Judgement lands a beat after the cast
      const lands = skill.delay ? `, ${secs(skill.delay)} after you cast,` : '';
      const pull = skill.pull ? ` Every pulse drags everything ${metres(skill.pull)} toward the middle.` : '';
      return skill.repeats > 1
        ? `Falls on a spot up to ${metres(skill.range ?? 30)} away${lands} and strikes everything within ${metres(skill.radius ?? 5)} of it ${fmt(skill.repeats)} times over ${secs(skill.repeats * (skill.repeatEvery ?? 0.32))}, ${forDmg} each time.${pull}`
        : `Falls on a spot up to ${metres(skill.range ?? 30)} away${lands} striking everything within ${metres(skill.radius ?? 5)} of that spot ${forDmg}.${pull}`;
    }
    case 'dash': {
      // R28 — a `dash` block says where you go (js/skillmech.js); this only says what it strikes
      const d = skill.dash && typeof skill.dash === 'object' ? skill.dash : null;
      if (!d) return `Carries you ${metres(skill.range ?? 10)} forward, striking everything within ${metres(skill.splash ?? 2)} of your path ${forDmg}.`;
      if (d.leap || d.noPath) return ['target', 'behind', 'hit'].includes(d.to) ? `Strikes the enemy you reach ${forDmg}.` : '';
      return ['target', 'behind', 'hit'].includes(d.to)
        ? `Strikes everything within ${metres(skill.splash ?? 2)} of your path, and the enemy you reach, ${forDmg}.`
        : `Strikes everything within ${metres(skill.splash ?? 2)} of your path ${forDmg}.`;
    }
    case 'summon': {
      // a summon with no pet of its own (a decoy, a brood) is described by its `summon` block
      if (!skill.pet) return '';
      const count = Math.max(1, skill.count || 1);
      const who = petName(skill.pet) + (count > 1 ? 's' : '');
      return `Summons ${fmt(count)} ${who} to fight beside you.`;
    }
    case 'self': {
      // R25 — the two self skills that fight for you: Ember Stride's trail and Storm Orbs
      const t = skill.trail, o = skill.orbs;
      if (t) return `For ${secs(t.seconds)}, every step leaves burning ground behind you, ${metres(t.radius * 2)} across, that lasts ${secs(t.burns)} and strikes whatever stands in it ${forDmg} every 0.75s.`;
      if (o) {
        const st = o.status && STATUS_NAMES[o.status] ? ` and leaves it ${STATUS_NAMES[o.status]}` : '';
        return `For ${secs(o.seconds)}, ${fmt(o.count)} orbs circle you in a fight; each one strikes the nearest enemy within ${metres(o.radius)} every ${secs(o.every)} ${forDmg}${st}.`;
      }
      return '';
    }
    default:
      // a bolt, or a fan of them
      return n > 1
        ? `Looses ${fmt(n)} ${shot}s in ${article(fan)} ${fan} fan out to ${metres(skill.range ?? 30)}, each ${forDmg}${splash}.`
        : `Looses one ${shot} out to ${metres(skill.range ?? 30)} ${forDmg}${splash}.`;
  }
}

/** The status sentence, with the magnitude and the duration the status table actually carries. */
function statusSentence(skill, spec) {
  if (!spec) return '';
  const name = spec.name || 'an effect';
  const dur = secs(spec.seconds || 0);
  if (skill.shape === 'self' || spec.kind === 'buff') {
    if (spec.healPerSecond) {
      // a heal over time states the total and the span, never a per-second figure
      return `Gives you ${name}: heals ${pct((spec.healPerSecond || 0) * (spec.seconds || 0))} of your maximum health over ${dur}.`
        + (skill.pets || skill.status === 'regen' ? ' Everything following you is mended with you.' : '');
    }
    const bits = [];
    if (spec.damage) bits.push(`deal ${pct(spec.damage)} more damage`);
    if (spec.resist) bits.push(`take ${pct(spec.resist)} less damage`);
    if (spec.armor) bits.push(`gain ${fmt(spec.armor)} armour`);
    if (spec.haste) bits.push(`attack ${pct(spec.haste)} faster`);
    if (spec.move) bits.push(`move ${pct(spec.move)} faster`);
    if (spec.slow) bits.push(`move ${pct(spec.slow)} slower`);
    if (!bits.length) return '';
    return `Gives you ${name}: you ${list(bits)} for ${dur}.`
      + (skill.pets ? ' Everything following you gets the same.' : '');
  }
  if (spec.kind === 'damage') {
    const total = statusTotal(skill, spec);
    return `Leaves the target ${name}: a further ${pctOf(Math.round(total * 100))} weapon damage over ${dur}.`;
  }
  const bits = [];
  if (spec.takeMore) bits.push(`takes ${pct(spec.takeMore)} more damage`);
  if (spec.dealLess) bits.push(`deals ${pct(spec.dealLess)} less damage`);
  if (spec.slow) bits.push(`moves ${pct(spec.slow)} slower`);
  if (!bits.length) return '';
  return `Leaves the target ${name}: the target ${list(bits)} for ${dur}.`;
}

/** "a", "a and b", "a, b and c" — an Oxford-free list, because a stat line is not prose. */
function list(bits) {
  if (bits.length <= 1) return bits[0] || '';
  return `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}`;
}

/** What the skill gives back, which is a share of your health bar — except Drain. */
function healSentence(skill) {
  if (!skill.heal) return '';
  // a beam heals a share of the damage it deals (js/main.js `healed += result.amount * healFrac`);
  // everything else heals a share of your own maximum health
  return skill.shape === 'beam'
    ? `Heals you for ${pct(skill.heal)} of the damage dealt.`
    : `Heals you for ${pct(skill.heal)} of your maximum health.`;
}

/**
 * ONE skill's description, written from that skill's own fields.
 *
 * @param {object} skill    a row out of `data/skills.json` — `shape`, `mult`, `reach`, `arc`,
 *                          `radius`, `range`, `splash`, `width`, `projectiles`, `spread`,
 *                          `status`, `statusMult`, `heal`, `pet`, `count`, `mp`, `cooldown`
 * @param {object} statuses the file's `statuses` block, for the magnitude and duration of `status`
 * @param {{cost?: boolean}} [opts] `cost: false` leaves off the mana and cooldown clause, for the
 *                          screens that already print both beside the name
 * @returns {string} e.g. "Strikes everything within 4.5 m of you for 115% weapon damage.
 *                        6 mana, 7s cooldown."
 */
export function describeSkill(skill, statuses = {}, { cost = true, unlockAt = 1, skills = {} } = {}) {
  if (!skill) return '';
  // R25 — the card says what it will actually hit for (cooldown and unlock level included)
  if (skill.mult && skill.shape !== 'summon' && (skill.shape !== 'self' || skill.trail || skill.orbs)) skill = { ...skill, mult: effectiveMult(skill, unlockAt) };
  // R28 — `repeats` may be the object form; the base sentence reads the count
  if (skill.repeats && typeof skill.repeats === 'object') skill = { ...skill, repeatEvery: skill.repeats.every ?? skill.repeatEvery, repeatSpec: skill.repeats, repeats: skill.repeats.count || 1 };
  if (skill.heal && typeof skill.heal === 'object') skill = { ...skill, heal: skill.heal.share || 0 };
  const spec = skill.status ? statuses[skill.status] : null;
  // a form skill and a pure-vocabulary self skill have no base sentence; the vocabulary carries them
  const base = skill.form ? '' : shapeSentence(skill);
  /**
   * R28 — every vocabulary key on the row gets its own generated sentence (js/skillmech.js VOCAB),
   * so a knockback, a trap, a counter window or a charge says what it does in numbers. The
   * `repeats` object's riders read off `repeatSpec`.
   */
  const ctx = { statuses, skills, atSelf: skill.shape === 'self' || skill.shape === 'around' };
  const vocab = describeVocab({ ...skill, repeats: skill.repeatSpec || null }, ctx);
  // R28 — a jumping bolt says how it jumps (Forked Bolt, Spirit Bolt)
  if (skill.chains > 0) vocab.unshift(`Jumps to ${fmt(skill.chains)} more ${skill.chains === 1 ? 'enemy' : 'enemies'}, preferring Shocked ones (12 m between Shocked enemies, 8 m otherwise), each jump dealing ${pct(skill.chainFalloff ?? 0.7)} of the last.`);
  const parts = [base, statusSentence(skill, spec), healSentence(skill), ...vocab].filter(Boolean);
  if (cost) {
    const price = skill.mp ? `${fmt(skill.mp)} mana` : 'No mana cost';
    parts.push(`${price}, ${secs(skill.cooldown ?? 6)} cooldown.`);
  }
  return parts.join(' ');
}

/**
 * Write every skill's line, from its own numbers. Done once, at load — the same thing
 * `js/skilltalents.js` does to `TALENT_LIBRARY` at the bottom of its own table.
 *
 * Safe to run more than once: nothing here reads the old `desc`.
 */
const DESCRIBED_SKILLS = new WeakMap();
export function describeSkills(data) {
  if (!data?.skills) return data;
  // once per table (and again if rows were added): every bar built over the same data shares it
  const n = Object.keys(data.skills).length;
  if (DESCRIBED_SKILLS.get(data.skills) === n) return data;
  DESCRIBED_SKILLS.set(data.skills, n);
  for (const skill of Object.values(data.skills)) {
    skill.desc = describeSkill(skill, data.statuses || {}, { skills: data.skills });
    /**
     * R21 — the same line WITHOUT the mana and cooldown clause.
     *
     * The skill bar card and the hotkey tooltip both already print `12 mana · 4.0s cooldown` on
     * their own row, directly above the description, so the generated line repeated it. The card's
     * `.sk-desc` is also clamped to three lines, and the clause it was clipping was the duplicated
     * one. Both readers take `descShort`; the item tooltip and the class builder, which print no
     * cost of their own, keep the full line.
     */
    skill.descShort = describeSkill(skill, data.statuses || {}, { cost: false, skills: data.skills });
  }
  return data;
}

/**
 * R25 — WHAT A SKILL IS WORTH, BY WHEN YOU GET IT AND HOW LONG YOU WAIT FOR IT.
 *
 *   "Some skills available at level 1 are about as powerful as those unlocked at level 24. Higher
 *    level spells should have more interesting effects, extra debuffs, or at the very least should
 *    do more damage. If they do about the same damage, what is the longer cooldown for?"
 *
 * Two factors on a skill's damage share (`mult`), multiplied together:
 *
 *   unlockPower  from the slot's unlock level: 1.0 at level 1 rising in a straight line to 2.0 at
 *                level 24. The same skill is worth more to a class that waits longer for it.
 *   cooldownPower from the skill's own cooldown: a 4-second skill is the baseline and every second
 *                past that adds 8%, so a 12-second Whirlwind is x1.64 and a 22-second Fallstone
 *                x2.44. A long wait now buys a big hit — which is the whole of the question above.
 *
 * Heals, shields and summons are untouched: this is about damage per press.
 */
export const UNLOCK_POWER_TOP = 2.0;
export function unlockPower(level = 1) {
  return 1 + (Math.max(1, Math.min(24, level)) - 1) / 23 * (UNLOCK_POWER_TOP - 1);
}
export function cooldownPower(cooldown = 4) {
  return 1 + Math.max(0, (cooldown ?? 4) - 4) * 0.08;
}
/** The damage share a skill in a slot that opens at `unlockAt` actually hits for. */
export function effectiveMult(skill, unlockAt = 1) {
  return (skill?.mult || 1) * cooldownPower(skill?.cooldown) * unlockPower(unlockAt);
}

/**
 * A BURNING ENEMY DID NOT LOOK LIKE IT WAS BURNING.
 *
 * `applyStatus` mutated `target.statuses` and drew nothing: all twenty-three status auras exist in
 * `avatar-3d/js/spellfx.js` and Farhold wired them only to enemy MODIFIERS, so a poisoned wolf and
 * a healthy one were the same wolf. The renderer cannot be imported here — this module is pure, and
 * the node tests depend on that — so the field hands in a sink at start-up and everything that
 * hangs a status on anything goes through it for free.
 *
 *   setStatusFx((unit, type, on) => spellfx.status(unit.actor.group, type, on));
 *   setStatusPulse((unit, type) => spellfx.pulseStatus(unit.actor.group, type));
 */
let statusFx = null;
let statusPulse = null;
export function setStatusFx(fn) { statusFx = typeof fn === 'function' ? fn : null; }
export function setStatusPulse(fn) { statusPulse = typeof fn === 'function' ? fn : null; }
/** R28 — called when a status with an exit behaviour (a tag's `burstOnExpire`) runs out. */
let statusExpire = null;
export function setStatusExpire(fn) { statusExpire = typeof fn === 'function' ? fn : null; }

/** Statuses live on the target as `{ type, remaining, power, … }`. */
export function applyStatus(target, type, spec, power = 1, { longer = 0, strength = 1 } = {}) {
  if (!spec) return null;
  target.statuses = target.statuses || {};
  // R28 — a form that is immune to a status (Sporecap and poison) simply does not take it
  for (const st of Object.values(target.statuses)) if (Array.isArray(st.immune) && st.immune.includes(type)) return null;
  const existing = target.statuses[type];
  const entry = {
    type, remaining: (spec.seconds || 4) + longer, power: power * strength,
    perSecond: spec.perSecond ?? 0, slow: spec.slow ?? 0,
    damage: spec.damage ?? 0, resist: spec.resist ?? 0,
    takeMore: spec.takeMore ?? 0, dealLess: spec.dealLess ?? 0,
    haste: spec.haste ?? 0, move: spec.move ?? 0, armor: spec.armor ?? 0,
    healPerSecond: spec.healPerSecond ?? 0,
    element: spec.element, name: spec.name, kind: spec.kind,
  };
  /**
   * R28 — the new status fields ride along as written: a root, a sleep's `breakOnDamage`, a self
   * buff's `resistPerFoe` / `reflect` / `ccImmune` / `ward` / `counter`… Each is read where its row
   * says (js/skillmech.js, js/actors.js, js/rpg.js); copying them here is what lets one data row
   * carry a new behaviour without this function learning every name.
   */
  for (const k of Object.keys(spec)) if (!(k in entry) && k !== 'seconds' && k !== 'stackMax' && k !== 'onMax') entry[k] = typeof spec[k] === 'object' && spec[k] ? structuredClone(spec[k]) : spec[k];
  /**
   * R23 — THE FOUR SHAPES A UNIQUE'S STATUS CAN TAKE, all carried on the spec so nothing else in
   * the game has to know which weapon applied it:
   *
   *   stackMax    a status that STACKS instead of refreshing (Venom, Frostbite). `perSecond` and
   *               `slowPerStack` are per stack; `onMax` swaps the stack for another status at the
   *               ceiling (Frostbite at 5 becomes Frozen).
   *   ramp        damage that rises every tick it keeps burning (Kindling), capped at `rampCap`x.
   *   growOnMove  damage that rises with every metre the target walks (Hemorrhage).
   *   detonate    pays `detonate` x whatever was stored on it when it runs out (Doom).
   *
   * A refresh keeps the PROGRESS of any of them — the ramp's tick count, the metres walked, the
   * damage stored — because a Kindling that restarted from its first tick on every hit would
   * never climb at all for anybody swinging faster than once a second.
   */
  if (spec.stackMax) {
    const stacks = Math.min(spec.stackMax, (existing?.stacks || 0) + 1);
    entry.stacks = stacks;
    entry.perStack = Math.max(existing?.perStack || 0, (spec.perSecond ?? 0));
    entry.perSecond = entry.perStack * stacks;
    entry.slowPerStack = spec.slowPerStack ?? 0;
    entry.slow = Math.min(0.95, entry.slowPerStack * stacks);
    if (spec.onMax && stacks >= spec.stackMax) {
      if (existing) { delete target.statuses[type]; statusFx?.(target, type, false); }
      return applyStatus(target, spec.onMax.type, spec.onMax.spec, 1);
    }
    target.statuses[type] = { ...entry, since: existing?.since || 0 };
    if (!existing) statusFx?.(target, type, true);
    return target.statuses[type];
  }
  if (spec.ramp) { entry.ramp = spec.ramp; entry.rampCap = spec.rampCap ?? 3; }
  if (spec.growOnMove) { entry.growOnMove = spec.growOnMove; entry.growCap = spec.growCap ?? 1; }
  if (spec.detonate) entry.detonate = spec.detonate;
  if (existing) {
    for (const k of ['ticks', 'moved', 'lastX', 'lastZ', 'stored', 'since']) if (existing[k] != null) entry[k] = existing[k];
  }
  // refreshing beats stacking: a second burn resets the timer rather than doubling the pain
  target.statuses[type] = existing ? { ...entry, remaining: Math.max(existing.remaining, entry.remaining) } : entry;
  if (!existing) statusFx?.(target, type, true);
  return target.statuses[type];
}

/** How often a damage-over-time status actually lands, in seconds. */
export const TICK_EVERY = 1;

/**
 * Tick every status on a unit. Returns the damage it took this step (healing counts negative).
 *
 * **Damage over time lands in whole ticks, not per frame.** It used to take `perSecond * dt` sixty
 * times a second, which is arithmetically the same total and reads as nothing at all: "poison
 * damage, at least from the ranger's poison dart skill, seems to only do one damage per tick and is
 * almost useless". A second's worth arriving at once is the same damage and a legible number, and
 * it is how every game that has a poison does it.
 *
 * Healing still runs per frame — a regeneration that arrived in lumps would look like a stutter.
 */
export function tickStatuses(unit, dt, { resist = 1 } = {}) {
  if (!unit.statuses) return 0;
  let damage = 0, healed = 0;
  // R28 — Hex of Ruin's `takeMoreDot`: the body takes more from every damage-over-time on it
  let dotK = 1;
  // …and `dotRate` on a debuff (Entropy Field) makes every status on the body run faster
  let bodyRate = 1;
  for (const st of Object.values(unit.statuses)) { dotK += st.takeMoreDot || 0; if (st.kind !== 'buff' && st.kind !== 'form' && st.dotRate) bodyRate *= st.dotRate; }
  for (const [type, st] of Object.entries(unit.statuses)) {
    // R28 — a status ticks faster on a body in an Entropy Field, or when its caster had Soul Pact
    // (`st.rate`, stamped where the player applies it); the total is the same, it simply lands sooner
    const sdt = st.perSecond ? dt * bodyRate * (st.rate || 1) : dt;
    st.remaining -= sdt;
    // R23 — Hemorrhage: every metre walked while it bleeds is worth more damage on the next tick
    if (st.growOnMove && unit.x != null) {
      if (st.lastX != null) st.moved = (st.moved || 0) + Math.hypot(unit.x - st.lastX, unit.z - st.lastZ);
      st.lastX = unit.x; st.lastZ = unit.z;
    }
    if (st.perSecond) {
      st.since = (st.since || 0) + sdt;
      const expiring = st.remaining <= 0;
      // pay out on the tick, and pay out whatever is left over when the status runs out, so a
      // three-and-a-half-second burn does not silently drop its last half second
      if (st.since >= TICK_EVERY || expiring) {
        const span = expiring ? st.since : TICK_EVERY;
        // R23 — Kindling climbs a step every tick it has already paid; Hemorrhage by the metre
        const ramp = st.ramp ? Math.min(st.rampCap || 3, 1 + st.ramp * (st.ticks || 0)) : 1;
        const grow = st.growOnMove ? 1 + Math.min(st.growCap || 1, (st.moved || 0) * st.growOnMove) : 1;
        st.ticks = (st.ticks || 0) + 1;
        damage += st.perSecond * st.power * span * resist * ramp * grow * dotK;
        st.since = expiring ? 0 : st.since - TICK_EVERY;
        // a burn that ticks should LOOK like it ticked: a 1.7x pop on the aura, once a second
        if (!expiring) statusPulse?.(unit, type);
      }
    }
    if (st.healPerSecond) healed += st.healPerSecond * (unit.maxHp || 0) * dt;
    // R23 — Doom: whatever was stored on it lands, once, as it runs out
    if (st.detonate && st.remaining <= 0 && st.stored > 0) damage += st.stored * st.detonate * resist;
    if (st.remaining <= 0) {
      // R28 — a tag that banked damage pays it as it ends (Grave Mark's `store`), and one that
      // bursts or does something else on its way out hands that to the runtime (`setStatusExpire`)
      if (st.kind === 'tag' && st.store > 0 && st.bank > 0) damage += st.bank * st.store;
      delete unit.statuses[type]; statusFx?.(unit, type, false);
      if (st.burstOnExpire) statusExpire?.(unit, type, st);
    }
  }
  if (healed > 0) unit.hp = Math.min(unit.maxHp ?? unit.hp, (unit.hp ?? 0) + healed);
  if (damage > 0) unit.hp = Math.max(0, (unit.hp ?? 0) - damage);
  return damage;
}

/** How much a unit's statuses slow it, 0..1. */
export function slowOf(unit) {
  let slow = 0;
  for (const st of Object.values(unit.statuses || {})) slow = Math.max(slow, st.slow || 0);
  return slow;
}

/** Everything a unit's statuses change about how it fights. */
export function buffsOf(unit) {
  let damage = 0, resist = 0, takeMore = 0, dealLess = 0, haste = 0, move = 0, armor = 0;
  for (const st of Object.values(unit.statuses || {})) {
    damage += st.damage || 0; resist += st.resist || 0;
    takeMore += st.takeMore || 0; dealLess += st.dealLess || 0;
    haste += st.haste || 0; move += st.move || 0; armor += st.armor || 0;
  }
  return {
    damage, resist: Math.min(0.8, resist), takeMore,
    dealLess: Math.min(0.8, dealLess), haste, move, armor,
  };
}

/** The single multiplier a unit's statuses put on damage it deals. */
export function outgoingFrom(unit) {
  const b = buffsOf(unit);
  return (1 + b.damage) * (1 - b.dealLess);
}
/** …and on damage it takes. */
export function incomingFrom(unit) {
  const b = buffsOf(unit);
  return (1 + b.takeMore) * (1 - b.resist);
}

// ─────────────────────────────────────────────────────────────────────────────
// R28 — WHAT AN ELEMENT LEAVES, for a skill whose element is rolled or cycled per cast. A pool entry
// may also be an object `{ element, status, name, mod }` and then says exactly what it leaves.
// ─────────────────────────────────────────────────────────────────────────────
export const ELEMENT_STATUS = { fire: 'burn', ice: 'chill', lightning: 'shock', poison: 'poison', shadow: 'curse', arcane: 'marked', nature: 'web', physical: null, holy: null };

/** Lay one element-pool / cycle entry over a row. */
export function applyPick(row, entry) {
  if (!entry) return row;
  if (typeof entry === 'string') return { ...row, element: entry, status: ELEMENT_STATUS[entry] ?? row.status ?? null, pickName: entry };
  let out = { ...row, element: entry.element ?? row.element, status: entry.status !== undefined ? entry.status : (entry.element ? ELEMENT_STATUS[entry.element] ?? row.status : row.status), pickName: entry.name || entry.element };
  if (entry.mod) out = applyMod(out, entry.mod, {});
  return out;
}

export function createSkillBar({ data, player, rpg, unlocks = null, canSummon = null }) {
  // R21 — every skill's line, rewritten from that skill's own numbers before the bar is built, so
  // a change to `mult` or `cooldown` in the data file reaches the card without anybody re-typing
  // a sentence. See the note above `describeSkill`.
  describeSkills(data);
  // R28 — the rows, so js/skilltalents.js can build each skill's OWN talent tree from them
  registerSkillRows(data.skills, data.statuses);
  const unlockAt = unlocks || data.unlockAt || [1, 3, 6, 12, 18, 24];
  const slots = [];
  const rng = () => (rpg?.rng ? rpg.rng() : Math.random());

  /**
   * R20 — A SLOT MAY HOLD NOTHING (a custom class's unchosen slot): `empty: true`, no row behind it.
   * Everything that reads a slot asks `empty` first.
   */
  function fill(ids) {
    const next = (ids || []).map((id, i) => ({
      id: id || null,
      empty: !id,
      ...(data.skills[id] || {}),
      name: data.skills[id]?.name || 'Not learned',
      cooldown: data.skills[id]?.cooldown ?? 6,
      // a slot keeps whatever cooldown it was already sitting on, so unlearning the thing in
      // slot 3 is not a free reset of slot 3 mid-fight
      ready: slots[i]?.ready ?? 0,
      unlockAt: unlockAt[i] ?? 1,
      // R28 — charges, a recast window and the next roll are the slot's own runtime state
      charges: slots[i]?.id === id ? slots[i]?.charges : null,
      chargeT: slots[i]?.id === id ? slots[i]?.chargeT || 0 : 0,
      recastLeft: 0, recastThen: null, cycleAt: 0, next: null,
    }));
    // R25 — the card on the bar quotes the share for THIS slot's unlock level
    for (const sl of next) if (!sl.empty && data.skills[sl.id]) {
      sl.desc = describeSkill(data.skills[sl.id], data.statuses || {}, { unlockAt: sl.unlockAt, skills: data.skills });
      sl.descShort = describeSkill(data.skills[sl.id], data.statuses || {}, { cost: false, unlockAt: sl.unlockAt, skills: data.skills });
    }
    slots.length = 0;
    slots.push(...next);
  }
  fill(data.classes?.[player.classId] || data.classes?.ranger || []);

  /** R17 — rebuild the bar from a new list of ids (the custom class's respec). */
  function relearn(ids = null) {
    fill(ids || data.classes?.[player.classId] || []);
    return slots.map(s => s.id);
  }

  // ─────────────────────────────────────────────── R28: the row a slot casts RIGHT NOW

  /** The row behind a slot, with the active form's override laid over it. */
  function formRow(s) {
    const base = data.skills[s.id];
    return base ? resolveForm(base, player) : null;
  }
  /** …and with this character's talents folded in (for charges, cooldown, cost and the card). */
  /**
   * Cached per slot on (the forms you are in, this skill's picks): `state()` runs every frame and
   * asks for charges, cost and cooldown on six slots, which was ~18 talent folds a frame.
   */
  function talentedRow(s) {
    const picks = player.skillTalents?.[s.id];
    const key = `${formIds(player).join(',')}|${picks ? JSON.stringify(picks) : ''}|${data.skills[s.id] ? 1 : 0}`;
    if (s._tr && s._tr.key === key && s._tr.base === data.skills[s.id]) return s._tr.row;
    const row = formRow(s);
    const out = row ? talentPlan(player, s.id, { ...row, kind: row.shape }, data.skills[s.id]) : null;
    s._tr = { key, base: data.skills[s.id], row: out };
    return out;
  }
  /** Max charges for a slot, if it has any (a T3/T4 talent can add them). */
  function maxCharges(s) {
    const r = talentedRow(s);
    const c = r?.charges;
    return c ? Math.max(1, typeof c === 'number' ? c : c.max || 1) : 0;
  }

  /** Drain what hits asked of the bar (js/skillmech.js `queue`): resets and cooldown cuts. */
  function drainQueue() {
    const q = player.mechQueue;
    if (!q?.length) return;
    player.mechQueue = [];
    for (const req of q) {
      if (req.reset) {
        const s = slots.find(x => x.id === req.reset);
        if (s) { s.ready = 0; if (s.charges != null) s.charges = maxCharges(s); }
      }
      if (req.cut) cutCooldowns(req.cut, req.from || req.cut.from);
    }
  }
  /**
   * Take seconds off a slot's cooldown. A CHARGE slot's visible `ready` is rebuilt from `chargeT`
   * every frame, so a cut written to `ready` alone was thrown away — the recharge clock is cut instead.
   */
  function cutSlot(s, secsOff, { half = false } = {}) {
    if (s.charges != null && s.chargeT > 0) {
      s.chargeT = half ? s.chargeT * 0.5 : Math.max(0, s.chargeT - secsOff);
      if (s.charges <= 0) s.ready = s.chargeT;
      return;
    }
    s.ready = half ? s.ready * 0.5 : Math.max(0, s.ready - secsOff);
  }

  /** `cutCooldown`: one named skill, 'self', every 'others', or every follower ability. */
  function cutCooldowns(c, from = null) {
    const secsOff = c.seconds ?? 1;
    if (c.skill === 'followers') { (player.mechEvents || (player.mechEvents = [])).push({ kind: 'cutFollowers', seconds: secsOff }); return; }
    let any = false;
    for (const s of slots) {
      if (s.empty) continue;
      const hit = c.skill === 'others' ? s.id !== (from || c.from) : c.skill === 'self' ? s.id === (from || c.from) : s.id === c.skill;
      if (!hit) continue;
      any = true;
      cutSlot(s, secsOff, { half: !!c.half });
    }
    // the named skill is not on this bar: `orSelf` cuts the skill that asked instead (plan G5)
    if (!any && c.orSelf && from) { const me = slots.find(s => s.id === from); if (me) cutSlot(me, c.orSelf); }
  }

  function update(dt, { fighting = false } = {}) {
    // R28 — a self status can make every cooldown run faster (Stop the Clock, Warlord's Call)
    const rate = cdRateOf(player);
    for (const s of slots) {
      if (s.ready > 0) s.ready = Math.max(0, s.ready - dt * rate);
      // charges come back one at a time, each on the slot's own cooldown
      if (s.charges != null) {
        const max = maxCharges(s);
        if (s.charges < max) {
          s.chargeT -= dt * rate;
          if (s.chargeT <= 0) { s.charges++; s.chargeT = s.charges < max ? cooldownFor(s) : 0; }
        }
        s.ready = s.charges > 0 ? 0 : Math.max(0, s.chargeT);
      }
      if (s.recastLeft > 0) { s.recastLeft -= dt; if (s.recastLeft <= 0) { s.recastLeft = 0; s.recastThen = null; } }
    }
    /**
     * HUNGER pays out here. `rpg.strike` cannot reach into the bar, so a kill taken by a skill with
     * the Hunger talent leaves the seconds owed on the player and this hands them to the right
     * slot on the next frame.
     */
    const owed = player.cooldownRefund;
    if (owed && owed.seconds > 0) {
      const s = slots.find(x => x.id === owed.skill);
      if (s) cutSlot(s, owed.seconds);
      player.cooldownRefund = null;
    }
    drainQueue();
    // R28 — timed forms run out (Sporecap); the runtime plays their onExit from `mechEvents`
    for (const f of tickForms(player, dt)) (player.mechEvents || (player.mechEvents = [])).push({ kind: 'formExpired', form: f });
    tickResources(player, dt, { fighting });
    const em = player.mech?.empower;
    if (em) { em.left -= dt; if (em.left <= 0 || em.count <= 0) player.mech.empower = null; }
  }

  /**
   * Every cooldown comes back sooner with `cooldownReduction` on your gear — and with the
   * Quickened talent, which is a share of the skill's own cooldown rather than a share of yours.
   * R28: the base is the row the slot casts NOW (a shape's override has its own cooldown) with its
   * bespoke talents folded in.
   */
  function cooldownFor(s) {
    const cut = Math.min(60, player.derived?.cooldownReduction || 0) / 100;
    const row = s.empty ? null : talentedRow(s);
    let base = row?.cooldown ?? s.cooldown;
    for (const node of talentsOn(player, s.id)) {
      if (!node.bespoke && node.mod?.cooldownPct) base *= 1 + node.mod.cooldownPct / 100;
    }
    return Math.max(0.5, base * (1 - cut));
  }
  /** …and cost less with `cond_skillMpCostReduce`, which is a FLAT saving, not a percentage. */
  function costFor(s) {
    const off = rpg?.fx ? rpg.fx.sum(player, 'costFlat') : 0;
    // R25 — the Grimoire's "skills cost 15% less mana" (js/effects.js cond_focusGrimoire)
    const cut = Math.min(0.6, player.derived?.skillCostPct || 0);
    const row = s.empty ? null : talentedRow(s);
    // R28 — a form you are already in costs nothing to leave; Spring Battery makes skills free
    if (row?.form && !row.form.cycle && player.forms?.[row.form.group || 'shape']?.skill === s.id) return 0;
    if (Object.values(player.statuses || {}).some(x => x.noMana)) return 0;
    if (player.mech?.empower?.free && !row?.form) return 0;
    return Math.max(0, Math.round((((row?.mp ?? s.mp) || 0) - off) * (1 - cut)));
  }

  /**
   * BLOOD PRICE, the arcane keystone: "Skills cost health instead of mana, and never fail for want
   * of it." This is the only place a skill is paid for, so it is the only place the swap can happen.
   */
  function bloodPrice() { return !!player.perkFlags?.bloodMagic; }

  function unlocked(s) { return (player.level || 1) >= s.unlockAt; }

  /** Can this slot be used right now, and if not, why? */
  function check(index) {
    const s = slots[index];
    if (!s) return { ok: false, why: null };
    if (s.empty) {
      return unlocked(s)
        ? { ok: false, why: `Slot ${index + 1} is open — choose its spell on the Skills screen.`, pending: true }
        : { ok: false, why: `Slot ${index + 1} opens at level ${s.unlockAt}` };
    }
    if (!unlocked(s)) return { ok: false, why: `${s.name} unlocks at level ${s.unlockAt}` };
    // R28 — a second press inside a recast window runs the second part, whatever the cooldown says
    if (s.recastLeft > 0 && s.recastThen) return { ok: true, skill: s, recast: true };
    // …and a second press on a running channel ends it
    if (player.mech?.channel?.slot === index) return { ok: true, skill: s, endChannel: true };
    const row = formRow(s);
    if (row?.form) {
      const g = row.form.group || 'shape';
      if (g === 'shape' && player.shapeBlocked) return { ok: false, why: player.shapeBlocked };
      const now = player.forms?.[g];
      if (now?.seconds && now.skill !== s.id) return { ok: false, why: `${now.name} has ${secs(Math.max(0, now.left))} left.` };
      // leaving the form you are in is free and immediate
      if (now && now.skill === s.id && !row.form.cycle) return { ok: true, skill: s };
    }
    const charged = s.charges != null || maxCharges(s) > 0;
    if (charged) {
      if (s.charges == null) s.charges = maxCharges(s);
      if (s.charges <= 0) return { ok: false, why: `${s.name} is not ready (${Math.max(0, s.chargeT).toFixed(1)}s)` };
    } else if (s.ready > 0) return { ok: false, why: `${s.name} is not ready (${s.ready.toFixed(1)}s)` };
    if (!bloodPrice() && costFor(s) > player.mp) return { ok: false, why: `Not enough mana for ${s.name}` };
    /**
     * R18 — A SUMMON YOU CANNOT HAVE IS NOT CASTABLE, so pressing the key costs nothing.
     */
    // R28 — ask of the row cast NOW: a shaped Call the Pack (Den Guard, Running Pack) is not a summon
    if (canSummon && row?.shape === 'summon' && row.pet && !row.summon?.temporary && !row.howl) {
      const allowed = canSummon(row.pet, s);
      if (allowed && allowed.ok === false) return { ok: false, why: allowed.why || `You cannot keep another ${s.name}.` };
    }
    return { ok: true, skill: s };
  }

  /**
   * R28 — THE ROW THIS CAST USES: the form override, the temper/song element, the next roll of a
   * pool or a cycle, a rolled multiplier. The HUD reads `s.next` to show what the NEXT cast will be.
   */
  function resolveRow(s) {
    let row = formRow(s);
    const ef = elementFromForms(row, player);
    if (ef) row = { ...row, element: ef.element || row.element, status: ef.status ?? row.status ?? null, temperElement: ef.element };
    const cycle = row.elementCycle || (row.elementFrom === 'cycle' ? row.elementPool : null);
    if (cycle?.length) {
      row = applyPick(row, cycle[(s.cycleAt || 0) % cycle.length]);
      s.cycleAt = (s.cycleAt || 0) + 1;
      s.next = cycle[s.cycleAt % cycle.length];
    } else if (row.elementPool?.length) {
      const pick = () => row.elementPool[Math.floor(rng() * row.elementPool.length)];
      row = applyPick(row, s.next ?? pick());
      s.next = pick();
    }
    if (row.statusPool?.length) row = { ...row, statusPick: row.statusPool[Math.floor(rng() * row.statusPool.length)] };
    /**
     * R28 — `sequence`: after `n` casts in a row with DIFFERENT elements, the next cast takes `mod`
     * (Wild Bolt: three different rolls make the fourth carry every status).
     */
    if (row.sequence) {
      const sq = row.sequence;
      const seen = (s.seq || []).slice(-(sq.n ?? 3));
      if (seen.length >= (sq.n ?? 3) && new Set(seen).size === seen.length) { row = applyMod(row, sq.mod || {}, {}); s.seq = []; }
      else s.seq = [...(s.seq || []), row.element].slice(-6);
    }
    if (Array.isArray(row.variance)) {
      const [lo, hi] = row.variance;
      const roll = lo + rng() * (hi - lo);
      row = { ...row, mult: (row.mult || 1) * roll, varianceRoll: roll };
    }
    return row;
  }

  /**
   * Build a plan from a row. `s` is the slot (its unlock level budgets the damage). Used by `use`
   * for the slot's own cast, and by `planFor` for a sub-plan — a Finale, a shape's onEnter burst,
   * a recast's second part, an alternate pulse.
   */
  function buildPlan(s, row, { cost = 0, talents = true } = {}) {
    const d = player.derived;
    /**
     * R22 — SPELL POWER WAS APPLIED TWICE. `mult` is what js/main.js hands `strikeArea` as `power`,
     * and js/rpg.js `strike` already applies spell power — the one place that has to. `damage`
     * keeps `magic` because it is the estimate the card prints and what a DoT is a share of.
     */
    const magic = row.element && row.element !== 'physical' ? 1 + (d.spellPower || 0) : 1;
    // R25 — unlock level and cooldown (see `effectiveMult`)
    const share = row.mult ? effectiveMult(row, s.unlockAt) : 1;
    const mid = ((d.damage[0] + d.damage[1]) / 2) * share * magic;
    const rep = repeatsOf(row);
    const plan = {
      ok: true,
      skill: s.empty ? s : { ...s, name: row.name || s.name, id: s.id },
      kind: row.shape,
      element: row.element || 'physical',
      mult: share,
      damage: Math.max(1, Math.round(mid)),
      // R25 — Whirlwind: the whole strike again, `repeats` times, `repeatEvery` seconds apart
      repeats: rep.count, repeatEvery: rep.every,
      breath: !!row.breath, weather: !!row.weather, delay: row.delay || 0, pull: row.pull || 0,
      trail: row.trail || null, orbs: row.orbs || null,
      reach: row.reach ?? 3, arc: row.arc ?? 1.5,
      radius: row.radius ?? 0, range: row.range ?? 0, splash: row.splash ?? 0, width: row.width ?? 1.8,
      projectiles: Math.max(1, row.projectiles ?? 1), spread: row.spread ?? 0,
      pierce: row.pierce || 0, chains: row.chains || 0, chainFalloff: row.chainFalloff ?? 0.7, homing: row.homing || 0,
      status: row.status || null,
      statusSpec: row.status ? (row.statusSeconds ? { ...data.statuses[row.status], seconds: row.statusSeconds } : data.statuses[row.status]) : null,
      statusMult: row.statusMult ?? 1,
      heal: typeof row.heal === 'number' && row.heal ? Math.round(player.maxHp * row.heal) : 0,
      healFrac: typeof row.heal === 'number' ? row.heal : 0,
      /**
       * R17 — A SUMMON IS A CAP, NOT A COUNT, AND THE KEPT COMPANY MOVES THE CAP. `petCount` is the
       * spell's own number; `petCap` is how many may exist at once, enforced by js/followers.js.
       */
      pet: row.pet || null,
      petCount: Math.max(1, row.count || 1),
      petCap: Math.max(1, (row.count || 1) + followerBonus(d)),
      pets: !!row.pets,
      spent: cost,
      paidWith: bloodPrice() ? 'health' : 'mana',
      formId: row.formId || null,
      // R28 — the row's own base share, and whether it deals damage at all (no `mult` = none:
      // Sanctuary, Drowse, a post land their effects and nothing else)
      baseMult: row.mult || 1,
      noDamage: !row.mult && !['self', 'summon'].includes(row.shape),
      pickName: row.pickName || null,
      statusPick: row.statusPick || null,
    };
    // R28 — every vocabulary key (and the P2 ones) rides the plan as written
    for (const k of VOCAB_KEYS) if (k !== 'repeats' && row[k] != null && !(k in plan && typeof row[k] !== 'object')) plan[k] = row[k];
    for (const k of Object.keys(PENDING)) if (row[k] != null) plan[k] = row[k];
    if (row.repeats && typeof row.repeats === 'object') plan.repeatSpec = row.repeats;
    if (typeof row.heal === 'object' && row.heal) { plan.healFrac = row.heal.share || 0; plan.heal = Math.round(player.maxHp * plan.healFrac); plan.healPets = plan.healPets || (row.heal.pets ? row.heal.share : null); }

    /**
     * R26 — A MELEE SKILL REACHES AS FAR AND AS WIDE AS THE WEAPON SWINGING IT. The skill's own
     * numbers are a FLOOR. A stream (Flamethrower) is a spell cone and keeps its own shape; a form's
     * claw sweep is the beast's, not the staff's, so a shaped cast keeps its own numbers too.
     */
    if (plan.kind === 'melee' && !plan.breath && !row.formId) {
      const span = meleeSpanOf(handsOf(player).main, player.derived?.areaPct || 0);
      if (span) {
        plan.reach = Math.max(plan.reach, span.reach);
        plan.arc = Math.max(plan.arc, span.arc);
        plan.splash = Math.max(plan.splash || 0, span.splash);
      }
    }
    /**
     * R28 — A SELF SKILL NEVER PUTS A HARMFUL STATUS ON ITS CASTER. A self buff that follows a
     * temper's element picked up the temper's Burning and set the Dragon Knight alight.
     */
    if (plan.kind === 'self' && plan.statusSpec && !['buff', 'form'].includes(plan.statusSpec.kind)) { plan.status = null; plan.statusSpec = null; }
    if (!talents) return plan;
    /** AND NOW THE TALENTS — library and bespoke, folded once, here, for every cast. */
    const out = talentPlan(player, s.id, plan, data.skills[s.id]);
    // a bespoke `set`/`mul` on `repeats` or `status` has to re-derive what the plan read off them
    if (out.repeats && typeof out.repeats === 'object') { out.repeatSpec = out.repeats; out.repeatEvery = out.repeats.every ?? out.repeatEvery; out.repeats = Math.max(1, out.repeats.count || 1); }
    if (out.status && (!out.statusSpec || out.statusSpec.name !== data.statuses[out.status]?.name)) out.statusSpec = data.statuses[out.status] || null;
    if (out.kind === 'self' && out.statusSpec && !['buff', 'form'].includes(out.statusSpec.kind)) { out.status = null; out.statusSpec = null; }
    if (out.mult !== plan.mult && out.damage === plan.damage) out.damage = Math.max(1, Math.round(plan.damage * (out.mult / plan.mult)));
    /** Deepening lengthens what the skill leaves on the target — on a CLONE of the shared row. */
    if (out.statusLonger && out.statusSpec) {
      out.statusSpec = { ...out.statusSpec, seconds: (out.statusSpec.seconds || 4) + out.statusLonger };
    }
    return out;
  }

  /** A sub-plan from a partial row, budgeted at the parent slot's level. No cost, no cooldown. */
  function planFor(sub, parent = null, { shape = 'around', element = null } = {}) {
    const s = parent || { id: 'sub', unlockAt: 1, name: sub?.name || 'Strike' };
    const row = { shape, element: element || sub?.element || 'physical', ...sub };
    const plan = buildPlan(s, row, { talents: false });
    plan.sub = true;
    plan.rules = castRulesFrom(s.id, plan);
    return plan;
  }

  /**
   * Fire a slot. Returns a plan for the caller to draw and apply:
   *   { skill, kind: 'melee'|'around'|'bolt'|'beam'|'ground'|'dash'|'summon'|'self'|'form', … }
   */
  function use(index) {
    const can = check(index);
    if (!can.ok) return { ok: false, why: can.why };
    const s = can.skill;

    // R28 — the second press of a recast skill: its `then` part, free and outside the cooldown
    if (can.recast) {
      const sub = s.recastThen;
      s.recastLeft = 0; s.recastThen = null;
      const plan = planFor(sub, s, { shape: sub.shape || 'around', element: sub.element || s.element });
      plan.recastOf = s.id;
      return plan;
    }
    if (can.endChannel) {
      const ch = player.mech.channel;
      player.mech.channel = null;
      return { ok: true, skill: s, kind: 'channelEnd', channel: ch };
    }

    const row = resolveRow(s);

    // R28 — a FORM skill (a druid shape, a stance, a temper, a song): enter, swap or leave. The
    // form block is read off the TALENTED row, so Oakhide's armour and Final Bloom's burst apply.
    if (row.form) {
      const cost = costFor(s);
      const formSpec = talentPlan(player, s.id, { ...row }, data.skills[s.id]).form || row.form;
      const res = toggleForm(player, s.id, formSpec);
      if (res.refused) return { ok: false, why: res.refused };
      if (res.entered) {
        if (bloodPrice()) player.hp = Math.max(1, player.hp - cost); else player.mp = Math.max(0, player.mp - cost);
        s.ready = cooldownFor(s);
      }
      // the other slots' names and cards follow the form
      return { ok: true, skill: s, kind: 'form', form: res, element: row.element || 'nature', row, spent: res.entered ? cost : 0, rules: null };
    }

    const cost = costFor(s);
    // Blood Price pays in health and never kills you outright
    if (bloodPrice()) player.hp = Math.max(1, player.hp - cost);
    else player.mp = Math.max(0, player.mp - cost);

    let out = buildPlan(s, row, { cost });

    // R28 — a health price (never below 1 health), and a self status that charges every cast
    const hpShare = (typeof out.hpCost === 'object' ? out.hpCost?.share : out.hpCost) || 0;
    const perCast = Object.values(player.statuses || {}).reduce((n, x) => n + (x.perCastHp || 0), 0);
    if (hpShare + perCast > 0) {
      const paid = Math.min(Math.max(0, player.hp - 1), Math.round((player.maxHp || 0) * (hpShare + perCast)));
      player.hp -= paid;
      out.hpPaid = paid;
    }

    // R28 — a class resource: spend first (the spender scales by points), then gain
    const res = out.resource;
    if (res?.spend) {
      const want = res.spend === 'all' ? 'all' : res.spend;
      const have = resourceOf(player, res.id);
      const paid = (res.optional && have < (want === 'all' ? 1 : want)) ? 0 : spendResource(player, res.id, want);
      out.pointsSpent = paid;
      if (paid && res.perPoint?.mult) {
        const k = 1 + res.perPoint.mult * paid;
        out.mult *= k; out.damage = Math.max(1, Math.round(out.damage * k));
      }
      if (paid && res.atMax && paid >= resourceMax(player, res.id)) out = applyMod(out, res.atMax, {});
      if (paid && res.ifSpent) out = applyMod(out, res.ifSpent, {});
    }
    if (res?.gain && (res.gainPer || 'cast') === 'cast') {
      const fresh = res.gainIfNew && player.mech?.lastSkill && player.mech.lastSkill !== s.id;
      gainResource(player, res.id, res.gain + (fresh ? res.gainIfNew : 0), { max: res.max });
    }
    (player.mech || (player.mech = { res: {} })).lastSkill = s.id;

    // R28 — `counter.grow`: what an earlier guard window banked for this skill is spent now
    const grown = player.mech?.grow?.[s.id];
    if (grown) { out.mult *= 1 + grown; out.damage = Math.max(1, Math.round(out.damage * (1 + grown))); delete player.mech.grow[s.id]; }
    // R28 — empowerNext: the rider waiting from an earlier skill is spent on this one
    const em = player.mech?.empower;
    if (em && em.count > 0 && em.from !== s.id) {
      em.count--;
      if (em.mult) { out.mult *= 1 + em.mult; out.damage = Math.max(1, Math.round(out.damage * (1 + em.mult))); }
      if (em.crit) out.crit = true;
      if (em.behind) out.behind = true;
      if (em.repeat) out.empowerRepeat = { count: em.repeat, mult: em.repeatMult ?? 0.6 };
      if (em.free && cost) { if (bloodPrice()) player.hp = Math.min(player.maxHp, player.hp + cost); else player.mp = Math.min(player.maxMp, player.mp + cost); }
      if (em.count <= 0) {
        player.mech.empower = null;
        // Spellrush: once the empowered casts are spent, mana stops coming back for a while
        if (em.manaPause) applyStatus(player, 'mana_pause', { name: 'Spent', kind: 'debuff', element: 'arcane', seconds: em.manaPause, noManaRegen: true });
      }
    }
    if (out.empowerNext) {
      player.mech.empower = { ...out.empowerNext, count: out.empowerNext.count ?? 1, left: out.empowerNext.seconds ?? 8, from: s.id };
    }

    // the cooldown — or one charge
    const max = maxCharges(s);
    if (max > 0) {
      if (s.charges == null) s.charges = max;
      s.charges = Math.max(0, s.charges - 1);
      if (s.chargeT <= 0) s.chargeT = cooldownFor(s);
      s.ready = s.charges > 0 ? 0 : s.chargeT;
    } else {
      s.ready = cooldownFor(s);
    }
    // a recast window opens; cooldown cuts on cast; a reset-on-crowd is decided by the caller
    if (out.recast?.then) { s.recastLeft = out.recast.window ?? 4; s.recastThen = out.recast.then; }
    if (out.cutCooldown && (out.cutCooldown.per || 'cast') === 'cast') cutCooldowns(out.cutCooldown, s.id);

    /**
     * The hit-time talents ride the strike. R28: on the plan itself (`plan.rules`, which every strike
     * of this cast carries) AND on the player for the paths that still read `castRules`.
     */
    out.rules = castRulesFrom(s.id, out);
    player.castRules = out.rules;
    return out;
  }

  /** Cut every cooldown by `n` seconds — the `skill_refresh` legendary does this on a kill. */
  function refresh(n) { for (const s of slots) cutSlot(s, n); }

  /** R28 — the card for a slot in its CURRENT form, cached per form. */
  function view(s) {
    if (s.empty) return { name: s.name, desc: s.desc, descShort: s.descShort, shape: s.shape, element: s.element };
    const key = formIds(player).join(',');
    if (!s.views) s.views = {};
    if (!s.views[key]) {
      const row = formRow(s) || {};
      s.views[key] = {
        name: row.name || s.name,
        desc: describeSkill(row, data.statuses || {}, { unlockAt: s.unlockAt, skills: data.skills }),
        descShort: describeSkill(row, data.statuses || {}, { cost: false, unlockAt: s.unlockAt, skills: data.skills }),
        shape: row.shape || s.shape, element: row.element || s.element, formId: row.formId || null,
      };
    }
    return s.views[key];
  }

  return {
    slots, update, use, check, refresh, cooldownFor, costFor, planFor,
    // R17 — rebuild the bar from a new list of ids, for the custom class's respec
    relearn,
    /** R28 — the row a slot casts right now (form override + talents), for the HUD and the tests. */
    rowFor: i => (slots[i] && !slots[i].empty ? talentedRow(slots[i]) : null),
    /** For the HUD. */
    state: () => slots.map((s, i) => {
      const v = view(s);
      const row = s.empty ? null : formRow(s);
      const g = row?.form?.group;
      const form = g ? player.forms?.[g] || null : null;
      const res = row?.resource?.id ? { id: row.resource.id, n: resourceOf(player, row.resource.id), max: resourceMax(player, row.resource.id) } : null;
      const max = s.empty ? 0 : maxCharges(s);
      return {
        id: s.id, name: v.name, desc: v.desc, descShort: v.descShort, mp: costFor(s),
        ready: s.ready, cooldown: cooldownFor(s),
        locked: !unlocked(s), unlockAt: s.unlockAt,
        /** R20 — `empty` is "no spell in this slot" and `pending` is "…and you are owed one". */
        empty: !!s.empty, pending: !!s.empty && unlocked(s),
        usable: !s.empty && unlocked(s) && (max > 0 ? (s.charges ?? max) > 0 : s.ready <= 0) && costFor(s) <= player.mp,
        // `shape` and `element` drive the talent board and the slot's colour
        shape: v.shape, element: v.element,
        // R28 — what the HUD draws beyond a cooldown sweep (plan §2 H)
        charges: max > 0 ? { n: s.charges ?? max, max } : null,
        recastLeft: s.recastLeft > 0 ? s.recastLeft : 0,
        next: s.next ? (typeof s.next === 'string' ? s.next : s.next.name || s.next.element) : null,
        form: g ? { group: g, active: form ? form.id : null, mine: !!form && form.skill === s.id, name: form?.name || null, left: form?.seconds ? Math.max(0, form.left) : null } : null,
        resource: res,
        formId: v.formId,
        channel: player.mech?.channel?.slot === i,
      };
    }),
  };
}
