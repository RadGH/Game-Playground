// W9 (P-client): a spent node after a RE-JOIN comes back when the server says, not "up to ten minutes later".
// The server's professions view carries `nodes: { 'node:<id>': msLeft }` (js/sim/professions.js, marked W9 (P-client)).
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run, until } from '../A/pt1-helpers.js';
import { perfectInputs } from '../../js/rules/professions-games.js';

const on = (c, t) => { const l = []; c.on(t, m => l.push(m)); return l; };

test('you.professions.nodes: the time left on every node you have worked, in joined and after each gather; gone when it reopens', async () => {
  const S = await realServer({ roadEvents: false }), P = S.world.province, W = P.professions, clock = S.clock;
  const a = await joinReal(S.srv, clock, 'Reopen'), o = rec(S.world, a);
  await run(clock, 1500);
  assert.deepEqual(a.joined.you.professions.nodes, {}, 'a new character has worked nothing');
  const bram = [...P.rooms.values()].flatMap(rm => [...rm.objects.values()].map(e => ({ e, rm }))).find(x => x.e.data?.npc?.id === 'prospector_torborhold');
  P.transfer(o, bram.rm, { x: bram.e.x + 1.5, z: bram.e.z }, 'test'); await run(clock, 600);
  const used = on(a, 'used'); a.use(bram.e.id); await until(clock, () => used.length, 2000);
  const key = 'node:' + S.world.layouts[0].professions.nodes.zones.z12_02.find(n => n.s).id;
  const any = [...P.rooms.values()].flatMap(r => [...r.objects.values()]).find(e => e.data && e.data.key === key);
  P.transfer(o, o.room, { x: any.x + 1.5, z: any.z }, 'test'); await run(clock, 900);
  const node = [...o.room.objects.values()].find(e => e.data && e.data.key === key);
  const gR = on(a, 'gatherR'), gD = on(a, 'gatherDone'), you = on(a, 'you');
  a.gather('start', { id: node.id }); await until(clock, () => gR.length, 2000);
  const inp = perfectInputs(gR[0].game); await run(clock, inp[inp.length - 2] + 60);
  a.gather('done', { id: node.id, inputs: inp }); await until(clock, () => gD.length, 2000);
  assert.ok(gD[0].ok && gD[0].reopenMs > 0);
  const told = you.filter(y => y.professions).at(-1).professions.nodes;
  assert.ok(told[key] > 0 && told[key] <= gD[0].reopenMs, `told ${told[key]} of ${gD[0].reopenMs}`);
  // what a re-join would be handed: the same view, with LESS time on it
  const later = W.view(o.char).nodes;
  assert.deepEqual(Object.keys(later), [key]);
  // …and nothing once the node is back
  o.char.opened[key] = 1;
  assert.deepEqual(W.view(o.char).nodes, {});
  // other opened keys (chests) are not listed here
  o.char.opened['chest:x'] = Date.now() + 9e6;
  assert.deepEqual(W.view(o.char).nodes, {});
});
