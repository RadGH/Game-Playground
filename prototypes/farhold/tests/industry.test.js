// node --test prototypes/farhold/tests/industry.test.js
//
// BUILDING_EXPANSION §1, §2, §3 and §8 — raw materials, refining, the crafting fold-in, and power.
//
// Four of these tests are the brief's own checklist, and they are the four worth reading first:
//
//   * the distance trade-off actually trades off — a rich node far away really can lose to a lean
//     one close by, and the crossover is where the maths says it is;
//   * no recipe is a dead end — every output is somebody's input, a fuel, or a stated goal;
//   * a pool shares and a distant store does not;
//   * load shedding drops the right things first.
//
// Everything else here is the small print those four rest on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { makeRng } from '../../emberveil/js/rng.js';
import {
  faceRate, perSwing, haulReport, compareNodes, breakEvenDistance, breakEvenAgainst,
  mine, tickNodes, createNodeField, placedNode, drillRate, bandFor, nodeText,
} from '../js/resources.js';
import { createStoreNetwork } from '../js/stores.js';
import { createGrid } from '../js/power.js';
import { createWorks } from '../js/refine.js';
import { realCost } from '../js/buildplan.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const RES = read('../data/resources.json');
const REF = read('../data/refining.json');
const POW = read('../data/power.json');
const STR = read('../data/structures.json');

/** A node built by hand so a test can state exactly what it is arguing about. */
function node({ id = 'n', kind = 'ore_outcrop', resource = 'iron_ore', richness = 1, x = 0, z = 0, amount = 1000 }) {
  return {
    id, kind, resource, x, z, richness, band: bandFor(richness, RES),
    amount, initial: amount, infinite: false, radius: 2,
    hardness: RES.nodeKinds[kind].hardness, respawnSeconds: RES.nodeKinds[kind].respawnSeconds,
    handMinable: RES.nodeKinds[kind].handMinable !== false,
    depleted: false, gone: false, respawnIn: null, worked: 0,
  };
}

// ---------------------------------------------------------------- §1 the trade-off

test('§1 the distance trade-off actually trades off: a rich node far away loses to a lean one nearby', () => {
  const ctx = { data: RES, origin: { x: 0, z: 0 }, tool: 'iron_tool' };
  const rich = node({ id: 'rich', richness: 2.2, x: 400, z: 0 });
  const lean = node({ id: 'lean', richness: 0.6, x: 20, z: 0 });

  const r = haulReport(rich, ctx), l = haulReport(lean, ctx);

  // the rich node is unarguably richer AT THE FACE — that is what makes the choice a choice
  assert.ok(r.facePerMinute > l.facePerMinute * 3, `rich face ${r.facePerMinute} vs lean ${l.facePerMinute}`);
  // …and unarguably worse once you have carried it home
  assert.ok(r.deliveredPerMinute < l.deliveredPerMinute,
    `far rich delivers ${r.deliveredPerMinute}/min, near lean delivers ${l.deliveredPerMinute}/min`);
  // and the player is told why, in words — with a name that does not stutter
  assert.match(nodeText(rich, ctx), /^Mother Lode Iron Ore Outcrop \(2\.2x\)/);
  assert.match(nodeText(rich, ctx), /at the face/);
  assert.match(nodeText(rich, ctx), /once you have walked it home/);

  // the same rich node close by wins easily, so richness is never a trap, only a distance question
  const richNear = node({ id: 'richNear', richness: 2.2, x: 100, z: 0 });
  assert.ok(haulReport(richNear, ctx).deliveredPerMinute > l.deliveredPerMinute);
});

test('§1 delivery falls off with distance and never goes up', () => {
  const ctx = { data: RES, origin: { x: 0, z: 0 }, tool: 'iron_tool' };
  let last = Infinity;
  for (const d of [0, 25, 50, 100, 200, 400, 800]) {
    const rep = haulReport(node({ richness: 1.4, x: d }), ctx);
    assert.ok(rep.deliveredPerMinute <= last + 1e-9, `${d} m delivered more than ${d - 1} m did`);
    assert.ok(rep.deliveredPerMinute <= rep.facePerMinute + 1e-9, 'you cannot deliver more than you dig');
    last = rep.deliveredPerMinute;
  }
});

test('§1 break-even distance is where the two nodes actually cross', () => {
  const ctx = { data: RES, origin: { x: 0, z: 0 }, tool: 'iron_tool' };
  const lean = node({ id: 'lean', richness: 0.6, x: 20 });
  const rich = node({ id: 'rich', richness: 2.2, x: 0 });
  const target = haulReport(lean, ctx).deliveredPerSecond;
  const d = breakEvenDistance(faceRate(rich, ctx), target, { data: RES, resource: 'iron_ore' });

  assert.ok(d > 50, `break-even came out at ${d} m, which cannot be right`);
  // just inside it the rich node still wins; just outside it it does not. That is the definition.
  const inside = haulReport(node({ richness: 2.2, x: d - 20 }), ctx).deliveredPerSecond;
  const outside = haulReport(node({ richness: 2.2, x: d + 20 }), ctx).deliveredPerSecond;
  assert.ok(inside > target, 'inside the break-even the rich node should still win');
  assert.ok(outside < target, 'outside it it should not');

  // and the friendly wrapper says the same thing in a sentence
  const advice = breakEvenAgainst(rich, lean, ctx);
  assert.ok(Math.abs(advice.distance - d) < 1, `${advice.distance} vs ${d}`);
  assert.match(advice.text, /Worth walking to anything inside/);
});

