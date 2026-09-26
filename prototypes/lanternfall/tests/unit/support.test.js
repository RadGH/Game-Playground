import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mats } from './helpers.js';
import { M } from '../../js/world/materials.js';
import { createGrid } from '../../js/world/grid.js';
import { createSupport } from '../../js/world/support.js';
import { createFragments } from '../../js/world/fragments.js';
import { stepCells } from '../../js/world/cellsim.js';

function room(W = 96, H = 80) {
  const g = createGrid(W, H, mats());
  for (let x = 0; x < W; x++) { g.set(x, H - 1, M.BEDROCK); } for (let y = 0; y < H; y++) { g.set(0, y, M.BEDROCK); g.set(W - 1, y, M.BEDROCK); }
  g.supportQueue.length = 0; const world = { grid: g, steamDebt: 0 }; world.game = null;
  return { g, world, sup: createSupport(world), fr: createFragments(world) };
}
const count = (g, m) => { let n = 0; for (let i = 0; i < g.n; i++) if (g.mat[i] === m) n++; return n; };

test('a stone slab tied to the wall holds; cut its tie and it falls as a fragment and lands', () => {
  const { g, world, sup, fr } = room();
  for (let y = 20; y < 26; y++) for (let x = 1; x < 40; x++) g.set(x, y, M.STONE);
  g.supportQueue.length = 0;
  assert.equal(sup.process().length, 0);
  for (let y = 20; y < 26; y++) g.set(1, y, 0); // cut the tie to the wall
  const groups = sup.process();
  assert.equal(groups.length, 1); fr.detach(groups[0]);
  assert.equal(fr.list.length, 1);
  for (let k = 0; k < 200 && fr.list.length; k++) { fr.step([]); }
  assert.equal(fr.list.length, 0, 'landed');
  // cells are back near the floor (rubble or stone)
  let low = 0; for (let x = 2; x < 40; x++) if (g.mat[(78) * 96 + x] !== 0) low++;
  assert.ok(low > 20, `cells on the floor: ${low}`);
});

test('brick span: 24 cells of reach hold, 25 break off', () => {
  for (const [len, breaks] of [[24, false], [26, true]]) {
    const { g, sup } = room();
    for (let y = 40; y < 79; y++) g.set(10, y, M.BRICK); // a pillar on the floor
    for (let x = 11; x <= 10 + len; x++) g.set(x, 40, M.BRICK); // a beam out from its top
    g.supportQueue.length = 0; g.supportQueue.push(40 * 96 + 11);
    const groups = sup.process();
    assert.equal(groups.length > 0, breaks, `len ${len}`);
  }
});

test('rope hangs from its anchor; cut the top and the strand drops', () => {
  const { g, sup } = room();
  for (let x = 30; x < 50; x++) g.set(x, 10, M.STONE); g.set(1, 10, M.STONE); for (let x = 1; x < 30; x++) g.set(x, 10, M.STONE);
  for (let y = 11; y < 40; y++) g.set(40, y, M.ROPE);
  g.supportQueue.length = 0; g.supportQueue.push(11 * 96 + 40);
  assert.equal(sup.process().length, 0);
  g.set(40, 11, 0);
  const groups = sup.process(); assert.equal(groups.length, 1); assert.equal(groups[0].length, 28);
});
