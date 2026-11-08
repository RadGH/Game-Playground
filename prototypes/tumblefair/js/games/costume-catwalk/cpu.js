// Costume Catwalk CPU: dresses slot by slot at a person's pace, picking from its tray the piece that suits the theme
// and the printed judge rule (one colour, many colours or on-theme), picks a pose and says ready; in the vote it picks
// someone else's look, leaning to the most on-theme one. Family often grabs whatever looks fun; Tricky usually
// takes the piece that helps most and is ready sooner (ties on the rule go to whoever finished first).
import { by, readDelay, later, pickBest } from '../cpu-kit.js';
import { SLOT_IDS, POSES, worn, judgeScore, themeFit } from './pieces.js';

export function createCpu(c) {
  const sk = c.skill, mem = { slot: 0 };
  const per = by(sk, [2.2, 1.5, 1.1]);
  return {
    tick(v) {
      const g = v.g, p = v.priv, init = v.init; if (!g || !p || !init) return;
      if (g.phase === 'dress') {
        mem.next ??= v.t + readDelay(sk, c.rng, 1.5);
        if (v.t < mem.next || p.done) return;
        mem.next = v.t + per * (0.7 + c.rng() * 0.6);
        if (mem.slot < SLOT_IDS.length) {
          const s = SLOT_IDS[mem.slot++], opts = (p.tray[s] || []).map((_, i) => i);
          if (!opts.length) return;
          const score = i => { const o = { ...p.outfit, [s]: i }, l = worn(p.tray, o); return judgeScore(init.judge.id, init.theme, l) + themeFit(init.theme, l) * 0.5; };
          v.act('wear', { s, i: pickBest(opts, score, sk, c.rng) });
        } else if (mem.slot === SLOT_IDS.length) { mem.slot++; v.act('pose', Math.floor(c.rng() * POSES.length)); }
        else v.act('done', true);
        return;
      }
      if (g.phase === 'vote' && p.vote == null && p.mine != null) later(mem, v, 'vote', () => {
        const show = g.show || [], opts = show.map((_, i) => i).filter(i => i !== p.mine);
        if (!opts.length) { if (show.length === 2) v.act('vote', 'both'); return; }
        v.act('vote', pickBest(opts, i => themeFit(init.theme, show[i].o) + c.rng(), sk, c.rng));
      }, readDelay(sk, c.rng, 2.5));
    },
  };
}
