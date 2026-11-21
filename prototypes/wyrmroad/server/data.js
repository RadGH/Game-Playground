// The game data the room server needs, read from disk the same way the page fetches it: the five JSON files the sim
// takes ({ classes, enemies, chapters, items, story }) and the tuning values (the `value` of each data/tuning.json row).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mergeActs } from '../js/sim/route.js';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const J = name => JSON.parse(readFileSync(resolve(DATA, name + '.json'), 'utf8'));

export function loadData() {
  const d = Object.fromEntries(['classes', 'enemies', 'chapters', 'items', 'story', 'acts'].map(k => [k, J(k)]));
  d.storyActs = J('story-acts');
  return mergeActs(d);   // Acts II/III: all 24 chapters and their story (safe to call again)
}
/** The plain tuning object the sim reads (T.walkSpeed …). */
export function loadTuning() {
  return Object.fromEntries(Object.entries(J('tuning')).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, v && typeof v === 'object' && 'value' in v ? v.value : v]));
}
