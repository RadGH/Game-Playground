// The hunter's kit (docs/hvf-PLAN.md §7): levels from kills, skills (Pounce, Snare, Hawk, Horn), the
// thrown spear, lodges, watchstones, and the 6-slot item runtime with the HvF catalogue
// (data/hvf/hunter-items.json; the same rules as line war's stream-I items: every copy counts,
// uniqueEquipped refuses a second copy, `group` allows one of a kind, consumables have charges).

import { baseEnt, liveEnt, entById, secToTicks, FARMERS, HUNTERS } from './state.js';
import { liveGrid, cellOf, canStand, cellX, cellZ, nearestStandable } from './grid.js';
import { KIND } from './mapgen.js';

const HJ = data => data.hvf.hunter;
const HI = data => data.hvf['hunter-items'];

// ── items ─────────────────────────────────────────────────────────────────────────────────────────

/** Summed item stats for a hunter (every copy counts). */
export function gear(data, p) {
  const out = { speed: 0, chopMult: 1, sightPct: 0, damage: 0, armorPct: 0, regen: 0, snares: 0 };
  if (!p.inv) return out;
  for (const it of p.inv) {
    if (!it) continue;
    const s = HI(data).items[it.id].stats || {};
    for (const k of Object.keys(s)) { if (k === 'chopMult') out.chopMult *= s[k]; else out[k] += s[k]; }
  }
  if (out.armorPct > 0.6) out.armorPct = 0.6;
  return out;
}

export function nearLodge(ctx, p) {
  const e = entById(ctx.state, p.ent);
  if (!e || !e.alive) return false;
  const R = HJ(ctx.data).lodge.range + 2;
  return ctx.state.ents.some(b => b.kind === 'building' && b.lodge && b.owner === p.id && b.alive && !b._gone && b.done !== false && (b.x - e.x) * (b.x - e.x) + (b.z - e.z) * (b.z - e.z) <= (R + b.r) * (R + b.r));
}

export function buyRefusal(ctx, p, id) {
  const def = HI(ctx.data).items[id];
  if (p.role !== 'hunter') return 'role';
  if (!def) return 'bad';
  if (!nearLodge(ctx, p)) return 'notAtShop';
  if (def.uniqueEquipped && p.inv.some(it => it && it.id === id)) return 'uniqueEquipped';
  if (def.group && p.inv.some(it => it && HI(ctx.data).items[it.id].group === def.group)) return 'group';
  if (p.inv.indexOf(null) < 0) return 'full';
  if (p.gold < def.price) return 'gold';
  return null;
}

export function buyItem(ctx, p, id) {
  const why = buyRefusal(ctx, p, id);
  if (why) return why;
  const def = HI(ctx.data).items[id], slot = p.inv.indexOf(null);
  p.inv[slot] = { uid: ctx.state.nextItem++, id, charges: def.charges || 0 };
  p.gold -= def.price;
  ctx.emit('item', { player: p.id, id, slot, how: 'buy' });
  return null;
}

export function sellItem(ctx, p, slot) {
  if (!(Number.isInteger(slot) && slot >= 0 && slot < p.inv.length) || !p.inv[slot]) return 'bad';
  if (!nearLodge(ctx, p)) return 'notAtShop';
  const it = p.inv[slot], def = HI(ctx.data).items[it.id];
  const share = def.charges ? it.charges / def.charges : 1;
  const gold = Math.round(def.price * HI(ctx.data).sellFactor * share);
  p.inv[slot] = null; p.gold += gold;
  ctx.emit('sell', { player: p.id, id: it.id, slot, gold });
  return null;
}

/** Spend one charge of the item in `slot`. */
function spend(p, slot) { const it = p.inv[slot]; it.charges--; if (it.charges <= 0) p.inv[slot] = null; }

