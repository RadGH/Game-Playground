// Farhold — round 28: the skill MECHANICS vocabulary, and the pure state the skills share.
//
//   "Add distinct abilities for all classes instead of sharing them sometimes. Add more bespoke
//    talents to individual abilities rather than generic area / damage percentages that change
//    the skill in meaningful ways." — "Also for the druid add shapeshifting abilities that
//    transform their other skills."
//
// research/round28-skills-plan.md §2 is the spec. Every field a skill row (or a talent node's `mod`)
// may carry beyond the round-25 plan fields is a KEY in `VOCAB` below, and every key names:
//
//   phase     when it acts — `plan` (folded into the plan and read as the cast is drawn), `hit`
//             (rides the strike into js/rpg.js), `kill` (the killing blow), `self` (a status on the
//             caster read where damage is taken), `enemy` (read in js/actors.js), `pet` (js/pets.js),
//             `bar` (js/skills.js createSkillBar)
//   reader    the FILE that reads it. tests/round28-skills.test.js fails when that file never
//             mentions the key — the R18 "a talent with no reader is a sentence" rule, registry-driven
//   describe  the generated sentence (WORDING.md: quantities and seconds, never a feeling)
//
// This module is PURE: no DOM, no Three.js, so the node tests drive it directly. The runtime that
// draws and moves things is js/skillrun.js; js/main.js only adapts.

import { fmt, pct, secs } from '../../../shared/format.js';

// ─────────────────────────────────────────────────────────────────────────────── wording helpers

const m = n => `${fmt(n)} m`;
/** A share (0..n) as a percentage of weapon damage. */
const wd = n => `${pct(n)} weapon damage`;
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** 1st 2nd 3rd 4th … 11th 12th 13th 21st. */
export function ordinal(n) {
  const v = Math.round(n), t = v % 100;
  if (t >= 11 && t <= 13) return `${v}th`;
  return `${v}${{ 1: 'st', 2: 'nd', 3: 'rd' }[v % 10] || 'th'}`;
}
function list(bits) {
  bits = bits.filter(Boolean);
  if (bits.length <= 1) return bits[0] || '';
  return `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}`;
}
/** A status's data name ("Quarry", "Rooted"), falling back to the id. */
function sname(id, ctx = {}) {
  if (!id) return '';
  const row = ctx.statuses?.[id];
  return row?.name || String(id).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}
