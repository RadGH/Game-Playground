// Round colliders for trees and rocks (play-test 11, Z37 — live #38: "There are some stones here I can clearly walk
// through, but there is an invisible wall … collisions, trees and rocks for example, are totally off-centre and often
// square when the object is circular").
//
// WHY: the zone bake (tools/bake-zone.mjs navFor) stamps every solid scatter item into nav.bin's 2 m grid as every
// sample within (its radius + a whole metre) of it, and the walker reads the NEAREST sample — so a 0.3 m trunk blocked
// a 3 x 3 m square, set off to whichever side the grid fell, and a boulder's square stuck out past the drawn stone.
//
// WHAT: `refineNav(nav, scatter)` wraps a zone's parsed nav.bin + scatter.bin. A sample that is SOLID only because a
// tree / rock was stamped there is answered by CIRCLES instead: one per solid item, centred on the item, radius = the
// drawn model's own cross-section at body height (measured from the kit art by tools/measure-scatter.mjs, at the
// item's drawn scale) + a small body allowance. Everything else in nav.bin — walls, towers, gate jambs, buildings, deep
// water, roads, town bits — is answered exactly as before, and a sample with a non-scatter SOLID neighbour keeps the
// grid answer (a tree beside a wall never opens the wall). The raw `bits` stay untouched (offline tools read them).
//
// Pure (no three / DOM). The SERVER (js/sim/content.js) and the CLIENT (js/client/world-stream.js) wrap the same files
// with this same function, so prediction and the server's step (js/sim/movement.js stepMove: `nav.at`) agree.
// `scatter` may be forest.js's grown scatter (giants carry `size`, new trees `added`): both sides grow it the same way.

import { SCATTER_KINDS, NAV } from './terrain-read.js';

/** The walker's own half-width added round every model (the movement step treats a body as a point). */
export const BODY_R = 0.32;
/**
 * Per scatter kind: the model radius at body height for each variant (scatter-view.js draws variant % list length) in
 * the kit piece's own units, the art scale the client draws it at, and its sideways squash. Measured by
 * tools/measure-scatter.mjs (trunk: the trunk SLICED at three heights 0.25-0.8 up, 60th percentile of the crossing points —
 * the trunk, not its low branches; rock: 85th percentile 0.25-1.5 up; basalt columns: 0.9 x the half-width of their box).
 * 2026-10-20: the storybook trees (js/client/tree-style.js) are FITTED to these radii (their `rB`/`rT` in
 * tree-style-data.js), so the colliders — and every baked route that reads them — did not change with the new art.
 */
export const SCATTER_COLLIDE = Object.freeze({
  tree_broadleaf: { r: [0.54, 0.56, 0.41], art: 0.62 },
  tree_conifer: { r: [0.51, 0.43, 0.53], art: 0.55 },
  tree_acacia: { r: [0.54], art: 0.6, squash: 1.35 },
  tree_dead: { r: [0.34, 0.46], art: 0.6 },
  rock_large: { r: [0.94, 0.87], art: 1 },
  boulder: { r: [0.94], art: 1.4 },
  tree_fruit: { r: [0.54, 0.56], art: 0.3, squash: 1.4 },
  tree_fern: { r: [0.2, 0.2, 0.2], art: 1 },
  ironpalm: { r: [0.17], art: 0.8 },      // 2026-10-17: drawn at 0.8 (taller palms, scatter-view.js KIND_ART)
  tree_charred: { r: [0.34, 0.46], art: 0.62 },
  basalt_columns: { r: [1.35, 1.33, 1.25, 1.24], art: 1 },
  obsidian: { r: [1.13, 1.37, 1.31], art: 1 },
  // Torbor Downs regenerated (play-test 12, #81). The willow's measured band leans off its spot (r 1.66, 1.19 off-centre):
  // its upright trunk is ~0.6; the ancient oak's root flare measures 4.35 — its trunk proper is ~2.6
  tree_birch: { r: [0.53], art: 0.6 },
  tree_willow: { r: [0.6], art: 0.75 },
  red_rock: { r: [0.94, 0.87], art: 1.25 },
  tree_old_oak: { r: [2.6], art: 0.42, squash: 1.25 },
});

/** The collider radius (metres) of one scatter item: its drawn model's radius at the drawn scale, + the body. */
export function colliderRadius(kindKey, scale = 1, variant = 0, size = 1) {
  const c = SCATTER_COLLIDE[kindKey];
  if (!c) { const k = SCATTER_KINDS.find(s => s.key === kindKey); return k ? k.r * scale * size + BODY_R : 0; }
  const S = Math.max(0.4, Math.min(1.6, scale * c.art)) * (size || 1);     // scatter-view.js: S = clamp(0.4, 1.6, scale * art.scale) x a giant's size (forest.js)
  return c.r[variant % c.r.length] * S * (c.squash || 1) + BODY_R;
}

const BUCKET = 8;

/**
 * Wrap a parsed nav (parseNav) with round colliders from its zone's parsed scatter (parseScatter). Same frame (zone
 * metres). Returns a nav-shaped object: { meta, size, step, bits (raw), at(x, z), passable(x, z), circles, refined }.
 * A missing scatter returns the nav unchanged.
 */
