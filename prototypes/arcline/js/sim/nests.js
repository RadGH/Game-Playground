// The threat (PLAN §0 'Threats', 'No shooting over walls'): alien wildlife from nests. No set waves — constant
// pressure: creatures leave the nests all the time (more as the city grows, as nests get angry, and at night), probe
// the walls along the path map and chew in where defence is thin; now and then a big swarm, ANNOUNCED a few seconds
// ahead with its direction (lessons rule 39: never punish what the player couldn't see). Nests spread over time,
// get angrier when you build or mine near them, and clearing one (turrets in range, orbital strikes) frees its land.
// Also: the path map for the citykit horde built from a region, and syncing wall/building damage back into it.
//
// Pure, seeded. The creatures themselves live in citykit/js/world/horde.js (flocking, chewing, THE blast rule);
// this file only says WHEN and WHERE they come out and keeps the region in step with the path map.
import { T } from './tuning.js';
import { item } from './catalog.js';
import { reindexLots } from './build.js';
import { rng } from '../../../../citykit/js/kit/rng.js';
import { Grid, T as K } from '../../../../citykit/js/world/field.js';
import { TURRETS } from '../../../../citykit/js/world/defence.js';
import { fmt } from '../../../../shared/format.js';

const dayLen = () => Math.max(0.1, T.dayLengthSec ?? 6);

// ---------------------------------------------------------------- day / night
/** Where the day/night cycle is: phase 0..1 (0 = dawn, 0.25 noon, 0.5 dusk, 0.75 midnight), night 0..1 (0 all
 *  day, peaks at midnight), isNight. One cycle = T.dayNightDays game days. */
export function dayNight(r) {
  const phase = (((r.day || 0) / Math.max(0.1, T.dayNightDays ?? 4)) % 1 + 1) % 1;
  const night = Math.max(0, -Math.sin(phase * Math.PI * 2));
  return { phase, night, isNight: phase >= 0.5 };
}

// ---------------------------------------------------------------- state
/** Fill in the threat fields (safe to call every tick). */
export function ensureThreat(r) {
  const t = r.threat || (r.threat = {});
  const start = r.foundedDay ?? 0;
  t.acc ??= 0; t.rolls ??= 0; t.spawned ??= 0; t.cleared ??= 0; t.swarm ??= null;
  t.calmUntil ??= start + (T.calmDays ?? 6);
  t.nextSpread ??= t.calmUntil + (T.nestSpreadDays ?? 18);
  t.nextSwarm ??= t.calmUntil + (T.swarmEveryDays ?? 14) * 0.8;
  t.angerDay ??= -1;
  for (const n of r.nests) { n.hp ??= 1; n.angry ??= 0; n.size ??= 1; }
  return t;
}
function roll(r) { const t = r.threat; t.rolls = (t.rolls || 0) + 1; return rng((r.seed || 1) * 6151 + t.rolls * 92821); }
/** A nest's full health in damage points (bigger nests are tougher). n.hp is the share left, 0..1. */
export const nestMaxHp = n => (T.nestHp ?? 1500) * (0.6 + (n.size ?? 1) * 0.6);
/** Days of calm left after founding (0 = creatures have noticed the city). */
export function calmLeft(r) { return Math.max(0, ensureThreat(r).calmUntil - r.day); }

// ---------------------------------------------------------------- the tick
/** Creature kind odds. Breakers after the calm settles, sappers once you have walls, brutes from milestone 2. */
export function kindOdds(r, night = 0) {
  const walls = hasWalls(r), t = r.threat;
  return {
    swarmer: 1,
    breaker: r.day > t.calmUntil + 8 || r.milestone >= 1 ? 0.22 : 0,
    sapper: walls ? 0.14 : 0,
    brute: r.milestone >= 2 ? 0.035 * (1 + night) : 0,
  };
}
function hasWalls(r) { const w = r.tiles.wall; for (let i = 0; i < w.length; i++) if (w[i]) return true; return false; }

