// Stream T — Vharlen, the Burning Isle (docs/EXPANSION-1.md §2–§3, tools/lib/vharlen.mjs): the island's nine zones are
// baked, match on every shared edge, are reachable on foot from Port Vharl, and look like themselves; and none of it
// moved a single sample of Torbor Downs.   node --test prototypes/thousandvale/tests/B/vharlen.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseTerrain, parseScatter, SCATTER_KINDS } from '../../js/rules/terrain-read.js';
import { bakeZone, zoneFiles } from '../../tools/bake-zone.mjs';
import { sameLayerFile } from '../../tools/lib/zone-layers.mjs';
import { provinceReach } from '../../tools/lib/province-reach.mjs';
import { VHARLEN } from '../../tools/lib/vharlen.mjs';

const read = p => readFileSync(new URL(`../../${p}`, import.meta.url));
const PM = JSON.parse(read('data/world/province-map.json')).provinces;
const VZ = PM.vharlen.map, TZ = PM.torbor_downs.map;
const T = id => parseTerrain(read(`data/zones/${id}/terrain.bin`));
const P = id => JSON.parse(read(`data/zones/${id}/placements.json`)).placements;
const layerHash = t => { const h = createHash('sha256'); for (const k of ['height', 'waterTop', 'waterKind', 'biome']) { const a = t.layers[k]; h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); } return h.digest('hex').slice(0, 16); };

/** Torbor Downs' 16 zones as they were baked before the islands (decoded layers): the expansion must not touch them. */
const TORBOR_LAYERS = { z11_01: '36770e0f17da1c5b', z12_01: '1e60915abf61232a', z13_01: 'd55b9d9b54ae647f', z14_01: 'a898cd13773a3520', z11_02: '2ecca1144b68bbbc', z12_02: '48ac4c1ed1b997d4', z13_02: '177777d488f00a0e', z14_02: 'dfeac22610dc22f2' /* play-test 11 Z61: Gullwick Bay (tools/lib/world-core.mjs BAYS; tests/B/coast.test.js) */, z11_03: 'fd0e8c5d6e662e36', z12_03: 'c687ea6ab12bf1ed', z13_03: 'bb673688ecd28879', z14_03: 'fd981031621814c3', z11_04: '6ee427adf059cf99', z12_04: '05cb706119a9e387', z13_04: '0be5104bdd5967ec', z14_04: '23d6536916fa1dd7' };

test('Torbor Downs is untouched: all 16 checked-in zones keep their layers, and a fresh bake of a coastal one still matches', () => {
  for (const id of Object.values(TZ)) assert.equal(layerHash(T(id)), TORBOR_LAYERS[id], `${id} terrain layers changed`);
  // z14_04 is the corner nearest the sea and Vharlen: the continent code runs right past it
  const files = zoneFiles(bakeZone('z14_04'));
  for (const [f, v] of Object.entries(files)) assert.ok(sameLayerFile(f, v, read(`data/zones/z14_04/${f}`)), `z14_04 ${f} differs from a fresh bake`);
});

test('Vharlen: nine zones baked, every shared edge bit for bit (height, water, kind, biome), the island set in deep sea', () => {
  assert.equal(Object.keys(VZ).length, 9);
  const ids = Object.values(VZ), L = 1024;
  const t = Object.fromEntries(ids.map(id => [id, T(id)]));
  let edges = 0;
  for (const id of ids) {
    const zx = +id.slice(1, 3), zy = +id.slice(4, 6), S = t[id].size;
    for (const [nid, A, B] of [[`z${zx + 1}_${String(zy).padStart(2, '0')}`, j => j * S + L, j => j * S], [`z${zx}_${String(zy + 1).padStart(2, '0')}`, i => L * S + i, i => i]]) {
      const n = t[nid]; if (!n) continue;
      edges++;
      const la = t[id].layers, lb = n.layers;
      for (let k = 0; k < S; k++) {
        const a = A(k), b = B(k);
        assert.ok(la.height[a] === lb.height[b] && la.waterTop[a] === lb.waterTop[b] && la.waterKind[a] === lb.waterKind[b] && la.biome[a] === lb.biome[b], `${id}/${nid} edge differs at ${k}`);
      }
    }
    assert.equal(t[id].meta.palette, 'vharl', `${id} carries Vharlen's palette`);
  }
  assert.equal(edges, 12, 'a 3×3 block has 12 inner edges');
  // the outer rim of the block is open sea, several metres deep
  for (const [id, xs, zs] of [['z11_09', [0], [0, 1000, 2047]], ['z13_11', [2047], [0, 1000, 2047]], ['z12_09', [0, 1000, 2047], [0]], ['z12_11', [0, 1000, 2047], [2047]]]) {
    for (const x of xs) for (const z of zs) { const w = t[id].waterAt(x, z); assert.ok(w.kind === 'sea' && w.depth > 20, `${id} (${x}, ${z}) is deep sea (${w.kind} ${w.depth})`); }
  }
});

test('Vharlen: a fresh bake of the Caldera matches the checked-in files', () => {
  const files = zoneFiles(bakeZone('z12_10'));
  for (const [f, v] of Object.entries(files)) assert.ok(sameLayerFile(f, v, read(`data/zones/z12_10/${f}`)), `${f} stale — run tools/bake-zone.mjs --province vharlen`);
});

