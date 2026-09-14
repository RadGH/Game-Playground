// Digging, making and powering.
//
// The rule that shapes a base: a machine can use any store within reach for free (the "link"), and
// anything further away needs a truck. So bases come out as tight clusters joined by roads, which is
// exactly the shape we want.

import { daylight, gridSatisfaction, damageAfterArmor } from './rules.js';
import { harvestTile } from './map.js';

export const centre = s => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Is this building a store other machines may put things into? A machine has a buffer, but that
 * buffer is for its own inputs and outputs - letting a drill dump ore into an assembler is how a
 * base silts up and stops.
 */
export function isStore(def) {
  return !!def.storage && (def.category === 'logistics' || def.category === 'base' || !!def.accepts);
}

/** Can this store hold that resource? */
export function accepts(game, store, res) {
  const def = store.def;
  if (!isStore(def)) return false;
  const list = def.accepts;
  if (!list) return true;
  const r = game.data.resource[res];
  if (!r) return false;
  if (list.includes('bulk')) return r.tags?.includes('bulk') || ['ore', 'mineral'].includes(r.kind);
  return list.includes(r.phase === 'liquid' ? 'liquid' : r.phase === 'gas' ? 'gas' : 'solid');
}

/**
 * Will this building take a delivery of that resource?
 *
 * A store holds whatever its accepts list allows. A machine is not a store, but a truck can still
 * drop a load straight into its own input buffer when the recipe it is running - or one it could
 * run - eats that resource. That is the case the route tool kept refusing: a biomass harvester an
 * awkward walk from a kiln, with nowhere sensible to put a depot in between.
 */
export function acceptsDelivery(game, s, res) {
  if (accepts(game, s, res)) return true;
  if (!s.def.storage) return false;
  const ids = new Set([s.recipe, ...(game.data.recipesFor[s.type] || [])].filter(Boolean));
  for (const id of ids) if (game.data.recipe[id]?.inputs?.[res] != null) return true;
  return false;
}

/** How much is in a structure right now. */
export const load = s => Object.values(s.inv).reduce((a, b) => a + b, 0);
export const space = s => Math.max(0, (s.cap || 0) - load(s));

/**
 * How much MORE of one resource a store will take.
 *
 * Raw materials are capped: no more than a quarter of a store for one ore, and no more than half
 * the store for raw materials put together. Without that, three drills fill every crate in the base
 * with ore, the smelters have nowhere to put their ingots, and the whole factory deadlocks on eight
 * iron plate it can no longer make. Finished goods are not capped - they are what the store is for.
 * Silos, fluid tanks and gas tanks hold one kind of thing anyway, so they have no limit at all.
 */
export const SHARE_PER_RESOURCE = 0.25;
export const RAW_SHARE_TOTAL = 0.5;
const RAW_KIND = new Set(['ore', 'mineral', 'fluid', 'gas', 'organic', 'rare']);

/** These keep their power in a brownout; everything else is shed first. */
export const PRIORITY = new Set(['extraction', 'defence', 'scan', 'power', 'base']);

export function roomFor(game, store, res) {
  const free = space(store);
  const a = store.def.accepts;
  if (a && a.length === 1 && a[0] !== 'solid') return free;                // silo / fluid tank / gas tank
  const def = game.data.resource[res];
  if (!def || !RAW_KIND.has(def.kind)) return free;
  let rawLoad = 0;
  for (const [k, v] of Object.entries(store.inv)) {
    const d = game.data.resource[k];
    if (d && RAW_KIND.has(d.kind)) rawLoad += v;
  }
  return Math.max(0, Math.min(free,
    (store.cap || 0) * RAW_SHARE_TOTAL - rawLoad,
    (store.cap || 0) * SHARE_PER_RESOURCE - (store.inv[res] || 0)));
}

/**
 * Rebuild the storage pools.
 *
 * Two stores whose link ranges overlap relay to each other, so a run of stores forms one pool the
 * way a run of poles forms one power grid. A machine joins the pool of any store that reaches it,
 * and can then draw from and deliver to every store in that pool without a truck. Anything outside
 * every pool - an outpost across the map - needs a delivery route.
 */