/** Steady creatures per game day right now (before the calm check): T.spawnPerDay × pressure × city size × anger × night. */
export function spawnRate(r) {
  if (!r.nests.length) return 0;
  const { night } = dayNight(r);
  const anger = r.nests.reduce((s, n) => s + n.angry, 0) / r.nests.length;
  const size = 1 + Math.sqrt(Math.max(0, r.people.total) / 200);
  const nests = Math.min(1.5, 0.4 + 0.15 * r.nests.length);
  // anger at most triples the stream (a game day is only a few real seconds — keep this a trickle you can hold)
  return (T.spawnPerDay ?? 0.35) * (T.pressure ?? 1) * (r.pressureMul ?? 1) * size * (1 + Math.min(2, anger * 0.5)) * nests * (1 + ((T.nightBoldness ?? 1.6) - 1) * night);
}

/**
 * Advance the threat to r.day (call after the clock moved; small steps are fine — fractions build up).
 * opts.field: the current path map (makeField) — nests with no way to the city send nobody (they'd idle forever).
 * opts.alive: creatures alive now — the steady stream pauses at T.creatureCap (announced swarms still come).
 * → { spawns: [{ kind, x, z, nest, swarm? }], events: [...] }. Events:
 *   { type: 'swarm-warning', x, z, dir, angle, count, inSec, text }   a big swarm is coming (seconds at 1×)
 *   { type: 'swarm', x, z, dir, count, text }                          it set out (its spawns are in this result)
 *   { type: 'nest-spread', x, z, from: {x, z}, text }
 *   { type: 'calm-over', text }
 */
export function nestsTick(r, days, { field = null, alive = 0 } = {}) {
  const t = ensureThreat(r), out = { spawns: [], events: [] };
  if (!r.founded) return out;
  if (r.day < t.calmUntil) return out;
  if (!t.calmOver) { t.calmOver = true; out.events.push({ type: 'calm-over', text: 'The wildlife has noticed the city. Expect creatures at the walls.' }); }
  // once a game day: anger toward building/mining, nests grow a little
  if (Math.floor(r.day) !== t.angerDay) { const steps = t.angerDay < 0 ? 1 : Math.min(30, Math.floor(r.day) - t.angerDay); t.angerDay = Math.floor(r.day); stir(r, steps); }
  // spreading
  if (r.day >= t.nextSpread) {
    const R = roll(r); const kid = spread(r, R);
    if (kid) out.events.push({ type: 'nest-spread', x: kid.x, z: kid.z, from: kid.from, text: `A new nest has appeared ${where(r, kid.x, kid.z).dir === 'here' ? 'near the city' : `to the ${where(r, kid.x, kid.z).dir}`}.` });
    t.nextSpread = r.day + (T.nestSpreadDays ?? 18) * R.range(0.8, 1.2);
  }
  // steady pressure
  t.acc += spawnRate(r) * days;
  const { night } = dayNight(r);
  const live = field ? r.nests.filter(n => reachable(field, n)) : r.nests;
  if (alive >= (T.creatureCap ?? 300) || !live.length) t.acc = Math.min(t.acc, 1);
  else if (t.acc >= 1) {
    const R = roll(r), odds = kindOdds(r, night);
    while (t.acc >= 1) { t.acc -= 1; const n = pickNest(r, R, live); out.spawns.push({ kind: pick(R, odds), ...spot(r, R, n, 1.2), nest: r.nests.indexOf(n) }); }
  }
  // big swarms: announce, then launch
  if (!t.swarm && r.day >= t.nextSwarm && live.length) {
    const R = roll(r);
    const n = live.slice().sort((a, b) => (b.angry + b.size) - (a.angry + a.size))[R.int(0, Math.min(2, r.nests.length - 1))];
    const count = Math.round((T.swarmSize ?? 30) * (T.pressure ?? 1) * (r.pressureMul ?? 1) * (1 + Math.sqrt(r.people.total / 500)) * (1 + 0.3 * night));
    const w = where(r, n.x, n.z), inSec = T.swarmWarnSec ?? 10;
    t.swarm = { at: r.day + inSec / dayLen(), x: n.x, z: n.z, count, dir: w.dir, angle: w.angle };
    t.nextSwarm = r.day + (T.swarmEveryDays ?? 14) * R.range(0.7, 1.3);
    out.events.push({ type: 'swarm-warning', x: n.x, z: n.z, dir: w.dir, angle: w.angle, count, inSec, text: `A big swarm is coming from the ${w.dir} in ${fmt(inSec)} s — about ${fmt(count)} creatures.` });
  }
  if (t.swarm && r.day >= t.swarm.at) {
    const s = t.swarm, R = roll(r); t.swarm = null;
    const odds = { swarmer: 1, breaker: 0.25, sapper: hasWalls(r) ? 0.18 : 0, brute: r.milestone >= 2 ? 0.06 : 0 };
    for (let k = 0; k < s.count; k++) out.spawns.push({ kind: pick(R, odds), ...spot(r, R, s, 3), swarm: true });
    out.events.push({ type: 'swarm', x: s.x, z: s.z, dir: s.dir, count: s.count, text: `The swarm from the ${s.dir} is moving: ${fmt(s.count)} creatures.` });
  }
  t.spawned += out.spawns.length;
  return out;
}

