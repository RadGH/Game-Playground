// Initial state + entity helpers. State is plain data (interfaces.md §5): arrays in id order, no
// class instances, no closures, no Maps — so it hashes, snapshots and restores with JSON.

import { seedStream } from './rng.js';
import { heroStats } from './heroes.js';
import { newInventory, armourClassFor } from './items.js';
import { newUpgrades } from './upgrades.js';

export const TICK_HZ = 20;

/** Bodies that defend a field for its team: heroes, their pets and turrets (enemy units fight them). */
export const isDefender = e => e.kind === 'hero' || e.kind === 'pet' || e.kind === 'turret';
export const secToTicks = s => Math.round(s * TICK_HZ);

const STREAMS = ['combat', 'loot', 'ai', 'shop'];

/** Validate config and build tick-0 state (heroes spawned). */
export function createState(config, data, map) {
  const { seed = 1, mode = '1v1', map: mapId = 'vale', players = [], rules = {} } = config;
  if (!players.length) throw new Error('No players in config');
  const teamIds = [];
  for (const p of players) if (!teamIds.includes(p.team)) teamIds.push(p.team);
  if (teamIds.length !== 2 || !teamIds.includes(0) || !teamIds.includes(1)) throw new Error('Config needs exactly two teams, numbered 0 and 1');
  const bannersMax = rules.banners ?? data.econ.banners[mode];
  if (!bannersMax) throw new Error(`No banner count for mode "${mode}"`);

  const rng = {};
  for (const s of STREAMS) rng[s] = seedStream(seed >>> 0, s);

  const state = {
    v: 1, tick: 0, seed: seed >>> 0, mode, map: mapId,
    rng, nextId: 1, rising: 0, tideLevel: 0, tides: 0, result: null,
    endless: !!rules.endless,
    teams: [0, 1].map(t => ({ id: t, banners: bannersMax, bannersMax, field: t, players: [], dealt: 0, toll: { charges: data['items-bl'].toll.charges, readyAt: 0 } })),
    players: [], fields: map.fields.map(f => ({ id: f.id, team: f.team, waiting: [], bodies: 0 })),
    ents: [], timers: [], nextTimer: 1, nextGroup: 1, zones: [], nextZone: 1, nextItem: 1,
  };

  players.forEach((pc, id) => {
    const race = data.races.races[pc.race];
    if (!race) throw new Error(`Unknown race "${pc.race}"`);
    const heroDef = data.heroes.heroes[pc.hero];
    if (!heroDef) throw new Error(`Unknown hero "${pc.hero}" (available: ${Object.keys(data.heroes.heroes).join(', ')})`);
    const p = {
      id, team: pc.team, name: pc.name || `Player ${id + 1}`, kind: pc.kind === 'ai' ? 'ai' : 'human',
      ai: pc.kind === 'ai' ? { difficulty: (pc.ai && pc.ai.difficulty) || 'recruit', sendDone: -1, nextAt: 0, fund: 0, rng: seedStream(seed >>> 0, 'ai' + id) } : null,
      race: pc.race, hero: pc.hero, heroEnt: -1, rival: -1,
      gold: rules.startGold ?? data.econ.start.gold, income: data.econ.start.income,
      queued: [],
      inv: newInventory(data), useAt: 0, procs: {}, atArmory: false, gearV: 0,   // items.js (stream I)
      upg: newUpgrades(data), upV: 0, powerCd: {},                               // upgrades.js, powers.js (stream I)
      level: 1, xp: 0, skillPts: 1,
      skills: ['Q', 'W', 'E', 'D', 'R'].filter(s => heroDef.slots[s]).map(s => ({ slot: s, id: heroDef.slots[s], rank: 0, readyAt: 0 })),
      talent: -1, form: null, surrendered: false,
      stats: { sendGold: 0, sends: 0, itemGold: 0, upgradeGold: 0, powerGold: 0, kills: 0, deaths: 0, leaked: 0, dealt: 0, bounty: 0, incomeAt: [], goldAt: [] },
    };
    state.players.push(p);
    state.teams[pc.team].players.push(id);
  });
  // rivals: k-th player of one team faces the k-th of the other (wrapping)
  for (const p of state.players) {
    const mine = state.teams[p.team].players, theirs = state.teams[1 - p.team].players;
    p.rival = theirs[mine.indexOf(p.id) % theirs.length];
  }
  // heroes
  for (const p of state.players) spawnHero(state, data, map, p);
  return state;
}

export function baseEnt(state, props) {
  const e = {
    id: state.nextId++, kind: 'unit', type: '', team: -1, owner: -1, field: 0,
    x: 0, z: 0, px: 0, pz: 0, face: 0, pface: 0, r: 0.5,
    hp: 1, hpMax: 1, mp: 0, mpMax: 0, alive: true, respawnAt: -1,
    act: 'idle', actTick: state.tick, target: -1, level: 0,
    armour: 'light', dmgType: 'blade', statuses: [], group: -1,
    _spd: 3, _dps: 0, _range: 1.5, _atkEvery: 20, _atkAt: 0, _traits: [], _leak: 0, _cost: 0, _bounty: 0, _xp: 0,
    _gone: false, _lastHurt: -1000, _hardAt: -1000, _rose: false, _pounced: false, _timerA: 0, _timerB: 0,
    _ord: null, _mk: 1, _refund: 0, _wantAttack: false, _vx: 0, _vz: 0, _sp: 1, _aggroBy: -1, _kvx: 0, _kvz: 0,
  };
  Object.assign(e, props);
  e.px = e.x; e.pz = e.z; e.pface = e.face;
  state.ents.push(e);
  return e;
}

export function spawnHero(state, data, map, p) {
  const f = map.fields[state.teams[p.team].field];
  const def = data.heroes.heroes[p.hero];
  const hs = heroStats(data, p);
  const idx = state.teams[p.team].players.indexOf(p.id);
  const e = baseEnt(state, {
    kind: 'hero', type: p.hero, team: p.team, owner: p.id, field: f.id,
    x: f.spawn.x + idx * 2, z: f.spawn.z, face: Math.PI, r: def.radius,
    hp: hs.hpMax, hpMax: hs.hpMax, mp: hs.mpMax, mpMax: hs.mpMax, level: p.level,
    armour: armourClassFor(data, p), dmgType: def.dmgType, _spd: def.moveSpeed, _range: def.range,
    _atkEvery: secToTicks(def.attackEvery), _ord: { k: 'idle', x: 0, z: 0, target: -1, dir: 0, speed: 0 },
  });
  p.heroEnt = e.id;
  return e;
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

/** Live (alive, not removed) entity by id or null. */
export function liveEnt(state, id) {
  if (id < 0) return null;
  const e = entById(state, id);
  return e && e.alive && !e._gone ? e : null;
}

/** Schedule a delayed effect. */
export function addTimer(state, atTick, kind, args) {
  const t = { id: state.nextTimer++, atTick, kind, args };
  // keep timers ordered by (atTick, id): insert from the back
  const a = state.timers;
  let i = a.length;
  while (i > 0 && a[i - 1].atTick > atTick) i--;
  a.splice(i, 0, t);
  return t;
}
