// Auction of Chaos CPU: reads each lot's clue the way a person would (a little table of what a clue sounds like: good
// luck, bad luck, gone again, hurts the others) and spreads its chips over the lots by how good they look, then bids
// and locks in. Family mostly ignores the clues and bids on the paper value; Tricky reads them and saves for the best.
import { by, gauss } from '../cpu-kit.js';

const READS = [
  [/signature|warm to the touch|x marks|rattles/i, v => v + 6],
  [/smells|too softly|heavy is the head/i, v => Math.max(0, v - 8)],
  [/gift|addressed|comes back/i, () => 0],
  [/purse|every coin/i, v => v + 3],
  [/gambler|big spenders/i, v => v + 4],
  [/neighbours|wakes|tricks on rivals/i, v => v + 2],
  [/appetite|whatever you do|slippery|melts|glowing|zaps|snacks/i, v => Math.max(1, v - 3)],
  [/hates|away from|nervous|can.t|animals hate/i, v => v - 1],
];
const readClue = it => { for (const [re, f] of READS) if (re.test(it.clue || '')) return f(it.v); return it.v; };

export function createCpu(c) {
  const sk = c.skill, mem = {}, lots = c.init?.lots || [];
  const reads = by(sk, [0.1, 0.6, 0.9]);
  const worth = lots.map(it => c.rng() < reads ? readClue(it) : it.v);
  return {
    tick(v) {
      const g = v.g; if (!g || g.phase !== 'bid') return;
      if (mem.lot !== g.lot) { mem.lot = g.lot; mem.at = v.t + 0.8 + sk.react * (1 + c.rng() * 3); mem.done = false; }
      if (mem.done || v.t < mem.at) return;
      mem.done = true; mem.allIn = c.rng() < by(sk, [0.3, 0.8, 1]);
      const chips = g.chips?.[c.pid] ?? 0, rest = worth.slice(g.lot), sum = rest.reduce((s, x) => s + Math.max(0, x), 0) || 1;
      const share = Math.max(0, worth[g.lot]) / sum, bold = by(sk, [1.2, 1.15, 1.1]);
      let bid = Math.round(Math.max(0, chips * share * bold + gauss(c.rng) * by(sk, [3, 1.2, 0.8])));
      if (g.lot === lots.length - 1 && mem.allIn) bid = worth[g.lot] > 0 ? chips : 0;                // chips left are worth nothing
      v.act('bid', Math.max(0, Math.min(chips, bid)));
      v.act('lock', true);
    },
  };
}
