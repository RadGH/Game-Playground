// Builds a fresh Game object (docs/10 §4.2) and loads rooms into it. Pure.
import { createBus } from './bus.js';
import { createRng, hashSeed } from './rng.js';
import { compileRoom } from '../world/roomload.js';
import { createParticles } from '../entities/particles.js';
import { createRain, createRipples } from '../world/rain.js';
import { createPlayerBody } from '../entities/player.js';
import { createSupport } from '../world/support.js';
import { createFragments } from '../world/fragments.js';
import { createLightGrid } from '../world/lightgrid.js';
import { createCurrents, createFloodline } from '../world/currents.js';
import { spawnEnemy } from '../ai/brain.js';
import { createThings } from '../entities/things.js';
import { castPlan } from '../spells/instances.js';
import { spawnBoss } from '../ai/bosses.js';

export function createGame({ data, mode = 'campaign', seed = 1, save = null }) {
  const game = {
    data, mode, seed, tick: 0, freezeTicks: 0, time: 0,
    rng: { loot: createRng(hashSeed(seed, 'loot')), spell: createRng(hashSeed(seed, 'spell')), ai: createRng(hashSeed(seed, 'ai')), talk: createRng(hashSeed(seed, 'talk')) },
    bus: createBus(), room: null, world: null, grid: null, entities: [], particles: createParticles(4000),
    spells: [], pending: [], fields: [], shockZones: [], flashes: [], arcs: [], climbLines: [],
    player: null, hero: save?.hero || null, castPlan: null, flags: { swimming: false }, story: {}, perf: {}, lights: [],
  };
  game.castPlan = (c, plan, aim, meta) => castPlan(game, c, plan, aim, meta);
  return game;
}

/** Compile and enter a room; places the player at an entry. */
export function enterRoom(game, roomJson, entryId, opts = {}) {
  const c = compileRoom(roomJson, game.data, opts);
  game.room = c; game.world = c.world; game.grid = c.grid; c.world.skyTop = c.skyTop;
  game.entities = []; game.particles.n = 0; game.particles.counts.fill(0); game.spells = []; game.pending = []; game.fields = []; game.shockZones = []; game.flashes = []; game.arcs = []; game.climbLines = [];
  const rain = roomJson.rain || {};
  game.rain = createRain(c.world, { density: rain.density ?? 90, wind: rain.wind ?? 0.15, deposit: rain.deposit, maxDeposit: rain.maxDeposit });
  c.world.wind = game.rain.wind;
  game.rain.drips = [...game.rain.findDrips(), ...c.things.filter(t => t.t === 'drip').map(t => ({ x: t.at[0], y: t.at[1], every: t.every || [1.2, 4], t: Math.random() }))];
  game.ripples = createRipples(c.grid.W);
  c.world.game = game; game.support = createSupport(c.world); game.fragments = createFragments(c.world); c.grid.supportQueue.length = 0;
  game.lightGrid = createLightGrid(c.grid); game.currents = createCurrents(c.things); game.floodlines = (roomJson.floodlines || []).map(createFloodline); game.roomState = game.roomState || {};
  const entry = c.entries[entryId] || Object.values(c.entries)[0] || { at: [40, 40], face: 'r' };
  if (!game.player) game.player = createPlayerBody(entry.at[0], entry.at[1] + 1, opts.cls);
  const p = game.player; p.x = entry.at[0]; p.y = entry.at[1] + 1; p.px = p.x; p.py = p.y; p.vx = 0; p.vy = 0; p.facing = entry.face === 'l' ? -1 : 1; p.fallStartY = p.y;
  // enemies are placed at room load (docs/05 §7.1); killed placed enemies stay dead for the save
  game.act1Grace = roomJson.act === 'act1';
  const diff = game.difficulty || {}; game.tokens = { melee: game.act1Grace ? 1 : (diff.meleeTokens ?? 2), ranged: diff.rangedTokens ?? 2, usedMelee: 0, usedRanged: 0 };
  game.voidZones = []; game.noises = []; game.boss = null; game.arenaLocked = false; if (roomJson.act && roomJson.act !== 'none') game.act = roomJson.act;
  for (const t of c.things) if (t.t === 'boss') { const y = findFloor(c.grid, t.at[0], t.at[1] - 40, t.at[1] + 40) ?? t.at[1]; spawnBoss(game, t.boss, t.at[0], y, t.flag || t.boss); }
  if (game.data.enemies && roomJson.kind !== 'lesson' && roomJson.kind !== 'hub') {
    const rs = game.roomState?.[roomJson.id] || {};
    for (const t of c.things) if (t.t === 'spawn' && t.when !== 'signal' && !rs[t.id]?.cleared) {
      const n = t.count || 1; for (let k = 0; k < n; k++) {
        const [rx, ry, rw, rh] = t.rect || [t.at[0] - 4, t.at[1] - 10, 8, 10];
        const x = rx + (rw * (k + 0.5) / n), y = findFloor(c.grid, x, ry, ry + rh + 40) ?? (ry + rh);
        try { const e = spawnEnemy(game, t.enemy, x, y, { pack: t.id, elite: t.elite, level: t.level }); e.spawnId = t.id; } catch (err) { game.warnings = [...(game.warnings || []), String(err.message)]; }
      }
    }
  }
  // a Rekindle post at the first entry of puzzle / lesson / flood / trap rooms if the author did not place one
  if (['puzzle', 'lesson', 'set_piece', 'trap'].includes(roomJson.kind) || roomJson.tags?.some(t => t === 'trap' || t === 'flood')) {
    if (!c.things.some(t => t.t === 'rekindle')) { const en = Object.values(c.entries)[0]; if (en) c.things.push({ t: 'rekindle', id: 'rekindle_auto', at: [en.at[0] + (en.face === 'l' ? -14 : 14), en.at[1]] }); }
  }
  game.things = createThings(game);
  game.bus.emit('room.enter', { roomId: roomJson.id, entryId });
  return c;
}

export function findFloor(g, x, y0, y1) { x = Math.round(x); for (let y = Math.max(1, Math.round(y0)); y < Math.min(g.H, y1); y++) { const c = g.mats.cls[g.mat[y * g.W + x]]; if ((c === 1 || c === 2) && g.mat[(y - 1) * g.W + x] === 0) return y; } return null; }
