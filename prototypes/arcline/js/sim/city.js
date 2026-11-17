// The city's clock: what happens every game day and every month. People move in on their own whenever there are free
// homes (round 2, owner 2026-11-16: "make people keep coming in when there's demand" — SimCity-style immigration, no
// ships), faster the more attractive the city is (appeal(): land value, jobs, power + water, taxes, reputation,
// defence holding, links to your other cities). Zoning decides WHERE they live and work. Homes grow a step ahead of the
// people; shops and industry grow when residents need jobs and shopping. Land value (leisure, education, water
// nearby, threat) decides how tall and fancy a lot grows. Money: taxes + a Colony grant that fades as the city grows,
// minus upkeep; below the shutdown line services stop.
import { T, milestones } from './tuning.js';
import { cat, item } from './catalog.js';
import { roadReach, lotFace, solvePower, solveWater, solveTraffic } from './networks.js';
import { isFlat } from './terrain.js';
import { addLot, reindexLots } from './build.js';
import { ZONE, RAW, REFINED } from './region.js';
import { rng } from '../../../../citykit/js/kit/rng.js';
import { cutTraffic, transitLandValue, transitUpkeep, linkBoost } from './transit.js';
import { plots, plotOf, rectAccess, inwardFace, zoneDepth } from './plots.js';
import { effect, researchTick, policyUpkeep } from './research.js';

const ZKEY = { 1: 'R', 2: 'C', 3: 'I' };
/** Share of residents who work (jobs wanted = people × this). */
export const WORK_SHARE = 0.58;

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
  const p = r.people.total, coming = r.people.arriving, c = census(r), link = linkBoost(r), a = appeal(r).value;
  // homes run a step ahead of the people (more for an attractive city, more when linked cities send interest), plus
  // homes for anyone the open jobs could employ — that's what keeps immigration going
  const ahead = Math.max(T.homesAheadMin ?? 16, (p + coming) * (T.homesAhead ?? 0.15) * Math.max(0.5, a)) * (1 + link.R);
  const openJobs = Math.max(0, c.jobs - p * WORK_SHARE) / WORK_SHARE;
  return {
    R: Math.round(p + coming + ahead + openJobs * 0.5),
    C: Math.round((p * 0.24 + 6) * (1 + link.C) * effect(r, 'demandC')),   // R&D policy: Night Market Licences
    I: Math.round(p * 0.34 + 6),
  };
}
/** Demand per zone, -1..1 (the meter). Positive = the city wants more of it. Higher taxes cut it. */
export function demand(r) {
  const c = census(r), t = targets(r);
  const tax = z => Math.max(0, (r.taxes[z] - 0.09) * 100) * (T.taxGrowthPenalty ?? 4) / 100;
  const m = (want, have) => clamp((want - have) / Math.max(10, want * 0.3), -1, 1);
  return { R: clamp(m(t.R, c.homes) - tax('R'), -1, 1), C: clamp(m(t.C, c.cjobs) - tax('C'), -1, 1), I: clamp(m(t.I, c.ijobs) - tax('I'), -1, 1) };
}

// ---------------- land value ----------------
/** How strongly a building lifts the leisure/education layer at its middle: its catalog `boost` (parks and plazas
 *  differ), else 1.2 for a landmark and 0.8 for the rest; parks × the Green City Charter policy (R&D). */
