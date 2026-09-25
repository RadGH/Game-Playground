// Link network and power grid.
//
// Links: the Core and finished Relays are nodes. A node is linked if a linked node is within that
// node's range with a terrain-free line between their mast tops. A building is linked if any linked
// node reaches it the same way. Recomputed when buildings change and twice a second otherwise
// (terrain changes can cut a beam).
//
// Power: supply from generators, draw from consumers (turrets add draw only while firing).
// Batteries absorb the difference; when they run dry the grid browns out and every consumer runs at
// supply / draw speed.

import { bdef } from './buildings.js';
import { terrainClear } from '../world/raycast.js';

export function nodeRange(game, b) {
  const def = bdef(game, b.type);
  let r = def.linkRange || 0;
  if (b.type === 'core') r *= game.teams[b.team]?.mods.linkRange || 1;
  return r;
}

export function mastTop(b) { return { x: b.x + b.w / 2, y: b.y + 1 }; }
export function linkPoint(b) { return { x: b.x + b.w / 2, y: b.y + Math.min(2, b.h - 1) }; }

export function updateLinks(game) {
  const W = game.world;
  for (const teamId of [1, 2]) {
    const nodes = game.buildings.filter((b) => b.team === teamId && !b.falling && ((b.type === 'core') || (b.type === 'relay' && b.done)));
    const linked = new Set();
    const edges = [];
    const core = nodes.find((n) => n.type === 'core');
    if (core) {
      linked.add(core);
      const queue = [core];
      while (queue.length) {
        const n = queue.shift();
        const p = mastTop(n), r = nodeRange(game, n);
        for (const m of nodes) {
          if (linked.has(m)) continue;
          const q = mastTop(m);
          if ((p.x - q.x) ** 2 + (p.y - q.y) ** 2 > r * r) continue;
          if (!terrainClear(W, p.x, p.y, q.x, q.y)) continue;
          linked.add(m); queue.push(m); edges.push([n.id, m.id]);
        }
      }
    }
    const linkedNodes = [...linked];
    for (const b of game.buildings) {
      if (b.team !== teamId) continue;
      const def = bdef(game, b.type);
      if (b.type === 'core' || def.noLink) { b.linked = true; b.linkFrom = 0; continue; }
      if (b.type === 'relay' && linked.has(b)) { b.linked = true; continue; }
      b.linked = false; b.linkFrom = 0;
      if (b.falling) continue;
      const q = linkPoint(b);
      for (const n of linkedNodes) {
        const p = mastTop(n), r = nodeRange(game, n);
        if ((p.x - q.x) ** 2 + (p.y - q.y) ** 2 > r * r) continue;
        if (!terrainClear(W, p.x, p.y, q.x, q.y)) continue;
        b.linked = true; b.linkFrom = n.id; break;
      }
    }
    game.linkEdges[teamId] = edges;
    game.linkNodes[teamId] = linkedNodes.map((n) => n.id);
  }
  game.linksDirty = false;
}

// Find a linked node that would link a building placed at (x, y, w, h). Returns node or null.
export function findLinkFor(game, team, x, y, w, h) {
  const q = { x: x + w / 2, y: y + Math.min(2, h - 1) };
  let best = null, bestD = Infinity;
  for (const id of game.linkNodes[team] || []) {
    const n = game.byId.get(id);
    if (!n) continue;
    const p = mastTop(n), r = nodeRange(game, n);
    const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
    if (d > r * r || d >= bestD) continue;
    if (!terrainClear(game.world, p.x, p.y, q.x, q.y)) continue;
    best = n; bestD = d;
  }
  return best;
}

export function updatePower(game, dt) {
  for (const teamId of [1, 2]) {
    const team = game.teams[teamId];
    if (!team) continue;
    let supply = 0, draw = 0, cap = 0;
    for (const b of game.buildings) {
      if (b.team !== teamId || !b.done || b.falling) continue;
      const def = bdef(game, b.type);
      if (def.store && b.linked) cap += def.store * (team.mods.battery || 1);
      if (!b.linked) continue;
      if (def.power > 0) supply += def.power * (def.needsSky ? b.sky : 1);
      else if (def.power < 0 && b.on && isWorking(game, b, def)) draw += -def.power;
      if (b.firingDraw) draw += b.firingDraw;
    }
    const p = team.power;
    p.supply = supply; p.draw = draw; p.cap = cap;
    p.battery = Math.min(p.battery, cap);
    const net = supply - draw;
    p.net = net;
    if (net >= 0) { p.battery = Math.min(cap, p.battery + net * dt); p.ratio = 1; }
    else {
      p.battery += net * dt;
      if (p.battery > 0) p.ratio = 1;
      else { p.battery = 0; p.ratio = draw > 0 ? Math.max(0.05, supply / draw) : 1; }
    }
  }
}

// Consumers only draw while they have work to do.
function isWorking(game, b, def) {
  if (def.mine) return !b.depleted;
  if (def.trains) return b.queue.length > 0;
  if (b.type === 'lab') return !!game.teams[b.team].research.active[b.id];
  if (def.refine) return b.refining !== false;
  return true;
}
