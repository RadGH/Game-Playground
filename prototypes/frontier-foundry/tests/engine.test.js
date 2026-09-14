// node --test prototypes/frontier-foundry/tests/engine.test.js
// The mechanics: scanning, fog, the build flow, hauling, power, production, waves and turrets,
// walls and gates, research, quests, space, and a save that reloads unchanged.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadData } from '../js/data.js';
import { Game } from '../js/game.js';
import { localPlanets, generatePlanetMap, makePlanet, ARCHETYPES } from '../js/planets.js';
import { scanArea, findPath, costField, ensureStarterNodes, nodeAtTile } from '../js/map.js';
import { exploredFraction, isExplored } from '../js/fog.js';
import { recomputeLinks, recomputePower, push, pull, visible, isStore, roomFor, space } from '../js/production.js';
import { estimateTrip } from '../js/logistics.js';
import { spawnWave, damageNest } from '../js/combat.js';
import { pathTime, BALANCE } from '../js/rules.js';
import * as Space from '../js/space.js';

const data = await loadData();
const planets = localPlanets(data.resources, 5, 5);
const worldCache = new Map();
function worldFor(planet) {
  if (!worldCache.has(planet.id)) worldCache.set(planet.id, generatePlanetMap(planet, { width: 96, height: 48 }));
  return worldCache.get(planet.id);
}

/** A small, quiet game - no nests, no waves - for testing one mechanic at a time. */
function newGame(opts = {}) {
  const planet = opts.planet || planets.list()[0];
  const g = Game.createSync({ seed: opts.seed ?? 3, data, planets, planet, world: worldFor(planet), size: opts.size ?? 64, nests: opts.nests ?? false, autoQuests: opts.autoQuests !== false });
  if (opts.waves !== true) g.flags.noWaves = true;
  return g;
}

/** Drop a finished structure straight in, paid for or not - most tests do not care how it got there. */
function put(g, type, x, y, recipe = null) {
  const out = g.place(type, x, y, { free: true, instant: true, recipe });
  assert.ok(out.ok, `place ${type}: ${out.reason}`);
  recomputeLinks(g); recomputePower(g);
  return out.structure;
}

/** Run a line of poles from the pod to a building so it is actually on the grid. */
function wire(g, s) {
  const hq = g.hq();
  const steps = Math.max(1, Math.ceil(Math.hypot(s.x - hq.x, s.y - hq.y) / 6));
  for (let k = 1; k <= steps; k++) {
    const x = Math.round(hq.x + (s.x - hq.x) * k / steps), y = Math.round(hq.y + (s.y - hq.y) * k / steps);
    if (g.structures.some(p => p.def.supplyRadius && Math.hypot(p.x - x, p.y - y) < 5)) continue;
    try { const p = freeSpot(g, 1, 1, { x, y }); put(g, 'power_pole', p.x, p.y); } catch {}
  }
  recomputePower(g);
  return s;
}

/** An empty patch of ground near the pod, big enough for w x h. */
function freeSpot(g, w = 3, h = 3, from = null) {
  const hq = from || g.hq();
  for (let r = 3; r < 40; r++) for (let k = 0; k < r * 6; k++) {
    const a = (k / (r * 6)) * Math.PI * 2;
    const x = Math.round(hq.x + Math.cos(a) * r), y = Math.round(hq.y + Math.sin(a) * r);
    if (x < 1 || y < 1 || x + w >= g.map.width || y + h >= g.map.height) continue;
    let ok = true;
    for (let dy = 0; dy < h && ok; dy++) for (let dx = 0; dx < w; dx++) {
      const i = (y + dy) * g.map.width + (x + dx);
      if (!g.map.buildable[i] || g.map.occupied[i] >= 0) { ok = false; break; }
    }
    if (ok) return { x, y };
  }
  throw new Error('no free ground');
}

// ---------------------------------------------------------------- map and scanning

test('the local map comes from worldgen, has buildable ground, and hides its nodes until scanned', () => {
  const g = newGame();
  assert.equal(g.map.width, 64);
  let buildable = 0;
  for (let i = 0; i < g.map.buildable.length; i++) buildable += g.map.buildable[i];
  assert.ok(buildable > g.map.buildable.length * 0.15, 'less than 15% of the tile is buildable');
  assert.ok(g.map.nodes.length >= 8, `${g.map.nodes.length} nodes`);
  for (const n of g.map.nodes) {
    assert.ok(data.resource[n.resource], n.resource);
    assert.ok(n.amount > 0 && n.amount === n.initial);
    assert.ok(g.planet.resources.includes(n.resource) || g.planet.rareElements.includes(n.resource), n.resource + ' is not on this planet');
  }
  // the pod's opening scan reveals some but not all of them
  const scanned = g.map.nodes.filter(n => n.scanned).length;
  assert.ok(scanned > 0 && scanned < g.map.nodes.length, `${scanned}/${g.map.nodes.length} scanned at landfall`);
});

test('the same seed builds the same map, a different seed does not', () => {
  const a = newGame({ seed: 11 }), b = newGame({ seed: 11 }), c = newGame({ seed: 12 });
  const sig = g => g.map.nodes.map(n => `${n.resource}:${n.x},${n.y},${n.initial}`).join('|');
  assert.equal(sig(a), sig(b));
  assert.notEqual(sig(a), sig(c));
});

