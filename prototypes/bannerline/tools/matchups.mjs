#!/usr/bin/env node
// Race x hero matchup matrix on the REAL sim, Veteran vs Veteran (PLAN §19 test 5).
//
//   node tools/matchups.mjs                      every built race x hero, 6 seeds per pairing per seat
//   node tools/matchups.mjs --seeds 10 --races freeholds,ashtusk --heroes warrior,pyromancer
//   node tools/matchups.mjs --json
//
// Each combo plays every other combo from both seats. Output: per-combo overall win rate, per-race
// and per-hero overall, median match length.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataSync } from '../js/sim/data.js';
import { createSim } from '../js/sim/sim.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function matchups({ data, races, heroes, seeds = 6, difficulty = 'veteran', base = 1 }) {
  const combos = [];
  for (const r of races) for (const h of heroes) combos.push({ race: r, hero: h, key: `${r}/${h}` });
  const W = {}, N = {}, lens = [];
  for (const c of combos) { W[c.key] = 0; N[c.key] = 0; }
  const cell = {};
  for (let i = 0; i < combos.length; i++) for (let j = i + 1; j < combos.length; j++) {
    const A = combos[i], B = combos[j];
    for (let s = 0; s < seeds; s++) for (const flip of [0, 1]) {
      const [x, y] = flip ? [B, A] : [A, B];
      const sim = createSim({ seed: base + s * 7919 + i * 31 + j * 131, players: [
        { team: 0, kind: 'ai', ai: { difficulty }, race: x.race, hero: x.hero },
        { team: 1, kind: 'ai', ai: { difficulty }, race: y.race, hero: y.hero }] }, data, { events: false });
      while (!sim.over && sim.tick < 32 * 1200) sim.step([]);
      const w = sim.state.result ? sim.state.result.winner : -1;
      const sx = w === 0 ? 1 : w === -1 ? 0.5 : 0;
      W[x.key] += sx; W[y.key] += 1 - sx; N[x.key]++; N[y.key]++;
      const k = `${A.key}|${B.key}`; cell[k] = (cell[k] || 0) + (flip ? 1 - sx : sx);
      lens.push(sim.tick / 1200);
    }
  }
  const rate = {}; for (const c of combos) rate[c.key] = W[c.key] / N[c.key];
  const by = (pick) => { const o = {}; for (const c of combos) { const k = pick(c); o[k] = o[k] || [0, 0]; o[k][0] += W[c.key]; o[k][1] += N[c.key]; } for (const k in o) o[k] = o[k][0] / o[k][1]; return o; };   // eslint-disable-line
  lens.sort((a, b) => a - b);
  const cells = {}; for (const k in cell) cells[k] = cell[k] / (seeds * 2);   // eslint-disable-line
  return { combos: rate, races: by(c => c.race), heroes: by(c => c.hero), cells, median: lens[lens.length >> 1], caps: lens.filter(l => l >= 32).length / lens.length };
}

if (process.argv[1] && process.argv[1].endsWith('matchups.mjs')) {
  const argv = process.argv.slice(2);
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const data = loadDataSync(n => readFileSync(join(ROOT, 'data', n), 'utf8'));
  const races = arg('--races', Object.keys(data.races.races).filter(r => data.races.races[r].units.every(u => data.units.units[u]))).toString().split(',');
  const heroes = arg('--heroes', Object.keys(data.heroes.heroes).join(',')).split(',');
  const t0 = Date.now();
  const r = matchups({ data, races, heroes, seeds: +arg('--seeds', 6) });
  if (argv.includes('--json')) console.log(JSON.stringify(r));
  else {
    const pc = v => (v * 100).toFixed(0) + '%';
    for (const [k, v] of Object.entries(r.combos)) console.log(k.padEnd(24), pc(v));
    console.log('races ', Object.entries(r.races).map(([k, v]) => `${k} ${pc(v)}`).join(', '));
    console.log('heroes', Object.entries(r.heroes).map(([k, v]) => `${k} ${pc(v)}`).join(', '));
    console.log('cells ', Object.entries(r.cells).map(([k, v]) => `${k} ${pc(v)}`).join('\n       '));
    console.log(`median ${r.median.toFixed(1)} min, cap ${pc(r.caps)}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}
