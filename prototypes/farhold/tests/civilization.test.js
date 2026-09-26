// node --test prototypes/farhold/tests/civilization.test.js
//
// THE CIVILIZATION EXPANSION — houses, workers, vendors, trade goods, guards and the muster.
//
// The one test in here that matters more than the rest is the first one:
//
//   **a furnace with full inputs, fuel and NOBODY WORKING IT makes nothing, and its inputs are
//   untouched.**
//
// That is the user's own sentence made mechanical — *"you can have ore sent to a town and have an
// NPC run the furnace to smelt it automatically, consuming work"* — and it is only true if the
// machine genuinely refuses. A gate that half-works (a machine that runs slower without a worker,
// say) would have been indistinguishable from a balance number and nobody would ever have noticed
// it was not wired.
//
// The second most important one is `every input of every trade good is a material the game actually
// produces`, which is tests/round13.test.js's rule — *"a cost you cannot obtain is not a price, it
// is a wall"* — applied to twenty-two new recipes from the other side.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createStoreNetwork } from '../js/stores.js';
import { createGrid } from '../js/power.js';
import { createWorks } from '../js/refine.js';
import { createColony } from '../js/colony.js';
import { createHousing } from '../js/housing.js';
import { createHold } from '../js/hold.js';
import { createVendors } from '../js/vendors.js';
import { createTrade, installTradeGoods, TRADE_TAGS } from '../js/trade.js';
import { createMuster } from '../js/muster.js';
import { createFarm } from '../js/farm.js';
import { WorkBoard } from '../js/work.js';
import { raidOffer, acceptRaid, beginRaid, loseRaid, raidRewards, clearWave } from '../js/raid.js';
import { guardContract } from '../js/hire.js';
import { ambushChanceFor } from '../js/caravans.js';
import { realCost } from '../js/buildplan.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const COLONY = read('../data/colony.json');
const RES = read('../data/resources.json');
const REF = read('../data/refining.json');
const POW = read('../data/power.json');
const STR = read('../data/structures.json');
const RAIDS = read('../data/raids.json');
const GOODS = read('../data/tradegoods.json');
const CROPS = read('../data/crops.json');

const BY_ID = Object.fromEntries(STR.structures.map(s => [s.id, s]));

/** A pool with a crate in it and a machine standing beside it. Everything §3 argues about. */
function bench({ type = 'furnace', labour = COLONY.labour, fill = {} } = {}) {
  const stores = createStoreNetwork({ power: POW, materials: RES.materials });
  /**
   * R17 — A STORAGE CHEST, because a Storage Box is six slots now.
   *
   * `storage_crate` is what the player reads as a Storage Box: the first store in the game, six
   * slots, no metal in it. Its cap is 120 and js/stores.js will only let one raw material take a
   * quarter of that, so a crate no longer holds the forty ore these tests pour into it — and every
   * one of them is about the LABOUR maths, not about how big a box is. `storage_chest` is the old
   * crate's capacity at the old crate's price, so the scenery is the size it always was.
   */
  stores.add({ id: 'crate', type: 'storage_chest', x: 0, z: 0 });
  const works = createWorks({ refining: REF, resources: RES, stores, labour });
  works.place({ id: 'm1', type, x: 1, z: 0 });
  for (const [res, n] of Object.entries(fill)) stores.put(stores.poolAt(0, 0), res, n);
  return { stores, works, machine: works.get('m1'), pool: () => stores.poolAt(0, 0) };
}

// ==================================================================== §3 work runs the machines

test('THE ONE THAT MATTERS — a furnace nobody is working makes nothing, and its ore is untouched', () => {
  const { stores, works, pool } = bench({ fill: { iron_ore: 40, coal: 20 } });
  works.queue('m1', 'smelt_iron', 10);
  const oreBefore = stores.count(pool(), 'iron_ore');

  works.catchUp(600);

  assert.equal(works.get('m1').made, 0, 'a furnace with nobody at it smelted something');
  assert.equal(works.get('m1').state, 'unworked');
  assert.equal(stores.count(pool(), 'iron_ore'), oreBefore,
    'the furnace ate ore it was never allowed to work — labour must be checked BEFORE the inputs are taken');
  assert.match(works.stateText(works.get('m1')), /^Standing cold — nobody is working this/);
});

test('…and ten units of work is five minutes of furnace, which is eighteen ingots', () => {
  const { stores, works, pool } = bench({ fill: { iron_ore: 200, coal: 60 } });
  works.queue('m1', 'smelt_iron', 0);
  /**
   * The design wrote this as one `credit(10)`, and the code is right and the design was wrong:
   * `bankSeconds: 120` — which the SAME section sets — caps a furnace at four minutes of paid-for
   * work, so ten units handed over at once would lose six of them. That cap is the point (a furnace
   * cannot be wound up for a week and left), so the units arrive the way the board actually
   * delivers them: four at a time, which is one order and two minutes of furnace.
   */
  let paid = 0;
  while (paid < 10) {
    const units = Math.min(4, 10 - paid);
    works.credit('m1', units);
    paid += units;
    works.catchUp(units * 30);
  }
  const made = works.get('m1').made;
  assert.ok(made === 18 || made === 19, `ten units bought ${made} batches, expected 18 or 19`);
  works.catchUp(120);
  assert.equal(works.get('m1').state, 'unworked', 'the furnace should be cold again once the bank runs out');
  assert.ok(stores.count(pool(), 'iron_ingot') >= 18);
});