/** Nests notice what's built near them (outposts — mining — count three times) and calm down slowly when left alone. */
function stir(r, steps) {
  const N = r.size, rad = T.nestNoticeRadius ?? 16, outs = r.lots.filter(l => item(l.id)?.deposit);
  for (const n of r.nests) {
    let s = 0;
    for (let z = Math.max(0, Math.floor(n.z - rad)); z < Math.min(N, n.z + rad); z += 2) for (let x = Math.max(0, Math.floor(n.x - rad)); x < Math.min(N, n.x + rad); x += 2) {
      const i = z * N + x; if (!(r.tiles.lot[i] >= 0 || r.tiles.wall[i] || r.tiles.road[i])) continue;
      const d = Math.hypot(x - n.x, z - n.z); if (d < rad) s += 1 - d / rad;
    }
    for (const o of outs) { const d = Math.hypot(o.x + o.w / 2 - n.x, o.z + o.d / 2 - n.z); if (d < rad) s += 6 * (1 - d / rad); }
    const want = (T.expansionAnger ?? 1) * Math.min(3, s / 12);
    for (let k = 0; k < steps; k++) n.angry += (want - n.angry) * 0.12;
    n.size = Math.min(1.6, n.size + 0.01 * steps);
  }
}
function spread(r, R) {
  const cap = Math.round((T.nestCap ?? 14) * (r.size / 64) ** 2);
  if (!r.nests.length || r.nests.length >= cap) return null;
  const parent = pickWeighted(R, r.nests, n => 0.5 + n.angry + n.size);
  for (let tries = 0; tries < 40; tries++) {
    const ang = R() * Math.PI * 2, d = R.range(5, 11), x = Math.round(parent.x + Math.cos(ang) * d), z = Math.round(parent.z + Math.sin(ang) * d);
    if (!nestSpotOk(r, x, z) || crossesWall(r, parent.x, parent.z, x, z)) continue;
    const kid = { x, z, size: 0.6, grow: 0, hp: 1, angry: parent.angry * 0.5, born: Math.round(r.day) };
    r.nests.push(kid);
    return { ...kid, from: { x: parent.x, z: parent.z } };
  }
  return null;
}
/** Does the straight line between two tiles cross a wall or water? (nests never spread past your walls or a river) */
function crossesWall(r, x0, z0, x1, z1) {
  const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) * 2);
  for (let k = 1; k <= n; k++) { const x = Math.round(x0 + (x1 - x0) * k / n), z = Math.round(z0 + (z1 - z0) * k / n), i = z * r.size + x; if (r.tiles.wall[i] || r.ter.water[i]) return true; }
  return false;
}
/** Can a nest take this tile? Dry land, far from the core, from other nests and from every building and turret
 *  (T.nestBuildingClear tiles: wildlife never moves in among your streets), no road or wall within 3 tiles. */
