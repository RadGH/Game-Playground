// Play-test 1 helpers (stream A): the REAL world in-process — torbor_downs (stream B's bakes, E's placements),
// stream C's rules, the farhold classes — on a virtual clock with a loopback socket. What the owner played,
// minus the browser. Loaded once per test file (the province takes ~2 s to build).
import { createVirtualClock } from '../../js/net/clock.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { createLoopbackServer } from '../../js/sim/loopback.js';
import { createWorld } from '../../js/sim/world.js';
import { loadLayouts, loadRules, loadClasses } from '../../server/load.mjs';
import { makeClient, run, until, waitP } from './helpers.js';

let cache = null;
/** { layouts, events, encounterInfo, directorRules, createRules, classes } — loaded once. */
export async function realContent() {
  if (cache) return cache;
  const quiet = console.log;
  const L = await loadLayouts(['torbor_downs']);
  const { createRules } = await loadRules('auto');
  cache = { ...L, createRules, classes: loadClasses() };
  console.log = quiet;
  return cache;
}

/** A loopback server over the real province. `opts` go to createWorld. */
export async function realServer(opts = {}) {
  const C = await realContent();
  const clock = opts.clock || createVirtualClock();
  const store = createMemoryStore({ now: clock.now });
  const world = createWorld({ store, layouts: C.layouts, events: C.events, encounterInfo: C.encounterInfo, createRules: C.createRules, classes: C.classes,
    now: clock.now, lingerMs: 0, log: () => {}, directorOpts: { rules: C.directorRules || {} }, warm: false, ...opts });
  const srv = createLoopbackServer({ clock, world });
  await srv.ready;
  return { srv, clock, world, C, store };
}

export async function joinReal(srv, clock, name, cls = 'warrior') {
  const c = makeClient(srv, clock);
  await waitP(clock, c.ready);
  const ch = await waitP(clock, c.createChar({ name, cls }));
  await waitP(clock, c.play(ch.id));
  await until(clock, () => !!c.joined, 5000);
  return c;
}

/** The province-side record `o` of a client. */
export const rec = (world, c) => world.online.get(c.joined.you.char);
export { run, until, waitP };
