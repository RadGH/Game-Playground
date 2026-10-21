// Storybook trees (2026-10-20, owner: "When you get closer it gets replaced with a spindly tree with tiny leaves. Can we
// have trees updated to look more cartoony and mythical"). js/client/tree-style.js plans a tree once from its seed and
// draws that plan at three detail levels, so the near tree and the far tree are the same tree.
// Run: node --test prototypes/thousandvale/tests/D/tree-style.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
register('../../../../avatar-3d/tests/three-loader.mjs', import.meta.url);
const { buildStoryTree, buildSceneryTree, hasStoryTree, storyPlan } = await import('../../js/client/tree-style.js');
const { KIND_ART } = await import('../../js/client/scatter-view.js');
const { NEAR_TREES } = await import('../../js/client/near-trees.js');
const { buildTree } = await import('../../../../highdef-3d/js/kit/trees.js');
const { SCATTER_COLLIDE } = await import('../../js/rules/nav-refine.js');

const TREE_NAMES = [...new Set(KIND_ART.flatMap(a => a.tree || []))];
const seedOf = n => 1000 + n.length * 13;          // scatter-view.js geoFor's seed
const tris = b => (b.bark ? b.bark.index.count / 3 : 0) + (b.foliage ? b.foliage.index.count / 3 : 0);
const box = g => { g.computeBoundingBox(); return g.boundingBox; };

test('every tree the scatter draws (and the vignette / set-piece trees) has a storybook version', () => {
  for (const n of [...TREE_NAMES, 'oak', 'birch', 'pine', 'dead_snag']) assert.ok(hasStoryTree(n), n);
  assert.ok(TREE_NAMES.length >= 13, TREE_NAMES.join(' '));
  // the tree fern is a tree now (three levels, wind), not a single flat-shaded custom piece
  assert.deepEqual(KIND_ART.find(a => a.key === 'tree_fern').tree, ['story_fern_a', 'story_fern_b', 'story_fern_c']);
});

test('the kit contract: five attributes, finite, wind and phase in range, base on the ground', () => {
  for (const n of TREE_NAMES) for (const lod of [0, 1, 2]) {
    const b = buildStoryTree(n, { seed: seedOf(n), lod });
    for (const g of [b.bark, b.foliage].filter(Boolean)) {
      assert.deepEqual(Object.keys(g.attributes), ['position', 'normal', 'uv', 'color', 'aWind'], n);
      for (const a of Object.values(g.attributes)) assert.ok(a.array.every(Number.isFinite), `${n} L${lod}`);
      const w = g.getAttribute('aWind').array;
      for (let i = 0; i < w.length; i += 2) { assert.ok(w[i] >= 0 && w[i] <= 1, `${n} sway`); assert.ok(w[i + 1] >= 0 && w[i + 1] < 1, `${n} phase`); }
    }
    assert.ok(box(b.bark).min.y < 0 && box(b.bark).min.y > -(0.5 + 0.35 * b.plan.S.rB), `${n}: the trunk starts just under the ground (${box(b.bark).min.y.toFixed(2)})`);
  }
});

test('the same tree at every distance: one plan, and the far crown covers the same box as the near one', () => {
  for (const n of TREE_NAMES) {
    assert.deepEqual(JSON.stringify(storyPlan(n, 7)), JSON.stringify(storyPlan(n, 7)), `${n}: the plan comes from the seed alone`);
    const near = buildStoryTree(n, { seed: seedOf(n), lod: 0 }), far = buildStoryTree(n, { seed: seedOf(n), lod: 2 });
    assert.ok(Math.abs(far.height - near.height) / near.height < 0.12, `${n}: height ${near.height.toFixed(1)} near, ${far.height.toFixed(1)} far`);
    if (!near.foliage) { assert.equal(far.foliage, null, `${n}: a bare tree is bare far away too`); continue; }
    const a = box(near.foliage), b = box(far.foliage);
    const wa = Math.max(a.max.x - a.min.x, a.max.z - a.min.z), wb = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
    assert.ok(Math.abs(wb - wa) / wa < 0.3, `${n}: crown ${wa.toFixed(1)} wide near, ${wb.toFixed(1)} far`);
    assert.ok(Math.abs((b.max.y - b.min.y) - (a.max.y - a.min.y)) / (a.max.y - a.min.y) < 0.3, `${n}: crown height near vs far`);
  }
});

test('big leaves at every level: a near leaf card is most of a clump across, not a twig-end sprig', () => {
  for (const n of ['oak', 'beech', 'ancient_oak', 'willow']) {
    const p = storyPlan(n, seedOf(n));
    for (const cl of p.clumps) assert.ok(cl.r > 0.9, `${n}: clump radius ${cl.r}`);
    assert.ok(p.clumps.length <= 9, `${n}: a few big clumps (${p.clumps.length})`);
  }
});

test('no more triangles than the kit tree it replaces, at each level (far level: within the kit dead tree\'s 28)', () => {
  const rows = [];
  for (const n of TREE_NAMES) {
    if (!n.startsWith('story_')) {
      const kitName = n === 'silver_birch' ? 'birch' : n;      // tree_birch's own fitted birch replaced the kit birch
      const k = [0, 1, 2].map(lod => tris(buildTree(kitName, { seed: seedOf(kitName), lod })));
      const s = [0, 1, 2].map(lod => tris(buildStoryTree(n, { seed: seedOf(n), lod })));
      rows.push(`${n} kit ${k.join('/')} storybook ${s.join('/')}`);
      assert.ok(s[0] <= k[0] && s[1] <= k[1], `${n}: near ${s[0]} vs ${k[0]}, middle ${s[1]} vs ${k[1]}`);
      assert.ok(s[2] <= Math.max(k[2], 28), `${n}: far ${s[2]} vs ${k[2]}`);
    } else {
      // the tree fern replaced a one-level custom piece (~300 triangles at every distance)
      const s = [0, 1, 2].map(lod => tris(buildStoryTree(n, { seed: seedOf(n), lod })));
      assert.ok(s[0] <= 320 && s[2] <= 28, `${n}: ${s.join('/')}`);
    }
  }
  console.log(rows.join('\n'));
});

test('near-trees.js sizes a conifer by its real (storybook) height', () => {
  for (const sp of NEAR_TREES.species) {
    const h = buildSceneryTree(sp, { seed: 1000 + sp.length * 13, lod: 1 }).height;
    assert.ok(Math.abs(h - NEAR_TREES.kitH[sp]) / h < 0.02, `${sp}: built ${h.toFixed(2)}, kitH ${NEAR_TREES.kitH[sp]}`);
  }
});

// the storybook trunks are FITTED to the table that was there before them (tree-style-data.js rB / rT), so the art change
// moved no collider and no baked route
test('colliders match the drawn trunks: tools/measure-scatter.mjs on the storybook trees = nav-refine SCATTER_COLLIDE', () => {
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const out = execFileSync(process.execPath, ['--import', './avatar-3d/tests/three-register.mjs', 'prototypes/thousandvale/tools/measure-scatter.mjs'], { cwd: root, encoding: 'utf8' });
  const m = JSON.parse(out.slice(out.indexOf('{')));
  for (const [key, row] of Object.entries(m)) {
    if (row.type !== 'tree') continue;
    const want = SCATTER_COLLIDE[key]; assert.ok(want, key);
    row.variants.forEach((v, i) => assert.ok(Math.abs(v.r - want.r[i % want.r.length]) < 0.02, `${key} ${v.name}: measured ${v.r}, table ${want.r[i % want.r.length]}`));
    assert.equal(want.art, row.artScale, `${key}: drawn at the scale the table assumes`);
  }
});
