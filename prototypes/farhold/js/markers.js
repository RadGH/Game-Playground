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
  /**
   * A deposit the scanner turned up. Its own kind rather than a plain pin, because the map wants to
   * be able to say "these five are ore and that one is a quest" at a glance, and because a sweep can
   * drop several at once and they should not drown out the pins the player placed by hand.
   */
  seam:     { icon: '◆', color: '#c08a3e', label: 'Deposit' },
  home:     { icon: '⌂', color: '#9ae06a', label: 'Home' },
  /**
   * R14 — WHERE THE SKY FELL.
   *
   * "I could not tell where the meteor landed however, so it should have its own map marker."
   *
   * A meteor was drawn only while it was still in the air (`meteors.marks()`, which empties the
   * moment it lands), so the one instant you actually needed to know where it came down was the
   * instant the game stopped telling you. This marker is dropped when the fall STARTS — thirty
   * seconds of warning you can walk on — and stays until the crate is opened.
   */
  fall:     { icon: '☄', color: '#ff8a40', label: 'Impact' },
  /**
   * R14 — A PLACE YOU DECIDED TO REMEMBER.
   *
   *   "Add the ability to store locations and view them in a list, with a checkbox to toggle
   *    whether the location is highlighted on the map with a star."
   *
   * Its own kind rather than a `pin`, because the two are different promises: a pin is the quick
   * one you drop while reading the map and throw away again, and a saved place is the clay bank you
   * want to be able to find in an hour's time. The star is `starred`, which every kind carries —
   * starring the quest you are actually doing is a reasonable thing to want.
   */
  saved:    { icon: '✦', color: '#8fe0a0', label: 'Saved' },
  /**
   * R17 — AN OUTPOST PUTS ITSELF ON THE MAP.
   *
   *   "The outpost marker should put a waypoint on the world and map too. This one should not be
   *    removable unless you destroy the building, but can also be hidden from displaying. The
   *    marker should also let you rename the location which can appear on the map too."
   *
   * Its own kind rather than a `saved` place, because the promise is different in both directions:
   * you did not choose to put it there (raising the buildings did), and you cannot throw it away
   * (knocking the buildings down does). `locked` below is what carries that second half.
   */
  outpost:  { icon: '⚑', color: '#9fd8a0', label: 'Outpost' },
  /**
   * R17 — a waypoint pad, for the screens that draw marker rows.
   *
   *   "Waypoints favorited on the map with a star do not show a star on the minimap."
   *
   * A pad is NOT a marker — it is a row in the travel network (`js/waypoints.js`), which is a
   * function of the world's settlements plus the ones you built, and filing a copy of each one in
   * this book would be a second list to keep in step for no gain. But the minimap draws marker rows
   * and nothing else, so the pads need a look here to be drawable at all. Nothing ever calls
   * `add({ kind: 'waypoint' })`; `waypoints.minimapPads()` borrows the glyph.
   */
  waypoint: { icon: '◉', color: '#7fe8ff', label: 'Waypoint' },
};

export const MARKER_KINDS = Object.keys(MARKER_LOOKS);

/**
 * R17 — THE TWO SWITCHES EVERY MARKER CARRIES.
 *
 *   "Can they have a toggle to show on the map, and show on the game world? That way you can
 *    uncheck those to keep them favorited but hide them from the map/world so they are not
 *    distracting."
 *
 * They are deliberately two independent booleans rather than one "hidden" flag, because the two
 * screens are used for different things: a clay bank you want on the big map while you plan a route
 * is exactly the thing you do NOT want a floating beacon over while you are fighting next to it.
 *
 * Both default to ON, and both default to ON for a marker loaded out of a save written before this
 * round — see `load()`. An `undefined` flag must never read as "hidden", or one patch would blank
 * every marker in every existing run.
 */
