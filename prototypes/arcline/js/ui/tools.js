// The build tools. Each tool turns a press/drag/release on the map into tiles, asks the sim for a quote (price + why
// not), shows it as a ghost with the price, and applies it on release. The ghost IS the result (no surprises).
import * as B from '../sim/build.js';
import { item, cat } from '../sim/catalog.js';
import { ZONE } from '../sim/region.js';
import * as TR from '../sim/transit.js';

/** Every tool, by id. kind: line (drag a path), rect (drag an area), point (tap), query. */
export function toolDefs() {
  const C = cat();
  const t = {
    query: { name: 'Look', kind: 'query', key: 'Escape' },
    street: { name: 'Street', kind: 'line', group: 'roads', level: 1, entry: C.roads[0] },
    avenue: { name: 'Avenue', kind: 'line', group: 'roads', level: 2, entry: C.roads[1] },
    highway: { name: 'Highway', kind: 'line', group: 'roads', level: 3, entry: C.roads[2] },
    zoneR: { name: 'Homes zone', kind: 'rect', group: 'zones', zone: ZONE.R, color: 'rgba(86,214,120,0.5)' },
    zoneC: { name: 'Shops & offices zone', kind: 'rect', group: 'zones', zone: ZONE.C, color: 'rgba(80,160,255,0.5)' },
    zoneI: { name: 'Industry zone', kind: 'rect', group: 'zones', zone: ZONE.I, color: 'rgba(255,190,70,0.5)' },
    dezone: { name: 'Clear zoning', kind: 'rect', group: 'zones', zone: ZONE.NONE, color: 'rgba(200,200,200,0.4)' },
    powerline: { name: 'Power line', kind: 'line', group: 'utilities', layer: 'power', color: 'rgba(255,220,80,0.55)' },
    pipe: { name: 'Water pipe', kind: 'line', group: 'utilities', layer: 'pipe', color: 'rgba(70,170,255,0.55)', overlay: 'pipes' },
    bulldoze: { name: 'Bulldoze', kind: 'rect', group: 'tools', color: 'rgba(255,90,70,0.45)' },
    repair: { name: 'Repair walls', kind: 'rect', group: 'defence', color: 'rgba(120,220,255,0.4)', blurb: 'Drag over damaged walls to patch them up: 1 credit for every 2 points of wall restored.' },
    level: { name: 'Level ground', kind: 'rect', group: 'tools', color: 'rgba(200,170,120,0.5)' },
  };
  (C.transit || []).forEach((k, i) => {
    t[`line-${k.id}`] = { name: `${k.name} line`, kind: 'line', group: 'transit', transit: i + 1, entry: { ...k, cost: k.cost, recipe: null, unlock: k.unlock, blurb: `Elevated ${k.name.toLowerCase()} track. A line works once it has two stations; it cuts traffic and lifts land value around each station.` } };
    t[`station-${k.id}`] = { name: `${k.name} station`, kind: 'point', group: 'transit', station: i + 1, entry: { cost: k.station, recipe: 'tr-station', params: { line: i + 1 }, unlock: k.unlock, size: [2, 2], blurb: `A 2×2 station beside a ${k.name.toLowerCase()} line.` } };
  });
  for (const e of C.build) {
    const group = e.cat === 'defence' ? 'defence' : e.cat === 'landmark' ? 'landmarks' : e.cat === 'colony' ? 'colony' : e.cat === 'outpost' || e.cat === 'industry' ? 'industry' : 'services';
    t[e.id] = e.wall ? { name: e.name, kind: 'line', group, wall: e.id, entry: e } : e.turret ? { name: e.name, kind: 'point', group, turret: e.id, entry: e } : { name: e.name, kind: 'point', group, place: e.id, entry: e };
  }
  return t;
}
export const GROUPS = [
  { id: 'roads', name: 'Roads' }, { id: 'zones', name: 'Zones' }, { id: 'utilities', name: 'Power & water' },
  { id: 'services', name: 'Services' }, { id: 'industry', name: 'Industry' }, { id: 'defence', name: 'Defence' },
  { id: 'transit', name: 'Transit' }, { id: 'colony', name: 'Colony' }, { id: 'landmarks', name: 'Landmarks' }, { id: 'tools', name: 'Tools' },
];

