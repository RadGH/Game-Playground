// node --test prototypes/farhold/tests/monuments.test.js
//
// 4.12, in the user's words: "Any sort of monuments that don't do anything currently need to do
// something, either part of a quest, or at the very least contain a chest nearby with loot."
//
// tests/poi.test.js already refuses a POI with no `gives` hook. That was not enough, and the play
// session showed why: the fourteen landmarks all HAVE a `gives` block, but the only code that read
// it was main.js's `atLandmark`, which is fed by the territory layer — not by the set pieces
// standing on the ground. So a player could walk up to the standing stones they could see and get
// nothing at all, which is exactly the complaint.
//
// The rule here is therefore stronger than poi.test's: every monument must have something PHYSICAL
// at it as well as a hook, and js/sites.js must be the thing that puts it down.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const src = f => readFileSync(join(here, f), 'utf8');

const landmarks = read('../data/landmarks.json');
const strongholds = read('../data/strongholds.json');
const worldbosses = read('../data/worldbosses.json');
const setpieces = read('../data/setpieces.json');
const balance = read('../data/balance.json');
const sitesSrc = src('../js/sites.js');

const MARKS = landmarks.landmarks || [];
const CHEST_KINDS = new Set(Object.keys(balance.chests?.kinds || {}));

test('4.12 — every monument has something to pick up, not just a line of text', () => {
  for (const m of MARKS) {
    const c = m.cache;
    assert.ok(c, `"${m.name}" has nothing at it. A monument with nothing to find is the bug.`);
    assert.ok(CHEST_KINDS.has(c.kind), `"${m.name}" keeps a "${c.kind}" chest, which balance.json has never heard of`);
    assert.ok(typeof c.name === 'string' && c.name.length > 4,
      `"${m.name}"'s cache has no name, so the reward screen would read "Chest" and tell you nothing about where you are`);
    assert.ok(c.at >= 4, `"${m.name}"'s cache is ${c.at} m out — inside the monument itself`);
    assert.ok(c.at <= 22, `"${m.name}"'s cache is ${c.at} m out — far enough away that you would never see it`);
  }
});

test('4.12 — the cache sits inside the set piece, not out in the field beside it', () => {
  const layouts = setpieces.layouts || {};
  for (const m of MARKS) {
    const l = layouts[m.kind];
    assert.ok(l, `"${m.name}" has no layout`);
    const widest = Math.max(
      12,
      ...(l.rings || []).map(r => (r.radius || 0) + (r.jitter || 0)),
      ...(l.scatter || []).map(r => r.radius || 0),
    );
    assert.ok(m.cache.at <= widest,
      `"${m.name}"'s cache is ${m.cache.at} m out and the place itself only reaches ${widest} m`);
  }
});

test('4.12 — every cache is named for its own place', () => {
  const names = MARKS.map(m => m.cache.name);
  assert.equal(new Set(names).size, names.length, 'two monuments keep an identically named cache');
  for (const m of MARKS) {
    assert.ok(!/^Chest$|^Cache$/i.test(m.cache.name), `"${m.name}" calls its cache "${m.cache.name}"`);
  }
});

test('4.12 — the grade is proportionate: a shrine is not a castle', () => {
  const grade = { wooden: 0, iron: 1, gilded: 2, warded: 3, meteorite: 3 };
  for (const m of MARKS) {
    // nothing standing unguarded beside a road pays a warded chest — that is what a castle is for
    assert.ok(grade[m.cache.kind] <= 2, `"${m.name}" keeps a ${m.cache.kind} chest with nothing guarding it`);
    // …and where the landmark already promises rare loot, the box should match it
    if (m.gives?.loot === 'rare') {
      assert.ok(grade[m.cache.kind] >= 2, `"${m.name}" promises rare loot and keeps a ${m.cache.kind} box`);
    }
  }
});

test('4.12 — js/sites.js is the thing that puts the cache down, and does it safely twice', () => {
  assert.match(sitesSrc, /function furnishLandmarks\(/, 'nothing places the monument caches any more');
  assert.match(sitesSrc, /furnishLandmarks\(px, pz\)/, 'furnishLandmarks is never called');
  assert.match(sitesSrc, /s\.cacheTaken/, 'a looted cache would come back — the monument becomes a farm');
  assert.match(sitesSrc, /chests\.chests\.includes\(s\.cacheChest\)/,
    'nothing notices a cache that was range-culled, so walking away and back would leave the monument empty again');
  assert.match(sitesSrc, /currentChests/, 'js/sites.js has no way to reach a chest field at all');
});

test('4.12 — and nothing else on the map is an empty visit either', () => {
  // the same rule, restated across all three files, so a new entry in any of them cannot slip past
  const everything = [
    ...MARKS.map(m => ({ what: m.name, chest: m.cache?.kind, gives: m.gives })),
    ...(strongholds.kinds || []).map(k => ({ what: k.name, chest: k.chest?.kind, gives: k.gives })),
    ...(worldbosses.bosses || []).map(b => ({ what: b.name, chest: b.chest?.kind, gives: b.gives })),
  ];
  assert.ok(everything.length >= 30, 'the places table has shrunk — did a file stop being read?');
  for (const p of everything) {
    assert.ok(CHEST_KINDS.has(p.chest), `"${p.what}" has no chest of any grade at it`);
    assert.ok(p.gives && Object.keys(p.gives).length, `"${p.what}" gives nothing`);
  }
});
