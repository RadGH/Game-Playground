// Play-test 4 (stream A): S12 one loot window over every nearby corpse; S23 the sparkle carries the best rarity on the
// body for YOU (no item list until opened); S5's container API (a chest object holds loot like a corpse).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { makeServer, joinAs, run } from './helpers.js';
import { LOOT_NEAR_M } from '../../js/sim/corpses.js';

const rec = (W, c) => W.online.get(c.joined.you.char);
function killAt(W, c, dx, { gold = 5, items = [] } = {}) {
  const o = rec(W, c), r = o.room, e = o.entity;
  const m = r.spawn({ kind: 'monster', type: 'wolf', level: 2, x: e.x + dx, z: e.z, team: 2 });
  m.kill(e);
  r.award(e, { xp: 5, gold, items: items.map(x => ({ ...x })), from: m, reason: 'kill' });
  r.host.despawn(m, 8000);
  return m;
}
const gear = (name, rarity) => ({ name, rarity, slot: 'chest', kind: 'gear', level: 2, value: 3 });
function msgs(c) { const box = []; for (const t of ['lootable', 'lootWin', 'lootR', 'bag']) c.on(t, m => box.push({ ...m, t })); return box; }

test('S12: opening one corpse shows every nearby corpse in one window; all takes them all; far ones stay', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Gatherer');
  const o = rec(W, a);
  W.transfer(o, W.copies[0], { x: W.gate.x + 30, z: W.gate.z }, 'test'); await run(clock, 200);
  const box = msgs(a);
  const m1 = killAt(W, a, 2, { gold: 3, items: [gear('Tunic', 'normal')] });
  const m2 = killAt(W, a, -4, { gold: 4, items: [gear('Boots', 'magic'), gear('Helm', 'rare')] });
  const m3 = killAt(W, a, 0.5, { gold: 0, items: [gear('Ring', 'magic')] });
  const far = killAt(W, a, LOOT_NEAR_M + 6, { gold: 9, items: [gear('Faraway', 'normal')] });
  await run(clock, 200);
  const bag0 = o.char.bag.length, g0 = o.char.gold;
  a.loot('open', { id: m1.id }); await run(clock, 100);
  const win = box.filter(x => x.t === 'lootWin').pop();
  assert.equal(win.id, m1.id, 'the clicked body leads');
  assert.equal(win.items.length, 4, 'items of all three nearby bodies');
  assert.equal(win.gold, 7);
  assert.deepEqual(win.group.map(g => g.id).sort(), [m1.id, m2.id, m3.id].sort(), 'grouped, the far one is not');
  assert.ok(win.items.every(it => [m1.id, m2.id, m3.id].includes(it.corpse)), 'each item says which body holds it');
  // take one from another body by its own corpse id, and one by the clicked id (an old client)
  const boots = win.items.find(it => it.name === 'Boots');
  a.loot('take', { id: m1.id, uid: boots.uid }); await run(clock, 100);
  assert.equal(o.char.bag.length, bag0 + 1, 'found on the grouped body');
  const win2 = box.filter(x => x.t === 'lootWin').pop();
  assert.equal(win2.items.length, 3, 'the window refreshed');
  a.loot('all', { id: m1.id }); await run(clock, 100);
  assert.equal(o.char.bag.length, bag0 + 4); assert.equal(o.char.gold, g0 + 7);
  assert.ok(box.some(x => x.t === 'lootWin' && x.closed), 'closed when all empty');
  for (const m of [m1, m2, m3]) assert.ok(box.some(x => x.t === 'lootable' && x.id === m.id && x.on === false), 'sparkle off ' + m.id);
  assert.ok(!box.some(x => x.t === 'lootable' && x.id === far.id && x.on === false), 'the far body keeps its loot');
  // near:false = the old one-body window
  W.transfer(o, o.room, { x: far.x + 1, z: far.z }, 'test'); await run(clock, 100);
  a.loot('open', { id: far.id, near: false }); await run(clock, 100);
  const w3 = box.filter(x => x.t === 'lootWin').pop();
  assert.equal(w3.items.length, 1); assert.equal(w3.group, undefined);
  a.close(); await srv.stop();
});