test('the bank cannot be wound up for a week', () => {
  const { works } = bench({ fill: { iron_ore: 200, coal: 60 } });
  works.queue('m1', 'smelt_iron', 0);
  works.credit('m1', 500);
  assert.equal(works.get('m1').workBank, COLONY.labour.bankSeconds,
    'a furnace charged with five hundred units would run unattended for four hours');
});

test('a sawmill on the grid needs nobody; the same sawmill with no wire needs a pair of hands', () => {
  const stores = createStoreNetwork({ power: POW, materials: RES.materials });
  stores.add({ id: 'crate', type: 'storage_crate', x: 0, z: 0 });
  const grid = createGrid({ power: POW, stores });
  const works = createWorks({ refining: REF, resources: RES, stores, grid, labour: COLONY.labour });
  works.place({ id: 'saw', type: 'sawmill', x: 1, z: 0 });
  stores.put(stores.poolAt(0, 0), 'log', 200);

  // no generator anywhere: auto: true does not save it
  assert.ok(works.labourNeed(works.get('saw')) > 0, 'an unwired sawmill should want a worker');

  // …and a generator that reaches it does
  grid.add({ id: 'gen', type: 'burner_generator', x: 2, z: 0, name: 'Burner' });
  stores.put(stores.poolAt(0, 0), 'coal', 200);
  grid.tick(2, { daylight: 1, wind: 1 });
  assert.equal(works.labourNeed(works.get('saw')), 0,
    'a sawmill the grid is carrying pays its own labour — that is the whole promotion INDUSTRY.md §1 makes of the drill');
});

test('a tier-2 machine is unaffected by any of this', () => {
  const { works } = bench({ type: 'refinery' });
  assert.equal(works.labourNeed(works.get('m1')), 0, 'power is the whole cost of a refinery and always was');
});

test('the module behaves exactly as it always did until somebody passes the labour knobs', () => {
  const { stores, works, pool } = bench({ labour: null, fill: { iron_ore: 40, coal: 20 } });
  works.queue('m1', 'smelt_iron', 10);
  works.catchUp(600);
  assert.ok(works.get('m1').made > 0,
    'a caller that has not wired the colony must get the module it has always had — otherwise every old save path silently stops smelting');
});

test('a citizen bound to a furnace fills its orders all day, and the ledger names her', () => {
  const { stores, works, pool } = bench({ fill: { iron_ore: 400, coal: 200 } });
  works.queue('m1', 'smelt_iron', 0);
  const board = new WorkBoard();
  const colony = createColony({ data: COLONY, board, seed: 4, stationAt: () => ({ x: 1, z: 0 }) });
  colony.setBase({ beds: 1, structures: 6 });
  const marwen = colony.welcome(colony.newCitizen({ name: 'Marwen Thorn', job: 'smelter', skill: 1 }));
  colony.bind(marwen.id, 'm1');
  colony.setClock(6);

  let credited = 0;
  for (let i = 0; i < 96; i++) {
    works.postLabour(board, { at: i });
    colony.tick(0.25);
    credited += works.collectLabour(board);
    works.catchUp(9.4);          // a quarter of a game hour at 900 s a day
  }

  assert.ok(credited >= 8 && credited <= 13, `a content smelter put ${credited} units in over a day, expected about 10.6`);
  assert.ok(works.get('m1').made > 0, 'she worked all day and the furnace made nothing');
  const any = board.finished.find(o => o.meta?.machine === 'm1');
  assert.ok(any, 'no labour order was ever posted');
  assert.equal(any.ledger.player, 0);
  assert.equal(any.ledger.machine, 0);
  assert.ok(any.ledger.citizen > 0, 'the work must be credited to the citizen and to nobody else');
});

test('a smelter may mind three machines and not a fourth, and the refusal names her', () => {
  const colony = createColony({ data: COLONY, seed: 2 });
  colony.setBase({ beds: 1 });
  const c = colony.welcome(colony.newCitizen({ name: 'Marwen Thorn', job: 'smelter' }));
  for (const id of ['f1', 'f2', 'f3']) assert.equal(colony.bind(c.id, id).ok, true);
  const no = colony.bind(c.id, 'f4');
  assert.equal(no.ok, false);
  assert.match(no.why, /Marwen Thorn already minds/);
  // a guard stands a post; that is not their work
  const g = colony.welcome(colony.newCitizen({ name: 'Rook', job: 'guard' }));
  assert.equal(colony.bind(g.id, 'f1').ok, false);
});

test('every machine that wants tending names a real number, and every tier-2 one wants nobody', () => {
  for (const [key, def] of Object.entries(REF.machines)) {
    if (!def.labour) continue;
    assert.ok(def.labour.secondsPerUnit > 0, `${key} has a labour block that asks for nothing`);
    assert.ok(typeof def.labour.auto === 'boolean', `${key}'s labour block does not say whether power covers it`);
    assert.ok((def.tier ?? 0) <= 1, `${key} is tier ${def.tier} and should not want a person`);
  }
});

// ==================================================================== §2 housing

/** A village: four entries, a catalogue lookup, and nothing else. */
function village(list) {
  const defOf = key => BY_ID[key] || null;
  const housing = createHousing({ data: COLONY });
  housing.rebuild(list, defOf);
  return housing;
}

