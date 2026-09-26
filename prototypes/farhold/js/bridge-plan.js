// Farhold — one plan for a bridge: the deck you see and the deck you stand on, from the same numbers.
//
// Round 23. *"The bridge at (seed 47, Sheithyadmia V, x 13269, z 2876) has no physics and
// characters are clipping through it. The ends are also not flush with the ground."*
//
// Both halves of that were the same fault. A bridge was TWO things built from different numbers:
//
//   - the thing you SEE was one rigid instanced box, laid flat at the road's height at the middle
//     of the crossing (`crossing.deck`) and only as long as `meshHalfLength`;
//   - the thing you STAND ON was a chain of short flat deck colliders, each at `roadSurfaceAt` —
//     the graded road, which ramps down off the crossing towards the bank.
//
// Measured at the reported bridge (Fenkeep, road 0): the drawn deck top is 29.93 m all the way
// along, and the collider under it falls to 29.41 m at the east end. Half a metre of your legs
// inside the planks is "clipping through it". Where the drawn box stops it is 0.86 m above the
// road it is supposed to land on, which is "the ends are not flush". And everything that is NOT the
// player — enemies, companions, townsfolk — only ever asked `terrain.heightAt`, which under a
// bridge is the river BED, so they walked along the bottom of the river underneath it.
//
// So a bridge is now one list of samples along its centre line, and everything reads that list:
//
//   const plan = planBridge(crossing, terrain);
//   plan.samples   // [{ d, x, z, top }] — the deck's top height every ~2 m, end to end
//   plan.pieces    // sloped deck colliders, one between each pair of samples (ObstacleField.addDeck)
//   bridgeGeometry(plan, terrain)   // { position, normal, color, index } — the drawn deck, rails, piers
//
// The drawn top face runs in a straight line between two samples and so does a sloped collider, so
// the two cannot disagree anywhere along the bridge. The ends are brought down to the ground just
// beyond the footprint, so there is no step on or off.
//
// Pure: no Three.js, so node tests measure the same numbers the game draws.

/** Metres between two deck samples. Short enough that the road's own curve is followed closely. */
export const DECK_STEP = 2;
/** How far the deck's top stands above the graded road in the middle of a bridge. */
export const DECK_RISE = 0.26;
/** How thick the planking is, top to underside. The old mesh was 0.45 tall scaled 1.15. */
export const DECK_THICK = 0.52;
/**
 * How far above the ground the deck ends. Not zero, so the plank end is not coplanar with the
 * grass — two centimetres is under anything a foot or an eye can find.
 */
export const END_LIFT = 0.02;
/** Metres over which the deck comes down from its full rise to the ground at each end. */
export const END_RAMP = 6;
/**
 * How far the ground just past an end may be from the road before the end is NOT pulled down to
 * it. A road that ends at a drop is not a reason to bend a bridge six metres into a hole.
 */
export const END_REACH = 1.2;
/** The longest landing an end that meets nothing may grow, and the steepest it may fall (1 in 6). */
export const LANDING_MAX = 40;
export const LANDING_GRADE = 0.16;

const BEAM = [0x5a / 255, 0x46 / 255, 0x32 / 255];
const RAIL = [0x4e / 255, 0x3c / 255, 0x2b / 255];
const STONE = [0x8a / 255, 0x82 / 255, 0x75 / 255];
const DRESSED = [0x9c / 255, 0x93 / 255, 0x83 / 255];     // an arch's deck and parapet: cut stone
const TIMBER = [0x4a / 255, 0x3a / 255, 0x2a / 255];      // a trestle's bents: tarred timber

/**
 * R27 M6 — THREE KINDS OF BRIDGE, chosen from what the crossing record already carries.
 *
 *   - `arch`    — a highway over a short span: cut stone, an arched underside, stone parapets
 *   - `trestle` — anything over a long span, and every lake crossing: timber bents close together
 *   - `plank`   — everything else (the round-23 bridge)
 *
 * THE DECK IS THE SAME IN ALL THREE. Every style's top face is built from `plan.samples`, which is
 * what the colliders are filed from, so a style can never move where you stand. Only the underside,
 * the piers and the rails change — tests/round27-bridges.test.js reads the drawn deck back out of
 * the vertex buffer for every style to hold that.
 */
export const ARCH_MAX = 40;          // metres of crossing an arch will span (highways only)
export const TRESTLE_MIN = 60;       // metres of crossing past which a bridge is a trestle
export const ARCH_BAY = 14;          // the widest one arch may be before it needs a pier
export const BRIDGE_STYLES = ['arch', 'trestle', 'plank'];

