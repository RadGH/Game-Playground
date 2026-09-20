// Every `gives` key in data/landmarks.json has somebody who reads it.
//
// Nine of the sixteen were handled and seven were not, so seven kinds of landmark were a name, a
// blurb and no consequence whatever. The territory layer reads its own copy for the zone record,
// which is why it went unnoticed: the WORLD knew something had happened at the standing stones and
// the player never found out.
//
// This is a source test rather than a behaviour one on purpose. The handler lives in main.js, which
// imports Three.js and cannot be loaded under `node --test`; what CAN be checked, and is the thing
// that actually broke, is that no key in the data is missing from the code that dispatches them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const DATA = JSON.parse(readFileSync(new URL('../data/landmarks.json', import.meta.url)));
const MAIN = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

/** Every distinct `gives` key the data actually uses. */
function keysUsed(data) {
  const out = new Set();
  const walk = node => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (k === 'gives' && v && typeof v === 'object') for (const g of Object.keys(v)) out.add(g);
      else walk(v);
    }
  };
  walk(data);
  return [...out].sort();
}


/**
 * The whole of `atLandmark`, however long it grows.
 *
 * This used to be a flat 5000-character slice, which R14's own comments overran — and the failure
 * it produced ("nothing reads gives.callsPatrol") pointed at the data, not at the window. Counting
 * braces from the opening one cannot go stale.
 */
function landmarkHandler() {
  const at = MAIN.indexOf('function atLandmark');
  assert.ok(at > 0, 'atLandmark has moved or been renamed');
  let depth = 0;
  for (let i = MAIN.indexOf('{', at); i < MAIN.length; i++) {
    if (MAIN[i] === '{') depth++;
    else if (MAIN[i] === '}' && --depth === 0) return MAIN.slice(at, i + 1);
  }
  throw new Error('atLandmark never closes');
}

test('the data uses the keys we think it does', () => {
  const keys = keysUsed(DATA);
  assert.ok(keys.length >= 16, `only found ${keys.length} gives keys`);
  // the seven that were dead. Named individually so a regression says WHICH one came back.
  for (const dead of ['xp', 'curse', 'namesFoe', 'callsPatrol', 'reviveDaily', 'startsIncident', 'toll']) {
    assert.ok(keys.includes(dead), `${dead} is no longer in the data — drop it from this list`);
  }
});

test('atLandmark reads every one of them', () => {
  const body = landmarkHandler();
  assert.ok(body.includes('function atLandmark'), 'atLandmark has moved or been renamed');
  for (const key of keysUsed(DATA)) {
    assert.ok(new RegExp(`gives\\.${key}\\b`).test(body), `nothing reads gives.${key}`);
  }
});

test('the revive charge is spent as well as granted', () => {
  // the exact failure this round was about: a flag written and never read
  assert.ok(/player\.reviveCharge = 1/.test(MAIN), 'nothing grants a revive charge');
  assert.ok(/player\.reviveCharge--/.test(MAIN), 'nothing ever spends the revive charge');
  assert.ok(/reviveDay/.test(MAIN), '"daily" is not enforced — the charge would last for ever');
});

test('the toll deed is one the faction data knows about', () => {
  const factions = JSON.parse(readFileSync(new URL('../data/factions.json', import.meta.url)));
  const m = MAIN.match(/standings\.deed\(mark\.faction, '([a-z_]+)'\)/g) || [];
  assert.ok(m.length >= 2, 'the landmark handler files no deeds');
  for (const call of m) {
    const deed = call.match(/'([a-z_]+)'/)[1];
    assert.ok(factions.deeds[deed], `deed "${deed}" is not in data/factions.json`);
  }
});

/**
 * R14 — A LANDMARK PAYS ONCE.
 *
 *   "I found a node 'E look at field of cairns' and it allows me to repeatedly press E to gain
 *    infinite experience."
 *
 * `atLandmark` paid out the whole `gives` block on every press of E. Landmarks with `steps` were
 * safe by accident — `workLandmark` returns early until the last one — but twelve of the sixteen
 * kinds carry `solve: false`, have no steps and so had nothing stopping them at all.
 *
 * Two tests, because the bug has two halves: the ledger that remembers (testable for real) and the
 * handler that asks it (a source test, because main.js imports Three.js and will not load here).
 */
test('a landmark pays its one-off exactly once, for the life of the save', async () => {
  const { createTerritory } = await import('../js/territory.js');
  const factions = JSON.parse(readFileSync(new URL('../data/factions.json', import.meta.url)));
  const list = [{ id: 1, name: 'Menwin Weald', band: 1, minLevel: 5, maxLevel: 8, cells: [{ x: 20, y: 12 }], center: { x: 20, y: 12 } }];
  const zones = { zones: list, byId: id => list.find(z => z.id === id) || null, list: () => list.slice() };
  const land = createTerritory({ zones, seed: 11, factions, landmarks: DATA });
  const record = land.of(1);
  assert.ok(record, 'no territory record to hang a landmark on');
  record.landmarks.push({ id: 'lm1', kind: 'cairn_field', name: 'Field of Cairns', state: 'unvisited' });

  assert.equal(land.takeLandmark(1, 'lm1'), true, 'the first visit must pay');
  for (let i = 0; i < 20; i++) {
    assert.equal(land.takeLandmark(1, 'lm1'), false, 'holding E must never pay twice');
  }
  assert.equal(land.takeLandmark(1, 'nope'), false, 'an unknown landmark pays nothing');
  // and it has to survive a save, or reloading is the exploit
  assert.equal(record.landmarks.find(l => l.id === 'lm1').taken, true, 'the flag is not on the record that gets saved');
});

test('the one-off gives sit behind the gate and the standing ones do not', () => {
  const body = landmarkHandler();
  const gate = body.indexOf('takeLandmark');
  assert.ok(gate > 0, 'atLandmark no longer asks whether this landmark has already paid');
  const bail = body.indexOf('if (!firstTime)');
  assert.ok(bail > gate, 'nothing bails out when the landmark has already paid');

  // the reward, the punishment and the things that change the world: all AFTER the bail-out
  for (const key of ['xp', 'loot', 'perkPoint', 'curse', 'namesFoe', 'startsIncident', 'callsPatrol']) {
    const at = body.indexOf(`gives.${key}`);
    assert.ok(at > bail, `gives.${key} can still be farmed by holding E`);
  }
  // what a place goes on offering: BEFORE it, so coming back still works
  for (const key of ['rest', 'bench', 'crossing', 'toll', 'travelBonus', 'reviveDaily']) {
    const at = body.indexOf(`gives.${key}`);
    assert.ok(at > 0 && at < bail, `gives.${key} stopped working on the second visit`);
  }
});
