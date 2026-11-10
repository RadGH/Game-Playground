// Highway Patrol (Expansion 1 M7, docs/EXPANSION-1.md "Jobs"): a runaway car tears along a county road; catch it in a
// patrol car (or on the motorcycle) with the siren on and bump it until it gives up. PURE: no DOM / three / Rapier /
// sockets; every time comes from `now`.
//
// THE RUNAWAY is a real car in the room (`api.spawn`, nobody may sit in it), driven by a simple driver that follows its
// route (sites.jobSpots.chase: the Southmead road, the Highgate switchbacks, the gorge highway) with a little wobble.
// Who drives it: the machine that simulates the body (docs/PLAN.md "Authority" — the owner simulates). It starts with
// the player who took the call; when a patrol car rams it, the rammer's machine takes the body (the room's usual
// "a body nobody drives that touches my vehicle becomes mine"), so the crash is felt at once and the runaway's driver
// carries on there. Nothing about the chase needs the room to simulate anything (js/game/jobs-play/patrol.js).
// STOPPING IT: each hit from a patrol vehicle with its siren on fills the runaway's stop meter by the strength of the
// hit (capped per hit); being boxed in (slow, a patrol vehicle right beside it) fills it too. At 100 it pulls over.
//   pay = base + per_speed × max(0, 120 − seconds the chase took)     to everyone who hit it, their passengers, 30 m
// Stinger strip (upgrade): T / HITCH in a patrol car drops a strip behind you; a runaway driving over it slows to 60% for the
// rest of the chase and its meter jumps by SPIKE_HIT. One strip down at a time, one every SPIKE_EVERY s.
//
// Wire (client -> room): start · hit { veh: runaway, to: patrol vehicle, n: strength 1..40 } · spike { p } · spiked
//   { veh: runaway } · sync.   Room -> client: k:'runaways' { list } · k:'call' · k:'stopped' · k:'escaped' · k:'spikes'.
import { flat, pick, kit } from './calls.js';

export const PATROL_VEHICLES = Object.freeze(['police_car', 'motorcycle']);
export const HIT_R = 14;               // metres: a hit is only believed with the patrol vehicle this close
export const HIT_MAX = 34;             // the most one hit fills the meter
export const SPIKE_HIT = 35;
export const SPIKE_R = 6;
export const SPIKE_EVERY = 25_000;
export const CHASE_MS = 6 * 60_000;    // a runaway nobody stops in this long gets away (no pay, nothing lost)
export const RUNAWAY_SPEED = 15;       // m/s on the open road (level 4's is 30% faster)

export function patrolRules(upgrades = []) {
  const has = id => upgrades.includes(id);
  return { topScale: has('patrol_engine') ? 1.25 : 1, spikes: has('patrol_spikes') };
}
/** Which route a call at this level runs (data/jobs.json level.need), how many cars, how fast. */
export function chaseFor(row, routes, seed, n) {
  const need = row?.need || {};
  const names = Object.keys(routes || {});
  const route = need.route && routes[need.route] ? need.route : need.route ? names[0] : pick(names.filter(r => r !== 'mountain').length ? names.filter(r => r !== 'mountain') : names, seed, n);
  return { route, cars: need.convoy || 1, speed: RUNAWAY_SPEED * (need.fast ? 1.3 : 1), fast: !!need.fast };
}
export const patrolPay = (pay = {}, secs) => Math.round((pay.base ?? 80) + (pay.per_speed ?? 4) * Math.max(0, 120 - secs));
/** A level's goal against a finished chase { stopped, route, cars, fast }. */
export function patrolMeets(need = {}, c) {
  if (!c?.stopped) return false;
  if (need.route && c.route !== need.route) return false;
  if (need.convoy && c.cars < need.convoy) return false;
  if (need.fast && !c.fast) return false;
  return true;
}
/** Fill a runaway's stop meter by one hit. -> true when that stopped it. */
export function addHit(r, n, cap = HIT_MAX) {
  if (r.stopped) return false;
  r.meter = Math.min(100, r.meter + Math.max(0, Math.min(cap, n)));
  if (r.meter >= 100) { r.stopped = true; return true; }
  return false;
}
const pub = r => ({ id: r.id, ent: r.ent, route: r.route, meter: Math.round(r.meter), stopped: r.stopped, speed: r.speed, slow: r.slow, by: r.by, at: r.at, chase: r.chase, start: r.start });

