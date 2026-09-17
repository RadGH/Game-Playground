// Farhold — everything the player is keeping an eye on, in one place.
//
// The ask: *"I got a mission 'Carry word to Haileadhearth'. These type of quests/landmarks/pins
// should be displayed on the map and minimap. If it's too far to display on the minimap, an arrow
// indicating its direction should show instead. You should be able to track or untrack quests, pins
// etc. to toggle this behaviour. It should also work on a planet scale, so if you have a marker on
// a planet it should have an indicator in space mode and in space maps."*
//
// Before this there were two unrelated things: a `pins` array owned by the map screen, and quest
// destinations that were copied into it once when the job was accepted and then forgotten. Nothing
// knew which world a pin was on, so flying somewhere else left the old world's pins scattered over
// the new one's map.
//
// So: ONE book of markers. Each one carries the world it belongs to, so a marker follows its planet
// rather than the player; each one can be tracked or untracked; and the three screens that draw
// them (world map, minimap, space) all ask this module rather than keeping their own list.
//
//   const book = new MarkerBook();
//   book.setWorld({ systemSeed: 1, planetId: 3, planetName: 'Hes-Subud IV' });
//   book.drop(cellX, cellY, 'Old mine');            // a pin the player placed
//   book.syncQuests(questLog.active);               // quest destinations, kept in step
//   book.here();                                    // the ones on THIS world
//   book.tracked();                                 // …that are being tracked
//   book.bearing(marker, player);                   // { distance, angle, ahead }
//
// Pure JavaScript: no DOM, no Three.js, so the node tests drive the same code the game does.

import { M_PER_CELL } from './planet.js';

/** How a marker is drawn, everywhere. One table so the map, the minimap and space agree. */
export const MARKER_LOOKS = {
  quest:    { icon: '!', color: '#ffd24a', label: 'Quest' },
  campaign: { icon: '◆', color: '#ff9f4a', label: 'Story' },
  pin:      { icon: '◈', color: '#7fd4ff', label: 'Pin' },
  home:     { icon: '⌂', color: '#9ae06a', label: 'Home' },
};

export const MARKER_KINDS = Object.keys(MARKER_LOOKS);

/** A stable key for a world. Planet ids restart at 0 in every system, so the seed has to be in it. */
export function worldKey({ systemSeed = 0, planetId = 0 } = {}) {
  return `${systemSeed}:${planetId}`;
}

export class MarkerBook {
  constructor(saved = null) {
    /** @type {Array<object>} every marker on every world visited this run */
    this.markers = [];
    /** The world the player is standing on, so `here()` knows what to filter by. */
    this.world = { systemSeed: 0, planetId: 0, planetName: '', starName: '' };
    this.nextId = 1;
    if (saved) this.load(saved);
  }

  // ---------------------------------------------------------------- the world we are on

  setWorld(world = {}) {
    this.world = { ...this.world, ...world };
    return this.world;
  }

  get key() { return worldKey(this.world); }

  // ---------------------------------------------------------------- adding and removing

  /**
   * Add a marker. `cell` is in map cells; world metres are derived, because the map screen thinks
   * in cells and the minimap thinks in metres and neither should have to convert.
   */
  add({ kind = 'pin', name = '', cellX = 0, cellY = 0, tracked = true, questId = null, world = null } = {}) {
    const on = world ? { ...this.world, ...world } : this.world;
    const marker = {
      id: `m${this.nextId++}`,
      kind, name: name || MARKER_LOOKS[kind]?.label || 'Marker',
      questId,
      systemSeed: on.systemSeed, planetId: on.planetId,
      planetName: on.planetName, starName: on.starName,
      cell: { x: Math.round(cellX), y: Math.round(cellY) },
      tracked: !!tracked,
    };
    this.markers.push(marker);
    return marker;
  }

  /** A pin the player dropped by shift-clicking the map. */
  drop(cellX, cellY, name = null) {
    const n = this.markers.filter(m => m.kind === 'pin').length + 1;
    return this.add({ kind: 'pin', name: name || `Pin ${n}`, cellX, cellY });
  }

  remove(marker) {
    const i = this.markers.indexOf(marker);
    if (i >= 0) this.markers.splice(i, 1);
    return i >= 0;
  }

  /** Track or untrack. Untracked markers still show on the world map, just not on the minimap. */
  toggle(marker, on = !marker.tracked) {
    marker.tracked = !!on;
    return marker.tracked;
  }

  // ---------------------------------------------------------------- quests keep themselves in step

