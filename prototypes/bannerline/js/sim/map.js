// Static match geometry (sim.map, interfaces.md §6), built from data/maps.json + the mode. Not part
// of state: it is rebuilt from data on restore, so snapshots stay small.

import { buildFlow } from './flow.js';

export function buildMap(data, mapId, mode, teamCount = 2) {
  const m = data.maps.maps[mapId];
  if (!m) throw new Error(`Unknown map "${mapId}"`);
  const md = m.modes[mode];
  if (!md) throw new Error(`Map "${mapId}" has no mode "${mode}"`);
  const width = md.width, length = m.length, gap = m.gap;
  const fields = [];
  for (let t = 0; t < teamCount; t++) {
    const cx = (t - (teamCount - 1) / 2) * (width + gap);
    const gates = [];
    for (let g = 0; g < md.gates; g++) gates.push({ x: cx + (g - (md.gates - 1) / 2) * (width / md.gates), z: m.gateZ });
    const f = {
      id: t, team: t, cx,
      x0: cx - width / 2, x1: cx + width / 2, z0: 0, z1: length,
      gates,
      keep: { x: cx, z: m.keep.z, w: m.keep.w, d: m.keep.d },
      leakZ: m.leakZ,
      armory: { x: cx + m.armory.x, z: m.armory.z, r: m.armory.r },
      spawn: { x: cx + m.spawn.x, z: m.spawn.z },
      ford: { x0: cx - width / 2, x1: cx + width / 2, z0: m.ford.z0, z1: m.ford.z1, slow: m.ford.slow },
      walls: m.walls.map(w => ({ x0: cx + w[0], z0: w[1], x1: cx + w[2], z1: w[3] })),
    };
    fields.push(f);
  }
  const map = { id: mapId, name: m.name, length, width, gap, fields, grid: { cell: 1 } };
  // flow fields are attached non-enumerably so JSON.stringify(sim.map) stays readable
  for (const f of fields) Object.defineProperty(f, 'flow', { value: buildFlow(f, map.grid.cell), enumerable: false });
  return map;
}
