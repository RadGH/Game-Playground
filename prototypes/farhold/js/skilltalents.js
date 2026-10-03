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

import { fmt, pct, pctOf, secs } from '../../../shared/format.js';
import { VOCAB, VOCAB_KEYS, PENDING, applyMod, describeVocab, keysOf, mechRules, formIds, MOD_STRUCT_KEYS, describeSetPath } from './skillmech.js';

/**
 * R28 — THE SKILL ROWS, so a tree can be built from the row's own bespoke talents.
 *
 * `treeFor`, `talentsOn` and `talentPlan` used to know nothing but the shared library and the shape
 * a skill was offered by. Round 28 puts a `talents` block on each skill row in data/skills.json
 * (plan §5), so these need the row — and rather than make every caller (the sheet, the Unbinder,
 * the bar, the tests) pass it, js/skills.js `createSkillBar` registers the rows once and every
 * lookup falls back to the registry. A caller that passes a row explicitly wins.
 */
const ROWS = { skills: {}, statuses: {} };
const DESCRIBED = new WeakMap();
export function registerSkillRows(skills = {}, statuses = {}) {
  ROWS.skills = skills || {};
  ROWS.statuses = statuses || {};
  // ~1,400 node lines: written once per table (and again only if rows were added to it)
  const n = Object.keys(ROWS.skills).length;
  if (DESCRIBED.get(ROWS.skills) === n) return;
  for (const row of Object.values(ROWS.skills)) describeRowTalents(row);
  DESCRIBED.set(ROWS.skills, n);
}
export function skillRow(id) { return ROWS.skills[id] || null; }
export function registeredRows() { return ROWS.skills; }
/** R28 — the status rows registered with the skills, for screens that describe a skill (js/hud.js). */
export function registeredStatuses() { return ROWS.statuses; }

/**
 * Fields a bespoke node may name inside `set` / `add` / `mul` without being a vocabulary key —
 * the round-25 plan fields js/skills.js already copies onto every plan and js/main.js reads.
 */
export const PLAN_FIELDS = new Set([
  'shape', 'element', 'mult', 'cooldown', 'mp', 'reach', 'arc', 'radius', 'range', 'splash', 'width',
  'projectiles', 'spread', 'pierce', 'chains', 'chainFalloff', 'homing', 'status', 'statusMult',
  'statusSeconds', 'heal', 'repeats', 'repeatEvery', 'delay', 'pull', 'breath', 'weather', 'count', 'pet',
  'seconds', 'trail', 'orbs', 'name', 'pets', 'statusSeconds',
]);

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
  if (mod.homing) parts.push(`The projectile turns onto any target within ${fmt(2.5 + mod.homing * 3.5)} m of its flight path`);
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

  /**
   * ---- tier 4 (R22): the pick at level 28, where a skill stops being a skill and becomes a plan.
   *
   *   "add a new one at the end to make up for the gap"
   *
   * Every one of these is built out of mod keys that ALREADY have a reader — `chains`, `splash`,
   * `sunder`, `mark`, `leech`, `killRefund`, `ground`, `barrier`, `mult`, `cooldownPct`. That is
   * deliberate and it is this project's oldest lesson: a new talent whose mod key nothing reads is
   * a sentence on a card and nothing else, and R21b only just got the count of those to zero.
   * `tests/weapons.test.js` fails if one comes back, so a tier 4 made of new keys would have had to
   * ship with six new readers or not ship at all. Combining two implemented mods gives a node that
   * is genuinely bigger than a tier-3 pick without inventing a mechanic.
   */
  cascade: { id: 'cascade', tier: 4, name: 'Cascade', mod: { chains: 3, chainFalloff: 0.85, splash: 2 }, fx: 'chain' },
  unmaking: { id: 'unmaking', tier: 4, name: 'Unmaking', mod: { sunder: 18, mark: 0.15, markSeconds: 5 }, fx: 'shatter' },
  wellspring: { id: 'wellspring', tier: 4, name: 'Wellspring', mod: { leech: 0.18, killRefund: 3 }, fx: 'drain' },
  crescendo: { id: 'crescendo', tier: 4, name: 'Crescendo', mod: { mult: 1.25, cooldownPct: -20 }, fx: 'overload' },
  conflagration: { id: 'conflagration', tier: 4, name: 'Conflagration', mod: { ground: 6, groundRadius: 4.5, statusLonger: 3 }, fx: 'ground' },
  aegis: { id: 'aegis', tier: 4, name: 'Aegis', mod: { barrier: 0.35, barrierSeconds: 8 }, fx: 'bulwark' },
};

