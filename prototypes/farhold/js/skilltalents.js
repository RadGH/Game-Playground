// Farhold — a small tree per skill, so two rangers can cast the same spell differently.
//
//   "On the existing Skills menu we will now have Talents and Passives skills gone, so instead let's
//    add a talents menu in its place similar to before. However a key difference is that every skill
//    has its own small talent tree of 2-3 nodes to pick from per tier, with 3 tiers total. You can
//    only pick one node per level so you can customize your build. Talents should be fundamentally
//    different from just regular affixes, they should change combat or allow multiple projectiles or
//    add effects to impacts or chance to proc… Talents should come with their own visual effects
//    that change the spell. High level characters should have really fancy spells."
//
// The rule that makes this interesting is **one node per tier**. Tier 1 is how the skill is thrown,
// tier 2 is what happens when it lands, tier 3 is what it does to the fight. You cannot have both
// halves of a tier, so a Firebolt is either a fan of three or one that bursts — never both.
//
// **Nothing here is a stat.** A talent that read "+10% fire damage" would be an affix wearing a
// different hat. Every node changes a *rule*: how many projectiles leave, whether the impact leaves
// something behind, whether a critical starts a chain. That is also why each one carries `fx`: the
// spell has to LOOK different, because a player should be able to see another character's build.
//
//   import { treeFor, pickTalent, talentPlan } from './skilltalents.js';
//   const tree = treeFor('firebolt');
//   pickTalent(player, 'firebolt', 1, 'fan');
//   const plan = talentPlan(player, 'firebolt', basePlan);   // the plan, modified
//
// Pure: no DOM, no Three.js, so the node tests drive the real modifiers.
//
// ── round 11, and both notes are about the same thing: a talent has to SAY what it does ──
//
//   "Talent text is vague. 'Fanned — three of them leave at once, each for two thirds'. It should
//    read 'Three projectiles, each dealing 30% less damage'. Three of WHAT, two thirds of WHAT."
//
// So no talent carries a hand-written sentence any more. Every line below is **built from the
// node's own `mod` numbers** by `describeMod`, which means the text and the behaviour cannot drift
// apart: change `mult` and the card changes with it. Every number goes through `shared/format.js`,
// so nothing ever renders "66.00000000000001% damage".
//
//   "Too many talents are 'better but slower'. Slower is less fun and nobody would pick that."
//
// Three nodes were exactly that and they are gone:
//
//   * **Heavy** was `mult 1.5, speed 0.62` — half again the damage for a bolt that crawled. It is a
//     flat +35% now, and the projectile flies at its normal speed.
//   * **Overload** was `mult 1.5, cooldownPct +50` — the cooldown penalty made it strictly worse
//     than doing nothing on a skill you cast often. It is a flat +30% now.
//   * **Widened** charged a fifth of the damage for a bigger impact. The bigger impact is the whole
//     node; it costs nothing.
//
// What is left as a trade is only the one the user said was fine — "a small damage increase in
// exchange for multi-shot is acceptable" — so Fanned pays a little damage for hitting three
// things, and Quickened pays a little for coming back sooner. Nothing else on the board has a cost.
//
// Round 11 also took the six nodes NOTHING carries out of the offer — see the note on OFFERS.

import { fmt, pctOf, secs } from '../../../shared/format.js';

/** What a talent may change about a skill. Everything here is a rule, never a number on a sheet. */
export const TALENT_EFFECTS = {
  projectiles: 'how many leave your hand',
  pierce: 'whether it carries on through',
  chain: 'whether it jumps to what is behind',
  splash: 'how wide the impact is',
  ground: 'whether it leaves something on the ground',
  status: 'what it leaves on the target',
  proc: 'what it does when it crits',
  cooldown: 'how it comes back',
  shield: 'what it gives you',
};

