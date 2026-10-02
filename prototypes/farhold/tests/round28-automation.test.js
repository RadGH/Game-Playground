// node --test prototypes/farhold/tests/round28-automation.test.js
//
// R28 — automation. "Improve building system and automation."
//
// Three groups:
//
//   1. THE BUGS THE AUDIT FOUND — each one played through the real modules: a reloaded Small Drill
//      stays a Small Drill, a digging drill is billed as busy, the away clock runs the drills (and
//      cannot overfill a pile in one long slice), the next-step hint reads a field the drill rows
//      actually carry, a real housing register no longer throws in the population reading, and a
//      recipe's own `power` reaches the grid.
//   2. KEEP-IN-STOCK — the new kind of job: stops at the line, starts again below it, takes turns
//      with a second keep order, posts no work while satisfied, survives a save.
//   3. js/production.js — the overview: rated rates, the meter counting at the source, the
//      upstream diagnosis, the store-share explanation, and alerts that wait out a blip.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createStoreNetwork } from '../js/stores.js';
import { createWorks } from '../js/refine.js';
import { createGrid } from '../js/power.js';
import { createMining } from '../js/mining.js';
import { createLogistics, createAwayClock } from '../js/logistics.js';
import { createProduction } from '../js/production.js';
import { createHousing } from '../js/housing.js';
import { population } from '../js/population.js';
import { WorkBoard } from '../js/work.js';
import { createColony } from '../js/colony.js';
import { createCivics } from '../js/civics.js';
import { createCommand } from '../js/command.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = p => JSON.parse(readFileSync(join(here, p), 'utf8'));
const REFINING = read('../data/refining.json');
const RESOURCES = read('../data/resources.json');
const POWER = read('../data/power.json');
const COLONY = read('../data/colony.json');
const MAIN = readFileSync(join(here, '../js/main.js'), 'utf8');

/** A chest at the origin and whatever is asked for in it. */
function base({ chest = true, grid: withGrid = false, labour = null } = {}) {
  const stores = createStoreNetwork({ power: POWER, materials: RESOURCES });
  if (chest) stores.add({ id: 'chest', type: 'storage_chest', x: 0, z: 0 });
  const grid = withGrid ? createGrid({ power: POWER, stores }) : null;
  const works = createWorks({ refining: REFINING, resources: RESOURCES, stores, grid, labour });
  const pool = () => stores.poolAt(0, 0);
  const give = (res, n) => stores.put(pool(), res, n);
  return { stores, grid, works, pool, give, count: res => stores.count(pool(), res) };
}

/** A seam js/mining.js can work, without the world generator. */
function seam(over = {}) {
  const node = { id: 'n1', kind: 'ore_outcrop', resource: 'iron_ore', amount: 100000, richness: 1, band: 'rich', x: 0, z: 0, ...over };
  return { node, ore: { byId: id => (id === node.id ? node : null), noteWorked() {} } };
}

// ============================================================================ 1. the audit's bugs

test('R28 bug — a Small Drill is still a Small Drill after a save and a load', () => {
  const { stores } = base();
  const { node, ore } = seam();
  const mining = createMining({ data: RESOURCES, ore, stores });
  const entry = { id: 'd1', key: 'small_drill', name: 'Small Drill', x: 0, z: 0, powered: true };
  assert.ok(mining.bindDrill(entry, node).ok);
  const before = mining.overview()[0].digPerSecond;
  const saved = JSON.parse(JSON.stringify(mining.toJSON()));
  assert.equal(saved.drills[0].tool, 'small_drill', 'the kind of drill has to be in the save');

  const again = createMining({ data: RESOURCES, ore, stores });
  again.load(saved, () => entry);
  assert.equal(again.overview()[0].digPerSecond, before, 'a reload must not change how fast it digs');

  // an OLD save has no `tool` at all: it is worked out from the piece standing there
  delete saved.drills[0].tool;
  const old = createMining({ data: RESOURCES, ore, stores });
  old.load(saved, () => entry);
  assert.equal(old.drills[0].tool, 'small_drill');
  assert.equal(old.overview()[0].digPerSecond, before, 'an old save turned every Small Drill into a full Drill');
});

