// Farhold — stopping you walking through things.
//
// Props and buildings are drawn with InstancedMesh, so there are no objects in the scene to test
// against — just matrices in a buffer. So whatever places an instance also files a cylinder here:
// a position, a radius and a height. That is enough for a third-person game where everything solid
// is a tree trunk, a rock, a wall or a house.
//
//   const field = new ObstacleField();
//   field.add(x, z, radius, height);          // while placing instances
//   const [nx, nz] = field.resolve(x, z, 0.4); // each frame, for the player
//
// Bucketed by a grid so a frame costs a handful of checks, not thousands.

import { BUILDING_INFO } from './town-plan.js';

export class ObstacleField {
  constructor(bucket = 24) {
    this.bucket = bucket;
    this.buckets = new Map();
    this.count = 0;
    /**
     * How high the ground is under an obstacle. Needed because a cylinder is filed with a HEIGHT
     * and no base, and "can I jump over this" is a question about its top. Set once by whoever owns
     * the terrain; without it nothing is jumpable and the field behaves exactly as it always did.
     */
    this.ground = null;
  }

  /** `fn(x, z)` → the ground height there. See `this.ground`. */
  setGround(fn) { this.ground = fn || null; this.clearTops(); return this; }

  /** Forget cached tops — the terrain changed under us (a new planet, a dungeon). */
  clearTops() {
    for (const list of this.buckets.values()) for (const o of list) o._top = undefined;
  }

  /**
   * The world height of an obstacle's top, cached. An obstacle you can stand on also has to be wide
   * enough to stand on: a tree trunk is 0.45 m across and standing on one would look ridiculous, so
   * anything narrower than `STANDABLE_RADIUS` is solid all the way up and is never a floor.
   */
  topOf(o) {
    // a deck's top is absolute: there is no ground under a bridge to measure from, which is the
    // whole reason it exists
    if (o.deck) return o.top;
    if (o._top === undefined) o._top = (this.ground ? this.ground(o.x, o.z) : 0) + o.h;
    return o._top;
  }

  _key(bx, bz) { return bx * 73856093 ^ bz * 19349663; }

  clear() { this.buckets.clear(); this.count = 0; }

  /** File a solid cylinder. `height` is only used so a game can let you jump onto low things. */
  add(x, z, radius, height = 3) {
    const b = this.bucket;
    const bx0 = Math.floor((x - radius) / b), bx1 = Math.floor((x + radius) / b);
    const bz0 = Math.floor((z - radius) / b), bz1 = Math.floor((z + radius) / b);
    const item = { x, z, r: radius, h: height };
    for (let bx = bx0; bx <= bx1; bx++) {
      for (let bz = bz0; bz <= bz1; bz++) {
        const k = this._key(bx, bz);
        let list = this.buckets.get(k);
        if (!list) this.buckets.set(k, list = []);
        list.push(item);
      }
    }
    this.count++;
  }

  /**
   * FILE A DECK: A FLAT TOP YOU WALK ON, NOT A CYLINDER YOU WALK AROUND.
   *
   * Round 16. *"Is it possible to have bridges span the gap rather than to raise the elevation up,
   * and ensure the player can walk across the river."* A bridge could only ever carry you because
   * `js/planet.js` raised the GROUND under it — an earth dam across the channel — and the moment
   * that stops, there has to be something else to stand on. Everything in this file until now was a
   * cylinder measured up from the ground below it, which is exactly the wrong shape: the ground
   * under a bridge is the river bed, ten metres down and not a fixed distance away.
   *
   * So a deck carries its own absolute top height and a rotated rectangle for its footprint. It is
   * never solid — you walk onto it, not into it — and `standAt` treats it like any other roof.
   *
   *   field.addDeck(x, z, angle, halfLength, halfWidth, top);   // +Z is along the deck at angle 0
   */
  addDeck(x, z, angle, halfLength, halfWidth, top, slope = 0) {
    const r = Math.hypot(halfLength, halfWidth);
    const item = {
      x, z, r, h: 0, deck: true, top,
      // ROUND 23: a deck may RISE along its length. `top` is the height at its middle and `slope`
      // is metres of rise per metre along +Z, so a chain of these is a ramp with no steps in it —
      // exactly the straight line the drawn bridge deck runs between the same two samples.
      slope,
      // the yaw convention every body in this game uses: local +Z points along `angle`
      tx: Math.sin(angle), tz: Math.cos(angle), hl: halfLength, hw: halfWidth,
    };
    const b = this.bucket;
    for (let bx = Math.floor((x - r) / b); bx <= Math.floor((x + r) / b); bx++) {
      for (let bz = Math.floor((z - r) / b); bz <= Math.floor((z + r) / b); bz++) {
        const k = this._key(bx, bz);
        let list = this.buckets.get(k);
        if (!list) this.buckets.set(k, list = []);
        list.push(item);
      }
    }
    this.count++;
    return this;
  }

