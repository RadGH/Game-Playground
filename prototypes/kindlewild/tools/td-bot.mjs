// Tower Defense balance check: idle must lose, a sensible builder must get through. node tools/td-bot.mjs [seeds] [waves]
// The builder rings the road near the keep with what it can afford, buys a wall baffle early, and upgrades when flush.
import { loadData } from '../tests/load.mjs';
import { prepareData } from '../js/game/session.js';
import { newGame } from '../js/game/modes.js';

const d = prepareData(loadData());
const player = { mana: { max: 150, regenScale: 1, faithScale: 1 }, unlocked: [], spellLevels: {}, discovered: [] };

export function playTd({ seed = 1, difficulty = 'fair', length = 20, bot = true, recipe = 'greenvale', size = 'medium', maxWaveSecs = 200 }) {
  const s = newGame(d, { type: 'td', seed, difficulty, length, recipe, size }, player);
  s.placeBase(...s.suggestBase());
  const T = s.sim.td, run = s.run;
  const want = ['archer', 'cannon', 'frost', 'archer', 'flame', 'ballista', 'mint', 'storm', 'cannon', 'archer', 'arcane', 'ballista', 'storm', 'frost', 'beacon', 'cannon', 'storm', 'arcane'];
  let n = 0, tick = 0;
  const limit = 30 * maxWaveSecs * (length + 2);
  while (!s.result && tick++ < limit) {
    s.step();
    if (bot && tick % 30 === 0) {
      const path = T.path[0] || [];
      if (T.structures.length === 0 && T.gold >= 25) {
        // a baffle: a wall across the road, 30 steps out, so they have to walk round it
        const p = path[Math.max(0, path.length - 22)];
        if (p) for (let k = -5; k <= 5; k++) run.build('wall', p.x + k * 3, p.y, {});
      }
      const id = want[n % want.length], K = d.structures.kinds[id];
      if ((K.fromWave ?? 0) <= T.wave + 1 && T.gold >= K.cost) {
        for (let k = 0; k < 60; k++) {
          const p = path[Math.max(0, path.length - 8 - k * 3 - n)] || path[0];
          if (!p) break;
          const off = 8 + (k % 3) * 4, a = k * 2.4;
          if (run.build(id, p.x + Math.cos(a) * off, p.y + Math.sin(a) * off, {}).ok) { n++; break; }
        }
      } else if (T.gold > 200) {
        const st = T.structures.find(q => q.K.fire && q.K.fire !== 'mend' && q.tier < 3);
        if (st) run.upgrade(st);
      }
    }
  }
  return { wave: T.wave, lives: T.lives, won: !!s.result?.won, gold: T.gold, towers: T.structures.length, secs: Math.round(tick / 30) };
}
if (process.argv[1].endsWith('td-bot.mjs')) {
  const seeds = +process.argv[2] || 3, waves = +process.argv[3] || 20;
  for (const difficulty of ['gentle', 'fair', 'fierce']) {
    const idle = playTd({ seed: 1, difficulty, length: waves, bot: false });
    console.log(difficulty, 'idle', JSON.stringify(idle));
    for (let seed = 1; seed <= seeds; seed++) console.log(difficulty, 'bot ', seed, JSON.stringify(playTd({ seed, difficulty, length: waves })));
  }
}