test('comfort is the house plus one point per DISTINCT utility kind, and four privies is one privy', () => {
  const h = village([
    { id: 'h1', key: 'cottage', name: 'Cottage', x: 0, z: 0 },
    { id: 'u1', key: 'well_head', name: 'Well Head', x: 6, z: 0 },
    { id: 'u2', key: 'hearth', name: 'Common Hearth', x: 4, z: 4 },
    { id: 'u3', key: 'privy', name: 'Privy', x: 0, z: 6 },
  ]);
  // 0.35 + 0.20 + 0.15 + 0.10
  assert.equal(h.comfortOf('h1'), 0.8);

  const spam = village([
    { id: 'h1', key: 'cottage', name: 'Cottage', x: 0, z: 0 },
    { id: 'p1', key: 'privy', name: 'Privy', x: 2, z: 0 },
    { id: 'p2', key: 'privy', name: 'Privy', x: 3, z: 0 },
    { id: 'p3', key: 'privy', name: 'Privy', x: 4, z: 0 },
    { id: 'p4', key: 'privy', name: 'Privy', x: 5, z: 0 },
  ]);
  assert.equal(spam.comfortOf('h1'), 0.45, 'four privies scored four times');
});

test('a bedroll on open ground is comfort zero, and a utility out of range reaches nothing', () => {
  const h = village([
    { id: 'b1', key: 'bedroll', name: 'Bedroll', x: 0, z: 0 },
    { id: 'u1', key: 'well_head', name: 'Well Head', x: 300, z: 0 },
  ]);
  assert.equal(h.comfortOf('b1'), 0);
  assert.equal(h.report().beds, 1);
});

test('a wash house with no well within reach is a shed, and says which kind is missing', () => {
  const dry = village([
    { id: 'h1', key: 'cottage', name: 'Cottage', x: 0, z: 0 },
    { id: 'w1', key: 'wash_house', name: 'Wash House', x: 4, z: 0 },
  ]);
  assert.equal(dry.comfortOf('h1'), 0.35, 'a wash house with no water scored anyway');
  assert.match(dry.report().dark[0].why, /water/);

  const wet = village([
    { id: 'h1', key: 'cottage', name: 'Cottage', x: 0, z: 0 },
    { id: 'w1', key: 'wash_house', name: 'Wash House', x: 4, z: 0 },
    { id: 'u1', key: 'well_head', name: 'Well Head', x: 8, z: 0 },
  ]);
  assert.equal(wet.comfortOf('h1'), 0.69);
});

test('every house in the catalogue has beds and a cost the game can actually produce', () => {
  const houses = STR.structures.filter(s => s.home);
  assert.ok(houses.length >= 6, 'the housing catalogue is short');
  for (const h of houses) {
    assert.ok(h.home.beds > 0, `${h.id} is a house with no beds`);
    assert.ok(h.home.comfort >= 0 && h.home.comfort <= 1, `${h.id}'s comfort is not 0..1`);
    for (const id of Object.keys(realCost(h.cost || {}))) {
      assert.ok(RES.materials[id], `${h.id} costs ${id}, which is not a material`);
    }
  }
  for (const u of STR.structures.filter(s => s.utility)) {
    assert.ok(u.utility.kind && u.utility.radius > 0, `${u.id} is a utility that serves nothing`);
    assert.ok(COLONY.comfort.utilityKinds[u.utility.kind], `${u.id}'s kind "${u.utility.kind}" has no words`);
  }
});

test('a citizen takes the nearest free bed to their station, and the walk is a real number of metres', () => {
  const housing = village([
    { id: 'near', key: 'bunkhouse', name: 'Bunkhouse', x: 90, z: 0 },
    { id: 'far', key: 'manor', name: 'Manor', x: -1200, z: 0 },
  ]);
  const colony = createColony({
    data: COLONY, seed: 9, housing,
    stationAt: () => ({ x: 0, z: 0 }),
  });
  const c = colony.welcome(colony.newCitizen({ job: 'smelter' }));
  colony.bind(c.id, 'furnace');
  colony._assignBeds();
  assert.equal(c.home.entryId, 'near', 'she walked past the bunkhouse to sleep in the manor');
  // 90 m at 3000 m an hour
  assert.equal(Math.round(colony.travelHoursOf(c) * 1000) / 1000, 0.03);

  // …and the cap holds for somebody housed six kilometres from their work
  const other = colony.welcome(colony.newCitizen({ job: 'smelter' }));
  colony.bind(other.id, 'furnace');
  colony._assignBeds();
  assert.equal(other.home.entryId, 'near');
  colony.housing.release(other.id);
  other.home = { bedId: 'x', entryId: 'far', x: -12000, z: 0, comfort: 0.6 };
  assert.equal(colony.travelHoursOf(other), COLONY.schedule.maxTravelHours);
});

test('setBase({ beds }) still behaves for every test written before this round', () => {
  const colony = createColony({ data: COLONY, seed: 1 });
  colony.setBase({ beds: 2 });
  colony.welcome(colony.newCitizen({ job: 'labourer' }));
  colony.welcome(colony.newCitizen({ job: 'labourer' }));
  colony.welcome(colony.newCitizen({ job: 'labourer' }));
  assert.equal(colony.housed(), 2);
  assert.equal(colony.spareBeds(), 0);
  assert.equal(colony.travelHoursOf(colony.citizens[0]), COLONY.schedule.travelHoursDefault);
});

// ==================================================================== §6 trade goods and the hold

test('THE SECOND ONE THAT MATTERS — every input of every trade good is something the game produces', () => {
  const produced = new Set();
  for (const r of REF.recipes) for (const k of Object.keys(r.outputs || {})) produced.add(k);
  for (const kind of Object.values(RES.nodeKinds)) for (const k of Object.keys(kind.resources || {})) produced.add(k);
  const stuck = [];
  for (const g of GOODS.goods) {
    for (const input of Object.keys(g.inputs || {})) if (!produced.has(input)) stuck.push(`${g.id} needs ${input}`);
  }
  assert.deepEqual(stuck, [], 'a good you cannot make is not a good, it is a wall:\n  ' + stuck.join('\n  '));
});

