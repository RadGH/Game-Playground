// Everything the player does to the map, as plain functions that check, price and apply. Each has a `quote` (what
// it would cost and why it can't be done — shown on the ghost before you let go) and an `apply`. The quote IS the
// result (lessons Part 3 "the preview is exactly the result").
import { item, cat, unlocked, materials } from './catalog.js';
import { isFlat, levelCost, level, DEP_NAMES } from './terrain.js';
import { ZONE } from './region.js';
import { T } from './tuning.js';

const inMap = (r, x, z) => x >= 0 && z >= 0 && x < r.size && z < r.size;
const occupied = (r, i) => r.tiles.lot[i] >= 0 || r.tiles.wall[i] > 0 || r.turrets.some(t => t.z * r.size + t.x === i);

/** Tiles along an L-shaped drag from (x0,z0) to (x1,z1): straight along the longer axis first (roads, walls, lines). */
export function lineTiles(x0, z0, x1, z1) {
  const out = []; const sx = Math.sign(x1 - x0) || 1, sz = Math.sign(z1 - z0) || 1;
  if (Math.abs(x1 - x0) >= Math.abs(z1 - z0)) { for (let x = x0; x !== x1 + sx; x += sx) out.push([x, z0]); for (let z = z0 + sz; z !== z1 + sz; z += sz) out.push([x1, z]); }
  else { for (let z = z0; z !== z1 + sz; z += sz) out.push([x0, z]); for (let x = x0 + sx; x !== x1 + sx; x += sx) out.push([x, z1]); }
  return out.filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
}
export function rectTiles(x0, z0, x1, z1) { const out = []; for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) out.push([x, z]); return out; }

function afford(r, cost, mats = {}) {
  if (r.money - cost < 0 && cost > 0) return `Needs ${Math.round(cost)} credits`;
  for (const [k, v] of Object.entries(mats)) if ((r.stock[k] || 0) < v) return `Needs ${v} ${k === 'cells' ? 'Power cells' : k[0].toUpperCase() + k.slice(1)}`;
  return null;
}
function pay(r, cost, mats = {}) { r.money -= cost; for (const [k, v] of Object.entries(mats)) r.stock[k] -= v; }

// ---------------- roads ----------------
export function quoteRoad(r, tiles, level = 1) {
  const kind = cat().roads[level - 1];
  if (!unlocked(r, kind)) return { ok: false, why: `${kind.name}s unlock at a later milestone`, cost: 0, tiles: [] };
  const good = []; let cost = 0, why = null;
  for (let n = 0; n < tiles.length; n++) {
    const [x, z] = tiles[n]; if (!inMap(r, x, z)) continue; const i = z * r.size + x;
    if (r.tiles.road[i] >= level) continue;
    if (r.tiles.lot[i] >= 0) { why = 'A building is in the way'; continue; }
    if (r.tiles.wall[i] && !item(r.tiles.wall[i] === 2 ? 'gate' : 'wall-1')?.gate && r.tiles.wall[i] !== 2) { why = 'A wall is in the way — put a gate there'; continue; }
    if (r.ter.water[i]) {  // bridges: allowed straight across water, cost more
      cost += kind.cost * 6; good.push([x, z, 'bridge']); continue;
    }
    // climbing: one level per tile at most
    const prev = tiles[n - 1]; if (prev && inMap(r, prev[0], prev[1])) { const pi = prev[1] * r.size + prev[0]; if (!r.ter.water[pi] && Math.abs(r.ter.height[i] - r.ter.height[pi]) > 1) { why = 'Too steep: level the ground first'; continue; } }
    cost += kind.cost * (r.tiles.road[i] ? 0.6 : 1); good.push([x, z]);
  }
  const broke = afford(r, cost);
  return { ok: good.length > 0 && !broke, why: broke || why, cost: Math.round(cost), tiles: good };
}
export function buildRoad(r, tiles, level = 1) {
  const q = quoteRoad(r, tiles, level); if (!q.ok) return q;
  for (const [x, z] of q.tiles) { const i = z * r.size + x; r.tiles.road[i] = level; r.tiles.zone[i] = 0; r.ter.flora[i] = 0; }
  pay(r, q.cost); r.dirty = true; return q;
}

