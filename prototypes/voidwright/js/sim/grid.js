// A block grid: the shape of a ship, a station, a wreck or an asteroid.
//
// blocks[i] = { id, def, x, y, rot, hp, maxHp, item?, alive }   (x,y = top-left cell, cells = def.size²)
// cells[y*w + x] = block index + 1, or 0 for empty.
// A grid is pure data: no drawing, no physics. ship.js / body.js own it.

import { BLOCKS } from '../data/blocks.js';
import { LEGEND } from '../data/hulls.js';
import { partStat } from './partstats.js';

export const CELL = 10;
/** Block ids that changed name (old saves). */
export const RENAMED = { ore_silicate: 'rock', ore_ice: 'ore_carbon', ore_cuprite: 'ore_cobalt' };               // world units per cell

export function createGrid(w, h) {
  return { w, h, cells: new Int32Array(w * h), blocks: [], version: 0 };
}

export function blockAt(g, x, y) {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return null;
  const v = g.cells[y * g.w + x];
  return v ? g.blocks[v - 1] : null;
}

export function canPlace(g, def, x, y) {
  const n = def.size || 1;
  if (x < 0 || y < 0 || x + n > g.w || y + n > g.h) return false;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (g.cells[(y + j) * g.w + x + i]) return false;
  return true;
}

/** Add a block (no checks beyond bounds/overlap). Returns the block or null. */
export function place(g, id, x, y, rot = 0, item = null) {
  const def = BLOCKS[id];
  if (!def || !canPlace(g, def, x, y)) return null;
  const maxHp = partStat(def, item, 'hp');
  const b = { id, def, x, y, rot: def.rot ? rot & 7 : 0, hp: maxHp, maxHp, item, alive: true, idx: g.blocks.length };
  g.blocks.push(b);
  const n = def.size || 1;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g.cells[(y + j) * g.w + x + i] = b.idx + 1;
  g.version++;
  return b;
}

/** Remove a block entirely (build mode). Compacts indices. */
export function remove(g, b) {
  const keep = g.blocks.filter(o => o !== b);
  rebuild(g, keep);
}

function rebuild(g, list) {
  g.cells.fill(0);
  g.blocks = [];
  for (const b of list) {
    b.idx = g.blocks.length; g.blocks.push(b);
    if (!b.alive) continue;          // a destroyed block keeps its slot for repair but not its cells
    const n = b.def.size || 1;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g.cells[(b.y + j) * g.w + b.x + i] = b.idx + 1;
  }
  g.version++;
}

/** Destroyed blocks leave holes; a block that is dead stays in the list (for repair) but frees its cells. */
export function killBlock(g, b) {
  if (!b.alive) return;
  b.alive = false; b.hp = 0;
  const n = b.def.size || 1;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g.cells[(b.y + j) * g.w + b.x + i] = 0;
  g.version++;
}

/** Bring a dead block back (repair) if its cells are still free. */
export function reviveBlock(g, b, hp) {
  if (b.alive) return false;
  const n = b.def.size || 1;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (g.cells[(b.y + j) * g.w + b.x + i]) return false;
  b.alive = true; b.hp = hp;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g.cells[(b.y + j) * g.w + b.x + i] = b.idx + 1;
  g.version++;
  return true;
}

/** Alive blocks that touch the given one (shared edge). */
export function neighbours(g, b) {
  const out = new Set(); const n = b.def.size || 1;
  const look = (x, y) => { const o = blockAt(g, x, y); if (o && o !== b && o.alive) out.add(o); };
  for (let i = 0; i < n; i++) { look(b.x + i, b.y - 1); look(b.x + i, b.y + n); look(b.x - 1, b.y + i); look(b.x + n, b.y + i); }
  return out;
}

/**
 * Groups of alive blocks connected by edges. The group holding `root` (the core) comes first.
 * Used to break off pieces that lost their path to the bridge.
 */
export function components(g, root = null) {
  const seen = new Set(); const groups = [];
  const alive = g.blocks.filter(b => b.alive);
  const order = root && root.alive ? [root, ...alive.filter(b => b !== root)] : alive;
  for (const start of order) {
    if (seen.has(start)) continue;
    const group = []; const stack = [start]; seen.add(start);
    while (stack.length) {
      const b = stack.pop(); group.push(b);
      for (const o of neighbours(g, b)) if (!seen.has(o)) { seen.add(o); stack.push(o); }
    }
    groups.push(group);
  }
  return groups;
}

/** Parse a premade layout (rows + legend) into a grid. Returns { grid, problems }. */
export function gridFromRows(rows, legend = LEGEND, pad = 0) {
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const g = createGrid(w + pad * 2, h + pad * 2);
  const used = new Set(); const problems = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = rows[y][x];
    if (!c || c === ' ' || used.has(x + ',' + y)) continue;
    let entry = legend[c];
    if (!entry) { problems.push(`unknown "${c}" at ${x},${y}`); continue; }
    let [id, rot] = Array.isArray(entry) ? entry : [entry, 0];
    let def = BLOCKS[id]; const n = def.size || 1;
    let ok = true;
    for (let j = 0; j < n && ok; j++) for (let i = 0; i < n && ok; i++) if (rows[y + j]?.[x + i] !== c || used.has((x + i) + ',' + (y + j))) ok = false;
    if (!ok) { problems.push(`${id} at ${x},${y} is not a full ${n}x${n} square`); id = 'frame'; def = BLOCKS.frame; }
    const m = def.size || 1;
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) used.add((x + i) + ',' + (y + j));
    place(g, id, x + pad, y + pad, rot);
  }
  return { grid: g, problems };
}

/** Serialise / restore (saves, designs). */
export function gridToJSON(g) {
  // 7th field: 1 = this weapon fires on its own (needs a targeting slot, sim/ship.js autoSlots)
  return { w: g.w, h: g.h, b: g.blocks.map(b => [b.id, b.x, b.y, b.rot, b.alive ? Math.round(b.hp) : 0, b.item || 0, b.auto == null ? null : b.auto ? 1 : 0]) };
}
export function gridFromJSON(j) {
  const g = createGrid(j.w, j.h);
  for (const [id0, x, y, rot, hp, item, auto] of j.b) {
    const id = RENAMED[id0] || id0;
    if (!BLOCKS[id]) continue;
    const b = place(g, id, x, y, rot, item || null);
    if (b && auto != null) b.auto = !!auto;
    if (b && hp <= 0) killBlock(g, b); else if (b) b.hp = Math.min(b.maxHp, hp);
  }
  return g;
}

/** Trim empty border rows/cols; returns a new grid (used after splitting). */
export function cropToBlocks(blocks) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const b of blocks) { const n = b.def.size || 1; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + n); y1 = Math.max(y1, b.y + n); }
  const g = createGrid(x1 - x0, y1 - y0);
  for (const b of blocks) { const nb = place(g, b.id, b.x - x0, b.y - y0, b.rot, b.item); if (nb) { nb.hp = b.hp; if (b.look != null) nb.look = b.look; } }
  return { grid: g, ox: x0, oy: y0 };
}
