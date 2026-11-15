// Enemy pilots. Each hostile ship patrols near its post until the player comes within its sight range, then keeps
// to the range its guns like, circling and strafing so its turrets get a view. They never chase into the
// station's safe zone, and they give up after a long chase.

import { vsub, vadd, vscale, vnorm, vdist, vlen, vcross, qinv, qrot, clamp, hash } from '../core/math.js';
import { SAFE_RADIUS } from './world.js';

export function think(w, b) {
  const P = w.player; const inp = b.input;
  b.thinkT = (b.thinkT || 0) - 1 / 60; if (b.thinkT > 0) return;
  b.thinkT = 0.15 + (b.id % 7) * 0.01;
  const sight = (1000 + b.danger * 80 + (b.boss ? 400 : 0)) * (w.sightMul ? w.sightMul(b) : 1);   // world: pirates who like you look away
  const home = b.post || b.pos;
  const st = w.station;
  const playerSafe = !P || P.dead || (st && vdist(P.pos, st.pos) < SAFE_RADIUS + 150);
  const d = P && !P.dead ? vdist(P.pos, b.pos) : Infinity;
  if (!playerSafe && (d < sight || (b.target === P && d < sight * 1.8))) b.mode = 'attack';
  else if (b.mode === 'attack') b.mode = 'return';
  if (vdist(b.pos, home) > 3500) b.mode = 'return';
  // never into the safe zone
  if (st && vdist(b.pos, st.pos) < SAFE_RADIUS + 100) { b.mode = 'return'; }

  const range = b.prefRange || (b.prefRange = clamp(Math.min(...b.turrets.map(t => t.s.range).concat([700])) * 0.6, 120, 480));
  const ph = (hash(b.id) % 1000) / 1000 * 6.28;
  if (b.mode === 'attack') {
    b.target = P;
    const to = vnorm(vsub(P.pos, b.pos));
    // turn so the turrets bear: big ships turn their side (broadside), small ones face in
    let aim = to;
    if (b.radius > 9) { const side = vnorm(vcross(to, { x: 0, y: 1, z: 0 })); aim = vnorm(vadd(vscale(to, 0.45), vscale(side, Math.sin(w.t * 0.1 + ph) > 0 ? 0.9 : -0.9))); }
    inp.aimDir = aim;
    const loc = qinv(b.quat, to);
    const close = d < range * 0.7, far = d > range * 1.15;
    const want = vscale(loc, far ? 1 : close ? -0.7 : 0);
    // circle: strafe sideways and a little up/down, switching every few seconds
    const sw = Math.sin(w.t * 0.35 + ph) > 0 ? 1 : -1;
    inp.thrust = { x: clamp(want.x + sw * 0.7, -1, 1), y: clamp(want.y + Math.sin(w.t * 0.5 + ph) * 0.4, -1, 1), z: clamp(want.z + (far ? 0.6 : 0.15), -1, 1) };
    inp.boost = d > sight * 0.9;
    inp.roll = 0;
  } else {
    // patrol: drift around the post on a slow loop
    const a = w.t * 0.05 + ph; const R = 120 + (b.id % 5) * 40;
    const goal = b.mode === 'return' ? home : vadd(home, { x: Math.cos(a) * R, y: Math.sin(a * 0.7) * 40, z: Math.sin(a) * R });
    const to = vsub(goal, b.pos); const dd = vlen(to);
    inp.aimDir = dd > 1 ? vscale(to, 1 / dd) : null;
    inp.thrust = { x: 0, y: 0, z: dd > 40 ? (b.mode === 'return' ? 1 : 0.4) : 0 };
    inp.boost = b.mode === 'return' && dd > 600;
    if (b.mode === 'return' && dd < 200) { b.mode = 'patrol'; b.target = null; }
  }
}
