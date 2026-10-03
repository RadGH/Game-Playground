// node prototypes/farhold/tools/probe-road-float.mjs [scale] [seeds...]
//
// Round 28 — how far the DRAWN road stands off the DRAWN ground. Builds the real features
// (js/features.js, Three.js in node through tests/three-loader.mjs) around every town of a few
// worlds, reads the road and street meshes' own vertex buffers, and measures them against
//   * `heightAt`, the ground you collide with, and
//   * the ground js/terrain.js DRAWS at each ring's quad size (a plane through three heightAt
//     samples per triangle — see tests/road-measure.mjs).
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register('../tests/three-loader.mjs', import.meta.url);
const P = await import('../js/planet.js');
const { createFeatures } = await import('../js/features.js');
const { ringCells, drawnGround, quantiles, ribbonVsGround, seenFrom } = await import('../tests/road-measure.mjs');
const { ROAD_SHADER } = await import('../js/features.js');
const balance = JSON.parse(readFileSync(new URL('../data/balance.json', import.meta.url), 'utf8'));

const SCALE = Number(process.argv[2] || 0.1);
const SEEDS = process.argv.slice(3).map(Number);
if (!SEEDS.length) SEEDS.push(25392, 7, 4477);
const fmt = q => q.map(v => v.toFixed(2).padStart(6)).join(' ');

for (const seed of SEEDS) {
  P.setMetresPerCell(P.M_PER_CELL_DEFAULT * SCALE);
  const made = P.createWorld({ seed, width: balance.world?.width ?? 256, height: balance.world?.height ?? 128, regionScale: 2, habitable: true, liveable: true });
  const terrain = P.makeTerrain(made.world, made.planet, balance.terrain);
  const features = createFeatures({ add() {}, remove() {} }, terrain, { seed, radius: 2600 });
  const town = features.settlements.find(s => s.size >= 3) || features.settlements[0];
  features.update(town.wx, town.wz, true);
  const skip = (x, z) => !!terrain.bridgedAt?.(x, z) || !!terrain.underwater?.(x, z);
  const rings = ringCells(terrain, balance);
  console.log(`\nseed ${seed} scale ${SCALE} — around ${town.name}; ring cells ${rings.map(r => r.cell.toFixed(1)).join(', ')}`);
  for (const [label, mesh] of [['roads', features.roadMesh], ['streets', features.streetMesh]]) {
    const g = mesh.geometry;
    if (!g.index) { console.log(label, 'none'); continue; }
    const geom = { position: g.attributes.position.array, index: g.index.array, normal: g.attributes.normal.array };
    const exact = ribbonVsGround(geom, (x, z) => terrain.heightAt(x, z), skip);
    const over = exact.filter(d => d > 0), under = exact.filter(d => d < 0).map(d => -d);
    console.log(`${label}: ${exact.length} samples  vs heightAt: float p50/p95/p99/max ${fmt(quantiles(over))}  sunk n=${under.length} max ${fmt(quantiles(under, [1]))}`);
    {
      const k = label === 'roads' ? ROAD_SHADER.road : ROAD_SHADER.street;
      seenFrom.where = [];
      const s = seenFrom(geom, terrain, rings, k, town.wx, town.wz, { skip });
      if (seenFrom.where.length) console.log('   covered at [distance m, depth m]:', JSON.stringify(seenFrom.where.slice(0, 12)));
      const h = s.hidden.filter(v => v > 0.05), gp = s.gap.filter(v => v > 0.05);
      console.log(`   seen from the town: ${s.samples} vertices, still covered by the drawn hill ${(100 * h.length / s.samples).toFixed(2)}% (p95/max ${fmt(quantiles(h, [0.95, 1]))}), hanging past the skirt ${(100 * gp.length / s.samples).toFixed(2)}% (p95/max ${fmt(quantiles(gp, [0.95, 1]))})`);
    }
    for (const r of rings) {
      const d = ribbonVsGround(geom, drawnGround(terrain, r.cell), skip);
      const fl = d.filter(v => v > 0), sk = d.filter(v => v < 0).map(v => -v);
      const vis = sk.filter(v => v > 0.0).length;
      console.log(`   ring ${r.cell.toFixed(1).padStart(5)} m: float p50/p95/p99/max ${fmt(quantiles(fl))} | sunk ${(100 * vis / d.length).toFixed(1).padStart(5)}% p95/max ${fmt(quantiles(sk, [0.95, 1]))} | float>0.3m ${(100 * fl.filter(v => v > 0.3).length / d.length).toFixed(1)}%`);
    }
  }
}
