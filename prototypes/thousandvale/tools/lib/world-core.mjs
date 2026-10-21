// Thousandvale — the shared core of the world and zone bakes (stream B).
//
// One rule makes zone edges agree BY CONSTRUCTION (PLAN §3.2.3): every value a zone bake writes is a
// pure function of WORLD coordinates and the world bake's outputs — never of which zone is being
// baked. So the base ground, the river surfaces, the lake levels and the height quantisation all live
// here, computed from the macro field, and two neighbouring zones compute the same number for the
// same point on their shared edge.
//
//   macro.bin  'TVWM' | u32 version | u32 jsonBytes | JSON | pad4 | u16 elevation[w*h] (0..1 → 0..65535)
//              | u16 slope[w*h] (0..1) | u8 water[w*h] | u8 river[w*h] | u8 biome[w*h]
//   world.json the readable half: grid, relief, zones, nodes, rivers (smoothed polylines WITH surfaces),
//              lakes (with levels), roads — everything a zone bake needs besides the macro layers.

import { makeNoise2D, fbm, ridged, subSeed, clamp } from '../../../../worldgen/js/noise.js';
import { makeVolcanic } from './vharlen.mjs';
import { makeDowns, TORBOR } from './torbor.mjs';

export const MACRO_MAGIC = 'TVWM';
export const MACRO_VERSION = 1;
export const WORLD_BAKE_VERSION = 2;   // 2: crossing-walk bridges with abutments (play-test 1, P24)

// World choice (2026-10-04, coordinator ruling "fix the land count now"): a scan of 54 combinations
// (plates/pangea/noise × sea level 0.20/0.28/0.35 × ocean/land frame × 3 seeds) for ~200 zones that are
// more than half land; pangea seed 1001 at sea level 0.20 gives 202 of 252, cut into exactly 12 regions
// of 10–29 zones (the provinces), with the most relief variety of the near-200 candidates (hills 25 %,
// grassland 25 %, savanna 11 %, mountains 10 %, forests 15 %).
export const WORLD = {
  seed: 1001, width: 288, height: 224, method: 'pangea', seaLevel: 0.2, regionCount: 12,   // PLAN §3.1–3.2: 16 samples per zone edge
  zoneCells: 16, macroMetres: 128,                          // a zone = 16 × 128 m = 2,048 m
  landMetres: 1400, seaMetres: 160,
};

/**
 * Continents (2026-10-14, owner: "update the currently built world to be its own continent, ignoring the extra map
 * area that is still locked", then an expansion reached across the sea). The pangea macro is still the source of the
 * ground, but only INSIDE a continent: everywhere else the land sinks to the sea, so the far horizon and the world map
 * show islands, not a locked mainland.
 *
 *   kind 'block'   the land inside the zone rectangle is left EXACTLY as it was (every baked Torbor Downs zone stays
 *                  bit-for-bit valid); outside it the ground falls to the sea over `fall` metres, with a coastline
 *                  that wanders `wander` metres so it never reads as a rectangle.
 *   kind 'island'  the coast is INSIDE the rectangle: a noisy round island of radius `radius` (fraction of the half
 *                  side) centred in the block, beaches you can walk on, deep sea out to the block's edge.
 *                  `profile` names a terrain shaping applied inside (expansion terrain; see continentProfile).
 * `ids` are the zone columns/rows in world zones (block = [zx, zy] of the top-left zone, size = [w, h]).
 */
export const CONTINENTS = [
  // play-test 12 (#81, owner 2026-10-17): Torbor Downs regenerated — its own ground (tools/lib/torbor.mjs: hills between the
  // roads, regions with their own biomes) and a coastline INSIDE the block, so the walkable land reaches the shore. Was
  // kind 'block' (the square left bit-exact, the coast outside it, fall 1100 / wander 1000).
  { id: 'torbor', province: 'torbor_downs', kind: 'island', block: [11, 1], size: [4, 4], fall: 260, wander: 0, depth: 70, profile: 'downs', bays: [
    // play-test 11 (owner, Z61): "edit the world east of Gullwick so that Gullwick actually sits on the coastline and has
    // a real harbor". A sea inlet from the open sea, 2 km west through the coast and into z14_02, to its head just south-
    // east of Gullwick's wall (Gullwick's World Forge name was Tideford). The Batpate Run now ends in it. See BAYS below.
    { id: 'gullwick_bay', zone: 'z14_02', line: [[30242, 4626], [30720, 4816], [31372, 4996], [32272, 5146], [34200, 5400]],
      hw: [85, 180, 420, 900, 1500], floor: [-7, -12, -26, -50, -70], band: 420, flat: 150, shore: 1.2, rise: 0.04, beach: 0.1,
      // the harbour town stays exactly where it was (zone metres), so its plan, plot ids and stream E's offices stay put
      town: { name: 'Gullwick', x: 1520, z: 352 },
      // the harbour on the bay's north shore, below Gullwick's south gate (zone metres; tools/bake-zone.mjs bakeHarbour):
      // a stone quay along the waterline, a long pier out to water deep enough for the Saltwren, two short jetties for the
      // fishing boats. Decks are walkable (terrain meta.bridges); the ship lies alongside the long pier's end.
      harbour: { id: 'harbour_gullwick', town: 'gullwick', quay: { x0: 1544, x1: 1650, z0: 451, z1: 468, h: 2.2 }, deck: 2.2,
        piers: [{ a: [1600, 466], b: [1600, 544], w: 5, main: true }, { a: [1561, 466], b: [1561, 492], w: 3 }, { a: [1637, 466], b: [1637, 490], w: 3 }],
        berth: { x: 1610, z: 524, yaw: 0 }, master: { x: 1606.5, z: 462.5, yaw: 0 }, dock: { x: 1596, z: 461 } } },
  ] },
  { id: 'vharlen', province: 'vharlen', kind: 'island', block: [11, 9], size: [3, 3], radius: 0.8, fall: 520, wander: 240, depth: 90, profile: 'volcanic' },
];
const ZM = 2048;
/** The rectangle of a continent in world metres. */
export const continentRect = c => ({ x0: c.block[0] * ZM, z0: c.block[1] * ZM, x1: (c.block[0] + c.size[0]) * ZM, z1: (c.block[1] + c.size[1]) * ZM });
/** Which continent's rectangle holds this world point (null = open sea). */
export function continentAt(wx, wz) {
  for (const c of CONTINENTS) { const r = continentRect(c); if (wx >= r.x0 && wx < r.x1 && wz >= r.z0 && wz < r.z1) return c; }
  return null;
}

