// Area-of-interest grid (stream A): 32 m cells over a room (PLAN §8.3). Pure.
//   const g = createGrid(sizeMetres, origin)
//   g.cellOf(x, z) -> index ; g.add(e) ; g.move(e) ; g.remove(e) ; g.query(x, z, r, out, filter?)
//   g.cells[i] = Set of entities ; g.center(i) -> {x, z}
// Entities carry e.cell (index or -1).

export const CELL = 32;

export function createGrid(size, origin = { x: 0, z: 0 }, cell = CELL) {
  const cols = Math.max(1, Math.ceil(size / cell));
  const cells = Array.from({ length: cols * cols }, () => new Set());
  const ox = origin.x, oz = origin.z;
  function cellOf(x, z) {
    let cx = Math.floor((x - ox) / cell), cz = Math.floor((z - oz) / cell);
    if (!(cx >= 0)) cx = 0; else if (cx >= cols) cx = cols - 1;
    if (!(cz >= 0)) cz = 0; else if (cz >= cols) cz = cols - 1;
    return cz * cols + cx;
  }
  const g = {
    cols, cell, cells, origin: { x: ox, z: oz },
    cellOf,
    cx: i => i % cols, cz: i => (i / cols) | 0,
    center(i) { return { x: ox + (i % cols + 0.5) * cell, z: oz + (((i / cols) | 0) + 0.5) * cell }; },
    add(e) { e.cell = cellOf(e.x, e.z); cells[e.cell].add(e); return e.cell; },
    /** Returns true when the entity changed cell. */
    move(e) {
      const c = cellOf(e.x, e.z);
      if (c === e.cell) return false;
      if (e.cell >= 0) cells[e.cell].delete(e);
      e.cell = c; cells[c].add(e);
      return true;
    },
    remove(e) { if (e.cell >= 0) cells[e.cell].delete(e); e.cell = -1; },
    /** Entities within r of (x, z). */
    query(x, z, r, out = [], filter = null) {
      const c0x = Math.max(0, Math.floor((x - r - ox) / cell)), c1x = Math.min(cols - 1, Math.floor((x + r - ox) / cell));
      const c0z = Math.max(0, Math.floor((z - r - oz) / cell)), c1z = Math.min(cols - 1, Math.floor((z + r - oz) / cell));
      const r2 = r * r;
      for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
        for (const e of cells[cz * cols + cx]) {
          const dx = e.x - x, dz = e.z - z;
          if (dx * dx + dz * dz <= r2 && (!filter || filter(e))) out.push(e);
        }
      }
      return out;
    },
    /** Cell indices whose square comes within r of (x, z) (for "is anyone near"). */
    cellsNear(x, z, r) {
      const out = [];
      const c0x = Math.max(0, Math.floor((x - r - ox) / cell)), c1x = Math.min(cols - 1, Math.floor((x + r - ox) / cell));
      const c0z = Math.max(0, Math.floor((z - r - oz) / cell)), c1z = Math.min(cols - 1, Math.floor((z + r - oz) / cell));
      for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) out.push(cz * cols + cx);
      return out;
    },
  };
  return g;
}
