// buildFrame cost before/after a Frost Nova on a level (the cold-spread bug made it climb).
import { loadData } from '../tests/load.mjs';
import { createSession, prepareData } from '../js/game/session.js';
import { buildFrame, createFrame } from '../js/render/frame.js';
const data = prepareData(loadData());
const level = data.levels.acts.flatMap(a => a.levels).find(l => l.id === (process.argv[2] || '1-5'));
const s = createSession(data, { mode: 'challenge', level });
const f = createFrame(s.sim.world);
const cost = () => { let t = 0; for (let k = 0; k < 30; k++) { s.step(); const t0 = performance.now(); buildFrame(f, s.sim.world, s.sim.ps, { daylight: 1, draw: (api) => s.sim.creatures.draw(api, s.sim.tick) }); t += performance.now() - t0; } return (t / 30).toFixed(2); };
for (let k = 0; k < 200; k++) s.step();
console.log('before frost', cost());
s.use('spell:frost', 88, 120);
for (let k = 0; k < 400; k++) s.step();
console.log('13 s after frost', cost(), 'awake', s.sim.world.awake.reduce((a, b) => a + b, 0));