/**
 * BAYS (play-test 11, Z61): an inlet the sea cuts INTO a continent — the one deliberate exception to "a block's own land is
 * never touched". A bay is a centre line `line` (world metres, head first) with a half-width `hw` and a sea floor `floor`
 * at each vertex (interpolated along it). For a point, s = (distance to the line) − (half-width there): s < 0 is in the
 * bay. The ground is pulled toward a coastal profile — `shore` metres above the sea at s = 0, rising `rise` m/m inland and
 * falling `beach` m/m into the water down to the floor — with full weight out to s = `flat` (a coastal lowland a harbour
 * town can stand on), fading smoothly to nothing at s = `band`. It only ever LOWERS ground. Past `band` the ground is returned untouched (bit-exact), so only the zone named
 * by `zone` (and the open sea / unbaked coast beyond the block) changes; tests/B/coast.test.js checks every other zone edge.
 * Heights fixed by the world bake (road points, river surfaces, bridge decks) are moved by the same amount the ground under
 * them moved (bayDelta), so a road, a river and its bridge keep their heights relative to the land.
 */
export const BAYS = CONTINENTS.flatMap(c => (c.bays || []).map(b => ({ ...b, continent: c.id })));
for (const b of BAYS) {
  const xs = b.line.map(p => p[0]), zs = b.line.map(p => p[1]), r = Math.max(...b.hw) + b.band;
  b.bbox = [Math.min(...xs) - r, Math.min(...zs) - r, Math.max(...xs) + r, Math.max(...zs) + r];
}
/** Where a point stands against a bay: { s (metres past its shoreline; < 0 = in the water), floor }. */
export function bayAt(b, wx, wz) {
  let s = Infinity, floor = b.floor[0];
  for (let k = 0; k < b.line.length - 1; k++) {
    const a = b.line[k], e = b.line[k + 1], dx = e[0] - a[0], dz = e[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const t = clamp(((wx - a[0]) * dx + (wz - a[1]) * dz) / L2, 0, 1);
    const d = Math.hypot(wx - a[0] - dx * t, wz - a[1] - dz * t) - (b.hw[k] + (b.hw[k + 1] - b.hw[k]) * t);
    if (d < s) { s = d; floor = b.floor[k] + (b.floor[k + 1] - b.floor[k]) * t; }
  }
  return { s, floor };
}
/** Ground height g with every bay applied (identity — the same number, not a recomputed one — outside every band). */
export function withBays(wx, wz, g) {
  for (const b of BAYS) {
    if (wx < b.bbox[0] || wx > b.bbox[2] || wz < b.bbox[1] || wz > b.bbox[3]) continue;
    const { s, floor } = bayAt(b, wx, wz);
    if (s >= b.band) continue;
    const target = s < 0 ? Math.max(floor, b.shore + s * b.beach) : b.shore + s * b.rise;
    const f = b.flat || 0, t = s <= f ? 0 : (s - f) / (b.band - f), w = 1 - t * t * (3 - 2 * t);
    const h = g + (target - g) * w;
    if (h < g) g = h;
  }
  return g;
}

const touchesBay = bbox => BAYS.some(b => !(bbox[2] < b.bbox[0] || bbox[0] > b.bbox[2] || bbox[3] < b.bbox[1] || bbox[1] > b.bbox[3]));
const inBayWater = (ref, x, z) => BAYS.some(b => x >= b.bbox[0] && x <= b.bbox[2] && z >= b.bbox[1] && z <= b.bbox[3] && bayAt(b, x, z).s < 0) && ref.baseGround(x, z) < 0;

/**
 * The world bake's rivers, roads and bridges with the BAYS applied (play-test 11, Z61 + Z4): heights pulled toward the
 * coast the same way the ground is (withBays on the height itself — a river's cut below its banks and a road's grade
 * fade out toward the shore, where both meet the beach), a river ENDS where it first runs into a bay's water (its mouth: one last point a few metres out at sea level,
 * and nothing downstream of it), a road is cut at the bay's waterline (each dry run kept), and a bridge that now stands in
 * the water or over a river that no longer reaches it is dropped. A line whose box touches no bay is returned as it is (the
 * same object), so every other zone bakes bit-for-bit as before. `ref` = makeRefiner(macro).
 */
export function coastWorld(W, ref) {
  if (!BAYS.length) return W;
  const bbOf = pts => [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
  // the shore between a dry point a and a wet point b (bisection on the wet test)
  const shoreBetween = (a, b) => {
    let lo = 0, hi = 1;
    for (let k = 0; k < 24; k++) { const t = (lo + hi) / 2; if (inBayWater(ref, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) hi = t; else lo = t; }
    return lo;
  };
  // a river that flowed INTO the part of another river the sea has now taken (the Fackfalpot joined the Batpate Run below
  // where the bay now ends it) takes that river's old course from the confluence on, so it too runs on to the sea
  const wetIndex = r => r.pts.findIndex(p => inBayWater(ref, p[0], p[1]));
  const src = W.rivers.map(r => ({ r, pts: r.pts }));
  for (let pass = 0; pass < 3; pass++) {
    let grew = false;
    for (const a of src) {
      if (!touchesBay(a.r.bbox || bbOf(a.pts)) || wetIndex({ pts: a.pts }) >= 0) continue;
      const e = a.pts[a.pts.length - 1];
      for (const b of src) {
        if (b === a) continue;
        const w = wetIndex({ pts: b.pts }); if (w < 0) continue;
        const k = b.pts.findIndex(p => Math.hypot(p[0] - e[0], p[1] - e[1]) < 20);
        if (k < 0 || k < w - 1) continue;                                  // it joins above the mouth: nothing lost
        a.pts = [...a.pts, ...b.pts.slice(k + 1).map(p => [p[0], p[1], Math.min(p[2], e[2]), Math.max(p[3], e[3])])];
        a.joined = b.r.id; a.tailMouth = !!b.r.mouth; grew = true; break;
      }
    }
    if (!grew) break;
  }
  const rivers = src.map(({ r: r0, pts: P, joined, tailMouth }) => {
    const r = P === r0.pts ? r0 : { ...r0, pts: P, joined };
    if (!touchesBay(r.bbox || bbOf(r.pts))) return r;
    const pts = []; let moved = false;
    for (let k = 0; k < r.pts.length; k++) {
      const p = r.pts[k], y = ref.bayDelta(p[0], p[1]) ? withBays(p[0], p[1], p[2]) : p[2];   // only where the ground moved
      const q = y !== p[2] ? [p[0], p[1], +y.toFixed(3), p[3]] : p;
      if (q !== p) moved = true;
      if (inBayWater(ref, p[0], p[1])) {
        if (!pts.length) return null;                                     // a river that rises in the bay (none do)
        const a = pts[pts.length - 1], t = shoreBetween(a, q), dx = q[0] - a[0], dz = q[1] - a[1], L = Math.hypot(dx, dz) || 1;
        const sx = a[0] + dx * t, sz = a[1] + dz * t;
        pts.push([+sx.toFixed(2), +sz.toFixed(2), +Math.max(0, Math.min(a[2], a[2] + (q[2] - a[2]) * t)).toFixed(3), q[3]]);
        pts.push([+(sx + dx / L * 10).toFixed(2), +(sz + dz / L * 10).toFixed(2), 0, q[3]]);   // the mouth, out at sea level
        break;
      }
      pts.push(q);
    }
    if (!moved && pts.length === r.pts.length && r === r0) return r;       // the bay does not reach it
    for (let k = 1; k < pts.length; k++) if (pts[k][2] > pts[k - 1][2]) pts[k] = [pts[k][0], pts[k][1], pts[k - 1][2], pts[k][3]];   // never flows uphill
    // play-test 12 (#81): a river that took over a lower course which already ran out to the open sea (downsWorld cut it at the
    // regenerated coast: the Fackfalpot, on the Batpate Run's old course past the bay) ends in that mouth — at sea level, never under it
    const endsAtSea = tailMouth && pts.length === r.pts.length;
    if (endsAtSea) for (let k = 0; k < pts.length; k++) if (pts[k][2] < 0) pts[k] = [pts[k][0], pts[k][1], 0, pts[k][3]];
    return { ...r, pts, bbox: bbOf(pts), ...(pts.length < r.pts.length || endsAtSea ? { mouth: true } : {}) };
  }).filter(r => r && r.pts.length >= 2);
  const roads = [];
  for (const r of W.roads) {
    if (!touchesBay(r.bbox || bbOf(r.pts))) { roads.push(r); continue; }
    const runs = []; let cur = [], moved = false;
    for (let k = 0; k < r.pts.length; k++) {
      const p = r.pts[k], y = ref.bayDelta(p[0], p[1]) ? withBays(p[0], p[1], p[2]) : p[2], q = y !== p[2] ? [p[0], p[1], +y.toFixed(3)] : p, wet = inBayWater(ref, p[0], p[1]);
      if (q !== p || wet) moved = true;
      const prev = r.pts[k - 1], prevWet = k > 0 && inBayWater(ref, prev[0], prev[1]);
      if (k > 0 && wet !== prevWet) {
        const a = wet ? prev : p, b = wet ? p : prev, t = shoreBetween(a, b), x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        const y = a[2] + (b[2] - a[2]) * t, s = [+x.toFixed(2), +z.toFixed(2), +(ref.bayDelta(x, z) ? withBays(x, z, y) : y).toFixed(3)];
        if (wet) { cur.push(s); runs.push(cur); cur = []; } else cur.push(s);
      }
      if (!wet) cur.push(q);
    }
    if (cur.length) runs.push(cur);
    if (!moved) { roads.push(r); continue; }
    const kept = runs.filter(p => p.length >= 2);
    kept.forEach((pts, n) => roads.push({ ...r, ...(kept.length > 1 ? { id: `${r.id}c${n}` } : {}), pts, bbox: bbOf(pts), ...(kept.length === 1 && runs.length === 1 && pts.length === r.pts.length ? {} : { shore: true }) }));
  }
  const near = (pts, x, z, r) => pts.some((p, k) => k && (() => { const a = pts[k - 1], dx = p[0] - a[0], dz = p[1] - a[1], L2 = dx * dx + dz * dz || 1, t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) <= r; })());
  const bridges = W.bridges.map(b => {
    if (!touchesBay([Math.min(b.a[0], b.b[0]), Math.min(b.a[1], b.b[1]), Math.max(b.a[0], b.b[0]), Math.max(b.a[1], b.b[1])])) return b;
    if (inBayWater(ref, b.x, b.z)) return null;
    const river = rivers.find(r => r.id === b.river);
    if (!river || (river.mouth && !near(river.pts, b.x, b.z, b.span))) return null;     // its river now ends upstream of it
    // the river under it moved with the land; the deck keeps its clearance over the water
    const surface = ref.bayDelta(b.x, b.z) ? withBays(b.x, b.z, b.surface) : b.surface;
    if (surface === b.surface) return b;
    return { ...b, deck: +(surface + b.deck - b.surface).toFixed(3), surface: +surface.toFixed(3) };
  }).filter(Boolean);
  return { ...W, rivers, roads, bridges };
}

/**
 * Torbor Downs regenerated (play-test 12, #81; tools/lib/torbor.mjs): the world bake's rivers, roads and bridges in and
 * round the Torbor block, re-fitted to the new ground. world.json is graded on the old pangea ground, and inside the block
 * the new ground equals it within PROTECT_NEAR metres of every road and river — so most heights come out the same number;
 * only where the coast eased the land down (or the sea took it) do they move.
 *   * a river is cut where it first meets the sea (its mouth: one last point 10 m out at sea level), and a river that rose
 *     out at sea (the land it came from is gone) starts 250 m inland of the coast instead; of several dry stretches the
 *     longest is kept; its surface is the running minimum of the new ground - 0.8 (the world bake's own rule)
 *   * a road is cut at the waterline (each dry run of 2+ points kept, ids `<id>c<n>` when it splits) and its graded height
 *     recomputed exactly as the world bake does (the ground averaged over ±3 points)
 *   * every bridge on a Torbor road is rebuilt from the re-fitted lines (crossingsOf + bridgeFor, twins merged, shared decks)
 * Uses ref.continentGround (no bays): the bays are applied after, by coastWorld. Lines whose box misses the block are the
 * same objects. Pure.
 */
export function downsWorld(W, ref) {
  const c = CONTINENTS.find(q => q.profile === 'downs'); if (!c) return W;
  const R = continentRect(c), pad = 400;
  const touches = bb => !(bb[2] < R.x0 - pad || bb[0] > R.x1 + pad || bb[3] < R.z0 - pad || bb[1] > R.z1 + pad);
  const bbOf = pts => [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
  const g = (x, z) => ref.continentGround(x, z);
  // off the land: in the sea, or past the coastline where the ground is still falling to it (a cliff coast)
  const wet = (x, z) => g(x, z) < 0.25 || ref.seaward(c, x, z) > 0;
  const delta = (x, z) => g(x, z) - ref.mainland(x, z);
  const shore = (a, b) => { let lo = 0, hi = 1; for (let k = 0; k < 24; k++) { const t = (lo + hi) / 2; if (wet(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) hi = t; else lo = t; } return lo; };
  const rivers = [];
  for (const r of W.rivers) {
    if (!touches(r.bbox)) { rivers.push(r); continue; }
    // dry runs (index ranges) along the river
    const dry = r.pts.map(p => !wet(p[0], p[1]));
    const runs = []; let s = -1;
    for (let k = 0; k <= dry.length; k++) { if (k < dry.length && dry[k]) { if (s < 0) s = k; } else if (s >= 0) { runs.push([s, k - 1]); s = -1; } }
    if (!runs.length) continue;
    let [a, b] = runs.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]) || p[0] - q[0])[0];
    // a river that rose out at sea now rises 250 m inland of the coast
    if (a > 0) { let L = 0; while (a < b && L < 250) { L += Math.hypot(r.pts[a + 1][0] - r.pts[a][0], r.pts[a + 1][1] - r.pts[a][1]); a++; } }
    if (b - a < 4) continue;
    const pts = r.pts.slice(a, b + 1).map(p => [p[0], p[1], p[2], p[3]]);
    let mouth = null;
    if (b < r.pts.length - 1) {                                        // it runs into the sea: its mouth
      const A = r.pts[b], Bq = r.pts[b + 1], t = shore(A, Bq), dx = Bq[0] - A[0], dz = Bq[1] - A[1], L = Math.hypot(dx, dz) || 1;
      const sx = A[0] + dx * t, sz = A[1] + dz * t;
      mouth = [[+sx.toFixed(2), +sz.toFixed(2), 0, A[3]], [+(sx + dx / L * 10).toFixed(2), +(sz + dz / L * 10).toFixed(2), 0, A[3]]];
    }
    // surfaces moved by what the profile moved the ground (delta to the pangea ground, both from the decoded macro: the
    // world bake graded on the full-precision field, so a recomputed surface would differ by the u16 rounding everywhere)
    let run = Infinity, moved = a > 0 || b < r.pts.length - 1;
    for (const p of pts) {
      // (never under sea level: a surface the profile lowered past 0 on land would run uphill into its own mouth)
      const dz = delta(p[0], p[1]), s2 = +Math.max(0, Math.min(run, p[2] + dz)).toFixed(3);
      if (s2 !== p[2]) { p[2] = s2; moved = true; }
      run = p[2];
    }
    if (mouth) { mouth[0][2] = +Math.max(0, Math.min(run, 0.4)).toFixed(3); pts.push(...mouth); }
    rivers.push(moved ? { ...r, pts, bbox: bbOf(pts), ...(b < r.pts.length - 1 ? { mouth: true } : {}), ...(a > 0 ? { spring: true } : {}) } : r);
  }
  const roads = [];
  for (const r of W.roads) {
    if (!touches(r.bbox)) { roads.push(r); continue; }
    const runs = []; let cur = []; const cuts = new Set();
    for (let k = 0; k < r.pts.length; k++) {
      const p = r.pts[k], w = wet(p[0], p[1]);
      if (k > 0) {
        const q = r.pts[k - 1], qw = wet(q[0], q[1]);
        if (w !== qw) { const A = w ? q : p, Bq = w ? p : q, t = shore(A, Bq), s = [+(A[0] + (Bq[0] - A[0]) * t).toFixed(2), +(A[1] + (Bq[1] - A[1]) * t).toFixed(2), 0]; cuts.add(s); if (w) { cur.push(s); runs.push(cur); cur = []; } else cur.push(s); }
      }
      if (!w) cur.push([p[0], p[1], p[2]]);
    }
    if (cur.length) runs.push(cur);
    const kept = runs.filter(p => p.length >= 2);
    kept.forEach((pts, n) => {
      const dl = pts.map(p => delta(p[0], p[1]));
      for (let k = 0; k < pts.length; k++) {
        let sum = 0, m = 0; for (let q = Math.max(0, k - 3); q <= Math.min(pts.length - 1, k + 3); q++) { sum += dl[q]; m++; }
        if (sum !== 0) pts[k][2] = +(pts[k][2] + sum / m).toFixed(3);
      }
      for (const p of pts) if (cuts.has(p)) p[2] = +Math.max(0.3, g(p[0], p[1])).toFixed(3);      // the shore end: on the beach
      const same = kept.length === 1 && runs.length === 1 && pts.length === r.pts.length && pts.every((p, k) => p[2] === r.pts[k][2]);
      roads.push(same ? r : { ...r, ...(kept.length > 1 ? { id: `${r.id}c${n}` } : {}), pts, bbox: bbOf(pts), ...(pts.length < r.pts.length ? { shore: true } : {}) });
    });
  }
  // bridges: the world's own outside the block; inside it, rebuilt from the re-fitted roads and rivers (bake-world's rule)
  const bridges = W.bridges.filter(b => !(b.x >= R.x0 - pad && b.x < R.x1 + pad && b.z >= R.z0 - pad && b.z < R.z1 + pad));
  const fresh = [];
  for (const rd of roads) {
    if (!touches(rd.bbox)) continue;
    for (const cr of crossingsOf(rd.pts, rivers)) {
      const b = bridgeFor(rd.pts, cr, rd.width);
      if (!(b.x >= R.x0 - pad && b.x < R.x1 + pad && b.z >= R.z0 - pad && b.z < R.z1 + pad)) continue;
      if (wet(b.x, b.z)) continue;
      const twin = fresh.find(o => Math.hypot(o.x - b.x, o.z - b.z) < 14);
      if (twin) { (twin.alsoRoads ||= []).push(rd.id); continue; }
      fresh.push({ road: rd.id, ...b });
    }
  }
  for (let pass = 0; pass < 4; pass++) for (const p of fresh) for (const q of fresh) {
    if (p === q || p.deck === q.deck) continue;
    const gap = Math.min(...[p.a, p.b].flatMap(e => [q.a, q.b].map(f => Math.hypot(e[0] - f[0], e[1] - f[1]))));
    if (gap < p.ramp + q.ramp + 10) { const h = Math.max(p.deck, q.deck); p.deck = h; q.deck = h; }
  }
  // a rebuilt bridge that is the world's own to the centimetre is the world's own object (bit-exact zones where nothing moved)
  const old = W.bridges;
  for (const b of fresh) { const o = old.find(q => q.road === b.road && q.river === b.river && Math.hypot(q.x - b.x, q.z - b.z) < 0.01 && q.deck === b.deck && q.span === b.span); bridges.push(o || b); }
  return { ...W, rivers, roads, bridges, downs: true };
}

/** World-fixed height quantisation, so a u16 means the same metres in every zone (edges match to the bit). */
export function heightRange(world = WORLD) {
  return { min: -world.seaMetres - 80, max: world.landMetres + 260 };
}

export function encodeMacro(w, meta) {
  const N = w.width * w.height;
  const json = new TextEncoder().encode(JSON.stringify(meta));
  let off = 12 + json.length; off = (off + 3) & ~3;
  const out = new Uint8Array(off + N * 4 + N * 3);
  const dv = new DataView(out.buffer);
  for (let k = 0; k < 4; k++) out[k] = MACRO_MAGIC.charCodeAt(k);
  dv.setUint32(4, MACRO_VERSION, true); dv.setUint32(8, json.length, true); out.set(json, 12);
  for (let i = 0; i < N; i++) dv.setUint16(off + i * 2, Math.round(clamp(w.elevation[i], 0, 1) * 65535), true);
  off += N * 2;
  for (let i = 0; i < N; i++) dv.setUint16(off + i * 2, Math.round(clamp(w.slope[i], 0, 1) * 65535), true);
  off += N * 2;
  out.set(w.water, off); off += N; out.set(w.river, off); off += N; out.set(w.biome, off);
  return out;
}

export function decodeMacro(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== MACRO_MAGIC) throw new Error('macro.bin: bad magic ' + magic);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(4, true) !== MACRO_VERSION) throw new Error('macro.bin: version ' + dv.getUint32(4, true));
  const jl = dv.getUint32(8, true);
  const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + jl)));
  const N = meta.width * meta.height;
  let off = (12 + jl + 3) & ~3;
  const elevation = new Float32Array(N), slope = new Float32Array(N);
  for (let i = 0; i < N; i++) elevation[i] = dv.getUint16(off + i * 2, true) / 65535;
  off += N * 2;
  for (let i = 0; i < N; i++) slope[i] = dv.getUint16(off + i * 2, true) / 65535;
  off += N * 2;
  const water = bytes.slice(off, off + N); off += N;
  const river = bytes.slice(off, off + N); off += N;
  const biome = bytes.slice(off, off + N);
  return { ...meta, elevation, slope, water, river, biome };
}

