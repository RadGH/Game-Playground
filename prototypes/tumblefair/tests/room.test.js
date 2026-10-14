import test from 'node:test';
import assert from 'node:assert/strict';
import { world, withBots, DATA } from './helpers.js';
import { GAMES, gameIds } from '../js/games/index.js';
import { AWARDS, PAYOUT } from '../js/sim/room.js';
import { validate, cleanCode, cleanName } from '../js/shared/protocol.js';

function party(n, opts = {}) {
  const w = world(opts);
  const host = withBots(w.phone()); host.send({ t: 'create' });
  const code = host.room.code;
  const rest = []; for (let i = 1; i < n; i++) { const p = withBots(w.phone()); p.send({ t: 'join', code }); rest.push(p); }
  return { w, host, rest, all: [host, ...rest], code };
}

test('a room: four seats, the fifth waits, a screen takes no seat', () => {
  const { w, host, all, code } = party(4);
  assert.match(code, /^[A-HJ-NP-Z]{4}$/);
  assert.deepEqual(host.room.members.map(m => m.seat), [0, 1, 2, 3]);
  const fifth = w.phone(); fifth.send({ t: 'join', code });
  assert.equal(fifth.room.members.find(m => m.pid === fifth.pid).seat, null, 'no fifth seat');
  assert.equal(fifth.room.members.find(m => m.pid === fifth.pid).wait, true);
  const tv = w.phone({ bot: false }); tv.send({ t: 'join', code, display: true });
  const row = tv.room.members.find(m => m.pid === tv.pid);
  assert.equal(row.display, true); assert.equal(row.seat, null); assert.equal(row.wait, false);
  assert.equal(all[1].room.host, host.pid);
  const lost = w.phone(); lost.send({ t: 'join', code: 'ZZZZ' });
  assert.equal(lost.last.err.code, 'noroom');
});

for (const n of [1, 2, 3, 4]) for (const mode of ['board', 'marathon']) {
  test(`${n} player${n > 1 ? 's' : ''} finish a ${mode} match and are paid`, () => {
    const { w, host, all } = party(n, { seed: 11 * n + mode.length });
    host.send({ t: 'opt', key: 'mode', value: mode }); host.send({ t: 'opt', key: 'rounds', value: 3 });
    assert.equal(host.room.opts.mode, mode);
    all[all.length - 1].send({ t: 'start' });
    if (n > 1) assert.equal(host.phase, 'lobby', 'only the host starts a match');
    host.send({ t: 'start' });
    const done = w.run(20 * 60 * 1000, () => host.got.some(m => m.t === 'phase' && m.phase === 'final'));
    assert.ok(done, `reached the final (stuck in ${host.phase})`);
    const final = host.last.phase;
    assert.equal(final.standings.length, n);
    const games = host.got.filter(m => m.t === 'phase' && m.phase === 'results');
    assert.equal(games.length, 3, 'one minigame a round');
    for (const g of games) {
      assert.ok(GAMES[g.game]);
      const placed = g.result.order.flat().sort();
      assert.deepEqual(placed, all.map(p => p.pid).sort(), 'everyone is placed exactly once');
      assert.equal(g.award[g.result.order[0][0]], AWARDS[mode][0]);
    }
    for (const p of all) { assert.ok(final.payout[p.pid] >= PAYOUT.base); assert.equal(p.me.coins, final.payout[p.pid], 'coins reached the profile'); }
    assert.equal(final.standings[0].place, 1);
    assert.ok(w.run(60000, () => host.phase === 'lobby'), 'and back to the lobby');
    assert.equal(host.room.match, null);
  });
}

