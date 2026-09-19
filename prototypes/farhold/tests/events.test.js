// node --test prototypes/farhold/tests/events.test.js
//
// "Add more events like that too, to give the world more things to do as you wander around."
//
// data/encounters.json already held eleven set pieces and every one of them was the same verb:
// bodies appear, you fight them. So the rule this file enforces is that data/events.json is NOT
// more of that — it must cover five different BEATS, and every one of those beats must have a
// branch in js/encounters.js that can actually finish it. An event whose kind nothing ticks is an
// announcement about something that never resolves, which is worse than no event at all.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const src = f => readFileSync(join(here, f), 'utf8');

const events = read('../data/events.json');
const setPieces = read('../data/encounters.json');
const bestiary = read('../data/enemies.json');
const balance = read('../data/balance.json');
const encSrc = src('../js/encounters.js');
const chestSrc = src('../js/chests.js');

const EVENTS = events.events || [];
const KINDS = ['rescue', 'chase', 'defend', 'trap', 'find'];
const CHEST_KINDS = new Set(Object.keys(balance.chests?.kinds || {}));
const FAMILIES = new Set((bestiary.enemies || []).map(e => e.family));
const ROLES = new Set((bestiary.enemies || []).map(e => e.role));

test('5.2 — there are more things to do, and they are different KINDS of thing', () => {
  assert.ok(EVENTS.length >= 10, `${EVENTS.length} events is not "more things to do"`);
  for (const kind of KINDS) {
    const n = EVENTS.filter(e => e.kind === kind).length;
    assert.ok(n >= 2, `only ${n} "${kind}" event — a beat with one entry is a one-off, not a kind`);
  }
  for (const e of EVENTS) {
    assert.ok(KINDS.includes(e.kind), `"${e.id}" is a "${e.kind}", which is not a beat anything ticks`);
  }
  // and at least one of them is not a fight at all, which was the actual ask about curiosity
  assert.ok(EVENTS.some(e => e.kind === 'find' && !e.count),
    'every event still ends in combat — nothing rewards simply walking off the road');
});

