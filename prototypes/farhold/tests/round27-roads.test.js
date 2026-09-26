// node --test prototypes/farhold/tests/round27-roads.test.js
//
// Round 27, M5 — roads that fit the land.
//
//   * roads wind up mountains instead of charging straight up them (switchbacks, js/road-fold.js);
//   * two roads that cross meet at a real crossroads with one height;
//   * a highway is wider than a road is wider than a trail (`ROAD_CLASS`, one owner);
//   * the ramp is a grade and the join reach follows the cell, so a small world is not a special case;
//   * lakes use the exact height conversion, like the land they sit in.
//
// Everything here runs the REAL pipeline: `createWorld` + `makeTerrain` exactly as the game calls
// them, and the ribbon is `laneRibbon`, the function js/features.js draws every road with. The
// grade numbers are measured on the DRAWN deck — the graded surface interpolated between points the
// way the ribbon and the carve both interpolate it — in 10 m windows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';

register('./three-loader.mjs', import.meta.url);

const P = await import('../js/planet.js');
const { laneRibbon } = await import('../js/roadplan.js');
const { foldClimbs, windowGrades } = await import('../js/road-fold.js');
const { elevationToMetresExact } = await import('../../../worldgen/js/relief.js');

const read = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const balance = read('../data/balance.json');

const SEEDS = [25392, 7, 4477, 101, 1337];
const cache = new Map();
/**
 * A world at a planet scale. `setMetresPerCell` is module-wide and every terrain function reads it
 * when it is CALLED, so a terrain is only asked questions while its own scale is the live one —
 * `at()` re-sets it on every fetch.
 */
function at(seed, scale = 0.1) {
  P.setMetresPerCell(P.M_PER_CELL_DEFAULT * scale);
  const key = `${seed}@${scale}`;
  if (cache.has(key)) return cache.get(key);
  const made = P.createWorld({
    seed, width: balance.world?.width ?? 256, height: balance.world?.height ?? 128,
    regionScale: 2, habitable: true, liveable: true,
  });
  const t0 = performance.now();
  const terrain = P.makeTerrain(made.world, made.planet, balance.terrain);
  const w = { seed, scale, made, terrain, ms: performance.now() - t0 };
  cache.set(key, w);
  return w;
}

// ------------------------------------------------------------------------------ the grade probe

/**
 * THE PROBE, as a helper every test here shares: walk every road's DRAWN deck in 2 m steps (the
 * graded surface, straight between two points — which is what `laneRibbon` and the carve in
 * `heightAt` both do) and take the grade over each 10 m window. Sea lanes are skipped: nothing is
 * drawn over open water.
 *
 * Each window carries the length it stands for, whether it is on a `steep`-marked stretch (a climb
 * the fold could not take gentler, marked rather than forced), and where it is.
 */
function gradeWindows(terrain, window = 10) {
  const out = [];
  for (const road of terrain.roadPaths) {
    const pts = road.points, surf = road.surface;
    const samples = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      if (road.wet?.[i] || road.wet?.[i + 1]) { samples.push(null); continue; }
      const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      const n = Math.max(1, Math.ceil(d / 2));
      const steep = !!(road.steep?.[i] || road.steep?.[i + 1]);
      for (let k = 0; k < n; k++) {
        const u = k / n;
        samples.push({
          h: surf[i] + (surf[i + 1] - surf[i]) * u, ds: d / n, steep, road, i,
          x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, z: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u,
          lift: (road.lift?.[i] ?? 0) + ((road.lift?.[i + 1] ?? 0) - (road.lift?.[i] ?? 0)) * u,
        });
      }
    }
    for (let a = 0; a < samples.length; a++) {
      if (!samples[a]) continue;
      let dist = 0, b = a;
      while (b < samples.length && samples[b] && dist < window) { dist += samples[b].ds; b++; }
      if (b >= samples.length || !samples[b] || dist < window) continue;
      out.push({ grade: Math.abs(samples[b].h - samples[a].h) / dist, len: samples[a].ds, steep: samples[a].steep, road, i: samples[a].i, a: samples[a], b: samples[b], dist });
    }
  }
  return out;
}

function gradeStats(terrain) {
  const win = gradeWindows(terrain);
  let len = 0, over30 = 0, over20 = 0, steep = 0, max = 0, where = '';
  for (const w of win) {
    len += w.len;
    if (w.steep) steep += w.len;
    if (w.grade > 0.3) over30 += w.len;
    if (w.grade > 0.2 && !w.steep) over20 += w.len;
    if (!w.steep && w.grade > max) { max = w.grade; where = `road ${w.road.id} point ${w.i}`; }
  }
  return { km: len / 1000, over30: over30 / len, over20: over20 / len, steep: steep / len, max, where };
}

