// Planet outposts (Voidwright owner ruling E3 carried over). Every system has an orbit spot ORBIT_DIST metres out
// from the station toward its planet; fly there, press F and found an outpost (credits + ore). The outpost is a small
// station in your colours that you dock at (F) to build modules, each with 3 levels:
//   ore      Ore site      digs the planet's ores
//   lab      R&D lab       research points (for the station research lab) and finer factory parts
//   factory  Factory       makes parts of the system's danger
//   trade    Trade post    credits from the planet below
//   storage  Storage       more room before output stops piling up
//   turrets  Defence guns  real guns on the outpost (2 a level); they fight raiders
// Output piles up by play time (G.playTime) up to the storage cap; "Collect all" when docked there moves it aboard.
//
// Raids every RAID_GAP of play, warned RAID_WARN ahead. If you are in the system then, raiders spawn near the outpost
// and start stripping its storage — beat them for their loot and a thank-you. If you are away the raid is settled on
// paper by the guns: a weak outpost loses part of what it had stored. An outpost is never destroyed.
//
// Save: G.outposts = [{ id, system, name, founded, last, modules: { kind: level }, acc: { kind: fraction },
//   store: { ore: { id: n }, parts: [items], cr, rp }, raid: { at, warned }, log: [text] }]. Pure: no DOM.

import { rng, hash, vadd, vsub, vscale, vnorm, vdist, vrand, clamp } from '../core/math.js';
import { ORES } from '../data/blocks.js';
import { makeItem, rollLootItem } from './items.js';
import { createBody } from './body.js';
import { generateOutpost } from './shipgen.js';
import { addBody } from './world.js';
import { pilot } from './npc.js';
import { generateShip } from './shipgen.js';
import { fmt } from '../../../../shared/format.js';

export const MAX_LEVEL = 3;
export const ORBIT_DIST = 3500;        // m from the station toward the planet
export const RAID_WARN = 180;          // s of warning
export const RAID_GAP = [1800, 3300];  // s of play between raids (30-55 min)
export const RAID_LIVE_MAX = 240;      // s a live raid may last before the rest is settled on paper
export const STEAL_RATE = 0.01;        // share of the store one raider strips every 2 s while close
export const LOSS_BY_GUNS = [0.5, 0.3, 0.15, 0.05];   // share of storage lost to a raid you are not there for, by gun level
const DL = d => 1 + (d - 1) * 0.4;      // danger lift for prices and output
const r50 = v => Math.round(v / 50) * 50;
const ORE_BY_DANGER = [['iron'], ['iron', 'copper'], ['copper', 'cobalt', 'iron'], ['cobalt', 'iridium', 'copper'], ['iridium', 'sunstone', 'cobalt'], ['sunstone', 'iridium']];

/** Every module; `rate(L, d)` = output per hour of play. Every number the screen shows comes from here. */
export const MODULES = {
  ore: { name: 'Ore site', unit: 'ore an hour', blurb: 'Digs the planet\'s ores.', base: 900, rate: L => [0, 40, 90, 150][L] },
  lab: { name: 'R&D lab', unit: 'research points an hour', blurb: 'Research points, and the factory\'s parts roll finer (+10% luck a level).', base: 1400, rate: L => [0, 3, 7, 12][L] },
  factory: { name: 'Factory', unit: 'parts an hour', unit1: 'part an hour', blurb: 'Makes parts for this system\'s danger.', base: 1800, rate: L => [0, 1, 2, 3][L] },
  trade: { name: 'Trade post', unit: 'credits an hour', blurb: 'Sells to the planet below.', base: 1200, rate: (L, d) => [0, 250, 600, 1100][L] * DL(d) },
  storage: { name: 'Storage', unit: '× the room', blurb: 'More room before output stops piling up.', base: 700, rate: L => 1 + L },
  turrets: { name: 'Defence guns', unit: 'guns', blurb: 'Real guns on the outpost. They fight raiders, and keep more of the store when you are away.', base: 1300, rate: L => 2 * L },
};
export const MODULE_IDS = Object.keys(MODULES);