test('a phone that drops mid-match comes back to its seat and score; a newcomer waits for the next minigame', () => {
  const { w, host, rest, code } = party(3, { seed: 5 });
  host.send({ t: 'opt', key: 'mode', value: 'marathon' }); host.send({ t: 'start' });
  assert.ok(w.run(60000, () => host.phase === 'game'));
  const late = withBots(w.phone()); late.send({ t: 'join', code });
  assert.equal(late.room.members.find(m => m.pid === late.pid).seat, null, 'joined mid-game: watching');
  assert.equal(late.last.phase.phase, 'game', 'and is shown the game in progress');
  assert.ok(late.got.some(m => m.t === 'phase' && m.phase === 'intro' && m.resume && m.init), 'with what it needs to draw it');
  const gone = rest[0], pid = gone.pid, token = gone.token;
  gone.close();
  w.run(1000);
  assert.equal(host.room.members.find(m => m.pid === pid).on, false);
  const back = withBots(w.phone({ token })); back.send({ t: 'join', code });
  assert.equal(back.pid, pid, 'same player');
  assert.equal(back.room.members.find(m => m.pid === pid).seat, 1, 'same seat');
  assert.ok(w.run(120000, () => host.phase === 'intro' && host.last.phase.round === 2));
  assert.equal(host.room.members.find(m => m.pid === late.pid).seat, 3, 'the newcomer is seated for the next minigame');
  assert.ok(host.last.phase.players.some(p => p.pid === late.pid));
});

test('the host leaving hands the room to someone else; an empty room is closed', () => {
  const { w, host, rest } = party(3);
  host.send({ t: 'leave' });
  assert.equal(rest[0].room.host, rest[0].pid);
  assert.deepEqual(rest[0].room.members.map(m => m.seat), [1, 2]);
  rest[0].close(); rest[1].close();
  w.run(120000);
  assert.equal(w.hub.rooms.size, 0);
});

test('the shop: coins buy a costume once, and only owned costumes can be worn', () => {
  const { w, host } = party(1);
  const item = DATA.cosmetics.items.find(c => c.price > 0);
  host.send({ t: 'buy', id: item.id });
  assert.equal(host.last.err.code, 'buy');
  host.send({ t: 'equip', id: item.id });
  assert.notEqual(host.me.costume, item.id);
  w.profiles.reward(host.token, item.price + 5);
  host.send({ t: 'buy', id: item.id });
  assert.equal(host.me.coins, 5); assert.ok(host.me.owned.includes(item.id));
  host.send({ t: 'equip', id: item.id });
  assert.equal(host.me.costume, item.id);
  assert.equal(host.room.members[0].costume, item.id, 'the room sees the costume');
  host.send({ t: 'buy', id: item.id });
  assert.equal(host.me.coins, 5, 'not charged twice');
  const free = DATA.cosmetics.items.filter(c => !c.price);
  assert.ok(free.length >= 3 && free.every(c => host.me.owned.includes(c.id)));
});

test('names and looks are cleaned; junk frames are dropped', () => {
  const { host } = party(1);
  const race0 = host.me.look.race;
  host.send({ t: 'profile', name: '  <b>Zed</b>\n the   Great  ', look: { race: 'dragon', seed: 42, custom: { hair: { id: 'no-such-hair', color: 'red' }, body: { height: 99 } } } });
  assert.equal(host.me.name, 'bZed/b the Gre');
  assert.equal(host.me.look.race, race0, 'an unknown race keeps the one you had'); assert.equal(host.me.look.seed, 42);
  assert.equal(host.me.look.custom?.hair, undefined, 'an unknown part is dropped');
  assert.equal(host.room.members[0].name, host.me.name);
  assert.equal(validate({ t: 'in', s: 1, mx: 0, mz: 0, b: 0 }), null);
  assert.equal(validate({ t: 'in', s: 1, mx: 'x', mz: 0, b: 0 }), 'field:mx');
  assert.equal(validate({ t: 'in', s: 1, mx: 0, mz: 0, b: 0, hack: 1 }), 'extra:hack');
  assert.equal(validate({ t: 'nope' }), 'type');
  assert.equal(cleanCode('ab-cd'), 'ABCD'); assert.equal(cleanCode('ABIO'), null); assert.equal(cleanName('   '), null);
});

test('every game declares what the room and the vote need', () => {
  for (const id of gameIds()) {
    const { meta, create } = GAMES[id];
    assert.equal(meta.id, id);
    for (const k of ['title', 'blurb', 'kind', 'min', 'max', 'seconds', 'card']) assert.ok(meta[k] != null, `${id}.${k}`);
    assert.ok(Array.isArray(meta.how) && meta.how.length >= 2 && meta.how.length <= 4, `${id}: 2-4 lines of how to play`);
    assert.ok(['arena', 'ui'].includes(meta.kind));
    if (meta.kind === 'arena') { assert.ok(meta.move?.speed > 0 && meta.arena?.shape, `${id}: arena games declare move + arena`); }
    assert.equal(typeof create, 'function');
  }
});
