// Farhold — a road you lay is the same KIND of thing as a road the world laid.
//
// *"Is it possible for the road tool under the build menu, as well as the side streets used in some
// town generators, use the same road network as the main road infrastructure? The road tool places
// a lot of rectangles that leave gaps in between and look unnatural. The tiles in town clip through
// the terrain."*
//
// They do, and the reason is that there were two completely different ideas of what a road IS.
//
//   * **The world's roads** (js/planet.js → js/features.js) are a POLYLINE with a graded height per
//     point. planet.js smooths the natural ground along the line four times and stores the result as
//     `surface`, and the terrain itself is carved down to meet it. features.js then draws ONE
//     continuous ribbon: two vertices per point, every quad sharing its neighbour's edge. There is
//     no gap between sections because there are no sections — it is a single strip of triangles
//     draped on ground that was shaped to receive it.
//   * **The build tool's roads** were ninety separate `road_dirt` boxes, each 4 m square, each
//     dropped at the height of its own middle. On a slope consecutive boxes step past each other and
//     the seams open; at a corner each box stops square and the wedge between two bearings is bare
//     grass. Exactly the same thing the town streets did, for exactly the same reason.
//
// So this file is the first idea, made reusable. A LANE is `{ points, surface, half }` — the same
// three fields `terrain.roadPaths` carries — and everything else here either makes one, levels the
// ground under one, or turns one into triangles. The build tool lays lanes; a town's side streets
// can be lanes; and both are drawn by the same ribbon maths the world's roads already use.
//
//   import { planLane, laneRibbon, levelLane, createRoadBook } from './roadplan.js';
//   const lane = planLane([[0,0],[40,10],[80,4]], { terrain, half: 2 });
//   levelLane(lane, terraform, { claim: 'cl1' });      // the ground comes up to meet it
//   const geom = laneRibbon(lane, { lift: 0.06 });     // → { position, normal, index }
//
// Pure: no Three.js, no DOM. `terrain` is asked for `heightAt` and nothing else, so `node --test`
// hands it a stand-in and checks the one thing that actually went wrong — that a laid road has no
// gaps in it.

/** Metres between lane points. Three is what the world's own roads sample at, near enough. */
export const LANE_SPACING = 3;

/**
 * The LONGEST a ground-levelling brush may be, in metres.
 *
 * NOT the lane spacing, and not a fixed step either. A strip brush grades in a straight line from
 * one end to the other, so it is only allowed to be as long as the road is straight — `levelLane`
 * cuts it short wherever the chord has drifted from the road's own curve. Ten metres is the ceiling:
 * on flat ground a 300 m road is thirty brushes rather than the hundred it has points, and on broken
 * ground it costs more brushes, which is the right way round.
 */
export const BRUSH_STEP = 10;

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Walk a polyline and drop a point every `spacing` metres.
 *
 * This is the whole of "no gaps". A ribbon is built from consecutive points and every quad shares
 * the previous quad's two vertices, so the only way to open a seam is to not have a point there —
 * which is what a row of independently placed boxes is.
 */
export function resample(points, spacing = LANE_SPACING) {
  const src = (points || []).filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-6);
  if (src.length < 2) return src.map(p => [p[0], p[1]]);

  /**
   * ONE STEP FOR THE WHOLE LINE, CHOSEN SO IT DIVIDES EXACTLY.
   *
   * The first version of this walked each leg with a fixed 3 m step and carried the remainder into
   * the next one, then moved the last point on to the true end if it had stopped within a whisker of
   * it. Both of those leave gaps. A carried remainder means a corner is not a sample point; moving
   * the last point on to the end STRETCHES the step before it — measured on a 90 m street, a tail
   * 0.72 m short was pulled forward and left a 3.72 m gap where the spacing is 3 m. That is a seam,
   * which is the exact thing this file exists to make impossible.
   *
   * Measuring the whole line first and dividing it into `ceil(length / spacing)` equal steps gives
   * every gap the same length, guarantees it is never longer than `spacing`, and puts a point exactly
   * on both ends with no special case for either.
   */
  const legs = [];
  let total = 0;
  for (let i = 0; i + 1 < src.length; i++) {
    const len = Math.hypot(src[i + 1][0] - src[i][0], src[i + 1][1] - src[i][1]);
    legs.push(len);
    total += len;
  }
  if (total <= 1e-9) return [[src[0][0], src[0][1]]];

  const steps = Math.max(1, Math.ceil(total / spacing));
  const step = total / steps;
  const out = [[src[0][0], src[0][1]]];
  let leg = 0, along = 0;
  for (let k = 1; k < steps; k++) {
    let want = k * step;
    while (leg < legs.length - 1 && want > along + legs[leg]) { along += legs[leg]; leg++; }
    const t = legs[leg] > 0 ? (want - along) / legs[leg] : 0;
    const [ax, az] = src[leg], [bx, bz] = src[leg + 1];
    out.push([ax + (bx - ax) * t, az + (bz - az) * t]);
  }
  out.push([src[src.length - 1][0], src[src.length - 1][1]]);
  return out;
}