export const foundCost = d => ({ cr: 2500 + 1500 * (d - 1), ore: 40 + 10 * (d - 1) });
export const moduleCost = (kind, L, d) => ({ cr: r50(MODULES[kind].base * L * DL(d)), ore: 15 * L });
export const levelOf = (o, kind) => o.modules[kind] || 0;
/** The ores an outpost's ore site digs (by the system's danger). */
export const oresOf = o => ORE_BY_DANGER[clamp(o.danger - 1, 0, 5)];
/** "90 ore an hour", "1 part an hour". */
export const rateText = (kind, L, d) => { const v = Math.round(MODULES[kind].rate(L, d)); return `${fmt(v, { decimals: 0 })} ${v === 1 && MODULES[kind].unit1 ? MODULES[kind].unit1 : MODULES[kind].unit}`; };
export const outpostIn = (G, sysId) => (G.outposts || []).find(o => o.system === sysId) || null;
export const oreTotal = cargo => Object.values(cargo || {}).reduce((a, b) => a + b, 0);
/** Room for each kind of output. */
export function capOf(o, d) { const k = 1 + levelOf(o, 'storage'); return { ore: 200 * k, parts: 4 * k, cr: Math.round(3000 * DL(d) * k), rp: 40 * k }; }
export const storedOre = o => oreTotal(o.store.ore);

/** Where a system's orbit spot is: ORBIT_DIST from the station toward the planet. */
export function orbitSpot(stationPos, planetPos) {
  const dir = planetPos ? vnorm(vsub(planetPos, stationPos)) : vnorm({ x: 0.7, y: 0.1, z: 0.7 });
  return vadd(stationPos, vscale(dir, ORBIT_DIST));
}

/** Pay ore from the hold, cheapest first. Returns false (and takes nothing) if there is not enough. */
export function payOre(G, n) {
  if (oreTotal(G.cargo) < n) return false;
  const order = Object.keys(ORES).sort((a, b) => ORES[a].price - ORES[b].price);
  for (const id of order) { const take = Math.min(n, G.cargo[id] || 0); if (take) { G.cargo[id] -= take; n -= take; if (!G.cargo[id]) delete G.cargo[id]; } if (!n) break; }
  return true;
}
/** What is still missing for a cost, as short strings, or [] when you can pay. */
export function shortOf(G, cost) {
  const out = [];
  if (G.credits < cost.cr) out.push(`${fmt(cost.cr - G.credits, { decimals: 0 })} more cr`);
  const ore = oreTotal(G.cargo); if (ore < cost.ore) out.push(`${fmt(cost.ore - ore, { decimals: 0 })} more ore`);
  return out;
}

/** Found an outpost in a system. Returns { outpost } or { why }. */
export function foundOutpost(G, sys, now = G.playTime || 0) {
  if (outpostIn(G, sys.id)) return { why: 'You already have an outpost here.' };
  const cost = foundCost(sys.danger); const s = shortOf(G, cost); if (s.length) return { why: `Needs ${s.join(' and ')}.` };
  G.credits -= cost.cr; payOre(G, cost.ore);
  const o = {
    id: `o${sys.id}`, system: sys.id, name: `${sys.name} Outpost`, danger: sys.danger, founded: now, last: now,
    modules: {}, acc: {}, store: { ore: {}, parts: [], cr: 0, rp: 0 }, log: [],
    raid: { at: now + RAID_GAP[0] + (hash(G.galaxySeed, sys.id, 'raid') % (RAID_GAP[1] - RAID_GAP[0])), warned: false },
  };
  (G.outposts ||= []).push(o);
  return { outpost: o };
}
/** Build or upgrade a module. Returns a refusal reason or null. */
export function buildModule(G, o, kind, now = G.playTime || 0) {
  const L = levelOf(o, kind);
  if (!MODULES[kind]) return 'No such module.';
  if (L >= MAX_LEVEL) return 'Already at the top level.';
  produce(o, now);                    // what was made so far counts at the old rates
  const cost = moduleCost(kind, L + 1, o.danger); const s = shortOf(G, cost); if (s.length) return `Needs ${s.join(' and ')}.`;
  G.credits -= cost.cr; payOre(G, cost.ore);
  o.modules[kind] = L + 1;
  return null;
}

