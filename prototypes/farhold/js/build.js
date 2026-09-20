// Farhold — build mode: the ghost you hold, the tools that reshape the ground, and the geometry.
//
// Everything that needs a decision lives in `js/buildplan.js` (may this go here, what does it cost,
// what is already standing) and `js/terraform.js` (what the ground is now). This file is the part
// that needs Three.js: one translucent ghost that follows your aim and turns red when the plan says
// no, a mesh per placed piece, the brush ring for the terrain tools, and the portal.
//
// ## The two things a player actually does
//
//   1. **Reshape the ground.** `tool('smooth')`, then click. §4.11 is blunt about why this comes
//      first: *"the single most-needed tool — you cannot build on Farhold's terrain otherwise."*
//      Farhold's ground is noise all the way down and there is no flat metre on the planet.
//   2. **Put something on it.** `tool('build')`, `select('furnace')`, aim, click.
//
// Everything else — roads, walls, the deconstruct tool, undo, the blueprint stamp — is one of those
// two with a different brush.
//
//   import { createBuild } from './build.js';
//   const build = createBuild(scene, { terrain, terraform, catalogue, view, store });
//   build.setMode(true);  build.select('lamp_post');
//   build.aim(hit.x, hit.z);       // every frame while the mode is on
//   build.confirm();               // the click
//   light.setSources([...build.lights(), …]);
//
// The scene, the key bindings and the aim ray belong to `js/main.js`, which is not this round's
// file — so this module takes a scene and offers methods, and the wiring is reported rather than
// made.

import * as THREE from 'three';
import { createBuildPlan, makeBag } from './buildplan.js';
import { createRoadBook, laneRibbon, levelUnderSlab } from './roadplan.js';

/** Geometry is shared: a hundred fence panels are a hundred meshes over four geometries. */
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  ball: new THREE.SphereGeometry(0.5, 10, 8),
  ring: new THREE.TorusGeometry(0.5, 0.06, 8, 28),
  disc: new THREE.CylinderGeometry(0.5, 0.5, 1, 28),
};

const matCache = new Map();
function matFor(color, opts = {}) {
  const key = color + '|' + (opts.transparent ? 't' + opts.opacity : '') + (opts.emissive || '');
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshLambertMaterial({
      color: new THREE.Color(color),
      emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
      depthWrite: opts.transparent ? false : true,
    }));
  }
  return matCache.get(key);
}

/** Shift a hex colour towards black or white — saves writing three shades of every timber. */
function shade(hex, amount) {
  const c = new THREE.Color(hex);
  if (amount >= 0) c.lerp(new THREE.Color(0xffffff), amount);
  else c.lerp(new THREE.Color(0x000000), -amount);
  return '#' + c.getHexString();
}

/**
 * THE LOOK TABLE — ninety structures out of a dozen shapes.
 *
 * Each entry returns a list of parts in the piece's OWN space: x and z in metres from the centre,
 * y from the ground up, and a size. `js/features.js` does the same thing for town buildings and
 * `TOWN_EXPANSION.md` §1 argues for it at length: *"a building is a kit, not a model"* — a roof
 * lines up with its walls because the roof is generated from the wall rectangle. Here the kit is
 * cruder (this is a brazier, not a guildhall) but the principle is what keeps a catalogue of ninety
 * pieces from being ninety modelling jobs.
 *
 * `d` is the catalogue entry, so a part can size itself from the declared footprint and every piece
 * is guaranteed to fit inside the box `js/buildplan.js` checked for overlap. That is not a detail:
 * it is what makes "a structure never intersects" true of the GEOMETRY and not only of the ledger.
 */
