// Hauling. You pick a source store, a destination store, a resource and a truck; the truck drives
// the cheapest path between them, loads, drives back and unloads, forever. Roads make the trip
// shorter, a better truck makes it bigger, and a loading dock makes the stops quicker.

import { findPath, costField } from './map.js';
import { pathTime, cycleTime, routeThroughput } from './rules.js';
import { accepts, space, load, isStore, roomFor } from './production.js';
import { available, takeCost } from './build.js';

const centreTile = (map, s) => Math.min(map.width * map.height - 1, (s.y + (s.h >> 1)) * map.width + (s.x + (s.w >> 1)));

/** Which phase a vehicle must be able to carry for this resource. */
function phaseOf(game, res) {
  const r = game.data.resource[res];
  return r?.phase === 'liquid' ? 'liquid' : r?.phase === 'gas' ? 'gas' : 'solid';
}

/** Vehicle types that could run this resource and are researched. */
export function vehiclesFor(game, res) {
  const phase = phaseOf(game, res);
  return game.data.vehicles.filter(v => v.carries.includes(phase) && game.isUnlocked(v.id) && !v.buildRate);
}

/** Is there a garage with a free slot for this vehicle type? */
export function garageFor(game, vdef) {
  for (const s of game.structures) {
    if (s.state !== 'done') continue;
    if (!(vdef.garages || []).includes(s.type)) continue;
    const used = game.vehicles.filter(v => v.alive && v.garage === s.id).length;
    if (used < (s.def.vehicleSlots || 3)) return s;
  }
  return null;
}

/** The cost field a truck plans on: roads are fast, water is out unless bridged, walls are out. */
export function roadCost(game) {
  const map = game.map;
  map.blocking = game.blocking;
  return costField(map, { blockedCost: Infinity, waterCost: Infinity });
}

/**
 * Start a delivery run.
 * spec: { from, to, resource, vehicle } - ids. Returns { ok, route } or { ok:false, reason }.
 */
export function addRoute(game, spec) {
  const from = game.byId(spec.from), to = game.byId(spec.to);
  if (!from || !to || from === to) return { ok: false, reason: 'need two different buildings' };
  if (from.state !== 'done' || to.state !== 'done') return { ok: false, reason: 'both ends must be finished' };
  const res = spec.resource;
  if (!game.data.resource[res]) return { ok: false, reason: 'no such resource' };
  if (!accepts(game, to, res)) return { ok: false, reason: `${to.def.name} will not hold ${game.data.resource[res].name}` };
  let vdef = spec.vehicle ? game.data.vehicle[spec.vehicle] : vehiclesFor(game, res)[0];
  if (!vdef) return { ok: false, reason: 'no truck that can carry that' };
  if (!vdef.carries.includes(phaseOf(game, res))) return { ok: false, reason: `a ${vdef.name} cannot carry that` };
  if (!game.isUnlocked(vdef.id)) return { ok: false, reason: `${vdef.name} is not researched` };
  const garage = garageFor(game, vdef);
  if (!garage) return { ok: false, reason: `no free ${vdef.class === 'air' ? 'pad' : 'garage'} slot` };

  const map = game.map;
  const a = centreTile(map, from), b = centreTile(map, to);
  let path = null;
  if (vdef.class === 'air') path = straightLine(map, a, b);
  else path = findPath(map, a, b, { cost: roadCost(game) });
  if (!path) { game.notify('route_blocked', { resource: game.data.resource[res].name, to: to.def.name, at: { x: to.x, y: to.y } }); return { ok: false, reason: 'no route between them' }; }

  const veh = {
    id: game.nextId++, type: vdef.id, def: vdef, garage: garage.id,
    x: from.x + from.w / 2, y: from.y + from.h / 2, hp: vdef.hp, maxHp: vdef.hp, alive: true,
    route: null, cargo: 0, cargoRes: null, tier: 1, buildTarget: null,
  };
  game.vehicles.push(veh);
  const route = {
    id: game.nextId++, from: from.id, to: to.id, resource: res, vehicle: veh.id,
    path, tripTime: pathTime(vdef, map, path), state: 'toSource', progress: 0, at: 0,
    enabled: true, delivered: 0, trips: 0, waiting: false,
  };
  veh.route = route.id;
  game.routes.push(route);
  game.notify('route_created', { resource: game.data.resource[res].name, from: from.def.name, to: to.def.name, n: Math.round(route.tripTime) });
  game.emit('route:created', route);
  return { ok: true, route };
}

