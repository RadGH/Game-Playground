// Tower Defense balance check. node tools/td-bot.mjs [seeds] [waves] [difficulty...]
//   idle  = builds nothing: must lose on wave 1-3.
//   lazy  = two Archers by the road, upgraded as far as the gold goes (owner 2026-11-04: "you can just build 2 archer towers
//           and survive until wave 18"): must fall by about wave 8 on Fair.
//   bot   = a sensible builder: a wall baffle, a mix of towers along the road (armour-piercing ones once armour turns up),
//           air cover, upgrades when flush. Should get well into the waves on Fair, and win Gentle 20 some of the time.
import { loadData } from '../tests/load.mjs';
import { prepareData } from '../js/game/session.js';
import { newGame } from '../js/game/modes.js';

const d = prepareData(loadData());
const player = { mana: { max: 150, regenScale: 1, faithScale: 1 }, unlocked: [], spellLevels: {}, discovered: [] };

const MIX = ['archer', 'cannon', 'spikes', 'archer', 'arbalest', 'frost', 'tar', 'flame', 'venom', 'archer', 'mint', 'arbalest', 'storm', 'sun', 'cannon', 'spikes',
  'venom', 'ballista', 'arbalest', 'arcane', 'trebuchet', 'storm', 'beacon', 'venom', 'arbalest', 'sun', 'trebuchet', 'arcane', 'storm', 'arbalest'];

export function playTd({ seed = 1, difficulty = 'fair', length = 20, strategy = 'bot', recipe = 'greenvale', size = 'medium', maxWaveSecs = 240, hook = null }) {
  const s = newGame(d, { type: 'td', seed, difficulty, length, recipe, size }, player);
  s.placeBase(...s.suggestBase());
  const T = s.sim.td, run = s.run;
  const after = hook?.(s);
  let n = 0, tick = 0;
  const limit = 30 * maxWaveSecs * (length + 2);
  // every road gets towers in turn (a second gate opens on wave 8 on Fair, and it needs covering too)
  let road = 0;
  const along = (id, back) => {
    const live = T.path.filter(l => l.length);
    const path = live[road++ % Math.max(1, live.length)] || [];
    const K = d.structures.kinds[id];
    for (let k = 0; k < 80; k++) {
      const p = path[Math.max(0, path.length - back - k * 3)] || path[0];
      if (!p) return false;
      if (K.group === 'trap') { if (run.build(id, p.x, p.y, {}).ok) return true; continue; }
      const off = 8 + (k % 3) * 4, a = k * 2.4;
      if (run.build(id, p.x + Math.cos(a) * off, p.y + Math.sin(a) * off, {}).ok) return true;
    }
    return false;
  };
  while (!s.result && tick++ < limit) {
    s.step();
    if (tick % 30 || strategy === 'idle') continue;
    if (strategy === 'lazy') {
      if (T.structures.length < 2 && T.gold >= d.structures.kinds.archer.cost) along('archer', 10);
      else { const st = T.structures.find(q => q.tier < d.structures.upgrade.max); if (st) run.upgrade(st); }
      continue;
    }
    const path = T.path[0] || [];
    if (T.structures.length === 0 && T.gold >= 25) {
      // a baffle: a wall across the road, 30 steps out, so they have to walk round it
      const p = path[Math.max(0, path.length - 22)];
      if (p) for (let k = -5; k <= 5; k++) run.build('wall', p.x + k * 3, p.y, {});
    }
    const id = MIX[n % MIX.length], K = d.structures.kinds[id];
    if ((K.fromWave ?? 0) > T.wave + 1) { n++; continue; }
    if (T.gold >= K.cost) { if (along(id, 8 + (n % 12) * 2)) n++; else n++; }
    else if (T.gold > 260) {
      const st = T.structures.filter(q => q.K.fire && q.K.fire !== 'mend' && q.tier < d.structures.upgrade.max).sort((a, b) => a.tier - b.tier)[0];
      if (st) run.upgrade(st);
    }
  }
  after?.();
  return { wave: T.wave, lives: T.lives, won: !!s.result?.won, gold: T.gold, towers: T.structures.length, secs: Math.round(tick / 30) };
}
if (process.argv[1]?.endsWith('td-bot.mjs')) {
  const seeds = +process.argv[2] || 3, waves = +process.argv[3] || 20;
  const diffs = process.argv.slice(4).length ? process.argv.slice(4) : ['gentle', 'fair', 'fierce'];
  for (const difficulty of diffs) {
    console.log(difficulty, 'idle', JSON.stringify(playTd({ seed: 1, difficulty, length: waves, strategy: 'idle' })));
    for (let seed = 1; seed <= seeds; seed++) console.log(difficulty, 'lazy', seed, JSON.stringify(playTd({ seed, difficulty, length: waves, strategy: 'lazy' })));
    for (let seed = 1; seed <= seeds; seed++) console.log(difficulty, 'bot ', seed, JSON.stringify(playTd({ seed, difficulty, length: waves })));
  }
}
