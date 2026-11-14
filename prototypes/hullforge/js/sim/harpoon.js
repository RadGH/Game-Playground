// The harpoon (G): a tether every ship carries. It flies from your nose toward the crosshair and latches onto the
// first rock, wreck or ship it meets. The cable is a spring between the two bodies: when it is stretched past its
// length it pulls both, each by the other's share of the mass — tow a pebble and it follows you; snag a big rock and
// it drags you. G again lets go; hold T to reel in. Stretched far past its length it snaps.
//
// Towing something into a station's safe zone sells it for salvage (or finishes a recovery job): the station's
// tractor beam pulls it in (`b.tractor`, stepped by `tractorStep`).
//
// State lives on the world: w.harpoon = { head, tether }. Pure: no DOM.

import { vadd, vsub, vscale, vnorm, vlen, vdist, vdot } from '../core/math.js';
import { toWorld, toLocal, forward } from './body.js';
import { rayWorld } from './hit.js';
import { DT, SAFE_RADIUS } from './world.js';
import { ORES, BLOCKS } from '../data/blocks.js';

export const HARPOON = {
  range: 450,      // m the head flies
  speed: 340,      // m/s
  cooldown: 0.8,   // s between shots
  spring: 12,      // pull per metre stretched
  damp: 4,         // extra pull per m/s the two drift apart
  reel: 22,        // m/s the cable shortens while T is held
  snap: 2.6,       // snaps when stretched past this × its length (+ 60 m)
  minSlack: 6,     // m kept between the two hulls when fully reeled in
  assist: 0.07,    // rad (4°): a thing this close to the crosshair (past its own size) is aimed for you
};
export const TRACTOR_TIME = 3.2;   // s the station's beam takes to pull a tow in

export const harpoonState = w => (w.harpoon ||= { head: null, tether: null, cd: 0 });
const canHook = (P, o) => !o.dead && o !== P && o.kind !== 'station' && !o.tractor && !o.drone && !(o.kind === 'ship' && o.team === 'player');

/** Where the cable leaves your ship: the front-most block on the centre line (local coords). */
export function noseAnchor(P) {
  let best = null;
  for (const b of P.grid.cells.values()) { const s = b.z * 4 - Math.abs(b.x) - Math.abs(b.y - 0.5) * 0.5; if (!best || s > best.s) best = { s, b }; }
  const b = best?.b || { x: 0, y: 0, z: 0 };
  return { x: b.x + 0.5, y: b.y + 0.5, z: b.z + 1 };
}

/** G: fire (or let go if something is already on the line). Returns 'fired' | 'released' | 'flying' | 'cooldown'. */
export function fireHarpoon(w, P, aimPoint) {
  const H = harpoonState(w);
  if (H.tether) { release(w, 'released'); return 'released'; }
  if (H.head) { H.head = null; return 'released'; }
  if (H.cd > w.t) return 'cooldown';
  H.cd = w.t + HARPOON.cooldown;
  const from = toWorld(P, noseAnchor(P));
  let dir = aimPoint ? vnorm(vsub(aimPoint, from)) : forward(P);
  // a little help aiming: the nearest thing you could hook within ASSIST of the crosshair gets the shot
  let best = null, bc = Math.cos(HARPOON.assist);
  for (const o of w.bodies) {
    if (!canHook(P, o)) continue; const to = vsub(o.pos, from); const d = vlen(to); if (d > HARPOON.range + o.radius || d < 1) continue;
    const c = vdot(to, dir) / d; const widen = Math.cos(Math.max(0, Math.acos(Math.min(1, c)) - Math.atan(o.radius * 0.6 / d)));
    if (widen > bc) { bc = widen; best = o; }
  }
  if (best) dir = vnorm(vsub(best.pos, from));
  H.head = { pos: from, vel: vadd(P.vel, vscale(dir, HARPOON.speed)), left: HARPOON.range, owner: P };
  w.events.push({ type: 'harpoonFire', pos: from });
  return 'fired';
}
export function release(w, why = 'released') {
  const H = harpoonState(w); const T = H.tether; if (!T) return;
  if (T.b) T.b.harpooned = false;
  H.tether = null;
  w.events.push({ type: why === 'snap' ? 'harpoonSnap' : 'harpoonRelease', pos: T.bp || T.b?.pos });
}