export function refineNav(nav, scatter) {
  if (!nav || !scatter || !(scatter.count > 0)) return nav;
  const { size, step, bits } = nav;
  const n = scatter.count;
  // 1. the circles (solid kinds only)
  const cx = [], cz = [], cr = [];
  // 2. the samples the BAKE stamped for those items (its own rule, a hair wider so a quantised position never misses one)
  const mask = new Uint8Array((size * size + 7) >> 3);
  const stamped = [];
  const hasM = o => (mask[o >> 3] >> (o & 7)) & 1;
  for (let i = 0; i < n; i++) {
    const K = SCATTER_KINDS[scatter.kind[i]]; if (!K || !K.solid) continue;
    const x = scatter.x[i], z = scatter.z[i];
    cx.push(x); cz.push(z); cr.push(colliderRadius(K.key, scatter.scale[i], scatter.variant[i], scatter.size ? scatter.size[i] : 1));
    if (scatter.added && scatter.added[i]) continue;          // a tree forest.js grew: the bake never stamped it (a circle, no mask)
    const R = K.r * scatter.scale[i] + step * 0.5 + 0.12, R2 = R * R;
    const k0 = Math.max(0, Math.floor((x - R) / step)), k1 = Math.min(size - 1, Math.ceil((x + R) / step));
    for (let j = Math.max(0, Math.floor((z - R) / step)), j1 = Math.min(size - 1, Math.ceil((z + R) / step)); j <= j1; j++) {
      const dz = j * step - z, row = j * size;
      for (let k = k0; k <= k1; k++) {
        const dx = k * step - x; if (dx * dx + dz * dz > R2) continue;
        const o = row + k; if (!((mask[o >> 3] >> (o & 7)) & 1)) { mask[o >> 3] |= 1 << (o & 7); stamped.push(o); }
      }
    }
  }
  const m = cx.length;
  if (!m) return nav;
  // 3. which SOLID samples the circles answer for: stamped by scatter, not a building, no SOLID neighbour the scatter
  //    did not make (that neighbour is a wall, a tower, a stone wall: the grid keeps the say there)
  const refined = new Uint8Array((size * size + 7) >> 3);
  let nRef = 0;
  for (const o of stamped) {
    const j = (o / size) | 0, k = o - j * size, b = bits[o];
    if (!(b & NAV.SOLID) || (b & NAV.BUILDING)) continue;
    let wall = false;
    for (let dj = -1; dj <= 1 && !wall; dj++) for (let dk = -1; dk <= 1; dk++) {
      const jj = j + dj, kk = k + dk; if (jj < 0 || kk < 0 || jj >= size || kk >= size) continue;
      const q = jj * size + kk; if ((bits[q] & NAV.SOLID) && !hasM(q)) { wall = true; break; }
    }
    if (wall) continue;
    refined[o >> 3] |= 1 << (o & 7); nRef++;
  }
  // 4. circles filed in 8 m buckets (each in every bucket it touches)
  const nb = Math.ceil((size * step) / BUCKET) + 1;
  const count = new Uint32Array(nb * nb + 1);
  const lo = (v, r) => Math.max(0, Math.floor((v - r) / BUCKET)), hi = (v, r) => Math.min(nb - 1, Math.floor((v + r) / BUCKET));
  for (let i = 0; i < m; i++) for (let q = lo(cz[i], cr[i]), q1 = hi(cz[i], cr[i]); q <= q1; q++) for (let p = lo(cx[i], cr[i]), p1 = hi(cx[i], cr[i]); p <= p1; p++) count[q * nb + p + 1]++;
  for (let i = 1; i < count.length; i++) count[i] += count[i - 1];
  const list = new Uint32Array(count[count.length - 1]), fill = count.slice(0, nb * nb);
  for (let i = 0; i < m; i++) for (let q = lo(cz[i], cr[i]), q1 = hi(cz[i], cr[i]); q <= q1; q++) for (let p = lo(cx[i], cr[i]), p1 = hi(cx[i], cr[i]); p <= p1; p++) list[fill[q * nb + p]++] = i;
  const CX = Float32Array.from(cx), CZ = Float32Array.from(cz), CR = Float32Array.from(cr);
  /** Is (x, z) inside a tree / rock? */
  function inCircle(x, z) {
    const p = Math.floor(x / BUCKET), q = Math.floor(z / BUCKET);
    if (p < 0 || q < 0 || p >= nb || q >= nb) return false;
    const c = q * nb + p;
    for (let t = count[c]; t < count[c + 1]; t++) { const i = list[t], dx = x - CX[i], dz = z - CZ[i]; if (dx * dx + dz * dz < CR[i] * CR[i]) return true; }
    return false;
  }
  const at = (x, z) => {
    const k = Math.min(size - 1, Math.max(0, Math.round(x / step))), j = Math.min(size - 1, Math.max(0, Math.round(z / step)));
    const o = j * size + k;
    let b = bits[o];
    if ((refined[o >> 3] >> (o & 7)) & 1) b &= ~NAV.SOLID;
    if (!(b & NAV.SOLID) && inCircle(x, z)) b |= NAV.SOLID;
    return b;
  };
  const passable = (x, z) => { const b = at(x, z); return (b & NAV.WALK) !== 0 && (b & (NAV.SOLID | NAV.BUILDING | NAV.DEEP)) === 0; };
  return { meta: nav.meta, size, step, bits, at, passable, raw: nav, inCircle, circles: { x: CX, z: CZ, r: CR, count: m }, refined: nRef };
}
