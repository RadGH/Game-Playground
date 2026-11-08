// Secret Architect CPU. As ARCHITECT it pins three blocks, crosses two easy-to-get-wrong empty squares, says the
// blueprint's name, then steers with lines (more / fewer / move it / getting close) from the builders' live grids.
// As BUILDER it draws what the name brings to mind (shapes everyone knows roughly), lined up on the pins and moved
// by the "move it" lines; a person's picture is rough, so cells come out wrong — Family's often, Tricky's rarely.
import { by, readDelay } from '../cpu-kit.js';
import { GRID, SHAPES } from './shapes.js';
import { LINES, CELLS, toBits } from './sim.js';

const xy = i => [i % GRID, (i / GRID) | 0];
const shiftBits = (b, dx, dy) => { let o = ''; for (let i = 0; i < CELLS; i++) { const [x, y] = xy(i), sx = x - dx, sy = y - dy; o += sx >= 0 && sx < GRID && sy >= 0 && sy < GRID ? b[sy * GRID + sx] : '0'; } return o; };
const near = i => { const [x, y] = xy(i); return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [x + a, y + b]).filter(([a, b]) => a >= 0 && b >= 0 && a < GRID && b < GRID).map(([a, b]) => b * GRID + a); };

export function createCpu(c) {
  const sk = c.skill, mem = {};
  const wrong = by(sk, [0.6, 0.3, 0.14]), offBy = by(sk, [0.45, 0.25, 0.12]), pace = by(sk, [0.65, 0.42, 0.32]);
  function rough(bits) {                                  // a person's memory of a picture: some cells missed, some extra
    let o = [...bits];
    for (let i = 0; i < CELLS; i++) if (bits[i] === '1' && c.rng() < wrong) { o[i] = '0'; if (c.rng() < 0.6) { const n = near(i); o[n[Math.floor(c.rng() * n.length)]] = '1'; } }
    return o.join('');
  }
  function architect(v, g, p) {
    const R = g.round, t = p.target;
    if (!mem.marked?.[R]) {
      mem.marked = { [R]: true };
      const on = [...t].map((b, i) => (b === '1' ? i : -1)).filter(i => i >= 0), pins = [];
      while (pins.length < 3 && on.length) { const k = on.splice(Math.floor(c.rng() * on.length), 1)[0]; if (!pins.some(q => near(q).includes(k))) pins.push(k); else if (on.length < 3) pins.push(k); }
      for (const cc of pins) v.act('mark', { c: cc, k: 'p' });
      const edge = [...new Set(pins.flatMap(near))].filter(i => t[i] === '0');
      for (let k = 0; k < 2 && edge.length; k++) v.act('mark', { c: edge.splice(Math.floor(c.rng() * edge.length), 1)[0], k: 'x' });
      mem.sayAt = v.t + readDelay(sk, c.rng, 0.6);
    }
    if (g.phase !== 'build' || v.t < mem.sayAt || g.msgs.length >= 6) return;
    mem.sayAt = v.t + 3 + c.rng() * 2;
    if (!p.named) { v.act('say', 'name'); return; }
    const grids = Object.values(p.grids || {}); if (!grids.length) return;
    const g0 = grids[0], want = t.split('1').length - 1, have = g0.split('1').length - 1;
    if (have < want * 0.6) { v.act('say', 'more'); return; }
    if (have > want * 1.4) { v.act('say', 'fewer'); return; }
    let best = null;
    for (const [dx, dy, k] of [[-1, 0, 'shiftL'], [1, 0, 'shiftR'], [0, -1, 'shiftU'], [0, 1, 'shiftD']]) { const m = p.match[Object.keys(p.grids)[0]]; const s = matchOf(t, shiftBits(g0, dx, dy)); if (s > m + 12 && (!best || s > best[0])) best = [s, k]; }
    if (best) v.act('say', best[1]); else if (c.rng() < 0.5) v.act('say', 'warm');
  }
  function builder(v, g, p) {
    const R = g.round;
    if (mem.r !== R) { mem.r = R; mem.want = null; mem.shape = null; mem.heard = 0; mem.next = v.t + readDelay(sk, c.rng, 0.8); mem.dx = c.rng() < offBy ? (c.rng() < 0.5 ? -1 : 1) : 0; mem.align = c.rng() < by(sk, [0.1, 0.5, 0.8]); }
    if (p.target && mem.shape == null) mem.shape = rough(p.target);          // solo: the blueprint is shown to you
    const named = g.msgs.find(m => /^It's /.test(m) && m.endsWith('!') && !Object.values(LINES).includes(m));
    if (named && mem.shape == null) { const s = SHAPES.find(x => `It's ${x.name}!` === named); if (s) mem.shape = c.rng() < by(sk, [0.4, 0.8, 0.95]) ? rough(toBits(s.rows)) : ''; }
    for (; mem.heard < g.msgs.length; mem.heard++) {                // respond to "move it" lines
      const m = g.msgs[mem.heard], k = Object.keys(LINES).find(q => LINES[q] === m);
      if (k === 'shiftL') mem.dx--; if (k === 'shiftR') mem.dx++; if (k === 'shiftU') mem.dy = (mem.dy || 0) - 1; if (k === 'shiftD') mem.dy = (mem.dy || 0) + 1;
    }
    const pins = g.marks.filter(m => m[1] === 'p').map(m => m[0]), crosses = g.marks.filter(m => m[1] === 'x').map(m => m[0]);
    let want = mem.shape && mem.shape.length ? shiftBits(mem.shape, mem.dx, mem.dy || 0) : [...Array(CELLS)].map((_, i) => (pins.includes(i) || pins.some(q => near(q).includes(i)) ? '1' : '0')).join('');
    if (mem.shape && pins.length && mem.align) {                   // line the picture up on the pins
      let bs = -1, bb = want;
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { const s2 = shiftBits(mem.shape, dx, dy), hit = pins.filter(q => s2[q] === '1').length - crosses.filter(q => s2[q] === '1').length - (Math.abs(dx - mem.dx) + Math.abs(dy - (mem.dy || 0))) * 0.3; if (hit > bs) { bs = hit; bb = s2; } }
      want = bb;
    }
    want = [...want].map((b, i) => (pins.includes(i) ? '1' : crosses.includes(i) ? '0' : b)).join('');
    if (g.phase !== 'build' || v.t < mem.next || !p.grid) return;
    mem.next = v.t + pace * (0.7 + c.rng() * 0.6);
    const diff = [...want].map((b, i) => (b !== p.grid[i] ? i : -1)).filter(i => i >= 0);
    if (diff.length) { v.act('tap', diff[Math.floor(c.rng() * diff.length)]); return; }
    if (!p.done && (mem.shape != null || g.left < 4)) v.act('done', true);
  }
  return {
    tick(v) {
      const g = v.g, p = v.priv; if (!g || !p || g.phase === 'show') return;
      if (p.role === 'arch') architect(v, g, p); else if (p.role === 'build') builder(v, g, p);
    },
  };
}
function matchOf(a, b) { let both = 0, either = 0; for (let i = 0; i < CELLS; i++) { const x = a[i] === '1', y = b[i] === '1'; if (x && y) both++; if (x || y) either++; } return either ? Math.round(100 * both / either) : 0; }
