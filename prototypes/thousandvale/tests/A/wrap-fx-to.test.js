// Wrap-up 2026-10-13 — an `fx` event's `to` is what a shot is AIMED at, not who may see it.
// Found drawing the Starcaller's stars (Y32): every `fx bolt | arrow | shot | arc | link | skyfall` carries `to` (an
// entity id or a point), and the room read ANY `to` as "deliver to that one player". A bolt at a monster reached nobody,
// a monster's arrow reached only its victim with the target stripped off, a falling star reached nobody.
// Run: node --test prototypes/thousandvale/tests/A/wrap-fx-to.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run } from './pt1-helpers.js';

test('fx events aimed at something reach everyone in view; xp / loot / an NPC\'s thanks stay personal', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false });
  const a = await joinReal(srv, clock, 'Stara', 'starcaller');
  const b = await joinReal(srv, clock, 'Watchb', 'mage');
  const o = rec(world, a), ob = rec(world, b);
  world.province.transfer(ob, o.room, { x: o.entity.x + 2, z: o.entity.z }, 'test'); await run(clock, 600);
  const got = { a: [], b: [] };
  for (const [k, c] of [['a', a], ['b', b]]) c.on('ev', m => { for (const e of m.e) if (e.tag) got[k].push(e); });
  const H = o.room.host, me = o.entity.id, spot = { x: o.entity.x + 5, z: o.entity.z };
  H.event({ type: 'fx', kind: 'bolt', tag: 'at-monster', id: me, skill: 'star_dart', proj: 'star', from: { x: o.entity.x, z: o.entity.z }, to: 999999, ms: 500 });
  H.event({ type: 'fx', kind: 'bolt', tag: 'at-point', id: me, from: { x: o.entity.x, z: o.entity.z }, to: spot, ms: 500 });
  H.event({ type: 'fx', kind: 'shot', tag: 'at-player', id: me, from: { x: o.entity.x, z: o.entity.z }, to: ob.entity.id, ms: 500 });
  H.event({ type: 'fx', kind: 'skyfall', tag: 'skyfall', id: me, skill: 'called_star', proj: 'skystar', to: spot, r: 5, ms: 1000 });
  H.event({ type: 'fx', kind: 'arc', tag: 'arc', id: me, to: ob.entity.id });
  H.event({ type: 'fx', kind: 'npcThanks', tag: 'thanks', id: me, to: ob.entity.id, why: 'help' });
  H.event({ type: 'xp', tag: 'xp', to: ob.entity.id, n: 5, total: 5 });
  await run(clock, 400);
  const tags = k => got[k].map(e => e.tag).sort();
  const shared = ['arc', 'at-monster', 'at-player', 'at-point', 'skyfall'];
  assert.deepEqual(tags('a'), shared, 'the caster sees its own shots and falling stars');
  assert.deepEqual(tags('b'), [...shared, 'thanks', 'xp'].sort(), 'a bystander sees them too, plus what is personally theirs');
  // the target is still on the event (it cannot be drawn without it)
  const by = t => got.b.find(e => e.tag === t);
  assert.equal(by('at-monster').to, 999999); assert.deepEqual(by('at-point').to, spot); assert.equal(by('at-player').to, ob.entity.id); assert.deepEqual(by('skyfall').to, spot);
  assert.equal(by('skyfall').ms, 1000); assert.equal(by('at-monster').proj, 'star');
  // personal events still arrive without their address
  assert.equal('to' in by('thanks'), false); assert.equal('to' in by('xp'), false);
  a.close(); b.close(); await srv.stop();
});