/** Which style a crossing is built in. `span` is the crossing's full length, bank to bank. */
export function bridgeStyle(c) {
  const span = 2 * (c.halfLength ?? 12);
  if (c.over === 'lake') return 'trestle';
  if (c.klass === 'highway' && span <= ARCH_MAX) return 'arch';
  if (span > TRESTLE_MIN) return 'trestle';
  return 'plank';
}

/**
 * What each style is made of. `rail` is BOTH the drawn rail and the rail collider (see
 * `railRuns`), `pier` is both the drawn pier and its collider (see `piersOf`).
 */
export const STYLE_PARTS = {
  plank: { deck: BEAM, rail: { h: 1.1, t: 0.25, rgb: RAIL }, pier: { every: 9, thick: 0.9, rgb: STONE } },
  trestle: { deck: BEAM, rail: { h: 1.1, t: 0.25, rgb: RAIL }, pier: { every: 6, thick: 0.45, rgb: TIMBER } },
  arch: { deck: DRESSED, rail: { h: 0.95, t: 0.45, rgb: DRESSED }, pier: { thick: 1.6, rgb: STONE } },
};
const partsOf = plan => STYLE_PARTS[plan.style] || STYLE_PARTS.plank;

const smooth = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Lay out one bridge.
 *
 * `crossing` is a record from `terrain.crossings` (js/planet.js `findCrossings`): centre, tangent,
 * `halfLength` and `halfWidth` of the footprint the terrain leaves open under it, and the id of the
 * road it carries.
 */
