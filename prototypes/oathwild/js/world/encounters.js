// Oathwild — filling the world with monsters: camps (data/regions.json) and roam zones (data/placements.json `roam`),
// sized for how many heroes are about. Pure; wraps js/rules/combat.js spawnCamp / spawnMonster (never changes them).
//
//   heroScale(placements, rank, heroes)        → { hp, dmg } from placements.json `encounters.heroScale`
//   spawnCampFor(world, placements, campId, { heroes, flags })  spawnCamp + group-size scaling + story weakening
//   spawnZone(world, zone, { heroes, rng })    one roam/wildlife zone's packs at the zone's own level band
//   campCentre(rules, campId)                  [x, z]
//
// Why the scaling (Guessed, world builder 2026-11-23, owner may overrule): the rules core tunes camp bosses for
// groups (champion numbers x1.5); a lone hero at the boss's level loses every boss fight in the bot runs. Owner
// ruling "1-10 players" + "a lot like Skyrim" → a boss scales with the heroes near it: one hero meets a smaller
// boss, five or more meet the full one. Normal monsters are already beatable alone and are left alone.
// This is the ONE place the factor is applied (lessons rule 33). The Barrow King also weakens when the group has
// lit the three seal-stones (main quest), `encounters.weaken`.

import { spawnCamp, spawnMonster, campRow } from '../rules/combat.js';

export function heroScale(placements, rank, heroes = 1) {
  const T = placements.encounters?.heroScale?.[rank];
  if (!T) return { hp: 1, dmg: 1 };
  const n = Math.max(1, Math.min(10, Math.round(heroes)));
  const keys = Object.keys(T).filter(k => !k.startsWith('_')).map(Number).sort((a, b) => a - b);
  const k = keys.filter(x => x <= n).pop() ?? keys[0];
  return { ...T[String(k)] };
}

export function scaleUnit(u, { hp = 1, dmg = 1, armor = 1 } = {}) {
  if (hp !== 1) { u.maxHp = Math.max(1, Math.round(u.maxHp * hp)); u.hp = u.maxHp; }
  if (dmg !== 1) u.dmg = u.dmg.map(v => Math.max(1, Math.round(v * dmg)));
  if (armor !== 1 && u.armor != null) u.armor = Math.round(u.armor * armor);
  return u;
}

/** Fill a camp. `flags` = world flags (for story weakening). Returns the monsters. */
export function spawnCampFor(world, placements, campId, { heroes = 1, flags = [] } = {}) {
  const units = spawnCamp(world, campId);
  const weak = placements.encounters?.weaken?.[campId];
  for (const u of units) {
    scaleUnit(u, heroScale(placements, u.rank, heroes));
    if (weak && flags.includes(weak.flag) && (!weak.monster || weak.monster === u.defId)) scaleUnit(u, weak);
  }
  return units;
}

export const campCentre = (rules, campId) => campRow(rules, campId)?.at || null;

/** One roam zone: `packs` picks from the zone roster, each at a level inside the zone's band, spread in the circle. */
export function spawnZone(world, zone, { rng = world.rng, packs = zone.packs || 1 } = {}) {
  const out = [];
  const total = zone.roster.reduce((s, r) => s + r.weight, 0);
  for (let p = 0; p < packs; p++) {
    let roll = rng() * total, pick = zone.roster[0];
    for (const r of zone.roster) { roll -= r.weight; if (roll <= 0) { pick = r; break; } }
    const n = pick.pack[0] + Math.floor(rng() * (pick.pack[1] - pick.pack[0] + 1));
    const level = zone.levels[0] + Math.floor(rng() * (zone.levels[1] - zone.levels[0] + 1));
    const spot = zone.spots?.length ? zone.spots[p % zone.spots.length] : zone.at;
    for (let i = 0; i < n; i++) {
      const at = [spot[0] + (i % 2) * 2, spot[1] + Math.floor(i / 2) * 2];
      const u = spawnMonster(world, pick.id, level, at, { home: at });
      if (u) { u.zone = zone.id; out.push(u); }
    }
  }
  return out;
}
