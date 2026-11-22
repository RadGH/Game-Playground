// Catapult Crossing CPU, both roles. It sees only the public state (the blocks, the red target rings) and the bodies.
//   runner    plans a way down the staircase on the grid (start ledge = row -1, goal ledge = row ROWS): steps onto
//             whole blocks, and a straight HOP over one missing block when that is the only (or much the shortest)
//             way. Blocks that are shaking, or inside a red ring that is about to land, count as holes. Family plans
//             less often, reacts late to the rings and sometimes takes a worse step; Tricky reads the rings early.
//   catapult  picks the runner nearest the bottom (sometimes another), leads them by the boulder's flight time with
//             skill-sized error, slides the target there and fires the moment it is close and loaded; a BIG shot now
//             and then when two runners are close together. In the "Get set" count it smashes blocks in the runners' way.
import { by, thinker, stickTo, noisy, A, B, others } from '../cpu-kit.js';
import { COLS, ROWS, S, HW, FZ0, RULES, tileAt } from './sim.js';

const colX = c => -HW + S / 2 + c * S, rowZ = r => FZ0 + S / 2 + r * S;
const cellOf = (x, z) => [Math.max(0, Math.min(COLS - 1, Math.floor((x + HW) / S))), Math.floor((z - FZ0) / S)];

