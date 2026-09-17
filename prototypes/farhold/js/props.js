// Farhold phase 2 — the things standing on the ground.
//
// Trees, rocks, bushes, reeds, crystals, ruins and grass. None of it is stored: every prop cell is
// generated from a hash of the world seed and the cell's coordinates, so the same clearing is always
// the same clearing, and walking away and back costs nothing to remember.
//
// Everything is drawn with InstancedMesh — one draw call per kind of prop, not per tree. That is why
// phase 1 spent only five draw calls on the whole planet: this is what the budget was being saved
// for. A full forest is about twenty draw calls.
//
//   const props = createProps(scene, terrain, { seed, balance });
//   props.update(player.x, player.z);     // regenerates only when you cross a cell boundary
//
// Which props grow where comes from the biome, the same way `worldgen/js/local.js` scatters its
// features: a rainforest is broadleaf and fern, a boreal forest is conifer, a desert is cactus and
// rock, an ash plain is dead wood and boulders.

import * as THREE from 'three';
import { makeRng, clamp } from '../../../worldgen/js/noise.js';
import { BIOMES, isWater } from '../../../worldgen/js/biomes.js';
import { ObstacleField, PROP_SOLIDS } from './collide.js';

const CELL = 64;                     // metres across one prop cell

/**
 * Every offset in a square of `radius` cells, sorted nearest-first. Cached per radius because it is
 * the same list every rebuild and sorting a few hundred pairs on every cell crossing is waste.
 */
const spiralCache = new Map();
function spiralOffsets(radius) {
  const key = radius | 0;
  if (spiralCache.has(key)) return spiralCache.get(key);
  const out = [];
  for (let dz = -key; dz <= key; dz++) for (let dx = -key; dx <= key; dx++) out.push([dx, dz]);
  out.sort((a, b) => (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]));
  spiralCache.set(key, out);
  return out;
}

/** Stable 0..1 hash for a cell, so a cell's contents never depend on how you arrived at it. */
function cellSeed(seed, cx, cz) {
  let h = Math.imul(cx + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(cz + 0x165667b1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f) ^ Math.imul(seed >>> 0, 0x165667b1);
  return (h ^ (h >>> 16)) >>> 0;
}

// ---------------------------------------------------------------------------- geometry

/** Merge a list of { geometry, color, matrix } parts into one non-indexed geometry with colours. */
function mergeParts(parts) {
  let total = 0;
  const prepared = parts.map(p => {
    const g = p.geometry.toNonIndexed();
    g.applyMatrix4(p.matrix);
    g.computeVertexNormals();
    total += g.attributes.position.count;
    return { g, color: new THREE.Color(p.color) };
  });
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);
  let o = 0;
  for (const { g, color: c } of prepared) {
    const pos = g.attributes.position.array, nrm = g.attributes.normal.array;
    position.set(pos, o * 3);
    normal.set(nrm, o * 3);
    for (let i = 0; i < g.attributes.position.count; i++) {
      color[(o + i) * 3] = c.r; color[(o + i) * 3 + 1] = c.g; color[(o + i) * 3 + 2] = c.b;
    }
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('color', new THREE.BufferAttribute(color, 3));
  return out;
}

const at = (x, y, z, sx = 1, sy = sx, sz = sx, ry = 0) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(sx, sy, sz),
  );

const CYL = new THREE.CylinderGeometry(1, 1, 1, 6);
const CONE = new THREE.ConeGeometry(1, 1, 7);
const SPH = new THREE.SphereGeometry(1, 7, 5);
const ICO = new THREE.IcosahedronGeometry(1, 0);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const OCT = new THREE.OctahedronGeometry(1, 0);

/**
 * Every kind of prop, as a builder that returns one merged geometry.
 * `tall` is roughly how high it stands, used to decide what you can walk under.
 */
