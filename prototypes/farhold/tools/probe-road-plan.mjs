// node prototypes/farhold/tools/probe-road-plan.mjs [scale] [seeds...]
//
// Round 28 — what the road NETWORK looks like, measured (research/round28-roads.md).
// Pure planet.js (no Three.js) except the drawn-overlap figure, which builds the features around
// the first sizeable town. Prints one block per seed:
//   * length by class, and how many pieces
//   * parallel twins: road length running beside another road (within 0.6 cell, heading within
//     30 degrees) that is not the first/last 1.5 cells of a branch (where meeting a trunk at a
//     shallow angle is a junction, not a twin)
//   * junction angles: how sharply each branch meets its trunk (under 30 degrees is a sliver)
//   * grade along the graded deck: worst 10 m window, share of length over 12%
//   * drawn overlap: share of road-mesh paving that lies inside a DIFFERENT road's carriageway
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register('../tests/three-loader.mjs', import.meta.url);
const P = await import('../js/planet.js');
const { roadPlanStats } = await import('../tests/road-measure.mjs');
const balance = JSON.parse(readFileSync(new URL('../data/balance.json', import.meta.url), 'utf8'));

const SCALE = Number(process.argv[2] || 0.35);
const SEEDS = process.argv.slice(3).map(Number);
if (!SEEDS.length) SEEDS.push(25392, 7, 4477, 101, 14343310);
const DRAWN = !process.env.NO_DRAWN;

for (const seed of SEEDS) {
  P.setMetresPerCell(P.M_PER_CELL_DEFAULT * SCALE);
  const made = P.createWorld({ seed, width: balance.world?.width ?? 256, height: balance.world?.height ?? 128, regionScale: 2, habitable: true, liveable: true });
  const terrain = P.makeTerrain(made.world, made.planet, balance.terrain);
  const s = roadPlanStats(terrain);
  const km = v => (v / 1000).toFixed(1);
  console.log(`\nseed ${seed} scale ${SCALE}: ${s.pieces} pieces, ${km(s.length)} km`
    + ` (highway ${km(s.byClass.highway || 0)}, road ${km(s.byClass.road || 0)}, trail ${km(s.byClass.trail || 0)})`);
  console.log(`  parallel twins ${km(s.twin)} km (${(100 * s.twin / s.length).toFixed(1)}%)`);
  console.log(`  junctions ${s.junctions}, under 30 deg ${s.sharp} (${(100 * s.sharp / Math.max(1, s.junctions)).toFixed(0)}%), median ${s.angleMedian.toFixed(0)} deg`);
  console.log(`  grade: worst 10 m ${(100 * s.worstGrade).toFixed(0)}%, over 12% ${(100 * s.steepShare).toFixed(2)}% of length`);
  if (DRAWN) {
    const { createFeatures } = await import('../js/features.js');
    const features = createFeatures({ add() {}, remove() {} }, terrain, { seed, radius: 2600 });
    const town = features.settlements.find(t => t.size >= 3) || features.settlements[0];
    features.update(town.wx, town.wz, true);
    const g = features.roadMesh.geometry;
    const pos = g.attributes.position.array, nor = g.attributes.normal.array, idx = g.index.array;
    // a paving triangle is "inside another road" when its centroid is inside the carriageway of a
    // road it does not belong to — read off roadPairAt: two hits, both inside their own half
    let tris = 0, inside = 0, area = 0, areaIn = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      if (nor[a * 3 + 1] < 0.99) continue;
      const x = (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3, z = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3;
      const pair = terrain.roadPairAt(x, z);
      if (!pair || !pair[0]) continue;
      tris++;
      const ux = pos[b * 3] - pos[a * 3], uz = pos[b * 3 + 2] - pos[a * 3 + 2], vx = pos[c * 3] - pos[a * 3], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
      const ar = Math.abs(ux * vz - uz * vx) / 2;
      area += ar;
      const halfOf = h => terrain.roadPaths.find(p => p.id === h.id)?.half ?? 0;
      if (pair[1] && pair[0].dist < halfOf(pair[0]) - 0.3 && pair[1].dist < halfOf(pair[1]) - 0.3) { inside++; areaIn += ar; }
    }
    console.log(`  drawn: ${(area / 1e4).toFixed(1)} ha of paving, ${areaIn.toFixed(0)} m2 of it where two carriageways overlap (one layer would be the zone's own area; two ribbons double it)`);
  }
}
