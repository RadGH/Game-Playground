import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIENT_MSGS, SERVER_MSGS, validate, parseFrame, createBuckets, cleanName, ANIMS, ANIM_ID, MAX_FRAME, PROTOCOL_VERSION } from '../../js/net/protocol.js';
import { readFileSync } from 'node:fs';

const GOOD = {
  hello: { v: 1, build: 'dev' }, guest: { human: 'XXXX.DUMMY.TOKEN.XXXX' }, auth: { token: 'a'.repeat(64) }, chars: {}, create: { name: 'Aldra', cls: 'warrior', look: { race: 'elf' }, kit: { armour: 'a1', weapons: 'w2' } },
  play: { char: 3, join: 'ABCDE' }, party: { op: 'group', code: 'test/wilds:1:42' }, chat: { ch: 'party', text: 'hi all' }, ignore: { name: 'Bren', on: true },
  use: { id: 12 }, travel: { to: 'ws:test:t0' }, trace: { kind: 'campfire' }, quest: { op: 'accept', id: 'wolves_at_the_fold', npc: 40 }, trade: { op: 'offer', id: 3, items: ['p0-ab12cd34-1f'], gold: 10 }, item: { op: 'equip', uid: 'p0-ab12cd34-1f', slot: 'head' }, ping: { c: 12.5 }, enter: { ticket: 'abc' }, in: { s: 1, dt: 50, mx: 0.5, mz: -0.5, yaw: 1.2, b: 1 },
  cast: { slot: 0, aim: { x: 1, z: 2 }, target: 7, ct: 1000, held: 1.5 }, target: { id: 4 }, say: { text: 'hi' }, respawn: {}, leave: {},
  account: { op: 'claim', user: 'aldra', pass: 'longenough', email: 'a@b.cd', human: 'XXXX.DUMMY.TOKEN.XXXX' }, friend: { op: 'add', name: 'Bren' },
  guild: { op: 'motd', text: 'Raid at eight' }, callboard: { op: 'join', dungeon: 'torbor_downs:2', role: 'tank' }, report: { name: 'Bren', why: 'spam', text: 'selling gold' },
  mail: { op: 'send', to: 'Bren', subject: 'Hi', body: 'For you', items: ['p0-ab12cd34-1f'], gold: 5 },
  talent: { op: 'pick', skill: 'firebolt', tier: 1, node: 'fan' }, perk: { op: 'take', id: 'early_bond' }, map: { op: 'get' },
  // play-test 2
  loot: { op: 'take', id: 12, uid: 'p0-ab-1' }, shop: { op: 'buy', npc: 7, id: 's3' }, mount: { op: 'summon', id: 'pony' },
  barber: { npc: 9, look: { race: 'elf', seed: 3 } }, pref: { k: 'showHelm', v: false }, follow: { id: 4 }, inspect: { id: 4 }, bind: { npc: 5 },
  settings: { op: 'set', data: { tradeFriendsOnly: true } }, look: { char: 2, look: { race: 'dwarf', seed: 9 } },
  // play-test 5
  kits: { cls: 'warrior' }, revive: { op: 'accept', id: 3 }, sheet: {}, feedback: { kind: 'bug', text: 'The wolves never came.', ctx: { where: { x: 1, z: 2 }, logs: ['a', 'b'] } },
  feedbackMine: { limit: 20, before: 90 }, cart: { op: 'go', id: 12, to: 'cart_torborhold' }, meter: { on: true },
  admin: { op: 'report', id: 4, state: 'approved', note: 'good one' }, fish: { op: 'land', held: 0.7 }, cook: { id: 'cook_fish_on_a_stick', n: 2 },
  prof: { op: 'learn', id: 'mining', npc: 9 }, gather: { op: 'done', id: 12, inputs: [410, 0, 980, 0, 1630, 0] }, craft: { op: 'start', id: 'blades_1', npc: 9, base: 'dagger' },   // W9 (P-core)
};

test('every client message type has a valid example and the example passes', () => {
  assert.deepEqual(Object.keys(GOOD).sort(), Object.keys(CLIENT_MSGS).sort());
  for (const [t, f] of Object.entries(GOOD)) assert.equal(validate({ t, ...f }), null, t);
});

test('docs/protocol.md lists every message type in the table', () => {
  const md = readFileSync(new URL('../../docs/protocol.md', import.meta.url), 'utf8');
  for (const t of Object.keys(CLIENT_MSGS)) assert.ok(md.includes('| `' + t + '` |'), 'client msg ' + t + ' missing from protocol.md');
  for (const t of Object.keys(SERVER_MSGS)) assert.ok(md.includes('| `' + t + '` |'), 'server msg ' + t + ' missing from protocol.md');
  assert.ok(md.includes('`PROTOCOL_VERSION` | `' + PROTOCOL_VERSION + '`'));
});