function skillName(id, ctx = {}) {
  return ctx.skills?.[id]?.name || String(id || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}
const FAMILY_NAMES = { undead: 'undead', fiend: 'fiends', beast: 'beasts', construct: 'constructs', elemental: 'elementals', aberration: 'aberrations', dragonkin: 'dragonkin', humanoid: 'humanoids' };
function families(csv) { return list(String(csv || '').split(',').map(f => FAMILY_NAMES[f.trim()] || f.trim())); }
/** A status reference may be an id or `{ id, seconds, ...overrides }`. */
export function statusRef(ref) {
  if (!ref) return null;
  return typeof ref === 'string' ? { id: ref } : { ...ref };
}
function statusPhrase(ref, ctx, { lasting = true } = {}) {
  const r = statusRef(ref);
  if (!r) return '';
  const spec = { ...(ctx.statuses?.[r.id] || {}), ...r };
  const bits = [];
  if (spec.takeMore) bits.push(`takes ${pct(spec.takeMore)} more damage`);
  if (spec.dealLess) bits.push(`deals ${pct(spec.dealLess)} less damage`);
  if (spec.slow) bits.push(`moves ${pct(spec.slow)} slower`);
  if (spec.hastePct || spec.haste) bits.push(`attacks ${pct(spec.hastePct || spec.haste)} faster`);
  if (spec.movePct || spec.move) bits.push(`moves ${pct(spec.movePct || spec.move)} faster`);
  if (spec.damage) bits.push(`deals ${pct(spec.damage)} more damage`);
  if (spec.resist) bits.push(`takes ${pct(spec.resist)} less damage`);
  if (spec.takeMoreDot) bits.push(`takes ${pct(spec.takeMoreDot)} more damage from damage over time`);
  const what = bits.length ? ` (${list(bits)})` : '';
  const lock = r.lockout ? `, at most once per target every ${secs(r.lockout)}` : '';
  return `${sname(r.id, ctx)}${what}${lasting ? ` for ${secs(spec.seconds ?? 4)}` : ''}${lock}`;
}

// ─────────────────────────────────────────────────────────────────────────────── the vocabulary

/** Every value describing a multi-field key may be a bare number for its first field. */
const num = (v, k) => (typeof v === 'number' ? v : (v?.[k] ?? 0));

/**
 * THE REGISTRY. Order matters: `describeVocab` walks it top to bottom, so a card reads in the
 * order the plan's table does (how it moves, what it throws, what happens on impact, set-ups,
 * your own state, statuses, followers).
 */
export const VOCAB = {
  // ---------------------------------------------------------------- A. moving bodies
  knock: {
    phase: 'hit', reader: 'js/skillrun.js',
    describe(v) {
      const push = num(v, 'push'), stun = v?.stagger || 0;
      const bits = [];
      if (push) bits.push(`Knocks targets back ${m(push)}`);
      if (stun) bits.push(push ? `and stuns them for ${secs(stun)}` : `Stuns targets for ${secs(stun)}`);
      if (v?.interrupt) bits.push('interrupting the attack they were winding up');
      if (v?.carry) bits.push(`${bits.length ? 'a' : 'A'} knocked target strikes each enemy it passes through for ${wd(v.carry.mult ?? v.carry)}`);
      return bits.length ? `${bits.join(bits.length > 2 ? ', ' : ' ')}.` : '';
    },
  },
  pullIn: {
    phase: 'hit', reader: 'js/skillrun.js',
    describe(v) {
      const to = v?.to === 'impact' ? 'the point of impact' : v?.to === 'line' ? 'the line' : 'you';
      const who = v?.only === 'ranged' ? 'Ranged targets are pulled' : 'Pulls targets';
      return `${who} ${m(num(v, 'metres'))} toward ${to}.`;
    },
  },
  dash: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe(v, ctx) {
      if (!v || typeof v !== 'object') return '';
      const verb = v.leap ? 'Leaps' : 'Dashes';
      const where = {
        aim: 'toward where you aim', target: 'to the first enemy in the line', behind: 'to land behind the target',
        back: 'backward, away from where you aim', swap: 'and swaps places with the aimed follower or enemy (not a boss)',
        ally: 'to land beside the follower nearest your aim', hit: 'out on a line and pulls you to whatever the line hits first',
      }[v.to || 'aim'] || 'toward where you aim';
      let s = `${verb} up to ${m(v.range ?? 10)} ${where}`;
      if (v.leap) s += ', striking nothing on the way';
      s += '.';
      if (v.land) {
        const lb = [`strikes everything within ${m(v.land.radius ?? 3)} for ${wd(v.land.mult ?? 1)}`];
        if (v.land.status) lb.push(`applies ${statusPhrase(v.land.status, ctx)}`);
        if (v.land.knock) lb.push(`knocks them ${m(num(v.land.knock, 'push'))} back`);
        if (v.land.heal) lb.push(`heals you and your followers within ${m(v.land.radius ?? 3)} ${pct(v.land.heal)} of maximum health`);
        if (v.land.place) lb.push(`leaves a ${m((v.land.place.radius ?? 5) * 2)} zone for ${secs(v.land.place.seconds ?? 4)}`);
        s += ` On landing, ${list(lb)}.`;
      }
      if (v.targets) s += ` Steps between up to ${fmt(v.targets)} enemies within ${m(v.range ?? 8)}, striking each.`;
      if (v.allyBarrier) s += ` A follower swapped with gets a barrier of ${pct(v.allyBarrier)} of maximum health.`;
      if (v.enemyStatus) s += ` An enemy swapped with gets ${statusPhrase(v.enemyStatus, ctx)}.`;
      return s;
    },
  },
  line: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe(v) {
      return `Laid as a ${m(v?.length ?? 10)} line ${v?.across ? 'across the spot you aim at' : 'from you toward where you aim'}, ${m(v?.width ?? 2)} wide.`;
    },
  },

  // ---------------------------------------------------------------- B. projectiles
  ricochet: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe: v => `Bounces to ${fmt(v.bounces ?? 1)} more target${(v.bounces ?? 1) === 1 ? '' : 's'} within ${m(v.range ?? 8)}, each bounce dealing ${pct(v.keep ?? 0.6)} of the damage.`,
  },
  split: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe(v, ctx) {
      const when = v.when === 'kill' ? 'when it kills' : String(v.when || '').startsWith('tag:') ? `on a ${sname(v.when.slice(4), ctx)} target` : 'on impact';
      return `Splits into ${fmt(v.shards ?? 2)} shards ${when}, each striking an enemy within ${m(v.range ?? 8)} for ${pct(v.keep ?? 0.5)} of the damage.`;
    },
  },
  returns: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe: v => `Flies back to you, striking everything on the way back for ${pct(num(v, 'keep') || 0.8)} of the damage.`,
  },

  // ---------------------------------------------------------------- C. kills, hits, landings
  onKill: {
    phase: 'kill', reader: 'js/skillrun.js',
    describe(v, ctx) {
      const bits = [];
      if (v.burst) bits.push(`the body bursts for ${wd(v.burst.mult ?? 1)} within ${m(v.burst.radius ?? 3)}`);
      if (v.spread) bits.push(`its ${list((v.spread.types || []).map(t => sname(t, ctx)))} spread${(v.spread.types || []).length === 1 ? 's' : ''} to enemies within ${m(v.spread.radius ?? 5)}`);
      if (v.reset) bits.push('the cooldown resets');
      if (v.refund) bits.push(`${pct(v.refund)} of the cooldown comes back`);
      if (v.heal) bits.push(`you heal ${pct(v.heal)} of your maximum health`);
      if (v.mana) bits.push(`you regain ${pct(v.mana)} of your maximum mana`);
      if (v.gold) bits.push(`you find ${fmt(v.gold)} gold`);
      if (v.corpse) bits.push(`it leaves a corpse worth ${fmt(v.corpse.worth ?? 1)}`);
      if (v.tag) bits.push(`the nearest enemy is marked ${sname(v.tag.id, ctx)} for ${secs(v.tag.seconds ?? 6)}`);
      if (v.pool) bits.push(`it leaves a ${m(v.pool.radius ?? 2)} cloud for ${secs(v.pool.seconds ?? 3)}`);
      if (v.haste) bits.push(`you are Hastened for ${secs(v.haste)}`);
      return bits.length ? `A kill with this skill: ${list(bits)}.` : '';
    },
  },
  onHit: {
    phase: 'hit', reader: 'js/skillmech.js',
    describe(v, ctx) {
      const bits = [];
      if (v.heal) bits.push(`restores ${pct(v.heal)} of your maximum health`);
      if (v.healShare) bits.push(`heals the most-hurt ally for ${pct(v.healShare)} of the damage dealt`);
      if (v.healAllies) bits.push(`heals you and your followers ${pct(v.healAllies)} of maximum health`);
      if (v.healPet) bits.push(`heals your nearest follower ${pct(v.healPet)} of maximum health`);
      if (v.mana) bits.push(`restores ${fmt(v.mana)} mana`);
      if (v.gold) bits.push(`finds ${fmt(v.gold)} gold`);
      if (v.status) bits.push(`${v.statusChance ? `has a ${pct(v.statusChance)} chance to apply` : 'applies'} ${statusPhrase(v.status, ctx)}`);
      if (v.resource) bits.push(`gains ${fmt(v.resource.n ?? 1)} ${cap(v.resource.id)}`);
      if (v.taunt) bits.push(`is taunted to attack you for ${secs(v.taunt)}`);
      return bits.length ? `Each enemy hit ${list(bits)}.` : '';
    },
  },
  onCrit: {
    phase: 'hit', reader: 'js/skillmech.js',
    describe(v, ctx) {
      const bits = [];
      if (v.repeat) bits.push(`strikes the target again for ${pct(v.repeat)} of the damage`);
      if (v.knock) bits.push(`knocks the target back ${m(num(v.knock, 'push'))}`);
      if (v.status) bits.push(`applies ${statusPhrase(v.status, ctx)}`);
      if (v.reset) bits.push('resets the cooldown');
      return bits.length ? `A critical hit with this skill ${list(bits)}.` : '';
    },
  },
  place: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe(v, ctx) {
      const kind = v.kind || 'pulse';
      const where = v.follow === 'self' ? 'around you' : v.follow === 'target' ? 'on the aimed enemy, following it' : ctx.atSelf ? 'where you stand' : 'where you aim';
      const parts = [];
      if (kind === 'trap') {
        parts.push(`Sets a trap ${where === 'around you' ? 'at your feet' : where} that arms after ${secs(v.arm ?? 1)}, lasts ${secs(v.seconds ?? 20)} and fires on the first enemy within ${m(v.triggerRadius ?? 2)}`);
      } else {
        parts.push(kind === 'zone'
          ? `Places a zone ${m((v.radius ?? 5) * 2)} across ${where} for ${secs(v.seconds ?? 8)}`
          : `Places a post ${where} for ${secs(v.seconds ?? 8)}`);
      }
      const s = v.strike;
      if (s) {
        const who = s.targets > 1 ? `${fmt(s.targets)} enemies` : s.nearest === false ? 'a random enemy' : 'the nearest enemy';
        parts.push(kind === 'trap'
          ? `dealing ${wd(s.mult ?? 1)}${s.status ? ` and applying ${statusPhrase(s.status, ctx)}` : ''}`
          : `striking ${who} within ${m(v.radius ?? 5)} every ${secs(v.every ?? 1)} for ${wd(s.mult ?? 0.3)}${s.status ? ` and applying ${statusPhrase(s.status, ctx)}` : ''}`);
      }
      if (v.heal) parts.push(`healing you and your followers ${kind === 'zone' ? 'inside' : `within ${m(v.radius ?? 5)} of it`} ${pct(v.heal)} of maximum health every ${secs(v.every ?? 1)}`);
      if (v.buff) parts.push(`giving allies inside ${statusPhrase(v.buff, ctx, { lasting: false })} while they stay in it`);
      if (v.debuff) parts.push(`applying ${statusPhrase(v.debuff, ctx, { lasting: false })} to enemies inside while they stay in it`);
      if (v.knockOut) parts.push(`pushing enemies inside ${m(v.knockOut)} outward every second`);
      if (v.pull) parts.push(`pulling enemies inside ${m(v.pull)} inward every second`);
      if (v.edge) {
        const eb = [`${wd(v.edgeMult ?? 1)}`];
        const st = v.edgeKnock?.stagger ?? 0.6;
        if (st) eb.push(`a ${secs(st)} stun`);
        if (v.edgeStatus) eb.push(statusPhrase(v.edgeStatus, ctx));
        parts.push(`an enemy that crosses its edge, in or out, takes ${list(eb)}`);
      }
      if (v.blocksRanged) parts.push(`enemy ranged hits on anyone within ${m(v.radius ?? 5)} of its middle are stopped`);
      const thing = kind === 'trap' ? 'the trap' : kind === 'zone' ? 'the zone' : 'the post';
      if (v.hp) parts.push(`${thing} has ${pct(v.hp)} of your maximum health and can be broken`);
      if (v.max) parts.push(`at most ${fmt(v.max)} stand at once`);
      if (v.ringOn) parts.push(`each ${skillName(v.ringOn.skill, ctx)} hit within ${m(v.ringOn.radius ?? 8)} of ${thing} rings ${thing} for ${wd(v.ringOn.mult ?? 1.2)}`);
      if (v.taunt) parts.push(`enemies within ${m(v.radius ?? 5)} attack ${thing}`);
      if (v.barrierTick) parts.push(`allies inside gain a barrier of ${pct(v.barrierTick)} of maximum health every ${secs(v.every ?? 1)}, up to ${pct(v.barrierCap ?? 0.15)}`);
      if (v.deathPrevent) parts.push('allies inside cannot drop below 1 health');
      if (v.onExpire) parts.push(`when ${thing} ends it ${v.onExpire.mult ? `bursts for ${wd(v.onExpire.mult)} within ${m(v.onExpire.radius ?? 4)}` : ''}${v.onExpire.mult && v.onExpire.heal ? ' and ' : ''}${v.onExpire.heal ? `heals allies within ${m(v.onExpire.radius ?? 4)} ${pct(v.onExpire.heal)} of maximum health` : ''}`.replace(' it bursts', ' and bursts').replace('it heals', 'and heals'));
      return `${parts.join(', ')}.`;
    },
  },
  pool: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe(v, ctx) {
      const secsLeft = v.seconds ?? 4;
      const total = (v.power ?? 0.3) * Math.max(1, Math.round(secsLeft / 0.75));
      const el = v.element && v.element !== 'physical' ? ` ${v.element}` : '';
      let s = (v.power ?? 0.3) > 0
        ? `Leaves a ${m(v.radius ?? 3)} pool for ${secs(secsLeft)} that deals ${wd(total)}${el ? ` as${el}` : ''} over ${secs(secsLeft)} to anything standing in it`
        : `Leaves a ${m(v.radius ?? 3)} patch for ${secs(secsLeft)}`;
      if (v.along === 'beam') s += ' all along the line';
      if (v.at === 'ahead') s += ' in front of you';
      if (v.slow) s += `${(v.power ?? 0.3) > 0 ? ' and slows it' : ' that slows anything standing in it'} ${pct(v.slow)}`;
      if (v.status) s += `, applying ${statusPhrase(v.status, ctx)}`;
      if (v.healAllies) s += `; allies inside heal ${pct(v.healAllies)} of maximum health a second`;
      return `${s}.`;
    },
  },
  repeats: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe(v) {
      if (typeof v !== 'object' || !v) return '';
      const bits = [];
      if (v.grow) bits.push(`each strike reaches ${m(v.grow)} further than the last`);
      if (v.scatter) bits.push('each strike lands at a random point inside the area, preferring enemies');
      if (v.target === 'lowest') bits.push('each strike picks the enemy with the lowest health');
      if (v.alternate) {
        const forms = v.alternate.length;
        bits.push(forms === 2 ? 'the strikes alternate between its two forms' : `the strikes take each of ${fmt(forms)} forms in turn`);
        const els = v.alternate.map(a => a.element).filter(Boolean);
        if (els.length === forms && new Set(els).size === forms) bits.push(`one strike each of ${list(els)}`);
      }
      return bits.length ? `${cap(list(bits))}.` : '';
    },
  },
  afterimage: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe: v => `An afterimage where you ${v.at === 'end' ? 'end up' : 'stood'} repeats the strike ${secs(v.delay ?? 0.5)} later for ${pct(v.mult ?? 0.5)} of the damage${(v.count ?? 1) > 1 ? `, ${fmt(v.count)} times` : ''}.`,
  },

  burst: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe(v, ctx) {
      const bits = [];
      if (v.mult) bits.push(`strikes everything within ${m(v.radius ?? 6)} of you for ${wd(v.mult)}${v.element ? ` as ${v.element}` : ''}`);
      if (v.statuses) bits.push(`applies ${list([].concat(v.statuses).map(r => statusPhrase(r, ctx)))}${v.mult ? '' : ` to everything within ${m(v.radius ?? 6)} of you`}`);
      if (v.knock) bits.push(`knocks them ${m(num(v.knock, 'push'))} back`);
      if (v.heal) bits.push(`heals you and your followers within it ${pct(v.heal)} of maximum health`);
      return bits.length ? `On cast, ${list(bits)}.` : '';
    },
  },
  again: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe: v => `Goes off again ${secs(v.delay ?? 2)} later${v.mult != null && v.mult !== 1 ? ` for ${pct(v.mult)} of the damage` : ''}.`,
  },

  // ---------------------------------------------------------------- D. set-ups and pay-offs
  tag: {
    phase: 'hit', reader: 'js/skillmech.js',
    describe(v, ctx) {
      const t = typeof v === 'string' ? { id: v } : v;
      const row = { ...(ctx.statuses?.[t.id] || {}), ...t };
      const bits = [];
      if (row.fromYou) bits.push(`take ${pct(row.fromYou)} more damage from you`);
      if (row.takeMore) bits.push(`take ${pct(row.takeMore)} more damage from every source`);
      if (row.fromParty) bits.push(`take ${pct(row.fromParty)} more damage from your followers`);
      if (row.store) bits.push(`take ${pct(row.store)} of the damage dealt to them during the mark again when it ends`);
      if (row.dealLess) bits.push(`deal ${pct(row.dealLess)} less damage`);
      if (row.fromBehind) bits.push('take every hit as if it came from behind');
      if (row.detonateMult) bits.push(`take ${fmt(row.detonateMult)} times the damage when a rune detonates on them`);
      if (row.takeMoreDot) bits.push(`take ${pct(row.takeMoreDot)} more damage from damage over time`);
      if (row.slow) bits.push(`move ${pct(row.slow)} slower`);
      if (row.burstOnExpire) bits.push(`burst for ${wd(row.burstOnExpire.mult ?? 0.5)} within ${m(row.burstOnExpire.radius ?? 2.5)} when the mark ends`);
      if (row.gainOnHurt) bits.push(`give you ${fmt(row.gainOnHurt.n ?? 1)} ${cap(row.gainOnHurt.id)} each time they hit you or a follower`);
      return `Marks targets with ${sname(t.id, ctx)} for ${secs(row.seconds ?? 6)}${bits.length ? `: they ${list(bits)}` : ''}.`;
    },
  },
  consumes: {
    phase: 'hit', reader: 'js/skillmech.js',
    describe(v, ctx) {
      const what = v.tag || v.status;
      const name = what === 'stagger' ? 'stunned' : what === 'sleep' ? 'sleeping' : what === 'root' ? 'rooted' : sname(what, ctx);
      let s = v.perStack
        ? `Deals ${pct(v.mult ?? 0.2)} more damage per ${name} stack on the target${v.cap ? `, up to ${pct(v.cap)}` : ''}`
        : `Deals ${pct(v.mult ?? 0.5)} more damage to ${name} targets`;
      if (v.remove) s += `, and removes the ${name}`;
      return `${s}.`;
    },
  },
  stack: {
    phase: 'hit', reader: 'js/skillmech.js',
    describe(v, ctx) {
      const add = v.add ?? 1;
      return `Adds ${fmt(add)} ${sname(v.status, ctx)} stack${add === 1 ? '' : 's'} to each target hit, up to ${fmt(v.max ?? 5)}.`;
    },
  },
  detonate: {
    phase: 'hit', reader: 'js/skillmech.js',
    describe(v, ctx) {
      return `Deals ${pct(v.share ?? 0.6)} of the remaining ${list((v.types || ['burn']).map(t => sname(t, ctx)))} damage on each target at once${v.keep ? `, leaving ${fmt(v.keep)} stack${v.keep === 1 ? '' : 's'}` : ''}.`;
    },
  },
  spreadStatus: {
    phase: 'hit', reader: 'js/skillmech.js',
    describe: (v, ctx) => `Copies ${list((v.types || []).map(t => sname(t, ctx)))} from the target to up to ${fmt(v.max ?? 3)} enemies within ${m(v.radius ?? 5)}.`,
  },
  store: {
    phase: 'hit', reader: 'js/skillmech.js',
    describe: v => `When the mark ends, the target takes ${pct(v.share ?? 0.3)} of the damage it took during the mark again.`,
  },
  bonusIf: {
    phase: 'hit', reader: 'js/skillmech.js',
    describe(v, ctx) {
      const out = [];
      for (const b of [].concat(v || [])) {
        const [kind, a, b2, c] = String(b.when || '').split(':');
        const more = pct(b.mult ?? 0.5);
        if (kind === 'execute') out.push(`Deals ${more} more damage to targets below ${pct(+a)} health.`);
        else if (kind === 'family') out.push(`Deals ${more} more damage to ${families(a)}.`);
        else if (kind === 'behind') out.push(`Deals ${more} more damage from behind the target.`);
        else if (kind === 'crowd') out.push(`Deals ${pct(+a)} more damage for each enemy hit past the first, up to ${pct(+b2)}.`);
        else if (kind === 'distance') out.push(`Deals ${pct(+b2)} more damage for every metre past ${m(+a)}, up to ${pct(+c)}.`);
        else if (kind === 'stationary') out.push(`Deals ${more} more damage after you have stood still for ${secs(+a)}.`);
        else if (kind === 'caster') out.push(`Deals ${more} more damage to casters and archers.`);
        else if (kind === 'rank') out.push(`Deals ${more} more damage to champions, rares and bosses.`);
        else if (kind === 'status') out.push(`Deals ${more} more damage to a target with ${sname(a, ctx)}.`);
        else if (kind === 'variety') out.push(`Deals ${pct(+a || 0.2)} more damage for each different status on the target, up to ${pct(+b2 || 1)}.`);
        else if (kind === 'aimNotYou') out.push(`Deals ${more} more damage to an enemy that is attacking someone other than you.`);
        else if (kind === 'followers') out.push(`Deals ${pct(+a || 0.25)} more damage for each follower alive, up to ${pct(+b2 || 0.5)}.`);
      }
      return out.join(' ');
    },
  },
  pen: {
    phase: 'hit', reader: 'js/rpg.js',
    describe: v => `Ignores ${pct(v)} of the target's armour.`,
  },
  statuses: {
    phase: 'hit', reader: 'js/skillmech.js',
    describe: (v, ctx) => `Also applies ${list([].concat(v || []).map(r => statusPhrase(r, ctx)))}.`,
  },

  // ---------------------------------------------------------------- E. your own state
  charges: {
    phase: 'bar', reader: 'js/skills.js',
    describe: v => `Holds ${fmt(num(v, 'max'))} charges; the cooldown brings them back one at a time.`,
  },
  recast: {
    phase: 'bar', reader: 'js/skills.js',
    describe(v, ctx) {
      if (v.say) return `Press again within ${secs(v.window ?? 4)} to ${v.say}.`;
      const sub = describeSub(v.then, ctx);
      return `Press again within ${secs(v.window ?? 4)} for a second part that ${sub || 'goes off where you aim'}.`;
    },
  },
  resource: {
    phase: 'bar', reader: 'js/skills.js',
    describe(v, ctx) {
      const name = cap(v.id);
      const bits = [];
      if (v.gain) {
        const per = { hit: 'for each enemy hit', cast: 'when you cast it', hurt: 'when you are hit', kill: 'for each kill' }[v.gainPer || 'cast'];
        bits.push(`Gains ${fmt(v.gain)} ${name} ${per}${v.gainIfNew ? `, ${fmt(v.gain + v.gainIfNew)} if your previous skill was a different one` : ''}.`);
      }
      if (v.spend) {
        const what = v.spend === 'all' ? `all your ${name}` : `${fmt(v.spend)} ${name}`;
        bits.push(`Spends ${what}${v.perPoint?.mult ? `: ${pct(v.perPoint.mult)} more damage for each point spent` : ''}${v.optional ? ' if you have it' : ''}.`);
      }
      if (v.atMax) {
        const sub = describeSub(v.atMax, ctx);
        if (sub) bits.push(`Spending ${fmt(v.max || RESOURCE_MAX)} or more: ${sub}.`);
      }
      if (v.ifSpent) { const sub = describeSub(v.ifSpent, ctx); if (sub) bits.push(`Spending any: ${sub}.`); }
      if (v.max) bits.push(`${name} holds up to ${fmt(v.max)}.`);
      return bits.join(' ');
    },
  },
  form: {
    phase: 'bar', reader: 'js/skills.js',
    describe: (v, ctx) => describeForm(v, ctx),
  },
  forms: {
    phase: 'bar', reader: 'js/skills.js',
    describe(v) {
      const names = Object.entries(v || {}).map(([id, o]) => (o?.name ? `${o.name} (${FORM_LABEL[id] || cap(id)})` : `a ${FORM_LABEL[id] || cap(id)} version`));
      return names.length ? `Changes with your shape or stance: ${list(names)}.` : '';
    },
  },
  elementFrom: {
    phase: 'bar', reader: 'js/skills.js',
    describe: v => ({ temper: 'Its element and status follow your Wyrm Temper.', song: 'Its element follows the song you are playing.', cycle: 'Its element changes each cast, in order.' }[v] || ''),
  },
  elementCycle: {
    phase: 'bar', reader: 'js/skills.js',
    describe: v => `Each cast takes the next element in turn: ${list([].concat(v || []).map(e => (typeof e === 'string' ? e : e.element)))}.`,
  },
  elementPool: {
    phase: 'bar', reader: 'js/skills.js',
    describe: v => `Each cast deals a random element: ${list([].concat(v || []).map(e => (typeof e === 'string' ? e : e.element)))}.`,
  },
  statusPool: {
    phase: 'bar', reader: 'js/skills.js',
    describe: (v, ctx) => `Each hit applies one random status: ${list([].concat(v || []).map(s => sname(s, ctx)))}.`,
  },
  variance: {
    phase: 'bar', reader: 'js/skills.js',
    describe: v => `Deals between ${pct(v[0])} and ${pct(v[1])} of the listed damage, rolled each cast.`,
  },
  hpCost: {
    phase: 'bar', reader: 'js/skills.js',
    describe: v => `Costs ${pct(num(v, 'share'))} of your maximum health, never taking you below 1 health.`,
  },
  resetOn: {
    phase: 'bar', reader: 'js/skillmech.js',
    describe(v) {
      const [kind, n] = String(v.when || v).split(':');
      return { kill: "A kill with this skill resets this skill's cooldown.", crit: "A critical hit with this skill resets this skill's cooldown.", consume: "Consuming a mark resets this skill's cooldown.", crowd: `Hitting ${fmt(+n || 5)} or more enemies with one cast resets this skill's cooldown.` }[kind] || '';
    },
  },
  cutCooldown: {
    phase: 'bar', reader: 'js/skills.js',
    describe(v, ctx) {
      const whose = v.skill === 'others' ? 'every other skill' : v.skill === 'followers' ? "every follower ability's" : v.skill === 'self' ? 'this skill' : skillName(v.skill, ctx);
      const per = { hit: 'Each enemy hit takes', cast: 'Casting this takes', kill: 'Each kill takes' }[v.per || 'cast'];
      let s = `${per} ${secs(v.seconds ?? 1)} off ${whose}${v.skill === 'followers' ? ' cooldowns' : "'s cooldown"}.`;
      if (v.orSelf) s += ` Without ${whose} on your bar, ${secs(v.orSelf)} comes off this skill's own cooldown instead.`;
      return s;
    },
  },
  empowerNext: {
    phase: 'bar', reader: 'js/skills.js',
    describe(v) {
      const n = v.count ?? 1;
      const bits = [];
      const one = n === 1;
      if (v.mult) bits.push(`${one ? 'deals' : 'deal'} ${pct(v.mult)} more damage`);
      if (v.free) bits.push(one ? 'costs no mana' : 'cost no mana');
      if (v.crit) bits.push(one ? 'is a certain critical hit' : 'are certain critical hits');
      if (v.behind) bits.push(one ? 'counts as from behind' : 'count as from behind');
      if (v.repeat) bits.push(`${one ? 'fires' : 'fire'} ${fmt(v.repeat)} times at ${pct(v.repeatMult ?? 0.6)} each`);
      if (v.pets) bits.push(`also ${one ? 'empowers' : 'empower'} your followers' next attack`);
      const who = v.basic ? (n === 1 ? 'Your next attack' : `Your next ${fmt(n)} attacks`) : (n === 1 ? 'Your next skill' : `Your next ${fmt(n)} skills`);
      return `${who} within ${secs(v.seconds ?? 8)} ${list(bits) || (n === 1 ? 'is empowered' : 'are empowered')}.`;
    },
  },
  imbue: {
    phase: 'self', reader: 'js/rpg.js',
    describe(v, ctx) {
      const bits = [];
      if (v.mult) bits.push(`deal ${pct(v.mult)} more damage${v.element ? ` as ${v.element}` : ''}`);
      if (v.status) bits.push(`apply ${sname(v.status, ctx)}`);
      if (v.splash) bits.push(`splash everything within ${m(v.splash)}`);
      let s = `For ${secs(v.seconds ?? 10)} your attacks ${list(bits) || 'are empowered'}`;
      if (v.every) s += `; every ${ordinal(v.every.n ?? 4)} attack bursts for ${wd(v.every.burst?.mult ?? 1)} within ${m(v.every.burst?.radius ?? 3)}`;
      return `${s}.`;
    },
  },
  channel: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe: v => `Channels for up to ${secs(v.seconds ?? 3)}, striking every ${secs(v.every ?? 0.5)}; ${v.moveK ? `you move at ${pct(v.moveK)} speed while channelling` : 'moving ends the channel'}, and pressing the key again ends it early.`,
  },
  selfBuff: {
    phase: 'self', reader: 'js/skillrun.js',
    describe: (v, ctx) => describeSelfBuff(v, ctx),
  },
  counter: {
    phase: 'self', reader: 'js/skillmech.js',
    describe(v) {
      const n = v.hits ?? 1;
      const bits = [];
      const what = v.negate >= 1 ? 'negated' : `reduced by ${pct(v.negate ?? 1)}`;
      let s = `For ${secs(v.window ?? 1.5)}, the next ${n === 1 ? 'melee hit' : `${fmt(n)} melee hits`} on you ${n === 1 ? 'is' : 'are'} ${what}${v.frontal ? ' (from the front)' : ''}`;
      if (v.ranged) s += `; 1 ranged hit is also negated`;
      if (v.answer) bits.push(`each is answered with a strike for ${wd(v.answer.mult ?? 1)}${v.answer.knock?.stagger ? ` that stuns for ${secs(v.answer.knock.stagger)}` : ''}`);
      if (v.tauntAttacker) bits.push(`the attacker is taunted for ${secs(v.tauntAttacker)}`);
      if (v.heal) bits.push(`you heal ${pct(v.heal)} of maximum health`);
      if (v.gain) bits.push(`you gain ${fmt(v.gain.n ?? 1)} ${cap(v.gain.resource)}`);
      if (v.grow) bits.push(`the next cast of this skill deals ${pct(v.grow.per)} more for each hit, up to ${pct(v.grow.cap)}`);
      if (v.ccImmune) bits.push('nothing can knock you back or stun you meanwhile');
      s += bits.length ? `; ${list(bits)}` : '';
      if (v.onUnused?.refund) s += `. Unused, ${pct(v.onUnused.refund)} of the cooldown comes back`;
      return `${s}.`;
    },
  },
  ward: {
    phase: 'self', reader: 'js/skillmech.js',
    describe(v) {
      const who = v.pets ? 'You and every follower get' : 'You get';
      const n = v.charges ?? 1;
      const which = v.threshold ? ` worth more than ${pct(v.threshold)} of maximum health` : v.cap ? ` of up to ${pct(v.cap)} of maximum health` : '';
      return `${who} a ward for ${secs(v.seconds ?? 10)} that completely negates ${n === 1 ? `the first hit${which}` : `${fmt(n)} hits${which ? `, each one${which}` : ''}`}.`;
    },
  },

  // ---------------------------------------------------------------- G. followers, summons, threat
  taunt: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe(v) {
      const who = v.target ? 'The target attacks' : `Enemies within ${m(v.radius ?? 8)} attack`;
      const by = v.by === 'decoy' ? 'your decoy' : v.by === 'post' ? 'the post' : v.by === 'pet' ? 'your follower' : 'you';
      let s = `${who} ${by} for ${secs(v.seconds ?? 3)}${v.only === 'ranged' ? ' (ranged enemies only)' : ''}.`;
      if (v.perTaunt) s += ` Each enemy taunted adds ${pct(v.perTaunt)} damage to the buff, up to ${pct(v.perTauntCap ?? 0.25)}.`;
      if (v.barrierPer) s += ` You gain a barrier worth ${pct(v.barrierPer)} of your maximum health for each enemy taunted, for 6s.`;
      return s;
    },
  },
  command: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe(v, ctx) {
      const who = v.petOnly ? 'your class companion' : 'your followers';
      const verb = { focus: 'to attack the target', pounce: 'to leap onto the target, the next attack dealing 50% more damage', guard: 'to stay within 4 m of you and attack whatever hits you', return: 'to return to you' }[v.order || 'focus'];
      let s = `Orders ${who} ${verb}${v.seconds ? ` for ${secs(v.seconds)}` : ''}`;
      if (v.biteStatus) s += `; meanwhile their attacks apply ${sname(v.biteStatus, ctx)}`;
      if (v.gain) s += `; each of their hits gives you ${fmt(v.gain.n ?? 1)} ${cap(v.gain.resource || v.gain.id)}`;
      return `${s}.`;
    },
  },
  summon: {
    phase: 'pet', reader: 'js/pets.js',
    describe(v, ctx) {
      const n = v.count ?? 1;
      const at = v.at === 'corpses' ? (v.perCorpse ? '' : ` from a corpse within ${m(v.radius ?? 12)}`) : v.at === 'aim' ? ' where you aim' : '';
      const what = v.decoy
        ? `${n === 1 ? `a ${v.name || 'decoy'}` : `${fmt(n)} ${v.name ? `${v.name}s` : 'decoys'}`}, each with ${pct(v.decoy.hpShare ?? 0.3)} of your maximum health, that ${n === 1 ? 'does' : 'do'} not move or attack and ${n === 1 ? 'draws' : 'draw'} every enemy near ${n === 1 ? 'it' : 'them'}`
        : `${fmt(n)} ${v.name || 'helper'}${n === 1 ? '' : 's'}`;
      let s = `Summons ${what}${at}${v.lifetime ? ` for ${secs(v.lifetime)}` : ''}`;
      if (v.perCorpse) s += `, one for each corpse within ${m(v.radius ?? 12)} of where you aim${v.plus ? ` plus ${fmt(v.plus)}` : ''}${v.max ? `, up to ${fmt(v.max)}` : ''}; each rises where its corpse lies`;
      if (v.hpMult && v.hpMult !== 1) s += `; it has ${pct(Math.abs(v.hpMult - 1))} ${v.hpMult > 1 ? 'more' : 'less'} health`;
      if (v.biteStatus) s += `; its attacks apply ${sname(v.biteStatus, ctx)}`;
      if (v.decoy?.onStruck) s += `; whatever strikes it gets ${statusPhrase(v.decoy.onStruck, ctx)}`;
      if (v.mimic) s += `; it repeats every skill you cast for ${pct(v.mimic.mult ?? 0.4)} of the damage`;
      if (v.temporary) s += '; it takes no follower slot';
      if (v.burstOnExpire) s += `; when it ends it bursts for ${wd(v.burstOnExpire.mult ?? 0.8)} within ${m(v.burstOnExpire.radius ?? 3)}`;
      if (v.heal) s += `; it heals the most-hurt of you and your followers ${pct(v.heal.share ?? 0.06)} every ${secs(v.heal.every ?? 2)}`;
      return `${s}.`;
    },
  },
  barrier: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe(v) {
      if (typeof v === 'number') return '';
      const who = v.pets ? 'You and every follower get' : 'You get';
      const worth = v.of === 'paid' ? 'worth the health this skill cost' : `worth ${pct(v.share ?? 0.2)} of your maximum health`;
      return `${who} a barrier ${worth} for ${secs(v.seconds ?? 6)}.`;
    },
  },
  healPets: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe: v => `Every follower heals ${pct(num(v, 'share'))} of its maximum health.`,
  },
  overflowBarrier: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe: v => `Healing past your maximum becomes a barrier, up to ${pct(v)} of maximum health.`,
  },
  revive: {
    phase: 'pet', reader: 'js/skillrun.js',
    describe: v => `Revives every fallen follower at once at ${pct(num(v, 'share') || 0.5)} health.`,
  },
  cleanse: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe(v) {
      const who = v.pets ? 'you and every follower' : 'you';
      return `Removes ${fmt(v.count ?? 1)} harmful status${(v.count ?? 1) === 1 ? '' : 'es'} from ${who}.`;
    },
  },
  link: {
    phase: 'self', reader: 'js/skillrun.js',
    describe(v, ctx) {
      if (v.to === 'enemy') return `Links the target to you for ${secs(v.seconds ?? 8)}: ${pct(v.share ?? 0.3)} of the damage you take is dealt to it too.`;
      let s = `Links the follower nearest your aim to you for ${secs(v.seconds ?? 8)}: you take ${pct(v.share ?? 0.4)} of the damage dealt to it${v.threshold ? ` above ${pct(v.threshold)} of its health` : ''} instead`;
      if (v.gainPer) s += `; each hit you take for it adds ${pct(v.gainPer.per ?? 0.05)} damage to your ${sname(v.gainPer.status, ctx)}, up to ${pct(v.gainPer.cap ?? 0.25)}`;
      if (v.healEach) s += `; you both heal ${pct(v.healEach)} of maximum health a second`;
      return `${s}.`;
    },
  },
  corpseBurst: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe: v => `Every corpse within ${m(v.radius ?? 10)} of where you aim (up to ${fmt(v.max ?? 5)}) explodes where it lies, striking everything within ${m(v.burst ?? 4)} of it for ${wd(v.mult ?? 1)}${v.fallback ? `; with no corpse, your nearest follower gives ${pct(v.fallback)} of its health to explode instead` : ''}.`,
  },
  clusters: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe: v => `Each other group of ${fmt(v.min ?? 2)} or more enemies within ${m(v.range ?? 30)} of you is struck too, for ${pct(v.mult ?? 0.4)} of the damage (up to ${fmt(v.max ?? 4)} groups).`,
  },
  allyStatus: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe: (v, ctx) => `${v.target === 'all' ? 'Every follower gets' : 'The follower nearest your aim gets'} ${statusPhrase({ ...statusRef(v.status), seconds: v.seconds ?? statusRef(v.status)?.seconds }, ctx)}${v.self ? ', and so do you' : ''}.`,
  },
  sequence: {
    phase: 'bar', reader: 'js/skills.js',
    describe: (v, ctx) => `After ${fmt(v.n ?? 3)} casts in a row with different elements, the next cast ${describeSub(v.mod, ctx) || 'is empowered'}.`,
  },

  // ---------------------------------------------------------------- P2 (second pass)
  turned: {
    phase: 'hit', reader: 'js/actors.js',
    describe(v) {
      let s = `A non-boss target fights its own side for ${secs(v.seconds ?? 6)}${v.follow ? ', following you' : ''}`;
      if (v.weakenAfter) s += `; when it ends the target is Weakened for ${secs(v.weakenAfter)}`;
      return `${s}. Champions and rares turn for half as long; a boss is slowed 60% instead.`;
    },
  },
  stasis: {
    phase: 'hit', reader: 'js/actors.js',
    describe: v => `A non-boss target is held still and cannot be hurt for ${secs(v.seconds ?? 4)}; the damage dealt to it meanwhile lands at once, ${pct(v.bank ?? 1.5)} of it, when it thaws. A boss is slowed 60% instead.`,
  },
  transform: {
    // applied as the `transmuted` status here; js/actors.js draws it small and js/rpg.js disarms it
    phase: 'hit', reader: 'js/skillmech.js',
    describe: v => `A non-boss target becomes a small harmless creature for ${secs(v.seconds ?? 5)}: it deals no damage and moves 50% slower, and damage after the first 1s turns it back.`,
  },
  wall: {
    phase: 'plan', reader: 'js/actors.js',
    describe(v) {
      const what = v.ring ? `a ring of wall ${m(v.radius ?? 6)} across` : `a ${m(v.length ?? 6)} wall across where you aim`;
      const bits = [];
      if (v.blocksMove !== false) bits.push('enemies cannot walk through it');
      if (v.blocksRanged) bits.push('enemy ranged hits through it are stopped');
      if (v.hp) bits.push(`it has ${pct(v.hp)} of your maximum health`);
      return `Raises ${what} for ${secs(v.seconds ?? 8)}${bits.length ? `: ${list(bits)}` : ''}.`;
    },
  },
  mimic: {
    phase: 'pet', reader: 'js/skillrun.js',
    describe: v => `Your summoned copies repeat every skill you cast from where they stand, for ${pct(num(v, 'mult') || 0.4)} of the damage.`,
  },
  howl: {
    phase: 'pet', reader: 'js/skillrun.js',
    describe(v, ctx) {
      const bits = [`${sname((typeof v.status === 'string' ? v.status : v.status?.id) || 'haste', ctx)} for ${secs(v.seconds ?? 6)}`];
      if (v.damage) bits.push(`${pct(v.damage)} more damage`);
      if (v.taunt) bits.push(`they draw every enemy within ${m(v.taunt.radius ?? 4)} of you for ${secs(v.taunt.seconds ?? 4)}`);
      return `With the pack already called, casting this is a howl instead: the pack gets ${list(bits)}.`;
    },
  },
  dashWith: {
    phase: 'pet', reader: 'js/skillrun.js',
    describe: () => 'Every follower within 15 m moves with you to where you land.',
  },
  rewind: {
    phase: 'plan', reader: 'js/skillrun.js',
    describe: v => `Returns your position${v.health === false ? '' : ' and health (only upward)'} to where they were ${secs(num(v, 'seconds') || 4)} ago.`,
  },
};

