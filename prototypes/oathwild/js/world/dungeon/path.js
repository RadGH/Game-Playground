// Oathwild dungeons — paths on the walk grid (brainstorm 2026-11-27-regions §3). Pure.
//
//   const P = createPather(walk)
//   P.path(from, to, { maxCost }) → { points: [[x, z]…], cost } | null   A* (8 ways, no cutting a corner past a wall);
//                                    cost in tiles (a diagonal = 1.414); null when there is none or it costs more
//   P.cost(from, to, maxCost)      → the cost alone (Infinity when none)
//   P.flowTo(target)               → a cached flow field (Float64Array of costs to the target tile; walls = Infinity)
//   P.nextStep(field, from)        → { x, z } the next tile centre downhill on the field (null when cut off)
//   P.goHome(m, home, dt, speed)   moves m one frame along the home flow field through walk.settle — a monster never
//                                    teleports home; returns true once it is there
//   P.shouldGiveUp(m, target, maxCost) → true when the path to the target is gone or longer than maxCost tiles
// Caches key on walk.version, so pulling a lever or opening a secret door clears them.

const SQ2 = Math.SQRT2;
const N8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

export function createPather(walk, { fields = 48 } = {}) {
  const { cols, rows } = walk, N = cols * rows;
  const flowCache = new Map();
  let ver = walk.version;
  const fresh = () => { if (walk.version !== ver) { flowCache.clear(); ver = walk.version; } };
  const ok = t => walk.pass[t] === 1;
  /** Neighbours of t that a body can step to (a diagonal needs both side tiles open). */
  function each(t, fn) {
    const i = t % cols, k = (t / cols) | 0;
    for (const [di, dk, c] of N8) {
      const ni = i + di, nk = k + dk;
      if (ni < 0 || nk < 0 || ni >= cols || nk >= rows) continue;
      const n = nk * cols + ni;
      if (!ok(n)) continue;
      if (di && dk && (!ok(k * cols + ni) || !ok(nk * cols + i))) continue;
      fn(n, c);
    }
  }
  /** The open tile a point stands on (or the nearest one, for a body standing at a tile edge or a column). */
  function startTile(p) {
    const t = walk.tileOf(p.x, p.z);
    if (t >= 0 && ok(t)) return t;
    const s = walk.snapToWalkable(p.x, p.z, 0.2);
    const u = walk.tileOf(s.x, s.z);
    return u >= 0 && ok(u) ? u : -1;
  }
  const hx = t => t % cols, hz = t => (t / cols) | 0;
  const octile = (a, b) => { const dx = Math.abs(hx(a) - hx(b)), dz = Math.abs(hz(a) - hz(b)); return Math.max(dx, dz) + (SQ2 - 1) * Math.min(dx, dz); };

  function astar(a, b, maxCost) {
    const g = new Map([[a, 0]]), came = new Map(), heap = new Heap();
    heap.push(a, octile(a, b));
    const closed = new Set();
    while (heap.size) {
      const t = heap.pop();
      if (t === b) {
        const tiles = [t]; let c = t; while (came.has(c)) { c = came.get(c); tiles.push(c); }
        return { tiles: tiles.reverse(), cost: g.get(b) };
      }
      if (closed.has(t)) continue;
      closed.add(t);
      const gt = g.get(t);
      each(t, (n, c) => {
        const ng = gt + c;
        if (ng > maxCost || ng >= (g.get(n) ?? Infinity)) return;
        g.set(n, ng); came.set(n, t); heap.push(n, ng + octile(n, b));
      });
    }
    return null;
  }
  function path(from, to, { maxCost = Infinity } = {}) {
    fresh();
    const a = startTile(from), b = startTile(to);
    if (a < 0 || b < 0) return null;
    const r = astar(a, b, maxCost);
    if (!r) return null;
    return { points: r.tiles.map(t => { const c = walk.centre(t); return [c.x, c.z]; }), cost: r.cost };
  }
  const cost = (from, to, maxCost = Infinity) => path(from, to, { maxCost })?.cost ?? Infinity;

  /** Dijkstra out from one tile: every tile's cost to reach it. */
  function flowTo(target) {
    fresh();
    const b = typeof target === 'number' ? target : startTile(target);
    if (b < 0) return null;
    if (flowCache.has(b)) { const f = flowCache.get(b); flowCache.delete(b); flowCache.set(b, f); return f; }
    const f = new Float64Array(N).fill(Infinity), heap = new Heap();
    f[b] = 0; heap.push(b, 0);
    while (heap.size) {
      const [t, d] = heap.popWith();
      if (d > f[t]) continue;
      each(t, (n, c) => { if (d + c < f[n]) { f[n] = d + c; heap.push(n, d + c); } });
    }
    f.target = b;
    flowCache.set(b, f);
    if (flowCache.size > fields) flowCache.delete(flowCache.keys().next().value);
    return f;
  }
  function nextStep(field, from) {
    const a = startTile(from);
    if (a < 0 || !(field[a] < Infinity)) return null;
    if (a === field.target) { const c = walk.centre(a); return c; }
    let best = -1, bestV = field[a];
    each(a, n => { if (field[n] < bestV) { bestV = field[n]; best = n; } });
    return best < 0 ? null : walk.centre(best);
  }
  function goHome(m, home, dt, speed) {
    const d = Math.hypot(home.x - m.x, home.z - m.z);
    const len = speed * dt;
    let to;
    if (d < 2.5) to = home;
    else { const f = flowTo(home); to = f && nextStep(f, m); if (!to) to = home; }
    const dx = to.x - m.x, dz = to.z - m.z, L = Math.hypot(dx, dz);
    const k = L > 1e-6 ? Math.min(1, len / L) : 0;
    const p = walk.settle(m, { x: m.x + dx * k, z: m.z + dz * k });
    m.x = p.x; m.z = p.z;
    if (L > 1e-6) m.facing = Math.atan2(dx, dz);
    return Math.hypot(home.x - m.x, home.z - m.z) < 1;
  }
  const shouldGiveUp = (m, target, maxCost) => cost(m, target, maxCost) > maxCost;
  return { path, cost, flowTo, nextStep, goHome, shouldGiveUp, startTile };
}

/** A small binary heap of (item, priority). */
class Heap {
  constructor() { this.a = []; this.p = []; }
  get size() { return this.a.length; }
  push(x, pr) {
    const a = this.a, p = this.p; let i = a.length; a.push(x); p.push(pr);
    while (i > 0) { const j = (i - 1) >> 1; if (p[j] <= pr) break; a[i] = a[j]; p[i] = p[j]; i = j; }
    a[i] = x; p[i] = pr;
  }
  popWith() {
    const a = this.a, p = this.p, top = a[0], tp = p[0], x = a.pop(), xp = p.pop();
    if (a.length) {
      let i = 0; const n = a.length;
      for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && p[c + 1] < p[c]) c++; if (p[c] >= xp) break; a[i] = a[c]; p[i] = p[c]; i = c; }
      a[i] = x; p[i] = xp;
    }
    return [top, tp];
  }
  pop() { return this.popWith()[0]; }
}