/**
 * What a stretch of drawn deck steeper than 20% IS (per 10 m window, the same windows the grade
 * test measures): (a) the ground, (b) a lift ramp up to a bridge, or (c) a junction fade / floor
 * restore. (b) and (c) are bugs by definition — the pipeline made the slope, the land did not — and
 * the plan says to fix them as bugs, not fold them. A junction window counts against the junction
 * only where the deck is more than 8 points of grade steeper than the ground under the same
 * window; a junction on a 19% hillside is steep because the hillside is.
 */
function classifySteep(terrain) {
  const got = { natural: 0, lift: 0, junction: 0, where: [] };
  for (const w of gradeWindows(terrain)) {
    if (w.grade <= 0.2) continue;
    const rise = Math.abs(w.b.h - w.a.h);
    const ground = Math.abs(terrain.naturalHeightAt(w.b.x, w.b.z) - terrain.naturalHeightAt(w.a.x, w.a.z)) / w.dist;
    const lifted = Math.abs(w.b.lift - w.a.lift);
    const n = w.road.points.length;
    const nearJoin = (w.road.joins || []).some(j => (j.at === 'start' ? w.i < 7 : w.i > n - 8));
    if (lifted > rise * 0.5) got.lift += w.len;
    // the pipeline made it steeper than the land by more than a rounding: a junction's doing
    else if (nearJoin && w.grade > ground + 0.08) {
      got.junction += w.len;
      if (got.where.length < 3) got.where.push(`road ${w.road.id} point ${w.i}: deck ${(w.grade * 100).toFixed(0)}% over ground ${(ground * 100).toFixed(0)}%`);
    }
    else got.natural += w.len;
  }
  return got;
}

test('measure first: no road is steep because of a lift ramp or a junction fade, only the ground', () => {
  /**
   * The roast's worry about the 167% segment: "a 147 m rise over one point cannot be natural".
   * Measured before this milestone it WAS natural, all of it (62 of 62 segments at Super tiny, 91 of
   * 92 at full size — the one exception a junction fade on flat ground). The steepness
   * was the land: World Forge's router cannot see the knobs and the cliffs this file adds, and it
   * cannot fold a road inside a cell. Pinned both ways: whatever is still over 20% is the ground.
   */
  for (const scale of [0.1, 1]) {
    const { terrain } = at(25392, scale);
    const c = classifySteep(terrain);
    assert.equal(c.lift, 0, `scale ${scale}: ${c.lift.toFixed(0)} m of road over 20% is a lift ramp`);
    assert.equal(c.junction, 0, `scale ${scale}: ${c.junction.toFixed(0)} m of road over 20% is a junction fade — ${c.where.join('; ')}`);
  }
});

test('the user\'s mountain highways wind up the hill: grade on seed 25392 at both planet sizes', () => {
  /**
   * The plan's four bars, on the drawn deck in 10 m windows. Before this milestone (commit 5276f58):
   *
   *   Super tiny  — 4.4% of road length over 30%, 7.2% over 20%, worst 117%
   *   full size   — 6.2% of road length over 30%, 11.0% over 20%, worst 161%
   */
  for (const scale of [0.1, 1]) {
    const { terrain } = at(25392, scale);
    const s = gradeStats(terrain);
    const pc = v => (v * 100).toFixed(2) + '%';
    const say = `scale ${scale}: ${s.km.toFixed(1)} km, >30% ${pc(s.over30)}, >20% not steep ${pc(s.over20)}, steep ${pc(s.steep)}, worst not steep ${pc(s.max)} (${s.where})`;
    assert.ok(s.over30 <= 0.005, `too much road over 30% — ${say}`);
    assert.ok(s.over20 <= 0.02, `too much unmarked road over 20% — ${say}`);
    assert.ok(s.steep <= 0.03, `too much road marked steep — ${say}`);
    assert.ok(s.max <= 0.3, `an unmarked stretch is steeper than 30% — ${say}`);
    assert.ok(terrain.roadFolds > 0, `scale ${scale}: nothing was folded at all`);
  }
});

