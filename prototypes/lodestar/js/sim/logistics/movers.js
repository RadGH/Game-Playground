// Moving things along routes (PLAN M3, §0.9). PURE. Every tick each vehicle / worker with a route spends one tick of
// travel time: the step into the next cell costs (1 or √2) / (top speed × that cell's factor) ticks — the same cost
// the route search used — so a carrier can never cover a distance faster than distance ÷ top speed.
//
// A mover is any entity with `vrow` (its data/vehicles.json row). `go(e, route)` starts it; when it gets there the
// route is cleared and `e.arrived = tick`. If the cell ahead stops being passable (something was built on it) the
// mover stops with `e.blocked = true` and its owner asks for a new route.

import { SUB } from '../entities.js';
import { cellFactor, cellsPerTick } from './paths.js';

export function createMovers(sim) {
  const { g, M } = sim.world;
  const W = g.W;

  function go(e, route) {
    e.route = route; e.ri = 1; e.state = 'moving'; e.arrived = 0; e.blocked = false; e.left = sim.tick;
    if (!route || route.cells.length <= 1) { e.route = null; e.state = 'waiting'; e.arrived = sim.tick; }
  }

  function stepMover(e) {
    const r = e.route;
    if (!r) return;
    const v = e.vrow, sp = cellsPerTick(v);
    let budget = 1; // ticks of travel this tick
    let x = e.x / SUB, y = e.y / SUB;
    while (budget > 1e-9 && e.ri < r.cells.length) {
      const k = r.cells[e.ri];
      const tx = (k % W) + 0.5, ty = ((k / W) | 0) + 0.5;
      const f = cellFactor(M, v, g.cells[g.idx(k % W, (k / W) | 0)]);
      if (!f) { e.blocked = true; e.route = null; e.state = 'waiting'; break; }
      const dx = tx - x, dy = ty - y, d = Math.sqrt(dx * dx + dy * dy);
      const need = d / (sp * f);
      if (need <= budget) { x = tx; y = ty; budget -= need; e.ri++; }
      else { const t = budget / need; x += dx * t; y += dy * t; budget = 0; }
    }
    e.x = Math.round(x * SUB); e.y = Math.round(y * SUB);
    if (e.route && e.ri >= r.cells.length) { e.route = null; e.state = 'waiting'; e.arrived = sim.tick; }
  }

  function step() {
    for (const e of sim.ents.list('vehicle')) stepMover(e);
    for (const e of sim.ents.list('worker')) stepMover(e);
  }

  return { go, step, stepMover };
}
