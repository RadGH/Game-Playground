// Oathwild — draws the towns planned by js/world/town.js. The houses, yards and street props are built by the House
// Kit experiment (playground/housekit/, 2026-11-26 — owner: "Can the modular building system be created and synced to
// an experiment page so that we can review and extend it there?"): this file only walks the plan and hands each house
// to the kit, so the review page and the game draw the exact same house (one copy; housekit/tests/same-house.test.mjs).
//
// What the kit does: Kenney Fantasy Town wall pieces (CC0) storey by storey, on a plinth that meets the sloping ground,
// a roof made to fit the walls (clay, slate, shingle or thatch), dormers, jetties, balconies, porches, window boxes,
// shutters in the house's colour, shop signs showing the trade, lanterns, chimney pots, ivy, rain barrels, woodpiles…
// every surface laid on one Codex-painted texture atlas. Everything in a 48 m chunk is merged into ONE mesh with ONE
// material (one draw call a chunk, whatever is in it).
//
//   const town = await createTownView({ T, plan, quality, tileGroup, chimneys })
//   town.stats   { houses, chunks, triangles, drawCalls }
//   town.leftovers  props this file does not draw (world.js places them: training dummies, weapon racks, banners)
import * as THREE from 'three';
import { loadHouseKit } from '../../../../../housekit/js/build.js';
import { describeHouse, describeFence, describeProp, describeTerraceWall, houseInput } from '../../../../../housekit/js/describe.js';

const CHUNK = 48;

export async function createTownView({ T, plan, quality = 'medium', tileGroup, chimneys = [] }) {
  const kit = await loadHouseKit({ quality });
  const chunks = new Map();     // key → { x, z, sink }
  const chunkOf = (x, z) => { const k = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`; if (!chunks.has(k)) chunks.set(k, { x, z, sink: kit.sink() }); return chunks.get(k); };
  const heightAt = (x, z) => T.heightAt(x, z);

  // ---------------------------------------------------------------- houses
  let houses = 0;
  const decorations = {};
  for (const h of plan.houses) {
    houses++;
    const { house, ctx } = houseInput(h, { yards: plan.yards, heightAt, quality });
    const d = describeHouse(house, kit.S, ctx);
    for (const [k, on] of Object.entries(d.look.deco)) if (on) decorations[k] = (decorations[k] || 0) + 1;
    kit.addParts(chunkOf(h.at[0], h.at[1]).sink, d.parts, { at: h.at, facing: h.facing, y0: h.floorY });
    const c = Math.cos(h.facing), s = Math.sin(h.facing);
    for (const [lx, y, lz] of d.smoke) chimneys.push({ x: h.at[0] + lx * c + lz * s, y, z: h.at[1] - lx * s + lz * c });
  }

  // ---------------------------------------------------------------- yards (fences, hedges, low walls), props, terrace walls
  const ctx = { groundAt: heightAt };
  for (const f of plan.fences) kit.addParts(chunkOf((f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2).sink, describeFence(f, kit.S, ctx));
  const leftovers = [];
  for (const p of plan.props) {
    const parts = describeProp(p, kit.S, ctx);
    if (!parts) { leftovers.push(p); continue; }
    kit.addParts(chunkOf(p.at[0], p.at[1]).sink, parts);
  }
  for (const w of plan.walls) kit.addParts(chunkOf((w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2).sink, describeTerraceWall(w, kit.S));

  // ---------------------------------------------------------------- one mesh per chunk
  let triangles = 0, drawCalls = 0;
  const meshes = [];
  for (const ch of chunks.values()) {
    if (!ch.sink.n) continue;
    const mesh = new THREE.Mesh(ch.sink.geometry(), kit.material);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'town houses';
    tileGroup(ch.x, ch.z).add(mesh);
    meshes.push(mesh);
    triangles += ch.sink.n; drawCalls++;
  }
  if (kit.stats.missing.size) console.warn('town: kit pieces missing', [...kit.stats.missing]);
  return { stats: { houses, chunks: chunks.size, triangles: Math.round(triangles), drawCalls, decorations }, leftovers, meshes, materials: { town: kit.material } };
}

// Shared with js/client/render/bridge-draw.js (bridge newels and lantern posts): the old Kenney loader and painted palette.
export { kenneyPiece, kenneyPaletteImage, kenneyPalette, SWATCH } from '../../../../../housekit/js/kenney-palette.js';
