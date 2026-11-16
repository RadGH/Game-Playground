// The city's clock: what happens every game day and every month. Arrivals are the main way people come (owner
// 2026-11-15); zoning decides WHERE they live and work. Homes grow when people are waiting for them; shops and
// industry grow when residents need jobs and shopping. Land value (leisure, education, water nearby, threat) decides
// how tall and fancy a lot grows. Money comes from taxes and goes to upkeep; below the shutdown line services stop.
import { T, milestones } from './tuning.js';
import { cat, item } from './catalog.js';
import { roadReach, touchesRoad, solvePower, solveWater, solveTraffic } from './networks.js';
import { isFlat } from './terrain.js';
import { addLot, reindexLots } from './build.js';
import { ZONE, RAW, REFINED } from './region.js';
import { rng } from '../../../../citykit/js/kit/rng.js';
import { cutTraffic, transitLandValue, transitUpkeep } from './transit.js';

const ZKEY = { 1: 'R', 2: 'C', 3: 'I' };

// ---------------- derived numbers (cheap, used by the HUD) ----------------
export function housing(r) { let h = 0; for (const l of r.lots) if (l.people && (l.powered ?? 1) > 0) h += l.people; return h; }
export function jobs(r) { let j = 0; for (const l of r.lots) j += l.jobs || 0; return j; }
export function census(r) {
  let homes = 0, jobsTotal = 0, cjobs = 0, ijobs = 0;
  for (const l of r.lots) { homes += l.people || 0; jobsTotal += l.jobs || 0; if (l.zone === 'C') cjobs += l.jobs; if (l.zone === 'I') ijobs += l.jobs; }
  return { homes, jobs: jobsTotal, cjobs, ijobs, people: r.people.total, waiting: r.people.arriving };
}
/** What the city needs right now: homes for everyone here and on the way (+ a small buffer), shop jobs and
 *  industry jobs for its workers. Growth builds toward these targets and stops there (no ghost towns). */
export function targets(r) {
  const p = r.people.total, coming = r.people.arriving;
  return { R: p + coming + Math.max(8, Math.round((p + coming) * 0.12)), C: Math.round(p * 0.24) + 6, I: Math.round(p * 0.34) + 6 };
}
/** Demand per zone, -1..1 (the meter). Positive = the city wants more of it. Higher taxes cut it. */
export function demand(r) {
  const c = census(r), t = targets(r);
  const tax = z => Math.max(0, (r.taxes[z] - 0.09) * 100) * (T.taxGrowthPenalty ?? 4) / 100;
  const m = (want, have) => clamp((want - have) / Math.max(10, want * 0.3), -1, 1);
  return { R: clamp(m(t.R, c.homes) - tax('R'), -1, 1), C: clamp(m(t.C, c.cjobs) - tax('C'), -1, 1), I: clamp(m(t.I, c.ijobs) - tax('I'), -1, 1) };
}

// ---------------- land value ----------------
export function solveLandValue(r) {
  const N = r.size, v = r.tiles.value, edu = r.tiles.edu, lei = r.tiles.leisure;
  edu.fill(0); lei.fill(0);
  for (const l of r.lots) {
    const e = item(l.id); const cover = e?.cover || l.cover; if (!cover || (l.powered ?? 1) <= 0) continue;
    const cx = l.x + l.w / 2, cz = l.z + l.d / 2;
    for (const [key, rad] of Object.entries(cover)) {
      const arr = key === 'education' ? edu : lei;
      for (let z = Math.max(0, Math.floor(cz - rad)); z < Math.min(N, cz + rad); z++) for (let x = Math.max(0, Math.floor(cx - rad)); x < Math.min(N, cx + rad); x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz); if (d < rad) arr[z * N + x] = Math.min(1, arr[z * N + x] + (1 - d / rad) * (l.landmark ? 1.2 : 0.8));
      }
    }
  }
  // water nearby: a coarse distance (rows then columns)
  const wd = new Float32Array(N * N).fill(99);
  for (let i = 0; i < N * N; i++) if (r.ter.water[i]) wd[i] = 0;
  for (let pass = 0; pass < 2; pass++) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { const i = z * N + x; if (x) wd[i] = Math.min(wd[i], wd[i - 1] + 1); if (z) wd[i] = Math.min(wd[i], wd[i - N] + 1); }
  for (let z = N - 1; z >= 0; z--) for (let x = N - 1; x >= 0; x--) { const i = z * N + x; if (x < N - 1) wd[i] = Math.min(wd[i], wd[i + 1] + 1); if (z < N - 1) wd[i] = Math.min(wd[i], wd[i + N] + 1); }
  const threat = threatMap(r);
  for (let i = 0; i < N * N; i++) {
    const near = wd[i] < 6 ? (1 - wd[i] / 6) : 0;
    const traffic = Math.min(1, Math.max(0, (r.tiles.traffic[i] || 0) - 0.8));
    v[i] = clamp(0.18 + lei[i] * (T.landValueParks ?? 0.25) * 2 + edu[i] * (T.landValueSchools ?? 0.15) * 2 + near * (T.landValueWater ?? 0.15)
      - threat[i] * (T.landValueThreat ?? 0.3) - traffic * 0.2 + r.ter.height[i] * 0.02, 0, 1);
  }
}
function threatMap(r) {
  const N = r.size, t = new Float32Array(N * N);
  for (const n of r.nests) { const rad = 9 + n.size * 4; for (let z = Math.max(0, Math.floor(n.z - rad)); z < Math.min(N, n.z + rad); z++) for (let x = Math.max(0, Math.floor(n.x - rad)); x < Math.min(N, n.x + rad); x++) { const d = Math.hypot(x - n.x, z - n.z); if (d < rad) t[z * N + x] = Math.max(t[z * N + x], 1 - d / rad); } }
  return t;
}

