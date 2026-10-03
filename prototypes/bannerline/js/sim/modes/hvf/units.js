// Characters (docs/hvf-PLAN.md §6, §7): the farmer (cannot attack) and the hunter. Orders:
//   move     walk a grid path (A*, path.js)
//   build    walk next to the footprint, then place it (farm.js) — no build timer
//   chop     walk next to a tree / briar cell, channel, cut it (+2 g)
//   attack   hunter: chase and hit a farmer, an animal or a building
//   revive   farmer: walk to an ally's grave, channel 4 s
// Hunters stay in their kennels until state.hvf.releaseTick. A downed farmer is a ghost at his grave.

import { KIND } from './mapgen.js';
import { liveGrid, canStep, canStand, cellOf, cellX, cellZ, chopCell, buildingsChanged } from './grid.js';
import { findPath } from './path.js';
import { placeBuilding } from './farm.js';
import { liveEnt, entById, secToTicks, FARMERS, HUNTERS } from './state.js';
import { faceOf } from '../../mathx.js';

const whoOf = e => (e.kind === 'hunter' || e.kind === 'army' ? 'hunter' : 'farmer');

export function released(state) { return state.tick >= state.hvf.releaseTick; }

/** Path an entity toward cell `goal` (near: stop next to it). Returns false when there is no way. */
export function routeTo(ctx, e, goal, near = false) {
  const g = liveGrid(ctx);
  const path = findPath(ctx, g, cellOf(ctx.map, e.x, e.z), goal, { who: whoOf(e), near });
  if (!path) return false;
  e.ord.path = path; e.ord.i = 0;
  return true;
}

function speedOf(ctx, e) {
  const U = ctx.data.hvf.units;
  let s = e.kind === 'hunter' ? U.hunter.speed : U.farmer.speed;
  const k = liveGrid(ctx).cells[cellOf(ctx.map, e.x, e.z)];
  if (k === KIND.trail) s *= 1.1; else if (k === KIND.ford) s *= 0.7;
  return s;
}

/** Follow the order's path one tick. Returns true when the path is done. */
function walk(ctx, e) {
  const o = e.ord;
  if (!o.path || o.i >= o.path.length) return true;
  const { map } = ctx;
  let budget = speedOf(ctx, e) / 20;
  while (budget > 0 && o.i < o.path.length) {
    const c = o.path[o.i], tx = cellX(map, c), tz = cellZ(map, c);
    const here = cellOf(map, e.x, e.z);
    if (here !== c && !canStep(ctx, liveGrid(ctx), whoOf(e), here, c)) {
      // something new stands in the way (a building, a hedge): find another way once, else give up
      const goal = o.path[o.path.length - 1];
      if (o.repathed || !routeTo(ctx, e, goal, o.near)) { o.path = null; return true; }
      o.repathed = true;
      continue;
    }
    const dx = tx - e.x, dz = tz - e.z, L = Math.sqrt(dx * dx + dz * dz);
    if (L > 1e-6) e.face = faceOf(dx, dz);
    if (L <= budget) { e.x = tx; e.z = tz; budget -= L; o.i++; }
    else { e.x += dx / L * budget; e.z += dz / L * budget; budget = 0; }
  }
  return o.i >= o.path.length;
}

