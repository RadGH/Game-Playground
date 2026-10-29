// The whole simulation in one object. PURE: no DOM, no clocks — the game calls step() 30 times
// a game-second. Node tests build one with createSim(data, opts) and play it in memory.
//
//   data = { materials, reactions, creatures, spells, discoveries }  (parsed JSON)
//   const sim = createSim(data, { W, H, seed });
//   sim.step();                 one tick
//   sim.world / sim.ps          the cells, the particles
//   sim.blast(x, y, r, power)   sim.lightning(x, y)   sim.cast(spellId, x, y, x2, y2)
//   sim.on(type, fn)            'discover', 'blast', 'sound', 'death', 'birth', ...

import { compileMaterials } from './materials.js';
import { createWorld } from './world.js';
import { createParticles, stepParticles } from './particles.js';
import { createCellRules, compileReactions } from './cells.js';
import { createBlast } from './blast.js';
import { createGrowth } from './growth.js';
import { createWeather } from './weather.js';
import { stepGas } from './gas.js';
import { makeRng } from './rng.js';

export const TICKS_PER_SECOND = 30;

export function createSim(data, opts = {}) {
  const M = data.compiled || compileMaterials(data.materials);
  const W = opts.W ?? 256, H = opts.H ?? 256;
  const rng = makeRng(opts.seed ?? 1);
  const w = createWorld(W, H, M);
  const ps = createParticles();
  const R = compileReactions(data.reactions, M);
  const listeners = {};
  const laterQ = [];
  const sim = {
    data, M, R, world: w, ps, rng, tick: 0,
    discovered: new Set(opts.discovered || []),
    on(type, fn) { (listeners[type] ||= []).push(fn); return () => { listeners[type] = listeners[type].filter(f => f !== fn); }; },
    fire(type, ev) { for (const fn of listeners[type] || []) fn(ev); for (const fn of listeners['*'] || []) fn(type, ev); },
  };
  const api = {
    blast: (...a) => sim.blast(...a),
    lightning: (...a) => sim.lightning(...a),
    later: (fn, ticks = 2) => laterQ.push({ at: sim.tick + ticks + (rng() * 3 | 0), fn }),
    discover: (id, x, y) => {
      if (sim.discovered.has(id)) return;
      sim.discovered.add(id);
      sim.fire('discover', { id, x, y });
    },
  };
  sim.api = api;
  const rules = createCellRules(w, R, ps, rng, api);
  const bl = createBlast(w, ps, rng, api);
  sim.blast = bl.blast;
  sim.lightning = bl.lightning;
  const growth = createGrowth(w, rng);
  const weather = createWeather(w, ps, rng, api);
  sim.weather = weather;
  sim.daylight = weather.daylight;
  sim.systems = [];   // creatures, spells, villages add themselves: { step(sim), name }
  sim.particleHooks = { land: (i, x, y) => sim.fire('land', { i, x, y }), fly: null };

  sim.step = function step() {
    sim.tick++;
    w.tick = sim.tick;
    weather.step();
    rules.step();
    if (sim.tick & 1) stepGas(w, rng);
    if (sim.tick % 4 === 0) rules.gasFlash();
    stepParticles(ps, w, rng, sim.particleHooks);
    growth.step();
    for (const s of sim.systems) s.step(sim);
    for (let k = laterQ.length - 1; k >= 0; k--) {
      if (laterQ[k].at <= sim.tick) { const f = laterQ[k].fn; laterQ.splice(k, 1); f(); }
    }
    // hand world events to listeners
    if (w.events.length) {
      const evs = w.events; w.events = [];
      for (const e of evs) sim.fire(e.type, e);
    }
  };
  return sim;
}
