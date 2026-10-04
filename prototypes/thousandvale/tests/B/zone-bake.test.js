// Stream B — world + zone bake v1 (PLAN §3.2): edges agree bit for bit, the bake is deterministic and
// checked in, the M1 zone's town plan and sites are sound.   node --test prototypes/thousandvale/tests/B/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTerrain } from '../../js/rules/terrain-read.js';
import { bakeWorld } from '../../tools/bake-world.mjs';
import { bakeZone, M1_ZONE } from '../../tools/bake-zone.mjs';
import { encodeTerrain } from '../../tools/bake-test-zone.mjs';
import { discIsOpen } from '../../tools/lib/zone-sites.mjs';

const zoneFile = (id, f) => new URL(`../../data/zones/${id}/${f}`, import.meta.url);
const cache = new Map();
const baked = id => { if (!cache.has(id)) cache.set(id, bakeZone(id)); return cache.get(id); };

test('world bake: deterministic, checked-in files are current', () => {
  const { json, macroBytes } = bakeWorld();
  assert.equal(JSON.stringify(json) + '\n', readFileSync(new URL('../../data/world/world.json', import.meta.url), 'utf8'), 'world.json stale — run tools/bake-world.mjs');
  assert.equal(Buffer.compare(Buffer.from(macroBytes), readFileSync(new URL('../../data/world/macro.bin', import.meta.url))), 0, 'macro.bin stale');
  assert.equal(json.grid.cols * json.grid.rows, json.zones.length);
  assert.equal(json.grid.zoneMetres, 2048);
});

test('M1 zone: checked-in terrain.bin + placements.json match a fresh bake', () => {
  const b = baked(M1_ZONE);
  assert.equal(Buffer.compare(Buffer.from(encodeTerrain(b)), readFileSync(zoneFile(M1_ZONE, 'terrain.bin'))), 0, 'terrain.bin stale — run tools/bake-zone.mjs --m1');
  const pl = JSON.parse(readFileSync(zoneFile(M1_ZONE, 'placements.json'), 'utf8'));
  assert.deepEqual(pl.placements, JSON.parse(JSON.stringify(b.placements)));
  assert.equal(pl.terrainHash, b.meta.inputHash);
});

test('zone edges agree bit for bit with the east and south neighbours (height, water, biome)', () => {
  const a = baked(M1_ZONE), east = baked('z04_02'), south = baked('z03_03');
  const S = a.meta.size, L = S - 1;
  let diffs = 0;
  for (let j = 0; j < S; j++) {
    const ka = j * S + L, kb = j * S;
    if (a.height[ka] !== east.height[kb] || a.waterTop[ka] !== east.waterTop[kb] || a.waterKind[ka] !== east.waterKind[kb] || a.biome[ka] !== east.biome[kb]) diffs++;
  }
  for (let i = 0; i < S; i++) {
    const ka = L * S + i, kb = i;
    if (a.height[ka] !== south.height[kb] || a.waterTop[ka] !== south.waterTop[kb] || a.waterKind[ka] !== south.waterKind[kb] || a.biome[ka] !== south.biome[kb]) diffs++;
  }
  assert.equal(diffs, 0, `${diffs} edge samples disagree`);
  // and the readers agree at the same world point (drawn = measured across the seam)
  const ta = a.terrain, te = east.terrain;
  for (const z of [3.3, 517.9, 1499.1, 2040]) assert.equal(ta.heightAt(2048, z), te.heightAt(0, z));
  assert.equal(a.meta.heightMin, east.meta.heightMin, 'world-fixed quantisation');
});

test('M1 zone: the hub town is planned, levelled, away from the edges; doors face streets', () => {
  const b = baked(M1_ZONE), t = parseTerrain(readFileSync(zoneFile(M1_ZONE, 'terrain.bin')));
  const hub = t.meta.sites.find(s => s.hub);
  assert.equal(hub.name, 'Torborhold'); assert.ok(hub.radius > 0);
  assert.ok(Math.min(hub.x, hub.z, 2048 - hub.x, 2048 - hub.z) >= hub.radius + 200, 'hub is well inside the zone');
  const P = b.placements, ids = new Set(P.map(p => p.id));
  assert.equal(ids.size, P.length, 'placement ids are unique');
  const known = new Set(['settlement', 'town_square', 'street', 'building', 'town_wall', 'dungeon_door', 'event_site', 'camp_site', 'landmark', 'dungeon', 'pass', 'crossing', 'port']);
  for (const p of P) { assert.ok(known.has(p.kind), p.kind); assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.yaw), p.id); }
  const blds = P.filter(p => p.kind === 'building');
  assert.ok(blds.length >= 12, `${blds.length} buildings`);
  for (const p of blds) {
    assert.ok(Math.hypot(p.x - hub.x, p.z - hub.z) < hub.radius, `${p.id} inside the town circle`);
    assert.ok(p.data.streetGap < 1, `${p.id} front is on a street (gap ${p.data.streetGap})`);
    assert.ok(t.walkable(p.x, p.z) && t.waterAt(p.x, p.z).kind === 'none', `${p.id} on dry ground`);
  }
  // levelled: the town ground is gentle
  let worst = 0;
  for (const p of blds) worst = Math.max(worst, t.slopeAt(p.x, p.z));
  assert.ok(worst < 8, `steepest building plot ${worst.toFixed(1)}°`);
  assert.ok(t.walkable(t.meta.spawn.x, t.meta.spawn.z));
});

test('M1 zone sites: door, event arena, elite camp', () => {
  const t = parseTerrain(readFileSync(zoneFile(M1_ZONE, 'terrain.bin')));
  const s = id => t.meta.sites.find(x => x.id === id);
  const hub = t.meta.sites.find(x => x.hub), door = s('door_1');
  assert.ok(door && Number.isFinite(door.yaw) && t.walkable(door.x, door.z));
  assert.ok(Math.hypot(door.x - hub.x, door.z - hub.z) > hub.radius + 60);
  assert.ok(discIsOpen(t, door.x + Math.sin(door.yaw) * 8, door.z + Math.cos(door.yaw) * 8, 7, { step: 3, maxSlope: 16 }));
  for (const [id, r] of [['event_grandmother_skein', 40], ['elite_hobb_gallowsby', 25]]) assert.ok(s(id) && discIsOpen(t, s(id).x, s(id).z, r), id);
});
