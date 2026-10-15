// Round 11 (owner's live play-test list, 2026-10-15) — the World stream's server half, on the REAL province:
//   #6   "after a restart the same giant bog slime … dropped the same armour again with exactly the same stats": a run's
//        rolls come from `runSeed` (a fresh one per server start), so two runs differ and one run replays itself.
//   #5   "raid enemies keep resetting even if I'm in town … scale with the number of players": an event monster's own
//        300 m / 60 s leash reaches the rules; a wilds rare grows when a second player sets about it.
//   #19  "a looted body … untargetable, E still skins it": the emptied body lies on for LOOTED_STAY_MS, then goes.
//   #47  "Spare ribbon … You feel stronger": a shrine's blessing is a real status, says its numbers, and speeds your feet.
//   #32  Bettony (no stock) answers with no shop.
//   C's ask: a letter's items pass `refreshItem` on the way out of the post.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run, until } from './pt1-helpers.js';
import { LOOTED_STAY_MS } from '../../js/sim/corpses.js';
import { createMail } from '../../js/sim/mail.js';

const box = (c, types) => { const b = []; for (const t of types) c.on(t, m => b.push({ ...m, t })); return b; };
const tp = (o, x, z) => o.entity.moveTo(x, z, undefined, true);
function wildSpot(world) {
  const pv = world.P.values().next().value, L = pv.L, t0 = L.towns[0];
  const camps = L.camps.filter(c => c.type && !c.encounter && (c.level || 1) <= 4 && !L.towns.some(t => Math.hypot(t.x - c.x, t.z - c.z) < (t.r || 40) + 120))
    .sort((a, b) => Math.hypot(a.x - t0.x, a.z - t0.z) - Math.hypot(b.x - t0.x, b.z - t0.z));
  return { pv, room: pv.copies[0], at: { x: camps[0].x + 60, z: camps[0].z + 60 } };
}
async function intoWilds(world, clock, c) {
  const o = rec(world, c), w = wildSpot(world);
  world.transfer(o, w.room, w.at, 'test'); await run(clock, 400);
  o.roadNextAt = Infinity;
  return rec(world, c);
}
const quiet = o => { for (const m of o.room.entities.values()) if (m.kind === 'monster' && Math.hypot(m.x - o.entity.x, m.z - o.entity.z) < 120) o.room.remove(m); };

async function rolls(runSeed) {
  const { srv, clock, world } = await realServer({ runSeed });
  const a = await joinReal(srv, clock, 'Roller', 'warrior');
  const o = await intoWilds(world, clock, a);
  const out = [];
  for (let i = 0; i < 6; i++) out.push((o.room.rules.rollLoot(o.entity, { level: 4, tier: 'magic' }) || []).map(it => `${it.name}|${it.rarity}|${JSON.stringify(it.affixes || it.props || it.mods || '')}`).join(';'));
  const spawn = [0, 1, 2].map(() => o.room.host.random('spawn').toFixed(6));
  a.close(); await srv.stop();
  return JSON.stringify({ out, spawn });
}

test('#6: a server start rolls new dice — two runs drop different things; the same run seed replays the same', async () => {
  const one = await rolls(11), again = await rolls(11), other = await rolls(987654);
  assert.equal(one, again, 'the same run seed gives the same rolls (tests stay repeatable)');
  assert.notEqual(one, other, 'a different run seed: different loot and spawn rolls');
  const { runSeedFrom } = await import('../../server/load.mjs');
  assert.equal(runSeedFrom({ TV_RUN_SEED: '42' }), 42);
  const a = runSeedFrom({}), b = runSeedFrom({});
  assert.ok(a > 0 && b > 0 && a !== b, 'a fresh seed per start');
});

test('#5: an event monster carries the event\'s long leash into the rules; a wilds rare grows when a second player joins in', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Raidwatch', 'warrior'), b = await joinReal(srv, clock, 'Raidhelp', 'mage');
  const oa = await intoWilds(world, clock, a), ob = await intoWilds(world, clock, b);
  quiet(oa);
  const r = oa.room, x = oa.entity.x + 30, z = oa.entity.z;
  const raider = r.spawn({ kind: 'monster', type: 'road_brigand', level: 3, x, z, data: { event: 'test:1', noRank: true, leash: { m: 300, s: 60 } } });
  const plain = r.spawn({ kind: 'monster', type: 'road_brigand', level: 3, x: x + 4, z, data: { camp: 1, noRank: true } });
  await run(clock, 100);
  assert.equal(raider.r.unit.leashM, 300); assert.equal(raider.r.unit.leashS, 60);
  assert.equal(plain.r.unit.leashM, undefined, 'a camp monster keeps the ordinary leash');
  // a rare: one player hits it, then a second — its health grows by (1 + 0.5) / 1, its share kept
  const rare = r.spawn({ kind: 'monster', type: 'thicket_boar', level: 3, x: x - 6, z, rank: 'rare', data: { camp: 1 } });
  await run(clock, 100);
  const max0 = rare.hpMax;
  r.event({ type: 'hit', s: oa.entity.id, d: rare.id, kind: 'dmg', n: 1 });
  assert.equal(rare.hpMax, max0, 'one player: as it was');
  r.event({ type: 'hit', s: oa.entity.id, d: rare.id, kind: 'dmg', n: 1 });
  r.event({ type: 'hit', s: ob.entity.id, d: rare.id, kind: 'dmg', n: 1 });
  assert.ok(Math.abs(rare.hpMax - max0 * 1.5) <= 2, `two players: x1.5 (${max0} -> ${rare.hpMax})`);
  assert.equal(rare.r.unit.maxHp, rare.hpMax, 'the rules\' own unit grew with it');
  a.close(); b.close(); await srv.stop();
});

