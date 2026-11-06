// Headless smoke run: a galaxy, a system, the player and some fighting. Prints timings + counts.
import { createWorld, step } from '../js/sim/world.js';
import { generateGalaxy, populate, spawnGroup } from '../js/sim/galaxy.js';
import { buildPremade } from '../js/sim/shipgen.js';
import { rng } from '../js/core/math.js';
const gal = generateGalaxy(1);
const sysId = +(process.argv[2] ?? gal.start);
const sys = gal.systems[sysId];
const game = { credits: 0, cargo: {}, goods: {}, parts: [], rep: {} };
const w = createWorld({ seed: 5, game });
populate(w, sys);
const P = buildPremade(process.argv[3] || 'sparrow'); P.x = 2000; P.y = 2000; w.bodies.push(P); w.player = P;
spawnGroup(w, { x: 3400, y: 2000 }, 'redfang', sys.tier, rng(3), 'pack');
console.log('system', sys.name, 'tier', sys.tier, 'bodies', w.bodies.length, 'planets', w.planets.length);
let t0 = performance.now(); const kinds = {};
for (let i = 0; i < 60 * 30; i++) {
  step(w, 1 / 60, { mx: Math.cos(i / 90), my: Math.sin(i / 90), ax: P.x + 200, ay: P.y, fire: true, missile: true });
  for (const e of w.events) kinds[e.t] = (kinds[e.t] || 0) + 1; w.events.length = 0;
  if (P.dead) { console.log('player died at', (i / 60).toFixed(1)); break; }
}
console.log('30s sim ms', (performance.now() - t0).toFixed(0), 'per step', ((performance.now() - t0) / 1800).toFixed(2));
console.log('events', JSON.stringify(kinds));
console.log('bodies', w.bodies.length, 'shots', w.shots.length, 'pickups', w.pickups.length, 'credits', game.credits, 'cargo', JSON.stringify(game.cargo), 'parts', game.parts.length, 'P blocks', P.stats.blocks);
