// node --test prototypes/farhold/tests/colony.test.js
//
// The colony: work units, citizens who go to work, farms the player lays out and the colony keeps,
// food and tax, and raids that only ever happen because the player said so.
//
// Everything under test is pure — no DOM, no Three.js — so these run the same code the game does.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  WorkBoard, createOrder, addWork, workLeft, ledgerRows, creditLine, machineUnits,
  WORK_SOURCES, SOURCE_IDS, DEFAULT_UNITS,
} from '../js/work.js';
import { createFarm, canBreakGround, cropsFor } from '../js/farm.js';
import { createColony, hungerRung, HUNGER_RUNGS, CITIZEN_STATES } from '../js/colony.js';
import {
  notorietyOf, tierFor, raidOffer, acceptRaid, declineRaid, beginRaid, canFire,
  clearWave, waveSpawns, raidRewards, loseRaid, RaidBook, RARITY_ORDER, isNight,
} from '../js/raid.js';
import { QuestLog, QUEST_KINDS, STARTED_KINDS, isStarted } from '../js/quests.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const COLONY = read('../data/colony.json');
const CROPS = read('../data/crops.json');
const RAIDS = read('../data/raids.json');
const BESTIARY = read('../data/enemies.json');

/** A boring, repeatable stream. Nothing here should depend on luck. */
const rngFrom = (seed = 1) => { let s = seed; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; };

// ------------------------------------------------------------------ 1. a unit is a unit

test('ten units arrive from any one of the three sources, and the order cannot tell them apart', () => {
  const results = {};
  for (const source of SOURCE_IDS) {
    const order = createOrder({ id: `o_${source}`, tag: 'refine', stationId: 'furnace', units: 10 });
    // Ten one-unit contributions, all through the same function. No source-specific door exists.
    for (let i = 0; i < 10; i++) addWork(order, { units: 1, source });
    results[source] = order;
    assert.equal(order.done, 10, `${source} did not fill the order`);
    assert.equal(order.complete, true, `${source} filled it and it did not complete`);
    assert.equal(workLeft(order), 0);
    assert.equal(order.ledger[source], 10);
  }
  // The three finished orders differ in nothing but the ledger, which is the only place a source is
  // ever remembered.
  const shape = o => ({ units: o.units, done: o.done, complete: o.complete, tag: o.tag, station: o.stationId });
  assert.deepEqual(shape(results.player), shape(results.machine));
  assert.deepEqual(shape(results.player), shape(results.citizen));
});

test('a machine, a worker and a pair of hands can share one order', () => {
  const board = new WorkBoard();
  const order = board.postJob({ id: 'mix', tag: 'refine', stationId: 'furnace', units: 10 });
  board.swing('mix', { units: 4 });
  board.work('mix', { source: 'citizen', by: 'c1', byName: 'Marwen', units: 3 });
  board.runMachines([{ id: 'saw', name: 'the sawmill', stationId: 'furnace', unitsPerHour: 3 }], 1);
  assert.equal(order.complete, true);
  assert.equal(order.ledger.player, 4);
  assert.equal(order.ledger.citizen, 3);
  assert.equal(order.ledger.machine, 3);
  const rows = ledgerRows(order);
  assert.equal(rows.length, 3, 'the panel should be able to name all three');
  assert.equal(rows[0].source, 'player');
  assert.match(creditLine(order), /by hand/);
  assert.match(creditLine(order), /Marwen/);
  assert.match(creditLine(order), /sawmill/);
});

test('an order never takes more work than it needs, and the leftover comes back as spare', () => {
  const order = createOrder({ units: 10 });
  addWork(order, { units: 9, source: 'citizen' });
  const res = addWork(order, { units: 5, source: 'citizen' });
  assert.equal(res.applied, 1);
  assert.equal(res.spare, 4, 'four units of a shift would have been silently binned');
  assert.equal(order.done, 10);
  // And nothing goes in after it is finished.
  const after = addWork(order, { units: 3, source: 'player' });
  assert.equal(after.applied, 0);
  assert.equal(after.spare, 3);
});

test('ten units is the default a station asks for, and an unknown source is refused', () => {
  assert.equal(DEFAULT_UNITS, 10);
  assert.equal(createOrder({}).units, 10);
  const order = createOrder({ units: 10 });
  const res = addWork(order, { units: 5, source: 'wizard' });
  assert.equal(res.applied, 0);
  assert.match(res.why, /unknown work source/);
  assert.equal(order.done, 0);
  assert.deepEqual(Object.keys(WORK_SOURCES).sort(), SOURCE_IDS.slice().sort());
});

