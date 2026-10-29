// Run buildFrame 600 times on a level so `node --cpu-prof` shows where a frame's CPU time goes.
import { loadData } from '../tests/load.mjs';
import { createSession, prepareData } from '../js/game/session.js';
import { buildFrame, createFrame } from '../js/render/frame.js';
const data = prepareData(loadData());
const level = data.levels.acts.flatMap(a => a.levels).find(l => l.id === (process.argv[2] || '1-5'));
const s = createSession(data, { mode: 'challenge', level });
const f = createFrame(s.sim.world);
for (let k = 0; k < 200; k++) s.step();
const t0 = performance.now();
for (let k = 0; k < 600; k++) { if (k % 2 === 0) s.step(); buildFrame(f, s.sim.world, s.sim.ps, { daylight: 0.8, draw: (api) => s.sim.creatures.draw(api, s.sim.tick) }); }
console.log('ms/frame', ((performance.now() - t0) / 600).toFixed(2));
