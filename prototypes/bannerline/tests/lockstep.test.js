// Lockstep over the loopback transport (PLAN §19 test 9): 0-300 ms latency with jitter (so unreliable
// packets reorder), dropped packets, a couch pair on one machine, an AI seat, an injected desync, a
// disconnect -> AI takeover at an announced tick, and a rejoin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoom, config2v2, sameHashes, live } from './_net.mjs';
import { createLockstep, delayFor } from '../js/net/lockstep.js';
import { data } from './_sim.mjs';

const MACHINES = [{ name: 'host', players: [0, 1] }, { name: 'guest', players: [2] }];

test('two machines (couch pair + one) agree every 20 ticks to 1200 under 0-300 ms jitter and 20% drops', async () => {
  const room = await makeRoom({ hubOpts: { seed: 3, latency: [0, 300], drop: 0.2 }, machines: MACHINES, config: config2v2() });
  const [h, g] = room.nodes;
  room.hub.runUntil(() => { room.step(); return h.ls.tick >= 1200 && g.ls.tick >= 1200; }, 200000, 0);
  assert.ok(h.ls.tick >= 1200 && g.ls.tick >= 1200, `ticks ${h.ls.tick} / ${g.ls.tick}`);
  assert.deepEqual(sameHashes(h, g), []);
  assert.equal(h.hashes.get(1200), g.hashes.get(1200));
  assert.ok(room.hub.stats.dropped > 50, `drops happened (${room.hub.stats.dropped})`);
  // the couch pair and the guest really issued commands that reached the sim
  assert.ok(h.ls.sim.state.players[2].stats.sends > 0 && h.ls.sim.state.players[1].stats.sends > 0);
});

test('a stalled machine stalls everyone (waitingFor names it), then catches up', async () => {
  const room = await makeRoom({ hubOpts: { seed: 4, latency: [20, 40] }, machines: MACHINES, config: config2v2() });
  const [h, g] = room.nodes;
  room.hub.runUntil(() => { room.step(); return h.ls.tick >= 200; }, 60000, 0);
  g.alive = false;                        // the guest stops pumping (frozen tab)
  room.hub.runUntil(() => { room.step(); return h.ls.waitingFor.length > 0; }, 5000, 0);
  assert.deepEqual(h.ls.waitingFor.map(w => w.name), ['guest']);
  const stuck = h.ls.tick;
  for (let i = 0; i < 200; i++) room.step();
  assert.ok(h.ls.tick <= stuck + 1, 'host does not run ahead');
  g.alive = true;
  room.hub.runUntil(() => { room.step(); return g.ls.tick >= stuck + 200; }, 60000, 0);
  assert.deepEqual(sameHashes(h, g), []);
});

test('a desync is detected by the hash check and repaired with a snapshot', async () => {
  const room = await makeRoom({ hubOpts: { seed: 5, latency: [10, 60] }, machines: MACHINES, config: config2v2(), dump: true });
  const [h, g] = room.nodes;
  room.hub.runUntil(() => { room.step(); return g.ls.tick >= 300; }, 60000, 0);
  g.ls.sim.state.players[2].gold += 999;  // corrupt the guest
  const at = g.ls.tick;
  room.hub.runUntil(() => { room.step(); return g.events.some(e => e.type === 'resync'); }, 20000, 0);
  assert.ok(h.events.some(e => e.type === 'desync'), 'host saw it');
  assert.ok(g.events.some(e => e.type === 'resync'), 'guest resynced');
  room.hub.runUntil(() => { room.step(); return g.ls.tick >= at + 400; }, 60000, 0);
  assert.deepEqual(sameHashes(h, g, at + 100), []);
  assert.ok(h.ls.dumps.length >= 1 && h.ls.dumps[0].client && h.ls.dumps[0].host, 'both states kept for desync-diff');
});

