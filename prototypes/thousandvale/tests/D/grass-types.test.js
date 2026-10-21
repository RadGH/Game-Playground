// node --test prototypes/thousandvale/tests/D/grass-types.test.js
// 2026-10-20 GPU grass: the pure half (js/client/grass-types.js). Every biome any zone's terrain declares has a row (no
// silent fallback), Torbor Downs (`downs`) and Vharlen (`vharl`) each get grass of their own, nothing grows on roads,
// towns, buildings, solids, water or steep ground, the type table the shader reads matches the types, the distances
// grow thinner further out, and the lattice cannot crawl (an instance draws a whole square and nothing of its own).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { NAV, parseTerrain } from '../../js/rules/terrain-read.js';
import {
  GRASS_TYPES, TYPE_INDEX, GRASS_BIOMES, GRASS_PALETTES, grassRow, grassAt, GRASS_DISTANCES, GRASS_DISTANCE_IDS, grassDistanceFor,
  grassLattice, snapOrigin, grassHash, typeTable, TYPE_ROWS, patchNoise, hexLinear, RINGS, bladesPerSlot,
} from '../../js/client/grass-types.js';
import { cleanSettings, SETTINGS_DEFAULTS } from '../../js/client/ui/pt2-core.js';
import { ATMOS_TIERS } from '../../js/client/gfx-tiers.js';

const OPEN = NAV.WALK;
const ZONES = new URL('../../data/zones/', import.meta.url);