test('every good is weighed, priced, tagged and made somewhere that exists', () => {
  for (const g of GOODS.goods) {
    assert.ok(g.weight > 0 && g.base > 0 && g.time > 0, `${g.id} is missing a number`);
    assert.ok((g.tags || []).length >= 1, `${g.id} has no tags, so no town can want it`);
    for (const t of g.tags) assert.ok(TRADE_TAGS.includes(t), `${g.id} is tagged "${t}", which is not one of the eight`);
    assert.ok(REF.machines[g.machine], `${g.id} is made on a ${g.machine}, which is not a machine`);
    assert.ok(BY_ID[g.machine], `${g.machine} is a machine with no structure to build — see BUILD-MODE.md §14`);
  }
  // readable enough to shop by: nothing cheap is enormous and nothing dear is a boulder
  for (const g of GOODS.goods) {
    if (g.base < 30) assert.ok(g.weight <= 20, `${g.id} is cheap and enormous`);
    if (g.base > 200) assert.ok(g.weight <= 12, `${g.id} is dear and a boulder`);
  }
});

test('installTradeGoods injects and is safe to run twice', () => {
  const res = JSON.parse(JSON.stringify(RES));
  const ref = JSON.parse(JSON.stringify(REF));
  const before = ref.recipes.length;
  const first = installTradeGoods(res, ref, GOODS);
  assert.equal(first.recipes, GOODS.goods.length);
  assert.equal(ref.recipes.length, before + GOODS.goods.length);
  const second = installTradeGoods(res, ref, GOODS);
  assert.equal(second.recipes, 0, 'the second call duplicated every recipe');
  assert.equal(ref.recipes.length, before + GOODS.goods.length);
  assert.equal(res.materials.ingot_bundle.kind, 'trade',
    'a trade good must not read as a raw material, or the store-share caps will treat it as ore');
  // …and the real file on disk is untouched, which is the items.json rule
  assert.equal(RES.materials.ingot_bundle, undefined);
});

test('the hold is the one capped container, and going over it is impossible rather than slow', () => {
  const hold = createHold({ goods: GOODS.goods, capacity: 40 });
  assert.equal(hold.put('ingot_bundle', 7), 2, '14 kg each into 40 kg is two, and the third must not go in');
  assert.ok(hold.load() <= 40);
  assert.equal(hold.put('ingot_bundle', 0), 0);
  assert.equal(hold.take('ingot_bundle', 99), 2);
  assert.equal(hold.count('ingot_bundle'), 0);
  assert.equal(hold.take('ingot_bundle', 1), 0, 'take went negative');

  const post = createHold({ goods: GOODS.goods, capacity: 2000 });
  hold.put('bolt_cloth', 13);
  const moved = hold.moveTo(post, 'bolt_cloth', 13);
  assert.equal(moved.moved, 13);
  assert.equal(post.count('bolt_cloth'), 13);
});

// ==================================================================== §7 trade routes

const IRONMOOR = { id: 'ironmoor', name: 'Ironmoor', x: 0, z: 0, size: 3, race: 'dwarf', biome: 'hills', market: true, plots: ['forge', 'mill'] };
const GREENHOLLOW = { id: 'greenhollow', name: 'Greenhollow', x: 4200, z: 0, size: 2, race: 'human', biome: 'grassland', market: true, plots: ['granary', 'loom'] };

function trade() { return createTrade({ goods: GOODS.goods, data: COLONY, seed: 7 }); }

test('a place never both needs and makes the same tag', () => {
  const t = trade();
  for (const place of [IRONMOOR, GREENHOLLOW, { id: 'x', name: 'X', size: 5, race: 'elf', biome: 'desert', market: true }]) {
    const p = t.profileFor(place);
    for (const tag of p.needs) assert.ok(!p.makes.includes(tag), `${place.name} both needs and makes ${tag}`);
    assert.ok(p.needs.length <= COLONY.trade.maxNeeds, `${place.name} wants everything`);
  }
});

test('a price never leaves the clamp, over ten thousand place-good-day triples', () => {
  const t = trade();
  const [lo, hi] = COLONY.trade.clamp;
  const places = [IRONMOOR, GREENHOLLOW,
    { id: 'a', name: 'A', size: 5, race: 'elf', biome: 'tundra', market: true },
    { id: 'b', name: 'B', size: 0, race: 'orc', biome: 'volcanic', market: true },
    { id: 'c', name: 'C', size: 2, race: 'halfling', biome: 'marsh', market: true }];
  let n = 0;
  for (const p of places) {
    for (const g of GOODS.goods) {
      for (let day = 1; day <= 91; day++) {
        const m = t.multiplierAt(g.id, p, day);
        assert.ok(m >= lo - 1e-9 && m <= hi + 1e-9, `${g.id} at ${p.name} on day ${day} read ${m}`);
        n++;
      }
    }
  }
  assert.ok(n >= 10000, `only checked ${n} triples`);
});

test('THE WORKED EXAMPLE IS A TEST — Ironmoor to Greenhollow and back pays what the design says', () => {
  const t = trade();
  // out: ingots, which Ironmoor makes and Greenhollow needs
  const out = t.quote({ good: 'ingot_bundle', from: IRONMOOR, to: GREENHOLLOW, n: 11, day: 1 });
  // back: cloth, which Greenhollow makes and Ironmoor needs
  const back = t.quote({ good: 'bolt_cloth', from: GREENHOLLOW, to: IRONMOOR, n: 53, day: 1 });
  assert.ok(out.each > 0, `ingots into Greenhollow lost ${-out.each} a bundle`);
  assert.ok(back.each > 0, `cloth into Ironmoor lost ${-back.each} a bolt`);
  const round = out.gross + back.gross - 24;
  assert.ok(round > 1200 && round < 4000,
    `a hand-cart round trip came to ${round} gold — the design's figure is about 2 585, and a number far off it means the model or the goods have drifted`);
});

