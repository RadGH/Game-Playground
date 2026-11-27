// World Build — the pieces a streaming client asks for, cut from a built world. Pure (no worker, no DOM): the page's
// worker serves them to the fly view today; a game server would serve the same pieces to players (Oathwild adoption,
// README). Every function takes the pipeline's world W.
//
//   pick(W, x, z)                         what is at a spot (the page's spot card)
//   chunk(W, { x0, z0, size, step })      ground: (n+2)^2 heights (a border for normals), n^2 water surfaces, a 64^2 paint map
//   tile(W, tx, tz)                       a 256 m tile's trees, solid rocks and set-piece parts, packed
//   town(W, id)                           one town's plan (Oathwild's planner) + a height patch to build on
//   bridges(W, box)                       the bridges in a box, each with a height patch

import { treesInTile, TILE } from './detail.js';
import { BIOMES, PAINT } from './themes.js';
import { TREE_SPECIES } from '../../prototypes/oathwild/js/world/scatter.js';

/** The fly view's painted ground layers (fly/ground-mat.js LAYERS, same order). */
export const LAYERS = ['grass', 'wild', 'forest', 'dirt', 'soil', 'sand', 'marsh', 'gravel', 'snow', 'ash', 'heath', 'dust'];
const PAINT_LAYER = new Uint8Array(BIOMES.length);
BIOMES.forEach((b, i) => { PAINT_LAYER[i] = Math.max(0, LAYERS.indexOf(PAINT[b])); });
export const SPECIES = Object.keys(TREE_SPECIES);

export function pick(W, x, z) {
  const T = W.T;
  const w = T.waterAt(x, z);
  let near = null, nd = Infinity;
  for (const p of Object.values(W.places)) { if (p.kind === 'pass') continue; const d = Math.hypot(p.at[0] - x, p.at[1] - z); if (d < nd) { nd = d; near = p; } }
  const region = W.regionList.find(r => r.id === T.regionAt(x, z));
  return { x, z, y: Math.round(T.heightAt(x, z) * 10) / 10, biome: T.biomeAt(x, z), region: region?.name, levels: T.levelBandAt(x, z), water: w && w.depth > 0 ? w : null, walkable: T.walkable(x, z), slope: Math.round(T.slopeAt(x, z)), near: near ? { name: near.name, kind: near.kind, d: Math.round(nd) } : null, road: T.roadAt(x, z, 20)?.road || null };
}

/**
 * One ground chunk: (n + 2)² heights (a one-vertex border for normals), n² water surfaces (NaN = dry) and a paint map
 * (layer index per 4·step/2 m cell). Vertex (i, k) sits at (x0 + i·step, z0 + k·step); outside the world it repeats
 * the edge.
 */
export function chunk(W, { x0, z0, size, step }) {
  const n = Math.round(size / step) + 1, nb = n + 2;
  const heights = new Float32Array(nb * nb), water = new Float32Array(n * n);
  const B = W.bounds, cell = W.cell, M = W.macro;
  // is there any water in the 8 m cells round this spot? (most of the world is dry: skip the search there)
  const wetNear = (z, x) => {
    const mi = Math.round((x - M.minX) / M.cell), mk = Math.round((z - M.minZ) / M.cell), r = 1;   // (the search below looks 6 m round)
    for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) {
      const ii = mi + di, kk = mk + dk;
      if (ii < 0 || kk < 0 || ii >= M.nx || kk >= M.nz) continue;
      const jm = kk * M.nx + ii;
      if (M.river[jm] || M.lake[jm] >= 0 || M.sea[jm]) return true;
    }
    return false;
  };
  const gi = x => Math.min(W.nx - 1, Math.max(0, Math.round((x - B.minX) / cell)));
  const gk = z => Math.min(W.nz - 1, Math.max(0, Math.round((z - B.minZ) / cell)));
  for (let k = -1; k <= n; k++) {
    const row = gk(z0 + k * step) * W.nx;
    for (let i = -1; i <= n; i++) {
      const j = row + gi(x0 + i * step);
      heights[(k + 1) * nb + (i + 1)] = W.H[j];
      if (i >= 0 && k >= 0 && i < n && k < n) {
        // a coarse chunk keeps water a vertex finds anywhere in its cell (narrow rivers do not vanish far away)
        let w = W.water[j];
        if (Number.isNaN(w) && step > 2 && wetNear(z0 + k * step, x0 + i * step)) { const r = Math.min(step / 2 / cell, 3) | 0; for (let dk = -r; dk <= r && Number.isNaN(w); dk++) for (let di = -r; di <= r && Number.isNaN(w); di++) { const jj = Math.min(W.nz - 1, Math.max(0, gk(z0 + k * step) + dk)) * W.nx + Math.min(W.nx - 1, Math.max(0, gi(x0 + i * step) + di)); if (W.wkind[jj] === 1 || W.wkind[jj] === 3 || W.wkind[jj] === 4) w = W.water[jj]; } }
        water[k * n + i] = w;
      }
    }
  }
  const bg = W.T.biomeGrid, pn = 64, pc = size / pn;
  const paint = new Uint8Array(pn * pn);
  for (let k = 0; k < pn; k++) for (let i = 0; i < pn; i++) {
    const x = x0 + (i + 0.5) * pc, z = z0 + (k + 0.5) * pc;
    const bi = Math.min(bg.nx - 1, Math.max(0, Math.floor((x - bg.minX) / bg.cell))), bk = Math.min(bg.nz - 1, Math.max(0, Math.floor((z - bg.minZ) / bg.cell)));
    paint[k * pn + i] = PAINT_LAYER[bg.ids[bk * bg.nx + bi]];
  }
  return { n, x0, z0, size, step, heights, water, paint, pn };
}

