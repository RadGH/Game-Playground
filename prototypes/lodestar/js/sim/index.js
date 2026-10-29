// The Lodestar sim (PLAN §1.1–1.3, M3). PURE: no DOM, no clock, no Math.random, no fetch — it runs in node (tests,
// the bot) and in the worker exactly the same. Same seed + same orders = same game (§0.15).
//
//   const sim = createSim(data, { seed, size })   data = parsed JSON: materials, mapgen, resources, recipes,
//                                                 buildings, research, vehicles, balance
//   sim.send(cmd)        apply one command (§3.3) now; a refused one answers with a `refused` event (plain words)
//   sim.step()           one tick: every system in js/sim/systems.js, in order
//   sim.drainEvents()    the events (§3.4) since the last drain
//   sim.hud()            the needles the console shows (day clock, stock, power, carriers…)
//   sim.hash()           a hash of everything the game owns (determinism tests)
//
// Extension points for the milestones built next (each is a list or function on `sim.hooks`):
//   hooks.workFactor(b)    → number  speed multiplier for a producer / builder (M7: staffing × morale). Default 1.
//   hooks.built            [fn(b)]   called when any building is finished (M4 towers, M6 batteries, M7 houses).
//   hooks.roadPlanned      [fn(plan, vector)]  a road was accepted (M4: offer a gate where it meets a wall).
//   hooks.commands         { name: fn(sim, cmd) → refusal string | null }  extra commands (M4 drawWall, M5 setOrder…).
//   hooks.sensors          [fn() → [{x, y, r}]]  more sensor circles (M5 scouts, M4 watch posts are buildings with `sight`).
//   hooks.hud              [fn(hud)]  add needles to the hud.
//   hooks.systems          [{ name, every, phase, run }]  systems registered at run time (prefer appending to systems.js).
// The damage rule (§0.7) is NOT here: M4 owns js/sim/defence/targets.js and reads buildings.json `tag`.

import { createWorld } from '../world/world.js';
import { createRng, sinT, cosT, mix32 } from './rng.js';
import { createEntities, SUB } from './entities.js';
import { createClock } from './clock.js';
import { compileData } from './data.js';
import { SYSTEMS } from './systems.js';
import { createStores } from './economy/stores.js';
import { createBuildings } from './economy/buildings.js';
import { createSurvey } from './economy/survey.js';
import { createProduction } from './economy/production.js';
import { createConstruction } from './economy/construction.js';
import { createRoads } from './economy/roads.js';
import { createUnlocks } from './economy/unlocks.js';
import { createPaths } from './logistics/paths.js';
import { createMovers } from './logistics/movers.js';
import { createDispatcher } from './logistics/dispatcher.js';
import { applyCommand } from './commands.js';
import { createDefence } from './defence/index.js'; // M4
import { puff, GAS_SMOKE } from '../world/gas.js';