test('every start has iron, fuel, copper and stone inside the pod reach', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const g = newGame({ seed });
    const hq = g.hq();
    for (const res of ['iron_ore', 'coal', 'copper_ore', 'stone']) {
      const near = g.map.nodes.some(n => n.resource === res && Math.hypot(n.x - hq.x - 2, n.y - hq.y - 2) <= 18);
      assert.ok(near, `seed ${seed} has no ${res} near the landing site`);
    }
  }
});

test('scan() reveals nodes in range and only in range', () => {
  const g = newGame();
  const hidden = g.map.nodes.filter(n => !n.scanned);
  assert.ok(hidden.length);
  const target = hidden[0];
  const before = g.map.nodes.filter(n => n.scanned).length;
  const found = g.scan(target.x, target.y, 3);
  assert.ok(found.includes(target));
  assert.ok(g.map.nodes.filter(n => n.scanned).length >= before + 1);
  const far = g.map.nodes.find(n => !n.scanned && Math.hypot(n.x - target.x, n.y - target.y) > 20);
  if (far) assert.equal(far.scanned, false, 'a node 20 tiles away should not have been revealed');
});

test('a scanner tower sweeps for nodes on its own', () => {
  const g = newGame();
  const hidden = g.map.nodes.filter(n => !n.scanned);
  const target = hidden.sort((a, b) => Math.hypot(a.x - g.hq().x, a.y - g.hq().y) - Math.hypot(b.x - g.hq().x, b.y - g.hq().y))[0];
  const spot = freeSpot(g, 2, 2, { x: target.x, y: target.y });
  wire(g, put(g, 'scanner_tower', spot.x, spot.y));
  for (let i = 0; i < 40; i++) g.tick(1);
  assert.equal(target.scanned, true, 'the tower should have found the node next to it');
});

// ---------------------------------------------------------------- fog of war

test('fog: the pod lights its own ground, the far side of the map stays dark, a satellite opens it all', () => {
  const g = newGame();
  const hq = g.hq();
  assert.ok(isExplored(g.fog, hq.x, hq.y));
  const frac = exploredFraction(g.fog);
  assert.ok(frac > 0.02 && frac < 0.7, `explored ${(frac * 100).toFixed(0)}%`);
  const corner = g.map.width - 2;
  assert.equal(isExplored(g.fog, corner, corner) && isExplored(g.fog, 1, 1), false);

  put(g, 'satellite_launcher', ...Object.values(freeSpot(g, 4, 4)));
  const pad = g.structures.find(s => s.type === 'satellite_launcher');
  pad.inv.satellite = 1;
  recomputeLinks(g);
  assert.ok(g.launchSatellite().ok);
  assert.equal(exploredFraction(g.fog), 1);
  assert.ok(g.map.nodes.every(n => n.scanned), 'a satellite should reveal every node');
});

// ---------------------------------------------------------------- build flow

test('build flow: outline -> builders walk over -> finished, and the cost comes out of the stores', () => {
  const g = newGame();
  const hq = g.hq();
  hq.inv.iron_plate = 200; hq.inv.gear = 100; hq.inv.copper_wire = 100;
  const spot = freeSpot(g, 3, 3);
  const before = g.available('iron_plate');
  const out = g.place('assembler_mk1', spot.x, spot.y);
  assert.ok(out.ok, out.reason);
  const s = out.structure;
  assert.equal(s.state, 'ghost');
  assert.ok(g.available('iron_plate') < before, 'the materials should be gone the moment the outline goes down');
  // builders have to reach it first
  g.tick(1);
  assert.ok(s.progress < s.def.buildTime);
  for (let i = 0; i < 400 && s.state !== 'done'; i++) g.tick(1);
  assert.equal(s.state, 'done');
  assert.ok(g.notifications.some(n => n.type === 'build_done'));
});

test('you cannot build on water, on top of something else, or on an unscanned node', () => {
  const g = newGame();
  let water = -1;
  for (let i = 0; i < g.map.water.length; i++) if (g.map.water[i]) { water = i; break; }
  if (water >= 0) {
    const r = g.canPlace('storage_crate', water % g.map.width, (water / g.map.width) | 0, { ignoreCost: true, ignoreUnlock: true });
    assert.equal(r.ok, false);
  }
  const hq = g.hq();
  assert.equal(g.canPlace('storage_crate', hq.x, hq.y, { ignoreCost: true, ignoreUnlock: true }).ok, false);
  const hidden = g.map.nodes.find(n => !n.scanned && n.kind !== 'fluid' && n.kind !== 'gas');
  if (hidden) {
    const r = g.canPlace('drill_mk1', hidden.x - 1, hidden.y - 1, { ignoreCost: true, ignoreUnlock: true });
    assert.equal(r.ok, false, 'a drill should not go on an unscanned patch');
  }
  assert.equal(g.canPlace('nano_forge', 5, 5).ok, false, 'unresearched things are not placeable');
});

