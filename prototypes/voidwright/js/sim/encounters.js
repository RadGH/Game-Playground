// Encounters and space outposts (PLAN §E1 E6 + E7).
//
// Two ways things appear:
//  1. SECTORS. sectors.js fills a few of the empty squares of a system with one of ENCOUNTER_SECTORS
//     (encounterSector — from the star's seed alone, so the local map shows them before you arrive and they are
//     the same every visit). loadEncounter() builds the bodies when you fly near. Once one is finished (a convoy
//     saved, a vault cracked, a nest burned) it is remembered for good in sysMem(G, system).enc[key].
//  2. TIMED. encounterTick() rolls a random encounter near you every couple of minutes (a raided convoy, a
//     wandering merchant, a wanted captain), plus whatever a galaxy event adds (events.js: alien swarms in an
//     invasion, corsair fleets in a pirate war, rich veins in a gold rush).
//
// The kinds:
//   raid     convoy under attack: kill the raiders (credits + standing + a thank-you part) or rob the convoy
//   merchant a trader you can dock with mid-space (ui/merchant.js sells/buys parts)
//   rift     space rift: waves of strange aliens, exotic asteroids; three waves and it collapses (cache)
//   ion      ion cloud: shields do not recharge inside (world.js upkeep reads s.ionized), lightning, rich rocks
//   comet    a fast icy body circling the sector, dropping a trail of energy / exotic ore
//   hulk     derelict station: a dead hull with a way in to a sealed cache in its hub
//   elite    a wanted captain: named, tougher, a bounty on screen, better loot (s.elite, s.wanted)
//   ambush   looks like an asteroid cluster; corsairs come out of the rocks when you get close
//   outpost  friendly outpost: dock (E), 1-3 services + a mission board
//   vault    corsair outpost: silence its guns, then crack the vault (parts, a cache, sometimes a unique)
//   nest     alien nest: keeps sending swarms until you break it
//   ruin     abandoned outpost: search its sections one by one (caches, survivors, salvage, traps)
//   camp     (missions only) an enemy camp to clear
//
// Everything that should reach the screen goes into w.encMsgs ({ t: 'banner'|'toast'|'sound'|'merchant' }); the UI
// glue (ui/missions.js) turns those into banners and panels. Pure otherwise: no DOM, no clock.
// IMPORTANT: this file must never import sectors.js (sectors.js imports this one).

import { rng, hash, TAU } from '../core/math.js';
import { FACTIONS, factionsForTier } from '../data/factions.js';
import { MATERIALS, RARITY, RARITY_BY_ID, matTier, matOf } from '../data/types.js';
import { BLOCKS } from '../data/blocks.js';
import { makeRock, spawnGroup, starName, pickRockType, SAFE_RADIUS } from './galaxy.js';
import { generateShip, generateStation, hardenEnemy } from './shipgen.js';
import { recompute, toWorld } from './ship.js';
import { spawnPickup, splash, emit, destroy, repChange } from './world.js';
import { makeItem, rollRarity, rollLoot, rollUnique } from './loot.js';
import { sysMem } from './state.js';
import { eventMods } from './events.js';

export const ENCOUNTER_SECTORS = {
  raid: { name: 'Convoy under attack', color: '#ffd05a', what: 'Traders are being raided. Help them, or join in.' },
  merchant: { name: 'Wandering merchant', color: '#7affd8', what: 'A trader who sells rare parts. Fly close and press Use.' },
  rift: { name: 'Space rift', color: '#d06aff', what: 'A tear in space. Strange aliens come through; exotic ore drifts around it.' },
  ion: { name: 'Ion cloud', color: '#8ab8ff', what: 'Shields will not recharge inside. Lightning — and rich asteroids.' },
  comet: { name: 'Comet', color: '#bff4ff', what: 'A fast icy body leaving a trail of ore. Harpoon it or chase the trail.' },
  hulk: { name: 'Derelict station', color: '#c48cff', what: 'A dead station with a sealed cache in its hub.' },
  elite: { name: 'Wanted captain', color: '#ff7a3a', what: 'A named captain with a price on their head. Tough, with good loot.' },
  ambush: { name: 'Asteroid cluster', color: '#b8a890', what: 'Asteroids to mine.', mapAs: 'field' },   // the surprise is the point
  outpost: { name: 'Friendly outpost', color: '#5fd8ff', what: 'Dock here: a few services and a mission board.' },
  vault: { name: 'Corsair outpost', color: '#ff5a6a', what: 'Guards a loot vault. Silence its guns, then crack the vault.' },
  nest: { name: 'Alien nest', color: '#a6ff4a', what: 'Sends out swarms until it is destroyed.' },
  ruin: { name: 'Abandoned outpost', color: '#d8c8a0', what: 'Search its sections: supplies, survivors — or traps.' },
};

/** Friendly outposts: what sort, and which station services they run (plus a mission board). */
export const OUTPOST_TYPES = {
  depot: { name: 'Mining Depot', services: ['market', 'refinery'] },
  mercs: { name: 'Mercenary Camp', services: ['mercs', 'repair'] },
  scrap: { name: 'Scrap Dealer', services: ['salvage', 'repair', 'market'] },
  research: { name: 'Research Post', services: ['lab'] },
};

const ANOMALIES = ['rift', 'ion', 'comet'];
const CAPTAIN_FIRST = ['Varro', 'Ilse', 'Doran', 'Mira', 'Taskel', 'Quen', 'Brannoch', 'Sefa', 'Orrin', 'Halde', 'Yusk', 'Corwen', 'Nadja', 'Petrak'];
const CAPTAIN_LAST = ['Tusk', 'Blackwater', 'Sorrow', 'Halloway', 'Grint', 'Mournhew', 'Saltjaw', 'Kettle', 'Vorne', 'Ashgrove', 'Rookhart', 'Dunmere'];
export const captainName = r => `${r.pick(CAPTAIN_FIRST)} ${r.pick(CAPTAIN_LAST)}`;

// ------------------------------------------------------------------ which sectors hold an encounter
/**
 * Called by sectors.js sectorInfo for a square its own table left empty. Its own random stream, so the
 * older sector kinds never move. Returns a sector info or null.
 */
