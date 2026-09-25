// Farhold — the town portal. One of them, ever.
//
// The rule in one paragraph, from `BUILDING_EXPANSION.md` §6:
//
//   > When you travel to a waypoint, a portal opens AT that waypoint, leading back to exactly where
//   > you were standing when you left. Step through it and you are returned. Opening a new portal
//   > closes any existing one, so there is never more than one open and never any ambiguity about
//   > where it goes.
//
// That last clause is the entire design. Every other quality-of-life fast-travel system in every
// game this borrows from gets complicated the moment two portals exist, because then the player has
// to be told which is which and the UI has to carry a list. One portal needs no list, no naming, no
// management screen and no map legend — it is either open or it is not, and the journal line says
// where it goes.
//
// **No expiry.** §6.9 recommends it and it is worth restating why: a portal with a clock on it
// makes the player rush, and rushing is the opposite of what a convenience feature is for. It stays
// until a new one replaces it, until the player uses it and chooses to close it, or until its
// anchor stops being a real place (§6.10 — you left the planet).
//
// This file is pure book-keeping — no Three.js, no scene, no geometry — so `node --test` can check
// the two rules that matter: exactly one exists, and it survives a save.
//
//   import { createPortals } from './portal.js';
//   const portals = createPortals({ saved: save.portal });
//   portals.open({ anchor, exit });        // on waypoint travel
//   portals.use('exit');                   // walking into the ring at the pad end
//   save.portal = portals.toJSON();

import { worldKey } from './markers.js';

/** The two ends. `exit` is the ring standing on the waypoint pad; `anchor` is where you left from. */
export const ENDS = ['exit', 'anchor'];

/** How close you have to be to a ring before `E` offers it. A pad is 7 m across. */
export const REACH = 3.2;

/**
 * §6.18 — never open inside geometry.
 *
 * Walk outward in a spiral from the wanted spot until `ok(x, z)` agrees, then give up and take the
 * original. A portal a couple of metres off is a shrug; a portal that refuses to exist strands the
 * player in a dungeon, which is the single worst thing this feature could do.
 */
export function nudgeTo(x, z, ok = null, { step = 1.2, rings = 5 } = {}) {
  if (!ok || ok(x, z)) return { x, z, nudged: false };
  for (let r = 1; r <= rings; r++) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = x + Math.cos(a) * step * r, pz = z + Math.sin(a) * step * r;
      if (ok(px, pz)) return { x: px, z: pz, nudged: true };
    }
  }
  return { x, z, nudged: false };
}

/** Is a saved anchor still a place on the world the player is standing on? */
function sameWorld(a, b) {
  if (!a || !b) return false;
  return worldKey(a) === worldKey(b);
}