test('wrong types, missing fields, extra fields, NaN-ish values and long strings are refused', () => {
  assert.equal(validate({ t: 'nope' }), 'type');
  assert.equal(validate(null), 'shape');
  assert.equal(validate([1, 2]), 'shape');
  assert.equal(validate({ t: 'hello', v: 1 }), 'field:build');
  assert.equal(validate({ t: 'hello', v: '1', build: 'x' }), 'field:v');
  assert.equal(validate({ t: 'hello', v: 1.5, build: 'x' }), 'field:v');
  assert.equal(validate({ t: 'hello', v: 1, build: 'x', admin: true }), 'extra:admin');
  assert.equal(validate({ t: 'in', s: 1, dt: Infinity, mx: 0, mz: 0, yaw: 0, b: 0 }), 'field:dt');
  assert.equal(validate({ t: 'in', s: 1, dt: 50, mx: NaN, mz: 0, yaw: 0, b: 0 }), 'field:mx');
  assert.equal(validate({ t: 'say', text: 'x'.repeat(201) }), 'field:text');
  assert.equal(validate({ t: 'cast', slot: 0, target: 70000 }), 'field:target');
  assert.equal(validate({ t: 'cast', slot: 0, target: -1 }), 'field:target');
  assert.equal(validate({ t: 'cast', slot: 0, aim: { x: 1 } }), 'field:aim');
  assert.equal(validate({ t: 'cast', slot: 0, aim: { x: 1, z: 2, y: 3 } }), 'field:aim');
  assert.equal(validate({ t: 'create', name: 'A', cls: 'warrior', look: [1] }), 'field:look');
  assert.equal(validate({ t: '__proto__' }), 'type');
  assert.equal(validate({ t: 'constructor' }), 'type');
});

test('socket kinds: gateway-only messages are refused on the province socket and back', () => {
  assert.equal(validate({ t: 'guest' }, 'p'), 'socket');
  assert.equal(validate({ t: 'in', s: 1, dt: 50, mx: 0, mz: 0, yaw: 0, b: 0 }, 'gw'), 'socket');
  assert.equal(validate({ t: 'ping', c: 1 }, 'gw'), null);
  assert.equal(validate({ t: 'ping', c: 1 }, 'p'), null);
});

test('parseFrame: binary, oversized and broken JSON are refused', () => {
  assert.equal(parseFrame(new Uint8Array(3)).bad, 'binary');
  assert.equal(parseFrame('x'.repeat(MAX_FRAME + 1)).bad, 'size');
  assert.equal(parseFrame('{"t":').bad, 'json');
  assert.equal(parseFrame('{"t":"ping","c":1e400}').bad, 'field:c');
  assert.deepEqual(parseFrame('{"t":"ping","c":3}').msg, { t: 'ping', c: 3 });
});

test('token buckets allow the burst then the rate', () => {
  let t = 0;
  const b = createBuckets(() => t);
  let ok = 0;
  for (let i = 0; i < 100; i++) if (b.take('in')) ok++;
  assert.equal(ok, CLIENT_MSGS.in.burst);
  t += 1000;
  ok = 0;
  for (let i = 0; i < 100; i++) if (b.take('in')) ok++;
  assert.equal(ok, CLIENT_MSGS.in.rate);
  assert.equal(b.take('bogus'), false);
});

test('names: letters, spaces, apostrophes, hyphens; 2-16', () => {
  assert.equal(cleanName('  Aldra   Fen '), 'Aldra Fen');
  assert.equal(cleanName("O'Rourke-Vale"), "O'Rourke-Vale");
  assert.equal(cleanName('Zoë'), 'Zoë');
  assert.equal(cleanName('A'), null);
  assert.equal(cleanName('x'.repeat(17)), null);
  assert.equal(cleanName('1337'), null);
  assert.equal(cleanName('<script>'), null);
  assert.equal(cleanName("'lead"), null);
});

test('animation table is append-only (wire ids fixed)', () => {
  const fixed = ['idle', 'walk', 'run', 'sprint', 'jump', 'fall', 'swim', 'attack', 'attack2', 'cast', 'channel', 'hit', 'die', 'dead', 'bite', 'howl', 'emote', 'interact'];
  fixed.forEach((n, i) => assert.equal(ANIMS[i], n));
  assert.ok(ANIMS.length < 256);
  assert.equal(ANIM_ID.bite, 14);
});
