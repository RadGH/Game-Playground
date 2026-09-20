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
} = {}) {
  const book = plan || createBuildPlan({ catalogue, terrain, terraform, store: store || makeBag(), siteOk });
  const rules = catalogue?.rules || {};
  const log = (msg, kind) => { if (onLog) onLog(msg, kind); };

  const root = new THREE.Group();
  root.name = 'farhold-build';
  scene.add(root);

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

  let mode = false;
  let tool = 'build';
  let selected = null;
  let rot = 0;
  let free = false;
  let radius = 8;
  let aimAt = { x: 0, z: 0 };
  let lastCheck = { ok: false, why: '' };
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

  /** Redraw the ground after a brush lands. Cheap: only the rings that can see the edit. */
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
      brush.visible = mode && tool !== 'build';
      if (!mode) runPoints = [];
      return mode;
    },

    /** 'build' | 'smooth' | 'raise' | 'lower' | 'road' | 'wall' | 'remove' | 'clear'. */
    setTool(name) {
      tool = name;
      if (name !== 'build') runPoints = [];
      ghost.visible = mode && tool === 'build' && !!selected;
      brush.visible = mode && tool !== 'build';
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
      return api.paint();
    },

    placeHere() {
      if (!selected) return { ok: false, why: 'Nothing selected.' };
      const at = lastCheck.x != null ? lastCheck : book.snap({ id: selected, x: aimAt.x, z: aimAt.z, rot, free });
      const res = book.place({ id: selected, x: at.x, z: at.z, rot: at.rot ?? rot });
      if (!res.ok) { log(res.why, 'warn'); return res; }
      const def = book.byId(selected);
      if (def?.flatten) groundChanged(at.x, at.z, Math.max(def.w, def.d));
      addMesh(res.entry);
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
      if (res.materials && store?.give) store.give(res.materials);
      if (res.removed) log(`Cleared ${res.removed} of it. ${book.costText(res.materials || {})} recovered.`, 'good');
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
      return { ok: true, points: runPoints.length };
    },

    finishRun({ id = null, gateAt = [] } = {}) {
      if (runPoints.length < 2) { runPoints = []; return { ok: false, why: 'A run needs two points.' }; }
      const pieceId = id || selected || (tool === 'road' ? 'road_dirt' : 'palisade');
      const def = book.byId(pieceId);
      const claim = book.claimAt(runPoints[0][0], runPoints[0][1])?.id ?? null;

      /**
       * THE GROUND IS GRADED FIRST, THEN THE PIECES GO ON IT.
       *
       * Doing it the other way round is the bug `js/planet.js` already wrote a long note about with
       * its bridges: the deck was placed and then the river carved it out again. Here the same
       * shape appears — a wall placed on raw ground and then levelled under would be left with its
       * footings in the air. So each leg gets its strip brush, the clipmap is told, and only then
       * does `plan.run` measure the ground it is standing on.
       */
      if (def?.road || def?.run) {
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
      }

      const res = book.run({ id: pieceId, points: runPoints, gateAt });
      for (const entry of res.placed || []) addMesh(entry);
      if (res.skipped?.length) log(`${res.skipped.length} sections would not fit: ${res.skipped[0].why}`, 'warn');
      runPoints = [];
      return res;
    },

    /** §4.7 — the deconstruct tool. */
    removeAt(x, z, reach = 3) {
      let best = null;
      for (const e of book.entries) {
        const dist = Math.hypot(e.x - x, e.z - z);
        if (dist <= reach + Math.max(e.w, e.d) / 2 && (!best || dist < best.dist)) best = { e, dist };
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

    /** Rebuild every mesh from the ledger — after a load, or after a claim is razed. */
    rebuild() {
      for (const id of [...meshes.keys()]) api.forget(id);
      for (const entry of book.entries) addMesh(entry);
      return book.entries.length;
    },

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

    setVisible(on) { root.visible = !!on; },

    dispose() {
      scene.remove(root);
      scene.remove(ghost);
      scene.remove(brush);
      if (api.portalRing) scene.remove(api.portalRing);
    },

    toJSON() { return { plan: book.toJSON(), terraform: terraform?.toJSON?.() || null }; },
    load(data) {
      book.load(data?.plan);
      if (data?.terraform && terraform) terraform.load(data.terraform);
      api.rebuild();
      return book.entries.length;
    },
  };

  return api;
}
