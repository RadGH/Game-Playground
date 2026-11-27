// World Build — the pinned hand-made piece (brief.pin): Oathwild's own terrain code builds it exactly as the game does
// (prototypes/oathwild/js/world/terrain.js createTerrain), and the pipeline pastes the result in unchanged.
//
//   const P = buildPin(brief)          null when nothing is pinned
//   P.T                                Oathwild's terrain object for the piece (its own coordinates)
//   P.keep                             { minX, maxX, minZ, maxZ } in world metres: kept byte for byte (gates aside)
//   P.inKeep(x, z) / P.keepDist(x, z)  inside? / metres outside the kept area (0 inside)
//   P.heightAt(x, z) / P.waterAt(x, z) the piece's ground and water, in world metres
//   P.clampHeight(x, z)                the piece's height at the nearest kept point (the seam blends from it)
//   P.joins                            [{ river, end: 'in'|'out', at:[x,z], surface, dir:[dx,dz], index }] where a
//                                      pinned river crosses the kept edge (index = its dense point there)
//   P.gates                            brief gates with { start:[x,z], startY } = the pinned road's end (rule 65)
//   P.lists                            the piece's map lists moved into world metres (ids unchanged)

import { createTerrain } from '../../prototypes/oathwild/js/world/terrain.js';
import { clamp } from './core.js';

