// node --test prototypes/frontier-foundry/tests/sim.test.js
// The bot has to be able to actually play: land, dig, smelt, wire up a grid, research, and hold a
// line. These are the milestones the balance sim (tools/sim-foundry.mjs) is checked against.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadData } from '../js/data.js';
import { Game } from '../js/game.js';
import { Bot, PLAN } from '../js/ai.js';
import { localPlanets, generatePlanetMap, makePlanet } from '../js/planets.js';

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

// ---------------------------------------------------------------- rare elements and the milestone
// Added with the rare-element and balance pass.

test('a world that carries a rare element can actually work it: patch, research, building', () => {
  // one representative archetype per element, chosen from the resource's own `found.archetypes`
  for (const element of ['helion_gas', 'nullstone', 'emberlace', 'brinepearl', 'ferrovine', 'voltaic_ore']) {
    const homes = data.resource[element].found.archetypes;
    let played = 0;
    for (const archetype of homes) {
      // a few seeds, because only one or two of an archetype's pool land on any one world
      for (let seed = 1; seed <= 8 && played < 1; seed++) {
        const planet = makePlanet({ id: 'r' + seed, seed, archetype, resourceTable: data.resources });
        if (!planet.rareElements.includes(element)) continue;
        played++;
        const g = Game.createSync({ seed, difficulty: 'normal', data, planets, planet, size: 96, nests: false });
        g.flags.noWaves = true;
        assert.ok(g.planetHas(element), `${archetype}/${seed} says it has ${element} but planetHas says no`);
        assert.ok(g.map.nodes.some(n => n.resource === element), `${archetype}/${seed} put no ${element} patch on the map`);
        // its research node is legal here, and the building it opens can be placed once it is done
        const tech = data.techs.find(t => t.planetRequirement === element);
        assert.ok(tech, element + ' has no research node');
        const reason = g.canResearch(tech.id);
        assert.ok(reason.ok || !String(reason.reason).includes('only on a world'), `${tech.id} is refused on a world that has ${element}: ${reason.reason}`);
        for (const id of tech.unlocks) {
          const def = data.structure[id];
          if (!def?.planetRequirement) continue;
          assert.equal(g.canPlace(id, 4, 4, { ignoreCost: true, ignoreUnlock: true }).reason !== `this world has no ${element}`, true,
            `${id} is refused on a world that has ${element}`);
        }
      }
    }
    assert.ok(played > 0, `no seed of ${homes.join('/')} ever rolled ${element} - it is content nobody can reach`);
  }
}, { timeout: 300000 });

test('a scarce resource always has a patch, and the starter patches never eat the last one', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const planet = planets.list()[seed % planets.list().length];
    const g = Game.createSync({ seed, difficulty: 'normal', data, planets, planet, world: worldFor(planet), size: 96, nests: false });
    const have = new Set(g.map.nodes.map(n => n.resource));
    const missing = g.planet.resources.filter(r => !have.has(r));
    assert.deepEqual(missing, [], `${planet.archetype}/seed ${seed}: the survey says this world has ${missing.join(', ')} and there is no patch of it`);
  }
}, { timeout: 120000 });

// ---------------------------------------------------------------- the milestone run
// The one test that says whether the game is actually playable end to end: the bot lands on three
// different worlds and has to get through the funnel - dig, smelt, steel, chemistry, hold a wave,
// climb the tree, build a rocket and leave - inside a six-hour budget, without losing the pod.
//
// Each world is a real `tools/sim-foundry.mjs --json` run in its own process, three at a time, so
// this costs one run's wall clock rather than three. It is the slowest thing in the project by a
// wide margin - three six-hour games, a few minutes of wall clock - and it is also the only test
// that would catch the whole game quietly stopping.
//
// **It only runs when you ask for it**: `npm run test:sim`, which sets FOUNDRY_SIM=1. Without that
// the two tests below are skipped and `npm run test:unit` runs the cheaper in-process bot tests at
// the top of this file instead, which play the same engine and the same bot for three and six hours
// on one world and cost seconds rather than minutes. Run the full thing before changing anything in
// `js/ai.js`, `data/balance.json` or the engine's tick - it is what the numbers in
// `research/sim-report.md` are taken from.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SIM = fileURLToPath(new URL('../tools/sim-foundry.mjs', import.meta.url));
/** Run one headless game and hand back its milestone JSON. Never rejects. */
function play(opts) {
  const args = [SIM, '--json', '--hours', String(opts.hours ?? 6), '--chunks', String(opts.chunks ?? 3),
    '--seed', String(opts.seed ?? 7), '--planet', opts.planet, '--difficulty', opts.difficulty ?? 'normal'];
  return new Promise(resolve => {
    const p = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('close', () => {
      const line = out.trim().split('\n').filter(l => l.startsWith('{')).pop();
      resolve(line ? JSON.parse(line) : { error: err.trim().split('\n').pop() || 'no output', planet: opts.planet });
    });
  });
}