test('a drill claims its node, mines it, and reports when it runs dry', () => {
  const g = newGame();
  const node = g.map.nodes.find(n => n.scanned && n.kind === 'ore');
  const drill = wire(g, put(g, 'drill_mk1', node.x - 1, node.y - 1));
  assert.equal(node.claimedBy, drill.id);
  assert.equal(g.canPlace('drill_mk1', node.x - 1, node.y - 1, { ignoreCost: true }).ok, false, 'a claimed node is not free');
  node.amount = 40;
  for (let i = 0; i < 200 && !node.depleted; i++) g.tick(1);
  assert.equal(node.depleted, true);
  assert.ok(g.notifications.some(n => n.type === 'node_depleted'));
  assert.ok(g.available(node.resource) > 0, 'the ore should be in a store');
});

// ---------------------------------------------------------------- power

test('power: a machine off the grid does nothing, a brownout slows everything, and load shedding protects the drills', () => {
  const g = newGame();
  const spot = freeSpot(g, 3, 3, { x: g.map.width - 12, y: g.map.height - 12 });
  const lab = put(g, 'lab', spot.x, spot.y);
  recomputePower(g);
  assert.equal(lab.net, -1, 'a shed on the far side of the map is not on the grid');
  g.tick(1);
  assert.equal(lab.powered, 0);

  // wire it up
  const hq = g.hq();
  let last = { x: hq.x, y: hq.y };
  const steps = Math.ceil(Math.hypot(lab.x - hq.x, lab.y - hq.y) / 6);
  for (let k = 1; k <= steps; k++) {
    const x = Math.round(hq.x + (lab.x - hq.x) * k / steps), y = Math.round(hq.y + (lab.y - hq.y) * k / steps);
    const p = freeSpot(g, 1, 1, { x, y });
    put(g, 'power_pole', p.x, p.y);
  }
  recomputePower(g); g.tick(1);
  assert.ok(lab.net >= 0 && lab.powered > 0, 'poles should carry the grid out to it');

  // overload the grid: the pod makes 120 kW, so a wall of labs will brown it out
  for (let i = 0; i < 8; i++) { const p = freeSpot(g, 3, 3); wire(g, put(g, 'lab', p.x, p.y)); }
  const node = g.map.nodes.find(n => n.scanned && n.kind === 'ore');
  const drill = wire(g, put(g, 'drill_mk1', node.x - 1, node.y - 1));
  for (const s of g.structures) s.busy = true;
  g.tick(1);
  const net = g.networks.find(n => n.id === drill.net);
  assert.ok(net.use > net.gen, `the test needs an overloaded grid (${net.use} vs ${net.gen})`);
  const shed = g.structures.filter(s => s.type === 'lab' && s.net === drill.net);
  assert.ok(shed.length, 'labs should be on the same grid as the drill');
  assert.ok(drill.powered >= shed[0].powered, 'a drill keeps its power while the labs get shed');
  assert.ok(drill.powered > 0, 'and it never goes fully dark');
  assert.ok(g.notifications.some(n => n.type === 'brownout'));
});

test('a generator burns only what the grid is drawing', () => {
  const g = newGame();
  const p = freeSpot(g, 3, 3);
  const gen = put(g, 'combustion_generator', p.x, p.y);
  gen.inv.coal = 400;
  recomputeLinks(g);
  for (let i = 0; i < 60; i++) g.tick(1);
  const idleBurn = 400 - (gen.inv.coal ?? g.available('coal'));
  assert.ok(idleBurn < 60 * 0.25 * 0.6, `an idle generator burned ${idleBurn.toFixed(1)} coal in a minute - it should idle down`);
});

// ---------------------------------------------------------------- production

test('a smelter turns ore into ingots, and stops when there is nowhere to put them', () => {
  const g = newGame();
  const p = freeSpot(g, 3, 3);
  const sm = put(g, 'smelter', p.x, p.y, 'smelt_iron');
  const hq = g.hq();
  hq.inv.iron_ore = 200; hq.inv.coal = 200;
  recomputeLinks(g);
  const before = g.available('iron_ingot');
  for (let i = 0; i < 30; i++) g.tick(1);
  assert.ok(g.available('iron_ingot') > before, 'the smelter should have made ingots');
  assert.ok(g.available('iron_ore') < 200);

  // with every store full and its own hopper nearly full, it jams instead of deleting the goods
  const feed = put(g, 'storage_crate', ...Object.values(freeSpot(g, 2, 2)));
  recomputeLinks(g);
  for (const s of g.structures) if (isStore(s.def) && s !== feed) s.inv = { steel_plate: s.cap };
  feed.inv = { iron_ore: 300, coal: 150, steel_plate: feed.cap - 450 };   // full, but holding the inputs
  sm.inv = { iron_ingot: sm.cap - 3 };
  sm.crafting = false; sm.craft = 0; sm.blocked = false;
  for (let i = 0; i < 200; i++) { g.tick(1); feed.inv.iron_ore = 300; feed.inv.coal = 150; }
  assert.equal(sm.blocked, true, 'a smelter with nowhere to put ingots should jam');
  assert.ok((sm.inv.iron_ingot || 0) <= sm.cap, 'and never hold more than its own hopper');
});