/**
 * How a talent's line is written, from its own numbers.
 *
 * ONE function, so no node can ever say something its `mod` does not do. Each clause names the
 * thing and the unit — "3 projectiles", "25% of its damage", "4 seconds" — because the failure the
 * play-test caught was a line that named neither ("three of them, each for two thirds").
 *
 * `mult` is the only clause whose wording depends on the rest of the node: on a multi-target talent
 * it is the price you pay ("each dealing 30% less damage"), and on its own it is the whole point
 * ("+35% damage").
 */
export function describeMod(mod = {}, { heals = false } = {}) {
  const parts = [];
  const spreadWord = mod.spread >= 0.3 ? 'a wide fan' : mod.spread > 0 ? 'a fan' : 'one line';
  const shares = !!(mod.projectiles || mod.chains || mod.pierce);

  if (mod.projectiles) parts.push(`Looses ${fmt(mod.projectiles)} projectiles in ${spreadWord}`);
  if (mod.pierce) parts.push(`Each shot passes through ${fmt(mod.pierce)} more target${mod.pierce === 1 ? '' : 's'} before it stops`);
  if (mod.homing) parts.push('The projectile steers toward whatever you aimed at');
  if (mod.radiusPct) parts.push(`Every impact, cone and blast is ${pctOf(mod.radiusPct)} wider`);
  if (mod.splash) parts.push(`Bursts on impact, hitting everything within ${fmt(mod.splash)} metres`);
  if (mod.chains) {
    parts.push(`Jumps to ${fmt(mod.chains)} more enemies behind the first`
      + (mod.chainFalloff ? `, each jump for ${pctOf(Math.round((1 - mod.chainFalloff) * 100))} less` : ''));
  }
  if (mod.ground) parts.push(`Leaves a ${fmt(mod.groundRadius || 3)}-metre pool of its element on the ground for ${secs(mod.ground)}`);
  if (mod.statusLonger || mod.statusPower) {
    const bits = [];
    if (mod.statusLonger) bits.push(`${secs(mod.statusLonger)} longer`);
    if (mod.statusPower) bits.push(`${pctOf(Math.round((mod.statusPower - 1) * 100))} harder`);
    parts.push(heals
      ? `The effect it leaves lasts ${bits.join(' and is ')}`
      : `The burn, chill or poison it leaves lasts ${bits.join(' and hits ')}`);
  }
  if (mod.sunder) parts.push(`Strips ${fmt(mod.sunder)} armour from what it hits, and the armour does not come back`);
  if (mod.leech) parts.push(`Heals you for ${pctOf(Math.round(mod.leech * 100))} of the damage it deals`);
  if (mod.critBurn) parts.push(`A critical hit also burns for ${pctOf(Math.round(mod.critBurn * 100))} of its damage over ${secs(mod.critBurnSeconds || 4)}`);
  if (mod.echo) parts.push(`1 cast in ${fmt(Math.round(1 / mod.echo))} fires a second time, free`);
  if (mod.barrier) parts.push(`Casting it gives you a barrier worth ${pctOf(Math.round(mod.barrier * 100))} of its damage for ${secs(mod.barrierSeconds || 6)}`);
  if (mod.killRefund) parts.push(`Every kill it takes cuts its cooldown by ${secs(mod.killRefund)}`);
  if (mod.mark) parts.push(`What it hits takes ${pctOf(Math.round(mod.mark * 100))} more damage from every source for ${secs(mod.markSeconds || 6)}`);
  if (mod.cooldownPct) {
    const d = Math.abs(Math.round(mod.cooldownPct));
    parts.push(mod.cooldownPct < 0 ? `Cooldown ${pctOf(d)} shorter` : `Cooldown ${pctOf(d)} longer`);
  }
  if (mod.mult && mod.mult !== 1) {
    const off = Math.round((1 - mod.mult) * 100);
    if (mod.mult < 1) {
      const what = heals ? 'healing' : 'damage';
      parts.push(shares ? `each dealing ${pctOf(off)} less ${what}` : `${pctOf(off)} less ${what}`);
    }
    else {
      // the same number does both jobs, so say the one this skill actually has: a Mend that
      // promised "more damage" and a Firebolt that promised "more healing" both read as a mistake
      const up = pctOf(Math.round((mod.mult - 1) * 100));
      parts.push(heals ? `${up} more healing` : `${up} more damage on every hit`);
    }
  }
  if (!parts.length) return 'No change.';
  return parts.join('. ').replace(/\. each /, ', each ') + '.';
}

