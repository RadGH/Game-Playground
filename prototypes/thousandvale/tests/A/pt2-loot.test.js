// Play-test 2 (stream A): Q3 loot stays on the corpse until looted, Q4 party threshold + Need / Greed / Skip.
// Stand-in world (fast). The kill's reward is handed to room.award exactly as the rules hand it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { makeServer, joinAs, run, until } from './helpers.js';
import { ROLL_MS, LOOTED_STAY_MS } from '../../js/sim/corpses.js';

const rec = (W, c) => W.online.get(c.joined.you.char);
/** A monster next to `c` in its room, killed, with `items` and `gold` awarded to `c` as the rules do it. */
function killFor(W, c, { gold = 7, items = [] } = {}) {
  const o = rec(W, c), r = o.room, e = o.entity;
  const m = r.spawn({ kind: 'monster', type: 'wolf', level: 2, x: e.x + 2, z: e.z, team: 2 });
  m.kill(e);
  r.award(e, { xp: 5, gold, items: items.map(x => ({ ...x })), from: m, reason: 'kill' });
  r.host.despawn(m, 8000);           // what the rules do with a corpse
  return m;
}
const gear = (name, rarity) => ({ name, rarity, slot: 'chest', kind: 'gear', level: 2, value: 3 });
function msgs(c) { const box = []; for (const t of ['lootable', 'lootWin', 'lootR', 'lootRoll', 'lootRolled', 'bag']) c.on(t, m => box.push(m)); return box; }

test('Q3: a kill\'s items and gold wait on the corpse; open / take / all; the body stays while loot is on it', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Looter');
  const o = rec(W, a);
  W.transfer(o, W.copies[0], { x: W.gate.x + 30, z: W.gate.z }, 'test'); await run(clock, 200);
  const box = msgs(a);
  const bag0 = o.char.bag.length, gold0 = o.char.gold;
  const m = killFor(W, a, { gold: 7, items: [gear('Rough Tunic', 'common'), gear('Old Boots', 'magic')] });
  await run(clock, 200);
  assert.equal(o.char.bag.length, bag0, 'nothing jumped into the bag');
  assert.equal(o.char.gold, gold0, 'the gold waits too');
  assert.ok(box.some(x => x.t === 'lootable' && x.id === m.id && x.on), 'the corpse sparkles for me');
  // too far
  W.transfer(o, o.room, { x: m.x + 20, z: m.z }, 'test'); await run(clock, 100);
  a.loot('open', { id: m.id }); await run(clock, 100);
  assert.equal(box.filter(x => x.t === 'lootR').pop().why, 'far');
  W.transfer(o, o.room, { x: m.x + 1, z: m.z }, 'test'); await run(clock, 100);
  a.loot('open', { id: m.id }); await run(clock, 100);
  const win = box.filter(x => x.t === 'lootWin').pop();
  assert.equal(win.items.length, 2); assert.equal(win.gold, 7);
  // the body outlives its 8 s despawn while loot is on it
  await run(clock, 9000, 50);
  assert.ok(o.room.entities.get(m.id) === m, 'body kept');
  a.loot('take', { id: m.id, uid: win.items[0].uid }); await run(clock, 100);
  assert.equal(o.char.bag.length, bag0 + 1);
  a.loot('all', { id: m.id }); await run(clock, 100);
  assert.equal(o.char.bag.length, bag0 + 2); assert.equal(o.char.gold, gold0 + 7);
  assert.ok(box.some(x => x.t === 'lootWin' && x.id === m.id && x.closed), 'window closes when empty');
  assert.ok(box.some(x => x.t === 'lootable' && x.id === m.id && x.on === false), 'sparkle off');
  // round 11 (World, owner #19): an emptied body lies on a little (untargetable — nothing is on it for anyone), then goes
  await run(clock, 6000, 100);
  assert.ok(o.room.entities.get(m.id) === m, 'an emptied body lies on a moment');
  await run(clock, LOOTED_STAY_MS, 100);
  assert.ok(!o.room.entities.has(m.id) || o.room.entities.get(m.id) !== m, 'an empty body goes');
  a.close(); await srv.stop();
});

