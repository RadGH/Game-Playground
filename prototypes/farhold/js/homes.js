// Farhold — every base you ever raised, and how to get back to it from anywhere.
//
// "It should be easy to teleport back to your bases even if you go to a different star system."
//
// js/waypoints.js is PER WORLD, and rightly so: it is built from the settlements of the planet you
// are standing on, and it is thrown away and rebuilt the moment you land somewhere else. That is
// correct for towns — a town on another planet is not somewhere you can walk to — but it is wrong
// for a base. A base is the one thing in the game the player made with their own hands, and having
// it silently cease to exist because they flew to the next star is the worst thing this system
// could do.
//
// So the register lives out here, above the world, above the system, beside the character: it is
// saved with the player, not with the planet. When you land, `forWorld()` hands the per-world
// network back the pads that belong to THIS world, and everything downstream carries on not
// knowing that a base can be anywhere.
//
//   import { createHomes } from './homes.js';
//   const homes = createHomes(save?.homes);
//   homes.add({ id, name, x, z, starId, systemSeed, planetId, planetName, starName, claim });
//   homes.forWorld({ systemSeed, planetId })   // -> pads for createWaypoints({ built })
//   homes.routeTo(id, here)                    // -> { step: 'here' | 'land' | 'jump', ... }
//
// No Three.js and no DOM, so `node --test` can check the whole thing.

/**
 * Where a base is, said in full.
 *
 * A base needs FOUR numbers to be found again, not two. `x` and `z` place it on a surface; the
 * planet says which surface; the system says which sky that planet is under. Leaving any of them
 * out works right up until the player builds a second base at similar coordinates on a different
 * world, which — since every world uses the same metre grid and the same map size — is not a rare
 * accident but the expected case.
 */
function normalise(entry) {
  return {
    id: String(entry.id),
    name: entry.name || 'Your base',
    x: Number(entry.x) || 0,
    z: Number(entry.z) || 0,
    /** Which star. `starId` is the chart's handle; `systemSeed` is what actually rebuilds it. */
    starId: entry.starId ?? null,
    systemSeed: entry.systemSeed ?? null,
    starName: entry.starName || '',
    /** Which world in that system, and what it is called, so a list can be read without loading it. */
    planetId: entry.planetId ?? null,
    planetName: entry.planetName || '',
    /** The build claim this pad belongs to, so a base can only ever raise one. */
    claim: entry.claim ?? null,
    /** A dark grid is a dark pad — §5.10. Kept here too so the list can say so before you fly. */
    powered: entry.powered !== false,
    faction: entry.faction || null,
    /** When it went up, so the list can be oldest-first and a save can be read by a human. */
    founded: entry.founded ?? null,
  };
}

/** Two places are the same world when both halves match. A null never matches a null. */
function sameWorld(a, b) {
  if (a == null || b == null) return false;
  return a.systemSeed != null && b.systemSeed != null
    && String(a.systemSeed) === String(b.systemSeed)
    && a.planetId != null && b.planetId != null
    && String(a.planetId) === String(b.planetId);
}

