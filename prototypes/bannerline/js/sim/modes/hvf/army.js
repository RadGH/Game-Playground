// The farmers' mid-game flip (docs/hvf-PLAN.md §6.3-6.4): arrow towers, the Harvest Hall, and its
// army — scarecrows (march on lodges) and crow flocks (fly, scout, pick off watchstones). Gold is the
// only gate: a trained unit steps out at once. Army orders: move / amove / attack / stop.

import { baseEnt, liveEnt, secToTicks, FARMERS, HUNTERS } from './state.js';
import { liveGrid, cellOf, canStand, canStep, cellX, cellZ, nearestStandable } from './grid.js';
import { findPath } from './path.js';
import { canSee } from './vision.js';
import { hurt, CHASE_NODES, CHASE_RETRY } from './units.js';
import { faceOf } from '../../mathx.js';

const AR = data => data.hvf.units.army;

export function armyCount(state, pid) { let n = 0; for (const e of state.ents) if (e.kind === 'army' && e.owner === pid && e.alive && !e._gone) n++; return n; }

/** Stuffing ranks scale scarecrow health and damage. */
export function armyMult(data, p, type) { return type === 'scarecrow' ? 1 + (p.upgrades.stuffing || 0) * data.hvf.buildings.upgrades.stuffing.armyPct : 1; }

export function trainRefusal(ctx, p, unit, hallId) {
  const { state, data } = ctx;
  if (p.role !== 'farmer') return 'role';
  if (p.ghost) return 'dead';
  const def = AR(data)[unit];
  if (!def || typeof def !== 'object' || !def.cost) return 'bad';
  const hall = liveEnt(state, hallId);
  if (!hall || hall.kind !== 'building' || hall.type !== 'hall' || hall.owner !== p.id) return 'bad';
  const bodies = unit === 'crow' ? def.flock : 1;
  if (armyCount(state, p.id) + bodies > AR(data).cap) return 'cap';
  if (p.gold < def.cost) return 'gold';
  return null;
}

export function train(ctx, p, unit, hallId) {
  const why = trainRefusal(ctx, p, unit, hallId);
  if (why) return why;
  const { state, data, map } = ctx;
  const def = AR(data)[unit], hall = liveEnt(state, hallId);
  p.gold -= def.cost;
  const n = unit === 'crow' ? def.flock : 1, m = armyMult(data, p, unit);
  const g = liveGrid(ctx);
  for (let k = 0; k < n; k++) {
    const c = nearestStandable(ctx, g, def.flying ? 'farmer' : 'army', cellOf(map, hall.x + (k - (n - 1) / 2) * 1.2, hall.z + hall.r + 1.5));
    if (c < 0) break;
    const u = baseEnt(state, { kind: 'army', type: unit, owner: p.id, team: FARMERS, x: cellX(map, c), z: cellZ(map, c), r: def.radius, hp: def.hp * m, hpMax: def.hp * m, flying: !!def.flying, _atkAt: 0, ord: { k: 'idle' }, paid: def.cost / n });
    ctx.emit('spawn', { id: u.id, kind: 'army', unit });
    if (hall.rally) armyOrder(ctx, p, [u.id], { kind: 'amove', x: hall.rally.x, z: hall.rally.z });
  }
  return null;
}

/** order {ids, kind: 'move'|'amove'|'attack'|'stop', x?, z?, target?} for the farmer's own army. */
export function armyOrder(ctx, p, ids, o) {
  const { state, map } = ctx;
  if (!Array.isArray(ids) || !ids.length || ids.length > 60) return 'bad';
  const units = ids.map(id => (typeof id === 'number' ? liveEnt(state, id) : null)).filter(u => u && u.kind === 'army' && u.owner === p.id);
  if (!units.length) return 'bad';
  if (o.kind === 'stop') { for (const u of units) u.ord = { k: 'idle' }; return null; }
  if (o.kind === 'attack') {
    const t = typeof o.target === 'number' ? liveEnt(state, o.target) : null;
    if (!t || t.team !== HUNTERS) return 'bad';
    if (!canSee(ctx, FARMERS, t)) return 'unseen';
    for (const u of units) u.ord = { k: 'attack', target: t.id };
    return null;
  }
  if (o.kind !== 'move' && o.kind !== 'amove') return 'bad';
  if (!(typeof o.x === 'number' && typeof o.z === 'number' && o.x >= 0 && o.z >= 0 && o.x < map.size && o.z < map.size)) return 'bad';
  for (const u of units) u.ord = { k: o.kind, x: o.x, z: o.z, path: null, i: 0 };
  return null;
}