export const PROP_KINDS = {
  broadleaf: { tall: 7, cap: 700, build: (bark = '#4a3a2a', leaf = '#3f7a45') => mergeParts([
    { geometry: CYL, color: bark, matrix: at(0, 2.1, 0, 0.26, 4.2, 0.26) },
    { geometry: SPH, color: leaf, matrix: at(0, 5.1, 0, 2.5, 2.0, 2.5) },
    { geometry: SPH, color: leaf, matrix: at(0.9, 4.2, 0.5, 1.5, 1.2, 1.5) },
    { geometry: SPH, color: leaf, matrix: at(-0.8, 4.4, -0.6, 1.3, 1.1, 1.3) },
  ]) },
  conifer: { tall: 9, cap: 700, build: (bark = '#3b2f24', leaf = '#2f5c46') => mergeParts([
    { geometry: CYL, color: bark, matrix: at(0, 1.6, 0, 0.22, 3.2, 0.22) },
    { geometry: CONE, color: leaf, matrix: at(0, 3.6, 0, 2.1, 3.0, 2.1) },
    { geometry: CONE, color: leaf, matrix: at(0, 5.4, 0, 1.6, 2.6, 1.6) },
    { geometry: CONE, color: leaf, matrix: at(0, 7.0, 0, 1.0, 2.0, 1.0) },
  ]) },
  palm: { tall: 8, cap: 400, build: (bark = '#6b5436', leaf = '#4f8a40') => mergeParts([
    { geometry: CYL, color: bark, matrix: at(0, 3, 0, 0.2, 6, 0.2) },
    // Fronds are flat blades that lean out and droop. Building them as cones tipped by an Euler
    // angle gave six narrow spikes lying on their sides — it read as an arrow, not a tree. Aiming
    // the blade with setFromUnitVectors puts its long axis along the direction it grows.
    ...Array.from({ length: 7 }, (_, i) => {
      const a = (i / 7) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.sin(a), -0.5, Math.cos(a)).normalize();
      return {
        geometry: CONE, color: leaf,
        matrix: new THREE.Matrix4().compose(
          new THREE.Vector3(dir.x * 1.55, 6.1 + dir.y * 1.55, dir.z * 1.55),
          new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir),
          new THREE.Vector3(0.8, 3.4, 0.16),        // wide, long, thin: a blade
        ),
      };
    }),
  ]) },
  deadtree: { tall: 6, cap: 400, build: (bark = '#4a4038') => mergeParts([
    { geometry: CYL, color: bark, matrix: at(0, 2.2, 0, 0.22, 4.4, 0.22) },
    { geometry: CYL, color: bark, matrix: new THREE.Matrix4().compose(new THREE.Vector3(0.7, 3.6, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.8)), new THREE.Vector3(0.11, 1.9, 0.11)) },
    { geometry: CYL, color: bark, matrix: new THREE.Matrix4().compose(new THREE.Vector3(-0.6, 4.1, 0.2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0, 0.7)), new THREE.Vector3(0.1, 1.6, 0.1)) },
  ]) },
  stump: { tall: 1, cap: 300, build: (bark = '#4a3a2a') => mergeParts([
    { geometry: CYL, color: bark, matrix: at(0, 0.35, 0, 0.42, 0.7, 0.42) },
  ]) },
  rock: { tall: 1.2, cap: 900, build: (stone = '#7d7568') => mergeParts([
    { geometry: ICO, color: stone, matrix: at(0, 0.42, 0, 0.7, 0.55, 0.8) },
    { geometry: ICO, color: stone, matrix: at(0.5, 0.2, 0.3, 0.32, 0.26, 0.3) },
  ]) },
  boulder: { tall: 3, cap: 400, build: (stone = '#6e675c') => mergeParts([
    { geometry: ICO, color: stone, matrix: at(0, 1.1, 0, 1.8, 1.4, 1.6) },
    { geometry: ICO, color: stone, matrix: at(1.2, 0.4, 0.6, 0.6, 0.5, 0.6) },
  ]) },
  bush: { tall: 1.4, cap: 900, build: (leaf = '#3c6b3a') => mergeParts([
    { geometry: SPH, color: leaf, matrix: at(0, 0.5, 0, 0.9, 0.62, 0.9) },
    { geometry: SPH, color: leaf, matrix: at(0.5, 0.36, 0.3, 0.55, 0.42, 0.55) },
  ]) },
  fern: { tall: 1.1, cap: 700, build: (leaf = '#2f6b3c') => mergeParts(
    Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.sin(a), 1.15, Math.cos(a)).normalize();
      return {
        geometry: CONE, color: leaf,
        matrix: new THREE.Matrix4().compose(
          new THREE.Vector3(dir.x * 0.34, 0.2 + dir.y * 0.46, dir.z * 0.34),
          new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir),
          new THREE.Vector3(0.34, 1.1, 0.1),        // flat fronds, not spikes
        ),
      };
    }),
  ) },
  reed: { tall: 1.8, cap: 800, build: (leaf = '#7d8a4a') => mergeParts(
    [0, 1, 2, 3, 4, 5].map(i => ({
      geometry: CONE, color: leaf,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(i * 1.05) * 0.22, 0.85, Math.sin(i * 1.05) * 0.22),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0.14 * Math.cos(i), i, 0.14 * Math.sin(i))),
        new THREE.Vector3(0.07, 1.7, 0.07)),
    })),
  ) },
  cactus: { tall: 3, cap: 400, build: (skin = '#4a7a4a') => mergeParts([
    { geometry: CYL, color: skin, matrix: at(0, 1.2, 0, 0.3, 2.4, 0.3) },
    { geometry: CYL, color: skin, matrix: new THREE.Matrix4().compose(new THREE.Vector3(0.5, 1.5, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2)), new THREE.Vector3(0.16, 0.9, 0.16)) },
    { geometry: CYL, color: skin, matrix: at(0.85, 1.9, 0, 0.16, 0.9, 0.16) },
  ]) },
  crystal: { tall: 3.4, cap: 500, build: (gem = '#9fd8ff') => mergeParts([
    { geometry: OCT, color: gem, matrix: at(0, 1.5, 0, 0.5, 1.6, 0.5) },
    { geometry: OCT, color: gem, matrix: at(0.45, 0.85, 0.2, 0.3, 0.95, 0.3, 0.6) },
    { geometry: OCT, color: gem, matrix: at(-0.4, 0.7, -0.25, 0.24, 0.8, 0.24, 1.1) },
  ]) },
  mushroom: { tall: 2.2, cap: 400, build: (stem = '#d8cdb4', cap = '#8a4a5a') => mergeParts([
    { geometry: CYL, color: stem, matrix: at(0, 0.6, 0, 0.16, 1.2, 0.16) },
    { geometry: SPH, color: cap, matrix: at(0, 1.25, 0, 0.75, 0.42, 0.75) },
  ]) },
  bones: { tall: 0.6, cap: 260, build: (bone = '#cfc7ae') => mergeParts([
    { geometry: CYL, color: bone, matrix: new THREE.Matrix4().compose(new THREE.Vector3(0, 0.12, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), new THREE.Vector3(0.09, 1.7, 0.09)) },
    { geometry: CYL, color: bone, matrix: new THREE.Matrix4().compose(new THREE.Vector3(0.1, 0.12, 0.4), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.6, Math.PI / 2)), new THREE.Vector3(0.08, 1.3, 0.08)) },
  ]) },
  // --- simple structures. Real settlements are phase 4; these are the ruins already on the map.
  ruin: { tall: 4, cap: 300, structure: true, build: (stone = '#8a8275') => mergeParts([
    { geometry: BOX, color: stone, matrix: at(0, 0.9, 0, 3.4, 1.8, 0.7) },
    { geometry: BOX, color: stone, matrix: at(-1.4, 1.9, 0, 0.7, 3.8, 0.7) },
    { geometry: BOX, color: stone, matrix: at(1.5, 1.2, 1.9, 0.7, 2.4, 0.7) },
    { geometry: BOX, color: stone, matrix: at(0.2, 0.3, 2.6, 1.6, 0.6, 0.6, 0.5) },
  ]) },
  column: { tall: 5, cap: 260, structure: true, build: (stone = '#948b7c') => mergeParts([
    { geometry: CYL, color: stone, matrix: at(0, 2.2, 0, 0.42, 4.4, 0.42) },
    { geometry: BOX, color: stone, matrix: at(0, 0.2, 0, 1.2, 0.4, 1.2) },
    { geometry: BOX, color: stone, matrix: at(0, 4.5, 0, 1.1, 0.35, 1.1) },
  ]) },
  standing_stone: { tall: 5, cap: 220, structure: true, build: (stone = '#6a6459') => mergeParts([
    { geometry: BOX, color: stone, matrix: at(0, 2.3, 0, 0.9, 4.6, 0.5) },
  ]) },
};

