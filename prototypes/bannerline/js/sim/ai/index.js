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
import { payTicks, sendRefusal, musterCost, gearNext } from '../economy.js';
import { learnRefusal, castRefusal } from '../skills.js';
import { planFor } from '../talents.js';
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
  heroPlay(ctx, p, K, rng, cmd);
  return out;
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
  let budget = gold * range(rng, K.greed[0], K.greed[1]);
  const stock = {};
  for (const s of p.stock) stock[s.unit] = s.n;
  for (let guard = 0; guard < 40; guard++) {
    const avail = roster.filter(u => u.cost <= budget && u.cost <= gold && stock[u.id] > 0 && u.tier <= state.unlocked);
    if (!avail.length) break;
    const scored = sortBy(avail.map(u => ({ id: u.id, u, s: -(0.5 * (u.income / u.cost) / 0.17 + 0.5 * pressure(u) / pressRef + K.noise * next(rng)) })), x => x.s);
    const u = scored[0].u;
    if (sendRefusal(state, data, { ...p, gold }, u.id) && sendRefusal(state, data, { ...p, gold }, u.id) !== 'stock') break;
    cmd('send', { unit: u.id });
    gold -= u.cost; budget -= u.cost; stock[u.id]--;
  }
  // gear: cheapest unlocked step first while gold stays above a potion (the econ sim's buyItems)
  const gear = p.gear.slice();
  for (let guard = 0; guard < 16; guard++) {
    let best = null;
    for (let s = 0; s < gear.length; s++) {
      const n = gearNext(state, data, { gear }, s);
      if (n && n.unlocked && (!best || n.cost < best.cost)) best = n;
    }
    if (!best || gold - best.cost < P.cost) break;
    cmd('upgrade', { slot: best.slot });
    gold -= best.cost; gear[best.slot] = best.step;
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
  const foes = state.ents.filter(e => e.alive && !e._gone && e.field === hero.field && e.team !== hero.team && e.kind !== 'hero');
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
  else {
    const close = foes.filter(e => dist2(hero.x, hero.z, e.x, e.z) <= 100);
    target = close.length ? sortBy(close, e => e.hp)[0] : sortBy(foes, e => -e.z)[0];
  }
  if (hero._ord.k !== 'attack' || hero._ord.target !== target.id) cmd('attack', { target: target.id });
  // skills
  for (const sk of p.skills) {
    if (castRefusal(ctx, p, sk.slot)) continue;
    if (next(rng) > K.skillChance) continue;
    const plan = planFor(data, p, sk.id);
    let n = 0, need = 2;
    if (plan.shape === 'around') n = enemiesNear(state, hero, hero.x, hero.z, plan.radius);
    else if (plan.shape === 'melee') { n = dist2(hero.x, hero.z, target.x, target.z) <= (plan.reach + target.r + hero.r) * (plan.reach + target.r + hero.r) ? enemiesNear(state, hero, target.x, target.z, 2) : 0; need = 1; }
    else if (plan.shape === 'self') {
      const r = plan.taunt ? plan.taunt.radius : plan.selfBuff && plan.selfBuff.resistPerFoe ? plan.selfBuff.resistPerFoe.radius : 6;
      n = enemiesNear(state, hero, hero.x, hero.z, r); need = 3;
    }
    if (K.micro === 0) need = Math.max(1, need - 1);
    if (n >= need) { cmd('cast', { slot: sk.slot, x: target.x, z: target.z }); break; }
  }
}

