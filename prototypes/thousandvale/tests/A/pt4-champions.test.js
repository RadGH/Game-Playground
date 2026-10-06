// Play-test 4 S4 (streams C + A): champions and rares roll in the wilds — bigger, more health, a modifier's special,
// better loot, a Pack-leader brings its pack; announced mini-bosses show on nearby players' minimaps, secret ones do not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run } from './pt1-helpers.js';

async function wilds() {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Hunter', 'warrior');
  const o = rec(world, a); const pv = world.P.values().next().value; const r = pv.copies[0];
  world.transfer(o, r, { x: o.entity.x + 300, z: o.entity.z }, 'test'); await run(clock, 500);
  return { srv, clock, world, a, o, pv, r };
}
const mob = (r, o, i, spec = {}) => r.spawn({ kind: 'monster', type: 'moor_hound', level: 5, x: o.entity.x + 40 + (i % 20) * 3, z: o.entity.z + Math.floor(i / 20) * 3, ...spec, data: { camp: 1, ...(spec.data || {}) } });

test('S4: ordinary wilds spawns roll champions (~9%) and rares (~2.5%): bigger, tougher, named, with modifiers on info', async () => {
  const { srv, clock, a, o, r } = await wilds();
  const t = { normal: [], champion: [], rare: [] };
  for (let i = 0; i < 600; i++) { const e = mob(r, o, i); t[e.rank].push(e); }
  const share = k => t[k].length / 600;
  assert.ok(share('champion') > 0.04 && share('champion') < 0.16, 'champions ' + share('champion'));
  assert.ok(share('rare') > 0.005 && share('rare') < 0.06, 'rares ' + share('rare'));
  const avg = l => l.reduce((s, e) => s + e.hpMax, 0) / l.length;
  assert.ok(avg(t.champion) > avg(t.normal) * 1.6, 'champion health bar');
  assert.ok(avg(t.rare) > avg(t.champion), 'rare tougher still');
  for (const e of [...t.champion, ...t.rare]) {
    const i = e.info();
    assert.ok(i.aff && i.aff.length === (e.rank === 'rare' ? 2 : 1), 'modifiers on info');
    assert.deepEqual(i.mods, i.aff.map(a => a.id), 'mods = the ids');
    assert.ok(i.sc >= 1.25, 'bigger: ' + i.sc);
    assert.ok(e.state & 64, 'elite state bit');
    assert.ok(e.r.unit.dropBonus >= 1, 'better loot (Farhold rank dropBonus)');
  }
  assert.ok(t.rare.every(e => / the /.test(e.name)), 'a rare has a name of its own: ' + t.rare.map(e => e.name));
  assert.ok(t.champion.every(e => e.name !== 'moor_hound' && /Moor Hound/.test(e.name)), 'champion prefix');
  // never at level 1, never for an add, an escort or a named encounter body
  for (let i = 0; i < 200; i++) assert.equal(mob(r, o, i, { level: 3 }).rank, 'normal', 'not before level 4');
  for (let i = 0; i < 100; i++) assert.equal(mob(r, o, i, { data: { noRank: true } }).rank, 'normal');
  for (let i = 0; i < 100; i++) assert.equal(r.spawn({ kind: 'monster', type: 'moor_hound', level: 5, x: o.entity.x + 50, z: o.entity.z }).rank, 'normal', 'not a camp body');
  a.close(); await srv.stop();
});

test('S4: a modifier brings its special; a Pack-leader brings its pack; E can place a set champion (data.affixes)', async () => {
  const { srv, clock, a, o, r } = await wilds();
  const fiery = mob(r, o, 0, { rank: 'champion', data: { affixes: ['fiery'] } });
  assert.deepEqual(fiery.info().aff.map(x => x.id), ['fiery']);
  const enc = r.rules.room.encounters || r.rules.room.enc;
  const st = enc && enc.stateOf ? enc.stateOf(fiery.r.unit) : null;
  if (st) assert.ok(st.abilities.some(ab => ab.id === 'aff_flame_ring'), 'Flame Ring: ' + st.abilities.map(x => x.id));
  const giant = mob(r, o, 1, { rank: 'champion', data: { affixes: ['giant'] } });
  assert.ok(giant.info().sc >= 3, 'a giant is GIANT: ' + giant.info().sc);
  const before = [...r.entities.values()].filter(e => e.data && e.data.escortOf != null).length;
  const lead = mob(r, o, 2, { rank: 'rare', data: { affixes: ['packleader', 'vital'] } });
  await run(clock, 200);
  const pack = [...r.entities.values()].filter(e => e.data && e.data.escortOf === lead.id);
  assert.ok(pack.length >= 2, 'the pack: ' + pack.length + ' (before ' + before + ')');
  assert.ok(pack.every(e => e.type === 'moor_hound' && e.rank === 'normal'), 'its own kind, ordinary');
  assert.ok(/Pack-leader/.test(lead.info().aff.map(x => x.name).join(' ')));
  a.close(); await srv.stop();
});

test('S4: an announced mini-boss shows on nearby minimaps (bossNear); a secret one never does; leaving clears it', async () => {
  const { srv, clock, world, a, o, r } = await wilds();
  const info = r.opts ? null : null; void info;
  const got = []; a.on('bossNear', m => got.push(m));
  const loud = r.spawn({ kind: 'monster', type: 'moor_hound', level: 4, x: o.entity.x + 120, z: o.entity.z, rank: 'rare', name: 'Grisel Thornhide', data: { encounter: 'rare_grisel_thornhide' } });
  const quiet = r.spawn({ kind: 'monster', type: 'moor_hound', level: 4, x: o.entity.x + 60, z: o.entity.z, rank: 'rare', name: 'The Antlered Shade', data: { encounter: 'rare_antlered_shade' } });
  await run(clock, 1500);
  const last = got.at(-1);
  assert.ok(last && last.list.some(b => b.id === loud.id && b.name === 'Grisel Thornhide' && b.r === 300), 'announced: ' + JSON.stringify(last));
  assert.ok(!last.list.some(b => b.id === quiet.id), 'the secret one is not');
  world.transfer(o, r, { x: loud.x + 500, z: loud.z }, 'test'); await run(clock, 1500);
  assert.deepEqual(got.at(-1).list, [], 'out of range: cleared');
  world.transfer(o, r, { x: loud.x + 100, z: loud.z }, 'test'); await run(clock, 1500);
  assert.ok(got.at(-1).list.some(b => b.id === loud.id));
  loud.kill(o.entity); await run(clock, 1500);
  assert.ok(!got.at(-1).list.some(b => b.id === loud.id), 'dead: gone');
  a.close(); await srv.stop();
});
