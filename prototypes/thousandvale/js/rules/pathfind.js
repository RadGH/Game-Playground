// Thousandvale — MONSTER PATHFINDING over a baked zone (stream C, M2).
//
// Farhold's monsters walk straight at what they want and slide along whatever is in the way, which
// is fine on open moor and hopeless behind a town wall or a cliff. A room's terrain that can say
// where a body cannot stand (`terrain.blocked` from nav.bin — trees, rocks, buildings, deep water —
// and `terrain.pathing`, set for real zones, which adds cliffs steeper than Farhold's 63° and deep
// water) gets this planner. A flat test terrain has neither, so `steer` answers null at once and the
// parity fixtures see Farhold's straight line, bit for bit.
//
// How it stays cheap enough for a hundred bots:
//   * nothing is planned while the straight line is clear; the line is re-checked at most every
//     LOS_EVERY seconds per monster;
//   * weighted A* runs on a 2 m grid (nav.bin's own step) in a 384 m window over typed arrays,
//     8-connected, no corner cutting, capped at
//     MAX_NODES expansions a search and a per-room BUDGET of expansions a tick — a monster that does
//     not get its turn this tick walks straight for one more tick and asks again;
//   * a found path is string-pulled to a few waypoints and CACHED by (start area, goal cell), so a
//     pack chasing the same player shares one search; a cell's blocked answer is cached per terrain;
//   * when the goal cannot be reached inside the cap, the path goes to the explored cell nearest the
//     goal (it gets as close as it can) and that monster backs off FAIL_BACKOFF seconds.
//
//   const pf = pathfinderFor(field)            // one per field, lazily (null when the terrain cannot block)
//   pf.beginTick(clock)
//   pf.steer(e, gx, gz) -> {x, z} waypoint to walk at, or null (walk straight)

const CELL = 2;
export const PATH = {
  CELL,
  MAX_NODES: 2500,       // expansions one search may use
  BUDGET: 4000,          // expansions per room per tick, all searches together
  LOS_EVERY: 0.3,        // seconds between straight-line checks per monster
  REPLAN_MOVE: 3,        // the goal moved this far from the path's end: plan again
  STALE: 2.5,            // seconds a path is trusted before it is planned again
  FAIL_BACKOFF: 1,       // seconds a monster waits after a failed search
  CACHE_TTL: 2,          // seconds a cached path is shared
  CLIFF_GRADE: Math.tan(63 * Math.PI / 180),   // Farhold ground.js CLIFF.deg
  DEEP: 1.1,             // metres of water a walker will not plan through (terrain-read `underwater`)
};

const OFF = 32768;
const keyOf = (ix, iz) => (ix + OFF) * 65536 + (iz + OFF);
// cell i is centred on i * CELL, so on a baked zone a cell IS a nav.bin sample (nav `at` rounds to the
// nearest sample) and the grid agrees with the exact test everywhere
const cellOf = v => Math.round(v / CELL);
const mid = i => i * CELL;
const EDGE = CELL * 0.45;

const BLOCK_CACHE = new WeakMap();
/** The "can a walker stand here" test for planning, cached per terrain per cell. Null = no planning. */
export function plannerBlocked(terrain) {
  if (!terrain || (!terrain.blocked && !terrain.pathing)) return null;
  let c = BLOCK_CACHE.get(terrain);
  if (!c) {
    const raw = (x, z) => {
      if (terrain.blocked?.(x, z)) return true;
      if (!terrain.pathing) return false;
      if (terrain.slopeAt && terrain.slopeAt(x, z, 1) > PATH.CLIFF_GRADE) return true;
      if (terrain.waterAt && terrain.waterAt(x, z) > PATH.DEEP) return true;
      return false;
    };
    // cells in 64 x 64 chunks (0 unknown, 1 free, 2 blocked), the last chunk remembered: a line or a
    // search walks the same chunk over and over
    const chunks = new Map();
    let lcx = NaN, lcz = NaN, lch = null;
    c = {
      cell(ix, iz) {
        const cx = ix >> 6, cz = iz >> 6;
        if (cx !== lcx || cz !== lcz) {
          const ck = keyOf(cx, cz);
          lch = chunks.get(ck);
          if (!lch) { if (chunks.size > 4096) chunks.clear(); lch = new Uint8Array(4096); chunks.set(ck, lch); }
          lcx = cx; lcz = cz;
        }
        const i = ((iz & 63) << 6) | (ix & 63);
        let v = lch[i];
        if (v === 0) {
          // blocked if the middle or any corner is (a wall that only clips a cell still shuts it; on nav.bin
          // all five points fall in the same sample, so it is exact there)
          const x = mid(ix), z = mid(iz);
          v = raw(x, z) || raw(x - EDGE, z - EDGE) || raw(x + EDGE, z - EDGE) || raw(x - EDGE, z + EDGE) || raw(x + EDGE, z + EDGE) ? 2 : 1;
          lch[i] = v;
        }
        return v === 2;
      },
      at(x, z) { return this.cell(cellOf(x), cellOf(z)); },
      /** the exact test at a point (no cell rounding) */
      fine: raw,
    };
    BLOCK_CACHE.set(terrain, c);
  }
  return c;
}