test('an unpowered or switched-off machine mints nothing', () => {
  assert.equal(machineUnits({ unitsPerHour: 4 }, 2), 8);
  assert.equal(machineUnits({ unitsPerHour: 4, powered: false }, 2), 0);
  assert.equal(machineUnits({ unitsPerHour: 4, enabled: false }, 2), 0);
  const board = new WorkBoard();
  board.postJob({ id: 'q', tag: 'refine', stationId: 's', units: 10 });
  board.runMachines([{ id: 'm', stationId: 's', unitsPerHour: 4, powered: false }], 4);
  assert.equal(board.get('q').done, 0);
});

test('the board hands a worker the highest priority, then the oldest', () => {
  const board = new WorkBoard();
  const old = board.postJob({ id: 'a', tag: 'build', units: 5, priority: 1, postedAt: 1 });
  board.postJob({ id: 'b', tag: 'build', units: 5, priority: 1, postedAt: 9 });
  const urgent = board.postJob({ id: 'c', tag: 'build', units: 5, priority: 3, postedAt: 20 });
  assert.equal(board.nextFor({ tags: ['build'] }).id, urgent.id);
  urgent.complete = true;
  assert.equal(board.nextFor({ tags: ['build'] }).id, old.id);
  assert.equal(board.nextFor({ tags: ['harvest'] }), null, 'tags must gate which orders a job picks up');
});

// ------------------------------------------------------------------ 2. citizens go to work

const colonyWith = (opts = {}) => {
  const board = new WorkBoard();
  const farm = createFarm({ data: CROPS, board });
  const colony = createColony({ data: COLONY, board, food: farm, seed: 4, ...opts });
  return { board, farm, colony };
};

test('a citizen wakes, walks to work, works, walks home and sleeps', () => {
  const { board, colony } = colonyWith();
  colony.setBase({ structures: 6, beds: 2 });
  const c = colony.welcome(colony.newCitizen({ job: 'labourer' }));
  board.postJob({ id: 'wall', tag: 'build', stationId: 'wall', units: 40 });
  colony.setClock(5);

  const seen = new Set();
  for (let i = 0; i < 96; i++) {          // a whole day in quarter-hours
    colony.tick(0.25);
    seen.add(c.state);
  }
  for (const state of ['asleep', 'home', 'to_work', 'working', 'to_home']) {
    assert.ok(seen.has(state), `a citizen's day never reached "${state}"`);
    assert.ok(CITIZEN_STATES[state], `${state} is not a documented state`);
  }
  assert.ok(c.unitsTotal > 0, 'a full shift produced no work at all');
  assert.ok(board.get('wall').ledger.citizen > 0, 'the work did not land on the order');
  assert.equal(board.get('wall').ledger.player, 0);
});

test("a citizen's shift fills a ten-unit order, and the order does not care who did it", () => {
  const { board, colony } = colonyWith();
  colony.setBase({ beds: 1 });
  const c = colony.welcome(colony.newCitizen({ job: 'smelter' }));
  const order = board.postJob({ id: 'ingots', tag: 'refine', stationId: 'furnace', units: 10 });
  colony.assign(c.id, { stationId: 'furnace' });
  colony.setClock(6);
  let guard = 0;
  while (!order.complete && guard++ < 400) colony.tick(0.25);
  assert.equal(order.complete, true, 'a worker could not finish ten units in four days');
  assert.equal(order.ledger.citizen, 10);
  assert.equal(creditLine(order), `10 by ${c.name}`);
});

test('a citizen with nothing on the board clocks up idle hours rather than inventing work', () => {
  const { colony } = colonyWith();
  colony.setBase({ beds: 1 });
  const c = colony.welcome(colony.newCitizen({ job: 'labourer' }));
  colony.setClock(6);
  colony.tick(12);
  assert.equal(c.unitsTotal, 0);
  assert.ok(c.idleHours > 0, 'an idle worker should be visibly idle');
});

test('every job in the data is a real job with tags and a rate', () => {
  for (const job of COLONY.jobs) {
    assert.ok(job.key && job.name && job.blurb, `${job.key} is missing its words`);
    assert.ok(Array.isArray(job.tags) && job.tags.length, `${job.key} has no work it will pick up`);
    assert.ok(job.unitsPerHour > 0, `${job.key} produces nothing`);
    assert.equal(job.mayBreakGround, false, `${job.key} claims it may break new ground — no job may`);
  }
});

// ------------------------------------------------------------------ 3. farming is maintenance

