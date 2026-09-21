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
//
// ## The one exception to towns-only: a pad the player built
//
// `BUILDING_EXPANSION.md` §5.5–5.20 adds a waypoint the player raises themselves, and it is
// deliberately the SAME pad — same concrete, same sigil ring, same network. It is not a second
// system with its own rules; it is a row in the same book with three differences:
//
//   * it is lit the moment it is finished, because you were obviously there (§5.8);
//   * it needs power to stay lit, and a dark pad cannot be travelled to (§5.10) — which is the one
//     real reason to keep a base's grid up;
//   * there may be one per base claim, not one per player (§5.9), so a second base gets a second.
//
// `js/buildplan.js` places the pad and owns the claim; this file only decides whether you may
// travel to it. Keeping the two apart is what stops "can I go there?" from needing to know
// anything about foundations.

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

/**
 * Where a town's notice board stands.
 *
 * Opposite the waypoint pad across the square, so the two things you go to a town centre FOR are not
 * on top of each other. It is a real object with a real position because the alternative — which is
 * what shipped first — was to treat the whole settlement as the board: "E to read billboard" followed
 * you around the entire town, over every other thing you might have wanted to press E on.
 */
export function boardSpotFor(node, groundOk = null) {
  const size = node.size || 1;
  const out = 9 + size * 1.8;
  const base = { x: -out, z: out * 0.4 };
  if (!groundOk) return { x: node.wx + base.x, z: node.wz + base.z };
  for (const ring of [1, 1.45, 1.95, 2.5]) {
    for (const step of [0, 1, -1, 2, -2, 3, -3, 4]) {
      const a = (step / 8) * Math.PI * 2;
      const bx = (base.x * Math.cos(a) - base.z * Math.sin(a)) * ring;
      const bz = (base.x * Math.sin(a) + base.z * Math.cos(a)) * ring;
      const x = node.wx + bx, z = node.wz + bz;
      if (groundOk(x, z)) return { x, z };
    }
  }
  return { x: node.wx + base.x, z: node.wz + base.z };
}

/**
 * R16 — WHERE THE TOWN HALL IS.
 *
 *   "The towns big enough to support a population should support a Town Hall which you can
 *    interact with…"
 *
 * `BUILDING_INFO.hall` has `from: 3`, so every settlement of size three or more already has one
 * standing in it — as scenery, with an elder near it and nothing to press. This is the spot you
 * walk to, mirrored away from `boardSpotFor` above so the hall and the notice board are two
 * different places rather than one square with two prompts fighting over it.
 *
 * Returns null for a hamlet, because a hamlet has no hall and offering one would be a lie.
 */
export function hallSpotFor(node, groundOk = null) {
  const size = node.size || 1;
  if (size < 3) return null;
  const out = 6 + size * 1.2;
  const base = { x: out * 0.55, z: -out };
  if (!groundOk) return { x: node.wx + base.x, z: node.wz + base.z };
  for (const ring of [1, 1.4, 1.9, 2.4]) {
    for (const step of [0, 1, -1, 2, -2, 3, -3, 4]) {
      const a = (step / 8) * Math.PI * 2;
      const bx = (base.x * Math.cos(a) - base.z * Math.sin(a)) * ring;
      const bz = (base.x * Math.sin(a) + base.z * Math.cos(a)) * ring;
      const x = node.wx + bx, z = node.wz + bz;
      if (groundOk(x, z)) return { x, z };
    }
  }
  return { x: node.wx + base.x, z: node.wz + base.z };
}

