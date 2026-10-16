// Stream B — play-test 1 P3: the world map + region map data.  node --test prototypes/thousandvale/tests/B/map.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { bakeMap } from '../../tools/bake-map.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT));
const map = JSON.parse(read('data/world/map/map.json'));
const PMAP = JSON.parse(read('data/world/province-map.json')).provinces.torbor_downs.map;
const pngSize = buf => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

test('map bake is deterministic and the checked-in files are current', () => {
  const { files } = bakeMap();
  for (const [f, v] of Object.entries(files)) assert.equal(Buffer.compare(read(`data/world/map/${f}`), Buffer.from(v)), 0, `${f} stale — run tools/bake-map.mjs`);
});

test('images are browser-sized and match map.json', () => {
  const w = read(map.world.image);
  assert.deepEqual(pngSize(w), [map.world.width, map.world.height]);
  assert.equal(map.world.mPerPx, 32);
  assert.ok(map.world.metres[0] >= map.grid.cols * map.grid.zoneMetres && map.world.metres[1] >= map.grid.rows * map.grid.zoneMetres);
  let total = w.length + statSync(new URL('data/world/map/map.json', ROOT)).size;
  for (const z of map.zones.filter(z => z.image)) { const b = read(z.image); assert.deepEqual(pngSize(b), [512, 512], z.id); total += b.length; }
  assert.ok(total < 4.5 * 1024 * 1024, `map files ${(total / 1048576).toFixed(2)} MB`);
});

test('every Torbor Downs zone has its image, name, level band and labels for its towns, dungeon and arenas', () => {
  for (const [eid, id] of Object.entries(PMAP)) {
    const z = map.zones.find(q => q.id === id);
    assert.ok(z?.image, `${id} image`);
    assert.equal(z.sheetZone, eid);
    assert.ok(z.name && Array.isArray(z.band) && z.band[0] <= z.band[1], `${id} name/band`);
    const P = JSON.parse(read(`data/zones/${id}/placements.json`)).placements;
    const L = map.labels.filter(l => l.zone === id);
    for (const s of P.filter(p => p.kind === 'settlement')) assert.ok(L.some(l => l.name === s.data.name && ['town', 'village', 'hamlet'].includes(l.kind)), `${id} label for ${s.data.name}`);
    for (const d of P.filter(p => p.kind === 'dungeon_door')) assert.ok(L.some(l => l.kind === 'dungeon' && l.id === d.id && l.name), `${id} dungeon label`);
    for (const e of P.filter(p => p.kind === 'event_site')) assert.ok(L.some(l => l.kind === 'event' && l.id === e.id), `${id} event ${e.id}`);
    assert.ok(L.some(l => l.kind === 'zone' && l.band), `${id} zone label with band`);
  }
  const prov = map.provinces.find(p => p.id === 'torbor_downs');
  assert.ok(prov && prov.zones.length === 16 && prov.band);
});

test('labels and vectors are in world metres, inside the world', () => {
  const [W, H] = map.world.metres;
  for (const l of map.labels) { assert.ok(l.x >= 0 && l.z >= 0 && l.x <= W && l.z <= H, JSON.stringify(l)); assert.ok([0, 1, 2].includes(l.minZoom)); }
  assert.ok(map.labels.some(l => l.kind === 'town' && l.hub && l.minZoom === 0), 'hub towns show on the world view');
  for (const r of map.roads) assert.ok(r.pts.length >= 2 && r.pts.every(p => p[0] >= -200 && p[1] >= -200 && p[0] <= W + 200 && p[1] <= H + 200));
  // play-test 11 (Z4): the lines are the BUILT ones (tools/lib/coast-lines.mjs) — the islands' roads and the rivers that run
  // through them to the sea, not World Forge's whole pangea (tests/B/coast.test.js checks none lies over the sea)
  assert.ok(map.rivers.length >= 10 && map.roads.length > 100, `${map.rivers.length} rivers, ${map.roads.length} roads`);
});
