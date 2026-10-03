// Hunters vs Farmers world generator (docs/hvf-PLAN.md §3, §16.1): valid over many seeds and every
// map size, deterministic, every validator rule holds on the result, metrics in range, fast enough.
// HVF_SEEDS=500 node --test tests/hvf-mapgen.test.js runs the full sweep from the plan (slow).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './_sim.mjs';
import { generateWorld, buildWorld, worldForFormat, KIND, WALK_FARMER, WALK_HUNTER, bfsMove, lineOfSight } from '../js/sim/modes/hvf/mapgen.js';
import { hashValue } from '../js/sim/hash.js';

const read = n => JSON.parse(readFileSync(join(ROOT, 'data', 'hvf', n), 'utf8'));
const gen = read('mapgen.json'), rules = read('rules.json');
const SEEDS = +(process.env.HVF_SEEDS || 24);
export const GOLDEN = [1181244041, 1001835040, 1054969612];   // 5v2 seeds 1, 2, 3 (tests/hvf-mapgen.spec.js reuses these)
const SIZES = [['2v1', 192], ['5v2', 256], ['7v3', 304], ['9v3', 320]];

const gridOf = w => ({ cols: w.cols, rows: w.rows, n: w.cols * w.rows, inb: (x, z) => x >= 0 && z >= 0 && x < w.cols && z < w.rows });
const cellAt = (w, x, z) => Math.floor(z / w.cell) * w.cols + Math.floor(x / w.cell);
function reach(w, farmer) {
  const doors = new Set(w.doors);
  return bfsMove(gridOf(w), w.cells, w.level, cellAt(w, w.commons.x, w.commons.z), farmer ? (c => WALK_FARMER[w.cells[c]] || doors.has(c)) : (c => WALK_HUNTER[w.cells[c]] === 1));
}
const worldHash = w => hashValue({ cells: Array.from(w.cells), level: Array.from(w.level), look: Array.from(w.look) });

function checkWorld(w, f) {
  const v = gen.validate, { cells, level, cols, rows } = w;
  assert.equal(w.problems.length, 0, w.problems.join('; '));
  assert.equal(cols, f.size / gen.cell);
  // border is all forest
  for (let x = 0; x < cols; x++) { assert.equal(cells[x], KIND.tree); assert.equal(cells[(rows - 1) * cols + x], KIND.tree); }
  for (const k of cells) assert.ok(k <= KIND.ramp);
  // levels only change across a cliff or through a ramp
  for (let z = 0; z < rows; z++) for (let x = 0; x + 1 < cols; x++) {
    const a = z * cols + x, b = a + 1;
    if (level[a] !== level[b]) {
      const ka = cells[a], kb = cells[b];
      assert.ok(ka === KIND.cliff || kb === KIND.cliff || ka === KIND.ramp || kb === KIND.ramp || ka === KIND.tree || kb === KIND.tree, `bare step at ${x},${z}`);
    }
  }
  // trails are ground
  for (let i = 0; i < cells.length; i++) if (cells[i] === KIND.trail) assert.equal(level[i], 0);
  const fr = reach(w, true), hr = reach(w, false);
  // every hollow reachable for farmers; briar and door hollows closed to hunters
  assert.ok(w.hollows.length >= 2 * f.farmers, `${w.hollows.length} hollows for ${f.farmers} farmers`);
  for (const h of w.hollows) {
    assert.ok(h.cells.some(c => fr[c] >= 0), `hollow ${h.id} reachable`);
    assert.ok(h.r >= 3 && h.r <= 8, `hollow radius ${h.r}`);
    if (h.entry === 'tree') assert.ok(h.cells.every(c => hr[c] < 0), `door hollow ${h.id} is closed to hunters until chopped`);
    assert.ok(h.slots.length >= 1 && h.slots[0].door >= 0);
  }
  for (const d of w.doors) assert.equal(cells[d], KIND.tree);
  // kennels: one per hunter, far from the Commons, reachable by hunters
  assert.equal(w.kennels.length, f.hunters);
  for (const k of w.kennels) {
    assert.ok(Math.sqrt((k.x - w.commons.x) ** 2 + (k.z - w.commons.z) ** 2) >= v.kennelDistance);
    assert.ok(hr[cellAt(w, k.x, k.z)] >= 0 || hr.some((d, i) => d >= 0 && Math.abs((i % cols) * w.cell - k.x) < k.r && Math.abs(Math.floor(i / cols) * w.cell - k.z) < k.r), 'kennel reachable');
  }
  const m = w.metrics;
  assert.ok(m.forest >= v.forest[0] && m.forest <= v.forest[1], `forest ${m.forest}`);
  assert.ok(m.loops >= v.loops, `loops ${m.loops}`);
  assert.ok(m.plateau > 0.05 && m.plateau < 0.3, `plateau ${m.plateau}`);
  assert.ok(m.hiddenness > 0 && m.branching >= 2, 'graph and hiding metrics');
  // landmark names are unique
  const names = w.features.map(x => x.name).filter(Boolean);
  assert.equal(new Set(names).size, names.length, names.join(', '));
}

