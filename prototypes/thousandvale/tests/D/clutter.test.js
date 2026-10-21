// node --test prototypes/thousandvale/tests/D/clutter.test.js
// 2026-10-17 ground pass: the ground clutter planner (js/client/clutter-plan.js) — the lattice is fixed to the world (a
// cell answers the same wherever the camera is), nothing grows on roads / towns / buildings / water, steep ground only
// takes stones, lush biomes are fuller than deserts, quality thins it, and every biome the bake writes has a row.
// Plus the palms: an ironpalm's collider scale follows the scale it is drawn at.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV } from '../../js/rules/terrain-read.js';
import { CLUTTER_LAYERS, CLUTTER_BIOMES, CLUTTER_KINDS, CLUTTER_PALETTES, clutterAt, cellHash, cellSpot, biomeClutter } from '../../js/client/clutter-plan.js';
import { SCATTER_COLLIDE } from '../../js/rules/nav-refine.js';

const OPEN = NAV.WALK;
const count = (layer, env, n = 60) => { let k = 0; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (clutterAt(layer, 18000 + i, 3000 + j, env)) k++; return k / (n * n); };

test('a cell is a hash of the cell alone: same answer every time, spot inside its own cell', () => {
  for (const layer of Object.keys(CLUTTER_LAYERS)) {
    const c = CLUTTER_LAYERS[layer].cell;
    for (let t = 0; t < 200; t++) {
      const i = 16000 + t * 7, j = 2600 + t * 3, env = { biome: 'grassland', nav: OPEN };
      assert.deepEqual(clutterAt(layer, i, j, env), clutterAt(layer, i, j, env));
      const s = cellSpot(layer, i, j);
      assert.ok(s.x >= i * c && s.x < (i + 1) * c && s.z >= j * c && s.z < (j + 1) * c, `${layer} ${i},${j} spot left its cell`);
    }
  }
  const h = []; for (let i = 0; i < 1000; i++) h.push(cellHash(20000 + i, 7, 3));
  assert.ok(h.every(v => v >= 0 && v < 1));
  const mean = h.reduce((a, b) => a + b, 0) / h.length;
  assert.ok(Math.abs(mean - 0.5) < 0.05, 'hash is roughly uniform: ' + mean);
});

test('nothing grows on roads, in towns, on buildings or solids, in water, or off walkable ground', () => {
  for (const bit of [NAV.ROAD, NAV.TOWN, NAV.BUILDING, NAV.SOLID, NAV.SHALLOW, NAV.DEEP]) {
    assert.equal(count('tuft', { biome: 'grassland', nav: OPEN | bit }, 30), 0, 'tuft on bit ' + bit);
    assert.equal(count('detail', { biome: 'grassland', nav: OPEN | bit }, 30), 0, 'detail on bit ' + bit);
  }
  assert.equal(count('tuft', { biome: 'grassland', nav: 0 }, 30), 0);
});

test('steep ground: no grass, and only stones or pebbles', () => {
  assert.equal(count('tuft', { biome: 'grassland', nav: OPEN | NAV.STEEP }), 0);
  for (let i = 0; i < 2000; i++) { const it = clutterAt('detail', 9000 + i, 5, { biome: 'temperateForest', nav: OPEN | NAV.STEEP }); if (it) assert.ok(['stone', 'pebbles'].includes(it.kind), it.kind); }
});

test('a meadow is fuller than a desert, a forest floor has ferns, and quality thins it', () => {
  const g = count('tuft', { biome: 'grassland', nav: OPEN }), d = count('tuft', { biome: 'desert', nav: OPEN });
  assert.ok(g > 0.75 && d < 0.08, `grass ${g} desert ${d}`);
  const kinds = new Set(); for (let i = 0; i < 3000; i++) { const it = clutterAt('detail', 5000 + i, 9, { biome: 'temperateForest', nav: OPEN }); if (it) kinds.add(it.kind); }
  assert.ok(kinds.has('fern') && kinds.has('lump') && kinds.has('pebbles'), [...kinds].join());
  const half = count('tuft', { biome: 'grassland', nav: OPEN, density: 0.5 });
  assert.ok(Math.abs(half - g / 2) < 0.06, `density 0.5: ${half} vs ${g}`);
  assert.equal(CLUTTER_LAYERS.tuft.reach.low, 0); assert.equal(CLUTTER_LAYERS.detail.reach.low, 0);
});

test('Vharlen (palette vharl) is sparser and ash-coloured where Torbor is meadow', () => {
  const t = count('tuft', { biome: 'grassland', nav: OPEN }), v = count('tuft', { biome: 'grassland', nav: OPEN, palette: 'vharl' });
  assert.ok(v < t * 0.5, `vharl ${v} torbor ${t}`);
  assert.notEqual(biomeClutter('grassland', 'vharl').earth, biomeClutter('grassland').earth);
});

test('every biome the bake writes has a row, and every kind it names exists', () => {
  const baked = 'coast lake beach grassland savanna shrubland temperateForest rainforest borealForest tundra ice desert badlands marsh hills mountains snowyPeaks volcanic blighted ashPlain veiledHills hallowed glimmerwaste field crop pasture yard graveyard orchard gravel road'.split(' ');
  for (const b of baked) assert.ok(CLUTTER_BIOMES[b], 'no clutter row for biome ' + b);
  for (const rows of [CLUTTER_BIOMES, ...Object.values(CLUTTER_PALETTES)]) for (const [b, r] of Object.entries(rows)) for (const k of Object.keys(r.kinds || {})) assert.ok(CLUTTER_KINDS[k], `${b}: unknown kind ${k}`);
});

test('ironpalm: the collider is measured at the scale it is drawn at (scatter-view KIND_ART)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../js/client/scatter-view.js', import.meta.url), 'utf8');
  const m = /key: 'ironpalm'[^}]*scale: ([\d.]+)/.exec(src);
  assert.ok(m, 'ironpalm row in KIND_ART');
  assert.equal(SCATTER_COLLIDE.ironpalm.art, +m[1]);
});