// ---------------- growth ----------------
/** Grow a share of the zoned land that's ready: pick a lot spot, a tier the land allows, floors from land value. */
export function grow(r, R) {
  const N = r.size, reach = roadReach(r), dm = demand(r);
  const zoneTables = cat().zones;
  let grown = 0;
  for (const z of [ZONE.R, ZONE.C, ZONE.I]) {
    const key = ZKEY[z]; if (dm[key] <= 0.02) continue;
    // candidate seeds: zoned empty tiles beside a connected road
    const seeds = [];
    for (let i = 0; i < N * N; i++) if (r.tiles.zone[i] === z && r.tiles.lot[i] < 0) { const x = i % N, zz = (i / N) | 0; if (touchesRoad(r, reach, x, zz, 1, 1)) seeds.push([x, zz]); }
    if (!seeds.length) continue;
    const budget = Math.max(1, Math.ceil(seeds.length * (T.growPerMonth ?? 0.35) * dm[key]));
    const tgt = targets(r)[key], have = () => { const c = census(r); return key === 'R' ? c.homes : key === 'C' ? c.cjobs : c.ijobs; };
    for (let k = 0; k < budget && seeds.length && have() < tgt; k++) {
      const [x, zz] = seeds.splice(R.int(0, seeds.length - 1), 1)[0];
      if (r.tiles.lot[zz * N + x] >= 0) continue;
      const lot = bestLot(r, reach, zoneTables[key], key, x, zz, R); if (!lot) continue;
      addLot(r, lot); grown++;
    }
  }
  // redevelop: an old low lot on valuable land is replaced by a taller one (SimCity's up-zoning feel)
  const old = r.lots.filter(l => l.kind === 'zoned' && l.tier < 4 && r.day - l.built > 60);
  for (let k = 0; k < Math.min(3, old.length); k++) {
    const l = old[R.int(0, old.length - 1)], value = lotValue(r, l.x, l.z, l.w, l.d);
    const table = cat().zones[l.zone], next = table.find(t => t.tier === l.tier + 1 && t.size[0] === l.w && t.size[1] === l.d);
    if (next && value >= next.minValue && (next.unlock ?? 0) <= r.milestone && dm[l.zone] > 0.2 && (!next.water || l.wet)) {
      Object.assign(l, makeLot(r, next, l.zone, l.x, l.z, value, R), { n: l.n }); grown++;
    }
  }
  if (grown) { solvePower(r); solveWater(r); }
  return grown;
}
function lotValue(r, x, z, w, d) { let s = 0; for (let k = 0; k < d; k++) for (let j = 0; j < w; j++) s += r.tiles.value[(z + k) * r.size + x + j]; return s / (w * d); }
function waterAt(r, x, z) { return r.waterNet?.reach?.[z * r.size + x] ? 1 : 0; }
function bestLot(r, reach, table, key, x, z, R) {
  const N = r.size, zcode = { R: ZONE.R, C: ZONE.C, I: ZONE.I }[key];
  const options = table.filter(t => (t.unlock ?? 0) <= r.milestone).sort((a, b) => b.tier - a.tier);
  for (const t of options) {
    for (const [w, d] of [t.size, [t.size[1], t.size[0]]]) {
      // try the lot with (x, z) at each corner
      for (const [ox, oz] of [[0, 0], [-(w - 1), 0], [0, -(d - 1)], [-(w - 1), -(d - 1)]]) {
        const lx = x + ox, lz = z + oz; if (lx < 0 || lz < 0 || lx + w > N || lz + d > N) continue;
        let ok = true; for (let k = 0; k < d && ok; k++) for (let j = 0; j < w && ok; j++) { const i = (lz + k) * N + lx + j; if (r.tiles.zone[i] !== zcode || r.tiles.lot[i] >= 0 || r.tiles.road[i]) ok = false; }
        if (!ok || !isFlat(r.ter, lx, lz, w, d) || !touchesRoad(r, reach, lx, lz, w, d)) continue;
        const value = lotValue(r, lx, lz, w, d);
        if (value < t.minValue) continue;
        if (t.water && !waterAt(r, lx + (w >> 1), lz + (d >> 1))) continue;
        if (t.education && r.people.edu < t.education) continue;
        return { ...makeLot(r, t, key, lx, lz, value, R), w, d };
      }
    }
  }
  return null;
}
function makeLot(r, t, zone, x, z, value, R) {
  const [lo, hi] = t.floors, span = t.minValue >= 0.99 ? 1 : (value - t.minValue) / (1 - t.minValue);
  const floors = Math.max(lo, Math.min(hi, Math.round(lo + (hi - lo) * Math.pow(Math.max(0, span), 1.2) * R.range(0.8, 1.1))));
  const cap = floors * t.perFloor;
  const params = { seed: R.int(1, 9999), style: R.pick(['chrome', 'graphite', 'pearl', 'copper', 'concrete']) };
  if (t.param === 'stalls') params.stalls = Math.max(2, Math.min(6, 2 + Math.round(value * 5))); else params.floors = floors;
  return { n: r.nextLot = (r.nextLot || 0) + 1, id: `zone-${zone}-${t.tier}`, kind: 'zoned', zone, tier: t.tier, x, z, w: t.size[0], d: t.size[1], recipe: t.recipe, params,
    people: zone === 'R' ? cap : 0, jobs: zone === 'R' ? 0 : cap, power: -Math.max(1, Math.round(cap / 25)), water: 0, upkeep: 0, built: r.day, value };
}