test('Vharlen: a volcano with a caldera lake, walkable rim gaps, a flat east harbour shore', () => {
  const c = T('z12_10'), [cx, cz] = VHARLEN.centre, ox = 12 * 2048, oz = 10 * 2048;
  let peak = 0; for (let a = 0; a < 64; a++) { const r = VHARLEN.rim; peak = Math.max(peak, c.heightAt(cx - ox + Math.cos(a / 64 * 6.283) * r, cz - oz + Math.sin(a / 64 * 6.283) * r)); }
  assert.ok(peak > 600 && peak < 800, `rim crest ${peak.toFixed(0)} m`);
  const lake = c.waterAt(cx - ox + VHARLEN.lake.dx, cz - oz + VHARLEN.lake.dz);
  assert.equal(lake.kind, 'lake'); assert.ok(lake.surface > 400, 'the crater lake is up in the caldera');
  // the floor is reached through the gaps: walking out along a gap's bearing from the floor stays walkable
  for (const g of VHARLEN.gaps) for (let r = 290; r <= 760; r += 10) {          // (from the wall foot: the north-west gap opens onto the lake)
    const x = cx - ox + Math.cos(g) * r, z = cz - oz + Math.sin(g) * r;
    assert.ok(c.walkable(x, z), `gap ${g} blocked at r ${r} (${c.slopeAt(x, z).toFixed(0)}°)`);
  }
  // Port Vharl: a town on gentle ground with its harbour on the east shore
  const pl = P('z13_10'), port = pl.find(p => p.kind === 'settlement' && p.data.name === 'Port Vharl'), hb = pl.find(p => p.kind === 'harbour');
  assert.ok(port?.data.hub && hb, 'Port Vharl and its harbour');
  assert.ok(hb.x > port.x && Math.abs(hb.yaw - Math.PI / 2) < 0.01, 'the harbour faces east, out to sea');
  const b = T('z13_10');
  let steep = 0; for (let x = port.x + 100; x < hb.x; x += 5) steep = Math.max(steep, b.slopeAt(x, hb.z));
  assert.ok(steep < 10, `the shore below Port Vharl is flat (steepest ${steep.toFixed(1)}°)`);
});

test('Vharlen: one planned Vharl settlement per zone, a door and an event arena each, Ossathra\'s arena in the caldera', () => {
  const names = new Set();
  for (const [eid, id] of Object.entries(VZ)) {
    const pl = P(id), sets = pl.filter(p => p.kind === 'settlement');
    assert.equal(sets.length, 1, `${id} has one settlement`);
    assert.ok(sets[0].data.planned && pl.some(p => p.kind === 'building' && p.data.town === sets[0].id), `${sets[0].id} is planned`);
    assert.equal(pl.find(p => p.kind === 'town_square').data.culture, 'vharl');
    names.add(sets[0].data.name);
    assert.ok(pl.some(p => p.kind === 'dungeon_door'), `${id} door`);
    assert.ok(pl.some(p => p.kind === 'event_site' && p.id === `event_${eid}`), `${id} event arena`);
  }
  assert.deepEqual([...names].sort(), ['Cinderholt', 'Kilnhold', 'Lastwell', 'Mistfall', 'Port Vharl', 'Rim Shrine', 'Shardhaven', 'Stiltreach', 'Yellowpan']);
  const boss = P(VZ.the_caldera).find(p => p.id === 'world_ossathra');
  assert.ok(boss && boss.data.r === 100, 'world boss arena');
  const [cx, cz] = VHARLEN.centre;
  assert.ok(Math.hypot(boss.x + 12 * 2048 - cx, boss.z + 10 * 2048 - cz) < VHARLEN.wallFoot - 50, 'Ossathra waits on the crater floor');
});

test('Vharlen: reachable on foot from Port Vharl — every settlement, door, arena and the crater floor', () => {
  const r = provinceReach('vharlen');
  assert.equal(r.zones.length, 9); assert.equal(r.hub.zone, 'z13_10');
  const bad = r.targets.filter(t => !t.ok).map(t => `${t.zone} ${t.what}`);
  assert.deepEqual(bad, []);
  assert.ok(r.reachedShare > 0.98, `${(r.reachedShare * 100).toFixed(1)}% of the island's walkable ground is one piece`);
});

test('Vharlen: its own ground and its own things on it — not Torbor Downs re-skinned', () => {
  const vharlKinds = new Set(['tree_fern', 'ironpalm', 'tree_charred', 'basalt_columns', 'obsidian', 'steam_vent', 'sulphur_crust']);
  const torborOnly = new Set(['tree_broadleaf', 'tree_conifer', 'tree_acacia', 'tree_fruit', 'hedge']);
  const seen = new Set(), biomes = new Set();
  for (const id of Object.values(VZ)) {
    const sc = parseScatter(read(`data/zones/${id}/scatter.bin`));
    for (let i = 0; i < sc.count; i++) { const k = SCATTER_KINDS[sc.kind[i]].key; seen.add(k); assert.ok(!torborOnly.has(k), `${id}: a ${k} on Vharlen`); }
    const t = T(id); for (let z = 8; z < 2048; z += 64) for (let x = 8; x < 2048; x += 64) biomes.add(t.biomes[t.biomeAt(x, z)].key);
  }
  for (const k of vharlKinds) assert.ok(seen.has(k), `no ${k} anywhere`);
  for (const k of ['beach', 'rainforest', 'desert', 'marsh', 'volcanic', 'ashPlain', 'badlands', 'glimmerwaste']) assert.ok(biomes.has(k), `no ${k} (${T(VZ.blackstrand).meta.biomeNames[k]})`);
  for (const k of ['grassland', 'temperateForest', 'hills', 'savanna2']) assert.ok(!biomes.has(k), `Torbor's ${k} on Vharlen`);
});
