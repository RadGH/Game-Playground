// Gold, income, stocks, sends, waves, bounty, Rally, Muster, potions (PLAN §3.1).
//
//   Pay every econ.clock.pay s: queued sends leave through the rival's gate, then gold += income.
//   Stocks: each unit has `max` charges and regains one every `every` ticks (tier 4+ faster during the
//   Rising Tide). A send costs gold AND a charge, and adds its income at once.
//   Bounty: a kill in your field pays your team pool (split evenly), x (1 + Rally).

import { secToTicks, baseEnt } from './state.js';
import { gainXp, refreshHero } from './heroes.js';
import { dist2 } from './mathx.js';

export const payTicks = data => secToTicks(data.econ.clock.pay);
const XP_SHARE_RANGE = 20;
const XP_PER_GOLD = 0.9;

/** Rally bonus for a team (fraction, e.g. 0.2). */
export function rally(state, data, teamId) {
  if (state.endless) return 0;
  const me = state.teams[teamId], foe = state.teams[1 - teamId];
  const behind = (foe.banners - me.banners) / me.bannersMax;
  if (behind <= 0) return 0;
  const R = data.econ.rally;
  return Math.min(R.cap, Math.floor(behind / R.behindStep + 1e-9) * R.perStep);
}

/** Tier-4+ restock speed during the Rising Tide. */
function restockRate(state, data, tier) {
  if (tier < 4 || !state.rising) return 1;
  return 1 + (data.econ.clock.risingRestock || 0) * state.rising;
}

export function restockTick(ctx) {
  const { state, data } = ctx;
  for (const p of state.players) {
    for (const s of p.stock) {
      if (s.n >= s.max) { s.t = 0; continue; }
      s.t += restockRate(state, data, data.derived.units[s.unit].tier);
      if (s.t >= s.every) { s.t -= s.every; s.n++; }
    }
  }
}

/** Highest unlocked tier at this tick + emit unlock events. */
export function unlockTick(ctx) {
  const { state, data } = ctx;
  for (const t of data.derived.tiers) {
    if (t.tier > state.unlocked && state.tick >= secToTicks(t.unlock)) {
      state.unlocked = t.tier;
      ctx.emit('unlock', { tier: t.tier });
    }
  }
}

export function stockOf(p, uid) {
  for (const s of p.stock) if (s.unit === uid) return s;
  return null;
}

/** Why `p` cannot buy `uid` right now, or null. */
export function sendRefusal(state, data, p, uid) {
  if (state.result) return 'over';
  const u = data.derived.units[uid];
  if (!u || u.race !== p.race) return 'roster';
  if (u.tier > state.unlocked) return 'locked';
  const s = stockOf(p, uid);
  if (!s || s.n <= 0) return 'stock';
  if (p.gold < u.cost) return 'gold';
  return null;
}

/** Buy a send. Returns the refusal reason or null. */
export function buySend(ctx, p, uid, silent = false) {
  const { state, data } = ctx;
  const why = sendRefusal(state, data, p, uid);
  if (why) return why;
  const u = data.derived.units[uid];
  stockOf(p, uid).n--;
  p.gold -= u.cost;
  p.income += u.income;
  p.queued.push(uid);
  p.stats.sendGold += u.cost; p.stats.sends++;
  ctx.emit('queued', { player: p.id, unit: uid, auto: silent });
  return null;
}

/** Auto-send toggles: buy deck sends whenever stock and gold allow. */
export function autoSends(ctx) {
  for (const p of ctx.state.players) {
    for (let i = 0; i < 4; i++) {
      if (!p.auto[i]) continue;
      let guard = 8;
      while (guard-- > 0 && buySend(ctx, p, p.deck[i], true) === null) { /* keep buying */ }
    }
  }
}

function musterMult(data, p) {
  let m = 1;
  for (let i = 0; i < p.muster; i++) m += data.econ.muster.ranks[i].pct;
  return m;
}

/** The field a player's sends go into, and which gate. */
export function sendTarget(state, map, p) {
  const rival = state.players[p.rival];
  const field = map.fields[state.teams[rival.team].field];
  const gi = state.teams[p.team].players.indexOf(p.id) % field.gates.length;
  return { field, gate: field.gates[gi] };
}

