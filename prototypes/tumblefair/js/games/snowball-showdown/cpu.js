// Snowball Showdown CPU: keeps itself between a rival (or snowman) and the middle of the ice, turns to face it and
// throws, dashes into it when it is close and nearer the edge, sidesteps snowballs it sees coming and skates back
// from the edge. Family throws less often with a wobbly aim, notices the edge late and rarely dodges; Tricky does all
// of that sharply but still waits the game's own cooldowns.
import { thinker, stickTo, by, noisy, slip, A, B } from '../cpu-kit.js';

const OUT = 1, STUN = 2, GHOST = 32;
export function createCpu(c) {
  const sk = c.skill, rng = c.rng, think = thinker(c), mem = { balls: new Map(), throwAt: 0, dashAt: 0 };
  const safeR = by(sk, [6.4, 5.9, 5.6]), throwGap = by(sk, [1.2, 0.95, 0.85]), dodge = by(sk, [0.15, 0.4, 0.55]);
  return {
    tick(v) {
      const me = v.me, g = v.g;
      // snowball velocities come from watching them move tick to tick (everyone sees them fly)
      const was = mem.balls; mem.balls = new Map((g?.s || []).map(s => [s[0], { x: s[1], z: s[2], vx: was.has(s[0]) ? (s[1] - was.get(s[0]).x) / 0.05 : 0, vz: was.has(s[0]) ? (s[2] - was.get(s[0]).z) / 0.05 : 0 }]));
      if (!me || !g || (me.flags & (OUT | STUN)) || me.y < -0.2) return null;
      return think(v, () => {
        // the edge: where the slide is taking me
        const px = me.x + me.vx * 0.6, pz = me.z + me.vz * 0.6;
        if (Math.hypot(px, pz) > safeR && !slip(sk, rng, 0.5)) return stickTo(me, 0, 0, sk, { arrive: 0 });
        // a snowball coming at me: step aside
        for (const s of mem.balls.values()) {
          const sp = Math.hypot(s.vx, s.vz); if (sp < 5) continue;
          const dx = me.x - s.x, dz = me.z - s.z, along = (dx * s.vx + dz * s.vz) / sp, side = (dx * s.vz - dz * s.vx) / sp;
          if (along > 2 && along < 9 && Math.abs(side) < 1 && rng() < dodge) {
            const sg = Math.sign(side) || 1, nx = s.vz / sp * sg, nz = -s.vx / sp * sg;
            if (Math.hypot(me.x + nx * 2, me.z + nz * 2) < safeR) return { mx: nx * sk.speed, mz: nz * sk.speed };
          }
        }
        // the target: the closest rival on the ice (not blinking), or a snowman when alone
        const marks = g.sm ? g.sm.filter(s => s[3] > -0.1).map(s => ({ x: s[1], z: s[2] }))
          : [...v.bodies].filter(([p, b]) => p !== c.pid && !(b.flags & (OUT | GHOST)) && b.y > -0.2).map(([, b]) => b);
        let t = null, td = Infinity;
        for (const m of marks) { const d = Math.hypot(m.x - me.x, m.z - me.z) - Math.hypot(m.x, m.z) * 0.3; if (d < td) { td = d; t = m; } }
        if (!t) return stickTo(me, 0, 0, sk);
        const dx = t.x - me.x, dz = t.z - me.z, d = Math.hypot(dx, dz) || 1, tr = Math.hypot(t.x, t.z);
        const facing = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - me.yaw), Math.cos(Math.atan2(dx, dz) - me.yaw)));
        // close, nearer the edge than me, and the dash will not carry me off: barge
        if (d < 2.4 && tr > Math.hypot(me.x, me.z) && facing < 0.4 && v.t >= mem.dashAt && Math.hypot(me.x + dx / d * 4.5, me.z + dz / d * 4.5) < 7.6 && rng() < by(sk, [0.25, 0.5, 0.7])) {
          mem.dashAt = v.t + 2 + rng(); return { mx: dx / d * 0.3, mz: dz / d * 0.3, b: B };
        }
        // turn toward it (a light push turns you without sliding much) and throw once facing it
        const ax = noisy(t.x, 1.2, sk, rng), az = noisy(t.z, 1.2, sk, rng);
        const turn = stickTo(me, ax, az, sk, { mag: 0.3, arrive: 0 });
        if (facing < 0.45 && d < 10 && v.t >= mem.throwAt) { mem.throwAt = v.t + throwGap * (0.8 + rng() * 0.5); return { ...turn, b: A }; }
        // drift to a spot between it and the middle, a few metres off
        const cx = -t.x / (tr || 1), cz = -t.z / (tr || 1), want = Math.min(4.5, tr + 4);
        let sx = t.x + cx * 4, sz = t.z + cz * 4; const sr = Math.hypot(sx, sz); if (sr > want) { sx *= want / sr; sz *= want / sr; }
        if (Math.hypot(sx - me.x, sz - me.z) > 1.2 && facing > 0.45) return turn;
        return Math.hypot(sx - me.x, sz - me.z) > 1.2 ? stickTo(me, sx, sz, sk, { mag: sk.speed * 0.7 }) : turn;
      });
    },
  };
}