export function encounterSector(sys, sx, sy, SEC, nearStation, key) {
  const r = rng(hash(sys.seed, 'enc', sx, sy));
  if (r() > 0.34) return null;
  const t = sys.tier; const F = FACTIONS[sys.owner];
  const lawful = F?.human && !F.hostile;
  const foe = !nearStation;   // nothing hostile parked by a friendly station (SAFE_RADIUS)
  const weights = [
    ['raid', foe ? 0.09 : 0], ['merchant', 0.06], ['rift', foe && t >= 3 ? 0.06 : 0], ['ion', 0.07], ['comet', 0.07],
    ['hulk', 0.06], ['elite', foe && t >= 2 ? 0.07 : 0], ['ambush', foe ? 0.08 : 0],
    ['outpost', lawful ? 0.16 : 0.05], ['vault', foe ? 0.08 : 0], ['nest', foe && t >= 2 ? 0.07 : 0], ['ruin', 0.08],
  ];
  let tot = 0; for (const [, v] of weights) tot += v;
  let pick = r() * tot, kind = null;
  for (const [k, v] of weights) { if ((pick -= v) <= 0) { kind = k; break; } }
  if (!kind) return null;
  const x = sx * SEC + r.range(0.25, 0.75) * SEC, y = sy * SEC + r.range(0.25, 0.75) * SEC;
  const info = { kind, x, y, key, seed: hash(sys.seed, 'encfill', sx, sy), enc: true };
  info.faction = factionFor(kind, sys, r);
  if (kind === 'outpost') info.type = r.pick(Object.keys(OUTPOST_TYPES));
  return info;
}

function factionFor(kind, sys, r) {
  const aliens = factionsForTier(Math.max(sys.tier, 2)).filter(f => !FACTIONS[f].human);
  const owner = FACTIONS[sys.owner];
  if (kind === 'nest' || kind === 'rift') return r.pick(aliens.length ? aliens : ['vesh']);
  if (kind === 'outpost' || kind === 'merchant' || kind === 'ruin' || kind === 'hulk') return owner?.human && !owner.hostile ? sys.owner : 'guild';
  if (kind === 'raid' || kind === 'vault' || kind === 'ambush') return owner?.hostile && owner.human ? sys.owner : 'redfang';
  return r.pick(factionsForTier(sys.tier));   // elite, camp
}

// ------------------------------------------------------------------ state
export function encState(w) { return (w.enc ||= { list: [], n: 0, spawnT: 75, evT: 0, r: rng(hash(w.seed || 1, 'enc')), wanted: {}, ionized: new Set(), ionWarn: -99 }); }
const say = (w, m) => (w.encMsgs ||= []).push(m);
const memOf = (w, key) => { const G = w.game; if (!G?.sys || !w.system || !key) return null; /* test worlds may carry a bare game */ const M = sysMem(G, w.system.id); M.enc ||= {}; return M.enc; };
const isDone = (w, key) => !!memOf(w, key)?.[key]?.done;
function markDone(w, e) { if (e.missionId || !e.key || e.timed) return; const m = memOf(w, e.key); if (m) (m[e.key] ||= {}).done = true; }
export const byPlayer = (w, s) => !!s && (s.lastAttacker === w.player || s.lastAttacker?.team === 'player' || (!!w.player && s.lastAttacker?.owner === w.player));
const alive = b => b && !b.dead;
function addPoi(w, e, p) { const q = { kind: 'enc', enc: e.id, done: false, ...p }; (w.poi ||= []).push(q); e.pois.push(q); return q; }
function newEntry(w, kind, x, y, extra = {}) {
  const E = encState(w);
  const e = { id: `e${++E.n}`, kind, x, y, pois: [], ships: [], st: {}, tier: w.system?.tier || w.tier || 1, ...extra };
  E.list.push(e); return e;
}
function removeEntry(w, e) {
  const E = encState(w); E.list = E.list.filter(x => x !== e);
  if (w.poi) w.poi = w.poi.filter(p => p.enc !== e.id);
}

// ------------------------------------------------------------------ building blocks
/** A rock field: n asteroids around (x, y). opts: { type, rich, radius } */
function rockField(w, e, n, seed, opts = {}) {
  const r = rng(seed); const out = [];
  for (let k = 0; k < n; k++) {
    const a = r() * TAU, d = r.range(120, opts.radius || 800) * Math.sqrt(r());
    const rr = r() < 0.15 ? r.range(7, 12) : r.range(2.5, 6);
    const type = typeof opts.type === 'function' ? opts.type(r) : opts.type;
    const rock = makeRock(hash(seed, 'rock', k), rr, e.tier + (opts.up || 0), { rich: opts.rich || r() < 0.08 + (w.eventRich || 0), type });
    rock.x = e.x + Math.cos(a) * d; rock.y = e.y + Math.sin(a) * d; rock.a = r() * TAU;
    rock.vx = r.range(-4, 4); rock.vy = r.range(-4, 4);
    w.bodies.push(rock); out.push(rock);
  }
  return out;
}
/** Rebuild a grid's cell map after blocks were killed by hand (the way sectors.js makes wrecks). */
function recell(s) {
  const g = s.grid; g.cells.fill(0);
  for (const b of g.blocks) if (b.alive) { const n = b.def.size || 1; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g.cells[(b.y + j) * g.w + b.x + i] = b.idx + 1; }
  recompute(s);
}
/** A dead station: neutral, static, holed. `keep(b, dx, dy)` decides which blocks stay. */
function deadStation(seed, size, faction, tier, keep) {
  const s = generateStation({ seed, size, faction, kind: 'trade', tier });
  const g = s.grid; const cx = g.w / 2, cy = g.h / 2;
  for (const b of g.blocks) { const n = b.def.size || 1; if (!keep(b, b.x + n / 2 - cx, b.y + n / 2 - cy)) { b.alive = false; b.hp = 0; } }
  recell(s);
  s.kind = 'wreck'; s.team = 'neutral'; s.static = true; s.va = 0; s.life = 1e9; s.ai = null; s.stationKind = null;
  return s;
}
/** A part from a fair pool for this danger, at least `minRarity`. */
export function rollPart(r, tier, bonus = 0, minRarity = 'uncommon') {
  let rar = rollRarity(r, tier, bonus); const min = RARITY_BY_ID[minRarity]?.index || 0;
  if (RARITY_BY_ID[rar.id].index < min) rar = RARITY[min];
  const big = tier >= 4 ? 2 : 1;
  const pool = Object.values(BLOCKS).filter(b => b.module && !b.core && !b.race && (b.size || 1) <= big && (b.tier || 1) <= tier + 1);
  return makeItem(r, r.pick(pool).id, rar.id);
}
function dropPart(w, r, tier, bonus, x, y, minRarity = 'uncommon') { const it = rollPart(r, tier, bonus, minRarity); spawnPickup(w, { kind: 'item', item: it, rarity: it.rarity }, x, y, 0, 0, 90); return it; }
function dropUnique(w, r, from, chance, x, y) { const u = rollUnique(r, from, chance); if (u) spawnPickup(w, { kind: 'item', item: u, rarity: u.rarity || 'legendary' }, x, y, 0, 0, 60); return u; }
const dropCache = (w, tier, x, y) => spawnPickup(w, { kind: 'cache', tier, n: 1 }, x, y, 0, 0, 50);
function dropMats(w, r, tier, x, y, piles, roles = ['structural', 'energy']) {
  for (let i = 0; i < piles; i++) { const mat = matOf(r.pick(roles), matTier(tier)); spawnPickup(w, { kind: 'mat', mat, n: 3 + Math.floor(r() * 8) }, x, y, 0, 0, 120); }
}
function toughen(s, k) {
  if (k <= 1 || s.toughened) return; s.toughened = true;
  s.dmgMul = (s.dmgMul ?? 1) * k;
  for (const b of s.grid.blocks) { b.maxHp *= k; b.hp *= k; }
  recompute(s);
}