// Every node's line, written from its own numbers. Done once, at load.
for (const node of Object.values(TALENT_LIBRARY)) node.desc = describeMod(node.mod);

// ─────────────────────────────────────────────────────────────────────────────
// R28 — BESPOKE NODES: a talent that belongs to ONE skill and changes its rules.
//
// A bespoke node's `mod` is `set` / `add` / `mul` over the plan's own fields, plus any vocabulary
// key (js/skillmech.js VOCAB), plus `forms` (per-shape riders) and `when`. Its text is generated
// exactly like the library's: from the numbers, never typed — there is no `desc` in the data.
// ─────────────────────────────────────────────────────────────────────────────

const deg = r => `${fmt((r || 0) * 180 / Math.PI, { decimals: 0 })}°`;
const metres = n => `${fmt(n)} m`;

/** One clause per `set` field. */
function setClause(k, v, ctx) {
  if (k.includes('.')) return describeSetPath(k, v, ctx);
  switch (k) {
    case 'shape': return {
      melee: 'Becomes a strike in front of you', around: 'Becomes a ring around you', bolt: 'Becomes a thrown bolt',
      beam: 'Becomes a beam in a straight line', ground: 'Lands where you aim instead', dash: 'Carries you forward instead',
      self: 'Becomes a spell on yourself', summon: 'Summons instead',
    }[v] || `Becomes a ${v} skill`;
    case 'arc': return `The arc becomes ${deg(v)}`;
    case 'reach': return `The reach becomes ${metres(v)}`;
    case 'radius': return `The radius becomes ${metres(v)}`;
    case 'range': return `The range becomes ${metres(v)}`;
    case 'width': return `The width becomes ${metres(v)}`;
    case 'splash': return `The impact splashes everything within ${metres(v)}`;
    case 'element': return `Deals ${v} damage instead`;
    case 'status': return v ? `Applies ${ctx.statuses?.[v]?.name || v} instead` : 'Applies no status';
    case 'cooldown': return `The cooldown becomes ${secs(v)}`;
    case 'mp': return v ? `Costs ${fmt(v)} mana` : 'Costs no mana';
    case 'repeats': { const n = typeof v === 'object' ? v.count : v; return n === 1 ? 'Strikes once' : `Strikes ${fmt(n)} times`; }
    case 'delay': return `Lands ${secs(v)} after you cast`;
    case 'heal': return `Heals ${pct(v)} of maximum health`;
    case 'seconds': return `Lasts ${secs(v)}`;
    case 'projectiles': return `Looses ${fmt(v)} projectiles`;
    case 'statusMult': return `The status is worth ${pct(v)} of the usual`;
    case 'pets': return v ? 'Your followers get the same' : 'Only you get it';
    case 'statusSeconds': return `The status lasts ${secs(v)}`;
    default: return '';
  }
}
const ADD_NOUN = {
  projectiles: ['projectile', 'projectiles'], pierce: ['target pierced', 'targets pierced'], chains: ['jump', 'jumps'],
  radius: 'm radius', reach: 'm reach', range: 'm range', splash: 'm splash', width: 'm width', seconds: 's duration',
  'repeats.count': ['strike', 'strikes'], 'charges.max': ['charge', 'charges'], count: ['summon', 'summons'],
  pull: 'm of pull', delay: 's delay', 'knock.push': 'm of knockback', 'knock.stagger': 's of stun',
  'ricochet.bounces': ['bounce', 'bounces'], 'split.shards': ['shard', 'shards'], 'place.seconds': 's on the placed object',
  'place.radius': 'm on the placed object', 'resource.gain': 'resource point gained', 'channel.seconds': 's of channel',
  'stack.max': ['maximum stack', 'maximum stacks'], 'stack.add': ['stack added', 'stacks added'],
  'orbs.count': ['orb', 'orbs'], 'orbs.seconds': 's on the orbs', 'orbs.radius': 'm orb reach', 'orbs.every': 's between orb strikes',
  'trail.seconds': 's of trail', 'trail.radius': 'm of trail width', 'trail.burns': 's of burning ground',
  'selfBuff.seconds': 's on the buff', 'place.every': 's between pulses', 'place.max': ['post at once', 'posts at once'],
  'channel.every': 's between ticks', 'summon.count': ['summon', 'summons'], 'summon.lifetime': 's of summon life',
};
function addClause(k, v) {
  // R28 (UI) — a nested distance ("dash.range", "pool.radius") is metres too: it read "+4 dash range"
  const dist = /\.(radius|range|reach|length|metres|width)$/.test(k) ? `m ${k.split('.').join(' ').replace('metres', 'pull')}` : null;
  const noun = ADD_NOUN[k] || dist || (k.endsWith('seconds') ? 's' : k.replace(/\./g, ' '));
  const sign = v > 0 ? '+' : '−';
  const abs = Math.abs(v);
  if (Array.isArray(noun)) return `${sign}${fmt(abs)} ${abs === 1 ? noun[0] : noun[1]}`;
  if (noun === 's' || noun.startsWith('s ')) return `${sign}${secs(abs)}${noun.slice(1)}`;
  if (noun.startsWith('m ')) return `${sign}${metres(abs)}${noun.slice(1)}`;
  return `${sign}${fmt(abs)} ${noun}`;
}
function mulClause(k, v, { heals = false } = {}) {
  const d = Math.round(Math.abs(v - 1) * 100);
  if (!d) return '';
  const up = v > 1;
  switch (k) {
    case 'mult': return `${pctOf(d)} ${up ? 'more' : 'less'} ${heals ? 'healing' : 'damage'}`;
    case 'cooldown': return `Cooldown ${pctOf(d)} ${up ? 'longer' : 'shorter'}`;
    case 'radius': case 'reach': case 'range': case 'splash': case 'width': return `${pctOf(d)} ${up ? 'larger' : 'smaller'} ${k}`;
    case 'heal': return `${pctOf(d)} ${up ? 'more' : 'less'} healing`;
    case 'mp': return `Costs ${pctOf(d)} ${up ? 'more' : 'less'} mana`;
    case 'statusMult': return `The status deals ${pctOf(d)} ${up ? 'more' : 'less'}`;
    default: return `${pctOf(d)} ${up ? 'more' : 'less'} ${k.replace(/\./g, ' ')}`;
  }
}

