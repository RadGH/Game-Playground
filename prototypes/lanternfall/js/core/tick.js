// The tick order (docs/06 §4.1). One call = one 1/60 s step of the whole game. Pure.
import { stepCells } from '../world/cellsim.js';
import { stepThermal } from '../world/thermal.js';
import { stepLiquids, stepBasin } from '../world/liquids.js';
import { stepParticles, PK } from '../entities/particles.js';
import { stepPlayerMovement } from '../entities/player.js';

export const DT = 1 / 60;

export function tickGame(game, intent, view) {
  if (game.freezeTicks > 0) { game.freezeTicks--; return; }
  game.tick++; game.time += DT;
  const w = game.world, p = game.player;
  // 1-5: input, wiring, spells, AI, player
  if (p) stepPlayerMovement(game, p, intent);
  for (const s of game.systems || []) s(game, intent);
  // 6-9: cells
  const simView = view ? { x0: view.x0 - 96, y0: view.y0 - 96, x1: view.x1 + 96, y1: view.y1 + 96 } : null;
  stepCells(w, simView); stepThermal(w); stepLiquids(w);
  for (const b of game.room.basins) stepBasin(w, b);
  // 12: rain, drips, particles
  if (view) game.rain.step(game.particles, view, DT, game.ripples);
  stepParticles(game.particles, w, DT, {
    onRainHit: (x, y, px, py, m, kind) => {
      const r = game.rain.onHit(x, y, px, py, m, kind, game.ripples);
      if (Math.random() < 0.7) for (let k = 0; k < 2; k++) game.particles.spawn(PK.SPLASH, px + 0.5, py + 0.5, (Math.random() - 0.5) * 120, -40 - Math.random() * 60, 0.25, r === 'splashL' ? 0x6f9fd8 : 0x8fa6c4, 0, 900);
    },
    debrisBudget: () => (game._debris = (game._debris || 0) + 1) < 60,
    mothTarget: game.mothTarget,
  });
  if (game.tick % 60 === 0) game._debris = 0;
  game.ripples.step();
  game.bus.flush();
}
