// Flood Rush CPU: picks a perch (a hilltop, a crate, or a stall roof by way of the crate beside it) that will stay dry
// for the next rise, walks there, jumps up, and moves higher whenever the coming stage would reach it. It shoves anyone
// crowding its perch. Family goes for the nearest hill and only climbs when the water is nearly at its feet; Tricky makes
// for a high roof early and keeps it clear.
import { thinker, stickTo, by, gauss, A, B } from '../cpu-kit.js';
import { RULES, groundAt } from './sim.js';

const STUN = 2, FROZEN = 8, OUT = 1, AIR = 16;
const inBox = (o, x, z, m = 0) => Math.abs(x - o.x) <= o.hw + m && Math.abs(z - o.z) <= o.hd + m;
/** Too-tall boxes between me and (x, z)? Walk to the best corner round the first one first. */
function detour(me, to, boxes) {
  for (const o of boxes) {
    if (o === to.box || o.top <= me.y + RULES.step) continue;
    const m = 0.75; if (inBox(o, to.x, to.z, 0.3) || !crosses(me, to, o, 0.3)) continue;
    let best = null, bd = 1e9;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const cx = o.x + sx * (o.hw + m), cz = o.z + sz * (o.hd + m), here = Math.hypot(cx - me.x, cz - me.z);
      if (here < 0.4 || crosses(me, { x: cx, z: cz }, o, 0.2)) continue;
      const d = here + Math.hypot(to.x - cx, to.z - cz) + (crosses({ x: cx, z: cz }, to, o, 0.2) ? 6 : 0);
      if (d < bd) { bd = d; best = { x: cx, z: cz }; }
    }
    if (best) return best;
  }
  return to;
}
function crosses(a, b, o, m) {
  for (let k = 1; k <= 12; k++) { const t = k / 12, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t; if (inBox(o, x, z, m)) return true; }
  return false;
}
export function createCpu(c) {
  const sk = c.skill, think = thinker(c), I = c.init || {}, sched = I.sched || [], mem = {};
  const perches = [
    ...(I.hills || []).map(H => ({ x: H.x, z: H.z, top: H.h, r: 0.9 })),
    ...(I.boxes || []).map(o => ({ x: o.x, z: o.z, top: o.top, box: o, via: o.k === 'stall' ? (I.boxes || []).find(k => k.k === 'crate' && inBox(o, k.x, k.z, k.hw + 0.25)) : null })),
  ].filter(p => !p.box || p.box.k === 'crate' || p.via);
  // a crate is climbed from its highest side (a jump lifts you about a metre); one with no side high enough is no perch
  for (const p of perches) if (p.box?.k === 'crate') {
    const o = p.box, sides = [[o.hw + 0.55, 0], [-o.hw - 0.55, 0], [0, o.hd + 0.55], [0, -o.hd - 0.55]].map(([dx, dz]) => ({ x: o.x + dx, z: o.z + dz, y: groundAt(I.hills || [], o.x + dx, o.z + dz) }));
    p.from = sides.sort((a, b) => b.y - a.y)[0]; if (o.top - p.from.y > 0.95) p.bad = true;
  }
  for (const p of perches) if (p.via) p.viaP = perches.find(q => q.box === p.via);
  for (let i = perches.length - 1; i >= 0; i--) if (perches[i].bad || perches[i].viaP?.bad) perches.splice(i, 1);
  const ahead = by(sk, [0, 1, 2]);                 // how many rises ahead it plans for
  function pick(v, me, need) {
    let best = null, bs = -1e9;
    for (const p of perches) {
      if (p.top < need) continue;
      const crowd = [...v.bodies].filter(([q, b]) => q !== c.pid && !(b.flags & OUT) && Math.hypot(b.x - p.x, b.z - p.z) < 1.4 && Math.abs(b.y - p.top) < 0.3).length;
      const s = p.top * by(sk, [0.3, 1, 1.6]) - Math.hypot(p.x - me.x, p.z - me.z) * by(sk, [0.6, 0.35, 0.25]) - crowd * 1.5 + gauss(c.rng) * (1 - sk.q);
      if (s > bs) { bs = s; best = p; }
    }
    return best;
  }
  return {
    tick(v) {
      const me = v.me, g = v.g; if (!me || !g || (me.flags & (OUT | FROZEN | STUN))) return null;
      return think(v, () => {
        // the water I must stay above: the level `ahead` stages on (Family: the one rising now)
        const st = Math.max(0, g.st < 0 ? sched.length - 1 : g.st), S = sched[Math.min(sched.length - 1, st + ahead)];
        const wet = g.wl + by(sk, [0.2, 0.35, 0.35]) > me.y;
        const need = (S?.to ?? g.wl) - RULES.sweep + 0.15;
        if (!mem.goal || mem.goal.top < need || (ahead === 0 && wet && mem.goal.top < g.wl + 0.5)) mem.goal = pick(v, me, ahead === 0 && !wet ? -1 : need) || mem.goal || pick(v, me, -1);
        const p = mem.goal; if (!p) return null;
        const on = Math.abs(me.y - p.top) < 0.2 && (p.box ? inBox(p.box, me.x, me.z) : Math.hypot(me.x - p.x, me.z - p.z) < p.r + 0.6);
        // someone crowding me up here? shove them off
        const rival = [...v.bodies].find(([q, b]) => q !== c.pid && !(b.flags & OUT) && Math.hypot(b.x - me.x, b.z - me.z) < RULES.shoveR && Math.abs(b.y - me.y) < 0.6);
        if (on && rival && c.rng() < by(sk, [0.15, 0.4, 0.65])) return { ...stickTo(me, rival[1].x, rival[1].z, sk, { mag: 0.2 }), b: B };
        if (on) return stickTo(me, p.x, p.z, sk, { arrive: 0.6, mag: 0.3 });
        // a roof: first its crate
        const step = p.via && me.y < p.via.top - 0.2 ? p.viaP : p;
        const low = step.box && step.top > me.y + RULES.step;
        if (low && step.from && me.y < step.from.y - 0.25) return stickTo(me, step.from.x, step.from.z, sk, { arrive: 0.2 });   // round to the high side first
        const jump = low && !(me.flags & AIR) && inBox(step.box, me.x, me.z, 0.7);
        const way = detour(me, step, I.boxes || []);
        return { ...stickTo(me, way.x, way.z, sk, { arrive: 0.2 }), b: jump ? A : 0 };
      });
    },
  };
}