  /** A deck's top at this point: its middle height plus its rise, clamped to its own length. */
  deckTop(o, x, z) {
    if (!o.slope) return o.top;
    const along = (x - o.x) * o.tx + (z - o.z) * o.tz;
    return o.top + o.slope * Math.max(-o.hl, Math.min(o.hl, along));
  }

  /**
   * FILE A WALL: A STRAIGHT LENGTH OF MASONRY, NOT A ROW OF CIRCLES.
   *
   * Round 23. *"The gate does not properly connect to the walls, you can just walk through the
   * wall."* A town wall was filed as one 3.4 m cylinder per six-metre segment, which is a string of
   * beads: solid where two circles overlap, and nothing at all past the last bead — so wherever a
   * run of wall stopped short of the gate there was a gap the width of a person, invisible because
   * the drawn wall was not where the circles were. A segment is the thing that is drawn: the line
   * from one end of the wall piece to the other, `half` metres thick either side of it.
   *
   * It is never a floor (a wall top is not a walkway here) and it is always solid, whatever height
   * your feet are at — a four-metre wall is not something anybody in this game can jump. Its ends
   * are square (see `segPush`), so a length of wall stops where its drawn masonry stops.
   *
   *   field.addSegment(ax, az, bx, bz, half, height);
   */
  addSegment(ax, az, bx, bz, half = 0.6, height = 4, { band = null } = {}) {
    const len = Math.hypot(bx - ax, bz - az) || 1e-6;
    const item = {
      seg: true, ax, az, bx, bz, half, h: height,
      /**
       * R23b — A WALL THAT IS ONLY THERE AT ONE HEIGHT: a bridge rail. `[lo, hi]` in world metres;
       * the segment is solid only for a body whose feet are inside that band, so a rail keeps you
       * on the deck and does nothing to a swimmer in the river under it. A body that does not say
       * where its feet are is never stopped by one — that is every caller that cannot be on a deck.
       */
      band,
      x: (ax + bx) / 2, z: (az + bz) / 2, r: len / 2 + half,
      // unit direction a -> b and its length, so the closest-point test is a dot product
      ux: (bx - ax) / len, uz: (bz - az) / len, len,
    };
    const b = this.bucket;
    /**
     * R23b — filed a STEP'S WORTH wider than the masonry. `resolve` looks the wall up from where
     * a move ENDS, and a move that ends a metre past a thin wall can end in a bucket the wall's own
     * outline never touched — so the crossing check never saw it and you walked through. 1.5 m
     * covers a sprint on a slow frame plus a body's radius.
     */
    const pad = half + SEG_REACH;
    const x0 = Math.min(ax, bx) - pad, x1 = Math.max(ax, bx) + pad;
    const z0 = Math.min(az, bz) - pad, z1 = Math.max(az, bz) + pad;
    for (let bxi = Math.floor(x0 / b); bxi <= Math.floor(x1 / b); bxi++) {
      for (let bzi = Math.floor(z0 / b); bzi <= Math.floor(z1 / b); bzi++) {
        const k = this._key(bxi, bzi);
        let list = this.buckets.get(k);
        if (!list) this.buckets.set(k, list = []);
        list.push(item);
      }
    }
    this.count++;
    return this;
  }

