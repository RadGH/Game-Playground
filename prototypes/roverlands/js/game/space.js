// Space rules (Expansion 1 M11): the rocket launch, the orbit screen's choices, floating in zero-g on Lantern Station,
// and the landing pod's way home. PURE (no DOM, no three.js, no Rapier, no clock): the page (js/game/space-play.js),
// the room (js/net/room-core.js) and the tests (tests/space.test.js) all read the same numbers from here.
//
//   SPACE                          the numbers (orbit height, countdown, staging, pod start, chute)
//   launchPhase({ alt, count, lever, staged })   'pad' | 'countdown' | 'liftoff' | 'ascent' | 'staged' | 'orbit'
//   countdownStep(c, dt)           -> { left, go }   the count (seconds left, null = not counting); go the frame it hits 0
//   assistLever(lever, dt, brake)  the throttle the launch assist asks for after liftoff (full in 2 s unless you hold S)
//   stageDue(alt, staged)          'ask' (show "Fire — separate the booster") | 'auto' (do it now) | null
//   orbitChoices() / travelChoices(place)   the buttons on the orbit screen / at the station's dock / at the Moon's pad
//   podStart(site, ground)         where the pod appears and how fast it is falling: { p, v }
//   heatTarget(speed, agl), heatStep(h, target, dt)   the reentry glow: builds while fast and high, fades as it slows
//   chuteHeight(speed)             metres above the ground at which the parachute opens by itself (safe for that speed)
//   FLOAT, floatStep(st, inp, dt, hull)   one zero-g step: thrust, push off, grab a rail, drift, bounce off the hull
//   nearestRail(p, rails), wallDistance(p, boxes)   (for the hint and the tests)
//   lapDone(visited, rooms)        true when every room of the station has been floated through
//   arrival(place, k)              where you appear: the station's docking hatch, the Moon's landing pad ([x, y|null, z])
//   moonParking()                  the Crater Crawlers the room parks on the Moon: one beside the landing pad, four at the garage
import { MOON } from '../world/moon/moon-data.js';
import { STATION } from '../world/station/station-data.js';

export const SPACE = Object.freeze({
  orbitAlt: 3000,        // metres above the launch pad: the rocket is in orbit (the page fades to the orbit screen)
  countdown: 5,          // seconds from "launch" to ignition
  liftoff: 40,           // metres: under this the rocket is still leaving the tower
  stageAsk: 900,         // metres: the booster is nearly spent — "Fire: separate the booster"
  stageAuto: 1500,       // metres: it separates by itself if nobody has
  podAlt: 2600,          // metres above the ground where the pod comes back into the air
  podSpeed: 190,         // m/s, falling, when it does (and a little sideways drift)
  podMinY: 300,          // the room refuses a pod start lower than this above sea level (or higher than podMaxY)
  podMaxY: 4200,
  heatFrom: 95,          // m/s: slower than this nothing glows
  heatFull: 175,         // m/s: this fast (high up) the shield is white hot
  chuteMin: 250, chuteMax: 1100,
  podLanded: 3.5,        // m/s: slower than this on the ground = touched down
  rocketPadRange: 200,   // metres: the rocket can only be called to the pad, from this close
});

// ---------------------------------------------------------------------------------------------------- the launch
/** Where in the launch a rocket is. alt = metres above the pad, count = seconds left on the countdown (null if none). */
export function launchPhase({ alt = 0, count = null, lever = 0, staged = false } = {}) {
  if (alt >= SPACE.orbitAlt) return 'orbit';
  if (count != null && count > 0) return 'countdown';
  if (alt < 2 && lever <= 0.01) return 'pad';
  if (alt < SPACE.liftoff) return 'liftoff';
  return staged ? 'staged' : 'ascent';
}
/** One frame of the countdown. c = seconds left (null = not counting). */
export function countdownStep(c, dt) {
  if (c == null) return { left: null, go: false };
  const left = c - dt;
  return left <= 0 ? { left: null, go: true } : { left, go: false };
}
/** The launch assist: once lit, the lever goes to full over 2 s; holding S (brake) pulls it back instead. */
export function assistLever(lever, dt, brake = 0) {
  if (brake > 0.1) return Math.max(0, lever - dt * 0.7 * brake);
  return Math.min(1, lever + dt * 0.5);
}
export function stageDue(alt, staged) {
  if (staged) return null;
  if (alt >= SPACE.stageAuto) return 'auto';
  if (alt >= SPACE.stageAsk) return 'ask';
  return null;
}

