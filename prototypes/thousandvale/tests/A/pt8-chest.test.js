// Owner feedback 8, W24 (report #45): "I did the event Smugglers' Stash. I killed the bandits before the rats and it
// wouldn't let me open the chest. Then it said 'won' and the chest disappeared. I never got to open the chest, I never
// got any loot." On the REAL world. What was wrong, each with a test here:
//   1. the keepers were the NEAREST CAMP's type (rats) under a chest that says smugglers — the chest now names them, and E's
//      `guardTypes` picks them when the chest's data says who keeps it;
//   2. a keeper's corpse beside the chest: "take all" on the corpse swept the chest's share into the same window, the
//      chest read "nothing left on it" and packed up four seconds later without ever being opened;
//   3. the chest left the moment shares were empty or on its 10-minute clock; now it stays until everyone who took part
//      has looted, or two minutes after it opened — and a share nobody came for is posted to its owner;
//   4. only a keeper standing over the chest locks it (one dragged away or leashed home does not).
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run, until } from './pt1-helpers.js';

const box = (c, types) => { const b = []; for (const t of types) c.on(t, m => b.push(Array.isArray(m) ? { t, list: m } : { ...m, t })); return b; };
function wildSpot(world) {
  const pv = world.P.values().next().value, L = pv.L;
  const t0 = L.towns[0];
  const camps = L.camps.filter(c => c.type && !c.encounter && (c.level || 1) <= 4 && !L.towns.some(t => Math.hypot(t.x - c.x, t.z - c.z) < (t.r || 40) + 120))
    .sort((a, b) => Math.hypot(a.x - t0.x, a.z - t0.z) - Math.hypot(b.x - t0.x, b.z - t0.z));
  const c = camps[0];
  return { pv, L, room: pv.copies[0], at: { x: c.x + 60, z: c.z + 60 } };
}
async function intoWilds(world, clock, c, at) {
  const o = rec(world, c);
  world.transfer(o, wildSpot(world).room, at, 'test'); await run(clock, 400);
  o.roadNextAt = Infinity;
  o.entity.hpMax = 1e7; o.entity.hp = 1e7;                        // the keepers bite: this file is about the chest, not the fight
  return o;
}
const tp = (o, x, z) => o.entity.moveTo(x, z, undefined, true);
function guardedChest(R, o, min = 2) {
  let ev = null;
  for (let k = 0; k < 80 && !(ev && ev.guards.length >= min); k++) { if (ev) R.end(ev); ev = R.spawnFor(o, 'chest'); }
  assert.ok(ev && ev.guards.length >= min, 'a guarded chest');
  // the wilds are not empty and keepers bite: this file is about the chest, so nothing but its keepers stands near, and they are slow to notice
  for (const m of o.room.entities.values()) if (m.kind === 'monster' && !m.dead && !ev.guards.includes(m) && Math.hypot(m.x - ev.x, m.z - ev.z) < 150) o.room.remove(m);
  return ev;
}
/** Kill a keeper the way a fight does: the player's hit lands, the body stays, its loot is held on the corpse. */
function slay(world, o, m) {
  world.roadEvents.noteHit(o, m);
  m.kill(o.entity);
  // (wrap-up 2026-10-13: killed at the ENTITY, the rules' own unit lived on and kept swinging — `devSetLevel` raises the
  // entity's level, not the unit's 94 health — so whether the player was alive to open the chest was a matter of which
  // tick a hit landed on, and any change to the room's dice turned this file red. A slain keeper does not bite.)
  if (m.r && m.r.unit) m.r.unit.dmg = [0, 0];
  world.corpses.holdFor(o.room, m, o.char.id, { gold: 3, items: [{ name: 'Rat tail', rarity: 'normal', value: 1 }] });
}