export function recomputeLinks(game) {
  const stores = game.structures.filter(s => s.state === 'done' && isStore(s.def));
  const parent = new Map(stores.map(s => [s.id, s.id]));
  const find = a => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  const reach = (a, b) => Math.max(a.def.linkRadius || 0, b.def.linkRadius || 0) + Math.max(a.w, a.h) / 2 + Math.max(b.w, b.h) / 2;
  // cache the centres once: this runs over every pair of stores and used to be the sim's hot spot
  const cx = stores.map(s => s.x + s.w / 2), cy = stores.map(s => s.y + s.h / 2);
  for (let i = 0; i < stores.length; i++) for (let j = i + 1; j < stores.length; j++) {
    const r = reach(stores[i], stores[j]);
    const dx = cx[i] - cx[j], dy = cy[i] - cy[j];
    if (dx * dx + dy * dy <= r * r) { const ra = find(stores[i].id), rb = find(stores[j].id); if (ra !== rb) parent.set(ra, rb); }
  }
  const pools = new Map();
  for (const s of stores) { const r = find(s.id); if (!pools.has(r)) pools.set(r, []); pools.get(r).push(s.id); }
  const hoppers = new Map();                       // pool -> machines holding goods in their own buffer
  for (const s of game.structures) {
    s.links = [];
    s.pool = -1;
    if (s.state !== 'done') continue;
    if (isStore(s.def)) { s.pool = find(s.id); s.links = pools.get(s.pool).filter(id => id !== s.id); continue; }
    const mx = s.x + s.w / 2, my = s.y + s.h / 2;
    let best = null, bestD = Infinity;
    for (let k = 0; k < stores.length; k++) {
      const st = stores[k];
      const d = Math.hypot(mx - cx[k], my - cy[k]) - reach(s, st);
      if (d <= 0 && d < bestD) { bestD = d; best = st; }
    }
    if (best) {
      s.pool = find(best.id);
      s.links = pools.get(s.pool).slice();
      if (s.cap > 0) { if (!hoppers.has(s.pool)) hoppers.set(s.pool, []); hoppers.get(s.pool).push(s); }
    }
  }
  game.pools = pools;
  game.hoppers = hoppers;
  game.dirty.links = false;
  rebuildPoolTotals(game);
}

/**
 * How much of everything each storage pool is holding, as one cached table.
 *
 * Without it, every machine sums every store in its pool every tick looking for its inputs, which on
 * a 200-building base is millions of lookups a second and was most of the simulator's running time.
 * pull() and push() keep it in step, and step() rebuilds it once a tick so anything that writes an
 * inventory directly (quest rewards, a truck unloading, a rocket loading) cannot make it drift.
 */
export function rebuildPoolTotals(game) {
  const totals = new Map();
  for (const s of game.structures) {
    if (s.state !== 'done' || s.pool == null || s.pool < 0) continue;
    let t = totals.get(s.pool);
    if (!t) totals.set(s.pool, (t = Object.create(null)));
    for (const k in s.inv) t[k] = (t[k] || 0) + s.inv[k];
  }
  game.poolTotals = totals;
  return totals;
}

/** Keep the cached table in step with a single transfer. */
function bump(game, pool, res, delta) {
  if (pool == null || pool < 0 || !game.poolTotals) return;
  let t = game.poolTotals.get(pool);
  if (!t) game.poolTotals.set(pool, (t = Object.create(null)));
  t[res] = Math.max(0, (t[res] || 0) + delta);
}

