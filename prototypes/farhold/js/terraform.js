// Farhold — reshaping the ground, and remembering only what changed.
//
// The design document puts this first and says why: *"Flattens ground to a level within a radius.
// The single most-needed tool — you cannot build on Farhold's terrain otherwise."* Farhold's ground
// is noise all the way down; there is no naturally flat metre on the whole planet. Until the player
// can level a patch, nothing else in the building expansion is placeable.
//
// ## How an edit is stored — and why it is NOT a heightfield
//
// The obvious way to do this is to keep a grid of changed heights. On a 163 km world at the
// innermost ring's 2 m step that grid is eight billion cells, and even a sparse patch of it is tens
// of kilobytes per building site in a save that is currently a couple of kilobytes in total.
//
// So a terrain edit is stored as a **brush** — the shape you painted, the level you painted it to,
// and nothing else. Four numbers and a word. The Territory saves a zone the same way (only the
// deltas; a zone nobody touched writes nothing at all), and this is the same trick applied to the
// ground itself:
//
//   * A brush is **tiny**. A whole base is a few dozen of them, a few hundred bytes.
//   * A brush is **resolution-free**. The clipmap in `js/terrain.js` samples the ground at 2 m under
//     your boots and 162 m on the horizon, and stretches both by up to nine when you fly. A stored
//     heightfield would have to be resampled for each; a brush is a function and answers any query.
//   * A brush **replays exactly**. The target level is baked in at the moment you paint it — we
//     store the height, not "whatever the ground was here" — so reloading a save cannot drift even
//     if the world generator is tweaked underneath it.
//   * A brush is **undoable**, because removing it is just removing it.
//
// The cost is that every height query walks the brushes near that point, so there is a bucket index
// and a hard budget per claim (§4.20 — "a limit on how much you may reshape", which the document
// wants anyway so the planet does not end up sculpted flat).
//
// ## Using it
//
//   import { createTerraform } from './terraform.js';
//   const ground = createTerraform({ saved: save.terraform });
//   ground.level({ x, z, r: 8, h: terrain.heightAt(x, z), claim: 'c1' });   // the smoothing tool
//   ground.wrap(terrain);          // from here on terrain.heightAt sees the edits
//   save.terraform = ground.toJSON();
//
// No Three.js in this file on purpose — `node --test` checks the maths.

/** Smooth 0→1 between two edges. The same easing `js/planet.js` grades its roads with. */
export function smoothstep(a, b, x) {
  if (b <= a) return x >= b ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const lerp = (a, b, t) => a + (b - a) * t;

/** Distance from a point to a line segment, and how far along that segment the nearest point was. */
export function segmentHit(x, z, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / len2)) : 0;
  return { dist: Math.hypot(x - (x1 + dx * t), z - (z1 + dz * t)), t };
}

/**
 * Distance from a point to a rotated rectangle — zero inside it.
 *
 * Foundations are rectangles, and a rectangle approximated by a circle either leaves the corners
 * unlevelled or flattens half the garden. Rotating the query into the rectangle's own frame and
 * clamping is the cheapest honest answer.
 */
export function rectDist(x, z, cx, cz, w, d, rot = 0) {
  const c = Math.cos(-rot), s = Math.sin(-rot);
  const px = (x - cx) * c - (z - cz) * s;
  const pz = (x - cx) * s + (z - cz) * c;
  const qx = Math.abs(px) - w / 2, qz = Math.abs(pz) - d / 2;
  const ox = Math.max(qx, 0), oz = Math.max(qz, 0);
  return Math.hypot(ox, oz) + Math.min(Math.max(qx, qz), 0);
}

/**
 * How far this brush reaches from its own centre, for the bucket index and the budget.
 * A strip is measured to the far end; a rectangle to its corner.
 */
function boundsOf(e) {
  if (e.shape === 'strip') {
    return {
      x0: Math.min(e.x1, e.x2) - e.reach, x1: Math.max(e.x1, e.x2) + e.reach,
      z0: Math.min(e.z1, e.z2) - e.reach, z1: Math.max(e.z1, e.z2) + e.reach,
    };
  }
  if (e.shape === 'rect') {
    const half = Math.hypot(e.w, e.d) / 2 + e.feather;
    return { x0: e.x - half, x1: e.x + half, z0: e.z - half, z1: e.z + half };
  }
  return { x0: e.x - e.reach, x1: e.x + e.reach, z0: e.z - e.reach, z1: e.z + e.reach };
}

