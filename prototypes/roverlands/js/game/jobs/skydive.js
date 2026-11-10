// The Skydiving job's referee (Expansion 1 M9, docs/EXPANSION-1.md "Jobs" — the job referee contract). PURE: no DOM /
// three.js / Rapier / sockets. js/net/jobs-core.js makes one per County room and hands it `api`.
//
// Wire (client -> room, `{ t:'job', id:'skydive', step, … }`):
//   board  { on: glider? }     at the Jump Point: put me on the next plane (friends within 6 s share it)
//   jump   { p }               I ran off the ramp here
//   land   { p, n: landing speed x10, veh?: the glider I landed }   I am down
//   sync                       send me the flights + my goal again
// Room -> client (`{ t:'job', id:'skydive', k, … }`):
//   k:'flight' { flight, slot }   to the boarder: you are on this plane (slot = where you stand in the hold)
//   k:'flights' { list }          to everyone in the county / sky: the planes in the air now (so friends see them)
//   k:'landed' { d, safe, gold, onTarget, bullseye, plateau, level }   to the lander: how it went
//   k:'prog' { level, text }      the next level's goal (the phone's Jobs app)
// Refusals are `deny what:'job'` toasts.
import { planFlight, flightPhase, landingScore, landingMeets, PLANE } from '../sky.js';

export const BOARD_RANGE = 30;          // metres from the Jump Point sign where E puts you on a plane
const KEEP_MS = 120000;                 // a flight is forgotten this long after it has flown on

/** Where the airport's own machines stand (room-core parks them like pad vehicles, County only). */
export function airportVehicles(sites) {
  const a = sites?.airport; if (!a?.apron || !a.jumpPoint) return [];
  const y = a.y ?? a.apron.y ?? 0, ap = a.apron, jp = a.jumpPoint;
  return [
    { kind: 'cargo_plane', x: (ap.x0 + ap.x1) / 2 - 10, z: ap.z1 - 32, y: y + 2.2, yaw: Math.PI / 2 },
    { kind: 'glider', x: jp.x + 26, z: jp.z + 14, y: y + 0.9, yaw: Math.PI },
    { kind: 'glider', x: jp.x + 38, z: jp.z + 14, y: y + 0.9, yaw: Math.PI },
  ];
}
/** The landing targets: the county's own (sites.skyTargets), else rings near the airport. */
export function skyTargets(sites) {
  const T = Array.isArray(sites?.skyTargets) ? sites.skyTargets.filter(t => Number.isFinite(t?.x) && Number.isFinite(t?.z)) : [];
  if (T.length) return T;
  const jp = sites?.airport?.jumpPoint;
  return jp ? [{ id: 'field', name: 'Wayfare Field target', x: jp.x - 120, z: jp.z + 40, y: jp.y ?? 0, r: 30 }] : [];
}
/** Highgate Plateau (the glider level's landing ground): sites.plateau, else Highgate itself. */
export function plateauOf(sites) {
  if (sites?.plateau && Number.isFinite(sites.plateau.x)) return sites.plateau;
  const h = sites?.cities?.find?.(c => c.id === 'highgate');
  return h ? { x: h.x, z: h.z, r: 300, y: h.y ?? 176, name: 'Highgate Plateau' } : null;
}
/** Is a landing spot on the plateau (inside its rim, no lower than a few metres under the top)? */
export function onPlateau(pl, p) {
  return !!(pl && p && Math.hypot(p[0] - pl.x, p[2] - pl.z) <= pl.r && p[1] >= (pl.y ?? 0) - 12);
}