/** Take up to n of a resource from a structure's own buffer, then anywhere in its storage pool. */
export function pull(game, s, res, n) {
  let got = 0;
  const pool = s.pool;
  const take = t => { const k = Math.min(n - got, t.inv[res] || 0); if (k > 0) { t.inv[res] -= k; if (t.inv[res] <= 1e-9) delete t.inv[res]; got += k; } };
  take(s);
  if (got >= n) { bump(game, pool, res, -got); return got; }
  for (const id of s.links || []) { const t = game.byId(id); if (t) take(t); if (got >= n) break; }
  if (got >= n || s.pool == null || s.pool < 0) { if (got > 0) bump(game, pool, res, -got); return got; }
  // last resort: take it out of a neighbour's output hopper. A machine that finished a craft with
  // nowhere to put it would otherwise sit on the goods and starve the machine next to it.
  for (const t of game.hoppers?.get(s.pool) || []) {
    if (t === s || t.state !== 'done') continue;
    take(t);
    if (got >= n) break;
  }
  if (got > 0) bump(game, pool, res, -got);
  return got;
}

/** Put n of a resource into the pool, then the machine's own buffer. Returns what fitted. */
export function push(game, s, res, n) {
  let left = n;
  for (const id of s.links || []) {
    if (left <= 0) break;
    const t = game.byId(id);
    if (!t || t.state !== 'done' || !accepts(game, t, res)) continue;
    const k = Math.min(left, roomFor(game, t, res));
    if (k > 0) { t.inv[res] = (t.inv[res] || 0) + k; left -= k; }
  }
  if (left > 0 && s.cap > 0) { const k = Math.min(left, space(s)); if (k > 0) { s.inv[res] = (s.inv[res] || 0) + k; left -= k; } }
  if (n - left > 0) bump(game, s.pool, res, n - left);
  return n - left;
}

/**
 * How much of a resource a machine can see: its own buffer, every store in its pool, and any
 * neighbour's output hopper - pull() can reach all three, so visible() has to agree with it or a
 * generator will sit idle next to a drill that is holding the coal.
 */
export function visible(game, s, res) {
  if (s.pool != null && s.pool >= 0 && game.poolTotals) {
    const t = game.poolTotals.get(s.pool);
    if (t) return t[res] || 0;
  }
  return s.inv[res] || 0;
}

// ------------------------------------------------------------------ power

/** Group the base into power networks and work out how well each one is doing. */
export function recomputePower(game) {
  const done = game.structures.filter(s => s.state === 'done');
  const suppliers = done.filter(s => (s.def.supplyRadius || 0) > 0);
  const parent = new Map(suppliers.map(s => [s.id, s.id]));
  const find = a => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };
  const sx = suppliers.map(s => s.x + s.w / 2), sy = suppliers.map(s => s.y + s.h / 2);
  for (let i = 0; i < suppliers.length; i++) for (let j = i + 1; j < suppliers.length; j++) {
    const r = suppliers[i].def.supplyRadius + suppliers[j].def.supplyRadius;
    const dx = sx[i] - sx[j], dy = sy[i] - sy[j];
    if (dx * dx + dy * dy <= r * r) union(suppliers[i].id, suppliers[j].id);
  }
  const nets = new Map();
  for (const s of suppliers) {
    const root = find(s.id);
    if (!nets.has(root)) nets.set(root, { id: root, members: [], gen: 0, use: 0, store: 0, charge: 0, satisfaction: 1 });
    nets.get(root).members.push(s.id);
    s.net = root;
  }
  for (const s of done) {
    if ((s.def.supplyRadius || 0) > 0) continue;
    s.net = -1;
    let best = null, bestD = Infinity;
    const mx = s.x + s.w / 2, my = s.y + s.h / 2, half = Math.max(s.w, s.h) / 2;
    for (let k = 0; k < suppliers.length; k++) {
      const sup = suppliers[k];
      const d = Math.hypot(mx - sx[k], my - sy[k]) - half;
      if (d <= sup.def.supplyRadius && d < bestD) { bestD = d; best = sup; }
    }
    if (best) { s.net = find(best.id); nets.get(s.net).members.push(s.id); }
  }
  game.networks = [...nets.values()];
  game.dirty.power = false;
}

/**
 * What a generator could put out right now, without burning anything yet. Returns 0 if it has no
 * fuel or no coolant, so the grid never counts power it cannot actually make.
 */
