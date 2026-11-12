// The galaxy map (PLAN §0 #1) and what fills a star system when you arrive.
// Danger tier = how many jumps from the starting system, so the further you go the harder it gets
// and the better the drops and the shops.

import { rng, hash, TAU } from '../core/math.js';
import { createGrid, place } from './grid.js';
import { makeBody, recompute } from './ship.js';
import { generateShip, generateStation, TIER_DMG, hardenEnemy } from './shipgen.js';
import { ECONOMIES } from './economy.js';
import { FACTIONS, factionsForTier } from '../data/factions.js';
import { MATERIALS } from '../data/types.js';
import { noise2 } from '../core/math.js';

const SYL = ['ka', 'ri', 'vo', 'th', 'el', 'mar', 'dun', 'is', 'sol', 've', 'qu', 'ar', 'ne', 'tor', 'lu', 'xi', 'om', 'ba', 'cen', 'ty', 'gr', 'ul', 'phe', 'zan', 'or', 'wy'];
export function starName(r) {
  const n = r.int(2, 3); let s = '';
  for (let i = 0; i < n; i++) s += r.pick(SYL);
  s = s[0].toUpperCase() + s.slice(1);
  return r.chance(0.3) ? `${s} ${r.pick(['Prime', 'Reach', 'Deep', 'Gate', 'Drift', 'Hollow', 'Crown', 'Spur'])}` : s;
}

export const STAR_KINDS = {
  yellow: { color: '#ffe9a8', glow: '#ffcf60', r: 380 },
  red: { color: '#ff8a6a', glow: '#ff4a2a', r: 300 },
  blue: { color: '#bfe0ff', glow: '#6aa8ff', r: 460 },
  white: { color: '#ffffff', glow: '#c8d8ff', r: 220 },
  violet: { color: '#e0b0ff', glow: '#a050ff', r: 340 },
  binary: { color: '#ffd0a0', glow: '#ff9a50', r: 280, binary: true },
};

export const PLANET_KINDS = {
  rocky:   { name: 'Rocky world', base: '#7a6a5a', dark: '#3a3028', light: '#b8a890', ores: ['ferrite', 'silicate', 'titanium'] },
  ice:     { name: 'Ice world', base: '#9ec8e0', dark: '#4a6880', light: '#e8f6ff', ores: ['ice', 'silicate', 'cobalt'] },
  lava:    { name: 'Lava world', base: '#5a2a1a', dark: '#200a05', light: '#ff7a2a', ores: ['ferrite', 'iridium', 'cobalt'], glow: '#ff5a1a' },
  jungle:  { name: 'Jungle world', base: '#3a7a3a', dark: '#1a3a1a', light: '#8ad06a', ores: ['carbon', 'cuprite', 'quartz'] },
  desert:  { name: 'Desert world', base: '#c8a060', dark: '#6a4a20', light: '#f0d8a0', ores: ['silicate', 'quartz', 'titanium'] },
  ocean:   { name: 'Ocean world', base: '#2a5a9a', dark: '#0a2040', light: '#7ab8f0', ores: ['ice', 'cuprite', 'helium3'] },
  gas:     { name: 'Gas giant', base: '#c89a6a', dark: '#6a4a3a', light: '#f0d0a0', ores: ['helium3', 'ice', 'exotic'], gas: true },
  crystal: { name: 'Crystal world', base: '#8a5aa0', dark: '#3a1a50', light: '#ffb8f4', ores: ['quartz', 'exotic', 'neutronium'], glow: '#ff9ef0' },
};