test('§1 heavy materials make the walk worse — stone is a different decision from gold', () => {
  const ctx = { data: RES, origin: { x: 0, z: 0 }, tool: 'iron_tool' };
  const far = 250;
  const stone = haulReport(node({ kind: 'quarry_face', resource: 'stone', richness: 1, x: far }), ctx);
  const gold = haulReport(node({ kind: 'ore_outcrop', resource: 'gold_ore', richness: 1, x: far }), ctx);
  // stone digs faster than gold ore does, yet loses far more of it to the walk
  assert.ok(stone.facePerMinute > gold.facePerMinute);
  assert.ok(stone.walkShare > gold.walkShare, `stone walk share ${stone.walkShare} vs gold ${gold.walkShare}`);
});

test('§8 putting a store pool on the node takes the walk out of the sum entirely', () => {
  const stores = createStoreNetwork({ power: POW, materials: RES.materials });
  const rich = node({ id: 'rich', richness: 2.2, x: 400, z: 0 });
  const lean = node({ id: 'lean', richness: 0.6, x: 20, z: 0 });
  const ctx = { data: RES, origin: { x: 0, z: 0 }, tool: 'iron_tool', stores };

  assert.ok(haulReport(rich, ctx).deliveredPerMinute < haulReport(lean, ctx).deliveredPerMinute);

  // move the pool out to the lode: a crate and a logistics pole, which is the whole §8 answer
  stores.add({ id: 'outpost', type: 'storage_crate', x: 400, z: 0 });
  const after = haulReport(rich, ctx);
  assert.equal(after.pooled, true);
  assert.equal(after.walkSeconds, 0);
  assert.ok(after.deliveredPerMinute > haulReport(lean, ctx).deliveredPerMinute,
    'with a store on it the rich node should win again — that is the decision the pool buys');
  assert.match(nodeText(rich, ctx), /nothing to carry/);
});

test('§1 compareNodes ranks by what actually arrives, and says why', () => {
  const ctx = { data: RES, origin: { x: 0, z: 0 }, tool: 'iron_tool' };
  const rows = compareNodes([
    node({ id: 'far-rich', richness: 2.4, x: 500 }),
    node({ id: 'near-lean', richness: 0.7, x: 15 }),
    node({ id: 'mid', richness: 1.3, x: 120 }),
  ], ctx);
  assert.equal(rows[0].because, 'best delivery you have found');
  assert.ok(rows.every((r, i) => i === 0 || r.deliveredPerMinute <= rows[i - 1].deliveredPerMinute));
  const farRich = rows.find(r => r.node === 'far-rich');
  assert.equal(farRich.because, 'richer, but the walk eats the difference');
});

// ---------------------------------------------------------------- §1 tools, depletion, respawn

test('§1 the wrong tool is not slow, it is impossible — and the report says which tool you need', () => {
  const spire = node({ kind: 'crystal_spire', resource: 'crystal_raw', richness: 1 });
  assert.equal(faceRate(spire, { data: RES, tool: 'stone_tool' }), 0);
  assert.ok(faceRate(spire, { data: RES, tool: 'steel_tool' }) > 0);
  const rep = haulReport(spire, { data: RES, tool: 'stone_tool', origin: { x: 0, z: 0 } });
  assert.equal(rep.workable, false);
  assert.match(rep.why, /too hard for a/);

  // a gas vent cannot be taken by hand at all, however good the tool (§1.14)
  const vent = node({ kind: 'gas_vent', resource: 'vent_gas' });
  assert.equal(faceRate(vent, { data: RES, tool: 'powered_tool' }), 0);
  assert.ok(drillRate(vent, { data: RES }) > 0, 'but a structure on it works fine');
});

test('§1 a drill is a promotion over swinging, not a convenience', () => {
  const n = node({ richness: 1.2 });
  const byHand = faceRate(n, { data: RES, tool: 'iron_tool' });
  assert.ok(drillRate(n, { data: RES }) > byHand * 3, 'the drill should be worth building');
  assert.ok(perSwing(n, { data: RES, tool: 'iron_tool' }) > 0.3, 'a swing that gives nothing is a bad swing');
});

test('§1.20 nodes deplete, come back a little poorer, and never go sterile', () => {
  const n = node({ richness: 1.5, amount: 10 });
  const first = mine(n, 100, { data: RES, tool: 'iron_tool' });
  assert.equal(+first.got.toFixed(6), 10);
  assert.equal(n.depleted, true);
  assert.equal(n.amount, 0);
  assert.ok(n.respawnIn > 0);
  assert.equal(mine(n, 10, { data: RES, tool: 'iron_tool' }).got, 0, 'a worked-out node gives nothing');

  const back = tickNodes([n], n.respawnIn + 1, RES);
  assert.deepEqual(back.map(x => x.id), ['n']);
  assert.equal(n.depleted, false);
  assert.ok(n.richness < 1.5 && n.richness >= RES.respawn.richnessFloor, `came back at ${n.richness}`);
  assert.ok(n.amount > 0, 'it is workable again — the ground round the base never goes sterile');

  // …and it decays towards a floor rather than to nothing
  for (let i = 0; i < 40; i++) { n.amount = 0; n.depleted = true; n.respawnIn = 1; tickNodes([n], 2, RES); }
  assert.ok(n.richness >= RES.respawn.richnessFloor - 1e-9, `decayed past the floor to ${n.richness}`);
  assert.ok(n.amount >= 1);
});

