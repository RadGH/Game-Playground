// Pillow Fight CPU: picks someone to bop (a high wobble near an edge is the juiciest; alone, the nearest sleepwalker),
// walks round to the side away from that edge so the bop sends them over, and swings when they are in reach in front.
// It steps back from the edge itself and now and then hops away when someone is right on top of it. Family wanders in
// head-on and only swings once they are close; Tricky lines its bops up with the nearest edge.
import { A, B, by, stickTo, noisy, slip, clamp } from '../cpu-kit.js';
import { RULES } from './sim.js';

const STUN = 2, FROZEN = 8, GHOST = 32;
export function createCpu(c) {
  const sk = c.skill, mem = { next: 0, swingAt: 0, out: { mx: 0, mz: 0 } };
  const EX = RULES.edgeX, EZ = RULES.edgeZ;
  const edgeDir = (x, z) => (EX - Math.abs(x) < EZ - Math.abs(z) ? { x: Math.sign(x) || 1, z: 0, d: EX - Math.abs(x) } : { x: 0, z: Math.sign(z) || 1, d: EZ - Math.abs(z) });
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me || (me.flags & (STUN | FROZEN)) || me.y < -0.2) return null;
      const foes = [];
      for (const [pid, b] of v.bodies) if (pid !== c.pid && !(b.flags & (FROZEN | GHOST)) && b.y > -0.2) foes.push({ x: b.x, z: b.z, wob: g.wb?.[pid] || 0, vx: b.vx, vz: b.vz });
      for (const s of g.sl || []) if (s[3] > -0.2) foes.push({ x: s[1], z: s[2], wob: s[5], vx: 0, vz: 0 });
      if (!foes.length) return { ...stickTo(me, 0, 0, sk), b: 0 };
      // swing: someone in reach in front of me (the aim help turns me the rest of the way)
      const inReach = foes.find(f => { const d = Math.hypot(f.x - me.x, f.z - me.z); let a = Math.atan2(f.x - me.x, f.z - me.z) - me.yaw; a = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))); return d <= RULES.reach * by(sk, [0.85, 0.95, 1]) && a <= RULES.aim; });
      if (!inReach) mem.seenAt = null;
      else if (mem.seenAt == null) mem.seenAt = v.t + by(sk, [0.34, 0.22, 0.13]) * (0.4 + c.rng() * 1.2);   // notices them in reach
      if (inReach && v.t >= mem.seenAt && v.t >= mem.swingAt) { mem.seenAt = null; mem.swingAt = v.t + RULES.swingCool + by(sk, [0.45, 0.28, 0.16]) * (0.6 + c.rng() * 0.8); return { ...mem.out, b: A }; }
      if (v.t < mem.next) return { ...mem.out, b: 0 };
      mem.next = v.t + sk.think * (0.8 + c.rng() * 0.4);
      // hop away when crowded at my own edge
      const myEdge = edgeDir(me.x, me.z), close = foes.filter(f => Math.hypot(f.x - me.x, f.z - me.z) < 1.4).length;
      if (myEdge.d < 1.2 && close && c.rng() < by(sk, [0.15, 0.3, 0.45])) { mem.out = { mx: -myEdge.x * sk.speed, mz: -myEdge.z * sk.speed }; return { ...mem.out, b: B }; }
      // the target: near, wobbly, near an edge
      if (!mem.tgt || slip(sk, c.rng, 0.3) || c.rng() < 0.15) {
        let best = null, bs = -1e9;
        for (const f of foes) { const s = -Math.hypot(f.x - me.x, f.z - me.z) + f.wob * 0.02 - edgeDir(f.x, f.z).d * by(sk, [0.2, 0.6, 0.9]) + noisy(0, 1.2, sk, c.rng); if (s > bs) { bs = s; best = f; } }
        mem.tgt = best;
      } else mem.tgt = foes.reduce((a, f) => (Math.hypot(f.x - mem.tgt.x, f.z - mem.tgt.z) < Math.hypot(a.x - mem.tgt.x, a.z - mem.tgt.z) ? f : a));
      const t = mem.tgt, e = edgeDir(t.x, t.z), line = by(sk, [0.3, 0.8, 1]);
      // stand between the target and the middle of the bed, on the line through its nearest edge
      let tx = t.x - e.x * 1.2 * line, tz = t.z - e.z * 1.2 * line;
      tx = clamp(noisy(tx, 0.6, sk, c.rng), -EX + 1, EX - 1); tz = clamp(noisy(tz, 0.6, sk, c.rng), -EZ + 1, EZ - 1);
      mem.out = stickTo(me, tx, tz, sk, { arrive: 0.3 });
      return { ...mem.out, b: 0 };
    },
  };
}