/** Build the galaxy: ~46 stars, links between neighbours, tiers by jumps from the start. */
export function generateGalaxy(seed) {
  const r = rng(hash('galaxy', seed));
  const N = 46; const systems = [];
  // a spiral-ish disc; the start is at the outer edge of one arm
  for (let i = 0; i < N; i++) {
    let x, y, ok = false, tries = 0;
    while (!ok && tries++ < 200) {
      const arm = r.int(0, 2); const t = r(); const ang = arm * TAU / 3 + t * 3.2 + r.range(-0.35, 0.35);
      const rad = 80 + t * 420;
      x = Math.cos(ang) * rad; y = Math.sin(ang) * rad;
      ok = systems.every(s => Math.hypot(s.x - x, s.y - y) > 52);
    }
    systems.push({ id: i, x, y, links: [], seed: hash('sys', seed, i), name: starName(r), star: r.pick(Object.keys(STAR_KINDS)) });
  }
  // links: each star to its 2-3 nearest, plus make sure everything connects
  for (const s of systems) {
    const near = systems.filter(o => o !== s).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y));
    for (const o of near.slice(0, r.int(2, 3))) link(s, o);
  }
  const comp = () => { const seen = new Set([0]); const st = [0]; while (st.length) { const c = st.pop(); for (const l of systems[c].links) if (!seen.has(l)) { seen.add(l); st.push(l); } } return seen; };
  for (let k = 0; k < 50; k++) {
    const seen = comp(); if (seen.size === N) break;
    let best = null, bd = 1e9;
    for (const a of systems) if (seen.has(a.id)) for (const b of systems) if (!seen.has(b.id)) { const d = Math.hypot(a.x - b.x, a.y - b.y); if (d < bd) { bd = d; best = [a, b]; } }
    link(best[0], best[1]);
  }
  // start = outermost star; tiers by breadth-first distance
  const start = systems.reduce((a, b) => Math.hypot(b.x, b.y) > Math.hypot(a.x, a.y) ? b : a);
  const dist = new Map([[start.id, 0]]); const q = [start.id];
  while (q.length) { const c = q.shift(); for (const l of systems[c].links) if (!dist.has(l)) { dist.set(l, dist.get(c) + 1); q.push(l); } }
  const maxD = Math.max(...dist.values());
  for (const s of systems) {
    const d = dist.get(s.id) ?? maxD;
    s.jumps = d;
    s.tier = Math.max(1, Math.min(10, 1 + Math.round(d * 9 / Math.max(1, maxD))));
    const sr = rng(s.seed);
    // who holds it
    const al = factionsForTier(s.tier).filter(f => !FACTIONS[f].human);
    s.owner = s.tier <= 2 ? (sr.chance(0.7) ? 'guild' : 'navy') : sr.chance(0.45) ? (sr.chance(0.5) ? 'guild' : 'navy') : sr.chance(0.4) ? 'redfang' : (al.length ? sr.pick(al) : 'redfang');
    s.station = FACTIONS[s.owner].human && s.owner !== 'redfang' ? 'trade' : s.owner === 'redfang' ? (sr.chance(0.6) ? 'pirate' : null) : (sr.chance(0.5) ? 'hive' : null);
    if (s.id === start.id) { s.owner = 'guild'; s.station = 'trade'; }
    // a shop variety per station
    s.shops = s.station === 'trade' ? pickShops(sr, s.tier) : s.station === 'pirate' ? ['market', 'blackmarket', 'bounty', 'repair', 'crew'] : [];
    s.features = [];
    if (sr.chance(0.6)) s.features.push('derelict');
    if (sr.chance(0.45)) s.features.push('beacon');
    if (s.owner !== 'guild' && s.owner !== 'navy' && sr.chance(0.5)) s.features.push('pirateBase');
    if (sr.chance(0.5)) s.features.push('claimable');
    s.planets = sr.int(1, 4);
    s.belts = sr.int(1, 3);
    s.nebula = sr.chance(0.35);
  }
  start.features = ['claimable', 'derelict'];
  for (const s of systems) s.traits = systemTraits(s, s.id === start.id);
  return { seed, systems, start: start.id, maxTier: Math.max(...systems.map(s => s.tier)) };
}

/**
 * What makes one star different from the next (play-test 2026-11-10: "different stars should offer
 * different difficulty, economy, rarities"). Rolled from the star's own seed with its own stream, so
 * nothing else about the galaxy moves. The star map shows all of it.
 */
