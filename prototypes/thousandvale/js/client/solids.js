// What the camera may not pass through: buildings, fort towers and walls, big rocks — upright cylinders
// { x, z, r, bottom, top } in world metres, filed by owner (a zone, a site) in an 8 m grid so the camera's
// sixteen probes a frame cost a few lookups. Pure (no three) — exported for tests.

const CELL = 8;

export function createSolids() {
  const grid = new Map();      // "i,j" -> Set(solid)
  const byOwner = new Map();   // owner -> [solid]
  const key = (i, j) => i + ',' + j;
  function add(owner, list) {
    remove(owner);
    const mine = [];
    for (const s of list) {
      const o = { x: s.x, z: s.z, r: s.r, bottom: s.bottom ?? -Infinity, top: s.top ?? Infinity };
      mine.push(o);
      for (let i = Math.floor((o.x - o.r) / CELL); i <= Math.floor((o.x + o.r) / CELL); i++)
        for (let j = Math.floor((o.z - o.r) / CELL); j <= Math.floor((o.z + o.r) / CELL); j++) {
          const k = key(i, j); let c = grid.get(k); if (!c) grid.set(k, (c = new Set())); c.add(o);
        }
    }
    byOwner.set(owner, mine);
  }
  function remove(owner) {
    const mine = byOwner.get(owner); if (!mine) return;
    for (const o of mine)
      for (let i = Math.floor((o.x - o.r) / CELL); i <= Math.floor((o.x + o.r) / CELL); i++)
        for (let j = Math.floor((o.z - o.r) / CELL); j <= Math.floor((o.z + o.r) / CELL); j++) grid.get(key(i, j))?.delete(o);
    byOwner.delete(owner);
  }
  /** Is the point (x, y, z) inside any solid? */
  function blockAt(x, y, z) {
    const c = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!c) return false;
    for (const o of c) if (y >= o.bottom && y <= o.top && (x - o.x) ** 2 + (z - o.z) ** 2 <= o.r * o.r) return true;
    return false;
  }
  /**
   * How far along a segment from (ax,ay,az) to (bx,by,bz) the first solid starts (0..1), or 1 if clear.
   * Sampled every ~0.5 m (cheap; the camera only needs to stop before the wall, not at it to the millimetre).
   */
  function firstHit(ax, ay, az, bx, by, bz) {
    const L = Math.hypot(bx - ax, by - ay, bz - az), n = Math.max(4, Math.ceil(L / 0.5));
    for (let i = 1; i <= n; i++) { const t = i / n; if (blockAt(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t)) return (i - 1) / n; }
    return 1;
  }
  return { add, remove, blockAt, firstHit, get owners() { return [...byOwner.keys()]; }, count: () => [...byOwner.values()].reduce((a, l) => a + l.length, 0) };
}
