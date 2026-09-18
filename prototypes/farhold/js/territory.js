// Farhold — a zone as a place with people in it.
//
// PURE JavaScript: no Three.js, no DOM.
//
//   import { createTerritory } from './territory.js';
//   const land = createTerritory({ zones, world, seed, factions: factionData, standings });
//   land.of(zoneId);            // the record: holder, grip, sites, incidents, heat
//   land.clearSite(siteId);     // grip falls, the holder notices, a rival claim grows
//   land.tick(hoursPassed);     // camps come back, claims drift, incidents expire
//
// WHY THIS EXISTS. Farhold is a whole planet and crossing one is slow on purpose, so the interesting
// content has to be where you are standing. A zone used to be a name, a level band and a spawn
// table — nothing in it remembered you and there was no reason to walk back. A territory record
// gives a zone a holder, a set of real places on its ground, and a grip that YOUR actions move. Come
// back to a zone often enough and it visibly becomes somebody else's, or yours.
//
// EVERYTHING IS DERIVED FROM THE SEED. A zone you have never entered already has a holder, sites and
// a claim, worked out from `(worldSeed, zoneId)` — walking in does not create it, it reveals it. Only
// the DELTAS (grip, which sites are cleared, open incidents, visit counts) are saved, which is a few
// hundred bytes a zone rather than a world of furniture.

import { holderFor, factionOf } from './factions.js';

/** A small, fast, stable hash — the same one `js/perks.js` uses for its lattice. */
function hash(...parts) {
  let h = 2166136261 >>> 0;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  return h >>> 0;
}

