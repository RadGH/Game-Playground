// Hauling (Expansion 1 M7, docs/EXPANSION-1.md "Jobs"): cargo between the county's freight depots. PURE: no DOM / three /
// Rapier / sockets; every time comes from `now`.
//
// WHAT YOU CARRY is decided by what you drive into a depot yard and stop:
//   Parcel Van                 parcels: STOPS drop-offs on that town's streets (5 with the Long-haul cab), one at a time
//   Longhaul Semi + box trailer    goods to another town's depot (the nearest one; the farthest with the Long-haul cab)
//   Longhaul Semi + tanker     fuel to Highgate (over the switchbacks) — from Highgate, to Port Lindell
//   Longhaul Semi + flatbed    a machine to the Skyreach launch site (level 5's load: rocket parts)
//   Trailhauler Six            crates to another town's depot (like the box trailer, lighter)
// THE LOAD keeps a condition (100). The driver's machine reports the worst jolt of each second; one past JOLT knocks
// some off (half with the Air-ride trailer) and now and then a crate falls off. Forgiving: condition only trims the pay
// (to 60% at worst) and never takes gold away.
// DELIVERY (stop at the right depot / the launch site / the next parcel stop):
//   pay = (base + km × per_km + tonnes × per_tonne) × (0.6 + 0.4 × condition / 100) × (1.3 on a long-haul route)
//   to the driver, their passengers and anyone within 30 m. Parcels pay each stop its share as you go.
// Delivering at the wrong place is refused with where it should go.
//
// Wire (client -> room): start · load { veh: truck, to?: trailer } · jolt { veh, n: tenths of m/s² } · drop { veh, to? } · sync.
// Room -> client: k:'loads' { list } · k:'order' { text, depot } · k:'spill' { veh, cond } · k:'delivered' · k:'prog'.
import { flat, placesOf, nearest, inYard, kit } from './calls.js';

export const STOPS = 3;
export const STOP_R = 14;
export const JOLT = 16;                // m/s² — a jolt past this knocks the load
export const JOLT_LOSS = 6;            // condition points per hard jolt (3 with the Air-ride trailer)
export const LAUNCH_R = 70;
export const HAUL_VEHICLES = Object.freeze(['semi_truck', 'army_truck', 'delivery_van']);
export const TRAILER_CARGO = Object.freeze({ trailer_box: 'box', trailer_tanker: 'tanker', trailer_flatbed: 'machine' });
export const TONNES = Object.freeze({ parcels: 1, box: 12, crates: 6, tanker: 20, machine: 18, rocket: 15 });
const NAME = { parcels: 'Parcels', box: 'Goods', crates: 'Crates', tanker: 'Fuel', machine: 'A machine', rocket: 'Rocket parts' };

export function haulRules(upgrades = []) {
  const has = id => upgrades.includes(id);
  return { joltLoss: has('haul_air_ride') ? JOLT_LOSS / 2 : JOLT_LOSS, longHaul: has('haul_sleeper'), stops: has('haul_sleeper') ? 5 : STOPS };
}
export const depots = sites => placesOf(sites, 'depot');
/** The cargo a vehicle (+ trailer) carries; level 5's flatbed load is rocket parts. */
export function cargoFor(truckKind, trailerKind, level = null) {
  if (truckKind === 'delivery_van') return 'parcels';
  if (truckKind === 'army_truck') return 'crates';
  if (truckKind === 'semi_truck') { const c = TRAILER_CARGO[trailerKind]; return c === 'machine' && level === 5 ? 'rocket' : c || null; }
  return null;
}
/**
 * Where a load picked up at depot `from` goes: { kind: 'depot', place } | { kind: 'launch', x, z, r } | { kind: 'stops', list }.
 * Box / crates: another town's depot (nearest; the farthest on a long haul). Fuel: Highgate (Port Lindell from Highgate).
 */
