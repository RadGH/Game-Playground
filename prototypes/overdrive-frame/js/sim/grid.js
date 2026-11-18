// Grid buckets: the map is cut into square cells and every enemy is filed under the cell it stands in, so a bullet or
// a blast only checks the few cells it touches instead of all 600 enemies. Rebuilt once per step (cheap: one pass).

export class Grid {
  constructor(w, h, cell = 1) {
    this.cell = cell; this.cols = Math.max(1, Math.ceil(w / cell)); this.rows = Math.max(1, Math.ceil(h / cell));
    this.heads = new Int32Array(this.cols * this.rows).fill(-1);
    this.next = new Int32Array(64); this.items = [];
  }

  clear() { this.heads.fill(-1); this.items.length = 0; }

  _cellOf(x, z) {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cell)));
    const cz = Math.min(this.rows - 1, Math.max(0, Math.floor(z / this.cell)));
    return cz * this.cols + cx;
  }

  /** File one thing (anything with x, z). */
  add(it) {
    const i = this.items.length; this.items.push(it);
    if (i >= this.next.length) { const n = new Int32Array(this.next.length * 2); n.set(this.next); this.next = n; }
    const c = this._cellOf(it.x, it.z); this.next[i] = this.heads[c]; this.heads[c] = i;
  }

  /** Call fn(item) for everything filed in the cells a circle touches (the caller checks the real distance).
   *  fn returning true stops the search early. */
  near(x, z, r, fn) {
    const c = this.cell;
    const x0 = Math.max(0, Math.floor((x - r) / c)), x1 = Math.min(this.cols - 1, Math.floor((x + r) / c));
    const z0 = Math.max(0, Math.floor((z - r) / c)), z1 = Math.min(this.rows - 1, Math.floor((z + r) / c));
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      for (let i = this.heads[cz * this.cols + cx]; i !== -1; i = this.next[i]) if (fn(this.items[i]) === true) return true;
    }
    return false;
  }

  /** Everything within r of (x, z), real distance checked, as an array. */
  within(x, z, r, filter = null) {
    const out = [], r2 = r * r;
    this.near(x, z, r, it => { const dx = it.x - x, dz = it.z - z; if (dx * dx + dz * dz <= r2 + (it.r || 0) * (it.r || 0) + 2 * r * (it.r || 0) && (!filter || filter(it))) out.push(it); });
    return out;
  }
}