  /**
   * How far a body at (x, z) with this radius is INSIDE a wall segment, as the shortest way out:
   * `[dx, dz]` to add to the position, or null when it is clear.
   *
   * A segment is a box, not a capsule: square ends, `half` either side of the line. Rounded ends
   * would reach `half` past the drawn end of the wall — at a gate, a 1.7 m tower rounded off would
   * narrow a ten-metre opening by three and a half metres of air you cannot walk through.
   */
  segPush(o, x, z, radius) {
    const rx = x - o.ax, rz = z - o.az;
    const along = rx * o.ux + rz * o.uz;
    const across = rx * -o.uz + rz * o.ux;
    const inA = Math.min(along + radius, o.len + radius - along);
    const inV = o.half + radius - Math.abs(across);
    if (inA <= 0 || inV <= 0) return null;
    if (inV <= inA) {
      const s = across >= 0 ? 1 : -1;
      return [-o.uz * s * inV, o.ux * s * inV];
    }
    const s = along + radius < o.len + radius - along ? -1 : 1;
    return [o.ux * s * inA, o.uz * s * inA];
  }

  /** Does a height-banded segment (a rail) apply to feet at this height? */
  inBand(o, feet) {
    if (!o.band) return true;
    return Number.isFinite(feet) && feet >= o.band[0] && feet <= o.band[1];
  }

  /** Is this point over a deck's footprint? */
  onDeck(o, x, z, radius = 0) {
    const dx = x - o.x, dz = z - o.z;
    if (Math.abs(dx * o.tx + dz * o.tz) > o.hl + radius) return false;
    return Math.abs(dx * -o.tz + dz * o.tx) <= o.hw + radius;
  }

  /** Everything filed near a point (may repeat across buckets; callers de-duplicate by effect). */
  near(x, z) {
    return this.buckets.get(this._key(Math.floor(x / this.bucket), Math.floor(z / this.bucket))) || null;
  }

  /** Can you stand on top of this one, or is it too narrow to be a floor? */
  standable(o) { return o.deck ? true : o.seg ? false : o.r >= STANDABLE_RADIUS; }

  /** Is this point inside something solid? */
  blocked(x, z, radius = 0) {
    const list = this.near(x, z);
    if (!list) return false;
    for (const o of list) {
      if (o.deck) continue;                      // you walk ON a deck, never into it
      if (o.seg) {
        if (o.band) continue;                    // a rail needs feet to know if it applies
        if (this.segPush(o, x, z, radius)) return true;
        continue;
      }
      const dx = x - o.x, dz = z - o.z, reach = o.r + radius;
      if (dx * dx + dz * dz < reach * reach) return true;
    }
    return false;
  }