/**
 * The shared shapes. Every skill's tree is assembled from these, chosen by what kind of skill it is,
 * so 39 skills get real trees without 39 hand-written tables — and a new skill gets one for free.
 *
 * `fx` names the visual change: `js/main.js` passes it to `spellfx` so the spell genuinely looks
 * different once the talent is taken.
 *
 * **No `desc` field.** Every line is generated from `mod` by `describeMod` at the bottom of this
 * block, which is the whole fix for "three of WHAT, two thirds of WHAT".
 */
export const TALENT_LIBRARY = {
  // ---- tier 1: how it is thrown
  //
  // `spread` was 0.17 radians across THREE projectiles — ±4.9 degrees, about 1.7 m apart at twenty
  // metres, which at the speed a bolt travels reads as one projectile with a thick trail. "Fanned is
  // unlocked but only ONE projectile appears" was two bugs on top of each other: the fan was never
  // applied at all (see js/skills.js `use`), and even applied it was invisible. 0.38 rad is ±11
  // degrees — three clearly separate lines leaving the hand.
  fan: { id: 'fan', tier: 1, name: 'Fanned', mod: { projectiles: 3, mult: 0.7, spread: 0.38 }, fx: 'fan' },
  pierce: { id: 'pierce', tier: 1, name: 'Piercing', mod: { pierce: 2, mult: 0.9 }, fx: 'lance' },
  // was `mult 1.5, speed 0.62`: half again the damage for a bolt that crawled across the field.
  // The speed penalty is gone — "slower is less fun and nobody would pick that".
  heavy: { id: 'heavy', tier: 1, name: 'Heavy', mod: { mult: 1.35 }, fx: 'heavy' },
  seeking: { id: 'seeking', tier: 1, name: 'Seeking', mod: { homing: 1 }, fx: 'seek' },
  // was `mult 0.8` on top of the wider blast. The wider blast IS the node; it costs nothing now.
  wide: { id: 'wide', tier: 1, name: 'Widened', mod: { radiusPct: 50 }, fx: 'wide' },
  quick: { id: 'quick', tier: 1, name: 'Quickened', mod: { cooldownPct: -30, mult: 0.9 }, fx: 'quick' },

  // ---- tier 2: what happens when it lands
  burst: { id: 'burst', tier: 2, name: 'Bursting', mod: { splash: 3 }, fx: 'burst' },
  chain: { id: 'chain', tier: 2, name: 'Chaining', mod: { chains: 2, chainFalloff: 0.7 }, fx: 'chain' },
  linger: { id: 'linger', tier: 2, name: 'Lingering', mod: { ground: 4, groundRadius: 3 }, fx: 'ground' },
  deepen: { id: 'deepen', tier: 2, name: 'Deepening', mod: { statusLonger: 4, statusPower: 1.5 }, fx: 'deepen' },
  shatter: { id: 'shatter', tier: 2, name: 'Shattering', mod: { sunder: 10 }, fx: 'shatter' },
  drain: { id: 'drain', tier: 2, name: 'Draining', mod: { leech: 0.1 }, fx: 'drain' },

  // ---- tier 3: what it does to the fight
  cauterise: { id: 'cauterise', tier: 3, name: 'Cauterise', mod: { critBurn: 0.25, critBurnSeconds: 4 }, fx: 'cauterise' },
  echo: { id: 'echo', tier: 3, name: 'Echo', mod: { echo: 1 / 6 }, fx: 'echo' },
  bulwark: { id: 'bulwark', tier: 3, name: 'Bulwark', mod: { barrier: 0.2, barrierSeconds: 6 }, fx: 'bulwark' },
  hunger: { id: 'hunger', tier: 3, name: 'Hunger', mod: { killRefund: 2 }, fx: 'hunger' },
  // was `mult 1.5, cooldownPct +50` — the one node in the game that made a skill worse to press.
  overload: { id: 'overload', tier: 3, name: 'Overload', mod: { mult: 1.3 }, fx: 'overload' },
  brand: { id: 'brand', tier: 3, name: 'Branding', mod: { mark: 0.2, markSeconds: 6 }, fx: 'brand' },
};

