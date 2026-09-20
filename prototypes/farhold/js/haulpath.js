// Farhold — the way a hauler actually walks, and how long it is.
//
// "We should not require the user to click the route button but maybe just use a pathfinding to
// route the way."
//
// Until this file, a route between a drill and a store was a STRAIGHT LINE: `Math.hypot` between
// the two, straight into `haulThroughput`. Which is fine on a flat field and wrong everywhere else
// — a crate on the far side of a lake was "forty metres away" and delivered as if the hauler walked
// on water, and a seam at the bottom of a gorge cost the same as one on the lawn. The one number
// the whole resource system is built around (units delivered per minute) was being computed from a
// distance nobody could walk.
//
// So: A* over a coarse grid, with the terrain deciding what a step costs.
//
//   * **8 m cells.** Fine enough to go round a pond, coarse enough that a 400 m route is a couple
//     of thousand cells rather than a hundred thousand. A hauler is a cart, not a cat.
//   * **Water is impassable**, and so is anything steeper than a cart can climb.
//   * **A step costs its length times what the ground does to it** — up a bank is dearer than along
//     the flat, so a route follows a contour the way a real track does.
//   * **A bounded box.** The search never looks further than half again the straight-line distance
//     out from either end, so a store with no walkable route to it fails fast instead of flooding
//     the planet.
//
// The answer is `metres` — the length of the path actually walked — and `points`, so the route can
// be DRAWN. Seeing the line your ore takes is most of the reason to have one.
//
//   import { findHaulPath } from './haulpath.js';
//   const path = findHaulPath({ from: drill, to: crate, terrain });
//   path.ok ? path.metres : null;
//
// Pure: no Three.js, no DOM. `terrain` is only ever asked three questions, so the node tests hand
// it a stand-in.

/** How wide one search cell is, in metres. */
export const CELL = 8;

/** Anything steeper than this is a bank a loaded cart does not go up. */
export const MAX_SLOPE = 0.62;

/**
 * How much dearer a step is for the ground it crosses.
 *
 * Slope is the honest one: hauling up a one-in-three bank is genuinely slower than the flat. The
 * small constant on top is what stops the path zig-zagging across a dead-flat field to shave a
 * rounding error — with every step costing the same, A* has no reason to prefer a straight one.
 */
export function stepCost(slope) {
  return 1 + Math.max(0, slope) * 2.6;
}

/**
 * The route a hauler walks between two points, or `{ ok: false }` when there is not one.
 *
 * `terrain` needs three methods and nothing else:
 *   `underwater(x, z)` / `waterAt(x, z)` — either will do; water is a wall
 *   `slopeAt(x, z, span)`               — how steep it is there
 *
 * `budget` caps how many cells the search may open, which is the difference between "there is no
 * way round this lake" answering in a millisecond and searching a continent.
 */
