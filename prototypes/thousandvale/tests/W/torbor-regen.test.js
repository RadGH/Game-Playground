// Play-test 12 (#81) — Torbor Downs regenerated (docs/TORBOR-REGEN.md, tools/lib/torbor.mjs).
//
//   1. js/sim/safe-spot.js on hand-made ground: a good spot stays, sea / cliff / wall / building move to the nearest good
//      ground, nothing near -> null (the caller then sends you to the nearest town).
//   2. Every position a character could have been SAVED at on the OLD map (tests/W/fixtures/torbor-old-spots.json: 816
//      spots — random wilds, the old block edge where the new coast runs, beside town buildings) wakes on good ground on the
//      NEW map: dry or wadeable, walkable, not inside anything solid, within 160 m (or in the nearest town).
//   3. The real realm: a character saved standing where the sea now is logs back in on the shore beside it.
//   4. The regenerated island is what the owner asked for: several biomes per zone, more relief than before but plains
//      kept, a coastline inside the old square, every town where it was (same plots), Torborhold still the start.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeSpot, spotProblem, nearestTown } from '../../js/sim/safe-spot.js';
import { loadProvinceContent } from '../../js/sim/content.js';
import { parseTerrain, parseNav } from '../../js/rules/terrain-read.js';
import { createProvinceTerrain } from '../../js/sim/province-terrain.js';
import { buildLayout } from '../../js/sim/realm.js';
import { vignetteContent } from '../../js/sim/vignettes.js';
import { createWorld } from '../../js/sim/world.js';
import { createLoopbackServer } from '../../js/sim/loopback.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { createVirtualClock } from '../../js/net/clock.js';
import { memoryTokenStore } from '../../js/net/client.js';
import { makeClient, run, until, waitP } from '../A/helpers.js';

const root = new URL('../../', import.meta.url);
const J = f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const readJson = async f => J(f);
const readBytes = async f => readFileSync(new URL(f, root));

// ---------------------------------------------------------------------------------------------------- 1. pure
/** A 200 m square: sea west of x = 40, a wall at x = 100..102, a cliff at z > 170, a building at (150, 50) r 6. */
function toyGround() {
  const W = { kind: 'none', depth: 0 };
  return {
    inBounds: (x, z) => x >= 0 && z >= 0 && x <= 200 && z <= 200,
    waterAt: (x, z) => (x < 40 ? { kind: 'sea', depth: x < 30 ? 3 : 0.5 } : W),
    moveAt: (x, z) => (x < 0 || z < 0 || x > 200 || z > 200 ? 'out' : x < 30 ? 'swim' : z > 170 ? 'steep' : x < 40 ? 'wade' : 'walk'),
    nav: { at: (x, z) => ((x >= 100 && x <= 102) || Math.hypot(x - 150, z - 50) < 6 ? 128 : 0) },
  };
}
test('safe spot: good ground stays; sea, cliff, wall and building move to the nearest good ground', () => {
  const t = toyGround();
  assert.deepEqual(safeSpot(t, { x: 60, z: 60 }), { x: 60, z: 60, moved: false, why: null });
  for (const [at, why] of [[{ x: 10, z: 60 }, 'deep'], [{ x: 35, z: 60 }, 'sea'], [{ x: 101, z: 60 }, 'solid'], [{ x: 150, z: 50 }, 'solid'], [{ x: 60, z: 185 }, 'steep']]) {
    assert.equal(spotProblem(t, at.x, at.z), why, JSON.stringify(at));
    const s = safeSpot(t, at);
    assert.ok(s && s.moved && s.why === why, JSON.stringify(s));
    assert.equal(spotProblem(t, s.x, s.z), null, 'the new spot is good: ' + JSON.stringify(s));
    assert.ok(Math.hypot(s.x - at.x, s.z - at.z) <= 40, 'and near: ' + JSON.stringify(s));
  }
  assert.equal(safeSpot(t, { x: -500, z: -500 }, { maxR: 100, farR: 100 }), null, 'nothing within reach: the caller sends you to town');
  assert.equal(nearestTown([{ x: 0, z: 0, r: 50 }, { x: 900, z: 900, r: 80 }], { x: 700, z: 800 }), 1);
});

// ---------------------------------------------------------------------------------------------------- 2. old spots
const C = await loadProvinceContent(readJson, readBytes, 'torbor_downs', { parseTerrain, parseNav, createProvinceTerrain });
const T = C.terrain;
const OLD = J('tests/W/fixtures/torbor-old-spots.json').spots;

test('every spot saved on the OLD Torbor Downs wakes on good ground on the NEW map', () => {
  const stats = { kept: 0, moved: 0, town: 0, by: {} };
  let far = 0;
  for (const p of OLD) {
    const s = safeSpot(T, p);
    if (!s) { stats.town++; continue; }                       // province.js: the nearest town's own spawn
    assert.equal(spotProblem(T, s.x, s.z), null, `${p.kind} ${p.x},${p.z} -> ${s.x},${s.z}`);
    if (s.moved) { stats.moved++; stats.by[s.why] = (stats.by[s.why] || 0) + 1; far = Math.max(far, Math.hypot(s.x - p.x, s.z - p.z)); } else stats.kept++;
  }
  console.log('old spots on the new map:', JSON.stringify(stats), 'furthest move', far.toFixed(0), 'm');
  assert.ok(stats.kept > OLD.length * 0.5, 'most old spots are still fine where they are');
  assert.ok(stats.town < OLD.length * 0.05, 'and almost nobody needs carrying to a town: ' + stats.town);
});