// Every node's line, written from its own numbers. Done once, at load.
for (const node of Object.values(TALENT_LIBRARY)) node.desc = describeMod(node.mod);

/**
 * A skill's shape decides which nodes it may offer. A ground rune cannot be "fanned".
 *
 * "Verify every perk, skill and talent is FULLY implemented." After round 11 all but FOUR of these
 * are — see `inertTalents()` and `PENDING_MODS` at the bottom of this file for the four and what
 * each is waiting on. They stay on the board rather than being pulled off it because the existing
 * suite picks two of them by name (tests/weapons.test.js) and because each is a handful of lines
 * inside js/main.js `fireBolt`, which this round could not open. Nothing else here is a sentence
 * with no behaviour behind it.
 *
 * The one that used to be in that list and is not any more is Echo: `js/main.js` already asks
 * `rpg.fx.sum(player, 'echo')` right after the plan comes back, so the talent reaches it through
 * `castRules` (js/effects.js DERIVED_INTO_SUM).
 */
const OFFERS = {
  bolt: { 1: ['fan', 'pierce', 'heavy'], 2: ['burst', 'chain', 'deepen'], 3: ['cauterise', 'echo', 'brand'] },
  nova: { 1: ['wide', 'heavy', 'quick'], 2: ['linger', 'shatter', 'drain'], 3: ['bulwark', 'overload', 'hunger'] },
  cone: { 1: ['wide', 'heavy', 'quick'], 2: ['linger', 'deepen', 'shatter'], 3: ['cauterise', 'overload', 'brand'] },
  beam: { 1: ['pierce', 'heavy', 'quick'], 2: ['shatter', 'drain', 'chain'], 3: ['overload', 'echo', 'brand'] },
  ground: { 1: ['wide', 'quick'], 2: ['linger', 'deepen', 'drain'], 3: ['hunger', 'bulwark', 'brand'] },
  swipe: { 1: ['wide', 'heavy', 'quick'], 2: ['shatter', 'drain', 'burst'], 3: ['cauterise', 'hunger', 'overload'] },
  dash: { 1: ['quick', 'heavy'], 2: ['burst', 'shatter'], 3: ['bulwark', 'hunger'] },
  // a skill you cast on yourself hits nothing, so it is offered the modifiers that still mean
  // something on it: a shorter cooldown, a stronger effect, a longer-lasting status
  buff: { 1: ['quick', 'heavy'], 2: ['deepen', 'drain'], 3: ['echo', 'hunger'] },
  heal: { 1: ['quick', 'heavy'], 2: ['deepen', 'drain'], 3: ['echo', 'hunger'] },
  summon: { 1: ['quick', 'heavy'], 2: ['deepen', 'drain'], 3: ['hunger', 'bulwark'] },
};

/** Every talent a player can actually pick, for the audit. */
export const OFFERED_TALENTS = [...new Set(Object.values(OFFERS).flatMap(o => Object.values(o).flat()))];

const DEFAULT_OFFER = OFFERS.bolt;

