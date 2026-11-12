// Draw moving things between two simulation steps (lessons rule 28; live report #35, "my ship flicks back and forth").
//
// The sim runs a fixed 1/60 s step. A 144 Hz screen draws two or three frames per step, and an uneven frame draws
// zero or two steps, so drawing the last step's position makes things jump. Instead:
//   snapPrev(w)            before each sim step: remember where everything was
//   blendIn(w, alpha)      just before drawing: move everything to prev + (now - prev) * alpha, alpha = acc / step
//   blendOut(w)            right after drawing: put the real sim positions back (the sim never sees drawn values)
// The camera follows the BLENDED player (rule 51), so main.js calls blendIn before updateCamera.

const KEYS = ['bodies', 'shots', 'drones', 'pickups'];
const JUMP = 600;   // a move bigger than this in one step is a teleport (dock, jump, respawn): don't slide across it

export function snapPrev(w) {
  for (const k of KEYS) for (const o of w[k] || []) { o._px = o.x; o._py = o.y; if (o.a != null) o._pa = o.a; }
}

function angLerp(a, b, t) { let d = b - a; d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; }

export function blendIn(w, alpha) {
  if (w._blended) return;
  w._blended = true;
  // tools/smooth-check.mjs sets this to measure the old, unblended drawing for comparison
  const t = globalThis.voidwrightNoBlend ? 1 : Math.max(0, Math.min(1, alpha));
  const moved = new Map();
  for (const k of KEYS) for (const o of w[k] || []) {
    if (o._px == null || o.dead) { o._sx = null; continue; }
    const dx = o.x - o._px, dy = o.y - o._py;
    if (dx * dx + dy * dy > JUMP * JUMP) { o._sx = null; continue; }
    o._sx = o.x; o._sy = o.y; o._sa = o.a;
    o.x = o._px + dx * t; o.y = o._py + dy * t;
    if (o._pa != null && o.a != null) o.a = angLerp(o._pa, o.a, t);
    if (k === 'bodies' && o.id != null) moved.set(o.id, [o.x - o._sx, o.y - o._sy]);
  }
  // beams are rebuilt every step from the shooter's position: carry them along with the shooter's drawn offset
  w._beamShift = [];
  for (const bm of w.beams || []) {
    const d = moved.get(bm.owner); if (!d) continue;
    bm.x += d[0]; bm.y += d[1]; bm.x2 += d[0]; bm.y2 += d[1]; w._beamShift.push([bm, d]);
  }
}

export function blendOut(w) {
  if (!w._blended) return;
  w._blended = false;
  for (const k of KEYS) for (const o of w[k] || []) {
    if (o._sx == null) continue;
    o.x = o._sx; o.y = o._sy; if (o._sa != null) o.a = o._sa; o._sx = null;
  }
  for (const [bm, d] of w._beamShift || []) { bm.x -= d[0]; bm.y -= d[1]; bm.x2 -= d[0]; bm.y2 -= d[1]; }
  w._beamShift = null;
}