// ---------------- people ----------------
/** Daily: arrivals move into free homes; births (monthly in monthTick). */
export function settle(r, days) {
  const free = Math.max(0, housing(r) - r.people.total);
  const move = Math.min(free, r.people.arriving, Math.ceil(days * 12));
  r.people.arriving -= move; r.people.total += move;
  // people with no home leave if housing never comes (after ~20 days of waiting)
  if (r.people.arriving > 0 && free === 0) { r.people.waitDays = (r.people.waitDays || 0) + days; if (r.people.waitDays > 20) { const leave = Math.ceil(r.people.arriving * 0.05 * days); r.people.arriving -= leave; r.reputation = Math.max(-1, r.reputation - 0.002 * leave); } }
  else r.people.waitDays = 0;
  // over capacity (homes lost to an attack or a brownout): people wait for homes again
  const h = housing(r); if (r.people.total > h) { r.people.arriving += r.people.total - h; r.people.total = h; }
}

// ---------------- money ----------------
export function monthBudget(r) {
  const c = census(r), rateOf = z => r.taxes[z] / 0.09;
  const employed = Math.min(c.jobs, r.people.total * 0.58);
  const fill = c.jobs ? employed / c.jobs : 0;
  const income = {
    R: r.people.total * (T.taxPerPerson ?? 1.6) * rateOf('R'),
    C: c.cjobs * fill * (T.taxPerJob ?? 2.1) * rateOf('C'),
    I: c.ijobs * fill * (T.taxPerJob ?? 2.1) * rateOf('I'),
  };
  const roads = cat().roads; let roadUp = 0; for (let i = 0; i < r.size * r.size; i++) { const lv = r.tiles.road[i]; if (lv) roadUp += roads[lv - 1].upkeep; }
  let wallUp = 0; for (let i = 0; i < r.size * r.size; i++) if (r.tiles.wall[i]) wallUp += 1.5;
  const upkeep = {
    buildings: r.lots.reduce((s, l) => s + (l.upkeep || 0), 0), roads: roadUp, walls: wallUp,
    turrets: r.turrets.reduce((s, t) => s + (t.upkeep || 0), 0),
    loans: r.loans.reduce((s, l) => s + l.amount * (T.loanInterest ?? 0.04) / 12 + l.amount / l.months, 0),
    transit: transitUpkeep(r),
  };
  const inTotal = income.R + income.C + income.I, outTotal = Object.values(upkeep).reduce((a, b) => a + b, 0);
  return { income, upkeep, inTotal, outTotal, net: inTotal - outTotal };
}
export function takeLoan(r) { const a = T.loanSize ?? 25000; if (r.loans.length >= 3) return false; r.loans.push({ amount: a, months: 48, left: 48 }); r.money += a; return true; }