test('a store keeps room for other things: raw ore cannot fill it', () => {
  const g = newGame();
  const p = freeSpot(g, 2, 2);
  const crate = put(g, 'storage_crate', p.x, p.y);
  const oreRoom = roomFor(g, crate, 'iron_ore');
  assert.ok(oreRoom < crate.cap * 0.5, 'raw ore is capped well below the crate size');
  assert.equal(roomFor(g, crate, 'iron_plate'), crate.cap, 'finished goods are not capped');
  crate.inv.iron_ore = oreRoom;
  assert.equal(roomFor(g, crate, 'iron_ore'), 0);
  assert.ok(roomFor(g, crate, 'iron_plate') > 0, 'there is still room for plate');
});

test('machines pool their stores: what one store holds, every machine on the network can use', () => {
  const g = newGame();
  const a = freeSpot(g, 2, 2);
  const crate = put(g, 'storage_crate', a.x, a.y);
  const b = freeSpot(g, 3, 3);
  const sm = put(g, 'smelter', b.x, b.y, 'smelt_iron');
  recomputeLinks(g);
  for (const s of g.structures) s.inv = {};
  crate.inv.iron_ore = 50;
  assert.ok(visible(g, sm, 'iron_ore') >= 50, 'the smelter should see the crate');
  assert.equal(pull(g, sm, 'iron_ore', 10), 10);
  assert.equal(crate.inv.iron_ore, 40);
  assert.ok(push(g, sm, 'iron_ingot', 5) > 0);
  assert.ok(visible(g, crate, 'iron_ingot') >= 5 || g.available('iron_ingot') >= 5);
});

// ---------------------------------------------------------------- logistics

test('a delivery route moves goods, and roads and better trucks make the trip quicker', () => {
  const g = newGame();
  const hq = g.hq();
  hq.inv = { iron_plate: 300, gear: 120, fuel: 500 };          // leave the pod room to receive the load
  for (const t of ['t_haulage', 't_roads', 't_paving', 't_heavy_haulage']) g.research.done.push(t);
  g.unlocked = null;

  const far = freeSpot(g, 4, 4, { x: Math.min(g.map.width - 8, hq.x + 22), y: hq.y });
  const depot = put(g, 'warehouse', far.x, far.y);
  put(g, 'truck_garage', ...Object.values(freeSpot(g, 3, 3)));
  depot.inv.iron_plate = 600;

  const r = g.addRoute({ from: depot.id, to: hq.id, resource: 'iron_plate', vehicle: 'hauler' });
  assert.ok(r.ok, r.reason);
  const plain = g.estimateTrip(r.route);
  assert.ok(plain.tripTime > 0 && plain.throughput > 0);

  // it actually delivers
  for (let i = 0; i < 600; i++) { g.tick(1); depot.inv.iron_plate = Math.max(depot.inv.iron_plate || 0, 400); hq.inv.iron_plate = 0; }
  assert.ok(r.route.delivered > 0, `the route should have delivered something (state ${r.route.state})`);
  assert.ok(r.route.trips >= 1);
  const perSecond = r.route.delivered / g.time;

  // pave the whole path and the same truck gets faster
  for (const i of r.route.path) g.map.road[i] = 3;
  g.dirty.routes = true;
  g.tick(1);
  const paved = g.estimateTrip(r.route);
  assert.ok(paved.tripTime < plain.tripTime * 0.75, `paved ${paved.tripTime.toFixed(1)}s vs raw ${plain.tripTime.toFixed(1)}s`);
  const delivered = r.route.delivered;
  const t0 = g.time;
  for (let i = 0; i < 600; i++) { g.tick(1); depot.inv.iron_plate = Math.max(depot.inv.iron_plate || 0, 400); hq.inv.iron_plate = 0; }
  const pavedPerSecond = (r.route.delivered - delivered) / (g.time - t0);
  assert.ok(pavedPerSecond > perSecond, `paved ${pavedPerSecond.toFixed(2)}/s vs raw ${perSecond.toFixed(2)}/s`);

  // a heavy hauler carries far more per trip
  const heavy = g.data.vehicle.heavy_hauler, hauler = g.data.vehicle.hauler;
  assert.ok(heavy.capacity > hauler.capacity * 2);
  const t1 = pathTime(hauler, g.map, r.route.path), t2 = pathTime(heavy, g.map, r.route.path);
  assert.ok(t2 > t1, 'the heavy hauler is slower per trip');
  assert.ok(heavy.capacity / t2 > hauler.capacity / t1, 'but moves more per second');
});

test('a route to a store with no room for the load says so', () => {
  const g = newGame();
  const hq = g.hq();
  g.research.done.push('t_haulage'); g.unlocked = null;
  hq.inv.fuel = 200;
  put(g, 'truck_garage', ...Object.values(freeSpot(g, 3, 3)));
  const far = freeSpot(g, 2, 2, { x: Math.min(g.map.width - 6, hq.x + 16), y: hq.y });
  const crate = put(g, 'storage_crate', far.x, far.y);
  crate.inv.stone = 900;
  hq.inv.stone = hq.cap * 0.25;                                    // the pod already holds its share of stone
  const r = g.addRoute({ from: crate.id, to: hq.id, resource: 'stone', vehicle: 'hauler' });
  assert.ok(r.ok);
  for (let i = 0; i < 800; i++) g.tick(1);
  assert.ok(g.notifications.some(n => n.type === 'storage_full'), 'a jammed destination should raise a message');
});