export function systemTraits(s, isStart = false) {
  const r = rng(hash('traits', s.seed));
  // the station's economy — the same roll economy.js market() makes, so the map and the market agree
  let econ = null;
  if (s.station === 'trade' || s.station === 'pirate') {
    const mr = rng(hash('market', s.seed));
    econ = s.station === 'pirate' ? 'pirate' : s.tier <= 1 ? mr.pick(['mining', 'frontier', 'agricultural']) : mr.pick(Object.keys(ECONOMIES).filter(e => e !== 'pirate'));
  }
  const enemies = isStart ? 0.9 : r.pick([0.7, 0.85, 1, 1, 1.2, 1.4, 1.7]);
  const luck = r.pick([0, 0, 0, 0.15, 0.3, 0.5]);              // rarity bonus on everything that drops here
  const ore = r.pick([0.6, 0.85, 1, 1, 1.25, 1.6]);            // how many asteroid fields
  const size = r.pick([0.85, 1, 1, 1.15, 1.3]);
  const radius = Math.round((30000 + s.tier * 2500) * size);
  return { econ, enemies, luck, ore, size, radius };
}
const pickLabel = (v, list) => list.find(([k]) => v <= k)?.[1] || list[list.length - 1][1];
/** Plain words for the star map. */
export function traitWords(t) {
  return {
    enemies: pickLabel(t.enemies, [[0.75, 'quiet'], [0.9, 'light'], [1.05, 'normal'], [1.25, 'busy'], [1.5, 'heavy'], [9, 'swarming']]),
    luck: t.luck >= 0.5 ? 'treasure-rich (much better finds)' : t.luck >= 0.3 ? 'rich (better finds)' : t.luck > 0 ? 'good (slightly better finds)' : 'ordinary',
    ore: pickLabel(t.ore, [[0.7, 'few asteroids'], [0.9, 'some asteroids'], [1.1, 'asteroids'], [1.3, 'many asteroids'], [9, 'dense asteroid fields']]),
    size: pickLabel(t.size, [[0.9, 'compact'], [1.05, 'wide'], [1.2, 'vast'], [9, 'enormous']]),
    econ: t.econ ? ECONOMIES[t.econ]?.name : null,
  };
}

/**
 * Warp cores (play-test 2026-11-10: "if danger 3 is higher level I shouldn't be able to get there yet —
 * maybe different tier warp drives"). Your core's class caps the danger you can jump INTO; going back to
 * safer stars is always allowed. Upgrades are bought at outfitters, built from credits and materials.
 */
export const WARP_CORES = [
  { cls: 1, name: 'Class I warp core', reach: 2, cr: 0, mats: {} },
  { cls: 2, name: 'Class II warp core', reach: 4, cr: 6000, mats: { cuprite: 20, titanium: 10 } },
  { cls: 3, name: 'Class III warp core', reach: 6, cr: 30000, mats: { titanium: 30, cobalt: 20 } },
  { cls: 4, name: 'Class IV warp core', reach: 8, cr: 120000, mats: { cobalt: 40, iridium: 20, helium3: 10 } },
  { cls: 5, name: 'Class V warp core', reach: 10, cr: 400000, mats: { iridium: 50, exotic: 20 } },
];
export const warpCore = G => WARP_CORES[Math.max(1, Math.min(WARP_CORES.length, G.drive || 1)) - 1];
/** Can this save's warp core take it into a star of this danger? */
export const canWarpTo = (G, sys) => sys.tier <= warpCore(G).reach;
/** The lowest core class that reaches a danger tier. */
export const coreFor = tier => WARP_CORES.find(c => c.reach >= tier) || WARP_CORES[WARP_CORES.length - 1];

function link(a, b) { if (a === b) return; if (!a.links.includes(b.id)) a.links.push(b.id); if (!b.links.includes(a.id)) b.links.push(a.id); }

function pickShops(r, tier) {
  const all = ['market', 'shipyard', 'outfitter', 'refinery', 'repair', 'crew', 'insurance', 'drones', 'lab', 'salvage', 'bounty', 'blackmarket'];
  const always = ['market', 'repair', 'outfitter'];
  const rest = all.filter(x => !always.includes(x) && x !== 'blackmarket');
  const extra = rest.filter(() => r.chance(0.55 + tier * 0.03));
  return [...always, ...extra];
}

// ------------------------------------------------------------------ asteroids
export function makeRock(seed, radius, tier, opts = {}) {
  const r = rng(seed); const n = noise2(seed);
  const size = Math.ceil(radius * 2 + 3);
  const g = createGrid(size, size);
  const c = size / 2; const ores = oreTable(tier, opts.rich);
  // ore veins come in clusters, from a second noise
  const vein = noise2(seed + 7);
  const veinMat = ores.map(o => o.mat);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c; const d = Math.hypot(dx, dy);
    const edge = radius * (0.72 + 0.4 * n.fbm(x * 0.18 + 3, y * 0.18 + 9, 3));
    if (d > edge) continue;
    const v = vein.fbm(x * 0.22, y * 0.22, 2);
    let id = 'rock';
    if (v > 0.6 - (opts.rich ? 0.12 : 0)) {
      const pick = veinMat[Math.floor(((v * 97 + Math.floor(x / 4) * 13 + Math.floor(y / 4) * 7) % veinMat.length + veinMat.length) % veinMat.length)];
      id = 'ore_' + pick;
    }
    place(g, id, x, y);
  }
  const body = makeBody('rock', g, { team: 'neutral', name: 'Asteroid', tier });
  body.va = r.range(-0.15, 0.15) / Math.max(1, radius * 0.25);
  return body;
}

