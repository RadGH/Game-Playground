// Characters (docs/hvf-PLAN.md §6, §7): the farmer (cannot attack) and the hunter. Orders:
//   move     walk a grid path (A*, path.js)
//   build    walk next to the footprint, then place it (farm.js) — no build timer
//   chop     walk next to a tree / briar cell, channel, cut it (+2 g)
//   attack   hunter: chase and hit a farmer, an animal or a building
//   revive   farmer: walk to an ally's grave, channel 4 s
// Hunters stay in their kennels until state.hvf.releaseTick. A downed farmer is a ghost at his grave.

import { KIND } from './mapgen.js';
import { liveGrid, canStep, canStand, cellOf, cellX, cellZ, chopCell, buildingsChanged, nearestStandable } from './grid.js';
import { findPath } from './path.js';
import { placeBuilding } from './farm.js';
import { liveEnt, entById, secToTicks, FARMERS, HUNTERS } from './state.js';
import { gear, gainXp, hunterDamage } from './hunter.js';
import { ringBell } from './animals.js';
import { canSee } from './vision.js';

// a chase re-plan may search this many cells (an unreachable target must not walk the whole map every
// half second: 9v3 ticks spiked 20-60 ms before the cap); a failed plan waits CHASE_RETRY ticks
export const CHASE_NODES = 4000, CHASE_RETRY = 20, CHASE_GIVEUP = 3;
// a target out of sight this long is lost: the hunter walks to where he last saw it and stops
export const LOSE_SIGHT = 20;
import { faceOf } from '../../mathx.js';

const whoOf = e => (e.kind === 'hunter' || e.kind === 'army' ? 'hunter' : 'farmer');

export function released(state) { return state.tick >= state.hvf.releaseTick; }

/** Path an entity toward cell `goal` (near: stop next to it). Returns false when there is no way. */
export function routeTo(ctx, e, goal, near = false, closest = false, maxNodes = undefined) {
  const g = liveGrid(ctx);
  const path = findPath(ctx, g, cellOf(ctx.map, e.x, e.z), goal, { who: whoOf(e), near, closest, maxNodes });
  if (!path) return false;
  e.ord.path = path; e.ord.i = 0;
  return true;
}

/** Is this cell under a Mud Patch? (a walkable building) */
export function inMud(ctx, x, z) {
  const c = cellOf(ctx.map, x, z);
  for (const b of ctx.state.ents) if (b.kind === 'building' && b.type === 'mud' && b.alive && !b._gone && b.cells.includes(c)) return true;
  return false;
}