function straightLine(map, a, b) {
  const path = [];
  const ax = a % map.width, ay = (a / map.width) | 0, bx = b % map.width, by = (b / map.width) | 0;
  const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay)));
  for (let k = 0; k <= steps; k++) {
    const x = Math.round(ax + (bx - ax) * k / steps), y = Math.round(ay + (by - ay) * k / steps);
    const i = y * map.width + x;
    if (path[path.length - 1] !== i) path.push(i);
  }
  return path;
}

export function removeRoute(game, id) {
  const r = game.routes.find(x => x.id === id);
  if (!r) return false;
  const v = game.vehicles.find(v => v.id === r.vehicle);
  if (v) v.alive = false;
  game.vehicles = game.vehicles.filter(v => v.id !== r.vehicle);
  game.routes = game.routes.filter(x => x.id !== id);
  return true;
}

/** Recompute every route's path - call it after roads or walls change. */
export function replanRoutes(game) {
  const cost = roadCost(game);
  for (const r of game.routes) {
    const from = game.byId(r.from), to = game.byId(r.to);
    const v = game.vehicles.find(v => v.id === r.vehicle);
    if (!from || !to || !v) continue;
    const path = v.def.class === 'air'
      ? straightLine(game.map, centreTile(game.map, from), centreTile(game.map, to))
      : findPath(game.map, centreTile(game.map, from), centreTile(game.map, to), { cost });
    if (path) { r.path = path; r.tripTime = pathTime(v.def, game.map, path); }
  }
  game.dirty.routes = false;
}

/** Seconds per round trip and units per second, for the UI and for planning. */
export function estimateTrip(game, route) {
  const v = game.vehicles.find(v => v.id === route.vehicle);
  if (!v) return null;
  const dock = dockSpeedAt(game, game.byId(route.from)) * dockSpeedAt(game, game.byId(route.to));
  return {
    tripTime: route.tripTime,
    cycleTime: cycleTime(v.def, route.tripTime, { loadSpeed: dock }),
    throughput: routeThroughput(v.def, route.tripTime, { loadSpeed: dock }),
    capacity: capacityOf(v),
    vehicle: v.def.name,
  };
}

const capacityOf = v => Math.round(v.def.capacity * (v.def.tiers?.slice(0, v.tier - 1).reduce((a, t) => Math.max(a, t.capacity / v.def.capacity), 1) || 1));

/** The next upgrade step for a truck, or null when it is already at the top. */
export function nextTier(game, v) {
  const list = v.def.tiers || [];
  const step = list[(v.tier || 1) - 1];
  return step || null;
}

/**
 * Buy the next tier for one vehicle: bigger load, faster, and on some of them a better build rate.
 * Costs come out of the stores like any other build.
 */
export function upgradeVehicle(game, id) {
  const v = game.vehicles.find(x => x.id === id);
  if (!v || !v.alive) return { ok: false, reason: 'no such vehicle' };
  const step = nextTier(game, v);
  if (!step) return { ok: false, reason: `${v.def.name} is already at its top tier` };
  for (const [res, n] of Object.entries(step.cost || {})) {
    if (available(game, res) < n) return { ok: false, reason: `short of ${game.data.resource[res]?.name || res}` };
  }
  takeCost(game, step.cost || {}, v.x, v.y);
  v.tier = (v.tier || 1) + 1;
  v.speedMult = step.speed || 1;
  const r = game.routes.find(r => r.vehicle === v.id);
  if (r) r.tripTime = pathTime(v.def, game.map, r.path) / (v.speedMult || 1);
  game.notify('vehicle_upgraded', { name: v.def.name, n: v.tier });
  return { ok: true, tier: v.tier, capacity: capacityOf(v) };
}

