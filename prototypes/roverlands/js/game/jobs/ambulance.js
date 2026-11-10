// Ambulance (Expansion 1 M7, docs/EXPANSION-1.md "Jobs"): someone is hurt somewhere in the county; drive (or fly) there,
// load them, and bring them to a hospital. Quick pays more, gentle pays a bonus. PURE: no DOM / three / Rapier /
// sockets; every time comes from `now`. The room runs ambulanceReferee; the page draws the patient and measures the ride
// (js/game/jobs-play/ambulance.js).
//
// A CALL is one patient at a spot: a car off a highway (levels 1-2), a farm accident beside a field, a hiker hurt on the
// Highgate switchbacks (level 3), a climber on the floor of Tollen Gorge (level 4 — only the helicopter gets down there).
// LOAD: stop an ambulance or the helicopter within LOAD_R of them and either stay at the wheel (the crew does it) or get
// out and hold E beside them. A bed takes one (two with the Second stretcher upgrade).
// THE RIDE: the driver's machine measures the jolts (how hard the vehicle's speed changes in a moment, gravity left out)
// and reports the worst of each second; one past BUMP (soft suspension: BUMP x 1.5) is a hard bump.
// DROP: stop at a hospital (Port Lindell, Highgate). Pay to everyone in the vehicle / within 30 m and whoever loaded:
//   base + km × per_km   (km = from where the patient was to the hospital)
//   + 25% when the trip took no longer than km at 36 km/h + 60 s       (quick)
//   + gentle_bonus × that × (1 − hard bumps / 3)                        (gentle; nothing at 3 bumps — never less pay)
//
// Wire (client -> room, `{ t:'job', id:'ambulance', step, … }`): start · load { veh } · jolt { veh, n: worst jolt this
// second in tenths of m/s² } · drop { veh } · sync.
// Room -> client: k:'patients' { list } · k:'call' { patient, text } · k:'bump' { veh, bumps } · k:'delivered' { gold, … } · k:'prog'.
import { flat, placesOf, nearest, pick, inYard, kit } from './calls.js';

export const LOAD_R = 16;              // metres from the patient the vehicle must stop
export const ON_FOOT_R = 7;            // metres from the patient a helper on foot may load from
export const BUMP = 18;                // m/s² (~1.8 g) — a hard bump
export const WAIT_MS = 20 * 60_000;    // a patient nobody fetches is taken by someone else (no pay, no harm)
export const AMB_VEHICLES = Object.freeze(['ambulance', 'helicopter']);

export function ambRules(upgrades = []) {
  const has = id => upgrades.includes(id);
  return { bump: BUMP * (has('amb_soft_ride') ? 1.5 : 1), beds: has('amb_two_beds') ? 2 : 1 };
}
/** Where patients can be: { crash, farm, hiker, gorge } lists of { id, x, z, y }. */
export function patientSpots(sites) {
  const S = sites?.jobSpots || {};
  const farm = (sites?.farms?.plots || []).slice(0, 6).map((p, k) => ({ id: 'farm_' + k, x: Math.round((p.x + p.w / 2 + 3) * 10) / 10, z: p.z, y: p.y ?? null }));
  return { crash: S.crash || [], farm, hiker: S.hiker || [], gorge: S.gorge || [] };
}
export const hospitals = sites => placesOf(sites, 'hospital');
/** The kind of patient a call at this level is (data/jobs.json level.need.spot / level.spots). */
export function spotKindFor(row, seed, n) {
  if (row?.need?.spot) return row.need.spot;
  return pick(row?.spots?.length ? row.spots : ['crash', 'farm'], seed, n);
}
export function ambPay(pay = {}, { km, secs, bumps }) {
  const base = (pay.base ?? 50) + Math.max(0, km) * (pay.per_km ?? 45);
  const quick = secs <= km * 100 + 60 ? 0.25 * base : 0;
  const gentle = base * (pay.gentle_bonus ?? 0.5) * Math.max(0, 1 - bumps / 3);
  return { gold: Math.round(base + quick + gentle), quick: quick > 0, gentle: Math.round(gentle) };
}
/** A level's goal against a delivered patient: { spot, bumps, by: vehicle kind }. */
export function ambMeets(need = {}, d) {
  if (!d?.delivered) return false;
  if (need.gentle != null && d.bumps > need.gentle) return false;
  if (need.spot && d.spot !== need.spot) return false;
  if (need.by && d.by !== need.by) return false;
  return true;
}
const WHAT = { crash: 'Car crash', farm: 'Farm accident', hiker: 'Hurt hiker', gorge: 'Climber down in the gorge' };
const pub = p => ({ id: p.id, spot: p.spot, x: p.x, z: p.z, y: p.y, state: p.state, veh: p.veh ?? null, by: p.by, bumps: p.bumps, at: p.at });

