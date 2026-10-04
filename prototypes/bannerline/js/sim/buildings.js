// Town buildings (owner round 2, R2.3): Outfitter (shop), Barracks (sends), Drill Yard (unit
// upgrades), Sanctum (powers), one set per team field. Data: data/buildings.json.
//
// Buildings are static match geometry, like sim.map: computed from data + the map + the mode, never
// stored in state (so snapshots stay small and a restore rebuilds them). Each building:
//   { id: 't0.shop', kind: 'shop', role, name, desc, team, field, x, z, radius (null = from anywhere),
//     size: [w, d], door }
// in WORLD coordinates (the field's centre `cx` added to the layout's field-local x).

import { buildMap } from './map.js';

const CACHE = new WeakMap();   // map object -> buildings (not state; rebuilt with the map)

function layoutFor(data, mapId, mode) {
  const B = data.buildings;
  const row = B.layouts[mapId];
  if (!row) return { spots: B.fallback, fallback: true };
  return { spots: (row.modes && row.modes[mode]) || row.default, fallback: false };
}

/** Every building in the match (sorted by team, then kind order in data). */
export function buildingsFor(data, map, mode) {
  const c = CACHE.get(map);
  if (c && c.data === data && c.mode === mode) return c.list;
  const B = data.buildings;
  const { spots } = layoutFor(data, map.id, mode);
  const list = [];
  for (const f of map.fields) {
    for (const kind of Object.keys(B.kinds)) {
      const k = B.kinds[kind], s = spots[kind];
      if (!s) continue;
      const z = s.fromKeep ? f.keep.z + s.z : s.z;
      list.push({ id: `t${f.team}.${kind}`, kind, role: k.role, name: k.name, desc: k.desc, team: f.team, field: f.id,
        x: f.cx + s.x, z, radius: k.radius, size: k.size.slice(), door: k.door });
    }
  }
  CACHE.set(map, { data, mode, list });
  return list;
}

/** One team's building of a kind, or null. */
export function buildingOf(ctx, team, kind) {
  const list = buildingsFor(ctx.data, ctx.map, ctx.state.mode);
  for (const b of list) if (b.team === team && b.kind === kind) return b;
  return null;
}

/** Is (x, z) close enough to use this team's building? Buildings with radius null: always. */
export function inBuildingRange(ctx, team, kind, x, z) {
  const b = buildingOf(ctx, team, kind);
  if (!b) return false;
  if (b.radius == null) return true;
  const dx = x - b.x, dz = z - b.z;
  return dx * dx + dz * dz <= b.radius * b.radius;
}

/** Which field (index) contains the point, or -1. */
export function fieldAt(map, x, z) {
  for (const f of map.fields) if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) return f.id;
  return -1;
}

// The query helpers get (state, data) only; they rebuild the static map once per (data, map, mode).
let MAPC = null;
export function mapFor(data, state) {
  if (MAPC && MAPC.data === data && MAPC.id === state.map && MAPC.mode === state.mode) return MAPC.map;
  MAPC = { data, id: state.map, mode: state.mode, map: buildMap(data, state.map, state.mode, 2) };
  return MAPC.map;
}
