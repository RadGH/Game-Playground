// Farhold — the seams, drawn.
//
// js/resources.js decides what is in the ground and js/mining.js decides how fast it comes out;
// neither of them can be seen. A seam you cannot see is a seam nobody mines, so this is the part
// that puts a rock on the grass.
//
// One InstancedMesh per node kind, the same discipline js/props.js and js/features.js keep: a
// hundred outcrops is one draw call, not a hundred.
//
//   import { createOreView } from './ore-view.js';
//   const view = createOreView(scene, { data });
//   view.update(ore.around(x, z), x, z);
//   view.dispose();
//
// ----------------------------------------------------------------------------------------------
// R17 — EVERY KIND IS A LITTLE SCENE NOW, NOT ONE PRIMITIVE.
//
//   "Also please update the resource graphics for things like Iron Ore. It's a single color orange
//    rock right now. Can we add some iron 'crystals' growing out of it and make it have a mix of
//    regular rock texture and the ore texture so it still brighter/distinct from regular rocks but
//    isn't just a weird anomoly in the distance. We should revisit other resources too. I did once
//    find a plant fiber source that looked like a tiny cone-shaped tree, that could definitely be
//    changed to look like a sapling or small bush for example, but needs to be distinct from
//    natural bushes/trees to not cause confusion."
//
// Both halves of that are the same fault. `SHAPES` was one `new THREE.DodecahedronGeometry(1.1)`
// per kind, painted in the ORE's colour from tip to base — so an iron outcrop was a solid orange
// rock, which is not a thing that exists in any ground anywhere, and a fibre patch was a 1.2 m cone
// that read as a very small conifer. The old comment above `SHAPES` even said the shapes were
// "deliberately low-poly and slightly wrong-looking", which is how a stand-in survives ten rounds.
//
// Every kind is now a MERGED COMPOSITE in two material groups:
//
//   group 0 — the HOST. Ordinary rock, ordinary bark, ordinary sand, in the dull colour the
//             surrounding ground already is. This is most of the volume.
//   group 1 — the SEAM. The crystals growing out of the rock, the wet clay in the bank, the cut
//             logs at the foot of the tree. A small share of the volume, the ore's own colour, and
//             the only part that carries any emissive.
//
// HOW A SEAM STILL READS AS INTERACTIVE FROM THIRTY METRES, which is the thing the old flat glow
// was doing and must not be lost:
//
//   1. the GLOW IS CONCENTRATED. Emissive used to be spread over the whole rock at 0.35; it is now
//      0 on the host and 0.55 on the seam group. The same light comes off a fifth of the surface,
//      so the bright bit is brighter, and at range the eye finds a small bright thing faster than a
//      big dim one.
//   2. the SILHOUETTE IS WRONG ON PURPOSE. js/props.js scatters boulders and trees as SINGLE round
//      lumps and single trunks. Every seam here has spikes, steps, or a cluster standing off the
//      host — an outline nothing in the scenery has. That is what stops "is that a rock or a rock"
//      at the distance where colour has washed out.
//   3. NOTHING IN `js/props.js` HAS TWO COLOURS THAT MEET AT AN EDGE. Its props are one tint with
//      a brightness wobble; these are a grey host with a saturated seam in it. Round 16's giants
//      made the same distinction between bark and leaf for the same reason.
//
// Two materials is still one InstancedMesh: the geometry carries two groups, Three.js draws the
// instanced batch once per group, and adding a hundred outcrops still adds nothing.

import * as THREE from 'three';

// ---------------------------------------------------------------------------- the part kit
//
// Module-level base geometries, shared by every part that uses them — which is exactly the trap
// js/props.js documented at length: `toNonIndexed()` hands back the SAME object when a geometry is
// already non-indexed, so `applyMatrix4` on the result transforms the shared base and the next part
// built on it comes out somewhere in the thousands. `prepare()` below always clones.

// Segment counts are deliberately mean. A seam is a two-metre object seen from thirty, and every
// one of these is drawn up to 220 times per kind — a fibre patch built out of nine smooth blades
// costs more triangles than the tree it is standing under, for detail nobody can resolve.
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
const TAPER = new THREE.CylinderGeometry(0.06, 0.5, 1, 4);     // a blade, a shard, a fibre leaf
const CONE = new THREE.ConeGeometry(0.5, 1, 5);
const SPH = new THREE.SphereGeometry(0.5, 6, 4);
const ROCK = new THREE.DodecahedronGeometry(0.5, 0);
const GEM = new THREE.OctahedronGeometry(0.5, 0);
const RING = new THREE.TorusGeometry(0.5, 0.14, 4, 10);
const DISC = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);