export function useItem(ctx, p, cmd) {
  const { state, data, map } = ctx;
  const slot = cmd.slot;
  if (!(Number.isInteger(slot) && slot >= 0 && slot < p.inv.length) || !p.inv[slot]) return 'bad';
  const def = HI(data).items[p.inv[slot].id];
  if (!def.use) return 'notUsable';
  const e = liveEnt(state, p.ent);
  if (!e) return 'dead';
  const H = HJ(data);
  const x = typeof cmd.x === 'number' ? cmd.x : e.x, z = typeof cmd.z === 'number' ? cmd.z : e.z;
  if (!(x >= 0 && z >= 0 && x < map.size && z < map.size)) return 'bad';
  if (def.use === 'ward') {
    if ((x - e.x) * (x - e.x) + (z - e.z) * (z - e.z) > H.watchstone.range * H.watchstone.range) return 'reach';
    const c = cellOf(map, x, z);
    if (!canStand(liveGrid(ctx), 'farmer', c)) return 'blocked';
    const w = baseEnt(state, { kind: 'ward', type: 'watchstone', owner: p.id, team: HUNTERS, x: cellX(map, c), z: cellZ(map, c), r: 0.4, hp: H.watchstone.hp, hpMax: H.watchstone.hp, until: state.tick + secToTicks(H.watchstone.seconds) });
    ctx.emit('wardPlanted', { player: p.id, id: w.id, x: w.x, z: w.z });
  } else if (def.use === 'flare') {
    state.hvf.flares.push({ x, z, until: state.tick + secToTicks(H.flare.seconds), team: HUNTERS });
    ctx.emit('flare', { player: p.id, x, z });
  } else if (def.use === 'hound') {
    const hd = baseEnt(state, { kind: 'hound', type: 'hound', owner: p.id, team: HUNTERS, x: e.x, z: e.z, r: 0.4, hp: H.hound.hp, hpMax: H.hound.hp, target: -1 });
    ctx.emit('spawn', { id: hd.id, kind: 'hound' });
  } else if (def.use === 'torch') {
    e.torchUntil = state.tick + secToTicks(def.seconds);
  }
  spend(p, slot);
  ctx.emit('use', { player: p.id, id: def.use, slot });
  return null;
}

// ── levels ────────────────────────────────────────────────────────────────────────────────────────

export function gainXp(ctx, p, kind) {
  const U = ctx.data.hvf.units.hunter;
  const xp = U.xp[kind] || 0;
  if (!xp || p.role !== 'hunter') return;
  p.xp += xp;
  while (p.level < U.maxLevel && p.xp >= U.xpTable[p.level]) {
    p.level++;
    const e = entById(ctx.state, p.ent);
    if (e) { const was = e.hpMax; e.hpMax = U.hp * ctx.state.hvf.hunterMult * (1 + U.perLevel * (p.level - 1)); if (e.alive) e.hp += e.hpMax - was; }
    ctx.emit('levelUp', { player: p.id, level: p.level });
  }
}

export function hunterDamage(ctx, e) {
  const U = ctx.data.hvf.units.hunter, p = ctx.state.players[e.owner];
  return (U.damage * ctx.state.hvf.hunterMult + gear(ctx.data, p).damage) * (1 + U.perLevel * (p.level - 1));
}

// ── skills ────────────────────────────────────────────────────────────────────────────────────────

export function castRefusal(ctx, p, slot) {
  const sk = HJ(ctx.data).skills[slot];
  if (!sk) return 'bad';
  if (p.level < sk.level) return 'level';
  const e = liveEnt(ctx.state, p.ent);
  if (!e) return 'dead';
  if (ctx.state.tick < (p.cd[slot] || 0)) return 'cooldown';
  return null;
}