test('a fold never touches a gentle road: seeds 7 and 4477 keep every point of every unfolded road', () => {
  /**
   * THE SUBSET RULE. Hashes of every road's points, taken from commit 225de22 BEFORE any of this
   * milestone's code existed. A road the fold did not touch must come back identical, point for
   * point, to the millimetre.
   *
   * Three things may legitimately change a road the fold did not fold, and all three are excluded
   * by name rather than by loosening the hash: a crossroads inserts its own point (flagged `cross`)
   * and a junction its landing (flagged `landing`) — the line does not move, it gains vertices ON
   * itself — and a branch whose TRUNK was folded has its end walked onto the trunk's new line
   * (`rejoined`).
   */
  const before = {
    7: { 0: '1d363kr', 1: 'kuw4d2', 2: '129cz9l', 3: '11iwm49', 4: 'e3gchn', 5: 'o4gs0', 6: '197d3c8', 7: '1gl64m7', 8: 'a7goa6', 9: '1bicrwy', 10: 'd4qjdg', 11: '14ntzke', 12: 'p5dqk1', 13: 'swytez', 14: '1s4r8sd', 15: '1qzukou', 16: 'upat7x', 17: 'ivy6eu', 18: 'rgs4b5', 19: '1fmhhk6', 20: '123m03c', 21: '1720ajo', 22: '1bo4v3o', 23: 'p6d0q1', 24: 'oo2b6e', 25: '1crxkfp', 26: '1wk774', 27: '181kcr2', 28: '1gchaf0', 29: '152z2q', 30: 'm9qqwj', 31: '11beasp', 32: 'n2cjf5', 33: 'bgn5ni', 34: '1d66v94', 35: '84w9xr', 36: 'iyo1iq', 37: 'p4v4tx', 38: '1d8lpxr', 39: '15kelnu', 40: 'tedwbv', 41: 'pkkifp', 42: 'duff7s', 43: 'f94k6i', 44: '1qoh5k3', 45: '1iq8tmm', 46: '1pdak7p', 47: '1yveayh', 48: '12my63q', 49: '1knrvc', 50: '1la8wl7', 51: '1cspt1w', 52: '16ycezn', 53: '125xnjz', 54: 'lcci8', '25.1': '68buzi', '19.1': '94ewcy', '38.1': 'pb0614', '38.2': '1bfzd94', '38.3': '1629tk8', '13.1': 'fc9el1', '1.1': '7x0o7j', '28.1': '128coxf' },
    4477: { 0: 'dv2hqd', 1: '1tx9p83', 2: '1sr4fap', 3: '1v9vwba', 4: '1rj8gfu', 5: 'vxpccc', 6: 'iabtr0', 7: 'zeoszz', 8: 'v6km8p', 9: '135le1f', 10: '1re2ktk', 11: '1f08uib', 12: '133ie1p', 13: 'fk7o8r', 14: 'oxtf9m', 15: '1wzldtl', 16: 'mnaz7i', 17: '1ofn2ae', 18: '1tzv9u4', 19: '1c8jqjk', 20: '1rntn0e', 21: 'iqknxc', 22: '1y432wy', 23: 'frof5j', 24: '19zbc8c', 25: '1pimydo', 26: '1o3vjjc', 27: 'vvjqhp', 28: 'p46l2x', 29: 'lbs11i', 30: '1qbshqu', 31: '89a72d', 32: '1xi36za', 33: '1dner52', 34: '1hksvcl', 35: 'pg7wxh', 36: '6zf7uw', 37: '9h1dfd', 38: 'sedmbq', 39: 'f341q5', 40: '1x0vl4l', 41: 'nmrvw4', 42: '6lcxp', 43: '1e7sn66', 44: 'ff1lt2', 45: '125jf2v', 46: '7cc3ac', 47: 'uo5bz5', 48: 'j36hvl', 49: '1vcxda9', 50: 'ujmqf1', 51: '1r9dmhy', 52: 'nh6ziw', 53: 'amrvw6', 54: '1mwkuqd', 55: 'rih6wn', 56: 'pzriy5', 57: 'c0vcz9', 58: '1fx9ezr', 59: '13yrum1', 60: 'r0ntth', 61: '15ng828', 62: 'mtxl85', 63: '1kj1jxu', 64: '1bvxq3r', 65: '1pjpq8q', 66: '7z9t4x', 67: '1cuuzqk', 68: '10m2gqv', 69: 'dm2p6y', 70: '1tzzb12', 71: '1wxg05o', 72: '1o9raqo', 73: '155mskl', 74: '1yamcij', 75: '89loa', 76: '16th59r', 77: '1qoi2h', 78: '1cxy23t', 79: '10ork50', 80: '11ei8yb', 81: '1gpgvtr', 82: 'fapy1x', 83: '1bilco1', 84: '8qfjit', 85: 'pmcoaa', 86: '18zbshm', 87: '1rrro2m', 88: '3pqhx', 89: '1442167', 90: '1d3qy4y', 91: '1u9in1m', 92: '7sp4ea', 93: '15laky6', 94: 'nzs4bm', 95: '14hhgyr', 96: '1o96uy9', 97: 'gpse4l', 98: '1uh0gok', 99: '1p1cyp6', 100: 'lj66cq', 101: '1mzh1lb', 102: 'owk8qo', 103: 'v24buz', 104: '163i0ub', '79.1': '169v5kh', '41.1': '1z86io', '73.1': '96n3z8', '88.1': 'qlwtol', '4.1': '1nb9n2u', '58.1': '7ypfxr' },
  };
  // FNV-1a over the millimetre-rounded coordinates — the same function the snapshot was taken with
  const hash = pts => {
    let h = 2166136261 >>> 0;
    for (const p of pts) {
      for (const v of p) {
        const s = String(Math.round(v * 1000));
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
        h ^= 44; h = Math.imul(h, 16777619) >>> 0;
      }
    }
    return h.toString(36);
  };
  for (const seed of [7, 4477]) {
    const { terrain } = at(seed, 0.1);
    // a crossroads cuts a road into `id` and `id.xN`; put the halves back together in order
    const byBase = new Map();
    for (const r of terrain.roadPaths) {
      const base = String(r.id).split('.x')[0];
      if (!byBase.has(base)) byBase.set(base, []);
      byBase.get(base).push(r);
    }
    let same = 0, excused = 0;
    for (const [id, want] of Object.entries(before[seed])) {
      const pieces = byBase.get(String(id));
      assert.ok(pieces, `seed ${seed}: road ${id} is gone`);
      if (pieces.some(r => r.folded || r.rejoined)) { excused++; continue; }
      const pts = [];
      for (const r of pieces) for (const p of r.points) if (!p.cross && !p.landing) pts.push(p);
      assert.equal(hash(pts), want, `seed ${seed}: road ${id} moved without being folded`);
      same++;
    }
    assert.ok(same > excused * 3, `seed ${seed}: only ${same} roads untouched against ${excused} folded`);
  }
});

