// you.bar (D's ask 5, C's rules.bar): the skill bar rides on `joined` and comes again in a `you` patch after a
// level-up, a form/stance change (the rules' fx 'form' event) or room.barChanged (a talent pick) — never per tick.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { makeServer, joinAs, run, ent, roomOf } from './helpers.js';

let createRules = null, why = '';
try { ({ createRules } = await import('../../js/rules/index.js')); } catch (err) { why = err.message; }

test('you.bar: on joined, after a level-up, a form change and barChanged; not per tick', { skip: !createRules && ('rules failed to load: ' + why) }, async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock, worldOpts: { createRules } });
  await srv.ready;
  const a = await joinAs(srv, clock, 'Barholder', 'warrior');
  const bar = a.joined.you.bar;
  assert.ok(Array.isArray(bar) && bar.length === 6, 'six slots on joined');
  assert.deepEqual(bar.map(s => s.slot), [1, 2, 3, 4, 5, 6]);
  for (const s of bar) for (const k of ['id', 'name', 'desc', 'cd', 'mp', 'level', 'locked', 'ally', 'group']) assert.ok(k in s, 'slot field ' + k);
  assert.ok(bar.some(s => s.id && !s.locked), 'at least one usable skill at level 1');

  const patches = [];
  a.on('you', p => patches.push(p));
  await run(clock, 2000);
  assert.equal(patches.filter(p => p.bar).length, 0, 'no bar while nothing changes');

  // level-up
  const e = ent(srv, a), room = roomOf(srv, a);
  const lockedBefore = bar.filter(s => s.locked).length;
  room.award(e, { xp: 100000, reason: 'test' });
  await run(clock, 200);
  const up = patches.filter(p => p.bar);
  assert.equal(up.length, 1, 'one bar after the level-up');
  assert.ok(a.joined.you.level > 1);
  assert.ok(up[0].bar.filter(s => s.locked).length < lockedBefore, `levelling unlocks slots (${lockedBefore} locked before)`);
  assert.deepEqual(a.joined.you.bar, up[0].bar, 'the client merges it into you');

  // a form/stance change (what cast-skills emits) and a talent pick (barChanged)
  room.event({ type: 'fx', kind: 'form', id: e.id, form: 'test', on: true });
  await run(clock, 200);
  assert.equal(patches.filter(p => p.bar).length, 2, 'bar after a form change');
  room.barChanged(e);
  await run(clock, 200);
  assert.equal(patches.filter(p => p.bar).length, 3, 'bar after barChanged');
  assert.equal(srv.world.status().rulesErrors, 0);
  a.close(); await srv.stop();
});

test('you.bar: the stand-in rules have no bar, so joined carries none', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock });
  await srv.ready;
  const a = await joinAs(srv, clock, 'Nobar', 'warrior');
  assert.equal(a.joined.you.bar, undefined);
  a.close(); await srv.stop();
});
