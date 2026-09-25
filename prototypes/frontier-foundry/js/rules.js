// Every formula and constant in one place, so balance is one file to read.
// Pure functions only - no state, no randomness except what you pass in.

export const TICK = 1;                     // the fixed step tick() expects, in game seconds
export const SECONDS_PER_HOUR = 3600;

export const DIFFICULTY = {
  easy:   { waveBudget: 0.7,  enemyHp: 0.8, enemyDps: 0.8, buildSpeed: 1.25, extract: 1.2, research: 1.2 },
  normal: { waveBudget: 1.0,  enemyHp: 1.0, enemyDps: 1.0, buildSpeed: 1.0,  extract: 1.0, research: 1.0 },
  hard:   { waveBudget: 1.45, enemyHp: 1.3, enemyDps: 1.25, buildSpeed: 0.85, extract: 0.85, research: 0.85 },
};

/** How a phase maps to the kind of vehicle that can carry it. */
export const PHASE_TRANSPORT = { solid: 'solid', liquid: 'liquid', gas: 'gas' };

/** Terrain move cost for one local tile: biome move cost scaled by slope, water impassable on the ground. */
export function tileCost(map, i) {
  if (map.water[i]) return Infinity;
  return map.moveCost[i];
}

/** Tiles per second for a vehicle on one tile. Air ignores everything; ground pays terrain and gains on road. */
export function vehicleSpeedOn(vehicleDef, map, i, { roadTier = 0 } = {}) {
  if (vehicleDef.class === 'air') return vehicleDef.baseSpeed;
  const road = roadTier > 0 ? (map.roadSpeed[roadTier] ?? 1) : 1;
  const terrain = roadTier > 0 ? 1 : Math.pow(Math.max(1, map.moveCost[i]), vehicleDef.offroad ?? 0.7);
  return Math.max(0.15, vehicleDef.baseSpeed * road / terrain);
}

/** Seconds for a vehicle to walk a path of tile indices. */
export function pathTime(vehicleDef, map, path) {
  let t = 0;
  for (let k = 1; k < path.length; k++) {
    const i = path[k];
    const diag = Math.abs((path[k] % map.width) - (path[k - 1] % map.width)) === 1 && Math.abs(((path[k] / map.width) | 0) - ((path[k - 1] / map.width) | 0)) === 1;
    t += (diag ? 1.414 : 1) / vehicleSpeedOn(vehicleDef, map, i, { roadTier: map.road[i] });
  }
  return t;
}

/** One full out-and-back cycle for a route, including load and unload. */
export function cycleTime(vehicleDef, tripSeconds, { loadSpeed = 1 } = {}) {
  return tripSeconds * 2 + (vehicleDef.loadTime + vehicleDef.unloadTime) / Math.max(0.25, loadSpeed);
}

/** Units per second a route moves, ignoring whether the source can keep up. */
export function routeThroughput(vehicleDef, tripSeconds, opts = {}) {
  return vehicleDef.capacity / cycleTime(vehicleDef, tripSeconds, opts);
}

/** Build work per second one builder does. Workshops nearby add their bonus. */
export function builderRate(unitDef, { workshopBonus = 0, difficulty = 'normal' } = {}) {
  return (unitDef.buildRate ?? 1) * (1 + workshopBonus) * DIFFICULTY[difficulty].buildSpeed;
}

/** Extraction per second for a drill on a node. */
export function extractRate(structDef, { richness = 1, power = 1, techBonus = 1, difficulty = 'normal' } = {}) {
  return (structDef.extractRate || 0) * richness * power * techBonus * DIFFICULTY[difficulty].extract;
}

/** Seconds one craft takes on a machine at the given power satisfaction. */
export function craftTime(recipe, structDef, { power = 1, techSpeed = 1 } = {}) {
  const speed = Math.max(0.05, (structDef.speed ?? 1) * techSpeed * Math.max(0.1, power));
  return recipe.time / speed;
}