test('R28 bug — a digging drill tells the grid it is busy', () => {
  const { stores } = base();
  const grid = createGrid({ power: POWER, stores });
  const { node, ore } = seam();
  const mining = createMining({ data: RESOURCES, ore, stores, grid });
  grid.add({ id: 'g', type: 'wind_turbine', x: 0, z: 0 });
  grid.add({ id: 'd1', type: 'drill', x: 2, z: 0, draw: 18, priority: 'extraction' });
  const entry = { id: 'd1', key: 'drill', name: 'Drill', x: 2, z: 0, powered: true };
  mining.bindDrill(entry, node);
  mining.tick(0.5);
  assert.equal(grid.get('d1').busy, true);
  grid.tick(1, { wind: 1 });
  assert.equal(grid.overview()[0].use, 18, 'a working 18 kW drill was billed at the 25% idle share');
});

test('R28 bug — the away clock runs the drills, and a long slice cannot overfill a pile', () => {
  const { stores } = base({ chest: false });          // no store: the pile is the only place it goes
  const { node, ore } = seam();
  const mining = createMining({ data: RESOURCES, ore, stores });
  mining.bindDrill({ id: 'd1', key: 'small_drill', name: 'Small Drill', x: 0, z: 0, powered: true }, node);
  mining.tick(100000);
  assert.ok(mining.drills[0].stock <= 200 + 1e-6, `one long step dug ${mining.drills[0].stock} into a 200 pile`);

  // and with a store beside it, an hour away really digs
  const b = base();
  const m2 = createMining({ data: RESOURCES, ore: seam().ore, stores: b.stores });
  m2.bindDrill({ id: 'd2', key: 'small_drill', name: 'Small Drill', x: 1, z: 0, powered: true }, seam().node);
  m2.autoRoute('d2', { quiet: true });
  let t = 0;
  const away = createAwayClock({ mining: m2, stores: b.stores, now: () => t });
  away.mark(0);
  t = 3600 * 1000;
  const back = away.resume();
  assert.ok(b.count('iron_ore') > 50, `an hour away dug ${b.count('iron_ore')} iron ore`);
  assert.ok(back.made.some(m => m.res === 'iron_ore'), 'the away card says so');
});

test('R28 bug — the next-step hint reads a field the drill rows actually carry', () => {
  const { stores } = base();
  const { node, ore } = seam();
  const mining = createMining({ data: RESOURCES, ore, stores });
  mining.bindDrill({ id: 'd1', key: 'small_drill', name: 'Small Drill', x: 1, z: 0, powered: true }, node);
  mining.autoRoute('d1', { quiet: true });
  const row = mining.overview()[0];
  const line = MAIN.split('\n').find(l => /^\s*hasRoute:/.test(l));
  assert.ok(line, 'main.js no longer computes hasRoute');
  const fields = [...line.matchAll(/\bd\.(\w+)/g)].map(m => m[1]);
  assert.ok(fields.length, line);
  for (const f of fields) assert.ok(f in row, `main.js reads d.${f}, which a mining.overview() row never has`);
  assert.ok(row.route, 'a routed drill');
});

test('R28 bug — the population reading takes the REAL housing register (houses is a function)', () => {
  const housing = createHousing({ data: COLONY });
  housing.rebuild([{ id: 'h1', key: 'bunkhouse', x: 0, z: 0 }], () => ({ home: { beds: 4, comfort: 0.2 } }));
  assert.equal(typeof housing.houses, 'function');
  const pop = population({ colony: { citizens: [] }, housing });
  assert.equal(pop.houses, 1);
  assert.equal(pop.open, true);
});

test('R28 dead data — a recipe\'s own `power` is drawn while it is the job', () => {
  const b = base({ grid: true });
  b.grid.add({ id: 'g', type: 'wind_turbine', x: 0, z: 0 });
  b.works.place({ id: 's1', type: 'smelter', x: 2, z: 0 });
  assert.equal(b.grid.get('s1').draw, 14);
  b.give('copper_ingot', 10);
  b.works.queue('s1', 'draw_wire', 5);
  b.works.tick(0.1);
  const recipe = REFINING.recipes.find(r => r.id === 'draw_wire');
  assert.equal(b.grid.get('s1').draw, 14 + recipe.power * REFINING.recipePowerShare, 'the recipe draw was read by nothing');
  assert.ok(REFINING.recipePowerShare > 0 && REFINING.recipePowerShare <= 1);
});