/** A deterministic 0..1 stream from a hash. */
function rngFrom(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const clamp01 = n => Math.max(0, Math.min(1, n));

/** How many sites a zone carries, by how dangerous it is. A settled zone is not full of camps. */
function siteCount(zone, rng) {
  const base = 2 + Math.floor((zone.band ?? 0) / 2);
  return Math.max(2, Math.min(6, base + (rng() < 0.4 ? 1 : 0)));
}

/**
 * Somewhere in the zone to put a site.
 *
 * Real ground: the zone owns a list of map cells, so a site sits on one of them rather than at a
 * coordinate rolled out of nothing. That is the rule the whole expansion holds to — a quest can only
 * name something that is actually there.
 */
function placeIn(zone, rng, metresPerCell) {
  const cells = zone.cells || [];
  if (!cells.length) {
    const c = zone.center || { x: 0, y: 0 };
    return { x: c.x * metresPerCell, z: c.y * metresPerCell, cell: { x: c.x, y: c.y } };
  }
  const cell = cells[Math.floor(rng() * cells.length) % cells.length];
  const cx = typeof cell === 'number' ? cell % 1e9 : cell.x;
  const cy = typeof cell === 'number' ? 0 : cell.y;
  return { x: cx * metresPerCell, z: cy * metresPerCell, cell: { x: cx, y: cy } };
}

export function createTerritory({
  zones, seed = 1, factions: data, standings = null, metresPerCell = 640, saved = null,
} = {}) {
  const records = new Map();
  const deltas = saved?.zones ? { ...saved.zones } : {};
  let clock = Number(saved?.hours) || 0;      // in-game hours since the run began

  /**
   * Build a zone's record from the seed, then lay the saved deltas over it.
   *
   * Two halves on purpose: the generated half never has to be stored, and the saved half is small
   * enough that a hundred zones cost less than one item.
   */
  function build(zone) {
    const h = hash(seed, 'zone', zone.id);
    const rng = rngFrom(h);

    // The Hollowed never hold the world a character starts on the doorstep of — it would mean a
    // level-1 zone with something in it that does not talk and does not stop.
    const exclude = zone.home || (zone.minLevel ?? 1) <= 4 ? ['hollowed'] : [];
    // `descriptor` is the sentence World Forge wrote about the region ("a wide stretch of mild, green
    // open grass…"), which is the only description of what the ground is made of that a zone carries
    const holder = holderFor(data, { ...zone, biome: zone.biome || zone.descriptor || '' }, h, { exclude });
    const rivalKey = (holder?.rivals || []).find(k => factionOf(data, k)) || null;

    const sites = [];
    const kinds = holder?.sites || [];
    const n = siteCount(zone, rng);
    for (let i = 0; i < n; i++) {
      const kind = kinds[i % Math.max(1, kinds.length)] || 'waypost';
      const spec = (data?.siteKinds || {})[kind] || { name: 'Camp', hostile: true, size: 1, respawnHours: 24 };
      const spot = placeIn(zone, rng, metresPerCell);
      sites.push({
        id: `s${zone.id}_${i}`,
        kind, name: spec.name, faction: holder?.key || null,
        hostile: !!spec.hostile, size: spec.size ?? 1,
        respawnHours: spec.respawnHours ?? 0,
        x: spot.x, z: spot.z, cell: spot.cell,
        cleared: false, clearedAt: null,
      });
    }

    const record = {
      zoneId: zone.id,
      zoneName: zone.name,
      holder: holder?.key || null,
      grip: 0.45 + rng() * 0.35,
      contested: rivalKey,
      claim: 0.1 + rng() * 0.2,     // the rival's grip on the same ground
      sites,
      incidents: [],
      heat: 0,
      visits: 0,
      lastVisit: null,
      // only the fields below ever reach the save
      _dirty: false,
    };

    const saveRow = deltas[zone.id];
    if (saveRow) {
      if (Number.isFinite(saveRow.grip)) record.grip = clamp01(saveRow.grip);
      if (Number.isFinite(saveRow.claim)) record.claim = clamp01(saveRow.claim);
      if (saveRow.holder) record.holder = saveRow.holder;
      if (saveRow.contested !== undefined) record.contested = saveRow.contested;
      if (Number.isFinite(saveRow.heat)) record.heat = saveRow.heat;
      if (Number.isFinite(saveRow.visits)) record.visits = saveRow.visits;
      if (Array.isArray(saveRow.incidents)) record.incidents = saveRow.incidents.map(i => ({ ...i }));
      for (const c of saveRow.cleared || []) {
        const site = record.sites.find(s => s.id === c.id);
        if (site) { site.cleared = true; site.clearedAt = c.at ?? clock; }
      }
    }
    return record;
  }

  function of(zoneOrId) {
    const zone = typeof zoneOrId === 'object' ? zoneOrId : (zones?.byId?.(zoneOrId) || null);
    if (!zone || zone.id == null) return null;
    if (!records.has(zone.id)) records.set(zone.id, build(zone));
    return records.get(zone.id);
  }

  /** Mark a record so its deltas get written. */
  function touch(record) { if (record) record._dirty = true; }

  /**
   * A camp goes down.
   *
   * The holder's grip falls, the rival's claim rises, and standing moves both ways. This is the one
   * action the whole territory layer is built around: it is small, it is repeatable, and enough of
   * them change who the zone belongs to.
   */
  function clearSite(zoneId, siteId) {
    const record = of(zoneId);
    const site = record?.sites.find(s => s.id === siteId);
    if (!site || site.cleared) return null;
    site.cleared = true;
    site.clearedAt = clock;
    touch(record);
    if (site.hostile) {
      record.grip = clamp01(record.grip - 0.12);
      record.claim = clamp01(record.claim + 0.05);
      record.heat = clamp01(record.heat + 0.15);
      if (standings && record.holder) standings.deed(record.holder, 'camp_cleared', -1);
      if (standings && record.contested) standings.deed(record.contested, 'camp_cleared', 1);
    }
    return { site, flipped: settle(record) };
  }

  /** The champion of a zone goes down: a much bigger push than a camp. */
  function championKilled(zoneId) {
    const record = of(zoneId);
    if (!record) return null;
    record.grip = clamp01(record.grip - 0.3);
    record.claim = clamp01(record.claim + 0.12);
    touch(record);
    return { flipped: settle(record) };
  }

  /** Nudge the grip by hand — escorts, incidents and jobs all do this. */
  function press(zoneId, amount, { claim = 0 } = {}) {
    const record = of(zoneId);
    if (!record) return null;
    record.grip = clamp01(record.grip + amount);
    record.claim = clamp01(record.claim + claim);
    touch(record);
    return { flipped: settle(record) };
  }

  /**
   * Has the ground changed hands?
   *
   * Only when the holder's grip has genuinely gone and somebody else wants it — grip under 0.25 and
   * a claim above it. The new holder starts weak, which means a zone can swing back.
   */
  function settle(record) {
    if (!record.contested) return false;
    if (record.grip >= 0.25 || record.claim <= record.grip) return false;
    const old = record.holder;
    record.holder = record.contested;
    record.contested = old;
    record.grip = 0.35;
    record.claim = 0.15;
    // the sites belong to whoever holds the ground now, and the new ones are not cleared yet
    const kinds = factionOf(data, record.holder)?.sites || [];
    record.sites.forEach((s, i) => {
      s.faction = record.holder;
      s.kind = kinds[i % Math.max(1, kinds.length)] || s.kind;
      const spec = (data?.siteKinds || {})[s.kind];
      if (spec) { s.name = spec.name; s.hostile = !!spec.hostile; s.respawnHours = spec.respawnHours ?? 0; }
      s.cleared = false; s.clearedAt = null;
    });
    touch(record);
    return { from: old, to: record.holder };
  }

  /** You walked in. */
  function visit(zoneId) {
    const record = of(zoneId);
    if (!record) return null;
    record.visits++;
    record.lastVisit = clock;
    touch(record);
    return record;
  }

  /**
   * Hours pass.
   *
   * Cleared camps come back, a holder's grip creeps up while you are not knocking it down, heat
   * cools, and incidents run out. It is a handful of arithmetic per known zone per call, so it can
   * run on a slow timer and still be free.
   */
  function tick(hours = 0) {
    if (hours <= 0) return [];
    clock += hours;
    const events = [];
    for (const record of records.values()) {
      let moved = false;
      for (const site of record.sites) {
        if (!site.cleared || !site.respawnHours) continue;
        if (clock - (site.clearedAt ?? 0) < site.respawnHours) continue;
        site.cleared = false; site.clearedAt = null;
        record.grip = clamp01(record.grip + 0.05);
        moved = true;
        events.push({ kind: 'site-returned', zoneId: record.zoneId, site: site.id, name: site.name });
      }
      // a faction that is left alone slowly tightens its hold
      const untouched = clock - (record.lastVisit ?? 0);
      if (untouched > 12) { record.grip = clamp01(record.grip + 0.01 * hours); moved = true; }
      if (record.heat > 0) { record.heat = clamp01(record.heat - 0.02 * hours); moved = true; }
      const before = record.incidents.length;
      record.incidents = record.incidents.filter(i => i.endsAt == null || i.endsAt > clock);
      if (record.incidents.length !== before) moved = true;
      if (moved) touch(record);
      const flip = settle(record);
      if (flip) events.push({ kind: 'zone-changed-hands', zoneId: record.zoneId, ...flip });
    }
    return events;
  }

  /** Put an incident on a zone. `hours` of null means it runs until something resolves it. */
  function addIncident(zoneId, incident, hours = null) {
    const record = of(zoneId);
    if (!record) return null;
    if (record.incidents.some(i => i.kind === incident.kind)) return null;   // one of each at a time
    const row = { ...incident, startedAt: clock, endsAt: hours == null ? null : clock + hours, resolved: false };
    record.incidents.push(row);
    touch(record);
    return row;
  }

  function resolveIncident(zoneId, kind) {
    const record = of(zoneId);
    const row = record?.incidents.find(i => i.kind === kind && !i.resolved);
    if (!row) return null;
    row.resolved = true;
    record.incidents = record.incidents.filter(i => i !== row);
    touch(record);
    return row;
  }

  return {
    of, visit, clearSite, championKilled, press, tick, addIncident, resolveIncident,
    get hours() { return clock; },
    /** Every zone whose record has actually been touched — the map legend wants these. */
    known: () => [...records.values()],
    /** The sites still standing in a zone, which is what a job frame binds to. */
    sitesIn(zoneId, { hostileOnly = false } = {}) {
      const record = of(zoneId);
      if (!record) return [];
      return record.sites.filter(s => !s.cleared && (!hostileOnly || s.hostile));
    },
    /**
     * Only the deltas. A zone that has never been touched writes nothing at all, which is why a
     * hundred-zone world still saves in a few hundred bytes.
     */
    toJSON() {
      const out = { hours: Math.round(clock * 100) / 100, zones: { ...deltas } };
      for (const record of records.values()) {
        if (!record._dirty) continue;
        out.zones[record.zoneId] = {
          grip: Math.round(record.grip * 1000) / 1000,
          claim: Math.round(record.claim * 1000) / 1000,
          holder: record.holder, contested: record.contested,
          heat: Math.round(record.heat * 1000) / 1000,
          visits: record.visits,
          cleared: record.sites.filter(s => s.cleared).map(s => ({ id: s.id, at: s.clearedAt })),
          incidents: record.incidents.map(i => ({ ...i })),
        };
      }
      return out;
    },
  };
}
