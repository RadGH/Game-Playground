// Skydiving (Expansion 1 M9): the jump plane's flight, free fall, the parachute, where the targets are and what a
// landing scores. PURE (no DOM / three.js / Rapier): the room's referee (js/game/jobs/skydive.js) and the page
// (js/game/sky-play.js) both use it, so a flight is the same line on every machine.
//
//   planFlight({ fid, now, from, target, alt, glider, bounds })   -> a flight (plain data, sent on the wire)
//   flightPose(f, t)        -> { p:[x,y,z], yaw, q:[x,y,z,w], v:[x,y,z], s }  where the plane is at room time t (ms)
//   flightPhase(f, t)       -> 'boarding' | 'open' | 'gone'       (ramp shut / open / the plane has flown on)
//   greenLight(f, t)        -> true while jumping now lands you near the target
//   holdLocal(x, z)         -> the hold floor / ramp height at a point of the plane's frame, or null past the ramp's end
//   fallRules(upgrades)     -> the parachute's numbers (the Sport parachute upgrade changes them)
//   fallStep(st, inp, dt, R) -> st moved one step: free fall, opening, canopy, flare (no ground: the caller lands it)
//   landingScore(d, pay)    -> { onTarget, bullseye, bonus } for a landing d metres from the target
//
// Numbers (the hold: js/client/models/cargo_plane.js + data/vehicles.json cargo_plane): the floor is y 0 of the plane's
// frame from the ramp hinge (z -5.75) to the bulkhead (z 5.3), walls at x +-1.5; the ramp, open, slopes down 23.8 deg
// for 4 m to z -9.41.

export const PLANE = Object.freeze({ speed: 45, boardMs: 6000, leadMs: 14000, afterMs: 16000, alt: 1200, gliderAbove: 380 });
export const HOLD = Object.freeze({ x: 1.3, zFront: 5.0, hinge: -5.75, rampLen: 4, rampA: 0.415 });
export const RAMP_END = HOLD.hinge - HOLD.rampLen * Math.cos(HOLD.rampA);
export const PLANE_ID = 900000;                 // `on` ids (pos messages) for "standing in jump plane N": PLANE_ID + fid
export const FALL_G = 9.81;

/** The flight: a straight line at `alt` that passes over `target` leadMs after the ramp opens. */
export function planFlight({ fid, now, from = null, target, alt = PLANE.alt, glider = false, bounds = 1500, speed = PLANE.speed }) {
  const t0 = Math.round(now), openAt = t0 + PLANE.boardMs, overAt = openAt + PLANE.leadMs, endAt = overAt + PLANE.afterMs;
  const before = speed * (overAt - t0) / 1000, after = speed * (endAt - overAt) / 1000;
  // the heading that keeps both ends of the line furthest inside the map (ties: the one that starts nearest `from`)
  let best = null;
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
    const s = [target.x - dx * before, target.z - dz * before], e = [target.x + dx * after, target.z + dz * after];
    const margin = Math.min(bounds - Math.abs(s[0]), bounds - Math.abs(s[1]), bounds - Math.abs(e[0]), bounds - Math.abs(e[1]));
    const near = from ? -Math.hypot(s[0] - from.x, s[1] - from.z) * 0.02 : 0;
    const score = Math.min(margin, 200) + near;
    if (!best || score > best.score) best = { score, dx, dz, s };
  }
  return { fid, t0, openAt, overAt, endAt, speed, alt: Math.round(alt), glider: !!glider,
    x0: r2(best.s[0]), z0: r2(best.s[1]), dx: r4(best.dx), dz: r4(best.dz),
    target: { x: r2(target.x), z: r2(target.z), y: r2(target.y ?? 0), id: target.id ?? null, name: target.name ?? null, r: target.r ?? 30 } };
}
export function flightPose(f, t) {
  const s = (t - f.t0) / 1000 * f.speed;
  const yaw = Math.atan2(f.dx, f.dz);
  return { p: [f.x0 + f.dx * s, f.alt, f.z0 + f.dz * s], yaw, q: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], v: [f.dx * f.speed, 0, f.dz * f.speed], s };
}
export const flightPhase = (f, t) => (t < f.openAt ? 'boarding' : t < f.endAt ? 'open' : 'gone');
/** Metres the plane still has to fly to be over the target (negative: past it). */
export const toTarget = (f, t) => f.speed * (f.overAt - t) / 1000;
export function greenLight(f, t) {
  if (flightPhase(f, t) !== 'open') return false;
  if (f.glider) return true;
  const d = toTarget(f, t);
  return d < 650 && d > -200;
}
/** Hold floor height (plane frame) at local x, z; null = past the end of the open ramp (out in the air). */
export function holdLocal(z, open = true) {
  if (z >= HOLD.hinge) return 0;
  if (!open) return 0;
  if (z < RAMP_END) return null;
  return (z - HOLD.hinge) * Math.tan(HOLD.rampA);
}
/** Keep a walker inside the hold (the ramp counts only while it is open). -> [x, z]. */
export function clampHold(x, z, open) {
  return [Math.max(-HOLD.x, Math.min(HOLD.x, x)), Math.min(HOLD.zFront, open ? z : Math.max(HOLD.hinge + 0.3, z))];
}

