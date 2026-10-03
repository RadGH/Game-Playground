// Online lobby (PLAN §11.6, §12) over the loopback transport: rooms by code, seat claims (couch +
// online + AI), ready, ping -> input delay, start packet -> identical sims on every machine,
// back to the lobby with seats kept, leaving frees seats, rejoin through the lobby, and the data
// hash check (PLAN §19 test 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, dataWith } from './_sim.mjs';
import { createSim, restoreSim } from '../js/sim/sim.js';
import { createLoopbackHub } from '../js/net/loopback.js';
import { createRoom, joinRoom, beginMatch } from '../js/net/lobbysync.js';
import { cleanRoomCode, newRoomCode, CODE_ALPHABET } from '../js/net/transport.js';

/** Advance virtual time in small steps, yielding to promises between steps, until `p` settles. */
async function settle(hub, p, maxMs = 15000) {
  let done = false, val, err;
  p.then(v => { done = true; val = v; }, e => { done = true; err = e; });
  for (let t = 0; t < maxMs && !done; t += 20) { hub.advance(20); await new Promise(r => setImmediate(r)); }
  if (err) throw err;
  if (!done) throw new Error('did not settle');
  return val;
}

async function lobby({ latency = [20, 60], code = 'QWERT' } = {}) {
  const hub = createLoopbackHub({ seed: 2, latency });
  const th = hub.transport('host'), tg = hub.transport('guest');
  const host = await createRoom({ transport: th, name: 'Radley', dataHash: data.hash, clock: hub.clock, code });
  const pj = joinRoom({ transport: tg, code, name: 'Friend', dataHash: data.hash, clock: hub.clock });
  const guest = await settle(hub, pj);
  hub.advance(200);
  return { hub, host, guest, th, tg };
}

test('room codes: 5 letters with no I or O; typed codes are cleaned or refused', () => {
  for (let i = 0; i < 200; i++) { const c = newRoomCode(); assert.equal(c.length, 5); assert.ok([...c].every(ch => CODE_ALPHABET.includes(ch))); }
  assert.ok(!CODE_ALPHABET.includes('I') && !CODE_ALPHABET.includes('O'));
  assert.equal(cleanRoomCode(' qw-ert '), 'QWERT');
  assert.equal(cleanRoomCode('QWER0'), null);
  assert.equal(cleanRoomCode('QWEIT'), null);
});

test('host + guest: claim seats (a couch pair on the host), AI seat, ready, start, same sims to tick 600', async () => {
  const { hub, host, guest, th, tg } = await lobby();
  host.configure({ format: '2v2' });
  host.claim('0-0', { local: 0, name: 'Radley', race: 'freeholds', hero: 'warrior', device: 'keyboard' });
  host.claim('0-1', { local: 1, name: 'Couch', race: 'ashtusk', hero: 'engineer', device: 'pad0' });
  guest.claim('1-0', { local: 0, race: 'unburied', hero: 'druid', device: 'keyboard' });
  host.setSlot('1-1', { kind: 'ai', difficulty: 'veteran' });
  hub.advance(300);
  assert.equal(guest.state.slots.find(s => s.key === '1-0').owner, tg.id, 'the guest sees its own seat');
  assert.throws(() => host.start(), /not ready/);
  host.ready('0-0'); host.ready('0-1'); guest.ready('1-0', true);
  hub.advance(3000);   // pings flow
  assert.ok(host.state.machines.find(m => m.id === tg.id).ping > 0, 'ping measured');
  let gp = null; guest.on('start', p => { gp = p; });
  const hp = host.start({ seed: 77 });
  hub.advance(300);
  assert.ok(gp, 'the guest got the start packet');
  assert.equal(hp.config.players.length, 4);
  assert.deepEqual(hp.machines.find(m => m.id === th.id).players, [0, 1]);
  assert.deepEqual(hp.machines.find(m => m.id === tg.id).players, [2]);
  assert.ok(hp.delay >= 2 && hp.delay <= 8);
  const now = () => hub.now;
  const H = beginMatch(host, hp, { data, createSim: (c, d) => createSim(c, d, { events: false }), restoreSim, now });
  const G = beginMatch(guest, gp, { data, createSim: (c, d) => createSim(c, d, { events: false }), restoreSim, now });
  assert.deepEqual(H.localPlayers.map(l => [l.pid, l.device]), [[0, 'keyboard'], [1, 'pad0']]);
  assert.deepEqual(G.localPlayers.map(l => l.pid), [2]);
  const hashes = [new Map(), new Map()];
  hub.runUntil(() => {
    hub.advance(5);
    for (const [i, M] of [H, G].entries()) {
      if (Math.floor(hub.now / 50) % 20 === 0) M.lockstep.queue(M.localPlayers.map(l => ({ p: l.pid, type: 'send', unit: data.races.races[M.lockstep.sim.state.players[l.pid].race].units[0] })));
      M.lockstep.update(hub.now);
      const s = M.lockstep.sim; if (s.tick % 20 === 0) hashes[i].set(s.tick, s.hash());
    }
    return H.lockstep.tick >= 600 && G.lockstep.tick >= 600;
  }, 120000, 0);
  assert.equal(H.lockstep.sim.state.tick >= 600, true);
  for (const [t, h] of hashes[0]) if (hashes[1].has(t)) assert.equal(hashes[1].get(t), h, `tick ${t}`);
  assert.ok(H.lockstep.sim.state.players[2].stats.sends > 0, 'the guest sent units across the network');
  // back to the lobby: seats kept, ready cleared
  host.backToLobby(); hub.advance(300);
  const st = guest.state;
  assert.equal(st.phase, 'lobby');
  assert.equal(st.slots.find(s => s.key === '1-0').owner, tg.id);
  assert.ok(st.slots.filter(s => s.kind === 'human').every(s => !s.ready));
});

