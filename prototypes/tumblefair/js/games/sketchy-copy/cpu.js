// Sketchy Copy CPU: looks at the doodle while it is shown, then draws it from memory stroke by stroke at a hand's
// pace — every point a little off, the whole thing a little squashed or tilted, and with a weak memory a part left
// out. Then it says Done. Family's copies wobble a lot and miss parts; Tricky's are close.
import { by, gauss } from '../cpu-kit.js';
import { SHAPES, SHAPES_HW } from './shapes.js';

const hx = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
export function createCpu(c) {
  const sk = c.skill, list = c.init?.season === 'halloween' ? SHAPES_HW : SHAPES, mem = {};
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      if (g.phase === 'show' && g.shape != null) mem.saw = { r: g.round, k: list[g.shape]?.k || [] };
      if (g.phase !== 'draw' || v.priv?.done) return;
      if (mem.r !== g.round) {                                          // plan the copy from memory
        mem.r = g.round; mem.i = 0; mem.next = v.t + 0.8 + sk.react;
        const src = mem.saw?.r === g.round ? mem.saw.k : list[0].k;
        const sx = 1 + gauss(c.rng) * 0.12 * sk.aim, sy = 1 + gauss(c.rng) * 0.12 * sk.aim, rot = gauss(c.rng) * 0.12 * sk.aim, wob = by(sk, [11, 6, 3.5]);
        mem.strokes = src.filter((_, i) => i === 0 || c.rng() > by(sk, [0.3, 0.12, 0.04])).map(st => st.filter((_, j) => j % 2 === 0 || j === st.length - 1).map(([x, y]) => {
          const dx = (x - 128) * sx, dy = (y - 128) * sy;
          return [128 + dx * Math.cos(rot) - dy * Math.sin(rot) + gauss(c.rng) * wob, 128 + dx * Math.sin(rot) + dy * Math.cos(rot) + gauss(c.rng) * wob];
        }));
        let n = 0; mem.strokes = mem.strokes.map(st => st.slice(0, Math.max(0, Math.min(st.length, 590 - n)))).filter(st => (n += st.length, st.length > 1));
      }
      if (v.t < mem.next) return;
      if (mem.i < mem.strokes.length) {
        const st = mem.strokes[mem.i];
        v.act('ink', { s: mem.i, p: st.map(([x, y]) => hx(x) + hx(y)).join('').slice(0, 800) });
        mem.i++; mem.next = v.t + 0.3 + st.length * by(sk, [0.06, 0.045, 0.035]);
        return;
      }
      v.act('done', true);
    },
  };
}
