// Gold, income, sends, waves, bounty, Rally.
//
//   THE SPAM RULES (owner, 2026-10-03): a send is limited ONLY by gold — no stock, no restock, no tier
//   time locks. It leaves through the rival's gate within GROUP_TICKS (0.5 s grouping, so a mashed key
//   reads as one wave) and adds its income at once. A field over its body cap holds the extra bodies
//   in a visible gate queue (fields[].waiting) and lets them in oldest first; a send is never refused
//   for the cap.
//   Pay every econ.clock.pay s: gold += income.
//   Bounty: a kill in your field pays your team pool (split evenly), x (1 + Rally).

import { secToTicks, baseEnt } from './state.js';
import { gainXp } from './heroes.js';
import { gearStats } from './items.js';
import { unitCounter, counterEvent } from './ai/counter.js';
import { defenceOf } from './ai/read.js';
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

/** Why `p` cannot buy `uid` right now, or null. */
export function sendRefusal(state, data, p, uid) {
  if (state.result) return 'over';
  const u = data.derived.units[uid];
  if (!u || u.race !== p.race) return 'roster';
  if (p.gold < u.cost) return 'gold';
  return null;
}

/** Buy a send. Returns the refusal reason or null. */
export function buySend(ctx, p, uid, silent = false) {
  const { state, data } = ctx;
  const why = sendRefusal(state, data, p, uid);
  if (why) return why;
  const u = data.derived.units[uid];
  p.gold -= u.cost;
  p.income += u.income;
  p.queued.push(uid);
  p.stats.sendGold += u.cost; p.stats.sends++;
  ctx.emit('queued', { player: p.id, unit: uid, auto: silent });
  return null;
}

/** The field a player's sends go into, and which gate. */
export function sendTarget(state, map, p) {
  const rival = state.players[p.rival];
  const field = map.fields[state.teams[rival.team].field];
  const gi = state.teams[p.team].players.indexOf(p.id) % field.gates.length;
  return { field, gate: field.gates[gi] };
}

/** Sends bought in the last GROUP_TICKS leave together (a 0.5 s grouping window so a mashed key
 *  reads as one wave, never a wait for the Pay). */
export const GROUP_TICKS = 10;
export function releaseTick(ctx) {
  const { state, data, map } = ctx;
  if (state.tick % GROUP_TICKS !== 0) return;
  for (const p of state.players) {
    if (p.queued.length) {
      const { field, gate } = sendTarget(state, map, p);
      const fs = state.fields[field.id];
      const units = p.queued.slice();
      let k = 0;
      for (const uid of units) {
        const u = data.derived.units[uid];
        const group = state.nextGroup++;
        for (let b = 0; b < u.bodies; b++) fs.waiting.push({ owner: p.id, unit: uid, group, body: b, bodies: u.bodies, slot: k++, gx: gate.x, gz: gate.z, mk: 1 });   // unit upgrades are stamped by upgrades.js (Drill Yard)
        if (u.traits.includes('champion')) ctx.emit('champion', { player: p.id, unit: uid, field: field.id });
      }
      ctx.emit('wave', { player: p.id, field: field.id, units });
      if (p.kind === 'human') humanCounterNotice(ctx, p, field.id, units);
      p.queued.length = 0;
    }
  }
}

/** Pay: gold += income every econ.clock.pay s. */
export function payTick(ctx) {
  const { state, data } = ctx;
  if (state.tick === 0 || state.tick % payTicks(data) !== 0) return;
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
    for (const e of state.ents) if (e.alive && !e._gone && e.field === fs.id && e.kind !== 'hero' && e.kind !== 'pet' && e.kind !== 'turret') bodies++;
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
  const { data, state } = ctx;
  if (!data.derived.units[uid]) return null;
  const u = data.derived.units[uid];
  // trait summons (raise, pack_call, split) are not sends: a full field simply gets none
  let bodies = 0;
  for (const e of state.ents) if (e.alive && !e._gone && e.field === src.field && (e.kind === 'unit' || e.kind === 'tide')) bodies++;
  if (bodies + u.bodies > data.econ.field.cap) return null;
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
      const mine = share * (1 + gearStats(data, p).bountyPct / 100);
      p.gold += mine; p.stats.bounty += mine;
      ctx.emit('bounty', { player: pid, amount: Math.round(mine * 10) / 10, src: dst.id });
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

const HUMAN_COUNTER_EVERY = 200;   // ticks: at most one counter notice per human sender every 10 s
/** The `counter` notice (stream E) for a HUMAN's wave too: the defender learns why it hurts. */
function humanCounterNotice(ctx, p, fieldId, units) {
  const { state, data } = ctx;
  if (state.tick < (p.counterAt || 0)) return;
  const counts = [];
  for (const uid of units) { const c = counts.find(x => x.uid === uid); if (c) c.n++; else counts.push({ uid, n: 1 }); }
  let best = null;
  const D = defenceOf(ctx, fieldId, p.team);
  for (const c of counts) {
    const u = data.derived.units[c.uid];
    if (c.n * u.cost < 90) continue;
    const k = unitCounter(data, u, D);
    if (k.mult >= 1.1 && k.reasons.length && (!best || c.n * u.cost > best.gold)) best = { uid: c.uid, n: c.n, gold: c.n * u.cost, reason: k.reasons[0] };
  }
  if (!best) return;
  p.counterAt = state.tick + HUMAN_COUNTER_EVERY;
  counterEvent(ctx, p, p.rival, best.uid, best.n, best.reason);
}