// ---------------- zones ----------------
export function quoteZone(r, tiles, zone) {
  let n = 0; for (const [x, z] of tiles) { if (!inMap(r, x, z)) continue; const i = z * r.size + x; if (!r.ter.water[i] && !r.tiles.road[i] && !occupied(r, i) && r.tiles.zone[i] !== zone) n++; }
  const cost = n * 5; const broke = afford(r, cost);
  return { ok: n > 0 && !broke, why: broke || (n ? null : 'Nothing to zone here'), cost, count: n };
}
export function paintZone(r, tiles, zone) {
  const q = quoteZone(r, tiles, zone); if (!q.ok) return q;
  for (const [x, z] of tiles) { if (!inMap(r, x, z)) continue; const i = z * r.size + x; if (!r.ter.water[i] && !r.tiles.road[i] && !occupied(r, i)) r.tiles.zone[i] = zone; }
  pay(r, q.cost); r.dirty = true; return q;
}

// ---------------- lines: power lines and water pipes ----------------
export function quoteLine(r, tiles, layer) {
  const per = layer === 'power' ? 18 : 12;
  let n = 0; for (const [x, z] of tiles) { if (!inMap(r, x, z)) continue; const i = z * r.size + x; if (!r.tiles[layer][i] && !(layer === 'power' && r.ter.water[i] === 2)) n++; }
  const cost = n * per, broke = afford(r, cost);
  return { ok: n > 0 && !broke, why: broke || (n ? null : 'Already there'), cost, count: n };
}
export function buildLine(r, tiles, layer) {
  const q = quoteLine(r, tiles, layer); if (!q.ok) return q;
  for (const [x, z] of tiles) { if (!inMap(r, x, z)) continue; const i = z * r.size + x; if (!(layer === 'power' && r.ter.water[i] === 2)) r.tiles[layer][i] = 1; }
  pay(r, q.cost); r.dirty = true; return q;
}

// ---------------- placed buildings ----------------
export function quotePlace(r, id, x, z) {
  const e = item(id); if (!e) return { ok: false, why: 'Unknown building' };
  if (!unlocked(r, e)) return { ok: false, why: `Unlocks at milestone ${e.unlock}` };
  const [w, d] = e.size;
  if (!inMap(r, x, z) || !inMap(r, x + w - 1, z + d - 1)) return { ok: false, why: 'Off the edge of the region' };
  if (e.unique && r.lots.some(l => l.id === id)) return { ok: false, why: 'You already have one' };
  for (let k = 0; k < d; k++) for (let j = 0; j < w; j++) { const i = (z + k) * r.size + x + j; if (occupied(r, i)) return { ok: false, why: 'Something is in the way' }; if (r.tiles.road[i]) return { ok: false, why: 'A road is in the way' }; }
  if (!isFlat(r.ter, x, z, w, d)) return { ok: false, why: 'The ground must be flat and dry — level it first' };
  if (e.deposit) {
    let n = 0; for (let k = 0; k < d; k++) for (let j = 0; j < w; j++) if (DEP_NAMES[r.ter.deposit[(z + k) * r.size + x + j]] === e.deposit) n++;
    if (!n) return { ok: false, why: `Build it on a ${e.deposit} deposit` };
  }
  if (e.nearWater) {
    let wet = false; for (let k = -1; k <= d && !wet; k++) for (let j = -1; j <= w && !wet; j++) { const tx = x + j, tz = z + k; if (inMap(r, tx, tz) && r.ter.water[tz * r.size + tx]) wet = true; }
    if (!wet) return { ok: false, why: 'Must stand next to water' };
  }
  const mats = materials(e), broke = afford(r, e.cost, mats);
  return { ok: !broke, why: broke, cost: e.cost, mats };
}
export function place(r, id, x, z, extra = {}) {
  const q = quotePlace(r, id, x, z); if (!q.ok) return q;
  const e = item(id); const [w, d] = e.size;
  const lot = { n: r.nextLot = (r.nextLot || 0) + 1, id, kind: 'placed', x, z, w, d, recipe: e.recipe, params: { ...(e.params || {}), seed: (x * 31 + z * 17) % 997 + 1, ...extra.params },
    power: e.power ?? 0, water: e.water ?? 0, people: e.people ?? 0, jobs: e.jobs ?? 0, upkeep: e.upkeep ?? 0, built: r.day, hp: 1 };
  addLot(r, lot); pay(r, q.cost, q.mats); r.dirty = true;
  return { ...q, lot };
}
export function addLot(r, lot) {
  const idx = r.lots.length; r.lots.push(lot);
  for (let k = 0; k < lot.d; k++) for (let j = 0; j < lot.w; j++) { const i = (lot.z + k) * r.size + lot.x + j; r.tiles.lot[i] = idx; r.ter.flora[i] = 0; }
  return lot;
}
export function reindexLots(r) { r.tiles.lot.fill(-1); r.lots.forEach((l, idx) => { for (let k = 0; k < l.d; k++) for (let j = 0; j < l.w; j++) r.tiles.lot[(l.z + k) * r.size + l.x + j] = idx; }); }

