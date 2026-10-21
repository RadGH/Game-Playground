// Play-test 12 (#69): bulk skinning. `gather {op:'start', batch:true}` skins one of YOUR beasts — the one named, or with
// no id the nearest within gather.skinBatchReach (10 m) — and gatherDone.more says how many are still waiting there.
// Every body is still its own mini-game, roll and experience; someone else's kill and a body out of reach are not taken.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run, until } from '../A/pt1-helpers.js';
import { perfectInputs } from '../../js/rules/professions-games.js';
import { validate } from '../../js/net/protocol.js';

const on = (c, t) => { const l = []; c.on(t, m => l.push(m)); return l; };

async function skinOne(S, a, msg) {
  const gR = on(a, 'gatherR'), gD = on(a, 'gatherDone');
  a.gather('start', msg); await until(S.clock, () => gR.length, 2000);
  if (!gR[0].ok) return { refused: gR[0] };
  const inp = perfectInputs(gR[0].game);
  await run(S.clock, inp.length ? inp[inp.length - 2] + 60 : 500);
  a.gather('done', { id: gR[0].id, inputs: inp }); await until(S.clock, () => gD.length, 2000);
  return { start: gR[0], done: gD[0], after: gR.slice(1) };
}

test('#69: the protocol takes gather.batch', () => {
  assert.equal(validate({ t: 'gather', op: 'start', batch: true }), null);
  assert.equal(validate({ t: 'gather', op: 'start', id: 4, batch: true }), null);
});

test('#69: skin all nearby — three of your kills in reach are skinned one after another, the fourth (far) and one that is not yours are not', async () => {
  const S = await realServer({ roadEvents: false });
  const P = S.world.province;
  const a = await joinReal(S.srv, S.clock, 'Tanner');
  const o = rec(S.world, a);
  await run(S.clock, 1500);
  // inside Torborhold's wall, by the prospector (nothing wanders up and bites mid-cut — the core skinning test does the same)
  const bram = [...P.rooms.values()].flatMap(rm => [...rm.objects.values()].map(e => ({ e, rm }))).find(x => x.e.data && x.e.data.npc && x.e.data.npc.id === 'prospector_torborhold');
  P.transfer(o, bram.rm, { x: bram.e.x + 1.5, z: bram.e.z }, 'test'); await run(S.clock, 600);
  for (const x of [...o.room.entities.values()]) if (x.kind === 'monster' && !x.dead && Math.hypot(x.x - o.entity.x, x.z - o.entity.z) < 80) o.room.remove(x);
  const sk = on(a, 'skinnable');
  const kill = (dx, dz, by = o.entity) => { const m = o.room.spawn({ kind: 'monster', type: 'moor_hound', level: 2, x: o.entity.x + dx, z: o.entity.z + dz, team: 2 }); m.kill(by); o.room.host.despawn(m, 60000); deadToRules(m); return m; };
  // entity.kill() alone leaves the rules' own copy of the beast alive and biting (it never saw the death); tell it, the
  // way a death in a real fight would have (u.dying set, no target)
  const deadToRules = m => { const u = m.r && m.r.unit; if (u) { u.dying = 0; u.targetId = null; } };
  const near = [kill(2, 0), kill(-3, 4), kill(0, -7)];      // 2 m, 5 m, 7 m: inside the 10 m batch reach (only the first inside the 4 m knife reach)
  const far = kill(25, 0);
  const theirs = kill(1, 1, null);      // nobody's kill: no credit, nothing to skin
  await run(S.clock, 400);
  assert.equal(sk.filter(x => x.on).length, 4, 'four of mine to skin (not the one nobody killed)');
  await run(S.clock, 12000);      // out of combat (killing them counts as a fight)
  for (const x of [...o.room.entities.values()]) if (x.kind === 'monster' && !x.dead && !near.includes(x) && x !== far && x !== theirs) o.room.remove(x);
  o.entity.setState(2, false); await run(S.clock, 200);

  // E on the first body: start with its id and batch on
  let r = await skinOne(S, a, { id: near[0].id, batch: true });
  assert.ok(r.done && r.done.ok, JSON.stringify(r));
  assert.equal(r.done.more, 2, 'two more within reach');
  // the client then asks for the next with no id
  const done = [near[0].id];
  for (let i = 0; i < 2; i++) {
    await run(S.clock, 1300);
    r = await skinOne(S, a, { batch: true });
    assert.ok(r.done && r.done.ok, JSON.stringify(r.refused || r.done));
    assert.ok(near.some(m => m.id === r.start.id) && !done.includes(r.start.id), 'a new body of mine, in reach');
    done.push(r.start.id);
    assert.equal(r.done.more, 1 - i);
  }
  await run(S.clock, 1300);
  r = await skinOne(S, a, { batch: true });
  assert.ok(r.refused && r.refused.batch === 'end', 'nothing left in reach: ' + JSON.stringify(r));
  assert.ok(!far.removed && sk.some(x => x.id === far.id && x.on) && !sk.some(x => x.id === far.id && !x.on), 'the far one is still waiting');
  assert.ok(o.char.bag.some(i => i.id === 'light_hide'));
  assert.ok(o.char.professions.xp.skinning > 0);
  // a body that is not yours is refused even when named
  await run(S.clock, 1300);
  r = await skinOne(S, a, { id: theirs.id, batch: true });
  assert.ok(r.refused, 'not yours');
  a.close(); await S.srv.stop();
});
