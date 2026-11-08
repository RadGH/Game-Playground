// Golem Smash CPU (co-op): waits a few steps behind the golem, steps out of any red ring once it has noticed it,
// runs to the glowing crack's gold ring and hits it, and swings at rubblings that get close. It never jumps on a
// team-mate. Family notices rings late, swings slower and wanders off its spot; Tricky reacts and hits near the cooldown.
import { thinker, stickTo, stickFrom, blend, by, noisy, slip, reacted, A } from '../cpu-kit.js';
import { limbSpot } from './sim.js';

const STUN = 2, REACH = 1.25, ADD = 1.3;
export function createCpu(c) {
  const sk = c.skill, rng = c.rng, think = thinker(c), mem = { seen: new Map(), hitAt: 0 };
  const gap = by(sk, [0.5, 0.38, 0.32]), side = (c.seat % 2 ? 1 : -1) * (0.5 + 0.25 * Math.floor(c.seat / 2));
  return {
    tick(v) {
      const me = v.me, g = v.g;
      if (!me || !g || g.ph === 'end' || (me.flags & STUN)) return null;
      // a rubbling closing in: swing once it is in reach, after a moment to see it coming (watched every tick)
      for (const a of g.mn || []) {
        const d = Math.hypot(a[1] - me.x, a[2] - me.z); if (d > 2.2 || a[4]) continue;
        if (!mem.seen.has('a' + a[0])) mem.seen.set('a' + a[0], v.t + sk.react * by(sk, [0.6, 0.45, 0.35]) * (0.7 + rng() * 0.6));
        if (d < ADD && v.t >= mem.seen.get('a' + a[0]) && v.t >= mem.hitAt) { mem.hitAt = v.t + gap * 0.6; return { mx: 0, mz: 0, b: A }; }
      }
      // standing in the open crack's ring: keep hitting at my own pace (watched every tick, like a thumb on the button)
      if (g.ck && mem.onCrack) { const p = limbSpot(g.gx, g.gz, g.gy, g.ck[0]); if (Math.hypot(p.x - me.x, p.z - me.z) < REACH - 0.1 && v.t >= mem.hitAt && !(g.rg || []).some(r => v.t >= (mem.seen.get(r[0]) ?? 1e9) && Math.hypot(me.x - r[1], me.z - r[2]) < r[3] + 0.75)) { mem.hitAt = v.t + gap * (0.85 + rng() * 0.3); return { mx: 0, mz: 0, b: slip(sk, rng, 0.2) ? 0 : A }; } }
      return think(v, () => {
        mem.onCrack = false;
        // red rings: noticed after a reaction time, then get out
        let flee = null;
        for (const r of g.rg || []) {
          if (!mem.seen.has(r[0])) mem.seen.set(r[0], v.t + sk.react * (0.7 + rng() * 0.6));
          if (v.t < mem.seen.get(r[0])) continue;
          if (Math.hypot(me.x - r[1], me.z - r[2]) < r[3] + 0.75) flee = blend(sk, [flee], [stickFrom(me, r[1], r[2], sk)]);
        }
        if (flee && !slip(sk, rng, 0.4)) return flee;
        const swing = () => { if (v.t < mem.hitAt || slip(sk, rng, 0.3)) return 0; mem.hitAt = v.t + gap * (0.85 + rng() * 0.3); return A; };
        // a rubbling right by me: smash it
        const add = (g.mn || []).map(a => ({ x: a[1], z: a[2], d: Math.hypot(a[1] - me.x, a[2] - me.z) })).sort((a, b) => a.d - b.d)[0];
        if (add && add.d < ADD) return { mx: 0, mz: 0, b: swing() };
        // an open crack: to its gold ring and hit it
        if (g.ck && reacted(mem, 'ck' + g.ck[0] + ':' + g.br, v.t, sk, rng, by(sk, [0.8, 0.6, 0.5]))) {
          const p = limbSpot(g.gx, g.gz, g.gy, g.ck[0]), d = Math.hypot(p.x - me.x, p.z - me.z);
          if (d < REACH - 0.2) { mem.onCrack = true; return { mx: 0, mz: 0, b: swing() }; }
          const w = round(me, p, g.gx, g.gz);
          return stickTo(me, w.x, w.z, sk, { arrive: w === p ? 0.3 : 0 });
        }
        // otherwise: wait a few steps behind the golem, a little to one side (Family drifts about)
        const a = g.gy + Math.PI + side, sx = g.gx + Math.sin(a) * 3.4, sz = g.gz + Math.cos(a) * 3.4;
        const x = Math.max(-8.3, Math.min(8.3, noisy(sx, 0.8, sk, rng))), z = Math.max(-5.8, Math.min(5.8, noisy(sz, 0.8, sk, rng)));
        if (add && add.d < 3) return stickTo(me, add.x, add.z, sk);          // meet a rubbling coming at me
        const w = round(me, { x, z }, g.gx, g.gz);
        return stickTo(me, w.x, w.z, sk, { arrive: 0.8 });
      });
    },
  };
}
/** The way to p round the golem's body: p itself when the straight line is clear, else a step round its side. */
function round(me, p, gx, gz, R = 2.3) {
  const ex = p.x - me.x, ez = p.z - me.z, L = ex * ex + ez * ez || 1e-9, t = Math.max(0, Math.min(1, ((gx - me.x) * ex + (gz - me.z) * ez) / L));
  if (Math.hypot(me.x + ex * t - gx, me.z + ez * t - gz) > R - 0.4) return p;
  const am = Math.atan2(me.x - gx, me.z - gz), ap = Math.atan2(p.x - gx, p.z - gz), d = Math.atan2(Math.sin(ap - am), Math.cos(ap - am));
  const a = am + Math.sign(d || 1) * Math.min(Math.abs(d), 0.9);
  return { x: gx + Math.sin(a) * R, z: gz + Math.cos(a) * R };
}
