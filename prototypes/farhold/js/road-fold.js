// Farhold — switchbacks: a road that meets a hill it cannot climb winds up it instead.
//
// R27 M5. *"Roads wind up mountains instead of charging straight up them."*
//
// World Forge routes a road across map cells with an A* that squares the slope, which picks the
// gentle CELLS — and cannot fold a road inside one. On a Super tiny world a cell is 64 m and on a
// full-size one 640 m, so a hill inside a cell is climbed at whatever grade the hill has: 117% at
// the worst point on the user's own world (seed 25392). This file finds those climbs on a road's
// own line and re-routes each one inside a corridor around it, with a second, much finer A* whose
// cost climbs steeply past a 10% grade. On a slope it cannot take straight, the cheapest route is
// the one real engineers find: legs across the hillside joined by hairpins.
//
// Pure: no Three.js, no DOM, no terrain object. `js/planet.js` hands it a height function and a
// "can a road go here" predicate, and node tests drive it the same way.
//
// THE RULES THAT MAKE IT SAFE TO RUN ON EVERY ROAD OF EVERY WORLD:
//
//   * a road with no climb over the trigger comes back as THE SAME ARRAY, untouched — gentle roads
//     never move (tests/round27-roads.test.js pins that with a hash of seeds 7 and 4477);
//   * the two ends of a folded stretch are two of the road's own points, so `from`/`to`, a merge
//     junction and a town link are exactly where they were;
//   * a fold that does not make the climb gentler, or needs more than `maxLegs` legs, or would
//     cross water, a cliff or a town ring, is thrown away — the climb stays as it was and its
//     points are marked `steep`, which is a fact about the road rather than a failure to hide.

import { resample, smoothPoints } from './roadplan.js';

/** Sixteen directions: the eight neighbours plus the eight knight's moves, so a leg is not forced
 *  onto a 45° lattice (a road at 26° up a slope would otherwise have to staircase). */
const MOVES = [];
for (let dx = -2; dx <= 2; dx++) {
  for (let dz = -2; dz <= 2; dz++) {
    if (!dx && !dz) continue;
    if (Math.abs(dx) === 2 && (Math.abs(dz) === 2 || dz === 0)) continue;
    if (Math.abs(dz) === 2 && dx === 0) continue;
    MOVES.push([dx, dz, Math.hypot(dx, dz)]);
  }
}
// in order round the compass, so "one notch left" is the next entry
MOVES.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));

/** Is `p` within `r` of the polyline? */
function nearLine(p, line, r) {
  for (let k = 0; k + 1 < line.length; k++) {
    const [ax, az] = line[k], [bx, bz] = line[k + 1];
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
    let t = l2 > 0 ? ((p[0] - ax) * vx + (p[1] - az) * vz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    if ((ax + vx * t - p[0]) ** 2 + (az + vz * t - p[1]) ** 2 <= r * r) return true;
  }
  return false;
}

/** Arc length at every point of a polyline. */
function arcLengths(pts) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return s;
}

/**
 * The steepest grade over any `window` metres of a polyline, in both directions, and where.
 * `grades[i]` is the grade of the window STARTING at sample i.
 */
export function windowGrades(pts, heightAt, window = 40) {
  const s = arcLengths(pts);
  const h = pts.map(p => heightAt(p[0], p[1]));
  const grades = [];
  let j = 0;
  for (let i = 0; i < pts.length; i++) {
    while (j < pts.length - 1 && s[j] - s[i] < window) j++;
    if (s[j] - s[i] < window * 0.5) break;
    grades.push({ i, j, grade: (h[j] - h[i]) / (s[j] - s[i]) });
  }
  return { grades, s, h };
}

