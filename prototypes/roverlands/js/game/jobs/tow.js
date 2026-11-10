// Tow Truck (Expansion 1 M7, docs/EXPANSION-1.md "Jobs"): a broken-down car (or truck) somewhere in the county; back the
// Hookline Tow Truck's under-lift up to its front bumper, T to lift it (vehicles batch A's `towAny`), and drop it at a
// tow yard. PURE: no DOM / three / Rapier / sockets; every time comes from `now`.
//
// THE WRECK is a real body in the room (`api.spawn`, nobody may sit in it), owned by whoever took the call; hitching
// asks the room for it (the usual `own`) so truck and wreck are simulated on one machine.
// Levels: 1 a flat tyre on a road shoulder, 2 a car in a ditch (the winch helps: hold T near it), 3 a wreck on a
// mountain road's edge, 4 a broken-down semi (heavy: without the Heavy hitch the tow truck crawls).
// Steps: `hook` (my machine hitched it: the room notes when and checks the truck is right there), `drop` (at a yard, still
// hooked). Pay to the driver, their passengers and anyone within 30 m:  base + km × per_km  (km = wreck spot -> yard).
//
// Wire (client -> room): start · hook { veh: wreck, to: tow truck } · drop { veh: wreck, to: tow truck } · sync.
// Room -> client: k:'wrecks' { list } · k:'call' · k:'towed' { gold, … } · k:'prog'.
import { flat, placesOf, nearest, pick, inYard, kit } from './calls.js';

export const TOW_VEHICLES = Object.freeze(['tow_truck']);
export const HOOK_R = 12;
export const WINCH_R = 22;             // metres: the winch reaches a wreck this far behind the truck
export const WINCH_FORCE = 9000;       // newtons on the wreck (twice with the Strong winch)
export const HEAVY_CRAWL = 7;          // m/s a tow truck manages with a heavy wreck and no Heavy hitch
export const WAIT_MS = 25 * 60_000;
const KIND_OF = { shoulder: 'sedan', ditch: 'sedan', cliff: 'sedan', heavy: 'semi_truck' };

export function towRules(upgrades = []) {
  const has = id => upgrades.includes(id);
  return { winch: WINCH_FORCE * (has('tow_winch') ? 2 : 1), winchR: WINCH_R, heavyTop: has('tow_heavy') ? null : HEAVY_CRAWL };
}
export const yards = sites => placesOf(sites, 'tow_yard');
export const wreckKind = spot => KIND_OF[spot] || 'sedan';
export function spotFor(row, seed, n) { return row?.need?.spot || pick(['shoulder', 'ditch'], seed, n); }
export const towPay = (pay = {}, km) => Math.round((pay.base ?? 40) + Math.max(0, km) * (pay.per_km ?? 50));
export function towMeets(need = {}, w) { return !!w?.towed && (!need.spot || need.spot === w.spot); }
const WHAT = { shoulder: 'Flat tyre', ditch: 'Car in a ditch', cliff: 'Wreck on the mountain road', heavy: 'Broken-down truck' };
const pub = w => ({ id: w.id, ent: w.ent, spot: w.spot, kind: w.kind, x: w.x, z: w.z, by: w.by, hooked: w.hooked ?? null, at: w.at });

