// Camera (docs/06 §19): dead zone, look-ahead, critically damped follow, room clamp, trauma shake.
import { smoothDamp, clamp } from '../core/math.js';
export function createCamera() {
  const c = { x: 0, y: 0, vw: 480, vh: 270, scale: 3, trauma: 0, lookX: 0, vx: { v: 0 }, vy: { v: 0 }, sameDirT: 0, lastFacing: 1, shakeX: 0, shakeY: 0, t: 0, lock: null };
  c.fit = function (canvasW, canvasH, wide) {
    let s = Math.max(1, Math.round(canvasH / 270)); if (wide) s = Math.max(1, s - 1);
    c.scale = s; c.vw = clamp(Math.ceil(canvasW / s), 320, 720); c.vh = clamp(Math.ceil(canvasH / s), 200, 400);
  };
  c.snap = function (tx, ty, room) { c.x = tx - c.vw / 2; c.y = ty - c.vh / 2; clampRoom(room); };
  function clampRoom(room) {
    if (!room) return;
    c.x = room.W <= c.vw ? (room.W - c.vw) / 2 : clamp(c.x, 0, room.W - c.vw);
    c.y = room.H <= c.vh ? (room.H - c.vh) / 2 : clamp(c.y, 0, room.H - c.vh);
  }
  c.update = function (target, room, dt) {
    c.t += dt;
    if (target.facing === c.lastFacing && Math.abs(target.vx) > 20) c.sameDirT += dt; else { c.sameDirT = 0; c.lastFacing = target.facing; }
    const want = c.sameDirT > 0.25 ? target.facing * 40 : c.lookX * 0.98;
    c.lookX += (want - c.lookX) * Math.min(1, dt / 0.4);
    let lookY = target.vy > 250 ? 30 : target.state === 'climb' && target.vy < 0 ? -20 : 0;
    let tx = target.x + c.lookX - c.vw / 2, ty = target.y - 6 + lookY - c.vh / 2;
    if (c.lock) { if (c.lock.x != null) tx = c.lock.x - c.vw / 2; if (c.lock.y != null) ty = c.lock.y - c.vh / 2; }
    // dead zone
    const cx = c.x + c.vw / 2, cy = c.y + c.vh / 2, px = tx + c.vw / 2, py = ty + c.vh / 2;
    if (Math.abs(px - cx) < 12) tx = c.x; if (Math.abs(py - cy) < 8) ty = c.y;
    c.x = smoothDamp(c.x, tx, c.vx, 0.18, dt); c.y = smoothDamp(c.y, ty, c.vy, 0.2, dt);
    clampRoom(room);
    c.trauma = Math.max(0, c.trauma - 1.6 * dt);
    const amt = 6 * c.trauma * c.trauma * (c.shakeScale ?? 1);
    c.shakeX = amt * (Math.sin(c.t * 113) * 0.6 + Math.sin(c.t * 71) * 0.4); c.shakeY = amt * (Math.sin(c.t * 97 + 1) * 0.6 + Math.sin(c.t * 59) * 0.4);
  };
  c.shake = t => { c.trauma = Math.min(1, c.trauma + t); };
  c.view = () => ({ x0: c.x, y0: c.y, x1: c.x + c.vw, y1: c.y + c.vh });
  return c;
}