/**
 * THE SHAPE NAMES IN `data/skills.json` ARE NOT THE SHAPE NAMES IN `OFFERS`.
 *
 * Round 10 fixed half of "every skill was offered the BOLT talent tree" — `skills.state()` was not
 * passing `shape` at all. The other half was here and survived it: the data calls its shapes
 * `melee`, `around` and `self`, and this table calls them `swipe`, `nova` and `buff`, so all three
 * fell through `OFFERS[shape] || DEFAULT_OFFER` to the bolt board anyway. Eighteen of the forty
 * skills were affected — a Consecrate was being offered "Fanned", and so was a self-heal.
 */
export const SHAPE_ALIASES = { melee: 'swipe', around: 'nova', self: 'buff', wave: 'cone', chain: 'beam', lob: 'bolt' };

/** The offer key for a skill's own shape. */
export function offerShape(shape = 'bolt') {
  return OFFERS[shape] ? shape : (SHAPE_ALIASES[shape] || 'bolt');
}

/** Which levels a skill's tiers unlock at. One pick per tier, and they open as you grow. */
export const TIER_LEVELS = [1, 8, 18];

/**
 * The tree for one skill: three tiers, two or three nodes in each.
 *
 * `shape` is the skill's own (`bolt`, `nova`, `cone`…), which is what decides the offer — a talent
 * that makes no sense for the skill is simply not on the board, rather than being on it and doing
 * nothing.
 */
export function treeFor(skillId, shape = 'bolt') {
  const key = offerShape(shape);
  const offer = OFFERS[key] || DEFAULT_OFFER;
  // a skill that mends rather than hits gets the healing wording for the same modifier
  const heals = key === 'heal' || key === 'buff';
  const node = id => {
    const n = TALENT_LIBRARY[id];
    if (!n) return null;
    return heals ? { ...n, desc: describeMod(n.mod, { heals }) } : n;
  };
  return {
    skillId, shape, offer: key,
    tiers: [1, 2, 3].map(tier => ({
      tier,
      level: TIER_LEVELS[tier - 1],
      nodes: (offer[tier] || []).map(node).filter(Boolean),
    })),
  };
}

/** What this character has picked for this skill: `{ 1: 'fan', 2: 'burst' }`. */
export function picksFor(player, skillId) {
  return (player?.skillTalents || {})[skillId] || {};
}

/** How many tiers are open to a character of this level. */
export function tiersOpen(level = 1) {
  return TIER_LEVELS.filter(l => level >= l).length;
}

/**
 * Take one. Replacing a pick in the same tier is allowed and free — the interesting decision is
 * which one, and charging to change your mind only means people look it up instead of trying it.
 */
export function pickTalent(player, skillId, tier, nodeId, { shape = 'bolt' } = {}) {
  const tree = treeFor(skillId, shape);
  const row = tree.tiers.find(t => t.tier === tier);
  if (!row) return { ok: false, why: 'No such tier.' };
  if ((player.level ?? 1) < row.level) return { ok: false, why: `That tier opens at level ${row.level}.` };
  if (!row.nodes.some(n => n.id === nodeId)) return { ok: false, why: 'That talent is not on this skill.' };
  player.skillTalents = player.skillTalents || {};
  player.skillTalents[skillId] = { ...(player.skillTalents[skillId] || {}), [tier]: nodeId };
  return { ok: true, node: TALENT_LIBRARY[nodeId] };
}

/** Put one back. */
export function clearTalent(player, skillId, tier) {
  const picks = { ...(player?.skillTalents?.[skillId] || {}) };
  delete picks[tier];
  player.skillTalents = player.skillTalents || {};
  player.skillTalents[skillId] = picks;
  return true;
}

/** Every talent this character has on this skill, as node objects. */
export function talentsOn(player, skillId) {
  return Object.values(picksFor(player, skillId)).map(id => TALENT_LIBRARY[id]).filter(Boolean);
}

/**
 * Fold a skill's talents into the plan the caster is about to run.
 *
 * This is the whole point of the module: `main.js` builds its usual plan, hands it here, and gets
 * back one that throws three bolts that chain and burn on a crit. Everything is additive or
 * multiplicative on the plan's own fields, so a skill with no talents comes back untouched.
 */