test('only the player breaks new ground', () => {
  const { farm } = colonyWith();
  assert.equal(canBreakGround('player'), true);
  for (const source of ['citizen', 'machine', 'farmer', null]) {
    assert.equal(canBreakGround(source), false, `${source} was allowed to break ground`);
    const res = farm.layPlot({ crop: 'grain', by: source });
    assert.equal(res.ok, false);
    assert.match(res.why, /Only you can break new ground/);
  }
  assert.equal(canBreakGround(undefined), false);
  assert.equal(farm.plots.length, 0);
  assert.equal(farm.layPlot({ crop: 'grain', by: 'player' }).ok, true);
  assert.equal(farm.plots.length, 1);
  assert.equal(farm.plots[0].laidBy, 'player');
});

test('a farmer harvests and replants for a month, and lays not one new plot', () => {
  const { board, farm, colony } = colonyWith();
  colony.setBase({ beds: 2, structures: 4 });
  colony.welcome(colony.newCitizen({ job: 'farmer' }));
  farm.store.grain = 30;                                   // so nobody starves mid-experiment
  farm.layPlot({ crop: 'grain', by: 'player' });
  farm.layPlot({ crop: 'roots', by: 'player' });
  const laid = farm.plots.length;

  let harvested = 0;
  let replanted = 0;
  for (let day = 0; day < 30; day++) {
    for (let i = 0; i < 24; i++) {
      const events = farm.tick(1);
      harvested += events.filter(e => e.kind === 'harvested').length;
      replanted += events.filter(e => e.kind === 'replanted').length;
      colony.tick(1);
    }
  }
  assert.equal(farm.plots.length, laid, 'a farmer created a plot, which is the one thing they must never do');
  assert.ok(harvested >= 2, `a month of farming brought in ${harvested} harvests`);
  assert.ok(replanted >= 2, `a month of farming replanted ${replanted} times`);
  assert.ok(farm.plots.every(p => p.laidBy === 'player'));
  assert.ok(farm.plots.some(p => p.harvests > 0), 'no plot was ever worked');
  // And the work went through the ordinary board, by a citizen, not through a farm-only path.
  const farmOrders = board.finished.filter(o => o.meta?.farm === farm.id && o.meta?.kind !== 'cook');
  assert.ok(farmOrders.length > 0);
  assert.ok(farmOrders.every(o => o.ledger.citizen > 0 || o.ledger.player > 0 || o.ledger.machine > 0));
});

test('the player can reap their own field by hand, and a machine can do it too', () => {
  const { board, farm } = colonyWith();
  farm.layPlot({ crop: 'grain', by: 'player' });
  farm.tick(CROPS.crops.find(c => c.key === 'grain').growHours);
  const harvest = board.open().find(o => o.tag === 'harvest');
  assert.ok(harvest, 'a ripe plot posted no harvest order');
  board.swing(harvest.id, { units: harvest.units });
  farm.tick(0);
  assert.ok((farm.store.grain || 0) > 0, 'reaping by hand produced nothing');
  assert.equal(farm.plots[0].state, 'stubble');

  const replant = board.open().find(o => o.tag === 'replant');
  assert.ok(replant, 'a stubble plot posted no replant order');
  board.runMachines([{ id: 'tiller', stationId: replant.stationId, unitsPerHour: 10, name: 'the tiller' }], 1);
  farm.tick(0);
  assert.equal(farm.plots[0].state, 'growing');
  assert.equal(farm.plots[0].harvests, 1);
});

test('a plot removed by the player is gone, and a citizen cannot tear one up', () => {
  const { farm } = colonyWith();
  const { plot } = farm.layPlot({ crop: 'grain', by: 'player' });
  assert.equal(farm.removePlot(plot.id, 'citizen').ok, false);
  assert.equal(farm.plots.length, 1);
  assert.equal(farm.removePlot(plot.id, 'player').ok, true);
  assert.equal(farm.plots.length, 0);
});

test('crops only take on ground that suits them', () => {
  const ice = cropsFor(CROPS, 'ice').map(c => c.key);
  assert.ok(ice.includes('frostcap'));
  assert.ok(!ice.includes('gourd'), 'a lantern gourd should not grow on ice');
  const { farm } = colonyWith();
  assert.equal(farm.layPlot({ crop: 'gourd', by: 'player', biome: 'ice' }).ok, false);
  assert.equal(farm.layPlot({ crop: 'frostcap', by: 'player', biome: 'ice' }).ok, true);
});

// ------------------------------------------------------------------ 4. an unfed colony degrades