// ------------------------------------------------------------------ loaders (one per kind)
/** Called by sectors.js load() for an encounter sector. `tag` marks a body as part of the sector. */
export function loadEncounter(w, info, tag = b => b) {
  if (isDone(w, info.key) && !['outpost', 'merchant', 'ion', 'comet', 'ruin', 'hulk'].includes(info.kind)) {
    // finished for good: a little leftover scenery so the spot is not blank
    if (info.kind !== 'raid' && info.kind !== 'elite') { const e = { x: info.x, y: info.y, tier: w.system.tier, pois: [] }; rockField(w, e, 5, hash(info.seed, 'left'), {}).forEach(tag); }
    return null;
  }
  const before = w.bodies.length;
  const e = spawnEncounter(w, info.kind, info.x, info.y, { seed: info.seed, key: info.key, sector: info.key, faction: info.faction, type: info.type });
  for (let i = before; i < w.bodies.length; i++) tag(w.bodies[i]);
  return e;
}

/**
 * Make one encounter at (x, y). opts: { seed, key, sector, faction, type, timed, missionId }.
 * Returns the entry (also kept in w.enc.list).
 */
export function spawnEncounter(w, kind, x, y, opts = {}) {
  const sys = w.system; const tier = sys?.tier || w.tier || 1;
  const seed = opts.seed ?? hash(w.seed, kind, x | 0, y | 0);
  const r = rng(seed);
  const faction = opts.faction || factionFor(kind, sys || { tier, owner: 'guild' }, r);
  const e = newEntry(w, kind, x, y, { seed, key: opts.key || null, sector: opts.sector || null, timed: !!opts.timed, missionId: opts.missionId || null, faction, tier });
  const mem = memOf(w, e.key);
  const F = FACTIONS[faction];
  switch (kind) {
    case 'raid': {
      const owner = FACTIONS[sys?.owner]?.human && !FACTIONS[sys.owner].hostile ? sys.owner : 'guild';
      e.owner = owner;
      // two traders and two escorts: sturdy enough to hold out until you arrive (it spawns ~2.6 km away)
      for (let k = 0; k < 4; k++) {
        const s = generateShip({ cls: k === 0 && tier >= 3 ? 'frigate' : r.pick(['corvette', 'corvette', 'skiff']), faction: owner, tier, seed: hash(seed, 'convoy', k), role: k >= 2 ? 'escort' : 'trader' });
        s.x = x + (k % 2) * 140; s.y = y + Math.floor(k / 2) * 140; s.convoy = e.id; s.name = `Convoy ${s.name}`;
        toughen(s, 1.6);
        w.bodies.push(s); e.ships.push(s);
      }
      e.st.raiders = spawnGroup(w, { x: x - 420, y: y + 260 }, faction, tier, r, 'pack');
      for (const s of e.st.raiders) s.raider = e.id;
      addPoi(w, e, { body: e.ships[0], color: '#ffd05a', label: 'Convoy under attack' });
      break;
    }
    case 'merchant': {
      const s = generateShip({ cls: tier >= 3 ? 'frigate' : 'corvette', faction: faction || 'guild', tier, seed: hash(seed, 'merchant'), role: 'trader' });
      s.x = x; s.y = y; s.merchant = e.id; s.name = `${starName(r)} Trading Co.`;
      s.route = [{ x: x + 900, y }, { x, y: y + 900 }, { x: x - 900, y }, { x, y: y - 900 }];
      w.bodies.push(s); e.ships.push(s);
      e.name = s.name; e.bought = mem?.[e.key]?.bought || [];
      addPoi(w, e, { body: s, color: '#7affd8', label: 'Wandering merchant' });
      break;
    }
    case 'rift': {
      rockField(w, e, 7, hash(seed, 'rocks'), { type: matOf('exotic', matTier(tier)), rich: true, radius: 1100 });
      e.st = { waves: 0, wave: [], cd: 0, woke: false };
      addPoi(w, e, { x, y, color: '#d06aff', label: 'Space rift' });
      break;
    }
    case 'ion': {
      e.radius = 1700;
      rockField(w, e, 12, hash(seed, 'rocks'), { type: rr => rr() < 0.55 ? matOf('exotic', matTier(tier)) : matOf('energy', matTier(tier)), rich: true, radius: 1500 });
      addPoi(w, e, { x, y, color: '#8ab8ff', label: 'Ion cloud' });
      break;
    }
    case 'comet': {
      const t = matTier(tier);
      const c = makeRock(hash(seed, 'comet'), 6 + r() * 3, tier, { type: matOf('energy', t), rich: true });
      c.name = 'Comet'; c.comet = e.id; c.anomaly = true; c.x = x + 1300; c.y = y;
      w.bodies.push(c); e.ships.push(c);
      e.st = { th: 0, w: (r() < 0.5 ? 1 : -1) * 0.09, R: 1300, trail: 0, dropT: 0 };
      addPoi(w, e, { body: c, color: '#bff4ff', label: 'Comet' });
      break;
    }
    case 'hulk': {
      const done = !!mem?.[e.key]?.done;
      const cut = r() * TAU;
      const s = deadStation(hash(seed, 'hulk'), 64 + Math.min(32, tier * 4), faction, tier, (b, dx, dy) => {
        const along = dx * Math.cos(cut) + dy * Math.sin(cut), across = Math.abs(-dx * Math.sin(cut) + dy * Math.cos(cut));
        if (Math.hypot(dx, dy) < 9) return false;              // the hub is hollow: the cache floats in it
        if (along > 0 && across < 7) return false;               // a way in
        return r() > 0.25;
      });
      s.x = x; s.y = y; s.name = 'Derelict station'; s.hulk = e.id;
      w.bodies.push(s); e.ships.push(s);
      const [hx, hy] = toWorld(s, s.grid.w / 2, s.grid.h / 2);
      e.cache = { x: hx, y: hy, open: done };
      e.door = { x: hx + Math.cos(cut) * (s.r + 80), y: hy + Math.sin(cut) * (s.r + 80) };
      if (!done) addPoi(w, e, { x: hx, y: hy, color: '#c48cff', label: 'Sealed cache (derelict station)' });
      break;
    }
    case 'elite': {
      const pool = ['corvette', 'frigate', 'destroyer', 'cruiser', 'battleship'];
      const cls = pool[Math.min(pool.length - 1, Math.floor(tier / 2))];
      const s = generateShip({ cls, faction, tier, seed: hash(seed, 'elite'), role: F.style.roles.find(x => x !== 'swarm') || 'gunship' });
      const name = `Captain ${captainName(r)}`;
      const reward = Math.round(900 * Math.pow(tier, 1.35));
      s.x = x; s.y = y; s.name = name; s.elite = true; s.wanted = true; s.wantedReward = reward; s.wantedEntry = e.id;
      hardenEnemy(s); toughen(s, 1.7);
      w.bodies.push(s); e.ships.push(s);
      const guards = spawnGroup(w, { x: x + 220, y: y + 140 }, faction, tier, r, 'guard');
      e.st.guards = guards; e.name = name; e.reward = reward;
      encState(w).wanted[s.id] = { name, reward, entry: e.id };
      addPoi(w, e, { body: s, color: '#ff7a3a', label: `Wanted: ${name}` });
      break;
    }
    case 'ambush': {
      rockField(w, e, 16, hash(seed, 'rocks'), { radius: 900 });
      e.st = { sprung: false };
      break;
    }
    case 'outpost': {
      const T = OUTPOST_TYPES[opts.type] || OUTPOST_TYPES.depot;
      const s = generateStation({ seed: hash(seed, 'outpost'), size: 36, faction: F?.human && !F.hostile ? faction : 'guild', kind: 'trade', tier });
      s.x = x; s.y = y; s.static = true; s.team = 'friendly'; s.invuln = true; s.dockable = true;
      s.name = `${starName(r).split(' ')[0]} ${T.name}`;
      s.services = [...T.services, 'insurance', 'missions'];   // insurance everywhere (report #65)
      s.outpost = { type: opts.type || 'depot', key: e.key, board: `O${sys?.id}:${e.key || e.id}` };
      w.bodies.push(s); e.ships.push(s); e.name = s.name;
      addPoi(w, e, { body: s, color: '#5fd8ff', label: s.name });
      break;
    }
    case 'vault': {
      const s = generateStation({ seed: hash(seed, 'vault'), size: 44, faction, kind: 'pirate', tier });
      s.x = x; s.y = y; s.static = true; s.team = 'hostile'; s.dockable = false; s.vault = e.id; s.name = `${F.short} outpost`;
      hardenEnemy(s);
      w.bodies.push(s); e.ships.push(s);
      e.st.guards = spawnGroup(w, { x: x + s.r + 300, y }, faction, tier, r, 'guard');
      e.poi = addPoi(w, e, { body: s, color: '#ff5a6a', label: `${F.short} outpost (loot vault)` });
      break;
    }
    case 'nest': {
      const s = generateStation({ seed: hash(seed, 'nest'), size: 40, faction, kind: 'hive', tier });
      s.x = x; s.y = y; s.static = true; s.team = 'hostile'; s.dockable = false; s.nest = true; s.nestOf = e.id; s.name = `${F.short} nest`;
      hardenEnemy(s);
      w.bodies.push(s); e.ships.push(s);
      e.st = { spawnT: 6, broods: [] };
      addPoi(w, e, { body: s, color: '#a6ff4a', label: `${F.short} nest` });
      break;
    }
    case 'ruin': {
      const s = deadStation(hash(seed, 'ruin'), 52, faction, tier, () => r() > 0.3);
      s.x = x; s.y = y; s.name = 'Abandoned outpost'; s.ruin = e.id;
      w.bodies.push(s); e.ships.push(s);
      const n = 3 + Math.floor(r() * 3); const off = r() * TAU;
      const searched = mem?.[e.key]?.searched || [];
      e.sections = [];
      for (let i = 0; i < n; i++) {
        const a = off + i / n * TAU; const rr = rng(hash(seed, 'section', i)); const roll = rr();
        const what = roll < 0.3 ? 'cache' : roll < 0.55 ? 'survivors' : roll < 0.8 ? 'salvage' : rr() < 0.5 ? 'ambush' : 'blast';
        e.sections.push({ i, x: x + Math.cos(a) * (s.r + 70), y: y + Math.sin(a) * (s.r + 70), what, done: searched.includes(i) });
      }
      if (e.sections.some(q => !q.done)) addPoi(w, e, { body: s, color: '#d8c8a0', label: 'Abandoned outpost' });
      break;
    }
    case 'camp': {
      rockField(w, e, 6, hash(seed, 'rocks'), {});
      e.ships = spawnGroup(w, { x, y }, faction, tier, r, 'pack').concat(spawnGroup(w, { x: x + 260, y: y - 200 }, faction, tier, r, 'guard'));
      addPoi(w, e, { x, y, color: '#ff5a6a', label: 'Enemy camp' });
      break;
    }
  }
  if (e.missionId) for (const s of e.ships) s.missionId = e.missionId;
  return e;
}

