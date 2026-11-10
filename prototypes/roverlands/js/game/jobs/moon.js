// Moon Work (Expansion 1 M12, docs/EXPANSION-1.md "Jobs" + README "Moon jobs"): the four jobs done in the Crater
// Crawler on the Moon — sample runs, crater jumps, supply runs and the Moon survey — their pure rules and the room's
// referee for them. PURE: no DOM / three / Rapier / sockets; every time comes from `api.now()`.
//
// THE MOON'S SITES. The room is built on the County's sites; the Moon's job sites are `sites.moon` =
// moonJobSites(moonWorld) (the server builds them with the county, the page adds them in solo when it builds the Moon).
// The referee reads them when a step arrives, so a room that has none yet just says "a moment".
//
// SAMPLE RUNS. Each of the 7 sample sites holds ROCKS glowing samples (fixed spots from the seed); one taken comes
//   back after REGROW_MS. Grab one with the rover's arm (T, stopped beside it; the reach grows with the Crater lamp) or
//   on foot (hold E beside it with the rover close by): it rides in that rover's BIN (3; 6 with the Big sample bin).
//   Stop at the Greywatch Sample Drop to hand the bin in: each sample pays (pay.sample + km × pay.per_km) × its
//   rarity (common 1, uncommon 1.6, RARE 2.6 — the floors of the steep craters, Orrin and Vandry). km = the site to the
//   drop. Everyone who put a sample in that bin, everyone in the rover and anyone within 30 m is paid the whole amount.
// CRATER JUMPS. Six ramps (two practice kickers by the base, four on crater aprons aimed at the bowl). Leaving a ramp
//   is `launch`, touching down is `land { p, on: upright }`: the room times the air itself and measures the distance
//   from the ramp's lip. pay = (jump.base + air × jump.per_s + metres × jump.per_m) × 1.5 upright (+ jump.ring when
//   you land inside the ramp's landing RING, in the crater bowl). The same ramp again within a minute pays half.
// SUPPLY RUNS. Stop in the Greywatch supply yard (by the Rover Garage) to load supply crates for Farside Depot (1; 3 on
//   the Crate rack); at Farside the return load is ice cores for Greywatch. A hard jolt (a jump's landing, a crater rim
//   taken flat out) bounces a crate out — it lies there glowing: drive up and stop beside it (or T) to load it again.
//   pay per crate = pay.crate + km × pay.crate_per_km (km = the run's length). A run with nothing dropped is CLEAN.
// MOON SURVEY. M10's survey kits on the Moon: the SAME kit machine (js/game/jobs/survey.js kitBench) over the Moon's own
//   survey grid (moonSurveyGrid: the Moon's heights, its craters + the base as special areas, Greywatch Base as the
//   office). Spawn a kit's crate from the phone, carry it in the rover, set it up at a spot that suits it (the four named
//   survey spots are good ones: a Seismic Probe on Hush Flat, a Radar Dish or Weather Mast on Lumen Crest, a Field Lab in
//   Kestle Basin, a Signal Relay up on Orrin Rim), then report at Greywatch. The page's survey glue sends its steps as
//   job 'survey'; on the Moon jobs-core hands them here (`claims`), and the kit machine answers as 'survey' too, so the
//   same page code works on both worlds. Reporting a Moon kit counts for this job's `kit` level need.
//
// Wire (client -> room, `{ t:'job', id:'moon', step, … }`):
//   sync · start · grab { veh, n: rock } · drop { veh } · load { veh } · jolt { veh, n: tenths of m/s² } ·
//   pick { veh, n: loose crate } · launch { veh, n: ramp } · land { veh, p, on: upright, n?: air time in tenths (game time) }
// Room -> client: k:'rocks' { list: [[id, ready]] } · k:'bins' { list } · k:'loose' { list } · k:'jump' {…} ·
//   k:'delivered' {…} · k:'order' { text, x, z } · k:'prog' { level, text }
import { isRevealed } from './registry.js';
import { kitBench } from './survey.js';
import { surveyGrid } from '../survey.js';