function speedOf(ctx, e) {
  const { state, data } = ctx, U = data.hvf.units;
  if (e.rootUntil > state.tick) return 0;
  let s = e.kind === 'hunter' ? U.hunter.speed : U.farmer.speed;
  const k = liveGrid(ctx).cells[cellOf(ctx.map, e.x, e.z)];
  if (k === KIND.trail) s *= 1.1; else if (k === KIND.ford) s *= 0.7;
  if (e.kind === 'hunter') {
    s *= 1 + gear(data, state.players[e.owner]).speed;
    if (inMud(ctx, e.x, e.z)) s *= data.hvf.buildings.kinds.mud.mud.speedMult;
  }
  if (e.scamperUntil > state.tick) s *= 1 + U.farmer.abilities.Q.speed;
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
  if (dst.kind === 'hunter') amount *= 1 - gear(data, state.players[dst.owner]).armorPct;
  if (dst.kind === 'building' && src && src.torchUntil > state.tick) amount *= 2;
  dst.hp -= amount;
  ctx.emit('hit', { src: src ? src.id : -1, dst: dst.id, amount: Math.round(amount * 10) / 10 });
  if (dst.hp > 0) return;
  const U = data.hvf.units, killer = src && src.owner >= 0 ? state.players[src.owner] : null;
  const pay = g => { if (killer && killer.role === 'hunter') { killer.gold += g; killer.stats.earned += g; ctx.emit('gold', { player: killer.id, amount: g, why: 'bounty' }); } };
  const xp = kind => { if (killer && killer.role === 'hunter') gainXp(ctx, killer, kind); };
  if (dst.kind === 'animal') {
    dst.alive = false; dst._gone = true;
    state.players[dst.owner].stats.animalsLost++;
    if (killer) killer.stats.kills++;
    pay(U.bounty[dst.type] || 0); xp(dst.type);
    ctx.emit('animalKilled', { id: dst.id, kind: dst.type, owner: dst.owner, by: src ? src.id : -1, x: dst.x, z: dst.z });
    ctx.emit('despawn', { id: dst.id, why: 'killed' });
  } else if (dst.kind === 'farmer') {
    downFarmer(ctx, dst);
    if (killer) killer.stats.kills++;
    pay(U.bounty.farmer); xp('farmer');
  } else if (dst.kind === 'army') {
    dst.alive = false; dst._gone = true;
    pay(U.bounty[dst.type] || 0); xp(dst.type);
    ctx.emit('despawn', { id: dst.id, why: 'killed' });
  } else if (dst.kind === 'ward' || dst.kind === 'hawk' || dst.kind === 'hound' || dst.kind === 'snare') {
    dst.alive = false; dst._gone = true;
    if (dst.kind === 'ward') ctx.emit('wardPulled', { id: dst.id, owner: dst.owner, by: src ? src.id : -1, x: dst.x, z: dst.z });
    ctx.emit('despawn', { id: dst.id, why: 'killed' });
  } else if (dst.kind === 'building') {
    dst.alive = false; dst._gone = true;
    // the next copy's price counts the copies you OWN: a destroyed coop makes the next one cheaper again
    const owner = state.players[dst.owner];
    if (owner && owner.copies && owner.copies[dst.type] > 0) owner.copies[dst.type]--;
    if (dst.cells) buildingsChanged(ctx);
    if (dst.team === FARMERS) { pay(Math.round((dst.paid || 0) * U.bounty.buildingShare)); xp('building'); }
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
  const lodge = state.ents.find(b => b.kind === 'building' && b.lodge && b.owner === p.id && b.alive && !b._gone && b.done !== false);
  if (!lodge) { p.out = true; ctx.emit('hunterOut', { player: p.id }); return; }
  e.respawnAt = state.tick + secToTicks(U.respawn + U.respawnPerDeath * (p.deaths - 1));
  e.lodge = lodge.id;
  ctx.emit('hunterDown', { player: p.id, respawnTick: e.respawnAt });
}


export function unitTick(ctx) {
  const { state, data, map } = ctx;
  const U = data.hvf.units;
  for (const e of state.ents) {
    if ((e.kind !== 'farmer' && e.kind !== 'hunter') || e._gone) continue;
    const p = state.players[e.owner];
    if (!e.alive) {
      // a ghost farmer with a Farmhouse stands up there after its respawn time
      if (e.kind === 'farmer' && p.ghost) {
        const fh = state.ents.find(b => b.kind === 'building' && b.type === 'farmhouse' && b.owner === p.id && b.alive && !b._gone);
        const gr = state.hvf.graves.find(g => g.pid === p.id);
        if (fh && gr && state.tick >= gr.since + secToTicks(data.hvf.buildings.kinds.farmhouse.respawn)) {
          reviveFarmer(ctx, p);
          const c = nearestStandableFor(ctx, 'farmer', fh.x, fh.z + fh.r + 1);
          if (c >= 0) { e.x = e.px = cellX(map, c); e.z = e.pz = cellZ(map, c); }
          ctx.emit('respawn', { player: p.id, id: e.id, at: fh.id });
        }
        continue;
      }
      if (e.kind === 'hunter' && !p.out && e.respawnAt >= 0 && state.tick >= e.respawnAt) {
        const lodge = liveEnt(state, e.lodge) || state.ents.find(b => b.kind === 'building' && b.lodge && b.owner === p.id && b.alive && !b._gone && b.done !== false);
        if (!lodge) { p.out = true; ctx.emit('hunterOut', { player: p.id }); continue; }
        e.alive = true; e.hp = e.hpMax; e.x = e.px = lodge.x; e.z = e.pz = lodge.z; e.respawnAt = -1;
        ctx.emit('respawn', { player: p.id, id: e.id });
      }
      continue;
    }
    if (e.kind === 'hunter' && !released(state)) continue;
    // Lie Low: still for `still` s in tall grass or at a forest edge -> hidden until he moves
    if (e.kind === 'farmer' && e.low) {
      if (e.x !== e.low.x || e.z !== e.low.z) { e.low = null; e.lowUntil = 0; }
      else if (!e.lowUntil && state.tick >= e.low.at && coverAt(ctx, e)) { e.lowUntil = 2147483647; ctx.emit('lyingLow', { player: p.id }); }
    }
    const o = e.ord;
    switch (o.k) {
      case 'move': if (walk(ctx, e)) e.ord = { k: 'idle' }; break;
      case 'build': {
        if (!walk(ctx, e)) break;
        const def = data.hvf.buildings.kinds[o.kind];
        const reach = Math.max(def.size[0], def.size[1]) * map.cell * 0.75 + U.farmer.buildRange;
        const fx = o.x - e.x, fz = o.z - e.z;
        const why = fx * fx + fz * fz > reach * reach ? 'reach' : placeBuilding(ctx, p, o.kind, o.x, o.z);
        if (why) ctx.emit('reject', { player: p.id, cmd: 'build', reason: why });
        e.ord = { k: 'idle' };
        break;
      }
      case 'chop': {
        if (o.until < 0) {
          if (!walk(ctx, e)) break;
          const k = liveGrid(ctx).cells[o.cell], mult = e.kind === 'hunter' ? gear(data, p).chopMult : 1;
          o.until = state.tick + secToTicks((k === KIND.briar ? U[e.kind].chopBriar : U[e.kind].chop) / mult);
          break;
        }
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
        // the fog: an order does not see through trees. Out of sight, the hunter keeps on toward where
        // he last saw the target for LOSE_SIGHT ticks, then walks to that spot and stops there.
        const seen = canSee(ctx, e.team, t);
        if (seen) { o.lastX = t.x; o.lastZ = t.z; o.lostAt = -1; }
        else {
          if (o.lastX == null) { o.lastX = t.x; o.lastZ = t.z; }
          if (o.lostAt == null || o.lostAt < 0) o.lostAt = state.tick;
          if (state.tick - o.lostAt > LOSE_SIGHT) {
            const gx = o.lastX, gz = o.lastZ;
            e.ord = { k: 'move' };
            if (!routeTo(ctx, e, cellOf(map, gx, gz), true, true, CHASE_NODES)) e.ord = { k: 'idle' };
            break;
          }
        }
        const reach = U.hunter.range + e.r + t.r + (t.kind === 'building' ? t.r : 0);
        const d2 = (t.x - e.x) * (t.x - e.x) + (t.z - e.z) * (t.z - e.z);
        if (seen && d2 <= reach * reach) {
          e.face = faceOf(t.x - e.x, t.z - e.z);
          if (state.tick >= (e._atkAt || 0)) {
            e._atkAt = state.tick + secToTicks(U.hunter.attackEvery / (inMud(ctx, e.x, e.z) ? data.hvf.buildings.kinds.mud.mud.attackMult : 1));
            ctx.emit('attack', { src: e.id, dst: t.id });
            hurt(ctx, e, t, hunterDamage(ctx, e));
          }
          break;
        }
        // the thrown spear: a target out of reach but inside spear range, when it is ready
        const SP = data.hvf.hunter.spear;
        if (seen && d2 <= (SP.range + t.r) * (SP.range + t.r) && state.tick >= (e._spearAt || 0)) {
          e._spearAt = state.tick + secToTicks(SP.cooldown);
          ctx.emit('spear', { src: e.id, dst: t.id });
          hurt(ctx, e, t, hunterDamage(ctx, e) * SP.damageMult);
          if (!t.alive || t._gone) { e.ord = { k: 'idle' }; break; }
        }
        // chase: re-plan every half second toward where the target is now
        if ((!o.path || o.i >= o.path.length || state.tick >= (o.repathAt || 0)) && state.tick >= (o.failUntil || 0)) {
          o.repathAt = state.tick + 10;
          const gx = seen ? t.x : o.lastX, gz = seen ? t.z : o.lastZ;
          if (!routeTo(ctx, e, cellOf(map, gx, gz), true, false, CHASE_NODES)) {
            o.fails = (o.fails || 0) + 1;
            o.failUntil = state.tick + CHASE_RETRY;
            if (o.fails >= CHASE_GIVEUP) { e.ord = { k: 'idle' }; break; }
            o.path = null;
          } else o.fails = 0;
        }
        if (o.path) walk(ctx, e);
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
      case 'pullup': {
        const t = liveEnt(state, o.target);
        if (!t) { e.ord = { k: 'idle' }; break; }
        const R = U.farmer.pullUp.range + t.r, d2 = (t.x - e.x) * (t.x - e.x) + (t.z - e.z) * (t.z - e.z);
        if (d2 > R * R) { o.until = -1; if (!o.path || o.i >= o.path.length) e.ord = { k: 'idle' }; else walk(ctx, e); break; }
        if (o.until < 0) { o.until = state.tick + secToTicks(U.farmer.pullUp.seconds); break; }
        if (state.tick >= o.until) {
          t.alive = false; t._gone = true;
          ctx.emit(t.kind === 'ward' ? 'wardPulled' : 'snarePulled', { id: t.id, owner: t.owner, by: e.id, x: t.x, z: t.z });
          ctx.emit('despawn', { id: t.id, why: 'pulled' });
          e.ord = { k: 'idle' };
        }
        break;
      }
      default: {
        // an idle hunter swings at anything of the farmers' within reach
        if (e.kind !== 'hunter') break;
        let best = null, bd = 1e9;
        for (const t of state.ents) {
          if (t.team !== FARMERS || !t.alive || t._gone || t.kind === 'building' || !canSee(ctx, e.team, t)) continue;
          const reach = U.hunter.range + e.r + t.r + 0.5, d2 = (t.x - e.x) * (t.x - e.x) + (t.z - e.z) * (t.z - e.z);
          if (d2 <= reach * reach && d2 < bd) { bd = d2; best = t; }
        }
        if (best) e.ord = { k: 'attack', target: best.id };
      }
    }
  }
}

/** Cover for Lie Low: standing in tall grass, or next to a tree. */
function coverAt(ctx, e) {
  const { map } = ctx, g = liveGrid(ctx), c = cellOf(map, e.x, e.z);
  if (g.cells[c] === KIND.tallgrass) return true;
  const x = c % map.cols;
  for (const j of [x + 1 < map.cols ? c + 1 : -1, x > 0 ? c - 1 : -1, c + map.cols, c - map.cols]) if (j >= 0 && j < g.cells.length && g.cells[j] === KIND.tree) return true;
  return false;
}

function nearestStandableFor(ctx, who, x, z) { return nearestStandable(ctx, liveGrid(ctx), who, cellOf(ctx.map, x, z)); }

/** Farmer abilities (cast Q/W/E). */
export function castFarmer(ctx, p, cmd) {
  const { state, data } = ctx, A = data.hvf.units.farmer.abilities, ab = A[cmd.slot];
  if (!ab) return 'bad';
  const e = liveEnt(state, p.ent);
  if (!e) return 'dead';
  if (state.tick < (p.cd[cmd.slot] || 0)) return 'cooldown';
  if (ab.id === 'scamper') { e.scamperUntil = state.tick + secToTicks(ab.seconds); }
  else if (ab.id === 'lieLow') { e.ord = { k: 'idle' }; e.low = { x: e.x, z: e.z, at: state.tick + secToTicks(ab.still) }; e.lowUntil = 0; }
  else if (ab.id === 'bell') { const n = ringBell(ctx, p, e.x, e.z, ab.radius); ctx.emit('bell', { player: p.id, x: e.x, z: e.z, animals: n }); }
  p.cd[cmd.slot] = state.tick + secToTicks(ab.cooldown);
  ctx.emit('cast', { player: p.id, slot: cmd.slot, id: ab.id });
  return null;
}

export { canStand, HUNTERS };
