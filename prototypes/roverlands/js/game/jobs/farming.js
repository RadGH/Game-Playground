// Farming (Expansion 1 M6, docs/EXPANSION-1.md "Jobs"): the fields of the Marrow Flats farm belt and every rule of the
// farming job. PURE — no DOM, no three, no Rapier, no sockets, no clock of its own (every call is handed `now`), and the
// same seed always gives the same farm. The room runs it (js/net/jobs-core.js calls farmingReferee), the page runs a
// copy of the field state to draw it (js/game/crops.js + js/game/farm-play.js), and tests/farming.test.js checks it.
//
// THE FIELDS. A field is one of the county's farm plots (world.sites.farms.plots, js/world/county), cut into square
// CELL x CELL m cells. Field 1 is the plot nearest the farm yard, field 2 the next nearest, and so on. A cell's id is a
// small whole number (field base + row * cols + col), the same on every machine, and that is what the wire carries.
//
// ONE CELL'S LIFE:   GROWN --cut--> CUT --plant--> PLANTED --water--> WATERED --(grow time)--> GROWN
//   cut    harvester header, or the tractor's mower with the deck down  (the crop goes into the harvester's hopper, or
//          into a produce trailer the tractor is towing)
//   plant  a seed drill towed with its work switch on (door_sow)
//   water  a water bowser towed with its spray on (door_spray); it carries a tank that empties as it sprays and is
//          filled again at a water point
//   grow   takes growMs (4 minutes; 2 with Rich soil), a little longer or shorter per cell so a field ripens in a wave
// A cell also keeps a "replanted" mark from the moment it is watered until it is cut again (level 5 counts those).
//
// Every field grows one crop: 1-2 wheat, 3 carrots, 4 pumpkins, 5 sunflowers, then round again (FIELD_CROPS).
// A player may work field n once their farming level opens it (data/jobs.json level.fields).
//
//   fieldsFrom(sites)                        -> [{ n, id, x, z, w, h, cols, rows, base, count, crop, x0, z0 }]
//   cellAt(fields, id)                       -> { f, i, j, x, z } | null       the cell's field and middle
//   cellsUnder(fields, strip, keep?)         -> ids whose middle is under a work strip { x, z, fx, fz, hw, hd }
//   createFarm({ fields, seed })             -> the field state (apply / tick / snapshot / load / counts)
//   farmRules(upgrades)                      -> how this player's upgrades change the play
//   openFields(job, profileLike)             -> how many fields this player may work
//   sellPoints(sites) / waterPoints(sites) / yardVehicles(sites)
//   deliveryPay(steps, units, km)            -> gold for selling a load
//   goalMet(need, ctx) / goalText(need, ctx) -> a level's goal (data/jobs.json level.need) and its progress line
//   farmingReferee(api)                      -> the room's referee for this job (js/net/jobs-core.js gives `api`)

export const CELL = 4;                         // metres per field cell
export const CROPS = Object.freeze(['wheat', 'carrot', 'pumpkin', 'sunflower']);
export const CROP_NAMES = Object.freeze({ wheat: 'Wheat', carrot: 'Carrots', pumpkin: 'Pumpkins', sunflower: 'Sunflowers' });
export const FIELD_CROPS = Object.freeze(['wheat', 'wheat', 'carrot', 'pumpkin', 'sunflower', 'wheat', 'carrot', 'pumpkin', 'sunflower', 'wheat', 'carrot', 'pumpkin']);
export const ST = Object.freeze({ GROWN: 0, CUT: 1, PLANTED: 2, WATERED: 3 });
export const STEPS = Object.freeze({ cut: [ST.GROWN, ST.CUT], plant: [ST.CUT, ST.PLANTED], water: [ST.PLANTED, ST.WATERED] });
export const GROW_MS = 240_000;
export const BATCH = 10;                       // cells per paid batch (data/jobs.json steps are gold per batch)
export const REACH = 16;                       // metres: a reported cell must be this close to the vehicle that worked it
export const SELL_RADIUS = 30;                 // metres from a sell point's middle
export const WATER_RADIUS = 14;                // metres from a water point
export const TOOL = Object.freeze({ harvester: 'cut', tractor: 'cut', seed_drill: 'plant', water_bowser: 'water' });
export const HOLDS = Object.freeze({ harvester: 'hopper', produce_trailer: 'trailer' });