test('§1 a wreck does not come back, and says so', () => {
  const w = placedNode({ data: RES, rng: makeRng(3), kindId: 'wreck', x: 5, z: 5 });
  w.amount = 1;
  mine(w, 100, { data: RES, tool: 'iron_tool' });
  assert.equal(w.depleted, true);
  assert.equal(w.gone, true);
  assert.deepEqual(tickNodes([w], 1e6, RES), []);
});

test('§1.19 a low-band world is thinner than a high-band one', () => {
  const opts = { data: RES, area: { x: 0, z: 0, radius: 400 }, biome: 'hills', count: 60 };
  const low = createNodeField({ ...opts, rng: makeRng(11), band: 'low' });
  const high = createNodeField({ ...opts, rng: makeRng(11), band: 'high' });
  const avg = list => list.reduce((a, n) => a + n.richness, 0) / list.length;
  assert.ok(low.length <= high.length, `${low.length} vs ${high.length}`);
  assert.ok(avg(low) < avg(high), `low band averaged ${avg(low).toFixed(2)}, high ${avg(high).toFixed(2)}`);
  // every node it laid down is a real one
  for (const n of low) {
    assert.ok(RES.nodeKinds[n.kind], `unknown kind ${n.kind}`);
    assert.ok(RES.materials[n.resource] || n.rare, `unknown resource ${n.resource}`);
    assert.ok(n.richness > 0 && n.amount > 0);
  }
});

test('§1.3 a rare seam only turns up on a world that actually holds that element', () => {
  const planet = { rare: ['aetherite'], elements: { aetherite: { name: 'Aetherite', color: '#b79cf5' } } };
  const withRare = createNodeField({ data: RES, rng: makeRng(5), band: 'high', planet, count: 10, area: { x: 0, z: 0, radius: 200 } });
  assert.ok(withRare.some(n => n.rare && n.resource === 'aetherite'));
  const without = createNodeField({ data: RES, rng: makeRng(5), band: 'high', count: 10, area: { x: 0, z: 0, radius: 200 } });
  assert.equal(without.some(n => n.rare), false, 'and never on a world that does not');
});

// ---------------------------------------------------------------- §8 pools

test('§8.1 a pool shares, and a store further away does not', () => {
  const net = createStoreNetwork({ power: POW, materials: RES.materials });
  net.add({ id: 'a', type: 'storage_crate', x: 0, z: 0 });      // linkRadius 7
  net.add({ id: 'b', type: 'storage_crate', x: 6, z: 0 });      // inside a's reach
  net.add({ id: 'far', type: 'storage_crate', x: 120, z: 0 });  // nowhere near

  assert.equal(net.shares('a', 'b'), true);
  assert.equal(net.shares('a', 'far'), false);

  const home = net.poolOf('a');
  net.put(home, 'iron_ingot', 40);
  // put in through one store, taken out through the other: one pile, as far as anything can tell
  assert.equal(net.count(home, 'iron_ingot'), 40);
  assert.equal(net.count(net.poolOf('far'), 'iron_ingot'), 0, 'the distant crate can see none of it');
  assert.equal(net.take(net.poolOf('b'), 'iron_ingot', 25), 25);
  assert.equal(net.count(home, 'iron_ingot'), 15);
});

test('§8.2 a logistics pole joins two pools into one', () => {
  const net = createStoreNetwork({ power: POW, materials: RES.materials });
  net.add({ id: 'home', type: 'storage_crate', x: 0, z: 0 });
  net.add({ id: 'pit', type: 'storage_crate', x: 40, z: 0 });
  assert.equal(net.shares('home', 'pit'), false);
  assert.equal(net.pools().length, 2);

  net.add({ id: 'pole', type: 'logistics_pole', x: 20, z: 0 });   // linkRadius 22 reaches both
  assert.equal(net.shares('home', 'pit'), true);
  assert.equal(net.pools().length, 1);
});

test('§8.3 hauling across a gap costs you, and the advice says what the fix is worth', () => {
  const net = createStoreNetwork({ power: POW, materials: RES.materials });
  net.add({ id: 'home', type: 'storage_crate', x: 0, z: 0 });
  net.add({ id: 'quarry', type: 'storage_crate', x: 300, z: 0 });

  const near = net.haulThroughput(50, 'hand_cart');
  const far = net.haulThroughput(400, 'hand_cart');
  assert.ok(far.perMinute < near.perMinute / 2, 'eight times the distance should hurt a lot');

  const advice = net.linkAdvice('home', 'quarry');
  assert.equal(advice.joined, false);
  assert.ok(advice.gap > 280);
  assert.ok(advice.polesToJoin >= 1);
  assert.match(advice.text, /relay mast/);
});

