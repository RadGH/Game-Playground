// Downhill Derby CPU: reads the course it is shown (bales, puddles, ramps) and steers for the gap in the next row
// down the hill nearest to its line, the dry side of a puddle, or straight over a ramp; it tucks on the straights.
// Family looks less far ahead, steers late and wide, and tucks less; Tricky picks gaps early and takes the ramps.
import { A, by, gauss } from '../cpu-kit.js';
import { RULES } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, init = c.init || {}, HW = init.arena?.hw ?? 6.5, mem = { wob: 0, form: 0.95 + c.rng() * 0.05 };      // form: how bold this run is
  // one row per obstacle line: { z, pick(x) -> the x to steer for }
  const rows = [], byZ = new Map();
  for (const b of init.arena?.blocks || []) { if (!byZ.has(b.z)) byZ.set(b.z, []); byZ.get(b.z).push(b); }
  for (const [z, bl] of byZ) {
    const gaps = []; let x0 = -HW;
    for (const b of [...bl].sort((p, q) => p.x - q.x)) { if (b.x - b.hw - x0 > 1.4) gaps.push((x0 + b.x - b.hw) / 2); x0 = b.x + b.hw; }
    if (HW - x0 > 1.4) gaps.push((x0 + HW) / 2);
    rows.push({ z, pick: x => gaps.reduce((m, gx) => (Math.abs(gx - x) < Math.abs(m - x) ? gx : m), gaps[0] ?? 0) });
  }
  for (const r of init.ramps || []) rows.push({ z: r.z, pick: x => (Math.abs(x - r.x) < by(sk, [1.5, 3, 5]) ? r.x : x) });
  for (const p of init.puddles || []) if (!(init.ramps || []).some(r => Math.abs(r.x - p.x) < 0.1 && Math.abs(r.z - 3.6 - p.z) < 0.5)) rows.push({ z: p.z, pick: x => (Math.abs(x - p.x) < p.r + 0.9 ? (x > p.x ? p.x + p.r + 1.2 : p.x - p.r - 1.2) : x) });
  rows.sort((a, b) => b.z - a.z);
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me || g.cd || (me.flags & 8)) return null;
      const reach = by(sk, [5, 9, 14]);
      const next = rows.filter(r => r.z < me.z - 1 && r.z > me.z - reach);
      let tx = me.x;
      for (const r of next) tx = r.pick(tx);                            // the line through the next few rows
      if (next[0]) tx = next[0].pick(me.x) * 0.6 + tx * 0.4;
      if (v.t > (mem.at ?? 0)) { mem.err = gauss(c.rng) * by(sk, [1.6, 0.9, 0.65]); mem.at = v.t + sk.think * 3; }
      tx = Math.max(-HW + 0.8, Math.min(HW - 0.8, tx + mem.err));
      const look = next[0] ? Math.max(3, Math.min(10, me.z - next[0].z)) : 8;
      let mx = (tx - me.x) / look, mz = -1; const m = Math.hypot(mx, mz); mx /= m; mz /= m;
      const wob = g.wob?.[c.pid] || 0, straight = Math.abs(mx) < by(sk, [0.2, 0.3, 0.35]) && Math.abs(Math.sin(me.yaw)) < 0.3;
      const tuck = straight && wob < by(sk, [7, 5, 4]) && c.rng() < by(sk, [0.6, 0.9, 1]);
      const push = by(sk, [0.92, 0.96, 0.975]) * mem.form;
      return { mx: mx * push, mz: mz * push, b: tuck ? A : 0 };
    },
  };
}
