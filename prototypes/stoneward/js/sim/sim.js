// The simulation: the planet, its chunks, the clock, the wind, and the systems that run on it. PURE
// — no DOM, no clock, no Math.random (one seeded rng), so it runs in node tests and in the worker,
// and the same seed + the same orders always give the same world.
//
//   const sim = createSim({ macro, M, seed });
//   sim.step();                 // one tick (20 a second at 1x)
//   sim.order({ t: 'poke', kind: 'fire', x, y });
//   sim.setFocus([{ x0, y0, x1, y1 }])   // chunk rects the player cares about: stepped every tick
//
// Systems are appended in order (`sim.systems`), each `{ id, step(sim) }`, so later milestones
// add a town, logistics, guards… without touching this file's loop.

import { createChunkGen } from '../planet/chunkgen.js';
import { createChunkStore } from '../planet/chunks.js';
import { makeRng, subSeed } from '../planet/noise.js';
import { createCellRules, BURN, STILL } from './cells.js';

export const TICKS_PER_SEC = 20;

export function createSim({ macro, M, seed = macro.seed, dayTicks = 12000, budget = 1500 }) {
  const gen = createChunkGen(macro, M);
  const rng = makeRng(subSeed(seed, 'sim'));
  const sim = {
    macro, M, gen, rng, tick: 0, dayTicks, events: [], systems: [],
    W: gen.W, H: gen.H, chunksX: gen.chunksX, chunksY: gen.chunksY,
    wind: { x: 0.6, y: 0.2, strength: 0.6 },
    farEvery: 4, ventCycle: 4000, ventBurst: 260,
    awake: new Set(), focus: [], viewFocus: [], state: {},
  };
  const store = createChunkStore({
    ...gen,
    generate(cx, cy) {
      const c = gen.generate(cx, cy);
      // generated sea and river water is still; vents and anything already hot start awake
      for (let i = 0; i < c.mat.length; i++) {
        const m = c.mat[i];
        if (M.liquid[m]) c.flag[i] |= STILL;
        if (M.source[m] !== 255) c.needsWake = true;
      }
      c.hot = isHot(cx, cy);
      return c;
    },
  }, { budget });
  sim.store = store;

  sim.wake = c => { if (!c.awakeMark) { c.awakeMark = true; sim.awake.add(c); } };
  sim.takeAwake = () => {
    const list = [...sim.awake]; sim.awake.clear();
    for (const c of list) c.awakeMark = false;
    return list;
  };
  sim.getChunk = (cx, cy) => {
    const c = store.get(cx, cy);
    if (c && c.needsWake) { c.needsWake = false; sim.wake(c); }
    return c;
  };

  const rules = createCellRules(sim);
  sim.rules = rules;

  function isHot(cx, cy) {
    for (const r of sim.focus) {
      let dx = cx - r.x0; const span = r.x1 - r.x0;
      dx = ((dx % sim.chunksX) + sim.chunksX) % sim.chunksX;
      if (dx <= span && cy >= r.y0 && cy <= r.y1) return true;
    }
    return false;
  }
  /** Chunk rectangles that get full-rate physics (the view, towns, outposts). */
  sim.setFocus = rects => {
    sim.viewFocus = rects;
    // towns and outposts always run at full rate (their chunks sleep anyway unless something happens)
    const towns = (sim.state.town?.towns || []).map(t => ({ x0: Math.floor(t.x / 64) - 3, y0: Math.max(0, Math.floor(t.y / 64) - 3), x1: Math.floor(t.x / 64) + 3, y1: Math.floor(t.y / 64) + 3 }));
    sim.focus = rects.concat(towns);
    for (const c of sim.awake) c.hot = isHot(c.cx, c.cy);
  };
  sim.isHot = isHot;

  /** One tick. */
  sim.step = () => {
    sim.tick++;
    // the wind drifts slowly
    if (sim.tick % 200 === 0) {
      const a = Math.atan2(sim.wind.y, sim.wind.x) + (rng() - 0.5) * 0.4;
      sim.wind.strength = Math.max(0.15, Math.min(1, sim.wind.strength + (rng() - 0.5) * 0.15));
      sim.wind.x = Math.cos(a); sim.wind.y = Math.sin(a);
    }
    for (const c of sim.awake) c.hot = isHot(c.cx, c.cy);
    rules.step(rng);
    for (const s of sim.systems) s.step(sim);
  };

  /** Daylight 0 (midnight) .. 1 (noon). A day starts at dawn. */
  sim.daylight = () => {
    const t = (sim.tick % dayTicks) / dayTicks;   // 0 = dawn
    return Math.max(0, Math.min(1, 0.5 + Math.sin(t * Math.PI * 2) * 0.9));
  };
  sim.timeOfDay = () => (sim.tick % dayTicks) / dayTicks;

  /** Cell at world (gx, gy): { c, i } or null. x wraps. */
  sim.cell = (gx, gy) => {
    gx = Math.floor(gx); gy = Math.floor(gy);
    if (gy < 0 || gy >= sim.H) return null;
    const cx = Math.floor(gx / 64), cy = Math.floor(gy / 64);
    const c = sim.getChunk(cx, cy); if (!c) return null;
    const lx = ((gx % 64) + 64) % 64, ly = gy - cy * 64;
    return { c, i: ly * 64 + lx };
  };

  /** Orders from the player (or tests). Every change to the world comes through here. */
  sim.order = o => {
    if (o.t !== 'poke' && o.t !== 'time') { for (const s of sim.systems) if (s.order) { const r = s.order(o); if (r != null) return r; } return null; }
    if (o.t === 'time') { sim.tick = Math.floor(sim.tick / dayTicks) * dayTicks + Math.floor(o.tod * dayTicks); return; }
    if (o.t === 'poke') {
      const r = o.r ?? 3;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const p = sim.cell(o.x + dx, o.y + dy); if (!p) continue;
        const { c, i } = p;
        if (o.kind === 'fire') { c.temp[i] = 255; rules.ignite(c, i); }
        else if (o.kind === 'lava') { rules.setCell(c, i, M.id.lava, 8); c.temp[i] = 240; }
        else if (o.kind === 'water') { rules.setCell(c, i, M.id.water, 8); }
        store.markEdited(c); sim.wake(c);
      }
    }
  };

  return sim;
}

export { BURN };