export function nestSpotOk(r, x, z) {
  const N = r.size; if (x < 3 || z < 3 || x >= N - 3 || z >= N - 3) return false;
  if (r.ter.water[z * N + x] || r.ter.deposit[z * N + x]) return false;
  if (r.core && Math.hypot(x - (r.core.x + 1.5), z - (r.core.z + 1.5)) < (T.nestCoreClear ?? 22)) return false;
  if (r.nests.some(n => Math.hypot(n.x - x, n.z - z) < 6)) return false;
  for (let k = -3; k <= 3; k++) for (let j = -3; j <= 3; j++) { const i = (z + k) * N + x + j; if (r.tiles.lot[i] >= 0 || r.tiles.wall[i] || r.tiles.road[i]) return false; }
  const clear = T.nestBuildingClear ?? 8;
  if (r.lots.some(l => Math.hypot(Math.max(l.x - x, 0, x - (l.x + l.w - 1)), Math.max(l.z - z, 0, z - (l.z + l.d - 1))) < clear)) return false;
  if (r.turrets.some(t => Math.hypot(t.x - x, t.z - z) < clear)) return false;
  return true;
}
/** Nests closer to the city and angrier send more of the steady stream. */
/** Is there a way from this nest to the city on the path map? (walls count — creatures chew through them) */
export function reachable(field, n) { const i = field.i(Math.min(field.w - 1, Math.max(0, n.x)), Math.min(field.d - 1, Math.max(0, n.z))); return Number.isFinite(field.dist[i]); }
function pickNest(r, R, list = r.nests) { const c = centre(r); return pickWeighted(R, list, n => (0.5 + n.angry) * n.size / (1 + Math.hypot(n.x - c.x, n.z - c.z) / 40)); }
function spot(r, R, n, rad) {
  const N = r.size;
  for (let k = 0; k < 8; k++) { const x = n.x + 0.5 + R.range(-rad, rad), z = n.z + 0.5 + R.range(-rad, rad), tx = Math.floor(x), tz = Math.floor(z); if (tx >= 0 && tz >= 0 && tx < N && tz < N && !r.ter.water[tz * N + tx] && r.tiles.lot[tz * N + tx] < 0 && !r.tiles.wall[tz * N + tx]) return { x, z }; }
  return { x: n.x + 0.5, z: n.z + 0.5 };
}
function pick(R, odds) { const e = Object.entries(odds).filter(([, v]) => v > 0); const tot = e.reduce((s, [, v]) => s + v, 0); let x = R() * tot; for (const [k, v] of e) { x -= v; if (x <= 0) return k; } return e[0][0]; }
function pickWeighted(R, list, w) { const ws = list.map(w), tot = ws.reduce((a, b) => a + b, 0); let x = R() * tot; for (let i = 0; i < list.length; i++) { x -= ws[i]; if (x <= 0) return list[i]; } return list[list.length - 1]; }
const centre = r => r.core ? { x: r.core.x + 1.5, z: r.core.z + 1.5 } : { x: r.size / 2, z: r.size / 2 };
const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
/** Compass direction from the city centre to (x, z) on the region map (north = up the map = −z, east = +x).
 *  angle is radians in map space (atan2(dz, dx)) so the UI can turn it with the camera rotation. */
export function where(r, x, z) {
  const c = centre(r), dx = x - c.x, dz = z - c.z;
  if (Math.hypot(dx, dz) < 4) return { dir: 'here', angle: 0 };
  const angle = Math.atan2(dz, dx); const k = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return { dir: DIRS[k], angle };
}

// ---------------------------------------------------------------- hurting nests
/** Damage every nest inside a circle (orbital strikes, blasts): full inside the inner third, half at the edge. A nest at 0 is
 *  cleared — its land is free. Being hit makes the survivors angry. → { hit, cleared: [{ x, z }] } */
