// Zone checks (ruling 15: "reachability and spawn checks run on every zone"). Pure; used by tests/world/zones.test.js,
// tools/zone-check.mjs and the editor's "Check" button.
//   checkZone(zone) -> { ok, problems: [string], stats }
import { buildArea } from './zone.js';
import { walkGrid, CELL } from '../sim/paths.js';
import { PROP_KIT } from './props.js';

export function checkZone(zone) {
  const problems = [], area = buildArea(zone), g = walkGrid(area);
  const idx = (x, z) => { const cx = Math.floor((x - g.x0) / CELL), cz = Math.floor((z - g.z0) / CELL); return cx < 0 || cz < 0 || cx >= g.nx || cz >= g.nz ? -1 : cz * g.nx + cx; };
  // flood from the start
  const seen = new Uint8Array(g.nx * g.nz), q = [], s = idx(area.spawn.x, area.spawn.z);
  if (s < 0 || g.blocked[s]) problems.push(`the start (${area.spawn.x}, ${area.spawn.z}) is inside something`);
  else { seen[s] = 1; q.push(s); }
  for (let h = 0; h < q.length; h++) { const i = q[h], cx = i % g.nx, cz = (i / g.nx) | 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = cx + dx, z = cz + dz; if (x < 0 || z < 0 || x >= g.nx || z >= g.nz) continue; const j = z * g.nx + x; if (!seen[j] && !g.blocked[j]) { seen[j] = 1; q.push(j); } } }
  const reach = (x, z, r = 2) => { for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const i = idx(x + dx, z + dz); if (i >= 0 && seen[i]) return true; } return false; };
  zone.spawns?.forEach((sp, i) => { if (!reach(sp.x, sp.z)) problems.push(`spawn #${i} at (${sp.x}, ${sp.z}) cannot be walked to`); });
  zone.chests?.forEach((c, i) => { if (!reach(c.x, c.z)) problems.push(`chest #${i} at (${c.x}, ${c.z}) cannot be walked to`); });
  zone.markers?.forEach(m => { if (!reach(m.x, m.z, 3)) problems.push(`${m.kind}${m.id ? ' ' + m.id : ''} at (${m.x}, ${m.z}) cannot be walked to`); });
  for (const p of zone.props || []) if (!PROP_KIT[p.k]) problems.push(`unknown prop "${p.k}"`);
  for (const sc of zone.scatter || []) for (const k of [].concat(sc.k)) if (!PROP_KIT[k]) problems.push(`unknown scatter prop "${k}"`);
  const [x0, z0, x1, z1] = zone.bounds;
  const inB = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
  for (const sp of zone.spawns || []) if (!inB(sp.x, sp.z)) problems.push(`spawn at (${sp.x}, ${sp.z}) is outside the zone`);
  if (!(zone.markers || []).some(m => m.kind === 'start')) problems.push('no start marker');
  const open = seen.reduce((a, b) => a + b, 0), total = g.blocked.length - g.blocked.reduce((a, b) => a + b, 0);
  return { ok: !problems.length, problems, stats: { props: area.props.length, blockers: area.blockers.length, walkable: open, unreachable: total - open, spawns: (zone.spawns || []).length } };
}
