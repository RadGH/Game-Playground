// node --test prototypes/farhold/tests/campaign.test.js
// The spine: objectives counted from events the game already fires, standing that changes a price,
// and a nemesis that remembers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Campaign, CAMPAIGN_KINDS } from '../js/campaign.js';

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, '../data/campaign.json'), 'utf8'));
const fresh = () => new Campaign(data);

test('every objective is a kind the campaign can actually count', () => {
  assert.ok(data.objectives.length >= 6);
  for (const o of data.objectives) {
    assert.ok(CAMPAIGN_KINDS.includes(o.kind), `${o.id} is kind "${o.kind}", which nothing feeds`);
    assert.ok(o.target > 0 && o.name && o.desc);
  }
  assert.equal(new Set(data.objectives.map(o => o.id)).size, data.objectives.length);
});

test('a fresh survey is at nothing, and finishing everything completes it', () => {
  const c = fresh();
  assert.equal(c.complete, false);
  assert.equal(c.share, 0);

  c.onWalk(21000);
  for (const id of [1, 2, 3]) c.onLandOn(id);
  for (let i = 0; i < 6; i++) c.onEnterSettlement(i);
  for (let i = 0; i < 8; i++) c.onQuestDone({ kind: 'clear' }, 1);
  for (let i = 0; i < 100; i++) c.onKill('rat');
  c.onLoot({ rarity: 'legendary' });
  c.onDeath({ defId: 'wolf', name: 'Grix', level: 4 });
  c.onKill('wolf');

  assert.equal(c.complete, true);
  assert.equal(c.share, 1);
  for (const o of c.list()) assert.equal(o.done, true, `${o.name} never finished`);
});

test('the same world or town only counts once', () => {
  const c = fresh();
  for (let i = 0; i < 10; i++) { c.onLandOn(7); c.onEnterSettlement(3); }
  const worlds = c.list().find(o => o.kind === 'planets');
  const towns = c.list().find(o => o.kind === 'settlements');
  assert.equal(worlds.progress, 1);
  assert.equal(towns.progress, 1);
  assert.equal(c.onLandOn(7), false, 'charted the same world twice');
  assert.equal(c.onLandOn(8), true);
});

test('standing rises with work and eventually buys you a discount', () => {
  const c = fresh();
  assert.equal(c.reputationAt(1), 0);
  assert.equal(c.standing(1), 'a stranger');
  assert.equal(c.priceMultiplier(1), 1);

  for (let i = 0; i < 4; i++) c.onQuestDone({ kind: 'hunt' }, 1);
  assert.ok(c.reputationAt(1) >= data.reputation.discountAt, 'four jobs is not enough to be welcome');
  assert.ok(c.priceMultiplier(1) < 1, 'standing bought no discount');
  assert.notEqual(c.standing(1), 'a stranger');
  // and it is per settlement
  assert.equal(c.reputationAt(2), 0);
  assert.equal(c.priceMultiplier(2), 1);
  // it never runs past the cap
  for (let i = 0; i < 50; i++) c.onQuestDone({ kind: 'hunt' }, 1);
  assert.equal(c.reputationAt(1), data.reputation.max);
});

test('a nemesis is made by dying, gets worse, and is settled by killing it', () => {
  const c = fresh();
  assert.equal(c.nemesis, null);

  const first = c.onDeath({ defId: 'moor_hound', name: 'Grix', level: 5 });
  assert.ok(first.name && first.title, 'a nemesis with no name');
  assert.equal(first.defeats, 1);
  assert.equal(first.level, 6, 'a nemesis comes back one level harder');

  // dying to it again makes it worse, not a second nemesis.
  // NOTE: onDeath hands back the LIVE nemesis, so snapshot the number before comparing.
  const levelBefore = first.level;
  const again = c.onDeath({ defId: 'moor_hound', name: 'Grix', level: 6 });
  assert.equal(again, c.nemesis, 'a second death made a second nemesis');
  assert.equal(again.defeats, 2);
  assert.ok(again.level > levelBefore, `level went ${levelBefore} -> ${again.level}`);

  // killing something else does not settle it
  assert.equal(c.onKill('cairn_rat'), null);
  assert.ok(c.nemesis);

  assert.equal(c.onKill('moor_hound'), 'nemesis');
  assert.equal(c.nemesis, null);
  assert.equal(c.defeatedNemeses.length, 1);
  assert.equal(c.list().find(o => o.kind === 'nemesis').done, true);
});

test('the bestiary counts what you have killed', () => {
  const c = fresh();
  for (let i = 0; i < 5; i++) c.onKill('moor_hound');
  for (let i = 0; i < 2; i++) c.onKill('veil_spider');
  assert.equal(c.bestiary.moor_hound, 5);
  assert.equal(c.bestiary.veil_spider, 2);
});

test('the whole survey survives a save', () => {
  const c = fresh();
  c.onWalk(5000);
  c.onLandOn(2);
  c.onQuestDone({ kind: 'clear' }, 4);
  c.onKill('moor_hound');
  c.onDeath({ defId: 'veil_spider', name: 'Ith', level: 3 });

  const back = new Campaign(data, JSON.parse(JSON.stringify(c.toJSON())));
  assert.deepEqual(back.progress, c.progress);
  assert.equal(back.reputationAt(4), c.reputationAt(4));
  assert.equal(back.nemesis.name, 'Ith');
  assert.equal(back.bestiary.moor_hound, 1);
  // and it carries on from there rather than starting again
  assert.equal(back.onLandOn(2), false);
  assert.equal(back.onLandOn(9), true);
});

test('the survey is cut to fit a system that has nobody in it', () => {
  // the balance harness found 29% of systems with no inhabited world at all, where "walk into six
  // settlements" and "finish eight jobs" can never be done
  const dead = new Campaign(data).fit({ settlements: 0, planets: 2, dungeons: 0 });
  const kinds = dead.list().map(o => o.kind);
  assert.ok(!kinds.includes('settlements'), 'still asking for settlements in an empty system');
  assert.ok(!kinds.includes('quests'), 'still asking for jobs with nobody to give them');
  assert.ok(!kinds.includes('dungeons'), 'still asking for ruins where there are none');
  assert.equal(kinds.filter(k => k === 'kills').length, 1, 'two objectives counting the same kills');
  assert.ok(dead.list().find(o => o.kind === 'planets').target <= 2, 'asking for more worlds than exist');

  // and what is left really can be finished
  dead.onWalk(21000);
  dead.onLandOn(1); dead.onLandOn(2);
  for (let i = 0; i < 300; i++) dead.onKill('rat');
  dead.onLoot({ rarity: 'legendary' });
  dead.onDeath({ defId: 'w', name: 'X', level: 1 });
  dead.onKill('w');
  assert.equal(dead.complete, true, 'an empty system leaves an unfinishable survey');
});

test('a lived-in system keeps the whole survey', () => {
  const full = new Campaign(data).fit({ settlements: Infinity, planets: 5, dungeons: 30 });
  assert.equal(full.objectives.length, data.objectives.length);
  for (const o of data.objectives) {
    const kept = full.objectives.find(k => k.id === o.id);
    assert.ok(kept, `${o.id} was dropped from a system that can support it`);
    if (o.kind !== 'planets') assert.equal(kept.target, o.target);
  }
});
