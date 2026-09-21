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
  addDeck(x, z, angle, halfLength, halfWidth, top) {
    const r = Math.hypot(halfLength, halfWidth);
    const item = {
      x, z, r, h: 0, deck: true, top,
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
  standable(o) { return o.deck ? true : o.r >= STANDABLE_RADIUS; }

  /** Is this point inside something solid? */
  blocked(x, z, radius = 0) {
    const list = this.near(x, z);
    if (!list) return false;
    for (const o of list) {
      if (o.deck) continue;                      // you walk ON a deck, never into it
      const dx = x - o.x, dz = z - o.z, reach = o.r + radius;
      if (dx * dx + dz * dz < reach * reach) return true;
    }
    return false;
  }

  /**
   * Push a position out of anything it is inside. Returns [x, z] — unchanged when nothing is in
   * the way. Sliding along a wall falls out of this for free: only the overlapping axis moves.
   */
  resolve(x, z, radius = 0.4, out = [0, 0], feet = null) {
    out[0] = x; out[1] = z;
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
  standAt(x, z, feet, radius = 0.4) {
    const list = this.near(x, z);
    if (!list) return null;
    let best = null;
    for (const o of list) {
      if (!o.deck && !this.ground) continue;           // a cylinder's top is measured from the ground
      if (!this.standable(o)) continue;
      if (o.deck) {
        if (!this.onDeck(o, x, z, radius)) continue;
      } else {
        const dx = x - o.x, dz = z - o.z, reach = o.r + radius;
        if (dx * dx + dz * dz >= reach * reach) continue;
      }
      const top = this.topOf(o);
      if (top > feet + CLEARANCE) continue;            // we are under it, not on it
      if (best === null || top > best) best = top;
    }
    return best;
  }
}

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