/**
 * THE BALANCE CHECK THE REVIEW ASKED FOR. Two of this round's fixes raise the load on every saved
 * base at once — a digging Drill is billed its full 18 kW instead of the 25% idle share, and a
 * recipe's own `power` is drawn. The base a player most plausibly saved — one Burner Generator, one
 * Drill, one Smelter on a job — has to keep running after the update, not start shedding the smelter.
 */
test('R28 balance — a saved one-generator base of a drill and a smelter still runs', () => {
  const b = base({ grid: true });
  b.give('coal', 200);
  b.grid.add({ id: 'g', type: 'burner_generator', x: 0, z: 0 });
  b.grid.add({ id: 'd1', type: 'drill', x: 2, z: 1, draw: 18, priority: 'extraction' });
  const { node, ore } = seam({ x: 2, z: 1 });
  const mining = createMining({ data: RESOURCES, ore, stores: b.stores, grid: b.grid });
  mining.bindDrill({ id: 'd1', key: 'drill', name: 'Drill', x: 2, z: 1, powered: true }, node);
  b.works.place({ id: 's1', type: 'smelter', x: 1, z: -1 });
  // the hungriest thing a smelter does
  const recipe = REFINING.recipes.filter(r => r.machine === 'smelter').sort((a, c) => (c.power || 0) - (a.power || 0))[0];
  for (const [k, n] of Object.entries(recipe.inputs || {})) b.give(k, n * 20);
  b.works.completed[recipe.unlock?.recipe] = recipe.unlock?.times || 0;
  assert.ok(b.works.queue('s1', recipe.id, 0).ok);
  for (let i = 0; i < 20; i++) { b.grid.tick(0.5); mining.tick(0.5); b.works.tick(0.5); }
  const net = b.grid.overview()[0];
  const want = 18 + 14 + (recipe.power || 0) * REFINING.recipePowerShare;
  assert.equal(net.gen, POWER.generators.burner_generator.gen);
  assert.ok(Math.abs(net.use - want) < 0.5, `the grid is asked for ${net.use} kW, expected ${want}`);
  assert.ok(net.satisfaction >= POWER.shedding.brownoutBelow, `a drill and a smelter on one generator now brown out (${net.satisfaction})`);
  assert.ok(!net.shed.length, `shed: ${net.shed.join(', ')}`);
});

// ============================================================================ 2. keep in stock

function furnaceWithOre(opts = {}) {
  const b = base(opts);
  b.works.place({ id: 'f1', type: 'furnace', x: 2, z: 0 });
  b.give('iron_ore', 60);
  b.give('copper_ore', 60);
  b.give('coal', 40);
  return b;
}

test('R28 keep — a keep order stops at the line and starts again below it', () => {
  const b = furnaceWithOre();
  const out = b.works.queue('f1', 'smelt_iron', 0, { keep: 3 });
  assert.ok(out.ok);
  b.works.catchUp(400);
  assert.equal(b.count('iron_ingot'), 3, 'it made more than it was asked to keep');
  const m = b.works.get('f1');
  assert.equal(m.state, 'stocked');
  assert.match(b.works.stateText(m), /Stocked — 3 Iron Ingot on hand, keeping 3/);
  assert.ok(POWER.machineStates.includes('stocked'), 'a new badge must be declared in data/power.json');

  // somebody takes two away: it starts again by itself
  b.stores.take(b.pool(), 'iron_ingot', 2);
  b.works.catchUp(400);
  assert.equal(b.count('iron_ingot'), 3);
});

test('R28 keep — two keep orders on one furnace take turns', () => {
  const b = furnaceWithOre();
  b.works.queue('f1', 'smelt_iron', 0, { keep: 2 });
  b.works.queue('f1', 'smelt_copper', 0, { keep: 2 });
  b.works.catchUp(600);
  assert.equal(b.count('iron_ingot'), 2);
  assert.equal(b.count('copper_ingot'), 2, 'the second keep order never got a turn');
  assert.equal(b.works.get('f1').state, 'stocked');
  // asking again for the same recipe moves the line instead of adding a row
  b.works.queue('f1', 'smelt_iron', 0, { keep: 4 });
  assert.equal(b.works.get('f1').queue.length, 2);
  b.works.catchUp(600);
  assert.equal(b.count('iron_ingot'), 4);
});