/** Pay: release waves, then pay income. */
export function payTick(ctx) {
  const { state, data, map } = ctx;
  if (state.tick === 0 || state.tick % payTicks(data) !== 0) return;
  for (const p of state.players) {
    if (p.queued.length) {
      const { field, gate } = sendTarget(state, map, p);
      const fs = state.fields[field.id];
      const units = p.queued.slice();
      let k = 0;
      for (const uid of units) {
        const u = data.derived.units[uid];
        const group = state.nextGroup++;
        for (let b = 0; b < u.bodies; b++) fs.waiting.push({ owner: p.id, unit: uid, group, body: b, bodies: u.bodies, slot: k++, gx: gate.x, gz: gate.z, mk: musterMult(data, p) });
        if (u.traits.includes('champion')) ctx.emit('champion', { player: p.id, unit: uid, field: field.id });
      }
      ctx.emit('wave', { player: p.id, field: field.id, units });
      p.queued.length = 0;
    }
  }
  for (const p of state.players) {
    p.gold += p.income;
    ctx.emit('pay', { player: p.id, amount: p.income, income: p.income });
  }
}

/** Unit radius from tier / pack. */
export function unitRadius(u) {
  if (u.bodies > 1) return 0.38;
  return u.tier >= 6 ? 1.1 : u.tier >= 4 ? 0.95 : u.tier >= 3 ? 0.6 : u.tier >= 2 ? 0.55 : 0.45;
}

/** Move waiting sends onto the field while under the body cap. */
export function admitWaiting(ctx) {
  const { state, data } = ctx;
  const cap = data.econ.field.cap;
  for (const fs of state.fields) {
    let bodies = 0;
    for (const e of state.ents) if (e.alive && !e._gone && e.field === fs.id && e.kind !== 'hero') bodies++;
    while (fs.waiting.length && bodies < cap) {
      const w = fs.waiting.shift();
      const col = w.slot % 6, row = (w.slot / 6) | 0;
      spawnUnit(ctx, fs.id, w.owner, w.unit, { group: w.group, bodies: w.bodies, x: w.gx + (col - 2.5) * 1.5, z: w.gz + row * 1.5, mk: w.mk });
      bodies++;
    }
    fs.bodies = bodies;
  }
}

/** Create one send body. opts: { group, bodies, x, z, mk, summon } */
export function spawnUnit(ctx, fieldId, owner, uid, opts) {
  const { state, data } = ctx;
  const u = data.derived.units[uid];
  const p = state.players[owner];
  const bodies = opts.bodies || u.bodies;
  const mk = opts.mk || 1;
  const e = baseEnt(state, {
    kind: 'unit', type: uid, team: p.team, owner, field: fieldId,
    x: opts.x, z: opts.z, face: 0, r: unitRadius(u),
    hp: u.hp * mk, hpMax: u.hp * mk, armour: u.armour, dmgType: u.dmg,
    group: opts.group ?? state.nextGroup++,
    _spd: u.speed, _dps: u.dps, _range: u.range, _atkEvery: 20, _atkAt: state.tick + 10,
    _traits: u.traits.slice(), _mk: mk,
    _leak: u.leak / bodies, _cost: u.cost / bodies,
    _bounty: opts.summon ? 0 : u.cost * u.bounty / bodies,
    _xp: (opts.summon ? 0.5 : 1) * u.cost * XP_PER_GOLD / bodies,
    _refund: opts.summon ? 0 : u.leakRefund * u.cost / bodies,
    _timerA: state.tick, _timerB: state.tick,
  });
  ctx.emit('spawn', { id: e.id, kind: e.kind, unit: uid, team: e.team, field: fieldId });
  return e;
}

