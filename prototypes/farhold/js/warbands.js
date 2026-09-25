// Farhold R26 — the enemy WARBANDS: five races nobody plays, each an army with a job for everybody.
//
// "Add the other models as new enemy factions in the game with a variety of NPCs (melee, rogue,
//  caster, etc)."
//
// Chibi 2 has nine races. Human, elf, dwarf and halfling are the player's (js/bodypresets.js); the
// other five are these:
//
//   sootwick   goblin    The Sootwick Gang       levels 1-16
//   ashtusk    orc       The Ashtusk Horde       levels 5-24
//   thornmane  beastkin  The Thornmane Packs     levels 9-28
//   unburied   undead    The Unburied Legion     levels 14-36
//   stonehide  giant     The Stonehide Clans     levels 20-50
//
// Each has five members — melee, rogue, ranged, caster, leader — written as ordinary bestiary
// entries (data/warbands.json `defs`), so everything the bestiary already does applies to them with
// no new code: ranks, champions and rares, modifiers, packs, a leader's escort, roles in the AI,
// drops from `dropBases`, set-piece encounters (js/encounters.js asks `field.defsFor`), the night
// lights humanoids carry. What is new is WHERE they turn up:
//
//   * A ZONE IS HELD by at most one warband. `claimFor(zone)` is deterministic — seed + zone id —
//     so the same world always has the same map of who holds what, and nothing needs saving.
//     A zone qualifies when its middle level sits inside the warband's `levels`; `claimShare` of the
//     qualifying zones are actually held, a warband is three times as likely to take ground whose
//     biome it `prefers`, and the starting zone is never held.
//   * INSIDE a held zone the spawner draws from that warband `spawnShare` of the time (the rest is
//     the zone's ordinary wildlife); OUTSIDE it, a warband member never spawns. That is the whole
//     rule, and it lives in two lines of js/actors.js (`defsFor` and `spawnNear`).
//
//   import { installWarbands, createWarbandMap } from './warbands.js';
//   installWarbands(bestiary, warbandData);                          // once, at load
//   const map = createWarbandMap(warbandData, { seed, biomeOf });    // per world
//   map.of(zone)   // → the warband row, or null
//
// Pure: no Three.js, no DOM.

/** A small seeded hash → 0..1, so a zone's claim never depends on the order anything was asked. */
function hash01(...parts) {
  let h = 2166136261;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Every member def of every warband, stamped with its warband id and naming language. */
export function warbandDefs(data) {
  const out = [];
  for (const band of data?.warbands || []) {
    for (const d of band.defs || []) out.push({ ...d, warband: band.id, nameRace: band.nameRace || band.race });
  }
  return out;
}

/**
 * Put every warband member into the bestiary, in memory. data/enemies.json is never written: the
 * warbands are their own file, and without it (`data` null) the game is exactly what it was.
 * Returns the number added. Safe to call more than once — an id already there is skipped.
 */
export function installWarbands(bestiary, data) {
  if (!bestiary || !data) return 0;
  bestiary.enemies = bestiary.enemies || [];
  const have = new Set(bestiary.enemies.map(e => e.id));
  let added = 0;
  for (const d of warbandDefs(data)) {
    if (have.has(d.id)) continue;
    bestiary.enemies.push(d);
    have.add(d.id);
    added++;
  }
  return added;
}

/** The warband row by id. */
export function warbandById(data, id) {
  return (data?.warbands || []).find(b => b.id === id) || null;
}

/**
 * Who holds this zone — the warband row, or null. `biomeOf(zone)` (optional) returns the zone's
 * biome families, for `prefers`.
 */
export function claimFor(zone, data, { seed = 1, biomeOf = null } = {}) {
  if (!zone || !data || zone.home || zone.id == null || zone.id < 0) return null;
  const level = zone.midLevel ?? Math.round(((zone.minLevel ?? 1) + (zone.maxLevel ?? 1)) / 2);
  const fits = (data.warbands || []).filter(b => level >= b.levels[0] && level <= b.levels[1]);
  if (!fits.length) return null;
  if (hash01(seed, zone.id, 'held') >= (data.claimShare ?? 0.55)) return null;
  let families = [];
  try { families = (biomeOf && biomeOf(zone)) || []; } catch { families = []; }
  const weights = fits.map(b => ((b.prefers || []).some(f => families.includes(f)) ? 3 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = hash01(seed, zone.id, 'who') * total;
  for (let i = 0; i < fits.length; i++) { roll -= weights[i]; if (roll < 0) return fits[i]; }
  return fits[fits.length - 1];
}

/**
 * The claims for one world, remembered per zone object. A new world builds a new map (its zones
 * are new objects), so a landing never inherits the last planet's warbands.
 */
export function createWarbandMap(data, { seed = 1, biomeOf = null } = {}) {
  const cache = new WeakMap();
  return {
    data,
    spawnShare: data?.spawnShare ?? 0.65,
    of(zone) {
      if (!zone || typeof zone !== 'object') return null;
      if (cache.has(zone)) return cache.get(zone);
      const band = claimFor(zone, data, { seed, biomeOf });
      cache.set(zone, band);
      return band;
    },
    /** Every held zone of a zone list, for the map legend and the tests. */
    held(zones = []) {
      return zones.map(z => ({ zone: z, band: this.of(z) })).filter(r => r.band);
    },
  };
}