  /**
   * Push a position out of anything it is inside. Returns [x, z] — unchanged when nothing is in
   * the way. Sliding along a wall falls out of this for free: only the overlapping axis moves.
   */
  resolve(x, z, radius = 0.4, out = [0, 0], feet = null, from = null) {
    out[0] = x; out[1] = z;
    /**
     * ROUND 23 — A THIN WALL CANNOT BE STEPPED THROUGH IN ONE FRAME.
     *
     * A cylinder three metres across could not be crossed in a frame; a wall segment is a metre
     * thick, and a galloping horse on a slow frame covers more than that. So when the caller says
     * where it came FROM, a move whose line crosses a wall segment is put back on the side it
     * started, at the wall's face — and it keeps its movement along the wall, so it still slides.
     */
    if (from) {
      const list = this.near(x, z);
      if (list) {
        for (const o of list) {
          if (!o.seg || !this.inBand(o, feet)) continue;
          // the wall's normal, and each end's signed distance from its centre line
          const nx = -o.uz, nz = o.ux;
          const s0 = (from[0] - o.ax) * nx + (from[1] - o.az) * nz;
          const s1 = (out[0] - o.ax) * nx + (out[1] - o.az) * nz;
          if (s0 === 0 || Math.sign(s0) === Math.sign(s1)) continue;
          // where along the wall the move crossed its line — only a crossing ON the wall counts
          const k = s0 / (s0 - s1);
          const cx = from[0] + (out[0] - from[0]) * k, cz = from[1] + (out[1] - from[1]) * k;
          const t = (cx - o.ax) * o.ux + (cz - o.az) * o.uz;
          if (t < -radius || t > o.len + radius) continue;
          // a thick box (a gate tower) is not a thin wall: it is only crossed if the move also
          // started outside it, which the ordinary push-out below handles on its own
          if (Math.abs(s0) < o.half + radius) continue;
          const want = Math.sign(s0) * (o.half + radius + 1e-3);
          out[0] += nx * (want - s1); out[1] += nz * (want - s1);
        }
      }
    }
    // `feet` is how high the character's feet are in the world. With it, anything whose top is
    // already below them stops being solid — which is the whole of "I cannot jump over a wall even
    // if I clear it by several feet". Without it (the default) every cylinder is infinitely tall,
    // which is how this behaved before and is still right for anything that does not jump.
    const over = Number.isFinite(feet) && this.ground;
    for (let pass = 0; pass < 2; pass++) {
      const list = this.near(out[0], out[1]);
      if (!list) break;
      let moved = false;
      for (const o of list) {
        if (o.deck) continue;                    // a deck never pushes you out; it holds you up
        if (o.seg) {
          if (!this.inBand(o, feet)) continue;
          const push = this.segPush(o, out[0], out[1], radius);
          if (!push) continue;
          out[0] += push[0]; out[1] += push[1];
          moved = true;
          continue;
        }
        if (over && this.standable(o) && this.topOf(o) <= feet + CLEARANCE) continue;
        const dx = out[0] - o.x, dz = out[1] - o.z;
        const reach = o.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= reach * reach) continue;
        const d = Math.sqrt(d2) || 0.0001;
        const push = (reach - d) / d;
        out[0] += dx * push;
        out[1] += dz * push;
        moved = true;
      }
      if (!moved) break;
    }
    return out;
  }

  /**
   * The highest thing at this point you could be standing on — the top of any wide obstacle you are
   * inside whose roof is at or below your feet. Returns null when there is nothing, so the caller
   * falls back to the terrain.
   *
   * This is what turns "jump over the wall" into "jump ONTO the wall and then off the other side",
   * which is what a player who cleared it by several feet expects to happen.
   */
  standAt(x, z, feet, radius = 0.4, { decksOnly = false } = {}) {
    const list = this.near(x, z);
    if (!list) return null;
    let best = null;
    for (const o of list) {
      if (decksOnly && !o.deck) continue;
      if (!o.deck && !this.ground) continue;           // a cylinder's top is measured from the ground
      if (!this.standable(o)) continue;
      if (o.deck) {
        if (!this.onDeck(o, x, z, radius)) continue;
      } else {
        const dx = x - o.x, dz = z - o.z, reach = o.r + radius;
        if (dx * dx + dz * dz >= reach * reach) continue;
      }
      const top = o.deck ? this.deckTop(o, x, z) : this.topOf(o);
      if (top > feet + CLEARANCE) continue;            // we are under it, not on it
      if (best === null || top > best) best = top;
    }
    return best;
  }
}

/** How far past a wall segment a single move may land and still be checked against it. Metres. */
export const SEG_REACH = 1.5;

/** Narrower than this and you cannot stand on it — a trunk, a column, a cactus. Metres. */
export const STANDABLE_RADIUS = 0.8;

/** How far above a roof still counts as being on it, in metres. Absorbs a frame of gravity. */
export const CLEARANCE = 0.35;

/**
 * How wide and tall each kind of prop is, for collision. Anything not listed is walked through —
 * grass, ferns, reeds, bones and mushrooms should not stop a person.
 */
export const PROP_SOLIDS = {
  broadleaf: [0.45, 7], conifer: [0.4, 9], palm: [0.35, 8], deadtree: [0.35, 6],
  stump: [0.5, 1], rock: [0.9, 1.2], boulder: [2.0, 3], cactus: [0.45, 3],
  crystal: [0.7, 3.4], ruin: [2.2, 4], column: [0.6, 5], standing_stone: [0.7, 5],
};

/**
 * Buildings are bigger and all solid — except a bridge and a street, which are to be walked ON.
 *
 * Derived from `js/town-plan.js` rather than written twice: the catalogue there is the one place
 * that knows what a town is made of, and a building added there is solid here without anybody
 * having to remember.
 */
export const BUILDING_SOLIDS = Object.fromEntries(
  Object.entries(BUILDING_INFO).map(([key, info]) => [key, info.solid]),
);
