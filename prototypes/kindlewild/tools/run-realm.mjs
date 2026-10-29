// Headless Realm: run N minutes, print omens/faith/essence, then save + load.  node tools/run-realm.mjs [minutes]
import { loadData } from '../tests/load.mjs';
import { prepareData } from '../js/game/session.js';
import { createRealm, saveRealm, loadRealm } from '../js/game/realm.js';
import { freshSave, realmMana } from '../js/game/progress.js';
const data = prepareData(loadData());
const save = freshSave(data.grimoire);
const cfg = { mana: realmMana(save, data.grimoire), unlocked: save.pages, spellLevels: {}, recipe: 'greenvale', seed: 42 };
const s = createRealm(data, cfg);
let essence = 0;
for (const t of ['omen', 'omen-end', 'milestone']) s.sim.on(t, (e) => console.log(`  [${Math.round(s.sim.tick / 30)}s] ${t}: ${e.text || e.name} ${e.essence ? '+' + e.essence : ''}`));
const mins = +(process.argv[2] || 6);
const t0 = performance.now();
for (let k = 0; k < mins * 60 * 30; k++) {
  s.step();
  if (k % (60 * 30) === 0) { essence += s.realm.collect(); const sum = s.realm.summary(); console.log(`min ${k / 1800}: people ${sum.people} animals ${sum.animals} villages ${sum.villages} faith/s ${sum.faithRate.toFixed(1)} mana ${s.mana.cur | 0}/${s.mana.max} regen ${s.mana.regen.toFixed(2)} essence ${essence} day ${s.realm.day}`); }
}
console.log('ms/tick', ((performance.now() - t0) / (mins * 1800)).toFixed(2));
const str = saveRealm(s, cfg);
console.log('save size', (str.length / 1024).toFixed(0), 'KB');
const s2 = loadRealm(data, str, cfg);
console.log('loaded:', JSON.stringify(s2.state().creatures), 'villages', s2.sim.village.list.length);
for (let k = 0; k < 300; k++) s2.step();
console.log('after 10s:', JSON.stringify(s2.state().villages.map(v => [v.pop, v.houses])));
