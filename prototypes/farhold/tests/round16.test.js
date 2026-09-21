// Round 16 — the pieces of the play-test list that are pure enough to test without a browser.
//
// The browser half is tests/round16.spec.js. What is here is everything that can be decided from
// the data and the pure modules: the tool ladder, the gather clock, the scanner's memory, the
// event dressing, the instanced places, and the population rule.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  HELD_MODES, makeTool, toolKeyFor, toolTierOf, toolSpeed, toolYield, canWork,
  buildable, giveDevice, heldModes, heldNow, cycleHeld, holdWeapon,
  createGathering, createScanner,
} from '../js/tools.js';
import { population, recruitRefusal, populationText, HOUSE_MIN_BEDS } from '../js/population.js';
import { createCommand, ORDERS } from '../js/command.js';

const read = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url)));
const TOOLS = read('tools');
const RES = read('resources');
const EVENTS = read('events');
const INSTANCES = read('instances');
const SETPIECES = read('setpieces');
const SHIPYARD = read('shipyard');
const BALANCE = read('balance');

const src = n => readFileSync(new URL(`../js/${n}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------- 17. no ammunition, cheap fuel

test('R16.17 — nothing in the game counts ammunition', () => {
  const weapons = src('weapons.js');
  assert.ok(!/carried:\s*\d/.test(weapons), 'a ranged weapon still declares how many you carry');
  const main = src('main.js');
  assert.ok(!main.includes('player.javelins'), 'main.js still counts javelins');
  assert.ok(!main.includes('javelinsOnGround'), 'javelins are still dropped on the ground to collect');
  assert.ok(!src('hud.js').includes('ammo-count'), 'the HUD still has an ammunition counter');
  assert.equal(BALANCE.player?.ranged?.javelinCarried, undefined, 'balance.json still carries a javelin count');
});

test('R16.17 — a flight leg costs one unit, not nine', () => {
  const legs = SHIPYARD.fuel.legs;
  for (const [leg, n] of Object.entries(legs)) {
    assert.equal(n, 1, `a ${leg} costs ${n} units of fuel`);
  }
  // the launch gate holds back a landing's worth, so the first flight wants 2 and not 9
  const need = legs.launch + legs.land * (SHIPYARD.fuel.reserve ?? 1);
  assert.ok(need <= 2, `a first launch still demands ${need} fuel`);
});

// ---------------------------------------------------------------- 8. the tool slot

test('R16.8 — a tool is an item with a real tier, and the tiers ladder up', () => {
  const bases = TOOLS.bases;
  assert.ok(bases.length >= 3, 'there is barely a tool ladder');
  let lastTier = 0;
  for (const b of bases) {
    assert.ok(RES.tools[b.toolKey], `${b.id} counts as "${b.toolKey}", which data/resources.json has never heard of`);
    assert.equal(RES.tools[b.toolKey].tier, b.tier, `${b.id}'s tier disagrees with the tool table`);
    assert.ok(b.tier >= lastTier, `${b.id} goes backwards down the ladder`);
    lastTier = b.tier;
    assert.ok(Object.keys(b.cost || {}).length, `${b.id} is free`);
  }
});

test('R16.8 — the first tool can be paid for by somebody holding nothing', () => {
  /**
   * The bug this exists for: the Knapped Tool used to cost stone, stone comes off a rock, and a
   * rock is tier 1 — so the cheapest tool in the game was behind a tool. Every material in its
   * cost must be reachable with bare hands.
   */
  const props = src('props.js');
  const byHand = new Set();
  for (const m of props.matchAll(/^\s+(\w+):\s*\{ hp: \d+, tier: 0, drops: \{([^}]*)\}/gm)) {
    for (const d of m[2].matchAll(/(\w+):/g)) byHand.add(d[1]);
  }
  for (const [kind, k] of Object.entries(RES.nodeKinds)) {
    if ((k.hardness ?? 0) > 0) continue;
    for (const r of Object.keys(k.yields || k.resources || {})) byHand.add(r);
  }
  const first = TOOLS.bases[0];
  for (const m of Object.keys(first.cost)) {
    assert.ok(byHand.has(m), `the first tool costs ${m}, which bare hands cannot get — that is a key locked inside its own door`);
  }
});