// ------------------------------------------------------------------ the tick
/**
 * Once a frame while flying (ui/missions.js calls it from main.js's frame). gal = the galaxy, t = G.playTime.
 * Updates every live encounter, rolls timed ones, applies galaxy events to this system.
 */
export function encounterTick(w, G, gal, dt) {
  const E = encState(w); const P = w.player; if (!P || P.dead) return;
  // galaxy events → the few numbers the sim reads (world.js destroy luck, sectors.js rich rocks)
  if ((E.evT -= dt) <= 0 && gal && w.system) {
    E.evT = 1;
    const m = E.mods = eventMods(gal, w.system.id, G?.playTime || 0);
    w.eventLuck = m.luck; w.eventRich = m.rich;
    if (m.tough > 1) for (const s of w.bodies) if (!s.dead && s.kind === 'ship' && s.team === 'hostile') toughen(s, m.tough);
  }
  for (const e of [...E.list]) {
    // a sector you flew away from takes its encounter with it (sectors.js already put the bodies away)
    if (e.sector && w.sectors && !w.sectors.loaded.has(e.sector)) { removeEntry(w, e); continue; }
    if (e.timed && !e.missionId && Math.hypot(e.x - P.x, e.y - P.y) > 15000) {
      for (const s of [...e.ships, ...(e.st.raiders || []), ...(e.st.guards || [])]) if (!s.dead && !s.harpooned && s.ai?.target !== P) { s.dead = true; s.unloaded = true; }
      removeEntry(w, e); continue;
    }
    UPDATE[e.kind]?.(w, G, e, dt, P);
  }
  // ion clouds: who is inside (world.js upkeep reads s.ionized)
  for (const s of E.ionized) s.ionized = false;
  E.ionized.clear();
  for (const e of E.list) if (e.kind === 'ion') for (const s of w.bodies) if (!s.dead && (s.kind === 'ship') && Math.hypot(s.x - e.x, s.y - e.y) < e.radius) { s.ionized = true; E.ionized.add(s); }
  timedSpawner(w, G, dt, P);
}

