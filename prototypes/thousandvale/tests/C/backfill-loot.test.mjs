// node --test prototypes/thousandvale/tests/C/backfill-loot.test.mjs
//
// A's two M3 hooks (docs/requests.md "A -> C, M3"):
//   * rules.backfill(entity, n) — the Callboard popped a short group; hired followers of the MISSING
//     roles fill the empty seats, fight with the normal follower brain, the healer looks after the
//     whole party, and they stay in the dungeon when their owner leaves;
//   * rules.rollLoot(e, { tier }) — a rarity name is "at least this rarity" (epic / legendary for the
//     world boss's cache and first kill of the day).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, missingRoles, roleOfClass, BACKFILL, LOOT_TIERS } from '../../js/rules/index.js';

function setup({ cls = 'warrior', level = 10, partyId = 9 } = {}) {
  const terrain = standInTerrain(2, 2048);
  const events = [];
  const room = createRoom({ id: 'c-backfill', terrain, seed: 11, camps: [], createRules, hooks: { log: () => {} } });
  const origEvent = room.host.event;
  room.host.event = ev => { events.push(ev); return origEvent(ev); };
  const sx = terrain.spawn.x, sz = terrain.spawn.z;
  const me = room.addPlayer({ id: 501, name: 'Leader', cls, level, xp: 0, gold: 0, room: 'c-backfill', x: sx, z: sz, partyId }, null);
  return { room, me, events, sx, sz, terrain };
}
const fillers = (room, owner) => [...room.host.entities.values()].filter(x => x.kind === 'npc' && x.data?.backfill && x.data.owner === owner.id);

test('missingRoles: a five-seat group of 1 tank, 1 healer, 3 damage', () => {
  assert.deepEqual(missingRoles(['tank'], 4), ['healer', 'dps', 'dps', 'dps']);
  assert.deepEqual(missingRoles(['dps'], 4), ['tank', 'healer', 'dps', 'dps']);
  assert.deepEqual(missingRoles(['healer'], 1), ['tank'], 'unknown members take damage seats first: the tank is the gap');
  assert.deepEqual(missingRoles(['tank', 'healer', 'dps'], 2), ['dps', 'dps']);
  assert.deepEqual(missingRoles(['dps', 'dps', 'dps', 'dps'], 1), ['tank'], 'a fourth damage dealer still leaves the tank open');
  assert.equal(roleOfClass({ role: 'Frontline Tank' }), 'tank');
  assert.equal(roleOfClass({ role: 'Primary Healer' }), 'healer');
  assert.equal(roleOfClass({ role: 'AoE Glass Cannon' }), 'dps');
});

test('backfill summons hired followers of the missing roles, outside the follower-slot gate', () => {
  const { room, me } = setup({ cls: 'ranger', level: 8 });      // a ranger brings a companion that takes a slot
  const out = room.rules.backfill(me, 4);
  assert.equal(out.length, 4, 'all four seats filled: ' + JSON.stringify(out));
  assert.deepEqual(out.map(o => o.role), ['tank', 'healer', 'dps', 'dps']);
  assert.equal(out[0].defId, BACKFILL.tank);
  assert.equal(out[1].defId, BACKFILL.healer);
  const ents = fillers(room, me);
  assert.equal(ents.length, 4, 'each seat-filler is a room entity every client draws (kind npc, data.backfill = role)');
  assert.ok(ents.every(x => x.team === 1));
  assert.deepEqual(room.rules.backfill(me, 0), []);
  // the roles hint wins over the guess
  const b = setup({ cls: 'warrior', level: 8 });
  assert.deepEqual(b.room.rules.backfill(b.me, 2, { roles: ['tank', 'healer', 'dps'] }).map(o => o.role), ['dps', 'dps']);
  assert.equal(room.stats.rulesErrors, 0);
});