test('a guest that leaves is replaced by the AI at an announced tick; the match goes on', async () => {
  const room = await makeRoom({ hubOpts: { seed: 6, latency: [10, 80] }, machines: MACHINES, config: config2v2() });
  const [h, g] = room.nodes;
  room.hub.runUntil(() => { room.step(); return h.ls.tick >= 300; }, 60000, 0);
  g.transport.close(); g.alive = false;
  room.hub.runUntil(() => { room.step(); return h.events.some(e => e.type === 'takeover'); }, 10000, 0);
  const n = h.events.find(e => e.type === 'takeover');
  assert.deepEqual(n.players, [2]);
  room.hub.runUntil(() => { room.step(); return h.ls.tick >= n.atTick + 200; }, 60000, 0);
  assert.equal(h.ls.sim.state.players[2].kind, 'ai');
  assert.deepEqual(h.ls.waitingFor, []);
});

test('the host leaving ends the match for the guest', async () => {
  const room = await makeRoom({ hubOpts: { seed: 7, latency: [10, 30] }, machines: MACHINES, config: config2v2() });
  const [h, g] = room.nodes;
  room.hub.runUntil(() => { room.step(); return g.ls.tick >= 100; }, 60000, 0);
  h.transport.close(); h.alive = false;
  room.hub.runUntil(() => { room.step(); return g.ls.ended; }, 10000, 0);
  assert.ok(g.events.some(e => e.type === 'hostLeft'));
});

test('a guest that comes back rejoins: snapshot, then its seat is released back to it', async () => {
  const room = await makeRoom({ hubOpts: { seed: 8, latency: [10, 80], drop: 0.1 }, machines: MACHINES, config: config2v2() });
  const [h, g] = room.nodes;
  room.hub.runUntil(() => { room.step(); return h.ls.tick >= 300; }, 60000, 0);
  g.transport.close(); g.alive = false;
  room.hub.runUntil(() => { room.step(); return h.ls.sim.state.players[2].kind === 'ai'; }, 20000, 0);
  // the same player on a new connection
  const t2 = room.hub.transport('guest2');
  const pj = t2.join('ABCDE'); room.hub.advance(300); await pj;
  const events = [];
  const g2 = { hashes: new Map() };
  // a reloaded page: its clock starts near 0 (the host's is ~15 s in) and it knows no start time
  const clock = -room.hub.now + 7;
  const ls2 = createLockstep({ onTick: (t, sm) => { if (t % 20 === 0) g2.hashes.set(t, sm.hash()); }, transport: t2, sim: null, restore: room.restore, isHost: false, me: t2.id, hostId: h.transport.id, machines: room.mlist, delay: 6, tickMs: 50, startAt: undefined, rejoinToken: 'tok-guest', onEvent: (type, e) => events.push({ type, ...e }) });
  Object.assign(g2, { name: 'guest2', transport: t2, ls: ls2, events, script: g.script, alive: true, clock });
  room.nodes.push(g2);
  room.hub.runUntil(() => { room.step(); return events.some(e => e.type === 'resync' && e.rejoin); }, 20000, 0);
  const rel = h.events.find(e => e.type === 'rejoin');
  assert.ok(rel, 'host announced the rejoin');
  room.hub.runUntil(() => { room.step(); return h.ls.tick >= rel.atTick; }, 60000, 0);
  const sendsAtRelease = h.ls.sim.state.players[2].stats.sends;
  room.hub.runUntil(() => { room.step(); return g2.ls.tick >= rel.atTick + 300 && h.ls.tick >= rel.atTick + 300; }, 60000, 0);
  assert.ok(g2.ls.tick >= rel.atTick + 300 && h.ls.tick >= rel.atTick + 300, `both kept ticking (${h.ls.tick} / ${g2.ls.tick})`);
  assert.equal(h.ls.sim.state.players[2].kind, 'human', 'seat released');
  assert.deepEqual(sameHashes(h, g2, rel.atTick), []);
  // the rejoined guest's OWN commands reach the sim (the seat is human now, so nobody else sends for it)
  assert.ok(h.ls.sim.state.players[2].stats.sends > sendsAtRelease, `guest sends after the rejoin: ${sendsAtRelease} -> ${h.ls.sim.state.players[2].stats.sends}`);
});