const UPDATE = {
  raid(w, G, e, dt, P) {
    const st = e.st; if (st.over) return;
    const convoy = e.ships, raiders = st.raiders || [];
    if (!st.robbed && convoy.some(c => byPlayer(w, c))) {
      st.robbed = true;
      for (const c of convoy) c.angry = true;
      repChange(w, e.owner, -10, 'You attacked a convoy');
      say(w, { t: 'toast', text: 'The convoy turns its guns on you.', kind: 'bad' });
    }
    if (st.robbed) for (const c of convoy) if (c.dead && !c.unloaded && !c.robbed) {
      c.robbed = true; const r = rng(hash(e.seed, 'rob', c.id));
      dropMats(w, r, e.tier + 1, c.x, c.y, 3, ['structural', 'energy', 'exotic']);
      spawnPickup(w, { kind: 'cr', n: Math.round(120 * e.tier * (1 + r())) }, c.x, c.y, 0, 0, 60);
    }
    if (!raiders.length || raiders.every(s => s.dead)) {
      st.over = true; e.pois.forEach(p => { p.done = true; });
      const left = convoy.filter(alive);
      if (!st.robbed && left.length && raiders.some(s => byPlayer(w, s))) {
        const r = rng(hash(e.seed, 'thanks'));
        const cr = Math.round(260 * Math.pow(e.tier, 1.2));
        if (G) G.credits += cr;
        repChange(w, e.owner, 6, 'Saved a convoy');
        const it = dropPart(w, r, e.tier, 0.8, left[0].x, left[0].y, 'uncommon');
        say(w, { t: 'banner', title: 'Convoy saved', text: `They wire you ${cr.toLocaleString()} credits and throw in a ${RARITY_BY_ID[it.rarity].name.toLowerCase()} part.` });
        say(w, { t: 'sound', id: 'rare' });
      } else if (!st.robbed && !left.length) say(w, { t: 'toast', text: 'The convoy was lost.', kind: 'bad' });
      markDone(w, e);
    } else if (convoy.every(c => c.dead) && !st.robbed) { st.over = true; e.pois.forEach(p => { p.done = true; }); say(w, { t: 'toast', text: 'The convoy was lost.', kind: 'bad' }); markDone(w, e); }
  },
  rift(w, G, e, dt, P) {
    const st = e.st; if (st.closed) return;
    const d = Math.hypot(P.x - e.x, P.y - e.y);
    // sparks across the tear when you are near enough to see it
    if (d < 4000 && encState(w).r() < dt * 2) { const R = encState(w).r; const a = R() * TAU; emit(w, { t: 'arc', pts: [[e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 160], [e.x + Math.cos(a + 2) * 240, e.y + Math.sin(a + 2) * 120]], color: '#d06aff', big: true }); }
    st.wave = st.wave.filter(alive);
    st.cd -= dt;
    if (!st.wave.length && st.waves < 3 && d < 2600 && st.cd <= 0) {
      st.waves++; st.cd = 6;
      const r = rng(hash(e.seed, 'wave', st.waves));
      const strange = factionsForTier(Math.max(4, e.tier + 2)).filter(f => !FACTIONS[f].human);
      st.wave = spawnGroup(w, { x: e.x, y: e.y }, r.pick(strange), e.tier, r, st.waves === 3 ? 'big' : 'pack');
      for (const s of st.wave) { s.riftborn = true; s.name = `Rift-touched ${s.name}`; s.dmgMul = (s.dmgMul ?? 1) * 1.1; if (e.missionId) s.missionId = e.missionId; }
      say(w, { t: st.waves === 1 ? 'banner' : 'toast', title: 'The rift wakes', text: st.waves === 1 ? 'Something strange is coming through.' : `Wave ${st.waves} of 3 comes through the rift.`, kind: 'bad' });
      say(w, { t: 'sound', id: 'warn' });
    } else if (!st.wave.length && st.waves >= 3) {
      st.closed = true; e.pois.forEach(p => { p.done = true; });
      const r = rng(hash(e.seed, 'close'));
      dropCache(w, e.tier + 1, e.x, e.y); dropMats(w, r, e.tier + 1, e.x, e.y, 3, ['exotic']);
      say(w, { t: 'banner', title: 'The rift collapses', text: 'It leaves behind a sealed cache and a scatter of exotic ore.' });
      markDone(w, e); e.cleared = true;
    }
  },
  ion(w, G, e, dt, P) {
    const E = encState(w); const d = Math.hypot(P.x - e.x, P.y - e.y);
    if (d > e.radius + 1200) return;
    if (d < e.radius && w.t - E.ionWarn > 40) { E.ionWarn = w.t; say(w, { t: 'toast', text: 'Ion cloud: your shields will not recharge in here.', kind: 'bad' }); }
    if (E.r() < dt * 0.9) {
      const R = E.r; const near = d < e.radius && R() < 0.35;
      const a = R() * TAU, rr = Math.sqrt(R()) * e.radius;
      const x = near ? P.x + (R() - 0.5) * 360 : e.x + Math.cos(a) * rr, y = near ? P.y + (R() - 0.5) * 360 : e.y + Math.sin(a) * rr;
      emit(w, { t: 'arc', pts: [[x + (R() - 0.5) * 500, y - 300 - R() * 200], [x, y]], color: '#9ab8ff', big: true });
      if (near) splash(w, x, y, 80, 7 * e.tier, 'lightning', 'm', null, { noTeam: true });
    }
  },
  comet(w, G, e, dt) {
    const c = e.ships[0]; const st = e.st; if (!alive(c)) return;
    if (!c.harpooned) {
      st.th += st.w * dt;
      const tx = e.x + Math.cos(st.th) * st.R, ty = e.y + Math.sin(st.th) * st.R;
      c.vx = -Math.sin(st.th) * st.R * st.w + (tx - c.x) * 0.6; c.vy = Math.cos(st.th) * st.R * st.w + (ty - c.y) * 0.6;
    }
    if ((st.dropT -= dt) <= 0 && st.trail < 70) {
      st.dropT = 1.4; st.trail++;
      const r = rng(hash(e.seed, 'trail', st.trail)); const t = matTier(e.tier);
      const sp = Math.hypot(c.vx, c.vy) || 1;
      spawnPickup(w, { kind: 'mat', mat: matOf(r() < 0.7 ? 'energy' : 'exotic', t), n: 1 + Math.floor(r() * 3), ore: true }, c.x - c.vx / sp * c.r * 1.5, c.y - c.vy / sp * c.r * 1.5, 0, 0, 30);
    }
  },
  elite(w, G, e) {
    const s = e.ships[0];
    if (s.dead && !e.over) { e.over = true; e.pois.forEach(p => { p.done = true; }); if (!byPlayer(w, s)) markDone(w, e); }
  },
  ambush(w, G, e, dt, P) {
    if (e.st.sprung || Math.hypot(P.x - e.x, P.y - e.y) > 1100 || P.grace > w.t) return;
    e.st.sprung = true;
    const r = rng(hash(e.seed, 'ambush'));
    const a = Math.atan2(P.y - e.y, P.x - e.x);
    const g1 = spawnGroup(w, { x: P.x + Math.cos(a + 1.8) * 520, y: P.y + Math.sin(a + 1.8) * 520 }, e.faction, e.tier, r, 'pack');
    const g2 = spawnGroup(w, { x: P.x + Math.cos(a - 1.8) * 520, y: P.y + Math.sin(a - 1.8) * 520 }, e.faction, e.tier, r, 'guard');
    for (const s of [...g1, ...g2]) { s.ai = { t: 0, orbit: 1, home: { x: P.x, y: P.y }, target: P, look: 2 }; if (e.sector) s.sector = e.sector; }
    say(w, { t: 'banner', title: 'Ambush!', text: `${FACTIONS[e.faction].short} ships were hiding in the rocks.` });
    say(w, { t: 'sound', id: 'warn' });
    markDone(w, e);
  },
  vault(w, G, e) {
    const s = e.ships[0];
    if (e.cracked) return;
    if (s.dead) { crackVault(w, e, s.x, s.y); return; }
    const guns = s.turrets.some(t => t.b.alive && t.w.mode !== 'tool');
    if (!guns && !e.open) {
      e.open = true; s.team = 'neutral';
      if (e.poi) { e.poi.label = 'Loot vault — fly in and crack it'; e.poi.color = '#ffd84a'; }
      say(w, { t: 'banner', title: 'Its guns are silent', text: 'Fly up to the outpost and crack its vault (Use).' });
    }
  },
  nest(w, G, e, dt, P) {
    const s = e.ships[0]; const st = e.st;
    if (e.over) return;
    const broken = s.dead || !s.stats.core?.alive || s.stats.hp < s.stats.maxHp * 0.4;
    if (broken) {
      e.over = true; e.cleared = true; e.pois.forEach(p => { p.done = true; });
      if (!s.dead) { if (!s.lastAttacker) s.lastAttacker = P; destroy(w, s); }
      const r = rng(hash(e.seed, 'nestloot'));
      dropCache(w, e.tier, s.x, s.y); dropMats(w, r, e.tier, s.x, s.y, 2, ['exotic', 'energy']);
      say(w, { t: 'banner', title: 'Nest destroyed', text: 'No more swarms will come from it.' }); say(w, { t: 'sound', id: 'rare' });
      markDone(w, e); return;
    }
    st.broods = st.broods.filter(alive);
    if (Math.hypot(P.x - e.x, P.y - e.y) > 3600) return;
    if ((st.spawnT -= dt) <= 0 && st.broods.length < 10) {
      st.spawnT = 22;
      const r = rng(hash(e.seed, 'brood', Math.floor(w.t)));
      const g = spawnGroup(w, { x: e.x + s.r + 120, y: e.y }, e.faction, e.tier, r, r() < 0.6 ? 'gnats' : 'pack');
      for (const b of g) { if (e.sector) b.sector = e.sector; if (e.missionId) b.missionId = e.missionId; }
      st.broods.push(...g);
      say(w, { t: 'toast', text: `The ${s.name.toLowerCase()} sends out a swarm.`, kind: 'bad' });
    }
  },
  camp(w, G, e) {
    if (!e.cleared && e.ships.every(s => s.dead)) { e.cleared = true; e.pois.forEach(p => { p.done = true; }); }
  },
};