/**
 * Is the straight walk from (ax, az) to (bx, bz) free of blocked cells? Every cell the segment passes
 * through is visited (a grid walk, Amanatides-Woo), so a line cannot slip past the corner of a cell.
 */
export function clearLine(blk, ax, az, bx, bz) {
  const u0 = ax / CELL + 0.5, v0 = az / CELL + 0.5, u1 = bx / CELL + 0.5, v1 = bz / CELL + 0.5;
  let i = Math.floor(u0), j = Math.floor(v0);
  const iEnd = Math.floor(u1), jEnd = Math.floor(v1);
  const du = u1 - u0, dv = v1 - v0;
  const si = du > 0 ? 1 : du < 0 ? -1 : 0, sj = dv > 0 ? 1 : dv < 0 ? -1 : 0;
  const tdu = si ? Math.abs(1 / du) : Infinity, tdv = sj ? Math.abs(1 / dv) : Infinity;
  let tu = si > 0 ? (i + 1 - u0) * tdu : si < 0 ? (u0 - i) * tdu : Infinity;
  let tv = sj > 0 ? (j + 1 - v0) * tdv : sj < 0 ? (v0 - j) * tdv : Infinity;
  let first = true;
  for (let n = 0; n < 4096; n++) {
    // (the start cell is skipped: a body hugging a wall stands in a cell the grid calls blocked)
    if (!first && blk.cell(i, j)) return false;
    first = false;
    if (i === iEnd && j === jEnd) return true;
    if (tu < tv) { i += si; tu += tdu; } else if (tv < tu) { j += sj; tv += tdv; } else {
      // through a corner exactly: both side cells count
      if (blk.cell(i + si, j) || blk.cell(i, j + sj)) return false;
      i += si; j += sj; tu += tdu; tv += tdv;
    }
  }
  return true;
}

/** The straight walk on the exact (uncached) test, sampled every 0.25 m — only for short hops. */
function fineLine(blk, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.25));
  for (let i = 1; i <= n; i++) if (blk.fine(ax + dx * i / n, az + dz * i / n)) return false;
  return true;
}

// ---- A* scratch: one window of WIN x WIN cells (WIN * 2 m on a side) centred between start and goal,
// reused by every search in the process (rooms step one after another). Stamps instead of clearing.
const WIN = 192;
const N = WIN * WIN;
const G = new Float32Array(N), FROM = new Int32Array(N), SEEN = new Uint32Array(N), DONE = new Uint32Array(N);
const BSTAMP = new Uint32Array(N), BVAL = new Uint8Array(N);
const HK = new Int32Array(N * 2), HF = new Float32Array(N * 2);
let stamp = 0;

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

/**
 * Weighted A* (f = g + HEUR_W * h: a path at most HEUR_W times the shortest, found with far fewer
 * expansions round a concave wall) from (sx, sz) to (gx, gz) on the 2 m grid. Returns
 * { pts: [{x, z}…] (string-pulled, without the start), reached, used } — or { outOfBudget } when the
 * room's tick budget ran out first (nothing is kept; the monster asks again next tick).
 */
