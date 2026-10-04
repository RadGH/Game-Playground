// Farmer buildings, breeding and income (docs/hvf-PLAN.md §5, §6). Data: data/hvf/buildings.json,
// data/hvf/animals.json. Gold is the only gate: no build timers, no income caps; each further copy of
// a building costs copyMult more.

import { KIND } from './mapgen.js';
import { liveGrid, canStand, buildingsChanged, cellX, cellZ, cellOf, nearestStandable, OCC_NONE } from './grid.js';
import { baseEnt, secToTicks, liveEnt, entById, FARMERS } from './state.js';

const BK = data => data.hvf.buildings;
const BUILDABLE = { [KIND.grass]: 1, [KIND.tallgrass]: 1, [KIND.trail]: 1 };

/** Price of the next copy of `kind` for this farmer: x copyMult for every copy STANDING (p.copies goes
 *  down when one is destroyed — decided 2026-10-04, stream E asked). Repeated multiply, never Math.pow. */
export function priceOf(data, p, kind) {
  const B = BK(data), def = B.kinds[kind];
  let c = def.cost;
  for (let i = 0; i < (p.copies[kind] || 0); i++) c *= B.copyMult;
  return Math.round(c);
}

/** Footprint cells for a building of `kind` centred near (x, z), or null when it runs off the map. */
export function footprint(map, def, x, z) {
  const [w, d] = def.size;
  const cx0 = Math.round(x / map.cell - w / 2), cz0 = Math.round(z / map.cell - d / 2);
  if (cx0 < 1 || cz0 < 1 || cx0 + w >= map.cols || cz0 + d >= map.rows) return null;
  const cells = [];
  for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) cells.push((cz0 + dz) * map.cols + cx0 + dx);
  return { cells, x: (cx0 + w / 2) * map.cell, z: (cz0 + d / 2) * map.cell };
}

/** Why a farmer cannot build `kind` at (x, z) right now, or null. */
export function buildRefusal(ctx, p, kind, x, z) {
  const { state, data, map } = ctx;
  const def = BK(data).kinds[kind];
  if (!def) return 'bad';
  if (p.role !== 'farmer') return 'role';
  if (p.ghost) return 'dead';
  if (def.onePer && (p.copies[kind] || 0) >= 1 && state.ents.some(e => e.kind === 'building' && e.type === kind && e.owner === p.id && e.alive && !e._gone)) return 'onePer';
  const fp = footprint(map, def, x, z);
  if (!fp) return 'blocked';
  const g = liveGrid(ctx), lv = map.level[fp.cells[0]];
  for (const c of fp.cells) if (!BUILDABLE[g.cells[c]] || g.occ[c] !== OCC_NONE || map.level[c] !== lv) return 'blocked';
  // never on a kennel
  for (const e of state.ents) if (e.kind === 'building' && e.type === 'kennel' && !e._gone && (e.x - fp.x) * (e.x - fp.x) + (e.z - fp.z) * (e.z - fp.z) < (e.r + 2) * (e.r + 2)) return 'blocked';
  if (def.needsProducers) {
    let n = 0;
    for (const e of state.ents) if (e.kind === 'building' && e.owner === p.id && e.alive && !e._gone && BK(data).kinds[e.type] && BK(data).kinds[e.type].makes) n++;
    if (n < def.needsProducers) return 'needs';
  }
  if (p.gold < priceOf(data, p, kind)) return 'gold';
  return null;
}

