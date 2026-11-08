// Circuit Scramble CPU (co-op): works the board out the way a puzzler does (every wire end must meet another, none
// may point off the edge), then turns the tiles in its own colour toward that picture, one tap at a time at a human
// pace. Family taps slowly and now and then turns the wrong tile; Tricky is quick and tidy.
import { by, slip, pick } from '../cpu-kit.js';
import { turn } from './sim.js';

/** A wiring where every end meets (search, row by row); fixed tiles keep their turn. -> rotations or null */
function solve(g) {
  const w = g.w, h = g.h, base = [...g.t].map(c => parseInt(c, 16)), fixed = [...g.o].map(o => o === '-');
  const cur = [...g.r].map(Number), rot = new Array(w * h).fill(0), m = new Array(w * h).fill(0);
  const fits = i => {
    const x = i % w, y = (i / w) | 0, v = m[i];
    if ((y === 0 && v & 1) || (x === w - 1 && v & 2) || (y === h - 1 && v & 4) || (x === 0 && v & 8)) return false;
    if (y > 0 && !!(v & 1) !== !!(m[i - w] & 4)) return false;
    if (x > 0 && !!(v & 8) !== !!(m[i - 1] & 2)) return false;
    return true;
  };
  const go = i => {
    if (i === w * h) return true;
    for (const r of fixed[i] ? [cur[i]] : [0, 1, 2, 3]) { rot[i] = r; m[i] = turn(base[i], r); if (fits(i) && go(i + 1)) return true; }
    return false;
  };
  return go(0) ? rot.map((r, i) => turn(base[i], r)) : null;                // the wanted wire shapes
}

export function createCpu(c) {
  const sk = c.skill, seat = String(c.players.find(p => p.pid === c.pid)?.seat ?? ''), mem = { next: 0 };
  return {
    tick(v) {
      const g = v.g; if (g?.phase !== 'play' || !g.o) return;
      if (mem.stage !== g.stage) { mem.stage = g.stage; mem.want = solve(g); mem.next = v.t + (g.w * g.h) * by(sk, [0.45, 0.25, 0.14]) * (0.7 + c.rng() * 0.6); }   // study the new board first
      if (v.t < mem.next || !mem.want) return;
      mem.next = v.t + by(sk, [1.1, 0.7, 0.45]) * (0.7 + c.rng() * 0.6);
      const base = [...g.t].map(ch => parseInt(ch, 16)), r = [...g.r].map(Number);
      const mine = [...g.o].map((o, i) => (o === seat ? i : -1)).filter(i => i >= 0);
      const wrong = mine.filter(i => turn(base[i], r[i]) !== mem.want[i]);
      if (!wrong.length) return;
      v.act('rot', slip(sk, c.rng, 0.5) && mine.length ? pick(mine, c.rng) : wrong[0]);
    },
  };
}
