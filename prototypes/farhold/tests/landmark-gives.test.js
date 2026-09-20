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

test('the data uses the keys we think it does', () => {
  const keys = keysUsed(DATA);
  assert.ok(keys.length >= 16, `only found ${keys.length} gives keys`);
  // the seven that were dead. Named individually so a regression says WHICH one came back.
  for (const dead of ['xp', 'curse', 'namesFoe', 'callsPatrol', 'reviveDaily', 'startsIncident', 'toll']) {
    assert.ok(keys.includes(dead), `${dead} is no longer in the data — drop it from this list`);
  }
});

test('atLandmark reads every one of them', () => {
  const body = MAIN.slice(MAIN.indexOf('function atLandmark'), MAIN.indexOf('function atLandmark') + 5000);
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
