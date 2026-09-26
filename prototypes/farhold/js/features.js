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
// R27 M2 — one answer to "how big is this town", and one to "does it have a wall"
import { townExtent, rememberPlan, forgetPlans, wallTier } from './town-plan.js';
import { laneRibbon, ringCrossings } from './roadplan.js';
import { planTown, cultureFor } from '../../../proctown/js/townplan.js';
import { padSpotFor, boardSpotFor } from './waypoints.js';
import {
  describeBuilding, partsFor, describeStall, stallParts, stallsFor,
  radiusOf, mix, MESHES, CULTURE_KIT,
  // R27 M3 — the town edges, by the culture's wall kind
  wallKitParts, fenceParts, boundaryStoneParts, fenceKindFor, fenceTintFor,
  WALL_KINDS, FENCE_KINDS, WALL_SEG, FENCE_SEG,
} from '../../../proctown/js/buildkit.js';
import { edgeKey } from './town-plan.js';     // R27 M3
import { PIECES as SITE_PIECES } from './sites.js';          // R27 M3: the banner model
import { waterRibbon, lakeSheet, roadDeck } from './water-plan.js';
import { makeRng } from '../../../worldgen/js/noise.js';
import { M_PER_CELL } from './planet.js';
import { ObstacleField, BUILDING_SOLIDS } from './collide.js';
import { bridgeGeometry, fileDeck, fileRails, filePiers, fordGeometry, culvertGeometry } from './bridge-plan.js';
import { bridgeIndex } from './ground.js';

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
/** R27 M3: how near a town has to be for its fence, boundary stones and banners to be drawn. */
const DECOR_RANGE = 600;
/** Round 23: a town wall's collider, half its thickness (the drawn wall is 1.1-1.2 m thick). */
const WALL_HALF = 0.6;
/** A gate door leaf: how thick, and how tall — the passage under the span is 4.9 m clear. */
const DOOR_THICK = 0.24, DOOR_HEIGHT = 4.5;
/** R27 M4 — seconds a gate's doors take to swing from open to shut, or back. */
export const GATE_SWING = 0.8;

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

/** R27 M3 — a kit part list (unit shapes, base origin) as one merged geometry. */
function kitGeometry(parts) {
  return mergeParts(parts.map(p => ({
    geometry: unitMesh(p.mesh), color: p.colour,
    matrix: mat4(p.x, p.y, p.z, p.w, p.h, p.d, p.yaw || 0),
  })));
}

/** R27 M3 — every town-edge mesh: wall/tower/gatehouse per wall kind, the fences, the stones, the banner. */
function edgeBuildings() {
  const out = {};
  for (const kind of WALL_KINDS) {
    for (const piece of ['wall', 'tower', 'gatehouse']) {
      const key = edgeKey(kind, piece);
      out[key] = { cap: BUILDING_INFO[key].cap, edge: kind, build: () => kitGeometry(wallKitParts(kind, piece)) };
    }
  }
  // decoration only: no collider is ever filed for these (see `edgeCatalogue` in js/town-plan.js)
  for (const kind of FENCE_KINDS) {
    out['fence_' + kind] = { cap: BUILDING_INFO['fence_' + kind].cap, build: () => kitGeometry(fenceParts(kind)) };
  }
  out.boundstone = { cap: BUILDING_INFO.boundstone.cap, build: () => kitGeometry(boundaryStoneParts()) };
  // js/sites.js's own banner, with a white cloth so the instance colour is the culture's
  out.banner = { cap: BUILDING_INFO.banner.cap, build: () => SITE_PIECES.banner.build('#8a8a8a', '#ffffff') };
  return out;
}