/** Labels for form ids in a skill's "Changes with your shape" sentence. Rows may name more. */
export const FORM_LABEL = {
  briarback: 'Briarback', fenrunner: 'Fenrunner', sporecap: 'Sporecap',
  open: 'Open stance', closed: 'Closed stance',
  fire: 'Fire Temper', frost: 'Frost Temper', storm: 'Storm Temper',
  valour: 'Ballad of Valour', ruin: 'Song of Ruin', mending: 'Air of Mending',
};

/**
 * P2 — keys that are part of the plan's vocabulary and are NOT built yet, with the file that will
 * read them. The audit allows a row to use one of these only while it is listed here, and lists
 * the rows that do, so nothing pending can ship pretending to work. A key comes OFF this list in
 * the same commit that gives it a reader.
 */
export const PENDING = {
  // empty: the P2 five (turned, wall, stasis, mimic, transform) landed in the engine's second pass.
  // A future mechanic goes here, with its reader, until it is built.
};

/** The keys in registry order. */
export const VOCAB_KEYS = Object.keys(VOCAB);
/** Keys a talent node's `mod` may carry beyond the vocabulary. */
export const MOD_STRUCT_KEYS = ['set', 'add', 'mul', 'forms', 'when'];

// ─────────────────────────────────────────────────────────────────────────────── describing