export const ROCKS = 3;                     // glowing samples at each site
export const REGROW_MS = 180000;            // a taken sample comes back after 3 minutes
export const BIN = 3, BIG_BIN = 6;
export const REACH = 6, LAMP_REACH = 11;    // metres from the rover to a sample its arm can take
export const FOOT_REACH = 3.2;              // on foot: beside it
export const FOOT_ROVER = 18;               // on foot: the rover the sample goes into is this close
export const DROP_R = 14;                   // stop this close to the Sample Drop
export const YARD_R = 24;                   // a supply yard (the garage at Greywatch, Farside Depot)
export const RACK = 1, BIG_RACK = 3;        // crates on the rover
export const JOLT = 30, RACK_JOLT = 70;     // m/s²: a jolt past this bounces a crate out (the rack straps them down)
export const PICK_R = 9;                    // metres from a loose crate
export const LOOSE_MS = 900000;             // a loose crate lies there 15 minutes
export const RAMP_R = 9;                    // the rover is this close to a ramp's lip when it takes off
export const MAX_AIR = 14;                  // s: a longer "jump" is not a jump
export const AIR_SPEED = 22, BOOST_SPEED = 30;   // m/s: the fastest a rover can cover ground in the air (booster: more)
export const SAME_RAMP_MS = 60000;
export const RARITY = Object.freeze({ common: 1, uncommon: 1.6, rare: 2.6 });
export const RARITY_OF_KIND = Object.freeze({ boulders: 'common', ridge: 'common', rille: 'uncommon', rim: 'uncommon', crater: 'uncommon' });
export const MOON_VEHICLES = Object.freeze(['moon_rover']);
export const CARGO = Object.freeze({ farside: 'supplies', greywatch: 'ice cores' });
const DEF_PAY = { sample: 30, per_km: 70, crate: 70, crate_per_km: 80, jump: { base: 10, per_s: 8, per_m: 0.5, ring: 50 } };

/** What the upgrades change. Every one changes how the job PLAYS (rule 5). */
export function moonRules(upgrades = []) {
  const has = id => upgrades.includes(id);
  return {
    bin: has('moon_bin') ? BIG_BIN : BIN,                       // Big sample bin: twice the samples a run
    reach: has('moon_motor') ? LAMP_REACH : REACH,              // Crater lamp + strong motor: the arm reaches further
    motor: has('moon_motor') ? { force: 1.45, top: 1.3 } : { force: 1, top: 1 },   // …and climbs crater walls
    lamp: has('moon_motor'),                                    // …and lights the dark side of a crater
    grip: has('moon_big_wheels') ? 1.3 : 1,                    // Mesh wheels: more grip in the dust
    booster: has('moon_thrusters'),                             // Jump booster: one extra push in the air
    airSpeed: has('moon_thrusters') ? BOOST_SPEED : AIR_SPEED,
    rack: has('moon_rack') ? BIG_RACK : RACK,                   // Crate rack: three crates, strapped down
    jolt: has('moon_rack') ? RACK_JOLT : JOLT,
  };
}