/**
 * The sentence for a bespoke node, from its mod. `ctx.statuses` / `ctx.skills` name things; a
 * `requires` adds "Needs X." so a dimmed node can say why.
 */
export function describeNode(node, ctx = {}) {
  const mod = node?.mod || {};
  const heals = !!ctx.heals;
  const lead = [];
  for (const [k, v] of Object.entries(mod.set || {})) { const c = setClause(k, v, ctx); if (c) lead.push(c); }
  for (const [k, v] of Object.entries(mod.add || {})) if (v) lead.push(addClause(k, v));
  for (const [k, v] of Object.entries(mod.mul || {})) { const c = mulClause(k, v, { heals }); if (c) lead.push(c); }
  const parts = [];
  // clauses that share a "Where: " prefix (two form stats, two burst numbers) are said once
  const merged = [];
  for (const c of lead) {
    const at = c.indexOf(': ');
    const head = at > 0 ? c.slice(0, at) : null;
    const prev = merged[merged.length - 1];
    if (head && prev?.head === head) prev.rest.push(c.slice(at + 2));
    else merged.push(head ? { head, rest: [c.slice(at + 2)] } : { head: null, rest: [c] });
  }
  const leadText = merged.map(x => (x.head ? `${x.head}: ${x.rest.join(', ')}` : x.rest[0]));
  if (leadText.length) parts.push(`${leadText.map((c, i) => (i ? c.charAt(0).toLowerCase() + c.slice(1) : c)).join(', ')}.`);
  /**
   * A vocabulary key the row ALREADY has is merged, not replaced (applyMod), so the node is
   * described as the merged value MINUS what the row already said — "Roar of Iron" reads as its
   * barrier, not as the whole taunt again with a made-up radius.
   */
  const row = ctx.row || null;
  const subCtx = { ...ctx, atSelf: row && (row.shape === 'self' || row.shape === 'around') };
  for (const key of VOCAB_KEYS) {
    if (!(key in mod)) continue;
    /**
     * R28 (UI) — a node's `forms` is a set of per-form RIDERS (said by the loop below, "In
     * Briarback shape: …"), not a skill row's list of named overrides. Run through the row's
     * `forms` sentence it printed "Changes with your shape or stance: briarback (Briarback)".
     */
    if (key === 'forms') continue;
    const v = mod[key], base = row?.[key];
    let text;
    if (base && typeof base === 'object' && !Array.isArray(base) && v && typeof v === 'object' && !Array.isArray(v)) {
      const merged = describeVocab({ [key]: { ...base, ...v } }, subCtx).join(' ');
      const had = describeVocab({ [key]: base }, subCtx).join(' ');
      const clauses = t => t.split(/(?<=\.)\s+|;\s+|,\s+/).map(c => c.replace(/\.$/, '').replace(/^For [\d.]+s(, [^:]+)?: /, '').trim()).filter(Boolean);
      const old = new Set(clauses(had));
      const fresh = clauses(merged).filter(c => !old.has(c));
      // a duration the node changes is said, even when nothing else did
      if (v.seconds != null && v.seconds !== base.seconds) fresh.unshift(`lasts ${secs(v.seconds)} instead of ${secs(base.seconds ?? 0)}`);
      if (!fresh.length) continue;
      // a clause cut out of a longer sentence names what it is about
      const LEAD = { selfBuff: 'While it lasts: ', place: `The ${base.kind === 'trap' ? 'trap' : base.kind === 'zone' ? 'zone' : 'post'}: `, counter: 'The guard window: ', ward: 'The ward: ', pool: 'The pool: ', summon: 'The summon: ', dash: 'The dash: ', link: 'The link: ' };
      const lead2 = key === 'selfBuff' && /^For /.test(fresh[0]) ? '' : (LEAD[key] || '');
      text = `${lead2}${fresh.join('; ')}.`;
    } else if (key === 'repeats' && typeof base === 'number' && v && typeof v === 'object') {
      text = describeVocab({ repeats: v }, subCtx).join(' ');
    } else {
      text = describeVocab({ [key]: v }, subCtx).join(' ');
    }
    if (text) parts.push(text.charAt(0).toUpperCase() + text.slice(1));
  }
  for (const [id, sub] of Object.entries(mod.forms || {})) {
    const inner = describeNode({ mod: sub }, ctx).replace(/\.$/, '');
    if (inner && inner !== 'No change') parts.push(`In ${ctx.formLabel?.(id) || id}: ${inner.charAt(0).toLowerCase() + inner.slice(1)}.`);
  }
  if (mod.when?.form) parts.unshift(`Only in ${ctx.formLabel?.(mod.when.form) || mod.when.form}:`);
  if (mod.when?.resourceAtLeast) parts.unshift(`Only with ${fmt(mod.when.resourceAtLeast[1])} or more ${mod.when.resourceAtLeast[0]}:`);
  if (node.requires) parts.push(`Works with ${ctx.skills?.[node.requires]?.name || node.requires}.`);
  return parts.join(' ').trim() || 'No change.';
}