  /**
   * Mirror the quest log's destinations into the book: one marker per active quest that has a
   * place, removed again when the quest is turned in. Called every so often rather than only on
   * accept, so a quest picked up from a save still gets its marker.
   */
  syncQuests(active = []) {
    const live = new Set();
    for (const q of active) {
      if (!q.place?.cell) continue;
      live.add(q.id);
      const had = this.markers.find(m => m.questId === q.id);
      if (had) {
        had.name = q.title;
        had.done = !!q.done;
        continue;
      }
      const m = this.add({
        kind: 'quest', name: q.title, questId: q.id,
        cellX: q.place.cell.x, cellY: q.place.cell.y,
      });
      m.done = !!q.done;
    }
    // drop the markers of quests that are no longer in the log
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      if (m.questId && !live.has(m.questId)) this.markers.splice(i, 1);
    }
    return this.here();
  }

  // ---------------------------------------------------------------- reading

  /** Markers on the world the player is standing on. */
  here() {
    const key = this.key;
    return this.markers.filter(m => worldKey(m) === key);
  }

  /** …and of those, the ones being tracked, which is what the minimap draws. */
  tracked() {
    return this.here().filter(m => m.tracked);
  }

  /** Markers somewhere OTHER than here, grouped by world — what space mode puts a ring around. */
  elsewhere() {
    const key = this.key;
    const byWorld = new Map();
    for (const m of this.markers) {
      const k = worldKey(m);
      if (k === key) continue;
      if (!byWorld.has(k)) {
        byWorld.set(k, {
          key: k, systemSeed: m.systemSeed, planetId: m.planetId,
          planetName: m.planetName, starName: m.starName, markers: [], tracked: 0,
        });
      }
      const group = byWorld.get(k);
      group.markers.push(m);
      if (m.tracked) group.tracked++;
    }
    return [...byWorld.values()];
  }

  /** Every marker in a given system, for the galaxy map's system view. */
  inSystem(systemSeed) {
    return this.markers.filter(m => m.systemSeed === systemSeed);
  }

  /** The systems that hold anything at all, for the galaxy map's wider zoom levels. */
  systems() {
    const out = new Map();
    for (const m of this.markers) {
      if (!out.has(m.systemSeed)) out.set(m.systemSeed, { systemSeed: m.systemSeed, starName: m.starName, count: 0, tracked: 0 });
      const s = out.get(m.systemSeed);
      s.count++;
      if (m.tracked) s.tracked++;
    }
    return [...out.values()];
  }

  // ---------------------------------------------------------------- where is it from here

  /** World metres of a marker. */
  static position(marker) {
    return { x: (marker.cell.x + 0.5) * M_PER_CELL, z: (marker.cell.y + 0.5) * M_PER_CELL };
  }

  /**
   * How far and in which direction, from the player, taking the east-west wrap into account — the
   * map is a sphere unrolled, so a marker on the far left may be a short walk west, not a long walk
   * east. `angle` is the screen-space rotation the minimap arrow needs: 0 is straight up (ahead).
   */
  bearing(marker, player, terrain = null) {
    const p = MarkerBook.position(marker);
    let dx = p.x - player.x;
    const dz = p.z - player.z;
    if (terrain?.widthM) {
      // take the shorter way round the world
      const w = terrain.widthM;
      if (dx > w / 2) dx -= w;
      if (dx < -w / 2) dx += w;
    }
    const distance = Math.hypot(dx, dz);
    // the world's +z is the map's "down"; the player's facing is (sin yaw, cos yaw)
    const world = Math.atan2(dx, dz);
    const angle = world - (player.yaw ?? 0);
    return { x: p.x, z: p.z, dx, dz, distance, world, angle, ahead: Math.abs(wrapPi(angle)) < 0.6 };
  }

  // ---------------------------------------------------------------- saving

  toJSON() {
    return { markers: this.markers, nextId: this.nextId, world: this.world };
  }

  load(saved) {
    if (!saved) return this;
    this.markers = Array.isArray(saved.markers) ? saved.markers.slice() : [];
    this.nextId = saved.nextId || this.markers.length + 1;
    if (saved.world) this.world = { ...this.world, ...saved.world };
    return this;
  }
}

/** Fold an angle into −π…π. */
export function wrapPi(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/** "2.4 km" / "310 m" — the one place distances to a marker are worded. */
export function distanceText(metres) {
  if (!Number.isFinite(metres)) return '';
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
}
