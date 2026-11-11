// Sectors: the space between a system's landmarks, filled in as you fly (play-test 2026-11-10: "each star
// is only a very small map — they should be enormous"). A system is cut into SEC x SEC squares. What is in
// each square is decided by the star's seed alone (sectorInfo), so the local map can show it before you
// get there and it is the same every visit. Its bodies — asteroid fields, enemy camps, wreck fields — are
// only made when you come near (streamSectors) and are taken away again when you are far, so a system of
// any size costs about the same as the old small ones.
//
// Pure: no DOM, no clock. Uses its own seeded streams, never the world's step random.

import { rng, hash, TAU } from '../core/math.js';
import { FACTIONS, factionsForTier } from '../data/factions.js';
import { makeRock, spawnGroup, SAFE_RADIUS } from './galaxy.js';
import { generateShip } from './shipgen.js';
import { recompute } from './ship.js';

export const SEC = 4000;
const LOAD = SEC * 1.3;     // a sector whose middle is this close to you is filled in
const DROP = SEC * 2.6;     // ...and taken away again past this

export const SECTOR_KINDS = {
  field: { name: 'Asteroid cluster', color: '#b8a890' },
  rich: { name: 'Rich asteroid cluster', color: '#5fff9a' },
  wrecks: { name: 'Wreck field', color: '#c48cff' },
  camp: { name: 'Enemy camp', color: '#ff5a6a' },
  swarm: { name: 'Alien swarm', color: '#a6ff4a' },
  convoy: { name: 'Trade convoy', color: '#5fa8ff' },
};

const key = (sx, sy) => `${sx},${sy}`;

/** What is in sector (sx, sy) of a system: { kind, x, y, ... } or null for open space. */
export function sectorInfo(sys, sx, sy, w = null) {
  const T = sys.traits || {}; const R = T.radius || 30000;
  const cx = (sx + 0.5) * SEC, cy = (sy + 0.5) * SEC; const d = Math.hypot(cx, cy);
  if (d > R) return null;
  const r = rng(hash(sys.seed, 'sec', sx, sy));
  const nearStation = w?.stations?.some(s => s.team !== 'hostile' && Math.hypot(s.x - cx, s.y - cy) < SAFE_RADIUS + SEC * 0.6);
  // belts make fields far more likely along their ring
  const onBelt = (w?.belts || []).some(b => Math.abs(d - b.r) < b.width + SEC * 0.5);
  const ore = T.ore ?? 1, foes = T.enemies ?? 1;
  const weights = [
    ['field', (0.22 + (onBelt ? 0.9 : 0)) * ore],
    ['rich', (0.03 + (onBelt ? 0.06 : 0)) * ore],
    ['wrecks', 0.07],
    ['camp', nearStation ? 0 : 0.2 * foes],
    ['swarm', nearStation || sys.tier < 2 ? 0 : 0.08 * foes],
    ['convoy', 0.05],
    [null, 0.45],
  ];
  let tot = 0; for (const [, v] of weights) tot += v;
  let pick = r() * tot, kind = null;
  for (const [k, v] of weights) { if ((pick -= v) <= 0) { kind = k; break; } }
  if (!kind) return null;
  // where in the square, kept off the edges
  const x = sx * SEC + r.range(0.2, 0.8) * SEC, y = sy * SEC + r.range(0.2, 0.8) * SEC;
  const info = { kind, x, y, key: key(sx, sy), seed: hash(sys.seed, 'secfill', sx, sy) };
  if (kind === 'camp' || kind === 'swarm') {
    const pool = kind === 'swarm' ? factionsForTier(sys.tier).filter(f => !FACTIONS[f].human) : factionsForTier(sys.tier).concat(FACTIONS[sys.owner]?.hostile ? [sys.owner] : []);
    info.faction = r.pick(pool.length ? pool : ['redfang']);
  }
  return info;
}

/** Every sector with something in it within `radius` of (x, y) — for the local map. */
export function sectorsAround(w, x, y, radius) {
  const out = []; const sys = w.system; if (!sys) return out;
  const x0 = Math.floor((x - radius) / SEC), x1 = Math.floor((x + radius) / SEC);
  const y0 = Math.floor((y - radius) / SEC), y1 = Math.floor((y + radius) / SEC);
  for (let sy = y0; sy <= y1; sy++) for (let sx = x0; sx <= x1; sx++) {
    const info = sectorInfo(sys, sx, sy, w); if (!info) continue;
    const mem = w.sectors?.mem?.[info.key];
    if (mem?.cleared) info.cleared = true;
    out.push(info);
  }
  return out;
}

