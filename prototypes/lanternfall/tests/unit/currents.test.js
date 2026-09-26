import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mats } from './helpers.js';
import { M } from '../../js/world/materials.js';
import { createGrid } from '../../js/world/grid.js';
import { createCurrents, stepCurrents, createFloodline, stepFloodline } from '../../js/world/currents.js';
import { stepCells } from '../../js/world/cellsim.js';

test('a floodline rises 8 rows/s across 400 cells cheaply and stops at its target', () => {
  const g = createGrid(400, 200, mats()); for (let x = 0; x < 400; x++) g.set(x, 199, M.BEDROCK);
  const game = { grid: g };
  const f = createFloodline({ rect: [0, 0, 400, 199], level: 199, target: 150, rate: 8 });
  const t0 = performance.now(); let ticks = 0;
  while (f.level !== f.target) { stepFloodline(game, f); stepCells({ grid: g }, null); ticks++; if (ticks > 1000) break; }
  const ms = (performance.now() - t0) / ticks;
  assert.equal(f.level, 150); assert.ok(ticks >= 49 * 60 / 8 - 2, `took ${ticks} ticks`);
  assert.ok(ms < 2, `${ms.toFixed(3)} ms/tick`);
});
test('a current zone pushes the player at 60% of its speed', () => {
  const g = createGrid(200, 100, mats()); const player = { x: 50, y: 50, w: 6, h: 12, vx: 0, vy: 0, grounded: false };
  const game = { grid: g, player, entities: [] };
  const cur = createCurrents([{ t: 'current', id: 'c', rect: [0, 0, 200, 100], v: [100, 0] }]);
  for (let k = 0; k < 180; k++) stepCurrents(game, cur);
  assert.ok(Math.abs(player.vx - 60) < 2, `vx ${player.vx}`);
});
