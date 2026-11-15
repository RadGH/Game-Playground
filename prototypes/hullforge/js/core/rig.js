// The flight camera's frame: where you look (`aim`) and which way is up on screen (`up`). The two are kept at right
// angles at all times, and the CAMERA leads — the mouse turns it, Q/E roll it, and the ship turns its nose to `aim`
// and rolls its top to `up` (sim/world.js moveBody, `input.upDir`).
//
// Why (owner report 2026-11-14, "the view flips around when aiming at enemies"): the old camera copied the ship's up
// while the mouse moved the aim on its own. Aiming at an enemy above or below the ship put the aim almost along that
// up, the two stopped being at right angles, and three.js's lookAt then spun the horizon wildly on every tiny mouse
// move. Hits that spun the ship also swung the view. Now nothing feeds back from the ship into the camera, the mouse
// can carry you over the top in a loop, and the horizon only turns when you roll.
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

/** Point the aim at a direction (tests, game-eye), keeping the horizon. */
export function aimRigAt(r, dir) { r.aim = vnorm(dir); return squareUp(r); }
