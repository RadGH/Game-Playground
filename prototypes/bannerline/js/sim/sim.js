// Bannerline simulation entry point (interfaces.md §2). Pure and deterministic: no DOM, no three.js,
// no clocks, no Math.random (tests/sim-purity.test.js enforces it, following imports).
//
//   const sim = createSim(config, data);  sim.step(commands); sim.drainEvents(); sim.hash();
//   const snap = sim.snapshot(); const again = restoreSim(snap, data);

import { createState, TICK_HZ, secToTicks } from './state.js';
import { buildMap } from './map.js';
import { hashValue } from './hash.js';
import { applyCommand } from './commands.js';
import { releaseTick, payTick, autoSends, admitWaiting } from './economy.js';
import { tideTick } from './tides.js';
import { tickStatuses } from './statuses.js';
import { heroTick } from './heroes.js';
import { moveTick } from './movement.js';
import { runAttacks, projectileLands } from './combat.js';
import { traitTick } from './traits.js';
import { skillPulse, boltLands, groundLands, trailTick } from './skills.js';
import { zoneTick } from './zones.js';
import { requisitionArrives } from './items.js';
import { tollTick } from './commands.js';
import { aiCommands } from './ai/index.js';

export { TICK_HZ };
export const TICK_MS = 1000 / TICK_HZ;
export const SNAPSHOT_VERSION = 1;

const TIMERS = { proj: projectileLands, pulse: skillPulse, bolt: boltLands, ground: groundLands, requisition: requisitionArrives };

function makeCtx(sim) {
  const ctx = {
    state: sim.state, data: sim.data, map: sim.map,
    emit: sim._events ? (type, fields) => { fields.type = type; fields.tick = sim.state.tick; sim._queue.push(fields); } : () => {},
  };
  return ctx;
}

function runTimers(ctx) {
  const { state } = ctx;
  while (state.timers.length && state.timers[0].atTick <= state.tick) {
    const t = state.timers.shift();
    const fn = TIMERS[t.kind];
    if (!fn) throw new Error(`Unknown timer kind "${t.kind}"`);
    fn(ctx, t.args);
  }
}

function checkResult(ctx) {
  const { state, data } = ctx;
  if (state.result || state.endless) return;
  const [a, b] = state.teams;
  let winner = null, reason = null;
  if (a.banners <= 0 || b.banners <= 0) {
    reason = 'banners';
    winner = a.banners <= 0 && b.banners <= 0 ? (a.banners === b.banners ? -1 : (a.banners > b.banners ? 0 : 1)) : (a.banners <= 0 ? 1 : 0);
  } else if (state.tick >= secToTicks(data.econ.clock.hardCap)) {
    reason = 'cap';
    if (a.banners !== b.banners) winner = a.banners > b.banners ? 0 : 1;
    else if (a.dealt !== b.dealt) winner = a.dealt > b.dealt ? 0 : 1;
    else winner = -1;
  }
  if (reason) {
    state.result = { winner, reason, tick: state.tick };
    ctx.emit('result', { winner, reason });
  }
}

function minuteStats(state) {
  if (state.tick % (60 * TICK_HZ) !== 0) return;
  for (const p of state.players) { p.stats.incomeAt.push(p.income); p.stats.goldAt.push(Math.round(p.gold)); }
}

class Sim {
  constructor(state, data, map, opts) {
    this.state = state; this.data = data; this.map = map;
    this._events = opts.events !== false;
    this._queue = [];
  }
  get tick() { return this.state.tick; }
  get over() { return !!this.state.result; }

  step(commands = []) {
    const state = this.state;
    if (state.result) return;
    for (const e of state.ents) { e.px = e.x; e.pz = e.z; e.pface = e.face; }
    state.tick++;
    const ctx = makeCtx(this);
    for (const c of commands) {
      if (c && state.players[c.p] && state.players[c.p].kind === 'ai') { ctx.emit('reject', { player: c.p, cmd: c.type, reason: 'bad' }); continue; }
      applyCommand(ctx, c);
    }
    for (const p of state.players) if (p.kind === 'ai') for (const c of aiCommands(ctx, p)) applyCommand(ctx, c);
    tollTick(ctx);
    payTick(ctx);
    autoSends(ctx);
    releaseTick(ctx);
    tideTick(ctx);
    admitWaiting(ctx);
    runTimers(ctx);
    tickStatuses(ctx);
    zoneTick(ctx);
    trailTick(ctx);
    heroTick(ctx);
    moveTick(ctx);
    runAttacks(ctx);
    traitTick(ctx);
    if (state.ents.some(e => e._gone)) state.ents = state.ents.filter(e => !e._gone);
    minuteStats(state);
    checkResult(ctx);
  }

  drainEvents() { const q = this._queue; this._queue = []; return q; }
  hash() { return hashValue(this.state); }
  snapshot() { return { v: SNAPSHOT_VERSION, dataHash: this.data.hash, state: JSON.parse(JSON.stringify(this.state)) }; }
}

/** opts: { events: true } (false = no event objects; headless sims and tests) */
export function createSim(config, data, opts = {}) {
  const map = buildMap(data, config.map || 'vale', config.mode || '1v1', 2);
  const state = createState(config, data, map);
  const sim = new Sim(state, data, map, opts);
  for (const e of state.ents) sim._events && sim._queue.push({ type: 'spawn', tick: 0, id: e.id, kind: e.kind, unit: e.type, team: e.team, field: e.field });
  return sim;
}

export function restoreSim(snap, data, opts = {}) {
  if (!snap || snap.v !== SNAPSHOT_VERSION) throw new Error('Unknown snapshot version');
  if (snap.dataHash !== data.hash) throw new Error('Version mismatch: update and rejoin');
  const state = JSON.parse(JSON.stringify(snap.state));
  const map = buildMap(data, state.map, state.mode, 2);
  return new Sim(state, data, map, opts);
}
