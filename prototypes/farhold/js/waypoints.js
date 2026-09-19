// Farhold — waypoints, and the network of them.
//
// "Let's also add waypoints to towns, and allow clicking on waypoints on the map to fast travel
// between them. Waypoints should work like Diablo 2, always there but they have to be activated by
// entering the city first. No need to get physically close to them though, entering the city
// boundaries is enough to activate a waypoint."
//
// And the correction that followed, which is the whole of the visual design:
//
//   "I would like waypoints to all be exactly the same everywhere, a round concrete surface with
//    some arcane sigildry that lights up when activated. When you teleport to a waypoint, you arrive
//    at this sigil. Only towns/cities should have this, but not 'hostile' landmarks like bandit
//    camps."
//
// So a waypoint is ONE design on every world and in every culture. It is not a local monument — it
// is a single network, and it has to read as one thing wherever you find it. The pad is dark and
// inert until the town it stands in has been entered; after that the sigils are lit and you can
// travel to it from any other lit pad.
//
// This module is the BOOK, not the geometry: which pads exist, which are lit, and what it costs to
// travel. `js/features.js` draws the pad and `js/main.js` owns the key and the camera.
//
//   import { createWaypoints } from './waypoints.js';
//   const waypoints = createWaypoints({ settlements, seed });
//   waypoints.visit(town)            // entering the boundary lights it
//   waypoints.list()                 // for the map and the journal
//   waypoints.canTravel(from, to)    // why not, if not
//   waypoints.toJSON() / .load(…)    // part of the save

/**
 * How far from the middle of a settlement counts as "inside it".
 *
 * The user was explicit that walking to the pad is not required — crossing the boundary is enough —
 * so this is generous on purpose. It is the settlement's own footprint plus a margin, the same shape
 * `js/town.js` uses for its watch.
 */
export function boundaryOf(node) {
  const size = node.size || 1;
  const ring = 16 + size * 13;
  return (size >= 4 ? ring + 14 : ring) + 24;
}

/**
 * Where a settlement's pad stands.
 *
 * Beside the square rather than in the middle of it, so it does not fight the well for the one bit
 * of open ground a town has — and at a fixed bearing from the centre so it is in the same relative
 * place in every town, which is what makes it findable without a marker.
 */
export function padSpotFor(node, groundOk = null) {
  const size = node.size || 1;
  const out = 10 + size * 2.2;

  /**
   * The same bearing in every town — unless that bearing is in the river.
   *
   * A fixed offset made the pad findable without a marker, which is the point of one design
   * everywhere. It also put Hollowcrown's pad in the water, because the offset knows nothing about
   * the ground: the town sits on a bend and its south-east corner is the river. So the standard
   * bearing is tried first and the rest of the compass after it, and only then does it give up and
   * take the standard one anyway — a pad in an awkward spot beats no pad at all.
   *
   * `groundOk` is passed by BOTH the renderer and the travel book, so the pad you walk up to and
   * the pad you arrive on can never be different places.
   */
  const base = { x: out, z: -out * 0.35 };
  if (!groundOk) return { x: node.wx + base.x, z: node.wz + base.z };

  /**
   * Rings as well as bearings, because a town on a river bend can be wet the whole way round.
   *
   * Hollowcrown sits in the crook of its river and every one of the eight standard bearings at the
   * standard radius came back wet — so the search fell through to the default and put the pad in the
   * water, where the renderer then refused to build it and the player found nothing. Stepping out a
   * ring at a time finds the bank. A pad ten metres further from the square is a much smaller
   * compromise than no pad at all.
   */
  for (const out2 of [1, 1.45, 1.95, 2.5]) {
    for (const step of [0, 1, -1, 2, -2, 3, -3, 4]) {
      const a = (step / 8) * Math.PI * 2;
      const bx = (base.x * Math.cos(a) - base.z * Math.sin(a)) * out2;
      const bz = (base.x * Math.sin(a) + base.z * Math.cos(a)) * out2;
      const x = node.wx + bx, z = node.wz + bz;
      if (groundOk(x, z)) return { x, z };
    }
  }
  return { x: node.wx + base.x, z: node.wz + base.z };
}

