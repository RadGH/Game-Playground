// Higher or Lower CPU: calls the likelier side for the card showing and banks when the pot it would risk outweighs
// what a right call adds. Tricky counts the cards already seen (two of each in the deck); Normal judges from the card
// alone; Family goes on a hunch more often and banks late.
import { by, later, readDelay, slip, pick } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, mem = { seen: [] };
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      if (g.phase === 'reveal' && g.reveal && mem.rf !== g.flip) { mem.rf = g.flip; if (!mem.seen.length) mem.seen.push(g.reveal.from); mem.seen.push(g.reveal.to); }
      if (g.phase !== 'pick') return;
      later(mem, v, 'f' + g.flip, () => {
        const card = g.card, pot = g.pot?.[c.pid] || 0, streak = g.streak?.[c.pid] || 0;
        // what is left in the deck, as far as I know
        const left = []; for (let v2 = 1; v2 <= 13; v2++) for (let n = 0; n < 2; n++) left.push(v2);
        if (sk.level >= 2) { for (const s of [...mem.seen, card]) { const i = left.indexOf(s); if (i >= 0) left.splice(i, 1); } }
        else { const i = left.indexOf(card); if (i >= 0) left.splice(i, 1); }
        const hi = left.filter(x => x > card).length / left.length, lo = left.filter(x => x < card).length / left.length;
        const side = hi >= lo ? 'hi' : 'lo', p = Math.max(hi, lo);
        if (slip(sk, c.rng, 1.2)) { v.act('pick', pick(pot > 3 ? ['hi', 'lo', 'bank'] : ['hi', 'lo'], c.rng)); return; }
        const risk = (1 - p) * pot * by(sk, [0.6, 1, 1.15]), gain = p * (streak + 1);
        v.act('pick', pot > 0 && risk > gain ? 'bank' : side);
      }, readDelay(sk, c.rng, 1));
    },
  };
}
