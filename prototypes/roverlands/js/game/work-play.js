// The emergency + haul jobs in the page (Expansion 1 M7): the glue between the vehicles you drive and the five job
// referees in the room (js/game/jobs/{fire,ambulance,patrol,tow,haul}.js). js/game/session.js makes one in Wayfare
// County and calls it every frame. The room checks everything again; this side only reports what it saw happen.
//
//   const work = createWorkPlay({ THREE, scene, world, net, enhance, sounds, toast, jobs, S });
//     S = { ents, mySeat(), walker(), towedEnt(A), hitch(A) (= pressing T in A) }
//   work.onMsg(m)            every `{ t:'job', id: fire|ambulance|patrol|tow|haul, … }`
//   work.defFor(row, def)    a copy of a patrol car's / motorcycle's / tow truck's definition (so the Pursuit engine
//                            and the heavy tow can change THAT body's engine), else null
//   work.control(dt)         before physics: the runaway's driver, a towed wreck's brakes off, the heavy-tow crawl,
//                            the winch, the Pursuit engine
//   work.frame(dt, s)        after physics: loading, jolts, drop-offs, refills, hits on the runaway, the station signs
//   work.water(p)            one drop of MY water cannon's spray ended at p (session.js stepShots)
//   work.waterLife()         how long my cannon's water flies (the Long-reach cannon reaches 40% further)
//   work.nearSpot(feet)      on foot: a station sign (E: take a call) or a patient (E: load them) -> { hint, use }
//   work.winch(A)            T with nothing to hitch: at a station sign take its call; in a tow truck start / stop the
//                            winch on a wreck -> true if it did
//   work.hud({ E, seat, feet }) -> { line, hint }      work.spots() -> map / minimap marks
//   work.update(camera, dt) · work.debug() · work.dispose() · work.test (Playwright helpers)
//
// Who does what, as the driver:
//   fire truck     drive to the fire, F to the cannon seat (or a friend rides it), aim, hold fire. Water that lands in
//                  the fire is reported (`spray`); parked at a hydrant or a fire station the tank fills (`refill`)
//   ambulance /    stop beside the patient: the crew loads them after 2 s (or get out and press E beside them);
//   helicopter     every second the worst jolt goes to the room (`jolt`); stop at a hospital to drop them (`drop`)
//   patrol car /   siren on (fire), ram the runaway. The machine that simulates the runaway (its owner — the rammer's,
//   motorcycle     once they touch) drives it along its road and reports the hits (`hit`); T drops a stinger strip
//   tow truck      back up to the wreck's front, T to lift it (`hook` once hitched); T further off runs the winch;
//                  stop in a tow yard to drop it (`drop`)
//   semi / van /   stop in a depot yard to load (`load`), drive gently (`jolt`), stop at the destination or each parcel
//   Trailhauler    stop (`drop`)
import { fireRules, hydrants as hydrantsOf, FIRE_VEHICLES } from './jobs/fire.js';
import { ambRules, hospitals as hospitalsOf, AMB_VEHICLES, LOAD_R } from './jobs/ambulance.js';
import { patrolRules, PATROL_VEHICLES, SPIKE_R } from './jobs/patrol.js';
import { towRules, yards as yardsOf, TOW_VEHICLES } from './jobs/tow.js';
import { HAUL_VEHICLES, TRAILER_CARGO, depots as depotsOf, STOP_R } from './jobs/haul.js';
import { stationSigns, inYard, flat, SIGN_RANGE, SIGN_DRIVE_RANGE } from './jobs/calls.js';
import { yawOf } from '../phys/vmath.js';
import { createWorkFx } from './work-fx.js';

export const WORK_JOBS = Object.freeze(['fire', 'ambulance', 'patrol', 'tow', 'haul']);
const JOB_VEHICLES = { fire: FIRE_VEHICLES, ambulance: AMB_VEHICLES, patrol: PATROL_VEHICLES, tow: TOW_VEHICLES, haul: HAUL_VEHICLES };
const SIGN_WORDS = { fire: 'Fire calls', ambulance: 'Ambulance calls', patrol: 'Patrol calls', tow: 'Tow calls', haul: 'Freight orders' };
const CAP = t => t[0].toUpperCase() + t.slice(1);
const SIGN_COLOR = { fire: '#ff6a2a', ambulance: '#ff4d6d', patrol: '#4d8dff', tow: '#c8a24a', haul: '#8fd05a' };
const ACTION = { fire: 'take a fire call', ambulance: 'take an ambulance call', patrol: 'take a patrol call', tow: 'take a tow call', haul: 'take a freight order' };
const SEND_SPRAY = 0.25;          // s between water reports
const LOAD_HOLD = 1.5;            // s holding still beside a patient on foot
const CREW_LOAD = 2;              // s stopped beside them in the vehicle
const JOLT_WINDOW = 0.1;          // s: a jolt = the change of velocity over this long