test('an unfed colony goes down the ladder a rung at a time, and then walks out', () => {
  const { colony } = colonyWith();
  colony.setBase({ beds: 3, structures: 8 });
  const a = colony.welcome(colony.newCitizen({ job: 'labourer' }));
  colony.welcome(colony.newCitizen({ job: 'farmer' }));
  // No food anywhere. Nothing is cooked, nothing is stored.
  colony.setClock(6);

  const rungsSeen = [];
  for (let i = 0; i < 12 && colony.citizens.length === 2; i++) {
    colony.tick(6);
    const rung = hungerRung(a, COLONY.food);
    if (rungsSeen[rungsSeen.length - 1] !== rung) rungsSeen.push(rung);
  }
  assert.ok(rungsSeen.includes('hungry'), `never got hungry: ${rungsSeen.join(' -> ')}`);
  assert.ok(rungsSeen.includes('grumbling'), `never grumbled: ${rungsSeen.join(' -> ')}`);
  // Every rung seen is a documented one, in order, and it only ever went downwards.
  const at = r => HUNGER_RUNGS.indexOf(r);
  for (let i = 1; i < rungsSeen.length; i++) assert.ok(at(rungsSeen[i]) > at(rungsSeen[i - 1]), 'the ladder went back up');

  // Keep going and they leave. Nobody dies — a dead citizen is a reload, a departed one is a lesson.
  let guard = 0;
  while (colony.citizens.length === 2 && guard++ < 40) colony.tick(6);
  assert.ok(colony.departed.length > 0, 'a starving colony never lost anybody');
  assert.equal(colony.departed[0].leftBecause, 'hunger');
  assert.ok(colony.log.some(l => /walked out/.test(l.line)));
});

test('a citizen who has downed tools does no work', () => {
  const { board, colony } = colonyWith();
  colony.setBase({ beds: 1 });
  const c = colony.welcome(colony.newCitizen({ job: 'labourer' }));
  board.postJob({ id: 'big', tag: 'build', stationId: 'wall', units: 500 });
  colony.setClock(6);
  colony.tick(8);
  const early = c.unitsTotal;
  assert.ok(early > 0, 'a fed citizen did nothing on their first day');
  c.hunger = COLONY.food.rungs.downsTools + 0.01;
  const before = c.unitsTotal;
  colony.setClock(7);
  colony.tick(6);
  assert.equal(c.unitsTotal, before, 'a citizen with downed tools kept working');
  assert.notEqual(c.state, 'working');
});

test('feeding them brings them back up the ladder', () => {
  const { farm, colony } = colonyWith();
  colony.setBase({ beds: 1 });
  const c = colony.welcome(colony.newCitizen({ job: 'labourer' }));
  c.hunger = 0.6;
  assert.equal(hungerRung(c, COLONY.food), 'grumbling');
  farm.store.grain = 50;
  colony.setClock(6);
  colony.tick(24);
  assert.ok(c.hunger < 0.6, 'eating did not help');
  assert.equal(hungerRung(c, COLONY.food), 'content');
});

// ------------------------------------------------------------------ 5. food and tax

test('tax comes only from citizens who are both fed and housed', () => {
  const { farm, colony } = colonyWith();
  colony.setBase({ structures: 10, beds: 2 });
  farm.store.grain = 200;
  const fed = colony.welcome(colony.newCitizen({ job: 'labourer' }));
  const housedButHungry = colony.welcome(colony.newCitizen({ job: 'labourer' }));
  const roofless = colony.welcome(colony.newCitizen({ job: 'labourer' }));   // third person, two beds
  housedButHungry.hunger = COLONY.food.rungs.grumbling + 0.05;

  assert.ok(fed.home, 'the first citizen should have a bed');
  assert.equal(roofless.home, null, 'the third citizen should be sleeping rough');

  const bill = colony.collectTax();
  assert.equal(bill.paid.length, 1, 'somebody paid who should not have');
  assert.equal(bill.paid[0].id, fed.id);
  assert.ok(bill.gold > 0);
  const why = Object.fromEntries(bill.skipped.map(s => [s.id, s.why]));
  assert.equal(why[roofless.id], 'no bed');
  assert.equal(why[housedButHungry.id], 'grumbling');
});

