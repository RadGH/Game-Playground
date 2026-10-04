// Bannerline simulation entry point (interfaces.md §2). Pure and deterministic: no DOM, no three.js,
// no clocks, no Math.random (tests/sim-purity.test.js enforces it, following imports).
//
//   const sim = createSim(config, data);  sim.step(commands); sim.drainEvents(); sim.hash();
//   const snap = sim.snapshot(); const again = restoreSim(snap, data);

import { createState, TICK_HZ, secToTicks } from './state.js';
import { buildMap } from './map.js';
import { hashValue } from './hash.js';
import { applyCommand } from './commands.js';
import { resolveMode, MODES } from './modes/index.js';
import { initCampaign, campaignTick, campaignAfterResult } from './campaign.js';

export { TICK_HZ };
export const TICK_MS = 1000 / TICK_HZ;
export const SNAPSHOT_VERSION = 1;

function makeCtx(sim) {
  const ctx = {
    state: sim.state, data: sim.data, map: sim.map, mode: sim.mode,
    emit: sim._events ? (type, fields) => { fields.type = type; fields.tick = sim.state.tick; sim._queue.push(fields); } : () => {},
  };
  return ctx;
}

function minuteStats(state) {
  if (state.tick % (60 * TICK_HZ) !== 0) return;
  for (const p of state.players) { p.stats.incomeAt.push(p.income); p.stats.goldAt.push(Math.round(p.gold)); }
}

class Sim {
  constructor(state, data, map, opts, mode) {
    this.state = state; this.data = data; this.map = map; this.mode = mode;
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
      if (c && !c.sys && state.players[c.p] && state.players[c.p].kind === 'ai') { ctx.emit('reject', { player: c.p, cmd: c.type, reason: 'bad' }); continue; }
      applyCommand(ctx, c);
    }
    const mode = this.mode;
    for (const p of state.players) if (p.kind === 'ai') for (const c of mode.ai(ctx, p)) applyCommand(ctx, c);
    for (const phase of mode.phases) phase(ctx);   // the mode's tick order (modes/linewar.js)
    if (state.ents.some(e => e._gone)) state.ents = state.ents.filter(e => !e._gone);
    minuteStats(state);
    if (state.campaign) campaignTick(ctx);   // a campaign mission's script and objectives (campaign.js)
    mode.checkResult(ctx);
    if (state.campaign) campaignAfterResult(ctx);
  }

  drainEvents() { const q = this._queue; this._queue = []; return q; }
  hash() { return hashValue(this.state); }
  snapshot() { return { v: SNAPSHOT_VERSION, dataHash: this.data.hash, state: JSON.parse(JSON.stringify(this.state)) }; }
}

/** opts: { events: true } (false = no event objects; headless sims and tests) */
export function createSim(config, data, opts = {}) {
  const { mode, format } = resolveMode(config);
  mode.validate({ ...config, format }, data);
  // hooks (R2.10, for modes beyond line war): buildMap gets the seed + rules; a mode may build its own
  // state (Hunters vs Farmers seats carry a role, not a race and hero)
  const map = mode.buildMap(data, format, { seed: (config.seed ?? 1) >>> 0, rules: config.rules || {} });
  // state.mode keeps the FORMAT ('1v1') for older readers; state.game names the mode (R2.10)
  const state = mode.createState ? mode.createState({ ...config, format }, data, map) : createState({ ...config, mode: format }, data, map);
  state.game = mode.id; state.format = format;
  mode.initState(state, data, map, config);
  if (config.campaign) { state.campaignMission = JSON.parse(JSON.stringify(config.campaign)); state.campaign = initCampaign(state, config.campaign); }
  const sim = new Sim(state, data, map, opts, mode);
  for (const e of state.ents) sim._events && sim._queue.push({ type: 'spawn', tick: 0, id: e.id, kind: e.kind, unit: e.type, team: e.team, field: e.field });
  return sim;
}

export function restoreSim(snap, data, opts = {}) {
  if (!snap || snap.v !== SNAPSHOT_VERSION) throw new Error('Unknown snapshot version');
  if (snap.dataHash !== data.hash) throw new Error('Version mismatch: update and rejoin');
  const state = JSON.parse(JSON.stringify(snap.state));
  const { mode, format } = resolveMode({ mode: state.game || 'linewar', format: state.format || state.mode });
  const map = mode.buildMap(data, format, { seed: state.seed, rules: state.rules || {} });   // a mode keeps state.rules if its map needs them
  return new Sim(state, data, map, opts, mode);
}
