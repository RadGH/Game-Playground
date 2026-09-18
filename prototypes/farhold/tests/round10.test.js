// node --test prototypes/farhold/tests/round10.test.js
//
// Round 10 is the play-test list: a level-1 character who is not dropped into a level-30 zone, a
// perk tree you can click and zoom, a ship whose W key goes forward, planet sizes that are actually
// small, and a save that comes back where you left it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  createWorld, createSystem, chooseLanding, isHabitableStart, landableBodies, bandsInSystem,
  makeTerrain, setMetresPerCell, M_PER_CELL_DEFAULT,
} from '../js/planet.js';
import { PLANET_BANDS, bandForPlanet, planetThreat } from '../js/rpg.js';
import { buildForest, RINGS, ringStep } from '../js/perks.js';
import { buildZones } from '../js/zones.js';
import { snapshot, restore, saveCarriesWorld } from '../js/save.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const balance = read('../data/balance.json');
const html = readFileSync(join(here, '../index.html'), 'utf8');

const SEEDS = [1, 2, 3, 4, 7, 11, 19, 42, 77, 123, 777, 1337];

// ---------------------------------------------------------------- 1. where a level-1 character lands

test('a new character always starts on a level-1 world', () => {
  for (const seed of SEEDS) {
    for (const habitable of [true, false]) {
      const { planet } = createWorld({ seed, habitable, width: 16, height: 8 });
      const band = bandForPlanet(planet);
      assert.equal(band.key, 'low',
        `seed ${seed} (habitable ${habitable}) started on ${planet.name}, band ${band.key}`);
      assert.equal(band.min, 1, 'the starting band has to begin at level 1');
    }
  }
});

test('the zone a new character stands in starts at level 1, not 30', () => {
  for (const seed of SEEDS.slice(0, 6)) {
    const { planet, world } = createWorld({ seed, habitable: true, width: 96, height: 48 });
    const terrain = makeTerrain(world, planet, balance.terrain);
    const band = bandForPlanet(planet);
    const spawn = terrain.spawnPoint();
    const zones = buildZones(world, {
      spawn: [spawn.x, spawn.z], maxLevel: band.max, startLevel: band.min,
      bandWidth: balance.zones?.bandWidth ?? 4,
    });
    const home = zones.at(spawn.x, spawn.z);
    assert.ok(home, `seed ${seed} has no zone under the spawn`);
    assert.equal(home.minLevel, 1, `seed ${seed} put a level-1 character in a level-${home.minLevel} zone`);
  }
});

test('every system has somewhere to go at every level', () => {
  for (const seed of SEEDS) {
    const { system } = createSystem({ seed });
    const bands = bandsInSystem(system);
    assert.equal(bands.length, PLANET_BANDS.length,
      `seed ${seed} only offers ${bands.join(', ')}`);
    assert.ok(landableBodies(system).length >= PLANET_BANDS.length,
      `seed ${seed} has fewer landable bodies than bands`);
  }
});

test('the starting system always holds a world you can live on', () => {
  for (const seed of SEEDS) {
    // whether or not the title screen's box is ticked — the box only decides where you LAND
    for (const habitable of [true, false]) {
      const { system } = createWorld({ seed, habitable, width: 16, height: 8 });
      assert.ok(landableBodies(system).some(isHabitableStart),
        `seed ${seed} (habitable ${habitable}) has nowhere settled in the starting system`);
    }
  }
});

test('a band comes from what a world is, never from a coin flip', () => {
  // the old rule read `seed % 3`, so two worlds identical in every way a player can see came out in
  // different bands. Nothing but the listed properties may move the score.
  const base = {
    difficulty: 0.3, archetype: 'jungle',
    atmosphere: { breathable: true }, orbit: { inZone: true, beyondFrost: false },
  };
  const a = planetThreat({ ...base, seed: 3, id: 3 });
  const b = planetThreat({ ...base, seed: 4, id: 4 });
  assert.equal(a, b, 'the seed is still moving the band');
  assert.equal(bandForPlanet({ ...base, seed: 3 }).key, 'low');

  // and the genuinely nasty archetypes are the real keys, so they actually bite
  for (const archetype of ['voidTouched', 'lava', 'toxic', 'crystal']) {
    const nasty = bandForPlanet({
      difficulty: 0.85, archetype, atmosphere: { breathable: false },
      orbit: { inZone: false, beyondFrost: true },
    });
    assert.equal(nasty.key, 'high', `${archetype} should be a deep-dark world`);
  }
  // `forcedBand` still wins, because that is how a system guarantees its spread
  assert.equal(bandForPlanet({ forcedBand: 'medium', difficulty: 0.1 }).key, 'medium');
});