test('a fold returns the very same array when there is nothing to fold', () => {
  // the module-level half of the subset rule: no climb, no work, no copy
  const flat = [[0, 0], [100, 0], [200, 0], [300, 0]];
  const got = foldClimbs(flat, { heightAt: x => x * 0.05, step: 6, corridor: 60 });
  assert.equal(got.points, flat);
  assert.equal(got.folds, 0);
  // …and a straight climb at 30% with room either side IS folded, gentler, ends unmoved
  const hill = [[0, 0], [60, 0], [120, 0], [180, 0], [240, 0]];
  const h = (x) => Math.min(240, Math.max(0, x)) * 0.3;
  const folded = foldClimbs(hill, { heightAt: h, step: 6, corridor: 120, window: 40 });
  assert.equal(folded.folds, 1);
  assert.equal(folded.points[0], hill[0]);
  assert.equal(folded.points[folded.points.length - 1], hill[hill.length - 1]);
  // the LEGS hold a gentle grade. A hairpin's apex on a
  // uniform 30% slope cannot be flat (turning from one climbing leg to the other passes through the
  // fall line), so a short stretch there is steeper; the grading's cut and fill eases that on a real
  // road, and the grade test above measures the finished deck.
  const grades = windowGrades(folded.points, h, 12).grades.map(g => Math.abs(g.grade)).sort((a, b) => a - b);
  const median = grades[grades.length >> 1];
  assert.ok(median < 0.15, `the folded climb's legs are ${(median * 100).toFixed(0)}% (median)`);
  let len = 0;
  for (let i = 0; i + 1 < folded.points.length; i++) len += Math.hypot(folded.points[i + 1][0] - folded.points[i][0], folded.points[i + 1][1] - folded.points[i][1]);
  assert.ok(len > 72 / 0.15, `a ${len.toFixed(0)} m road cannot climb 72 m gently`);
});

// ------------------------------------------------------------------------------ crossroads