export function createWaypoints({ settlements = [], seed = 1, groundOk = null } = {}) {
  /** Lit pads, by settlement id. A `Set` because the only question ever asked is "is it lit?". */
  const lit = new Set();
  /** Where you were standing when you last travelled — the anchor a town portal would use. */
  let lastDeparture = null;

  /**
   * ONLY TOWNS AND CITIES.
   *
   * "Only towns/cities should have this, but not 'hostile' landmarks like bandit camps." A waypoint
   * is somewhere safe you can always get back to; putting one in a camp you have to fight through
   * defeats the point of having one. Settlements are the only nodes offered here at all, and the
   * smallest hamlets are left out too — a network of every farmstead is not a network, it is a bus.
   */
  const eligible = node => !!node && (node.size || 1) >= 1;

  const pads = () => settlements.filter(eligible).map(node => ({
    id: node.id,
    name: node.name,
    size: node.size || 1,
    node,
    ...padSpotFor(node, groundOk),
    lit: lit.has(node.id),
  }));

  return {
    /** Every pad in the world, lit or not — the map draws the unlit ones greyed. */
    list: pads,

    /** One pad by settlement id. */
    byId(id) { return pads().find(p => p.id === id) || null; },

    /** Is this one lit? */
    isLit(id) { return lit.has(id); },

    /** How many are lit, for the journal line. */
    get count() { return lit.size; },

    /**
     * Entering a settlement lights its pad.
     *
     * Returns the pad if this was the moment it lit, so the caller can say so once rather than every
     * frame the player stands in town.
     */
    visit(node) {
      if (!eligible(node) || lit.has(node.id)) return null;
      lit.add(node.id);
      return this.byId(node.id);
    },

    /** Which settlement, if any, the player is standing inside. */
    settlementAt(x, z) {
      for (const node of settlements) {
        if (!eligible(node)) continue;
        if (Math.hypot(node.wx - x, node.wz - z) <= boundaryOf(node)) return node;
      }
      return null;
    },

    /**
     * May the player travel to this pad right now, and if not, why not.
     *
     * The reasons are returned as sentences because they go straight into the log — a fast-travel
     * button that greys out and says nothing is the thing every player complains about.
     */
    canTravel(id, { fighting = false, underground = false, fromId = null } = {}) {
      const pad = this.byId(id);
      if (!pad) return { ok: false, why: 'There is no waypoint there.' };
      if (!pad.lit) return { ok: false, why: `You have not been to ${pad.name} yet.` };
      if (fighting) return { ok: false, why: 'Not while something is trying to kill you.' };
      if (underground) return { ok: false, why: 'Not from underground. Get back to the surface first.' };
      if (fromId != null && fromId === id) return { ok: false, why: `You are already in ${pad.name}.` };
      return { ok: true, pad };
    },

    /**
     * Travel costs time, because it is fast travel and not teleportation.
     *
     * Hours, scaled by the distance actually covered — so hopping to the next town over is cheap and
     * crossing the world is a day. The caller advances the clock; this only says how much.
     */
    hoursFor(fromX, fromZ, pad) {
      const km = Math.hypot(pad.x - fromX, pad.z - fromZ) / 1000;
      return Math.max(0.5, Math.min(24, km / 6));
    },

    /** Remember where the traveller left from — what a town portal anchors to. */
    noteDeparture(x, z, worldName = null) {
      lastDeparture = { x, z, world: worldName };
      return lastDeparture;
    },
    get departure() { return lastDeparture; },

    /** Part of the save: which pads are lit, and where the portal would lead. */
    toJSON() { return { lit: [...lit], departure: lastDeparture, seed }; },
    load(data) {
      if (!data) return;
      lit.clear();
      for (const id of data.lit || []) lit.add(id);
      lastDeparture = data.departure || null;
    },
  };
}