test('§8 one raw material may not swamp a general store, and a silo is exempt', () => {
  const net = createStoreNetwork({ power: POW, materials: RES.materials });
  const crate = net.add({ id: 'c', type: 'storage_crate', x: 0, z: 0 });   // cap 250
  const pool = net.poolOf('c');
  const fitted = net.put(pool, 'iron_ore', 500);
  assert.ok(fitted <= crate.cap * POW.storeShare.perResource + 1e-9, `${fitted} of one ore went into a general crate`);
  assert.ok(fitted > 0);
  // finished goods are what the crate is for, so they are not capped
  assert.ok(net.put(pool, 'iron_ingot', 150) > crate.cap * POW.storeShare.perResource);

  const silo = createStoreNetwork({ power: POW, materials: RES.materials });
  silo.add({ id: 's', type: 'storage_silo', x: 0, z: 0 });
  const sp = silo.poolOf('s');
  assert.equal(silo.put(sp, 'iron_ore', 900), 900, 'a silo is for exactly this');
  assert.equal(silo.put(sp, 'cloth', 10), 0, 'and for nothing else');
});

test('§8 a wooden crate does not hold water; a tank does', () => {
  const net = createStoreNetwork({ power: POW, materials: RES.materials });
  net.add({ id: 'crate', type: 'storage_crate', x: 0, z: 0 });
  net.add({ id: 'tank', type: 'fluid_tank', x: 200, z: 0 });
  assert.equal(net.put(net.poolOf('crate'), 'water', 10), 0);
  assert.equal(net.put(net.poolOf('tank'), 'water', 10), 10);
  assert.equal(net.put(net.poolOf('tank'), 'coolant', 5), 5);
  assert.equal(net.put(net.poolOf('tank'), 'stone', 5), 0);
});

// ---------------------------------------------------------------- §8 power

/** A grid with one generator, fuel in a crate under it, and a machine per priority class. */
function riggedGrid({ gen = 30, draws = {} } = {}) {
  const stores = createStoreNetwork({ power: POW, materials: RES.materials });
  stores.add({ id: 'crate', type: 'storage_crate', x: 0, z: 0 });
  stores.put(stores.poolOf('crate'), 'coal', 60);
  const grid = createGrid({ power: POW, stores });
  grid.add({ id: 'gen', type: 'burner_generator', x: 0, z: 0, gen });
  for (const [cls, draw] of Object.entries(draws)) {
    grid.add({ id: cls, type: 'machine', x: 2, z: 0, draw, priority: cls, busy: true });
  }
  return { stores, grid };
}

test('§8.5 load shedding drops the right things first, in the order the data states', () => {
  const { grid } = riggedGrid({
    gen: 30,
    draws: { life: 10, defence: 20, extraction: 20, waypoint: 10, refining: 20, crafting: 20, comfort: 20 },
  });
  grid.tick(1);

  // 30 units to spend, 120 wanted. Top of the ladder first: life (10), then defence (20). Nothing left.
  assert.equal(grid.poweredOf('life'), 1, 'life is never shed');
  assert.equal(grid.poweredOf('defence'), 1, 'the guns stay on');
  assert.equal(grid.poweredOf('extraction'), 0);
  assert.equal(grid.poweredOf('comfort'), 0, 'the lamps go first, always');
  assert.equal(grid.stateOf('comfort'), 'shed');

  // and nothing lower ever beats something higher, whatever the numbers
  const order = grid.order;
  let last = 1;
  for (const cls of order) { const p = grid.poweredOf(cls); assert.ok(p <= last + 1e-9, `${cls} beat the class above it`); last = p; }
});

test('§8.5 more power means less shedding, one class at a time', () => {
  const draws = { life: 10, defence: 20, extraction: 20, waypoint: 10, refining: 20, crafting: 20, comfort: 20 };
  const powered = gen => {
    const { grid } = riggedGrid({ gen, draws });
    grid.tick(1);
    return Object.keys(draws).filter(c => grid.poweredOf(c) > 0.99);
  };
  assert.deepEqual(powered(30), ['life', 'defence']);
  assert.deepEqual(powered(60), ['life', 'defence', 'extraction', 'waypoint']);
  assert.deepEqual(powered(120), Object.keys(draws), 'enough power and nothing is shed at all');
});

test('§8 a generator burns what the load asked for and no more — the duty cycle', () => {
  const busy = riggedGrid({ gen: 30, draws: { refining: 30 } });
  const idle = riggedGrid({ gen: 30, draws: {} });
  const coalOf = s => s.count(s.poolOf('crate'), 'coal');
  const before = coalOf(busy.stores);
  for (let i = 0; i < 60; i++) { busy.grid.tick(1); idle.grid.tick(1); }
  const burnedBusy = before - coalOf(busy.stores);
  const burnedIdle = before - coalOf(idle.stores);
  assert.ok(burnedBusy > 0, 'a working base burns coal');
  assert.ok(burnedIdle < burnedBusy, `an idle one burns less (${burnedIdle} vs ${burnedBusy})`);
});

test('§8 no fuel means no power counted, not power that is not there', () => {
  const stores = createStoreNetwork({ power: POW, materials: RES.materials });
  stores.add({ id: 'crate', type: 'storage_crate', x: 0, z: 0 });      // empty
  const grid = createGrid({ power: POW, stores });
  grid.add({ id: 'gen', type: 'burner_generator', x: 0, z: 0 });
  grid.add({ id: 'mill', type: 'machine', x: 2, z: 0, draw: 10, priority: 'refining', busy: true });
  const rep = grid.tick(1);
  assert.equal(rep.networks[0].gen, 0);
  assert.equal(grid.poweredOf('mill'), 0);
  assert.equal(grid.stateOf('mill'), 'shed');
});

