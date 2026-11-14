// Planet outposts (play-test #39, owner ruling E3). Fly over a planet and found an outpost there (raw materials
// + credits). The outpost is a small station in orbit by the planet that you dock at to manage it: build and
// upgrade modules that work while you are away — an Ore site digs the planet's ores, an R&D lab makes research
// points, a Factory makes parts (better ones when it has stored ore to use), a Trade post earns credits, Storage
// holds more, Defence turrets fight raiders (and are real guns on the station). Output piles up by play time
// (G.playTime) up to the storage cap; "Collect all" moves it into your hold.
//
//   E3  occasional WARNED raids: "Raiders heading for your outpost at Kesh II — 3 min". If you are in the system
//       when they arrive you fight them at the outpost (its turrets help) for bonus loot. If you are away the raid
//       is settled on paper by turret strength: a weak outpost loses some stored goods. Never destroyed.
//
// Save: G.colonies = [{ id, system, planet, name, tier, ores, modules:[{kind, level}], store:{ mats:{}, items:[],
// cr, rp }, acc:{}, last, founded, raid:{ at, warned, live, liveAt } }]. Quests read (g.colonies||[]).length.
//
// Pure sim + helpers that take `app` for the hooks in main.js (placeOutposts, colonyTick, planetInteract).

import { shortText, payMats } from './mats.js';
import { rng, hash, clamp, TAU } from '../core/math.js';
import { MATERIALS, matTier, matOf } from '../data/types.js';
import { BLOCKS } from '../data/blocks.js';
import { FACTIONS } from '../data/factions.js';
import { generateStation } from './shipgen.js';
import { remove, place } from './grid.js';
import { recompute } from './ship.js';
import { makeItem, rollRarity, rollLoot } from './loot.js';
import { spawnGroup } from './galaxy.js';
import { spawnPickup, cargoUsed } from './world.js';

export const MAX_LEVEL = 3;
export const RAID_WARN = 180;                       // seconds of warning before raiders arrive
const RAID_GAP = [1800, 3300];                      // seconds of play between raids (first one too)
const RAID_LIVE_MAX = 240;                          // a live raid nobody finishes is settled on paper after this
/** Price scale per material tier (tier I = danger 1-2 … tier V = danger 9-10). */
const TIER_K = [1, 1, 3, 8, 20, 50];

/**
 * Modules. `rate(level, mt)` = output per hour of play. Round 4 economy: Ore site 50 → 120 a level, Trade post
 * 300 → 800 a level (a level-1 trade post took ~2.5 hours of play to pay for itself; now under an hour).
 * `cost(level, mt)` = { cr, mats } for that level.
 * Every number the screen shows comes from here.
 */
export const MODULES = {
  ore:     { name: 'Ore site', unit: 'ore an hour', blurb: 'Digs the planet\'s ores.', rate: (L) => 120 * L },
  lab:     { name: 'R&D lab', unit: 'research points an hour', blurb: 'Research points for a station research lab.', rate: (L) => 2 * L },
  factory: { name: 'Factory', unit: 'parts an hour', blurb: 'Makes parts of this outpost\'s tier. With 15 stored ore to use, each one rolls finer.', rate: (L) => L },
  trade:   { name: 'Trade post', unit: 'credits an hour', blurb: 'Sells to the planet below.', rate: (L, mt) => 800 * L * TIER_K[mt] },
  storage: { name: 'Storage', unit: 'times the room', blurb: 'More room before output stops piling up.', rate: (L) => 1 + L },
  turrets: { name: 'Defence turrets', unit: 'turrets', blurb: 'Real guns on the station. They fight raiders, here or while you are away.', rate: (L) => 2 * L },
};
export const MODULE_IDS = Object.keys(MODULES);