function crackVault(w, e, x, y) {
  e.cracked = true; e.cleared = true; e.pois.forEach(p => { p.done = true; });
  const r = rng(hash(e.seed, 'vaultloot'));
  for (let i = 0; i < 3; i++) dropPart(w, r, e.tier + 1, 1.0, x, y, 'uncommon');
  dropUnique(w, r, 'vault', 0.25, x, y);
  dropCache(w, e.tier + 1, x, y);
  spawnPickup(w, { kind: 'cr', n: Math.round(300 * Math.pow(e.tier, 1.3)) }, x, y, 0, 0, 60);
  repChange(w, e.faction, -5, 'You looted their vault');
  say(w, { t: 'banner', title: 'Vault cracked', text: 'Parts, credits and a sealed cache spill out.' }); say(w, { t: 'sound', id: 'rare' });
  markDone(w, e);
}

// ------------------------------------------------------------------ timed encounters + galaxy-event spawns
function timedSpawner(w, G, dt, P) {
  const E = encState(w); const sys = w.system; if (!sys) return;
  E.spawnT -= dt; if (E.spawnT > 0) return;
  const m = E.mods || { spawn: { aliens: 0, pirates: 0, raids: 0 }, rich: 0 };
  const busy = 1 + m.spawn.aliens + m.spawn.pirates + m.spawn.raids;
  E.spawnT = (110 + E.r() * 90) / busy;
  if (P.grace > w.t) return;
  if ((w.stations || []).some(s => s.team !== 'hostile' && Math.hypot(s.x - P.x, s.y - P.y) < s.r + SAFE_RADIUS)) return;
  if (E.list.filter(e => e.timed && !e.missionId).length >= 2) return;
  const tier = sys.tier; const R = E.r;
  const list = [
    ['raid', 3 + m.spawn.raids * 5], ['merchant', 2], ['elite', tier >= 2 ? 2 : 0],
    ['swarm', m.spawn.aliens * 6], ['fleet', m.spawn.pirates * 5], ['vein', m.rich >= 0.3 ? 4 : 0],
  ];
  const kind = R.weighted(list.map(([id, w2]) => ({ id, w: w2 })), x => x.w).id;
  // ahead of you, a little off your line, so you fly into it
  const sp = Math.hypot(P.vx, P.vy); const a = (sp > 40 ? Math.atan2(P.vy, P.vx) : R() * TAU) + (R() - 0.5) * 1.2;
  const x = P.x + Math.cos(a) * 2600, y = P.y + Math.sin(a) * 2600;
  const r = rng(hash(w.seed, 'timed', Math.floor(w.t)));
  if (kind === 'swarm') {
    const al = factionsForTier(Math.max(2, tier)).filter(f => !FACTIONS[f].human);
    const g = spawnGroup(w, { x, y }, r.pick(al), tier, r, 'pack');
    say(w, { t: 'toast', text: `Invasion: an alien swarm of ${g.length} is heading your way.`, kind: 'bad' }); say(w, { t: 'sound', id: 'warn' });
  } else if (kind === 'fleet') {
    const g = spawnGroup(w, { x, y }, 'redfang', tier, r, r() < 0.35 ? 'big' : 'pack');
    say(w, { t: 'toast', text: `Pirate war: a corsair fleet of ${g.length} is hunting nearby.`, kind: 'bad' }); say(w, { t: 'sound', id: 'warn' });
  } else if (kind === 'vein') {
    const e = newEntry(w, 'vein', x, y, { timed: true, seed: hash(w.seed, 'vein', Math.floor(w.t)) });
    e.ships = rockField(w, e, 10, e.seed, { rich: true, radius: 600, up: 1 });
    addPoi(w, e, { x, y, color: '#ffd84a', label: 'Rich vein (gold rush)' });
    say(w, { t: 'toast', text: 'Gold rush: a rich vein of asteroids drifts nearby.', kind: 'good' });
  } else {
    const e = spawnEncounter(w, kind, x, y, { timed: true, seed: hash(w.seed, kind, Math.floor(w.t)) });
    const text = kind === 'raid' ? 'A convoy is calling for help nearby.' : kind === 'merchant' ? 'A wandering merchant is passing through. Fly close and press Use to trade.' : `${e.name} has been seen nearby. There is a price on their head.`;
    say(w, { t: 'toast', text, kind: kind === 'merchant' ? 'good' : '' });
  }
}

