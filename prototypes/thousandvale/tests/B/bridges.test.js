// Stream B — play-test 1 P24: every road over water has a walkable deck that meets the road at both ends.
//   node --test prototypes/thousandvale/tests/B/bridges.test.js
// Reads the CHECKED-IN files of all 16 Torbor Downs zones (zone-bake.test.js proves they match a fresh bake).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTerrain, parseNav, NAV, WADE_DEPTH, DRY_FOOT_DEPTH } from '../../js/rules/terrain-read.js';
import { crossingsOf, RIVER_DEPTH } from '../../tools/lib/world-core.mjs';
import { loadWorld } from '../../tools/bake-zone.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT));
const PMAP = JSON.parse(read('data/world/province-map.json')).provinces.torbor_downs.map;
const ZONES = Object.values(PMAP);
const W = JSON.parse(read('data/world/world.json'));
const zones = new Map();
const zone = id => {
  if (!zones.has(id)) zones.set(id, {
    t: parseTerrain(read(`data/zones/${id}/terrain.bin`)),
    nav: parseNav(read(`data/zones/${id}/nav.bin`)),
    P: JSON.parse(read(`data/zones/${id}/placements.json`)).placements,
  });
  return zones.get(id);
};
/** Bare water depth at (x, z): the water layer over the bare ground (ignores decks). NaN-safe. */
function bareDepth(t, x, z) {
  const S = t.size, gx = Math.min(S - 1.0001, Math.max(0, x / t.step)), gz = Math.min(S - 1.0001, Math.max(0, z / t.step));
  const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, lower = fx + fz <= 1;
  const a = lower ? t.waterOfSample(i, j) : t.waterOfSample(i + 1, j + 1), b = t.waterOfSample(i + 1, j), c = t.waterOfSample(i, j + 1);
  if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c)) return 0;
  const s = lower ? a + (b - a) * fx + (c - a) * fz : a + (c - a) * (1 - fx) + (b - a) * (1 - fz);
  return Math.max(0, s - t.groundAt(x, z));
}
/** Every 0.5 m along a polyline [[x, z, …]…], inside the zone (1 m in from the edges). */
function* walk(pts) {
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let s = 0; s < L; s += 0.5) {
      const x = a[0] + (b[0] - a[0]) * s / L, z = a[1] + (b[1] - a[1]) * s / L;
      if (x > 1 && z > 1 && x < 2047 && z < 2047) yield [x, z];
    }
  }
}

test('world bake: every road crossing of river water has a bridge (crossingsOf over every road)', () => {
  const rivers = W.rivers;
  const missing = [];
  for (const rd of W.roads) for (const c of crossingsOf(rd.pts, rivers)) {
    const near = W.bridges.some(b => Math.hypot(b.x - c.x, b.z - c.z) < Math.max(14, b.span));
    if (!near) missing.push(`road ${rd.id} over river ${c.river} at ${c.x},${c.z}`);
  }
  assert.deepEqual(missing, []);
  assert.ok(W.bridges.length > 100, `${W.bridges.length} bridges`);
});