export function createCpu(c) {
  const sk = c.skill, think = thinker(c), mem = { press: false, gap: null, edge: 0.4 };
  const ringAware = by(sk, [0.55, 0.85, 1]);
  /** Grid search from (c0, r0) to the goal row. ok(c, r) = standable. Returns the first step { c, r, hop } or null. */
  function plan(c0, r0, ok) {
    const key = (cc, rr) => (rr + 1) * COLS + cc, start = key(c0, r0), dist = new Map([[start, 0]]), from = new Map(), q = [[0, c0, r0]];
    let goal = null;
    while (q.length) {
      q.sort((a, b) => a[0] - b[0]); const [d, cc, rr] = q.shift();
      if (d > (dist.get(key(cc, rr)) ?? Infinity)) continue;
      if (rr >= ROWS) { goal = key(cc, rr); break; }
      const steps = [[cc - 1, rr, 1.1, 0], [cc + 1, rr, 1.1, 0], [cc, rr + 1, 1, 0], [cc, rr - 1, 1.6, 0], [cc, rr + 2, 2.6, 1], [cc - 2, rr, 2.9, 1], [cc + 2, rr, 2.9, 1]];
      for (const [nc, nr, w, hop] of steps) {
        if (nc < 0 || nc >= COLS || nr < -1 || nr > ROWS || !ok(nc, nr)) continue;
        if (hop && ok((cc + nc) / 2, (rr + nr) / 2)) continue;                         // only hop over a real gap
        const k = key(nc, nr), nd = d + w + (nr < rr ? 0.6 : 0);
        if (nd < (dist.get(k) ?? Infinity)) { dist.set(k, nd); from.set(k, [key(cc, rr), hop]); q.push([nd, nc, nr]); }
      }
    }
    if (goal == null) return null;
    let k = goal, hop = 0;
    while (from.get(k)?.[0] !== start && from.has(k)) k = from.get(k)[0];
    hop = from.get(k)?.[1] || 0;
    return { c: k % COLS, r: Math.floor(k / COLS) - 1, hop };
  }
  function runner(v, me, g) {
    const danger = (g.bo || []).filter(b => b[3] < 1.05 * ringAware + 0.05);
    const unsafe = (x, z) => danger.some(b => Math.hypot(b[1] - x, b[2] - z) < (b[4] ? RULES.bigHitR : RULES.hitR) + 0.35);
    const ok = (cc, rr) => {
      if (!Number.isInteger(cc) || !Number.isInteger(rr)) return false;
      if (rr < 0 || rr >= ROWS) return !unsafe(colX(cc), rowZ(rr));
      const ch = g.t[rr * COLS + cc]; return ch === '0' && !unsafe(colX(cc), rowZ(rr));
    };
    let [cc, rr] = cellOf(me.x, me.z); if (me.z < FZ0) rr = -1; if (rr >= ROWS) rr = ROWS;
    const step = plan(cc, rr, ok) || plan(cc, rr, (a, b) => Number.isInteger(a) && Number.isInteger(b) && (b < 0 || b >= ROWS || g.t[b * COLS + a] === '0'));
    if (!step) return stickTo(me, me.x, me.z + 2, sk);
    const tx = colX(step.c), tz = step.r >= ROWS ? rowZ(ROWS) + 0.6 : rowZ(step.r);
    if (step.hop) {
      // run at the gap; the hop itself is timed every tick (tick() below), from the near edge of my block
      mem.gap = { x: colX((cc + step.c) / 2), z: rowZ((rr + step.r) / 2), until: v.t + 1.2 };    // the missing block's middle
      return stickTo(me, tx, tz, sk, { arrive: 0.1, mag: 1 });
    }
    mem.gap = null;
    return stickTo(me, tx, tz, sk, { arrive: 0.25 });
  }
  function catapult(v, me, g) {
    const flight = v.init?.flight ?? 1;
    const runners = others(v, c.pid, 1 | 8).filter(([pid]) => !(g.home || []).includes(pid) && !(g.out || []).includes(pid));
    let aim;
    if (g.ph === 'ready' || !runners.length) {
      // warm-up: break blocks in the rows the runners must cross first
      if (!mem.warm || Math.hypot(mem.warm.x - me.x, mem.warm.z - me.z) < 0.3) {
        const r = 1 + Math.floor(c.rng() * 4), col = Math.floor(c.rng() * COLS);
        mem.warm = { x: colX(col), z: rowZ(r) };
      }
      aim = mem.warm;
    } else {
      if (!mem.tg || v.t > mem.tgUntil || !runners.some(([pid]) => pid === mem.tg)) {
        const sorted = runners.slice().sort((a, b) => b[1].z - a[1].z);
        mem.tg = (c.rng() < by(sk, [0.5, 0.75, 0.85]) ? sorted[0] : sorted[Math.floor(c.rng() * sorted.length)])[0]; mem.tgUntil = v.t + 2.5;
      }
      const t = runners.find(([pid]) => pid === mem.tg)[1], lead = flight * by(sk, [0.4, 0.75, 0.9]);
      if (!mem.err || v.t > mem.errAt) { mem.err = [noisy(0, 1.0, sk, c.rng), noisy(0, 1.0, sk, c.rng)]; mem.errAt = v.t + 1.2; }
      aim = { x: t.x + (t.vx || 0) * lead + mem.err[0], z: t.z + (t.vz || 0) * lead + mem.err[1] };
    }
    const out = stickTo(me, aim.x, aim.z, sk, { arrive: 0.4, mag: 1 }), close = Math.hypot(aim.x - me.x, aim.z - me.z) < by(sk, [1.0, 0.8, 0.7]);
    const [rl, big] = g.rl || [1, 1];
    mem.press = !mem.press;                                    // a press is a rising edge: release every other tick
    if (close && rl <= 0 && mem.press) {
      const crowd = runners.filter(([, b]) => Math.hypot(b.x - aim.x, b.z - aim.z) < 2.2).length;
      return { ...out, b: big <= 0 && (crowd >= 2 || c.rng() < 0.15) ? B : A };
    }
    return out;
  }
  return {
    tick(v) {
      const me = v.me, g = v.g; if (!me || !g || !g.t) return null;
      if (g.ph === 'after') return null;
      if (g.cat === c.pid) return catapult(v, me, g);         // aiming is steady, every tick
      if (me.flags & (1 | 2 | 8)) return null;
      if (tileAt(me.x, me.z) === -2) return null;
      const out = think(v, () => runner(v, me, g));
      // hop when the gap's near edge is close (a person watches the edge, not a clock); a little late on Family
      if (mem.gap && v.t < mem.gap.until && !(me.flags & 16) && Math.hypot(mem.gap.x - me.x, mem.gap.z - me.z) < S / 2 + mem.edge) { mem.gap = null; mem.edge = by(sk, [0.15, 0.4, 0.5]) + (c.rng() - 0.5) * by(sk, [0.5, 0.25, 0.12]); return { ...out, b: A }; }
      return out;
    },
  };
}