const xz = p => (Array.isArray(p) ? [p[0], p[2]] : [p.x, p.z]);
export function flat(a, b) { const [ax, az] = xz(a), [bx, bz] = xz(b); return Math.hypot(ax - bx, az - bz); }
function hash(seed, n) {
  let h = (Math.imul((n | 0) + 1, 2654435761) ^ Math.imul(seed | 0, 2246822519)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
const r2 = v => Math.round(v * 100) / 100;

/**
 * The Moon's job sites from a moon world (js/world/moon/moongen.js) — small, plain JSON the room can hold:
 * samples (with rarity: rare on a steep crater's floor), survey spots, ramps (with the lip and the landing ring), the
 * Sample Drop, the two supply yards, the base, the rille's line (the end-to-end drive).
 */
export function moonJobSites(world, { grid = true } = {}) {
  const s = world?.sites; if (!s?.samples) return null;
  const craters = world.craters || s.craters || [];
  const steepUnder = p => craters.find(c => c.steep && (c.size === 'big' || c.size === 'medium') && Math.hypot(p.x - c.x, p.z - c.z) < c.R * 0.62 && (c.rimY ?? 0) - (p.y ?? 0) > 8);
  const samples = s.samples.map(q => {
    const deep = q.kind === 'crater' && !!steepUnder(q);
    return { id: q.id, name: q.name, kind: q.kind, x: q.x, z: q.z, y: q.y, r: q.r || 12, rarity: deep ? 'rare' : RARITY_OF_KIND[q.kind] || 'common', deep };
  });
  const ramps = (s.ramps || []).map((r, i) => {
    const dx = Math.sin(r.yaw), dz = Math.cos(r.yaw), lip = { x: r2(r.x + dx * r.len / 2), z: r2(r.z + dz * r.len / 2) };
    const c = craters.find(q => q.id === r.ramp);
    const ring = c ? { x: c.x, z: c.z, r: r2(Math.max(7, Math.min(14, c.R * 0.3))), y: c.floorY ?? null }
      : { x: r2(r.x + dx * 46), z: r2(r.z + dz * 46), r: 8, y: null };
    return { i, id: r.ramp, name: r.name, x: r.x, z: r.z, yaw: r.yaw, len: r.len, h: r.h, lip, ring, crater: c?.name || null };
  });
  const pt = o => (o ? { x: o.x, z: o.z, y: o.y ?? null } : null);
  return {
    samples, ramps,
    survey: (s.survey || []).map(v => ({ id: v.id, name: v.name, kind: v.kind, x: v.x, z: v.z, y: v.y })),
    drop: { ...pt(s.sampleDrop), r: DROP_R, name: 'Sample Drop' },
    base: { ...pt(s.base), r: s.base?.r || 96, name: s.base?.name || 'Greywatch Base' },
    yards: [
      { id: 'greywatch', name: 'Greywatch supply yard', x: s.garage.x, z: s.garage.z, y: s.garage.y ?? null, r: YARD_R },
      { id: 'farside', name: s.depot?.name || 'Farside Depot', x: s.depot.x, z: s.depot.z + 10, y: s.depot.y ?? null, r: YARD_R },
    ],
    landing: pt(s.landing),
    rille: world.rille ? { name: world.rille.name, half: (world.rille.floorHalf || 16) + (world.rille.wall || 20), pts: world.rille.pts.map(p => [p[0], p[1]]) } : null,
    ...(grid ? { surveyGrid: moonSurveyGrid(world) } : {}),
  };
}

/** The Moon's survey grid (M10's surveyGrid over the Moon): craters as special areas, Greywatch Base as the office. */
export function moonSurveyGrid(world) {
  const w = Object.create(world);
  w.craters = (world.craters || []).map(c => ({ ...c, r: c.r ?? c.R }));          // the grid reads a crater's `r`
  const g = surveyGrid(w);
  const d = world.sites?.sampleDrop || world.sites?.base;
  if (d) g.office = { x: d.x, z: d.z, y: d.y ?? null, name: 'Greywatch Base', id: 'greywatch_base' };
  return g;
}

/** The glowing samples: ROCKS fixed spots round each site (same seed = same spots). -> [{ id, site, x, z }] */
export function sampleRocks(M, seed = 1) {
  const out = [];
  (M?.samples || []).forEach((s, i) => {
    for (let k = 0; k < ROCKS; k++) {
      const a = (k / ROCKS + hash(seed, i * 7 + k) * 0.25) * Math.PI * 2, r = 3 + hash(seed + 1, i * 7 + k) * Math.max(2, (s.r || 12) * 0.55);
      out.push({ id: i * ROCKS + k, site: i, x: r2(s.x + Math.cos(a) * r), z: r2(s.z + Math.sin(a) * r) });
    }
  });
  return out;
}

/** One sample's pay: (base + km × per_km) × rarity; km = the site to the drop. */
export function samplePay(pay = {}, { km, rarity }) {
  const p = { ...DEF_PAY, ...pay };
  return Math.round((p.sample + Math.max(0, km) * p.per_km) * (RARITY[rarity] || 1));
}
/** A jump's score (and its pay): air seconds, metres from the lip, upright, in the ring. */
export function jumpPay(pay = {}, { air, dist, upright, ring, repeat = false }) {
  const j = { ...DEF_PAY.jump, ...(pay.jump || {}) };
  const g = (j.base + Math.max(0, air) * j.per_s + Math.max(0, dist) * j.per_m) * (upright ? 1.5 : 1) + (ring && upright ? j.ring : 0);
  return Math.round(g * (repeat ? 0.5 : 1));
}
export function cratePay(pay = {}, { km, n = 1 }) {
  const p = { ...DEF_PAY, ...pay };
  return Math.round((p.crate + Math.max(0, km) * p.crate_per_km) * n);
}
/** Does an event meet a level's `need`? d = { samples, rare, jump, air, ring, crates, to, clean, round, kit } */
export function moonMeets(need = {}, d = {}) {
  if (need.samples != null && !((d.samples || 0) >= need.samples)) return false;
  if (need.rare != null && !((d.rare || 0) >= need.rare)) return false;
  if (need.jump != null && !((d.jump || 0) >= need.jump)) return false;
  if (need.ring && !d.ring) return false;
  if (need.crates != null && !((d.crates || 0) >= need.crates)) return false;
  if (need.to && need.to !== d.to) return false;
  if (need.clean && !d.clean) return false;
  if (need.round && !d.round) return false;
  if (need.kit != null && !((d.kit || 0) >= need.kit)) return false;
  return Object.keys(need).length > 0;
}
/** Is the landing point inside a ramp's ring? */
export const inRing = (ramp, p) => !!(ramp?.ring && flat(ramp.ring, p) <= ramp.ring.r);
/** Can a rover cover `dist` metres from the lip in `air` seconds? (generous: a measured jump, not a teleport) */
export const jumpPossible = (dist, air, rules = moonRules()) => air > 0.25 && air <= MAX_AIR && dist <= air * rules.airSpeed + 12;
/** The bit of the rille a point is beside (0..1 along it), or null when it is not in the rille. */
export function rilleAt(R, p) {
  if (!R?.pts?.length) return null;
  let best = null, bd = R.half;
  R.pts.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[2]); if (d < bd) { bd = d; best = i; } });
  return best == null ? null : best / Math.max(1, R.pts.length - 1);
}