/** Is this a bespoke mod (the R28 format) rather than a library one? */
export function isBespokeMod(mod = {}) {
  return MOD_STRUCT_KEYS.some(k => k in mod) || VOCAB_KEYS.some(k => k in mod) || Object.keys(PENDING).some(k => k in mod);
}

/** Write `desc` on every bespoke node of one row, from its numbers. */
function describeRowTalents(row) {
  if (!row?.talents) return;
  const heals = row.shape === 'self' && !row.mult;
  const ctx = { statuses: ROWS.statuses, skills: ROWS.skills, heals, formLabel: id => FORM_LABELS[id] || id, row };
  for (const t of Object.values(row.talents)) {
    for (const n of t.nodes || []) n.desc = describeNode(n, ctx);
  }
}
const FORM_LABELS = {
  briarback: 'Briarback shape', fenrunner: 'Fenrunner shape', sporecap: 'Sporecap shape',
  open: 'Open stance', closed: 'Closed stance', fire: 'Fire Temper', frost: 'Frost Temper', storm: 'Storm Temper',
  valour: 'Ballad of Valour', ruin: 'Song of Ruin', mending: 'Air of Mending',
};

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
  /**
   * R21b — `seeking` takes `heavy`'s place on the bolt board, rather than being added beside it.
   *
   * A tier offers two or three picks and no more (tests/weapons.test.js), so making Seeking
   * reachable meant choosing what it replaces. `heavy` is a flat damage multiplier and is still
   * offered on seven other boards, so nothing is lost from the game — while a bolt's first tier
   * now reads as three genuinely different projectiles (a fan, a piercing shot, a seeking one)
   * instead of two behaviours and a stat stick.
   */
  bolt: { 1: ['fan', 'pierce', 'seeking'], 2: ['burst', 'chain', 'deepen'], 3: ['cauterise', 'echo', 'brand'], 4: ['cascade', 'crescendo', 'unmaking'] },
  nova: { 1: ['wide', 'heavy', 'quick'], 2: ['linger', 'shatter', 'drain'], 3: ['bulwark', 'overload', 'hunger'], 4: ['conflagration', 'aegis', 'wellspring'] },
  cone: { 1: ['wide', 'heavy', 'quick'], 2: ['linger', 'deepen', 'shatter'], 3: ['cauterise', 'overload', 'brand'], 4: ['conflagration', 'crescendo', 'unmaking'] },
  beam: { 1: ['pierce', 'heavy', 'quick'], 2: ['shatter', 'drain', 'chain'], 3: ['overload', 'echo', 'brand'], 4: ['cascade', 'unmaking', 'crescendo'] },
  ground: { 1: ['wide', 'quick'], 2: ['linger', 'deepen', 'drain'], 3: ['hunger', 'bulwark', 'brand'], 4: ['conflagration', 'wellspring', 'aegis'] },
  swipe: { 1: ['wide', 'heavy', 'quick'], 2: ['shatter', 'drain', 'burst'], 3: ['cauterise', 'hunger', 'overload'], 4: ['unmaking', 'wellspring', 'crescendo'] },
  dash: { 1: ['quick', 'heavy'], 2: ['burst', 'shatter'], 3: ['bulwark', 'hunger'], 4: ['crescendo', 'aegis'] },
  // a skill you cast on yourself hits nothing, so it is offered the modifiers that still mean
  // something on it: a shorter cooldown, a stronger effect, a longer-lasting status
  buff: { 1: ['quick', 'heavy'], 2: ['deepen', 'drain'], 3: ['echo', 'hunger'], 4: ['crescendo', 'wellspring'] },
  heal: { 1: ['quick', 'heavy'], 2: ['deepen', 'drain'], 3: ['echo', 'hunger'], 4: ['wellspring', 'aegis'] },
  summon: { 1: ['quick', 'heavy'], 2: ['deepen', 'drain'], 3: ['hunger', 'bulwark'], 4: ['crescendo', 'aegis'] },
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