test('the road is the payoff: hours are metres over speed over the road bonus', () => {
  const t = trade();
  for (const key of ['porter', 'hand_cart', 'pack_mule', 'covered_wagon']) {
    const c = t.carrierOf(key);
    for (const share of [0, 0.5, 1]) {
      const want = 4200 / (c.speed * (1 + COLONY.trade.roadBonus * share)) / 3600;
      assert.ok(Math.abs(t.hoursFor(4200, key, share) - want) < 1e-9, `${key} at road ${share}`);
    }
  }
  // a fully made road is worth about a third off the trip
  const bare = t.hoursFor(4200, 'hand_cart', 0);
  const paved = t.hoursFor(4200, 'hand_cart', 1);
  assert.ok(paved < bare * 0.65 && paved > bare * 0.6);
});

test('a cart refuses a load it cannot carry, and guards come off the risk monotonically', () => {
  const t = trade();
  const over = t.plan({ from: IRONMOOR, to: GREENHOLLOW, carrier: 'hand_cart', manifest: { ingot_bundle: 40 } });
  assert.equal(over.ok, false);
  assert.match(over.why, /hand cart carries 160/);

  let last = 1;
  for (const g of [0, 1, 2, 3, 4]) {
    const r = t.ambushChance({ danger: 0.9, guards: g });
    assert.ok(r <= last, 'a guard made the road more dangerous');
    last = r;
  }
  assert.equal(t.plan({ from: IRONMOOR, to: GREENHOLLOW, carrier: 'hand_cart', manifest: { bolt_cloth: 10 }, guards: 9 }).guards, 2,
    'guardsMax was not respected');
});

test('an arrived route pays exactly what the quote said; a robbed one pays nothing', () => {
  const t = trade();
  const plan = t.plan({ from: IRONMOOR, to: GREENHOLLOW, carrier: 'hand_cart', manifest: { ingot_bundle: 11 }, metres: 4200, roadShare: 0.86 });
  const good = t.open(plan, { rng: () => 1 });          // never robbed
  t.tick(plan.seconds + 1, {});
  const paid = t.collect(good.route.id);
  assert.equal(paid.gold, plan.revenue);

  const bad = t.open(plan, { rng: () => 0 });            // always robbed, and no guards to stop it
  t.tick(plan.seconds + 1, { rng: () => 1 });
  const lost = t.collect(bad.route.id);
  assert.equal(lost.gold, 0);
  assert.equal(lost.lost, true);
});

test('a standing route stops itself and names the good when the far end stops paying', () => {
  const t = trade();
  const flat = { ...GREENHOLLOW, market: false };
  const r = { repeat: true, carrier: 'porter', manifest: { ingot_bundle: 2 }, guards: 0, metres: 400, roadShare: 0 };
  const out = t.restand(r, { from: IRONMOOR, to: flat, take: null, gold: 1000 });
  // a hamlet with no market pays base less 12%, which cannot cover Ironmoor's asking price plus upkeep
  if (!out.ok) {
    assert.equal(out.stopped, true);
    assert.match(out.why, /no longer covers the trip|The cart is empty/);
  }
});

// ==================================================================== §5 vendors

function holdingFacts({ keys = [], citizens = 0, comfort = 0.8, spare = 1, made = () => 999, plots = 0, posted = 0, turnover = 0, spent = 0, day = 1 } = {}) {
  return {
    day, rng: () => 0.5,
    keys: new Set(keys), citizens, plots, posted, turnover, spent, made,
    nameOf: k => String(k).replace(/_/g, ' '),
    housing: { report: () => ({ spare, best: spare ? { comfort, house: 'Cottage' } : null }) },
  };
}

test('every vendor asks for something that exists, and is blocked by name when it is missing', () => {
  const v = createVendors({ data: COLONY });
  for (const row of COLONY.vendors) {
    for (const key of row.needs?.structure || []) {
      assert.ok(BY_ID[key] || REF.machines[key], `${row.id} waits for "${key}", which is not a structure or a machine`);
    }
    for (const res of Object.keys(row.needs?.made || {})) {
      assert.ok(RES.materials[res], `${row.id} waits for "${res}", which is not a material`);
    }
    assert.ok(row.wants >= 0 && row.wants <= 1, `${row.id}'s comfort floor is not 0..1`);
  }
  const out = v.check(holdingFacts({ citizens: 0 }));
  assert.equal(out.offer, null);
  assert.ok(out.blocked.some(b => /people in it/.test(b.why)), 'the quartermaster did not say what was short');
});

test('a vendor never moves in without a bed good enough for them, and the refusal is the housing lesson', () => {
  const v = createVendors({ data: COLONY });
  const noBed = v.check(holdingFacts({ citizens: 4, spare: 0 }));
  assert.equal(noBed.offer, null);
  assert.ok(noBed.blocked.some(b => /not a spare bed/.test(b.why)));

  const rough = v.check(holdingFacts({ citizens: 4, comfort: 0, keys: ['furnace'] }));
  const warden = rough.blocked.find(b => b.id === 'forge_warden');
  assert.match(warden.why, /would set up here, but/);
  assert.match(warden.why, /well and a hearth|roof/);
});

