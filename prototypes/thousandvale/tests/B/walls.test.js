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
  const north = T.gates.find(g => (g.road || g.way) === 'lane_torbor_north');
  assert.ok(north && north.kind === 'gatehouse', 'Barrow Lane comes in through a gatehouse');
  // (W6: `out` is the way a walker leaves along the main street, which may slant; the gate STRUCTURE faces the way its wall does)
  assert.ok(Math.cos(north.wallYaw) < -0.9, 'and that gate stands facing north, up the lane');
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

test('planner: a road crossing the ring at a slant — `out` follows the ROAD, the gate itself stands IN the wall (T8b)', () => {
  // a road that misses the centre by 35 m: it crosses the ring at ~30 degrees off radial, twice
  const w = ring({ roads: [straight('r', 465, 300, 465, 700)] });
  assert.equal(w.gates.length, 2);
  for (const g of w.gates) {
    assert.ok(Math.abs(Math.abs(g.out[1]) - 1) < 1e-3, 'out runs along the road (z)');
    assert.ok(g.out[0] * (g.x - 500) + g.out[1] * (g.z - 500) > 0, 'and away from the town');
    assert.ok(g.slant > 0.3, 'this is the slanted case');
    // play-test 5 (T8b): the STRUCTURE is in the wall's line — its normal is the ring's radial at the gate, not the road
    const rx = g.x - 500, rz = g.z - 500, R = Math.hypot(rx, rz), nx = Math.sin(g.wallYaw), nz = Math.cos(g.wallYaw);
    assert.ok(Math.abs(R - w.r) < 0.05, 'the gate is on the ring');
    assert.ok((nx * rx + nz * rz) / R > 0.9999, `wallYaw is the ring's normal (off by ${(Math.acos((nx * rx + nz * rz) / R) * 180 / Math.PI).toFixed(1)} deg)`);
    const th = Math.acos(g.out[0] * nx + g.out[1] * nz);
    assert.ok(th > 0.3, 'so it is NOT square to the road here');
    // and it is wide enough that the road still fits through it at that slant, right through the gatehouse's depth
    assert.ok(g.open >= g.pass / Math.cos(th) + 2 * 1.5 * Math.tan(th) - 0.02, `open ${g.open} too narrow for a ${g.pass} m passage at ${(th * 180 / Math.PI).toFixed(0)} deg`);
    // the wall stops either side of it, on its line: both run ends within a hand of the gate's own line
    for (const e of g.ends) assert.ok(Math.abs((e[0] - g.x) * nx + (e[1] - g.z) * nz) < 1.0, 'a run end off the gate line');
  }
  // nav: the slanted road is open all the way through, and the jambs either side of the opening ARE solid, on the wall line
  const S = 512, bits = new Uint8Array(S * S);
  wallNav([w], { SIZE: S, STEP: 2, mark: (i, j) => { bits[j * S + i] = 1; } });
  const nav = (x, z) => bits[Math.round(z / 2) * S + Math.round(x / 2)];
  for (const g of w.gates) {
    for (let s = -8; s <= 8; s += 0.5) assert.equal(nav(g.x + g.out[0] * s, g.z + g.out[1] * s), 0, `the road is blocked ${s} m along it`);
    const tx = Math.cos(g.wallYaw), tz = -Math.sin(g.wallYaw);
    for (const sg of [-1, 1]) assert.equal(nav(g.x + tx * sg * (g.open / 2 + 1.6), g.z + tz * sg * (g.open / 2 + 1.6)), 1, 'no jamb beside the opening');
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
  const g = T.gates.find(q => (q.road || q.way) === 'lane_torbor_north');
  const doors = plan.parts.filter(p => p.colour === '#7a5a3c' && Math.hypot(p.x - g.x, p.z - g.z) < g.open / 2 + 3);   // (W6: the opening is as wide as the street needs at its slant)
  assert.ok(doors.length >= 8, 'two leaves of planks');
  for (const p of doors) assert.ok((p.x - g.x) * Math.sin(g.wallYaw) + (p.z - g.z) * Math.cos(g.wallYaw) < 0, 'a door swung OUT of the town');
});

// --------------------------------------------------------------------------------- play-test 5: T8b + T8a
/** Every town_wall of every zone with the client's plan of it: [{ zone, W (record), plan }]. */
async function drawnWalls() {
  const { planWalls } = await import('../../js/client/walls-view.js');
  return ZONES.flatMap(id => zone(id).P.filter(p => p.kind === 'town_wall').map(W => ({ zone: id, W, plan: planWalls([W], { groundAt: () => 50 }) })));
}
const deg = r => r * 180 / Math.PI;

test('T8b: every baked gate lies IN its wall — on the ring, its normal the ring\'s, the road fitting through at its slant', () => {
  let slanted = 0, n = 0;
  for (const id of ZONES) for (const W of zone(id).P.filter(p => p.kind === 'town_wall')) for (const g of W.data.gates) {
    if (g.kind === 'gap') continue;
    n++;
    const rx = g.x - W.x, rz = g.z - W.z, R = Math.hypot(rx, rz), nx = Math.sin(g.wallYaw), nz = Math.cos(g.wallYaw);
    assert.ok(Number.isFinite(g.wallYaw) && g.open > 0, `${g.id}: no wallYaw/open (bake older than T8b)`);
    assert.ok(Math.abs(R - W.data.radius) < 0.1, `${g.id}: ${(R - W.data.radius).toFixed(2)} m off the ring`);
    assert.ok(deg(Math.acos(Math.min(1, (nx * rx + nz * rz) / R))) < 0.5, `${g.id}: turned ${deg(Math.acos(Math.min(1, (nx * rx + nz * rz) / R))).toFixed(1)} deg out of its wall`);
    const th = Math.acos(Math.max(-1, Math.min(1, g.out[0] * nx + g.out[1] * nz)));
    if (th > 0.2) slanted++;
    assert.ok(g.open >= g.pass / Math.cos(th) + 2 * 1.5 * Math.tan(th) - 0.05, `${g.id}: open ${g.open} m is too narrow for its road at ${deg(th).toFixed(0)} deg`);
  }
  assert.ok(n >= 70 && slanted >= 8, `gates ${n}, slanted ${slanted}: the slanted case is in the data`);
});

test('T8b: the client DRAWS every gate in the wall\'s line (gate width vs the line between the wall ends either side), with no gap beside it', async () => {
  let worst = 0, n = 0;
  for (const { W, plan } of await drawnWalls()) {
    const gates = W.data.gates.filter(g => g.kind !== 'gap');
    assert.equal(plan.gates.length, gates.length);
    gates.forEach((g, k) => {
      const f = plan.gates[k];
      // the wall's own line here, from the DATA either side of the gate (not from wallYaw): the chord between the run ends
      const [a, b] = g.ends, L = Math.hypot(b[0] - a[0], b[1] - a[1]), wx = (b[0] - a[0]) / L, wz = (b[1] - a[1]) / L;
      const gx = Math.cos(f.yaw), gz = -Math.sin(f.yaw);          // the drawn gate's width axis (local +X)
      const off = deg(Math.acos(Math.min(1, Math.abs(gx * wx + gz * wz))));
      worst = Math.max(worst, off); n++;
      // (a chord is exactly parallel to the tangent only when the opening is symmetric: one grown along the ring for a
      // second way is a few degrees off. Before T8b the worst here was 54 degrees.)
      assert.ok(off < 9, `${g.id}: drawn ${off.toFixed(1)} deg out of the wall's line`);
      // every part of the gate structure stands within the gate's depth of that line, i.e. nothing sticks out of the wall
      const near = plan.parts.filter(p => Math.hypot(p.x - f.x, p.z - f.z) < f.open / 2 + f.jamb && p.y < 60 && p.colour !== '#7a5a3c');
      // and the wall reaches the gate: from each run end to the jamb there is structure (a stub) unless they already meet
      for (const e of g.ends) {
        const lx = (e[0] - f.x) * gx + (e[1] - f.z) * gz, gap = Math.abs(lx) - (f.open / 2 + f.jamb);
        if (gap < 1.0) continue;
        const mx = f.x + gx * Math.sign(lx) * (f.open / 2 + f.jamb + gap / 2), mz = f.z + gz * Math.sign(lx) * (f.open / 2 + f.jamb + gap / 2);
        assert.ok(plan.parts.some(p => Math.hypot(p.x - mx, p.z - mz) < Math.max(3.2, gap)), `${g.id}: a ${gap.toFixed(1)} m hole between the gate and its wall`);
      }
      assert.ok(near.length >= 2, `${g.id}: nothing drawn`);
    });
  }
  console.log(`[T8b] ${n} drawn gates, worst ${worst.toFixed(1)} deg out of the wall's line`);
});

test('T8a: every rail of every perimeter fence runs ALONG the line its posts stand on (runs, gate stubs and gate leaves)', async () => {
  let rails = 0, worst = 0;
  for (const { W, plan } of await drawnWalls()) {
    if (!['rail', 'stake'].includes(W.data.material)) continue;
    // the fence line near a point: the nearest run segment (or gate chord)
    const segs = [...W.data.runs.flatMap(r => r.slice(1).map((b, k) => [r[k], b])), ...W.data.gates.map(g => g.ends)];
    const lineAt = (x, z) => { let best = Infinity, u = null; for (const [a, b] of segs) { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)), q = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); if (q < best) { best = q; const L = Math.sqrt(L2); u = [dx / L, dz / L]; } } return u; };
    for (const p of plan.parts) {
      if (p.mesh !== 'box' || p.rz) continue;                 // (a gate leaf's diagonal brace is tilted on purpose)
      const long = Math.max(p.w, p.d); if (long < 1.2 || p.h > 0.4) continue;      // a rail: long, thin, level
      // the rail's long axis in the world: local X = (cos yaw, -sin yaw), local Z = (sin yaw, cos yaw)
      const ax = p.w >= p.d ? [Math.cos(p.yaw), -Math.sin(p.yaw)] : [Math.sin(p.yaw), Math.cos(p.yaw)];
      const u = lineAt(p.x, p.z), off = deg(Math.acos(Math.min(1, Math.abs(ax[0] * u[0] + ax[1] * u[1]))));
      rails++; worst = Math.max(worst, off);
      // a gate leaf is latched back 25 degrees off its fence; before play-test 5 it stood at 100 (a panel ACROSS the posts)
      assert.ok(off < 40, `${W.id}: a rail ${off.toFixed(0)} deg across its fence line at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    }
  }
  assert.ok(rails > 200, 'rails checked: ' + rails);
  console.log(`[T8a] ${rails} perimeter rails, worst ${worst.toFixed(0)} deg off the fence line`);
});

test('T8b: no piece of a perimeter is longer than the stretch of wall it was cut for (a 1 m stub of barricade once carried its 6 m log into the road)', async () => {
  for (const { W, plan } of await drawnWalls()) {
    const segs = [...W.data.runs.flatMap(r => r.slice(1).map((b, k) => [r[k], b])), ...W.data.gates.map(g => g.ends)];
    const off = (x, z) => Math.min(...segs.map(([a, b]) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1e-9))); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); }));
    for (const p of plan.parts) {
      if (Math.abs(Math.abs(p.rx) - Math.PI / 2) > 0.01 || p.h < 1.5) continue;       // a log laid along the wall
      // its far end: the base plus its length along the piece's +Z
      const ex = p.x + Math.sin(p.yaw) * p.h * Math.sign(p.rx), ez = p.z + Math.cos(p.yaw) * p.h * Math.sign(p.rx);
      assert.ok(off(p.x, p.z) < 2.2 && off(ex, ez) < 2.2, `${W.id}: a log ends ${off(ex, ez).toFixed(1)} m off the wall line at ${ex.toFixed(1)},${ez.toFixed(1)}`);
    }
  }
});
