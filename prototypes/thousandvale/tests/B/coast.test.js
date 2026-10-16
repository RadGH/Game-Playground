// Coast stream — play-test 11: Z4 (live #4 "rivers and roads spilling out of the island and running into the ocean. They
// should stop at the shoreline") and Z61 (owner: "edit the world east of Gullwick so that Gullwick actually sits on the
// coastline and has a real harbor"). node --test prototypes/thousandvale/tests/B/coast.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTerrain, parseNav, NAV } from '../../js/rules/terrain-read.js';
import { parseHorizon } from '../../js/rules/horizon-read.js';
import { loadWorld } from '../../tools/bake-zone.mjs';
import { BAYS, bayAt, CONTINENTS, continentRect } from '../../tools/lib/world-core.mjs';
import { seaAt } from '../../tools/lib/coast-lines.mjs';
import { bakedHarbour } from '../../tools/ship-routes.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT));
const J = p => JSON.parse(read(p));
const PMAP = J('data/world/province-map.json').provinces;
const ZONES = Object.values(Object.assign({}, ...Object.values(PMAP).map(p => p.map)));
const origin = id => { const m = /^z(\d+)_(\d+)$/.exec(id); return [+m[1] * 2048, +m[2] * 2048]; };
const H = parseHorizon(read('data/world/horizon.bin'));
const { json: W, raw: RAW, ref } = loadWorld();
const BAY = BAYS.find(b => b.id === 'gullwick_bay');
/** Sample a polyline every `step` metres -> [[x, z]…]. */
const along = (pts, step = 4) => { const out = []; for (let k = 0; k < pts.length - 1; k++) { const a = pts[k], b = pts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let q = 0; q < L; q += step) out.push([a[0] + (b[0] - a[0]) * q / L, a[1] + (b[1] - a[1]) * q / L]); } if (pts.length) out.push(pts[pts.length - 1]); return out; };

test('Z4: no baked road crosses open sea, and no river sheet lies over the sea floor — every zone of both islands', () => {
  const bad = [];
  for (const id of ZONES) {
    const t = parseTerrain(read(`data/zones/${id}/terrain.bin`));
    for (const p of J(`data/zones/${id}/placements.json`).placements.filter(q => q.kind === 'road' || q.kind === 'street')) {
      for (const [x, z] of along(p.data.pts, 2)) {
        if (x < 0 || z < 0 || x > 2048 || z > 2048) continue;
        const w = t.waterAt(x, z);
        if (w.kind === 'sea' && w.depth > 0.3) { bad.push(`${id} ${p.id} at ${Math.round(x)},${Math.round(z)} (${w.depth.toFixed(1)} m of sea)`); break; }
      }
    }
    // a river's sheet over the open sea (the sea floor of the base ground, not the river's own channel at its mouth)
    const [ox, oz] = origin(id);
    let over = 0;
    for (let z = 1; z < 2048; z += 4) for (let x = 1; x < 2048; x += 4) { const w = t.waterAt(x, z); if (w.kind === 'river' && w.surface > 0.2 && ref.baseGround(ox + x, oz + z) < -1) over++; }
    if (over) bad.push(`${id}: ${over} river samples raised over the open sea`);
  }
  assert.deepEqual(bad, []);
});

