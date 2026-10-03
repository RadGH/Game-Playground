// Minimal AI for M1 (stream E grows it into the full parametric AI of PLAN §8 in M6).
//
// Runs inside the sim on every peer, reads only sim state, draws only from its own stream (player.ai.rng), and acts
// only through commands (the same ones a human sends). Knobs: data/ai.json `difficulties`.
//
//   economy: once per Pay interval spend a `greed` share of gold on sends, scored half income /
//            half pressure (the econ sim's "balanced" player) plus random noise; unit upgrades and items
//            through shop.js aiShopping (stream I).
//   hero:    learn skills (ult first), pick the talent at random, fight the nearest / most advanced
//            enemy, cast a skill when enough enemies are inside its shape, drink below 35% HP,
//            walk home below `retreatAt`.

import { next, int, range } from '../rng.js';
import { liveEnt } from '../state.js';
import { dist2 } from '../mathx.js';
import { payTicks, sendRefusal } from '../economy.js';
import { aiShopping, aiHealSlot } from '../shop.js';
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
  shopping(ctx, p, K, cmd);
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
  // items, Drill Yard and Sanctum come out of p.ai.fund in shopping() (js/sim/shop.js, stream I)
}

/** Outfitter / Drill Yard / Sanctum through js/sim/shop.js (stream I); spends from the item fund. */
function shopping(ctx, p, K, cmd) {
  const { cmds, spent } = aiShopping(ctx, p, K, p.ai.fund || 0);
  for (const c of cmds) cmd(c.type, c);
  p.ai.fund = Math.max(0, (p.ai.fund || 0) - spent);
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
  const heal = aiHealSlot(p);
  if (hpPct < 0.35 && heal >= 0 && state.tick >= (p.useAt || 0)) cmd('use', { slot: heal });
  if (K.retreatAt > 0 && hpPct < K.retreatAt && heal < 0) {
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
  const foes = state.ents.filter(e => e.alive && !e._gone && e.field === hero.field && e.team !== hero.team && e.kind !== 'hero');
  for (const sk of p.skills) {
    if (castRefusal(ctx, p, sk.slot)) continue;
    if (next(rng) > K.skillChance) continue;
    const plan = planFor(data, p, sk.id);
    let n = 0, need = 2;
    const tr = plan.range || 0, td2 = dist2(hero.x, hero.z, target.x, target.z);
    if (plan.form) {
      // shapeshift in when a crowd is on you, back out when the field is quiet
      const crowd = enemiesNear(state, hero, hero.x, hero.z, 6);
      if ((!p.form && crowd >= 3) || (p.form === plan.form.id && crowd === 0)) { cmd('cast', { slot: sk.slot }); break; }
      continue;
    }
    if (plan.shape === 'turret') {
      // build toward the enemies, within reach; rebuild when below the limit for this rank
      const T = plan.turret, have = state.ents.filter(e => e.kind === 'turret' && e.owner === p.id && e.alive && !e._gone).length;
      if (have < T.max[Math.max(0, Math.min(T.max.length, sk.rank) - 1)]) {
        const bx = hero.x + (target.x - hero.x) * 0.4, bz = hero.z + (target.z - hero.z) * 0.4;
        cmd('cast', { slot: sk.slot, x: bx, z: bz }); break;
      }
      continue;
    }
    if (plan.repair) {
      const hurt = state.ents.some(e => e.kind === 'turret' && e.owner === p.id && e.alive && !e._gone && e.hp < e.hpMax * 0.6 && dist2(e.x, e.z, hero.x, hero.z) <= plan.repair.radius * plan.repair.radius);
      if (hurt || hero.hp < hero.hpMax * 0.5) { cmd('cast', { slot: sk.slot }); break; }
      continue;
    }
    if (plan.turretBuff) {
      const guns = state.ents.filter(e => e.kind === 'turret' && e.owner === p.id && e.alive && !e._gone);
      if (guns.length && guns.some(g => enemiesNear(state, hero, g.x, g.z, g._range) >= 3)) { cmd('cast', { slot: sk.slot }); break; }
      continue;
    }
    if (plan.shape === 'summon') {
      const d = plan.pet ? data.heroes.pets[plan.pet] : null;
      const have = state.ents.filter(e => e.kind === 'pet' && e.owner === p.id && e.alive && !e._gone).length;
      if (!d || have < d.max) { cmd('cast', { slot: sk.slot, x: target.x, z: target.z }); break; }
      continue;
    }
    if (plan.shape === 'dash') {
      // a leap back is an escape: use it when melee is on you
      let on = 0;
      for (const e of foes) if (e._range <= 3 && dist2(hero.x, hero.z, e.x, e.z) <= 9) on++;
      if (on >= 2) { cmd('cast', { slot: sk.slot, x: target.x, z: target.z }); break; }
      continue;
    }
    if (plan.shape === 'ground' && plan.place) {
      if (td2 <= tr * tr) { cmd('cast', { slot: sk.slot, x: target.x, z: target.z + 2 }); break; }   // just ahead of it
      continue;
    }
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