test('§8.7 a battery carries a solar base through the night', () => {
  const grid = createGrid({ power: POW });
  grid.add({ id: 'sun', type: 'solar_array', x: 0, z: 0 });
  grid.add({ id: 'batt', type: 'battery_bank', x: 4, z: 0 });
  grid.add({ id: 'mill', type: 'machine', x: 4, z: 0, draw: 20, priority: 'refining', busy: true });

  for (let i = 0; i < 120; i++) grid.tick(1, { daylight: 1 });      // a sunny afternoon
  const charged = grid.get('batt').charge;
  assert.ok(charged > 100, `battery only reached ${charged.toFixed(0)}`);

  const night = grid.tick(1, { daylight: 0 });
  assert.equal(night.networks[0].gen, 0, 'the sun is down');
  assert.ok(grid.poweredOf('mill') > 0.99, 'and the mill is still running off the battery');
});

test('§8 a machine no supplier reaches says so rather than pretending', () => {
  const grid = createGrid({ power: POW });
  grid.add({ id: 'gen', type: 'burner_generator', x: 0, z: 0, gen: 50, fuel: null });
  grid.add({ id: 'far', type: 'machine', x: 500, z: 0, draw: 5, priority: 'refining', busy: true });
  grid.tick(1);
  assert.equal(grid.stateOf('far'), 'unpowered');
  assert.equal(grid.poweredOf('far'), 0);
});

test('§8.10 a brownout is announced once, and so is the recovery', () => {
  const lines = [];
  const stores = createStoreNetwork({ power: POW, materials: RES.materials });
  stores.add({ id: 'crate', type: 'storage_crate', x: 0, z: 0 });
  stores.put(stores.poolOf('crate'), 'coal', 200);
  const grid = createGrid({ power: POW, stores, log: m => lines.push(m) });
  grid.add({ id: 'gen', type: 'burner_generator', x: 0, z: 0, gen: 10 });
  const mill = grid.add({ id: 'mill', type: 'machine', x: 2, z: 0, draw: 60, priority: 'refining', busy: true });
  for (let i = 0; i < 5; i++) grid.tick(1);
  assert.equal(lines.filter(l => /Power short/.test(l)).length, 1, 'once, not every tick');
  assert.match(lines[0], /refining/);

  mill.busy = false; mill.draw = 1;
  for (let i = 0; i < 5; i++) grid.tick(1);
  assert.equal(lines.filter(l => /Power restored/.test(l)).length, 1);
});

// ---------------------------------------------------------------- §2 refining

/** A base with a pool, a furnace in it, ore and coal on the shelf. */
function rig({ machine = 'furnace', stock = {}, grid = null } = {}) {
  const stores = createStoreNetwork({ power: POW, materials: RES.materials });
  stores.add({ id: 'crate', type: 'storage_crate', x: 0, z: 0, cap: 5000 });
  const pool = stores.poolOf('crate');
  for (const [res, n] of Object.entries(stock)) stores.put(pool, res, n);
  const log = [];
  const works = createWorks({ refining: REF, resources: RES, stores, grid, log: m => log.push(m) });
  works.place({ id: 'm1', type: machine, x: 1, z: 0 });
  return { stores, pool, works, log, count: res => stores.count(pool, res) };
}

test('§2.19 a job queued runs while you are somewhere else', () => {
  const r = rig({ stock: { iron_ore: 20, coal: 10 } });
  assert.equal(r.works.queue('m1', 'smelt_iron', 5).ok, true);
  r.works.catchUp(600);                       // ten minutes in a dungeon
  assert.equal(r.count('iron_ingot'), 5);
  assert.equal(r.count('slag'), 5);
  assert.equal(r.count('iron_ore'), 10);
  assert.ok(r.count('coal') < 10, 'and it burned fuel doing it');
  assert.equal(r.works.snapshot('m1').state, 'idle');
});

test('§2 a machine with nothing to work with stops and says what it wants', () => {
  const r = rig({ stock: { coal: 10 } });
  r.works.queue('m1', 'smelt_iron', 3);
  r.works.catchUp(120);
  const snap = r.works.snapshot('m1');
  assert.equal(snap.state, 'starved');
  assert.match(snap.stateText, /^Waiting for Iron Ore/);  // R26 adds where it looked
  assert.ok(r.log.some(l => /no Iron Ore/.test(l)));
});

test('§2 a furnace with no fuel goes out', () => {
  const r = rig({ stock: { iron_ore: 20 } });
  r.works.queue('m1', 'smelt_iron', 3);
  r.works.catchUp(120);
  assert.match(r.works.snapshot('m1').stateText, /^Out of fuel/);  // R26 adds where it looked
});

test('§2.18 recipes unlock by doing, and nothing else', () => {
  const r = rig({ stock: { iron_ore: 100, coal: 60 } });
  assert.equal(r.works.isUnlocked('smelt_silver'), false);
  assert.match(r.works.unlockProgress('smelt_silver').text, /6 more Smelt Iron/);
  assert.equal(r.works.queue('m1', 'smelt_silver', 1).ok, false);

  r.works.queue('m1', 'smelt_iron', 6);
  const { unlocked } = r.works.catchUp(600);
  assert.ok(unlocked.includes('smelt_silver'), `unlocked: ${unlocked.join(', ')}`);
  assert.equal(r.works.isUnlocked('smelt_silver'), true);
  assert.ok(r.log.some(l => /Smelt Silver is now on the Furnace/.test(l)));
});

