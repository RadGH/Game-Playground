// Oathwild — trees and small decor scattered over the map (not stored: rebuilt the same way everywhere).
// Pure. Same terrain + same placements = the same trees, so the client, the server (colliders) and the tests agree.
//
//   scatter(T, placements, { seed, box: { minX, maxX, minZ, maxZ } })
//     → { trees: [{ art, x, z, y, rot, scale, r }], decor: [{ art, x, z, y, rot, scale, r, solid }] }
//   r = collision radius (trees have a round trunk collider; decor with solid: false is walk-through grass/ferns).
//
// Rules (lessons rule 25): nothing on a road, bridge, ford, water, field, town square, camp ring, shrine, NPC spot,
// quest object or building footprint. Tree kinds follow the biome and region (oak/birch/willow in the vale,
// pine/oak/marsh trees/dead trees in the wilds). Jittered grid: one try per `step` metres.

import { makeRng, hashStr } from '../../../../worldgen/js/noise.js';

const TREE_KINDS = {
  brightwater_vale: [['oak-a', 4], ['oak-b', 3], ['birch', 3], ['pine-a', 1]],
  thornmere_wilds: [['pine-a', 4], ['pine-b', 4], ['oak-b', 2], ['dead-tree', 0.4]],
  marsh: [['marsh-tree', 4], ['willow', 2], ['dead-tree', 1]],
  shore: [['willow', 1]],
};
// TREES ARE BIG (owner 2026-11-24: "Think Skyrim or WoW, trees 10-15 times taller than you. That's a tree. Trees aren't
// just 3x taller than a person. Big trees better" — lessons rule on tree scale). A person is 1.8 m, so a grown tree is
// 18-27 m and an old giant in the deep woods 35-45 m. `story` = the storybook tree drawn (js/client/render/story-trees.js,
// Thousandvale's big-leaf builder: a few big leaf clumps, never hundreds of tiny leaves); `h` = its height in metres at
// scale 1; `trunk` / `crown` = trunk radius at the ground and canopy radius at that height (collision + spacing).
export const TREE_SPECIES = Object.freeze({
  'oak-a':      { story: 'oak', h: 21, trunk: 0.95, crown: 8 },
  'oak-b':      { story: 'oak', h: 24, trunk: 1.05, crown: 9 },
  'birch':      { story: 'birch', h: 20, trunk: 0.6, crown: 4.6 },
  'pine-a':     { story: 'pine', h: 26, trunk: 0.6, crown: 6.3 },
  'pine-b':     { story: 'spruce', h: 27, trunk: 0.6, crown: 4.9 },
  'willow':     { story: 'willow', h: 16, trunk: 0.95, crown: 8 },
  'marsh-tree': { story: 'beech', h: 19, trunk: 0.65, crown: 4.7 },
  'dead-tree':  { story: 'dead_pine', h: 18, trunk: 0.5, crown: 1.5 },
  // giants: in the heart of a wood, one tree in eight becomes one of these
  'ancient-oak':   { story: 'ancient_oak', h: 38, trunk: 3.4, crown: 19, giant: true },
  'giant-spruce':  { story: 'spruce', h: 44, trunk: 1.3, crown: 8, giant: true },
});
const GIANT_OF = { brightwater_vale: 'ancient-oak', thornmere_wilds: 'giant-spruce' };
const GIANT_WOOD = { brightwater_vale: 0.3, thornmere_wilds: 0.5 };   // how thick a wood must be for a giant (the vale's woods are thinner)
const DECOR = {
  meadow: [['rock-small', 3], ['rock-medium', 1.2], ['bush-a', 3], ['bush-b', 2], ['boulder', 0.4]],
  wildgrass: [['rock-small', 2], ['rock-medium', 1.5], ['bush-a', 2], ['bush-c', 2], ['boulder-mossy', 0.7], ['stump-a', 1]],
  forest: [['fern', 3], ['mushrooms', 2], ['stump-a', 1.5], ['log', 1], ['bush-c', 2], ['rock-cluster', 1]],
  marsh: [['reeds', 4], ['bog-plant', 3], ['log-hollow', 0.5]],
  shore: [['reeds', 3], ['rock-small', 1]],
  rock: [['rock-large', 2], ['rock-slab', 1.5], ['cliff-chunk', 0.6]],
};
const WALK_THROUGH = new Set(['fern', 'mushrooms', 'reeds', 'bog-plant', 'bush-a', 'bush-b', 'bush-c', 'rock-small']);
const RADIUS = { 'rock-small': 0.3, 'rock-medium': 0.6, 'boulder': 1.3, 'boulder-mossy': 1.1, 'rock-large': 1.1, 'rock-slab': 1.2, 'cliff-chunk': 2.5, 'rock-cluster': 0.8, 'stump-a': 0.4, 'log': 0.5, 'log-hollow': 0.6 };

function pick(list, rng) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [k, w] of list) { r -= w; if (r <= 0) return k; }
  return list[list.length - 1][0];
}

