// Headless balance + performance runs.
//   node tools/sim.js siege [seeds] [difficulty] [waves] [size]   — Defender bot vs the Director
//   node tools/sim.js versus [seeds] [aiDifficulty]                — Defender bot (team 1) vs Umbra
//   node tools/sim.js campaign [missionIndex]                      — Defender bot plays a mission
//   node tools/sim.js perf                                         — tick timing on a large, busy map
import { loadData } from '../js/data.js';
import { Game } from '../js/sim/game.js';
import { RivalAI } from '../js/ai/rival.js';
import { missionOpts } from '../js/sim/missions.js';

const data = await loadData();
const [mode = 'siege', a1, a2, a3, a4] = process.argv.slice(2);

function withBot(g, style = 'defender', difficulty = 'normal') {
  const bot = new RivalAI(g, 1, { style, difficulty });
  g.teams[1].incomeMult = 1; // the bot plays at normal income
  const aiUpdate = g.ai ? g.ai.update.bind(g.ai) : null;
  g.ai = { update: (dt) => { bot.update(dt); if (aiUpdate) aiUpdate(dt); }, save: () => ({}) };
  return bot;
}

function run(g, maxSec) {
  const times = [];
  for (let s = 0; s < maxSec && !g.result; s++) {
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) g.tick();
    times.push((performance.now() - t0) / 30);
  }
  times.sort((a, b) => a - b);
  return { avg: times.reduce((x, y) => x + y, 0) / times.length, p95: times[Math.floor(times.length * 0.95)] || 0, max: times[times.length - 1] || 0 };
}

if (mode === 'siege') {
  const seeds = Number(a1 || 6), diff = a2 || 'normal', waves = Number(a3 || 10), size = a4 || 'medium';
  const rows = [];
  for (let s = 0; s < seeds; s++) {
    const g = new Game(data, { mode: 'siege', seed: 100 + s, mapSize: size, difficulty: diff, waves: { total: waves, difficulty: diff }, commander: true });
    withBot(g);
    const perf = run(g, 60 * 40);
    const core = g.byId.get(g.teams[1].coreId);
    rows.push({ seed: 100 + s, result: g.result ? (g.result.winner === 1 ? 'WIN' : 'LOSS') : 'timeout', cleared: g.waves.cleared, time: Math.round(g.time), coreHp: core ? Math.round(core.hp) : 0, turrets: g.buildings.filter((b) => b.team === 1 && g.data.buildings.list[b.type].turret).length, msAvg: perf.avg.toFixed(2), msP95: perf.p95.toFixed(2) });
  }
  console.table(rows);
  console.log(`${diff}: wins ${rows.filter((r) => r.result === 'WIN').length}/${rows.length}, avg waves cleared ${(rows.reduce((n, r) => n + r.cleared, 0) / rows.length).toFixed(1)}`);
} else if (mode === 'versus') {
  const seeds = Number(a1 || 4), diff = a2 || 'normal';
  const rows = [];
  for (let s = 0; s < seeds; s++) {
    const g = new Game(data, { mode: 'versus', seed: 200 + s, mapSize: 'medium', ai: { difficulty: diff, style: s % 2 ? 'swarm' : 'bastion' }, commander: true });
    withBot(g);
    const perf = run(g, 60 * 25);
    rows.push({ seed: 200 + s, style: g.ai && s % 2 ? 'swarm' : 'bastion', result: g.result ? (g.result.winner === 1 ? 'BOT WIN' : 'UMBRA WIN') : 'timeout', time: Math.round(g.time), msAvg: perf.avg.toFixed(2) });
  }
  console.table(rows);
} else if (mode === 'campaign') {
  const list = a1 != null ? [Number(a1)] : data.campaign.missions.map((_, i) => i);
  const rows = [];
  for (const i of list) {
    const g = new Game(data, missionOpts(data, i, a2 || 'normal'));
    withBot(g);
    const perf = run(g, 60 * 30);
    rows.push({ mission: i, name: data.campaign.missions[i].name, result: g.result ? (g.result.winner === 1 ? 'WIN' : 'LOSS') : 'timeout', reason: g.result?.reason || '', time: Math.round(g.time), cleared: g.waves?.cleared, msAvg: perf.avg.toFixed(2) });
  }
  console.table(rows);
} else if (mode === 'perf') {
  const g = new Game(data, { mode: 'siege', seed: 9, mapSize: 'large', difficulty: 'brutal', waves: { total: 30, difficulty: 'brutal', firstDelay: 20, between: 15 }, commander: true, start: { c: 3000, f: 1500, a: 300 } });
  withBot(g);
  const perf = run(g, 60 * 8);
  console.log('large brutal, 8 min: units', g.units.length, 'buildings', g.buildings.length, 'avg ms/tick', perf.avg.toFixed(2), 'p95', perf.p95.toFixed(2), 'max', perf.max.toFixed(2), 'waves', g.waves.n);
}
