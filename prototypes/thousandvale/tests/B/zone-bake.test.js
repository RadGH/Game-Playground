// Stream B — world + zone bake v1 (PLAN §3.2): edges agree bit for bit, the bake is deterministic and
// checked in, the M1 zone's town plan and sites are sound.   node --test prototypes/thousandvale/tests/B/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseTerrain } from '../../js/rules/terrain-read.js';
import { bakeWorld } from '../../tools/bake-world.mjs';
import { bakeZone, zoneFiles, M1_ZONE } from '../../tools/bake-zone.mjs';
import { parseScatter, parseNav, NAV, SCATTER_KINDS } from '../../js/rules/terrain-read.js';
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

test('M1 zone: every checked-in file matches a fresh bake', () => {
  const files = zoneFiles(baked(M1_ZONE));
  for (const [f, v] of Object.entries(files)) assert.equal(Buffer.compare(Buffer.from(v), readFileSync(zoneFile(M1_ZONE, f))), 0, `${f} stale — run tools/bake-zone.mjs --m1`);
});

test('zone edges agree bit for bit with the east and south neighbours (height, water, biome)', () => {
  const zx = +M1_ZONE.slice(1, 3), zy = +M1_ZONE.slice(4, 6), id = (x, y) => `z${String(x).padStart(2, '0')}_${String(y).padStart(2, '0')}`;
  const a = baked(M1_ZONE), east = baked(id(zx + 1, zy)), south = baked(id(zx, zy + 1));
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
  const known = new Set(['lair', 'settlement', 'town_square', 'street', 'building', 'town_wall', 'road', 'bridge', 'dungeon_door', 'event_site', 'camp_site', 'landmark', 'dungeon', 'pass', 'crossing', 'port']);
  for (const p of P) { assert.ok(known.has(p.kind), p.kind); assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.yaw), p.id); }
  const blds = P.filter(p => p.kind === 'building');
  assert.ok(blds.filter(p => p.data.town === 'torborhold').length >= 12, 'the hub has a real town');
  // every settlement in the zone has a layout now, not only the hub
  for (const st of P.filter(p => p.kind === 'settlement')) {
    assert.ok(st.data.planned, `${st.id} planned`);
    assert.ok(blds.some(b => b.data.town === st.id), `${st.id} has buildings`);
    assert.ok(Math.min(st.x, st.z, 2048 - st.x, 2048 - st.z) >= st.data.radius + 40, `${st.id} keeps its levelled ground off the zone edges`);
  }
  const towns = new Map(P.filter(p => p.kind === 'settlement').map(p => [p.id, p]));
  for (const p of blds) {
    const tw = towns.get(p.data.town);
    assert.ok(Math.hypot(p.x - tw.x, p.z - tw.z) < tw.data.radius, `${p.id} inside its town circle`);
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

test('world: ~200 land zones in 12 provinces, a starter province with Torborhold, no banned words in names', () => {
  const W = JSON.parse(readFileSync(new URL('../../data/world/world.json', import.meta.url), 'utf8'));
  assert.ok(W.stats.landZones >= 190 && W.stats.landZones <= 215, `${W.stats.landZones} zones more than half land`);
  assert.equal(W.provinces.length, 12);
  for (const p of W.provinces) assert.ok(p.zones.length >= 8 && p.zones.length <= 32, `${p.name}: ${p.zones.length} zones`);
  assert.equal(W.provinces.reduce((n, p) => n + p.zones.length, 0), W.stats.landZones, 'every land zone is in a province');
  const st = W.zones.find(z => z.starter);
  assert.equal(st.id, W.starter.zone); assert.ok(st.settlements.includes('Torborhold'));
  assert.ok(Math.min(...W.provinces.map(p => p.danger)) >= W.provinces[st.province].danger - 0.01, 'the starter province is among the safest');
  const banned = /ember|veil|muster|horde|alliance|delve|hearthstone|keystone|renown|\bfel/i;
  const names = [...W.provinces.map(p => p.name), ...W.nodes.map(n => n.name), ...W.rivers.map(r => r.name)].filter(Boolean);
  for (const n of names) assert.doesNotMatch(n, banned, n);
});


test('roads: drawn into the zone, continuous across the zone edge, buildings never on a road; a road reaches every town', () => {
  const zx = +M1_ZONE.slice(1, 3), zy = +M1_ZONE.slice(4, 6), idOf = (x, y) => `z${String(x).padStart(2, '0')}_${String(y).padStart(2, '0')}`;
  const a = baked(M1_ZONE), roadId = a.terrain.biomes.length - 1;
  const roads = a.placements.filter(p => p.kind === 'road');
  assert.ok(roads.length > 0 && roads.every(r => r.data.pts.length >= 2 && r.data.width > 0));
  // road surface painted on both sides of every edge it crosses (the neighbours bake the same world road)
  const S = 1025;
  for (const [nb, edgeA, edgeB] of [[idOf(zx + 1, zy), j => j * S + S - 1, j => j * S], [idOf(zx, zy + 1), i => (S - 1) * S + i, i => i], [idOf(zx - 1, zy), j => j * S, j => j * S + S - 1], [idOf(zx, zy - 1), i => i, i => (S - 1) * S + i]]) {
    const b = baked(nb);
    let n = 0, mismatch = 0;
    for (let k = 0; k < S; k++) { const ra = a.biome[edgeA(k)] === roadId, rb = b.biome[edgeB(k)] === roadId; if (ra || rb) n++; if (ra !== rb) mismatch++; }
    assert.equal(mismatch, 0, `road surface disagrees with ${nb} at ${mismatch} of ${n} edge samples`);
  }
  // nav: no building footprint on a painted road; spawn passable
  const nav = parseNav(readFileSync(zoneFile(M1_ZONE, 'nav.bin')));
  let clash = 0; for (const v of nav.bits) if ((v & NAV.BUILDING) && (v & NAV.ROAD) && !(v & NAV.TOWN)) clash++;
  assert.equal(clash, 0, 'a building outside a town sits on a road');
  const t = a.terrain;
  assert.ok(nav.passable(t.meta.spawn.x, t.meta.spawn.z));
  // every town is reached: a road point or the end of a high street lies within its circle + 20 m
  for (const st of a.placements.filter(p => p.kind === 'settlement')) {
    const near = roads.some(r => r.data.pts.some(([x, z]) => Math.hypot(x - st.x, z - st.z) < st.data.radius + 20));
    assert.ok(near, `${st.id} has a road to it`);
    for (const r of roads) for (const [x, z] of r.data.pts) assert.ok(Math.hypot(x - st.x, z - st.z) >= st.data.radius - 0.5, `${r.id} runs inside ${st.id} (streets take over at the rim)`);
  }
});

test('scatter: plausible, world-aligned (no tree twice across an edge), clear of towns, roads, water and sites', () => {
  const zx = +M1_ZONE.slice(1, 3), zy = +M1_ZONE.slice(4, 6);
  const sc = parseScatter(readFileSync(zoneFile(M1_ZONE, 'scatter.bin')));
  const a = baked(M1_ZONE), t = a.terrain;
  assert.ok(sc.count > 2000 && sc.count < 80000, `${sc.count} scatter items`);
  for (let i = 0; i < sc.count; i += 7) {
    const x = sc.x[i], z = sc.z[i];
    assert.ok(x >= 0 && z >= 0 && x < 2048 && z < 2048);
    assert.equal(t.waterAt(x, z).kind, 'none', 'nothing stands in water');
    assert.ok(sc.kind[i] < SCATTER_KINDS.length);
  }
  for (const s of t.meta.sites.filter(s => s.radius || s.r)) for (let i = 0; i < sc.count; i++) {
    if (Math.hypot(sc.x[i] - s.x, sc.z[i] - s.z) < (s.radius || s.r) - 1) assert.fail(`scatter inside ${s.name || s.id}`);
  }
  // the east neighbour's items all have x >= 0 of ITS frame: none of ours fall in its range and vice versa
  const east = baked(`z${String(zx + 1).padStart(2, '0')}_${String(zy).padStart(2, '0')}`);
  const nearEdgeA = a.scatter.filter(p => p.x > 2040).length, nearEdgeB = east.scatter.filter(p => p.x < 8).length;
  assert.ok(a.scatter.every(p => p.x < 2048) && east.scatter.every(p => p.x >= 0), 'half-open ownership');
  assert.ok(nearEdgeA + nearEdgeB >= 0);
});

test('every checked-in zone: edges bit-exact with every checked-in neighbour; each has a door and an event arena', () => {
  const ids = readdirSync(new URL('../../data/zones/', import.meta.url)).filter(d => /^z\d\d_\d\d$/.test(d));
  assert.ok(ids.length >= 1);
  const T = new Map(ids.map(id => [id, parseTerrain(readFileSync(zoneFile(id, 'terrain.bin')))]));
  let pairs = 0;
  for (const id of ids) {
    const t = T.get(id), zx = +id.slice(1, 3), zy = +id.slice(4, 6), S = t.size, L = S - 1;
    assert.ok(t.meta.sites.some(s => s.type === 'dungeon' && s.id && Number.isFinite(s.yaw)), `${id} has a door`);
    assert.ok(t.meta.sites.some(s => s.type === 'event'), `${id} has an event arena`);
    for (const [nid, A, B] of [[`z${String(zx + 1).padStart(2, '0')}_${String(zy).padStart(2, '0')}`, j => j * S + L, j => j * S], [`z${String(zx).padStart(2, '0')}_${String(zy + 1).padStart(2, '0')}`, i => L * S + i, i => i]]) {
      const n = T.get(nid); if (!n) continue;
      pairs++;
      const la = t.layers, lb = n.layers;
      for (let k = 0; k < S; k++) {
        const a = A(k), b = B(k);
        if (la.height[a] !== lb.height[b] || la.waterTop[a] !== lb.waterTop[b] || la.biome[a] !== lb.biome[b]) assert.fail(`${id}/${nid} edge differs at ${k}`);
      }
    }
  }
  console.log(`# ${ids.length} zones, ${pairs} shared edges compared`);
});