// ---------------------------------------------------------------- 2 + 3. the perk forest

test('the forest is a lattice: even rings, even angles, no jitter', () => {
  const forest = buildForest();
  assert.equal(forest.nodes.length, 89, 'the node count should not have moved');

  // every node sits exactly on its ring
  for (const node of forest.nodes) {
    if (node.kind === 'hub') { assert.equal(Math.hypot(node.x, node.y), 0); continue; }
    const r = Math.hypot(node.x, node.y);
    const wanted = node.oddball ? [3, 5] : [RINGS.find(x => x.at === node.ring)?.radius];
    assert.ok(wanted.some(w => Math.abs(r - w) < 1e-9),
      `${node.id} is at radius ${r.toFixed(3)}, not ${wanted.join(' or ')}`);
  }

  // and the gap between neighbours on one ring is the same all the way along it
  for (const ring of RINGS) {
    if (ring.per < 3) continue;
    const step = ringStep(ring.radius, ring.per);
    const arm = forest.nodes.filter(n => n.ring === ring.at && n.arm === 'melee' && !n.oddball);
    assert.equal(arm.length, ring.per);
    const gaps = [];
    for (let i = 1; i < arm.length; i++) gaps.push(Math.hypot(arm[i].x - arm[i - 1].x, arm[i].y - arm[i - 1].y));
    for (const g of gaps) assert.ok(Math.abs(g - gaps[0]) < 1e-9, `ring ${ring.at} has uneven gaps`);
    assert.ok(step > 0);
  }
});

test('nothing in the forest sits on top of anything else', () => {
  const forest = buildForest();
  let worst = Infinity, pair = '';
  for (let i = 0; i < forest.nodes.length; i++) {
    for (let j = i + 1; j < forest.nodes.length; j++) {
      const d = Math.hypot(forest.nodes[i].x - forest.nodes[j].x, forest.nodes[i].y - forest.nodes[j].y);
      if (d < worst) { worst = d; pair = `${forest.nodes[i].id} / ${forest.nodes[j].id}`; }
    }
  }
  // the old layout put four of the eight oddballs exactly on an arm centreline, on top of an arm node
  assert.ok(worst > 0.4, `${pair} are only ${worst.toFixed(3)} apart`);
});