/** The plain `set`/`add`/`mul` of a sub-mod in words (Settle the Grudge's `atMax`). */
function modClauses(sub) {
  const out = [];
  const add = { pierce: n => `passes through ${fmt(n)} more targets`, chains: n => `jumps ${fmt(n)} more times`, projectiles: n => `looses ${fmt(n)} more projectiles`, radius: n => `reaches ${m(n)} further`, splash: n => `splashes ${m(n)} further` };
  for (const [k, n] of Object.entries(sub.add || {})) out.push(add[k] ? add[k](n) : `+${fmt(n)} ${k.replace(/\./g, ' ')}`);
  for (const [k, n] of Object.entries(sub.mul || {})) if (k === 'mult') out.push(`deals ${pct(Math.abs(n - 1))} ${n > 1 ? 'more' : 'less'} damage`);
  if (sub.set?.shape === 'around') out.push(`becomes a ring ${m(sub.set.radius ?? 6)} around you`);
  else if (sub.set?.shape === 'melee') out.push(`becomes a ${fmt((sub.set.arc ?? 1.5) * 180 / Math.PI, { decimals: 0 })}° strike in front of you`);
  else if (sub.set?.radius) out.push(`reaches ${m(sub.set.radius)}`);
  if (sub.set?.crit || sub.crit) out.push('is a certain critical hit');
  return out;
}

function describeSub(sub, ctx) {
  if (!sub) return '';
  const bits = [...modClauses(sub), ...describeVocab(sub, ctx).map(s => s.replace(/\.$/, ''))];
  if (sub.mult) {
    const el = sub.element && sub.element !== 'physical' ? ` as ${sub.element}` : '';
    const st = sub.status ? ` and applies ${statusPhrase(sub.status, ctx)}` : '';
    bits.unshift(sub.shape === 'melee'
      ? `strikes everything in a ${fmt((sub.arc ?? 1.5) * 180 / Math.PI, { decimals: 0 })}° arc ${m(sub.reach ?? 3)} in front of you for ${wd(sub.mult)}${el}${st}`
      : sub.radius
        ? `strikes everything within ${m(sub.radius)} of you for ${wd(sub.mult)}${el}${st}`
        : `strikes for ${wd(sub.mult)}${el}${st}`);
  }
  return bits.length ? bits.map(b => b.replace(/^On cast, /, '')).map(b => b.charAt(0).toLowerCase() + b.slice(1)).join('; ') : '';
}

function statBits(stats = {}) {
  const bits = [];
  if (stats.armorPct) bits.push(`${stats.armorPct > 0 ? '+' : ''}${pct(stats.armorPct)} armour`);
  if (stats.maxHpPct) bits.push(`+${pct(stats.maxHpPct)} maximum health`);
  if (stats.movePct) bits.push(`${stats.movePct > 0 ? '+' : ''}${pct(stats.movePct)} move speed`);
  if (stats.hastePct) bits.push(`${stats.hastePct > 0 ? '+' : ''}${pct(stats.hastePct)} attack speed`);
  if (stats.damage) bits.push(`${stats.damage > 0 ? '+' : ''}${pct(stats.damage)} damage`);
  if (stats.resist) bits.push(`take ${pct(stats.resist)} less damage`);
  if (stats.thorns) bits.push(`melee attackers take ${pct(stats.thorns)} of the hit back`);
  if (stats.healingPct) bits.push(`+${pct(stats.healingPct)} healing done`);
  if (stats.immune) bits.push(`immune to ${list([].concat(stats.immune))}`);
  if (stats.ccImmune) bits.push('cannot be knocked back or stunned');
  if (stats.stillResist) bits.push(`after standing still for ${secs(stats.stillResist.after ?? 1)}, take ${pct(stats.stillResist.resist ?? 0.2)} less damage`);
  if (stats.manaPerSecond) bits.push(`+${fmt(stats.manaPerSecond)} mana a second`);
  return bits;
}

function describeForm(f, ctx) {
  if (!f) return '';
  const opts = f.options || [f];
  const out = [];
  for (const o of opts) {
    const name = o.name || FORM_LABEL[o.id] || cap(o.id);
    const bits = statBits(o.stats);
    if (o.basic) {
      const b = o.basic;
      const what = b.shape === 'bolt' ? `a lobbed strike out to ${m(b.range ?? 14)} that splashes ${m(b.splash ?? 1.5)}` : `${(b.hits ?? 1) > 1 ? `${fmt(b.hits)} quick strikes` : 'a strike'} ${m(b.reach ?? 2.5)} in front of you`;
      bits.push(`your basic attack becomes ${what} for ${wd(b.mult ?? 1)}${(b.hits ?? 1) > 1 ? ' each' : ''}${b.status ? ` that applies ${sname(b.status, ctx)}` : ''}`);
    }
    if (o.aura) {
      const a = o.aura;
      const ab = [];
      if (a.buff) ab.push(`allies get ${statusPhrase(a.buff, ctx, { lasting: false })}`);
      if (a.debuff) ab.push(`enemies get ${statusPhrase(a.debuff, ctx, { lasting: false })}`);
      if (a.heal) ab.push(`allies heal ${pct(a.heal)} of maximum health a second`);
      if (ab.length) bits.push(`within ${m(a.radius ?? 10)} of you ${list(ab)}`);
    }
    if (o.basic?.behindStatus) bits.push(`a strike from behind applies ${sname(o.basic.behindStatus, ctx)}`);
    if (o.basic?.knock) bits.push(`your basic attack knocks targets ${m(num(o.basic.knock, 'push'))} back`);
    if (o.basic?.heal) bits.push(`each basic hit heals you ${pct(o.basic.heal)} of maximum health`);
    if (o.basic?.healAllies) bits.push(`an ally inside the splash heals ${pct(o.basic.healAllies)} of maximum health`);
    if (o.basic?.every) bits.push(`every ${ordinal(o.basic.every.n ?? 3)} basic hit adds ${fmt(o.basic.every.stack?.add ?? 2)} ${sname(o.basic.every.stack?.status, ctx)} stacks`);
    if (o.basic?.statuses) bits.push(`your basic attack also applies ${list([].concat(o.basic.statuses).map(r => statusPhrase(r, ctx)))}`);
    if (o.petBuff) {
      const pb = [];
      if (o.petBuff.resist) pb.push(`take ${pct(o.petBuff.resist)} less damage`);
      if (o.petBuff.damage) pb.push(`deal ${pct(o.petBuff.damage)} more damage`);
      if (o.petBuff.healPerSecond) pb.push(`heal ${pct(o.petBuff.healPerSecond)} of maximum health a second`);
      if (o.petBuff.biteStatus) pb.push(`their attacks apply ${sname(o.petBuff.biteStatus, ctx)}`);
      if (pb.length) bits.push(`your followers ${list(pb)}`);
    }
    if (o.threatDrop) bits.push(`entering it, enemies further than ${m(o.threatDrop.beyond ?? 10)} lose track of you`);
    if (o.onKillHaste) bits.push(`a kill while in it Hastens you for ${secs(o.onKillHaste)}`);
    if (o.firstCrit) bits.push('the first basic hit after entering it is a certain critical hit');
    if (o.element) bits.push(`skills that follow the temper deal ${o.element}${o.status ? ` and apply ${sname(o.status, ctx)}` : ''}`);
    let s = `${f.options ? '' : 'While in '}${name}${f.options ? '' : (f.group === 'shape' ? ' shape' : '')}: ${list(bits) || 'no change'}`;
    if (o.onEnter) s += `. Entering it: ${describeSub(o.onEnter, ctx) || 'nothing more'}`;
    if (o.onExit) s += `. Leaving it: ${describeSub(o.onExit, ctx) || 'nothing more'}`;
    if (o.finale) s += `. Switching away plays its Finale: ${describeSub(o.finale, ctx)}`;
    out.push(`${s}.`);
  }
  const head = f.cycle ? `Steps to the next of ${fmt(opts.length)}: ${list(opts.map(o => o.name || cap(o.id)))}.`
    : f.seconds ? `Lasts ${secs(f.seconds)}; casting it again ends it early.`
      : f.group === 'shape' ? 'Press again to return to your own body.'
        : f.group === 'song' ? 'Plays until you press it again or play another song.'
          : 'Press again to end it.';
  return [head, ...out].join(' ');
}

function describeSelfBuff(v, ctx) {
  const bits = statBits(v);
  if (v.resistPerFoe) bits.push(`take ${pct(v.resistPerFoe.per)} less damage for each enemy within ${m(v.resistPerFoe.radius ?? 6)}, up to ${pct(v.resistPerFoe.cap)}`);
  if (v.reflect) bits.push(`melee attackers take ${pct(v.reflect)} of the hit back`);
  if (v.frontalResist) bits.push(`take ${pct(v.frontalResist)} less damage from the front`);
  if (v.manaOnHurt) bits.push(`each hit you take restores ${fmt(v.manaOnHurt)} mana`);
  if (v.stacksOnAttacker) bits.push(`every melee attacker that hits you takes ${fmt(v.stacksOnAttacker.add ?? 1)} ${sname(v.stacksOnAttacker.status, ctx)} stack${(v.stacksOnAttacker.add ?? 1) === 1 ? '' : 's'}`);
  if (v.deathPreventOnce) bits.push(`the first killing blow leaves you at 1 health and ends it${v.deathPreventOnce.burst ? ` with a ${m(v.deathPreventOnce.burst.radius ?? 6)} blast for ${wd(v.deathPreventOnce.burst.mult ?? 3)}` : ''}`);
  if (v.resistPerFoe?.lowHp) bits.push(`below ${pct(v.resistPerFoe.lowHp)} health the per-enemy reduction doubles`);
  if (v.petsShare) bits.push(`followers within 8 m get ${pct(v.petsShare)} of it`);
  if (v.deathPrevent) bits.push('cannot drop below 1 health');
  if (v.cdRate) bits.push(`your cooldowns run ${fmt(v.cdRate)} times as fast`);
  if (v.dotRate) bits.push(`the statuses you apply tick ${fmt(v.dotRate)} times as fast`);
  if (v.evade) bits.push(`${pct(v.evade)} of attacks on you miss`);
  if (v.untargetable) bits.push('enemies cannot target you');
  if (v.frontal) bits.push('only against hits from the front');
  if (v.perCastHp) bits.push(`every skill cast costs ${pct(v.perCastHp)} of your maximum health`);
  if (v.noMana) bits.push('skills cost no mana');
  if (v.every) bits.push(`every ${ordinal(v.every.hits ?? 4)} hit you take releases a ${m(v.every.radius ?? 4)} shockwave for ${wd(v.every.mult ?? 0.8)}${v.every.taunt ? ` that taunts what it hits for ${secs(v.every.taunt)}` : ''}`);
  if (v.storeShare) bits.push(`${pct(v.storeShare)} of the damage you take is stored and released within ${m(v.storeRadius ?? 6)} when it ends`);
  if (v.onEnd) bits.push(`when it ends ${describeSub(v.onEnd, ctx)}`);
  if (v.onKill) {
    const k = v.onKill, kb = [];
    if (k.heal) kb.push(`heals you ${pct(k.heal)} of maximum health`);
    if (k.mana) kb.push(`restores ${pct(k.mana)} of maximum mana`);
    if (k.resource) kb.push(`gives ${fmt(k.resource.n ?? 1)} ${cap(k.resource.id)}`);
    if (k.haste) kb.push(`Hastens you for ${secs(k.haste)}`);
    if (k.reset) kb.push(`resets ${skillName(k.reset, ctx)}`);
    if (kb.length) bits.push(`each kill ${list(kb)}`);
  }
  const who = v.petsOnly ? ', your followers' : v.pets ? ', you and every follower' : '';
  return `For ${secs(v.seconds ?? 8)}${who}: ${bits.join('; ') || 'empowered'}.`;
}

