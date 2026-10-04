// Hunters vs Farmers match state (docs/hvf-PLAN.md §2.6). Plain JSON-safe data, like line war's: it
// hashes, snapshots and restores with JSON. The forest itself is static (sim.map, rebuilt from the
// seed); state.hvf holds what the match changed.
//
//   state.teams   [ { id: 0, role: 'farmer', players }, { id: 1, role: 'hunter', players } ]
//   state.players [{ id, team, role, name, kind, ai, colour, gold, income (gold/s now), ent,
//                    ghost (farmer down), out (hunter with no lodge), copies { kind: n }, level, xp, deaths, stats }]
//   state.ents    characters (kind 'farmer' | 'hunter'), animals ('animal'), buildings ('building'),
//                 in ascending id order. Every ent: { id, kind, type, owner, team, x, z, px, pz, face, pface,
//                 r, hp, hpMax, alive, _gone, ord }.
//   state.hvf     { chopped, chopV, buildV, vision: [bits, bits], explored: [bits, bits], seen: [[], []],
//                   tracks, graves, turn, releaseTick, endTick }

import { seedStream } from '../../rng.js';
import { cellOf, cellX, cellZ, liveGrid, nearestStandable } from './grid.js';
import { sin, cos, TAU } from '../../mathx.js';

export const TICK_HZ = 20;
export const secToTicks = s => Math.round(s * TICK_HZ);
export const FARMERS = 0, HUNTERS = 1;
const STREAMS = ['combat', 'animals', 'ai', 'loot'];

export function bitsetSize(map) { return (map.cols * map.rows + 31) >> 5; }

export function baseEnt(state, props) {
  const e = {
    id: state.nextId++, kind: 'unit', type: '', owner: -1, team: -1,
    x: 0, z: 0, px: 0, pz: 0, face: 0, pface: 0, r: 0.4,
    hp: 1, hpMax: 1, alive: true, _gone: false, ord: { k: 'idle' },
  };
  Object.assign(e, props);
  e.px = e.x; e.pz = e.z; e.pface = e.face;
  state.ents.push(e);
  return e;
}

export function createHvfState(config, data, map) {
  const H = data.hvf, f = H.rules.formats[config.format];
  const seed = (config.seed ?? 1) >>> 0, rules = config.rules || {};
  const rng = {};
  for (const s of STREAMS) rng[s] = seedStream(seed, 'hvf-' + s);
  const words = bitsetSize(map);
  const state = {
    v: 1, game: 'hvf', mode: config.format, format: config.format, map: 'wild', seed, tick: 0, rng,
    nextId: 1, players: [], teams: [{ id: FARMERS, role: 'farmer', players: [] }, { id: HUNTERS, role: 'hunter', players: [] }],
    ents: [], timers: [], nextTimer: 1, nextItem: 1, result: null, rules: { size: rules.size || null },
    hvf: {
      chopped: [], chopV: 0, buildV: 0,
      vision: [new Array(words).fill(0), new Array(words).fill(0)],
      explored: [new Array(words).fill(0), new Array(words).fill(0)],
      seen: [[], []], tracks: [], graves: [], flares: [], turn: -1, turnWhy: 'The farmers have no army yet',
      releaseTick: secToTicks(rules.headStart ?? f.headStart),
      endTick: secToTicks(rules.timer ?? f.clock),
      hunterMult: f.hunterMult,
    },
  };
  const U = H.units;
  config.players.forEach((pc, id) => {
    const team = pc.role === 'hunter' ? HUNTERS : FARMERS;
    const p = {
      id, team, role: pc.role, name: pc.name || `${pc.role === 'hunter' ? 'Hunter' : 'Farmer'} ${id + 1}`,
      kind: pc.kind === 'ai' ? 'ai' : 'human', ai: pc.kind === 'ai' ? { difficulty: (pc.ai && pc.ai.difficulty) || 'recruit', rng: seedStream(seed, 'hvf-ai' + id) } : null,
      colour: pc.colour ?? id, ent: -1,
      gold: pc.role === 'hunter' ? U.hunter.startGold : U.farmerStartGold, income: 0,
      ghost: false, out: false, copies: {}, upgrades: {}, cd: {}, inv: pc.role === 'hunter' ? new Array(data.hvf['hunter-items'].slots).fill(null) : null, level: 1, xp: 0, deaths: 0,
      stats: { incomeAt: [], goldAt: [], earned: 0, animalsLost: 0, kills: 0, chopped: 0 },
    };
    state.players.push(p);
    state.teams[team].players.push(id);
  });
  // farmers start on the Commons in a ring; hunters in their kennels
  const g = liveGrid({ state, map });
  const farmers = state.teams[FARMERS].players;
  farmers.forEach((pid, k) => {
    const a = k * TAU / farmers.length, r = Math.min(map.commons.r * 0.5, 2 + farmers.length * 0.6);
    const c = nearestStandable({ state, map }, g, 'farmer', cellOf(map, map.commons.x + sin(a) * r, map.commons.z + cos(a) * r));
    const e = baseEnt(state, { kind: 'farmer', type: 'farmer', owner: pid, team: FARMERS, x: cellX(map, c), z: cellZ(map, c), r: U.farmer.radius, hp: U.farmer.hp, hpMax: U.farmer.hp });
    state.players[pid].ent = e.id;
  });
  state.teams[HUNTERS].players.forEach((pid, k) => {
    const kn = map.kennels[k % map.kennels.length];
    const hp = U.hunter.hp * f.hunterMult;
    baseEnt(state, { kind: 'building', type: 'kennel', owner: pid, team: HUNTERS, x: kn.x, z: kn.z, r: H.rules.kennel.radius, hp: H.rules.kennel.hp, hpMax: H.rules.kennel.hp, cells: null, lodge: true });
    const c = nearestStandable({ state, map }, g, 'hunter', cellOf(map, kn.x, kn.z + 4))   // out in front of the kennel door;
    const e = baseEnt(state, { kind: 'hunter', type: 'hunter', owner: pid, team: HUNTERS, x: cellX(map, c), z: cellZ(map, c), r: U.hunter.radius, hp, hpMax: hp, _atkAt: 0, respawnAt: -1 });
    state.players[pid].ent = e.id;
  });
  return state;
}

/** Entity by id (ents are in ascending id order: binary search). */
export function entById(state, id) {
  const a = state.ents;
  let lo = 0, hi = a.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, v = a[mid].id;
    if (v === id) return a[mid];
    if (v < id) lo = mid + 1; else hi = mid - 1;
  }
  return null;
}
export const liveEnt = (state, id) => { const e = id >= 0 ? entById(state, id) : null; return e && e.alive && !e._gone ? e : null; };
export const charOf = (state, p) => entById(state, p.ent);
