// Word Relay CPU: knows a vocabulary of common words (Family a small one, Tricky a big one), thinks for a moment,
// then "types" a word that starts with the letter and obeys the rule, remembering every word already played. Typing
// takes time per letter; now and then it sends one that breaks the rule and has to try again. Tricky finds longer
// words faster.
import { by, pick, gauss, slip } from '../cpu-kit.js';
import { RULE } from './sim.js';
import { WORDS } from './words.js';

let LIST = null;
export function createCpu(c) {
  const sk = c.skill, mem = { used: new Set() }, known = by(sk, [2000, 3500, 6000]);
  LIST ||= WORDS.split(' ');
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      for (const ch of g.chain || []) mem.used.add(ch[0]);
      for (const x of g.got || []) mem.used.add(x[1]);
      if (g.prev) mem.used.add(g.prev);
      if (g.phase !== 'go' || (g.got || []).some(x => x[0] === c.pid)) { mem.key = null; return; }
      const key = g.link + g.letter + g.rule;
      if (mem.key !== key) { mem.key = key; mem.at = v.t + Math.max(1.2, by(sk, [4.6, 4, 3.6]) + gauss(c.rng) * 1.8); mem.tries = 0; mem.word = null; }
      if (mem.word && v.t >= mem.sendAt) { v.act('word', mem.word); mem.word = null; mem.at = v.t + 0.5 + c.rng() * 0.6; return; }   // sent (a refused one: think again)
      if (mem.word || v.t < mem.at || mem.tries >= 3) return;
      const t = RULE[g.rule]?.test || (() => true), fits = [];
      for (let i = 0; i < known; i++) { const w = LIST[i]; if (w[0] === g.letter && w.length >= 3 && t(w) && !mem.used.has(w)) fits.push(w); }
      let w;
      if (slip(sk, c.rng, 0.6) || !fits.length) {                    // a slip: a word that starts right but breaks the rule
        const near = []; for (let i = 0; i < 2000; i++) if (LIST[i][0] === g.letter && !mem.used.has(LIST[i])) near.push(LIST[i]);
        w = near.length ? pick(near, c.rng) : g.letter + 'aaa';
      } else {
        fits.sort((a, b) => b.length - a.length);
        w = pick(fits.slice(0, Math.max(1, Math.ceil(fits.length * by(sk, [0.8, 0.5, 0.35])))), c.rng);
      }
      mem.tries++; mem.word = w;
      mem.sendAt = v.t + 0.4 + w.length * by(sk, [0.26, 0.2, 0.17]);   // typing it
    },
  };
}