/** Catmull-Rom. */
function cr(p0, p1, p2, p3, t) {
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}
/** Bicubic sample of a macro layer at fractional macro coordinates (edges clamp). */
export function bicubic(m, arr, fx, fy) {
  const w = m.width, h = m.height;
  const x1 = Math.floor(fx), y1 = Math.floor(fy), tx = fx - x1, ty = fy - y1;
  const at = (x, y) => arr[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];
  const row = y => cr(at(x1 - 1, y), at(x1, y), at(x1 + 1, y), at(x1 + 2, y), tx);
  return cr(row(y1 - 1), row(y1), row(y1 + 1), row(y1 + 2), ty);
}
/** Nearest macro cell index for world metres. */
export function macroIndex(m, wx, wz) {
  const M = m.macroMetres;
  return clamp(Math.round(wz / M), 0, m.height - 1) * m.width + clamp(Math.round(wx / M), 0, m.width - 1);
}

/**
 * The refine functions for one world: base ground (before rivers/lakes/towns), biome warp noise.
 * Everything takes WORLD metres. Seeded from the world seed only.
 */
export function makeRefiner(m, extra = {}) {
  const M = m.macroMetres;
  const seed = subSeed(m.seed, 'thousandvale-zone-detail');
  const nA = makeNoise2D(subSeed(seed, 'a')), nB = makeNoise2D(subSeed(seed, 'b')), nC = makeNoise2D(subSeed(seed, 'c'));
  const nWX = makeNoise2D(subSeed(seed, 'wx')), nWZ = makeNoise2D(subSeed(seed, 'wz'));
  const metres = e => (e >= 0.5 ? (e - 0.5) * 2 * m.landMetres : (e - 0.5) * 2 * m.seaMetres);
  const nCoast = makeNoise2D(subSeed(seed, 'coast'));
  /** The pangea ground with no continent applied (what every Torbor Downs zone was baked from). */
  function mainland(wx, wz) {
    const fx = wx / M, fy = wz / M;
    const base = metres(bicubic(m, m.elevation, fx, fy));
    const rel = clamp(bicubic(m, m.slope, fx, fy), 0, 1);
    const hills = (fbm(nA, wx / 420, wz / 420, { octaves: 4 }) - 0.5) * (14 + rel * 90);
    const ridge = ridged(nB, wx / 900, wz / 900, { octaves: 3 }) * rel * 60;
    const fine = (fbm(nC, wx / 38, wz / 38, { octaves: 3 }) - 0.5) * (1.2 + rel * 5);
    return base + hills + ridge + fine;
  }
  const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  /**
   * How far "out to sea" a point is for one continent, in metres past its coastline (<= 0 = on the land). The
   * coastline wanders by low-frequency noise, so the edge of a block or the rim of an island is never a clean line.
   */
  function seaward(c, wx, wz) {
    if (c.profile === 'downs') return profileOf(c).seaward(wx, wz);
    const r = continentRect(c);
    const wander = (fbm(nCoast, wx / 1700, wz / 1700, { octaves: 3 }) - 0.5) * 2 * c.wander;
    if (c.kind === 'island') {
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, half = Math.min(r.x1 - r.x0, r.z1 - r.z0) / 2;
      return Math.hypot(wx - cx, wz - cz) - half * c.radius + wander;
    }
    const dx = Math.max(r.x0 - wx, 0, wx - r.x1), dz = Math.max(r.z0 - wz, 0, wz - r.z1);
    const d = Math.hypot(dx, dz);
    if (d <= 0) return -1;                                      // a block's own land is never touched
    // headlands and bays: the coast stands out from the block by 0..wander metres (broad, low-frequency), with a
    // second, finer wobble so a headland's own shore is not smooth
    const reach = smooth((fbm(nCoast, wx / 3200 + 7.1, wz / 3200 - 3.3, { octaves: 2 }) - 0.32) * 2.2) * c.wander;
    return d - reach - Math.abs(wander) * 0.35;
  }
  /** The ground with the continents applied: land inside them, sea floor everywhere else. */
  function baseGround(wx, wz) { return withBays(wx, wz, continentGround(wx, wz)); }
  /** Metres the bays moved the ground here (0 outside every bay's band; never positive). Roads, river surfaces and bridge
   *  decks fixed by the world bake are moved by this much (bake-zone), so they stay on the land they were graded to. */
  function bayDelta(wx, wz) { const g = continentGround(wx, wz); return withBays(wx, wz, g) - g; }
  function continentGround(wx, wz) {
    let best = Infinity, near = null;
    for (const c of CONTINENTS) { const s = seaward(c, wx, wz); if (s < best) { best = s; near = c; } }
    const c = continentAt(wx, wz);
    let h = c && c.profile ? continentProfile(c, wx, wz, mainland(wx, wz)) : mainland(wx, wz);
    if (best <= 0 && !(near.kind === 'island')) return h;      // inside a block: exactly the old ground
    if (best <= 0) return h;
    // Torbor Downs (play-test 12): a high coast falls further, so its sea cliffs stand at ~50 degrees rather than as a wall
    let t = smooth(best / (near.profile === 'downs' ? near.fall + 0.2 * Math.max(0, h) : near.fall));
    // …and is under the sea within 220 m of the old block edge, so no land is left standing outside the walkable zones
    if (near.profile === 'downs') { const r = continentRect(near), out = Math.hypot(Math.max(r.x0 - wx, 0, wx - r.x1), Math.max(r.z0 - wz, 0, wz - r.z1)); if (out > 0) t = Math.max(t, smooth(out / 220)); }
    const floor = -near.depth - 30 * smooth((best - near.fall) / 4000) + (fbm(nC, wx / 600, wz / 600, { octaves: 2 }) - 0.5) * 12;
    // the land slopes into the water: a high edge (Torbor Downs' southern mountains) becomes sea cliffs
    return h + (floor - h) * t;
  }
  /**
   * Terrain shaping inside an 'island' continent, before the coast falls away (expansion terrain).
   * 'volcanic' = Vharlen, the Burning Isle (tools/lib/vharlen.mjs, docs/EXPANSION-1.md §2–§3). Within 100 m of the block's
   * edge (open sea by then) it hands back to the old ground, so the sea floor is continuous across the edge.
   */
  const profiles = {};
  function profileOf(c) {
    if (!(c.id in profiles)) {
      profiles[c.id] = c.profile === 'volcanic' ? makeVolcanic({ seed: m.seed, seaward: (x, z) => seaward(c, x, z) })
        : c.profile === 'downs' ? downsProfile() : null;
      if (profiles[c.id]) profiles[c.id].ground = baseGround;     // with the coast's fall to the sea (roads, pools)
    }
    return profiles[c.id];
  }
  /** Torbor Downs' profile needs the world's own lines and pins (tools/lib/torbor.mjs): makeRefiner(macro, { world, townPins, sitePins }). */
  function downsProfile() {
    if (!extra.world) throw new Error('world-core: Torbor Downs (profile "downs") needs makeRefiner(macro, { world, townPins, sitePins, places })');
    const at = (zid, p) => ({ x: +zid.slice(1, 3) * ZM + p.x, z: +zid.slice(4, 6) * ZM + p.z });
    const protectDiscs = [], townDiscs = [];
    for (const [zid, towns] of Object.entries(extra.townPins || {})) if (/^z\d\d_\d\d$/.test(zid)) for (const t of Object.values(towns)) {
      const w = at(zid, t); protectDiscs.push({ ...w, r: (t.r || 50) + 70 }); townDiscs.push({ ...w, r: (t.r || 50) + 20 });
    }
    for (const [zid, pins] of Object.entries(extra.sitePins || {})) if (/^z\d\d_\d\d$/.test(zid)) for (const [k, p] of Object.entries(pins)) {
      if (!k.startsWith('door')) continue;
      const w = at(zid, p); if (w.x < TORBOR.block.x0 || w.x >= TORBOR.block.x1 || w.z < TORBOR.block.z0 || w.z >= TORBOR.block.z1) continue;
      protectDiscs.push({ ...w, r: 26 }); townDiscs.push({ ...w, r: 20 });
    }
    for (const p of extra.places || []) protectDiscs.push({ x: p.x, z: p.z, r: p.r + 6, coast: false });
    for (const b of BAYS) if (b.harbour) { const q = b.harbour.quay, w = at(b.zone, { x: (q.x0 + q.x1) / 2, z: (q.z0 + q.z1) / 2 }); townDiscs.push({ ...w, r: 70 }); protectDiscs.push({ ...w, r: 60, coast: false }); }
    return makeDowns({ seed: m.seed, macroMetres: m.macroMetres, macroWidth: m.width, world: extra.world, protectDiscs, townDiscs, mainland, rugged: (x, z) => clamp(bicubic(m, m.slope, x / M, z / M), 0, 1) });
  }
  function continentProfile(c, wx, wz, ground) {
    const P = profileOf(c); if (!P) return ground;
    const h = c.profile === 'downs' ? P.height(wx, wz, ground) : P.height(wx, wz), r = continentRect(c);
    const edge = Math.min(wx - r.x0, r.x1 - wx, wz - r.z0, r.z1 - wz);
    return h + (ground - h) * (1 - smooth(edge / 100));
  }
  /** A warped macro index: biome borders wander instead of following 128 m squares. */
  function warpedIndex(wx, wz) {
    const ox = (fbm(nWX, wx / 260, wz / 260, { octaves: 3 }) - 0.5) * 220;
    const oz = (fbm(nWZ, wx / 260, wz / 260, { octaves: 3 }) - 0.5) * 220;
    return macroIndex(m, wx + ox, wz + oz);
  }
  /** Low-frequency sideways push for a river point (meanders). */
  function meander(x, z) {
    return [(fbm(nWX, x / 300, z / 300, { octaves: 2 }) - 0.5) * 50, (fbm(nWZ, x / 300, z / 300, { octaves: 2 }) - 0.5) * 50];
  }
  return { baseGround, bayDelta, continentGround, mainland, warpedIndex, meander, metres, seaward, profileOf, islandAt: (wx, wz) => { const c = continentAt(wx, wz); return c && c.profile === 'volcanic' ? profileOf(c) : null; },
    /** Torbor Downs' regenerated ground (tools/lib/torbor.mjs) when (wx, wz) is in its block, else null. */
    downsAt: (wx, wz) => { const c = continentAt(wx, wz); return c && c.profile === 'downs' ? profileOf(c) : null; } };
}

