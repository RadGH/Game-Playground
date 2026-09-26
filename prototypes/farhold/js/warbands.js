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
//   * INSIDE a held zone the spawner draws from that warband `spawnShare x grip` of the time (the
//     rest is the zone's ordinary wildlife); OUTSIDE it, a warband member never spawns. The share
//     is `warbandShare` below (R27 M9), asked by js/actors.js `spawnNear` and js/encounters.js.
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
  // R27 M10 — and the five warlords, as bosses: `bossFor` then finds them like any other boss (and
  // the Gravemarshal and the Peak-King are what fills the empty boss band above level 30)
  bestiary.bosses = bestiary.bosses || [];
  const bossIds = new Set(bestiary.bosses.map(b => b.id));
  for (const w of data.warlords || []) {
    if (bossIds.has(w.id)) continue;
    bestiary.bosses.push({ ...w });
    bossIds.add(w.id);
    added++;
  }
  return added;
}

// ---------------------------------------------------------------------------- R27 M10

/** The warlord row of a warband (by warband id), or null. */
export function warlordOf(data, bandId) {
  const band = warbandById(data, bandId);
  return (data?.warlords || []).find(w => w.id === band?.warlord) || null;
}

/**
 * R27 M10 — DOES THIS BODY FIT THROUGH THAT DOOR?
 *
 * A warlord is 1.6-2.2 times the size of its kin, and an instance's corridors are 2.4-6.5 m wide
 * under walls 3.4-9.5 m high (data/instances.json `interior`, js/dungeon-plan.js). `room` is
 * `{ corridor, wallHeight }`; a def with no `scale`/`bodyHeight` is an ordinary body and always fits.
 * `bodyHeight`/`bodyWidth` are metres at scale 1 (tools/build-warbands.py BODY; the spec measures
 * the real body against them).
 */
export function fitsRoom(def, room) {
  if (!def || !room) return true;
  const k = def.scale ?? 1;
  const tall = (def.bodyHeight ?? 1.8) * k, wide = (def.bodyWidth ?? 0.9) * k;
  if (Number.isFinite(room.wallHeight) && tall > room.wallHeight) return false;
  if (Number.isFinite(room.corridor) && wide > room.corridor) return false;
  return true;
}

/**
 * R27 M10 — THE LEADER'S AURA, AS A MODIFIER.
 *
 * data/enemies.json's `_doc` has said "leader buffs its pack" since round 4 and nothing did. This is
 * the modifier an escort carries while its leader stands, handed to js/actors.js `applyModifier` —
 * the very path a boss phase and a champion's roll take — so it is folded into the escort's own
 * `dmg` ONCE and never becomes a second multiplier in `strike`. `balance.warbands.leaderAura` is
 * the factor. Not in the rollable modifier table: nothing can roll "led".
 */
export function leaderModifier(cfg = {}) {
  const k = Number.isFinite(cfg?.leaderAura) ? cfg.leaderAura : 1.15;
  return { id: 'leader', name: 'Led', dmg: k, desc: 'fights harder while its leader stands' };
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
 * R27 M9 — HOW MUCH OF WHAT YOU MEET IN A HELD ZONE IS THE WARBAND.
 *
 * `spawnShare` (data/warbands.json) is the share at a full grip, and the grip is how much of the
 * zone the warband still holds (js/territory.js `warGrip`, 1 at the seeded claim, 0 once you have
 * driven it out). This is the ONLY place `spawnShare` is read: `js/actors.js` `spawnNear` and
 * `js/encounters.js` `poolFor` both ask this, so a thinned valley is thinner for the ambient
 * spawner and the set pieces alike, and the factor cannot end up applied twice (round 22's
 * lesson). `tests/round27-warbands.test.js` greps for any other reader.
 */
export function warbandShare(data, grip = 1) {
  const g = Number.isFinite(grip) ? Math.max(0, Math.min(1, grip)) : 1;
  return (data?.spawnShare ?? 0.65) * g;
}

/** R27 M9 — a grip in words, for the zone banner, the map legend and the rumours. */
export function gripWord(grip) {
  if (!(grip > 0)) return 'driven out';
  if (grip >= 0.67) return 'firm';
  if (grip >= 0.34) return 'shaken';
  return 'broken';
}

/** "held by the Ashtusk Horde — shaken", or "the Ashtusk Horde driven out". */
export function holderLine(band, grip = 1) {
  if (!band) return '';
  const name = String(band.name || band.id).replace(/^The /, 'the ');
  return grip > 0 ? `held by ${name} \u2014 ${gripWord(grip)}` : `${name} driven out`;
}

/**
 * The claims for one world, remembered per zone object. A new world builds a new map (its zones
 * are new objects), so a landing never inherits the last planet's warbands.
 *
 * R27 M9 — `gripOf(zone)` (optional) is how much of that zone the warband still holds, 0..1. The
 * claim (`of`) never changes — a zone you have driven a warband out of is still ITS ground on the
 * map, reading "driven out" — but `holds` and `share` fall to nothing with the grip.
 */
export function createWarbandMap(data, { seed = 1, biomeOf = null, gripOf = null } = {}) {
  const cache = new WeakMap();
  return {
    data,
    of(zone) {
      if (!zone || typeof zone !== 'object') return null;
      if (cache.has(zone)) return cache.get(zone);
      const band = claimFor(zone, data, { seed, biomeOf });
      cache.set(zone, band);
      return band;
    },
    /** R27 M9 — 0..1; 1 when nothing tracks it, 0 for a zone no warband claims. */
    grip(zone) {
      if (!this.of(zone)) return 0;
      let g = 1;
      try { g = gripOf ? gripOf(zone) : 1; } catch { g = 1; }
      return Number.isFinite(g) ? Math.max(0, Math.min(1, g)) : 1;
    },
    /** R27 M9 — the warband row while it still holds any of this zone, else null. */
    holds(zone) {
      const band = this.of(zone);
      return band && this.grip(zone) > 0 ? band : null;
    },
    /** R27 M9 — `warbandShare` for this zone: spawnShare x grip, 0 if nobody holds it. */
    share(zone) {
      return this.of(zone) ? warbandShare(data, this.grip(zone)) : 0;
    },
    /** Every held zone of a zone list, for the map legend and the tests. */
    held(zones = []) {
      return zones.map(z => ({ zone: z, band: this.of(z) })).filter(r => r.band)
        .map(r => ({ ...r, grip: this.grip(r.zone) }));
    },
  };
}
