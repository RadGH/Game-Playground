// Hunters vs Farmers commands (docs/hvf-PLAN.md §2.3). Each handler is (ctx, player, cmd) -> refusal
// reason | null; the caller emits `reject`. Illegal input never throws.
//
//   move {x, z} · stop · build {kind, x, z} (farmer) · chop {cell} · attack {target} (hunter)
//   revive {target: playerId} (farmer) · rally {building, x, z} (farmer) · surrender
// More arrive in H3 (cast, pullup, upgrade, train, order, buy/sell/use, lodge, ward).

import { liveGrid, cellOf, canStand, cellX, cellZ } from './grid.js';
import { KIND } from './mapgen.js';
import { liveEnt, entById, FARMERS, HUNTERS } from './state.js';
import { routeTo, released } from './units.js';
import { buildRefusal, footprint } from './farm.js';
import { canSee } from './vision.js';

const isNum = v => typeof v === 'number' && v === v && v !== Infinity && v !== -Infinity;
const inMap = (map, x, z) => isNum(x) && isNum(z) && x >= 0 && z >= 0 && x < map.size && z < map.size;

function actor(ctx, p) {
  const e = entById(ctx.state, p.ent);
  if (!e || !e.alive) return { why: 'dead' };
  if (p.role === 'hunter' && !released(ctx.state)) return { why: 'kennel' };
  return { e };
}

export const HVF_COMMANDS = {
  move(ctx, p, cmd) {
    if (!inMap(ctx.map, cmd.x, cmd.z)) return 'bad';
    const { e, why } = actor(ctx, p); if (why) return why;
    e.ord = { k: 'move' };
    const g = liveGrid(ctx), who = p.role === 'hunter' ? 'hunter' : 'farmer';
    const goal = cellOf(ctx.map, cmd.x, cmd.z);
    if (!routeTo(ctx, e, goal, !canStand(g, who, goal))) { e.ord = { k: 'idle' }; return 'reach'; }
    return null;
  },
  stop(ctx, p) {
    const { e, why } = actor(ctx, p); if (why) return why;
    e.ord = { k: 'idle' };
    return null;
  },
  build(ctx, p, cmd) {
    if (p.role !== 'farmer') return 'role';
    if (typeof cmd.kind !== 'string' || !inMap(ctx.map, cmd.x, cmd.z)) return 'bad';
    const { e, why } = actor(ctx, p); if (why) return why;
    const no = buildRefusal(ctx, p, cmd.kind, cmd.x, cmd.z);
    if (no) return no;
    const def = ctx.data.hvf.buildings.kinds[cmd.kind];
    const fp = footprint(ctx.map, def, cmd.x, cmd.z);
    e.ord = { k: 'build', kind: cmd.kind, x: cmd.x, z: cmd.z, near: true };
    // walk next to the footprint (its centre cell, stopping one step short)
    if (!routeTo(ctx, e, cellOf(ctx.map, fp.x - 0.01, fp.z - 0.01), true)) { e.ord = { k: 'idle' }; return 'reach'; }
    return null;
  },
  chop(ctx, p, cmd) {
    const map = ctx.map;
    if (!(Number.isInteger(cmd.cell) && cmd.cell >= 0 && cmd.cell < map.cols * map.rows)) return 'bad';
    const { e, why } = actor(ctx, p); if (why) return why;
    const k = liveGrid(ctx).cells[cmd.cell];
    if (k !== KIND.tree && k !== KIND.briar) return 'bad';
    if (k === KIND.briar && p.role === 'farmer') return 'bad';   // farmers walk through briar; cutting their own hedges is not a thing
    e.ord = { k: 'chop', cell: cmd.cell, until: -1, near: true };
    if (!routeTo(ctx, e, cmd.cell, true)) { e.ord = { k: 'idle' }; return 'reach'; }
    return null;
  },
  attack(ctx, p, cmd) {
    if (p.role !== 'hunter') return 'role';   // farmers can't attack (their army can, from H3)
    const { e, why } = actor(ctx, p); if (why) return why;
    const t = typeof cmd.target === 'number' ? liveEnt(ctx.state, cmd.target) : null;
    if (!t || t.team !== FARMERS) return 'bad';
    if (!canSee(ctx, HUNTERS, t)) return 'unseen';   // no aiming into the fog
    e.ord = { k: 'attack', target: t.id };
    return null;
  },
  revive(ctx, p, cmd) {
    if (p.role !== 'farmer') return 'role';
    const { e, why } = actor(ctx, p); if (why) return why;
    const tp = ctx.state.players[cmd.target];
    const gr = tp && ctx.state.hvf.graves.find(g => g.pid === tp.id);
    if (!tp || tp.id === p.id || !tp.ghost || !gr) return 'bad';
    e.ord = { k: 'revive', target: tp.id, until: -1, near: true };
    if (!routeTo(ctx, e, cellOf(ctx.map, gr.x, gr.z), true)) { e.ord = { k: 'idle' }; return 'reach'; }
    return null;
  },
  rally(ctx, p, cmd) {
    if (p.role !== 'farmer') return 'role';
    const b = typeof cmd.building === 'number' ? liveEnt(ctx.state, cmd.building) : null;
    if (!b || b.kind !== 'building' || b.owner !== p.id || !inMap(ctx.map, cmd.x, cmd.z)) return 'bad';
    b.rally = { x: cmd.x, z: cmd.z };
    return null;
  },
  surrender(ctx, p) {
    const { state } = ctx;
    if (state.result) return 'over';
    state.result = { winner: p.team === FARMERS ? HUNTERS : FARMERS, reason: 'surrender', tick: state.tick };
    ctx.emit('result', { winner: state.result.winner, reason: 'surrender' });
    return null;
  },
};

/** Apply one command (the registry calls mode.commands; tests and the AI can call this directly). */
export function applyHvfCommand(ctx, cmd) {
  const { state } = ctx;
  const reject = (reason, pid = cmd && cmd.p) => { ctx.emit('reject', { player: typeof pid === 'number' ? pid : -1, cmd: cmd && cmd.type, reason }); return reason; };
  if (!cmd || typeof cmd !== 'object' || typeof cmd.p !== 'number' || !state.players[cmd.p]) return reject('bad', -1);
  if (state.result) return reject('over');
  const fn = Object.prototype.hasOwnProperty.call(HVF_COMMANDS, cmd.type) ? HVF_COMMANDS[cmd.type] : null;
  if (!fn) return reject('bad');
  const why = fn(ctx, state.players[cmd.p], cmd);
  return why ? reject(why) : null;
}

export { cellX, cellZ };