test('R28 keep — a stocked machine posts no new work order', () => {
  const b = furnaceWithOre({ labour: COLONY.labour });
  const board = new WorkBoard();
  b.works.queue('f1', 'smelt_iron', 0, { keep: 1 });
  b.give('iron_ingot', 5);                 // already over the line
  b.works.tick(0.1);
  assert.equal(b.works.get('f1').state, 'stocked');
  assert.equal(b.works.postLabour(board, { at: 0 }), 0, 'a stocked furnace asked for a worker');
  b.stores.take(b.pool(), 'iron_ingot', 5);
  b.works.tick(0.1);
  assert.notEqual(b.works.get('f1').state, 'stocked');
  assert.equal(b.works.postLabour(board, { at: 1 }), 1, 'below the line it asks again');
});

test('R28 keep — an order already up is LEFT up when the machine stands stocked', () => {
  // the review's catch: stock wobbles round the line every batch, and cancelling the work order
  // each time it touched the line would throw away the units a citizen had walked over to put in
  const b = furnaceWithOre({ labour: COLONY.labour });
  const board = new WorkBoard();
  b.works.queue('f1', 'smelt_iron', 0, { keep: 2 });
  b.works.tick(0.1);
  assert.equal(b.works.postLabour(board, { at: 0 }), 1);
  board.work(board.get('lab_f1'), { source: 'citizen', by: 'c1', units: 1 });
  b.give('iron_ingot', 5);
  b.works.tick(0.1);
  assert.equal(b.works.get('f1').state, 'stocked');
  b.works.postLabour(board, { at: 1 });
  const o = board.get('lab_f1');
  assert.ok(o && !o.cancelled, 'the half-done order was cancelled the moment the stock touched the line');
});

test('R28 keep — a supply route leaves the keep line behind', () => {
  const b = furnaceWithOre();
  b.stores.add({ id: 'far', type: 'storage_chest', x: 140, z: 0 });
  const logistics = createLogistics({ stores: b.stores, power: POWER, materials: RESOURCES.materials });
  logistics.setFloors((pool, res) => b.works.keepLine(pool, res));
  const far = b.stores.poolAt(140, 0);
  b.works.queue('f1', 'smelt_iron', 0, { keep: 30 });
  assert.equal(b.works.keepLine(b.pool().id, 'iron_ingot'), 30);
  assert.equal(b.works.keepLine(b.pool().id, 'copper_ingot'), 0);
  b.give('iron_ingot', 35);
  assert.ok(logistics.link(b.pool().id, far.id, { only: ['iron_ingot'], batch: 5 }).ok);
  logistics.tick(0.1);
  const sent = logistics.loads.reduce((n, l) => n + (l.res === 'iron_ingot' ? l.n : 0), 0);
  assert.equal(sent, 5, `the route shipped ${sent}; only what is over the furnace's keep line may go`);
  // and the screen shows both floors on the route's row
  const row = prodFor(b, { logistics }).links()[0];
  assert.deepEqual(row.held.map(x => [x.res, x.line]), [['iron_ingot', 30]]);
  // the filter can be changed after the route is laid
  assert.ok(logistics.setLink(row.id, { only: null, keep: 12 }).ok);
  assert.equal(logistics.links[0].only, null);
  assert.equal(logistics.links[0].keep, 12);
});

test('R28 keep — survives a save, and setKeep moves the line', () => {
  const b = furnaceWithOre();
  b.works.queue('f1', 'smelt_iron', 0, { keep: 7 });
  const json = JSON.parse(JSON.stringify(b.works.toJSON()));
  assert.equal(json.machines[0].queue[0].keep, 7);
  const b2 = base();
  b2.works.load(json);
  assert.equal(b2.works.get('f1').queue[0].keep, 7);
  assert.ok(b2.works.setKeep('f1', 0, 12));
  assert.equal(b2.works.get('f1').queue[0].keep, 12);
  assert.equal(b2.works.mainOutput(b2.works.recipes.smelt_iron), 'iron_ingot', 'slag is waste, not the point');
});

// ============================================================================ 3. the overview

