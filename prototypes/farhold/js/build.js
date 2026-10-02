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
import { createBuildPlan, makeBag, cornersOf, damageBand } from './buildplan.js';
import { createRoadBook, laneRibbon, levelUnderSlab } from './roadplan.js';
// R17 — the research gate. See `createBuild`'s `plan` line for why this is imported here rather
// than handed in: js/main.js's `createBuild` call belongs to another pair of hands this round, and
// js/research.js keeps ONE state that everything asks for by name.
import { sharedResearch } from './research.js';

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
    const colour = override || shade(base, tint);
    const mesh = new THREE.Mesh(GEO[kind] || GEO.box, matFor(colour));
    mesh.userData.colour = colour;     // R28 — what a damaged piece darkens FROM (see paintDamage)
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

/**
 * R28 — SAVED LAYOUTS OUTLIVE A GAME.
 *
 * A blueprint rides in the save's `build` blob (so a run keeps its own), and every change is also
 * mirrored to this browser's storage so a camp you laid out once is there in the next world too.
 * Storage can be missing or refuse (a private window, a test page), so every touch is guarded and
 * the game behaves exactly the same without it.
 */
const BP_KEY = 'farhold.blueprints.v1';
function loadLocalBlueprints() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(BP_KEY) : null;
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(b => b && Array.isArray(b.pieces)) : [];
  } catch { return []; }
}
function saveLocalBlueprints(list) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(BP_KEY, JSON.stringify(list.slice(-24))); } catch { /* no storage: the save still has them */ }
}

/**
 * R28 — THE TOOLS THAT POINT AT A PIECE, and the colour each one highlights it in.
 * Kept here beside the highlight so build-ui.js's tool table and this file cannot disagree.
 */
export const POINT_TOOLS = { remove: '#e06050', move: '#7fd4ff', upgrade: '#e0c070', repair: '#7fe08a', route: '#9ec8ff', pick: '#ffffff' };