export function findHaulPath({ from, to, terrain = null, cell = CELL, maxSlope = MAX_SLOPE, budget = 4000 } = {}) {
  const straight = Math.hypot(to.x - from.x, to.z - from.z);
  if (!terrain || straight <= cell) {
    return { ok: true, metres: straight, points: [[from.x, from.z], [to.x, to.z]], direct: true };
  }

  const wet = (x, z) => (terrain.underwater ? terrain.underwater(x, z) : false) || (terrain.waterAt ? !!terrain.waterAt(x, z) : false);
  const slope = (x, z) => (terrain.slopeAt ? terrain.slopeAt(x, z, 4) : 0);

  // the grid is anchored on the START, so the same pair of points always searches the same cells
  const gx = v => Math.round((v - from.x) / cell);
  const gz = v => Math.round((v - from.z) / cell);
  const wx = i => from.x + i * cell;
  const wz = i => from.z + i * cell;

  const goal = [gx(to.x), gz(to.z)];
  // half again the straight line, in cells, measured from the midpoint: a detour worth more than
  // that is a detour the player would rather know about than wait for
  const reach = Math.ceil((straight * 1.5) / cell) + 2;

  const key = (i, j) => `${i},${j}`;
  const open = [{ i: 0, j: 0, g: 0, f: 0 }];
  const cameFrom = new Map();
  const best = new Map([[key(0, 0), 0]]);
  const closed = new Set();
  let opened = 0;

  const h = (i, j) => Math.hypot(i - goal[0], j - goal[1]) * cell;

  while (open.length) {
    // a linear scan for the cheapest: the open set here is hundreds of entries, and a binary heap
    // costs more in code than it saves at this size
    let at = 0;
    for (let k = 1; k < open.length; k++) if (open[k].f < open[at].f) at = k;
    const cur = open.splice(at, 1)[0];
    const ck = key(cur.i, cur.j);
    if (closed.has(ck)) continue;
    closed.add(ck);

    if (cur.i === goal[0] && cur.j === goal[1]) {
      const points = [];
      let node = ck;
      while (node) {
        const [i, j] = node.split(',').map(Number);
        points.unshift([wx(i), wz(j)]);
        node = cameFrom.get(node);
      }
      points[0] = [from.x, from.z];
      points[points.length - 1] = [to.x, to.z];
      let metres = 0;
      for (let k = 0; k + 1 < points.length; k++) {
        metres += Math.hypot(points[k + 1][0] - points[k][0], points[k + 1][1] - points[k][1]);
      }
      return { ok: true, metres, points, direct: false, opened };
    }

    if (++opened > budget) break;

    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = cur.i + di, nj = cur.j + dj;
        if (Math.hypot(ni, nj) > reach && Math.hypot(ni - goal[0], nj - goal[1]) > reach) continue;
        const nk = key(ni, nj);
        if (closed.has(nk)) continue;
        const x = wx(ni), z = wz(nj);
        // the goal cell is always enterable: a crate standing in a puddle is still a crate
        const isGoal = ni === goal[0] && nj === goal[1];
        if (!isGoal) {
          if (wet(x, z)) continue;
          const s = slope(x, z);
          if (s > maxSlope) continue;
        }
        const step = Math.hypot(di, dj) * cell * stepCost(isGoal ? 0 : slope(x, z));
        const g = cur.g + step;
        if (best.has(nk) && best.get(nk) <= g) continue;
        best.set(nk, g);
        cameFrom.set(nk, ck);
        open.push({ i: ni, j: nj, g, f: g + h(ni, nj) });
      }
    }
  }

  return { ok: false, metres: Infinity, points: [], why: 'Nothing can get from there to there on foot.' };
}

/**
 * The best store to send a drill's output to, judged by what actually ARRIVES.
 *
 * Not the nearest one: a crate ninety metres away over open ground beats one forty metres away on
 * the far side of a river, and the whole point of measuring the walk is to be able to say so. The
 * pool the drill is already standing IN wins outright, because then there is no trip at all.
 *
 * `rateFor(metres)` is whatever the caller's haulage costs — js/stores.js `haulThroughput` — so this
 * file never learns what a hand cart is.
 */
export function bestStoreFor({ from, pools = [], terrain = null, rateFor = null, insidePoolId = null, maxMetres = 700 } = {}) {
  let best = null;
  /**
   * NEAREST FIRST, AND STOP WHEN THE CROW FLIGHT CANNOT WIN.
   *
   * A\* is cheap once and not cheap forty times, and a base ends up with a lot of crates. Two
   * prunes, both of which only ever skip a store that could not have won anyway: a pool further
   * than `maxMetres` as the crow flies is a route that delivers almost nothing whatever the ground
   * does, and once a winner is found any pool whose STRAIGHT line is already longer than the
   * winner's walked path cannot beat it — the walk is never shorter than the line.
   */
  // the pool the drill is standing IN wins outright, and its centre may be anywhere — a pool is a
  // union of everything within reach of everything else, so it can be much wider than one crate
  if (insidePoolId) {
    const here = pools.find(p => p.id === insidePoolId);
    if (here) return { pool: here, metres: 0, direct: true, perSecond: Infinity, path: null };
  }

  const ordered = pools
    .map(pool => ({ pool, crow: Math.hypot(pool.x - from.x, pool.z - from.z) }))
    .filter(r => r.crow <= maxMetres)
    .sort((a, b) => a.crow - b.crow);

  for (const { pool, crow } of ordered) {
    if (best && crow >= best.metres) break;
    const path = findHaulPath({ from, to: pool, terrain });
    if (!path.ok) continue;
    const rate = rateFor ? rateFor(path.metres) : { perSecond: 1 / Math.max(1, path.metres) };
    const row = { pool, metres: path.metres, direct: false, perSecond: rate.perSecond, path };
    if (!best || row.perSecond > best.perSecond) best = row;
  }
  return best;
}
