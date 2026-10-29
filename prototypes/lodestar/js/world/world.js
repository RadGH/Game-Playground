// One base's cell world: the grid, its rules and the map, wired together. PURE (runs in node, in
// the worker, and later inside js/sim/index.js as the world systems).
//
// step() order each tick (PLAN §1.3): debris → fire/heat → gas (every gas.every) → slow pass
// (every slow.every: thaw, wet/mud, regrowth, coarse light). Events (explosion, lightning, frost,
// rain) collect in world.events until the caller drains them.

import { createRng, mix32 } from '../sim/rng.js';
import { createGrid, BURN, SCORCH, ROAD, BRIDGE, WET, EDGE, cell } from './grid.js';
import { compileMaterials } from './materials.js';
import { createFire } from './fire.js';
import { createGas } from './gas.js';
import { createDebris } from './debris.js';
import { createBlast } from './blast.js';
import { createWater } from './water.js';
import { createSlow } from './slow.js';
import { createVectors } from './vectors.js';
import { createFog } from './fog.js';
import { generateHome } from './mapgen.js';

/**
 * @param data { materials, mapgen } parsed JSON
 * @param opts { seed, size: 'small'|'normal'|'large' | number, blank?: material id to fill instead of a map }
 */
export function createWorld(data, opts = {}) {
  const seed = (opts.seed ?? 1) >>> 0;
  const sizes = data.mapgen?.home?.sizes || { small: 1024, normal: 1536, large: 2048 };
  const S = typeof opts.size === 'number' ? opts.size : sizes[opts.size || 'normal'];
  const W = opts.W || S, H = opts.H || S;
  const M = compileMaterials(data.materials, opts.ambient ?? data.materials.ambient);
  const g = createGrid(W, H);
  const root = createRng(seed);
  const events = [];
  const fire = createFire(g, M, root.split('fire'));
  const gas = createGas(g, M);
  const debris = createDebris(g, M, fire, root.split('debris'));
  const blaster = createBlast(g, M, fire, debris, root.split('blast'), events);
  const water = createWater(g, M, fire, events);
  const slow = createSlow(g, M, water, root.split('slow'));
  const vectors = createVectors(g, M);
  const fog = createFog(g, M);
  const paintRng = root.split('paint');
  let meta = null;
  if (opts.blank !== undefined) {
    const m = typeof opts.blank === 'string' ? M.id[opts.blank] : opts.blank;
    g.cells.fill(cell(m, M.ambient, 0, 0));
    meta = { seed, size: [W, H], hq: { x: W >> 1, y: H >> 1 }, fords: [], cliffs: [], outcrops: [], lakes: [], lava: [], plateaus: [] };
  } else {
    meta = generateHome(g, M, vectors, data.mapgen, seed);
  }

  const world = {
    g, M, meta, vectors, fire, gas, debris, water, slow, fog, events,
    tick: 0,
    step() {
      const t = ++world.tick;
      debris.step();
      fire.step(t);
      if (t % M.rules.gas.every === 0) gas.step();
      if (t % M.rules.slow.every === 0) slow.step(t);
    },
    blast: (x, y, r, power) => blaster.blast(x, y, r, power),
    ignite: (x, y) => fire.ignite(x, y),
    frost: (x, y, r) => water.frost(x, y, r),
    lightning: (x, y) => water.lightning(x, y),
    rain: (x, y, r, ticks) => water.rain(x, y, r, ticks),
    setRain: (on) => slow.setRain(on),
    setWind(dir, strength) { g.wind.dir = dir & 7; g.wind.strength = Math.max(0, Math.min(3, strength | 0)); },
    /** Paint material `m` (id string or index, or 'road') in a circle. Debug / bench tool. */
    paint(x, y, r, m) {
      const isRoad = m === 'road';
      const mi = isRoad ? -1 : typeof m === 'string' ? M.id[m] : m;
      if (!isRoad && mi === undefined) throw new Error('paint: unknown material ' + m);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + r) continue;
        const xx = x + dx, yy = y + dy;
        if (!g.inside(xx, yy)) continue;
        const i = g.idx(xx, yy);
        const c = g.cells[i];
        let nc;
        if (isRoad) {
          nc = M.water[c & 255] || M.hot[c & 255] ? (c | BRIDGE) >>> 0 : ((c | ROAD) & ~BURN) >>> 0;
        } else {
          const a = M.ore[mi] ? paintRng.range(M.amtLo[mi], M.amtHi[mi]) : mi === M.id.wall ? 255 : 0;
          const t = M.hot[mi] || M.ambient;
          nc = cell(mi, t, a, (c & WET) | (mi === M.id.cliff ? EDGE : 0));
          if (M.emits[mi]) g.emitHint[i >>> 12] = 1;
        }
        g.cells[i] = nc;
        g.ver[i >>> 12]++;
        g.wakeAt(xx, yy);
      }
    },
    /** Light every burnable cell in a circle. */
    igniteArea(x, y, r) {
      let n = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        if (fire.ignite(x + dx, y + dy)) n++;
      }
      return n;
    },
    /** Hash of everything the rules own (cells, gas, wet, debris), for same-seed tests. */
    hash() {
      let h = 0x811c9dc5 ^ world.tick;
      const c = g.cells;
      for (let i = 0; i < c.length; i++) h = Math.imul(h ^ c[i], 0x01000193);
      const f = [g.gasDensity, g.gasKind, g.wet, g.light];
      for (const a of f) for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 0x01000193);
      h = Math.imul(h ^ debris.alive, 0x01000193);
      return mix32(h >>> 0);
    },
    drainEvents() { return events.splice(0, events.length); },
  };
  return world;
}

export { SCORCH };