test('tax scales with the number of fed, housed citizens and with the size of the place', () => {
  const take = ({ people, beds, structures }) => {
    const { farm, colony } = colonyWith();
    colony.setBase({ structures, beds });
    farm.store.grain = 500;
    for (let i = 0; i < people; i++) colony.welcome(colony.newCitizen({ job: 'labourer' }));
    for (const c of colony.citizens) { c.mood = 0.8; c.hunger = 0; }
    return colony.collectTax().gold;
  };
  const one = take({ people: 1, beds: 4, structures: 0 });
  const four = take({ people: 4, beds: 4, structures: 0 });
  assert.ok(four > one, 'four citizens paid no more than one');
  assert.ok(four >= one * 3.5, `four citizens should pay about four times one (${one} -> ${four})`);

  const plain = take({ people: 4, beds: 4, structures: 0 });
  const grand = take({ people: 4, beds: 4, structures: 40 });
  assert.ok(grand > plain, 'a bigger place paid no better');

  // And no beds means no tax at all, however many people there are.
  assert.equal(take({ people: 4, beds: 0, structures: 20 }), 0);
});

test('gold accumulates day by day, once a day', () => {
  const { farm, colony } = colonyWith();
  colony.setBase({ structures: 10, beds: 3 });
  farm.store.grain = 400;
  for (let i = 0; i < 3; i++) colony.welcome(colony.newCitizen({ job: 'labourer' }));
  colony.setClock(6, 1);
  const events = colony.tick(72);
  const taxDays = events.filter(e => e.kind === 'tax');
  assert.equal(taxDays.length, 3, 'three days should pay three times');
  assert.ok(colony.gold > 0);
  assert.equal(colony.gold, taxDays.reduce((s, t) => s + t.gold, 0));
});

test('food days and appeal read off the real store', () => {
  const { farm, colony } = colonyWith();
  colony.setBase({ beds: 4, defences: 6, structures: 10 });
  colony.welcome(colony.newCitizen({ job: 'farmer' }));
  const hungry = colony.appeal().score;
  farm.store.grain = 200;
  const stocked = colony.appeal().score;
  assert.ok(stocked > hungry, 'a full granary made the place no more attractive');
  assert.ok(farm.foodDays(1, COLONY.food.perCitizenPerDay) > 6);
});

// ------------------------------------------------------------------ migration and recruiting

test('a migrant is an offer, never an arrival', () => {
  const { farm, colony } = colonyWith({ seed: 11 });
  colony.setBase({ beds: 6, defences: 8, structures: 20 });
  farm.store.grain = 400;
  for (const c of colony.citizens) c.mood = 1;
  let offer = null;
  for (let day = 0; day < 60 && !offer; day++) offer = colony.rollMigration();
  assert.ok(offer, 'nobody ever came, at a colony with beds, food and walls');
  assert.equal(colony.citizens.length, 0, 'a migrant joined without being asked about');
  assert.ok(offer.text.length > 20);
  assert.equal(colony.turnAway(offer.id).ok, true);
  assert.equal(colony.citizens.length, 0);

  let second = null;
  for (let day = 0; day < 60 && !second; day++) second = colony.rollMigration();
  assert.ok(second);
  assert.equal(colony.accept(second.id).ok, true);
  assert.equal(colony.citizens.length, 1);
});

test('nobody migrates to a place with no bed for them', () => {
  const { farm, colony } = colonyWith({ seed: 12 });
  colony.setBase({ beds: 0, defences: 10, structures: 40 });
  farm.store.grain = 999;
  for (let i = 0; i < 200; i++) assert.equal(colony.rollMigration(), null);
});

test('recruiting from a town costs gold, empties a pool, and needs a bed', () => {
  const { colony } = colonyWith({ seed: 21 });
  colony.setBase({ beds: 0 });
  const offer = colony.recruitOffer({ settlementId: 'ashford', settlementName: 'Ashford', size: 3 });
  assert.equal(offer.ok, true);
  assert.ok(offer.price > 0);
  assert.match(offer.text, /Ashford/);
  assert.equal(colony.recruit(offer, { gold: 0 }).ok, false, 'a recruit was taken on with no money');
  assert.match(colony.recruit(offer, { gold: 5 }).why, /gold/);
  assert.match(colony.recruit(offer, { gold: offer.price }).why, /bed/);
  colony.setBeds(4);
  const hired = colony.recruit(offer, { gold: offer.price });
  assert.equal(hired.ok, true);
  assert.equal(colony.citizens.length, 1);

  // The town has a finite number of people who want to leave.
  let guard = 0;
  while (guard++ < 20) {
    const next = colony.recruitOffer({ settlementId: 'ashford', settlementName: 'Ashford', size: 3 });
    if (!next.ok) break;
    colony.setBeds(colony.citizens.length + 2);
    const res = colony.recruit(next, { gold: 99999 });
    if (!res.ok) break;
  }
  const dry = colony.recruitOffer({ settlementId: 'ashford', settlementName: 'Ashford', size: 3 });
  assert.equal(dry.ok, false);
  assert.match(dry.why, /Ashford/);
});

