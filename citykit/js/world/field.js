// The path map creatures follow: every tile knows how far it is from the city, counting walls as passable but very
// expensive (so a horde walks to the nearest weak point of the wall and chews through it, instead of milling about).
// Water is never passable — creatures don't swim — so bridges are the crossings and natural choke points.
// Plain data + plain functions: the scene and (later) the game share it, and tests run it in node.

export const T = { LAND: 0, WATER: 1, WALL: 2, BRIDGE: 3, BUILDING: 4 };
const WALL_COST = 30;      // a wall tile counts as 30 tiles of walking: worth breaking only when there's no way round
export { WALL_COST };
const BUILDING_COST = 6;   // buildings block too, but creatures will chew into the city's edge once inside

export class Grid {
  constructor(w, d) { this.w = w; this.d = d; this.kind = new Uint8Array(w * d); this.hp = new Float32Array(w * d); this.dist = new Float64Array(w * d); }   // 64-bit: 32 rounds diagonal costs and the search skips cells
  /** Optional per-tile cost for WALL tiles (Float32Array, 0 = the default WALL_COST). A game sets it before solve() to
   *  make some wall tiles more tempting — Arcline's gates are cheaper, so a horde nearby heads for the gate. */
  wallCost = null;
  i(x, z) { return z * this.w + x; }
  in(x, z) { return x >= 0 && z >= 0 && x < this.w && z < this.d; }
  at(x, z) { return this.in(x, z) ? this.kind[this.i(x, z)] : T.WATER; }
  set(x, z, k, hp = 0) { const i = this.i(x, z); this.kind[i] = k; this.hp[i] = hp; }
  /** Can a creature stand here right now? */
  open(x, z) { const k = this.at(x, z); return k === T.LAND || k === T.BRIDGE; }
  /** Cost to step into a tile (Infinity = never). */
  cost(x, z) {
    const k = this.at(x, z);
    return k === T.LAND || k === T.BRIDGE ? 1 : k === T.WALL ? (this.wallCost?.[this.i(x, z)] || WALL_COST) : k === T.BUILDING ? BUILDING_COST : Infinity;
  }

  /** Recompute distances to the goal tiles (Dijkstra on the 8-neighbour grid; diagonals can't cut wall corners). */
  solve(goals) {
    const { w, d } = this, dist = this.dist; dist.fill(Infinity);
    const heap = new MinHeap();
    for (const [x, z] of goals) if (this.in(x, z)) { dist[this.i(x, z)] = 0; heap.push(0, this.i(x, z)); }
    const N = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    while (heap.size) {
      const [dc, i] = heap.pop(); if (dc > dist[i]) continue;
      const x = i % w, z = (i / w) | 0;
      for (const [dx, dz, len] of N) {
        const nx = x + dx, nz = z + dz; if (!this.in(nx, nz)) continue;
        if (dx && dz && (!this.open(x + dx, z) || !this.open(x, z + dz))) continue;   // no squeezing past corners
        const step = this.cost(nx, nz); if (step === Infinity) continue;
        const nd = dc + step * len, ni = this.i(nx, nz);
        if (nd < dist[ni]) { dist[ni] = nd; heap.push(nd, ni); }
      }
    }
    return this;
  }

  /** The downhill direction at a world point (x, z in tiles), as a unit vector [dx, dz]; [0,0] at the goal. */
  flow(px, pz) {
    const x = Math.floor(px), z = Math.floor(pz); if (!this.in(x, z)) return [0, 0];
    let best = this.dist[this.i(x, z)], bx = 0, bz = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue; const nx = x + dx, nz = z + dz; if (!this.in(nx, nz)) continue;
      if (dx && dz && (!this.open(x + dx, z) || !this.open(x, z + dz))) continue;
      const v = this.dist[this.i(nx, nz)]; if (v < best) { best = v; bx = dx; bz = dz; }
    }
    if (!bx && !bz) return [0, 0];
    // aim at the centre of the next tile so creatures don't hug edges
    const tx = x + bx + 0.5 - px, tz = z + bz + 0.5 - pz, l = Math.hypot(tx, tz) || 1;
    return [tx / l, tz / l];
  }
  /** The tile a creature at (px, pz) is trying to enter, if it's a wall or building to chew through. */
  blocker(px, pz) {
    const [fx, fz] = this.flow(px, pz);
    const x = Math.floor(px + fx * 0.75), z = Math.floor(pz + fz * 0.75);
    const k = this.at(x, z);
    return (k === T.WALL || k === T.BUILDING) && (x !== Math.floor(px) || z !== Math.floor(pz)) ? [x, z] : null;
  }
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(k, v) { const a = this.k, b = this.v; a.push(k); b.push(v); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p] <= a[i]) break; [a[p], a[i]] = [a[i], a[p]]; [b[p], b[i]] = [b[i], b[p]]; i = p; } }
  pop() {
    const a = this.k, b = this.v, top = [a[0], b[0]], lk = a.pop(), lv = b.pop();
    if (a.length) { a[0] = lk; b[0] = lv; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l] < a[m]) m = l; if (r < a.length && a[r] < a[m]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; [b[m], b[i]] = [b[i], b[m]]; i = m; } }
    return top;
  }
}