function stepToward(ctx, u, x, z, speed) {
  const { map } = ctx;
  const dx = x - u.x, dz = z - u.z, L = Math.sqrt(dx * dx + dz * dz);
  if (L < 0.05) return true;
  const s = Math.min(L, speed / 20);
  u.face = faceOf(dx, dz);
  const nx = u.x + dx / L * s, nz = u.z + dz / L * s;
  if (u.flying) { u.x = nx; u.z = nz; return L <= s; }
  const g = liveGrid(ctx), here = cellOf(map, u.x, u.z);
  if (canStep(ctx, g, 'army', here, cellOf(map, nx, nz))) { u.x = nx; u.z = nz; }
  else return true;
  return L <= s;
}

function followPath(ctx, u, gx, gz, speed) {
  const { map } = ctx;
  if (u.flying) return stepToward(ctx, u, gx, gz, speed);
  const o = u.ord;
  if (!o.path) {
    o.path = findPath(ctx, liveGrid(ctx), cellOf(map, u.x, u.z), cellOf(map, gx, gz), { who: 'army', near: true, closest: true, maxNodes: CHASE_NODES }) || [];
    o.i = 0;
    if (!o.path.length) o.failAt = ctx.state.tick;   // no way: don't search again for a second
  }
  if (o.i >= o.path.length) return true;
  const c = o.path[o.i];
  if (stepToward(ctx, u, cellX(map, c), cellZ(map, c), speed)) o.i++;
  return o.i >= o.path.length;
}

/** Nearest hunters' thing this unit can see and reach (hunters, hawks, hounds, wards, lodges, kennels). */
function nearestFoe(ctx, u, R) {
  let best = null, bd = R * R;
  for (const t of ctx.state.ents) {
    if (t.team !== HUNTERS || !t.alive || t._gone || t.kind === 'snare') continue;
    if (t.kind === 'hawk' && !u.flying) continue;
    const d = (t.x - u.x) * (t.x - u.x) + (t.z - u.z) * (t.z - u.z);
    if (d < bd && canSee(ctx, FARMERS, t)) { bd = d; best = t; }
  }
  return best;
}

export function armyTick(ctx) {
  const { state, data } = ctx;
  const A = AR(data);
  for (const u of state.ents) {
    if (u.kind !== 'army' || !u.alive || u._gone) continue;
    const def = A[u.type], p = state.players[u.owner];
    let speed = def.speed;
    if (u.slowUntil > state.tick) speed *= 1 - data.hvf.hunter.skills.W.armySlow;
    let o = u.ord;
    if (o.k === 'idle' || o.k === 'amove') {
      const foe = nearestFoe(ctx, u, def.sight);
      if (foe) { u.resume = o.k === 'amove' ? { x: o.x, z: o.z } : null; u.ord = o = { k: 'attack', target: foe.id }; }
    }
    if (o.k === 'move' || o.k === 'amove') { if (followPath(ctx, u, o.x, o.z, speed)) u.ord = { k: 'idle' }; continue; }
    if (o.k === 'attack') {
      const t = liveEnt(state, o.target);
      if (!t || !canSee(ctx, FARMERS, t)) { u.ord = u.resume ? { k: 'amove', x: u.resume.x, z: u.resume.z, path: null, i: 0 } : { k: 'idle' }; u.resume = null; continue; }
      const reach = def.range + u.r + t.r;
      if ((t.x - u.x) * (t.x - u.x) + (t.z - u.z) * (t.z - u.z) <= reach * reach) {
        if (state.tick >= u._atkAt) {
          u._atkAt = state.tick + secToTicks(def.attackEvery);
          hurt(ctx, u, t, def.dps * def.attackEvery * armyMult(data, p, u.type));
          ctx.emit('attack', { src: u.id, dst: t.id, x: t.x, z: t.z });
        }
      } else {
        if (state.tick % 10 === 0 && !(o.failAt > state.tick - CHASE_RETRY)) o.path = null;
        followPath(ctx, u, t.x, t.z, speed);
      }
    }
  }
}

/** Arrow towers shoot the nearest hunter (or hound) they can see in range. */
export function towerTick(ctx) {
  const { state, data } = ctx;
  const T = data.hvf.buildings.kinds.tower.shoot;
  for (const b of state.ents) {
    if (b.kind !== 'building' || b.type !== 'tower' || !b.alive || b._gone) continue;
    if (state.tick < (b._atkAt || 0)) continue;
    let best = null, bd = (T.range + b.r) * (T.range + b.r);
    for (const t of state.ents) {
      if (t.team !== HUNTERS || !t.alive || t._gone || (t.kind !== 'hunter' && t.kind !== 'hound')) continue;
      const d = (t.x - b.x) * (t.x - b.x) + (t.z - b.z) * (t.z - b.z);
      if (d < bd && canSee(ctx, FARMERS, t)) { bd = d; best = t; }
    }
    if (!best) continue;
    b._atkAt = state.tick + secToTicks(T.attackEvery);
    ctx.emit('shot', { src: b.id, dst: best.id, x: b.x, z: b.z });
    hurt(ctx, b, best, T.dps * T.attackEvery);
  }
}

export { canStand };