/** How much ground, in square metres, a brush touches. This is what the claim budget counts. */
export function areaOf(e) {
  if (e.shape === 'strip') {
    const len = Math.hypot(e.x2 - e.x1, e.z2 - e.z1);
    return len * e.reach * 2 + Math.PI * e.reach * e.reach;
  }
  if (e.shape === 'rect') return (e.w + e.feather * 2) * (e.d + e.feather * 2);
  return Math.PI * e.reach * e.reach;
}

/**
 * How strongly a brush bites at a point, and where along it we landed.
 *
 * Full strength inside the brush's own body, easing to nothing by `reach`. The eased skirt is what
 * makes a levelled pad sit in the hillside instead of standing on a cliff of its own making —
 * exactly what `js/planet.js` does where a road's shoulders blend back into the land.
 */
export function biteOf(e, x, z) {
  if (e.shape === 'strip') {
    const hit = segmentHit(x, z, e.x1, e.z1, e.x2, e.z2);
    if (hit.dist >= e.reach) return null;
    return { w: 1 - smoothstep(e.half, e.reach, hit.dist), t: hit.t };
  }
  if (e.shape === 'rect') {
    const dist = rectDist(x, z, e.x, e.z, e.w, e.d, e.rot || 0);
    if (dist >= e.feather) return null;
    return { w: 1 - smoothstep(0, e.feather, Math.max(0, dist)), t: 0 };
  }
  const dist = Math.hypot(x - e.x, z - e.z);
  if (dist >= e.reach) return null;
  return { w: 1 - smoothstep(e.inner, e.reach, dist), t: 0 };
}

/** Lay one brush over a height that already has the earlier brushes in it. */
export function applyEdit(e, x, z, height) {
  const bite = biteOf(e, x, z);
  if (!bite || bite.w <= 0) return height;
  if (e.kind === 'level') {
    // A strip grades from one end to the other, so a road can run downhill and still be a road.
    const target = e.shape === 'strip' ? lerp(e.h1, e.h2, bite.t) : e.h;
    return lerp(height, target, bite.w);
  }
  if (e.kind === 'raise') return height + e.amount * bite.w;
  if (e.kind === 'lower') return height - e.amount * bite.w;
  return height;
}

/** Grid size for the bucket index. Big enough that most brushes land in one or two buckets. */
const BUCKET = 32;

