// Minimal AI for M1 (stream E grows it into the full parametric AI of PLAN §8 in M6).
//
// Runs inside the sim on every peer, reads only sim state, draws only from its own stream (player.ai.rng), and acts
// only through commands (the same ones a human sends). Knobs: data/ai.json `difficulties`.
//
//   economy: once per Pay interval spend a `greed` share of gold on sends, scored half income /
//            half pressure (the econ sim's "balanced" player) plus random noise; Muster ranks from
//            `musterFrom`; refill potions.
//   hero:    learn skills (ult first), pick the talent at random, fight the nearest / most advanced
//            enemy, cast a skill when enough enemies are inside its shape, drink below 35% HP,
//            walk home below `retreatAt`.

import { next, int, range } from '../rng.js';
import { liveEnt } from '../state.js';
import { dist2 } from '../mathx.js';
import { payTicks, sendRefusal, musterCost } from '../economy.js';
import { SLOTS, nextStepFor, itemScore, slotUsable } from '../items.js';
import { learnRefusal, castRefusal } from '../skills.js';
import { planFor } from '../talents.js';
import { isHidden } from '../traits.js';
import { sortBy } from '../order.js';

const LEARN_ORDER = ['R', 'Q', 'W', 'E', 'D'];

export function knobs(data, p) { return data.ai.difficulties[p.ai.difficulty] || data.ai.difficulties.recruit; }

export function aiCommands(ctx, p) {
  const { state, data } = ctx;
  if (state.result || state.tick < p.ai.nextAt) return [];
  const K = knobs(data, p);
  p.ai.nextAt = state.tick + K.reaction;
  const rng = p.ai.rng;   // own stream per AI slot, so one AI's draws never shift another's
  const out = [];
  const cmd = (type, args = {}) => out.push(Object.assign({ p: p.id, type }, args));

  // skills + talent
  let pts = p.skillPts;
  const ranks = {};
  for (const s of p.skills) ranks[s.slot] = s.rank;
  while (pts > 0) {
    const slot = LEARN_ORDER.find(sl => learnRefusal(data, { ...p, skillPts: pts, skills: p.skills.map(s => ({ ...s, rank: ranks[s.slot] })) }, sl) === null);
    if (!slot) break;
    cmd('learn', { slot }); ranks[slot]++; pts--;
  }
  if (p.talent < 0 && p.level >= data.heroes.ranks.talentLevel) cmd('talent', { choice: int(rng, 2) });

  economy(ctx, p, K, rng, cmd);
  inventory(ctx, p, K, cmd);
  toll(ctx, p, K, cmd);
  heroPlay(ctx, p, K, rng, cmd);
  return out;
}

/** Ring Toll of Iron when the Keep is about to be swarmed (micro >= 1). */
function toll(ctx, p, K, cmd) {
  const { state, map } = ctx;
  const team = state.teams[p.team];
  if (K.micro < 1 || team.toll.charges <= 0) return;
  const f = map.fields[team.field];
  let near = 0;
  for (const e of state.ents) if (e.alive && !e._gone && e.field === f.id && e.team !== p.team && e.z > f.leakZ - 30) near++;
  if (near >= 8) cmd('toll');
}

function pressure(u) { return u.hp * u.bodies * (1 + u.leak / 4) / u.cost; }

