// Thousandvale — one rules engine: Farhold's `Rpg` built over the loaded data, with the boot steps
// Farhold's main.js performs before its first fight (uniques and foci injected into the item table
// in memory, the combat and weapon knobs handed to their modules, an explicit level cap).
//
// One engine per server process is enough: `Rpg` holds the item tables and an `Effects` registry,
// and every fight call is passed its room's own rng. Rooms keep their mutable state in
// js/rules/room.js, never here.

import {
  Rpg, installUniques, installFoci, tuneFeel, tuneWeapons, setLevelCap, EFFECTS,
} from './farhold.js';

/** The same describe hook main.js passes, so a unique's power text matches Farhold's tooltip. */
const EFFECTS_DESC = id => EFFECTS['legendary:' + id]?.desc?.() || null;

export const DEFAULT_LEVEL_CAP = 50;

/**
 * `data` is what js/rules/data.js `loadRulesData` returned (fresh objects — `items` is mutated).
 * `levelCap` is realm-wide: Farhold keeps it in one module variable (rpg.js `LEVEL_CAP`), so every
 * engine in a process must agree on it. createEngine sets it explicitly rather than trusting the
 * default.
 */
export function createEngine(data, { seed = 1, levelCap = DEFAULT_LEVEL_CAP } = {}) {
  const { items, balance, skills, classes, enemies, talents, uniques, tools } = data;
  if (!items || !balance || !skills) throw new Error('createEngine: items, balance and skills are required');

  // main.js line ~299: Farhold's 184 uniques and the four foci, in memory, before anything reads items
  installUniques(items, uniques, { tools, describe: EFFECTS_DESC });
  installFoci(items, { describe: EFFECTS_DESC, balance });
  // main.js line ~439: the combat and weapon knobs (both mutate module tables in place, idempotent)
  tuneFeel(balance.player?.combat);
  tuneWeapons(balance.player);
  setLevelCap(levelCap);

  const rpg = new Rpg(items, { ...balance, seed }, talents);
  const classList = classes?.classes || [];
  const bestiary = enemies || { enemies: [], bosses: [], modifiers: [] };

  return {
    rpg, items, balance,
    skillData: skills,
    statuses: skills.statuses || {},
    classes: classList,
    classById: id => classList.find(c => c.id === id) || null,
    bestiary,
    enemyDef: id => (bestiary.enemies || []).find(d => d.id === id) || (bestiary.bosses || []).find(d => d.id === id) || null,
    levelCap,
    mercenaries: data.mercenaries || null,
    encounters: data.encounters || { scripts: {}, specials: { families: {} }, defaults: {}, byType: {} },
  };
}