export function createTerraform({
  saved = null,
  /**
   * How much ground one claim may reshape, in square metres. §4.20 asks for a limit "so the planet
   * is not sculpted flat", and a number this size is roughly a 250 m square — a generous base and
   * nowhere near a landscape.
   */
  budget = 60000,
  /** How far ground may be pushed up or down in one brush, in metres. §4.12: nobody digs to the core. */
  maxLift = 12,
} = {}) {
  /** Brushes in the order they were painted. Later ones win, which is what makes undo a pop. */
  let edits = [];
  let nextId = 1;
  /** bucket key → array of brushes that touch it, so a height query walks a handful and not all. */
  const index = new Map();

  const keyOf = (bx, bz) => bx + ',' + bz;

  function indexEdit(e) {
    const b = boundsOf(e);
    for (let bx = Math.floor(b.x0 / BUCKET); bx <= Math.floor(b.x1 / BUCKET); bx++) {
      for (let bz = Math.floor(b.z0 / BUCKET); bz <= Math.floor(b.z1 / BUCKET); bz++) {
        const k = keyOf(bx, bz);
        if (!index.has(k)) index.set(k, []);
        index.get(k).push(e);
      }
    }
  }

  function reindex() {
    index.clear();
    for (const e of edits) indexEdit(e);
  }

  /** Brushes that could possibly touch this point, in paint order. */
  function near(x, z) {
    return index.get(keyOf(Math.floor(x / BUCKET), Math.floor(z / BUCKET))) || null;
  }

  function add(e) {
    e.id = e.id || 'tf' + (nextId++);
    edits.push(e);
    indexEdit(e);
    return e;
  }

  /** What one claim has already spent, in square metres. */
  function spent(claim = null) {
    let total = 0;
    for (const e of edits) if (claim == null || e.claim === claim) total += areaOf(e);
    return total;
  }

  /**
   * Would this brush fit inside the claim's allowance? Returns the refusal as a sentence, because
   * it goes straight into the log — the same rule `js/waypoints.js` follows for travel.
   */
  function afford(e) {
    if (budget <= 0) return null;
    const left = budget - spent(e.claim ?? null);
    if (areaOf(e) <= left) return null;
    return `You have reshaped as much ground here as this claim allows (${Math.round(left)} m² left).`;
  }

  const api = {
    get edits() { return edits; },
    get count() { return edits.length; },

    /**
     * §4.11 — THE SMOOTHING TOOL.
     *
     * Flatten everything within `r` metres to one level, with `feather` metres of easing outside
     * that so the pad meets the hillside rather than sticking out of it. `h` is baked in now, which
     * is what lets the brush replay identically forever after.
     */
    level({ x, z, r = 8, h, feather = null, claim = null }) {
      const inner = Math.max(0.5, r);
      const e = {
        shape: 'circle', kind: 'level', x, z, inner,
        reach: inner + (feather == null ? Math.max(2, inner * 0.5) : feather),
        h, claim,
      };
      const no = afford(e);
      return no ? { ok: false, why: no } : { ok: true, edit: add(e) };
    },

    /** §4.12 — raise or lower, capped so nobody digs to the core or builds a pillar to orbit. */
    raise({ x, z, r = 6, amount = 2, feather = null, claim = null }) {
      const inner = Math.max(0.5, r);
      const e = {
        shape: 'circle', kind: amount < 0 ? 'lower' : 'raise', x, z, inner,
        reach: inner + (feather == null ? Math.max(2, inner * 0.5) : feather),
        amount: Math.min(maxLift, Math.abs(amount)), claim,
      };
      const no = afford(e);
      return no ? { ok: false, why: no } : { ok: true, edit: add(e) };
    },

    lower(opts) { return this.raise({ ...opts, amount: -Math.abs(opts.amount ?? 2) }); },

    /**
     * §4.14/§4.16 — a run of ground levelled between two heights.
     *
     * This is the road tool and the wall tool's foundation both: a road conforms and flattens under
     * itself, and a wall follows the terrain along a graded line instead of stepping over every
     * hummock. `TOWN_EXPANSION.md` §4.3 asks for the same "small terrain deformation so the street
     * is a street, not a ribbon over lumps", so a player-painted road and a town's own street are
     * the same brush.
     */
    strip({ x1, z1, x2, z2, half = 3, feather = null, h1, h2, claim = null }) {
      const e = {
        shape: 'strip', kind: 'level', x1, z1, x2, z2,
        half, reach: half + (feather == null ? Math.max(1.5, half * 0.8) : feather),
        h1, h2: h2 == null ? h1 : h2, claim,
      };
      const no = afford(e);
      return no ? { ok: false, why: no } : { ok: true, edit: add(e) };
    },

    /**
     * §4.17 — a foundation slab: flatten and floor in one action.
     *
     * Rectangular and rotated to match the building that will stand on it, with a short feather so
     * the edge reads as a kerb rather than a ramp. `js/buildplan.js` asks for one of these under
     * anything with a footprint, which is why "a structure never floats" is a rule we can keep.
     */
    slab({ x, z, w = 6, d = 6, rot = 0, h, feather = 1.2, claim = null }) {
      const e = { shape: 'rect', kind: 'level', x, z, w, d, rot, feather, h, claim };
      const no = afford(e);
      return no ? { ok: false, why: no } : { ok: true, edit: add(e) };
    },

    /**
     * The ground at a point, given what the generator said it was.
     *
     * Walks only the brushes in this point's bucket, in paint order. Untouched ground costs one
     * map lookup, which is what keeps the clipmap's ~92,000 vertices affordable.
     */
    apply(x, z, natural) {
      const list = near(x, z);
      if (!list) return natural;
      let h = natural;
      for (const e of list) h = applyEdit(e, x, z, h);
      return h;
    },

    /** Has anything been painted within `r` metres of here? The renderer asks before rebuilding. */
    touched(x, z, r = 0) {
      for (let bx = Math.floor((x - r) / BUCKET); bx <= Math.floor((x + r) / BUCKET); bx++) {
        for (let bz = Math.floor((z - r) / BUCKET); bz <= Math.floor((z + r) / BUCKET); bz++) {
          if (index.has(keyOf(bx, bz))) return true;
        }
      }
      return false;
    },

    /**
     * Put this book in front of a terrain object, so everything that already asks the ground how
     * high it is gets the answer with the player's edits in it.
     *
     * `heightAt`, `slopeAt` and `normalAt` are properties on the object `js/planet.js` returns, so
     * replacing them reaches collision, the camera, prop placement and the clipmap in one move —
     * every one of those calls `terrain.heightAt(…)` rather than the closure inside planet.js.
     *
     * What it does NOT reach is planet.js's own internals: `waterAt`, `colorAt`, `plantable`,
     * `spawnPoint` and `riverAt` all call the private `heightAt` directly. In practice that means a
     * hole you dig below the water line does not fill up and a levelled pad keeps the colour of the
     * slope it replaced. Both are cosmetic; the fix is one line in planet.js and is reported rather
     * than made here, because that file belongs to somebody else this round.
     */
    wrap(terrain) {
      if (!terrain || terrain.__terraformed) return terrain;
      const natural = terrain.heightAt;
      terrain.heightAt = (x, z) => api.apply(x, z, natural(x, z));
      // slope and normal have to be recomputed from the WRAPPED height or a levelled pad still
      // reads as a cliff to anything that asks how steep it is — which is most of the placement
      // rules in `js/buildplan.js`, and the reason walking on to one would slide you off.
      terrain.slopeAt = (x, z, step = 3) => {
        const l = terrain.heightAt(x - step, z), r = terrain.heightAt(x + step, z);
        const u = terrain.heightAt(x, z - step), d = terrain.heightAt(x, z + step);
        return Math.hypot(r - l, d - u) / (2 * step);
      };
      terrain.normalAt = (x, z, step = 3, out = [0, 1, 0]) => {
        const l = terrain.heightAt(x - step, z), r = terrain.heightAt(x + step, z);
        const u = terrain.heightAt(x, z - step), d = terrain.heightAt(x, z + step);
        const nx = l - r, ny = 2 * step, nz = u - d;
        const len = Math.hypot(nx, ny, nz) || 1;
        out[0] = nx / len; out[1] = ny / len; out[2] = nz / len;
        return out;
      };
      terrain.naturalHeightAtEdited = natural;
      terrain.__terraformed = true;
      return terrain;
    },

    /** §4.9 — take the last brush back. Cheap and hugely forgiving, which is the whole point. */
    undo() {
      const e = edits.pop() || null;
      if (e) reindex();
      return e;
    },

    remove(id) {
      const before = edits.length;
      edits = edits.filter(e => e.id !== id);
      if (edits.length !== before) reindex();
      return edits.length !== before;
    },

    /** Everything one claim painted, so razing a base puts its hillside back. */
    removeClaim(claim) {
      const before = edits.length;
      edits = edits.filter(e => e.claim !== claim);
      if (edits.length !== before) reindex();
      return before - edits.length;
    },

    spent,
    budgetLeft(claim = null) { return Math.max(0, budget - spent(claim)); },
    get budget() { return budget; },

    /**
     * The delta. Brushes and nothing else — no heights sampled from the world, no grid, no world.
     * Numbers are trimmed to the millimetre because nobody can see further than that and a save
     * full of `12.340000000000002` is a save three times bigger than it needs to be.
     */
    toJSON() {
      return {
        v: 1,
        edits: edits.map(e => {
          const out = {};
          for (const [k, val] of Object.entries(e)) {
            out[k] = typeof val === 'number' ? Math.round(val * 1000) / 1000 : val;
          }
          return out;
        }),
      };
    },

    load(data) {
      edits = [];
      index.clear();
      nextId = 1;
      for (const e of data?.edits || []) {
        edits.push({ ...e });
        const n = Number(String(e.id || '').replace(/^tf/, ''));
        if (Number.isFinite(n) && n >= nextId) nextId = n + 1;
      }
      reindex();
      return edits.length;
    },
  };

  if (saved) api.load(saved);
  return api;
}