/** Proper crossings between segments of two DIFFERENT roads (touching at an end does not count). */
function crossings(terrain) {
  const out = [];
  const R = terrain.roadPaths;
  for (let a = 0; a < R.length; a++) {
    for (let b = a + 1; b < R.length; b++) {
      const Pp = R[a].points, Q = R[b].points;
      for (let i = 0; i + 1 < Pp.length; i++) {
        for (let j = 0; j + 1 < Q.length; j++) {
          const A = Pp[i], B = Pp[i + 1], C = Q[j], D = Q[j + 1];
          const rx = B[0] - A[0], rz = B[1] - A[1], sx = D[0] - C[0], sz = D[1] - C[1];
          const den = rx * sz - rz * sx;
          if (Math.abs(den) < 1e-9) continue;
          const qx = C[0] - A[0], qz = C[1] - A[1];
          const t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
          if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) out.push({ a: R[a].id, b: R[b].id, x: A[0] + rx * t, z: A[1] + rz * t });
        }
      }
    }
  }
  return out;
}

test('no two roads pass through each other: every crossing is a filed junction', () => {
  let filed = 0;
  for (const seed of SEEDS) {
    const { terrain } = at(seed, 0.1);
    const left = crossings(terrain).filter(c => !terrain.junctions.some(j => Math.hypot(j.x - c.x, j.z - c.z) < 1));
    assert.equal(left.length, 0, `seed ${seed}: ${left.length} crossings nobody filed — first ${JSON.stringify(left[0])}`);
    filed += terrain.junctions.filter(j => j.kind === 'cross').length;
  }
  // the mechanism has to have run on something real, or "zero crossings" proves nothing
  assert.ok(filed >= 1, 'no crossroads was filed on any of the five worlds');
});

test('at every junction the drawn decks of every arm meet at one height (within 0.1 m)', () => {
  /**
   * Read from `laneRibbon`, with the same `groundAt` js/features.js passes — the height the player
   * sees. The trunk's height at the junction is its ribbon between the two cross-sections either
   * side, the way the quad between them is drawn; a branch's is its own end cross-section.
   */
  let checked = 0, worst = 0, where = '', bridged = 0;
  for (const seed of SEEDS) {
    const { terrain } = at(seed, 0.1);
    const groundAt = (x, z) => (terrain.bridgedAt?.(x, z) ? -Infinity : terrain.heightAt(x, z));
    const ribbons = new Map();
    const ribbonOf = r => {
      if (!ribbons.has(r)) ribbons.set(r, laneRibbon({ points: r.points, surface: r.surface, half: r.half }, { lift: 0.06, groundAt }));
      return ribbons.get(r);
    };
    const yAt = (geom, i) => (geom.position[i * 6 + 1] + geom.position[i * 6 + 4]) / 2;
    for (const road of terrain.roadPaths) {
      for (const join of road.joins || []) {
        if (road.wet?.[join.at === 'start' ? 0 : road.points.length - 1]) continue;
        const trunk = join.trunk;
        if (trunk.wet?.[join.i] || trunk.wet?.[join.i + 1]) continue;
        // a junction the water holds up keeps the floor's height (the water has the last word, as
        // it did in round 17); the landing leaves it alone, and so does this test
        // (`onBridge` is set by the landing pass when water — a river to clear, a shore to ride
        // over — holds some of the landing above the junction's height; the test checks that the
        // road there really has a floor, i.e. really is held up by water)
        if (join.onBridge) {
          const e = join.at === 'start' ? 0 : road.points.length - 1;
          const held = [road.floor?.[e], road.floor?.[Math.min(road.points.length - 1, e + 1)], road.floor?.[Math.max(0, e - 1)],
            trunk.floor?.[join.i], trunk.floor?.[Math.min(trunk.points.length - 1, join.i + 1)]].some(v => Number.isFinite(v));
          assert.ok(held, `seed ${seed}: road ${road.id}'s junction was excused with no water floor under it`);
          bridged++;
          continue;
        }
        const tg = ribbonOf(trunk), bg = ribbonOf(road);
        const yT = yAt(tg, join.i) + (yAt(tg, Math.min(trunk.points.length - 1, join.i + 1)) - yAt(tg, join.i)) * join.t;
        const yB = yAt(bg, join.at === 'start' ? 0 : road.points.length - 1);
        checked++;
        const d = Math.abs(yB - yT);
        if (d > worst) { worst = d; where = `seed ${seed} road ${road.id} → ${trunk.id} (${join.cross ? 'crossroads' : 'join'})`; }
      }
    }
  }
  assert.ok(checked > 100, `only ${checked} junction arms`);
  assert.ok(bridged < checked * 0.2, `${bridged} junctions excused as held up by water against ${checked} measured`);
  assert.ok(worst <= 0.1, `a junction's arms are ${worst.toFixed(3)} m apart — ${where}`);
});

// ------------------------------------------------------------------------------ class widths

