// Builds every system on a sim in order. One place, so the worker and the tests set up the same
// game. Order matters: the town first (it owns buildings and people), then finding things, then
// the routes that move goods between buildings.

import { createTown } from './town/town.js';
import { createDiscovery } from './discover.js';
import { createRoutes } from './logistics/routes.js';

// More systems (walls, guards, threats, powers, trains…) are listed here, one line each:
// [name on sim, factory]. A system is { id, step(sim), order?(o), view?(rect) } — view() output is
// sent to the page under its id.
import EXTRA from './extra-systems.js';

export function addSystems(sim, buildings) {
  sim.data = buildings;
  sim.town = createTown(sim, buildings);
  sim.discover = createDiscovery(sim, buildings);
  sim.routes = createRoutes(sim, buildings);
  sim.systems.push(sim.town, sim.discover, sim.routes);
  for (const [name, make] of EXTRA) { const s = make(sim, buildings); sim[name] = s; sim.systems.push(s); }
  return sim;
}


/** What the page sees each tick: people, carts, scouts and found nodes in its view rect. */
export function viewOf(sim, rect) {
  if (!sim.town) return null;
  const v = sim.town.view(rect);
  const r = sim.routes.view(rect);
  v.routes = r.list; v.carts = r.carts;
  v.nodes = sim.discover.view(rect);
  v.scouts = sim.discover.scouts().map(s => [+s.x.toFixed(1), +s.y.toFixed(1), s.id]);
  v.found = sim.state.discover.found.length;
  if (rect) v.layer = sim.town.layerView(rect);
  for (const s of sim.systems) if (s.view && ![sim.town, sim.discover, sim.routes].includes(s)) v[s.id] = s.view(rect);
  return v;
}
