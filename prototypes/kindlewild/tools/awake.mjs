// Watch how many chunks stay awake (and what is burning) on a level after a few casts.
// node tools/awake.mjs 1-5
import { loadData } from '../tests/load.mjs';
import { createSession, prepareData } from '../js/game/session.js';
const data = prepareData(loadData());
const level = data.levels.acts.flatMap(a => a.levels).find(l => l.id === (process.argv[2] || '1-5'));
const s = createSession(data, { mode: 'challenge', level });
const w = s.sim.world, M = w.M;
const dragon = () => s.sim.creatures.list.find(c => c.alive && c.species === 'dragon' || c.sp?.id === 'dragon');
let t0 = performance.now();
for (let k = 0; k < 600; k++) {
  s.step();
  const d = dragon();
  if (k === 200 && d) s.use('spell:missiles', d.x, d.y);
  if (k === 260 && d) s.use('spell:missiles', d.x, d.y);
  if (k === 320 && d) s.use('spell:frost', d.x, d.y);
  if (k % 60 === 0) {
    const awake = w.awake.reduce((a, b) => a + b, 0);
    const mats = {}; for (let i = 0; i < w.N; i++) if (w.flag[i] & 1) { const n = M.name?.[w.mat[i]] ?? w.mat[i]; mats[n] = (mats[n] || 0) + 1; }
    console.log(`t=${(k / 30).toFixed(0)}s awake ${awake}/${w.awake.length} burning ${w.stats.burning} ${JSON.stringify(mats)} ms/tick ${((performance.now() - t0) / 60).toFixed(2)}`);
    t0 = performance.now();
  }
}