/** Credits and materials (of the outpost's tier) for a module level. */
export function moduleCost(kind, level, mt) {
  const k = TIER_K[mt] || 1;
  const base = { ore: 1200, lab: 1800, factory: 2200, trade: 1500, storage: 900, turrets: 1600 }[kind] || 1000;
  const mats = { [matOf('structural', mt)]: 20 * level, [matOf('energy', mt)]: 10 * level, rock: 30 * level };
  if (level >= 3) mats[matOf('exotic', mt)] = 4;
  return { cr: Math.round(base * level * k / 50) * 50, mats };
}
/** Founding credits at tier I (× TIER_K). Round 4 economy: 2,500 was about a minute of fighting past danger 4. */
export const FOUND_CR = 5000;
/** Founding an outpost: credits + raw materials of the system's tier. */
export function foundCost(tier) {
  const mt = matTier(tier);
  return { cr: FOUND_CR * TIER_K[mt], mats: { [matOf('structural', mt)]: 40, [matOf('energy', mt)]: 20, rock: 60 } };
}
/** Missing materials / credits for a cost, as short strings ("12 more Ferrite"), or [] when affordable. */
export function shortOf(G, cost) {
  const out = [];
  if (G.credits < cost.cr) out.push(`${(cost.cr - G.credits).toLocaleString()} more cr`);
  out.push(...shortText(G.cargo, cost.mats));
  return out;
}
function pay(G, cost) { G.credits -= cost.cr; payMats(G, cost.mats); }

export const levelOf = (c, kind) => c.modules.find(m => m.kind === kind)?.level || 0;
export const colonyAt = (G, system, planet) => (G.colonies || []).find(c => c.system === system && c.planet === planet) || null;

/** Why you cannot found an outpost on this planet, or null. */
export function cannotFound(G, system, planet, tier) {
  if (!G.unlocked?.colonies) return 'Outposts unlock later';
  if (colonyAt(G, system, planet.id)) return 'You already have an outpost here';
  const s = shortOf(G, foundCost(tier)); if (s.length) return `Needs ${s.join(', ')}`;
  return null;
}
/** Found an outpost. Returns { colony } or { why }. */
export function found(G, sys, planet) {
  const why = cannotFound(G, sys.id, planet, sys.tier); if (why) return { why };
  pay(G, foundCost(sys.tier));
  G.colonies ||= [];
  const now = G.playTime || 0;
  const c = {
    id: `c${sys.id}.${planet.id}`, system: sys.id, planet: planet.id, name: `${planet.name} Outpost`, planetName: planet.name, sysName: sys.name,
    tier: sys.tier, ores: (planet.ores || []).slice(0, 3), modules: [], store: { mats: {}, items: [], cr: 0, rp: 0 }, acc: {},
    last: now, founded: now, raid: { at: now + RAID_GAP[0] + (hash(G.seed, sys.id, planet.id) % (RAID_GAP[1] - RAID_GAP[0])), warned: false, live: false },
  };
  if (!c.ores.length) c.ores = [matOf('structural', matTier(sys.tier))];
  G.colonies.push(c);
  return { colony: c };
}
/** Build or upgrade a module. Returns a refusal reason or null. */
export function buildModule(G, c, kind) {
  const L = levelOf(c, kind);
  if (!MODULES[kind]) return 'Unknown module';
  if (L >= MAX_LEVEL) return 'Already at the top level';
  produce(c, G.playTime || 0);   // what was made so far counts at the old rates
  const cost = moduleCost(kind, L + 1, matTier(c.tier));
  const s = shortOf(G, cost); if (s.length) return `Needs ${s.join(', ')}`;
  pay(G, cost);
  const m = c.modules.find(x => x.kind === kind); if (m) m.level++; else c.modules.push({ kind, level: 1 });
  return null;
}

// ------------------------------------------------------------------ output
/** How much the outpost can hold before output stops: ore units, parts, credits, research points. */
export function capOf(c) {
  const k = 1 + levelOf(c, 'storage'); const mt = matTier(c.tier);
  return { mats: 300 * k, items: 4 * k, cr: 4000 * TIER_K[mt] * k, rp: 30 * k };
}
export const storedMats = c => Object.values(c.store.mats).reduce((s, n) => s + n, 0);

