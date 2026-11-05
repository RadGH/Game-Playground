// Headless smoke check of every ruler power at large size: what each did to the cells around it,
// how many particles it threw, and how long it took. node prototypes/stoneward/tools/smoke-powers.mjs
import { townSim, M } from '../tests/helpers.mjs';

const { sim, town } = townSim();
console.log('town at', town.x, town.y, 'start faith', sim.state.powers.faith);
sim.order({ t: 'power.faith', n: 5000 });
const count = (x, y, r, pred) => {
  let n = 0;
  for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) { const a = sim.cell(xx, yy); if (a && pred(a.c, a.i)) n++; }
  return n;
};
// each power gets its own patch of dry land with something standing on it
const spots = [];
for (let r = 60; r < 900 && spots.length < 8; r += 25) for (let a = 0; a < 24 && spots.length < 8; a++) {
  const x = Math.round(town.x + Math.cos(a / 24 * 6.283) * r), y = Math.round(town.y + Math.sin(a / 24 * 6.283) * r);
  if (spots.some(s => Math.hypot(s[0] - x, s[1] - y) < 90)) continue;
  const wet = count(x, y, 20, (c, i) => M.liquid[c.mat[i]]), stuff = count(x, y, 20, (c, i) => c.mat[i] && !M.liquid[c.mat[i]]);
  if (wet === 0 && stuff > 60) spots.push([x, y]);
}
for (const id of ['lightning', 'frost', 'meteor', 'tornado', 'blackhole', 'earthquake', 'firestorm', 'rain']) {
  const [x, y] = spots.shift();
  const before = count(x, y, 20, (c, i) => c.mat[i] !== 0);
  const t0 = performance.now();
  const r = sim.order({ t: 'power', id, size: 'large', x, y });
  let maxp = 0;
  for (let k = 0; k < 400; k++) { sim.step(); maxp = Math.max(maxp, sim.debris.ps.n); }
  const after = count(x, y, 20, (c, i) => c.mat[i] !== 0);
  console.log(id.padEnd(10), JSON.stringify(r), 'things', before, '->', after,
    'lava', count(x, y, 20, (c, i) => c.mat[i] === M.id.lava),
    'fissure', count(x, y, 40, (c, i) => c.ground[i] === M.id.fissure),
    'particles max', maxp, 'rubble', sim.state.debris.rubble.length / 3,
    'burning', count(x, y, 30, (c, i) => c.flag[i] & 1), `${(performance.now() - t0).toFixed(0)} ms`);
}
