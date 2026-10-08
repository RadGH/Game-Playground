// Thousandvale — which data files the combat core reads, and a loader that does not care HOW they
// are read. js/rules/ is pure (no fetch, no fs): the caller passes `readJson(url)` — `fetch` in a
// browser or Worker, `fs.readFileSync` under Node. Paths are relative to THIS file, so
// `new URL(path, import.meta.url)` resolves them the same way in both.

/** key -> path, relative to js/rules/. Farhold's or Emberveil's own data, unchanged — plus data/rules/ (Thousandvale's). */
export const RULES_DATA_FILES = {
  items: '../../../emberveil/data/items.json',
  balance: '../../../farhold/data/balance.json',
  skills: '../../../farhold/data/skills.json',
  classes: '../../../farhold/data/classes.json',
  enemies: '../../../farhold/data/enemies.json',
  talents: '../../../farhold/data/talents.json',
  uniques: '../../../farhold/data/uniques.json',
  tools: '../../../farhold/data/tools.json',
  mercenaries: '../../../farhold/data/mercenaries.json',
  warbands: '../../../farhold/data/warbands.json',
  // Thousandvale's own rules data (stream C, data/rules/): progression (P4/P26), talents and the perk forest (P6)
  progression: '../../data/rules/progression.json',
  tvTalents: '../../data/rules/talents.json',
  tvPerks: '../../data/rules/perks.json',
  // play-test 4: which base a drop is (S17) and the second armour tier (S18) — js/rules/loot-pool.js
  lootPool: '../../data/rules/loot-pool.json',
  affixes: '../../data/rules/affixes.json',            // play-test 4 S4: champions + rares in the wilds (js/rules/affixes.js)
  armourTiers: '../../data/rules/armour-tiers.json',
  // play-test 5: T3/T4 skill changes, T15 caster forms, T5 starter kits, T25 angling numbers, T9/T17 crates + conversion
  tvSkills: '../../data/rules/skills-tv.json',
  tvClasses: '../../data/rules/classes-tv.json',        // owner feedback 10 (Y32): classes that exist only here (the Starcaller)
  casterForms: '../../data/rules/caster-forms.json',
  fishing: '../../data/rules/fishing.json',
  crates: '../../data/rules/crates.json',
  tvGear: '../../data/rules/gear-tv.json',
  projectiles: '../../data/rules/projectiles.json',    // owner feedback 8 W14/W2: flight speeds (js/rules/projectiles.js)
  combat: '../../data/rules/combat.json',              // owner feedback 10: Thousandvale's own combat knobs (js/rules/combat-cfg.js)
  prices: '../../data/rules/prices.json',              // owner feedback 7 V2: item price + kill gold (js/rules/economy.js)
};
/**
 * Files that belong to ANOTHER stream and may not be there yet (or may be half-written while that stream works):
 * read if present, `null` otherwise — never an error. E's angling text (T25) and F's gear catalog (T23).
 */
export const OPTIONAL_DATA_FILES = {
  starterKits: '../../data/rules/starter-kits.json',
  angling: '../../data/provinces/angling.json',
  guards: '../../data/provinces/guards.json',          // owner feedback 8 W1: stream E's town guards (js/rules/guards.js reads `rules`, `ranks`, `raid`)
  gearCatalog: '../../../../avatar-3d/data/gear-catalog.json',
};

/** URL of one data file, resolved against this module. */
export function rulesDataUrl(key) {
  const p = RULES_DATA_FILES[key];
  if (!p) throw new Error(`rules data: unknown file "${key}"`);
  return new URL(p, import.meta.url);
}

/**
 * Read every file. `readJson(url: URL) => object | Promise<object>`.
 * Returns fresh objects each call — the engine mutates `items` in memory (uniques, foci, affix
 * tuning) exactly as Farhold does at boot, so two engines must never share one `items`.
 */
export async function loadRulesData(readJson) {
  const out = {};
  for (const key of Object.keys(RULES_DATA_FILES)) out[key] = await readJson(rulesDataUrl(key));
  for (const [key, p] of Object.entries(OPTIONAL_DATA_FILES)) {
    try { out[key] = await readJson(new URL(p, import.meta.url)); } catch { out[key] = null; }
  }
  out.encounters = await loadEncounters(readJson);
  return out;
}

/** Thousandvale's own encounter scripts (data/encounters/, format docs/encounters.md). */
export const ENCOUNTER_DIR = '../../data/encounters/';
export async function loadEncounters(readJson) {
  const dir = new URL(ENCOUNTER_DIR, import.meta.url);
  const index = await readJson(new URL('index.json', dir));
  const scripts = {};
  for (const f of index.files || []) { const s = await readJson(new URL(f, dir)); scripts[s.id] = s; }
  // `specials` may be one file or a list; each may hold `families` (family/role) and `types` (monster type id)
  const specials = { families: {}, types: {} };
  for (const f of [].concat(index.specials || [], index.typeSpecials || [])) {
    const d = await readJson(new URL(f, dir));
    Object.assign(specials.families, d.families || {});
    Object.assign(specials.types, d.types || {});
  }
  return { scripts, specials, defaults: index.defaults || {}, byType: index.byType || {} };
}
