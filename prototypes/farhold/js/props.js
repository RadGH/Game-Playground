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
    /**
     * `toNonIndexed()` RETURNS THE SAME OBJECT WHEN THERE IS NOTHING TO DO.
     *
     * Three.js warns "BufferGeometry is already non-indexed" and hands `this` straight back. Every
     * base geometry up there is a module-level `const` shared by every part that uses it — so
     * `applyMatrix4` was transforming the SHARED one, and the second slab of a tor was built on top
     * of the first slab's transform, the third on top of that, and so on. Five of the twelve giants
     * (tor, stone_arch, crystal_spire, ice_fang, rib_arch) reuse one base several times, and every
     * one of them was coming out at coordinates in the thousands. That is a very large part of "its
     * full of other giant shapes everywhere. They don't look like trees."
     *
     * The warning has been in the console of every test run for weeks, which is its own lesson.
     */
    const src = p.geometry.toNonIndexed();
    const g = src === p.geometry ? src.clone() : src;
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


// ---------------------------------------------------------------------------- megaflora
//
// "Give another pass over each biome and add large objects, depending on biome, giant trees,
// boulders, arches, or other features. They should be 2-3 times taller than our tallest trees
// currently."
//
// The tallest ordinary prop above is the conifer at 9 metres, so everything here stands between 17
// and 26 — two to three times that. At that height a tree stops being scenery and becomes a thing
// you steer by: a valley with three of them in it is a valley you recognise on the way back.
// `data/megaflora.json` owns which biome gets which, how often, and how much room each takes up;
// this owns the shapes.
//
// Two rules keep them cheap. Each is one InstancedMesh like every other prop, capped in the low
// teens, because a dozen 24 m trees fill a skyline on their own. And they are rolled on their OWN
// random stream (the 0x4d67 salt below) instead of sharing the cell's rng — so adding them did not
// move a single tree that was already standing, which is the exact failure the "nearest cell first"
// note above was written about.

/** Like `at`, but with all three rotations. A leaning trunk needs more than a spin. */
const tilt = (x, y, z, sx, sy, sz, ex = 0, ey = 0, ez = 0) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(ex, ey, ez)),
    new THREE.Vector3(sx, sy, sz),
  );

/**
 * One builder per megaflora kind, returning a single merged geometry — same contract as
 * `PROP_KINDS[key].build`. Keys must match `kinds` in data/megaflora.json; the test checks that.
 */
/**
 * The catalogue, fetched at IMPORT rather than inside `createProps`.
 *
 * Same reason js/sites.js does it: a page that lands and asks about the world on the next line was
 * finding nothing there yet. By the time `createProps` is reached, main.js has generated a star, a
 * system, a planet and a terrain, so this is long since back and the giants are in the first
 * rebuild rather than the second.
 */
let MEGA_DATA = null;
const MEGA_READY = fetch(new URL('../data/megaflora.json', import.meta.url))
  .then(r => r.json())
  .then(d => { MEGA_DATA = d; return d; })
  .catch(() => null);      // no giants this run; the world still stands