/** Keep-out circles from the hand placements (buildings, props, shrines, chests, objects, NPCs, camps). */
export function keepOuts(T, placements, extra = []) {
  const out = [];
  for (const b of placements.buildings || []) out.push([b.at[0], b.at[1], (b.footprint || 6) / 2 + 2]);
  for (const p of placements.props || []) out.push([p.at[0], p.at[1], (p.r || 0.8) + 1]);
  for (const g of ['shrines', 'chests', 'objects']) for (const p of placements[g] || []) out.push([p.at[0], p.at[1], 3]);
  for (const c of placements.camps || []) out.push([c.at[0], c.at[1], c.clear || 14]);
  for (const p of Object.values(T.places)) if (p.flat) out.push([p.at[0], p.at[1], p.flat]);
  for (const b of T.bridges) out.push([b.at[0], b.at[1], b.reach + 4]);
  for (const e of extra) out.push(e);
  return out;
}

export function scatter(T, placements, { seed = T.seed, box = null, treeStep = 11, decorStep = 9, extra = [] } = {}) {
  const B = box || T.bounds;
  const kos = keepOuts(T, placements, extra);
  const cellKO = new Map();          // bucket keep-outs by 32 m cells for speed
  const key = (i, k) => `${i},${k}`;
  for (const ko of kos) {
    const r = ko[2];
    for (let i = Math.floor((ko[0] - r) / 32); i <= Math.floor((ko[0] + r) / 32); i++) for (let k = Math.floor((ko[1] - r) / 32); k <= Math.floor((ko[1] + r) / 32); k++) {
      const kk = key(i, k);
      if (!cellKO.has(kk)) cellKO.set(kk, []);
      cellKO.get(kk).push(ko);
    }
  }
  const blocked = (x, z, r) => (cellKO.get(key(Math.floor(x / 32), Math.floor(z / 32))) || []).some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr + r);
  const clearOfRoad = (x, z, r) => { const rd = T.roadAt(x, z, 12); return !rd || rd.d > rd.half + r + 1.5; };
  const trees = [], decor = [];
  for (let gx = Math.ceil(B.minX / treeStep) * treeStep; gx < B.maxX; gx += treeStep) for (let gz = Math.ceil(B.minZ / treeStep) * treeStep; gz < B.maxZ; gz += treeStep) {
    const rng = makeRng(hashStr(`t${seed}:${gx}:${gz}`));
    const x = gx + (rng() - 0.5) * treeStep * 0.9, z = gz + (rng() - 0.5) * treeStep * 0.9;
    if (!T.inPlay(x, z)) continue;
    const f = T.forestAt(x, z);
    if (rng() > f * 0.95) continue;
    const biome = T.biomeAt(x, z);
    const list = biome === 'marsh' ? TREE_KINDS.marsh : biome === 'shore' ? TREE_KINDS.shore : TREE_KINDS[T.regionAt(x, z)];
    if (!list || T.slopeAt(x, z) > 28) continue;
    const w = T.waterAt(x, z);
    if (w && w.depth > -0.2) continue;
    let art = pick(list, rng);
    // the heart of a wood (forest density high): now and then an old giant that stands over everything round it
    const reg = T.regionAt(x, z);
    if (GIANT_OF[reg] && biome !== 'marsh' && f > (GIANT_WOOD[reg] ?? 0.5) && rng() < 0.1) art = GIANT_OF[reg];
    const sp = TREE_SPECIES[art] || TREE_SPECIES['oak-a'];
    const scale = 0.85 + rng() * 0.3;
    // the trunk keeps off roads and buildings; the canopy keeps clear of buildings and camps (a crown through a roof
    // is the "world pieces clip" bug, rule 25), but may hang over a road
    if (blocked(x, z, Math.max(1, sp.crown * scale * 0.55)) || !clearOfRoad(x, z, Math.max(1, sp.trunk * scale + 0.5))) continue;
    if (sp.giant && trees.some(t => Math.hypot(t.x - x, t.z - z) < sp.crown * 0.7)) continue;
    trees.push({ art, x: r2(x), z: r2(z), y: r2(T.heightAt(x, z)), rot: r2(rng() * 6.283), scale: r2(scale), r: r2(sp.trunk * scale), h: r2(sp.h * scale), crown: r2(sp.crown * scale) });
  }
  for (let gx = Math.ceil(B.minX / decorStep) * decorStep; gx < B.maxX; gx += decorStep) for (let gz = Math.ceil(B.minZ / decorStep) * decorStep; gz < B.maxZ; gz += decorStep) {
    const rng = makeRng(hashStr(`d${seed}:${gx}:${gz}`));
    if (rng() > 0.42) continue;
    const x = gx + (rng() - 0.5) * decorStep * 0.9, z = gz + (rng() - 0.5) * decorStep * 0.9;
    if (!T.inPlay(x, z)) continue;
    const biome = T.biomeAt(x, z);
    const list = DECOR[biome];
    if (!list) continue;
    const art = pick(list, rng);
    const r = RADIUS[art] || 0.5;
    const w = T.waterAt(x, z);
    if (w && w.depth > (biome === 'marsh' || biome === 'shore' ? 0.3 : -0.1)) continue;
    if (blocked(x, z, r) || !clearOfRoad(x, z, r)) continue;
    if (trees.some(t => Math.abs(t.x - x) < 2 && Math.abs(t.z - z) < 2)) continue;
    decor.push({ art, x: r2(x), z: r2(z), y: r2(T.heightAt(x, z)), rot: r2(rng() * 6.283), scale: r2(0.8 + rng() * 0.5), r, solid: !WALK_THROUGH.has(art) });
  }
  return { trees, decor };
}
const r2 = v => Math.round(v * 100) / 100;