test('an accepted vendor takes a bed, pays rent and puts nothing at all on the work board', () => {
  const board = new WorkBoard();
  const colony = createColony({ data: COLONY, board, seed: 3 });
  colony.setBase({ beds: 2, structures: 20 });
  const v = createVendors({ data: COLONY });
  const out = v.check(holdingFacts({ citizens: 2, spare: 2 }));
  assert.ok(out.offer, 'nobody wanted to move in to a place with two people and two spare beds');
  const taken = v.accept(out.offer.id, { colony });
  assert.equal(taken.ok, true);
  assert.equal(colony.citizens.length, 1);
  assert.equal(colony.rent(), COLONY.vendorJob.rentPerDay);

  board.postJob({ id: 'o1', tag: 'refine', stationId: 'm1', units: 40 });
  colony.setClock(6);
  colony.tick(12);
  assert.equal(board.get('o1').done, 0, 'a trader quietly started smelting — see the guard in colony._doWork');
});

test('a vendor is never in `jobs`, so nobody can walk in off the road selling swords', () => {
  assert.ok(!COLONY.jobs.some(j => j.key === 'vendor'),
    'a vendor in jobs[] would be rolled as a migrant, and every job test asserts a positive rate and non-empty tags');
  assert.equal(COLONY.vendorJob.unitsPerHour, 0);
});

// ==================================================================== §8 guards

test('a posted guard is worth a point of defence, and one who has downed tools is not', () => {
  const colony = createColony({ data: COLONY, seed: 5 });
  colony.setBase({ beds: 2, structures: 20 });
  colony.setPosts([{ id: 'p1', name: 'Watch Post', slots: 2, x: 0, z: 0 }]);
  const a = colony.welcome(colony.newCitizen({ name: 'Rook', job: 'guard' }));
  const b = colony.welcome(colony.newCitizen({ name: 'Sev', job: 'guard' }));
  assert.equal(colony.station(a.id, 'p1').ok, true);
  assert.equal(colony.station(b.id, 'p1').ok, true);
  assert.equal(colony.stationed(), 2);

  const c = colony.welcome(colony.newCitizen({ name: 'Tam', job: 'guard' }));
  const full = colony.station(c.id, 'p1');
  assert.equal(full.ok, false);
  assert.match(full.why, /Every slot in that watch post is taken/);

  a.hunger = 0.9; a.rung = 'downsTools';
  assert.equal(colony.stationed(), 1, 'somebody who has downed tools is not on the wall');
});

test('a guard who minds a furnace cannot also stand a post, and each refusal is a sentence', () => {
  const colony = createColony({ data: COLONY, seed: 6 });
  colony.setBase({ beds: 1 });
  colony.setPosts([{ id: 'p1', name: 'Watch Post', slots: 1 }]);
  const c = colony.welcome(colony.newCitizen({ name: 'Marwen', job: 'labourer' }));
  const wrongJob = colony.station(c.id, 'p1');
  assert.equal(wrongJob.ok, false);
  assert.match(wrongJob.why, /Put them on guard duty first/);

  colony.assign(c.id, { job: 'guard' });
  c.stationId = 'furnace1';
  const busy = colony.station(c.id, 'p1');
  assert.equal(busy.ok, false);
  assert.match(busy.why, /Somebody has to/);
});

test('wages leave the purse and rent comes in, in the same pass, and the line says so', () => {
  const colony = createColony({ data: COLONY, seed: 8 });
  colony.setBase({ beds: 4, structures: 20 });
  colony.setPosts([{ id: 'p1', name: 'Watch Post', slots: 2 }]);
  const g = colony.welcome(colony.newCitizen({ job: 'guard' }));
  colony.station(g.id, 'p1');
  const v = colony.welcome(colony.newCitizen({ job: 'vendor' }));
  v.job = 'vendor';
  colony._assignBeds();

  const day = colony.collectTax();
  assert.equal(day.wages, COLONY.guard.wagePerDay);
  assert.ok(day.rent >= COLONY.vendorJob.rentPerDay, 'a housed trader paid no rent');
  assert.match(day.line, /in tax, .* in rent, .* out in wages/);
  assert.equal(day.gold, day.tax + day.rent - day.wages);
});

test('route guards cost gold, cut the risk and are never a guarantee', () => {
  const c = { key: 'hand_cart', guardsMax: 2 };
  const none = guardContract({ carrier: c, guards: 0, data: COLONY, danger: 0.9 });
  const two = guardContract({ carrier: c, guards: 2, data: COLONY, danger: 0.9 });
  assert.equal(two.gold, 20);
  assert.ok(two.riskAfter < none.riskAfter);
  assert.equal(two.survive, 0.5, 'two guards should save a cart about half the time');
  assert.equal(guardContract({ carrier: c, guards: 9, data: COLONY }).guards, 2);
});

test('the world is no longer a road with a wreck on it — trouble is a roll', () => {
  assert.ok(ambushChanceFor({ danger: 0.35, guards: 2 }) < 0.12);
  assert.ok(ambushChanceFor({ danger: 0.9, guards: 0 }) > 0.25);
  assert.ok(ambushChanceFor({ danger: 1, guards: 0, escorted: true }) < ambushChanceFor({ danger: 1, guards: 0 }));
  assert.ok(ambushChanceFor({ danger: 0 }) >= 0.03, 'the floor must hold — nowhere is perfectly safe');
});

// ==================================================================== §9 the muster

const BESTIARY = {
  enemies: [{ id: 'e1', name: 'Scav', hp: 40, minLevel: 1, maxLevel: 40, biomes: ['any'] }],
  bosses: [{ id: 'b1', name: 'Warchief', hp: 300, minLevel: 1 }],
  modifiers: [],
};
const BASE = { structures: 30, defences: 8, citizens: 6, waypoint: true, gold: 0 };