test('W24: the report — keepers killed beside the chest, their corpses looted with "take all": the chest still holds my share, opens, and only then packs up', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Xanaver', 'warrior');
  const o = await intoWilds(world, clock, a, wildSpot(world).at);
  const R = world.roadEvents, ev = guardedChest(R, o);
  world.devSetLevel(o.char.id, 40); await run(clock, 100);          // keepers of a level-1 chest cannot hurt this one
  const got = box(a, ['used', 'lootWin', 'lootable', 'eventDone', 'eventTrack']);
  tp(o, ev.chest.x + 1.5, ev.chest.z); await run(clock, 300);
  // shut, and it says WHO keeps it and how many are left
  a.use(ev.chest.id); await run(clock, 300);
  const no = got.find(m => m.t === 'used' && m.ok === false);
  assert.equal(no.why, 'guarded'); assert.equal(no.left, ev.guards.length);
  assert.match(no.msg, new RegExp('^Not while the .+ still guard it \\(' + ev.guards.length + ' left\\)\\.$'));
  assert.ok(no.keepers && no.msg.includes(no.keepers), 'the refusal names the keepers: ' + no.msg);
  // the tracker's objective names the same bodies (watched from out of their reach)
  tp(o, ev.chest.x + 55, ev.chest.z); await run(clock, 1200);
  const tr = got.filter(m => m.t === 'eventTrack').at(-1);
  assert.equal(tr.objective.kind, 'kill'); assert.ok(tr.objective.text.includes(no.keepers)); assert.equal(tr.objective.of, ev.guards.length);
  // the fight: every keeper dies right beside the chest, each leaving loot on its corpse
  for (const m of ev.guards) { m.moveTo(ev.chest.x + 2, ev.chest.z + 1, undefined, true); slay(world, o, m); }
  if (o.entity.dead) o.entity.revive(1);
  tp(o, ev.chest.x + 1.5, ev.chest.z);
  await run(clock, 1500);                               // the 1 Hz upkeep opens the chest and rolls my share
  assert.equal(ev.opened, true);
  assert.ok(world.corpses.hasLootFor(o.room, ev.chest, o.char.id), 'my share is on the chest');
  // loot the corpse next to it — "take all"
  const corpse = ev.guards[0];
  a.loot('open', { id: corpse.id }); await run(clock, 200);
  const win = got.filter(m => m.t === 'lootWin' && !m.closed).at(-1);
  assert.ok(win && !(win.items || []).some(i => i.corpse === ev.chest.id), 'the corpse window does not list the chest\'s share');
  a.loot('all', { id: corpse.id }); await run(clock, 300);
  assert.ok(world.corpses.hasLootFor(o.room, ev.chest, o.char.id), 'taking everything off the corpses leaves the chest alone');
  await run(clock, 9000);
  assert.ok(!ev.chest.removed && R.events.has(ev.id), 'the chest is still there, waiting for me');
  assert.ok(!got.some(m => m.t === 'eventDone'), 'and nothing has been "won" yet');
  // now the chest itself (the wilds are not empty: whatever wandered up in those nine seconds is not this test's subject)
  for (const m of o.room.entities.values()) if (m.kind === 'monster' && !m.dead && Math.hypot(m.x - o.entity.x, m.z - o.entity.z) < 80) o.room.remove(m);
  if (o.entity.dead) o.entity.revive(1);
  tp(o, ev.chest.x + 1.5, ev.chest.z); await run(clock, 200);
  a.use(ev.chest.id); await run(clock, 300);
  assert.ok(got.some(m => m.t === 'used' && m.ok && m.kind === 'chest'), 'it opens: ' + JSON.stringify(got.filter(m => m.t === 'used').at(-1)));
  const cw = got.filter(m => m.t === 'lootWin' && m.id === ev.chest.id && !m.closed).at(-1);
  assert.ok(cw && (cw.gold > 0 || cw.items.length), 'with loot in it');
  const g0 = o.char.gold;
  a.loot('all', { id: ev.chest.id }); await run(clock, 300);
  assert.ok(o.char.gold > g0, 'paid');
  await run(clock, 6000);
  assert.ok(ev.chest.removed, 'everyone has looted: it packs up');
  const done = got.find(m => m.t === 'eventDone');
  assert.equal(done.result, 'success'); assert.equal(done.got, true);
  a.close(); await srv.stop();
});