/** How a player's farming upgrades change the play (each one changes what you do, not just a number on the pay). */
export function farmRules(upgrades = []) {
  const has = id => upgrades.includes(id);
  return {
    drillScale: has('farm_wide_drill') ? 2 : 1,          // the seed drill plants a strip twice as wide
    waterCap: has('farm_big_tank') ? 240 : 120,          // cells the bowser waters before it needs a water point
    growMs: has('farm_quick_grow') ? GROW_MS / 2 : GROW_MS,
    trailerCap: has('farm_tall_sides') ? 225 : 150,      // cells of crop a produce trailer holds
    hopperCap: 200,                                      // the harvester's own hopper
  };
}

/** The farm plots as fields, nearest the yard first. Sites without a farm -> []. */
export function fieldsFrom(sites) {
  const plots = (sites?.farms?.plots || []).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.z) && p.w > CELL && p.h > CELL);
  const y = sites?.farms?.yard || sites?.farms?.barn || { x: 0, z: 0 };
  const sorted = plots.slice().sort((a, b) => Math.hypot(a.x - y.x, a.z - y.z) - Math.hypot(b.x - y.x, b.z - y.z) || String(a.id).localeCompare(String(b.id)));
  let base = 0;
  return sorted.map((p, k) => {
    const cols = Math.floor(p.w / CELL), rows = Math.floor(p.h / CELL);
    const f = { n: k + 1, id: String(p.id), x: p.x, z: p.z, y: p.y ?? null, w: p.w, h: p.h, cols, rows, base, count: cols * rows,
      crop: FIELD_CROPS[k % FIELD_CROPS.length], x0: p.x - cols * CELL / 2, z0: p.z - rows * CELL / 2 };
    base += f.count;
    return f;
  });
}
export const totalCells = fields => (fields.length ? fields[fields.length - 1].base + fields[fields.length - 1].count : 0);
/** Which field a cell id is in (binary search over the bases). */
export function fieldOf(fields, id) {
  let lo = 0, hi = fields.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1, f = fields[m]; if (id < f.base) hi = m - 1; else if (id >= f.base + f.count) lo = m + 1; else return f; }
  return null;
}
export function cellAt(fields, id) {
  if (!Number.isInteger(id) || id < 0) return null;
  const f = fieldOf(fields, id); if (!f) return null;
  const k = id - f.base, i = k % f.cols, j = (k / f.cols) | 0;
  return { f, i, j, x: f.x0 + (i + 0.5) * CELL, z: f.z0 + (j + 0.5) * CELL };
}
/**
 * The cells under a work strip: middle (x, z), facing (fx, fz) (any length), half-width hw across, half-depth hd along.
 * A cell counts when its middle is within hw + 1 m across and hd + CELL/2 along (forgiving: a 2 m mower still cuts a
 * full 4 m row). `keep(id, field)` filters (open fields, the right state).
 */