test('R16.8 — rarity is speed, and a better tool is strictly better', () => {
  const order = ['normal', 'magic', 'rare', 'legendary'];
  let last = 0;
  for (const r of order) {
    const row = TOOLS.rarity[r];
    assert.ok(row, `there is no ${r} tool`);
    assert.ok(row.speed > last, `a ${r} tool is no faster than the one below it`);
    last = row.speed;
  }
  const base = TOOLS.bases[1];
  const plain = makeTool(base, 'normal', TOOLS);
  const fine = makeTool(base, 'legendary', TOOLS);
  assert.equal(plain.slot, 'tool');
  assert.ok(fine.speed > plain.speed);
  assert.ok(fine.bonusYield > plain.bonusYield);
  assert.ok(toolSpeed({ equipment: { tool: fine } }) > toolSpeed({ equipment: { tool: plain } }));
  assert.ok(toolYield({ equipment: { tool: fine } }) > 1);
});

test('R16.8 — the tool tier comes from the SLOT, never from the weapon', () => {
  const main = src('main.js');
  // the REGEX TEST itself, not the comment that explains why it is gone
  assert.ok(!/\.test\(name\)/.test(main),
    'main.js still guesses the tool tier off the weapon’s name');
  assert.match(main, /const toolTierFor = p => toolKeyFor\(p\)/,
    'the tool key does not come from js/tools.js');
  const archer = { equipment: { weapon: { name: 'Yew Longbow', material: 'yew' } } };
  assert.equal(toolKeyFor(archer), 'hands', 'an archer with no tool is somehow holding one');
  const withTool = { equipment: { tool: makeTool(TOOLS.bases[2], 'normal', TOOLS), weapon: archer.equipment.weapon } };
  assert.equal(toolTierOf(withTool, RES), 2, 'the archer’s steel tool is not being read');
  // and the archer can now work the thing the bow could never open
  const meteor = { kind: 'meteor_site' };
  assert.equal(canWork(archer, meteor, RES), false);
  assert.equal(canWork(withTool, meteor, RES), true);
});

test('R16.8 — the mouse-wheel ring only holds what you own', () => {
  const p = { equipment: {}, devices: {} };
  assert.deepEqual(heldModes(p), ['weapon'], 'a new character can scroll to something they do not have');
  assert.equal(cycleHeld(p, 1), null, 'a ring of one turns');
  p.equipment.tool = makeTool(TOOLS.bases[0], 'normal', TOOLS);
  giveDevice(p, 'scanner');
  giveDevice(p, 'command_rod');
  assert.deepEqual(heldModes(p), HELD_MODES);
  assert.equal(cycleHeld(p, 1), 'tool');
  assert.equal(cycleHeld(p, 1), 'scanner');
  assert.equal(cycleHeld(p, 1), 'rod');
  assert.equal(cycleHeld(p, 1), 'weapon', 'the ring does not come round');
  assert.equal(cycleHeld(p, -1), 'rod', 'the ring only turns one way');
  holdWeapon(p);
  assert.equal(heldNow(p), 'weapon');
  // and a mode whose thing you lost is not one you can be stuck in
  p.devices = {};
  p.held = 'scanner';
  assert.equal(heldNow(p), 'weapon', 'you are still holding a scanner you no longer own');
});

