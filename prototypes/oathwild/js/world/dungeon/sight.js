// Oathwild dungeons — line of sight on the walk grid (brainstorm 2026-11-27-regions §3). Pure.
//
//   lineOfSight(walk, a, b, { exact }) → bool   a DDA walk through the tiles from a to b + the columns on the way.
//                                       Rock and shut secret doors block; floor, pits and gates (bars) do not; columns
//                                       block (low sarcophagi do not). Cached per tile pair (tile centres) unless exact.
//   firstHit(walk, a, b) → { x, z } | null   where a shot from a to b stops (a wall or a column) — to show the hit
//   canNotice(walk, monster, target, range, opts) → bool
//                                       in range (3D) AND in sight AND a walking path of ≤ maxCost tiles
//                                       (default range / 2 m × 1.6 + 2): a monster never notices through a wall, and
//                                       not across a pit it cannot walk round
//   joinsFight(walk, mate, fightAt, range, opts) → bool   a pack mate joins only when IT can notice the fight
// opts: { pather } (path.js createPather; one is made and kept per walk when left out), { maxCost }, { pathFactor }
import { createPather } from './path.js';

const caches = new WeakMap();
const pathers = new WeakMap();
function cacheFor(walk) {
  let c = caches.get(walk);
  if (!c || c.version !== walk.version) { c = { version: walk.version, m: new Map() }; caches.set(walk, c); }
  return c.m;
}
export function patherFor(walk) {
  let p = pathers.get(walk);
  if (!p) { p = createPather(walk); pathers.set(walk, p); }
  return p;
}

/** The first blocking point on the segment a → b (null when clear). */
export function firstHit(walk, a, b) {
  const T = walk.tile, cols = walk.cols, rows = walk.rows;
  const dx = b.x - a.x, dz = b.z - a.z;
  let i = Math.floor(a.x / T), k = Math.floor(a.z / T);
  const ib = Math.floor(b.x / T), kb = Math.floor(b.z / T);
  const si = Math.sign(dx), sk = Math.sign(dz);
  const tdx = si ? T / Math.abs(dx) : Infinity, tdz = sk ? T / Math.abs(dz) : Infinity;
  let tx = si ? ((si > 0 ? (i + 1) * T - a.x : a.x - i * T) / Math.abs(dx)) : Infinity;
  let tz = sk ? ((sk > 0 ? (k + 1) * T - a.z : a.z - k * T) / Math.abs(dz)) : Infinity;
  let tEnter = 0;
  const seen = new Set();
  let best = Infinity;
  for (let guard = 0; guard < cols + rows + 4; guard++) {
    if (i < 0 || k < 0 || i >= cols || k >= rows) return pt(a, dx, dz, tEnter);
    const t = k * cols + i;
    if (!walk.see(t)) return pt(a, dx, dz, Math.min(tEnter, best));
    // columns touching this tile
    for (const s of walk.solidsNear((i + 0.5) * T, (k + 0.5) * T, T)) {
      if (!s.tall || seen.has(s)) continue;
      seen.add(s);
      const u = segCircle(a, dx, dz, s);
      if (u < best) best = u;
    }
    if (i === ib && k === kb) break;
    if (tx < tz) { tEnter = tx; tx += tdx; i += si; } else { tEnter = tz; tz += tdz; k += sk; }
    if (tEnter > 1) break;
  }
  return best <= 1 ? pt(a, dx, dz, best) : null;
}
const pt = (a, dx, dz, u) => ({ x: a.x + dx * u, z: a.z + dz * u });
/** First u ∈ [0, 1] where a + u·d enters circle s (Infinity when it misses). */
function segCircle(a, dx, dz, s) {
  const fx = a.x - s.x, fz = a.z - s.z;
  const A = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - s.r * s.r;
  if (A < 1e-12) return C <= 0 ? 0 : Infinity;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return Infinity;
  const q = Math.sqrt(disc), u0 = (-B - q) / (2 * A), u1 = (-B + q) / (2 * A);
  if (u0 >= 0 && u0 <= 1) return u0;
  if (u0 < 0 && u1 >= 0) return 0;      // starts inside
  return Infinity;
}

export function lineOfSight(walk, a, b, { exact = false } = {}) {
  if (exact) return !firstHit(walk, a, b);
  const ta = walk.tileOf(a.x, a.z), tb = walk.tileOf(b.x, b.z);
  if (ta < 0 || tb < 0) return false;
  const key = ta * walk.cols * walk.rows + tb, m = cacheFor(walk);
  if (m.has(key)) return m.get(key);
  const ca = walk.centre(ta), cb = walk.centre(tb);
  const v = !firstHit(walk, ca, cb);
  m.set(key, v);
  m.set(tb * walk.cols * walk.rows + ta, v);
  if (m.size > 200000) m.clear();
  return v;
}

export function canNotice(walk, monster, target, range, { pather = null, maxCost = null, pathFactor = 1.6 } = {}) {
  const dy = (monster.y ?? walk.y(monster.x, monster.z)) - (target.y ?? walk.y(target.x, target.z));
  if (Math.hypot(target.x - monster.x, target.z - monster.z, dy) > range) return false;
  if (!lineOfSight(walk, monster, target)) return false;
  const limit = maxCost ?? Math.ceil(range / walk.tile * pathFactor) + 2;
  return (pather || patherFor(walk)).cost(monster, target, limit) <= limit;
}
export const joinsFight = (walk, mate, fightAt, range, opts) => canNotice(walk, mate, fightAt, range, opts);