export function createPortals({ saved = null, spotOk = null } = {}) {
  /**
   * THE WHOLE STATE OF THE FEATURE IS ONE VARIABLE.
   *
   * Not an array with a length check, not a map keyed by id — one slot. "Exactly one exists at a
   * time" is then true because there is nowhere for a second one to be, rather than true because
   * some code remembered to close the old one. The test can still fail if `open` forgets to report
   * the closure, so it checks both.
   */
  let portal = null;
  /** Just for the log line and the journal: how many have been opened this run. */
  let opened = 0;

  function describe(end) {
    if (!end) return 'somewhere';
    if (end.place) return end.place;
    if (end.name) return end.name;
    return 'the open road';
  }

  const api = {
    /** The one portal, or null. */
    get portal() { return portal; },
    get isOpen() { return !!portal; },
    get openedCount() { return opened; },

    /**
     * §6.12 — may one be opened right now?
     *
     * Boss fights only. Ordinary combat already blocks waypoint travel itself (`js/waypoints.js`
     * `canTravel`), so this is the case where the portal is opened by something other than travel —
     * a scroll — and a scroll that lets you walk out of a boss room makes every boss optional.
     */
    canOpen({ boss = false } = {}) {
      if (boss) return { ok: false, why: 'Not in here. Whatever is in this room is not finished with you.' };
      return { ok: true };
    },

    /**
     * Open one. `anchor` is where the player left from; `exit` is the waypoint pad they arrived on.
     *
     * Returns the new portal AND the one it closed, so the caller can say both in a single line:
     * "A portal opens on the sigils, back to the Sunken Vault. The one at Hollowcrown closes."
     */
    open({ anchor, exit, boss = false } = {}) {
      const allowed = api.canOpen({ boss });
      if (!allowed.ok) return { ok: false, why: allowed.why };
      if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.z)) {
        return { ok: false, why: 'There is nowhere to anchor it.' };
      }
      const closed = portal;
      const spot = nudgeTo(exit?.x ?? anchor.x, exit?.z ?? anchor.z, spotOk);
      portal = {
        id: 'pt' + (++opened),
        openedAt: Date.now(),
        anchor: {
          x: anchor.x, z: anchor.z,
          world: anchor.world || null,
          place: anchor.place || null,
          inDungeon: !!anchor.inDungeon,
          dungeon: anchor.dungeon || null,
        },
        exit: {
          x: spot.x, z: spot.z,
          world: exit?.world || anchor.world || null,
          padId: exit?.padId ?? null,
          place: exit?.place || exit?.name || null,
        },
      };
      return { ok: true, portal, closed };
    },

    /**
     * §6.17 — the scroll: opens a portal WHERE YOU STAND, back to your last waypoint.
     *
     * The classic, and the reverse of the automatic one: the same single-portal rule, the same two
     * ends, only the direction of travel that made it is different. It is deliberately the same code
     * path, because two nearly-identical portal systems is exactly how you end up with two portals.
     */
    openScroll({ at, pad, boss = false } = {}) {
      if (!pad) return { ok: false, why: 'You have not lit a waypoint to return to.' };
      return api.open({
        anchor: { x: at.x, z: at.z, world: at.world, place: at.place, inDungeon: at.inDungeon, dungeon: at.dungeon },
        exit: { x: pad.x, z: pad.z, world: pad.world || at.world, padId: pad.id, place: pad.name },
        boss,
      });
    },

    /**
     * Step through. `end` is the ring you walked into; you come out of the other one.
     *
     * §6.6 — two-way while open, and §6.7 — it does NOT close on use. Walking home for an anvil and
     * walking back is the whole point of the feature; closing behind you turns it into a one-way
     * escape hatch and halves what it is worth.
     */
    use(end = 'exit', { close = false } = {}) {
      if (!portal) return { ok: false, why: 'There is no portal open.' };
      if (!ENDS.includes(end)) return { ok: false, why: 'That is not one of its ends.' };
      const to = end === 'exit' ? portal.anchor : portal.exit;
      const used = portal;
      if (close) portal = null;
      return { ok: true, to, portal: used, closed: close };
    },

    /** Which end, if either, the player is standing in. */
    endAt(x, z, world = null, reach = REACH) {
      if (!portal) return null;
      for (const end of ENDS) {
        const side = portal[end];
        if (world && side.world && !sameWorld(side.world, world)) continue;
        if (Math.hypot(side.x - x, side.z - z) <= reach) return end;
      }
      return null;
    },

    close(why = null) {
      if (!portal) return null;
      const gone = portal;
      portal = null;
      return { portal: gone, why };
    },

    /**
     * §6.10 — close it if the anchor is not a real place any more, and SAY SO.
     *
     * The two cases that actually happen: you flew to another world, and the dungeon you anchored
     * inside was left (its local coordinate space is gone the moment the door shuts — `js/save.js`
     * has the same problem with a save taken underground and solves it the same way). Silence here
     * would mean a player walking into a ring and arriving in the sea.
     */
    check({ world = null, dungeon = undefined } = {}) {
      if (!portal) return null;
      if (world && portal.anchor.world && !sameWorld(portal.anchor.world, world)) {
        return api.close(`The portal to ${describe(portal.anchor)} closes — it led to another world.`);
      }
      if (portal.anchor.inDungeon && dungeon !== undefined && portal.anchor.dungeon !== (dungeon || null)) {
        return api.close(`The portal to ${describe(portal.anchor)} closes — the way in has gone.`);
      }
      return null;
    },

    /** §6.19 — "Portal: the Sunken Vault, level 3." */
    journalLine() {
      if (!portal) return 'No portal is open.';
      return `Portal: ${describe(portal.exit)} → ${describe(portal.anchor)}.`;
    },

    /** §6.8 — both ends on the map and the minimap, as markers the map already knows how to draw. */
    mapMarkers() {
      if (!portal) return [];
      return ENDS.map(end => ({
        kind: 'portal', end,
        x: portal[end].x, z: portal[end].z,
        world: portal[end].world,
        name: end === 'exit' ? `Portal to ${describe(portal.anchor)}` : `Portal to ${describe(portal.exit)}`,
      }));
    },

    /** §6.11 — a portal that does not survive a reload is useless. */
    toJSON() { return portal ? { v: 1, opened, portal } : { v: 1, opened, portal: null }; },

    load(data) {
      portal = data?.portal || null;
      opened = data?.opened || (portal ? 1 : 0);
      return portal;
    },
  };

  if (saved) api.load(saved);
  return api;
}