/** A small binary heap keyed on a float, holding integer ids. */
function makeHeap() {
  let keys = new Float64Array(1024), ids = new Int32Array(1024), n = 0;
  return {
    get size() { return n; },
    push(k, id) {
      if (n === keys.length) {
        const k2 = new Float64Array(n * 2); k2.set(keys); keys = k2;
        const i2 = new Int32Array(n * 2); i2.set(ids); ids = i2;
      }
      let c = n++;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (keys[p] <= k) break;
        keys[c] = keys[p]; ids[c] = ids[p]; c = p;
      }
      keys[c] = k; ids[c] = id;
    },
    pop() {
      const top = ids[0];
      const k = keys[--n], id = ids[n];
      let c = 0;
      for (;;) {
        let m = 2 * c + 1;
        if (m >= n) break;
        if (m + 1 < n && keys[m + 1] < keys[m]) m++;
        if (keys[m] >= k) break;
        keys[c] = keys[m]; ids[c] = ids[m]; c = m;
      }
      keys[c] = k; ids[c] = id;
      return top;
    },
  };
}

/**
 * Route from A to B inside `corridor` metres of `stretch`, on a `step`-metre lattice, where a leg
 * costs its length times `1 + (grade / target)^4`. That exponent is the whole design: at the target
 * grade a metre costs two, at twice the target it costs seventeen, so the search will happily walk
 * eight times further to keep a road at 10% — and a route across the hillside is exactly that.
 */