export function oreTable(tier, rich = false) {
  const out = [];
  for (const [mat, m] of Object.entries(MATERIALS)) {
    if (m.alien) continue;
    if (m.tier > tier + (rich ? 1 : 0)) continue;
    const w = m.tier === 1 ? 4 : m.tier <= tier - 2 ? 2 : 1;
    for (let i = 0; i < w; i++) out.push({ mat });
  }
  return out;
}

// ------------------------------------------------------------------ ground structures on planets
export function makeOutpost(seed, faction, tier, kind = 'bunker') {
  const r = rng(seed); const F = FACTIONS[faction];
  const sz = kind === 'base' ? 9 : kind === 'mine' ? 5 : 4;
  const g = createGrid(sz, sz);
  const arm = F.style.armor[0];
  const weapons = F.style.weapons.s;
  for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) {
    const edge = x === 0 || y === 0 || x === sz - 1 || y === sz - 1;
    const center = x === Math.floor(sz / 2) && y === Math.floor(sz / 2);
    let id = edge ? arm : 'frame';
    if (center) id = 'bridge';
    else if (kind !== 'mine' && edge && (x + y) % 3 === 0) id = r.pick(weapons);
    else if (!edge && r.chance(0.25)) id = 'cargo';
    const rot = Math.round(Math.atan2(y + 0.5 - sz / 2, x + 0.5 - sz / 2) / (Math.PI / 4)) & 7;
    place(g, id, x, y, rot, null);
  }
  const body = makeBody('ground', g, { team: F.hostile ? 'hostile' : 'friendly', faction, tier, cls: 'skiff', static: true, name: kind === 'base' ? `${F.short} ground base` : kind === 'mine' ? 'Mining outpost' : `${F.short} bunker` });
  body.crew = body.stats.crewCap; recompute(body);
  body.dmgMul = TIER_DMG[Math.min(10, tier)];
  return body;
}

/** Hostiles are kept this far from a friendly station (spawns, camps, roamers). */
export const SAFE_RADIUS = 3500;

// ------------------------------------------------------------------ fill a system
/**
 * Put everything in a system into a world. `state` is the saved per-system memory
 * (things killed for good, claims, looted derelicts).
 */
