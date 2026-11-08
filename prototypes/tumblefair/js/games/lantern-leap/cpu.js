// Lantern Leap CPU: picks a coin (or firefly), then works across the pond one lane at a time — walks onto a pad
// that touches its own, or LEAPs at one in reach, steering for where that pad will be when it lands — and leaves a
// pad that has started to wobble or is drifting off the side. Family plans slowly, lands loosely and leaves late;
// Tricky picks better coins, leaps further and bails earlier.
import { by, noisy, slip, pickBest, A } from '../cpu-kit.js';

const STUN = 2, AIR = 16, JUMP = 0.5, BOOST = 1.45, SPEED = 5.2, HW = 9;
export function createCpu(c) {
  const sk = c.skill, rng = c.rng, mem = { next: 0, plan: null, leapAt: -9 };
  const I = c.init, DOCK = I.dock, BANK = I.bank, LANES = I.lanes;
  const reach = by(sk, [2.65, 2.85, 3.05]), bail = by(sk, [0.65, 0.6, 0.45]), miss = by(sk, [0.3, 0.25, 0.15]);
  const laneOf = z => { let b = 0; for (let i = 1; i < LANES.length; i++) if (Math.abs(z - LANES[i][0]) < Math.abs(z - LANES[b][0])) b = i; return b; };
  const rowOfZ = z => (z >= DOCK - 0.05 ? 0 : z <= BANK + 0.05 ? LANES.length + 1 : 1 + laneOf(z));
  return {
    tick(v) {
      const me = v.me, g = v.g;
      if (!me || !g?.pd || (me.flags & STUN) || me.y < -0.05) return null;
      const pads = g.pd.filter(p => p[5] > -0.05).map(([id, x, z, r, w]) => ({ id, x, z, r, w, row: 1 + laneOf(z), vx: LANES[laneOf(z)][1] }));
      const at = (p, s) => p.x + p.vx * s;
      const air = me.flags & AIR;
      // in the air: steer for where the chosen pad will be when I come down
      if (air) {
        const p = pads.find(q => q.id === mem.plan?.id); if (!p) return null;
        const left = Math.max(0.05, mem.leapAt + JUMP - v.t), tx = at(p, left) + mem.plan.ox, tz = p.z + mem.plan.oz;
        let mx = (tx - me.x) / (left * SPEED * BOOST), mz = (tz - me.z) / (left * SPEED * BOOST); const m = Math.hypot(mx, mz);
        if (m > sk.speed) { mx *= sk.speed / m; mz *= sk.speed / m; }
        return { mx, mz, b: 0 };
      }
      const row = rowOfZ(me.z), mine = row === 0 || row > LANES.length ? null : pads.find(p => Math.hypot(p.x - me.x, p.z - me.z) < p.r + 0.2);
      // re-plan at a human pace: the coin, then the next pad toward it
      let press = 0;
      if (v.t >= mem.next || !mem.plan) {
        mem.next = v.t + sk.think * (0.8 + rng() * 0.4);
        const coins = (g.cn || []).map(([id, x, z, k]) => ({ id, x, z, k, pad: pads.find(p => Math.hypot(p.x - x, p.z - z) < p.r) })).filter(q => q.pad && Math.abs(at(q.pad, 1.5)) < HW - 2);
        const coin = mem.coin && coins.find(q => q.id === mem.coin.id) && slip(sk, rng, 2) ? coins.find(q => q.id === mem.coin.id)
          : pickBest(coins, q => (q.k ? 2.2 : 1) / (1 + Math.abs(q.pad.row - row) * 1.3 + Math.abs(at(q.pad, 1) - me.x) / 3), sk, rng);
        mem.coin = coin;
        const goalRow = coin ? coin.pad.row : (row > LANES.length ? row : 0), goalX = coin ? at(coin.pad, 1) : 0;
        const urgent = mine && (mine.w > bail || Math.abs(mine.x) > HW - 2.2 && Math.sign(mine.vx) === Math.sign(mine.x));
        if (coin && mine && mine.id === coin.pad.id) mem.plan = { walk: { id: mine.id, dx: coin.x - mine.x, dz: coin.z - mine.z } };
        else {
          const step = Math.sign(goalRow - row), SHORE = LANES.length + 1;
          const rows = urgent ? [row - 1, row + 1, row] : step ? [row + step] : [row];
          const shore = rows.find(r => r === 0 || r === SHORE);
          if (shore != null && (urgent || goalRow === shore)) mem.plan = { shore };
          else {
            const cands = pads.filter(p => rows.includes(p.row) && p !== mine && p.w < 0.35 && Math.abs(at(p, JUMP)) < HW - 1.6);
            const score = p => { const lx = at(p, JUMP), d = Math.hypot(lx - me.x, p.z - me.z); return -d - Math.abs(lx - goalX) * 0.35 - p.w * 3 + (coin && p.id === coin.pad.id ? 2 : 0) - (d > reach ? 4 + d : 0); };
            const best = cands.length ? cands.reduce((a, b) => (score(b) > score(a) ? b : a)) : null;
            if (!best) mem.plan = { stay: true };
            else {
              const lx = at(best, JUMP), d = Math.hypot(lx - me.x, best.z - me.z);
              const touching = mine ? Math.hypot(best.x - mine.x, best.z - mine.z) < mine.r + best.r + 0.1 : true;   // shore pads sit in line with the shore
              if (touching && Math.abs(best.x + best.vx * 0.3 - me.x) < best.r * 0.6) mem.plan = { walk: { id: best.id, dx: 0, dz: 0 } };
              else if (d <= reach && !slip(sk, rng, 0.3)) { mem.plan = { id: best.id, ox: noisy(0, miss, sk, rng), oz: noisy(0, miss * 0.6, sk, rng) }; mem.leapAt = v.t; press = A; }
              else mem.plan = { wait: best.id };
            }
          }
        }
      }
      // carry out the plan, every tick
      const P = mem.plan || {};
      let tx = me.x, tz = me.z;
      if (press) { const p = pads.find(q => q.id === P.id); if (p) { tx = at(p, JUMP); tz = p.z; } }
      else if (P.walk) { const p = pads.find(q => q.id === P.walk.id); if (p) { tx = p.x + P.walk.dx + p.vx * 0.15; tz = p.z + P.walk.dz; } }
      else if (P.shore != null) { tz = P.shore === 0 ? DOCK + 0.5 : BANK - 0.5; }
      else if (P.wait != null) {                                        // edge toward it without stepping off my own pad
        const p = pads.find(q => q.id === P.wait);
        if (p) { const gx = at(p, JUMP), gz = p.z; tx = gx; tz = gz; }
        if (mine) { const dx = tx - mine.x, dz = tz - mine.z, d = Math.hypot(dx, dz) || 1, lim = Math.max(0, mine.r - 0.45); if (d > lim) { tx = mine.x + dx / d * lim; tz = mine.z + dz / d * lim; } }
        else if (row === 0) tz = Math.max(tz, DOCK + 0.3); else tz = Math.min(tz, BANK - 0.3);
      } else if (mine) { tx = mine.x; tz = mine.z; }
      let mx = tx - me.x, mz = tz - me.z; const d = Math.hypot(mx, mz);
      const mag = press ? sk.speed : sk.speed * Math.min(1, d / 0.4);
      if (d > 1e-3) { mx = mx / d * mag; mz = mz / d * mag; } else { mx = 0; mz = 0; }
      return { mx, mz, b: press };
    },
  };
}