function routeInCorridor(A, B, stretch, { heightAt, blocked, step, corridor, target, maxNodes, power, greed, inDir, outDir }, stats) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of stretch) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1];
  }
  x0 -= corridor; x1 += corridor; z0 -= corridor; z1 += corridor;
  const nx = Math.ceil((x1 - x0) / step) + 1, nz = Math.ceil((z1 - z0) / step) + 1;
  const N = nx * nz;
  if (N > maxNodes) return null;
  stats.grid += N;
  // the corridor, rasterised segment by segment: a node is in if it is within `corridor` of the line
  const inside = new Uint8Array(N);
  const r = Math.ceil(corridor / step);
  const onLine = step * 1.5;
  for (let k = 0; k + 1 < stretch.length; k++) {
    const [ax, az] = stretch[k], [bx, bz] = stretch[k + 1];
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
    const gx0 = Math.max(0, Math.floor((Math.min(ax, bx) - x0) / step) - r), gx1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) - x0) / step) + r);
    const gz0 = Math.max(0, Math.floor((Math.min(az, bz) - z0) / step) - r), gz1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz) - z0) / step) + r);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const id = gx + gz * nx;
        if (inside[id] === 2) continue;
        const x = x0 + gx * step, z = z0 + gz * step;
        let t = l2 > 0 ? ((x - ax) * vx + (z - az) * vz) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = ax + vx * t - x, dz = az + vz * t - z;
        const d2 = dx * dx + dz * dz;
        // 2 = on the road's own line (within a step and a half), where it already runs today
        if (d2 <= onLine * onLine) inside[id] = 2;
        else if (d2 <= corridor * corridor) inside[id] = 1;
      }
    }
  }
  const hs = new Float64Array(N);
  const state = new Int8Array(N);            // 0 unknown, 1 open ground, -1 not a road
  const node = (id) => {
    if (!state[id]) {
      const x = x0 + (id % nx) * step, z = z0 + ((id / nx) | 0) * step;
      if (!inside[id]) { state[id] = -1; return false; }
      const h = heightAt(x, z);
      if (blocked(x, z, inside[id] === 2, h)) state[id] = -1;
      else { state[id] = 1; hs[id] = h; }
    }
    return state[id] > 0;
  };
  const snap = (p) => Math.min(nx - 1, Math.max(0, Math.round((p[0] - x0) / step)))
    + Math.min(nz - 1, Math.max(0, Math.round((p[1] - z0) / step))) * nx;
  const s = snap(A), e = snap(B);
  if (s === e) return null;
  // the two ends are the road's own points, so they are allowed whatever the predicate says
  state[s] = 1; hs[s] = heightAt(A[0], A[1]);
  state[e] = 1; hs[e] = heightAt(B[0], B[1]);
  const he = hs[e];
  /**
   * THE SEARCH CARRIES A HEADING, AND MAY ONLY TURN ONE NOTCH A STEP.
   *
   * A plain lattice A* happily lays a hairpin with its two legs one lattice step apart — seven
   * metres on a Super tiny world, three metres of height between them. `heightAt` hands the
   * ground between two roads to whichever is nearer, so a turn that tight is a step in the
   * hillside right through both carriageways (round22-roads' deck test caught one at 2.9 m). A
   * state here is a node AND the direction it was entered from, and a move may change that
   * direction by one of the sixteen notches (~22°). Turning round then takes eight moves, which is
   * a hairpin about five steps across: two carriageways, their verges, and a bank between them.
   */
  const D = MOVES.length;
  // the search's own arrays hold only the corridor's nodes, not the bounding box's: a long diagonal
  // stretch has a box several times the size of the strip it actually searches
  const slot = new Int32Array(N).fill(-1);
  let M = 0;
  for (let id = 0; id < N; id++) if (inside[id]) slot[id] = M++;
  for (const id of [s, e]) if (slot[id] < 0) slot[id] = M++;
  const idOf = new Int32Array(M);
  for (let id = 0; id < N; id++) if (slot[id] >= 0) idOf[slot[id]] = id;
  const cost = new Float64Array(M * D).fill(Infinity);
  const from = new Int32Array(M * D).fill(-1);
  const done = new Uint8Array(M * D);
  const ex = x0 + (e % nx) * step, ez = z0 + ((e / nx) | 0) * step;
  const heap = makeHeap();
  /**
   * THE LEAST A ROUTE TO THE GOAL CAN STILL COST — the A* heuristic, and an honest one.
   *
   * A route has to cover at least the straight distance `d` AND climb at least the height `dh`
   * still between here and B. The leg cost is convex in grade, so for a given length the cheapest
   * way to climb `dh` is one uniform grade, and the best length for that is `L* = 3^¼ · dh / target`
   * (where the cost's derivative in L is zero) — or `d` if that is further. Plain distance, the
   * usual heuristic, ignores the climb entirely and let the search flood the whole corridor on
   * every steep stretch; this one knows a 60 m rise costs a kilometre of road whatever you do.
   */
  const k4 = Math.pow(3, 0.25) / target, t4 = Math.pow(target, 4);
  const least = (d, dh) => {
    const L = Math.max(d, dh * k4);
    return power === 4 && L > 0 ? L + (dh * dh * dh * dh) / (t4 * L * L * L) : d;
  };
  const relax = (id, dir, base, prev) => {
    const cx = id % nx, cz = (id / nx) | 0;
    const mv = MOVES[dir];
    const gx = cx + mv[0], gz = cz + mv[1];
    if (gx < 0 || gz < 0 || gx >= nx || gz >= nz) return;
    const j = gx + gz * nx;
    if (slot[j] < 0) return;
    const sj = slot[j] * D + dir;
    if (done[sj] || !node(j)) return;
    const len = mv[2] * step;
    const g = Math.abs(hs[j] - hs[id]) / len / target;
    const g2 = g * g;
    const c = base + len * (1 + (power === 4 ? g2 * g2 : Math.pow(g, power)));
    if (c < cost[sj]) {
      cost[sj] = c;
      from[sj] = prev;
      const hx = x0 + gx * step - ex, hz = z0 + gz * step - ez;
      heap.push(c + greed * least(Math.sqrt(hx * hx + hz * hz), Math.abs(hs[j] - he)), sj);
    }
  };
  /**
   * …and it has to LEAVE the way the road came in, and ARRIVE the way the road goes on. Without
   * that the fold can reach B heading back the way it came, and the road then turns straight round
   * on the spot where the old line picks up again — measured on seed 101, a 180° kink with the
   * two carriageways a metre apart and 1.6 m of height between them.
   */
  const notch = (a) => {
    let best = 0, bd = Infinity;
    for (let k = 0; k < D; k++) {
      let d = Math.abs(Math.atan2(MOVES[k][1], MOVES[k][0]) - a);
      if (d > Math.PI) d = 2 * Math.PI - d;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  };
  const within = (dir, ref) => ref < 0 || Math.min((dir - ref + D) % D, (ref - dir + D) % D) <= 2;
  const inRef = inDir == null ? -1 : notch(inDir), outRef = outDir == null ? -1 : notch(outDir);
  for (let dir = 0; dir < D; dir++) if (within(dir, inRef)) relax(s, dir, 0, -1);
  let end = -1;
  while (heap.size) {
    const st = heap.pop();
    if (done[st]) continue;
    done[st] = 1;
    const id = idOf[(st / D) | 0], dir = st % D;
    if (id === e) {
      if (within(dir, outRef)) { end = st; break; }
      continue;
    }
    stats.expanded++;
    relax(id, dir, cost[st], st);
    relax(id, (dir + 1) % D, cost[st], st);
    relax(id, (dir + D - 1) % D, cost[st], st);
  }
  if (end < 0) return null;
  const out = [];
  let st = end;
  for (;;) {
    const id = idOf[(st / D) | 0];
    out.push([x0 + (id % nx) * step, z0 + ((id / nx) | 0) * step]);
    const prev = from[st];
    if (prev < 0) { out.push([x0 + (s % nx) * step, z0 + ((s / nx) | 0) * step]); break; }
    st = prev;
  }
  out.reverse();
  out[0] = [A[0], A[1]];
  out[out.length - 1] = [B[0], B[1]];
  return out;
}