test('S12: loot rules hold in a group — another player\'s share never joins my window', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Mine'), b = await joinAs(srv, clock, 'Theirs');
  const oa = rec(W, a), ob = rec(W, b);
  W.transfer(oa, W.copies[0], { x: W.gate.x + 30, z: W.gate.z }, 'test');
  W.transfer(ob, W.copies[0], { x: W.gate.x + 31, z: W.gate.z }, 'test'); await run(clock, 200);
  const box = msgs(a);
  const mine = killAt(W, a, 2, { items: [gear('Mine', 'normal')] });
  const theirs = killAt(W, b, 1, { items: [gear('Theirs', 'rare')] });
  await run(clock, 200);
  a.loot('open', { id: mine.id }); await run(clock, 100);
  const win = box.filter(x => x.t === 'lootWin').pop();
  assert.ok(win.items.every(it => it.name !== 'Theirs'));
  a.loot('take', { id: theirs.id, uid: 'x' }); await run(clock, 100);
  assert.ok(box.filter(x => x.t === 'lootR').pop().ok === false);
  a.close(); b.close(); await srv.stop();
});

test('S23: the sparkle carries the best rarity for that viewer and the count; it updates as things are taken', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Shiny');
  const o = rec(W, a);
  W.transfer(o, W.copies[0], { x: W.gate.x + 30, z: W.gate.z }, 'test'); await run(clock, 200);
  const box = msgs(a);
  const m = killAt(W, a, 2, { gold: 5, items: [gear('Plain', 'normal'), gear('Good', 'rare'), gear('Ok', 'magic')] });
  const g = killAt(W, a, -2, { gold: 5, items: [] });
  await run(clock, 200);
  const sp = box.filter(x => x.t === 'lootable' && x.id === m.id).pop();
  assert.equal(sp.best, 'rare'); assert.equal(sp.n, 4, 'three items + gold');
  assert.equal(sp.items, undefined, 'no item list on the sparkle');
  assert.equal(box.filter(x => x.t === 'lootable' && x.id === g.id).pop().best, 'normal', 'gold only');
  a.loot('open', { id: m.id, near: false }); await run(clock, 100);
  const good = box.filter(x => x.t === 'lootWin').pop().items.find(it => it.name === 'Good');
  a.loot('take', { id: m.id, uid: good.uid }); await run(clock, 100);
  const sp2 = box.filter(x => x.t === 'lootable' && x.id === m.id).pop();
  assert.equal(sp2.best, 'magic', 'the colour drops to the next best'); assert.equal(sp2.n, 3);
  a.close(); await srv.stop();
});

test('S5 container API: a chest object holds a personal share and opens in the same window', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Chester');
  const o = rec(W, a);
  W.transfer(o, W.copies[0], { x: W.gate.x + 30, z: W.gate.z }, 'test'); await run(clock, 200);
  const box = msgs(a);
  const chest = o.room.spawn({ kind: 'object', type: 'chest', name: 'Buried cache', x: o.entity.x + 2, z: o.entity.z, data: { chest: true } });
  W.corpses.holdFor(o.room, chest, o.char.id, { gold: 11, items: [gear('Cache Blade', 'magic')] });
  await run(clock, 100);
  assert.equal(box.filter(x => x.t === 'lootable' && x.id === chest.id).pop().best, 'magic');
  a.loot('open', { id: chest.id }); await run(clock, 100);
  const w = box.filter(x => x.t === 'lootWin').pop();
  assert.equal(w.items[0].name, 'Cache Blade'); assert.equal(w.gold, 11);
  const g0 = o.char.gold;
  a.loot('all', { id: chest.id }); await run(clock, 100);
  assert.equal(o.char.gold, g0 + 11);
  assert.equal(W.corpses.hasLoot(o.room, chest), false);
  a.close(); await srv.stop();
});