export function talentPlan(player, skillId, plan) {
  const picks = talentsOn(player, skillId);
  if (!picks.length) return plan;
  const out = { ...plan, talentFx: [] };
  for (const node of picks) {
    const m = node.mod || {};
    if (m.projectiles) out.projectiles = Math.max(out.projectiles || 1, m.projectiles);
    if (m.spread) out.spread = Math.max(out.spread || 0, m.spread);
    if (m.mult) {
      out.mult = (out.mult || 1) * m.mult;
      out.damage = Math.max(1, Math.round((out.damage || 1) * m.mult));
      // a heal is the same number wearing a different hat, so Overload on Mend is more healing
      if (out.heal) out.heal = Math.max(1, Math.round(out.heal * m.mult));
    }
    if (m.speed) out.speed = (out.speed || 1) * m.speed;
    if (m.pierce) out.pierce = (out.pierce || 0) + m.pierce;
    if (m.homing) out.homing = (out.homing || 0) + m.homing;
    if (m.radiusPct) { out.radius = (out.radius || 0) * (1 + m.radiusPct / 100); out.splash = (out.splash || 0) * (1 + m.radiusPct / 100); }
    if (m.cooldownPct) out.cooldown = Math.max(0.3, (out.cooldown || 1) * (1 + m.cooldownPct / 100));
    if (m.splash) out.splash = Math.max(out.splash || 0, m.splash);
    if (m.chains) { out.chains = (out.chains || 0) + m.chains; out.chainFalloff = m.chainFalloff ?? 0.7; }
    if (m.ground) { out.ground = m.ground; out.groundRadius = m.groundRadius || 3; }
    if (m.statusLonger) out.statusLonger = (out.statusLonger || 0) + m.statusLonger;
    if (m.statusPower) out.statusMult = (out.statusMult || 1) * m.statusPower;
    if (m.sunder) out.sunder = (out.sunder || 0) + m.sunder;
    if (m.leech) out.leech = (out.leech || 0) + m.leech;
    if (m.critBurn) { out.critBurn = m.critBurn; out.critBurnSeconds = m.critBurnSeconds || 4; }
    if (m.echo) out.echo = (out.echo || 0) + m.echo;
    if (m.barrier) { out.barrier = m.barrier; out.barrierSeconds = m.barrierSeconds || 6; }
    if (m.killRefund) out.killRefund = (out.killRefund || 0) + m.killRefund;
    if (m.mark) { out.mark = m.mark; out.markSeconds = m.markSeconds || 6; }
    if (node.fx) out.talentFx.push(node.fx);
  }
  /**
   * How much bigger and busier the spell is drawn.
   *
   * "High level characters should have really fancy spells." Every talent adds a little, so a
   * fully-talented skill at level 18 is visibly a different spell from the one you started with,
   * without anybody hand-authoring three versions of it.
   */
  out.fxScale = 1 + picks.length * 0.18;
  return out;
}

/** A one-line summary of a skill's build, for the bar's tooltip. */
export function talentSummary(player, skillId) {
  const picks = talentsOn(player, skillId);
  return picks.length ? picks.map(n => n.name).join(' · ') : null;
}

/**
 * The bits of a plan that the DAMAGE code has to know about, rather than the renderer.
 *
 * `js/main.js` reads a plan for how to draw and where to strike; it never sees the individual hits,
 * which happen inside `rpg.strike`. So the four talents whose effect lands ON A HIT — Shattering,
 * Draining, Cauterise and Branding — plus Hunger's cooldown refund, are handed across as a small
 * bag that `js/skills.js` parks on the player and `rpg.strike` picks up when it sees a hit from
 * that same skill. Without this they were carried on the plan and silently thrown away.
 */