/**
 * How many hairpins a route turns through: places where the heading swings more than 120° within
 * `span` metres. A leg is the stretch between two of them, so legs = hairpins + 1.
 */
export function countHairpins(pts, span = 40) {
  const s = arcLengths(pts);
  const heading = [];
  for (let i = 0; i + 1 < pts.length; i++) heading.push(Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]));
  let pins = 0, last = -Infinity;
  for (let i = 0; i < heading.length; i++) {
    if (s[i] - last < span) continue;
    let j = i;
    while (j + 1 < heading.length && s[j + 1] - s[i] <= span) j++;
    let turn = heading[j] - heading[i];
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    if (Math.abs(turn) > (120 * Math.PI) / 180) { pins++; last = s[j]; }
  }
  return pins;
}

/**
 * Find a road's climbs and fold each one.
 *
 * @param points   the road's points ([x, z] arrays)
 * @param opts.heightAt  natural ground height
 * @param opts.blocked   (x, z, onLine) → true where a road may not go (water, a cliff face, a town
 *                       ring). `onLine` is true within a step and a half of the road's own line,
 *                       where it already runs — a road leaving a town has to be allowed out of it.
 * @param opts.step      lattice / resample spacing in metres
 * @param opts.corridor  how far either side of the original line a leg may wander, in metres
 * @param opts.pinned    Map of point index → the junction point another road joins this one at.
 *                       A fold must still pass within `pinSlack` metres of it, or it is folded
 *                       either side of the junction instead.
 * @returns { points, folds, steep } — `points` is the SAME array when nothing was folded. Points
 *          of a climb that could not be folded carry `steep = true`; points a fold laid carry
 *          `fold = <fold number>`.
 */