test('an oddball is between the arms, not on one', () => {
  const forest = buildForest();
  const armAngles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  for (const node of forest.nodes.filter(n => n.oddball)) {
    const angle = Math.atan2(node.y, node.x);
    for (const arm of armAngles) {
      let diff = Math.abs(((angle - arm + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      assert.ok(diff > 0.6, `${node.id} is only ${diff.toFixed(2)} rad off an arm`);
    }
  }
});

test('the perk screen offers a zoom and says how to use it', () => {
  assert.match(html, /id="perk-fit"/, 'there is no "fit to view" button');
  assert.match(html, /scroll to zoom/, 'nothing tells the player the tree zooms');
});

// ---------------------------------------------------------------- 5. flying

test('a position already on the map comes back out of the wrap unchanged', () => {
  // this is the whole flight bug: `((x % w) + w) % w` loses a low bit, and atmos.js read any change
  // as "you hit the edge of the map" and braked. 68% of in-range values used to fail this.
  setMetresPerCell(M_PER_CELL_DEFAULT);
  const { planet, world } = createWorld({ seed: 1, habitable: true, width: 64, height: 32 });
  const terrain = makeTerrain(world, planet, balance.terrain);
  let fails = 0;
  for (let i = 0; i < 20000; i++) {
    const x = (i / 20000) * terrain.widthM * 0.999 + 0.0001;
    const z = (i % 977) / 977 * terrain.depthM;
    const [wx, wz] = terrain.clampToWorld(x, z);
    if (wx !== x || wz !== z) fails++;
  }
  assert.equal(fails, 0, `${fails} in-range positions were reported as off the map`);
});

test('the planet wraps over its poles, so a heading held long enough goes round', () => {
  setMetresPerCell(M_PER_CELL_DEFAULT);
  const { planet, world } = createWorld({ seed: 1, habitable: true, width: 64, height: 32 });
  const terrain = makeTerrain(world, planet, balance.terrain);
  const { widthM, depthM } = terrain;

  // straight over the top: half a world round in longitude, and turned about
  const over = terrain.wrapAround(1000, -500);
  assert.ok(Math.abs(over.z - 500) < 1e-6, 'crossing the pole should mirror the latitude');
  assert.ok(Math.abs(over.x - (1000 + widthM / 2)) < 1e-6, 'and shift longitude half a world');
  assert.ok(over.turn > 0, 'and turn the ship around');

  // and out the bottom
  const under = terrain.wrapAround(1000, depthM + 300);
  assert.ok(Math.abs(under.z - (depthM - 300)) < 1e-6);
  assert.ok(under.turn > 0);

  // east and west are the same line, and no turn happens there
  const east = terrain.wrapAround(widthM + 250, 4000);
  assert.ok(Math.abs(east.x - 250) < 1e-6, 'longitude should wrap');
  assert.equal(east.turn, 0, 'the seam is not a pole');

  // anything already inside comes back untouched
  const inside = terrain.wrapAround(12345.678, 4321.5);
  assert.equal(inside.x, 12345.678);
  assert.equal(inside.z, 4321.5);
  assert.equal(inside.turn, 0);
});

// ---------------------------------------------------------------- 6. how big a planet is

test('the title screen offers a tiny and a super tiny world, and starts small', () => {
  const options = [...html.matchAll(/<option value="([\d.]+)"( selected)?>([^<]*)<\/option>/g)]
    .filter(m => /km/.test(m[3]));
  const values = options.map(m => Number(m[1]));
  assert.ok(values.includes(0.2), 'no "tiny" option');
  assert.ok(values.includes(0.1), 'no "super tiny" option');
  const chosen = options.find(m => m[2]);
  assert.ok(chosen && Number(chosen[1]) <= 0.35,
    'the default planet should not be the biggest one — that was the complaint');

  // and every label's kilometre figure matches the maths the code actually does
  for (const m of options) {
    const mpc = Math.max(16, Math.round(M_PER_CELL_DEFAULT * Number(m[1])));
    const km = Math.round((balance.world?.width ?? 256) * mpc / 1000);
    const said = Number(m[3].match(/(\d+)\s*×/)?.[1]);
    assert.ok(Math.abs(km - said) <= 2, `"${m[3].trim()}" should say about ${km} km`);
  }
});

test('a smaller planet really is smaller, all the way down', () => {
  const sizes = [];
  for (const scale of [1, 0.55, 0.35, 0.2, 0.1]) {
    setMetresPerCell(M_PER_CELL_DEFAULT * scale);
    const { planet, world } = createWorld({ seed: 1, habitable: true, width: 64, height: 32 });
    const terrain = makeTerrain(world, planet, balance.terrain);
    sizes.push({ scale, width: terrain.widthM, cell: terrain.metresPerCell });
  }
  for (let i = 1; i < sizes.length; i++) {
    assert.ok(sizes[i].width < sizes[i - 1].width * 0.95,
      `scale ${sizes[i].scale} is not meaningfully smaller than ${sizes[i - 1].scale}`);
  }
  assert.equal(sizes.at(-1).cell, 64, 'super tiny should be 64 m a cell');
  setMetresPerCell(M_PER_CELL_DEFAULT);
});

test('the things placed by map cell follow the planet size', () => {
  // js/sites.js and js/dungeon.js both read a hard-coded 640 from balance.json, so at any other
  // scale a camp or a dungeon door landed outside the world entirely.
  for (const file of ['../js/sites.js', '../js/dungeon.js']) {
    const src = readFileSync(join(here, file), 'utf8');
    assert.ok(!/balance\.world\?\.metresPerCell/.test(src),
      `${file} is still reading the stale cell size out of balance.json`);
    assert.match(src, /terrain\.metresPerCell/, `${file} should use the live cell size`);
  }
});

// ---------------------------------------------------------------- 7. saving and loading

/** The smallest thing that looks like the live objects `snapshot` is handed. */
function fakeRun(overrides = {}) {
  return {
    id: 'sv_test', name: 'Wren', seed: 1, classId: 'ranger',
    player: {
      level: 4, xp: 500, gold: 120, attrs: { might: 3 }, pendingAttr: 1, hp: 50, mp: 10,
      kills: 7, deaths: 0, equipment: {}, bag: [], passiveRanks: {}, pendingPassive: 0,
      pendingTalent: 0, talents: [], vehicles: {},
    },
    control: { x: 63380, z: 30080, yaw: 1.2, pitch: -0.1 },
    elapsed: 400, playtime: 3600, markers: { list: [] },
    at: { systemSeed: 2, starId: 0, planetId: 3, starName: 'A', planetName: 'B' },
    place: 'Herdalkeep', weather: 'clear', materials: { scrap: 4 }, dungeonsCleared: ['d1'],
    world: { regionScale: 2, bandWidth: 4, density: 1, planetScale: 0.35, habitable: true },
    quests: { active: [{ id: 'q1' }] },
    campaign: { visited: ['B'] },
    ...overrides,
  };
}

test('a save carries the world it was played on', () => {
  const s = snapshot(fakeRun());
  assert.ok(s.world, 'the world knobs were dropped again');
  assert.equal(s.world.planetScale, 0.35);
  assert.equal(s.world.regionScale, 2);
  assert.ok(saveCarriesWorld(s));
  // …and the two other fields that were being dropped with it
  assert.deepEqual(s.quests, { active: [{ id: 'q1' }] }, 'the quest log was dropped');
  assert.deepEqual(s.campaign, { visited: ['B'] }, 'the campaign was dropped');
  assert.equal(s.playtime, 3600);
});

test('a save written before the world travelled is flagged rather than trusted', () => {
  const old = snapshot(fakeRun({ world: null }));
  assert.equal(old.world, null);
  assert.equal(saveCarriesWorld(old), false);
});

test('loading puts you back on the spot you saved, and never in the sea', () => {
  setMetresPerCell(M_PER_CELL_DEFAULT * 0.35);
  const { planet, world } = createWorld({ seed: 1, habitable: true, width: 96, height: 48 });
  const terrain = makeTerrain(world, planet, balance.terrain);
  const spawn = terrain.spawnPoint();

  const control = {
    x: 0, z: 0, yaw: 0, pitch: 0, terrain, spawn,
    teleport(x, z) { [this.x, this.z] = terrain.clampToWorld(x, z); },
  };
  const rpg = { refresh() {} };
  const player = { attrs: {}, maxHp: 99, maxMp: 99 };

  // the good case: the exact metres come back
  const saved = snapshot(fakeRun({ control: { x: spawn.x, z: spawn.z, yaw: 0.5, pitch: 0 } }));
  restore(saved, { rpg, player, control, map: null });
  assert.ok(Math.abs(control.x - spawn.x) < 1, 'the saved position was not restored');
  assert.ok(Math.abs(control.z - spawn.z) < 1);
  assert.equal(control.yaw, 0.5);

  // a position in the sea (an older save, or a different planet size) falls back to the spawn
  let wet = null;
  for (let i = 0; i < 4000 && !wet; i++) {
    const x = (i * 977) % terrain.widthM, z = (i * 613) % terrain.depthM;
    if (terrain.waterAt(x, z)) wet = { x, z };
  }
  if (wet) {
    control.x = 0; control.z = 0;
    restore(snapshot(fakeRun({ control: { ...wet, yaw: 0, pitch: 0 } })), { rpg, player, control, map: null });
    assert.ok(Math.abs(control.x - spawn.x) < 1 && Math.abs(control.z - spawn.z) < 1,
      'a drowned save should come back at the spawn, not in the water');
  }

  // a save taken underground comes back outside the door, not at the dungeon's local origin
  control.x = 0; control.z = 0;
  const underground = snapshot(fakeRun({
    control: { x: 120, z: -40, yaw: 0, pitch: 0 },
    inDungeon: true, surface: { x: spawn.x, z: spawn.z },
  }));
  assert.equal(underground.inDungeon, true);
  restore(underground, { rpg, player, control, map: null });
  assert.ok(Math.abs(control.x - spawn.x) < 1, 'a dungeon save should surface where you went in');
  setMetresPerCell(M_PER_CELL_DEFAULT);
});