/**
 * R28 — a talent's DOTTED `set` (`form.stats.armorPct`, `selfBuff.every.taunt`) in words. A shape
 * talent changes one number deep inside the form block, and "No change" is not an answer.
 */
export function describeSetPath(path, v, ctx = {}) {
  const parts = path.split('.');
  const leaf = parts[parts.length - 1];
  if (parts[0] === 'form') {
    const where = parts[1];
    if (where === 'stats') {
      const b = statBits({ [leaf]: v });
      return b.length ? `In the form: ${b.join(', ')}` : '';
    }
    if (where === 'seconds') return `The form lasts ${secs(v)}`;
    if (where === 'basic') {
      if (leaf === 'knock') return `The basic attack knocks targets ${m(num(v, 'push'))} back`;
      if (leaf === 'heal') return `Each basic hit heals you ${pct(v)} of maximum health`;
      if (leaf === 'splash') return `The basic attack splashes ${m(v)}`;
      if (leaf === 'every') return `Every ${ordinal(v.n ?? 3)} basic hit adds ${fmt(v.stack?.add ?? 2)} ${sname(v.stack?.status, ctx)} stacks, up to ${fmt(v.stack?.max ?? 5)}`;
      if (leaf === 'statuses') return `The basic attack also applies ${list([].concat(v).map(r => statusPhrase(r, ctx)))}`;
      return '';
    }
    if (where === 'petBuff') {
      const pb = [];
      if (v.resist) pb.push(`take ${pct(v.resist)} less damage`);
      if (v.damage) pb.push(`deal ${pct(v.damage)} more damage`);
      if (v.healPerSecond) pb.push(`heal ${pct(v.healPerSecond)} of maximum health a second`);
      if (v.biteStatus) pb.push(`apply ${sname(v.biteStatus, ctx)} with every attack`);
      return `While in the form, your followers ${list(pb)}`;
    }
    if (where === 'aura') {
      if (leaf === 'radius') return `The aura reaches ${m(v)}`;
      if (leaf === 'heal') return `Allies in the aura heal ${pct(v)} of maximum health a second`;
      if (leaf === 'buff') return `Allies in the aura get ${statusPhrase(v, ctx, { lasting: false })}`;
      if (leaf === 'debuff') return `Enemies in the aura get ${statusPhrase(v, ctx, { lasting: false })}`;
      return '';
    }
    if (where === 'finale') return `The Finale: ${describeSub(v, ctx) || 'changes'}`;
    if (parts.length >= 3 && where !== 'stats' && FORM_LABEL[where] && parts[2] === 'stats') {
      const b = statBits({ [leaf]: v });
      return b.length ? `In ${FORM_LABEL[where]}: ${b.join(', ')}` : '';
    }
    if (where === 'onKillHaste') return `A kill while in the form Hastens you for ${secs(v)}, up to ${secs(v * 3)} on a streak`;
    if (where === 'firstCrit') return 'The first basic hit after entering the form is a certain critical hit';
    if (where === 'onEnter' || where === 'onExit') {
      const when = where === 'onEnter' ? 'Entering the form' : 'Leaving the form';
      if (parts.length === 2) return `${when}: ${describeSub(v, ctx)}`;
      const k = parts[2];
      if (k === 'dash') return `${when} ${v.leap ? 'leaps' : 'charges'} up to ${m(v.range ?? 8)} ${v.to === 'target' ? 'onto the aimed enemy' : 'toward where you aim'}${v.land ? `, striking everything within ${m(v.land.radius ?? 2.5)} for ${wd(v.land.mult ?? 1)} on landing` : ''}`;
      if (k === 'pool') return `${when} leaves a ${m(v.radius ?? 3)} patch for ${secs(v.seconds ?? 3)}${v.slow ? ` that slows anything in it ${pct(v.slow)}` : ''}`;
      if (k === 'place') return `${when} plants a ${m(v.radius ?? 6)} ring for ${secs(v.seconds ?? 10)}${v.heal ? ` that heals allies inside ${pct(v.heal)} of maximum health every ${secs(v.every ?? 1)}` : ''}`;
      if (k === 'burst') return `${when}: the burst ${leaf === 'radius' ? `reaches ${m(v)}` : leaf === 'mult' ? `deals ${wd(v)}` : 'changes'}`;
      if (k === 'shape' || k === 'mult') return '';
      return '';
    }
    return '';
  }
  if (parts[0] === 'selfBuff') {
    if (path === 'selfBuff.resistPerFoe.lowHp') return `Below ${pct(v)} health, the per-enemy reduction doubles`;
    if (path === 'selfBuff.every.taunt') return `The shockwave taunts what it hits for ${secs(v)}`;
    const b = statBits({ [leaf]: v });
    return b.length ? `While it lasts: ${b.join(', ')}` : '';
  }
  return '';
}

/**
 * Every vocabulary sentence for a row (or a node's mod), in registry order. `ctx` carries
 * `statuses` and `skills` so a tag reads "Quarry" and a skill reads "War Cry".
 */
export function describeVocab(row, ctx = {}) {
  const out = [];
  if (!row) return out;
  for (const key of VOCAB_KEYS) {
    const v = row[key];
    if (v == null || v === false) continue;
    // `repeats` and `barrier` are also legacy scalar fields the base sentence already covers
    if ((key === 'repeats' || key === 'barrier') && typeof v === 'number') continue;
    try {
      const s = VOCAB[key].describe(v, ctx);
      if (s) out.push(s);
    } catch { /* a malformed value is the audit's job, never a crash on the card */ }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────── normalising

/** `repeats` may be a number (R25) or `{ count, every, grow, scatter, alternate, target }`. */
export function repeatsOf(row) {
  const r = row?.repeats;
  if (r && typeof r === 'object') return { count: Math.max(1, r.count || 1), every: r.every ?? row.repeatEvery ?? 0.32, ...r, count2: undefined };
  return { count: Math.max(1, r || 1), every: row?.repeatEvery ?? 0.32 };
}

/** Fields that only mean something on one shape — cleared when a form override changes the shape. */
export const SHAPE_FIELDS = {
  melee: ['reach', 'arc', 'breath'],
  around: ['radius'],
  bolt: ['range', 'splash', 'projectiles', 'spread', 'pierce', 'chains', 'chainFalloff', 'homing'],
  beam: ['range', 'width'],
  ground: ['range', 'radius', 'delay', 'weather', 'pull'],
  dash: ['range', 'splash', 'dash'],
  summon: ['pet', 'count'],
  self: ['trail', 'orbs'],
};

/** Read a dotted path (`repeats.count`) off an object. */
function getPath(o, path) {
  return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
}
function setPath(o, path, v) {
  const keys = path.split('.');
  let a = o;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (a[k] == null || typeof a[k] !== 'object') a[k] = typeof a[k] === 'number' && keys[i + 1] === 'count' ? { count: a[k] } : {};
    else a[k] = Array.isArray(a[k]) ? [...a[k]] : { ...a[k] };
    a = a[k];
  }
  a[keys[keys.length - 1]] = v;
}

/**
 * Fold one talent node's `mod` (or a form's override) into a plan. Pure; returns a new object.
 *
 *   set   fields replaced (`shape`, `arc`, `element`, `status`…)
 *   add   numbers added, dotted paths allowed (`repeats.count`, `charges.max`, `knock.push`)
 *   mul   numbers multiplied (`mult`, `cooldown`, `radius`, `heal`…)
 *   forms `{ formId: mod }`, applied only while that form is active (`ctx.forms` = active ids)
 *   when  `{ form }` / `{ resourceAtLeast: [id, n] }` — the whole node applies only then
 *   any VOCAB key at the top level — merged: objects shallow-merged key by key, scalars replaced
 */
export function applyMod(plan, mod, ctx = {}) {
  if (!mod) return plan;
  if (mod.when) {
    const w = mod.when;
    if (w.form && !(ctx.forms || []).includes(w.form)) return plan;
    if (w.resourceAtLeast && resourceOf(ctx.player, w.resourceAtLeast[0]) < w.resourceAtLeast[1]) return plan;
  }
  const out = { ...plan };
  if (mod.set) {
    for (const [k, v] of Object.entries(mod.set)) {
      if (k === 'shape' && v !== out.shape) {
        // a new shape clears the old shape's own fields, so a bolt turned melee does not keep a splash
        for (const f of SHAPE_FIELDS[out.shape] || []) if (!(SHAPE_FIELDS[v] || []).includes(f) && !(f in mod.set)) delete out[f];
        out.kind = v;
      }
      if (k.includes('.')) setPath(out, k, v); else out[k] = v;
    }
  }
  if (mod.add) {
    for (const [k, v] of Object.entries(mod.add)) {
      if (k.includes('.')) {
        const was = getPath(out, k);
        // `repeats.count` on a scalar `repeats`
        const base = k.startsWith('repeats.') && typeof out.repeats === 'number' ? (setPath(out, k, out.repeats), out.repeats) : null;
        setPath(out, k, (typeof was === 'number' ? was : (base?.count ?? 0)) + v);
      } else if (k === 'repeats' && typeof out.repeats === 'object') out.repeats = { ...out.repeats, count: (out.repeats.count || 1) + v };
      else out[k] = (out[k] || 0) + v;
    }
  }
  if (mod.mul) {
    for (const [k, v] of Object.entries(mod.mul)) {
      if (k.includes('.')) { const was = getPath(out, k); if (typeof was === 'number') setPath(out, k, was * v); continue; }
      if (typeof out[k] === 'number') out[k] *= v;
      if (k === 'mult' && typeof out.damage === 'number') out.damage = Math.max(1, Math.round(out.damage * v));
      if (k === 'mult' && typeof out.heal === 'number' && out.heal) out.heal = Math.max(1, Math.round(out.heal * v));
    }
  }
  for (const key of VOCAB_KEYS) {
    if (!(key in mod)) continue;
    const v = mod[key];
    const was = out[key];
    if (key === 'repeats' && typeof was === 'number' && v && typeof v === 'object') out[key] = { count: was, every: out.repeatEvery ?? 0.32, ...v };
    else if (v && typeof v === 'object' && !Array.isArray(v) && was && typeof was === 'object' && !Array.isArray(was)) out[key] = { ...was, ...v };
    else if (Array.isArray(v) && Array.isArray(was)) out[key] = [...was, ...v];
    else out[key] = v;
  }
  for (const key of Object.keys(PENDING)) if (key in mod) out[key] = mod[key];
  if (mod.forms) {
    for (const id of ctx.forms || []) if (mod.forms[id]) Object.assign(out, applyMod(out, mod.forms[id], { ...ctx, forms: [] }));
  }
  return out;
}

/** Every key a mod (or a row) uses, flattened through set/add/mul/forms — for the audit. */
export function keysOf(obj) {
  const keys = new Set();
  if (!obj || typeof obj !== 'object') return keys;
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'forms' && v && typeof v === 'object') { for (const sub of Object.values(v)) for (const kk of keysOf(sub)) keys.add(kk); continue; }
    if (k === 'set' || k === 'add' || k === 'mul') { for (const kk of Object.keys(v || {})) keys.add(kk.split('.')[0]); continue; }
    keys.add(k);
  }
  return keys;
}

// ─────────────────────────────────────────────────────────────────────────────── forms

/**
 * FORMS: druid shapes, fighter stances, dragon-knight tempers and bard songs are ONE mechanism.
 *
 * `player.forms` is `{ group: { id, group, skill, spec, left } }` — one per exclusive group, so a
 * custom character may hold a stance AND a song. Never saved (plan §7 rule 6): a load starts in
 * your own body. A form's `stats` ride as a status `form:<id>` on the player, so they reach the
 * damage path through `buffsOf` and the sheet through js/rpg.js `derive` (armorPct, maxHpPct…).
 */
export function activeForms(player) {
  return Object.values(player?.forms || {}).filter(Boolean);
}
export function formIds(player) { return activeForms(player).map(f => f.id); }
export function formOf(player, group = null) {
  if (!player?.forms) return null;
  if (group) return player.forms[group] || null;
  return player.forms.shape || activeForms(player)[0] || null;
}

/** The option a form skill would enter next (a cycle steps; a toggle enters its own). */
export function nextOption(formSpec, player) {
  const opts = formSpec.options || [formSpec];
  const now = player?.forms?.[formSpec.group];
  if (formSpec.cycle) {
    const at = opts.findIndex(o => o.id === now?.id);
    return opts[(at + 1) % opts.length];
  }
  return opts[0];
}

function statusKeyFor(id) { return `form:${id}`; }

/**
 * Enter (or toggle out of) a form. Returns `{ entered, left }` — the option entered and the form it
 * replaced — or `{ refused }`.
 */