export function foldClimbs(points, {
  heightAt, blocked = () => false, step = 6, corridor = 60,
  trigger = 0.12, window = 40, target = 0.10, maxLegs = 6, steepGrade = 0.2,
  mergeGap = 160, maxNodes = 250000, log = null, power = 4, greed = 1, pinned = new Map(), pinSlack = 8,
  corridors = [corridor],
} = {}) {
  const result = { points, folds: 0, steep: 0, tried: 0, grid: 0, expanded: 0 };
  if (!points || points.length < 2) return result;
  const fine = resample(points, step);
  const { grades, s } = windowGrades(fine, heightAt, window);
  // runs of windows over the trigger (overlapping windows joined)
  const runs = [];
  for (const g of grades) {
    if (Math.abs(g.grade) <= trigger) continue;
    const a = s[g.i], b = s[g.j];
    const last = runs[runs.length - 1];
    if (last && a <= last.b) last.b = Math.max(last.b, b);
    else runs.push({ a, b });
  }
  if (!runs.length) return result;

  const S = arcLengths(points);
  const total = S[S.length - 1];
  // a laid route is judged the way the deck will be drawn — point to point — not over the long
  // detection window, which on a full-size world is 400 m and averages a 50% bank away
  const check = Math.max(10, step * 1.01);
  const worstOf = (pts, over = check) => {
    const { grades: gs } = windowGrades(pts, heightAt, over);
    let worst = 0;
    for (const g of gs) worst = Math.max(worst, Math.abs(g.grade));
    return worst;
  };
  const markSteep = (pts) => {
    const { grades: gs } = windowGrades(pts, heightAt, check);
    const flag = new Uint8Array(pts.length);
    for (const g of gs) if (Math.abs(g.grade) > steepGrade) for (let k = g.i; k <= g.j; k++) flag[k] = 1;
    let n = 0;
    for (let k = 0; k < pts.length; k++) if (flag[k]) { pts[k].steep = true; n++; }
    return n;
  };

  /**
   * One stretch of the ORIGINAL points, from a margin before the first run to a margin after the
   * last, never starting before `floor` (the end of the stretch before it).
   */
  const stretchOf = (group, floor) => {
    const a = Math.max(0, group[0].a - window), b = Math.min(total, group[group.length - 1].b + window);
    let ia = floor;
    while (ia + 1 < S.length && S[ia + 1] <= a) ia++;
    let ib = S.length - 1;
    while (ib - 1 > ia && S[ib - 1] >= b) ib--;
    return { ia, ib };
  };
  /** Try to fold one stretch; the laid points, or null. */
  const tryFold = (ia, ib) => {
    if (ib - ia < 1) return null;
    const stretch = points.slice(ia, ib + 1);
    result.tried++;
    const fineStretch = resample(stretch, step);
    const before = worstOf(fineStretch), beforeHeld = worstOf(fineStretch, window);
    const dirOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
    const inDir = ia > 0 ? dirOf(points[ia - 1], points[ia]) : null;
    const outDir = ib + 1 < points.length ? dirOf(points[ib], points[ib + 1]) : null;
    /**
     * NARROW FIRST. Most climbs fold happily inside a third of a cell, and the lattice costs the
     * square of the corridor; only a climb the narrow corridor cannot take gently enough is tried
     * again in the full one. On the user's world that is the Dearbigate ridge and little else.
     */
    let best = null;
    for (const width of corridors) {
      const route = routeInCorridor(points[ia], points[ib], stretch, { heightAt, blocked, step, corridor: width, target, maxNodes, power, greed, inDir, outDir }, result);
      if (!route) { if (log) log.push({ at: points[ia], before, noRoute: true, width }); continue; }
      // the lattice's corners rounded off at the scale of one step, then laid at the road's spacing
      const laid = resample(smoothPoints(resample(route, step), 2), step);
      laid[0] = points[ia];
      laid[laid.length - 1] = points[ib];
      const after = worstOf(laid), afterHeld = worstOf(laid, window);
      const legs = countHairpins(laid, Math.max(window, step * 12)) + 1;
      if (log) log.push({ at: points[ia], before, after, legs, len: laid.length * step, width });
      /**
       * Kept when the climb it replaces is GENTLER held over the detection window, and no point-to-
       * point stretch of it is steeper than the steepest of the old line. A hairpin's apex on a
       * uniform slope cannot be flat — turning from one climbing leg to the next passes through the
       * fall line — so the local test is "no worse", not "better".
       */
      if (!(afterHeld < beforeHeld - 0.02 && after <= before + 0.01 && legs <= maxLegs)) continue;
      if (!best || afterHeld < best.afterHeld) best = { laid, afterHeld };
      if (afterHeld <= target + 0.04) break;
    }
    return best ? best.laid : null;
  };
  /**
   * A HILL IS ONE FOLD, UNLESS IT CANNOT BE.
   *
   * Climbs close together (`mergeGap`) are tried as one stretch first, so a road over a ridge is
   * planned up one side and down the other in one go rather than as two folds that each have to
   * end back on the old line at the top. When that fails — too many legs, usually, because a
   * whole range of hills was one "group" — the group is split at its widest gap and each half is
   * tried on its own, down to single climbs.
   */
  const plan = [];
  /**
   * A point another road joins is NOT the fold's to move: the join is filed against this road's
   * segment, and a branch left pointing at empty ground is a dead end with a ramp on it. So a
   * stretch that holds a pinned point is folded either side of it, and the point stays.
   */
  const foldAround = (ia, ib) => {
    let lo = ia;
    for (let k = ia + 1; k <= ib; k++) {
      if (k < ib && !pinned.has(k)) continue;
      const laid = (pinned.has(lo) && pinned.has(k) && k - lo === 1) ? null : tryFold(lo, k);
      plan.push({ ia: lo, ib: k, laid });
      lo = k;
    }
    return plan.slice(-1)[0];
  };
  /** Does a laid route still pass every junction inside the stretch (within `pinSlack`)? */
  const keepsJoins = (laid, ia, ib) => {
    for (let k = ia + 1; k < ib; k++) {
      const at = pinned.get(k);
      if (at && !nearLine(at, laid, pinSlack)) return false;
    }
    return true;
  };
  const attempt = (group, floor) => {
    const { ia, ib } = stretchOf(group, floor);
    let laid = tryFold(ia, ib);
    if (laid && !keepsJoins(laid, ia, ib)) laid = null;
    if (laid) { plan.push({ ia, ib, laid }); return ib; }
    if (group.length === 1) {
      let inner = false;
      for (let k = ia + 1; k < ib; k++) if (pinned.has(k)) { inner = true; break; }
      if (inner) foldAround(ia, ib);
      else plan.push({ ia, ib, laid: null });
      return ib;
    }
    let cut = 1, widest = -Infinity;
    for (let k = 1; k < group.length; k++) {
      const gap = group[k].a - group[k - 1].b;
      if (gap > widest) { widest = gap; cut = k; }
    }
    const mid = attempt(group.slice(0, cut), floor);
    return attempt(group.slice(cut), mid);
  };
  let group = [runs[0]], floor = 0;
  for (let k = 1; k <= runs.length; k++) {
    if (k < runs.length && runs[k].a - runs[k - 1].b <= mergeGap) { group.push(runs[k]); continue; }
    floor = attempt(group, floor);
    if (k < runs.length) group = [runs[k]];
  }

  const out = [];
  let cursor = 0;
  for (const { ia, ib, laid } of plan) {
    if (ia < cursor) continue;              // swallowed by the stretch before it
    for (let k = cursor; k < ia; k++) out.push(points[k]);
    if (laid) {
      result.folds++;
      for (let k = 1; k < laid.length - 1; k++) laid[k].fold = result.folds;
      result.steep += markSteep(laid);
      for (let k = 0; k < laid.length - 1; k++) out.push(laid[k]);
    } else {
      const stretch = points.slice(ia, ib + 1);
      result.steep += markSteep(stretch);
      for (let k = 0; k < stretch.length - 1; k++) out.push(stretch[k]);
    }
    cursor = ib;
  }
  for (let k = cursor; k < points.length; k++) out.push(points[k]);
  if (!result.folds) return result;          // marks only; the line itself did not move
  result.points = out;
  return result;
}