/** Damage from a hunter (or, in H3, a tower / army unit). */
export function hurt(ctx, src, dst, amount) {
  const { state, data } = ctx;
  if (!dst.alive || dst._gone || !(amount > 0)) return;
  dst.hp -= amount;
  ctx.emit('hit', { src: src ? src.id : -1, dst: dst.id, amount: Math.round(amount * 10) / 10 });
  if (dst.hp > 0) return;
  const U = data.hvf.units, killer = src && src.owner >= 0 ? state.players[src.owner] : null;
  const pay = g => { if (killer && killer.role === 'hunter') { killer.gold += g; killer.stats.earned += g; ctx.emit('gold', { player: killer.id, amount: g, why: 'bounty' }); } };
  if (dst.kind === 'animal') {
    dst.alive = false; dst._gone = true;
    state.players[dst.owner].stats.animalsLost++;
    if (killer) killer.stats.kills++;
    pay(U.bounty[dst.type] || 0);
    ctx.emit('animalKilled', { id: dst.id, kind: dst.type, owner: dst.owner, by: src ? src.id : -1, x: dst.x, z: dst.z });
    ctx.emit('despawn', { id: dst.id, why: 'killed' });
  } else if (dst.kind === 'farmer') {
    downFarmer(ctx, dst);
    if (killer) killer.stats.kills++;
    pay(U.bounty.farmer);
  } else if (dst.kind === 'building') {
    dst.alive = false; dst._gone = true;
    if (dst.cells) buildingsChanged(ctx);
    pay(Math.round((dst.paid || 0) * U.bounty.buildingShare));
    ctx.emit('lost', { id: dst.id, kind: dst.type, owner: dst.owner, x: dst.x, z: dst.z });
    ctx.emit('despawn', { id: dst.id, why: 'destroyed' });
  } else if (dst.kind === 'hunter') {
    hunterDown(ctx, dst);
  }
}

export function downFarmer(ctx, e) {
  const { state } = ctx;
  const p = state.players[e.owner];
  e.hp = 0; e.alive = false; e.ord = { k: 'idle' };
  p.ghost = true;
  state.hvf.graves.push({ pid: p.id, x: e.x, z: e.z, since: state.tick });
  ctx.emit('farmerDown', { player: p.id, id: e.id, grave: { x: e.x, z: e.z } });
}

export function reviveFarmer(ctx, p) {
  const { state } = ctx;
  const e = entById(state, p.ent);
  e.alive = true; e.hp = e.hpMax; e.ord = { k: 'idle' };
  p.ghost = false;
  state.hvf.graves = state.hvf.graves.filter(g => g.pid !== p.id);
  ctx.emit('farmerRevived', { player: p.id, id: e.id });
}

function hunterDown(ctx, e) {
  const { state, data, map } = ctx;
  const p = state.players[e.owner], U = data.hvf.units.hunter;
  e.hp = 0; e.alive = false; e.ord = { k: 'idle' };
  p.deaths++;
  const lodge = state.ents.find(b => b.kind === 'building' && b.lodge && b.owner === p.id && b.alive && !b._gone);
  if (!lodge) { p.out = true; ctx.emit('hunterOut', { player: p.id }); return; }
  e.respawnAt = state.tick + secToTicks(U.respawn + U.respawnPerDeath * (p.deaths - 1));
  e.lodge = lodge.id;
  ctx.emit('hunterDown', { player: p.id, respawnTick: e.respawnAt });
}

function hunterDamage(ctx, e) {
  const U = ctx.data.hvf.units.hunter, p = ctx.state.players[e.owner];
  return U.damage * ctx.state.hvf.hunterMult * (1 + U.perLevel * (p.level - 1));
}