/** One tile's trees (x, y, z, rot, height, species index) and solid rocks (x, y, z, rot, scale, kind), packed. */
export function tile(W, tx, tz) {
  const s = treesInTile(W, W.T, tx, tz);
  const trees = new Float32Array(s.trees.length * 6);
  s.trees.forEach((t, i) => trees.set([t.x, t.y, t.z, t.rot || 0, t.h || TREE_SPECIES[t.art].h, SPECIES.indexOf(t.art)], i * 6));
  const solid = s.decor.filter(d => /rock|boulder|cliff|stump|log/.test(d.art));
  const rocks = new Float32Array(solid.length * 5);
  solid.forEach((d, i) => rocks.set([d.x, d.y, d.z, d.rot, d.scale * (d.r || 0.6) * 1.6], i * 5));
  const box = { minX: tx * TILE, maxX: (tx + 1) * TILE, minZ: tz * TILE, maxZ: (tz + 1) * TILE };
  const sets = [];
  for (const sp of W.setPieces) for (const q of sp.parts) if (q.at[0] >= box.minX && q.at[0] < box.maxX && q.at[1] >= box.minZ && q.at[1] < box.maxZ) sets.push(q);
  return { tx, tz, trees, rocks, sets, count: s.trees.length };
}

/** A height patch (2 m vertices) round a box, so the page can build things that stand on the ground exactly. */
function patch(W, minX, minZ, maxX, maxZ) {
  const B = W.bounds, cell = W.cell;
  const i0 = Math.max(0, Math.floor((minX - B.minX) / cell)), i1 = Math.min(W.nx - 1, Math.ceil((maxX - B.minX) / cell));
  const k0 = Math.max(0, Math.floor((minZ - B.minZ) / cell)), k1 = Math.min(W.nz - 1, Math.ceil((maxZ - B.minZ) / cell));
  const nx = i1 - i0 + 1, nz = k1 - k0 + 1, h = new Float32Array(nx * nz);
  for (let k = 0; k < nz; k++) h.set(W.H.subarray((k0 + k) * W.nx + i0, (k0 + k) * W.nx + i0 + nx), k * nx);
  return { minX: B.minX + i0 * cell, minZ: B.minZ + k0 * cell, cell, nx, nz, heights: h };
}

export function town(W, id) {
  const pinned = !!W.places[id]?.pinned;
  const P = pinned ? W.pinTownPlan : W.townPlan;
  const p = W.places[id];
  if (!P || !p) return { plan: null };
  const R = (p.radius || 60) + 60;
  const near = a => Math.hypot(a[0] - p.at[0], a[1] - p.at[1]) < R;
  const plan = {
    houses: P.houses.filter(h => h.town === id), yards: P.yards.filter(y => near(y.at)), fences: P.fences.filter(f => near(f.a)),
    walls: P.walls.filter(w => near(w.a)), props: P.props.filter(q => near(q.at)), boxes: [], circles: [], trees: [], spots: {}, graph: { nodes: [], edges: [] }, villagers: [],
  };
  return { plan, patch: patch(W, p.at[0] - R, p.at[1] - R, p.at[0] + R, p.at[1] + R), at: p.at, name: p.name };
}

export function bridges(W, box) {
  const list = W.bridges.filter(b => b.kind === 'bridge' && b.at[0] >= box.minX && b.at[0] < box.maxX && b.at[1] >= box.minZ && b.at[1] < box.maxZ);
  return { list: list.map(b => ({ ...b, patch: patch(W, Math.min(b.a[0], b.b[0]) - 20, Math.min(b.a[1], b.b[1]) - 20, Math.max(b.a[0], b.b[0]) + 20, Math.max(b.a[1], b.b[1]) + 20) })) };
}