export const HEUR_W = 1.4;
export function findPath(blk, sx, sz, gx, gz, { maxNodes = PATH.MAX_NODES, budget = Infinity } = {}) {
  const six = cellOf(sx), siz = cellOf(sz);
  let gix = cellOf(gx), giz = cellOf(gz);
  // a goal standing in a blocked cell (a player hugging a tree): aim at the nearest free cell round it
  if (blk.cell(gix, giz)) {
    let found = false;
    for (let r = 1; r <= 3 && !found; r++) {
      for (let dx = -r; dx <= r && !found; dx++) for (let dz = -r; dz <= r && !found; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || blk.cell(gix + dx, giz + dz)) continue;
        gix += dx; giz += dz; found = true;
      }
    }
  }
  // the window; a goal beyond it is clamped to its edge (the path gets as close as the window allows)
  const ox = ((six + gix) >> 1) - (WIN >> 1), oz = ((siz + giz) >> 1) - (WIN >> 1);
  const lx = i => i - ox, lz = i => i - oz;
  const inWin = (x, z) => x >= 0 && z >= 0 && x < WIN && z < WIN;
  if (!inWin(lx(six), lz(siz))) return { pts: [], reached: false, used: 0 };
  const tgx = Math.max(0, Math.min(WIN - 1, lx(gix))), tgz = Math.max(0, Math.min(WIN - 1, lz(giz)));
  if (++stamp >= 0xffffffff) { stamp = 1; SEEN.fill(0); DONE.fill(0); BSTAMP.fill(0); }
  const blocked = (x, z) => {
    if (!inWin(x, z)) return true;
    const i = z * WIN + x;
    if (BSTAMP[i] !== stamp) { BSTAMP[i] = stamp; BVAL[i] = blk.cell(x + ox, z + oz) ? 1 : 0; }
    return BVAL[i] === 1;
  };
  const h = (x, z) => { const dx = Math.abs(x - tgx), dz = Math.abs(z - tgz); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
  let hn = 0;
  const push = (k, f) => {
    let i = hn++;
    while (i > 0) { const p = (i - 1) >> 1; if (HF[p] <= f) break; HK[i] = HK[p]; HF[i] = HF[p]; i = p; }
    HK[i] = k; HF[i] = f;
  };
  const pop = () => {
    const top = HK[0], lk = HK[--hn], lf = HF[hn];
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i, mf = lf;
      if (l < hn && HF[l] < mf) { m = l; mf = HF[l]; }
      if (r < hn && HF[r] < mf) { m = r; mf = HF[r]; }
      if (m === i) break;
      HK[i] = HK[m]; HF[i] = HF[m]; i = m;
    }
    if (hn) { HK[i] = lk; HF[i] = lf; }
    return top;
  };
  const s = lz(siz) * WIN + lx(six), g = tgz * WIN + tgx;
  const startBlocked = blk.cell(six, siz);
  G[s] = 0; SEEN[s] = stamp; FROM[s] = -1;
  push(s, h(lx(six), lz(siz)));
  let best = s, bestH = h(lx(six), lz(siz)), used = 0, reached = false;
  const cap = Math.min(maxNodes, budget);
  while (hn && used < cap && hn < HK.length - 8) {
    const k = pop();
    if (DONE[k] === stamp) continue;
    DONE[k] = stamp;
    used++;
    if (k === g) { reached = true; best = k; break; }
    const x = k % WIN, z = (k - x) / WIN;
    const hk = h(x, z);
    if (hk < bestH) { bestH = hk; best = k; }
    const gk = G[k];
    for (let d = 0; d < 8; d++) {
      const D = DIRS[d], nx = x + D[0], nz = z + D[1];
      if (blocked(nx, nz)) continue;
      // a monster hugging a wall stands in a cell the grid calls blocked: from there, only a cell it
      // can walk to in a straight line on the EXACT test counts (else the grid leaks through the wall)
      if (k === s && startBlocked && !fineLine(blk, sx, sz, mid(nx + ox), mid(nz + oz))) continue;
      if (D[0] && D[1] && (blocked(x + D[0], z) || blocked(x, z + D[1]))) continue;   // no corner cutting
      const nk = nz * WIN + nx;
      if (DONE[nk] === stamp) continue;
      const ng = gk + D[2];
      if (SEEN[nk] !== stamp || ng < G[nk]) { SEEN[nk] = stamp; G[nk] = ng; FROM[nk] = k; push(nk, ng + HEUR_W * h(nx, nz)); }
    }
  }
  if (!reached && used >= budget && budget < maxNodes) return { pts: null, reached: false, used, outOfBudget: true };
  if (best === s) return { pts: [], reached, used };
  const cells = [];
  for (let k = best; k !== s && k >= 0; k = FROM[k]) cells.push(k);
  cells.reverse();
  const raw = cells.map(k => { const x = k % WIN; return { x: mid(x + ox), z: mid((k - x) / WIN + oz) }; });
  if (reached && tgx === lx(gix) && tgz === lz(giz) && gix === cellOf(gx) && giz === cellOf(gz)) raw[raw.length - 1] = { x: gx, z: gz };
  // first the turns only (cells where the grid direction changes), then string-pull over those few:
  // keep a turn only where the straight line from the last kept point breaks
  const turns = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i - 1], b = raw[i], c = raw[i + 1];
    if (!c || !a || Math.sign(b.x - a.x) !== Math.sign(c.x - b.x) || Math.sign(b.z - a.z) !== Math.sign(c.z - b.z)) turns.push(b);
  }
  const pts = [];
  let ax = sx, az = sz;
  for (let i = 0; i < turns.length; i++) {
    const next = turns[i + 1];
    if (next && clearLine(blk, ax, az, next.x, next.z)) continue;
    pts.push(turns[i]);
    ax = turns[i].x; az = turns[i].z;
  }
  return { pts, reached, used };
}

