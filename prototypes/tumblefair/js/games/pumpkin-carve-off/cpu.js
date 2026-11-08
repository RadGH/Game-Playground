// Pumpkin Carve-Off CPU: carves a jack-o'-lantern one cut at a time (eyes, a nose, a mouth, sometimes brows or teeth)
// from a few stock shapes, with a wobble in its hand; Tricky carves more pieces and keeps the face even, Family fewer
// and lopsided. In the vote it picks a lantern that is not its own, usually the one that looks most carved and even.
import { by, gauss, clamp, pickBest } from '../cpu-kit.js';
import { measure } from './sim.js';

const hx = n => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
const enc = pts => pts.map(([x, y]) => hx(x) + hx(y)).join('');
const EYES = [
  (cx, cy, s) => [[cx - 12 * s, cy + 8 * s], [cx, cy - 12 * s], [cx + 12 * s, cy + 8 * s], [cx - 12 * s, cy + 8 * s]],          // triangle
  (cx, cy, s) => Array.from({ length: 9 }, (_, i) => [cx + Math.cos(i / 8 * 6.283) * 10 * s, cy + Math.sin(i / 8 * 6.283) * 10 * s]),  // round
  (cx, cy, s) => [[cx - 12 * s, cy], [cx, cy - 6 * s], [cx + 12 * s, cy]],                                                           // sleepy
];
const MOUTHS = [
  s => [[78, 170], [100, 186 + 6 * s], [128, 192 + 8 * s], [156, 186 + 6 * s], [178, 170]],                          // smile
  () => [[80, 178], [94, 166], [108, 184], [122, 166], [136, 184], [150, 166], [164, 184], [178, 170]],              // zigzag
  s => Array.from({ length: 9 }, (_, i) => [128 + Math.cos(i / 8 * 6.283) * 18 * s, 182 + Math.sin(i / 8 * 6.283) * 14 * s]),  // "oh!"
];

export function createCpu(c) {
  const sk = c.skill, mem = { cuts: null, sent: 0, sid: 0 };
  const hand = by(sk, [7, 4, 2]);
  function plan() {
    const s = 0.9 + c.rng() * 0.5, eye = EYES[Math.floor(c.rng() * EYES.length)], cuts = [];
    const lean = gauss(c.rng) * by(sk, [10, 4, 1.5]);                             // how lopsided the eyes come out
    cuts.push([1, eye(98, 118, s)], [1, eye(158 + lean, 118 + lean / 2, s)]);
    if (c.rng() < by(sk, [0.5, 0.8, 0.95])) cuts.push([0, [[122, 150], [128, 138], [134, 150], [122, 150]]]);   // nose
    cuts.push([c.rng() < 0.5 ? 1 : 0, MOUTHS[Math.floor(c.rng() * MOUTHS.length)](s)]);
    if (c.rng() < by(sk, [0.2, 0.45, 0.7])) cuts.push([0, [[84, 96], [110, 90]]], [0, [[146, 90], [172, 96]]]);  // brows
    if (c.rng() < by(sk, [0.1, 0.3, 0.55])) cuts.push([0, [[110, 182], [110, 192]]], [0, [[146, 182], [146, 192]]]); // teeth
    return cuts.map(([w, pts]) => [w, enc(pts.map(([x, y]) => [x + gauss(c.rng) * hand, y + gauss(c.rng) * hand]))]);
  }
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      for (const e of v.events || []) if (e.e === 'art') mem.art = e.art;
      if (g.phase === 'carve') {
        if (!mem.cuts) { mem.cuts = plan(); mem.next = v.t + 3 + c.rng() * 4; mem.gap = by(sk, [5, 3.5, 3]); }
        if (v.t < mem.next) return;
        if (mem.sent < mem.cuts.length) { const [w, p] = mem.cuts[mem.sent++]; v.act('cut', { s: ++mem.sid, w, p }); mem.next = v.t + mem.gap * (0.6 + c.rng() * 0.8); }
        else if (!mem.done) { mem.done = true; v.act('done', true); }
        return;
      }
      if (g.phase !== 'vote' || mem.voted || !v.priv) return;
      if (mem.vAt == null) mem.vAt = v.t + 2 + c.rng() * by(sk, [8, 6, 5]);
      if (v.t < mem.vAt) return;
      mem.voted = true;
      const mine = v.priv.mine, art = mem.art || [];
      const ok = art.map((a, i) => i).filter(i => i !== mine && art[i]?.k?.length);
      if (!ok.length) { if (art.length === 2) v.act('vote', 'both'); return; }
      const look = i => { const m = measure(art[i].k); return Math.min(m.ink, 120) / 120 + m.even / 100 + Math.min(m.cuts, 7) / 7; };
      v.act('vote', pickBest(ok, look, sk, c.rng));
    },
  };
}
