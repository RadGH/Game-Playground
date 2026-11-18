// The game data the co-op server needs, read from disk the same way the page fetches it (js/main.js): parts (Mech Kit +
// crafted), chips, enemies (+ rival aces as enemy kinds), missions, the campaign, makers and the default tuning.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { makeTuning } from '../../../shared/tune.js';
import { partsIndex, SLOTS } from '../js/sim/loadout.js';
import { chipsIndex } from '../js/sim/chips.js';
import { aceKinds } from '../js/sim/ace.js';

const GAME = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const J = p => JSON.parse(readFileSync(resolve(GAME, p), 'utf8'));

export function loadData() {
  const PARTS = J('../../mechkit/data/parts.json'), MAKERS = J('../../mechkit/data/makers.json').makers;
  const P = partsIndex(PARTS, J('data/crafted.json'));
  const CHIPS_J = J('data/chips.json'), C = chipsIndex(CHIPS_J);
  const KINDS = Object.fromEntries(Object.entries(J('data/enemies.json')).filter(([k]) => !k.startsWith('_')));
  Object.assign(KINDS, aceKinds(J('data/aces.json'), P, C));
  return { PARTS, MAKERS, P, C, CHIPS: C, KINDS, SLOTS, T: makeTuning(J('data/tuning.json')), MISSIONS: J('data/missions.json').missions, CAMP: J('data/campaign.json') };
}