export function generatorPotential(game, s) {
  const def = s.def;
  if (!def.powerGen) return 0;
  let out = def.powerGen;
  if (def.dayOnly) out *= daylight(game.time, game.planet.dayLength) * (game.hazardSolar ? game.hazardSolar() : 1);
  if (def.weatherVaries) out *= game.weatherPower(def);
  if (out <= 0) return 0;
  if (def.fuelInput) {
    const fuels = { ...def.fuelInput, ...(def.altFuel || {}) };
    s.fuelChoice = null;
    for (const [res, perSec] of Object.entries(fuels)) if (visible(game, s, res) >= perSec * 0.5) { s.fuelChoice = [res, perSec]; break; }
    if (!s.fuelChoice) return 0;
  }
  if (def.coolant) for (const [res, perSec] of Object.entries(def.coolant)) if (visible(game, s, res) < perSec) return 0;
  return out;
}

/**
 * Burn what the grid actually asked for. duty is 0..1 - a generator carrying half the load burns
 * half the fuel, which is why a base with spare capacity does not drain its coal overnight.
 */
export function burnFuel(game, s, dt, duty) {
  const def = s.def;
  if (duty <= 0) { s.duty = 0; return; }
  s.duty = duty;
  if (def.fuelInput && s.fuelChoice) pull(game, s, s.fuelChoice[0], s.fuelChoice[1] * dt * duty);
  if (def.coolant) for (const [res, perSec] of Object.entries(def.coolant)) pull(game, s, res, perSec * dt);
  s.overheating = 0;
}

/** One second of the grid: generate, spend, charge and discharge batteries, set satisfaction. */
export function tickPower(game, dt) {
  if (game.dirty.power) recomputePower(game);
  const byNet = new Map(game.networks.map(n => [n.id, n]));
  const loose = { id: -1, gen: 0, use: 0, store: 0, charge: 0, satisfaction: 0, members: [], gens: [] };
  for (const n of game.networks) { n.gen = 0; n.use = 0; n.usePriority = 0; n.store = 0; n.charge = 0; n.gens = []; }
  // what everything wants
  for (const s of game.structures) {
    if (s.state !== 'done') continue;
    const n = byNet.get(s.net) || loose;
    if (s.def.powerStore) { n.store += s.def.powerStore; n.charge += (s.charge || 0); }
    if (s.def.powerUse && s.enabled) {
      // a deep cold means every building is also running a heater
      const draw = s.def.powerUse * (s.busy ? 1 : 0.25) + (s.busy ? (s.recipePower || 0) : 0) + (game.hazardPowerDraw ? game.hazardPowerDraw() : 0);
      n.use += draw;
      if (PRIORITY.has(s.def.category)) n.usePriority = (n.usePriority || 0) + draw;
    }
    if (s.def.powerGen) { const p = generatorPotential(game, s); n.gens.push([s, p]); n.gen += p; }
  }
  for (const v of game.vehicles) if (v.alive && v.def.powerUse && v.route != null) {
    const n = byNet.get(game.hq()?.net) || loose;
    n.use += v.def.powerUse;
  }
  for (const n of [...game.networks, loose]) {
    const room = Math.max(0, n.store - n.charge) / Math.max(0.001, dt);
    const demand = n.use + Math.min(room, n.gen);                    // spare power charges the batteries
    const duty = n.gen > 0 ? Math.min(1, demand / n.gen) : 0;
    for (const [s, p] of n.gens) burnFuel(game, s, dt, p > 0 ? duty : 0);
    const supplied = n.gen * duty;
    let batteryDraw = 0;
    if (supplied < n.use && n.charge > 0) batteryDraw = Math.min(n.use - supplied, n.charge / dt);
    n.satisfaction = gridSatisfaction(supplied, n.use, batteryDraw);
    const delta = (supplied > n.use ? Math.min(supplied - n.use, room) : -batteryDraw) * dt;
    if (n.store > 0) {
      for (const id of n.members) {
        const s = game.byId(id);
        if (s?.def.powerStore) s.charge = Math.max(0, Math.min(s.def.powerStore, (s.charge || 0) + delta * (s.def.powerStore / n.store)));
      }
      n.charge = Math.max(0, Math.min(n.store, n.charge + delta));
    }
    n.supplied = supplied;
  }
  // load shedding: the grid drops the factory before it drops the drills and the guns, so a
  // brownout never turns into a death spiral where the coal drill is too slow to feed the generator
  for (const n of [...game.networks, loose]) {
    const avail = (n.supplied || 0) + Math.max(0, Math.min(n.charge / dt, n.use - (n.supplied || 0)));
    n.satPriority = n.usePriority > 0 ? Math.max(0, Math.min(1, avail / n.usePriority)) : 1;
    const rest = Math.max(0, avail - Math.min(avail, n.usePriority));
    const other = n.use - n.usePriority;
    n.satOther = other > 0 ? Math.max(0, Math.min(1, rest / other)) : 1;
  }
  for (const s of game.structures) {
    if (s.state !== 'done') { s.powered = 0; continue; }
    if (!s.def.powerUse) { s.powered = 1; continue; }
    const n = byNet.get(s.net);
    if (!n) { s.powered = 0; continue; }
    s.powered = PRIORITY.has(s.def.category) ? n.satPriority : n.satOther;
  }
  const worst = game.networks.length ? Math.min(...game.networks.map(n => n.satisfaction)) : 1;
  if (worst < 0.85 && !game.flags.brownout) { game.flags.brownout = true; game.notify('brownout', { n: Math.round(worst * 100) }); }
  else if (worst >= 0.98 && game.flags.brownout) { game.flags.brownout = false; game.notify('power_restored', {}); }
  game.stats.power = {
    gen: game.networks.reduce((a, n) => a + n.gen, 0),
    supplied: game.networks.reduce((a, n) => a + (n.supplied || 0), 0),
    use: game.networks.reduce((a, n) => a + n.use, 0),
    satisfaction: worst,
  };
}