function prodFor(b, extra = {}) {
  return createProduction({
    works: b.works, stores: b.stores, grid: b.grid, materials: RESOURCES.materials,
    refining: REFINING, nodeKinds: RESOURCES.nodeKinds, ...extra,
  });
}

test('R28 production — rated numbers per machine', () => {
  const b = furnaceWithOre();
  b.works.queue('f1', 'smelt_iron', 5);
  const p = prodFor(b);
  const r = p.rated(b.works.get('f1'));
  assert.equal(r.perMin, 60 / 16);
  assert.equal(r.makes.iron_ingot, 60 / 16);
  assert.equal(r.eats.iron_ore, 2 * 60 / 16);
  assert.match(p.ratedText(b.works.get('f1')), /^Makes 3\.8 iron ingot a minute from 7\.5 iron ore, while it runs\.$/);
  assert.doesNotMatch(p.ratedText(b.works.get('f1')), /slag/, 'waste is not what a machine is for');
});

test('R28 production — the meter counts what was MADE, not what the stores happened to hold', () => {
  const b = furnaceWithOre();
  b.works.queue('f1', 'smelt_iron', 0);
  const p = prodFor(b);
  for (let t = 0; t <= 60; t++) { p.sample(t); b.works.tick(1); }
  // you empty the crate of ingots into your pack mid-minute: not a production figure
  b.stores.take(b.pool(), 'iron_ingot', 99);
  p.sample(61);
  const row = p.flows().find(f => f.res === 'iron_ingot');
  assert.ok(row.made >= 2.5 && row.made <= 4.5, `made ${row.made}/min, rated 3.75 (whole batches of 16 s)`);
  assert.ok(row.trend <= 0, 'the stock trend shows the crate being emptied');
  const ore = p.flows().find(f => f.res === 'iron_ore');
  assert.ok(ore.used >= 5, `used ${ore.used} ore/min`);
});

test('R28 production — starved, traced upstream to the drill that has no power', () => {
  const b = base();
  b.works.place({ id: 'f1', type: 'furnace', x: 2, z: 0 });
  b.give('coal', 10);
  b.works.queue('f1', 'smelt_iron', 5);
  const { node, ore } = seam();
  const mining = createMining({ data: RESOURCES, ore, stores: b.stores });
  mining.bindDrill({ id: 'd1', key: 'drill', name: 'Drill', x: 1, z: 0, powered: false }, node);
  mining.autoRoute('d1', { quiet: true });
  b.works.tick(0.5);
  const p = prodFor(b, { mining });
  const d = p.diagnose('f1');
  assert.equal(d.word, 'starved');
  assert.ok(d.chain.some(l => /drill on iron ore has no power/.test(l)), d.chain.join(' | '));

  // and with no drill at all, it says where iron ore comes from
  const lone = base();
  lone.works.place({ id: 'f1', type: 'furnace', x: 2, z: 0 });
  lone.give('coal', 10);
  lone.works.queue('f1', 'smelt_iron', 5);
  lone.works.tick(0.5);
  const d2 = prodFor(lone).diagnose('f1');
  assert.match(d2.fix, /E on a seam, or put a drill on one/);
});

test('R28 production — two machines deep: the forge waits on a furnace that waits on ore', () => {
  const b = base({ grid: true });
  b.grid.add({ id: 'g', type: 'wind_turbine', x: 0, z: 0 });
  b.works.place({ id: 'f1', type: 'furnace', x: 2, z: 0 });
  b.give('coal', 10);
  b.works.queue('f1', 'smelt_iron', 5);
  // anything in refining.json that eats an iron ingot and is not the furnace itself
  const eater = REFINING.recipes.find(r => r.inputs?.iron_ingot && r.machine !== 'furnace' && !r.rareInput && !r.unlock);
  assert.ok(eater, 'no recipe eats iron ingot');
  b.works.place({ id: 'e1', type: eater.machine, x: 1, z: 1 });
  assert.ok(b.works.queue('e1', eater.id, 1).ok);
  for (const [k, n] of Object.entries(eater.inputs)) if (k !== 'iron_ingot') b.give(k, n * 3);
  b.grid.tick(1, { wind: 1 });
  b.works.tick(0.5);
  const d = prodFor(b).diagnose('e1');
  assert.equal(d.word, 'starved', b.works.stateText(b.works.get('e1')));
  assert.ok(d.chain.some(l => /The Furnace that makes it is stopped too: waiting for iron ore/i.test(l)), d.chain.join(' | '));
});