/** Pile up output from o.last to now (play seconds), up to the caps. */
export function produce(o, now) {
  const dt = Math.max(0, now - (o.last ?? now)); o.last = now; if (!dt) return;
  const h = dt / 3600; const cap = capOf(o, o.danger); const S = o.store;
  const add = (k, v) => { o.acc[k] = (o.acc[k] || 0) + v; const whole = Math.floor(o.acc[k]); o.acc[k] -= whole; return whole; };
  if (levelOf(o, 'ore')) {
    let n = add('ore', MODULES.ore.rate(levelOf(o, 'ore')) * h); n = Math.min(n, Math.max(0, cap.ore - storedOre(o)));
    const ores = ORE_BY_DANGER[clamp(o.danger - 1, 0, 5)];
    for (let i = 0; i < n; i++) { const id = ores[(hash(o.id, Math.floor(now), i) % 10) < 6 ? 0 : (hash(o.id, i, 'b') % ores.length)]; S.ore[id] = (S.ore[id] || 0) + 1; }
  }
  if (levelOf(o, 'lab')) S.rp = Math.min(cap.rp, S.rp + add('rp', MODULES.lab.rate(levelOf(o, 'lab')) * h));
  if (levelOf(o, 'trade')) S.cr = Math.min(cap.cr, S.cr + add('cr', MODULES.trade.rate(levelOf(o, 'trade'), o.danger) * h));
  if (levelOf(o, 'factory')) {
    const n = add('parts', MODULES.factory.rate(levelOf(o, 'factory')) * h);
    for (let i = 0; i < n && S.parts.length < cap.parts; i++) S.parts.push(rollLootItem(hash(o.id, 'part', Math.floor(now), i), o.danger, 0.1 + levelOf(o, 'lab') * 0.1));
  }
}
/** Move the store aboard. Ore only up to `room`; returns what moved: { cr, rp, parts, ore }. */
export function collectAll(G, o, room, now = G.playTime || 0) {
  produce(o, now);
  const S = o.store; const got = { cr: S.cr, rp: S.rp, parts: S.parts.length, ore: 0 };
  G.credits += S.cr; G.stats.earned += S.cr; G.researchPoints = (G.researchPoints || 0) + S.rp; S.cr = 0; S.rp = 0;
  G.items.push(...S.parts); S.parts = [];
  for (const id of Object.keys(S.ore)) { const n = Math.min(S.ore[id], Math.max(0, room - got.ore)); if (!n) continue; G.cargo[id] = (G.cargo[id] || 0) + n; S.ore[id] -= n; got.ore += n; if (!S.ore[id]) delete S.ore[id]; }
  return got;
}
/** Take a share of everything stored (a raid). Returns what was lost, as text. */
export function loseShare(o, share) {
  const S = o.store; const lost = [];
  const cr = Math.floor(S.cr * share); if (cr) { S.cr -= cr; lost.push(`${fmt(cr, { decimals: 0 })} cr`); }
  let ore = 0; for (const id of Object.keys(S.ore)) { const n = Math.floor(S.ore[id] * share); S.ore[id] -= n; ore += n; if (!S.ore[id]) delete S.ore[id]; }
  if (ore) lost.push(`${fmt(ore, { decimals: 0 })} ore`);
  const parts = Math.floor(S.parts.length * share); if (parts) { S.parts.splice(0, parts); lost.push(`${parts} part${parts > 1 ? 's' : ''}`); }
  return lost.join(', ');
}
export const raidLoss = o => LOSS_BY_GUNS[levelOf(o, 'turrets')];

