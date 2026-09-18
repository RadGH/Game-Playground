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

export function createPatrols({ territory = null, factions = null, standings = null, seed = 1 } = {}) {
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
    const want = Math.max(1, Math.round(1 + (record?.grip ?? 0.5) * 2.5));
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
    };
  }

  /** Move everybody. `night` stops the ones who keep daylight hours. */
  function update(seconds, { night = false } = {}) {
    clock += seconds;
    for (const list of byZone.values()) {
      for (const p of list) {
        if (!p.alive || p.state === 'missing' || p.comp.static) continue;
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
      p.alive = false;
      if (standings && p.faction) standings.deed(p.faction, 'patrol_killed', p.size);
      if (territory) territory.press(p.zoneId, -0.06, { claim: 0.04 });
      return p;
    }
    return null;
  }

  /** Mark one as never having reported in — the hook `patrol_gone_quiet` binds to. */
  function loseOne(zoneId) {
    const list = byZone.get(zoneId) || [];
    const p = list.find(x => x.alive && x.state !== 'missing');
    if (!p) return null;
    p.state = 'missing';
    return p;
  }

  return {
    enter, update, near, reaction, killed, loseOne,
    inZone: zoneId => (byZone.get(zoneId) || []).filter(p => p.alive),
    /** For the job generator: patrols are candidates like anything else. */
    candidates: zoneId => (byZone.get(zoneId) || [])
      .filter(p => p.alive)
      .map(p => ({ ...p, type: 'patrol' })),
    get hours() { return clock / 3600; },
  };
}
