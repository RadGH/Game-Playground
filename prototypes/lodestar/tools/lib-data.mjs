// Node helper: read Lodestar's data files from disk (tests and tools only).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
export const ROOT = root;
/** Every data file the sim reads (js/sim/index.js createSim takes this object). */
export const DATA_FILES = ['materials', 'mapgen', 'resources', 'recipes', 'buildings', 'research', 'vehicles', 'balance', 'mana', 'spells', 'towers', 'enemies', 'nests', 'upgrades', 'radio'];
export function loadData() {
  const out = {};
  for (const f of DATA_FILES) out[f] = JSON.parse(readFileSync(root + `data/${f}.json`, 'utf8'));
  return out;
}
