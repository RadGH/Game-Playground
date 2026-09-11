// Travel legs: 1–3 events between two locations, plus the timing-bar minigame.
import { makeRng } from './rng.js';
export function planLeg(game, from, to, rng = game.rng) {
  const L = game.data.world.locations[from], T = game.data.world.locations[to]; const w = game.data.world.travelEvents.weights;
  const n = T.kind === 'town' ? rng.int(1, 2) : rng.int(1, 3); const events = [];
  for (let i = 0; i < n; i++) { let kind = rng.weighted(Object.keys(w), k => w[k]); if (kind === 'combat' && !(T.encounters || L.encounters)) kind = 'find'; events.push(makeEvent(game, kind, T.encounters?.length ? T : L, rng)); }
  return events;
}
export function makeEvent(game, kind, loc, rng) {
  const world = game.data.world;
  if (kind === 'combat') { const poolId = rng.pick(loc.encounters || ['bandits_few']); const pool = world.encounterPools[poolId]; const n = rng.int(pool.min, pool.max); const ids = Array.from({ length: n }, (_, i) => pool.enemies[i % pool.enemies.length]); return { kind, name: pool.name, enemies: ids, loc: loc.name }; }
  if (kind === 'find') { const r = game.data.items.roll({ race: rng.pick(['human', 'dwarf', 'elf', 'goblin']), rarity: rng() < 0.15 ? 'rare' : rng() < 0.5 ? 'uncommon' : 'common', seed: rng.int(1, 1e9), lore: true }); return { kind, item: r, name: 'something in the grass' }; }
  if (kind === 'minigame') { const g = rng.pick(world.travelEvents.minigames); return { kind, game: g, name: g.name }; }
  if (kind === 'wanderer') { return { kind, name: 'a traveller on the road', role: rng.pick(['pedlar', 'pilgrim', 'hunter', 'deserter', 'tinker', 'widow']), mood: rng.pick(['friendly', 'wary', 'drunk', 'grieving']) }; }
  if (kind === 'rest') return { kind, name: 'a good place to rest', heal: 2 };
  return { kind: 'vista', name: 'the view opens' };
}
/** Timing bar: marker sweeps 0→1→0; stop inside [green start, green end] to succeed. Pure logic, UI draws it. */
export class Minigame {
  constructor({ speed = 0.9, green = [0.42, 0.62] } = {}) { this.pos = 0; this.dir = 1; this.speed = speed; this.green = green; this.running = false; this.result = null; }
  start() { this.running = true; this.result = null; this.pos = 0; this.dir = 1; }
  tick(dt) { if (!this.running) return; this.pos += this.dir * this.speed * dt; if (this.pos >= 1) { this.pos = 1; this.dir = -1; } if (this.pos <= 0) { this.pos = 0; this.dir = 1; } }
  stop() { if (!this.running) return null; this.running = false; this.result = this.pos >= this.green[0] && this.pos <= this.green[1]; return this.result; }
}