test('#19: a body emptied of loot lies on (untargetable), then goes', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Picker', 'warrior');
  const o = await intoWilds(world, clock, a);
  quiet(o);
  // a slime has no hide (nobody may skin it), so only the loot keeps its body
  const m = o.room.spawn({ kind: 'monster', type: 'bog_slime', level: 1, x: o.entity.x + 2, z: o.entity.z, data: { camp: 1, noRank: true } });
  await run(clock, 100);
  m.kill(o.entity); if (m.r && m.r.unit) m.r.unit.dmg = [0, 0];
  o.room.host.despawn(m, 8000);                    // what the rules do with a body (index.js: 8 s, kept longer by keepBody)
  world.corpses.holdFor(o.room, m, o.char.id, { gold: 2, items: [] });
  await run(clock, 200);
  const got = box(a, ['lootWin', 'lootR', 'targetR']);
  a.loot('all', { id: m.id }); await run(clock, 400);
  assert.ok(!world.corpses.hasLoot(o.room, m), 'nothing left on it');
  await run(clock, 9000);
  assert.ok(!m.removed, 'still lying there 9 s later (the normal 8 s despawn has passed)');
  a.target(m.id); await run(clock, 200);
  const tr = got.filter(x => x.t === 'targetR').at(-1);
  assert.ok(tr && tr.ok === false, 'cannot be targeted: ' + JSON.stringify(tr));
  await run(clock, LOOTED_STAY_MS + 12000);
  assert.ok(m.removed, 'gone after its stay');
  // a beast you may skin lies on while the skinning lasts (P's skinKeepMs), however long ago its loot was taken
  const h = o.room.spawn({ kind: 'monster', type: 'moor_hound', level: 1, x: o.entity.x + 2, z: o.entity.z + 2, data: { camp: 1, noRank: true } });
  await run(clock, 100);
  const skin = box(a, ['skinnable']);
  h.kill(o.entity); if (h.r && h.r.unit) h.r.unit.dmg = [0, 0];
  o.room.host.despawn(h, 8000);
  await run(clock, 300);
  assert.ok(skin.some(x => x.id === h.id && x.on), 'you may skin it');
  await run(clock, 30000);
  assert.ok(!h.removed, 'still there to skin after 30 s');
  a.close(); await srv.stop();
});

test('#47: a shrine blessing is real — a status, a sentence with its numbers, and faster feet; #32: Bettony sells nothing', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Pilgrim', 'warrior');
  const got = box(a, ['used', 'you']);
  let hit = null;
  for (const pv of world.P.values()) for (const r of [...pv.towns, ...pv.copies]) for (const x of r.objects.values()) if (!hit && x.data && x.data.use && x.data.use.buff && x.data.use.buff.status === 'haste' && !(x.data.use.cost && x.data.use.cost.gold)) hit = { x, r };
  assert.ok(hit, 'a haste shrine in the world');
  world.transfer(rec(world, a), hit.r, { x: hit.x.x + 1.5, z: hit.x.z }, 'test'); await run(clock, 500);
  const o = rec(world, a);
  const before = o.entity.speedMul || 1;
  a.use(hit.x.id); await run(clock, 800);
  const u = got.filter(m => m.t === 'used' && m.kind === 'use').at(-1);
  assert.ok(u && u.ok && u.buff, 'used: ' + JSON.stringify(u));
  assert.match(u.buff.text, /^Light-footed: 10% faster on foot for \d+ minutes?\.$/);
  assert.ok(o.entity.r.unit.statuses['bless:haste'], 'the status is on you');
  await until(clock, () => (o.entity.speedMul || 1) > before + 0.05, 3000);
  assert.ok(o.entity.speedMul >= before * 1.09, `feet faster: ${before} -> ${o.entity.speedMul}`);
  // Bettony: a wise woman, no shop button
  let bet = null;
  for (const pv of world.P.values()) for (const r of [...pv.towns, ...pv.copies]) for (const x of r.objects.values()) if (!bet && x.data && x.data.npc && /Bettony/.test(x.name || '')) bet = { x, r };
  assert.ok(bet, 'Bettony stands somewhere');
  world.transfer(rec(world, a), bet.r, { x: bet.x.x + 1.5, z: bet.x.z }, 'test'); await run(clock, 500);
  a.use(bet.x.id); await run(clock, 500);
  const said = got.filter(m => m.t === 'used' && m.kind === 'npc').at(-1);
  assert.ok(said && said.ok, 'she talks');
  assert.equal(said.shop, undefined, 'no shop');
  assert.equal(said.role, 'wise_woman');
  a.close(); await srv.stop();
});

