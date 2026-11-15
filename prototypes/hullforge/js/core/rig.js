// The flight camera's frame: where you look (`aim`) and which way is up on screen (`up`). The two are kept at right
// angles at all times, and the CAMERA leads — the mouse turns it, Q/E roll it, and the ship turns its nose to `aim`
// and rolls its top to `up` (sim/world.js moveBody, `input.upDir`).
//
// Why (owner report 2026-11-14, "the view flips around when aiming at enemies"): the old camera copied the ship's up
// while the mouse moved the aim on its own. Aiming at an enemy above or below the ship put the aim almost along that
// up, the two stopped being at right angles, and three.js's lookAt then spun the horizon wildly on every tiny mouse
// move. Hits that spun the ship also swung the view. Now nothing feeds back from the ship into the camera, the mouse
// can carry you over the top in a loop, and the horizon only turns when you roll.
//
// Second report (2026-11-15, "I randomly get turned around like 180 degrees", "an enemy passes me and the ship flips
// over"): the view could lead the nose by ANY angle. One bad mouse reading (Chrome sends a huge jump right after the
// mouse is captured) or a fast swing after a passing enemy put the view far behind the ship; the ship then turned
// the short way — often over the top — and W pushed along the old nose. Now the view may lead the nose by at most
// LEAD_MAX (`limitLead`); swinging further turns the ship at its own rate with the view held at the edge.
import { vnorm, vcross, vdot, vsub, vscale, vlen, qaxis, qrot } from './math.js';

export function createRig(aim = { x: 0, y: 0, z: 1 }, up = { x: 0, y: 1, z: 0 }) {
  const r = { aim: vnorm(aim), up: { ...up }, dist: 1, pos: null, look: null };
  squareUp(r); return r;
}
/** Screen-right (aim × up). */
export const rightOf = r => vnorm(vcross(r.aim, r.up));
function rotate(v, axis, ang) { return qrot(qaxis(vnorm(axis), ang), v); }

/** Make `up` exactly perpendicular to `aim` (keeps it as close to what it was as it can). */
export function squareUp(r) {
  let u = vsub(r.up, vscale(r.aim, vdot(r.up, r.aim)));
  if (vlen(u) < 1e-4) {   // up was along the aim: pick any perpendicular, preferring world up
    const ref = Math.abs(r.aim.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    u = vsub(ref, vscale(r.aim, vdot(ref, r.aim)));
  }
  r.up = vnorm(u);
  return r;
}

/** Mouse / stick turn: yaw `yaw` radians about the screen's up, pitch `pitch` about screen-right (+ = up). */
export function turnRig(r, yaw, pitch) {
  if (yaw) r.aim = rotate(r.aim, r.up, yaw);
  if (pitch) { const right = rightOf(r); r.aim = rotate(r.aim, right, pitch); r.up = rotate(r.up, right, pitch); }
  r.aim = vnorm(r.aim); squareUp(r);
  return r;
}
/** Roll the view about the aim (+ = roll right, the same sense as the ship's +z spin). */
export function rollRig(r, ang) { if (ang) { r.up = rotate(r.up, r.aim, ang); squareUp(r); } return r; }

/** Most the view may lead the ship's nose (radians). */
export const LEAD_MAX = 30 * Math.PI / 180;

/**
 * Keep the view within `max` of the ship's nose. `was` = the lead before this frame's mouse move: a move may never
 * make the lead larger than max(was, max), so the ship's own turning or a hit never drags the view (rule 55) — only
 * the mouse is held back. The whole frame (aim AND up) turns back together, so the horizon doesn't twist.
 */
export function limitLead(r, nose, was = 0, max = LEAD_MAX) {
  const n = vnorm(nose); const lead = Math.acos(Math.max(-1, Math.min(1, vdot(r.aim, n))));
  const cap = Math.max(max, was);
  if (lead <= cap + 1e-6) return lead;
  let axis = vcross(r.aim, n);
  if (vlen(axis) < 1e-6) axis = r.up;          // straight behind: swing back over the screen's up (any axis works)
  const back = lead - cap;
  r.aim = vnorm(rotate(r.aim, axis, back)); r.up = rotate(r.up, axis, back); squareUp(r);
  return cap;
}
/** How far the view leads the nose now (radians). */
export const leadOf = (r, nose) => Math.acos(Math.max(-1, Math.min(1, vdot(r.aim, vnorm(nose)))));

/** Point the aim at a direction (tests, game-eye), keeping the horizon. */
export function aimRigAt(r, dir) { r.aim = vnorm(dir); return squareUp(r); }