export function planBridge(crossing, terrain) {
  const c = crossing;
  const tx = c.tx ?? Math.sin(c.angle), tz = c.tz ?? Math.cos(c.angle);
  const L = c.halfLength ?? 12;
  const hw = c.halfWidth ?? 2.9;

  /**
   * THE ROAD UNDER EACH SAMPLE IS WHICHEVER ROAD THE GROUND WAS GRADED TO.
   *
   * The first version of this followed `crossing.road` alone, on the theory that near a town two
   * roads converge and "the nearest road" changes along the deck. The reported bridge is exactly
   * that case and it showed the theory backwards: road 0 ENDS at Fenkeep's centre six metres from
   * the middle of the bridge and road 1 carries on east, so following road 0 held the deck flat at
   * 29.67 m over ground that `heightAt` had graded to road 1 at 28.94 — a 0.7 m ledge at the end,
   * the very fault being fixed. `roadSurfaceAt` is what `heightAt` grades the ground to, so it is
   * the only answer that lands the deck on the ground it meets. Where two roads meet, the
   * junction pass in js/planet.js has already pinned them to one height.
   */
  let last = c.deck ?? terrain.heightAt(c.x, c.z);
  const roadAt = (x, z) => {
    const r = terrain.roadSurfaceAt?.(x, z);
    if (Number.isFinite(r)) last = r;
    return last;
  };

  const n = Math.max(2, Math.ceil((2 * L) / DECK_STEP));
  const ramp = Math.min(END_RAMP, L / 3);

  /**
   * THE ENDS LAND ON THE GROUND, NOT ON THE ROAD'S IDEA OF IT.
   *
   * Just past the footprint the terrain is back — `heightAt` grades it to the road there, but in a
   * cutting the ground stands above the road and the road ribbon rides on the ground. So the target
   * for each end is the ground a hand's breadth outside the footprint, and the deck is brought down
   * to it over the last few metres. `END_REACH` keeps a road that ends at a drop from bending the
   * deck into it.
   */
  /**
   * What each end lands on. Three cases, measured a hand's breadth past the footprint:
   *
   *   - GROUND near the road's height: bring the deck down to it over the last few metres.
   *   - ANOTHER BRIDGE (two roads meeting over the same river): stay at road height and meet its
   *     deck, which the junction pass in js/planet.js has already pinned to the same height.
   *   - NOTHING — the road ENDS over the water. Seed 47 has fourteen of forty bridge ends like
   *     this: a road that stops at a town node or a junction standing in a river, so the footprint
   *     (which stops where the road does) ends in mid-air with the bank a couple of metres below
   *     and ten metres on. Such an end gets a LANDING: the deck carries straight on and ramps down
   *     to the first ground it can reach at a walkable grade, up to `LANDING_MAX` metres. Where
   *     there is none (a road that ends at the sea), the end is left as it is and reported as a
   *     `drop` on the plan.
   */
  const endInfo = side => {
    const d = side * (L + 0.15);
    const x = c.x + tx * d, z = c.z + tz * d;
    const ground = terrain.heightAt(x, z);
    const road = roadAt(c.x + tx * side * L, c.z + tz * side * L);
    if (Math.abs(ground - road) <= END_REACH) return { shift: ground + END_LIFT - (road + DECK_RISE), kind: 'ground' };
    if (terrain.bridgedAt?.(x, z)) return { shift: 0, kind: 'bridge' };
    const endTop = road + DECK_RISE;
    for (let e = 1; e <= LANDING_MAX; e += 1) {
      const lx = c.x + tx * side * (L + e), lz = c.z + tz * side * (L + e);
      if (terrain.underwater(lx, lz)) continue;
      const g = terrain.heightAt(lx, lz);
      if (g > endTop + END_REACH) break;                  // a bank that stands above the deck
      if (g >= endTop - LANDING_GRADE * e) return { shift: 0, kind: 'landing', metres: e, to: g + END_LIFT };
    }
    return { shift: END_LIFT - DECK_RISE, kind: 'drop' };
  };
  const back = endInfo(-1), fwd = endInfo(1);

  const samples = [];
  for (let k = 0; k <= n; k++) {
    const d = -L + (2 * L * k) / n;
    const x = c.x + tx * d, z = c.z + tz * d;
    const base = roadAt(x, z) + DECK_RISE;
    const w = smooth(L - ramp, L, Math.abs(d));
    const top = base + w * (d < 0 ? back.shift : fwd.shift);
    samples.push({ d, x, z, top, road: base - DECK_RISE });
  }
  // the landings: straight on from the footprint's end and down to the ground, one sample a step
  for (const [side, end] of [[-1, back], [1, fwd]]) {
    if (end.kind !== 'landing') continue;
    const edge = side < 0 ? samples[0] : samples[samples.length - 1];
    const steps = Math.max(1, Math.ceil(end.metres / DECK_STEP));
    const extra = [];
    for (let k = 1; k <= steps; k++) {
      const e = (end.metres * k) / steps, d = side * (L + e);
      extra.push({
        d, x: c.x + tx * d, z: c.z + tz * d,
        top: edge.top + (end.to - edge.top) * (k / steps), road: edge.road, landing: true,
      });
    }
    if (side < 0) samples.unshift(...extra.reverse()); else samples.push(...extra);
  }

  // one sloped collider between each pair of samples — the same straight line the drawn top runs
  const angle = Math.atan2(tx, tz);
  const pieces = [];
  for (let k = 0; k + 1 < samples.length; k++) {
    const a = samples[k], b = samples[k + 1];
    const len = b.d - a.d;
    pieces.push({
      x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, angle,
      // a hair of overlap so a foot exactly on the join is on both, never on neither
      halfLength: len / 2 + 0.01, halfWidth: hw,
      top: (a.top + b.top) / 2, slope: (b.top - a.top) / len,
    });
  }
  /**
   * R27 M6 — WHICH WAY THE WATER RUNS UNDER IT (`crossing.river`). A pier stands along the current,
   * not along the deck's normal, so a road crossing at forty degrees gets skewed piers the water
   * flows past rather than walls it runs into. A lake has no current: its piers square to the deck.
   */
  let fx = -tz, fz = tx;
  const water = c.river != null ? terrain.riverPaths?.find(r => r.id === c.river) : null;
  if (water?.points?.length > 1) {
    let best = 0, bd = Infinity;
    for (let k = 0; k + 1 < water.points.length; k++) {
      const d = Math.hypot(water.points[k][0] - c.x, water.points[k][1] - c.z);
      if (d < bd) { bd = d; best = k; }
    }
    const a = water.points[best], b = water.points[best + 1];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    fx = (b[0] - a[0]) / l; fz = (b[1] - a[1]) / l;
    // never so skewed that a pier runs nearly along the deck
    if (Math.abs(fx * -tz + fz * tx) < 0.55) { fx = -tz; fz = tx; }
  }
  return {
    style: bridgeStyle(c), flow: [fx, fz],
    crossing: c, tx, tz, nx: -tz, nz: tx, halfLength: L, halfWidth: hw, angle, samples, pieces,
    // how far the drawn deck really runs (a landing carries it past the footprint), and what each
    // end meets: 'ground', 'bridge', 'landing' or 'drop'
    from: samples[0].d, to: samples[samples.length - 1].d, ends: { back: back.kind, fwd: fwd.kind },
  };
}

/** The deck's top at a distance `d` along the bridge from its centre — linear between samples. */
export function deckTopAlong(plan, d) {
  const s = plan.samples;
  if (d <= s[0].d) return s[0].top;
  for (let k = 0; k + 1 < s.length; k++) {
    if (d <= s[k + 1].d) {
      const t = (d - s[k].d) / (s[k + 1].d - s[k].d);
      return s[k].top + (s[k + 1].top - s[k].top) * t;
    }
  }
  return s[s.length - 1].top;
}

export const RAIL_H = 1.1, RAIL_T = 0.25;