// ------------------------------------------------------------------ extraction

/** Drills, pumps, quarries and harvesters. */
export function tickExtraction(game, dt) {
  const techBonus = game.techEffect('extractRate', 1);
  for (const s of game.structures) {
    if (s.state !== 'done') continue;
    const def = s.def;
    if (!def.extractRate) continue;
    const power = def.powerUse ? s.powered : 1;
    if (power < 0.05) { s.busy = false; continue; }

    if (def.harvestsTerrain) { harvestAround(game, s, dt, power, techBonus); continue; }

    if (def.yields) {                                   // the quarry: no node, fixed mix
      const rate = def.extractRate * power * techBonus * game.diff.extract * dt;
      let made = 0;
      for (const [res, share] of Object.entries(def.yields)) made += push(game, s, res, rate * share);
      s.busy = made > 0;
      game.noise += (def.noise ?? game.data.waves.threat.drillNoise) * dt * (made > 0 ? 1 : 0);
      continue;
    }
    const node = s.nodeId ? game.nodeById(s.nodeId) : null;
    if (!node || (node.depleted && !def.infinite)) { s.busy = false; continue; }
    const rate = def.extractRate * node.richness * power * techBonus * game.diff.extract * dt;
    const got = def.infinite ? rate : Math.min(rate, node.amount);
    if (got <= 0) { s.busy = false; continue; }
    const stored = push(game, s, node.resource, got);
    if (!def.infinite) node.amount -= stored;
    s.busy = stored > 0;
    game.noise += game.data.waves.threat.drillNoise * dt * (stored > 0 ? 1 : 0);
    if (stored < got * 0.5) s.blocked = true; else s.blocked = false;
    if (node.amount <= 0 && !def.infinite) {
      node.depleted = true; node.amount = 0;
      game.notify('node_depleted', { resource: game.data.resource[node.resource].name, name: def.name, at: { x: s.x, y: s.y } });
    }
  }
}