const LOOKS = {
  flat: d => [['box', 0, [0, d.h / 2, 0], [d.w, d.h, d.d]]],
  slab: d => [['box', 0, [0, d.h / 2, 0], [d.w, d.h, d.d]], ['box', -0.12, [0, d.h * 0.25, 0], [d.w + 0.3, d.h * 0.5, d.d + 0.3]]],
  post: d => [['cyl', 0, [0, d.h / 2, 0], [0.22, d.h, 0.22]], ['box', -0.15, [0, d.h - 0.2, 0], [0.7, 0.16, 0.7]]],
  bench: d => [['box', 0, [0, 0.42, 0], [d.w, 0.1, d.d]], ['box', -0.2, [-d.w / 2 + 0.2, 0.21, 0], [0.12, 0.42, d.d]], ['box', -0.2, [d.w / 2 - 0.2, 0.21, 0], [0.12, 0.42, d.d]]],
  table: d => [['box', 0, [0, 0.78, 0], [d.w, 0.09, d.d]],
    ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => ['cyl', -0.2, [sx * (d.w / 2 - 0.2), 0.39, sz * (d.d / 2 - 0.2)], [0.1, 0.78, 0.1]])],
  shelf: d => [['box', 0, [0, d.h / 2, 0], [d.w, d.h, d.d]], ['box', 0.2, [0, d.h * 0.62, 0.02], [d.w - 0.2, 0.05, d.d]], ['box', 0.2, [0, d.h * 0.32, 0.02], [d.w - 0.2, 0.05, d.d]]],
  crates: d => [['box', 0, [-0.3, 0.45, 0], [0.9, 0.9, 0.9]], ['box', -0.12, [0.45, 0.35, 0.2], [0.7, 0.7, 0.7]], ['cyl', 0.1, [0.1, 1.2, -0.1], [0.6, 0.8, 0.6]]],
  banner: d => [['cyl', -0.3, [0, d.h / 2, 0], [0.1, d.h, 0.1]], ['box', 0, [0, d.h * 0.62, 0.1], [0.75, d.h * 0.55, 0.05]]],
  sign: d => [['cyl', -0.3, [0, d.h / 2, 0], [0.1, d.h, 0.1]], ['box', 0.1, [0.4, d.h - 0.5, 0], [d.w, 0.5, 0.06]]],
  statue: d => [['box', -0.15, [0, 0.3, 0], [d.w, 0.6, d.d]], ['cyl', 0.05, [0, d.h * 0.55, 0], [0.5, d.h * 0.7, 0.5]], ['ball', 0.1, [0, d.h - 0.25, 0], [0.42, 0.5, 0.42]]],
  fountain: d => [['cyl', 0, [0, 0.4, 0], [d.w, 0.8, d.w]], ['cyl', 0.15, [0, 0.5, 0], [d.w - 0.7, 0.8, d.w - 0.7]], ['cyl', -0.1, [0, 1.1, 0], [0.4, 1.4, 0.4]]],
  planter: d => [['box', 0, [0, d.h / 2, 0], [d.w, d.h, d.d]], ['box', 0, [0, d.h + 0.15, 0], [d.w - 0.2, 0.3, d.d - 0.2], '#4a6a34']],
  bed: d => [['box', 0, [0, Math.max(0.2, d.h / 2), 0], [d.w, Math.max(0.2, d.h), d.d]], ['box', 0.25, [0, d.h + 0.12, 0], [d.w - 0.2, 0.22, d.d - 0.2], '#c8bca8']],
  hedge: d => [['box', 0, [0, d.h / 2, 0], [d.w, d.h, d.d]], ['box', 0.1, [0, d.h, 0], [d.w - 0.15, 0.2, d.d - 0.1]]],
  fence: d => [['box', -0.2, [-d.w / 2, d.h / 2, 0], [0.14, d.h, 0.14]], ['box', -0.2, [d.w / 2, d.h / 2, 0], [0.14, d.h, 0.14]], ['box', 0, [0, d.h * 0.75, 0], [d.w, 0.1, 0.08]], ['box', 0, [0, d.h * 0.4, 0], [d.w, 0.1, 0.08]]],
  fencegate: d => [['box', -0.2, [-d.w / 2, d.h / 2, 0], [0.16, d.h, 0.16]], ['box', -0.2, [d.w / 2, d.h / 2, 0], [0.16, d.h, 0.16]], ['box', 0.1, [0, d.h * 0.55, 0], [d.w - 0.35, d.h * 0.7, 0.07]]],
  lamppost: d => [['cyl', -0.2, [0, d.h * 0.45, 0], [0.16, d.h * 0.9, 0.16]], ['box', -0.3, [0, 0.12, 0], [0.5, 0.24, 0.5]], ['box', 0.35, [0, d.h - 0.28, 0], [0.34, 0.46, 0.34], '#ffd9a0']],
  sconce: d => [['box', 0, [0, 0.18, 0], [0.18, 0.36, 0.18]], ['ball', 0.4, [0, 0.45, 0], [0.24, 0.3, 0.24], '#ffb060']],
  lantern: d => [['cyl', -0.3, [0, d.h - 0.35, 0], [0.04, 0.7, 0.04]], ['box', 0.3, [0, d.h - 0.85, 0], [0.3, 0.4, 0.3], '#ffca88']],
  crystallamp: d => [['cyl', -0.2, [0, d.h * 0.42, 0], [0.16, d.h * 0.85, 0.16]], ['cone', 0.4, [0, d.h - 0.3, 0], [0.42, 0.7, 0.42], '#bcd8ff']],
  shutters: d => [['box', 0, [-d.w / 2 + 0.3, d.h / 2, 0], [0.55, d.h, 0.08]], ['box', 0, [d.w / 2 - 0.3, d.h / 2, 0], [0.55, d.h, 0.08]]],
  vane: d => [['cyl', -0.2, [0, d.h * 0.5, 0], [0.06, d.h, 0.06]], ['box', 0.1, [0.2, d.h - 0.1, 0], [0.6, 0.18, 0.03]]],
  pot: d => [['cyl', 0, [0, d.h * 0.5, 0], [Math.min(d.w, 0.9), d.h, Math.min(d.w, 0.9)]], ['cyl', -0.2, [0, d.h + 0.05, 0], [Math.min(d.w, 0.9) + 0.1, 0.1, Math.min(d.w, 0.9) + 0.1]]],
  trophy: d => [['box', 0, [0, d.h / 2, 0], [d.w, d.h, 0.1]], ['ball', 0.3, [0, d.h * 0.55, 0.18], [0.36, 0.4, 0.36], '#ded6c4']],
  drawers: d => [['box', 0, [0, d.h / 2, 0], [d.w, d.h, d.d]], ...[0.22, 0.48, 0.74].map(t => ['box', 0.15, [0, d.h * t, d.d / 2], [d.w - 0.16, d.h * 0.2, 0.04]])],
  wardrobe: d => [['box', 0, [0, d.h / 2, 0], [d.w, d.h, d.d]], ['box', 0.15, [0, d.h * 0.52, d.d / 2], [d.w - 0.12, d.h * 0.82, 0.05]]],
  line: d => [['cyl', -0.3, [-d.w / 2, d.h / 2, 0], [0.1, d.h, 0.1]], ['cyl', -0.3, [d.w / 2, d.h / 2, 0], [0.1, d.h, 0.1]],
    ...[-0.6, 0, 0.6].map((t, i) => ['box', 0.3, [t * d.w * 0.5, d.h - 0.5, 0], [0.5, 0.6, 0.03], ['#d8d0c0', '#9ab0c8', '#c8a8a0'][i]])],
  well: d => [['cyl', 0, [0, 0.55, 0], [d.w, 1.1, d.w]], ['cyl', -0.3, [0, 0.55, 0], [d.w - 0.5, 1.15, d.w - 0.5], '#2a2620']],
  dovecote: d => [['box', 0, [0, d.h * 0.45, 0], [d.w, d.h * 0.9, d.d]], ['cone', -0.15, [0, d.h - 0.2, 0], [d.w + 0.4, 0.7, d.d + 0.4]]],
  hive: d => [...[0, 1, 2].map(i => ['cyl', i * 0.08, [0, 0.18 + i * 0.3, 0], [0.7 - i * 0.08, 0.28, 0.7 - i * 0.08]])],
  scarecrow: d => [['cyl', -0.3, [0, d.h * 0.5, 0], [0.1, d.h, 0.1]], ['box', 0, [0, d.h * 0.72, 0], [1.3, 0.12, 0.12]], ['ball', 0.15, [0, d.h - 0.2, 0], [0.34, 0.4, 0.34]]],
  pottedtree: d => [['cyl', -0.2, [0, 0.28, 0], [0.7, 0.56, 0.7], '#8a6a4a'], ['cyl', -0.35, [0, 1, 0], [0.14, 1, 0.14], '#5a432c'], ['ball', 0, [0, d.h - 0.5, 0], [1, 1.1, 1]]],
  chime: d => [['box', -0.2, [0, d.h, 0], [0.26, 0.05, 0.26]], ...[-0.08, 0, 0.08].map(t => ['cyl', 0.2, [t, d.h - 0.3, 0], [0.04, 0.5, 0.04]])],
  anvil: d => [['box', -0.25, [0, 0.28, 0], [0.5, 0.56, 0.5]], ['box', 0, [0, 0.76, 0], [d.w, 0.3, d.d]], ['cone', 0, [d.w * 0.6, 0.76, 0], [0.3, 0.5, 0.3]]],
  altar: d => [['box', -0.15, [0, 0.55, 0], [d.w, 1.1, d.d]], ['box', 0.15, [0, 1.16, 0], [d.w - 0.3, 0.14, d.d - 0.3]], ['cone', 0.35, [0, 1.5, 0], [0.3, 0.6, 0.3], '#b090e0']],
  stove: d => [['box', 0, [0, 0.55, 0], [d.w, 1.1, d.d]], ['box', -0.25, [0, 1.15, 0], [d.w - 0.2, 0.1, d.d - 0.2]], ['cyl', -0.3, [d.w * 0.3, 1.7, 0], [0.26, 1.1, 0.26]]],
  fire: d => [['cyl', -0.25, [0, 0.16, 0], [d.w, 0.32, d.w]], ...[0, 1, 2].map(i => ['cyl', 0.1, [Math.cos(i * 2) * 0.3, 0.3, Math.sin(i * 2) * 0.3], [0.12, 0.7, 0.12], '#6b4f34'])],
  brazier: d => [['cyl', -0.3, [0, 0.55, 0], [0.16, 1.1, 0.16]], ['cyl', 0, [0, 1.2, 0], [d.w, 0.5, d.w]], ['cyl', 0.5, [0, 1.35, 0], [d.w - 0.3, 0.2, d.w - 0.3], '#ff8030']],
  furnace: d => [['box', 0, [0, d.h * 0.45, 0], [d.w, d.h * 0.9, d.d]], ['box', -0.3, [0, d.h * 0.35, d.d / 2], [d.w * 0.5, d.h * 0.4, 0.2], '#2a1c14'], ['cyl', -0.2, [d.w * 0.3, d.h + 0.4, 0], [0.4, 0.9, 0.4]]],
  kiln: d => [['cyl', 0, [0, d.h * 0.45, 0], [d.w, d.h * 0.9, d.w]], ['cone', -0.15, [0, d.h - 0.1, 0], [d.w, 0.6, d.w]]],
  machine: d => [['box', 0, [0, d.h * 0.45, 0], [d.w, d.h * 0.9, d.d]], ['box', -0.25, [0, d.h * 0.95, 0], [d.w - 0.3, 0.2, d.d - 0.3]], ['cyl', 0.15, [d.w * 0.3, d.h * 0.5, d.d / 2], [0.3, d.h * 0.6, 0.3]]],
  mill: d => [['box', 0, [0, d.h * 0.4, 0], [d.w, d.h * 0.8, d.d]], ['box', -0.2, [0, d.h * 0.88, 0], [d.w + 0.4, 0.18, d.d + 0.4]], ['disc', 0.2, [-d.w * 0.45, d.h * 0.5, 0], [1.4, 0.16, 1.4], '#5a432c']],
  shed: d => [['box', 0, [0, d.h * 0.4, 0], [d.w, d.h * 0.8, d.d]], ['box', -0.2, [0, d.h * 0.86, 0], [d.w + 0.5, 0.2, d.d + 0.5]]],
  loom: d => [['box', -0.2, [-d.w / 2, d.h / 2, 0], [0.16, d.h, d.d]], ['box', -0.2, [d.w / 2, d.h / 2, 0], [0.16, d.h, d.d]], ['box', 0.25, [0, d.h * 0.6, 0], [d.w, 0.6, 0.06], '#d8cdb8']],
  tower: d => [['box', 0, [0, d.h * 0.45, 0], [d.w, d.h * 0.9, d.d]], ['cyl', -0.2, [0, d.h * 0.55, 0], [d.w * 0.5, d.h, d.w * 0.5]], ['cone', -0.3, [0, d.h + 0.3, 0], [d.w * 0.7, 0.7, d.w * 0.7]]],
  drill: d => [['box', 0, [0, 0.5, 0], [d.w, 1, d.d]], ['cyl', -0.2, [0, d.h * 0.6, 0], [0.5, d.h * 0.8, 0.5]], ['cone', 0.2, [0, 0.4, 0], [0.8, 1, 0.8]]],
  silo: d => [['cyl', 0, [0, d.h * 0.45, 0], [d.w, d.h * 0.9, d.w]], ['cone', -0.2, [0, d.h - 0.2, 0], [d.w + 0.2, 0.8, d.w + 0.2]]],
  turbine: d => [['cyl', 0, [0, d.h * 0.45, 0], [0.5, d.h * 0.9, 0.5]], ['box', -0.2, [0, d.h - 0.4, 0], [0.7, 0.5, 0.9]],
    ...[0, 1, 2].map(i => ['box', 0.1, [Math.cos(i * 2.1) * 1.6, d.h - 0.4 + Math.sin(i * 2.1) * 1.6, 0.6], [3, 0.3, 0.1]])],
  panel: d => [['box', -0.3, [0, 0.35, 0], [d.w - 0.6, 0.12, 0.3]], ['box', 0, [0, 0.75, 0], [d.w, 0.12, d.d]]],
  palisade: d => [...[-0.6, -0.2, 0.2, 0.6].map(t => ['cyl', t < 0 ? -0.08 : 0.06, [t * d.w, d.h / 2, 0], [0.32, d.h, 0.32]]),
    ...[-0.6, -0.2, 0.2, 0.6].map(t => ['cone', 0.15, [t * d.w, d.h + 0.16, 0], [0.32, 0.4, 0.32]])],
  wall: d => [['box', 0, [0, d.h / 2, 0], [d.w, d.h, d.d]], ['box', -0.12, [0, d.h + 0.1, 0], [d.w, 0.2, d.d + 0.25]]],
  gate: d => [['box', -0.15, [-d.w / 2, d.h / 2, 0], [0.7, d.h, d.d]], ['box', -0.15, [d.w / 2, d.h / 2, 0], [0.7, d.h, d.d]], ['box', 0.1, [0, d.h * 0.45, 0], [d.w - 0.7, d.h * 0.8, d.d * 0.5]]],
  turret: d => [['box', -0.2, [0, 0.3, 0], [d.w, 0.6, d.d]], ['cyl', 0, [0, d.h * 0.6, 0], [d.w * 0.6, d.h * 0.7, d.d * 0.6]], ['box', 0.15, [0, d.h * 0.8, d.d * 0.5], [0.2, 0.2, d.d]]],
  coil: d => [['box', -0.25, [0, 0.35, 0], [d.w, 0.7, d.d]], ['cyl', 0, [0, d.h * 0.5, 0], [0.34, d.h * 0.8, 0.34]], ['ball', 0.35, [0, d.h - 0.3, 0], [0.7, 0.7, 0.7], '#9ec8ff']],
  spikes: d => [...[[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, 0]].map(([sx, sz]) => ['cone', 0, [sx * d.w * 0.6, 0.3, sz * d.d * 0.6], [0.24, 0.6, 0.24]])],
  barricade: d => [['box', 0, [0, d.h * 0.55, 0], [d.w, 0.25, 0.2]], ['box', 0, [0, d.h * 0.25, 0], [d.w, 0.25, 0.2]],
    ['box', -0.2, [-d.w * 0.3, d.h * 0.4, 0.2], [0.18, d.h, 0.18]], ['box', -0.2, [d.w * 0.3, d.h * 0.4, -0.2], [0.18, d.h, 0.18]]],
  bell: d => [['cyl', -0.3, [-0.5, d.h * 0.5, 0], [0.16, d.h, 0.16]], ['cyl', -0.3, [0.5, d.h * 0.5, 0], [0.16, d.h, 0.16]], ['cone', 0.2, [0, d.h - 0.55, 0], [0.7, 0.8, 0.7]]],
  pylon: d => [['box', -0.25, [0, 0.35, 0], [d.w, 0.7, d.d]], ['cone', 0, [0, d.h * 0.55, 0], [d.w * 0.6, d.h * 0.8, d.d * 0.6]], ['ball', 0.4, [0, d.h - 0.2, 0], [0.5, 0.5, 0.5], '#9ec8ff']],
  waypointpad: d => [['disc', 0, [0, 0.16, 0], [d.w, 0.32, d.w]], ['disc', -0.15, [0, 0.34, 0], [d.w - 1.2, 0.06, d.w - 1.2]]],
};