function economy(ctx, p, K, rng, cmd) {
  const { state, data } = ctx;
  const payIdx = Math.floor(state.tick / payTicks(data));
  if (p.ai.sendDone === payIdx) return;
  p.ai.sendDone = payIdx;
  let gold = p.gold;
  // potions
  const P = data.econ.items.potion;
  let belt = p.belt;
  while (K.potions && belt < P.belt && gold >= P.cost * 3) { cmd('potion'); belt++; gold -= P.cost; }
  // muster
  const mc = musterCost(data, p);
  if (mc != null && state.tick >= K.musterFrom * 20 && gold >= mc * 1.5) { cmd('muster'); gold -= mc; }
  // sends
  const roster = data.races.races[p.race].units.map(uid => data.derived.units[uid]);
  const pressRef = Math.max(...roster.map(pressure));
  // each Pay splits the purse: `greed` to sends now, the rest into an item fund that accrues until it
  // buys a gear step (without it the remainder never grows past a potion)
  const greed = range(rng, K.greed[0], K.greed[1]);
  const fresh = Math.max(0, gold - (p.ai.fund || 0));
  p.ai.fund = Math.min(gold, (p.ai.fund || 0) + fresh * (1 - greed));
  let budget = Math.max(0, gold - p.ai.fund);
  for (let guard = 0; guard < 60; guard++) {
    const avail = roster.filter(u => u.cost <= budget && u.cost <= gold);
    if (!avail.length) break;
    const scored = sortBy(avail.map(u => ({ id: u.id, u, s: -(0.5 * (u.income / u.cost) / 0.17 + 0.5 * pressure(u) / pressRef + K.noise * next(rng)) })), x => x.s);
    const u = scored[0].u;
    if (sendRefusal(state, data, { ...p, gold }, u.id)) break;
    cmd('send', { unit: u.id });
    gold -= u.cost; budget -= u.cost;
  }
  // gear: cheapest unlocked shop step first while gold stays above a potion (the econ sim's buyItems);
  // `upgrade` trades in the old step, so the local copy just tracks steps
  const steps = {};
  for (const sl of SLOTS) steps[sl] = p.equip[sl] ? p.equip[sl].step : -1;
  for (const r of p.requisitions) if (r.equip) steps[r.item.slot] = Math.max(steps[r.item.slot], r.item.step);
  const T = data.econ.items.tiers;
  for (let guard = 0; guard < 16; guard++) {
    let best = null;
    for (const sl of SLOTS) {
      if (!slotUsable(data, p, sl)) continue;
      const st = steps[sl] + 1;
      if (st >= T.length || state.tick < T[st].unlock * 20) continue;
      if (!best || T[st].cost < best.cost) best = { slot: sl, step: st, cost: T[st].cost };
    }
    if (!best || best.cost > p.ai.fund || gold < best.cost) break;
    cmd('upgrade', { slot: best.slot });
    gold -= best.cost; p.ai.fund -= best.cost; steps[best.slot] = best.step;
  }
}

/** Bag housekeeping: wear anything better, take the best champion card, sell the worst when full. */
function inventory(ctx, p, K, cmd) {
  const { data } = ctx;
  if (p.picks.length) {
    let bi = 0;
    p.picks[0].forEach((c, i) => { if (itemScore(data, c) > itemScore(data, p.picks[0][bi])) bi = i; });
    cmd('pick', { index: bi });
  }
  for (const it of p.bag) {
    if (!it) continue;
    if (it.unique && data['items-bl'].uniques[it.unique].hero !== p.hero) continue;
    if (itemScore(data, it) > itemScore(data, p.equip[it.slot]) + 1) { cmd('equip', { uid: it.uid }); return; }
  }
  const items = p.bag.filter(Boolean);
  if (items.length >= p.bag.length - 2) {
    let worst = items[0];
    for (const it of items) if (itemScore(data, it) < itemScore(data, worst)) worst = it;
    cmd('sell', { uid: worst.uid });
  }
}

function enemiesNear(state, hero, x, z, r) {
  let n = 0;
  for (const e of state.ents) if (e.alive && !e._gone && e.field === hero.field && e.team !== hero.team && dist2(x, z, e.x, e.z) <= (r + e.r) * (r + e.r)) n++;
  return n;
}