test('§2.20 a tier-2 machine will not run without a grid, and a tier-1 one limps', () => {
  const noGrid = rig({ machine: 'assembler', stock: { steel_ingot: 20, bronze_ingot: 10 } });
  noGrid.works.queue('m1', 'make_machine_part', 1);
  noGrid.works.catchUp(300);
  assert.equal(noGrid.count('machine_part'), 0);
  assert.equal(noGrid.works.snapshot('m1').state, 'unpowered');

  const handTurned = rig({ machine: 'sawmill', stock: { log: 10 } });
  handTurned.works.queue('m1', 'saw_planks', 2);
  handTurned.works.catchUp(300);
  assert.equal(handTurned.count('plank'), 8, 'a sawmill turns by hand, just slowly');
});

test('§2 with a grid under it the assembler runs, and stops when the grid is shed', () => {
  const stores = createStoreNetwork({ power: POW, materials: RES.materials });
  stores.add({ id: 'crate', type: 'storage_crate', x: 0, z: 0, cap: 5000 });
  const pool = stores.poolOf('crate');
  stores.put(pool, 'steel_ingot', 40);
  stores.put(pool, 'bronze_ingot', 20);
  stores.put(pool, 'coal', 400);

  const grid = createGrid({ power: POW, stores });
  grid.add({ id: 'gen', type: 'burner_generator', x: 0, z: 0, gen: 200 });
  const works = createWorks({ refining: REF, resources: RES, stores, grid });
  works.place({ id: 'asm', type: 'assembler', x: 2, z: 0 });
  works.queue('asm', 'make_machine_part', 2);
  for (let i = 0; i < 200; i++) { grid.tick(1); works.tick(1); }
  assert.equal(stores.count(pool, 'machine_part'), 2);

  // now starve the grid: something further up the ladder takes the lot
  grid.add({ id: 'guns', type: 'machine', x: 2, z: 0, draw: 400, priority: 'defence', busy: true });
  works.queue('asm', 'make_machine_part', 1);
  grid.tick(1); works.tick(1);
  assert.equal(works.snapshot('asm').state, 'shed');
  assert.match(works.snapshot('asm').stateText, /switched off to keep the important things on/);
});

test('§2 the refinery will not run without coolant, and says which', () => {
  const stores = createStoreNetwork({ power: POW, materials: RES.materials });
  stores.add({ id: 'crate', type: 'storage_crate', x: 0, z: 0, cap: 5000 });
  stores.add({ id: 'tank', type: 'fluid_tank', x: 2, z: 0 });
  const pool = stores.poolOf('crate');
  stores.put(pool, 'steel_ingot', 30);
  stores.put(pool, 'reagent', 20);
  stores.put(pool, 'coal', 900);
  const grid = createGrid({ power: POW, stores });
  grid.add({ id: 'gen', type: 'burner_generator', x: 0, z: 0, gen: 300 });
  const log = [];
  const works = createWorks({ refining: REF, resources: RES, stores, grid, log: m => log.push(m) });
  works.place({ id: 'ref', type: 'refinery', x: 1, z: 0 });
  works.queue('ref', 'refine_alloy', 1);
  for (let i = 0; i < 100; i++) { grid.tick(1); works.tick(1); }
  assert.equal(stores.count(pool, 'tempered_alloy'), 0);
  assert.ok(log.some(l => /out of Coolant/.test(l)));

  stores.put(pool, 'coolant', 50);
  for (let i = 0; i < 100; i++) { grid.tick(1); works.tick(1); }
  assert.equal(stores.count(pool, 'tempered_alloy'), 2);
});

test('§2 a machine outside every store pool has nothing to work with', () => {
  const r = rig({ stock: { iron_ore: 20, coal: 10 } });
  r.works.place({ id: 'exile', type: 'furnace', x: 900, z: 0 });
  r.works.queue('exile', 'smelt_iron', 1);
  r.works.catchUp(120);
  assert.equal(r.works.snapshot('exile').pooled, false);
  assert.equal(r.works.snapshot('exile').state, 'starved');
});

test('§9.6 the rare-element recipe is honest about a world that has none', () => {
  const r = rig({ machine: 'assembler', stock: {} });
  const recipe = REF.recipes.find(x => x.id === 'build_avionics');
  // pretend the boards have been made, so the only thing standing in the way is the element itself
  Object.assign(r.works.completed, { make_machine_part: 20, make_control_board: 20 });

  assert.equal(r.works.inputsOf(recipe), null, 'there is no input list to write');
  assert.match(r.works.queue('m1', 'build_avionics', 1).why, /no rare element/);

  r.works.rare = 'aetherite';
  assert.equal(r.works.inputsOf(recipe).aetherite, 4);
  assert.equal(r.works.queue('m1', 'build_avionics', 1).ok, true);
});

test('§2 a queue survives being saved and loaded', () => {
  const r = rig({ stock: { iron_ore: 40, coal: 30 } });
  r.works.queue('m1', 'smelt_iron', 4);
  r.works.catchUp(40);
  const json = JSON.parse(JSON.stringify(r.works.toJSON()));

  const back = createWorks({ refining: REF, resources: RES, stores: r.stores });
  back.load(json);
  assert.equal(back.size, 1);
  assert.equal(back.snapshot('m1').queued[0].recipe, 'smelt_iron');
  back.catchUp(600);
  assert.equal(r.count('iron_ingot'), 4, 'and it finishes the batch it was part way through');
});