/**
 * Round the corners off, in the plan rather than in the geometry.
 *
 * *"Two roads coming together at an angle have a sharp edge."* js/features.js answered that for the
 * town by paving a square pad over every junction. A lane does not need one: a light 1-2-1 pass over
 * the POINTS turns a corner into a short curve, and a curve has no wedge to fill. The ends are
 * pinned so a road still starts and finishes exactly where it was clicked.
 */
export function smoothPoints(points, passes = 2) {
  let pts = points.map(p => [p[0], p[1]]);
  for (let pass = 0; pass < passes; pass++) {
    const next = pts.map(p => [p[0], p[1]]);
    for (let i = 1; i < pts.length - 1; i++) {
      next[i][0] = (pts[i - 1][0] + pts[i][0] * 2 + pts[i + 1][0]) / 4;
      next[i][1] = (pts[i - 1][1] + pts[i][1] * 2 + pts[i + 1][1]) / 4;
    }
    pts = next;
  }
  return pts;
}

/**
 * The graded height along a lane — the road's own `surface` array.
 *
 * Lifted straight from js/planet.js: sample the natural ground at each point, then run four 1-2-1
 * passes along the line. A road is flat across its width and gentle along its length; it does not
 * follow every hummock, which is the difference between a road and a ribbon thrown over lumps.
 */
export function gradeHeights(points, heightAt, passes = 4) {
  const raw = points.map(p => heightAt(p[0], p[1]));
  const smooth = raw.slice();
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 1; i < smooth.length - 1; i++) {
      smooth[i] = (smooth[i - 1] + smooth[i] * 2 + smooth[i + 1]) / 4;
    }
  }
  return smooth;
}

/**
 * Corners in, a lane out — the same shape `terrain.roadPaths` carries.
 *
 * `half` is half the carriageway width in metres, exactly as the world's roads mean it. `reach` is
 * how far the road's influence goes past its own edge, which is what keeps trees and buildings off
 * the verge.
 */
export function planLane(points, {
  terrain = null,
  half = 2,
  spacing = LANE_SPACING,
  cornerPasses = 2,
  gradePasses = 4,
  surface = 'dirt',
  klass = 'built',
  id = null,
  key = null,
  name = '',
} = {}) {
  const laid = smoothPoints(resample(points, spacing), cornerPasses);
  const heightAt = terrain?.heightAt ? (x, z) => terrain.heightAt(x, z) : () => 0;
  const heights = gradeHeights(laid, heightAt, gradePasses);
  let metres = 0;
  for (let i = 0; i + 1 < laid.length; i++) {
    metres += Math.hypot(laid[i + 1][0] - laid[i][0], laid[i + 1][1] - laid[i][1]);
  }
  return {
    kind: 'road', built: true, id, key, name, klass,
    half, reach: half + 6,
    surfaceKind: surface,
    points: laid,
    surface: heights,
    metres,
  };
}

/**
 * Triangles for a lane. Two vertices per point, and every quad shares the last one's edge.
 *
 * The same function js/features.js keeps privately for the world's roads. It is exported here so
 * there is one of it: a town street, a player's track and an inter-town highway should all be the
 * same strip of geometry, and the only honest way to guarantee that is for them to run the same
 * lines of code.
 */
