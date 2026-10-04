// Stream E — the Hunters vs Farmers AI entry (docs/hvf-PLAN.md §10). The mode calls hvfAi(ctx, player)
// once a tick for every AI seat; a seat thinks every `reaction` ticks (data/hvf/ai.json) and returns
// ordinary commands, which the sim then applies exactly like a human's.
//
//   farmer seats -> farmer.js   hide, farm, herd, wall the door, flee, revive, the flip
//   hunter seats -> hunter.js   suspicion map (suspicion.js), search, kit, lodges, shopping, the Turn
//
// Three difficulties for both roles, differing in decisions (data/hvf/ai.json): Recruit, Veteran,
// Commander. Each seat draws only from its own stream (player.ai.rng); memory is plain data in
// player.ai, so it hashes and snapshots with the state.

import { farmerThink } from './farmer.js';
import { hunterThink } from './hunter.js';

export function hvfKnobs(data, p) {
  const D = data.hvf.ai.difficulties;
  return D[p.ai.difficulty] || D.recruit;
}

function memory(p) {
  const m = p.ai;
  if (m.v === 1) return m;
  // first thinks are staggered by seat (3 ticks apart): nine farmers each picking a hollow and routing
  // to it on the same tick was a 40-90 ms tick
  Object.assign(m, { v: 1, nextAt: m.nextAt === undefined ? p.id * 3 : m.nextAt, hollow: null, hollow2: null, cleared: [], arrived: false, found: null, flee: null, seenHunter: null,
    sus: null, checked: null, target: -1, goal: null, lastSeen: null, progress: null, breach: -1, lastThink: null, retry: false });
  return m;
}

export function hvfAi(ctx, p) {
  const { state, data } = ctx;
  if (state.result || !p.ai) return [];
  const m = memory(p);
  if (state.tick < m.nextAt) return [];
  const K = hvfKnobs(data, p);
  m.retry = false;
  const out = [];
  const cmd = (type, args = {}) => out.push(Object.assign({ p: p.id, type }, args));
  if (p.role === 'farmer') farmerThink(ctx, p, K, p.ai.rng, cmd);
  else hunterThink(ctx, p, K, p.ai.rng, cmd);
  // a seat that ran out of this tick's path budget thinks again next tick
  m.nextAt = state.tick + (m.retry ? 1 : K.reaction);
  return out;
}