export function createSim(raw, opts = {}) {
  const seed = (opts.seed ?? 1) >>> 0;
  const world = createWorld({ materials: raw.materials, mapgen: raw.mapgen }, { seed, size: opts.size || 'normal', W: opts.W, H: opts.H, blank: opts.blank });
  const data = compileData(raw);
  const rng = createRng(seed).split('sim');
  const vrows = data.V;

  const sim = {
    seed, base: 'home', data, world, rng, trig: { sin: sinT, cos: cosT },
    get tick() { return world.tick; },
    ents: createEntities(),
    clock: createClock(data.balance.day),
    events: [],
    levels: { wall: 1, road: 1, bridge: 1, rail: 1 },
    research: { done: [], queue: [], progress: {} },
    unlocked: new Set(),
    produced: {}, consumed: {},
    committed: {},          // cost of placed sites not yet picked up from the stores
    baseStock: {}, carried: {},
    power: { supply: 0, demand: 0, factor: 1 },
    sites: [],              // { kind: 'building'|'road', id } in the order they were placed
    deliveries: [],         // the last 200 hauls (tests: nothing teleports)
    history: [],            // undo: { tick, kind, id }
    dirty: new Set(),       // building / vehicle ids changed since the last frame
    vectorsDirty: new Set(),
    routeVer: 0, surveyVer: 0, carriedDirty: true,
    hooks: { workFactor: () => 1, built: [], roadPlanned: [], commands: {}, sensors: [], hud: [], systems: [] },
  };

  sim.stores = createStores(sim);
  sim.paths = createPaths(sim);
  sim.movers = createMovers(sim);
  sim.survey = createSurvey(sim);
  sim.buildings = createBuildings(sim);
  sim.production = createProduction(sim);
  sim.construction = createConstruction(sim);
  sim.roads = createRoads(sim);
  sim.dispatcher = createDispatcher(sim);
  sim.unlocks = createUnlocks(sim);
  createDefence(sim, { nests: !opts.blank && !opts.noNests, difficulty: opts.difficulty }); // M4: walls, towers, nests, raids (sim.defence)

  // ---- helpers the systems share
  sim.made = (r, n) => { sim.produced[r] = (sim.produced[r] || 0) + n; };
  sim.used = (r, n) => { sim.consumed[r] = (sim.consumed[r] || 0) + n; };
  sim.refreshTotals = () => {
    sim.baseStock = sim.stores.baseStock();
    const c = {};
    for (const v of [...sim.ents.list('vehicle'), ...sim.ents.list('worker')]) for (const k in v.cargo || {}) c[k] = (c[k] || 0) + v.cargo[k];
    sim.carried = c;
  };
  /** Units of r in the stores that no site is waiting for. */
  sim.free = (r) => (sim.baseStock[r] || 0) - (sim.committed[r] || 0);
  /** Plain words for what is missing to pay `cost`, or null. */
  sim.shortOf = (cost) => {
    sim.refreshTotals();
    const short = [];
    for (const [r, n] of Object.entries(cost || {})) {
      const have = sim.free(r);
      if (have < n) short.push(`${n} ${data.R[r].name.toLowerCase()} (the stores can spare ${Math.max(0, have)})`);
    }
    return short.length ? short.join(' and ') : null;
  };
  sim.spawnCarrier = (kind, b) => {
    const v = vrows[kind];
    const isWorker = v.tag === 'worker';
    const e = sim.ents.add(isWorker ? 'worker' : 'vehicle', {
      type: kind, x: Math.round((b.door[0] + 0.5) * SUB), y: Math.round((b.door[1] + 0.5) * SUB), home: b.id,
      cargo: {}, state: 'waiting', line: null, job: null, task: null, pathPos: 0, hp: 1, hpMax: 1,
    });
    Object.defineProperty(e, 'vrow', { value: v, enumerable: false, writable: true });
    Object.defineProperty(e, 'route', { value: null, enumerable: false, writable: true });
    sim.dirty.add(e.id);
    return e;
  };
  sim.retireCrew = (b) => {
    for (const e of [...sim.ents.list('vehicle'), ...sim.ents.list('worker')]) {
      if (e.home !== b.id) continue;
      if (!e.job && !e.task && !e.route) { sim.ents.remove(e.id); sim.dirty.add(e.id); } else e.retire = true;
    }
  };
  /** Leave goods on the ground as a pile the porters will collect (nothing teleports, not even a refund). */
  sim.dropPile = (x, y, goods, door = null) => {
    const total = Object.values(goods).reduce((a, n) => a + n, 0);
    if (total <= 0) return null;
    // inside a yard ring the refund simply goes into the shared store
    const hq = sim.stores.pools.find((p) => p.owners.some((o) => { const r = data.B[o.type].ring, dx = o.x / SUB - x, dy = o.y / SUB - y; return dx * dx + dy * dy <= r * r; }));
    if (hq) { let left = 0; for (const [r, n] of Object.entries(goods)) left += n - sim.stores.put(hq, r, n); if (left <= 0) return null; }
    const d = door || [Math.round(x), Math.round(y)];
    const p = sim.ents.add('pile', { type: 'pile', x: Math.round(x * SUB), y: Math.round(y * SUB), store: { ...goods }, cap: total, door: d, built: 1, fp: { x0: Math.round(x), y0: Math.round(y), w: 1, h: 1, cx: x, cy: y } });
    sim.poolsDirty = true; sim.dirty.add(p.id);
    return p;
  };
  sim.sensors = () => {
    const out = [];
    for (const b of sim.ents.list('building')) {
      const s = data.B[b.type].sight;
      if (s && b.built >= 1) out.push({ x: b.fp.cx, y: b.fp.cy, r: s, id: b.id });
    }
    if (!out.length) out.push({ x: world.meta.hq.x, y: world.meta.hq.y, r: data.B.hq.sight, id: 0 }); // the landing party's eyes
    for (const f of sim.hooks.sensors) out.push(...f());
    return out;
  };
  sim.fogVer = 0;
  sim.updateFog = () => {
    const h = sim.clock.hourAt(sim.tick);
    const r = world.fog.update(sim.sensors(), { daylight: sim.clock.daylightAt(h), sight: data.balance.sight });
    // the coarse light field travels with the fog (the scope's night sight reads both)
    let lh = 0; const L = world.g.light;
    for (let i = 0; i < L.length; i += 3) lh = (Math.imul(lh, 31) + L[i]) | 0;
    if (r.changed || sim.fogVer === 0 || lh !== sim.lightHash) sim.fogVer++;
    sim.lightHash = lh;
    sim.survey.learn();
  };
  sim.drainWorld = () => { const ev = world.drainEvents(); for (const e of ev) { e.tick ??= sim.tick; e.base ??= sim.base; sim.events.push(e); } };
  /** dev / test only: a smoke pot at (x, y) that keeps puffing thick smoke for `ticks` ticks. */
  sim.smokePots = [];
  sim.smoke = (x, y, r = 10, ticks = 240) => { puff(world.g, x | 0, y | 0, r, GAS_SMOKE, 255); sim.smokePots.push({ x: x | 0, y: y | 0, r, left: ticks }); };
  sim.hooks.systems.push({ name: 'dev.smoke', every: 2, run: () => {
    for (let i = sim.smokePots.length - 1; i >= 0; i--) { const p = sim.smokePots[i]; puff(world.g, p.x, p.y, p.r, GAS_SMOKE, 255); if ((p.left -= 2) <= 0) sim.smokePots.splice(i, 1); }
  } });

  // ---- systems
  const everyOf = (s) => s.every === 'economy' ? data.econ.every : s.every === 'sight' ? data.balance.sight.every : s.every;
  const systems = SYSTEMS.map((s) => ({ ...s, n: everyOf(s), phase: s.phase || 0 }));

  sim.step = () => {
    // world.step() is the first system and moves the tick on
    for (const s of systems) {
      if (s.name === 'world') { s.run(sim); continue; }
      if (sim.tick % s.n === s.phase % s.n) s.run(sim);
    }
    for (const s of sim.hooks.systems) if (sim.tick % s.every === (s.phase || 0) % s.every) s.run(sim);
  };
  sim.send = (cmd) => applyCommand(sim, cmd);
  sim.drainEvents = () => sim.events.splice(0, sim.events.length);

  sim.hud = () => {
    sim.refreshTotals();
    const t = sim.tick, h = sim.clock.hourAt(t);
    const count = (list, type) => { const all = list.filter((v) => v.type === type); return { n: all.length, busy: all.filter((v) => v.job || v.task).length }; };
    const out = {
      day: sim.clock.dayAt(t), hour: h, daylight: sim.clock.daylightAt(h),
      sensors: sim.sensors().map(({ x, y, r }) => ({ x, y, r })),
      stock: { ...sim.baseStock }, carried: { ...sim.carried }, committed: { ...sim.committed }, produced: { ...sim.produced },
      power: { ...sim.power },
      crew: { porter: count(sim.ents.list('vehicle'), 'porter'), cart: count(sim.ents.list('vehicle'), 'cart'), builder: count(sim.ents.list('worker'), 'builder') },
      unlocked: [...sim.unlocked], research: sim.unlocks.progress(), levels: { ...sim.levels },
      sites: sim.construction.siteList().length,
    };
    for (const f of sim.hooks.hud) f(out);
    return out;
  };

  /** Hash of everything the game owns (cells, fields, entities, stores), for same-seed tests. */
  sim.hash = () => {
    let h = world.hash() ^ sim.tick;
    const mixIn = (v) => { h = Math.imul(h ^ (v | 0), 0x01000193) >>> 0; };
    for (const e of sim.ents.all()) {
      mixIn(e.id); mixIn(e.x); mixIn(e.y); mixIn(e.built ? Math.round(e.built * 1000) : 0); mixIn(e.work | 0);
      for (const k of Object.keys(e.store || {}).sort()) { mixIn(k.length); mixIn(e.store[k]); }
      for (const k of Object.keys(e.cargo || {}).sort()) mixIn(e.cargo[k]);
      if (e.amt !== undefined) mixIn(e.amt);
    }
    for (const v of world.vectors.list) for (const [a, b] of v.laid || []) { mixIn(a * 100); mixIn(b * 100); }
    return mix32(h >>> 0);
  };

  // ---- the landing: the HQ goes down at the surveyed spot (the bunker you are sitting in)
  if (!opts.noHq && !opts.blank) {
    const r = sim.buildings.place('hq', world.meta.hq.x, world.meta.hq.y, { free: true, instant: true });
    if (!r.ok) throw new Error('the HQ could not be placed: ' + r.why);
  }
  sim.updateFog();
  return sim;
}

export { SUB };
