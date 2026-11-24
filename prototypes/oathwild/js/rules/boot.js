// Oathwild — load the rules data once, wherever we are running. The only file under js/rules/
// allowed to read files (tests/rules/purity.test.mjs exempts it by name): fetch in a browser,
// fs under Node. A host that already holds the data skips this and calls createRules(data).

import { loadRulesData } from './data.js';
import { createRules } from './engine.js';

async function readJson(url) {
  if (typeof process !== 'undefined' && process.versions?.node && url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(url, 'utf8'));
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`oathwild rules data: ${url} -> HTTP ${r.status}`);
  return r.json();
}

/** Fresh data objects every call. */
export const bootData = () => loadRulesData(readJson);

/** Data + a ready rules engine in one call: `const rules = await bootRules({ seed: 7 })`. */
export async function bootRules(opts = {}) {
  return createRules(await bootData(), opts);
}
