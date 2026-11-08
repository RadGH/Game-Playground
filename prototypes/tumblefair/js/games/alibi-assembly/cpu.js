// Alibi Assembly CPU (co-op): fills its own slots of the alibi after a moment's thought, memorises the finished story
// while it is shown (each piece sticks with a skill-sized chance), then answers the Inspector from memory at a reading
// pace — for a "So you were … and …?" question it checks both details against what it remembers. A forgotten piece
// is a guess. Family forgets more and answers slowly.
import { by, later, readDelay, pick } from '../cpu-kit.js';
import { SLOTS } from './data.js';
import { clause } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, slots = c.init?.slots || [], mem = { recall: null };
  const yn = slots.map(s => SLOTS.find(x => x.ask === s.ask && x.label === s.label)?.yn || null);
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      if (g.phase === 'build') {
        slots.forEach((s, i) => { if (s.owner === c.pid && g.picks?.[i] == null) later(mem, v, 'pick' + i, () => v.act('pick', { s: i, o: Math.floor(c.rng() * s.opts.length) }), readDelay(sk, c.rng, 2 + i * 1.5)); });
        return;
      }
      if (g.phase === 'study' && g.picks && !mem.recall) mem.recall = g.picks.map(p => (c.rng() < by(sk, [0.62, 0.8, 0.93]) ? p : null));
      const q = v.priv?.q; if (g.phase !== 'ask' || !q) return;
      later(mem, v, 'q' + v.priv.qi, () => {
        const R = mem.recall || [];
        let o;
        const si = slots.findIndex(s => s.ask === q.text);
        if (si >= 0) o = R[si] != null ? Math.max(0, q.opts.indexOf(slots[si].opts[R[si]])) : Math.floor(c.rng() * q.opts.length);
        else {                                                         // "So … and …?": does every detail I remember match?
          let clash = false, sure = false;
          slots.forEach((s, i) => s.opts.forEach((x, j) => { if (yn[i] && q.text.includes(clause({ yn: yn[i] }, x))) { if (R[i] == null) return; sure = true; if (R[i] !== j) clash = true; } }));
          o = clash ? 1 : sure ? 0 : pick([0, 1], c.rng);
        }
        v.act('ans', { i: v.priv.qi, o });
      }, readDelay(sk, c.rng, by(sk, [1.6, 1.1, 0.8])));
    },
  };
}