export function buildPin(brief, edits = null) {
  const pin = brief.pin;
  if (!pin) return null;
  const map = pin.data.map;
  const [ox, oz] = pin.at;
  // the edit layer's ground strokes, in the piece's own coordinates (Oathwild applies them to its raw ground)
  const ground = (edits?.ground || []).filter(s => Array.isArray(s.at)).map(s => ({ ...s, at: [s.at[0] - ox, s.at[1] - oz] }));
  const T = createTerrain(map, ground.length ? { ground } : {});
  const mb = map.bounds;
  const keepLocal = pin.keep === 'play'
    ? { minX: mb.minX + mb.margin, maxX: mb.maxX - mb.margin, minZ: mb.minZ + mb.margin, maxZ: mb.maxZ - mb.margin }
    : pin.keep === 'all' ? { minX: mb.minX, maxX: mb.maxX, minZ: mb.minZ, maxZ: mb.maxZ } : { ...pin.keep };
  const keep = { minX: keepLocal.minX + ox, maxX: keepLocal.maxX + ox, minZ: keepLocal.minZ + oz, maxZ: keepLocal.maxZ + oz };
  const inKeep = (x, z) => x >= keep.minX && x <= keep.maxX && z >= keep.minZ && z <= keep.maxZ;
  const keepDist = (x, z) => {
    const dx = Math.max(keep.minX - x, 0, x - keep.maxX), dz = Math.max(keep.minZ - z, 0, z - keep.maxZ);
    return Math.hypot(dx, dz);
  };
  const heightAt = (x, z) => T.heightAt(x - ox, z - oz);
  const waterAt = (x, z) => T.waterAt(x - ox, z - oz);
  const clampHeight = (x, z) => T.heightAt(clamp(x, keep.minX, keep.maxX) - ox, clamp(z, keep.minZ, keep.maxZ) - oz);
  const clampWater = (x, z) => T.waterAt(clamp(x, keep.minX, keep.maxX) - ox, clamp(z, keep.minZ, keep.maxZ) - oz);
  /**
   * The seam's anchor: the kept edge's height near (x, z), averaged along the edge over a window that widens the
   * further out you are — so the blend reads as soft hills, not the edge's bumps stretched straight outwards.
   */
  function seamHeight(x, z) {
    const d = keepDist(x, z), w = 18 + d * 0.9;
    const cx = clamp(x, keep.minX, keep.maxX), cz = clamp(z, keep.minZ, keep.maxZ);
    const alongX = cx === x;           // outside the top or bottom edge: the edge runs along x
    const alongZ = cz === z;
    let sum = 0, n = 0;
    for (let k = -3; k <= 3; k++) for (let m = (alongX || alongZ ? 0 : -3); m <= (alongX || alongZ ? 0 : 3); m++) {
      const px = alongX ? clamp(cx + k * w / 3, keep.minX, keep.maxX) : alongZ ? cx : clamp(cx + k * w / 6, keep.minX, keep.maxX);
      const pz = alongZ ? clamp(cz + k * w / 3, keep.minZ, keep.maxZ) : alongX ? cz : clamp(cz + m * w / 6, keep.minZ, keep.maxZ);
      sum += T.heightAt(px - ox, pz - oz); n++;
    }
    return sum / n;
  }
  const marshLevels = new Set(T.marshes.map(m => m.level));

  // river joins: where each named pinned river crosses the kept edge, going in (from the new world) or out
  const joins = [];
  for (const j of pin.rivers) {
    const rv = T.rivers.find(r => r.id === j.river);
    if (!rv) throw new Error(`pin river "${j.river}" is not in the pinned map.`);
    const pts = rv.pts.map(p => ({ ...p, x: p.x + ox, z: p.z + oz }));
    let idx = -1;
    if (j.end === 'in') { idx = pts.findIndex(p => inKeep(p.x, p.z)); }
    else { for (let i = pts.length - 1; i >= 0; i--) if (inKeep(pts[i].x, pts[i].z)) { idx = i; break; } }
    if (idx < 0) throw new Error(`pin river "${j.river}" never enters the kept area.`);
    const p = pts[idx], q = pts[clamp(idx + (j.end === 'in' ? -3 : 3), 0, pts.length - 1)];
    const L = Math.hypot(q.x - p.x, q.z - p.z) || 1;
    joins.push({ river: j.river, name: rv.name, end: j.end, at: [p.x, p.z], surface: p.y, dir: [(q.x - p.x) / L, (q.z - p.z) / L], index: idx, width: rv.width, depth: rv.depth });
  }

  // gates: start exactly at the end of a pinned road (lessons rule 65: a link needs both ends)
  const gates = pin.gates.map(g => {
    const rd = T.roads.find(r => r.id === g.road);
    if (!rd) throw new Error(`pin gate ${g.id}: road "${g.road}" is not in the pinned map.`);
    const p = g.end === 'start' ? rd.pts[0] : rd.pts[rd.pts.length - 1];
    return { ...g, start: [p.x + ox, p.z + oz], startY: p.y, via: (g.via || []).map(([x, z]) => [x, z]), width: g.width || rd.width, class: g.class || rd.class };
  });

  // the pinned rivers as they run INSIDE the kept area (their course outside it is replaced by the new world's rivers
  // that join them at the edge), dense points in world metres
  const riverLines = T.rivers.map(r => {
    const pts = r.pts.map(p => ({ ...p, x: p.x + ox, z: p.z + oz })).filter(p => inKeep(p.x, p.z));
    return { id: r.id, name: r.name, width: r.width, depth: r.depth, pts, pinned: true };
  }).filter(r => r.pts.length > 1);
  const mv = ([x, z]) => [x + ox, z + oz];
  const lists = {
    places: Object.fromEntries(Object.entries(map.places).filter(([k]) => !k.startsWith('_')).map(([k, p]) => [k, { ...p, at: mv(p.at), pads: p.pads?.map(pd => ({ ...pd, at: mv(pd.at) })), pinned: true }])),
    roads: map.roads.map(r => ({ ...r, points: r.points.map(mv), pinned: true })),
    rivers: map.rivers.map(r => ({ ...r, points: r.points.map(mv), pinned: true })),
    crossings: (map.crossings || []).map(c => ({ ...c, pinned: true })),
    areas: map.areas.map(a => ({ ...a, at: mv(a.at), pinned: true })),
    forests: (map.forests || []).map(f => ({ ...f, at: mv(f.at), pinned: true })),
    fields: (map.fields || []).map(f => ({ ...f, at: mv(f.at), pinned: true })),
    marshes: (map.marshes || []).map(m => ({ ...m, at: mv(m.at), pinned: true })),
    hills: map.hills.map(h => ({ ...h, at: mv(h.at) })),
    ridges: map.ridges.map(r => ({ ...r, points: r.points.map(mv) })),
    regions: map.regions,
    border: { ...map.border, points: map.border.points.map(mv) },
  };
  const regionAt = (x, z) => T.regionAt(x - ox, z - oz);
  const levelBandAt = (x, z) => T.levelBandAt(x - ox, z - oz);
  /** Water kind code (worldbuild: 1 river, 2 marsh) of a pinned vertex with surface `s`. */
  const kindOf = s => (marshLevels.has(Math.round(s * 100) / 100) ? 2 : 1);
  return { T, map, data: pin.data, riverLines, at: [ox, oz], keep, inKeep, keepDist, heightAt, waterAt, clampHeight, clampWater, seamHeight, joins, gates, lists, regionAt, levelBandAt, kindOf, seam: pin.seam };
}
