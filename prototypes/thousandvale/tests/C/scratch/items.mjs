import { rulesEngine } from '../../../js/rules/index.js';
import { makeRng } from '../../../js/rules/rng.js';
const e = rulesEngine();
for (const b of ['tome', 'orb', 'wand', 'scepter', 'grimoire', 'shield', 'sword', 'bow', 'staff', 'crossbow']) {
  const it = e.makeItem({ base: b, rarity: 'magic', level: 8, rng: makeRng(5) });
  if (!it) { console.log(b, 'none'); continue; }
  const { affixes, ...rest } = it;
  console.log(b, JSON.stringify(rest).slice(0, 900));
  console.log('   aff', JSON.stringify(affixes).slice(0, 300));
}