/** Tiles + quote for a tool between two tiles (a = press, b = current). */
export function plan(r, tool, a, b) {
  if (!a || !b) return null;
  const [x0, z0] = a, [x1, z1] = b;
  if (tool.level) { const tiles = B.lineTiles(x0, z0, x1, z1); const q = B.quoteRoad(r, tiles, tool.level); return { tiles: q.tiles.map(([x, z]) => [x, z]), quote: q }; }
  if (tool.layer) { const tiles = B.lineTiles(x0, z0, x1, z1); return { tiles, quote: B.quoteLine(r, tiles, tool.layer) }; }
  if (tool.transit) { const tiles = B.lineTiles(x0, z0, x1, z1); return { tiles, quote: TR.quoteTransit(r, tiles, tool.transit) }; }
  if (tool.station) { const x = x1, z = z1; return { tiles: B.rectTiles(x, z, x + 1, z + 1), quote: TR.quoteStation(r, x, z, tool.station), at: [x, z], sprite: { id: 'tr-station', params: { line: tool.station, seed: 1 }, x, z, w: 2, d: 2 } }; }
  if (tool.name === 'Repair walls') { const tiles = B.rectTiles(x0, z0, x1, z1); return { tiles, quote: B.quoteRepair(r, tiles) }; }
  if (tool.zone !== undefined) { const tiles = B.rectTiles(x0, z0, x1, z1); return { tiles, quote: tool.zone ? B.quoteZone(r, tiles, tool.zone) : { ok: true, cost: 0 } }; }
  if (tool.wall) { const tiles = B.lineTiles(x0, z0, x1, z1); const q = B.quoteWall(r, tiles, tool.wall); return { tiles: q.tiles || tiles, quote: q }; }
  if (tool.turret) return { tiles: [[x1, z1]], quote: B.quoteTurret(r, tool.turret, x1, z1) };
  if (tool.place) {
    const e = item(tool.place), [w, d] = e.size, x = x1 - Math.floor((w - 1) / 2), z = z1 - Math.floor((d - 1) / 2);
    const tiles = B.rectTiles(x, z, x + w - 1, z + d - 1);
    return { tiles, quote: B.quotePlace(r, tool.place, x, z), at: [x, z], sprite: { id: e.recipe, params: { ...(e.params || {}), seed: 1 }, x, z, w, d } };
  }
  if (tool === 'bulldoze' || tool.name === 'Bulldoze') { const tiles = B.rectTiles(x0, z0, x1, z1); return { tiles, quote: B.quoteBulldoze(r, tiles) }; }
  if (tool.name === 'Level ground') {
    const to = r.ter.height[z0 * r.size + x0], tiles = B.rectTiles(x0, z0, x1, z1);
    return { tiles, quote: B.quoteLevel(r, Math.min(x0, x1), Math.min(z0, z1), Math.abs(x1 - x0) + 1, Math.abs(z1 - z0) + 1, to), to };
  }
  return null;
}

/** Apply a planned action. Returns the sim's result ({ ok, why, cost }). */
export function apply(r, tool, a, b) {
  const p = plan(r, tool, a, b); if (!p) return { ok: false };
  if (!p.quote.ok) return p.quote;
  if (tool.level) return B.buildRoad(r, B.lineTiles(a[0], a[1], b[0], b[1]), tool.level);
  if (tool.layer) return B.buildLine(r, p.tiles, tool.layer);
  if (tool.transit) return TR.buildTransit(r, p.tiles, tool.transit);
  if (tool.station) return TR.placeStation(r, p.at[0], p.at[1], tool.station);
  if (tool.name === 'Repair walls') return B.repairWalls(r, p.tiles);
  if (tool.zone !== undefined) {
    if (tool.zone) return B.paintZone(r, p.tiles, tool.zone);
    for (const [x, z] of p.tiles) if (x >= 0 && z >= 0 && x < r.size && z < r.size) r.tiles.zone[z * r.size + x] = 0;
    return { ok: true, cost: 0 };
  }
  if (tool.wall) return B.buildWall(r, p.tiles, tool.wall);
  if (tool.turret) return B.buildTurret(r, tool.turret, b[0], b[1]);
  if (tool.place) return B.place(r, tool.place, p.at[0], p.at[1]);
  if (tool.name === 'Bulldoze') return B.bulldoze(r, p.tiles);
  if (tool.name === 'Level ground') return B.levelGround(r, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]) + 1, Math.abs(b[1] - a[1]) + 1, p.to);
  return { ok: false };
}