function heroPlay(ctx, p, K, rng, cmd) {
  const { state, data, map } = ctx;
  const hero = liveEnt(state, p.heroEnt);
  if (!hero) return;
  const f = map.fields[hero.field];
  const foes = state.ents.filter(e => e.alive && !e._gone && e.field === hero.field && e.team !== hero.team && e.kind !== 'hero' && !isHidden(e, hero.x, hero.z));
  const hpPct = hero.hp / hero.hpMax;
  if (hpPct < 0.35 && p.belt > 0 && state.tick >= p.drinkAt) cmd('drink');
  if (K.retreatAt > 0 && hpPct < K.retreatAt && p.belt === 0) {
    if (dist2(hero.x, hero.z, f.spawn.x, f.spawn.z) > 4) cmd('move', { x: f.spawn.x, z: f.spawn.z });
    return;
  }
  if (!foes.length) {
    const gx = f.cx, gz = 92;
    if (hero._ord.k !== 'move' && dist2(hero.x, hero.z, gx, gz) > 25) cmd('move', { x: gx, z: gz });
    return;
  }
  // target choice
  let target;
  if (K.micro === 0) target = sortBy(foes, e => dist2(hero.x, hero.z, e.x, e.z))[0];
  else if (!data.heroes.heroes[p.hero].melee) {
    // ranged: shoot what is closest to the Keep (it cannot body-block, so leaks are the danger)
    target = sortBy(foes, e => -e.z)[0];
  } else {
    const close = foes.filter(e => dist2(hero.x, hero.z, e.x, e.z) <= 100);
    target = close.length ? sortBy(close, e => e.hp)[0] : sortBy(foes, e => -e.z)[0];
  }
  // ranged heroes step away from melee that is on them (micro >= 1), then go back to shooting
  if (K.micro >= 1 && !data.heroes.heroes[p.hero].melee) {
    let mx = 0, mz = 0, n = 0;
    for (const e of foes) if (e._range <= 3 && e.target === hero.id && dist2(hero.x, hero.z, e.x, e.z) <= 9) { mx += e.x; mz += e.z; n++; }
    if (n > 0 && hpPct < 0.85) {
      let dx = hero.x - mx / n, dz = hero.z - mz / n;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      dx /= d; dz /= d;
      // prefer backing toward the Keep side, but never into the leak line
      const tx = Math.max(f.x0 + 2, Math.min(f.x1 - 2, hero.x + dx * 5)), tz = Math.max(f.z0 + 2, Math.min(f.leakZ - 4, hero.z + dz * 5 + 1));
      cmd('move', { x: tx, z: tz });
      castOpportunist(ctx, p, K, rng, cmd, hero, target);
      return;
    }
  }
  if (hero._ord.k !== 'attack' || hero._ord.target !== target.id) cmd('attack', { target: target.id });
  castOpportunist(ctx, p, K, rng, cmd, hero, target);
}

function castOpportunist(ctx, p, K, rng, cmd, hero, target) {
  const { state, data } = ctx;
  // skills
  for (const sk of p.skills) {
    if (castRefusal(ctx, p, sk.slot)) continue;
    if (next(rng) > K.skillChance) continue;
    const plan = planFor(data, p, sk.id);
    let n = 0, need = 2;
    const tr = plan.range || 0, td2 = dist2(hero.x, hero.z, target.x, target.z);
    if (plan.shape === 'around') n = enemiesNear(state, hero, hero.x, hero.z, plan.radius);
    else if (plan.shape === 'bolt') { n = td2 <= tr * tr ? 1 + enemiesNear(state, hero, target.x, target.z, plan.splash || 0) - 1 : 0; need = 1; }
    else if (plan.shape === 'ground') { n = td2 <= tr * tr ? enemiesNear(state, hero, target.x, target.z, plan.line ? plan.line.length / 2 : plan.radius) : 0; need = plan.cooldown >= 18 ? 3 : 2; }
    else if (plan.shape === 'melee') { n = dist2(hero.x, hero.z, target.x, target.z) <= (plan.reach + target.r + hero.r) * (plan.reach + target.r + hero.r) ? enemiesNear(state, hero, target.x, target.z, 2) : 0; need = 1; }
    else if (plan.shape === 'self') {
      const r = plan.taunt ? plan.taunt.radius : plan.selfBuff && plan.selfBuff.resistPerFoe ? plan.selfBuff.resistPerFoe.radius : 6;
      n = enemiesNear(state, hero, hero.x, hero.z, r); need = 3;
    }
    if (K.micro === 0) need = Math.max(1, need - 1);
    if (n >= need) { cmd('cast', { slot: sk.slot, x: target.x, z: target.z }); break; }
  }
}

