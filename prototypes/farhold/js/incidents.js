// Farhold — things that happen to a zone.
//
// PURE JavaScript: no Three.js, no DOM. An incident is a timed state on a territory record. It
// changes what spawns, what a shop charges, what people say and which job frames can fire.
//
//   import { createIncidents } from './incidents.js';
//   const trouble = createIncidents({ data, territory, factions, seed });
//   trouble.consider(zone, { biome, weather, hours });   // does anything start?
//   trouble.effects(zoneId);                             // the merged multipliers, for the game
//
// WHY THEY MATTER. Without incidents a zone is the same on your fourth visit as your first. With
// them, "the road I know" can be short of food, full of something that will not stay buried, or
// having a fair — and the job board reads completely differently because of it.

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

/** Everything the rest of the game reads off an incident, merged and defaulted. */
export const NO_EFFECT = {
  spawnMult: 1, shopMult: 1, stockMult: 1, gatherMult: 1, travelMult: 1,
  fireDamage: 1, visibility: 1, folkOut: 0, bountyMult: 1,
  nightSpawn: null, townClosed: false, gambler: false, minstrel: false,
  namedHunts: false, factionsFight: false, sealsDungeon: false, rareHerb: false,
  opensFrames: [],
  /**
   * R18 — FOUR MORE THAT WERE FALLING OFF THE WHITELIST.
   *
   * `effects()` below merges by explicit lists of keys, which is the right shape — a typo in the
   * data becomes a missing effect rather than a crash. The cost is that a key the data declares and
   * the lists do not name is dropped in silence, and four were:
   *
   *   `patrol`        `raid_coming` names the band that is supposed to be ON THE ROAD while a raid
   *                   gathers. The whole point of the incident, and nobody could see it.
   *   `patrolMult`    `feud` puts half again as many patrols out.
   *   `namedGrowth`   `grudge` makes named enemies grow faster while it runs.
   *   `rivalHunters`  `bounty_up` puts other people after the same bounty.
   */
  patrol: null, patrolMult: 1, namedGrowth: 0, rivalHunters: false,
};

