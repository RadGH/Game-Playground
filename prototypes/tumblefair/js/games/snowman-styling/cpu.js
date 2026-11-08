// Snowman Styling CPU: reads the theme card (public) and dresses its snowman one slot at a time at a person's pace,
// usually taking the piece that fits the theme (Tricky nearly always, Family often just grabs one it likes), then says
// ready. In the vote it picks someone else's dressed snowman, leaning to the one that fits the theme best.
import { by, readDelay, later, pickBest } from '../cpu-kit.js';
import { THEMES, SLOTS, OPTIONS, N_SLOTS, fits, fitOf, filledOf, parseShow } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  const per = by(sk, [3.6, 2.6, 2.0]);                 // seconds per piece (a person browsing five choices)
  return {
    tick(v) {
      const g = v.g, p = v.priv; if (!g || !p) return;
      const theme = THEMES[g.th]; if (!theme) return;
      if (g.phase === 'dress') {
        if (p.done) return;
        mem.next ??= v.t + readDelay(sk, c.rng, 2);
        if (v.t < mem.next) return;
        mem.next = v.t + per * (0.7 + c.rng() * 0.6);
        const s = (p.outfit || []).findIndex(i => i < 0);
        if (s < 0 || s >= N_SLOTS) { v.act('done', true); return; }
        const opts = OPTIONS[SLOTS[s].id].map((_, i) => i);
        v.act('wear', { s, i: pickBest(opts, i => (fits(theme, s, i) ? 1 : 0) + c.rng() * 0.5, sk, c.rng) });
        return;
      }
      if (g.phase === 'vote' && p.vote == null && p.mine != null && g.show) later(mem, v, 'vote', () => {
        const rows = g.show.map(parseShow), ok = rows.map((_, i) => i).filter(i => i !== p.mine && filledOf(rows[i]) > 0);
        if (ok.length) v.act('vote', pickBest(ok, i => fitOf(theme, rows[i]) + c.rng() * 2, sk, c.rng));
      }, readDelay(sk, c.rng, 3) + c.rng() * 2);
    },
  };
}
