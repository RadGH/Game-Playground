// Caption Clash CPU: picks a caption from the kit's family-friendly list (or a starter line), types it in at a
// person's pace and submits; in the vote it picks someone else's caption, leaning to the one it likes. Skill is how
// well it plays the printed judge rule: Tricky picks the caption that suits the rule best and finishes quickly
// (ties on the rule go to whoever finished first); Family takes whatever comes to mind and takes its time.
import { by, CAPTIONS, readDelay, later, pickBest } from '../cpu-kit.js';
import { judgeScore } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = { typed: 0 };
  const cps = by(sk, [4, 6, 8]);                                 // characters a second
  return {
    tick(v) {
      const g = v.g, p = v.priv; if (!g || !p) return;
      if (g.phase === 'write') {
        if (mem.text == null) {
          const pool = CAPTIONS.slice().sort(() => c.rng() - 0.5).slice(0, 6).concat(p.starters?.length && c.rng() < 0.3 ? [p.starters[0]] : []);
          mem.text = pickBest(pool, s => judgeScore(v.init?.judge?.id, s), sk, c.rng);
          mem.next = v.t + readDelay(sk, c.rng, 3);
        }
        if (v.t < mem.next || p.done) return;
        if (mem.typed < mem.text.length) { mem.typed = Math.min(mem.text.length, mem.typed + Math.ceil(cps * 0.8)); v.act('cap', mem.text.slice(0, mem.typed)); mem.next = v.t + 0.8; return; }
        later(mem, v, 'done', () => v.act('done', true), 0.6 + c.rng());
        return;
      }
      if (g.phase === 'vote' && p.vote == null && p.mine != null) later(mem, v, 'vote', () => {
        const caps = g.caps || [], opts = caps.map((_, i) => i).filter(i => i !== p.mine);
        if (!opts.length) { if (caps.length) v.act('vote', 'both'); return; }
        v.act('vote', opts[Math.floor(c.rng() * opts.length)]);
      }, readDelay(sk, c.rng, 3 + c.rng() * 3));
    },
  };
}
