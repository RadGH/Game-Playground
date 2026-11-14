// The block grid every body is made of (ships, rocks, stations, wreck chunks). Cells are 1 m cubes at integer
// coordinates. Blocks are plain objects:
//   { x, y, z, t: type id, r: facing (DIRS index), p: paint index, hp, maxHp, item?: { uid, kind, tier, rarity } }
// Most blocks fill one cell; big blocks (`BLOCKS[t].size === 2`, round 2) fill a 2×2×2 cube whose lowest corner is
// (x, y, z). Two maps keep both questions fast:
//   g.cells  block key (its corner cell) → block   — one entry per BLOCK: loop over this for "every block"
//   g.occ    cell key → block                      — one entry per CELL: use get/has for "what is at this cell"
// Always add and remove through put/remove so the two stay in step.

import { BLOCKS } from '../data/blocks.js';
import { DIRS } from '../core/math.js';
import { partStats } from './items.js';

const OFF = 512;
export const key = (x, y, z) => (x + OFF) + (y + OFF) * 1024 + (z + OFF) * 1048576;
export const unkey = k => ({ x: (k % 1024) - OFF, y: (Math.floor(k / 1024) % 1024) - OFF, z: Math.floor(k / 1048576) - OFF });

export function createGrid() { return { cells: new Map(), occ: new Map(), version: 0 }; }
export const get = (g, x, y, z) => g.occ.get(key(x, y, z)) || null;
export const has = (g, x, y, z) => g.occ.has(key(x, y, z));
export const getKey = (g, k) => g.occ.get(k) || null;
export const size = g => g.cells.size;
/** Edge length of a block in cells (1 or 2). */
export const sizeOf = b => BLOCKS[b.t]?.size || 1;
/** Every cell [x, y, z] a block fills. */
export function cellsOf(b) {
  const n = sizeOf(b); if (n === 1) return [[b.x, b.y, b.z]];
  const out = []; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) out.push([b.x + i, b.y + j, b.z + k]);
  return out;
}
/** The centre of a block in continuous grid coordinates. */
export const centreOf = b => { const h = sizeOf(b) / 2; return { x: b.x + h, y: b.y + h, z: b.z + h }; };

/** Max hit points of a block (parts scale with their item). */
export function blockMaxHp(b) {
  const def = BLOCKS[b.t]; if (!def) return 1;
  if (b.item) return Math.round(def.hp * (partStats(b.item).hpMul || 1));
  return def.hp;
}
export function put(g, b) {
  const blk = { x: b.x, y: b.y, z: b.z, t: b.t, r: b.r ?? 0, p: b.p ?? 0, item: b.item || null };
  blk.maxHp = blockMaxHp(blk); blk.hp = b.hp != null ? Math.min(b.hp, blk.maxHp) : blk.maxHp;
  for (const [x, y, z] of cellsOf(blk)) { const old = g.occ.get(key(x, y, z)); if (old && old !== blk) remove(g, x, y, z); }
  g.cells.set(key(blk.x, blk.y, blk.z), blk);
  for (const [x, y, z] of cellsOf(blk)) g.occ.set(key(x, y, z), blk);
  g.version++;
  return blk;
}
/** Remove the whole block that fills cell (x, y, z). */
export function remove(g, x, y, z) {
  const b = g.occ.get(key(x, y, z)); if (!b) return null;
  g.cells.delete(key(b.x, b.y, b.z));
  for (const [cx, cy, cz] of cellsOf(b)) g.occ.delete(key(cx, cy, cz));
  g.version++;
  return b;
}
/** Can a block of type t with its corner at (x, y, z) go here (every cell free)? */
export function fits(g, x, y, z, t) { const n = BLOCKS[t]?.size || 1; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) if (g.occ.has(key(x + i, y + j, z + k))) return false; return true; }

/** Every block reachable face-to-face from the block at (x,y,z). Returns a Set of BLOCK keys (corner cells). */
export function connectedFrom(g, x, y, z) {
  const start = get(g, x, y, z); const seen = new Set(); if (!start) return seen;
  const stack = [start]; seen.add(key(start.x, start.y, start.z));
  while (stack.length) {
    const b = stack.pop();
    for (const [cx, cy, cz] of cellsOf(b)) for (const [dx, dy, dz] of DIRS) {
      const n = g.occ.get(key(cx + dx, cy + dy, cz + dz)); if (!n || n === b) continue;
      const k = key(n.x, n.y, n.z); if (seen.has(k)) continue;
      seen.add(k); stack.push(n);
    }
  }
  return seen;
}
/** Split the grid into face-connected pieces (arrays of blocks), biggest first. */
export function components(g) {
  const left = new Set(g.cells.keys()); const out = [];
  while (left.size) {
    const k0 = left.values().next().value; const b0 = g.cells.get(k0);
    const set = connectedFrom(g, b0.x, b0.y, b0.z);
    const list = []; for (const k of set) { left.delete(k); list.push(g.cells.get(k)); }
    out.push(list);
  }
  return out.sort((a, b) => b.length - a.length);
}
export function bounds(g) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const b of g.cells.values()) {
    if (b.x < x0) x0 = b.x; if (b.y < y0) y0 = b.y; if (b.z < z0) z0 = b.z;
    const e = sizeOf(b) - 1;
    if (b.x + e > x1) x1 = b.x + e; if (b.y + e > y1) y1 = b.y + e; if (b.z + e > z1) z1 = b.z + e;
  }
  if (x0 === Infinity) return { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 };
  return { x0, y0, z0, x1, y1, z1 };
}
export function findType(g, t) { for (const b of g.cells.values()) if (b.t === t) return b; return null; }
export function* blocks(g) { yield* g.cells.values(); }

/** Compact save form: [x,y,z,t,r,p,itemUid|0,hp]. Items are stored once in the save's item list. */
export function gridToSave(g) {
  return [...g.cells.values()].map(b => [b.x, b.y, b.z, b.t, b.r, b.p, b.item ? b.item.uid : 0, Math.round(b.hp)]);
}
export function gridFromSave(rows, itemsByUid = new Map()) {
  const g = createGrid();
  for (const [x, y, z, t, r, p, uid, hp] of rows) {
    if (!BLOCKS[t]) continue;
    put(g, { x, y, z, t, r, p, item: uid ? itemsByUid.get(uid) || null : null, hp });
  }
  return g;
}
export function cloneGrid(g) { const c = createGrid(); for (const b of g.cells.values()) put(c, { ...b }); return c; }