/** Run the outpost's modules from c.last to `now` (play seconds). Output piles up to the storage cap. */
export function produce(c, now) {
  const dtH = Math.max(0, (now - (c.last ?? now)) / 3600); c.last = now;
  if (!dtH) return;
  const cap = capOf(c); const mt = matTier(c.tier); const acc = (c.acc ||= {});
  const S = c.store;
  // ore: round robin over the planet's ores
  const ore = levelOf(c, 'ore');
  if (ore) {
    acc.ore = (acc.ore || 0) + MODULES.ore.rate(ore) * dtH;
    let n = Math.floor(acc.ore); acc.ore -= n;
    n = Math.min(n, Math.max(0, cap.mats - storedMats(c)));
    for (let i = 0; i < n; i++) { const m = c.ores[(acc.oreI = ((acc.oreI || 0) + 1) % c.ores.length)]; S.mats[m] = (S.mats[m] || 0) + 1; }
  }
  const lab = levelOf(c, 'lab');
  if (lab) S.rp = Math.min(cap.rp, (S.rp || 0) + MODULES.lab.rate(lab) * dtH);
  const trade = levelOf(c, 'trade');
  if (trade) S.cr = Math.min(cap.cr, (S.cr || 0) + MODULES.trade.rate(trade, mt) * dtH);
  const fac = levelOf(c, 'factory');
  if (fac) {
    acc.parts = (acc.parts || 0) + MODULES.factory.rate(fac) * dtH;
    while (acc.parts >= 1) {
      acc.parts -= 1;
      if (S.items.length >= cap.items) { acc.parts = 0; break; }
      S.items.push(factoryPart(c, S));
    }
  }
}
/** One part from the factory. Uses 15 stored structural ore when there is some: better odds of a fine roll. */
function factoryPart(c, S) {
  const mt = matTier(c.tier);
  const r = rng(hash(c.id, 'fac', (c.made = (c.made || 0) + 1)));
  const ore = Object.keys(S.mats).find(m => MATERIALS[m]?.role === 'structural' && S.mats[m] >= 15);
  if (ore) { S.mats[ore] -= 15; if (!S.mats[ore]) delete S.mats[ore]; }
  const maxSize = mt >= 3 ? 2 : 1;
  const pool = Object.values(BLOCKS).filter(b => b.module && !b.core && !b.race && (b.size || 1) <= maxSize && (b.tier || 1) <= mt + 1 && b.cost?.cr);
  const def = r.pick(pool);
  const rar = rollRarity(r, c.tier, ore ? 0.6 : 0);
  return makeItem(r, def.id, rar.id);
}
/** Is there anything waiting to be picked up? */
export const hasStore = c => storedMats(c) > 0 || c.store.items.length > 0 || (c.store.cr || 0) >= 1 || (c.store.rp || 0) >= 1;

/**
 * Move everything that fits into your ship: materials up to `room` cargo units (most valuable first), every
 * part, credits, research points. Returns what moved and what was left.
 */
export function collectAll(G, c, room) {
  produce(c, G.playTime || 0);
  const S = c.store; const got = { mats: {}, n: 0, items: 0, cr: 0, rp: 0, left: 0 };
  const order = Object.keys(S.mats).sort((a, b) => (MATERIALS[b]?.price || 0) - (MATERIALS[a]?.price || 0));
  for (const m of order) {
    const n = Math.max(0, Math.min(S.mats[m], room - got.n)); if (!n) continue;
    G.cargo[m] = (G.cargo[m] || 0) + n; S.mats[m] -= n; got.mats[m] = n; got.n += n;
    if (!S.mats[m]) delete S.mats[m];
  }
  got.left = storedMats(c);
  got.items = S.items.length; G.parts.push(...S.items); S.items = [];
  got.cr = Math.floor(S.cr || 0); G.credits += got.cr; S.cr -= got.cr;
  got.rp = Math.floor(S.rp || 0); if (got.rp) { G.research ||= { points: 0, done: [] }; G.research.points = (G.research.points || 0) + got.rp; S.rp -= got.rp; }
  return got;
}