export function createHomes(saved = null) {
  /** Every base, in the order they were founded. */
  let list = [];
  if (saved) load(saved);

  function load(data) {
    const rows = Array.isArray(data) ? data : (data?.bases || []);
    list = rows.map(normalise);
  }

  return {
    /** Everything, newest last — the order they were built is the order they mean something in. */
    all() { return list.map(b => ({ ...b })); },
    get count() { return list.length; },

    byId(id) {
      const found = list.find(b => b.id === String(id));
      return found ? { ...found } : null;
    },

    /**
     * File a base. Refused with a sentence, never silently, because the Waypoint Core that pays for
     * this is a genuine milestone and quietly eating one would be unforgivable.
     */
    add(entry) {
      if (!entry?.id) return { ok: false, why: 'That base has no name.' };
      const row = normalise(entry);
      if (list.some(b => b.id === row.id)) return { ok: false, why: 'That waypoint is already on the network.' };
      if (row.claim != null && list.some(b => b.claim === row.claim && sameWorld(b, row))) {
        return { ok: false, why: 'This claim already has a waypoint. One per base.' };
      }
      list.push(row);
      return { ok: true, base: { ...row } };
    },

    /** Knocked down. The core survives (§5.12), so this is not the end of the run. */
    remove(id) {
      const before = list.length;
      list = list.filter(b => b.id !== String(id));
      return list.length !== before;
    },

    /** The grid went down, or came back up. */
    setPowered(id, on) {
      const row = list.find(b => b.id === String(id));
      if (!row) return false;
      row.powered = !!on;
      return true;
    },

    rename(id, name) {
      const row = list.find(b => b.id === String(id));
      if (!row || !name) return false;
      row.name = name;
      return true;
    },

    /**
     * The pads on THIS world, shaped the way `createWaypoints({ built })` wants them.
     *
     * This is the whole join between the register and the per-world network: land, ask for your
     * pads, hand them over, and the map, the travel screen and the journal all behave as if the
     * base had been part of this planet from the beginning.
     */
    forWorld(where) {
      return list
        .filter(b => sameWorld(b, where))
        .map(b => ({ id: b.id, name: b.name, x: b.x, z: b.z, claim: b.claim, powered: b.powered, faction: b.faction }));
    },

    /** Bases anywhere else, for the star chart's "you have somewhere to be" list. */
    elsewhere(where) {
      return list.filter(b => !sameWorld(b, where)).map(b => ({ ...b }));
    },

    /**
     * HOW DO I GET HOME FROM HERE.
     *
     * Three answers, and the caller does one thing for each:
     *
     *   'here'  — same world. The waypoint network already covers this; travel to the pad.
     *   'land'  — same system, different world. Fly down to that planet, then the pad.
     *   'jump'  — another star. Fold to it first, then land, then the pad.
     *
     * Returned as a step with everything the caller needs to take it, rather than as a boolean,
     * because "you cannot get there from here" is never the honest answer for a place the player
     * built: there is always a route, it is only ever a question of how many legs it has.
     */
    routeTo(id, here = {}) {
      const base = this.byId(id);
      if (!base) return { ok: false, why: 'You have no base by that name.' };
      if (!base.powered) return { ok: false, why: `The sigils at ${base.name} are dark. Its grid is down.` };

      if (sameWorld(base, here)) {
        return { ok: true, step: 'here', base, legs: 1, why: `${base.name} is on this world.` };
      }
      const sameStar = base.systemSeed != null && here.systemSeed != null
        && String(base.systemSeed) === String(here.systemSeed);
      if (sameStar) {
        return {
          ok: true, step: 'land', base, legs: 2,
          planetId: base.planetId,
          why: `${base.name} is on ${base.planetName || 'another world'}, in this system.`,
        };
      }
      return {
        ok: true, step: 'jump', base, legs: 3,
        starId: base.starId, systemSeed: base.systemSeed, planetId: base.planetId,
        why: `${base.name} is in ${base.starName || 'another system'}. The drive has to spin up first.`,
      };
    },

    /**
     * The list a screen draws: every base with its route from where you are standing, nearest first.
     *
     * Sorted by how many legs the trip takes rather than by distance, because a base on this world
     * is always a better answer than one four hundred light years away however far across the map
     * it happens to be.
     */
    overview(here = {}) {
      return list
        .map(b => {
          const route = this.routeTo(b.id, here);
          const away = sameWorld(b, here) && here.x != null
            ? Math.hypot(b.x - here.x, b.z - here.z)
            : null;
          return { ...b, step: route.step || null, legs: route.legs ?? 99, reason: route.why, ok: route.ok, away };
        })
        .sort((a, b) => a.legs - b.legs || (a.away ?? Infinity) - (b.away ?? Infinity) || a.name.localeCompare(b.name));
    },

    toJSON() { return { bases: list.map(b => ({ ...b })) }; },
    load,
  };
}