export function laneRibbon(lane, { lift = 0.06, color = null } = {}) {
  const position = [], normal = [], index = [];
  // a town draws every street of every culture out of ONE mesh, so the colour has to travel with the
  // vertices rather than with the material
  const colour = color ? [] : null;
  const points = lane?.points || [];
  const heights = lane?.surface || [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    let dx = next[0] - prev[0], dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const nx = -dz, nz = dx;
    const half = (typeof lane.half === 'function' ? lane.half(i) : lane.half) || 1;
    const y = (heights[i] ?? 0) + lift;
    position.push(points[i][0] + nx * half, y, points[i][1] + nz * half);
    position.push(points[i][0] - nx * half, y, points[i][1] - nz * half);
    normal.push(0, 1, 0, 0, 1, 0);
    if (colour) colour.push(color[0], color[1], color[2], color[0], color[1], color[2]);
    if (i > 0) {
      const a = (i - 1) * 2, b = a + 1, c = i * 2, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  return colour ? { position, normal, index, color: colour } : { position, normal, index };
}

/**
 * The biggest step between two lane points, in metres. A test asks this and nothing else.
 *
 * If it is bigger than the spacing the lane was planned at, something in the chain dropped a point
 * and the ribbon has a hole where the road should be.
 */
export function laneGap(lane) {
  const pts = lane?.points || [];
  let worst = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    worst = Math.max(worst, Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]));
  }
  return worst;
}

/**
 * Bring the ground up (or down) to meet the lane.
 *
 * One `strip` brush every `BRUSH_STEP` metres, each graded from the lane's own surface height at one
 * end to its surface height at the other. That is why a laid road never floats and never buries
 * itself: the ribbon is drawn at `surface`, and the ground under it has been levelled to `surface`
 * by the same numbers. The brush's feather is the skirt — it eases out to the untouched hillside
 * over a few metres instead of ending in a kerb of bare cliff.
 */
export function levelLane(lane, terraform, { claim = null, step = BRUSH_STEP, feather = null, tolerance = 0.25 } = {}) {
  if (!terraform?.strip || !lane?.points?.length) return { ok: false, painted: 0, why: 'Nothing to level.' };
  const pts = lane.points, surf = lane.surface;
  const perStep = Math.max(1, Math.round(step / Math.max(0.5, laneGap(lane) || step)));

  /**
   * A BRUSH IS A STRAIGHT RAMP, SO IT ONLY GETS TO BE AS LONG AS THE ROAD IS STRAIGHT.
   *
   * `strip` grades linearly from `h1` to `h2` — a chord. The lane's own surface is a smoothed curve.
   * Over ten metres of gently rolling ground those two are the same thing to within a few
   * centimetres, and over ten metres of a real hillside they are not: the first version of this
   * painted a brush every ten metres come what may, and on a nine-metre swell the road ended up
   * nearly three metres above the ground it was drawn on. Half a road floating and half of it buried
   * is the exact complaint this round set out to fix, arriving by a different door.
   *
   * So a brush stops at whichever comes first: ten metres, or the point where the chord has drifted
   * `tolerance` from the curve. Flat ground still costs thirty brushes for three hundred metres;
   * broken ground costs more, and should.
   */
  function reachFrom(i) {
    let j = i + 1;
    while (j < pts.length - 1 && j - i < perStep) {
      const next = j + 1;
      let worst = 0;
      for (let k = i + 1; k < next; k++) {
        const t = (k - i) / (next - i);
        worst = Math.max(worst, Math.abs(surf[i] + (surf[next] - surf[i]) * t - surf[k]));
      }
      if (worst > tolerance) break;
      j = next;
    }
    return j;
  }

  let painted = 0, refused = null;
  for (let i = 0; i < pts.length - 1; i = reachFrom(i)) {
    const j = reachFrom(i);
    const res = terraform.strip({
      x1: pts[i][0], z1: pts[i][1], x2: pts[j][0], z2: pts[j][1],
      half: lane.half, feather: feather == null ? Math.max(1.5, lane.half * 1.2) : feather,
      h1: surf[i], h2: surf[j],
      claim,
      // nose to tail: the next leg covers the ground past this one's end — see `caps` in terraform.js
      caps: false,
    });
    if (res.ok) painted++;
    else if (!refused) refused = res.why;
  }
  return { ok: painted > 0, painted, why: refused };
}

