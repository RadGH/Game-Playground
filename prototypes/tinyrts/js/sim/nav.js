// Side-view pathfinding for Lumen/Umbra walkers. The map is split into 4x4-cell nodes. A node is
// "open" if nearly empty; a unit can stand in a node that's open, has an open node above it (head
// room) and something solid below. A* links standing nodes with walk, step-up, jump and drop moves.
// The open/closed cache is cleared per 32x32 chunk whenever cells change.

import { M } from '../world/materials.js';
import { CHUNK } from '../world/world.js';

export const NODE = 4;
// Search order for "nearest standing node": right here, then just below/above, favoring down.
const DJ_ORDER = [0, 1, -1, 2, 3, -2, 4, 5, -3, 6, 7, 8, -4, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

export class Nav {
  constructor(world) {
    this.world = world;
    this.nw = Math.ceil(world.w / NODE);
    this.nh = Math.ceil(world.h / NODE);
    this.cache = { 1: new Int8Array(this.nw * this.nh).fill(-1), 2: new Int8Array(this.nw * this.nh).fill(-1) };
  }

  // Clear cached nodes in dirty chunks.
  refresh() {
    const w = this.world;
    if (!w.anyNavDirty) return;
    const per = CHUNK / NODE;
    for (let cy = 0; cy < w.ch; cy++) for (let cx = 0; cx < w.cw; cx++) {
      const ci = cy * w.cw + cx;
      if (!w.dirtyNav[ci]) continue;
      w.dirtyNav[ci] = 0;
      for (let j = cy * per; j < Math.min(this.nh, (cy + 1) * per); j++) for (let i = cx * per; i < Math.min(this.nw, (cx + 1) * per); i++) {
        this.cache[1][j * this.nw + i] = -1;
        this.cache[2][j * this.nw + i] = -1;
      }
    }
    w.anyNavDirty = false;
  }

  open(i, j, team) {
    if (i < 0 || i >= this.nw || j >= this.nh) return false;
    if (j < 0) return true;
    const c = this.cache[team] || this.cache[1];
    const k = j * this.nw + i;
    if (c[k] >= 0) return c[k] === 1;
    const w = this.world;
    let solid = 0;
    for (let y = j * NODE; y < j * NODE + NODE; y++) for (let x = i * NODE; x < i * NODE + NODE; x++) {
      if (w.solidFor(x, y, team)) solid++;
    }
    const o = solid <= 6 ? 1 : 0; // lenient so sloped ground still counts as walkable
    c[k] = o;
    return o === 1;
  }

  // Can a unit `clear` nodes tall stand in node (i, j)? (Default: 2 nodes = 8 cells.)
  stand(i, j, team, clear = 2) {
    if (!this.open(i, j, team) || this.open(i, j + 1, team)) return false;
    for (let k = 1; k < clear; k++) if (!this.open(i, j - k, team)) return false;
    return true;
  }

  // Nearest standing node to cell (x, y), searching downward then outward.
  nearestStand(x, y, team, clear = 2) {
    let i0 = Math.floor(x / NODE), j0 = Math.floor(y / NODE);
    i0 = Math.max(0, Math.min(this.nw - 1, i0));
    for (let r = 0; r < 12; r++) {
      for (const di of r === 0 ? [0] : [-r, r]) {
        const i = i0 + di;
        if (i < 0 || i >= this.nw) continue;
        for (const dj of DJ_ORDER) {
          const j = j0 + dj;
          if (j < 0 || j >= this.nh) continue;
          if (this.stand(i, j, team, clear)) return { i, j };
        }
      }
    }
    return null;
  }
}

class Heap {
  constructor() { this.a = []; }
  push(n, f) { const a = this.a; a.push([f, n]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top[1]; }
  get size() { return this.a.length; }
}

// A* for a walker. Returns [{x, y}] of feet positions (cells), or a path to the closest reachable
// node if the goal can't be reached, or null.
export function findPath(game, u, gx, gy) {
  const nav = game.nav;
  nav.refresh();
  const team = u.team === 2 ? 2 : 1;
  const clear = Math.max(2, Math.ceil(u.h / NODE));
  const start = nav.nearestStand(u.x, u.y - 1, team, clear);
  const goal = nav.nearestStand(gx, gy - 1, team, clear);
  if (!start || !goal) return null;
  const jumpN = Math.max(1, Math.floor((game.data.units.list[u.type]?.jump || 0) / NODE));
  const NW = nav.nw;
  const key = (i, j) => j * NW + i;
  const g = new Map(), came = new Map();
  const heap = new Heap();
  const sk = key(start.i, start.j), gk = key(goal.i, goal.j);
  g.set(sk, 0);
  heap.push(sk, 0);
  const h = (i, j) => Math.abs(i - goal.i) + Math.abs(j - goal.j) * 0.5;
  let best = sk, bestH = h(start.i, start.j);
  let expanded = 0;
  while (heap.size && expanded < 5000) {
    const k = heap.pop();
    expanded++;
    if (k === gk) { best = k; break; }
    const i = k % NW, j = (k / NW) | 0;
    const gc = g.get(k);
    const hh = h(i, j);
    if (hh < bestH) { bestH = hh; best = k; }
    for (const di of [-1, 1]) {
      const ni = i + di;
      if (ni < 0 || ni >= NW) continue;
      const tryN = (nj, cost) => {
        const nk = key(ni, nj);
        const ng = gc + cost;
        if (g.has(nk) && g.get(nk) <= ng) return;
        g.set(nk, ng); came.set(nk, k);
        heap.push(nk, ng + h(ni, nj));
      };
      // Walk.
      if (nav.stand(ni, j, team, clear)) tryN(j, 1);
      // Step up one node (needs head room above current node).
      else if (nav.stand(ni, j - 1, team, clear) && nav.open(i, j - clear, team)) tryN(j - 1, 1.5);
      // Jump up several nodes.
      for (let k2 = 2; k2 <= jumpN; k2++) {
        let clear = true;
        for (let c = 1; c <= k2 + 1; c++) if (!nav.open(i, j - c, team)) { clear = false; break; }
        if (!clear) break;
        if (nav.stand(ni, j - k2, team, clear)) { tryN(j - k2, 1 + k2); break; }
      }
      // Drop down.
      if (nav.open(ni, j, team) && nav.open(ni, j - 1, team) && (clear < 3 || nav.open(ni, j - 2, team))) {
        for (let k2 = 1; k2 < 40; k2++) {
          if (!nav.open(ni, j + k2 - 1, team)) break;
          if (nav.stand(ni, j + k2, team, clear)) { tryN(j + k2, 1 + k2 * 0.3); break; }
        }
      }
    }
  }
  // Rebuild.
  const path = [];
  let k = best;
  let guard = 0;
  while (k !== undefined && guard++ < 2000) {
    const i = k % NW, j = (k / NW) | 0;
    path.push({ x: i * NODE + NODE / 2, y: (j + 1) * NODE });
    if (k === sk) break;
    k = came.get(k);
  }
  path.reverse();
  return path;
}

// A* for flyers: any open node, 8 directions (no corner cutting). Returns [{x, y}] of box-bottom
// positions (cells), or null.
export function findFlyPath(game, u, gx, gy) {
  const nav = game.nav;
  nav.refresh();
  const team = u.team === 2 ? 2 : 1;
  const NW = nav.nw, NH = nav.nh;
  const clampI = (v) => Math.max(0, Math.min(NW - 1, v));
  const toNode = (x, y) => ({ i: clampI(Math.floor(x / NODE)), j: Math.max(0, Math.min(NH - 1, Math.floor(y / NODE))) });
  let s = toNode(u.x, u.y - u.h / 2), t = toNode(gx, gy);
  const passable = (i, j) => j < 0 || nav.open(i, j, team);
  // Nudge start/goal to the nearest open node.
  const nudge = (n) => {
    if (passable(n.i, n.j)) return n;
    for (let r = 1; r < 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (passable(n.i + di, n.j + dj) && n.i + di >= 0 && n.i + di < NW) return { i: n.i + di, j: n.j + dj };
    }
    return null;
  };
  s = nudge(s); t = nudge(t);
  if (!s || !t) return null;
  const key = (i, j) => (j + 64) * NW + i; // allow a little sky above the map (j >= -64)
  const g = new Map(), came = new Map();
  const heap = new Heap();
  const sk = key(s.i, s.j), tk = key(t.i, t.j);
  g.set(sk, 0); heap.push(sk, 0);
  const h = (i, j) => Math.hypot(i - t.i, j - t.j);
  let best = sk, bestH = h(s.i, s.j), n = 0;
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]];
  while (heap.size && n++ < 6000) {
    const k = heap.pop();
    if (k === tk) { best = k; break; }
    const i = k % NW, j = Math.floor(k / NW) - 64;
    const hh = h(i, j);
    if (hh < bestH) { bestH = hh; best = k; }
    for (const [di, dj, c] of DIRS) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || ni >= NW || nj < -60 || nj >= NH) continue;
      if (!passable(ni, nj)) continue;
      if (di && dj && (!passable(i + di, j) || !passable(i, j + dj))) continue;
      const nk = key(ni, nj), ng = g.get(k) + c;
      if (g.has(nk) && g.get(nk) <= ng) continue;
      g.set(nk, ng); came.set(nk, k);
      heap.push(nk, ng + h(ni, nj));
    }
  }
  const path = [];
  let k = best, guard = 0;
  while (k !== undefined && guard++ < 3000) {
    const i = k % NW, j = Math.floor(k / NW) - 64;
    path.push({ x: i * NODE + NODE / 2, y: j * NODE + NODE - 0.01 });
    if (k === sk) break;
    k = came.get(k);
  }
  path.reverse();
  return path;
}
