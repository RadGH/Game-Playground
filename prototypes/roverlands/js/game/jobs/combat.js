// The Rustwild Raids job's referee (Expansion 1 M8, docs/EXPANSION-1.md "Jobs" — the job referee contract, and "M8").
// PURE: no DOM / three.js / Rapier / sockets. js/net/jobs-core.js makes one per County room and hands it `api`.
//
// THE ROOM RUNS THE RAIDERS (docs/EXPANSION-1.md "Who simulates the raiders"): their turning, driving, aiming and
// shooting (js/game/combat.js stepCamp), their slow shots and what those hit (stepShots), every hit point — the
// raiders', the vehicles' in the zone — and the camps clearing and coming back. Pages only draw it and report their
// own guns' hits, which this referee checks (the seat has that gun, the target is in range, no faster than it fires).
//
// Wire (client -> room, `{ t:'job', id:'combat', step, … }`):
//   hit    { veh, to: foe id, n?: 1 = a shell's splash, not a direct hit }   my gun hit that raider
//   crash  { veh, n: impact speed x10 }      the vehicle I drive hit something hard (it loses hp in the zone)
//   repair { veh }                           use my Field repair kit on the vehicle I am in (once per camp)
//   sync                                     send me the camps, the raiders, the vehicles' hp and my goal again
// Room -> client (`{ t:'job', id:'combat', k, … }`):
//   k:'camps' { list: [{ id, name, title, state, back, left, total, i }] }     every camp (on any change)
//   k:'foes'  { c: camp index, f: [id, x10, y10, z10, yaw100, aim100, hp, ...] }   10 a second, near a working camp
//   k:'foe'   { fid, hp, dead }                 a raider was hit
//   k:'shot'  { s: shot id, kind, p, d, v }    a raider fired (everyone draws the same straight, slow shot)
//   k:'boom'  { s, at, hit }                   that shot hit something (hit) or the ground
//   k:'vhp'   { veh, hp, max, wreck } | { veh, hp: null }   a vehicle's hit points in the zone (null = it left / patched)
//   k:'hurt'  { dmg, from }                    to one player on foot: a raider shot hit you
//   k:'cleared' { camp, gold, level }          to each player paid for a clear
//   k:'repaired' { veh, hp }                   to the player who used the kit
//   k:'prog'  { level, text }                  the next level's goal (the phone's Jobs app)
// Refusals are `deny what:'job'` toasts, each said at most every few seconds.
import { inZone, vehicleMaxHp, vehicleRadius, weaponFor, gunRate, crashDamage, createCamps, resetCamp, stepCamp, stepShots,
  damageFoe, campCleared, campLeft, campPay, goalMet, goalText } from '../combat.js';
import { FOE_SHOTS, FOOT_RADIUS, WAKE, RESPAWN_MS, HELP_MS, WRECK_PATCH_MS, UPGRADES } from '../combat-data.js';

const SLEEP_HOME_MS = 20000;      // a camp nobody is near for this long puts its drones + buggies back home
const FOES_EVERY = 100;           // ms between raider snapshots
const NEAR_SEND = 650;            // metres: who gets a camp's snapshots and shots
const BACK_CLEAR = 120;           // a camp comes back only when nobody is this close

