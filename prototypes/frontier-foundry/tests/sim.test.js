// node --test prototypes/frontier-foundry/tests/sim.test.js
// The bot has to be able to actually play: land, dig, smelt, wire up a grid, research, and hold a
// line. These are the milestones the balance sim (tools/sim-foundry.mjs) is checked against.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadData } from '../js/data.js';
import { Game } from '../js/game.js';
import { Bot, PLAN } from '../js/ai.js';
import { localPlanets, generatePlanetMap } from '../js/planets.js';

const data = await loadData();
const planets = localPlanets(data.resources, 5, 5);
const worlds = new Map();
const worldFor = p => (worlds.has(p.id) ? worlds.get(p.id) : (worlds.set(p.id, generatePlanetMap(p, { width: 96, height: 48 })), worlds.get(p.id)));

function run(hours, opts = {}) {
  const planet = opts.planet || planets.list()[0];
  const g = Game.createSync({ seed: opts.seed ?? 7, difficulty: opts.difficulty ?? 'normal', data, planets, planet, world: worldFor(planet), size: opts.size ?? 80, nests: opts.nests ?? false });
  if (opts.waves !== true) g.flags.noWaves = true;
  const bot = new Bot(g);
  const n = Math.round(hours * 3600);
  for (let t = 0; t < n && !g.lost; t++) { g.tick(1); bot.tick(1); }
  return { g, bot };
}

test('the bot gets a factory standing: drills, smelters, a grid and a research line', () => {
  const { g } = run(3);
  const done = g.structures.filter(s => s.state === 'done');
  assert.ok(done.length >= 40, `only ${done.length} buildings after 3 hours`);
  assert.ok(g.structures.some(s => s.nodeId && g.nodeById(s.nodeId)?.resource === 'iron_ore'), 'no iron drill');
  assert.ok(g.structures.some(s => s.recipe === 'smelt_iron'), 'no iron smelter');
  assert.ok(g.structures.some(s => s.recipe === 'make_iron_plate'), 'nothing making plate');
  assert.ok(g.structures.some(s => s.def.researchRate), 'no lab');
  assert.ok(g.stats.power.gen > 200, `only ${Math.round(g.stats.power.gen)} kW`);
  assert.ok((g.stats.produced.iron_plate || 0) > 400, `only ${Math.round(g.stats.produced.iron_plate || 0)} plate made`);
  assert.ok(g.research.done.length >= 5, `only ${g.research.done.length} research nodes`);
  assert.ok(g.quests.done.length >= 3, `only ${g.quests.done.length} quests done`);
}, { timeout: 120000 });

test('given time it climbs the tree and keeps the grid healthy', () => {
  const { g } = run(6);
  assert.ok(g.research.done.length >= 12, `only ${g.research.done.length} research nodes after 6 hours`);
  assert.ok(g.structures.filter(s => s.state === 'done').length >= 90);
  assert.ok(g.stats.power.satisfaction > 0.4, `grid at ${(g.stats.power.satisfaction * 100) | 0}%`);
  assert.ok(g.stats.produced.steel_ingot > 0 || g.research.done.includes('t_steel'), 'never reached steel');
}, { timeout: 240000 });

test('the same seed plays out identically twice', () => {
  const a = run(0.6), b = run(0.6);
  assert.equal(a.g.structures.length, b.g.structures.length);
  assert.equal(a.g.research.done.join(','), b.g.research.done.join(','));
  assert.equal(Math.round(a.g.stats.power.gen), Math.round(b.g.stats.power.gen));
  const inv = a.g.inventory(), inv2 = b.g.inventory();
  for (const k of Object.keys(inv)) assert.ok(Math.abs((inv2[k] || 0) - inv[k]) < 1e-6, 'inventory drifted on ' + k);
}, { timeout: 120000 });

test('the first attack lands when the grace period says it should', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const grace = data.waves.grace[difficulty];
    const { g } = run((grace + 400) / 3600, { waves: true, nests: false, difficulty });
    assert.ok(g.waveNumber >= 1, `${difficulty}: nothing attacked by ${grace + 400}s`);
    const first = g.notifications.find(n => n.type === 'wave_incoming');
    assert.ok(first.time <= grace + 60, `${difficulty}: first attack at ${Math.round(first.time)}s, grace is ${grace}s`);
    assert.ok(first.time >= grace * 0.4, `${difficulty}: first attack at ${Math.round(first.time)}s is far too early`);
  }
}, { timeout: 240000 });

test('the bot holds its ground through the opening waves on easy', () => {
  const { g } = run(0.8, { waves: true, nests: false, difficulty: 'easy' });
  assert.ok(g.waveNumber >= 1, 'nothing attacked');
  assert.ok(g.stats.kills > 0, 'the defences never fired');
  assert.equal(g.lost, false, 'the bot should survive the opening waves on easy');
  assert.ok(g.structures.filter(s => s.def.dps && s.def.category === 'defence').length >= 4, 'it should have put up some turrets');
}, { timeout: 180000 });

test('it plays every planet archetype without falling over', () => {
  for (const p of planets.list()) {
    const { g } = run(0.5, { planet: p });
    assert.equal(g.lost, false, p.archetype + ' run died');
    assert.ok(g.structures.filter(s => s.state === 'done').length >= 8, `${p.archetype}: only ${g.structures.length} buildings`);
    assert.ok(g.stats.produced.iron_ingot > 0, p.archetype + ' never smelted anything');
  }
}, { timeout: 300000 });

test('the build programme is well formed', () => {
  for (const step of PLAN) {
    const keys = Object.keys(step);
    assert.ok(keys.length >= 1, 'empty step');
    if (step.build) assert.ok(data.structure[step.build], 'unknown structure ' + step.build);
    if (step.recipe) assert.ok(data.recipe[step.recipe], 'unknown recipe ' + step.recipe);
    if (step.drill) assert.ok(data.resource[step.drill], 'unknown resource ' + step.drill);
    if (step.build || step.recipe || step.drill) assert.ok(step.n > 0, 'step needs a count: ' + JSON.stringify(step));
  }
});