// ---------------------------------------------------------------- §3 the chain closes

test('§3.20 no recipe is a dead end — every output is an input, a fuel, or a stated goal', () => {
  const consumed = new Set();
  for (const r of REF.recipes) for (const k of Object.keys(r.inputs || {})) consumed.add(k);
  for (const m of Object.values(REF.machines)) {
    for (const k of Object.keys(m.fuels || {})) consumed.add(k);
    for (const k of Object.keys(m.coolant || {})) consumed.add(k);
    for (const k of Object.keys(m.build || {})) consumed.add(k);
  }
  for (const table of [POW.generators, POW.batteries, POW.poles, POW.storage, POW.haulers]) {
    for (const d of Object.values(table)) {
      for (const k of Object.keys(d.build || {})) consumed.add(k);
      for (const k of Object.keys(d.fuel || {})) consumed.add(k);
      for (const k of Object.keys(d.coolant || {})) consumed.add(k);
      for (const k of Object.keys(d.upkeep || {})) consumed.add(k);
    }
  }
  /**
   * …AND THE BUILD CATALOGUE, which is the biggest consumer in the game and was not in this list.
   *
   * That blind spot is the other half of round 13's material-vocabulary bug: the catalogue spends
   * `timber` and `parts` in its own short names, so even if it HAD been counted here it would have
   * added words nothing makes rather than uses for the things that are made. `realCost` is the
   * translation, and with it this test is finally asking the whole question.
   */
  for (const piece of STR.structures || []) {
    for (const k of Object.keys(realCost(piece.cost || {}))) consumed.add(k);
  }
  const goals = new Set([
    ...REF.goals.ship, ...REF.goals.network,
    ...Object.values(REF.goals.consumedElsewhere).flatMap(g => g.ids),
  ]);

  for (const r of REF.recipes) {
    for (const out of Object.keys(r.outputs || {})) {
      assert.ok(consumed.has(out) || goals.has(out),
        `${r.id} makes ${out} and nothing in the game ever wants it — either give it a use or list it as a goal`);
    }
  }
});

test('§2 every raw material the ground gives up is wanted by something', () => {
  const wanted = new Set();
  for (const r of REF.recipes) for (const k of Object.keys(r.inputs || {})) wanted.add(k);
  for (const m of Object.values(REF.machines)) for (const k of Object.keys(m.fuels || {})) wanted.add(k);
  for (const d of Object.values(POW.generators)) for (const k of Object.keys(d.fuel || {})) wanted.add(k);
  const goals = new Set(Object.values(REF.goals.consumedElsewhere).flatMap(g => g.ids));

  const dug = new Set();
  for (const k of Object.values(RES.nodeKinds)) for (const res of Object.keys(k.resources || {})) dug.add(res);
  for (const res of dug) {
    assert.ok(wanted.has(res) || goals.has(res), `${res} can be dug up and nothing uses it`);
  }
});

test('§2 every recipe points at a real machine and real materials', () => {
  const ids = new Set();
  for (const r of REF.recipes) {
    assert.ok(!ids.has(r.id), `two recipes share the id ${r.id}`);
    ids.add(r.id);
    assert.ok(REF.machines[r.machine], `${r.id} runs on "${r.machine}", which does not exist`);
    assert.ok(r.time > 0, `${r.id} takes no time at all`);
    for (const k of Object.keys({ ...r.inputs, ...r.outputs })) {
      assert.ok(RES.materials[k], `${r.id} mentions "${k}", which is not a material`);
    }
  }
  for (const r of REF.recipes) {
    if (!r.unlock) continue;
    assert.ok(ids.has(r.unlock.recipe), `${r.id} unlocks from "${r.unlock.recipe}", which does not exist`);
    assert.ok(r.unlock.recipe !== r.id, `${r.id} unlocks from itself`);
  }
});

test('§2 the unlock chain terminates — nothing is locked behind something locked behind it', () => {
  const byId = Object.fromEntries(REF.recipes.map(r => [r.id, r]));
  for (const r of REF.recipes) {
    const seen = new Set([r.id]);
    let at = r;
    while (at.unlock) {
      const next = byId[at.unlock.recipe];
      assert.ok(!seen.has(next.id), `${r.id} is in an unlock loop`);
      seen.add(next.id);
      at = next;
    }
  }
});

test('§9 every goal can actually be reached from what a planet gives you', () => {
  // start from everything the ground, the bestiary and a wreck can hand you, plus one rare element
  const have = new Set(['rare_element']);
  for (const k of Object.values(RES.nodeKinds)) for (const res of Object.keys(k.resources || {})) have.add(res);
  for (const [id, m] of Object.entries(RES.materials)) {
    if (['ore', 'stone', 'wood', 'organic', 'fluid', 'gas', 'salvage', 'rare'].includes(m.kind)) have.add(id);
  }
  // …then keep running whatever you can until nothing new appears
  for (let pass = 0; pass < 20; pass++) {
    let grew = false;
    for (const r of REF.recipes) {
      const ins = Object.keys(r.inputs || {});
      const rareOk = !r.rareInput || have.has('rare_element');
      if (!rareOk || !ins.every(k => have.has(k))) continue;
      for (const out of Object.keys(r.outputs || {})) if (!have.has(out)) { have.add(out); grew = true; }
    }
    if (!grew) break;
  }
  for (const goal of [...REF.goals.ship, ...REF.goals.network]) {
    assert.ok(have.has(goal), `${goal} cannot be built from anything a planet actually holds`);
  }
});

