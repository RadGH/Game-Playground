// Sky Serpent CPU (co-op): takes a harpoon cannon of its own (by seat), turns toward the serpent and fires when it
// is roughly in front and the cannon has reloaded; when the diving shadow is on it, it runs out and dashes as the
// shadow locks. Family turns late, fires at bad angles and is slow out of the shadow; Tricky leads the serpent a bit.
import { A, B, by, stickTo, stickFrom, gauss, slip } from '../cpu-kit.js';
import { CANNONS, RULES, cannonAt } from './sim.js';
import { angDiff } from '../boss-kit.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, seen = new Map();
  const noticed = (key, t, k = 1) => { if (!seen.has(key)) seen.set(key, t + sk.react * k * (0.75 + c.rng() * 0.5)); return t >= seen.get(key); };
  const i = Math.max(0, c.players.findIndex(p => p.pid === c.pid)), home = CANNONS[(i * (c.players.length > 2 ? 1 : 2)) % 4];
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me || (me.flags & (2 | 8)) || g.ph === 'end') return null;
      const [sx, sz] = g.s;
      // the shadow: get out of it (dash once it locks)
      if (g.sh && Math.hypot(me.x - g.sh[0], me.z - g.sh[1]) < RULES.shadowR + 0.9 && noticed('sh' + Math.round(v.t / 4), v.t)) {
        const run = stickFrom(me, g.sh[0], g.sh[1], sk), lock = g.sh[3] >= 1;
        const inward = stickTo(me, 0, 0, sk), out = { mx: run.mx * 0.7 + inward.mx * 0.3, mz: run.mz * 0.7 + inward.mz * 0.3 };
        const dash = lock && !mem.dashed && !slip(sk, c.rng, 0.5); if (dash) mem.dashed = true;
        return { ...out, b: dash ? B : 0 };
      }
      if (!g.sh) mem.dashed = false;
      // dazed and low inside the lookout: any cannon will do; otherwise my own
      let cn = home;
      if (c.players.length === 1 && g.ph !== 'dazed') {                   // alone: follow the serpent round the cannons
        let best = Infinity; for (const k of CANNONS) { const d = Math.hypot(k.x - sx, k.z - sz); if (d < best) { best = d; cn = k; } }
        if (mem.cn && Math.hypot(mem.cn.x - sx, mem.cn.z - sz) < best + by(sk, [4, 2.5, 1.5])) cn = mem.cn;     // no dithering
        mem.cn = cn;
      }
      if (g.ph === 'dazed') { let best = Infinity; for (const k of CANNONS) { const d = Math.hypot(k.x - me.x, k.z - me.z); if (d < best) { best = d; cn = k; } } }
      const at = cannonAt(me.x, me.z), stand = { x: cn.x * 0.84, z: cn.z * 0.84 };
      if (at < 0 || CANNONS[at] !== cn) return stickTo(me, stand.x, stand.z, sk, { arrive: 0.2 });
      // aim: push the stick gently toward where the serpent will be
      const ahead = by(sk, [0, 0.12, 0.2]), want = Math.atan2(sx + Math.sin(g.s[3]) * ahead * 6 - cn.x, sz + Math.cos(g.s[3]) * ahead * 6 - cn.z);
      if (mem.aimAt == null || v.t > mem.aimAt) { mem.aim = want + gauss(c.rng) * 0.35 * sk.aim; mem.aimAt = v.t + sk.think; }
      const ready = (g.rl?.[CANNONS.indexOf(cn)] ?? 0) <= 0, close = Math.abs(angDiff(me.yaw, want)) < by(sk, [0.7, 0.55, 0.45]);
      let b = 0;
      if (ready && (close || slip(sk, c.rng, 0.3)) && v.t > (mem.fireAt ?? 0)) { b = A; mem.fireAt = v.t + RULES.reload + sk.react * 0.6 + c.rng() * by(sk, [2.2, 0.6, 0.2]); }   // Family dawdles between shots
      // stay on my spot but face the aim
      const back = stickTo(me, stand.x, stand.z, sk, { arrive: 0.6 });
      return { mx: Math.sin(mem.aim) * 0.25 + back.mx * 0.5, mz: Math.cos(mem.aim) * 0.25 + back.mz * 0.5, b };
    },
  };
}
