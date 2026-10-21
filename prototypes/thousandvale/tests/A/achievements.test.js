// Feedback #106 / #107 (2026-10-21): achievements with rewards by post, trophies, realm firsts, the feedback achievements,
// and links in chat — through a real realm (gateway + province on the loopback server).
// Run: node --test prototypes/thousandvale/tests/A/achievements.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { realServer, joinReal, rec, run, until } from './pt1-helpers.js';
import { createAchievements } from '../../js/sim/achievements.js';

const DATA = JSON.parse(readFileSync(new URL('../../data/rules/achievements.json', import.meta.url), 'utf8'));

test('the module: counts, grants once, posts the reward, keeps trophies counted, lists progress', () => {
  const mails = [], told = [];
  const A = createAchievements({ data: DATA, now: () => 1000, mail: m => { mails.push(m); return { ok: true }; }, tell: (o, m) => told.push(m) });
  const o = { char: { id: 7, name: 'Testa', level: 4 } };
  A.track(o, 'kill', 99);
  assert.equal(A.has(o, 'kill100'), false);
  A.track(o, 'kill');
  assert.equal(A.has(o, 'kill100'), true);
  assert.equal(mails.length, 1); assert.equal(mails[0].gold, 30); assert.match(mails[0].subject, /Blooded/);
  A.track(o, 'kill', 5);
  assert.equal(mails.length, 1, 'never twice');
  A.set(o, 'level', 10);
  assert.ok(A.has(o, 'lv5') && A.has(o, 'lv10') && !A.has(o, 'lv15'));
  A.set(o, 'feedback', 1, { quiet: true });
  assert.ok(A.has(o, 'feedback1')); assert.equal(mails.length, 3, 'a quiet grant (the gift letter already paid it) posts nothing');
  A.trophy(o, 'worldboss', { key: 'world_grimtallow', boss: 'Grimtallow, the Siege-Husk' });
  const t = A.trophy(o, 'worldboss', { key: 'world_grimtallow', boss: 'Grimtallow, the Siege-Husk' });
  assert.equal(t.n, 2); assert.equal(t.name, 'Grimtallow, the Siege-Husk Felled');
  const v = A.view(o);
  assert.equal(v.points, 4); assert.equal(v.trophies.length, 1);
  assert.deepEqual(v.list.find(r => r.id === 'kill1000') && [v.list.find(r => r.id === 'kill1000').n, v.list.find(r => r.id === 'kill1000').of], [105, 1000]);
  assert.ok(told.some(m => m.t === 'ach' && m.id === 'kill100') && told.some(m => m.t === 'trophy'));
});