test('good standing makes a recruit cheaper, and a bigger colony makes them dearer', () => {
  const at = (standing, existing) => {
    const { colony } = colonyWith({ seed: 31 });
    colony.setBeds(40);
    for (let i = 0; i < existing; i++) colony.welcome(colony.newCitizen({ job: 'labourer' }));
    return colony.recruitOffer({ settlementId: 't', size: 3, standing, job: 'labourer' }).price;
  };
  assert.ok(at(1, 0) < at(0, 0), 'standing bought no discount');
  assert.ok(at(0, 8) > at(0, 0), 'a big colony was no harder to recruit for');
});

// ------------------------------------------------------------------ 6. raids you start

const base = { structures: 22, defences: 7, citizens: 6, gold: 1500, waypoint: true };
const makeOffer = (seed = 5, over = {}) => raidOffer({
  base: { ...base, ...(over.base || {}) }, level: over.level ?? 10, biome: over.biome ?? 'grass',
  enemies: BESTIARY.enemies, bosses: BESTIARY.bosses, modifiers: BESTIARY.modifiers,
  rng: rngFrom(seed), data: RAIDS, placeName: 'Farhold', enabled: over.enabled !== false,
});

test('a raid cannot fire until the player accepts it', () => {
  const offer = makeOffer();
  assert.equal(offer.ok, true);
  assert.equal(offer.state, 'offered');
  assert.equal(canFire(offer), false, 'an offer that nobody accepted could fire');
  const refused = beginRaid(offer, { hour: 21, data: RAIDS });
  assert.equal(refused.ok, false);
  assert.match(refused.why, /have not taken that on/);
  assert.equal(offer.state, 'offered');
  assert.equal(waveSpawns(offer, { base, level: 10, data: RAIDS }).length, 0, 'an unaccepted raid put bodies on the ground');

  acceptRaid(offer, { at: 3 });
  assert.equal(offer.state, 'accepted');
  assert.equal(canFire(offer), true);
  // Still nothing on the ground — accepting is not starting. The player picks the hour.
  assert.equal(waveSpawns(offer, { base, level: 10, data: RAIDS }).length, 0);

  const started = beginRaid(offer, { hour: 21, data: RAIDS, early: true });
  assert.equal(started.ok, true);
  assert.equal(offer.state, 'running');
  assert.ok(waveSpawns(offer, { base, level: 10, data: RAIDS }).length > 0);
});

test('a raid declined before the bell is simply gone', () => {
  const offer = makeOffer(6);
  acceptRaid(offer);
  assert.equal(declineRaid(offer).ok, true);
  assert.equal(canFire(offer), false);
  assert.equal(beginRaid(offer, { hour: 12, data: RAIDS }).ok, false);
});

test('a base with no defences is never offered a raid, however much is built', () => {
  const heavy = { structures: 120, defences: 0, citizens: 40, gold: 90000, waypoint: true };
  const res = tierFor({ base: heavy, data: RAIDS });
  assert.equal(res.tier, null, 'building houses got the player raided');
  assert.match(res.why, /defences/);
  assert.ok(res.notoriety > 100, 'a big rich base should still be notorious');
  const offer = raidOffer({ base: heavy, level: 20, enemies: BESTIARY.enemies, rng: rngFrom(3), data: RAIDS });
  assert.equal(offer.ok, false);
});

test('a small base with a turret is not offered a raid either — both gates, always', () => {
  const tiny = { structures: 2, defences: 9, citizens: 0, gold: 0 };
  const res = tierFor({ base: tiny, data: RAIDS });
  assert.equal(res.tier, null);
  for (const tier of RAIDS.tiers) {
    assert.ok(tier.minSize > 0 && tier.minDefence > 0, `${tier.key} has a gate of zero`);
  }
});

test('raids can be switched off entirely', () => {
  assert.equal(raidOffer({ base, level: 10, enemies: BESTIARY.enemies, rng: rngFrom(1), data: RAIDS, enabled: false }), null);
});

test('the raiders are things that actually live on this ground', () => {
  for (const biome of ['grass', 'tundra', 'jungle', 'desert']) {
    const offer = makeOffer(9, { biome });
    assert.equal(offer.ok, true, `no raid could be built for ${biome}`);
    const ids = offer.waves.flatMap(w => w.groups.map(g => g.defId));
    assert.ok(ids.length > 0);
    for (const id of ids) {
      const def = BESTIARY.enemies.find(e => e.id === id);
      assert.ok(def, `${id} is not in the bestiary`);
      const lives = (def.biomes || ['any']).some(b => b === 'any' || biome.includes(b));
      assert.ok(lives, `${def.name} does not live on ${biome}`);
    }
  }
});

