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

import { talentPlan, talentsOn, castRulesFrom } from './skilltalents.js';
// R17 — the one place the follower bonus is read off `derived`, so the summon cap and the follower
// book can never drift apart about what The Kept Company is worth.
import { followerBonus } from './followers.js';
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
function shapeSentence(skill) {
  const n = Math.max(1, skill.projectiles || 1);
  const dmg = `${pctOf(Math.round((skill.mult || 1) * 100))} weapon damage`
    + (skill.element && skill.element !== 'physical' ? ` as ${skill.element}` : '');
  const shot = skill.element === 'physical' ? 'shot' : 'bolt';
  const splash = skill.splash
    ? `, splashing everything within ${metres(skill.splash)} of where ${n > 1 ? 'a' : 'the'} ${shot} lands`
    : '';
  const arc = degrees(skill.arc ?? 1.5);
  const fan = degrees(skill.spread || 0);
  const width = metres(skill.width ?? 1.8);
  switch (skill.shape) {
    case 'melee':
      return `Strikes everything in ${article(arc)} ${arc} arc ${metres(skill.reach ?? 3)} in front of you for ${dmg}.`;
    case 'around':
      return `Strikes everything within ${metres(skill.radius ?? 4)} of you for ${dmg}.`;
    case 'beam':
      return `Fires ${article(width)} ${width} wide beam ${metres(skill.range ?? 20)} straight ahead, striking everything in the line for ${dmg}.`;
    case 'ground':
      return `Falls on a spot up to ${metres(skill.range ?? 30)} away, striking everything within ${metres(skill.radius ?? 5)} of that spot for ${dmg}.`;
    case 'dash':
      return `Carries you ${metres(skill.range ?? 10)} forward, striking everything within ${metres(skill.splash ?? 2)} of your path for ${dmg}.`;
    case 'summon': {
      const count = Math.max(1, skill.count || 1);
      const who = petName(skill.pet) + (count > 1 ? 's' : '');
      return `Summons ${fmt(count)} ${who} to fight beside you.`;
    }
    case 'self':
      return '';
    default:
      // a bolt, or a fan of them
      return n > 1
        ? `Looses ${fmt(n)} ${shot}s in ${article(fan)} ${fan} fan out to ${metres(skill.range ?? 30)}, each for ${dmg}${splash}.`
        : `Looses one ${shot} out to ${metres(skill.range ?? 30)} for ${dmg}${splash}.`;
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
export function describeSkill(skill, statuses = {}, { cost = true } = {}) {
  if (!skill) return '';
  const spec = skill.status ? statuses[skill.status] : null;
  const parts = [shapeSentence(skill), statusSentence(skill, spec), healSentence(skill)].filter(Boolean);
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
export function describeSkills(data) {
  if (!data?.skills) return data;
  for (const skill of Object.values(data.skills)) {
    skill.desc = describeSkill(skill, data.statuses || {});
    /**
     * R21 — the same line WITHOUT the mana and cooldown clause.
     *
     * The skill bar card and the hotkey tooltip both already print `12 mana · 4.0s cooldown` on
     * their own row, directly above the description, so the generated line repeated it. The card's
     * `.sk-desc` is also clamped to three lines, and the clause it was clipping was the duplicated
     * one. Both readers take `descShort`; the item tooltip and the class builder, which print no
     * cost of their own, keep the full line.
     */
    skill.descShort = describeSkill(skill, data.statuses || {}, { cost: false });
  }
  return data;
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

/** Statuses live on the target as `{ type, remaining, power, … }`. */
export function applyStatus(target, type, spec, power = 1, { longer = 0, strength = 1 } = {}) {
  if (!spec) return null;
  target.statuses = target.statuses || {};
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
  for (const [type, st] of Object.entries(unit.statuses)) {
    st.remaining -= dt;
    if (st.perSecond) {
      st.since = (st.since || 0) + dt;
      const expiring = st.remaining <= 0;
      // pay out on the tick, and pay out whatever is left over when the status runs out, so a
      // three-and-a-half-second burn does not silently drop its last half second
      if (st.since >= TICK_EVERY || expiring) {
        const span = expiring ? st.since : TICK_EVERY;
        damage += st.perSecond * st.power * span * resist;
        st.since = expiring ? 0 : st.since - TICK_EVERY;
        // a burn that ticks should LOOK like it ticked: a 1.7x pop on the aura, once a second
        if (!expiring) statusPulse?.(unit, type);
      }
    }
    if (st.healPerSecond) healed += st.healPerSecond * (unit.maxHp || 0) * dt;
    if (st.remaining <= 0) { delete unit.statuses[type]; statusFx?.(unit, type, false); }
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

export function createSkillBar({ data, player, rpg, unlocks = null, canSummon = null }) {
  // R21 — every skill's line, rewritten from that skill's own numbers before the bar is built, so
  // a change to `mult` or `cooldown` in the data file reaches the card without anybody re-typing
  // a sentence. See the note above `describeSkill`.
  describeSkills(data);
  const unlockAt = unlocks || data.unlockAt || [1, 3, 6, 12, 18, 24];
  const slots = [];

  /**
   * Fill the bar from a list of skill ids. One function rather than an expression, because R17's
   * custom class can change what is on the bar WHILE THE GAME IS RUNNING.
   */
  /**
   * R20 — A SLOT MAY HOLD NOTHING, AND THAT IS NOW THE NORMAL CASE FOR A CUSTOM CLASS.
   *
   * Five of a custom character's six slots are empty at level 1: the spell is chosen at the level
   * the slot opens at, not at character creation. `installCustomClass` used to paper over that by
   * filling an empty pick with the cheapest spell of its tier, which would now mean the game
   * quietly choosing four spells on the player's behalf.
   *
   * So a null id builds a slot with `empty: true` and no skill row behind it. Everything that
   * reads a slot — `check`, `state`, the HUD strip — asks `empty` first, and the key says what is
   * actually wrong ("nothing learned yet") instead of "undefined unlocks at level 6".
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
    }));
    slots.length = 0;
    slots.push(...next);
  }
  fill(data.classes?.[player.classId] || data.classes?.ranger || []);

  /**
   * R17 — UNLEARN A SKILL AT ANY TIME, AND HAVE THE BAR ACTUALLY CHANGE.
   *
   *   "You should be able to unlearn a skill at any time."
   *
   * The bar used to be built once, from `data.classes[player.classId]`, and that was fine when a
   * class was a fixed list. A custom class rewrites `data.classes.custom` whenever the player
   * re-spends a pick, and without this the screen would show the new spell and the key would still
   * fire the old one — a change that looks applied and is not, which is the worst kind.
   */
  function relearn(ids = null) {
    fill(ids || data.classes?.[player.classId] || []);
    return slots.map(s => s.id);
  }

  function update(dt) {
    for (const s of slots) if (s.ready > 0) s.ready = Math.max(0, s.ready - dt);
    /**
     * HUNGER pays out here. `rpg.strike` cannot reach into the bar, so a kill taken by a skill with
     * the Hunger talent leaves the seconds owed on the player and this hands them to the right
     * slot on the next frame. Without it the talent was a sentence: the plan carried `killRefund`
     * and nothing ever looked at it.
     */
    const owed = player.cooldownRefund;
    if (owed && owed.seconds > 0) {
      const s = slots.find(x => x.id === owed.skill);
      if (s) s.ready = Math.max(0, s.ready - owed.seconds);
      player.cooldownRefund = null;
    }
  }

  /**
   * Every cooldown comes back sooner with `cooldownReduction` on your gear — and with the
   * Quickened talent, which is a share of the skill's own cooldown rather than a share of yours.
   */
  function cooldownFor(s) {
    const cut = Math.min(60, player.derived?.cooldownReduction || 0) / 100;
    let base = s.cooldown;
    for (const node of talentsOn(player, s.id)) {
      if (node.mod?.cooldownPct) base *= 1 + node.mod.cooldownPct / 100;
    }
    return Math.max(0.5, base * (1 - cut));
  }
  /** …and cost less with `cond_skillMpCostReduce`, which is a FLAT saving, not a percentage. */
  function costFor(s) {
    const off = rpg?.fx ? rpg.fx.sum(player, 'costFlat') : 0;
    return Math.max(0, Math.round((s.mp || 0) - off));
  }

  /**
   * BLOOD PRICE, the arcane keystone: "Skills cost health instead of mana, and never fail for want
   * of it." It was a flag nothing read. This is the only place a skill is paid for, so it is the
   * only place the swap can happen — and because the cost never fails, a skill is only ever refused
   * for its cooldown or its level.
   */
  function bloodPrice() { return !!player.perkFlags?.bloodMagic; }

  function unlocked(s) { return (player.level || 1) >= s.unlockAt; }

  /** Can this slot be used right now, and if not, why? */
  function check(index) {
    const s = slots[index];
    if (!s) return { ok: false, why: null };
    /**
     * A slot you have come of age for and not yet filled. The refusal names the way out, because
     * a key that does nothing and says "nothing learned" is only half an answer.
     */
    if (s.empty) {
      return unlocked(s)
        ? { ok: false, why: `Slot ${index + 1} is open — choose its spell on the Skills screen.`, pending: true }
        : { ok: false, why: `Slot ${index + 1} opens at level ${s.unlockAt}` };
    }
    if (!unlocked(s)) return { ok: false, why: `${s.name} unlocks at level ${s.unlockAt}` };
    if (s.ready > 0) return { ok: false, why: `${s.name} is not ready (${s.ready.toFixed(1)}s)` };
    if (!bloodPrice() && costFor(s) > player.mp) return { ok: false, why: `Not enough mana for ${s.name}` };
    /**
     * R18 — A SUMMON YOU CANNOT HAVE IS NOT CASTABLE, so pressing the key costs nothing.
     *
     * `use()` below spends the mana and starts the cooldown BEFORE anything summons, and the
     * summon's own refusal was dropped on the floor — so a player at their follower limit pressed
     * the key, paid for it, waited out 26 seconds and never learned why. Asking here means the
     * button simply says what is wrong, like every other reason a skill will not fire.
     */
    if (canSummon && s.shape === 'summon' && s.pet) {
      const allowed = canSummon(s.pet, s);
      if (allowed && allowed.ok === false) return { ok: false, why: allowed.why || `You cannot keep another ${s.name}.` };
    }
    return { ok: true, skill: s };
  }

  /**
   * Fire a slot. Returns a plan for the caller to draw and apply:
   *   { skill, kind: 'melee'|'around'|'bolt'|'beam'|'ground'|'dash'|'summon'|'self', … }
   */
  function use(index) {
    const can = check(index);
    if (!can.ok) return { ok: false, why: can.why };
    const s = can.skill;
    const cost = costFor(s);
    // Blood Price pays in health and never kills you outright — a keystone that could end the run
    // on a mistimed cast would only teach people not to press the button.
    if (bloodPrice()) player.hp = Math.max(1, player.hp - cost);
    else player.mp = Math.max(0, player.mp - cost);
    s.ready = cooldownFor(s);

    const d = player.derived;
    /**
     * R22 — SPELL POWER WAS APPLIED TWICE, AND IT IS WHY CONSECRATE HIT FOR 500.
     *
     *   "Consecrate dealt over 500 damage as a level 15 paladin where my basic attack only deals 7.
     *    Why is that damage so high?"
     *
     * `mult` is what `js/main.js` hands `strikeArea` as `power`, and `js/rpg.js`'s `strike` already
     * does `if (element !== 'physical' && a.spellPower) amount *= 1 + a.spellPower` — the one place
     * that has to do it, because a wand bolt and an elemental weapon swing pass through there too
     * and never touch this function. Folding it in here as well made every non-physical skill scale
     * as **(1 + spellPower)²**. At the gear cap alone that is 6.25× where 2.5× was intended, and the
     * perk arm stacks past the cap, so 4× spell power came out as 16×.
     *
     * It is also why a 140% holy skill beat a 190% physical one: a PHYSICAL skill gets neither
     * squared term, so the asymmetry was not "Consecrate is strong", it was "elemental is squared".
     *
     * `damage` below keeps `magic`, and should: it is not passed to `strike`. It is the estimate the
     * skill card prints and the number a damage-over-time and Bulwark's barrier are a share of, so
     * it wants to be roughly what the cast will land for — once.
     */
    const magic = s.element && s.element !== 'physical' ? 1 + (d.spellPower || 0) : 1;
    const mid = ((d.damage[0] + d.damage[1]) / 2) * (s.mult || 1) * magic;
    const plan = {
      ok: true,
      skill: s,
      kind: s.shape,
      element: s.element || 'physical',
      mult: s.mult || 1,
      damage: Math.max(1, Math.round(mid)),
      reach: s.reach ?? 3, arc: s.arc ?? 1.5,
      radius: s.radius ?? 0, range: s.range ?? 0, splash: s.splash ?? 0, width: s.width ?? 1.8,
      // a bolt can be a fan of several: Multi Shot firing one arrow was not a multi shot
      projectiles: Math.max(1, s.projectiles ?? 1), spread: s.spread ?? 0,
      status: s.status || null,
      statusSpec: s.status ? data.statuses[s.status] : null,
      // A skill whose whole point is what it leaves behind says so, and its status hits harder than
      // the same status applied as a side effect of something else.
      statusMult: s.statusMult ?? 1,
      heal: s.heal ? Math.round(player.maxHp * s.heal) : 0,
      healFrac: s.heal || 0,
      /**
       * R17 — A SUMMON IS A CAP, NOT A COUNT, AND THE KEPT COMPANY MOVES THE CAP.
       *
       *   "Spells that summon creatures should only summon one per type unless the spell itself has
       *    a different limit, however, these spells should also update with 'The Kept Company'
       *    increasing their limit (while still obeying your total follower limit)."
       *
       * Round 16 had the green arm granting `petSlots`, and js/skills.js added it to `petCount` —
       * how many bodies ONE CAST puts down. That is the thing the user asked to stop: casting
       * Raise Thrall three times then gave you nine thralls, because nothing anywhere counted what
       * was already standing there.
       *
       * So `petCount` is the spell's own number again and nothing adds to it, and `petCap` is the
       * new thing: how many of this creature may exist at once. js/followers.js is what enforces
       * both that and the total follower limit, at the one door every summon goes through
       * (`pets.summon`) — a cap checked here would be a cap the hire path and the class companion
       * never asked. The number is carried on the plan anyway because the skill card shows it.
       */
      pet: s.pet || null,
      petCount: Math.max(1, s.count || 1),
      petCap: Math.max(1, (s.count || 1) + followerBonus(d)),
      pets: !!s.pets,
      spent: cost,
      paidWith: bloodPrice() ? 'health' : 'mana',
    };

    /**
     * AND NOW THE TALENTS. This one line is the whole of D7: the board was built, the modifiers
     * were written and tested, and nothing ever ran them on a skill you actually cast.
     */
    const out = talentPlan(player, s.id, plan);

    /**
     * Deepening lengthens what the skill leaves on the target. `statusSpec` is the shared row out of
     * `data/skills.json`, so it is CLONED before the seconds are changed — writing to it would have
     * made every burn in the game longer for the rest of the run.
     */
    if (out.statusLonger && out.statusSpec) {
      out.statusSpec = { ...out.statusSpec, seconds: (out.statusSpec.seconds || 4) + out.statusLonger };
    }
    /**
     * The hit-time talents ride on the player until the swing lands — `rpg.strike` reads them back.
     * Cleared to null when this skill has none, so a plain skill can never inherit the last one's.
     */
    player.castRules = castRulesFrom(s.id, out);
    return out;
  }

  /** Cut every cooldown by `n` seconds — the `skill_refresh` legendary does this on a kill. */
  function refresh(n) { for (const s of slots) s.ready = Math.max(0, s.ready - n); }

  return {
    slots, update, use, check, refresh, cooldownFor, costFor,
    // R17 — rebuild the bar from a new list of ids, for the custom class's respec
    relearn,
    /** For the HUD. */
    state: () => slots.map(s => ({
      id: s.id, name: s.name, desc: s.desc, descShort: s.descShort, mp: costFor(s),
      ready: s.ready, cooldown: cooldownFor(s),
      locked: !unlocked(s), unlockAt: s.unlockAt,
      /**
       * R20 — `empty` is "no spell in this slot" and `pending` is "…and you are owed one". The HUD
       * draws a pending slot as an invitation and an empty-but-not-yet-due one as a locked slot,
       * which is what it always did for a locked one.
       */
      empty: !!s.empty, pending: !!s.empty && unlocked(s),
      usable: !s.empty && unlocked(s) && s.ready <= 0 && costFor(s) <= player.mp,
      // `shape` and `element` were missing, and the Skills screen asks for `chosen.shape || 'bolt'`
      // — so every skill in the game was offered the BOLT talent tree. A ground rune was offered
      // "Fanned". They are cheap to carry and nothing else has to change.
      shape: s.shape, element: s.element,
    })),
  };
}