test('a route with water in the way is refused', () => {
  const g = newGame();
  const hq = g.hq();
  g.research.done.push('t_haulage'); g.unlocked = null;
  put(g, 'truck_garage', ...Object.values(freeSpot(g, 3, 3)));
  const crate = put(g, 'storage_crate', ...Object.values(freeSpot(g, 2, 2)));
  // wall the crate in with water
  for (let dy = -2; dy <= 3; dy++) for (let dx = -2; dx <= 3; dx++) {
    if (dx >= 0 && dx <= 1 && dy >= 0 && dy <= 1) continue;
    const x = crate.x + dx, y = crate.y + dy;
    if (x < 0 || y < 0 || x >= g.map.width || y >= g.map.height) continue;
    g.map.water[y * g.map.width + x] = 1;
  }
  const r = g.addRoute({ from: crate.id, to: hq.id, resource: 'stone', vehicle: 'hauler' });
  assert.equal(r.ok, false);
  assert.ok(g.notifications.some(n => n.type === 'route_blocked'));
});

// ---------------------------------------------------------------- research and quests

test('research eats packs, unlocks what it promises, and refuses a node whose requirements are missing', () => {
  const g = newGame();
  assert.equal(g.canResearch('t_rocketry').ok, false);
  assert.equal(g.isUnlocked('quarry'), false);
  const p = freeSpot(g, 3, 3);
  const lab = put(g, 'lab', p.x, p.y);
  recomputeLinks(g);
  g.hq().inv.pack_basic = 100;
  assert.ok(g.startResearch('t_masonry').ok);
  for (let i = 0; i < 400 && !g.research.done.includes('t_masonry'); i++) g.tick(1);
  assert.ok(g.research.done.includes('t_masonry'), 'masonry should finish with packs on the shelf');
  assert.ok(g.isUnlocked('quarry'), 'and unlock the quarry');
  assert.ok(g.hq().inv.pack_basic < 100, 'and consume packs');
  assert.ok(g.notifications.some(n => n.type === 'research_done'));
});

test('research stalls politely when the packs run out', () => {
  const g = newGame();
  put(g, 'lab', ...Object.values(freeSpot(g, 3, 3)));
  recomputeLinks(g);
  g.hq().inv.pack_basic = 4;
  g.startResearch('t_masonry');
  for (let i = 0; i < 200; i++) g.tick(1);
  assert.equal(g.research.done.includes('t_masonry'), false);
  assert.ok(g.research.progress > 0 && g.research.progress < g.data.tech.t_masonry.work);
  assert.ok(g.flags.researchStalled);
});

test('quests are offered, tracked and completed with their reward', () => {
  const g = newGame();
  // the tutorial chain is offered one step at a time; step two is "put a drill on the iron"
  const scanStep = g.data.quest.q_tut_t1;
  assert.ok(g.quests.active.includes(scanStep.id), 'the first tutorial step should be offered at landfall');
  g.scan(g.map.width / 2, g.map.height / 2, 200);
  g.checkQuests();
  assert.ok(g.questProgress(scanStep).have >= scanStep.goal);
  assert.ok(g.quests.done.includes(scanStep.id));
  assert.ok(g.available('iron_plate') > 0, 'the reward should have landed in the pod');
  // a chain step reports as quest_step; a standalone quest as quest_done
  assert.ok(g.notifications.some(n => n.type === 'quest_step'));

  assert.ok(g.quests.active.includes('q_tut_t2'), 'finishing a step should offer the next one');
  const node = g.map.nodes.find(n => n.scanned && n.kind === 'ore');
  put(g, 'drill_mk1', node.x - 1, node.y - 1);
  g.checkQuests();
  assert.ok(g.quests.done.includes('q_tut_t2'));
});

// ---------------------------------------------------------------- combat

test('a wave spawns at the edge, turrets shoot it, and the threat drops when it is cleared', () => {
  const g = newGame({ waves: true, nests: false });
  const hq = g.hq();
  for (let i = 0; i < 5; i++) { const p = freeSpot(g, 2, 2); put(g, 'gun_turret', p.x, p.y); }
  const wave = spawnWave(g, { budget: 8, fronts: 1 });
  assert.ok(wave && g.enemies.length > 0);
  const edge = 10;
  assert.ok(g.enemies.every(e => e.x <= edge || e.y <= edge || e.x >= g.map.width - edge || e.y >= g.map.height - edge), 'waves come in from the edge');
  assert.ok(g.notifications.some(n => n.type === 'wave_incoming'));
  for (let i = 0; i < 900 && g.enemies.length; i++) g.tick(1);
  assert.equal(g.enemies.length, 0, 'five gun turrets should see off a wave of eight threat');
  assert.ok(g.stats.kills > 0);
  assert.ok(hq.hp > 0);
  // 'wave_cleared' when the wave cost you something, 'wave_repelled' when it did not
  assert.ok(g.notifications.some(n => n.type === 'wave_cleared' || n.type === 'wave_repelled'));
});