export const MARKER_VIEWS = ['showOnMap', 'showInWorld'];

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
  add({ kind = 'pin', name = '', cellX = 0, cellY = 0, tracked = true, questId = null, world = null,
    showOnMap = true, showInWorld = true, locked = false, from = null } = {}) {
    const on = world ? { ...this.world, ...world } : this.world;
    const marker = {
      id: `m${this.nextId++}`,
      kind, name: name || MARKER_LOOKS[kind]?.label || 'Marker',
      questId,
      systemSeed: on.systemSeed, planetId: on.planetId,
      planetName: on.planetName, starName: on.starName,
      cell: { x: Math.round(cellX), y: Math.round(cellY) },
      tracked: !!tracked,
      // R17 — the two switches, and the padlock. See MARKER_VIEWS above.
      showOnMap: showOnMap !== false,
      showInWorld: showInWorld !== false,
      locked: !!locked,
    };
    if (from) marker.from = from;
    this.markers.push(marker);
    return marker;
  }

  /**
   * R14 — KEEP A PLACE.
   *
   * De-duplicates on the cell: saving the same ford from the map and then again off a quest row
   * should give you one row, renamed, not two. Returns the marker either way.
   *
   * `from` records where it came from — `{ type: 'quest'|'scan'|'place'|'pin'|'journal', id, label }`
   * — and its id field is deliberately NOT called `questId`: `syncQuests` below deletes any marker
   * whose `questId` has left the live log, so a place saved off a quest would be swept away at the
   * exact moment you handed the quest in, which is when you most want to remember where it was.
   */
  save({ cellX = 0, cellY = 0, name = '', note = '', from = null, starred = true, tracked = false } = {}) {
    const cx = Math.round(cellX), cy = Math.round(cellY);
    /**
     * R17 — ONE PLACE, ONE MARKER, WHATEVER PUT IT THERE.
     *
     *   "the markers for ore is confusing. It shows a star icon to the top-left and a green circle
     *    to the bottom-right. It is not clear which of these is the actual location of the ore."
     *
     * Half of that was the drawing (the star was painted a marker-and-a-half up and to the left of
     * the dot it belonged to — see `js/map.js`), and half was this: a deposit could carry a `seam`
     * marker from the scanner AND a `saved` marker from the Keep button, one cell apart, because
     * the de-duplication only ever looked at `kind === 'saved'`. Two rows, two icons, one hole in
     * the ground.
     *
     * So favouriting a place that already has a marker on it now STARS THE MARKER THAT IS THERE,
     * whatever kind it is, and only invents a `saved` one when the ground is genuinely bare. A
     * starred seam is still a seam — it stays in the Find tab's tracked list — it is simply also in
     * Favorites, which is exactly what the user asked for.
     */
    const ABSORB = new Set(['saved', 'seam', 'pin']);
    const had = this.here().find(m => ABSORB.has(m.kind) && Math.abs(m.cell.x - cx) <= 1 && Math.abs(m.cell.y - cy) <= 1);
    if (had) {
      if (name) had.name = name;
      if (note) had.note = note;
      if (from) had.from = from;
      had.starred = !!starred;
      return had;
    }
    const n = this.markers.filter(m => m.kind === 'saved').length + 1;
    const marker = this.add({ kind: 'saved', name: name || `Place ${n}`, cellX: cx, cellY: cy, tracked });
    marker.starred = !!starred;
    marker.note = note || '';
    marker.from = from || { type: 'pin' };
    marker.madeAt = Date.now();
    return marker;
  }

  /** The checkbox: highlight this one on the world map, or stop. Legal on any kind. */
  star(marker, on = !marker.starred) {
    if (!marker) return false;
    marker.starred = !!on;
    return marker.starred;
  }

  /** Everything starred on this world — the **Favorites** group, and what the map gilds. */
  starred() { return this.here().filter(m => m.starred); }

  /** The saved places on this world, newest last, for the map's own list. */
  saved() { return this.here().filter(m => m.kind === 'saved'); }

  /** A pin the player dropped by shift-clicking the map. */
  drop(cellX, cellY, name = null) {
    const n = this.markers.filter(m => m.kind === 'pin').length + 1;
    return this.add({ kind: 'pin', name: name || `Pin ${n}`, cellX, cellY });
  }

  /**
   * R17 — SOME MARKERS ARE NOT YOURS TO THROW AWAY.
   *
   *   "This one should not be removable unless you destroy the building, but can also be hidden
   *    from displaying."
   *
   * An outpost's marker is a statement about what is standing on the ground, so a delete button on
   * it would be a lie: press it and the next sync puts the marker straight back. `locked` is
   * therefore enforced HERE, in the one place a marker can leave the book, rather than by hiding the
   * button — a hidden button is a rule nothing checks.
   *
   * `force` is for the code that owns the lock (js/outposts.js, when the buildings are gone).
   */
  remove(marker, { force = false } = {}) {
    if (!marker) return false;
    if (marker.locked && !force) return false;
    const i = this.markers.indexOf(marker);
    if (i >= 0) this.markers.splice(i, 1);
    return i >= 0;
  }

  /** Can the player press × on this one? The list asks before it draws the button. */
  canRemove(marker) { return !!marker && !marker.locked; }

  /** Track or untrack. Untracked markers still show on the world map, just not on the minimap. */
  toggle(marker, on = !marker.tracked) {
    marker.tracked = !!on;
    return marker.tracked;
  }

  // ---------------------------------------------------------------- R17: where a marker shows

  /**
   * Show this one on the big map / in the world, or stop.
   *
   * `where` is `'showOnMap'` or `'showInWorld'` — the field name itself, so there is no second
   * vocabulary to translate and a caller cannot ask for a switch that does not exist.
   */
  show(marker, where, on = null) {
    if (!marker || !MARKER_VIEWS.includes(where)) return false;
    marker[where] = on == null ? marker[where] === false : !!on;
    return marker[where];
  }

  /** What the FULL-SCREEN MAP draws: everything here that has not been switched off. */
  onMap() { return this.here().filter(m => m.showOnMap !== false); }

  /** What the 3D WORLD draws a beacon over: same rule, other switch. */
  inWorld() { return this.here().filter(m => m.showInWorld !== false); }

  /**
   * What the MINIMAP draws.
   *
   *   "Waypoints favorited on the map with a star do not show a star on the minimap."
   *
   * They did not, because the minimap was fed `tracked()` and starring a marker does not track it —
   * two different checkboxes, and only one of them reached the small map. A favourite is a
   * deliberate "keep an eye on this", so it belongs on the minimap for the same reason a tracked
   * quest does; `showOnMap` is the off switch for both, which is what makes the toggle useful
   * ("hide them from the map/world so they are not distracting") rather than an all-or-nothing
   * un-favourite.
   */
  minimap() { return this.here().filter(m => (m.tracked || m.starred) && m.showOnMap !== false); }

  /** Rename one — the outpost marker's inline field, and anything else that grows a name later. */
  rename(marker, name) {
    if (!marker) return null;
    const clean = String(name || '').trim().slice(0, 48);
    if (clean) marker.name = clean;
    return marker.name;
  }

  // ---------------------------------------------------------------- R17: tracked resources

  /**
   * A DEPOSIT YOU ARE KEEPING AN EYE ON — WHICH IS NOT THE SAME AS A PLACE YOU LOVE.
   *
   *   "marking a resource on the map shouldn't necessarily favorite the location. Maybe we should
   *    have 'Tracked Resources' under the Find menu that is persistent list of what you've tracked
   *    (until you untrack it) but you can also favorite these locations to put them under Places.
   *    My idea is just keeping Places clean to actual locations you may want to visit."
   *
   * A tracked resource IS a `seam` marker. That is the whole implementation, and it is on purpose:
   * a second list would be a second thing to put in the save, a second thing to filter by world, and
   * a second thing to forget — which is exactly how `world`, `quests` and `campaign` fell out of
   * `snapshot()` for a whole round. So tracking drops a seam marker, untracking takes it away, and
   * "persistent until you untrack it" comes free from the book already riding `toJSON()`.
   *
   * Favouriting one stars it (`save()` above absorbs it rather than laying a second icon on top),
   * and the Places tab lists the starred ones under **Favorites** while the Find tab lists every
   * seam under **Tracked Resources**. One marker, two lists, no duplicate glyph.
   */
  trackResource({ id = null, name = '', cellX = 0, cellY = 0, colour = null, note = '' } = {}) {
    const had = this.trackedResource({ id, cellX, cellY });
    if (had) {
      if (name) had.name = name;
      return had;
    }
    const m = this.add({
      kind: 'seam', name: name || 'Deposit', cellX, cellY, tracked: false,
      from: { type: 'scan', id, label: name || 'Deposit' },
    });
    if (colour) m.colour = colour;
    if (note) m.note = note;
    return m;
  }

  /** The seam marker for a survey row, matched on its node id first and its cell second. */
  trackedResource({ id = null, cellX = 0, cellY = 0 } = {}) {
    const cx = Math.round(cellX), cy = Math.round(cellY);
    return this.here().find(m => m.kind === 'seam' && (
      (id != null && m.from?.id != null && String(m.from.id) === String(id))
      || (Math.abs(m.cell.x - cx) <= 1 && Math.abs(m.cell.y - cy) <= 1)
    )) || null;
  }

  /** Stop tracking one. Returns true if there was something to stop. */
  untrackResource(ref) {
    const m = ref && ref.kind === 'seam' ? ref : this.trackedResource(ref || {});
    return m ? this.remove(m) : false;
  }

  /** Everything you are tracking on this world — the Find tab's persistent list. */
  resourceTracks() { return this.here().filter(m => m.kind === 'seam'); }

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
        // R14: a quest may ask for its own marker look — a meteor is an impact, not an exclamation
        // mark. Anything that does not ask is a quest, exactly as before.
        kind: MARKER_LOOKS[q.markerKind] ? q.markerKind : 'quest',
        name: q.title, questId: q.id,
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
    /**
     * R17 — a save written before this round has neither switch on any marker.
     *
     * `showOnMap !== false` reads an absent flag as ON everywhere else in this file, so an old save
     * already works — but the LIST has checkboxes in it, and a checkbox bound to `undefined` is an
     * unchecked box next to a marker that is plainly drawn. Filling them in once, here, is the
     * difference between "the toggle is off" and "the toggle has never been touched".
     */
    for (const m of this.markers) {
      if (m.showOnMap === undefined) m.showOnMap = true;
      if (m.showInWorld === undefined) m.showInWorld = true;
      if (m.locked === undefined) m.locked = false;
    }
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
