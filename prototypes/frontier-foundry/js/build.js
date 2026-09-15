// Placing things, and the Warcraft-style bit: you place an outline, builders walk to it, and the
// building goes up while they work. Nothing appears instantly except the landing pod.

import { nodeUnderFootprint, bumpMap } from './map.js';
import { invChanged, inventoryTotals } from './production.js';

const IDX = (map, x, y) => y * map.width + x;

/**
 * Total of one resource across every finished store and the pod. Read from the shared totals table
 * (see `inventoryTotals`), which is only rebuilt after something writes an inventory.
 */
export function available(game, res) {
  return inventoryTotals(game)[res] || 0;
}

/** Take a cost out of the stores, nearest to (x,y) first. Returns true if it all came out. */
export function takeCost(game, cost, x = 0, y = 0) {
  for (const [res, n] of Object.entries(cost)) if (available(game, res) < n) return false;
  const stores = game.structures.filter(s => s.state === 'done' && Object.keys(s.inv).length)
    .sort((a, b) => ((a.x - x) ** 2 + (a.y - y) ** 2) - ((b.x - x) ** 2 + (b.y - y) ** 2));
  for (const [res, n] of Object.entries(cost)) {
    let left = n;
    for (const s of stores) {
      if (left <= 0) break;
      const take = Math.min(left, s.inv[res] || 0);
      if (take > 0) { s.inv[res] -= take; if (s.inv[res] <= 0) delete s.inv[res]; invChanged(s); left -= take; }
    }
  }
  return true;
}

/**
 * The tiles a structure covers. `rot` is a quarter turn 0-3; an odd turn swaps width and height, so a
 * 5x4 refinery can also be laid down as 4x5. Square footprints are unaffected, and the facing is kept
 * on the structure only so the interface can draw it turned.
 */
export function footprint(def, rot = 0) {
  return (rot & 1) ? { w: def.size.h, h: def.size.w } : { w: def.size.w, h: def.size.h };
}

/** Can this structure go here? Returns { ok } or { ok:false, reason }. */
export function canPlace(game, typeId, x, y, { ignoreCost = false, ignoreUnlock = false, rot = 0 } = {}) {
  const def = game.data.structure[typeId];
  if (!def) return { ok: false, reason: 'no such structure' };
  if (!ignoreUnlock && !game.isUnlocked(typeId)) return { ok: false, reason: 'not researched' };
  if (def.planetRequirement && !game.planetHas(def.planetRequirement)) return { ok: false, reason: `this world has no ${def.planetRequirement}` };
  if (def.unique && game.structures.some(s => s.type === typeId && s.state !== 'dead')) return { ok: false, reason: 'only one allowed' };
  const fp = footprint(def, rot), w = fp.w, h = fp.h, map = game.map;
  if (x < 0 || y < 0 || x + w > map.width || y + h > map.height) return { ok: false, reason: 'off the map' };
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const i = IDX(map, x + dx, y + dy);
    if (map.occupied[i] >= 0) return { ok: false, reason: 'something is already there' };
    if (def.onWater) { if (!map.water[i]) return { ok: false, reason: 'must be built over water' }; continue; }
    if (map.water[i]) return { ok: false, reason: 'that is water' };
    if (!map.buildable[i] && !def.roadTier) return { ok: false, reason: 'ground is too steep' };
  }
  if (def.requiresNode) {
    // a bore follows the seam under the patch, so a patch the drills have emptied is exactly where
    // one belongs - anything else and a world's chains end when its last patch of something does
    const node = nodeUnderFootprint(map, x, y, w, h, { includeDepleted: !!def.infinite });
    if (!node) return { ok: false, reason: 'no resource node under it' };
    if (!node.scanned) return { ok: false, reason: 'nothing scanned there yet' };
    const kinds = def.requiresNode;
    const match = kinds.includes(node.kind) || kinds.includes(node.resource);
    if (!match) return { ok: false, reason: `that node is ${node.kind}, not ${kinds.join('/')}` };
    if (def.nodeResource && node.resource !== def.nodeResource) return { ok: false, reason: `needs a ${def.nodeResource} node` };
    if (node.claimedBy != null) return { ok: false, reason: 'another machine already works that node' };
  }
  if (!ignoreCost) for (const [res, n] of Object.entries(def.cost || {})) {
    if (available(game, res) < n) return { ok: false, reason: `short of ${game.data.resource[res]?.name || res}` };
  }
  return { ok: true };
}