test('holding the base always pays at least one rare crate', () => {
  for (let seed = 1; seed < 25; seed++) {
    const offer = makeOffer(seed);
    if (!offer.ok) continue;
    acceptRaid(offer);
    beginRaid(offer, { hour: 13, data: RAIDS });
    let guard = 0;
    while (offer.state === 'running' && guard++ < 30) clearWave(offer);
    assert.equal(offer.state, 'won');
    const won = raidRewards(offer, { rng: rngFrom(seed), data: RAIDS });
    assert.ok(won.crates.length >= 1, 'a held raid paid no crate');
    const worst = Math.min(...won.crates.map(r => RARITY_ORDER.indexOf(r)));
    assert.ok(worst >= RARITY_ORDER.indexOf('rare'), `a crate came back as ${RARITY_ORDER[worst]}`);
    assert.ok(won.gold > 0 && won.xp > 0);
  }
});

test('a night raid pays more than the same raid by day, and starting early pays more again', () => {
  const run = ({ hour, early }) => {
    const offer = makeOffer(7);
    acceptRaid(offer);
    beginRaid(offer, { hour, data: RAIDS, early });
    let guard = 0;
    while (offer.state === 'running' && guard++ < 30) clearWave(offer);
    return raidRewards(offer, { rng: rngFrom(7), data: RAIDS });
  };
  const day = run({ hour: 13, early: false });
  const night = run({ hour: 22, early: false });
  const nightEarly = run({ hour: 22, early: true });
  assert.ok(night.gold > day.gold, 'a night raid paid no better');
  assert.ok(night.xp > day.xp);
  assert.ok(nightEarly.gold > night.gold, 'ringing the bell early paid no bonus');
  assert.equal(isNight(22, RAIDS), true);
  assert.equal(isNight(13, RAIDS), false);
});

test('losing breaks things and takes things, and never deletes the base', () => {
  const offer = makeOffer(8);
  acceptRaid(offer);
  beginRaid(offer, { hour: 2, data: RAIDS });
  const out = loseRaid(offer, { base, materials: 400, data: RAIDS });
  assert.equal(offer.state, 'lost');
  assert.ok(out.structuresBroken > 0 && out.structuresBroken < base.structures, 'losing should not flatten the base');
  assert.ok(out.materialsTaken > 0 && out.materialsTaken < 400);
  assert.match(out.line, /nothing is gone for good/);
});

test('the raid book keeps a readable history', () => {
  const book = new RaidBook();
  const offer = makeOffer(4);
  acceptRaid(offer);
  beginRaid(offer, { hour: 21, data: RAIDS });
  let guard = 0;
  while (offer.state === 'running' && guard++ < 30) clearWave(offer);
  book.record(offer, raidRewards(offer, { rng: rngFrom(4), data: RAIDS }));
  const lines = book.lines();
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Farhold/);
  assert.match(lines[0], /held/);
});

// ------------------------------------------------------------------ the quest log carries a raid