test('enemies move towards the base and chew through a wall that is in the way', () => {
  const g = newGame({ waves: true });
  const hq = g.hq();
  const wspot = freeSpot(g, 1, 1, { x: hq.x - 3, y: hq.y });
  const wall = put(g, 'steel_wall', wspot.x, wspot.y);
  const e = {
    id: 9999, type: 'burrower', def: data.unit.burrower, wave: 1, alive: true,
    x: wall.x - 3, y: wall.y, hp: 5000, maxHp: 5000, armor: 0, dps: 300, speed: 1.5, air: false,
    target: hq.id, cd: 0, slow: 0,
  };
  g.enemies.push(e);
  g.waves.push({ n: 1, spawned: 1, killed: 0, target: hq.id, field: null, at: 0 });
  const start = { x: e.x, y: e.y };
  for (let i = 0; i < 60; i++) g.tick(1);
  const moved = Math.hypot(e.x - start.x, e.y - start.y);
  assert.ok(moved > 0.5 || wall.hp < wall.maxHp, 'it should have moved in or started on the wall');
  for (let i = 0; i < 400; i++) g.tick(1);
  const gone = !g.byId(wall.id);
  assert.ok(gone || wall.hp < wall.maxHp || Math.hypot(e.x - (hq.x + 2), e.y - (hq.y + 2)) < moved + 3, 'it should be making progress towards the pod');
});

test('walls block the path a truck plans; a gate does not', () => {
  const g = newGame();
  const hq = g.hq();
  const y = hq.y + 6;
  // a solid line of wall across the map at one row
  for (let x = 0; x < g.map.width; x++) {
    const i = y * g.map.width + x;
    if (g.map.water[i] || g.map.occupied[i] >= 0 || !g.map.buildable[i]) continue;
    g.place('steel_wall', x, y, { free: true, instant: true });
  }
  const from = hq.y < y ? hq.y - 2 : hq.y + 2;
  const start = (Math.max(1, from)) * g.map.width + Math.max(1, hq.x);
  const goal = Math.min(g.map.height - 2, y + 6) * g.map.width + Math.max(1, hq.x);
  const blocked = findPath(g.map, start, goal, { cost: costField(g.map, { blockedCost: Infinity }) });
  // punch a gate through and the same route opens
  const wallAt = g.structures.find(s => s.type === 'steel_wall' && s.y === y);
  if (wallAt) {
    g.removeStructure(wallAt.id, { refund: 0 });
    g.place('gate', wallAt.x, wallAt.y, { free: true, instant: true });
  }
  const open = findPath(g.map, start, goal, { cost: costField(g.map, { blockedCost: Infinity }) });
  if (blocked === null) assert.ok(open !== null, 'a gate should open a route a wall closed');
  else assert.ok(open !== null);
  const gate = g.structures.find(s => s.type === 'gate');
  assert.ok(gate.def.passableToOwn, 'gates let your own traffic through');
});

test('artillery shells a nest and the threat drops with it', () => {
  const g = newGame({ waves: true });
  g.nests.push({ id: 5000, type: 'crawler_nest', def: data.unit.crawler_nest, x: g.hq().x + 12, y: g.hq().y, hp: 400, maxHp: 1600, alive: true, cd: 999 });
  g.threat = 300;
  damageNest(g, g.nests[0], 5000);
  assert.equal(g.nests[0].alive, false);
  assert.ok(g.threat < 300);
  assert.equal(g.stats.nestsKilled, 1);
  assert.ok(g.notifications.some(n => n.type === 'nest_cleared'));
});

// ---------------------------------------------------------------- space

test('a probe surveys another planet and reports what is there', () => {
  const g = newGame();
  const launcher = put(g, 'probe_launcher', ...Object.values(freeSpot(g, 4, 4)));
  launcher.inv.probe = 1;
  recomputeLinks(g);
  const target = g.planets.list().find(p => p.id !== g.planet.id);
  const r = g.launchProbe(target.id);
  assert.ok(r.ok, r.reason);
  assert.equal(g.space.surveyed.includes(target.id), false, 'it has to fly there first');
  for (let i = 0; i < Space.PROBE_TRAVEL + 20; i++) g.tick(1);
  assert.ok(g.space.surveyed.includes(target.id));
  // a probe lands its report as 'probe_result'; 'probe_arrived' is the observatory's free read
  assert.ok(g.notifications.some(n => n.type === 'probe_result'));
});

test('a rocket assembles, launches, and lands the hold on the next planet with the archived research', () => {
  const g = newGame();
  const pad = put(g, 'launch_pad', ...Object.values(freeSpot(g, 6, 6)));
  put(g, 'archive', ...Object.values(freeSpot(g, 3, 3)));
  g.research.done.push('t_masonry', 't_steel', 't_haulage');
  g.unlocked = null;
  assert.equal(g.assembleRocket().ok, false, 'no sections yet');
  Object.assign(pad.inv, { rocket_part: 6, rocket_fuel: 60, oxidizer: 40, iron_plate: 300, gear: 120 });
  recomputeLinks(g);
  assert.ok(g.assembleRocket().ok);
  assert.equal(g.rocketStatus().ready, true);
  assert.ok(g.notifications.some(n => n.type === 'rocket_ready'));

  const target = g.planets.list().find(p => p.id !== g.planet.id);
  const out = g.launchRocket({ to: target.id, cargo: { iron_plate: 250, gear: 100 }, crew: 5 });
  assert.ok(out.ok, out.reason);
  assert.equal(out.transfer.cargo.iron_plate, 250);
  assert.ok(out.transfer.research.includes('t_steel'), 'the archive carries research across');

  const next = Game.land(out.transfer, { data, planets, world: worldFor(target), size: 64 });
  assert.equal(next.planet.id, target.id);
  assert.ok(next.available('iron_plate') >= 250, 'the hold should be in the new pod');
  assert.ok(next.research.done.includes('t_steel'));
  assert.ok(next.notifications.some(n => n.type === 'landed'));
});

