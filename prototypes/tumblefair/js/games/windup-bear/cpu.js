// Wind-Up Bear CPU (co-op): if the bear has picked it as its favourite (and it has team-mates) it LURES — keeps a few
// steps in front of the bear, walking round it in a slow circle; otherwise it sneaks to the key wedge behind the bear
// and cranks at its own pace. It steps out of a belly-flop ring, out of the swipe wedge (round to the back) and out of
// the spin ring and the sit-down ring once it has noticed them (Tricky sometimes rolls through the spin instead), and whacks a floppy bear.
// Family notices late, cranks slowly and sometimes wanders into the wedge; it never sees anything a phone does not.
import { thinker, stickTo, stickFrom, by, slip, noticed, A, B } from '../cpu-kit.js';
import { RULES, stompAt, sitAt, inSwipe, atKey } from './sim.js';

const STUN = 2;
export function createCpu(c) {
  const sk = c.skill, rng = c.rng, think = thinker(c), mem = { hitAt: 0 };
  const gap = by(sk, [0.55, 0.38, 0.31]), side = (c.seat % 2 ? 1 : -1) * (0.25 + 0.2 * Math.floor(c.seat / 2));
  const solo = (c.players?.length ?? 1) === 1;
  return {
    tick(v) {
      const me = v.me, g = v.g;
      if (!me || !g || g.ph === 'end' || g.ph === 'ready' || (me.flags & STUN)) return null;
      const bx = g.bx, bz = g.bz, yaw = g.by, d = Math.hypot(me.x - bx, me.z - bz);
      // cranking: watched every tick, like a thumb on the button
      const canHit = g.ph === 'floppy' ? d <= RULES.floppyReach - 0.3 : (g.ph !== 'getup' && atKey(me.x, me.z, bx, bz, yaw) && d < RULES.keyReach - 0.25);
      const danger = threat(g, me);
      if (canHit && !danger && v.t >= mem.hitAt) {
        mem.hitAt = v.t + gap * (0.85 + rng() * 0.3);
        if (!slip(sk, rng, 0.15)) return { mx: 0, mz: 0, b: A };
      }
      return think(v, () => {
        // a telegraphed move I have noticed: get out (round to the back for a flop or a swipe)
        if (g.mv && danger && noticed(mem, 'mv' + g.mv[0], v.t, sk, rng)) {
          if (!slip(sk, rng, 0.3)) {
            if (g.mv[1] === 'spin') {
              if (g.mv[2] < 0.35 && rng() < by(sk, [0.1, 0.35, 0.6])) return { ...stickFrom(me, bx, bz, sk), b: B };
              return stickFrom(me, bx, bz, sk);
            }
            if (g.mv[1] === 'sit') { const p = sitAt(bx, bz, yaw); return stickFrom(me, p.x, p.z, sk); }
            if (g.mv[1] === 'stomp') { const p = stompAt(bx, bz, yaw); const back = keySpot(bx, bz, yaw, side); return Math.hypot(back.x - me.x, back.z - me.z) < 3 ? stickTo(me, back.x, back.z, sk) : stickFrom(me, p.x, p.z, sk); }
            const back = keySpot(bx, bz, yaw, side * 2); return stickTo(me, ...roundTo(me, back, bx, bz), sk);
          }
        }
        if (g.ph === 'floppy') return stickTo(me, bx, bz, sk, { arrive: 0.6 });
        // lure: the favourite keeps a few steps in front of the bear, circling slowly so the bear turns its back
        if (g.fv === c.pid && !solo && (g.ph === 'chase' || g.ph === 'wind')) {
          const a = Math.atan2(me.x - bx, me.z - bz) + 0.5 * (c.seat % 2 ? 1 : -1), r = 4.4;
          const x = Math.max(-7.6, Math.min(7.6, bx + Math.sin(a) * r)), z = Math.max(-5.2, Math.min(5.2, bz + Math.cos(a) * r));
          return stickTo(me, x, z, sk, { arrive: 0.6 });
        }
        // crank: to the key wedge behind the bear, round its body
        const k = keySpot(bx, bz, yaw, side);
        return stickTo(me, ...roundTo(me, k, bx, bz), sk, { arrive: 0.25 });
      });
    },
  };
}
/** The spot behind the bear (a little to one side so two crankers do not stand on each other). */
function keySpot(bx, bz, yaw, side) {
  const a = yaw + Math.PI + side, r = 2.05;
  return { x: Math.max(-8, Math.min(8, bx + Math.sin(a) * r)), z: Math.max(-5.5, Math.min(5.5, bz + Math.cos(a) * r)) };
}
/** Am I in a telegraphed move's reach right now (with a little margin)? */
function threat(g, me) {
  if (!g.mv) return false;
  const [, kind] = g.mv;
  if (kind === 'stomp') { const p = stompAt(g.bx, g.bz, g.by); return Math.hypot(me.x - p.x, me.z - p.z) < RULES.stompR + 0.8; }
  if (kind === 'sit') { const p = sitAt(g.bx, g.bz, g.by); return Math.hypot(me.x - p.x, me.z - p.z) < RULES.sitR + 0.8; }
  if (kind === 'swipe') return inSwipe(me.x, me.z, g.bx, g.bz, g.by) || Math.hypot(me.x - g.bx, me.z - g.bz) < RULES.bearR + 1.0 && !atKey(me.x, me.z, g.bx, g.bz, g.by);
  return Math.hypot(me.x - g.bx, me.z - g.bz) < RULES.spinR + 0.8;
}
/** The way to p round the bear's body: p itself when the straight line is clear, else a step round its side. */
function roundTo(me, p, bx, bz, R = 2.2) {
  const ex = p.x - me.x, ez = p.z - me.z, L = ex * ex + ez * ez || 1e-9, t = Math.max(0, Math.min(1, ((bx - me.x) * ex + (bz - me.z) * ez) / L));
  if (Math.hypot(me.x + ex * t - bx, me.z + ez * t - bz) > R - 0.4) return [p.x, p.z];
  const am = Math.atan2(me.x - bx, me.z - bz), ap = Math.atan2(p.x - bx, p.z - bz), d = Math.atan2(Math.sin(ap - am), Math.cos(ap - am));
  const a = am + Math.sign(d || 1) * Math.min(Math.abs(d), 0.9);
  return [bx + Math.sin(a) * R, bz + Math.cos(a) * R];
}
