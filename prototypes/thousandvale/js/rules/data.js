// Thousandvale — which data files the combat core reads, and a loader that does not care HOW they
// are read. js/rules/ is pure (no fetch, no fs): the caller passes `readJson(url)` — `fetch` in a
// browser or Worker, `fs.readFileSync` under Node. Paths are relative to THIS file, so
// `new URL(path, import.meta.url)` resolves them the same way in both.

/** key -> path, relative to js/rules/. All of it is Farhold's or Emberveil's own data, unchanged. */
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
