// CPU cost of building one frame (colours, light field, creatures) per level, headless node.
// node tools/frame-cost.mjs 1-4 1-5
import { loadData } from '../tests/load.mjs';
import { createSession, prepareData } from '../js/game/session.js';
import { buildFrame, createFrame } from '../js/render/frame.js';
const data = prepareData(loadData());
for (const id of process.argv.slice(2)) {
  const level = data.levels.acts.flatMap(a => a.levels).find(l => l.id === id);
  const s = createSession(data, { mode: 'challenge', level });
  for (let k = 0; k < 60; k++) s.step();
  const f = createFrame(s.sim.world);
  let t = 0; const N = 60;
  for (let k = 0; k < N; k++) { s.step(); const t0 = performance.now(); buildFrame(f, s.sim.world, s.sim.ps, { daylight: s.sim.daylight(), draw: (api) => s.sim.creatures.draw(api, s.sim.tick) }); t += performance.now() - t0; }
  console.log(id, 'buildFrame ms', (t / N).toFixed(2), 'lights', f.lights?.length ?? f.nLights ?? '?', 'daylight', s.sim.daylight().toFixed(2));
}