export function createIncidents({ data, territory = null, factions = null, seed = 1 } = {}) {
  const table = data?.incidents || [];
  let rolls = 0;

  /** The row for a kind. */
  const byKind = kind => table.find(i => i.kind === kind) || null;

  /**
   * Could this incident start on this zone right now?
   *
   * Every condition is read off state that already exists — the biome, the weather, who holds the
   * ground and how firmly, whether a caravan was lost. Nothing rolls a die to decide whether a
   * condition is met; the die only decides whether a met condition fires.
   */
  function eligible(spec, zone, ctx) {
    const s = spec.starts || {};
    const record = territory?.of?.(zone.id);
    if (record?.incidents?.some(i => i.kind === spec.kind)) return false;

    if (s.biome && !s.biome.some(b => String(ctx.biome || '').toLowerCase().includes(b))) return false;
    if (s.weather && !s.weather.includes(ctx.weather)) return false;
    if (s.holderGrip) {
      if (record?.holder !== s.holderGrip.faction) return false;
      if ((record?.grip ?? 0) <= s.holderGrip.above) return false;
    }
    if (s.gripsWithin != null) {
      if (!record?.contested) return false;
      if (Math.abs((record.grip ?? 0) - (record.claim ?? 0)) > s.gripsWithin) return false;
    }
    if (s.caravanLost && !ctx.caravanLost) return false;
    if (s.cairnDug && !ctx.cairnDug) return false;
    if (s.playerBeaten && !ctx.playerBeaten) return false;
    if (s.namedSurvived != null && (ctx.namedSurvived ?? 0) < s.namedSurvived) return false;
    return true;
  }

  /**
   * Roll for a zone. Returns whatever started, or null.
   *
   * Called on entering a zone and on a slow timer while you are in it — a handful of comparisons per
   * incident kind, so it is free.
   */
  function consider(zone, ctx = {}) {
    if (!zone || !territory) return null;
    const rng = rngFrom(hash(seed, 'incident', zone.id, rolls++));
    const open = table.filter(spec => eligible(spec, zone, ctx));
    if (!open.length) return null;

    /**
     * R14 — THE BLANDEST LINE IN THE FILE WAS THE ONLY ONE ANYBODY EVER SAW, AND IT WAS A MECHANISM.
     *
     *   "There are events that happen very frequently in the chat like 'something out there has your
     *    measure and…'. They happen too often, and they aren't represented on the minimap or in game
     *    very well."
     *
     * This loop walked `open` in FILE ORDER and returned on the first thing that fired. `grudge`
     * sits fourth in data/incidents.json and its start condition is `playerBeaten`, which is a
     * FORCED start — chance 1, no roll. So from the first time the player died and picked up a
     * nemesis, `grudge` was picked every single time and returned, and the eight interesting
     * incidents below it — the feud, the bloom, the collapse, the ash fall, the fair day, the
     * quarantine, the bounty, the washed-out road — could never start in a zone the player was
     * newly entering. Ever.
     *
     * Two changes. The order inside each group is shuffled, so "first in the file" stops being
     * "always wins"; and a forced incident that is ALREADY RUNNING here does not get to block the
     * rest — `territory.addIncident` refuses a duplicate of the same kind in the same zone and
     * returns null, and that null used to fall out of the bottom of the loop as "nothing happened".
     * Now it simply tries the next one.
     */
    const isForced = spec => !!(spec.starts?.caravanLost || spec.starts?.cairnDug
      || spec.starts?.playerBeaten || spec.starts?.namedSurvived || spec.starts?.holderGrip
      || spec.starts?.gripsWithin != null);
    // a stable shuffle off this roll's own rng, so the same zone in the same state is repeatable
    const shuffled = open
      .map(spec => ({ spec, key: rng(), forced: isForced(spec) }))
      .sort((a, b) => (b.forced - a.forced) || (a.key - b.key));

    for (const { spec, forced } of shuffled) {
      // a condition that names something specific (a lost caravan, a dug grave) fires at once;
      // an ambient one has to roll its own chance
      const chance = spec.starts?.chance ?? (forced ? 1 : 0.06);
      if (!forced && rng() > chance) continue;
      const row = territory.addIncident(zone.id, {
        kind: spec.kind, name: spec.name, blurb: spec.blurb,
        spawns: spec.effects?.nightSpawn || null,
      }, spec.hours);
      // null means one of these is already running here — try the next rather than giving up
      if (row) return { ...row, spec };
    }
    return null;
  }

  /** Force one on, for a script or a test. */
  function start(zoneId, kind) {
    const spec = byKind(kind);
    if (!spec || !territory) return null;
    const row = territory.addIncident(zoneId, {
      kind: spec.kind, name: spec.name, blurb: spec.blurb,
      spawns: spec.effects?.nightSpawn || null,
    }, spec.hours);
    return row ? { ...row, spec } : null;
  }

  /**
   * Everything running on this zone, merged into one set of numbers the game can just read.
   * Multipliers multiply, flags OR together, and `opensFrames` is the list of job frames that only
   * exist while the trouble does.
   */
  function effects(zoneId) {
    const record = territory?.of?.(zoneId);
    const out = { ...NO_EFFECT, opensFrames: [] };
    for (const row of record?.incidents || []) {
      const spec = byKind(row.kind);
      if (!spec) continue;
      const e = spec.effects || {};
      for (const key of ['spawnMult', 'shopMult', 'stockMult', 'gatherMult', 'travelMult', 'fireDamage', 'visibility', 'bountyMult', 'patrolMult']) {
        if (e[key] != null) out[key] *= e[key];
      }
      if (e.folkOut != null) out.folkOut += e.folkOut;
      if (e.namedGrowth != null) out.namedGrowth += e.namedGrowth;
      for (const key of ['townClosed', 'gambler', 'minstrel', 'namedHunts', 'factionsFight', 'sealsDungeon', 'rareHerb', 'rivalHunters']) {
        if (e[key]) out[key] = true;
      }
      if (e.nightSpawn) out.nightSpawn = e.nightSpawn;
      // the band a gathering raid puts on the road — see the note on NO_EFFECT
      if (e.patrol) out.patrol = e.patrol;
      if (e.opensFrame) out.opensFrames.push(e.opensFrame);
    }
    return out;
  }

  /** One line per running incident, for the HUD and the journal. */
  function describe(zoneId) {
    const record = territory?.of?.(zoneId);
    return (record?.incidents || []).map(row => ({
      kind: row.kind,
      name: row.name || byKind(row.kind)?.name || row.kind,
      blurb: row.blurb || byKind(row.kind)?.blurb || '',
      endsAt: row.endsAt,
    }));
  }

  /** Which job frames are only available because of what is happening here. */
  function framesOpenIn(zoneId) { return effects(zoneId).opensFrames; }

  return { consider, start, effects, describe, framesOpenIn, byKind, eligible, table };
}