test('all 16 zones: every road crossing water is on a deck — no road point is deeper than a puddle off a deck', () => {
  const bad = [];
  let checked = 0;
  for (const id of ZONES) {
    const { t, P } = zone(id);
    for (const r of P.filter(p => p.kind === 'road')) for (const [x, z] of walk(r.data.pts)) {
      checked++;
      if (bareDepth(t, x, z) > DRY_FOOT_DEPTH && Number.isNaN(t.deckAt(x, z))) { bad.push(`${id} ${r.id} ${x.toFixed(1)},${z.toFixed(1)} depth ${bareDepth(t, x, z).toFixed(2)}`); break; }
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(checked > 50000, `${checked} road samples`);
});

test('all 16 zones: every road and street point is walkable (bridge, ford or dry ground), never swum', () => {
  const bad = [];
  for (const id of ZONES) {
    const { t, nav, P } = zone(id);
    for (const r of P.filter(p => p.kind === 'road' || p.kind === 'street')) for (const [x, z] of walk(r.data.pts)) {
      const k = t.moveAt(x, z);
      if (k === 'swim' || k === 'steep') { bad.push(`${id} ${r.id} ${x.toFixed(1)},${z.toFixed(1)} ${k} slope ${t.slopeAt(x, z).toFixed(0)}`); break; }
      if (r.kind === 'road' && !Number.isNaN(t.deckAt(x, z)) && !(nav.at(x, z) & NAV.WALK)) { bad.push(`${id} ${r.id} deck not WALK in nav at ${x.toFixed(1)},${z.toFixed(1)}`); break; }
    }
  }
  assert.deepEqual(bad, []);
});

test('all 16 zones: each bridge deck meets the road at BOTH ends and sits sensibly above the water', () => {
  const bad = [];
  let n = 0;
  for (const id of ZONES) {
    const { t, P } = zone(id);
    // a bridge is one placement, or a chain of pieces (data.part) — its outer ends are the first piece's a, the last's b
    const groups = new Map();
    for (const b of P.filter(p => p.kind === 'bridge')) {
      const key = b.data.bridge || b.id; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(b);
    }
    for (const [key, parts] of groups) {
      parts.sort((p, q) => (p.data.part?.[0] ?? 0) - (q.data.part?.[0] ?? 0));
      n++;
      const deck = parts[0].data.deck, A = parts[0].data.a, B = parts[parts.length - 1].data.b;
      assert.ok(parts.every(p => p.data.deck === deck), `${key}: one deck height`);
      const ends = [[A, parts[0].data.b], [B, parts[parts.length - 1].data.a]];
      for (const [end, other] of ends) {
        const L = Math.hypot(end[0] - other[0], end[1] - other[1]), ux = (end[0] - other[0]) / L, uz = (end[1] - other[1]) / L;
        assert.equal(end[2], deck, `${key}: end carries the deck height`);
        // the road just outside the deck end is at the deck height, the deck just inside is the deck
        const road = t.heightAt(end[0] + ux * 0.4, end[1] + uz * 0.4), onDeck = t.heightAt(end[0] - ux * 0.4, end[1] - uz * 0.4);
        if (Math.abs(road - deck) > 0.15) bad.push(`${id} ${key}: road ${road.toFixed(2)} vs deck ${deck} at an end`);
        if (Math.abs(onDeck - deck) > 0.01) bad.push(`${id} ${key}: deck surface ${onDeck.toFixed(2)} vs ${deck}`);
        if (t.deckAt(end[0] - ux * 0.4, end[1] - uz * 0.4) !== deck) bad.push(`${id} ${key}: reader has no deck at an end`);
        // and the approach climbs gently (≤ 1 in 3 over the first 3 m)
        const far = t.heightAt(end[0] + ux * 3.4, end[1] + uz * 3.4);
        if (Math.abs(far - road) / 3 > 0.34) bad.push(`${id} ${key}: approach too steep (${(far - road).toFixed(2)} m in 3 m)`);
      }
      const clear = deck - parts[0].data.surface;
      if (clear < 0.9 || clear > 6.5) bad.push(`${id} ${key}: deck ${clear.toFixed(2)} m above the water`);
      // the whole span is walkable deck, and nothing under it is a swim
      for (const p of parts) {
        const [ax, az] = p.data.a, [bx, bz] = p.data.b, L = Math.hypot(bx - ax, bz - az);
        for (let s = 0.2; s < L - 0.2; s += 0.5) {
          const x = ax + (bx - ax) * s / L, z = az + (bz - az) * s / L;
          if (!t.walkable(x, z) || t.moveAt(x, z) !== 'walk') { bad.push(`${id} ${key}: deck not walkable at ${x.toFixed(1)},${z.toFixed(1)}`); break; }
          if (t.heightAt(x, z) > deck + 0.3) { bad.push(`${id} ${key}: ground pokes through the deck at ${x.toFixed(1)},${z.toFixed(1)}`); break; }
        }
      }
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(n >= 30, `${n} bridges across Torbor Downs`);
});

test('P2: small streams are wadeable all the way across; rivers are swum in the middle, never a wall', () => {
  const bad = [];
  const counts = { wade: 0, swim: 0 };
  // (the rivers as baked: with the bays applied, a river ends at its mouth — play-test 11 Z61, tools/lib/world-core.mjs)
  const RIVERS = loadWorld().json.rivers;
  for (const id of ZONES) {
    const { t } = zone(id), z0 = W.zones.find(z => z.id === id).origin;
    for (const r of RIVERS) {
      if (r.bbox[2] < z0.x || r.bbox[0] > z0.x + 2048 || r.bbox[3] < z0.z || r.bbox[1] > z0.z + 2048) continue;
      for (let k = 0; k < r.pts.length - 1; k += 3) {
        const a = r.pts[k], b = r.pts[k + 1], x = a[0] - z0.x, z = a[1] - z0.z, cls = Math.max(a[3], b[3]);
        if (x < 30 || z < 30 || x > 2018 || z > 2018) continue;
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
        for (let o = -12; o <= 12; o += 0.5) {
          const px = x + nx * o, pz = z + nz * o, kind = t.moveAt(px, pz);
          if (!Number.isNaN(t.deckAt(px, pz))) continue;
          if (t.waterAt(px, pz).kind === 'sea') continue;          // where a stream meets the sea, the sea is the sea
          if (cls === 1 && kind === 'swim') { bad.push(`${id} stream ${r.id} swim at ${px.toFixed(1)},${pz.toFixed(1)} depth ${t.waterAt(px, pz).depth.toFixed(2)}`); break; }
          if (kind === 'wade') counts.wade++;
          if (kind === 'swim') { counts.swim++; if (!t.passable(px, pz)) bad.push(`${id} river ${r.id}: swim water not passable`); }
        }
      }
    }
  }
  assert.deepEqual(bad.slice(0, 10), []);
  assert.ok(RIVER_DEPTH[1] + 0.3 <= WADE_DEPTH, 'a stream centre is wadeable by construction');
  assert.ok(counts.wade > 1000 && counts.swim > 100, JSON.stringify(counts));
});