// ---------------------------------------------------------------------------------------------------- the referee
export function moonReferee(api) {
  if (!api.sites?.launch && !api.sites?.moon) return null;       // the old world has no Moon to go to
  const job = api.job, pay = job.pay || {};
  const M = () => api.sites?.moon || null;
  const warned = new Map(), told = new Map(), sameRamp = new Map();
  let rocks = null, rockKey = null;
  const taken = new Map();               // rock id -> time it was taken
  const bins = new Map();                // rover ent id -> { samples: [{ rock, site, rarity, km }], crates, cargo, to, from, clean, trip, helpers: Set }
  const loose = new Map();               // loose crate id -> { id, x, z, cargo, to, from, at, veh }
  const flights = new Map();             // rover id -> { ramp, at, by }
  const rille = new Map();               // pid -> { dir, next, at }
  let nextLoose = 1, lastTick = 0;
  // the Moon survey: M10's kit machine on the Moon's grid, speaking as 'survey' so the page's survey glue works here too
  let bench = null, benchFor = null;
  const sapi = Object.assign(Object.create(api), {
    send: (pid, payload) => (api.sendAs ? api.sendAs('survey', pid, payload) : api.send(pid, payload)),
    cast: payload => (api.castAs ? api.castAs('survey', payload) : api.cast(payload)),
  });
  function theBench() {
    const g = M()?.surveyGrid; if (!g?.office) return null;
    if (benchFor !== g) { benchFor = g; bench = kitBench(sapi, { place: 'moon', grid: g, office: g.office, levels: false, officeR: 60,
      onReport: (pid, fresh) => { if (!fresh.length) return; award(pid, 'moon_kit'); levelUp([pid], { kit: fresh.length }, [g.office.x, null, g.office.z], null); prog(pid); } }); }
    return bench;
  }

  const warn = (pid, what, why) => { const k = pid + ':' + what, t = api.now(); if (t - (warned.get(k) || 0) < 4000) return; warned.set(k, t); api.deny(pid, why); };
  const row = n => job.levels.find(l => l.n === n) || null;
  const goal = pid => { const L = api.nextLevel(pid), r = row(L); return r ? (r.goal || r.title || '') : 'Every level done. Keep working the Moon for gold.'; };
  function prog(pid, extra = '') {
    const P = api.player(pid); if (!P?.profile || P.place !== 'moon') return;
    const L = api.nextLevel(pid), text = extra ? `Now: ${extra}` : goal(pid), key = `${L}|${text}`;     // (the phone shows the goal above it)
    if (told.get(pid) === key) return;
    told.set(pid, key);
    api.send(pid, { k: 'prog', level: L, text });
  }
  const award = (pid, when) => api.award?.(pid, when);
  const rules = pid => moonRules(api.upgrades(pid));
  function theRocks() {
    const m = M(); if (!m) return [];
    const key = m.samples.length + ':' + (m.samples[0]?.x ?? 0);
    if (rockKey !== key) { rocks = sampleRocks(m, api.seed); rockKey = key; }
    return rocks;
  }
  const ready = id => { const t = taken.get(id); return t == null || api.now() - t >= REGROW_MS; };
  const rocksMsg = () => ({ k: 'rocks', list: theRocks().map(r => [r.id, ready(r.id) ? 1 : 0]) });
  const pubBin = (veh, b) => ({ veh, samples: b.samples.map(s => [s.site, s.rarity]), crates: b.crates, cargo: b.cargo, to: b.to, clean: b.clean, trip: b.trip });
  const binsMsg = () => ({ k: 'bins', list: [...bins].filter(([, b]) => b.samples.length || b.crates).map(([v, b]) => pubBin(v, b)) });
  const looseMsg = () => ({ k: 'loose', list: [...loose.values()].map(c => ({ id: c.id, x: c.x, z: c.z, cargo: c.cargo })) });
  const binOf = veh => { let b = bins.get(veh); if (!b) { b = { samples: [], crates: 0, cargo: null, to: null, from: null, clean: true, trip: null, helpers: new Set() }; bins.set(veh, b); } return b; };
  const yardOf = id => M()?.yards.find(y => y.id === id) || null;
  const rover = id => { const e = api.ent(id); return e && MOON_VEHICLES.includes(e.kind) && e.place === 'moon' && e.pos ? e : null; };
  /** The rover the sender is in (any seat), if it is `veh`. Driver only when `drive`. */
  function aboard(P, veh, drive = false) {
    if (!P?.seat || P.seat[0] !== veh || (drive && P.seat[1] !== 0)) return null;
    return rover(veh);
  }
  function binText(b, rl) {
    const bits = [];
    if (b.samples.length) bits.push(`${b.samples.length}/${rl.bin} samples aboard`);
    if (b.crates) bits.push(`${b.crates} ${b.cargo === 'ice cores' ? 'ice core' : 'supply'} crate${b.crates === 1 ? '' : 's'} for ${yardOf(b.to)?.name || b.to}`);
    return bits.join(' · ');
  }
  function gate(pid, P) {
    if (!M()) { warn(pid, 'wait', 'The Moon job board is still waking up — try again in a moment.'); return false; }
    if (!isRevealed(P.profile, job)) { warn(pid, 'hidden', job.hidden || 'You have not found this job yet.'); return false; }
    return true;
  }
  function levelUp(pids, d, at, veh) {
    const before = new Map(pids.map(pid => [pid, api.nextLevel(pid)]));
    for (const pid of pids) {
      const L = before.get(pid), r = row(L);
      if (r && api.nextLevel(pid) === L && moonMeets(r.need || {}, d)) api.levelDone(pid, L, { at, vehicle: veh });
      told.delete(pid);
    }
  }

  // ---- sample runs
  function grab(pid, P, msg) {
    const r = theRocks().find(q => q.id === msg.n);
    if (!r) return warn(pid, 'rock', 'There is no sample there.');
    const rl = rules(pid);
    let veh = null;
    if (P.seat) {
      veh = aboard(P, msg.veh);
      if (!veh) return warn(pid, 'rover', 'Grab samples from a Crater Crawler (or on foot beside one).');
      if (flat(veh.pos, r) > rl.reach) return warn(pid, 'reach', `Stop right beside the sample — the arm reaches ${rl.reach} m.`);
    } else {
      veh = rover(msg.veh);
      if (!P.pos || flat(P.pos, r) > FOOT_REACH + 1) return warn(pid, 'reach', 'Stand right beside the sample.');
      if (!veh || flat(veh.pos, P.pos) > FOOT_ROVER) return warn(pid, 'rover', 'Bring a Crater Crawler close — the sample rides in its bin.');
    }
    if (!ready(r.id)) return warn(pid, 'gone', 'Someone already took that sample — it grows back in a few minutes.');
    if (!api.take('grab:' + pid, 1, 3)) return;
    const b = binOf(veh.id);
    if (b.samples.length >= rl.bin) return warn(pid, 'full', `The bin is full (${rl.bin}) — take the samples to the Sample Drop at Greywatch.`);
    const s = M().samples[r.site];
    taken.set(r.id, api.now());
    b.samples.push({ rock: r.id, site: r.site, rarity: s.rarity, km: flat(s, M().drop) / 1000, by: pid });
    b.helpers.add(pid);
    api.cast(rocksMsg()); api.cast(binsMsg());
    api.send(pid, { k: 'grabbed', site: s.name, rarity: s.rarity, n: b.samples.length, of: rl.bin });
    prog(pid, binText(b, rl));
  }
  function deliverSamples(pid, veh, b) {
    const g = b.samples.reduce((a, s) => a + samplePay(pay, s), 0);
    const helpers = [...b.helpers].filter(q => api.player(q));
    const paid = api.payTo({ pids: helpers.length ? helpers : [pid], gold: g, at: [M().drop.x, null, M().drop.z], vehicle: veh, why: `${job.name} · ${b.samples.length} sample${b.samples.length === 1 ? '' : 's'}` });
    const rare = b.samples.filter(s => s.rarity === 'rare').length;
    api.cast({ k: 'delivered', what: 'samples', n: b.samples.length, rare, gold: g, by: paid, veh });
    for (const q of paid) { award(q, 'moon_sample'); if (rare) award(q, 'moon_rare'); }
    levelUp(paid, { samples: b.samples.length, rare }, [M().drop.x, null, M().drop.z], veh);
    b.samples = [];
    return paid;
  }
  // ---- supply runs
  function load(pid, P, msg) {
    const veh = aboard(P, msg.veh, true);
    if (!veh) return warn(pid, 'rover', 'Drive a Crater Crawler into a supply yard to load.');
    const y = M().yards.find(q => flat(q, veh.pos) <= q.r);
    if (!y) return warn(pid, 'where', 'Load up in the Greywatch supply yard (by the Rover Garage) or at Farside Depot.');
    const b = binOf(veh.id), rl = rules(pid);
    if (b.crates) { if (b.from === y.id) return; return warn(pid, 'aboard', `You are carrying crates for ${yardOf(b.to)?.name}.`); }
    if (!api.take('load:' + pid, 0.5, 2)) return;
    const to = y.id === 'greywatch' ? 'farside' : 'greywatch';
    b.crates = rl.rack; b.cargo = CARGO[to]; b.to = to; b.from = y.id; b.clean = true; b.at = api.now();
    // a return load from Farside after a delivery there is a ROUND TRIP
    b.trip = y.id === 'farside' && b.lastTo === 'farside' && b.lastClean ? 'round' : null;
    b.helpers.add(pid);
    api.cast(binsMsg());
    const dest = yardOf(to);
    api.send(pid, { k: 'order', text: `${b.crates} crate${b.crates === 1 ? '' : 's'} of ${b.cargo} for ${dest.name}`, x: dest.x, z: dest.z });
    prog(pid, binText(b, rl));
  }
  function deliverCrates(pid, veh, b, y) {
    const km = flat(yardOf(b.from), y) / 1000, n = b.crates;
    const g = cratePay(pay, { km, n });
    const helpers = [...b.helpers].filter(q => api.player(q));
    const paid = api.payTo({ pids: helpers, gold: g, at: [y.x, null, y.z], vehicle: veh, why: `${job.name} · ${n} crate${n === 1 ? '' : 's'} to ${y.name}` });
    const round = b.trip === 'round' && b.clean;
    api.cast({ k: 'delivered', what: 'crates', n, gold: g, by: paid, to: y.id, clean: b.clean, round, veh });
    for (const q of paid) { if (y.id === 'farside') award(q, 'moon_farside'); if (round) award(q, 'moon_round'); }
    levelUp(paid, { crates: n, to: y.id, clean: b.clean, round }, [y.x, null, y.z], veh);
    b.lastTo = y.id; b.lastClean = b.clean;
    b.crates = 0; b.cargo = null; b.to = null; b.from = null; b.trip = null;
    // crates of this run still lying out on the regolith stay there for anyone (they still count for their yard)
    return paid;
  }
  function drop(pid, P, msg) {
    const veh = aboard(P, msg.veh, true);
    if (!veh) return warn(pid, 'rover', 'Drive the rover in to hand it over.');
    const b = bins.get(veh.id);
    if (!b || (!b.samples.length && !b.crates)) return warn(pid, 'empty', 'Nothing in the bin — collect samples (the glowing rocks) or load crates first.');
    if (!api.take('drop:' + pid, 0.7, 2)) return;
    let did = false;
    if (b.samples.length && flat(M().drop, veh.pos) <= DROP_R) { deliverSamples(pid, veh.id, b); did = true; }
    const y = b.crates ? M().yards.find(q => q.id === b.to && flat(q, veh.pos) <= q.r) : null;
    if (y) { deliverCrates(pid, veh.id, b, y); did = true; }
    if (!did) return warn(pid, 'where', b.samples.length ? 'Samples go to the Sample Drop at Greywatch Base.' : `These crates go to ${yardOf(b.to)?.name}.`);
    api.cast(binsMsg());
    prog(pid, binText(b, rules(pid)));
  }
  function jolt(pid, P, msg) {
    const veh = aboard(P, msg.veh, true); if (!veh) return;
    const b = bins.get(veh.id); if (!b?.crates) return;
    if (!api.take('jolt:' + veh.id, 1, 2)) return;
    if ((msg.n | 0) / 10 <= rules(pid).jolt) return;
    b.crates--; b.clean = false;
    const side = hash(api.seed, nextLoose) < 0.5 ? -1 : 1;
    const c = { id: nextLoose++, x: r2(veh.pos[0] + side * 3.2), z: r2(veh.pos[2] - 2.5), cargo: b.cargo, to: b.to, from: b.from, at: api.now(), veh: veh.id };
    loose.set(c.id, c);
    api.cast({ k: 'bounced', veh: veh.id, crate: c.id, left: b.crates });
    api.cast(looseMsg()); api.cast(binsMsg());
  }
  function pick(pid, P, msg) {
    const veh = aboard(P, msg.veh, true);
    if (!veh) return warn(pid, 'rover', 'Drive a Crater Crawler up to the crate.');
    const c = loose.get(msg.n); if (!c) return;
    if (flat(c, veh.pos) > PICK_R) return warn(pid, 'reach', 'Stop right beside the crate.');
    const b = binOf(veh.id), rl = rules(pid);
    if (b.crates && b.to !== c.to) return warn(pid, 'mix', 'That crate is going the other way — deliver what you carry first.');
    if (b.crates >= rl.rack) return warn(pid, 'full', 'No room on the rack.');
    loose.delete(c.id);
    if (!b.crates) { b.cargo = c.cargo; b.to = c.to; b.from = c.from; b.clean = false; }
    b.crates++; b.helpers.add(pid);
    api.cast(looseMsg()); api.cast(binsMsg());
    api.send(pid, { k: 'picked', left: b.crates });
    prog(pid, binText(b, rl));
  }
  // ---- crater jumps
  function launch(pid, P, msg) {
    const veh = aboard(P, msg.veh, true); if (!veh) return;
    const r = M().ramps.find(q => q.i === msg.n);
    if (!r || flat(r.lip, veh.pos) > RAMP_R) return warn(pid, 'ramp', 'That jump only counts off a ramp.');
    if (!api.take('launch:' + pid, 1, 2)) return;
    flights.set(veh.id, { ramp: r.i, at: api.now(), by: pid });
  }
  function land(pid, P, msg) {
    const veh = aboard(P, msg.veh, true); if (!veh) return;
    const f = flights.get(veh.id);
    if (!f || f.by !== pid) return warn(pid, 'ramp', 'That jump was not off a ramp.');
    flights.delete(veh.id);
    const r = M().ramps[f.ramp], p = msg.p, rl = rules(pid);
    // the air time: the room's own clock, or the page's game-time count when that is SHORTER (a slow machine runs its
    // physics slower than real time; a page can only ever claim less time than really passed, never more)
    const roomAir = (api.now() - f.at) / 1000, said = Number.isInteger(msg.n) ? msg.n / 10 : null;
    const air = said != null && said > 0 && said < roomAir ? said : roomAir, dist = p ? flat(r.lip, p) : 0;
    if (!p || flat(p, veh.pos) > 30 || !jumpPossible(dist, Math.min(roomAir, MAX_AIR), rl) || air > MAX_AIR) return warn(pid, 'odd', 'That landing did not add up — try the jump again.');
    const upright = !!msg.on, ring = upright && inRing(r, p);
    const k = pid + ':' + r.i, repeat = api.now() - (sameRamp.get(k) || -1e12) < SAME_RAMP_MS;
    sameRamp.set(k, api.now());
    const gold = jumpPay(pay, { air, dist, upright, ring, repeat });
    const paid = api.payTo({ pids: [pid], gold, at: p, vehicle: veh.id, why: `${job.name} · ${Math.round(dist)} m jump` });
    api.cast({ k: 'jump', by: paid, driver: pid, ramp: r.i, name: r.name, air: Math.round(air * 10) / 10, dist: Math.round(dist), upright, ring, gold, repeat });
    for (const q of paid) {
      if (dist >= 40) award(q, 'moon_jump');
      if (air >= 7) award(q, 'moon_air');
      if (ring) award(q, 'moon_ring');
    }
    levelUp(paid, { jump: dist, air, ring }, p, veh.id);
    for (const q of paid) prog(q);
  }
  function start(pid, P) {
    const L = api.nextLevel(pid), need = row(L)?.need || {}, m = M();
    let to = null, text = '';
    const here = P.pos || [m.base.x, 0, m.base.z];
    const nearestOf = list => list.slice().sort((a, b) => flat(a, here) - flat(b, here))[0];
    if (need.samples != null || need.rare != null) {
      const list = m.samples.filter(s => (need.rare ? s.rarity === 'rare' : true));
      to = nearestOf(list); text = need.rare ? `Bring a sample from ${to.name} (a steep crater floor)` : `Collect samples — the nearest glowing rocks are at ${to.name}`;
    } else if (need.jump != null || need.ring) {
      const list = need.ring ? m.ramps.filter(r => r.crater) : m.ramps;
      const r = nearestOf(list); to = r.lip; text = need.ring ? `Jump ${r.name} and land in the ring in the crater` : `Take a run at ${r.name}`;
    } else if (need.crates != null) {
      const y = yardOf(need.to === 'greywatch' ? 'farside' : 'greywatch'); to = y; text = `Load crates at ${y.name}`;
    } else if (need.kit != null) {
      to = nearestOf(m.survey); text = `Carry a survey kit to ${to.name}`;
    } else { to = m.drop; text = 'Samples, jumps, supply runs and survey kits all pay'; }
    api.send(pid, { k: 'order', text, x: to.x, z: to.z });
    prog(pid);
  }
  // ---- the end-to-end rille drive (an achievement): checkpoints in order, either way, in a rover
  function rilleTick() {
    const m = M(); if (!m?.rille) return;
    const t = api.now();
    for (const pl of api.players()) {
      if (pl.place !== 'moon' || pl.spec || !pl.seat || pl.seat[1] !== 0 || !pl.pos) { continue; }
      const e = api.ent(pl.seat[0]); if (!e || !MOON_VEHICLES.includes(e.kind)) continue;
      const f = rilleAt(m.rille, pl.pos); if (f == null) continue;
      const CP = [0, 0.25, 0.5, 0.75, 1];
      let st = rille.get(pl.pid);
      if (!st || t - st.at > 900000) {
        if (f < 0.04) st = { dir: 1, next: 1, at: t }; else if (f > 0.96) st = { dir: -1, next: 3, at: t }; else { if (st && t - st.at > 900000) rille.delete(pl.pid); continue; }
        rille.set(pl.pid, st); continue;
      }
      const target = CP[st.next];
      if (Math.abs(f - target) <= 0.04) {
        st.next += st.dir;
        if (st.next < 0 || st.next >= CP.length) { rille.delete(pl.pid); award(pl.pid, 'moon_rille'); api.send(pl.pid, { k: 'rille' }); }
      }
    }
  }

  return {
    claims: ['survey'],                  // jobs-core hands this referee the survey steps of players on the Moon
    get bench() { return theBench(); },
    get bins() { return bins; }, get loose() { return loose; }, get flights() { return flights; }, taken, rocks: theRocks, rille,
    step(pid, msg) {
      const P = api.player(pid); if (!P || P.spec || P.place !== 'moon') return;
      if (msg.id === 'survey') { if (gate(pid, P)) theBench()?.step(pid, msg); else if (msg.step === 'sync') theBench()?.resync(pid); return; }
      if (msg.step === 'sync') return this.resync(pid);
      if (!gate(pid, P)) return;
      switch (msg.step) {
        case 'start': return start(pid, P);
        case 'grab': return grab(pid, P, msg);
        case 'drop': return drop(pid, P, msg);
        case 'load': return load(pid, P, msg);
        case 'jolt': return jolt(pid, P, msg);
        case 'pick': return pick(pid, P, msg);
        case 'launch': return launch(pid, P, msg);
        case 'land': return land(pid, P, msg);
      }
    },
    tick() {
      const t = api.now(); if (t - lastTick < 500) return; lastTick = t;
      for (const [id, c] of loose) if (t - c.at > LOOSE_MS) { loose.delete(id); api.cast(looseMsg()); }
      for (const [id, f] of flights) if (t - f.at > MAX_AIR * 3000) flights.delete(id);     // (wall clock: a slow page's jump takes longer)
      // samples growing back: tell everyone once each comes back
      for (const [id, at] of taken) if (t - at >= REGROW_MS) { taken.delete(id); api.cast(rocksMsg()); }
      rilleTick();
      bench?.tick();
    },
    resync(pid) {
      const P = api.player(pid); if (!P || P.place !== 'moon') return;
      told.delete(pid);
      if (!M()) return;
      api.send(pid, rocksMsg()); api.send(pid, binsMsg()); api.send(pid, looseMsg());
      theBench()?.resync(pid);
      if (isRevealed(P.profile, job)) prog(pid);
    },
    profileChanged(pid) { told.delete(pid); prog(pid); },
  };
}