// ------------------------------------------------------------------------------------------------- free fall + canopy
/** The parachute's numbers; `sky_steer_chute` (the Sport parachute) steers faster, flies faster and lands softer. */
export function fallRules(upgrades = []) {
  const sport = upgrades.includes('sky_steer_chute');
  return {
    sport,
    term: 54, trackTerm: 60, track: 16,           // free fall: belly-to-earth terminal speed, tracking (stick forward)
    fwd: sport ? 10 : 8, sink: sport ? 4.4 : 5.2, turn: sport ? 1.5 : 0.8,   // the canopy: forward speed, sink, turn rate
    flare: sport ? 0.85 : 0.72,                   // how much of the sink a full flare takes away (while it lasts)
    openSecs: 2.2, autoOpen: 140,                 // seconds to fill; height above the ground it opens by itself
  };
}
/**
 * One step of a skydiver in the air. st = { p, v, yaw, mode: 'fall' | 'canopy', open: seconds since the canopy was
 * pulled, flare: 1..0 (a flare's strength left) }; inp = { mx, my (stick, +my = forward/track), brake 0..1, camYaw }.
 * Mutates and returns st. The caller decides when it hits the ground (and with what speed).
 */
export function fallStep(st, inp, dt, R) {
  const v = st.v;
  if (st.mode === 'fall') {
    // horizontal: the stick (turned by the camera) asks for a drift / track speed, the air brings you to it
    const cy = inp.camYaw ?? st.yaw, fx = Math.sin(cy), fz = Math.cos(cy);
    const wx = (fx * (inp.my || 0) - fz * (inp.mx || 0)), wz = (fz * (inp.my || 0) + fx * (inp.mx || 0));
    const wl = Math.hypot(wx, wz), k = wl > 1 ? 1 / wl : 1;
    const tx = wx * k * R.track, tz = wz * k * R.track;
    const a = 1 - Math.exp(-0.7 * dt);
    v[0] += (tx - v[0]) * a; v[2] += (tz - v[2]) * a;
    const term = R.term + (R.trackTerm - R.term) * Math.min(1, wl);
    v[1] += (-FALL_G + FALL_G * (v[1] * v[1]) / (term * term) * (v[1] < 0 ? 1 : -1)) * dt;
    if (v[1] < -term * 1.4) v[1] = -term * 1.4;
    const hs = Math.hypot(v[0], v[2]);
    if (hs > 2 && wl > 0.1) st.yaw = turnTo(st.yaw, Math.atan2(v[0], v[2]), dt * 2.5);
  } else {
    st.open = (st.open || 0) + dt;
    const fill = Math.min(1, st.open / R.openSecs);
    const brake = Math.max(0, Math.min(1, inp.brake || 0));
    st.yaw += -(inp.mx || 0) * R.turn * dt * (1 - brake * 0.4);
    // a flare is strong for about two seconds of pulling, then it is spent until you let go for a while
    if (brake > 0.05) st.flare = Math.max(0, (st.flare ?? 1) - brake * dt * 0.25); else st.flare = Math.min(1, (st.flare ?? 1) + dt * 0.12);
    const flareNow = brake * Math.min(1, (st.flare ?? 1) * 2);       // full for ~2 s of pulling, gone by ~4 s
    const fwd = R.fwd * (1 - 0.55 * brake) + Math.max(0, inp.my || 0) * 2;
    const sink = R.sink * (1 - R.flare * flareNow) + Math.abs(inp.mx || 0) * 1.4;
    const want = [Math.sin(st.yaw) * fwd, -sink, Math.cos(st.yaw) * fwd];
    const a = 1 - Math.exp(-(fill < 1 ? 1.2 + fill * 2 : 3) * dt);
    for (let i = 0; i < 3; i++) v[i] += (want[i] - v[i]) * a;
  }
  st.p[0] += v[0] * dt; st.p[1] += v[1] * dt; st.p[2] += v[2] * dt;
  return st;
}
export function openCanopy(st) { if (st.mode !== 'fall') return false; st.mode = 'canopy'; st.open = 0; st.flare = 1; return true; }
const turnTo = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + Math.max(-k, Math.min(k, d)); };

// ------------------------------------------------------------------------------------------------- scoring
/** A landing `d` metres from the target: on target within the target's ring (30 m), a bullseye within 5 m. */
export function landingScore(d, pay = {}) {
  const ring = 30, bonusMax = pay.target_bonus ?? 80;
  const onTarget = d <= ring, bullseye = d <= 5;
  const bonus = onTarget ? Math.round(bonusMax * Math.max(0.25, 1 - d / ring)) + (bullseye ? Math.round(bonusMax / 2) : 0) : 0;
  return { onTarget, bullseye, bonus };
}
/** The level goals of data/jobs.json skydive (level.need): is this landing enough for it? */
export function landingMeets(need, L) {
  if (!need) return !!L.safe;
  if (need.glider) return !!(L.glider && L.onPlateau && L.safe);
  if (Number.isFinite(need.within)) return !!(L.safe && !L.glider && L.d <= need.within);
  if (need.safe) return !!L.safe && !L.glider;
  return false;
}
const r2 = v => Math.round(v * 100) / 100, r4 = v => Math.round(v * 1e4) / 1e4;
/** The glider a player flies: their own copy of the definition when an upgrade changes it (never the shared one). */
export function gliderDef(def, upgrades = []) {
  if (!def || !upgrades.includes('sky_long_wing')) return def;
  const a = def.aero || {};
  return { ...def, aero: { ...a, glidePath: (a.glidePath ?? -0.085) * 0.7, cd0: (a.cd0 ?? 0.035) * 0.8, area: (a.area ?? 15) * 1.15 } };
}