// ------------------------------------------------------------------ kills (from the sim's kill notes)
/** A kill note from world.js destroy(): wanted bounties and galaxy-event bounties. Returns credits paid. */
export function onKillNote(w, G, n) {
  if (n.t !== 'kill' || !G) return 0;
  const E = encState(w); let paid = 0;
  const wd = E.wanted[n.id];
  if (wd) {
    delete E.wanted[n.id];
    G.credits += wd.reward; paid += wd.reward;
    G.stats.wantedKills = (G.stats.wantedKills || 0) + 1;
    const e = E.list.find(x => x.id === wd.entry);
    if (e) { const s = e.ships[0]; dropCache(w, e.tier + 1, s.x, s.y); markDone(w, e); }
    say(w, { t: 'banner', title: 'Bounty claimed', text: `${wd.name} is gone. ${wd.reward.toLocaleString()} credits are yours.` }); say(w, { t: 'sound', id: 'rare' });
  }
  const m = E.mods; if (m && n.kind === 'ship') {
    const F = FACTIONS[n.faction];
    const b = F && !F.human ? m.bounty.aliens : n.faction === 'redfang' ? m.bounty.pirates : 0;
    if (b) { G.credits += b; paid += b; say(w, { t: 'toast', text: `Event bounty: +${b.toLocaleString()} cr`, kind: 'good' }); }
  }
  return paid;
}