/** Grid satisfaction: 0..1. Batteries top up a deficit while they have charge. */
export function gridSatisfaction(gen, use, batteryDraw = 0) {
  if (use <= 0) return 1;
  return Math.max(0, Math.min(1, (gen + batteryDraw) / use));
}

/** Damage after armour. Armour subtracts flat, piercing cancels armour, nothing goes below 10%. */
export function damageAfterArmor(raw, armor = 0, pierce = 0) {
  const effective = Math.max(0, armor - pierce);
  return Math.max(raw * 0.1, raw - effective);
}

/** Threat earned per second by the base right now. */
export function threatRate(pollution, noise, nests, cfg) {
  return pollution * cfg.perPollutionUnit + noise * cfg.perNoiseUnit + nests * cfg.perNestPerSecond;
}

/** How many threat points a wave is allowed to spend. */
export function waveBudget(waveNumber, threat, cfg, difficulty = 'normal') {
  const base = cfg.base * Math.pow(cfg.growth, waveNumber - 1) + threat * cfg.threatShare;
  const surge = waveNumber % (cfg.surgeEvery || 5) === 0 ? 1 : 1;
  return Math.min(cfg.cap, base * surge * (cfg.difficulty[difficulty] ?? 1));
}

/** Seconds until the next wave after this one. */
export function waveInterval(waveNumber, cfg, rng = () => 0.5) {
  const base = Math.max(cfg.min, cfg.base - cfg.shrinkPerWave * waveNumber);
  return base * (1 + (rng() - 0.5) * 2 * cfg.jitter);
}

/** Enemy stat scaling by wave number. */
export function enemyScale(waveNumber, cfg) {
  return {
    hp: 1 + cfg.hpPerWave * (waveNumber - 1),
    armor: cfg.armorPerWave * (waveNumber - 1),
    speed: 1 + cfg.speedPerWave * (waveNumber - 1),
  };
}

/** Daylight 0..1 for a planet at a given time. dayLength is in game seconds. */
export function daylight(time, dayLength = 1200) {
  const t = (time % dayLength) / dayLength;                 // 0 = dawn
  return Math.max(0, Math.sin(t * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5);
}

/** Is it night right now? */
export const isNight = (time, dayLength) => daylight(time, dayLength) < 0.2;

/** Research progress per second from a set of labs. */
export function researchRate(labs, { power = 1, techBonus = 1, difficulty = 'normal' } = {}) {
  let r = 0;
  for (const l of labs) r += (l.rate || 1) * (l.power ?? power);
  return r * techBonus * DIFFICULTY[difficulty].research;
}

// ---------------------------------------------------------------------------- balance
//
// Every number a designer is likely to want to change lives in `data/balance.json` rather than
// being scattered through the other data files. `applyBalance` folds that file onto the loaded data
// once, at load time, so the rest of the engine keeps reading `def.cost`, `recipe.time` and so on
// and never has to know balance.json exists.
//
//   import { applyBalance, BALANCE } from './rules.js';
//   applyBalance(data, balanceJson);      // data.js does this for you
//
// BALANCE is the live copy: engine code that needs a raw knob (road speeds, hazard timings, the
// bot's stock targets) reads it from here.

/** Road speed multiplier per road tier (index 0 = no road). Mutated in place by applyBalance. */
export const ROAD_SPEED = [1, 1.2, 1.65, 2.65, 3.4];

/** The live balance table. Replaced wholesale by applyBalance; never reassign the binding. */
export const BALANCE = {
  version: 'built-in defaults',
  map: { roadSpeed: ROAD_SPEED, nodeAmount: 1, rareNodeAmount: 1, scarceNodeAmount: 0.55, scarceNodeWeight: 0.35 },
  economy: { extractRate: 1, craftSpeed: 1, buildSpeed: 1, researchRate: 1 },
  hazards: {},
  quests: {},
  structures: {}, recipes: {}, techs: {}, vehicles: {}, resources: {}, units: {},
};

/** Merge `patch` onto `target` in place. Plain objects merge, everything else replaces. */
function mergeInto(target, patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) mergeInto(target[k], v);
    else target[k] = Array.isArray(v) ? v.slice() : v;
  }
  return target;
}