test('the seat-fillers fight: a wolf pack dies to the hired group', () => {
  const { room, me, events, sx, sz } = setup({ cls: 'warrior', level: 10 });
  const ids = new Set(room.rules.backfill(me, 4).map(o => o.id));
  const pack = [];
  for (let i = 0; i < 4; i++) pack.push(room.spawn({ kind: 'monster', type: 'wolf', level: 8, x: sx + (i - 1.5) * 1.5, z: sz + 9 }));
  for (let k = 0; k < 20 * 90 && pack.some(w => !w.dead); k++) room.step();
  assert.ok(pack.every(w => w.dead), 'the pack died with the player standing still');
  const hits = events.filter(e => e.type === 'hit' && ids.has(e.s) && e.n > 0);
  assert.ok(new Set(hits.map(h => h.s)).size >= 3, 'at least three seat-fillers landed hits');
  assert.equal(room.stats.rulesErrors, 0);
});

test('the hired healer heals the most hurt party member, not only its owner', () => {
  const { room, me, events, sx, sz } = setup({ cls: 'warrior', level: 10, partyId: 9 });
  const friend = room.addPlayer({ id: 502, name: 'Friend', cls: 'mage', level: 10, xp: 0, gold: 0, room: 'c-backfill', x: sx + 2, z: sz + 1, partyId: 9 }, null);
  room.rules.onParty(friend, 9); room.rules.onParty(me, 9);
  const [healer] = room.rules.backfill(me, 1, { roles: ['tank', 'dps', 'dps', 'dps'] });
  assert.equal(healer.role, 'healer');
  friend.r.unit.hp = Math.round(friend.r.unit.maxHp * 0.3);
  friend.setHp(friend.r.unit.hp);
  for (let k = 0; k < 20 * 20; k++) {
    room.step();
    if (events.some(e => e.type === 'hit' && e.kind === 'heal' && e.s === healer.id && e.d === friend.id)) break;
  }
  const healed = events.filter(e => e.type === 'hit' && e.kind === 'heal' && e.s === healer.id);
  assert.ok(healed.some(e => e.d === friend.id), 'the healer healed the friend: ' + JSON.stringify(healed.slice(0, 3)));
  assert.equal(room.stats.rulesErrors, 0);
});

test('seat-fillers stay in the dungeon: the owner leaving dismisses them', () => {
  const { room, me } = setup({ cls: 'warrior', level: 10 });
  room.rules.backfill(me, 3);
  assert.equal(fillers(room, me).length, 3);
  const book = me.r.unit.pets;
  room.removePlayer(me);
  assert.equal(fillers(room, me).length, 0, 'no seat-filler entity left behind');
  assert.ok(!book.list.some(p => p.backfill) && !book.fallen.some(f => f.backfill), 'none carried out with the owner');
  assert.equal(room.stats.rulesErrors, 0);
});

test('rollLoot: a rarity name is "at least this rarity"', () => {
  const { room, me } = setup({ cls: 'warrior', level: 20 });
  const RANK = { normal: 0, magic: 1, rare: 2, legendary: 3 };
  const roll = tier => room.rules.rollLoot(me, { level: 20, tier });
  for (let i = 0; i < 30; i++) {
    const leg = roll('legendary');
    assert.equal(leg.length, 1);
    assert.equal(leg[0].rarity, 'legendary', 'legendary = a legendary every time');
    const epic = roll('epic');
    assert.equal(epic.length, 2, 'epic = two items');
    assert.ok(RANK[epic[0].rarity] >= 2 && RANK[epic[1].rarity] >= 1, 'epic = rare-or-better plus magic-or-better: ' + epic.map(x => x.rarity));
    const rare = roll('rare');
    assert.ok(rare.length === 1 && RANK[rare[0].rarity] >= 2);
    const unc = roll('uncommon');
    assert.ok(unc.length === 1 && RANK[unc[0].rarity] >= 1);
    assert.equal(roll('reward').length, 1, 'reward unchanged: always one item');
  }
  // a plain chest is the plain roll: sometimes nothing
  let empty = 0;
  for (let i = 0; i < 60; i++) if (roll('common').length === 0) empty++;
  assert.ok(empty > 0, 'common is the ordinary roll (it can come up empty)');
  assert.ok(Object.isFrozen(LOOT_TIERS));
  assert.equal(room.stats.rulesErrors, 0);
});
