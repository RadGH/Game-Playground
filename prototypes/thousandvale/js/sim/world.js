// STAGE 1 (stream A, PLAN §8.1): the gateway (js/sim/gateway.js) and ONE province process
// (js/sim/province.js) in one JS context, joined by a local bus — the same code that runs as separate
// processes in stage 2 (server/main.mjs --procs N). Used by the Web Worker (js/sim/worker.js), the loopback
// tests and the single-process server. Pure.
//
//   const world = createWorld({ store, terrain, build, createRules, classes, now, log, zoneSheet, vignettes, ... })
//   await world.init()
//   const h = world.accept('/gw' | '/p/0', conn)   conn = { send(stringOrBytes), close(code, reason), ip? }
//   world.step() ; world.status() ; await world.shutdown()
//
// `layouts` (js/sim/realm.js buildLayout) may be passed for a multi-zone province; otherwise one layout is
// built from `terrain` (one zone bake or the stand-in field).

import { createGateway } from './gateway.js';
import { createProvince } from './province.js';
import { createLocalBus } from './session.js';
import { buildLayout } from './realm.js';
import { vignetteContent } from './vignettes.js';

export { BAG_MAX, TOWN_EDGE, TARGET_RANGE, EDGE_PER_TICK, SAVES_PER_TICK } from './province.js';

export function createWorld(opts) {
  const { terrain, zoneSheet = null, vignettes = null, encounterInfo = {}, copyCap = 300, now = () => Date.now(), wallNow = () => Date.now() } = opts;
  const zoneKey = opts.zoneKey || (terrain && terrain.key) || 'standin';
  const layouts = opts.layouts || [buildLayout({
    key: opts.provinceKey || zoneKey, name: opts.zoneName || (zoneSheet && zoneSheet.name) || 'The Test Vale', terrain,
    zones: [{ key: zoneKey, sheet: zoneSheet, vignettes }], encounterInfo, copyCap, vignetteContent, townRadius: opts.townRadius,
  })];
  if (opts.camps) for (const L of layouts) L.camps = opts.camps;
  const [gwBus, pBus] = createLocalBus();
  const gateway = createGateway({ ...opts, now, wallNow, events: opts.events || layoutEvents(layouts), starterProvince: layouts[0].key });
  const province = createProvince({ ...opts, proc: 0, layouts, bus: pBus, clock: { epoch: gateway.epoch, dayMs: gateway.clockDayMs }, now, wallNow });
  gateway.attach(0, gwBus, { provinces: layouts.map(L => L.key) });

  function accept(path, conn) { return path === '/gw' ? gateway.accept(path, conn) : province.accept(path, conn); }
  function step() { gateway.step(); return province.step(); }
  async function init() { await province.init(); }
  async function shutdown(code) { await province.shutdown(code); }
  function status() {
    const p = province.status(), g = gateway.status();
    return {
      server: 'thousandvale', build: opts.build || 'dev', protocol: undefined, process: opts.processName || 'p0', ...p,
      bad: p.bad + gateway.counters.bad, kicks: p.kicks + gateway.counters.kicks, logins: gateway.counters.logins,
      humanFails: gateway.counters.humanFails, parties: gateway.parties.byId.size, director: g.director, gateway: g.gateway,
    };
  }
  function mute(charId, untilMs) { gateway.mute(charId, untilMs); return province.mute(charId, untilMs); }

  return { ...province, accept, step, init, shutdown, status, mute, gateway, province, parties: gateway.parties, director: gateway.director, layouts };
}

/** Realm events from the layouts: each province's zone event sites (E's event bosses) as director candidates. */
export function layoutEvents(layouts) {
  const out = [];
  for (const L of layouts) {
    const sites = (L.terrain.reader && L.terrain.reader.meta && L.terrain.reader.meta.sites) || [];
    for (const s of sites) if (s.type === 'event') out.push({ id: s.id, name: s.name || s.id, province: L.key, x: s.x, z: s.z, r: s.r || 40, encounter: s.id, level: (L.sheet && L.sheet.band ? L.sheet.band[1] : 6), band: (L.sheet && L.sheet.band) || [1, 10] });
  }
  return out;
}

/**
 * STAGE 2 in one JS context (tests, and the shape server/main.mjs builds across processes): one gateway and
 * several province processes, each with its own bus and its own layouts, sharing one store.
 *   const realm = createRealm({ procs: [[layoutA], [layoutB]], store, ... })
 *   realm.accept('/gw' | '/p/<n>', conn) ; realm.step() ; realm.procs[n] (each a createProvince)
 */
export function createRealm(opts) {
  const { procs: sets, now = () => Date.now(), wallNow = () => Date.now() } = opts;
  const all = sets.flat();
  const gateway = createGateway({ ...opts, now, wallNow, events: opts.events || layoutEvents(all), starterProvince: all[0].key });
  const procs = sets.map((layouts, n) => {
    const [gwBus, pBus] = createLocalBus();
    const p = createProvince({ ...opts, proc: n, layouts, bus: pBus, processName: (opts.processName || 'p') + '.' + n, clock: { epoch: gateway.epoch, dayMs: gateway.clockDayMs }, now, wallNow });
    gateway.attach(n, gwBus, { provinces: layouts.map(L => L.key) });
    return p;
  });
  const tickStats = procs[0].tickStats;
  return {
    gateway, procs, tickStats, parties: gateway.parties, director: gateway.director,
    accept(path, conn) { if (path === '/gw') return gateway.accept(path, conn); const m = /^\/p\/(\d+)$/.exec(path); const p = m && procs[+m[1]]; if (!p) { conn.close(4404, 'no such path'); return { message() {}, close() {} }; } return p.accept(path, conn); },
    step() { gateway.step(); let ms = 0; for (const p of procs) ms = Math.max(ms, p.step()); return ms; },
    async init() { for (const p of procs) await p.init(); },
    async shutdown(code) { for (const p of procs) await p.shutdown(code); },
    status() { return { gateway: gateway.status(), procs: procs.map(p => p.status()) }; },
    /** The province process holding character `c` right now (or null). */
    procOf(c) { return procs.find(p => p.online.has(c)) || null; },
  };
}