/** Fill one sector with its bodies. */
function load(w, info) {
  const sys = w.system; const r = rng(info.seed); const tier = sys.tier;
  const mem = (w.sectors.mem[info.key] ||= { gone: [], killed: 0 });
  const tag = b => { b.sector = info.key; return b; };
  const rocks = (n, rich) => {
    for (let k = 0; k < n; k++) {
      if (mem.gone.includes(k)) continue;
      const a = r() * TAU, d = r.range(0, 900) * Math.sqrt(r());
      const big = r() < 0.14; const rr = big ? r.range(8, 15) : r.range(2, 6);
      const rock = makeRock(hash(info.seed, 'rock', k), rr, tier + (rich ? 1 : 0), { rich: rich || r() < 0.08 });
      rock.x = info.x + Math.cos(a) * d; rock.y = info.y + Math.sin(a) * d; rock.a = r() * TAU;
      rock.vx = r.range(-5, 5); rock.vy = r.range(-5, 5); rock.secIdx = k;
      w.bodies.push(tag(rock));
    }
  };
  if (info.kind === 'field') rocks(16 + Math.floor(r() * 14), false);
  else if (info.kind === 'rich') rocks(10 + Math.floor(r() * 8), true);
  else if (info.kind === 'wrecks') {
    rocks(4, false);
    for (let k = 0; k < 3 + Math.floor(r() * 3); k++) {
      const s = generateShip({ cls: r.pick(['skiff', 'corvette', tier >= 3 ? 'frigate' : 'corvette']), faction: r.pick(['guild', 'navy', 'redfang']), tier, seed: hash(info.seed, 'wreck', k) });
      for (const b of s.grid.blocks) if (r() < 0.3 && !b.def.core) { b.alive = false; b.hp = 0; }
      s.kind = 'wreck'; s.team = 'neutral'; s.life = 1e9; s.name = `Wreck of the ${s.name}`; s.ai = null;
      s.x = info.x + r.range(-700, 700); s.y = info.y + r.range(-700, 700); s.a = r() * TAU; s.va = r.range(-0.05, 0.05);
      s.grid.cells.fill(0);
      for (const b of s.grid.blocks) if (b.alive) { const n = b.def.size || 1; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) s.grid.cells[(b.y + j) * s.grid.w + b.x + i] = b.idx + 1; }
      recompute(s);
      w.bodies.push(tag(s));
    }
  } else if (info.kind === 'camp' || info.kind === 'swarm') {
    if (info.kind === 'camp') rocks(6, false);
    const list = spawnGroup(w, { x: info.x, y: info.y }, info.faction, tier, r, info.kind === 'swarm' ? 'pack' : null);
    // a cleared camp stays cleared for this visit: only the ships not yet killed come back
    list.slice(0, mem.killed).forEach(s => { s.dead = true; s.unloaded = true; s.counted = true; });
    for (const s of list) { tag(s); s.campKey = info.key; }
  } else if (info.kind === 'convoy') {
    const owner = FACTIONS[sys.owner]?.human && !FACTIONS[sys.owner].hostile ? sys.owner : 'guild';
    for (let k = 0; k < 3; k++) {
      const s = generateShip({ cls: r.pick(['corvette', 'skiff', tier >= 3 ? 'frigate' : 'corvette']), faction: owner, tier, seed: hash(info.seed, 'convoy', k), role: k ? 'escort' : 'trader' });
      s.x = info.x + k * 90; s.y = info.y + r.range(-60, 60);
      w.bodies.push(tag(s));
    }
  }
}

/** Remove a sector's bodies, remembering what was used up (mined rocks, killed camp ships). */
function unload(w, k) {
  const mem = (w.sectors.mem[k] ||= { gone: [], killed: 0 });
  for (const b of w.bodies) {
    if (b.sector !== k) continue;
    if (b.harpooned || b === w.player) continue;
    // a ship chasing you comes along: it is no longer part of the sector
    if (b.kind === 'ship' && b.ai?.target === w.player) { b.sector = null; continue; }
    if (b.kind === 'rock' && b.secIdx != null && (b.dead || b.stats.blocks < (b.startBlocks || 0) * 0.5) && !mem.gone.includes(b.secIdx)) mem.gone.push(b.secIdx);
    if (!b.dead) { b.dead = true; b.unloaded = true; }
  }
  w.sectors.loaded.delete(k);
}

/**
 * Call a few times a second with the player's position: fills the sectors around them (at most one per
 * call, so a field of rocks never lands in a single frame) and drops the far ones.
 */
export function streamSectors(w, x, y) {
  const S = (w.sectors ||= { loaded: new Set(), mem: {} });
  // camp kills: count the camp's ships that died since last time
  for (const b of w.bodies) if (b.campKey && b.dead && !b.unloaded && !b.counted) { b.counted = true; const m = (S.mem[b.campKey] ||= { gone: [], killed: 0 }); m.killed++; }
  for (const k of [...S.loaded]) {
    const [sx, sy] = k.split(',').map(Number);
    if (Math.hypot((sx + 0.5) * SEC - x, (sy + 0.5) * SEC - y) > DROP) unload(w, k);
  }
  const x0 = Math.floor((x - LOAD) / SEC), x1 = Math.floor((x + LOAD) / SEC);
  const y0 = Math.floor((y - LOAD) / SEC), y1 = Math.floor((y + LOAD) / SEC);
  let best = null, bd = 1e18;
  for (let sy = y0; sy <= y1; sy++) for (let sx = x0; sx <= x1; sx++) {
    const k = key(sx, sy); if (S.loaded.has(k)) continue;
    const d = Math.hypot((sx + 0.5) * SEC - x, (sy + 0.5) * SEC - y); if (d > LOAD || d >= bd) continue;
    bd = d; best = [sx, sy, k];
  }
  if (!best) return null;
  S.loaded.add(best[2]);
  const info = sectorInfo(w.system, best[0], best[1], w);
  if (info) {
    const before = w.bodies.length;
    load(w, info);
    for (let i = before; i < w.bodies.length; i++) w.bodies[i].startBlocks = w.bodies[i].stats.blocks;
    (S.seen ||= new Set()).add(info.key);
  }
  return info;
}