/**
 * Which levels a skill's tiers unlock at. One pick per tier, and they open as you grow.
 *
 * R22 — NOBODY STARTS WITH A TALENT ANY MORE.
 *
 *   "Change it so you do NOT start with any skill talents, just start at level 3 instead and add a
 *    new one at the end to make up for the gap."
 *
 * Tier 1 opened at level 1, so a brand-new character's very first character sheet had a free pick
 * waiting on every skill on the bar — a decision asked before the player has cast anything, which
 * is the worst moment to ask it. It opens at 3 now: you have used the skill by then, so the choice
 * between a fan, a piercing shot and a seeking one is a choice about something you have seen.
 *
 * The fourth tier at 28 is the "make up for the gap" half, and it lands where the spell ladder
 * (1/3/6/12/18/24, see CLASSES.md) has run out — from 24 to 50 nothing on a skill changed, and now
 * the last thing that opens is the biggest one.
 */
export const TIER_LEVELS = [3, 8, 18, 28];

/**
 * The tree for one skill: one tier per entry in `TIER_LEVELS`, two or three nodes in each.
 *
 * `shape` is the skill's own (`bolt`, `nova`, `cone`…), which is what decides the offer — a talent
 * that makes no sense for the skill is simply not on the board, rather than being on it and doing
 * nothing.
 */
