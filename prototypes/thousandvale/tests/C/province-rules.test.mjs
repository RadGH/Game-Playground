// node --test prototypes/thousandvale/tests/C/province-rules.test.mjs
//
// What stream A's M2 province asks of the combat core (docs/requests.md "A -> C" M2):
//   the skill bar for `you.bar` (with `ally` / `group`), rares walking their placement loop
//   (`data.path`), event bosses scaled (`data.scale`), a monster taken away WITHOUT dying (a parked
//   camp) leaving nothing behind, and the per-tick cost with ~1,300 monsters and 70 players spread out.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules } from '../../js/rules/index.js';

function world({ size = 2048, camps = [] } = {}) {
  const terrain = standInTerrain(3, size);
  const events = [];
  const room = createRoom({ id: 'prov', terrain, seed: 9, camps, createRules, hooks: { log: () => {} } });
  const orig = room.host.event;
  room.host.event = ev => { events.push(ev); return orig(ev); };
  return { room, terrain, events, sx: terrain.spawn.x, sz: terrain.spawn.z };
}
const player = (room, id, cls, x, z, level = 30) => room.addPlayer({ id, name: `P${id}`, cls, level, xp: 0, gold: 0, room: 'prov', x, z }, null, { x, z });

test('you.bar: six slots from Farhold\'s bar, with cooldown, mana, unlock level, lock, and ally/group flags', () => {
  const { room, sx, sz } = world();
  const me = player(room, 1, 'cleric', sx, sz, 10);
  const bar = room.rules.bar(me);
  assert.equal(bar.length, 6);
  assert.deepEqual(bar.map(b => b.slot), [1, 2, 3, 4, 5, 6]);
  const mend = bar.find(b => b.id === 'mend');
  assert.ok(mend && mend.ally === true, 'Mend is aimed at a friend');
  assert.ok(mend.cd > 0 && mend.mp > 0 && mend.name && mend.desc);
  const raise = bar.find(b => b.id === 'raise_the_fallen');
  assert.ok(raise && raise.group === true && raise.ally === false, 'Raise the Fallen reaches the party by itself');
  assert.ok(bar.some(b => b.locked && b.level > 10), 'slots above level 10 are locked');
  const damage = bar.find(b => !b.ally && !b.group && !b.locked);
  assert.ok(damage, 'a plain damage skill carries neither flag');
  assert.equal(room.stats.rulesErrors, 0, room.stats.lastRulesError);
});

test('a rare walks its placement loop when nobody is fighting it', () => {
  const { room, sx, sz } = world();
  player(room, 1, 'warrior', sx - 120, sz);           // close enough to keep it awake, too far to notice
  const path = [[sx, sz], [sx + 20, sz], [sx + 20, sz + 20], [sx, sz + 20]];
  const m = room.spawn({ kind: 'monster', type: 'wolf', level: 5, x: sx, z: sz, rank: 'elite', data: { path } });
  const seen = new Set();
  for (let i = 0; i < 600; i++) {
    room.step();
    path.forEach(([x, z], k) => { if (Math.hypot(m.x - x, m.z - z) < 3) seen.add(k); });
  }
  assert.ok(seen.size >= 3, `it walked the loop (reached waypoints ${[...seen]})`);
  assert.equal(room.stats.rulesErrors, 0, room.stats.lastRulesError);
});

test('an event boss carries data.scale: its health is multiplied', () => {
  const { room, sx, sz } = world();
  const a = room.spawn({ kind: 'monster', type: 'wolf', level: 5, x: sx, z: sz });
  const b = room.spawn({ kind: 'monster', type: 'wolf', level: 5, x: sx + 3, z: sz, data: { event: 'x', scale: 3 } });
  const k = b.hpMax / a.hpMax;                         // (each wolf rolls its own health a little)
  assert.ok(k > 2.6 && k < 3.4, `x${k.toFixed(2)}`);
  assert.equal(b.r.unit.maxHp, b.hpMax);
  assert.equal(b.hp, b.hpMax);
});

test('a monster taken away without dying (a parked camp) leaves nothing: no death, no reward, nobody chasing a ghost', () => {
  const { room, events, sx, sz } = world();
  const me = player(room, 1, 'ranger', sx, sz, 10);     // the ranger's cat goes for the wolf
  const awards = [];
  room.host.award = (e, a) => awards.push(a);
  const wolf = room.spawn({ kind: 'monster', type: 'wolf', level: 3, x: sx + 6, z: sz });
  room.intent(me, { t: 'cast', slot: 0, target: wolf.id });       // a drawn arrow is in the air
  for (let i = 0; i < 3; i++) room.step();
  const unit = wolf.r.unit;
  room.remove(wolf);
  for (let i = 0; i < 60; i++) room.step();
  assert.ok(!events.some(e => e.type === 'death' || (e.type === 'kill' && e.d === wolf.id)), 'no death for a parked monster');
  assert.equal(awards.length, 0, 'nobody is paid for it');
  assert.ok(!room.rules.field.monsters.includes(unit), 'gone from the field');
  for (const p of room.rules.field.allies) assert.notEqual(p.target, unit, 'no follower is still chasing it');
  assert.equal(room.stats.rulesErrors, 0, room.stats.lastRulesError);
});

test('PERF: ~1,300 monsters in camps over a 6 km province with 70 players spread out — the rules tick stays cheap', () => {
  const size = 6144;
  const { room, terrain } = world({ size });
  // 260 camps of 5 hounds on a grid; 70 players dropped among them
  let seed = 11; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const mons = [];
  for (let i = 0; i < 260; i++) {
    const cx = 200 + (i % 20) * 290, cz = 200 + Math.floor(i / 20) * 440;
    for (let k = 0; k < 5; k++) mons.push(room.spawn({ kind: 'monster', type: 'wolf', level: 5, x: cx + r() * 10, z: cz + r() * 10 }));
  }
  for (let i = 0; i < 70; i++) player(room, 100 + i, 'warrior', 100 + r() * (size - 200), 100 + r() * (size - 200), 30);
  for (let i = 0; i < 20; i++) room.step();          // warm up
  const t = [];
  for (let i = 0; i < 200; i++) { const t0 = performance.now(); room.rules.step(50); t.push(performance.now() - t0); }
  const s = [...t].sort((a, b) => a - b), mean = t.reduce((a, b) => a + b, 0) / t.length;
  console.log(`# ${mons.length} monsters, 70 players: rules step mean ${mean.toFixed(2)} ms, p95 ${s[190].toFixed(2)} ms, max ${s.at(-1).toFixed(2)} ms`);
  assert.ok(mean < 6, `mean ${mean.toFixed(2)} ms`);
  assert.equal(room.stats.rulesErrors, 0, room.stats.lastRulesError);
  void terrain;
});