/** Every (palette, biome key) the baked zones declare — read from each terrain.bin's own header. */
function declared() {
  const out = new Map();
  if (!existsSync(ZONES)) return out;
  for (const z of readdirSync(ZONES)) {
    const f = new URL(`${z}/terrain.bin`, ZONES);
    if (!existsSync(f)) continue;
    try {
      const b = readFileSync(f), t = parseTerrain(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
      const p = t.meta.palette || '';
      if (!out.has(p)) out.set(p, new Set());
      for (const [key] of t.meta.biomes || []) out.get(p).add(key);
    } catch { /* a zone being re-baked right now */ }
  }
  return out;
}

test('every biome a zone declares has an explicit grass row, and every row names a real type', () => {
  const seen = declared();
  assert.ok(seen.size > 0, 'no baked zones found');
  for (const [palette, keys] of seen) for (const b of keys) {
    assert.ok(GRASS_BIOMES[b] || GRASS_PALETTES[palette]?.[b], `no grass row for ${b} (palette ${palette || 'none'})`);
  }
  for (const rows of [GRASS_BIOMES, ...Object.values(GRASS_PALETTES)]) for (const [b, r] of Object.entries(rows)) {
    assert.ok(r.type === 'none' || TYPE_INDEX[r.type] > 0, `${b}: unknown type ${r.type}`);
    if (r.mix) assert.ok(TYPE_INDEX[r.mix[0]] > 0 && r.mix[1] > 0 && r.mix[1] < 1, `${b}: bad mix`);
    assert.ok(r.cover >= 0 && r.cover <= 1, `${b}: cover ${r.cover}`);
  }
});

test('grass grows where it should: meadows, moors, fens, forests yes; sand, ice, rock, roads and fields no', () => {
  for (const b of ['grassland', 'hallowed', 'hills', 'savanna', 'marsh', 'temperateForest', 'tundra', 'rainforest']) assert.ok(grassRow(b).cover > 0, b);
  for (const b of ['beach', 'desert', 'ice', 'snowyPeaks', 'road', 'crop', 'gravel', 'ocean', 'deepOcean']) assert.equal(grassRow(b).cover, 0, b);
  for (const b of ['beach', 'snowyPeaks']) assert.equal(grassRow(b, 'downs').cover, 0, 'downs ' + b);
  assert.equal(grassRow('desert', 'vharl').cover, 0);
});

test('Torbor Downs and Vharlen each get grass of their own', () => {
  const at = (biome, palette, n = 400) => { const types = new Map(); for (let k = 0; k < n; k++) { const g = grassAt({ biome, palette, nav: OPEN, x: 24000 + k * 3.7, z: 4000 + k * 1.3 }); if (g) types.set(GRASS_TYPES[g.type].id, (types.get(GRASS_TYPES[g.type].id) || 0) + 1); } return types; };
  const main = m => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  // the downs: one look per region
  assert.equal(main(at('grassland', 'downs')), 'turf', 'Chalk Downs');
  assert.equal(main(at('hallowed', 'downs')), 'meadow', "Saint's Meadow");
  assert.equal(main(at('hills', 'downs')), 'heather', 'Heather Moor');
  assert.equal(main(at('savanna', 'downs')), 'wild', 'Golden Wolds');
  assert.equal(main(at('marsh', 'downs')), 'reed', 'Brack Fen');
  assert.equal(main(at('temperateForest', 'downs')), 'forest', 'Oakwood');
  assert.equal(main(at('tundra', 'downs')), 'fell', 'High Fell');
  assert.equal(main(at('veiledHills', 'downs')), 'withered', 'Blackthorn Scar');
  // Vharlen: ash grass where Torbor has turf, broad blades in the jungle, sparser overall
  assert.equal(main(at('grassland', 'vharl')), 'ash');
  assert.equal(main(at('rainforest', 'vharl')), 'jungle');
  assert.ok(grassRow('grassland', 'vharl').cover < grassRow('grassland', 'downs').cover);
  assert.notDeepEqual(grassRow('grassland', 'vharl'), grassRow('grassland'));
  // patches: a meadow with a second type grows both, in clumps (neighbouring metres mostly agree)
  const mix = at('hills', 'downs', 2000);
  assert.ok(mix.get('heather') > 0 && mix.get('fell') > 0, [...mix].join());
  let same = 0; for (let k = 0; k < 500; k++) { const a = grassAt({ biome: 'hills', palette: 'downs', nav: OPEN, x: 24000 + k * 5, z: 4200 }), b = grassAt({ biome: 'hills', palette: 'downs', nav: OPEN, x: 24001 + k * 5, z: 4200 }); if (a.type === b.type) same++; }
  assert.ok(same > 450, 'patches, not salt and pepper: ' + same);
});

test('nothing grows on roads, in towns, on buildings or solids, in water, off walkable ground, or on steep ground', () => {
  for (const bit of [NAV.ROAD, NAV.TOWN, NAV.BUILDING, NAV.SOLID, NAV.SHALLOW, NAV.DEEP, NAV.STEEP]) {
    for (let k = 0; k < 100; k++) assert.equal(grassAt({ biome: 'grassland', palette: 'downs', nav: OPEN | bit, x: k * 7, z: 3 }), null, 'bit ' + bit);
  }
  assert.equal(grassAt({ biome: 'grassland', nav: 0, x: 1, z: 1 }), null, 'no nav = no grass');
  const g = grassAt({ biome: 'grassland', nav: OPEN, x: 1, z: 1 });
  assert.ok(g && g.cover > 0 && g.cover <= 1);
});

test('the shader table: one block of rows per type, linear colours, flower heads where the type has them', () => {
  const t = typeTable();
  assert.equal(t.length, GRASS_TYPES.length * TYPE_ROWS * 4);
  for (let i = 0; i < 4 * TYPE_ROWS; i++) assert.equal(t[i], 0, 'type 0 (no grass) is all zero');
  GRASS_TYPES.forEach((T, i) => {
    if (!T) return;
    const o = i * TYPE_ROWS * 4;
    assert.deepEqual([t[o], t[o + 1], t[o + 2], t[o + 3]].map(v => +v.toFixed(4)), [T.h[0], T.h[1], T.w, T.dense].map(v => +v.toFixed(4)), T.id);
    assert.ok(T.h[0] > 0 && T.h[1] >= T.h[0] && T.h[1] < 2 && T.w > 0 && T.w < 0.2, T.id);
    assert.ok(Math.abs(t[o + 7] - T.flower.p) < 1e-6);
    for (let k = 8; k < 24; k++) if ((k & 3) !== 3) assert.ok(t[o + k] >= 0 && t[o + k] <= 1, `${T.id} colour ${k}`);
  });
  // the looks really differ: reeds are the tallest and thinnest, jungle the broadest, heather mostly flowers, turf shorter than meadow
  const by = id => GRASS_TYPES[TYPE_INDEX[id]];
  assert.ok(by('reed').h[1] > by('wild').h[1] && by('reed').w < by('turf').w);
  assert.ok(by('jungle').w === Math.max(...GRASS_TYPES.filter(Boolean).map(x => x.w)));
  assert.ok(by('heather').flower.p > 0.5 && by('meadow').flower.p > by('turf').flower.p);
  assert.ok(by('turf').h[1] < by('meadow').h[1] && by('meadow').h[1] < by('wild').h[1], 'turf shorter than meadow, meadow shorter than wild grass');
  assert.deepEqual(hexLinear('#ffffff'), [1, 1, 1]); assert.deepEqual(hexLinear('#000000'), [0, 0, 0]);
});

test('distances: further reaches more ground with fewer blades a square metre; auto = Medium on phones, Far otherwise, none on Low', () => {
  let prev = null;
  for (const id of ['near', 'medium', 'far', 'veryFar']) {
    const D = GRASS_DISTANCES[id], L = grassLattice(id);
    assert.ok(Math.abs(L.count - D.slots) / D.slots < 0.06, `${id}: ${L.count} slots for ${D.slots}`);
    assert.equal(L.blades, L.count * bladesPerSlot(id));
    assert.ok(bladesPerSlot(id) >= 3 && bladesPerSlot(id) <= 6, 'a slot is a clump of 3-6 blades');
    const perM2 = L.count / (Math.PI * D.radius ** 2);
    if (prev) { assert.ok(D.radius > prev.r && perM2 < prev.d, id); }
    prev = { r: D.radius, d: perM2 };
  }
  assert.equal(grassLattice('off').count, 0);
  assert.equal(grassDistanceFor('auto', { quality: 'high' }), 'far');
  assert.equal(grassDistanceFor('auto', { quality: 'high', phone: true }), 'medium');
  assert.equal(grassDistanceFor('auto', { quality: 'medium' }), 'medium');
  assert.equal(grassDistanceFor('veryFar', { quality: 'low' }), 'off');
  assert.equal(grassDistanceFor('near', { quality: 'medium' }), 'near');
  // the phone's default costs no more blades than the CPU tufts it replaced on Medium (~25k blades: 30 m reach, 1.15 m
  // cells, 88% grown, 75% density, 18 blades a tuft)
  const oldMedium = Math.PI * 30 * 30 / (1.15 * 1.15) * 0.88 * 0.75 * 18;
  assert.ok(grassLattice('medium').blades <= oldMedium, `${grassLattice('medium').blades} vs ${Math.round(oldMedium)}`);
  // no bare gaps near you: inside 15 m on Medium there is at least one clump per square metre
  { const L = grassLattice('medium'); let n = 0; for (let k = 0; k < L.count; k++) if (Math.hypot(L.offsets[k * 2], L.offsets[k * 2 + 1]) * L.cell < 15) n++; assert.ok(n / (Math.PI * 225) >= 1, `${(n / (Math.PI * 225)).toFixed(2)} clumps a square metre inside 15 m`); }
  // the setting round-trips
  assert.equal(SETTINGS_DEFAULTS.grass, 'auto');
  for (const id of GRASS_DISTANCE_IDS) assert.equal(cleanSettings({ grass: id }).grass, id);
  assert.equal(cleanSettings({ grass: 'extreme' }).grass, 'auto');
  // tiers: Medium and High draw it, Low and ?atmos=0 do not
  assert.equal(ATMOS_TIERS.low.grass, false); assert.equal(ATMOS_TIERS.off.grass, false);
  assert.equal(ATMOS_TIERS.medium.grass, true); assert.equal(ATMOS_TIERS.high.grass, true);
});

test('the lattice cannot crawl: an instance is a whole square and a blade number, nothing of its own', () => {
  const L = grassLattice('far');
  for (let n = 0; n < L.count; n++) {
    assert.ok(Number.isInteger(L.offsets[n * 2]) && Number.isInteger(L.offsets[n * 2 + 1]), 'offset between squares');
    const k = L.slots[n * 2]; assert.ok(Number.isInteger(k) && k >= 0 && k < RINGS.length);
  }
  assert.ok(new Set([...L.slots].filter((_, i) => i & 1).map(v => v.toFixed(3))).size <= RINGS.length, 'a slot carries data of its own');
  // thick underfoot: four clumps a square at your feet, one at the edge
  const near = [], far = [];
  for (let n = 0; n < L.count; n++) { const d = Math.hypot(L.offsets[n * 2], L.offsets[n * 2 + 1]) * L.cell; (d < 8 ? near : d > L.radius * 0.8 ? far : []).push(n); }
  assert.ok(near.length / (Math.PI * 64) > 2 * far.length / (Math.PI * (L.radius ** 2 - (L.radius * 0.8) ** 2)));
  // walk across 30 km of world in odd steps: every square the patch draws gets the same blade from the hash whichever
  // slot draws it (the blade is a function of the WORLD square only) and the centre only ever moves in whole squares
  const bladeOf = new Map();
  for (let s = 0; s < 60; s++) {
    const px = 28000.37 + s * 0.731, pz = 21000.11 - s * 0.293;
    const [ox, oz] = snapOrigin(px, pz, L.cell);
    assert.ok(Number.isInteger(ox) && Number.isInteger(oz));
    assert.ok(Math.hypot(ox * L.cell - px, oz * L.cell - pz) <= L.cell, 'centre is the nearest square');
    for (let n = 0; n < 400; n++) {
      const cx = ox + L.offsets[n * 2], cz = oz + L.offsets[n * 2 + 1], k = L.slots[n * 2], key = `${cx},${cz},${k}`;
      const h = grassHash(cx, cz, k).join();
      if (bladeOf.has(key)) assert.equal(bladeOf.get(key), h); else bladeOf.set(key, h);
    }
  }
  // and the hash is a real hash: uniform, and neighbours differ
  const xs = []; for (let i = 0; i < 2000; i++) xs.push(grassHash(30000 + i, 20000, 0)[0]);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(Math.abs(mean - 0.5) < 0.03, 'mean ' + mean);
  assert.notDeepEqual(grassHash(30000, 20000, 0), grassHash(30001, 20000, 0));
  assert.ok(patchNoise(10, 10) >= 0 && patchNoise(10, 10) <= 1);
});
