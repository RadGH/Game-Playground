// Stream B — the M2 gate for the world bake (PLAN §15 M2: "variety + reachability + sameness tests green for every
// zone"; §16: "reachability bot to every site", "sameness fingerprint between neighbours").
//   node --test prototypes/thousandvale/tests/B/zone-reach.test.js
// Variety of CONTENT (≥ 40 distinct vignettes in any 5 neighbouring zones) is stream E's test (tests/E/province.test.js);
// this file covers what the bake decides: can you walk there, and does each zone look like its own place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { provinceReach } from '../../tools/lib/province-reach.mjs';
import { provinceFingerprints } from '../../tools/lib/zone-fingerprint.mjs';
import { parseTerrain } from '../../js/rules/terrain-read.js';

const MAP = JSON.parse(readFileSync(new URL('../../data/world/province-map.json', import.meta.url), 'utf8')).provinces.torbor_downs;
const ZONES = Object.values(MAP.map);
let REACH = null;
const reach = () => (REACH ||= provinceReach('torbor_downs'));

test('REACHABILITY: on foot from Torborhold, every settlement, door, event arena, camp, ford and vignette in all 16 zones', () => {
  const r = reach();
  assert.equal(r.zones.length, 16, 'all 16 Torbor Downs zones are baked with nav');
  const bad = r.targets.filter(t => !t.ok).map(t => `${t.zone} ${t.what} (${Math.round(t.x)}, ${Math.round(t.z)})`);
  assert.deepEqual(bad, [], 'unreachable: ' + bad.join('; '));
  for (const z of ZONES) {
    const n = r.targets.filter(t => t.zone === z);
    assert.ok(n.some(t => t.what.startsWith('door ')), `${z}: a reachable dungeon door`);
    assert.ok(n.some(t => t.what.startsWith('event ')), `${z}: a reachable event arena`);
  }
  console.log(`# ${r.targets.length} targets reached; ${(r.reachedShare * 100).toFixed(1)}% of all walkable ground is one connected piece`);
});

test('REACHABILITY: no zone is walled off — most of every zone\'s walkable ground joins the province', () => {
  const r = reach();
  assert.ok(r.reachedShare > 0.95, `only ${(r.reachedShare * 100).toFixed(1)}% of walkable ground is connected`);
  for (const z of r.perZone) {
    assert.ok(z.walkable > 0.6, `${z.id}: only ${(z.walkable * 100).toFixed(0)}% walkable`);
    assert.ok(z.reachedShare > 0.85, `${z.id} (${z.sheetZone}): only ${(z.reachedShare * 100).toFixed(1)}% of its walkable ground can be reached`);
  }
});

test('REACHABILITY: every bridge deck is walkable in nav (a river never cuts a road)', async () => {
  const { parseNav, NAV } = await import('../../js/rules/terrain-read.js');
  let decks = 0;
  for (const z of ZONES) {
    const nav = parseNav(readFileSync(new URL(`../../data/zones/${z}/nav.bin`, import.meta.url)));
    const pl = JSON.parse(readFileSync(new URL(`../../data/zones/${z}/placements.json`, import.meta.url), 'utf8')).placements;
    for (const b of pl.filter(p => p.kind === 'bridge')) {
      decks++;
      for (const s of [-0.5, 0, 0.5]) {
        const x = b.x + Math.sin(b.yaw) * b.data.span * s, zz = b.z + Math.cos(b.yaw) * b.data.span * s;
        if (x < 0 || zz < 0 || x > 2048 || zz > 2048) continue;
        const bits = nav.at(x, zz);
        assert.ok(bits & NAV.WALK && !(bits & NAV.DEEP), `${z} ${b.id}: deck at ${s} of the span is not walkable (${bits})`);
      }
    }
  }
  assert.ok(decks > 0, 'the province has bridges');
});

test('SAMENESS: every pair of neighbouring zones differs in at least 3 noticeable ways, and no two zones share a fingerprint', () => {
  const { fps, pairs } = provinceFingerprints('torbor_downs');
  assert.equal(fps.length, 16);
  assert.equal(pairs.length, 24, '4x4 grid has 24 neighbour pairs');
  for (const p of pairs) {
    assert.ok(p.differences.length >= 3, `${p.a.id} (${p.a.sheetZone}) / ${p.b.id} (${p.b.sheetZone}) differ only in: ${p.differences.join(', ') || 'nothing'}`);
    assert.ok(p.distance >= 1, `${p.a.id}/${p.b.id}: measured distance ${p.distance} — the ground reads as the same place`);
  }
  // nothing in the province is a copy of anything else, neighbours or not
  for (let i = 0; i < fps.length; i++) for (let j = i + 1; j < fps.length; j++) {
    const a = fps[i], b = fps[j];
    const same = JSON.stringify({ ...a, id: 0, sheetZone: 0 }) === JSON.stringify({ ...b, id: 0, sheetZone: 0 });
    assert.ok(!same, `${a.id} and ${b.id} have identical fingerprints`);
  }
  const near = pairs.slice().sort((x, y) => x.distance - y.distance)[0];
  console.log(`# closest neighbours: ${near.a.sheetZone}/${near.b.sheetZone} d=${near.distance} (${near.differences.join(', ')})`);
});