test('only open seats can be claimed; a guest cannot change another player seat', async () => {
  const { hub, host, guest } = await lobby();
  host.claim('0-0', { name: 'Radley' });
  let err = null; guest.on('error', e => { err = e; });
  guest.claim('0-0', { name: 'Thief' }); hub.advance(300);
  assert.equal(err.code, 'taken');
  guest.ready('0-0', true); hub.advance(300);
  assert.equal(host.state.slots.find(s => s.key === '0-0').ready, false);
});

test('a guest leaving the lobby frees its seats', async () => {
  const { hub, host, guest } = await lobby();
  guest.claim('1-0', {}); hub.advance(300);
  assert.equal(host.state.slots.find(s => s.key === '1-0').kind, 'human');
  guest.leave(); hub.advance(500);
  assert.equal(host.state.slots.find(s => s.key === '1-0').kind, 'open');
  assert.equal(host.state.machines.length, 1);
});

test('data hash check: a guest with different data is refused with "Version mismatch"', async () => {
  const hub = createLoopbackHub({ seed: 3, latency: [10, 20] });
  await createRoom({ transport: hub.transport('h'), dataHash: data.hash, clock: hub.clock, code: 'ZXCVB' });
  const other = dataWith(raw => { raw.units.units.levy.hp += 1; });
  const pj = joinRoom({ transport: hub.transport('g'), code: 'ZXCVB', dataHash: other.hash, clock: hub.clock });
  await assert.rejects(settle(hub, pj), e => e.code === 'version' && /Version mismatch/.test(e.message));
  // and a start packet from different data is refused by beginMatch
  assert.throws(() => beginMatch({ me: 'x', isHost: false, state: null }, { dataHash: other.hash }, { data }), /Version mismatch/);
});

test('joining a code nobody hosts fails plainly; a taken code is retried with a fresh one', async () => {
  const hub = createLoopbackHub({ seed: 4, latency: [10, 20] });
  const pj = joinRoom({ transport: hub.transport('g'), code: 'NOONE', dataHash: data.hash, clock: hub.clock });
  await assert.rejects(settle(hub, pj), e => e.code === 'no-room');
  const a = await createRoom({ transport: hub.transport('a'), dataHash: data.hash, clock: hub.clock, code: 'TAKEN' });
  await assert.rejects(createRoom({ transport: hub.transport('b'), dataHash: data.hash, clock: hub.clock, code: 'TAKEN' }), e => e.code === 'taken');
  const c = await createRoom({ transport: hub.transport('c'), dataHash: data.hash, clock: hub.clock });
  assert.notEqual(c.code, a.code);
});

test('the room is full at six machines', async () => {
  const hub = createLoopbackHub({ seed: 5, latency: [5, 10] });
  await createRoom({ transport: hub.transport('h'), dataHash: data.hash, clock: hub.clock, code: 'FULLR' });
  for (let i = 0; i < 5; i++) await settle(hub, joinRoom({ transport: hub.transport('g' + i), code: 'FULLR', dataHash: data.hash, clock: hub.clock }));
  await assert.rejects(settle(hub, joinRoom({ transport: hub.transport('g6'), code: 'FULLR', dataHash: data.hash, clock: hub.clock })), e => e.code === 'full');
});

test('rejoin through the lobby: a guest that dropped mid-match comes back to its seat', async () => {
  const { hub, host, guest, tg } = await lobby();
  host.claim('0-0', { name: 'Radley' }); guest.claim('1-0', {});
  hub.advance(300);
  host.ready('0-0'); guest.ready('1-0'); hub.advance(300);
  let gp; guest.on('start', p => { gp = p; });
  const hp = host.start({ seed: 5 }); hub.advance(300);
  const mk = (r, p, extra = {}) => beginMatch(r, p, { data, createSim: (c, d) => createSim(c, d, { events: false }), restoreSim: (s, d) => restoreSim(s, d, { events: false }), now: () => hub.now, ...extra });
  const H = mk(host, hp), G = mk(guest, gp);
  const run = (Ms, until) => hub.runUntil(() => { hub.advance(5); for (const M of Ms) M.lockstep.update(hub.now); return until(); }, 120000, 0);
  run([H, G], () => H.lockstep.tick >= 200);
  tg.close();
  run([H], () => H.lockstep.sim.state.players[1].kind === 'ai');
  const token = gp.machines.find(m => m.id === tg.id).token;
  const t2 = hub.transport('guest-again');
  const pj = joinRoom({ transport: t2, code: host.code, name: 'Friend', dataHash: data.hash, clock: hub.clock, rejoinToken: token });
  const g2 = await settle(hub, pj);
  assert.ok(g2.rejoin && g2.rejoin.packet, 'the host sent the match packet back');
  const G2 = mk(g2, g2.rejoin.packet, { rejoin: g2.rejoin });
  run([H, G2], () => G2.lockstep.tick >= H.lockstep.tick - 2 && H.lockstep.sim.state.players[1].kind === 'human' && G2.lockstep.tick > 600);
  assert.equal(H.lockstep.sim.state.players[1].kind, 'human');
  assert.equal(G2.lockstep.sim.hash() === H.lockstep.sim.hash() || G2.lockstep.tick !== H.lockstep.tick, true);
});
