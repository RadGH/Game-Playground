// Stream B — owner play-test 4, S7: walls round every town, gates where roads enter, facing OUT along the road.
//   node --test prototypes/thousandvale/tests/B/walls.test.js
// On the CHECKED-IN bake (zone-bake.test.js proves those files match a fresh bake), every promise in
// tools/lib/wall-checks.mjs, for every zone of Torbor Downs; then the planner on hand-made rings (the Farhold
// rotation bugs: a gate at ninety degrees to its road, a gate that faces into the town, a wall across a road); then
// the client's part list (js/client/walls-view.js) and proctown's opt-in kit pieces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { parseTerrain, parseNav, NAV } from '../../js/rules/terrain-read.js';
import { checkWalls } from '../../tools/lib/wall-checks.mjs';
import { planTownWalls, wallNav, styleFor, WALL_DEFAULTS } from '../../tools/lib/zone-walls.mjs';
import { WALL_KINDS, EXTRA_WALL_KINDS, wallKitParts, gateLeafParts, gatePostParts, grateParts, MESHES } from '../../../../proctown/js/buildkit.js';

register('../../../../avatar-3d/tests/three-loader.mjs', import.meta.url);
const ROOT = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT));
const PMAP = JSON.parse(read('data/world/province-map.json')).provinces.torbor_downs.map;
const ZONES = Object.values(PMAP);
const CFG = JSON.parse(read('data/world/town-walls.json'));
const cache = new Map();
const zone = id => {
  if (!cache.has(id)) {
    let V = []; try { V = JSON.parse(read(`data/vignettes/placements/${id}.json`)).placements || []; } catch { /* E has not placed it */ }
    cache.set(id, { t: parseTerrain(read(`data/zones/${id}/terrain.bin`)), nav: parseNav(read(`data/zones/${id}/nav.bin`)), P: JSON.parse(read(`data/zones/${id}/placements.json`)).placements, V });
  }
  return cache.get(id);
};

test('every zone: every promise a perimeter makes (gates at every road, facing out along it, nothing under a wall, walkable through every gate, solid elsewhere)', () => {
  const all = [];
  for (const id of ZONES) {
    const { t, nav, P, V } = zone(id);
    const bad = checkWalls({ P, t, nav, discs: V.filter(v => Number.isFinite(v.x)).map(v => ({ x: v.x, z: v.z, r: v.radius || 1.5, id: v.id })) });
    all.push(...bad.map(b => `${id}: ${b}`));
  }
  assert.deepEqual(all, []);
});

test('the perimeter fits the place: stone curtain + towers round a town or city, palisade round a village, fence round a hamlet, barricades on the frontier', () => {
  const by = {};
  for (const id of ZONES) for (const w of zone(id).P.filter(p => p.kind === 'town_wall')) by[w.data.name] = { ...w.data, zone: id };
  const T = by.Torborhold;
  assert.equal(T.style, 'curtain'); assert.equal(T.material, 'stone'); assert.ok(T.towers.length >= 6, 'Torborhold has towers');
  assert.ok(T.gates.filter(g => g.kind === 'gatehouse').length >= 2, 'Torborhold has gatehouses');
  for (const w of Object.values(by)) {
    if (['city', 'capital'].includes(w.settlement)) assert.equal(w.tier, 'wall', `${w.name} is a city with no curtain`);
    if (w.settlement === 'town') assert.ok(['curtain', 'stockade'].includes(w.style), `${w.name}: ${w.style}`);
    if (w.settlement === 'village') assert.ok(['palisade', 'barricade'].includes(w.style), `${w.name}: ${w.style}`);
    if (w.settlement === 'hamlet') assert.ok(['fence', 'hedge', 'barricade'].includes(w.style), `${w.name}: ${w.style}`);
    if (w.tier === 'wall' && w.style !== 'palisade') assert.ok(w.towers.length >= 2, `${w.name}: a curtain with no towers`);
  }
  // the frontier and the blight build differently from the heartland
  assert.equal(by.Redcliff.style, 'stockade');
  assert.equal(by['Last Lantern'].style, 'stockade');
  assert.ok(['Cinder Farm', 'Ravenhaven', 'Bipetwatch', 'Thornwick', 'Burnt Barns'].every(n => by[n].style === 'barricade'));
  assert.ok(Object.values(by).filter(w => w.style === 'fence').length >= 8);
  // styles come from the data file
  assert.equal(styleFor({ kind: 'hamlet' }, { archetype: 'blight', cfg: CFG }).key, 'barricade');
  assert.equal(styleFor({ kind: 'town' }, { archetype: 'heartland', culture: 'dwarf', cfg: CFG }).material, 'cutstone');
});

