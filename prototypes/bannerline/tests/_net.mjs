// Helpers for the online-play node tests: N machines on one loopback hub, each with its own sim and
// lockstep, driven on virtual time. Not a test file.
import { data } from './_sim.mjs';
import { createSim, restoreSim } from '../js/sim/sim.js';
import { createLoopbackHub } from '../js/net/loopback.js';
import { createLockstep } from '../js/net/lockstep.js';

export const config2v2 = (seed = 9) => ({ seed, mode: 'linewar', format: '2v2', players: [
  { team: 0, kind: 'human', race: 'freeholds', hero: 'warrior', name: 'A1' },
  { team: 0, kind: 'human', race: 'ashtusk', hero: 'pyromancer', name: 'A2' },
  { team: 1, kind: 'human', race: 'unburied', hero: 'ranger', name: 'B' },
  { team: 1, kind: 'ai', ai: { difficulty: 'veteran' }, race: 'thornmane', hero: 'druid', name: 'AI' }] });

/** A scripted player: a send or a move now and then, from its own little PRNG. */
export function scripter(seed, pids) {
  let s = seed >>> 0 || 1;
  const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  return sim => {
    const out = [];
    for (const p of pids) {
      if (r() < 0.04) { const race = sim.state.players[p].race; const us = data.races.races[race].units; out.push({ p, type: 'send', unit: us[Math.floor(r() * 4)] }); }
      if (r() < 0.02) out.push({ p, type: 'amove', x: sim.map.fields[sim.state.teams[sim.state.players[p].team].field].cx + (r() - 0.5) * 30, z: 30 + r() * 90 });
      if (r() < 0.01) out.push({ p, type: 'learn', slot: ['Q', 'W', 'E', 'R'][Math.floor(r() * 4)] });
    }
    return out;
  };
}

/**
 * Build a room on a hub: machines = [{ name, players }]; the first is the host.
 * Returns { hub, nodes: [{ name, transport, ls, script }], step(ms), hashesAt }.
 */
export async function makeRoom({ hubOpts = {}, machines, config, delay = 6, code = 'ABCDE', dump = false }) {
  const hub = createLoopbackHub(hubOpts);
  const ts = machines.map(m => hub.transport(m.name));
  await ts[0].host(code);
  for (let i = 1; i < ts.length; i++) { const p = ts[i].join(code); hub.advance(400); await p; }
  const startAt = hub.now + 200;
  const mlist = machines.map((m, i) => ({ id: ts[i].id, name: m.name, players: m.players, token: 'tok-' + m.name }));
  const restore = snap => restoreSim(snap, data, { events: false });
  const nodes = machines.map((m, i) => {
    const sim = createSim(config, data, { events: false });
    const events = [];
    const node = { hashes: new Map() };
    const ls = createLockstep({ onTick: (t, sm) => { if (t % 20 === 0) node.hashes.set(t, sm.hash()); }, transport: ts[i], sim, restore, isHost: i === 0, me: ts[i].id, hostId: ts[0].id, machines: mlist, delay, tickMs: 50, startAt, dump, onEvent: (type, e) => events.push({ type, ...e }) });
    return Object.assign(node, { name: m.name, transport: ts[i], ls, events, script: scripter(1000 + i, m.players), alive: true });
  });
  const record = n => { const s = n.ls.sim; if (s && s.tick % 20 === 0 && !n.hashes.has(s.tick)) n.hashes.set(s.tick, s.hash()); };
  function step(ms = 5) {
    hub.advance(ms);
    for (const n of nodes) {
      if (!n.alive) continue;
      if (n.ls.sim && Math.floor(hub.now / 50) % 4 === 0) n.ls.queue(n.script(n.ls.sim));
      n.ls.update(hub.now);
    }
  }
  return { hub, nodes, step, restore, mlist, startAt, ts };
}

export const live = room => room.nodes.filter(n => n.alive);
export function sameHashes(a, b, from = 0) {
  const bad = [];
  for (const [t, h] of a.hashes) if (t >= from && b.hashes.has(t) && b.hashes.get(t) !== h) bad.push(t);
  return bad;
}
