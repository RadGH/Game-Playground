// Thousandvale — load the combat core's data ONCE, at module load, wherever we are running.
//
// This is the only file under js/rules/ allowed to read files (tests/C/purity.test.mjs exempts it by
// name): js/rules/index.js awaits it at the top level, so the room's synchronous `createRules`
// always finds an engine ready. A browser or Worker uses fetch; Node uses fs. A host that already
// holds the data can skip this by calling `prepareRules(data)` from index.js first.

import { loadRulesData } from './data.js';

async function readJson(url) {
  if (typeof process !== 'undefined' && process.versions?.node && url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(url, 'utf8'));
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`rules data: ${url} -> HTTP ${r.status}`);
  return r.json();
}

/** Fresh data objects every call (an engine mutates `items` in memory). */
export const bootData = () => loadRulesData(readJson);