export const RIVER_WIDTH = [0, 7, 14, 24];
/**
 * Channel depth at the centre by river class, plus 0.3 m everywhere in the channel (bake-zone step 6).
 * Play-test 1 (P2): class 1 was 1.2 + 0.3 = 1.5 m in the middle — past WADE_DEPTH (1.1), so every small stream
 * had an invisible wall down its centre. A stream (class 1) is now wadeable all the way (0.8 m at the centre);
 * a river (class 2, 1.6 m) and a big river (class 3, 2.9 m) are swum in the middle, and every road over them has a
 * bridge (crossingsOf below).
 */
export const RIVER_DEPTH = [0, 0.5, 1.3, 2.6];
/** Deck height above the river surface by class (a bridge clears the water by at least this). */
export const DECK_CLEARANCE = [0, 1.0, 1.5, 2.2];
/** Metres of dry bank a bridge deck reaches past the wet channel at each end (the abutment). */
export const DECK_LAND = 1.5;
/** A crossing runs while the road is within the channel half-width + this of a river centreline (dry bank under the abutments). */
export const BANK_MARGIN = 2.5;

/**
 * Where a road crosses river water: walk the road polyline at 1 m and test the distance to every river
 * centreline against its half-width. A crossing is a run of metres within half-width + BANK_MARGIN (so its ends stand
 * on dry bank) that touches the water (half-width + 0.5 m) somewhere; gaps ≤ 2 m join.
 * Replaces the old segment-intersection test, which missed a road running into a channel at a slant or along it
 * and doubled a crossing on a polyline vertex. Pure: world (or any one frame's) metres in, crossings out.
 *   roadPts [[x, z, h]…]   rivers [{id, pts:[[x, z, surface, cls]…]}]   (same frame)
 * → [{ river, cls, surface, s0, s1 (arc metres along the road where the water starts / ends), x, z (middle) }]
 */
