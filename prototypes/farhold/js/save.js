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
export function snapshot({ id, name, seed, classId, player, control, elapsed, playtime, markers, place, weather, materials, dungeonsCleared }) {
  return {
    id, name, seed, classId,
    version: 1,
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
    },
    position: { x: control.x, z: control.z, yaw: control.yaw, pitch: control.pitch },
    // Markers replaced the old bare `pins` array: a quest destination, a story objective and a
    // dropped pin are the same kind of thing now, and each carries the world it is on.
    markers: markers || null,
    // round 4: the materials bag and which dungeons you have already emptied
    materials: materials || {},
    dungeonsCleared: [...(dungeonsCleared || [])],
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
  player.talents = p.talents || [];
  player.kills = p.kills ?? 0;
  player.deaths = p.deaths ?? 0;
  player.equipment = p.equipment || {};
  player.bag = p.bag || [];
  rpg.refresh(player, { full: true });
  if (Number.isFinite(p.hp)) player.hp = Math.min(player.maxHp, p.hp);
  if (Number.isFinite(p.mp)) player.mp = Math.min(player.maxMp, p.mp);

  if (save.position) {
    control.teleport(save.position.x, save.position.z);
    if (Number.isFinite(save.position.yaw)) control.yaw = save.position.yaw;
    if (Number.isFinite(save.position.pitch)) control.pitch = save.position.pitch;
  }
  // A save from before markers existed carries a plain `pins` array; turn each one into a pin
  // marker on the world being loaded so an old save does not lose them.
  if (map?.markers && Array.isArray(save.pins) && !save.markers) {
    for (const pin of save.pins) map.markers.drop(pin.x, pin.y, pin.name);
  }
  return save.elapsed || 0;
}

/** "3h 12m" for a save list. */
export function playtimeText(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