function boostOf(r, e, l) {
  const b = e?.boost ?? (l.landmark ? 1.2 : 0.8);
  return e?.cat === 'park' || e?.cat === 'leisure' ? b * effect(r, 'parks') : b;
}
export function solveLandValue(r) {
  const N = r.size, v = r.tiles.value, edu = r.tiles.edu, lei = r.tiles.leisure;
  edu.fill(0); lei.fill(0);
  for (const l of r.lots) {
    const e = item(l.id); const cover = e?.cover || l.cover; if (!cover || (l.powered ?? 1) <= 0) continue;
    const cx = l.x + l.w / 2, cz = l.z + l.d / 2;
    for (const [key, rad] of Object.entries(cover)) {
      const arr = key === 'education' ? edu : lei;
      for (let z = Math.max(0, Math.floor(cz - rad)); z < Math.min(N, cz + rad); z++) for (let x = Math.max(0, Math.floor(cx - rad)); x < Math.min(N, cx + rad); x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz); if (d < rad) arr[z * N + x] = Math.min(1, arr[z * N + x] + (1 - d / rad) * boostOf(r, e, l));
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
// Owner 2026-11-17: zoned land fills its middle too, every zone comes in 1×1, 2×1 and 2×2 at every level, and small
// buildings with good enough stats combine into bigger ones. sim/plots.js cuts each painted block into plots (2×2
// first, packed from the block's corners); growth puts a building on a free plot — the whole plot, or a 2×1 / 1×1 piece
// of it on poorer land — and levelUp() later combines the pieces of a plot into one building the plot's size, or
// rebuilds a building that already fills its plot one level taller.
/** The growth table entry a lot was built from (its name, size, level). */
export function zoneDesign(l) {
  const t = cat().zones[l.zone] || [];
  return t.find(e => e.recipe === l.recipe) || t.find(e => e.tier === l.tier && fits(e, l.w, l.d)) || null;
}
/** A zoned building's player-facing name. */
export function designName(l) { return zoneDesign(l)?.name || 'Building'; }
const fits = (e, w, d) => (e.size[0] === w && e.size[1] === d) || (e.size[0] === d && e.size[1] === w);
/** The design for zone/tier on a w × d lot (either way round), or null. Old-only designs (legacy) are never picked. */
function designFor(zone, tier, w, d) { return (cat().zones[zone] || []).find(e => e.tier === tier && !e.legacy && fits(e, w, d)) || null; }
/** The best design a new w × d building could be here: the highest level the land, water, schooling and milestone allow. */
function bestDesign(r, zone, w, d, value, wet) {
  const opts = (cat().zones[zone] || []).filter(e => !e.legacy && fits(e, w, d) && (e.unlock ?? 0) <= r.milestone && value >= e.minValue
    && (!e.water || wet) && (!e.education || (r.people.edu || 0) >= e.education));
  return opts.sort((a, b) => b.tier - a.tier)[0] || null;
}
/** How many new buildings may go up per growth pass (share of free plots × demand). */
const growBudget = (free, dm) => Math.max(1, Math.ceil(free * (T.growPerMonth ?? 0.35) * dm));
/** Free (empty, flat) zoned tiles in reach for zone key — what can still grow. Used by the balance bot and advice. */
export function growableTiles(r, key) {
  const P = plots(r, roadReach(r)), N = r.size, depth = zoneDepth(); let n = 0;
  for (const p of P.list) if (p.zone === key && rectAccess(P, r, p.x, p.z, p.w, p.d) <= depth)
    for (let k = 0; k < p.d; k++) for (let j = 0; j < p.w; j++) if (r.tiles.lot[(p.z + k) * N + p.x + j] < 0) n++;
  return n;
}
/** Grow a share of the zoned land that's ready, then level up / combine the buildings that are ready. */
export function grow(r, R) {
  const N = r.size, reach = roadReach(r), dm = demand(r), depth = zoneDepth();
  let grown = 0;
  // level up / combine first, so a settled piece takes in the free land of its plot before new growth fills it: a
  // zoned lot that meets every need (levelUp() — the same check the info panel shows) is rebuilt, a few each pass
  const ready = [];
  for (const l of r.lots) if (l.kind === 'zoned') { const u = levelUp(r, l, { reach, dm }); if (u.ready) ready.push(u); }
  const per = Math.max(LEVEL_PER_PASS, Math.ceil(ready.length * 0.25));
  for (let k = 0; k < per && ready.length; k++) {
    const u = ready.splice(R.int(0, ready.length - 1), 1)[0], l = u.lot;
    if (!r.lots.includes(l)) continue;
    const now = levelUp(r, l, { reach, dm }); if (!now.ready) continue;   // an earlier rebuild took its room
    applyLevelUp(r, l, now, R); grown++;
  }
  for (const key of ['R', 'C', 'I']) {
    if (dm[key] <= 0.02) continue;
    const P = plots(r, reach);
    // plots with free ground a road reaches: nearest the road first, a little shuffled
    const cands = [];
    for (const p of P.list) {
      if (p.zone !== key) continue;
      const acc = rectAccess(P, r, p.x, p.z, p.w, p.d); if (acc > depth) continue;
      let free = 0; for (let k = 0; k < p.d; k++) for (let j = 0; j < p.w; j++) if (r.tiles.lot[(p.z + k) * N + p.x + j] < 0) free++;
      if (free) cands.push({ p, free, order: acc + R.range(0, 2.5) });
    }
    if (!cands.length) continue;
    cands.sort((a, b) => a.order - b.order);
    const budget = growBudget(cands.reduce((s, c) => s + c.free, 0) / 2, dm[key]);
    const tgt = targets(r)[key], have = () => { const c = census(r); return key === 'R' ? c.homes : key === 'C' ? c.cjobs : c.ijobs; };
    for (let k = 0, made = 0; k < cands.length && made < budget && have() < tgt; k++) {
      const lot = pieceFor(r, plots(r, reach), cands[k].p, key, R); if (!lot) continue;
      addLot(r, lot); grown++; made++;
    }
  }
  if (grown) { solvePower(r); solveWater(r); }
  return grown;
}
function lotValue(r, x, z, w, d) { let s = 0; for (let k = 0; k < d; k++) for (let j = 0; j < w; j++) s += r.tiles.value[(z + k) * r.size + x + j]; return s / (w * d); }
function waterAt(r, x, z) { return r.waterNet?.reach?.[z * r.size + x] ? 1 : 0; }
const freeRect = (r, x, z, w, d) => { for (let k = 0; k < d; k++) for (let j = 0; j < w; j++) if (r.tiles.lot[(z + k) * r.size + x + j] >= 0) return false; return isFlat(r.ter, x, z, w, d); };
/** Which way a w × d building at (x, z) faces: its road if its front can meet one, else toward the way out. */
function faceOf(r, P, x, z, w, d, size) {
  const f = lotFace(r, x, z, w, d, size); return f.road ? f.face : inwardFace(P, r, x, z, w, d, size);
}
/** How good a spot is for a piece's front: 0 = its front is on a road; higher = deeper inside the block. */
function frontScore(r, P, x, z, w, d, size) {
  if (lotFace(r, x, z, w, d, size).road) return 0;
  return 1 + rectAccess(P, r, x, z, w, d);
}
/**
 * A new building on plot p: the whole plot when the land is good (or by chance), else a 2×1 / 1×1 piece of it at the
 * front. Pieces fill the rest of the plot later and combine (levelUp). → a lot, or null if nothing fits.
 */
function pieceFor(r, P, p, key, R) {
  const opts = [];   // [x, z, w, d]
  if (freeRect(r, p.x, p.z, p.w, p.d)) opts.push([p.x, p.z, p.w, p.d]);
  const halves = [];
  if (p.w === 2 && p.d === 2) for (const [x, z, w, d] of [[p.x, p.z, 2, 1], [p.x, p.z + 1, 2, 1], [p.x, p.z, 1, 2], [p.x + 1, p.z, 1, 2]]) if (freeRect(r, x, z, w, d)) halves.push([x, z, w, d]);
  const singles = [];
  for (let k = 0; k < p.d; k++) for (let j = 0; j < p.w; j++) if (p.w * p.d > 1 && freeRect(r, p.x + j, p.z + k, 1, 1)) singles.push([p.x + j, p.z + k, 1, 1]);
  const value = lotValue(r, p.x, p.z, p.w, p.d);
  // bigger plots go up whole more often on better land; poor land starts with small pieces that combine later
  const whole = Math.min(0.9, Math.max(0.25, (value - 0.05) / 0.35));
  const byFront = list => list.map(o => [o, frontScore(r, P, o[0], o[1], o[2], o[3], [Math.max(o[2], o[3]), Math.min(o[2], o[3])]) + R.range(0, 0.4)]).sort((a, b) => a[1] - b[1]).map(a => a[0]);
  let order;
  if (opts.length && R() < whole) order = [opts[0], ...byFront(halves), ...byFront(singles)];
  else order = [...(R() < 0.7 ? byFront(halves) : []), ...byFront(singles), ...byFront(halves), ...opts];
  for (const [x, z, w, d] of order) {
    const v = lotValue(r, x, z, w, d), t = bestDesign(r, key, w, d, v, waterAt(r, x + (w >> 1), z + (d >> 1)));
    if (!t) continue;
    return makeLot(r, t, key, x, z, v, R, w, d, faceOf(r, P, x, z, w, d, t.size));
  }
  return null;
}
/** A zoned lot of design t at (x, z), w × d tiles (t.size, or turned the other way round), facing `face`. */
function makeLot(r, t, zone, x, z, value, R, w = t.size[0], d = t.size[1], face = lotFace(r, x, z, w, d, t.size).face) {
  const [lo, hi] = t.floors, span = t.minValue >= 0.99 ? 1 : (value - t.minValue) / (1 - t.minValue);
  const floors = Math.max(lo, Math.min(hi, Math.round(lo + (hi - lo) * Math.pow(Math.max(0, span), 1.2) * R.range(0.8, 1.1))));
  const cap = floors * t.perFloor;
  const params = { seed: R.int(1, 9999), style: R.pick(['chrome', 'pearl', 'copper', 'concrete']) };
  if (t.param === 'stalls') params.stalls = Math.max(2, Math.min(6, 2 + Math.round(value * 5))); else params.floors = floors;
  return { n: r.nextLot = (r.nextLot || 0) + 1, id: `zone-${zone}-${t.tier}`, kind: 'zoned', zone, tier: t.tier, x, z, w, d, face, recipe: t.recipe, params,
    people: zone === 'R' ? cap : 0, jobs: zone === 'R' ? 0 : cap, power: -Math.max(1, Math.round(cap / 25)), water: 0, upkeep: 0, built: r.day, value };
}

// ---------------- levelling up + combining ----------------
/** Days a zoned building stands before it can level up or combine, and the fewest that do so each growth pass. */
export const LEVEL_AGE = 60, LEVEL_PER_PASS = 3;
const ZONE_WORD = { R: 'homes', C: 'shops and offices', I: 'industry' };
/**
 * The next step for a zoned building, and what it still needs (owner reports #84 and 2026-11-17). One check for the sim
 * (grow() rebuilds lots that are ready) and the info panel (the bar and the list), so the two can't disagree.
 *   combine: the building is smaller than its plot → it becomes one building the plot's size (same level as the best
 *            piece in it), taking in the free land and the other small buildings of its zone in that plot.
 *   level:   it fills its plot → it is rebuilt one level up, same footprint.
 * → { lot, tier, top, kind: 'combine'|'level', nextTier, nextName, title, progress 0..1, ready,
 *     needs: [{ key, ok, text, short, part 0..1 }], spot: { x, z, w, d, absorb: [lots] } }
 */
export function levelUp(r, l, { reach = null, dm = null } = {}) {
  if (l.kind !== 'zoned') return { lot: l, tier: l.tier, top: true, progress: 1, ready: false, needs: [] };
  reach ??= roadReach(r); dm ??= demand(r);
  const P = plots(r, reach), N = r.size, plot = plotOf(P, r, l);
  let kind = 'level', next, spot, absorb = [], youngest = l;
  if (plot && plot.w * plot.d > l.w * l.d) {
    // combine: every other tile of the plot is free land or a small building of this zone
    kind = 'combine';
    const seen = new Set([l]); let blocked = false, tier = l.tier;
    for (let k = 0; k < plot.d; k++) for (let j = 0; j < plot.w; j++) {
      const li = r.tiles.lot[(plot.z + k) * N + plot.x + j]; if (li < 0) continue;
      const o = r.lots[li]; if (seen.has(o)) continue; seen.add(o);
      if (o.kind !== 'zoned' || o.zone !== l.zone || o.x < plot.x || o.z < plot.z || o.x + o.w > plot.x + plot.w || o.z + o.d > plot.z + plot.d) { blocked = true; continue; }
      absorb.push(o); tier = Math.max(tier, o.tier); if (o.built > youngest.built) youngest = o;
    }
    next = designFor(l.zone, tier, plot.w, plot.d);
    for (let t = tier - 1; !next && t >= 1; t--) next = designFor(l.zone, t, plot.w, plot.d);
    spot = { x: plot.x, z: plot.z, w: plot.w, d: plot.d, absorb, blocked, flat: isFlat(r.ter, plot.x, plot.z, plot.w, plot.d) };
  } else {
    next = designFor(l.zone, l.tier + 1, l.w, l.d);
    spot = { x: l.x, z: l.z, w: l.w, d: l.d, absorb: [], blocked: false, flat: true };
  }
  if (!next) return { lot: l, tier: l.tier, top: true, progress: 1, ready: false, needs: [] };
  const needs = [], value = lotValue(r, spot.x, spot.z, spot.w, spot.d), age = r.day - youngest.built, ms = milestones();
  const need = (key, part, text, short = text) => needs.push({ key, ok: part >= 1, part: clamp(part, 0, 1), text, short });
  const settle = absorb.length ? 'Settling in (it and its neighbours)' : 'Settling in';
  need('age', age / LEVEL_AGE, age >= LEVEL_AGE ? 'Settled in' : `${settle}: ${Math.ceil(LEVEL_AGE - age)} more days`, age >= LEVEL_AGE ? 'Settled in' : `Settling in: ${Math.ceil(LEVEL_AGE - age)} days`);
  need('value', next.minValue ? value / next.minValue : 1, `Land value ${Math.round(value * 100)}% of ${Math.round(next.minValue * 100)}%${value >= next.minValue ? '' : ': parks, schools, transit and water nearby raise it'}`, `Land value ${Math.round(value * 100)}% of ${Math.round(next.minValue * 100)}%`);
  need('demand', dm[l.zone] / 0.2, dm[l.zone] > 0.2 ? `The city wants more ${ZONE_WORD[l.zone]}` : `The city wants more ${ZONE_WORD[l.zone]} first (demand is ${dm[l.zone] > 0 ? 'low' : 'full'})`, dm[l.zone] > 0.2 ? 'Demand' : 'More demand');
  if ((next.unlock ?? 0) > r.milestone) need('unlock', 0, `Unlocks at milestone ${next.unlock} (${ms[next.unlock - 1]} people)`);
  need('power', (l.powered ?? 0) > 0 ? 1 : 0, (l.powered ?? 0) > 0 ? 'Has power' : 'Needs power: build a power line or plant nearby', (l.powered ?? 0) > 0 ? 'Power' : 'Needs power');
  if (next.water) need('water', l.wet ? 1 : 0, l.wet ? 'Has water' : 'Needs water: lay a pipe from a Water Pump nearby', l.wet ? 'Water' : 'Needs water');
  if (next.education) need('education', (r.people.edu || 0) / next.education, `Schooling ${Math.round((r.people.edu || 0) * 100)}% of ${Math.round(next.education * 100)}% needed: build schools near homes`);
  if (kind === 'combine') {
    const ok = !spot.blocked && spot.flat, [a, b] = [spot.w, spot.d];
    need('room', ok ? 1 : 0, ok ? `Room to combine into ${a} × ${b}` : spot.flat ? `Something else stands on its ${a} × ${b} plot` : `Its ${a} × ${b} plot must be flat: level the ground`, ok ? 'Room' : `Needs room (${a} × ${b})`);
  }
  const progress = needs.reduce((s, n) => s + n.part, 0) / needs.length;
  const title = kind === 'combine' ? `Combine into ${spot.w} × ${spot.d}: ${next.name}` : `Level ${l.tier} → ${next.tier}: ${next.name}`;
  return { lot: l, tier: l.tier, top: false, kind, nextTier: next.tier, nextName: next.name, title, progress, ready: needs.every(n => n.ok), needs, spot, design: next };
}
/** Rebuild lot l as u.design on u.spot, taking in the small buildings there. */
function applyLevelUp(r, l, u, R) {
  const { x, z, w, d, absorb } = u.spot, P = plots(r);
  const value = lotValue(r, x, z, w, d);
  if (absorb.length) { const gone = new Set(absorb); r.lots = r.lots.filter(o => !gone.has(o)); }
  const face = w === l.w && d === l.d && u.design.size[0] !== u.design.size[1] ? l.face : faceOf(r, P, x, z, w, d, u.design.size);
  Object.assign(l, makeLot(r, u.design, l.zone, x, z, value, R, w, d, face), { n: l.n });
  reindexLots(r);
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

/**
 * How attractive the city is to newcomers, ~0.1..2 (1 = an ordinary well-run colony). parts are for the UI:
 *   land 0..1 (average land value where people live), jobs −1..1 (open jobs + / unemployed −), power + water shares
 *   0..1, tax (demand lost to a homes tax over 9%), rep −1..1, scared (a wall broke lately), links (other cities).
 */
export function appeal(r) {
  const p = r.people.total, c = census(r);
  let vs = 0, vn = 0; for (const l of r.lots) if (l.zone === 'R' && l.people) { vs += (l.value ?? 0.3) * l.people; vn += l.people; }
  const workers = p * WORK_SHARE;
  const parts = {
    land: vn ? vs / vn : 0.3,
    jobs: clamp((c.jobs - workers) / Math.max(20, workers), -1, 1),
    power: Math.min(1, r.power?.share ?? 1),
    water: Math.min(1, r.waterNet ? r.waterNet.share : 1),
    tax: Math.max(0, (r.taxes.R - 0.09) * 100) * (T.taxGrowthPenalty ?? 4) / 100,
    rep: r.reputation || 0,
    scared: r.threat?.lastBreach != null && r.day - r.threat.lastBreach < (T.breachScareDays ?? 8),
    links: linkBoost(r).appeal,
    parks: parksNearHomes(r) * (T.parkAppeal ?? 0.3),   // parks and plazas near homes draw newcomers
  };
  let v = (0.6 + 0.55 * parts.land + 0.25 * parts.jobs + 0.25 * parts.rep + parts.links + parts.parks - parts.tax) * effect(r, 'appeal');
  v *= 0.35 + 0.65 * parts.power;
  v *= 0.75 + 0.25 * parts.water;
  if (parts.scared) v *= T.breachScare ?? 0.7;
  if (r.shutdown) v *= 0.3;
  return { value: clamp(v, 0.1, 2), parts };
}
/** Share 0..1 of residents whose home sits in a park's or plaza's reach (the leisure layer, averaged by people). */
export function parksNearHomes(r) {
  let s = 0, n = 0; const N = r.size;
  for (const l of r.lots) if (l.people && l.zone === 'R') { s += Math.min(1, (r.tiles.leisure?.[(l.z + (l.d >> 1)) * N + l.x + (l.w >> 1)] || 0) * 1.5) * l.people; n += l.people; }
  return n ? s / n : 0;
}
/** People a game day who'd move in right now if there were room: (T.immigrateBase + T.immigrateSqrt × √people) × appeal. */
export function immigrationRate(r) {
  return ((T.immigrateBase ?? 1.2) + (T.immigrateSqrt ?? 0.08) * Math.sqrt(Math.max(0, r.people.total))) * appeal(r).value;
}
/** Daily: newcomers move straight into free homes (after anyone already waiting). → people who came. */
export function immigrate(r, days) {
  if (!r.founded) return 0;
  const free = housing(r) - r.people.total - r.people.arriving;
  if (free <= 0) { r.people.immAcc = 0; return 0; }
  r.people.immAcc = (r.people.immAcc || 0) + immigrationRate(r) * days;
  const come = Math.min(free, Math.floor(r.people.immAcc));
  if (come <= 0) return 0;
  r.people.immAcc -= come; r.people.total += come; r.people.moved = (r.people.moved || 0) + come;
  return come;
}

// ---------------- money ----------------
/** The Colony grant: T.colonyGrant credits a month at founding, fading to nothing by T.grantFadePop people. */
export function colonyGrant(r) {
  if (!r.founded) return 0;
  return Math.max(0, (T.colonyGrant ?? 0) * (1 - r.people.total / Math.max(1, T.grantFadePop ?? 1500)));
}
const WALL_ID = { 1: 'wall-1', 2: 'wall-2', 3: 'wall-3', 9: 'gate' };
export function monthBudget(r) {
  const c = census(r), rateOf = z => r.taxes[z] / 0.09;
  const employed = Math.min(c.jobs, r.people.total * 0.58);
  const fill = c.jobs ? employed / c.jobs : 0;
  // shops and industry pay more per job the bigger the building (tier 1 → 1×, tier 4 → 1.75×)
  let cPay = 0, iPay = 0; for (const l of r.lots) if (l.jobs && l.kind === 'zoned') { const k = l.jobs * (1 + ((l.tier || 1) - 1) * 0.25); if (l.zone === 'C') cPay += k; else if (l.zone === 'I') iPay += k; }
  const income = {
    R: r.people.total * (T.taxPerPerson ?? 1.6) * rateOf('R'),
    C: cPay * fill * (T.taxPerJob ?? 2.1) * rateOf('C'),
    I: iPay * fill * (T.taxPerJob ?? 2.1) * rateOf('I'),
    grant: colonyGrant(r),
  };
  const roads = cat().roads; let roadUp = 0; for (let i = 0; i < r.size * r.size; i++) { const lv = r.tiles.road[i]; if (lv) roadUp += roads[lv - 1].upkeep; }
  // walls and turrets pay today's catalog upkeep (so a rebalance reaches old saves too)
  const wallRate = {}; for (const [v, id] of Object.entries(WALL_ID)) wallRate[v] = item(id)?.upkeep ?? 1;
  let wallUp = 0; for (let i = 0; i < r.size * r.size; i++) { const v = r.tiles.wall[i]; if (v) wallUp += wallRate[v] ?? 1; }
  const upkeepOf = (id, fallback) => { const e = id ? item(id) : null; return e && e.upkeep != null ? e.upkeep : (fallback || 0); };
  const upkeep = {
    buildings: r.lots.reduce((s, l) => s + (l.kind === 'placed' ? upkeepOf(l.id, l.upkeep) : (l.upkeep || 0)), 0) * effect(r, 'upkeep'), roads: roadUp, walls: wallUp,
    turrets: r.turrets.reduce((s, t) => s + upkeepOf(t.id, t.upkeep), 0),
    loans: r.loans.reduce((s, l) => s + l.amount * (T.loanInterest ?? 0.04) / 12 + l.amount / l.months, 0),
    transit: transitUpkeep(r),
    policies: policyUpkeep(r),
  };
  const inTotal = income.R + income.C + income.I + income.grant, outTotal = Object.values(upkeep).reduce((a, b) => a + b, 0);
  return { income, upkeep, inTotal, outTotal, net: inTotal - outTotal };
}
/** Days in a budget month: monthBudget() is written per month, money is paid per day (owner #85: show it per day). */
export const DAYS_PER_MONTH = 30;
/** Credits paid at the next day tick: the month's net ÷ 30; while broke (shutdown) only income minus loans. One source
 *  for the sim and the HUD's "+X/day" (owner report #85, 2026-11-16). */
export function dailyNet(r, b = monthBudget(r), shut = r.money < (T.debtShutdown ?? -5000)) {
  return shut ? (b.inTotal - b.upkeep.loans) / DAYS_PER_MONTH : b.net / DAYS_PER_MONTH;
}
/** How far through the current game day (0..1): the next pay-out comes at 1 (owner report #79). */
export function dayProgress(r) { return r.day - Math.floor(r.day); }
export function takeLoan(r) { const a = T.loanSize ?? 25000; if (r.loans.length >= 3) return false; r.loans.push({ amount: a, months: 48, left: 48 }); r.money += a; return true; }

// ---------------- industry ----------------
/** Daily: outposts send raw material home (only while powered, deposit not empty); refineries convert. */
export function industry(r, days) {
  const N = r.size, made = { metal: 0, stone: 0, crystal: 0, steel: 0, concrete: 0, cells: 0 };
  for (const l of r.lots) {
    const e = item(l.id); if (!e) continue;
    if (e.deposit && (l.powered ?? 0) > 0) {
      let left = 0, tiles = []; for (let k = 0; k < l.d; k++) for (let j = 0; j < l.w; j++) { const i = (l.z + k) * N + l.x + j; if (r.ter.amount[i] && ['', 'metal', 'stone', 'crystal'][r.ter.deposit[i]] === e.deposit) { left += r.ter.amount[i]; tiles.push(i); } }
      const take = Math.min(left, (T.outpostRate ?? 9) * effect(r, 'mine') * days * l.powered);
      for (const i of tiles) { const t = Math.min(r.ter.amount[i], take / tiles.length + 0.5); r.ter.amount[i] -= t; if (r.ter.amount[i] <= 0) r.ter.deposit[i] = 0; }
      r.stock[e.deposit] += take; made[e.deposit] += take; l.dry = left - take <= 0;
    }
    if (e.refine && (l.powered ?? 0) > 0) {
      const want = (T.refineRate ?? 6) * effect(r, 'refine') * days * l.powered, need = want * (T.refineIn ?? 2);
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
  immigrate(r, 1);
  const made = industry(r, 1);
  // money is paid once a game day: the day's share of the budget (dailyNet) — the HUD shows exactly this number
  const b = monthBudget(r);
  const shut = r.money < (T.debtShutdown ?? -5000);
  const pay = dailyNet(r, b, shut);
  r.money += pay;
  r.budget = b; r.shutdown = shut;
  for (const k of [...RAW, ...REFINED]) r.rates[k] = r.rates[k] * 0.9 + made[k] * 0.1;
  r.rates.money = r.rates.money * 0.9 + pay * 0.1;
  if (day % 30 === 0) monthTick(r, R);
  else if (day % 3 === 0) { solveLandValue(r); transitLandValue(r); grow(r, R); }
  checkMilestone(r);
  researchTick(r);   // R&D finishes on a day tick (also while away)
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
  const target = clamp((r.rates.money > 0 ? 0.2 : -0.2) + Math.min(0.4, r.lots.filter(l => item(l.id)?.landmark).length * 0.15) + Math.min(0.2, r.lots.reduce((t, l) => t + (item(l.id)?.rep || 0), 0)) + (r.shutdown ? -0.4 : 0) + Math.min(0.3, r.people.total / 20000), -1, 1);
  r.reputation += (target - r.reputation) * 0.2;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export { reindexLots };
