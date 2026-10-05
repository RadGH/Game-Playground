// The whole server sim in a Web Worker (stream A, PLAN §8.6): the browser can play with no server at all
// (`connect({ mode: 'worker' })`, the client's ?offline=1), and the sim is debuggable in devtools.
// Sockets are multiplexed over postMessage (js/net/sockets.js workerFactory):
//   page -> worker  { op: 'open', id, path } | { op: 'msg', id, data } | { op: 'close', id }
//   worker -> page  { op: 'open', id } | { op: 'msg', id, data } | { op: 'close', id, code, reason } | { op: 'ready', info } | { op: 'error', msg }
// Characters live in memory (lost when the tab closes); a stored token from an older Worker is refused
// and client.js makes a new guest by itself.

import { createWorld } from './world.js';
import { createMemoryStore } from './store-memory.js';
import { loadZoneTerrain, standInTerrain } from './terrain.js';
import { startTicker, realClock } from '../net/clock.js';
import { loadZoneContent } from './content.js';

const conns = new Map();   // id -> handler
let world = null;
const queued = [];         // messages that arrive before the world is ready

async function fetchBytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

async function boot() {
  const params = new URL(self.location.href).searchParams;
  const zone = params.get('terrain') || 'test';
  let terrain;
  try { terrain = loadZoneTerrain(await fetchBytes(new URL(`../../data/zones/${zone}/terrain.bin`, import.meta.url)), zone); }
  catch (err) { console.warn('[worker] no baked terrain, using the stand-in field:', err.message); terrain = standInTerrain(1, 2048); }
  let classes = null;
  try { classes = (await (await fetch(new URL('../../../farhold/data/classes.json', import.meta.url))).json()).classes.map(c => c.id); } catch { /* any class id */ }
  let createRules;
  if (params.get('rules') !== 'v0') {
    try { createRules = (await import('../rules/index.js')).createRules; } catch { /* stream C not landed yet */ }
  }
  if (typeof createRules !== 'function') createRules = (await import('./rules-v0.js')).createRules;
  const content = await loadZoneContent(async f => (await fetch(new URL('../../' + f, import.meta.url))).json(), zone);
  const w = createWorld({ store: createMemoryStore(), terrain, createRules, classes, zoneSheet: content.sheet, encounterInfo: content.encounterInfo, vignettes: content.vignettes, now: realClock.now, log: (...a) => console.log('[sim]', ...a), lingerMs: 3000 });
  await w.init();
  startTicker(() => w.step(), { ms: 50, clock: realClock, onSkip: k => w.tickStats.skip(k) });
  world = w;
  self.world = w;   // devtools: inspect the live sim
  self.postMessage({ op: 'ready', info: { terrain: terrain.key || 'standin' } });
  for (const m of queued.splice(0)) handle(m);
}

function handle(m) {
  if (m.op === 'open') {
    const id = m.id;
    const conn = {
      ip: 'worker',
      send(d) { self.postMessage({ op: 'msg', id, data: d }); },
      close(code, reason) { conns.delete(id); self.postMessage({ op: 'close', id, code, reason }); },
    };
    const h = world.accept(m.path, conn);
    conns.set(id, h);
    self.postMessage({ op: 'open', id });
  } else if (m.op === 'msg') {
    const h = conns.get(m.id); if (h) h.message(m.data);
  } else if (m.op === 'close') {
    const h = conns.get(m.id); if (h) { conns.delete(m.id); h.close(); }
  }
}

self.onmessage = e => {
  const m = e.data;
  if (!m || !m.op) return;
  if (!world) queued.push(m); else handle(m);
};

boot().catch(err => { console.error('[worker] boot failed', err); self.postMessage({ op: 'error', msg: String(err && err.message) }); });
