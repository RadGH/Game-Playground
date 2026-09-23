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
import { BUILDING_INFO, streetLanes, settlementAnchor, footprintOf } from './town-plan.js';
import { laneRibbon, ringCrossings } from './roadplan.js';
import { planTown, cultureFor } from '../../../proctown/js/townplan.js';
import { padSpotFor, boardSpotFor } from './waypoints.js';
import {
  describeBuilding, partsFor, describeStall, stallParts, stallsFor,
  radiusOf, mix, MESHES, CULTURE_KIT,
} from '../../../proctown/js/buildkit.js';
import { waterRibbon, lakeSheet, roadDeck } from './water-plan.js';
import { makeRng } from '../../../worldgen/js/noise.js';
import { M_PER_CELL } from './planet.js';
import { ObstacleField, BUILDING_SOLIDS } from './collide.js';

/**
 * A flat ribbon following a polyline, draped on the ground. Returns vertex/index arrays.
 *
 * ROUND 22 — THERE IS ONLY ONE OF THESE NOW. This was a byte-for-byte twin of `laneRibbon` in
 * js/roadplan.js, which round 14 wrote precisely so that a town street, a road the player lays and
 * an inter-town highway would all be the same strip of triangles — and then this copy stayed here
 * drawing the world's roads, so the one thing the split was meant to prevent was exactly what
 * happened: `laneRibbon` learned to clear the ground it is drawn on and the world's roads did not.
 * Rivers and streets already go through `laneRibbon`; roads do too now.
 */
const ribbon = (points, heights, width, opts = {}) =>
  laneRibbon({ points, surface: heights, half: (typeof width === 'function' ? i => width(i) / 2 : width / 2) }, opts);

// ---------------------------------------------------------------------------- building geometry