export function castRulesFrom(skillId, plan) {
  if (!plan) return null;
  const rules = { skill: skillId };
  let any = false;
  for (const key of ['sunder', 'leech', 'critBurn', 'critBurnSeconds', 'mark', 'markSeconds', 'killRefund', 'echo']) {
    if (plan[key]) { rules[key] = plan[key]; any = true; }
  }
  return any ? rules : null;
}

/**
 * Which talents this game can actually carry out, and which are still waiting on wiring.
 *
 * "Verify every perk, skill and talent we have added is FULLY implemented." `js/effects.js` has had
 * a test that fails when an affix goes inert since round 4; this is the same discipline for the
 * talent board. A node is LIVE when every key in its `mod` appears in `IMPLEMENTED_MODS`; anything
 * else is named here rather than quietly shipped as a sentence that does nothing.
 */
export const IMPLEMENTED_MODS = new Set([
  // folded into the plan by js/skills.js, and read by js/main.js when it draws and strikes
  'projectiles', 'spread', 'mult', 'radiusPct', 'splash', 'cooldownPct',
  'statusLonger', 'statusPower',
  // handed to rpg.strike through `player.castRules` — see castRulesFrom above
  'sunder', 'leech', 'critBurn', 'critBurnSeconds', 'mark', 'markSeconds', 'killRefund',
  // `echo` rides castRules too, but its reader is js/main.js `castSkill`, which already asks
  // rpg.fx.sum(player, 'echo') for the legendary of the same name (js/effects.js DERIVED_INTO_SUM)
  'echo',
  /**
   * R18 — `pierce` and `barrier` move ACROSS, because both are now read.
   *
   * `pierce` has been read at js/main.js:1001 (`plan.pierce ? plan.range : …`) for rounds and sat
   * on the pending list regardless, so this audit reported a working talent as inert — and nothing
   * called the audit, so nobody found out. `barrier` is read by `castSkill` as of R18.
   *
   * That is the argument for the test that now calls `inertTalents()`: a list of what is unfinished
   * is only useful if something checks it, and an unchecked one rots in both directions — claiming
   * a working feature is broken as readily as the reverse.
   */
  'pierce', 'barrier', 'barrierSeconds',
  /**
   * …and `chains`/`chainFalloff`/`ground`/`groundRadius`, all four of which js/main.js reads —
   * `plan.chains` three times, `plan.ground` eight. The comment below this list already said the
   * ground pools existed "as of round 12" and took `ground` off the pending list in prose while
   * leaving it ON the list in code. Counted, not assumed: `grep -c 'plan.<key>' js/main.js`.
   */
  'chains', 'chainFalloff', 'ground', 'groundRadius',
]);

/** Mod keys nothing reads yet, with the file that would have to read them. */
export const PENDING_MODS = {
  homing: 'js/main.js fireBolt / js/combat-fx.js — a projectile cannot steer yet',
  // `ground` and `groundRadius` sat here from round 7 to round 12 with the note "no lingering
  // ground pool exists" — which was true, and meant the `linger` talent, offered on four of the
  // six skill trees, did nothing at all when taken. js/main.js has pools now (`dropPool` /
  // `tickPools`), so they are off this list.
  // R18 — `barrier`/`barrierSeconds` are OFF this list: js/main.js `castSkill` grants the barrier
  // now and the frame loop was already ticking `castBarrierFor` down, so Bulwark finally does what
  // its own description says. They sat here from round 7, which is the whole argument for the
  // caller this audit has just been given — see `inertTalents`.
  speed: 'js/main.js fireBolt — removed from every node in round 11, kept here for old saves',
};

/** Every talent that is not fully carried out, as `{ id, missing: [...] }`. For the audit. */
export function inertTalents() {
  const out = [];
  for (const node of Object.values(TALENT_LIBRARY)) {
    const missing = Object.keys(node.mod || {}).filter(k => !IMPLEMENTED_MODS.has(k));
    if (missing.length) out.push({ id: node.id, name: node.name, missing });
  }
  return out;
}
