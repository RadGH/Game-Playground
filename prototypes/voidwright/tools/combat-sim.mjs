// Combat sims (owner 2026-11-13: "do some combat sims"): the ship a player is likely flying at each danger level vs
// every faction there, in each group shape (pack / big / gnats). A player-like pilot (closes nose-first, weaves at a
// stand-off, holds fire, fires missiles). Prints win %, time to win, hull left, deaths.
//   node tools/combat-sim.mjs [runs=12] [only-danger]
import { createWorld, step } from '../js/sim/world.js';
import { spawnGroup } from '../js/sim/galaxy.js';
import { buildPremade } from '../js/sim/shipgen.js';
import { factionsForTier } from '../js/data/factions.js';
import { rng } from '../js/core/math.js';

// the ship you are probably in at each danger (hulls.js prices vs what each danger pays)
export const LADDER = { 1: ['sparrow', 'wasp'], 2: ['hornet', 'falcon'], 3: ['falcon', 'bastion'], 4: ['bastion', 'kestrel'], 5: ['lancer', 'harrow'], 6: ['lancer', 'paladin'], 7: ['paladin'], 8: ['sovereign'], 9: ['sovereign', 'aviary'], 10: ['leviathan'] };

export function fight(design, faction, tier, mode, seed) {
  const w = createWorld({ seed, game: { credits: 0, cargo: {}, goods: {}, parts: [], rep: {} } });
  const P = buildPremade(design); w.bodies.push(P); w.player = P;
  const g = spawnGroup(w, { x: 700 + P.r, y: 0 }, faction, tier, rng(seed * 31 + 7), mode);
  const ranges = P.turrets.filter(x => x.w.mode !== 'tool' && x.w.range).map(x => x.w.range).sort((a, b) => a - b);
  const reach = ranges.length ? ranges[Math.floor(ranges.length / 2)] : 260;
  let t = 0;
  for (; t < 150; t += 1 / 60) {
    const T = g.filter(s => !s.dead).sort((a, b) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y))[0];
    if (!T || P.dead) break;
    // a player-like pilot: close in nose-first (the nose follows travel, so fixed guns point at the target), then
    // weave across it at a stand-off a little outside the target's hull; a bit of sideways drift dodges shots
    const dx = T.x - P.x, dy = T.y - P.y, d = Math.hypot(dx, dy) || 1;
    // stand off inside the reach of most of your guns (a skiff's gatlings reach ~250, a capital's ~600+)
    const stand = Math.max(120, reach * 0.75) + T.r * 0.6;
    const want = Math.max(-1, Math.min(1, (d - stand) / 150)); const ox = -dy / d, oy = dx / d;
    const side = Math.sin(t * 0.9) * (d < stand * 1.3 ? 0.6 : 0.2);
    step(w, 1 / 60, { mx: dx / d * want + ox * side, my: dy / d * want + oy * side, ax: T.x, ay: T.y, fire: true, missile: true, lock: T });
    w.events.length = 0; w.notes.length = 0;
  }
  const win = !P.dead && g.every(s => s.dead);
  return { win, died: P.dead, t, hp: P.dead ? 0 : P.stats.hp / P.stats.maxHp, n: g.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runs = +(process.argv[2] || 12); const only = +(process.argv[3] || 0);
  console.log('danger  ship        faction   mode    win%  died  time  hull-left  enemies');
  for (let tier = 1; tier <= 10; tier++) {
    if (only && tier !== only) continue;
    for (const design of LADDER[tier]) for (const faction of factionsForTier(tier)) for (const mode of ['pack', 'big', 'gnats']) {
      let wins = 0, died = 0, ts = 0, hp = 0, n = 0;
      for (let k = 0; k < runs; k++) { const r = fight(design, faction, tier, mode, 1000 * tier + k + 1); n += r.n; if (r.win) { wins++; ts += r.t; hp += r.hp; } if (r.died) died++; }
      console.log(`${String(tier).padEnd(7)} ${design.padEnd(11)} ${faction.padEnd(9)} ${mode.padEnd(7)} ${String(Math.round(wins / runs * 100)).padStart(4)}  ${String(died).padStart(4)}  ${(wins ? ts / wins : 0).toFixed(0).padStart(4)}s  ${String(Math.round(wins ? hp / wins * 100 : 0)).padStart(6)}%   ${(n / runs).toFixed(1)}`);
    }
  }
}