export function towReferee(api) {
  const S = api.sites?.jobSpots?.wreck;
  if (!S) return null;
  const job = api.job, K = kit(api), Y = yards(api.sites);
  if (!Y.length || !S.shoulder?.length) return null;
  const wrecks = new Map();
  let nextId = 1, calls = 0, lastTick = 0;
  const live = () => [...wrecks.values()];
  const castAll = () => api.cast({ k: 'wrecks', list: live().map(pub) });
  const text = w => w.hooked != null ? `${WHAT[w.spot]} hooked — to a tow yard` : `${WHAT[w.spot]} — ${Math.round(nearest(Y, w).d)} m from ${nearest(Y, w).item.name}`;

  function start(pid) {
    const P = api.player(pid); if (!P || !P.pos) return K.warn(pid, 'start', 'Wait a moment and try again.');
    const mine = live().find(w => w.by === pid);
    if (mine) { api.send(pid, { k: 'call', wreck: pub(mine), text: text(mine) }); return K.warn(pid, 'start', 'You already have a wreck to fetch.'); }
    if (!api.take('start:' + pid, 0.2, 2)) return K.warn(pid, 'start', 'No new calls just yet.');
    const L = K.levelFor(pid), spot = spotFor(K.row(L), api.seed, calls++);
    const taken = new Set(live().map(w => w.spotId));
    const list = (S[spot]?.length ? S[spot] : S.shoulder).filter(s => !taken.has(s.id));
    const s = pick(list.length ? list : S.shoulder, api.seed, calls * 3 + pid);
    const kind = wreckKind(spot);
    const ent = api.spawn({ kind, p: [s.x, null, s.z], yaw: s.yaw || 0, owner: pid, noSeat: true });
    if (ent == null) return K.warn(pid, 'start', 'There are too many vehicles out already.');
    const w = { id: nextId++, ent, spot: S[spot]?.length ? spot : 'shoulder', spotId: s.id, kind, x: s.x, z: s.z, at: api.now(), by: pid, hooked: null, helpers: [pid] };
    wrecks.set(w.id, w);
    castAll();
    api.send(pid, { k: 'call', wreck: pub(w), text: text(w) });
    K.prog(pid, text(w));
  }
  const byEnt = id => live().find(w => w.ent === id) || null;
  function check(pid, P, msg) {
    const w = byEnt(msg.veh), truck = api.ent(msg.to), D = K.driving(P);
    if (!w) return null;
    if (!truck || !TOW_VEHICLES.includes(truck.kind)) { K.warn(pid, 'truck', 'Hook it to a tow truck.'); return null; }
    if (!D || D.id !== truck.id) { K.warn(pid, 'drive', 'Drive the tow truck to tow it.'); return null; }
    const e = api.ent(w.ent);
    if (!e?.pos || !truck.pos || flat(e.pos, truck.pos) > HOOK_R) { K.warn(pid, 'far', 'Back the tow truck right up to it first.'); return null; }
    return { w, truck, e };
  }
  function hook(pid, P, msg) {
    const c = check(pid, P, msg); if (!c) return;
    if (c.w.hooked === c.truck.id) return;
    c.w.hooked = c.truck.id; c.w.hookedAt = api.now();
    if (!c.w.helpers.includes(pid)) c.w.helpers.push(pid);
    castAll(); K.prog(c.w.by, text(c.w)); if (pid !== c.w.by) K.prog(pid, text(c.w));
  }
  function drop(pid, P, msg) {
    const w = byEnt(msg.veh);
    if (w && w.hooked == null) return K.warn(pid, 'hook', 'Hook it up first: back the under-lift up to its front and press T.');
    const c = check(pid, P, msg); if (!c) return;
    if (c.w.hooked !== c.truck.id) return K.warn(pid, 'hook', 'Hook it to this truck first (T).');
    const y = Y.find(q => inYard(q, c.e.pos, 10));
    if (!y) return K.warn(pid, 'where', `Bring it to a tow yard — ${Y.map(q => q.name).join(', ')}.`);
    const km = flat(c.w, y) / 1000, gold = towPay(job.pay, km);
    if (!c.w.helpers.includes(pid)) c.w.helpers.push(pid);
    const paid = api.payTo({ pids: c.w.helpers, gold, at: [y.x, null, y.z], vehicle: c.truck.id, why: `${job.name} · ${WHAT[c.w.spot]}` });
    wrecks.delete(c.w.id);
    api.remove(c.w.ent);
    api.cast({ k: 'towed', id: c.w.id, gold, by: paid, where: y.name });
    const done = { towed: true, spot: c.w.spot };
    K.levelUp(paid, need => towMeets(need, done), [y.x, null, y.z], c.truck.id);
    for (const q of paid) K.prog(q);
    castAll();
  }
  return {
    wrecks, yards: Y,
    step(pid, msg) {
      const P = api.player(pid); if (!P || P.spec) return;
      if (msg.step === 'start') return start(pid);
      if (msg.step === 'hook') return hook(pid, P, msg);
      if (msg.step === 'drop') return drop(pid, P, msg);
      if (msg.step === 'sync') return this.resync(pid);
    },
    tick() {
      const t = api.now(); if (t - lastTick < 2000) return; lastTick = t;
      let gone = false;
      for (const w of live()) if (w.hooked == null && t - w.at > WAIT_MS) { api.remove(w.ent); wrecks.delete(w.id); gone = true; }
      if (gone) castAll();
    },
    resync(pid) { api.send(pid, { k: 'wrecks', list: live().map(pub) }); K.forget(pid); const m = live().find(w => w.by === pid); K.prog(pid, m ? text(m) : ''); },
    fixtures() {
      // a tow truck in every tow yard (the yard's east side: the building takes the west)
      return Y.filter(p => p.yard).map(p => ({ kind: 'tow_truck', x: Math.max(p.yard.x0, p.yard.x1) - 10, z: p.z, y: (p.y ?? 0) + 1.5, yaw: 0 }));
    },
    profileChanged(pid) { K.forget(pid); K.prog(pid); },
  };
}