/** Place the building (the farmer has arrived). Returns the refusal or null. */
export function placeBuilding(ctx, p, kind, x, z) {
  const why = buildRefusal(ctx, p, kind, x, z);
  if (why) return why;
  const { state, data, map } = ctx;
  const def = BK(data).kinds[kind], fp = footprint(map, def, x, z), price = priceOf(data, p, kind);
  p.gold -= price;
  p.copies[kind] = (p.copies[kind] || 0) + 1;
  const b = baseEnt(state, {
    kind: 'building', type: kind, owner: p.id, team: FARMERS, x: fp.x, z: fp.z, r: Math.max(def.size[0], def.size[1]) * map.cell / 2,
    hp: def.hp, hpMax: def.hp, cells: fp.cells, blocks: def.blocks, opaque: !!def.opaque, paid: price,
    breedAt: def.makes ? state.tick : -1, rally: null, comfort: 0,
  });
  buildingsChanged(ctx);
  // anything standing on the footprint steps aside
  const g = liveGrid(ctx);
  const inFp = new Set(fp.cells);
  for (const e of state.ents) {
    if (e.kind === 'building' || e._gone || !inFp.has(cellOf(map, e.x, e.z))) continue;
    const c = nearestStandable(ctx, g, e.kind === 'hunter' ? 'hunter' : 'farmer', cellOf(map, e.x, e.z));
    if (c >= 0) { e.x = e.px = cellX(map, c); e.z = e.pz = cellZ(map, c); }
  }
  if (def.makes) b.comfort = comfortOf(ctx, b, data.hvf.animals.kinds[def.makes].wander);
  ctx.emit('built', { player: p.id, id: b.id, kind, x: b.x, z: b.z, cost: price });
  return null;
}

/** Open cells (animal footing) within the wander radius, / comfortCells (§5 crowding). */
export function comfortOf(ctx, b, wander) {
  const { map, data } = ctx;
  const g = liveGrid(ctx), R = Math.ceil(wander / map.cell), cx = Math.floor(b.x / map.cell), cz = Math.floor(b.z / map.cell);
  let open = 0;
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    if (dx * dx + dz * dz > R * R) continue;
    const x = cx + dx, z = cz + dz;
    if (x < 0 || z < 0 || x >= map.cols || z >= map.rows) continue;
    if (canStand(g, 'animal', z * map.cols + x)) open++;
  }
  return Math.max(1, Math.floor(open / data.hvf.animals.rules.comfortCells));
}

/** Breeding: each producer adds one animal at a time up to its capacity (and the caps). */
export function breedTick(ctx) {
  const { state, data, map } = ctx;
  const A = data.hvf.animals, B = BK(data);
  let total = 0;
  const perFarmer = {}, perHome = {};
  for (const e of state.ents) if (e.kind === 'animal' && e.alive && !e._gone) { total++; perFarmer[e.owner] = (perFarmer[e.owner] || 0) + 1; perHome[e.home] = (perHome[e.home] || 0) + 1; }
  for (const b of state.ents) {
    if (b.kind !== 'building' || !b.alive || b._gone || b.team !== FARMERS) continue;
    const def = B.kinds[b.type];
    if (!def.makes) continue;
    const p = state.players[b.owner];
    if (p.ghost || (perHome[b.id] || 0) >= def.cap || (perFarmer[p.id] || 0) >= A.rules.capPerFarmer || total >= A.rules.capMatch) { b.breedAt = -1; continue; }
    if (b.breedAt < 0) { b.breedAt = state.tick + secToTicks(A.kinds[def.makes].breed * (p.upgrades.breeding ? B.upgrades.breeding.breedMult : 1)); continue; }
    if (state.tick < b.breedAt) continue;
    const a = spawnAnimal(ctx, b, def.makes);
    if (a) { total++; perFarmer[p.id] = (perFarmer[p.id] || 0) + 1; perHome[b.id] = (perHome[b.id] || 0) + 1; }
    b.breedAt = -1;
  }
}