/**
 * THE FALLBACK THE USER OFFERED: *"maybe these tiles and slabs just need to level the ground
 * beneath them automatically, though IDK how to handle slopes."*
 *
 * A lane is the right answer for anything that is a LINE. An isolated slab a player drops on a
 * hillside is not a line, and it cannot be one, so it gets this instead: level the footprint to the
 * AVERAGE height under it and let the brush's feather skirt down to whatever the ground was doing
 * around it. Averaging is the answer to "how do I handle slopes" — level to the lowest corner and
 * the pad sits in a pit, to the highest and it stands on a plinth; the mean splits the difference,
 * so half the slab is a shallow cut and half a shallow fill, which is how a real terrace is built.
 *
 * Five samples, not four: the centre is included because a slab laid across a ridge has four corners
 * that agree and a middle two metres higher than all of them.
 */
export function slabGroundLevel(spot, terrain) {
  const { x, z, w, d, rot = 0 } = spot;
  const c = Math.cos(rot), s = Math.sin(rot);
  const at = (lx, lz) => terrain.heightAt(x + lx * c - lz * s, z + lx * s + lz * c);
  const hw = w / 2, hd = d / 2;
  const samples = [at(0, 0), at(-hw, -hd), at(hw, -hd), at(hw, hd), at(-hw, hd)];
  const mean = samples.reduce((a, v) => a + v, 0) / samples.length;
  return { h: mean, low: Math.min(...samples), high: Math.max(...samples), fall: Math.max(...samples) - Math.min(...samples) };
}

/**
 * Level under one placed rectangle, with a skirt, and tell the caller what height it ended at.
 *
 * `skirt` is how many metres the easing runs for outside the footprint. It scales with how much the
 * ground was falling, because a slab on a 20 cm hummock wants a 1 m skirt and one cut into a 3 m
 * bank wants a wide one or the edge reads as a step.
 */
export function levelUnderSlab(spot, { terrain, terraform, claim = null, skirt = null } = {}) {
  if (!terrain?.heightAt) return { ok: false, why: 'No ground to level.' };
  const g = slabGroundLevel(spot, terrain);
  if (!terraform?.slab) return { ok: false, h: g.h, why: 'Nothing here reshapes ground.' };
  const feather = skirt == null ? Math.max(1.2, Math.min(6, g.fall * 1.6)) : skirt;
  const res = terraform.slab({
    x: spot.x, z: spot.z, w: spot.w + 0.4, d: spot.d + 0.4, rot: spot.rot || 0,
    h: g.h, feather, claim,
  });
  return { ok: !!res.ok, h: g.h, fall: g.fall, feather, why: res.why || '' };
}

/** Distance from a point to a segment. Same maths as js/terraform.js, kept local so this file is standalone. */
function segDist(x, z, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / len2)) : 0;
  return Math.hypot(x - (x1 + dx * t), z - (z1 + dz * t));
}

/**
 * THE BOOK OF ROADS THE PLAYER LAID.
 *
 * A lane is not a building: it has no footprint, it never collides with anything, and it is not an
 * entry in `js/buildplan.js`'s ledger. Keeping it in its own book is what stops the build ledger
 * filling with ninety four-metre boxes — which is the same complaint from the other end, because
 * ninety boxes in the ledger is ninety overlap tests on every ghost frame.
 *
 * It also gives the rest of the game one question to ask: `onRoad(x, z)`. js/logistics.js uses it to
 * decide how much of a haul runs on a made surface, which is the *"greatly improve that time by
 * building roads"* half of round 14's first task.
 */