// ------------------------------------------------------------------ raids (E3)
/** Turrets on the station, and the odds they drive raiders off on their own. */
export const REPEL = [0, 0.4, 0.75, 0.95];
export const LOSS = [0.4, 0.25, 0.12, 0.06];

/** Settle a raid while you are away. Never destroys the outpost. Returns { repelled, lost:{...}, bonus }. */
export function resolveRaidAway(G, c) {
  produce(c, G.playTime || 0);
  const L = levelOf(c, 'turrets');
  const r = rng(hash(c.id, 'raid', Math.floor(c.raid?.at || 0)));
  const out = { repelled: false, lost: { mats: 0, items: 0, cr: 0 }, bonus: 0 };
  if (r() < REPEL[L]) {
    out.repelled = true;
    out.bonus = Math.round(200 * L * TIER_K[matTier(c.tier)]);
    c.store.cr = (c.store.cr || 0) + out.bonus;   // salvage from the beaten raiders (may pass the cap once)
  } else {
    const k = LOSS[L];
    for (const m of Object.keys(c.store.mats)) { const n = Math.ceil(c.store.mats[m] * k); c.store.mats[m] -= n; out.lost.mats += n; if (c.store.mats[m] <= 0) delete c.store.mats[m]; }
    const ni = Math.ceil(c.store.items.length * k); out.lost.items = ni; c.store.items.splice(0, ni);
    const cr = Math.floor((c.store.cr || 0) * k); out.lost.cr = cr; c.store.cr = (c.store.cr || 0) - cr;
  }
  nextRaid(G, c);
  return out;
}
export function nextRaid(G, c) {
  const r = rng(hash(c.id, 'next', Math.floor(G.playTime || 0)));
  c.raid = { at: (G.playTime || 0) + RAID_GAP[0] + r() * (RAID_GAP[1] - RAID_GAP[0]), warned: false, live: false };
}
/** Raid strength in words for the screen. */
export function raidOdds(c) {
  const L = levelOf(c, 'turrets');
  return L ? `${Math.round(REPEL[L] * 100)}% chance to drive raiders off while you are away; otherwise ${Math.round(LOSS[L] * 100)}% of what is stored is taken.`
    : `No turrets: raiders take ${Math.round(LOSS[0] * 100)}% of what is stored while you are away.`;
}

// ------------------------------------------------------------------ the outpost in space
/** Where an outpost orbits its planet (beside it, so the station never sits on the low-orbit surface). */
export function outpostSpot(planet, id) {
  const a = (hash(id, 'spot') % 6283) / 1000;
  return { x: planet.x + Math.cos(a) * (planet.r + 520), y: planet.y + Math.sin(a) * (planet.r + 520), a };
}