test('§2 the three tiers really are three tiers', () => {
  const tier = t => Object.values(REF.machines).filter(m => m.tier === t);
  assert.ok(tier(0).length >= 3, 'campfire, furnace, kiln at least');
  assert.ok(tier(0).every(m => !m.powerUse), 'tier 0 never needs the grid');
  assert.ok(tier(0).every(m => Object.keys(m.fuels || {}).length), 'tier 0 burns something instead');
  assert.ok(tier(2).every(m => m.needsPower), 'tier 2 does not run without power at all');
  for (const m of Object.values(REF.machines)) {
    assert.ok(m.priority, `${m.name} has no load-shedding class`);
    assert.ok(POW.shedding.order.includes(m.priority), `${m.name} has a class nothing sheds`);
  }
});

// ---------------------------------------------------------------- §3 the fold-in

test('§3.8/§3.11 the bench pays out of the bag first and the store pool second', async () => {
  const { Materials, createCrafting } = await import('../js/craft.js');
  const crafting = read('../data/crafting.json');
  const stores = createStoreNetwork({ power: POW, materials: RES.materials });
  stores.add({ id: 'crate', type: 'storage_crate', x: 0, z: 0, cap: 2000 });
  const pool = stores.poolOf('crate');
  stores.put(pool, 'scrap', 30);

  const bag = new Materials({ scrap: 4 });
  // the bench only needs `rpg` for the forge, and nothing here forges anything
  const craft = createCrafting({
    data: crafting, rpg: { loot: { base: () => null, rerollable: () => true } },
    materials: bag, stores, resources: RES, bench: { x: 0, z: 0 },
  });

  assert.equal(craft.supply.count('scrap'), 34, 'four in your pockets, thirty in the crate');
  assert.deepEqual(craft.supply.missing({ scrap: 20 }), {});
  assert.deepEqual(craft.supply.missing({ scrap: 40 }), { scrap: 6 });

  assert.equal(craft.supply.spend({ scrap: 10 }), true);
  assert.equal(bag.count('scrap'), 0, 'the bag goes first — it is in your hands');
  assert.equal(stores.count(pool, 'scrap'), 24, 'and the crate covers the rest');

  // the panel can say which is which
  const row = craft.heldAll().find(r => r.id === 'scrap');
  assert.equal(row.bag, 0);
  assert.equal(row.stored, 24);

  // step away from the bench and the crate is out of reach again
  craft.setBench({ x: 500, z: 0 });
  assert.equal(craft.supply.count('scrap'), 0);
  assert.deepEqual(craft.supply.missing({ scrap: 5 }), { scrap: 5 });
});

test('§3.8 with no store network the bench is exactly the bench it always was', async () => {
  const { Materials, createCrafting } = await import('../js/craft.js');
  const crafting = read('../data/crafting.json');
  const bag = new Materials({ scrap: 12, essence: 3 });
  const craft = createCrafting({ data: crafting, rpg: { loot: { base: () => null, rerollable: () => true } }, materials: bag });
  assert.equal(craft.supply.count('scrap'), 12);
  assert.equal(craft.supply.spend({ scrap: 5, essence: 1 }), true);
  assert.equal(bag.count('scrap'), 7);
  assert.equal(craft.supply.spend({ dust: 1 }), false, 'and it still refuses what you have not got');
});

// ---------------------------------------------------------------- the data itself

test('every data file carries its _doc, and every material is described', () => {
  for (const [name, data] of [['resources', RES], ['refining', REF], ['power', POW]]) {
    assert.ok(data._doc && data._doc.length > 200, `data/${name}.json needs a real _doc block`);
    assert.equal(data.schema, 1);
  }
  for (const [id, m] of Object.entries(RES.materials)) {
    assert.ok(m.name && m.kind, `${id} is missing a name or a kind`);
    assert.ok(typeof m.weight === 'number' && m.weight > 0, `${id} has no weight, so hauling it is free`);
    assert.ok(typeof m.stack === 'number' && m.stack > 0, `${id} has no stack size`);
  }
  for (const [id, k] of Object.entries(RES.nodeKinds)) {
    if (k.fromPlanet) continue;
    assert.ok(Object.keys(k.resources || {}).length, `${id} yields nothing`);
    assert.ok(k.baseYield > 0, `${id} has no yield`);
    for (const res of Object.keys(k.resources)) assert.ok(RES.materials[res], `${id} yields "${res}", which is not a material`);
  }
});

test('no third-party names anywhere in the new data', () => {
  const blob = JSON.stringify({ RES, REF, POW }).toLowerCase();
  for (const word of ['factorio', 'minecraft', 'rimworld', 'satisfactory', 'diablo', 'skyrim', 'terraria', 'valheim', 'starbound', 'subnautica']) {
    assert.equal(blob.includes(word), false, `"${word}" turned up in player-facing data`);
  }
});