export function createWorkPlay({ THREE, scene, world, net, enhance = m => m, sounds = null, toast = () => {}, jobs = null, S }) {
  const sites = world.sites;
  if (!sites?.jobSpots) return null;
  const me = net.you;
  const fx = createWorkFx({ THREE, scene, world, enhance });
  const hyd = hydrantsOf(sites), H = hospitalsOf(sites), Y = yardsOf(sites), D = depotsOf(sites);
  const routes = sites.jobSpots.chase || {};
  fx.hydrants(hyd);
  // ---- the room's picture
  const st = { fires: [], tanks: new Map(), patients: [], runaways: [], spikes: [], wrecks: [], loads: [], prog: {}, order: null };
  const stats = { sprays: 0, drops: 0, hits: 0, sent: 0, starts: 0 };
  const ups = id => net.last?.profile?.profile?.jobs?.[id]?.upgrades || [];
  const send = (id, step, extra = {}) => { stats.sent++; net.send({ t: 'job', id, step, ...extra }); };
  const pin = (x, z) => net.send({ t: 'pin', p: [Math.round(x), Math.round(z)] });
  const now = () => performance.now();
  for (const id of WORK_JOBS) send(id, 'sync');

  // ---- station signs (E on foot, T / HITCH stopped beside one in the job's vehicle)
  const signs = [];
  for (const job of WORK_JOBS) for (const s of stationSigns(sites, job)) {
    fx.sign(SIGN_WORDS[job], SIGN_COLOR[job], s.x, s.z, 3.4, 4.6); fx.post(s.x, s.z, 2.6);
    signs.push({ ...s, job });
  }

  function onMsg(m) {
    if (!WORK_JOBS.includes(m.id)) return;
    if (m.k === 'prog') { st.prog[m.id] = m.text; return; }
    if (m.id === 'fire') {
      if (m.k === 'fires') st.fires = m.list;
      else if (m.k === 'tank') st.tanks.set(m.veh, { water: m.water, cap: m.cap });
      else if (m.k === 'call') { toast(`Fire! ${m.text}`); pin(m.fire.x, m.fire.z); sounds?.play('horn'); }
      else if (m.k === 'out') { st.fires = st.fires.filter(f => f.id !== m.fire.id); if (m.by?.includes(me)) { toast(`Fire out! +${m.gold} gold`); sounds?.play('capture'); } }
    } else if (m.id === 'ambulance') {
      if (m.k === 'patients') st.patients = m.list;
      else if (m.k === 'call') { toast(`Ambulance call: ${m.text}`); pin(m.patient.x, m.patient.z); }
      else if (m.k === 'bump') toast(`Ouch — a hard bump (${m.bumps}). Gently!`);
      else if (m.k === 'delivered' && m.by?.includes(me)) { toast(`Patient delivered${m.quick ? ' quickly' : ''}${m.bumps === 0 ? ', gently' : ''}! +${m.gold} gold`); sounds?.play('capture'); }
    } else if (m.id === 'patrol') {
      if (m.k === 'runaways') st.runaways = m.list;
      else if (m.k === 'spikes') st.spikes = m.list;
      else if (m.k === 'call') { toast(`Patrol: ${m.text}. Siren on, then bump it to a stop!`); const r = m.list[0], R = routes[r?.route]; if (R) { const p = R.pts[r.start] || R.pts[0]; pin(p[0], p[1]); } }
      else if (m.k === 'stopped' && m.by?.includes(me)) { toast(`Runaway stopped in ${m.secs} s! +${m.gold} gold`); sounds?.play('capture'); }
      else if (m.k === 'escaped') toast('The runaway got away.');
    } else if (m.id === 'tow') {
      if (m.k === 'wrecks') st.wrecks = m.list;
      else if (m.k === 'call') { toast(`Tow call: ${m.text}`); pin(m.wreck.x, m.wreck.z); }
      else if (m.k === 'towed' && m.by?.includes(me)) { toast(`Towed to ${m.where}! +${m.gold} gold`); sounds?.play('capture'); }
    } else if (m.id === 'haul') {
      if (m.k === 'loads') { const was = new Set(st.loads.map(l => l.id)); st.loads = m.list; for (const l of m.list) if (!was.has(l.id) && l.by === me) { toast(`Loaded: ${loadWord(l)}`); const d = destOf(l); if (d) pin(d.x, d.z); } }
      else if (m.k === 'order') { st.order = m.text; toast(m.text); const d = D.find(q => q.id === m.depot); if (d) pin(d.x, d.z); }
      else if (m.k === 'spill') { const X = S.ents.get(m.veh); if (X) { const t = X.veh.rb.translation(); fx.spill(t.x, t.y + 1.6, t.z); } if (myLoad()?.carrier === m.veh) toast(`A crate fell off! Load ${m.cond}%`); }
      else if (m.k === 'delivered' && m.by?.includes(me)) { toast(m.stop ? `Parcel delivered (${m.left} left)! +${m.gold} gold` : `Delivered to ${m.where}! +${m.gold} gold`); sounds?.play('capture'); }
    }
  }

  // ---- helpers: where I am, what I drive
  const myE = () => { const s = S.mySeat(); return s ? S.ents.get(s[0]) : null; };
  const pos = X => X.veh.rb.translation();
  const speedOf = X => Math.abs(X.veh.forwardSpeed());
  const nearestIn = (list, p) => { let b = null, bd = Infinity; for (const q of list) { const d = flat(q, [p.x ?? p[0], 0, p.z ?? p[2]]); if (d < bd) { bd = d; b = q; } } return b ? { item: b, d: bd } : null; };
  const kmText = d => (d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`);
  const LOAD_NAME = { parcels: 'parcels', box: 'goods', crates: 'crates', tanker: 'fuel', machine: 'a machine', rocket: 'rocket parts' };
  const loadWord = l => `${LOAD_NAME[l.cargo] || 'cargo'} for ${l.dest.kind === 'stops' ? 'the parcel stops' : l.dest.name}`;
  function destOf(l) {
    if (!l) return null;
    if (l.dest.kind === 'stops') { const s = l.dest.list.find(q => !q.done); return s ? { x: s.x, z: s.z, name: 'next parcel stop' } : null; }
    return { x: l.dest.x, z: l.dest.z, name: l.dest.name };
  }
  const myLoad = () => { const E = myE(); const T = E ? S.towedEnt(E) : null; return st.loads.find(l => (E && (l.veh === E.id || l.carrier === E.id)) || (T && l.carrier === T.id)) || st.loads.find(l => l.by === me) || null; };
  const myFire = () => st.fires.find(f => f.by === me) || null;
  const myPatient = () => { const E = myE(); return (E && st.patients.find(p => p.state === 'aboard' && p.veh === E.id)) || st.patients.find(p => p.by === me) || null; };
  const myRunaway = () => st.runaways.find(r => r.by === me && !r.stopped) || st.runaways.find(r => !r.stopped) || null;
  const myWreck = () => { const E = myE(); return (E && st.wrecks.find(w => w.hooked === E.id)) || st.wrecks.find(w => w.by === me) || null; };

  // ---- vehicle definitions I may change per body
  function defFor(row, def) {
    if (!def || !['police_car', 'motorcycle', 'tow_truck', 'sedan'].includes(row.kind)) return null;
    const d = { ...def, engine: { ...def.engine } }; d._baseTop = def.engine.top; d._baseForce = def.engine.force;
    return d;
  }

  // ---- jolts (ambulance + haul): the change of velocity over 0.1 s, the worst of each second
  const jolt = { hist: [], worst: 0, t: 0, veh: null };
  function measureJolt(E, dt) {
    if (jolt.veh !== E.id) { jolt.veh = E.id; jolt.hist = []; jolt.worst = 0; jolt.t = 0; }
    const v = E.veh.rb.linvel(), t = now();
    jolt.hist.push({ t, v: [v.x, v.y, v.z] });
    while (jolt.hist.length > 2 && t - jolt.hist[0].t > JOLT_WINDOW * 1000) jolt.hist.shift();
    const a = jolt.hist[0], span = (t - a.t) / 1000;
    if (span > 0.04) jolt.worst = Math.max(jolt.worst, Math.hypot(v.x - a.v[0], v.y - a.v[1], v.z - a.v[2]) / span);
    jolt.t += dt;
    if (jolt.t >= 1) { const w = jolt.worst; jolt.t = 0; jolt.worst = 0; return w; }
    return null;
  }

  // ---------------------------------------------------------------------------------------------- before physics
  const runAI = new Map();       // runaway id -> { idx, dir, stuck, back, wob }
  const winch = { on: false, wreck: null, asked: 0 };
  function control(dt) {
    const t = now() / 1000, E = myE(), seat = S.mySeat()?.[1];
    // the runaway's driver, wherever its body is simulated (here, if it is mine)
    for (const r of st.runaways) {
      const X = S.ents.get(r.ent); if (!X || !X.veh.local) continue;
      const inp = X.veh.input;
      if (r.stopped) { Object.assign(inp, { throttle: 0, brake: 1, handbrake: true, steer: 0 }); continue; }
      const R = routes[r.route]; if (!R) continue;
      let ai = runAI.get(r.id); if (!ai) { ai = { idx: r.start || 0, dir: 1, stuck: 0, back: 0, wob: r.id * 1.7 }; runAI.set(r.id, ai); }
      const p = pos(X);
      // keep the index on the nearest route point a little ahead
      let best = ai.idx, bd = Infinity;
      for (let k = -4; k <= 12; k++) { const i = ai.idx + k * ai.dir; if (i < 0 || i >= R.pts.length) continue; const d = Math.hypot(R.pts[i][0] - p.x, R.pts[i][1] - p.z); if (d < bd) { bd = d; best = i; } }
      ai.idx = best;
      if (ai.idx >= R.pts.length - 3 && ai.dir > 0) ai.dir = -1; else if (ai.idx <= 2 && ai.dir < 0) ai.dir = 1;
      const look = Math.max(0, Math.min(R.pts.length - 1, ai.idx + 5 * ai.dir)), tg = R.pts[look];
      const yaw = yawOf(X.veh.rb.rotation());
      let d = Math.atan2(tg[0] - p.x, tg[1] - p.z) - yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      const want = r.speed * (r.slow ? 0.6 : 1) * (Math.abs(d) > 0.6 ? 0.55 : 1), sp = X.veh.forwardSpeed();
      if (Math.abs(sp) < 1) ai.stuck += dt; else ai.stuck = 0;
      if (ai.stuck > 2.5) { ai.back = 1.4; ai.stuck = 0; }
      if (ai.back > 0) { ai.back -= dt; Object.assign(inp, { throttle: 0, brake: 1, handbrake: false, steer: Math.sign(d) || 1 }); continue; }
      const wob = Math.sin(t * 0.9 + ai.wob) * 0.12 + Math.sin(t * 2.3 + ai.wob * 2) * 0.05;
      Object.assign(inp, { throttle: sp < want ? 1 : sp < want + 3 ? 0.2 : 0, brake: sp > want + 4 ? 0.6 : 0, handbrake: false, steer: Math.max(-1, Math.min(1, -d * 2.2 + wob)), boost: false });
    }
    // a towed wreck rolls (nobody at its wheel means the handbrake is on, which would drag it)
    for (const w of st.wrecks) { const X = S.ents.get(w.ent); if (X?.veh.local && X.veh.towedBy) X.veh.input.handbrake = false; }
    if (E && seat === 0 && E.veh.local) {
      // the Pursuit engine: a quarter more top speed in a patrol vehicle I drive
      if (E.def._baseTop && PATROL_VEHICLES.includes(E.kind)) { const k = patrolRules(ups('patrol')).topScale; E.def.engine.top = E.def._baseTop * k; E.def.engine.force = E.def._baseForce * (k > 1 ? 1.2 : 1); }
      // a heavy wreck without the Heavy hitch: the tow truck crawls
      const T = S.towedEnt(E);
      if (E.kind === 'tow_truck' && T?.kind === 'semi_truck') { const cap = towRules(ups('tow')).heavyTop; if (cap && E.veh.forwardSpeed() > cap) E.veh.input.throttle = 0; }
      // the winch: pull the wreck in toward the tow point
      if (winch.on) {
        const W = S.ents.get(winch.wreck), tp = E.veh.towPointWorld?.();
        if (!W || E.kind !== 'tow_truck' || !tp || E.veh.towing) { winch.on = false; fx.cable(null); }
        else {
          const hp = W.veh.frontHitchWorld?.() || pos(W), dx = tp.x - hp.x, dz = tp.z - hp.z, dd = Math.hypot(dx, dz);
          fx.cable(tp, hp);
          const v = W.veh.rb.linvel(), closing = (v.x * dx + v.z * dz) / (dd || 1);
          if (dd < 1.3) {
            // in: stop it rolling on, and lift it (session.js hitchPress — the same as pressing T)
            winch.on = false; fx.cable(null);
            if (W.veh.local) W.veh.rb.setLinvel({ x: 0, y: v.y, z: 0 }, true);
            winch.auto = true; S.hitch?.(E); winch.auto = false; if (!E.veh.towing) toast('Winched in — T to lift it');
          }
          else if (dd > 30) { winch.on = false; fx.cable(null); toast('The winch let go — back up closer'); }
          else if (!W.veh.local) { if (now() - winch.asked > 1000) { winch.asked = now(); net.send({ t: 'own', id: W.id }); } }
          else {
            // a steady pull: full force up to a walking pace, braking it as it comes in (it must not ram the truck)
            const want = Math.min(2.5, dd * 0.8), F = towRules(ups('tow')).winch * dt * (closing < want ? 1 : -0.6);
            W.veh.input.handbrake = false; W.veh.rb.applyImpulse({ x: dx / dd * F, y: 0, z: dz / dd * F }, true);
          }
        }
      }
    } else if (winch.on) { winch.on = false; fx.cable(null); }
  }

  // ---------------------------------------------------------------------------------------------- after physics
  let sprayT = 0, actT = 0, crewT = 0, footLoad = null;
  const water = { n: 0, x: 0, y: 0, z: 0 };
  const cool = new Map();          // 'job:step' -> last time sent
  const every = (k, ms) => { const t = now(); if (t - (cool.get(k) || 0) < ms) return false; cool.set(k, t); return true; };
  const lastHit = new Map();       // runaway id + cop id -> time
  function frame(dt, s) {
    const E = myE(), seat = S.mySeat()?.[1], W = S.walker();
    // fire: report my water
    sprayT += dt;
    if (sprayT >= SEND_SPRAY) { sprayT = 0; if (water.n && E && FIRE_VEHICLES.includes(E.kind)) { send('fire', 'spray', { veh: E.id, p: [r1(water.x / water.n), r1(water.y / water.n), r1(water.z / water.n)], n: Math.min(60, water.n) }); stats.sprays++; } water.n = water.x = water.y = water.z = 0; }
    // T (HITCH) in a vehicle with no tow hook: take a call at a station sign, or drop a stinger strip (a tow hook's T goes
    // through session.js hitchPress -> winch(), which takes the call there)
    if (E && seat === 0 && s.hitch && !E.def.tow) {
      const sg = signNear(pos(E), SIGN_DRIVE_RANGE, E.kind);
      if (sg && speedOf(E) < 2) { send(sg.job, 'start'); stats.starts++; }
      else if (canSpike(E)) {
        const back = E.veh.toWorld({ x: 0, y: 0, z: -(E.def.chassis.hz + 3.5) });
        send('patrol', 'spike', { p: [r1(back.x), r1(back.y), r1(back.z)] });
      }
    }
    actT += dt; const act = actT > 1.5; if (act) actT = 0;
    if (E && seat === 0) {
      const p = pos(E), sp = speedOf(E);
      // fire truck at a hydrant / station: fill up
      if (FIRE_VEHICLES.includes(E.kind) && act && sp < 2 && hyd.some(h => flat(h, [p.x, 0, p.z]) <= h.r)) { const tk = st.tanks.get(E.id); if (!tk || tk.water < tk.cap) send('fire', 'refill', { veh: E.id }); }
      // ambulance / helicopter: the crew loads a patient you stop beside; jolts; drop at a hospital
      if (AMB_VEHICLES.includes(E.kind)) {
        const waiting = st.patients.filter(q => q.state === 'waiting' && flat(q, [p.x, 0, p.z]) <= LOAD_R - 2);
        if (waiting.length && sp < 1.5) { crewT += dt; if (crewT >= CREW_LOAD && every('amb:load', 1500)) send('ambulance', 'load', { veh: E.id }); } else crewT = 0;
        const aboard = st.patients.some(q => q.state === 'aboard' && q.veh === E.id);
        if (aboard) { const w = measureJolt(E, dt); if (w != null && w > 6) send('ambulance', 'jolt', { veh: E.id, n: Math.round(w * 10) }); }
        if (aboard && sp < 2 && H.some(h => inYard(h, [p.x, 0, p.z], 12)) && every('amb:drop', 1500)) send('ambulance', 'drop', { veh: E.id });
      }
      // tow truck: tell the room once the wreck is up; drop it in a yard
      if (E.kind === 'tow_truck') {
        const T = S.towedEnt(E), w = T && st.wrecks.find(q => q.ent === T.id);
        if (w && w.hooked !== E.id && every('tow:hook', 1500)) send('tow', 'hook', { veh: T.id, to: E.id });
        if (w && w.hooked === E.id && sp < 2 && Y.some(y => inYard(y, [p.x, 0, p.z], 10)) && every('tow:drop', 1500)) send('tow', 'drop', { veh: T.id, to: E.id });
      }
      // haul: load in a depot yard, jolts on the way, drop at the destination
      if (HAUL_VEHICLES.includes(E.kind)) {
        const T = S.towedEnt(E), l = myLoad(), carrier = T && TRAILER_CARGO[T.kind] ? T : E.kind !== 'semi_truck' ? E : null;
        if (!l && carrier && sp < 1.5 && D.some(d => inYard(d, [p.x, 0, p.z], 4)) && every('haul:load', 2000)) send('haul', 'load', { veh: E.id, ...(T ? { to: T.id } : {}) });
        if (l) {
          const w = measureJolt(E, dt); if (w != null && w > 6) send('haul', 'jolt', { veh: E.id, ...(T ? { to: T.id } : {}), n: Math.round(w * 10) });
          const d = destOf(l);
          const there = d && (l.dest.kind === 'stops' ? flat(d, [p.x, 0, p.z]) <= STOP_R - 2 : l.dest.kind === 'depot' ? inYard(D.find(q => q.id === l.dest.id), [p.x, 0, p.z], 8) : flat(d, [p.x, 0, p.z]) <= 60);
          if (there && sp < 2 && every('haul:drop', 1500)) send('haul', 'drop', { veh: E.id, ...(T ? { to: T.id } : {}) });
        }
      }
    } else crewT = 0;
    // loading a patient on foot: E started it; stay beside them
    if (footLoad) {
      const f = W?.feet, q = st.patients.find(x => x.id === footLoad.id);
      if (!f || !q || q.state !== 'waiting' || S.mySeat() || flat(q, f) > 4.5) footLoad = null;
      else if ((footLoad.t += dt) >= LOAD_HOLD) { send('ambulance', 'load', { veh: footLoad.veh }); footLoad = null; }
    }
    // the runaway: the machine that simulates it reports patrol hits (a patrol vehicle with its siren on, closing fast)
    for (const r of st.runaways) {
      if (r.stopped) continue;
      const X = S.ents.get(r.ent); if (!X?.veh.local) continue;
      const rp = pos(X), rv = X.veh.rb.linvel();
      for (const C of S.ents.values()) {
        if (!PATROL_VEHICLES.includes(C.kind) || C.seats[0] == null) continue;
        const cp = pos(C), dx = cp.x - rp.x, dz = cp.z - rp.z, dd = Math.hypot(dx, dz);
        if (dd > 6.5) continue;
        const cv = C.veh.rb.linvel(), closing = -((cv.x - rv.x) * dx + (cv.z - rv.z) * dz) / (dd || 1);
        const k = r.id + ':' + C.id, t = now();
        if (closing > 1.2 && dd < 5 && t - (lastHit.get(k) || 0) > 600) { lastHit.set(k, t); send('patrol', 'hit', { veh: r.ent, to: C.id, n: Math.min(34, Math.round(closing * 4 + 6)) }); stats.hits++; }
        else if (Math.abs(X.veh.forwardSpeed()) < 3 && dd < 6 && t - (lastHit.get(k) || 0) > 1000) { lastHit.set(k, t); send('patrol', 'hit', { veh: r.ent, to: C.id, n: 6 }); stats.hits++; }
      }
      for (const sk of st.spikes) if (flat(sk.p, [rp.x, 0, rp.z]) <= SPIKE_R - 1 && every('spiked:' + sk.id, 2000)) send('patrol', 'spiked', { veh: r.ent });
    }
  }
  const r1 = v => Math.round(v * 10) / 10;
  const canSpike = E => PATROL_VEHICLES.includes(E.kind) && E.kind !== 'motorcycle' && st.runaways.some(r => !r.stopped) && ups('patrol').includes('patrol_spikes');
  function signNear(p, range, kind = null) {
    let best = null, bd = range;
    for (const s of signs) { if (kind && !JOB_VEHICLES[s.job].includes(kind)) continue; const d = flat(s, [p.x ?? p[0], 0, p.z ?? p[2]]); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  // ---- water: one drop of my cannon's spray ended here
  function water_(p) {
    const E = myE(); if (!E || !FIRE_VEHICLES.includes(E.kind)) return;
    const t = pos(E), reach = fireRules(ups('fire')).reach;
    if (Math.hypot(p[0] - t.x, p[2] - t.z) > reach + 3) return;
    if (!st.fires.some(f => Math.hypot(p[0] - f.x, p[2] - f.z) <= f.r + 4)) return;
    water.n++; water.x += p[0]; water.y += p[1]; water.z += p[2]; stats.drops++;
  }
  const waterLife = () => { const E = myE(); return E && FIRE_VEHICLES.includes(E.kind) ? fireRules(ups('fire')).reach / 32 * 1.35 : null; };

  // ---- on foot: E at a station sign, E beside a patient
  function nearSpot(feet) {
    const q = st.patients.find(x => x.state === 'waiting' && flat(x, feet) <= 3.5);
    if (q) {
      const amb = [...S.ents.values()].filter(X => AMB_VEHICLES.includes(X.kind)).map(X => ({ X, d: flat(q, [pos(X).x, 0, pos(X).z]) })).sort((a, b) => a.d - b.d)[0];
      if (footLoad) return { hint: `Loading the patient… ${Math.round(footLoad.t / LOAD_HOLD * 100)}%`, use: () => {} };
      if (!amb || amb.d > LOAD_R - 1) return { hint: 'Bring an ambulance (or the helicopter) right up to them', use: () => toast('Park an ambulance beside them first.') };
      return { hint: 'Load the patient (stay beside them)', use: () => { footLoad = { id: q.id, veh: amb.X.id, t: 0 }; } };
    }
    const sg = signNear(feet, SIGN_RANGE);
    if (sg) return { hint: CAP(ACTION[sg.job]), use: () => { send(sg.job, 'start'); stats.starts++; } };
    return null;
  }
  // ---- T in a tow truck with nothing in hitch range: the winch
  function winchPress(A) {
    // at a station sign (stopped): T takes that job's call
    const sg = signNear(pos(A), SIGN_DRIVE_RANGE, A.kind);
    if (sg && speedOf(A) < 2 && !st.wrecks.some(w => w.by === me) && !st.loads.some(l => l.by === me)) { send(sg.job, 'start'); stats.starts++; return true; }
    if (A.kind !== 'tow_truck') return false;
    if (winch.auto) return true;            // the winch's own lift found nothing in reach: do not start it again
    if (winch.on) { winch.on = false; fx.cable(null); toast('Winch off'); return true; }
    const tp = A.veh.towPointWorld?.(); if (!tp) return false;
    const w = st.wrecks.map(q => S.ents.get(q.ent)).filter(Boolean).map(X => ({ X, d: Math.hypot(pos(X).x - tp.x, pos(X).z - tp.z) })).sort((a, b) => a.d - b.d)[0];
    if (!w || w.d > towRules(ups('tow')).winchR) return false;
    winch.on = true; winch.wreck = w.X.id; toast(ups('tow').includes('tow_winch') ? 'Strong winch pulling…' : 'Winch pulling…');
    return true;
  }

  // ---------------------------------------------------------------------------------------------- what the HUD says
  function hud({ E = null, seat = null, feet = null } = {}) {
    const at = E ? pos(E) : feet ? { x: feet[0], z: feet[2] } : null;
    if (!at) return null;
    const here = [at.x, 0, at.z], dist = q => flat(q, here);
    const bits = []; let hint = null;
    const f = myFire();
    if (f) bits.push(`${f.kind[0].toUpperCase() + f.kind.slice(1)} fire · severity ${f.sev} · ${kmText(dist(f))}`);
    if (E && FIRE_VEHICLES.includes(E.kind)) {
      const R = fireRules(ups('fire')), tk = st.tanks.get(E.id) || { water: R.tank, cap: R.tank };
      bits.push(`Tank ${Math.round(tk.water / tk.cap * 100)}%`);
      const nf = st.fires.slice().sort((a, b) => dist(a) - dist(b))[0];
      if (seat === 0 && tk.water <= 0) hint = 'Tank empty — park at a hydrant (town gates) or a fire station';
      else if (seat === 0 && nf && dist(nf) < R.reach + nf.r) hint = 'F — climb up to the water cannon';
      else if (seat !== 0 && E.def.seats[seat]?.gun && nf) hint = dist(nf) < R.reach + nf.r ? 'Fire: aim at the flames and hold it' : `Too far — the cannon reaches ${Math.round(R.reach)} m`;
    }
    const p = myPatient();
    if (p) {
      if (p.state === 'aboard') { const h = nearestIn(H, at); bits.push(`Patient aboard · ${p.bumps} hard bump${p.bumps === 1 ? '' : 's'} · ${h.item.name} ${kmText(h.d)}`); if (E && h.d < 40) hint = 'Stop in the hospital yard'; }
      else { bits.push(`Patient · ${kmText(dist(p))}`); if (E && AMB_VEHICLES.includes(E.kind) && dist(p) < LOAD_R) hint = speedOf(E) < 1.5 ? `Loading… ${Math.round(Math.min(1, crewT / CREW_LOAD) * 100)}%` : 'Stop beside the patient'; }
    }
    const r = myRunaway();
    if (r) {
      const X = S.ents.get(r.ent), rp = X ? pos(X) : null;
      bits.push(`Runaway${rp ? ' · ' + kmText(Math.hypot(rp.x - at.x, rp.z - at.z)) : ''} · stop meter ${r.meter}%`);
      if (E && PATROL_VEHICLES.includes(E.kind) && seat === 0) hint = E.acts?.siren ? (canSpike(E) ? 'T — drop a stinger strip (and ram it)' : 'Ram it until it pulls over!') : 'Fire: siren on first — then ram it';
    }
    const w = myWreck();
    if (w) {
      if (w.hooked != null) { const y = nearestIn(Y, at); bits.push(`Towing · ${y.item.name} ${kmText(y.d)}`); if (E && y.d < 40) hint = 'Stop in the tow yard'; }
      else {
        const X = S.ents.get(w.ent), wp = X ? pos(X) : w;
        bits.push(`Wreck · ${kmText(Math.hypot(wp.x - at.x, wp.z - at.z))}`);
        if (E?.kind === 'tow_truck' && seat === 0 && Math.hypot(wp.x - at.x, wp.z - at.z) < 26) hint = winch.on ? 'Winching it in… (T stops)' : 'T — lift it (back up to its front; from further off T runs the winch)';
      }
    }
    const l = myLoad();
    if (l) { const d = destOf(l); bits.push(`${(LOAD_NAME[l.cargo] || 'cargo').replace(/^./, c => c.toUpperCase())} · ${l.cond}% · ${d ? `${d.name} ${kmText(dist(d))}` : 'done'}`); if (E && d && dist(d) < 50) hint = 'Stop here to deliver'; }
    else if (E && seat === 0 && HAUL_VEHICLES.includes(E.kind) && D.some(q => inYard(q, [at.x, 0, at.z], 4))) hint = E.kind === 'semi_truck' && !S.towedEnt(E) ? 'T — hitch a trailer, then stop here to load' : 'Stop here to load';
    // a station sign in reach (driving the right vehicle)
    let hitch = false;
    if (!hint && E && seat === 0) { const sg = signNear(at, SIGN_DRIVE_RANGE, E.kind); if (sg) { hint = speedOf(E) < 2 ? `T — ${ACTION[sg.job]}` : `Stop to ${ACTION[sg.job]}`; hitch = speedOf(E) < 2; } }
    if (E && seat === 0 && canSpike(E)) hitch = true;
    if (!bits.length && !hint) return null;
    return { line: bits.slice(0, 2).join(' · '), hint, hitch };
  }
  function spots() {
    const out = [];
    for (const f of st.fires) out.push({ kind: 'fire', x: f.x, z: f.z, label: 'Fire' });
    for (const p of st.patients) if (p.state === 'waiting') out.push({ kind: 'patient', x: p.x, z: p.z, label: 'Patient' });
    if (myPatient()?.state === 'aboard') for (const h of H) out.push({ kind: 'hospital', x: h.x, z: h.z, label: h.name });
    for (const r of st.runaways) { const X = S.ents.get(r.ent); if (X && !r.stopped) { const t = pos(X); out.push({ kind: 'runaway', x: t.x, z: t.z, label: 'Runaway' }); } }
    for (const w of st.wrecks) { const X = S.ents.get(w.ent); const t = X ? pos(X) : w; out.push({ kind: 'wreck', x: t.x, z: t.z, label: 'Wreck' }); }
    if (myWreck()?.hooked != null) for (const y of Y) out.push({ kind: 'yard', x: y.x, z: y.z, label: y.name });
    const l = myLoad();
    if (l) { if (l.dest.kind === 'stops') for (const s of l.dest.list) { if (!s.done) out.push({ kind: 'stop', x: s.x, z: s.z, label: 'Parcel stop' }); } else out.push({ kind: 'dest', x: l.dest.x, z: l.dest.z, label: l.dest.name }); }
    return out;
  }
  function update(camera, dt) {
    fx.fires(st.fires, dt);
    fx.people(st.patients.filter(p => p.state === 'waiting'));
    fx.spikes(st.spikes.map(s => ({ ...s })));
    // beacons: my call, where to take it, every fire
    const b = [];
    for (const f of st.fires) b.push({ x: f.x, z: f.z, color: '#ff6a2a' });
    const p = myPatient();
    if (p?.state === 'waiting') b.push({ x: p.x, z: p.z, color: '#ff4d6d' });
    if (p?.state === 'aboard') for (const h of H) b.push({ x: h.x, z: h.z, color: '#ff4d6d' });
    const w = myWreck();
    if (w && w.hooked == null) { const X = S.ents.get(w.ent); const t = X ? pos(X) : w; b.push({ x: t.x, z: t.z, color: '#c8a24a' }); }
    if (w?.hooked != null) for (const y of Y) b.push({ x: y.x, z: y.z, color: '#c8a24a' });
    const r = myRunaway(); if (r) { const X = S.ents.get(r.ent); if (X) { const t = pos(X); b.push({ x: t.x, z: t.z, y: t.y - 2, color: '#4d8dff' }); } }
    const l = myLoad(); const d = destOf(l); if (d) b.push({ x: d.x, z: d.z, color: l.dest.kind === 'stops' ? '#f2d04a' : '#8fd05a' });
    fx.beacons(b);
    fx.update(camera, dt);
  }
  function debug() {
    return { fires: st.fires.map(f => ({ id: f.id, kind: f.kind, sev: f.sev, heat: f.heat, r: f.r, by: f.by, x: f.x, z: f.z, y: f.y })), tanks: Object.fromEntries(st.tanks),
      patients: st.patients, runaways: st.runaways, spikes: st.spikes, wrecks: st.wrecks, loads: st.loads, prog: st.prog, order: st.order, winch: winch.on, footLoad: footLoad && { ...footLoad }, stats: { ...stats }, draws: fx.draws(), signs: signs.length };
  }
  function dispose() { fx.dispose(); }
  const test = {
    /** A hit on the runaway as the simulating machine would report it (Playwright: the real step, no ramming needed). */
    hit: (runawayEnt, copEnt, n = 30) => send('patrol', 'hit', { veh: runawayEnt, to: copEnt, n }),
    signs: () => signs.map(s => ({ job: s.job, x: s.x, z: s.z, id: s.id })),
    start: job => send(job, 'start'),
  };
  return { onMsg, defFor, control, frame, water: water_, waterLife, nearSpot, winch: winchPress, hud, spots, update, debug, dispose, test, signs };
}