function spawnAnimal(ctx, b, kind) {
  const { state, data, map } = ctx;
  const A = data.hvf.animals.kinds[kind];
  const g = liveGrid(ctx);
  const c = nearestStandable(ctx, g, 'animal', cellOf(map, b.x, b.z + b.r + 1));
  if (c < 0) return null;
  const x = cellX(map, c), z = cellZ(map, c);
  const goal = b.rally || { x, z };
  const a = baseEnt(state, {
    kind: 'animal', type: kind, owner: b.owner, team: FARMERS, home: b.id, hx: b.x, hz: b.z, x, z, r: A.radius,
    hp: A.hp, hpMax: A.hp, tx: goal.x, tz: goal.z, nextAt: state.tick + 20, fleeUntil: -1, stray: false, wild: false,
  });
  ctx.emit('animalBorn', { player: b.owner, id: a.id, kind, home: b.id, x, z });
  return a;
}

/** Gold per second a farmer earns right now (and its parts, for the HUD). */
export function incomeOf(ctx, p) {
  const { state, data } = ctx;
  const A = data.hvf.animals.kinds, B = BK(data).kinds;
  let animals = 0, flat = 0, pct = 0;
  if (p.ghost) return { total: 0, animals: 0, flat: 0, pct: 0 };
  for (const e of state.ents) {
    if (e.owner !== p.id || !e.alive || e._gone) continue;
    if (e.kind === 'animal' && !e.wild) animals += A[e.type].income * (e.type === 'sheep' && p.upgrades.shears ? 1 + BK(data).upgrades.shears.sheepPct : 1);
    else if (e.kind === 'building' && B[e.type]) { flat += B[e.type].flat || 0; pct += B[e.type].incomePct || 0; }
  }
  animals *= 1 + (p.upgrades.feed || 0) * BK(data).upgrades.feed.animalIncomePct;
  return { total: (animals + flat) * (1 + pct), animals, flat, pct };
}

/** Pay income every rules.incomeEvery seconds; hunters get their trickle once released. */
export function incomeTick(ctx) {
  const { state, data } = ctx;
  const every = secToTicks(data.hvf.rules.incomeEvery);
  if (state.tick % every !== 0) return;
  for (const p of state.players) {
    if (p.role === 'farmer') {
      const inc = incomeOf(ctx, p).total * data.hvf.rules.incomeEvery;
      p.income = inc / data.hvf.rules.incomeEvery;
      p.gold += inc; p.stats.earned += inc;
    } else if (state.tick >= state.hvf.releaseTick && !p.out) {
      const inc = data.hvf.units.hunter.goldPerSecond * data.hvf.rules.incomeEvery;
      p.income = data.hvf.units.hunter.goldPerSecond;
      p.gold += inc; p.stats.earned += inc;
    }
  }
}

/** Farm upgrades (command `upgrade {id}`): the next rank's price, or null at max. */
export function upgradeCost(data, p, id) {
  const U = BK(data).upgrades[id];
  if (!U || id === 'order') return null;
  const r = p.upgrades[id] || 0;
  return r < U.costs.length ? U.costs[r] : null;
}

export function buyUpgrade(ctx, p, id) {
  if (p.role !== 'farmer') return 'role';
  if (p.ghost) return 'dead';
  if (typeof id !== 'string' || !BK(ctx.data).upgrades[id] || id === 'order') return 'bad';
  const c = upgradeCost(ctx.data, p, id);
  if (c == null) return 'max';
  if (p.gold < c) return 'gold';
  p.gold -= c;
  p.upgrades[id] = (p.upgrades[id] || 0) + 1;
  ctx.emit('upgrade', { player: p.id, id, rank: p.upgrades[id], cost: c });
  // Stuffing reaches the scarecrows already standing
  if (id === 'stuffing') for (const u of ctx.state.ents) if (u.kind === 'army' && u.type === 'scarecrow' && u.owner === p.id && u.alive) {
    const m = 1 + p.upgrades.stuffing * BK(ctx.data).upgrades.stuffing.armyPct, base = ctx.data.hvf.units.army.scarecrow.hp;
    u.hp = u.hp / u.hpMax * base * m; u.hpMax = base * m;
  }
  return null;
}

export { entById, liveEnt };