export const PROP_KEYS = Object.keys(PROP_KINDS);

// ---------------------------------------------------------------------------- what grows where

/**
 * Prop mixes per biome key: [prop, how many per cell]. Anything not listed falls back to `default`.
 * Numbers are for a 64 m cell at density 1 — a rainforest is thick, an ice sheet is bare.
 */
export const KITS = {
  default:         [['rock', 1.2], ['bush', 1.0]],
  grassland:       [['broadleaf', 0.8], ['bush', 3.2], ['rock', 1.0]],
  savanna:         [['broadleaf', 0.7], ['bush', 2.2], ['rock', 1.4]],
  shrubland:       [['bush', 4.0], ['rock', 1.8], ['deadtree', 0.3]],
  temperateForest: [['broadleaf', 9.0], ['conifer', 2.5], ['bush', 3.0], ['stump', 0.5], ['rock', 0.8], ['mushroom', 0.6]],
  rainforest:      [['broadleaf', 11.0], ['palm', 3.0], ['fern', 7.0], ['bush', 3.0], ['mushroom', 1.2]],
  borealForest:    [['conifer', 10.0], ['bush', 1.6], ['rock', 1.4], ['stump', 0.7], ['mushroom', 0.5]],
  beach:           [['palm', 0.7], ['rock', 1.2], ['reed', 0.8]],
  marsh:           [['reed', 9.0], ['deadtree', 1.6], ['bush', 1.4], ['mushroom', 1.0]],
  desert:          [['cactus', 1.4], ['rock', 2.2], ['boulder', 0.4], ['bones', 0.25]],
  badlands:        [['rock', 3.2], ['boulder', 1.2], ['deadtree', 0.5], ['bones', 0.3]],
  tundra:          [['bush', 1.6], ['rock', 2.0], ['conifer', 0.4]],
  ice:             [['rock', 0.5], ['crystal', 0.2]],
  hills:           [['broadleaf', 2.0], ['bush', 3.0], ['rock', 2.6], ['boulder', 0.7]],
  mountains:       [['rock', 3.4], ['boulder', 1.6], ['conifer', 0.8]],
  snowyPeaks:      [['rock', 1.8], ['boulder', 0.8]],
  volcanic:        [['rock', 2.6], ['boulder', 1.2], ['deadtree', 0.4], ['bones', 0.3]],
  blighted:        [['deadtree', 7.0], ['mushroom', 2.4], ['bones', 0.7], ['rock', 1.0]],
  ashPlain:        [['deadtree', 1.2], ['rock', 2.0], ['bones', 0.8]],
  veiledHills:     [['deadtree', 2.4], ['crystal', 1.0], ['rock', 2.0], ['mushroom', 1.0]],
  hallowed:        [['broadleaf', 7.0], ['mushroom', 1.6], ['bush', 2.6], ['fern', 2.0]],
  glimmerwaste:    [['crystal', 4.0], ['rock', 1.6]],
};

