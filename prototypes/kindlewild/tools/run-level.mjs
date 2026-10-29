// Run a level (or sandbox) headless for N seconds and print the state. node tools/run-level.mjs 1-1 60
import { loadData } from '../tests/load.mjs';
import { createSession, prepareData } from '../js/game/session.js';
const data = prepareData(loadData());
const id = process.argv[2] || '1-1', secs = +(process.argv[3] || 30);
const level = id === 'sandbox' ? null : data.levels.acts.flatMap(a => a.levels).find(l => l.id === id);
const s = createSession(data, level ? { mode: 'challenge', level } : { mode: 'sandbox', recipe: process.argv[4] || 'greenvale', seed: 7, W: 224, H: 224 });
const evs = {};
s.sim.on('*', (t) => { evs[t] = (evs[t] || 0) + 1; });
s.sim.on('discover', (e) => console.log('  discover', e.id));
s.sim.on('announce', (e) => console.log('  say:', e.text));
const t0 = performance.now();
for (let k = 0; k < secs * 30; k++) {
  s.step();
  if (process.argv[5] === 'bot' && level) bot(s, k);
  if (k % 300 === 0) console.log(`t=${k / 30}s`, JSON.stringify(s.state().creatures), 'burning', s.sim.world.stats.burning, 'lava', s.sim.world.stats.lava, 'mana', s.mana.cur | 0, JSON.stringify(s.state().villages.map(v => [v.pop, v.houses, v.food])));
  if (s.result) { console.log('RESULT', JSON.stringify(s.result)); break; }
}
console.log('ms/tick', ((performance.now() - t0) / (secs * 30)).toFixed(2), 'events', JSON.stringify(evs));
console.log(JSON.stringify(s.state().goals));
function bot() {}