/** A trait summons a unit next to `src` (raise, pack_call). */
export function spawnSummon(ctx, src, uid) {
  const { data } = ctx;
  if (!data.derived.units[uid]) return null;
  const u = data.derived.units[uid];
  const group = ctx.state.nextGroup++;
  let last = null;
  for (let b = 0; b < u.bodies; b++) last = spawnUnit(ctx, src.field, src.owner, uid, { group, bodies: u.bodies, x: src.x + (b - (u.bodies - 1) / 2) * 0.9, z: src.z - 1.2, mk: src._mk, summon: true });
  return last;
}

/** Pay bounty + XP for a unit killed in a field. */
export function payKill(ctx, dst, src) {
  const { state, data } = ctx;
  const fieldTeam = state.fields[dst.field].team;
  const team = state.teams[fieldTeam];
  const r = 1 + rally(state, data, fieldTeam);
  const gold = dst._bounty * r;
  if (gold > 0 && team.players.length) {
    const share = gold / team.players.length;
    for (const pid of team.players) {
      const p = state.players[pid];
      p.gold += share; p.stats.bounty += share;
      ctx.emit('bounty', { player: pid, amount: Math.round(share * 10) / 10, src: dst.id });
    }
  }
  // XP to the defending heroes within range, split
  const heroes = [];
  for (const pid of team.players) {
    const h = state.ents.find(e => e.id === state.players[pid].heroEnt);
    if (h && h.alive && dist2(h.x, h.z, dst.x, dst.z) <= XP_SHARE_RANGE * XP_SHARE_RANGE) heroes.push(pid);
  }
  if (heroes.length) for (const pid of heroes) gainXp(ctx, state.players[pid], dst._xp * r / heroes.length);
  if (src && src.kind === 'hero') state.players[src.owner].stats.kills++;
}

/** Muster rank purchase. */
export function musterCost(data, p) {
  const ranks = data.econ.muster.ranks;
  if (p.muster >= ranks.length) return null;
  const rt = data.races.traits[data.races.races[p.race].trait] || {};
  return Math.round(ranks[p.muster].cost * (rt.musterCost ?? 1));
}

export function buyMuster(ctx, p) {
  const cost = musterCost(ctx.data, p);
  if (cost == null) return 'maxMuster';
  if (p.gold < cost) return 'gold';
  p.gold -= cost; p.muster++; p.stats.musterGold += cost;
  ctx.emit('muster', { player: p.id, rank: p.muster });
  return null;
}

export function buyPotion(ctx, p) {
  const P = ctx.data.econ.items.potion;
  if (p.belt >= P.belt) return 'belt';
  if (p.gold < P.cost) return 'gold';
  p.gold -= P.cost; p.belt++; p.stats.potionGold += P.cost;
  return null;
}

/** Gear step model (PLAN §7.2): the next step for a slot, or null. */
export function gearNext(state, data, p, slot) {
  const T = data.econ.items.tiers;
  const nt = p.gear[slot] + 1;
  if (nt >= T.length) return null;
  return { slot, step: nt, cost: T[nt].cost, unlockTick: secToTicks(T[nt].unlock), unlocked: state.tick >= secToTicks(T[nt].unlock) };
}

/** Cheapest unlocked next step over all slots (lowest slot wins ties), or null. */
export function cheapestGear(state, data, p) {
  let best = null;
  for (let s = 0; s < p.gear.length; s++) {
    const n = gearNext(state, data, p, s);
    if (n && n.unlocked && (!best || n.cost < best.cost)) best = n;
  }
  return best;
}

/** Buy one gear step (slot omitted = cheapest). Returns refusal or null. */
export function buyGear(ctx, p, slot) {
  const { state, data } = ctx;
  if (state.result) return 'over';
  let n;
  if (slot == null) { n = cheapestGear(state, data, p); if (!n) return 'maxGear'; }
  else {
    if (!(slot >= 0 && slot < p.gear.length)) return 'bad';
    n = gearNext(state, data, p, slot);
    if (!n) return 'maxGear';
    if (!n.unlocked) return 'locked';
  }
  if (p.gold < n.cost) return 'gold';
  p.gold -= n.cost; p.gear[n.slot] = n.step; p.stats.itemGold += n.cost;
  refreshHero(ctx, p);
  ctx.emit('gear', { player: p.id, slot: n.slot, step: n.step });
  return null;
}