export function populate(w, sys, state = {}, opts = {}) {
  const r = rng(hash('pop', sys.seed));
  const tier = sys.tier;
  w.system = sys; w.tier = tier;
  const T = sys.traits || systemTraits(sys);
  // systems are huge now (play-test: "each star is only a very small map"); the space between the
  // landmarks is filled in sectors as you fly (sectors.js), so a big system costs no more than a small one
  w.size = T.radius; const R = T.radius, K = R / 9000;
  w.belts = [];
  const SK = STAR_KINDS[sys.star];
  w.sun = { x: 0, y: 0, r: SK.r, color: SK.color, glow: SK.glow, binary: !!SK.binary };
  // planets on orbits around the sun
  w.planets = [];
  for (let i = 0; i < sys.planets; i++) {
    const orbit = R * (0.13 + i * 0.17) + r.range(0, R * 0.04); const ang = r() * TAU;
    const kind = r.pick(Object.keys(PLANET_KINDS));
    const pk = PLANET_KINDS[kind];
    const pr = pk.gas ? r.range(1500, 2200) : r.range(700, 1400);
    const p = { id: `p${i}`, x: Math.cos(ang) * orbit, y: Math.sin(ang) * orbit, r: pr, kind, seed: hash(sys.seed, 'planet', i), name: `${sys.name} ${['I', 'II', 'III', 'IV', 'V'][i]}`, ores: pk.ores.filter(m => MATERIALS[m].tier <= tier + 2), outposts: [] };
    if (!p.ores.length) p.ores = ['ferrite', 'silicate'];
    w.planets.push(p);
    // ground structures: hostile bunkers, a base, or friendly mining outposts
    const nGround = pk.gas ? 0 : r.int(0, 2 + Math.floor(tier / 3));
    for (let k = 0; k < nGround; k++) {
      const gid = `g${i}_${k}`; if (state.dead?.includes(gid)) continue;
      const hostileF = r.pick(factionsForTier(tier));
      const friendly = r.chance(0.3);
      const kindG = friendly ? 'mine' : r.chance(0.25) ? 'base' : 'bunker';
      const ob = makeOutpost(hash(p.seed, k), friendly ? sys.owner === 'redfang' ? 'guild' : (FACTIONS[sys.owner].human ? sys.owner : 'guild') : hostileF, tier, kindG);
      const a2 = r() * TAU, d2 = r.range(0.1, 0.8) * pr;
      ob.x = p.x + Math.cos(a2) * d2; ob.y = p.y + Math.sin(a2) * d2; ob.a = r() * TAU; ob.gid = gid; ob.planet = p.id;
      if (kindG === 'base') ob.boss = false;
      w.bodies.push(ob);
    }
  }
  // asteroid belts: rings the sector streamer fills with fields (sectors.js); one small field sits near
  // the middle so a new arrival can start mining straight away
  for (let b = 0; b < sys.belts; b++) w.belts.push({ r: R * (0.3 + b * 0.22) + r.range(0, R * 0.05), width: R * r.range(0.04, 0.07) });
  {
    const a0 = r() * TAU;
    for (let k = 0; k < 14; k++) {
      const ang = a0 + r.range(-0.25, 0.25), rad = 4600 + r.range(-500, 500);
      const big = r() < 0.12; const rr = big ? r.range(8, 14) : r.range(2, 6);
      const rock = makeRock(hash(sys.seed, 'rock', 'home', k), rr, tier, { rich: r() < 0.1 });
      rock.x = Math.cos(ang) * rad; rock.y = Math.sin(ang) * rad; rock.a = r() * TAU;
      rock.vx = r.range(-6, 6); rock.vy = r.range(-6, 6);
      w.bodies.push(rock);
    }
    w.homeField = { x: Math.cos(a0) * 4600, y: Math.sin(a0) * 4600 };
  }
  // stations
  w.stations = [];
  if (sys.station) {
    const kindS = sys.station;
    const faction = kindS === 'trade' ? sys.owner : kindS === 'pirate' ? 'redfang' : sys.owner;
    const st = generateStation({ seed: hash(sys.seed, 'station'), size: kindS === 'trade' ? 96 + tier * 4 : 72, faction, kind: kindS, tier });
    const ang = r() * TAU; const d = 2000 + r() * 800;
    st.x = Math.cos(ang) * d; st.y = Math.sin(ang) * d; st.static = true; st.name = `${sys.name} ${kindS === 'trade' ? 'Station' : kindS === 'pirate' ? 'Den' : 'Hive'}`;
    st.services = sys.shops; st.dockable = kindS === 'trade' || kindS === 'pirate';
    st.invuln = kindS === 'trade';   // trade stations hold the economy together: they cannot be destroyed
    if (kindS === 'pirate') st.team = (w.game?.rep?.redfang ?? -50) > -20 ? 'neutral' : 'hostile';
    if (kindS === 'hive') { st.team = 'hostile'; st.dockable = false; hardenEnemy(st); }
    if (kindS === 'pirate' && st.team === 'hostile') hardenEnemy(st);
    w.bodies.push(st); w.stations.push(st);
  }
  // derelict hulks to loot / salvage
  if (sys.features.includes('derelict') && !state.looted?.includes('derelict')) {
    const cls = r.pick(tier >= 5 ? ['cruiser', 'battleship'] : tier >= 3 ? ['frigate', 'destroyer'] : ['corvette', 'frigate']);
    const d = generateShip({ cls, faction: r.pick(['guild', 'navy', 'redfang']), tier, seed: hash(sys.seed, 'derelict') });
    for (const b of d.grid.blocks) if (r() < 0.35 && !b.def.core) { b.alive = false; b.hp = 0; }
    d.grid.cells.fill(0);
    for (const b of d.grid.blocks) if (b.alive) { const n = b.def.size || 1; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) d.grid.cells[(b.y + j) * d.grid.w + b.x + i] = b.idx + 1; }
    recompute(d);
    d.kind = 'wreck'; d.team = 'neutral'; d.life = 1e9; d.derelict = true; d.name = `Derelict ${d.name}`;
    const ang = r() * TAU; const dd = r.range(4000, 7000) * K; d.x = Math.cos(ang) * dd; d.y = Math.sin(ang) * dd; d.va = 0.02; d.lootKey = 'derelict';
    w.bodies.push(d);
    w.poi = w.poi || []; w.poi.push({ kind: 'derelict', x: d.x, y: d.y, body: d });
  }
  // a distress beacon (sometimes a trap)
  w.poi = w.poi || [];
  if (sys.features.includes('beacon') && !state.looted?.includes('beacon')) {
    const ang = r() * TAU; const d = r.range(3500, 7500) * K;
    w.poi.push({ kind: 'beacon', x: Math.cos(ang) * d, y: Math.sin(ang) * d, trap: r() < 0.4, done: false, key: 'beacon' });
  }
  if (sys.features.includes('pirateBase') && !state.dead?.includes('pirateBase')) {
    const f = sys.owner === 'guild' || sys.owner === 'navy' ? 'redfang' : sys.owner;
    const base = generateStation({ seed: hash(sys.seed, 'base'), size: 48 + tier * 4, faction: f, kind: 'pirate', tier });
    const ang = r() * TAU; const bd = r.range(5000, 8000) * K; base.x = Math.cos(ang) * bd; base.y = Math.sin(ang) * bd;
    base.static = true; base.team = 'hostile'; base.name = `${FACTIONS[f].short} stronghold`; base.gid = 'pirateBase'; base.boss = true; base.kind = 'station'; base.dockable = false; base.stronghold = true;
    hardenEnemy(base);
    w.bodies.push(base);
    w.poi.push({ kind: 'stronghold', x: base.x, y: base.y, body: base });
    // guards
    spawnGroup(w, { x: base.x + 400, y: base.y }, f, tier, r, 'guard');
  }
  if (sys.features.includes('claimable')) {
    const ang = r() * TAU; const d = r.range(3000, 6500) * K;
    w.poi.push({ kind: 'claim', x: Math.cos(ang) * d, y: Math.sin(ang) * d, key: 'claim', rich: oreTable(tier + 1, true).slice(-1)[0]?.mat || 'ferrite' });
    // a rich field around the claim spot
    for (let k = 0; k < 10; k++) {
      const rock = makeRock(hash(sys.seed, 'claimrock', k), r.range(3, 9), tier + 1, { rich: true });
      const a3 = r() * TAU, d3 = r.range(80, 600);
      rock.x = Math.cos(ang) * d + Math.cos(a3) * d3; rock.y = Math.sin(ang) * d + Math.sin(a3) * d3; w.bodies.push(rock);
    }
  }
  // traffic: traders and miners from the station, patrols
  if (w.stations[0] && w.stations[0].team !== 'hostile') {
    const st = w.stations[0];
    const owner = st.faction;
    for (let k = 0; k < 4 + Math.floor(r() * 4); k++) {
      const s = generateShip({ cls: r.pick(['corvette', 'skiff', tier >= 3 ? 'frigate' : 'corvette']), faction: FACTIONS[owner].human ? owner : 'guild', tier, seed: hash(sys.seed, 'traffic', k), role: r.pick(['trader', 'miner', 'escort']) });
      s.x = st.x + r.range(-1500, 1500); s.y = st.y + r.range(-1500, 1500);
      s.route = [{ x: st.x, y: st.y }, ...w.planets.map(p => ({ x: p.x, y: p.y }))];
      w.bodies.push(s);
    }
  }
  // roaming hostiles, about three times as many as before (play-test: "space is pretty empty"), spread
  // over the whole system; sectors.js adds camps and swarms around you as you fly
  const groups = Math.max(2, Math.round((3 + tier * 1.2 + (sys.owner !== 'guild' && sys.owner !== 'navy' ? 3 : 0)) * T.enemies));
  const sx = w.stations[0]?.x ?? 0, sy = w.stations[0]?.y ?? 0;
  for (let k = 0; k < groups; k++) {
    let ang = r() * TAU, d = r.range(6000, R * 0.85);
    // never parked on the station's doorstep (play-test: "I exited a station and was immediately destroyed")
    for (let tries = 0; tries < 6 && Math.hypot(Math.cos(ang) * d - sx, Math.sin(ang) * d - sy) < SAFE_RADIUS + 1500; tries++) { ang = r() * TAU; d = r.range(6000, R * 0.85); }
    const f = r.pick(factionsForTier(tier).concat(FACTIONS[sys.owner].hostile ? [sys.owner, sys.owner] : []));
    spawnGroup(w, { x: Math.cos(ang) * d, y: Math.sin(ang) * d }, f, tier, r);
  }
  // a roaming boss (PLAN §0 #18): visible on the galaxy map as a rumour
  if (opts.boss) {
    const b = opts.boss;
    const s = generateShip({ cls: b.cls, faction: b.faction, tier: Math.max(tier, b.tier), seed: b.seed, role: 'boss' });
    s.boss = true; s.name = b.name; s.bossId = b.id;
    const ang = r() * TAU; const bd = r.range(5000, 8000) * K; s.x = Math.cos(ang) * bd; s.y = Math.sin(ang) * bd;
    hardenEnemy(s);
    w.bodies.push(s);
    w.poi.push({ kind: 'boss', x: s.x, y: s.y, body: s, name: b.name });
  }
}