/** The buildings a settlement is made of. All small, all procedural, all instanced. */
export const BUILDINGS = {
  ...WANT_FOOTINGS,
  ...KIT_PARTS,
  /**
   * R27 M3 — THE TOWN EDGE, ONE MESH PER WALL KIND.
   *
   * The wall, the tower and the gatehouse used to be one model each, and every culture's town was
   * ringed by the same masonry in a different colour. `CULTURES[*].wall` has named a material for
   * each culture since the planner went in (stone, cutstone, palisade, hedge, bone, mudbrick) and
   * nothing read it. The pieces are part lists in proctown/js/buildkit.js now — the kit gallery
   * draws the same lists — and each kind gets its own InstancedMesh (`edgeKey`), stone keeping the
   * plain `wall` / `tower` / `gatehouse` keys.
   *
   * All of them are built white-ish and tinted per instance with the culture's `townWall.colour`,
   * and all of them keep the frames the placement code below relies on: a wall piece runs `WALL_SEG`
   * along +Z; a gatehouse's opening is x = -2.1..2.1, clear to 4.9 m, 3.4 m deep. COLLISION NEVER
   * VARIES BY KIND — it is the round-23 `addSegment` on the drawn line, for every one of them.
   */
  ...edgeBuildings(),
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

  // (THE GATEHOUSE, WHITE — round 23: *"the gray part of the gate should match the green color of
  // the walls"*. It is one of the town-edge meshes above now, still white and still tinted with the
  // town's own wall colour, one per wall kind.)
  /**
   * One door leaf, hinged at its local origin and running along -Z, one unit long and one tall —
   * `buildSettlement` scales it to half the opening and to `DOOR_HEIGHT`. Planks with two iron
   * bands, in their own colours (a gate's doors are wood whatever the wall is made of).
   */
  gatedoor: { cap: BUILDING_INFO.gatehouse.cap * 2, build: () => mergeParts([
    { geometry: BOX, color: BEAM, matrix: mat4(0, 0.5, -0.5, DOOR_THICK, 1, 1) },
    { geometry: BOX, color: '#2e2a26', matrix: mat4(0, 0.22, -0.5, DOOR_THICK + 0.04, 0.05, 0.98) },
    { geometry: BOX, color: '#2e2a26', matrix: mat4(0, 0.78, -0.5, DOOR_THICK + 0.04, 0.05, 0.98) },
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
  // ROUND 23: the bridge is no longer an instanced box. It is built per bridge from
  // js/bridge-plan.js, the same samples its colliders are filed from — see `bridgeMesh` below.
};

export const BUILDING_KEYS = Object.keys(BUILDINGS);

// ---------------------------------------------------------------------------- the feature layer

/**
 * opts: { palette, seed, radius (metres of features kept around the player), refreshEvery (metres) }
 */


// ---------------------------------------------------------------- R27 M2: the planner's gates

/** Two gates within this bearing of each other are one gate (the road's, sized to the road). */
export const GATE_MERGE = 0.12;
const angleApart = (a, b) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);

/**
 * Is the street gate `pg` the same opening as the (road) gate `c`? Within `GATE_MERGE` of bearing
 * AND close enough that the street arrives inside the road gate's opening, give or take two metres.
 * The bearing alone is not enough on a big wall: 0.12 rad is 15 m at a grown city's 124 m, and a
 * street merged into a road gate 8 m away runs into the masonry beside it.
 */
function sameGate(c, pg, wallR) {
  const apart = angleApart(c.angle, pg.angle);
  if (apart >= GATE_MERGE) return false;
  const radial = [Math.cos(c.angle), Math.sin(c.angle)];
  const slant = (c.tx || c.tz) ? Math.max(0.55, Math.abs(c.tx * radial[0] + c.tz * radial[1])) : 1;
  const openHalf = Math.min(8, ((c.half ?? 3) + 1.2) / slant);
  return apart * wallR <= openHalf + 2;
}

/** The widest a single gate opening may be, in metres (the gatehouse model scales up to this). */
const GATE_WIDEST = 16;

/**
 * Can road gate `c` be widened to take in street gate `pg` as well? Within `GATE_MERGE` of bearing
 * and the two openings together no wider than `GATE_WIDEST`. (The two would otherwise be cut as
 * separate gates whose runs share a stretch of wall, which the builder cannot do.)
 */
function absorb(c, pg, wallR) {
  const apart = angleApart(c.angle, pg.angle);
  if (apart >= GATE_MERGE) return false;
  const radial = [Math.cos(c.angle), Math.sin(c.angle)];
  const slant = (c.tx || c.tz) ? Math.max(0.55, Math.abs(c.tx * radial[0] + c.tz * radial[1])) : 1;
  const openHalf = Math.min(8, ((c.half ?? 3) + 1.2) / slant);
  return apart * wallR + openHalf + pg.half + 1.2 <= GATE_WIDEST;
}

/**
 * The gates the town PLAN asks for, as crossings the wall builder can cut: first `plan.wall.gates`
 * (the planner's own two to four, one per main street end plus a lesser street if it had too
 * few), then every other main-street end that reaches the wall — a main street that ends on the
 * wall must end in an opening, whatever the planner's cap of four said.
 *
 * Each carries the street's own direction and half-width where it meets the wall, so the gate
 * code sizes the opening for a street arriving at a slant exactly as it does for a road. World
 * coordinates, on the final `wallR`.
 */
export function plannerGates(plan, cx, cz, wallR) {
  if (!plan?.wall) return [];
  const planR = Number.isFinite(plan.wallRadius) ? plan.wallRadius : wallR;
  const ends = [];
  for (const st of plan.streets || []) {
    const pts = st.pts || [];
    if (pts.length < 2) continue;
    for (const [e, prev] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) {
      if (Math.abs(Math.hypot(e[0], e[1]) - planR) > 3) continue;
      const len = Math.hypot(e[0] - prev[0], e[1] - prev[1]) || 1;
      const angle = Math.atan2(e[1], e[0]);
      ends.push({
        angle, x: cx + Math.cos(angle) * wallR, z: cz + Math.sin(angle) * wallR,
        dx: e[0], dz: e[1],
        tx: (e[0] - prev[0]) / len, tz: (e[1] - prev[1]) / len,
        half: (st.width ?? 5) / 2, main: st.cls === 'main', planner: true,
      });
    }
  }
  const out = [];
  const push = c => { if (!out.some(o => angleApart(o.angle, c.angle) < GATE_MERGE)) out.push(c); };
  for (const g of plan.wall.gates || []) {
    let best = null, bd = 0.02;
    for (const e of ends) { const d = angleApart(e.angle, g.angle); if (d < bd) { bd = d; best = e; } }
    push(best || {
      angle: g.angle, x: cx + Math.cos(g.angle) * wallR, z: cz + Math.sin(g.angle) * wallR,
      tx: 0, tz: 0, half: 2.5, planner: true,
    });
  }
  for (const e of ends) if (e.main) push(e);
  return out;
}

export function createFeatures(scene, terrain, opts = {}) {
  const world = terrain.world;
  const palette = opts.palette || {};
  const radius = opts.radius ?? 2600;
  const refreshEvery = opts.refreshEvery ?? 260;
  const seed = (opts.seed ?? 1) >>> 0;
  forgetPlans();                                   // R27 M2: a new world, so every town id is a new town
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
  /**
   * ROUND 23 — every bridge near the player in one mesh, built from its plan (js/bridge-plan.js).
   * A bridge is geometry rather than a transform now, for the same reason a street is: its deck
   * follows the road's own rise and fall, and a stretched box cannot.
   */
  const bridgeMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  for (const m of [riverMesh, roadMesh, streetMesh, bridgeMesh]) {
    m.frustumCulled = false;
    m.name = 'farhold-' + (m === riverMesh ? 'rivers' : m === roadMesh ? 'roads' : m === streetMesh ? 'streets' : 'bridges');
    scene.add(m);
  }
  /** The bridge plans drawn on the last rebuild — the tests read these against the colliders. */
  let bridgePlans = [];
  /**
   * Round 23: every walled settlement's openings, by settlement id — where the gate is, which way
   * is out, how wide the opening is. `js/town.js` stands the gate guards from this, so they are at
   * the gate the player can see rather than somewhere worked out a second time.
   */
  const gateRecords = new Map();
  /** …and the whole ring, for the tests: centre, radius, segment count and what each segment is. */
  const wallRecords = new Map();
  /** R27 M3 — a village's fence or a hamlet's stones: `{ cx, cz, r, tier, kind, key, gaps, pieces, stones, banners }`. */
  const fenceRecords = new Map();
  /**
   * R27 M4 — GATES THAT OPEN AND SHUT. `doorState` is how far each gate's doors have swung (0 open,
   * 1 shut) and where they are going, by `<settlement id>:<gate index>`. It outlives a rebuild, so a
   * shut gate is built shut again; it is never saved (js/town.js derives it from the world every
   * half second). `doorsBuilt` is the doors standing right now, with their two instance slots.
   */
  const doorState = new Map();
  let doorsBuilt = [];
  /** R27 M4 — the buildings with a `role` (js/town-plan.js BUILDING_INFO) as built, per settlement. */
  const postRecords = new Map();

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
   * R27 M4 — put one gate's two leaves at a swing of `t` (0 open along the passage walls, 1 shut
   * across it). Each leaf turns about its own hinge by a quarter turn toward the middle; shut, it is
   * trimmed to the inset so the two meet edge to edge instead of overlapping (and flickering).
   */
  const doorQuat = new THREE.Quaternion(), doorEuler = new THREE.Euler(), doorPos = new THREE.Vector3(), doorSize = new THREE.Vector3();
  function swingDoor(door, t) {
    for (const lf of door.leaves) {
      // local +Z along the wall toward this leaf's own side, so -Z (the leaf) points to the middle
      const shutYaw = Math.atan2(lf.side * door.ux, lf.side * door.uz);
      let turn = shutYaw - door.yaw;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      doorEuler.set(0, door.yaw + turn * t, 0);
      doorQuat.setFromEuler(doorEuler);
      doorPos.set(lf.hx, lf.y, lf.hz);
      doorSize.set(1, DOOR_HEIGHT, door.leaf - (door.leaf - door.inset - 0.005) * t);
      matrix.compose(doorPos, doorQuat, doorSize);
      instanced.gatedoor.setMatrixAt(lf.slot, matrix);
    }
  }


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
      { solid: wantSolid = true, tint = null, foot = null, onRoad = false, bank = false } = {}) => {
      if (counts[key] >= BUILDINGS[key].cap) return false;
      // nothing is built in the channel or on the bank — towns sit BESIDE their river. R23: except
      // a length of town wall, which runs down to the water's edge (it decides that for itself)
      if (!bank && terrain.riverAt(x, z) > 0.3) return false;
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
     * Put an instance down exactly where it is asked to go, no questions — for a part of something
     * that has already been placed (a gate's door leaves hang on a gatehouse that passed `place`).
     * White instance colour, so the mesh's own vertex colours are the whole colour.
     */
    const placeFree = (key, x, y, z, yaw, size) => {
      if (counts[key] >= BUILDINGS[key].cap) return false;
      matrix.compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
        new THREE.Vector3(size[0], size[1], size[2]),
      );
      instanced[key].setMatrixAt(counts[key], matrix);
      instanced[key].setColorAt(counts[key], colour.setScalar(1));
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
     * R27 M3 — the town-edge DECORATION (a village fence, a hamlet's stones, the banners) is drawn
     * for towns within `DECOR_RANGE` only. None of it reads from a kilometre off, and each kind is its
     * own mesh, so a far village costs a draw call for a fence nobody can see. Walls and towers are
     * the silhouette and stay at the full feature radius. 600 m, not less: the layer rebuilds every
     * `refreshEvery` (260 m) of travel, so a village just outside the range at one rebuild can be
     * 340 m off before the next one draws its fence — far enough that the pop-in is not seen.
     */
    const decor = Math.hypot(cx - px, cz - pz) < DECOR_RANGE;

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
      // R27 M2 — …and asked again on the radius the plan really walls at, when it grows the town
      linksAt: r => roadLinksFor(cx, cz, r),
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
    // R27 M2 — …and so does everybody else: js/town.js's safe circle, the waypoint boundary, "you
    // are in town", the town hall and the muster all read this through `townExtent`
    rememberPlan(node, plan);

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
    // R27 M3 — where the streets actually DRAWN end, so a village fence leaves a gap for each
    const drawnStreetEnds = [];
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
        const lp = lane.points;
        if (lp.length >= 2) {
          drawnStreetEnds.push({ x: lp[0][0], z: lp[0][1], half: lane.half, px: lp[1][0], pz: lp[1][1] });
          drawnStreetEnds.push({ x: lp[lp.length - 1][0], z: lp[lp.length - 1][1], half: lane.half,
            px: lp[lp.length - 2][0], pz: lp[lp.length - 2][1] });
        }
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
      // R27 M4 — `BUILDING_INFO.role`'s first reader: js/town.js mans the watchposts from this
      if (BUILDING_INFO[key]?.role) {
        if (!postRecords.has(node.id)) postRecords.set(node.id, []);
        postRecords.get(node.id).push({ key, role: BUILDING_INFO[key].role, x, z, yaw, r: radiusOf(desc) });
      }
    }

    // a city gets a wall and towers (R27 M2: the one tier rule, not a sixth copy of `size >= 4`)
    // R27 M3 — …built in its culture's own material: the plan's wall kind picks the mesh
    const tier = wallTier(size);
    const edgeKind = WALL_KINDS.includes(plan.wall?.kind) ? plan.wall.kind
      : WALL_KINDS.includes(cultKit.townWall?.kind) ? cultKit.townWall.kind : 'stone';
    const EK = { wall: edgeKey(edgeKind, 'wall'), tower: edgeKey(edgeKind, 'tower'), gatehouse: edgeKey(edgeKind, 'gatehouse') };
    const bannerTint = cultKit.palette?.accent || '#7a2e2a';
    if (tier !== 'wall' && decor) buildLowEdge(tier);
    if (tier === 'wall') {
      // Walk the ring corner to corner: each segment spans the CHORD between two ring points and is
      // placed at that chord's midpoint, stretched slightly so it overlaps its neighbour. Spacing
      // segments by arc length (and giving each its own ground height) is what left gaps.
      // R22: `wallR` is the plan's own `wallRadius` now — see the note where it is declared
      const SEG = 6;                                      // the wall mesh is 6 long, along +Z
      const segments = Math.max(8, Math.round((Math.PI * 2 * wallR) / SEG));
      const TAU = Math.PI * 2;
      const ringPoint = i => {
        const a = (i / segments) * TAU;
        return [cx + Math.cos(a) * wallR, cz + Math.sin(a) * wallR];
      };
      const wallTint = cultKit.townWall.colour;
      const wrapSeg = i => ((i % segments) + segments) % segments;

      /**
       * WHERE THE GATES GO: wherever a road really meets the wall.
       *
       * Round 16: `ringCrossings` walks the polyline and interpolates the step from outside the
       * ring to inside — the same maths `roadLinksFor` uses for the high streets, so the wall and
       * the streets cannot disagree about where the road comes in. EVERY crossing opens the wall;
       * only the best four get a gatehouse (the mesh has a cap), and an opening without one is
       * still a way through.
       */
      const crossings = ringCrossings(roads, cx, cz, wallR);
      /**
       * R27 M2 — AND WHEREVER THE TOWN'S OWN MAIN STREETS REACH IT.
       *
       * The planner has always cut a gate at the end of every main street (`plan.wall.gates`, two
       * to four of them) and this file never read one: the only openings were where a WORLD road
       * crossed, so every high street that did not happen to line up with a road ran straight into
       * masonry, and a walled town with no road at all got one gate at `rng() * TAU` — a hole in a
       * random stretch of wall leading onto somebody's back yard.
       *
       * The planner's gates, and then any other main-street end that reaches the wall, are added
       * AFTER the road crossings, so the road's gate (sized to the carriageway) is the one kept when
       * two land on the same bearing, and the first four gatehouses go to roads. Everything is on
       * the final `wallR` — round 22's high street sat 7 degrees off its gate because the two were
       * asked about different circles.
       */
      for (const pg of plannerGates(plan, cx, cz, wallR)) {
        if (crossings.some(c => sameGate(c, pg, wallR))) continue;
        // close to a road gate but not inside it: one wider gate covering both, when that stays
        // a gate rather than a missing stretch of wall
        const host = crossings.find(c => !c.planner && absorb(c, pg, wallR));
        if (host) { (host.covers ||= []).push({ angle: pg.angle, half: pg.half + 1.2 }); continue; }
        crossings.push(pg);
      }
      // a plan always has a wall with at least two gates at this tier — this is the last resort
      // for a town whose wall the planner did not build (it cannot happen today; it must not strand)
      if (!crossings.length) crossings.push({ angle: rng() * TAU, half: 2.5, tx: 0, tz: 0, planner: true });

      /**
       * ROUND 23 — ONE WALL, ONE RULE FOR WHERE IT STANDS.
       *
       * *"The gate does not properly connect to the walls, you can just walk through the wall."*
       * (seed 47, Sheithyadmia V, x 13212 z 2916 — Fenkeep's west gate.) Three things left the gap:
       *
       *   1. The gatehouse was stretched over a fixed arc (`SEG * 1.9 / wallR` either side) and the
       *      wall segments cleared for it were chosen by a DIFFERENT test (segment middle inside
       *      that arc), so its ends and the wall's ends were never the same point.
       *   2. `place()` refuses anything with `roadAt > 0.45` under its middle, and a road arriving at
       *      a slant is still kerb (0.48) one segment beyond the arc — so the segment beside the gate
       *      was silently dropped, leaving a person-wide hole next to the tower.
       *   3. The wall was filed as a row of 3.4 m CIRCLES and the gate as two 2 m jamb circles eight
       *      metres out. Where the beads stopped, nothing was solid, whatever was drawn there.
       *
       * So each segment's fate is decided ONCE, up front (`spotOf`): water, a bridge, road, or wall.
       * A gate's run is the segments its gatehouse needs plus any road-refused neighbours, the
       * gatehouse goes on the chord between the two wall ends that bound that run — the very points
       * the neighbouring walls end on — and any of the run the gatehouse does not cover is filled
       * with wall on the same chord. Collision is a wall SEGMENT (js/collide.js `addSegment`) laid on
       * exactly the line each drawn piece occupies.
       */
      const DRY = (x, z) => !terrain.underwater(x, z);
      const spotOf = i => {
        const [ax, az] = ringPoint(i), [bx, bz] = ringPoint(i + 1);
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        const dryA = DRY(ax, az), dryB = DRY(bx, bz);
        if (!dryA && !dryB) return { kind: 'water' };
        if (terrain.bridgedAt?.(mx, mz, 1)) return { kind: 'bridge' };
        // (a/b are kept: a road that only runs ALONG the wall, never through it, still gets wall)
        if (terrain.roadAt(mx, mz) > 0.45 && dryA && dryB) return { kind: 'road', a: [ax, az], b: [bx, bz] };
        /**
         * A wall runs down to the water's edge and stops there — it does not stop a whole segment
         * short of it. Round 17's rule was "nothing is built with `riverAt > 0.3`", which for a
         * wall meant the last six metres of dry bank either side of a river were open ground you
         * could walk round the end of the wall on. The dry end is kept and the wet end is found by
         * bisection along the chord.
         */
        if (dryA && dryB) return { kind: 'wall', a: [ax, az], b: [bx, bz] };
        let lo = 0, hi = 1;                               // lo dry, hi wet, measured from the dry end
        const [sx, sz] = dryA ? [ax, az] : [bx, bz], [ex, ez] = dryA ? [bx, bz] : [ax, az];
        for (let k = 0; k < 10; k++) {
          const t = (lo + hi) / 2;
          if (DRY(sx + (ex - sx) * t, sz + (ez - sz) * t)) lo = t; else hi = t;
        }
        if (lo < 0.08) return { kind: 'water' };
        return { kind: 'wall', a: [sx, sz], b: [sx + (ex - sx) * lo, sz + (ez - sz) * lo], cut: true };
      };
      const spots = Array.from({ length: segments }, (_, i) => spotOf(i));

      /**
       * The gatehouse model's own proportions (see `BUILDINGS.gatehouse`): 7.4 m across its towers,
       * a 4.2 m opening between them, 3.4 m deep. It is scaled on X only, so the opening scales with
       * the whole — and it is sized so the opening clears the road, measured ALONG THE WALL: a road
       * that meets the wall at forty degrees is half as wide again where it passes through it.
       */
      const GATE_SPAN = 7.4, GATE_OPEN = 4.2, GATE_DEPTH = 3.4;
      const gates = [];
      const cleared = new Set();
      for (const [n, c] of crossings.entries()) {
        let g = c.angle;
        const planned = !!c.planner;
        const radial = [Math.cos(g), Math.sin(g)];
        const slant = (c.tx || c.tz) ? Math.max(0.55, Math.abs(c.tx * radial[0] + c.tz * radial[1])) : 1;
        let open = Math.min(16, (2 * ((c.half ?? 3) + 1.2)) / slant);
        /**
         * R27 M2 — a road gate that took in a street arriving a few metres along the wall (see
         * `absorb` below) is widened to cover both, and its middle moves to the middle of the two,
         * so neither the road nor the street runs into the masonry beside the other.
         */
        if (c.covers?.length) {
          let a = -open / 2, b = open / 2;
          for (const cv of c.covers) {
            const along = (((cv.angle - g + Math.PI * 3) % TAU) - Math.PI) * wallR;
            a = Math.min(a, along - cv.half); b = Math.max(b, along + cv.half);
          }
          open = Math.min(GATE_WIDEST, b - a);
          g += ((a + b) / 2) / wallR;
          c.x = cx + Math.cos(g) * wallR; c.z = cz + Math.sin(g) * wallR;
        }
        const wide = Math.max(1, open / GATE_OPEN);
        const span = GATE_SPAN * wide;
        // every segment the gatehouse's span overlaps, plus a metre either side
        const halfA = (span / 2 + 1) / wallR;
        const base = (g / TAU) * segments;
        let lo = Math.floor(base - (halfA / TAU) * segments);
        let hi = Math.floor(base + (halfA / TAU) * segments);
        // …and the kerb beside it, which the old code dropped without a word
        // (R27 M2: not for a street's gate — the road beside it belongs to the road's own gate,
        // and a road segment outside every run is still walled below)
        for (let k = 0; !planned && k < 4 && spots[wrapSeg(lo - 1)].kind === 'road'; k++) lo--;
        for (let k = 0; !planned && k < 4 && spots[wrapSeg(hi + 1)].kind === 'road'; k++) hi++;
        // R27 M2: a street's gate whose run would share a segment with a gate already cut is
        // already served by that opening — two gatehouses cannot stand on one stretch of wall
        // — so it slides a segment or two clear of that run if it can (the opening is re-centred on
        // the street within the chord below, so it moves by less than the slide), and only if it
        // cannot is it left to the gate already there
        let tight = false;
        if (planned) {
          const clash = (a, b) => { for (let i = a; i <= b; i++) if (cleared.has(wrapSeg(i))) return true; return false; };
          if (clash(lo, hi)) {
            // trim the run back from whichever end is shared; what is left must still hold the
            // opening, and a trimmed gate is a plain gap (no room for a gatehouse's towers)
            const fromLo = cleared.has(wrapSeg(lo));
            while (lo <= hi && cleared.has(wrapSeg(lo))) lo++;
            while (hi >= lo && cleared.has(wrapSeg(hi))) hi--;
            const segLen = (TAU * wallR) / segments;
            // …growing on the free side if the trim left too little to walk through
            for (let k = 0; k < 2 && (hi - lo + 1) * segLen < open + 1; k++) {
              if (fromLo && !cleared.has(wrapSeg(hi + 1))) hi++;
              else if (!fromLo && !cleared.has(wrapSeg(lo - 1))) lo--;
            }
            if (hi < lo || clash(lo, hi) || (hi - lo + 1) * segLen < open + 1) continue;
            tight = true;
          }
        }
        for (let i = lo; i <= hi; i++) cleared.add(wrapSeg(i));
        // R27 M2: numbered by the gates KEPT, so the four gatehouses go to the first four kept
        gates.push({ n: gates.length, g, c, open, wide, span, lo, hi, tight });
      }

      /** Put a length of wall between two points, drawn and solid on exactly the same line. */
      const wallPiece = (ax, az, bx, bz) => {
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.25) return false;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        /**
         * R27 M3 — a piece whose MIDDLE is in the water but one end is dry keeps its dry part, cut at
         * the waterline, the way `spotOf` already cuts a ring segment. It used to drop the whole
         * piece, which left the dry metres between a gatehouse and a river open (found by M3's ring
         * walk across all seven cultures: Dearbigate planned as a dwarf hold had 2 m of it).
         */
        if (terrain.underwater(mx, mz)) {
          const dryA = !terrain.underwater(ax, az), dryB = !terrain.underwater(bx, bz);
          if (dryA === dryB) return false;
          const [sx, sz] = dryA ? [ax, az] : [bx, bz], [ex, ez] = dryA ? [bx, bz] : [ax, az];
          let lo = 0, hi = 0.5;
          for (let k = 0; k < 10; k++) {
            const t = (lo + hi) / 2;
            if (!terrain.underwater(sx + (ex - sx) * t, sz + (ez - sz) * t)) lo = t; else hi = t;
          }
          return wallPiece(sx, sz, sx + (ex - sx) * lo, sz + (ez - sz) * lo);
        }
        if (terrain.bridgedAt?.(mx, mz)) return false;
        // sit the piece on the LOWER of its two ends and make it taller, so a step in the ground
        // is hidden under the wall instead of opening a gap beneath it
        const ha = terrain.heightAt(ax, az), hb = terrain.heightAt(bx, bz);
        const low = Math.min(ha, hb), lean = Math.abs(ha - hb);
        // the mesh runs along +Z, so the LENGTH scale goes on Z and the yaw is the standard one.
        // It is stretched 6% so neighbours overlap; the collider covers that same length.
        if (!place(EK.wall, mx, mz, Math.atan2(bx - ax, bz - az), [1, 1 + lean / 3.8, (len / SEG) * 1.06],
          0.9, low, { tint: wallTint, solid: false, onRoad: true, bank: true, foot: 0 })) return false;
        const ux = (bx - ax) / len, uz = (bz - az) / len, over = len * 0.03;
        solids.addSegment(ax - ux * over, az - uz * over, bx + ux * over, bz + uz * over, WALL_HALF, 4 * (1 + lean / 3.8));
        return true;
      };

      /**
       * THE GATES GO DOWN FIRST, the wall after. Every building here is an InstancedMesh with a
       * cap, spent in the order things are placed — a town that runs the `wall` mesh dry is a
       * cosmetic gap, one that runs the `gatehouse` mesh dry is a town you cannot get into.
       */
      const records = [];
      for (const gate of gates) {
        const { g, c, open, wide, span, lo, hi, tight } = gate;
        // R27 M2: the first four kept gates get a gatehouse, unless a street's gate had to be
        // trimmed to fit beside another one — then it is a plain opening
        const wantHouse = gate.n < 4 && !tight;
        const hold = wantHouse ? span / 2 : open / 2;
        // the chord from the wall end before the run to the wall end after it — the two points the
        // neighbouring wall pieces end on, so the gate cannot help but meet them
        const [ax, az] = ringPoint(lo), [bx, bz] = ringPoint(hi + 1);
        const chord = Math.hypot(bx - ax, bz - az);
        const ux = (bx - ax) / chord, uz = (bz - az) / chord;
        // outward: the chord's normal pointing away from the centre
        let ox = uz, oz = -ux;
        if (((ax + bx) / 2 - cx) * ox + ((az + bz) / 2 - cz) * oz < 0) { ox = -ox; oz = -oz; }
        // centre the opening on the road where it meets this chord, kept inside the chord
        const rx = c.x ?? cx + Math.cos(g) * wallR, rz = c.z ?? cz + Math.sin(g) * wallR;
        const along = Math.max(hold, Math.min(chord - hold, (rx - ax) * ux + (rz - az) * uz));
        const gx = ax + ux * along, gz = az + uz * along;
        const yaw = Math.atan2(ox, oz);                    // +Z points out along the road
        const lowGate = Math.min(terrain.heightAt(gx - ux * span / 2, gz - uz * span / 2),
          terrain.heightAt(gx + ux * span / 2, gz + uz * span / 2));
        const wet = terrain.underwater(gx, gz) || terrain.bridgedAt?.(gx, gz, 2);
        // R21: a gate is the ONE thing that belongs on the road, so it opts out of `place`'s road
        // test. R23: tinted with the town's own wall colour — "the gray part of the gate should
        // match the green color of the walls"; it was hard-coded STONE while the wall was tinted.
        const built = wantHouse && !wet && place(EK.gatehouse, gx, gz, yaw, [wide, 1, 1], 0.9, lowGate,
          { solid: false, onRoad: true, tint: wallTint });
        // R27 M3 — the town's banner, just outside the gatehouse beside its tower. No collider (a
        // pole in front of a gate is a snag, and the guards stand here); it slides clear of the road
        let banner = null;
        if (built && decor) {
          // outside first, either tower, sliding along the wall off a road that hugs it; then inside
          for (const out of [GATE_DEPTH / 2 + 0.7, -(GATE_DEPTH / 2 + 0.7)]) {
            for (let k = 0; k <= 16 && !banner; k++) {
              for (const side of [-1, 1]) {
                if (banner) break;
                const along = span / 2 + 0.9 + k * 0.5;
                const bx2 = gx + side * ux * along + ox * out, bz2 = gz + side * uz * along + oz * out;
                if (place('banner', bx2, bz2, yaw, 1, 0.2, null, { solid: false, tint: bannerTint, foot: 0.4 })) banner = [bx2, bz2];
              }
            }
          }
        }

        // what the gatehouse does not cover (or all of the run but the opening, if there is no
        // gatehouse) is ordinary wall on the same chord
        const edge = built ? span / 2 : open / 2;
        wallPiece(ax, az, gx - ux * edge, gz - uz * edge);
        wallPiece(gx + ux * edge, gz + uz * edge, bx, bz);

        if (built) {
          /**
           * The towers are solid from the opening to the gatehouse's ends; the opening is not.
           * Tower depth is the model's 3.4 m, so the collider is 1.7 m either side of the chord.
           */
          for (const side of [-1, 1]) {
            solids.addSegment(gx + ux * side * open / 2, gz + uz * side * open / 2,
              gx + ux * side * span / 2, gz + uz * side * span / 2, GATE_DEPTH / 2, 7);
          }
          /**
           * THE DOORS STAND OPEN. *"The gate doors appear closed, let's make them open instead."*
           * The portcullis is gone from the model; two leaves, each half the opening wide, are hung
           * at the outer end of the passage and swung in against its side walls, pointing into the
           * town. Solid on the line they are drawn on, so you walk between them, not through them.
           */
          const leaf = open / 2;
          const hingeOut = GATE_DEPTH / 2 - 0.35;
          /**
           * R27 M4 — …AND SHUT. A siege camp outside, or a town that hunts you, swings the leaves
           * across the opening (js/town.js decides; `setGateShut` below). Each leaf keeps its
           * instance slot, so a swing is two `setMatrixAt`s and nothing is rebuilt. The colliders
           * are two sets filed once, switched by id: the open leaves along the passage walls, and
           * one door segment across the passage between the hinges when shut.
           */
          const inset = open / 2 - DOOR_THICK / 2 - 0.02;
          const key = `${node.id}:${records.length}`;
          const st = doorState.get(key) || { t: 0, want: 0 };
          doorState.set(key, st);
          const door = { key, node: node.id, yaw, ux, uz, ox, oz, leaf, inset, leaves: [] };
          for (const side of [-1, 1]) {
            const hx = gx + ux * side * inset + ox * hingeOut, hz = gz + uz * side * inset + oz * hingeOut;
            const ground = terrain.heightAt(hx, hz);
            // the leaf model runs along its local -Z from the hinge; yaw = the gate's, so -Z is inward
            const slot = counts.gatedoor;
            if (placeFree('gatedoor', hx, ground - 0.1, hz, yaw, [1, DOOR_HEIGHT, leaf])) door.leaves.push({ slot, side, hx, hz, y: ground - 0.1 });
            solids.addSegment(hx, hz, hx - ox * leaf, hz - oz * leaf, DOOR_THICK / 2 + 0.05, DOOR_HEIGHT,
              { id: key + ':open', enabled: st.want === 0 });
          }
          // shut: hinge to hinge, across the passage at the outer end
          solids.addSegment(gx - ux * inset + ox * hingeOut, gz - uz * inset + oz * hingeOut,
            gx + ux * inset + ox * hingeOut, gz + uz * inset + oz * hingeOut, DOOR_THICK / 2 + 0.05, DOOR_HEIGHT,
            { id: key + ':shut', enabled: st.want === 1 });
          doorsBuilt.push(door);
          if (st.t > 0) swingDoor(door, st.t);
        }
        records.push({
          x: gx, z: gz, yaw, open, span, depth: GATE_DEPTH, gatehouse: !!built,
          // R27 M4 — `open` above is the opening's WIDTH (read everywhere), so the state is `shut`:
          // derived, never saved. Only a gatehouse has doors; a plain gap cannot shut.
          doors: !!built, get shut() { return !!built && (doorState.get(`${node.id}:${this.index}`)?.want === 1); },
          index: records.length,
          // R27 M2: which list it came from, and whether its middle is dry (town.js posts no
          // guards at a gate standing in a river)
          source: c.planner ? 'street' : 'road', wet: !!wet,
          tx: ux, tz: uz, ox, oz, ground: terrain.heightAt(gx, gz), banner,
          // the stretch of wall this gate replaced, end to end — the two points its neighbours end on
          run: [ax, az, bx, bz], lo, hi,
        });
      }
      gateRecords.set(node.id, records);
      // R27 M3: `kind` and `keys` say which meshes this town's edge went into; `towers` is filled below
      const towers = [];
      wallRecords.set(node.id, {
        cx, cz, r: wallR, segments, kinds: spots.map(sp => sp.kind), gates: records,
        kind: edgeKind, keys: EK, towers,
      });

      // …and only then the wall itself
      for (let i = 0; i < segments; i++) {
        if (cleared.has(i)) continue;                       // a gate's run: done above
        const spot = spots[i];
        /**
         * Water and bridges stay open. A ROAD segment outside every gate's run is a road running
         * beside the wall rather than through it — every road that does go through has a crossing
         * and so a gate (`ringCrossings` solves every span exactly since R22). Before this, those
         * were dropped by `place()`'s road test like the kerb beside a gate was: seed 7's
         * Gukgruzcrown had forty metres of open wall where a road ran along the outside of it.
         */
        if (spot.kind !== 'wall' && spot.kind !== 'road') continue;
        wallPiece(spot.a[0], spot.a[1], spot.b[0], spot.b[1]);
      }

      /**
       * R27 M3 — TOWERS BY SPACING, NOT BY FIXED ANGLES.
       *
       * They were `gate +/- 0.26 rad` plus four quarter bearings, cut at ten: at a 157 m wall that
       * is a tower 41 m from its gate, the "quarters" landing on top of each other or in a river,
       * and a big city's far side with no tower at all. Now the ring is cut into STRETCHES of
       * standing wall (between gates, and between a gate and the water), a tower flanks each end of
       * every stretch three metres in, and the stretch between is filled at about `TOWER_EVERY` m.
       * A spot on water or on a kerb slides along the wall — up to `TOWER_SLIDE` m, never out of its
       * stretch, never nearer than `TOWER_MIN` to the last tower — instead of being dropped.
       */
      const TOWER_EVERY = 45, TOWER_MIN = 25, TOWER_MAX = 60, TOWER_SLIDE = 6, TOWER_FOOT = 2.6;
      const broken = i => {
        const k = wrapSeg(i);
        return cleared.has(k) || spots[k].kind === 'water' || spots[k].kind === 'bridge';
      };
      const towerOk = (x, z) => terrain.riverAt(x, z) <= 0.3 && terrain.roadAt(x, z) <= 0.45
        && !terrain.bridgedAt?.(x, z) && dryFor(x, z, TOWER_FOOT);
      const stretches = [];
      const start = [...Array(segments).keys()].find(i => broken(i) && !broken(i + 1));
      if (start === undefined) stretches.push([0, segments]);           // no break at all: the whole ring
      else {
        let i = start + 1;
        while (i < start + 1 + segments) {
          if (broken(i)) { i++; continue; }
          let j = i;
          while (j < start + 1 + segments && !broken(j)) j++;
          stretches.push([i, j]);                                      // segments [i, j)
          i = j;
        }
      }
      const segLen = (TAU * wallR) / segments;
      for (const [si, [i0, i1]] of stretches.entries()) {
        const L = (i1 - i0) * segLen;
        const whole = i1 - i0 >= segments;
        const want = [];
        if (whole) {
          const n = Math.max(3, Math.round(L / TOWER_EVERY));
          for (let k = 0; k < n; k++) want.push((k / n) * L);
        } else if (L < 8) {
          continue;
        } else if (L < TOWER_MIN + 6) {
          want.push(L / 2);
        } else {
          const inner = L - 6;
          let n = Math.max(1, Math.round(inner / TOWER_EVERY));
          while (inner / n > TOWER_MAX) n++;
          for (let k = 0; k <= n; k++) want.push(3 + (k / n) * inner);
        }
        let last = null;
        for (const s0 of want) {
          let placed = null;
          /**
           * R27 — A LONGER SLIDE BEFORE GIVING UP. A spot on a road that runs along the inside of
           * the wall (roads got wider in M5) could not find ground within 6 m and the tower was
           * dropped, leaving 88 m of bare wall at Cindergate (seed 4477). It now keeps looking out to
           * half the spacing; `TOWER_MIN` still holds against the last tower, so the gap either side
           * stays inside 25-70 m.
           */
          const reach = Math.max(TOWER_SLIDE, TOWER_EVERY / 2);
          for (let k = 0; k <= reach * 4 && !placed; k++) {
            const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5;
            const s1 = s0 + off;
            if (!whole && (s1 < TOWER_FOOT || s1 > L - TOWER_FOOT)) continue;
            if (last != null && s1 - last < TOWER_MIN) continue;
            const a = (i0 * segLen + s1) / wallR;
            const x = cx + Math.cos(a) * wallR, z = cz + Math.sin(a) * wallR;
            if (!towerOk(x, z)) continue;
            if (place(EK.tower, x, z, 0, 1, 1.1, null, { tint: wallTint, foot: TOWER_FOOT })) {
              placed = s1;
              towers.push({ x, z, angle: ((a % TAU) + TAU) % TAU, stretch: si, at: s1 });
            }
          }
          if (placed != null) last = placed;
        }
      }
    }

    /**
     * R27 M3 — A VILLAGE GETS A FENCE, A HAMLET GETS BOUNDARY STONES.
     *
     * Before this a settlement under size 4 had no edge at all: the houses simply stopped. A size
     * 2-3 settlement (`wallTier` 'low') now gets a low fence — a hedge, a stake fence or a rail fence
     * by culture — at `townExtent(...).ring + 4`, with a gap wherever a world road or one of the
     * town's own streets reaches it. A hamlet (size 1) gets two boundary stones either side of each
     * road into it.
     *
     * DECORATION ONLY. None of it files a collider: a fence you cannot step over round a village is
     * a trap the first time a quest giver stands on the wrong side of it, so these are placed with
     * `solid: false` and `BUILDING_INFO` gives them `solid: [0, 0]`.
     */
    function buildLowEdge(lowTier) {
      const R = townExtent(node).ring + 4;
      const TAU = Math.PI * 2;
      const fkind = fenceKindFor(edgeKind);
      const fkey = 'fence_' + fkind;
      const ftint = fenceTintFor(fkind, cultKit.townWall?.colour || '#8a8275');
      const apart = (a, b) => Math.abs(((a - b + Math.PI * 3) % TAU) - Math.PI);
      // the openings: every world road through the ring, then every street end that reaches it
      const gaps = [];
      for (const c of ringCrossings(roads, cx, cz, R)) {
        const radial = [Math.cos(c.angle), Math.sin(c.angle)];
        const slant = (c.tx || c.tz) ? Math.max(0.55, Math.abs(c.tx * radial[0] + c.tz * radial[1])) : 1;
        gaps.push({ angle: c.angle, half: ((c.half ?? 3) + 1.5) / slant, source: 'road' });
      }
      // a street end counts when it is drawn (the pruned alleys are not), within 6 m of the fence
      // line, and heading OUT of the town rather than running along the edge
      for (const e of drawnStreetEnds) {
        const lx = e.x - cx, lz = e.z - cz, r = Math.hypot(lx, lz);
        if (r < R - 6) continue;
        const dx = e.x - e.px, dz = e.z - e.pz, dl = Math.hypot(dx, dz) || 1;
        if ((lx * dx + lz * dz) / (r * dl) < 0.35) continue;
        const angle = Math.atan2(lz, lx);
        if (gaps.some(g => apart(g.angle, angle) * R < g.half)) continue;
        gaps.push({ angle, half: e.half + 1.5, source: 'street' });
      }
      const inGap = (a, pad = 0) => gaps.some(g => apart(g.angle, a) * R < g.half + pad);
      const record = { cx, cz, r: R, tier: lowTier, kind: lowTier === 'low' ? fkind : 'stones', key: lowTier === 'low' ? fkey : 'boundstone', gaps, pieces: [], stones: [], banners: [] };
      fenceRecords.set(node.id, record);

      /**
       * Slide a piece of decoration along the ring, away from the road, until it can stand. Up to
       * 16 m: `roadAt` reads 0.9 three metres off a road's centre line and only falls under
       * `place()`'s 0.45 at the far side of the kerb, so a stone started at the carriageway's edge
       * has most of a kerb to cross before it is off the road.
       */
      const slidePlace = (key, angle, dir, opts, yaw = null) => {
        for (let k = 0; k <= 32; k++) {
          const a = angle + dir * (k * 0.5) / R;
          const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
          if (place(key, x, z, yaw ?? -a, 1, 0.15, null, { solid: false, ...opts })) return [x, z];
        }
        return null;
      };
      const bannerAt = g => {
        // beside the opening on whichever side has ground for it (two roads can fork into one gap)
        const b = slidePlace('banner', g.angle + (g.half + 1.2) / R, 1, { tint: bannerTint, foot: 0.4 }, Math.PI / 2 - g.angle)
          || slidePlace('banner', g.angle - (g.half + 1.2) / R, -1, { tint: bannerTint, foot: 0.4 }, Math.PI / 2 - g.angle);
        if (b) record.banners.push(b);
      };

      if (lowTier === 'low') {
        const n = Math.max(12, Math.round((TAU * R) / FENCE_SEG));
        const pieceHalf = Math.PI / n;
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, am = (a0 + a1) / 2;
          if (inGap(am, pieceHalf * R)) continue;
          let ax = cx + Math.cos(a0) * R, az = cz + Math.sin(a0) * R;
          let bx = cx + Math.cos(a1) * R, bz = cz + Math.sin(a1) * R;
          // like the wall: a piece running into the water stops at the waterline
          const wetA = terrain.underwater(ax, az), wetB = terrain.underwater(bx, bz);
          if (wetA && wetB) continue;
          if (wetA || wetB) {
            const [sx, sz] = wetA ? [bx, bz] : [ax, az], [ex, ez] = wetA ? [ax, az] : [bx, bz];
            let lo = 0, hi = 1;
            for (let k = 0; k < 8; k++) {
              const t = (lo + hi) / 2;
              if (!terrain.underwater(sx + (ex - sx) * t, sz + (ez - sz) * t)) lo = t; else hi = t;
            }
            if (lo < 0.2) continue;
            [ax, az, bx, bz] = [sx, sz, sx + (ex - sx) * lo, sz + (ez - sz) * lo];
          }
          const len = Math.hypot(bx - ax, bz - az);
          const ha = terrain.heightAt(ax, az), hb = terrain.heightAt(bx, bz);
          const lean = Math.abs(ha - hb);
          if (place(fkey, (ax + bx) / 2, (az + bz) / 2, Math.atan2(bx - ax, bz - az),
            [1, 1 + lean / 1.25, (len / FENCE_SEG) * 1.03], 0.15, Math.min(ha, hb),
            { solid: false, tint: ftint, foot: 0.6 })) record.pieces.push([ax, az, bx, bz]);
        }
        // a banner at each road into the village (or, with no road, at its first opening)
        const roadGaps = gaps.filter(g => g.source === 'road');
        for (const g of (roadGaps.length ? roadGaps : gaps.slice(0, 1))) bannerAt(g);
      } else {
        // a hamlet: two stones at each road in (or, with none, at each street that reaches the edge)
        const roadGaps = gaps.filter(g => g.source === 'road');
        for (const g of (roadGaps.length ? roadGaps : gaps.slice(0, 2))) {
          for (const side of [-1, 1]) {
            const st = slidePlace('boundstone', g.angle + side * g.half / R, side, { tint: '#9a9284', foot: 0.6 });
            if (st) record.stones.push({ x: st[0], z: st[1], gap: gaps.indexOf(g), side });
          }
          bannerAt(g);
        }
      }
    }
  }

  function buildInstances(px, pz) {
    const counts = {};
    for (const key of BUILDING_KEYS) counts[key] = 0;
    solids.clear();
    // R27 M2: the gate and wall books describe what is built RIGHT NOW. They were never emptied, so
    // a town rebuilt with different gates kept its old list, and one let go kept a list of gates
    // that no longer exist (js/town.js stands guards from it)
    gateRecords.clear();
    wallRecords.clear();
    fenceRecords.clear();                              // R27 M3
    doorsBuilt = [];                                   // R27 M4 (doorState is kept: a shut gate is rebuilt shut)
    postRecords.clear();
    // ROUND 14: every town's streets go into one ribbon buffer — see buildSettlement
    const streets = { position: [], normal: [], color: [], index: [] };

    for (const node of settlements) {
      if (Math.hypot(node.wx - px, node.wz - pz) > radius) continue;
      buildSettlement(node, counts, px, pz, streets);
    }
    /**
     * THE BRIDGE, AND THE THING THAT CARRIES YOU ACROSS IT — ONE PLAN FOR BOTH.
     *
     * Round 16 put a flat instanced box down at the road's middle height and filed a separate chain
     * of flat deck colliders at the road's graded height along it. Round 23's report was the gap
     * between those two: *"the bridge has no physics and characters are clipping through it. The
     * ends are also not flush with the ground."* At the reported bridge the drawn top stood 0.52 m
     * above the collider at one end and 0.86 m above the road where the box stopped.
     *
     * Now `planBridge` (js/bridge-plan.js) lays ONE list of samples along the deck, the mesh is
     * built from those samples and the colliders are filed from those samples, so the thing you see
     * and the thing you stand on are the same numbers. The plans are the terrain's own
     * (`bridgeIndex`), which is also what enemies, companions and townsfolk stand on through
     * js/ground.js — so a bridge carries everybody, not only the player.
     */
    const bridgeData = { position: [], normal: [], color: [], index: [] };
    bridgePlans = [];
    for (const plan of bridgeIndex(terrain)?.plans || []) {
      const b = plan.crossing;
      if (Math.hypot(b.x - px, b.z - pz) > radius) continue;
      if (bridgePlans.length >= BUILDING_INFO.bridge.cap) break;
      bridgePlans.push(plan);
    }
    // drawn once every plan is known, so a rail can see the neighbouring deck it would cross
    for (const plan of bridgePlans) {
      bridgeGeometry(plan, terrain, bridgeData, bridgePlans);
      fileDeck(plan, solids);
      fileRails(plan, solids, bridgePlans);
      filePiers(plan, solids, terrain);          // R27 M6: a pier you can see is a pier that stops you
    }
    // R27 M6: a ford's flagstones and a short lake causeway's culverts, in the same mesh
    for (const ford of terrain.fords || []) {
      if (Math.hypot(ford.x - px, ford.z - pz) <= radius) fordGeometry(ford, terrain, bridgeData);
    }
    for (const cw of terrain.causeways || []) {
      if (Math.hypot(cw.x - px, cw.z - pz) <= radius) culvertGeometry(cw, terrain, bridgeData);
    }
    bridgeMesh.geometry.dispose();
    const bg = new THREE.BufferGeometry();
    if (bridgeData.position.length) {
      bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bridgeData.position), 3));
      bg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(bridgeData.normal), 3));
      bg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(bridgeData.color), 3));
      bg.setIndex(bridgeData.index);
    }
    bridgeMesh.geometry = bg;
    bridgeMesh.visible = visible && bridgeData.position.length > 0;

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
    rivers, roads, bridges, settlements, instanced, riverMesh, roadMesh, streetMesh, bridgeMesh, solids,
    /** A walled settlement's entrances (see `gateRecords`), or [] for one with no wall. */
    gatesOf: id => gateRecords.get(id) || [],
    /** A walled settlement's ring as it was built: `{ cx, cz, r, segments, kinds, gates }`. */
    wallOf: id => wallRecords.get(id) || null,
    /** R27 M3 — an unwalled settlement's edge as built (fence or boundary stones), or null. */
    edgeOf: id => fenceRecords.get(id) || null,
    /** R27 M4 — the buildings with a `role` in one settlement, as built: `[{ key, role, x, z, yaw, r }]`. */
    postsOf: id => postRecords.get(id) || [],
    /**
     * R27 M4 — shut or open every gatehouse of one settlement. The colliders switch at once (a door
     * you are standing in pushes you out to one side); the leaves swing over `GATE_SWING` seconds in
     * `tickGates`. Returns true when anything changed.
     */
    setGateShut(id, shut) {
      const want = shut ? 1 : 0;
      let changed = false;
      for (const g of gateRecords.get(id) || []) {
        if (!g.doors) continue;
        const key = `${id}:${g.index}`;
        const st = doorState.get(key);
        if (!st || st.want === want) continue;
        st.want = want;
        solids.setEnabled(key + ':shut', want === 1);
        solids.setEnabled(key + ':open', want === 0);
        changed = true;
      }
      return changed;
    },
    /** R27 M4 — is any gatehouse of this settlement shut (or shutting)? */
    gateShut: id => (gateRecords.get(id) || []).some(g => g.shut),
    /** R27 M4 — swing any doors that are between open and shut. Cheap when nothing is moving. */
    tickGates(dt) {
      let moved = false;
      for (const door of doorsBuilt) {
        const st = doorState.get(door.key);
        if (!st || st.t === st.want) continue;
        const step = dt / GATE_SWING;
        st.t = st.want > st.t ? Math.min(st.want, st.t + step) : Math.max(st.want, st.t - step);
        swingDoor(door, st.t);
        moved = true;
      }
      if (moved) instanced.gatedoor.instanceMatrix.needsUpdate = true;
      return moved;
    },
    /** R27 M4 — how far one gate's doors have swung, 0 open to 1 shut (tests and the debug menu). */
    doorSwing: (id, index) => doorState.get(`${id}:${index}`)?.t ?? null,
    /** The bridges drawn right now, as js/bridge-plan.js plans (samples + deck pieces). */
    get bridgePlans() { return bridgePlans; },

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
        /**
         * R27 M2 — "you are in town" is the WALL for a walled town. It was `30 + size * 15`, which
         * for a grown size-5 city (a 157 m wall) said you had left town while you were still 50 m
         * inside it — no muster, no town hall. An open settlement keeps the old, generous circle
         * (a hamlet has no edge to agree with), floored at its real ring.
         */
        const ext = townExtent(s);
        const r = ext.walled ? ext.wall + 2 : Math.max(30 + (s.size || 1) * 15, ext.ring);
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
      for (const m of [riverMesh, roadMesh, streetMesh, bridgeMesh]) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    },
  };
}