/** Multiply every value of a `{ resource: n }` cost table, rounding up so nothing becomes free. */
function scaleCost(cost, mult) {
  const out = {};
  for (const [k, n] of Object.entries(cost || {})) out[k] = Math.max(1, Math.round(n * mult));
  return out;
}

/**
 * Fold balance.json onto an indexed data bundle. Safe to run more than once on the same data as
 * long as you hand it the same balance file - overrides are absolute values, not deltas, and the
 * category multipliers are applied from a remembered original.
 */
export function applyBalance(data, balance) {
  if (!balance) return data;
  mergeInto(BALANCE, balance);
  if (balance.map?.roadSpeed) { ROAD_SPEED.length = 0; ROAD_SPEED.push(...balance.map.roadSpeed); BALANCE.map.roadSpeed = ROAD_SPEED; }

  // remember the shipped values the first time, so re-applying a different balance file starts clean
  if (!data._baseline) {
    data._baseline = {
      structures: Object.fromEntries(data.structures.map(s => [s.id, JSON.parse(JSON.stringify(s))])),
      recipes: Object.fromEntries(data.recipes.map(r => [r.id, JSON.parse(JSON.stringify(r))])),
      techs: Object.fromEntries(data.techs.map(t => [t.id, JSON.parse(JSON.stringify(t))])),
      vehicles: Object.fromEntries(data.vehicles.map(v => [v.id, JSON.parse(JSON.stringify(v))])),
      units: Object.fromEntries(data.units.map(u => [u.id, JSON.parse(JSON.stringify(u))])),
    };
  }

  const costMult = balance.costByCategory || {};
  const timeMult = balance.buildTimeByCategory || {};
  for (const s of data.structures) {
    const base = data._baseline.structures[s.id];
    if (!base) continue;
    if (costMult[s.category] != null) s.cost = scaleCost(base.cost, costMult[s.category]);
    else s.cost = JSON.parse(JSON.stringify(base.cost || {}));
    if (timeMult[s.category] != null) s.buildTime = +(base.buildTime * timeMult[s.category]).toFixed(2);
    else s.buildTime = base.buildTime;
    const o = balance.structures?.[s.id];
    if (o) mergeInto(s, o);
  }
  const recipeTime = balance.recipeTimeByCategory || {};
  for (const r of data.recipes) {
    const base = data._baseline.recipes[r.id];
    if (!base) continue;
    r.time = recipeTime[r.category] != null ? +(base.time * recipeTime[r.category]).toFixed(2) : base.time;
    const o = balance.recipes?.[r.id];
    if (o) mergeInto(r, o);
  }
  const workMult = balance.researchWorkByTier || {};
  for (const t of data.techs) {
    const base = data._baseline.techs[t.id];
    if (!base) continue;
    t.work = workMult[t.tier] != null ? Math.round(base.work * workMult[t.tier]) : base.work;
    t.cost = workMult[t.tier] != null ? scaleCost(base.cost, workMult[t.tier]) : JSON.parse(JSON.stringify(base.cost || {}));
    const o = balance.techs?.[t.id];
    if (o) mergeInto(t, o);
  }
  for (const [id, o] of Object.entries(balance.vehicles || {})) { const v = data.vehicle[id]; if (v) mergeInto(v, o); }
  for (const [id, o] of Object.entries(balance.resources || {})) { const r = data.resource[id]; if (r) mergeInto(r, o); }
  for (const [id, o] of Object.entries(balance.units || {})) { const u = data.unit[id]; if (u) mergeInto(u, o); }
  if (balance.waves) mergeInto(data.waves, balance.waves);
  data.balance = BALANCE;
  return data;
}

/** Hazard definition for a planet tag, or null if that tag does nothing here. */
export function hazardDef(tag) { return BALANCE.hazards?.[tag] || null; }