test('R28 production — blocked by the store-share line says so, not "the stores are full"', () => {
  const b = base();
  b.works.place({ id: 'm1', type: 'sawmill', x: 2, z: 0 });
  // a chest is 400: one raw material may fill a quarter (100), all raw ones half (200)
  b.give('log', 100);
  b.give('resin', 100);
  b.works.completed.saw_planks = 4;          // Press Resin is learned by sawing planks first
  assert.ok(b.works.queue('m1', 'tap_resin', 1).ok);
  b.works.catchUp(300);
  const m = b.works.get('m1');
  assert.equal(m.state, 'blocked', b.works.stateText(m));
  const d = prodFor(b).diagnose('m1');
  assert.ok(d.chain.some(l => /at most a quarter of a store/.test(l)), d.chain.join(' | '));

  // and when it really is full, it says that instead
  const f = base();
  f.works.place({ id: 'f1', type: 'furnace', x: 2, z: 0 });
  f.give('iron_ore', 20); f.give('coal', 20);
  f.works.queue('f1', 'smelt_iron', 3);
  f.works.tick(0.5);                          // the batch is loaded and burning
  f.give('plank', 10000);                     // …and then the chest is filled to the lid
  f.works.catchUp(100);
  assert.equal(f.works.get('f1').state, 'blocked');
  assert.ok(prodFor(f).diagnose('f1').chain.some(l => /stores here are full/.test(l)));
});

test('R28 production — alerts wait out a blip and say what to do', () => {
  const b = base();
  b.works.place({ id: 'f1', type: 'furnace', x: 2, z: 0 });
  b.works.queue('f1', 'smelt_iron', 3);
  b.works.tick(0.1);                                  // starved: no ore, no coal
  const p = prodFor(b);
  assert.equal(p.sample(0).length, 0, 'a machine stopped for one second is not an alert yet');
  assert.equal(p.sample(5).length, 0);
  const a = p.sample(20);
  assert.equal(a.length, 1);
  assert.equal(a[0].kind, 'machine');
  assert.match(a[0].text, /^Furnace: Waiting for Iron Ore/);
  assert.ok(a[0].fix.length > 10);
  assert.equal(p.summary().alerts, 1);

  // fixed: it goes away the next sample
  b.give('iron_ore', 10); b.give('coal', 5);
  b.works.tick(0.1);
  assert.equal(p.sample(21).length, 0);
});

test('R28 production — a nearly full store is an alert; storage rows carry join advice', () => {
  const b = base();
  b.stores.add({ id: 'far', type: 'storage_chest', x: 40, z: 0 });
  b.give('iron_ingot', 380);
  const p = prodFor(b);
  const a = p.sample(0);
  assert.ok(a.some(x => x.kind === 'store' && /95% full/.test(x.text)), a.map(x => x.text).join(' | '));
  const rows = p.storage();
  const home = rows.find(r => r.id === b.pool().id);
  assert.ok(home.join, 'two pools forty metres apart and no advice on joining them');
  assert.match(home.join.text, /relay mast/);
  assert.equal(home.top[0].res, 'iron_ingot');
});

test('R28 production — supply routes carry their filters, and power rows read the grid report', () => {
  const b = base({ grid: true });
  b.stores.add({ id: 'far', type: 'storage_chest', x: 120, z: 0 });
  const logistics = createLogistics({ stores: b.stores, power: POWER, materials: RESOURCES.materials });
  const farPool = b.stores.poolAt(120, 0);
  const made = logistics.link(farPool.id, b.pool().id, { only: ['iron_ore'], keep: 10 });
  assert.ok(made.ok, made.why);
  b.grid.add({ id: 'g', type: 'wind_turbine', x: 0, z: 0 });
  b.works.place({ id: 's1', type: 'smelter', x: 2, z: 0 });
  b.grid.tick(1, { wind: 1 });
  const p = prodFor(b, { logistics });
  const l = p.links()[0];
  assert.deepEqual(l.only, ['iron_ore']);
  assert.equal(l.keep, 10);
  const pw = p.power()[0];
  assert.equal(pw.gen, 26);
  assert.match(pw.text, /kW wanted of 26 kW made/);
});