test('three machines in a 3v3 with AI seats stay in step', async () => {
  const cfg = { seed: 12, mode: 'linewar', format: '3v3', players: [
    { team: 0, kind: 'human', race: 'freeholds', hero: 'warrior' }, { team: 0, kind: 'human', race: 'ashtusk', hero: 'engineer' }, { team: 0, kind: 'ai', race: 'unburied', hero: 'druid' },
    { team: 1, kind: 'human', race: 'thornmane', hero: 'ranger' }, { team: 1, kind: 'ai', race: 'freeholds', hero: 'pyromancer' }, { team: 1, kind: 'ai', race: 'ashtusk', hero: 'warrior' }] };
  const room = await makeRoom({ hubOpts: { seed: 9, latency: [30, 150], drop: 0.05 }, machines: [{ name: 'h', players: [0] }, { name: 'a', players: [1] }, { name: 'b', players: [3] }], config: cfg });
  room.hub.runUntil(() => { room.step(); return live(room).every(n => n.ls.tick >= 600); }, 200000, 0);
  const [a, b, c] = room.nodes;
  assert.deepEqual(sameHashes(a, b), []); assert.deepEqual(sameHashes(a, c), []);
});

test('commands for players a machine does not own are dropped by the host', async () => {
  const room = await makeRoom({ hubOpts: { seed: 10, latency: [10, 20] }, machines: MACHINES, config: config2v2() });
  const [h, g] = room.nodes;
  g.script = () => [{ p: 0, type: 'surrender' }];   // the guest tries to surrender the host's team
  room.hub.runUntil(() => { room.step(); return h.ls.tick >= 200; }, 60000, 0);
  assert.equal(h.ls.sim.state.result, null);
});

test('input delay from the measured round trip', () => {
  assert.equal(delayFor(0, 50, false), 1);
  assert.equal(delayFor(40), 2);
  assert.equal(delayFor(200), 5);
  assert.equal(delayFor(2000), 8);
});

test('system commands: takeover makes a human seat AI at that tick, release gives it back; players cannot send them as themselves', async () => {
  const { createSim } = await import('../js/sim/sim.js');
  const s = createSim(config2v2(), data, { events: false });
  s.step([{ sys: true, type: 'takeover', player: 2, difficulty: 'recruit' }]);
  assert.equal(s.state.players[2].kind, 'ai');
  assert.equal(s.state.players[2].ai.difficulty, 'recruit');
  for (let i = 0; i < 100; i++) s.step([]);
  s.step([{ sys: true, type: 'release', player: 2 }]);
  assert.equal(s.state.players[2].kind, 'human');
  s.step([{ sys: true, type: 'release', player: 3 }]);   // a real AI seat is never "released"
  assert.equal(s.state.players[3].kind, 'ai');
});

test('tools/desync-diff.mjs names the field two states disagree on', async () => {
  const { execFileSync } = await import('node:child_process');
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { createSim } = await import('../js/sim/sim.js');
  const a = createSim(config2v2(), data, { events: false });
  for (let i = 0; i < 50; i++) a.step([]);
  const snapA = a.snapshot(), snapB = JSON.parse(JSON.stringify(snapA));
  snapB.state.players[2].gold += 5;
  const dir = mkdtempSync(join(tmpdir(), 'bl-'));
  writeFileSync(join(dir, 'dump.json'), JSON.stringify({ tick: 50, host: snapA, client: snapB }));
  let out = '';
  try { execFileSync(process.execPath, [new URL('../tools/desync-diff.mjs', import.meta.url).pathname, join(dir, 'dump.json')]); } catch (e) { out = String(e.stdout); }
  assert.match(out, /state\.players\[id=2\]\.gold/);
});
