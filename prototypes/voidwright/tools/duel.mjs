// Balance check: a premade player ship vs a group at a tier, many seeds. Reports win rate, time, hull left.
// node tools/duel.mjs [design=sparrow] [faction=redfang] [tier=1] [mode=pack|big] [runs=20]
import { createWorld, step } from '../js/sim/world.js';
import { spawnGroup } from '../js/sim/galaxy.js';
import { buildPremade } from '../js/sim/shipgen.js';
import { rng } from '../js/core/math.js';
const [design = 'sparrow', faction = 'redfang', tier = '1', mode = 'pack', runs = '20'] = process.argv.slice(2);
let wins = 0, tsum = 0, hpLeft = 0, enemies = 0, deaths = 0, timeouts = 0, dmgDealt = 0;
for (let k = 0; k < +runs; k++) {
  const w = createWorld({ seed: k + 1, game: { credits: 0, cargo: {}, goods: {}, parts: [], rep: {} } });
  const P = buildPremade(design); w.bodies.push(P); w.player = P;
  const g = spawnGroup(w, { x: 700, y: 0 }, faction, +tier, rng(k * 31 + 7), mode); enemies += g.length;
  let t = 0;
  for (; t < 120; t += 1 / 60) {
    const T = g.find(s => !s.dead);
    if (!T || P.dead) break;
    // simple pilot: orbit the nearest enemy at ~260 and hold fire on it
    const dx = T.x - P.x, dy = T.y - P.y, d = Math.hypot(dx, dy);
    const want = (d - 260) / 200; const ox = -dy / d, oy = dx / d;
    step(w, 1 / 60, { mx: dx / d * want + ox * 0.7, my: dy / d * want + oy * 0.7, ax: T.x, ay: T.y, fire: true, missile: true, lock: T });
    w.events.length = 0; w.notes.length = 0;
  }
  if (!P.dead && g.every(s => s.dead)) { wins++; tsum += t; hpLeft += P.stats.hp / P.stats.maxHp; } else if (P.dead) deaths++; else timeouts++;
  dmgDealt += g.reduce((a, s) => a + (1 - (s.dead ? 0 : s.stats.hp / s.stats.maxHp)), 0) / g.length;
}
console.log(`${design} vs ${faction} t${tier} ${mode}: win ${wins}/${runs}, avg enemies ${(enemies / runs).toFixed(1)}, avg time ${(tsum / Math.max(1, wins)).toFixed(1)}s, hull left ${(hpLeft / Math.max(1, wins) * 100).toFixed(0)}%, died ${deaths}, timeout ${timeouts}, enemy dmg ${(dmgDealt / runs * 100).toFixed(0)}%`);