/** The full three-world run is opt-in: `npm run test:sim` sets this. */
const FULL = process.env.FOUNDRY_SIM === '1';
const skipUnlessAsked = FULL ? false : 'three six-hour games: run `npm run test:sim` (FOUNDRY_SIM=1)';

const WORLDS = ['temperate', 'arid', 'volcanic'];
/** Every milestone the funnel is measured against, and the latest it may land. */
const FUNNEL = [
  ['drill', 300, 'a drill on a patch'],
  ['smelter', 900, 'the first iron bar'],
  ['lab', 1800, 'the second research node'],
  ['waveSurvived', 3 * 3600, 'the first attack held'],
];

/** The three runs, played once and shared by the tests below. */
const milestone = FULL ? await Promise.all(WORLDS.map(planet => play({ planet, seed: 7, difficulty: 'normal', hours: 6 }))) : [];

test('the milestone run: three worlds, six hours, and the pod is still standing', { skip: skipUnlessAsked }, () => {
  const report = [];
  for (const r of milestone) {
    assert.ok(!r.error, `${r.planet}: the run did not finish - ${r.error}`);
    assert.equal(r.lost, false, `${r.archetype}: the pod was destroyed at ${Math.round(r.lostAt / 60)} min after ${r.wavesCleared} waves held`);
    for (const [key, by, what] of FUNNEL) {
      const t = r.marks[key];
      assert.ok(t != null, `${r.archetype}: never got to ${what} in six hours (short of ${(r.worst || []).join(', ')})`);
      assert.ok(t <= by, `${r.archetype}: ${what} at ${Math.round(t / 60)} min, budget is ${Math.round(by / 60)} min`);
    }
    assert.ok(r.tech >= 25, `${r.archetype}: only ${r.tech} research nodes in six hours`);
    assert.ok(r.built >= 200, `${r.archetype}: only ${r.built} buildings in six hours`);
    report.push(`${r.archetype}: ${r.tech} nodes, ${r.wavesCleared}/${r.waves} waves held, ${r.built} buildings, steel at ${r.marks.steel == null ? 'never' : Math.round(r.marks.steel / 60) + ' min'}`);
  }
  console.log('    ' + report.join('\n    '));
});

// The bar the whole prototype is aimed at: a launch inside six hours on normal, on every one of the
// three worlds. It was a todo for two rounds - the bot got to the launch pad and no further, because
// the top of the chain (alloy plate, superalloy, control units, heat shields, rocket fuel) is fed by
// single scarce seams and it spent every plate the moment it landed. The reservation ledger in
// `js/ai.js` fixed the spending, and a dozen places the bot quietly gave up (pole lines and store
// rescues dropped by the queue cap, "first N" retry lists, machines that could not run counted as
// capacity, a full route list, a placement search that stopped at 90 tiles) are what actually got a
// rocket off; research/sim-report.md §0 has the before and after. The margin is thin - volcanic
// launches at 05:37 - so a failure here after a bot change is real news, not flakiness.
test('the milestone run reaches a rocket launch on all three worlds', { skip: skipUnlessAsked }, () => {
  for (const r of milestone) {
    assert.ok(r.marks.launch != null, `${r.archetype}: no launch in six hours (short of ${(r.worst || []).join(', ')})`);
  }
});