test('three road classes, three widths, one owner (and the knob is read)', () => {
  const halves = {};
  for (const seed of SEEDS) for (const r of at(seed, 0.1).terrain.roadPaths) (halves[r.klass] ||= new Set()).add(r.half);
  assert.deepEqual([...halves.highway], [4.5]);
  assert.deepEqual([...halves.road], [3.5]);
  assert.deepEqual([...halves.trail], [2.25]);
  const withHighway = SEEDS.find(seed => at(seed, 0.1).terrain.roadPaths.some(r => r.klass === 'highway'));
  // the dead-data rule: move the knob to an odd value and ask the module
  const was = P.ROAD_CLASS.highway.width;
  try {
    P.ROAD_CLASS.highway.width = 11.3;
    P.setMetresPerCell(P.M_PER_CELL_DEFAULT * 0.1);
    const t2 = P.makeTerrain(at(withHighway, 0.1).made.world, at(withHighway, 0.1).made.planet, balance.terrain);
    const hw = t2.roadPaths.filter(r => r.klass === 'highway');
    assert.ok(hw.length && hw.every(r => r.half === 11.3 / 2), 'the highway width in ROAD_CLASS is not the one the roads use');
    // …and the carve follows it: the ground is at deck height right out to the new kerb
    const r = hw.find(q => q.points.length > 20 && !q.wet?.some(Boolean));
    const i = 10, [x, z] = r.points[i];
    const [nx, nz] = [r.points[i + 1][0] - r.points[i - 1][0], r.points[i + 1][1] - r.points[i - 1][1]];
    const L = Math.hypot(nx, nz);
    const kerb = [x - (nz / L) * 5.5, z + (nx / L) * 5.5];
    assert.ok(Math.abs(t2.heightAt(...kerb) - t2.roadSurfaceAt(...kerb)) < 0.05, 'the carve did not widen with the road');
  } finally {
    P.ROAD_CLASS.highway.width = was;
  }
});