test('the gates the owner walks through first: Torborhold\'s, at Barrow Lane, the Wamonhold road and the west roads', () => {
  const { P } = zone('z12_02');
  const T = P.find(p => p.kind === 'town_wall' && p.data.town === 'torborhold').data;
  assert.ok(T.gates.length >= 3);
  const north = T.gates.find(g => g.way === 'lane_torbor_north');
  assert.ok(north && north.kind === 'gatehouse', 'Barrow Lane comes in through a gatehouse');
  assert.ok(north.out[1] < -0.9, 'and that gate faces north, up the lane');
  // the west gate takes three roads: the two that do not own it are led round to it
  const west = T.gates.find(g => g.led.length >= 1);
  assert.ok(west, 'roads arriving side by side share one gate');
  assert.ok(west.approaches.some(a => a.led), 'the led roads are painted to it');
});

// --------------------------------------------------------------------------------- the planner on hand-made rings
function ring({ roads = [], kind = 'town', archetype = 'heartland', culture = 'human', wet = () => false } = {}) {
  const plan = { origin: { x: 500, z: 500 }, town: { name: 'Testby', kind, radius: 90 }, culture, wall: null, wallRadius: 0,
    plots: [{ cx: 0, cz: 0, w: 60, d: 60, angle: 0 }], streets: [] };
  return planTownWalls({ plans: [plan], ways: roads, groundAt: () => 10, wetAt: wet, archetype, cfg: CFG })[0];
}
const straight = (id, x0, z0, x1, z1, width = 6) => ({ id, kind: 'road', width, pts: [[x0, z0], [x1, z1]] });

test('planner: a road straight in gets one gatehouse on it, facing out along it, its doors inside', () => {
  const w = ring({ roads: [straight('r', 500, 500, 500, 900)] });       // due +z out of the middle
  assert.equal(w.gates.length, 1);
  const g = w.gates[0];
  assert.equal(g.kind, 'gatehouse');
  assert.ok(Math.abs(g.x - 500) < 0.01 && g.z > 500, 'on the road');
  assert.ok(Math.abs(g.out[0]) < 1e-3 && g.out[1] > 0.999, 'facing +z, the way out');
  assert.ok(Math.abs(g.yaw) < 1e-3, 'yaw = atan2(dx, dz) of the way out');
  assert.ok(g.pass >= 6, 'the passage takes the road');
});

test('planner: a road crossing the ring at a slant gets a gate turned to the ROAD, not to the wall', () => {
  // a road that misses the centre by 35 m: it crosses the ring at ~30 degrees off radial, twice
  const w = ring({ roads: [straight('r', 465, 300, 465, 700)] });
  assert.equal(w.gates.length, 2);
  for (const g of w.gates) {
    assert.ok(Math.abs(Math.abs(g.out[1]) - 1) < 1e-3, 'out runs along the road (z)');
    assert.ok(g.out[0] * (g.x - 500) + g.out[1] * (g.z - 500) > 0, 'and away from the town');
    assert.ok(g.slant > 0.3, 'this is the slanted case');
  }
  assert.ok(w.gates.some(g => g.out[1] > 0) && w.gates.some(g => g.out[1] < 0), 'one gate each way');
});