/**
 * Every stretch of rail a bridge has: `{ a, b, o, side }` — two deck samples, the rail's offset
 * across the deck, and which side. ONE list for the drawn rails and the rail colliders, so a rail you
 * can see is a rail that stops you, and a gap in the rail (where two decks overlap) is a gap in both.
 */
export function railRuns(plan, others = []) {
  const { samples, nx, nz, halfWidth: hw } = plan;
  const RAIL_T = partsOf(plan).rail.t;
  const inner = plan.halfLength - Math.min(END_RAMP, plan.halfLength / 3);
  const railFrom = plan.ends?.back === 'landing' ? plan.from + 1.5 : -inner;
  const railTo = plan.ends?.fwd === 'landing' ? plan.to - 1.5 : inner;
  const out = [];
  for (const side of [1, -1]) {
    const o = side * (hw - RAIL_T / 2);
    for (let k = 0; k + 1 < samples.length; k++) {
      const a = samples[k], b = samples[k + 1];
      if (a.d < railFrom || b.d > railTo) continue;
      // where two roads meet over one river their decks overlap, and a rail of one standing across
      // the other's deck is a fence across the road — leave that stretch of rail out
      const mx = (a.x + b.x) / 2 + nx * o, mz = (a.z + b.z) / 2 + nz * o;
      if (others.some(q => q !== plan && onPlan(q, mx, mz, 0.3))) continue;
      out.push({ a, b, o, side });
    }
  }
  return out;
}

/**
 * R23b — FILE THE RAILS: "the bridge has no physics". The deck held you up and nothing held you
 * ON it; walking into the rail dropped you in the river. Each run is a wall segment that only
 * applies to feet between just under the deck and the top of the rail (js/collide.js `band`), so
 * it never blocks a swimmer under the bridge or a body that does not say where its feet are.
 */
export function fileRails(plan, field, others = []) {
  const { nx, nz } = plan;
  const { h: RAIL_H, t: RAIL_T } = partsOf(plan).rail;
  for (const { a, b, o } of railRuns(plan, others)) {
    const lo = Math.min(a.top, b.top) - 0.6, hi = Math.max(a.top, b.top) + RAIL_H;
    field.addSegment(a.x + nx * o, a.z + nz * o, b.x + nx * o, b.z + nz * o, RAIL_T / 2, RAIL_H, { band: [lo, hi] });
  }
  return field;
}

/** File a plan's deck into an ObstacleField (js/collide.js). */
export function fileDeck(plan, field) {
  for (const p of plan.pieces) field.addDeck(p.x, p.z, p.angle, p.halfLength, p.halfWidth, p.top, p.slope);
  return field;
}

/** Deeper than this under the deck's underside, and a bridge needs holding up. Metres. */
export const PIER_DEPTH = 0.8;

/**
 * R27 M6 — EVERY PIER A BRIDGE HAS, ONE LIST FOR THE DRAWN PIER AND ITS COLLIDER.
 *
 * Round 23's piers were two 0.8 m posts per bent, drawn and never filed: a swimmer or a boat went
 * straight through them. A pier now:
 *
 *   - spans the DECK (its length along the current covers the whole deck width), so the drawn pier
 *     and the thing that stops you are the same shape;
 *   - stands along the current (`plan.flow`), not square to the deck;
 *   - finds its footing at its four FOOTPRINT CORNERS and stands on the lowest one, so a pier on a
 *     sloping bank never floats off its downhill side;
 *   - runs from there up to the deck's underside.
 *
 * Each record: `{ d, x, z, ux, uz, len, thick, bottom, top }` — `u` is the pier's long axis
 * (the current), `len` its half-length along it, `thick` its half-thickness along the deck.
 * Plank piers stand every 9 m where there is depth; trestle bents every 6 m; an arch's piers
 * divide its deep stretch into bays of at most `ARCH_BAY`.
 */
