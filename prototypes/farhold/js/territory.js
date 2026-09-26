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

import { holderFor, factionOf, RIVAL_SHARE } from './factions.js';

/**
 * Does this landmark belong on this ground? Reads the same `descriptor` sentence the holder picker
 * does, because that is the only description a zone carries of what it is made of.
 */
function fitsGround(spec, zone) {
  const biomes = spec.biomes || ['any'];
  if (biomes.includes('any')) return true;
  const ground = String(zone.biome || zone.descriptor || '').toLowerCase();
  return biomes.some(b => ground.includes(b));
}

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

/**
 * Give a camp a place, not just a kind.
 *
 * "Burn Camp" is what a thing IS; "the Burn Camp at Stonepath" is somewhere you can be told to go.
 * The words come from the ground the zone is actually made of, so a marsh camp is not called a
 * ridge camp.
 */
const SITE_WHERE = [
  'Stonepath', 'the Low Ford', 'Greyridge', 'the Cutting', 'Harrowfield', 'the Old Mile',
  'Blackmere', 'the Long Bend', 'Thornwell', 'the Quarry Road', 'Windfall', 'the Split Oak',
];
function siteName(kind, zone, i, rng) {
  const where = SITE_WHERE[Math.floor(rng() * SITE_WHERE.length) % SITE_WHERE.length];
  return `the ${kind} at ${where}`;
}

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
  // `data/landmarks.json`. Fourteen places that fill a zone in — five job frames bind to them.
  landmarks: landmarkData = null,
  /** `(zone) => [{ x, y, type }]` — the map nodes inside a zone, so a landmark sits on a real one. */
  nodesFor = null,
  /**
   * R27 M9 — `(zone) => warband row | null` (js/warbands.js `createWarbandMap().of`), or
   * `undefined` when the caller cannot answer yet (js/main.js builds this file ~2000 lines above the
   * enemy field that holds the claims). A record built without an answer is not kept.
   */
  warbandOf = null,
  /** R27 M9 — data/balance.json `warbands`: gripRegen (a game day) and the four grip drops. */
  warbandCfg = null,
} = {}) {
  const landmarkKinds = landmarkData?.landmarks || [];
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

    /**
     * R27 M9 — ONE HOSTILE HOLDER PER ZONE.
     *
     * A zone a warband holds (js/warbands.js, seeded per zone) already has its enemy: the warband.
     * Before this, the faction picker ran blind to it, so an Ashtusk valley could also be held by
     * the Ashen Pact, with raid-band patrols and bandit camps laid over the orcs — two sets of
     * enemies both claiming the same ground and neither knowing. So the warband takes the hostile
     * slot and the human side of the record — holder AND contested — is drawn only from the
     * factions that are not hostile on sight (`hostileAtStart`). That is the whole rule, here,
     * where the holder is picked; nothing downstream reconciles.
     */
    let band = null, unknown = false;
    try { band = warbandOf ? warbandOf(zone) : null; } catch { band = undefined; }
    if (band === undefined) { unknown = true; band = null; }
    const hostileKeys = band ? (data?.factions || []).filter(f => f.hostileAtStart).map(f => f.key) : [];

    // The Hollowed never hold the world a character starts on the doorstep of — it would mean a
    // level-1 zone with something in it that does not talk and does not stop.
    const exclude = [...(zone.home || (zone.minLevel ?? 1) <= 4 ? ['hollowed'] : []), ...hostileKeys];
    // `descriptor` is the sentence World Forge wrote about the region ("a wide stretch of mild, green
    // open grass…"), which is the only description of what the ground is made of that a zone carries
    const holder = holderFor(data, { ...zone, biome: zone.biome || zone.descriptor || '' }, h, { exclude });
    const rivalKey = (holder?.rivals || []).find(k => factionOf(data, k) && !hostileKeys.includes(k)) || null;

    const sites = [];
    const kinds = holder?.sites || [];
    const n = siteCount(zone, rng);
    for (let i = 0; i < n; i++) {
      const kind = kinds[i % Math.max(1, kinds.length)] || 'waypost';
      const spec = (data?.siteKinds || {})[kind] || { name: 'Camp', hostile: true, size: 1, respawnHours: 24 };
      const spot = placeIn(zone, rng, metresPerCell);
      sites.push({
        id: `s${zone.id}_${i}`,
        // Every site of a kind used to be called the same thing ("Burn Camp"), so two jobs in one
        // zone could name the same place and you could not tell them apart. A place needs a place.
        kind, name: siteName(spec.name, zone, i, rng), faction: holder?.key || null,
        hostile: !!spec.hostile, size: spec.size ?? 1,
        respawnHours: spec.respawnHours ?? 0,
        x: spot.x, z: spot.z, cell: spot.cell,
        cleared: false, clearedAt: null,
      });
    }

    /**
     * WHOEVER IS PUSHING IN IS ON THE GROUND TOO.
     *
     * Without this, a settled zone held by the road wardens had nothing in it you could knock over —
     * their sites are wayposts and muster yards, and neither is hostile — so the one repeatable action
     * the whole territory layer is built around had nowhere to happen in the first zone of the game.
     * One or two of the rival's camps go in as well, which is also what makes "burn it out before it
     * takes root" a job the generator can actually offer.
     */
    const rivalFaction = factionOf(data, rivalKey);
    const rivalKinds = (rivalFaction?.sites || []).filter(k => (data?.siteKinds || {})[k]?.hostile);
    const rivalCount = rivalKinds.length ? 1 + (rng() < 0.4 ? 1 : 0) : 0;
    for (let i = 0; i < rivalCount; i++) {
      const kind = rivalKinds[i % rivalKinds.length];
      const spec = data.siteKinds[kind];
      const spot = placeIn(zone, rng, metresPerCell);
      sites.push({
        id: `s${zone.id}_r${i}`,
        kind, name: siteName(spec.name, zone, 90 + i, rng), faction: rivalKey,
        hostile: true, size: spec.size ?? 1, respawnHours: spec.respawnHours ?? 24,
        x: spot.x, z: spot.z, cell: spot.cell,
        rival: true, cleared: false, clearedAt: null,
      });
    }

    /**
     * THE PLACES THAT ARE NOT CAMPS.
     *
     * A wayshrine, a toll bridge, a ring of stones, a beacon, a collapsed mine. They sit on the map
     * nodes World Forge already grew — a landmark node, a pass, a river crossing — so a shrine is
     * somewhere that exists rather than a coordinate. Five job frames bind to these by `kind`; until
     * they were placed, those five frames could never fire and the file was dead weight at boot.
     */
    const marks = [];
    if (landmarkKinds.length) {
      /**
       * R21 — A LANDMARK NEVER STANDS ON A TOWN.
       *
       * The play-test: *"There is often an event directly at the town center node, which almost
       * always has a road going directly through it… It makes this town square dense."* This list
       * is why. A settlement node was a perfectly good place to hang a landmark, and the spot taken
       * from it is `node.x * metresPerCell` — which is EXACTLY the coordinate `js/features.js` uses
       * as the town's own origin, to the float. So a wayshrine or a gibbet was dropped on the town
       * square, on top of the well, the market stalls and the waypoint pad, all of which derive
       * from that same multiplication.
       *
       * Every landmark in `data/landmarks.json` is a thing you find OUT THERE — a forge fire
       * outside a town, a cairn field, a hunting blind. Put on a market square they are all
       * pointless, and the Forge Fire is actively worse than pointless because the town it landed
       * in already has the bench it was offering. `port` goes with `settlement` — js/features.js
       * builds a town on both — leaving `landmark` and `pass`, which are the two node types that
       * are a place on the road rather than a place with people in it.
       */
      const spots = (nodesFor?.(zone) || [])
        .filter(n => ['landmark', 'pass'].includes(n.type));
      const want = Math.min(3, Math.max(1, Math.round(1 + rng() * 2)));
      const pool = landmarkKinds.filter(l => fitsGround(l, zone));
      for (let i = 0; i < want && pool.length; i++) {
        const spec = pool[Math.floor(rng() * pool.length) % pool.length];
        const node = spots.length ? spots[i % spots.length] : null;
        const spot = node
          ? { x: node.x * metresPerCell, z: node.y * metresPerCell, cell: { x: node.x, y: node.y } }
          : placeIn(zone, rng, metresPerCell);
        marks.push({
          id: `l${zone.id}_${i}`,
          type: 'landmark', kind: spec.kind, name: spec.name,
          blurb: spec.blurb, does: spec.does, faction: spec.faction || null,
          gives: spec.gives || {},
          steps: spec.solve ? (spec.steps || 1) : 0,
          done: 0, state: spec.solve ? 'unsolved' : 'unvisited',
          x: spot.x, z: spot.z, cell: spot.cell,
        });
      }
    }

    const record = {
      zoneId: zone.id,
      zoneName: zone.name,
      landmarks: marks,
      holder: holder?.key || null,
      grip: 0.45 + rng() * 0.35,
      contested: rivalKey,
      claim: 0.1 + rng() * 0.2,     // the rival's grip on the same ground
      sites,
      incidents: [],
      heat: 0,
      visits: 0,
      lastVisit: null,
      // R27 M9 — the warband holding this ground, and how much of it it still holds (1 = the seeded
      // claim, 0 = driven out). Saved as a delta like `grip`; an old save has none and reads 1.
      warband: band?.id || null,
      warbandName: band?.name || null,
      warGrip: band ? 1 : 0,
      _unknown: unknown,
      // only the fields below ever reach the save
      _dirty: false,
    };

    const saveRow = deltas[zone.id];
    if (saveRow) {
      if (Number.isFinite(saveRow.grip)) record.grip = clamp01(saveRow.grip);
      if (Number.isFinite(saveRow.claim)) record.claim = clamp01(saveRow.claim);
      // R27 M9 — a save from before the one-holder rule may name a hostile faction on warband ground
      if (saveRow.holder && !hostileKeys.includes(saveRow.holder)) record.holder = saveRow.holder;
      if (saveRow.contested !== undefined && !hostileKeys.includes(saveRow.contested)) record.contested = saveRow.contested;
      if (band && Number.isFinite(saveRow.warGrip)) record.warGrip = clamp01(saveRow.warGrip);
      if (Number.isFinite(saveRow.heat)) record.heat = saveRow.heat;
      if (Number.isFinite(saveRow.visits)) record.visits = saveRow.visits;
      if (Array.isArray(saveRow.incidents)) record.incidents = saveRow.incidents.map(i => ({ ...i }));
      /**
       * An adopted row (`s_<siteKey>`) describes a set piece this file did not invent, so it is not
       * in `record.landmarks` yet on a fresh build. Keep the saved state on a stub and let
       * `adoptLandmark` fill in the name and the gives when js/sites.js next reconciles — which
       * happens before anything can be pressed, because a set piece has to be built to be reached.
       */
      for (const l of saveRow.landmarks || []) {
        let mark = record.landmarks.find(m => m.id === l.id);
        if (!mark && l.siteKey) {
          mark = { id: l.id, siteKey: l.siteKey, type: 'landmark', gives: {}, steps: 0, x: 0, z: 0, pending: true };
          record.landmarks.push(mark);
        }
        if (mark) { mark.done = l.done ?? 0; mark.state = l.state || mark.state; mark.taken = !!l.taken; }
      }
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
    if (!records.has(zone.id)) {
      const record = build(zone);
      // R27 M9 — asked before the claims exist: answer, but build it again next time
      if (record._unknown) return record;
      records.set(zone.id, record);
    }
    return records.get(zone.id);
  }

  /**
   * R27 M9 — THE WARBAND'S GRIP.
   *
   * `warGrip` is the warband's hold on a zone, separate from `grip` (which is the human holder's —
   * the two sides are not the same fight, and a camp of the Reach going down must not loosen the
   * orcs). It falls for what you do there and creeps back a game day at a time (`tick`). At 0 the
   * zone is free: js/warbands.js `holds()` goes null, so nothing of theirs spawns, and the claim
   * reads "driven out".
   */
  const GRIP_DROP = { kill: 'killGrip', patrol: 'patrolGrip', camp: 'campGrip', warlord: 'warlordGrip' };
  const GRIP_DEED = { patrol: 'patrol_killed', camp: 'stronghold_taken', warlord: 'stronghold_taken' };
  function warGrip(zoneOrId) {
    const record = of(zoneOrId);
    /**
     * The territory ledger is keyed by zone id and outlives a landing, so after you fly to another
     * world its zone 3 would read THIS world's zone-3 row. A zone object whose name is not the
     * row's is somebody else's ground: nothing has touched it, so its warband is at its full claim.
     */
    if (record && typeof zoneOrId === 'object' && zoneOrId?.name && record.zoneName && record.zoneName !== zoneOrId.name) return 1;
    return record?.warband ? record.warGrip : 0;
  }
  /**
   * Something went against the warband here: `what` is kill / patrol / camp / warlord, and the
   * size of the drop is data/balance.json `warbands.<what>Grip`. A deed against a warband is felt
   * by the human factions whose ground it sits on — the holder and whoever contests it — as the
   * opposite of that deed at a third (js/factions.js `RIVAL_SHARE`, the same third every deed
   * spreads to rivals). A warband has no standing row of its own; the 12-faction screen is unchanged.
   */
  function warbandLoss(zoneId, what = 'kill', { times = 1 } = {}) {
    const record = of(zoneId);
    if (!record?.warband) return null;
    const drop = (warbandCfg?.[GRIP_DROP[what]] ?? 0) * times;
    const before = record.warGrip;
    record.warGrip = clamp01(record.warGrip - drop);
    touch(record);
    const deed = GRIP_DEED[what];
    const amount = deed ? (data?.deeds || {})[deed] : null;
    if (standings && Number.isFinite(amount)) {
      for (const key of [record.holder, record.contested]) {
        if (key && factionOf(data, key)) standings.add(key, Math.round(-amount * times * RIVAL_SHARE * 10) / 10, { spread: false });
      }
    }
    return { warband: record.warband, grip: record.warGrip, drivenOut: before > 0 && record.warGrip <= 0 };
  }
  /** Set the grip outright — the debug menu and the tests. */
  function setWarGrip(zoneId, value) {
    const record = of(zoneId);
    if (!record?.warband) return null;
    record.warGrip = clamp01(value);
    touch(record);
    return record.warGrip;
  }
  /**
   * Who is hostile on this ground: the warband, and any faction that shoots on sight holding or
   * contesting it. The one-holder rule is that this is never longer than one.
   */
  function hostiles(zoneOrId) {
    const record = of(zoneOrId);
    if (!record) return [];
    const out = [];
    if (record.warband) out.push({ kind: 'warband', id: record.warband, grip: record.warGrip });
    for (const key of [record.holder, record.contested]) {
      if (key && factionOf(data, key)?.hostileAtStart) out.push({ kind: 'faction', id: key });
    }
    return out;
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
      record.heat = clamp01(record.heat + 0.15);
      // Which way the ground moves depends on WHOSE camp it was. Burning out the people pushing in
      // helps whoever holds the zone; burning out the holder's own is what takes it off them.
      if (site.rival || site.faction === record.contested) {
        record.claim = clamp01(record.claim - 0.12);
        record.grip = clamp01(record.grip + 0.05);
        if (standings && record.contested) standings.deed(record.contested, 'camp_cleared', -1);
        if (standings && record.holder) standings.deed(record.holder, 'camp_cleared', 1);
      } else {
        record.grip = clamp01(record.grip - 0.12);
        record.claim = clamp01(record.claim + 0.05);
        if (standings && record.holder) standings.deed(record.holder, 'camp_cleared', -1);
        if (standings && record.contested) standings.deed(record.contested, 'camp_cleared', 1);
      }
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
    // R27 M9 — a zone thinned in an earlier session regrows too, not only the ones walked into since
    for (const [id, row] of Object.entries(deltas)) {
      if (Number.isFinite(row?.warGrip) && row.warGrip < 1 && !records.has(Number(id))) of(Number(id));
    }
    const regen = (warbandCfg?.gripRegen ?? 0) * hours / 24;
    for (const record of records.values()) {
      let moved = false;
      // R27 M9 — the warband creeps back, `gripRegen` a game day, up to its seeded claim
      if (record.warband && record.warGrip < 1 && regen > 0) {
        const was = record.warGrip;
        record.warGrip = clamp01(record.warGrip + regen);
        moved = true;
        if (was <= 0 && record.warGrip > 0) events.push({ kind: 'warband-returned', zoneId: record.zoneId, warband: record.warband });
      }
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
      /**
       * B7: what an incident leaves behind.
       *
       * Eight incidents carry an `onExpire.rumour` and nothing read it — they just vanished. The
       * aftermath is the interesting half: a zone that went hungry remembers who did not come.
       */
      const gone = record.incidents.filter(i => i.endsAt != null && i.endsAt <= clock);
      if (gone.length) {
        record.incidents = record.incidents.filter(i => !gone.includes(i));
        moved = true;
        for (const row of gone) {
          events.push({ kind: 'incident-over', zoneId: record.zoneId, zoneName: record.zoneName, incident: row.kind, after: row.after || null });
        }
      }
      if (moved) touch(record);
      const flip = settle(record);
      if (flip) events.push({ kind: 'zone-changed-hands', zoneId: record.zoneId, ...flip });
    }
    return events;
  }

  /**
   * Do a day's work on a landmark that has something to do: put the fallen stone back, dig out the
   * mine, light the beacon. Returns what happened, so the caller can say it.
   */
  function workLandmark(zoneId, landmarkId) {
    const record = of(zoneId);
    const mark = record?.landmarks.find(l => l.id === landmarkId);
    if (!mark || !mark.steps || mark.state === 'done') return null;
    mark.done = Math.min(mark.steps, (mark.done || 0) + 1);
    mark.state = mark.done >= mark.steps ? 'done' : 'unsolved';
    touch(record);
    return { mark, finished: mark.state === 'done', left: mark.steps - mark.done };
  }

  /**
   * R14 — THE ONE-SHOT REWARD HAS BEEN TAKEN.
   *
   *   "I found a node 'E look at field of cairns' and it allows me to repeatedly press E to gain
   *    infinite experience."
   *
   * `atLandmark` in js/main.js paid out a landmark's whole `gives` block every single time you
   * pressed E at it. That was invisible for the landmarks with `steps`, because `workLandmark`
   * above counts those down to `done` and the payout only happens on the last one — but a landmark
   * with `solve: false` (the Field of Cairns is one; so are the standing stones, the shrine and
   * nine others) has no steps, never reaches `done`, and so had nothing at all stopping it. Stand
   * still, hold E, gain a level a second.
   *
   * `taken` is its own flag rather than reusing `state: 'done'`, because `done` means "the work
   * here is finished" and a landmark you can still rest at or cross at is not finished — it has
   * just already paid its one-off. `touch(record)` puts it in the save with everything else.
   *
   * Returns true the FIRST time and false afterwards, so the caller can simply ask.
   */
  function takeLandmark(zoneId, landmarkId) {
    const record = of(zoneId);
    const mark = record?.landmarks.find(l => l.id === landmarkId);
    if (!mark || mark.taken) return false;
    mark.taken = true;
    /**
     * R16 — AND THEN IT STOPS BEING A PLACE ON THE MAP.
     *
     *   "I activated it, rewarding 20xp (very minor), yet the marker stayed there. This event is
     *    not significant enough to warrant a global indicator and once consumed it should have
     *    just gone away."
     *
     * Quite right. `taken` said the reward was spent and `state` said whether the WORK was done,
     * and a gibbet has no work — `solve: false`, no steps — so its state sat on `visited` for ever
     * and it kept its glyph. A place is finished when it has nothing left to give: no one-off
     * reward still owed, and no standing offer (a shrine you can still rest at, a ford you can
     * still cross, a bridge that still charges a toll) that would bring you back.
     */
    if (!standingOffer(mark)) mark.state = 'done';
    touch(record);
    return true;
  }

  /** Does this place still do something for you every time you come back? */
  function standingOffer(mark) {
    const g = mark?.gives || {};
    return !!(g.rest || g.bench || g.crossing || g.travelBonus || g.reviveDaily || g.toll);
  }

  /**
   * R16 — THE TWO LANDMARK SYSTEMS, JOINED UP AT LAST.
   *
   *   "Also, despite the name 'gibbet cage' there was no model there."
   *
   * There are two things in this game called a landmark and they had never met. THIS file invents
   * a few per zone from `data/landmarks.json` and gives them coordinates, state and a save slot —
   * and no geometry whatever. `js/sites.js` builds the set pieces you can actually see, out of the
   * same JSON, at its own coordinates, with NUMERIC ids. So the gibbet the user walked up to was
   * this file's phantom: a `◇` on the minimap, an `E look at Gibbet` prompt, 20 experience, and
   * nothing standing there. Meanwhile every gibbet that DID have a cage on a post failed the id
   * lookup below (`l3_0` is not `9012`), so it paid nothing, ever, and a `solve: true` one dead-
   * ended with E doing literally nothing for the life of the save.
   *
   * `adoptLandmark` is the join. `js/sites.js` reconciles its set pieces against this record and
   * hands the leftovers here; anything it adopts gets a record row keyed by the SITE's stable
   * string key, so it visits, works, pays once and saves exactly like a native one. One code path,
   * one ledger, one save format.
   */
  function adoptLandmark(zoneId, site) {
    const record = of(zoneId);
    if (!record || !site) return null;
    const key = site.key != null ? String(site.key) : null;
    if (!key) return null;
    const already = record.landmarks.find(l => l.siteKey === key);
    if (already) return already;
    const mark = {
      id: `s_${key}`, siteKey: key,
      type: 'landmark', kind: site.type || site.plan, name: site.name,
      blurb: site.blurb, does: site.does, faction: site.faction || null,
      gives: site.gives || {},
      steps: site.steps || 0,
      done: 0, state: site.steps ? 'unsolved' : 'unvisited',
      x: site.x, z: site.z, cell: site.cell || null,
    };
    record.landmarks.push(mark);
    touch(record);
    return mark;
  }

  /** You stood at one. That is all the surveyor wants. */
  function visitLandmark(zoneId, landmarkId) {
    const record = of(zoneId);
    const mark = record?.landmarks.find(l => l.id === landmarkId);
    if (!mark || mark.state === 'done') return null;
    if (mark.state === 'unvisited') { mark.state = 'visited'; touch(record); }
    return mark;
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
    warGrip, warbandLoss, setWarGrip, hostiles, // R27 M9
    workLandmark, visitLandmark, takeLandmark, adoptLandmark, standingOffer,
    /**
     * The row a landmark should use, whichever of the two systems it came from. A set-piece
     * landmark is adopted on the spot the first time somebody presses E at it.
     */
    recordFor(zoneId, mark) {
      if (!mark) return null;
      const record = of(zoneId);
      if (!record) return null;
      if (mark.siteKey || mark.id != null) {
        const byId = record.landmarks.find(l => l === mark || l.id === mark.id);
        if (byId && !byId.pending) return byId;
      }
      if (mark.key != null) return adoptLandmark(zoneId, mark);
      return null;
    },
    /** The landmarks of a zone, which is what five of the job frames bind to. */
    /**
     * A `pending` row is saved state waiting for js/sites.js to hand back the set piece it belongs
     * to — it has a state and no coordinates, so it must never reach a map, a patrol route or a
     * proximity test, or it becomes a landmark at the origin of the world.
     */
    landmarksIn(zoneId) { return (of(zoneId)?.landmarks || []).filter(l => !l.pending); },
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
          // R27 M9 — only for warband ground; an old save has none and loads at 1
          warGrip: record.warband ? Math.round(record.warGrip * 10000) / 10000 : undefined,
          cleared: record.sites.filter(s => s.cleared).map(s => ({ id: s.id, at: s.clearedAt })),
          /**
           * R16: `taken` goes in the save now. It never did — so the one-shot gate that stopped a
           * landmark paying infinite experience held until you reloaded, and then the Field of
           * Cairns paid again. `siteKey` goes in too, because an adopted row has to find its set
           * piece again on the next run.
           */
          landmarks: record.landmarks
            .filter(l => l.taken || l.done || (l.state !== 'unsolved' && l.state !== 'unvisited'))
            .map(l => ({ id: l.id, done: l.done, state: l.state, taken: !!l.taken, siteKey: l.siteKey || undefined })),
          incidents: record.incidents.map(i => ({ ...i })),
        };
      }
      return out;
    },
  };
}