test('Z4: the map draws only built lines — no road or river point over open sea, roads only on the islands, nothing of the old mainland inside an island', () => {
  const map = J('data/world/map/map.json');
  const ZM = 2048, blocks = Object.values(PMAP).map(p => [p.block[0] * ZM, p.block[1] * ZM, (p.block[0] + p.size[0]) * ZM, (p.block[1] + p.size[1]) * ZM]);
  const inBlock = (x, z) => blocks.some(b => x >= b[0] && z >= b[1] && x <= b[2] && z <= b[3]);
  const islands = CONTINENTS.filter(c => c.kind === 'island').map(continentRect);
  const bad = [];
  for (const r of map.roads) for (const [x, z] of along(r.pts, 8)) {
    if (seaAt(H, x, z)) { bad.push(`road ${r.id} over the sea at ${Math.round(x)},${Math.round(z)}`); break; }
    if (!inBlock(x, z)) { bad.push(`road ${r.id} off the islands at ${Math.round(x)},${Math.round(z)}`); break; }
  }
  for (const r of map.rivers) {
    for (const [x, z] of along(r.pts, 8).slice(0, -1)) if (seaAt(H, x, z)) { bad.push(`river ${r.id} over the sea at ${Math.round(x)},${Math.round(z)}`); break; }
    if (r.pts.some(([x, z]) => islands.some(c => x >= c.x0 && z >= c.z0 && x < c.x1 && z < c.z1))) bad.push(`river ${r.id} (old mainland) inside an island`);
  }
  // the island's own roads are drawn; the old mainland's roads that ran across its block are not
  const vh = blocks[Object.keys(PMAP).indexOf('vharlen')];
  assert.ok(map.roads.some(r => r.pts.some(([x, z]) => x >= vh[0] && z >= vh[1] && x <= vh[2] && z <= vh[3])), 'Vharlen has roads on the map');
  for (const r of map.roads.filter(q => q.pts.some(([x, z]) => x >= vh[0] && z >= vh[1] && x <= vh[2] && z <= vh[3]))) assert.ok(/^z1[123]_(09|10|11):/.test(r.id), `${r.id} is not one of Vharlen's own baked roads`);
  assert.deepEqual(bad, []);
});

test('Z4: a river ends in its mouth at the sea — never downstream of it, never uphill', () => {
  const ended = W.rivers.filter(r => r.mouth);
  assert.ok(ended.some(r => r.name === 'The Batpate Run') && ended.some(r => r.name === 'The Fackfalpot'), 'the Batpate Run and the Fackfalpot (which joined it below the bay) now end in Gullwick Bay');
  for (const r of ended) {
    const end = r.pts[r.pts.length - 1];
    assert.ok(bayAt(BAY, end[0], end[1]).s < 0 && ref.baseGround(end[0], end[1]) < 0, `${r.name} ends in the bay's water`);
    assert.equal(end[2], 0, `${r.name} meets the sea at sea level`);
    for (let k = 1; k < r.pts.length; k++) assert.ok(r.pts[k][2] <= r.pts[k - 1][2] + 1e-9, `${r.name} runs uphill at point ${k}`);
    for (const p of r.pts.slice(0, -2)) assert.ok(ref.baseGround(p[0], p[1]) > -0.5 || !(bayAt(BAY, p[0], p[1]).s < -2), `${r.name} runs on into the bay at ${p[0]},${p[1]}`);
  }
  // a road is cut at the waterline: no road of the world (with the bays) has a point in a bay's water
  for (const r of W.roads) for (const p of r.pts) assert.ok(!(bayAt(BAY, p[0], p[1]).s < -14 && ref.baseGround(p[0], p[1]) < -0.5), `road ${r.id} runs into the bay at ${p[0]},${p[1]}`);
});

test('Z61: the bay changes only its own zone — every other zone of both islands bakes as it did (ground, rivers, roads)', () => {
  // the ground: zero change along and inside every other zone (16 m samples), and on every edge the bay zone shares
  for (const id of ZONES.filter(z => z !== BAY.zone)) {
    const [ox, oz] = origin(id);
    for (let z = 0; z <= 2048; z += 16) for (let x = 0; x <= 2048; x += 16) if (ref.bayDelta(ox + x, oz + z) !== 0) assert.fail(`${id} ground moved at ${x},${z}`);
  }
  const [bx, bz] = origin(BAY.zone);
  for (let s = 0; s <= 2048; s += 2) for (const [x, z] of [[bx + s, bz], [bx, bz + s], [bx + s, bz + 2048]]) assert.equal(ref.bayDelta(x, z), 0, `bay zone edge moved at ${x},${z}`);
  // a world line no bay reaches is the very same object (so it bakes byte-for-byte as before)
  const reached = (pts, x0) => pts.some(p => ref.bayDelta(p[0], p[1]) !== 0);
  for (const r of RAW.rivers) if (!reached(r.pts)) { const c = W.rivers.find(q => q.id === r.id); if (c && !c.joined) assert.equal(c, r, `river ${r.id}`); }
  for (const r of RAW.roads) if (!reached(r.pts) && !r.pts.some(p => bayAt(BAY, p[0], p[1]).s < 0)) assert.ok(W.roads.includes(r), `road ${r.id}`);
});

