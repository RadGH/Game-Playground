// Farhold — the things the map already knew about: rivers, roads, bridges and settlements.
//
// World Forge traces every river from its source to the sea, lays an A* road network between the
// towns it founded, and records where those towns are and how big they got. Phase 1 ignored all of
// it. This file draws it.
//
//   const features = createFeatures(scene, terrain, { palette, seed });
//   features.update(player.x, player.z);
//
// Rivers and roads are not painted on top of the ground — `js/planet.js` carves them into the
// terrain height itself, so a river runs along the floor of its own valley and a road sits in a
// shallow cutting. This file then lays the water surface and the road surface into those channels,
// and puts a bridge wherever a road crosses a river.
//
// Settlements are buildings you can walk among, sized from the map's own node (village → town →
// city → capital). They have no people in them: NPCs, shops and interiors are phase 4.

import * as THREE from 'three';
import { BUILDING_INFO, wantsFor, streetPlan, footprintOf } from './town-plan.js';
import { waterRibbon, lakeSheet } from './water-plan.js';
import { makeRng, clamp } from '../../../worldgen/js/noise.js';
import { M_PER_CELL } from './planet.js';
import { ObstacleField, BUILDING_SOLIDS } from './collide.js';

const IDX_XY = (i, w) => [i % w, Math.floor(i / w)];

