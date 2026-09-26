// Farhold — the world moves while you are looking at it.
//
// PURE JavaScript: no Three.js, no DOM. A patrol here is a POSITION AND A CLOCK. Only the one you
// are standing next to ever gets real bodies, and that is the renderer's job, not this module's.
//
//   import { createPatrols } from './patrols.js';
//   const patrols = createPatrols({ territory, factions, standings, seed });
//   patrols.enter(zone, route);     // the zone's patrols start walking its road nodes
//   patrols.update(seconds);        // they move
//   patrols.near(x, z, 200);        // the ones close enough to matter
//
// WHY A ROUTE RATHER THAN A WANDER. The zone already has road and landmark nodes, and a patrol that
// walks between real places is a patrol you can predict, intercept, avoid or meet again — which is
// what makes the ground feel held by somebody rather than randomly populated.

const SPEED = 3.2;              // metres a second, a walking column
const NIGHT_STOP = true;        // they bed down

function hash(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  }
  return h >>> 0;
}

function rngFrom(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** The ten compositions. Size, speed and what they do when they see you. */
export const COMPOSITIONS = {
  road_watch:       { name: 'Road watch',       size: 3, faction: 'wardens_reach', on: 'road',     challenge: true },
  toll_party:       { name: 'Toll party',       size: 4, faction: 'stonecount',    on: 'bridge',   static: true, demands: 6 },
  raid_band:        { name: 'Raid band',        size: 5, faction: 'ashen_pact',    on: 'site',     hostile: true, speed: 3.6 },
  lamp_round:       { name: 'Lamp round',       size: 2, faction: 'lantern_house', on: 'landmark', nightOnly: true, friendly: true },
  drove:            { name: 'Drove',            size: 4, faction: 'greenhand',     on: 'road',     slow: true, hires: true },
  dig_escort:       { name: 'Dig escort',       size: 4, faction: 'deepworn',      on: 'site',     loop: 'long' },
  wake_procession:  { name: 'Wake procession',  size: 3, faction: 'quiet_wake',    on: 'landmark', slow: true },
  runner_pair:      { name: 'Runner pair',      size: 2, faction: 'cutwater',      on: 'road',     speed: 4.6, flees: true },
  hollow_drift:     { name: 'Hollow drift',     size: 4, faction: 'hollowed',      on: 'drift',    hostile: true, nightOnly: true },
  survey_line:      { name: 'Survey line',      size: 2, faction: 'longsight',     on: 'landmark', marks: true },
};

/** How a patrol behaves toward you, from your standing with whoever fields it. */
export function reactionTo(band, spec) {
  if (spec?.hostile && band?.key !== 'sworn') return 'attack';
  switch (band?.key) {
    case 'hunted': return 'attack';
    case 'disliked': return 'challenge';
    case 'trusted': return 'aid';
    case 'sworn': return 'follow';
    default: return 'pass';
  }
}

export function createPatrols({ territory = null, factions = null, standings = null, seed = 1, warbands = null, sizes = [3, 5] } = {}) {
  /**
   * R27 M9 — `warbands` is data/warbands.json. On ground a warband holds (the territory record's
   * `warband`, js/territory.js), the patrols on the road are ITS war parties — a leader and 3-5 of
   * its members (`sizes`, data/balance.json `warbands.patrolSize`) — and the human holder keeps one
   * watch of its own out, which is the one a warband makes go quiet (`loseOne`).
   */
  /** zoneId -> the patrols walking it. */
  const byZone = new Map();
  let clock = 0;

  /**
   * Start (or re-reveal) a zone's patrols.
   *
   * `route` is a list of `{ x, z, name }` in world metres — the caller hands over the zone's road,
   * landmark and site nodes, so a patrol walks somewhere that exists.
   */
  function enter(zone, route = []) {
    if (!zone || byZone.has(zone.id)) return byZone.get(zone?.id) || [];
    const record = territory?.of?.(zone.id);
    const rng = rngFrom(hash(seed, 'patrol', zone.id));
    const holder = (factions?.factions || []).find(f => f.key === record?.holder);
    const rival = (factions?.factions || []).find(f => f.key === record?.contested);

    const list = [];
    const band = record?.warband && record.warGrip > 0
      ? (warbands?.warbands || []).find(b => b.id === record.warband) : null;
    // R27 M9 — warband ground: its war parties, as many as its grip keeps out, and one human watch
    if (band) {
      const parties = Math.max(1, Math.round(1 + record.warGrip * 2));
      for (let i = 0; i < parties; i++) list.push(warParty(zone, band, route, rng, i));
    }
    const want = band ? 1 : Math.max(1, Math.round(1 + (record?.grip ?? 0.5) * 2.5));
    for (let i = 0; i < want; i++) {
      const spec = COMPOSITIONS[holder?.patrol] || COMPOSITIONS.road_watch;
      list.push(make(zone, spec, holder?.key, route, rng, i));
    }
    // whoever is pushing in has one out there too, which is what a contested zone looks like
    if (rival && (record?.claim ?? 0) > 0.15) {
      const spec = COMPOSITIONS[rival.patrol] || COMPOSITIONS.raid_band;
      list.push(make(zone, spec, rival.key, route, rng, 90));
    }
    byZone.set(zone.id, list);
    return list;
  }

  /** R27 M9 — a warband war party: a leader and `sizes` of its members, walking the zone's road. */
  function warParty(zone, band, route, rng, i) {
    const lo = sizes[0] ?? 3, hi = sizes[1] ?? lo;
    const members = lo + Math.floor(rng() * (hi - lo + 1));
    const spec = {
      name: `${band.short || band.name} war party`, size: 1 + members, hostile: true, speed: 3.4,
      warband: band.id,
    };
    const p = make(zone, spec, null, route, rng, 50 + i);
    p.warband = band.id;
    p.warbandName = band.name;
    p.leaderId = (band.defs || []).find(d => d.role === 'leader')?.id || null;
    p.name = `${band.short || band.name} war party on the ${zone.name} road`;
    return p;
  }

  function make(zone, spec, faction, route, rng, i) {
    const stops = route.length ? route : [{ x: (zone.center?.x || 0) * 640, z: (zone.center?.y || 0) * 640, name: zone.name }];
    // a stable start point on the route, so two patrols are not on top of each other
    const at = Math.floor(rng() * stops.length);
    return {
      id: `p${zone.id}_${i}`,
      type: 'patrol',
      name: `${spec.name} of ${zone.name}`,
      comp: spec, faction, zoneId: zone.id,
      size: spec.size,
      speed: spec.speed || (spec.slow ? 2.4 : SPEED),
      stops, at, next: (at + 1) % stops.length, t: 0,
      x: stops[at].x, z: stops[at].z,
      state: 'walking',      // walking | resting | fighting | missing
      alive: true,
      seenAt: null,
      // R27 M9 — bodies: `engaged` while they are on the field (the clock stops and the bodies
      // carry it), `lost` how many of them have died so far (a returning patrol is that much smaller)
      engaged: false, lost: 0, leaderDown: false,
    };
  }

  /** Move everybody. `night` stops the ones who keep daylight hours. */
  function update(seconds, { night = false } = {}) {
    clock += seconds;
    for (const list of byZone.values()) {
      for (const p of list) {
        if (!p.alive || p.state === 'missing' || p.comp.static || p.engaged) continue;
        const resting = NIGHT_STOP && night && !p.comp.nightOnly && !p.comp.hostile;
        p.state = resting ? 'resting' : 'walking';
        if (resting) continue;
        if (p.comp.nightOnly && !night) { p.state = 'resting'; continue; }

        const from = p.stops[p.at], to = p.stops[p.next];
        const span = Math.hypot(to.x - from.x, to.z - from.z) || 1;
        p.t += (p.speed * seconds) / span;
        while (p.t >= 1) {
          p.t -= 1;
          p.at = p.next;
          p.next = (p.next + 1) % p.stops.length;
        }
        const a = p.stops[p.at], b = p.stops[p.next];
        p.x = a.x + (b.x - a.x) * p.t;
        p.z = a.z + (b.z - a.z) * p.t;
      }
    }
  }

  /** Everyone within `radius` metres, nearest first — the renderer asks for these. */
  function near(x, z, radius = 300) {
    const out = [];
    for (const list of byZone.values()) {
      for (const p of list) {
        if (!p.alive) continue;
        const d = Math.hypot(p.x - x, p.z - z);
        if (d <= radius) out.push({ ...p, distance: d });
      }
    }
    return out.sort((a, b) => a.distance - b.distance);
  }

  /** What this patrol does about you, right now. */
  function reaction(patrol) {
    const band = standings?.band?.(patrol.faction) || null;
    return reactionTo(band, patrol.comp);
  }

  /** A patrol is wiped out. Costs you badly with the people who fielded it. */
  function killed(patrolId) {
    for (const list of byZone.values()) {
      const p = list.find(x => x.id === patrolId);
      if (!p) continue;
      // R27 M9 — once: a patrol that is already down is not killed again by a second caller
      if (!p.alive) return null;
      p.alive = false;
      p.engaged = false;
      if (p.warband) {
        // a warband has no standing row: the deed lands on the ground it held (js/territory.js)
        p.credit = territory?.warbandLoss?.(p.zoneId, 'patrol') || null;
        return p;
      }
      if (standings && p.faction) standings.deed(p.faction, 'patrol_killed', p.size);
      if (territory) territory.press(p.zoneId, -0.06, { claim: 0.04 });
      return p;
    }
    return null;
  }

  /**
   * Mark one as never having reported in — the hook `patrol_gone_quiet` binds to. R27 M9: `human`
   * picks a faction's patrol, never a war party (on warband ground, it is the warband that made it
   * go quiet).
   */
  function loseOne(zoneId, { human = false } = {}) {
    const list = byZone.get(zoneId) || [];
    const p = list.find(x => x.alive && x.state !== 'missing' && (!human || !x.warband));
    if (!p) return null;
    p.state = 'missing';
    return p;
  }

  return {
    enter, update, near, reaction, killed, loseOne,
    /** R27 M9 — the live patrol object (not a copy), for the body manager. */
    byId(id) {
      for (const list of byZone.values()) { const p = list.find(x => x.id === id); if (p) return p; }
      return null;
    },
    inZone: zoneId => (byZone.get(zoneId) || []).filter(p => p.alive),
    /** For the job generator: patrols are candidates like anything else. */
    candidates: zoneId => (byZone.get(zoneId) || [])
      .filter(p => p.alive)
      .map(p => ({ ...p, type: 'patrol' })),
    get hours() { return clock / 3600; },
  };
}

/**
 * R27 M9 — A PATROL WALKS THE ROAD, NOT THE CROW'S LINE BETWEEN TWO TOWNS.
 *
 * The route used to be the zone's settlement / landmark / pass nodes, joined by straight lines —
 * so a "road watch" cut across fields and rivers, and a body put down at its clock position was
 * nowhere near a road. This takes the longest stretch of real road inside the zone
 * (`terrain.roadPaths`, the same polylines js/features.js paves) and samples it every `step`
 * metres, there and back again, so the loop never jumps from one end to the other across country.
 * `inZone(x, z)` says whether a point is in the zone. Returns [] when the zone has no road.
 */
export function routeAlongRoads(paths = [], inZone = () => true, { step = 40, name = 'the road' } = {}) {
  let best = [], bestLen = 0;
  for (const path of paths || []) {
    let run = [], len = 0;
    const close = () => {
      if (run.length >= 2 && len > bestLen) { best = run; bestLen = len; }
      run = []; len = 0;
    };
    for (const q of path.points || []) {
      const x = Array.isArray(q) ? q[0] : q.x, z = Array.isArray(q) ? q[1] : q.z;
      if (!Number.isFinite(x) || !Number.isFinite(z) || !inZone(x, z)) { close(); continue; }
      const last = run[run.length - 1];
      if (last) len += Math.hypot(x - last.x, z - last.z);
      run.push({ x, z });
    }
    close();
  }
  if (best.length < 2) return [];
  const out = [best[0]];
  let since = 0;
  for (let i = 1; i < best.length; i++) {
    since += Math.hypot(best[i].x - best[i - 1].x, best[i].z - best[i - 1].z);
    if (since >= step || i === best.length - 1) { out.push(best[i]); since = 0; }
  }
  const there = out.map(p => ({ x: p.x, z: p.z, name }));
  // there and back: the far end walks home the way it came
  return there.concat(there.slice(1, -1).reverse());
}

/**
 * R27 M9 — PATROLS WITH BODIES.
 *
 * `createPatrols` above is a position and a clock, and until this round nothing ever put a body
 * at that position: `near`, `killed`, `reaction` and `loseOne` had no caller in the game. This is
 * the renderer half its header promised. Every frame (`update`):
 *
 *   * a patrol whose clock position is within `radius` (data/balance.json
 *     `warbands.patrolSpawnRadius`) of the player, and whose `reaction` to you is `attack`, gets its
 *     composition put on the real enemy field at that spot — a warband war party is its leader and
 *     members; a hostile faction's patrol (a raid band, a hollow drift) is the zone's humanoids or
 *     undead. Friendly and wary patrols stay a clock — the enemy field has no friendly bodies.
 *     Nothing is put down inside a town's watch (`field.wild`, which is where js/town-plan.js's
 *     `townExtent` lands).
 *   * the bodies carry the patrol: its clock stops (`engaged`) and, while none of them is fighting,
 *     they walk the route to its next stop and the clock follows the leader.
 *   * the bodies are stamped `encounter`, so the field despawns them on the set-piece leash
 *     (`encounters.keepRadius`, round 21's lesson) rather than the ordinary 320 m. When they are
 *     all gone, the patrol walks on as a clock again — one set of bodies per patrol, ever.
 *   * a body that DIES is a loss the patrol keeps (`lost`); when all of it is down, `killed()`
 *     credits `patrol_killed` once and a warband patrol costs its warband grip.
 *
 * Pure of Three.js: `field` is the js/actors.js EnemyField, used only through `addRanked`,
 * `defsFor`, `defs`, `wild`, `levelAt` and `terrain`.
 */
export function createPatrolBodies({ patrols, field: fieldOrGetter, radius = 150, onWiped = null } = {}) {
  // a getter too, because js/main.js builds a new enemy field on every landing
  let field = null;
  const fieldNow = () => (typeof fieldOrGetter === 'function' ? fieldOrGetter() : fieldOrGetter);
  const rows = new Map();          // patrol id -> { units, spawning }
  const retry = new Map();         // patrol id -> the frame it may try again (nothing could stand there)
  let frame = 0;

  async function spawn(p, row) {
    const terrain = field.terrain;
    const level = field.levelAt ? field.levelAt(p.x, p.z, 1) : 1;
    let head = null, rest = [];
    if (p.warband) {
      const own = (field.defs || []).filter(d => d.warband === p.warband && !d.rareOnly);
      head = p.leaderDown ? null : own.find(d => d.role === 'leader') || null;
      rest = own.filter(d => d.role !== 'leader');
    } else {
      const family = p.comp?.faction === 'hollowed' || p.faction === 'hollowed' ? 'undead' : 'humanoid';
      rest = (field.defsFor?.(p.x, p.z, level) || []).filter(d => !d.warband && d.family === family);
    }
    const want = Math.max(0, (p.size || 1) - (p.lost || 0));
    const defs = [];
    if (head && want > 0) defs.push(head);
    for (let i = defs.length; i < want && rest.length; i++) defs.push(rest[Math.floor(field.rng() * rest.length) % rest.length]);
    for (let i = 0; i < defs.length; i++) {
      const a = field.rng() * Math.PI * 2, r = i === 0 ? 0 : 2 + field.rng() * 5;
      const [x, z] = terrain.clampToWorld ? terrain.clampToWorld(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r) : [p.x, p.z];
      if (terrain.underwater?.(x, z) || !field.wild(x, z)) continue;
      const u = await field.addRanked(defs[i], level, x, z, 'normal');
      if (!u) continue;
      u.encounter = 'patrol:' + p.id;
      u.patrol = p.id;
      u.patrolLeader = i === 0 && defs[i] === head;
      row.units.push(u);
    }
    row.spawning = false;
  }

  /** Walk the bodies to the patrol's next stop while nothing has their attention. */
  function march(p, alive) {
    if (alive.some(u => u.state !== 'wander')) return;
    const lead = alive.find(u => u.patrolLeader) || alive[0];
    const stop = p.stops?.[p.next];
    if (!lead || !stop) return;
    if (Math.hypot(stop.x - lead.x, stop.z - lead.z) < 6) {
      p.at = p.next;
      p.next = (p.next + 1) % p.stops.length;
    }
    const to = p.stops[p.next];
    for (const u of alive) {
      // the leader makes for the stop, the rest for a spot beside the leader
      const tx = u === lead ? to.x : lead.x + (u.x - lead.x) * 0.4;
      const tz = u === lead ? to.z : lead.z + (u.z - lead.z) * 0.4;
      u.facing = Math.atan2(tx - u.x, tz - u.z);
      u.strolling = u === lead || Math.hypot(u.x - lead.x, u.z - lead.z) > 4;
      u.wanderTimer = Math.max(u.wanderTimer || 0, 0.6);
    }
    p.x = lead.x; p.z = lead.z; p.t = 0;
  }

  function update(px, pz) {
    frame++;
    field = fieldNow();
    if (!field) return;
    for (const [id, row] of rows) {
      if (row.spawning) continue;
      const p = patrols.byId(id);
      if (!p) { rows.delete(id); continue; }
      const alive = [];
      for (const u of row.units) {
        if (u.dying != null) {
          if (!u.patrolCounted) {
            u.patrolCounted = true;
            p.lost = (p.lost || 0) + 1;
            if (u.patrolLeader) p.leaderDown = true;
          }
        } else if (!u.removed) alive.push(u);
      }
      if (alive.length) { march(p, alive); continue; }
      // every body is gone: either they died, or the leash took them
      if (row.units.some(u => u.dying != null && !u.removed)) continue;   // let the last one fall
      rows.delete(id);
      p.engaged = false;
      if (!row.units.length) retry.set(id, frame + 120);
      if ((p.lost || 0) >= (p.size || 1) && p.alive) {
        const out = patrols.killed(id);
        if (out) onWiped?.(out);
      }
    }
    for (const near of patrols.near(px, pz, radius)) {
      if (rows.has(near.id) || (retry.get(near.id) ?? 0) > frame) continue;
      const p = patrols.byId(near.id);
      if (!p || !p.alive || p.state === 'missing') continue;
      if (patrols.reaction(p) !== 'attack') continue;
      if (!field.wild(p.x, p.z)) continue;
      const row = { units: [], spawning: true };
      rows.set(p.id, row);
      p.engaged = true;
      spawn(p, row).catch(() => { row.spawning = false; });
    }
  }

  return {
    update,
    /** The patrols with bodies right now, and their bodies — the tests and the debug readout. */
    get live() { return [...rows].map(([id, row]) => ({ id, units: row.units.filter(u => !u.removed && u.dying == null), spawning: row.spawning })); },
    /** Forget everything (a landing, a load): the field has been cleared underneath us. */
    clear() { for (const id of rows.keys()) { const p = patrols.byId(id); if (p) p.engaged = false; } rows.clear(); },
  };
}