test('planner: nothing under a wall — no run within reach of a road; a stream through the ring gets a grate; a ring with no road still has a gate', () => {
  const w = ring({ roads: [straight('a', 500, 500, 900, 500), straight('b', 500, 500, 500, 100, 3.5)] });
  const segs = w.runs.flatMap(r => r.slice(1).map((b, k) => [r[k], b]));
  const sd = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
  for (const [a, b] of segs) for (let x = 500; x <= 900; x += 0.5) assert.ok(sd(x, 500, a, b) > 3 + w.thick / 2, 'wall on road a');
  const wet = ring({ roads: [straight('a', 500, 500, 900, 500)], wet: (x, z) => z > 490 && z < 498 && x < 500 });
  assert.ok(wet.openings.some(o => o.kind === 'water' && o.grate), 'a narrow stream gets a grate');
  const lone = ring({ roads: [] });
  assert.equal(lone.gates.length, 1, 'a place no road reaches still has a way in');
  // nav: the runs are solid, the passage is not
  const S = 512, bits = new Uint8Array(S * S);
  wallNav([w], { SIZE: S, STEP: 2, mark: (i, j) => { bits[j * S + i] = 1; } });
  const at = (x, z) => bits[Math.round(z / 2) * S + Math.round(x / 2)];
  const g = w.gates.find(q => q.way === 'a');
  for (let s = -6; s <= 6; s += 0.5) assert.equal(at(g.x + g.out[0] * s, g.z + g.out[1] * s), 0, 'the passage is open in nav');
  const r0 = w.runs[0], m = Math.floor(r0.length / 2);
  assert.equal(at(r0[m][0], r0[m][1]), 1, 'the wall is solid in nav');
});

test('kit: barricade pieces, gate leaves, posts and grates are opt-in (Farhold\'s WALL_KINDS unchanged) and well formed', () => {
  assert.deepEqual(WALL_KINDS, ['stone', 'cutstone', 'palisade', 'hedge', 'bone', 'mudbrick']);
  assert.deepEqual(EXTRA_WALL_KINDS, ['barricade']);
  const finite = p => [p.x, p.y, p.z, p.w, p.h, p.d].every(Number.isFinite) && p.w > 0 && p.h > 0 && p.d > 0 && MESHES.includes(p.mesh);
  for (const piece of ['wall', 'tower', 'gatehouse']) assert.ok(wallKitParts('barricade', piece).every(finite), piece);
  for (const k of ['door', 'rail', 'frise']) assert.ok(gateLeafParts(k).every(finite), k);
  for (const k of ['rail', 'hedge', 'stake', 'barricade']) {
    const parts = gatePostParts(k, 5);
    assert.ok(parts.every(finite), k);
    // nothing in the passage
    for (const p of parts) assert.ok(Math.abs(p.x) - p.w / 2 >= 2.5 - 1e-6 || p.y >= 4.9, `${k} post in the passage at x ${p.x}`);
  }
  assert.ok(grateParts(8, 2.4).every(finite));
  // the barricade gatehouse keeps the gatehouse rule
  for (const p of wallKitParts('barricade', 'gatehouse')) assert.ok(Math.abs(p.x) - p.w / 2 >= 2.1 - 1e-6, 'barricade gate in the passage');
});

test('client: walls-view plans pieces, towers, open doors and grates from the baked records', async () => {
  const { planWalls } = await import('../../js/client/walls-view.js');
  const { P } = zone('z12_02');
  const plan = planWalls(P, { ox: 0, oz: 0, groundAt: () => 50 });
  assert.equal(plan.stats.towns, P.filter(p => p.kind === 'town_wall').length);
  assert.ok(plan.stats.pieces > 60 && plan.stats.towers >= 6 && plan.stats.gates >= 4, JSON.stringify(plan.stats));
  assert.ok(plan.parts.every(p => [p.x, p.y, p.z, p.w, p.h, p.d, p.yaw].every(Number.isFinite)));
  assert.ok(plan.fires.length >= 4, 'torches at the gatehouses');
  // the doors of Barrow Lane's gate stand open INTO the town: every door part is on the inside of the gate line
  const T = P.find(p => p.kind === 'town_wall' && p.data.town === 'torborhold').data;
  const g = T.gates.find(q => q.way === 'lane_torbor_north');
  const doors = plan.parts.filter(p => p.colour === '#7a5a3c' && Math.hypot(p.x - g.x, p.z - g.z) < 6);
  assert.ok(doors.length >= 8, 'two leaves of planks');
  for (const p of doors) assert.ok((p.x - g.x) * g.out[0] + (p.z - g.z) * g.out[1] < 0, 'a door swung OUT of the town');
});