export function treeFor(skillId, shape = 'bolt', row = undefined) {
  const own = row === undefined ? skillRow(skillId) : row;
  /**
   * R28 — A ROW WITH ITS OWN TALENTS BUILDS ITS OWN TREE: each tier is that skill's two bespoke
   * nodes plus the ONE library node the row names for the tier (`lib`), or none. A row without a
   * `talents` block (the custom/test paths, or a class not yet converted) falls back to the shared
   * board by shape, exactly as before.
   */
  if (own?.talents) {
    const heals = own.shape === 'self' && !own.mult;
    return {
      skillId, shape: own.shape || shape, offer: 'bespoke',
      tiers: TIER_LEVELS.map((level, i) => {
        const t = own.talents[i + 1] || own.talents[String(i + 1)] || {};
        const nodes = (t.nodes || []).map(n => ({ ...n, tier: i + 1, bespoke: true }));
        const lib = t.lib && TALENT_LIBRARY[t.lib];
        if (lib) nodes.push(heals ? { ...lib, desc: describeMod(lib.mod, { heals }) } : lib);
        return { tier: i + 1, level, nodes };
      }),
    };
  }
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
    // R22: driven by TIER_LEVELS rather than a hard-coded [1, 2, 3], so adding a tier is one edit
    tiers: TIER_LEVELS.map((level, i) => ({
      tier: i + 1,
      level,
      nodes: (offer[i + 1] || []).map(node).filter(Boolean),
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
 * Take one.
 *
 * R20 — A TIER THAT IS ALREADY SPENT IS NOT RE-SPENT FOR FREE.
 *
 * This used to allow replacing a pick in the same tier at no cost, on the grounds that charging to
 * change your mind only means people look the answer up instead of trying it. That reasoning held
 * while the sheet also cleared a talent for free; now that undoing one is a person in a town and a
 * price ("…remove the ability to do it directly from the inventory"), a free swap would be the same
 * undo wearing a different hat — click the other node in the tier and the first one is gone, no
 * gold, no walk. So the tier has to be emptied first, and js/retrain.js is the only thing that
 * empties it. Picking into an EMPTY tier is still free and instant: that is the decision, and
 * charging for a decision nobody has made yet would only stop people making it.
 */
export function pickTalent(player, skillId, tier, nodeId, { shape = 'bolt' } = {}) {
  const tree = treeFor(skillId, shape);
  const row = tree.tiers.find(t => t.tier === tier);
  const picked = row?.nodes.find(n => n.id === nodeId) || null;
  if (!row) return { ok: false, why: 'No such tier.' };
  if ((player.level ?? 1) < row.level) return { ok: false, why: `That tier opens at level ${row.level}.` };
  if (!row.nodes.some(n => n.id === nodeId)) return { ok: false, why: 'That talent is not on this skill.' };
  const already = picksFor(player, skillId)[tier];
  if (already) {
    const worn = row.nodes.find(n => n.id === already) || TALENT_LIBRARY[already];
    return {
      ok: false,
      why: `${worn?.name || 'A talent'} is already on this tier. An Unbinder in town will take it off.`,
    };
  }
  player.skillTalents = player.skillTalents || {};
  player.skillTalents[skillId] = { ...(player.skillTalents[skillId] || {}), [tier]: nodeId };
  return { ok: true, node: picked || TALENT_LIBRARY[nodeId] };
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
export function talentsOn(player, skillId, row = undefined) {
  const own = row === undefined ? skillRow(skillId) : row;
  const picks = picksFor(player, skillId);
  return Object.entries(picks).map(([tier, id]) => nodeFor(own, tier, id)).filter(Boolean);
}

/**
 * R28 — one picked id, resolved: the row's bespoke node in that tier first, then the library.
 * Bespoke ids never equal a library id (tests/round28-skills.test.js), so the order cannot hide one.
 */
export function nodeFor(row, tier, id) {
  if (!id) return null;
  const t = row?.talents?.[tier] || row?.talents?.[String(tier)];
  const own = (t?.nodes || []).find(n => n.id === id);
  if (own) return { ...own, tier: Number(tier), bespoke: true };
  if (row?.talents) {
    // a row with its own tree only honours the ONE library node it names for that tier
    return t?.lib === id ? TALENT_LIBRARY[id] || null : null;
  }
  return TALENT_LIBRARY[id] || null;
}

/**
 * Fold a skill's talents into the plan the caster is about to run.
 *
 * This is the whole point of the module: `main.js` builds its usual plan, hands it here, and gets
 * back one that throws three bolts that chain and burn on a crit. Everything is additive or
 * multiplicative on the plan's own fields, so a skill with no talents comes back untouched.
 */
export function talentPlan(player, skillId, plan, row = undefined) {
  const picks = talentsOn(player, skillId, row);
  if (!picks.length) return plan;
  let out = { ...plan, talentFx: [] };
  const forms = formIds(player);
  for (const node of picks) {
    const m = node.mod || {};
    /**
     * R28 — a bespoke node folds through js/skillmech.js `applyMod` (set/add/mul, vocabulary keys,
     * per-form riders, `when`). `requires` names another skill: without it on the bar the node is
     * still taken, and its cross-skill part simply has nothing to act on (plan §5.1, G5).
     */
    if (node.bespoke || isBespokeMod(m)) {
      out = applyMod(out, m, { forms, player });
      out.talentFx = [...(out.talentFx || [])];
      if (node.fx) out.talentFx.push(node.fx);
      continue;
    }
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
    if (m.radiusPct) {
      out.radius = (out.radius || 0) * (1 + m.radiusPct / 100);
      out.splash = (out.splash || 0) * (1 + m.radiusPct / 100);
      /**
       * 2026-09-26 — "Wider" is offered on the melee (swipe) board, and a melee plan has no
       * `radius`: it multiplied zero and did nothing. On a swing it widens the arc (capped at the
       * same 1.6 pi a basic swing's area stat stops at) and lengthens the reach by a third as much.
       */
      if (out.kind === 'melee') {
        if (out.arc) out.arc = Math.min(Math.PI * 1.6, out.arc * (1 + m.radiusPct / 100));
        if (out.reach) out.reach *= 1 + m.radiusPct / 300;
      }
    }
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
  // R28 — every `hit`/`kill`-phase vocabulary key rides along too (registry-driven, not a hand list)
  const mech = mechRules(plan);
  if (mech) { Object.assign(rules, mech); any = true; }
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
  /**
   * R21b — `homing`, at last. `js/main.js` `fireBolt` widens its acquisition scan by this value and
   * then sweeps the flight path for a body to turn onto. Taking it off `PENDING_MODS` without
   * putting it here would have left `inertTalents` still reporting Seeking as unfinished, which is
   * the audit doing its job — the two lists are the same claim from opposite ends.
   */
  'homing',
]);

/** Mod keys nothing reads yet, with the file that would have to read them. */
export const PENDING_MODS = {
  // R21b — `homing` came OFF this list. It sat here from round 7 while `js/main.js` carried the
  // field all the way into `fireBolt` and then never read it, which also meant the `seeking` WAND
  // BEHAVIOUR (js/weapons.js, "turns after what you aimed at") was inert on a weapon the player
  // could buy. `fireBolt` widens its acquisition by the homing value and, failing that, sweeps the
  // flight path for a body and turns onto it. `Seeking` is offered on the bolt board now, too — it
  // was in TALENT_LIBRARY and in no OFFERS list, so nobody could have taken it even if it worked.
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
export function inertTalents(rows = undefined) {
  const out = [];
  for (const node of Object.values(TALENT_LIBRARY)) {
    const missing = Object.keys(node.mod || {}).filter(k => !IMPLEMENTED_MODS.has(k));
    if (missing.length) out.push({ id: node.id, name: node.name, missing });
  }
  /**
   * R28 — and every BESPOKE node on every skill row: a key that is neither a vocabulary key with a
   * reader (js/skillmech.js VOCAB) nor a plan field js/skills.js already copies is a sentence with
   * no behaviour, and so is a key still on `PENDING` (a P2 mechanic not built yet). `pending`
   * nodes are listed separately so the audit can tell "not built yet" from "nobody reads this".
   */
  for (const [skillId, row] of Object.entries(rows === undefined ? ROWS.skills : rows || {})) {
    for (const [tier, t] of Object.entries(row?.talents || {})) {
      for (const n of t.nodes || []) {
        const keys = [...keysOf(n.mod || {})].filter(k => k !== 'when');
        const missing = keys.filter(k => !(k in VOCAB) && !PLAN_FIELDS.has(k) && !(k in PENDING));
        const pending = keys.filter(k => k in PENDING);
        if (missing.length || pending.length) out.push({ id: `${skillId}:${n.id}`, name: n.name, skill: skillId, tier: Number(tier), missing: [...missing, ...pending], pending });
      }
    }
  }
  return out;
}

/**
 * R28 — SAVE MIGRATION (plan §7). Pure. `skillsOf(player)` is the six the character has now.
 *
 *   1. picks on a skill the character no longer has are dropped
 *   2. picks on a skill it still has are kept only if the id is a node of that tier in the NEW
 *      tree (a bespoke id, or the tier's `lib`)
 *   3. nothing is charged and nothing is paid back — picking into an empty tier is free
 *
 * Returns `{ dropped, kept }`. Running it twice changes nothing the second time.
 */
export function migrateTalents(player, skills = [], rows = undefined) {
  const book = rows === undefined ? ROWS.skills : rows || {};
  const had = player?.skillTalents || {};
  const next = {};
  let dropped = 0, kept = 0;
  for (const [skillId, picks] of Object.entries(had)) {
    if (!skills.includes(skillId)) { dropped += Object.values(picks || {}).filter(Boolean).length; continue; }
    const row = book[skillId] || null;
    const tree = treeFor(skillId, row?.shape || 'bolt', row);
    for (const [tier, id] of Object.entries(picks || {})) {
      if (!id) continue;
      const t = tree.tiers.find(x => String(x.tier) === String(tier));
      if (t && t.nodes.some(n => n.id === id)) {
        (next[skillId] || (next[skillId] = {}))[tier] = id;
        kept++;
      } else dropped++;
    }
  }
  if (player) player.skillTalents = next;
  return { dropped, kept };
}
export const TALENTS_VERSION = 2;