export function damageNests(r, x, z, radius, damage) {
  ensureThreat(r);
  let hit = 0; const cleared = [];
  for (const n of [...r.nests]) {
    const d = Math.hypot(n.x + 0.5 - x, n.z + 0.5 - z); if (d > radius + 0.5) continue;
    hit++; const share = 1 - 0.5 * Math.min(1, Math.max(0, d - radius * 0.35) / Math.max(0.01, radius * 0.65));   // full inside the core, half at the edge
    n.hp -= damage * share / nestMaxHp(n); n.angry = Math.min(4, n.angry + 0.4);
    if (n.hp <= 0) { clearNest(r, n); cleared.push({ x: n.x, z: n.z }); }
  }
  return { hit, cleared };
}
export function clearNest(r, n) {
  const i = r.nests.indexOf(n); if (i < 0) return false;
  r.nests.splice(i, 1); r.threat.cleared++;
  r.log?.push({ day: Math.round(r.day), text: 'A nest was cleared. Its land is free to build on.', kind: 'nest' });
  r.dirty = true;   // land value lifts (city.solveLandValue reads r.nests)
  return true;
}
/** Powered turrets in reach of a nest wear it down over time (the steady siege); range from citykit TURRETS.
 *  rangeMul lets a merchant blueprint stretch it. → { cleared: [{ x, z }] } */
export function siegeNests(r, days, rangeMul = 1) {
  const cleared = [], sec = days * dayLen();
  for (const t of r.turrets) {
    const s = TURRETS[t.kind]; if (!s || (t.powered ?? 1) <= 0) continue;
    const dps = s.damage * (s.chain ? 2 : 1) / s.every * 0.5 * Math.min(1, t.powered ?? 1);
    const n = r.nests.find(n => Math.hypot(n.x - t.x, n.z - t.z) <= s.range * rangeMul + 0.5);
    if (!n) continue;
    n.hp -= dps * sec / nestMaxHp(n); n.angry = Math.min(4, n.angry + 0.02 * days);
    if (n.hp <= 0) { clearNest(r, n); cleared.push({ x: n.x, z: n.z }); }
  }
  return { cleared };
}
/** For the UI: each nest's health and mood in words. */
export function nestView(r) {
  ensureThreat(r);
  return r.nests.map(n => {
    const mood = n.angry < 0.4 ? 'calm' : n.angry < 1.2 ? 'restless' : n.angry < 2.2 ? 'angry' : 'furious';
    return { x: n.x, z: n.z, size: n.size, hpPct: Math.max(0, Math.round(n.hp * 100)), mood, text: `Nest — ${mood}, ${Math.max(0, Math.round(n.hp * 100))}% health` };
  });
}
/** Threat panel numbers: steady creatures a minute (1×), calm left, the announced swarm if any. */
export function threatView(r) {
  const t = ensureThreat(r), calm = calmLeft(r);
  return {
    calmSec: Math.ceil(calm * dayLen()), nests: r.nests.length,
    perMinute: calm > 0 ? 0 : Math.round(spawnRate(r) / dayLen() * 60),
    swarm: t.swarm ? { dir: t.swarm.dir, count: t.swarm.count, inSec: Math.max(0, Math.ceil((t.swarm.at - r.day) * dayLen())) } : null,
    night: dayNight(r).isNight,
  };
}

// ---------------------------------------------------------------- the path map
/**
 * The citykit path map (field.js Grid) for this region, solved: water blocks (creatures don't swim) except road tiles
 * over water (bridges); walls and gates are WALL with their hp from r.tiles.wallHp; lots and turrets are BUILDING
 * (T.buildingHp / T.turretHp a tile; the core 3×). Goals = every lot and turret tile, so creatures head for the
 * nearest part of the city. grid.src remembers what each tile was so syncField can tell what broke.
 * Rebuild it (and set horde.grid) when walls/buildings change (r.wallsChanged / r.dirty).
 */
