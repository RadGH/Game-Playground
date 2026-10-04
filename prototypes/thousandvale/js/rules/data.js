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
  return out;
}