/** A station body for an outpost: the player's colours, dockable, can't be destroyed, real turrets per level. */
export function outpostBody(G, c, planet) {
  const mt = matTier(c.tier);
  const st = generateStation({ seed: hash(c.id, 'outpost'), size: 56, faction: 'guild', kind: 'trade', tier: c.tier });
  const g = st.grid;
  // a trade station may roll a gun or two: an outpost's guns are only its Defence turrets
  for (const b of g.blocks.slice()) if (b.alive && b.def.weapon) { const { x, y } = b; const n = b.def.size || 1; remove(g, b); place(g, n === 4 ? 'frame_4' : n === 2 ? 'frame_2' : 'frame', x, y); }
  const want = MODULES.turrets.rate(levelOf(c, 'turrets'));
  if (want) {
    const cx = g.w / 2, cy = g.h / 2;
    const ring = g.blocks.filter(b => b.alive && (b.def.size || 1) === 4 && !b.def.core && !b.def.weapon && !b.def.shield && Math.hypot(b.x + 2 - cx, b.y + 2 - cy) > g.w * 0.3)
      .map(b => ({ b, a: Math.atan2(b.y + 2 - cy, b.x + 2 - cx) })).sort((p, q) => p.a - q.a);
    const gun = mt >= 3 ? ['heavy_laser', 'howitzer'] : ['heavy_laser', 'flak_battery'];
    for (let i = 0; i < want && ring.length; i++) {
      const { b, a } = ring[Math.floor(i * ring.length / want)];
      if (!b.alive || !g.blocks.includes(b)) continue;
      const { x, y } = b; remove(g, b);
      const rot = Math.round(((a + TAU) % TAU) / (Math.PI / 4)) & 7;
      place(g, gun[i % 2], x, y, rot, { rarity: 'rare', mods: { dmg: c.tier * 0.15 } });
      place(g, 'frame_2', x + 2, y); place(g, 'frame_2', x, y + 2); place(g, 'frame_2', x + 2, y + 2);
    }
  }
  recompute(st);
  st.crew = st.stats.crewCap; recompute(st);
  const spot = outpostSpot(planet, c.id);
  Object.assign(st, {
    x: spot.x, y: spot.y, a: spot.a, static: true, va: 0.01,
    team: 'player', faction: 'player', palette: G.ship?.palette || null, stationKind: 'colony', dockable: true, invuln: true,
    name: c.name, colony: c.id, services: [],
  });
  return st;
}

/** Recreate your outposts in the system you just entered (main.js enterSystem). */
export function placeOutposts(G, w) {
  if (!G || !w) return;
  w.stations ||= [];
  for (const c of G.colonies || []) {
    if (c.system !== G.system) continue;
    const p = (w.planets || []).find(x => x.id === c.planet); if (!p) continue;
    const st = outpostBody(G, c, p);
    w.bodies.push(st); w.stations.push(st);   // after the system's own station, so stations[0] stays the trade station
  }
}
/** Rebuild one outpost's body (new turrets after an upgrade). */
export function refreshOutpost(app, c) {
  const w = app.w; if (!w || c.system !== app.G.system) return;
  const old = w.stations.find(s => s.colony === c.id); const p = w.planets.find(x => x.id === c.planet); if (!p) return;
  const st = outpostBody(app.G, c, p);
  if (old) { old.dead = true; old.gone = true; w.bodies = w.bodies.filter(b => b !== old); w.stations = w.stations.filter(s => s !== old); app.R?.forget?.(old.id); if (app.G.docked === old.id) app.G.docked = st.id; }
  w.bodies.push(st); w.stations.push(st);
  return st;
}

/** "Found an outpost" when you fly over a planet (main.js nearestInteract). */
export function planetInteract(app) {
  const G = app.G, w = app.w, P = app.P; if (!G?.unlocked?.colonies || !w || !P) return null;
  const p = (w.planets || []).find(q => Math.hypot(q.x - P.x, q.y - P.y) < q.r);
  if (!p || colonyAt(G, G.system, p.id)) return null;
  return { kind: 'found', p, label: `Found an outpost on ${p.name}` };
}

/**
 * Once a frame while flying (main.js). Runs production, warns of raids, starts a live raid when you are in the
 * system, settles raids on paper when you are not, and pays out a live raid you won.
 */