test('R16.8 — a device is built once and is not loot', () => {
  const p = { equipment: {}, devices: {}, bag: [], level: 20 };
  const have = () => 999;
  const rows = buildable(TOOLS, p, have);
  assert.ok(rows.some(r => r.kind === 'device' && r.id === 'scanner'));
  assert.ok(rows.every(r => r.canAfford), 'a full purse cannot pay for everything');
  assert.equal(giveDevice(p, 'scanner'), true);
  assert.equal(giveDevice(p, 'scanner'), false, 'a second scanner was handed out');
  const short = buildable(TOOLS, p, () => 0);
  assert.ok(short.every(r => !r.canAfford), 'an empty purse pays for something');
  for (const r of short) assert.ok(r.short.length, `${r.id} is unaffordable and cannot say what is missing`);
});

// ---------------------------------------------------------------- 8. the gather bar

test('R16.8 — a gather is a bar with a clock, and it pays once', () => {
  const g = createGathering({ data: TOOLS });
  let paid = 0;
  g.begin({ id: 'seam:1', kind: 'seam', name: 'Iron Ore', x: 0, y: 0, z: 0, seconds: 3, speed: 1, onDone: () => paid++ });
  assert.ok(g.active);
  assert.equal(g.bar().fraction, 0);
  g.tick(1, { x: 0, z: 0 });
  assert.ok(Math.abs(g.bar().fraction - 1 / 3) < 1e-9);
  // beginning the same target again must not restart the bar
  g.begin({ id: 'seam:1', kind: 'seam', name: 'Iron Ore', x: 0, y: 0, z: 0, seconds: 3, speed: 1, onDone: () => paid++ });
  assert.ok(Math.abs(g.bar().fraction - 1 / 3) < 1e-9, 'pressing E again restarted the bar');
  g.tick(2.1, { x: 0, z: 0 });
  assert.equal(paid, 1, 'a finished gather paid ' + paid + ' times');
  assert.equal(g.active, false);
  g.tick(1, { x: 0, z: 0 });
  assert.equal(paid, 1, 'it paid again after finishing');
});

test('R16.8 — walking away drops the bar, and a faster tool fills it sooner', () => {
  const g = createGathering({ data: TOOLS });
  let paid = 0;
  g.begin({ id: 'a', kind: 'prop', name: 'Pine', x: 0, y: 0, z: 0, seconds: 3, speed: 1, onDone: () => paid++ });
  g.tick(1, { x: 20, z: 0 });
  assert.equal(g.active, false, 'you can walk to the next county and still be chopping');
  assert.equal(paid, 0);
  const slow = g.secondsFor('seam', 1);
  const fast = g.secondsFor('seam', TOOLS.rarity.legendary.speed);
  assert.ok(fast < slow, 'a masterwork tool is no quicker');
});

// ---------------------------------------------------------------- 8. the scanner

test('R16.8 — the scanner reads what is near and remembers it for good', () => {
  const nodes = [
    { id: 'n1', x: 10, z: 0, kind: 'ore_outcrop', resource: 'iron_ore' },
    { id: 'n2', x: 4000, z: 0, kind: 'ore_outcrop', resource: 'iron_ore' },
  ];
  const s = createScanner({ data: TOOLS, label: n => n.resource });
  assert.equal(s.on, false, 'the scanner is running before it is built');
  assert.deepEqual(s.tick(1, { x: 0, z: 0 }, { nodesNear: () => nodes }), [], 'a scanner that is off still scans');
  s.setOn(true);
  const first = s.tick(1, { x: 0, z: 0 }, { nodesNear: () => nodes });
  assert.equal(first.length, 1, 'the far one was found from here');
  assert.equal(s.size, 1);
  const second = s.tick(1, { x: 0, z: 0 }, { nodesNear: () => nodes });
  assert.equal(second.length, 0, 'the same seam was reported twice');
  // …and it survives the save, which is what makes it a survey rather than a torch
  const copy = createScanner({ data: TOOLS });
  copy.load(s.toJSON());
  assert.equal(copy.size, 1);
  assert.ok(copy.has('n1'));
  assert.equal(copy.list({ x: 0, z: 0 })[0].distance, 10);
});

// ---------------------------------------------------------------- 9. meteors

