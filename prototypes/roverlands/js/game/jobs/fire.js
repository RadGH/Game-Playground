// Firefighting (Expansion 1 M7, docs/EXPANSION-1.md "Jobs"): something in the county catches fire, it burns hotter the
// longer it is left, and a fire truck's water cannon puts it out. PURE: no DOM / three / Rapier / sockets; every time
// comes from `now`. The room runs fireReferee (js/net/jobs-core.js); the page draws the flames from the room's news
// (js/game/jobs-play/fire.js) and reports where its water lands.
//
// A FIRE has `heat`; its severity is heat / HEAT_PER_SEV (1..10). Left alone, heat grows by one severity every
// GROW_SECS; a grass fire also spreads (its radius grows SPREAD m/s; level 3 wants it out before it passes 40 m), the
// others a little (up to 25% wider). Water from a fire truck's cannon that lands inside the fire takes DROP_HEAT of heat
// a drop (twice that with Foam mix); while it is being sprayed it does not grow. At heat 0 it is out and everyone who
// sprayed it (and everyone in their trucks, or within 30 m) is paid:
//   pay = base + km × per_km + peak severity × per_severity      (km = from the nearest fire station to the fire)
// The truck's tank holds TANK drops (twice with the Bigger water tank); a hydrant (every town gate) or a fire station
// fills it again. The cannon only counts water that lands within its reach of the truck (40% further with the cannon).
//
// Wire (client -> room, `{ t:'job', id:'fire', step, … }`):
//   start                     take a call (the phone's Start, or the station sign)
//   spray  { veh, p, n }      n drops of my cannon's water landed around p (my machine watched them land)
//   refill { veh }            my truck is at a hydrant / fire station
//   sync                      send me everything again
// Room -> client: k:'fires' { list } (every fire burning, to the whole county) · k:'tank' { veh, water, cap } ·
//   k:'call' { fire, text } (to the one who started it) · k:'out' { fire, gold, sev, by } · k:'prog' { level, text }.
import { flat, placesOf, nearest, pick, kit } from './calls.js';

export const HEAT_PER_SEV = 40;
export const GROW_SECS = 45;          // one severity step every 45 s left alone
export const DROP_HEAT = 0.25;        // heat one drop of water takes
export const SPREAD = 1 / 6;          // m/s a grass fire's edge moves out
export const TANK = 1500;             // drops a tank holds (the cannon throws ~100 a second)
export const REACH = 30;              // metres from the truck the cannon counts
export const HYDRANT_R = 14;
export const MAX_SEV = 10;
export const BURN_OUT_MS = 20 * 60_000;   // a fire nobody comes to burns itself out (no pay, no harm)
export const FIRE_VEHICLES = Object.freeze(['fire_truck']);