function mergeParts(parts) {
  let total = 0;
  const prepared = parts.map(p => {
    /**
     * CLONE. `toNonIndexed()` hands `this` straight back when a geometry is already non-indexed.
     *
     * The base geometries are module-level `const`s shared by every part that uses them, so
     * `applyMatrix4` was transforming the shared one and each reuse compounded the last — a wall
     * built on the previous wall's transform, a roof on that. js/chests.js, js/sites.js and
     * js/dungeon.js all clone first; this file and js/props.js did not.
     */
    const src = p.geometry.toNonIndexed();
    const g = src === p.geometry ? src.clone() : src;
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
// what is left of the fixed palette: the four things still modelled here (wall, gatehouse,
// well, bridge) rather than assembled by the kit
const BEAM = '#5a4632', ROOF = '#7a4a3a', STONE = '#8a8275';

// ---------------------------------------------------------------------------- the building kit
//
// A BUILDING IS A KIT, NOT A MODEL. Everything below the horizontal rule used to be twenty fixed
// meshes — a hut, a house, a hall, a forge and so on — and every town on every world was built out
// of the same twenty. The play-test said what that produces: "some roofs don't line up with the
// walls", "all the towns look and feel the same", "more variety of houses, roofs, colours, walls".
//
// `proctown/js/buildkit.js` now describes a building from its plot, its culture and a seed, and
// hands back a list of UNIT SHAPES. This file's only job is to stand them on the terrain.
//
// The instance budget is honoured the same way it always was, just one level down: there is one
// InstancedMesh per SHAPE rather than one per building type, so a town of sixty buildings is eight
// draw calls whatever is in it. A dwarf blockhouse and an elf bower are the same boxes and prisms.

/** A geometry whose vertex colours are all white, so the per-instance colour is the whole colour. */
function whiteGeometry(g) {
  const n = g.attributes.position.count;
  const color = new Float32Array(n * 3).fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  return g;
}

/**
 * A prism: a convex cross-section in XY, extruded along Z from -0.5 to 0.5.
 *
 * Three.js has no triangular prism, and the gable and the lean-to are the two shapes a town is
 * mostly made of. The section must run anti-clockwise or the faces point inward.
 */
function prismGeometry(section) {
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  const n = section.length;
  for (let i = 1; i < n - 1; i++) {
    tri([section[0][0], section[0][1], 0.5], [section[i][0], section[i][1], 0.5], [section[i + 1][0], section[i + 1][1], 0.5]);
    tri([section[0][0], section[0][1], -0.5], [section[i + 1][0], section[i + 1][1], -0.5], [section[i][0], section[i][1], -0.5]);
  }
  for (let i = 0; i < n; i++) {
    const a = section[i], b = section[(i + 1) % n];
    tri([a[0], a[1], -0.5], [b[0], b[1], -0.5], [b[0], b[1], 0.5]);
    tri([a[0], a[1], -0.5], [b[0], b[1], 0.5], [a[0], a[1], 0.5]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

/**
 * The eight unit shapes, each one metre in every direction with its ORIGIN AT THE CENTRE OF ITS
 * BASE — so a part's `y` is its bottom and there is never a half-height to remember.
 */
function unitMesh(kind) {
  let g;
  switch (kind) {
    case 'cyl': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 10); g.translate(0, 0.5, 0); break;
    // the triangular prism's ridge runs along +Z
    case 'gable': g = prismGeometry([[-0.5, 0], [0.5, 0], [0, 1]]); break;
    // …and the lean-to's single pitch rises toward -X
    case 'shed': g = prismGeometry([[-0.5, 0], [0.5, 0], [-0.5, 1]]); break;
    // a four-sided cone IS a pyramid; turned an eighth so its square base lines up with the axes
    case 'hip': g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4); g.rotateY(Math.PI / 4); g.translate(0, 0.5, 0); break;
    case 'frustum': g = new THREE.CylinderGeometry(0.225 * Math.SQRT2, 0.5 * Math.SQRT2, 1, 4);
      g.rotateY(Math.PI / 4); g.translate(0, 0.5, 0); break;
    case 'cone': g = new THREE.ConeGeometry(0.5, 1, 12); g.translate(0, 0.5, 0); break;
    case 'dome': g = new THREE.SphereGeometry(0.5, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      g.scale(1, 2, 1); break;
    default: g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); break;
  }
  return whiteGeometry(g);
}

/** Which InstancedMesh each kit shape goes into. */
const KIT_KEY = Object.fromEntries(MESHES.map(m => [m, 'kit_' + m]));

/**
 * How many of each shape may exist at once across every town in range.
 *
 * Measured rather than guessed: a settlement runs 14 parts a building (orc) to 45 (desert, where
 * every flat roof carries four parapet walls), on 17 to 59 plots. These are sized for three or four
 * towns inside the 2.6 km feature radius with the level-of-detail cut below doing its share.
 */
const KIT_CAPS = {
  box: 9000, cyl: 1800, gable: 900, shed: 600, hip: 700, frustum: 400, cone: 500, dome: 500,
};

const KIT_PARTS = Object.fromEntries(MESHES.map(m => [
  KIT_KEY[m], { cap: KIT_CAPS[m], kit: true, build: () => unitMesh(m) },
]));

/**
 * The buildings a settlement wants — which are now FOOTINGS, not models.
 *
 * Each of these is one thin slab under a building, sized to the footprint the kit chose, and the
 * building itself is assembled from `KIT_PARTS` on top of it. Keeping a mesh per want is not
 * nostalgia: it is where the instance cap lives (`BUILDING_INFO.<want>.cap`), it is how the debug
 * stats and the page tests count "how many forges are in front of me", and the footing itself earns
 * its place by hiding the gap where sloping ground runs out from under a wall.
 */
const WANT_KEYS = [
  'hut', 'house', 'hall', 'forge', 'inn', 'market', 'granary', 'chapel',
  'barracks', 'stable', 'mill', 'warehouse', 'watchpost', 'shrine',
];
const WANT_FOOTINGS = Object.fromEntries(WANT_KEYS.map(key => [
  key, { cap: BUILDING_INFO[key].cap, footing: true, build: () => unitMesh('box') },
]));

/** The buildings a settlement is made of. All small, all procedural, all instanced. */
export const BUILDINGS = {
  ...WANT_FOOTINGS,
  ...KIT_PARTS,
  // a wall tower: still a model, because it is the same tower in every town and it is placed by the
  // wall's own geometry rather than by a plot. White, so the culture's own stone colours it.
  tower: { cap: BUILDING_INFO.tower.cap, build: () => whiteGeometry(mergeParts([
    { geometry: CYL, color: '#ffffff', matrix: mat4(0, 5, 0, 2.4, 10, 2.4) },
    { geometry: CYL, color: '#ffffff', matrix: mat4(0, 10.3, 0, 2.9, 0.7, 2.9) },
    { geometry: CONE4, color: '#ffffff', matrix: mat4(0, 12, 0, 2.7, 3, 2.7, Math.PI / 4) },
  ])) },
  /**
   * A wall segment, built along **+Z** — the axis `yaw` points down, the same as the bridges.
   *
   * It used to be modelled along X while being rotated by a +Z yaw, so every piece came out turned
   * ninety degrees: the segments stood parallel to each other like a row of fence panels instead of
   * joining end to end into a wall. (Reported with a screenshot of a city that looked like it was
   * built out of dominoes.)
   */
  // White, like the tower: a palisade is not the colour of a bone wall is not the colour of a living
  // hedge, and a culture you can name from the next hill is most of what section 6 is asking for.
  wall: { cap: BUILDING_INFO.wall.cap, build: () => whiteGeometry(mergeParts([
    { geometry: BOX, color: '#ffffff', matrix: mat4(0, 1.9, 0, 1.1, 3.8, 6) },
    { geometry: BOX, color: '#ffffff', matrix: mat4(0, 4, -2, 1.2, 0.6, 0.9) },
    { geometry: BOX, color: '#ffffff', matrix: mat4(0, 4, 0, 1.2, 0.6, 0.9) },
    { geometry: BOX, color: '#ffffff', matrix: mat4(0, 4, 2, 1.2, 0.6, 0.9) },
  ])) },
  /**
   * WHERE THE TWELVE MODELS WENT.
   *
   * Round 8 added twelve bespoke buildings here — a forge with a chimney and a quench trough, an inn
   * with a sign on a bracket, a chapel with a spire — and they were good models. They were also the
   * only twelve, on every world, in every culture, for ever, which is the complaint this round is
   * answering: "all the towns look and feel the same".
   *
   * So the silhouettes moved into `proctown/data/buildkit.json`, where a forge is a base that suits
   * a forge plus a chimney the kit puts on it, and a dwarf forge and a halfling forge come out
   * different. What is left here is one footing per want (see `WANT_FOOTINGS` above), which is where
   * the cap and the count still live.
   */
  /**
   * THE WAYPOINT PAD — one design everywhere.
   *
   * "I would like waypoints to all be exactly the same everywhere, a round concrete surface with
   * some arcane sigildry that lights up when activated. When you teleport to a waypoint, you arrive
   * at this sigil."
   *
   * A low concrete disc with a kerb, sunk so it reads as laid INTO the ground rather than set on
   * top of it. The sigil ring is a second mesh so it can be lit on its own — see `waysigil`.
   */
  waypoint: { cap: BUILDING_INFO.waypoint.cap, build: () => mergeParts([
    { geometry: CYL, color: '#8d8a84', matrix: mat4(0, 0.16, 0, 3.4, 0.32, 3.4) },   // the pad
    { geometry: CYL, color: '#6f6c67', matrix: mat4(0, 0.34, 0, 3.0, 0.1, 3.0) },    // the inner face
    ...[0, 1, 2, 3, 4, 5].map(i => {
      const a = (i / 6) * Math.PI * 2;
      // six kerb stones round the rim, so the edge is cut rather than moulded
      return { geometry: BOX, color: '#7b7872', matrix: mat4(Math.cos(a) * 3.15, 0.3, Math.sin(a) * 3.15, 1.5, 0.5, 0.5, -a) };
    }),
  ]) },
  /**
   * The sigildry. Dark until the town has been entered, then lit.
   *
   * Drawn as a separate mesh in its own colour so `place` can tint one instance bright and another
   * dead — the pad underneath is the same grey either way, which is what makes an unlit waypoint
   * read as "not yet" rather than as a different object.
   */
  waysigil: { cap: BUILDING_INFO.waysigil.cap, build: () => mergeParts([
    ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
      const a = (i / 8) * Math.PI * 2;
      return { geometry: BOX, color: '#ffffff', matrix: mat4(Math.cos(a) * 2.1, 0.4, Math.sin(a) * 2.1, 0.9, 0.06, 0.18, -a) };
    }),
    ...[0, 1, 2, 3].map(i => {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 8;
      // four spokes into the middle, and a mark at the centre you arrive standing on
      return { geometry: BOX, color: '#ffffff', matrix: mat4(Math.cos(a) * 1.15, 0.4, Math.sin(a) * 1.15, 2.0, 0.06, 0.14, -a) };
    }),
    { geometry: CYL, color: '#ffffff', matrix: mat4(0, 0.41, 0, 0.5, 0.06, 0.5) },
  ]) },

  /** A board on two posts, with a roof over it so the notices survive the weather. */
  noticeboard: { cap: BUILDING_INFO.noticeboard.cap, build: () => mergeParts([
    { geometry: BOX, color: BEAM, matrix: mat4(-0.75, 1.1, 0, 0.16, 2.2, 0.16) },
    { geometry: BOX, color: BEAM, matrix: mat4(0.75, 1.1, 0, 0.16, 2.2, 0.16) },
    { geometry: BOX, color: '#6a5238', matrix: mat4(0, 1.5, 0, 1.9, 1.2, 0.12) },
    { geometry: BOX, color: '#d8cfb4', matrix: mat4(-0.35, 1.7, 0.08, 0.36, 0.48, 0.03) },
    { geometry: BOX, color: '#cfc6a8', matrix: mat4(0.3, 1.45, 0.08, 0.3, 0.4, 0.03) },
    { geometry: BOX, color: BEAM, matrix: mat4(0, 2.3, 0.12, 2.2, 0.14, 0.5) },
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
  street: { cap: BUILDING_INFO.street.cap, build: () => whiteGeometry(mergeParts([
    { geometry: BOX, color: '#ffffff', matrix: mat4(0, 0.06, 0, 3.4, 0.12, 6) },
  ])) },
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
  const palette = opts.palette || {};
  const radius = opts.radius ?? 2600;
  const refreshEvery = opts.refreshEvery ?? 260;
  const seed = (opts.seed ?? 1) >>> 0;
  /**
   * F15: which waypoint pads have been lit.
   *
   * A function, not a value — `main.js` rebuilds the waypoint book with the world, and the pad has
   * to show the state at the moment the town is drawn rather than the one it had at boot.
   */
  const waypointLit = opts.waypointLit || null;


  // The paths are the terrain's own — the very lines it carved the channels and cuttings from — so
  // the water surface sits exactly on the carved bed instead of clipping through it.
  const rivers = terrain.riverPaths;
  const roads = terrain.roadPaths;

  /**
   * WHERE A ROAD CROSSES A RIVER — `js/planet.js`'s own list now, not a second one worked out here.
   *
   * This used to look for a road CELL that was also a river cell, plus whatever World Forge had
   * flagged. On the user's own world — seed 4477, Delta Thiakean II, the town of Pewargate — that
   * finds nothing at all: a map cell is 224 m across and both lines are smoothed curves that wander
   * inside their cells, so the road passes 2.3 m from the middle of a twelve-metre river and the
   * two never share a cell. No bridge was built, and the only thing carrying the player over the
   * water was the earth plug `heightAt` left behind, which is the dam the user reported.
   *
   * `terrain.crossings` walks both polylines properly (see `findCrossings` in js/planet.js) and is
   * the SAME list that decides where the channel is left open. One list, so the bridge you can see,
   * the deck you stand on and the hole in the ground can never disagree.
   */
  const bridges = terrain.crossings || [];

  /**
   * ROUND 17 — A TOWN IS BUILT AT ITS ANCHOR, AND THE ANCHOR MAY BE IN A RIVER.
   *
   * The round-17 pass made every individual thing a town builds refuse to stand in water, which is
   * what the report asked for. It left the harder half: at Feafungate (seed 56138) the map node
   * itself sits eighteen metres down under five metres of river, so *forty-one per cent of the
   * ground inside the town ring is water* and the builder was simply dropping sixteen of the
   * hundred and thirty-nine things it wanted to put down. Nothing looked broken any more; there was
   * just a hole where half a town should be.
   *
   * World Forge picks a settlement's CELL from habitability, and a cell is 64 m here and 224 m at
   * the default planet size — far coarser than the terrain the player walks on, so a perfectly
   * reasonable cell can have a river through the middle of it. Moving the cell is not the answer:
   * the roads are already routed to it, and js/map.js, js/quests.js, js/markers.js and
   * js/waypoints.js each derive their own metres from `node.x * M_PER_CELL`.
   *
   * So the CELL does not move and the ANCHOR does — by less than a cell, which is under the
   * precision of every one of those consumers, so the map pin, the quest marker and the waypoint
   * all still land inside the town. The search is a fixed spiral rather than a random walk, so a
   * town is in the same place every time you come back to the world, which is the whole contract of
   * a seeded planet.
   */
  const settlements = (world.nodes || [])
    .filter(n => n.type === 'settlement' || n.type === 'port')
    .map(n => {
      /**
       * NOT WIRED, DELIBERATELY — AND THIS IS THE NOTE SAYING WHY.
       *
       * `settlementAnchor` works and is tested (tests/round17-worldgen.test.js §5): it takes
       * Feafungate from 41% of its ground under water to 8% and puts its centre on dry land. What
       * it is NOT is safe on its own, and the browser suite said so within a minute — the waypoint
       * pad stopped lighting, because `js/waypoints.js` derives ITS metres from `node.x *
       * M_PER_CELL` independently, so the pad stayed at the cell while the town walked forty-five
       * metres away from it. `js/map.js`, `js/quests.js` and `js/markers.js` all do the same thing.
       *
       * Moving a town means moving all five together, and that is a round of its own rather than a
       * line here. Left as the honest half: the anchor is the cell, exactly as it was, and every
       * individual thing a town builds already refuses to stand in water (`dryFor` below), which is
       * what the report actually asked for.
       */
      return { ...n, wx: n.x * M_PER_CELL, wz: n.y * M_PER_CELL };
    });



  // ---------------------------------------------------------------- meshes
  const waterMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(palette.sea || terrain.planet?.seaColor || '#2a6fa8'),
    transparent: true, opacity: 0.86,
  });
  const roadMat = new THREE.MeshLambertMaterial({ color: new THREE.Color('#6b5c49') });
  const riverMesh = new THREE.Mesh(new THREE.BufferGeometry(), waterMat);
  const roadMesh = new THREE.Mesh(new THREE.BufferGeometry(), roadMat);
  /**
   * ROUND 14 — every street of every town in one mesh, with the culture's colour on the vertices.
   *
   * A street used to be an instance of the `street` box. It is a ribbon now (see `js/roadplan.js`),
   * and a ribbon is geometry rather than a transform — so the colour cannot ride on the instance and
   * has to ride on the vertices instead. One mesh for the lot, rebuilt with the settlements.
   */
  const streetMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const streetMesh = new THREE.Mesh(new THREE.BufferGeometry(), streetMat);
  for (const m of [riverMesh, roadMesh, streetMesh]) {
    m.frustumCulled = false;
    m.name = 'farhold-' + (m === riverMesh ? 'rivers' : m === roadMesh ? 'roads' : 'streets');
    scene.add(m);
  }

  /** Append one ribbon's triangles to a growing buffer, offsetting its indices. */
  function pushRibbon(into, part) {
    const base = into.position.length / 3;
    into.position.push(...part.position);
    into.normal.push(...part.normal);
    if (part.color) into.color.push(...part.color);
    for (const i of part.index) into.index.push(i + base);
  }

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


  /**
   * The ground a road ribbon has to clear — see the note on `ribbon`. Under a bridge there is no
   * ground (the channel is left open on purpose), so the deck keeps its own height there.
   */
  const roadGroundAt = (x, z) => (terrain.bridgedAt?.(x, z) ? -Infinity : terrain.heightAt(x, z));

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
        /**
         * A SEA LANE IS A RUN OF WET POINTS, NOT ONE.
         *
         * Reported at seed 14343310, Baus-Beinen II, x 9720 z 16259: "the road stops and starts
         * again with a gap in the middle". The road point nearest that spot carries `wet: true` and
         * stands on 3.1 m of dry land, with dry points either side and no water within thirty
         * metres. One stray flag, and because the loop below both BREAKS the ribbon at a wet point
         * and skips the point itself, a single bad sample cuts the road in two and leaves a hole
         * where the join should be.
         *
         * A route crossing open water is wet for a stretch — that is what a lane is. So a point only
         * counts as wet if its neighbour agrees, or if the ground under it really is water now:
         * the deck-grading pass in planet.js can lift a crossing clear of a channel after the flag
         * was set, which leaves the flag describing a world that no longer exists.
         */
        const wetAt = i => {
          if (i < 0 || i >= r.points.length || !r.wet?.[i]) return false;
          if (r.wet[i - 1] || r.wet[i + 1]) return true;          // part of a real run
          const [wx, wz] = r.points[i];
          return !!terrain.waterAt(wx, wz);                        // …or genuinely over water
        };

        /**
         * A LIFTED SPAN IS A DECK WITH A THICKNESS, NOT A SHEET OF PAPER.
         *
         * *"When they cross rivers the road surface is paper thin and looks off."* `roadDeck` in
         * js/water-plan.js was written for this in round 11 and then never called — its own header
         * said so — which made it the twelfth finished-module-with-no-way-in in this project. Now
         * it is called: a stretch the grading LIFTED (`path.lift`, which is a bridge or a causeway,
         * the only places you can see the side of a road) is drawn with a top, two sides and an
         * underside; everything else stays the flat draped ribbon, which is right where the ground
         * is touching it.
         *
         * Consecutive stretches share their boundary point, so there is no seam where the deck ends
         * and the flat ribbon carries on.
         */
        const lifted = i => (r.lift?.[i] ?? 0) > 0.5;
        const pushRoadRun = (from, to) => {                    // points [from, to)
          let k = from;
          while (k < to - 1) {
            const up = lifted(k);
            let e = k + 1;
            while (e < to && lifted(e) === up) e++;
            const end = Math.min(to, e + 1);
            const pts = r.points.slice(k, end), hs = r.surface.slice(k, end);
            if (pts.length >= 2) {
              if (up) push(road, roadDeck(pts, hs, r.half * 2, { thick: 0.5, lift: 0.06 }));
              // R22: the ribbon clears the ground it is drawn on — see the note on `ribbon`
              else push(road, ribbon(pts, hs, r.half * 2, { lift: 0.06, groundAt: roadGroundAt }));
            }
            k = e;
          }
        };

        let runStart = a;
        for (let i = a; i <= b + 1; i++) {
          const wet = i > b || wetAt(i);
          if (!wet) continue;
          if (i - runStart >= 2) pushRoadRun(runStart, i);
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

  /**
   * WHERE THE WORLD'S ROADS REACH A TOWN.
   *
   * *"…can they be interconnected somehow and actually connect to the real roads passing through
   * towns?"* They could not, because the two systems had never been introduced: `planTown` was
   * handed the ground and the culture and told nothing at all about the inter-town route running
   * past the door. The route's own polyline is right here — it is the same one `buildRibbons`
   * draws — so the crossings are a walk down it looking for the step from outside the ring to
   * inside, interpolated to the exact metre.
   *
   * Returned in the TOWN'S coordinates, because that is what the planner works in.
   */
  /**
   * Round 16: the walk itself moved to `ringCrossings` in js/roadplan.js, because the WALL needed
   * exactly the same answer and was working it out a different (and wrong) way — see the note
   * there, and the missing gate at Pewargate that it explains.
   */
  /**
   * ROUND 22 — AND THE WALL AND THE STREETS ASK ABOUT THE SAME CIRCLE, WITH NO CAP ON EITHER.
   *
   * *"That road goes through the wall, but there is no gate."* Two separate faults met here.
   * `ringCrossings` itself missed a road that clipped the corner of the ring (fixed in
   * js/roadplan.js — it solves both roots on every span now). And the two callers asked about two
   * different circles: the streets were linked where a road crosses `ring`, the wall was opened
   * where it crosses `wallR = ring + 14`, and a road arriving at a slant crosses those at
   * different bearings — so the high street and the gate were not in the same place.
   *
   * There was a third, quieter one: this truncated to four crossings while the gate list was
   * unlimited, so a fifth road got an opening in the wall and no street to arrive on. Both are
   * unlimited now; only the GATEHOUSE mesh is still capped at four, which is a cap on decoration
   * rather than on ways in.
   */
  function roadLinksFor(cx, cz, ring) {
    return ringCrossings(roads, cx, cz, ring).map(c => [c.dx, c.dz]);
  }

  /** Lay out one settlement: a well in the middle, houses around it, walls if it is big enough. */
  function buildSettlement(node, counts, px = 0, pz = 0, streets = null) {
    const rng = makeRng((seed ^ (node.id * 2654435761)) >>> 0);
    const size = node.size || 1;
    /**
     * ROUND 22 — THE PLANNER OWNS THESE TWO NUMBERS. THIS FILE ONLY BORROWS THEM.
     *
     * *"At this location houses clip through the wall."* (seed 25392, Kydsel IV, x 5240 z 1592.)
     *
     * `planTown` retries a crowded site — one that lost a third of its ground to a road or a river
     * — at `ringScale` up to **1.65**, filters its plots against `ring * ringScale`, and reports
     * both numbers back as `plan.ring` and `plan.wallRadius`. This file read neither. It worked its
     * own out from the same formula the planner starts from and never scales: `16 + size * 13`.
     *
     * So a size-4 town that retried at 1.65 hands back plots out to 112 m while the wall was built
     * at 82 m — and every plot between the two is a house standing in, or outside, its own wall.
     * Nothing was wrong with either number; they were simply two answers to one question, and only
     * one of them had been told what happened.
     *
     * These are the PROVISIONAL values, used for the two things that have to be decided before the
     * plan exists (where the road meets the town, and the anchor). Everything after `planTown`
     * reads `ring` and `wallR`, which are reassigned from the plan the moment it comes back.
     */
    const base = footprintOf(size);
    let ring = base.ring;                            // metres from the centre to the outer houses
    let wallR = base.wall;
    const cx = node.wx, cz = node.wz;

    /**
     * ROUND 17 — "SEMI-UNDERWATER" IS A QUESTION ABOUT A FOOTPRINT, NOT ABOUT A CENTRE.
     *
     * *"The centre of the town has a bunch of stuff semi-underwater."* (seed 56138, Chodikvraun III,
     * x 11572 z 2995 — the town is Feafungate, and a river runs straight through the middle of it.)
     *
     * Every water test in this file asked `underwater(x, z)` of ONE point: the exact middle of the
     * thing being placed. A hut is three and a half metres across, a warehouse eleven, and the
     * waypoint pad six — so anything whose centre cleared the water by a few centimetres went down
     * with a third of itself in the river and passed every check there was. Measured at Feafungate,
     * four of the hundred and forty things the builder stands on the ground came out wet that way:
     * the well, the waypoint pad, a market stall and a length of the town wall.
     *
     * A ring of samples at the thing's own radius is what the player is actually looking at. It also
     * wants freeboard rather than a bare waterline — the stalls already learned that one ("eight
     * hundred millimetres settles it") and nothing else had.
     *
     * And it asks `bridgedAt` in the same breath, because a bridge's footprint is a HOLE: `heightAt`
     * leaves the river channel carved under one so the water can run through, and anything built
     * there stands in mid-air over the river. See the note on `bridgedAt` in js/planet.js.
     */
    const FREEBOARD = 0.4;                      // metres of dry ground under the lowest edge
    const dryFor = (x, z, radius = 0) => {
      if (terrain.bridgedAt?.(x, z, radius)) return false;
      if (terrain.underwater(x, z)) return false;
      if (radius < 0.5) return true;            // a shrine, a sigil: its centre IS its footprint
      for (let a = 0; a < 8; a++) {
        const px = x + Math.cos((a / 8) * Math.PI * 2) * radius;
        const pz = z + Math.sin((a / 8) * Math.PI * 2) * radius;
        const water = terrain.waterAt(px, pz);
        if (water && terrain.heightAt(px, pz) < water.surface + FREEBOARD) return false;
      }
      return true;
    };

    const place = (key, x, z, angle, scale = 1, sink = 0.3, y = null,
      { solid: wantSolid = true, tint = null, foot = null, onRoad = false } = {}) => {
      if (counts[key] >= BUILDINGS[key].cap) return false;
      // nothing is built in the channel or on the bank — towns sit BESIDE their river
      if (terrain.riverAt(x, z) > 0.3) return false;
      /**
       * R21 — and nothing is built in the ROAD, which `place` had never once asked about.
       *
       * The planner's own `buildable` rejects `roadAt > 0.45` for plots, but the well, the waypoint,
       * the notice board, the stalls, the wall, the towers and the gates all come through here
       * instead and only ever checked water. A gate is the one thing that WANTS to be on the road,
       * so it opts out by passing `onRoad`.
       */
      if (!onRoad && (terrain.roadAt(x, z) > 0.45 || terrain.bridgedAt?.(x, z))) return false;
      if (!dryFor(x, z, foot ?? (BUILDING_SOLIDS[key]?.[0] || 0))) return false;
      const size = Array.isArray(scale) ? scale : [scale, scale, scale];
      matrix.compose(
        new THREE.Vector3(x, (y ?? terrain.heightAt(x, z)) - sink, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0)),
        new THREE.Vector3(size[0], size[1], size[2]),
      );
      instanced[key].setMatrixAt(counts[key], matrix);
      // a tinted mesh was built white on purpose, so the culture's own colour is the whole colour;
      // everything else keeps the old scalar wobble so two neighbours are not identical
      if (tint) instanced[key].setColorAt(counts[key], colour.set(tint));
      else instanced[key].setColorAt(counts[key], colour.setScalar(0.82 + rng() * 0.36));
      // a gate registers its own jambs instead, so the opening stays walkable
      const solid = wantSolid ? BUILDING_SOLIDS[key] : null;
      if (solid && solid[0] > 0) solids.add(x, z, solid[0] * Math.max(size[0], size[2]), solid[1] * size[1]);
      counts[key]++;
      return true;
    };

    /**
     * Stand one kit part on the ground.
     *
     * The part list is in the BUILDING's own frame — +Z is the street side — so the whole list is
     * turned by one yaw and dropped at one point. That is the reason a roof cannot drift away from
     * its walls between here and `buildkit.js`: there is no per-part position in this file to get
     * wrong, only a rotation of the list the kit already agreed on.
     */
    const placePart = (key, part, ox, oz, ground, yaw, cos, sin) => {
      if (counts[key] >= BUILDINGS[key].cap) return false;
      matrix.compose(
        new THREE.Vector3(ox + part.x * cos + part.z * sin, ground + part.y, oz - part.x * sin + part.z * cos),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + (part.yaw || 0), 0)),
        new THREE.Vector3(part.w, part.h, part.d),
      );
      instanced[key].setMatrixAt(counts[key], matrix);
      instanced[key].setColorAt(counts[key], colour.set(part.colour));
      counts[key]++;
      return true;
    };

    /**
     * How much of a building gets built, by how far away it is (section 3.18).
     *
     * A full kit building is 14 parts (an orc tent) to 45 (a desert courtyard, where every flat roof
     * carries four parapet walls), and the feature radius is 2.6 km — so the honest thing is to stop
     * putting shutters and washing lines on a town you can barely see. Walls, roof and eave are the
     * silhouette; everything else is detail you have to be inside the town to read.
     */
    const STRUCTURE = new Set(['wall', 'roof', 'eave', 'trim', 'door', 'chimney']);
    const near = Math.hypot(cx - px, cz - pz) < 230;

    /**
     * THE TOWN PLAN — now from `proctown/js/townplan.js`, which is the one true planner.
     *
     * What used to be here fired 2-6 straight-ish spokes out of the middle and dropped buildings
     * along them, and the play-test came back with exactly what that produces: "Houses sitting on
     * roads. Some roofs don't line up with the walls. Alleyway roads clip beneath the surface
     * texture. All the towns look and feel the same, and they don't feel anything at all natural."
     *
     * Every one of those is the same mistake — a building was placed at a coordinate, a street was
     * drawn at a coordinate, and nothing reconciled the two. The planner cuts the town into blocks
     * and THE CUTS BECOME THE STREETS, then divides each block into plots. A house cannot sit on a
     * road because a road is not a plot.
     *
     * It lives in the playground experiment so it can be tuned on a page instead of by flying to a
     * town and looking at it, and Farhold imports it so there is no second copy to drift. The town's
     * culture comes from who lives there and what the ground is, which is why a dwarf hold is a grid
     * and an elf settlement bends along the contours.
     */
    const culture = cultureFor({ race: node.race, biome: node.biome });
    const plan = planTown({
      seed: (seed ^ (node.id * 2654435761)) >>> 0,
      size,
      culture,
      /**
       * The high streets: where the world road arrives, so the town's own plan grows out to meet it
       * instead of stopping dead at the wall. `planTown` also runs a connectivity pass now, which
       * is the other half of "random flat rectangles" — paving with no road attached to it is
       * dropped rather than drawn.
       */
      // R22: at the WALL, which is the circle the gates are cut in — for an unwalled settlement
      // the two are the same number, and `planTown` slides a link out with its own ring if it has
      // to grow the town to fit it on the ground
      links: roadLinksFor(cx, cz, wallR),
      // the real ground, so "follows the terrain" means this hillside and not a stand-in
      heightAt: (lx, lz) => terrain.heightAt(cx + lx, cz + lz),
      /**
       * …and the ground it may not use at all.
       *
       * `place()` below drops anything that lands in water, on a riverbank or on a cliff — silently,
       * after the plan is made. On the first town with a river through it that was throwing away 14
       * plots out of 26 and leaving a city with twelve buildings in it, which is exactly the "towns
       * feel empty" complaint. Telling the planner up front means the gap where the water runs is a
       * deliberate hole in the plan rather than an accident nobody could see.
       */
      buildable: (lx, lz) => {
        const x = cx + lx, z = cz + lz;
        /**
         * AND THE ROAD. This is the answer to "houses sitting right in the middle of the road".
         *
         * The claim that a building could not land on a road was true of the town's OWN streets —
         * those are the gaps left by the block split, so a plot cannot overlap one. It was never
         * true of the WORLD road, the inter-town route that runs through the settlement, because
         * the planner was never told that road is there. Two systems drawing over each other with
         * nothing reconciling them, which is the same mistake the plot generator was built to fix,
         * one level up.
         *
         * `roadAt` is the same field the megaflora already keep clear of.
         */
        // 0.45 is the carriageway and its kerb, not the whole influence field: measured, the road
        // reads 1.0 at its centre and fades to nothing by 18 m, and excluding all of that took 36%
        // of a town's ground. Buildings SHOULD front close to the road — that is what a road is for
        if (terrain.roadAt(x, z) > 0.45) return false;
        /**
         * …AND THE BRIDGE. Round 17, and the same mistake one level further on.
         *
         * A crossing's footprint is a rectangle drawn along the road's tangent, and `heightAt`
         * leaves the river channel carved under every metre of it so the water can run through.
         * `roadAt` does NOT read 1.0 across all of that — a road bends and ends, and the deck runs
         * straight — so the ground at the far end of a bridge reads as perfectly good building land
         * while the terrain under it has been dug out to the river bed. That is the user's *"there
         * is a tower inside of the bridge"*, and it is why the footprint is asked for by name here
         * rather than inferred from the road.
         */
        if (terrain.bridgedAt?.(x, z, 2)) return false;
        return !terrain.underwater(x, z) && terrain.riverAt(x, z) <= 0.3 && terrain.slopeAt(x, z, 6) <= 0.62;
      },
    });

    /**
     * R22 — and from here on, the plan's own numbers. See the note where `ring` is declared: this
     * is the whole of *"houses clip through the wall"*, and the fix is one assignment.
     */
    if (Number.isFinite(plan.ring)) ring = plan.ring;
    if (Number.isFinite(plan.wallRadius)) wallR = plan.wallRadius;

    const toWorld = (lx, lz) => [cx + lx, cz + lz];
    const cultKit = CULTURE_KIT.cultures[culture] || CULTURE_KIT.cultures.human;
    const townSeed = (seed ^ (node.id * 2654435761)) >>> 0;

    /**
     * ROUND 14 — A STREET IS A LANE, NOT A ROW OF TILES.
     *
     *   "Is it possible for the road tool under the build menu, as well as the side streets used in
     *    some town generators, use the same road network as the main road infrastructure? … The
     *    tiles in town clip through the terrain. It would be better if they behaved like the regular
     *    roads, which we've worked on to get smooth on the terrain."
     *
     * What was here laid a white slab every three metres along each street, each one turned to its
     * span's bearing and sitting on the ground height at its OWN midpoint, plus a square pad on
     * every junction to fill the wedge where two bearings met. That is two rounds of patches on the
     * wrong model: on a slope consecutive slabs still step past each other and the seams open, and a
     * flat slab on sloped ground puts a corner under the surface.
     *
     * `streetLanes` resamples each street at three metres, rounds its corners in the PLAN and grades
     * its heights; `laneRibbon` draws it as one continuous strip whose quads share their vertices —
     * so a seam is not a thing that can happen and a junction needs no pad. The same two functions
     * draw the roads between towns and the roads the player lays in build mode, which is the whole
     * of what was asked for: one road network, one way of meeting the ground.
     *
     * It deliberately does NOT reshape the ground. `features.js` has no terraform book, and painting
     * brushes from here would write a permanent terrain edit into the save every time a settlement
     * was rebuilt — they accumulate, and a town you walked past forty times would carry forty copies
     * of its own streets. A street lane grades with two smoothing passes instead of the world roads'
     * four: it follows the hillside rather than cutting into it, which is the right answer when
     * nothing is going to carve the hill for it.
     */
    if (streets) {
      const tint = new THREE.Color(cultKit.street.colour);
      for (const lane of streetLanes(plan, {
        cx, cz, terrain,
        // R21: and throw away whatever the cut left stranded — see `keepConnected` in town-plan.js
        prune: true,
        // A street stops at the water and picks up on the far side, as a road does at a sea lane —
        // and at a bridge, where the ground it would be draped on is a hole. Round 17: ten of
        // Feafungate's street lanes ran over the deck of the bridge through the middle of the town,
        // which draws a strip of paving hanging in the air over the river.
        /**
         * R21 — …AND WHERE THE WORLD ROAD ALREADY PAVES IT.
         *
         * The play-test: *"There are lots of sub-roads that are totally meaningless… The specific
         * location I shared has several roads (and the waypoint) overlapping the main road, even if
         * there is nothing on the other side."* Measured on that town: 160 of 940 street samples
         * (17%) sat on top of the world road. The world road is drawn at `lift: 0.06` and a town
         * street at `lift: 0.12`, so what the player saw was a second slab of paving floating six
         * centimetres above the first one, at a slightly different angle.
         *
         * Nothing anywhere de-duplicated the two. `splitBlock` cuts its streets without ever being
         * told where the road runs, and `linkRoads` deliberately lays a high street along the very
         * corridor the road comes in on. Breaking the run at the carriageway is the cheap half of
         * the fix and it is the half the player sees: the road IS the street there.
         */
        skip: (x, z) => terrain.underwater(x, z) || terrain.riverAt(x, z) > 0.3
          || !!terrain.bridgedAt?.(x, z) || terrain.roadAt(x, z) > 0.45,
      })) {
        pushRibbon(streets, laneRibbon(lane, { lift: 0.12, color: [tint.r, tint.g, tint.b] }));
      }
    }

    // the square: the well at its centre
    const [sqx, sqz] = toWorld(plan.square.cx, plan.square.cz);
    place('well', sqx, sqz, rng() * 6.3, 1);

    /**
     * THE WAYPOINT PAD.
     *
     * "I still haven't seen a waypoint." The network, the map and the travel have all worked since
     * they went in — there was simply nothing standing on the ground, because `features.js` belonged
     * to another agent that round and the pad was never built.
     *
     * It goes where `js/waypoints.js` says it goes, so the thing you walk up to and the dot you click
     * on the map are the same spot, and you arrive standing on the sigil. The pad is grey concrete
     * whichever town it is in; only the sigil ring changes, and only between lit and unlit.
     */
    {
      // the same predicate the travel book uses, so the pad you see and the pad you land on match
      /**
       * R21 — A WAYPOINT PAD IS NOT BUILT IN THE MIDDLE OF THE ROAD.
       *
       * `padSpotFor` offers a fixed bearing off the town origin and then spirals if the ground is
       * no good — but "no good" only ever meant water, a river or a slope. It never asked about the
       * road, and the town origin is the exact cell the road is routed to, so on the reported town
       * the pad landed at `roadAt 0.994`: dead centre of the carriageway. A 3.2 m concrete disc and
       * a glowing sigil, in the road.
       *
       * The spiral in `padSpotFor` already exists to solve exactly this shape of problem; it simply
       * was not being told about one of the four things that can be under a town.
       */
      const clearOfRoad = (x, z, foot = 0) => {
        if (terrain.bridgedAt?.(x, z)) return false;
        if (terrain.roadAt(x, z) > 0.45) return false;
        // …and the EDGE, not only the middle. A waypoint pad is 3.2 m across, so a centre that
        // clears the carriageway by a metre still puts a third of the disc in the road — the same
        // footprint-versus-centre fault the probe tool was written to catch for the water tests.
        for (let i = 0; i < 6 && foot > 0; i++) {
          const a = (i / 6) * Math.PI * 2;
          if (terrain.roadAt(x + Math.cos(a) * foot, z + Math.sin(a) * foot) > 0.45) return false;
        }
        return true;
      };
      const padOk = (x, z) => !terrain.waterAt(x, z) && !terrain.underwater(x, z)
        && terrain.riverAt(x, z) <= 0.3 && terrain.slopeAt(x, z, 4) <= 0.5
        && clearOfRoad(x, z, 3.2);
      const pad = padSpotFor(node, padOk);
      if (padOk(pad.x, pad.z)) {
        const lit = waypointLit ? !!waypointLit(node.id) : false;
        place('waypoint', pad.x, pad.z, 0, 1, 0.12, null, { foot: 3.2 });
        place('waysigil', pad.x, pad.z, 0, 1, 0.12, null,
          // dead stone until you have been here; then it burns
          { solid: false, tint: lit ? '#7fe8ff' : '#3a4048' });
      }
      // …and the notice board, opposite the pad across the square. A real object with a real
      // position, because the first version treated the whole settlement as the board and "E to
      // read the notice board" then followed the player around the entire town.
      const board = boardSpotFor(node, padOk);
      if (padOk(board.x, board.z)) {
        place('noticeboard', board.x, board.z, Math.atan2(node.wx - board.x, node.wz - board.z), 1, 0.15);
      }
    }

    /**
     * OUTDOOR STALLS — the thing the user asked for by name.
     *
     * "More utility places like shops and other things which can be mostly like outdoor stalls."
     * They are deliberately not buildings: they need no plot, they stand where people already are
     * (a ring facing into the square, and the kerb of the main streets), and they are four posts and
     * a sheet of awning, so a market is twenty of them rather than one big model. `stallsFor` works
     * out the placement in the planner's own coordinates, so the 2D page shows them in the same
     * spots the game builds them.
     */
    for (const spot of stallsFor(plan, { culture, seed: townSeed, max: size >= 3 ? 24 : 10 })) {
      const [sx, sz] = toWorld(spot.x, spot.z);
      // A stall stands on dry ground, and "dry" has to mean properly dry. `underwater` is true only
      // below the waterline, so a stall on a beach town came out ankle-deep in the surf, which looks
      // exactly as odd as it sounds. Eight hundred millimetres of freeboard settles it.
      if (terrain.underwater(sx, sz) || terrain.waterAt?.(sx, sz)) continue;
      if (terrain.heightAt(sx, sz) < (terrain.seaLevel ?? 0) + 0.8) continue;
      if (terrain.riverAt(sx, sz) > 0.3) continue;
      if (terrain.slopeAt(sx, sz, 4) > 0.5) continue;
      // R21: a market stall does not stand in the carriageway. `stallsFor` lines the kerb of every
      // `main` street, and `linkRoads` files its high streets as `main` — so the stalls were being
      // hung off the world road as well as off the town's own.
      if (terrain.roadAt(sx, sz) > 0.45 || terrain.bridgedAt?.(sx, sz)) continue;
      const stall = describeStall({ kind: spot.kind, culture, seed: spot.seed });
      // …and round 17 asks about the whole awning rather than about the spot its middle post stands
      // on, which is what left a stall with two legs in the river at the user's own town square
      if (!dryFor(sx, sz, Math.max(stall.w, stall.d) * 0.5)) continue;
      const yaw = Math.PI / 2 - spot.facing;
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      const ground = terrain.heightAt(sx, sz);
      for (const part of stallParts(stall)) {
        placePart(KIT_KEY[part.mesh], part, sx, sz, ground, yaw, cos, sin);
      }
      // a stall is walked past, not walked through, but it is not a wall either
      solids.add(sx, sz, Math.max(stall.w, stall.d) * 0.36, stall.postH * 0.6);
    }

    /**
     * One building per plot, standing INSIDE it and facing its own street.
     *
     * `plot.facing` is the angle out to the street the plot fronts, which is the reason a door is
     * never on a blank back wall, and `plot.want` is what the planner decided this plot is for —
     * the trades took the big plots before the houses got a look in.
     */
    for (const plot of plan.plots) {
      const [x, z] = toWorld(plot.cx, plot.cz);
      if (terrain.underwater(x, z)) continue;
      if (terrain.slopeAt(x, z, 6) > 0.62) continue;        // a town thins out uphill by itself
      // …and no plot lands in a bridge's footprint, which is a hole in the ground with a deck over
      // it. `buildable` below keeps the PLANNER off one; this catches the plots a re-plan produced
      // against a different ring, so the two can never disagree.
      if (terrain.bridgedAt?.(x, z, 2)) continue;
      const key = BUILDINGS[plot.want] ? plot.want : 'house';
      if (counts[key] >= BUILDINGS[key].cap) continue;

      const desc = describeBuilding({
        plot, culture, townSeed,
        // the plot's own position is in the seed, so the same plot is the same building every visit
        seed: (townSeed ^ Math.imul(Math.round(plot.cx * 8) * 73856093 ^ Math.round(plot.cz * 8) * 19349663, 1)) >>> 0,
        want: key, district: plot.district,
      });

      const ground = terrain.heightAt(x, z);
      // `desc.lean` is a couple of degrees a poor building has settled off the line its neighbours
      // keep. It goes on here rather than inside the kit so the parts stay square to each other.
      const yaw = desc.yaw + desc.lean;
      const cos = Math.cos(yaw), sin = Math.sin(yaw);

      /**
       * The footing first: one slab under the building, in the mesh named after what the plot is
       * for. It is where the cap and the count live, and it hides the wedge of daylight that opens
       * under a wall when the ground falls away beneath it.
       */
      place(key, x, z, yaw, [desc.footprint.w + 0.7, 1, desc.footprint.d + 0.7], 0.26, ground,
        // the kit's own footprint, not the generic radius for this building type — a hut and a
        // warehouse share the `place` path and are three and eleven metres across
        { solid: false, foot: radiusOf(desc), tint: mix(desc.colour.wall, '#2a2621', 0.55) });

      // the tallest part is worked out on the way past, not by asking `heightOf` — that would build
      // the whole kit a second time, for every building, on every rebuild
      let top = 0;
      for (const part of partsFor(desc)) {
        top = Math.max(top, part.y + part.h);
        if (!near && !STRUCTURE.has(part.tag)) continue;
        placePart(KIT_KEY[part.mesh], part, x, z, ground, yaw, cos, sin);
      }

      // collision from the footprint the kit actually chose, rather than one number per building type
      solids.add(x, z, radiusOf(desc), Math.max(2.5, top));
    }

    // a city gets a wall and towers
    if (size >= 4) {
      // Walk the ring corner to corner: each segment spans the CHORD between two ring points and is
      // placed at that chord's midpoint, stretched slightly so it overlaps its neighbour. Spacing
      // segments by arc length (and giving each its own ground height) is what left gaps.
      // R22: `wallR` is the plan's own `wallRadius` now — see the note where it is declared
      const SEG = 6;                                      // the wall mesh is 6 long, along +Z
      const segments = Math.max(8, Math.round((Math.PI * 2 * wallR) / SEG));
      const ringPoint = i => {
        const a = (i / segments) * Math.PI * 2;
        return [cx + Math.cos(a) * wallR, cz + Math.sin(a) * wallR];
      };

      /**
       * WHERE THE GATES GO: wherever a road really meets the wall.
       *
       * *"Heading SSW there is a wall on the road with no gate, can't get through."* (seed 4477,
       * Delta Thiakean II, x 50788 z 23588 — the town is Pewargate.)
       *
       * What was here scanned every road SAMPLE POINT and kept any that landed within `SEG * 1.6`
       * (9.6 m) of the wall ring. A road is sampled every `M_PER_CELL / 5` metres, which is 45 m on
       * the default planet size and 128 m on a full-sized one, so a sample almost never lands in a
       * nineteen-metre-wide annulus. At Pewargate it found ZERO — and then fell through to the
       * "no road reaches this town" fallback, which drops a gate at a RANDOM bearing. So the town
       * had a gate; it was just nowhere near either of the two roads that actually arrive.
       *
       * `ringCrossings` walks the polyline and interpolates the step from outside the ring to
       * inside, which is the same maths `roadLinksFor` above was already using to tell the town
       * planner where its high streets go. One question, one answer, and the wall and the streets
       * can no longer disagree about where the road comes in. At Pewargate it finds both: a road at
       * bearing 41 degrees and the trail at 131, which is the wall the user was standing at.
       *
       * EVERY crossing opens the wall. Only the best four get a gatehouse (the mesh has a cap, and
       * four is as many as a town ever wants) — but an opening with no gatehouse in it is still a
       * way through, which is the thing that was actually broken.
       */
      const gateAngles = ringCrossings(roads, cx, cz, wallR).map(c => c.angle);
      // always at least one way in, even on a settlement no road reaches
      if (!gateAngles.length) gateAngles.push(rng() * Math.PI * 2);
      const isGate = i => {
        const a = ((i + 0.5) / segments) * Math.PI * 2;
        return gateAngles.some(g => {
          const diff = Math.abs(((a - g + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          return diff < (SEG * 1.9) / wallR;                // about two segments wide
        });
      };

      /**
       * A GATEHOUSE THAT LINES UP WITH ITS WALL, AND THAT YOU CAN WALK THROUGH.
       *
       * Two reported bugs in one place. "Gates are rotated 90 degrees just like the walls used to
       * be, and do not connect to the walls all the way" — the yaw was built from the gate's own
       * bearing with a quarter turn bolted on, which is a different convention from the one every
       * wall segment uses, so the gatehouse stood across the wall line instead of along it and left
       * daylight at both joins. It now takes its bearing from THE SAME CHORD a wall segment would
       * have occupied here, so it cannot disagree with the wall, and it is stretched to the width of
       * the gap so the masonry actually meets.
       *
       * And "the gate itself should be open so the player can walk through the middle": the solid
       * `place` would register is a single circle over the whole gatehouse, which is a plug. The
       * gatehouse goes down with no collision of its own and two jamb solids are added at its ends
       * instead, leaving the passage between them open.
       */
      /**
       * THE GATE FACES THE ROAD, AND THE STRETCH GOES ACROSS THE OPENING.
       *
       * Third time on this one, so here is the mesh, which is what I should have read first. The
       * gatehouse is two towers at x = +/-2.6 with a 7.4-wide span over the gap between them and a
       * portcullis 0.25 thin in Z. So its OPENING runs along **X** (tower to tower) and you walk
       * through it along **Z**.
       *
       * That gives two rules, and the first two attempts each got one of them wrong:
       *   - the yaw must aim local +Z **radially**, out through the wall, because that is the way
       *     the road goes. Aiming it along the wall tangent — which is what a wall SEGMENT wants —
       *     turns the passage sideways: "its 90 degrees away from the road".
       *   - the stretch must go on **X**, widening the opening to fill the gap. Stretching Z instead
       *     just makes the passage longer: "the elongation affected the wrong side so now it acts
       *     more like a tunnel".
       *
       * `atan2(dx, dz)` is the standard yaw for a +Z-forward body, and the radial direction at
       * bearing `g` is `(cos g, sin g)`.
       */
      const gateHalf = (SEG * 1.9) / wallR;                 // the same half-angle `isGate` clears
      const GATE_SPAN = 7.4;                                // the mesh's own width, tower to tower
      for (const g of gateAngles.slice(0, 4)) {
        const gx = cx + Math.cos(g) * wallR, gz = cz + Math.sin(g) * wallR;
        if (terrain.underwater(gx, gz)) continue;
        const ax = cx + Math.cos(g - gateHalf) * wallR, az = cz + Math.sin(g - gateHalf) * wallR;
        const bx = cx + Math.cos(g + gateHalf) * wallR, bz = cz + Math.sin(g + gateHalf) * wallR;
        const chord = Math.hypot(bx - ax, bz - az);
        const wide = Math.max(1, chord / GATE_SPAN);
        const yaw = Math.atan2(Math.cos(g), Math.sin(g));   // +Z points out along the road
        const low = Math.min(terrain.heightAt(ax, az), terrain.heightAt(bx, bz));
        // R21: a gate is the ONE thing that belongs on the road — it is built at a ring crossing
        // precisely so the road runs through it — so it opts out of `place`'s new road test.
        if (!place('gatehouse', gx, gz, yaw, [wide, 1, 1], 0.9, low, { solid: false, onRoad: true })) continue;

        /**
         * The jambs, so the middle stays open.
         *
         * "The gate itself should be open so the player can walk through the middle." `place` would
         * register one circular solid over the whole gatehouse, which is a plug. Two solids at the
         * towers instead, offset along the wall's tangent — which is perpendicular to the radial
         * yaw above — leave the passage between them clear.
         */
        const tx = -Math.sin(g), tz = Math.cos(g);          // along the wall
        const off = 2.6 * wide;                             // where the mesh puts its towers
        const jamb = BUILDING_SOLIDS.gatehouse;
        if (jamb && jamb[0] > 0) {
          const r = Math.min(jamb[0] * 0.5, off * 0.7);
          for (const side of [-1, 1]) solids.add(gx + tx * off * side, gz + tz * off * side, r, jamb[1]);
        }
      }
      /**
       * …AND ONLY THEN THE WALL ITSELF.
       *
       * The gatehouses go down FIRST on purpose. Every building here is an InstancedMesh with a cap
       * on it, and the caps are spent in the order things are placed: a town at the far edge of the
       * feature radius that runs the `wall` mesh dry is a cosmetic gap, but one that runs the
       * `gatehouse` mesh dry is a town you cannot get into. A gate is worth more than a wall
       * segment, so it is bought first. (`isGate` is independent of whether the gatehouse mesh was
       * actually placed, so even with the cap exhausted the opening is still there.)
       */
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
        place('wall', mx, mz, Math.atan2(bx - ax, bz - az), [1, 1 + lean / 3.8, chord / SEG * 1.06],
          0.9, low, { tint: cultKit.townWall.colour });
      }

      // towers beside every gate, and at the quarters
      const towerAngles = [...gateAngles.flatMap(g => [g - 0.26, g + 0.26]),
        ...[0, 1, 2, 3].map(i => (i / 4) * Math.PI * 2 + 0.4)];
      for (const a of towerAngles.slice(0, 10)) {
        place('tower', cx + Math.cos(a) * wallR, cz + Math.sin(a) * wallR, 0, 1, 1.1, null,
          { tint: cultKit.townWall.colour });
      }
    }
  }

  function buildInstances(px, pz) {
    const counts = {};
    for (const key of BUILDING_KEYS) counts[key] = 0;
    solids.clear();
    // ROUND 14: every town's streets go into one ribbon buffer — see buildSettlement
    const streets = { position: [], normal: [], color: [], index: [] };

    for (const node of settlements) {
      if (Math.hypot(node.wx - px, node.wz - pz) > radius) continue;
      buildSettlement(node, counts, px, pz, streets);
    }
    /**
     * THE BRIDGE, AND THE THING THAT CARRIES YOU ACROSS IT.
     *
     * Round 16. Until now `js/planet.js` raised the ground to the deck for a few metres either side
     * of the road's centre line, which is what you actually walked on — an earth dam straight
     * across the channel. That is gone, so the bridge has to carry you itself: the same record that
     * told `heightAt` to leave the water alone puts the mesh down AND files a deck in the obstacle
     * field, at the same place, the same width and the same length. `js/player.js` already stands
     * on whatever `standAt` hands it, so nothing there had to change.
     *
     * `BUILDING_INFO.bridge.solid` is still `[0, 0]`: a bridge is walked ON, never into, and
     * `place()` is not what files this.
     */
    for (const b of bridges) {
      if (Math.hypot(b.x - px, b.z - pz) > radius) continue;
      if (counts.bridge >= BUILDINGS.bridge.cap) break;
      const deck = b.deck ?? terrain.roadSurfaceAt(b.x, b.z) ?? (terrain.heightAt(b.x, b.z) + 2.4);
      // the crossing knows how far the water reaches along the road and how wide the road is; the
      // mesh is 10 long and 5 wide before scaling, so these two ratios make it match exactly
      const halfLength = b.halfLength ?? 12;
      const halfWidth = b.halfWidth ?? 2.9;
      const meshHalf = b.meshHalfLength ?? halfLength;
      const span = Math.max(1, (meshHalf * 2) / BUILDINGS.bridge.span);
      const wide = Math.max(1, (halfWidth * 2) / 5);
      matrix.compose(
        new THREE.Vector3(b.x, deck, b.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, b.angle, 0)),
        new THREE.Vector3(wide, 1.15, span),
      );
      instanced.bridge.setMatrixAt(counts.bridge, matrix);
      instanced.bridge.setColorAt(counts.bridge, colour.setScalar(1));
      counts.bridge++;

      /**
       * THE COLLIDER FOLLOWS THE ROAD, RATHER THAN BEING ONE FLAT PLANK.
       *
       * The graded surface RAMPS up to a crossing over tens of metres, so a single rectangle at the
       * deck's own height leaves a step where it meets the road — measured at Pewargate, 1.95 m,
       * which is a wall you walk into. A chain of short decks each sitting on the road's own height
       * is a ramp you walk up, and it covers every metre of the hole `heightAt` opened. Four metres
       * a segment keeps each step inside `CLEARANCE`, which is what makes it walkable rather than
       * something you have to jump.
       */
      const STEP = 4;
      const n = Math.max(1, Math.ceil(halfLength / STEP));
      const tx = b.tx ?? Math.sin(b.angle), tz = b.tz ?? Math.cos(b.angle);
      for (let k = -n; k < n; k++) {
        const d = ((k + 0.5) / n) * halfLength;
        const sx = b.x + tx * d, sz = b.z + tz * d;
        // the road where this piece of deck is; the bridge's own height where there is no road
        const y = terrain.roadSurfaceAt(sx, sz) ?? deck;
        // the top of the deck box: it is 0.45 tall about its own middle, scaled 1.15
        solids.addDeck(sx, sz, b.angle, halfLength / n + 0.2, halfWidth, y + 0.225 * 1.15);
      }
    }

    for (const key of BUILDING_KEYS) {
      const mesh = instanced[key];
      mesh.count = visible ? counts[key] : 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // the streets, as one ribbon mesh
    streetMesh.geometry.dispose();
    const sg = new THREE.BufferGeometry();
    if (streets.position.length) {
      sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(streets.position), 3));
      sg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(streets.normal), 3));
      sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(streets.color), 3));
      sg.setIndex(streets.index);
    }
    streetMesh.geometry = sg;
    streetMesh.visible = visible && streets.position.length > 0;
  }

  function rebuild(px, pz) {
    rebuilds++;
    buildRibbons(px, pz);
    buildInstances(px, pz);
  }

  return {
    rivers, roads, bridges, settlements, instanced, riverMesh, roadMesh, streetMesh, solids,

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
      for (const m of [riverMesh, roadMesh, streetMesh]) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    },
  };
}
