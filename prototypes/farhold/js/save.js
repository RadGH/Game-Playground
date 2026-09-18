// Farhold — saving and loading, in the browser.
//
// The world is a pure function of its seed, so a save never stores the world. It stores the seed and
// what the player did to it: who they are, what they are carrying, where they are standing, what
// time it is and where their pins are. A save is a couple of kilobytes and loading one is instant,
// because the planet is rebuilt from the seed exactly as it was the first time.
//
//   const saves = createSaves();
//   saves.list();                       // [{ id, name, seed, level, updated }, …]
//   saves.write(slotId, snapshot());    // called on a timer and at the big moments
//   saves.read(id);

const KEY = 'farhold.saves.v1';
const LAST = 'farhold.lastSave';
const MAX_SLOTS = 8;

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};                                    // private window, blocked storage, corrupt JSON
  }
}

function writeAll(all) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;                                 // out of quota, or storage is off
  }
}

export function createSaves() {
  return {
    available() {
      try { localStorage.setItem('farhold.probe', '1'); localStorage.removeItem('farhold.probe'); return true; }
      catch { return false; }
    },

    /** Every save, newest first, as summaries for a menu. */
    list() {
      const all = readAll();
      return Object.values(all)
        .map(s => ({
          id: s.id, name: s.name, seed: s.seed, classId: s.classId,
          level: s.player?.level ?? 1, place: s.place || '',
          updated: s.updated || 0, playtime: s.playtime || 0,
        }))
        .sort((a, b) => b.updated - a.updated);
    },

    read(id) {
      const all = readAll();
      return all[id] || null;
    },

    /** Write a snapshot. Returns the id, or null when storage refused it. */
    write(snapshot) {
      if (!snapshot?.id) return null;
      const all = readAll();
      all[snapshot.id] = { ...snapshot, updated: Date.now() };
      // keep the newest slots only
      const ids = Object.values(all).sort((a, b) => (b.updated || 0) - (a.updated || 0)).map(s => s.id);
      for (const id of ids.slice(MAX_SLOTS)) delete all[id];
      if (!writeAll(all)) return null;
      try { localStorage.setItem(LAST, snapshot.id); } catch { /* ignore */ }
      return snapshot.id;
    },

    remove(id) {
      const all = readAll();
      delete all[id];
      writeAll(all);
    },

    /** The save this browser was last playing, for a Continue button. */
    lastId() {
      try { return localStorage.getItem(LAST); } catch { return null; }
    },

    newId() { return 'sv_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); },
  };
}

/**
 * Everything worth keeping about a run. Pass the live objects; get plain JSON back.
 * Items are already plain data from Emberveil's generator, so they travel as they are.
 */
export function snapshot({
  id, name, seed, classId, player, control, elapsed, playtime, markers, at, place, weather,
  materials, dungeonsCleared,
  // ---- these three were being PASSED and then dropped on the floor. See the note below.
  world, quests, campaign,
  // ---- The Territory expansion: who likes you, what you have knocked over, what you have heard
  standings, territory, rumours, waypoints,
  // where the player was last standing on the surface, for a save taken underground
  surface = null, inDungeon = false,
}) {
  return {
    id, name, seed, classId,
    version: 2,
    updated: Date.now(),
    playtime: Math.round(playtime || 0),
    place: place || '',
    elapsed: Math.round(elapsed || 0),
    weather: weather || null,
    player: {
      level: player.level, xp: player.xp, gold: player.gold,
      attrs: { ...player.attrs }, pendingAttr: player.pendingAttr,
      hp: player.hp, mp: player.mp,
      kills: player.kills, deaths: player.deaths,
      equipment: player.equipment, bag: player.bag,
      passiveRanks: player.passiveRanks, pendingPassive: player.pendingPassive,
      pendingTalent: player.pendingTalent, talents: player.talents,
      // unlockables rather than loot, so they travel with the character — see js/gear.js
      vehicles: player.vehicles,
    },
    position: { x: control.x, z: control.z, yaw: control.yaw, pitch: control.pitch },
    // Markers replaced the old bare `pins` array: a quest destination, a story objective and a
    // dropped pin are the same kind of thing now, and each carries the world it is on.
    markers: markers || null,
    /**
     * Which star and which world, not just which seed the run began from. Without this a load
     * rebuilt the STARTING system every time, so travelling several stars out and saving put you
     * back where you began — in the ocean, because the coordinates came along and the world did not.
     */
    at: at || null,
    // round 4: the materials bag and which dungeons you have already emptied
    materials: materials || {},
    dungeonsCleared: [...(dungeonsCleared || [])],

    /**
     * THE THREE FIELDS THAT WERE BEING THROWN AWAY.
     *
     * `snapshot` destructures a fixed list of arguments, and `world`, `quests` and `campaign` were
     * never added to it — so `main.js` passed all three on every save and none of them were written.
     * Three separate bugs came out of that one omission:
     *
     *   * `world` holds the title screen's knobs, `planetScale` among them. Without it a load fell
     *     back to re-reading the boot form, so a run played at Small reloaded at Full — and the
     *     player's position is stored in METRES, so the same numbers now pointed somewhere else on a
     *     world 1.8x wider. That is the "saved in a town, loaded into the Shallows surrounded by
     *     water" report: the town was at 89 km east on the world you played, which is open ocean on
     *     the world the loader built.
     *   * `quests` — every load silently emptied the quest log.
     *   * `campaign` — and forgot the story.
     */
    world: world || null,
    quests: quests || null,
    campaign: campaign || null,
    // which waypoint pads you have lit, per world — a network you had to walk to earn is not
    // something a reload should take back
    waypoints: waypoints || null,

    /**
     * A save taken underground is a save taken in a DIFFERENT coordinate space: a dungeon's terrain
     * is a local one a few hundred metres across, centred on the origin. Restoring those numbers on
     * to a 163 km planet put you within a few hundred metres of the map corner, which is ocean or
     * polar ice. So the surface spot the player dropped in from is saved too, and the loader puts
     * them back outside the door rather than inside a room that no longer exists.
     */
    inDungeon: !!inDungeon,
    surface: surface ? { x: surface.x, z: surface.z } : null,

    /**
     * The Territory. `territory` is only the DELTAS — a zone nobody has touched writes nothing at
     * all, so a hundred-zone world costs less here than one item does above.
     */
    standings: standings || null,
    territory: territory || null,
    rumours: rumours || null,
  };
}

/** Put a loaded save back into a live run. The caller has already built the world from the seed. */
export function restore(save, { rpg, player, control, map }) {
  const p = save.player || {};
  player.level = p.level ?? 1;
  player.xp = p.xp ?? 0;
  player.gold = p.gold ?? 0;
  player.attrs = { ...player.attrs, ...(p.attrs || {}) };
  player.pendingAttr = p.pendingAttr ?? 0;
  player.passiveRanks = p.passiveRanks || {};
  player.pendingPassive = p.pendingPassive ?? 0;
  player.pendingTalent = p.pendingTalent ?? 0;
  if (p.vehicles) player.vehicles = p.vehicles;
  player.talents = p.talents || [];
  player.kills = p.kills ?? 0;
  player.deaths = p.deaths ?? 0;
  player.equipment = p.equipment || {};
  player.bag = p.bag || [];
  rpg.refresh(player, { full: true });
  if (Number.isFinite(p.hp)) player.hp = Math.min(player.maxHp, p.hp);
  if (Number.isFinite(p.mp)) player.mp = Math.min(player.maxMp, p.mp);

  /**
   * PUT THEM BACK WHERE THEY WERE, AND CHECK IT IS DRY LAND.
   *
   * A save taken underground carries dungeon-local metres, and a save written by an older build
   * carries metres measured against a differently sized planet. Both come back as a plausible-looking
   * pair of numbers that `teleport` happily wraps into the sea, which is why the failure was silent.
   * So the restored spot is checked, and anything wrong falls back to the run's own spawn point —
   * the town the character started in, which is deterministic from the world seed.
   */
  const spot = save.inDungeon && save.surface ? save.surface : save.position;
  if (spot && Number.isFinite(spot.x) && Number.isFinite(spot.z)) {
    const terrain = control.terrain || null;
    const inRange = !terrain
      || (spot.z >= 0 && spot.z <= (terrain.depthM ?? Infinity) && spot.x >= 0 && spot.x <= (terrain.widthM ?? Infinity));
    const dry = !terrain?.waterAt || !terrain.waterAt(spot.x, spot.z);
    if (inRange && dry) control.teleport(spot.x, spot.z);
    else if (control.spawn) control.teleport(control.spawn.x, control.spawn.z);
    if (Number.isFinite(save.position?.yaw)) control.yaw = save.position.yaw;
    if (Number.isFinite(save.position?.pitch)) control.pitch = save.position.pitch;
  }
  // A save from before markers existed carries a plain `pins` array; turn each one into a pin
  // marker on the world being loaded so an old save does not lose them.
  if (map?.markers && Array.isArray(save.pins) && !save.markers) {
    for (const pin of save.pins) map.markers.drop(pin.x, pin.y, pin.name);
  }
  return save.elapsed || 0;
}

/** Was this save written before `world` was carried? Then its metres cannot be trusted. */
export function saveCarriesWorld(save) {
  return !!(save && save.world && Number.isFinite(Number(save.world.planetScale)));
}

/** "3h 12m" for a save list. */
export function playtimeText(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
