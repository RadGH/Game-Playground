// Monster Forecast CPU: reads the monster's tell against the cheat sheet (both on screen) and picks the matching answer
// a moment after the strike window opens. Skill sets how often it reads it right, how often a fake-out tricks it into
// answering the FIRST tell, and how slow it is (a very slow Family pick can miss the window).
import { by } from '../cpu-kit.js';
import { MONSTERS, ANSWERS } from './monsters.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  const mon = MONSTERS.find(m => m.id === c.init?.monster);
  const answerFor = tell => mon?.moves.find(m => m.tells.includes(tell))?.answer;
  return {
    tick(v) {
      const g = v.g; if (!g || (g.phase !== 'tell' && g.phase !== 'pick') || !g.cues) return;
      if (mem.r !== g.round) mem.r = g.round, mem.at = null, mem.done = false;
      if (mem.done) return;
      if (g.phase === 'pick' && mem.at == null) mem.at = v.t + sk.react * (0.6 + c.rng() * by(sk, [1.6, 1.1, 0.8])) + by(sk, [0.35, 0.15, 0.05]);
      if (mem.at == null || v.t < mem.at) return;
      mem.done = true;
      const tier = g.tier || 1, cues = g.cues;
      let pick = answerFor(cues[cues.length - 1][0]);
      if (cues.length > 1 && c.rng() < by(sk, [0.45, 0.25, 0.12])) pick = answerFor(cues[0][0]);           // fooled by the fake-out
      if (c.rng() < by(sk, [0.14, 0.06, 0.03]) * tier) pick = ANSWERS[Math.floor(c.rng() * 3)];            // misread
      v.act('pick', pick || ANSWERS[Math.floor(c.rng() * 3)]);
    },
  };
}