export const MEGA_BUILDERS = {
  // An old broadleaf stands on a flare of buttress roots, not on a pole. Without them a 13 m trunk
  // reads as a telegraph post with a bush on it.
  elder_broadleaf: (bark = '#4a3a2a', leaf = '#3f7a45') => mergeParts([
    { geometry: CYL, color: bark, matrix: at(0, 6.5, 0, 1.5, 13, 1.5) },
    ...[0, 1, 2, 3, 4].map(i => {
      const a = (i / 5) * Math.PI * 2;
      return { geometry: CONE, color: bark, matrix: at(Math.cos(a) * 1.7, 1.7, Math.sin(a) * 1.7, 1.0, 3.4, 1.0) };
    }),
    { geometry: CYL, color: bark, matrix: tilt(2.6, 13.5, 0, 0.5, 6, 0.5, 0, 0, -0.9) },
    { geometry: CYL, color: bark, matrix: tilt(-2.4, 14, 0.8, 0.45, 5.5, 0.45, 0.3, 0, 0.85) },
    { geometry: SPH, color: leaf, matrix: at(0, 18.5, 0, 8.5, 5.0, 8.5) },
    { geometry: SPH, color: leaf, matrix: at(4.6, 16.2, 2.0, 4.6, 3.2, 4.6) },
    { geometry: SPH, color: leaf, matrix: at(-4.2, 16.8, -2.4, 4.2, 3.0, 4.2) },
    { geometry: SPH, color: leaf, matrix: at(0.8, 21.4, 0.4, 4.4, 2.6, 4.4) },
  ]),

  crown_conifer: (bark = '#3b2f24', leaf = '#2f5c46') => mergeParts([
    { geometry: CYL, color: bark, matrix: at(0, 8, 0, 1.0, 16, 1.0) },
    ...[0, 1, 2, 3].map(i => {
      const a = (i / 4) * Math.PI * 2;
      return { geometry: CONE, color: bark, matrix: at(Math.cos(a) * 1.1, 1.2, Math.sin(a) * 1.1, 0.7, 2.4, 0.7) };
    }),
    { geometry: CONE, color: leaf, matrix: at(0, 9.5, 0, 6.2, 9.0, 6.2) },
    { geometry: CONE, color: leaf, matrix: at(0, 15.5, 0, 4.6, 7.5, 4.6) },
    { geometry: CONE, color: leaf, matrix: at(0, 20.5, 0, 3.0, 6.0, 3.0) },
    { geometry: CONE, color: leaf, matrix: at(0, 24.0, 0, 1.5, 4.0, 1.5) },
  ]),

  // Fronds are aimed with setFromUnitVectors for the same reason the ordinary palm's are: tipping a
  // cone with an Euler angle gives you spikes lying on their sides, not blades.
  /**
   * A PALM CROWN DROOPS. A flat one is a table on a post.
   *
   * The fronds used to splay at 23 degrees below horizontal and reach nine metres, which made a
   * plate eighteen metres across sitting on a sixteen-metre trunk — and from any distance that is a
   * disc, not a tree. The user's words were "giant thin discs floating in the air". They now leave
   * the crown at 44 degrees down and reach less far, and the ring alternates between long and short
   * so the outline is ragged rather than a wheel. A small crown mass at the top closes the middle,
   * which is what stops you seeing sky through the centre of it.
   */
  shelf_palm: (bark = '#6b5436', leaf = '#4f8a40') => mergeParts([
    /**
     * SECOND PASS, AND THE FIRST ONE ONLY HALF FIXED IT.
     *
     * Round 11 cured the eighteen-metre disc by steepening the fronds. Looking at all twelve giants
     * side by side afterwards showed what was left: a sixteen-metre bare trunk carrying a crown
     * about four metres across reads as a lamp post with a shrub on it, whatever angle the fronds
     * leave at. A palm's crown is roughly a third of its height and this one was a fifth.
     *
     * So the trunk comes down to 12 m and the crown goes up: eleven fronds instead of nine, longer,
     * wider, in two ranks — an upper rank that arches out and a lower one that hangs. Two ranks is
     * what stops it being a single plane of blades seen edge-on from the side.
     */
    { geometry: CYL, color: bark, matrix: tilt(0.4, 7, 0, 0.64, 14, 0.58, 0, 0, -0.055) },
    { geometry: CYL, color: bark, matrix: at(0, 0.8, 0, 1.5, 1.6, 1.5) },
    // the crown mass, which is what closes the middle so you do not see sky through it
    { geometry: SPH, color: leaf, matrix: at(0.8, 14.4, 0, 2.9, 2.2, 2.9) },
    ...Array.from({ length: 11 }, (_, i) => {
      const upper = i % 2 === 0;
      const a = (i / 11) * Math.PI * 2;
      // the upper rank arches OUT (-0.34), the lower one hangs (-1.0) — a palm is two ranks deep
      const drop = upper ? -0.34 : -1.0;
      const dir = new THREE.Vector3(Math.sin(a), drop, Math.cos(a)).normalize();
      const long = upper ? 1 : 0.82;
      const from = new THREE.Vector3(0.8, upper ? 14.8 : 14.1, 0);
      return {
        geometry: CONE, color: leaf,
        matrix: new THREE.Matrix4().compose(
          from.clone().addScaledVector(dir, 4.0 * long),
          new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir),
          new THREE.Vector3(2.0, 8.6 * long, 0.42),
        ),
      };
    }),
  ]),

  // A dead giant, split open. The dark core is what makes it read as hollow rather than as a pole.
  hollow_snag: (bark = '#4a4038') => mergeParts([
    { geometry: CYL, color: bark, matrix: at(0, 7, 0, 1.45, 14, 1.25) },
    { geometry: CYL, color: '#221c18', matrix: at(0, 3.4, 0.85, 0.75, 6.8, 0.6) },
    { geometry: CYL, color: bark, matrix: tilt(2.4, 14.6, 0, 0.45, 7, 0.45, 0, 0, -0.95) },
    { geometry: CYL, color: bark, matrix: tilt(-2.0, 15.4, 0.6, 0.4, 6.2, 0.4, 0.25, 0, 0.85) },
    { geometry: CONE, color: bark, matrix: at(0, 17.4, 0, 1.05, 7.0, 1.05) },
  ]),

  // A tor is stacked, weathered slabs — one boulder scaled up just looks like a bad boulder.
  tor: (stone = '#6e675c') => mergeParts([
    { geometry: ICO, color: stone, matrix: at(0, 3.2, 0, 5.4, 3.4, 5.0) },
    { geometry: ICO, color: stone, matrix: at(0.6, 8.0, -0.4, 4.2, 2.6, 4.0, 0.8) },
    { geometry: ICO, color: stone, matrix: at(-0.5, 12.2, 0.5, 3.2, 2.2, 3.0, 1.9) },
    { geometry: ICO, color: stone, matrix: at(0.3, 15.8, -0.2, 2.2, 1.8, 2.2, 2.7) },
    { geometry: ICO, color: stone, matrix: at(0, 18.0, 0, 1.2, 1.0, 1.2, 0.4) },
    { geometry: ICO, color: stone, matrix: at(4.8, 1.0, 3.2, 1.8, 1.1, 1.6) },
  ]),

  // The span is seven blocks walked round a half-circle, each tipped to follow it. Two legs and a
  // flat lintel read as a doorway; this reads as weather.
  stone_arch: (stone = '#8a7a5e') => mergeParts([
    { geometry: BOX, color: stone, matrix: at(-7.4, 7.0, 0, 3.6, 14, 3.0) },
    { geometry: BOX, color: stone, matrix: at(7.2, 6.6, 0, 3.2, 13.2, 2.8) },
    ...Array.from({ length: 7 }, (_, i) => {
      const t = (i / 6) * Math.PI;
      return {
        geometry: BOX, color: stone,
        matrix: tilt(-7.2 + (i / 6) * 14.4, 13.6 + Math.sin(t) * 5.8, 0, 3.0, 2.8, 2.8, 0, 0, -Math.cos(t) * 0.72),
      };
    }),
    { geometry: BOX, color: stone, matrix: at(0, 19.8, 0, 3.4, 2.2, 3.0) },
    { geometry: ICO, color: stone, matrix: at(-9.5, 0.8, 2.4, 1.6, 1.0, 1.4) },
  ]),

  basalt_stack: (stone = '#3e3a3c') => mergeParts([
    { geometry: CYL, color: stone, matrix: at(-0.6, 11, -0.4, 2.2, 22, 2.2, 0.2) },
    ...[[2.9, 1.2, 15, 1.5], [-2.6, -1.8, 19, 1.7], [1.5, -3.1, 11, 1.2], [-3.4, 2.7, 13, 1.4], [0.5, 3.8, 8, 1.0], [3.4, -2.4, 6, 0.9]]
      .map(([x, z, h, r], i) => ({ geometry: CYL, color: stone, matrix: at(x, h / 2, z, r, h, r, i * 0.5) })),
    { geometry: CYL, color: stone, matrix: tilt(5.6, 0.9, 1.6, 1.0, 5.4, 1.0, 0, 0.4, Math.PI / 2 - 0.15) },
  ]),

  crystal_spire: (gem = '#9fd8ff') => mergeParts([
    { geometry: ICO, color: '#4a4a56', matrix: at(0, 0.6, 0, 3.8, 1.2, 3.8) },
    { geometry: OCT, color: gem, matrix: at(0, 12, 0, 2.6, 13, 2.6) },
    { geometry: OCT, color: gem, matrix: at(2.9, 6.6, 1.3, 1.6, 7.6, 1.6, 0.7) },
    { geometry: OCT, color: gem, matrix: at(-2.5, 5.4, -1.7, 1.3, 6.2, 1.3, 1.6) },
    { geometry: OCT, color: gem, matrix: at(1.1, 3.2, -2.9, 0.9, 4.2, 0.9, 2.4) },
    { geometry: OCT, color: gem, matrix: tilt(-3.6, 2.0, 2.4, 0.8, 4.6, 0.8, 0.3, 0.8, 0.28) },
  ]),

  ice_fang: (ice = '#cfe8ff') => mergeParts([
    { geometry: CONE, color: ice, matrix: at(0, 10.5, 0, 3.0, 21, 3.0) },
    { geometry: CONE, color: ice, matrix: tilt(3.4, 5.6, 1.4, 1.5, 11, 1.5, 0, 0, -0.2) },
    { geometry: CONE, color: ice, matrix: tilt(-2.8, 4.2, -1.8, 1.2, 8.4, 1.2, 0.18, 0, 0.16) },
    { geometry: ICO, color: '#a8c6dd', matrix: at(0, 0.5, 0, 4.2, 1.0, 4.0) },
  ]),

  cap_mushroom: (stem = '#d8cdb4', cap = '#8a4a5a') => mergeParts([
    { geometry: CYL, color: stem, matrix: at(0, 6.5, 0, 1.15, 13, 1.15) },
    { geometry: CYL, color: stem, matrix: at(0, 0.5, 0, 2.0, 1.0, 2.0) },
    { geometry: CYL, color: '#e0d6c0', matrix: at(0, 9.6, 0, 2.5, 0.4, 2.5) },
    { geometry: SPH, color: cap, matrix: at(0, 13.9, 0, 6.8, 4.2, 6.8) },
    { geometry: CYL, color: stem, matrix: at(4.4, 2.1, 2.7, 0.42, 4.2, 0.42) },
    { geometry: SPH, color: cap, matrix: at(4.4, 4.3, 2.7, 2.4, 1.6, 2.4) },
  ]),

  // Something died here a long time ago and the ribs stayed up. The halves lean in at 0.3 rad so the
  // cage closes over your head instead of standing as two fences.
  /**
   * A RIBCAGE IS CURVED, AND STRAIGHT POLES IN A TRIANGLE ARE SCAFFOLDING.
   *
   * Which is exactly what the first version looked like beside the other eleven: an A-frame, or a
   * ladder leaning against nothing. The second attempt built each rib from three segments placed by
   * their centres — and three segments that are not chained end to end do not meet, so it came out
   * as a heap of loose sticks, which was worse.
   *
   * This walks a half-circle and drops a short segment at each step, tilted to follow the tangent —
   * the same construction `stone_arch` uses, and the reason that one reads as an arch. Six ribs,
   * each a semicircle in its own z-plane, tapering towards the tail.
   */
  rib_arch: (bone = '#cfc7ae') => mergeParts([
    // …at the size of a giant. The first arc version came out ten metres tall, which is shorter
    // than the ordinary conifers around it — a dead thing you step over, not one you walk under.
    ...[-13.0, -8.1, -3.0, 2.0, 7.1, 11.9].flatMap((z, ri) => {
      const k = [0.70, 0.88, 1.0, 0.98, 0.84, 0.64][ri];   // widest at the shoulder
      /**
       * An ELLIPSE, not a circle. A ribcage is tall and narrow; a circular arch as tall as this one
       * needs to be came out thirty-six metres across, which is a bridge.
       */
      const RY = 18.6 * k, RX = 6.6 * k;
      const STEPS = 10;
      return Array.from({ length: STEPS }, (_, i) => {
        const t = ((i + 0.5) / STEPS) * Math.PI;
        const x = -Math.cos(t) * RX;
        const y = Math.sin(t) * RY;
        /**
         * The tangent to an ellipse is (RX sin t, RY cos t), which is NOT at angle `-t` the way a
         * circle's is — that shortcut worked while the two radii were equal and falls apart the
         * moment they are not. The rotation about Z carrying a cylinder's +Y axis onto a direction
         * (tx, ty) is `atan2(-tx, ty)`.
         */
        const tx = RX * Math.sin(t), ty = RY * Math.cos(t);
        const len = Math.hypot(tx, ty);
        // …and the segment is as long as the step it has to cover, so consecutive ones meet
        const seg = (len * Math.PI) / STEPS * 1.1;
        return {
          geometry: CYL, color: bone,
          matrix: tilt(x, y, z, 0.32 * k, seg, 0.32 * k, 0, 0, Math.atan2(-tx, ty)),
        };
      });
    }),
    // the spine, laid along the top of the ribs rather than through them
    { geometry: CYL, color: bone, matrix: tilt(0, 17.6, -0.6, 0.5, 28, 0.5, Math.PI / 2, 0, 0) },
    // a skull and a jaw at one end, which is what makes it a body and not a ruin
    { geometry: SPH, color: bone, matrix: at(0, 3.0, 19.4, 3.0, 2.6, 4.0) },
    { geometry: BOX, color: bone, matrix: tilt(0, 1.5, 22.2, 1.9, 1.4, 3.6, -0.18, 0, 0) },
    { geometry: CYL, color: bone, matrix: tilt(0, 5.2, 15.6, 0.55, 7.4, 0.55, Math.PI / 2 - 0.45, 0, 0) },
    // and a loose rib on the ground, because nothing this old is still complete
    { geometry: CYL, color: bone, matrix: tilt(4.6, 0.4, -17.4, 0.32, 8.0, 0.32, 0, 0.5, Math.PI / 2) },
  ]),

  mast_cactus: (skin = '#4a7a4a') => mergeParts([
    { geometry: CYL, color: skin, matrix: at(0, 8.5, 0, 1.5, 17, 1.5) },
    { geometry: CYL, color: skin, matrix: tilt(2.2, 8.5, 0, 0.7, 4.4, 0.7, 0, 0, Math.PI / 2) },
    { geometry: CYL, color: skin, matrix: at(4.2, 11.4, 0, 0.7, 6.0, 0.7) },
    { geometry: CYL, color: skin, matrix: tilt(-2.0, 11.5, 0.4, 0.62, 4.0, 0.62, 0, 0, Math.PI / 2) },
    { geometry: CYL, color: skin, matrix: at(-3.9, 14.0, 0.4, 0.62, 5.2, 0.62) },
    { geometry: CONE, color: skin, matrix: at(0, 17.4, 0, 1.5, 1.4, 1.5) },
  ]),
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

  /**
   * MEGAFLORA ARRIVES A MOMENT AFTER THE REST OF THE WORLD.
   *
   * The catalogue is JSON and `createProps` is synchronous, so the giants cannot be there on the
   * first frame. Until the file lands there are simply none, and when it does we rebuild wherever
   * the player is standing — one extra rebuild at boot, and nothing to wire up anywhere else.
   */
  let mega = null;
  const megaMeshes = {};
  let lastPoint = null;
  const buildMega = data => {
    if (!data) return;
    mega = data;
    for (const [key, spec] of Object.entries(data.kinds || {})) {
      const build = MEGA_BUILDERS[key];
      if (!build) continue;
      const mesh = new THREE.InstancedMesh(build(), new THREE.MeshLambertMaterial({ vertexColors: true }), spec.cap || 12);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      // an empty InstancedMesh still costs a slot in the render list, and there are twelve of
      // these — so an unused giant is hidden outright rather than drawn with nought instances
      mesh.visible = false;
      mesh.name = 'farhold-mega-' + key;
      scene.add(mesh);
      megaMeshes[key] = mesh;
    }
    if (lastPoint) rebuild(lastPoint[0], lastPoint[1]);
  };
  if (MEGA_DATA) buildMega(MEGA_DATA); else MEGA_READY.then(buildMega);

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
    lastPoint = [px, pz];
    const counts = {};
    for (const key of PROP_KEYS) counts[key] = 0;
    const megaCounts = {};
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
            // `plantable` is stricter than `underwater`: a lake sheet reaches past its own cells,
            // so a tree that merely was not standing ON water could still be standing IN it
            if (!terrain.plantable(x, z)) continue;
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
              if (terrain.plantable(x, z) && terrain.slopeAt(x, z, 6) < 0.35 && terrain.roadAt(x, z) < 0.2) {
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
                    if (!terrain.plantable(fx, fz)) continue;
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

        // A GIANT, NOW AND THEN.
        //
        // Own random stream, own roll, at most one per cell: two 24 m trees in one 64 m cell is not
        // a landmark, it is a wall you cannot see past. The ground has to be flatter than an
        // ordinary tree needs (nothing this heavy stays up on a slope) and off the road, because
        // nobody lets a thing this size grow through the highway.
        if (mega) {
          const mrng = makeRng(cellSeed(seed ^ 0x4d67, cx, cz));
          const mix = mega.biomes?.[kit.biomeKey] || mega.biomes?.default || [];
          for (const [key, per] of mix) {
            const mesh = megaMeshes[key];
            if (!mesh) continue;
            if (mrng() > per * Math.min(1.6, cfg.density)) continue;
            const n = megaCounts[key] || 0;
            if (n >= mesh.instanceMatrix.count) continue;
            const x = baseX + (mrng() - 0.5) * CELL * 0.7;
            const z = baseZ + (mrng() - 0.5) * CELL * 0.7;
            if (!terrain.plantable(x, z)) continue;
            if (terrain.slopeAt(x, z, 8) > (mega.minSlope ?? 0.42)) continue;
            if (terrain.roadAt(x, z) > (mega.roadClear ?? 0.2)) continue;
            const spec = mega.kinds[key] || {};
            const scale = 0.85 + mrng() * 0.4;
            matrix.compose(
              new THREE.Vector3(x, terrain.heightAt(x, z) - 0.3, z),
              new THREE.Quaternion().setFromEuler(new THREE.Euler(0, mrng() * Math.PI * 2, 0)),
              new THREE.Vector3(scale, scale * (0.9 + mrng() * 0.25), scale),
            );
            mesh.setMatrixAt(n, matrix);
            /**
             * VARY THE BRIGHTNESS, DO NOT REPAINT THE WHOLE TREE.
             *
             * `setColorAt` is a per-INSTANCE colour and it multiplies every vertex in the mesh, so
             * painting a leafy giant with the biome's leaf colour took the bark with it: trunk,
             * roots, branches and canopy all came out one flat shade, which is why a twenty-metre
             * palm read as a dark post with a slab on top rather than as a tree. The builders
             * already bake a bark colour and a leaf colour into the vertices — that distinction is
             * the whole reason they are two colours — so all an instance may do is shift the
             * brightness a little, the way the ordinary trees do.
             */
            const v = 0.88 + mrng() * 0.22;
            mesh.setColorAt(n, colour.setScalar(v));
            if (spec.solid) solids.add(x, z, spec.solid[0] * scale, spec.solid[1] * scale);
            megaCounts[key] = n + 1;
            break;
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
            // `plantable` is stricter than `underwater`: a lake sheet reaches past its own cells,
            // so a tree that merely was not standing ON water could still be standing IN it
            if (!terrain.plantable(x, z)) continue;
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
    for (const [key, mesh] of Object.entries(megaMeshes)) {
      mesh.count = visible ? (megaCounts[key] || 0) : 0;
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    grassMesh.count = visible && grassVisible ? grass : 0;
    grassMesh.instanceMatrix.needsUpdate = true;
    if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
  }

  return {
    meshes, grassMesh, cfg, solids, megaMeshes,
    /** What the megaflora catalogue said, once it arrived. Null until then. */
    get megaflora() { return mega; },
    /** Follow the player; only regenerates when you cross into a new prop cell. */
    update(x, z, force = false) {
      const cx = Math.round(x / CELL), cz = Math.round(z / CELL);
      if (!force && cx === centre[0] && cz === centre[1]) return false;
      centre = [cx, cz];
      rebuild(x, z);
      return true;
    },
    /** Change how thick the world is and rebuild on the spot. */
    /**
     * Up to 6x, because the settings panel now offers it.
     *
     * The clamp was 4 while the slider stopped at 2, so it never showed; raising the slider to 6x
     * for "a target strong graphics card" would have silently capped at 4 and the top two notches
     * would have done nothing. A slider that lies is the bug this round keeps finding.
     */
    setDensity(d, x, z) { cfg.density = clamp(d, 0, 6); rebuild(x, z); },
    /**
     * How far out props are placed, in prop cells.
     *
     * "You can also see trees and other props only nearby. As you ascend in the air, trees should
     * appear from farther away but at lower quality level, until disappearing everywhere when
     * reaching higher altitude."
     *
     * Climbing therefore does two things at once: the RADIUS grows, so the forest reaches toward
     * the horizon instead of ending in a circle a hundred metres out, and the DENSITY falls, so the
     * instance budget pays for the extra ground rather than for more trees on the same ground. Past
     * a ceiling the density reaches zero and they are gone, which is right — from four kilometres
     * up you cannot make out a bush.
     */
    setRadius(r, x, z) {
      const want = Math.max(1, Math.round(r));
      if (want === cfg.radius) return false;
      cfg.radius = want;
      rebuild(x, z);
      return true;
    },
    get radius() { return cfg.radius; },
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
      let giants = 0;
      for (const mesh of Object.values(megaMeshes)) {
        giants += mesh.count;
        instances += mesh.count;
        if (mesh.count > 0) drawCalls++;
        triangles += mesh.count * (mesh.geometry.attributes.position.count / 3);
      }
      if (grassMesh.count) { drawCalls++; instances += grassMesh.count; triangles += grassMesh.count * (grassGeom.attributes.position.count / 3); }
      return { instances, drawCalls, triangles: Math.round(triangles), grass: grassMesh.count, giants, rebuilds, density: cfg.density, solids: solids.count };
    },
    dispose() {
      for (const key of PROP_KEYS) {
        const m = meshes[key];
        scene.remove(m); m.geometry.dispose(); m.material.dispose(); m.dispose();
      }
      for (const mesh of Object.values(megaMeshes)) {
        scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose();
      }
      scene.remove(grassMesh); grassGeom.dispose(); grassMesh.material.dispose(); grassMesh.dispose();
    },
  };
}
