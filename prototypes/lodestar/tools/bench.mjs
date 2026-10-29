#!/usr/bin/env node
// Headless tick-time benchmark of the world rules (PLAN §1.4: ≤ 4 ms a tick with 80 awake chunks).
//
//   node prototypes/lodestar/tools/bench.mjs [--seed 7] [--size normal] [--chunks 80] [--ticks 200] [--blasts 4]
//
// Builds the home map, lights a small fire in `chunks` chunks spread across grass and forest, then
// steps the world and times each tick. Every `--blasts` ticks a blast goes off somewhere on land, so
// debris, gas and steam are in the numbers too. Prints median / p95 / max ms, awake chunks, debris.

import { createWorld } from '../js/world/world.js';
import { awakeCount } from '../js/world/grid.js';
import { gasAwakeCount } from '../js/world/gas.js';
import { loadData } from './lib-data.mjs';
import { createRng } from '../js/sim/rng.js';

export function runBench({ seed = 7, size = 'normal', chunks = 80, ticks = 200, blastEvery = 4, warm = 20 } = {}) {
  const data = loadData();
  const t0 = performance.now();
  const world = createWorld(data, { seed, size });
  const genMs = performance.now() - t0;
  const { g, M } = world;
  const rng = createRng(seed).split('bench');
  // pick chunks whose centre is burnable, spread out (every other chunk on both axes first)
  const picks = [];
  const order = [];
  for (let cy = 1; cy < g.CH - 1; cy += 2) for (let cx = 1; cx < g.CW - 1; cx += 2) order.push([cx, cy]);
  for (let cy = 2; cy < g.CH - 1; cy += 2) for (let cx = 2; cx < g.CW - 1; cx += 2) order.push([cx, cy]);
  for (const [cx, cy] of order) {
    if (picks.length >= chunks) break;
    const x = cx * 64 + 32, y = cy * 64 + 32;
    if (world.fire.canBurn(g.get(x, y))) picks.push([x, y]);
  }
  const keepLit = () => {
    // keep each picked chunk burning: relight a cell near its centre when its fire has gone
    for (const [x, y] of picks) {
      if (g.awake[(y >> 6) * g.CW + (x >> 6)]) continue;
      for (let k = 0; k < 6; k++) world.ignite(x + rng.range(-20, 20), y + rng.range(-20, 20));
    }
  };
  for (const [x, y] of picks) world.igniteArea(x, y, 3);
  world.setWind(1, 1);
  const times = [], awake = [], parts = [], gasN = [];
  for (let t = 0; t < ticks + warm; t++) {
    if (t % 10 === 0) keepLit();
    if (blastEvery && t % blastEvery === 0) {
      const [x, y] = picks[rng.int(picks.length)] || [g.W >> 1, g.H >> 1];
      world.blast(x + rng.range(-24, 24), y + rng.range(-24, 24), rng.range(6, 14), 1);
    }
    const a = performance.now();
    world.step();
    const ms = performance.now() - a;
    world.drainEvents();
    if (t >= warm) { times.push(ms); awake.push(awakeCount(g)); parts.push(world.debris.alive); gasN.push(gasAwakeCount(g)); }
  }
  const sorted = [...times].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  return {
    seed, size, W: g.W, H: g.H, chunksLit: picks.length, ticks,
    genMs: Math.round(genMs),
    median: +pct(0.5).toFixed(3), p95: +pct(0.95).toFixed(3), max: +sorted[sorted.length - 1].toFixed(3), mean: +mean(times).toFixed(3),
    awakeMean: Math.round(mean(awake)), awakeMin: Math.min(...awake), awakeMax: Math.max(...awake),
    debrisPeak: Math.max(...parts), gasChunksMean: Math.round(mean(gasN)),
    debrisMaxLandingsPerSecond: world.debris.stats.maxLandingsPerSecond,
    msPerAwakeChunk: +(mean(times) / Math.max(1, mean(awake))).toFixed(4),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const r = runBench({ seed: +arg('seed', 7), size: arg('size', 'normal'), chunks: +arg('chunks', 80), ticks: +arg('ticks', 200), blastEvery: +arg('blasts', 4) });
  console.log(JSON.stringify(r, null, 2));
}
