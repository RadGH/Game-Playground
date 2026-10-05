// Play-test 1 (stream A):
//  P6  talent picks and the perk forest go through `talent` / `perk` (province socket) to the rules (stream C's
//      rules.talent / rules.perk), answer talentR / perkR, refresh the skill bar (`you {bar}`) and the build view
//      (`you {talents, perks, perkPoints}`), and are SAVED (`char.build` = rules.saveBuild) — a reload keeps them.
//  P3  the map: zones with names + level bands from the start, towns always, places found by walking near them
//  P27 (`discover` pushes, saved in `seen`), where events are happening now — `map {op:'get'}` -> mapData.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { createRules as rulesV0 } from '../../js/sim/rules-v0.js';
import { makeServer, makeClient, joinAs, run, until, waitP, loadAll } from './helpers.js';
import { memoryTokenStore } from '../../js/net/client.js';
import { realServer, joinReal, rec } from './pt1-helpers.js';

/** The stand-in rules + a tiny talent/perk model with C's interface (one pick per tier, 1 perk point a level). */
function rulesWithBuild(host, o) {
  const r = rulesV0(host, o);
  const B = new Map();                                        // entity id -> { talents, perks }
  const of = e => { let b = B.get(e.id); if (!b) { b = JSON.parse(JSON.stringify((e.char && e.char.build) || { talents: {}, perks: [] })); B.set(e.id, b); } return b; };
  return {
    ...r,
    bar: e => [{ slot: 0, id: 'basic', name: 'Strike', mod: (of(e).talents.basic || {})[1] || null }],
    build: e => { const b = of(e); return { talents: b.talents, perks: b.perks, perkPoints: Math.max(0, (e.level || 1) - b.perks.length) }; },
    saveBuild: e => JSON.parse(JSON.stringify(of(e))),
    talent(e, op, { skill, tier, node }) {
      const b = of(e);
      if (op === 'clear') { delete b.talents[skill]; return { ok: true, picks: {} }; }
      if (!skill || !tier || !node) return { ok: false, why: 'bad', text: 'Pick a node.' };
      if ((b.talents[skill] || {})[tier]) return { ok: false, why: 'taken', text: 'That tier is already chosen.' };
      (b.talents[skill] ||= {})[tier] = node;
      return { ok: true, picks: b.talents[skill] };
    },
    perk(e, op, { id }) {
      const b = of(e);
      if (op === 'reset') { b.perks = []; return { ok: true, perks: [], left: e.level }; }
      if (op === 'take') { if (b.perks.length >= (e.level || 1)) return { ok: false, why: 'points', text: 'No perk points left.' }; b.perks.push(id); }
      if (op === 'refund') b.perks = b.perks.filter(p => p !== id);
      return { ok: true, perks: b.perks, left: (e.level || 1) - b.perks.length };
    },
  };
}

