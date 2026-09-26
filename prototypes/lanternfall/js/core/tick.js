// The tick order (docs/06 §4.1). One call = one 1/60 s step of the whole game. Pure.
import { stepCells } from '../world/cellsim.js';
import { stepThermal } from '../world/thermal.js';
import { stepLiquids, stepBasin, stepShock } from '../world/liquids.js';
import { stepParticles, PK } from '../entities/particles.js';
import { stepPlayerMovement } from '../entities/player.js';
import { stepCasting } from '../spells/cast.js';
import { stepSpells, stepSpellLeftovers } from '../spells/instances.js';
import { stepActorPhysics } from '../entities/actor.js';
import { stepStatuses } from '../rpg/status.js';
import { lanternPos } from '../render/frame.js';
import { collectLights } from '../world/lightgrid.js';
import { stepCurrents, stepFloodline } from '../world/currents.js';
import { stepAI } from '../ai/brain.js';
import { stepVoidZones } from '../rpg/voidzones.js';
import { stepMelee } from '../rpg/melee.js';
import { stepBosses } from '../ai/bosses.js';

export const DT = 1 / 60;

export function tickGame(game, intent, view) {
  if (game.freezeTicks > 0) { game.freezeTicks--; return; }
  game.tick++; game.time += DT;
  const w = game.world, p = game.player;
  // 1-5: input, wiring, spells, AI, player
  if (p) {
    if (!p.dead) stepPlayerMovement(game, p, intent);
    p.lantern = lanternPos(p, p.x, p.y);
    p.stillT = Math.abs(p.vx) < 1 && p.grounded ? (p.stillT || 0) + DT : 0;
    if (intent.pressed?.build && game.builder) { const on = game.builder.toggle(); game.bus.emit(on ? 'build.on' : 'build.off', {}); }
    p.canCast = !p.dead && p.state !== 'ledge' && !p.carry && !game.builder?.on;
    if (game.builder?.on) game.builder.step(intent, game.aim || { x: p.x, y: p.y });
    if (p.cast && game.hero) stepCasting(game, p, intent, game.aim || { x: p.x + p.facing * 60, y: p.y - 10 });
    if (p.melee && !p.dead) stepMelee(game, p, intent);
    stepStatuses(game, p, DT);
    if (p.hurtT > 0) p.hurtT -= DT; if (p.invuln > 0) p.invuln -= DT;
  }
  if (game.things) game.things.step();
  // exits: touching an exit rect asks main.js to change room (it loads the next room's JSON)
  if (p && !game.pendingExit && !p.dead && !game.arenaLocked) for (const x of game.room.exits) { const [rx, ry, rw, rh] = x.rect; if (p.x + 3 > rx && p.x - 3 < rx + rw && p.y > ry && p.y - p.h < ry + rh && !(x.requires && !game.flags[x.requires])) { game.pendingExit = x; break; } }
  // interaction: nearest interactable gets a prompt; E acts (hold E for valves / cranks)
  if (p && game.things && !p.dead) {
    const T = game.things.interactTarget(p);
    game.prompt = T ? { x: T.x, y: T.y - (T.def.rect ? T.def.rect[3] : 12), text: verbFor(T), key: 'E' } : null;
    if (T && intent.pressed?.interact) { const r = game.things.interact(T, false); if (r?.refused) game.prompt.refused = true; }
    else if (T && intent.interact) game.things.interact(T, true);
  }
  for (const s of game.systems || []) s(game, intent);
  stepAI(game);
  stepBosses(game);
  stepSpells(game);
  stepVoidZones(game);
  game.noises = [];
  for (const e of game.entities) stepActorPhysics(game, e);
  stepSpellLeftovers(game);
  game.entities = game.entities.filter(e => !e.dead || e.deadT < (e.corpseTime ?? 1.2));
  // 6-9: cells
  const simView = view ? { x0: view.x0 - 96, y0: view.y0 - 96, x1: view.x1 + 96, y1: view.y1 + 96 } : null;
  stepCells(w, simView); stepThermal(w); stepLiquids(w); stepShock(w);
  for (const b of game.room.basins) stepBasin(w, b);
  if (game.currents?.length) stepCurrents(game, game.currents);
  for (const f of game.floodlines || []) stepFloodline(game, f);
  // 10-11: support queue -> fragments; fragments fall
  if (game.support) { for (const grp of game.support.process(12000)) game.fragments.detach(grp); game.fragments.step([p, ...game.entities].filter(Boolean)); }
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
  if (game.lightGrid && game.tick % 4 === 0) { if (game.tick % 60 === 0) game.lightGrid.rebuildOpacity(); game.lightGrid.update(collectLights(game)); }
  game.bus.flush();
}

function verbFor(T) {
  switch (T.t) {
    case 'lever': return T.locked ? 'Locked' : 'Pull lever'; case 'valve': return 'Turn wheel (hold)'; case 'door': return T.latched ? 'Close' : 'Open';
    case 'lamp_post': return T.lit ? 'Rest' : 'Light the lamp-post'; case 'rekindle': return 'Rekindle this room'; case 'chest': return 'Open';
    case 'npc': return 'Talk'; case 'shopkeeper': return 'Trade'; case 'sign': return 'Read'; case 'lift': return T.def.crank ? 'Crank (hold)' : 'Call lift';
    case 'crate': return 'Push'; case 'oil_barrel': return T.leak > 0 ? 'Refuel' : 'Oil barrel'; case 'great_lamp': return T.lit ? 'The Lamp burns' : 'Relight the Great Lamp'; case 'bell': return 'Ring';
    case 'lamp_socket': return T.lit ? 'Lit' : 'Light'; default: return 'Use';
  }
}