/** A flat ribbon following a polyline, draped on the ground. Returns vertex/index arrays. */
function ribbon(points, heights, width, { lift = 0.1 } = {}) {
  const position = [], normal = [], index = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    let dx = next[0] - prev[0], dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const nx = -dz, nz = dx;
    const half = (typeof width === 'function' ? width(i) : width) / 2;
    const y = heights[i] + lift;
    position.push(points[i][0] + nx * half, y, points[i][1] + nz * half);
    position.push(points[i][0] - nx * half, y, points[i][1] - nz * half);
    normal.push(0, 1, 0, 0, 1, 0);
    if (i > 0) {
      const a = (i - 1) * 2, b = a + 1, c = i * 2, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  return { position, normal, index };
}

// ---------------------------------------------------------------------------- building geometry

function mergeParts(parts) {
  let total = 0;
  const prepared = parts.map(p => {
    const g = p.geometry.toNonIndexed();
    g.applyMatrix4(p.matrix);
    g.computeVertexNormals();
    total += g.attributes.position.count;
    return { g, color: new THREE.Color(p.color) };
  });
  const position = new Float32Array(total * 3), normal = new Float32Array(total * 3), color = new Float32Array(total * 3);
  let o = 0;
  for (const { g, color: c } of prepared) {
    position.set(g.attributes.position.array, o * 3);
    normal.set(g.attributes.normal.array, o * 3);
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

const mat4 = (x, y, z, sx, sy, sz, ry = 0) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
  new THREE.Vector3(sx, sy, sz),
);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8);
const CONE4 = new THREE.ConeGeometry(1, 1, 4);
// an eight-sided stone for a shrine marker, so it reads as carved rather than cut
const OCT = new THREE.OctahedronGeometry(1, 0);

const WALL_COLOR = '#cdbfa6', BEAM = '#5a4632', ROOF = '#7a4a3a', STONE = '#8a8275', TILE = '#5f6b74';

/** The buildings a settlement is made of. All small, all procedural, all instanced. */
export const BUILDINGS = {
  hut: { cap: BUILDING_INFO.hut.cap, build: () => mergeParts([
    { geometry: BOX, color: WALL_COLOR, matrix: mat4(0, 1.3, 0, 4.2, 2.6, 3.6) },
    { geometry: CONE4, color: ROOF, matrix: mat4(0, 3.5, 0, 3.6, 1.8, 3.2, Math.PI / 4) },
    { geometry: BOX, color: BEAM, matrix: mat4(0, 0.9, 1.82, 0.9, 1.8, 0.12) },
  ]) },
  house: { cap: BUILDING_INFO.house.cap, build: () => mergeParts([
    { geometry: BOX, color: WALL_COLOR, matrix: mat4(0, 1.8, 0, 6, 3.6, 4.6) },
    { geometry: CONE4, color: ROOF, matrix: mat4(0, 4.8, 0, 5, 2.4, 4.2, Math.PI / 4) },
    { geometry: BOX, color: BEAM, matrix: mat4(0, 1.1, 2.32, 1.1, 2.2, 0.14) },
    { geometry: BOX, color: BEAM, matrix: mat4(-2, 2.4, 2.32, 0.2, 2.8, 0.14) },
    { geometry: BOX, color: BEAM, matrix: mat4(2, 2.4, 2.32, 0.2, 2.8, 0.14) },
    { geometry: CYL, color: STONE, matrix: mat4(2.2, 5.2, -1.2, 0.35, 2.6, 0.35) },
  ]) },
  hall: { cap: BUILDING_INFO.hall.cap, build: () => mergeParts([
    { geometry: BOX, color: STONE, matrix: mat4(0, 2.6, 0, 10, 5.2, 6.5) },
    { geometry: CONE4, color: TILE, matrix: mat4(0, 6.8, 0, 8.2, 3.2, 5.8, Math.PI / 4) },
    { geometry: BOX, color: BEAM, matrix: mat4(0, 1.5, 3.3, 1.8, 3, 0.2) },
    { geometry: CYL, color: STONE, matrix: mat4(-4.2, 3, 3.4, 0.4, 6, 0.4) },
    { geometry: CYL, color: STONE, matrix: mat4(4.2, 3, 3.4, 0.4, 6, 0.4) },
  ]) },
  tower: { cap: BUILDING_INFO.tower.cap, build: () => mergeParts([
    { geometry: CYL, color: STONE, matrix: mat4(0, 5, 0, 2.4, 10, 2.4) },
    { geometry: CYL, color: STONE, matrix: mat4(0, 10.3, 0, 2.9, 0.7, 2.9) },
    { geometry: CONE4, color: TILE, matrix: mat4(0, 12, 0, 2.7, 3, 2.7, Math.PI / 4) },
  ]) },
  /**
   * A wall segment, built along **+Z** — the axis `yaw` points down, the same as the bridges.
   *
   * It used to be modelled along X while being rotated by a +Z yaw, so every piece came out turned
   * ninety degrees: the segments stood parallel to each other like a row of fence panels instead of
   * joining end to end into a wall. (Reported with a screenshot of a city that looked like it was
   * built out of dominoes.)
   */
  wall: { cap: BUILDING_INFO.wall.cap, build: () => mergeParts([
    { geometry: BOX, color: STONE, matrix: mat4(0, 1.9, 0, 1.1, 3.8, 6) },
    { geometry: BOX, color: STONE, matrix: mat4(0, 4, -2, 1.2, 0.6, 0.9) },
    { geometry: BOX, color: STONE, matrix: mat4(0, 4, 0, 1.2, 0.6, 0.9) },
    { geometry: BOX, color: STONE, matrix: mat4(0, 4, 2, 1.2, 0.6, 0.9) },
  ]) },
  /**
   * TWELVE MORE BUILDINGS, so a town stops being huts and a hall.
   *
   * "Let's also update towns to be more complex, have 12 new bespoke buildings, and have their own
   * road network between them." Each one is a real silhouette rather than a recoloured box — a
   * forge has a chimney and a quench trough, an inn has a sign hanging off a bracket, a chapel has
   * a spire. `js/town.js` puts the matching person inside, so a smithy is where the smith is.
   */
  forge: { cap: BUILDING_INFO.forge.cap, build: () => mergeParts([
    { geometry: BOX, color: STONE, matrix: mat4(0, 1.6, 0, 6.4, 3.2, 5) },
    { geometry: BOX, color: ROOF, matrix: mat4(0, 3.5, 0, 6.8, 0.5, 5.4) },
    { geometry: CYL, color: STONE, matrix: mat4(2.2, 5, -1.4, 0.55, 3.6, 0.55) },   // the chimney
    { geometry: BOX, color: '#3a2a20', matrix: mat4(0, 1.1, 2.55, 2.2, 2.2, 0.16) },
    { geometry: CYL, color: '#2d3540', matrix: mat4(-3.6, 0.45, 1.8, 0.8, 0.9, 0.8) }, // the quench trough
    { geometry: BOX, color: BEAM, matrix: mat4(-3.6, 1.1, 1.8, 0.9, 0.2, 0.9) },
  ]) },
  inn: { cap: BUILDING_INFO.inn.cap, build: () => mergeParts([
    { geometry: BOX, color: WALL_COLOR, matrix: mat4(0, 1.8, 0, 8, 3.6, 5.4) },
    { geometry: BOX, color: WALL_COLOR, matrix: mat4(0, 4.8, 0, 8.4, 2.4, 5.8) },
    { geometry: CONE4, color: TILE, matrix: mat4(0, 7, 0, 6.6, 2, 5, Math.PI / 4) },
    { geometry: BOX, color: BEAM, matrix: mat4(3.9, 4.4, 2.6, 0.14, 0.14, 1.6) },    // the sign bracket
    { geometry: BOX, color: '#6a4a2a', matrix: mat4(3.9, 3.6, 3.3, 0.12, 1.2, 1.2) },// …and the sign
    { geometry: BOX, color: BEAM, matrix: mat4(0, 1.2, 2.75, 1.3, 2.4, 0.16) },
    { geometry: CYL, color: STONE, matrix: mat4(-3, 7.4, -1.6, 0.4, 3, 0.4) },
  ]) },
  market: { cap: BUILDING_INFO.market.cap, build: () => mergeParts([
    { geometry: BOX, color: BEAM, matrix: mat4(-2.2, 1.1, -1.6, 0.14, 2.2, 0.14) },
    { geometry: BOX, color: BEAM, matrix: mat4(2.2, 1.1, -1.6, 0.14, 2.2, 0.14) },
    { geometry: BOX, color: BEAM, matrix: mat4(-2.2, 1.1, 1.6, 0.14, 2.2, 0.14) },
    { geometry: BOX, color: BEAM, matrix: mat4(2.2, 1.1, 1.6, 0.14, 2.2, 0.14) },
    { geometry: BOX, color: '#8a4a3a', matrix: mat4(0, 2.4, 0, 5.2, 0.3, 4) },       // the awning
    { geometry: BOX, color: BEAM, matrix: mat4(0, 0.9, -1.4, 4.4, 0.18, 1) },        // the trestle
  ]) },
  granary: { cap: BUILDING_INFO.granary.cap, build: () => mergeParts([
    { geometry: CYL, color: '#8a7a56', matrix: mat4(0, 2.4, 0, 2.8, 4.8, 2.8) },
    { geometry: CONE4, color: ROOF, matrix: mat4(0, 5.8, 0, 3.2, 2, 3.2, Math.PI / 4) },
    { geometry: BOX, color: BEAM, matrix: mat4(0, 1, 2.75, 0.9, 2, 0.16) },
    { geometry: CYL, color: STONE, matrix: mat4(0, 0.25, 0, 3.2, 0.5, 3.2) },        // stilts on a plinth
  ]) },
  chapel: { cap: BUILDING_INFO.chapel.cap, build: () => mergeParts([
    { geometry: BOX, color: STONE, matrix: mat4(0, 2.1, 0, 5, 4.2, 8) },
    { geometry: CONE4, color: TILE, matrix: mat4(0, 5.6, 0, 4.4, 2.6, 7, Math.PI / 4) },
    { geometry: BOX, color: STONE, matrix: mat4(0, 4, -4.2, 2.6, 8, 2.6) },          // the spire base
    { geometry: CONE4, color: TILE, matrix: mat4(0, 9.6, -4.2, 2, 3.4, 2, Math.PI / 4) },
    { geometry: BOX, color: BEAM, matrix: mat4(0, 1.3, 4.1, 1.2, 2.6, 0.18) },
  ]) },
  barracks: { cap: BUILDING_INFO.barracks.cap, build: () => mergeParts([
    { geometry: BOX, color: STONE, matrix: mat4(0, 1.7, 0, 9, 3.4, 4.6) },
    { geometry: BOX, color: TILE, matrix: mat4(0, 3.7, 0, 9.4, 0.5, 5) },
    { geometry: BOX, color: BEAM, matrix: mat4(-3, 1.1, 2.4, 0.9, 2.2, 0.14) },
    { geometry: BOX, color: BEAM, matrix: mat4(3, 1.1, 2.4, 0.9, 2.2, 0.14) },
    { geometry: CYL, color: BEAM, matrix: mat4(4.9, 2.6, 2.4, 0.13, 5.2, 0.13) },    // the standard pole
    { geometry: BOX, color: '#8a3a3a', matrix: mat4(4.9, 4.5, 2.9, 0.06, 1.1, 1.1) },
  ]) },
  stable: { cap: BUILDING_INFO.stable.cap, build: () => mergeParts([
    { geometry: BOX, color: BEAM, matrix: mat4(0, 1.3, -1.4, 7, 2.6, 3.2) },
    { geometry: BOX, color: ROOF, matrix: mat4(0, 2.9, -1.2, 7.4, 0.4, 4.4) },
    { geometry: BOX, color: BEAM, matrix: mat4(-3.4, 0.6, 1.6, 0.14, 1.2, 4) },      // the paddock rail
    { geometry: BOX, color: BEAM, matrix: mat4(3.4, 0.6, 1.6, 0.14, 1.2, 4) },
    { geometry: BOX, color: BEAM, matrix: mat4(0, 0.6, 3.5, 7, 1.2, 0.14) },
  ]) },
  mill: { cap: BUILDING_INFO.mill.cap, build: () => mergeParts([
    { geometry: CYL, color: STONE, matrix: mat4(0, 2.6, 0, 2.6, 5.2, 2.6) },
    { geometry: CONE4, color: ROOF, matrix: mat4(0, 6.1, 0, 3, 1.8, 3, Math.PI / 4) },
    { geometry: BOX, color: BEAM, matrix: mat4(0, 4.4, 2.7, 6.4, 0.5, 0.2) },        // the sails
    { geometry: BOX, color: BEAM, matrix: mat4(0, 4.4, 2.7, 0.5, 6.4, 0.2) },
    { geometry: BOX, color: BEAM, matrix: mat4(0, 1, 2.6, 0.9, 2, 0.16) },
  ]) },
  warehouse: { cap: BUILDING_INFO.warehouse.cap, build: () => mergeParts([
    { geometry: BOX, color: BEAM, matrix: mat4(0, 2, 0, 11, 4, 6) },
    { geometry: BOX, color: ROOF, matrix: mat4(0, 4.4, 0, 11.4, 0.6, 6.4) },
    { geometry: BOX, color: '#3a2a20', matrix: mat4(0, 1.5, 3.1, 3.2, 3, 0.2) },
    { geometry: BOX, color: BEAM, matrix: mat4(-4.4, 0.5, 3.6, 1.2, 1, 1.2) },       // crates outside
    { geometry: BOX, color: BEAM, matrix: mat4(-4.4, 1.5, 3.6, 1, 1, 1) },
  ]) },
  watchpost: { cap: BUILDING_INFO.watchpost.cap, build: () => mergeParts([
    { geometry: BOX, color: BEAM, matrix: mat4(-1.2, 2, -1.2, 0.2, 4, 0.2) },
    { geometry: BOX, color: BEAM, matrix: mat4(1.2, 2, -1.2, 0.2, 4, 0.2) },
    { geometry: BOX, color: BEAM, matrix: mat4(-1.2, 2, 1.2, 0.2, 4, 0.2) },
    { geometry: BOX, color: BEAM, matrix: mat4(1.2, 2, 1.2, 0.2, 4, 0.2) },
    { geometry: BOX, color: BEAM, matrix: mat4(0, 4.1, 0, 3.4, 0.25, 3.4) },         // the platform
    { geometry: CONE4, color: ROOF, matrix: mat4(0, 5.4, 0, 3, 1.6, 3, Math.PI / 4) },
  ]) },
  shrine: { cap: BUILDING_INFO.shrine.cap, build: () => mergeParts([
    { geometry: CYL, color: STONE, matrix: mat4(0, 0.3, 0, 2.2, 0.6, 2.2) },
    { geometry: BOX, color: STONE, matrix: mat4(0, 1.4, 0, 0.8, 2.8, 0.8) },
    { geometry: OCT, color: '#c8a24a', matrix: mat4(0, 3.2, 0, 0.7, 0.9, 0.7) },
    { geometry: CYL, color: STONE, matrix: mat4(-1.5, 0.9, 0, 0.22, 1.8, 0.22) },
    { geometry: CYL, color: STONE, matrix: mat4(1.5, 0.9, 0, 0.22, 1.8, 0.22) },
  ]) },
  gatehouse: { cap: BUILDING_INFO.gatehouse.cap, build: () => mergeParts([
    { geometry: BOX, color: STONE, matrix: mat4(-2.6, 3, 0, 2.2, 6, 3.4) },
    { geometry: BOX, color: STONE, matrix: mat4(2.6, 3, 0, 2.2, 6, 3.4) },
    { geometry: BOX, color: STONE, matrix: mat4(0, 5.6, 0, 7.4, 1.4, 3.4) },         // the span over the road
    { geometry: BOX, color: BEAM, matrix: mat4(0, 2.4, 0, 3.2, 4.4, 0.25) },         // the portcullis
    { geometry: BOX, color: STONE, matrix: mat4(-2.6, 6.5, 0, 2.4, 0.5, 3.6) },
    { geometry: BOX, color: STONE, matrix: mat4(2.6, 6.5, 0, 2.4, 0.5, 3.6) },
  ]) },
  /**
   * A street. Laid between the buildings the way the roads outside are laid over the terrain — a
   * flat slab following the ground, so a town has a shape you can walk rather than a scatter of
   * houses on grass.
   */
  street: { cap: BUILDING_INFO.street.cap, build: () => mergeParts([
    { geometry: BOX, color: '#6b5c49', matrix: mat4(0, 0.06, 0, 3.4, 0.12, 6) },
  ]) },
  well: { cap: BUILDING_INFO.well.cap, build: () => mergeParts([
    { geometry: CYL, color: STONE, matrix: mat4(0, 0.5, 0, 1.3, 1, 1.3) },
    { geometry: BOX, color: BEAM, matrix: mat4(-1.1, 1.6, 0, 0.16, 2.2, 0.16) },
    { geometry: BOX, color: BEAM, matrix: mat4(1.1, 1.6, 0, 0.16, 2.2, 0.16) },
    { geometry: CONE4, color: ROOF, matrix: mat4(0, 3.1, 0, 1.7, 0.9, 1.7, Math.PI / 4) },
  ]) },
  // The deck runs along +Z — the same axis `yaw` points down, and the same way every other body in
  // the game faces. Built across +X instead, a bridge placed at the road's angle lay ACROSS the
  // river rather than spanning it, which is exactly how it looked. Scaling Z stretches the span to
  // suit the river; the piers are boxes so a stretched one reads as a wider pier, not a smeared post.
  bridge: { cap: BUILDING_INFO.bridge.cap, span: 10, build: () => mergeParts([
    { geometry: BOX, color: BEAM, matrix: mat4(0, 0, 0, 5, 0.45, 10) },
    { geometry: BOX, color: BEAM, matrix: mat4(2.4, 0.75, 0, 0.25, 1.1, 10) },
    { geometry: BOX, color: BEAM, matrix: mat4(-2.4, 0.75, 0, 0.25, 1.1, 10) },
    { geometry: BOX, color: STONE, matrix: mat4(2, -2.1, 3.2, 0.8, 4.2, 0.8) },
    { geometry: BOX, color: STONE, matrix: mat4(-2, -2.1, 3.2, 0.8, 4.2, 0.8) },
    { geometry: BOX, color: STONE, matrix: mat4(2, -2.1, -3.2, 0.8, 4.2, 0.8) },
    { geometry: BOX, color: STONE, matrix: mat4(-2, -2.1, -3.2, 0.8, 4.2, 0.8) },
  ]) },
};

export const BUILDING_KEYS = Object.keys(BUILDINGS);

// ---------------------------------------------------------------------------- the feature layer

/**
 * opts: { palette, seed, radius (metres of features kept around the player), refreshEvery (metres) }
 */
export function createFeatures(scene, terrain, opts = {}) {
  const world = terrain.world;
  const W = world.width;
  const palette = opts.palette || {};
  const radius = opts.radius ?? 2600;
  const refreshEvery = opts.refreshEvery ?? 260;
  const seed = (opts.seed ?? 1) >>> 0;

  const toMetres = i => { const [x, y] = IDX_XY(i, W); return [x * M_PER_CELL, y * M_PER_CELL]; };

  // The paths are the terrain's own — the very lines it carved the channels and cuttings from — so
  // the water surface sits exactly on the carved bed instead of clipping through it.
  const rivers = terrain.riverPaths;
  const roads = terrain.roadPaths;
  const riverSet = new Set();
  for (const r of world.rivers || []) for (const c of r.cells) riverSet.add(c);

  // Where a road crosses water. World Forge already works this out when it lays the network — its
  // `road.bridges` are the cells where a road had to cross a river, a lake or a channel — so that
  // is the list to trust. Looking for a road cell that is also a river cell finds almost nothing
  // extra, because the overlaps are at road ENDS: towns are founded on rivers.
  const bridges = [];
  const seenBridge = new Set();
  const addBridge = (road, i) => {
    const cell = road.cells[i];
    if (cell == null || seenBridge.has(cell)) return;
    seenBridge.add(cell);
    const [x, z] = toMetres(cell);
    const [px, pz] = toMetres(road.cells[Math.max(0, i - 1)]);
    const [nx, nz] = toMetres(road.cells[Math.min(road.cells.length - 1, i + 1)]);
    const angle = (nx === px && nz === pz) ? 0 : Math.atan2(nx - px, nz - pz);
    bridges.push({ x, z, angle, cell });
  };
  for (const road of roads) {
    for (const cell of road.bridgeCells || []) {
      const i = (road.cells || []).indexOf(cell);
      if (i >= 0) addBridge(road, i);
    }
    for (let i = 1; i < (road.cells || []).length - 1; i++) {
      if (riverSet.has(road.cells[i])) addBridge(road, i);
    }
  }

  const settlements = (world.nodes || [])
    .filter(n => n.type === 'settlement' || n.type === 'port')
    .map(n => ({ ...n, wx: n.x * M_PER_CELL, wz: n.y * M_PER_CELL }));

  // ---------------------------------------------------------------- meshes
  const waterMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(palette.sea || terrain.planet?.seaColor || '#2a6fa8'),
    transparent: true, opacity: 0.86,
  });
  const roadMat = new THREE.MeshLambertMaterial({ color: new THREE.Color('#6b5c49') });
  const riverMesh = new THREE.Mesh(new THREE.BufferGeometry(), waterMat);
  const roadMesh = new THREE.Mesh(new THREE.BufferGeometry(), roadMat);
  for (const m of [riverMesh, roadMesh]) { m.frustumCulled = false; m.name = 'farhold-' + (m === riverMesh ? 'rivers' : 'roads'); scene.add(m); }

  const instanced = {};
  for (const key of BUILDING_KEYS) {
    const mesh = new THREE.InstancedMesh(
      BUILDINGS[key].build(),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
      BUILDINGS[key].cap,
    );
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.name = 'farhold-building-' + key;
    scene.add(mesh);
    instanced[key] = mesh;
  }

  const solids = new ObstacleField();
  // Tell the field how high the ground is, so an obstacle knows where its roof is and the player
  // can jump over — and onto — anything they genuinely clear. See js/collide.js.
  solids.setGround((x, z) => terrain.heightAt(x, z));
  let centre = [Infinity, Infinity];
  let rebuilds = 0;
  let visible = true;
  const matrix = new THREE.Matrix4();
  const colour = new THREE.Color();


  function buildRibbons(px, pz) {
    const near = (points) => {
      const spans = [];
      let start = -1;
      for (let i = 0; i < points.length; i++) {
        const close = Math.hypot(points[i][0] - px, points[i][1] - pz) < radius;
        if (close && start < 0) start = Math.max(0, i - 1);
        if (!close && start >= 0) { spans.push([start, i]); start = -1; }
      }
      if (start >= 0) spans.push([start, points.length - 1]);
      return spans;
    };

    const water = { position: [], normal: [], index: [] };
    const road = { position: [], normal: [], index: [] };
    const push = (target, part) => {
      const base = target.position.length / 3;
      target.position.push(...part.position);
      target.normal.push(...part.normal);
      for (const i of part.index) target.index.push(i + base);
    };

    for (const r of rivers) {
      for (const [a, b] of near(r.points)) {
        if (b - a < 2) continue;
        const slice = r.points.slice(a, b + 1);
        // the surface the terrain carved down to, so the water can never clip through the bed
        const heights = r.surface.slice(a, b + 1);
        push(water, waterRibbon(slice, heights, r.half, { terrain, reach: r.reach, skirt: r.depth }));
      }
    }
    // lakes are drawn from the same mesh and the same material — they are the same water
    for (const lake of terrain.lakes || []) {
      if (Math.hypot(lake.wx - px, lake.wz - pz) - lake.radius > radius) continue;
      push(water, lakeSheet(lake, terrain.metresPerCell, terrain));
    }
    for (const r of roads) {
      for (const [a, b] of near(r.points)) {
        if (b - a < 2) continue;
        /**
         * Break the span wherever the route goes out over open water. Those stretches are sea lanes
         * rather than roads (see `path.wet` in js/planet.js), and drawing them lays a ribbon of
         * gravel across the ocean — so the road stops at the shore and picks up again on the far
         * side, which is what a coast road actually does.
         */
        let runStart = a;
        for (let i = a; i <= b + 1; i++) {
          const wet = i > b || r.wet?.[i];
          if (!wet) continue;
          if (i - runStart >= 2) {
            push(road, ribbon(r.points.slice(runStart, i), r.surface.slice(runStart, i), r.half * 2, { lift: 0.06 }));
          }
          runStart = i + 1;
        }
      }
    }

    for (const [mesh, data] of [[riverMesh, water], [roadMesh, road]]) {
      mesh.geometry.dispose();
      const geom = new THREE.BufferGeometry();
      if (data.position.length) {
        geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.position), 3));
        geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(data.normal), 3));
        geom.setIndex(data.index);
      }
      mesh.geometry = geom;
      mesh.visible = visible && data.position.length > 0;
    }
  }

  /** Lay out one settlement: a well in the middle, houses around it, walls if it is big enough. */
  function buildSettlement(node, counts) {
    const rng = makeRng((seed ^ (node.id * 2654435761)) >>> 0);
    const size = node.size || 1;
    const ring = 16 + size * 13;                     // metres from the centre to the outer houses
    const homes = [6, 8, 14, 26, 40, 54][clamp(size, 0, 5)] || 8;
    const cx = node.wx, cz = node.wz;

    const place = (key, x, z, angle, scale = 1, sink = 0.3, y = null) => {
      if (counts[key] >= BUILDINGS[key].cap) return false;
      if (terrain.underwater(x, z)) return false;
      // nothing is built in the channel or on the bank — towns sit BESIDE their river
      if (terrain.riverAt(x, z) > 0.3) return false;
      const size = Array.isArray(scale) ? scale : [scale, scale, scale];
      matrix.compose(
        new THREE.Vector3(x, (y ?? terrain.heightAt(x, z)) - sink, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0)),
        new THREE.Vector3(size[0], size[1], size[2]),
      );
      instanced[key].setMatrixAt(counts[key], matrix);
      instanced[key].setColorAt(counts[key], colour.setScalar(0.82 + rng() * 0.36));
      const solid = BUILDING_SOLIDS[key];
      if (solid && solid[0] > 0) solids.add(x, z, solid[0] * Math.max(size[0], size[2]), solid[1] * size[1]);
      counts[key]++;
      return true;
    };

    /**
     * THE TOWN PLAN.
     *
     * "Let's also update towns to be more complex, have 12 new bespoke buildings, and have their own
     * road network between them similar to Minecraft… Consider a town-generation system similar to
     * Dwarf Fortress or RimWorld."
     *
     * The old layout was rings of huts all facing the middle, which reads as a village from the air
     * and as nothing at all from the ground. This lays a town the way a town actually grows:
     *
     *   1. a **square** in the middle with the well and, in a real settlement, the hall;
     *   2. **streets** radiating out from it, bent a little so the place is not a snowflake;
     *   3. **plots** either side of every street, filled with whatever that settlement needs —
     *      the trades first, then houses, then the odds and ends;
     *   4. every building **faces its street**, which is what makes a row of them read as a row.
     *
     * A building only goes down where the ground is flat enough and dry, so a town on a slope
     * thins out uphill by itself rather than being clipped by a rule.
     */
    const plan = { streets: [], plots: [] };
    const streetCount = Math.max(2, Math.min(6, 2 + size));
    const streetLength = ring + 6;
    for (let i = 0; i < streetCount; i++) {
      // fan them out, with a wobble so no two towns share a skeleton
      const heading = (i / streetCount) * Math.PI * 2 + rng() * 0.5;
      const bend = (rng() - 0.5) * 0.35;
      plan.streets.push({ heading, bend, length: streetLength * (0.65 + rng() * 0.5) });
    }

    /** Walk a street, laying slabs and handing back the plots either side. */
    const walkStreet = street => {
      const plots = [];
      const step = 6;
      for (let d = 7; d < street.length; d += step) {
        const t = d / Math.max(1, street.length);
        const a = street.heading + street.bend * t;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (terrain.underwater(x, z)) break;                 // a street does not cross open water
        if (terrain.slopeAt(x, z, 6) > 0.62) break;          // nor climb a cliff
        // the slab runs along +Z like every other placed body, so the yaw is the standard one
        place('street', x, z, Math.atan2(Math.cos(a), Math.sin(a)) + Math.PI / 2, [1, 1, step / 6 * 1.1]);
        // a plot each side, set back from the kerb
        for (const side of [-1, 1]) {
          const px = x + Math.cos(a + Math.PI / 2) * side * 7.5;
          const pz = z + Math.sin(a + Math.PI / 2) * side * 7.5;
          plots.push({ x: px, z: pz, facing: Math.atan2(x - px, z - pz), d });
        }
      }
      return plots;
    };

    for (const street of plan.streets) plan.plots.push(...walkStreet(street));
    // nearest the square first: the trades want the middle, the houses take what is left
    plan.plots.sort((a, b) => a.d - b.d);

    // the square itself
    place('well', cx, cz, rng() * 6.3, 1);
    if (size >= 3) place('hall', cx + 14, cz + 6, rng() * 6.3, 1);
    if (size >= 2) place('market', cx - 9, cz + 8, rng() * 6.3, 1);

    /**
     * What this settlement is made of, in the order it gets built.
     *
     * A hamlet is houses and a shrine; a city has everything. The order matters — whatever runs out
     * of plots first is the thing a small town does without, which is why the trades are at the top.
     */
    const wanted = wantsFor(size);

    let plotAt = 0;
    const takePlot = () => {
      while (plotAt < plan.plots.length) {
        const plot = plan.plots[plotAt++];
        if (terrain.underwater(plot.x, plot.z)) continue;
        if (terrain.slopeAt(plot.x, plot.z, 6) > 0.55) continue;
        return plot;
      }
      return null;
    };

    for (const key of wanted) {
      const plot = takePlot();
      if (!plot) break;
      place(key, plot.x, plot.z, plot.facing, 0.92 + rng() * 0.2);
    }

    // …and then houses in whatever is left, up to the settlement's head count
    for (let i = 0; i < homes; i++) {
      const plot = takePlot();
      if (!plot) break;
      const key = size >= 3 && rng() < 0.45 ? 'house' : rng() < 0.5 ? 'hut' : 'house';
      place(key, plot.x, plot.z, plot.facing + (rng() - 0.5) * 0.2, 0.85 + rng() * 0.35);
    }


    // a city gets a wall and towers
    if (size >= 4) {
      // Walk the ring corner to corner: each segment spans the CHORD between two ring points and is
      // placed at that chord's midpoint, stretched slightly so it overlaps its neighbour. Spacing
      // segments by arc length (and giving each its own ground height) is what left gaps.
      const wallR = ring + 14;
      const SEG = 6;                                        // the wall mesh is 6 long, along +Z
      const segments = Math.max(8, Math.round((Math.PI * 2 * wallR) / SEG));
      const ringPoint = i => {
        const a = (i / segments) * Math.PI * 2;
        return [cx + Math.cos(a) * wallR, cz + Math.sin(a) * wallR];
      };

      /**
       * WHERE THE GATES GO: wherever a road meets the wall.
       *
       * The gate used to be a random segment, so a road ran straight up to a city and into a solid
       * stretch of masonry. Every road that passes near this settlement is checked for the point it
       * crosses the wall ring, and the segments either side of that bearing are left out.
       */
      const gateAngles = [];
      for (const road of roads) {
        for (const [rx, rz] of road.points || []) {
          const d = Math.hypot(rx - cx, rz - cz);
          if (Math.abs(d - wallR) > SEG * 1.6) continue;
          gateAngles.push(Math.atan2(rz - cz, rx - cx));
        }
      }
      // always at least one way in, even on a settlement no road reaches
      if (!gateAngles.length) gateAngles.push(rng() * Math.PI * 2);
      const isGate = i => {
        const a = ((i + 0.5) / segments) * Math.PI * 2;
        return gateAngles.some(g => {
          const diff = Math.abs(((a - g + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          return diff < (SEG * 1.9) / wallR;                // about two segments wide
        });
      };

      for (let i = 0; i < segments; i++) {
        if (isGate(i)) continue;                            // a road comes through here
        const [ax, az] = ringPoint(i), [bx, bz] = ringPoint(i + 1);
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (terrain.underwater(mx, mz)) continue;
        const chord = Math.hypot(bx - ax, bz - az);
        // sit the segment on the LOWER of its two ends and make it taller, so a step in the ground
        // is hidden under the wall instead of opening a gap beneath it
        const low = Math.min(terrain.heightAt(ax, az), terrain.heightAt(bx, bz));
        const lean = Math.abs(terrain.heightAt(ax, az) - terrain.heightAt(bx, bz));
        // the mesh runs along +Z, so the LENGTH scale goes on Z and the yaw is the standard one
        place('wall', mx, mz, Math.atan2(bx - ax, bz - az), [1, 1 + lean / 3.8, chord / SEG * 1.06], 0.9, low);
      }
      // a GATEHOUSE standing over each gap, so a gate reads as a gate rather than as a hole
      for (const g of gateAngles.slice(0, 4)) {
        const gx = cx + Math.cos(g) * wallR, gz = cz + Math.sin(g) * wallR;
        if (!terrain.underwater(gx, gz)) place('gatehouse', gx, gz, Math.atan2(Math.cos(g), Math.sin(g)) + Math.PI / 2, 1);
      }
      // towers beside every gate, and at the quarters
      const towerAngles = [...gateAngles.flatMap(g => [g - 0.26, g + 0.26]),
        ...[0, 1, 2, 3].map(i => (i / 4) * Math.PI * 2 + 0.4)];
      for (const a of towerAngles.slice(0, 10)) {
        place('tower', cx + Math.cos(a) * wallR, cz + Math.sin(a) * wallR, 0, 1, 1.1);
      }
    }
  }

  function buildInstances(px, pz) {
    const counts = {};
    for (const key of BUILDING_KEYS) counts[key] = 0;
    solids.clear();

    for (const node of settlements) {
      if (Math.hypot(node.wx - px, node.wz - pz) > radius) continue;
      buildSettlement(node, counts);
    }
    for (const b of bridges) {
      if (Math.hypot(b.x - px, b.z - pz) > radius) continue;
      if (counts.bridge >= BUILDINGS.bridge.cap) break;
      // sit the deck on the road, which planet.js has already lifted clear of the water, and
      // stretch the span to cover the channel and both banks
      const river = terrain.riverInfoAt(b.x, b.z);
      const deck = terrain.roadSurfaceAt(b.x, b.z) ?? (terrain.heightAt(b.x, b.z) + 2.4);
      const needed = river ? river.width + 18 : 14;
      const span = Math.max(1, needed / BUILDINGS.bridge.span);
      matrix.compose(
        new THREE.Vector3(b.x, deck, b.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, b.angle, 0)),
        new THREE.Vector3(1.15, 1.15, span),
      );
      instanced.bridge.setMatrixAt(counts.bridge, matrix);
      instanced.bridge.setColorAt(counts.bridge, colour.setScalar(1));
      counts.bridge++;
    }

    for (const key of BUILDING_KEYS) {
      const mesh = instanced[key];
      mesh.count = visible ? counts[key] : 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  function rebuild(px, pz) {
    rebuilds++;
    buildRibbons(px, pz);
    buildInstances(px, pz);
  }

  return {
    rivers, roads, bridges, settlements, instanced, riverMesh, roadMesh, solids,

    update(x, z, force = false) {
      if (!force && Math.hypot(x - centre[0], z - centre[1]) < refreshEvery) return false;
      centre = [x, z];
      rebuild(x, z);
      return true;
    },

    setVisible(v, x, z) { visible = !!v; rebuild(x, z); },

    /** The nearest settlement, river point, road point or peak — used by the debug menu. */
    nearest(kind, x, z) {
      const dist = (ax, az) => Math.hypot(ax - x, az - z);
      if (kind === 'settlement' || kind === 'city') {
        const pool = kind === 'city' ? settlements.filter(s => s.size >= 4) : settlements;
        if (!pool.length) return null;
        return pool.reduce((best, s) => (dist(s.wx, s.wz) < dist(best.wx, best.wz) ? s : best));
      }
      if (kind === 'river') {
        let best = null, bd = Infinity;
        for (const r of rivers) for (const p of r.points) { const d = dist(p[0], p[1]); if (d < bd) { bd = d; best = { wx: p[0], wz: p[1], name: r.name }; } }
        return best;
      }
      if (kind === 'road') {
        let best = null, bd = Infinity;
        for (const r of roads) for (const p of r.points) { const d = dist(p[0], p[1]); if (d < bd) { bd = d; best = { wx: p[0], wz: p[1], name: 'the road' }; } }
        return best;
      }
      return null;
    },

    /** The nearest settlement, however far off — what the HUD's objective line falls back to. */
    nearestSettlement(x, z) {
      let best = null, bd = Infinity;
      for (const s of settlements) {
        const d = Math.hypot(s.wx - x, s.wz - z);
        if (d < bd) { bd = d; best = s; }
      }
      return best ? { ...best, x: best.wx, z: best.wz, distance: bd } : null;
    },

    /** Am I standing in a settlement? Returns the node, for the HUD. */
    settlementAt(x, z) {
      for (const s of settlements) {
        const r = 30 + (s.size || 1) * 15;
        if (Math.hypot(s.wx - x, s.wz - z) < r) return s;
      }
      return null;
    },

    stats() {
      let buildings = 0, drawCalls = 0;
      for (const key of BUILDING_KEYS) { buildings += instanced[key].count; if (instanced[key].count) drawCalls++; }
      if (riverMesh.visible) drawCalls++;
      if (roadMesh.visible) drawCalls++;
      return {
        rivers: rivers.length, roads: roads.length, bridges: bridges.length,
        settlements: settlements.length, buildings, drawCalls, rebuilds, solids: solids.count,
      };
    },

    setPalette(p = {}) { if (p.sea) waterMat.color.set(p.sea); },

    dispose() {
      for (const key of BUILDING_KEYS) {
        const m = instanced[key];
        scene.remove(m); m.geometry.dispose(); m.material.dispose(); m.dispose();
      }
      for (const m of [riverMesh, roadMesh]) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    },
  };
}