// ---------------------------------------------------------------------------------------------------- 3. the realm
test('a character saved where the sea now is logs back in on the shore beside it', async () => {
  const L = buildLayout({ key: 'torbor_downs', name: C.name, terrain: T, zones: C.zones, encounterInfo: C.encounterInfo, vignetteContent, starter: C.starter, horizon: C.horizon, extra: C.extra });
  const wet = OLD.find(p => p.kind === 'coast' && spotProblem(T, p.x, p.z) === 'deep' && safeSpot(T, p)) || OLD.find(p => spotProblem(T, p.x, p.z) && safeSpot(T, p));
  assert.ok(wet, 'an old spot the new coast took');
  const clock = createVirtualClock(), store = createMemoryStore({ now: clock.now });
  const world = createWorld({ store, layouts: [L], now: clock.now, lingerMs: 0, log: () => {}, roadEvents: false, travellers: false, events: [], encounterInfo: C.encounterInfo, newcomer: { underLevel: 0, firstMinutes: 0 } });
  const srv = createLoopbackServer({ clock, world }); await srv.ready;
  const tokenStore = memoryTokenStore(), c = makeClient(srv, clock, { tokenStore });
  await waitP(clock, c.ready);
  const ch = await waitP(clock, c.createChar({ name: 'Drowned', cls: 'warrior' }));
  await waitP(clock, c.play(ch.id)); await until(clock, () => !!c.joined, 8000);
  const o = world.online.get(ch.id), pv = world.P.get('torbor_downs');
  world.transfer(o, pv.copies[0], { x: wet.x, z: wet.z }, 'test'); await run(clock, 300);
  c.close(); await run(clock, 2000); await until(clock, () => !world.online.has(ch.id), 8000);
  const c2 = makeClient(srv, clock, { tokenStore });
  await waitP(clock, c2.ready); await waitP(clock, c2.play(ch.id)); await until(clock, () => !!c2.joined, 8000);
  const e = world.online.get(ch.id).entity;
  assert.equal(spotProblem(T, e.x, e.z), null, `woke on good ground: ${e.x.toFixed(1)}, ${e.z.toFixed(1)} (saved ${wet.x}, ${wet.z})`);
  assert.ok(Math.hypot(e.x - wet.x, e.z - wet.z) < 805, 'beside where they were, not carried across the island');
  c2.close(); await srv.stop();
});

// ---------------------------------------------------------------------------------------------------- 4. the island
const ZONES = Object.values(J('data/world/province-map.json').provinces.torbor_downs.map);
test('the regenerated island: several biomes, more hills but plains kept, a real coast, towns where they were', () => {
  const names = new Set(), zoneTop = [];
  let sea = 0, steep = 0, gentle = 0, n = 0;
  for (const z of ZONES) {
    const t = parseTerrain(readFileSync(new URL(`data/zones/${z}/terrain.bin`, root)));
    assert.equal(t.meta.palette, 'downs', z + ' is drawn with the downs palette');
    const count = {};
    for (let y = 8; y < 2048; y += 32) for (let x = 8; x < 2048; x += 32) {
      n++;
      const w = t.waterAt(x, y); if (w.kind === 'sea') { sea++; continue; } if (w.kind !== 'none') continue;
      const k = t.biomes[t.biomeAt(x, y)].key, nm = t.meta.biomeNames?.[k]; if (nm) { names.add(nm); count[nm] = (count[nm] || 0) + 1; }
      const s = t.slopeAt(x, y); if (s > 15) steep++; if (s < 5) gentle++;
    }
    const tot = Object.values(count).reduce((a, b) => a + b, 0);
    zoneTop.push(Math.max(...Object.values(count)) / tot);
  }
  assert.ok(names.size >= 10, 'ten or more biomes on the island: ' + [...names].join(', '));
  assert.ok(zoneTop.filter(v => v < 0.75).length >= 12, 'most zones are a mix, not one biome: ' + zoneTop.map(v => v.toFixed(2)).join(' '));
  assert.ok(sea / n > 0.04, 'the sea comes inside the old square: ' + (sea / n).toFixed(3));
  assert.ok(steep / n > 0.3, 'more hills: ' + (steep / n).toFixed(3));
  assert.ok(gentle / n > 0.08, 'plains and valleys kept: ' + (gentle / n).toFixed(3));
  // towns: every settlement pinned where the old bake had it
  const pins = J('data/world/town-pins.json');
  for (const z of ZONES) for (const [name, p] of Object.entries(pins[z] || {})) {
    const s = J(`data/zones/${z}/placements.json`).placements.find(q => q.kind === 'settlement' && q.data.name === name);
    assert.ok(s && s.x === p.x && s.z === p.z, `${name} (${z}) stays at ${p.x}, ${p.z}`);
  }
  assert.ok(J('data/zones/z12_02/placements.json').placements.some(p => p.kind === 'settlement' && p.data.hub && p.data.name === 'Torborhold'), 'Torborhold is still the hub of the start zone');
});