export const SRC = { NONE: 0, WALL: 1, LOT: 2, TURRET: 3 };
export function makeField(r) {
  const N = r.size, g = new Grid(N, N); g.src = new Uint8Array(N * N);
  const bHp = T.buildingHp ?? 600, tHp = T.turretHp ?? 300;
  for (let i = 0; i < N * N; i++) {
    if (r.ter.water[i]) { g.kind[i] = r.tiles.road[i] ? K.BRIDGE : K.WATER; continue; }
    if (r.tiles.wall[i]) { g.kind[i] = K.WALL; g.hp[i] = r.tiles.wallHp[i] || 1; g.src[i] = SRC.WALL; continue; }
    const li = r.tiles.lot[i];
    if (li >= 0) { g.kind[i] = K.BUILDING; g.hp[i] = bHp * (r.lots[li]?.id === 'col-core' ? 3 : 1); g.src[i] = SRC.LOT; }
  }
  for (const t of r.turrets) { const i = t.z * N + t.x; g.kind[i] = K.BUILDING; g.hp[i] = tHp; g.src[i] = SRC.TURRET; }
  g.goals = fieldGoals(r);
  g.solve(g.goals);
  r.wallsChanged = false;
  return g;
}
export function fieldGoals(r) {
  const out = [];
  for (const l of r.lots) for (let k = 0; k < l.d; k++) for (let j = 0; j < l.w; j++) out.push([l.x + j, l.z + k]);
  for (const t of r.turrets) out.push([t.x, t.z]);
  if (!out.length && r.core) out.push([r.core.x + 1, r.core.z + 1]);
  return out;
}
/**
 * Copy what the creatures did to the path map back into the region: wall hp, broken walls removed, wrecked buildings
 * and turrets removed (the Colony Core is never removed — it's battered, then patched up). Call every few steps.
 * → { changed, events: [{ type: 'wall-broken'|'building-wrecked'|'turret-wrecked'|'core-hit', x, z, … }] }
 * If changed, rebuild the field (makeField) and hand it to the horde.
 */
export function syncField(r, g) {
  const N = r.size, ev = [], wreck = new Set(); let changed = false;
  const t = ensureThreat(r);
  for (let i = 0; i < N * N; i++) {
    const src = g.src[i]; if (!src) continue;
    const x = i % N, z = (i / N) | 0, broken = g.kind[i] !== K.WALL && g.kind[i] !== K.BUILDING;
    if (src === SRC.WALL) {
      if (!broken) { r.tiles.wallHp[i] = g.hp[i]; continue; }
      r.tiles.wall[i] = 0; r.tiles.wallHp[i] = 0; g.src[i] = 0; changed = true; t.lastBreach = r.day;
      ev.push({ type: 'wall-broken', x, z });
    } else if (src === SRC.TURRET && broken) {
      const tu = r.turrets.find(q => q.x === x && q.z === z);
      r.turrets = r.turrets.filter(q => q !== tu); g.src[i] = 0; changed = true;
      ev.push({ type: 'turret-wrecked', x, z, kind: tu?.kind });
    } else if (src === SRC.LOT && broken) {
      const li = r.tiles.lot[i], lot = r.lots[li]; if (!lot) { g.src[i] = 0; continue; }
      if (lot.id === 'col-core') {
        lot.hp = Math.max(0, (lot.hp ?? 1) - 0.25); g.kind[i] = K.BUILDING; g.hp[i] = (T.buildingHp ?? 600) * 3;
        ev.push({ type: 'core-hit', x, z, hp: lot.hp, text: 'Creatures are battering the Colony Core!' });
      } else wreck.add(li);
    } else if (src === SRC.LOT) {
      const lot = r.lots[r.tiles.lot[i]]; if (lot && lot.id !== 'col-core') lot.hp = Math.min(lot.hp ?? 1, g.hp[i] / (T.buildingHp ?? 600));
    }
  }
  if (wreck.size) {
    for (const li of wreck) {
      const l = r.lots[li]; const e = item(l.id);
      ev.push({ type: 'building-wrecked', x: l.x, z: l.z, w: l.w, d: l.d, id: l.id, name: e?.name || (l.zone === 'R' ? 'Homes' : l.zone === 'C' ? 'Shops' : l.zone === 'I' ? 'Industry' : 'A building') });
      for (let k = 0; k < l.d; k++) for (let j = 0; j < l.w; j++) { const i = (l.z + k) * N + l.x + j; g.src[i] = 0; g.kind[i] = K.LAND; g.hp[i] = 0; }
    }
    r.lots = r.lots.filter((_, idx) => !wreck.has(idx)); reindexLots(r); changed = true; t.lastBreach = r.day;
  }
  if (changed) { r.dirty = true; r.wallsChanged = true; }
  return { changed, events: ev };
}