/** One sim step of the harpoon: the head in flight, then the spring. `reel` = T held. */
export function harpoonStep(w, reel = false) {
  const H = harpoonState(w); const P = w.player;
  if (!P || P.dead) { if (H.tether) release(w); H.head = null; return; }
  if (H.head) {
    const h = H.head; const step = vscale(h.vel, DT); const len = vlen(step); const dir = vscale(step, 1 / (len || 1));
    const hit = rayWorld(w.bodies, h.pos, dir, len, o => canHook(P, o));
    if (hit) {
      const p = vadd(h.pos, vscale(dir, hit.t)); const o = hit.body;
      const a = toWorld(P, noseAnchor(P));
      H.tether = { a: P, b: o, la: noseAnchor(P), lb: toLocal(o, p), len: Math.max(12, vdist(a, p)), bp: p, ap: a };
      o.harpooned = true; H.head = null;
      w.events.push({ type: 'harpoonHook', pos: p, body: o });
    } else {
      h.pos = vadd(h.pos, step); h.left -= len;
      if (h.left <= 0) { H.head = null; w.events.push({ type: 'harpoonMiss', pos: h.pos }); }
    }
  }
  const T = H.tether; if (!T) return;
  if (T.b.dead || T.b.tractor) { release(w); return; }
  const a = toWorld(P, T.la), b = toWorld(T.b, T.lb);
  T.ap = a; T.bp = b;
  const d = vdist(a, b);
  if (reel) T.len = Math.max(HARPOON.minSlack + 2, T.len - HARPOON.reel * DT);
  T.d = d;
  if (d > T.len * HARPOON.snap + 60) { release(w, 'snap'); return; }
  if (d > T.len) {
    const n = vscale(vsub(b, a), 1 / d); const stretch = d - T.len;
    const ma = Math.max(1, P.stats.mass), mb = Math.max(1, T.b.stats.mass);
    const rv = vdot(vsub(T.b.vel, P.vel), n);
    const k = stretch * HARPOON.spring + Math.max(0, rv) * HARPOON.damp;
    const J = k * DT * ma * mb / (ma + mb);                // impulse along the cable
    P.vel = vadd(P.vel, vscale(n, J / ma));
    T.b.vel = vsub(T.b.vel, vscale(n, J / mb));
  }
  // a little cable drag so a tow does not coast into you when the line goes slack
  const ma = Math.max(1, P.stats.mass), mb = Math.max(1, T.b.stats.mass);
  T.b.vel = vadd(T.b.vel, vscale(vsub(P.vel, T.b.vel), 0.012 * ma / (ma + mb)));
}

/** Credits a station pays for a towed body: ore blocks at half their price, wreck blocks for scrap, parts more. */
export function salvageValue(b) {
  let v = 0;
  for (const bl of b.grid.cells.values()) {
    const def = BLOCKS[bl.t]; if (!def) continue;
    if (def.ore) v += ORES[def.ore].price * 0.5;
    else if (def.cat === 'rock') v += 0.2;
    else if (def.cat === 'station') v += 0;
    else v += bl.item ? 30 : 3;
  }
  return Math.round(v);
}

/** Start the station's tractor beam on a body (it glides in and is gone). */
export function tractorIn(w, b, to) {
  if (harpoonState(w).tether?.b === b) release(w);
  b.tractor = { t: 0, from: { ...b.pos }, to: { ...to } };
  b.vel = { x: 0, y: 0, z: 0 }; b.angVel = { x: b.angVel.x * 0.3, y: 0.25, z: 0 };
}
export function tractorStep(w) {
  for (const b of w.bodies) {
    const T = b.tractor; if (!T || b.dead) continue;
    T.t += DT; const k = Math.min(1, T.t / TRACTOR_TIME); const e = k * k * (3 - 2 * k);
    b.pos = { x: T.from.x + (T.to.x - T.from.x) * e, y: T.from.y + (T.to.y - T.from.y) * e, z: T.from.z + (T.to.z - T.from.z) * e };
    b.vel = { x: 0, y: 0, z: 0 };
    if (k >= 1) b.dead = true;
  }
}
/** Is a towed body inside a station's safe zone (ready to sell)? */
export const inDock = (w, b, st = w.station) => st && vdist(b.pos, st.pos) < SAFE_RADIUS;