export function colonyTick(app, dt) {
  const G = app.G, w = app.w; if (!G || !w) return;
  app.colT = (app.colT || 0) - dt; if (app.colT > 0) return; app.colT = 1;
  const now = G.playTime || 0;
  const lines = [];
  for (const c of G.colonies || []) {
    produce(c, now);
    c.raid ||= { at: now + RAID_GAP[0], warned: false, live: false };
    const R = c.raid;
    const here = c.system === G.system;
    const st = here ? w.stations?.find(s => s.colony === c.id) : null;
    if (st) st.name = R.warned && !R.live ? `${c.name} (raiders coming)` : R.live ? `${c.name} (under attack)` : c.name;
    if (R.live) {
      const raiders = (w.raiders || []).filter(s => s.raidOf === c.id);
      if (!here || !raiders.length) { settleAway(app, c); continue; }                      // you left mid-fight
      if (raiders.every(s => s.dead)) { winRaid(app, c, st); continue; }
      if (now - R.liveAt > RAID_LIVE_MAX) { for (const s of raiders) if (!s.dead) { s.dead = true; s.gone = true; } settleAway(app, c); continue; }
      lines.push(`<b class="bad">Raid at ${c.planetName}</b>`);
      continue;
    }
    if (!R.warned && now >= R.at - RAID_WARN) {
      R.warned = true;
      app.banner?.(`Raiders heading for your outpost at ${c.planetName}`, `${Math.max(1, Math.round((R.at - now) / 60))} min. ${here ? 'Stay and fight them off for loot.' : 'Its turrets will have to hold.'}`);
    }
    if (R.warned && now < R.at) lines.push(`<b class="bad">Raid on ${c.planetName} ${clock(R.at - now)}</b>`);
    if (now >= R.at) {
      if (here && st && app.mode === 'fly') startRaid(app, c, st);
      else settleAway(app, c);
    }
  }
  app.hudRaid = lines.slice(0, 1).join(' ');
}
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function startRaid(app, c, st) {
  const w = app.w; const r = rng(hash(c.id, 'raiders', Math.floor(c.raid.at)));
  const pool = ['redfang'].concat(c.tier >= 3 ? ['vesh'] : [], c.tier >= 5 ? ['lattice', 'kharr'] : []);
  const f = r.pick(pool);
  const a = r() * TAU; const d = st.r + 1400;
  const ships = spawnGroup(w, { x: st.x + Math.cos(a) * d, y: st.y + Math.sin(a) * d }, f, c.tier, r, 'pack');
  w.raiders ||= [];
  for (const s of ships) { s.raidOf = c.id; s.ai = { t: 0, orbit: 1, home: { x: st.x, y: st.y }, target: st, look: 2 }; w.raiders.push(s); }
  c.raid.live = true; c.raid.liveAt = app.G.playTime || 0;
  app.banner?.(`Raiders at ${c.planetName}`, `${ships.length} ${FACTIONS[f]?.short || ''} ships. Drive them off for their loot.`);
}
function winRaid(app, c, st) {
  const G = app.G, w = app.w;
  const r = rng(hash(c.id, 'win', Math.floor(c.raid.at)));
  const bonus = Math.round(400 * TIER_K[matTier(c.tier)]);
  G.credits += bonus;
  // a loot crate from the raid boss
  const fake = { faction: 'redfang', tier: c.tier + 1, cls: 'frigate', crew: 0, elite: true };
  for (const l of rollLoot(r, fake)) if (l.kind !== 'pod') spawnPickup(w, l, st.x + st.r + 120, st.y, 0, 0, 160);
  app.banner?.('Raid beaten', `Your outpost at ${c.planetName} is safe. +${bonus.toLocaleString()} cr, and the raiders' cargo is yours.`);
  nextRaid(G, c);
}
function settleAway(app, c) {
  const res = resolveRaidAway(app.G, c);
  if (res.repelled) app.banner?.(`Outpost ${c.planetName} held`, `Its turrets drove the raiders off. +${res.bonus.toLocaleString()} cr salvage in its store.`);
  else app.banner?.(`Outpost ${c.planetName} was raided`, res.lost.mats + res.lost.items + res.lost.cr ? `They took ${res.lost.mats} ore, ${res.lost.items} parts and ${res.lost.cr.toLocaleString()} cr. More turrets keep more.` : 'There was nothing stored for them to take.');
}

/** For the HUD and tests: stored materials worth in credits. */
export const storeValue = c => Object.entries(c.store.mats).reduce((s, [m, n]) => s + (MATERIALS[m]?.price || 1) * n, 0) + (c.store.cr || 0);
export { cargoUsed, clamp };