// ---------------------------------------------------------------------------------------------------- where to next
const ORBIT = [
  { id: 'station', place: 'station', label: 'Dock at Lantern Station', note: 'Float around the station in zero gravity' },
  { id: 'moon', place: 'moon', label: 'Land on the Moon', note: 'Greywatch Landing, beside a Crater Crawler' },
  { id: 'home', place: 'county', label: 'Return home', note: 'Ride the Homeward Pod back down to Wayfare County' },
];
export const orbitChoices = () => ORBIT.map(c => ({ ...c }));
/** From the station's dock or the Moon's landing pad. */
export function travelChoices(place) {
  if (place === 'station') return [{ ...ORBIT[2], label: 'Head home' }, { ...ORBIT[1], label: 'Go to the Moon' }];
  if (place === 'moon') return [{ ...ORBIT[2], label: 'Head home' }, { ...ORBIT[0], label: 'Fly up to Lantern Station' }];
  return [];
}

/** Where someone arriving in a place appears (k = which of a group, so friends do not stand in each other). */
export function arrival(place, k = 0) {
  if (place === 'station') {
    const s = STATION.spots.find(x => x.id === STATION.spawn).at;
    return [r2(s[0] + 1.6 + (k % 3) * 0.9), r2(s[1] + ((k % 2) ? 0.8 : 0)), r2(s[2] + (k % 2 ? -0.7 : 0.7) * (k ? 1 : 0))];
  }
  if (place === 'moon') { const L = MOON.landing, a = k * 1.3; return [r2(L.x + Math.cos(a) * 2 * (k ? 1 : 0)), null, r2(L.z - 2 + Math.sin(a) * 2 * (k ? 1 : 0))]; }
  return null;
}
/** The Moon's vehicles, parked by the room (place 'moon'): a rover beside the landing pad and four at the garage. */
export function moonParking() {
  const L = MOON.landing, B = MOON.base, v = MOON.vehicle;
  return [{ vehicle: v, x: L.x - 8, z: L.z - 2, yaw: 0, area: 'landing' }, ...MOON.garagePads.map(([dx, dz]) => ({ vehicle: v, x: B.x + dx, z: B.z + dz, yaw: 0, area: 'greywatch' }))];
}

// ---------------------------------------------------------------------------------------------------- the pod
/** The pod's start: high over `site` (the launch site, or home), falling fast and drifting a little east. */
export function podStart(site, ground = 0, k = 0) {
  const a = 0.6 + (k % 4) * 0.9;           // friends coming home together start a few metres apart
  const x = site.x + Math.cos(a) * 6 * (k ? 1 : 0), z = site.z + Math.sin(a) * 6 * (k ? 1 : 0);
  return { p: [r2(x), r2(ground + SPACE.podAlt), r2(z)], v: [6, -SPACE.podSpeed, -4] };
}
/** How hot the shield should glow (0..1) at this speed and height above the ground. */
export function heatTarget(speed, agl = 2000) {
  const s = clamp((speed - SPACE.heatFrom) / (SPACE.heatFull - SPACE.heatFrom), 0, 1);
  const air = clamp(agl / 500, 0, 1);       // the last few hundred metres are too slow and too low to glow anyway
  return s * s * (3 - 2 * s) * air;
}
/** The glow follows its target: it builds over ~2 s and fades over ~3 s. */
export function heatStep(h, target, dt) {
  return target > h ? Math.min(target, h + dt * 0.5) : Math.max(target, h - dt * 0.33);
}
/** The safe height to open at `speed` m/s: the canopy takes ~2.5 s to fill and then pulls ~3 g. */
export function chuteHeight(speed, { maxG = 4, g = 9.81, open = 2.5 } = {}) {
  const v = Math.abs(speed), a = (maxG - 1) * g;
  return clamp(v * open * 0.7 + (v * v) / (2 * a) + 60, SPACE.chuteMin, SPACE.chuteMax);
}

// ---------------------------------------------------------------------------------------------------- zero-g
export const FLOAT = Object.freeze({
  push: 0.9,      // m/s² from the move keys (a gentle puff)
  max: 2.6,       // m/s: the keys alone never push you faster than this
  kick: 3.4,      // m/s: pushing off a wall or a rail
  reach: 1.4,     // metres to a wall or rail that you can push off
  grab: 1.3,      // metres to a rail that you can grab
  damp: 0.05,     // of your speed lost a second (air in the station: a slow drift, never a stop)
  r: 0.42,        // your body, as a ball
  bounce: 0.3,    // of the speed kept bouncing off the hull
});

