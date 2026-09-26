// The benchmark script (docs/06 §21): a fixed 20 s run of events on bench_flood, recording per-tick
// timings. Browser-only (reads performance.now()).
import { explode, applyElement } from '../world/elements.js';
import { castPlan } from '../spells/instances.js';
import { compileWick } from '../spells/wick.js';

export function createBench(game, cam) {
  const rec = { sim: [], frame: [], awake: [], scanned: [], particles: 0, fragments: 0, waterStart: 0, done: false };
  const count = m => { const g = game.grid; let n = 0; for (let i = 0; i < g.n; i++) if (g.mat[i] === m) n++; return n; };
  rec.waterStart = count(22) + count(9) + (game.world.steamDebt || 0);
  const events = [
    [2, () => explode(game, 306, 380, 30, 200)],
    [6, () => { const p = compileWick({ flame: 'ember', shape: 'lob' }, game.data); castPlan(game, game.player, p, { ox: 760, oy: 300, x: 780, y: 480 }, { wickId: 'bench' }); for (let y = 436; y < 444; y++) for (let x = 770; x < 790; x++) game.grid.set(x, y, 32); }],
    [8, () => applyElement(game, 600, 331, 6, 'ember', {})],
    [10, () => applyElement(game, 640, 470, 30, 'rime', { fromPlayer: true })],
    [12, () => { const p = compileWick({ flame: 'tide', shape: 'wave' }, game.data); castPlan(game, game.player, p, { ox: 420, oy: 470, x: 520, y: 470 }, { wickId: 'bench' }); }],
    [14, () => applyElement(game, 400, 470, 4, 'spark', {})],
    [16, () => { for (let y = 100; y < 106; y++) for (let x = 16; x < 46; x++) game.grid.set(x, y, 0); }],
  ];
  let t = 0;
  return {
    rec,
    tick(simMs) {
      t += 1 / 60; while (events.length && events[0][0] <= t) events.shift()[1]();
      if (t > 4) cam.lock = { x: Math.min(game.grid.W - cam.vw / 2, 240 + (t - 4) * 120), y: 380 };
      rec.sim.push(simMs); rec.awake.push(game.world.cellStats?.active || 0); rec.scanned.push(game.world.cellStats?.scanned || 0);
      rec.particles = Math.max(rec.particles, game.particles.n); rec.fragments = Math.max(rec.fragments, game.fragments?.list.length || 0);
      if (t >= 20 && !rec.done) { rec.done = true; rec.waterEnd = count(22) + count(9) + (game.world.steamDebt || 0); rec.report = report(rec); }
    },
    frame(ms) { rec.frame.push(ms); },
  };
}
function stats(a) { const s = [...a].sort((x, y) => x - y); const avg = a.reduce((x, y) => x + y, 0) / Math.max(1, a.length); return { avg: +avg.toFixed(3), p95: +(s[Math.floor(s.length * 0.95)] || 0).toFixed(3), max: +(s[s.length - 1] || 0).toFixed(3) }; }
function report(r) { return { frames: r.frame.length, simMs: stats(r.sim), frameMs: stats(r.frame), awakeChunks: stats(r.awake), cellsScanned: stats(r.scanned), particles: { max: r.particles }, fragments: { max: r.fragments }, waterTotalStart: r.waterStart, waterTotalEnd: r.waterEnd }; }