export function cellsUnder(fields, { x, z, fx = 0, fz = 1, hw, hd }, keep = null) {
  const fl = Math.hypot(fx, fz) || 1, ux = fx / fl, uz = fz / fl;
  const A = hd + CELL / 2, C = hw + 1, R = Math.hypot(A, C);
  const out = [];
  for (const f of fields) {
    if (x + R < f.x0 || x - R > f.x0 + f.cols * CELL || z + R < f.z0 || z - R > f.z0 + f.rows * CELL) continue;
    const i0 = Math.max(0, Math.floor((x - R - f.x0) / CELL)), i1 = Math.min(f.cols - 1, Math.floor((x + R - f.x0) / CELL));
    const j0 = Math.max(0, Math.floor((z - R - f.z0) / CELL)), j1 = Math.min(f.rows - 1, Math.floor((z + R - f.z0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = f.x0 + (i + 0.5) * CELL - x, dz = f.z0 + (j + 0.5) * CELL - z;
      const along = dx * ux + dz * uz, across = -dx * uz + dz * ux;
      if (Math.abs(along) > A || Math.abs(across) > C) continue;
      const id = f.base + j * f.cols + i;
      if (!keep || keep(id, f)) out.push(id);
    }
  }
  return out;
}

/** A small, fixed hash: the same id + seed always gives the same 0..1. */
export function hash01(seed, id) {
  let h = (Math.imul(id + 1, 2654435761) ^ Math.imul(seed | 0, 2246822519)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; h = Math.imul(h, 3266489917) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** How long one cell takes to grow: growMs, give or take 12% (per cell, fixed by the seed). */
export const growFor = (seed, id, growMs) => Math.round(growMs * (0.88 + 0.24 * hash01(seed, id)));

/**
 * The state of every field cell. All cells start GROWN (a ripe farm belt to cut).
 *   farm.apply(step, ids, now, { growMs }) -> the ids that changed (only the right state moves: you cannot plant a
 *                                             standing crop or water bare soil)
 *   farm.tick(now)                       -> the ids that just ripened (WATERED -> GROWN)
 *   farm.set(state, ids, now, growMs?)   -> force cells into a state (the page copies the room's news this way)
 *   farm.counts(field)                   -> { total, grown, cut, planted, watered, replanted }
 *   farm.snapshot(now) / farm.load(snap, now)   the whole farm as a short message (run lengths)
 *   farm.progress(id, now)               -> 0..1 how far a watered cell has grown (1 for a grown one)
 */
export function createFarm({ fields, seed = 1 }) {
  const N = totalCells(fields);
  const st = new Uint8Array(N), again = new Uint8Array(N), ripe = new Float64Array(N), sown = new Float64Array(N);
  const watered = new Set();
  function set(state, ids, now = 0, growMs = GROW_MS) {
    const out = [];
    for (const id of ids) {
      if (!Number.isInteger(id) || id < 0 || id >= N) continue;
      if (st[id] === state && state !== ST.WATERED) continue;
      st[id] = state;
      if (state === ST.WATERED) { again[id] = 1; sown[id] = now; ripe[id] = now + growFor(seed, id, growMs); watered.add(id); }
      else watered.delete(id);
      if (state === ST.CUT) again[id] = 0;
      out.push(id);
    }
    return out;
  }
  function apply(step, ids, now, { growMs = GROW_MS } = {}) {
    const tr = STEPS[step]; if (!tr) return [];
    // each cell once: set() lets WATERED through again (to restart a regrow), so a repeated id in one water message
    // used to count, pay and empty the tank once per copy
    const ok = [], seen = new Set();
    for (const id of ids) if (Number.isInteger(id) && id >= 0 && id < N && st[id] === tr[0] && !seen.has(id)) { seen.add(id); ok.push(id); }
    return set(tr[1], ok, now, growMs);
  }
  function tick(now) {
    const out = [];
    for (const id of watered) if (ripe[id] <= now) out.push(id);
    for (const id of out) { st[id] = ST.GROWN; watered.delete(id); }
    return out;
  }
  function counts(f) {
    const c = { total: f.count, grown: 0, cut: 0, planted: 0, watered: 0, replanted: 0 };
    for (let id = f.base; id < f.base + f.count; id++) {
      const s = st[id];
      if (s === ST.GROWN) c.grown++; else if (s === ST.CUT) c.cut++; else if (s === ST.PLANTED) c.planted++; else c.watered++;
      if (again[id]) c.replanted++;
    }
    return c;
  }
  /** Run lengths of (state | replanted << 2), plus the growing cells grouped by time left (5 s steps). */
  function snapshot(now) {
    const rle = []; let cur = -1, run = 0;
    for (let id = 0; id < N; id++) { const v = st[id] | (again[id] << 2); if (v === cur) run++; else { if (run) rle.push(cur, run); cur = v; run = 1; } }
    if (run) rle.push(cur, run);
    const groups = new Map();
    for (const id of watered) { const left = Math.max(0, Math.round((ripe[id] - now) / 5000) * 5000); if (!groups.has(left)) groups.set(left, []); groups.get(left).push(id); }
    return { n: N, rle, grow: [...groups].map(([left, ids]) => [left, ...ids]) };
  }
  function load(snap, now) {
    if (!snap || snap.n !== N || !Array.isArray(snap.rle)) return false;
    let id = 0;
    watered.clear();
    for (let k = 0; k + 1 < snap.rle.length; k += 2) {
      const v = snap.rle[k], n = snap.rle[k + 1];
      for (let q = 0; q < n && id < N; q++, id++) { st[id] = v & 3; again[id] = (v >> 2) & 1; if (st[id] === ST.WATERED) { watered.add(id); ripe[id] = now; sown[id] = now; } }
    }
    for (const g of snap.grow || []) { const left = g[0]; for (let k = 1; k < g.length; k++) { const i = g[k]; if (i >= 0 && i < N && st[i] === ST.WATERED) { ripe[i] = now + left; sown[i] = now + left - GROW_MS; } } }
    return true;
  }
  function progress(id, now) {
    if (st[id] === ST.GROWN) return 1;
    if (st[id] !== ST.WATERED) return 0;
    const span = Math.max(1, ripe[id] - sown[id]);
    return Math.max(0, Math.min(1, (now - sown[id]) / span));
  }
  return { N, st, again, ripe, apply, tick, set, counts, snapshot, load, progress, state: id => st[id], get growing() { return watered.size; } };
}

/** How many fields this player may work: the `fields` of the highest farming level they have open. */
export function openFields(job, unlocked) {
  const top = Array.isArray(unlocked) && unlocked.length ? Math.max(...unlocked) : 1;
  const L = job?.levels?.find(l => l.n === top) || job?.levels?.[0];
  return Math.max(1, L?.fields || 1);
}
/** The level that opens field n (for "Field 3 opens at farming level 3"). */
export function levelForField(job, n) { return job?.levels?.find(l => (l.fields || 1) >= n)?.n ?? null; }

/** Where produce sells: the Marrow Flats market (the farm town's) and the Port Lindell freight depot (level 4). */
export function sellPoints(sites) {
  const out = [];
  for (const p of sites?.places || []) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    if (p.kind === 'market' || (p.kind === 'depot' && p.city === 'port_lindell')) {
      const yard = p.yard && Number.isFinite(p.yard.x0) ? { x: (p.yard.x0 + p.yard.x1) / 2, z: (p.yard.z0 + p.yard.z1) / 2 } : { x: p.x, z: p.z };
      out.push({ id: p.id, city: p.city || null, name: p.kind === 'market' ? p.name : `${p.name} (produce)`, x: Math.round(yard.x * 10) / 10, z: Math.round(yard.z * 10) / 10, r: SELL_RADIUS });
    }
  }
  return out;
}
/** Where the bowser fills up: the farm yard's water tank (its north-east corner, clear of the barns and the bales). */
export function waterPoints(sites) {
  const y = sites?.farms?.yard;
  if (!y || !Number.isFinite(y.x)) return [];
  return [{ id: 'farm_water', name: 'Water point', x: y.x + (y.hx || 40) - 6, z: y.z + (y.hz || 30) - 14, y: y.y ?? null, r: WATER_RADIUS }];
}
/**
 * The farm's own machines, parked in the yard for anyone to use (the room puts them down like pad vehicles): three
 * tractors along the yard's south edge (the side the fields are on), facing the fields (-z, yaw = PI), each with an
 * implement right behind its tow hook — back up a metre and press T. The yard's road comes in at its middle, so the
 * row leaves that gap.
 */
export function yardVehicles(sites) {
  const y = sites?.farms?.yard;
  if (!y || !Number.isFinite(y.x)) return [];
  const h = (y.y ?? 0) + 1.6, z0 = y.z - (y.hz || 30) + 5;
  // tractor tow hook 1.95 m behind its middle; each implement's hitch is `hitch` m ahead of its own middle
  const pairs = [[-34, 'seed_drill', 2.2], [-22, 'water_bowser', 2.55], [20, 'produce_trailer', 2.9]];
  const out = [];
  for (const [dx, kind, hitch] of pairs) {
    out.push({ kind: 'tractor', x: y.x + dx, z: z0, y: h, yaw: Math.PI });
    out.push({ kind, x: y.x + dx, z: z0 + 1.95 + hitch + 0.7, y: h, yaw: Math.PI });
  }
  return out;
}
/** Selling: units x per_unit, plus per_km for every unit for every kilometre the crop was carried. */
export function deliveryPay(steps, units, km) {
  const per = steps?.deliver_per_unit ?? 3, perKm = steps?.deliver_per_km ?? 2;
  return Math.max(0, Math.round(units * per + units * perKm * Math.max(0, km)));
}

/**
 * A level's goal (data/jobs.json level.need) against one player's progress this session.
 *   ctx = { prog, fields, farm, open, now }
 *   prog = { fields: { [n]: { cut, plant, water } }, sold: { crop: units }, full: n, loads: [{ at, city, part }] }
 * need kinds: { cycle: share, crop }   cut, plant AND water that share of one field of that crop
 *             { fullLoad: n }           sell n loads that were at least 90% full
 *             { sell: { crop: share } } sell that share of a field's worth of that crop
 *             { loads: n, city, within, part }  n loads (each at least `part` full) sold in that city within `within` s
 *             { replanted: share }      every open field at least that share replanted (watered since it was cut) at once
 */
export function goalMet(need, ctx) { return goalState(need, ctx).done; }
export function goalText(need, ctx) { return goalState(need, ctx).text; }
function goalState(need, { prog = {}, fields = [], farm = null, open = 1, now = 0 } = {}) {
  if (!need) return { done: false, text: '' };
  const pct = x => `${Math.floor(Math.min(1, x) * 100)}%`;
  if (need.cycle) {
    let best = null;
    for (const f of fields.slice(0, open)) {
      if (need.crop && f.crop !== need.crop) continue;
      const p = prog.fields?.[f.n] || {}, s = Math.min(p.cut || 0, p.plant || 0, p.water || 0) / f.count;
      if (!best || s > best.s) best = { f, p, s };
    }
    if (!best) return { done: false, text: 'No such field open yet' };
    const { f, p } = best, w = x => pct((x || 0) / f.count / need.cycle);
    return { done: best.s >= need.cycle, text: `Field ${f.n}: cut ${w(p.cut)} · planted ${w(p.plant)} · watered ${w(p.water)}` };
  }
  if (need.fullLoad) return { done: (prog.full || 0) >= need.fullLoad, text: `Full loads sold: ${Math.min(prog.full || 0, need.fullLoad)} / ${need.fullLoad}` };
  if (need.sell) {
    const [crop, share] = Object.entries(need.sell)[0];
    const f = fields.find(x => x.crop === crop); const want = Math.ceil((f?.count || 300) * share), have = prog.sold?.[crop] || 0;
    return { done: have >= want, text: `${CROP_NAMES[crop] || crop} sold: ${Math.min(have, want)} / ${want}` };
  }
  if (need.loads) {
    const since = now - (need.within || 1800) * 1000;
    const n = (prog.loads || []).filter(l => l.at >= since && (!need.city || l.city === need.city) && l.part >= (need.part ?? 0.5)).length;
    return { done: n >= need.loads, text: `Loads sold${need.city ? ' there' : ''} in the last ${Math.round((need.within || 1800) / 60)} min: ${Math.min(n, need.loads)} / ${need.loads}` };
  }
  if (need.replanted) {
    if (!farm) return { done: false, text: '' };
    const list = fields.slice(0, open);
    let ok = 0;
    for (const f of list) if (farm.counts(f).replanted / f.count >= need.replanted) ok++;
    return { done: list.length > 0 && ok === list.length, text: `Fields replanted: ${ok} / ${list.length}` };
  }
  return { done: false, text: '' };
}

// ================================================================================================ the room's referee
const STEP_WORD = { cut: 'Crop cut', plant: 'Seed planted', water: 'Watered' };
/**
 * The farming referee. js/net/jobs-core.js hands it `api` (see that file's header for every call) and routes every
 * `{ t:'job', id:'farming', step, … }` here. Messages it sends (all `{ t:'job', id:'farming', k, … }`):
 *   k:'full'  { farm: snapshot, veh: [[id, load, cap, water, wcap]], open }   on joining the county (and on `sync`)
 *   k:'cells' { st, cells, g? }      cells that changed (g = the grow time used, for watered ones)
 *   k:'veh'   { veh, load, cap, water, wcap, crop? }   a hopper / trailer / tank changed
 *   k:'prog'  { level, text, open }  to one player: their next level's goal and how far along it is
 *   k:'sold'  { veh, units, gold, where }               a load was sold (everyone paid hears it through `profile`)
 */
export function farmingReferee(api) {
  const job = api.job, steps = job.steps || {};
  const fields = fieldsFrom(api.sites);
  const farm = createFarm({ fields, seed: api.seed });
  const sells = sellPoints(api.sites), waters = waterPoints(api.sites);
  const veh = new Map();          // entId -> { load, cap, crop: { wheat: n }, fx, fz (sum of where the crop came from), water, wcap }
  const prog = new Map();         // pid -> progress this session (goalState's `prog`)
  const told = new Map();         // pid -> last progress text sent
  const warned = new Map();       // 'pid:what' -> time a refusal was last said (one sentence every 6 s at most)
  let lastTick = 0;
  if (!fields.length) return null;

  const progOf = pid => { if (!prog.has(pid)) prog.set(pid, { fields: {}, sold: {}, full: 0, loads: [] }); return prog.get(pid); };
  const vehOf = (id, kind) => {
    if (!veh.has(id)) veh.set(id, { load: 0, cap: 0, crop: {}, fx: 0, fz: 0, water: 0, wcap: 0, kind });
    return veh.get(id);
  };
  const vehRow = (id, v) => [id, v.load, v.cap, v.water, v.wcap];
  const tellVeh = id => { const v = veh.get(id); if (v) api.cast({ k: 'veh', veh: id, load: v.load, cap: v.cap, water: v.water, wcap: v.wcap, crop: topCrop(v) }); };
  const topCrop = v => Object.entries(v.crop).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const warn = (pid, what, why) => { const k = pid + ':' + what, t = api.now(); if (t - (warned.get(k) || 0) < 6000) return; warned.set(k, t); api.deny(pid, why); };
  const openFor = pid => openFields(job, api.unlocked(pid));
  const rulesFor = pid => farmRules(api.upgrades(pid));
  const flat = (a, x, z) => Math.hypot(a[0] - x, a[2] - z);

  function sendProg(pid) {
    const P = api.player(pid); if (!P?.profile) return;
    const L = api.nextLevel(pid), row = L ? job.levels.find(l => l.n === L) : null;
    const text = row ? goalText(row.need, { prog: progOf(pid), fields, farm, open: openFor(pid), now: api.now() }) : 'Every level done. Keep farming for gold.';
    const key = `${L}|${text}`;
    if (told.get(pid) === key) return;
    told.set(pid, key);
    api.send(pid, { k: 'prog', level: L, text, open: openFor(pid) });
  }
  /** After progress changed: a player whose next level's goal is now met gets it (jobDone pays everyone helping). */
  function checkLevels(pids, at, vehicle) {
    for (const pid of pids) {
      const L = api.nextLevel(pid); if (!L) { sendProg(pid); continue; }
      const row = job.levels.find(l => l.n === L);
      if (row?.need && goalMet(row.need, { prog: progOf(pid), fields, farm, open: openFor(pid), now: api.now() })) api.levelDone(pid, L, { at, vehicle });
      sendProg(pid);
    }
  }
  function centroid(ids) {
    let x = 0, z = 0, n = 0;
    for (const id of ids) { const c = cellAt(fields, id); if (c) { x += c.x; z += c.z; n++; } }
    return n ? [x / n, null, z / n] : null;
  }
  /** The vehicle the sender is driving (seat 0), or null. */
  function driving(P) { if (!P.seat || P.seat[1] !== 0) return null; return api.ent(P.seat[0]); }

  function work(pid, P, msg) {
    const step = msg.step, tool = api.ent(msg.veh);
    if (!tool || TOOL[tool.kind] !== step) return warn(pid, 'tool', 'That is not the right machine for this.');
    const D = driving(P);
    if (!D) return warn(pid, 'drive', 'Drive the machine to work the field.');
    // the tool is the vehicle you drive (harvester, tractor) or one you tow (you own it, it is right behind you)
    if (tool.id !== D.id && !(tool.owner === pid && D.pos && tool.pos && flat(D.pos, tool.pos[0], tool.pos[2]) <= 14)) return warn(pid, 'tow', 'Hitch it to your tractor first.');
    if (step === 'cut' && tool.kind === 'tractor' && !tool.acts?.mower) return warn(pid, 'mower', 'Lower the mower first.');
    if (step === 'plant' && !tool.acts?.door_sow) return warn(pid, 'sow', 'Switch the seed drill on first.');
    if (step === 'water' && !tool.acts?.door_spray) return warn(pid, 'spray', 'Switch the spray on first.');
    const at = tool.pos; if (!at) return;
    const R = rulesFor(pid), open = openFor(pid);
    let shut = 0, far = 0;
    let ids = (msg.cells || []).filter(id => {
      const c = cellAt(fields, id); if (!c) return false;
      if (c.f.n > open) { shut = c.f.n; return false; }
      if (flat(at, c.x, c.z) > REACH * (step === 'plant' ? R.drillScale : 1)) { far++; return false; }
      return true;
    });
    if (shut && !ids.length) return warn(pid, 'shut', `Field ${shut} opens at farming level ${levelForField(job, shut) ?? '?'}.`);
    if (far && !ids.length) return warn(pid, 'far', 'Those cells are not where your machine is.');
    // the bowser waters only as far as its tank goes
    let tank = null;
    if (step === 'water') {
      tank = vehOf(tool.id, tool.kind);
      if (tank.wcap === 0) { tank.wcap = R.waterCap; tank.water = R.waterCap; }      // it comes full the first time
      if (tank.water <= 0) { tellVeh(tool.id); return warn(pid, 'dry', 'The tank is empty — fill it at the water point in the farm yard.'); }
      ids = ids.slice(0, tank.water);
    }
    // a machine can only cover ground so fast: about 40 cells a second (a wide drill flat out does ~12)
    if (!api.take(`${tool.id}:${step}`, 40, 160, ids.length)) return;
    const changed = farm.apply(step, ids, api.now(), { growMs: R.growMs });
    if (!changed.length) return;
    if (tank) { tank.water -= changed.length; tellVeh(tool.id); }
    api.cast({ k: 'cells', st: STEPS[step][1], cells: changed, ...(step === 'water' ? { g: R.growMs } : {}) });
    // the crop goes into the harvester's hopper, or the produce trailer the tractor tows
    if (step === 'cut') {
      let bin = null;
      if (tool.kind === 'harvester') bin = tool;
      else if (msg.to != null) { const T = api.ent(msg.to); if (T?.kind === 'produce_trailer' && T.owner === pid && T.pos && flat(T.pos, at[0], at[2]) <= 16) bin = T; }
      if (bin) {
        const v = vehOf(bin.id, bin.kind);
        v.cap = Math.max(v.cap, bin.kind === 'harvester' ? R.hopperCap : R.trailerCap);
        const room = Math.max(0, v.cap - v.load), n = Math.min(room, changed.length);
        if (n > 0) {
          v.load += n;
          for (const id of changed.slice(0, n)) { const c = cellAt(fields, id); v.crop[c.f.crop] = (v.crop[c.f.crop] || 0) + 1; v.fx += c.x; v.fz += c.z; }
          tellVeh(bin.id);
        }
        if (n < changed.length) warn(pid, 'full', bin.kind === 'harvester' ? 'The hopper is full — sell at the market.' : 'The trailer is full — sell at the market.');
      } else if (tool.kind === 'tractor') warn(pid, 'nobin', 'Tow a produce trailer behind the mower to keep the crop.');
    }
    // pay (in batches) everyone in the vehicle you drive or within 30 m, and give each of them the progress
    const where = centroid(changed);
    const paid = api.pay({ pid, step, count: changed.length, at: where, vehicle: D.id, why: `${job.name} · ${STEP_WORD[step]}` });
    for (const q of paid) {
      const g = progOf(q).fields;
      for (const id of changed) { const f = fieldOf(fields, id); const r = (g[f.n] ||= { cut: 0, plant: 0, water: 0 }); r[step]++; }
    }
    checkLevels(paid, where, D.id);
  }
  function refill(pid, P, msg) {
    const tool = api.ent(msg.veh);
    if (!tool || tool.kind !== 'water_bowser' || !tool.pos) return;
    const D = driving(P);
    if (tool.owner !== pid || !D) return warn(pid, 'tow', 'Hitch the bowser to your tractor first.');
    const wp = waters.find(w => flat(tool.pos, w.x, w.z) <= w.r + 6);
    if (!wp) return warn(pid, 'nowater', 'Fill up at the water point in the farm yard.');
    const v = vehOf(tool.id, tool.kind), cap = rulesFor(pid).waterCap;
    if (v.water >= cap && v.wcap === cap) return;
    v.wcap = cap; v.water = cap;
    tellVeh(tool.id);
  }
  function sell(pid, P, msg) {
    const bin = api.ent(msg.veh);
    if (!bin || !HOLDS[bin.kind] || !bin.pos) return;
    const D = driving(P);
    if (!D || (bin.id !== D.id && bin.owner !== pid)) return warn(pid, 'sellown', 'Drive (or tow) the load to sell it.');
    if (bin.kind === 'produce_trailer' && !bin.acts?.door_bed) return warn(pid, 'tip', 'Tip the trailer to unload it.');
    const v = veh.get(bin.id);
    if (!v || v.load <= 0) return warn(pid, 'empty', 'Nothing to sell — cut a field first.');
    const sp = sells.find(s => flat(bin.pos, s.x, s.z) <= s.r + 10);
    if (!sp) return warn(pid, 'nomarket', 'Sell at the Produce Market in Marrow Flats (or the Port Lindell depot).');
    const units = v.load, from = [v.fx / units, 0, v.fz / units];
    const km = Math.hypot(from[0] - sp.x, from[2] - sp.z) / 1000;
    const gold = deliveryPay(steps, units, km), part = v.cap ? units / v.cap : 0, crops = { ...v.crop };
    const paid = api.payGold({ pid, gold, at: [sp.x, null, sp.z], vehicle: D.id, why: `${job.name} · Sold ${units} at ${sp.name}` });
    veh.set(bin.id, { ...v, load: 0, crop: {}, fx: 0, fz: 0 });
    tellVeh(bin.id);
    api.cast({ k: 'sold', veh: bin.id, units, gold, where: sp.name });
    const t = api.now();
    for (const q of paid) {
      const g = progOf(q);
      for (const [c, n] of Object.entries(crops)) g.sold[c] = (g.sold[c] || 0) + n;
      if (part >= 0.9) g.full++;
      g.loads.push({ at: t, city: sp.city, part });
      if (g.loads.length > 20) g.loads.shift();
    }
    checkLevels(paid, [sp.x, null, sp.z], D.id);
  }

  return {
    fields, farm, veh, prog,
    /** One `{ t:'job', id:'farming', step, … }` from a player in the county. */
    step(pid, msg) {
      const P = api.player(pid); if (!P || P.spec) return;
      if (msg.step === 'sync') return this.resync(pid);
      if (msg.step === 'cut' || msg.step === 'plant' || msg.step === 'water') return work(pid, P, msg);
      if (msg.step === 'refill') return refill(pid, P, msg);
      if (msg.step === 'sell') return sell(pid, P, msg);
    },
    /** About once a second: cells that ripened. */
    tick() {
      const t = api.now(); if (t - lastTick < 1000) return; lastTick = t;
      const ripe = farm.tick(t);
      for (let k = 0; k < ripe.length; k += 400) api.cast({ k: 'cells', st: ST.GROWN, cells: ripe.slice(k, k + 400) });
      if (ripe.length) for (const pid of prog.keys()) checkLevels([pid], null, null);
    },
    /** Everything a player arriving in the county needs to draw the farm. */
    resync(pid) {
      api.send(pid, { k: 'full', farm: farm.snapshot(api.now()), veh: [...veh].map(([id, v]) => vehRow(id, v)), open: openFor(pid) });
      told.delete(pid); sendProg(pid);
    },
    /** The farm's own machines for the yard (room-core parks them like pad vehicles). */
    fixtures: () => yardVehicles(api.sites),
    /** A player's job record changed (an upgrade bought, a level done): tell them their fields + goal again. */
    profileChanged(pid) { told.delete(pid); sendProg(pid); },
  };
}
