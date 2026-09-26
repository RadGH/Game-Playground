// Builds a fresh Game object (docs/10 §4.2) and loads rooms into it. Pure.
import { createBus } from './bus.js';
import { createRng, hashSeed } from './rng.js';
import { compileRoom } from '../world/roomload.js';
import { createParticles } from '../entities/particles.js';
import { createRain, createRipples } from '../world/rain.js';
import { createPlayerBody } from '../entities/player.js';

export function createGame({ data, mode = 'campaign', seed = 1, save = null }) {
  const game = {
    data, mode, seed, tick: 0, freezeTicks: 0, time: 0,
    rng: { loot: createRng(hashSeed(seed, 'loot')), spell: createRng(hashSeed(seed, 'spell')), ai: createRng(hashSeed(seed, 'ai')), talk: createRng(hashSeed(seed, 'talk')) },
    bus: createBus(), room: null, world: null, grid: null, entities: [], particles: createParticles(4000),
    player: null, hero: save?.hero || null, flags: { swimming: false }, story: {}, perf: {}, lights: [],
  };
  return game;
}

/** Compile and enter a room; places the player at an entry. */
export function enterRoom(game, roomJson, entryId, opts = {}) {
  const c = compileRoom(roomJson, game.data, opts);
  game.room = c; game.world = c.world; game.grid = c.grid; c.world.skyTop = c.skyTop;
  game.entities = []; game.particles.n = 0; game.particles.counts.fill(0);
  const rain = roomJson.rain || {};
  game.rain = createRain(c.world, { density: rain.density ?? 90, wind: rain.wind ?? 0.15, deposit: rain.deposit, maxDeposit: rain.maxDeposit });
  c.world.wind = game.rain.wind;
  game.rain.drips = [...game.rain.findDrips(), ...c.things.filter(t => t.t === 'drip').map(t => ({ x: t.at[0], y: t.at[1], every: t.every || [1.2, 4], t: Math.random() }))];
  game.ripples = createRipples(c.grid.W);
  const entry = c.entries[entryId] || Object.values(c.entries)[0] || { at: [40, 40], face: 'r' };
  if (!game.player) game.player = createPlayerBody(entry.at[0], entry.at[1] + 1, opts.cls);
  const p = game.player; p.x = entry.at[0]; p.y = entry.at[1] + 1; p.px = p.x; p.py = p.y; p.vx = 0; p.vy = 0; p.facing = entry.face === 'l' ? -1 : 1; p.fallStartY = p.y;
  game.bus.emit('room.enter', { roomId: roomJson.id, entryId });
  return c;
}