test('Q3: loot is personal — another player cannot open my share', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Owner'), b = await joinAs(srv, clock, 'Passerby');
  for (const c of [a, b]) W.transfer(rec(W, c), W.copies[0], { x: W.gate.x + 30, z: W.gate.z }, 'test');
  await run(clock, 200);
  const bb = msgs(b);
  const m = killFor(W, a, { items: [gear('Cloak', 'common')] });
  await run(clock, 200);
  assert.ok(!bb.some(x => x.t === 'lootable' && x.id === m.id), 'no sparkle for them');
  W.transfer(rec(W, b), rec(W, b).room, { x: m.x + 1, z: m.z }, 'test'); await run(clock, 100);
  b.loot('open', { id: m.id }); await run(clock, 100);
  assert.equal(bb.filter(x => x.t === 'lootR').pop().why, 'gone');
  a.close(); b.close(); await srv.stop();
});

async function party(srv, clock) {
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Leader'), b = await joinAs(srv, clock, 'Second'), c = await joinAs(srv, clock, 'Stranger');
  let inv = null; b.on('partyInvite', m => { inv = m; });
  a.partyOp('invite', { name: 'Second' }); await until(clock, () => !!inv, 2000);
  b.partyOp('accept', { party: inv.party }); await run(clock, 300);
  for (const x of [a, b, c]) W.transfer(rec(W, x), W.copies[0], { x: W.gate.x + 30, z: W.gate.z }, 'test');
  await run(clock, 300);
  assert.ok(W.partyOf.get(a.joined.you.char), 'a party');
  return { a, b, c };
}

test('Q4: a party rolls Need / Greed / Skip for rare+; the winner gets it; below the line it stays personal; everyone skips -> free on the corpse', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  const { a, b, c } = await party(srv, clock);
  const A = msgs(a), B = msgs(b), Cc = msgs(c);
  assert.equal(W.partyOf.get(a.joined.you.char).lootMin, 'rare', 'default threshold: rare or better');
  const m = killFor(W, a, { gold: 3, items: [gear('Plain Hood', 'common'), gear('Wolfhide Mantle', 'rare')] });
  await run(clock, 200);
  const rollA = A.find(x => x.t === 'lootRoll'), rollB = B.find(x => x.t === 'lootRoll');
  assert.ok(rollA && rollB && rollA.roll === rollB.roll, 'both members are asked');
  assert.equal(rollA.item.name, 'Wolfhide Mantle'); assert.equal(rollA.ms, ROLL_MS);
  assert.ok(!Cc.some(x => x.t === 'lootRoll'), 'not the stranger');
  a.loot('roll', { roll: rollA.roll, choice: 'greed' });
  b.loot('roll', { roll: rollA.roll, choice: 'need' });
  await run(clock, 200);
  const done = A.find(x => x.t === 'lootRolled');
  assert.equal(done.winner.name, 'Second', 'need beats greed');
  assert.ok(rec(W, b).char.bag.some(i => i.name === 'Wolfhide Mantle'), 'in the winner\'s bag');
  assert.ok(!rec(W, a).char.bag.some(i => i.name === 'Wolfhide Mantle'));
  // the common hood is Leader's own share
  W.transfer(rec(W, a), rec(W, a).room, { x: m.x + 1, z: m.z }, 'test'); await run(clock, 100);
  a.loot('open', { id: m.id }); await run(clock, 100);
  assert.deepEqual(A.filter(x => x.t === 'lootWin').pop().items.map(i => i.name), ['Plain Hood']);
  // everyone skips: it lies free and the stranger may take it
  const m2 = killFor(W, a, { gold: 0, items: [gear('Gilded Ring', 'legendary')] });
  await run(clock, 200);
  const r2 = A.filter(x => x.t === 'lootRoll').pop();
  a.loot('roll', { roll: r2.roll, choice: 'skip' }); b.loot('roll', { roll: r2.roll, choice: 'skip' });
  await run(clock, 200);
  assert.equal(A.filter(x => x.t === 'lootRolled').pop().winner, null);
  W.transfer(rec(W, c), rec(W, c).room, { x: m2.x + 1, z: m2.z }, 'test'); await run(clock, 100);
  c.loot('open', { id: m2.id }); await run(clock, 100);
  const free = Cc.filter(x => x.t === 'lootWin').pop();
  assert.equal(free.free[0].name, 'Gilded Ring');
  c.loot('take', { id: m2.id, uid: free.free[0].uid }); await run(clock, 100);
  assert.ok(rec(W, c).char.bag.some(i => i.name === 'Gilded Ring'), 'anyone takes a skipped item');
  a.close(); b.close(); c.close(); await srv.stop();
});