export function createRoadBook({ terrain = null, terraform = null, saved = null } = {}) {
  let lanes = [];
  let next = 1;
  /** bucket key → lane ids, so `onRoad` walks a handful of lanes and not all of them. */
  const BUCKET = 64;
  const index = new Map();
  const bkey = (bx, bz) => bx + ',' + bz;

  function indexLane(lane) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of lane.points) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    const pad = lane.reach || lane.half + 6;
    for (let bx = Math.floor((x0 - pad) / BUCKET); bx <= Math.floor((x1 + pad) / BUCKET); bx++) {
      for (let bz = Math.floor((z0 - pad) / BUCKET); bz <= Math.floor((z1 + pad) / BUCKET); bz++) {
        const k = bkey(bx, bz);
        if (!index.has(k)) index.set(k, []);
        index.get(k).push(lane);
      }
    }
  }
  function reindex() { index.clear(); for (const l of lanes) indexLane(l); }

  const api = {
    get lanes() { return lanes; },
    get count() { return lanes.length; },
    /** Total metres of road the player has laid. The Holding screen likes a number. */
    get metres() { return lanes.reduce((a, l) => a + (l.metres || 0), 0); },

    /**
     * Lay one. The ground is levelled FIRST and the lane's heights are the levelled ones, which is
     * the ordering js/planet.js wrote a long note about with its bridges: put the deck down and then
     * carve the river and the deck is in the water.
     */
    lay(points, { half = 2, surface = 'dirt', key = null, name = '', claim = null, spacing = LANE_SPACING, level = true } = {}) {
      const lane = planLane(points, { terrain, half, surface, spacing, key, name });
      if (lane.points.length < 2) return { ok: false, why: 'A road needs two corners.' };
      lane.id = 'ln' + (next++);
      lane.claim = claim;
      if (level && terraform) lane.levelled = levelLane(lane, terraform, { claim }).painted;
      lanes.push(lane);
      indexLane(lane);
      return { ok: true, lane };
    },

    get(id) { return lanes.find(l => l.id === id) || null; },

    remove(id) {
      const i = lanes.findIndex(l => l.id === id);
      if (i < 0) return null;
      const [gone] = lanes.splice(i, 1);
      reindex();
      return gone;
    },

    /** The nearest lane to a point, and how far off its middle you are. */
    nearest(x, z, within = 12) {
      let best = null;
      for (const lane of lanes) {
        for (let i = 0; i + 1 < lane.points.length; i++) {
          const d = segDist(x, z, lane.points[i][0], lane.points[i][1], lane.points[i + 1][0], lane.points[i + 1][1]);
          if (d <= within && (!best || d < best.dist)) best = { lane, dist: d, i };
        }
      }
      return best;
    },

    /** Is this point on a made road? `pad` is how far past the kerb still counts. */
    onRoad(x, z, pad = 1.5) {
      const list = index.get(bkey(Math.floor(x / BUCKET), Math.floor(z / BUCKET)));
      if (!list) return false;
      for (const lane of list) {
        for (let i = 0; i + 1 < lane.points.length; i++) {
          if (segDist(x, z, lane.points[i][0], lane.points[i][1], lane.points[i + 1][0], lane.points[i + 1][1]) <= lane.half + pad) return true;
        }
      }
      return false;
    },

    /**
     * How much of a walked path runs on a made road, 0 to 1.
     *
     * The one number js/logistics.js needs. Sampled along the path rather than measured exactly,
     * because a haul route is thirty points long and the answer only has to be good enough to say
     * "most of this is on your road" — the difference between 0.71 and 0.73 changes nobody's mind
     * about where to put the next crate.
     */
    fractionOnRoad(points, pad = 1.5) {
      if (!points?.length || !lanes.length) return 0;
      let on = 0, total = 0;
      for (let i = 0; i + 1 < points.length; i++) {
        const [ax, az] = points[i], [bx, bz] = points[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len <= 1e-9) continue;
        const steps = Math.max(1, Math.ceil(len / 6));
        for (let k = 0; k < steps; k++) {
          const t = (k + 0.5) / steps;
          const seg = len / steps;
          total += seg;
          if (api.onRoad(lerp(ax, bx, t), lerp(az, bz, t), pad)) on += seg;
        }
      }
      return total > 0 ? on / total : 0;
    },

    toJSON() {
      return {
        v: 1,
        lanes: lanes.map(l => ({
          id: l.id, key: l.key, name: l.name, half: l.half, surfaceKind: l.surfaceKind,
          claim: l.claim ?? null, metres: Math.round((l.metres || 0) * 100) / 100,
          points: l.points.map(p => [r3(p[0]), r3(p[1])]),
          surface: l.surface.map(r3),
        })),
      };
    },

    load(data) {
      lanes = (data?.lanes || []).map(l => ({
        kind: 'road', built: true, klass: 'built',
        ...l,
        reach: (l.half || 2) + 6,
        points: (l.points || []).map(p => [p[0], p[1]]),
        surface: [...(l.surface || [])],
      }));
      next = lanes.reduce((n, l) => Math.max(n, Number(String(l.id).slice(2)) + 1 || 0), 1);
      reindex();
      return lanes.length;
    },
  };

  if (saved) api.load(saved);
  return api;
}