export function destFor(cargo, from, sites, rules = haulRules(), seed = 1, n = 0) {
  const D = depots(sites).filter(d => d.city !== from.city);
  if (cargo === 'parcels') {
    const all = sites?.jobSpots?.stops?.[from.city] || [];
    const k = (seed + n) % Math.max(1, all.length);
    const list = all.slice(k).concat(all.slice(0, k)).slice(0, rules.stops);
    return { kind: 'stops', list: list.map(s => ({ ...s, done: false })) };
  }
  if (cargo === 'machine' || cargo === 'rocket') {
    const L = sites?.launch; return L ? { kind: 'launch', x: L.x, z: L.z, r: LAUNCH_R, name: L.name || 'the launch site' } : null;
  }
  if (cargo === 'tanker') {
    const to = D.find(d => d.city === (from.city === 'highgate' ? 'port_lindell' : 'highgate')) || D[0];
    return to ? { kind: 'depot', place: to } : null;
  }
  if (!D.length) return null;
  const sorted = D.slice().sort((a, b) => flat(a, from) - flat(b, from));
  return { kind: 'depot', place: rules.longHaul ? sorted[sorted.length - 1] : sorted[0] };
}
export const destName = d => (!d ? '?' : d.kind === 'depot' ? d.place.name : d.kind === 'launch' ? d.name : 'the parcel stops');
export function haulPay(pay = {}, { km, tonnes, cond, longHaul }) {
  const base = (pay.base ?? 40) + Math.max(0, km) * (pay.per_km ?? 35) + tonnes * (pay.per_tonne ?? 15);
  return Math.round(base * (0.6 + 0.4 * Math.max(0, Math.min(100, cond)) / 100) * (longHaul ? 1.3 : 1));
}
/** One hard jolt on a load. -> { cond, spilled: a crate fell off (the condition crossed 75 / 50 / 25) }. */
export function knock(load, rules = haulRules()) {
  const was = load.cond;
  load.cond = Math.max(0, load.cond - rules.joltLoss);
  const spilled = [75, 50, 25].some(t => was > t && load.cond <= t);
  return { cond: load.cond, spilled };
}
export function haulMeets(need = {}, d) { return !!d?.delivered && (!need.cargo || need.cargo === d.cargo) && (need.cond == null || d.cond >= need.cond); }
const pub = l => ({ id: l.id, veh: l.veh, carrier: l.carrier, cargo: l.cargo, cond: Math.round(l.cond), from: l.from.id, dest: l.dest.kind === 'depot' ? { kind: 'depot', id: l.dest.place.id, x: l.dest.place.x, z: l.dest.place.z, name: l.dest.place.name }
  : l.dest.kind === 'launch' ? { kind: 'launch', x: l.dest.x, z: l.dest.z, name: l.dest.name } : { kind: 'stops', list: l.dest.list.map(s => ({ id: s.id, x: s.x, z: s.z, done: s.done })) }, by: l.by });