test('R16.9 — a meteor waits for a tool that could mine it', () => {
  const main = src('main.js');
  assert.match(main, /canFall:/, 'the meteor gate is gone');
  assert.match(main, /meteor_site\?\.hardness/, 'the gate is not tied to the crater seam’s own hardness');
  assert.match(src('meteors.js'), /canFall/, 'js/meteors.js never asks whether it may fall');
  // both roll sites must ask, or the shooting-star path leaks one past the gate
  const rolls = (src('meteors.js').match(/canFall\(\)/g) || []).length;
  assert.ok(rolls >= 2, `only ${rolls} of the two meteor paths checks the gate`);
});

// ---------------------------------------------------------------- 2. the events

test('R16.2 — every event puts something on the ground, and a rescue has somebody in it', () => {
  const PIECES = new Set([...src('sites.js').matchAll(/^\s{2}(\w+):\s*\{\s*tall:/gm)].map(m => m[1]));
  assert.ok(PIECES.size >= 18, `only found ${PIECES.size} buildable pieces`);
  for (const e of EVENTS.events) {
    assert.ok(Array.isArray(e.dressing) && e.dressing.length,
      `"${e.id}" still puts nothing on the ground — that is the dead pointer this round removed`);
    for (const d of e.dressing) {
      assert.ok(PIECES.has(d.piece), `"${e.id}" dresses itself with a "${d.piece}", which js/sites.js cannot build`);
    }
    if (e.kind === 'rescue') {
      assert.ok(e.captive, `"${e.id}" is a rescue with nobody to rescue`);
      const at = e.captive.at || 'cage';
      assert.ok(e.dressing.some(d => d.piece === at),
        `"${e.id}" holds its captive at a "${at}" and has not got one`);
    }
  }
});

test('R16.2 — an event cannot win itself while nobody is watching', () => {
  const enc = src('encounters.js');
  assert.match(enc, /ev\.seen/, 'an event no longer knows whether anybody came');
  assert.match(enc, /standing\(ev\) === 0 && ev\.seen/, 'a rescue still wins on an empty guard list alone');
  assert.match(enc, /closeRadius/, 'the close radius is hard-coded again');
  assert.ok(!/> 520\)/.test(enc), 'the 520 m close radius is back, and the despawn radius is 300');
});

test('R16.2 — there are twice as many events, and every beat has four', () => {
  assert.ok(EVENTS.events.length >= 20, `${EVENTS.events.length} events is not a revamp`);
  for (const kind of ['rescue', 'chase', 'defend', 'trap', 'find']) {
    const n = EVENTS.events.filter(e => e.kind === kind).length;
    assert.ok(n >= 4, `only ${n} "${kind}" events`);
  }
});

// ---------------------------------------------------------------- 1. the landmarks

test('R16.1 — a spent landmark is saved as spent, and stops being a destination', () => {
  const terr = src('territory.js');
  assert.match(terr, /taken: !!l\.taken/, '`taken` is still dropped out of the save');
  assert.match(terr, /function standingOffer/, 'nothing decides whether a place still offers anything');
  assert.match(terr, /if \(!standingOffer\(mark\)\) mark\.state = 'done'/,
    'a landmark with nothing left to give never reaches "done"');
  assert.match(terr, /function adoptLandmark/, 'the two landmark systems are not joined');
  const main = src('main.js');
  assert.match(main, /holdings\.recordFor\(here\.id, mark\)/,
    'atLandmark still looks a set piece up by an id it cannot have');
  assert.match(main, /\.filter\(l => !\(l\.taken && !holdings\.standingOffer\(l\)\)\)/,
    'the minimap still draws a landmark that has been used up');
  assert.match(src('sites.js'), /claimLandmarks/, 'sites.js cannot claim a territory landmark');
});

// ---------------------------------------------------------------- 10. the instances