export function ambulanceReferee(api) {
  if (!api.sites?.jobSpots) return null;
  const job = api.job, K = kit(api), spots = patientSpots(api.sites), H = hospitals(api.sites);
  if (!H.length || !spots.crash.length) return null;
  const patients = new Map();
  let nextId = 1, calls = 0, lastTick = 0;
  const open = () => [...patients.values()].filter(p => p.state !== 'done');
  const castAll = () => api.cast({ k: 'patients', list: open().map(pub) });
  const near = (list, p) => nearest(list, p);
  const callText = p => p.state === 'aboard' ? `${WHAT[p.spot]} aboard — to hospital (${p.bumps} hard bump${p.bumps === 1 ? '' : 's'})` : `${WHAT[p.spot]} — ${Math.round(near(H, p).d)} m from ${near(H, p).item.name}`;

  function start(pid) {
    const P = api.player(pid); if (!P || !P.pos) return K.warn(pid, 'start', 'Wait a moment and try again.');
    const mine = open().find(p => p.by === pid);
    if (mine) { api.send(pid, { k: 'call', patient: pub(mine), text: callText(mine) }); return K.warn(pid, 'start', 'You already have a patient to fetch.'); }
    if (!api.take('start:' + pid, 0.2, 2)) return K.warn(pid, 'start', 'No new calls just yet.');
    const L = K.levelFor(pid), kind = spotKindFor(K.row(L), api.seed, calls++);
    const taken = new Set(open().map(p => p.spotId));
    const list = (spots[kind]?.length ? spots[kind] : spots.crash).filter(s => !taken.has(s.id));
    const s = pick(list.length ? list : spots.crash, api.seed, calls * 5 + pid);
    const p = { id: nextId++, spot: spots[kind]?.length ? kind : 'crash', spotId: s.id, x: s.x, z: s.z, y: s.y ?? null, at: api.now(), by: pid, state: 'waiting', veh: null, bumps: 0, helpers: [pid] };
    patients.set(p.id, p);
    castAll();
    api.send(pid, { k: 'call', patient: pub(p), text: callText(p) });
    K.prog(pid, callText(p));
  }
  function load(pid, P, msg) {
    const v = api.ent(msg.veh);
    if (!v || !AMB_VEHICLES.includes(v.kind) || !v.pos) return K.warn(pid, 'veh', 'Load them into an ambulance (or the helicopter).');
    const p = open().filter(q => q.state === 'waiting').map(q => ({ q, d: flat(q, v.pos) })).sort((a, b) => a.d - b.d)[0]?.q;
    if (!p || flat(p, v.pos) > LOAD_R) return K.warn(pid, 'far', 'Stop the ambulance right beside the patient.');
    const inIt = P.seat && P.seat[0] === v.id, onFoot = !P.seat && P.pos && flat(P.pos, p) <= ON_FOOT_R;
    if (!inIt && !onFoot) return K.warn(pid, 'reach', 'Stand beside the patient to load them.');
    const R = ambRules(api.upgrades(pid)), aboard = open().filter(q => q.state === 'aboard' && q.veh === v.id).length;
    if (aboard >= R.beds) return K.warn(pid, 'beds', R.beds > 1 ? 'Both stretchers are taken — drop them off first.' : 'The stretcher is taken — drop that patient off first (or buy the Second stretcher).');
    p.state = 'aboard'; p.veh = v.id; p.loadedAt = api.now(); p.vkind = v.kind;
    if (!p.helpers.includes(pid)) p.helpers.push(pid);
    castAll();
    for (const q of p.helpers) K.prog(q, callText(p));
  }
  function jolt(pid, P, msg) {
    const v = api.ent(msg.veh); if (!v || !P.seat || P.seat[0] !== v.id || P.seat[1] !== 0) return;
    if (!api.take('jolt:' + v.id, 2, 4)) return;
    const R = ambRules(api.upgrades(pid)), a = Math.max(0, (msg.n | 0) / 10);
    if (a <= R.bump) return;
    const list = open().filter(q => q.state === 'aboard' && q.veh === v.id);
    for (const p of list) { p.bumps++; api.send(pid, { k: 'bump', veh: v.id, bumps: p.bumps }); K.prog(p.by, callText(p)); }
  }
  function drop(pid, P, msg) {
    const v = api.ent(msg.veh); if (!v || !v.pos) return;
    const list = open().filter(q => q.state === 'aboard' && q.veh === v.id);
    if (!list.length) return K.warn(pid, 'none', 'No patient aboard — fetch one first.');
    if (!P.seat || P.seat[0] !== v.id) return K.warn(pid, 'seat', 'Drive them in to drop them off.');
    const h = H.find(q => inYard(q, v.pos, 14));
    if (!h) return K.warn(pid, 'where', `Bring them to a hospital — ${H.map(q => q.name).join(' or ')}.`);
    for (const p of list) {
      const km = flat(p, h) / 1000, secs = (api.now() - p.at) / 1000, r = ambPay(job.pay, { km, secs, bumps: p.bumps });
      const paid = api.payTo({ pids: p.helpers, gold: r.gold, at: [h.x, null, h.z], vehicle: v.id, why: `${job.name} · ${WHAT[p.spot]}${r.quick ? ' · quick' : ''}${p.bumps === 0 ? ' · gentle' : ''}` });
      p.state = 'done';
      api.cast({ k: 'delivered', id: p.id, gold: r.gold, quick: r.quick, gentle: r.gentle, bumps: p.bumps, by: paid, where: h.name });
      const d = { delivered: true, spot: p.spot, bumps: p.bumps, by: p.vkind };
      K.levelUp(paid, need => ambMeets(need, d), [h.x, null, h.z], v.id);
      for (const q of paid) K.prog(q);
      patients.delete(p.id);
    }
    castAll();
  }
  return {
    patients, spots, hospitals: H,
    step(pid, msg) {
      const P = api.player(pid); if (!P || P.spec) return;
      if (msg.step === 'start') return start(pid);
      if (msg.step === 'load') return load(pid, P, msg);
      if (msg.step === 'jolt') return jolt(pid, P, msg);
      if (msg.step === 'drop') return drop(pid, P, msg);
      if (msg.step === 'sync') return this.resync(pid);
    },
    tick() {
      const t = api.now(); if (t - lastTick < 2000) return; lastTick = t;
      let gone = false;
      for (const p of patients.values()) if (p.state === 'waiting' && t - p.at > WAIT_MS) { patients.delete(p.id); gone = true; }
      if (gone) castAll();
    },
    resync(pid) { api.send(pid, { k: 'patients', list: open().map(pub) }); K.forget(pid); const m = open().find(p => p.by === pid); K.prog(pid, m ? callText(m) : ''); },
    fixtures() {
      // an ambulance in every hospital yard; the first hospital (Port Lindell) also keeps a helicopter for the gorge
      const out = [];
      H.forEach((p, k) => {
        const x0 = p.yard ? Math.min(p.yard.x0, p.yard.x1) : p.x - 20, x1 = p.yard ? Math.max(p.yard.x0, p.yard.x1) : p.x + 20;
        out.push({ kind: 'ambulance', x: x0 + 9, z: p.z, y: (p.y ?? 0) + 1.4, yaw: 0 });
        if (k === 0) out.push({ kind: 'helicopter', x: x1 - 11, z: p.z, y: (p.y ?? 0) + 1.2, yaw: 0 });
      });
      return out;
    },
    profileChanged(pid) { K.forget(pid); K.prog(pid); },
  };
}
