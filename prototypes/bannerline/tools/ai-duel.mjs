// AI duel harness (stream E): plays difficulty A vs B over N seeds, mirrored races/heroes (the same
// race and hero on both sides, varying with the seed), seats swapped on odd seeds. tests/ai.test.js
// uses duel(); run it by hand after changing data/ai.json or js/sim/ai/**:
//   node tools/ai-duel.mjs commander veteran 20 [format] [hero] [race]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataSync } from '../js/sim/data.js';
import { createSim } from '../js/sim/sim.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = loadDataSync(n => readFileSync(join(ROOT, 'data', n), 'utf8'));
const RACES = ['freeholds', 'ashtusk', 'unburied', 'thornmane'];
const HEROES = ['warrior', 'ranger', 'pyromancer', 'druid', 'engineer'];

export function duel(a, b, seed, { format = '1v1', hero, race, maxTicks = 20 * 60 * 40, data: d = data } = {}) {
  const n = +format[0];
  const swap = seed % 2 === 1;
  const players = [];
  for (let t = 0; t < 2; t++) for (let i = 0; i < n; i++) {
    const k = seed + i * 3;
    players.push({ team: t, kind: 'ai', ai: { difficulty: (t === 0) !== swap ? a : b },
      race: race || RACES[k % 4], hero: hero || HEROES[(k >> 2) % 5], name: `P${t}${i}` });
  }
  const s = createSim({ seed, mode: format, map: 'vale', players }, d, { events: false });
  while (!s.over && s.tick < maxTicks) s.step([]);
  const r = s.state.result;
  const aTeam = swap ? 1 : 0;
  return { winner: r ? (r.winner === aTeam ? 'A' : r.winner === -1 ? 'draw' : 'B') : 'none', minutes: s.tick / 1200, reason: r && r.reason, state: s.state };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [a = 'commander', b = 'veteran', N = '10', format = '1v1', hero, race] = process.argv.slice(2);
  let wa = 0, wb = 0, d = 0; const mins = [];
  const t0 = Date.now();
  for (let i = 0; i < +N; i++) {
    const r = duel(a, b, 1000 + i, { format, hero, race });
    if (r.winner === 'A') wa++; else if (r.winner === 'B') wb++; else d++;
    mins.push(r.minutes.toFixed(1));
  }
  console.log(`${a} ${wa} - ${wb} ${b} (draw/none ${d}) ${format}  minutes ${mins.join(' ')}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