export function piersOf(plan, terrain) {
  if (plan._piers && plan._piersFor === terrain) return plan._piers;
  const { tx, tz, halfWidth: hw } = plan;
  const c = plan.crossing;
  const parts = partsOf(plan).pier;
  const [ux, uz] = plan.flow || [plan.nx, plan.nz];
  // how far along the current the deck strip runs: its width over the sine of the skew
  const skew = Math.max(0.55, Math.abs(ux * plan.nx + uz * plan.nz));
  const len = Math.min(hw * 1.8, (hw - 0.2) / skew);
  const thick = parts.thick / 2;
  const at = d => [c.x + tx * d, c.z + tz * d];
  // A skewed pier reaches along the deck as well as across it, so its top is the LOWEST underside
  // anywhere over its footprint — on a landing ramp the far end would otherwise come up through the
  // planks. Sampled every half metre of that reach.
  const reachAlong = len * Math.abs(ux * tx + uz * tz) + thick * Math.abs(-uz * tx + ux * tz);
  const under = d => {
    let lo = Infinity;
    const n = Math.max(1, Math.ceil((2 * reachAlong) / 0.5));
    for (let k = 0; k <= n; k++) lo = Math.min(lo, deckTopAlong(plan, d - reachAlong + (2 * reachAlong * k) / n));
    return lo - DECK_THICK;
  };

  let ds = [];
  if (plan.style === 'arch') {
    // the stretch with real depth under it, split into equal bays
    let a = null, b = null;
    for (let d = plan.from; d <= plan.to; d += 1) {
      const [x, z] = at(d);
      if (deckTopAlong(plan, d) - DECK_THICK - terrain.heightAt(x, z) >= PIER_DEPTH) { if (a === null) a = d; b = d; }
    }
    if (a !== null && b - a > 2) {
      const n = Math.max(1, Math.ceil((b - a) / ARCH_BAY));
      plan.bays = { a, b, n };
      for (let k = 1; k < n; k++) ds.push(a + ((b - a) * k) / n);
    } else plan.bays = null;
  } else {
    const every = parts.every;
    for (let d = plan.from + every / 2; d <= plan.to - every / 2 + 1e-6; d += every) ds.push(d);
  }
  const out = [];
  for (const d of ds) {
    const [x, z] = at(d);
    const top = under(d);
    // the footing: the lowest of the four corners of the footprint
    let lowest = Infinity;
    for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const cx = x + ux * len * su - uz * thick * sv, cz = z + uz * len * su + ux * thick * sv;
      lowest = Math.min(lowest, terrain.heightAt(cx, cz));
    }
    if (top - lowest < PIER_DEPTH) continue;
    out.push({ d, x, z, ux, uz, len, thick, bottom: lowest - 0.1, top, lowest });
  }
  plan._piers = out; plan._piersFor = terrain;
  return out;
}

/**
 * File a plan's piers into an ObstacleField as height-banded wall segments — the round-23 rail
 * pattern. Each is solid only for feet between the river bed and the deck's underside: a swimmer,
 * a boat or somebody wading under the bridge is stopped; a walker on the deck, whose feet are above
 * the underside, is not.
 */
export function filePiers(plan, field, terrain) {
  for (const p of piersOf(plan, terrain)) {
    field.addSegment(p.x - p.ux * p.len, p.z - p.uz * p.len, p.x + p.ux * p.len, p.z + p.uz * p.len,
      p.thick, p.top - p.bottom, { band: [p.bottom - 2, p.top] });
  }
  return field;
}

// ---------------------------------------------------------------------------- the drawn bridge

/**
 * Append a box given its eight corners, bottom four then top four, each counter-clockwise seen from
 * above. Flat-shaded: every face has its own four vertices and its own normal.
 */