/** How a player's firefighting upgrades change the play. */
export function fireRules(upgrades = []) {
  const has = id => upgrades.includes(id);
  return { reach: REACH * (has('fire_long_hose') ? 1.4 : 1), tank: TANK * (has('fire_big_tank') ? 2 : 1), douse: has('fire_foam') ? 2 : 1 };
}
/** Everything in the county that can catch fire: the map's fire-risk spots (a crop field burns like grass) + the depots' warehouses. */
export function fireSites(sites) {
  const out = [];
  for (const f of sites?.fireRisk || []) if (Number.isFinite(f.x) && Number.isFinite(f.z)) out.push({ id: f.id, kind: f.kind === 'crop' ? 'grass' : f.kind, x: f.x, z: f.z, y: f.y ?? null, r: f.r || 10, town: f.town || null, crop: f.kind === 'crop' });
  for (const d of placesOf(sites, 'depot')) {
    const z = d.yard ? Math.min(d.yard.z0, d.yard.z1) - 8 : d.z;         // the warehouse is the building behind the yard
    out.push({ id: 'warehouse_' + d.city, kind: 'warehouse', x: d.x, z, y: d.y ?? null, r: 16, town: d.city });
  }
  return out;
}
/** Where a truck fills up: every fire station's yard and every town gate (a hydrant). */
export function hydrants(sites) {
  const out = placesOf(sites, 'fire_station').map(p => ({ id: p.id, name: p.name, x: p.x, z: p.z, r: HYDRANT_R + 4 }));
  for (const c of sites?.cities || []) for (const [s, g] of Object.entries(c.gates || {})) if (Number.isFinite(g.x)) out.push({ id: `${c.id}_hydrant_${s}`, name: `${c.name} hydrant`, x: g.x, z: g.z, r: HYDRANT_R });
  return out;
}
export const sevOf = f => Math.max(1, Math.min(MAX_SEV, Math.ceil(f.heat / HEAT_PER_SEV - 1e-9)));
/** A new fire at a site: level 5's starts at severity 8, the rest at 2. */
export function createFire({ id, site, by, now, sev = 2 }) {
  const heat = Math.min(MAX_SEV, sev) * HEAT_PER_SEV;
  return { id, site: site.id, kind: site.kind, name: site.name || null, x: site.x, z: site.z, y: site.y, r0: site.r, r: site.r, heat, peak: sevOf({ heat }), at: now, by, helpers: [], wetAt: 0, out: false };
}
/** dt seconds pass. A fire being sprayed (water in the last 2 s) holds; one left alone grows hotter, and spreads. */
export function growFire(f, dt, now) {
  if (f.out) return f;
  if (now - f.wetAt > 2000) {
    f.heat = Math.min(MAX_SEV * HEAT_PER_SEV, f.heat + dt * HEAT_PER_SEV / GROW_SECS);
    const maxR = f.kind === 'grass' ? f.r0 + 60 : f.r0 * 1.25;
    f.r = Math.min(maxR, f.r + dt * (f.kind === 'grass' ? SPREAD : SPREAD * 0.08));
  }
  f.peak = Math.max(f.peak, sevOf(f));
  return f;
}
/** n drops land in the fire. -> true when that put it out. */
export function douse(f, n, rules = fireRules(), now = 0) {
  if (f.out || n <= 0) return false;
  f.heat = Math.max(0, f.heat - n * DROP_HEAT * rules.douse);
  f.wetAt = now;
  if (f.heat <= 0) { f.out = true; return true; }
  return false;
}
export function firePay(pay = {}, km, sev) { return Math.round((pay.base ?? 60) + Math.max(0, km) * (pay.per_km ?? 40) + sev * (pay.per_severity ?? 25)); }
/** A level's goal (data/jobs.json level.need) against a fire that was just put out. */
export function fireMeets(need = {}, f) {
  if (!f?.out) return false;
  if (need.kind && f.kind !== need.kind) return false;
  if (need.maxR != null && f.r > need.maxR) return false;
  if (need.minSev != null && f.peak < need.minSev) return false;
  return true;
}
/** The kind of fire a call at this level is (need.kind first, else one of level.kinds) and how hot it starts. */
export function callFor(row, seed, n) {
  const kinds = row?.need?.kind ? [row.need.kind] : row?.kinds?.length ? row.kinds : ['hay'];
  return { kind: pick(kinds, seed, n), sev: row?.need?.minSev ?? 2 };
}
const NAMES = { hay: 'Hay fire', barn: 'Barn fire', grass: 'Grass fire', house: 'House fire', warehouse: 'Warehouse fire' };
export const fireName = f => NAMES[f.kind] || 'Fire';
const pub = f => ({ id: f.id, kind: f.kind, x: f.x, z: f.z, y: f.y, r: Math.round(f.r * 10) / 10, heat: Math.round(f.heat), sev: sevOf(f), peak: f.peak, by: f.by, town: f.town || null, at: f.at });