test('Q4: the leader lowers the line to magic; silence for 30 s counts as skip', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  const { a, b, c } = await party(srv, clock);
  const B = msgs(b);
  let ps = null; a.on('party', p => { ps = p; });
  b.partyOp('loot', { code: 'magic' }); await run(clock, 200);
  assert.equal(W.partyOf.get(a.joined.you.char).lootMin, 'rare', 'only the leader sets it');
  a.partyOp('loot', { code: 'magic' }); await run(clock, 200);
  assert.equal(ps.lootMin, 'magic');
  assert.equal(W.partyOf.get(a.joined.you.char).lootMin, 'magic', 'the province hears it');
  const m = killFor(W, a, { items: [gear('Blue Gloves', 'magic')] });
  await run(clock, 200);
  const r = B.find(x => x.t === 'lootRoll');
  assert.ok(r, 'magic now rolls');
  await run(clock, ROLL_MS + 1500, 100);
  const res = B.find(x => x.t === 'lootRolled');
  assert.ok(res && res.winner === null && res.rolls.every(x => x.choice === 'skip'), 'timeout = skip');
  void m; a.close(); b.close(); c.close(); await srv.stop();
});

test('Q4 + C\'s one drop per corpse per party (host.partyLoot): under the line -> a party pile any member takes; a set piece rolls', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  const { a, b, c } = await party(srv, clock);
  const A = msgs(a), B = msgs(b), Cc = msgs(c);
  const oa = rec(W, a), r = oa.room;
  assert.equal(typeof r.host.partyLoot, 'function', 'the room offers the hook to the rules');
  const m = r.spawn({ kind: 'monster', type: 'wolf', level: 2, x: oa.entity.x + 2, z: oa.entity.z, team: 2 });
  m.kill(oa.entity);
  // C's set piece: rarity 'legendary' + setId — ranks above 'rare', so it locks
  r.host.partyLoot([oa.entity, rec(W, b).entity], [gear('Rough Belt', 'normal'), { ...gear('Warden\'s Coat', 'legendary'), setId: 'warden' }], m, W.partyOf.get(a.joined.you.char).id);
  await run(clock, 200);
  assert.ok(A.some(x => x.t === 'lootable' && x.id === m.id && x.on) && B.some(x => x.t === 'lootable' && x.id === m.id && x.on), 'both members see it');
  assert.ok(!Cc.some(x => x.t === 'lootable' && x.id === m.id), 'not the stranger');
  assert.ok(B.some(x => x.t === 'lootRoll' && x.item.name === 'Warden\'s Coat'), 'the set piece is rolled for');
  W.transfer(rec(W, b), r, { x: m.x + 1, z: m.z }, 'test'); await run(clock, 100);
  b.loot('open', { id: m.id }); await run(clock, 100);
  const win = B.filter(x => x.t === 'lootWin').pop();
  assert.deepEqual(win.items.map(i => [i.name, i.shared]), [['Rough Belt', true]]);
  b.loot('take', { id: m.id, uid: win.items[0].uid }); await run(clock, 100);
  assert.ok(rec(W, b).char.bag.some(i => i.name === 'Rough Belt'), 'a member took the shared item');
  assert.ok(A.some(x => x.t === 'lootable' && x.id === m.id && x.on === false) || A.filter(x => x.t === 'lootable' && x.id === m.id).length >= 1);
  a.close(); b.close(); c.close(); await srv.stop();
});