test('a highway waypoint pad and a highway waystone still stand clear of the 9 m carriageway', async () => {
  /**
   * The two things that were placed against a road's half-width in round 21, re-measured now that a
   * highway is 9 m: the waypoint pad (js/features.js `padOk`, a 3.2 m disc) and a set piece's
   * approach stones (js/sites.js, `half + footing + 1`). Both read off the BUILT instanced meshes.
   */
  const THREE = await import('three');
  const { createFeatures } = await import('../js/features.js');
  const { createSites, PIECES } = await import('../js/sites.js');
  const data = {
    strongholds: read('../data/strongholds.json'), setpieces: read('../data/setpieces.json'),
    landmarks: read('../data/landmarks.json'), worldbosses: read('../data/worldbosses.json'),
    instances: read('../data/instances.json'),
  };
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const instances = mesh => {
    const out = [];
    for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m4); m4.decompose(v, q, s); out.push([v.x, v.z, s.x]); }
    return out;
  };
  /** Clearance from a point to the nearest carriageway edge, and whether that road is a highway. */
  const clearance = (terrain, x, z) => {
    let best = { gap: Infinity, klass: null };
    for (const r of terrain.roadPaths) {
      for (let i = 0; i + 1 < r.points.length; i++) {
        if (r.wet?.[i]) continue;
        const [ax, az] = r.points[i], [bx, bz] = r.points[i + 1];
        const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
        let t = l2 ? ((x - ax) * vx + (z - az) * vz) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        const gap = Math.hypot(ax + vx * t - x, az + vz * t - z) - r.half;
        if (gap < best.gap) best = { gap, klass: r.klass };
      }
    }
    return best;
  };
  let pads = 0, padsOnHighways = 0, stones = 0, stonesOnHighways = 0;
  for (const seed of SEEDS) {
    const { terrain } = at(seed, 0.1);
    const added = [];
    const scene = { add: o => added.push(o), remove() {} };
    const features = createFeatures(scene, terrain, { seed, radius: 2600 });
    const padMesh = added.find(o => o.name === 'farhold-building-waypoint');
    const towns = (terrain.world.nodes || []).filter(n => n.type === 'settlement' || n.type === 'port');
    const seen = new Set();
    for (const town of towns) {
      features.update(town.x * terrain.metresPerCell, town.y * terrain.metresPerCell, true);
      for (const [x, z] of padMesh ? instances(padMesh) : []) {
      const key = `${x.toFixed(1)},${z.toFixed(1)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const c = clearance(terrain, x, z);
      pads++; if (c.klass === 'highway') padsOnHighways++;
      assert.ok(c.gap >= 3.2 - 0.05, `seed ${seed}: a waypoint pad at ${x | 0},${z | 0} is ${(3.2 - c.gap).toFixed(2)} m into a ${c.klass}`);
      }
    }
    // one set piece at a time (radius 1 shows only the site you stand on), approach pieces only
    const layouts = data.setpieces.layouts;
    const onlyApproach = key => {
      const l = layouts[key];
      if (!l?.approach) return null;
      const piece = l.approach.piece;
      const elsewhere = [...(l.rings || []), ...(l.scatter || [])].some(p => p.piece === piece)
        || (l.centre || []).some?.(p => p.piece === piece);
      return elsewhere ? null : piece;
    };
    const sceneS = [];
    const sites = createSites({ add: o => sceneS.push(o), remove() {} }, terrain, { seed, balance, radius: 1, data });
    for (const site of sites.sites) {
      const piece = onlyApproach(site.plan);
      if (!piece) continue;
      sites.update(site.x, site.z, true);
      const mesh = sceneS.find(o => o.name === 'farhold-site-' + piece);
      const foot = PIECES[piece]?.solid?.[0] ?? 0.5;
      for (const [x, z, scale] of instances(mesh)) {
        const c = clearance(terrain, x, z);
        stones++; if (c.klass === 'highway' && c.gap < 20) stonesOnHighways++;
        assert.ok(c.gap >= foot * scale - 0.05,
          `seed ${seed}: a ${piece} of ${site.name} at ${x | 0},${z | 0} stands ${(foot * scale - c.gap).toFixed(2)} m into a ${c.klass}`);
      }
    }
  }
  assert.ok(pads > 20, `only ${pads} waypoint pads`);
  assert.ok(stones > 0, 'no approach stones were built to measure');
  console.log(`# measured ${pads} pads (${padsOnHighways} nearest a highway), ${stones} approach stones (${stonesOnHighways} beside a highway)`);
});

// ------------------------------------------------------------------------------ scale knobs

test('the lift ramp is a grade: a folded stretch ramps no steeper than a plain one', () => {
  /**
   * `rampPerPoint` shed 0.5 m of lift per road point, which was a grade only because points were a
   * fifth of a cell apart. A fold lays points on a lattice a fraction of that; ramped per point,
   * a lift there would climb several times more steeply. Measured on the lift itself, per metre.
   */
  for (const scale of [0.1, 1]) {
    const { terrain } = at(25392, scale);
    const nominal = 0.5 / (terrain.metresPerCell / 5);
    let worst = 0, folded = 0;
    for (const r of terrain.roadPaths) {
      for (let i = 0; i + 1 < r.points.length; i++) {
        const d = Math.hypot(r.points[i + 1][0] - r.points[i][0], r.points[i + 1][1] - r.points[i][1]);
        // only where the ramp is shedding lift (neither end pinned by its own floor)
        const a = r.lift[i], b = r.lift[i + 1];
        if (a <= 0 || b <= 0 || d < 1e-6) continue;
        // on the fold's own lattice; the map's points keep their half metre a point (see rampStep)
        if (!(r.points[i].fold && r.points[i + 1].fold)) continue;
        folded++;
        if (Math.abs(r.surface[i] - r.floor[i]) < 1e-6 || Math.abs(r.surface[i + 1] - r.floor[i + 1]) < 1e-6) continue;
        worst = Math.max(worst, Math.abs(b - a) / d);
      }
    }
    assert.ok(worst <= nominal * 1.001 + 1e-9, `scale ${scale}: a lift ramps at ${worst.toFixed(4)} m/m, the grade is ${nominal.toFixed(4)}`);
  }
});

// ------------------------------------------------------------------------------ lakes

test('lakes sit at the exact height conversion, not a whole metre', () => {
  /**
   * `lakeSurfaceAt` and each lake's surface used `elevationToMetres`, which is `Math.round` — the
   * round-21 staircase in its last hiding place. The rule, not a number: a lake's surface is the
   * EXACT metres of its lowest cell (that is what keeps the far shore from standing in mid-air),
   * and away from a lake's own cells `waterAt` reports the exact conversion too.
   */
  let lakes = 0, fractional = 0;
  for (const seed of SEEDS) {
    const { terrain } = at(seed, 0.1);
    const { world, relief } = terrain;
    for (const lake of terrain.lakes) {
      lakes++;
      const lowest = Math.min(...lake.cells.map(i => elevationToMetresExact(world.elevation[i], relief)));
      assert.ok(Math.abs(lake.surface - lowest) < 0.05, `seed ${seed}: a lake sits at ${lake.surface} over a lowest cell of ${lowest.toFixed(3)}`);
      if (Math.abs(lake.surface - Math.round(lake.surface)) > 0.01) fractional++;
      // every rim cell (a lake cell with dry land beside it) reads the lake's own level
      const w = terrain.width;
      for (const i of lake.cells) {
        const cx = i % w, cy = (i / w) | 0;
        const rim = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => world.water[(cy + dy) * w + ((cx + dx + w) % w)] !== 2);
        if (!rim) continue;
        const got = terrain.waterAt(cx * terrain.metresPerCell, cy * terrain.metresPerCell);
        if (got?.kind !== 'lake') continue;
        assert.ok(Math.abs(got.surface - lake.surface) < 0.05, `seed ${seed}: a rim cell reads ${got.surface} against its lake's ${lake.surface}`);
      }
    }
  }
  assert.ok(lakes > 5, `only ${lakes} lakes`);
  assert.ok(fractional > lakes * 0.5, `only ${fractional} of ${lakes} lakes are off a whole metre — is the rounding back?`);
});