export function unitTick(ctx) {
  const { state, data, map } = ctx;
  const U = data.hvf.units;
  for (const e of state.ents) {
    if ((e.kind !== 'farmer' && e.kind !== 'hunter') || e._gone) continue;
    const p = state.players[e.owner];
    if (!e.alive) {
      if (e.kind === 'hunter' && !p.out && e.respawnAt >= 0 && state.tick >= e.respawnAt) {
        const lodge = liveEnt(state, e.lodge) || state.ents.find(b => b.kind === 'building' && b.lodge && b.owner === p.id && b.alive && !b._gone);
        if (!lodge) { p.out = true; ctx.emit('hunterOut', { player: p.id }); continue; }
        e.alive = true; e.hp = e.hpMax; e.x = e.px = lodge.x; e.z = e.pz = lodge.z; e.respawnAt = -1;
        ctx.emit('respawn', { player: p.id, id: e.id });
      }
      continue;
    }
    if (e.kind === 'hunter' && !released(state)) continue;
    const o = e.ord;
    switch (o.k) {
      case 'move': if (walk(ctx, e)) e.ord = { k: 'idle' }; break;
      case 'build': {
        if (!walk(ctx, e)) break;
        const why = placeBuilding(ctx, p, o.kind, o.x, o.z);
        if (why) ctx.emit('reject', { player: p.id, cmd: 'build', reason: why });
        e.ord = { k: 'idle' };
        break;
      }
      case 'chop': {
        if (o.until < 0) { if (!walk(ctx, e)) break; const k = liveGrid(ctx).cells[o.cell]; o.until = state.tick + secToTicks(k === KIND.briar ? U[e.kind].chopBriar : U[e.kind].chop); break; }
        if (state.tick < o.until) break;
        const k = liveGrid(ctx).cells[o.cell];
        if (k === KIND.tree || k === KIND.briar) {
          chopCell(ctx, o.cell);
          p.gold += U[e.kind].chopGold; p.stats.chopped++;
          ctx.emit('chopped', { player: p.id, cell: o.cell, gold: U[e.kind].chopGold });
        }
        e.ord = { k: 'idle' };
        break;
      }
      case 'attack': {
        const t = liveEnt(state, o.target);
        if (!t) { e.ord = { k: 'idle' }; break; }
        const reach = U.hunter.range + e.r + t.r + (t.kind === 'building' ? t.r : 0);
        const d2 = (t.x - e.x) * (t.x - e.x) + (t.z - e.z) * (t.z - e.z);
        if (d2 <= reach * reach) {
          e.face = faceOf(t.x - e.x, t.z - e.z);
          if (state.tick >= (e._atkAt || 0)) {
            e._atkAt = state.tick + secToTicks(U.hunter.attackEvery);
            ctx.emit('attack', { src: e.id, dst: t.id });
            hurt(ctx, e, t, hunterDamage(ctx, e));
          }
          break;
        }
        // chase: re-plan every half second toward where the target is now
        if (!o.path || o.i >= o.path.length || state.tick >= (o.repathAt || 0)) {
          o.repathAt = state.tick + 10;
          if (!routeTo(ctx, e, cellOf(map, t.x, t.z), true)) { e.ord = { k: 'idle' }; break; }
        }
        walk(ctx, e);
        break;
      }
      case 'revive': {
        const tp = state.players[o.target];
        const gr = state.hvf.graves.find(g => g.pid === o.target);
        if (!tp || !tp.ghost || !gr) { e.ord = { k: 'idle' }; break; }
        const d2 = (gr.x - e.x) * (gr.x - e.x) + (gr.z - e.z) * (gr.z - e.z);
        if (d2 > U.farmer.reviveRange * U.farmer.reviveRange) { o.until = -1; if (!o.path || o.i >= o.path.length) e.ord = { k: 'idle' }; else walk(ctx, e); break; }
        if (o.until < 0) { o.until = state.tick + secToTicks(U.farmer.reviveSeconds); ctx.emit('reviveStart', { player: p.id, target: o.target }); break; }
        if (state.tick >= o.until) { reviveFarmer(ctx, tp); e.ord = { k: 'idle' }; }
        break;
      }
      default: {
        // an idle hunter swings at anything of the farmers' within reach
        if (e.kind !== 'hunter') break;
        let best = null, bd = 1e9;
        for (const t of state.ents) {
          if (t.team !== FARMERS || !t.alive || t._gone || t.kind === 'building') continue;
          const reach = U.hunter.range + e.r + t.r + 0.5, d2 = (t.x - e.x) * (t.x - e.x) + (t.z - e.z) * (t.z - e.z);
          if (d2 <= reach * reach && d2 < bd) { bd = d2; best = t; }
        }
        if (best) e.ord = { k: 'attack', target: best.id };
      }
    }
  }
}

export { canStand, HUNTERS };