/** A small seeded random (the same seed, the same scatter). */
function seeded(seed) {
  let a = (seed | 0) ^ 0x9e3779b9;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Where the Rustwild Gate garage parks its own machines (sites.rustwild.garage): two Scrapper Buggies and a Trail Jeep. */
export function garageVehicles(sites) {
  const g = sites?.rustwild?.garage; if (!g || !Number.isFinite(g.x)) return [];
  const yaw = g.yaw || 0, sx = Math.cos(yaw), sz = -Math.sin(yaw);       // across the row
  return ['raider_buggy', 'raider_buggy', 'trail_jeep'].map((kind, k) => ({ kind, x: Math.round((g.x + sx * (k - 1) * 5.5) * 100) / 100, z: Math.round((g.z + sz * (k - 1) * 5.5) * 100) / 100, y: (g.y ?? 0) + 1.2, yaw }));
}

export function combatReferee(api) {
  const sites = api.sites, job = api.job;
  if (!Array.isArray(sites?.rustwild?.camps) || !sites.rustwild.camps.length) return null;
  const grid = sites.rustwild.grid || null;
  const cover = (sites.rustwild.camps || []).flatMap(c => c.cover || []);     // the shacks: raider shots stop on them
  const camps = createCamps(sites);
  const names = Object.fromEntries(camps.map(c => [c.id, c.name]));
  const rand = seeded(api.seed * 7919 + 13);
  const vhp = new Map();            // vehicle id -> { hp, max, wreck, emptyAt, kind }
  const shots = [];                 // the raiders' shots in flight
  const recs = new Map();           // pid -> { clears: [{ camp, at, clean }], wreckAt }
  const told = new Map(), warned = new Map();
  let last = api.now(), foesT = 0, keepT = 0, shotId = 1;

  const rec = pid => { let r = recs.get(pid); if (!r) { r = { clears: [], wreckAt: -1 }; recs.set(pid, r); } return r; };
  const warn = (pid, what, why) => { const k = pid + ':' + what, t = api.now(); if (t - (warned.get(k) || 0) < 3500) return; warned.set(k, t); api.deny(pid, why); };
  const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const foeById = id => { const c = camps[Math.floor(id / 16)]; return c ? { camp: c, f: c.foes.find(f => f.id === id) || null } : { camp: null, f: null }; };
  const sees = P => P && !P.spec && (P.place === 'county' || P.place === 'sky');
  const players = () => (api.players?.() || []).filter(sees);

  // ---- goals
  function sendProg(pid, force = false) {
    const P = api.player(pid); if (!P?.profile) return;
    const L = api.nextLevel(pid), row = L ? job.levels.find(l => l.n === L) : null;
    const text = row ? (goalText(row.need, rec(pid), api.now(), names) || row.goal || row.title) : 'Every level done. The camps come back — keep raiding for gold.';
    const key = `${L}|${text}`;
    if (!force && told.get(pid) === key) return;
    told.set(pid, key);
    api.send(pid, { k: 'prog', level: L, text });
  }
  const campRow = c => ({ id: c.id, i: c.i, name: c.name, title: c.title, state: c.state, back: c.state === 'cleared' ? c.backAt : 0, left: campLeft(c), total: c.foes.length, fortress: c.fortress });
  const castCamps = () => api.cast({ k: 'camps', list: camps.map(campRow) });
  const snap = c => { const out = []; for (const f of c.foes) out.push(f.id, Math.round(f.p[0] * 10), Math.round(f.p[1] * 10), Math.round(f.p[2] * 10), Math.round(f.yaw * 100), Math.round(f.aim * 100), Math.round(f.hp)); return out; };

  // ---- vehicles in the zone
  function vehRow(veh) { const R = vhp.get(veh); return R ? { k: 'vhp', veh, hp: Math.round(R.hp), max: R.max, wreck: !!R.wreck } : { k: 'vhp', veh, hp: null }; }
  function hurtVeh(veh, dmg) {
    const R = vhp.get(veh); if (!R || R.wreck || !(dmg > 0)) return;
    R.hp = Math.max(0, R.hp - dmg);
    if (R.hp <= 0) {
      R.wreck = true; R.emptyAt = 0;
      const E = api.ent(veh), t = api.now();
      for (const q of E?.seats || []) if (q != null) rec(q).wreckAt = t;
    }
    api.cast(vehRow(veh));
  }
  /** Keep the zone's hit points: every occupied vehicle in the Rustwild has a record; one that leaves (or a wreck nobody
   *  sits in for a while) is whole again. */
  function keepVehicles(list) {
    const t = api.now(), seen = new Set();
    for (const P of list) {
      if (!P.seat) continue;
      const veh = P.seat[0]; if (seen.has(veh)) continue; seen.add(veh);
      const E = api.ent(veh); if (!E?.pos || E.place !== 'county') continue;
      const inside = inZone(sites, E.pos[0], E.pos[2]);
      let R = vhp.get(veh);
      if (!inside) { if (R) { vhp.delete(veh); api.cast(vehRow(veh)); } continue; }
      const driver = E.seats?.[0];
      const max = vehicleMaxHp(E.kind, driver != null ? api.upgrades(driver) : []);
      if (!R) { R = { hp: max, max, wreck: false, emptyAt: 0, kind: E.kind }; vhp.set(veh, R); api.cast(vehRow(veh)); }
      else if (driver != null && max !== R.max && !R.wreck) { R.hp = Math.round(R.hp * max / R.max); R.max = max; api.cast(vehRow(veh)); }
      R.emptyAt = 0;
    }
    for (const [veh, R] of [...vhp]) {
      if (seen.has(veh)) continue;
      const E = api.ent(veh);
      if (!E || !E.pos || !inZone(sites, E.pos[0], E.pos[2])) { vhp.delete(veh); api.cast(vehRow(veh)); continue; }
      if (!R.wreck) continue;                               // empty: not a target, but it keeps its damage
      if (!R.emptyAt) R.emptyAt = t;
      if (t - R.emptyAt > WRECK_PATCH_MS) { vhp.delete(veh); api.cast(vehRow(veh)); }
    }
  }
  /** Who the raiders can shoot: occupied, unwrecked vehicles and people on foot (not knocked down), in the zone. */
  function targetsOf(list) {
    const out = [], seen = new Set();
    for (const P of list) {
      if (P.seat) {
        const veh = P.seat[0]; if (seen.has(veh)) continue; seen.add(veh);
        const E = api.ent(veh), R = vhp.get(veh);
        if (!E?.pos || !R || R.wreck) continue;
        out.push({ key: 'v' + veh, veh, p: E.pos, r: vehicleRadius(E.kind) });
      } else if (P.pos && !P.down && P.place === 'county' && inZone(sites, P.pos[0], P.pos[2])) {
        out.push({ key: 'p' + P.pid, pid: P.pid, p: P.pos, c: [P.pos[0], P.pos[1] + 0.9, P.pos[2]], r: FOOT_RADIUS });
      }
    }
    return out;
  }

  // ---- a raider hit by a player's gun
  function hurtFoe(camp, f, dmg) {
    if (!f || f.dead || !(dmg > 0)) return;
    damageFoe(camp, f, dmg);
    api.cast({ k: 'foe', fid: f.id, hp: Math.round(f.hp), dead: f.dead });
  }
  function hit(pid, msg) {
    const P = api.player(pid); if (!P?.seat) return;
    const [veh, seat] = P.seat;
    if (msg.veh != null && msg.veh !== veh) return;
    const E = api.ent(veh); if (!E?.pos) return;
    const ups = api.upgrades(pid), w = weaponFor(E.kind, seat, ups);
    if (!w) return warn(pid, 'gun', 'That seat has no gun.');
    if (vhp.get(veh)?.wreck) return warn(pid, 'wreck', 'This vehicle is wrecked — get out and summon another one.');
    const { camp, f } = foeById(msg.to);
    if (!f || f.dead || camp.state !== 'held') return;
    if (!inZone(sites, E.pos[0], E.pos[2])) return warn(pid, 'zone', 'Raiders only fight inside the Rustwild.');
    if (d3(E.pos, f.p) > w.range + 25) return warn(pid, 'far', 'Too far away to hit that.');
    if (!api.take(`gun:${veh}:${seat}`, gunRate(E.kind, seat, ups) * 1.3 + 0.3, 3)) return;
    const t = api.now();
    if (!camp.fightAt) camp.fightAt = t;
    // everyone in the shooter's vehicle helped
    camp.helpers.set(pid, t);
    for (const q of E.seats || []) if (q != null) camp.helpers.set(q, t);
    const splash = msg.n === 1;
    hurtFoe(camp, f, splash ? (w.splashDmg || 0) : w.dmg);
    if (w.splash) for (const g of camp.foes) if (g !== f && !g.dead && d3(g.p, f.p) <= w.splash) hurtFoe(camp, g, w.splashDmg);
    if (campCleared(camp)) clearCamp(camp, f.p, veh);
  }
  function clearCamp(camp, at, veh) {
    const t = api.now();
    camp.state = 'cleared'; camp.clearedAt = t; camp.backAt = t + RESPAWN_MS;
    const gold = campPay(job, camp);
    // everyone who hit it lately (and whoever rode with them), plus anyone in the vehicle that made the last kill or
    // within 30 m of it (jobs-core payTo adds those) — each the whole amount
    const pids = [];
    for (const [q, when] of camp.helpers) if (t - when <= HELP_MS) pids.push(q);
    const paid = api.payTo({ pids, gold, at, vehicle: veh, why: `Rustwild Raids · ${camp.name} cleared` });
    for (const q of paid) {
      const r = rec(q);
      r.clears.push({ camp: camp.id, at: t, clean: !(r.wreckAt >= camp.fightAt && camp.fightAt > 0) });
      if (r.clears.length > 60) r.clears.splice(0, r.clears.length - 60);
    }
    // each player's own next level, taken BEFORE any is paid: a level paid to one also pays (and records) it for the
    // friends beside them, and must not then cascade into their next level on the same clear
    const before = new Map(paid.map(q => [q, api.nextLevel(q)]));
    for (const q of paid) {
      let level = null;
      const L = before.get(q), row = L ? job.levels.find(l => l.n === L) : null;
      if (row && api.nextLevel(q) === L && goalMet(row.need, rec(q), t)) { const res = api.levelDone(q, L, { at, vehicle: veh }); if (res?.ok) level = L; }
      else if (row && api.nextLevel(q) !== L) level = L;          // a friend's level pay recorded it for this player
      api.send(q, { k: 'cleared', camp: camp.id, name: camp.name, gold, level });
      sendProg(q);
    }
    castCamps();
  }
  function crash(pid, msg) {
    const P = api.player(pid); if (!P?.seat || P.seat[1] !== 0) return;
    const veh = P.seat[0]; if (msg.veh != null && msg.veh !== veh) return;
    if (!vhp.has(veh)) return;
    if (!api.take('crash:' + veh, 1, 2)) return;
    hurtVeh(veh, crashDamage((msg.n || 0) / 10));
  }
  function repair(pid, msg) {
    const P = api.player(pid); if (!P?.seat) return;
    const veh = P.seat[0]; if (msg.veh != null && msg.veh !== veh) return;
    if (!api.upgrades(pid).includes('combat_repair')) return warn(pid, 'repair', 'You need the Field repair kit (phone → Jobs → Rustwild Raids).');
    const R = vhp.get(veh), E = api.ent(veh);
    if (!R || !E?.pos) return warn(pid, 'repair', 'Nothing to fix — vehicles only take damage in the Rustwild.');
    if (!R.wreck && R.hp >= R.max) return warn(pid, 'repair', 'It is not damaged.');
    let camp = null, bd = Infinity;
    for (const c of camps) { const d = flat(E.pos, [c.x, 0, c.z]); if (d < bd) { bd = d; camp = c; } }
    if (!camp) return;
    if (camp.repairs.has(pid)) return warn(pid, 'repair', `Your repair kit is spent at ${camp.name} — it is ready again at the next camp.`);
    camp.repairs.add(pid);
    R.hp = Math.min(R.max, R.hp + R.max * UPGRADES.combat_repair.heal); R.wreck = false; R.emptyAt = 0;
    api.cast(vehRow(veh));
    api.send(pid, { k: 'repaired', veh, hp: Math.round(R.hp), camp: camp.name });
  }
  function sync(pid) {
    api.send(pid, { k: 'camps', list: camps.map(campRow) });
    for (const c of camps) api.send(pid, { k: 'foes', c: c.i, f: snap(c) });
    for (const veh of vhp.keys()) api.send(pid, vehRow(veh));
    told.delete(pid); sendProg(pid);
  }

  return {
    step(pid, msg) {
      if (msg.step === 'hit') return hit(pid, msg);
      if (msg.step === 'crash') return crash(pid, msg);
      if (msg.step === 'repair') return repair(pid, msg);
      if (msg.step === 'sync') return sync(pid);
    },
    tick() {
      const t = api.now(), dt = Math.min(0.25, Math.max(0, (t - last) / 1000)); last = t;
      if (!dt) return;
      const list = players();
      if (t - keepT >= 250) { keepT = t; keepVehicles(list); }
      const targets = targetsOf(list);
      const ctx = { grid, rand, cover };
      for (const c of camps) {
        // a cleared camp comes back after a few minutes — never in front of someone
        if (c.state === 'cleared') {
          if (t >= c.backAt && !list.some(P => P.pos && flat(P.pos, [c.x, 0, c.z]) < BACK_CLEAR)) { resetCamp(c); castCamps(); for (const P of list) if (P.pos && flat(P.pos, [c.x, 0, c.z]) < NEAR_SEND) api.send(P.pid, { k: 'foes', c: c.i, f: snap(c) }); }
          continue;
        }
        const awake = list.some(P => P.pos && flat(P.pos, [c.x, 0, c.z]) < WAKE);
        if (!awake) {
          if (c.awake) { c.awake = false; c.sleptAt = t; }
          if (c.sleptAt && t - c.sleptAt > SLEEP_HOME_MS) { c.sleptAt = 0; for (const f of c.foes) if (!f.dead) { f.p = f.home.slice(); f.target = null; f.burst = 0; } }
          continue;
        }
        c.awake = true; c.sleptAt = 0;
        for (const s of stepCamp(c, dt, targets, ctx)) {
          const id = shotId++;
          shots.push({ id, ...s, life: FOE_SHOTS[s.kind]?.life ?? 3 });
          const m = { k: 'shot', s: id, kind: s.kind, p: s.p.map(v => Math.round(v * 100) / 100), d: s.d.map(v => Math.round(v * 1000) / 1000), v: s.speed };
          for (const P of list) if (P.pos && flat(P.pos, s.p) < NEAR_SEND) api.send(P.pid, m);
        }
      }
      for (const h of stepShots(shots, dt, targets, ctx)) {
        const tg = h.target, at = h.at.map(v => Math.round(v * 100) / 100);
        if (tg?.veh != null) hurtVeh(tg.veh, h.shot.dmg);
        else if (tg?.pid != null) api.send(tg.pid, { k: 'hurt', dmg: h.shot.dmg, from: [Math.round(h.shot.p[0]), Math.round(h.shot.p[2])] });
        const m = { k: 'boom', s: h.shot.id, at, hit: !!tg, kind: h.shot.kind };
        for (const P of list) if (P.pos && flat(P.pos, at) < NEAR_SEND) api.send(P.pid, m);
      }
      if (t - foesT >= FOES_EVERY) {
        foesT = t;
        for (const c of camps) {
          if (!c.awake || c.state !== 'held') continue;
          const m = { k: 'foes', c: c.i, f: snap(c) };
          for (const P of list) if (P.pos && flat(P.pos, [c.x, 0, c.z]) < NEAR_SEND) api.send(P.pid, m);
        }
      }
    },
    resync(pid) { sync(pid); },
    fixtures: () => garageVehicles(sites),
    profileChanged(pid) { told.delete(pid); sendProg(pid); },
    // tests
    camps, vhp, shots, rec: pid => rec(pid), foe: id => foeById(id).f,
    /** Tests: the vehicle's record (or null). */
    hpOf: veh => vhp.get(veh) || null,
  };
}
