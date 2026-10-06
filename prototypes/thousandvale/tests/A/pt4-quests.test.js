// Play-test 4 S10 (stream A + E): most quests are turned in remotely — a finished quest pays itself where you stand;
// the few with `needsGiver` (a trainer handing over a companion) still want the walk back; `quest {op:'turnin', id}`
// with no npc hands in a finished quest from the journal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { realServer, joinReal, rec, run } from './pt1-helpers.js';

test('S10: remote turn-in from the journal; needsGiver quests refuse it; few quests need the giver', async () => {
  const dir = new URL('../../data/quests/', import.meta.url);
  const all = readdirSync(dir).filter(f => f.endsWith('.json')).flatMap(f => { const d = JSON.parse(readFileSync(new URL(f, dir))); return Array.isArray(d.quests) ? d.quests : []; });
  const need = all.filter(q => q.needsGiver);
  assert.ok(need.length > 0 && need.length <= all.length * 0.2, 'a few, not most: ' + need.length + '/' + all.length);
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Farhander', 'priest');
  const o = rec(world, a);
  const qr = [], logs = []; a.on('questR', m => qr.push(m)); a.on('quests', m => logs.push(m));
  const book = world.P.values().next().value.book;
  // a finished ordinary quest (put straight into the log as finished) hands in from anywhere
  const plain = [...book.defs.values()].find(d => !d.needsGiver && !d.job && d.steps.length);
  o.char.quests.active[plain.id] = { step: plain.steps.length, n: 0 };
  const g0 = o.char.gold || 0, x0 = o.char.xp || 0;
  a.quest('turnin', plain.id); await run(clock, 400);
  const r = qr.find(x => x.id === plain.id);
  assert.ok(r && r.ok && r.remote, JSON.stringify(r));
  assert.ok(o.char.quests.done[plain.id]);
  assert.ok((o.char.xp || 0) > x0 || (o.char.gold || 0) > g0, 'paid');
  // a needsGiver quest: ready but not paid remotely
  const cq = book.defs.get('class_priest');
  assert.equal(cq.needsGiver, true);
  o.char.quests.active.class_priest = { step: cq.steps.length, n: 0 };
  a.quest('turnin', 'class_priest'); await run(clock, 400);
  const r2 = qr.filter(x => x.id === 'class_priest').pop();
  assert.equal(r2.ok, false); assert.equal(r2.why, 'giver');
  assert.ok(o.char.quests.active.class_priest, 'still in the log, waiting for the trainer');
  assert.deepEqual(book.autoDone(o.char), [], 'not auto-paid either');
  // the log tells the client which is which
  a.quest('abandon', 'class_priest'); await run(clock, 300);
  a.close(); await srv.stop();
});