export function skydiveReferee(api) {
  const job = api.job, sites = api.sites;
  const jp = sites?.airport?.jumpPoint;
  const targets = skyTargets(sites), plateau = plateauOf(sites);
  if (!jp || !targets.length) return null;
  const flights = [];                    // newest last
  const riders = new Map();              // pid -> { fid, glider, slot, jumped: { at, p } | null, landed }
  const told = new Map(), warned = new Map();
  let nextFid = 1, lastTick = 0;
  const warn = (pid, what, why) => { const k = pid + ':' + what, t = api.now(); if (t - (warned.get(k) || 0) < 4000) return; warned.set(k, t); api.deny(pid, why); };
  const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const ownsGlider = P => !!P?.profile?.owned?.vehicles?.includes?.('glider');
  const live = () => flights.filter(f => api.now() < f.endAt + 5000);
  const castFlights = () => api.cast({ k: 'flights', list: live() });

  function goalText(L) {
    const row = job.levels.find(l => l.n === L);
    if (!row) return 'Every level done. Keep jumping for gold.';
    return row.goal || row.title || '';
  }
  function sendProg(pid) {
    const P = api.player(pid); if (!P?.profile) return;
    const L = api.nextLevel(pid), text = goalText(L), key = `${L}|${text}`;
    if (told.get(pid) === key) return;
    told.set(pid, key);
    api.send(pid, { k: 'prog', level: L, text });
  }
  function pickTarget(glider) {
    if (glider && plateau) return { id: 'plateau', name: plateau.name || 'Highgate Plateau', x: plateau.x, z: plateau.z, y: plateau.y ?? 176, r: Math.min(60, plateau.r) };
    return targets[(api.seed + nextFid) % targets.length];
  }

  function board(pid, msg) {
    const P = api.player(pid); if (!P || !P.pos) return warn(pid, 'board', 'Wait a moment and try again.');
    if (P.place !== 'county' && P.place !== 'sky') return warn(pid, 'board', 'The jump plane flies from Wayfare Field.');
    if (flat(P.pos, [jp.x, 0, jp.z]) > BOARD_RANGE) return warn(pid, 'board', 'Walk to the Jump Point at Wayfare Field first.');
    const R = riders.get(pid);
    if (R && !R.landed && api.now() < R.f.endAt + 60000) return warn(pid, 'board', 'You are already on a jump.');
    const glider = !!msg.on;
    if (glider && !ownsGlider(P)) return warn(pid, 'board', 'You need a Soarwing Glider for that — the Dealer at the airport sells them.');
    if (!api.take('board:' + pid, 0.2, 2)) return warn(pid, 'board', 'The next plane is getting ready.');
    const t = api.now();
    // a plane still boarding (and of the same kind: a glider drop flies lower) takes you; else a new one
    let f = flights.find(x => x.glider === glider && t < x.openAt - 1500);
    if (!f) {
      const ups = api.upgrades(pid), target = pickTarget(glider);
      const alt = glider ? (target.y ?? 176) + PLANE.gliderAbove : PLANE.alt * (ups.includes('sky_high_drop') ? 2 : 1);
      f = planFlight({ fid: nextFid++, now: t, from: { x: jp.x, z: jp.z }, target, alt, glider });
      f.riders = 0;
      flights.push(f);
      while (flights.length > 12) flights.shift();
    }
    const slot = f.riders++;
    riders.set(pid, { fid: f.fid, f, glider, slot, jumped: null, landed: false, at: t });     // the rider keeps its flight: a canopy ride outlasts the plane's list
    api.send(pid, { k: 'flight', flight: f, slot });
    castFlights();
    sendProg(pid);
  }
  function jump(pid, msg) {
    const R = riders.get(pid); if (!R || R.jumped || R.landed) return;
    const f = R.f; if (!f || !Array.isArray(msg.p)) return;
    const t = api.now();
    if (t < f.openAt - 1000) return warn(pid, 'jump', 'Wait for the ramp to open.');
    // generous: anywhere close to the plane's line (not its exact spot now — a page's clock can be seconds off the
    // room's, and a slow machine may only get out a while after the line's end)
    if (t > f.endAt + 120000) return;
    const rx = msg.p[0] - f.x0, rz = msg.p[2] - f.z0, along = rx * f.dx + rz * f.dz, side = Math.abs(rx * f.dz - rz * f.dx);
    if (side > 80 || along < -200 || along > f.speed * (f.endAt + 120000 - f.t0) / 1000 || Math.abs(msg.p[1] - f.alt) > 200) return warn(pid, 'jump', 'You were not in the plane.');
    R.jumped = { at: t, p: msg.p.slice() };
  }
  function land(pid, msg) {
    const R = riders.get(pid); if (!R || R.landed || !R.jumped || !Array.isArray(msg.p)) return;
    const f = R.f;
    const P = api.player(pid), t = api.now(), p = msg.p;
    // you cannot have come down from the plane faster than a free fall does (with a little to spare)
    const minMs = Math.max(0, (f.alt - p[1]) / 75 * 1000 - 1500);
    if (t - R.jumped.at < minMs) return warn(pid, 'land', 'That was too quick to be a real jump.');
    if (P?.pos && flat(P.pos, p) > 60) return;
    let glider = false;
    if (msg.veh != null) { const e = api.ent(msg.veh); glider = !!(e && e.kind === 'glider' && e.seats?.[0] === pid); }
    R.landed = true;
    const speed = Math.max(0, (msg.n || 0) / 10), safe = speed <= 9;
    const d = Math.round(flat(p, [f.target.x, 0, f.target.z]) * 10) / 10;
    const plat = onPlateau(plateau, p);
    const sc = landingScore(d, job.pay);
    let gold = 0;
    if (safe) {
      const base = job.pay?.base ?? 40;
      const bonus = glider ? (plat ? (job.pay?.target_bonus ?? 80) : 0) : sc.bonus;
      gold = base + bonus;
      const why = glider ? (plat ? 'Skydiving · glider on the plateau' : 'Skydiving · glider landing') : sc.bullseye ? 'Skydiving · bullseye!' : sc.onTarget ? 'Skydiving · on target' : 'Skydiving · safe landing';
      api.payGold({ pid, gold, at: p, vehicle: glider ? msg.veh : null, why });
    }
    // the level ladder: this landing against the next level's goal
    let level = null;
    const L = api.nextLevel(pid), row = L ? job.levels.find(l => l.n === L) : null;
    if (row && landingMeets(row.need, { safe, d, glider, onPlateau: plat })) { const r = api.levelDone(pid, L, { at: p, vehicle: glider ? msg.veh : null }); if (r?.ok) level = L; }
    api.send(pid, { k: 'landed', d, safe, speed: Math.round(speed * 10) / 10, gold, onTarget: !glider && sc.onTarget, bullseye: !glider && sc.bullseye, plateau: glider && plat, glider, level, target: f.target.name });
    told.delete(pid); sendProg(pid);
  }

  return {
    step(pid, msg) {
      if (msg.step === 'board') return board(pid, msg);
      if (msg.step === 'jump') return jump(pid, msg);
      if (msg.step === 'land') return land(pid, msg);
      if (msg.step === 'sync') { api.send(pid, { k: 'flights', list: live() }); told.delete(pid); return sendProg(pid); }
    },
    tick() {
      const t = api.now(); if (t - lastTick < 1000) return; lastTick = t;
      let n = flights.length;
      for (let i = flights.length - 1; i >= 0; i--) if (t > flights[i].endAt + KEEP_MS) flights.splice(i, 1);
      if (n !== flights.length) castFlights();
    },
    resync(pid) { api.send(pid, { k: 'flights', list: live() }); told.delete(pid); sendProg(pid); },
    fixtures: () => airportVehicles(sites),
    profileChanged(pid) { told.delete(pid); sendProg(pid); },
    // tests
    get flights() { return flights; }, rider: pid => riders.get(pid) || null, phaseOf: (fid, t) => { const f = flights.find(x => x.fid === fid); return f ? flightPhase(f, t) : null; },
  };
}