test('P6: talent pick + perk take: answers, bar + build refresh, saved, and back after a reload', async () => {
  const clock = createVirtualClock();
  const store = createMemoryStore({ now: clock.now });
  const srv = makeServer({ clock, store, worldOpts: { createRules: rulesWithBuild } });
  await srv.ready;
  const ts = memoryTokenStore();
  const a = await joinAs(srv, clock, 'Talented', 'warrior', { tokenStore: ts });
  assert.deepEqual(a.joined.you.talents, {}, 'joined.you carries the build view');
  assert.equal(a.joined.you.perkPoints, 1);
  const tr = [], pr = [], you = [];
  a.on('talentR', m => tr.push(m)); a.on('perkR', m => pr.push(m)); a.on('you', m => you.push(m));
  a.talent('pick', { skill: 'basic', tier: 1, node: 'cleaving' });
  await until(clock, () => tr.length, 2000);
  assert.equal(tr[0].ok, true, JSON.stringify(tr[0]));
  assert.deepEqual(tr[0].picks, { 1: 'cleaving' });
  await run(clock, 200);
  assert.ok(you.some(p => p.bar && p.bar[0].mod === 'cleaving'), 'the skill bar was re-sent with the talent on it');
  assert.ok(you.some(p => p.talents && p.talents.basic && p.talents.basic[1] === 'cleaving'), 'the build view was re-sent');
  a.talent('pick', { skill: 'basic', tier: 1, node: 'other' });
  await until(clock, () => tr.length >= 2, 2000);
  assert.equal(tr[1].ok, false); assert.equal(tr[1].why, 'taken'); assert.ok(tr[1].msg);
  a.perk('take', { id: 'early_bond' });
  await until(clock, () => pr.length, 2000);
  assert.equal(pr[0].ok, true); assert.deepEqual(pr[0].perks, ['early_bond']); assert.equal(pr[0].left, 0);
  a.perk('take', { id: 'iron_skin' });
  await until(clock, () => pr.length >= 2, 2000);
  assert.equal(pr[1].ok, false); assert.equal(pr[1].why, 'points');
  // saved: the journal + blob a reload reads
  const charId = a.joined.you.char;
  await run(clock, 3000);
  const saved = loadAll(store).find(c => c.id === charId);
  assert.deepEqual(saved.build, { talents: { basic: { 1: 'cleaving' } }, perks: ['early_bond'] });
  a.close(); await run(clock, 2000); await srv.stop();
  // a fresh server on the same store: the build comes back
  const srv2 = makeServer({ clock, store, worldOpts: { createRules: rulesWithBuild } });
  await srv2.ready;
  const b = makeClient(srv2, clock, { tokenStore: ts });
  await waitP(clock, b.ready);
  await waitP(clock, b.play(charId));
  await until(clock, () => !!b.joined, 3000);
  assert.deepEqual(b.joined.you.talents, { basic: { 1: 'cleaving' } }, 'the talent is back after a reload');
  assert.deepEqual(b.joined.you.perks, ['early_bond']);
  b.close(); await srv2.stop();
});

test('P6: on rules without talents the ops say so plainly (no silent nothing)', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock });
  await srv.ready;
  const a = await joinAs(srv, clock, 'Plain');
  const tr = []; a.on('talentR', m => tr.push(m));
  a.talent('pick', { skill: 'x', tier: 1, node: 'y' });
  await until(clock, () => tr.length, 2000);
  assert.equal(tr[0].ok, false); assert.equal(tr[0].why, 'notReady'); assert.ok(tr[0].msg);
  await srv.stop();
});

test('P3/P27: the map — level bands from the start, places found by walking, events located', async () => {
  const { srv, clock, world, store } = await realServer({ zoneEventFirstMs: 2000 });
  const a = await joinReal(srv, clock, 'Cartographer');
  const maps = [], found = [];
  a.on('mapData', m => maps.push(m)); a.on('discover', m => found.push(m));
  a.map();
  await until(clock, () => maps.length, 2000);
  const m0 = maps[0];
  assert.equal(m0.zones.length, 16);
  assert.ok(m0.zones.every(z => z.name && Array.isArray(z.band) && z.bounds), 'every zone: name, level band, bounds');
  assert.ok(m0.places.filter(p => p.kind === 'town').length >= 3, 'towns are on the map from the start');
  assert.ok(!m0.places.some(p => p.kind === 'dungeon'), 'dungeons are found, not given');
  // walk to a dungeon door: it is discovered, pushed, saved
  const L = world.layouts[0];
  const d = L.doors.find(q => q.kind !== 'cave');
  const o = rec(world, a);
  world.transfer(o, world.copies[0], { x: d.x + 6, z: d.z + 6 }, 'test');
  await until(clock, () => found.some(f => f.places.some(p => p.kind === 'dungeon')), 5000);
  const df = found.flatMap(f => f.places).find(p => p.kind === 'dungeon');
  assert.ok(df && df.name && Number.isFinite(df.x), 'the door is pushed with its name and place');
  assert.ok(a.joined.you.seen.places.includes(df.key), 'merged into joined.you.seen');
  // a zone event in this zone shows on the map with its location
  await run(clock, 4000);
  a.map();
  await until(clock, () => maps.length >= 2, 2000);
  const m1 = maps.at(-1);
  assert.ok(m1.places.some(p => p.key === df.key && p.discovered), 'the found door is on the map');
  if (m1.events.length) assert.ok(m1.events.every(e => Number.isFinite(e.x) && Number.isFinite(e.z) && e.name), 'events carry where they are');
  console.log('# events on the map: ' + m1.events.map(e => e.name).join(', '));
  const charId = a.joined.you.char;
  a.close(); await run(clock, 3000);
  const saved = loadAll(store).find(c => c.id === charId);
  assert.ok(saved.seen.places.includes(df.key) && saved.seen.zones.length >= 1, 'discoveries are saved');
  await srv.stop();
});