export function toggleForm(player, skillId, formSpec) {
  if (!player || !formSpec) return { refused: 'No such form.' };
  const group = formSpec.group || 'shape';
  player.forms = player.forms || {};
  const now = player.forms[group];
  // a timed form in the group locks the toggles out until it ends (Sporecap)
  if (now?.seconds && now.skill !== skillId) return { refused: `${now.name} has ${secs(Math.max(0, now.left))} left.` };
  if (!formSpec.cycle && now && now.skill === skillId) {
    const left = leaveForm(player, group, 'toggle');
    return { entered: null, left };
  }
  let opt = nextOption(formSpec, player);
  /**
   * A talent on a CYCLING form (a stance, a temper) writes either to one option by id —
   * `form.open.stats.damage` — or to `form.stats`, which every option adds to its own.
   */
  if (formSpec.options) {
    if (formSpec[opt.id] && typeof formSpec[opt.id] === 'object') opt = deepMerge(opt, formSpec[opt.id]);
    if (formSpec.stats) {
      const st = { ...(opt.stats || {}) };
      for (const [k, v] of Object.entries(formSpec.stats)) st[k] = typeof v === 'number' ? (st[k] || 0) + v : v;
      opt = { ...opt, stats: st };
    }
  }
  const left = now ? leaveForm(player, group, 'swap') : null;
  const form = {
    id: opt.id, group, skill: skillId, name: opt.name || FORM_LABEL[opt.id] || cap(opt.id),
    spec: { ...formSpec, ...opt }, seconds: formSpec.seconds || 0, left: formSpec.seconds || Infinity,
  };
  player.forms[group] = form;
  player.statuses = player.statuses || {};
  const st = opt.stats || {};
  player.statuses[statusKeyFor(opt.id)] = {
    type: statusKeyFor(opt.id), remaining: Infinity, power: 1, name: form.name, kind: 'form',
    damage: st.damage || 0, resist: st.resist || 0, armorPct: st.armorPct || 0, maxHpPct: st.maxHpPct || 0,
    movePct: st.movePct || 0, hastePct: st.hastePct || 0, thorns: st.thorns || 0, healingPct: st.healingPct || 0,
    ccImmune: !!st.ccImmune, immune: st.immune || null, slow: 0, perSecond: 0, healPerSecond: 0,
  };
  // and any other stat the form names (stillResist, manaPerSecond…) rides as written
  for (const [k, v] of Object.entries(st)) if (!(k in player.statuses[statusKeyFor(opt.id)])) player.statuses[statusKeyFor(opt.id)][k] = v;
  form.firstCritPending = !!opt.firstCrit;
  player.mechDirty = true;
  return { entered: form, left };
}

function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a?.[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? deepMerge(a[k], v) : v;
  }
  return out;
}

/** Leave whatever form is in `group`. Returns the form left (its spec carries `onExit`/`finale`). */
export function leaveForm(player, group = 'shape', why = 'toggle') {
  const now = player?.forms?.[group];
  if (!now) return null;
  delete player.forms[group];
  if (player.statuses) delete player.statuses[statusKeyFor(now.id)];
  player.mechDirty = true;
  return { ...now, why };
}

/** Leave every shape — mounting, deep water, a gather, build mode. Returns what was left. */
export function leaveShapes(player, why) {
  const out = [];
  for (const f of activeForms(player)) if (f.group === 'shape') out.push(leaveForm(player, 'shape', why));
  return out.filter(Boolean);
}

/** Count timed forms down. Returns the forms that ran out. */
export function tickForms(player, dt) {
  const out = [];
  for (const f of activeForms(player)) {
    if (!f.seconds) continue;
    f.left -= dt;
    if (f.left <= 0) out.push(leaveForm(player, f.group, 'expired'));
  }
  return out;
}

/**
 * The row a skill casts while a form is active: `row.forms[formId]` laid over the row. A shape
 * change clears the old shape's own fields (SHAPE_FIELDS). Shallow by design (plan §4.5).
 */
export function resolveForm(row, player) {
  if (!row?.forms) return row;
  for (const id of formIds(player)) {
    const o = row.forms[id];
    if (!o) continue;
    const out = { ...row, ...o, formId: id, baseName: row.name };
    if (o.shape && o.shape !== row.shape) {
      for (const f of SHAPE_FIELDS[row.shape] || []) if (!(f in o) && !(SHAPE_FIELDS[o.shape] || []).includes(f)) delete out[f];
    }
    // the base row's per-shape status/talent bits that the override did not restate stay
    delete out.forms;
    return out;
  }
  return row;
}

/**
 * What a form-driven element resolves to (`elementFrom: 'temper' | 'song'`). Falls back to the
 * row's own element, so the data always carries a real one (tests pin a few).
 */
export function elementFromForms(row, player) {
  if (!row?.elementFrom || row.elementFrom === 'cycle') return null;
  const f = player?.forms?.[row.elementFrom];
  if (!f) return null;
  return { element: f.spec.element || row.element, status: f.spec.status || row.status || null };
}

/** The sum of every form/self status's sheet stats, for js/rpg.js `derive`. */
export function statusStats(unit) {
  const out = { armorPct: 0, maxHpPct: 0, movePct: 0, hastePct: 0, thorns: 0, healingPct: 0 };
  for (const st of Object.values(unit?.statuses || {})) {
    for (const k of Object.keys(out)) out[k] += st[k] || 0;
    /**
     * A BUFF'S `haste` AND `move` WERE NEVER READ for the player: Quicken promised "attack 45%
     * faster and move 30% faster" and the sheet never moved, because js/rpg.js `derive` reads no
     * status at all. They count here now, as shares, the same as a form's stats.
     */
    if (st.kind === 'buff') { out.hastePct += st.haste || 0; out.movePct += st.move || 0; }
  }
  return out;
}

/** A cheap signature of the sheet stats statuses give, so the runtime can refresh when it changes. */
export function statusStatsKey(unit) {
  const s = statusStats(unit);
  return `${s.armorPct.toFixed(3)}|${s.maxHpPct.toFixed(3)}|${s.movePct.toFixed(3)}|${s.hastePct.toFixed(3)}|${s.thorns.toFixed(3)}|${s.healingPct.toFixed(3)}`;
}

// ─────────────────────────────────────────────────────────────────────────────── resources