test('R16.10 — twenty instanced places, and one of them is a dragon', () => {
  assert.ok(INSTANCES.instances.length >= 20, `${INSTANCES.instances.length} instances is not "about 20"`);
  const lairs = INSTANCES.instances.filter(i => /wyrm|dragon|lair/i.test(i.id + i.name + (i.icon || '')));
  assert.ok(lairs.length >= 1, 'there is no dragon’s lair');
  const lair = lairs[0];
  assert.equal(lair.discovery, 'both', 'the lair cannot be found both ways');
  assert.ok(lair.minBand >= 4, 'the lair is not a late-game place');
  for (const i of INSTANCES.instances) {
    assert.ok(SETPIECES.layouts[i.plan], `${i.id}'s mouth "${i.plan}" has no layout, so it renders nothing`);
    assert.ok(i.holds && Object.keys(i.holds).length, `${i.id} holds nothing, so there is no reason to go in`);
    assert.ok((i.gives?.xp ?? 0) > 0, `${i.id} pays no experience`);
  }
});

test('R16.10 — a quest-only instance is never scattered on the map', () => {
  const sites = src('sites.js');
  assert.match(sites, /i\.discovery !== 'quest'/, 'a quest-only place can turn up by accident');
  assert.match(sites, /family: 'instance'/, 'sites.js does not build instances');
  assert.match(sites, /mouths\(\)/, 'nothing can ask sites.js where the doors are');
  const main = src('main.js');
  assert.match(main, /openMouths\(\)/, 'the doors are never opened');
  assert.match(main, /g\.id === dungeon\.nodeId/, 'a cleared dungeon is still matched by name');
});

// ---------------------------------------------------------------- 15. population

test('R16.15 — no house, no population, and no migrants', () => {
  const bedrollOnly = { report: () => ({ beds: 1, spare: 1, meanComfort: 0 }), houses: [{ beds: 1 }] };
  const none = population({ colony: { citizens: [], housing: bedrollOnly } });
  assert.equal(none.started, false, 'two bedrolls count as a holding');
  assert.equal(none.open, false);
  assert.match(recruitRefusal(none), /house/i, 'the refusal does not say to build a house');
  assert.equal(populationText(none), 'No houses');

  const housing = { report: () => ({ beds: 4, spare: 2, meanComfort: 0.4 }), houses: [{ beds: 4 }] };
  const pop = population({ colony: { citizens: [{}, {}], housing } });
  assert.equal(pop.started, true);
  assert.equal(pop.cap, 4);
  assert.equal(pop.used, 2);
  assert.equal(pop.spare, 2);
  assert.equal(pop.open, true);
  assert.equal(recruitRefusal(pop, { gold: 500, price: 100 }), null);
  assert.match(recruitRefusal(pop, { gold: 10, price: 100 }), /gold/);

  const full = population({ colony: { citizens: [{}, {}, {}, {}], housing } });
  assert.equal(full.open, false);
  assert.match(recruitRefusal(full), /bed is taken/);
  assert.ok(HOUSE_MIN_BEDS >= 2);

  // and the colony itself refuses a migrant with no real house
  assert.match(src('colony.js'), /const houses = \(housing\?\.houses \|\| \[\]\)/,
    'js/colony.js will still send migrants to a field of bedrolls');
});

// ---------------------------------------------------------------- 15. the command rod