export function castHunter(ctx, p, cmd) {
  const { state, data, map } = ctx;
  const slot = cmd.slot, why = castRefusal(ctx, p, slot);
  if (why) return why;
  const sk = HJ(data).skills[slot], e = liveEnt(state, p.ent);
  const x = typeof cmd.x === 'number' ? cmd.x : e.x, z = typeof cmd.z === 'number' ? cmd.z : e.z;
  if (!(x >= 0 && z >= 0 && x < map.size && z < map.size)) return 'bad';
  const d2 = (x - e.x) * (x - e.x) + (z - e.z) * (z - e.z);
  if (sk.id === 'pounce') {
    if (d2 > sk.range * sk.range) return 'reach';
    const c = cellOf(map, x, z), from = cellOf(map, e.x, e.z);
    if (!canStand(liveGrid(ctx), 'hunter', c) || map.level[c] !== map.level[from]) return 'blocked';
    e.x = cellX(map, c); e.z = cellZ(map, c); e.ord = { k: 'idle' };
    ctx.emit('pounce', { player: p.id, x: e.x, z: e.z });
  } else if (sk.id === 'snare') {
    if (d2 > sk.range * sk.range) return 'reach';
    const mine = state.ents.filter(s => s.kind === 'snare' && s.owner === p.id && !s._gone);
    if (mine.length >= sk.max + gear(data, p).snares) return 'max';
    const c = cellOf(map, x, z);
    if (!canStand(liveGrid(ctx), 'farmer', c)) return 'blocked';
    baseEnt(state, { kind: 'snare', type: 'snare', owner: p.id, team: HUNTERS, x: cellX(map, c), z: cellZ(map, c), r: 0.4, hp: 1, hpMax: 1, cell: c });
    ctx.emit('snareSet', { player: p.id });
  } else if (sk.id === 'hawk') {
    if (d2 > sk.range * sk.range) return 'reach';
    const hk = baseEnt(state, { kind: 'hawk', type: 'hawk', owner: p.id, team: HUNTERS, x: e.x, z: e.z, r: 0.3, hp: 1, hpMax: 1, tx: x, tz: z, until: -1 });
    ctx.emit('spawn', { id: hk.id, kind: 'hawk' });
  } else if (sk.id === 'horn') {
    const r2 = sk.radius * sk.radius;
    let n = 0;
    for (const a of state.ents) {
      if (a.kind !== 'animal' || !a.alive || a._gone || (a.x - e.x) * (a.x - e.x) + (a.z - e.z) * (a.z - e.z) > r2) continue;
      a.revealUntil = state.tick + secToTicks(sk.reveal);
      a.tx = a.hx; a.tz = a.hz; a.fleeUntil = state.tick + secToTicks(sk.reveal); a.nextAt = state.tick + secToTicks(sk.reveal);
      n++;
    }
    ctx.emit('horn', { player: p.id, x: e.x, z: e.z, animals: n });
  }
  p.cd[slot] = state.tick + secToTicks(sk.cooldown);
  return null;
}

// ── lodges ────────────────────────────────────────────────────────────────────────────────────────

export function lodgeRefusal(ctx, p, x, z) {
  const { state, data, map } = ctx;
  const L = HJ(data).lodge;
  if (p.role !== 'hunter') return 'role';
  const e = liveEnt(state, p.ent);
  if (!e) return 'dead';
  if (!(x >= 0 && z >= 0 && x < map.size && z < map.size)) return 'bad';
  if ((x - e.x) * (x - e.x) + (z - e.z) * (z - e.z) > L.range * L.range * 4) return 'reach';
  if (state.ents.filter(b => b.kind === 'building' && b.lodge && b.owner === p.id && b.alive && !b._gone).length >= L.max) return 'max';
  if (!canStand(liveGrid(ctx), 'hunter', cellOf(map, x, z))) return 'blocked';
  if (p.gold < L.cost) return 'gold';
  return null;
}

export function buildLodge(ctx, p, x, z) {
  const why = lodgeRefusal(ctx, p, x, z);
  if (why) return why;
  const { state, data, map } = ctx, L = HJ(data).lodge;
  p.gold -= L.cost;
  const c = cellOf(map, x, z);
  const b = baseEnt(state, { kind: 'building', type: 'lodge', owner: p.id, team: HUNTERS, x: cellX(map, c), z: cellZ(map, c), r: 1.5, hp: L.hp * 0.2, hpMax: L.hp, lodge: true, done: false, doneAt: state.tick + secToTicks(L.seconds), cells: null, paid: L.cost });
  ctx.emit('buildStart', { player: p.id, id: b.id, kind: 'lodge', x: b.x, z: b.z });
  return null;
}