export { capacityOf };

function dockSpeedAt(game, s) {
  if (!s) return 1;
  for (const d of game.structures) {
    if (d.state !== 'done' || !d.def.loadSpeed) continue;
    if (Math.hypot(d.x - s.x, d.y - s.y) <= (d.def.linkRadius || 4) + Math.max(s.w, s.h)) return d.def.loadSpeed;
  }
  return 1;
}

/** One tick of every running route. */
export function tickLogistics(game, dt) {
  if (game.dirty.routes) replanRoutes(game);
  for (const r of game.routes) {
    if (!r.enabled) continue;
    const v = game.vehicles.find(v => v.id === r.vehicle);
    const from = game.byId(r.from), to = game.byId(r.to);
    if (!v || !v.alive || !from || !to) continue;
    if (v.def.fuelUse) {
      const need = v.def.fuelUse * dt;
      if ((v.fuel || 0) < need) {
        const got = takeFuel(game, from, to, 20);
        v.fuel = (v.fuel || 0) + got;
        if ((v.fuel || 0) < need) { r.waiting = true; continue; }
      }
      v.fuel -= need;
    }
    r.waiting = false;
    const dock = dockSpeedAt(game, r.state === 'loading' ? from : to);
    switch (r.state) {
      case 'toSource': {
        r.progress += dt;
        moveAlong(game, v, r, 1 - r.progress / Math.max(0.01, r.tripTime));
        if (r.progress >= r.tripTime) { r.progress = 0; r.state = 'loading'; }
        break;
      }
      case 'loading': {
        r.progress += dt * dock;
        if (r.progress >= v.def.loadTime) {
          const want = Math.min(capacityOf(v), from.inv[r.resource] || 0);
          if (want <= 0) { r.progress = v.def.loadTime; break; }        // wait at the source
          from.inv[r.resource] -= want;
          if (from.inv[r.resource] <= 1e-9) delete from.inv[r.resource];
          v.cargo = want; v.cargoRes = r.resource;
          r.progress = 0; r.state = 'toDest';
        }
        break;
      }
      case 'toDest': {
        r.progress += dt;
        moveAlong(game, v, r, r.progress / Math.max(0.01, r.tripTime));
        if (r.progress >= r.tripTime) { r.progress = 0; r.state = 'unloading'; }
        break;
      }
      case 'unloading': {
        r.progress += dt * dock;
        if (r.progress >= v.def.unloadTime) {
          const room = to.cap > 0 ? roomFor(game, to, r.resource) : v.cargo;
          const put = Math.min(v.cargo, room);
          if (put > 0) { to.inv[r.resource] = (to.inv[r.resource] || 0) + put; v.cargo -= put; r.delivered += put; game.stats.hauled += put; }
          if (v.cargo <= 0) { v.cargoRes = null; r.trips++; r.progress = 0; r.state = 'toSource'; r.fullSince = null; r.warnedFull = false; }
          else {
            r.progress = v.def.unloadTime;                                // destination full - hold
            r.fullSince ??= game.time;
            if (game.time - r.fullSince > 60 && !r.warnedFull) {
              r.warnedFull = true;
              game.notify('storage_full', { name: to.def.name, resource: game.data.resource[r.resource].name, at: { x: to.x, y: to.y } });
            }
          }
        }
        break;
      }
    }
  }
}

function takeFuel(game, ...stores) {
  for (const s of stores) {
    if (!s) continue;
    const pool = [s, ...(s.links || []).map(id => game.byId(id))].filter(p => p && p.inv);
    for (const p of pool) {
      const have = p.inv.fuel || 0;
      if (have > 0) { const k = Math.min(20, have); p.inv.fuel -= k; if (p.inv.fuel <= 1e-9) delete p.inv.fuel; return k; }
    }
  }
  return 0;
}

function moveAlong(game, v, r, t) {
  const k = Math.max(0, Math.min(1, t));
  const idx = r.path[Math.min(r.path.length - 1, Math.round(k * (r.path.length - 1)))];
  v.x = idx % game.map.width; v.y = (idx / game.map.width) | 0;
}

export { load, space };