// ------------------------------------------------------------------ the Use key
/**
 * The nearest encounter thing you can use: { kind: 'dock', s, label } for an outpost (main.js docks as usual), or
 * { kind: 'enc', label, run } for everything else. null when nothing is in reach.
 */
export function encounterInteract(w, P) {
  if (!P || !w.enc) return null;
  let best = null, bd = 1e9;
  const offer = (d, it) => { if (d < bd) { bd = d; best = it; } };
  for (const e of w.enc.list) {
    if (e.kind === 'outpost') { const s = e.ships[0]; if (alive(s)) { const d = Math.hypot(s.x - P.x, s.y - P.y) - s.r - P.r; if (d < 260) offer(d, { kind: 'dock', s, label: `Dock at ${s.name}` }); } }
    else if (e.kind === 'merchant') { const s = e.ships[0]; if (alive(s) && !s.angry) { const d = Math.hypot(s.x - P.x, s.y - P.y) - s.r - P.r; if (d < 240) offer(d, { kind: 'enc', label: `Trade with ${s.name}`, run: () => say(w, { t: 'merchant', e }) }); } }
    else if (e.kind === 'hulk' && e.cache && !e.cache.open) { const d = Math.hypot(e.cache.x - P.x, e.cache.y - P.y) - P.r; if (d < 200) offer(d, { kind: 'enc', label: 'Open the sealed cache', run: () => openHulk(w, e) }); }
    else if (e.kind === 'vault' && e.open && !e.cracked) { const s = e.ships[0]; const d = Math.hypot(s.x - P.x, s.y - P.y) - s.r - P.r; if (d < 260) offer(d, { kind: 'enc', label: 'Crack the vault', run: () => crackVault(w, e, s.x, s.y) }); }
    else if (e.kind === 'ruin') for (const q of e.sections) if (!q.done) { const d = Math.hypot(q.x - P.x, q.y - P.y) - P.r; if (d < 180) offer(d, { kind: 'enc', label: `Search section ${q.i + 1} of ${e.sections.length}`, run: () => searchSection(w, e, q) }); }
  }
  return best;
}

function openHulk(w, e) {
  e.cache.open = true; e.pois.forEach(p => { p.done = true; });
  const r = rng(hash(e.seed, 'hulkloot')); const { x, y } = e.cache;
  dropCache(w, e.tier + 1, x, y);
  const fake = { faction: e.faction, tier: e.tier + 1, cls: 'frigate', crew: 0, elite: true };
  for (const l of rollLoot(r, fake, w.eventLuck || 0)) if (l.kind !== 'pod') spawnPickup(w, l, x, y, 0, 0, 120);
  dropUnique(w, r, 'derelict', 0.25, x, y);
  say(w, { t: 'banner', title: 'Cache opened', text: 'The station\'s last stores float free — and a sealed cache to crack at a station.' }); say(w, { t: 'sound', id: 'rare' });
  markDone(w, e);
}

function searchSection(w, e, q) {
  q.done = true;
  const m = memOf(w, e.key); if (m && e.key) { const rec = (m[e.key] ||= {}); (rec.searched ||= []).push(q.i); }
  const r = rng(hash(e.seed, 'found', q.i)); const P = w.player;
  if (q.what === 'cache') { dropCache(w, e.tier, q.x, q.y); say(w, { t: 'toast', text: 'You find a sealed cache behind a jammed door.', kind: 'good' }); }
  else if (q.what === 'survivors') { for (let i = 0; i < 2; i++) spawnPickup(w, { kind: 'pod', n: 1 + Math.floor(r() * 2) }, q.x, q.y, 0, 0, 60); if (w.game) w.game.rep.guild = Math.min(100, (w.game.rep.guild || 0) + 3); say(w, { t: 'toast', text: 'Crew pods drift out to you.', kind: 'good' }); }
  else if (q.what === 'salvage') { dropMats(w, r, e.tier, q.x, q.y, 3); if (r() < 0.5) dropPart(w, r, e.tier, 0.3, q.x, q.y, 'common'); say(w, { t: 'toast', text: 'Old stores: salvage spills out.', kind: 'good' }); }
  else if (q.what === 'ambush') {
    const g = spawnGroup(w, { x: q.x + 500, y: q.y + 300 }, 'redfang', e.tier, r, 'pack');
    for (const s of g) s.sector = e.sector;
    say(w, { t: 'banner', title: 'It was a trap!', text: 'Scavengers were waiting for someone to come looking.' }); say(w, { t: 'sound', id: 'warn' });
  } else {
    splash(w, q.x, q.y, 140, 30 * e.tier, 'explosive', 'm', null, { noTeam: true });
    say(w, { t: 'toast', text: 'A booby trap goes off in your face!', kind: 'bad' });
    void P;
  }
  if (e.sections.every(s => s.done)) { e.pois.forEach(p => { p.done = true; }); markDone(w, e); say(w, { t: 'toast', text: 'The outpost has nothing more to give.' }); }
}

// ------------------------------------------------------------------ the wandering merchant's stock
/** Rare-and-better parts a merchant sells (fixed by its seed, so the stock stays put while you browse). */
export function merchantStock(e) {
  const r = rng(hash(e.seed, 'stock'));
  const out = [];
  for (let i = 0; i < 5; i++) out.push(rollPart(r, e.tier + 1, 1.2, 'rare'));
  return out;
}
/** Remember a bought slot so it stays sold on the next visit to the sector. */
export function merchantBought(w, e, i) {
  e.bought.push(i);
  const m = memOf(w, e.key); if (m && e.key) (m[e.key] ||= {}).bought = e.bought;
}

/** Every anomaly entry near (x, y) — for survey missions. */
export const anomaliesNear = (w, x, y, d) => (w.enc?.list || []).filter(e => ANOMALIES.includes(e.kind) && Math.hypot(e.x - x, e.y - y) < d);
