// Owner feedback 8, W12 (report #33): "! above an NPC with a quest for you, ? when you can turn one in, greyed when not
// yet." On the REAL world: `questMarks {marks, full}` per player — offer / turnin / active / later / job — follows the
// quest log (accept, finish, hand in) and differs between two players standing in the same town.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run, until } from './pt1-helpers.js';

const marksOf = c => { const m = {}; let full = 0; c.on('questMarks', x => { if (x.full) { full++; for (const k of Object.keys(m)) delete m[k]; } for (const [id, v] of Object.entries(x.marks)) { if (v == null) delete m[id]; else m[id] = v; } m._full = full; }); return m; };

test('W12: marks over quest givers are per player and follow the log — offer, active, turnin, later; a full map on every room entry', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Marka', 'warrior');
  const ma = marksOf(a);
  await run(clock, 2500);
  const o = rec(world, a), b = world.P.values().next().value.book;
  assert.ok(ma._full >= 1, 'a full map follows the join');
  const npcs = [...o.room.objects.values()].filter(x => x.data && x.data.npc);
  const byMark = v => npcs.filter(x => ma[x.id] === v);
  assert.ok(byMark('offer').length >= 1, 'somebody in the starting town has a quest for a new character: ' + JSON.stringify(ma));
  // what the server says equals what the book says, for every NPC in the room
  const giver = x => ({ key: x.data.key, npcId: x.data.npc.id || null, name: x.name, role: x.data.npc.role || null, x: x.x, z: x.z, vignette: null, objectName: x.name });
  for (const x of npcs) assert.equal(ma[x.id] || null, b.mark(o.char, giver(x)), x.name);
  // filler folk carry nothing
  assert.ok(npcs.filter(x => x.data.npc.role === 'townsfolk').every(x => !ma[x.id]), 'townsfolk have no mark');
  // accept one: that NPC is no longer an offer (active, or turnin when the first step is to talk to them, or another offer)
  const g = byMark('offer')[0];
  const offers = b.offers(o.char, giver(g)).filter(q => !q.job);
  assert.ok(offers.length, 'the marked NPC really offers a story quest');
  world.transfer(o, o.room, { x: g.x + 1, z: g.z }, 'test'); await run(clock, 300);
  const qr = []; a.on('questR', m => qr.push(m));
  a.quest('accept', offers[0].id, g.id); await until(clock, () => qr.length);
  assert.equal(qr[0].ok, true, JSON.stringify(qr[0]));
  await run(clock, 1500);
  assert.equal(ma[g.id] || null, b.mark(o.char, giver(g)), 'the mark followed the accept');
  assert.ok(offers.length > 1 || ma[g.id] !== 'offer', 'no longer offering the quest just taken: ' + ma[g.id]);
  // finish it by hand and make it need its giver: a gold ? over the giver
  const def = b.defs.get(offers[0].id);
  o.char.quests.active[def.id].step = def.steps.length; o.char.quests.active[def.id].n = 0;
  const needs = def.needsGiver; def.needsGiver = true;
  o.marksDirty = true; await run(clock, 1500);
  assert.equal(ma[g.id], 'turnin');
  def.needsGiver = needs;
  // a second player sees their OWN marks: for them the same NPC still offers it
  const c = await joinReal(srv, clock, 'Markb', 'warrior');
  const mc = marksOf(c);
  await run(clock, 2500);
  const g2 = [...rec(world, c).room.objects.values()].find(x => x.data && x.data.npc && x.data.npc.id === g.data.npc.id);
  assert.equal(mc[g2.id], 'offer', 'the other player is offered it');
  assert.equal(ma[g.id], 'turnin', 'and mine did not change');
  // later: a quest locked behind a level shows grey until the level comes
  const locked = [...b.defs.values()].find(d => d.minLevel > 1 && d.giver && !d.cls && !d.classes && !(d.requires || []).length && [...world.P.values().next().value.towns].some(r => [...r.objects.values()].some(x => x.data && x.data.npc && x.data.npc.id === d.giver)));
  if (locked) {
    const gv = { key: 'k', npcId: locked.giver, name: 'x', role: null, x: 0, z: 0, vignette: null, objectName: 'x' };
    const fresh = { id: 999, cls: 'warrior', level: 1, quests: { active: {}, done: {}, jobs: {} } };
    const m1 = b.mark(fresh, gv);
    fresh.level = locked.minLevel + 40;
    const m2 = b.mark(fresh, gv);
    assert.ok(m1 === 'later' || m1 === 'offer', 'before: ' + m1);
    assert.ok(m2 === 'offer' || m2 === 'later', 'after: ' + m2);
  }
  // a room change sends a full map again (entity ids are the room's)
  const f0 = ma._full;
  world.transfer(o, world.P.values().next().value.copies[0], { x: world.gate.x + 40, z: world.gate.z }, 'test');
  await run(clock, 2500);
  assert.ok(ma._full > f0, 'a full map after the room change');
  a.close(); c.close(); await srv.stop();
});