/** Position, scale and a full rotation. Everything in the kit is built with this. */
function at(x, y, z, sx, sy, sz, ex = 0, ey = 0, ez = 0) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(ex, ey, ez)),
    new THREE.Vector3(sx, sy, sz),
  );
}

/**
 * Merge a part list into ONE geometry with TWO material groups.
 *
 * `m` is which group a part belongs to: 0 is the host rock, 1 is the seam. Parts are concatenated
 * host-first so each group is a contiguous run, which is what `addGroup` needs.
 *
 * A kind with nothing in group 1 still gets an empty group rather than a missing one, because
 * Three.js will happily draw a group of length zero and will not draw a material that has no group
 * at all — and "the ore never appears" is a worse failure than a wasted draw call that does nothing.
 */
function mergeGroups(parts) {
  const prepare = p => {
    /**
     * `toNonIndexed()` HANDS BACK THE SAME OBJECT when a geometry is already non-indexed — and then
     * `applyMatrix4` transforms the module-level base that every other part is also built from, so
     * the second use of a shared shape comes out somewhere in the thousands. js/props.js found this
     * the hard way in round 16 (five of its twelve giants were affected). Asking `index` first also
     * keeps Three.js from printing "BufferGeometry is already non-indexed" once per part, which is
     * a warning that has been scrolling past in every test run for weeks.
     */
    const src = p.g.index ? p.g.toNonIndexed() : p.g;
    const g = src === p.g ? src.clone() : src;
    g.applyMatrix4(p.matrix);
    g.computeVertexNormals();
    return g;
  };
  const host = parts.filter(p => (p.m || 0) === 0).map(prepare);
  const seam = parts.filter(p => (p.m || 0) === 1).map(prepare);
  const all = [...host, ...seam];
  const total = all.reduce((n, g) => n + g.attributes.position.count, 0);
  // counted BEFORE the copy loop, which disposes each part as it goes
  const hostCount = host.reduce((n, g) => n + g.attributes.position.count, 0);
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  let o = 0;
  for (const g of all) {
    position.set(g.attributes.position.array, o * 3);
    normal.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.addGroup(0, hostCount, 0);
  out.addGroup(hostCount, total - hostCount, 1);
  return out;
}

/** A ring of `n` spikes standing out of a host at `r` from its middle. The seam's silhouette. */
function spikes(n, { r = 0.45, len = 0.9, thick = 0.16, y = 0.35, lean = 0.5, seed = 1 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    // deterministic wobble: a seam must look the same every time the field is rebuilt
    const j = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    const wob = j - Math.floor(j);
    const a = (i / n) * Math.PI * 2 + wob * 0.6;
    const l = len * (0.6 + wob * 0.8);
    out.push({
      g: TAPER, m: 1,
      matrix: at(
        Math.cos(a) * r, y + l * 0.4, Math.sin(a) * r,
        thick, l, thick,
        Math.sin(a) * lean * (0.5 + wob), a, -Math.cos(a) * lean * (0.5 + wob),
      ),
    });
  }
  return out;
}

/**
 * A SHAPE PER KIND, and "ore" is seventeen different things.
 *
 * Every builder returns one merged geometry, host first then seam. Sizes are around the old
 * primitives' sizes on purpose: `update()` below scales each instance by the node's own radius and
 * nothing about where a seam sits or how big it draws has moved.
 */
const SHAPES = {
  /**
   * The one that was reported. A broken grey outcrop with iron crystals growing out of the cracks,
   * rather than an orange rock. Two overlapping lumps so the host is not a sphere, then a ring of
   * blades leaning out of the seam line and two flat plates lying in it.
   */
  ore_outcrop: () => mergeGroups([
    { g: ROCK, m: 0, matrix: at(0, 0.38, 0, 2.0, 1.3, 1.8, 0.2, 0.7, 0.1) },
    { g: ROCK, m: 0, matrix: at(0.55, 0.22, -0.35, 1.2, 0.9, 1.1, 0, 1.9, 0.3) },
    { g: ROCK, m: 0, matrix: at(-0.5, 0.18, 0.4, 0.9, 0.7, 0.9, 0.1, 0.4, -0.2) },
    ...spikes(5, { r: 0.42, len: 1.0, thick: 0.17, y: 0.55, lean: 0.55, seed: 3 }),
    { g: GEM, m: 1, matrix: at(0.1, 0.85, 0.05, 0.42, 0.62, 0.42, 0.3, 0.6, 0.1) },
    { g: BOX, m: 1, matrix: at(-0.62, 0.36, -0.3, 0.5, 0.1, 0.34, 0.3, 0.8, 0.4) },
  ]),

  /**
   * Deeper, darker host and a longer seam running through it — this one lives underground
   * (`indoors: true` in data/resources.json, which round 13 fixed), so the crystals are the only
   * thing a torch picks out.
   */
  deep_vein: () => mergeGroups([
    { g: ROCK, m: 0, matrix: at(0, 0.5, 0, 2.6, 1.7, 2.2, 0.15, 0.3, 0.1) },
    { g: BOX, m: 0, matrix: at(0.7, 0.35, 0.5, 1.1, 0.7, 0.9, 0.2, 0.9, 0.3) },
    { g: BOX, m: 1, matrix: at(0, 0.72, 0, 2.3, 0.22, 0.3, 0.1, 0.5, 0.18) },
    ...spikes(6, { r: 0.5, len: 1.25, thick: 0.19, y: 0.7, lean: 0.35, seed: 7 }),
    { g: GEM, m: 1, matrix: at(-0.3, 1.15, 0.2, 0.5, 0.8, 0.5, 0.2, 1.1, -0.2) },
  ]),

  /**
   * A boulder you can BREAK, as against the thousands js/props.js scatters. The difference is the
   * split: it is already cracked open, with a pale vein showing in the fracture, which is the one
   * thing a scenery boulder never has.
   */
  boulder: () => mergeGroups([
    { g: ROCK, m: 0, matrix: at(-0.22, 0.42, 0, 1.5, 1.5, 1.6, 0.2, 0.5, 0.15) },
    { g: ROCK, m: 0, matrix: at(0.45, 0.3, 0.1, 1.0, 1.0, 1.1, 0.3, 1.4, -0.2) },
    { g: BOX, m: 1, matrix: at(0.14, 0.5, 0.05, 0.16, 1.1, 1.3, 0, 0.3, 0.12) },
    { g: BOX, m: 1, matrix: at(0.14, 0.72, -0.4, 0.14, 0.5, 0.5, 0.4, 0.3, 0.1) },
  ]),

  /** A worked face: three cut steps in the hillside, with pale dressed stone in the newest cut. */
  quarry_face: () => mergeGroups([
    { g: BOX, m: 0, matrix: at(0, 0.55, 0, 3.4, 1.1, 2.4) },
    { g: BOX, m: 0, matrix: at(0, 1.35, -0.5, 2.8, 0.6, 1.4) },
    { g: BOX, m: 0, matrix: at(0, 1.85, -0.9, 2.0, 0.5, 0.8) },
    { g: BOX, m: 1, matrix: at(-1.0, 1.2, 0.9, 0.8, 0.5, 0.7, 0, 0.2, 0) },
    { g: BOX, m: 1, matrix: at(-0.1, 1.15, 1.0, 0.7, 0.45, 0.6, 0, -0.3, 0.1) },
    { g: BOX, m: 1, matrix: at(0.85, 1.45, 0.7, 0.75, 0.5, 0.65, 0.1, 0.5, 0) },
  ]),

  /** A cut bank with a scooped face — the wet clay in the scoop is the part you dig. */
  clay_bank: () => mergeGroups([
    { g: CYL, m: 0, matrix: at(0, 0.45, 0, 4.4, 0.9, 3.8) },
    { g: CYL, m: 0, matrix: at(-0.5, 0.9, -0.4, 2.6, 0.6, 2.2) },
    { g: DISC, m: 1, matrix: at(0.9, 0.7, 0.6, 2.2, 0.28, 1.8) },
    { g: SPH, m: 1, matrix: at(1.3, 0.85, 0.9, 0.7, 0.4, 0.6) },
    { g: SPH, m: 1, matrix: at(0.5, 0.82, 1.1, 0.5, 0.3, 0.45) },
  ]),

  /** A sand bar: a flat drift with a dry pale crest along it and a scatter of shells. */
  sand_bar: () => mergeGroups([
    { g: DISC, m: 0, matrix: at(0, 0.18, 0, 5.2, 0.36, 4.6) },
    { g: DISC, m: 0, matrix: at(-0.8, 0.34, 0.5, 3.0, 0.3, 2.4) },
    { g: DISC, m: 1, matrix: at(0.6, 0.42, -0.3, 2.6, 0.22, 1.2, 0, 0.4, 0) },
    { g: SPH, m: 1, matrix: at(1.5, 0.3, 0.8, 0.4, 0.2, 0.4) },
  ]),

  /**
   * A TREE YOU ARE MEANT TO FELL, not one of the forest. Trunk and canopy like any tree — and then
   * a felling notch cut in the trunk and two logs already bucked at its foot, which is a silhouette
   * no scenery tree in js/props.js has. That is the whole of telling them apart at range.
   */
  tree: () => mergeGroups([
    { g: CYL, m: 0, matrix: at(0, 1.5, 0, 0.42, 3.0, 0.42) },
    { g: SPH, m: 0, matrix: at(0, 3.5, 0, 2.2, 1.8, 2.2) },
    { g: SPH, m: 0, matrix: at(0.7, 2.9, 0.4, 1.2, 1.0, 1.2) },
    { g: BOX, m: 1, matrix: at(0.3, 0.75, 0, 0.5, 0.45, 0.5, 0, 0.8, 0.5) },
    { g: CYL, m: 1, matrix: at(-1.0, 0.22, 0.5, 0.42, 1.7, 0.42, Math.PI / 2, 0.4, 0) },
    { g: CYL, m: 1, matrix: at(-0.8, 0.22, -0.7, 0.4, 1.4, 0.4, Math.PI / 2, -0.2, 0) },
  ]),

  /**
   * The other one that was reported by name: "a tiny cone-shaped tree". It is a clump now — nine
   * splayed blades and two seed heads standing over a low mound, with nothing that resembles a
   * trunk. A bush in js/props.js is a single round lump and a fern is a low fan; this is neither,
   * and the pale seed heads are the bit that catches the eye.
   */
  fibre_patch: () => mergeGroups([
    { g: SPH, m: 0, matrix: at(0, 0.12, 0, 1.5, 0.28, 1.4) },
    ...spikes(9, { r: 0.34, len: 1.5, thick: 0.1, y: 0.42, lean: 0.85, seed: 11 }),
    { g: TAPER, m: 1, matrix: at(0, 0.85, 0, 0.1, 1.7, 0.1, 0.1, 0, 0.06) },
    { g: SPH, m: 1, matrix: at(0.05, 1.6, 0.02, 0.24, 0.42, 0.24) },
    { g: SPH, m: 1, matrix: at(-0.42, 1.25, 0.3, 0.2, 0.34, 0.2, 0, 0, 0.4) },
  ]),

  /** A crystal seam: a broken plinth with a cluster of spires of three different heights on it. */
  crystal_spire: () => mergeGroups([
    { g: ROCK, m: 0, matrix: at(0, 0.3, 0, 1.8, 0.9, 1.7, 0.1, 0.8, 0) },
    { g: ROCK, m: 0, matrix: at(0.5, 0.2, 0.45, 0.9, 0.6, 0.9, 0, 1.6, 0.2) },
    { g: CONE, m: 1, matrix: at(0, 1.9, 0, 0.6, 3.2, 0.6, 0.05, 0, 0.04) },
    { g: CONE, m: 1, matrix: at(0.5, 1.2, 0.25, 0.42, 2.0, 0.42, 0.18, 0.7, 0.24) },
    { g: CONE, m: 1, matrix: at(-0.45, 1.0, -0.3, 0.34, 1.6, 0.34, -0.2, 1.4, -0.22) },
    { g: GEM, m: 1, matrix: at(-0.25, 0.55, 0.55, 0.4, 0.5, 0.4, 0.4, 0.5, 0.3) },
  ]),

  /** A lava flow gone to glass: low ropey lobes with black shards standing out of the crust. */
  obsidian_flow: () => mergeGroups([
    { g: ROCK, m: 0, matrix: at(0, 0.3, 0, 3.0, 0.9, 2.6, 0.1, 0.4, 0.1) },
    { g: ROCK, m: 0, matrix: at(1.1, 0.22, 0.6, 1.6, 0.6, 1.4, 0, 1.2, 0.15) },
    { g: ROCK, m: 0, matrix: at(-1.0, 0.2, -0.5, 1.4, 0.5, 1.2, 0.1, 2.1, 0) },
    ...spikes(4, { r: 0.55, len: 1.4, thick: 0.22, y: 0.5, lean: 0.4, seed: 19 }),
    { g: BOX, m: 1, matrix: at(0.4, 0.75, -0.5, 0.18, 1.1, 0.7, 0.3, 0.6, 0.25) },
  ]),

  /** An ice field: a fractured sheet with pressure ridges shoved up through it. */
  ice_field: () => mergeGroups([
    { g: BOX, m: 0, matrix: at(0, 0.3, 0, 3.2, 0.6, 3.2) },
    { g: BOX, m: 0, matrix: at(-0.9, 0.55, 0.7, 1.6, 0.5, 1.4, 0, 0.3, 0.08) },
    { g: BOX, m: 1, matrix: at(0.5, 0.9, -0.2, 0.6, 1.2, 1.9, 0.1, 0.35, 0.3) },
    { g: BOX, m: 1, matrix: at(1.0, 0.7, 0.9, 0.5, 0.8, 1.1, -0.1, -0.4, -0.25) },
    { g: CONE, m: 1, matrix: at(-0.4, 0.85, -0.9, 0.4, 1.0, 0.4, 0.2, 0.2, -0.15) },
  ]),

  /** A spring: a low ring of wet stones with the water standing inside it. */
  water_source: () => mergeGroups([
    { g: RING, m: 0, matrix: at(0, 0.16, 0, 5.4, 5.4, 5.4, Math.PI / 2, 0, 0) },
    { g: ROCK, m: 0, matrix: at(2.2, 0.2, 0.8, 0.9, 0.6, 0.9, 0.2, 0.9, 0.1) },
    { g: ROCK, m: 0, matrix: at(-1.9, 0.18, -1.3, 0.8, 0.5, 0.8, 0, 2.2, 0.2) },
    { g: DISC, m: 1, matrix: at(0, 0.14, 0, 4.6, 0.16, 4.6) },
  ]),

  /** A fumarole: a crusted cone with a dark throat and two small side vents still smoking. */
  gas_vent: () => mergeGroups([
    { g: CONE, m: 0, matrix: at(0, 0.8, 0, 2.0, 1.6, 2.0) },
    { g: ROCK, m: 0, matrix: at(0.9, 0.25, 0.6, 0.8, 0.5, 0.8, 0.1, 1.1, 0.2) },
    { g: CYL, m: 1, matrix: at(0, 1.5, 0, 0.55, 0.4, 0.55) },
    { g: CYL, m: 1, matrix: at(0.75, 0.42, -0.5, 0.26, 0.3, 0.26, 0.25, 0, -0.2) },
    { g: CYL, m: 1, matrix: at(-0.6, 0.35, 0.55, 0.22, 0.26, 0.22, -0.2, 0, 0.2) },
  ]),

  /** The rare one. The host barely shows: it is mostly a cluster of floating-looking facets. */
  rare_seam: () => mergeGroups([
    { g: ROCK, m: 0, matrix: at(0, 0.28, 0, 1.9, 0.8, 1.8, 0.1, 0.6, 0.1) },
    { g: GEM, m: 1, matrix: at(0, 1.35, 0, 1.0, 1.9, 1.0, 0.1, 0.5, 0.08) },
    { g: GEM, m: 1, matrix: at(0.62, 0.8, 0.3, 0.6, 1.1, 0.6, 0.25, 1.0, 0.3) },
    { g: GEM, m: 1, matrix: at(-0.55, 0.7, -0.4, 0.5, 0.95, 0.5, -0.3, 1.8, -0.24) },
    { g: GEM, m: 1, matrix: at(0.15, 0.55, -0.7, 0.4, 0.7, 0.4, 0.4, 0.3, 0.2) },
  ]),

  /**
   * R17 — THREE KINDS THAT HAD NO SHAPE AT ALL.
   *
   * `wreck`, `camp_scrap` and `meteor_site` are node kinds in data/resources.json and none of them
   * had a row here or in `LOOKS`, so all three fell through `SHAPES[kind] || SHAPES.ore_outcrop`
   * and drew as an iron outcrop in the fallback brown. A crashed lander, an abandoned camp and a
   * meteor crater were three orange rocks.
   */
  wreck: () => mergeGroups([
    { g: BOX, m: 0, matrix: at(0, 0.6, 0, 2.6, 1.0, 1.6, 0.18, 0.5, 0.12) },
    { g: CYL, m: 0, matrix: at(1.3, 0.75, -0.4, 0.3, 2.2, 0.3, 0.2, 0, 1.2) },
    { g: BOX, m: 0, matrix: at(-1.2, 0.3, 0.7, 1.2, 0.2, 0.9, 0.05, 0.9, 0.3) },
    { g: BOX, m: 1, matrix: at(-0.3, 1.15, 0.2, 1.1, 0.16, 0.9, 0.3, 0.3, 0.2) },
    { g: BOX, m: 1, matrix: at(0.6, 1.0, 0.6, 0.7, 0.14, 0.6, -0.3, 0.8, 0.1) },
  ]),

  camp_scrap: () => mergeGroups([
    { g: RING, m: 0, matrix: at(0, 0.12, 0, 1.9, 1.9, 1.9, Math.PI / 2, 0, 0) },
    { g: CYL, m: 0, matrix: at(-1.2, 0.8, -0.6, 0.12, 2.0, 0.12, 0.3, 0, 0.35) },
    { g: CYL, m: 0, matrix: at(-0.7, 0.8, -1.1, 0.12, 2.0, 0.12, -0.35, 0, 0.3) },
    { g: BOX, m: 1, matrix: at(1.1, 0.3, 0.7, 0.8, 0.6, 0.8, 0, 0.5, 0) },
    { g: BOX, m: 1, matrix: at(0, 0.16, 0, 0.7, 0.3, 0.7, 0.2, 0.7, 0.15) },
  ]),

  meteor_site: () => mergeGroups([
    { g: RING, m: 0, matrix: at(0, 0.1, 0, 3.4, 3.4, 3.4, Math.PI / 2, 0, 0) },
    { g: DISC, m: 0, matrix: at(0, 0.06, 0, 3.0, 0.12, 3.0) },
    { g: ROCK, m: 0, matrix: at(0, 0.42, 0, 1.5, 1.1, 1.4, 0.2, 0.8, 0.1) },
    { g: BOX, m: 1, matrix: at(0, 0.62, 0, 1.4, 0.16, 0.2, 0.1, 0.4, 0.12) },
    { g: BOX, m: 1, matrix: at(0, 0.6, 0, 0.2, 0.16, 1.3, 0.1, 0.4, 0.12) },
    ...spikes(3, { r: 0.35, len: 0.7, thick: 0.15, y: 0.6, lean: 0.5, seed: 23 }),
  ]),
};

export const SHAPE_KINDS = Object.keys(SHAPES);

/**
 * Build one kind's geometry on its own, for the tests.
 *
 * A composite that does not merge is a seam that does not appear, and that is not a thing anybody
 * notices from a screenshot — so `tests/round17-combat.test.js` builds all seventeen and checks the
 * groups, with Three.js loaded through a resolver hook rather than a browser.
 */
export function buildShape(kind) {
  const make = SHAPES[kind];
  return make ? make() : null;
}

/**
 * What each kind is made of: the host rock, and the seam in it.
 *
 * `rock` is the HOST — the dull colour of the surrounding ground, which is the whole of "a mix of
 * regular rock texture and the ore texture". `color` is the seam. `glow` is emissive, and it is on
 * the seam group only, so the bright bit is a fifth of the surface and five times as noticeable.
 */
const LOOKS = {
  ore_outcrop: { rock: '#6b6357', color: '#c07a34', glow: '#8a4f12', rough: 0.85 },
  deep_vein: { rock: '#4b463e', color: '#b06a2c', glow: '#8a4a10', rough: 0.85 },
  boulder: { rock: '#6e6a66', color: '#a8a49c', glow: '#2a2a28', rough: 0.95 },
  quarry_face: { rock: '#7d786f', color: '#b6b0a2', glow: '#2e2c28', rough: 0.95 },
  clay_bank: { rock: '#7a6450', color: '#a9714a', glow: '#4a2c16', rough: 0.98 },
  sand_bar: { rock: '#b5a382', color: '#ddcfa8', glow: '#4a4230', rough: 1 },
  tree: { rock: '#4b3a28', color: '#c3a878', glow: '#3a2c18', rough: 0.95 },
  fibre_patch: { rock: '#5c6b3c', color: '#c8cf7a', glow: '#4a5420', rough: 1 },
  crystal_spire: { rock: '#63707a', color: '#8fd8f2', glow: '#2f7fa8', rough: 0.25 },
  obsidian_flow: { rock: '#3a3740', color: '#1b1920', glow: '#6a2a80', rough: 0.3 },
  ice_field: { rock: '#8fa6b0', color: '#cfeaf5', glow: '#3f7f9a', rough: 0.2 },
  water_source: { rock: '#6c6a64', color: '#4790bc', glow: '#1a4f68', rough: 0.15 },
  gas_vent: { rock: '#6a6f5a', color: '#a8d05a', glow: '#7aa030', rough: 0.75 },
  rare_seam: { rock: '#575062', color: '#cbb4ff', glow: '#7a4fd0', rough: 0.35 },
  wreck: { rock: '#5a5750', color: '#9a7a52', glow: '#5a3a14', rough: 0.85 },
  camp_scrap: { rock: '#5f5a50', color: '#9a8a68', glow: '#3a3020', rough: 0.9 },
  meteor_site: { rock: '#4a443e', color: '#d4703a', glow: '#b03a10', rough: 0.7 },
};
const FALLBACK = { rock: '#6b6357', color: '#c07a34', glow: '#8a4f12', rough: 0.85 };

/**
 * How hard the seam glows. The host never glows at all.
 *
 * The old code put 0.35 on the WHOLE rock; the same light off a fifth of the surface needs to be
 * stronger per unit area or a seam stops standing out at the range it is meant to be spotted from.
 */
const SEAM_EMISSIVE = 0.55;

const CAP = 220;         // per kind, in view. More than that and you cannot see the ground anyway.

export function createOreView(scene, { data = {} } = {}) {
  const root = new THREE.Group();
  root.name = 'farhold-ore';
  scene.add(root);

  /** kind -> InstancedMesh, built the first time that kind is actually seen. */
  const meshes = new Map();
  const dummy = new THREE.Object3D();
  let lastAt = null;

  function meshFor(kind) {
    let m = meshes.get(kind);
    if (m) return m;
    const geo = (SHAPES[kind] || SHAPES.ore_outcrop)();
    const look = LOOKS[kind] || FALLBACK;
    /**
     * TWO MATERIALS, ONE INSTANCED MESH. The geometry carries two groups, so Three.js draws the
     * whole instanced batch once per group: a hundred outcrops is two draw calls in total, not two
     * hundred, and the InstancedMesh discipline the rest of this file keeps is intact.
     */
    const hostMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(look.rock),
      roughness: 0.95,
      metalness: 0.02,
    });
    const seamMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(look.color),
      emissive: new THREE.Color(look.glow),
      emissiveIntensity: SEAM_EMISSIVE,
      roughness: look.rough,
      metalness: 0.08,
    });
    m = new THREE.InstancedMesh(geo, [hostMat, seamMat], CAP);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true;
    m.receiveShadow = true;
    m.count = 0;
    m.frustumCulled = false;
    meshes.set(kind, m);
    root.add(m);
    return m;
  }

  /**
   * THE HAUL ROUTES, DRAWN ON THE GROUND.
   *
   * A route used to be an entry in a panel and nothing else — the ore moved, and the player had no
   * way to see where it went or why a long one was slow. Now that js/haulpath.js walks a real path
   * round water and up banks, the path is worth showing: a route that goes twice as far as the crow
   * flies EXPLAINS ITSELF the moment you look at it.
   *
   * One mesh for all of them, rebuilt when the set changes. A few hundred flat markers.
   */
  const routeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#7fd4ff'), transparent: true, opacity: 0.5 });
  const routeGeo = new THREE.BoxGeometry(1, 0.06, 1);
  const routeMesh = new THREE.InstancedMesh(routeGeo, routeMat, 900);
  routeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  routeMesh.count = 0;
  routeMesh.frustumCulled = false;
  routeMesh.name = 'farhold-routes';
  root.add(routeMesh);
  let routeKey = '';

  return {
    root,
    routeMesh,

    /**
     * `routes` is `mining.overview()`: every row with a `route.points` gets a dotted track.
     *
     * The key is what the routes ARE, so walking about does not rebuild them and moving a crate
     * does. Markers are laid every 4 m along the path rather than one per path point, so the line
     * reads the same whatever the search grid happened to be.
     */
    drawRoutes(rows = [], { heightAt = null } = {}) {
      const key = rows.map(r => `${r.id}:${r.route?.metres ?? -1}:${r.route?.points?.length ?? 0}`).join('|');
      if (key === routeKey) return routeMesh.count;
      routeKey = key;

      let i = 0;
      for (const row of rows) {
        const pts = row.route?.points || [];
        for (let k = 0; k + 1 < pts.length && i < routeMesh.instanceMatrix.count; k++) {
          const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
          const len = Math.hypot(bx - ax, bz - az);
          const steps = Math.max(1, Math.round(len / 4));
          for (let t = 0; t < steps && i < routeMesh.instanceMatrix.count; t++) {
            const f = (t + 0.5) / steps;
            const x = ax + (bx - ax) * f, z = az + (bz - az) * f;
            dummy.position.set(x, (heightAt ? heightAt(x, z) : 0) + 0.08, z);
            dummy.rotation.set(0, Math.atan2(bx - ax, bz - az), 0);
            dummy.scale.set(0.5, 1, 1.8);
            dummy.updateMatrix();
            routeMesh.setMatrixAt(i, dummy.matrix);
            i++;
          }
        }
      }
      routeMesh.count = i;
      routeMesh.instanceMatrix.needsUpdate = true;
      return i;
    },

    /**
     * Put the seams in range on the ground.
     *
     * `heightAt` comes in rather than the terrain, so a seam sits on the EDITED ground: level a
     * patch under an outcrop and the outcrop comes down with it instead of floating.
     */
    update(nodes, x, z, { heightAt = null, radius = 260 } = {}) {
      // only redo the work when the player has actually gone somewhere
      if (lastAt && Math.hypot(lastAt.x - x, lastAt.z - z) < 12 && lastAt.n === nodes.length) return;
      lastAt = { x, z, n: nodes.length };

      const counts = new Map();
      for (const m of meshes.values()) m.count = 0;

      for (const n of nodes) {
        if (n.gone) continue;
        const away = Math.hypot(n.x - x, n.z - z);
        if (away > radius) continue;
        const kind = n.rare ? 'rare_seam' : n.kind;
        const m = meshFor(kind);
        const i = counts.get(kind) || 0;
        if (i >= CAP) continue;

        const y = heightAt ? heightAt(n.x, n.z) : 0;
        dummy.position.set(n.x, y, n.z);
        // a worked-out seam shrinks rather than vanishing, so you can see you have been here
        const wear = n.depleted ? 0.45 : 1;
        const s = (n.radius || 2) / 2;
        dummy.scale.set(s * wear, s * wear * (n.depleted ? 0.5 : 1), s * wear);
        // one stable rotation per seam, from its own coordinates, so it does not spin as you walk
        dummy.rotation.set(0, (n.x * 0.7 + n.z * 1.3) % (Math.PI * 2), 0);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        counts.set(kind, i + 1);
      }

      for (const [kind, n] of counts) {
        const m = meshes.get(kind);
        m.count = n;
        m.instanceMatrix.needsUpdate = true;
      }
    },
    /** Force the next update to do the work — after a terrain edit, or a save load. */
    invalidate() { lastAt = null; },
    setVisible(on) { root.visible = !!on; },
    stats() { return { kinds: meshes.size, drawn: [...meshes.values()].reduce((a, m) => a + m.count, 0) }; },
    dispose() {
      for (const m of meshes.values()) {
        m.geometry.dispose();
        // R17 — a kind is two materials now; disposing `m.material` straight would throw on an array
        for (const mat of [].concat(m.material)) mat.dispose();
      }
      meshes.clear();
      root.removeFromParent();
    },
  };
}