test('R28 production — a store turning away what is arriving is the alert, at whatever weight', () => {
  // a chest of 400 holds at most 100 of one raw material; at 100 iron ore it is 25% full by weight
  // and refusing the drill's ore — "store at 90%" would never have said a word
  const b = base();
  const { node, ore } = seam({ x: 1, z: 0 });
  const mining = createMining({ data: RESOURCES, ore, stores: b.stores });
  mining.bindDrill({ id: 'd1', key: 'small_drill', name: 'Small Drill', x: 1, z: 0, powered: true }, node);
  mining.autoRoute('d1', { quiet: true });
  b.give('iron_ore', 100);
  const p = prodFor(b, { mining });
  const a = p.sample(0);
  const s = a.find(x => x.kind === 'store');
  assert.ok(s, a.map(x => x.text).join(' | ') || 'no alert at all');
  assert.match(s.text, /will take no more iron ore — at the line one material may fill/);
  assert.match(s.text, /25% full/);
  assert.equal(p.storage()[0].refusing[0].res, 'iron_ore');
});

test('R28 bug — a hand-cranked Small Drill does not read "power" while it digs', () => {
  const b = base();
  const { node, ore } = seam({ x: 1, z: 0 });
  const mining = createMining({ data: RESOURCES, ore, stores: b.stores });
  // no grid in the game ever sets `powered` on a Small Drill
  mining.bindDrill({ id: 'd1', key: 'small_drill', name: 'Small Drill', x: 1, z: 0, powered: false }, node);
  mining.autoRoute('d1', { quiet: true });
  mining.tick(1);
  assert.equal(mining.overview()[0].limit, 'digging');
});

test('R28 away — the drills dig in the logistics clock, BEFORE civics runs the people', () => {
  // two catch-up loops cover the same window; the first digs, the second must come after it
  for (const at of [...MAIN.matchAll(/const back = away\.resume\(\);/g)].map(m => m.index)) {
    const next = MAIN.indexOf('civics.away(', at);
    assert.ok(next > at && next - at < 3000, 'civics.away no longer follows away.resume()');
  }
  assert.ok(/works, mining, logistics, stores, grid/.test(MAIN), 'the away clock is not handed the drills');
  const CIVICS = readFileSync(join(here, '../js/civics.js'), 'utf8');
  assert.doesNotMatch(CIVICS, /mining\??\.tick/, 'civics.away digs the same hours a second time');
});

// ============================================================================ 4. the people side

/** A colony on the REAL housing register, with real catalogue rows — never a fake `houses` list. */
function holdingWith(list) {
  const STRUCT = read('../data/structures.json');
  const rows = Array.isArray(STRUCT) ? STRUCT : (STRUCT.structures || Object.values(STRUCT));
  const defOf = key => rows.find(r => r && (r.key === key || r.id === key)) || null;
  const board = new WorkBoard();
  const colony = createColony({ data: COLONY, board, seed: 3 });
  const civics = createCivics({ data: COLONY, colony, board, dayLengthSeconds: 900 });
  civics.rebuild(list, defOf);
  return { colony, civics, board, defOf };
}

test('R28 people — migration rolls on a real house without throwing', () => {
  const { colony } = holdingWith([{ id: 'h1', key: 'bunkhouse', x: 0, z: 0 }]);
  assert.equal(typeof colony.housing.houses, 'function');
  let offer = null;
  for (let i = 0; i < 200 && !offer; i++) offer = colony.rollMigration();
  assert.ok(offer, 'a bunkhouse with four spare beds never drew a migrant');
  // and with only a bedroll, nobody
  const bare = holdingWith([{ id: 'b1', key: 'bedroll', x: 0, z: 0 }]).colony;
  for (let i = 0; i < 50; i++) assert.equal(bare.rollMigration(), null);
});