test('Z61: Gullwick sits on the coast with a built harbour — quay, piers over deep water, the Harbourmaster on the quay, the ship at the pier', () => {
  const t = parseTerrain(read(`data/zones/${BAY.zone}/terrain.bin`)), nav = parseNav(read(`data/zones/${BAY.zone}/nav.bin`));
  const P = J(`data/zones/${BAY.zone}/placements.json`).placements;
  const town = P.find(p => p.kind === 'settlement' && p.data.name === 'Gullwick'), hb = P.find(p => p.kind === 'harbour');
  assert.ok(town && town.data.hub, 'Gullwick is still the zone hub');
  assert.deepEqual([town.x, town.z], [BAY.town.x, BAY.town.z], 'Gullwick stands where it stood (its plan and offices are filed by plot)');
  // on the coastline: the sea within 60 m of the town's circle, toward the harbour
  let nearest = Infinity;
  for (let a = 0; a < 360; a += 2) for (let d = town.data.radius; d < town.data.radius + 200; d += 2) {
    const x = town.x + Math.cos(a * Math.PI / 180) * d, z = town.z + Math.sin(a * Math.PI / 180) * d;
    if (t.waterAt(x, z).kind === 'sea') { nearest = Math.min(nearest, d - town.data.radius); break; }
  }
  assert.ok(nearest <= 60, `the sea is ${nearest} m from Gullwick's edge`);
  assert.ok(hb?.data?.quay && hb.data.piers?.length >= 2, 'the harbour placement has a quay and piers');
  const Q = hb.data.quay;
  for (let x = Q.x0 + 3; x <= Q.x1 - 3; x += 4) for (let z = Q.z0 + 1; z <= Q.z1 - 2; z += 3) {     // (its outer metre is the stone face)
    assert.equal(t.waterAt(x, z).kind, 'none', `the quay is dry at ${x},${z}`);
    assert.ok(nav.at(x, z) & NAV.WALK, `the quay is walkable at ${x},${z}`);
  }
  assert.ok(t.waterAt((Q.x0 + Q.x1) / 2, Q.z1 + 3).depth >= 1.5, 'deep water at the quay face');
  // every pier is a walkable deck out over the water
  for (const p of hb.data.piers) {
    for (let s = 0.1; s <= 0.95; s += 0.1) {
      const x = p.a[0] + (p.b[0] - p.a[0]) * s, z = p.a[1] + (p.b[1] - p.a[1]) * s;
      assert.ok(Math.abs(t.heightAt(x, z) - p.deck) < 0.01, `pier deck under foot at ${x.toFixed(0)},${z.toFixed(0)}`);
      assert.ok(t.walkable(x, z), `pier walkable at ${x.toFixed(0)},${z.toFixed(0)}`);
    }
    assert.ok(t.groundAt(p.b[0], p.b[1]) < -0.8, 'a pier ends out over the water (the sea bed under its end)');      // (waterAt answers for the deck)
  }
  const main = hb.data.piers.find(p => p.main);
  assert.ok(-t.groundAt(main.b[0], main.b[1]) >= 5, 'the long pier reaches water deep enough for the ship');
  // the ship (31 m long, 9.4 m wide, 3.1 m keel) floats where it is moored, clear of the pier
  const B = hb.data.berth, c = Math.cos(B.yaw), s = Math.sin(B.yaw);
  for (let along = -16; along <= 15; along += 2) for (const across of [-4.7, 0, 4.7]) {
    const x = B.x + across * c + along * s, z = B.z - across * s + along * c;
    assert.ok(t.waterAt(x, z).depth >= 3.2, `the hull touches bottom at ${x.toFixed(0)},${z.toFixed(0)} (${t.waterAt(x, z).depth.toFixed(1)} m)`);
    assert.ok(Math.abs(x - main.a[0]) > main.width / 2 + 0.3 || z > main.b[1] + 1, 'the hull is clear of the pier');
  }
  // the Harbourmaster and the landing spot are on the quay, and ships.json says so (tools/ship-routes.mjs)
  for (const k of ['master', 'dock']) { const q = hb.data[k]; assert.ok(q.x >= Q.x0 && q.x <= Q.x1 && q.z >= Q.z0 && q.z <= Q.z1, `${k} on the quay`); }
  const ship = J('data/provinces/ships.json').harbours.find(h => h.id === 'gullwick');
  const want = bakedHarbour(ship);
  assert.deepEqual(ship.berth, want.berth); assert.equal(ship.master.x, want.master.x); assert.equal(ship.master.z, want.master.z); assert.deepEqual(ship.dock, want.dock);
  assert.equal(ship.pier, undefined, 'no stand-in jetty: the bake built the real piers');
  const sail = J('data/provinces/ships.json').sailings.find(q => q.from === 'gullwick');
  assert.deepEqual(sail.path[0], [ship.berth.x, ship.berth.z], 'the voyage starts at the pier');
});