const r3 = v => Math.round((v || 0) * 1000) / 1000;

// ---------------------------------------------------------------- where a road meets a town's ring

/** Which road outranks which, when there are more crossings than a town has gatehouses for. */
export const ROAD_RANK = { highway: 3, road: 2, trail: 1, street: 0, built: 1 };

/**
 * EVERY PLACE A ROAD ACTUALLY CROSSES A CIRCLE, TO THE METRE.
 *
 * Round 16, and the reason it exists is the user's own report: *"At seed 4477, Delta Thiakean II,
 * x 50788, z 23588, heading SSW there is a wall on the road with no gate, can't get through."*
 *
 * `js/features.js` had two ways of asking this question and only one of them worked. The town
 * planner got this one — walk the polyline, find the step from outside the ring to inside, and
 * interpolate. The WALL got a different one: scan every road SAMPLE POINT and keep any that lands
 * within about ten metres of the ring. A road is sampled every `M_PER_CELL / 5` metres — 45 m on
 * the default planet size, 128 m on a full-sized one — so a sample almost never lands in a
 * twenty-metre-wide annulus. Measured at Pewargate, the town in that report: the scan found ZERO
 * crossings and fell through to its "put a gate at a random bearing" fallback, while this walk
 * finds the two real ones — including the trail at bearing 131 degrees, which is exactly the wall
 * the user was standing in front of.
 *
 * So there is one function now and both readers call it. Returns world positions, the offset from
 * the centre (which is what a town planner wants) and the bearing (which is what a wall wants),
 * best road first.
 */
export function ringCrossings(paths, cx, cz, ring, { minGap = 10, limit = Infinity } = {}) {
  const out = [];
  for (const r of paths || []) {
    const pts = r.points;
    if (!pts || pts.length < 2) continue;
    let wasIn = Math.hypot(pts[0][0] - cx, pts[0][1] - cz) <= ring;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - cx, pts[i][1] - cz);
      const isIn = d <= ring;
      if (isIn !== wasIn) {
        /**
         * The real intersection of the segment with the circle, not an interpolation of the two
         * distances. Lerping the distance is fine head-on and badly wrong on a road that comes in
         * at a slant — measured on a 82 m wall ring it put a "crossing" 70 m from the middle of
         * town, twelve metres inside its own wall, which would blank the masonry in the wrong place.
         * Solving |A + t(B - A) - C|^2 = ring^2 costs one square root and is exact.
         */
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
        const vx = bx - ax, vz = bz - az;
        const fx = ax - cx, fz = az - cz;
        const qa = vx * vx + vz * vz;
        const qb = 2 * (fx * vx + fz * vz);
        const qc = fx * fx + fz * fz - ring * ring;
        const disc = qb * qb - 4 * qa * qc;
        let t;
        if (qa < 1e-12 || disc < 0) {
          const da = Math.hypot(ax - cx, az - cz), db = Math.hypot(bx - cx, bz - cz);
          t = Math.abs(db - da) < 1e-6 ? 0.5 : (ring - da) / (db - da);
        } else {
          const root = Math.sqrt(disc);
          const t0 = (-qb - root) / (2 * qa), t1 = (-qb + root) / (2 * qa);
          // one of the two roots is inside this segment — that is the step we just detected
          t = (t0 >= -1e-6 && t0 <= 1 + 1e-6) ? t0 : t1;
        }
        t = Math.max(0, Math.min(1, t));
        const x = ax + vx * t, z = az + vz * t;
        const dx = x - cx, dz = z - cz;
        // a road that grazes the ring crosses twice within a few metres; one gate is enough
        if (!out.some(c => Math.hypot(c.dx - dx, c.dz - dz) < minGap)) {
          out.push({
            x, z, dx, dz,
            angle: Math.atan2(dz, dx),
            klass: r.klass || 'trail',
            rank: ROAD_RANK[r.klass] ?? 1,
            id: r.id,
          });
        }
      }
      wasIn = isIn;
    }
  }
  // a highway earns its gatehouse before a trail does, when there are more crossings than gates
  out.sort((a, b) => b.rank - a.rank);
  return Number.isFinite(limit) ? out.slice(0, limit) : out;
}