function drill(tier = 'prowlers') {
  const q = raidOffer({ base: BASE, level: 5, biome: 'hills', ...BESTIARY, rng: () => 0.5, data: RAIDS, forceTier: tier, drill: true });
  acceptRaid(q, { at: 0 });
  beginRaid(q, { at: 0, hour: 12, data: RAIDS });
  return q;
}

test('THE THIRD ONE THAT MATTERS — a lost drill costs nothing at all, at every rank', () => {
  for (const t of RAIDS.tiers) {
    const q = drill(t.key);
    const out = loseRaid(q, { base: BASE, materials: 4000, data: RAIDS });
    assert.equal(out.structuresBroken, 0, `${t.key}: a drill broke something`);
    assert.equal(out.materialsTaken, 0, `${t.key}: a drill emptied the store`);
    assert.equal(out.citizensLeave, 0, `${t.key}: a drill drove somebody out`);
    assert.match(out.line, /it was a drill/);
  }
  // …and a REAL raid at the same rank still costs what it always did
  const real = raidOffer({ base: BASE, level: 5, biome: 'hills', ...BESTIARY, rng: () => 0.5, data: RAIDS });
  acceptRaid(real, { at: 0 });
  const hurt = loseRaid(real, { base: BASE, materials: 4000, data: RAIDS });
  assert.ok(hurt.structuresBroken > 0 && hurt.materialsTaken > 0);
});

test('a held drill pays crates with the rare floor intact, spoils in range, and no standing', () => {
  for (const t of RAIDS.tiers) {
    const q = drill(t.key);
    let guard = 0;
    while (q.state === 'running' && guard++ < 20) clearWave(q);
    const prize = raidRewards(q, { rng: () => 0.5, data: RAIDS });
    assert.equal(prize.standing, 0, `${t.key}: a practice changed what the world thinks of you`);
    assert.ok(prize.crates.length >= 1);
    for (const c of prize.crates) assert.ok(['rare', 'epic', 'legendary'].includes(c), 'the rare floor broke');
    for (const [res, n] of Object.entries(prize.spoils || {})) {
      const [lo, hi] = t.spoils[res];
      assert.ok(n >= lo && n <= hi, `${t.key} paid ${n} ${res}, outside ${lo}–${hi}`);
      assert.ok(RES.materials[res], `${t.key} pays ${res}, which is not a material`);
    }
  }
});

test('the gate that makes raids not a burden survives the round', () => {
  const q = raidOffer({ base: BASE, level: 5, biome: 'hills', ...BESTIARY, rng: () => 0.5, data: RAIDS, forceTier: 'siege', drill: true });
  assert.equal(beginRaid(q, { at: 0, hour: 12, data: RAIDS }).ok, false,
    'a drill started without ever being accepted');
  const nope = raidOffer({ base: BASE, level: 5, ...BESTIARY, rng: () => 0.5, data: RAIDS, forceTier: 'nonsense', drill: true });
  assert.equal(nope.tier, null);
  assert.match(nope.why, /No such muster/);
});

test('the cooldown is per rank and per place', () => {
  const m = createMuster({ data: RAIDS, civics: { ...COLONY, dayLengthSeconds: 900 }, bestiary: BESTIARY, rng: () => 0.5 });
  assert.equal(m.start({ placeId: 'ironmoor', tier: 'prowlers', base: BASE, level: 5, at: 0 }).ok, true);
  m.lost({ at: 0 });
  assert.ok(m.cooldownLeft('ironmoor', 'prowlers', 0) > 0);
  assert.equal(m.cooldownLeft('ironmoor', 'warband', 0), 0, 'clearing rank 1 locked out rank 2');
  assert.equal(m.cooldownLeft('yours', 'prowlers', 0), 0, 'a muster at Ironmoor locked out one at your own holding');
  assert.equal(m.start({ placeId: 'ironmoor', tier: 'prowlers', base: BASE, level: 5, at: 10 }).ok, false);
});

test('a walled city musters a harder fight than a hamlet, with arithmetic that was already written', async () => {
  // R27 M2: through the real path — the planner plans both towns, the plans are filed the way
  // js/features.js files them, and `musterFacts` is the very call main.js makes. This used to pass
  // `walled: true` by hand, which is why nobody noticed the game itself always passed false.
  const { planTown } = await import('../../../proctown/js/townplan.js');
  const { rememberPlan, musterFacts } = await import('../js/town-plan.js');
  const cityNode = { id: 9001, size: 5 }, hamletNode = { id: 9002, size: 1 };
  rememberPlan(cityNode, planTown({ seed: 11, size: 5, culture: 'human' }));
  rememberPlan(hamletNode, planTown({ seed: 12, size: 1, culture: 'human' }));
  const cityFacts = musterFacts(cityNode, 12), hamletFacts = musterFacts(hamletNode, 1);
  assert.equal(cityFacts.walled, true, 'a size-5 city does not muster as walled');
  assert.equal(hamletFacts.walled, false);
  assert.ok(cityFacts.plots > hamletFacts.plots && hamletFacts.plots > 0, 'plots are not the plan\'s own count');
  const m = createMuster({ data: RAIDS, civics: COLONY, bestiary: BESTIARY });
  const city = m.baseForTown(cityNode, cityFacts);
  const hamlet = m.baseForTown(hamletNode, hamletFacts);
  assert.ok(city.defences > m.baseForTown(cityNode, { ...cityFacts, walled: false }).defences, 'the walled bonus did not apply');
  assert.ok(city.defences > hamlet.defences);
  assert.ok(city.citizens > hamlet.citizens);
  assert.ok(m.notoriety(city) > m.notoriety(hamlet));
});