const BAR_BACK = new THREE.MeshBasicMaterial({ color: 0x1a1210, depthTest: false, transparent: true, opacity: 0.85 });
// transparent like the back, so both are drawn in the same pass and `renderOrder` puts the fill on
// top (an opaque fill is drawn first and the see-through back then covers it)
const BAR_FILL = [0x7fe08a, 0xe0c050, 0xe08040, 0xe04838].map(c => new THREE.MeshBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: 1 }));

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
  /**
   * R17 — THE RESEARCH GATE IS FITTED HERE, at the one place a plan is made for the real game.
   *
   * `sharedResearch()` is handed the catalogue so it can resolve a `tech` key to a node and a node
   * to a sentence. It locks NOTHING until data/research.json has loaded and NOTHING at all for a
   * piece with no `tech` key — which is every low-tech piece in the game. A caller that passes its
   * own `plan` (the balance harness, a node test) is untouched.
   */
  const research = sharedResearch({ catalogue });
  const book = plan || createBuildPlan({
    catalogue, terrain, terraform, store: store || makeBag(), siteOk,
    locked: def => research.lockReason(def),
  });
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
  // R27 M8 — and the world asks it: `terrain.roadAt` counts these lanes as road (pace, grass, hauls)
  terrain?.setLaneBook?.(roads);

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
  const runGateMat = matFor('#ffd36a', { emissive: '#7a5a10' });

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

    runPoints.forEach(([x, z], i) => {
      peg(x, z);
      // R28 — a corner clicked twice carries a gate: a gold arch over its peg
      if (runGates.includes(i)) {
        const m = new THREE.Mesh(GEO.ring, runGateMat);
        m.position.set(x, terrain.heightAt(x, z) + 1.6, z);
        m.scale.set(2.2, 2.2, 2.2);
        runGroup.add(m);
      }
    });
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
  /**
   * R28 — what a pointing tool is aimed at, and the sentence the card prints for it:
   * `{ entry, ok, text }`. Null when it is aimed at nothing.
   */
  let lastPoint = null;
  /** R28 — Shift is held: a click lays a LINE from the last piece to the cursor. */
  let lineMode = false;
  /** R28 — the last single piece you put down, which a Shift+click line starts from. */
  let lastPlaced = null;
  /** R28 — what a Shift+click would lay, for the card: `{ count, text, ok, why }`. */
  let lineInfo = null;
  /** R28 — corners of the wall run clicked twice: a gate goes there. Indices into `runPoints`. */
  let runGates = [];
  /** R28 — layouts the Copy tool lifted, and the one the Stamp tool is putting down. */
  let blueprints = loadLocalBlueprints();
  let stampIndex = -1;
  let stampInfo = null;
  /** The first end of a route, while the second is being picked. See `routeClick`. */
  let routeFrom = null;
  /**
   * R28 — the piece the Move tool is carrying: `{ id, key, name }`. It stays in the ledger under its
   * own id the whole time (its mesh is hidden and the ghost ignores it), so nothing that files
   * against the id ever sees it go away. Dropped by Esc, another tool, another piece or leaving.
   */
  let moving = null;
  /** R28 — seconds since the Repair Stations last mended (see `update`). */
  let mendClock = 0;
  function cancelMove() {
    if (!moving) return false;
    const g = meshes.get(moving.id);
    if (g) g.visible = true;
    moving = null;
    return true;
  }
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

  function tintGhost(ok, levels = false) {
    const m0 = !ok ? ghostNo : levels ? ghostLevel : ghostOk;
    ghost.traverse(m => { if (m.isMesh) m.material = m0; });
  }

  // ---- R28: everything else build mode now draws on the ground ----------------------------------

  /** Amber: it will go, and it will level the ground under it first (`rules.autoLevel`). */
  const ghostLevel = matFor('#e0b050', { transparent: true, opacity: 0.45 });

  /**
   * THE FOOTPRINT, DRAWN ON THE GROUND.
   *
   * The ghost is a translucent tint standing on the height under its middle; on a slope you could
   * not see where its corners met the hillside, which is the thing that decides whether it fits.
   * A line round the footprint, sampled down onto the ground every half metre, in the verdict's
   * colour. One LineLoop, its positions rewritten in place each frame.
   */
  const FOOT_N = 40;
  const footGeo = new THREE.BufferGeometry();
  footGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FOOT_N * 3), 3));
  const footMat = new THREE.LineBasicMaterial({ color: 0x5fd08a, transparent: true, opacity: 0.95, depthTest: false });
  const footprint = new THREE.LineLoop(footGeo, footMat);
  footprint.name = 'farhold-build-footprint';
  footprint.frustumCulled = false;
  footprint.renderOrder = 5;
  footprint.visible = false;
  scene.add(footprint);
  function drawFootprint(spot, colour, lift = 0.08) {
    const c = cornersOf(spot);
    const pos = footGeo.attributes.position.array;
    const per = FOOT_N / 4;
    for (let side = 0; side < 4; side++) {
      const [ax, az] = c[side], [bx, bz] = c[(side + 1) % 4];
      for (let k = 0; k < per; k++) {
        const t = k / per, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const i = (side * per + k) * 3;
        pos[i] = x; pos[i + 1] = terrain.heightAt(x, z) + lift; pos[i + 2] = z;
      }
    }
    footGeo.attributes.position.needsUpdate = true;
    footMat.color.set(colour);
    footprint.visible = true;
  }

  /**
   * MORE THAN ONE GHOST: a Shift+click line, a blueprint being stamped.
   *
   * A pool of piece-shaped groups keyed by catalogue id, re-used frame to frame and only rebuilt
   * when the LIST of ids changes — moving the cursor moves them, it does not remake them.
   */
  const ghostPool = new THREE.Group();
  ghostPool.name = 'farhold-build-ghosts';
  scene.add(ghostPool);
  let poolSig = '';
  function showGhosts(list) {
    const sig = list.map(g => g.key).join(',');
    if (sig !== poolSig) {
      while (ghostPool.children.length) ghostPool.remove(ghostPool.children[0]);
      for (const g of list) {
        const def = book.byId(g.key);
        ghostPool.add(def ? buildMesh(def) : new THREE.Group());
      }
      poolSig = sig;
    }
    list.forEach((g, i) => {
      const m = ghostPool.children[i];
      if (!m) return;
      m.position.set(g.x, g.y ?? terrain.heightAt(g.x, g.z), g.z);
      m.rotation.y = -(g.rot || 0);
      const mat = !g.ok ? ghostNo : g.levels ? ghostLevel : ghostOk;
      m.traverse(o => { if (o.isMesh) o.material = mat; });
    });
    ghostPool.visible = list.length > 0;
  }
  function hideGhosts() { ghostPool.visible = false; }

  /**
   * WHAT A POINTING TOOL IS POINTING AT: Take down, Move, Upgrade, Route, Copy-a-piece.
   *
   * It used to be learned after the click — "Palisade taken down" — which on a crowded base is how
   * the lamp next to the thing you meant comes down. A box round the piece, in the tool's colour,
   * and a line on the card saying what the click will do and what it costs or gives back.
   */
  const hiMat = new THREE.MeshBasicMaterial({ color: 0xe0c070, transparent: true, opacity: 0.22, depthWrite: false });
  const highlight = new THREE.Mesh(GEO.box, hiMat);
  highlight.name = 'farhold-build-highlight';
  highlight.visible = false;
  scene.add(highlight);
  function highlightEntry(e, colour) {
    if (!e) { highlight.visible = false; return; }
    highlight.position.set(e.x, (e.y ?? terrain.heightAt(e.x, e.z)) + (e.h || 1) / 2, e.z);
    highlight.scale.set((e.w || 1) + 0.3, (e.h || 1) + 0.3, (e.d || 1) + 0.3);
    highlight.rotation.y = -(e.rot || 0);
    hiMat.color.set(colour);
    highlight.visible = true;
  }

  function addMesh(entry) {
    const def = book.byId(entry.key);
    if (!def) return;
    const g = buildMesh(def);
    g.position.set(entry.x, entry.y, entry.z);
    g.rotation.y = -entry.rot;      // scene yaw runs the other way from plan bearing
    root.add(g);
    meshes.set(entry.id, g);
    paintDamage(entry);
  }

  /**
   * R28 — A DAMAGED PIECE LOOKS IT: it darkens by band (the same cached Lambert materials, so no
   * shader is compiled for a hit), and a bar stands over it — green, amber, orange, red — while it
   * is anything less than whole. A whole piece has no bar.
   */
  function paintDamage(entry) {
    const g = meshes.get(entry.id);
    if (!g) return;
    const h = book.health(entry);
    const band = h ? damageBand(h.ratio) : 0;
    if (g.userData.band !== band) {
      g.userData.band = band;
      for (const m of g.children) {
        if (m.userData.colour) m.material = matFor(band ? shade(m.userData.colour, -0.16 * band) : m.userData.colour);
      }
    }
    let bar = g.userData.bar;
    if (!band) { if (bar) bar.visible = false; return; }
    if (!bar) {
      const def = book.byId(entry.key);
      const w = Math.max(0.8, Math.min(2.4, Math.max(def?.w || 1, def?.d || 1)));
      bar = new THREE.Group();
      const back = new THREE.Mesh(GEO.box, BAR_BACK);
      back.scale.set(w + 0.08, 0.2, 0.2);
      const fill = new THREE.Mesh(GEO.box, BAR_FILL[0]);
      fill.scale.set(w, 0.14, 0.24);
      back.renderOrder = 998; fill.renderOrder = 999;
      bar.add(back, fill);
      bar.position.y = (def?.h || 1) + 0.6;
      bar.userData = { fill, w };
      g.add(bar);
      g.userData.bar = bar;
    }
    bar.visible = true;
    const { fill, w } = bar.userData;
    fill.scale.x = Math.max(0.02, w * h.ratio);
    // shrinks toward the middle: the bar is in the piece's own space, so a left-aligned fill would
    // read as right-aligned from the other side of the wall
    fill.position.x = 0;
    fill.material = BAR_FILL[band];
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

  // ---- R28: the undo stack, and the two tools that aim at something other than a ghost ----------

  function pushAction(a) {
    actions.push(a);
    const depth = book.rules.undoDepth ?? 30;
    while (actions.length > depth) actions.shift();
  }

  /** What Ctrl+Z will do next, in words, for the card. */
  function actionLabel(a) {
    if (!a) return '';
    if (a.kind === 'place') {
      const first = book.entries.find(e => e.id === a.ids[0]);
      const name = first?.name || 'piece';
      return a.ids.length > 1 ? `${a.ids.length} pieces${a.stamp ? ' (layout)' : a.run ? ` of ${name}` : ` of ${name}`}` : name;
    }
    if (a.kind === 'lane') return roads.get(a.id)?.name || 'road';
    if (a.kind === 'brush') return { smooth: 'Level', raise: 'Raise', lower: 'Lower' }[a.tool] || 'ground';
    if (a.kind === 'takedown') return `take down ${a.entry?.name || ''}`.trim();
    if (a.kind === 'move') return `move ${book.entries.find(e => e.id === a.id)?.name || ''}`.trim();
    if (a.kind === 'upgrade') return `upgrade to ${book.entries.find(e => e.id === a.id)?.name || ''}`.trim();
    if (a.kind === 'repair') return `repair ${book.entries.find(e => e.id === a.id)?.name || ''}`.trim();
    return a.kind;
  }

  /** Take one step back. Null when the step no longer applies (its pieces are already gone). */
  function undoStep(a) {
    if (a.kind === 'place') {
      const gone = [];
      for (const id of [...a.ids].reverse()) {
        if (!book.entries.some(e => e.id === id)) continue;
        const res = book.remove(id, { fraction: 1 });       // undo is a full refund; take-down is not
        if (!res.ok) continue;
        api.forget(id);
        if (onRemove) onRemove(res.entry, book.byId(res.entry.key) || null);
        if (lastPlaced?.id === id) lastPlaced = null;
        gone.push(res.entry);
      }
      for (const id of a.tf || []) terraform?.remove?.(id);
      if (!gone.length && !(a.tf || []).length) return null;
      if (gone.length) {
        const xs = gone.map(e => e.x), zs = gone.map(e => e.z);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
        groundChanged(cx, cz, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2 + 8);
      }
      log(gone.length > 1 ? `Undone: ${gone.length} pieces, everything refunded.` : `Undone: ${gone[0]?.name || 'that'}, refunded.`, 'good');
      return { ok: true, entry: gone[0] || null, entries: gone };
    }
    if (a.kind === 'lane') {
      const lane = roads.get(a.id);
      if (!lane) return null;
      const def = book.byId(lane.key);
      const sections = Math.max(1, Math.round((lane.metres || 0) / Math.max(1, def?.w || 4)));
      book.giveBack(book.quote(lane.key, sections).cost || {});   // undo is a full refund
      roads.remove(lane.id);
      forgetLane(lane.id);
      log(`${Math.round(lane.metres)} m of ${lane.name || 'road'} undone.`, 'good');
      return { ok: true, lane };
    }
    if (a.kind === 'brush') {
      const n = (a.tf || []).filter(id => terraform?.remove?.(id)).length;
      if (!n) return null;
      groundChanged(a.x, a.z, (a.r || radius) * 1.6);
      log('Undone: the ground is back how it was.', 'good');
      return { ok: true, brush: true };
    }
    if (a.kind === 'takedown') {
      const res = book.restore(a.entry, a.charge);
      if (!res.ok) { log(`Cannot put the ${a.entry?.name || 'piece'} back: ${res.why}`, 'warn'); return { ok: false, why: res.why }; }
      addMesh(res.entry);
      if (onPlace) onPlace(res.entry, book.byId(res.entry.key) || null);
      log(`${res.entry.name} is back where it was.`, 'good');
      return { ok: true, entry: res.entry, restored: true };
    }
    if (a.kind === 'move') {
      const entry = book.entries.find(e => e.id === a.id);
      if (!entry) return null;
      const there = { x: entry.x, z: entry.z };
      const res = book.relocate(a.id, a.from);
      if (!res.ok) { log(`Cannot carry the ${entry.name} back: ${res.why}`, 'warn'); return { ok: false, why: res.why }; }
      for (const id of a.tf || []) terraform?.remove?.(id);
      api.forget(a.id);
      addMesh(res.entry);
      groundChanged((there.x + a.from.x) / 2, (there.z + a.from.z) / 2, Math.hypot(there.x - a.from.x, there.z - a.from.z) / 2 + 8);
      if (onPlace) onPlace(res.entry, book.byId(res.entry.key) || null);
      log(`${res.entry.name} is back where it was.`, 'good');
      return { ok: true, entry: res.entry, moved: true };
    }
    if (a.kind === 'repair') {
      const res = book.unrepair(a.id, a.hp, a.paid);
      if (!res.ok) return null;
      paintDamage(res.entry);
      log(`Repair undone: ${book.costText(a.paid) || 'nothing'} back.`, 'good');
      return { ok: true, entry: res.entry };
    }
    if (a.kind === 'upgrade') {
      const res = book.downgrade(a.id, a.was, a.paid);
      if (!res.ok) return null;
      api.forget(a.id);
      addMesh(res.entry);
      if (onPlace) onPlace(res.entry, book.byId(res.entry.key) || null);
      log(`Back to a ${res.entry.name}; ${book.costText(a.paid) || 'nothing'} refunded.`, 'good');
      return { ok: true, entry: res.entry };
    }
    return null;
  }

  /** Does the tool that is up paint a circle on the ground? */
  const usesBrush = () => ['smooth', 'raise', 'lower', 'clear', 'scan', 'copy'].includes(tool);

  /** A pointing tool: what is under the cursor, boxed, and what a click would do to it. */
  function aimPoint(x, z) {
    footprint.visible = false;
    hideGhosts();
    if (tool === 'route') { highlightEntry(book.pickEntry(x, z, 8), POINT_TOOLS.route); lastPoint = null; return; }
    const e = book.pickEntry(x, z, 3);
    if (!e) {
      highlightEntry(null);
      // a road is not in the ledger: Take down still finds it (see `removeAt`)
      const lane = tool === 'remove' ? roads.nearest(x, z, 7) : null;
      lastPoint = lane
        ? { ok: true, text: `Click: take up ${Math.round(lane.lane.metres)} m of ${lane.lane.name || 'road'}.` }
        : { ok: false, text: 'Point at something you built.' };
      return;
    }
    let ok = true, text = '';
    if (tool === 'remove') {
      text = `Click: take down the ${e.name} — ${book.costText(book.refundFor(e)) || 'nothing'} back.`;
    } else if (tool === 'move') {
      const can = book.movable(e);
      ok = can.ok;
      text = ok ? `Click: pick up the ${e.name} and carry it — nothing is lost, Esc puts it back.` : can.why;
    } else if (tool === 'upgrade') {
      const up = book.upgradeOf(e);
      ok = up.ok;
      text = up.to ? (up.ok ? `Click: ${e.name} → ${up.to.name} for ${book.costText(up.cost) || 'nothing'}.` : `${e.name} → ${up.to.name}: ${up.why}`) : up.why;
    } else if (tool === 'pick') {
      text = `Click: build another ${e.name}.`;
    } else if (tool === 'repair') {
      // R28 — the price BEFORE the click, against what you hold
      const q = book.repairOf(e);
      ok = q.ok;
      const hp = `${Math.round(q.hp)}/${q.maxHp} HP`;
      text = !(q.missing > 0) ? `${e.name}: ${hp}, not damaged.`
        : q.ok ? `Click: repair the ${e.name} (${hp}) for ${book.costText(q.cost)}.`
          : `Repair the ${e.name} (${hp}) for ${book.costText(q.cost)}: ${q.why}`;
    }
    highlightEntry(e, ok ? POINT_TOOLS[tool] : '#e06050');
    lastPoint = { entry: e, ok, text };
  }

  /** The Stamp tool: the whole layout as ghosts, and its bill on the card. */
  function aimStamp(x, z) {
    footprint.visible = false;
    highlight.visible = false;
    const bp = blueprints[stampIndex];
    if (!bp) { hideGhosts(); stampInfo = { ok: false, why: 'No layout yet: pick Copy and click on something you built.' }; return; }
    const chk = book.stampCheck(bp, x, z, rot);
    showGhosts(chk.rows.map(r => ({ key: r.key, x: r.x, z: r.z, rot: r.rot, y: r.y, ok: r.ok })));
    stampInfo = { ...chk, name: bp.name };
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
    /**
     * R16 — does this piece DIG, rather than make?
     *
     * Straight through to js/buildplan.js so there is one answer in the game. The placement code in
     * js/main.js binds a drill to a seam off this, instead of the id list it used to carry.
     */
    isExtractor(keyOrDef) { return book.isExtractor(keyOrDef); },
    get runPoints() { return runPoints; },
    /**
     * R28 — THE RUN, PRICED BEFORE ENTER: how long, how many sections and gates, the bill, and
     * whether the purse covers it. The card shows this the whole time a run is being clicked out.
     */
    get runInfo() {
      if (!isRunTool() || !runPoints.length) return null;
      /**
       * The bill is for what ENTER lays — the corners clicked so far. It used to include the dashed
       * leg out to the cursor, which Enter does not lay, so the card quoted five sections and four
       * went down. With one corner there is nothing to lay yet, and the leg to the cursor is the
       * preview; after that the cursor leg is reported separately as `next` metres.
       */
      const last = runPoints[runPoints.length - 1];
      const next = Math.hypot(aimAt.x - last[0], aimAt.z - last[1]);
      const pts = runPoints.length >= 2 ? runPoints : [...runPoints, [aimAt.x, aimAt.z]];
      let metres = 0;
      for (let i = 0; i + 1 < pts.length; i++) metres += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      const preview = runPoints.length < 2;
      const pieceId = selected || (tool === 'road' ? 'road_dirt' : 'palisade');
      const def = book.byId(pieceId);
      if (def?.road) {
        const q = book.quote(pieceId, Math.max(1, Math.round(metres / Math.max(1, def.w))));
        return { metres, corners: runPoints.length, name: def.name, count: 0, gates: 0, text: q.text, ok: q.ok, why: q.why, preview, next: preview ? 0 : next };
      }
      const b = book.runBill({ id: pieceId, points: pts, gateCorners: runGates });
      return { metres, corners: runPoints.length, name: def?.name || pieceId, count: b.count, gates: b.gates, text: b.text, ok: b.ok, why: b.why, preview, next: preview ? 0 : next };
    },

    /** §4.1 — a build mode you toggle. Nothing below does anything while it is off. */
    setMode(on) {
      mode = !!on;
      ghost.visible = mode && tool === 'build' && !!selected;
      brush.visible = mode && usesBrush();
      if (!mode) { runPoints = []; runGates = []; footprint.visible = false; hideGhosts(); highlight.visible = false; lastPoint = null; lineMode = false; cancelMove(); }
      drawRun();
      return mode;
    },

    /** 'build' | 'smooth' | 'raise' | 'lower' | 'road' | 'wall' | 'remove' | 'clear' | 'route'. */
    setTool(name) {
      if (name !== 'build') cancelMove();
      tool = name;
      runPoints = [];
      runGates = [];
      lastPoint = null;
      highlight.visible = false;
      footprint.visible = false;
      hideGhosts();
      if (name === 'stamp' && stampIndex < 0 && blueprints.length) stampIndex = blueprints.length - 1;
      /**
       * THE ROAD TOOL PICKS A ROAD FOR YOU.
       *
       * It used to fall back to `road_dirt` deep inside `finishRun`, after the run was already
       * drawn — so the panel showed whatever was selected before (a crate, say), the cost line was
       * that crate's cost, and nothing on screen connected the tool to the thing it was about to
       * lay. Choosing the cheapest piece of the right sort when you pick the tool means the panel
       * is telling the truth from the first click, and picking a different road still overrides it.
       */
      // R28 — the Wall tool lays any RUN piece (fence, hedge, palisade…), not only the defence
      // category: a fence is a run and has always been one, and the tool refused to lay it
      const sel = book.byId(selected);
      const wrong = name === 'road' ? sel?.cat !== 'road' : name === 'wall' ? !sel?.run : false;
      if ((name === 'road' || name === 'wall') && wrong) {
        const fallback = name === 'road' ? 'road_dirt' : 'palisade';
        if (book.byId(fallback)) api.select(fallback);
      }
      ghost.visible = mode && tool === 'build' && !!selected;
      // a run tool draws its own line; the round brush would say it paints a circle, which it does not
      brush.visible = mode && usesBrush();
      drawRun();
      return tool;
    },

    setRadius(m) { radius = Math.max(2, Math.min(40, m)); return radius; },

    select(id) {
      const def = book.byId(id);
      if (!def) return null;
      if (moving && moving.key !== id) cancelMove();
      selected = id;
      makeGhost(def);
      ghost.visible = mode && tool === 'build';
      return def;
    },

    /**
     * §4.2 — free placement: no grid, no snapping to a neighbour, any angle.
     *
     * R28 — this has existed since §4.2 and NOTHING called it. F toggles it now (js/build-keys.js);
     * a toggle rather than a held key because a held Alt hands the browser's menu bar the focus on
     * release, and the card says which way it is.
     */
    setFree(on) { free = !!on; return free; },
    get free() { return free; },
    /**
     * R28 — ONE NOTCH IS ONE STEP.
     *
     * The wheel turned the ghost by π/8 and `snap` rounded to the catalogue's `rotateStep` (π/4),
     * so every other notch did nothing at all, and the first notch anticlockwise rounded to −0 and
     * did nothing either. Snapped, a turn is now exactly one `rotateStep` in the direction asked;
     * free, it is the fine angle it was given.
     */
    rotate(delta) {
      if (!delta) return rot;
      const step = book.rules.rotateStep || Math.PI / 4;
      if (free) rot += delta;
      else rot = Math.round(rot / step) * step + Math.sign(delta) * step;
      rot = ((rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      return rot;
    },
    get rot() { return rot; },
    /** R28 — Shift is down: the next click lays a line from the last piece to here. */
    setLine(on) { lineMode = !!on; if (!lineMode) { lineInfo = null; if (tool === 'build') hideGhosts(); } return lineMode; },
    get lineMode() { return lineMode; },
    get lineInfo() { return lineInfo; },
    get lastPoint() { return lastPoint; },
    get lastPlaced() { return lastPlaced; },
    get runGates() { return runGates; },
    get stampInfo() { return stampInfo; },
    /** R28 — undo steps waiting, so the card can say whether Ctrl+Z will do anything. */
    get undoCount() { return actions.length; },
    get undoLabel() { return actions.length ? actionLabel(actions[actions.length - 1]) : ''; },

    /**
     * Every frame the mode is on: where the player is pointing.
     *
     * Runs the plan's `check` so the ghost's colour and the cost line are always the REAL answer —
     * there is no second copy of the rules in here to drift out of step with `js/buildplan.js`.
     */
    aim(x, z) {
      aimAt = { x, z };
      if (!mode) return null;
      if (POINT_TOOLS[tool]) { aimPoint(x, z); return null; }
      if (tool === 'stamp') { aimStamp(x, z); return null; }
      if (tool !== 'build') {
        brush.position.set(x, terrain.heightAt(x, z) + 0.15, z);
        brush.scale.set(radius * 2, radius * 2, radius * 2);
        // a run has no brush — it has the line you are laying, which has to follow the cursor
        if (tool === 'road' || tool === 'wall') drawRun();
        if (tool === 'copy') {
          const n = book.entries.filter(e => Math.hypot(e.x - x, e.z - z) <= radius && !e.waypoint).length;
          lastPoint = { ok: n > 0, text: n ? `Click to copy these ${n} piece${n === 1 ? '' : 's'} as a layout.` : 'Nothing you built inside the brush. [ ] sizes it.' };
        }
        return null;
      }
      if (!selected) { footprint.visible = false; return null; }
      // R28 — a piece being moved ignores itself, and is already paid for
      const carry = moving && moving.key === selected ? moving.id : null;
      const snapped = book.snap({ id: selected, x, z, rot, free, ignore: carry });
      const res = book.check({ id: selected, x: snapped.x, z: snapped.z, rot: snapped.rot, ignore: carry, free: !!carry });
      ghost.position.set(snapped.x, res.ghostY, snapped.z);
      ghost.rotation.y = -snapped.rot;
      tintGhost(res.ok, res.levels);
      const def = book.byId(selected);
      if (def) drawFootprint({ x: snapped.x, z: snapped.z, w: def.w, d: def.d, rot: snapped.rot }, !res.ok ? '#e06050' : res.levels ? '#e0b050' : '#5fd08a');
      lastCheck = { ...res, x: snapped.x, z: snapped.z, rot: snapped.rot, mount: snapped.mount || null };
      // R28 — Shift held: the whole line, ghosted, with its bill
      if (lineMode && !moving && lastPlaced && lastPlaced.key === selected) {
        const ln = book.lineFrom({ id: selected, from: lastPlaced, to: { x: snapped.x, z: snapped.z }, rot: lastPlaced.rot });
        const list = ln.spots.map(sp => {
          const c = book.check({ id: selected, x: sp.x, z: sp.z, rot: sp.rot });
          // the bill is judged for the whole line below; a spot is red only for the ground or a neighbour
          return { key: selected, x: sp.x, z: sp.z, rot: sp.rot, y: c.ghostY, ok: c.ok || /^You are short/.test(c.why || ''), levels: c.levels };
        });
        showGhosts(list);
        const blocked = list.filter(g => !g.ok).length;
        const q = book.quote(selected, Math.max(1, ln.count));
        lineInfo = { count: ln.count, blocked, text: ln.text, ok: ln.count > 0 && q.ok, why: q.why };
      } else if (lineMode) {
        hideGhosts();
        lineInfo = { count: 0, text: '', ok: false, why: lastPlaced ? `Shift+click lays a line of the ${lastPlaced.name} — pick that again to use it.` : 'Place one first; Shift+click then lays a line from it to the cursor.' };
      } else { hideGhosts(); lineInfo = null; }
      return lastCheck;
    },

    /** The click. What it does depends on the tool. */
    confirm() {
      if (!mode) return { ok: false, why: 'Build mode is off.' };
      if (tool === 'build') return lineMode && lastPlaced && !moving ? api.placeLineHere() : api.placeHere();
      if (tool === 'remove') return api.removeAt(aimAt.x, aimAt.z);
      if (tool === 'move') return api.moveAt(aimAt.x, aimAt.z);
      if (tool === 'upgrade') return api.upgradeAt(aimAt.x, aimAt.z);
      if (tool === 'repair') return api.repairAt(aimAt.x, aimAt.z);
      if (tool === 'pick') return api.pickAt(aimAt.x, aimAt.z);
      if (tool === 'copy') return api.copyAt(aimAt.x, aimAt.z);
      if (tool === 'stamp') return api.stampHere();
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
      if (moving && moving.key === selected) return api.dropMoved();
      const at = lastCheck.x != null ? lastCheck : book.snap({ id: selected, x: aimAt.x, z: aimAt.z, rot, free });
      const res = book.place({ id: selected, x: at.x, z: at.z, rot: at.rot ?? rot });
      if (!res.ok) { log(res.why, 'warn'); return res; }
      const def = book.byId(selected);
      /**
       * R18 — THE SAME TEST buildplan USES, so the view hears about every piece that moves ground.
       *
       * `js/buildplan.js` levels under anything with `flatten` OR `h <= 0.3` — round 14's rule that
       * "anything flat is a tile, and a tile levels under itself" — and this only told the view
       * about `flatten`. So six catalogue pieces (rug, flower bed, moss carpet, nameplate, caltrops,
       * bedroll) wrote a terraform delta that the clipmap never heard about: drop a bedroll on a
       * slope and it clips through ground the height data already says is flat, until you walk far
       * enough for the ring to rebuild on its own.
       *
       * Restated from the one in buildplan rather than re-derived, because two copies of "what
       * counts as flat" is how they came apart in the first place.
       */
      const levels = !!def?.flatten || (def?.h ?? 1) <= 0.3;
      if (levels) { groundChanged(at.x, at.z, Math.max(def.w, def.d)); clearProps(at.x, at.z, Math.max(def.w, def.d) * 0.6); }
      if (res.levelled) { groundChanged(at.x, at.z, Math.max(def.w, def.d) + 4); clearProps(at.x, at.z, Math.max(def.w, def.d) * 0.6); }
      addMesh(res.entry);
      pushAction({ kind: 'place', ids: [res.entry.id], tf: res.tf || [] });
      lastPlaced = res.entry;
      log(`${res.entry.name} built${res.levelled ? ' — the ground under it levelled first' : ''}.`, 'good');
      if (onPlace) onPlace(res.entry, def || null);
      return res;
    },

    /**
     * R28 — SHIFT+CLICK: a row of the piece you placed last, from it to the cursor.
     *
     * The whole row is ONE undo step and its bill is checked before anything is spent, so a line
     * you cannot afford is refused in one sentence rather than laid halfway.
     */
    placeLineHere() {
      if (!selected || !lastPlaced || lastPlaced.key !== selected) return api.placeHere();
      const to = lastCheck.x != null ? { x: lastCheck.x, z: lastCheck.z } : aimAt;
      const ln = book.lineFrom({ id: selected, from: lastPlaced, to, rot: lastPlaced.rot });
      if (!ln.count) return { ok: false, why: 'Too close to the last one for a line — click further away.' };
      const q = book.quote(selected, ln.count);
      if (!q.ok) { log(`${ln.count} × ${q.def?.name || selected} costs ${q.text}. ${q.why}`, 'warn'); return { ok: false, why: q.why }; }
      const res = book.placeLine({ id: selected, from: lastPlaced, to, rot: lastPlaced.rot });
      const def = book.byId(selected);
      for (const e of res.placed) {
        addMesh(e);
        if (onPlace) onPlace(e, def || null);
      }
      if (res.tf.length) { const m = res.placed[Math.floor(res.placed.length / 2)] || lastPlaced; groundChanged(m.x, m.z, Math.hypot(to.x - lastPlaced.x, to.z - lastPlaced.z) + 6); }
      if (res.placed.length) {
        pushAction({ kind: 'place', ids: res.placed.map(e => e.id), tf: res.tf });
        lastPlaced = res.placed[res.placed.length - 1];
        log(`${res.placed.length} × ${def?.name || selected} in a line.${res.skipped.length ? ` ${res.skipped.length} would not fit: ${res.skipped[0].why}` : ''}`, 'good');
      } else log(`None of the line would fit: ${res.skipped[0]?.why || 'nothing to lay'}`, 'warn');
      hideGhosts();
      return { ok: res.placed.length > 0, placed: res.placed, skipped: res.skipped };
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
      // R28 — a brush is an undo step: Ctrl+Z takes the ground back (the trees it felled stay felled)
      if (res.edit?.id) pushAction({ kind: 'brush', tf: [res.edit.id], x, z, r: radius, tool });
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
      /**
       * R28 — CLICK A CORNER TWICE AND A GATE GOES THERE.
       *
       * The Wall tool's hint has said "a gate goes where you double back over a corner" since round
       * 13, and `finishRun` was always called with no gates, so it never did. A click within
       * 1.5 m of the corner you just put down is that gesture: it marks the corner (or unmarks it)
       * instead of adding a zero-length leg.
       */
      const prev = runPoints[runPoints.length - 1];
      if (tool === 'wall' && prev && Math.hypot(x - prev[0], z - prev[1]) < 1.5) {
        const c = runPoints.length - 1;
        const def = book.byId(selected);
        const gate = def?.gateId ? book.byId(def.gateId) : null;
        if (!gate) { log(`A ${def?.name || 'wall'} has no gate to put in it.`, 'warn'); return { ok: false, why: 'No gate for this wall.' }; }
        if (runGates.includes(c)) runGates = runGates.filter(g => g !== c);
        else runGates.push(c);
        drawRun();
        log(runGates.includes(c) ? `A ${gate.name} goes at this corner. Click it again to take the gate out.` : 'No gate here after all.', '');
        return { ok: true, gate: runGates.includes(c), points: runPoints.length };
      }
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
      // R28 — Esc with a piece in hand puts it back where it stood (and counts as "something dropped")
      if (cancelMove()) { log('Put back where it was.', ''); return 1; }
      const had = runPoints.length;
      runPoints = [];
      runGates = [];
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
          runGates = [];
          drawRun();
          return laid;
        }
        book.pay(bill.cost);
        addLaneMesh(laid.lane);
        pushAction({ kind: 'lane', id: laid.lane.id });
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
      /**
       * R28 — the whole run is checked against the purse BEFORE the ground is graded, so a wall you
       * cannot afford is one sentence instead of a graded strip with half a palisade on it.
       */
      const runQuote = def?.run ? book.runBill({ id: pieceId, points: runPoints, gateCorners: runGates }) : null;
      if (runQuote && !runQuote.ok) {
        log(`${runQuote.count} section${runQuote.count === 1 ? '' : 's'} of ${def.name} cost ${runQuote.text}. ${runQuote.why}`, 'warn');
        runPoints = []; runGates = [];
        drawRun();
        return { ok: false, why: runQuote.why };
      }
      const tfBefore = terraform?.edits?.length ?? 0;
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

      const res = book.run({ id: pieceId, points: runPoints, gateAt, gateCorners: runGates });
      for (const entry of res.placed || []) {
        addMesh(entry);
        // R28 — a gate or a wall section joins the world like any piece: solid, and on the base
        if (onPlace) onPlace(entry, book.byId(entry.key) || null);
      }
      // R28 — the whole run, strips and all, is ONE undo step (it used to be one per section)
      const runTf = (terraform?.edits || []).slice(tfBefore).map(e => e.id).filter(Boolean);
      if ((res.placed || []).length) pushAction({ kind: 'place', ids: res.placed.map(e => e.id), tf: runTf, run: true });
      /**
       * SAY WHAT WENT DOWN.
       *
       * `finishRun` logged only its failures, so a road that laid perfectly was indistinguishable
       * from a key that did nothing — and Enter is a key you cannot see the effect of if the
       * sections are behind you. Every other tool in this file says what it did; so does this one.
       */
      const laid = (res.placed || []).length;
      const gates = (res.placed || []).filter(e => e.gate).length;
      if (laid) log(`${laid} section${laid === 1 ? '' : 's'} of ${def?.name || pieceId} laid${gates ? `, with ${gates} gate${gates === 1 ? '' : 's'}` : ''}.`, 'good');
      else if (!res.skipped?.length) log(`Nothing was laid. ${res.why || 'Check you can afford it.'}`, 'warn');
      if (res.skipped?.length) log(`${res.skipped.length} sections would not fit: ${res.skipped[0].why}`, 'warn');
      runPoints = [];
      runGates = [];
      drawRun();
      return res;
    },

    /** §4.7 — the deconstruct tool. */
    removeAt(x, z, reach = 3) {
      const e = book.pickEntry(x, z, reach);
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
      const snap = { ...best.e };
      const res = book.remove(best.e.id);
      if (res.ok) api.forget(best.e.id);
      if (res.ok) log(`${res.entry.name} taken down. ${book.costText(res.refund) || 'Nothing'} recovered. Ctrl+Z puts it back.`, 'good');
      if (res.ok && onRemove) onRemove(res.entry, book.byId(res.entry.key) || null);
      if (res.ok) pushAction({ kind: 'takedown', entry: snap, charge: res.refund });
      if (res.ok && lastPlaced?.id === snap.id) lastPlaced = null;
      return res;
    },

    /**
     * R28 — THE MOVE TOOL: pick a piece up and carry it.
     *
     * The first version took the piece down at a full refund and built a new one, which gave it a
     * NEW id — and a watch post's guards, an outpost's register and anything else filed by id lost
     * track of it. Now the piece never leaves the ledger: its mesh is hidden, the ghost is the
     * piece (turned the way it stood, ignoring itself), and the click that puts it down is
     * `plan.relocate`, which moves it under the same id for nothing. Only pieces that no system
     * keeps a POSITION for may be moved (`plan.movable`); Esc puts it back where it was.
     */
    moveAt(x, z) {
      const e = book.pickEntry(x, z, 3);
      if (!e) return { ok: false, why: 'Point at something you built to pick it up.' };
      const can = book.movable(e);
      if (!can.ok) { log(can.why, 'warn'); return can; }
      cancelMove();
      api.setTool('build');
      api.select(e.key);
      rot = e.rot || 0;
      moving = { id: e.id, key: e.key, name: e.name };
      const g = meshes.get(e.id);
      if (g) g.visible = false;
      log(`${e.name} picked up — click where it goes. Q turns it. Esc puts it back.`, 'good');
      return { ok: true, entry: e, moving: true };
    },

    /** R28 — the click that puts a carried piece down. See `moveAt`. */
    dropMoved() {
      if (!moving) return { ok: false, why: 'Nothing picked up.' };
      const at = lastCheck.x != null ? lastCheck : book.snap({ id: moving.key, x: aimAt.x, z: aimAt.z, rot, free, ignore: moving.id });
      const res = book.relocate(moving.id, { x: at.x, z: at.z, rot: at.rot ?? rot });
      if (!res.ok) { log(res.why, 'warn'); return res; }
      const def = book.byId(res.entry.key);
      api.forget(res.entry.id);
      addMesh(res.entry);
      const r = Math.max(res.entry.w, res.entry.d);
      if (res.tf.length) groundChanged(res.entry.x, res.entry.z, r + 4);
      pushAction({ kind: 'move', id: res.entry.id, from: res.from, tf: res.tf });
      moving = null;
      log(`${res.entry.name} moved. Ctrl+Z carries it back.`, 'good');
      if (onPlace) onPlace(res.entry, def || null);
      return { ok: true, entry: res.entry, moved: true };
    },
    /** R28 — the piece the Move tool is carrying, if any. */
    get moving() { return moving; },
    cancelMove,

    /** R28 — the Upgrade tool. See `plan.upgradeOf` for the rules and the price. */
    upgradeAt(x, z) {
      const e = book.pickEntry(x, z, 3);
      if (!e) return { ok: false, why: 'Point at something you built to upgrade it.' };
      const res = book.upgrade(e.id);
      if (!res.ok) { log(res.why, 'warn'); return res; }
      api.forget(e.id);
      addMesh(res.entry);
      pushAction({ kind: 'upgrade', id: e.id, was: res.was, paid: res.paid });
      log(`${res.from.name} → ${res.to.name} for ${book.costText(res.paid) || 'nothing'}.`, 'good');
      if (onPlace) onPlace(res.entry, res.to);
      return res;
    },

    /** R28 — the Repair tool: put the piece under the cursor back to full, for the quoted price. */
    repairAt(x, z) {
      const e = book.pickEntry(x, z, 3);
      if (!e) return { ok: false, why: 'Point at something you built to repair it.' };
      const res = book.repair(e.id);
      if (!res.ok) { log(res.why, 'warn'); return res; }
      paintDamage(res.entry);
      pushAction({ kind: 'repair', id: e.id, hp: res.was, paid: res.paid });
      log(`${e.name} repaired (+${Math.round(res.healed)} HP) for ${book.costText(res.paid) || 'nothing'}.`, 'good');
      return res;
    },

    /**
     * R28 — SOMETHING HIT A PIECE. js/main.js calls this when an enemy's swing lands on a wall it
     * could not get past. Broken at 0: the mesh goes, `onRemove` runs exactly as for a take-down
     * (the collider is rebuilt, a crate's goods are handed on, the grid and the drills let go), and
     * the salvage goes in your store. A broken piece is not an undo step.
     */
    damagePiece(entryId, amount, { by = null } = {}) {
      const before = book.entries.find(e => e.id === entryId);
      if (!before) return { ok: false, why: 'Nothing there.' };
      const res = book.damage(entryId, amount);
      if (!res.ok) return res;
      if (!res.destroyed) { paintDamage(res.entry); return res; }
      api.forget(entryId);
      if (lastPlaced?.id === entryId) lastPlaced = null;
      if (onRemove) onRemove(res.entry, book.byId(res.entry.key) || null);
      log(`${by ? `${by} breaks` : 'Broken:'} the ${res.entry.name}. ${book.costText(res.refund) || 'Nothing'} salvaged.`, 'bad');
      return res;
    },
    /** R28 — the built piece in an enemy's way, for js/actors.js. See js/buildplan.js `blockingPiece`. */
    blockingPiece(ax, az, bx, bz, opts) { return book.blocking(ax, az, bx, bz, opts); },
    /** R28 — every piece below full, for the HUD and tests. */
    get damaged() { return book.entries.filter(e => (book.health(e)?.ratio ?? 1) < 1); },

    /**
     * R28 — C, or the Pick tool: build another of whatever you point at, turned the same way.
     * The quickest way to say "one more of those" on a base that already has one.
     */
    pickAt(x, z) {
      const e = book.pickEntry(x, z, 3);
      if (!e) return { ok: false, why: 'Point at something you built to build another.' };
      const lock = book.lockOf(e.key);
      if (lock) { log(lock.text, 'warn'); return { ok: false, why: lock.text }; }
      api.select(e.key);
      rot = e.rot || 0;
      api.setTool('build');
      lastPlaced = e;
      log(`Another ${e.name}: click to place · Shift+click lays a line from this one.`, '');
      return { ok: true, key: e.key };
    },

    /** R28 — the Copy tool: everything inside the brush becomes a saved layout, ready to stamp. */
    copyAt(x, z) {
      const n = blueprints.length + 1;
      const bp = book.captureAround(x, z, radius, null);
      if (!bp) return { ok: false, why: 'Nothing you built inside the brush.' };
      bp.name = `Layout ${n} (${bp.pieces.length} piece${bp.pieces.length === 1 ? '' : 's'})`;
      bp.made = Date.now();
      blueprints.push(bp);
      saveLocalBlueprints(blueprints);
      stampIndex = blueprints.length - 1;
      api.setTool('stamp');
      log(`${bp.name} copied. Click to stamp it somewhere else · Q turns it · Esc to stop.`, 'good');
      return { ok: true, blueprint: bp };
    },

    /** R28 — the saved layouts, for the panel. */
    get blueprints() { return blueprints; },
    get stampIndex() { return stampIndex; },
    selectBlueprint(i) {
      if (!blueprints[i]) return null;
      stampIndex = i;
      poolSig = '';
      api.setTool('stamp');
      return blueprints[i];
    },
    deleteBlueprint(i) {
      if (!blueprints[i]) return false;
      blueprints.splice(i, 1);
      if (stampIndex >= blueprints.length) stampIndex = blueprints.length - 1;
      saveLocalBlueprints(blueprints);
      return true;
    },
    renameBlueprint(i, name) {
      if (!blueprints[i] || !name) return false;
      blueprints[i].name = String(name).slice(0, 40);
      saveLocalBlueprints(blueprints);
      return true;
    },

    /**
     * R28 — STAMP: the whole layout, priced first.
     *
     * `plan.stamp` places piece by piece and would happily spend half the bill on half a building,
     * so the whole bill is checked here before anything goes down. Pieces the ground or a
     * neighbour refuses are left out and named; the rest is one undo step.
     */
    stampHere() {
      const bp = blueprints[stampIndex];
      if (!bp) return { ok: false, why: 'Copy a layout first: the Copy tool, then click on something you built.' };
      const chk = book.stampCheck(bp, aimAt.x, aimAt.z, rot);
      if (!chk.ok) { log(chk.why, 'warn'); return { ok: false, why: chk.why }; }
      const fits = { ...bp, pieces: bp.pieces.filter((p, i) => chk.rows[i].ok) };
      const res = book.stamp(fits, aimAt.x, aimAt.z, rot);
      for (const e of res.placed) {
        addMesh(e);
        if (onPlace) onPlace(e, book.byId(e.key) || null);
      }
      if (res.tf?.length) groundChanged(aimAt.x, aimAt.z, (bp.w || 20) + 6);
      if (res.placed.length) pushAction({ kind: 'place', ids: res.placed.map(e => e.id), tf: res.tf || [], stamp: true });
      const left = chk.total - res.placed.length;
      log(`${bp.name}: ${res.placed.length} piece${res.placed.length === 1 ? '' : 's'} built for ${chk.text || 'nothing'}.${left ? ` ${left} would not fit here.` : ''}`, res.placed.length ? 'good' : 'warn');
      return { ok: res.placed.length > 0, placed: res.placed, skipped: res.skipped };
    },

    /**
     * §4.9 — undo the last STEP, whatever it was.
     *
     * R28 — this used to pop the build ledger, which made it right for one placed piece and wrong
     * for everything else: a wall run of twenty sections took twenty presses, Level / Raise / Lower
     * could not be undone at all (the terraform book has always had `remove(id)`; nothing called
     * it), a take-down could not be put back, and after a reload Ctrl+Z quietly deleted the newest
     * piece of an old base at a full refund. Now every tool pushes one step onto `actions` and this
     * takes the top one back:
     *
     *   place    — the pieces (one, a Shift line, a wall run or a stamped layout) come down at a
     *              full refund, and the ground they levelled goes back to how it was;
     *   lane     — the road comes up, full refund;
     *   brush    — the ground comes back (what the brush felled stays felled: that timber is yours);
     *   takedown — the piece goes back where it stood, for what the take-down gave you;
     *   upgrade  — the old piece back, and what the upgrade cost.
     *
     * The stack is not saved: after a reload there is nothing to undo, which is the honest answer.
     */
    undo() {
      cancelMove();
      while (actions.length) {
        const a = actions.pop();
        const res = undoStep(a);
        if (res) return res;
      }
      log('Nothing to undo.', '');
      return { ok: false, why: 'Nothing to undo.' };
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
      /**
       * R28 — A REPAIR STATION MENDS. `repairs: { radius, rate }` is read as `rate` per cent of each
       * damaged piece's bar per minute, for every piece within `radius`, while the station has
       * power. Free: it already costs 12 kW. Once a second, and only when something is damaged.
       */
      mendClock += dt;
      if (mendClock >= 1) {
        const step = mendClock;
        mendClock = 0;
        const hurt = book.entries.filter(e => (book.health(e)?.ratio ?? 1) < 1);
        if (hurt.length) {
          const stations = book.entries.filter(e => book.byId(e.key)?.repairs && e.powered !== false);
          for (const st of stations) {
            const r = book.byId(st.key).repairs;
            for (const e of hurt) {
              if (Math.hypot(e.x - st.x, e.z - st.z) > (r.radius ?? 30)) continue;
              if (book.heal(e.id, (book.health(e).maxHp * (r.rate ?? 25) / 100) * step / 60) > 0) paintDamage(e);
            }
          }
        }
      }
      if (brush.visible) brush.rotation.z += dt * 0.4;
    },

    setVisible(on) { root.visible = !!on; roadGroup.visible = !!on; },

    dispose() {
      scene.remove(root);
      scene.remove(roadGroup);
      scene.remove(ghost);
      scene.remove(brush);
      scene.remove(runGroup);
      scene.remove(footprint);
      scene.remove(ghostPool);
      scene.remove(highlight);
      if (api.portalRing) scene.remove(api.portalRing);
    },

    /** R17 — what the player has learned, in case js/main.js has not been given its own slot yet. */
    get research() { return research; },

    /**
     * R17 — RESEARCH RIDES IN THE BUILD BLOB, and here is the honest reason.
     *
     * js/main.js's `currentSnapshot()` and js/save.js's parameter list are the two places a new save
     * key has to be added TOGETHER — main.js's own comment records what happened the last time one
     * of them was left off, which is that `world`, `quests` and `campaign` were silently dropped and
     * every load emptied them. Both files belong to another pair of hands this round, so rather than
     * hand over a research system that forgets itself on every reload, it travels inside `build`,
     * which is already saved and already loaded.
     *
     * It is not an unreasonable place for it either: research gates the build catalogue and nothing
     * else. If a later round gives it a slot of its own, `research.toJSON()`/`load` move across
     * unchanged and this reader keeps working for old saves.
     */
    toJSON() {
      return {
        plan: book.toJSON(),
        terraform: terraform?.toJSON?.() || null,
        roads: roads.toJSON(),
        research: research.toJSON(),
        // R28 — this run's saved layouts (they are mirrored to the browser too; see BP_KEY)
        blueprints: blueprints.slice(-24),
      };
    },
    load(data) {
      book.load(data?.plan);
      // R28 — nothing from before the load can be undone; see `undo`
      actions = [];
      lastPlaced = null;
      if (Array.isArray(data?.blueprints)) {
        const names = new Set(blueprints.map(b => b.name + '|' + b.pieces.length));
        for (const b of data.blueprints) if (b?.pieces && !names.has(b.name + '|' + b.pieces.length)) blueprints.push(b);
      }
      if (data?.terraform && terraform) terraform.load(data.terraform);
      // a save from before R17 has no `research` key, which is a brand-new tree with nothing bought
      // and every low-tech piece available — exactly what that save already had
      if (data?.research) research.load(data.research);
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
