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

export class ObstacleField {
  constructor(bucket = 24) {
    this.bucket = bucket;
    this.buckets = new Map();
    this.count = 0;
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

  /** Everything filed near a point (may repeat across buckets; callers de-duplicate by effect). */
  near(x, z) {
    return this.buckets.get(this._key(Math.floor(x / this.bucket), Math.floor(z / this.bucket))) || null;
  }

  /** Is this point inside something solid? */
  blocked(x, z, radius = 0) {
    const list = this.near(x, z);
    if (!list) return false;
    for (const o of list) {
      const dx = x - o.x, dz = z - o.z, reach = o.r + radius;
      if (dx * dx + dz * dz < reach * reach) return true;
    }
    return false;
  }

  /**
   * Push a position out of anything it is inside. Returns [x, z] — unchanged when nothing is in
   * the way. Sliding along a wall falls out of this for free: only the overlapping axis moves.
   */
  resolve(x, z, radius = 0.4, out = [0, 0]) {
    out[0] = x; out[1] = z;
    for (let pass = 0; pass < 2; pass++) {
      const list = this.near(out[0], out[1]);
      if (!list) break;
      let moved = false;
      for (const o of list) {
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
}

/**
 * How wide and tall each kind of prop is, for collision. Anything not listed is walked through —
 * grass, ferns, reeds, bones and mushrooms should not stop a person.
 */
export const PROP_SOLIDS = {
  broadleaf: [0.45, 7], conifer: [0.4, 9], palm: [0.35, 8], deadtree: [0.35, 6],
  stump: [0.5, 1], rock: [0.9, 1.2], boulder: [2.0, 3], cactus: [0.45, 3],
  crystal: [0.7, 3.4], ruin: [2.2, 4], column: [0.6, 5], standing_stone: [0.7, 5],
};

/** Buildings are bigger and all solid. */
export const BUILDING_SOLIDS = {
  hut: [2.6, 4], house: [3.6, 6], hall: [6.0, 8], tower: [2.6, 12],
  wall: [3.2, 4], well: [1.4, 3], bridge: [0, 0],      // a bridge is to be walked on, not into
};