function pushBox(out, corners, rgb) {
  const [b0, b1, b2, b3, t0, t1, t2, t3] = corners;
  const faces = [
    [t0, t1, t2, t3],            // top
    [b3, b2, b1, b0],            // bottom
    [b0, b1, t1, t0], [b1, b2, t2, t1], [b2, b3, t3, t2], [b3, b0, t0, t3],
  ];
  for (const [p, q, r, s] of faces) {
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
    const vx = s[0] - p[0], vy = s[1] - p[1], vz = s[2] - p[2];
    // p, q, r, s run counter-clockwise seen from outside, so (q - p) x (s - p) points outward
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const base = out.position.length / 3;
    for (const v of [p, q, r, s]) {
      out.position.push(v[0], v[1], v[2]);
      out.normal.push(nx, ny, nz);
      out.color.push(rgb[0], rgb[1], rgb[2]);
    }
    // three.js front faces are counter-clockwise, which is the order p, q, r, s already runs in
    out.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/**
 * The drawn bridge: a planked deck that follows the plan's samples exactly, a rail each side, and
 * stone piers wherever there is real depth under it. Returns plain arrays for a BufferGeometry.
 *
 * The deck's top face is built from the SAME `samples[k].top` the colliders were — each slab runs
 * from one sample to the next with its top corners at those two heights, which is the straight line
 * a sloped collider describes. That is the whole guarantee, and tests/round23-bridge-gate.test.js
 * measures it off these arrays rather than trusting this comment.
 */
export function bridgeGeometry(plan, terrain, out = { position: [], normal: [], color: [], index: [] }, others = []) {
  const { samples, nx, nz, halfWidth: hw, tx, tz } = plan;
  const parts = partsOf(plan);
  const at = (s, side, dy) => [s.x + nx * side, s.top + dy, s.z + nz * side];

  // the deck, one slab per pair of samples — the SAME in every style; only its colour changes
  for (let k = 0; k + 1 < samples.length; k++) {
    const a = samples[k], b = samples[k + 1];
    // corners counter-clockwise from above: a-left, b-left, b-right, a-right. With +Z along and
    // `n` to the left, "left" is +n.
    pushBox(out, orderCCW(
      [at(a, hw, -DECK_THICK), at(b, hw, -DECK_THICK), at(b, -hw, -DECK_THICK), at(a, -hw, -DECK_THICK)],
      [at(a, hw, 0), at(b, hw, 0), at(b, -hw, 0), at(a, -hw, 0)],
    ), parts.deck);
  }

  // the rails (a parapet on an arch): stopping short of the ramps so they never stand on grass
  const { h: RAIL_H, t: RAIL_T, rgb: RAIL_RGB } = parts.rail;
  for (const r of railRuns(plan, others)) {
    const { a, b, o, side } = r;
    const lo = side * RAIL_T / 2;
    pushBox(out, orderCCW([
      at(a, o + lo, 0), at(b, o + lo, 0), at(b, o - lo, 0), at(a, o - lo, 0),
    ], [
      at(a, o + lo, RAIL_H), at(b, o + lo, RAIL_H), at(b, o - lo, RAIL_H), at(a, o - lo, RAIL_H),
    ]), RAIL_RGB);
  }

  const piers = piersOf(plan, terrain);
  const c = plan.crossing;
  /** A box standing along the current: centre (x, z), half-length `l` along u, half-thickness `t`. */
  const pierBox = (x, z, ux, uz, l, t, y0, y1, rgb) => {
    const corner = (su, sv, y) => [x + ux * l * su - uz * t * sv, y, z + uz * l * su + ux * t * sv];
    pushBox(out, orderCCW(
      [corner(-1, 1, y0), corner(1, 1, y0), corner(1, -1, y0), corner(-1, -1, y0)],
      [corner(-1, 1, y1), corner(1, 1, y1), corner(1, -1, y1), corner(-1, -1, y1)],
    ), rgb);
  };

  if (plan.style === 'trestle') {
    /**
     * A TRESTLE BENT: posts along the current (as many as the road is wide — `crossing.roadHalf`),
     * a cap beam under the deck and one diagonal brace per pair of posts. The collider is the whole
     * bent (see `filePiers`), because a swimmer does not squeeze between the posts of a bent.
     */
    const roadHalf = c.roadHalf ?? hw - 1;
    for (const p of piers) {
      const posts = Math.max(2, Math.round((2 * roadHalf) / 2.2) + 1);
      const reach = p.len - 0.25;
      const at_ = k => -reach + (2 * reach * k) / (posts - 1);
      for (let k = 0; k < posts; k++) {
        const o = at_(k);
        pierBox(p.x + p.ux * o, p.z + p.uz * o, p.ux, p.uz, 0.16, 0.16, p.bottom, p.top, TIMBER);
      }
      pierBox(p.x, p.z, p.ux, p.uz, p.len, 0.2, p.top - 0.32, p.top, TIMBER);          // cap beam
      // the braces: a thin plank from the foot of one post to the head of the next
      const foot = Math.max(p.bottom + 0.3, p.top - 4);
      for (let k = 0; k + 1 < posts; k++) {
        const o0 = at_(k), o1 = at_(k + 1), up = k % 2 === 0;
        const y0 = up ? foot : p.top - 0.35, y1 = up ? p.top - 0.35 : foot;
        const P = (o, y, sv) => [p.x + p.ux * o - p.uz * 0.07 * sv, y, p.z + p.uz * o + p.ux * 0.07 * sv];
        // a parallelogram prism: bottom edge from (o0, y0) to (o1, y1), 0.22 m tall
        pushBox(out, orderCCW(
          [P(o0, y0, 1), P(o1, y1, 1), P(o1, y1, -1), P(o0, y0, -1)],
          [P(o0, y0 + 0.22, 1), P(o1, y1 + 0.22, 1), P(o1, y1 + 0.22, -1), P(o0, y0 + 0.22, -1)],
        ), TIMBER);
      }
    }
  } else {
    for (const p of piers) pierBox(p.x, p.z, p.ux, p.uz, p.len, p.thick, p.bottom, p.top, parts.pier.rgb);
  }

  if (plan.style === 'arch' && plan.bays) {
    /**
     * THE ARCHED UNDERSIDE. Stone is filled in under the deck's own underside, down to a curve that
     * springs from each pier (or bank) and rises to the deck in the middle of the bay. The fill's top
     * is the deck's underside — never above it — so an arch cannot move where you stand; that is the
     * rule tests/round27-bridges.test.js holds every style to.
     */
    const { a, b, n } = plan.bays;
    const bay = (b - a) / n;
    const springAt = d => {
      const [x, z] = [c.x + tx * d, c.z + tz * d];
      const water = Number.isFinite(c.surf) ? c.surf + 0.35 : -Infinity;
      return Math.max(terrain.heightAt(x, z), water);
    };
    const STEP = 1;
    for (let d = a; d < b - 1e-6; d += STEP) {
      const e = Math.min(b, d + STEP);
      const k = Math.min(n - 1, Math.floor(((d + e) / 2 - a) / bay));
      const b0 = a + k * bay, b1 = b0 + bay;
      const s0 = springAt(b0), s1 = springAt(b1);
      const curve = x => {
        const u = Math.max(0, Math.min(1, (x - b0) / bay));
        const under = deckTopAlong(plan, x) - DECK_THICK;
        const spring = s0 + (s1 - s0) * u;
        const rise = Math.max(0, under - spring);
        // a segmental arch: full at the springing, gone at the crown, a circle's quarter between
        const w = 1 - Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
        return under - rise * w - 0.12;
      };
      const S = d2 => ({ x: c.x + tx * d2, z: c.z + tz * d2, top: deckTopAlong(plan, d2) });
      const sa = S(d), sb = S(e);
      const ya = curve(d), yb = curve(e);
      const ua = sa.top - DECK_THICK, ub = sb.top - DECK_THICK;
      if (ua - ya < 0.05 && ub - yb < 0.05) continue;
      const pt = (s, side, y) => [s.x + nx * side, y, s.z + nz * side];
      const w_ = hw - 0.05;
      pushBox(out, orderCCW(
        [pt(sa, w_, ya), pt(sb, w_, yb), pt(sb, -w_, yb), pt(sa, -w_, ya)],
        [pt(sa, w_, ua), pt(sb, w_, ub), pt(sb, -w_, ub), pt(sa, -w_, ua)],
      ), STONE);
    }
  }
  return out;
}

// ------------------------------------------------------------------ fords and lake causeways

const FLAG = [0x7d / 255, 0x78 / 255, 0x6c / 255];
const FLAG_DARK = [0x66 / 255, 0x62 / 255, 0x58 / 255];
const CULVERT = [0x1c / 255, 0x1d / 255, 0x20 / 255];
/** How far a flagstone's top stands above the ground `heightAt` grades a ford to. */
export const FLAG_PROUD = 0.06;

/**
 * R27 M6 — A FORD'S FLAGSTONES. `ford` is a record from `terrain.fords` (js/planet.js `fordDips`).
 * The road there is laid 0.3 m under the water; each stone sits on `heightAt` at its own centre, a
 * few centimetres proud, so the water over it is the ford's depth less `FLAG_PROUD` — which is what
 * tests/round27-bridges.test.js measures, stone by stone. Stones only where the ground is under the
 * water: up the bank the road ribbon is the path.
 */
export function fordGeometry(ford, terrain, out = { position: [], normal: [], color: [], index: [] }) {
  const { tx, tz } = ford, nx = -tz, nz = tx;
  const half = ford.stonesHalf ?? ford.halfLength;
  const across = Math.max(1, Math.round((2 * ford.halfWidth) / 1.1));
  let k = 0;
  for (let d = -half; d <= half + 1e-6; d += 0.9) {
    for (let j = 0; j < across; j++) {
      k++;
      // a stone's own small wobble, the same every time for the same ford
      const h1 = Math.sin((ford.x + d * 13.1 + j * 7.7) * 12.9898) * 43758.5453, r1 = h1 - Math.floor(h1);
      const o = -ford.halfWidth + (2 * ford.halfWidth * (j + 0.5)) / across + (r1 - 0.5) * 0.18;
      const x = ford.x + tx * d + nx * o, z = ford.z + tz * d + nz * o;
      const w = terrain.waterAt?.(x, z);
      // only on the causeway's own bed: a road that bends across the ford takes its stones with it,
      // and a stone off the carriageway would be down on the river bed
      if (!w || w.depth <= 0.26 || w.depth > 0.5) continue;
      // proud of the bed, but never so proud that less than a quarter metre of water is left over it
      const g = terrain.heightAt(x, z), top = Math.max(g + 0.01, Math.min(g + FLAG_PROUD, w.surface - 0.25));
      const a = 0.34 + r1 * 0.08, b = 0.26 + (1 - r1) * 0.08;
      const corner = (u, v, y) => [x + tx * u + nx * v, y, z + tz * u + nz * v];
      pushBox(out, orderCCW(
        [corner(-b, a, g - 0.1), corner(b, a, g - 0.1), corner(b, -a, g - 0.1), corner(-b, -a, g - 0.1)],
        [corner(-b, a, top), corner(b, a, top), corner(b, -a, top), corner(-b, -a, top)],
      ), k % 3 ? FLAG : FLAG_DARK);
    }
  }
  /**
   * …and a row of marker stones either side of the causeway, just off the carriageway, standing a
   * hand's breadth out of the water — the flags themselves are under 0.2-0.3 m of it, and the river
   * sheet hides them, so these are what says "cross here" from the bank. Drawn only; nobody walks on
   * them and they stop nobody.
   */
  for (const side of [1, -1]) {
    for (let d = -half + 0.4; d <= half - 0.4 + 1e-6; d += 1.7) {
      const o = side * (ford.halfWidth + 0.45);
      const x = ford.x + tx * d + nx * o, z = ford.z + tz * d + nz * o;
      const w = terrain.waterAt?.(x, z);
      if (!w || w.depth <= 0.05) continue;
      const g = terrain.heightAt(x, z), top = w.surface + 0.22;
      const r = 0.24;
      const corner = (u, v, y) => [x + tx * u + nx * v, y, z + tz * u + nz * v];
      pushBox(out, orderCCW(
        [corner(-r, r, g - 0.1), corner(r, r, g - 0.1), corner(r, -r, g - 0.1), corner(-r, -r, g - 0.1)],
        [corner(-r * 0.8, r * 0.8, top), corner(r * 0.8, r * 0.8, top), corner(r * 0.8, -r * 0.8, top), corner(-r * 0.8, -r * 0.8, top)],
      ), FLAG_DARK);
    }
  }
  return out;
}

/**
 * R27 M6 — A SHORT LAKE CAUSEWAY'S TWO CULVERT MOUTHS (dressing only). A road over 25 m or less of
 * lake keeps round 17's causeway; a stone-framed opening either side at the waterline says that the
 * embankment lets the water through rather than damming it. `cw` is a record from
 * `terrain.causeways`.
 */
export function culvertGeometry(cw, terrain, out = { position: [], normal: [], color: [], index: [] }) {
  const { tx, tz } = cw, nx = -tz, nz = tx;
  const y0 = cw.surf - 0.35, y1 = Math.max(y0 + 0.4, Math.min(cw.top - 0.2, cw.surf + 0.55));
  for (const side of [1, -1]) {
    const off = side * (cw.halfWidth + 1.6);
    const cx = cw.x + nx * off, cz = cw.z + nz * off;
    const box = (u0, u1, v0, v1, ya, yb, rgb) => {
      const corner = (u, v, y) => [cx + tx * u + nx * v * side, y, cz + tz * u + nz * v * side];
      pushBox(out, orderCCW(
        [corner(u0, v1, ya), corner(u1, v1, ya), corner(u1, v0, ya), corner(u0, v0, ya)],
        [corner(u0, v1, yb), corner(u1, v1, yb), corner(u1, v0, yb), corner(u0, v0, yb)],
      ), rgb);
    };
    box(-0.9, 0.9, -1.6, 0, y0, y1 - 0.05, CULVERT);          // the dark mouth, back into the bank
    box(-1.25, -0.9, -1.2, 0.15, y0, y1 + 0.3, STONE);        // a jamb
    box(0.9, 1.25, -1.2, 0.15, y0, y1 + 0.3, STONE);          // the other
    box(-1.25, 1.25, -1.2, 0.15, y1, y1 + 0.3, STONE);        // the lintel
  }
  return out;
}

/** Is (x, z) over this plan's drawn deck (its footprint plus any landing)? */
export function onPlan(plan, x, z, pad = 0) {
  const dx = x - plan.crossing.x, dz = z - plan.crossing.z;
  const along = dx * plan.tx + dz * plan.tz, across = dx * plan.nx + dz * plan.nz;
  return along >= plan.from - pad && along <= plan.to + pad && Math.abs(across) <= plan.halfWidth + pad;
}

/**
 * Hand `pushBox` its corners counter-clockwise seen from above, whichever way the caller listed
 * them. The winding of a quad in XZ flips with the handedness of the frame the caller built it in
 * (`n` is to the LEFT of the tangent in this game's +Z-forward convention), and getting it wrong
 * turns every face inside out. So it is measured, not assumed.
 */
function orderCCW(bottom, top) {
  // signed area in the XZ plane, with +x right and +z DOWN the screen when viewed from above (+y)
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const p = top[i], q = top[(i + 1) % 4];
    area += p[0] * q[2] - q[0] * p[2];
  }
  // viewed from +y looking down, counter-clockwise in (x, z) is NEGATIVE area in this sum
  if (area > 0) { bottom = [...bottom].reverse(); top = [...top].reverse(); }
  return [...bottom, ...top];
}
