// Shared test helpers for stream A.
import { createLoopbackServer } from '../../js/sim/loopback.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createVirtualClock } from '../../js/net/clock.js';
import { connect, memoryTokenStore } from '../../js/net/client.js';
import { createMirror } from '../../js/net/mirror.js';

/** Let pending promises (store calls) settle while virtual time stands still. */
export const flush = async (n = 5) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

/** Advance virtual time in small steps, flushing promises between them. */
export async function run(clock, ms, step = 10) {
  for (let t = 0; t < ms; t += step) { clock.advance(step); await flush(2); }
}
export async function until(clock, fn, maxMs = 10000, step = 10) {
  for (let t = 0; t < maxMs; t += step) { if (fn()) return true; clock.advance(step); await flush(2); }
  return !!fn();
}

export function makeServer({ clock = createVirtualClock(), store = null, latencyMs = 0, worldOpts = {} } = {}) {
  const st = store || createMemoryStore({ now: clock.now });
  const terrain = standInTerrain(3, 1024);
  return createLoopbackServer({ clock, latencyMs, worldOpts: { store: st, terrain, lingerMs: 0, log: () => {}, ...worldOpts } });
}

/** A client wired with a mirror; `server` may be a function returning the current server. */
export function makeClient(server, clock, opts = {}) {
  const net = connect({ mode: 'loopback', server, clock, tokenStore: opts.tokenStore || memoryTokenStore(), build: 'dev', ...opts });
  const mirror = createMirror();
  const evs = [];
  net.on('joined', () => mirror.reset());
  net.on('info', e => mirror.info(e));
  net.on('snap', s => { mirror.snap(s); net.lastSnap = s; });
  net.on('ev', m => evs.push(...m.e));
  net.mirror = mirror; net.evs = evs;
  return net;
}

export async function joinAs(srv, clock, name, cls = 'warrior', opts) {
  const c = makeClient(srv, clock, opts);
  let done = false;
  c.ready.then(async () => {
    const ch = await c.createChar({ name, cls });
    await c.play(ch.id);
    done = true;
  });
  await until(clock, () => done, 5000);
  if (!done) throw new Error('join failed for ' + name + ' status=' + c.status);
  return c;
}

/** Await a promise while driving virtual time (a promise that needs the server would never settle otherwise). */
export async function waitP(clock, p, maxMs = 10000) {
  let done = false, val, err;
  p.then(v => { done = true; val = v; }, e => { done = true; err = e || new Error('rejected'); });
  await until(clock, () => done, maxMs);
  if (!done) throw new Error('waitP: timed out');
  if (err) throw err;
  return val;
}