test('5.2 — every beat has a branch in js/encounters.js that can finish it', () => {
  for (const kind of KINDS) {
    assert.ok(encSrc.includes(`ev.kind === '${kind}'`) || kind === 'find',
      `js/encounters.js has no branch for a "${kind}" event`);
  }
  // `find` is the fall-through at the bottom of tickEvents, and it must WAIT for the lid: paying the
  // line out two lines under the announcement read as "you have already got it" while the box was
  // still forty metres off.
  assert.match(encSrc, /FIND: the chest IS the whole event/, 'the find beat lost its fall-through');
  assert.match(encSrc, /if \(ev\.chest\?\.opened\) \{ onLog\(spec\.win/, 'a find pays its line before the chest is opened again');
  assert.match(encSrc, /function tickEvents\(/, 'nothing ticks the events any more');
  assert.match(encSrc, /tickEvents\(dt, at\);/, 'tickEvents is never called — every event would hang open');
  assert.match(encSrc, /function runEvent\(/, 'nothing starts an event');
  assert.match(encSrc, /rewardBag/, 'a won rescue or chase pays nothing');
  assert.match(chestSrc, /function rewardBag\(/, 'js/chests.js no longer drops a reward bag');
  assert.match(chestSrc, /function remove\(chest\)/, 'js/chests.js cannot take a box away — a lost defend would keep its prize');
});

test('5.2 — nothing collides with the eleven set pieces', () => {
  const ids = new Set((setPieces.encounters || []).map(e => e.id));
  for (const e of EVENTS) {
    assert.ok(!ids.has(e.id), `"${e.id}" is already a set piece in data/encounters.json`);
    assert.ok(!e.kind || !(setPieces.encounters || []).some(s => s.kind), 'a set piece has grown a kind');
  }
  const own = EVENTS.map(e => e.id);
  assert.equal(new Set(own).size, own.length, 'two events share an id');
});

test('5.2 — every event says what it is, and pays something', () => {
  for (const e of EVENTS) {
    assert.ok(e.weight > 0, `${e.id} has no weight, so it can never be rolled`);
    assert.ok(typeof e.announce === 'string' && e.announce.length > 12, `${e.id} does not announce itself`);
    assert.ok(typeof e.desc === 'string' && e.desc.length > 20, `${e.id} has no description for the next person reading this file`);
    assert.ok(['ring', 'ahead', 'close'].includes(e.where), `${e.id} is placed "${e.where}", which js/encounters.js does not understand`);
    assert.ok(e.bait || e.reward, `${e.id} pays nothing — then walking over is a waste of the player's time`);
    if (e.bait) assert.ok(CHEST_KINDS.has(e.bait.kind), `${e.id}'s bait is a "${e.bait.kind}" chest, which balance.json has never heard of`);
    if (e.reward?.kind) assert.ok(CHEST_KINDS.has(e.reward.kind), `${e.id} pays a "${e.reward.kind}" bag, which balance.json has never heard of`);
    if (e.reward) assert.ok(['bag', 'chest'].includes(e.reward.as), `${e.id} pays out "as" a ${e.reward.as}`);
  }
});

test('5.2 — each beat carries the numbers its own rule reads', () => {
  for (const e of EVENTS) {
    if (e.kind === 'rescue') {
      assert.ok(Array.isArray(e.count) && e.count[0] >= 3, `${e.id} is a rescue with ${e.count?.[0]} guards on it`);
      assert.equal(e.reward?.as, 'bag', `${e.id} is a rescue and has to pay a bag — there is nothing there to open`);
    }
    if (e.kind === 'chase') {
      assert.ok(e.seconds > 0, `${e.id} is a chase with no clock`);
      assert.ok(e.escapeAt > 0, `${e.id} is a chase you can never lose`);
      assert.deepEqual(e.escort, [0, 0], `${e.id} is a chase and brings friends — you would fight, not chase`);
      assert.deepEqual(e.count, [1, 1], `${e.id} is a chase with more than one runner`);
      assert.ok(e.forceRank, `${e.id}'s runner is an ordinary body, so catching it is worth nothing`);
    }
    if (e.kind === 'defend') {
      assert.ok(e.seconds > 0, `${e.id} is a defend with no clock, so it can never be lost`);
      assert.ok(e.bait, `${e.id} is a defend with nothing to defend`);
      assert.ok(e.aggro, `${e.id} is a defend and the attackers are asleep`);
      assert.ok(e.fail, `${e.id} loses silently`);
    }
    if (e.kind === 'trap') {
      assert.ok(e.springAt > 0, `${e.id} is a trap that never springs`);
      assert.ok(e.bait, `${e.id} is a trap with no bait, which is just an ambush`);
      assert.ok(e.aggro, `${e.id} springs a trap and everything in it stands about`);
      assert.ok(e.count?.[0] >= 4, `${e.id} springs ${e.count?.[0]} bodies — not worth the walk over`);
    }
    if (e.kind === 'find') {
      assert.ok(e.bait, `${e.id} is a find with nothing to find`);
      assert.ok(!e.count, `${e.id} is a find and spawns bodies — then it is a trap, and should say so`);
      assert.ok(e.win, `${e.id} is found in silence`);
    }
  }
});

test('5.2 — nothing asks the bestiary for a family or a role it does not have', () => {
  for (const e of EVENTS) {
    for (const f of e.prefer?.families || []) assert.ok(FAMILIES.has(f), `${e.id} wants a "${f}" and the bestiary has none`);
    for (const r of e.prefer?.roles || []) assert.ok(ROLES.has(r), `${e.id} wants a "${r}" and the bestiary has none`);
  }
});

test('5.2 — a night event is a night event, and the pool is never empty in daylight', () => {
  const day = EVENTS.filter(e => !e.nightOnly);
  assert.ok(day.length >= 8, 'too much of the file is night-only — a daytime walk would see the same few');
  for (const kind of KINDS) {
    assert.ok(day.some(e => e.kind === kind), `every "${kind}" event is night-only`);
  }
});

test('5.2 — the reward climbs with what the beat asks of you', () => {
  // a find is free and pays an iron box; a chase is a clock and a distance and pays better.
  const grade = { wooden: 0, iron: 1, gilded: 2, warded: 3, meteorite: 3 };
  const best = kind => Math.max(...EVENTS.filter(e => e.kind === kind)
    .map(e => grade[e.reward?.kind || e.bait?.kind] ?? 0));
  assert.ok(best('find') <= best('chase'), 'finding something for free pays better than running something down');
  assert.ok(best('find') <= best('defend'), 'finding something for free pays better than holding ground for 75 seconds');
});