test('in the realm: a level reached posts its reward, the first to 20 is a Realm First said to everyone (once), lists and links', async () => {
  const { srv, clock, world, store } = await realServer();
  const a = await joinReal(srv, clock, 'Firstling'), b = await joinReal(srv, clock, 'Secondly');
  const oa = rec(world, a), ob = rec(world, b);
  const achA = [], trophyA = [], chatB = [], listA = [], linkA = [], trophyB = [];
  a.on('ach', m => achA.push(m)); a.on('trophy', m => trophyA.push(m)); a.on('achList', m => listA.push(m)); a.on('linkR', m => linkA.push(m));
  b.on('chat', m => chatB.push(m)); b.on('trophy', m => trophyB.push(m));
  world.devSetLevel(oa.char.id, 20);
  await until(clock, () => achA.some(m => m.id === 'lv20'), 6000);
  assert.ok(achA.some(m => m.id === 'lv5') && achA.some(m => m.id === 'lv10'), 'the steps on the way count too');
  await until(clock, () => trophyA.some(t => t.kind === 'realmFirst'), 6000);
  assert.ok(chatB.some(m => m.ch === 'system' && /Realm first!.*Firstling/.test(m.text)), 'everyone hears it');
  const first = await store.getWorld('first:lv20');
  assert.equal(first.names[0], 'Firstling');
  world.devSetLevel(ob.char.id, 20);
  await run(clock, 3000);
  assert.equal(trophyB.filter(t => t.kind === 'realmFirst').length, 0, 'the second one there is not first');
  // the reward came by post
  await run(clock, 500);
  const box = await store.mailList(oa.char.id);
  assert.ok(box.some(m => /Achievement: Veteran of the Vale/.test(m.subject) && m.gold === 300), JSON.stringify(box.map(m => m.subject)));
  // the window's list
  a.achievements(); await until(clock, () => listA.length > 0, 3000);
  assert.ok(listA[0].points >= 3 && listA[0].trophies.some(t => t.kind === 'realmFirst'));
  // links: an achievement you hold (yes), one you do not (no), an item in your bag (yes), seen by someone in /say range
  a.link('ach', 'lv20'); a.link('ach', 'lv30');
  const it = oa.char.bag.find(i => i.uid != null);
  if (it) a.link('item', it.uid);
  await until(clock, () => linkA.length >= (it ? 3 : 2), 3000);
  const okAch = linkA.find(r => r.ok && r.kind === 'ach'), noAch = linkA.find(r => !r.ok);
  assert.ok(okAch && noAch, JSON.stringify(linkA));
  world.transfer(ob, oa.room, { x: oa.entity.x + 2, z: oa.entity.z }, 'test'); await run(clock, 500);
  const okItem = linkA.find(r => r.ok && r.kind === 'item');
  a.say(`look [[${okAch.id}]]${okItem ? ` and [[${okItem.id}]]` : ''}`); await run(clock, 500);
  const said = chatB.find(m => m.ch === 'say' && m.links);
  assert.ok(said && said.links[okAch.id]?.label === 'Veteran of the Vale', JSON.stringify(said));
  if (okItem) assert.equal(said.links[okItem.id].item.name, it.name);
  a.close(); b.close(); await srv.stop();
});

test('feedback: the first report counts (its gift letter is the reward), a report marked done earns Heard and Built at the next log-in', async () => {
  const { srv, clock, world, store } = await realServer();
  const { makeClient, waitP } = await import('./helpers.js');
  const { memoryTokenStore } = await import('../../js/net/client.js');
  const tok = memoryTokenStore();
  const a = makeClient(srv, clock, { tokenStore: tok });
  await waitP(clock, a.ready);
  const ch = await waitP(clock, a.createChar({ name: 'Reporter', cls: 'warrior' }));
  await waitP(clock, a.play(ch.id)); await until(clock, () => !!a.joined, 6000);
  const oa = rec(world, a), achA = [], fb = [];
  a.on('ach', m => achA.push(m)); a.on('feedbackR', m => fb.push(m));
  a.feedback('suggestion', 'More bridges over the Fackfalpot, please.');
  await until(clock, () => fb.length > 0, 6000);
  assert.equal(fb[0].ok, true, JSON.stringify(fb[0]));
  await until(clock, () => achA.some(m => m.id === 'feedback1'), 6000);
  assert.equal(achA.find(m => m.id === 'feedback1').reward, '', 'paid by the thank-you letter, not twice');
  await store.setFeedbackState(fb[0].id, 'completed', { by: 'test', done: 'Built.' });
  a.close(); await run(clock, 3000); await until(clock, () => !world.online.has(oa.char.id), 8000);
  const a2 = makeClient(srv, clock, { tokenStore: tok }); const ach2 = []; a2.on('ach', m => ach2.push(m));
  await waitP(clock, a2.ready); await waitP(clock, a2.play(oa.char.id)); await until(clock, () => !!a2.joined, 6000);
  await until(clock, () => ach2.some(m => m.id === 'feedbackDone1'), 6000);
  assert.match(ach2.find(m => m.id === 'feedbackDone1').reward, /gift box/);
  a2.close(); await srv.stop();
});