for (const [fmt, size] of SIZES) {
  test(`${fmt} (${size} m): ${SEEDS} seeds are valid and pass every invariant`, () => {
    const f = rules.formats[fmt];
    assert.equal(f.size, size);
    let retried = 0;
    for (let s = 1; s <= SEEDS; s++) {
      const w = generateWorld(gen, { seed: s * 101, size: f.size, farmers: f.farmers, hunters: f.hunters });
      if (w.attempts > 1) retried++;
      checkWorld(w, f);
    }
    assert.ok(retried <= SEEDS * 0.25, `${retried} of ${SEEDS} needed a retry`);
  });
}

test('deterministic: same seed, same world (cells, levels, graph, hollows); different seed, different world', () => {
  const f = rules.formats['6v2'];
  for (const s of [3, 77, 4040]) {
    const a = generateWorld(gen, { seed: s, size: f.size, farmers: f.farmers, hunters: f.hunters });
    const b = generateWorld(gen, { seed: s, size: f.size, farmers: f.farmers, hunters: f.hunters });
    assert.equal(worldHash(a), worldHash(b));
    assert.deepEqual(JSON.stringify(a.graph), JSON.stringify(b.graph));
    assert.deepEqual(a.hollows.map(h => [h.x, h.z, h.entry, h.slots]), b.hollows.map(h => [h.x, h.z, h.entry, h.slots]));
    assert.deepEqual(a.metrics, b.metrics);
  }
  const x = generateWorld(gen, { seed: 5, size: 256, farmers: 5, hunters: 2 }), y = generateWorld(gen, { seed: 6, size: 256, farmers: 5, hunters: 2 });
  assert.notEqual(worldHash(x), worldHash(y));
});

test('golden hashes: the generator output for fixed seeds has not drifted (update on purpose with HVF_GOLDEN=print)', () => {
  const got = [1, 2, 3].map(s => worldHash(worldForFormat({ mapgen: gen, rules }, s, '5v2')));
  if (process.env.HVF_GOLDEN === 'print') { console.log(JSON.stringify(got)); return; }
  // the cross-engine spec (tests/hvf-mapgen.spec.js) checks Firefox and Chromium against node too
  assert.deepEqual(got, GOLDEN);
});

test('the feature vocabulary appears across seeds: all seven kinds, each named', () => {
  const seen = new Set();
  for (let s = 1; s <= 12; s++) for (const f of generateWorld(gen, { seed: s, size: 288, farmers: 6, hunters: 3 }).features) { seen.add(f.kind); if (f.kind !== 'stream') assert.ok(f.name, f.kind); }
  for (const k of ['pocketValley', 'briarMaze', 'pondIsland', 'ravineTrail', 'stoneRing', 'oldOrchard', 'deadfallWall', 'stream']) assert.ok(seen.has(k), k);
});