test('R28 people — a guard can be posted and stood down, and it shows everywhere', () => {
  const { colony, civics } = holdingWith([
    { id: 'h1', key: 'bunkhouse', x: 0, z: 0 },
    { id: 'p1', key: 'watch_post', x: 10, z: 0 },
  ]);
  const c = colony.welcome(colony.newCitizen({ job: 'smelter' }));
  assert.equal(civics.posts.length, 1);
  const out = colony.postGuard(c.id, 'p1');
  assert.ok(out.ok, out.why);
  assert.equal(c.job, 'guard');
  assert.equal(c.posted, 'p1');
  assert.equal(colony.stationed(), 1, '"Standing a watch" is still 0');
  assert.ok(colony.wages() > 0, 'a posted guard costs nothing');
  assert.equal(civics.facts({}).posted, 1, 'the Armiger cannot see the watch');
  // back to the furnace: the old job comes back with them
  colony.standDown(c.id);
  assert.equal(c.posted, null);
  assert.equal(c.job, 'smelter');
  assert.equal(colony.wages(), 0);
  // a turret is not a post, and the refusal names what is
  assert.match(colony.postGuard(c.id, 'nope').why, /Watch Post/);
});

test('R28 people — the Command Rod posts a guard, and a work order stands them down', () => {
  const { colony } = holdingWith([
    { id: 'h1', key: 'bunkhouse', x: 0, z: 0 },
    { id: 'p1', key: 'watch_post', x: 10, z: 0 },
  ]);
  const c = colony.welcome(colony.newCitizen({ job: 'labourer' }));
  c.body = 'colony:0';
  const body = { id: 'colony:0', name: c.name, x: 0, z: 0, citizenId: c.id };
  const STRUCT = read('../data/structures.json');
  const rows = Array.isArray(STRUCT) ? STRUCT : (STRUCT.structures || Object.values(STRUCT));
  const build = {
    entries: [{ id: 'p1', key: 'watch_post', x: 10, z: 0 }],
    defOf: key => rows.find(r => r && (r.key === key || r.id === key)) || null,
  };
  const rod = createCommand({ colony, folk: { own: () => [body], sendTo: () => true }, build, works: null });
  rod.select(body);
  const out = rod.order(10, 0);
  assert.equal(out.kind, 'guard');
  assert.equal(c.posted, 'p1', 'the guard order walked them there and posted nobody');
  rod.select(body);
  rod.order(-30, 0);                               // bare ground: off the watch
  assert.equal(c.posted, null);
  assert.equal(c.job, 'labourer');
});

test('R28 people — the purse, the Gambler, and the work board are wired to something', () => {
  // the tax button empties the purse the daily tax fills; it does not raise a fresh day's tax
  const tax = MAIN.slice(MAIN.indexOf('      tax: () => {'), MAIN.indexOf('      tax: () => {') + 600);
  assert.doesNotMatch(tax, /collectTax/, 'the button raises another day of tax on every click');
  assert.match(tax, /colony\.gold -= purse/);
  // civics.addSpend: the Gambler's `spent: 1000` had nothing counting towards it
  assert.ok((MAIN.match(/civics\.addSpend\(/g) || []).length >= 2, 'shop purchases and recruiting do not count as spending');
  // the work board hands in an ORDER id; nothing may bind a citizen to it as a station
  const assign = MAIN.slice(MAIN.indexOf('      assign: id => {'), MAIN.indexOf('      assign: id => {') + 1600);
  assert.match(assign, /board\.get\?\.\(id\)/);
  assert.doesNotMatch(assign, /stationId: id\b/);
  // migrant offers carry their person in `citizen`
  assert.doesNotMatch(MAIN, /offers: \(colony\.pending \|\| \[\]\)\.map\(o => \(\{ id: o\.id, name: o\.name, job: o\.job \}\)\)/);
});

test('R28 dead code — the functions nothing called are gone, not just unused', () => {
  const src = f => readFileSync(join(here, '../js/' + f), 'utf8');
  assert.doesNotMatch(src('work.js'), /openTagged\(|static fromJSON/);
  assert.doesNotMatch(src('colony.js'), /stationsOf\(/);
  assert.doesNotMatch(src('command.js'), /lastOrder/);
  assert.doesNotMatch(src('outposts.js'), /export function outpostLines/);
  assert.doesNotMatch(src('civics.js'), /createHold\(\{[^}]*tradePost/, 'the Trade Post vault nothing ever filled is back');
  // and the ones that were wired instead
  assert.match(src('command.js'), /postGuard/);
  assert.match(MAIN, /createProduction\(/);
  assert.match(MAIN, /holding\.setProduction/);
  assert.match(MAIN, /buildUI\.station\.production = production/);
});