// ── per-tick: hawks, hounds, wards, snares, lodges, flares, regen ────────────────────────────────

export function hunterKitTick(ctx) {
  const { state, data, map } = ctx;
  const H = HJ(data);
  for (const b of state.ents) {
    if (b._gone || !b.alive) continue;
    if (b.kind === 'building' && b.type === 'lodge' && b.done === false) {
      b.hp = Math.min(b.hpMax, b.hp + b.hpMax * 0.8 / secToTicks(H.lodge.seconds));
      if (state.tick >= b.doneAt) { b.done = true; ctx.emit('built', { player: b.owner, id: b.id, kind: 'lodge', x: b.x, z: b.z }); }
    } else if (b.kind === 'ward' && state.tick >= b.until) {
      b._gone = true; ctx.emit('despawn', { id: b.id, why: 'expired' });
    } else if (b.kind === 'hawk') {
      const dx = b.tx - b.x, dz = b.tz - b.z, L = Math.sqrt(dx * dx + dz * dz), sp = H.skills.E.speed / 20;
      if (L > sp) { b.x += dx / L * sp; b.z += dz / L * sp; }
      else { b.x = b.tx; b.z = b.tz; if (b.until < 0) { b.until = state.tick + secToTicks(H.skills.E.seconds); ctx.emit('hawkArrived', { player: b.owner, id: b.id, x: b.x, z: b.z }); } }
      if (b.until >= 0 && state.tick >= b.until) { b._gone = true; ctx.emit('despawn', { id: b.id, why: 'expired' }); }
    } else if (b.kind === 'hound') {
      // run to the nearest animal within range and bay at it (a noise every 2 s)
      let t = liveEnt(state, b.target);
      if (!t) {
        let bd = H.hound.range * H.hound.range; t = null;
        for (const a of state.ents) if (a.kind === 'animal' && a.alive && !a._gone) { const d = (a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z); if (d < bd) { bd = d; t = a; } }
        b.target = t ? t.id : -1;
      }
      if (t) {
        const dx = t.x - b.x, dz = t.z - b.z, L = Math.sqrt(dx * dx + dz * dz), sp = H.hound.speed / 20;
        if (L > 2) { const nx = b.x + dx / L * sp, nz = b.z + dz / L * sp; if (canStand(liveGrid(ctx), 'hunter', cellOf(map, nx, nz))) { b.x = nx; b.z = nz; } }
        else if (state.tick % 40 === 0) { t.revealUntil = state.tick + 40; ctx.emit('noise', { x: t.x, z: t.z, kind: 'bay', team: HUNTERS, src: b.id }); }
      }
    }
  }
  // snares spring on the first farmer (root) or army unit (slow) to step in
  const snares = state.ents.filter(s => s.kind === 'snare' && !s._gone);
  if (snares.length) {
    for (const u of state.ents) {
      if (u.team !== FARMERS || !u.alive || u._gone || (u.kind !== 'farmer' && !(u.kind === 'army' && u.type === 'scarecrow'))) continue;
      const c = cellOf(map, u.x, u.z);
      const s = snares.find(q => q.cell === c && !q._gone);
      if (!s) continue;
      if (u.kind === 'farmer') u.rootUntil = state.tick + secToTicks(H.skills.W.root);
      else u.slowUntil = state.tick + secToTicks(H.skills.W.armySlowSeconds);
      s._gone = true;
      ctx.emit('snared', { id: u.id, owner: u.owner, by: s.owner, x: s.x, z: s.z });
    }
  }
  if (state.hvf.flares.length) state.hvf.flares = state.hvf.flares.filter(f => f.until > state.tick);
  // item regeneration
  if (state.tick % 20 === 0) for (const p of state.players) {
    if (p.role !== 'hunter') continue;
    const e = liveEnt(state, p.ent), r = gear(data, p).regen;
    if (e && r > 0) e.hp = Math.min(e.hpMax, e.hp + r);
  }
}

export { nearestStandable, KIND };