function harvestAround(game, s, dt, power, techBonus) {
  const r = s.def.harvestRadius || 8;
  const map = game.map;
  const rate = s.def.extractRate * power * techBonus * game.diff.extract * dt;
  let got = 0;
  const c = centre(s);
  for (let k = 0; k < 6 && got < rate; k++) {
    const a = (game.rng() * Math.PI * 2), d = game.rng() * r;
    const x = Math.round(c.x + Math.cos(a) * d), y = Math.round(c.y + Math.sin(a) * d);
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
    got += harvestTile(map, y * map.width + x, rate - got);
  }
  if (got > 0) push(game, s, 'biomass', got);
  s.busy = got > 0;
}

// ------------------------------------------------------------------ crafting

/** Every machine with a recipe takes one step. */
export function tickProduction(game, dt) {
  const techSpeed = game.techEffect('craftSpeed', 1);
  const hazardSpeed = game.hazardMachineSpeed ? game.hazardMachineSpeed() : 1;
  for (const s of game.structures) {
    if (s.state !== 'done' || !s.enabled) continue;
    const rid = s.recipe;
    if (!rid) { s.busy = false; continue; }
    const recipe = game.data.recipe[rid];
    if (!recipe) { s.busy = false; continue; }
    s.recipePower = recipe.power || 0;
    const power = (s.def.powerUse || recipe.power) ? s.powered : 1;
    if (power < 0.05) { s.busy = false; continue; }

    if (!s.crafting) {
      let ok = true;
      for (const [res, n] of Object.entries(recipe.inputs || {})) if (visible(game, s, res) < n) { ok = false; s.starvedFor = res; break; }
      if (!ok) { s.busy = false; s.idleFor += dt; if (s.idleFor > 120 && !s.warned) { s.warned = true; game.notify('machine_starved', { name: s.def.name, resource: game.data.resource[s.starvedFor]?.name || s.starvedFor, at: { x: s.x, y: s.y } }); } continue; }
      for (const [res, n] of Object.entries(recipe.inputs || {})) pull(game, s, res, n);
      s.crafting = true; s.craft = 0; s.starvedFor = null; s.idleFor = 0; s.warned = false;
    }
    s.busy = true;
    const speed = (s.def.speed ?? 1) * techSpeed * Math.max(0.1, power) * hazardSpeed;
    s.craft += dt * speed;
    if (s.craft >= recipe.time) {
      let allOut = true;
      for (const [res, n] of Object.entries(recipe.outputs || {})) {
        const fitted = push(game, s, res, n);
        if (fitted < n - 1e-6) allOut = false;
      }
      if (!allOut) { s.blocked = true; s.craft = recipe.time; s.busy = false; continue; }
      s.blocked = false;
      s.crafting = false; s.craft = 0; s.crafted++;
      game.stats.crafted++;
      for (const res of Object.keys(recipe.outputs || {})) game.stats.produced[res] = (game.stats.produced[res] || 0) + (recipe.outputs[res] || 0);
      game.pollution += (s.def.pollution ?? 0.15) * (recipe.power ? 1 : 0.4);
      game.emit('craft', { structure: s, recipe: rid });
    }
  }
}

/** Repair bays patch walls and turrets, using iron plate from a linked store. */
export function tickRepair(game, dt) {
  for (const s of game.structures) {
    if (s.state !== 'done' || !s.def.repairRate || s.powered < 0.2) continue;
    const r = s.def.repairRadius || 10, c = centre(s);
    let budget = s.def.repairRate * s.powered * dt;
    for (const t of game.structures) {
      if (budget <= 0) break;
      if (t.state !== 'done' || t.hp >= t.maxHp) continue;
      if (dist(c, centre(t)) > r) continue;
      const need = Math.min(budget, t.maxHp - t.hp);
      const plate = pull(game, s, 'iron_plate', Math.ceil(need / 40));
      if (plate <= 0) break;
      t.hp = Math.min(t.maxHp, t.hp + need);
      budget -= need;
    }
  }
  for (const s of game.structures) if (s.def.selfRepair && s.state === 'done' && s.hp < s.maxHp) s.hp = Math.min(s.maxHp, s.hp + s.def.selfRepair * dt);
}

export { damageAfterArmor };