/** A fallback so a catalogue entry with a look nobody wrote yet is still a visible box. */
LOOKS.default = d => [['box', 0, [0, d.h / 2, 0], [d.w, d.h, d.d]]];

/** Build one piece's group from the look table. */
export function buildMesh(def) {
  const make = LOOKS[def.look?.kind] || LOOKS.default;
  const base = def.look?.color || '#7a7268';
  const group = new THREE.Group();
  for (const [kind, tint, [px, py, pz], [sx, sy, sz], override] of make(def)) {
    const mesh = new THREE.Mesh(GEO[kind] || GEO.box, matFor(override || shade(base, tint)));
    mesh.position.set(px, py, pz);
    mesh.scale.set(sx, sy, sz);
    group.add(mesh);
  }
  group.name = 'farhold-built-' + def.id;
  return group;
}

/**
 * THE SIGIL RING THAT RISES OUT OF THE PAD.
 *
 * §6.4 asks for a portal that "stands on the waypoint pad, rising out of the sigils — visually
 * obviously related", and §6.14 for "a visible, readable effect". A torus on edge with a thin disc
 * inside it, turning slowly, is enough to read at fifty metres and costs two draw calls, which
 * matters because it is on screen every time the player uses the feature.
 *
 * `avatar-3d/js/spellfx.js` is the richer answer and the caller may pass one in — `cast()` at the
 * moment it opens is exactly the flourish §6.14 wants — but the ring has to exist without it, or a
 * missing sprite sheet would mean a portal you cannot see.
 */