export function patrolReferee(api) {
  const routes = api.sites?.jobSpots?.chase;
  if (!routes || !Object.keys(routes).length) return null;
  const job = api.job, K = kit(api);
  const runs = new Map();          // runaway id -> { id, chase, ent, route, meter, stopped, … }
  const chases = new Map();        // chase id -> { id, by, route, cars, fast, ids, at, helpers }
  let spikes = [], nextId = 1, nextChase = 1, calls = 0, lastTick = 0;
  const live = () => [...runs.values()];
  const castRuns = () => api.cast({ k: 'runaways', list: live().map(pub), routes: [...new Set(live().map(r => r.route))] });
  const castSpikes = () => api.cast({ k: 'spikes', list: spikes.map(s => ({ id: s.id, p: s.p, by: s.by })) });
  const chaseText = c => { const left = c.ids.filter(id => runs.get(id) && !runs.get(id).stopped).length; return `Runaway${c.cars > 1 ? 's' : ''} on ${routes[c.route]?.name || c.route}${c.cars > 1 ? ` (${left} still going)` : ''}`; };

  function start(pid) {
    const P = api.player(pid); if (!P || !P.pos) return K.warn(pid, 'start', 'Wait a moment and try again.');
    const mine = [...chases.values()].find(c => c.by === pid);
    if (mine) { api.send(pid, { k: 'call', chase: mine.id, list: mine.ids.map(id => runs.get(id)).filter(Boolean).map(pub), text: chaseText(mine) }); return K.warn(pid, 'start', 'You are already on a chase.'); }
    if (!api.take('start:' + pid, 0.2, 2)) return K.warn(pid, 'start', 'No new calls just yet.');
    const L = K.levelFor(pid), want = chaseFor(K.row(L), routes, api.seed, calls++);
    const R = routes[want.route], c = { id: nextChase++, by: pid, route: want.route, cars: want.cars, fast: want.fast, ids: [], at: api.now(), helpers: [] };
    for (let k = 0; k < want.cars; k++) {
      const i = Math.min(R.pts.length - 2, 6 + k * 5), a = R.pts[i], b = R.pts[i + 1], yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const ent = api.spawn({ kind: 'sedan', p: [a[0], null, a[1]], yaw, owner: pid, noSeat: true });
      if (ent == null) break;
      const r = { id: nextId++, chase: c.id, ent, route: want.route, start: i, meter: 0, stopped: false, speed: want.speed, slow: false, by: pid, at: api.now(), helpers: [] };
      runs.set(r.id, r); c.ids.push(r.id);
    }
    if (!c.ids.length) return K.warn(pid, 'start', 'There are too many vehicles out already.');
    chases.set(c.id, c);
    castRuns();
    api.send(pid, { k: 'call', chase: c.id, list: c.ids.map(id => pub(runs.get(id))), text: chaseText(c) });
    K.prog(pid, chaseText(c));
  }
  const byEnt = id => live().find(r => r.ent === id) || null;
  function hit(pid, msg) {
    const r = byEnt(msg.veh); if (!r || r.stopped) return;
    const run = api.ent(r.ent), cop = api.ent(msg.to);
    if (!run?.pos || !cop?.pos || !PATROL_VEHICLES.includes(cop.kind)) return;
    const driver = cop.seats?.[0];
    if (driver == null) return;
    if (!cop.acts?.siren) return K.warn(driver, 'siren', 'Siren on first (Fire) — then bump it.');
    if (flat(run.pos, cop.pos) > HIT_R) return;
    if (!api.take('hit:' + r.id, 6, 10)) return;
    for (const q of [driver, pid]) if (!r.helpers.includes(q)) r.helpers.push(q);
    r.cop = cop.id;
    if (addHit(r, msg.n | 0)) stopped(r); else castRuns();
  }
  function spike(pid, P, msg) {
    const D = K.driving(P);
    if (!D || !PATROL_VEHICLES.includes(D.kind) || D.kind === 'motorcycle') return K.warn(pid, 'spike', 'Drop a stinger strip from a patrol car.');
    if (!patrolRules(api.upgrades(pid)).spikes) return K.warn(pid, 'spike', 'You need the Stinger strip upgrade (Jobs app).');
    const t = api.now(), last = spikes.filter(s => s.by === pid).sort((a, b) => b.at - a.at)[0];
    if (last && t - last.at < SPIKE_EVERY) return K.warn(pid, 'spikewait', `The next strip is ready in ${Math.ceil((SPIKE_EVERY - (t - last.at)) / 1000)} s.`);
    if (!Array.isArray(msg.p) || !D.pos || flat(D.pos, msg.p) > 15) return;
    spikes = spikes.filter(s => s.by !== pid);
    spikes.push({ id: nextId++, p: msg.p.map(v => Math.round(v * 10) / 10), by: pid, at: t });
    castSpikes();
  }
  function spiked(pid, msg) {
    const r = byEnt(msg.veh); if (!r || r.stopped) return;
    const run = api.ent(r.ent); if (!run?.pos) return;
    const s = spikes.find(q => flat(q.p, run.pos) <= SPIKE_R);
    if (!s) return;
    spikes = spikes.filter(q => q !== s); castSpikes();
    r.slow = true;
    if (!r.helpers.includes(s.by)) r.helpers.push(s.by);
    if (addHit(r, SPIKE_HIT, SPIKE_HIT)) stopped(r); else castRuns();
  }
  function stopped(r) {
    const c = chases.get(r.chase), run = api.ent(r.ent), at = run?.pos ? [run.pos[0], null, run.pos[2]] : null;
    const secs = (api.now() - r.at) / 1000, gold = patrolPay(job.pay, secs);
    const paid = api.payTo({ pids: r.helpers, gold, at, vehicle: r.cop ?? null, why: `${job.name} · runaway stopped` });
    r.doneAt = api.now();
    if (c) for (const q of paid) if (!c.helpers.includes(q)) c.helpers.push(q);
    api.cast({ k: 'stopped', id: r.id, ent: r.ent, gold, secs: Math.round(secs), by: paid });
    if (c && c.ids.every(id => runs.get(id)?.stopped)) {
      const done = { stopped: true, route: c.route, cars: c.cars, fast: c.fast };
      K.levelUp(c.helpers, need => patrolMeets(need, done), at, r.cop ?? null);
      chases.delete(c.id);
    }
    for (const q of paid) K.prog(q, c && chases.has(c.id) ? chaseText(c) : '');
    castRuns();
  }
  return {
    runs, chases, routes, get spikes() { return spikes; },
    step(pid, msg) {
      const P = api.player(pid); if (!P || P.spec) return;
      if (msg.step === 'start') return start(pid);
      if (msg.step === 'hit') return hit(pid, msg);
      if (msg.step === 'spike') return spike(pid, P, msg);
      if (msg.step === 'spiked') return spiked(pid, msg);
      if (msg.step === 'sync') return this.resync(pid);
    },
    tick() {
      const t = api.now(); if (t - lastTick < 1000) return; lastTick = t;
      let changed = false;
      for (const r of live()) {
        // a stopped runaway is towed away after a while; one nobody stopped gets away
        if ((r.stopped && t - r.doneAt > 30_000) || (!r.stopped && t - r.at > CHASE_MS)) {
          if (!r.stopped) api.cast({ k: 'escaped', id: r.id });
          api.remove(r.ent); runs.delete(r.id); changed = true;
          const c = chases.get(r.chase);
          if (c && !c.ids.some(id => runs.has(id) && !runs.get(id).stopped)) { chases.delete(c.id); K.prog(c.by); }
        }
      }
      const before = spikes.length; spikes = spikes.filter(s => t - s.at < 60_000); if (spikes.length !== before) castSpikes();
      if (changed) castRuns();
    },
    resync(pid) { api.send(pid, { k: 'runaways', list: live().map(pub), routes: [...new Set(live().map(r => r.route))] }); api.send(pid, { k: 'spikes', list: spikes.map(s => ({ id: s.id, p: s.p, by: s.by })) }); K.forget(pid); const c = [...chases.values()].find(q => q.by === pid); K.prog(pid, c ? chaseText(c) : ''); },
    fixtures() {
      // a patrol car at the Marrow Flats and Copperton garages (Port Lindell's garage already has one, Highgate a motorcycle)
      const out = [];
      for (const p of (api.sites.places || []).filter(q => q.kind === 'garage' && (q.city === 'marrow_flats' || q.city === 'copperton') && q.yard)) {
        out.push({ kind: 'police_car', x: Math.min(p.yard.x0, p.yard.x1) + 9, z: Math.max(p.yard.z0, p.yard.z1) - 4, y: (p.y ?? 0) + 1.2, yaw: 0 });
      }
      return out;
    },
    profileChanged(pid) { K.forget(pid); K.prog(pid); },
  };
}