/** Put an outline down. free:true skips the cost and finishes instantly (used for the landing pod). */
export function place(game, typeId, x, y, { free = false, instant = false, recipe = null, rot = 0 } = {}) {
  const check = canPlace(game, typeId, x, y, { ignoreCost: free, ignoreUnlock: free, rot });
  if (!check.ok) { game.notify('build_blocked', { name: game.data.structure[typeId]?.name || typeId, reason: check.reason, at: { x, y } }); return { ok: false, ...check }; }
  const def = game.data.structure[typeId];
  if (!free) takeCost(game, def.cost || {}, x, y);
  const fp = footprint(def, rot);
  // Every field a building can ever carry is written here, even the ones only some buildings use.
  // Adding a property to an object later gives it a shape of its own, and once the base holds a few
  // hundred buildings in a dozen different shapes every `s.state` in the tick loop turns into a
  // lookup rather than a field read - it was a fifth of the whole simulator's running time.
  const s = {
    id: game.nextId++, type: typeId, def, x, y, w: fp.w, h: fp.h, rot,
    state: instant || free ? 'done' : 'ghost', progress: instant || free ? (def.buildTime || 0) : 0,
    hp: def.hp || 100, maxHp: def.hp || 100,
    inv: {}, cap: def.storage || 0, recipe: recipe || null, craft: 0, crafted: 0,
    net: -1, powered: 1, enabled: true, nodeId: null, lastScan: -1e9, cooldown: 0,
    shield: def.shieldPool || 0, starvedFor: null, blocked: false, idleFor: 0,
    // set as the base runs: the storage pool and power grid, what it is doing, and the two cached
    // inventory sums (`_sum`, `_raw`) that roomFor reads
    links: [], linkRefs: null, pool: -1, busy: false, crafting: false, warned: false, duty: 0, overheating: 0,
    fuelChoice: null, recipePower: 0, charge: 0, target: null, walled: false, roaded: false,
    lastConnect: -1e9, _sum: undefined, _raw: undefined,
  };
  if (def.requiresNode) {
    const node = nodeUnderFootprint(game.map, x, y, fp.w, fp.h, { includeDepleted: !!def.infinite });
    if (node) { s.nodeId = node.id; node.claimedBy = s.id; }
  }
  if (!s.recipe) {
    const list = game.data.recipesFor[typeId] || [];
    if (list.length === 1) s.recipe = list[0];
  }
  game.structures.push(s);
  game.dropIndex();
  stamp(game, s);
  game.dirty.power = game.dirty.links = true;
  if (s.state === 'done') game.emit('structure:done', s);
  else game.notify('build_started', { name: def.name, at: { x, y }, id: s.id });
  return { ok: true, structure: s };
}

/** Write a structure's footprint into the occupancy grid (and roads into the road layer). */
export function stamp(game, s) {
  const map = game.map;
  for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) {
    const i = IDX(map, s.x + dx, s.y + dy);
    map.occupied[i] = s.id;
    if (s.def.roadTier && s.state === 'done') map.road[i] = Math.max(map.road[i], s.def.roadTier);
  }
  if (s.def.blocks && s.state === 'done') game.blocking.add(s.id);
  map.blocking = game.blocking;
  bumpMap(map);                 // the cached cost fields now have the wrong ground in them
}

/** Clear a structure off the grid. */
export function unstamp(game, s) {
  const map = game.map;
  for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) {
    const i = IDX(map, s.x + dx, s.y + dy);
    if (map.occupied[i] === s.id) map.occupied[i] = -1;
    if (s.def.roadTier) map.road[i] = 0;
  }
  game.blocking.delete(s.id);
  bumpMap(map);
}

/** Remove a structure. refund 0..1 of the cost comes back to the stores. */
export function demolish(game, id, { refund = 0.5, reason = 'demolished' } = {}) {
  const s = game.structures.find(x => x.id === id);
  if (!s) return false;
  unstamp(game, s);
  if (s.nodeId) { const n = game.map.nodes.find(n => n.id === s.nodeId); if (n) n.claimedBy = null; }
  if (refund > 0 && s.state === 'done') {
    const hq = game.hq();
    if (hq) for (const [res, n] of Object.entries(s.def.cost || {})) {
      const back = Math.floor(n * refund);
      if (back > 0) { hq.inv[res] = (hq.inv[res] || 0) + back; invChanged(hq); }
    }
  }
  game.structures = game.structures.filter(x => x.id !== id);
  game.dropIndex();
  game.routes = game.routes.filter(r => r.from !== id && r.to !== id);
  game.dirty.power = game.dirty.links = true;
  game.emit('structure:removed', { structure: s, reason });
  return true;
}