// ------------------------------------------------------------------------------ dead data

test('nothing reads the dead crossing work any more, and README says where bridges come from', () => {
  const planet = readFileSync(new URL('../js/planet.js', import.meta.url), 'utf8');
  assert.ok(!/meshHalfLength\s*:|function meshHalf\(/.test(planet), 'meshHalf is back');
  assert.ok(!/bridgeCells\s*:/.test(planet), 'bridgeCells is back');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.ok(/findCrossings/.test(readme), 'README still says bridges come from somewhere else');
  const { terrain } = at(7, 0.1);
  for (const c of terrain.crossings) assert.equal(c.meshHalfLength, undefined);
  for (const r of terrain.roadPaths) assert.equal(r.bridgeCells, undefined);
});

/** Every file under js/ except planet.js, as one string — where a crossing field's readers live. */
function readersOutsidePlanet() {
  const dir = new URL('../js/', import.meta.url);
  return readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'planet.js')
    .map(f => readFileSync(new URL(f, dir), 'utf8')).join('\n');
}
const LATER = ['klass', 'roadHalf', 'river'];

test('every field on a crossing record has a reader outside planet.js', () => {
  const src = readersOutsidePlanet();
  const { terrain } = at(7, 0.1);
  const keys = new Set(terrain.crossings.flatMap(c => Object.keys(c)));
  const orphans = [...keys].filter(k => !LATER.includes(k) && !new RegExp(`\\.${k}\\b|\\b${k}\\s*[,}:]`).test(src));
  assert.deepEqual(orphans, [], `crossing fields nobody reads: ${orphans.join(', ')}`);
});

test('klass, roadHalf and river on a crossing have readers', { todo: 'M6 (bridges by kind) gives these their readers' }, () => {
  const src = readersOutsidePlanet();
  const orphans = LATER.filter(k => !new RegExp(`\\.${k}\\b`).test(src.replace(/path\.klass|road\.klass|r\.klass/g, '')));
  assert.deepEqual(orphans, []);
});

test('a stronghold junction slot stands on a filed junction', { todo: 'js/sites.js slotsFrom still finds junctions from shared map cells, not terrain.junctions — see RPG.md R27 M5' }, async () => {
  const { createSites } = await import('../js/sites.js');
  const data = {
    strongholds: read('../data/strongholds.json'), setpieces: read('../data/setpieces.json'),
    landmarks: read('../data/landmarks.json'), worldbosses: read('../data/worldbosses.json'),
    instances: read('../data/instances.json'),
  };
  let onOne = 0;
  for (const seed of SEEDS) {
    const { terrain } = at(seed, 0.1);
    const sites = createSites({ add() {}, remove() {} }, terrain, { seed, balance, data });
    for (const s of sites.sites.filter(q => String(q.key).startsWith('j'))) {
      if (terrain.junctions.some(j => j.kind === 'cross' && Math.hypot(j.x - s.x, j.z - s.z) < terrain.metresPerCell)) onOne++;
    }
  }
  assert.ok(onOne >= 1);
});

test('worldgen time on the user\'s world at full size (logged, for RPG.md)', () => {
  const { ms, terrain } = at(25392, 1);
  console.log(`# makeTerrain 25392 @ scale 1: ${ms.toFixed(0)} ms (the switchback pass ${terrain.roadFoldMs.toFixed(0)} ms)`);
  assert.ok(Number.isFinite(ms));
});