export function crossingsOf(roadPts, rivers) {
  if (roadPts.length < 2) return [];
  const xs = roadPts.map(p => p[0]), zs = roadPts.map(p => p[1]);
  const pad = 20, bb = [Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) + pad, Math.max(...zs) + pad];
  const segs = [];
  for (const r of rivers) {
    if (r.bbox && (r.bbox[2] < bb[0] || r.bbox[0] > bb[2] || r.bbox[3] < bb[1] || r.bbox[1] > bb[3])) continue;
    for (let k = 0; k < r.pts.length - 1; k++) {
      const a = r.pts[k], b = r.pts[k + 1];
      if (Math.max(a[0], b[0]) < bb[0] || Math.min(a[0], b[0]) > bb[2] || Math.max(a[1], b[1]) < bb[1] || Math.min(a[1], b[1]) > bb[3]) continue;
      segs.push({ river: r.id, a, b, cls: Math.max(a[3], b[3]) });
    }
  }
  if (!segs.length) return [];
  const wetAt = (x, z) => {
    let best = null;
    for (const g of segs) {
      const dx = g.b[0] - g.a[0], dz = g.b[1] - g.a[1], L2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - g.a[0]) * dx + (z - g.a[1]) * dz) / L2, 0, 1);
      const d = Math.hypot(x - g.a[0] - dx * t, z - g.a[1] - dz * t);
      const half = RIVER_WIDTH[g.cls] / 2;
      if (d <= half + BANK_MARGIN && (!best || d - half < best.over)) best = { over: d - half, wet: d <= half + 0.5, river: g.river, cls: g.cls, surface: g.a[2] + (g.b[2] - g.a[2]) * t };
    }
    return best;
  };
  const out = []; let cur = null, s = 0;
  for (let k = 0; k < roadPts.length - 1; k++) {
    const a = roadPts[k], b = roadPts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let q = 0; q < L; q += 1) {
      const x = a[0] + (b[0] - a[0]) * q / L, z = a[1] + (b[1] - a[1]) * q / L, w = wetAt(x, z), at = s + q;
      if (w) {
        if (cur && at - cur.s1 <= 2) { cur.s1 = at; if (w.cls > cur.cls) cur.cls = w.cls; cur.surface = Math.max(cur.surface, w.surface); cur.wet ||= w.wet; }
        else { if (cur) out.push(cur); cur = { river: w.river, cls: w.cls, surface: w.surface, s0: at, s1: at, wet: w.wet }; }
      }
    }
    s += L;
  }
  if (cur) out.push(cur);
  return out.filter(c => c.wet).map(({ wet, ...c }) => { const m = pointAlong(roadPts, (c.s0 + c.s1) / 2); return { ...c, surface: +c.surface.toFixed(3), x: +m[0].toFixed(2), z: +m[1].toFixed(2) }; });
}