// ---------------- industry ----------------
/** Daily: outposts send raw material home (only while powered, deposit not empty); refineries convert. */
export function industry(r, days) {
  const N = r.size, made = { metal: 0, stone: 0, crystal: 0, steel: 0, concrete: 0, cells: 0 };
  for (const l of r.lots) {
    const e = item(l.id); if (!e) continue;
    if (e.deposit && (l.powered ?? 0) > 0) {
      let left = 0, tiles = []; for (let k = 0; k < l.d; k++) for (let j = 0; j < l.w; j++) { const i = (l.z + k) * N + l.x + j; if (r.ter.amount[i] && ['', 'metal', 'stone', 'crystal'][r.ter.deposit[i]] === e.deposit) { left += r.ter.amount[i]; tiles.push(i); } }
      const take = Math.min(left, (T.outpostRate ?? 9) * days * l.powered);
      for (const i of tiles) { const t = Math.min(r.ter.amount[i], take / tiles.length + 0.5); r.ter.amount[i] -= t; if (r.ter.amount[i] <= 0) r.ter.deposit[i] = 0; }
      r.stock[e.deposit] += take; made[e.deposit] += take; l.dry = left - take <= 0;
    }
    if (e.refine && (l.powered ?? 0) > 0) {
      const want = (T.refineRate ?? 6) * days * l.powered, need = want * (T.refineIn ?? 2);
      const can = Math.min(want, r.stock[e.refine.from] / (T.refineIn ?? 2));
      r.stock[e.refine.from] -= can * (T.refineIn ?? 2); r.stock[e.refine.to] += can; made[e.refine.to] += can; l.starved = can < want * 0.5;
    }
  }
  return made;
}

// ---------------- milestones ----------------
export function checkMilestone(r) {
  const ms = milestones(); let up = false;
  while (r.milestone < ms.length && r.people.total >= ms[r.milestone]) {
    r.milestone++; up = true;
    r.log.push({ day: r.day, text: `Milestone ${r.milestone} reached: ${fmtPeople(ms[r.milestone - 1])} people. New buildings unlocked.`, kind: 'milestone' });
  }
  return up;
}
export function nextMilestone(r) { const ms = milestones(); return r.milestone < ms.length ? ms[r.milestone] : null; }
const fmtPeople = n => n >= 1000 ? `${Math.round(n / 100) / 10}k`.replace('.0k', 'k') : String(n);

// ---------------- the ticks ----------------
/** Advance `days` (can be fractional). Monthly work every 30 days, daily work every whole day. */
export function tick(r, days) {
  const before = Math.floor(r.day);
  r.day += days;
  const whole = Math.floor(r.day) - before;
  for (let d = 0; d < whole; d++) dayTick(r, before + d + 1);
}
function dayTick(r, day) {
  const R = rng(r.seed * 31 + day);
  if (r.dirty || day % 5 === 0) { solvePower(r); solveWater(r); r.dirty = false; }
  settle(r, 1);
  const made = industry(r, 1);
  // money trickles daily (a month's net / 30), so the counter moves smoothly
  const b = monthBudget(r); const net = b.net / 30;
  const shut = r.money < (T.debtShutdown ?? -5000);
  r.money += shut ? (b.inTotal / 30) - (b.upkeep.loans / 30) : net;
  r.budget = b; r.shutdown = shut;
  for (const k of [...RAW, ...REFINED]) r.rates[k] = r.rates[k] * 0.9 + made[k] * 0.1;
  r.rates.money = r.rates.money * 0.9 + (shut ? b.inTotal / 30 : net) * 0.1;
  if (day % 30 === 0) monthTick(r, R);
  else if (day % 3 === 0) { solveLandValue(r); transitLandValue(r); grow(r, R); }
  checkMilestone(r);
}
function monthTick(r, R) {
  solveTraffic(r, cat().roads); cutTraffic(r);
  solveLandValue(r); transitLandValue(r);
  grow(r, R);
  // births (once the city is settled)
  if (r.people.total >= (T.birthsFrom ?? 500)) { const born = Math.round(r.people.total * (T.birthsPerMonth ?? 0.003)); r.people.arriving += born; r.people.born += born; }
  // education share: people living inside school coverage
  let covered = 0, total = 0; for (const l of r.lots) if (l.people) { total += l.people; covered += l.people * Math.min(1, r.tiles.edu[(l.z) * r.size + l.x] * 1.5); }
  r.people.edu = total ? covered / total : 0;
  // loans pay down
  for (const l of r.loans) l.left--; r.loans = r.loans.filter(l => l.left > 0);
  // reputation drifts toward how well the city is doing
  const target = clamp((r.rates.money > 0 ? 0.2 : -0.2) + Math.min(0.4, r.lots.filter(l => item(l.id)?.landmark).length * 0.15) + (r.shutdown ? -0.4 : 0) + Math.min(0.3, r.people.total / 20000), -1, 1);
  r.reputation += (target - r.reputation) * 0.2;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export { reindexLots };