test('C\'s ask: a letter\'s items pass refreshItem on the way out of the post', async () => {
  const seen = [];
  const letter = { id: 7, kind: 'system', gold: 0, taken: false, itemsFull: [{ uid: 'u1', name: 'Old Sword', str: 3 }], items: [] };
  const store = { mailGet: async () => letter, mailTake: async () => true, mailUnread: async () => 0 };
  const sent = [];
  const o = { char: { id: 1, bag: [], gold: 0 }, conn: { sendJSON: m => sent.push(m) }, seq: 1, savedSeq: 0, fence: 0, room: { kind: 'town' } };
  const M = createMail({ store, online: new Map([[1, o]]), journal: () => {}, syncChar: () => {}, econ: null, trades: { of: () => null }, setTimeoutTicks: () => {}, wallNow: () => 0,
    refreshItem: it => { seen.push(it.uid); if (it.str) { it.heavyPct = it.str * 3; delete it.str; } } });
  await M.op(o, { op: 'take', id: 7 });
  assert.deepEqual(seen, ['u1']);
  assert.equal(o.char.bag[0].heavyPct, 9, 'the old line is today\'s');
  assert.equal(o.char.bag[0].str, undefined);
});

test('#5: an event sizes every wave and its boss by the players there now, and the boss grows when more arrive', async () => {
  const { createEventRunner, crowdScale, EVENT_REACH } = await import('../../js/sim/events.js');
  let t = 0, uid = 0;
  const players = [];
  const ents = [];
  const ent = spec => { const e = { id: ++uid, kind: 'monster', ...spec, hp: 100, hpMax: 100, dead: false, removed: false, state: 0, setMax(v) { this.hpMax = v; }, setHp(v) { this.hp = v; } }; ents.push(e); return e; };
  const room = { now: () => t, walkable: () => true, spawn: ent, remove: e => { e.removed = true; },
    host: { near: (x, z, r, f) => players.filter(p => Math.hypot(p.x - x, p.z - z) <= r && (!f || f(p))) } };
  const P = n => { for (let i = players.length; i < n; i++) players.push({ id: 1000 + i, kind: 'player', char: { id: 1000 + i }, dead: false, x: 5 + i, z: 0 }); };
  P(1);
  const ev = { uid: 'e1', id: 'e1', name: 'Test raid', x: 0, z: 0, r: 40, level: 3, durationMs: 600000, waves: [{ type: 'road_brigand', count: [6, 6] }], boss: null, monster: 'brigand_captain' };
  const run = createEventRunner({ room, ev, rng: () => 0.5, size: { wavePerPlayer: 0.5, waveHealthPerPlayer: 0.15, bossHealthPerPlayer: 0.6, capPlayers: 5 } });
  assert.ok(run.reach >= EVENT_REACH.min && run.reach >= 40 * EVENT_REACH.perR, 'a much larger reach: ' + run.reach);
  run.step();
  const wave1 = ents.filter(e => e.data && e.data.event === 'e1');
  assert.equal(wave1.length, 6, 'one player: the wave as written');
  assert.deepEqual(wave1[0].data.leash, { m: Math.max(EVENT_REACH.leashM, run.reach + 60), s: EVENT_REACH.leashS }, 'the event\'s own long leash');
  assert.equal(wave1[0].data.scale, undefined, 'one player: no extra health');
  // two more turn up; the wave dies; the boss comes for three
  P(3);
  for (const e of wave1) e.dead = true;
  t += 10000; run.step();
  const boss = run.boss;
  assert.ok(boss, 'the boss is up');
  assert.equal(boss.data.scale, crowdScale(3).bossHp, 'boss health x (1 + 0.6 x 2) = 2.2');
  boss.hpMax = 1000; boss.hp = 500;
  P(5); t += 1000; run.step();
  const k = crowdScale(5).bossHp / crowdScale(3).bossHp;
  assert.equal(boss.hpMax, Math.round(1000 * k), 'five now: it grows'); assert.equal(boss.hp, Math.round(500 * k), 'its share kept');
  players.length = 1; t += 1000; run.step();
  assert.equal(boss.hpMax, Math.round(1000 * k), 'it never shrinks');
  // a fresh wave for three players: twice the bodies, x1.3 health each
  const c3 = crowdScale(3);
  assert.deepEqual([c3.waveCount, c3.waveHp], [2, 1.3]);
  assert.equal(crowdScale(99).players, 20, 'capped at twenty');
});