test('P6 with stream C\'s real rules: a talent pick and a perk take round-trip, the bar is resent, the build is saved', async () => {
  const { srv, clock, world, store } = await realServer();
  const a = await joinReal(srv, clock, 'Realtalent', 'mage');
  const o = rec(world, a);
  if (!o.room.rules.talent) return;                               // C's build API not in this tree
  o.entity.setLevel(10); o.char.level = 10; o.room.rules.onLevel(o.entity);
  await run(clock, 200);
  const view = o.room.rules.build(o.entity);
  const sk = (view.talentTree || []).find(s => s.tiers && s.tiers.length) || null;
  const tr = [], pr = [], you = [];
  a.on('talentR', m => tr.push(m)); a.on('perkR', m => pr.push(m)); a.on('you', m => you.push(m));
  if (sk) {
    const tier = sk.tiers.find(t => (t.open ?? true) && (t.nodes || []).length);
    if (tier) {
      a.talent('pick', { skill: sk.skillId || sk.id, tier: tier.tier, node: tier.nodes[0].id });
      await until(clock, () => tr.length, 2000);
      assert.equal(tr[0].ok, true, JSON.stringify(tr[0]));
      await run(clock, 200);
      assert.ok(you.some(p => p.bar), 'the bar was resent after the pick');
    }
  }
  const forest = o.room.rules.perkForest ? o.room.rules.perkForest() : null;
  const first = forest && (forest.nodes || []).find(n => o.room.rules.perk && n.id !== 'start' && (forest.links || []).some(l => l.includes('start') && l.includes(n.id)));
  if (first) {
    a.perk('take', { id: first.id });
    await until(clock, () => pr.length, 2000);
    assert.equal(pr[0].ok, true, JSON.stringify(pr[0]));
  }
  const charId = a.joined.you.char;
  a.close(); await run(clock, 3000);
  const saved = loadAll(store).find(c => c.id === charId);
  assert.ok(saved.build && saved.build.v === 1, 'char.build saved: ' + JSON.stringify(saved.build));
  if (first) assert.ok(saved.build.perks.includes(first.id));
  console.log('# real rules: talent ' + (tr[0] ? tr[0].ok : 'n/a') + ', perk ' + (pr[0] ? pr[0].ok : 'n/a'));
  await srv.stop();
});

test('P6: taking a talent or perk back needs an Unbinder close by (picking is free anywhere)', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock, worldOpts: { createRules: rulesWithBuild } });
  await srv.ready;
  const a = await joinAs(srv, clock, 'Regretful');
  const tr = [], pr = []; a.on('talentR', m => tr.push(m)); a.on('perkR', m => pr.push(m));
  a.talent('pick', { skill: 'basic', tier: 1, node: 'cleaving' }); a.perk('take', { id: 'x' });
  await until(clock, () => tr.length && pr.length, 2000);
  a.talent('clear', { skill: 'basic', tier: 1 }); a.perk('refund', { id: 'x' });
  await until(clock, () => tr.length >= 2 && pr.length >= 2, 2000);
  assert.equal(tr[1].why, 'unbinder'); assert.equal(pr[1].why, 'unbinder');
  // stand by the town's Unbinder: allowed
  const W = srv.world, o = W.online.get(a.joined.you.char);
  const ub = [...W.townRoom.objects.values()].find(x => x.data && x.data.npc && x.data.npc.role === 'unbinder');
  assert.ok(ub, 'every town has an Unbinder');
  W.transfer(o, W.townRoom, { x: ub.x + 1, z: ub.z }, 'test'); await run(clock, 200);
  a.talent('clear', { skill: 'basic', tier: 1 });
  await until(clock, () => tr.length >= 3, 2000);
  assert.equal(tr[2].ok, true, JSON.stringify(tr[2]));
  await srv.stop();
});
