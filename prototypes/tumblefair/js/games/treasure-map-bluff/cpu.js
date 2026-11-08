// Treasure Map Bluff CPU: reads its piece of the map, posts a claim (seeing the treasure, it usually lies to keep the
// pot; otherwise it often warns about a trap it saw), waits a few seconds to read the others' claims, then picks: the
// treasure if it saw it, else the unseen route that looks best, believing claims only as far as its skill says
// (Tricky doubts "treasure is on X!" and believes trap warnings more; Family believes everything and picks loosely).
import { by, pickBest, readDelay, later } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  const doubtGold = by(sk, [0, 0.5, 0.8]), lie = by(sk, [0.3, 0.6, 0.75]);
  return {
    tick(v) {
      const g = v.g, p = v.priv; if (!g || g.phase !== 'plan' || !p?.see) return;
      const R = g.round, see = p.see, seen = Object.keys(see).map(Number), gold = seen.find(r => see[r] === 'gold');
      const trap = seen.find(r => see[r] === 'trap'), unseen = [0, 1, 2, 3].filter(r => !seen.includes(r));
      later(mem, v, 'say' + R, () => {
        if (gold != null && c.rng() < lie) v.act('say', c.rng() < 0.5 ? { k: 'gold', r: unseen[Math.floor(c.rng() * unseen.length)] } : { k: 'trap', r: gold });
        else if (trap != null && c.rng() < 0.6) v.act('say', { k: 'trap', r: trap });
        else if (c.rng() < 0.4) v.act('say', { k: c.rng() < 0.5 ? 'trust' : 'share' });
      }, readDelay(sk, c.rng, 1.5));
      later(mem, v, 'pick' + R, () => {
        let r = gold;
        if (r == null) {
          const score = x => {
            let s = 0;
            for (const [who, k, rt] of g.claims || []) {
              if (who === c.pid || rt !== x) continue;
              if (k === 'gold') s += 1 - doubtGold * 1.4;
              if (k === 'trap') s -= 0.6 + doubtGold * 0.6;
              if (k === 'safe') s += 0.3;
              if (k === 'going') s -= 0.2;
            }
            return s;
          };
          r = pickBest(unseen, score, sk, c.rng);
        }
        v.act('pick', r); v.act('lock', true);
      }, 4 + c.rng() * 4);
    },
  };
}
