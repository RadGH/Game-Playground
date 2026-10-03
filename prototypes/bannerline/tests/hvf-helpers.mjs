// Shared helpers for the Hunters vs Farmers node tests (not a test file). Until the registry hooks
// land (docs/requests.md "Stream H"), this runs the mode the way js/sim/sim.js runs one: commands ->
// AI -> the mode's phases -> drop _gone -> checkResult, with px/pz kept for interpolation.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './_sim.mjs';
import hvf, { DATA_FILES } from '../js/sim/modes/hvf/index.js';
import { applyHvfCommand } from '../js/sim/modes/hvf/commands.js';
import { hashValue } from '../js/sim/hash.js';

export function hvfData(mutate) {
  const out = {};
  for (const f of DATA_FILES) out[f.replace('hvf/', '').replace('.json', '')] = JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8'));
  if (mutate) mutate(out);
  return { hvf: out };
}
export const data = hvfData();

export function seats(format, kinds = {}) {
  const [f, h] = format.split('v').map(Number), out = [];
  for (let i = 0; i < f; i++) out.push({ role: 'farmer', kind: kinds.farmer || 'human', name: `F${i + 1}` });
  for (let i = 0; i < h; i++) out.push({ role: 'hunter', kind: kinds.hunter || 'human', name: `H${i + 1}` });
  return out;
}

class HvfSim {
  constructor(state, d, map, events = true) { this.state = state; this.data = d; this.map = map; this._q = []; this._events = events; }
  get tick() { return this.state.tick; }
  get over() { return !!this.state.result; }
  ctx() { return { state: this.state, data: this.data, map: this.map, mode: hvf, emit: this._events ? (type, f) => { f.type = type; f.tick = this.state.tick; this._q.push(f); } : () => {} }; }
  step(commands = []) {
    const state = this.state;
    if (state.result) return;
    for (const e of state.ents) { e.px = e.x; e.pz = e.z; e.pface = e.face; }
    state.tick++;
    const ctx = this.ctx();
    for (const c of commands) applyHvfCommand(ctx, c);
    for (const p of state.players) if (p.kind === 'ai') for (const c of hvf.ai(ctx, p)) applyHvfCommand(ctx, c);
    for (const ph of hvf.phases) ph(ctx);
    if (state.ents.some(e => e._gone)) state.ents = state.ents.filter(e => !e._gone);
    hvf.checkResult(ctx);
  }
  run(n, cmds = () => []) { for (let i = 0; i < n && !this.over; i++) this.step(cmds(this.state.tick + 1)); return this; }
  drainEvents() { const q = this._q; this._q = []; return q; }
  hash() { return hashValue(this.state); }
  snapshot() { return JSON.parse(JSON.stringify(this.state)); }
}

export function createHvf(config, d = data, opts = {}) {
  const cfg = { mode: 'hvf', seed: 7, format: '2v1', ...config };
  cfg.players = cfg.players || seats(cfg.format);
  hvf.validate(cfg, d);
  const map = hvf.buildMap(d, cfg.format, cfg);
  const state = hvf.createState(cfg, d, map);
  return new HvfSim(state, d, map, opts.events !== false);
}
export function restoreHvf(snap, d = data) {
  const map = hvf.buildMap(d, snap.format, { seed: snap.seed, rules: snap.rules });
  return new HvfSim(JSON.parse(JSON.stringify(snap)), d, map);
}
export const ent = (s, pid) => s.state.ents.find(e => e.id === s.state.players[pid].ent);