test('Z61: nothing hostile by the harbour; Gullwick keeps every office plot where stream E filed its NPCs', () => {
  const [ox, oz] = origin(BAY.zone);
  const hb = J(`data/zones/${BAY.zone}/placements.json`).placements.find(p => p.kind === 'harbour');
  const hx = hb.x + ox, hz = hb.z + oz;
  for (const f of ['', '.quest']) for (const p of J(`data/vignettes/placements/${BAY.zone}${f}.json`).placements) {
    if (!['camp', 'rare'].includes(p.type) || !Number.isFinite(p.x)) continue;
    assert.ok(Math.hypot(p.x + ox - hx, p.z + oz - hz) >= 120, `${p.id} (${p.monster || p.type}) stands ${Math.round(Math.hypot(p.x + ox - hx, p.z + oz - hz))} m from the harbour`);
  }
  const plots = new Map(J(`data/zones/${BAY.zone}/placements.json`).placements.filter(p => p.kind === 'building').map(p => [p.id, p]));
  const offices = J('data/provinces/offices.json');
  const town = Object.values(offices.towns || {}).find(q => q.name === 'Gullwick');
  assert.ok(town?.offices?.length, 'Gullwick has offices');
  for (const o of town.offices) { const p = plots.get(o.plot); assert.ok(p, `${o.role}: plot ${o.plot} still exists`); assert.ok(Math.abs(p.x - o.x) < 0.01 && Math.abs(p.z - o.z) < 0.01, `${o.role}: plot ${o.plot} has not moved`); }
});

test('Z61: the harbour is drawn from its placement (js/client/harbour-view.js): stone face, planked piers on posts, lamps, boats', async () => {
  const { harbourParts } = await import('../../js/client/harbour-view.js');
  const [ox, oz] = origin(BAY.zone), t = parseTerrain(read(`data/zones/${BAY.zone}/terrain.bin`));
  const hb = J(`data/zones/${BAY.zone}/placements.json`).placements.find(p => p.kind === 'harbour');
  const { parts, lamps } = harbourParts(hb, { ox, oz, groundAt: (x, z) => t.groundAt(x - ox, z - oz) });
  for (const q of parts) for (const k of ['x', 'y', 'z', 'yaw', 'w', 'h', 'd']) assert.ok(Number.isFinite(q[k]), `${q.mesh} ${k}`);
  const planks = parts.filter(q => q.colour === '#7a6048' && q.d > 10);
  assert.equal(planks.length, hb.data.piers.length, 'one planked deck per pier');
  for (const p of planks) assert.ok(Math.abs(p.y + p.h - hb.data.piers[0].deck - 0.04) < 0.05, 'the planks lie at the walkable deck height');
  assert.ok(planks.every(p => p.z - p.d / 2 >= hb.data.quay.z1 + oz), 'no plank lies on the quay stone');
  assert.ok(parts.filter(q => q.colour === '#4e3b2c' && q.mesh === 'cyl').every(q => q.y <= t.groundAt(q.x - ox, q.z - oz) - 0.7), 'every post reaches down into the sea bed');
  assert.ok(lamps.length >= 3 && parts.filter(q => q.mesh === 'hip').length >= 3, 'lamps and rowboats');
  assert.deepEqual(harbourParts({ id: 'h', data: { town: 'x', deep: [0, 0] } }), { parts: [], lamps: [] }, 'a Port Vharl-style record draws nothing here');
});