// ---------------- walls + turrets ----------------
export function quoteWall(r, tiles, id = 'wall-1') {
  const e = item(id); if (!unlocked(r, e)) return { ok: false, why: `${e.name} unlocks later`, cost: 0, tiles: [] };
  const good = [];
  for (const [x, z] of tiles) { if (!inMap(r, x, z)) continue; const i = z * r.size + x; if (r.ter.water[i] || occupied(r, i)) continue; if (r.tiles.road[i] && !e.gate) continue; good.push([x, z]); }
  const per = materials(e), mats = Object.fromEntries(Object.entries(per).map(([k, v]) => [k, v * good.length]));
  const cost = e.cost * good.length, broke = afford(r, cost, mats);
  return { ok: good.length > 0 && !broke, why: broke || (good.length ? null : 'Nowhere to build here'), cost, mats, tiles: good };
}
export function buildWall(r, tiles, id = 'wall-1') {
  const q = quoteWall(r, tiles, id); if (!q.ok) return q;
  const e = item(id), tier = e.params?.tier ?? 1;
  for (const [x, z] of q.tiles) { const i = z * r.size + x; r.tiles.wall[i] = e.gate ? 9 : tier; r.tiles.wallHp[i] = e.hp; r.tiles.zone[i] = 0; r.ter.flora[i] = 0; }
  pay(r, q.cost, q.mats); r.dirty = true; r.wallsChanged = true; return q;
}
/** Gate on a road: a road tile drawn over with the Gate tool. */
export function quoteTurret(r, id, x, z) {
  const e = item(id); if (!e?.turret) return { ok: false, why: 'Not a turret' };
  if (!unlocked(r, e)) return { ok: false, why: `${e.name} unlocks later` };
  if (!inMap(r, x, z)) return { ok: false, why: 'Off the map' };
  const i = z * r.size + x; if (r.ter.water[i] || occupied(r, i) || r.tiles.road[i] || r.turrets.some(t => t.x === x && t.z === z)) return { ok: false, why: 'Something is in the way' };
  const mats = materials(e), broke = afford(r, e.cost, mats); return { ok: !broke, why: broke, cost: e.cost, mats };
}
export function buildTurret(r, id, x, z) {
  const q = quoteTurret(r, id, x, z); if (!q.ok) return q;
  const e = item(id);
  r.turrets.push({ id, kind: e.turret, x, z, power: -(e.power ?? -3), upkeep: e.upkeep, built: r.day, heading: -Math.PI / 4 });
  r.tiles.wall[z * r.size + x] = 0; r.ter.flora[z * r.size + x] = 0; r.tiles.zone[z * r.size + x] = 0;   // nothing grows on a turret
  pay(r, q.cost, q.mats); r.dirty = true; r.wallsChanged = true; return q;
}