test('hollow entries: briar gaps, door trees, ramps (pocket valleys) and fords (pond islands) all occur', () => {
  const seen = new Set();
  for (let s = 1; s <= 10; s++) for (const h of generateWorld(gen, { seed: s, size: 256, farmers: 5, hunters: 2 }).hollows) seen.add(h.entry);
  for (const e of ['briar', 'tree', 'ramp', 'ford']) assert.ok(seen.has(e), e);
});

test('line of sight: trees block, ground cannot see onto a plateau, a plateau sees down', () => {
  const cols = 9, G = { cols, rows: 3, n: 27, inb: (x, z) => x >= 0 && z >= 0 && x < cols && z < 3 };
  const cells = new Uint8Array(27), level = new Uint8Array(27);
  assert.ok(lineOfSight(G, cells, level, 0, 1, 8, 1));
  cells[1 * cols + 4] = KIND.tree;
  assert.ok(!lineOfSight(G, cells, level, 0, 1, 8, 1));
  cells[1 * cols + 4] = KIND.grass;
  for (let x = 6; x < 9; x++) for (let z = 0; z < 3; z++) level[z * cols + x] = 1;
  for (let z = 0; z < 3; z++) cells[z * cols + 6] = KIND.cliff;
  assert.ok(!lineOfSight(G, cells, level, 0, 1, 8, 1), 'ground eye, plateau target');
  assert.ok(lineOfSight(G, cells, level, 8, 1, 0, 1), 'plateau eye looks down past its own cliff');
});

test('a world that cannot be valid throws a readable error after the retries', () => {
  const bad = JSON.parse(JSON.stringify(gen));
  bad.validate.forest = [0.99, 1];
  assert.throws(() => generateWorld(bad, { seed: 1, size: 192, farmers: 2, hunters: 1 }), /Could not generate a valid forest for seed 1: forest/);
  const one = buildWorld(bad, { seed: 1, size: 192, farmers: 2, hunters: 1 });
  assert.ok(one.problems.length);
});

test('generation time: median at most 150 ms on the largest map (node)', () => {
  const f = rules.formats['9v3'];
  generateWorld(gen, { seed: 999, size: f.size, farmers: f.farmers, hunters: f.hunters });   // warm up the JIT
  const t = [];
  // the VM is shared with other test runs: each seed is timed three times and its best run counts
  for (let s = 1; s <= 9; s++) {
    let best = 1e9;
    for (let k = 0; k < 3; k++) { const t0 = performance.now(); generateWorld(gen, { seed: s * 13, size: f.size, farmers: f.farmers, hunters: f.hunters }); best = Math.min(best, performance.now() - t0); }
    t.push(best);
  }
  t.sort((a, b) => a - b);
  assert.ok(t[4] <= 150, `median ${t[4].toFixed(0)} ms`);
});

test('the mode entry (js/sim/modes/hvf/index.js): formats match rules.json, seats validated by role, buildMap uses the seed', async () => {
  const { default: hvf, FORMATS } = await import('../js/sim/modes/hvf/index.js');
  assert.deepEqual(FORMATS, Object.keys(rules.formats));
  assert.equal(hvf.name, rules.title);
  const data = { hvf: { rules, mapgen: gen } };
  const seats = (f, h) => [...Array(f)].map(() => ({ role: 'farmer' })).concat([...Array(h)].map(() => ({ role: 'hunter' })));
  hvf.validate({ format: '5v2', players: seats(5, 2) }, data);
  assert.throws(() => hvf.validate({ format: '5v2', players: seats(4, 2) }, data), /5v2 needs 5 farmers and 2 hunters/);
  assert.throws(() => hvf.validate({ format: '5v2', players: [{ race: 'freeholds' }] }, data), /needs a role/);
  const a = hvf.buildMap(data, '3v1', { seed: 44 }), b = hvf.buildMap(data, '3v1', { seed: 44 });
  assert.equal(a.size, rules.formats['3v1'].size);
  assert.equal(worldHash(a), worldHash(b));
  assert.throws(() => hvf.createState(), /not playable yet/);
});