test('R16.15 — the rod picks your own people and sends them somewhere real', () => {
  const sent = [];
  const assigned = [];
  const bodies = [
    { id: 'colony:0', name: 'Marwen', x: 0, z: 0, citizenId: 'c1' },
    { id: 'colony:1', name: 'Hesk', x: 3, z: 0, citizenId: 'c2' },
  ];
  const folk = {
    own: () => bodies,
    sendTo: (npc, x, z) => { sent.push([npc.id, Math.round(x), Math.round(z)]); return true; },
  };
  const colony = {
    citizens: [{ id: 'c1', body: 'colony:0' }, { id: 'c2', body: 'colony:1' }],
    byId: id => colony.citizens.find(c => c.id === id) || null,
    assign: (id, opt) => { assigned.push([id, opt.stationId]); return { ok: true }; },
  };
  const build = { entries: [{ id: 'm1', key: 'furnace', name: 'Furnace', x: 50, z: 0 }] };
  const works = { machineDefs: { furnace: {} } };
  const log = [];
  const rod = createCommand({ colony, folk, build, works, onLog: t => log.push(t) });

  assert.equal(rod.count, 0);
  assert.match(rod.status(), /click one of your 2 people/);
  // click on somebody: that selects them
  rod.use({ x: 0.5, z: 0 });
  assert.deepEqual(rod.selected, ['colony:0']);
  // shift-click the other one: both
  rod.use({ x: 3, z: 0 }, { add: true });
  assert.equal(rod.count, 2);
  // click the furnace: both go to work there
  const out = rod.use({ x: 50, z: 0 });
  assert.equal(out.ok, true);
  assert.equal(out.kind, 'work', 'pointing at a machine is not a work order');
  assert.equal(sent.length, 2, 'only ' + sent.length + ' of the two were sent');
  assert.deepEqual(assigned.map(a => a[1]), ['m1', 'm1'], 'nobody was bound to the machine');

  // bare ground is a move order, and it lets go of the station
  assigned.length = 0;
  rod.use({ x: 200, z: 200 });
  assert.deepEqual(assigned.map(a => a[1]), [null, null], 'they are still counted at a bench they left');
  assert.ok(ORDERS.work && ORDERS.move);
});

test('R16.15 — the rod never touches somebody else’s people', () => {
  const rod = createCommand({ folk: { own: () => [] }, colony: null });
  const out = rod.use({ x: 0, z: 0 });
  assert.equal(out.ok, false);
  assert.match(out.why, /near enough/);
  assert.match(rod.status(), /you have nobody yet/i);
});

test('R16.15 — a body can be sent, and arriving is something the game can say', () => {
  const town = src('town.js');
  assert.match(town, /npc\.goal/, 'a town body still has nowhere it can be sent');
  assert.match(town, /sendTo\(npc, x, z/, 'nothing can send one');
  assert.match(town, /own: \(\) => live\.get\('colony'\)/, 'your own people cannot be told apart from a market crowd');
});

// ---------------------------------------------------------------- 5 and 6. the raft and the horse

test('R16.5 — the raft turns before it tilts', () => {
  const boat = src('boat.js');
  assert.match(boat, /rotation\.order = 'YXZ'/,
    'the hull still pitches about the world axis, which is why one corner went under');
  assert.match(boat, /deckHeight\(\)/, 'nothing says how high the deck is, so the rider stands in the hull');
  assert.ok(!/rotation\.x = -Math\.min\(0\.09/.test(boat), 'the permanent nose-up list is back');
});

test('R16.6 — a beast’s gait is not reset sixty times a second', () => {
  const creatures = readFileSync(new URL('../../../avatar-3d/js/creatures.js', import.meta.url), 'utf8');
  assert.match(creatures, /setAnim\(n\) \{ if \(n === state\.anim\) return;/,
    'setAnim still resets the clock on every call, which freezes every beast in the game');
  assert.match(creatures, /setRate\(r\)/, 'a creature cannot be told how fast it is travelling');
  assert.match(creatures, /state\.t \+= dt \* \(state\.rate \|\| 1\)/, 'the rate is not applied');
  assert.match(src('main.js'), /horse\.setRate/, 'the horse still gallops at a fixed rate');
});

// ---------------------------------------------------------------- 7. the target bar

test('R16.7 — the health bar shows what you are looking at', () => {
  const main = src('main.js');
  assert.match(main, /const looked = aim\(\)\.target/, 'the bar still guesses from a 2D yaw test');
  assert.match(main, /lookTarget \|\| field\.target\(control\)/, 'there is no fall-back for what is chewing on you');
  assert.match(main, /target: hit\?\.enemy \|\| null/, 'first person still has no idea what is under the reticle');
});
