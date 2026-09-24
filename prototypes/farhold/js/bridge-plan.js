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
  return {
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

/** File a plan's deck into an ObstacleField (js/collide.js). */
export function fileDeck(plan, field) {
  for (const p of plan.pieces) field.addDeck(p.x, p.z, p.angle, p.halfLength, p.halfWidth, p.top, p.slope);
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
  const at = (s, side, dy) => [s.x + nx * side, s.top + dy, s.z + nz * side];

  // the deck, one slab per pair of samples
  for (let k = 0; k + 1 < samples.length; k++) {
    const a = samples[k], b = samples[k + 1];
    // corners counter-clockwise from above: a-left, b-left, b-right, a-right. With +Z along and
    // `n` to the left, "left" is +n.
    pushBox(out, orderCCW(
      [at(a, hw, -DECK_THICK), at(b, hw, -DECK_THICK), at(b, -hw, -DECK_THICK), at(a, -hw, -DECK_THICK)],
      [at(a, hw, 0), at(b, hw, 0), at(b, -hw, 0), at(a, -hw, 0)],
    ), BEAM);
  }

  // the rails: a post-and-beam each side, stopping short of the ramps so they never stand on grass
  const railH = 1.1, railT = 0.25;
  const inner = plan.halfLength - Math.min(END_RAMP, plan.halfLength / 3);
  const railFrom = plan.ends?.back === 'landing' ? plan.from + 1.5 : -inner;
  const railTo = plan.ends?.fwd === 'landing' ? plan.to - 1.5 : inner;
  for (const side of [1, -1]) {
    const o = side * (hw - railT / 2);
    for (let k = 0; k + 1 < samples.length; k++) {
      const a = samples[k], b = samples[k + 1];
      if (a.d < railFrom || b.d > railTo) continue;
      // where two roads meet over one river their decks overlap, and a rail of one standing across
      // the other's deck is a fence across the road — leave that stretch of rail out
      const mx = (a.x + b.x) / 2 + nx * o, mz = (a.z + b.z) / 2 + nz * o;
      if (others.some(q => q !== plan && onPlan(q, mx, mz, 0.3))) continue;
      const lo = side * railT / 2;
      pushBox(out, orderCCW([
        at(a, o + lo, 0), at(b, o + lo, 0), at(b, o - lo, 0), at(a, o - lo, 0),
      ], [
        at(a, o + lo, railH), at(b, o + lo, railH), at(b, o - lo, railH), at(a, o - lo, railH),
      ]), RAIL);
    }
  }

  // piers, where the ground has fallen away far enough under the deck to need holding up
  const PIER = 0.8, EVERY = 9;
  for (let d = (plan.from ?? -plan.halfLength) + EVERY / 2; d <= (plan.to ?? plan.halfLength) - EVERY / 2; d += EVERY) {
    const top = deckTopAlong(plan, d) - DECK_THICK;
    for (const side of [1, -1]) {
      const cx = plan.crossing.x + tx * d + nx * side * (hw - 1.0);
      const cz = plan.crossing.z + tz * d + nz * side * (hw - 1.0);
      const ground = terrain.heightAt(cx, cz);
      if (top - ground < 0.8) continue;
      const h = PIER / 2;
      const corner = (u, v, y) => [cx + tx * u + nx * v, y, cz + tz * u + nz * v];
      const bottom = ground - 0.4;
      pushBox(out, orderCCW(
        [corner(-h, h, bottom), corner(h, h, bottom), corner(h, -h, bottom), corner(-h, -h, bottom)],
        [corner(-h, h, top), corner(h, h, top), corner(h, -h, top), corner(-h, -h, top)],
      ), STONE);
    }
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