/** Cancel an unfinished outline and get the materials back. */
export function cancel(game, id) {
  const s = game.structures.find(x => x.id === id);
  if (!s || s.state === 'done') return false;
  return demolish(game, id, { refund: 1, reason: 'cancelled' });
}

/** Every outline waiting for a builder, nearest first from (x,y). */
export function pendingBuilds(game, x = 0, y = 0) {
  return game.structures.filter(s => s.state === 'ghost' || s.state === 'building')
    .sort((a, b) => ((a.x - x) ** 2 + (a.y - y) ** 2) - ((b.x - x) ** 2 + (b.y - y) ** 2));
}

/**
 * Walk the crew members the player has given a move order to. Builders drop their outline while they
 * are on the way and pick a new one up when they arrive; guards, sentinels and scouts have nothing
 * else to do, so this is the only thing that ever moves them.
 */
export function tickOrders(game, dt) {
  for (const u of game.units) {
    if (!u.alive || !u.moveTo) continue;
    const d = Math.hypot(u.moveTo.x - u.x, u.moveTo.y - u.y);
    if (d < 0.6) { u.moveTo = null; continue; }
    const step = Math.min(d, (u.def.speed || 1.5) * game.techEffect('scoutSpeed', 1) * dt);
    u.x += (u.moveTo.x - u.x) / d * step;
    u.y += (u.moveTo.y - u.y) / d * step;
    u.target = null;
  }
}

/** Builders walk to the nearest outline and work on it. Called every tick. */
export function tickBuilders(game, dt) {
  const jobs = pendingBuilds(game);
  if (!jobs.length) { for (const u of game.units) if (u.job === 'build') u.target = null; return; }
  // a crew member the player has sent somewhere walks there first; everyone else takes a job
  const free = game.units.filter(u => u.alive && u.def.buildRate && !u.moveTo);
  let k = 0;
  for (const u of free) {
    let job = u.target != null ? game.byId(u.target) : null;
    if (!job || job.state === 'done') { job = jobs[k % jobs.length]; k++; u.target = job.id; }
    const cx = job.x + job.w / 2, cy = job.y + job.h / 2;
    const d = Math.hypot(u.x - cx, u.y - cy);
    if (d > 1.6) {
      const step = Math.min(d, (u.def.speed || 1.5) * game.techEffect('scoutSpeed', 1) * dt);
      u.x += (cx - u.x) / d * step; u.y += (cy - u.y) / d * step;
      continue;
    }
    job.state = 'building';
    const bonus = game.workshopBonusAt(job.x, job.y);
    job.progress += (u.def.buildRate || 1) * (1 + bonus) * game.diff.buildSpeed * dt;
    if (job.progress >= (job.def.buildTime || 1)) finish(game, job);
  }
  // builder buggies work too, and faster
  for (const v of game.vehicles) {
    if (!v.alive || !v.def.buildRate || v.route != null) continue;
    let job = v.buildTarget != null ? game.byId(v.buildTarget) : null;
    if (!job || job.state === 'done') { job = jobs[k % jobs.length]; k++; v.buildTarget = job.id; }
    const cx = job.x + job.w / 2, cy = job.y + job.h / 2;
    const d = Math.hypot(v.x - cx, v.y - cy);
    if (d > 1.6) { const step = Math.min(d, v.def.baseSpeed * dt); v.x += (cx - v.x) / d * step; v.y += (cy - v.y) / d * step; continue; }
    job.state = 'building';
    job.progress += v.def.buildRate * game.diff.buildSpeed * dt;
    if (job.progress >= (job.def.buildTime || 1)) finish(game, job);
  }
}

function finish(game, s) {
  s.state = 'done';
  s.progress = s.def.buildTime || 0;
  stamp(game, s);
  game.dirty.power = game.dirty.links = true;
  game.notify('build_done', { name: s.def.name, at: { x: s.x, y: s.y }, id: s.id });
  // "a gun was standing before the first one arrived" is a real objective, so it needs a flag
  if (s.def.dps && s.def.category === 'defence' && game.waveNumber === 0) game.flags.turretBeforeFirstWave = true;
  game.emit('structure:done', s);
  if (s.def.spawns) for (let i = 0; i < s.def.spawns.count; i++) game.spawnUnit(s.def.spawns.unit, s.x + 1, s.y + 1);
  game.stats.built++;
}