test('SAMENESS: no stamped terrain — no 128 m patch of ground shape repeats anywhere in the province', () => {
  // hash each 64x64-sample patch by its height DIFFERENCES (so the same shape at another height still matches);
  // skip near-flat patches (levelled towns, lake beds), which are alike by design
  const seen = new Map();
  let patches = 0;
  for (const z of ZONES) {
    const t = parseTerrain(readFileSync(new URL(`../../data/zones/${z}/terrain.bin`, import.meta.url)));
    const h = t.layers.height, S = t.size;
    for (let pj = 0; pj + 64 < S; pj += 64) for (let pi = 0; pi + 64 < S; pi += 64) {
      let hash = 2166136261, lo = 65535, hi = 0;
      for (let j = 0; j < 64; j += 2) for (let i = 0; i < 64; i += 2) {
        const k = (pj + j) * S + pi + i, v = h[k];
        if (v < lo) lo = v; if (v > hi) hi = v;
        hash = Math.imul(hash ^ ((v - h[k + 1]) & 0xffff), 16777619) >>> 0;
        hash = Math.imul(hash ^ ((v - h[k + S]) & 0xffff), 16777619) >>> 0;
      }
      if (hi - lo < 60) continue;                  // < ~2 m of relief across 128 m
      patches++;
      const key = hash.toString(16), prev = seen.get(key);
      assert.ok(!prev, `ground patch at ${z} (${pi * 2}, ${pj * 2}) repeats ${prev}`);
      seen.set(key, `${z} (${pi * 2}, ${pj * 2})`);
    }
  }
  assert.ok(patches > 1000, `only ${patches} patches with relief were compared`);
});

test('SAMENESS: no two settlements share a town plan', () => {
  const plans = new Map();
  for (const z of ZONES) {
    const pl = JSON.parse(readFileSync(new URL(`../../data/zones/${z}/placements.json`, import.meta.url), 'utf8')).placements;
    const byTown = {};
    for (const b of pl.filter(p => p.kind === 'building')) (byTown[b.data.town] ||= []).push(`${b.data.want}:${b.data.w.toFixed(1)}x${b.data.d.toFixed(1)}`);
    for (const [town, list] of Object.entries(byTown)) {
      if (list.length < 3) continue;
      const key = list.sort().join('|');
      assert.ok(!plans.has(key), `${z} ${town} has the same buildings as ${plans.get(key)}`);
      plans.set(key, `${z} ${town}`);
    }
  }
  assert.ok(plans.size >= 20, `only ${plans.size} planned settlements`);
});

test('THEMES: the ground matches E\'s watery archetypes (lead ruling) — fen, salt shore, meres; pools are wadeable', () => {
  const themes = JSON.parse(readFileSync(new URL('../../data/world/zone-themes.json', import.meta.url), 'utf8'));
  for (const [z, th] of Object.entries(themes)) {
    if (z.startsWith('_')) continue;
    const t = parseTerrain(readFileSync(new URL(`../../data/zones/${z}/terrain.bin`, import.meta.url)));
    assert.equal(t.meta.theme?.kind, th.theme, `${z} carries its theme`);
    const lakes = t.meta.theme.lakes;
    assert.ok(lakes.length >= 1, `${z} has water`);
    for (const l of lakes) {
      const w = t.waterAt(l.x, l.z);
      assert.equal(w.kind, 'lake', `${z} ${l.name || 'pool'}: water at its centre`);
      if (l.kind === 'pool') assert.ok(w.depth <= 1.1, `${z} pool at ${l.x},${l.z} is ${w.depth.toFixed(2)} m deep — must be wadeable`);
      for (const s of t.meta.sites.filter(s => s.type === 'settlement')) assert.ok(Math.hypot(s.x - l.x, s.z - l.z) > s.radius + l.r, `${z} ${l.name} floods ${s.name}`);
      assert.ok(Math.min(l.x, l.z, 2048 - l.x, 2048 - l.z) > l.r * 1.3 + 120, `${z} ${l.name} keeps off the zone edges`);
    }
    const count = key => { let n = 0; const id = t.biomes.findIndex(b => b.key === key); for (let k = 0; k < t.layers.biome.length; k += 7) if (t.layers.biome[k] === id) n++; return n; };
    if (th.theme === 'marsh') assert.ok(count('marsh') > 2000 && lakes.filter(l => l.kind === 'pool').length >= 8, `${z}: a fen of pools`);
    if (th.theme === 'shore') assert.ok(count('beach') > 300 && lakes[0].r >= 300, `${z}: a big lake with a beach`);
    if (th.theme === 'mere') assert.ok(lakes.filter(l => l.kind === 'mere').length >= 2, `${z}: meres`);
  }
});
