// node --test prototypes/farhold/tests/quests.test.js
// Jobs have to point at things that exist, and only ever advance through events.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeQuest, QuestLog, QUEST_KINDS } from '../js/quests.js';
import { makeRng } from '../../emberveil/js/rng.js';

const here = dirname(fileURLToPath(import.meta.url));
const bestiary = JSON.parse(readFileSync(join(here, '../data/enemies.json'), 'utf8')).enemies;

const NODES = [
  { id: 1, type: 'settlement', name: 'Ashford', x: 10, y: 10, size: 3 },
  { id: 2, type: 'settlement', name: 'Belhaven', x: 40, y: 22, size: 2 },
  { id: 3, type: 'dungeon', name: 'The Sunken Hold', x: 25, y: 31 },
  { id: 4, type: 'landmark', name: 'Grey Monolith', x: 8, y: 44 },
];
const GIVER = { id: 'n1', name: 'Petra' };
const ctx = (extra = {}) => ({ rng: makeRng(7), level: 5, giver: GIVER, enemies: bestiary, nodes: NODES, from: NODES[0], ...extra });

test('every kind of job builds, and points at something real', () => {
  for (const kind of QUEST_KINDS) {
    const q = makeQuest(kind, ctx());
    assert.ok(q, `${kind} produced nothing`);
    assert.equal(q.kind, kind);
    assert.ok(q.title.length > 4, `${kind} has no title`);
    assert.ok(q.text.length > 10);
    assert.ok(q.reward.gold > 0 && q.reward.xp > 0);
    assert.equal(q.progress, 0);
    assert.equal(q.done, false);
    if (kind === 'hunt' || kind === 'clear') {
      assert.ok(bestiary.some(e => e.id === q.target), `${kind} targets ${q.target}, which is not in the bestiary`);
      assert.ok(q.count >= 1);
    }
    if (kind === 'visit' || kind === 'clear') {
      assert.ok(q.place, `${kind} has nowhere to go`);
      assert.ok(NODES.some(n => n.name === q.place.name), `${kind} sends you to ${q.place.name}, which is not on the map`);
    }
  }
});

test('a job never sends you where you already are', () => {
  for (let seed = 1; seed < 40; seed++) {
    const q = makeQuest('visit', ctx({ rng: makeRng(seed) }));
    if (!q) continue;
    assert.notEqual(q.place.name, NODES[0].name, 'sent to the town you are standing in');
  }
});

test('the target is something a player of this level can face', () => {
  for (const level of [1, 5, 12, 25]) {
    for (let seed = 1; seed < 12; seed++) {
      const q = makeQuest('hunt', ctx({ level, rng: makeRng(seed) }));
      const def = bestiary.find(e => e.id === q.target);
      assert.ok(def, 'unknown target');
      assert.ok((def.minLevel ?? 1) <= level + 3, `level ${level} sent after ${def.name} (min ${def.minLevel})`);
    }
  }
});

test('kills, arrivals and loot are the only things that move a job on', () => {
  const log = new QuestLog();
  const hunt = log.add(makeQuest('hunt', ctx()));
  const target = hunt.target;

  // the wrong creature does nothing
  log.onKill({ defId: '__nothing__' });
  assert.equal(hunt.progress, 0);

  for (let i = 0; i < hunt.count; i++) log.onKill({ defId: target });
  assert.equal(hunt.progress, hunt.count);
  assert.equal(hunt.done, true);
  // and it stops counting once it is done
  log.onKill({ defId: target });
  assert.equal(hunt.progress, hunt.count);

  const visit = log.add(makeQuest('visit', ctx({ rng: makeRng(3) })));
  log.onArrive({ x: visit.place.x + 5000, z: visit.place.z });
  assert.equal(visit.done, false, 'arrived from 5 km away');
  log.onArrive({ x: visit.place.x + 20, z: visit.place.z + 20 });
  assert.equal(visit.done, true);

  const gather = log.add(makeQuest('gather', ctx({ rng: makeRng(9) })));
  log.onLoot({ baseKey: 'not_it' });
  assert.equal(gather.progress, 0);
  for (let i = 0; i < gather.count; i++) log.onLoot({ baseKey: gather.target });
  assert.equal(gather.done, true);
});

test('only the person who gave it will pay for it, and only once', () => {
  const log = new QuestLog();
  const q = log.add(makeQuest('hunt', ctx()));
  for (let i = 0; i < q.count; i++) log.onKill({ defId: q.target });

  assert.equal(log.readyToTurnIn('somebody-else').length, 0);
  const ready = log.readyToTurnIn(GIVER.id);
  assert.equal(ready.length, 1);

  const reward = log.turnIn(ready[0]);
  assert.ok(reward.gold > 0);
  assert.equal(log.active.length, 0);
  assert.equal(log.finished.length, 1);
  assert.equal(log.readyToTurnIn(GIVER.id).length, 0, 'paid out twice');
});

test('the log survives a save and a load', () => {
  const log = new QuestLog();
  log.add(makeQuest('hunt', ctx()));
  log.add(makeQuest('gather', ctx({ rng: makeRng(5) })));
  log.onKill({ defId: log.active[0].target });

  const json = JSON.parse(JSON.stringify(log.toJSON()));
  const back = QuestLog.fromJSON(json);
  assert.equal(back.active.length, 2);
  assert.equal(back.active[0].progress, 1);
  assert.equal(back.progressText(back.active[0]), `1 / ${back.active[0].count}`);
});