// ---------------- bulldoze + level ----------------
export function quoteBulldoze(r, tiles) {
  let n = 0; for (const [x, z] of tiles) { if (!inMap(r, x, z)) continue; const i = z * r.size + x; if (r.tiles.road[i] || r.tiles.lot[i] >= 0 || r.tiles.wall[i] || r.tiles.power[i] || r.tiles.zone[i] || r.turrets.some(t => t.x === x && t.z === z)) n++; }
  const cost = n * 8; return { ok: n > 0 && r.money >= cost, why: n ? (r.money >= cost ? null : `Needs ${cost} credits`) : 'Nothing to clear', cost };
}
export function bulldoze(r, tiles) {
  const q = quoteBulldoze(r, tiles); if (!q.ok) return q;
  const kill = new Set();
  for (const [x, z] of tiles) {
    if (!inMap(r, x, z)) continue; const i = z * r.size + x;
    const li = r.tiles.lot[i]; if (li >= 0 && r.lots[li].id !== 'col-core') kill.add(li);
    r.tiles.road[i] = 0; r.tiles.wall[i] = 0; r.tiles.wallHp[i] = 0; r.tiles.power[i] = 0; r.tiles.zone[i] = 0;
    r.turrets = r.turrets.filter(t => !(t.x === x && t.z === z));
  }
  if (kill.size) { r.lots = r.lots.filter((_, idx) => !kill.has(idx)); reindexLots(r); }
  r.money -= q.cost; r.dirty = true; r.wallsChanged = true; return q;
}
export function quoteLevel(r, x, z, w, d, to) {
  const { cost, changed } = levelCost(r.ter, x, z, w, d, to, T.levelCost ?? 120);
  for (let k = 0; k < d; k++) for (let j = 0; j < w; j++) { const tx = x + j, tz = z + k; if (inMap(r, tx, tz) && occupied(r, tz * r.size + tx)) return { ok: false, why: 'Clear the buildings first', cost }; }
  const broke = afford(r, cost); return { ok: changed > 0 && !broke, why: broke || (changed ? null : 'Already level'), cost };
}
export function levelGround(r, x, z, w, d, to) { const q = quoteLevel(r, x, z, w, d, to); if (!q.ok) return q; level(r.ter, x, z, w, d, to); pay(r, q.cost); r.dirty = true; r.terrainChanged = true; return q; }
export { ZONE };

// ---------------- repair walls ----------------
const WALL_MAX = { 1: 220, 2: 520, 3: 1100, 9: 300 };
export function wallMax(r, i) { const v = r.tiles.wall[i]; return (WALL_MAX[v] || 300) * (r.wallHpMul || 1); }
/** Repair every damaged wall in the tiles: 1 credit per 2 points of wall health restored. */
export function quoteRepair(r, tiles) {
  let pts = 0; for (const [x, z] of tiles) { if (!inMap(r, x, z)) continue; const i = z * r.size + x; if (r.tiles.wall[i]) pts += Math.max(0, wallMax(r, i) - r.tiles.wallHp[i]); }
  const cost = Math.ceil(pts / 2), broke = afford(r, cost);
  return { ok: pts > 0 && !broke, why: broke || (pts ? null : 'Nothing damaged here'), cost };
}
export function repairWalls(r, tiles) {
  const q = quoteRepair(r, tiles); if (!q.ok) return q;
  for (const [x, z] of tiles) { if (!inMap(r, x, z)) continue; const i = z * r.size + x; if (r.tiles.wall[i]) r.tiles.wallHp[i] = wallMax(r, i); }
  pay(r, q.cost); r.wallsChanged = true; return q;
}
