// Helpers for the M3 tests (stream A): a server with accounts switched on (cheap scrypt), claimed players at a level.
import { createVirtualClock } from '../../js/net/clock.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { createChatFilter } from '../../js/sim/chatfilter.js';
import { testHasher } from '../../server/passwords.js';
import { makeServer, joinAs, until, run, waitP, flush } from './helpers.js';

export function m3Server({ clock = createVirtualClock(), store = null, worldOpts = {} } = {}) {
  const st = store || createMemoryStore({ now: clock.now });
  // wall time = the virtual clock too, so mutes, expiry and limits move with the test
  const srv = makeServer({ clock, store: st, worldOpts: { hasher: testHasher, chatFilter: createChatFilter(), wallNow: clock.now, ...worldOpts } });
  return { srv, clock, store: st };
}

/** Set a character's level everywhere it is read (entity, live char, the gateway's presence). */
export function setLevel(srv, c, lv) {
  const W = srv.world, o = W.online.get(c.joined.you.char);
  o.entity.setLevel(lv); o.char.level = lv;
  const pr = W.gateway.presence.get(o.char.id); if (pr) pr.level = lv;
}

/** Real passwords hash on the thread pool: wait for them with real time while virtual time stands. */
export async function settle(clock, fn, maxMs = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 5));
    clock.advance(10); await flush(2);
  }
  return !!fn();
}

/** Join, claim the account (username = name lowercased), set the level. Returns the client. */
export async function claimedAs(srv, clock, name, { level = 5, cls = 'warrior', pass = 'correct horse' } = {}) {
  const c = await joinAs(srv, clock, name, cls);
  let r = null; const off = c.on('accountR', m => { if (m.op === 'claim') r = m; });
  c.claim(name.toLowerCase().replace(/[^a-z0-9]/g, '') + 'x', pass);
  await settle(clock, () => r);
  off();
  if (!r || !r.ok) throw new Error('claim failed ' + JSON.stringify(r));
  await run(clock, 50);
  setLevel(srv, c, level);
  return c;
}

export { joinAs, until, run, waitP, flush };
