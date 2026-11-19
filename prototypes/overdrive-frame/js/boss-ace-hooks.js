// Round 3 boss + rival ace wiring (main.js imports this once at the end): the aces from data/aces.json become enemy
// kinds 'ace:<id>' (sim/ace.js aceKinds), and ?mission=<id> launches any mission — the campaign's or one from
// data/test-missions.json (m09-brood-queen, m07-ace) — straight into the drop, for testing.
import { bossBakeJobs, aceBakeJobs } from './render/boss-art.js';

export async function install(game) {
  const get = p => fetch(new URL(p, import.meta.url)).then(r => r.json());
  const tests = await get('../data/test-missions.json');
  game.TEST_MISSIONS = tests.missions;
  const id = new URLSearchParams(location.search).get('mission');
  let m = id && (game.MISSIONS.find(x => x.id === id) || tests.missions.find(x => x.id === id));
  if (!m) return;
  const lay = new URLSearchParams(location.search).get('layout');     // round 7: ?layout=canal flies it on another street layout
  if (lay) m = { ...m, map: { ...m.map, layout: lay, ...(new URLSearchParams(location.search).get('district') ? { district: new URLSearchParams(location.search).get('district') } : {}) } };
  // the boss's attacks and the ace's frame, baked before the drop (the drop screen bakes each wave's walk itself)
  const jobs = [];
  for (const w of m.waves || []) {
    const K = game.KINDS[w.kind];
    if (K?.job === 'boss') jobs.push(...bossBakeJobs(game.sprites, K));          // these only queue: the drop bakes them
    if (K?.job === 'ace') jobs.push(...aceBakeJobs(game.mechArt, K.ace.build));  // these bake when called: a few per frame
  }
  const run = () => { const t0 = performance.now(); while (jobs.length && performance.now() - t0 < 10) { try { jobs.shift()(); } catch (e) { console.warn(e); } } if (jobs.length) requestAnimationFrame(run); };
  run();
  game.screens.drop(m);
}