export function buildPortalRing(color = '#7fd0ff') {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(GEO.ring, matFor(color, { emissive: color }));
  ring.scale.set(4.2, 4.2, 4.2);
  ring.position.y = 2.2;
  group.add(ring);
  const sheet = new THREE.Mesh(GEO.disc, matFor(color, { transparent: true, opacity: 0.35, emissive: color }));
  sheet.rotation.x = Math.PI / 2;
  sheet.scale.set(3.9, 0.04, 3.9);
  sheet.position.y = 2.2;
  group.add(sheet);
  group.name = 'farhold-portal';
  return group;
}

export function createBuild(scene, {
  terrain,
  terraform,
  catalogue,
  /** The clipmap from `js/terrain.js`, so a terrain edit redraws the ground it changed. */
  view = null,
  store = null,
  siteOk = null,
  plan = null,
  /** `avatar-3d/js/spellfx.js`, if the game has one. Optional on purpose — see `buildPortalRing`. */
  spellfx = null,
  /**
   * §4.19 — the clearing tool: `(x, z, radius) => { removed, materials }`.
   *
   * Trees and boulders belong to `js/props.js` and `js/features.js`, neither of which is this
   * round's file, so the tool exists here and the felling happens there. A callback rather than an
   * import because the two are genuinely separate jobs: this decides WHERE you swung, that decides
   * what was standing in it and what it drops.
   */
  onClear = null,
  /**
   * §1 — the scanner: `(x, z, radius) => { found, rows }`.
   *
   * "Add a scan tool with fixed resource deposits like Satisfactory… we definitely need a way to
   * find ones nearby." The seams have been fixed in place since round 11 — a seam's position is a
   * pure function of the world seed — but there was no way to know one was there except to walk
   * over it, and they are sparse by design. So the ping.
   *
   * Like `onClear`, the sweep is a callback: this file knows where you pointed and nothing about
   * what is in the ground.
   */
  onScan = null,
  /**
   * The ground under a brush just changed shape: `(x, z, radius) => void`.
   *
   * Reported in play: "When using raise/lower/level tools it does not affect the grass/trees." A
   * terrain edit moved the ground and left everything growing on it at the height it was scattered
   * at, so a levelled plot kept its trees hanging in the air. `js/props.js` owns the scatter, so it
   * is told and it decides — this file only knows where the brush landed.
   */
  onGround = null,
  onLog = null,
  /**
   * Somebody put a piece down, or took one away: `(entry, def) => void`.
   *
   * The one thing this file cannot know is what a piece MEANS. A waypoint pad is a lamp post as far
   * as geometry goes; it is only a waypoint because js/main.js holds the network and the register of
   * bases. So the catalogue flag travels out through here and the game decides what to do with it,
   * which keeps build mode ignorant of star systems and the register ignorant of Three.js.
   */
  onPlace = null,
  onRemove = null,
  /** `(from, to) => ({ ok, why })` — the route tool's two ends. js/mining.js owns what it means. */
  onRoute = null,
} = {}) {
  const book = plan || createBuildPlan({ catalogue, terrain, terraform, store: store || makeBag(), siteOk });
  const rules = catalogue?.rules || {};
  const log = (msg, kind) => { if (onLog) onLog(msg, kind); };

  /**
   * ROUND 14 — THE ROADS YOU LAY, AS ROADS.
   *
   * *"The road tool places a lot of rectangles that leave gaps in between and look unnatural."* It
   * did, because a road was ninety separate four-metre boxes in the build ledger, each sitting on
   * the height of its own middle. js/roadplan.js is the other idea — a polyline with a graded height
   * per point, which is what the world's own roads have always been — and this book holds the ones
   * the player laid. They are NOT entries in the ledger: a lane has no footprint, collides with
   * nothing, and putting ninety boxes in the ledger meant ninety overlap tests on every ghost frame.
   */
  const roads = createRoadBook({ terrain, terraform });

  const root = new THREE.Group();
  root.name = 'farhold-build';
  scene.add(root);

  /** One mesh per lane, drawn by the same ribbon maths js/features.js uses for the world's roads. */
  const roadGroup = new THREE.Group();
  roadGroup.name = 'farhold-build-roads';
  scene.add(roadGroup);
  const laneMeshes = new Map();

  /**
   * WHAT YOU DID LAST, SO CTRL+Z KNOWS WHICH BOOK TO LOOK IN.
   *
   * There are two ledgers now — pieces in js/buildplan.js and lanes in the road book — and `undo`
   * used to be "pop the pieces". Lay a road, press Ctrl+Z, and it would quietly take down the shed
   * you built ten minutes ago instead. A three-line stack of `{ kind, id }` is the whole fix.
   */
  let actions = [];

  /** entry id → its group, so deconstructing one piece does not walk the scene graph. */
  const meshes = new Map();

  // ---- the ghost: one piece, translucent, green or red
  const ghost = new THREE.Group();
  ghost.visible = false;
  scene.add(ghost);
  const ghostOk = matFor('#5fd08a', { transparent: true, opacity: 0.45 });
  const ghostNo = matFor('#e06050', { transparent: true, opacity: 0.4 });

  // ---- the brush ring for the terrain tools: you must be able to see what you are about to flatten
  const brush = new THREE.Mesh(GEO.ring, matFor('#e0c070', { transparent: true, opacity: 0.8 }));
  brush.rotation.x = Math.PI / 2;
  brush.visible = false;
  scene.add(brush);

  /**
   * THE RUN YOU ARE DRAGGING, DRAWN.
   *
   * Reported in play: *"The build 'Road' tool doesn't seem to do anything."* It did exactly what it
   * was written to do — every click pushed a point onto a list and Enter turned the list into a
   * road — but nothing about that was VISIBLE. Four clicks and a silent array is indistinguishable
   * from a broken tool, and the player is right to call it one.
   *
   * So: a peg at every point you have clicked, a band of ground between them, and a dashed leg from
   * the last peg to wherever the cursor is now. The preview uses the same half-width the piece
   * itself will, so what you see is where the road goes.
   */
  const runGroup = new THREE.Group();
  runGroup.name = 'farhold-build-run';
  runGroup.visible = false;
  scene.add(runGroup);
  const runPegMat = matFor('#7fd4ff', { transparent: true, opacity: 0.9 });
  const runBandMat = matFor('#7fd4ff', { transparent: true, opacity: 0.35 });
  const runGhostMat = matFor('#e0c070', { transparent: true, opacity: 0.28 });

  /** Rebuild the preview from `runPoints` plus wherever the cursor is. Cheap: a dozen boxes. */
  function drawRun() {
    while (runGroup.children.length) {
      const c = runGroup.children.pop();
      c.geometry?.dispose?.();
    }
    const isRun = mode && (tool === 'road' || tool === 'wall');
    runGroup.visible = isRun && runPoints.length > 0;
    if (!runGroup.visible) return;
    const def = book.byId(selected) || book.byId(tool === 'road' ? 'road_dirt' : 'palisade');
    const half = def?.road?.half ?? Math.max(1.2, def?.d ?? 1.4);

    const peg = (x, z) => {
      const m = new THREE.Mesh(GEO.cyl, runPegMat);
      m.position.set(x, terrain.heightAt(x, z) + 0.6, z);
      m.scale.set(0.5, 1.2, 0.5);
      runGroup.add(m);
    };
    const band = (ax, az, bx, bz, mat) => {
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.2) return;
      const m = new THREE.Mesh(GEO.box, mat);
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      m.position.set(mx, terrain.heightAt(mx, mz) + 0.12, mz);
      m.scale.set(half * 2, 0.08, len);
      m.rotation.y = Math.atan2(bx - ax, bz - az);
      runGroup.add(m);
    };

    for (const [x, z] of runPoints) peg(x, z);
    for (let i = 0; i + 1 < runPoints.length; i++) {
      band(runPoints[i][0], runPoints[i][1], runPoints[i + 1][0], runPoints[i + 1][1], runBandMat);
    }
    // the leg you have not committed to yet, in the brush's own colour
    const last = runPoints[runPoints.length - 1];
    band(last[0], last[1], aimAt.x, aimAt.z, runGhostMat);
  }

  let mode = false;
  let tool = 'build';
  let selected = null;
  let rot = 0;
  let free = false;
  let radius = 8;
  let aimAt = { x: 0, z: 0 };
  let lastCheck = { ok: false, why: '' };
  /** The first end of a route, while the second is being picked. See `routeClick`. */
  let routeFrom = null;
  /** The polyline being dragged for a road or a wall (§4.14, §4.16). */
  let runPoints = [];

  function clearGhost() {
    while (ghost.children.length) ghost.remove(ghost.children[0]);
  }

  function makeGhost(def) {
    clearGhost();
    const g = buildMesh(def);
    g.traverse(m => { if (m.isMesh) m.material = ghostOk; });
    ghost.add(g);
  }

  function tintGhost(ok) {
    ghost.traverse(m => { if (m.isMesh) m.material = ok ? ghostOk : ghostNo; });
  }

  function addMesh(entry) {
    const def = book.byId(entry.key);
    if (!def) return;
    const g = buildMesh(def);
    g.position.set(entry.x, entry.y, entry.z);
    g.rotation.y = -entry.rot;      // scene yaw runs the other way from plan bearing
    root.add(g);
    meshes.set(entry.id, g);
  }

  /**
   * Draw one lane: a single strip of triangles, two vertices per point, every quad sharing the
   * previous quad's edge.
   *
   * This is the whole fix for *"a lot of rectangles that leave gaps in between"*. There is no gap
   * because there is nothing to have a gap between — the geometry is continuous by construction, and
   * the heights it is drawn at are the same graded heights the ground under it was levelled to.
   */
  function addLaneMesh(lane) {
    const def = lane.key ? book.byId(lane.key) : null;
    const colour = def?.look?.color || '#6b5c49';
    const parts = laneRibbon(lane, { lift: (def?.h ?? 0.06) + 0.02 });
    const geom = new THREE.BufferGeometry();
    if (!parts.position.length) return null;
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(parts.position), 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(parts.normal), 3));
    geom.setIndex(parts.index);
    const mesh = new THREE.Mesh(geom, matFor(colour));
    mesh.frustumCulled = false;
    mesh.name = 'farhold-lane-' + lane.id;
    roadGroup.add(mesh);
    laneMeshes.set(lane.id, mesh);
    return mesh;
  }

  function forgetLane(id) {
    const m = laneMeshes.get(id);
    if (!m) return false;
    roadGroup.remove(m);
    m.geometry?.dispose?.();
    laneMeshes.delete(id);
    return true;
  }

  /** Redraw the ground after a brush lands. Cheap: only the rings that can see the edit. */
  /**
   * The ground under here changed shape: tell the clipmap, and reseat anything standing on it.
   *
   * `r` here is the REDRAW radius, which for a run of road is the whole length of the run — so the
   * prop callback is NOT fired from here. Clearing a 100 m circle of forest because you laid a
   * 100 m road is not what anybody meant, and it was the first thing that went wrong when the two
   * were folded together. `clearProps` below is the one that takes a brush-sized radius.
   */
  function groundChanged(x, z, r) {
    if (view?.editedAt) view.editedAt(x, z, r, aimAt.x, aimAt.z);
    // anything already standing sits back down on the new ground, so levelling under a finished
    // building does not leave it hanging in the air
    for (const [id, g] of meshes) {
      const entry = book.entries.find(e => e.id === id);
      if (!entry) continue;
      if (Math.hypot(entry.x - x, entry.z - z) > r + Math.max(entry.w, entry.d)) continue;
      entry.y = terrain.heightAt(entry.x, entry.z);
      g.position.y = entry.y;
    }
  }

  const isRunTool = () => tool === 'road' || tool === 'wall';

  /**
   * Whatever is growing inside this brush comes down, and you keep it.
   *
   * Separate from `groundChanged` on purpose — see the note there. `r` is the size of the thing you
   * actually painted, never the size of the patch that had to be redrawn.
   */
  function clearProps(x, z, r) {
    if (onGround && r > 0) onGround(x, z, r);
  }

  /** How long a clicked polyline is, in metres. The road tool prices by the metre. */
  function runLength(points) {
    let total = 0;
    for (let i = 0; i + 1 < points.length; i++) {
      total += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
    }
    return total;
  }

  /** The nearest thing you have built to a point, allowing for how big it is. */
  function nearestEntry(x, z, reach = 4) {
    let best = null;
    for (const e of book.entries) {
      const dist = Math.hypot(e.x - x, e.z - z);
      if (dist <= reach + Math.max(e.w, e.d) / 2 && (!best || dist < best.dist)) best = { e, dist };
    }
    return best ? best.e : null;
  }

  const api = {
    plan: book,
    get mode() { return mode; },
    get tool() { return tool; },
    get selected() { return selected; },
    get radius() { return radius; },
    get lastCheck() { return lastCheck; },
    /** Where the cursor is on the ground, which is not where the player is standing. */
    get aimAt() { return { ...aimAt }; },
    /** Everything standing, for the grid, the storage pools and the base overview. */
    get entries() { return book.entries; },
    /** The catalogue row behind a piece, so a caller can read its `power` or `store` block. */
    defOf(key) { return book.byId(key) || null; },
    get runPoints() { return runPoints; },

    /** §4.1 — a build mode you toggle. Nothing below does anything while it is off. */
    setMode(on) {
      mode = !!on;
      ghost.visible = mode && tool === 'build' && !!selected;
      brush.visible = mode && tool !== 'build' && !isRunTool();
      if (!mode) runPoints = [];
      drawRun();
      return mode;
    },

    /** 'build' | 'smooth' | 'raise' | 'lower' | 'road' | 'wall' | 'remove' | 'clear' | 'route'. */
    setTool(name) {
      tool = name;
      runPoints = [];
      /**
       * THE ROAD TOOL PICKS A ROAD FOR YOU.
       *
       * It used to fall back to `road_dirt` deep inside `finishRun`, after the run was already
       * drawn — so the panel showed whatever was selected before (a crate, say), the cost line was
       * that crate's cost, and nothing on screen connected the tool to the thing it was about to
       * lay. Choosing the cheapest piece of the right sort when you pick the tool means the panel
       * is telling the truth from the first click, and picking a different road still overrides it.
       */
      const wantCat = name === 'road' ? 'road' : name === 'wall' ? 'defence' : null;
      if (wantCat && book.byId(selected)?.cat !== wantCat) {
        const fallback = name === 'road' ? 'road_dirt' : 'palisade';
        if (book.byId(fallback)) api.select(fallback);
      }
      ghost.visible = mode && tool === 'build' && !!selected;
      // a run tool draws its own line; the round brush would say it paints a circle, which it does not
      brush.visible = mode && tool !== 'build' && !isRunTool();
      drawRun();
      return tool;
    },

    setRadius(m) { radius = Math.max(2, Math.min(40, m)); return radius; },

    select(id) {
      const def = book.byId(id);
      if (!def) return null;
      selected = id;
      makeGhost(def);
      ghost.visible = mode && tool === 'build';
      return def;
    },

    /** §4.2 — hold a key for free placement; let go and it snaps again. */
    setFree(on) { free = !!on; },
    rotate(delta) { rot += delta; return rot; },

    /**
     * Every frame the mode is on: where the player is pointing.
     *
     * Runs the plan's `check` so the ghost's colour and the cost line are always the REAL answer —
     * there is no second copy of the rules in here to drift out of step with `js/buildplan.js`.
     */
    aim(x, z) {
      aimAt = { x, z };
      if (!mode) return null;
      if (tool !== 'build') {
        brush.position.set(x, terrain.heightAt(x, z) + 0.15, z);
        brush.scale.set(radius * 2, radius * 2, radius * 2);
        // a run has no brush — it has the line you are laying, which has to follow the cursor
        if (tool === 'road' || tool === 'wall') drawRun();
        return null;
      }
      if (!selected) return null;
      const snapped = book.snap({ id: selected, x, z, rot, free });
      const res = book.check({ id: selected, x: snapped.x, z: snapped.z, rot: snapped.rot });
      ghost.position.set(snapped.x, res.ghostY, snapped.z);
      ghost.rotation.y = -snapped.rot;
      tintGhost(res.ok);
      lastCheck = { ...res, x: snapped.x, z: snapped.z, rot: snapped.rot };
      return lastCheck;
    },

    /** The click. What it does depends on the tool. */
    confirm() {
      if (!mode) return { ok: false, why: 'Build mode is off.' };
      if (tool === 'build') return api.placeHere();
      if (tool === 'remove') return api.removeAt(aimAt.x, aimAt.z);
      if (tool === 'road' || tool === 'wall') return api.addRunPoint(aimAt.x, aimAt.z);
      if (tool === 'clear') return api.clear();
      if (tool === 'scan') return api.scan();
      if (tool === 'route') return api.routeClick(aimAt.x, aimAt.z);
      return api.paint();
    },

    /**
     * §1 — the route tool: click a drill, then click a store.
     *
     * The two ends are both objects standing in the world, so they are PICKED in the world. Picking
     * them off a list would mean naming forty crates, and naming forty crates is how a base builder
     * stops being a game.
     *
     * This file knows nothing about mining; `onRoute` is handed the two entries and whoever owns
     * the rates decides whether they make a route. The half-finished pick lives here because it is
     * a property of the cursor, not of the ore.
     */
    routeClick(x, z) {
      const hit = nearestEntry(x, z, 8);
      if (!hit) { routeFrom = null; return { ok: false, why: 'Click a drill, then a store.' }; }
      if (!routeFrom) {
        routeFrom = hit;
        log(`${hit.name} — now click the store to send it to.`, '');
        return { ok: true, picked: hit.id, waiting: true };
      }
      const from = routeFrom;
      routeFrom = null;
      if (from.id === hit.id) return { ok: false, why: 'A route needs two ends.' };
      const res = onRoute ? onRoute(from, hit) : { ok: false, why: 'Nothing here lays routes.' };
      if (!res.ok && res.why) log(res.why, 'warn');
      return res;
    },
    /** The half-picked end, so the panel can say a route is in progress. */
    get routeFrom() { return routeFrom; },

    placeHere() {
      if (!selected) return { ok: false, why: 'Nothing selected.' };
      const at = lastCheck.x != null ? lastCheck : book.snap({ id: selected, x: aimAt.x, z: aimAt.z, rot, free });
      const res = book.place({ id: selected, x: at.x, z: at.z, rot: at.rot ?? rot });
      if (!res.ok) { log(res.why, 'warn'); return res; }
      const def = book.byId(selected);
      if (def?.flatten) { groundChanged(at.x, at.z, Math.max(def.w, def.d)); clearProps(at.x, at.z, Math.max(def.w, def.d) * 0.6); }
      addMesh(res.entry);
      actions.push({ kind: 'entry', id: res.entry.id });
      log(`${res.entry.name} built.`, 'good');
      if (onPlace) onPlace(res.entry, def || null);
      return res;
    },

    /**
     * §4.11/§4.12 — the terrain tools.
     *
     * Smoothing bakes in the height at the middle of the brush, which is what makes the result
     * predictable: you point at the bit of ground you want and everything within the radius comes
     * to meet it, rather than the whole patch averaging itself into a shape nobody asked for.
     */
    paint() {
      const { x, z } = aimAt;
      const claim = book.claimAt(x, z)?.id ?? null;
      let res;
      if (tool === 'smooth') res = terraform.level({ x, z, r: radius, h: terrain.heightAt(x, z), claim });
      else if (tool === 'raise') res = terraform.raise({ x, z, r: radius, amount: 1.5, claim });
      else if (tool === 'lower') res = terraform.lower({ x, z, r: radius, amount: 1.5, claim });
      else return { ok: false, why: 'That tool does not paint.' };
      if (!res.ok) { log(res.why, 'warn'); return res; }
      groundChanged(x, z, radius * 1.6);
      clearProps(x, z, radius);
      return res;
    },

    /**
     * §4.19 — clear the trees and rocks in the brush, and keep what they drop.
     *
     * Building anywhere wooded is otherwise impossible: a tree is a prop the placement rules know
     * nothing about, so a furnace would happily be put down inside one. The materials go back to
     * the store, which is also the cheapest early source of timber in the whole expansion.
     */
    clear() {
      if (!onClear) return { ok: false, why: 'Nothing here can be cleared yet.' };
      const res = onClear(aimAt.x, aimAt.z, radius) || {};
      /**
       * `store.give` takes `(id, n)`, ONE LINE AT A TIME.
       *
       * This was `store.give(res.materials)` — the whole bag as the first argument — so the
       * resource id was an object and the amount was `undefined`. Even once the clearing itself
       * worked, every log and every boulder went straight into the void. The same shape of mistake
       * as the tool that was never wired: it type-checks, it runs, and it does nothing.
       */
      if (res.materials && store?.give) {
        for (const [id, n] of Object.entries(res.materials)) if (n > 0) store.give(id, n);
      }
      if (res.removed) log(`Cleared ${res.removed} of it. ${book.costText(res.materials || {}) || 'Nothing'} recovered.`, 'good');
      else log('Nothing standing in the brush to clear.', '');
      return { ok: true, ...res };
    },

    /**
     * Sweep for deposits. The brush size is the range, so `[` and `]` trade reach for detail.
     *
     * Centred on the CURSOR rather than the player, because "what is over that ridge" is the
     * question you actually have — a ping at your own feet only ever tells you about ground you
     * have already walked.
     */
    scan() {
      if (!onScan) return { ok: false, why: 'Nothing here can scan.' };
      const res = onScan(aimAt.x, aimAt.z, Math.max(120, radius * 18)) || {};
      return { ok: true, ...res };
    },

    /**
     * §4.14/§4.16 — drag a run. Click once per corner, then `finishRun()`.
     *
     * A polyline rather than a start-and-end drag, because a wall that has to go round a rock and a
     * road that has to follow a contour are the normal cases, not the exception.
     */
    addRunPoint(x, z) {
      runPoints.push([x, z]);
      drawRun();
      // say something on the FIRST click, because that is the one that looks like nothing happened
      if (runPoints.length === 1) {
        log(`Corner one. Click the next corner, then press Enter to lay the ${tool}.`, '');
      } else {
        const [ax, az] = runPoints[runPoints.length - 2];
        log(`${runPoints.length} corners · ${Math.round(Math.hypot(x - ax, z - az))} m · Enter to lay it, Esc to drop the run.`, '');
      }
      return { ok: true, points: runPoints.length };
    },

    /** Throw away a half-dragged run. Esc does this before it leaves build mode. */
    cancelRun() {
      const had = runPoints.length;
      runPoints = [];
      drawRun();
      return had;
    },

    finishRun({ id = null, gateAt = [] } = {}) {
      if (runPoints.length < 2) {
        const why = runPoints.length === 1
          ? 'A run needs two corners. Click a second one, then press Enter.'
          : `Pick the ${tool === 'wall' ? 'Wall' : 'Road'} tool, then click along the ground.`;
        runPoints = [];
        drawRun();
        log(why, 'warn');
        return { ok: false, why };
      }
      const pieceId = id || selected || (tool === 'road' ? 'road_dirt' : 'palisade');
      const def = book.byId(pieceId);
      const claim = book.claimAt(runPoints[0][0], runPoints[0][1])?.id ?? null;

      /**
       * A ROAD IS A LANE, NOT A ROW OF TILES. (Round 14.)
       *
       * *"It would be better if they behaved like the regular roads, which we've worked on to get
       * smooth on the terrain."* So a road run no longer goes anywhere near `plan.run` — it is
       * planned as a polyline, the ground under it is graded to the lane's own heights, and it is
       * drawn as one ribbon. Three things fall out of that and all three were bugs before:
       *
       *   * no seams, because consecutive quads share their vertices;
       *   * no sharp wedge at a corner, because the corner is rounded in the PLAN (see
       *     `smoothPoints`) instead of being paved over with a square pad afterwards;
       *   * no clipping, because the ribbon is drawn at exactly the height the ground was levelled
       *     to rather than at the height of each tile's own midpoint.
       *
       * It is priced by the metre at the same rate the tiles were: one section's cost per `def.w`
       * metres of road, so a player who knew what a dirt track cost before still does.
       */
      if (def?.road) {
        const metres = runLength(runPoints);
        const sections = Math.max(1, Math.round(metres / Math.max(1, def.w)));
        const bill = book.quote(pieceId, sections);
        if (!bill.ok) {
          log(`${Math.round(metres)} m of ${def.name} costs ${bill.text}. ${bill.why}`, 'warn');
          runPoints = [];
          drawRun();
          return { ok: false, why: bill.why };
        }
        const laid = roads.lay(runPoints, {
          half: def.road.half ?? Math.max(1.2, def.d / 2),
          surface: def.road.surface || 'dirt',
          key: pieceId, name: def.name, claim,
        });
        if (!laid.ok) {
          log(laid.why, 'warn');
          runPoints = [];
          drawRun();
          return laid;
        }
        book.pay(bill.cost);
        addLaneMesh(laid.lane);
        actions.push({ kind: 'lane', id: laid.lane.id });
        const mid = laid.lane.points[Math.floor(laid.lane.points.length / 2)];
        groundChanged(mid[0], mid[1], metres);
        // …and the trees come down ALONG the road, not in a circle the size of it
        for (const [px, pz] of laid.lane.points) clearProps(px, pz, laid.lane.half + 1.5);
        log(`${Math.round(metres)} m of ${def.name} laid for ${book.costText(bill.cost)}.`, 'good');
        runPoints = [];
        drawRun();
        return { ok: true, lane: laid.lane, metres, cost: bill.cost, placed: [] };
      }

      /**
       * THE GROUND IS GRADED FIRST, THEN THE PIECES GO ON IT.
       *
       * Doing it the other way round is the bug `js/planet.js` already wrote a long note about with
       * its bridges: the deck was placed and then the river carved it out again. Here the same
       * shape appears — a wall placed on raw ground and then levelled under would be left with its
       * footings in the air. So each leg gets its strip brush, the clipmap is told, and only then
       * does `plan.run` measure the ground it is standing on.
       */
      if (def?.run) {
        for (let i = 0; i + 1 < runPoints.length; i++) {
          const [ax, az] = runPoints[i], [bx, bz] = runPoints[i + 1];
          terraform.strip({
            x1: ax, z1: az, x2: bx, z2: bz,
            half: def.road?.half ?? Math.max(1.2, def.d),
            h1: terrain.heightAt(ax, az), h2: terrain.heightAt(bx, bz),
            claim,
          });
        }
        const mid = runPoints[Math.floor(runPoints.length / 2)];
        const span = Math.hypot(runPoints[0][0] - runPoints[runPoints.length - 1][0],
          runPoints[0][1] - runPoints[runPoints.length - 1][1]);
        groundChanged(mid[0], mid[1], span);
        /**
         * …and the trees come down ALONG the road, not in a circle the size of it.
         *
         * A run is the one edit whose redraw radius is nothing like its footprint, so the prop
         * clearing walks the legs in brush-sized steps instead. A road through a wood should be a
         * road through a wood.
         */
        const half = (def.road?.half ?? Math.max(1.2, def.d)) + 1.5;
        for (let i = 0; i + 1 < runPoints.length; i++) {
          const [ax, az] = runPoints[i], [bx, bz] = runPoints[i + 1];
          const legLen = Math.hypot(bx - ax, bz - az);
          const steps = Math.max(1, Math.ceil(legLen / half));
          for (let k = 0; k <= steps; k++) {
            const t = k / steps;
            clearProps(ax + (bx - ax) * t, az + (bz - az) * t, half);
          }
        }
      }

      const res = book.run({ id: pieceId, points: runPoints, gateAt });
      for (const entry of res.placed || []) addMesh(entry);
      /**
       * SAY WHAT WENT DOWN.
       *
       * `finishRun` logged only its failures, so a road that laid perfectly was indistinguishable
       * from a key that did nothing — and Enter is a key you cannot see the effect of if the
       * sections are behind you. Every other tool in this file says what it did; so does this one.
       */
      const laid = (res.placed || []).length;
      if (laid) log(`${laid} section${laid === 1 ? '' : 's'} of ${def?.name || pieceId} laid.`, 'good');
      else if (!res.skipped?.length) log(`Nothing was laid. ${res.why || 'Check you can afford it.'}`, 'warn');
      if (res.skipped?.length) log(`${res.skipped.length} sections would not fit: ${res.skipped[0].why}`, 'warn');
      runPoints = [];
      drawRun();
      return res;
    },

    /** §4.7 — the deconstruct tool. */
    removeAt(x, z, reach = 3) {
      const e = nearestEntry(x, z, reach);
      const best = e ? { e, dist: 0 } : null;
      /**
       * A ROAD IS TAKEN UP, NOT DECONSTRUCTED PIECE BY PIECE.
       *
       * It is not in the ledger any more (see the road book above), so `nearestEntry` cannot find
       * it — and a tool that silently refuses to remove the thing you are pointing at is the same
       * class of bug as a tool that silently does nothing. A lane comes up whole, which is also what
       * you want: nobody wants to click ninety times to take up ninety metres of track.
       */
      if (!best) {
        const hit = roads.nearest(x, z, reach + 4);
        if (hit) {
          const def = book.byId(hit.lane.key);
          const sections = Math.max(1, Math.round((hit.lane.metres || 0) / Math.max(1, def?.w || 4)));
          const back = book.refundOf(book.quote(hit.lane.key, sections).cost || {});
          book.giveBack(back);
          roads.remove(hit.lane.id);
          forgetLane(hit.lane.id);
          log(`${Math.round(hit.lane.metres)} m of ${hit.lane.name || 'road'} taken up. ${book.costText(back) || 'Nothing'} recovered.`, 'good');
          return { ok: true, lane: hit.lane, refund: back };
        }
      }
      if (!best) return { ok: false, why: 'Nothing to take down there.' };
      const res = book.remove(best.e.id);
      if (res.ok) api.forget(best.e.id);
      if (res.ok) log(`${res.entry.name} taken down. ${book.costText(res.refund) || 'Nothing'} recovered.`, 'good');
      if (res.ok && onRemove) onRemove(res.entry, book.byId(res.entry.key) || null);
      return res;
    },

    /** §4.9 — undo the last placement, geometry and all. */
    undo() {
      // the newest thing wins, whichever book it is in — see `actions` above
      while (actions.length) {
        const last = actions[actions.length - 1];
        if (last.kind === 'lane') {
          actions.pop();
          const lane = roads.get(last.id);
          if (!lane) continue;
          const def = book.byId(lane.key);
          const sections = Math.max(1, Math.round((lane.metres || 0) / Math.max(1, def?.w || 4)));
          book.giveBack(book.quote(lane.key, sections).cost || {});   // undo is a full refund
          roads.remove(lane.id);
          forgetLane(lane.id);
          log(`${Math.round(lane.metres)} m of ${lane.name || 'road'} undone.`, 'good');
          return { ok: true, lane };
        }
        if (!book.entries.some(e => e.id === last.id)) { actions.pop(); continue; }
        break;
      }
      if (actions[actions.length - 1]?.kind === 'entry') actions.pop();
      const res = book.undo();
      if (res.ok) api.forget(res.entry.id);
      // an undone waypoint pad has to leave the register too, or the map keeps offering a trip to
      // somewhere there is no longer a pad
      if (res.ok && onRemove) onRemove(res.entry, book.byId(res.entry.key) || null);
      return res;
    },

    forget(entryId) {
      const g = meshes.get(entryId);
      if (!g) return false;
      root.remove(g);
      meshes.delete(entryId);
      return true;
    },

    /** Hand every lamp, brazier and lit machine to `js/light.js`'s pool. */
    lights: () => book.lights(),

    /** Rebuild every mesh from the ledger — after a load, or after an outpost is razed. */
    rebuild() {
      for (const id of [...meshes.keys()]) api.forget(id);
      for (const entry of book.entries) addMesh(entry);
      for (const id of [...laneMeshes.keys()]) forgetLane(id);
      for (const lane of roads.lanes) addLaneMesh(lane);
      return book.entries.length;
    },

    /** The road book, so js/logistics.js can ask how much of a haul runs on a made surface. */
    get roads() { return roads; },
    /** Every lane the player has laid — the same shape `terrain.roadPaths` carries. */
    get lanes() { return roads.lanes; },
    /** Round 14 — the groups, worked out from what is standing rather than declared with a stone. */
    outposts(opts = {}) { return book.outposts({ lanes: roads.lanes, ...opts }); },

    /**
     * The portal's geometry. One ring, because there is one portal — `js/portal.js` guarantees that
     * and this only has to draw whichever end the player is near.
     */
    portalRing: null,
    showPortal(end, color = '#7fd0ff') {
      if (!api.portalRing) { api.portalRing = buildPortalRing(color); scene.add(api.portalRing); }
      if (!end) { api.portalRing.visible = false; return null; }
      api.portalRing.visible = true;
      api.portalRing.position.set(end.x, terrain.heightAt(end.x, end.z), end.z);
      if (spellfx?.cast) spellfx.cast({ at: api.portalRing.position, element: 'arcane' });
      return api.portalRing;
    },
    hidePortal() { if (api.portalRing) api.portalRing.visible = false; },

    /** Turn the ring and breathe the ghost, so build mode does not look frozen. */
    update(dt) {
      if (api.portalRing?.visible) api.portalRing.rotation.y += dt * 0.6;
      if (brush.visible) brush.rotation.z += dt * 0.4;
    },

    setVisible(on) { root.visible = !!on; roadGroup.visible = !!on; },

    dispose() {
      scene.remove(root);
      scene.remove(roadGroup);
      scene.remove(ghost);
      scene.remove(brush);
      scene.remove(runGroup);
      if (api.portalRing) scene.remove(api.portalRing);
    },

    toJSON() { return { plan: book.toJSON(), terraform: terraform?.toJSON?.() || null, roads: roads.toJSON() }; },
    load(data) {
      book.load(data?.plan);
      if (data?.terraform && terraform) terraform.load(data.terraform);
      /**
       * A save written before round 14 has no `roads` key, and that is fine — it also has its roads
       * as ordinary `road_dirt` entries in the ledger, which still load and still draw. Old tracks
       * stay as they were; new ones are lanes. Nothing has to be migrated and nothing disappears.
       */
      roads.load(data?.roads);
      api.rebuild();
      return book.entries.length;
    },
  };

  return api;
}