test('the leash ends a drill without taking anything', () => {
  const m = createMuster({ data: RAIDS, civics: { ...COLONY, dayLengthSeconds: 900 }, bestiary: BESTIARY, rng: () => 0.5 });
  m.start({ placeId: 'yours', tier: 'prowlers', base: BASE, level: 5, at: 0 });
  const spot = { x: 0, z: 0 };
  assert.equal(m.tickLeash(1, { x: 10, z: 0, spot }), null, 'standing at the stone ended the drill');
  const warn = m.tickLeash(10, { x: 900, z: 0, spot });
  assert.equal(warn.warn, true);
  const over = m.tickLeash(60, { x: 900, z: 0, spot });
  assert.equal(over.over, true);
  assert.equal(over.structuresBroken, 0);
});

// ==================================================================== §4 offline production

test('a colony fed on the clock and a colony caught up in slices end up in the same place', async () => {
  const { createCivics } = await import('../js/civics.js');
  function holding() {
    const stores = createStoreNetwork({ power: POW, materials: RES.materials });
    stores.add({ id: 'crate', type: 'storage_crate', x: 0, z: 0 });
    stores.put(stores.poolAt(0, 0), 'iron_ore', 240);
    stores.put(stores.poolAt(0, 0), 'coal', 120);
    const works = createWorks({ refining: REF, resources: RES, stores, labour: COLONY.labour });
    works.place({ id: 'm1', type: 'furnace', x: 1, z: 0 });
    works.queue('m1', 'smelt_iron', 0);
    const board = new WorkBoard();
    const farm = createFarm({ data: CROPS, board, seed: 3 });
    const colony = createColony({ data: COLONY, board, food: farm, seed: 3, stationAt: () => ({ x: 1, z: 0 }) });
    colony.setBase({ beds: 2, structures: 10 });
    const c = colony.welcome(colony.newCitizen({ name: 'Marwen', job: 'smelter', skill: 1 }));
    colony.bind(c.id, 'm1');
    colony.setClock(6);
    const civics = createCivics({
      data: COLONY, goods: GOODS, raids: RAIDS,
      resources: JSON.parse(JSON.stringify(RES)), refining: JSON.parse(JSON.stringify(REF)),
      colony, works, board, stores, farm, dayLengthSeconds: 900, seed: 3,
    });
    return { stores, works, colony, civics, board, pool: () => stores.poolAt(0, 0) };
  }

  const live = holding();
  const hoursPerSecond = 24 / 900;
  for (let i = 0; i < 1800; i++) {              // 1800 s = two game days, at one second a step
    live.works.postLabour(live.board, { at: i });
    live.colony.tick(hoursPerSecond);
    live.works.collectLabour?.(live.board);
    live.works.tick(1);
  }
  const caught = holding();
  const card = caught.civics.away({ seconds: 1800 });

  const a = live.stores.count(live.pool(), 'iron_ingot');
  const b = caught.stores.count(caught.pool(), 'iron_ingot');
  assert.ok(a > 0 && b > 0, `nothing was smelted either way (live ${a}, caught ${b})`);
  assert.ok(Math.abs(a - b) <= Math.max(4, a * 0.25),
    `a caught-up furnace made ${b} and a ticked one made ${a} — the slice grain should be the whole difference`);
  assert.ok(card.lines.length >= 3);
});

test('the away window is capped, the crate is the real cap, and nobody walks out while you are gone', async () => {
  const { createCivics } = await import('../js/civics.js');
  const stores = createStoreNetwork({ power: POW, materials: RES.materials });
  // R17 — a Chest, not a Box: forty ore no longer fits in the six-slot first store. See `bench`.
  stores.add({ id: 'crate', type: 'storage_chest', x: 0, z: 0 });
  stores.put(stores.poolAt(0, 0), 'iron_ore', 40);       // exactly twenty ingots' worth
  stores.put(stores.poolAt(0, 0), 'coal', 400);
  const works = createWorks({ refining: REF, resources: RES, stores, labour: COLONY.labour });
  works.place({ id: 'm1', type: 'furnace', x: 1, z: 0 });
  works.queue('m1', 'smelt_iron', 0);
  const board = new WorkBoard();
  const farm = createFarm({ data: CROPS, board, seed: 1 });
  const colony = createColony({ data: COLONY, board, food: farm, seed: 1, stationAt: () => ({ x: 1, z: 0 }) });
  colony.setBase({ beds: 8, structures: 12 });
  for (let i = 0; i < 6; i++) {
    const c = colony.welcome(colony.newCitizen({ job: 'smelter', skill: 1 }));
    colony.bind(c.id, 'm1');
  }
  const civics = createCivics({
    data: COLONY, goods: GOODS, raids: RAIDS,
    resources: JSON.parse(JSON.stringify(RES)), refining: JSON.parse(JSON.stringify(REF)),
    colony, works, board, stores, farm, dayLengthSeconds: 900, seed: 1,
  });

  const card = civics.away({ seconds: 200000 });
  assert.equal(card.seconds, COLONY.away.capSeconds, 'the cap did not hold');
  assert.equal(stores.count(stores.poolAt(0, 0), 'iron_ingot'), 20,
    'forty ore is twenty ingots and not one more — nothing in this design may invent an input');
  assert.equal(colony.citizens.length, 6, 'somebody walked out while the player was off-world');
  assert.ok(colony.citizens.every(c => c.hunger <= (COLONY.food.rungs.grumbling + 1e-6)),
    'the mercy did not hold hunger at grumbling');
  assert.match(card.lines.join(' '), /Nobody left/);
});