/**
 * The raid clock for every outpost (call about once a second with the play clock). `here` = id of the system you
 * are in (or null in a jump). Returns events: [{ t: 'warn'|'live'|'paper', o, text }]; 'live' means spawn raiders now.
 */
export function raidClock(G, now, here) {
  const out = [];
  for (const o of G.outposts || []) {
    produce(o, now);
    const R = o.raid;
    if (R.live) continue;
    if (!R.warned && now >= R.at - RAID_WARN) { R.warned = true; out.push({ t: 'warn', o, text: `Raiders are heading for ${o.name}: about ${Math.round((R.at - now) / 60)} min.` }); }
    if (now >= R.at) {
      if (here === o.system) { R.live = true; out.push({ t: 'live', o }); }
      else { const lost = loseShare(o, raidLoss(o)); const text = lost ? `Raiders hit ${o.name} while you were away. Lost: ${lost}.` : `Raiders hit ${o.name} while you were away; its guns drove them off.`; o.log.unshift(text); o.log.length = Math.min(o.log.length, 6); out.push({ t: 'paper', o, text }); nextRaid(G, o, now); }
    }
  }
  return out;
}
export function nextRaid(G, o, now) {
  o.raid = { at: now + RAID_GAP[0] + (hash(G.galaxySeed, o.id, Math.floor(now)) % (RAID_GAP[1] - RAID_GAP[0])), warned: false, live: false };
}

/** The outpost as a body (station kind, your team, its guns armed). */
export function outpostBody(w, o, pos, { paint = 0, accent = 2 } = {}) {
  const gunTier = clamp(1 + Math.floor((o.danger - 1) / 2), 1, 4);
  const g = generateOutpost(o.modules, { paint, accent, reactor: makeItem('reactor', 4, 0), makeGun: i => makeItem(i >= 4 ? 'railgun' : 'autocannon', gunTier, 1) });
  const b = createBody(g, { kind: 'station', team: 'player', pos, name: o.name });
  b.outpost = o.id; b.armed = levelOf(o, 'turrets') > 0;
  return addBody(w, b);
}

/** Spawn a live raid's ships near the outpost body (on the far side from you, so you see them come). */
export function spawnRaid(w, o, body) {
  const r = rng(hash(o.id, Math.floor(w.t))); const P = w.player;
  const away = P ? vnorm(vsub(body.pos, P.pos)) : vnorm(vrand(r));
  const at = vadd(body.pos, vadd(vscale(away, 700), vscale(vrand(r), 120)));
  const n = 2 + Math.floor(o.danger / 2) + (levelOf(o, 'storage') >= 2 ? 1 : 0);
  const ships = [];
  for (let i = 0; i < n; i++) {
    const { grid } = generateShip(hash(o.id, 'raid', Math.floor(w.t), i), { danger: o.danger, faction: 'pirate', small: o.danger <= 1 && i > 0 });
    const b = createBody(grid, { kind: 'ship', team: 'hostile', faction: 'pirate', danger: o.danger, pos: vadd(at, vscale(vrand(r), 30 + i * 25)), name: `Outpost raider ${i + 1}` });
    b.think = pilot; b.ai = { sight: 900, post: body.pos, leash: 1500, route: [body.pos], speed: 0.6 }; b.raid = o.id;
    ships.push(addBody(w, b));
  }
  return ships;
}
/** One step of a live raid. Returns 'won' | 'timeout' | null. Raiders near the outpost strip its storage. */
export function raidStep(w, o, body, live, dt) {
  const alive = live.ships.filter(s => !s.dead);
  if (!alive.length) return 'won';
  if (w.t - live.start > RAID_LIVE_MAX) return 'timeout';
  live.stealT = (live.stealT || 0) + dt;
  if (live.stealT >= 2) {
    live.stealT = 0;
    const close = alive.filter(s => vdist(s.pos, body.pos) < 350).length;
    if (close) { const lost = loseShare(o, Math.min(0.5, STEAL_RATE * close)); if (lost) live.lost = (live.lost || 0) + 1; }
  }
  return null;
}