export function fireReferee(api) {
  if (!api.sites?.jobSpots) return null;            // the old world has no county to burn
  const job = api.job, K = kit(api);
  const sites = fireSites(api.sites), hyd = hydrants(api.sites), stations = placesOf(api.sites, 'fire_station');
  if (!sites.length || !stations.length) return null;
  const fires = new Map();                          // id -> fire
  const tanks = new Map();                          // truck id -> { water, cap }
  let nextId = 1, calls = 0, lastTick = 0, lastCast = 0;
  const live = () => [...fires.values()].filter(f => !f.out);
  const castFires = () => { lastCast = api.now(); api.cast({ k: 'fires', list: live().map(pub) }); };
  const tankOf = (id, cap) => { let t = tanks.get(id); if (!t) { t = { water: cap, cap }; tanks.set(id, t); } if (cap > t.cap) { t.water += cap - t.cap; t.cap = cap; } return t; };
  const tellTank = id => { const t = tanks.get(id); if (t) api.cast({ k: 'tank', veh: id, water: Math.round(t.water), cap: t.cap }); };
  const callText = f => `${fireName(f)} at ${placeName(f)}: severity ${sevOf(f)}`;
  function placeName(f) {
    const c = (api.sites.cities || []).find(q => q.id === f.town);
    if (f.kind === 'hay' || f.kind === 'barn') return 'Marrow Barn';
    if (f.kind === 'warehouse') return `the ${c?.name || ''} depot`.replace('the  ', 'the ');
    return c ? c.name : `${Math.round(f.x)}, ${Math.round(f.z)}`;
  }
  function start(pid) {
    const P = api.player(pid); if (!P || !P.pos) return K.warn(pid, 'start', 'Wait a moment and try again.');
    const mine = live().find(f => f.by === pid);
    if (mine) { api.send(pid, { k: 'call', fire: pub(mine), text: callText(mine) }); return K.warn(pid, 'start', `Your ${fireName(mine).toLowerCase()} is still burning.`); }
    if (!api.take('start:' + pid, 0.2, 2)) return K.warn(pid, 'start', 'No new calls just yet.');
    const L = K.levelFor(pid), row = K.row(L), want = callFor(row, api.seed, calls++);
    const burning = new Set(live().map(f => f.site));
    let list = sites.filter(s => s.kind === want.kind && !burning.has(s.id));
    if (!list.length) list = sites.filter(s => !burning.has(s.id));
    if (!list.length) return K.warn(pid, 'start', 'Everything is already on fire!');
    const site = pick(list, api.seed, calls * 7 + pid);
    const f = createFire({ id: nextId++, site, by: pid, now: api.now(), sev: want.sev });
    fires.set(f.id, f);
    castFires();
    api.send(pid, { k: 'call', fire: pub(f), text: callText(f) });
    K.prog(pid, callText(f));
  }
  function spray(pid, P, msg) {
    const truck = api.ent(msg.veh);
    if (!truck || !FIRE_VEHICLES.includes(truck.kind) || !P.seat || P.seat[0] !== truck.id) return K.warn(pid, 'truck', 'Spray from a fire truck\'s water cannon.');
    if (!Array.isArray(msg.p) || !truck.pos) return;
    const n = Math.max(0, Math.min(60, msg.n | 0)); if (!n) return;
    // the fire this water landed in (any fire: friends help with each other's)
    const f = live().find(q => flat(q, msg.p) <= q.r + 4 && (q.y == null || msg.p[1] == null || Math.abs(msg.p[1] - q.y) <= 18));
    if (!f) return;
    const R = fireRules(api.upgrades(pid));
    if (flat(truck.pos, msg.p) > R.reach + 4) return K.warn(pid, 'reach', `Too far — the cannon reaches ${Math.round(R.reach)} m. Drive closer.`);
    if (!api.take('spray:' + truck.id, 130, 260, n)) return;
    const t = tankOf(truck.id, R.tank);
    if (t.water <= 0) { tellTank(truck.id); return K.warn(pid, 'dry', 'The tank is empty — fill it at a hydrant (town gates) or a fire station.'); }
    const use = Math.min(n, t.water); t.water -= use;
    if (t.water <= 0 || api.now() - (t.told || 0) > 700) { t.told = api.now(); tellTank(truck.id); }
    if (!f.helpers.includes(pid)) f.helpers.push(pid);
    f.truck = truck.id;
    const out = douse(f, use, R, api.now());
    if (api.now() - lastCast > 500) castFires();
    if (out) finish(f);
  }
  function finish(f) {
    const st = nearest(stations, f), km = (st?.d ?? 0) / 1000, gold = firePay(job.pay, km, f.peak);
    const paid = api.payTo({ pids: f.helpers, gold, at: [f.x, f.y ?? null, f.z], vehicle: f.truck ?? null, why: `${job.name} · ${fireName(f)} out` });
    castFires();
    api.cast({ k: 'out', fire: pub(f), gold, sev: f.peak, by: paid });
    K.levelUp(paid, need => fireMeets(need, f), [f.x, f.y ?? null, f.z], f.truck ?? null);
    for (const q of paid) K.prog(q);
    fires.delete(f.id);
  }
  function refill(pid, P, msg) {
    const truck = api.ent(msg.veh);
    if (!truck || !FIRE_VEHICLES.includes(truck.kind) || !truck.pos || !P.seat || P.seat[0] !== truck.id) return;
    if (!hyd.some(h => flat(truck.pos, h) <= h.r)) return K.warn(pid, 'nohyd', 'Fill up at a hydrant (every town gate) or a fire station.');
    const cap = fireRules(api.upgrades(pid)).tank, t = tankOf(truck.id, cap);
    if (t.water >= t.cap) return;
    t.water = t.cap; tellTank(truck.id);
  }
  return {
    fires, tanks, sites, hydrants: hyd,
    step(pid, msg) {
      const P = api.player(pid); if (!P || P.spec) return;
      if (msg.step === 'start') return start(pid);
      if (msg.step === 'spray') return spray(pid, P, msg);
      if (msg.step === 'refill') return refill(pid, P, msg);
      if (msg.step === 'sync') return this.resync(pid);
      // anything else (e.g. a page claiming a fire is out) is not a step: only water puts a fire out
    },
    tick() {
      const t = api.now(); if (t - lastTick < 1000) return;
      const dt = lastTick ? (t - lastTick) / 1000 : 1; lastTick = t;
      let changed = false;
      for (const f of fires.values()) {
        const was = sevOf(f), wr = Math.round(f.r);
        growFire(f, dt, t);
        if (sevOf(f) !== was || Math.round(f.r) !== wr) changed = true;
        if (t - f.at > BURN_OUT_MS) { fires.delete(f.id); changed = true; }
      }
      if (changed || t - lastCast > 5000) castFires();
      for (const f of live()) K.prog(f.by, callText(f));
    },
    resync(pid) {
      api.send(pid, { k: 'fires', list: live().map(pub) });
      for (const [id, tk] of tanks) api.send(pid, { k: 'tank', veh: id, water: Math.round(tk.water), cap: tk.cap });
      K.forget(pid); const mine = live().find(f => f.by === pid); K.prog(pid, mine ? callText(mine) : '');
    },
    fixtures() {
      // a fire truck waiting in every fire station's yard (facing the street)
      return stations.map(p => ({ kind: 'fire_truck', x: (p.yard ? Math.min(p.yard.x0, p.yard.x1) : p.x - 20) + 12, z: p.z, y: (p.y ?? 0) + 1.6, yaw: 0 }));
    },
    profileChanged(pid) { K.forget(pid); K.prog(pid); },
  };
}