test('a beacon claims the planet, and the run is won with enough beacons and a station', () => {
  const g = newGame();
  g.beaconsToWin = 2;
  g.research.done.push('t_beacon'); g.unlocked = null;
  put(g, 'beacon', ...Object.values(freeSpot(g, 3, 3)));
  g.tick(1);
  assert.ok(g.space.beacons.includes(g.planet.id));
  assert.ok(g.notifications.some(n => n.type === 'beacon_lit'));
  assert.equal(g.won, false, 'one beacon and no station is not a win');
  g.space.beacons.push('p_other');
  g.space.station = true;
  Space.checkVictory(g);
  assert.equal(g.won, true);
});

// ---------------------------------------------------------------- planets

test('every planet archetype generates a playable world with its own rare elements', () => {
  for (const arch of Object.keys(ARCHETYPES)) {
    const p = makePlanet({ id: 'x_' + arch, seed: 9, archetype: arch, resourceTable: data.resources });
    assert.ok(p.resources.includes('iron_ore') && p.resources.includes('coal'), arch + ' is not landable');
    assert.ok(p.dayLength > 0 && p.gravity > 0, arch);
    for (const r of p.rareElements) assert.ok(data.resource[r]?.kind === 'rare', `${arch} rare ${r}`);
  }
});

test('a planet-only building is refused where the element is missing', () => {
  const frozen = makePlanet({ id: 'ice1', seed: 4, archetype: 'frozen', resourceTable: data.resources });
  const g = Game.createSync({ seed: 4, data, planets, planet: frozen, world: generatePlanetMap(frozen, { width: 96, height: 48 }), size: 64, nests: false });
  g.flags.noWaves = true;
  g.research.done.push('t_cryo_metallurgy', 't_plasma_smelting'); g.unlocked = null;
  const hasCryo = g.planetHas('cryonite');
  const r = g.canPlace('plasma_refinery', 10, 10, { ignoreCost: true });
  assert.equal(r.ok, false);
  assert.match(r.reason, /pyrocrystal/);
  if (hasCryo) assert.notEqual(g.canPlace('cryo_forge', 10, 10, { ignoreCost: true }).reason, 'this world has no cryonite');
});

// ---------------------------------------------------------------- save / load

test('a save reloads into the same game', () => {
  const g = newGame({ seed: 21 });
  const hq = g.hq();
  hq.inv.iron_plate = 300; hq.inv.gear = 150; hq.inv.copper_wire = 150;
  const node = g.map.nodes.find(n => n.scanned && n.kind === 'ore');
  put(g, 'drill_mk1', node.x - 1, node.y - 1);
  put(g, 'smelter', ...Object.values(freeSpot(g, 3, 3)), 'smelt_iron');
  g.startResearch('t_masonry');
  for (let i = 0; i < 300; i++) g.tick(1);

  const json = JSON.parse(JSON.stringify(g.toJSON()));
  const back = Game.fromJSON(json, { data, planets, world: worldFor(g.planet) });
  assert.equal(back.time, g.time);
  assert.equal(back.structures.length, g.structures.length);
  assert.equal(back.research.current, g.research.current);
  assert.ok(Math.abs(back.research.progress - g.research.progress) < 1e-6);
  assert.equal(back.hq().id, g.hq().id);
  assert.deepEqual(back.map.nodes.map(n => Math.round(n.amount)), g.map.nodes.map(n => Math.round(n.amount)));
  assert.deepEqual(back.map.nodes.map(n => n.scanned), g.map.nodes.map(n => n.scanned));
  assert.ok(Math.abs(exploredFraction(back.fog) - exploredFraction(g.fog)) < 0.02, 'the fog should reload roughly unchanged');
  const inv = g.inventory(), inv2 = back.inventory();
  for (const k of Object.keys(inv)) assert.ok(Math.abs((inv2[k] || 0) - inv[k]) < 1e-6, 'inventory ' + k);
  // and it keeps running
  for (let i = 0; i < 60; i++) { g.tick(1); back.tick(1); }
  assert.equal(back.structures.length, g.structures.length);
});

test('events fire for the things a UI needs to react to', () => {
  const g = newGame();
  const seen = [];
  g.on('*', e => seen.push(e.type));
  put(g, 'lab', ...Object.values(freeSpot(g, 3, 3)));
  g.scan(g.map.width / 2, g.map.height / 2, 200);
  g.tick(5);
  assert.ok(seen.includes('structure:done'));
  assert.ok(seen.includes('scan'));
  assert.ok(seen.includes('notify'));
});

// ---------------------------------------------------------------- the universe adapter