const hashId = id => { const t = String(id); let h = 7; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0; return h; };

/** The room's planner, one per field (null when its terrain cannot block anything). */
export function pathfinderFor(field) {
  const blk = plannerBlocked(field.terrain);
  if (!blk) return null;
  if (field.pathfinder && field.pathfinder.blk === blk) return field.pathfinder;
  const cache = new Map();
  let clock = 0, left = PATH.BUDGET;
  // a monster whose search ran out of budget is owed a whole search: MAX_NODES is held back for it
  // from everybody else until it has had its turn (no monster is starved by a busy pack)
  let owed = null, owedAt = 0;
  const stats = { searches: 0, expansions: 0, cacheHits: 0, deferred: 0, failed: 0, ms: 0 };
  const pf = {
    blk, stats,
    beginTick(now) {
      clock = now;
      left = PATH.BUDGET;
      if (owed && clock - owedAt > 2) owed = null;
      if (cache.size > 256) for (const [k, v] of cache) if (clock - v.at > PATH.CACHE_TTL) cache.delete(k);
    },
    /** The waypoint `e` should walk at to reach (gx, gz), or null to walk straight. */
    steer(e, gx, gz) {
      const p = e.path;
      // the straight line, checked now and then (and at once when the goal jumped)
      // (each monster on its own phase, so a pack that woke together does not check on the same tick;
      // a line costs a quarter of an expansion a sample from the tick budget, and when the budget is
      // gone the last answer stands)
      const L = e.los;
      if (!L || clock - L.at >= PATH.LOS_EVERY || Math.hypot(L.gx - gx, L.gz - gz) > PATH.REPLAN_MOVE) {
        const cost = Math.hypot(gx - e.x, gz - e.z) / (CELL * 0.5) / 4;
        if (!L || left >= cost) {
          left -= cost;
          const phase = L ? 0 : PATH.LOS_EVERY * (((e.uid ?? hashId(e.id)) % 7) / 7);
          e.los = { at: clock - phase, gx, gz, free: clearLine(blk, e.x, e.z, gx, gz) };
        }
      }
      // the line looked open but the body could not move along it (monster-ai.js sets `stuckAt`): plan anyway
      if (e.los.free && !(e.stuckAt != null && clock - e.stuckAt < 1)) { e.path = null; return null; }
      if (p && p.pts && (clock - p.at > PATH.STALE || Math.hypot(p.gx - gx, p.gz - gz) > PATH.REPLAN_MOVE)) e.path = null;
      if (!e.path) {
        if (e.pathFailAt != null && clock - e.pathFailAt < PATH.FAIL_BACKOFF) return null;
        const ck = `${Math.floor(e.x / 8)},${Math.floor(e.z / 8)}>${cellOf(gx)},${cellOf(gz)}`;
        const hit = cache.get(ck);
        let pts, reached;
        if (hit && clock - hit.at <= PATH.CACHE_TTL) { pts = hit.pts; reached = hit.reached; stats.cacheHits++; }
        else {
          const mine = owed && owed !== e ? left - PATH.MAX_NODES : left;
          if (mine < 200) { stats.deferred++; return null; }
          const r = findPath(blk, e.x, e.z, gx, gz, { budget: mine });
          left -= r.used; stats.searches++; stats.expansions += r.used;
          if (r.outOfBudget) { stats.deferred++; if (!owed) { owed = e; owedAt = clock; } return null; }
          if (owed === e) owed = null;
          pts = r.pts; reached = r.reached;
          cache.set(ck, { pts, reached, at: clock });
        }
        if (!reached) { e.pathFailAt = clock; stats.failed++; }
        if (!pts.length) return null;
        e.path = { pts, i: 0, gx, gz, at: clock, reached };
      }
      const P = e.path;
      // advance past waypoints already reached, or skip ahead to one already in plain sight
      while (P.i < P.pts.length - 1 && (Math.hypot(P.pts[P.i].x - e.x, P.pts[P.i].z - e.z) < 1.2 || clearLine(blk, e.x, e.z, P.pts[P.i + 1].x, P.pts[P.i + 1].z))) P.i++;
      const w = P.pts[P.i];
      // what is left to walk along the path (the monster AI's "still making progress" measure)
      let rest = Math.hypot(w.x - e.x, w.z - e.z);
      for (let j = P.i + 1; j < P.pts.length; j++) rest += Math.hypot(P.pts[j].x - P.pts[j - 1].x, P.pts[j].z - P.pts[j - 1].z);
      P.left = rest;
      if (P.i === P.pts.length - 1 && Math.hypot(w.x - e.x, w.z - e.z) < 1.2) { e.path = null; return null; }
      return w;
    },
  };
  field.pathfinder = pf;
  return pf;
}