/** Closest point of an axis-aligned box { c, h } to p, and the distance. */
function boxClosest(p, b) {
  const q = [0, 1, 2].map(i => clamp(p[i], b.c[i] - b.h[i], b.c[i] + b.h[i]));
  return { q, d: Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) };
}
/** World objects (hull panels: base at o.y) -> boxes { c, h }. */
export function hullBoxes(objects) {
  return (objects || []).filter(o => o.kind === 'hull' && o.shape?.t === 'box').map(o => ({ c: [o.x, o.y + o.shape.hy, o.z], h: [o.shape.hx, o.shape.hy, o.shape.hz] }));
}
export function wallDistance(p, boxes) {
  let best = Infinity;
  for (const b of boxes) { const d = boxClosest(p, b).d; if (d < best) best = d; }
  return best;
}
/** The nearest point on any rail (handhold) to p: { i, q, d } | null. */
export function nearestRail(p, rails) {
  let best = null;
  (rails || []).forEach((r, i) => {
    const ax = 'xyz'.indexOf(r.axis), c = [r.x, r.y, r.z], q = c.slice();
    q[ax] = clamp(p[ax], c[ax] - r.len / 2, c[ax] + r.len / 2);
    const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    if (!best || d < best.d) best = { i, q, d };
  });
  return best;
}
const overlaps = (p, boxes, r) => boxes.some(b => boxClosest(p, b).d < r);

/**
 * One zero-g step. st = { p, v, held: { i, q } | null } (changed in place and returned).
 *   inp = { move: [x,y,z] (world, length <= 1), kick: bool (the frame it is pressed), grab: bool (the frame it is
 *   pressed), look: [x,y,z] unit (where the camera looks) };  hull = { boxes, rails }.
 * -> { kicked, grabbed, released, bumped } what happened this step.
 */
export function floatStep(st, inp, dt, hull) {
  const out = { kicked: false, grabbed: false, released: false, bumped: false };
  const boxes = hull?.boxes || [], rails = hull?.rails || [];
  if (inp.grab) {
    if (st.held) { st.held = null; out.released = true; }
    else {
      const n = nearestRail(st.p, rails);
      if (n && n.d <= FLOAT.grab) { st.held = { i: n.i, q: n.q, off: st.p.map((v, k) => v - n.q[k]) }; st.v = [0, 0, 0]; out.grabbed = true; }
    }
  }
  if (inp.kick) {
    const n = nearestRail(st.p, rails);
    const near = st.held || (n && n.d <= FLOAT.reach) || wallDistance(st.p, boxes) <= FLOAT.reach;
    if (near) {
      const L = inp.look || [0, 0, 1];
      st.v = L.map(c => c * FLOAT.kick); st.held = null; out.kicked = true;
    }
  }
  if (st.held) {
    // hanging on: you stay where you took hold (your hand on the rail), still
    st.v = [0, 0, 0];
    return out;
  }
  const m = inp.move || [0, 0, 0], ml = Math.hypot(m[0], m[1], m[2]);
  if (ml > 0.02) {
    const dir = m.map(c => c / Math.max(1, ml)), sp = Math.hypot(...st.v);
    const along = st.v[0] * dir[0] + st.v[1] * dir[1] + st.v[2] * dir[2];
    // thrust only adds speed while that way is still under the cap (it can always slow you or turn you)
    if (along < FLOAT.max || sp < FLOAT.max) for (let k = 0; k < 3; k++) st.v[k] += dir[k] * FLOAT.push * dt * Math.min(1, ml);
  }
  const keep = Math.max(0, 1 - FLOAT.damp * dt);
  for (let k = 0; k < 3; k++) st.v[k] *= keep;
  // move one axis at a time in small steps; a step into the hull is undone and that axis bounces back
  const n = Math.max(1, Math.ceil(Math.hypot(...st.v) * dt / (FLOAT.r * 0.5)));
  for (let s = 0; s < n; s++) {
    for (let k = 0; k < 3; k++) {
      const was = st.p[k];
      st.p[k] += st.v[k] * dt / n;
      if (overlaps(st.p, boxes, FLOAT.r)) { st.p[k] = was; st.v[k] = -st.v[k] * FLOAT.bounce; out.bumped = true; }
    }
  }
  return out;
}

/** Every room floated through? (visited = room / tunnel ids; rooms = world.station.rooms) */
export function lapDone(visited, rooms) {
  const seen = visited instanceof Set ? visited : new Set(visited || []);
  return (rooms || []).length > 0 && rooms.every(r => seen.has(r.id));
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function r2(v) { return Math.round(v * 100) / 100; }
