#!/usr/bin/env node
// Headless AI-vs-AI matches on the REAL sim (js/sim). Sanity + tuning harness.
//
//   node tools/sim-match.mjs                       10 seeds, veteran vs veteran, freeholds mirror
//   node tools/sim-match.mjs --seeds 30 --a recruit --b veteran
//   node tools/sim-match.mjs --trace --seed 3      per-minute line for one match
//   node tools/sim-match.mjs --json
//   node tools/sim-match.mjs --ra ashtusk --hb pyromancer   races / heroes per side (--ra --rb --ha --hb)

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataSync } from '../js/sim/data.js';
import { createSim } from '../js/sim/sim.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const data = loadDataSync(n => readFileSync(join(ROOT, 'data', n), 'utf8'));

export function runMatch({ seed, a = 'veteran', b = 'veteran', raceA = 'freeholds', raceB = 'freeholds', heroA = 'warrior', heroB = 'warrior', trace = false, endless = false, minutes = 32 }) {
  const sim = createSim({ seed, mode: '1v1', map: 'vale', rules: { endless }, players: [
    { team: 0, kind: 'ai', ai: { difficulty: a }, race: raceA, hero: heroA, name: 'A' },
    { team: 1, kind: 'ai', ai: { difficulty: b }, race: raceB, hero: heroB, name: 'B' },
  ] }, data, { events: false });
  let peak = [0, 0];
  const limit = minutes * 60 * 20;
  while (!sim.over && sim.tick < limit) {
    sim.step([]);
    if (sim.tick % 20 === 0) for (const f of sim.state.fields) peak[f.id] = Math.max(peak[f.id], f.bodies + f.waiting.length);
    if (trace && sim.tick % 1200 === 0) {
      const s = sim.state;
      console.log(`m${sim.tick / 1200}`.padEnd(4), s.teams.map(t => t.banners.toFixed(1)).join('/').padEnd(12), s.players.map(p => `inc ${Math.round(p.income)} gold ${Math.round(p.gold)} lvl ${p.level} gear ${p.stats.itemGold} deaths ${p.stats.deaths} kills ${p.stats.kills}`).join(' | '), `bodies ${s.fields.map(f => f.bodies).join('/')}`);
    }
  }
  const s = sim.state;
  return { seed, winner: s.result ? s.result.winner : -2, reason: s.result ? s.result.reason : 'limit', minutes: sim.tick / 1200, peak: Math.max(...peak), players: s.players.map(p => ({ income: p.income, incomeAt: p.stats.incomeAt, level: p.level, items: p.stats.itemGold, sends: p.stats.sendGold, deaths: p.stats.deaths })), hash: sim.hash() };
}

if (process.argv[1] && process.argv[1].endsWith('sim-match.mjs')) {
  const seeds = +arg('--seeds', 10), A = arg('--a', 'veteran'), B = arg('--b', 'veteran');
  const combo = { raceA: arg('--ra', 'freeholds'), raceB: arg('--rb', 'freeholds'), heroA: arg('--ha', 'warrior'), heroB: arg('--hb', 'warrior') };
  if (argv.includes('--trace')) { const r = runMatch({ seed: +arg('--seed', 1), a: A, b: B, trace: true, ...combo }); console.log(r.winner, r.reason, r.minutes.toFixed(1), 'min'); process.exit(0); }
  const res = [];
  const t0 = Date.now();
  for (let i = 0; i < seeds; i++) res.push(runMatch({ seed: 1 + i * 7919, a: A, b: B, ...combo }));
  const mins = res.map(r => r.minutes).slice(); mins.sort((x, y) => x - y);
  const wA = res.filter(r => r.winner === 0).length, wB = res.filter(r => r.winner === 1).length;
  const out = { seeds, a: A, b: B, winsA: wA, winsB: wB, draws: seeds - wA - wB, median: mins[mins.length >> 1], p10: mins[Math.floor(mins.length * 0.1)], p90: mins[Math.min(mins.length - 1, Math.floor(mins.length * 0.9))], caps: res.filter(r => r.reason === 'cap').length, peak: Math.max(...res.map(r => r.peak)), inc10: res.map(r => r.players[0].incomeAt[9]).filter(v => v != null), ms: Date.now() - t0 };
  if (argv.includes('--json')) console.log(JSON.stringify(out));
  else console.log(out);
}