export function haulReferee(api) {
  if (!api.sites?.jobSpots) return null;
  const job = api.job, K = kit(api), D = depots(api.sites);
  if (D.length < 2) return null;
  const loads = new Map();          // carrier ent id (the trailer, the van, the army truck) -> load
  let nextId = 1, n = 0;
  const castAll = () => api.cast({ k: 'loads', list: [...loads.values()].map(pub) });
  const text = l => l.dest.kind === 'stops' ? `${NAME[l.cargo]}: ${l.dest.list.filter(s => !s.done).length} stops left · condition ${Math.round(l.cond)}%` : `${NAME[l.cargo]} to ${destName(l.dest)} · condition ${Math.round(l.cond)}%`;

  function start(pid) {
    const P = api.player(pid); if (!P?.pos) return K.warn(pid, 'start', 'Wait a moment and try again.');
    const mine = [...loads.values()].find(l => l.by === pid);
    if (mine) { api.send(pid, { k: 'order', text: text(mine), depot: mine.from.id }); return K.warn(pid, 'start', 'You are already hauling a load.'); }
    const L = K.levelFor(pid), need = K.row(L)?.need || {}, d = nearest(D, P.pos).item;
    const how = { parcels: 'Take a Parcel Van', box: 'Hitch a box trailer to a Longhaul Semi', tanker: 'Hitch the tanker to a Longhaul Semi', machine: 'Hitch a flatbed to a Longhaul Semi', rocket: 'Hitch a flatbed to a Longhaul Semi' }[need.cargo] || 'Take a truck';
    const t = `${how} at ${d.name} and stop in the yard to load`;
    api.send(pid, { k: 'order', text: t, depot: d.id });
    K.prog(pid, t);
  }
  function load(pid, P, msg) {
    const truck = K.driving(P);
    if (!truck || truck.id !== msg.veh || !HAUL_VEHICLES.includes(truck.kind) || !truck.pos) return K.warn(pid, 'truck', 'Drive a semi, the Trailhauler or a Parcel Van into a depot yard.');
    let trailer = null;
    if (truck.kind === 'semi_truck') {
      trailer = api.ent(msg.to);
      if (!trailer || !TRAILER_CARGO[trailer.kind] || trailer.owner !== pid || !trailer.pos || flat(trailer.pos, truck.pos) > 18) return K.warn(pid, 'trailer', 'Hitch a trailer first (back up to its tongue, T).');
    }
    const at = D.find(d => inYard(d, truck.pos, 12));
    if (!at) return K.warn(pid, 'where', 'Load up in a depot yard.');
    const carrier = trailer ? trailer.id : truck.id;
    if (loads.has(carrier)) return;           // already loaded
    if (!api.take('load:' + pid, 0.5, 2)) return;
    const R = haulRules(api.upgrades(pid)), cargo = cargoFor(truck.kind, trailer?.kind, api.nextLevel(pid));
    const dest = destFor(cargo, at, api.sites, R, api.seed, n++);
    if (!dest || (dest.kind === 'stops' && !dest.list.length)) return K.warn(pid, 'dest', 'Nothing to carry from here.');
    const l = { id: nextId++, veh: truck.id, carrier, cargo, from: at, dest, cond: 100, tonnes: TONNES[cargo] || 5, at: api.now(), by: pid, long: R.longHaul && dest.kind === 'depot', helpers: [pid], paid: 0 };
    loads.set(carrier, l);
    castAll();
    K.prog(pid, text(l));
  }
  const loadOf = (truckId, to) => (to != null && loads.get(to)) || loads.get(truckId) || [...loads.values()].find(l => l.veh === truckId) || null;
  function jolt(pid, P, msg) {
    const truck = K.driving(P); if (!truck || truck.id !== msg.veh) return;
    const l = loadOf(truck.id, msg.to); if (!l) return;
    if (!api.take('jolt:' + truck.id, 2, 4)) return;
    if ((msg.n | 0) / 10 <= JOLT) return;
    const r = knock(l, haulRules(api.upgrades(pid)));
    if (r.spilled) api.cast({ k: 'spill', veh: l.carrier, cond: Math.round(r.cond) });
    K.prog(l.by, text(l));
  }
  function drop(pid, P, msg) {
    const truck = K.driving(P);
    if (!truck || truck.id !== msg.veh || !truck.pos) return K.warn(pid, 'truck', 'Drive the load in to deliver it.');
    const l = loadOf(truck.id, msg.to);
    if (!l) return K.warn(pid, 'none', 'Nothing loaded — stop in a depot yard to load up.');
    const R = haulRules(api.upgrades(pid));
    if (!l.helpers.includes(pid)) l.helpers.push(pid);
    if (l.dest.kind === 'stops') {
      const s = l.dest.list.find(q => !q.done && flat(q, truck.pos) <= STOP_R);
      if (!s) return K.warn(pid, 'where', 'Stop at the next parcel drop-off (the yellow marks).');
      s.done = true;
      const left = l.dest.list.filter(q => !q.done).length, km = flat(l.from, s) / 1000;
      const gold = Math.round(haulPay(job.pay, { km, tonnes: l.tonnes, cond: l.cond, longHaul: false }) * (R.longHaul ? 1.15 : 1));
      const paid = api.payTo({ pids: l.helpers, gold, at: [s.x, null, s.z], vehicle: truck.id, why: `${job.name} · parcel delivered` });
      api.cast({ k: 'delivered', id: l.id, stop: s.id, left, gold, by: paid });
      if (!left) return finish(l, paid, [s.x, null, s.z], truck.id);
      castAll(); K.prog(l.by, text(l)); return;
    }
    const where = l.dest.kind === 'depot' ? inYard(l.dest.place, truck.pos, 12) || (l.carrier !== truck.id && api.ent(l.carrier)?.pos && inYard(l.dest.place, api.ent(l.carrier).pos, 12))
      : flat(l.dest, truck.pos) <= l.dest.r;
    if (!where) return K.warn(pid, 'where', `This load goes to ${destName(l.dest)}.`);
    const km = flat(l.from, l.dest.kind === 'depot' ? l.dest.place : l.dest) / 1000;
    const gold = haulPay(job.pay, { km, tonnes: l.tonnes, cond: l.cond, longHaul: l.long });
    const at = l.dest.kind === 'depot' ? [l.dest.place.x, null, l.dest.place.z] : [l.dest.x, null, l.dest.z];
    const paid = api.payTo({ pids: l.helpers, gold, at, vehicle: truck.id, why: `${job.name} · ${NAME[l.cargo]} delivered` });
    api.cast({ k: 'delivered', id: l.id, gold, by: paid, cond: Math.round(l.cond), where: destName(l.dest) });
    finish(l, paid, at, truck.id);
  }
  function finish(l, paid, at, veh) {
    loads.delete(l.carrier);
    const done = { delivered: true, cargo: l.cargo, cond: l.cond };
    K.levelUp(paid, need => haulMeets(need, done), at, veh);
    for (const q of paid) K.prog(q);
    castAll();
  }
  return {
    loads, depots: D,
    step(pid, msg) {
      const P = api.player(pid); if (!P || P.spec) return;
      if (msg.step === 'start') return start(pid);
      if (msg.step === 'load') return load(pid, P, msg);
      if (msg.step === 'jolt') return jolt(pid, P, msg);
      if (msg.step === 'drop') return drop(pid, P, msg);
      if (msg.step === 'sync') return this.resync(pid);
    },
    resync(pid) { api.send(pid, { k: 'loads', list: [...loads.values()].map(pub) }); K.forget(pid); const m = [...loads.values()].find(l => l.by === pid); K.prog(pid, m ? text(m) : ''); },
    fixtures() {
      // a Parcel Van in the middle of each depot yard (between the semi and its trailer), a tanker behind it at Port
      // Lindell and a flatbed at Copperton and Highgate (lying east-west at the back of the yard)
      const out = [];
      for (const d of D.filter(q => q.yard)) {
        const y = (d.y ?? 0) + 1.4, back = Math.min(d.yard.z0, d.yard.z1) + 6;
        out.push({ kind: 'delivery_van', x: d.x, z: d.z + 2, y, yaw: 0 });
        if (d.city === 'port_lindell') out.push({ kind: 'trailer_tanker', x: d.x, z: back, y, yaw: Math.PI / 2 });
        if (d.city === 'copperton' || d.city === 'highgate') out.push({ kind: 'trailer_flatbed', x: d.x, z: back, y, yaw: Math.PI / 2 });
      }
      return out;
    },
    profileChanged(pid) { K.forget(pid); K.prog(pid); },
  };
}