export const RESOURCE_MAX = 5;
/** Flair, Poise, Grudge. Max 5 (a talent may raise it to 7). Runtime only — never saved. */
export function resourceOf(player, id) { return player?.mech?.res?.[id]?.n || 0; }
export function resourceMax(player, id) { return player?.mech?.res?.[id]?.max || RESOURCE_MAX; }
function mech(player) {
  if (!player.mech) player.mech = { res: {}, idle: 0 };
  return player.mech;
}
export function gainResource(player, id, n = 1, { max = null } = {}) {
  if (!player || !id || !(n > 0)) return 0;
  const r = mech(player).res[id] || (mech(player).res[id] = { n: 0, max: RESOURCE_MAX, decay: 0 });
  if (max) r.max = Math.max(r.max, max);
  const before = r.n;
  r.n = Math.min(r.max, r.n + n);
  r.decay = 0;
  return r.n - before;
}
export function spendResource(player, id, n = 'all') {
  const r = player?.mech?.res?.[id];
  if (!r) return 0;
  const take = n === 'all' ? r.n : Math.min(r.n, n);
  r.n -= take;
  return take;
}
/** One point drains every 8 s while you are out of a fight. */
export function tickResources(player, dt, { fighting = false } = {}) {
  for (const r of Object.values(player?.mech?.res || {})) {
    if (fighting || r.n <= 0) { r.decay = 0; continue; }
    r.decay += dt;
    if (r.decay >= 8) { r.decay = 0; r.n = Math.max(0, r.n - 1); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────── the world lists

/**
 * Placed objects, traps and corpses — the new per-frame lists, with the caps the plan's risk
 * section sets (24 placed, 30 traps, 40 corpses; the oldest goes first).
 */
export const CAPS = { placed: 24, traps: 30, corpses: 40, corpseSeconds: 20 };
export const world = { placed: [], corpses: [], walls: [], nextId: 1 };
export function resetWorld() { world.placed.length = 0; world.corpses.length = 0; world.walls.length = 0; }

/** Do segments ab and cd cross? */
function segCross(ax, az, bx, bz, cx, cz, dx, dz) {
  const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d;
  const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
/**
 * P2 `wall`: a segment (or a ring) enemies cannot walk through and enemy shots cannot pass.
 * `spec` = { x1, z1, x2, z2 } or { ring: { x, z, r } }, plus `left`, `hp`, `blocksMove`, `blocksRanged`.
 */
export function addWall(spec) {
  const w = { id: world.nextId++, blocksMove: true, ...spec };
  world.walls.push(w);
  return w;
}
export function tickWalls(dt) {
  const gone = [];
  for (let i = world.walls.length - 1; i >= 0; i--) {
    const w = world.walls[i];
    w.left -= dt;
    if (w.left <= 0 || (w.hp != null && w.hp <= 0)) gone.push(...world.walls.splice(i, 1));
  }
  return gone;
}
/** Does a step from (x0,z0) to (x1,z1) cross a standing wall? Read by js/actors.js movement. */
export function crossesWall(x0, z0, x1, z1, { ranged = false } = {}) {
  for (const w of world.walls) {
    if (ranged ? !w.blocksRanged : w.blocksMove === false) continue;
    if (w.ring) {
      const a = Math.hypot(x0 - w.ring.x, z0 - w.ring.z) <= w.ring.r;
      const b = Math.hypot(x1 - w.ring.x, z1 - w.ring.z) <= w.ring.r;
      if (a !== b) return w;
    } else if (segCross(x0, z0, x1, z1, w.x1, w.z1, w.x2, w.z2)) return w;
  }
  return null;
}

/** A body fell: leave a corpse marker (necromancers spend them). */
export function addCorpse(x, z, worth = 1) {
  world.corpses.push({ x, z, worth, left: CAPS.corpseSeconds });
  while (world.corpses.length > CAPS.corpses) world.corpses.shift();
}
/** Take up to `max` corpses' worth within `r` of a point, nearest first. */
export function takeCorpses(x, z, r, max = Infinity) {
  const near = world.corpses.map((c, i) => ({ c, i, d: Math.hypot(c.x - x, c.z - z) }))
    .filter(o => o.d <= r).sort((a, b) => a.d - b.d);
  const out = [];
  let worth = 0;
  for (const o of near) {
    if (worth >= max) break;
    out.push(o.c);
    worth += o.c.worth;
  }
  world.corpses = world.corpses.filter(c => !out.includes(c));
  return out;
}

/**
 * Put an object down. `spec` is the `place` block; `owner` is the skill id. `max` keeps only that
 * many of this skill's objects (oldest removed). Returns the object, with `removed` listing what
 * the cap pushed out so the caller can take their meshes down.
 */
export function placeObject(spec, { x, z, owner, follow = null, power = 1, element = 'physical', ownerHp = 100, rules = null } = {}) {
  const obj = {
    id: world.nextId++, owner, kind: spec.kind || 'pulse', x, z, follow,
    r: spec.radius ?? 5, left: spec.seconds ?? 8, life: spec.seconds ?? 8,
    every: spec.every ?? 1, next: spec.kind === 'trap' ? 0 : 0, armed: spec.kind === 'trap' ? (spec.arm ?? 1) : 0,
    spec, power, element, rules,
    hp: spec.hp ? Math.round(spec.hp * ownerHp) : null, maxHp: spec.hp ? Math.round(spec.hp * ownerHp) : null,
    inside: new Set(), pulses: 0,
  };
  const removed = [];
  if (spec.max) {
    const same = world.placed.filter(o => o.owner === owner);
    while (same.length >= spec.max) { const old = same.shift(); removed.push(old); world.placed.splice(world.placed.indexOf(old), 1); }
  }
  world.placed.push(obj);
  const isTrap = o => o.kind === 'trap';
  for (;;) {
    const traps = world.placed.filter(isTrap), posts = world.placed.filter(o => !isTrap(o));
    const over = traps.length > CAPS.traps ? traps[0] : posts.length > CAPS.placed ? posts[0] : null;
    if (!over || over === obj) break;
    removed.push(over);
    world.placed.splice(world.placed.indexOf(over), 1);
  }
  obj.removed = removed;
  return obj;
}

/**
 * ONE STEP OF EVERY PLACED OBJECT. Pure: it decides, the caller acts. `env`:
 *   enemies()           live enemy bodies `{x, z, dying}`
 *   allies()            the player and live followers `{x, z, hp, maxHp}`
 *   at(follow)          where a following object stands now (`self`, or a body)
 * Returns `[{ obj, kind: 'strike'|'heal'|'buff'|'debuff'|'knockOut'|'pull'|'edge'|'trap'|'expire', targets }]`.
 */
export function tickPlaced(dt, env) {
  const acts = [];
  for (let i = world.placed.length - 1; i >= 0; i--) {
    const o = world.placed[i];
    if (o.follow) {
      const at = env.at?.(o.follow);
      if (at) { o.x = at.x; o.z = at.z; } else if (o.follow !== 'self') o.follow = null;
    }
    o.left -= dt;
    if (o.left <= 0 || (o.maxHp != null && o.hp <= 0)) {
      world.placed.splice(i, 1);
      acts.push({ obj: o, kind: 'expire', targets: [] });
      continue;
    }
    const enemies = (env.enemies?.() || []).filter(e => e.dying == null && !e.removed);
    const inR = (e, r = o.r) => Math.hypot(e.x - o.x, e.z - o.z) <= r + (e.reach || 2) * 0.25;
    if (o.kind === 'trap') {
      if (o.armed > 0) { o.armed -= dt; continue; }
      const hit = enemies.find(e => inR(e, o.spec.triggerRadius ?? 2));
      if (hit) {
        world.placed.splice(i, 1);
        acts.push({ obj: o, kind: 'trap', targets: enemies.filter(e => inR(e, o.r)) });
      }
      continue;
    }
    // zones refresh what they hang on every second; pulses fire on their own clock
    const s = o.spec;
    if (s.edge) {
      const now = new Set(enemies.filter(e => inR(e)).map(e => e));
      const crossed = enemies.filter(e => now.has(e) !== o.inside.has(e) && Math.abs(Math.hypot(e.x - o.x, e.z - o.z) - o.r) < 3);
      if (crossed.length) acts.push({ obj: o, kind: 'edge', targets: crossed });
      o.inside = now;
    }
    o.next -= dt;
    if (o.next > 0) continue;
    o.next = o.every * (o.rate ? 1 / o.rate : 1);
    o.pulses++;
    const inside = enemies.filter(e => inR(e));
    if (s.strike) {
      let targets = inside;
      const n = s.strike.targets ?? (s.strike.all ? Infinity : 1);
      if (s.strike.nearest !== false) targets = [...inside].sort((a, b) => Math.hypot(a.x - o.x, a.z - o.z) - Math.hypot(b.x - o.x, b.z - o.z));
      else targets = [...inside].sort(() => (env.rng?.() ?? Math.random()) - 0.5);
      if (s.strike.distinct) targets = targets.filter(e => !(o.struck || (o.struck = new Set())).has(e));
      targets = targets.slice(0, n);
      if (s.strike.distinct) for (const t of targets) o.struck.add(t);
      if (targets.length) acts.push({ obj: o, kind: 'strike', targets });
    }
    if (s.heal) {
      const allies = (env.allies?.() || []).filter(a => (a.hp ?? 1) > 0 && Math.hypot(a.x - o.x, a.z - o.z) <= o.r);
      if (allies.length) acts.push({ obj: o, kind: 'heal', targets: allies });
    }
    if (s.buff || s.barrierTick) {
      const allies = (env.allies?.() || []).filter(a => (a.hp ?? 1) > 0 && Math.hypot(a.x - o.x, a.z - o.z) <= o.r);
      if (allies.length) acts.push({ obj: o, kind: 'buff', targets: allies });
    }
    if (s.debuff && inside.length) acts.push({ obj: o, kind: 'debuff', targets: inside });
    if (s.knockOut && inside.length) acts.push({ obj: o, kind: 'knockOut', targets: inside });
    if (s.pull && inside.length) acts.push({ obj: o, kind: 'pull', targets: inside });
  }
  return acts;
}

/** Is this body inside a placed zone that negates enemy ranged hits on it? (Null Circle, Sanctuary.) */
export function blocksRanged(target, from = null) {
  if (!target) return false;
  if (from && crossesWall(from.x, from.z, target.x, target.z, { ranged: true })) return true;
  return world.placed.some(o => o.spec.blocksRanged && Math.hypot(target.x - o.x, target.z - o.z) <= o.r);
}

/** Every placed object that a skill hit within `radius` of rings (The Great Anvil's `ringOn`). */
export function ringsFor(skillId, x, z) {
  return world.placed.filter(o => o.spec.ringOn?.skill === skillId && Math.hypot(x - o.x, z - o.z) <= (o.spec.ringOn.radius ?? 8));
}

// ─────────────────────────────────────────────────────────────────────────────── statuses (enemy)

/** A status the plan made new this round, read where actors/strike decide what a body can do. */
export const isRooted = e => !!(e?.statuses?.root);
export const isAsleep = e => !!(e?.statuses?.sleep);
export const isSilenced = e => !!(e?.statuses?.silence);
export const isDisarmed = e => !!(e?.statuses?.disarm);
export const isFeared = e => !!(e?.statuses?.fear);
export const isStripped = e => !!(e?.statuses?.strip);

/** Bosses are never slept, feared or turned (a slow instead); champions and rares get half. */
export function controlFor(e, statusId, seconds) {
  const hard = ['sleep', 'fear', 'turned', 'stasis', 'transmuted'];
  if (e?.boss && hard.includes(statusId)) return { id: 'chill', seconds: Math.min(seconds, 3), slow: 0.6 };
  if (e?.boss && statusId === 'root') return { id: 'chill', seconds, slow: 0.6 };
  if (e?.rank && e.rank !== 'normal' && hard.includes(statusId)) return { id: statusId, seconds: seconds * 0.5 };
  return { id: statusId, seconds };
}

/**
 * Stack a counter or a stacking status on a body. Counters (`kind: 'counter'`) carry `onMax`:
 * `{ stagger }` (Frozen) or `{ detonate: { mult, knock, radius } }` (a Runesmith rune). Returns
 * `{ stacks, maxed, onMax }` so the caller can pay out a detonation.
 */
export function addStacks(target, id, spec, { add = 1, max = 5, power = 1 } = {}) {
  if (!target || !spec) return { stacks: 0 };
  target.statuses = target.statuses || {};
  const was = target.statuses[id];
  const stacks = Math.min(max, (was?.stacks || 0) + add);
  const entry = {
    ...(was || {}), type: id, name: spec.name, kind: spec.kind, element: spec.element,
    remaining: Math.max(was?.remaining || 0, spec.seconds ?? 6),
    stacks, perStack: spec.perSecond ?? 0, perSecond: (spec.perSecond ?? 0) * stacks,
    slow: Math.min(0.9, (spec.slowPerStack ?? 0) * stacks + (spec.slow ?? 0)),
    power: Math.max(was?.power || 0, power),
    takeMore: (spec.takeMorePerStack ?? 0) * stacks + (spec.takeMore ?? 0),
  };
  target.statuses[id] = entry;
  if (spec.onMax && stacks >= max) {
    delete target.statuses[id];
    if (spec.onMax.stagger) {
      target.stagger = Math.max(target.stagger || 0, spec.onMax.stagger);
      target.frozenUntil = spec.onMax.stagger;
    }
    return { stacks, maxed: true, onMax: spec.onMax, fresh: !was };
  }
  return { stacks, maxed: false, fresh: !was };
}

/** What is left to pay on a body's damage-over-time statuses, in raw damage. */
export function remainingDot(target, types) {
  let total = 0;
  for (const t of types) {
    const st = target?.statuses?.[t];
    if (!st || !st.perSecond) continue;
    total += st.perSecond * (st.power || 1) * Math.max(0, st.remaining);
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────── hits

/**
 * The env the hit rules act through, installed once by js/main.js (`setMechEnv`). Pure tests set
 * a fake one. Everything here is optional; a missing piece means that part of a rule is skipped.
 *   near(x,z,r,except)  allies()  healAlly(unit, amount)  statusSpec(id)  applyStatus(t,id,spec,power)
 *   strikeArea(x,z,r,{power,element})  push(e,fromX,fromZ,metres)  later(ms,fn)  rng()
 */
let ENV = {};
export function setMechEnv(env) { ENV = env || {}; }
export function mechEnv() { return ENV; }

function behind(attacker, defender) {
  if (attacker?.x == null || defender?.x == null) return false;
  const away = Math.atan2(attacker.x - defender.x, attacker.z - defender.z);
  const delta = Math.abs(((away - (defender.facing || 0) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  return delta > (100 * Math.PI / 180);
}

/**
 * BEFORE THE DICE: what a skill's own rules do to this one hit. Returns `{ mult, pen, crit }`
 * (`crit: true` forces one). `ctx.hits` is how many bodies this strike has hit so far (crowd).
 */
export function hitFactor(rules, attacker, defender, ctx = {}) {
  const out = { mult: 1, pen: 0, crit: false };
  if (!rules) return out;
  if (rules.pen) out.pen = Math.max(out.pen, rules.pen);
  const isBehind = rules.behind || behind(attacker, defender) || Object.values(defender?.statuses || {}).some(st => st.kind === 'tag' && st.fromBehind);
  if (rules.penBehind && isBehind) out.pen = Math.max(out.pen, rules.penBehind);
  if (rules.crit) out.crit = true;
  for (const b of [].concat(rules.bonusIf || [])) {
    const [kind, a, b2, c] = String(b.when || '').split(':');
    let k = 0;
    if (kind === 'execute') k = (defender.hp / Math.max(1, defender.maxHp)) < +a ? 1 : 0;
    else if (kind === 'family') k = String(a).split(',').includes(defender.family) ? 1 : 0;
    else if (kind === 'behind') k = isBehind ? 1 : 0;
    else if (kind === 'crowd') { out.mult *= 1 + Math.min(+b2, +a * Math.max(0, (ctx.crowd ?? 1) - 1)); continue; }
    else if (kind === 'distance') {
      const d = attacker?.x != null ? Math.hypot(defender.x - attacker.x, defender.z - attacker.z) : 0;
      out.mult *= 1 + Math.min(+c, +b2 * Math.max(0, d - +a)); continue;
    } else if (kind === 'stationary') k = (attacker?.stillFor || 0) >= +a ? 1 : 0;
    else if (kind === 'caster') k = (defender.role === 'caster' || (defender.ranged && defender.ranged.element && defender.ranged.element !== 'physical') || defender.ranged) ? 1 : 0;
    else if (kind === 'rank') k = (defender.boss || (defender.rank && defender.rank !== 'normal')) ? 1 : 0;
    else if (kind === 'status') k = defender.statuses?.[a] ? 1 : 0;
    else if (kind === 'variety') {
      const n = Object.values(defender.statuses || {}).filter(s => s.kind !== 'buff').length;
      out.mult *= 1 + Math.min(+b2 || 1, (+a || 0.2) * n); continue;
    } else if (kind === 'aimNotYou') k = defender.aimingAt ? 1 : 0;
    else if (kind === 'followers') { out.mult *= 1 + Math.min(+b2 || 0.5, (+a || 0.25) * (ENV.followers?.() ?? 0)); continue; }
    if (k) out.mult *= 1 + (b.mult ?? 0.5);
  }
  if (rules.consumes) {
    const c = rules.consumes;
    const what = c.tag || c.status;
    const has = what === 'stagger' ? (defender.stagger > 0) : !!defender.statuses?.[what];
    if (has) {
      const stacks = defender.statuses?.[what]?.stacks || 1;
      out.mult *= 1 + (c.perStack ? Math.min(c.cap ?? 9, (c.mult ?? 0.2) * stacks) : (c.mult ?? 0.5));
      out.consumed = what;
    }
  }
  return out;
}

/**
 * A TAG'S OWN NUMBERS, for every strike whoever makes it (not only a skill's): `fromYou` counts on
 * the player's hits, `fromParty` on a follower's (an attacker with an `owner`). Read by js/rpg.js
 * `strike` on every hit, so a hound's bite on a Quarry target is worth more.
 */
/** A tag's `detonateMult` (Rent): a counter detonating on this body is worth that much more. */
export function detonateMultOf(unit) {
  let k = 1;
  for (const st of Object.values(unit?.statuses || {})) if (st.kind === 'tag' && st.detonateMult) k *= st.detonateMult;
  return k;
}

export function tagFactor(attacker, defender) {
  let k = 1;
  for (const st of Object.values(defender?.statuses || {})) {
    if (st.kind !== 'tag') continue;
    if (st.fromYou && attacker?.equipment) k *= 1 + st.fromYou;
    if (st.fromParty && attacker?.owner) k *= 1 + st.fromParty;
  }
  return k;
}

/**
 * AFTER THE HIT LANDS: tags, stacks, detonations, spreads, the per-hit payouts, the kill book.
 * `result` is rpg.strike's result. `applyStatus(target, id, spec, power)` is the strike's own
 * status hook (it logs and draws). Returns a record for the tests.
 */
export function afterHit(rules, attacker, defender, result, ctx = {}) {
  const did = { tagged: null, stacked: null, detonated: 0, spread: 0, healed: 0, mana: 0, gold: 0 };
  if (!rules || !result || result.dodged) return did;
  const apply = ctx.applyStatus || ENV.applyStatus || null;
  const spec = id => ({ ...(ENV.statusSpec?.(id) || ctx.statuses?.[id] || {}) });
  const amount = result.amount || 0;
  const powerOf = () => Math.max(1, (ctx.damage || amount) * 0.35);

  // the payoff first, so a consume never eats the tag this same hit is about to put on
  if (rules.consumes?.remove && ctx.consumed) {
    const what = ctx.consumed;
    if (what === 'stagger') defender.stagger = 0;
    else if (defender.statuses?.[what]) delete defender.statuses[what];
    if (rules.resetOn && String(rules.resetOn.when || rules.resetOn) === 'consume') queue(attacker, { reset: rules.skill });
  }
  if (rules.tag) {
    const t = typeof rules.tag === 'string' ? { id: rules.tag } : rules.tag;
    const row = { ...spec(t.id), ...t, kind: 'tag' };
    defender.statuses = defender.statuses || {};
    const was = defender.statuses[t.id];
    defender.statuses[t.id] = {
      ...(was || {}), type: t.id, name: row.name || t.id, kind: 'tag', element: row.element || 'arcane',
      remaining: row.seconds ?? 6, power: 1, perSecond: 0, slow: row.slow || 0,
      takeMore: row.takeMore || 0, fromYou: row.fromYou || 0, fromParty: row.fromParty || 0,
      dealLess: row.dealLess || 0, takeMoreDot: row.takeMoreDot || 0, detonateMult: row.detonateMult || 0, fromBehind: !!row.fromBehind,
      store: row.store || rules.store?.share || 0, bank: was?.bank || 0, owner: rules.skill,
      // a tag that bursts as it ends (Clockwork Bolt's Stuck), at the cast's own scale, and one
      // that pays the caster a resource when the tagged body hits you or a follower (Brand)
      burstOnExpire: row.burstOnExpire ? { ...row.burstOnExpire, power: (row.burstOnExpire.mult ?? 0.5) * (rules.scale || 1), element: row.burstOnExpire.element || row.element } : null,
      gainOnHurt: row.gainOnHurt || null,
    };
    did.tagged = t.id;
    if (!was) ENV.statusFx?.(defender, 'marked', true);
  }
  if (rules.stack) {
    const s = rules.stack;
    const r = addStacks(defender, s.status, spec(s.status), { add: s.add ?? 1, max: s.max ?? 5, power: powerOf() * (rules.statusMult || 1) });
    did.stacked = r.stacks;
    if (r.fresh) ENV.statusFx?.(defender, s.status === 'frostbite' ? 'freeze' : s.status, true);
    if (r.maxed && r.onMax?.detonate) {
      const d = r.onMax.detonate;
      ENV.strikeArea?.(defender.x, defender.z, d.radius ?? 2.5, { power: (d.mult ?? 1.5) * detonateMultOf(defender), element: d.element || 'arcane', knock: d.knock });
    }
    if (r.maxed && r.onMax?.stagger) ENV.statusFx?.(defender, 'freeze', true);
  }
  if (rules.statuses && apply) {
    for (const ref of [].concat(rules.statuses)) {
      const r = statusRef(ref);
      if (r.chance != null && (ENV.rng?.() ?? Math.random()) >= r.chance) continue;
      if (r.minCrowd && (ctx.crowd ?? 1) < r.minCrowd) continue;
      if (lockedOut(defender, r)) continue;
      const base = spec(r.id);
      const ctl = controlFor(defender, r.id, r.seconds ?? base.seconds ?? 3);
      apply(defender, ctl.id, { ...base, ...r, ...(ctl.id !== r.id ? spec(ctl.id) : {}), seconds: ctl.seconds, ...(ctl.slow ? { slow: ctl.slow } : {}) }, powerOf());
    }
  }
  // P2 — turned, stasis, transform (boss: a slow instead; a champion half as long)
  for (const [key, id] of [['turned', 'turned'], ['stasis', 'stasis'], ['transform', 'transmuted']]) {
    const v = rules[key];
    if (!v || !apply) continue;
    const secsFor = typeof v === 'number' ? v : v.seconds ?? 5;
    const ctl = controlFor(defender, id, secsFor);
    const extra = ctl.id === id ? {
      follow: !!v.follow, weakenAfter: v.weakenAfter || 0, bankMult: v.bank ?? 1.5, bank: 0, total: ctl.seconds, creature: v.creature || null,
      // Transmute's blast as it wears off (a random element when `element: 'random'`)
      burstOnExpire: v.burstOnExpire ? { ...v.burstOnExpire, power: (v.burstOnExpire.mult ?? 1) * (rules.scale || 1) } : null,
    } : { slow: ctl.slow };
    apply(defender, ctl.id, { ...spec(ctl.id), seconds: ctl.seconds, ...extra }, 1);
    if (ctl.id === 'transmuted') apply(defender, 'chill', { ...spec('chill'), slow: 0.5, seconds: ctl.seconds, name: 'Shrunk' }, 1);
  }
  if (rules.statusPick && apply) {
    const id = rules.statusPick;
    const s = spec(id);
    if (s && Object.keys(s).length) apply(defender, id, s, powerOf());
  }
  if (rules.detonate) {
    const d = rules.detonate;
    const types = d.types || ['burn'];
    const left = remainingDot(defender, types);
    if (left > 0) {
      const pay = Math.round(left * (d.share ?? 0.6));
      defender.hp = Math.max(0, (defender.hp ?? 0) - pay);
      did.detonated = pay;
      for (const t of types) {
        const st = defender.statuses?.[t];
        if (!st) continue;
        if (d.keep && st.stacks) { st.stacks = Math.min(st.stacks, d.keep); st.perSecond = (st.perStack || st.perSecond) * st.stacks; } else delete defender.statuses[t];
      }
      if (defender.hp <= 0) result.dead = true;
    }
  }
  if (rules.spreadStatus && ENV.near) {
    const s = rules.spreadStatus;
    let n = 0;
    for (const other of ENV.near(defender.x, defender.z, s.radius ?? 5, defender) || []) {
      if (n >= (s.max ?? 3)) break;
      for (const t of s.types || []) {
        const st = defender.statuses?.[t];
        if (!st) continue;
        other.statuses = other.statuses || {};
        other.statuses[t] = { ...st, remaining: Math.max(st.remaining, other.statuses[t]?.remaining || 0) };
        ENV.statusFx?.(other, t, true);
      }
      n++;
    }
    did.spread = n;
  }
  // a tag that BANKS what the body takes (Grave Mark's `store`): every hit by anyone adds to it
  for (const st of Object.values(defender.statuses || {})) {
    if (st.kind === 'tag' && st.store > 0) st.bank = (st.bank || 0) + amount;
  }
  const oh = rules.onHit;
  if (oh) {
    if (oh.heal && attacker?.hp != null) { const h = Math.round((attacker.maxHp || 0) * oh.heal); attacker.hp = Math.min(attacker.maxHp, attacker.hp + h); did.healed += h; }
    if (oh.healShare && ENV.healMostHurt) did.healed += ENV.healMostHurt(Math.round(amount * oh.healShare)) || 0;
    if (oh.healAllies && ENV.healAllies) did.healed += ENV.healAllies(oh.healAllies) || 0;
    if (oh.healPet && ENV.healNearestPet) ENV.healNearestPet(oh.healPet);
    if (oh.mana && attacker?.mp != null) { attacker.mp = Math.min(attacker.maxMp, attacker.mp + oh.mana); did.mana += oh.mana; }
    if (oh.gold && attacker) { attacker.gold = (attacker.gold || 0) + oh.gold; did.gold += oh.gold; }
    if (oh.status && apply && ((oh.statusChance ?? 1) >= 1 || (ENV.rng?.() ?? Math.random()) < oh.statusChance)) {
      const r = statusRef(oh.status);
      const fam = r.family ? String(r.family).split(',') : null;
      if ((!fam || fam.includes(defender.family)) && !lockedOut(defender, r)) {
        const ctl = controlFor(defender, r.id, r.seconds ?? spec(r.id).seconds ?? 3);
        apply(defender, ctl.id, { ...spec(r.id), ...r, ...(ctl.id !== r.id ? spec(ctl.id) : {}), seconds: ctl.seconds }, powerOf());
      }
    }
    if (oh.resource) gainResource(attacker, oh.resource.id, oh.resource.n ?? 1);
    if (oh.taunt && ENV.taunt) ENV.taunt(defender, oh.taunt);
  }
  if (rules.resource?.gainPer === 'hit') gainResource(attacker, rules.resource.id, rules.resource.gain ?? 1);
  if (result.crit && rules.onCrit) {
    const c = rules.onCrit;
    if (c.repeat) { defender.hp = Math.max(0, defender.hp - Math.round(amount * c.repeat)); if (defender.hp <= 0) result.dead = true; }
    if (c.status && apply) { const r = statusRef(c.status); apply(defender, r.id, { ...spec(r.id), ...r }, powerOf()); }
    if (c.knock) ENV.push?.(defender, attacker?.x ?? defender.x, attacker?.z ?? defender.z, num(c.knock, 'push'));
    if (c.reset) queue(attacker, { reset: rules.skill });
  }
  if (rules.cutCooldown?.per === 'hit') queue(attacker, { cut: rules.cutCooldown, from: rules.skill });
  if (result.crit && rules.resetOn && String(rules.resetOn.when || rules.resetOn) === 'crit') queue(attacker, { reset: rules.skill });
  // the kill book: which skill's rules killed it, so `onKill` can run where the death is handled
  if (result.dead || (defender.hp ?? 1) <= 0) {
    defender.killedBy = rules;
    if (rules.cutCooldown?.per === 'kill') queue(attacker, { cut: rules.cutCooldown, from: rules.skill });
    if (rules.resource?.gainPer === 'kill') gainResource(attacker, rules.resource.id, rules.resource.gain ?? 1);
  }
  return did;
}

/**
 * `lockout` on a status reference: the same body takes this status from this source at most once
 * every N seconds (Thornlash roots once per target every 6 s). Records the lockout as it applies.
 */
export function lockedOut(target, ref, now = (ENV.now?.() ?? Date.now() / 1000)) {
  if (!ref?.lockout || !target) return false;
  const book = target.lockouts || (target.lockouts = {});
  const key = ref.lockKey || ref.id;
  if ((book[key] ?? -Infinity) > now) return true;
  book[key] = now + ref.lockout;
  return false;
}

/** A request to the skill bar from a hit (`rpg.strike` cannot reach the bar). Drained in `update`. */
export function queue(player, req) {
  if (!player) return;
  (player.mechQueue || (player.mechQueue = [])).push(req);
}

// ─────────────────────────────────────────────────────────────────────────────── hits TAKEN

/**
 * A HIT ON YOU (or on a follower): wards, counters, evasion, per-foe resistance, frontal guard,
 * death prevention, links. Called by js/rpg.js `strike` on the defender side before health moves.
 * Returns `{ amount, events }`; the events (`counter`, `burst`, `taunt`, `heal`) are acted on by
 * js/skillrun.js `onHurt`, which has the field.
 */
export function onHurt(defender, attacker, amount, ctx = {}) {
  const out = { amount, events: [] };
  const sts = defender?.statuses;
  if (!sts || !(amount > 0)) return out;
  const maxHp = defender.maxHp || 1;
  const ranged = !!ctx.ranged;
  const fromFront = () => {
    if (attacker?.x == null || defender.x == null) return true;
    const yaw = defender.yaw ?? defender.facing ?? 0;
    const to = Math.atan2(attacker.x - defender.x, attacker.z - defender.z);
    const delta = Math.abs(((to - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    return delta < Math.PI / 2;
  };
  for (const [id, st] of Object.entries(sts)) {
    // a ward negates one hit completely, if the hit qualifies
    if (st.ward) {
      const w = st.ward;
      const share = out.amount / maxHp;
      const qualifies = (w.threshold == null || share > w.threshold) && (w.cap == null || share <= w.cap);
      if (qualifies && (w.charges ?? 1) > 0) {
        w.charges = (w.charges ?? 1) - 1;
        out.events.push({ kind: 'ward', negated: out.amount });
        out.amount = 0;
        if (w.charges <= 0) delete sts[id];
        return out;
      }
    }
    // a counter window: the next N melee hits are cut (and answered)
    if (st.counter && (!ranged || (st.counter.ranged && !st.counter.rangedUsed))) {
      const c = st.counter;
      if (c.frontal && !fromFront()) continue;
      if (ranged) { c.rangedUsed = true; out.events.push({ kind: 'ward', negated: out.amount }); out.amount = 0; return out; }
      if ((c.hitsLeft ?? c.hits ?? 1) > 0) {
        c.hitsLeft = (c.hitsLeft ?? c.hits ?? 1) - 1;
        c.used = true;
        const cut = Math.round(out.amount * Math.min(1, c.negate ?? 1));
        out.amount -= cut;
        out.events.push({ kind: 'counter', spec: c, attacker, skill: st.skill });
        if (c.grow) c.taken = (c.taken || 0) + 1;
        if (c.hitsLeft <= 0 && !c.grow) delete sts[id];
      }
    }
  }
  if (!(out.amount > 0)) return out;
  // evasion, per-foe resistance, frontal guard, a store, every-Nth-hit bursts, death prevention
  let k = 1;
  for (const st of Object.values(sts)) {
    if (st.evade && (ENV.rng?.() ?? Math.random()) < st.evade) { out.events.push({ kind: 'evade' }); out.amount = 0; return out; }
    if (st.resistPerFoe) {
      const r = st.resistPerFoe;
      const n = ctx.foes ?? (ENV.near ? (ENV.near(defender.x, defender.z, r.radius ?? 6, null) || []).length : 0);
      const low = r.lowHp && (defender.hp / maxHp) < r.lowHp ? 2 : 1;
      k *= 1 - Math.min((r.cap ?? 0.36) * low, (r.per ?? 0.06) * n * low, 0.75);
    }
    if (st.manaOnHurt && defender.mp != null) defender.mp = Math.min(defender.maxMp ?? defender.mp, defender.mp + st.manaOnHurt);
    // Runeskin: whatever hits you is inscribed (`stacksOnAttacker`), a detonation at the maximum
    if (st.stacksOnAttacker && attacker && attacker.dying == null && !ranged) {
      const so = st.stacksOnAttacker;
      const spec = ENV.statusSpec?.(so.status);
      if (spec) {
        const r = addStacks(attacker, so.status, spec, { add: so.add ?? 1, max: so.max ?? 3 });
        if (r.maxed && r.onMax?.detonate) {
          const d = r.onMax.detonate;
          ENV.strikeArea?.(attacker.x, attacker.z, d.radius ?? 2.5, { power: d.mult ?? 1.5, element: d.element || 'arcane', knock: d.knock });
        }
      }
    }
    if (st.stillResist && (defender.stillFor || 0) >= (st.stillResist.after ?? 1)) k *= 1 - (st.stillResist.resist ?? 0.2);
    if (st.frontalResist && fromFront()) k *= 1 - st.frontalResist;
    if (st.every) {
      st.taken = (st.taken || 0) + 1;
      if (st.taken % (st.every.hits ?? 4) === 0) out.events.push({ kind: 'burst', spec: st.every });
    }
    if (st.storeShare) st.stored = (st.stored || 0) + out.amount * st.storeShare;
    if (st.reflect && !ranged && attacker?.hp != null) out.events.push({ kind: 'reflect', amount: Math.round(out.amount * st.reflect), attacker });
  }
  out.amount = Math.max(0, Math.round(out.amount * k));
  // Iron Resolve's Unkillable: once, a killing blow leaves you at 1 health and ends the buff
  if ((defender.hp ?? 0) - out.amount < 1) {
    const once = Object.entries(sts).find(([, s]) => s.deathPreventOnce);
    if (once) {
      out.amount = Math.max(0, (defender.hp ?? 1) - 1);
      const [id, s] = once;
      delete sts[id];
      if (s.deathPreventOnce.burst) out.events.push({ kind: 'burst', spec: s.deathPreventOnce.burst });
      out.events.push({ kind: 'deathPrevented' });
      return out;
    }
  }
  if (Object.values(sts).some(s => s.deathPrevent) && (defender.hp ?? 0) - out.amount < 1) {
    out.amount = Math.max(0, (defender.hp ?? 1) - 1);
    out.events.push({ kind: 'deathPrevented' });
  }
  return out;
}

/** Is the player untargetable right now (Bolt Step, ≤1.5 s)? Read by js/actors.js `aimOf`. */
export function untargetable(unit) {
  return Object.values(unit?.statuses || {}).some(s => s.untargetable);
}
/** Every self-status `cdRate` multiplied (Stop the Clock, Warlord's Call). */
export function cdRateOf(unit) {
  let r = 1;
  for (const s of Object.values(unit?.statuses || {})) if (s.cdRate) r *= s.cdRate;
  return r;
}
/** Every self-status `dotRate` (Soul Pact: statuses you apply tick twice as fast). */
export function dotRateOf(unit) {
  let r = 1;
  for (const s of Object.values(unit?.statuses || {})) if (s.dotRate) r *= s.dotRate;
  return r;
}
/** Can this body be knocked back or stunned? (Briarback's Unyielding, Iron Resolve's Deep Roots.) */
export function ccImmune(unit) {
  return Object.values(unit?.statuses || {}).some(s => s.ccImmune);
}

// ─────────────────────────────────────────────────────────────────────────────── the cast rules

/** Keys whose phase is `hit` or `kill` ride the strike (`castRulesFrom`), registry-driven. */
export const HIT_KEYS = VOCAB_KEYS.filter(k => VOCAB[k].phase === 'hit' || VOCAB[k].phase === 'kill');

/** The bag a strike carries for this plan, beyond the library's own keys. */
export function mechRules(plan) {
  const out = {};
  let any = false;
  for (const k of HIT_KEYS) if (plan[k] != null && plan[k] !== false) { out[k] = plan[k]; any = true; }
  if (plan.mult && plan.baseMult) { out.scale = plan.mult / plan.baseMult; }
  for (const k of ['crit', 'behind', 'statusPick', 'statusMult', 'resetOn', 'cutCooldown', 'resource', 'penBehind']) {
    if (plan[k] != null && plan[k] !== false) { out[k] = plan[k]; any = true; }
  }
  return any ? out : null;
}