test('a raid lives in the quest log without becoming a village errand', () => {
  const log = new QuestLog();
  const offer = makeOffer(2);
  log.add(offer);
  assert.equal(isStarted(offer), true);
  // R14 added `fall` — a meteor is a job nobody handed you either. Both must stay out of QUEST_KINDS.
  assert.deepEqual(STARTED_KINDS, ['raid', 'fall']);
  assert.ok(!QUEST_KINDS.includes('raid'), 'a raid must never be rolled onto a job board');
  assert.ok(!QUEST_KINDS.includes('fall'), 'a meteor must never be rolled onto a job board');
  assert.equal(log.byGiver(null).length, 0, 'a raid turned up in an NPC\'s job list');
  assert.equal(log.raids().length, 1);
  assert.equal(log.progressText(offer), 'not taken');

  acceptRaid(offer);
  assert.match(log.progressText(offer), /ring the bell/);
  beginRaid(offer, { hour: 12, data: RAIDS });
  log.onRaidWave({ questId: offer.id, wave: 1 });
  assert.match(log.progressText(offer), /wave 1 \//);
  assert.equal(log.readyToTurnIn(null).length, 0);

  log.onRaidWave({ questId: offer.id, wave: offer.count });
  assert.equal(offer.done, true);
  assert.equal(log.readyRaids().length, 1);

  // And the ordinary kinds are untouched.
  assert.equal(log.onKill({ defId: 'moor_hound' }).length, 0);
  assert.equal(log.onLoot({ baseKey: 'ring' }).length, 0);
});

// ------------------------------------------------------------------ the data itself

test('every data file explains itself and holds no borrowed names', () => {
  for (const [name, data] of [['colony.json', COLONY], ['crops.json', CROPS], ['raids.json', RAIDS]]) {
    assert.ok(typeof data._doc === 'string' && data._doc.length > 80, `${name} has no _doc block`);
  }
  // Design references belong in comments and Claude-facing docs, never in anything a player reads.
  const playerText = [
    ...COLONY.jobs.map(j => `${j.name} ${j.blurb}`),
    ...CROPS.crops.map(c => `${c.name} ${c.blurb}`),
    ...RAIDS.tiers.map(t => `${t.name} ${t.text}`),
  ].join(' ').toLowerCase();
  for (const borrowed of ['colony survival', 'necesse', 'rimworld', 'minecraft', 'factorio']) {
    assert.ok(!playerText.includes(borrowed), `"${borrowed}" appears in text a player can read`);
  }
});

test('the hunger ladder in the data is in order and reaches the top', () => {
  const r = COLONY.food.rungs;
  assert.ok(r.hungry < r.grumbling);
  assert.ok(r.grumbling < r.downsTools);
  assert.ok(r.downsTools < r.leaves);
  assert.equal(r.leaves, 1);
  assert.deepEqual(HUNGER_RUNGS, ['content', 'hungry', 'grumbling', 'downsTools', 'leaving']);
});

test('raid tiers climb, and every one of them guarantees a rare crate', () => {
  const ranks = RAIDS.tiers.map(t => t.rank);
  assert.deepEqual(ranks, ranks.slice().sort((a, b) => a - b));
  let lastSize = -1;
  let lastDef = -1;
  for (const t of RAIDS.tiers) {
    assert.ok(t.minSize > lastSize, `${t.key} does not ask for a bigger base than the tier below`);
    assert.ok(t.minDefence > lastDef, `${t.key} does not ask for more defence than the tier below`);
    lastSize = t.minSize; lastDef = t.minDefence;
    assert.ok(t.crates.length >= 1, `${t.key} pays no crate`);
    for (const c of t.crates) {
      assert.ok(RARITY_ORDER.indexOf(c) >= RARITY_ORDER.indexOf('rare'), `${t.key} pays a ${c} crate`);
    }
    assert.ok(t.waves >= 3 && t.waves <= 7, `${t.key} has ${t.waves} waves`);
  }
});

test('every crop grows, yields, and names the ground it wants', () => {
  for (const c of CROPS.crops) {
    assert.ok(c.key && c.name && c.good && c.blurb, `${c.key} is missing its words`);
    assert.ok(c.growHours > 0 && c.yield > 0, `${c.key} grows nothing`);
    assert.ok(Array.isArray(c.biomes) && c.biomes.length, `${c.key} grows nowhere`);
    assert.ok(c.food >= 0);
  }
  assert.ok(CROPS.crops.some(c => c.food > 0), 'nothing in the crop table is food');
  assert.ok(CROPS.crops.some(c => c.food === 0), 'every crop is food, so fibre has nowhere to come from');
});

// ------------------------------------------------------------------ saving

test('a colony and a farm survive a round trip through JSON', () => {
  const { farm, colony } = colonyWith();
  colony.setBase({ structures: 12, beds: 3, defences: 4 });
  colony.welcome(colony.newCitizen({ job: 'farmer' }));
  colony.welcome(colony.newCitizen({ job: 'miner' }));
  farm.layPlot({ crop: 'grain', by: 'player' });
  farm.store.grain = 12;
  colony.gold = 240;
  colony.tick(30);

  const saved = JSON.parse(JSON.stringify({ colony: colony.toJSON(), farm: farm.toJSON() }));
  const board2 = new WorkBoard();
  const farm2 = createFarm({ data: CROPS, board: board2 }).load(saved.farm);
  const colony2 = createColony({ data: COLONY, board: board2, food: farm2, seed: 4 }).load(saved.colony);

  assert.equal(colony2.citizens.length, 2);
  assert.equal(colony2.gold, colony.gold);
  assert.equal(colony2.base.beds, 3);
  assert.equal(farm2.plots.length, 1);
  assert.equal(farm2.plots[0].laidBy, 'player');
  assert.equal(farm2.store.grain, farm.store.grain);
  assert.ok(colony2.citizens.every(c => c.home), 'beds were not handed back out on load');
});