/** A tint per biome so the same tree is not the same green in a jungle and a boreal forest. */
const LEAF_TINT = {
  rainforest: '#2f7a3c', temperateForest: '#3f7a45', borealForest: '#2f5c46', hallowed: '#7fd0a0',
  savanna: '#8a9a4a', shrubland: '#78904a', blighted: '#5a4a62', veiledHills: '#6a5a7a',
  glimmerwaste: '#a99ada', marsh: '#4a6b52', tundra: '#6a7a68', desert: '#7a8a4a',
};

/** Structures are rare and deliberate: a ruin every so often, not a ruin per field. */
const STRUCTURE_CHANCE = { blighted: 0.1, veiledHills: 0.12, badlands: 0.08, ashPlain: 0.08, hallowed: 0.1, glimmerwaste: 0.1, default: 0.04 };

// ---------------------------------------------------------------------------- the field of props

/**
 * opts: { seed, radius (cells), density, grassRadius, grassPerCell, onGround }
 */
export function createProps(scene, terrain, opts = {}) {
  const seed = (opts.seed ?? 1) >>> 0;
  const cfg = {
    radius: opts.radius ?? 7,
    density: opts.density ?? 1,
    grassRadius: opts.grassRadius ?? 2,
    grassPerCell: opts.grassPerCell ?? 150,
    structures: opts.structures !== false,
  };

  // one InstancedMesh per kind
  const meshes = {};
  for (const key of PROP_KEYS) {
    const kind = PROP_KINDS[key];
    const geometry = kind.build();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.InstancedMesh(geometry, material, kind.cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.name = 'farhold-prop-' + key;
    scene.add(mesh);
    meshes[key] = mesh;
  }

  // grass is its own mesh: tiny, dense, and only near the player
  const grassGeom = mergeParts([
    { geometry: CONE, color: '#ffffff', matrix: at(0, 0.22, 0, 0.055, 0.44, 0.055) },
    { geometry: CONE, color: '#ffffff', matrix: at(0.1, 0.17, 0.06, 0.045, 0.34, 0.045, 0.9) },
    { geometry: CONE, color: '#ffffff', matrix: at(-0.09, 0.19, -0.05, 0.05, 0.38, 0.05, 2.1) },
  ]);
  const grassMesh = new THREE.InstancedMesh(
    grassGeom,
    new THREE.MeshLambertMaterial({ vertexColors: true }),
    cfg.grassPerCell * 30,
  );
  grassMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  grassMesh.count = 0;
  grassMesh.frustumCulled = false;
  grassMesh.name = 'farhold-grass';
  scene.add(grassMesh);

  const matrix = new THREE.Matrix4();
  const colour = new THREE.Color();
  const solids = new ObstacleField();
  // Tell the field how high the ground is, so an obstacle knows where its roof is and the player
  // can jump over — and onto — anything they genuinely clear. See js/collide.js.
  solids.setGround((x, z) => terrain.heightAt(x, z));
  let centre = [Infinity, Infinity];
  let rebuilds = 0;
  let visible = true;
  let grassVisible = true;

  /** The prop mix for a point, with the biome's own leaf tint. */
  function kitAt(x, z) {
    const id = terrain.biomeIdAt(x, z);
    if (isWater(id)) return null;
    const key = BIOMES[id]?.key;
    return { list: KITS[key] || KITS.default, leaf: LEAF_TINT[key] || null, biomeKey: key };
  }

  /** Fill every instanced mesh from the cells around (px, pz). */
  function rebuild(px, pz) {
    rebuilds++;
    const counts = {};
    for (const key of PROP_KEYS) counts[key] = 0;
    let grass = 0;
    solids.clear();

    const cx0 = Math.round(px / CELL), cz0 = Math.round(pz / CELL);
    // NEAREST CELL FIRST.
    //
    // Reported in play: "when walking between chunks, all the trees and grass and rocks shift
    // around; walking backwards reverts them." Each cell's contents are a pure function of its own
    // coordinates, so nothing ever actually moved — but every prop kind has an instance CAP, and
    // the old scan ran row by row from the top-left of the block. Whichever cells happened to come
    // first spent the cap, so crossing a boundary changed which cells were reached before it ran
    // out, and whole clearings of trees vanished and reappeared elsewhere.
    //
    // Scanning outward from the player spends the cap on the ground you can actually see, and that
    // ordering barely changes as you walk — so the trees near you stay put and only the far ones,
    // which you cannot make out anyway, drop off the end.
    for (const [dx, dz] of spiralOffsets(cfg.radius)) {
      {
        const cx = cx0 + dx, cz = cz0 + dz;
        const rng = makeRng(cellSeed(seed, cx, cz));
        const baseX = cx * CELL, baseZ = cz * CELL;
        const kit = kitAt(baseX, baseZ);
        if (!kit) continue;

        for (const [key, per] of kit.list) {
          const want = per * cfg.density;
          let n = Math.floor(want);
          if (rng() < want - n) n++;
          for (let i = 0; i < n; i++) {
            if (counts[key] >= PROP_KINDS[key].cap) break;
            const x = baseX + (rng() - 0.5) * CELL;
            const z = baseZ + (rng() - 0.5) * CELL;
            if (terrain.underwater(x, z)) continue;
            // nothing grows on a cliff face, and nothing grows in the middle of a road
            if (terrain.slopeAt(x, z, 4) > 0.75) continue;
            if (terrain.roadAt(x, z) > 0.35) continue;
            const y = terrain.heightAt(x, z);
            const scale = 0.7 + rng() * 0.75;
            matrix.compose(
              new THREE.Vector3(x, y, z),
              new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * Math.PI * 2, 0)),
              new THREE.Vector3(scale, scale * (0.85 + rng() * 0.4), scale),
            );
            meshes[key].setMatrixAt(counts[key], matrix);
            // a little colour variation, plus the biome's leaf tint on anything leafy
            const tint = kit.leaf && ['broadleaf', 'conifer', 'palm', 'bush', 'fern', 'reed'].includes(key)
              ? colour.set(kit.leaf)
              : colour.setScalar(1);
            const v = 0.82 + rng() * 0.32;
            meshes[key].setColorAt(counts[key], colour.setRGB(tint.r * v, tint.g * v, tint.b * v));
            const solid = PROP_SOLIDS[key];
            if (solid) solids.add(x, z, solid[0] * scale, solid[1] * scale);
            counts[key]++;
          }
        }

        // a rare ruin, column or standing stone
        if (cfg.structures) {
          // density scales the ruins too, so "bare" really does mean bare
          const chance = (STRUCTURE_CHANCE[kit.biomeKey] ?? STRUCTURE_CHANCE.default) * Math.min(1, cfg.density);
          if (rng() < chance) {
            const key = rng.pick(['ruin', 'column', 'standing_stone']);
            if (counts[key] < PROP_KINDS[key].cap) {
              const x = baseX + (rng() - 0.5) * CELL * 0.6;
              const z = baseZ + (rng() - 0.5) * CELL * 0.6;
              if (!terrain.underwater(x, z) && terrain.slopeAt(x, z, 6) < 0.35 && terrain.roadAt(x, z) < 0.2) {
                const y = terrain.heightAt(x, z);
                const scale = 0.8 + rng() * 0.6;
                matrix.compose(
                  new THREE.Vector3(x, y - 0.2, z),
                  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * Math.PI * 2, 0)),
                  new THREE.Vector3(scale, scale, scale),
                );
                meshes[key].setMatrixAt(counts[key], matrix);
                meshes[key].setColorAt(counts[key], colour.setScalar(0.85 + rng() * 0.3));
                if (PROP_SOLIDS[key]) solids.add(x, z, PROP_SOLIDS[key][0] * scale, PROP_SOLIDS[key][1] * scale);
                counts[key]++;
                // a column usually has friends
                if (key === 'column') {
                  for (let k = 0; k < 3 && counts.column < PROP_KINDS.column.cap; k++) {
                    const a = rng() * Math.PI * 2, r = 3 + rng() * 5;
                    const fx = x + Math.cos(a) * r, fz = z + Math.sin(a) * r;
                    if (terrain.underwater(fx, fz)) continue;
                    matrix.compose(
                      new THREE.Vector3(fx, terrain.heightAt(fx, fz) - 0.2, fz),
                      new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 0.2 - 0.1, rng() * 6.3, 0)),
                      new THREE.Vector3(scale * 0.9, scale * (0.5 + rng() * 0.6), scale * 0.9),
                    );
                    meshes.column.setMatrixAt(counts.column, matrix);
                    meshes.column.setColorAt(counts.column, colour.setScalar(0.85 + rng() * 0.3));
                    solids.add(fx, fz, PROP_SOLIDS.column[0] * scale, PROP_SOLIDS.column[1] * scale);
                    counts.column++;
                  }
                }
              }
            }
          }
        }

        // grass, only in the cells you are standing among
        if (Math.abs(dx) <= cfg.grassRadius && Math.abs(dz) <= cfg.grassRadius && grassVisible) {
          const id = terrain.biomeIdAt(baseX, baseZ);
          const tags = BIOMES[id]?.tags || [];
          const lush = tags.includes('fertile') ? 1 : tags.includes('open') ? 0.7 : tags.includes('forest') ? 0.6 : tags.includes('cold') || tags.includes('dry') || tags.includes('harsh') ? 0.12 : 0.35;
          const n = Math.floor(cfg.grassPerCell * lush * cfg.density);
          const tint = colour.set(kit.leaf || '#5f8f45');
          const tr = tint.r, tg = tint.g, tb = tint.b;
          for (let i = 0; i < n && grass < grassMesh.count + grassMesh.instanceMatrix.count; i++) {
            if (grass >= grassMesh.instanceMatrix.count) break;
            const x = baseX + (rng() - 0.5) * CELL;
            const z = baseZ + (rng() - 0.5) * CELL;
            if (terrain.underwater(x, z)) continue;
            if (terrain.slopeAt(x, z, 3) > 0.6) continue;
            if (terrain.roadAt(x, z) > 0.45) continue;
            const s = 0.7 + rng() * 0.9;
            matrix.compose(
              new THREE.Vector3(x, terrain.heightAt(x, z), z),
              new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 6.3, 0)),
              new THREE.Vector3(s, s * (0.7 + rng() * 0.8), s),
            );
            grassMesh.setMatrixAt(grass, matrix);
            const v = 0.72 + rng() * 0.5;
            grassMesh.setColorAt(grass, colour.setRGB(tr * v, tg * v, tb * v));
            grass++;
          }
        }
      }
    }

    for (const key of PROP_KEYS) {
      const mesh = meshes[key];
      mesh.count = visible ? counts[key] : 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    grassMesh.count = visible && grassVisible ? grass : 0;
    grassMesh.instanceMatrix.needsUpdate = true;
    if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
  }

  return {
    meshes, grassMesh, cfg, solids,
    /** Follow the player; only regenerates when you cross into a new prop cell. */
    update(x, z, force = false) {
      const cx = Math.round(x / CELL), cz = Math.round(z / CELL);
      if (!force && cx === centre[0] && cz === centre[1]) return false;
      centre = [cx, cz];
      rebuild(x, z);
      return true;
    },
    /** Change how thick the world is and rebuild on the spot. */
    setDensity(d, x, z) { cfg.density = clamp(d, 0, 4); rebuild(x, z); },
    setVisible(v, x, z) { visible = !!v; rebuild(x, z); },
    setGrass(v, x, z) { grassVisible = !!v; rebuild(x, z); },
    stats() {
      let instances = 0, drawCalls = 0, triangles = 0;
      for (const key of PROP_KEYS) {
        const m = meshes[key];
        instances += m.count;
        if (m.count > 0) drawCalls++;
        triangles += m.count * (m.geometry.attributes.position.count / 3);
      }
      if (grassMesh.count) { drawCalls++; instances += grassMesh.count; triangles += grassMesh.count * (grassGeom.attributes.position.count / 3); }
      return { instances, drawCalls, triangles: Math.round(triangles), grass: grassMesh.count, rebuilds, density: cfg.density, solids: solids.count };
    },
    dispose() {
      for (const key of PROP_KEYS) {
        const m = meshes[key];
        scene.remove(m); m.geometry.dispose(); m.material.dispose(); m.dispose();
      }
      scene.remove(grassMesh); grassGeom.dispose(); grassMesh.material.dispose(); grassMesh.dispose();
    },
  };
}
