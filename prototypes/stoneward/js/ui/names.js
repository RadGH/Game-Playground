// Names for kingdoms, towns and rivals, from the shared Name Forge (namegen/). Words the owner has
// banned from new names ("ember", "veil", "muster") are rerolled away.

import { NameGen } from '../../../../namegen/js/namegen.js';

const BANNED = /ember|veil|muster/i;
let gen = null;

export async function loadNames() {
  if (gen) return gen;
  gen = await NameGen.load(new URL('../../../../namegen/data/', import.meta.url).href);
  return gen;
}

function clean(category, seed, race = 'human') {
  for (let k = 0; k < 12; k++) {
    const t = gen.generate(category, { race, seed: (seed + k * 7919) >>> 0 }).text;
    if (!BANNED.test(t)) return t.replace(/^the /, '');
  }
  return 'Stonereach';
}

export function townName(seed) { return gen ? clean('settlement', seed) : 'Stonereach'; }
export function kingdomName(seed) {
  if (!gen) return 'Kingdom of Stonereach';
  const forms = ['Kingdom of', 'Realm of', 'Crown of', 'March of'];
  return `${forms[seed % forms.length]} ${clean(seed % 3 ? 'settlement' : 'region', seed)}`;
}