/** The point at arc length s along a polyline [[x, z, h?]…] → [x, z, h] (clamped to the ends). */
export function pointAlong(pts, s) {
  if (s <= 0) return [pts[0][0], pts[0][1], pts[0][2] ?? 0];
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= L) { const t = L ? s / L : 0; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * t]; }
    s -= L;
  }
  const e = pts[pts.length - 1]; return [e[0], e[1], e[2] ?? 0];
}

/**
 * A bridge for one crossing: a flat deck from abutment a to abutment b (one straight piece, or `pieces` — a chain of
 * straight pieces sharing ends — where the road bends through a long crossing) (DECK_LAND metres of dry bank past
 * the water at each end, measured along the road), at deck height h, road width + 1 m wide. The zone bake grades the
 * road on both banks to exactly h at a and b (bake-zone gradeBridge), so the deck meets the road at both ends.
 *   h = surface + clearance, raised by up to 2 m toward the road's own graded height where the road runs high.
 */
export function bridgeFor(roadPts, c, roadWidth) {
  const S0 = c.s0 - DECK_LAND, S1 = c.s1 + DECK_LAND, M = pointAlong(roadPts, (c.s0 + c.s1) / 2);
  const clear = c.surface + DECK_CLEARANCE[c.cls];
  const h = +(clear + clamp(M[2] - clear, 0, 2)).toFixed(3);
  // a straight deck piece from arc s0 to s1, widened by how far the road bends off its chord
  const piece = (s0, s1) => {
    const A = pointAlong(roadPts, s0), B = pointAlong(roadPts, s1), span = Math.hypot(B[0] - A[0], B[1] - A[1]);
    let dev = 0;
    if (span > 0.01) { const ux = (B[0] - A[0]) / span, uz = (B[1] - A[1]) / span; for (let s = s0; s <= s1; s += 1) { const p = pointAlong(roadPts, s); dev = Math.max(dev, Math.abs((p[0] - A[0]) * uz - (p[1] - A[1]) * ux)); } }
    return { a: [+A[0].toFixed(2), +A[1].toFixed(2)], b: [+B[0].toFixed(2), +B[1].toFixed(2)], span: +span.toFixed(2), dev,
      x: +((A[0] + B[0]) / 2).toFixed(2), z: +((A[1] + B[1]) / 2).toFixed(2), yaw: +Math.atan2(B[0] - A[0], B[1] - A[1]).toFixed(4) };
  };
  // a road that bends through a long crossing gets a chain of straight pieces (each bending ≤ 1.2 m), not one fat deck
  let n = 1, pieces;
  for (;;) {
    pieces = []; for (let q = 0; q < n; q++) pieces.push(piece(S0 + (S1 - S0) * q / n, S0 + (S1 - S0) * (q + 1) / n));
    if (n >= 8 || pieces.every(p => p.dev <= 1.2)) break;
    n++;
  }
  for (const p of pieces) { p.width = +(roadWidth + 1 + 2 * p.dev).toFixed(2); delete p.dev; }
  const A = pieces[0].a, B = pieces[pieces.length - 1].b;
  return {
    x: +((A[0] + B[0]) / 2).toFixed(2), z: +((A[1] + B[1]) / 2).toFixed(2), yaw: +Math.atan2(B[0] - A[0], B[1] - A[1]).toFixed(4),
    span: +(S1 - S0).toFixed(2), deck: h, width: Math.max(...pieces.map(p => p.width)), a: A, b: B,
    s0: +S0.toFixed(2), s1: +S1.toFixed(2), river: c.river, cls: c.cls, surface: c.surface,
    ramp: +clamp((h - c.surface) * 10, 14, 40).toFixed(1),
    ...(pieces.length > 1 ? { pieces } : {}),
  };
}
