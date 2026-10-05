// Spectator mode (js/ui/spectate-model.js): it only READS the sim. An AI-vs-AI match run with the
// spectator's panels and character list computed every tick must end in exactly the same state as
// the same match run without them, in both modes. Also: F's order alternates the sides, wraps both
// ways, and the "both sides" fog is the union of the two vision bitsets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, aiVsAi, sim as makeSim, run } from './_sim.mjs';
import { createSim } from '../js/sim/sim.js';
import { linewarChars, linewarTeams, hvfChars, hvfTeams, nextChar, unionBits, FOG_MODES } from '../js/ui/spectate-model.js';

const hvfAllAi = (seed, format = '3v1', ai = 'veteran') => {
  const [f, h] = format.split('v').map(Number), players = [];
  for (let i = 0; i < f; i++) players.push({ role: 'farmer', kind: 'ai', ai: { difficulty: ai }, name: `Farmer ${i + 1}`, colour: i });
  for (let i = 0; i < h; i++) players.push({ role: 'hunter', kind: 'ai', ai: { difficulty: ai }, name: `Hunter ${i + 1}` });
  return createSim({ mode: 'hvf', format, seed, players }, data);
};

test('Line War: watching (panels + F list every tick) does not change the match', () => {
  const plain = makeSim(aiVsAi(11, 'veteran', 'commander'));
  const watched = makeSim(aiVsAi(11, 'veteran', 'commander'));
  const marks = [];
  for (let t = 0; t < 2400 && !plain.over; t++) {
    plain.step([]);
    linewarTeams(watched.state, watched.data); linewarChars(watched.state, watched.data);
    watched.step([]);
    if (t % 300 === 0) marks.push([plain.hash(), watched.hash()]);
  }
  for (const [a, b] of marks) assert.equal(a, b);
  assert.equal(plain.hash(), watched.hash());
  const teams = linewarTeams(watched.state, watched.data);
  assert.equal(teams.length, 2);
  assert.deepEqual(teams.map((t) => t.name), ['Blue banner', 'Red banner']);
  assert.ok(teams.every((t) => t.stats.find(([k]) => k === 'Banners') && t.chars.length === 1));
});

test('Hunters vs Farmers: an all-AI match is the same with or without the spectator reading it', () => {
  const plain = hvfAllAi(5), watched = hvfAllAi(5);
  for (let t = 0; t < 3000 && !plain.over; t++) {
    plain.step([]);
    hvfTeams(watched); hvfChars(watched);
    watched.step([]);
    if (t % 500 === 0) assert.equal(plain.hash(), watched.hash(), `tick ${t}`);
  }
  assert.equal(plain.hash(), watched.hash());
  assert.ok(plain.state.tick > 2000, 'the AI match runs with no human seat');
  const [farm, hunt] = hvfTeams(watched);
  assert.equal(farm.name, 'Farmers'); assert.equal(hunt.name, 'Hunters');
  assert.equal(farm.chars.length, 3); assert.equal(hunt.chars.length, 1);
  assert.match(farm.stats.find(([k]) => k === 'Hidden')[1], /^\d+ \/ \d+$/);
  for (const c of farm.chars) assert.match(c.sub, /hidden|SEEN|down/);
});

test('F order alternates the sides and wraps both ways', () => {
  const s = hvfAllAi(3, '4v2');
  const chars = hvfChars(s);
  assert.deepEqual(chars.map((c) => c.role), ['farmer', 'hunter', 'farmer', 'hunter', 'farmer', 'farmer']);
  assert.equal(nextChar(chars, chars[0].id, 1), chars[1].id);
  assert.equal(nextChar(chars, chars[5].id, 1), chars[0].id);
  assert.equal(nextChar(chars, chars[0].id, -1), chars[5].id);
  assert.equal(nextChar(chars, null, 1), chars[0].id);
  assert.equal(nextChar(chars, null, -1), chars[5].id);
  assert.equal(nextChar([], 1, 1), null);
  const lw = makeSim(aiVsAi(2));
  const lc = linewarChars(lw.state, lw.data);
  assert.deepEqual(lc.map((c) => c.team), [0, 1]);
  run(lw, 5);
});

test('the "both sides" fog is the union of the two visions; the fog choices are the four the panel shows', () => {
  const u = unionBits(new Int32Array([0b0101, -1, 0]), new Int32Array([0b0011, 0, 0b1]));
  assert.deepEqual([...u], [0b0111, -1, 1]);
  const s = hvfAllAi(9);
  run(s, 400);
  const v = s.state.hvf.vision, both = unionBits(v[0], v[1]);
  for (let i = 0; i < both.length; i++) assert.equal(both[i], v[0][i] | v[1][i]);
  assert.deepEqual(FOG_MODES.map((f) => f.id), ['farmers', 'hunters', 'both', 'off']);
});

test('online: a machine with no seat (a watcher) follows the match from the host\'s turns and stays in step', async () => {
  const { createLoopbackHub } = await import('../js/net/loopback.js');
  const { createLockstep } = await import('../js/net/lockstep.js');
  const { restoreSim } = await import('../js/sim/sim.js');
  const { config2v2 } = await import('./_net.mjs');
  const hub = createLoopbackHub({});
  const ts = ['host', 'guest', 'watcher'].map((n) => hub.transport(n));
  await ts[0].host('WATCH');
  for (let i = 1; i < 3; i++) { const p = ts[i].join('WATCH'); hub.advance(400); await p; }
  const startAt = hub.now + 200;
  // the start packet lists only machines that hold seats; the watcher is not in it
  const mlist = [{ id: ts[0].id, name: 'host', players: [0, 1], token: 'h' }, { id: ts[1].id, name: 'guest', players: [2], token: 'g' }];
  const cfg = config2v2(4);
  const nodes = ts.map((t, i) => {
    const hashes = new Map();
    const ls = createLockstep({ transport: t, sim: createSim(cfg, data, { events: false }), restore: (snap) => restoreSim(snap, data, { events: false }), isHost: i === 0, me: t.id, hostId: ts[0].id, machines: mlist, delay: 4, tickMs: 50, startAt, onTick: (tk, sm) => { if (tk % 20 === 0) hashes.set(tk, sm.hash()); }, onEvent: () => {} });
    return { ls, hashes };
  });
  while (nodes[2].ls.sim.tick < 400) {
    hub.advance(5);
    for (const [i, n] of nodes.entries()) {
      if (i < 2 && Math.floor(hub.now / 50) % 7 === 0) n.ls.queue([{ p: i === 0 ? 0 : 2, type: 'send', unit: data.races.races[cfg.players[i === 0 ? 0 : 2].race].units[0] }]);
      n.ls.update(hub.now);
    }
    if (hub.now > startAt + 60_000) break;
  }
  assert.ok(nodes[2].ls.sim.tick >= 400, 'the watcher runs');
  let compared = 0;
  for (const [t, h] of nodes[0].hashes) if (nodes[2].hashes.has(t)) { assert.equal(nodes[2].hashes.get(t), h, `tick ${t}`); compared++; }
  assert.ok(compared >= 15);
  assert.ok(nodes[0].ls.sim.state.players[0].stats.sends > 0, 'the seated players really played');
});