export function createWaypoints({ settlements = [], seed = 1, groundOk = null, built = [] } = {}) {
  /** Lit pads, by settlement id. A `Set` because the only question ever asked is "is it lit?". */
  const lit = new Set();
  /** Where you were standing when you last travelled — the anchor a town portal would use. */
  let lastDeparture = null;
  /**
   * Pads the player raised (§5.5). Kept as a list rather than folded into `settlements` because a
   * base is not a settlement — it has no NPCs, no shop and no boundary to cross — and pretending
   * otherwise would have every town system in the game trying to populate it.
   */
  let builtPads = (built || []).map(p => ({ ...p }));

  /**
   * R17 — WHAT THE PLAYER HAS DECIDED ABOUT EACH PAD.
   *
   *   "Waypoints favorited on the map with a star do not show a star on the minimap. Can they have
   *    a toggle to show on the map, and show on the game world? That way you can uncheck those to
   *    keep them favorited but hide them from the map/world so they are not distracting."
   *
   * The pads themselves are a function of the seed — every settlement on the world has one, lit or
   * not — so none of this can live on a pad row: `townPads()` rebuilds them from scratch on every
   * call and would throw a star away a frame after it was set. It lives here, keyed by pad id, and
   * rides `toJSON()` with the lit set.
   *
   * Only the DELTAS are stored. A pad nobody has touched is not in the map at all, so a world with
   * sixty settlements costs nothing until you actually star one.
   */
  const marks = new Map();
  const markOf = id => marks.get(String(id)) || null;
  const markFor = id => {
    const key = String(id);
    if (!marks.has(key)) marks.set(key, { starred: false, showOnMap: true, showInWorld: true });
    return marks.get(key);
  };

  /**
   * ONLY TOWNS AND CITIES.
   *
   * "Only towns/cities should have this, but not 'hostile' landmarks like bandit camps." A waypoint
   * is somewhere safe you can always get back to; putting one in a camp you have to fight through
   * defeats the point of having one. Settlements are the only nodes offered here at all, and the
   * smallest hamlets are left out too — a network of every farmstead is not a network, it is a bus.
   */
  const eligible = node => !!node && (node.size || 1) >= 1;

  const townPads = () => settlements.filter(eligible).map(node => ({
    id: node.id,
    name: node.name,
    size: node.size || 1,
    node,
    ...padSpotFor(node, groundOk),
    lit: lit.has(node.id),
    kind: 'town',
  }));

  /**
   * A player pad reads exactly like a town pad to everything downstream — same fields, same shape,
   * same `lit` flag. The map, the journal and the travel screen never have to ask which kind it is;
   * the only place the difference shows up is `canTravel`, where an unpowered one is refused.
   */
  const playerPads = () => builtPads.map(p => ({
    id: p.id,
    name: p.name,
    size: 1,
    node: null,
    x: p.x, z: p.z,
    lit: p.powered !== false,
    kind: 'built',
    claim: p.claim ?? null,
    powered: p.powered !== false,
    faction: p.faction || null,       // §5.19 — the sigils light in your faction's colour
  }));

  /**
   * R17 — every pad carries what the player decided about it, so the map, the minimap and the
   * journal all read one row rather than each remembering to ask a second question.
   */
  const dress = pad => {
    const m = markOf(pad.id);
    return {
      ...pad,
      starred: !!m?.starred,
      showOnMap: m ? m.showOnMap !== false : true,
      showInWorld: m ? m.showInWorld !== false : true,
    };
  };

  const pads = () => [...townPads(), ...playerPads()].map(dress);

  return {
    /** Every pad in the world, lit or not — the map draws the unlit ones greyed. */
    list: pads,

    /** One pad by settlement id. */
    byId(id) { return pads().find(p => p.id === id) || null; },

    /** Is this one lit? A pad you built is lit while its grid is up, and dark the moment it is not. */
    isLit(id) {
      if (lit.has(id)) return true;
      const own = builtPads.find(p => p.id === id);
      return !!own && own.powered !== false;
    },

    /** How many are lit, for the journal line. */
    get count() { return lit.size + builtPads.filter(p => p.powered !== false).length; },

    /**
     * §5.5–5.9 — file a pad the player finished building.
     *
     * One per claim, refused with a sentence rather than silently ignored, because the materials
     * for a Waypoint Core are a genuine milestone (§5.6) and quietly eating one would be unforgivable.
     */
    addBuilt({ id, name, x, z, claim = null, powered = true, faction = null }) {
      if (!id) return { ok: false, why: 'That pad has no name.' };
      if (builtPads.some(p => p.id === id)) return { ok: false, why: 'That waypoint is already on the network.' };
      if (claim != null && builtPads.some(p => p.claim === claim)) {
        return { ok: false, why: 'This claim already has a waypoint. One per base.' };
      }
      const pad = { id, name: name || 'Your Waypoint', x, z, claim, powered: !!powered, faction };
      builtPads.push(pad);
      return { ok: true, pad: this.byId(id) };
    },

    /** §5.12 — the pad can be knocked down; the core survives, so this is not a deletion of the run. */
    removeBuilt(id) {
      const before = builtPads.length;
      builtPads = builtPads.filter(p => p.id !== id);
      return builtPads.length !== before;
    },

    /** §5.10 — the grid went down, or came back up. */
    setPowered(id, on) {
      const pad = builtPads.find(p => p.id === id);
      if (!pad) return false;
      pad.powered = !!on;
      return true;
    },

    /** Every pad you raised yourself, for the base overview and for §5.11's raid targeting. */
    builtList() { return playerPads().map(dress); },

    // ------------------------------------------------------ R17: starring and hiding a pad

    /** Favourite a pad, or stop. Legal on an unlit one — "I want to go there" is a fair thing to say. */
    star(id, on = null) {
      const m = markFor(id);
      m.starred = on == null ? !m.starred : !!on;
      return m.starred;
    },
    isStarred(id) { return !!markOf(id)?.starred; },

    /**
     * Show this pad on the map / in the world, or stop. `where` is the field name itself —
     * `showOnMap` or `showInWorld` — the same vocabulary js/markers.js uses, so a screen that can
     * toggle a marker can toggle a pad with the same line of code.
     */
    show(id, where, on = null) {
      if (where !== 'showOnMap' && where !== 'showInWorld') return false;
      const m = markFor(id);
      m[where] = on == null ? m[where] === false : !!on;
      return m[where];
    },
    shown(id, where) {
      const m = markOf(id);
      return m ? m[where] !== false : true;
    },

    /**
     * The pads the MINIMAP should draw, shaped like the marker rows it already understands.
     *
     * A starred pad is on it because starring something is a request to be shown it; a lit pad is
     * not, because every town you have ever walked into has one and sixty cyan rings would bury the
     * quest you are actually doing. `kind: 'waypoint'` borrows MARKER_LOOKS' glyph — see the note
     * on it in js/markers.js for why a pad is not a marker.
     */
    minimapPads() {
      return pads()
        .filter(p => p.starred && p.showOnMap)
        .map(p => ({
          id: p.id, kind: 'waypoint', name: p.name, x: p.x, z: p.z,
          starred: true, lit: p.lit, tracked: true,
        }));
    },

    /** …and the ones a beacon should stand over in the 3D world. */
    worldPads() { return pads().filter(p => p.starred && p.showInWorld); },

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
      /**
       * §5.10 — A DARK WAYPOINT CANNOT BE TRAVELLED TO.
       *
       * Said before "you have not been there", because for a pad you built yourself the honest
       * reason is never that you have not visited it. The sigils are what carry you; no power, no
       * sigils, and the answer has to point at the generator rather than at your travel history.
       */
      if (pad.kind === 'built' && !pad.powered) {
        return { ok: false, why: `The sigils at ${pad.name} are dark. Its grid is down.` };
      }
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

    /**
     * §5.17 — the journal's list of the network.
     *
     * `zoneFor(pad)` is supplied by the caller (`js/zones.js` knows the bands, `js/territory.js`
     * knows who holds the ground); this only decides the order and what a row looks like, so the
     * journal does not need to know that a pad can be a town or a base.
     */
    journal({ zoneFor = null } = {}) {
      return pads()
        .filter(p => p.lit)
        .map(p => ({
          id: p.id, name: p.name, kind: p.kind, x: p.x, z: p.z,
          ...(zoneFor ? zoneFor(p) : {}),
        }))
        .sort((a, b) => (a.minLevel ?? 0) - (b.minLevel ?? 0) || a.name.localeCompare(b.name));
    },

    /**
     * Part of the save: which pads are lit, where the portal would lead, and — §5.16 — the pads the
     * player built, which are the only part of the network that is not a function of the seed.
     */
    toJSON() {
      return {
        lit: [...lit], departure: lastDeparture, seed, built: builtPads.map(p => ({ ...p })),
        // R17 — only the pads the player actually touched, as [id, {starred, showOnMap, showInWorld}]
        marks: [...marks.entries()].map(([id, m]) => [id, { ...m }]),
      };
    },
    load(data) {
      if (!data) return;
      lit.clear();
      for (const id of data.lit || []) lit.add(id);
      lastDeparture = data.departure || null;
      builtPads = (data.built || []).map(p => ({ ...p }));
      marks.clear();
      for (const [id, m] of data.marks || []) {
        marks.set(String(id), {
          starred: !!m?.starred,
          // an absent switch reads as ON, the same rule js/markers.js `load()` follows
          showOnMap: m?.showOnMap !== false,
          showInWorld: m?.showInWorld !== false,
        });
      }
    },
  };
}
