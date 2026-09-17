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
 * The shared shapes. Every skill's tree is assembled from these, chosen by what kind of skill it is,
 * so 39 skills get real trees without 39 hand-written tables — and a new skill gets one for free.
 *
 * `fx` names the visual change: `js/main.js` passes it to `spellfx` so the spell genuinely looks
 * different once the talent is taken.
 */
export const TALENT_LIBRARY = {
  // ---- tier 1: how it is thrown
  fan: { id: 'fan', tier: 1, name: 'Fanned', desc: 'Three of them leave at once, each for two thirds.', mod: { projectiles: 3, mult: 0.66, spread: 0.17 }, fx: 'fan' },
  pierce: { id: 'pierce', tier: 1, name: 'Piercing', desc: 'It carries on through the first thing it hits.', mod: { pierce: 2, mult: 0.9 }, fx: 'lance' },
  heavy: { id: 'heavy', tier: 1, name: 'Heavy', desc: 'One, slower, for half again.', mod: { mult: 1.5, speed: 0.62 }, fx: 'heavy' },
  seeking: { id: 'seeking', tier: 1, name: 'Seeking', desc: 'It turns after what you aimed at.', mod: { homing: 1 }, fx: 'seek' },
  wide: { id: 'wide', tier: 1, name: 'Widened', desc: 'Half again as wide, for a fifth less.', mod: { radiusPct: 50, mult: 0.8 }, fx: 'wide' },
  quick: { id: 'quick', tier: 1, name: 'Quickened', desc: 'A third off the cooldown, a fifth off the damage.', mod: { cooldownPct: -33, mult: 0.8 }, fx: 'quick' },

  // ---- tier 2: what happens when it lands
  burst: { id: 'burst', tier: 2, name: 'Bursting', desc: 'It bursts on impact, catching everything within three metres.', mod: { splash: 3 }, fx: 'burst' },
  chain: { id: 'chain', tier: 2, name: 'Chaining', desc: 'It jumps to two more behind the first, for less each time.', mod: { chains: 2, chainFalloff: 0.7 }, fx: 'chain' },
  linger: { id: 'linger', tier: 2, name: 'Lingering', desc: 'It leaves its element on the ground for four seconds.', mod: { ground: 4, groundRadius: 3 }, fx: 'ground' },
  deepen: { id: 'deepen', tier: 2, name: 'Deepening', desc: 'Whatever it leaves on the target lasts twice as long and stacks.', mod: { statusLonger: 4, statusPower: 1.5 }, fx: 'deepen' },
  shatter: { id: 'shatter', tier: 2, name: 'Shattering', desc: 'It strips 10 armour from what it hits, and the armour stays off.', mod: { sunder: 10 }, fx: 'shatter' },
  drain: { id: 'drain', tier: 2, name: 'Draining', desc: 'A tenth of what it deals comes back to you.', mod: { leech: 0.1 }, fx: 'drain' },

  // ---- tier 3: what it does to the fight
  cauterise: {
    id: 'cauterise', tier: 3, name: 'Cauterise',
    desc: 'A critical burns for a quarter of its damage again over the next four seconds.',
    mod: { critBurn: 0.25, critBurnSeconds: 4 }, fx: 'cauterise',
  },
  echo: {
    id: 'echo', tier: 3, name: 'Echo',
    desc: 'One cast in six throws itself a second time, for free.',
    mod: { echo: 0.167 }, fx: 'echo',
  },
  bulwark: {
    id: 'bulwark', tier: 3, name: 'Bulwark',
    desc: 'Casting it gives you a barrier worth a fifth of the damage for six seconds.',
    mod: { barrier: 0.2, barrierSeconds: 6 }, fx: 'bulwark',
  },
  hunger: {
    id: 'hunger', tier: 3, name: 'Hunger',
    desc: 'Every kill it takes cuts its cooldown by two seconds.',
    mod: { killRefund: 2 }, fx: 'hunger',
  },
  overload: {
    id: 'overload', tier: 3, name: 'Overload',
    desc: 'Half again the damage; the cooldown is half again as long.',
    mod: { mult: 1.5, cooldownPct: 50 }, fx: 'overload',
  },
  brand: {
    id: 'brand', tier: 3, name: 'Branding',
    desc: 'What it hits takes 20% more from everything, from anyone, for six seconds.',
    mod: { mark: 0.2, markSeconds: 6 }, fx: 'brand',
  },
};

/** A skill's shape decides which nodes it may offer. A ground rune cannot be "fanned". */
const OFFERS = {
  bolt: { 1: ['fan', 'pierce', 'heavy'], 2: ['burst', 'chain', 'deepen'], 3: ['cauterise', 'echo', 'brand'] },
  nova: { 1: ['wide', 'heavy', 'quick'], 2: ['linger', 'shatter', 'drain'], 3: ['bulwark', 'overload', 'hunger'] },
  cone: { 1: ['wide', 'heavy', 'quick'], 2: ['linger', 'deepen', 'shatter'], 3: ['cauterise', 'overload', 'brand'] },
  beam: { 1: ['pierce', 'heavy', 'quick'], 2: ['shatter', 'drain', 'chain'], 3: ['overload', 'echo', 'brand'] },
  ground: { 1: ['wide', 'quick'], 2: ['linger', 'deepen', 'drain'], 3: ['hunger', 'bulwark', 'brand'] },
  swipe: { 1: ['wide', 'heavy', 'quick'], 2: ['shatter', 'drain', 'burst'], 3: ['cauterise', 'hunger', 'overload'] },
  dash: { 1: ['quick', 'heavy'], 2: ['burst', 'shatter'], 3: ['bulwark', 'hunger'] },
  buff: { 1: ['quick', 'wide'], 2: ['drain', 'deepen'], 3: ['bulwark', 'echo'] },
  heal: { 1: ['quick', 'wide'], 2: ['linger', 'deepen'], 3: ['bulwark', 'echo'] },
  summon: { 1: ['quick', 'heavy'], 2: ['deepen', 'drain'], 3: ['hunger', 'bulwark'] },
};

const DEFAULT_OFFER = OFFERS.bolt;

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
  const offer = OFFERS[shape] || DEFAULT_OFFER;
  return {
    skillId, shape,
    tiers: [1, 2, 3].map(tier => ({
      tier,
      level: TIER_LEVELS[tier - 1],
      nodes: (offer[tier] || []).map(id => TALENT_LIBRARY[id]).filter(Boolean),
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
    if (m.mult) { out.mult = (out.mult || 1) * m.mult; out.damage = Math.max(1, Math.round((out.damage || 1) * m.mult)); }
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
