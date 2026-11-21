// The game data the room server needs, read from disk the same way the page fetches it: the five JSON files the sim
// takes ({ classes, enemies, chapters, items, story }) and the tuning values (the `value` of each data/tuning.json row).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const J = name => JSON.parse(readFileSync(resolve(DATA, name + '.json'), 'utf8'));

export function loadData() {
  return Object.fromEntries(['classes', 'enemies', 'chapters', 'items', 'story'].map(k => [k, J(k)]));
}
/** The plain tuning object the sim reads (T.walkSpeed …). */
export function loadTuning() {
  return Object.fromEntries(Object.entries(J('tuning')).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, v && typeof v === 'object' && 'value' in v ? v.value : v]));
}
