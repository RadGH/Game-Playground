// The shape of every zone map (round 20). The act-2 maps used to open seven branches at once and
// carried a couple of trails that jumped from the first node most of the way to the boss, so a player
// could walk straight past the middle of an act. tools/expand-emberveil-map.mjs `normalizeZones()`
// rewires the trails; these tests are what "a clean road" means, checked for every zone:
//
//   • connected: every node is walkable from the entrance and every trail points at a real node
//   • narrow: no column holds more than 4 nodes, and no node offers more than 3 ways forward
//   • no shortcuts: every trail joins one column to the very next one (never a jump of 2+)
//   • even distances: every route from the entrance to the boss is the same number of moves, and the
//     trails the map draws are all about the same length
//   • the boss is the last thing in the zone, on his own
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const MAX_WIDTH = 4;        // branches open at once
const MAX_EXITS = 3;        // ways forward from one node
const MAX_EDGE_DROP = 46;   // how far a trail may slope on the drawn map (the column is 74 tall)

const zonesJson = JSON.parse(fs.readFileSync(new URL('../data/zones.json', import.meta.url)));
const zones = Object.values(zonesJson).filter(Array.isArray).flat().filter(z => z?.id && z.nodes?.length);

/** Where the party walks in: the node called `start`, else the one nothing points at. */
function startOf(z) {
  const byId = Object.fromEntries(z.nodes.map(n => [n.id, n]));
  if (byId.start) return byId.start;
  const targets = new Set(z.nodes.flatMap(n => (n.exits || []).filter(e => byId[e])));
  return z.nodes.find(n => !targets.has(n.id)) || z.nodes[0];
}
/** Moves from the entrance to each node (the map draws this as the column). */
function depths(z) {
  const byId = Object.fromEntries(z.nodes.map(n => [n.id, n]));
  const d = { [startOf(z).id]: 0 }; const q = [startOf(z).id];
  while (q.length) { const id = q.shift(); for (const e of byId[id]?.exits || []) if (byId[e] && d[e] == null) { d[e] = d[id] + 1; q.push(e); } }
  return d;
}
/** The columns, in order. */
function columns(z) { const d = depths(z); const cols = []; for (const n of z.nodes) { const k = d[n.id]; if (k == null) continue; (cols[k] ||= []).push(n); } return cols; }

test('every zone is one connected road: no stranded nodes, no trails to nowhere', () => {
  const bad = [];
  for (const z of zones) {
    const ids = new Set(z.nodes.map(n => n.id)); const d = depths(z);
    for (const n of z.nodes) {
      if (d[n.id] == null) bad.push(`${z.id}: ${n.id} cannot be walked to from the entrance`);
      for (const e of n.exits || []) if (!ids.has(e)) bad.push(`${z.id}: ${n.id} has a trail to ${e}, which is not in this zone`);
    }
  }
  assert.deepEqual(bad, []);
});

test('no zone opens more than four branches at once, and no node offers more than three ways on', () => {
  const bad = [];
  for (const z of zones) {
    columns(z).forEach((list, k) => { if (list.length > MAX_WIDTH) bad.push(`${z.id}: column ${k} holds ${list.length} nodes (max ${MAX_WIDTH})`); });
    for (const n of z.nodes) if ((n.exits || []).length > MAX_EXITS) bad.push(`${z.id}: ${n.id} offers ${(n.exits || []).length} ways on (max ${MAX_EXITS})`);
  }
  assert.deepEqual(bad, []);
});

test('no shortcuts: every trail joins one column to the very next one', () => {
  const bad = [];
  for (const z of zones) {
    const d = depths(z);
    for (const n of z.nodes) for (const e of n.exits || []) {
      if (d[n.id] == null || d[e] == null) continue;
      const span = d[e] - d[n.id];
      if (span !== 1) bad.push(`${z.id}: ${n.id} → ${e} spans ${span} columns (must be 1)`);
    }
  }
  assert.deepEqual(bad, []);
});

test('every route to the boss is the same length, and the boss is alone at the end of it', () => {
  const bad = [];
  for (const z of zones) {
    const boss = z.nodes.find(n => n.type === 'boss'); if (!boss) continue;
    const cols = columns(z); const d = depths(z);
    if (d[boss.id] !== cols.length - 1) bad.push(`${z.id}: the boss sits in column ${d[boss.id]} of ${cols.length - 1} — the party can skip the rest of the act`);
    if (cols[cols.length - 1].length !== 1) bad.push(`${z.id}: the last column holds ${cols[cols.length - 1].length} nodes, not just the boss`);
    // with every trail one column long, the longest and shortest walk are the same by construction;
    // this catches a dead end that would strand the party short of the boss
    for (const n of z.nodes) if (n !== boss && !(n.exits || []).length) bad.push(`${z.id}: ${n.id} is a dead end`);
  }
  assert.deepEqual(bad, []);
});

test('the trails the map draws are all about the same length', () => {
  // mirrors js/main.js layoutZone(): column = depth across the width, row = spread down the column
  const bad = [];
  for (const z of zones) {
    const d = depths(z); const cols = columns(z); const maxD = cols.length - 1;
    const pos = {};
    cols.forEach((list, k) => {
      const sorted = [...list].sort((a, b) => (a.y ?? 0.5) - (b.y ?? 0.5));
      sorted.forEach((n, i) => { pos[n.id] = [7 + (maxD ? k / maxD : 0.5) * 82, sorted.length === 1 ? 50 : 12 + (i / (sorted.length - 1)) * 74]; });
    });
    const step = maxD ? 82 / maxD : 0;
    for (const n of z.nodes) for (const e of n.exits || []) {
      if (!pos[n.id] || !pos[e]) continue;
      const dx = pos[e][0] - pos[n.id][0], dy = Math.abs(pos[e][1] - pos[n.id][1]);
      if (Math.abs(dx - step) > 0.001) bad.push(`${z.id}: ${n.id} → ${e} is ${dx.toFixed(1)} across, not one column (${step.toFixed(1)})`);
      if (dy > MAX_EDGE_DROP) bad.push(`${z.id}: ${n.id} → ${e} drops ${dy.toFixed(1)} down the map (max ${MAX_EDGE_DROP})`);
    }
  }
  assert.deepEqual(bad, []);
});

test('the act-2 maps (the Ashen Wastes) read as a road, not a fan', () => {
  for (const id of ['dust_roads', 'ember_plateau']) {
    const z = zones.find(x => x.id === id); assert.ok(z, `${id} is missing`);
    const cols = columns(z);
    assert.ok(cols.length >= 6, `${id} is only ${cols.length} columns deep — an act should be a journey`);
    assert.equal(cols[0].length, 1, `${id} should start at one place`);
    assert.ok(Math.max(...cols.map(c => c.length)) <= MAX_WIDTH, `${id} opens too many branches at once`);
    assert.ok(cols[1].length <= 3, `${id} fans out too fast at the first fork`);
  }
});
