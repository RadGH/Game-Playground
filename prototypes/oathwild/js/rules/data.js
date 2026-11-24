// Oathwild — which data files the rules read, and a loader that does not care HOW they are read.
//
// js/rules/ is pure (no fetch, no fs): the caller passes `readJson(url)` — `fetch` in a browser,
// `fs.readFile` under Node (js/rules/boot.js does both). Paths are relative to THIS file, so
// `new URL(path, import.meta.url)` resolves them the same way everywhere.

/** key -> path relative to js/rules/. Borrowed files are read unchanged; Oathwild's own live in data/. */
export const RULES_DATA_FILES = {
  // borrowed (never written)
  items: '../../../emberveil/data/items.json',
  balance: '../../../farhold/data/balance.json',
  skills: '../../../farhold/data/skills.json',
  enemies: '../../../farhold/data/enemies.json',
  tvSkills: '../../../thousandvale/data/rules/skills-tv.json',
  tvClasses: '../../../thousandvale/data/rules/classes-tv.json',
  casterForms: '../../../thousandvale/data/rules/caster-forms.json',
  // Oathwild's own
  attributes: '../../data/attributes.json',
  classes: '../../data/classes.json',
  spells: '../../data/spells.json',
  skillsUse: '../../data/skills-use.json',
  talents: '../../data/talents.json',
  proficiency: '../../data/proficiency.json',
  levels: '../../data/levels.json',
  auras: '../../data/auras.json',
  monsters: '../../data/monsters.json',
  regions: '../../data/regions.json',
  lootTables: '../../data/loot-tables.json',
  inventory: '../../data/inventory.json',
  backgrounds: '../../data/backgrounds.json',
  combat: '../../data/combat.json',
  casters: '../../data/casters.json',
};

/** URL of one data file, resolved against this module. */
export function rulesDataUrl(key) {
  const p = RULES_DATA_FILES[key];
  if (!p) throw new Error(`oathwild rules data: unknown file "${key}"`);
  return new URL(p, import.meta.url);
}

/**
 * Read every file. `readJson(url: URL) => object | Promise<object>`.
 * Fresh objects every call: the engine lays Oathwild's rows over the borrowed tables in memory
 * (and Farhold's Rpg tunes `items` at construction), so two engines must never share one copy.
 */
export async function loadRulesData(readJson) {
  const out = {};
  for (const key of Object.keys(RULES_DATA_FILES)) out[key] = await readJson(rulesDataUrl(key));
  return out;
}
