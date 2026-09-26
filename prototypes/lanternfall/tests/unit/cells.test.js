import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mats } from './helpers.js';
import { M } from '../../js/world/materials.js';
import { createGrid } from '../../js/world/grid.js';
import { stepCells } from '../../js/world/cellsim.js';
import { stepThermal } from '../../js/world/thermal.js';
import { stepLiquids } from '../../js/world/liquids.js';
import { ignite } from '../../js/world/cellsim.js';

function box(W, H) {
  const t = mats(), g = createGrid(W, H, t);
  for (let x = 0; x < W; x++) { g.set(x, H - 1, M.BEDROCK); g.set(x, 0, M.BEDROCK); }
  for (let y = 0; y < H; y++) { g.set(0, y, M.BEDROCK); g.set(W - 1, y, M.BEDROCK); }
  return { grid: g, steamDebt: 0 };
}
const count = (g, m) => { let n = 0; for (let i = 0; i < g.n; i++) if (g.mat[i] === m) n++; return n; };
const run = (w, n) => { for (let k = 0; k < n; k++) { stepCells(w, null); stepThermal(w); stepLiquids(w); } };

test('sand falls and piles into a slope', () => {
  const w = box(64, 64), g = w.grid;
  for (let y = 5; y < 25; y++) for (let x = 28; x < 36; x++) g.set(x, y, M.SAND);
  const before = count(g, M.SAND); run(w, 400);
  assert.equal(count(g, M.SAND), before);
  // the pile is wider at the bottom than the source column
  let bottomRow = 0; for (let x = 0; x < 64; x++) if (g.mat[62 * 64 + x] === M.SAND) bottomRow++;
  assert.ok(bottomRow > 10, `bottom row ${bottomRow}`);
  assert.equal(g.mat[5 * 64 + 30], M.AIR, 'top emptied');
});

test('water levels out and is conserved', () => {
  const w = box(128, 48), g = w.grid;
  for (let y = 5; y < 40; y++) for (let x = 2; x < 20; x++) g.set(x, y, M.WATER);
  const before = count(g, M.WATER); run(w, 900);
  assert.equal(count(g, M.WATER), before, 'no water created or lost');
  // surface roughly flat: compare column heights at x=10 and x=110
  const h = x => { let n = 0; for (let y = 0; y < 48; y++) if (g.mat[y * 128 + x] === M.WATER) n++; return n; };
  assert.ok(Math.abs(h(10) - h(110)) <= 2, `heights ${h(10)} vs ${h(110)}`);
});

test('oil floats on water', () => {
  const w = box(32, 48), g = w.grid;
  for (let y = 10; y < 20; y++) for (let x = 1; x < 31; x++) g.set(x, y, M.OIL);
  for (let y = 20; y < 40; y++) for (let x = 1; x < 31; x++) g.set(x, y, M.WATER);
  // put oil under water by swapping the layers
  for (let y = 10; y < 20; y++) for (let x = 1; x < 31; x++) g.set(x, y, M.WATER);
  for (let y = 36; y < 46; y++) for (let x = 1; x < 31; x++) g.set(x, y, M.OIL);
  run(w, 2500);
  // topmost liquid cell in the middle column is oil
  let top = -1; for (let y = 0; y < 48; y++) { const m = g.mat[y * 32 + 16]; if (m === M.OIL || m === M.WATER) { top = m; break; } }
  assert.equal(top, M.OIL);
});

test('fire spreads through wood and leaves ash/ember', () => {
  const w = box(64, 40), g = w.grid;
  for (let y = 20; y < 38; y++) for (let x = 20; x < 44; x++) g.set(x, y, M.WOOD);
  ignite(g, 20 * 64 + 30, 30, 20);
  const wood0 = count(g, M.WOOD); run(w, 1500);
  assert.ok(count(g, M.WOOD) < wood0 * 0.7, `wood left ${count(g, M.WOOD)} of ${wood0}`);
});

test('boiling keeps water countable (conservation with steamDebt)', () => {
  const w = box(48, 48), g = w.grid;
  for (let y = 30; y < 46; y++) for (let x = 1; x < 47; x++) g.set(x, y, M.WATER);
  const start = count(g, M.WATER);
  for (let x = 10; x < 30; x++) g.heat(x, 45, 400);
  run(w, 600);
  const now = count(g, M.WATER) + w.steamDebt;
  assert.ok(now <= start, `water ${now} must not exceed ${start}`);
});