/** Encounter tables: several small ships, or one big one (owner brief). */
const CLASS_BY_TIER = [
  null,
  ['skiff', 'skiff', 'corvette'],
  ['skiff', 'corvette', 'corvette'],
  ['corvette', 'corvette', 'frigate'],
  ['corvette', 'frigate', 'frigate', 'destroyer'],
  ['frigate', 'destroyer', 'destroyer'],
  ['frigate', 'destroyer', 'cruiser'],
  ['destroyer', 'cruiser', 'cruiser', 'battleship'],
  ['destroyer', 'cruiser', 'battleship'],
  ['cruiser', 'battleship', 'carrier'],
  ['cruiser', 'battleship', 'dreadnought'],
];
const BIGGER = { skiff: 'corvette', corvette: 'frigate', frigate: 'destroyer', destroyer: 'cruiser', cruiser: 'battleship', battleship: 'dreadnought', carrier: 'dreadnought', dreadnought: 'dreadnought' };

export function spawnGroup(w, at, faction, tier, r, mode = null) {
  const pool = CLASS_BY_TIER[Math.min(10, tier)];
  // gnat packs (owner 2026-11-11: "low level enemies who are easy to kill in small swarms without
  // shields"): about a quarter of roaming groups near home, fewer further out
  const kind = mode || (r() < Math.max(0.1, 0.3 - tier * 0.02) ? 'gnats' : r() < 0.3 ? 'big' : 'pack');
  const list = [];
  if (kind === 'gnats') {
    const n = 5 + Math.floor(r() * 5);
    for (let i = 0; i < n; i++) list.push({ cls: 'skiff', role: 'swarm', gnat: true });
  } else if (kind === 'big') {
    const cls = BIGGER[r.pick(pool)];
    list.push({ cls, role: r.pick(FACTIONS[faction].style.roles.filter(x => x !== 'swarm')) || 'capital' });
  } else {
    const small = pool[0];
    const n = kind === 'guard' ? 2 + Math.floor(r() * 2) : tier <= 1 ? 1 + Math.floor(r() * 2) : 2 + Math.floor(r() * (1 + tier * 0.35));
    for (let i = 0; i < Math.min(7, n); i++) list.push({ cls: r() < 0.25 ? pool[1] : small, role: r.pick(FACTIONS[faction].style.roles) });
  }
  const out = [];
  list.forEach((e, i) => {
    const s = generateShip({ cls: e.cls, faction, tier, gnat: !!e.gnat, seed: hash(w.seed, at.x | 0, at.y | 0, i, w.t * 1000 | 0), role: e.role === 'trader' || e.role === 'miner' ? 'escort' : e.role });
    s.x = at.x + (i % 3 - 1) * (80 + s.r * 2); s.y = at.y + Math.floor(i / 3) * (80 + s.r * 2);
    if (kind === 'big') s.elite = true;
    if (s.team === 'hostile') hardenEnemy(s);
    w.bodies.push(s); out.push(s);
  });
  return out;
}