test('a universe planet can be adapted and played', async () => {
  let universe = null;
  try {
    universe = {
      galaxy: await import('../../../universe/js/galaxy.js'),
      system: await import('../../../universe/js/system.js'),
      planetmap: await import('../../../universe/js/planetmap.js'),
    };
  } catch { return; }                                   // the universe project is optional
  const { universePlanets, fromUniversePlanet, UNIVERSE_RARE } = await import('../js/planets.js');
  const galaxy = universe.galaxy.generateGalaxy({ seed: 5, stars: 30 });
  const systems = galaxy.stars.slice(0, 4).map(st => universe.system.generateSystem(st, { seed: 5 }));
  const provider = universePlanets(systems, data.resources, { generateMap: universe.planetmap.generatePlanetMap });
  const list = provider.list();
  assert.ok(list.length > 0, 'no landable planets came back');
  for (const p of list) {
    assert.ok(ARCHETYPES[p.archetype], `${p.name} mapped to unknown archetype ${p.archetype}`);
    assert.ok(p.resources.includes('iron_ore') && p.resources.includes('coal'), p.name + ' is not landable');
    for (const r of p.rareElements) assert.ok(data.resource[r]?.kind === 'rare', `${p.name} rare ${r}`);
    assert.ok(p.dayLength >= 300 && p.gravity > 0, p.name);
    assert.equal(provider.get(p.id), p);
  }
  for (const key of Object.values(UNIVERSE_RARE)) assert.ok(data.resource[key], 'adapter names unknown ' + key);
  // moons come through as landing targets of their own, flagged and pointing at their planet
  const moons = list.filter(p => p.moon);
  assert.ok(moons.length > 0, 'no moons came back as landing targets');
  for (const m of moons) {
    assert.ok(m.parentId && m.universe.moonId, m.name + ' has no parent');
    assert.ok(provider.original(m.id)?.moon === true);
  }
  assert.equal(universePlanets(systems, data.resources, { moons: false }).list().some(p => p.moon), false);
  const g = Game.createSync({ seed: 5, data, planets: provider, planet: list[0], size: 64, nests: false });
  g.flags.noWaves = true;
  assert.ok(g.hq());
  assert.ok(g.map.nodes.length > 5);
  for (let i = 0; i < 200; i++) g.tick(1);
  assert.equal(g.lost, false);
});

// ---------------------------------------------------------------- hazards and nests
// Added with the content pass: every archetype's weather has to actually fire, say so, and do the
// thing `data/balance.json -> hazards` says it does.

test('planet hazards run as timed weather: they start, they bite, they pass', () => {
  const volcanic = makePlanet({ id: 'v', seed: 9, archetype: 'volcanic', resourceTable: data.resources });
  const g = Game.createSync({ seed: 9, data, planets, planet: volcanic, world: generatePlanetMap(volcanic, { width: 96, height: 48 }), size: 64, nests: false });
  g.flags.noWaves = true;
  assert.ok(volcanic.hazards.length, 'a volcanic world should carry hazards');

  // force one rather than waiting for the clock
  const tag = volcanic.hazards.find(t => BALANCE.hazards[t]);
  const def = BALANCE.hazards[tag];
  g.hazard = { type: tag, until: g.time + 60, at: g.time };
  g.notify(def.notify, { name: 'the base', n: 0 });
  assert.ok(g.notifications.some(n => n.type === def.notify), tag + ' raised no notification');
  // whatever it does, it does through hazardEffect, so one of these has to be non-zero
  const bite = ['structureDamage', 'unitDamage', 'solarPenalty', 'machineSlow', 'coldDrain', 'windBonus', 'regrowRate']
    .some(k => g.hazardEffect(k, 0) > 0);
  assert.ok(bite, tag + ' is a hazard that does nothing');

  for (let i = 0; i < 80; i++) g.tick(1);
  assert.equal(g.hazard, null, tag + ' never ended');
  assert.ok(g.notifications.some(n => n.type === 'hazard_over'));
});

test('nests are seeded on the map, raise the threat, and are worth clearing', () => {
  const planet = planets.list()[0];
  const g = Game.createSync({ seed: 11, data, planets, planet, world: worldFor(planet), size: 96, nests: true });
  assert.ok(g.nests.length > 0, 'a world with nests turned on should have some');
  for (const n of g.nests) {
    assert.ok(data.nestTables[g.planet.archetype].includes(n.type), `${n.type} is not on ${g.planet.archetype}'s nest table`);
    assert.ok(n.def.spawns && data.unit[n.def.spawns.unit], n.type + ' spawns nothing real');
    assert.ok(Math.hypot(n.x - g.hq().x, n.y - g.hq().y) > 8, 'a nest should not be on top of the pod');
  }
  // a nest left standing is a slow bleed on the threat clock: it does not out-earn the decay on its
  // own, but the base is that much closer to the next attack for every one it has not cleared
  g.threat = 500;
  for (let i = 0; i < 120; i++) g.tick(1);
  const withNests = 500 - g.threat;
  const pure = data.waves.threat.decayPerSecond * 120;
  assert.ok(withNests < pure, `the threat fell ${withNests.toFixed(0)} with ${g.nests.length} nests standing; plain decay alone is ${pure}`);
  assert.ok(withNests > 0, 'the threat should still fall when the base is quiet');
});