test('W24: an opened chest waits two minutes for everyone who took part; a share nobody came for is posted, and the result says so', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Looter', 'warrior'), b = await joinReal(srv, clock, 'Dawdler', 'warrior');
  const at = wildSpot(world).at;
  const oa = await intoWilds(world, clock, a, at), ob = await intoWilds(world, clock, b, at);
  const R = world.roadEvents, ev = guardedChest(R, oa);
  world.devSetLevel(oa.char.id, 40); world.devSetLevel(ob.char.id, 40); await run(clock, 100);
  assert.equal(R.CH.lootSec, 120);
  const ga = box(a, ['eventDone', 'eventTrack']), gb = box(b, ['eventDone', 'mailNew', 'chat']);
  tp(oa, ev.chest.x + 1.5, ev.chest.z); tp(ob, ev.chest.x + 30, ev.chest.z + 30); await run(clock, 300);
  // B fights (one hit on a keeper) from further off, then both keepers fall
  for (const m of ev.guards) { m.moveTo(ev.chest.x + 2, ev.chest.z, undefined, true); world.roadEvents.noteHit(ob, m); m.kill(oa.entity); }
  await run(clock, 1500);
  assert.ok(ev.rolled.has(oa.char.id) && ev.rolled.has(ob.char.id), 'both took part, both have a share');
  // A loots at once; the chest must NOT leave: B has not looted
  a.use(ev.chest.id); await run(clock, 300); a.loot('all', { id: ev.chest.id }); await run(clock, 300);
  await run(clock, 60000);
  assert.ok(!ev.chest.removed, 'one minute on, the chest still waits for the other one');
  const tr = ga.filter(m => m.t === 'eventTrack').at(-1);
  assert.ok(tr.leftMs > 0 && tr.leftMs <= 120000, 'the tracker counts the two minutes down: ' + tr.leftMs);
  assert.equal(tr.objective.kind, 'open');
  // B walks 500 m away (out of the road event's reach) and never opens it
  await run(clock, 62000);
  assert.ok(ev.chest.removed, 'two minutes after it opened it packs up');
  const da = ga.find(m => m.t === 'eventDone'), db = gb.find(m => m.t === 'eventDone');
  assert.equal(da.got, true); assert.equal(da.result, 'success');
  assert.equal(db.got, false); assert.equal(db.posted, true); assert.match(db.text, /in the post/);
  await until(clock, () => gb.some(m => m.t === 'mailNew'));
  const list = []; b.on('mailList', m => list.push(m)); b.mail('list'); await until(clock, () => list.length);
  const letter = list[0].mail[0];
  assert.ok(letter && (letter.gold > 0 || letter.items.length), 'the share came by post: ' + JSON.stringify(letter).slice(0, 200));
  a.close(); b.close(); await srv.stop();
});

test('W24: kill order and stray keepers never lock it — a keeper dragged away from the chest does not count; a chest with named keepers spawns those', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Kiter', 'warrior');
  const o = await intoWilds(world, clock, a, wildSpot(world).at);
  const R = world.roadEvents, ev = guardedChest(R, o);
  world.devSetLevel(o.char.id, 40); await run(clock, 100);          // keepers of a level-1 chest cannot hurt this one
  const got = box(a, ['used']);
  tp(o, ev.chest.x + 1.5, ev.chest.z); await run(clock, 300);
  // one keeper dies, the other is far away (it chased somebody, or leashed back to a camp)
  ev.guards[0].kill(o.entity);
  for (const m of ev.guards.slice(1)) m.moveTo(ev.chest.x + R.CH.keeperM + 30, ev.chest.z, undefined, true);
  a.use(ev.chest.id); await run(clock, 300);
  assert.ok(got.some(m => m.t === 'used' && m.ok && m.kind === 'chest'), 'opens: ' + JSON.stringify(got.at(-1)));
  R.end(ev);
  // E's `guardTypes`: the keepers are the bodies the chest's story names, wherever it lands
  const L = wildSpot(world).L;
  const types = [...new Set(L.camps.filter(c => c.type && !c.encounter).map(c => c.type))];
  const spec = (world.P.values().next().value.L.treasure.chests || []).find(c => (c.guards || [0, 0])[1] >= 2);
  const far = types.at(-1);
  const old = spec.guardTypes; spec.guardTypes = [far, 'no_such_monster'];
  try {
    let ev2 = null;
    for (let k = 0; k < 200 && !(ev2 && ev2.spec === spec && ev2.guards.length); k++) { if (ev2) R.end(ev2); ev2 = R.spawnFor(o, 'chest'); }
    assert.ok(ev2 && ev2.spec === spec, 'that chest came up');
    assert.ok(ev2.guards.every(m => m.type === far), 'kept by the named type: ' + ev2.guards.map(m => m.type) + ' want ' + far);
    R.end(ev2);
  } finally { if (old === undefined) delete spec.guardTypes; else spec.guardTypes = old; }
  a.close(); await srv.stop();
});
